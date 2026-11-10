"use client";

import Link from "next/link";
import { useTransition } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function StockRecordError({ retry }: { error: unknown; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <><PageHeader title="사용·폐기" /><main className="space-y-4 p-4">
    <Alert variant="destructive" role="alert"><AlertDescription>재료와 묶음을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</AlertDescription></Alert>
    <Button className="h-11" disabled={pending} onClick={() => startTransition(() => retry())}>{pending ? "불러오고 있어요" : "다시 시도"}</Button>
    <Button asChild variant="outline" className="ml-3 h-11"><Link href="/more">더보기</Link></Button>
  </main></>;
}
