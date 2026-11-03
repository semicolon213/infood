// Adapter 패턴의 Target: 앱 코드가 아는 유일한 AI 호출 형태 (docs/06_ARCHITECTURE.md 7.1).
// 기능 코드(recommend() 등)는 이 파일만 의존하고 AI SDK를 직접 import하지 않는다 (AGENTS 규칙 11).
import "server-only";
import type { z } from "zod";
import { ClaudeAdapter } from "./adapters/claude";
import { MockAdapter } from "./adapters/mock";

export type AiTask = "recommend" | "storage" | "receipt";

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiRequest<T> = {
  task: AiTask;
  schema: z.ZodType<T>;
  system: string;
  messages: AiMessage[];
};

export interface AiClient {
  /** 스키마에 맞는 결과를 돌려준다. 실패하면 `AiError`(AI_FAILED / AI_INVALID_OUTPUT)를 던진다. */
  generate<T>(req: AiRequest<T>): Promise<T>;
}

// AI_MOCK=1 → 고정 응답, AI_MOCK=fail → 장애 모의(NFR-08), 그 외 → 실제 모델
export function getAiClient(): AiClient {
  const mode = process.env.AI_MOCK;
  if (mode === "1") return new MockAdapter();
  if (mode === "fail") return new MockAdapter({ fail: true });
  return new ClaudeAdapter();
}
