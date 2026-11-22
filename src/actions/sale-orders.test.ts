import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { Database } from "@/types/database";

// 주문별 판매 (WBS 4.8): 사이트 서버 액션과 포스 API가 같은 공통부로 재고를 FEFO 차감한다. 로컬 Supabase 필요
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL);
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ANON_KEY);

let current: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { recordSaleOrder } = await import("./sale-orders");
const { recordDailySales } = await import("./sales");
const { POST } = await import("@/app/api/pos/sales/route");
const { GET } = await import("@/app/api/pos/menus/route");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[sale-orders.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const T = todayKST();

async function freshStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `order-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "주문 매장" }).select("id").single().throwOnError();
  current = db;
  const storeId = store.id;
  const { data: ing } = await db.from("ingredients").insert({ store_id: storeId, name: "양파", unit: "g", default_shelf_days: 3 }).select("id").single().throwOnError();
  const { data: menu } = await db.from("menus").insert({ store_id: storeId, name: "제육볶음", price: 9000 }).select("id").single().throwOnError();
  await db.from("recipe_items").insert({ store_id: storeId, menu_id: menu.id, ingredient_id: ing.id, qty: 100 }).throwOnError();
  // 가까운 기한 A(T+1) 150g, 먼 기한 B(T+5) 500g
  const receive = async (quantity: number, expiresAt: string) =>
    ((await db.rpc("receive_stock", {
      p_store_id: storeId, p_ref_type: "manual", p_ref_id: null as unknown as string,
      p_lots: [{ ingredient_id: ing.id, quantity, unit_price: null, received_at: addDays(T, -1), expires_at: expiresAt, expiry_source: "manual" }],
    }).throwOnError()).data as unknown as string[])[0];
  const a = await receive(150, addDays(T, 1));
  const b = await receive(500, addDays(T, 5));
  const remaining = async (lot: string) => Number((await db.from("stock_lots").select("remaining").eq("id", lot).single().throwOnError()).data.remaining);
  const token = (await db.auth.getSession()).data.session!.access_token;
  return { db, menuId: menu.id, ingredientId: ing.id, a, b, remaining, token };
}

const pos = (token: string | null, body: unknown) =>
  POST(new Request("http://localhost/api/pos/sales", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));

describe.skipIf(!up)("주문별 판매 (WBS 4.8)", () => {
  it("사이트: 2인분 판매 → 가까운 기한부터 200g 차감, 기록 1건", async () => {
    const s = await freshStore();
    const res = await recordSaleOrder({ items: [{ menuId: s.menuId, qty: 2 }] });
    expect(res).toMatchObject({ ok: true, data: { duplicate: false, shortages: [] } });
    expect([await s.remaining(s.a), await s.remaining(s.b)]).toEqual([0, 450]);
    expect((await s.db.from("sale_orders").select("source")).data).toEqual([{ source: "web" }]);
  });

  it("재고보다 많이 팔면 있는 만큼 차감하고 부족을 알려 준다", async () => {
    const s = await freshStore();
    const res = await recordSaleOrder({ items: [{ menuId: s.menuId, qty: 7 }] });
    expect(res).toMatchObject({ ok: true, data: { shortages: [{ ingredientId: s.ingredientId, name: "양파", requiredQty: 700, shortQty: 50 }] } });
    expect([await s.remaining(s.a), await s.remaining(s.b)]).toEqual([0, 0]);
  });

  it("포스: 토큰 인증 → 차감, 같은 주문번호 재전송은 한 번만 반영", async () => {
    const s = await freshStore();
    const body = { externalId: "POS-0001", items: [{ menuId: s.menuId, qty: 1 }] };
    const first = await pos(s.token, body);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, data: { duplicate: false } });
    expect(await (await pos(s.token, body)).json()).toMatchObject({ ok: true, data: { duplicate: true } });
    expect(await s.remaining(s.a)).toBe(50);
    expect((await s.db.from("sale_orders").select("source, external_id")).data).toEqual([{ source: "pos", external_id: "POS-0001" }]);
  });

  it("포스: 토큰 없음 → 401, 다른 매장 메뉴 → VALIDATION, 메뉴 목록 조회", async () => {
    const s = await freshStore();
    const other = await freshStore();
    expect((await pos(null, { items: [{ menuId: s.menuId, qty: 1 }] })).status).toBe(401);
    expect(await (await pos(other.token, { items: [{ menuId: s.menuId, qty: 1 }] })).json()).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const menus = await (await GET(new Request("http://localhost/api/pos/menus", { headers: { authorization: `Bearer ${s.token}` } }))).json();
    expect(menus).toEqual({ ok: true, data: [{ id: s.menuId, name: "제육볶음", price: 9000 }] });
  });

  it("같은 날짜에 판매 마감과 주문별 판매를 섞으면 두 번 차감하지 않게 막는다", async () => {
    const s = await freshStore();
    expect((await recordSaleOrder({ items: [{ menuId: s.menuId, qty: 1 }] })).ok).toBe(true);
    expect(await recordDailySales({ soldOn: T, sales: [{ menuId: s.menuId, qty: 1 }] })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    const t = await freshStore();
    expect((await recordDailySales({ soldOn: T, sales: [{ menuId: t.menuId, qty: 1 }] })).ok).toBe(true);
    expect(await recordSaleOrder({ items: [{ menuId: t.menuId, qty: 1 }] })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});
