import { PageHeader } from "@/components/common/page-header";
import { todayKST } from "@/lib/date";
import { getSalesDay } from "@/lib/queries/sales";
import { addDays } from "@/lib/stock/expiry";
import { SalesForm } from "./sales-form";

// 판매 마감 (FR-USE-01·05, UC-05) — WBS 3.6a. 날짜는 ?date=YYYY-MM-DD, 없거나 잘못되면 오늘
export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const today = todayKST();
  const { date } = await searchParams;
  // addDays(d, 0) === d 이면 실제 있는 날짜 (2026-02-30 같은 값 제외)
  const valid = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date;
  const soldOn = valid && date <= today ? date : today;
  const day = await getSalesDay(soldOn);

  return (
    <>
      <PageHeader title="판매 마감" />
      {/* key: 날짜가 바뀌면 입력값을 새로 채운다 */}
      <SalesForm key={soldOn} day={day} today={today} />
    </>
  );
}
