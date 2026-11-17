import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionError } from "@/lib/result";
import { formatQty } from "@/lib/stock/order";
import type { OrderStatus, Unit } from "@/types/contracts";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { draft: "작성중", ordered: "발주완료", received: "입고완료" };

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={status === "draft" ? "outline" : "secondary"} className={status === "received" ? "border-primary/30 bg-primary/15 text-foreground" : undefined}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function OrderQuantity({ qty, unit }: { qty: number; unit: Unit }) {
  return <span className="tabular-nums">{qty.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}{unit === "ea" ? "개" : unit}{unit !== "ea" && qty >= 1000 && <span className="font-normal text-muted-foreground"> (약 {formatQty(qty, unit)})</span>}</span>;
}

export function OrderBackLink({ href = "/orders", children = "발주 목록" }: { href?: string; children?: React.ReactNode }) {
  return <Button asChild variant="ghost" className="h-11"><Link href={href}>← {children}</Link></Button>;
}

export function OrderMutationError({ error, id, loginAvailable = false, preserveInput = true, details = [] }: { error: ActionError; id?: string; loginAvailable?: boolean; preserveInput?: boolean; details?: string[] }) {
  const auth = error.code === "UNAUTHORIZED";
  return <Alert id={id} variant="destructive" role="alert" tabIndex={-1} className="scroll-mt-20 scroll-mb-44">
    <AlertDescription className="space-y-3">
      <p>{auth ? "로그인이 만료됐어요. 새 창에서 로그인한 뒤 돌아와 다시 시도해 주세요." : error.code === "INTERNAL" ? "처리 결과를 확인하지 못했어요. 기록을 확인한 뒤 다시 시도해 주세요." : error.message}</p>
      {!auth && loginAvailable && <p>로그인이 만료됐을 수 있어요. 새 창에서 로그인 상태를 확인해 주세요.</p>}
      {details.length > 0 && <ul className="list-inside list-disc space-y-1">{details.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      {preserveInput && <p>입력한 내용은 이 화면에 그대로 있어요.</p>}
      <div className="flex flex-wrap gap-2">
        {(auth || loginAvailable) && <Button asChild variant="outline" className="h-11"><a href="/login" target="_blank" rel="noopener noreferrer">다시 로그인 (새 창)</a></Button>}
        <Button asChild variant="outline" className="h-11"><a href="/orders" target="_blank" rel="noopener noreferrer">기록 확인 (새 창)</a></Button>
      </div>
    </AlertDescription>
  </Alert>;
}
