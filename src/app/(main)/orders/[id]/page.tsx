import { notFound } from "next/navigation";
import { OrderDetailScreen } from "@/components/orders/detail-screen";
import { getOrder } from "@/lib/queries/orders";
import { IdInput } from "@/types/contracts";

export default async function Page({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  if (!IdInput.safeParse({ id }).success) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  return <OrderDetailScreen key={order.id} order={order} />;
}
