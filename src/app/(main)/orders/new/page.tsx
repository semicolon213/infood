import { OrderForm } from "@/components/orders/form";
import { todayKST } from "@/lib/date";
import { getIngredients } from "@/lib/queries/ingredients";
import { getOrderDraft } from "@/lib/queries/orders";

export default async function Page() {
  const [ingredients, suggestion] = await Promise.all([getIngredients(), getOrderDraft()]);
  return <OrderForm ingredients={ingredients} suggestion={suggestion} today={todayKST()} />;
}
