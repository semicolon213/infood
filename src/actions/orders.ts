"use server";

import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { STUB_IDS, STUB_ORDERS } from "@/lib/queries/stub-data";
import {
  IdInput,
  SaveOrderInput,
  SetOrderStatusInput,
  type IdOutput,
  type OrderStatus,
  type SetOrderStatusOutput,
} from "@/types/contracts";

// 08_API_SPEC 10장. WBS 2.10 stub — 실제 구현은 4.3b

// 허용 전이 (FR-ORD-05, 07_DB 7장)
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["ordered"],
  ordered: ["draft", "received"],
  received: [],
};

// FR-ORD-02, 03. 품목 통째 교체, qty ≤ 0 품목은 저장하지 않음
export async function saveOrder(input: SaveOrderInput): Promise<ActionResult<IdOutput>> {
  const parsed = SaveOrderInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  if (!parsed.data.id) return ok({ id: STUB_IDS.newId });
  const order = STUB_ORDERS.find((o) => o.id === parsed.data.id);
  if (!order) return fail("NOT_FOUND", "발주 목록을 찾지 못했어요");
  if (order.status !== "draft") return fail("CONFLICT", "작성중인 목록만 고칠 수 있어요");
  return ok({ id: order.id });
}

// FR-ORD-05
export async function setOrderStatus(input: SetOrderStatusInput): Promise<ActionResult<SetOrderStatusOutput>> {
  const parsed = SetOrderStatusInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const order = STUB_ORDERS.find((o) => o.id === parsed.data.id);
  if (!order) return fail("NOT_FOUND", "발주 목록을 찾지 못했어요");
  if (!TRANSITIONS[order.status].includes(parsed.data.status)) {
    return fail("CONFLICT", "지금 상태에서는 바꿀 수 없어요");
  }
  return ok({ id: order.id, status: parsed.data.status });
}

// FR-ORD-03. 작성중만 삭제
export async function deleteOrder(input: IdInput): Promise<ActionResult<IdOutput>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const order = STUB_ORDERS.find((o) => o.id === parsed.data.id);
  if (!order) return fail("NOT_FOUND", "발주 목록을 찾지 못했어요");
  if (order.status !== "draft") return fail("CONFLICT", "작성중인 목록만 지울 수 있어요");
  return ok({ id: order.id });
}
