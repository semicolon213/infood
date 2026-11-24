import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { Database } from "@/types/database";
import { loadRecommendSnapshot } from "./recommendations";

// 추천 입력의 최근 7일 판매량 (FR-REC-01, WBS 5.2 점검). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 행을 가져와 더하면 PostgREST 1000행 제한(config.toml max_rows)에서 소리 없이 잘려서 DB에서 합산한다 (0011).
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Db = SupabaseClient<Database>;

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[recommendations.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const T = todayKST();

async function freshStore() {
  const db: Db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `rec-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "추천 매장" }).select("id").single().throwOnError();
  const menu = async (name: string) => (await db.from("menus").insert({ store_id: store.id, name, price: 8000 }).select("id").single().throwOnError()).data.id;
  // 판매 기록은 RPC로만 (0009). 레시피 없는 메뉴라 차감 계획은 비어 있다
  const order = async (soldOn: string, externalId: string, items: { menu_id: string; qty: number }[]) =>
    (await db
      .rpc("record_sale_order", { p_store_id: store.id, p_sold_on: soldOn, p_source: "pos", p_external_id: externalId, p_items: items, p_plan: [], p_shortages: [] })
      .throwOnError()).data!;
  return { db, storeId: store.id, menu, order };
}

describe.skipIf(!up)("lib/queries/recommendations", () => {
  it("IT-REC 보조(5.2): 최근 7일 판매량 — 주문 1000건 넘어도 전부 합산, 판매 마감 포함, 취소·기간 밖 제외, 다른 매장 0건", async () => {
    const s = await freshStore();
    const A = await s.menu("김치찌개");
    const B = await s.menu("된장찌개");

    // 포스 주문 1,050건: 오늘 A 1개씩, 어제 A 1개 + B 2개씩
    const jobs = Array.from({ length: 1050 }, (_, i) =>
      i < 600 ? () => s.order(T, `t-${i}`, [{ menu_id: A, qty: 1 }]) : () => s.order(addDays(T, -1), `y-${i}`, [{ menu_id: A, qty: 1 }, { menu_id: B, qty: 2 }]),
    );
    for (let i = 0; i < jobs.length; i += 50) await Promise.all(jobs.slice(i, i + 50).map((j) => j()));

    // 판매 마감(주문이 없는 날짜), 취소한 주문, 7일 밖 주문
    await s.db
      .rpc("record_daily_sales", { p_store_id: s.storeId, p_sold_on: addDays(T, -6), p_sales: [{ menu_id: B, qty: 5 }], p_plan: [], p_shortages: [] })
      .throwOnError();
    const cancelled = await s.order(addDays(T, -2), "c-1", [{ menu_id: A, qty: 100 }]);
    await s.db.rpc("cancel_sale_order", { p_store_id: s.storeId, p_order_id: cancelled }).throwOnError();
    await s.order(addDays(T, -7), "old-1", [{ menu_id: B, qty: 100 }]);

    const { sales7d } = await loadRecommendSnapshot(s.db as never, s.storeId, T);
    const byMenu = Object.fromEntries(sales7d.map((x) => [x.menuId, x.qty]));
    expect(byMenu).toEqual({ [A]: 600 + 450, [B]: 450 * 2 + 5 });

    // 다른 매장 ID로는 RLS로 0건
    const other = await freshStore();
    expect((await loadRecommendSnapshot(other.db as never, s.storeId, T)).sales7d).toEqual([]);
  }, 120_000);
});
