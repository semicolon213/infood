import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Recommendation } from "@/lib/ai/schemas";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { Database } from "@/types/database";

// IT-REC-02 (10_TEST_PLAN 5장): Route Handler 경로로 basis를 생략하면 기본값 expiry가 들어가는지.
// 세션은 테스트 사용자 클라이언트, AI는 고정 응답 (실제 AI 호출 없음, AGENTS 14). 로컬 Supabase 필요
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let current: SupabaseClient<Database>;
const ai = vi.hoisted(() => ({ out: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("@/lib/ai/client", () => ({ getAiClient: () => ({ generate: async () => ai.out }) }));

const { POST } = await import("./route");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[recommendations route.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const today = todayKST();

describe.skipIf(!up)("POST /api/recommendations (IT-REC-02)", () => {
  it("IT-REC-02: AI 목 정상, basis 생략 → basis=expiry, 재료마다 status·availableQty, DB 저장", async () => {
    const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error } = await db.auth.signUp({ email: `rec-route-${crypto.randomUUID()}@test.local`, password: "password1234" });
    if (error) throw error;
    const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "추천 매장" }).select("id").single().throwOnError();
    current = db;
    const { data: tofu } = await db.from("ingredients").insert({ store_id: store.id, name: "두부", unit: "ea", default_shelf_days: 3 }).select("id").single().throwOnError();
    await db.rpc("receive_stock", {
      p_store_id: store.id, p_ref_type: "manual", p_ref_id: null as unknown as string,
      p_lots: [{ ingredient_id: tofu.id, quantity: 6, unit_price: 900, received_at: addDays(today, -1), expires_at: addDays(today, 1), expiry_source: "manual" }],
    }).throwOnError();
    const { data: menu } = await db.from("menus").insert({ store_id: store.id, name: "순두부찌개", price: 9000 }).select("id").single().throwOnError();
    await db.from("recipe_items").insert({ store_id: store.id, menu_id: menu.id, ingredient_id: tofu.id, qty: 1 }).throwOnError();
    ai.out = {
      pushMenus: [{ menuId: menu.id, reason: "두부 소진" }],
      newIdeas: [{ name: "두부 스테이크", ingredients: [{ ingredientId: tofu.id, name: "두부", qty: 2 }, { ingredientId: null, name: "바질", qty: 5 }], steps: ["굽는다"], suggestedPrice: 11000 }],
    } satisfies Recommendation;

    const res = await POST(new Request("http://localhost/api/recommendations", { method: "POST", body: JSON.stringify({}) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, data: { basis: "expiry", fallback: false } });
    expect(body.data.pushMenus[0].consumes[0]).toMatchObject({ ingredientId: tofu.id, status: "have", availableQty: 6 });
    expect(body.data.newIdeas[0].ingredients.map((i: { status: string }) => i.status)).toEqual(["have", "unregistered"]);

    const { data: row } = await db.from("recommendations").select("basis, fallback").eq("id", body.data.id).single().throwOnError();
    expect(row).toEqual({ basis: "expiry", fallback: false });
  });
});
