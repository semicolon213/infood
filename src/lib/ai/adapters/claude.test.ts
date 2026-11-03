import { APICallError, NoObjectGeneratedError } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { AiRequest } from "../client";
import { AiError } from "../errors";
import { Recommendation } from "../schemas";
import { ClaudeAdapter, type StructuredCall } from "./claude";

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
    response: { id: "r", timestamp: new Date(0), modelId: "claude-sonnet-5-5" },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    } as never,
    finishReason: "stop",
  });
}

describe("ClaudeAdapter", () => {
  it("추천은 claude-sonnet-5-5로, 45초 타임아웃 신호를 넣어 호출한다", async () => {
    const call = vi.fn().mockResolvedValue(valid);
    await expect(new ClaudeAdapter(call as StructuredCall).generate(req)).resolves.toEqual(valid);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0]).toMatchObject({ model: "claude-sonnet-5-5", system: "test" });
    expect(call.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("UT-AI-03: 스키마 불일치는 1회 재시도하고, 다시 실패하면 AI_INVALID_OUTPUT", async () => {
    const call = vi.fn().mockRejectedValue(schemaError());
    const error = await new ClaudeAdapter(call as StructuredCall).generate(req).catch((e: unknown) => e);
    expect(call).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "AI_INVALID_OUTPUT" });
  });

  it("UT-AI-03: 재시도에서 성공하면 그 결과를 돌려준다", async () => {
    const call = vi.fn().mockRejectedValueOnce(schemaError()).mockResolvedValueOnce(valid);
    await expect(new ClaudeAdapter(call as StructuredCall).generate(req)).resolves.toEqual(valid);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("UT-AI-10: SDK 오류는 AI_FAILED로 바꾸고 SDK 오류 타입을 밖으로 내보내지 않는다", async () => {
    const sdkError = new APICallError({
      message: "Overloaded",
      url: "https://api.anthropic.com/v1/messages",
      requestBodyValues: {},
      statusCode: 529,
    });
    const call = vi.fn().mockRejectedValue(sdkError);
    const error = await new ClaudeAdapter(call as StructuredCall).generate(req).catch((e: unknown) => e);
    expect(call).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(AiError);
    expect(APICallError.isInstance(error)).toBe(false);
    expect(error).toMatchObject({ code: "AI_FAILED" });
  });

  it("UT-AI-10: 타임아웃(AbortError)도 AI_FAILED", async () => {
    const call = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(new ClaudeAdapter(call as StructuredCall).generate(req)).rejects.toMatchObject({
      code: "AI_FAILED",
    });
  });
});
