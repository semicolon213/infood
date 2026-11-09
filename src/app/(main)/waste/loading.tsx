import { PageHeader } from "@/components/common/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <><PageHeader title="사용·폐기" /><main className="space-y-4 p-4" role="status" aria-label="사용·폐기 정보를 불러오고 있어요"><Skeleton className="h-12" /><Skeleton className="h-72 rounded-xl" /></main></>;
}
