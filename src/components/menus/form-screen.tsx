"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveMenu } from "@/actions/menus";
import type { MenuDetail } from "@/types/contracts";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { MenuForm } from "./form";
import type { MenuIngredient } from "./form-input";

export function MenuFormScreen({ menu, ingredients }: { menu?: MenuDetail; ingredients: MenuIngredient[] }) {
  const router = useRouter();
  const destination = menu ? `/menus/${menu.id}` : "/menus";
  return <>
    <PageHeader title={menu ? "메뉴 수정" : "메뉴 등록"} action={<Button asChild variant="ghost" className="h-11"><Link href={destination}>{menu ? "상세로" : "목록"}</Link></Button>} />
    <main className="p-4">
      <MenuForm menu={menu} ingredients={ingredients} saveAction={saveMenu} onCancel={() => router.push(destination)} onSaved={(id) => {
        toast.success(menu ? "메뉴 정보를 수정했어요" : "메뉴를 등록했어요");
        router.push(`/menus/${id}`);
        router.refresh();
      }} />
    </main>
  </>;
}
