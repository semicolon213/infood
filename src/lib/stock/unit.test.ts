import { describe, expect, it } from "vitest";
import { round3, toBaseQty, unitPriceOf } from "./unit";

// docs/10_TEST_PLAN.md 3.3 단위 환산 (BR-03)
describe("lib/stock/unit", () => {
  it("UT-UNIT-01: 10 kg → 10000 g", () => {
    expect(toBaseQty(10, "kg", "g")).toEqual({ ok: true, value: 10000 });
  });

  it("UT-UNIT-02: 1.5 L → 1500 ml", () => {
    expect(toBaseQty(1.5, "L", "ml")).toEqual({ ok: true, value: 1500 });
  });

  it("UT-UNIT-03: 대파 2단, 환산 계수 1000 → 2000 g", () => {
    expect(toBaseQty(2, "단", "g", [{ unitName: "단", factor: 1000 }])).toEqual({ ok: true, value: 2000 });
  });

  it("UT-UNIT-04: 기본 단위 ea 재료에 kg 입력 → VALIDATION", () => {
    expect(toBaseQty(1, "kg", "ea")).toMatchObject({ ok: false, code: "VALIDATION", field: "unit" });
  });

  it("UT-UNIT-05: 10kg 15,000원 → g당 1.5원", () => {
    const qty = toBaseQty(10, "kg", "g");
    expect(qty.ok && unitPriceOf(15000, qty.value)).toBe(1.5);
  });

  it("UT-UNIT-06: 등록되지 않은 환산 단위(박스) → VALIDATION, 환산 계수 입력 요청", () => {
    expect(toBaseQty(3, "박스", "g", [{ unitName: "단", factor: 1000 }])).toEqual({
      ok: false,
      code: "VALIDATION",
      field: "unit",
      message: "환산 계수를 입력해 주세요",
    });
  });

  it("UT-UNIT-07: 1.2345 kg → 1234.5 g (소수 3자리 반올림)", () => {
    expect(toBaseQty(1.2345, "kg", "g")).toEqual({ ok: true, value: 1234.5 });
  });

  // 계획서에 없는 보조 케이스
  it("기본 단위 그대로 입력하면 계수 1", () => {
    expect(toBaseQty(30, "ea", "ea")).toEqual({ ok: true, value: 30 });
  });

  it("round3: 부동소수 오차 제거와 반올림 경계", () => {
    expect(round3(0.1 + 0.2)).toBe(0.3);
    expect(round3(1.0005)).toBe(1.001);
    expect(round3(2.0004)).toBe(2);
    expect(round3(1e-7)).toBe(0);
  });

  it("unitPriceOf: 총액 없음·수량 0이면 null, 소수 4자리", () => {
    expect(unitPriceOf(undefined, 100)).toBeNull();
    expect(unitPriceOf(1000, 0)).toBeNull();
    expect(unitPriceOf(10000, 3000)).toBe(3.3333);
  });
});
