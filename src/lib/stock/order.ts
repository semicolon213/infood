import type { OrderStatus, Unit } from "@/types/contracts";
import { round3 } from "./unit";

// 권장 발주량·복사 텍스트 (SRS BR-06, FR-ORD-04)

// 미입고 발주량: 발주완료(ordered) 목록에 들어 있는 같은 재료 수량 합. 작성중·입고완료는 넣지 않는다
export function pendingOrderQty(orders: { status: OrderStatus; qty: number }[]): number {
  return round3(orders.filter((o) => o.status === "ordered").reduce((sum, o) => sum + o.qty, 0));
}

// 권장 발주량 = 적정 재고(없으면 최소 재고 × 2) − 사용 가능 재고 − 미입고 발주량, 기본 단위 정수로 올림.
// 0 이하면 초안에서 제외하므로 null
export function suggestOrderQty(input: {
  targetStock: number | null;
  minStock: number;
  available: number;
  pending: number;
}): number | null {
  const target = input.targetStock ?? input.minStock * 2;
  // 올림 전에 소수 3자리로 맞춰 부동소수 오차(2.0000000001 → 3)를 막는다
  const qty = Math.ceil(round3(target - input.available - input.pending));
  return qty > 0 ? qty : null;
}

// 한 줄에 "품목 수량단위". 1000 이상인 g·ml는 kg·L로 소수 1자리, ea는 "개"
export function formatOrderText(items: { name: string; qty: number; unit: Unit }[]): string {
  return items.map((i) => `${i.name} ${formatQty(i.qty, i.unit)}`).join("\n");
}

function formatQty(qty: number, unit: Unit): string {
  if (unit === "ea") return `${qty}개`;
  if (qty < 1000) return `${qty}${unit}`;
  return `${Math.round(qty / 100) / 10}${unit === "g" ? "kg" : "L"}`;
}
