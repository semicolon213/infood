// lib/stock 공통 결과 타입. 도메인 계층은 DB·네트워크·시계에 의존하지 않는다 (06_ARCHITECTURE 3장).
// 실패는 예외 대신 값으로 돌려주고, 서버 액션이 ActionResult(VALIDATION)로 바꾼다.
// field는 품목 안의 필드 이름이다 ("unit"). 서버 액션이 "items.0.unit"처럼 경로를 붙인다.

export type CalcError = { ok: false; code: "VALIDATION"; field: string; message: string };
export type Calc<T> = { ok: true; value: T } | CalcError;

export function invalid(field: string, message: string): CalcError {
  return { ok: false, code: "VALIDATION", field, message };
}
