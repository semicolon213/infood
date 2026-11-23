import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { cliArgs, defaultRoot, expandIds, isMain, markdown, sha256, sha256Text } from "./common.mjs";

export const statuses = ["PASS", "FAIL", "BLOCKED", "NOT RUN", "SKIP", "N/A"];
export function parsePlan(text) {
  const section = text.slice(text.indexOf("## 3."), text.indexOf("## 9."));
  const unitReq = { EXP: "FR-STK-02, BR-01", FEFO: "FR-USE-01~03, BR-02", UNIT: "BR-03", STAT: "FR-DASH-01~03, BR-05", ORD: "FR-ORD-01~04, BR-06", AI: "FR-REC-01~06, BR-04" };
  const rows = [];
  for (const line of section.split("\n")) {
    if (!/^\| (?:UT-[A-Z]+|IT-[A-Z]+|DB|E2E|UI-REG|NFT)-\d+ \|/.test(line)) continue;
    const c = line.split(/(?<!\\)\|/).slice(1, -1).map((x) => x.trim());
    const id = c[0]; let level, requirement, input, expected;
    if (id.startsWith("UT-")) { level = "단위"; requirement = unitReq[id.split("-")[1]]; input = c[1]; expected = c[2]; }
    else if (id.startsWith("DB-")) { level = "DB"; requirement = "NFR-02, NFR-07, NFR-09, DR-01~03"; input = c[2]; expected = c[3]; }
    else if (id.startsWith("IT-")) { level = "통합"; requirement = expandIds(c[4], "requirement").join(", "); input = `${c[1]}: ${c[2]}`; expected = c[3]; }
    else if (id.startsWith("E2E-")) { level = "전체 E2E"; requirement = c[3]; input = c[1]; expected = c[2]; }
    else if (id.startsWith("UI-REG-")) { level = "화면 회귀"; requirement = c[1]; input = c[2]; expected = c[3]; }
    else { level = "비기능"; requirement = c[1]; input = c[2]; expected = c[3]; }
    if (!requirement || !input || !expected) throw new Error(`계획 정의 열이 부족해요: ${id}`);
    rows.push({ id, level, requirement, input, expected, definitionHash: sha256(line.trim()) });
  }
  if (!rows.length || new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error("계획 정의가 없거나 ID가 중복돼요");
  return rows;
}

export function countsByLevel(rows) {
  const levels = {};
  for (const row of rows) {
    if (!statuses.includes(row.status)) throw new Error(`판정 오류: ${row.id}`);
    const counts = levels[row.level] ??= { total: 0, ...Object.fromEntries(statuses.map((s) => [s, 0])) };
    counts.total++; counts[row.status]++;
  }
  return levels;
}

export async function applyReviews(definitions, runner, reviews, root) {
  const files = new Map();
  const read = async (file) => {
    if (!file.startsWith("src/") || file.split("/").includes("..")) throw new Error("대조 근거는 src/ 내부 파일이어야 해요");
    if (!files.has(file)) files.set(file, await readFile(path.join(root, file), "utf8"));
    return files.get(file);
  };
  for (const id of Object.keys(reviews.entries)) if (!definitions.some((r) => r.id === id)) throw new Error(`계획에 없는 대조 기록: ${id}`);
  const rows = [];
  for (const definition of definitions) {
    const review = reviews.entries[definition.id];
    const evidenceRows = runner.rows.filter((r) => r.ids.includes(definition.id));
    if (!review) { rows.push({ ...definition, status: "NOT RUN", actual: "기대값·assertion 대조 기록 없음", runnerEvidence: evidenceRows.map((r) => ({ file: r.file, title: r.title, status: r.runnerStatus })) }); continue; }
    if (review.definitionHash !== definition.definitionHash) throw new Error(`계획 변경 후 대조 기록을 갱신해 주세요: ${definition.id}`);
    if (!review.actual || !review.reviewer || !statuses.includes(review.status)) throw new Error(`대조 기록이 불완전해요: ${definition.id}`);
    if (review.status === "PASS") {
      if (!review.evidence?.length || !review.assertionReview) throw new Error(`PASS에 assertion 대조가 없어요: ${definition.id}`);
      for (const proof of review.evidence) {
        const text = await read(proof.file);
        if ((proof.sourceHashEncoding === "utf8-lf" ? sha256Text(text) : sha256(text)) !== proof.sourceHash) throw new Error(`소스 변경 후 assertion 재검토 필요: ${definition.id}`);
        if (!proof.lines?.length || proof.lines.some((l) => text.split(/\r?\n/)[l.number - 1]?.trim() !== l.text)) throw new Error(`assertion 위치가 달라요: ${definition.id}`);
        if (!proof.lines.some((l) => /\bexpect\(/.test(l.text))) throw new Error(`assertion 근거가 없어요: ${definition.id}`);
        const hits = evidenceRows.filter((r) => r.file === proof.file && proof.titles.includes(r.title));
        if (!hits.length || hits.some((r) => r.runnerStatus !== "PASS") || proof.titles.some((t) => !hits.some((r) => r.title === t))) throw new Error(`대조한 테스트의 실행 통과 근거가 없어요: ${definition.id}`);
      }
    }
    rows.push({ ...definition, status: review.status, actual: review.actual, reviewer: review.reviewer, assertionReview: review.assertionReview ?? null, evidence: review.evidence ?? [], runnerEvidence: evidenceRows.map((r) => ({ file: r.file, title: r.title, status: r.runnerStatus })) });
  }
  return rows;
}

async function main() {
  const { values } = parseArgs({ args: cliArgs(), options: { root: { type: "string" }, runner: { type: "string" }, reviews: { type: "string" }, output: { type: "string" }, help: { type: "boolean" } } });
  if (values.help || !values.runner || !values.output) { console.log("pnpm test:plan --runner RESULTS_JSON --output NEW_DIRECTORY [--root SOURCE_ROOT] [--reviews REVIEW_LEDGER_JSON]\n대조 기록이 없는 케이스는 NOT RUN이며 러너 PASS만으로 계획 PASS를 부여하지 않습니다."); return; }
  const root = path.resolve(values.root ?? defaultRoot);
  const planText = await readFile(path.join(root, "docs/10_TEST_PLAN.md"), "utf8");
  const runner = JSON.parse(await readFile(values.runner, "utf8"));
  const reviewPath = path.resolve(values.reviews ?? path.join(root, "tests/e2e/results/reviews.json"));
  const reviewText = await readFile(reviewPath, "utf8");
  const rows = await applyReviews(parsePlan(planText), runner, JSON.parse(reviewText), root);
  const levels = countsByLevel(rows);
  const result = { sourceCommit: runner.sourceCommit, generatedAt: new Date().toISOString(), textHashEncoding: "utf8-lf", planSha256: sha256Text(planText), runnerInputHash: runner.inputSha256, reviewSha256: sha256Text(reviewText), total: rows.length, levels, rows };
  const out = path.resolve(values.output); await mkdir(path.dirname(out), { recursive: true }); await mkdir(out, { recursive: false });
  await writeFile(path.join(out, "plan-results.json"), JSON.stringify(result, null, 2));
  await writeFile(path.join(out, "runner-results.json"), JSON.stringify(runner, null, 2));
  await writeFile(path.join(out, "review-ledger.json"), reviewText);
  const relRunner = "runner-results.json";
  await writeFile(path.join(out, "plan-results.md"), `# 4.4 계획 ID별 결과표\n\n대상 ${runner.sourceCommit}. 계획 정의 ${rows.length}건 / 러너 ${runner.total}건. 확장 9장은 제외합니다. PASS는 파일 해시·assertion 위치·실행 통과를 묶은 작성자 대조 기록에 근거하며 지정 리뷰 승인을 뜻하지 않습니다. [러너 원본](${relRunner})\n\n| 테스트 ID | 요구사항 | 증거 수준 | 입력·초기 상태 | 기대 결과 | 실제 결과 | 판정 |\n|---|---|---|---|---|---|---|\n${rows.map((r) => `| ${[r.id, r.requirement, r.level, r.input, r.expected, r.actual, r.status].map(markdown).join(" | ")} |`).join("\n")}\n\n## 수준별 계획 케이스 수\n\n| 수준 | 전체 | ${statuses.join(" | ")} |\n|---|---:|${statuses.map(() => "---:").join("|")}|\n${Object.entries(levels).map(([level, n]) => `| ${[level, n.total, ...statuses.map((s) => n[s])].join(" | ")} |`).join("\n")}\n`);
  console.log(JSON.stringify({ total: rows.length, levels, output: out }));
}
if (isMain(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
