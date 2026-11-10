"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ActionError } from "@/lib/result";
import type { StockHistoryItem } from "@/types/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateHistory, wasteReasons, type HistoryDraft } from "./form-input";
import { FieldError, quantityText } from "./form-parts";

export function RecordHistory({ items, initial, initialError, failed, today }: { items: StockHistoryItem[]; initial: HistoryDraft; initialError: ActionError | null; failed: boolean; today: string }) {
  const id = useId();
  const router = useRouter();
  const query = useSearchParams();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(initialError);
  const [pending, startTransition] = useTransition();
  const props = (field: string) => ({ id: `${id}-${field}`, "aria-invalid": !!error?.fields?.[field], "aria-describedby": error?.fields?.[field] ? `${id}-${field}-error` : undefined });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateHistory(draft, today);
    if (!result.ok) { setError(result.error); return; }
    setError(null);
    const params = new URLSearchParams(query.toString());
    params.set("from", result.data.from); params.set("to", result.data.to);
    if (result.data.type) params.set("type", result.data.type); else params.delete("type");
    startTransition(() => router.replace(`/waste?${params.toString()}`, { scroll: false }));
  }
  return <section id="stock-history" className="scroll-mt-20 space-y-4 border-t pt-6" aria-label="사용·폐기 기록 목록">
    <h2 className="text-lg font-semibold">사용·폐기 기록</h2>
    <form noValidate aria-label="기록 조회 조건" onSubmit={submit} className="space-y-3">
      <fieldset disabled={pending} className="space-y-3"><legend className="sr-only">조회 기간과 종류</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-2"><Label htmlFor={props("from").id}>조회 시작일</Label><Input {...props("from")} type="date" max={today} value={draft.from} className="h-12 min-w-0 text-base" onChange={(event) => setDraft({ ...draft, from: event.target.value })} /><FieldError formId={id} field="from" error={error} /></div>
          <div className="min-w-0 space-y-2"><Label htmlFor={props("to").id}>조회 종료일</Label><Input {...props("to")} type="date" max={today} value={draft.to} className="h-12 min-w-0 text-base" onChange={(event) => setDraft({ ...draft, to: event.target.value })} /><FieldError formId={id} field="to" error={error} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor={props("type").id}>기록 종류</Label><Select value={draft.type || "all"} onValueChange={(value) => setDraft({ ...draft, type: value === "all" ? "" : value })}><SelectTrigger {...props("type")} className="w-full text-base data-[size=default]:h-12"><SelectValue /></SelectTrigger><SelectContent position="popper">{[["all", "전체"], ["usage", "사용"], ["waste", "폐기"]].map(([value, label]) => <SelectItem value={value} key={value} className="min-h-11 text-base">{label}</SelectItem>)}</SelectContent></Select><FieldError formId={id} field="type" error={error} /></div>
      </fieldset>
      <p className="text-sm text-muted-foreground">조회 기간은 최대 31일이에요</p>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error.message}</AlertDescription></Alert>}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={pending}>{pending ? "조회하고 있어요" : "기록 조회"}</Button>
    </form>
    {failed ? <Alert variant="destructive" role="alert"><AlertDescription><p>기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p><Button type="button" variant="outline" className="mt-2 h-11" onClick={() => router.refresh()}>기록 새로고침</Button></AlertDescription></Alert>
      : initialError ? <p className="text-sm text-muted-foreground">조회 조건을 수정해 주세요</p>
      : items.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-muted-foreground">조건에 맞는 기록이 없어요</p>
      : <ul className="space-y-3" aria-label="사용·폐기 이력">{items.map((item, index) => <li key={`${item.date}-${item.ingredientId}-${index}`} className="space-y-2 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{item.date}</p><Badge variant={item.type === "waste" ? "outline" : "secondary"}>{item.type === "waste" ? "폐기" : "사용"}</Badge></div>
        <p className="break-all font-semibold">{item.name} · {item.type === "waste" ? "폐기량" : "사용 요청"} {quantityText(item.qty, item.unit)}</p>
        {item.reason && <p className="text-sm">사유: {wasteReasons[item.reason]}</p>}{item.memo && <p className="break-all text-sm text-muted-foreground">{item.memo}</p>}
        {item.shortQty > 0 && <p className="text-sm text-destructive">부족 {quantityText(item.shortQty, item.unit)} · 이 양은 차감하지 못했어요</p>}
      </li>)}</ul>}
  </section>;
}
