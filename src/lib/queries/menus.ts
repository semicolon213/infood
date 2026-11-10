import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MenuDetail, MenuSummary, Unit, UUID } from "@/types/contracts";
import { getSessionStore } from "./store";

// 08_API_SPEC 4장 — WBS 3.2b. 매장은 세션에서 구한다 (AGENTS 6)

// FR-MENU-01: 이름 순, 비활성 포함 (cost·costRate는 확장 FR-MENU-03)
export async function getMenus(): Promise<MenuSummary[]> {
  const { store } = await getSessionStore();
  if (!store) return [];
  const db = await createClient();
  const { data, error } = await db
    .from("menus")
    .select("id, name, price, is_active, is_special")
    .eq("store_id", store.id)
    .order("name");
  if (error) throw error; // 조회 실패는 Next 오류 화면으로 (조회 함수는 ActionResult를 쓰지 않음)
  return data.map((m) => ({ id: m.id, name: m.name, price: m.price, isActive: m.is_active, isSpecial: m.is_special }));
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
