import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import type { ActionResult } from "@/lib/result";
import type { IdOutput } from "@/types/contracts";
import type { Database } from "@/types/database";

// 통합 테스트 IT-ORD-02~06 (docs/10_TEST_PLAN.md 5장). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 서버 액션의 세션 클라이언트를 테스트 사용자로 로그인한 클라이언트로 바꿔 실제 RLS 경로로 호출한다.
// 케이스마다 새 매장을 만들어 독립 초기 상태에서 시작한다 (10_TEST_PLAN 2.3).
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Db = SupabaseClient<Database>;
let current: Db;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { saveOrder, setOrderStatus, deleteOrder } = await import("./orders");

const up = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } }).then((r) => r.ok, () => false);
if (!up && process.env.CI) throw new Error(`[orders.test] CI인데 로컬 Supabase(${URL})에 연결할 수 없습니다.`);

const T = todayKST();
const idOf = (res: ActionResult<IdOutput>) => {
  if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
  return res.data.id;
};

async function freshStore() {
  const db = createSupabase<Database>(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await db.auth.signUp({ email: `ord-${crypto.randomUUID()}@test.local`, password: "password1234" });
  if (error) throw error;
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user!.id, name: "발주 매장" }).select("id").single().throwOnError();
  current = db;
  const ingredient = async (name: string) =>
    (await db.from("ingredients").insert({ store_id: store.id, name, unit: "g", default_shelf_days: 3 }).select("id").single().throwOnError()).data.id;
  const orderRow = async (id: string) =>
    (await db.from("purchase_orders").select("status, order_date, memo, ordered_at, received_at").eq("id", id).maybeSingle().throwOnError()).data;
  const itemsOf = async (id: string) =>
    (await db.from("purchase_order_items").select("ingredient_id, qty").eq("order_id", id).order("qty").throwOnError()).data!
      .map((i) => ({ ingredientId: i.ingredient_id, qty: Number(i.qty) }));
  return { db, ingredient, orderRow, itemsOf };
}

