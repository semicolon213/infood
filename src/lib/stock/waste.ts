import type { ISODate } from "@/types/contracts";
import { addDays, daysLeft } from "./expiry";

// 주간 폐기 금액 (확장 FR-DASH-05, 07_DB 6장). 오늘 날짜는 인자로 받는다 (06_ARCHITECTURE 10장).
// 금액 = 폐기량 × 묶음 단가. 단가 없는 묶음은 0원으로 본다 (07_DB 6장 coalesce(unit_price, 0))

export type WasteRecord = { date: ISODate; qty: number; unitPrice: number | null }; // date = 폐기 시각의 KST 날짜
export type WeeklyWaste = { thisWeek: number; lastWeek: number; daily: { date: ISODate; amount: number }[] };

// 그 주의 월요일 (주 시작 = KST 월요일, IT-X03)
export function weekStart(date: ISODate): ISODate {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = 일요일
  return addDays(date, -((day + 6) % 7));
}

// daily는 이번 주 월요일부터 오늘까지 하루도 빠짐없이 (폐기 없는 날은 0원).
// 날짜별로 원 단위 반올림하고, 주 합계는 반올림한 일별 금액의 합이라 화면의 일별 합과 같다
export function weeklyWaste(records: WasteRecord[], today: ISODate): WeeklyWaste {
  const thisStart = weekStart(today);
  const lastStart = addDays(thisStart, -7);
  const raw = new Map<ISODate, number>();
  for (const r of records) {
    if (r.date < lastStart || r.date > today) continue;
    raw.set(r.date, (raw.get(r.date) ?? 0) + r.qty * (r.unitPrice ?? 0));
  }
  const amountOf = (date: ISODate) => Math.round(raw.get(date) ?? 0);

  const sum = (from: ISODate, days: number) => Array.from({ length: days }, (_, i) => amountOf(addDays(from, i))).reduce((a, b) => a + b, 0);
  const daily = Array.from({ length: daysLeft(today, thisStart) + 1 }, (_, i) => {
    const date = addDays(thisStart, i);
    return { date, amount: amountOf(date) };
  });
  return { thisWeek: sum(thisStart, daily.length), lastWeek: sum(lastStart, 7), daily };
}
