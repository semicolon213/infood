import "server-only";
import type { OrderDetail, OrderDraft, OrderFilter, OrderSummary, UUID } from "@/types/contracts";
import { STUB_ORDER_DRAFT, STUB_ORDERS, toOrderSummary } from "./stub-data";

// 08_API_SPEC 10장. WBS 2.10 stub — 실제 구현은 4.3b

// FR-ORD-01, BR-06: 부족 재료의 권장 발주량 초안
export async function getOrderDraft(): Promise<OrderDraft> {
  return STUB_ORDER_DRAFT;
}

// FR-ORD-03: 날짜 내림차순
export async function getOrders(filter: OrderFilter = {}): Promise<OrderSummary[]> {
  return STUB_ORDERS.filter(
    (o) => (!filter.from || o.orderDate >= filter.from) && (!filter.to || o.orderDate <= filter.to),
  )
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    .map(toOrderSummary);
}

// FR-ORD-03, FR-STK-05. 없으면 null
export async function getOrder(id: UUID): Promise<OrderDetail | null> {
  return STUB_ORDERS.find((o) => o.id === id) ?? null;
}
