import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { Database } from "@/types/database";

// 통합 테스트 IT-USE-01~05 (docs/10_TEST_PLAN.md 5장, 4.1). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 서버 액션의 세션 클라이언트를 테스트 사용자로 로그인한 클라이언트로 바꿔 실제 RLS·RPC 경로로 호출한다.
// 케이스마다 새 매장을 만들어 독립 초기 상태에서 시작한다 (10_TEST_PLAN 2.3).
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Db = SupabaseClient<Database>;
let current: Db;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { recordDailySales } = await import("./sales");
const { getSalesDay } = await import("@/lib/queries/sales");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[sales.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const T = todayKST(); // 서버 기준일. 묶음 날짜는 T 상대값 (10_TEST_PLAN 2.3)

async function freshStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `sales-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "판매 매장" }).select("id").single().throwOnError();
  current = db;
  const storeId = store.id;

  const ingredient = async (name: string) =>
    (await db.from("ingredients").insert({ store_id: storeId, name, unit: "g", default_shelf_days: 3 }).select("id").single().throwOnError()).data.id;
  const menu = async (name: string, recipe: [string, number][]) => {
    const { data } = await db.from("menus").insert({ store_id: storeId, name, price: 8000 }).select("id").single().throwOnError();
    await db.from("recipe_items").insert(recipe.map(([ingredient_id, qty]) => ({ store_id: storeId, menu_id: data.id, ingredient_id, qty }))).throwOnError();
    return data.id;
  };
  // 입고는 receive_stock RPC로만 (AGENTS 3)
  const receive = async (ingredient_id: string, quantity: number, expiresAt: string, receivedAt = addDays(T, -2)) =>
    ((await db
      .rpc("receive_stock", {
        p_store_id: storeId,
        p_ref_type: "manual",
        p_ref_id: null as unknown as string,
        p_lots: [{ ingredient_id, quantity, unit_price: null, received_at: receivedAt, expires_at: expiresAt, expiry_source: "manual" }],
      })
      .throwOnError()).data as unknown as string[])[0];
  const remaining = async (lot: string) => Number((await db.from("stock_lots").select("remaining").eq("id", lot).single().throwOnError()).data.remaining);
  const count = async (table: "sales_days" | "sales" | "stock_movements", filter: Record<string, string> = {}) => {
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("store_id", storeId);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    return (await q.throwOnError()).count;
  };
  return { db, storeId, ingredient, menu, receive, remaining, count };
}

// 2.3 공통 양파: X 경과(T−1) 500g, A(T+1) 500g, B(T+3) 300g, C(T+4) 200g → 사용 가능 1000g
async function onionFixture() {
  const s = await freshStore();
  const onion = await s.ingredient("양파");
  const X = await s.receive(onion, 500, addDays(T, -1), addDays(T, -4));
  const A = await s.receive(onion, 500, addDays(T, 1), addDays(T, -2));
  const B = await s.receive(onion, 300, addDays(T, 3), addDays(T, -1));
  const C = await s.receive(onion, 200, addDays(T, 4), addDays(T, -1));
  const menu = await s.menu("양파볶음", [[onion, 100]]);
  return { ...s, onion, menu, X, A, B, C };
}

// record_daily_sales 호출만 세어 두고, 호출 직전(= 계획 완료 직후)에 다른 요청의 변경을 커밋할 수 있게 한다.
// 응답·오류는 목으로 만들지 않는다 (10_TEST_PLAN 4.1)
function interceptSalesRpc(db: Db, beforeEach: (() => PromiseLike<unknown>)[]) {
  const rpc = db.rpc.bind(db);
  let calls = 0;
  vi.spyOn(db, "rpc").mockImplementation(((fn: string, args: object) => {
    if (fn !== "record_daily_sales") return rpc(fn as never, args as never);
    calls += 1;
    const competitor = beforeEach.shift();
    return Promise.resolve(competitor?.()).then(() => rpc(fn as never, args as never));
  }) as never);
  return { calls: () => calls, rpc };
}

describe.skipIf(!up)("actions/sales (IT-USE)", () => {
  it("IT-USE 보조(F-02 정상): 양파 100g 메뉴 7개 → A 500g + B 200g 차감, X 유지, 판매·이력 저장", async () => {
    const s = await onionFixture();
    const res = await recordDailySales({ soldOn: T, sales: [{ menuId: s.menu, qty: 7 }] });
    expect(res).toMatchObject({ ok: true, data: { consumed: [{ ingredientId: s.onion, qty: 700 }], shortages: [] } });
    expect([await s.remaining(s.X), await s.remaining(s.A), await s.remaining(s.B), await s.remaining(s.C)]).toEqual([500, 0, 100, 200]);
    expect(await s.count("sales_days")).toBe(1);
    expect(await s.count("sales")).toBe(1);
    expect(await s.count("stock_movements", { type: "use" })).toBe(2);

    const day = await getSalesDay(T);
    expect(day).toMatchObject({ closed: true, items: [{ menuId: s.menu, name: "양파볶음", qty: 7 }], shortages: [] });
  });

  it("IT-USE-01: 재고 부족 (12개 = 1200g, 사용 가능 1000g) → 1000g만 차감 + 부족 200g 반환·저장", async () => {
    const s = await onionFixture();
    const res = await recordDailySales({ soldOn: T, sales: [{ menuId: s.menu, qty: 12 }] });
    expect(res).toMatchObject({
      ok: true,
      data: { consumed: [{ ingredientId: s.onion, qty: 1000 }], shortages: [{ ingredientId: s.onion, name: "양파", unit: "g", requiredQty: 1200, shortQty: 200 }] },
    });
    expect([await s.remaining(s.X), await s.remaining(s.A), await s.remaining(s.B), await s.remaining(s.C)]).toEqual([500, 0, 0, 0]);
    // 새로고침해도 마감 부족 기록이 남는다 (E2E-03)
    expect((await getSalesDay(T)).shortages).toEqual([{ ingredientId: s.onion, name: "양파", unit: "g", requiredQty: 1200, shortQty: 200 }]);
  });

  it("IT-USE-02: 미래 날짜 → VALIDATION, 마감·차감 없음", async () => {
    const s = await onionFixture();
    const res = await recordDailySales({ soldOn: addDays(T, 1), sales: [{ menuId: s.menu, qty: 1 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { soldOn: "미래 날짜는 입력할 수 없어요" } } });
    expect(await s.count("sales_days")).toBe(0);
    expect(await s.remaining(s.A)).toBe(500);
  });

  it("IT-USE-03: 이미 마감한 날짜 다시 저장 (FR-USE-06 미구현) → CONFLICT, 추가 차감 없음", async () => {
    const s = await onionFixture();
    expect((await recordDailySales({ soldOn: T, sales: [{ menuId: s.menu, qty: 3 }] })).ok).toBe(true);
    const again = await recordDailySales({ soldOn: T, sales: [{ menuId: s.menu, qty: 2 }] });
    expect(again).toMatchObject({ ok: false, error: { code: "CONFLICT", message: "이미 마감한 날짜예요" } });
    expect(await s.remaining(s.A)).toBe(200);
    expect(await s.count("sales_days")).toBe(1);
    expect(await s.count("stock_movements", { type: "use" })).toBe(1);
  });

  it("IT-USE-04: 경과 묶음만 남은 재료 → 차감 없음, 부족으로 기록", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const X = await s.receive(onion, 500, addDays(T, -1), addDays(T, -4));
    const menu = await s.menu("양파볶음", [[onion, 100]]);
    const res = await recordDailySales({ soldOn: T, sales: [{ menuId: menu, qty: 3 }] });
    expect(res).toMatchObject({ ok: true, data: { consumed: [], shortages: [{ ingredientId: onion, requiredQty: 300, shortQty: 300 }] } });
    expect(await s.remaining(X)).toBe(500);
    expect(await s.count("stock_movements", { type: "use" })).toBe(0);
    expect((await getSalesDay(T)).shortages).toMatchObject([{ ingredientId: onion, shortQty: 300 }]);
  });

  // 4.1: P/Q 각 500g(입고 T−2, 기한 T+3), 메뉴 1인분 P 100g·Q 300g, 1개 판매
  async function pqFixture() {
    const s = await freshStore();
    const P = await s.ingredient("P재료");
    const Q = await s.ingredient("Q재료");
    const lotP = await s.receive(P, 500, addDays(T, 3));
    const lotQ = await s.receive(Q, 500, addDays(T, 3));
    const menu = await s.menu("PQ메뉴", [[P, 100], [Q, 300]]);
    return { ...s, P, Q, lotP, lotQ, menu };
  }

  it("IT-USE-05: 계획 직후 다른 요청이 Q 250g 폐기 → 1회 충돌 뒤 재계획(Q 250g·부족 50g)으로 성공, 기록 1세트", async () => {
    const s = await pqFixture();
    const spy = interceptSalesRpc(s.db, [
      () => spy.rpc("record_waste", { p_store_id: s.storeId, p_lot_id: s.lotQ, p_qty: 250, p_reason: "spoiled", p_memo: "다른 기기" }).throwOnError(),
    ]);
    const res = await recordDailySales({ soldOn: T, sales: [{ menuId: s.menu, qty: 1 }] });
    vi.restoreAllMocks();

    expect(spy.calls()).toBe(2);
    expect(res).toMatchObject({ ok: true, data: { shortages: [{ ingredientId: s.Q, requiredQty: 300, shortQty: 50 }] } });
    expect(await s.remaining(s.lotP)).toBe(400);
    expect(await s.remaining(s.lotQ)).toBe(0);
    expect(await s.count("sales_days")).toBe(1);
    expect(await s.count("sales")).toBe(1);
    expect(await s.count("stock_movements", { type: "use" })).toBe(2); // P −100, Q −250 (실패 시도 이력 없음)
    expect(await s.count("stock_movements", { type: "waste" })).toBe(1);
  });

  it("IT-USE-05 재충돌 변형: 재계획 직후 100g 더 폐기 → 2회 시도 후 STOCK_CONFLICT, 이 액션의 기록 0건", async () => {
    const s = await pqFixture();
    const waste = (qty: number) => () =>
      spy.rpc("record_waste", { p_store_id: s.storeId, p_lot_id: s.lotQ, p_qty: qty, p_reason: "spoiled", p_memo: "다른 기기" }).throwOnError();
    const spy = interceptSalesRpc(s.db, [waste(250), waste(100)]);
    const res = await recordDailySales({ soldOn: T, sales: [{ menuId: s.menu, qty: 1 }] });
    vi.restoreAllMocks();

    expect(spy.calls()).toBe(2);
    expect(res).toMatchObject({ ok: false, error: { code: "STOCK_CONFLICT" } });
    expect(await s.remaining(s.lotP)).toBe(500);
    expect(await s.remaining(s.lotQ)).toBe(150);
    expect(await s.count("sales_days")).toBe(0);
    expect(await s.count("sales")).toBe(0);
    expect(await s.count("stock_movements", { type: "use" })).toBe(0);
    expect(await s.count("stock_movements", { type: "waste" })).toBe(2); // 다른 요청의 폐기만 남음
  });

  it("IT-USE 보조: 비활성·다른 매장 메뉴 → VALIDATION sales.N.menuId", async () => {
    const other = await onionFixture();
    const s = await onionFixture();
    await s.db.from("menus").update({ is_active: false }).eq("id", s.menu).throwOnError();
    const res = await recordDailySales({ soldOn: T, sales: [{ menuId: s.menu, qty: 1 }, { menuId: other.menu, qty: 1 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { "sales.0.menuId": "판매할 수 없는 메뉴예요", "sales.1.menuId": "판매할 수 없는 메뉴예요" } } });
    expect(await s.count("sales_days")).toBe(0);
  });

  it("IT-USE 보조: getSalesDay — 마감 전 qty 0, 최근 7일 판매량 순, 비활성 메뉴 제외", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    await s.receive(onion, 5000, addDays(T, 5));
    const a = await s.menu("가 메뉴", [[onion, 10]]);
    const b = await s.menu("나 메뉴", [[onion, 10]]);
    const off = await s.menu("다 메뉴", [[onion, 10]]);
    await s.db.from("menus").update({ is_active: false }).eq("id", off).throwOnError();
    expect((await recordDailySales({ soldOn: addDays(T, -1), sales: [{ menuId: b, qty: 5 }, { menuId: a, qty: 1 }] })).ok).toBe(true);

    const day = await getSalesDay(T);
    expect(day).toEqual({ soldOn: T, closed: false, items: [{ menuId: b, name: "나 메뉴", qty: 0 }, { menuId: a, name: "가 메뉴", qty: 0 }], shortages: [] });
  });

  it("IT-USE 보조: getSalesDay — 마감한 날은 그 뒤 비활성화한 메뉴의 판매 수량도 보여 줌 (PR #41 리뷰)", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    await s.receive(onion, 5000, addDays(T, 5));
    const a = await s.menu("가 메뉴", [[onion, 10]]);
    const b = await s.menu("나 메뉴", [[onion, 10]]);
    expect((await recordDailySales({ soldOn: T, sales: [{ menuId: a, qty: 2 }, { menuId: b, qty: 3 }] })).ok).toBe(true);
    await s.db.from("menus").update({ is_active: false }).eq("id", b).throwOnError();

    expect((await getSalesDay(T)).items).toEqual([{ menuId: b, name: "나 메뉴", qty: 3 }, { menuId: a, name: "가 메뉴", qty: 2 }]);
    // 마감 전 날짜에는 비활성 메뉴가 나오지 않는다
    expect((await getSalesDay(addDays(T, -1))).items).toEqual([{ menuId: a, name: "가 메뉴", qty: 0 }]);
  });
});
