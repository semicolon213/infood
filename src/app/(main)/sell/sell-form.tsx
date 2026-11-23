"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { recordSaleOrder } from "@/actions/sale-orders";
import { shortageText } from "@/app/(main)/sales/sales-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SaleOrderSummary, Shortage } from "@/types/contracts";

type Menu = { id: string; name: string; price: number };

const time = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });

export function SellForm({ menus, orders, closed }: { menus: Menu[]; orders: SaleOrderSummary[]; closed: boolean }) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [pending, startTransition] = useTransition();

  const add = (id: string, d: number) =>
    setCart((c) => {
      const n = Math.max(0, Math.min(999, (c[id] ?? 0) + d));
      const next = { ...c, [id]: n };
      if (!n) delete next[id];
      return next;
    });
  const lines = menus.filter((m) => cart[m.id]);
  const count = lines.reduce((s, m) => s + cart[m.id], 0);
  const total = lines.reduce((s, m) => s + cart[m.id] * m.price, 0);

  function submit() {
    startTransition(async () => {
      const res = await recordSaleOrder({ items: lines.map((m) => ({ menuId: m.id, qty: cart[m.id] })) });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setCart({});
      setShortages(res.data.shortages);
      toast.success(`${count}개 판매를 기록했어요. 재고를 줄였어요`);
      navigator.vibrate?.(50);
      router.refresh();
    });
  }

  if (closed) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle>오늘은 판매 마감을 했어요</AlertTitle>
          <AlertDescription>마감한 날짜는 주문별로 기록할 수 없어요. 재고가 두 번 줄지 않게 하기 위해서예요</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4 px-4 py-4">
        {menus.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            판매할 메뉴가 없어요.{" "}
            <Link href="/menus" className="underline">
              메뉴를 먼저 등록해 주세요
            </Link>
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2" aria-label="메뉴">
            {menus.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => add(m.id, 1)}
                  className="relative flex min-h-[72px] w-full flex-col items-start justify-center rounded-xl border bg-card p-3 text-left active:bg-muted"
                  aria-label={`${m.name} 1개 담기`}
                >
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{m.price.toLocaleString()}원</span>
                  {cart[m.id] ? <Badge className="absolute top-2 right-2 tabular-nums">{cart[m.id]}</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        {shortages.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>재고가 모자랐어요</AlertTitle>
            <AlertDescription>
              <ul>
                {shortages.map((s) => (
                  <li key={s.ingredientId}>{shortageText(s)}</li>
                ))}
              </ul>
              <Link href="/ingredients?status=low" className="underline">
                재고 확인
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <section aria-labelledby="today-orders" className="flex flex-col gap-2">
          <h2 id="today-orders" className="text-base font-semibold">
            오늘 기록 {orders.length > 0 && <span className="text-muted-foreground">({orders.length}건)</span>}
          </h2>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 기록이 없어요</p>
          ) : (
            orders.map((o) => (
              <Card key={o.id} className="gap-1 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{time(o.createdAt)}</span>
                  <Badge variant="outline">{o.source === "pos" ? "포스" : "사이트"}</Badge>
                  {o.shortCount > 0 && <Badge variant="destructive">부족 {o.shortCount}</Badge>}
                </div>
                <p>{o.items.map((i) => `${i.name} ${i.qty}`).join(", ")}</p>
              </Card>
            ))
          )}
          <p className="text-xs text-muted-foreground">포스 연동: 매장 계정 토큰으로 POST /api/pos/sales 에 주문을 보내면 여기에 &ldquo;포스&rdquo;로 쌓여요</p>
        </section>
      </div>

      {lines.length > 0 && (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] mt-auto flex flex-col gap-2 border-t bg-background px-4 py-3 md:bottom-0">
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {lines.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="flex-1 truncate">{m.name}</span>
                <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => add(m.id, -1)} aria-label={`${m.name} 1개 빼기`}>
                  <Minus />
                </Button>
                <span className="w-8 text-center tabular-nums">{cart[m.id]}</span>
                <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => add(m.id, 1)} aria-label={`${m.name} 1개 더하기`}>
                  <Plus />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" className="h-[52px] w-full text-base" disabled={pending} onClick={submit}>
            {pending ? "기록하는 중…" : `판매 기록 (${count}개 · ${total.toLocaleString()}원)`}
          </Button>
        </div>
      )}
    </div>
  );
}
