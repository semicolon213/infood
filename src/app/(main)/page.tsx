import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboard } from "@/lib/queries/dashboard";
import { getIngredients } from "@/lib/queries/ingredients";
import { getSessionStore } from "@/lib/queries/store";

// 대시보드 (FR-DASH-01~04, UC-07) — WBS 4.1a. 조회(getDashboard)는 4.1b에서 실제 구현으로 바뀐다.
export default async function DashboardPage() {
  const [{ store }, data, ingredients] = await Promise.all([getSessionStore(), getDashboard(), getIngredients()]);

  // 재료가 하나도 없으면 첫 입고 안내 (09_DESIGN 7장 빈 상태 문구)
  if (ingredients.length === 0) {
    return (
      <>
        <PageHeader title="대시보드" />
        <EmptyState
          icon={PackageOpen}
          message="아직 재료가 없어요. 첫 입고를 해볼까요?"
          action={
            <Button asChild className="h-[52px] px-6 text-base">
              <Link href="/receive">입고하기</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="대시보드" />
      <DashboardView data={data} storeName={store?.name ?? ""} />
    </>
  );
}
