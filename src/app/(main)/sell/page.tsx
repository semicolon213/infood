import { PageHeader } from "@/components/common/page-header";
import { todayKST } from "@/lib/date";
import { getMenus } from "@/lib/queries/menus";
import { getSaleOrders, isSalesDayClosed } from "@/lib/queries/sale-orders";
import { SellForm } from "./sell-form";

// 주문 판매 (WBS 4.8): 주문이 들어올 때마다 메뉴를 기록하면 레시피만큼 재고가 바로 줄어든다. 포스는 /api/pos/sales
export default async function SellPage() {
  const today = todayKST();
  const [menus, orders, closed] = await Promise.all([getMenus(), getSaleOrders(today), isSalesDayClosed(today)]);
  return (
    <>
      <PageHeader title="주문 판매" />
      <SellForm menus={menus.filter((m) => m.isActive).map(({ id, name, price }) => ({ id, name, price }))} orders={orders} closed={closed} />
    </>
  );
}
