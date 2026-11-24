import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import { todayKST } from "@/lib/date";
import { rpcErrorCode } from "@/lib/result";
import { addDays } from "@/lib/stock/expiry";
import type { Database } from "@/types/database";

// DB-10/17 보조: 실제 로컬 Auth·REST·RPC를 일반 사용자와 케이스별 새 매장으로 검증한다.
const url = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const key = process.env.SUPABASE_TEST_ANON_KEY ?? "";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("Security DB tests require local Supabase");
}
if (key.startsWith("sb_secret_")) throw new Error("Service keys are not allowed");
if (key.split(".").length === 3) {
  const role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role;
  if (role === "service_role") throw new Error("Service keys are not allowed");
}
const up = Boolean(key) && await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: key }, signal: AbortSignal.timeout(3000),
}).then((response) => response.ok).catch(() => false);
if (!up && process.env.CI) throw new Error("CI must run the local Supabase security tests");
if (!up) console.warn("[ai-sales-rls] Local Supabase/key unavailable; skipped");

type Db = SupabaseClient<Database>;
type Actor = { db: Db; storeId: string };
type Fixture = Actor & { ingredientId: string; menuId: string; lotId: string };
const DAY = todayKST();
const OTHER_DAY = addDays(DAY, 1);
const newClient = (): Db => createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function actor(label: string): Promise<Actor> {
  const db = newClient();
  const auth = await db.auth.signUp({
    email: `${label}-${crypto.randomUUID()}@test.local`, password: "password1234",
  });
  if (auth.error || !auth.data.user) throw auth.error ?? new Error("Missing test user");
  const store = await db.from("stores").insert({
    owner_id: auth.data.user.id, name: label,
  }).select("id").single();
  if (store.error) throw store.error;
  return { db, storeId: store.data.id };
}

async function fixture(): Promise<Fixture> {
  const a = await actor("security-owner");
  const ingredient = await a.db.from("ingredients").insert({
    store_id: a.storeId, name: "onion", unit: "g", default_shelf_days: 7,
  }).select("id").single();
  if (ingredient.error) throw ingredient.error;
  const menu = await a.db.from("menus").insert({
    store_id: a.storeId, name: "soup", price: 5000,
  }).select("id").single();
  if (menu.error) throw menu.error;
  const recipe = await a.db.from("recipe_items").insert({
    store_id: a.storeId, menu_id: menu.data.id, ingredient_id: ingredient.data.id, qty: 100,
  });
  if (recipe.error) throw recipe.error;
  const received = await a.db.rpc("receive_stock", {
    p_store_id: a.storeId, p_ref_type: "manual", p_ref_id: null as unknown as string,
    p_lots: [{ ingredient_id: ingredient.data.id, quantity: 1000, unit_price: 1,
      received_at: DAY, expires_at: addDays(DAY, 7), expiry_source: "manual" }],
  });
  if (received.error || !received.data?.[0]) throw received.error ?? new Error("Missing test lot");
  return { ...a, ingredientId: ingredient.data.id, menuId: menu.data.id, lotId: received.data[0] };
}

function closeInput(a: Fixture) {
  return { p_store_id: a.storeId, p_sold_on: DAY,
    p_sales: [{ menu_id: a.menuId, qty: 1 }],
    p_plan: [{ lot_id: a.lotId, qty: 100 }], p_shortages: [] };
}
function orderInput(a: Fixture) {
  return { p_store_id: a.storeId, p_sold_on: OTHER_DAY, p_source: "pos",
    p_external_id: crypto.randomUUID(), p_items: [{ menu_id: a.menuId, qty: 1 }],
    p_plan: [{ lot_id: a.lotId, qty: 100 }], p_shortages: [] };
}
async function remaining(a: Fixture) {
  const result = await a.db.from("stock_lots").select("remaining").eq("id", a.lotId).single();
  if (result.error) throw result.error;
  return Number(result.data.remaining);
}
async function denied(request: PromiseLike<{ error: { code: string } | null }>) {
  expect((await request).error?.code).toBe("42501");
}

