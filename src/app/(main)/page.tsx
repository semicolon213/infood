import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

// 대시보드 (FR-DASH-01~04). 임박·경과·부족 표시는 WBS 4.1a·4.1b에서 채운다.
export default function DashboardPage() {
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
