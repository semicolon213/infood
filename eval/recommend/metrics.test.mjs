import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN, compareIngredients, nearestRank95, summarize } from "./metrics.mjs";

const oracle = [{ id: "onion", name: "양파", unit: "g", availableQty: 1000, soon: true }];
const ingredient = { ingredientId: "onion", name: "양파", unit: "g", qty: 100, availableQty: 1000, status: "have" };
const body = () => ({ pushMenus: [{ menuId: "menu", consumes: [{ ...ingredient }] }], newIdeas: [], fallback: false, droppedCount: 0, shortCount: 0, unregisteredCount: 0 });
const sample = (plan, outcome = "ai") => ({ ...plan, outcome, oracle, menus: [{ id: "menu" }], integrity: { status: "verified" }, durationMs: 100, raw: { pushMenus: [{ menuId: "menu" }], newIdeas: [] }, result: body() });

test("NFT-03 보조: 5시나리오×4회와 기준 10/5/5를 미리 고정한다", () => {
  assert.equal(PLAN.length, 20);
  assert.deepEqual(["expiry", "cost", "popularity"].map((basis) => PLAN.filter((p) => p.basis === basis).length), [10, 5, 5]);
});
test("NFT-03 보조: 20건의 독립 정답 일치와 분포를 함께 확인한다", () => {
  const result = summarize(PLAN.map((p) => sample(p)));
  assert.equal(result.nfr03, "PASS"); assert.equal(result.agreement, 1);
});
test("NFT-03 보조: 대체 20건을 AI 성공으로 세지 않는다", () => {
  const result = summarize(PLAN.map((p) => sample(p, "fallback")));
  assert.equal(result.nfr03, "BLOCKED"); assert.equal(result.agreement, null); assert.equal(result.fallbackRate, 1);
});
test("NFT-03 보조: 성공16·대체3·오류1은 표본 미달이다", () => {
  const result = summarize(PLAN.map((p, i) => sample(p, i < 16 ? "ai" : i < 19 ? "fallback" : "error")));
  assert.equal(result.nfr03, "BLOCKED"); assert.equal(result.ai, 16);
});
test("NFT-03 보조: 일부 표본에서도 불일치가 있으면 FAIL이다", () => {
  const s = sample(PLAN[0]); s.result.pushMenus[0].consumes[0].status = "short";
  assert.equal(summarize([s]).nfr03, "FAIL");
});
test("NFT-03 보조: 재료 언급이 없으면 100%로 계산하지 않는다", () => {
  const rows = PLAN.map((p) => ({ ...sample(p), raw: { pushMenus: [], newIdeas: [] }, result: { ...body(), pushMenus: [], newIdeas: [] } }));
  const result = summarize(rows);
  assert.equal(result.nfr03, "BLOCKED"); assert.equal(result.agreement, null); assert.equal(result.validRate, null); assert.equal(result.expiryUtilization, 0);
});
test("NFT-03 보조: 같은 시나리오만 반복한 20건은 분포 미달이다", () => {
  assert.equal(summarize(Array.from({ length: 20 }, () => sample(PLAN[0]))).nfr03, "BLOCKED");
});
test("NFT-03 보조: DB 수량·단위도 독립 대조한다", () => {
  const s = sample(PLAN[0]); s.result.pushMenus[0].consumes[0].availableQty = 1500;
  assert.equal(summarize([s]).nfr03, "FAIL");
});
test("NFT-03 보조: 미등록·부족·경계 수량을 대조한다", () => {
  const result = compareIngredients({ pushMenus: [], newIdeas: [{ ingredients: [{ ...ingredient, qty: 1000 }, { ...ingredient, qty: 1001, status: "short" }, { ingredientId: null, name: "바질", qty: 10, unit: null, availableQty: null, status: "unregistered" }] }] }, oracle);
  assert.equal(result.every((row) => row.match && row.fieldsMatch), true);
});

