import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// 공급자·DB 예외의 원문에는 요청·키가 섞일 수 있으므로 단계와 유형·코드만 남긴다.
export function diagnostic(error, stage) {
  return { stage, name: /^(?:[A-Za-z]+Error|Error)$/.test(error?.name ?? "") ? error.name : "Error", code: /^[A-Z0-9_]{2,40}$/.test(error?.code ?? "") ? error.code : null, message: "예외 원문은 민감 정보 보호를 위해 기록하지 않음" };
}

export async function runAttempt({ request, oracle, menus, readState, invoke, save, now = () => performance.now() }) {
  const sample = { ...request, oracle, menus, phase: "started", outcome: "incomplete", durationMs: null, request: null, raw: null, result: null, error: null, exception: null, aiGenerated: false, stockUnchanged: null, integrity: { status: "pending", before: null, after: null } };
  await save(sample);
  try { sample.integrity.before = hash(await readState()); }
  catch (error) {
    sample.phase = "not-invoked"; sample.exception = diagnostic(error, "state-before"); sample.integrity.status = "unknown";
    await save(sample); return { sample, abort: "STATE_BEFORE_FAILED" };
  }
  const started = now();
  const recorder = {
    async request(value) { sample.request = value; sample.phase = "model-requested"; await save(sample); },
    async raw(value) { sample.raw = value; sample.aiGenerated = true; sample.phase = "model-returned"; await save(sample); },
  };
  try {
    const result = await invoke(recorder);
    sample.outcome = result.ok ? result.data.fallback ? "fallback" : "ai" : "error";
    sample.result = result.ok ? result.data : null; sample.error = result.ok ? null : result.error.code;
  } catch (error) {
    sample.outcome = "error"; sample.error = "INTERNAL"; sample.exception = diagnostic(error, "create-recommendation");
  }
  sample.durationMs = now() - started; sample.phase = "responded";
  // 유료 호출 결과를 먼저 확정한다. 이후 상태 확인이 실패해도 이 표본은 남는다.
  await save(sample);
  try {
    sample.integrity.after = hash(await readState());
    sample.stockUnchanged = sample.integrity.before === sample.integrity.after;
    sample.integrity.status = sample.stockUnchanged ? "verified" : "changed"; sample.phase = "verified";
    await save(sample);
    return { sample, abort: sample.stockUnchanged ? null : "STOCK_CHANGED" };
  } catch (error) {
    sample.integrity.status = "unknown"; sample.exception = diagnostic(error, "state-after");
    await save(sample); return { sample, abort: "STATE_AFTER_FAILED" };
  }
}

// 중단 시에도 호출 완료 표본과 중단 이유를 finish에 넘긴다. 추가 표본을 보충하지 않는다.
export async function runAttempts({ plan, execute, finish, isSameDay = () => true }) {
  const samples = []; let abort = null;
  try {
    for (const [index, request] of plan.entries()) {
      if (!isSameDay()) { abort = { code: "KST_DATE_CHANGED", nextAttempt: index + 1 }; break; }
      const result = await execute({ ...request, attempt: index + 1 });
      samples.push(result.sample);
      if (result.abort) { abort = { code: result.abort, attempt: index + 1 }; break; }
    }
  } catch (error) { abort = { code: "EXECUTION_FAILED", diagnostic: diagnostic(error, "evaluation-loop"), completedAttempts: samples.length }; }
  finally { await finish(samples, abort); }
  return { samples, abort };
}
