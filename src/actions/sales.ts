"use server";

import { todayKST } from "@/lib/date";
import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { STUB_IDS, STUB_MENUS } from "@/lib/queries/stub-data";
import { RecordDailySalesInput, type RecordDailySalesOutput } from "@/types/contracts";

// 08_API_SPEC 6장. WBS 2.10 stub — 실제 구현은 3.6b
// 실제 구현: 레시피 × 수량 합산 → FEFO 계획(lib/stock/fefo) → rpc record_daily_sales, STOCK_CONFLICT면 1회 재계획

// FR-USE-01, 02, 05, BR-02
export async function recordDailySales(input: RecordDailySalesInput): Promise<ActionResult<RecordDailySalesOutput>> {
  const parsed = RecordDailySalesInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { soldOn, sales } = parsed.data;
  if (soldOn > todayKST()) {
    return fail("VALIDATION", "판매일을 다시 확인해 주세요", { soldOn: "미래 날짜는 입력할 수 없어요" });
  }
  for (const [i, s] of sales.entries()) {
    if (!STUB_MENUS.some((m) => m.id === s.menuId && m.isActive)) {
      return fail("VALIDATION", "판매할 수 없는 메뉴가 있어요", { [`sales.${i}.menuId`]: "판매할 수 없는 메뉴예요" });
    }
  }
  // stub: 차감량·부족분은 고정값
  return ok({
    salesDayId: STUB_IDS.salesDay,
    consumed: [{ ingredientId: STUB_IDS.pork, qty: 1000 }],
    shortages: [{ ingredientId: STUB_IDS.greenOnion, name: "대파", unit: "g", requiredQty: 100, shortQty: 100 }],
  });
}
