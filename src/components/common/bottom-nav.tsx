"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Menu, PackagePlus, ReceiptText, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: LucideIcon; match: string[] };

// 하단 탭 5개 (docs/09_DESIGN.md 3.1). 더보기는 재료·메뉴·사용폐기·발주 목록을 포함한다.
const TABS: Tab[] = [
  { href: "/", label: "대시보드", icon: House, match: ["/"] },
  { href: "/receive", label: "입고", icon: PackagePlus, match: ["/receive"] },
  { href: "/sales", label: "마감", icon: ReceiptText, match: ["/sales"] },
  { href: "/recommend", label: "추천", icon: Sparkles, match: ["/recommend"] },
  {
    href: "/more",
    label: "더보기",
    icon: Menu,
    match: ["/more", "/ingredients", "/menus", "/waste", "/orders"],
  },
];

function isActive(pathname: string, tab: Tab) {
  return tab.match.some((m) => (m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`)));
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]",
        "md:inset-y-0 md:right-auto md:w-56 md:border-t-0 md:border-r md:pb-0 md:pt-6",
      )}
    >
      <p className="hidden px-6 pb-6 text-lg font-bold md:block">재고콕</p>
      <ul className="grid h-16 grid-cols-5 md:flex md:h-auto md:flex-col md:gap-1 md:px-3">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-xs",
                  "md:flex-row md:justify-start md:gap-3 md:rounded-[10px] md:px-3 md:py-2.5 md:text-sm",
                  active ? "font-semibold text-primary md:bg-muted" : "text-muted-foreground",
                )}
              >
                <Icon className="size-6 md:size-5" aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
