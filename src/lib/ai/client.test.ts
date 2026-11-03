import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClaudeAdapter } from "./adapters/claude";
import { MockAdapter } from "./adapters/mock";
import { getAiClient, type AiRequest } from "./client";
import { AiError } from "./errors";
import { Recommendation } from "./schemas";

const recommendReq: AiRequest<Recommendation> = {
  task: "recommend",
  schema: Recommendation,
  system: "test",
  messages: [{ role: "user", content: "추천해 주세요" }],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAiClient", () => {
  it("UT-AI-09: AI_MOCK=1이면 MockAdapter, 같은 task면 같은 고정 응답", async () => {
    vi.stubEnv("AI_MOCK", "1");
    const client = getAiClient();
    expect(client).toBeInstanceOf(MockAdapter);

    const first = await client.generate(recommendReq);
    const second = await client.generate(recommendReq);
    expect(second).toEqual(first);
    expect(Recommendation.safeParse(first).success).toBe(true);
  });

  it("UT-AI-09: AI_MOCK=fail이면 AI_FAILED (NFR-08 장애 모의)", async () => {
    vi.stubEnv("AI_MOCK", "fail");
    await expect(getAiClient().generate(recommendReq)).rejects.toMatchObject({
      name: "AiError",
      code: "AI_FAILED",
    });
  });

  it("UT-AI-09: AI_MOCK이 없으면 ClaudeAdapter", () => {
    vi.stubEnv("AI_MOCK", "");
    expect(getAiClient()).toBeInstanceOf(ClaudeAdapter);
  });
});

describe("MockAdapter", () => {
  it("UT-AI-09: 고정 응답이 스키마에 맞지 않으면 AI_INVALID_OUTPUT", async () => {
    // 고정 응답에 없는 필수 필드를 요구하는 스키마
    const wrongSchema = Recommendation.extend({ extra: z.string() });
    await expect(
      new MockAdapter().generate({ ...recommendReq, schema: wrongSchema }),
    ).rejects.toBeInstanceOf(AiError);
  });
});
