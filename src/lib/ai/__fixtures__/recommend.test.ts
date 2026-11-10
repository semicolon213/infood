import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MockAdapter } from "../adapters/mock";
import { buildRecommendationRequest } from "../prompts/recommend";
import { Recommendation } from "../schemas";
import recommend from "./recommend.json";

type SeedIngredient = { n: number; name: string; unit: string; qty: number };
type SeedMenu = { n: number; name: string; recipe: [number, number][] };
const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
const blocks = [...seed.matchAll(/\$data\$(\[[\s\S]*?\])\$data\$/g)];
if (blocks.length < 2) throw new Error("시드의 재료·메뉴 JSON을 찾지 못했어요");
const ingredients: SeedIngredient[] = JSON.parse(blocks[0][1]);
const menus: SeedMenu[] = JSON.parse(blocks[1][1]);

function idFactory(variable: string) {
  const match = seed.match(new RegExp(`${variable}\\s*:=\\s*\\('([^']+)'\\s*\\|\\|\\s*lpad\\(r\\.n::text,\\s*(\\d+),\\s*'0'\\)`));
  if (!match) throw new Error(`시드 ${variable} ID 규칙을 찾지 못했어요`);
  return (n: number) => match[1] + String(n).padStart(Number(match[2]), "0");
}
const ingredientId = idFactory("v_ingredient");
const menuId = idFactory("v_menu");
// recipe_items의 ID 식은 재료 등록 식과 별개이므로 양쪽을 실제 SQL에서 읽어 비교한다.
const recipeIdRule = seed.match(/insert into recipe_items[^;]*?select v_store,\s*v_menu,\s*\('([^']+)'\s*\|\|\s*lpad\(\(item->>0\),\s*(\d+),\s*'0'\)/);
if (!recipeIdRule) throw new Error("시드 레시피의 재료 ID 규칙을 찾지 못했어요");
const recipeIngredientId = (n: number) => recipeIdRule[1] + String(n).padStart(Number(recipeIdRule[2]), "0");
const ingredientById = new Map(ingredients.map((item) => [ingredientId(item.n), item]));
const menuById = new Map(menus.map((item) => [menuId(item.n), item]));

// Adapter 요청 조립만 확인한다. 빈 메뉴를 허용하는 API 통합 검사나 실제 DB 조회가 아니다.
const request = buildRecommendationRequest({
  today: "2026-11-03", strategyGuide: "고정 응답 형식 확인", rankedIngredients: [],
  snapshot: { ingredients: [], menus: [], sales7d: [] },
});

describe("3.10b 추천 고정 응답", () => {
  it("UT-AI-24: 기존 Recommendation 스키마를 지키고 서버 계산 필드를 넣지 않는다", () => {
    const parsed = Recommendation.parse(recommend);
    expect(parsed).toEqual(recommend); // Zod가 알 수 없는 필드를 버려 통과하는 것도 검출한다.
    expect(parsed.pushMenus.length).toBeGreaterThan(0);
    expect(parsed.newIdeas.length).toBeGreaterThan(0);
    expect(Object.keys(recommend).sort()).toEqual(["newIdeas", "pushMenus"]);
  });

  it("UT-AI-24: 잠정안 A의 소비량·이름과 시드 레시피 행의 ID 식이 일치한다", () => {
    for (const item of recommend.pushMenus) {
      const menu = menuById.get(item.menuId);
      expect(menu, item.menuId).toBeDefined();
      if (!menu) throw new Error("시드에 없는 메뉴예요");
      const sort = (rows: [string, number][]) => rows.sort(([a], [b]) => a.localeCompare(b));
      expect(sort(item.consumes.map((row) => [row.ingredientId, row.qty]))).toEqual(
        sort(menu.recipe.map(([n, qty]) => [recipeIngredientId(n), qty])),
      );
      for (const row of item.consumes) {
        expect(ingredientById.get(row.ingredientId)?.name).toBe(row.name);
      }
    }
    expect(ingredientById.get(ingredientId(24))?.unit).toBe("g");
    expect(ingredientById.get(ingredientId(21))?.unit).toBe("ea");
  });

  it("UT-AI-24: 신규 아이디어의 등록 ID·이름을 시드와 연결하고 미등록은 null로 둔다", () => {
    for (const row of recommend.newIdeas.flatMap((idea) => idea.ingredients)) {
      if (row.ingredientId === null) {
        expect(ingredients.some((item) => item.name === row.name)).toBe(false);
      } else {
        expect(ingredientById.get(row.ingredientId)?.name).toBe(row.name);
      }
    }
    expect(recommend.newIdeas.flatMap((idea) => idea.ingredients)).toContainEqual({ ingredientId: null, name: "바질", qty: 5 });
  });

  it("UT-AI-24: 시드 입고량 기준 오징어 100g보다 큰 200g 요청을 포함한다", () => {
    const squid = recommend.newIdeas.flatMap((idea) => idea.ingredients).find((row) => row.ingredientId === ingredientId(16));
    expect(squid).toBeDefined();
    expect(squid!.qty).toBeGreaterThan(ingredientById.get(ingredientId(16))!.qty);
    // 실제 short 상태 판정·영속화는 4.2 후처리/4.4 통합 검사에서 검증한다.
  });

  it("UT-AI-25: MockAdapter가 새 fixture를 반환하고 호출 간 변경이 공유되지 않는다", async () => {
    const adapter = new MockAdapter();
    const first = await adapter.generate(request);
    expect(first).toEqual(recommend);
    first.pushMenus[0].consumes[0].qty = 999;
    const second = await adapter.generate(request);
    expect(second).toEqual(recommend);
    expect(second.pushMenus[0].consumes[0].qty).not.toBe(999);
  });

  it("UT-AI-25: 기존 장애 모의는 새 fixture에서도 AI_FAILED를 반환한다", async () => {
    await expect(new MockAdapter({ fail: true }).generate(request)).rejects.toMatchObject({ code: "AI_FAILED" });
  });
});