describe.skipIf(!up)("actions/orders (IT-ORD)", () => {
  it("IT-ORD-02: 초안에서 1개 삭제·1개 추가·수량 수정 → 고친 그대로 draft 저장, 수량 0 이하는 제외", async () => {
    const s = await freshStore();
    const [onion, tofu, greens, egg] = await Promise.all(["양파", "두부", "대파", "계란"].map(s.ingredient));
    const id = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: onion, qty: 600 }, { ingredientId: tofu, qty: 13 }] }));
    expect(await s.itemsOf(id)).toEqual([{ ingredientId: tofu, qty: 13 }, { ingredientId: onion, qty: 600 }]);

    // 두부 삭제, 대파 추가, 양파 600 → 750.5, 계란은 0이라 빠짐, 소수 4자리는 3자리로 반올림
    const res = await saveOrder({
      id, orderDate: addDays(T, 1), memo: "  오전 배송  ",
      items: [
        { ingredientId: onion, qty: 750.5 },
        { ingredientId: greens, qty: 1.2346 },
        { ingredientId: egg, qty: 0 },
      ],
    });
    expect(res).toEqual({ ok: true, data: { id } });
    expect(await s.itemsOf(id)).toEqual([{ ingredientId: greens, qty: 1.235 }, { ingredientId: onion, qty: 750.5 }]);
    expect(await s.orderRow(id)).toMatchObject({ status: "draft", order_date: addDays(T, 1), memo: "오전 배송" });
  });

  it("IT-ORD-03: ordered 목록 수정 → CONFLICT, 품목 유지", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const id = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: onion, qty: 600 }] }));
    await setOrderStatus({ id, status: "ordered" });

    const res = await saveOrder({ id, orderDate: T, items: [{ ingredientId: onion, qty: 1 }] });
    expect(res).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await s.itemsOf(id)).toEqual([{ ingredientId: onion, qty: 600 }]);
  });

  it("saveOrder: 없는 목록·다른 매장 목록 → NOT_FOUND, 다른 매장 재료 → NOT_FOUND", async () => {
    const a = await freshStore();
    const aOnion = await a.ingredient("양파");
    const aOrder = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: aOnion, qty: 100 }] }));
    const b = await freshStore();
    const bOnion = await b.ingredient("양파");

    expect(await saveOrder({ id: aOrder, orderDate: T, items: [{ ingredientId: bOnion, qty: 1 }] }))
      .toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await saveOrder({ id: crypto.randomUUID(), orderDate: T, items: [] }))
      .toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await saveOrder({ orderDate: T, items: [{ ingredientId: aOnion, qty: 1 }] }))
      .toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    current = a.db;
    expect(await a.itemsOf(aOrder)).toEqual([{ ingredientId: aOnion, qty: 100 }]);
  });

  it("saveOrder: 같은 재료 두 번·메모 200자 초과 → VALIDATION, 저장 없음", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const dup = await saveOrder({ orderDate: T, items: [{ ingredientId: onion, qty: 1 }, { ingredientId: onion, qty: 2 }] });
    expect(dup).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { "items.1.ingredientId": expect.any(String) } } });
    const long = await saveOrder({ orderDate: T, memo: "가".repeat(201), items: [] });
    expect(long).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { memo: expect.any(String) } } });
    const { count } = await s.db.from("purchase_orders").select("id", { count: "exact", head: true }).throwOnError();
    expect(count).toBe(0);
  });

  it("IT-ORD-04: draft→ordered, ordered→draft, ordered→received 모두 성공, ordered_at·received_at 기록", async () => {
    const s = await freshStore();
    const id = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: await s.ingredient("양파"), qty: 100 }] }));
    expect((await s.orderRow(id))!.ordered_at).toBeNull();

    expect(await setOrderStatus({ id, status: "ordered" })).toEqual({ ok: true, data: { id, status: "ordered" } });
    const firstOrderedAt = (await s.orderRow(id))!.ordered_at;
    expect(firstOrderedAt).not.toBeNull();

    expect(await setOrderStatus({ id, status: "draft" })).toEqual({ ok: true, data: { id, status: "draft" } });
    expect(await setOrderStatus({ id, status: "ordered" })).toEqual({ ok: true, data: { id, status: "ordered" } });
    expect(await setOrderStatus({ id, status: "received" })).toEqual({ ok: true, data: { id, status: "received" } });
    const row = (await s.orderRow(id))!;
    expect(row.status).toBe("received");
    expect(row.ordered_at).not.toBeNull();
    expect(row.received_at).not.toBeNull();
  });

  it("IT-ORD-05: draft→received, received→draft, received→ordered, 같은 상태로 → CONFLICT, 상태 유지", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const draft = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: onion, qty: 100 }] }));
    expect(await setOrderStatus({ id: draft, status: "received" })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await setOrderStatus({ id: draft, status: "draft" })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await s.orderRow(draft))!.status).toBe("draft");

    const done = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: onion, qty: 100 }] }));
    await setOrderStatus({ id: done, status: "ordered" });
    await setOrderStatus({ id: done, status: "received" });
    expect(await setOrderStatus({ id: done, status: "draft" })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await setOrderStatus({ id: done, status: "ordered" })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await s.orderRow(done))!.status).toBe("received");
  });

  it("setOrderStatus: 없는 목록·다른 매장 목록 → NOT_FOUND", async () => {
    const a = await freshStore();
    const id = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: await a.ingredient("양파"), qty: 100 }] }));
    await freshStore();
    expect(await setOrderStatus({ id, status: "ordered" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await setOrderStatus({ id: crypto.randomUUID(), status: "ordered" })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    current = a.db;
    expect((await a.orderRow(id))!.status).toBe("draft");
  });

  it("IT-ORD-06: ordered 삭제 → CONFLICT, draft 삭제는 품목까지 지워짐, 없는 목록 → NOT_FOUND", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const ordered = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: onion, qty: 100 }] }));
    await setOrderStatus({ id: ordered, status: "ordered" });
    expect(await deleteOrder({ id: ordered })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await s.orderRow(ordered)).not.toBeNull();

    const draft = idOf(await saveOrder({ orderDate: T, items: [{ ingredientId: onion, qty: 100 }] }));
    expect(await deleteOrder({ id: draft })).toEqual({ ok: true, data: { id: draft } });
    expect(await s.orderRow(draft)).toBeNull();
    expect(await s.itemsOf(draft)).toEqual([]);

    expect(await deleteOrder({ id: draft })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});
