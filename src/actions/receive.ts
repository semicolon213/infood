"use server";

import { todayKST } from "@/lib/date";
import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { STUB_IDS, STUB_INGREDIENTS } from "@/lib/queries/stub-data";
import { ReceiveStockInput, type ReceiveStockOutput } from "@/types/contracts";

// 08_API_SPEC 5장. WBS 2.10 stub — 실제 구현은 3.3b
// 실제 구현: 단위 환산(lib/stock/unit) → 단가 → 유통기한 결정(lib/stock/expiry, BR-01) → rpc receive_stock

// FR-STK-01~04, BR-01, BR-03
export async function receiveStock(input: ReceiveStockInput): Promise<ActionResult<ReceiveStockOutput>> {
  const parsed = ReceiveStockInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { receivedOn, items } = parsed.data;
  if (receivedOn > todayKST()) {
    return fail("VALIDATION", "입고일을 다시 확인해 주세요", { receivedOn: "미래 날짜는 입력할 수 없어요" });
  }

  const lots: ReceiveStockOutput["lots"] = [];
  for (const [i, item] of items.entries()) {
    const ing = STUB_INGREDIENTS.find((x) => x.id === item.ingredientId);
    if (!ing) return fail("NOT_FOUND", "재료를 찾지 못했어요", { [`items.${i}.ingredientId`]: "재료를 찾지 못했어요" });
    // stub: 환산·기한 계산 없이 형태만 맞춘다 (quantity는 입력 그대로, default 기한은 입고일로 채움)
    const manual = item.expiresAt !== undefined;
    lots.push({
      lotId: STUB_IDS.newId,
      ingredientId: ing.id,
      name: ing.name,
      quantity: item.qty,
      unit: ing.unit,
      expiresAt: !ing.trackExpiry ? null : (item.expiresAt ?? receivedOn),
      expirySource: !ing.trackExpiry ? null : manual ? "manual" : "default",
      basis: !ing.trackExpiry ? null : manual ? "직접 입력" : `입고일 + 기본 보관일수 ${ing.defaultShelfDays}일`,
    });
  }
  return ok({ lots });
}
