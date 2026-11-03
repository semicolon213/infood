// Adapter: 개발·테스트용 고정 응답 (docs/06_ARCHITECTURE.md 7.1, AGENTS 규칙 14).
// 고정 응답도 같은 스키마로 검증해서, 형식이 틀린 fixture는 바로 드러나게 한다.
import type { AiClient, AiRequest, AiTask } from "../client";
import { AiError } from "../errors";
import recommend from "../__fixtures__/recommend.json";
import storage from "../__fixtures__/storage.json";

const FIXTURES: Partial<Record<AiTask, unknown>> = { recommend, storage };

export class MockAdapter implements AiClient {
  constructor(private readonly options: { fail?: boolean } = {}) {}

  async generate<T>(req: AiRequest<T>): Promise<T> {
    if (this.options.fail) {
      throw new AiError("AI_FAILED", "AI 장애 모의 (AI_MOCK=fail)");
    }
    const fixture = FIXTURES[req.task];
    if (fixture === undefined) {
      throw new AiError("AI_FAILED", `고정 응답이 없어요: ${req.task}`);
    }
    const parsed = req.schema.safeParse(structuredClone(fixture));
    if (!parsed.success) {
      throw new AiError("AI_INVALID_OUTPUT", `고정 응답이 스키마에 맞지 않아요: ${req.task}`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }
}
