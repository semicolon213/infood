import "server-only";
import type { ISODate, SalesDay } from "@/types/contracts";
import { STUB_SALES_DAY } from "./stub-data";

// 08_API_SPEC 6장. WBS 2.10 stub — 실제 구현은 3.6b
// 활성 메뉴 전체를 최근 7일 판매량 순으로. 마감 전이면 qty = 0
export async function getSalesDay(soldOn: ISODate): Promise<SalesDay> {
  return { ...STUB_SALES_DAY, soldOn };
}
