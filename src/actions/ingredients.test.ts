import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { ActionResult } from "@/lib/result";
import type { IdOutput, IngredientInput } from "@/types/contracts";
import type { Database } from "@/types/database";

// 통합 테스트 IT-ING-01~07 (docs/10_TEST_PLAN.md 5장). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 서버 액션의 세션 클라이언트를 테스트 사용자로 로그인한 클라이언트로 바꿔 실제 RLS 경로로 호출한다.
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let current: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createIngredient, updateIngredient, deactivateIngredient } = await import("./ingredients");
const { getIngredient, getIngredients } = await import("@/lib/queries/ingredients");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[ingredients.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

// 쿼리 함수가 todayKST()를 쓰므로 묶음 날짜도 오늘 기준으로 만든다
const today = todayKST();

const base = (name: string, extra: Partial<IngredientInput> = {}): IngredientInput => ({
  name, unit: "g", minStock: 0, storage: "fridge", trackExpiry: true, defaultShelfDays: 7, ...extra,
});

async function signUpWithStore(label: string) {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `${label}-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: `${label} 매장` }).select("id").single().throwOnError();
  return { db, storeId: store.id };
}

const idOf = (res: ActionResult<IdOutput>) => (res.ok ? res.data.id : "");

describe.skipIf(!up)("actions/ingredients (IT-ING)", () => {
  let a: Awaited<ReturnType<typeof signUpWithStore>>;

  // 입고는 receive_stock RPC로만 만든다 (AGENTS 3)
  async function receive(ingredientId: string, quantity: number, expiresAt: string | null, receivedAt = addDays(today, -1)) {
    const { data } = await a.db
      .rpc("receive_stock", {
        p_store_id: a.storeId,
        p_ref_type: "manual",
        p_ref_id: null as unknown as string,
        p_lots: [{ ingredient_id: ingredientId, quantity, unit_price: null, received_at: receivedAt, expires_at: expiresAt, expiry_source: expiresAt ? "manual" : null }],
      })
      .throwOnError();
    return (data as unknown as string[])[0];
  }

  beforeAll(async () => {
    a = await signUpWithStore("a");
    current = a.db;
  });

  it("IT-ING-01: 같은 이름 중복 → CONFLICT", async () => {
    expect((await createIngredient(base("양파"))).ok).toBe(true);
    const res = await createIngredient(base("양파"));
    expect(res).toMatchObject({ ok: false, error: { code: "CONFLICT", fields: { name: "같은 이름의 재료가 있어요" } } });
  });

  it("IT-ING-02: trackExpiry=true, 기본 보관일수 없음 → VALIDATION", async () => {
    const res = await createIngredient(base("대파", { defaultShelfDays: undefined }));
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(res.ok === false && res.error.fields).toHaveProperty("defaultShelfDays");
  });

  it("IT-ING-03: targetStock < minStock → VALIDATION", async () => {
    const res = await createIngredient(base("두부", { minStock: 10, targetStock: 5 }));
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(res.ok === false && res.error.fields).toHaveProperty("targetStock");
  });

  it("IT-ING-04: 환산 단위 {단, 1000} 추가 → ingredient_units 저장, 목록·상세에서 보임", async () => {
    const id = idOf(await createIngredient(base("쪽파")));
    const res = await updateIngredient({ ...base("쪽파"), id, units: [{ unitName: "단", factor: 1000 }] });
    expect(res).toEqual({ ok: true, data: { id } });
    expect((await getIngredient(id))!.units).toEqual([{ unitName: "단", factor: 1000 }]);
    expect((await getIngredients({ q: "쪽파" }))[0].units).toEqual([{ unitName: "단", factor: 1000 }]);
  });

  it("IT-ING-05: 잔량(경과 포함) > 0 → 비활성화 CONFLICT", async () => {
    const id = idOf(await createIngredient(base("우유", { unit: "ml" })));
    await receive(id, 500, addDays(today, -2), addDays(today, -5)); // 경과 묶음만 남음
    expect(await deactivateIngredient({ id })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("IT-ING-06: 묶음 3개 → 유통기한 순, 기한 없는 묶음은 마지막", async () => {
    const id = idOf(await createIngredient(base("계란", { unit: "ea" })));
    await receive(id, 10, null);
    await receive(id, 20, addDays(today, 10));
    await receive(id, 30, addDays(today, 2));
    const detail = await getIngredient(id);
    expect(detail!.lots.map((l) => [l.remaining, l.daysLeft])).toEqual([[30, 2], [20, 10], [10, null]]);
    expect(detail).toMatchObject({ totalRemaining: 60, availableRemaining: 60, expiredRemaining: 0, nearestExpiresAt: addDays(today, 2), daysLeft: 2 });
  });

  it("IT-ING-07: status soon / expired / low, 이름 검색", async () => {
    const b = await signUpWithStore("filter"); // 다른 테스트 재료와 섞이지 않게 새 매장
    current = b.db;
    const make = async (name: string, extra: Partial<IngredientInput> = {}) => idOf(await createIngredient(base(name, extra)));
    const lot = (id: string, qty: number, exp: string) =>
      b.db.rpc("receive_stock", {
        p_store_id: b.storeId, p_ref_type: "manual", p_ref_id: null as unknown as string,
        p_lots: [{ ingredient_id: id, quantity: qty, unit_price: null, received_at: addDays(today, -10), expires_at: exp, expiry_source: "manual" }],
      }).throwOnError();

    const soon = await make("Soon 재료");
    await lot(soon, 100, addDays(today, 3));
    const expired = await make("경과 재료");
    await lot(expired, 100, addDays(today, -1));
    const low = await make("부족 재료", { minStock: 500 });
    await lot(low, 100, addDays(today, 30));
    // 경과 묶음 + 먼 기한 묶음: nearestExpiresAt은 경과지만 임박 묶음은 없다
    const mixed = await make("섞인 재료");
    await lot(mixed, 100, addDays(today, -3));
    await lot(mixed, 100, addDays(today, 20));

    const names = async (f: Parameters<typeof getIngredients>[0]) => (await getIngredients(f)).map((i) => i.name);
    expect(await names({ status: "soon" })).toEqual(["Soon 재료"]);
    expect(await names({ status: "expired" })).toEqual(["경과 재료", "섞인 재료"]);
    expect(await names({ status: "low" })).toEqual(["부족 재료"]);
    expect(await names({ q: "soon" })).toEqual(["Soon 재료"]); // 대소문자 무시
    expect(await names({})).toEqual(["Soon 재료", "경과 재료", "부족 재료", "섞인 재료"].sort((x, y) => x.localeCompare(y, "ko")));

    const lowItem = (await getIngredients({ status: "low" }))[0];
    expect(lowItem).toMatchObject({ availableRemaining: 100, minStock: 500, isLow: true, trackExpiry: true, defaultShelfDays: 7, units: [] });
    current = a.db;
  });

  // 계획서에 없는 보조 케이스
  it("기본 단위 변경: 잔량 0인 과거 묶음이 있어도 CONFLICT, 묶음이 없으면 허용", async () => {
    const used = idOf(await createIngredient(base("버터")));
    const lotId = await receive(used, 100, addDays(today, 5));
    await a.db.rpc("record_waste", { p_store_id: a.storeId, p_lot_id: lotId, p_qty: 100, p_reason: "mistake", p_memo: null as unknown as string }).throwOnError();
    expect(await updateIngredient({ ...base("버터", { unit: "ml" }), id: used })).toMatchObject({ ok: false, error: { code: "CONFLICT", fields: { unit: expect.any(String) } } });

    const fresh = idOf(await createIngredient(base("식용유")));
    expect((await updateIngredient({ ...base("식용유", { unit: "ml" }), id: fresh })).ok).toBe(true);
    expect((await getIngredient(fresh))!.unit).toBe("ml");
  });

  it("환산 단위 통째 교체, 대소문자만 다른 이름은 VALIDATION", async () => {
    const id = idOf(await createIngredient(base("밀가루", { units: [{ unitName: "포대", factor: 20000 }, { unitName: "컵", factor: 120 }] })));
    expect((await updateIngredient({ ...base("밀가루"), id, units: [{ unitName: "컵", factor: 125 }] })).ok).toBe(true);
    expect((await getIngredient(id))!.units).toEqual([{ unitName: "컵", factor: 125 }]);
    expect((await updateIngredient({ ...base("밀가루"), id, units: [] })).ok).toBe(true);
    expect((await getIngredient(id))!.units).toEqual([]);

    const dup = await createIngredient(base("설탕", { units: [{ unitName: "Box", factor: 1000 }, { unitName: "box", factor: 1000 }] }));
    expect(dup).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { "units.1.unitName": "같은 단위 이름이 있어요" } } });
  });

  it("잔량 0이면 비활성화 → 목록·상세에서 빠지고, 같은 이름 재등록은 CONFLICT", async () => {
    const id = idOf(await createIngredient(base("고춧가루", { trackExpiry: false, defaultShelfDays: undefined })));
    expect(await deactivateIngredient({ id })).toEqual({ ok: true, data: { id } });
    expect(await getIngredient(id)).toBeNull();
    expect((await getIngredients({ q: "고춧가루" })).length).toBe(0);
    expect(await createIngredient(base("고춧가루"))).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await updateIngredient({ ...base("고춧가루"), id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("다른 매장 재료 조회·수정·비활성화 → null / NOT_FOUND", async () => {
    const b = await signUpWithStore("b");
    current = b.db;
    const bId = idOf(await createIngredient(base("B 재료")));
    current = a.db;
    expect(await getIngredient(bId)).toBeNull();
    expect(await updateIngredient({ ...base("탈취"), id: bId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await deactivateIngredient({ id: bId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
