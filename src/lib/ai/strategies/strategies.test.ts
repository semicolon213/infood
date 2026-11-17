import { describe, expect, it } from "vitest";
import { CostFirst, ExpiryFirst, getStrategy, PopularityFirst } from "./index";
import type { RecommendSnapshot } from "./types";

// Strategy: 추천 기준 (docs/06_ARCHITECTURE.md 7.2, docs/10_TEST_PLAN.md UT-AI-11~13)
const TODAY = "2026-11-10";
const lot = (remaining: number, expiresAt: string | null, unitPrice: number | null = null, receivedAt = "2026-11-01") => ({ remaining, expiresAt, unitPrice, receivedAt });

const snapshot: RecommendSnapshot = {
  ingredients: [
    { id: "onion", name: "양파", unit: "g", lots: [lot(3000, "2026-11-20", 1.5)] },
    { id: "tofu", name: "두부", unit: "ea", lots: [lot(10, "2026-11-11", 900)] },
    { id: "milk", name: "우유", unit: "ml", lots: [lot(1000, "2026-11-09", 3), lot(500, "2026-11-13", 3)] }, // 경과 묶음 + D-3
    { id: "salt", name: "소금", unit: "g", lots: [lot(500, null, 2)] }, // 기한 없음
    { id: "egg", name: "계란", unit: "ea", lots: [lot(30, "2026-11-05", 300)] }, // 경과 묶음만 → 후보 아님
  ],
  menus: [
    { id: "m-soup", name: "된장찌개", price: 9000, recipe: [{ ingredientId: "tofu", qty: 1 }, { ingredientId: "onion", qty: 50 }] },
    { id: "m-latte", name: "라떼", price: 5000, recipe: [{ ingredientId: "milk", qty: 200 }] },
  ],
  sales7d: [{ menuId: "m-soup", qty: 10 }, { menuId: "m-latte", qty: 40 }],
};

describe("RecommendStrategy (UT-AI-11~13)", () => {
  it("UT-AI-11: ExpiryFirst — 남은 일수 오름차순, 경과 묶음 제외, 기한 없음은 마지막", () => {
    const ranked = ExpiryFirst.rankIngredients(snapshot, TODAY);
    expect(ranked.map((r) => [r.name, r.reason])).toEqual([
      ["두부", "D-1"],
      ["우유", "D-3"], // 경과 묶음(11/09)은 기한 계산에서 빠짐
      ["양파", "D-10"],
      ["소금", "기한 없음"],
    ]);
    expect(ranked.find((r) => r.name === "우유")!.availableQty).toBe(500);
    expect(ranked.some((r) => r.name === "계란")).toBe(false); // 사용 가능 재고 0
  });

  it("UT-AI-12: CostFirst — 양파 3kg×1.5원/g, 두부 10모×900원 → 두부(9,000원) → 양파(4,500원)", () => {
    const ranked = CostFirst.rankIngredients(snapshot, TODAY);
    expect(ranked.map((r) => r.name).slice(0, 2)).toEqual(["두부", "양파"]);
    expect(ranked[0].reason).toBe("재고 금액 9,000원");
    expect(ranked[1].reason).toBe("재고 금액 4,500원");
    // 우유는 사용 가능 묶음(500ml × 3원)만 센다
    expect(ranked.find((r) => r.name === "우유")!.reason).toBe("재고 금액 1,500원");
  });

  it("UT-AI-13: PopularityFirst — 최근 7일 판매량 × 소요량이 큰 재료가 앞", () => {
    const ranked = PopularityFirst.rankIngredients(snapshot, TODAY);
    // 우유 40잔×200 = 8000ml, 양파 10×50 = 500g, 두부 10×1 = 10개, 소금 0
    expect(ranked.map((r) => [r.name, r.reason])).toEqual([
      ["우유", "주간 사용 8L"],
      ["양파", "주간 사용 500g"],
      ["두부", "주간 사용 10개"],
      ["소금", "주간 사용 0g"],
    ]);
  });

  it("UT-AI-11~13 보조: getStrategy: 기본은 유통기한 우선, 기준마다 다른 전략과 안내 문구", () => {
    expect(getStrategy()).toBe(ExpiryFirst);
    expect(getStrategy("cost")).toBe(CostFirst);
    expect(getStrategy("popularity")).toBe(PopularityFirst);
    const guides = new Set([ExpiryFirst, CostFirst, PopularityFirst].map((s) => s.promptGuide()));
    expect(guides.size).toBe(3);
  });

  it("UT-AI-14 보조: 전략은 순수 함수 — 같은 입력이면 같은 결과, 스냅샷을 바꾸지 않는다", () => {
    const before = JSON.stringify(snapshot);
    expect(ExpiryFirst.rankIngredients(snapshot, TODAY)).toEqual(ExpiryFirst.rankIngredients(snapshot, TODAY));
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
