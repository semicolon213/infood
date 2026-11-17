"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveOrder } from "@/actions/orders";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionError } from "@/lib/result";
import type { OrderDetail, OrderDraft } from "@/types/contracts";
import { canAddOrderItem, orderFormDraft, readOrderForm, unmappedOrderErrors, updateOrderError, validateOrderForm, type OrderFormDraft, type OrderIngredient } from "./form-input";
import { OrderBackLink, OrderMutationError, OrderQuantity } from "./parts";

export function OrderForm({ ingredients, today, order, suggestion }: { ingredients: OrderIngredient[]; today: string; order?: OrderDetail; suggestion?: OrderDraft }) {
  const router = useRouter();
  const prefix = useId();
  const [draft, setDraft] = useState(() => orderFormDraft(today, order, suggestion));
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, setPending] = useState(false);
  const [loginAvailable, setLoginAvailable] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const sequence = useRef(draft.items.length);
  const cancelHref = order ? `/orders/${order.id}` : "/orders";
  const fields = error?.fields ?? {};
  const fieldId = (key: string) => `${prefix}-${key}`;
  const inputProps = (key: string) => ({ id: fieldId(key), "aria-invalid": !!fields[key], "aria-describedby": fields[key] ? `${fieldId(key)}-error` : undefined });
  const fieldError = (key: string) => fields[key] && <p id={`${fieldId(key)}-error`} tabIndex={-1} className="scroll-mt-20 scroll-mb-44 text-sm text-destructive focus-visible:outline-2 focus-visible:outline-ring">{fields[key]}</p>;
  function change(next: OrderFormDraft, keys: string[], removedIndex?: number) {
    setDraft(next);
    setError((current) => updateOrderError(current, keys, removedIndex));
  }
  function report(next: ActionError) {
    setError(next);
    requestAnimationFrame(() => {
      const target = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? (next.fields?.items ? document.getElementById(`${fieldId("items")}-error`) : null) ?? document.getElementById(`${prefix}-error`);
      target?.focus();
      target?.scrollIntoView({ block: "center" });
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const submitted = readOrderForm(new FormData(event.currentTarget), draft);
    setDraft(submitted);
    const parsed = validateOrderForm(submitted, ingredients, today, order?.id);
    if (!parsed.ok) { report(parsed.error); return; }
    submitting.current = true; setPending(true); setError(null); setLoginAvailable(false);
    let navigating = false;
    try {
      const result = await saveOrder(parsed.data);
      if (!result.ok) { report(result.error); return; }
      toast.success("발주 목록을 저장했어요");
      router.push(`/orders/${result.data.id}`);
      router.refresh();
      navigating = true;
    } catch {
      setLoginAvailable(true);
      report({ code: "INTERNAL", message: "저장 결과를 확인하지 못했어요" });
    } finally {
      if (!navigating) { submitting.current = false; setPending(false); }
    }
  }
  return <>
    <PageHeader title={order ? "발주 수정" : "새 발주 목록"} />
    <main className="space-y-4 p-4 pb-44">
      <OrderBackLink href={cancelHref}>{order ? "상세로 돌아가기" : "발주 목록"}</OrderBackLink>
      <form ref={form} aria-label={order ? "발주 수정" : "발주 등록"} aria-busy={pending} noValidate onSubmit={submit} className="space-y-6">
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          <div className="space-y-2"><Label htmlFor={fieldId("orderDate")}>발주일</Label><Input {...inputProps("orderDate")} name="orderDate" type="date" max={today} value={draft.orderDate} className="h-11 min-w-0 text-base" onChange={(e) => change({ ...draft, orderDate: e.target.value }, ["orderDate"])} />{fieldError("orderDate")}</div>
          {!order && !suggestion?.items.length && <Alert><AlertDescription>부족한 재료가 없어요. 필요한 품목을 직접 추가할 수 있어요.</AlertDescription></Alert>}
          {!ingredients.length && <Alert><AlertDescription>등록된 재료가 없어요. 재료를 먼저 등록해 주세요.<Button asChild variant="link" className="h-11"><Link href="/ingredients/new">재료 등록</Link></Button></AlertDescription></Alert>}
          <section aria-label="발주 품목" className="space-y-3">
            <h2 className="text-lg font-semibold">발주 품목</h2>
            <p className="text-sm text-muted-foreground">수량은 재료의 기본 단위로 입력해 주세요. 0 이하인 품목은 저장할 때 제외돼요.</p>
            {fieldError("items")}
            {draft.items.map((row, index) => {
              const itemField = `items.${index}`;
              const ingredient = ingredients.find((item) => item.id === row.ingredientId);
              const previous = order?.items.find((item) => item.ingredientId === row.ingredientId) ?? suggestion?.items.find((item) => item.ingredientId === row.ingredientId);
              const recommended = suggestion?.items.find((item) => item.ingredientId === row.ingredientId);
              return <article key={row.key} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">품목 {index + 1}</h3><Button type="button" variant="ghost" className="h-11 min-w-11" aria-label={`품목 ${index + 1} 삭제`} onClick={() => change({ ...draft, items: draft.items.filter((_, i) => i !== index) }, ["items"], index)}><Trash2 className="size-4" aria-hidden="true" /></Button></div>
                <div className="space-y-2"><Label htmlFor={fieldId(`${itemField}.ingredientId`)}>품목 {index + 1} 재료</Label>
                  <Select name={`${itemField}.ingredientId`} disabled={pending} value={row.ingredientId} onValueChange={(value) => change({ ...draft, items: draft.items.map((item, i) => i === index ? { ...item, ingredientId: value, qty: item.ingredientId === value ? item.qty : "" } : item) }, [`${itemField}.ingredientId`, `${itemField}.qty`])}>
                    <SelectTrigger {...inputProps(`${itemField}.ingredientId`)} className="h-11 data-[size=default]:h-11 w-full min-w-0 text-base"><SelectValue placeholder="재료 선택" /></SelectTrigger>
                    <SelectContent>{row.ingredientId && !ingredient && <SelectItem value={row.ingredientId} disabled className="min-h-11">{previous?.name ?? "재료"} (현재 선택 불가)</SelectItem>}{ingredients.map((item) => <SelectItem key={item.id} value={item.id} className="min-h-11" disabled={draft.items.some((other, i) => i !== index && other.ingredientId === item.id)}>{item.name} ({item.unit})</SelectItem>)}</SelectContent>
                  </Select>{fieldError(`${itemField}.ingredientId`)}</div>
                <div className="space-y-2"><Label htmlFor={fieldId(`${itemField}.qty`)}>품목 {index + 1} 발주량 ({ingredient?.unit ?? previous?.unit ?? "기본 단위"})</Label><Input {...inputProps(`${itemField}.qty`)} name={`${itemField}.qty`} type="text" inputMode="decimal" value={row.qty} className="h-11 text-base scroll-mt-20 scroll-mb-44" onChange={(e) => change({ ...draft, items: draft.items.map((item, i) => i === index ? { ...item, qty: e.target.value } : item) }, [`${itemField}.qty`, "items"])} />{fieldError(`${itemField}.qty`)}</div>
                {recommended && <div className="space-y-1 text-sm text-muted-foreground"><p>권장 <span className="font-medium text-foreground"><OrderQuantity qty={recommended.suggestedQty} unit={recommended.unit} /></span></p><p>사용 가능 <OrderQuantity qty={recommended.availableQty} unit={recommended.unit} /> · 적정 <OrderQuantity qty={recommended.targetQty} unit={recommended.unit} /></p><p>발주했지만 아직 안 온 양 <OrderQuantity qty={recommended.pendingQty} unit={recommended.unit} /></p></div>}
              </article>;
            })}
            <Button type="button" variant="outline" className="h-11 w-full" disabled={!canAddOrderItem(draft.items, ingredients)} onClick={() => change({ ...draft, items: [...draft.items, { key: sequence.current++, ingredientId: "", qty: "" }] }, ["items"])}><Plus className="size-4" aria-hidden="true" />품목 추가</Button>
          </section>
          <div className="space-y-2"><Label htmlFor={fieldId("memo")}>메모 (선택)</Label><Textarea {...inputProps("memo")} name="memo" value={draft.memo} maxLength={200} className="min-h-24 text-base" onChange={(e) => change({ ...draft, memo: e.target.value }, ["memo"])} /><p className="text-sm text-muted-foreground">{draft.memo.length}/200자</p>{fieldError("memo")}</div>
        </fieldset>
        {error && <OrderMutationError id={`${prefix}-error`} error={error} loginAvailable={loginAvailable} details={unmappedOrderErrors(fields, draft.items.length)} />}
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t bg-background p-4 md:bottom-0 md:left-56"><div className="mx-auto flex max-w-[688px] gap-3"><Button asChild variant="outline" className="h-[52px]" aria-disabled={pending} onClick={(e) => { if (pending) e.preventDefault(); }}><Link href={cancelHref}>취소</Link></Button><Button type="submit" className="h-[52px] flex-1" disabled={pending || !ingredients.length}>{pending ? "저장하고 있어요" : "작성중으로 저장"}</Button></div></div>
      </form>
    </main>
  </>;
}
