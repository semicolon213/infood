"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ActionResult } from "@/lib/result";
import type { AdjustLotInput, AdjustLotOutput } from "@/types/contracts";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { IngredientBadges } from "./catalog";
import { IngredientExpiryBadge } from "./expiry-badge";
import { type IngredientDetailData, storageLabels } from "./view-model";

type OnAdjust = (input: AdjustLotInput) => Promise<ActionResult<AdjustLotOutput>>;

export function IngredientDetail({ data, onBack, onEdit, onDeactivate, onAdjust }: {
  data: IngredientDetailData;
  onBack?: () => void;
  onEdit?: () => void;
  onDeactivate?: () => Promise<ActionResult<{ id: string }>>;
  onAdjust?: OnAdjust;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  async function deactivate() {
    if (!onDeactivate || submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      const result = await onDeactivate();
      if (!result.ok) { setMessage(result.error.message); return; }
      setOpen(false);
      setMessage("재료를 비활성화했어요");
      onBack?.();
    } catch { setMessage("저장하지 못했어요. 다시 시도해 주세요"); }
    finally { submitting.current = false; setPending(false); }
  }
  return <>
    <PageHeader title="재료 상세" action={onBack
      ? <Button variant="ghost" className="h-11" onClick={onBack}><ArrowLeft aria-hidden="true" />목록</Button>
      : <Button asChild variant="ghost" className="h-11"><Link href="/ingredients"><ArrowLeft aria-hidden="true" />목록</Link></Button>} />
    <main className="space-y-5 p-4">
      <section className="space-y-3 rounded-xl border p-4" aria-label="재료 기본 정보">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-words text-[22px]/[30px] font-bold">{data.name}</h2><IngredientBadges item={data} /></div>
        <p className="text-[28px]/[34px] font-bold tabular-nums">{data.stockText}<span className="ml-2 text-sm font-normal text-muted-foreground">사용 가능</span></p>
        {data.stockHint && <p className="text-sm text-muted-foreground">{data.stockHint}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">전체 잔량</dt><dd>{data.totalStockText}</dd>
          <dt className="text-muted-foreground">카테고리</dt><dd>{data.category}</dd>
          <dt className="text-muted-foreground">기본 단위</dt><dd>{data.unitLabel}</dd>
          <dt className="text-muted-foreground">최소 재고</dt><dd>{data.minStockText}</dd>
          <dt className="text-muted-foreground">적정 재고</dt><dd>{data.targetStockText}</dd>
          <dt className="text-muted-foreground">보관 방식</dt><dd>{storageLabels[data.storage]}</dd>
          <dt className="text-muted-foreground">기본 보관일수</dt><dd>{data.shelfLifeText}</dd>
          <dt className="text-muted-foreground">환산 단위</dt><dd>{data.conversionTexts.length ? data.conversionTexts.join(" / ") : "등록한 단위가 없어요"}</dd>
        </dl>
        {onEdit ? <Button variant="outline" className="h-11 w-full" onClick={onEdit}>재료 정보 수정</Button> : <Button asChild variant="outline" className="h-11 w-full"><Link href={`/ingredients/${data.id}/edit`}>재료 정보 수정</Link></Button>}
      </section>
      <section className="space-y-3" aria-label="입고 묶음">
        <h2 className="text-lg font-semibold">입고 묶음 {data.lots.length}개</h2>
        <p className="text-sm text-muted-foreground">기한이 빠른 순서예요 · 매장 기준 권장 기한이에요</p>
        {data.lots.length === 0 && <p className="rounded-xl border border-dashed p-4 text-muted-foreground">남은 입고 묶음이 없어요</p>}
        <ul className="space-y-3">{data.lots.map((lot) => <li key={lot.id} className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{lot.expiresOn ?? data.noExpiryText ?? "기한 정보 없음"}</span>{lot.expiryTone ? <IngredientExpiryBadge label={lot.expiryLabel} tone={lot.expiryTone} /> : <span className="text-muted-foreground">{lot.expiryLabel}</span>}</div>
          <p className="tabular-nums">잔량 {lot.remainingText} / 입고 {lot.quantityText}</p>
          <p className="text-sm text-muted-foreground">입고일 {lot.receivedOn} · 단가 {lot.unitPriceText}</p>
          <p className="text-sm text-muted-foreground">{lot.sourceText}</p>
          {lot.isExpired && <p className="text-sm text-destructive">기한이 지난 재료는 쓰지 말고 폐기 처리해 주세요</p>}
          <div className="grid grid-cols-2 gap-2">
            {lot.count && onAdjust && <CountDialog lotId={lot.id} count={lot.count} onAdjust={onAdjust} />}
            <Button asChild variant="outline" className={lot.count && onAdjust ? "h-11" : "col-span-2 h-11"}><Link href={`/waste?lotId=${encodeURIComponent(lot.id)}`}>이 묶음 폐기</Link></Button>
          </div>
        </li>)}</ul>
      </section>
      {message && !open && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
      {data.hasRemaining && <p className="text-sm text-muted-foreground">남은 재고를 먼저 사용·폐기해 주세요</p>}
      <Dialog open={open} onOpenChange={(value) => { if (!pending) { setMessage(""); setOpen(value); } }}>
        <DialogTrigger asChild><Button variant="destructive" className="h-11 w-full" disabled={data.hasRemaining || !onDeactivate}>재료 비활성화</Button></DialogTrigger>
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)]">
          <DialogHeader><DialogTitle>이 재료를 비활성화할까요?</DialogTitle><DialogDescription>입고 목록에서 숨기고 이전 기록은 보관해요.</DialogDescription></DialogHeader>
          {message && <Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert>}
          <DialogFooter className="gap-2"><Button variant="outline" className="h-11" disabled={pending} onClick={() => setOpen(false)}>취소</Button><Button variant="destructive" className="h-11" disabled={pending} onClick={deactivate}>{pending ? "처리하고 있어요" : "비활성화"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  </>;
}

// FR-USE-07 실사 보정: 세어 본 잔량을 입력하면 서버가 차이만큼 adjust 이력을 남긴다
function CountDialog({ lotId, count, onAdjust }: { lotId: string; count: { remaining: number; quantity: number; unit: string }; onAdjust: OnAdjust }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(count.remaining));
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const n = Number(value);
  const over = Number.isFinite(n) && n > count.quantity;
  const invalid = value.trim() === "" || !Number.isFinite(n) || n < 0 || over;
  async function save() {
    if (pending || invalid) return;
    setPending(true);
    try {
      const result = await onAdjust({ lotId, newRemaining: n, memo: memo.trim() || undefined });
      if (!result.ok) { setError(result.error.fields?.newRemaining ?? result.error.message); return; }
      setOpen(false);
    } catch { setError("저장하지 못했어요. 다시 시도해 주세요"); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={(v) => { if (!pending) { setOpen(v); setError(""); setValue(String(count.remaining)); setMemo(""); } }}>
    <DialogTrigger asChild><Button variant="outline" className="h-11">실사 수량 맞추기</Button></DialogTrigger>
    <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)]">
      <DialogHeader><DialogTitle>실제로 남은 양을 입력해 주세요</DialogTitle><DialogDescription>지금 기록 {count.remaining}{count.unit} · 입고 {count.quantity}{count.unit}까지 입력할 수 있어요</DialogDescription></DialogHeader>
      <div className="space-y-2">
        <Label htmlFor={`count-${lotId}`}>실사 수량 ({count.unit})</Label>
        <Input id={`count-${lotId}`} className="h-11" inputMode="decimal" value={value} onChange={(e) => { setValue(e.target.value); setError(""); }} aria-invalid={over || !!error || undefined} />
        {!error && over && <p className="text-sm text-destructive">입고 수량({count.quantity}{count.unit})보다 많을 수 없어요</p>}
        <Label htmlFor={`memo-${lotId}`}>메모 (선택)</Label>
        <Input id={`memo-${lotId}`} className="h-11" maxLength={100} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 월말 재고 조사" />
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <DialogFooter className="gap-2"><Button variant="outline" className="h-11" disabled={pending} onClick={() => setOpen(false)}>취소</Button><Button className="h-11" disabled={pending || invalid} onClick={save}>{pending ? "저장하고 있어요" : "이 수량으로 맞추기"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
