import type { ISODate } from "@/types/contracts";
import { daysLeft } from "./expiry";
import { round3 } from "./unit";

// 원가·재고 금액 계산 (AGENTS 규칙 2: 금액 계산은 lib/stock 순수 함수로만). 오늘 날짜는 인자로 받는다.

type PricedLot = { remaining: number; expiresAt: ISODate | null; unitPrice: number | null; receivedAt: ISODate };

const usable = (lot: PricedLot, today: ISODate) => lot.remaining > 0 && (lot.expiresAt === null || lot.expiresAt >= today);

// 가장 최근에 들어온 묶음 중 단가가 있는 것의 단가. 없으면 null (08_API_SPEC 9장 estCost)
export function latestUnitPrice(lots: PricedLot[]): number | null {
  let best: PricedLot | null = null;
  for (const lot of lots) {
    if (lot.unitPrice === null) continue;
    if (best === null || lot.receivedAt > best.receivedAt) best = lot;
  }
  return best?.unitPrice ?? null;
}

// 사용 가능 묶음의 재고 금액(원) = Σ 잔량 × 단가. 단가가 없는 묶음은 0원으로 본다
export function stockValue(lots: PricedLot[], today: ISODate): number {
  return Math.round(lots.filter((l) => usable(l, today)).reduce((sum, l) => sum + l.remaining * (l.unitPrice ?? 0), 0));
}

// 소요량들의 원가(원, 정수). 단가를 모르는 재료는 빼고 더한다
export function costOf(items: { qty: number; unitPrice: number | null }[]): number {
  return Math.round(items.reduce((sum, i) => sum + (i.unitPrice === null ? 0 : i.qty * i.unitPrice), 0));
}

// 사용 가능 묶음 중 가장 가까운 기한까지 남은 일수. 기한 있는 사용 가능 묶음이 없으면 null
export function nearestDaysLeft(lots: PricedLot[], today: ISODate): number | null {
  let min: number | null = null;
  for (const lot of lots) {
    if (!usable(lot, today) || lot.expiresAt === null) continue;
    const d = daysLeft(lot.expiresAt, today);
    if (min === null || d < min) min = d;
  }
  return min;
}

// 메뉴 판매량 × 1인분 소요량의 합 (주간 사용량, PopularityFirst)
export function weeklyUsage(ingredientId: string, menus: { id: string; recipe: { ingredientId: string; qty: number }[] }[], sales: { menuId: string; qty: number }[]): number {
  const sold = new Map(sales.map((s) => [s.menuId, s.qty]));
  let total = 0;
  for (const m of menus) {
    const item = m.recipe.find((r) => r.ingredientId === ingredientId);
    if (item) total += item.qty * (sold.get(m.id) ?? 0);
  }
  return round3(total);
}
