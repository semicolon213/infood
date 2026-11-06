"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Package, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type IngredientCardData, storageLabels } from "./view-model";
import { emptyFilters, type CatalogFilters } from "./filters";
import { IngredientExpiryBadge } from "./expiry-badge";

const statusFilters = [{ value: "all", label: "전체" }, { value: "soon", label: "임박" }, { value: "expired", label: "지남" }, { value: "low", label: "부족" }] as const;

export function IngredientBadges({ item }: { item: IngredientCardData }) {
  return <span className="flex flex-wrap items-center gap-2">
    {item.expiry && <IngredientExpiryBadge {...item.expiry} />}
    {item.statuses.includes("low") && <Badge className="bg-status-low text-status-low-foreground">부족</Badge>}
  </span>;
}

export function IngredientCatalog({ items, loadError = false, onSelect, onCreate, initialFilters = emptyFilters, onApplyFilters, pending = false, onRetry }: {
  items: IngredientCardData[]; loadError?: boolean; onSelect?: (id: string) => void; onCreate?: () => void;
  initialFilters?: CatalogFilters; onApplyFilters?: (filters: CatalogFilters) => void; pending?: boolean; onRetry?: () => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const { q, status, storage } = filters;
  // 운영 목록은 서버 조회 결과를 그대로 표시한다. 개발 미리보기만 로컬 검색한다.
  const filtered = onApplyFilters ? items : items.filter((item) => item.name.includes(q.trim())
    && (status === "all" || item.statuses.includes(status)) && (storage === "all" || item.storage === storage));
  const apply = (next: CatalogFilters) => { setFilters(next); onApplyFilters?.(next); };
  const hasFilters = !!q.trim() || status !== "all" || storage !== "all";
  const addButton = onCreate
    ? <Button className="h-11" onClick={onCreate}><Plus aria-hidden="true" />재료 등록</Button>
    : <Button asChild className="h-11"><Link href="/ingredients/new"><Plus aria-hidden="true" />재료 등록</Link></Button>;

  return <>
    <PageHeader title="재료" action={addButton} />
    <main className="space-y-4 p-4">
      <form role="search" className="flex gap-2" onSubmit={(event) => { event.preventDefault(); apply(filters); }}>
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="absolute top-3 left-3 size-5 text-muted-foreground" />
          <Input aria-label="재료 이름 검색" maxLength={30} value={q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="어떤 재료를 찾으세요?" className="h-12 pl-10 text-base" />
        </div>
        <Button type="submit" className="h-12" disabled={pending}>검색</Button>
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label="재고 상태 필터">
        {statusFilters.map((filter) => <Button key={filter.value} disabled={pending} variant={status === filter.value ? "default" : "outline"} aria-pressed={status === filter.value} className="h-11 rounded-full px-4" onClick={() => apply({ ...filters, status: filter.value })}>{filter.label}</Button>)}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="보관 방식 필터">
        {(["all", "fridge", "freezer", "room"] as const).map((value) => <Button key={value} disabled={pending} variant={storage === value ? "secondary" : "ghost"} className="h-11" aria-pressed={storage === value} onClick={() => apply({ ...filters, storage: value })}>{value === "all" ? "보관 전체" : storageLabels[value].split(" ")[0]}</Button>)}
      </div>
      {pending ? <p role="status" className="py-8 text-center text-muted-foreground">재료를 불러오고 있어요</p> : loadError ? (
        <Alert variant="destructive"><AlertDescription>재료 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.{onRetry && <Button variant="outline" className="mt-2 h-11" onClick={onRetry}>다시 시도</Button>}</AlertDescription></Alert>
      ) : <>
        <p role="status" className="text-sm text-muted-foreground">재료 {filtered.length}종</p>
        {filtered.length === 0 ? <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <Package aria-hidden="true" className="size-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{hasFilters ? "조건에 맞는 재료가 없어요" : "아직 재료가 없어요"}</h2>
          <p className="text-sm text-muted-foreground">{hasFilters ? "검색어와 필터를 바꿔 보세요" : "자주 쓰는 재료부터 등록해 보세요"}</p>
          {hasFilters ? <Button variant="outline" className="h-11" onClick={() => apply(emptyFilters)}>검색·필터 초기화</Button> : addButton}
        </div> : <ul className="space-y-3" aria-label="재료 목록">{filtered.map((item) => {
          const content = <>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2"><span className="break-words text-lg font-semibold">{item.name}</span><IngredientBadges item={item} /></div>
              <span className="text-base tabular-nums">사용 가능 {item.stockText}</span>
              <span className="text-sm text-muted-foreground">{storageLabels[item.storage].split(" ")[0]} · {item.expiry?.date ? `가장 빠른 기한 ${item.expiry.date}` : item.noExpiryText ?? "기한 정보가 없어요"}</span>
              {item.stockHint && <span className="text-sm text-muted-foreground">{item.stockHint}</span>}
            </div><ArrowRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          </>;
          const className = "flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring";
          return <li key={item.id}>{onSelect
            ? <button type="button" className={className} onClick={() => onSelect(item.id)} aria-label={`${item.name} 상세 보기`}>{content}</button>
            : <Link href={`/ingredients/${item.id}`} className={className} aria-label={`${item.name} 상세 보기`}>{content}</Link>}</li>;
        })}</ul>}
      </>}
      <p className="text-sm text-muted-foreground">매장 기준 권장 기한이에요</p>
    </main>
  </>;
}
