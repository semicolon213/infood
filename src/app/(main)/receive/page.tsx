import { PageHeader } from "@/components/common/page-header";
import { todayKST } from "@/lib/date";
import { getIngredients } from "@/lib/queries/ingredients";
import { getOrder, getOrders } from "@/lib/queries/orders";
import { ReceiveForm, type ReceiveIngredient } from "./receive-form";

// 입고 등록 (FR-STK-01~04, UC-04) — WBS 3.3a
export default async function ReceivePage({ searchParams }: PageProps<"/receive">) {
  const { order: orderId } = await searchParams;
  // 환산 단위·기한 설정은 목록 조회에 들어 있다 (08_API_SPEC v0.3.1)
  const [summaries, orders, order] = await Promise.all([
    getIngredients(),
    getOrders(),
    // FR-STK-05: 발주완료 목록을 불러와 품목·수량을 채운다
    typeof orderId === "string" && /^[0-9a-f-]{36}$/i.test(orderId) ? getOrder(orderId) : null,
  ]);
  const ingredients: ReceiveIngredient[] = summaries.map(({ id, name, unit, units, trackExpiry, defaultShelfDays }) => ({
    id, name, unit, units, trackExpiry, defaultShelfDays,
  }));

  return (
    <>
      <PageHeader title="입고" />
      <ReceiveForm
        key={order?.id ?? "manual"}
        ingredients={ingredients}
        today={todayKST()}
        orders={orders.filter((o) => o.status === "ordered")}
        fromOrder={order?.status === "ordered" ? order : null}
      />
    </>
  );
}
