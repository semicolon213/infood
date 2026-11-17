import { describe, expect, it } from "vitest";
import { planConsumption, type FefoLot } from "./fefo";

// docs/10_TEST_PLAN.md 3.2 FEFO 계획 (BR-02). 기준일은 인자로 고정한다.
// UT-FEFO-06(같은 날 재입력)은 확장 FR-USE-06 채택 시에만 (10_TEST_PLAN 1.2)
const ONION = "i-onion";
const TOFU = "i-tofu";

const lot = (id: string, expiresAt: string | null, remaining: number, receivedAt = "2026-10-28", ingredientId = ONION): FefoLot => ({
  id, ingredientId, remaining, expiresAt, receivedAt,
});

describe("lib/stock/fefo", () => {
  it("UT-FEFO-01: 기준일 10/31, A(11/01, 500g)·B(11/05, 500g), 필요 300g → A에서 300g", () => {
    const plan = planConsumption([{ ingredientId: ONION, qty: 300 }], [lot("b", "2026-11-05", 500), lot("a", "2026-11-01", 500)], "2026-10-31");
    expect(plan).toEqual({ items: [{ ingredientId: ONION, lotId: "a", qty: 300 }], shortages: [] });
  });

  it("UT-FEFO-02: 같은 조건, 필요 700g → A 500g + B 200g", () => {
    const plan = planConsumption([{ ingredientId: ONION, qty: 700 }], [lot("b", "2026-11-05", 500), lot("a", "2026-11-01", 500)], "2026-10-31");
    expect(plan.items).toEqual([
      { ingredientId: ONION, lotId: "a", qty: 500 },
      { ingredientId: ONION, lotId: "b", qty: 200 },
    ]);
    expect(plan.shortages).toEqual([]);
  });

  it("UT-FEFO-03: 기한 같음, 입고일 다름 → 입고일 빠른 것부터", () => {
    const plan = planConsumption(
      [{ ingredientId: ONION, qty: 300 }],
      [lot("a-late", "2026-11-05", 500, "2026-11-02"), lot("b-early", "2026-11-05", 500, "2026-10-30")],
      "2026-11-03",
    );
    expect(plan.items).toEqual([{ ingredientId: ONION, lotId: "b-early", qty: 300 }]);
  });

  it("UT-FEFO-04: 기한 null 묶음은 마지막", () => {
    const plan = planConsumption(
      [{ ingredientId: ONION, qty: 600 }],
      [lot("a-null", null, 500, "2026-10-01"), lot("b-dated", "2026-12-31", 500, "2026-11-01")],
      "2026-11-03",
    );
    // b-dated 500g을 먼저 다 쓰고 null 묶음에서 100g
    expect(plan.items).toEqual([
      { ingredientId: ONION, lotId: "a-null", qty: 100 },
      { ingredientId: ONION, lotId: "b-dated", qty: 500 },
    ]);
  });

  it("UT-FEFO-05: 사용 가능 총잔량 800g, 필요 1000g → 800g 차감 + 부족 200g", () => {
    const plan = planConsumption([{ ingredientId: ONION, qty: 1000 }], [lot("a", "2026-11-04", 500), lot("b", "2026-11-06", 300)], "2026-11-03");
    expect(plan.items.reduce((s, i) => s + i.qty, 0)).toBe(800);
    expect(plan.shortages).toEqual([{ ingredientId: ONION, requiredQty: 1000, shortQty: 200 }]);
  });

  it("UT-FEFO-07: 여러 재료 동시 → 재료별로 독립 계획, 결과는 lot_id 오름차순", () => {
    const plan = planConsumption(
      [{ ingredientId: TOFU, qty: 2 }, { ingredientId: ONION, qty: 300 }],
      [lot("z-onion", "2026-11-04", 500), lot("m-tofu", "2026-11-05", 1, "2026-11-01", TOFU), lot("c-tofu", "2026-11-06", 3, "2026-11-01", TOFU)],
      "2026-11-03",
    );
    expect(plan.items).toEqual([
      { ingredientId: TOFU, lotId: "c-tofu", qty: 1 },
      { ingredientId: TOFU, lotId: "m-tofu", qty: 1 },
      { ingredientId: ONION, lotId: "z-onion", qty: 300 },
    ]);
    expect(plan.shortages).toEqual([]);
  });

  it("UT-FEFO-08: 소수 수량 (0.1 + 0.2) → 부동소수 오차 없음", () => {
    const plan = planConsumption(
      [{ ingredientId: ONION, qty: 0.1 }, { ingredientId: ONION, qty: 0.2 }],
      [lot("a", "2026-11-04", 0.1), lot("b", "2026-11-05", 1)],
      "2026-11-03",
    );
    expect(plan.items).toEqual([
      { ingredientId: ONION, lotId: "a", qty: 0.1 },
      { ingredientId: ONION, lotId: "b", qty: 0.2 },
    ]);
    expect(plan.shortages).toEqual([]);
  });

  it("UT-FEFO-09: 기준일 11/03, A(11/02 경과)·B(11/05), 필요 300g → A 제외, B에서 300g", () => {
    const plan = planConsumption([{ ingredientId: ONION, qty: 300 }], [lot("a", "2026-11-02", 500), lot("b", "2026-11-05", 500)], "2026-11-03");
    expect(plan).toEqual({ items: [{ ingredientId: ONION, lotId: "b", qty: 300 }], shortages: [] });
  });

  it("UT-FEFO-10: 기준일 11/03, 경과 묶음 A(11/02)만 있음, 필요 300g → 차감 없음 + 부족 300g", () => {
    const plan = planConsumption([{ ingredientId: ONION, qty: 300 }], [lot("a", "2026-11-02", 500)], "2026-11-03");
    expect(plan).toEqual({ items: [], shortages: [{ ingredientId: ONION, requiredQty: 300, shortQty: 300 }] });
  });

  it("UT-FEFO-11: 기한이 기준일과 같은 묶음(11/03) → 차감 대상에 포함", () => {
    const plan = planConsumption([{ ingredientId: ONION, qty: 300 }], [lot("a", "2026-11-03", 500)], "2026-11-03");
    expect(plan.items).toEqual([{ ingredientId: ONION, lotId: "a", qty: 300 }]);
  });

  it("UT-FEFO 보조: 잔량 0 묶음·없는 재료·수량 0 필요량", () => {
    const plan = planConsumption(
      [{ ingredientId: ONION, qty: 100 }, { ingredientId: TOFU, qty: 0 }, { ingredientId: "i-none", qty: 5 }],
      [lot("a", "2026-11-04", 0), lot("b", "2026-11-05", 50)],
      "2026-11-03",
    );
    expect(plan.items).toEqual([{ ingredientId: ONION, lotId: "b", qty: 50 }]);
    expect(plan.shortages).toEqual([
      { ingredientId: "i-none", requiredQty: 5, shortQty: 5 },
      { ingredientId: ONION, requiredQty: 100, shortQty: 50 },
    ]);
  });
});
