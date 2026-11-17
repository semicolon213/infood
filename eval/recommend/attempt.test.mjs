import { test } from "node:test";
import assert from "node:assert/strict";
import { runAttempt, runAttempts } from "./attempt.mjs";

test("4.4 QA M-2: 모델 호출 직후 DB 조회가 실패해도 응답·지연을 먼저 보존", async () => {
  const writes = []; let reads = 0; let clock = 0;
  const result = await runAttempt({ request: { attempt: 1 }, oracle: [], menus: [],
    readState: async () => { if (++reads === 2) { assert.ok(writes.some((s) => s.phase === "responded" && s.durationMs === 10)); throw new TypeError("SECRET must not be recorded"); } return { remaining: 100 }; },
    invoke: async (record) => { await record.request({ task: "recommend" }); await record.raw({ pushMenus: [] }); return { ok: true, data: { fallback: false, pushMenus: [] } }; },
    save: async (s) => writes.push(structuredClone(s)), now: () => (clock += 10),
  });
  assert.equal(result.abort, "STATE_AFTER_FAILED"); assert.equal(result.sample.outcome, "ai");
  assert.deepEqual(result.sample.raw, { pushMenus: [] }); assert.equal(result.sample.integrity.status, "unknown");
  assert.equal(JSON.stringify(writes).includes("SECRET"), false);
  assert.equal(result.sample.exception.name, "TypeError");
});
test("4.4 QA M-2: AI 출력 후 저장 예외도 원시 출력과 예외 단계를 보존", async () => {
  const result = await runAttempt({ request: {}, oracle: [], menus: [], readState: async () => ({}), save: async () => {},
    invoke: async (record) => { await record.raw({ pushMenus: [] }); throw Object.assign(new Error("private body"), { code: "23505" }); },
  });
  assert.equal(result.sample.outcome, "error"); assert.equal(result.sample.aiGenerated, true);
  assert.equal(result.sample.exception.code, "23505"); assert.equal(result.sample.exception.stage, "create-recommendation");
});
test("4.4 QA M-2: 중단 시 요약·중단 표식을 남기고 다음 모델 호출은 하지 않음", async () => {
  let calls = 0; let finished;
  await runAttempts({ plan: [{}, {}], execute: async () => { calls++; return { sample: { outcome: "ai" }, abort: "STATE_AFTER_FAILED" }; }, finish: async (samples, abort) => { finished = { samples, abort }; } });
  assert.equal(calls, 1); assert.equal(finished.samples.length, 1); assert.equal(finished.abort.code, "STATE_AFTER_FAILED");
});
test("4.4 QA M-2: KST 변경과 시작 전 실패도 중단 이유를 보존", async () => {
  let finished;
  await runAttempts({ plan: [{}], execute: async () => { throw new Error("must not run"); }, isSameDay: () => false, finish: async (samples, abort) => { finished = { samples, abort }; } });
  assert.equal(finished.abort.code, "KST_DATE_CHANGED"); assert.equal(finished.samples.length, 0);
  const result = await runAttempt({ request: {}, oracle: [], readState: async () => { throw new Error("state failed"); }, invoke: async () => { throw new Error("must not run"); }, save: async () => {} });
  assert.equal(result.abort, "STATE_BEFORE_FAILED"); assert.equal(result.sample.phase, "not-invoked");
});
