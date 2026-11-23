"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ActionResult } from "@/lib/result";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { storageLabels } from "./view-model";
import { emptyDraft, ingredientFormSchema, formErrors, type IngredientFormDraft } from "./form-input";
export type { IngredientFormDraft } from "./form-input";

export function IngredientForm({ initial, unitLocked = false, save, onSaved, onCancel }: {
  initial?: IngredientFormDraft; unitLocked?: boolean;
  save?: (draft: IngredientFormDraft) => Promise<ActionResult<{ id: string }>>;
  onSaved?: (id: string) => void; onCancel?: () => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<IngredientFormDraft>(initial ?? emptyDraft);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const fieldId = (name: string) => `${formId}-${name}`;
  const change = <K extends keyof IngredientFormDraft>(key: K, value: IngredientFormDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFields((current) => Object.fromEntries(Object.entries(current).filter(([field]) => field !== key && !field.startsWith(`${key}.`))));
    setMessage("");
  };
  const error = (name: string) => fields[name] ? <p id={`${fieldId(name)}-error`} className="text-sm text-destructive">{fields[name]}</p> : null;
  const inputProps = (name: string) => ({ id: fieldId(name), "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `${fieldId(name)}-error` : undefined });
  function report(message: string, nextFields: Record<string, string>) {
    setFields(nextFields); setMessage(message);
    requestAnimationFrame(() => document.getElementById(fieldId(Object.keys(nextFields)[0]))?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setMessage("");
    const result = ingredientFormSchema.safeParse(draft);
    if (!result.success) { report("입력한 내용을 다시 확인해 주세요", formErrors(result.error)); return; }
    setFields({});
    if (!save) { setMessage("입력한 내용을 확인했어요. 아직 저장한 내용은 없어요"); return; }
    submitting.current = true; setPending(true);
    let navigating = false;
    try {
      const response = await save(draft);
      if (!response.ok) { report(response.error.message, response.error.fields ?? {}); return; }
      setMessage("재료를 저장했어요"); onSaved?.(response.data.id);
      navigating = !!onSaved;
    } catch { setMessage("저장하지 못했어요. 입력한 내용은 그대로예요. 다시 시도해 주세요"); }
    finally { if (!navigating) { submitting.current = false; setPending(false); } }
  }
  return <form onSubmit={submit} noValidate className="space-y-6" aria-label={initial ? "재료 수정" : "재료 등록"}>
    {!save && <Alert><AlertDescription>입력한 내용을 확인할 수 있어요. 아직 저장은 할 수 없어요.</AlertDescription></Alert>}
    <fieldset disabled={pending} className="space-y-5">
      <legend className="mb-4 text-lg font-semibold">기본 정보</legend>
      <div className="space-y-2"><Label htmlFor={fieldId("name")}>재료 이름 <span className="text-destructive">*</span></Label><Input {...inputProps("name")} name="name" maxLength={30} autoComplete="off" value={draft.name} onChange={(event) => change("name", event.target.value)} placeholder="예: 대파" className="h-12 text-base" />{error("name")}</div>
      <div className="space-y-2"><Label htmlFor={fieldId("category")}>카테고리 (선택)</Label><Input {...inputProps("category")} name="category" maxLength={20} value={draft.category} onChange={(event) => change("category", event.target.value)} placeholder="예: 채소" className="h-12 text-base" />{error("category")}</div>
      <div className="space-y-2"><Label htmlFor={fieldId("unit")}>기본 단위</Label><Select value={draft.unit} disabled={unitLocked} onValueChange={(value) => change("unit", value as IngredientFormDraft["unit"])}><SelectTrigger {...inputProps("unit")} className="w-full text-base data-[size=default]:h-12"><SelectValue /></SelectTrigger><SelectContent><SelectItem className="min-h-11 text-base" value="g">g (무게)</SelectItem><SelectItem className="min-h-11 text-base" value="ml">ml (부피)</SelectItem><SelectItem className="min-h-11 text-base" value="ea">ea (개수)</SelectItem></SelectContent></Select>{error("unit")}{unitLocked && <p className="text-sm text-muted-foreground">남은 입고 묶음이 있어 기본 단위를 바꿀 수 없어요</p>}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor={fieldId("minStock")}>최소 재고 ({draft.unit})</Label><Input {...inputProps("minStock")} name="minStock" type="number" min="0" step="0.001" inputMode="decimal" value={draft.minStock} onChange={(event) => change("minStock", event.target.value)} className="h-12 text-base" />{error("minStock")}</div>
        <div className="space-y-2"><Label htmlFor={fieldId("targetStock")}>적정 재고 (선택)</Label><Input {...inputProps("targetStock")} name="targetStock" type="number" min="0" step="0.001" inputMode="decimal" value={draft.targetStock} onChange={(event) => change("targetStock", event.target.value)} placeholder="입력 안 함" className="h-12 text-base" />{error("targetStock")}</div>
      </div>
      <p className="text-sm text-muted-foreground">적정 재고는 최소 재고 이상으로 입력해 주세요</p>
    </fieldset>
    <fieldset disabled={pending} className="space-y-5">
      <legend className="mb-4 text-lg font-semibold">보관과 기한</legend>
      <div className="space-y-2"><Label htmlFor={fieldId("storage")}>보관 방식</Label><Select value={draft.storage} onValueChange={(value) => change("storage", value as IngredientFormDraft["storage"])}><SelectTrigger {...inputProps("storage")} className="w-full text-base data-[size=default]:h-12"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(storageLabels).map(([value,label]) => <SelectItem className="min-h-11 text-base" key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>{error("storage")}</div>
      <Label htmlFor={fieldId("trackExpiry")} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-base"><Checkbox id={fieldId("trackExpiry")} checked={draft.trackExpiry} onCheckedChange={(value) => change("trackExpiry", value === true)} />유통기한 추적</Label>
      <p className="text-sm text-muted-foreground">소금·설탕처럼 기한을 추적하지 않는 재료는 꺼 주세요</p>
      {draft.trackExpiry && <div className="space-y-2"><Label htmlFor={fieldId("defaultShelfDays")}>기본 보관일수 (일)</Label><Input {...inputProps("defaultShelfDays")} name="defaultShelfDays" type="number" min="1" max="3650" step="1" inputMode="numeric" value={draft.defaultShelfDays} onChange={(event) => change("defaultShelfDays", event.target.value)} placeholder="예: 7" className="h-12 text-base" />{error("defaultShelfDays")}<p className="text-sm text-muted-foreground">입고할 때 기한을 비워 두면 이 일수를 써요. 매장 기준 권장 기한이에요.</p></div>}
    </fieldset>
    <fieldset disabled={pending} className="space-y-3">
      <legend className="mb-3 text-lg font-semibold">환산 단위 (선택)</legend>
      <p className="text-sm text-muted-foreground">예: 대파 1단 = 1000g. kg·L는 자동으로 환산해요.</p>
      {draft.units.map((unit, index) => <div key={index} className="space-y-3 rounded-xl border p-3">
        <div className="flex items-center justify-between"><span className="text-sm font-medium">환산 단위 {index + 1}</span><Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`환산 단위 ${index + 1} 삭제`} onClick={() => change("units", draft.units.filter((_, itemIndex) => itemIndex !== index))}><Trash2 aria-hidden="true" /></Button></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor={fieldId(`units.${index}.unitName`)}>단위 이름</Label><Input {...inputProps(`units.${index}.unitName`)} maxLength={10} value={unit.unitName} placeholder="예: 단" className="h-12 text-base" onChange={(event) => change("units", draft.units.map((item, itemIndex) => itemIndex === index ? { ...item, unitName: event.target.value } : item))} />{error(`units.${index}.unitName`)}</div><div className="space-y-2"><Label htmlFor={fieldId(`units.${index}.factor`)}>1단위당 {draft.unit}</Label><Input {...inputProps(`units.${index}.factor`)} type="number" inputMode="decimal" min="0.0001" step="0.0001" value={unit.factor} placeholder="예: 1000" className="h-12 text-base" onChange={(event) => change("units", draft.units.map((item, itemIndex) => itemIndex === index ? { ...item, factor: event.target.value } : item))} />{error(`units.${index}.factor`)}</div></div>
      </div>)}
      {error("units")}
      <Button type="button" variant="outline" className="h-11 w-full" disabled={draft.units.length >= 10} onClick={() => change("units", [...draft.units, { unitName: "", factor: "" }])}><Plus aria-hidden="true" />환산 단위 추가 ({draft.units.length}/10)</Button>
    </fieldset>
    {message && <Alert variant={Object.keys(fields).length ? "destructive" : "default"}><AlertDescription>{message}</AlertDescription></Alert>}
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex gap-3 border-t bg-background py-4 md:bottom-0">
      {onCancel && <Button type="button" variant="outline" className="h-[52px]" disabled={pending} onClick={onCancel}>취소</Button>}
      <Button type="submit" className="h-[52px] flex-1 text-base" disabled={pending}>{pending ? "저장하고 있어요" : save ? "재료 저장" : "입력 확인"}</Button>
    </div>
  </form>;
}