describe.skipIf(!up)("AI/sales direct-write security", () => {
  let a: Fixture;
  let b: Actor;
  beforeEach(async () => {
    a = await fixture();
    b = await actor("security-other");
  }, 30_000);

  it("DB-17 보조: AI 사용량 직접 변경을 막고 RPC 한도를 유지한다", async () => {
    const increment = () => a.db.rpc("increment_ai_usage", {
      p_store_id: a.storeId, p_today: DAY, p_limit: 2,
    });
    const first = await increment();
    expect(first.error).toBeNull();
    expect(first.data).toBe(1);
    await denied(a.db.from("ai_usage").insert({ store_id: a.storeId, used_on: OTHER_DAY, count: 0 }));
    await denied(a.db.from("ai_usage").update({ count: 0 }).eq("store_id", a.storeId).eq("used_on", DAY));
    await denied(a.db.from("ai_usage").delete().eq("store_id", a.storeId).eq("used_on", DAY));
    const second = await increment();
    expect(second.error).toBeNull();
    expect(second.data).toBe(2);
    const third = await increment();
    expect(third.error && rpcErrorCode(third.error)).toBe("RATE_LIMITED");
    const stored = await a.db.from("ai_usage").select("count").eq("store_id", a.storeId).eq("used_on", DAY).single();
    expect(stored.error).toBeNull();
    expect(stored.data?.count).toBe(2);
  });

  it("DB-10 보조: 마감 기록 직접 변경 거부 후 기록과 재고를 유지한다", async () => {
    const closed = await a.db.rpc("record_daily_sales", closeInput(a));
    expect(closed.error).toBeNull();
    expect(closed.data).toBeTruthy();
    const dayId = closed.data!;
    const rows = await a.db.from("sales").select("id, qty").eq("sales_day_id", dayId);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0].qty).toBe(1);
    const saleId = rows.data![0].id;
    await denied(a.db.from("sales_days").insert({ store_id: a.storeId, sold_on: OTHER_DAY }));
    await denied(a.db.from("sales_days").update({ shortages: [{ short_qty: 999 }] }).eq("id", dayId));
    await denied(a.db.from("sales_days").delete().eq("id", dayId));
    await denied(a.db.from("sales").insert({ store_id: a.storeId, sales_day_id: dayId, menu_id: a.menuId, qty: 2 }));
    await denied(a.db.from("sales").update({ qty: 999 }).eq("id", saleId));
    await denied(a.db.from("sales").delete().eq("id", saleId));
    const preservedDay = await a.db.from("sales_days").select("id, shortages").eq("id", dayId).single();
    expect(preservedDay.error).toBeNull();
    expect(preservedDay.data).toEqual({ id: dayId, shortages: [] });
    const preservedSales = await a.db.from("sales").select("id, qty").eq("sales_day_id", dayId);
    expect(preservedSales.error).toBeNull();
    expect(preservedSales.data).toEqual([{ id: saleId, qty: 1 }]);
    expect(await remaining(a)).toBe(900);
    const movements = await a.db.from("stock_movements").select("delta").eq("ref_id", dayId).eq("type", "use");
    expect(movements.error).toBeNull();
    expect(movements.data).toEqual([{ delta: -100 }]);
  });

  it("DB-10 보조: 주문 직접 변경·재전송을 막고 취소는 한 번만 반영한다", async () => {
    const input = orderInput(a);
    const ordered = await a.db.rpc("record_sale_order", input);
    expect(ordered.error).toBeNull();
    expect(ordered.data).toBeTruthy();
    const stored = await a.db.from("sale_orders").select("id, items").eq("id", ordered.data!).single();
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual({ id: ordered.data, items: [{ menu_id: a.menuId, qty: 1 }] });
    expect(await remaining(a)).toBe(900);
    await denied(a.db.from("sale_orders").insert({
      store_id: a.storeId, sold_on: OTHER_DAY, source: "pos", external_id: crypto.randomUUID(), items: [],
    }));
    await denied(a.db.from("sale_orders").update({ items: [] }).eq("id", ordered.data!));
    await denied(a.db.from("sale_orders").delete().eq("id", ordered.data!));
    const preserved = await a.db.from("sale_orders").select("id, items").eq("id", ordered.data!).single();
    expect(preserved.error).toBeNull();
    expect(preserved.data).toEqual(stored.data);
    const replay = await a.db.rpc("record_sale_order", input);
    expect(replay.error && rpcErrorCode(replay.error)).toBe("CONFLICT");
    expect(await remaining(a)).toBe(900);
    const cancelled = await a.db.rpc("cancel_sale_order", { p_store_id: a.storeId, p_order_id: ordered.data! });
    expect(cancelled.error).toBeNull();
    expect(await remaining(a)).toBe(1000);
    const cancelRow = await a.db.from("sale_orders").select("cancelled_at").eq("id", ordered.data!).single();
    expect(cancelRow.error).toBeNull();
    expect(cancelRow.data?.cancelled_at).toBeTruthy();
    await denied(a.db.from("sale_orders").update({ cancelled_at: null }).eq("id", ordered.data!));
    const preservedCancel = await a.db.from("sale_orders").select("cancelled_at").eq("id", ordered.data!).single();
    expect(preservedCancel.error).toBeNull();
    expect(preservedCancel.data).toEqual(cancelRow.data);
    const twice = await a.db.rpc("cancel_sale_order", { p_store_id: a.storeId, p_order_id: ordered.data! });
    expect(twice.error && rpcErrorCode(twice.error)).toBe("CONFLICT");
    expect(await remaining(a)).toBe(1000);
  });

  it("DB-01 보조: 자기 매장 기록만 조회한다", async () => {
    expect((await a.db.rpc("increment_ai_usage", { p_store_id: a.storeId, p_today: DAY, p_limit: 2 })).error).toBeNull();
    expect((await a.db.rpc("record_daily_sales", closeInput(a))).error).toBeNull();
    expect((await a.db.rpc("record_sale_order", orderInput(a))).error).toBeNull();
    for (const table of ["ai_usage", "sales_days", "sales", "sale_orders"] as const) {
      const ownerRows = await a.db.from(table).select("store_id").eq("store_id", a.storeId);
      expect(ownerRows.error).toBeNull();
      expect(ownerRows.data).toEqual([{ store_id: a.storeId }]);
      const foreignRows = await b.db.from(table).select("store_id").eq("store_id", a.storeId);
      expect(foreignRows.error).toBeNull();
      expect(foreignRows.data).toEqual([]);
    }
  });

  it("DB-02/17 보조: 다른 매장의 RPC 요청은 변경 전에 거부한다", async () => {
    const own = await b.db.rpc("increment_ai_usage", { p_store_id: b.storeId, p_today: DAY, p_limit: 2 });
    expect(own.error).toBeNull();
    expect(own.data).toBe(1);
    const attempts = [
      await b.db.rpc("increment_ai_usage", { p_store_id: a.storeId, p_today: DAY, p_limit: 2 }),
      await b.db.rpc("record_daily_sales", closeInput(a)),
      await b.db.rpc("record_sale_order", orderInput(a)),
      await b.db.rpc("cancel_sale_order", { p_store_id: a.storeId, p_order_id: crypto.randomUUID() }),
    ];
    for (const response of attempts) expect(response.error && rpcErrorCode(response.error)).toBe("FORBIDDEN");
    for (const table of ["ai_usage", "sales_days", "sales", "sale_orders"] as const) {
      const result = await a.db.from(table).select("store_id").eq("store_id", a.storeId);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    expect(await remaining(a)).toBe(1000);
  });

  it("DB-02/17 보조: 익명 실행을 거부하고 로그인 사용자의 RPC는 허용한다", async () => {
    const anon = newClient();
    const attempts = [
      await anon.rpc("increment_ai_usage", { p_store_id: a.storeId, p_today: DAY, p_limit: 2 }),
      await anon.rpc("record_daily_sales", closeInput(a)),
      await anon.rpc("record_sale_order", orderInput(a)),
      await anon.rpc("cancel_sale_order", { p_store_id: a.storeId, p_order_id: crypto.randomUUID() }),
    ];
    for (const response of attempts) expect(response.error?.code).toBe("42501");
    const allowed = await a.db.rpc("increment_ai_usage", { p_store_id: a.storeId, p_today: DAY, p_limit: 2 });
    expect(allowed.error).toBeNull();
    expect(allowed.data).toBe(1);
    expect(await remaining(a)).toBe(1000);
  });

  it("DB-17 보조: 동시 한도 요청은 2건만 반영하고 초과분을 롤백한다", async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => a.db.rpc("increment_ai_usage", {
      p_store_id: a.storeId, p_today: DAY, p_limit: 2,
    })));
    expect(responses.filter((response) => !response.error)).toHaveLength(2);
    expect(responses.filter((response) => response.error && rpcErrorCode(response.error) === "RATE_LIMITED")).toHaveLength(10);
    const stored = await a.db.from("ai_usage").select("count").eq("store_id", a.storeId).eq("used_on", DAY).single();
    expect(stored.error).toBeNull();
    expect(stored.data?.count).toBe(2);
  });
});
