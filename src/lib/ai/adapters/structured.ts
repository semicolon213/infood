// Adapter 공통부: Vercel AI SDK(Adaptee)를 AiClient(Target)로 감싸는 규칙 (docs/06_ARCHITECTURE.md 7.1).
// 공급자별 어댑터(claude.ts, gemini.ts)는 모델 표와 SDK 호출만 다르고, 재시도·타임아웃·오류 변환은 여기서 한 번만 한다.
import "server-only";
import { generateText, type LanguageModel, type ModelMessage, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import type { AiClient, AiRequest, AiTask } from "../client";
import { AiError } from "../errors";

export type ModelTable = Record<AiTask, string>;

const TIMEOUT_MS = 45_000;

// SDK를 실제로 부르는 부분. 테스트에서 바꿔 끼울 수 있게 생성자로 받는다.
export type StructuredCall = <T>(
  req: AiRequest<T> & { model: string; abortSignal: AbortSignal },
) => Promise<T>;

/** 공급자의 모델 생성 함수(anthropic, google)로 실제 SDK 호출을 만든다 */
export function sdkCall(provider: (modelId: string) => LanguageModel): StructuredCall {
  return async (req) => {
    const { output } = await generateText({
      model: provider(req.model),
      output: Output.object({ schema: req.schema }),
      instructions: req.system,
      messages: withImage(req),
      abortSignal: req.abortSignal,
      maxRetries: 1, // 네트워크 일시 오류만. 스키마 불일치 재시도는 아래에서 한다
    });
    return output;
  };
}

// 이미지가 있으면 마지막 사용자 메시지를 텍스트 + 이미지 파트로 바꾼다
export function withImage(req: AiRequest<unknown>): ModelMessage[] {
  if (!req.image) return req.messages;
  const { data, mediaType } = req.image;
  return req.messages.map((m, i) =>
    i === req.messages.length - 1 && m.role === "user"
      ? { role: "user", content: [{ type: "text", text: m.content }, { type: "image", image: data, mediaType }] }
      : m,
  );
}

function isInvalidOutput(error: unknown) {
  return NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
}

export class StructuredAdapter implements AiClient {
  constructor(
    private readonly models: ModelTable,
    private readonly call: StructuredCall,
  ) {}

  async generate<T>(req: AiRequest<T>): Promise<T> {
    // 스키마에 맞지 않으면 1회 다시 요청한다 (06_ARCHITECTURE 7장 3단계, UT-AI-03)
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call({
          ...req,
          model: this.models[req.task],
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
