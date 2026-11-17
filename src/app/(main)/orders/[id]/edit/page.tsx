import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { OrderForm } from "@/components/orders/form";
import { OrderBackLink } from "@/components/orders/parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { todayKST } from "@/lib/date";
import { getIngredients } from "@/lib/queries/ingredients";
import { getOrder } from "@/lib/queries/orders";
import { IdInput } from "@/types/contracts";

export default async function Page({ params }: PageProps<"/orders/[id]/edit">) {
  const { id } = await params;
  if (!IdInput.safeParse({ id }).success) notFound();
  const order = await getOrder(id);
  if (!order) notFound();
  if (order.status !== "draft") return <>
    <PageHeader title="발주 수정" />
    <main className="space-y-4 p-4">
      <OrderBackLink />
      <Alert role="alert"><AlertDescription>{order.status === "ordered" ? "발주완료된 목록은 고칠 수 없어요. 작성중으로 되돌린 뒤 고쳐 주세요." : "입고완료된 목록은 고칠 수 없어요."}</AlertDescription></Alert>
      <Button asChild className="h-11"><Link href={`/orders/${id}`}>발주 상세 보기</Link></Button>
    </main>
  </>;
  const ingredients = await getIngredients();
  return <OrderForm key={id} ingredients={ingredients} order={order} today={todayKST()} />;
}
