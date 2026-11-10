"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { receiveStock } from "@/actions/receive";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { resolveExpiry } from "@/lib/stock/expiry";
import { ReceiveStockInput, type IngredientSummary, type ReceivedLot } from "@/types/contracts";

export type ReceiveIngredient = Pick<IngredientSummary, "id" | "name" | "unit" | "units" | "trackExpiry" | "defaultShelfDays">;

type Row = { key: number; ingredientId: string; qty: string; unit: string; totalPrice: string; expiresAt: string };

// 단위 선택지: 기본 단위, kg/L(해당 시), 재료에 등록한 환산 단위 (09_DESIGN 4.2, BR-03)
function unitOptions(ing: ReceiveIngredient): string[] {
  const big = ing.unit === "g" ? ["kg"] : ing.unit === "ml" ? ["L"] : [];
  return [ing.unit, ...big, ...ing.units.map((u) => u.unitName)];
}

// 행 아래 안내: 환산 계수, 비워 둘 때의 유통기한 (FR-STK-02). 계산은 lib/stock만 쓴다
function rowHint(ing: ReceiveIngredient, row: Row, receivedOn: string): string | null {
  const custom = ing.units.find((u) => u.unitName === row.unit);
  const factor = custom ? `1${custom.unitName} = ${custom.factor.toLocaleString()}${ing.unit}` : null;
  if (!ing.trackExpiry) return [factor, "기한 추적 안 함"].filter(Boolean).join(" · ");
  if (row.expiresAt) return factor;
  const r = resolveExpiry({ receivedOn, trackExpiry: true, defaultShelfDays: ing.defaultShelfDays });
  const expiry = r.ok && r.value.expiresAt ? `유통기한 비우면 ${shortDate(r.value.expiresAt)} (${r.value.basis})` : null;
  return [factor, expiry].filter(Boolean).join(" · ") || null;
}

