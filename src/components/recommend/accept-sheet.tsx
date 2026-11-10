"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { acceptRecommendation } from "@/actions/recommend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RecommendationView, Unit } from "@/types/contracts";

// 특선 등록 시트 (FR-REC-07, BR-04, docs/09_DESIGN.md 4.5) — WBS 4.2b.
// AI 값은 초안일 뿐이다. 사용자가 이름·가격·재료·사용량을 확인하고 [등록]을 눌러야 저장된다.

export type StoreIngredient = { id: string; name: string; unit: Unit };
type Idea = RecommendationView["newIdeas"][number];
type Row = { key: number; ingredientId: string | null; aiName: string; qty: string };

export function rowsFromIdea(idea: Idea): Row[] {
  return idea.ingredients.map((r, key) => ({ key, ingredientId: r.ingredientId, aiName: r.name, qty: String(r.qty) }));
}

export function AcceptSheet({ open, onOpenChange, recommendationId, idea, ingredients, onAccepted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recommendationId: string;
  idea: Idea;
  ingredients: StoreIngredient[];
  onAccepted: (menuId: string) => void;
}) {
  const [name, setName] = useState(idea.name);
  const [price, setPrice] = useState(idea.suggestedPrice === null ? "" : String(idea.suggestedPrice));
  const [rows, setRows] = useState<Row[]>(() => rowsFromIdea(idea));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const unlinked = rows.filter((r) => r.ingredientId === null).length;
  const update = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit() {
    setErrors({});
    if (unlinked > 0) {
      setErrors({ _: "연결되지 않은 재료가 있어요. 매장 재료를 고르거나 빼 주세요" });
      return;
    }
    startTransition(async () => {
      const res = await acceptRecommendation({
        recommendationId,
        ideaIndex: idea.index,
        name,
        price: Number(price),
        ingredients: rows.map((r) => ({ ingredientId: r.ingredientId!, qty: Number(r.qty) })),
      });
      if (res.ok) {
        toast.success("특선 메뉴로 등록했어요");
        onAccepted(res.data.menuId);
        onOpenChange(false);
      } else {
        setErrors({ ...(res.error.fields ?? {}), _: res.error.message });
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>특선 메뉴로 등록</SheetTitle>
          <SheetDescription>AI가 만든 초안이에요. 이름·가격·재료와 1인분 사용량을 확인해 주세요</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4">
          <div className="space-y-1">
            <Label htmlFor="special-name">메뉴 이름</Label>
            <Input id="special-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} className="h-12 text-base" aria-invalid={!!errors.name} />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="special-price">판매가 (원)</Label>
            <Input id="special-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} className="h-12 text-base tabular-nums" aria-invalid={!!errors.price} placeholder="0" />
            {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-2 font-medium">재료 (1인분)</legend>
            {rows.map((r, i) => {
              const ing = r.ingredientId ? byId.get(r.ingredientId) : undefined;
              return (
                <div key={r.key} className="space-y-2 rounded-xl border p-3">
                  {r.ingredientId === null ? (
                    <>
                      <p className="text-sm">
                        <span className="font-medium">{r.aiName}</span> <span className="text-muted-foreground">· 등록되지 않은 재료예요</span>
                      </p>
                      <Select onValueChange={(v) => update(r.key, { ingredientId: v })}>
                        <SelectTrigger aria-label={`${r.aiName} 대신 쓸 매장 재료`} className="w-full text-base data-[size=default]:h-12">
                          <SelectValue placeholder="매장 재료 고르기" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {ingredients.map((o) => (
                            <SelectItem key={o.id} value={o.id} className="min-h-11 text-base" disabled={rows.some((x) => x.ingredientId === o.id)}>
                              {o.name} ({o.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <p className="font-medium">{ing?.name ?? r.aiName}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`${ing?.name ?? r.aiName} 사용량`}
                      inputMode="decimal"
                      value={r.qty}
                      onChange={(e) => update(r.key, { qty: e.target.value.replace(/[^0-9.]/g, "") })}
                      className="h-12 flex-1 text-base tabular-nums"
                      aria-invalid={!!errors[`ingredients.${i}.qty`]}
                    />
                    <span className="w-8 text-muted-foreground">{ing?.unit ?? ""}</span>
                    <Button variant="ghost" size="icon" className="size-11" aria-label={`${ing?.name ?? r.aiName} 빼기`} onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  {(errors[`ingredients.${i}.qty`] || errors[`ingredients.${i}.ingredientId`]) && (
                    <p className="text-sm text-destructive">{errors[`ingredients.${i}.qty`] ?? errors[`ingredients.${i}.ingredientId`]}</p>
                  )}
                </div>
              );
            })}
            {errors.ingredients && <p className="text-sm text-destructive">{errors.ingredients}</p>}
          </fieldset>

          {errors._ && <p role="alert" className="text-sm text-destructive">{errors._}</p>}
        </div>

        <SheetFooter>
          <Button className="h-[52px] text-base" onClick={submit} disabled={pending || rows.length === 0}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {unlinked > 0 ? `연결할 재료 ${unlinked}개 남음` : "특선 메뉴로 등록"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
