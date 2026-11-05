import { describe, expect, it } from "vitest";
import { formatOrderText, pendingOrderQty, suggestOrderQty } from "./order";

// docs/10_TEST_PLAN.md 3.5 권장 발주량·복사 텍스트 (BR-06, FR-ORD-04)
describe("lib/stock/order", () => {
  it("UT-ORD-01: 적정 10000, 사용 가능 3000, 미입고 0 → 7000", () => {
    expect(suggestOrderQty({ targetStock: 10000, minStock: 4000, available: 3000, pending: 0 })).toBe(7000);
  });

  it("UT-ORD-02: 적정 미입력, 최소 4000, 사용 가능 3000 → 적정 8000 → 5000", () => {
    expect(suggestOrderQty({ targetStock: null, minStock: 4000, available: 3000, pending: 0 })).toBe(5000);
  });

  it("UT-ORD-03: 적정 10000, 사용 가능 3000, 미입고 5000 → 2000", () => {
    const pending = pendingOrderQty([{ status: "ordered", qty: 5000 }]);
    expect(suggestOrderQty({ targetStock: 10000, minStock: 4000, available: 3000, pending })).toBe(2000);
  });

  it("UT-ORD-04: 적정 10000, 사용 가능 6000, 미입고 5000 → 0 이하라 제외(null)", () => {
    expect(suggestOrderQty({ targetStock: 10000, minStock: 4000, available: 6000, pending: 5000 })).toBeNull();
  });

  it("UT-ORD-05: ea, 적정 10, 사용 가능 7.4 → 3 (정수 올림)", () => {
    expect(suggestOrderQty({ targetStock: 10, minStock: 5, available: 7.4, pending: 0 })).toBe(3);
  });

  it("UT-ORD-06: g, 적정 5000, 사용 가능 2499.5 → 2501", () => {
    expect(suggestOrderQty({ targetStock: 5000, minStock: 1000, available: 2499.5, pending: 0 })).toBe(2501);
  });

  it("UT-ORD-07: draft·received 발주는 미입고에 넣지 않음", () => {
    expect(
      pendingOrderQty([
        { status: "draft", qty: 1000 },
        { status: "received", qty: 2000 },
        { status: "ordered", qty: 300 },
      ]),
    ).toBe(300);
  });

  it("UT-ORD-08: 양파 2500g, 계란 30ea, 우유 800ml", () => {
    expect(
      formatOrderText([
        { name: "양파", qty: 2500, unit: "g" },
        { name: "계란", qty: 30, unit: "ea" },
        { name: "우유", qty: 800, unit: "ml" },
      ]),
    ).toBe("양파 2.5kg\n계란 30개\n우유 800ml");
  });

  it("UT-ORD-09: 간장 1000ml → 1L, 소금 999g → 999g", () => {
    expect(
      formatOrderText([
        { name: "간장", qty: 1000, unit: "ml" },
        { name: "소금", qty: 999, unit: "g" },
      ]),
    ).toBe("간장 1L\n소금 999g");
  });

  it("UT-ORD-10: 빈 목록 → 빈 문자열", () => {
    expect(formatOrderText([])).toBe("");
  });

  // 계획서에 없는 보조 케이스
  it("올림 전 부동소수 오차로 발주가 생기지 않음 (10 − 7.1 − 2.9 = 4.4e-16)", () => {
    expect(suggestOrderQty({ targetStock: 10, minStock: 5, available: 7.1, pending: 2.9 })).toBeNull();
  });

  it("kg 표시는 소수 1자리 반올림 (1250g → 1.3kg)", () => {
    expect(formatOrderText([{ name: "당근", qty: 1250, unit: "g" }])).toBe("당근 1.3kg");
  });
});
