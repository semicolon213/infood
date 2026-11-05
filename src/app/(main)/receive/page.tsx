import { PageHeader } from "@/components/common/page-header";
import { todayKST } from "@/lib/date";
import { getIngredient, getIngredients } from "@/lib/queries/ingredients";
import type { IngredientDetail } from "@/types/contracts";
import { ReceiveForm, type ReceiveIngredient } from "./receive-form";

// 입고 등록 (FR-STK-01~04, UC-04) — WBS 3.3a
export default async function ReceivePage() {
  const summaries = await getIngredients();
  // shortcut: 환산 단위·기한 설정이 목록 조회(IngredientSummary)에 없어 재료마다 상세를 부른다. 3.1b에서 목록 조회에 필드가 생기면 한 번 조회로 바꾼다
  const details = await Promise.all(summaries.map((s) => getIngredient(s.id)));
  const ingredients: ReceiveIngredient[] = details
    .filter((d): d is IngredientDetail => d !== null)
    .map(({ id, name, unit, units, trackExpiry, defaultShelfDays }) => ({ id, name, unit, units, trackExpiry, defaultShelfDays }));

  return (
    <>
      <PageHeader title="입고" />
      <ReceiveForm ingredients={ingredients} today={todayKST()} />
    </>
  );
}
