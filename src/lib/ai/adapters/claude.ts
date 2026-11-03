// Adapter: Vercel AI SDK(Adaptee)를 AiClient(Target)로 감싼다 (docs/06_ARCHITECTURE.md 7.1).
// 모델 ID는 이 파일에만 둔다 (AGENTS 규칙 11).
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import type { AiClient, AiRequest, AiTask } from "../client";
import { AiError } from "../errors";

const MODELS: Record<AiTask, string> = {
  recommend: "claude-sonnet-5-5",
  storage: "claude-haiku-5-5",
  receipt: "claude-sonnet-5-5",
};

const TIMEOUT_MS = 45_000;

// SDK를 실제로 부르는 부분. 테스트에서 바꿔 끼울 수 있게 생성자로 받는다.
export type StructuredCall = <T>(
  req: AiRequest<T> & { model: string; abortSignal: AbortSignal },
) => Promise<T>;

const sdkCall: StructuredCall = async (req) => {
  const { output } = await generateText({
    model: anthropic(req.model),
    output: Output.object({ schema: req.schema }),
    instructions: req.system,
    messages: req.messages,
    abortSignal: req.abortSignal,
    maxRetries: 1, // 네트워크 일시 오류만. 스키마 불일치 재시도는 아래에서 한다
  });
  return output;
};

function isInvalidOutput(error: unknown) {
  return NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
}

export class ClaudeAdapter implements AiClient {
  constructor(private readonly call: StructuredCall = sdkCall) {}

  async generate<T>(req: AiRequest<T>): Promise<T> {
    // 스키마에 맞지 않으면 1회 다시 요청한다 (06_ARCHITECTURE 7장 3단계, UT-AI-03)
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call({
          ...req,
          model: MODELS[req.task],
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        if (isInvalidOutput(error)) {
          if (attempt < 2) continue;
          throw new AiError("AI_INVALID_OUTPUT", "AI 응답이 형식에 맞지 않아요", { cause: error });
        }
        throw new AiError("AI_FAILED", "AI를 호출하지 못했어요", { cause: error });
      }
    }
  }
}