test("NFT-03 보조: 등록된 재료 이름을 미등록으로 돌려준 결함을 검출한다", () => {
  const s = sample(PLAN[0]);
  s.result.pushMenus[0].consumes[0] = { ...ingredient, ingredientId: null, unit: null, availableQty: null, status: "unregistered" };
  assert.equal(summarize([s]).nfr03, "FAIL");
});
test("NFT-06 보조: 오류·대체를 포함한 20개 지연의 P95는 19번째다", () => {
  assert.equal(nearestRank95(Array.from({ length: 20 }, (_, i) => 20 - i)), 19);
  assert.equal(nearestRank95([]), null);
});
test("FR-REC-04 보조: 유효율은 원시 출력과 실제 남은 항목으로 계산한다", () => {
  const s = sample(PLAN[0]); s.raw.pushMenus.push({});
  assert.equal(summarize([s]).validRate, 0.5);
});
test("NFT-03 보조: 실제 AI와 대체의 오류를 분리한다", () => {
  const rows = PLAN.map((p) => sample(p));
  rows[0].outcome = "fallback"; rows[0].result.pushMenus[0].consumes[0].status = "short"; rows[0].result.shortCount = 1;
  const result = summarize(rows);
  assert.equal(result.nfr03, "BLOCKED"); assert.equal(result.agreement, 1); assert.equal(result.fallbackMismatches.length, 1);
});

test("4.4 QA L-2: 상태 일치율과 필드 불일치 건수를 구분", () => {
  const s = sample(PLAN[0]); s.result.pushMenus[0].consumes[0].availableQty = 999;
  const r = summarize([s]); assert.equal(r.agreement, 1); assert.equal(r.fieldAgreement, 0); assert.equal(r.mismatches.length, 1); assert.equal(r.nfr03, "FAIL");
});
test("4.4 QA L-3: 서버 레시피와 AI 아이디어 재료를 분리", () => {
  const s = sample(PLAN[0]); s.raw.newIdeas = [{}]; s.result.newIdeas = [{ ingredients: [{ ...ingredient }] }];
  const r = summarize([s]); assert.equal(r.origins['server-recipe'].mentions, 1); assert.equal(r.origins['ai-idea'].mentions, 1);
});
test("4.4 QA L-5: 중복·추가 표본은 20건 성공이어도 PASS가 아님", () => {
  const rows = PLAN.map((p) => sample(p));
  assert.equal(summarize([...rows, sample(PLAN[0])]).nfr03, "BLOCKED");
  rows[1] = sample(PLAN[0]); assert.equal(summarize(rows).planComplete, false);
});
test("4.4 QA L-5: NaN 지연은 증거를 보존하고 P95만 산출 불가", () => {
  const rows = PLAN.map((p) => sample(p)); rows[0].durationMs = NaN;
  const r = summarize(rows); assert.equal(r.attempts, 20); assert.equal(r.p95Ms, null); assert.equal(r.timings.all.invalid.length, 1); assert.equal(r.timingVerdict, "BLOCKED");
});
test("4.4 QA L-5: 서버 집계 필드의 거짓 건수를 검출", () => {
  const s = sample(PLAN[0]); s.result.unregisteredCount = 3;
  const r = summarize([s]); assert.equal(r.counterMismatches[0].field, "unregisteredCount"); assert.equal(r.nfr03, "FAIL");
  const rows = PLAN.map((p) => sample(p)); delete rows[0].integrity;
  assert.equal(summarize(rows).nfr03, "BLOCKED");
});
test("4.4 QA M-3: 원래 expiry 분모를 유지하고 기회 없는 건수·상한·보조율 공개", () => {
  const rows = PLAN.map((p) => sample(p)); rows.filter((s) => s.scenario === "expired-only").forEach((s) => { s.oracle = [{ ...oracle[0], soon: false }]; });
  const r = summarize(rows); assert.equal(r.expirySamples, 10); assert.equal(r.expiryNoOpportunity, 2); assert.equal(r.expiryUtilization, 0.8); assert.equal(r.expiryEligibleUtilization, 1); assert.equal(r.expiryCeiling, 0.8);
});
