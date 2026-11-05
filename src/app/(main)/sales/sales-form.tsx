"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Minus, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { recordDailySales } from "@/actions/sales";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { addDays } from "@/lib/stock/expiry";
import type { SalesDay, Shortage } from "@/types/contracts";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// "11/03 (화)"
function dayLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return `${m}/${String(day).padStart(2, "0")} (${WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
}

// 받침 있으면 "이", 없으면 "가" (한글이 아니면 "이(가)")
function subj(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}이(가)`;
  return `${word}${code % 28 ? "이" : "가"}`;
}

// 09_DESIGN 7장: "양파가 300g 부족했어요"
export function shortageText(s: Shortage): string {
  return `${subj(s.name)} ${s.shortQty.toLocaleString()}${s.unit} 부족했어요`;
}

export function SalesForm({ day, today }: { day: SalesDay; today: string }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(day.items.map((i) => [i.menuId, String(i.qty)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<Shortage[] | null>(null);
  const [pending, startTransition] = useTransition();

  const prev = addDays(day.soldOn, -1);
  const next = addDays(day.soldOn, 1);
  const total = Object.values(qty).reduce((sum, v) => sum + (Number(v) || 0), 0);

  function step(menuId: string, delta: number) {
    setQty((q) => ({ ...q, [menuId]: String(Math.max(0, (Number(q[menuId]) || 0) + delta)) }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    startTransition(async () => {
      const res = await recordDailySales({
        soldOn: day.soldOn,
        sales: day.items.map((i) => ({ menuId: i.menuId, qty: Number(qty[i.menuId]) || 0 })),
      });
      if (res.ok) {
        if (res.data.shortages.length > 0) setShortages(res.data.shortages);
        else toast.success("마감을 저장했어요");
        router.refresh();
        return;
      }
      if (res.error.code === "CONFLICT") {
        setError("이미 마감한 날짜예요");
        router.refresh();
      } else if (res.error.code === "VALIDATION") {
        setError(Object.values(res.error.fields ?? {})[0] ?? res.error.message);
      } else {
        toast.error("저장하지 못했어요", { action: { label: "다시 시도", onClick: () => form.requestSubmit() } });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <nav className="flex items-center justify-between px-2 py-2" aria-label="판매일">
        <Button asChild variant="ghost" size="icon" className="size-11">
          <Link href={`/sales?date=${prev}`} aria-label="전날">
            <ChevronLeft />
          </Link>
        </Button>
        <span className="text-lg font-semibold tabular-nums">
          {dayLabel(day.soldOn)}
          {day.soldOn === today && <span className="ml-1 text-muted-foreground">오늘</span>}
        </span>
        {next > today ? (
          <Button variant="ghost" size="icon" className="size-11" disabled aria-label="다음 날">
            <ChevronRight />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link href={`/sales?date=${next}`} aria-label="다음 날">
              <ChevronRight />
            </Link>
          </Button>
        )}
      </nav>

      <div className="flex flex-col gap-3 px-4 pb-4">
        {day.closed && (
          <Alert>
            <AlertTitle>이미 마감한 날짜예요</AlertTitle>
            <AlertDescription>저장된 판매 수량을 보여 드려요</AlertDescription>
          </Alert>
        )}
        {day.closed && day.shortages.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>이날 부족했던 재료</AlertTitle>
            <AlertDescription>
              <ul>
                {day.shortages.map((s) => (
                  <li key={s.ingredientId}>{shortageText(s)}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {day.items.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            판매 중인 메뉴가 없어요.{" "}
            <Link href="/menus" className="underline">
              메뉴를 먼저 등록해 주세요
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {day.items.map((item) => (
              <li key={item.menuId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-base">{item.name}</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    disabled={day.closed || (Number(qty[item.menuId]) || 0) === 0}
                    onClick={() => step(item.menuId, -1)}
                    aria-label={`${item.name} 하나 빼기`}
                  >
                    <Minus />
                  </Button>
                  <Input
                    inputMode="numeric"
                    aria-label={`${item.name} 판매 수량`}
                    value={qty[item.menuId]}
                    disabled={day.closed}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setQty((q) => ({ ...q, [item.menuId]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    className="h-11 w-16 text-center text-base tabular-nums"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    disabled={day.closed}
                    onClick={() => step(item.menuId, 1)}
                    aria-label={`${item.name} 하나 더하기`}
                  >
                    <Plus />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {!day.closed && day.items.length > 0 && (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] mt-auto border-t bg-background px-4 py-3 md:bottom-0">
          <Button type="submit" className="h-[52px] w-full text-base" disabled={pending || total === 0}>
            {pending ? "저장하는 중…" : total === 0 ? "판매 수량을 입력해 주세요" : `마감 저장 (${total.toLocaleString()}개)`}
          </Button>
        </div>
      )}

      <Sheet open={shortages !== null} onOpenChange={(open) => !open && setShortages(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-xl">
          <SheetHeader>
            <SheetTitle>마감을 저장했어요</SheetTitle>
            <SheetDescription>부족한 재료는 차감하지 않고 기록해 뒀어요. 재고를 확인해 주세요</SheetDescription>
          </SheetHeader>
          <ul className="flex flex-col gap-2 overflow-y-auto px-4">
            {shortages?.map((s) => (
              <li key={s.ingredientId} className="flex items-center gap-2 rounded-xl bg-muted p-3">
                <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                {shortageText(s)}
              </li>
            ))}
          </ul>
          <SheetFooter className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-[52px] text-base" onClick={() => setShortages(null)}>
              닫기
            </Button>
            <Button asChild className="h-[52px] text-base">
              <Link href="/ingredients?status=low">재고 확인</Link>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </form>
  );
}
