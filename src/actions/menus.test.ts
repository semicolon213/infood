import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

// 통합 테스트 IT-MENU-01~03 (docs/10_TEST_PLAN.md 5장). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 서버 액션의 세션 클라이언트를 테스트 사용자로 로그인한 클라이언트로 바꿔 실제 RLS 경로로 호출한다.
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let current: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { saveMenu, deactivateMenu } = await import("./menus");
const { getMenu, getMenus } = await import("@/lib/queries/menus");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[menus.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

async function signUpWithStore(label: string) {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `${label}-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: `${label} 매장` }).select("id").single().throwOnError();
  const ing = async (name: string) =>
    (await db.from("ingredients").insert({ store_id: store.id, name, unit: "g", default_shelf_days: 7 }).select("id").single().throwOnError()).data.id;
  return { db, storeId: store.id, ing };
}

describe.skipIf(!up)("actions/menus (IT-MENU)", () => {
  let a: Awaited<ReturnType<typeof signUpWithStore>>;
  let pork: string, onion: string, tofu: string, otherStoreIng: string;

  beforeAll(async () => {
    const b = await signUpWithStore("b");
    otherStoreIng = await b.ing("B매장 양파");
    a = await signUpWithStore("a");
    [pork, onion, tofu] = [await a.ing("돼지고기"), await a.ing("양파"), await a.ing("두부")];
    current = a.db;
  });

  it("IT-MENU-01: 이름·판매가·레시피 2개 → 메뉴 + recipe_items 저장", async () => {
    const res = await saveMenu({ name: "제육볶음", price: 9000, recipe: [{ ingredientId: pork, qty: 200 }, { ingredientId: onion, qty: 50.5 }] });
    expect(res.ok).toBe(true);
    const menu = await getMenu(res.ok ? res.data.id : "");
    expect(menu).toMatchObject({ name: "제육볶음", price: 9000, isActive: true });
    expect(menu!.recipe.map((r) => [r.name, r.qty])).toEqual([["돼지고기", 200], ["양파", 50.5]]);
  });

  it("IT-MENU-02: 소요량 0 → VALIDATION", async () => {
    const res = await saveMenu({ name: "된장찌개", price: 8000, recipe: [{ ingredientId: tofu, qty: 0 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(res.ok === false && res.error.fields).toHaveProperty("recipe.0.qty");
  });

  it("IT-MENU-03: 비활성화 → isActive false (판매 마감·추천 제외는 3.6b·4.2에서 이 값을 씀)", async () => {
    const saved = await saveMenu({ name: "계란말이", price: 7000, recipe: [] });
    const id = saved.ok ? saved.data.id : "";
    expect(await deactivateMenu({ id })).toEqual({ ok: true, data: { id } });
    expect((await getMenus()).find((m) => m.id === id)?.isActive).toBe(false);
  });

  // 계획서에 없는 보조 케이스
  it("수정 시 레시피 통째 교체: 빠진 재료는 지우고 남은 재료는 수량 갱신", async () => {
    const saved = await saveMenu({ name: "두부조림", price: 8000, recipe: [{ ingredientId: tofu, qty: 1 }, { ingredientId: onion, qty: 30 }] });
    const id = saved.ok ? saved.data.id : "";
    const res = await saveMenu({ id, name: "두부조림", price: 8500, recipe: [{ ingredientId: tofu, qty: 2 }, { ingredientId: pork, qty: 100 }] });
    expect(res.ok).toBe(true);
    const menu = await getMenu(id);
    expect(menu!.price).toBe(8500);
    expect(menu!.recipe.map((r) => [r.name, r.qty])).toEqual([["돼지고기", 100], ["두부", 2]]);
  });

  it("같은 이름 → CONFLICT", async () => {
    const res = await saveMenu({ name: "제육볶음", price: 1, recipe: [] });
    expect(res).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("다른 매장 재료 → VALIDATION, 메뉴도 만들지 않음", async () => {
    const res = await saveMenu({ name: "몰래 메뉴", price: 1, recipe: [{ ingredientId: otherStoreIng, qty: 1 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { "recipe.0.ingredientId": "쓸 수 없는 재료예요" } } });
    expect((await getMenus()).some((m) => m.name === "몰래 메뉴")).toBe(false);
  });

  it("다른 매장 메뉴 수정·비활성화 → NOT_FOUND", async () => {
    const b = await signUpWithStore("b2");
    current = b.db;
    const bMenu = await saveMenu({ name: "B 메뉴", price: 1, recipe: [] });
    current = a.db;
    const id = bMenu.ok ? bMenu.data.id : "";
    expect(await saveMenu({ id, name: "탈취", price: 1, recipe: [] })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await deactivateMenu({ id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getMenu(id)).toBeNull();
  });
});
