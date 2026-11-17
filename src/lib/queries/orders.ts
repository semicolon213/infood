import "server-only";
import { todayKST } from "@/lib/date";
import { pendingOrderQty, suggestOrderQty } from "@/lib/stock/order";
import { createClient } from "@/lib/supabase/server";
import {
  IdInput,
  OrderFilter,
  type OrderDetail,
  type OrderDraft,
  type OrderDraftItem,
  type OrderSummary,
  type Unit,
  type UUID,
} from "@/types/contracts";
import type { Database } from "@/types/database";
import { getSessionStore } from "./store";

// 08_API_SPEC 10장 — WBS 4.3b. 매장은 세션에서 구하고(AGENTS 6), 권장 발주량은 lib/stock/order.ts가 계산한다(AGENTS 2).
// 조회 실패는 빈 목록으로 위장하지 않고 throw해 화면의 오류 상태로 보낸다 (IT-DASH-04와 같은 기준)

// rpc() 결과가 any로 추론되어 생성 타입을 직접 붙인다 (queries/dashboard.ts와 같은 처리)
type StockRow = Database["public"]["Functions"]["get_ingredient_stock"]["Returns"][number];
// 생성 타입이 품목 → 재료 관계를 배열로 추론한다 (다대일이라 실제로는 객체 하나)
type ItemIngredient = { name: string; unit: Unit };

// FR-ORD-01, BR-06: 부족 재료(BR-05)마다 권장 발주량 초안. 권장량이 0 이하인 재료는 뺀다
export async function getOrderDraft(): Promise<OrderDraft> {
  const { store } = await getSessionStore();
  if (!store) return { items: [] };
  const db = await createClient();

  const [stock, pending] = await Promise.all([
    db.rpc("get_ingredient_stock", { p_store_id: store.id, p_today: todayKST() }).eq("is_low", true),
    // 미입고 발주량: 발주완료(ordered) 목록의 품목 (07_DB 6장)
    db
      .from("purchase_order_items")
      .select("ingredient_id, qty, purchase_orders!inner(status)")
      .eq("store_id", store.id)
      .eq("purchase_orders.status", "ordered"),
  ]);
  if (stock.error) throw stock.error;
  if (pending.error) throw pending.error;

  const pendingByIngredient = new Map<string, { status: "ordered"; qty: number }[]>();
  for (const p of pending.data) {
    const list = pendingByIngredient.get(p.ingredient_id) ?? [];
    list.push({ status: "ordered", qty: Number(p.qty) });
    pendingByIngredient.set(p.ingredient_id, list);
  }

  const items: OrderDraftItem[] = [];
  for (const r of stock.data as StockRow[]) {
    const minStock = Number(r.min_stock);
    const targetStock = r.target_stock === null ? null : Number(r.target_stock);
    const availableQty = Number(r.available_remaining);
    const pendingQty = pendingOrderQty(pendingByIngredient.get(r.ingredient_id) ?? []);
    const suggestedQty = suggestOrderQty({ targetStock, minStock, available: availableQty, pending: pendingQty });
    if (suggestedQty === null) continue;
    items.push({
      ingredientId: r.ingredient_id,
      name: r.name,
      unit: r.unit,
      availableQty,
      targetQty: targetStock ?? minStock * 2,
      pendingQty,
      suggestedQty,
    });
  }
  return { items: items.sort((a, b) => a.name.localeCompare(b.name, "ko")) };
}

// FR-ORD-03: 발주일 내림차순, 같은 날은 나중에 만든 목록 먼저. 기간이 잘못되면 throw (화면이 먼저 같은 스키마로 확인한다)
export async function getOrders(filter: OrderFilter = {}): Promise<OrderSummary[]> {
  const { from, to } = OrderFilter.parse(filter);
  const { store } = await getSessionStore();
  if (!store) return [];
  const db = await createClient();

  let query = db
    .from("purchase_orders")
    .select("id, order_date, status, memo, purchase_order_items(count)")
    .eq("store_id", store.id);
  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);
  const { data, error } = await query
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  return data.map((o) => ({
    id: o.id,
    orderDate: o.order_date,
    status: o.status,
    itemCount: (o.purchase_order_items as unknown as { count: number }[])[0]?.count ?? 0,
    memo: o.memo,
  }));
}

// FR-ORD-03, FR-STK-05. 없거나 다른 매장 목록이면 null (RLS로 조회되지 않는다)
export async function getOrder(id: UUID): Promise<OrderDetail | null> {
  if (!IdInput.safeParse({ id }).success) return null; // 주소의 잘못된 ID가 DB 형식 오류(INTERNAL)로 가지 않게
  const { store } = await getSessionStore();
  if (!store) return null;
  const db = await createClient();

  const { data, error } = await db
    .from("purchase_orders")
    .select("id, order_date, status, memo, purchase_order_items(ingredient_id, qty, ingredients(name, unit))")
    .eq("store_id", store.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    orderDate: data.order_date,
    status: data.status,
    memo: data.memo,
    items: data.purchase_order_items
      .map((i) => {
        const ing = i.ingredients as unknown as ItemIngredient;
        return { ingredientId: i.ingredient_id, name: ing.name, unit: ing.unit, qty: Number(i.qty) };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  };
}
