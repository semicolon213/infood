import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// DB 테스트 (docs/10_TEST_PLAN.md 4장, DB-01~17). 로컬 Supabase(`supabase start`)가 필요하다.
// 사용자 A·B를 익명 키로 가입시켜 실제 RLS 경로로 호출한다 (service role 사용 안 함).
// 로컬 스택 전용: 기본값은 `supabase start`의 공개 데모 키다.
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TODAY = "2026-11-03";

type Db = SupabaseClient<Database>;

async function stackIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    return res.ok;
  } catch {
    return false;
  }
}

const up = await stackIsUp();
// CI에서는 Supabase를 띄우므로 연결이 안 되면 건너뛰지 않고 실패시킨다 (.github/workflows/ci.yml)
if (!up && process.env.CI) throw new Error(`[db.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);
if (!up) console.warn(`[db.test] 로컬 Supabase(${URL})에 연결할 수 없어 DB 테스트를 건너뜁니다. supabase start 후 다시 실행하세요.`);

function newClient(): Db {
  return createClient<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpWithStore(label: string): Promise<{ db: Db; storeId: string }> {
  const db = newClient();
  const email = `${label}-${crypto.randomUUID()}@test.local`;
  const { data: auth, error: authError } = await db.auth.signUp({ email, password: "password1234" });
  if (authError) throw authError;
  const { data, error } = await db
    .from("stores")
    .insert({ owner_id: auth.user!.id, name: `${label} 매장` })
    .select("id")
    .single();
  if (error) throw error;
  return { db, storeId: data.id };
}

// 세션 토큰을 공유하는 두 번째 클라이언트 (DB-11 동시 호출용, 별도 HTTP 요청)
async function cloneSession(db: Db): Promise<Db> {
  const { data } = await db.auth.getSession();
  const other = newClient();
  await other.auth.setSession({
    access_token: data.session!.access_token,
    refresh_token: data.session!.refresh_token,
  });
  return other;
}

async function addIngredient(
  db: Db,
  storeId: string,
  name: string,
  extra: Partial<Database["public"]["Tables"]["ingredients"]["Insert"]> = {},
): Promise<string> {
  const { data, error } = await db
    .from("ingredients")
    .insert({ store_id: storeId, name, unit: "g", default_shelf_days: 7, ...extra })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function receive(
  db: Db,
  storeId: string,
  lots: { ingredient_id: string; quantity: number; expires_at: string; received_at?: string }[],
): Promise<string[]> {
  const { data, error } = await db.rpc("receive_stock", {
    p_store_id: storeId,
    p_ref_type: "manual",
    p_ref_id: null as unknown as string,
    p_lots: lots.map((l) => ({
      unit_price: 1,
      received_at: "2026-10-30",
      expiry_source: "manual",
      ...l,
    })),
  });
  if (error) throw error;
  return data as string[];
}

async function lotRemaining(db: Db, lotId: string): Promise<number> {
  const { data, error } = await db.from("stock_lots").select("remaining").eq("id", lotId).single();
  if (error) throw error;
  return Number(data.remaining);
}

describe.skipIf(!up)("DB (RLS·RPC·제약)", () => {
  let a: { db: Db; storeId: string };
  let b: { db: Db; storeId: string };
  let aIngredient: string;

  beforeAll(async () => {
    a = await signUpWithStore("a");
    b = await signUpWithStore("b");
    aIngredient = await addIngredient(a.db, a.storeId, "양파");
  }, 30_000);

  describe("RLS", () => {
    it("DB-01: 사용자 B가 A 매장 재료 조회 → 0건", async () => {
      const { data, error } = await b.db.from("ingredients").select("id").eq("store_id", a.storeId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("DB-02: 사용자 B가 A 매장 store_id로 재료 insert → 거부", async () => {
      const { error } = await b.db.from("ingredients").insert({ store_id: a.storeId, name: "침입", unit: "g", default_shelf_days: 3 });
      expect(error?.code).toBe("42501");
    });

    it("DB-03: stock_movements update/delete → 거부 (추가만)", async () => {
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: aIngredient, quantity: 100, expires_at: "2026-11-10" }]);
      const updated = await a.db.from("stock_movements").update({ delta: 999 }).eq("lot_id", lot).select();
      expect(updated.data ?? []).toEqual([]);
      const deleted = await a.db.from("stock_movements").delete().eq("lot_id", lot).select();
      expect(deleted.data ?? []).toEqual([]);

      const { data } = await a.db.from("stock_movements").select("delta").eq("lot_id", lot);
      expect(data).toEqual([{ delta: 100 }]);
    });

    it("DB-04: 사용자 B가 A 매장 purchase_orders·purchase_order_items 조회·수정 → 0건 / 거부", async () => {
      const { data: orderId, error } = await a.db.rpc("save_order", {
        p_store_id: a.storeId,
        p_order_id: null as unknown as string,
        p_order_date: TODAY,
        p_memo: "A 발주",
        p_items: [{ ingredient_id: aIngredient, qty: 3 }],
      });
      expect(error).toBeNull();

      expect((await b.db.from("purchase_orders").select("id").eq("id", orderId!)).data).toEqual([]);
      expect((await b.db.from("purchase_order_items").select("order_id").eq("order_id", orderId!)).data).toEqual([]);

      const upd = await b.db.from("purchase_orders").update({ memo: "변조" }).eq("id", orderId!).select();
      expect(upd.data ?? []).toEqual([]);
      const updItems = await b.db.from("purchase_order_items").update({ qty: 999 }).eq("order_id", orderId!).select();
      expect(updItems.data ?? []).toEqual([]);

      const rpc = await b.db.rpc("save_order", {
        p_store_id: a.storeId,
        p_order_id: orderId!,
        p_order_date: TODAY,
        p_memo: "변조",
        p_items: [],
      });
      expect(rpc.error?.message).toBe("FORBIDDEN");

      const { data: mine } = await a.db.from("purchase_orders").select("memo, purchase_order_items(qty)").eq("id", orderId!).single();
      expect(mine?.memo).toBe("A 발주");
      expect(mine?.purchase_order_items).toEqual([{ qty: 3 }]);
    });

    it("DB-05: 사용자 B가 A 매장 usage_records·ingredient_units·recommendations 조회 → 0건", async () => {
      await a.db.from("ingredient_units").insert({ store_id: a.storeId, ingredient_id: aIngredient, unit_name: "망", factor: 1000 }).throwOnError();
      await a.db.from("recommendations").insert({ store_id: a.storeId, input_snapshot: {}, result_json: {} }).throwOnError();
      await a.db.rpc("record_usage", {
        p_store_id: a.storeId,
        p_used_on: TODAY,
        p_items: [{ ingredient_id: aIngredient, qty: 1, short_qty: 1, memo: "시식" }],
        p_plan: [],
      }).throwOnError();

      for (const table of ["usage_records", "ingredient_units", "recommendations"] as const) {
        const own = await a.db.from(table).select("store_id").eq("store_id", a.storeId);
        expect(own.data?.length, table).toBeGreaterThan(0);
        const other = await b.db.from(table).select("store_id").eq("store_id", a.storeId);
        expect(other.data, table).toEqual([]);
      }
    });
  });

  describe("RPC", () => {
    it("DB-06: receive_stock 묶음 2개 입고 → 묶음 2 + in 이력 2, 잔량 = 수량", async () => {
      const ing = await addIngredient(a.db, a.storeId, "대파");
      const lots = await receive(a.db, a.storeId, [
        { ingredient_id: ing, quantity: 300, expires_at: "2026-11-06" },
        { ingredient_id: ing, quantity: 200, expires_at: "2026-11-08" },
      ]);
      expect(lots).toHaveLength(2);

      const { data: rows } = await a.db.from("stock_lots").select("quantity, remaining").eq("ingredient_id", ing).order("quantity");
      expect(rows).toEqual([
        { quantity: 200, remaining: 200 },
        { quantity: 300, remaining: 300 },
      ]);
      const { data: moves } = await a.db.from("stock_movements").select("type, delta, ref_type").eq("ingredient_id", ing).order("delta");
      expect(moves).toEqual([
        { type: "in", delta: 200, ref_type: "manual" },
        { type: "in", delta: 300, ref_type: "manual" },
      ]);
    });

    it("DB-07: receive_stock 다른 매장 재료 ID 포함 → 전체 롤백, NOT_FOUND", async () => {
      const ing = await addIngredient(a.db, a.storeId, "마늘");
      const bIng = await addIngredient(b.db, b.storeId, "B 마늘");
      const { error } = await a.db.rpc("receive_stock", {
        p_store_id: a.storeId,
        p_ref_type: "manual",
        p_ref_id: null as unknown as string,
        p_lots: [
          { ingredient_id: ing, quantity: 100, unit_price: 1, received_at: TODAY, expires_at: "2026-11-10", expiry_source: "manual" },
          { ingredient_id: bIng, quantity: 100, unit_price: 1, received_at: TODAY, expires_at: "2026-11-10", expiry_source: "manual" },
        ],
      });
      expect(error?.message).toBe("NOT_FOUND");
      expect((await a.db.from("stock_lots").select("id").eq("ingredient_id", ing)).data).toEqual([]);
      expect((await a.db.from("stock_movements").select("id").eq("ingredient_id", ing)).data).toEqual([]);
    });

    it("DB-08: record_usage 사용 2품목, 그중 1품목 부족 → usage_records 2건(short_qty), use 이력 ref_type=usage", async () => {
      const ok = await addIngredient(a.db, a.storeId, "두부");
      const short = await addIngredient(a.db, a.storeId, "애호박");
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: ok, quantity: 500, expires_at: "2026-11-05" }]);
      const [first, second] = [ok, short].sort();

      const { data: ids, error } = await a.db.rpc("record_usage", {
        p_store_id: a.storeId,
        p_used_on: TODAY,
        p_items: [
          { ingredient_id: first, qty: first === ok ? 100 : 50, short_qty: first === ok ? 0 : 50, memo: "직원 식사" },
          { ingredient_id: second, qty: second === ok ? 100 : 50, short_qty: second === ok ? 0 : 50, memo: "직원 식사" },
        ],
        p_plan: [{ ingredient_id: ok, lot_id: lot, qty: 100 }],
      });
      expect(error).toBeNull();
      expect(ids).toHaveLength(2);

      const { data: recs } = await a.db.from("usage_records").select("ingredient_id, qty, short_qty").in("id", ids as string[]);
      expect(recs).toHaveLength(2);
      expect(recs!.find((r) => r.ingredient_id === short)).toMatchObject({ qty: 50, short_qty: 50 });
      expect(recs!.find((r) => r.ingredient_id === ok)).toMatchObject({ qty: 100, short_qty: 0 });

      const { data: moves } = await a.db.from("stock_movements").select("type, delta, ref_type, ref_id").eq("lot_id", lot).eq("type", "use");
      expect(moves).toHaveLength(1);
      expect(moves![0]).toMatchObject({ type: "use", delta: -100, ref_type: "usage" });
      expect(ids).toContain(moves![0].ref_id);
      expect(await lotRemaining(a.db, lot)).toBe(400);
    });

    it("DB-09: record_usage 계획 이후 잔량이 바뀜 → STOCK_CONFLICT, 전체 롤백", async () => {
      const ing = await addIngredient(a.db, a.storeId, "버섯");
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: ing, quantity: 100, expires_at: "2026-11-05" }]);
      // 계획(잔량 100 기준) 이후 다른 요청이 40을 폐기
      await a.db.rpc("record_waste", { p_store_id: a.storeId, p_lot_id: lot, p_qty: 40, p_reason: "spoiled", p_memo: "" }).throwOnError();

      const { error } = await a.db.rpc("record_usage", {
        p_store_id: a.storeId,
        p_used_on: TODAY,
        p_items: [{ ingredient_id: ing, qty: 100, short_qty: 0, memo: null }],
        p_plan: [{ ingredient_id: ing, lot_id: lot, qty: 100 }],
      });
      expect(error?.message).toBe("STOCK_CONFLICT");
      expect((await a.db.from("usage_records").select("id").eq("ingredient_id", ing)).data).toEqual([]);
      expect(await lotRemaining(a.db, lot)).toBe(60);
    });

    it("DB-10: record_daily_sales 정상 마감 → 판매·차감·이력 한 트랜잭션, shortages 저장", async () => {
      const ing = await addIngredient(a.db, a.storeId, "돼지고기");
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: ing, quantity: 1000, expires_at: "2026-11-05" }]);
      const { data: menu } = await a.db.from("menus").insert({ store_id: a.storeId, name: "제육볶음", price: 9000 }).select("id").single().throwOnError();
      const shortages = [{ ingredient_id: ing, required_qty: 1200, short_qty: 200 }];

      const { data: dayId, error } = await a.db.rpc("record_daily_sales", {
        p_store_id: a.storeId,
        p_sold_on: "2026-11-02",
        p_sales: [{ menu_id: menu!.id, qty: 6 }],
        p_plan: [{ lot_id: lot, qty: 1000 }],
        p_shortages: shortages,
      });
      expect(error).toBeNull();

      const { data: day } = await a.db.from("sales_days").select("sold_on, shortages, sales(menu_id, qty)").eq("id", dayId!).single();
      expect(day).toMatchObject({ sold_on: "2026-11-02", shortages, sales: [{ menu_id: menu!.id, qty: 6 }] });
      const { data: moves } = await a.db.from("stock_movements").select("type, delta, ref_type, ref_id").eq("lot_id", lot).eq("type", "use");
      expect(moves).toEqual([{ type: "use", delta: -1000, ref_type: "sales", ref_id: dayId }]);
      expect(await lotRemaining(a.db, lot)).toBe(0);
    });

    it("DB-11: record_daily_sales 두 세션에서 동시에 같은 묶음 차감 → 한쪽 STOCK_CONFLICT, 잔량 음수 없음", async () => {
      const ing = await addIngredient(a.db, a.storeId, "닭고기");
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: ing, quantity: 500, expires_at: "2026-11-10" }]);
      const { data: menu } = await a.db.from("menus").insert({ store_id: a.storeId, name: "닭갈비", price: 11000 }).select("id").single().throwOnError();
      const other = await cloneSession(a.db);

      const call = (db: Db, soldOn: string) =>
        db.rpc("record_daily_sales", {
          p_store_id: a.storeId,
          p_sold_on: soldOn,
          p_sales: [{ menu_id: menu!.id, qty: 1 }],
          p_plan: [{ lot_id: lot, qty: 300 }],
          p_shortages: [],
        });
      const results = await Promise.all([call(a.db, "2026-11-04"), call(other, "2026-11-05")]);

      expect(results.filter((r) => r.error === null)).toHaveLength(1);
      expect(results.filter((r) => r.error?.message === "STOCK_CONFLICT")).toHaveLength(1);
      expect(await lotRemaining(a.db, lot)).toBe(200);
      // 실패한 쪽 sales_days는 롤백
      const { data: days } = await a.db.from("sales_days").select("id").in("sold_on", ["2026-11-04", "2026-11-05"]);
      expect(days).toHaveLength(1);
    });

    it("DB-12: record_waste 묶음 지정 폐기 300g (잔량 500g) → 잔량 200g, waste 이력, reason 저장", async () => {
      const ing = await addIngredient(a.db, a.storeId, "시금치");
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: ing, quantity: 500, expires_at: "2026-11-01", received_at: "2026-10-28" }]);
      // 경과 묶음도 폐기할 수 있다
      await a.db.rpc("record_waste", { p_store_id: a.storeId, p_lot_id: lot, p_qty: 300, p_reason: "expired", p_memo: "시듦" }).throwOnError();

      expect(await lotRemaining(a.db, lot)).toBe(200);
      const { data: moves } = await a.db.from("stock_movements").select("type, delta, reason, memo, ref_type").eq("lot_id", lot).eq("type", "waste");
      expect(moves).toEqual([{ type: "waste", delta: -300, reason: "expired", memo: "시듦", ref_type: "waste" }]);
    });

    // RPC 단계에서는 STOCK_CONFLICT (서버 확인 이후 잔량이 줄어든 경우).
    // 입력 실수(폐기량 > 현재 잔량)는 서버 액션이 RPC 전에 VALIDATION으로 막는다 (IT-USE-09).
    it("DB-13: record_waste 잔량보다 큰 폐기 → 거부(STOCK_CONFLICT), 롤백", async () => {
      const ing = await addIngredient(a.db, a.storeId, "상추");
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: ing, quantity: 500, expires_at: "2026-11-05" }]);
      const { error } = await a.db.rpc("record_waste", { p_store_id: a.storeId, p_lot_id: lot, p_qty: 600, p_reason: "spoiled", p_memo: "" });
      expect(error?.message).toBe("STOCK_CONFLICT");
      expect(await lotRemaining(a.db, lot)).toBe(500);
      expect((await a.db.from("stock_movements").select("id").eq("lot_id", lot).eq("type", "waste")).data).toEqual([]);

      const bad = await a.db.rpc("record_waste", { p_store_id: a.storeId, p_lot_id: lot, p_qty: 1, p_reason: "lost", p_memo: "" });
      expect(bad.error?.message).toBe("VALIDATION");
    });

    it("DB-16: get_ingredient_stock — 사용 가능·경과 잔량, is_low, 결과가 p_today에 따라 바뀜", async () => {
      const ing = await addIngredient(a.db, a.storeId, "우유", { unit: "ml", min_stock: 100 });
      await receive(a.db, a.storeId, [
        { ingredient_id: ing, quantity: 80, expires_at: "2026-11-02", received_at: "2026-10-28" },
        { ingredient_id: ing, quantity: 50, expires_at: "2026-11-05" },
      ]);
      const at = async (today: string) => {
        const { data, error } = await a.db.rpc("get_ingredient_stock", { p_store_id: a.storeId, p_today: today });
        expect(error).toBeNull();
        return data!.find((r) => r.ingredient_id === ing)!;
      };

      expect(await at(TODAY)).toMatchObject({
        total_remaining: 130,
        available_remaining: 50,
        expired_remaining: 80,
        nearest_expires_at: "2026-11-02",
        is_low: true,
      });
      expect(await at("2026-11-01")).toMatchObject({ available_remaining: 130, expired_remaining: 0, is_low: false });

      // 다른 매장 store_id로 호출하면 RLS로 0건
      const { data: foreign } = await b.db.rpc("get_ingredient_stock", { p_store_id: a.storeId, p_today: TODAY });
      expect(foreign).toEqual([]);
    });

    it("DB-17: increment_ai_usage 한도 초과 → RATE_LIMITED", async () => {
      const call = () => a.db.rpc("increment_ai_usage", { p_store_id: a.storeId, p_today: TODAY, p_limit: 2 });
      expect((await call()).data).toBe(1);
      expect((await call()).data).toBe(2);
      expect((await call()).error?.message).toBe("RATE_LIMITED");

      const { error } = await b.db.rpc("increment_ai_usage", { p_store_id: a.storeId, p_today: TODAY, p_limit: 2 });
      expect(error?.message).toBe("FORBIDDEN");
    });
  });

  describe("제약", () => {
    it("DB-14: remaining > quantity 또는 음수 잔량 직접 update → 거부", async () => {
      const ing = await addIngredient(a.db, a.storeId, "계란", { unit: "ea" });
      const [lot] = await receive(a.db, a.storeId, [{ ingredient_id: ing, quantity: 30, expires_at: "2026-11-20" }]);
      const over = await a.db.from("stock_lots").update({ remaining: 31 }).eq("id", lot);
      expect(over.error?.code).toBe("23514");
      const negative = await a.db.from("stock_lots").update({ remaining: -1 }).eq("id", lot);
      expect(negative.error?.code).toBe("23514");
      expect(await lotRemaining(a.db, lot)).toBe(30);
    });

    it("DB-15: target_stock < min_stock insert → 거부", async () => {
      const { error } = await a.db
        .from("ingredients")
        .insert({ store_id: a.storeId, name: "쌀", unit: "g", default_shelf_days: 180, min_stock: 5000, target_stock: 1000 });
      expect(error?.code).toBe("23514");
    });
  });
});
