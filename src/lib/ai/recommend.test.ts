import { describe, expect, it } from "vitest";
import type { AiClient } from "./client";
import { AiError } from "./errors";
import { fallbackRecommendation, postprocess, recommend } from "./recommend";
import type { Recommendation } from "./schemas";
import { CostFirst, ExpiryFirst, PopularityFirst } from "./strategies";
import type { RecommendSnapshot } from "./strategies/types";

// 추천 공통 후처리·대체 (docs/10_TEST_PLAN.md UT-AI-04~06, 14~21, 08_API_SPEC 11장)
const TODAY = "2026-11-10";
const ID = {
  onion: "00000000-0000-4000-8000-000000000001",
  tofu: "00000000-0000-4000-8000-000000000002",
  egg: "00000000-0000-4000-8000-000000000003",
  milk: "00000000-0000-4000-8000-000000000004",
  soup: "00000000-0000-4000-8000-000000000101",
  latte: "00000000-0000-4000-8000-000000000102",
  ghost: "00000000-0000-4000-8000-000000000999",
};
const lot = (remaining: number, expiresAt: string | null, unitPrice: number | null, receivedAt = "2026-11-01") => ({ remaining, expiresAt, unitPrice, receivedAt });

const snapshot: RecommendSnapshot = {
  ingredients: [
    { id: ID.onion, name: "양파", unit: "g", lots: [lot(1000, "2026-11-20", 1, "2026-11-01"), lot(500, "2026-11-25", 2, "2026-11-08")] },
    { id: ID.tofu, name: "두부", unit: "ea", lots: [lot(6, "2026-11-11", 900)] },
    { id: ID.egg, name: "계란", unit: "ea", lots: [lot(30, "2026-11-08", 300)] }, // 경과 묶음만
    { id: ID.milk, name: "Tofu Milk", unit: "ml", lots: [lot(1000, "2026-11-30", null)] },
  ],
  menus: [
    { id: ID.soup, name: "순두부찌개", price: 9000, recipe: [{ ingredientId: ID.tofu, qty: 1 }, { ingredientId: ID.onion, qty: 50 }] },
    { id: ID.latte, name: "두유라떼", price: 5000, recipe: [{ ingredientId: ID.milk, qty: 200 }] },
  ],
  sales7d: [],
};

const out = (o: Partial<Recommendation> = {}): Recommendation => ({ pushMenus: [], newIdeas: [], ...o });
const idea = (ingredients: Recommendation["newIdeas"][number]["ingredients"]) => ({ name: "특선", ingredients, steps: ["볶는다"], suggestedPrice: 12000 });

