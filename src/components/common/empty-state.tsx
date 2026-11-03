import type { LucideIcon } from "lucide-react";

// 빈 상태: 아이콘 + 설명 + 행동 버튼 (docs/09_DESIGN.md 5장 EmptyState)
export function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
