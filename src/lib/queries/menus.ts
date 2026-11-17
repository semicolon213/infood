import "server-only";
import { costRate, latestUnitPrice, menuCost } from "@/lib/stock/cost";
import { createClient } from "@/lib/supabase/server";
import type { MenuDetail, MenuSummary, Unit, UUID } from "@/types/contracts";
import { getSessionStore } from "./store";

type Db = Awaited<ReturnType<typeof createClient>>;

// 08_API_SPEC 4장 — WBS 3.2b. 매장은 세션에서 구한다 (AGENTS 6)

// FR-MENU-01: 이름 순, 비활성 포함.
// 확장 FR-MENU-03 (WBS 4.5): 1인분 원가 = Σ 소요량 × 재료별 최근 입고 단가, 원가율 = 원가 ÷ 판매가 (lib/stock/cost, AGENTS 2).
// 단가를 모르는 재료가 있거나 레시피가 없으면 cost·costRate를 넣지 않는다 ("알 수 없음", UT-COST-03)
export async function getMenus(): Promise<MenuSummary[]> {
  const { store } = await getSessionStore();
  if (!store) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("menus")
    .select("id, name, price, is_active, is_special, recipe_items(ingredient_id, qty)")
    .eq("store_id", store.id)
    .order("name");
  if (error) throw error; // 조회 실패는 Next 오류 화면으로 (조회 함수는 ActionResult를 쓰지 않음)

  const prices = await latestUnitPrices(db, store.id, [...new Set(data.flatMap((m) => m.recipe_items.map((r) => r.ingredient_id)))]);
  return data.map((m) => {
    const cost = menuCost(m.recipe_items.map((r) => ({ qty: Number(r.qty), unitPrice: prices.get(r.ingredient_id) ?? null })));
    const rate = costRate(cost, m.price);
    return {
      id: m.id,
      name: m.name,
      price: m.price,
      isActive: m.is_active,
      isSpecial: m.is_special,
      ...(cost === null ? {} : { cost }),
      ...(rate === null ? {} : { costRate: rate }),
    };
  });
}

// 재료별 최근 입고 단가. 다 쓴 묶음도 포함한다 (잔량이 아니라 입고 기록 기준, FR-MENU-03)
async function latestUnitPrices(db: Db, storeId: string, ingredientIds: string[]): Promise<Map<string, number | null>> {
  if (ingredientIds.length === 0) return new Map();
  const { data, error } = await db
    .from("stock_lots")
    .select("ingredient_id, remaining, expires_at, unit_price, received_at")
    .eq("store_id", storeId)
    .in("ingredient_id", ingredientIds)
    .not("unit_price", "is", null)
    // latestUnitPrice는 같은 입고일이면 뒤의 묶음을 고른다 → 입고일·생성 순으로 넘긴다
    .order("received_at")
    .order("created_at");
  if (error) throw error;

  const lots = new Map<string, Parameters<typeof latestUnitPrice>[0]>();
  for (const l of data) {
    const list = lots.get(l.ingredient_id) ?? [];
    list.push({ remaining: Number(l.remaining), expiresAt: l.expires_at, unitPrice: Number(l.unit_price), receivedAt: l.received_at });
    lots.set(l.ingredient_id, list);
  }
  return new Map(ingredientIds.map((id) => [id, latestUnitPrice(lots.get(id) ?? [])]));
}

// FR-MENU-02: 메뉴 + 레시피(재료 이름 순). 없거나 다른 매장 메뉴면 null
export async function getMenu(id: UUID): Promise<MenuDetail | null> {
  const { store } = await getSessionStore();
  if (!store) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("menus")
    .select("id, name, price, is_active, is_special, recipe_items(qty, ingredients(id, name, unit))")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  type Row = { qty: number; ingredients: { id: string; name: string; unit: Unit } | null };
  const recipe = (data.recipe_items as unknown as Row[])
    .filter((r) => r.ingredients !== null)
    .map((r) => ({ ingredientId: r.ingredients!.id, name: r.ingredients!.name, unit: r.ingredients!.unit, qty: Number(r.qty) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return { id: data.id, name: data.name, price: data.price, isActive: data.is_active, isSpecial: data.is_special, recipe };
}
