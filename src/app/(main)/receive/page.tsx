import { PageHeader } from "@/components/common/page-header";
import { todayKST } from "@/lib/date";
import { getIngredients } from "@/lib/queries/ingredients";
import { ReceiveForm, type ReceiveIngredient } from "./receive-form";

// 입고 등록 (FR-STK-01~04, UC-04) — WBS 3.3a
export default async function ReceivePage() {
  // 환산 단위·기한 설정은 목록 조회에 들어 있다 (08_API_SPEC v0.3.1)
  const summaries = await getIngredients();
  const ingredients: ReceiveIngredient[] = summaries.map(({ id, name, unit, units, trackExpiry, defaultShelfDays }) => ({
    id, name, unit, units, trackExpiry, defaultShelfDays,
  }));

  return (
    <>
      <PageHeader title="입고" />
      <ReceiveForm ingredients={ingredients} today={todayKST()} />
    </>
  );
}
