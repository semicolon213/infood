"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordWaste } from "@/actions/usage";
import { daysLeft } from "@/lib/stock/expiry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { blankWaste, selectWasteIngredient, selectWasteLot, wasteReasons, wasteSelection, validateWaste, type StockIngredient, type WasteDraft } from "./form-input";
import { FieldError, IngredientSelect, RecordError, quantityText } from "./form-parts";
import { useRecordForm } from "./use-record-form";

export function WasteForm({ ingredients, today, requestedLotId }: { ingredients: StockIngredient[]; today: string; requestedLotId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<WasteDraft>(() => wasteSelection(ingredients, requestedLotId, today));
  const form = useRecordForm(recordWaste, () => router.refresh());
  const ingredient = ingredients.find((item) => item.id === draft.ingredientId);
  const lots = ingredient?.lots ?? [];
  const lot = lots.find((item) => item.id === draft.lotId);
  const locked = form.pending || form.result !== null;
  const field = (name: string) => <FieldError formId={form.id} field={name} error={form.error} />;
  return <form id={form.id} noValidate aria-label="묶음 폐기 기록" aria-busy={form.pending} className="space-y-5" onSubmit={(event) => form.submit(event, validateWaste(draft, ingredients))}>
    <p className="text-sm text-muted-foreground">폐기할 입고 묶음을 직접 골라 주세요. 선택한 묶음에서만 폐기해요.</p>
    {requestedLotId !== undefined && !draft.lotId && !form.result && <Alert role="alert"><AlertDescription>해당 묶음을 찾지 못했어요. 재료와 묶음을 다시 선택해 주세요.</AlertDescription></Alert>}
    <fieldset disabled={locked} className="space-y-4"><legend className="sr-only">폐기할 재료와 수량</legend>
      <div className="space-y-2"><Label htmlFor={form.props("ingredientId").id}>폐기 재료</Label><IngredientSelect inputProps={form.props("ingredientId")} ingredients={ingredients} value={draft.ingredientId} onChange={(value) => { setDraft(selectWasteIngredient(draft, value)); form.edit(["ingredientId", "lotId", "qty"]); }} />{field("ingredientId")}</div>
      {!ingredients.length && <Alert><AlertDescription>아직 선택할 수 있는 재료가 없어요.<Button asChild variant="outline" className="mt-2 h-11"><Link href="/ingredients">재료 관리</Link></Button></AlertDescription></Alert>}
      {ingredient && <fieldset {...form.props("lotId")} tabIndex={-1} className="space-y-3"><legend className="mb-2 font-semibold">폐기할 묶음</legend>
        {lots.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">남은 입고 묶음이 없어요. 다른 재료를 선택해 주세요.</p>}
        {lots.map((item) => {
          const days = item.expiresAt ? daysLeft(item.expiresAt, today) : null;
          return <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 has-checked:border-primary">
            <input type="radio" name={`${form.id}-lot`} className="mt-1 size-5 shrink-0 accent-primary" value={item.id} checked={draft.lotId === item.id} onChange={() => { const next = selectWasteLot(draft, item.id); const validation = validateWaste(next, ingredients); setDraft(next); form.edit(["lotId", ...(validation.ok || !validation.error.fields?.qty ? ["qty"] : [])]); }} />
            <span className="min-w-0 flex-1 space-y-2"><span className="block font-medium">{item.receivedAt} 입고 · 잔량 {quantityText(item.remaining, ingredient.unit)}</span><span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{item.expiresAt ? `기한 ${item.expiresAt}` : "기한 정보 없음"}{days !== null && <Badge variant="outline" className={days < 0 ? "border-transparent bg-status-expired text-status-expired-foreground" : days <= 1 ? "border-destructive text-destructive" : days <= 3 ? "border-transparent bg-status-soon text-status-soon-foreground" : ""}>{days < 0 ? "지남" : `D-${days}`}</Badge>}</span></span>
          </label>;
        })}
        {field("lotId")}
        <p className="text-sm text-muted-foreground">매장 기준 권장 기한이에요</p>
      </fieldset>}
      {!ingredient && field("lotId")}
      {lot?.expiresAt && lot.expiresAt < today && <p className="text-sm text-destructive">기한이 지난 재료는 쓰지 말고 폐기 처리해 주세요</p>}
      <div className="space-y-2"><Label htmlFor={form.props("qty").id}>폐기량{ingredient ? ` (${ingredient.unit})` : ""}</Label><Input {...form.props("qty")} type="number" inputMode="decimal" min="0.001" max={lot?.remaining ?? 1000000} step="0.001" value={draft.qty} className="h-12 text-base" onChange={(event) => { setDraft({ ...draft, qty: event.target.value }); form.edit(["qty"]); }} />{field("qty")}<p className="text-sm text-muted-foreground">소수 셋째 자리까지, 선택한 묶음의 남은 양 이내로 입력해 주세요.</p></div>
      <div className="space-y-2"><Label htmlFor={form.props("reason").id}>폐기 사유</Label><Select value={draft.reason} onValueChange={(value) => { setDraft({ ...draft, reason: value }); form.edit(["reason"]); }}><SelectTrigger {...form.props("reason")} className="w-full text-base data-[size=default]:h-12"><SelectValue placeholder="사유를 선택해 주세요" /></SelectTrigger><SelectContent position="popper">{Object.entries(wasteReasons).map(([value, label]) => <SelectItem value={value} key={value} className="min-h-11 text-base">{label}</SelectItem>)}</SelectContent></Select>{field("reason")}</div>
      <div className="space-y-2"><Label htmlFor={form.props("memo").id}>폐기 메모 (선택)</Label><Textarea {...form.props("memo")} maxLength={100} value={draft.memo} className="min-h-20 text-base md:text-base" onChange={(event) => { setDraft({ ...draft, memo: event.target.value }); form.edit(["memo"]); }} placeholder="예: 포장 파손" />{field("memo")}</div>
    </fieldset>
    <RecordError error={form.error} loginAvailable={form.loginAvailable} />
    {form.result && <section data-record-result tabIndex={-1} className="scroll-mt-20 space-y-3 rounded-xl border p-4 focus-visible:outline-ring" role="status" aria-label="폐기 저장 결과"><h3 className="font-semibold">폐기 기록을 저장했어요</h3><p>이 묶음의 남은 양: {quantityText(form.result.remaining, ingredient?.unit ?? "")}</p><Button type="button" variant="outline" className="h-11 w-full" onClick={() => { setDraft({ ...blankWaste(), ingredientId: draft.ingredientId }); form.reset(); }}>새 폐기 기록</Button></section>}
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t bg-background py-4 md:bottom-0"><Button type="submit" variant="destructive" className="h-[52px] w-full text-base" disabled={locked || !ingredients.length}>{form.pending ? "저장하고 있어요" : form.result ? "저장 완료" : "폐기 기록 저장"}</Button></div>
  </form>;
}
