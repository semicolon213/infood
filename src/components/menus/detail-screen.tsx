"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deactivateMenu } from "@/actions/menus";
import type { MenuDetail } from "@/types/contracts";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MenuLoginRecovery } from "./login-recovery";

export function MenuDetailScreen({ menu }: { menu: MenuDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [loginAvailable, setLoginAvailable] = useState(false);
  const submitting = useRef(false);
  async function deactivate() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setMessage("");
    setLoginAvailable(false);
    let navigating = false;
    try {
      const result = await deactivateMenu({ id: menu.id });
      if (!result.ok) { setMessage(result.error.message); setLoginAvailable(result.error.code === "UNAUTHORIZED"); return; }
      toast.success("메뉴를 비활성화했어요");
      router.push("/menus");
      router.refresh();
      navigating = true;
    } catch { setMessage("저장하지 못했어요. 다시 시도해 주세요"); setLoginAvailable(true); }
    finally { if (!navigating) { submitting.current = false; setPending(false); } }
  }
  return <>
    <PageHeader title="메뉴 상세" action={<Button asChild variant="ghost" className="h-11"><Link href="/menus">목록</Link></Button>} />
    <main className="space-y-5 p-4">
      <section aria-label="메뉴 기본 정보" className="space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 className="break-all text-[22px]/[30px] font-bold">{menu.name}</h2>{!menu.isActive && <Badge variant="secondary">비활성</Badge>}{menu.isSpecial && <Badge variant="outline">특선</Badge>}</div>
        <dl className="space-y-1"><dt className="text-sm text-muted-foreground">판매가</dt><dd className="text-[28px]/[34px] font-bold tabular-nums">{menu.price.toLocaleString("ko-KR")}원</dd></dl>
        <Button asChild variant="outline" className="h-11 w-full"><Link href={`/menus/${menu.id}/edit`}>메뉴 정보 수정</Link></Button>
      </section>
      <section aria-label="1인분 레시피" className="space-y-3">
        <h2 className="text-lg font-semibold">1인분 레시피 · {menu.recipe.length}개 재료</h2>
        <p className="text-sm text-muted-foreground">재료의 기본 단위로 표시해요</p>
        {menu.recipe.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-muted-foreground">등록한 레시피가 없어요. 메뉴 정보 수정에서 재료와 소요량을 추가해 주세요.</p> : <ul className="divide-y rounded-xl border" aria-label="레시피 재료">{menu.recipe.map((item) => <li key={item.ingredientId} className="flex items-center justify-between gap-4 p-4"><span className="min-w-0 break-all">{item.name}</span><span className="shrink-0 font-medium tabular-nums">{item.qty.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}{item.unit}</span></li>)}</ul>}
      </section>
      {!menu.isActive && <p className="text-sm text-muted-foreground">비활성 메뉴예요. 이전 판매 기록과 레시피는 보관돼요.</p>}
      <Dialog open={open} onOpenChange={(value) => { if (!pending) { setMessage(""); setOpen(value); } }}>
        <DialogTrigger asChild><Button variant="destructive" className="h-11 w-full" disabled={!menu.isActive}>메뉴 비활성화</Button></DialogTrigger>
        <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)]">
          <DialogHeader><DialogTitle>이 메뉴를 비활성화할까요?</DialogTitle><DialogDescription>판매 마감과 메뉴 추천 목록에서 숨겨요. 이전 판매 기록과 레시피는 보관돼요.</DialogDescription></DialogHeader>
          {message && <Alert variant="destructive" role="alert"><AlertDescription><p>{message}</p>{loginAvailable && <MenuLoginRecovery />}</AlertDescription></Alert>}
          <DialogFooter className="gap-2"><Button variant="outline" className="h-11" disabled={pending} onClick={() => setOpen(false)}>취소</Button><Button variant="destructive" className="h-11" disabled={pending} onClick={deactivate}>{pending ? "처리하고 있어요" : "비활성화"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  </>;
}
