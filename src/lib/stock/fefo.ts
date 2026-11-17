import type { ISODate, UUID } from "@/types/contracts";
import { round3 } from "./unit";

// FEFO 차감 계획 (SRS BR-02, 06_ARCHITECTURE 7장 FefoPlanner)
// 계획만 만든다. 잠금·재검증·반영·이력은 RPC(apply_consumption)가 한다.
// 기준일은 인자로 받는다: 판매 마감은 판매일, 직접 사용은 사용일.

export type FefoLot = {
  id: UUID;
  ingredientId: UUID;
  remaining: number;
  expiresAt: ISODate | null;
  receivedAt: ISODate;
};

export type ConsumptionNeed = { ingredientId: UUID; qty: number }; // 기본 단위

export type PlanItem = { ingredientId: UUID; lotId: UUID; qty: number };

export type PlanShortage = { ingredientId: UUID; requiredQty: number; shortQty: number };

export type Plan = {
  items: PlanItem[]; // lot_id 오름차순 (RPC 잠금 순서, 07_DB 5.2)
  shortages: PlanShortage[]; // 부족한 재료만, ingredient_id 오름차순 (FR-USE-05)
};

// 경과하지 않은 묶음: 기한 없음 또는 기한 ≥ 기준일 (기준일 당일은 포함)
function usable(lot: FefoLot, baseDate: ISODate): boolean {
  return lot.remaining > 0 && (lot.expiresAt === null || lot.expiresAt >= baseDate);
}

// 유통기한 오름차순(null 마지막) → 입고일 오름차순 → id (07_DB 6장 FEFO 입력 쿼리와 같은 순서)
function fefoOrder(a: FefoLot, b: FefoLot): number {
  if (a.expiresAt !== b.expiresAt) {
    if (a.expiresAt === null) return 1;
    if (b.expiresAt === null) return -1;
    return a.expiresAt < b.expiresAt ? -1 : 1;
  }
  if (a.receivedAt !== b.receivedAt) return a.receivedAt < b.receivedAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const byId = <T>(key: (x: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

// 같은 재료의 필요량은 합친다. 재료마다 앞 묶음부터 차감하고, 모자란 만큼 부족으로 남긴다 (재고는 음수가 되지 않음)
export function planConsumption(needs: ConsumptionNeed[], lots: FefoLot[], baseDate: ISODate): Plan {
  const required = new Map<UUID, number>();
  for (const n of needs) {
    if (n.qty > 0) required.set(n.ingredientId, round3((required.get(n.ingredientId) ?? 0) + n.qty));
  }

  const items: PlanItem[] = [];
  const shortages: PlanShortage[] = [];
  for (const [ingredientId, requiredQty] of required) {
    let left = requiredQty;
    const candidates = lots.filter((l) => l.ingredientId === ingredientId && usable(l, baseDate)).sort(fefoOrder);
    for (const lot of candidates) {
      if (left <= 0) break;
      const qty = round3(Math.min(lot.remaining, left));
      items.push({ ingredientId, lotId: lot.id, qty });
      left = round3(left - qty);
    }
    if (left > 0) shortages.push({ ingredientId, requiredQty, shortQty: left });
  }

  return {
    items: items.sort(byId((i) => i.lotId)),
    shortages: shortages.sort(byId((s) => s.ingredientId)),
  };
}
