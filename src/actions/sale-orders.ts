"use server";

import { revalidatePath } from "next/cache";
import { fail, validationFail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { cancelSaleOrderFor, recordSaleOrderFor } from "@/lib/sales/record-order";
import { createClient } from "@/lib/supabase/server";
import { IdInput, type IdOutput, type RecordSaleOrderInput, type RecordSaleOrderOutput } from "@/types/contracts";

function refresh() {
  revalidatePath("/sell");
  revalidatePath("/");
  revalidatePath("/ingredients");
}

// 주문별 판매 — 사이트 입력 (WBS 4.8). 포스는 POST /api/pos/sales로 같은 처리를 한다
export async function recordSaleOrder(input: RecordSaleOrderInput): Promise<ActionResult<RecordSaleOrderOutput>> {
  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const result = await recordSaleOrderFor(await createClient(), store.id, "web", input);
  if (result.ok) refresh();
  return result;
}

// 주문 취소 (WBS 4.8a): 줄인 재고를 되돌린다. 포스 주문도 사이트에서 취소할 수 있다
export async function cancelSaleOrder(input: IdInput): Promise<ActionResult<IdOutput>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const result = await cancelSaleOrderFor(await createClient(), store.id, { id: parsed.data.id });
  if (!result.ok) return result;
  refresh();
  return { ok: true, data: { id: result.data.orderId } };
}
