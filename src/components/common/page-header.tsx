// 화면 상단바: 제목 + 보조 액션 (docs/09_DESIGN.md 3.1, 높이 56px)
export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 pt-[env(safe-area-inset-top)]">
      <h1 className="text-[22px]/[30px] font-bold">{title}</h1>
      {action}
    </header>
  );
}
