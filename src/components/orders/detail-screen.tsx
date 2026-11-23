"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOrder, setOrderStatus } from "@/actions/orders";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionError } from "@/lib/result";
import { formatOrderText } from "@/lib/stock/order";
import type { OrderDetail } from "@/types/contracts";
import { OrderBackLink, OrderMutationError, OrderQuantity, OrderStatusBadge } from "./parts";

type Operation = "ordered" | "draft" | "received" | "delete";
const CONFIRM: Record<Operation, { title: string; description: string; action: string; success: string }> = {
  ordered: { title: "발주완료로 표시할까요?", description: "거래처에 목록을 보낸 뒤 표시해 주세요. 목록을 고치려면 작성중으로 되돌릴 수 있어요.", action: "발주완료로 표시", success: "발주완료로 표시했어요" },
  draft: { title: "작성중으로 되돌릴까요?", description: "품목과 수량을 다시 고칠 수 있어요. 이미 거래처에 보냈다면 변경 내용을 따로 알려 주세요.", action: "작성중으로 되돌리기", success: "작성중으로 되돌렸어요" },
  received: { title: "입고완료로 표시할까요?", description: "입고 등록이 끝났는지 확인해 주세요. 이 버튼은 재고를 늘리지 않아요. 입고완료된 목록은 고치거나 되돌릴 수 없어요.", action: "입고완료로 표시", success: "입고완료로 표시했어요" },
  delete: { title: "이 발주 목록을 삭제할까요?", description: "작성중인 목록을 삭제해요. 삭제한 목록은 되돌릴 수 없어요.", action: "삭제", success: "발주 목록을 삭제했어요" },
};

