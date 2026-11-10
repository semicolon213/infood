import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { ActionResult } from "@/lib/result";
import type { IdOutput, IngredientInput } from "@/types/contracts";
import type { Database } from "@/types/database";

// 통합 테스트 IT-STK-01~04 (docs/10_TEST_PLAN.md 5장). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 서버 액션의 세션 클라이언트를 테스트 사용자로 로그인한 클라이언트로 바꿔 실제 RLS 경로로 호출한다.
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

let current: SupabaseClient<Database>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { receiveStock } = await import("./receive");
const { createIngredient, deactivateIngredient } = await import("./ingredients");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[receive.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const today = todayKST();
const yesterday = addDays(today, -1);

const base = (name: string, extra: Partial<IngredientInput> = {}): IngredientInput => ({
  name, unit: "g", minStock: 0, storage: "fridge", trackExpiry: true, defaultShelfDays: 3, ...extra,
});

async function signUpWithStore(label: string) {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `${label}-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: `${label} 매장` }).select("id").single().throwOnError();
  return { db, storeId: store.id };
}

const idOf = (res: ActionResult<IdOutput>) => (res.ok ? res.data.id : "");

describe.skipIf(!up)("actions/receive (IT-STK)", () => {
  let a: Awaited<ReturnType<typeof signUpWithStore>>;
  let onion: string; // g, 기본 3일
  let milk: string; // ml, 기본 7일
  let salt: string; // g, 기한 추적 제외
  let greens: string; // g, 환산 단위 "단" = 300g

  const lotsOf = async (ingredientId: string) =>
    (await a.db.from("stock_lots").select("quantity, remaining, unit_price, received_at, expires_at, expiry_source").eq("ingredient_id", ingredientId).throwOnError()).data!;

  beforeAll(async () => {
    a = await signUpWithStore("a");
    current = a.db;
    onion = idOf(await createIngredient(base("양파")));
    milk = idOf(await createIngredient(base("우유", { unit: "ml", defaultShelfDays: 7 })));
    salt = idOf(await createIngredient(base("소금", { trackExpiry: false, defaultShelfDays: undefined, storage: "room" })));
    greens = idOf(await createIngredient(base("대파", { units: [{ unitName: "단", factor: 300 }] })));
  });

  it("IT-STK-01: 3품목, 하나는 유통기한 입력·둘은 비움 → 묶음 3, 비운 품목은 BR-01 계산값과 근거", async () => {
    const manual = addDays(today, 10);
    const res = await receiveStock({
      receivedOn: yesterday,
      items: [
        { ingredientId: onion, qty: 1, unit: "kg" },
        { ingredientId: milk, qty: 2, unit: "l", expiresAt: manual },
        { ingredientId: salt, qty: 500, unit: "g" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lots).toHaveLength(3);
    expect(res.data.lots[0]).toMatchObject({
      ingredientId: onion, name: "양파", quantity: 1000, unit: "g",
      expiresAt: addDays(yesterday, 3), expirySource: "default", basis: "입고일 + 기본 보관일수 3일",
    });
    expect(res.data.lots[1]).toMatchObject({ ingredientId: milk, quantity: 2000, unit: "ml", expiresAt: manual, expirySource: "manual", basis: "직접 입력" });
    expect(res.data.lots[2]).toMatchObject({ ingredientId: salt, quantity: 500, expiresAt: null, expirySource: null, basis: null });

    const [lot] = await lotsOf(onion);
    expect(lot).toMatchObject({ received_at: yesterday, expires_at: addDays(yesterday, 3), expiry_source: "default" });
    const { data: moves } = await a.db.from("stock_movements").select("type, delta").in("lot_id", res.data.lots.map((l) => l.lotId)).throwOnError();
    expect(moves).toHaveLength(3);
    expect(moves!.every((m) => m.type === "in")).toBe(true);
  });

  it("IT-STK-02: 2kg, 15,000원 (재료 단위 g) → 잔량 2000g, unit_price 7.5", async () => {
    const ing = idOf(await createIngredient(base("돼지고기")));
    const res = await receiveStock({ receivedOn: today, items: [{ ingredientId: ing, qty: 2, unit: "kg", totalPrice: 15000 }] });
    expect(res.ok).toBe(true);
    const [lot] = await lotsOf(ing);
    expect(Number(lot.quantity)).toBe(2000);
    expect(Number(lot.remaining)).toBe(2000);
    expect(Number(lot.unit_price)).toBe(7.5);
  });

  // 실패한 입고는 앞 품목이 정상이어도 묶음·이력을 하나도 남기지 않는다 (10_TEST_PLAN 1.1 F-01 예외)
  async function counts() {
    const lots = await a.db.from("stock_lots").select("id", { count: "exact", head: true }).eq("store_id", a.storeId).throwOnError();
    const moves = await a.db.from("stock_movements").select("id", { count: "exact", head: true }).eq("store_id", a.storeId).throwOnError();
    return { lots: lots.count, moves: moves.count };
  }

  it("IT-STK-03: 환산 단위 없는 \"박스\" → VALIDATION, fields[items.N.unit], 묶음·이력 없음", async () => {
    const before = await counts();
    const res = await receiveStock({
      receivedOn: today,
      items: [
        { ingredientId: onion, qty: 1, unit: "kg" },
        { ingredientId: onion, qty: 1, unit: "박스" },
      ],
    });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { "items.1.unit": "환산 계수를 입력해 주세요" } } });
    expect(await counts()).toEqual(before);
  });

  it("IT-STK-04: 수량 0 또는 유통기한 < 입고일 → VALIDATION, 해당 행 표시, 묶음·이력 없음", async () => {
    const before = await counts();
    const zero = await receiveStock({ receivedOn: today, items: [{ ingredientId: onion, qty: 0, unit: "g" }] });
    expect(zero).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!zero.ok) expect(zero.error.fields).toHaveProperty("items.0.qty");

    const early = await receiveStock({
      receivedOn: today,
      items: [
        { ingredientId: onion, qty: 1, unit: "g" },
        { ingredientId: milk, qty: 1, unit: "ml", expiresAt: yesterday },
      ],
    });
    expect(early).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { "items.1.expiresAt": "유통기한이 입고일보다 빨라요" } } });
    expect(await counts()).toEqual(before);
  });

  it("IT-STK 보조: 환산 단위로 입고 (대파 2단 = 600g), 같은 재료 여러 줄은 묶음 따로", async () => {
    const res = await receiveStock({
      receivedOn: today,
      items: [
        { ingredientId: greens, qty: 2, unit: "단" },
        { ingredientId: greens, qty: 100, unit: "g" },
      ],
    });
    expect(res.ok).toBe(true);
    expect((await lotsOf(greens)).map((l) => Number(l.quantity)).sort((x, y) => x - y)).toEqual([100, 600]);
  });

  it("IT-STK 보조: 미래 입고일 → VALIDATION", async () => {
    const res = await receiveStock({ receivedOn: addDays(today, 1), items: [{ ingredientId: onion, qty: 1, unit: "g" }] });
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { receivedOn: "미래 날짜는 입력할 수 없어요" } } });
  });

  it("IT-STK 보조: 비활성 재료·다른 매장 재료 → NOT_FOUND, 묶음 없음", async () => {
    const gone = idOf(await createIngredient(base("당근")));
    expect((await deactivateIngredient({ id: gone })).ok).toBe(true);
    const b = await signUpWithStore("b");
    current = b.db;
    const other = idOf(await createIngredient(base("양파")));
    current = a.db;

    const before = await counts();
    const res = await receiveStock({ receivedOn: today, items: [{ ingredientId: onion, qty: 1, unit: "g" }, { ingredientId: gone, qty: 1, unit: "g" }] });
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND", fields: { "items.1.ingredientId": "재료를 찾지 못했어요" } } });
    const cross = await receiveStock({ receivedOn: today, items: [{ ingredientId: other, qty: 1, unit: "g" }] });
    expect(cross).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await counts()).toEqual(before);
    expect((await b.db.from("stock_lots").select("id").eq("ingredient_id", other).throwOnError()).data).toHaveLength(0);
  });
});
