import "server-only";
import { addDays } from "@/lib/stock/expiry";
import { createClient } from "@/lib/supabase/server";
import type { ISODate, SalesDay, Shortage, Unit } from "@/types/contracts";
import { getSessionStore } from "./store";

// 08_API_SPEC 6장 — WBS 3.6b. 매장은 세션에서 구한다 (AGENTS 6)

type ShortageRow = { ingredient_id: string; required_qty: number; short_qty: number };

// 활성 메뉴 전체를 최근 7일(판매일 포함) 판매량 순으로, 같으면 이름 순. 마감 전이면 qty = 0
// 마감한 날은 그날 판 뒤 비활성화한 메뉴도 함께 보여 준다 (PR #41 리뷰)
export async function getSalesDay(soldOn: ISODate): Promise<SalesDay> {
  const { store } = await getSessionStore();
  if (!store) return { soldOn, closed: false, items: [], shortages: [] };
  const db = await createClient();

  const [menus, recent, day] = await Promise.all([
    db.from("menus").select("id, name").eq("store_id", store.id).eq("is_active", true),
    db
      .from("sales")
      .select("menu_id, qty, sales_days!inner(sold_on)")
      .eq("store_id", store.id)
      .gte("sales_days.sold_on", addDays(soldOn, -6))
      .lte("sales_days.sold_on", soldOn),
    db.from("sales_days").select("shortages, sales(menu_id, qty, menus(name))").eq("store_id", store.id).eq("sold_on", soldOn).maybeSingle(),
  ]);
  for (const r of [menus, recent, day]) if (r.error) throw r.error; // 조회 실패는 Next 오류 화면으로

  const sold7d = new Map<string, number>();
  for (const s of recent.data!) sold7d.set(s.menu_id, (sold7d.get(s.menu_id) ?? 0) + s.qty);
  type SoldRow = { menu_id: string; qty: number; menus: { name: string } | null };
  const soldToday = (day.data?.sales ?? []) as unknown as SoldRow[];
  const qtyToday = new Map(soldToday.map((s) => [s.menu_id, s.qty]));
  const active = new Set(menus.data!.map((m) => m.id));

  const items = [
    ...menus.data!.map((m) => ({ menuId: m.id, name: m.name, qty: qtyToday.get(m.id) ?? 0 })),
    ...soldToday.filter((s) => !active.has(s.menu_id)).map((s) => ({ menuId: s.menu_id, name: s.menus?.name ?? "", qty: s.qty })),
  ].sort((a, b) => (sold7d.get(b.menuId) ?? 0) - (sold7d.get(a.menuId) ?? 0) || a.name.localeCompare(b.name, "ko"));

  return { soldOn, closed: day.data !== null, items, shortages: await toShortages(db, store.id, (day.data?.shortages ?? []) as ShortageRow[]) };
}

// sales_days.shortages(재료 ID만 저장) → 화면용 Shortage (이름·단위)
async function toShortages(db: Awaited<ReturnType<typeof createClient>>, storeId: string, rows: ShortageRow[]): Promise<Shortage[]> {
  if (rows.length === 0) return [];
  const { data, error } = await db
    .from("ingredients")
    .select("id, name, unit")
    .eq("store_id", storeId)
    .in("id", rows.map((r) => r.ingredient_id));
  if (error) throw error;
  const byId = new Map(data.map((i) => [i.id, i]));
  return rows.map((r) => ({
    ingredientId: r.ingredient_id,
    name: byId.get(r.ingredient_id)?.name ?? "",
    unit: (byId.get(r.ingredient_id)?.unit ?? "g") as Unit,
    requiredQty: Number(r.required_qty),
    shortQty: Number(r.short_qty),
  }));
}
