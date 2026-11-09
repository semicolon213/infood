"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function IngredientLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <main className="space-y-4 p-4">
    <Alert variant="destructive"><AlertDescription>재료 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</AlertDescription></Alert>
    <Button className="h-11" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오고 있어요" : "다시 시도"}</Button>
    <Button asChild className="h-11" variant="outline"><Link href="/ingredients">재료 목록으로</Link></Button>
  </main>;
}
