import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { Database } from "@/types/database";

// 확장 FR-MENU-03 (WBS 4.5): getMenus의 원가·원가율을 실제 DB 경로로 확인한다. 계산 자체는 UT-COST-01~03 (lib/stock/cost.test.ts).
// 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건). 케이스마다 새 매장 (10_TEST_PLAN 2.3)
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Db = SupabaseClient<Database>;
let current: Db;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));

const { getMenus } = await import("./menus");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[menus.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const T = todayKST();

async function freshStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `menu-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "원가 매장" }).select("id").single().throwOnError();
  current = db;
  const storeId = store.id;

  const ingredient = async (name: string, unit: "g" | "ea" = "g") =>
    (await db.from("ingredients").insert({ store_id: storeId, name, unit, default_shelf_days: 3 }).select("id").single().throwOnError()).data.id;
  // 입고는 receive_stock RPC로만 (AGENTS 3)
  const receive = (ingredient_id: string, quantity: number, unit_price: number | null, received_at: string) =>
    db
      .rpc("receive_stock", {
        p_store_id: storeId,
        p_ref_type: "manual",
        p_ref_id: null as unknown as string,
        p_lots: [{ ingredient_id, quantity, unit_price, received_at, expires_at: addDays(received_at, 3), expiry_source: "default" }],
      })
      .throwOnError();
  // 메뉴·레시피는 테스트 준비용으로 직접 넣는다 (재고 변경이 아님)
  const menu = async (name: string, price: number, recipe: { ingredient_id: string; qty: number }[]) => {
    const { data } = await db.from("menus").insert({ store_id: storeId, name, price }).select("id").single().throwOnError();
    if (recipe.length) {
      await db.from("recipe_items").insert(recipe.map((r) => ({ ...r, menu_id: data.id, store_id: storeId }))).throwOnError();
    }
    return data.id;
  };
  return { db, ingredient, receive, menu };
}

describe.skipIf(!up)("queries/menus 원가 (FR-MENU-03)", () => {
  it("UT-COST-01·02 연동: 최근 입고 단가로 원가 1,050원·원가율 15.0%. 다 쓴 묶음의 단가도 최근이면 쓴다", async () => {
    const s = await freshStore();
    const tofu = await s.ingredient("두부", "ea");
    const onion = await s.ingredient("양파");
    await s.receive(tofu, 10, 700, addDays(T, -5)); // 예전 단가
    await s.receive(tofu, 5, 900, addDays(T, -1)); // 최근 단가
    await s.receive(onion, 1000, 1.5, addDays(T, -2));
    await s.receive(onion, 500, null, addDays(T, -1)); // 단가 없는 최근 묶음은 건너뜀
    const id = await s.menu("두부조림", 7000, [{ ingredient_id: tofu, qty: 1 }, { ingredient_id: onion, qty: 100 }]);

    expect(await getMenus()).toEqual([{ id, name: "두부조림", price: 7000, isActive: true, isSpecial: false, cost: 1050, costRate: 15 }]);
  });

  it("UT-COST-03 연동: 단가를 모르는 재료가 있거나 레시피가 없으면 cost·costRate 없음, 판매가 0원이면 costRate만 없음", async () => {
    const s = await freshStore();
    const tofu = await s.ingredient("두부", "ea");
    const salt = await s.ingredient("소금");
    await s.receive(tofu, 5, 900, addDays(T, -1));
    await s.receive(salt, 1000, null, addDays(T, -1));
    const unknown = await s.menu("가 단가 모름", 5000, [{ ingredient_id: tofu, qty: 1 }, { ingredient_id: salt, qty: 2 }]);
    const empty = await s.menu("나 레시피 없음", 5000, []);
    const free = await s.menu("다 서비스", 0, [{ ingredient_id: tofu, qty: 1 }]);

    expect(await getMenus()).toEqual([
      { id: unknown, name: "가 단가 모름", price: 5000, isActive: true, isSpecial: false },
      { id: empty, name: "나 레시피 없음", price: 5000, isActive: true, isSpecial: false },
      { id: free, name: "다 서비스", price: 0, isActive: true, isSpecial: false, cost: 900 },
    ]);
  });
});
