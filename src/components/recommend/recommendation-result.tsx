import { Flame, Lightbulb, Sparkles, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatQty } from "@/lib/stock/order";
import { cn } from "@/lib/utils";
import type { RecIngredient, RecommendationView } from "@/types/contracts";

// 추천 결과 표시 (FR-REC-02·03·05, docs/09_DESIGN.md 4.5). 상태와 데이터만 받아 그린다 — 호출은 recommend-screen.tsx.

const STATUS = {
  have: { label: "보유", className: "bg-muted text-muted-foreground" },
  short: { label: "재고 부족", className: "bg-status-low text-status-low-foreground" },
  unregistered: { label: "등록되지 않은 재료", className: "border-dashed bg-background text-muted-foreground" },
} as const;

// 등록되지 않은 재료는 매장 단위를 모르므로 AI가 준 수량만 단위 없이 (09_DESIGN 2.1 참고)
function qtyText(r: RecIngredient): string {
  return r.unit === null ? `${r.qty}` : formatQty(r.qty, r.unit);
}

export function IngredientLine({ item }: { item: RecIngredient }) {
  const s = STATUS[item.status];
  return (
    <li className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="min-w-0">
        <span className="font-medium">{item.name}</span> <span className="tabular-nums text-muted-foreground">{qtyText(item)}</span>
        {item.status === "short" && item.availableQty !== null && item.unit !== null && (
          <span className="block text-sm text-muted-foreground tabular-nums">지금 {formatQty(item.availableQty, item.unit)} 있어요</span>
        )}
      </span>
      <Badge variant="outline" className={cn("shrink-0", s.className)}>{s.label}</Badge>
    </li>
  );
}

export function RecommendationResult({ data, renderIdeaActions }: {
  data: RecommendationView;
  /** 아이디어 카드 아래 버튼 (조리 순서·수정해서 등록). 화면이 넣는다 */
  renderIdeaActions?: (idea: RecommendationView["newIdeas"][number]) => React.ReactNode;
}) {
  const hasUnregistered = data.newIdeas.some((i) => i.ingredients.some((r) => r.status === "unregistered"));

  return (
    <div className="space-y-4">
      {data.fallback ? (
        <p role="status" className="flex gap-2 rounded-xl border border-status-soon-foreground/30 bg-status-soon p-3 text-sm text-status-soon-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <Badge variant="outline" className="mr-1 bg-background">규칙 기반</Badge>
            추천을 만들지 못했어요. 임박 재료가 들어간 메뉴를 보여 드릴게요
          </span>
        </p>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge className="bg-primary text-primary-foreground"><Sparkles aria-hidden="true" />AI 추천</Badge>
          재고 대조 결과를 확인하세요
        </p>
      )}

      {(data.shortCount > 0 || data.unregisteredCount > 0 || data.droppedCount > 0) && (
        <p className="text-sm text-muted-foreground">
          {[
            data.shortCount > 0 && `재고 부족 ${data.shortCount}`,
            data.unregisteredCount > 0 && `등록되지 않은 재료 ${data.unregisteredCount}`,
            data.droppedCount > 0 && `없는 메뉴라 뺀 항목 ${data.droppedCount}`,
          ].filter(Boolean).join(" · ")}
        </p>
      )}

      <section aria-labelledby="push-title" className="space-y-3">
        <h2 id="push-title" className="flex items-center gap-2 text-lg/[26px] font-semibold">
          <Flame className="size-5" aria-hidden="true" />오늘 많이 팔면 좋은 메뉴
        </h2>
        {data.pushMenus.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">지금 재고로 먼저 권할 메뉴가 없어요</p>
        ) : (
          data.pushMenus.map((m) => (
            <article key={m.menuId} className="space-y-2 rounded-xl border bg-card p-4">
              <h3 className="font-semibold">{m.name}</h3>
              <p className="text-sm text-muted-foreground">{m.reason}</p>
              {m.consumes.length > 0 && <ul className="space-y-1">{m.consumes.map((c, i) => <IngredientLine key={`${c.name}-${i}`} item={c} />)}</ul>}
            </article>
          ))
        )}
      </section>

      {!data.fallback && (
        <section aria-labelledby="ideas-title" className="space-y-3">
          <h2 id="ideas-title" className="flex items-center gap-2 text-lg/[26px] font-semibold">
            <Lightbulb className="size-5" aria-hidden="true" />새 특선 아이디어
          </h2>
          {data.newIdeas.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">이번에는 새 아이디어가 없어요</p>
          ) : (
            data.newIdeas.map((idea) => (
              <article key={idea.index} className="space-y-3 rounded-xl border bg-card p-4">
                <h3 className="font-semibold">{idea.name}</h3>
                <ul className="space-y-1">{idea.ingredients.map((r, i) => <IngredientLine key={`${r.name}-${i}`} item={r} />)}</ul>
                <dl className="grid grid-cols-2 gap-2 text-sm tabular-nums">
                  <div>
                    <dt className="text-muted-foreground">예상 원가</dt>
                    <dd className="font-medium">{idea.estCost.toLocaleString("ko-KR")}원</dd>
                  </div>
                  {idea.suggestedPrice !== null && (
                    <div>
                      <dt className="text-muted-foreground">제안 판매가</dt>
                      <dd className="font-medium">{idea.suggestedPrice.toLocaleString("ko-KR")}원</dd>
                    </div>
                  )}
                </dl>
                {renderIdeaActions?.(idea)}
              </article>
            ))
          )}
          {hasUnregistered && <p className="text-sm text-muted-foreground">등록되지 않은 재료는 원가에 포함되지 않아요</p>}
        </section>
      )}
    </div>
  );
}
