import { describe, expect, it } from "vitest";
import { costOf, costRate, latestUnitPrice, menuCost, nearestDaysLeft, stockValue, weeklyUsage } from "./cost";

// 원가·재고 금액 (AGENTS 규칙 2). 추천 전략·원가 계산이 쓴다 (UT-AI-06, 11~13)
const TODAY = "2026-11-10";
const lot = (remaining: number, expiresAt: string | null, unitPrice: number | null, receivedAt: string) => ({ remaining, expiresAt, unitPrice, receivedAt });

describe("lib/stock/cost", () => {
  it("UT-AI-06 보조: latestUnitPrice — 가장 최근 입고 묶음의 단가, 단가 없는 묶음은 건너뜀, 같은 입고일은 나중 묶음", () => {
    expect(latestUnitPrice([lot(1, null, 3, "2026-11-08"), lot(1, null, 4, "2026-11-08")])).toBe(4);
    expect(latestUnitPrice([lot(1, null, 1, "2026-11-01"), lot(1, null, 2, "2026-11-08"), lot(1, null, null, "2026-11-09")])).toBe(2);
    expect(latestUnitPrice([lot(1, null, null, "2026-11-01")])).toBeNull();
    expect(latestUnitPrice([])).toBeNull();
  });

  it("UT-AI-12 보조: stockValue — 사용 가능 묶음만, 단가 없으면 0원", () => {
    expect(stockValue([lot(3000, "2026-11-20", 1.5, "2026-11-01"), lot(100, "2026-11-09", 10, "2026-11-01"), lot(50, null, null, "2026-11-01")], TODAY)).toBe(4500);
  });

  it("UT-AI-06 보조: costOf — 단가를 모르는 재료는 빼고 원 단위 반올림", () => {
    expect(costOf([{ qty: 100, unitPrice: 2.345 }, { qty: 5, unitPrice: null }])).toBe(235);
  });

  it("UT-COST-01: 레시피 원가 — 두부 1모 900원 × 1 + 양파 100g × 1.5원/g = 1,050원", () => {
    expect(menuCost([{ qty: 1, unitPrice: 900 }, { qty: 100, unitPrice: 1.5 }])).toBe(1050);
    expect(menuCost([{ qty: 3, unitPrice: 0.3333 }])).toBe(1); // 원 단위 반올림
  });

  it("UT-COST-02: 판매가 7,000원, 원가 1,050원 → 원가율 15.0%", () => {
    expect(costRate(1050, 7000)).toBe(15);
    expect(costRate(1000, 3000)).toBe(33.3); // 소수 1자리 반올림
    expect(costRate(1050, 0)).toBeNull(); // 판매가 0원은 원가율 없음
    expect(costRate(null, 7000)).toBeNull();
  });

  it("UT-COST-03: 단가 없는 묶음만 있는 재료가 있으면 원가 '알 수 없음'(null), 0으로 계산하지 않음", () => {
    expect(menuCost([{ qty: 1, unitPrice: 900 }, { qty: 100, unitPrice: null }])).toBeNull();
    expect(menuCost([])).toBeNull(); // 레시피 없음
  });

  it("UT-AI-11 보조: nearestDaysLeft — 경과 묶음·기한 없는 묶음 제외, 오늘이 기한이면 0", () => {
    expect(nearestDaysLeft([lot(1, "2026-11-09", null, "x"), lot(1, "2026-11-10", null, "x"), lot(1, null, null, "x")], TODAY)).toBe(0);
    expect(nearestDaysLeft([lot(1, "2026-11-09", null, "x")], TODAY)).toBeNull();
  });

  it("UT-AI-13 보조: weeklyUsage — 판매량 × 1인분 소요량의 합", () => {
    const menus = [{ id: "a", recipe: [{ ingredientId: "x", qty: 50 }] }, { id: "b", recipe: [{ ingredientId: "x", qty: 0.25 }] }];
    expect(weeklyUsage("x", menus, [{ menuId: "a", qty: 3 }, { menuId: "b", qty: 3 }])).toBe(150.75);
    expect(weeklyUsage("y", menus, [{ menuId: "a", qty: 3 }])).toBe(0);
  });
});
