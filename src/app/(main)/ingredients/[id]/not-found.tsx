import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <>
    <PageHeader title="재료 상세" />
    <main className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">재료를 찾지 못했어요</h2>
      <p className="text-muted-foreground">재료 목록에서 다시 확인해 주세요</p>
      <Button asChild className="h-11"><Link href="/ingredients">재료 목록</Link></Button>
    </main>
  </>;
}
