import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import { StockHistoryFilter } from "@/types/contracts";
import type { Database } from "@/types/database";

// 통합 테스트 IT-USE-06~10 (docs/10_TEST_PLAN.md 5장, 4.1). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
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

const { recordUsage, recordWaste } = await import("./usage");
const { getStockHistory } = await import("@/lib/queries/usage");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[usage.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const T = todayKST(); // 서버 기준일. 묶음 날짜는 T 상대값 (10_TEST_PLAN 2.3)

async function freshStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `usage-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "사용 매장" }).select("id").single().throwOnError();
  current = db;
  const storeId = store.id;

  const ingredient = async (name: string, unit: "g" | "ml" | "ea" = "g") =>
    (await db.from("ingredients").insert({ store_id: storeId, name, unit, default_shelf_days: 3 }).select("id").single().throwOnError()).data.id;
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
  const count = async (table: "usage_records" | "stock_movements", filter: Record<string, string> = {}) => {
    let q = db.from(table).select("id", { count: "exact", head: true }).eq("store_id", storeId);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    return (await q.throwOnError()).count;
  };
  return { db, storeId, ingredient, receive, remaining, count };
}

// 지정한 RPC 호출만 세어 두고, 호출 직전(= 계획·확인 완료 직후)에 다른 요청의 변경을 커밋할 수 있게 한다.
// 응답·오류는 목으로 만들지 않는다 (10_TEST_PLAN 4.1)
function interceptRpc(db: Db, name: string, before: (() => PromiseLike<unknown>)[]) {
  const rpc = db.rpc.bind(db);
  let calls = 0;
  vi.spyOn(db, "rpc").mockImplementation(((fn: string, args: object) => {
    if (fn !== name) return rpc(fn as never, args as never);
    calls += 1;
    const competitor = before.shift();
    return Promise.resolve(competitor?.()).then(() => rpc(fn as never, args as never));
  }) as never);
  return { calls: () => calls, rpc };
}

describe.skipIf(!up)("actions/usage (IT-USE)", () => {
  it("IT-USE-06: 직원 식사 2품목(kg 환산 포함), 메모 → FEFO 차감, usage_records 2건·메모 저장", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const egg = await s.ingredient("계란", "ea");
    const A = await s.receive(onion, 500, addDays(T, 1), addDays(T, -3));
    const B = await s.receive(onion, 500, addDays(T, 3), addDays(T, -1));
    const E = await s.receive(egg, 30, addDays(T, 7));
    const res = await recordUsage({
      usedOn: T,
      items: [
        { ingredientId: onion, qty: 0.7, unit: "kg", memo: "직원 식사" },
        { ingredientId: egg, qty: 4, memo: "직원 식사" },
      ],
    });
    expect(res).toMatchObject({ ok: true, data: { shortages: [] } });
    if (res.ok) expect(res.data.recordIds).toHaveLength(2);
    expect([await s.remaining(A), await s.remaining(B), await s.remaining(E)]).toEqual([0, 300, 26]);
    const { data: recs } = await s.db.from("usage_records").select("ingredient_id, qty, short_qty, memo").eq("store_id", s.storeId).throwOnError();
    expect(recs).toEqual(
      expect.arrayContaining([
        { ingredient_id: onion, qty: 700, short_qty: 0, memo: "직원 식사" },
        { ingredient_id: egg, qty: 4, short_qty: 0, memo: "직원 식사" },
      ]),
    );
    expect(await s.count("stock_movements", { type: "use", ref_type: "usage" })).toBe(3); // A·B·E
  });

  it("IT-USE-07: 사용량 > 사용 가능 재고 → 가능한 만큼 차감 + shortages 반환, short_qty 저장 (경과 묶음 유지)", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const X = await s.receive(onion, 500, addDays(T, -1), addDays(T, -4));
    const A = await s.receive(onion, 800, addDays(T, 2));
    const res = await recordUsage({ usedOn: T, items: [{ ingredientId: onion, qty: 1000 }] });
    expect(res).toMatchObject({ ok: true, data: { shortages: [{ ingredientId: onion, name: "양파", unit: "g", requiredQty: 1000, shortQty: 200 }] } });
    expect([await s.remaining(X), await s.remaining(A)]).toEqual([500, 0]);
    const { data: rec } = await s.db.from("usage_records").select("qty, short_qty").eq("store_id", s.storeId).single().throwOnError();
    expect(rec).toEqual({ qty: 1000, short_qty: 200 });
  });

  it("IT-USE-08: 경과 묶음 전량 폐기, reason=expired → 잔량 0, 경과 묶음 목록에서 사라짐", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const X = await s.receive(onion, 500, addDays(T, -1), addDays(T, -4));
    const res = await recordWaste({ lotId: X, qty: 500, reason: "expired" });
    expect(res).toEqual({ ok: true, data: { lotId: X, remaining: 0 } });
    // 대시보드 경과 목록 조건(07_DB 6장: remaining > 0 and expires_at < today)에 더 이상 걸리지 않는다. getDashboard는 4.1b
    const { data: expired } = await s.db.from("stock_lots").select("id").eq("store_id", s.storeId).gt("remaining", 0).lt("expires_at", T).throwOnError();
    expect(expired).toEqual([]);
    const { data: move } = await s.db.from("stock_movements").select("delta, reason, memo").eq("lot_id", X).eq("type", "waste").single().throwOnError();
    expect(move).toEqual({ delta: -500, reason: "expired", memo: null }); // 메모 없으면 null (사용 기록과 같게)
  });

  it("IT-USE-09: 폐기량 > 현재 잔량 (입력 실수) → VALIDATION fields.qty, RPC 호출 없음", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const A = await s.receive(onion, 300, addDays(T, 2));
    const spy = interceptRpc(s.db, "record_waste", []);
    const res = await recordWaste({ lotId: A, qty: 301, reason: "mistake" });
    vi.restoreAllMocks();
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { qty: "남은 양(300)보다 많이 폐기할 수 없어요" } } });
    expect(spy.calls()).toBe(0);
    expect(await s.remaining(A)).toBe(300);
  });

  // 4.1: P/Q 각 500g(입고 T−2, 기한 T+3), 사용 P 100g·Q 300g, 메모
  async function pqFixture() {
    const s = await freshStore();
    const P = await s.ingredient("P재료");
    const Q = await s.ingredient("Q재료");
    const lotP = await s.receive(P, 500, addDays(T, 3));
    const lotQ = await s.receive(Q, 500, addDays(T, 3));
    const use = () => recordUsage({ usedOn: T, items: [{ ingredientId: P, qty: 100, memo: "시식" }, { ingredientId: Q, qty: 300, memo: "시식" }] });
    return { ...s, P, Q, lotP, lotQ, use };
  }

  it("IT-USE-10: 계획 직후 다른 요청이 Q 250g 폐기 → 1회 충돌 뒤 재계획(Q 250g·부족 50g)으로 성공, 기록 1세트", async () => {
    const s = await pqFixture();
    const spy = interceptRpc(s.db, "record_usage", [
      () => spy.rpc("record_waste", { p_store_id: s.storeId, p_lot_id: s.lotQ, p_qty: 250, p_reason: "spoiled", p_memo: "다른 기기" }).throwOnError(),
    ]);
    const res = await s.use();
    vi.restoreAllMocks();

    expect(spy.calls()).toBe(2);
    expect(res).toMatchObject({ ok: true, data: { shortages: [{ ingredientId: s.Q, requiredQty: 300, shortQty: 50 }] } });
    expect(await s.remaining(s.lotP)).toBe(400);
    expect(await s.remaining(s.lotQ)).toBe(0);
    const { data: recs } = await s.db.from("usage_records").select("ingredient_id, qty, short_qty, memo").eq("store_id", s.storeId).throwOnError();
    expect(recs).toEqual(
      expect.arrayContaining([
        { ingredient_id: s.P, qty: 100, short_qty: 0, memo: "시식" },
        { ingredient_id: s.Q, qty: 300, short_qty: 50, memo: "시식" },
      ]),
    );
    expect(recs).toHaveLength(2); // 실패 시도의 기록 없음
    expect(await s.count("stock_movements", { type: "use" })).toBe(2);
    expect(await s.count("stock_movements", { type: "waste" })).toBe(1);
  });

  it("IT-USE-10 재충돌 변형: 재계획 직후 100g 더 폐기 → 2회 시도 후 STOCK_CONFLICT, 이 액션의 기록·차감 0건", async () => {
    const s = await pqFixture();
    const waste = (qty: number) => () =>
      spy.rpc("record_waste", { p_store_id: s.storeId, p_lot_id: s.lotQ, p_qty: qty, p_reason: "spoiled", p_memo: "다른 기기" }).throwOnError();
    const spy = interceptRpc(s.db, "record_usage", [waste(250), waste(100)]);
    const res = await s.use();
    vi.restoreAllMocks();

    expect(spy.calls()).toBe(2);
    expect(res).toMatchObject({ ok: false, error: { code: "STOCK_CONFLICT" } });
    expect(await s.remaining(s.lotP)).toBe(500);
    expect(await s.remaining(s.lotQ)).toBe(150);
    expect(await s.count("usage_records")).toBe(0);
    expect(await s.count("stock_movements", { type: "use" })).toBe(0);
    expect(await s.count("stock_movements", { type: "waste" })).toBe(2); // 다른 요청의 폐기만 남음
  });

  it("IT-USE 보조: 폐기 확인 뒤 다른 기기에서 잔량이 줄면 → STOCK_CONFLICT, 실패 폐기 이력 없음 (DB-13 서버 경로)", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const A = await s.receive(onion, 500, addDays(T, 2));
    const spy = interceptRpc(s.db, "record_waste", [
      () => spy.rpc("record_waste", { p_store_id: s.storeId, p_lot_id: A, p_qty: 250, p_reason: "spoiled", p_memo: "다른 기기" }),
    ]);
    const res = await recordWaste({ lotId: A, qty: 300, reason: "spoiled" });
    vi.restoreAllMocks();
    expect(res).toMatchObject({ ok: false, error: { code: "STOCK_CONFLICT" } });
    expect(await s.remaining(A)).toBe(250);
    expect(await s.count("stock_movements", { type: "waste" })).toBe(1);
  });

  it("IT-USE 보조: 같은 재료 여러 줄은 합쳐 기록 1건, 비활성·다른 매장 재료·없는 묶음 → NOT_FOUND", async () => {
    const other = await freshStore();
    const foreign = await other.ingredient("남의 양파");
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    await s.receive(onion, 1000, addDays(T, 2));
    const merged = await recordUsage({ usedOn: T, items: [{ ingredientId: onion, qty: 100, memo: "시식" }, { ingredientId: onion, qty: 0.2, unit: "kg", memo: "직원 식사" }] });
    expect(merged.ok && merged.data.recordIds).toHaveLength(1);
    const { data: rec } = await s.db.from("usage_records").select("qty, memo").eq("store_id", s.storeId).single().throwOnError();
    expect(rec).toEqual({ qty: 300, memo: "시식 / 직원 식사" });

    const res = await recordUsage({ usedOn: T, items: [{ ingredientId: onion, qty: 1 }, { ingredientId: foreign, qty: 1 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND", fields: { "items.1.ingredientId": "재료를 찾지 못했어요" } } });
    expect(await recordWaste({ lotId: crypto.randomUUID(), qty: 1, reason: "other" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("IT-USE 보조(UI-REG-10): 이력 조회 — 31일(양끝 포함) 정상·32일·역전 거부, 최신순, 종류 필터", async () => {
    expect(StockHistoryFilter.safeParse({ from: "2026-10-01", to: "2026-10-31" }).success).toBe(true);
    expect(StockHistoryFilter.safeParse({ from: "2026-10-01", to: "2026-11-01" }).error?.issues[0]).toMatchObject({ path: ["to"], message: "한 번에 31일까지 조회할 수 있어요" });
    expect(StockHistoryFilter.safeParse({ from: "2026-10-05", to: "2026-10-04" }).error?.issues[0]).toMatchObject({ path: ["to"], message: "종료일은 시작일 이후로 선택해 주세요" });
    await expect(getStockHistory({ from: "2026-10-01", to: "2026-11-01" })).rejects.toThrow();

    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const A = await s.receive(onion, 1000, addDays(T, 5), addDays(T, -5));
    expect((await recordUsage({ usedOn: addDays(T, -2), items: [{ ingredientId: onion, qty: 100, memo: "그제" }] })).ok).toBe(true);
    expect((await recordUsage({ usedOn: T, items: [{ ingredientId: onion, qty: 50 }] })).ok).toBe(true);
    expect((await recordWaste({ lotId: A, qty: 30, reason: "spoiled", memo: "물러짐" })).ok).toBe(true);

    const all = await getStockHistory({ from: addDays(T, -6), to: T });
    expect(all.map((h) => [h.date, h.type, h.qty])).toEqual([
      [T, "waste", 30], // 같은 날은 나중 기록이 먼저
      [T, "usage", 50],
      [addDays(T, -2), "usage", 100],
    ]);
    expect(all[0]).toMatchObject({ name: "양파", unit: "g", reason: "spoiled", memo: "물러짐", shortQty: 0 });
    expect((await getStockHistory({ from: addDays(T, -6), to: T, type: "usage" })).map((h) => h.type)).toEqual(["usage", "usage"]);
    expect(await getStockHistory({ from: addDays(T, -1), to: T, type: "waste" })).toHaveLength(1);
  });
});
