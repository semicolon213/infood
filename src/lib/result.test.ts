import { describe, expect, it } from "vitest";
import { rpcErrorCode, rpcFail } from "./result";

// RPC 예외 메시지 → 에러 코드 (06_ARCHITECTURE 12장)
describe("rpcErrorCode / rpcFail", () => {
  it("RPC가 던진 코드는 그대로, 그 밖의 DB 오류는 INTERNAL", () => {
    expect(rpcErrorCode({ message: "STOCK_CONFLICT" })).toBe("STOCK_CONFLICT");
    expect(rpcErrorCode({ message: "FORBIDDEN" })).toBe("FORBIDDEN");
    expect(rpcErrorCode({ message: 'new row violates check constraint "stock_lots_quantity_check"' })).toBe("INTERNAL");
    expect(rpcErrorCode({ message: "UNAUTHORIZED" })).toBe("INTERNAL"); // RPC가 던지지 않는 코드
  });

  it("문구를 준 코드만 살리고 나머지는 INTERNAL + fallback", () => {
    const messages = { NOT_FOUND: "재료를 찾지 못했어요", VALIDATION: "입력값을 다시 확인해 주세요" };
    expect(rpcFail({ message: "NOT_FOUND" }, messages, "저장하지 못했어요")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "재료를 찾지 못했어요" },
    });
    expect(rpcFail({ message: "STOCK_CONFLICT" }, messages, "저장하지 못했어요")).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "저장하지 못했어요" },
    });
    expect(rpcFail({ message: "connection reset" }, messages, "저장하지 못했어요")).toMatchObject({ error: { code: "INTERNAL" } });
  });
});
