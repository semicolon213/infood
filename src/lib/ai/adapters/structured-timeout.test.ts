import { NoObjectGeneratedError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiRequest } from "../client";
import { recommend } from "../recommend";
import { Recommendation } from "../schemas";
import { ExpiryFirst } from "../strategies";
import type { RecommendSnapshot } from "../strategies/types";
import { ClaudeAdapter } from "./claude";
import { GeminiAdapter } from "./gemini";
import type { StructuredCall } from "./structured";

const req: AiRequest<Recommendation> = {
  task: "recommend", schema: Recommendation, system: "test",
  messages: [{ role: "user", content: "추천해 주세요" }],
};
const valid: Recommendation = { pushMenus: [], newIdeas: [] };

function schemaError() {
  return new NoObjectGeneratedError({
    message: "Response did not match schema", text: "{}",
    response: { id: "r", timestamp: new Date(0), modelId: "test" },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as never,
    finishReason: "stop",
  });
}

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(schemaError()), ms));
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

// 실제 대기·AI 호출 없이 deadline과 SDK의 AbortSignal 경로를 함께 검증한다.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-24T00:00:00Z"));
  // Node의 네이티브 AbortSignal.timeout 타이머는 가상 시계에 연결되지 않는다.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
    return controller.signal;
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([
  ["Gemini", GeminiAdapter],
  ["Claude", ClaudeAdapter],
] as const)("%s 전체 생성 시간 제한", (_, Adapter) => {
  it("UT-AI-03·10 보조: 40초 뒤 형식 오류가 나면 재시도는 남은 5초에 중단한다", async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => rejectAfter(40_000))
      .mockImplementationOnce(({ abortSignal }) => waitForAbort(abortSignal));
    let settled = false;
    const pending = new Adapter(call as StructuredCall).generate(req).catch((error: unknown) => error);
    void pending.then(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(40_000);
    expect(call).toHaveBeenCalledTimes(2);
    expect(vi.mocked(AbortSignal.timeout).mock.calls.map(([ms]) => ms)).toEqual([45_000, 5_000]);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ code: "AI_FAILED" });
    expect(call.mock.calls[1][0].abortSignal.aborted).toBe(true);
  });

  it("UT-AI-03 보조: 재시도가 남은 시간 안에 성공하면 정상 결과를 반환한다", async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => rejectAfter(40_000))
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(valid), 4_000)));
    const pending = new Adapter(call as StructuredCall).generate(req);
    await vi.advanceTimersByTimeAsync(44_000);
    expect(await pending).toEqual(valid);
    expect(call).toHaveBeenCalledTimes(2);
    expect(vi.mocked(AbortSignal.timeout).mock.calls.map(([ms]) => ms)).toEqual([45_000, 5_000]);
  });

  it("UT-AI-03·10 보조: 첫 시도가 전체 시간을 소진하면 두 번째 호출을 시작하지 않는다", async () => {
    const call = vi.fn().mockImplementationOnce(() => rejectAfter(45_000));
    const pending = new Adapter(call as StructuredCall).generate(req).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(await pending).toMatchObject({ code: "AI_FAILED" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("IT-REC-04·UT-AI-10 보조: 지연 후 시간 초과는 45초에 규칙 기반 대체로 이어진다", async () => {
    const snapshot: RecommendSnapshot = {
      ingredients: [{ id: "onion", name: "양파", unit: "g", lots: [{ remaining: 1000, expiresAt: "2026-11-25", unitPrice: 1, receivedAt: "2026-11-24" }] }],
      menus: [{ id: "soup", name: "양파수프", price: 5000, recipe: [{ ingredientId: "onion", qty: 100 }] }],
      sales7d: [],
    };
    const call = vi.fn()
      .mockImplementationOnce(() => rejectAfter(40_000))
      .mockImplementationOnce(({ abortSignal }) => waitForAbort(abortSignal));
    let result: unknown;
    void recommend({ snapshot, strategy: ExpiryFirst, today: "2026-11-24", ai: new Adapter(call as StructuredCall) })
      .then((value) => { result = value; }, (error: unknown) => { result = error; });
    await vi.advanceTimersByTimeAsync(45_000);
    expect(result).toMatchObject({ ok: true, body: { fallback: true, pushMenus: [{ menuId: "soup" }] } });
    expect(call).toHaveBeenCalledTimes(2);
  });
});
