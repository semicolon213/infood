import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <main aria-label="재료를 불러오고 있어요" aria-busy="true" className="space-y-4 p-4">
    <Skeleton className="h-8 w-28" /><Skeleton className="h-12 w-full" />
    {[1, 2, 3].map((id) => <Skeleton key={id} className="h-36 w-full rounded-xl" />)}
  </main>;
}
