import "server-only";
import type { StockHistoryFilter, StockHistoryItem } from "@/types/contracts";
import { STUB_HISTORY } from "./stub-data";

// 08_API_SPEC 7장. WBS 2.10 stub — 실제 구현은 3.7b
// 사용·폐기 기록 목록. 최신순, 기간 최대 31일
export async function getStockHistory(filter: StockHistoryFilter): Promise<StockHistoryItem[]> {
  return STUB_HISTORY.filter(
    (h) => h.date >= filter.from && h.date <= filter.to && (!filter.type || h.type === filter.type),
  );
}
