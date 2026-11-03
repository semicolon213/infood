import Link from "next/link";
import { Carrot, ChevronRight, ClipboardList, LogOut, Trash2, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { signOut } from "@/actions/store";
import { getSessionStore } from "@/lib/queries/store";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/ingredients", label: "재료", icon: Carrot },
  { href: "/menus", label: "메뉴·레시피", icon: UtensilsCrossed },
  { href: "/waste", label: "사용·폐기 기록", icon: Trash2 },
  { href: "/orders", label: "발주 목록", icon: ClipboardList },
];

// 더보기 탭 (docs/09_DESIGN.md 3.1): 재료, 메뉴, 사용·폐기, 발주 목록, 설정(로그아웃)
export default async function MorePage() {
  const { store } = await getSessionStore();

  return (
    <>
      <PageHeader title="더보기" />
      <ul className="divide-y">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-14 items-center gap-3 px-4 text-base">
              <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 space-y-3 px-4">
        <p className="text-sm text-muted-foreground">{store?.name}</p>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="h-11 w-full">
            <LogOut aria-hidden="true" />
            로그아웃
          </Button>
        </form>
      </div>
    </>
  );
}
