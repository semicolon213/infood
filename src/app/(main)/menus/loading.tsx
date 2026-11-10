import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <>
    <PageHeader title="메뉴" />
    <main className="space-y-3 p-4" role="status" aria-label="메뉴 정보를 불러오고 있어요">
      {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
    </main>
  </>;
}
