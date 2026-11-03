import { describe, expect, it } from "vitest";
import { validationFail } from "@/lib/result";
import { IngredientInput, ReceiveStockInput, RecordDailySalesInput, SaveOrderInput } from "./contracts";

// 계약 스키마의 검증 규칙 (08_API_SPEC). 서버 액션 stub·구현이 같은 스키마를 쓴다.
const ING = "00000000-0000-4000-8000-000000000101";

const fieldsOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => {
  const result = validationFail(r.error!);
  return result.ok ? {} : (result.error.fields ?? {});
};

describe("contracts", () => {
  it("재료: 적정 재고 < 최소 재고, 기한 추적인데 보관일수 없음 → 항목별 오류", () => {
    const r = IngredientInput.safeParse({ name: "양파", unit: "g", minStock: 10, targetStock: 5, storage: "room", trackExpiry: true });
    expect(r.success).toBe(false);
    expect(Object.keys(fieldsOf(r))).toEqual(expect.arrayContaining(["targetStock", "defaultShelfDays"]));
  });

  it("재료: 환산 단위에 기본 단위 이름(kg) 금지, 중복 금지", () => {
    const r = IngredientInput.safeParse({
      name: "양파", unit: "g", minStock: 0, storage: "room", trackExpiry: false,
      units: [{ unitName: "KG", factor: 1000 }, { unitName: "망", factor: 15000 }, { unitName: "망", factor: 10000 }],
    });
    expect(Object.keys(fieldsOf(r))).toEqual(expect.arrayContaining(["units.0.unitName", "units.2.unitName"]));
  });

  it("입고: 유통기한 < 입고일 → items.N.expiresAt (UC-04 6a)", () => {
    const r = ReceiveStockInput.safeParse({
      receivedOn: "2026-11-03",
      items: [{ ingredientId: ING, qty: 1, unit: "kg", expiresAt: "2026-11-02" }],
    });
    expect(fieldsOf(r)).toHaveProperty("items.0.expiresAt");
  });

  it("입고: 품목 0개 거부, 날짜 형식 검사", () => {
    expect(ReceiveStockInput.safeParse({ receivedOn: "2026-11-03", items: [] }).success).toBe(false);
    expect(ReceiveStockInput.safeParse({ receivedOn: "11/03", items: [{ ingredientId: ING, qty: 1, unit: "g" }] }).success).toBe(false);
  });

  it("판매 마감: 수량 합계 0 거부, 소수 수량 거부", () => {
    expect(RecordDailySalesInput.safeParse({ soldOn: "2026-11-03", sales: [{ menuId: ING, qty: 0 }] }).success).toBe(false);
    expect(RecordDailySalesInput.safeParse({ soldOn: "2026-11-03", sales: [{ menuId: ING, qty: 1.5 }] }).success).toBe(false);
  });

  it("발주: 같은 재료 두 줄 거부, qty 0 품목은 허용(저장 시 제외, UC-09 3a)", () => {
    const dup = SaveOrderInput.safeParse({ orderDate: "2026-11-03", items: [{ ingredientId: ING, qty: 1 }, { ingredientId: ING, qty: 2 }] });
    expect(fieldsOf(dup)).toHaveProperty("items.1.ingredientId");
    expect(SaveOrderInput.safeParse({ orderDate: "2026-11-03", items: [{ ingredientId: ING, qty: 0 }] }).success).toBe(true);
  });
});
