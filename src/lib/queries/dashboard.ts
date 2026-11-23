import "server-only";
import { kstDateOf, todayKST } from "@/lib/date";
import { addDays, daysLeft } from "@/lib/stock/expiry";
import { weekStart, weeklyWaste } from "@/lib/stock/waste";
import { createClient } from "@/lib/supabase/server";
import type { Dashboard, DashboardLot, Unit } from "@/types/contracts";
import type { Database } from "@/types/database";
import { getSessionStore } from "./store";

// 08_API_SPEC 8장 — WBS 4.1b. 매장은 세션에서 구하고(AGENTS 6), 쿼리는 07_DB 6장을 따른다.
// 남은 일수는 DB가 아니라 lib/stock으로 계산한다 (AGENTS 2).

// rpc() 결과가 any로 추론되어 생성 타입을 직접 붙인다
type StockRow = Database["public"]["Functions"]["get_ingredient_stock"]["Returns"][number];
// 생성 타입이 묶음 → 재료 관계를 배열로 추론한다 (다대일이라 실제로는 객체 하나, queries/usage.ts와 같은 처리)
type LotIngredient = { name: string; unit: Unit };

const SOON_DAYS = 3; // 임박: D-0 ~ D-3 (lib/stock/status.ts와 같은 기준)

export async function getDashboard(): Promise<Dashboard> {
  const today = todayKST();
  const { store } = await getSessionStore();
  if (!store) return { today, expiringLots: [], expiredLots: [], lowStock: [] };
  const db = await createClient();

  // 잔량이 남은 묶음 중 기한이 오늘 + 3일 이하인 것 (경과 + 임박). 기한 추적 제외(null)는 lte에서 빠진다
  const [lots, stock, waste] = await Promise.all([
    db
      .from("stock_lots")
      .select("id, ingredient_id, remaining, expires_at, ingredients!inner(name, unit, is_active)")
      .eq("store_id", store.id)
      .eq("ingredients.is_active", true)
      .gt("remaining", 0)
      .lte("expires_at", addDays(today, SOON_DAYS)),
    db.rpc("get_ingredient_stock", { p_store_id: store.id, p_today: today }).eq("is_low", true),
    // 확장 FR-DASH-05: 지난주 월요일 0시(KST) 이후 폐기 이력과 그 묶음의 단가 (07_DB 6장)
    db
      .from("stock_movements")
      .select("delta, created_at, stock_lots(unit_price)")
      .eq("store_id", store.id)
      .eq("type", "waste")
      .gte("created_at", `${addDays(weekStart(today), -7)}T00:00:00+09:00`),
  ]);
  if (lots.error) throw lots.error; // 조회 실패는 Next 오류 화면으로 (빈 상태로 위장하지 않음, IT-DASH-04)
  if (stock.error) throw stock.error;
  if (waste.error) throw waste.error;

  const all: DashboardLot[] = lots.data
    .map((l) => {
      const i = l.ingredients as unknown as LotIngredient;
      const expiresAt = l.expires_at!; // lte 조건으로 null은 오지 않는다
      return {
        lotId: l.id,
        ingredientId: l.ingredient_id,
        name: i.name,
        remaining: Number(l.remaining),
        unit: i.unit,
        expiresAt,
        daysLeft: daysLeft(expiresAt, today),
      };
    })
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.name.localeCompare(b.name, "ko"));

  return {
    today,
    expiringLots: all.filter((l) => l.daysLeft >= 0),
    expiredLots: all.filter((l) => l.daysLeft < 0),
    lowStock: (stock.data as StockRow[])
      .map((r) => ({
        ingredientId: r.ingredient_id,
        name: r.name,
        unit: r.unit,
        availableRemaining: Number(r.available_remaining),
        minStock: Number(r.min_stock),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    // 금액 계산은 lib/stock/waste (AGENTS 2). 폐기 이력의 delta는 음수
    weeklyWaste: weeklyWaste(
      waste.data.map((m) => ({
        date: kstDateOf(m.created_at),
        qty: -Number(m.delta),
        unitPrice: unitPriceOf(m.stock_lots as unknown as WasteLot),
      })),
      today,
    ),
  };
}

// 생성 타입이 이력 → 묶음 관계를 배열로 추론한다 (다대일이라 실제로는 객체 하나)
type WasteLot = { unit_price: number | null } | null;
const unitPriceOf = (lot: WasteLot) => (lot?.unit_price == null ? null : Number(lot.unit_price));
