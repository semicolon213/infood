import "server-only";
import type { FefoLot } from "@/lib/stock/fefo";
import { round3 } from "@/lib/stock/unit";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

// FEFO 계획 입력: 잔량 > 0이고 기준일(판매일·사용일)에 경과하지 않은 묶음 (07_DB 6장). 순서는 planConsumption이 정한다.
// 서버 액션이 재계획 때도 같은 클라이언트로 다시 부르므로 db를 인자로 받는다. 조회 실패면 null
export async function loadFefoLots(db: Db, storeId: string, ingredientIds: string[], baseDate: string): Promise<FefoLot[] | null> {
  if (ingredientIds.length === 0) return [];
  const { data, error } = await db
    .from("stock_lots")
    .select("id, ingredient_id, remaining, expires_at, received_at")
    .eq("store_id", storeId)
    .in("ingredient_id", ingredientIds)
    .gt("remaining", 0)
    .or(`expires_at.is.null,expires_at.gte.${baseDate}`);
  if (error) return null;
  return data.map((l) => ({
    id: l.id,
    ingredientId: l.ingredient_id,
    remaining: Number(l.remaining),
    expiresAt: l.expires_at,
    receivedAt: l.received_at,
  }));
}

// 판매 재입력(FR-USE-06): 이 마감일 판매로 묶음마다 순 차감한 양. remaining = 되돌릴 양 (07_DB 10.2와 같은 계산). 조회 실패면 null
export async function loadSalesDayConsumption(db: Db, storeId: string, salesDayId: string): Promise<FefoLot[] | null> {
  const { data, error } = await db
    .from("stock_movements")
    .select("lot_id, delta, stock_lots(ingredient_id, expires_at, received_at)")
    .eq("store_id", storeId)
    .eq("ref_type", "sales")
    .eq("ref_id", salesDayId);
  if (error) return null;
  const sum = new Map<string, FefoLot>();
  for (const m of data) {
    const lot = m.stock_lots as unknown as { ingredient_id: string; expires_at: string | null; received_at: string } | null;
    if (!m.lot_id || !lot) continue;
    const cur = sum.get(m.lot_id) ?? { id: m.lot_id, ingredientId: lot.ingredient_id, remaining: 0, expiresAt: lot.expires_at, receivedAt: lot.received_at };
    cur.remaining = round3(cur.remaining - Number(m.delta));
    sum.set(m.lot_id, cur);
  }
  return [...sum.values()].filter((l) => l.remaining > 0);
}