describe("postprocess — 공통 후처리 (FR-REC-03·04, BR-04)", () => {
  it("UT-AI-04: 매장 활성 메뉴가 아닌 menuId는 제외하고 droppedCount +1", () => {
    const body = postprocess(out({ pushMenus: [
      { menuId: ID.soup, reason: "두부 소진" },
      { menuId: ID.ghost, reason: "없는 메뉴" },
    ] }), snapshot, TODAY);
    expect(body.pushMenus.map((p) => p.name)).toEqual(["순두부찌개"]); // 이름은 DB 값
    expect(body.droppedCount).toBe(1);
  });

  it("UT-AI-05: 소진량 > 사용 가능 재고면 항목을 지우지 않고 short, shortCount +1", () => {
    const body = postprocess(out({ newIdeas: [idea([{ ingredientId: ID.tofu, name: "두부", qty: 10 }])] }), snapshot, TODAY);
    expect(body.newIdeas[0].ingredients).toEqual([{ ingredientId: ID.tofu, name: "두부", qty: 10, unit: "ea", status: "short", availableQty: 6 }]);
    expect(body.shortCount).toBe(1);
  });

  it("UT-AI-06: estCost는 AI 값이 아니라 최근 묶음 단가로 서버가 계산 (미등록 재료는 제외)", () => {
    const body = postprocess(out({ newIdeas: [idea([
      { ingredientId: ID.onion, name: "양파", qty: 100 }, // 최근 묶음(11/08) 단가 2원 → 200원
      { ingredientId: ID.tofu, name: "두부", qty: 2 }, // 900원 × 2 → 1,800원
      { ingredientId: null, name: "바질", qty: 30 }, // 원가 제외
    ])] }), snapshot, TODAY);
    expect(body.newIdeas[0].estCost).toBe(2000);
  });

  it("UT-AI-15: 매장에 없는 재료(ingredientId=null, 바질) → unregistered, availableQty null", () => {
    const body = postprocess(out({ newIdeas: [idea([{ ingredientId: null, name: "바질", qty: 30 }])] }), snapshot, TODAY);
    expect(body.newIdeas[0].ingredients[0]).toEqual({ ingredientId: null, name: "바질", qty: 30, unit: null, status: "unregistered", availableQty: null });
    expect(body.unregisteredCount).toBe(1);
  });

  it("UT-AI-16: 다른 매장 재료 ID + 이름 ' 양 파 ' → 이름 정규화로 매장 양파에 연결", () => {
    const body = postprocess(out({ newIdeas: [idea([{ ingredientId: ID.ghost, name: " 양 파 ", qty: 200 }])] }), snapshot, TODAY);
    expect(body.newIdeas[0].ingredients[0]).toMatchObject({ ingredientId: ID.onion, name: "양파", status: "have", availableQty: 1500 });
  });

  it("UT-AI-17: ingredientId=null, 'tofu milk' → 대소문자·공백 무시로 'Tofu Milk'에 연결", () => {
    const body = postprocess(out({ newIdeas: [idea([{ ingredientId: null, name: "tofumilk", qty: 100 }])] }), snapshot, TODAY);
    expect(body.newIdeas[0].ingredients[0]).toMatchObject({ ingredientId: ID.milk, status: "have" });
  });

  it("UT-AI-18: 소진량 ≤ 사용 가능 재고 → have, availableQty는 DB 값", () => {
    const body = postprocess(out({ pushMenus: [{ menuId: ID.soup, reason: "r" }] }), snapshot, TODAY);
    expect(body.pushMenus[0].consumes[0]).toMatchObject({ status: "have", availableQty: 6 });
    expect(body.shortCount).toBe(0);
  });

  it("기존 메뉴 consumes = 1인분 전체 레시피(서버가 채움), 임박 재료 먼저, 임박 아닌 재료의 부족도 표시 (08 v0.3.2)", () => {
    const heavy: RecommendSnapshot = {
      ...snapshot,
      menus: [{ ...snapshot.menus[0], recipe: [{ ingredientId: ID.onion, qty: 2000 }, { ingredientId: ID.tofu, qty: 1 }] }],
    };
    const body = postprocess(out({ pushMenus: [{ menuId: ID.soup, reason: "두부 소진" }, { menuId: ID.soup, reason: "중복" }] }), heavy, TODAY);
    expect(body.pushMenus).toHaveLength(1); // 같은 메뉴는 한 번만
    expect(body.pushMenus[0].consumes).toEqual([
      { ingredientId: ID.tofu, name: "두부", qty: 1, unit: "ea", status: "have", availableQty: 6 }, // D-1이라 앞
      { ingredientId: ID.onion, name: "양파", qty: 2000, unit: "g", status: "short", availableQty: 1500 }, // 1인분이 재고보다 많음
    ]);
    expect(body.shortCount).toBe(1);
  });

  it("UT-AI-19: 경과 묶음만 있는 재료 → 사용 가능 재고 0 → short", () => {
    const body = postprocess(out({ newIdeas: [idea([{ ingredientId: ID.egg, name: "계란", qty: 1 }])] }), snapshot, TODAY);
    expect(body.newIdeas[0].ingredients[0]).toMatchObject({ status: "short", availableQty: 0 });
  });

  it("UT-AI-14: 같은 AI 응답을 세 기준으로 후처리하면 결과가 같다", async () => {
    const fixed = out({
      pushMenus: [{ menuId: ID.soup, reason: "r" }, { menuId: ID.ghost, reason: "x" }],
      newIdeas: [idea([{ ingredientId: null, name: "바질", qty: 30 }, { ingredientId: ID.tofu, name: "두부", qty: 9 }])],
    });
    const ai: AiClient = { generate: async <T,>() => fixed as T };
    const bodies = await Promise.all([ExpiryFirst, CostFirst, PopularityFirst].map((strategy) => recommend({ snapshot, strategy, today: TODAY, ai })));
    const results = bodies.map((r) => (r.ok ? r.body : null));
    expect(results[0]).toMatchObject({ droppedCount: 1, shortCount: 1, unregisteredCount: 1, fallback: false });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });
});

describe("규칙 기반 대체 (UC-08 3a)", () => {
  it("UT-AI-20: 임박 재료(두부 D-1)가 든 메뉴만 pushMenus, newIdeas 빈 배열, fallback=true", () => {
    const body = fallbackRecommendation(snapshot, TODAY);
    expect(body.fallback).toBe(true);
    expect(body.newIdeas).toEqual([]);
    expect(body.pushMenus.map((p) => p.name)).toEqual(["순두부찌개"]);
    expect(body.pushMenus[0].reason).toBe("두부가 D-1이라 먼저 쓰기 좋아요");
    expect(body.pushMenus[0].consumes.map((c) => c.name)).toEqual(["두부", "양파"]);
  });

  it("UT-AI-21: 임박 재료가 없으면 pushMenus 빈 배열, fallback=true (오류 아님)", () => {
    const body = fallbackRecommendation(snapshot, "2026-11-01"); // 두부 D-10
    expect(body).toMatchObject({ fallback: true, pushMenus: [], newIdeas: [] });
  });

  it("AI 실패 → 대체 결과. 대체할 메뉴도 없으면 원래 오류 코드 (08_API_SPEC 9장)", async () => {
    const failing: AiClient = { generate: async () => { throw new AiError("AI_INVALID_OUTPUT", "형식 오류"); } };
    const withMenus = await recommend({ snapshot, strategy: ExpiryFirst, today: TODAY, ai: failing });
    expect(withMenus.ok && withMenus.body.fallback).toBe(true);
    const none = await recommend({ snapshot, strategy: ExpiryFirst, today: "2026-11-01", ai: failing });
    expect(none).toMatchObject({ ok: false, code: "AI_INVALID_OUTPUT" });
  });

  it("AiError가 아닌 오류(프로그램 오류)는 숨기지 않고 던진다", async () => {
    const broken: AiClient = { generate: async () => { throw new TypeError("bug"); } };
    await expect(recommend({ snapshot, strategy: ExpiryFirst, today: TODAY, ai: broken })).rejects.toThrow("bug");
  });
});
