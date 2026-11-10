"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordUsage } from "@/actions/usage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { blankUsageItem, validateUsage, type StockIngredient, type UsageDraft } from "./form-input";
import { FieldError, IngredientSelect, RecordError, quantityText } from "./form-parts";
import { useRecordForm } from "./use-record-form";

export function UsageForm({ ingredients, today }: { ingredients: StockIngredient[]; today: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<UsageDraft>(() => ({ usedOn: today, items: ingredients.length ? [blankUsageItem()] : [] }));
  const form = useRecordForm(recordUsage, () => router.refresh());
  const field = (name: string) => <FieldError formId={form.id} field={name} error={form.error} />;
  const locked = form.pending || form.result !== null;
  return <form id={form.id} noValidate aria-label="재료 사용 기록" aria-busy={form.pending} className="space-y-5" onSubmit={(event) => form.submit(event, validateUsage(draft, ingredients, today))}>
    <p className="text-sm text-muted-foreground">직원 식사·시식 등에 쓴 재료를 기록해요. 기한이 빠른 묶음부터 사용하고, 모자란 양은 결과에서 알려 드려요.</p>
    <fieldset disabled={locked} className="space-y-4">
      <legend className="sr-only">사용일과 재료</legend>
      <div className="space-y-2"><Label htmlFor={form.props("usedOn").id}>사용일</Label><Input {...form.props("usedOn")} type="date" max={today} value={draft.usedOn} className="h-12 w-full min-w-0 text-base" onChange={(event) => { setDraft({ ...draft, usedOn: event.target.value }); form.edit(["usedOn"]); }} />{field("usedOn")}</div>
      {ingredients.length === 0 && <Alert><AlertDescription>아직 선택할 수 있는 재료가 없어요. 재료를 먼저 등록해 주세요.<Button asChild variant="outline" className="mt-2 h-11"><Link href="/ingredients">재료 관리</Link></Button></AlertDescription></Alert>}
      {draft.items.map((item, index) => {
        const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
        const update = (changes: Partial<UsageDraft["items"][number]>, fields: string[]) => { setDraft({ ...draft, items: draft.items.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row) }); form.edit(fields); };
        return <section className="space-y-3 rounded-xl border p-4" key={index} aria-label={`사용 품목 ${index + 1}`}>
          <div className="flex items-center justify-between"><h3 className="font-semibold">품목 {index + 1}</h3><Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`사용 품목 ${index + 1} 삭제`} onClick={() => { setDraft({ ...draft, items: draft.items.filter((_, rowIndex) => rowIndex !== index) }); form.edit([], index); }}><Trash2 aria-hidden="true" /></Button></div>
          <div className="space-y-2"><Label htmlFor={form.props(`items.${index}.ingredientId`).id}>사용 재료 {index + 1}</Label><IngredientSelect inputProps={form.props(`items.${index}.ingredientId`)} ingredients={ingredients} value={item.ingredientId} onChange={(value) => update({ ingredientId: value, qty: "" }, [`items.${index}.ingredientId`])} />{field(`items.${index}.ingredientId`)}</div>
          {ingredient && <p className="text-sm text-muted-foreground">오늘 기준 사용 가능 {quantityText(ingredient.availableRemaining, ingredient.unit)}</p>}
          <div className="space-y-2"><Label htmlFor={form.props(`items.${index}.qty`).id}>사용량 {index + 1}{ingredient ? ` (${ingredient.unit})` : ""}</Label><Input {...form.props(`items.${index}.qty`)} type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" value={item.qty} className="h-12 text-base" placeholder="예: 300" onChange={(event) => update({ qty: event.target.value }, [`items.${index}.qty`])} />{field(`items.${index}.qty`)}</div>
          <div className="space-y-2"><Label htmlFor={form.props(`items.${index}.memo`).id}>메모 {index + 1} (선택)</Label><Textarea {...form.props(`items.${index}.memo`)} maxLength={100} value={item.memo} className="min-h-20 text-base md:text-base" placeholder="예: 직원 식사" onChange={(event) => update({ memo: event.target.value }, [`items.${index}.memo`])} />{field(`items.${index}.memo`)}</div>
        </section>;
      })}
      {field("items")}
      <Button type="button" variant="outline" className="h-11 w-full" disabled={!ingredients.length} onClick={() => { setDraft({ ...draft, items: [...draft.items, blankUsageItem()] }); form.edit(["items"]); }}><Plus aria-hidden="true" />사용 품목 추가</Button>
      <p className="text-sm text-muted-foreground">재료의 기본 단위로 소수 셋째 자리까지 입력해 주세요.</p>
    </fieldset>
    <RecordError error={form.error} loginAvailable={form.loginAvailable} />
    {form.result && <section data-record-result tabIndex={-1} className="scroll-mt-20 space-y-3 rounded-xl border p-4 focus-visible:outline-ring" role="status" aria-label="사용 저장 결과">
      <h3 className="font-semibold">사용 기록을 저장했어요</h3>
      {form.result.shortages.length ? <Alert className="border-status-low bg-status-low"><AlertDescription className="text-status-low-foreground"><ul className="space-y-2">{form.result.shortages.map((shortage, index) => <li key={index}>{shortage.name} 재고가 {quantityText(shortage.shortQty, shortage.unit)} 부족했어요. 재고를 확인해 주세요.</li>)}</ul></AlertDescription></Alert> : <p>부족한 재료가 없어요</p>}
      <Button type="button" variant="outline" className="h-11 w-full" onClick={() => { setDraft({ usedOn: draft.usedOn, items: [blankUsageItem()] }); form.reset(); }}>새 사용 기록</Button>
    </section>}
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t bg-background py-4 md:bottom-0"><Button type="submit" className="h-[52px] w-full text-base" disabled={locked || !ingredients.length}>{form.pending ? "저장하고 있어요" : form.result ? "저장 완료" : "사용 기록 저장"}</Button></div>
  </form>;
}
