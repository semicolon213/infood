import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database";

// 확장 FR-ING-04 (WBS 4.6) suggestStorage. AI는 MockAdapter(AI_MOCK)만 쓴다 (AGENTS 14). 로컬 Supabase 필요 (일일 한도 RPC)
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let current: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));

const { suggestStorage } = await import("./storage");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[storage.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

async function newStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `storage-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  await db.from("stores").insert({ owner_id: auth.user!.id, name: "보관 매장" }).throwOnError();
  current = db;
}

describe.skipIf(!up)("suggestStorage (FR-ING-04)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("UT-STO-01: 재료 이름 → 고정 응답 추천값 (저장 없음)", async () => {
    await newStore();
    vi.stubEnv("AI_MOCK", "1");
    expect(await suggestStorage({ name: "대파" })).toMatchObject({ ok: true, data: { storage: "fridge", defaultShelfDays: 5 } });
    expect((await current.from("ingredients").select("id")).data).toEqual([]);
  });

  it("이름이 비면 VALIDATION, AI 장애면 AI_FAILED", async () => {
    await newStore();
    vi.stubEnv("AI_MOCK", "fail");
    expect(await suggestStorage({ name: "  " })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await suggestStorage({ name: "대파" })).toMatchObject({ ok: false, error: { code: "AI_FAILED" } });
  });

  it("일일 한도를 넘으면 RATE_LIMITED", async () => {
    await newStore();
    vi.stubEnv("AI_MOCK", "1");
    vi.stubEnv("AI_DAILY_LIMIT", "1");
    expect((await suggestStorage({ name: "대파" })).ok).toBe(true);
    expect(await suggestStorage({ name: "양파" })).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });
});
