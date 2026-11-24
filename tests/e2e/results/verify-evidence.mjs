import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { cliArgs, defaultRoot, isMain, sha256, sha256Text } from "./common.mjs";
import { collect } from "./collect.mjs";
import { applyReviews, countsByLevel, parsePlan } from "./build-report.mjs";

export async function verify({ root, runnerDir, planDir, reviewsPath }) {
  const raw = await readFile(path.join(runnerDir, "vitest.json"), "utf8");
  const runner = JSON.parse(await readFile(path.join(runnerDir, "results.json"), "utf8"));
  const actualRunner = collect(JSON.parse(raw), runner.runnerRoot);
  if ((runner.inputHashEncoding === "utf8-lf" ? sha256Text(raw) : sha256(raw)) !== runner.inputSha256 || JSON.stringify(actualRunner) !== JSON.stringify({ total: runner.total, counts: runner.counts, rows: runner.rows })) throw new Error("러너 원본·집계 불일치");
  const plan = JSON.parse(await readFile(path.join(planDir, "plan-results.json"), "utf8"));
  const text = await readFile(path.join(root, "docs/10_TEST_PLAN.md"), "utf8");
  const reviews = await readFile(reviewsPath, "utf8");
  const rebuilt = await applyReviews(parsePlan(text), runner, JSON.parse(reviews), root);
  const textHash = plan.textHashEncoding === "utf8-lf" ? sha256Text : sha256;
  if (plan.planSha256 !== textHash(text) || plan.reviewSha256 !== textHash(reviews) || plan.runnerInputHash !== runner.inputSha256 || plan.sourceCommit !== runner.sourceCommit || JSON.stringify(plan.rows) !== JSON.stringify(rebuilt) || plan.total !== rebuilt.length || JSON.stringify(plan.levels) !== JSON.stringify(countsByLevel(rebuilt))) throw new Error("계획·대조 기록·결과 불일치");
  return { verifiedAt: new Date().toISOString(), checks: { originalRunner: true, inputHash: true, planDefinitions: true, reviewEvidence: true, recomputedCounts: true }, counts: { runner: runner.total, plan: rebuilt.length }, sourceCommit: runner.sourceCommit };
}
async function main() {
  const { values } = parseArgs({ args: cliArgs(), options: { root: { type: "string" }, runner: { type: "string" }, plan: { type: "string" }, reviews: { type: "string" }, output: { type: "string" }, help: { type: "boolean" } } });
  if (values.help || !values.runner || !values.plan) { console.log("pnpm test:evidence --runner RUNNER_DIRECTORY --plan PLAN_DIRECTORY [--root SOURCE_ROOT] [--reviews REVIEW_LEDGER_JSON] [--output NEW_JSON]\n기대 합계를 하드코딩하지 않고 계획 정의·원본 러너·assertion 대조 기록에서 재계산합니다."); return; }
  const root = path.resolve(values.root ?? defaultRoot);
  const result = await verify({ root, runnerDir: path.resolve(values.runner), planDir: path.resolve(values.plan), reviewsPath: path.resolve(values.reviews ?? path.join(root, "tests/e2e/results/reviews.json")) });
  if (values.output) await writeFile(path.resolve(values.output), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify(result));
}
if (isMain(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
