import "server-only";
import { addDays } from "@/lib/stock/expiry";
import { createClient } from "@/lib/supabase/server";
import { StockHistoryFilter, type StockHistoryItem, type Unit, type WasteReason } from "@/types/contracts";
import { getSessionStore } from "./store";

// 08_API_SPEC 7장 — WBS 3.7b. 매장은 세션에서 구한다 (AGENTS 6)

type Ingredient = { name: string; unit: Unit } | null;

// 사용·폐기 기록 목록. 최신순, 기간 최대 31일(양끝 포함). 기간이 잘못되면 throw (화면이 먼저 같은 스키마로 확인한다)
// 사용은 usage_records의 사용일, 폐기는 기록 시각(created_at)의 KST 날짜를 쓴다
export async function getStockHistory(filter: StockHistoryFilter): Promise<StockHistoryItem[]> {
  const { from, to, type } = StockHistoryFilter.parse(filter);
  const { store } = await getSessionStore();
  if (!store) return [];
  const db = await createClient();

  const [usage, waste] = await Promise.all([
    type === "waste"
      ? null
      : db
          .from("usage_records")
          .select("used_on, ingredient_id, qty, short_qty, memo, created_at, ingredients(name, unit)")
          .eq("store_id", store.id)
          .gte("used_on", from)
          .lte("used_on", to),
    type === "usage"
      ? null
      : db
          .from("stock_movements")
          .select("ingredient_id, delta, reason, memo, created_at, ingredients(name, unit)")
          .eq("store_id", store.id)
          .eq("type", "waste")
          .gte("created_at", `${from}T00:00:00+09:00`)
          .lt("created_at", `${addDays(to, 1)}T00:00:00+09:00`),
  ]);
  if (usage?.error) throw usage.error; // 조회 실패는 화면이 오류 상태로 보여 준다
  if (waste?.error) throw waste.error;

  const rows: { at: string; item: StockHistoryItem }[] = [
    ...(usage?.data ?? []).map((u) => ({ at: u.created_at, item: {
      ...item(u.ingredient_id, u.ingredients as unknown as Ingredient),
      date: u.used_on,
      type: "usage" as const,
      qty: Number(u.qty),
      reason: null,
      memo: u.memo,
      shortQty: Number(u.short_qty),
    } })),
    ...(waste?.data ?? []).map((w) => ({ at: w.created_at, item: {
      ...item(w.ingredient_id, w.ingredients as unknown as Ingredient),
      date: kstDate(w.created_at),
      type: "waste" as const,
      qty: -Number(w.delta),
      reason: w.reason as WasteReason | null,
      memo: w.memo,
      shortQty: 0,
    } })),
  ];
  // 최신순: 날짜 → 같은 날은 기록 시각
  rows.sort((a, b) => (a.item.date !== b.item.date ? (a.item.date < b.item.date ? 1 : -1) : Date.parse(b.at) - Date.parse(a.at)));
  return rows.map((r) => r.item);
}

function item(ingredientId: string, ing: Ingredient) {
  return { ingredientId, name: ing?.name ?? "", unit: ing?.unit ?? ("g" as Unit) };
}

function kstDate(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 9 * 3_600_000).toISOString().slice(0, 10);
}
