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

export function fail<T = never>(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error: { code, message, ...(fields ? { fields } : {}) } };
}
