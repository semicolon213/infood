"use client";

import Link from "next/link";
import { useTransition } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function MenuError({ retry }: { error: unknown; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <>
    <PageHeader title="메뉴" />
    <main className="space-y-4 p-4">
      <Alert variant="destructive" role="alert"><AlertDescription>메뉴 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</AlertDescription></Alert>
      <div className="flex flex-wrap gap-3">
        <Button className="h-11" disabled={pending} onClick={() => startTransition(() => retry())}>{pending ? "불러오고 있어요" : "다시 시도"}</Button>
        <Button asChild variant="outline" className="h-11"><Link href="/menus">메뉴 목록</Link></Button>
      </div>
    </main>
  </>;
}
