// 서버 액션·Route Handler 공통 결과 형식 (docs/08_API_SPEC.md 1.1·1.2)

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NO_STORE"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STOCK_CONFLICT"
  | "AI_FAILED"
  | "AI_INVALID_OUTPUT"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ActionError = {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NO_STORE: 409,
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STOCK_CONFLICT: 409,
  AI_FAILED: 502,
  AI_INVALID_OUTPUT: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

// Zod 검증 실패 → VALIDATION. fields 키는 입력 경로 ("items.0.qty", 08_API_SPEC 1.1)
export function validationFail<T = never>(
  error: { issues: { path: PropertyKey[]; message: string }[] },
  message = "입력값을 다시 확인해 주세요",
): ActionResult<T> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    fields[key] ??= issue.message;
  }
  return fail("VALIDATION", message, fields);
}

export function fail<T = never>(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error: { code, message, ...(fields ? { fields } : {}) } };
}

// RPC가 raise exception으로 던진 메시지 → 에러 코드 (06_ARCHITECTURE 12장). 그 밖의 DB 오류는 INTERNAL
const RPC_CODES: readonly ErrorCode[] = ["FORBIDDEN", "VALIDATION", "NOT_FOUND", "CONFLICT", "STOCK_CONFLICT", "RATE_LIMITED"];

export function rpcErrorCode(error: { message: string }): ErrorCode {
  return RPC_CODES.find((code) => code === error.message) ?? "INTERNAL";
}

// RPC 오류 → ActionResult. 액션이 문구를 준 코드만 그대로 돌려주고, 나머지는 INTERNAL + fallback
export function rpcFail<T = never>(
  error: { message: string },
  messages: Partial<Record<ErrorCode, string>>,
  fallback: string,
): ActionResult<T> {
  const code = rpcErrorCode(error);
  const message = messages[code];
  return message ? fail(code, message) : fail("INTERNAL", fallback);
}
