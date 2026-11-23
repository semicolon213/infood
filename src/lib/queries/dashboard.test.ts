import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import { weekStart, weeklyWaste } from "@/lib/stock/waste";
import type { Database } from "@/types/database";

// 통합 테스트 IT-DASH-01·02·04, 확장 IT-X03 (docs/10_TEST_PLAN.md 5장·9.3). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 세션 클라이언트를 테스트 사용자로 로그인한 클라이언트로 바꿔 실제 RLS 경로로 조회한다.
// 케이스마다 새 매장을 만들어 독립 초기 상태에서 시작한다 (10_TEST_PLAN 2.3).
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Db = SupabaseClient<Database>;
let current: Db;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));

const { getDashboard } = await import("./dashboard");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[dashboard.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const T = todayKST(); // 서버 기준일. 묶음 날짜는 T 상대값 (10_TEST_PLAN 2.3)

async function freshStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `dash-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "대시보드 매장" }).select("id").single().throwOnError();
  current = db;
  const storeId = store.id;

  type Extra = Partial<Database["public"]["Tables"]["ingredients"]["Insert"]>;
  const ingredient = async (name: string, extra: Extra = {}) =>
    (await db.from("ingredients").insert({ store_id: storeId, name, unit: "g", default_shelf_days: 3, ...extra }).select("id").single().throwOnError()).data.id;
  // 입고는 receive_stock RPC로만 (AGENTS 3)
  const receive = async (ingredient_id: string, quantity: number, expiresAt: string | null, receivedAt = addDays(T, -3)) =>
    ((await db
      .rpc("receive_stock", {
        p_store_id: storeId,
        p_ref_type: "manual",
        p_ref_id: null as unknown as string,
        p_lots: [{ ingredient_id, quantity, unit_price: null, received_at: receivedAt, expires_at: expiresAt, expiry_source: expiresAt ? "manual" : null }],
      })
      .throwOnError()).data as unknown as string[])[0];
  return { storeId, ingredient, receive };
}

// 2.3 공통 양파 X(T−1, 500g) / A(T+1, 500g) / B(T+3, 300g) / C(T+4, 200g), 최소 1200g·적정 2000g
async function onionFixture() {
  const s = await freshStore();
  const onion = await s.ingredient("양파", { min_stock: 1200, target_stock: 2000 });
  const X = await s.receive(onion, 500, addDays(T, -1), addDays(T, -4));
  const A = await s.receive(onion, 500, addDays(T, 1), addDays(T, -2));
  const B = await s.receive(onion, 300, addDays(T, 3), addDays(T, -1));
  const C = await s.receive(onion, 200, addDays(T, 4), addDays(T, -1));
  return { ...s, onion, X, A, B, C };
}

describe.skipIf(!up)("queries/dashboard (IT-DASH)", () => {
  it("IT-DASH-01: 임박은 D(D-0)·A(D-1)·B(D-3) 기한 순, 경과 X는 따로, C(D-4)·기한 없는 묶음은 제외", async () => {
    const s = await onionFixture();
    const tofu = await s.ingredient("두부");
    const D = await s.receive(tofu, 2000, T);
    const salt = await s.ingredient("소금", { track_expiry: false, default_shelf_days: null });
    await s.receive(salt, 1000, null);

    const dash = await getDashboard();
    expect(dash.today).toBe(T);
    expect(dash.expiringLots).toEqual([
      { lotId: D, ingredientId: tofu, name: "두부", remaining: 2000, unit: "g", expiresAt: T, daysLeft: 0 },
      { lotId: s.A, ingredientId: s.onion, name: "양파", remaining: 500, unit: "g", expiresAt: addDays(T, 1), daysLeft: 1 },
      { lotId: s.B, ingredientId: s.onion, name: "양파", remaining: 300, unit: "g", expiresAt: addDays(T, 3), daysLeft: 3 },
    ]);
    expect(dash.expiredLots).toEqual([
      { lotId: s.X, ingredientId: s.onion, name: "양파", remaining: 500, unit: "g", expiresAt: addDays(T, -1), daysLeft: -1 },
    ]);
    expect([...dash.expiringLots, ...dash.expiredLots].map((l) => l.lotId)).not.toContain(s.C);
  });

  it("IT-DASH-02: 양파 총잔량 1500g이어도 사용 가능 1000g < 최소 1200g이면 부족", async () => {
    const s = await onionFixture();
    const enough = await s.ingredient("대파", { min_stock: 100 });
    await s.receive(enough, 500, addDays(T, 5));
    await s.ingredient("후추"); // 최소 재고 0 → 판정하지 않음

    const dash = await getDashboard();
    expect(dash.lowStock).toEqual([{ ingredientId: s.onion, name: "양파", unit: "g", availableRemaining: 1000, minStock: 1200 }]);
  });

  it("IT-DASH-04: 묶음·부족 재료가 없는 매장 → 각 목록 빈 배열, 폐기 금액 0원", async () => {
    const s = await freshStore();
    await s.ingredient("양파");
    expect(await getDashboard()).toEqual({ today: T, expiringLots: [], expiredLots: [], lowStock: [], weeklyWaste: weeklyWaste([], T) });
    expect((await getDashboard()).weeklyWaste).toMatchObject({ thisWeek: 0, lastWeek: 0 });
  });

  it("IT-X03: 이번 주·지난주 폐기 금액 = 폐기량 × 묶음 단가 (주 시작은 KST 월요일, 단가 없는 묶음 0원)", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const tofu = await s.ingredient("두부");
    const lotWithPrice = async (ingredient_id: string, quantity: number, unit_price: number | null) =>
      ((await current
        .rpc("receive_stock", {
          p_store_id: s.storeId,
          p_ref_type: "manual",
          p_ref_id: null as unknown as string,
          p_lots: [{ ingredient_id, quantity, unit_price, received_at: addDays(T, -10), expires_at: addDays(T, 5), expiry_source: "manual" }],
        })
        .throwOnError()).data as unknown as string[])[0];
    const onionLot = await lotWithPrice(onion, 1000, 1.5);
    const tofuLot = await lotWithPrice(tofu, 10, null);

    // 이번 주(오늘): 폐기는 record_waste RPC로만 (AGENTS 3)
    const waste = (lot: string, qty: number) =>
      current.rpc("record_waste", { p_store_id: s.storeId, p_lot_id: lot, p_qty: qty, p_reason: "spoiled", p_memo: null as unknown as string }).throwOnError();
    await waste(onionLot, 300); // 450원
    await waste(tofuLot, 2); // 단가 없음 → 0원
    // 지난주: RPC는 기록 시각을 now()로 쓰므로, 지난주 이력은 시각을 정해 이력만 추가한다 (잔량은 바꾸지 않는 테스트 준비 데이터)
    const lastWeekDay = addDays(weekStart(T), -3); // 지난주 금요일
    await current.from("stock_movements").insert({
      store_id: s.storeId, ingredient_id: onion, lot_id: onionLot, type: "waste", delta: -200, reason: "expired",
      ref_type: "waste", created_at: `${lastWeekDay}T23:30:00+09:00`, // KST 기준 그날 (UTC로는 같은 날 14:30)
    }).throwOnError();
    // 지지난주 이력은 범위 밖
    await current.from("stock_movements").insert({
      store_id: s.storeId, ingredient_id: onion, lot_id: onionLot, type: "waste", delta: -500, reason: "expired",
      ref_type: "waste", created_at: `${addDays(weekStart(T), -8)}T12:00:00+09:00`,
    }).throwOnError();

    const { weeklyWaste: w } = await getDashboard();
    expect(w).toMatchObject({ thisWeek: 450, lastWeek: 300 });
    expect(w!.daily[0].date).toBe(weekStart(T));
    expect(w!.daily.at(-1)).toEqual({ date: T, amount: 450 });
    expect(w!.daily.reduce((sum, d) => sum + d.amount, 0)).toBe(450);
  });

  it("IT-DASH-04: 조회 실패는 빈 대시보드로 위장하지 않고 예외로 전달", async () => {
    await freshStore();
    const db = current;
    vi.spyOn(db, "rpc").mockReturnValue({
      eq: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    } as never);
    await expect(getDashboard()).rejects.toMatchObject({ message: "boom" });
    vi.restoreAllMocks();
  });
});
