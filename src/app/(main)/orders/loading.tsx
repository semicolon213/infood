import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <>
    <PageHeader title="발주 목록" />
    <main role="status" aria-label="발주 정보를 불러오고 있어요" className="space-y-4 p-4">
      <span className="sr-only">발주 정보를 불러오고 있어요</span>
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </main>
  </>;
}
