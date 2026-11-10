import { unstable_rethrow } from "next/navigation";
import { todayKST } from "@/lib/date";
import { getIngredients, getIngredient } from "@/lib/queries/ingredients";
import { getStockHistory } from "@/lib/queries/usage";
import { addDays } from "@/lib/stock/expiry";
import type { StockHistoryItem } from "@/types/contracts";
import { StockRecordScreen } from "@/components/waste/screen";
import { validateHistory, type HistoryDraft } from "@/components/waste/form-input";

// 사용·폐기 기록 (FR-USE-03~04) — WBS 3.7a
export default async function Page({ searchParams }: PageProps<"/waste">) {
  const query = await searchParams;
  const today = todayKST();
  const value = (input: string | string[] | undefined, fallback = "") => input === undefined ? fallback : typeof input === "string" ? input : "";
  const historyDraft: HistoryDraft = { from: value(query.from, addDays(today, -6)), to: value(query.to, today), type: value(query.type) };
  const filter = validateHistory(historyDraft, today);
  const summaries = await getIngredients();
  // 묶음 조회 계약이 getIngredient(id)이므로 서버에서 상세를 병렬 조회한다.
  // lotId만 전달되는 기존 폐기 링크도 같은 조회 결과에서 찾고 매장 경계를 유지한다.
  const details = await Promise.all(summaries.map((item) => getIngredient(item.id)));
  const ingredients = details.filter((item) => item !== null).map((item) => ({ id: item.id, name: item.name, unit: item.unit, availableRemaining: item.availableRemaining,
    lots: item.lots.filter((lot) => lot.remaining > 0) }));
  let history: StockHistoryItem[] = [];
  let historyFailed = false;
  if (filter.ok) {
    try { history = await getStockHistory(filter.data); }
    catch (error) { unstable_rethrow(error); historyFailed = true; }
  }
  return <StockRecordScreen today={today} ingredients={ingredients} initialMode={query.lotId !== undefined || query.tab === "waste" ? "waste" : "usage"}
    requestedLotId={query.lotId === undefined ? undefined : value(query.lotId)} history={history} historyDraft={historyDraft}
    historyError={filter.ok ? null : filter.error} historyFailed={historyFailed} />;
}
