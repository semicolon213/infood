import type { ISODate } from "@/types/contracts";
import { daysLeft } from "./expiry";
import { round3 } from "./unit";

// 임박·경과·부족 판정 (SRS BR-05). 오늘 날짜는 인자로 받는다 (서버는 todayKST()를 넘김).

export type ExpiryStatus = "expired" | "soon" | "ok" | "none";

const SOON_DAYS = 3; // 임박: D-0 ~ D-3

// 경과: 기한 < 오늘 / 임박: 오늘 ≤ 기한 ≤ 오늘 + 3일 / 기한 추적 제외(null)는 판정하지 않음
export function expiryStatus(expiresAt: ISODate | null, today: ISODate): { status: ExpiryStatus; daysLeft: number | null } {
  if (expiresAt === null) return { status: "none", daysLeft: null };
  const d = daysLeft(expiresAt, today);
  return { status: d < 0 ? "expired" : d <= SOON_DAYS ? "soon" : "ok", daysLeft: d };
}

type Lot = { remaining: number; expiresAt: ISODate | null };

const isExpired = (lot: Lot, today: ISODate) => lot.expiresAt !== null && lot.expiresAt < today;

// 사용 가능 재고 = 경과하지 않은 묶음의 잔량 합 (기한 추적 제외 묶음 포함)
export function availableQty(lots: Lot[], today: ISODate): number {
  return round3(lots.filter((l) => !isExpired(l, today)).reduce((sum, l) => sum + l.remaining, 0));
}

// 경과 묶음의 잔량 합 (폐기 안내용)
export function expiredQty(lots: Lot[], today: ISODate): number {
  return round3(lots.filter((l) => isExpired(l, today)).reduce((sum, l) => sum + l.remaining, 0));
}

// 부족: 사용 가능 재고 < 최소 재고. 최소 재고가 0이면 판정하지 않는다
export function isLow(available: number, minStock: number): boolean {
  return minStock > 0 && available < minStock;
}
