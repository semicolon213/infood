"use server";

import { todayKST } from "@/lib/date";
import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { STUB_IDS, STUB_INGREDIENTS } from "@/lib/queries/stub-data";
import {
  AdjustLotInput,
  RecordUsageInput,
  RecordWasteInput,
  type AdjustLotOutput,
  type RecordUsageOutput,
  type RecordWasteOutput,
} from "@/types/contracts";

// 08_API_SPEC 7장. WBS 2.10 stub — 실제 구현은 3.7b (adjustLot은 확장 4.5)

const findLot = (lotId: string) => STUB_INGREDIENTS.flatMap((i) => i.lots).find((l) => l.id === lotId);

// FR-USE-03, 05, BR-02
export async function recordUsage(input: RecordUsageInput): Promise<ActionResult<RecordUsageOutput>> {
  const parsed = RecordUsageInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  if (parsed.data.usedOn > todayKST()) {
    return fail("VALIDATION", "사용일을 다시 확인해 주세요", { usedOn: "미래 날짜는 입력할 수 없어요" });
  }
  for (const [i, item] of parsed.data.items.entries()) {
    if (!STUB_INGREDIENTS.some((x) => x.id === item.ingredientId)) {
      return fail("NOT_FOUND", "재료를 찾지 못했어요", { [`items.${i}.ingredientId`]: "재료를 찾지 못했어요" });
    }
  }
  // stub: 부족분 없음
  return ok({ recordIds: parsed.data.items.map(() => STUB_IDS.usageRecord), shortages: [] });
}

// FR-USE-04. 경과 묶음도 폐기 가능, 잔량보다 많으면 STOCK_CONFLICT
export async function recordWaste(input: RecordWasteInput): Promise<ActionResult<RecordWasteOutput>> {
  const parsed = RecordWasteInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const lot = findLot(parsed.data.lotId);
  if (!lot) return fail("NOT_FOUND", "재고 묶음을 찾지 못했어요");
  if (parsed.data.qty > lot.remaining) {
    return fail("STOCK_CONFLICT", "남은 양보다 많이 폐기할 수 없어요. 화면을 새로 고쳐 주세요");
  }
  return ok({ lotId: lot.id, remaining: lot.remaining - parsed.data.qty });
}

// 확장 FR-USE-07: 실사 보정
export async function adjustLot(input: AdjustLotInput): Promise<ActionResult<AdjustLotOutput>> {
  const parsed = AdjustLotInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const lot = findLot(parsed.data.lotId);
  if (!lot) return fail("NOT_FOUND", "재고 묶음을 찾지 못했어요");
  if (parsed.data.newRemaining > lot.quantity) {
    return fail("VALIDATION", "입고 수량보다 많을 수 없어요", { newRemaining: "입고 수량보다 많을 수 없어요" });
  }
  return ok({ lotId: lot.id, delta: parsed.data.newRemaining - lot.remaining });
}
