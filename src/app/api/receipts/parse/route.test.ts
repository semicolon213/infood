import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

// IT-RCP-01·02 (10_TEST_PLAN 9.5). AI는 MockAdapter만 쓴다 (AGENTS 14). 로컬 Supabase 필요
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let current: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));

const { POST } = await import("./route");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[receipts.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

async function newStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `rcp-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "명세서 매장" }).select("id").single().throwOnError();
  const { data: ing } = await db.from("ingredients").insert({ store_id: store.id, name: "양파", unit: "g", default_shelf_days: 14 }).select("id").single().throwOnError();
  current = db;
  return { db, onion: ing.id };
}

function upload(type = "image/jpeg") {
  const body = new FormData();
  body.set("image", new File([new Uint8Array([0xff, 0xd8, 0xff])], "r.jpg", { type }));
  return POST(new Request("http://localhost/api/receipts/parse", { method: "POST", body }));
}

describe.skipIf(!up)("POST /api/receipts/parse (FR-RCP-01·03)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("IT-RCP-01: AI 목 정상 → 확인용 행 목록, 확정 전 재고 변화 없음", async () => {
    const { db, onion } = await newStore();
    vi.stubEnv("AI_MOCK", "1");
    const res = await upload();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.vendor).toBe("싱싱청과");
    expect(body.data.lines[0]).toMatchObject({ rawName: "양파", ingredientId: onion, qty: 2, unit: "kg", totalPrice: 6000 });
    expect(body.data.lines[1]).toMatchObject({ rawName: "대파", ingredientId: null, confidence: "low" });
    expect((await db.from("stock_lots").select("id")).data).toEqual([]);
  });

  it("IT-RCP-02: AI 목 실패 → 직접 입력 안내", async () => {
    await newStore();
    vi.stubEnv("AI_MOCK", "fail");
    const res = await upload();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "AI_FAILED", message: "명세서를 읽지 못했어요. 직접 입력해 주세요" } });
  });

  it("사진이 아니면 VALIDATION (AI 호출 없음)", async () => {
    await newStore();
    expect((await upload("application/pdf")).status).toBe(400);
  });
});
