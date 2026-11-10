"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ActionResult, ActionError } from "@/lib/result";
import type { MenuDetail, MenuInput } from "@/types/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_MENU_PRICE, menuDraft, updateMenuError, validateMenuDraft, type MenuDraft, type MenuIngredient } from "./form-input";
import { MenuLoginRecovery } from "./login-recovery";

export function MenuForm({ menu, ingredients, saveAction, onSaved, onCancel }: {
  menu?: MenuDetail; ingredients: MenuIngredient[];
  saveAction: (input: MenuInput) => Promise<ActionResult<{ id: string }>>;
  onSaved: (id: string) => void; onCancel: () => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<MenuDraft>(() => menuDraft(menu));
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, setPending] = useState(false);
  const [loginAvailable, setLoginAvailable] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const fields = error?.fields ?? {};
  const fieldId = (field: string) => `${formId}-${field}`;
  const inputProps = (field: string) => ({ id: fieldId(field), "aria-invalid": !!fields[field], "aria-describedby": fields[field] ? `${fieldId(field)}-error` : undefined });
  const fieldError = (field: string) => fields[field] && <p id={`${fieldId(field)}-error`} className="text-sm text-destructive">{fields[field]}</p>;
  function change(next: MenuDraft, changed: string[], removedIndex?: number) {
    setDraft(next);
    setError((current) => updateMenuError(current, next, changed, removedIndex));
  }
  function report(nextError: ActionError) {
    setError(nextError);
    requestAnimationFrame(() => {
      const first = form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (first) first.focus();
      else document.getElementById(`${formId}-error`)?.focus();
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const parsed = validateMenuDraft(draft, ingredients, menu?.id);
    if (!parsed.ok) { report(parsed.error); return; }
    submitting.current = true;
    setPending(true);
    setError(null);
    setLoginAvailable(false);
    let navigating = false;
    try {
      const result = await saveAction(parsed.data);
      if (!result.ok) { report(result.error); return; }
      onSaved(result.data.id);
      navigating = true;
    } catch {
      setLoginAvailable(true);
      report({ code: "INTERNAL", message: "저장하지 못했어요. 입력한 내용은 그대로예요. 다시 시도해 주세요" });
    } finally {
      if (!navigating) { submitting.current = false; setPending(false); }
    }
  }
  return <form ref={form} noValidate onSubmit={submit} className="space-y-6" aria-label={menu ? "메뉴 수정" : "메뉴 등록"} aria-busy={pending}>
    {menu && !menu.isActive && <Alert><AlertDescription>비활성 메뉴예요. 정보를 수정해도 판매 목록에 다시 표시되지는 않아요.</AlertDescription></Alert>}
    <fieldset disabled={pending} className="space-y-4">
      <legend className="mb-4 text-lg font-semibold">기본 정보</legend>
      <div className="space-y-2">
        <Label htmlFor={fieldId("name")}>메뉴 이름</Label>
        <Input {...inputProps("name")} autoComplete="off" maxLength={30} value={draft.name} onChange={(event) => change({ ...draft, name: event.target.value }, ["name"])} placeholder="예: 된장찌개" className="h-12 text-base" />
        {fieldError("name")}
      </div>
      <div className="space-y-2">
        <Label htmlFor={fieldId("price")}>판매가 (원)</Label>
        <Input {...inputProps("price")} type="number" inputMode="numeric" min="0" max={MAX_MENU_PRICE} step="1" value={draft.price} onChange={(event) => change({ ...draft, price: event.target.value }, ["price"])} placeholder="예: 8000" className="h-12 text-base" />
        {fieldError("price")}
      </div>
    </fieldset>
    <fieldset disabled={pending} className="space-y-3">
      <legend className="mb-3 text-lg font-semibold">1인분 레시피</legend>
      <p className="text-sm text-muted-foreground">메뉴 1인분에 쓰는 양을 재료의 기본 단위로 입력해 주세요. 판매량을 기록하면 이 양만큼 재고에서 차감해요.</p>
      {ingredients.length === 0 && <Alert><AlertDescription>아직 선택할 수 있는 재료가 없어요. 재료를 먼저 등록하면 레시피에 추가할 수 있어요.</AlertDescription></Alert>}
      {draft.recipe.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">등록한 레시피가 없어요. 재료 없이 저장할 수도 있지만, 판매해도 재고가 차감되지 않아요.</p>}
      {draft.recipe.map((item, index) => {
        const ingredient = ingredients.find((candidate) => candidate.id === item.ingredientId);
        const previous = menu?.recipe.find((candidate) => candidate.ingredientId === item.ingredientId);
        return <div key={index} className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">재료 {index + 1}</h3>
            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`레시피 재료 ${index + 1} 삭제`} onClick={() => change({ ...draft, recipe: draft.recipe.filter((_, itemIndex) => itemIndex !== index) }, [], index)}><Trash2 aria-hidden="true" /></Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId(`recipe.${index}.ingredientId`)}>레시피 재료 {index + 1}</Label>
            <Select value={item.ingredientId} onValueChange={(value) => change({ ...draft, recipe: draft.recipe.map((row, itemIndex) => itemIndex === index ? { ...row, ingredientId: value } : row) }, [`recipe.${index}.ingredientId`])}>
              <SelectTrigger {...inputProps(`recipe.${index}.ingredientId`)} className="w-full text-base data-[size=default]:h-12"><SelectValue placeholder="재료를 선택해 주세요" /></SelectTrigger>
              <SelectContent position="popper">
                {!ingredient && item.ingredientId && <SelectItem value={item.ingredientId} disabled className="min-h-11 text-base">{previous?.name ?? "선택한 재료"} · 현재 선택 불가</SelectItem>}
                {ingredients.map((option) => <SelectItem key={option.id} value={option.id} className="min-h-11 text-base" disabled={draft.recipe.some((row, rowIndex) => rowIndex !== index && row.ingredientId === option.id)}>{option.name} ({option.unit})</SelectItem>)}
              </SelectContent>
            </Select>
            {fieldError(`recipe.${index}.ingredientId`)}
          </div>
          <div className="space-y-2">
            <Label htmlFor={fieldId(`recipe.${index}.qty`)}>1인분 소요량 {index + 1}{ingredient ? ` (${ingredient.unit})` : previous ? ` (${previous.unit})` : ""}</Label>
            <Input {...inputProps(`recipe.${index}.qty`)} type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" value={item.qty} onChange={(event) => change({ ...draft, recipe: draft.recipe.map((row, itemIndex) => itemIndex === index ? { ...row, qty: event.target.value } : row) }, [`recipe.${index}.qty`])} placeholder="예: 150" className="h-12 text-base" />
            {fieldError(`recipe.${index}.qty`)}
          </div>
        </div>;
      })}
      {fieldError("recipe")}
      <p className="text-sm text-muted-foreground">소요량은 소수 셋째 자리까지 입력할 수 있어요.</p>
      <Button type="button" variant="outline" className="h-11 w-full" disabled={ingredients.length === 0 || draft.recipe.length >= ingredients.length} onClick={() => change({ ...draft, recipe: [...draft.recipe, { ingredientId: "", qty: "" }] }, [])}><Plus aria-hidden="true" />레시피 재료 추가</Button>
      <Button asChild variant="ghost" className="h-11"><Link href="/ingredients">재료 관리로 이동</Link></Button>
    </fieldset>
    {error && <Alert id={`${formId}-error`} tabIndex={-1} variant="destructive" role="alert"><AlertDescription><p>{error.message}</p>{(loginAvailable || error.code === "UNAUTHORIZED") && <MenuLoginRecovery />}</AlertDescription></Alert>}
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex gap-3 border-t bg-background py-4 md:bottom-0">
      <Button type="button" variant="outline" className="h-[52px]" disabled={pending} onClick={onCancel}>취소</Button>
      <Button type="submit" className="h-[52px] flex-1 text-base" disabled={pending}>{pending ? "저장하고 있어요" : "메뉴 저장"}</Button>
    </div>
  </form>;
}
