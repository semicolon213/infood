import "server-only";
import { todayKST } from "@/lib/date";
import { addDays, daysLeft } from "@/lib/stock/expiry";
import { createClient } from "@/lib/supabase/server";
import type { IngredientDetail, IngredientFilter, IngredientSummary, UUID } from "@/types/contracts";
import type { Database } from "@/types/database";
import { getSessionStore } from "./store";

// 08_API_SPEC 3장 — WBS 3.1b. 매장은 세션에서 구하고(AGENTS 6), 재고 수치는 get_ingredient_stock(07_DB 3.4)으로 구한다.

type Db = Awaited<ReturnType<typeof createClient>>;
// rpc() 결과가 any로 추론되어 생성 타입을 직접 붙인다
type StockRow = Database["public"]["Functions"]["get_ingredient_stock"]["Returns"][number];

const SOON_DAYS = 3; // 임박: D-0 ~ D-3 (lib/stock/status.ts와 같은 기준)

// FR-ING-03: 이름 순, q = 이름 검색, status = soon(임박 묶음) | expired(경과 묶음) | low(부족, BR-05)
export async function getIngredients(filter: IngredientFilter = {}): Promise<IngredientSummary[]> {
  const { store } = await getSessionStore();
  if (!store) return [];
  const db = await createClient();
  const today = todayKST();

  let list = await loadSummaries(db, store.id, today);
  const q = filter.q?.trim().toLowerCase();
  if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
  if (filter.status === "low") list = list.filter((i) => i.isLow);
  if (filter.status === "expired") list = list.filter((i) => i.expiredRemaining > 0);
  if (filter.status === "soon") {
    // nearestExpiresAt은 경과 묶음까지 포함하므로 임박 묶음이 따로 있는지 묶음에서 확인한다
    const { data, error } = await db
      .from("stock_lots")
      .select("ingredient_id")
      .eq("store_id", store.id)
      .gt("remaining", 0)
      .gte("expires_at", today)
      .lte("expires_at", addDays(today, SOON_DAYS));
    if (error) throw error;
    const soon = new Set(data.map((l) => l.ingredient_id));
    list = list.filter((i) => soon.has(i.id));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// FR-ING-02: 묶음 목록 포함. 없거나 다른 매장·비활성 재료면 null
export async function getIngredient(id: UUID): Promise<IngredientDetail | null> {
  const { store } = await getSessionStore();
  if (!store) return null;
  const db = await createClient();
  const today = todayKST();

  const [summary] = await loadSummaries(db, store.id, today, id);
  if (!summary) return null;

  const { data, error } = await db
    .from("stock_lots")
    .select("id, quantity, remaining, unit_price, received_at, expires_at, expiry_source")
    .eq("store_id", store.id)
    .eq("ingredient_id", id)
    .gt("remaining", 0)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: true });
  if (error) throw error;

  const lots = data.map((l) => ({
    id: l.id,
    quantity: Number(l.quantity),
    remaining: Number(l.remaining),
    unitPrice: l.unit_price === null ? null : Number(l.unit_price),
    receivedAt: l.received_at,
    expiresAt: l.expires_at,
    expirySource: l.expiry_source,
    daysLeft: l.expires_at === null ? null : daysLeft(l.expires_at, today),
  }));
  return { ...summary, lots };
}

// 재고 수치(RPC) + 재료 속성·환산 단위(테이블). id를 주면 그 재료만
async function loadSummaries(db: Db, storeId: UUID, today: string, id?: UUID): Promise<IngredientSummary[]> {
  let stock = db.rpc("get_ingredient_stock", { p_store_id: storeId, p_today: today });
  let meta = db
    .from("ingredients")
    .select("id, category, storage, default_shelf_days, track_expiry, ingredient_units(unit_name, factor)")
    .eq("store_id", storeId)
    .eq("is_active", true);
  if (id) {
    stock = stock.eq("ingredient_id", id);
    meta = meta.eq("id", id);
  }
  const [s, m] = await Promise.all([stock, meta]);
  if (s.error) throw s.error; // 조회 실패는 Next 오류 화면으로 (조회 함수는 ActionResult를 쓰지 않음)
  if (m.error) throw m.error;

  const byId = new Map(m.data.map((r) => [r.id, r]));
  return (s.data as StockRow[]).flatMap((r): IngredientSummary[] => {
    const i = byId.get(r.ingredient_id);
    if (!i) return [];
    // RPC 반환 타입은 not null로 생성되지만 묶음이 없으면 null이다
    const nearest = (r.nearest_expires_at as string | null) ?? null;
    return [
      {
        id: r.ingredient_id,
        name: r.name,
        category: i.category,
        unit: r.unit,
        storage: i.storage,
        totalRemaining: Number(r.total_remaining),
        availableRemaining: Number(r.available_remaining),
        expiredRemaining: Number(r.expired_remaining),
        minStock: Number(r.min_stock),
        targetStock: r.target_stock === null ? null : Number(r.target_stock),
        isLow: r.is_low,
        nearestExpiresAt: nearest,
        daysLeft: nearest === null ? null : daysLeft(nearest, today),
        defaultShelfDays: i.default_shelf_days,
        trackExpiry: i.track_expiry,
        units: i.ingredient_units
          .map((u) => ({ unitName: u.unit_name, factor: Number(u.factor) }))
          .sort((a, b) => a.unitName.localeCompare(b.unitName, "ko")),
      },
    ];
  });
}
