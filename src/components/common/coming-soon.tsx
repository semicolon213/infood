import { Construction } from "lucide-react";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";

// 아직 만들지 않은 화면의 자리표시. 각 화면 담당 작업에서 교체한다.
export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={Construction} message="준비 중인 화면이에요." />
    </>
  );
}
