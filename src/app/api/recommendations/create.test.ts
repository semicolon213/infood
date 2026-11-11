import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { AiClient } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import type { Recommendation } from "@/lib/ai/schemas";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { Database } from "@/types/database";
import { createRecommendation } from "./create";

// 통합 테스트 IT-REC (docs/10_TEST_PLAN.md 5장). 로컬 Supabase가 필요하다 (db.test.ts·ingredients.test.ts와 같은 조건).
// AI는 실제로 부르지 않고 테스트용 AiClient를 넣는다 (AGENTS 규칙 14).
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[create.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const today = todayKST();
type Db = SupabaseClient<Database>;

async function signUpWithStore(label: string) {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `${label}-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: `${label} 매장` }).select("id").single().throwOnError();
  return { db, storeId: store.id };
}

// 두부(D-1, 6모) + 양파(D-10, 1000g), 메뉴 순두부찌개(두부 1·양파 50)
async function seed(db: Db, storeId: string) {
  const { data: ings } = await db.from("ingredients").insert([
    { store_id: storeId, name: "두부", unit: "ea", storage: "fridge", default_shelf_days: 3 },
    { store_id: storeId, name: "양파", unit: "g", storage: "fridge", default_shelf_days: 14 },
  ]).select("id, name").throwOnError();
  const id = Object.fromEntries(ings.map((i) => [i.name, i.id]));
  await db.rpc("receive_stock", {
    p_store_id: storeId, p_ref_type: "manual", p_ref_id: null as unknown as string,
    p_lots: [
      { ingredient_id: id["두부"], quantity: 6, unit_price: 900, received_at: addDays(today, -1), expires_at: addDays(today, 1), expiry_source: "manual" },
      { ingredient_id: id["양파"], quantity: 1000, unit_price: 2, received_at: addDays(today, -1), expires_at: addDays(today, 10), expiry_source: "manual" },
    ],
  }).throwOnError();
  const { data: menu } = await db.from("menus").insert({ store_id: storeId, name: "순두부찌개", price: 9000 }).select("id").single().throwOnError();
  await db.from("recipe_items").insert([
    { store_id: storeId, menu_id: menu.id, ingredient_id: id["두부"], qty: 1 },
    { store_id: storeId, menu_id: menu.id, ingredient_id: id["양파"], qty: 50 },
  ]).throwOnError();
  return { tofu: id["두부"], onion: id["양파"], menu: menu.id };
}

const fixedAi = (out: Recommendation): AiClient & { calls: number } => {
  const ai = { calls: 0, generate: async <T,>() => { ai.calls += 1; return out as T; } };
  return ai;
};
const failingAi: AiClient = { generate: async () => { throw new AiError("AI_INVALID_OUTPUT", "형식 오류 2회"); } };

describe.skipIf(!up)("createRecommendation (IT-REC)", () => {
  let a: Awaited<ReturnType<typeof signUpWithStore>>;
  let ids: Awaited<ReturnType<typeof seed>>;

  beforeAll(async () => {
    a = await signUpWithStore("rec");
    ids = await seed(a.db, a.storeId);
  });

  it("IT-REC-01: 활성 메뉴 0개 → VALIDATION, AI 호출 없음", async () => {
    const empty = await signUpWithStore("rec-empty");
    const ai = fixedAi({ pushMenus: [], newIdeas: [] });
    const res = await createRecommendation({ db: empty.db, storeId: empty.storeId, today, basis: "expiry", ai, dailyLimit: 100 });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(ai.calls).toBe(0);
  });

  it("IT-REC-02·03: 정상 — 재료마다 status·availableQty, 없는 메뉴·미등록·부족 수가 응답과 DB에 저장", async () => {
    const ai = fixedAi({
      pushMenus: [
        { menuId: ids.menu, reason: "두부 소진" },
        { menuId: crypto.randomUUID(), reason: "없는 메뉴" },
      ],
      newIdeas: [{ name: "두부 스테이크", ingredients: [
        { ingredientId: ids.tofu, name: "두부", qty: 10 }, // 6모뿐 → short
        { ingredientId: null, name: "바질", qty: 5 }, // unregistered
      ], steps: ["굽는다"], suggestedPrice: 11000 }],
    });
    const res = await createRecommendation({ db: a.db, storeId: a.storeId, today, basis: "expiry", ai, dailyLimit: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ basis: "expiry", fallback: false, droppedCount: 1, shortCount: 1, unregisteredCount: 1 });
    expect(res.data.pushMenus[0].consumes[0]).toMatchObject({ status: "have", availableQty: 6 });
    expect(res.data.newIdeas[0].estCost).toBe(9000); // 두부 10 × 900원, 바질 제외

    const { data: row } = await a.db.from("recommendations").select("basis, dropped_count, short_count, unregistered_count, fallback").eq("id", res.data.id).single().throwOnError();
    expect(row).toEqual({ basis: "expiry", dropped_count: 1, short_count: 1, unregistered_count: 1, fallback: false });
  });

  it("IT-REC-04·07: AI 형식 오류(재시도 후) → ok, fallback=true, 규칙 기반 메뉴가 DB에도 fallback으로", async () => {
    const res = await createRecommendation({ db: a.db, storeId: a.storeId, today, basis: "expiry", ai: failingAi, dailyLimit: 100 });
    expect(res.ok && res.data.fallback).toBe(true);
    if (!res.ok) return;
    expect(res.data.pushMenus.map((p) => p.menuId)).toEqual([ids.menu]);
    expect(res.data.newIdeas).toEqual([]);
    const { data: row } = await a.db.from("recommendations").select("fallback").eq("id", res.data.id).single().throwOnError();
    expect(row.fallback).toBe(true);
  });

  it("IT-REC-05: basis=cost면 스냅샷의 재료 순서가 CostFirst 결과 (두부 5,400원 → 양파 2,000원)", async () => {
    const res = await createRecommendation({ db: a.db, storeId: a.storeId, today, basis: "cost", ai: fixedAi({ pushMenus: [], newIdeas: [] }), dailyLimit: 100 });
    if (!res.ok) throw new Error(res.error.message);
    const { data: row } = await a.db.from("recommendations").select("basis, input_snapshot").eq("id", res.data.id).single().throwOnError();
    const ranked = (row.input_snapshot as { ranked: { name: string }[] }).ranked;
    expect(row.basis).toBe("cost");
    expect(ranked.map((r) => r.name)).toEqual(["두부", "양파"]);
  });

  it("IT-REC-05: basis=popularity면 최근 7일 판매(판매일 T-6~T)만 반영 — 7일 밖 판매는 순서를 바꾸지 않음", async () => {
    const p = await signUpWithStore("rec-pop");
    const pid = await seed(p.db, p.storeId);
    const { data: side } = await p.db.from("menus").insert({ store_id: p.storeId, name: "두부부침", price: 7000 }).select("id").single().throwOnError();
    await p.db.from("recipe_items").insert({ store_id: p.storeId, menu_id: side.id, ingredient_id: pid.tofu, qty: 3 }).throwOnError();
    // 판매 기록은 record_daily_sales RPC로만 (AGENTS 3). 차감은 이 테스트의 관심사가 아니라 빈 계획으로 판매만 남긴다
    const close = (soldOn: string, menuId: string, qty: number) =>
      p.db.rpc("record_daily_sales", { p_store_id: p.storeId, p_sold_on: soldOn, p_sales: [{ menu_id: menuId, qty }], p_plan: [], p_shortages: [] }).throwOnError();
    await close(addDays(today, -1), pid.menu, 2); // 7일 안: 순두부찌개 2 → 두부 2, 양파 100g
    await close(addDays(today, -7), side.id, 50); // 7일 밖: 두부부침 50 → 두부 150 (들어가면 두부가 앞)

    const res = await createRecommendation({ db: p.db, storeId: p.storeId, today, basis: "popularity", ai: fixedAi({ pushMenus: [], newIdeas: [] }), dailyLimit: 100 });
    if (!res.ok) throw new Error(res.error.message);
    const { data: row } = await p.db.from("recommendations").select("basis, input_snapshot").eq("id", res.data.id).single().throwOnError();
    const input = row.input_snapshot as { ranked: { name: string }[]; snapshot: { sales7d: { menuId: string; qty: number }[] } };
    expect(row.basis).toBe("popularity");
    expect(input.snapshot.sales7d).toEqual([{ menuId: pid.menu, qty: 2 }]);
    // 판매 없음이면 이름순(두부 → 양파), 7일 밖까지 들어가면 두부 152 > 양파 100. 둘 다 아니어야 양파 → 두부
    expect(input.ranked.map((r) => r.name)).toEqual(["양파", "두부"]);
  });

  it("IT-REC-06: 일일 한도 초과 → RATE_LIMITED, AI 호출 0회", async () => {
    const b = await signUpWithStore("rec-limit");
    await seed(b.db, b.storeId);
    const ai = fixedAi({ pushMenus: [], newIdeas: [] });
    expect((await createRecommendation({ db: b.db, storeId: b.storeId, today, basis: "expiry", ai, dailyLimit: 1 })).ok).toBe(true);
    const res = await createRecommendation({ db: b.db, storeId: b.storeId, today, basis: "expiry", ai, dailyLimit: 1 });
    expect(res).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(ai.calls).toBe(1);
  });
});
