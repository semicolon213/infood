import { redirect } from "next/navigation";
import { BottomNav } from "@/components/common/bottom-nav";
import { getSessionStore } from "@/lib/queries/store";

// 로그인 + 매장이 있어야 들어올 수 있는 화면들. 매장이 없으면 매장 생성으로 보낸다 (FR-AUTH-02).
export default async function MainLayout({ children }: LayoutProps<"/">) {
  const { userId, store } = await getSessionStore();
  if (!userId) redirect("/login");
  if (!store) redirect("/onboarding");

  return (
    <div className="flex flex-1 flex-col md:pl-56">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