function shortDate(d: string): string {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

export function ReceiveForm({ ingredients, today }: { ingredients: ReceiveIngredient[]; today: string }) {
  const [receivedOn, setReceivedOn] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<ReceivedLot[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [nextKey, setNextKey] = useState(0);

  const byId = new Map(ingredients.map((i) => [i.id, i]));

  function addRow(ing: ReceiveIngredient) {
    setRows((rs) => [...rs, { key: nextKey, ingredientId: ing.id, qty: "", unit: ing.unit, totalPrice: "", expiresAt: "" }]);
    setNextKey((k) => k + 1);
    setPickerOpen(false);
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: number) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setErrors({}); // 행 번호가 바뀌므로 오류 표시를 지운다
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = {
      receivedOn,
      items: rows.map((r) => ({
        ingredientId: r.ingredientId,
        qty: r.qty === "" ? NaN : Number(r.qty),
        unit: r.unit,
        totalPrice: r.totalPrice === "" ? undefined : Number(r.totalPrice),
        expiresAt: byId.get(r.ingredientId)?.trackExpiry && r.expiresAt ? r.expiresAt : undefined,
      })),
    };

    // 서버와 같은 계약 스키마로 먼저 확인한다 (서버도 다시 검증)
    const parsed = ReceiveStockInput.safeParse(input);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        // 계약의 수량 스키마에는 한국어 문구가 없어 화면 문구로 바꾼다 (09_DESIGN 7장)
        const qty = issue.path.at(-1) === "qty";
        fields[issue.path.map(String).join(".")] ??= qty ? "수량을 다시 확인해 주세요" : issue.message;
      }
      setErrors(fields);
      return;
    }
    if (receivedOn > today) {
      setErrors({ receivedOn: "미래 날짜는 입력할 수 없어요" });
      return;
    }

    startTransition(async () => {
      const res = await receiveStock(parsed.data);
      if (res.ok) {
        setErrors({});
        setResult(res.data.lots);
        toast.success(`${res.data.lots.length}품목을 입고했어요`);
        navigator.vibrate?.(50);
        return;
      }
      setErrors(res.error.fields ?? {});
      if (res.error.code === "VALIDATION" || res.error.code === "NOT_FOUND") toast.error(res.error.message);
      else toast.error("저장하지 못했어요", { action: { label: "다시 시도", onClick: () => form.requestSubmit() } });
    });
  }

  function reset() {
    setRows([]);
    setErrors({});
    setResult(null);
  }

  const itemsError = errors.items;

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="received-on" className="text-base">
            입고일
          </Label>
          <Input
            id="received-on"
            type="date"
            value={receivedOn}
            max={today}
            onChange={(e) => setReceivedOn(e.target.value)}
            aria-invalid={errors.receivedOn ? true : undefined}
            className="h-11 w-auto text-base"
          />
        </div>
        {errors.receivedOn && <p className="text-sm text-destructive">{errors.receivedOn}</p>}

        {rows.map((row, i) => {
          const ing = byId.get(row.ingredientId);
          if (!ing) return null;
          const err = (f: string) => errors[`items.${i}.${f}`];
          const hint = rowHint(ing, row, receivedOn);
          return (
            <Card key={row.key} className="gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{ing.name}</span>
                <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => removeRow(row.key)} aria-label={`${ing.name} 빼기`}>
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <Input
                  inputMode="decimal"
                  placeholder="수량"
                  aria-label={`${ing.name} 수량`}
                  value={row.qty}
                  onChange={(e) => updateRow(row.key, { qty: e.target.value.replace(/[^\d.]/g, "") })}
                  aria-invalid={err("qty") ? true : undefined}
                  className="h-11 text-base tabular-nums"
                />
                <Select value={row.unit} onValueChange={(unit) => updateRow(row.key, { unit })}>
                  <SelectTrigger className="h-11! w-full text-base" aria-label={`${ing.name} 단위`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptions(ing).map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                inputMode="numeric"
                placeholder="금액(원, 선택)"
                aria-label={`${ing.name} 금액`}
                value={row.totalPrice}
                onChange={(e) => updateRow(row.key, { totalPrice: e.target.value.replace(/\D/g, "") })}
                aria-invalid={err("totalPrice") ? true : undefined}
                className="h-11 text-base tabular-nums"
              />
              {ing.trackExpiry && (
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`exp-${row.key}`} className="text-muted-foreground">
                    유통기한
                  </Label>
                  <Input
                    id={`exp-${row.key}`}
                    type="date"
                    min={receivedOn}
                    value={row.expiresAt}
                    onChange={(e) => updateRow(row.key, { expiresAt: e.target.value })}
                    aria-invalid={err("expiresAt") ? true : undefined}
                    className="h-11 w-auto text-base"
                  />
                </div>
              )}
              {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
              {["ingredientId", "qty", "unit", "totalPrice", "expiresAt"].map(
                (f) =>
                  err(f) && (
                    <p key={f} className="text-sm text-destructive">
                      {err(f)}
                    </p>
                  ),
              )}
            </Card>
          );
        })}

        <Button type="button" variant="outline" className="h-[52px] text-base" onClick={() => setPickerOpen(true)}>
          <Plus /> {rows.length === 0 ? "재료 검색" : "품목 추가"}
        </Button>
        {itemsError && <p className="text-sm text-destructive">{itemsError}</p>}
      </div>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] mt-auto border-t bg-background px-4 py-3 md:bottom-0">
        <Button type="submit" className="h-[52px] w-full text-base" disabled={pending || rows.length === 0}>
          {pending ? "입고하는 중…" : rows.length === 0 ? "입고할 재료를 추가해 주세요" : `${rows.length}품목 입고하기`}
        </Button>
      </div>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>재료 선택</SheetTitle>
            <SheetDescription className="sr-only">입고할 재료를 검색해 고르세요</SheetDescription>
          </SheetHeader>
          <Command className="px-2 pb-4">
            <CommandInput placeholder="재료 이름" className="text-base" />
            <CommandList className="max-h-[50dvh]">
              {/* shortcut: "새 재료로 등록"은 재료 등록 화면(3.1a)이 생기면 연결한다 */}
              <CommandEmpty>찾는 재료가 없어요. 더보기 → 재료에서 먼저 등록해 주세요</CommandEmpty>
              {ingredients.map((ing) => (
                <CommandItem key={ing.id} value={ing.name} onSelect={() => addRow(ing)} className="min-h-11 text-base">
                  {ing.name}
                  <span className="ml-auto text-muted-foreground">{ing.unit}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </SheetContent>
      </Sheet>

      <Sheet open={result !== null} onOpenChange={(open) => !open && reset()}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>입고했어요</SheetTitle>
            <SheetDescription>입고 묶음별 유통기한이에요</SheetDescription>
          </SheetHeader>
          <ul className="flex flex-col gap-3 overflow-y-auto px-4">
            {result?.map((lot, i) => (
              <li key={`${lot.lotId}-${i}`} className="rounded-xl bg-muted p-3">
                <div className="flex justify-between font-semibold">
                  <span>{lot.name}</span>
                  <span className="tabular-nums">
                    {lot.quantity.toLocaleString()}
                    {lot.unit}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {lot.expiresAt ? `유통기한 ${shortDate(lot.expiresAt)} · ${lot.basis}` : "기한 추적 안 함"}
                </p>
              </li>
            ))}
          </ul>
          <SheetFooter className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-[52px] text-base" onClick={reset}>
              더 입고하기
            </Button>
            <Button asChild className="h-[52px] text-base">
              <Link href="/">대시보드로</Link>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </form>
  );
}
