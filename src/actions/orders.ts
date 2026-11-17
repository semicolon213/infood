"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, rpcErrorCode, rpcFail, validationFail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { round3 } from "@/lib/stock/unit";
import { createClient } from "@/lib/supabase/server";
import {
  IdInput,
  SaveOrderInput,
  SetOrderStatusInput,
  type IdOutput,
  type OrderStatus,
  type SetOrderStatusOutput,
} from "@/types/contracts";

// 08_API_SPEC 10장 — WBS 4.3b. 저장은 save_order RPC, 상태 변경·삭제는 조건부 update/delete 한 번으로 한다(AGENTS 3, 07_DB 5.6).
// 조건에 맞는 행이 없으면 목록이 있는지 다시 봐서 NOT_FOUND와 CONFLICT를 가른다

type Db = Awaited<ReturnType<typeof createClient>>;

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const ORDER_NOT_FOUND = "발주 목록을 찾지 못했어요";

// 허용 전이를 도착 상태 → 출발 상태로 적는다 (FR-ORD-05, 07_DB 7장). 도착마다 출발은 하나뿐이다
const ALLOWED_FROM: Record<OrderStatus, OrderStatus> = {
  ordered: "draft",
  draft: "ordered", // 보내기 전 실수 되돌리기
  received: "ordered",
};

// FR-ORD-02, 03. 품목 통째 교체, 수량은 소수 3자리로 맞추고 0 이하 품목은 RPC가 저장하지 않는다 (UC-09 3a)
export async function saveOrder(input: SaveOrderInput): Promise<ActionResult<IdOutput>> {
  const parsed = SaveOrderInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { id, orderDate, memo, items } = parsed.data;

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  const { data, error } = await db.rpc("save_order", {
    p_store_id: store.id,
    p_order_id: (id ?? null) as unknown as string, // 새 목록은 null (생성 타입은 not null로 나온다)
    p_order_date: orderDate,
    p_memo: (memo || null) as unknown as string,
    p_items: items.map((i) => ({ ingredient_id: i.ingredientId, qty: round3(i.qty) })),
  });
  if (error) {
    // save_order는 수정할 목록이 없을 때(다른 매장 포함)도 CONFLICT를 낸다 → 목록이 있는지 다시 봐서 가른다
    if (id && rpcErrorCode(error) === "CONFLICT") return notUpdated(db, store.id, id, "작성중인 목록만 고칠 수 있어요");
    return rpcFail(
      error,
      { NOT_FOUND: "재료를 찾지 못했어요", FORBIDDEN: "다시 로그인해 주세요" }, // NOT_FOUND = 품목 재료가 이 매장에 없음
      SAVE_FAILED,
    );
  }

  const orderId = data as unknown as string;
  revalidateOrders(orderId);
  return ok({ id: orderId });
}

// FR-ORD-05. 입고완료는 사용자가 직접 표시한다 (부분 입고 포함)
export async function setOrderStatus(input: SetOrderStatusInput): Promise<ActionResult<SetOrderStatusOutput>> {
  const parsed = SetOrderStatusInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { id, status } = parsed.data;

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  const now = new Date().toISOString(); // 시각 기록용 (날짜 규칙의 '오늘'과 무관)
  const { data, error } = await db
    .from("purchase_orders")
    .update({
      status,
      updated_at: now,
      ...(status === "ordered" ? { ordered_at: now } : {}),
      ...(status === "received" ? { received_at: now } : {}),
    })
    .eq("id", id)
    .eq("store_id", store.id)
    .eq("status", ALLOWED_FROM[status])
    .select("id");
  if (error) return fail("INTERNAL", SAVE_FAILED);
  if (data.length === 0) return notUpdated(db, store.id, id, "지금 상태에서는 바꿀 수 없어요");

  revalidateOrders(id);
  return ok({ id, status });
}

// FR-ORD-03. 작성중(draft)만 삭제
export async function deleteOrder(input: IdInput): Promise<ActionResult<IdOutput>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { id } = parsed.data;

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  // 품목은 on delete cascade로 함께 지워진다
  const { data, error } = await db
    .from("purchase_orders")
    .delete()
    .eq("id", id)
    .eq("store_id", store.id)
    .eq("status", "draft")
    .select("id");
  if (error) return fail("INTERNAL", "지우지 못했어요. 잠시 후 다시 시도해 주세요");
  if (data.length === 0) return notUpdated(db, store.id, id, "작성중인 목록만 지울 수 있어요");

  revalidateOrders(id);
  return ok({ id });
}

// 조건부 변경이 0행일 때: 목록이 없으면(다른 매장 포함, RLS) NOT_FOUND, 있으면 상태가 맞지 않은 것이라 CONFLICT
async function notUpdated<T>(db: Db, storeId: string, id: string, conflictMessage: string): Promise<ActionResult<T>> {
  const { data, error } = await db.from("purchase_orders").select("id").eq("id", id).eq("store_id", storeId).maybeSingle();
  if (error) return fail("INTERNAL", SAVE_FAILED);
  return data ? fail("CONFLICT", conflictMessage) : fail("NOT_FOUND", ORDER_NOT_FOUND);
}

function revalidateOrders(id: string) {
  revalidatePath("/orders");
  revalidatePath(`/orders/${id}`);
  revalidatePath("/");
}
