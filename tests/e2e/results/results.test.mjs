import { test } from "node:test";
import assert from "node:assert/strict";
import { cliArgs, expandIds, relativeSource } from "./common.mjs";
import { collect } from "./collect.mjs";
import { applyReviews, countsByLevel, parsePlan } from "./build-report.mjs";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sha256Text } from "./common.mjs";
import { sourceHashes, sourceProvenance } from "./source.mjs";

test("4.4 QA M-1: npm·pnpm의 선행 -- 인자를 동일하게 처리", () => {
  assert.deepEqual(cliArgs(["--", "--help"]), ["--help"]);
  assert.deepEqual(cliArgs(["--help"]), ["--help"]);
});
test("4.4 QA M-4: 요구사항 축약 번호와 NFR·BR 접두사", () => {
  assert.deepEqual(expandIds("USE-02, 05, NFR-07, BR-04", "requirement"), ["FR-USE-02", "FR-USE-05", "NFR-07", "BR-04"]);
  assert.deepEqual(expandIds("REC-01~03, 06, 08", "requirement"), ["FR-REC-01", "FR-REC-02", "FR-REC-03", "FR-REC-06", "FR-REC-08"]);
});
test("4.4 QA M-5: 축약·범위를 확장하고 describe ID를 상속하지 않음", () => {
  assert.deepEqual(expandIds("IT-REC-04·07"), ["IT-REC-04", "IT-REC-07"]);
  assert.deepEqual(expandIds("UT-AI-11~13"), ["UT-AI-11", "UT-AI-12", "UT-AI-13"]);
  const data = collect({ numTotalTests: 1, testResults: [{ name: "/repo/src/lib/ai/strategies/strategies.test.ts", assertionResults: [{ title: "UT-AI-13: 인기", fullName: "describe (UT-AI-11~13) UT-AI-13: 인기", status: "passed" }] }] }, "/repo");
  assert.deepEqual(data.rows[0].ids, ["UT-AI-13"]);
});
test("4.4 QA L-4: 다른 실행 루트는 조용히 분류하지 않고 거절", () => {
  assert.throws(() => relativeSource("/other/src/actions/orders.test.ts", "/repo"), /루트 밖/);
  assert.equal(relativeSource("C:\\repo\\src\\actions\\orders.test.ts", "c:/repo"), "src/actions/orders.test.ts");
  assert.throws(() => relativeSource("src/../actions/a.ts", "/repo"), /분류/);
});

test("4.4 QA H-1: 러너 PASS만으로 계획 PASS를 부여하지 않으며 합계는 정의에서 계산", async () => {
  const definitions = parsePlan("## 3. 단위\n| UT-EXP-01 | 입력 | 기대 |\n| UT-EXP-02 | 입력2 | 기대2 |\n## 9. 확장");
  const rows = await applyReviews(definitions, { rows: [{ ids: ['UT-EXP-01'], runnerStatus: 'PASS' }] }, { entries: {} }, tmpdir());
  assert.equal(rows[0].status, "NOT RUN"); assert.equal(countsByLevel(rows)['단위'].total, definitions.length);
  await assert.rejects(() => applyReviews(definitions, { rows: [] }, { entries: { 'UT-EXP-01': { definitionHash: definitions[0].definitionHash, status: 'PASS', actual: '제목만 확인', reviewer: 'test' } } }, tmpdir()), /assertion/);
});
test("4.4 QA H-1: assertion 근거·소스 해시·해당 테스트 통과를 모두 결합", async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'infood-review-'));
  await mkdir(path.join(root, 'src/lib'), { recursive: true });
  const source = 'expect(result).toBe(3);\n'; const file = 'src/lib/example.test.ts';
  await writeFile(path.join(root, file), source);
  const definitions = [{ id: 'UT-EXP-01', definitionHash: 'plan', level: '단위' }];
  const runner = { rows: [{ ids: ['UT-EXP-01'], file, title: '직접 대조', runnerStatus: 'PASS' }] };
  const reviews = { entries: { 'UT-EXP-01': { definitionHash: 'plan', reviewer: 'test', status: 'PASS', actual: '결과3 확인', assertionReview: '입력과 기대값 대조', evidence: [{ file, sourceHashEncoding: 'utf8-lf', sourceHash: sha256Text(source), lines: [{ number: 1, text: source.trim() }], titles: ['직접 대조'] }] } } };
  assert.equal((await applyReviews(definitions, runner, reviews, root))[0].status, 'PASS');
  await writeFile(path.join(root, file), source.replace(/\n/g, '\r\n'));
  assert.equal((await applyReviews(definitions, runner, reviews, root))[0].status, 'PASS');
  await writeFile(path.join(root, file), 'expect(result).toBe(4);\n');
  await assert.rejects(() => applyReviews(definitions, runner, reviews, root), /소스 변경/);
  reviews.entries['UT-EXP-01'].definitionHash = 'old';
  await assert.rejects(() => applyReviews(definitions, runner, reviews, root), /계획 변경/);
});
test("4.4 QA L-1: 0 SHA·출처 없는 복사본을 거부하고 후처리·전략을 해시에 포함", async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'infood-source-'));
  for (const dir of ['src/lib/ai/strategies', 'eval/recommend', 'tests/e2e/results', 'supabase/migrations', 'docs']) await mkdir(path.join(root, dir), { recursive: true });
  for (const file of ['src/lib/ai/recommend.ts', 'src/lib/ai/strategies/index.ts', 'package.json', 'pnpm-lock.yaml', 'supabase/seed.sql', 'tsconfig.json', 'vitest.config.mts', 'docs/10_TEST_PLAN.md']) await writeFile(path.join(root, file), 'fixture');
  await assert.rejects(() => sourceProvenance(root, '0'.repeat(40)), /실제 전체/);
  await assert.rejects(() => sourceProvenance(root, 'a'.repeat(40)), /source-manifest/);
  const hashes = await sourceHashes(root);
  assert.ok(hashes['src/lib/ai/recommend.ts']); assert.ok(hashes['src/lib/ai/strategies/index.ts']);
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ gitVerified: true, sourceCommit: 'a'.repeat(40), fileHashes: hashes }));
  assert.equal((await sourceProvenance(root, 'a'.repeat(40), manifestPath)).copiedFromVerifiedGitManifest, true);
  await writeFile(path.join(root, 'src/lib/ai/recommend.ts'), 'changed');
  await assert.rejects(() => sourceProvenance(root, 'a'.repeat(40), manifestPath), /해시/);
  assert.equal(await readFile(path.join(root, 'src/lib/ai/recommend.ts'), 'utf8'), 'changed');
});
