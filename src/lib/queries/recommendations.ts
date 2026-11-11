import "server-only";
import type { RecommendBody } from "@/lib/ai/recommend";
import type { RecommendSnapshot } from "@/lib/ai/strategies/types";
import { addDays } from "@/lib/stock/expiry";
import { createClient } from "@/lib/supabase/server";
import type { ISODate, RecommendBasis, SavedRecommendation, UUID } from "@/types/contracts";
import { getSessionStore } from "./store";

// 08_API_SPEC 9장 — WBS 4.2. 매장은 세션에서 구하고(AGENTS 6), 매장 격리는 RLS가 한 번 더 막는다.

type Db = Awaited<ReturnType<typeof createClient>>;

/** 추천 입력 스냅샷 (08 9장 ②): 활성 재료와 잔량 > 0 묶음, 활성 메뉴·레시피, 최근 7일 판매량 */
export async function loadRecommendSnapshot(db: Db, storeId: UUID, today: ISODate): Promise<RecommendSnapshot> {
  const [ings, lots, menus, sales] = await Promise.all([
    db.from("ingredients").select("id, name, unit").eq("store_id", storeId).eq("is_active", true),
    db
      .from("stock_lots")
      .select("ingredient_id, remaining, expires_at, unit_price, received_at")
      .eq("store_id", storeId)
      .gt("remaining", 0)
      .order("received_at")
      .order("created_at"), // 같은 입고일이면 나중 묶음 단가가 최근 단가 (latestUnitPrice)
    db.from("menus").select("id, name, price, recipe_items(ingredient_id, qty)").eq("store_id", storeId).eq("is_active", true),
    db
      .from("sales")
      .select("menu_id, qty, sales_days!inner(sold_on)")
      .eq("store_id", storeId)
      .gte("sales_days.sold_on", addDays(today, -6))
      .lte("sales_days.sold_on", today),
  ]);
  for (const r of [ings, lots, menus, sales]) if (r.error) throw r.error; // 조회 실패는 Route Handler가 INTERNAL로

  const lotsBy = new Map<string, RecommendSnapshot["ingredients"][number]["lots"]>();
  for (const l of lots.data!) {
    const list = lotsBy.get(l.ingredient_id) ?? [];
    list.push({ remaining: Number(l.remaining), expiresAt: l.expires_at, unitPrice: l.unit_price === null ? null : Number(l.unit_price), receivedAt: l.received_at });
    lotsBy.set(l.ingredient_id, list);
  }
  const sold = new Map<string, number>();
  for (const s of sales.data!) sold.set(s.menu_id, (sold.get(s.menu_id) ?? 0) + s.qty);

  return {
    ingredients: ings.data!.map((i) => ({ id: i.id, name: i.name, unit: i.unit, lots: lotsBy.get(i.id) ?? [] })),
    menus: menus.data!.map((m) => ({
      id: m.id,
      name: m.name,
      price: m.price,
      recipe: m.recipe_items.map((r) => ({ ingredientId: r.ingredient_id, qty: Number(r.qty) })),
    })),
    sales7d: [...sold].map(([menuId, qty]) => ({ menuId, qty })),
  };
}

// 저장된 추천 결과와 특선 등록 여부 (FR-REC-08). 없거나 다른 매장이면 null
export async function getRecommendation(id: UUID): Promise<SavedRecommendation | null> {
  const { store } = await getSessionStore();
  if (!store) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("recommendations")
    .select("id, basis, result_json, accepted")
    .eq("id", id)
    .eq("store_id", store.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const body = data.result_json as unknown as RecommendBody;
  return { ...body, id: data.id, basis: data.basis as RecommendBasis, accepted: data.accepted };
}
