import { NoObjectGeneratedError } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StructuredAdapter, withImage, type ModelTable, type StructuredCall } from "./structured";

describe("withImage (명세서 인식 4.7)", () => {
  const req = { task: "receipt" as const, schema: z.object({}), system: "", messages: [{ role: "user" as const, content: "재료 목록" }] };
  it("이미지가 없으면 메시지를 그대로 쓴다", () => {
    expect(withImage(req)).toBe(req.messages);
  });
  it("이미지를 마지막 사용자 메시지에 붙인다", () => {
    expect(withImage({ ...req, image: { data: "AAA", mediaType: "image/jpeg" } })).toEqual([
      { role: "user", content: [{ type: "text", text: "재료 목록" }, { type: "image", image: "AAA", mediaType: "image/jpeg" }] },
    ]);
  });
});

describe("StructuredAdapter 시간 제한 (#85, NFR-08)", () => {
  const req = { task: "recommend" as const, schema: z.object({}), system: "", messages: [{ role: "user" as const, content: "추천" }] };
  const models = { recommend: "m", receipt: "m", storage: "m" } as unknown as ModelTable;
  const schemaError = () =>
    new NoObjectGeneratedError({ message: "no object", text: "{}", response: { id: "r", timestamp: new Date(0), modelId: "m" }, usage: {} as never, finishReason: "stop" });

  afterEach(() => vi.useRealTimers());

  // 시도마다 걸리는 시간을 흉내 내고, 각 시도에 준 타임아웃(ms)을 기록한다
  function run(durations: number[]) {
    vi.useFakeTimers({ toFake: ["Date"] });
    const timeouts: number[] = [];
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => (timeouts.push(ms), new AbortController().signal));
    const call = vi.fn(async () => {
      vi.setSystemTime(Date.now() + durations[call.mock.calls.length - 1]);
      throw schemaError();
    });
    const result = new StructuredAdapter(models, call as unknown as StructuredCall).generate(req).catch((e: unknown) => e);
    return result.finally(() => timeout.mockRestore()).then((error) => ({ error, calls: call.mock.calls.length, timeouts }));
  }

  it("UT-AI-03 보조(#85): 첫 시도가 30초 걸려 형식 오류 → 재시도에는 남은 15초만 준다 (합계 45초 안)", async () => {
    const { error, calls, timeouts } = await run([30_000, 10_000]);
    expect(calls).toBe(2);
    expect(timeouts).toEqual([45_000, 15_000]);
    expect(error).toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("UT-AI-03 보조(#85): 첫 시도가 42초 걸려 형식 오류 → 남은 3초로는 재시도하지 않고 바로 AI_INVALID_OUTPUT (규칙 기반 대체로)", async () => {
    const { error, calls, timeouts } = await run([42_000]);
    expect(calls).toBe(1);
    expect(timeouts).toEqual([45_000]);
    expect(error).toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });
});