export function OrderDetailScreen({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [operation, setOperation] = useState<Operation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [loginAvailable, setLoginAvailable] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const submitting = useRef(false);
  const copyLock = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const copyTrigger = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const focusSummary = useRef(false);
  const copyText = formatOrderText(order.items);

  function confirm(next: Operation, button: HTMLButtonElement) {
    trigger.current = button;
    setError(null);
    setLoginAvailable(false);
    setOperation(next);
  }

  async function mutate() {
    if (!operation || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    setLoginAvailable(false);
    let navigating = false;
    try {
      const result = operation === "delete" ? await deleteOrder({ id: order.id }) : await setOrderStatus({ id: order.id, status: operation });
      if (!result.ok) { setError(result.error); return; }
      toast.success(CONFIRM[operation].success);
      focusSummary.current = true;
      setOperation(null);
      if (operation === "delete") { router.replace("/orders"); navigating = true; }
      router.refresh();
    } catch {
      setLoginAvailable(true);
      setError({ code: "INTERNAL", message: "처리 결과를 확인하지 못했어요" });
    } finally {
      if (!navigating) { submitting.current = false; setPending(false); }
    }
  }

  async function copy() {
    if (copyLock.current) return;
    copyLock.current = true;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(copyText);
      toast.success("발주 목록을 복사했어요");
    } catch { setCopyOpen(true); }
    finally { copyLock.current = false; setCopying(false); }
  }

  return <>
    <PageHeader title="발주 상세" />
    <main className="space-y-5 p-4 pb-28">
      <OrderBackLink />
      <section className="space-y-4 rounded-xl border p-4" aria-label="발주 정보">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={summary} tabIndex={-1} className="scroll-mt-20 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring"><time dateTime={order.orderDate}>{order.orderDate}</time> 발주</h2><OrderStatusBadge status={order.status} /></div>
        <p className="text-sm text-muted-foreground">{order.items.length}품목</p>
        {order.memo && <div><h3 className="text-sm text-muted-foreground">메모</h3><p className="whitespace-pre-wrap break-all">{order.memo}</p></div>}
      </section>
      <section className="space-y-3" aria-label="발주 품목">
        <h2 className="text-lg font-semibold">발주 품목</h2>
        {order.items.length ? <ul className="divide-y rounded-xl border">{order.items.map((item) => <li key={item.ingredientId} className="flex items-center justify-between gap-3 p-4"><span className="min-w-0 break-all">{item.name}</span><span className="max-w-[60%] text-right font-semibold"><OrderQuantity qty={item.qty} unit={item.unit} /></span></li>)}</ul> : <p className="rounded-xl border border-dashed p-4 text-muted-foreground">발주 품목이 없어요.</p>}
        <Button ref={copyTrigger} variant="outline" className="h-[52px] w-full" disabled={pending || copying || !order.items.length} onClick={copy}><Copy aria-hidden="true" className="size-4" />{copying ? "복사하고 있어요" : "발주 목록 복사"}</Button>
      </section>
      {order.status === "draft" ? <section className="space-y-3" aria-label="작성중 목록 관리">
        <Button asChild variant="outline" className="h-11 w-full" aria-disabled={pending} onClick={(event) => { if (pending) event.preventDefault(); }}><Link href={`/orders/${order.id}/edit`}><Pencil className="size-4" aria-hidden="true" />품목·수량 수정</Link></Button>
        <Button className="h-[52px] w-full" disabled={pending || !order.items.length} onClick={(event) => confirm("ordered", event.currentTarget)}>발주완료로 표시</Button>
        <Button variant="ghost" className="h-11 w-full text-destructive" disabled={pending} onClick={(event) => confirm("delete", event.currentTarget)}><Trash2 aria-hidden="true" className="size-4" />목록 삭제</Button>
      </section> : order.status === "ordered" ? <section className="space-y-3" aria-label="발주완료 목록 관리">
        <p className="text-sm text-muted-foreground">품목과 수량을 고치려면 먼저 작성중으로 되돌려 주세요.</p>
        <Button variant="outline" className="h-11 w-full" disabled={pending} onClick={(event) => confirm("draft", event.currentTarget)}>작성중으로 되돌리기</Button>
        <Button asChild variant="outline" className="h-11 w-full"><Link href={`/receive?order=${order.id}`}>이 목록으로 입고하기</Link></Button>
        <Button className="h-[52px] w-full" disabled={pending} onClick={(event) => confirm("received", event.currentTarget)}>입고완료로 표시</Button>
      </section> : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">입고완료된 목록이에요. 기록 확인과 복사만 할 수 있어요.</p>}

      <Dialog open={operation !== null} onOpenChange={(open) => { if (!pending && !open) setOperation(null); }}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => {
          event.preventDefault();
          const destination = !focusSummary.current && trigger.current?.isConnected && !trigger.current.disabled ? trigger.current : summary.current;
          focusSummary.current = false;
          destination?.focus();
        }} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}>
          <DialogHeader><DialogTitle>{operation && CONFIRM[operation].title}</DialogTitle><DialogDescription>{operation && CONFIRM[operation].description}</DialogDescription></DialogHeader>
          {error && <><OrderMutationError error={error} loginAvailable={loginAvailable} preserveInput={false} /><Button variant="outline" className="h-11" disabled={pending} onClick={() => { focusSummary.current = true; setOperation(null); router.refresh(); }}>최신 상태 확인</Button></>}
          <DialogFooter><Button variant="outline" className="h-11" disabled={pending} onClick={() => setOperation(null)}>취소</Button><Button variant={operation === "delete" ? "destructive" : "default"} className="h-11" disabled={pending} onClick={mutate}>{pending ? "처리하고 있어요" : operation && CONFIRM[operation].action}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={(event) => { event.preventDefault(); (copyTrigger.current ?? summary.current)?.focus(); }}>
          <DialogHeader><DialogTitle>발주 내용을 직접 복사해 주세요</DialogTitle><DialogDescription>자동으로 복사하지 못했어요. 아래 내용을 길게 눌러 복사할 수 있어요.</DialogDescription></DialogHeader>
          <Label htmlFor="order-copy-text">복사할 발주 내용</Label><Textarea id="order-copy-text" value={copyText} readOnly className="min-h-40 text-base" onFocus={(event) => event.currentTarget.select()} />
          <DialogFooter><Button className="h-11" onClick={() => setCopyOpen(false)}>닫기</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  </>;
}
