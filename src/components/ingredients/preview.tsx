"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { IngredientCatalog } from "./catalog";
import { IngredientDetail } from "./detail";
import { IngredientForm, type IngredientFormDraft } from "./form";
import type { IngredientCardData, IngredientDetailData } from "./view-model";

// 화면 검토용 고정 표시값. 수량·날짜를 계산하거나 실제 매장 데이터로 취급하지 않는다.
const samples: IngredientCardData[] = [
  { id: "30000000-0000-4000-8000-000000000001", name: "양파", category: "채소", storage: "fridge", stockText: "9320g", statuses: ["soon"], expiry: { label: "D-0", date: "2026-11-03", tone: "urgent" } },
  { id: "30000000-0000-4000-8000-000000000002", name: "대파", category: "채소", storage: "fridge", stockText: "4860g", statuses: ["soon"], expiry: { label: "D-1", date: "2026-11-04", tone: "urgent" } },
  { id: "30000000-0000-4000-8000-000000000016", name: "오징어", category: "수산", storage: "freezer", stockText: "100g", statuses: ["low"], expiry: { label: "D-28", date: "2026-12-01", tone: "ok" } },
  { id: "30000000-0000-4000-8000-000000000020", name: "우유", category: "유제품·계란", storage: "fridge", stockText: "0ml", stockHint: "기한 지난 2700ml는 사용 가능 재고에서 뺐어요", statuses: ["expired", "low"], expiry: { label: "지남", date: "2026-11-02", tone: "expired" } },
  { id: "30000000-0000-4000-8000-000000000024", name: "두부", category: "기타", storage: "fridge", stockText: "5040g", statuses: ["soon"], expiry: { label: "D-1", date: "2026-11-04", tone: "urgent" } },
  { id: "30000000-0000-4000-8000-000000000029", name: "소금", category: "양념", storage: "room", stockText: "1992g", statuses: [], expiry: null, noExpiryText: "기한 추적 안 함" },
];

const tofu: IngredientDetailData = {
  ...samples[4], unitLabel: "g", minStockText: "1000g", targetStockText: "4000g",
  shelfLifeText: "7일", totalStockText: "5040g", hasRemaining: true,
  conversionTexts: ["1모 = 300g"],
  lots: [
    { id: "50000000-0000-4000-8000-000000000001", receivedOn: "2026-10-20", expiresOn: "2026-11-04", expiryLabel: "D-1", expiryTone: "urgent", remainingText: "4440g", quantityText: "5000g", unitPriceText: "3원/g", sourceText: "직접 입력한 기한이에요", isExpired: false },
    { id: "50000000-0000-4000-8000-000000000002", receivedOn: "2026-11-03", expiresOn: "2026-11-10", expiryLabel: "D-7", expiryTone: "ok", remainingText: "600g", quantityText: "600g", unitPriceText: "3원/g", sourceText: "직접 입력한 기한이에요", isExpired: false },
  ],
};
const milk: IngredientDetailData = {
  ...samples[3], unitLabel: "ml", minStockText: "1000ml", targetStockText: "설정 안 함",
  shelfLifeText: "7일", totalStockText: "2700ml", hasRemaining: true,
  conversionTexts: [],
  lots: [
    { id: "50000000-0000-4000-8000-000000000003", receivedOn: "2026-10-20", expiresOn: "2026-11-02", expiryLabel: "지남", expiryTone: "expired", remainingText: "2700ml", quantityText: "3000ml", unitPriceText: "3원/ml", sourceText: "직접 입력한 기한이에요", isExpired: true },
  ],
};
const tofuDraft: IngredientFormDraft = { name: "두부", category: "기타", unit: "g", minStock: "1000", targetStock: "4000", storage: "fridge", trackExpiry: true, defaultShelfDays: "7", units: [{ unitName: "모", factor: "300" }] };

export function IngredientPreview() {
  const [view, setView] = useState<"list" | "detail" | "new" | "edit">("list");
  const [selected, setSelected] = useState(samples[4]);
  const [scenario, setScenario] = useState<"normal" | "empty" | "error">("normal");
  const detail: IngredientDetailData = selected.id === tofu.id ? tofu : selected.id === milk.id ? milk : {
    ...selected, unitLabel: selected.name === "우유" ? "ml" : "g", minStockText: "미리보기", targetStockText: "미리보기", shelfLifeText: selected.expiry ? "미리보기" : "기한 추적 안 함", totalStockText: selected.stockText, hasRemaining: true, conversionTexts: [], lots: [],
  };
  return <div className="mx-auto min-h-screen max-w-[720px] bg-background text-foreground">
    <aside className="space-y-3 border-b bg-muted p-4" aria-label="화면 미리보기 안내">
      <Alert><AlertDescription>화면 미리보기예요. 가상 데이터를 표시하며 입력한 내용은 저장하지 않아요.</AlertDescription></Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11" onClick={() => { setScenario("normal"); setView("list"); }}>목록 확인</Button>
        <Button variant="outline" className="h-11" onClick={() => { setScenario("empty"); setView("list"); }}>빈 화면 확인</Button>
        <Button variant="outline" className="h-11" onClick={() => { setScenario("error"); setView("list"); }}>조회 실패 확인</Button>
      </div>
    </aside>
    {view === "list" && <IngredientCatalog key={scenario} items={scenario === "empty" ? [] : samples} loadError={scenario === "error"} onCreate={() => setView("new")} onSelect={(id) => { setSelected(samples.find((item) => item.id === id)!); setView("detail"); }} />}
    {view === "detail" && <IngredientDetail data={detail} onBack={() => setView("list")} onEdit={selected.id === tofu.id ? () => setView("edit") : undefined} />}
    {(view === "new" || view === "edit") && <>
      <PageHeader title={view === "edit" ? "재료 수정" : "재료 등록"} />
      <main className="p-4"><IngredientForm key={view} initial={view === "edit" ? tofuDraft : undefined} unitLocked={view === "edit"} onCancel={() => setView("list")} /></main>
    </>}
  </div>;
}
