import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, ClipboardList, PackageCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatQty } from "@/lib/stock/order";
import type { Dashboard, DashboardLot } from "@/types/contracts";

// 대시보드 본문 (FR-DASH-01~04, docs/09_DESIGN.md 4.1). 서버 컴포넌트 — 조회는 page.tsx에서 한다.

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-11-10" → "11/10 (화)". 날짜 문자열을 그대로 쪼개 시간대 영향을 받지 않는다.
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d} (${weekday})`;
}

// D-0~D-1은 빨강 테두리, D-2~D-3은 주황 (09_DESIGN 2.1 상태 색상)
function DdayBadge({ daysLeft }: { daysLeft: number }) {
  const urgent = daysLeft <= 1;
  return (
    <Badge
      variant="outline"
      className={urgent ? "border-destructive bg-background text-destructive" : "bg-status-soon text-status-soon-foreground"}
    >
      D-{daysLeft}
    </Badge>
  );
}

function Section({ title, count, icon: Icon, action, children }: {
  title: string; count: number; icon: typeof AlertTriangle; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg/[26px] font-semibold">
          <Icon className="size-5" aria-hidden="true" />
          {title}
          <span className="tabular-nums text-muted-foreground">{count}</span>
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LotRow({ lot, children }: { lot: DashboardLot; children: React.ReactNode }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate font-medium">{lot.name}</span>
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatQty(lot.remaining, lot.unit)} · {dayLabel(lot.expiresAt)}까지
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">{children}</span>
    </li>
  );
}

export function DashboardView({ data, storeName }: { data: Dashboard; storeName: string }) {
  const { expiredLots, expiringLots, lowStock } = data;
  const allClear = expiredLots.length === 0 && expiringLots.length === 0 && lowStock.length === 0;

  return (
    <main className="space-y-3 p-4">
      <p className="text-sm text-muted-foreground">
        오늘 <span className="tabular-nums">{dayLabel(data.today)}</span> · {storeName}
      </p>

      {expiredLots.length > 0 && (
        <Section title="기한 지난 재료" count={expiredLots.length} icon={Ban}>
          <ul className="space-y-2">
            {expiredLots.map((lot) => (
              <LotRow key={lot.lotId} lot={lot}>
                <Badge className="bg-status-expired text-status-expired-foreground">지남</Badge>
                <Button asChild variant="destructive" className="h-11">
                  <Link href={`/waste?lotId=${lot.lotId}`}>폐기 처리</Link>
                </Button>
              </LotRow>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">기한이 지난 재료는 쓰지 말고 폐기 처리해 주세요</p>
        </Section>
      )}

      {expiringLots.length > 0 && (
        <Section title="먼저 써야 할 재료" count={expiringLots.length} icon={AlertTriangle}>
          <ul className="space-y-2">
            {expiringLots.map((lot) => (
              <LotRow key={lot.lotId} lot={lot}>
                <DdayBadge daysLeft={lot.daysLeft} />
              </LotRow>
            ))}
          </ul>
          <Button asChild className="h-[52px] w-full text-base">
            <Link href="/recommend">
              <Sparkles aria-hidden="true" />이 재료로 메뉴 추천받기
            </Link>
          </Button>
        </Section>
      )}

      {lowStock.length > 0 && (
        <Section
          title="부족한 재료"
          count={lowStock.length}
          icon={ClipboardList}
          action={
            <Button asChild variant="ghost" className="h-11">
              <Link href="/orders">
                발주 목록<ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          <ul className="space-y-2">
            {lowStock.map((item) => (
              <li key={item.ingredientId} className="flex min-h-11 items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatQty(item.availableRemaining, item.unit)} / 최소 {formatQty(item.minStock, item.unit)}
                  </span>
                </span>
                <Badge className="shrink-0 bg-status-low text-status-low-foreground">부족</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {allClear && (
        <section aria-label="오늘 재고 상태" className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center">
          <PackageCheck className="size-10 text-primary" aria-hidden="true" />
          <p className="font-medium">지금 처리할 재료가 없어요</p>
          <p className="text-sm text-muted-foreground">임박·지남·부족 재료가 생기면 여기에 먼저 보여 드릴게요</p>
        </section>
      )}

      {/* FR-DASH-04: 추천·발주 바로가기 (경고가 없어도 항상) */}
      <nav aria-label="바로가기" className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-[52px] text-base">
          <Link href="/recommend">
            <Sparkles aria-hidden="true" />AI 메뉴 추천
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-[52px] text-base">
          <Link href="/orders">
            <ClipboardList aria-hidden="true" />발주 목록
          </Link>
        </Button>
      </nav>
    </main>
  );
}
