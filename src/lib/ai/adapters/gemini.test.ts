import { APICallError, NoObjectGeneratedError } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AiRequest } from "../client";
import { AiError } from "../errors";
import { Recommendation } from "../schemas";
import { GeminiAdapter } from "./gemini";
import type { StructuredCall } from "./structured";

// 재시도·오류 변환은 StructuredAdapter 공통부라 ClaudeAdapter와 같은 기대값을 Gemini로도 확인한다 (LSP, 06 18장)
const req: AiRequest<Recommendation> = {
  task: "recommend",
  schema: Recommendation,
  system: "test",
  messages: [{ role: "user", content: "추천해 주세요" }],
};

const valid: Recommendation = { pushMenus: [], newIdeas: [] };

function schemaError() {
  return new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    text: "{}",
    response: { id: "r", timestamp: new Date(0), modelId: "gemini-3.5-flash-lite" },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as never,
    finishReason: "stop",
  });
}

describe("GeminiAdapter", () => {
  it("추천은 gemini-3.5-flash-lite로, 타임아웃 신호를 넣어 호출한다", async () => {
    const call = vi.fn().mockResolvedValue(valid);
    await expect(new GeminiAdapter(call as StructuredCall).generate(req)).resolves.toEqual(valid);
    expect(call.mock.calls[0][0]).toMatchObject({ model: "gemini-3.5-flash-lite", system: "test" });
    expect(call.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("UT-AI-03: 스키마 불일치는 1회 재시도하고, 다시 실패하면 AI_INVALID_OUTPUT", async () => {
    const call = vi.fn().mockRejectedValue(schemaError());
    const error = await new GeminiAdapter(call as StructuredCall).generate(req).catch((e: unknown) => e);
    expect(call).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("UT-AI-10: 무료 등급 한도 초과(429)도 AI_FAILED로 바꿔 규칙 기반 대체로 넘어가게 한다", async () => {
    const quota = new APICallError({
      message: "Resource has been exhausted (e.g. check quota).",
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      requestBodyValues: {},
      statusCode: 429,
    });
    const call = vi.fn().mockRejectedValue(quota);
    const error = await new GeminiAdapter(call as StructuredCall).generate(req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(APICallError.isInstance(error)).toBe(false);
    expect(error).toMatchObject({ code: "AI_FAILED" });
  });
});
