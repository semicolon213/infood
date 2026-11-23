import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ISODate, SaleOrderSummary } from "@/types/contracts";
import { getSessionStore } from "./store";

// 주문별 판매 (WBS 4.8): 그날 기록, 최근 것부터 50건
export async function getSaleOrders(soldOn: ISODate): Promise<SaleOrderSummary[]> {
  const { store } = await getSessionStore();
  if (!store) return [];
  const db = await createClient();
  const [orders, menus] = await Promise.all([
    db.from("sale_orders").select("id, source, created_at, items, shortages").eq("store_id", store.id).eq("sold_on", soldOn)
      .order("created_at", { ascending: false }).limit(50),
    db.from("menus").select("id, name").eq("store_id", store.id),
  ]);
  if (orders.error) throw orders.error;
  if (menus.error) throw menus.error;
  const names = new Map(menus.data.map((m) => [m.id, m.name]));
  return orders.data.map((o) => ({
    id: o.id,
    source: o.source as "web" | "pos",
    createdAt: o.created_at,
    items: (o.items as { menu_id: string; qty: number }[]).map((i) => ({ menuId: i.menu_id, name: names.get(i.menu_id) ?? "", qty: i.qty })),
    shortCount: (o.shortages as unknown[]).length,
  }));
}

// 그날 판매 마감을 했는지 (마감한 날짜는 주문별 판매를 받지 않는다)
export async function isSalesDayClosed(soldOn: ISODate): Promise<boolean> {
  const { store } = await getSessionStore();
  if (!store) return false;
  const db = await createClient();
  const { data, error } = await db.from("sales_days").select("id").eq("store_id", store.id).eq("sold_on", soldOn).maybeSingle();
  if (error) throw error;
  return data !== null;
}
