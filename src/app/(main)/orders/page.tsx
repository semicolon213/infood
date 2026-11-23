import Link from "next/link";
import { Plus, ShoppingBasket } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { OrderStatusBadge } from "@/components/orders/parts";
import { parseOrderFilter } from "@/components/orders/form-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOrders } from "@/lib/queries/orders";

// FR-ORD-01~05 — 조회는 서버에서, 변경은 기존 Server Action 계약을 따른다.
export default async function Page({ searchParams }: PageProps<"/orders">) {
  const { from, to } = await searchParams;
  const filter = parseOrderFilter(from, to);
  const filterError = filter.ok ? null : filter.error;
  const orders = filter.ok ? await getOrders(filter.data) : [];
  const filtered = Boolean(from || to);

  return <>
    <PageHeader title="발주 목록" action={<Button asChild className="h-11"><Link href="/orders/new"><Plus aria-hidden="true" className="size-4" />새 목록</Link></Button>} />
    <main className="space-y-6 p-4">
      <p className="text-sm text-muted-foreground">부족한 재료를 확인하고, 필요한 만큼 발주해요.</p>
      <form action="/orders" aria-label="발주 기간 조회" className="space-y-3 rounded-xl border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-2"><Label htmlFor="order-from">시작일</Label><Input id="order-from" name="from" type="date" defaultValue={typeof from === "string" ? from : ""} aria-invalid={!!filterError?.fields?.from} aria-describedby={filterError?.fields?.from ? "order-filter-error" : undefined} className="h-11 min-w-0 text-base" /></div>
          <div className="min-w-0 space-y-2"><Label htmlFor="order-to">종료일</Label><Input id="order-to" name="to" type="date" defaultValue={typeof to === "string" ? to : ""} aria-invalid={!!filterError?.fields?.to} aria-describedby={filterError?.fields?.to ? "order-filter-error" : undefined} className="h-11 min-w-0 text-base" /></div>
        </div>
        <div className="flex gap-2"><Button type="submit" variant="outline" className="h-11 flex-1">조회</Button><Button asChild variant="ghost" className="h-11"><Link href="/orders">전체 보기</Link></Button></div>
      </form>
      {!filter.ok ? <Alert id="order-filter-error" variant="destructive" role="alert"><AlertDescription>{filter.error.message}</AlertDescription></Alert> : orders.length === 0 ? <section className="space-y-4 rounded-xl border border-dashed p-6 text-center" aria-label="빈 발주 목록">
        <ShoppingBasket className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">{filtered ? "선택한 기간에 발주 기록이 없어요" : "아직 발주 목록이 없어요"}</p>
        <p className="text-sm text-muted-foreground">새 목록에서 부족한 재료와 권장 발주량을 확인해 주세요.</p>
        <Button asChild className="h-[52px] w-full"><Link href="/orders/new">새 발주 목록 만들기</Link></Button>
      </section> : <section className="space-y-3" aria-label="저장한 발주 목록">
        <h2 className="text-lg font-semibold">발주 기록 · {orders.length}건</h2>
        <ul className="space-y-3">{orders.map((order) => <li key={order.id}>
          <Link href={`/orders/${order.id}`} className="block space-y-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold"><time dateTime={order.orderDate}>{order.orderDate}</time> 발주</span><OrderStatusBadge status={order.status} /></div>
            <p className="text-sm text-muted-foreground">{order.itemCount}품목 · 상세 보기</p>
            {order.memo && <p className="line-clamp-2 break-all text-sm">{order.memo}</p>}
          </Link>
        </li>)}</ul>
      </section>}
    </main>
  </>;
}
