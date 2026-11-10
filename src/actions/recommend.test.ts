import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

// 통합 테스트 IT-REC-08~10 (docs/10_TEST_PLAN.md 5장). 로컬 Supabase가 필요하다 (ingredients.test.ts와 같은 조건).
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let current: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { acceptRecommendation } = await import("./recommend");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[recommend.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

describe.skipIf(!up)("acceptRecommendation (IT-REC-08~10)", () => {
  let db: SupabaseClient<Database>;
  let storeId: string;
  let tofu: string;
  let recId: string;

  beforeAll(async () => {
    db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error } = await db.auth.signUp({ email: `accept-${crypto.randomUUID()}@test.local`, password: "password1234" });
    if (error) throw error;
    const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "특선 매장" }).select("id").single().throwOnError();
    storeId = store.id;
    current = db;
    const { data: ing } = await db.from("ingredients").insert({ store_id: storeId, name: "두부", unit: "ea", storage: "fridge", default_shelf_days: 3 }).select("id").single().throwOnError();
    tofu = ing.id;
    const result = {
      fallback: false, pushMenus: [], droppedCount: 0, shortCount: 0, unregisteredCount: 1,
      newIdeas: [{ index: 0, name: "두부 스테이크", ingredients: [
        { ingredientId: tofu, name: "두부", qty: 1, unit: "ea", status: "have", availableQty: 6 },
        { ingredientId: null, name: "바질", qty: 5, unit: null, status: "unregistered", availableQty: null },
      ], steps: ["굽는다"], estCost: 900, suggestedPrice: 11000 }],
    };
    const { data: rec } = await db.from("recommendations").insert({ store_id: storeId, basis: "expiry", input_snapshot: {}, result_json: result as never }).select("id").single().throwOnError();
    recId = rec.id;
  });

  it("IT-REC-09: 매장 재료가 아닌 재료가 남으면 VALIDATION, 메뉴 저장 없음", async () => {
    const res = await acceptRecommendation({ recommendationId: recId, ideaIndex: 0, name: "두부 스테이크", price: 11000, ingredients: [{ ingredientId: tofu, qty: 1 }, { ingredientId: crypto.randomUUID(), qty: 5 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    const { count } = await db.from("menus").select("id", { count: "exact", head: true }).eq("store_id", storeId);
    expect(count).toBe(0);
  });

  it("IT-REC-08: 사용자가 고친 이름·가격·수량으로 is_special 메뉴 + 레시피, accepted = true", async () => {
    const res = await acceptRecommendation({ recommendationId: recId, ideaIndex: 0, name: "두부 스테이크 정식", price: 12000, ingredients: [{ ingredientId: tofu, qty: 2 }] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { data: menu } = await db.from("menus").select("name, price, is_special, recipe_items(ingredient_id, qty)").eq("id", res.data.menuId).single().throwOnError();
    expect(menu).toMatchObject({ name: "두부 스테이크 정식", price: 12000, is_special: true, recipe_items: [{ ingredient_id: tofu, qty: 2 }] });
    const { data: rec } = await db.from("recommendations").select("accepted").eq("id", recId).single().throwOnError();
    expect(rec.accepted).toBe(true);
  });

  it("같은 이름 메뉴 → CONFLICT / 없는 아이디어 → NOT_FOUND", async () => {
    expect(await acceptRecommendation({ recommendationId: recId, ideaIndex: 0, name: "두부 스테이크 정식", price: 1, ingredients: [{ ingredientId: tofu, qty: 1 }] }))
      .toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await acceptRecommendation({ recommendationId: recId, ideaIndex: 5, name: "다른 이름", price: 1, ingredients: [{ ingredientId: tofu, qty: 1 }] }))
      .toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
