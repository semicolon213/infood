import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { cliArgs, defaultRoot, isMain, sha256 } from "./common.mjs";

export async function sourceHashes(root) {
  const files = [];
  const visit = async (relative) => {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (entry.name.toLowerCase().startsWith(".env") || ["node_modules", ".git", ".next"].includes(entry.name)) continue;
      const file = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`증거 대상의 연결 파일은 지원하지 않아요: ${file}`);
      if (entry.isDirectory()) await visit(file); else if (entry.isFile()) files.push(file);
    }
  };
  for (const dir of ["src", "eval/recommend", "tests/e2e/results", "supabase/migrations"]) await visit(dir);
  files.push("package.json", "pnpm-lock.yaml", "supabase/seed.sql", "tsconfig.json", "vitest.config.mts", "docs/10_TEST_PLAN.md");
  return Object.fromEntries(await Promise.all(files.sort().map(async (file) => [file, sha256(await readFile(path.join(root, file)))])));
}

function git(root, args) { return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
export async function sourceProvenance(root, claimedCommit, manifestPath) {
  if (!/^[a-f0-9]{40}$/.test(claimedCommit) || /^0+$/.test(claimedCommit)) throw new Error("실제 전체 커밋 SHA가 필요해요");
  const fileHashes = await sourceHashes(root);
  let gitRoot;
  try { gitRoot = git(root, ["rev-parse", "--show-toplevel"]); } catch { /* 소스 복사본은 명시적 manifest를 요구한다 */ }
  if (gitRoot && path.resolve(gitRoot).toLowerCase() === path.resolve(root).toLowerCase()) {
    const head = git(root, ["rev-parse", "HEAD"]);
    const commit = git(root, ["rev-parse", "--verify", `${claimedCommit}^{commit}`]);
    if (head !== claimedCommit || commit !== claimedCommit) throw new Error("--source-commit이 실제 HEAD와 달라요");
    const status = git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--", "src", "eval/recommend", "tests/e2e/results", "package.json", "pnpm-lock.yaml", "supabase", "docs/10_TEST_PLAN.md"]);
    return { sourceCommit: head, branch: git(root, ["branch", "--show-current"]), gitVerified: true, capturedAt: new Date().toISOString(), workingTree: status.split(/\r?\n/).filter(Boolean), fileHashes };
  }
  if (!manifestPath) throw new Error("Git 없는 실행 복사본은 원본에서 만든 --source-manifest가 필요해요");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.gitVerified || manifest.sourceCommit !== claimedCommit || JSON.stringify(manifest.fileHashes) !== JSON.stringify(fileHashes)) throw new Error("원본 manifest의 커밋·파일 해시와 실행 복사본이 달라요");
  return { ...manifest, gitVerified: false, copiedFromVerifiedGitManifest: true, verifiedCopyAt: new Date().toISOString(), manifestSha256: sha256(await readFile(manifestPath)), fileHashes };
}

async function main() {
  const { values } = parseArgs({ args: cliArgs(), options: { root: { type: "string" }, source: { type: "string" }, output: { type: "string" }, help: { type: "boolean" } } });
  if (values.help || !values.source || !values.output) { console.log("pnpm test:source --source ACTUAL_HEAD_SHA --output NEW_MANIFEST_JSON [--root SOURCE_ROOT]\n원본 Git HEAD·작업 상태와 앱/후처리/전략/평가 도구 해시를 기록합니다. .env*는 읽지 않습니다."); return; }
  const result = await sourceProvenance(path.resolve(values.root ?? defaultRoot), values.source);
  await writeFile(path.resolve(values.output), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ sourceCommit: result.sourceCommit, files: Object.keys(result.fileHashes).length, dirty: result.workingTree.length > 0 }));
}
if (isMain(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
