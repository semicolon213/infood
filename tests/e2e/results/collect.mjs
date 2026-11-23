// 러너 통과와 계획 판정을 분리한다. 실행 위치가 다른 보고서는 루트를 명시해야 한다.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { cliArgs, defaultRoot, expandIds, isMain, levelOf, markdown, relativeSource, sha256Text } from "./common.mjs";

export function collect(report, runnerRoot) {
  const rows = report.testResults.flatMap((file) => file.assertionResults.map((result) => {
    if (typeof result.title !== "string") throw new Error("개별 테스트 제목이 없어요. describe를 ID 근거로 사용하지 않습니다");
    const fileName = relativeSource(file.name, runnerRoot);
    const status = result.status === "passed" ? "PASS" : result.status === "failed" ? "FAIL" : ["pending", "skipped", "todo"].includes(result.status) ? "SKIP" : "NOT RUN";
    return { file: fileName, title: result.title, fullName: result.fullName, ids: expandIds(result.title), level: levelOf(fileName), runnerStatus: status, durationMs: result.duration ?? null, messages: result.failureMessages ?? [] };
  }));
  if (rows.length !== report.numTotalTests) throw new Error("러너 합계와 개별 케이스 수가 달라요");
  const counts = Object.fromEntries(["PASS", "FAIL", "SKIP", "NOT RUN"].map((s) => [s, rows.filter((r) => r.runnerStatus === s).length]));
  return { total: rows.length, counts, rows };
}

async function main() {
  const { values } = parseArgs({ args: cliArgs(), options: { input: { type: "string" }, source: { type: "string" }, output: { type: "string" }, root: { type: "string" }, "runner-root": { type: "string" }, help: { type: "boolean" } } });
  if (values.help || !values.input || !values.source || !values.output) {
    console.log("pnpm test:results --input test-results/vitest.json --source FULL_COMMIT_SHA --output test-results/results-run [--root SOURCE_ROOT] [--runner-root ACTUAL_RUNNER_ROOT]\n개별 title만 ID 근거로 쓰며, 기존 출력 폴더는 덮어쓰지 않습니다."); return;
  }
  if (!/^[a-f0-9]{40}$/.test(values.source) || /^0+$/.test(values.source)) throw new Error("실제 전체 커밋 SHA를 지정해 주세요");
  const root = path.resolve(values.root ?? defaultRoot);
  const raw = await readFile(values.input, "utf8");
  const data = collect(JSON.parse(raw), values["runner-root"] ?? root);
  await Promise.all([...new Set(data.rows.map((r) => r.file))].map((file) => access(path.join(root, file))));
  const summary = { sourceCommit: values.source, generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, runnerRoot: values["runner-root"] ?? root, aiMock: "vitest.config.mts의 설정을 실행 로그와 별도 확인", ...data, inputHashEncoding: "utf8-lf", inputSha256: sha256Text(raw), limitations: ["러너 결과와 계획 판정은 다름", "개별 테스트 title의 축약·범위 ID만 확장; describe ID는 제외", "목·보조 케이스는 DB/RLS/전체 E2E 증거가 아님"] };
  const out = path.resolve(values.output);
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out, { recursive: false });
  await writeFile(path.join(out, "vitest.json"), raw);
  await writeFile(path.join(out, "results.json"), JSON.stringify(summary, null, 2));
  const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  await writeFile(path.join(out, "results.csv"), ["file,title,ids,level,runnerStatus,durationMs", ...data.rows.map((r) => [r.file, r.title, r.ids.join(";"), r.level, r.runnerStatus, r.durationMs].map(csv).join(","))].join("\n") + "\n");
  await writeFile(path.join(out, "report.md"), `# 러너 실행 결과\n\n대상 ${values.source} · ${process.version} · ${process.platform}\n\n총 ${data.total}건: ${JSON.stringify(data.counts)}\n\n계획 PASS는 별도 assertion 대조 기록이 필요합니다.\n\n| 파일 | 개별 테스트 제목 | ID | 수준 | 러너 판정 |\n|---|---|---|---|---|\n${data.rows.map((r) => `| ${[r.file, r.title, r.ids.join(", "), r.level, r.runnerStatus].map(markdown).join(" | ")} |`).join("\n")}\n`);
  console.log(JSON.stringify({ total: data.total, counts: data.counts, output: out }));
}
if (isMain(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
