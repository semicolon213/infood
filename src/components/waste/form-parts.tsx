"use client";

import { useRouter } from "next/navigation";
import type { ActionError } from "@/lib/result";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StockIngredient } from "./form-input";

export function FieldError({ formId, field, error }: { formId: string; field: string; error: ActionError | null }) {
  return error?.fields?.[field] ? <p id={`${formId}-${field}-error`} className="text-sm text-destructive">{error.fields[field]}</p> : null;
}

export function IngredientSelect({ ingredients, value, onChange, inputProps }: { ingredients: StockIngredient[]; value: string; onChange: (value: string) => void;
  inputProps: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined } }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger {...inputProps} className="w-full text-base data-[size=default]:h-12"><SelectValue placeholder="재료를 선택해 주세요" /></SelectTrigger>
    <SelectContent position="popper">{ingredients.map((item) => <SelectItem key={item.id} value={item.id} className="min-h-11 text-base">{item.name} ({item.unit})</SelectItem>)}</SelectContent>
  </Select>;
}

export function RecordError({ error, loginAvailable }: { error: ActionError | null; loginAvailable: boolean }) {
  const router = useRouter();
  if (!error) return null;
  return <Alert variant="destructive" role="alert" tabIndex={-1} data-record-error><AlertDescription>
    <p>{error.message}</p>
    {loginAvailable && <Button asChild variant="outline" className="h-11"><a href="/waste#stock-history" target="_blank" rel="noopener noreferrer">기록 확인 (새 창)</a></Button>}
    {error.code === "STOCK_CONFLICT" && <><p>재고가 바뀌었어요. 최신 재고를 확인한 뒤 다시 시도해 주세요.</p><Button type="button" variant="outline" className="h-11" onClick={() => router.refresh()}>재고 새로고침</Button></>}
    {error.code === "NOT_FOUND" && <><p>선택한 재료나 묶음이 없어졌을 수 있어요. 최신 목록을 확인한 뒤 다시 선택해 주세요.</p><Button type="button" variant="outline" className="h-11" onClick={() => router.refresh()}>재고 새로고침</Button></>}
    {(loginAvailable || error.code === "UNAUTHORIZED") && <><p>로그인이 필요하면 새 창에서 로그인한 뒤 이 화면으로 돌아와 다시 시도해 주세요.</p><Button asChild variant="outline" className="h-11"><a href="/login" target="_blank" rel="noopener noreferrer">다시 로그인 (새 창)</a></Button></>}
  </AlertDescription></Alert>;
}

export const quantityText = (qty: number, unit: string) => `${qty.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}${unit}`;
