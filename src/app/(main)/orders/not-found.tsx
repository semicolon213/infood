import { PageHeader } from "@/components/common/page-header";
import { OrderBackLink } from "@/components/orders/parts";

export default function NotFound() {
  return <>
    <PageHeader title="발주 목록" />
    <main className="space-y-4 p-4">
      <p>발주 목록을 찾지 못했어요. 삭제됐거나 볼 수 없는 목록이에요.</p>
      <OrderBackLink />
    </main>
  </>;
}
