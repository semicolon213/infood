import Link from "next/link";
import { ChevronRight, Plus, Utensils } from "lucide-react";
import type { MenuSummary } from "@/types/contracts";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function MenuCatalog({ menus }: { menus: MenuSummary[] }) {
  return <>
    <PageHeader title="메뉴" action={<Button asChild className="h-11"><Link href="/menus/new"><Plus aria-hidden="true" />메뉴 등록</Link></Button>} />
    <main className="space-y-4 p-4">
      {menus.length === 0 ? <EmptyState icon={Utensils} message="아직 등록한 메뉴가 없어요" action={<Button asChild className="h-[52px]"><Link href="/menus/new">첫 메뉴 등록하기</Link></Button>} /> : <>
        <p className="text-sm text-muted-foreground">총 {menus.length}개 · 메뉴를 눌러 레시피를 확인해요</p>
        <ul className="space-y-3" aria-label="메뉴 목록">{menus.map((menu) => <li key={menu.id}>
          <Link href={`/menus/${menu.id}`} aria-label={`${menu.name} 상세 보기`} className="flex min-h-24 items-center gap-3 rounded-xl border p-4 focus-visible:outline-ring">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2"><h2 className="break-all text-lg font-semibold">{menu.name}</h2>{!menu.isActive && <Badge variant="secondary">비활성</Badge>}{menu.isSpecial && <Badge variant="outline">특선</Badge>}</div>
              <p className="tabular-nums">{menu.price.toLocaleString("ko-KR")}원</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>)}</ul>
      </>}
    </main>
  </>;
}
