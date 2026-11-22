"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { recordSaleOrderFor } from "@/lib/sales/record-order";
import { createClient } from "@/lib/supabase/server";
import type { RecordSaleOrderInput, RecordSaleOrderOutput } from "@/types/contracts";

// 주문별 판매 — 사이트 입력 (WBS 4.8). 포스는 POST /api/pos/sales로 같은 처리를 한다
export async function recordSaleOrder(input: RecordSaleOrderInput): Promise<ActionResult<RecordSaleOrderOutput>> {
  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const result = await recordSaleOrderFor(await createClient(), store.id, "web", input);
  if (result.ok) {
    revalidatePath("/sell");
    revalidatePath("/");
    revalidatePath("/ingredients");
  }
  return result;
}
