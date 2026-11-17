import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";
import { formatOrderText } from "@/lib/stock/order";
import type { ActionResult } from "@/lib/result";
import type { IdOutput, SaveOrderInput } from "@/types/contracts";
import type { Database } from "@/types/database";

// 통합 테스트 IT-ORD-01·07~09 (docs/10_TEST_PLAN.md 5장). 로컬 Supabase가 필요하다 (db.test.ts와 같은 조건).
// 세션 클라이언트를 테스트 사용자로 로그인한 클라이언트로 바꿔 실제 RLS 경로로 조회한다.
// 케이스마다 새 매장을 만들어 독립 초기 상태에서 시작한다 (10_TEST_PLAN 2.3).
const URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

type Db = SupabaseClient<Database>;
let current: Db;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { getOrderDraft, getOrders, getOrder } = await import("./orders");
const { saveOrder, setOrderStatus } = await import("@/actions/orders");

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
  const storeId = store.id;

  type Extra = Partial<Database["public"]["Tables"]["ingredients"]["Insert"]>;
  const ingredient = async (name: string, extra: Extra = {}) =>
    (await db.from("ingredients").insert({ store_id: storeId, name, unit: "g", default_shelf_days: 3, ...extra }).select("id").single().throwOnError()).data.id;
  // 입고는 receive_stock RPC로만 (AGENTS 3)
  const receive = async (ingredient_id: string, quantity: number, expiresAt: string, receivedAt = addDays(T, -3)) =>
    db
      .rpc("receive_stock", {
        p_store_id: storeId,
        p_ref_type: "manual",
        p_ref_id: null as unknown as string,
        p_lots: [{ ingredient_id, quantity, unit_price: null, received_at: receivedAt, expires_at: expiresAt, expiry_source: "manual" }],
      })
      .throwOnError();
  // 발주 목록은 서버 액션으로 만든다 (상태 전이도 실제 경로로)
  const order = async (items: SaveOrderInput["items"], status: "draft" | "ordered" | "received" = "draft", orderDate = T) => {
    const id = idOf(await saveOrder({ orderDate, items }));
    if (status !== "draft") await setOrderStatus({ id, status: "ordered" });
    if (status === "received") await setOrderStatus({ id, status: "received" });
    return id;
  };
  return { db, ingredient, receive, order };
}

describe.skipIf(!up)("queries/orders (IT-ORD)", () => {
  it("IT-ORD-01: 부족 재료 3개 중 미입고 발주로 충분한 1개는 빠지고, 권장량은 UT-ORD 계산과 같다", async () => {
    const s = await freshStore();
    // 양파: 사용 가능 1000g(경과 500g 별도), 최소 1200·적정 2000, ordered 400g → 600g (10_TEST_PLAN 2.3)
    const onion = await s.ingredient("양파", { min_stock: 1200, target_stock: 2000 });
    await s.receive(onion, 500, addDays(T, -1), addDays(T, -4));
    await s.receive(onion, 1000, addDays(T, 2));
    // 두부: ea, 적정 없음 → 최소 10 × 2 = 20, 사용 가능 7.4 → 12.6 → 13 (UT-ORD-02·05)
    const tofu = await s.ingredient("두부", { unit: "ea", min_stock: 10 });
    await s.receive(tofu, 7.4, addDays(T, 2));
    // 대파: 사용 가능 0, 적정 1000, ordered 1000 → 0 이하라 제외 (UT-ORD-04)
    const greens = await s.ingredient("대파", { min_stock: 500, target_stock: 1000 });
    // 부족하지 않은 재료는 대상이 아니다 (BR-05)
    const salt = await s.ingredient("소금", { min_stock: 100 });
    await s.receive(salt, 500, addDays(T, 30));

    await s.order([{ ingredientId: onion, qty: 400 }, { ingredientId: greens, qty: 1000 }], "ordered");
    // 작성중·입고완료 목록은 미입고 발주량에 넣지 않는다 (UT-ORD-07)
    await s.order([{ ingredientId: onion, qty: 5000 }], "draft");
    await s.order([{ ingredientId: tofu, qty: 50 }], "received");

    expect(await getOrderDraft()).toEqual({
      items: [
        { ingredientId: tofu, name: "두부", unit: "ea", availableQty: 7.4, targetQty: 20, pendingQty: 0, suggestedQty: 13 },
        { ingredientId: onion, name: "양파", unit: "g", availableQty: 1000, targetQty: 2000, pendingQty: 400, suggestedQty: 600 },
      ],
    });
  });

  it("IT-ORD-09: 부족 재료가 없으면 빈 items", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파", { min_stock: 100 });
    await s.receive(onion, 500, addDays(T, 2));
    await s.ingredient("후추"); // 최소 재고 0 → 판정하지 않음
    expect(await getOrderDraft()).toEqual({ items: [] });
  });

  it("IT-ORD-07: 같은 날 목록 2개를 모두 조회, 날짜 내림차순, 기간으로 거른다", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const egg = await s.ingredient("계란", { unit: "ea" });
    const old = await s.order([{ ingredientId: onion, qty: 1000 }], "draft", addDays(T, -7));
    const first = await s.order([{ ingredientId: onion, qty: 1000 }, { ingredientId: egg, qty: 30 }], "ordered");
    const second = idOf(await saveOrder({ orderDate: T, memo: "오후 추가", items: [{ ingredientId: egg, qty: 10 }] }));

    expect(await getOrders()).toEqual([
      { id: second, orderDate: T, status: "draft", itemCount: 1, memo: "오후 추가" },
      { id: first, orderDate: T, status: "ordered", itemCount: 2, memo: null },
      { id: old, orderDate: addDays(T, -7), status: "draft", itemCount: 1, memo: null },
    ]);
    expect((await getOrders({ from: T, to: T })).map((o) => o.id)).toEqual([second, first]);
    expect((await getOrders({ to: addDays(T, -1) })).map((o) => o.id)).toEqual([old]);
  });

  it("IT-ORD-08: 저장한 목록을 getOrder로 불러와 복사 텍스트를 만든다", async () => {
    const s = await freshStore();
    const onion = await s.ingredient("양파");
    const milk = await s.ingredient("우유", { unit: "ml" });
    const id = await s.order([{ ingredientId: onion, qty: 2500 }, { ingredientId: milk, qty: 800 }]);

    const detail = await getOrder(id);
    expect(detail).toEqual({
      id, orderDate: T, status: "draft", memo: null,
      items: [
        { ingredientId: onion, name: "양파", unit: "g", qty: 2500 },
        { ingredientId: milk, name: "우유", unit: "ml", qty: 800 },
      ],
    });
    // ea 표기("30ea"/"30개")는 10_TEST_PLAN 10.2 합의 대기라 여기서는 g·ml만 본다
    expect(formatOrderText(detail!.items)).toBe("양파 2.5kg\n우유 800ml");
  });

  it("getOrder: 다른 매장 목록·없는 ID·형식이 틀린 ID는 null", async () => {
    const a = await freshStore();
    const id = await a.order([{ ingredientId: await a.ingredient("양파"), qty: 100 }]);
    await freshStore(); // 이제 B 매장 세션
    expect(await getOrder(id)).toBeNull();
    expect(await getOrder(crypto.randomUUID())).toBeNull();
    expect(await getOrder("not-a-uuid")).toBeNull();
  });
});
