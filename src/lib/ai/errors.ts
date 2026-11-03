// AI 계층 밖으로 나가는 유일한 오류 형태. SDK 오류 타입은 어댑터 안에서 이것으로 바꾼다 (06_ARCHITECTURE 7.1).
export type AiErrorCode = "AI_FAILED" | "AI_INVALID_OUTPUT";

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiError";
    this.code = code;
  }
}
