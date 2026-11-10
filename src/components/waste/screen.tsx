"use client";

import Link from "next/link";
import { useId, useState, type KeyboardEvent } from "react";
import type { StockHistoryItem } from "@/types/contracts";
import type { ActionError } from "@/lib/result";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { UsageForm } from "./usage-form";
import { WasteForm } from "./waste-form";
import { RecordHistory } from "./history";
import type { HistoryDraft, StockIngredient } from "./form-input";

export function StockRecordScreen({ today, ingredients, initialMode, requestedLotId, history, historyDraft, historyError, historyFailed }: {
  today: string; ingredients: StockIngredient[]; initialMode: "usage" | "waste"; requestedLotId?: string;
  history: StockHistoryItem[]; historyDraft: HistoryDraft; historyError: ActionError | null; historyFailed: boolean;
}) {
  const id = useId();
  const [mode, setMode] = useState(initialMode);
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const next = event.key === "ArrowLeft" || event.key === "ArrowRight" ? mode === "usage" ? "waste" : "usage"
      : event.key === "Home" ? "usage" : event.key === "End" ? "waste" : null;
    if (next) { event.preventDefault(); setMode(next); document.getElementById(`${id}-${next}-tab`)?.focus(); }
  }
  return <>
    <PageHeader title="사용·폐기" action={<Button asChild variant="ghost" className="h-11"><Link href="/more">더보기</Link></Button>} />
    <main className="space-y-6 p-4">
      <div role="tablist" aria-label="입력할 기록 종류" className="flex gap-2 rounded-xl bg-muted p-1">{(["usage", "waste"] as const).map((value) => <Button key={value} type="button" role="tab" id={`${id}-${value}-tab`} aria-controls={`${id}-${value}-panel`} aria-selected={mode === value} tabIndex={mode === value ? 0 : -1} variant={mode === value ? "default" : "ghost"} className="h-11 flex-1 text-base" onClick={() => setMode(value)} onKeyDown={keyboard}>{value === "usage" ? "사용" : "폐기"}</Button>)}</div>
      <div role="tabpanel" id={`${id}-usage-panel`} aria-labelledby={`${id}-usage-tab`} hidden={mode !== "usage"}><UsageForm ingredients={ingredients} today={today} /></div>
      <div role="tabpanel" id={`${id}-waste-panel`} aria-labelledby={`${id}-waste-tab`} hidden={mode !== "waste"}><WasteForm ingredients={ingredients} today={today} requestedLotId={requestedLotId} /></div>
      <RecordHistory key={`${historyDraft.from}-${historyDraft.to}-${historyDraft.type}`} items={history} initial={historyDraft} initialError={historyError} failed={historyFailed} today={today} />
    </main>
  </>;
}
