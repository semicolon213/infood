import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionStore } from "@/lib/queries/store";
import { StoreForm } from "./store-form";

export const metadata: Metadata = { title: "매장 만들기 · 재고콕" };

export default async function OnboardingPage() {
  const { userId, store } = await getSessionStore();
  if (!userId) redirect("/login");
  if (store) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-2">
        <h1 className="text-[22px]/[30px] font-bold">매장 이름을 알려 주세요</h1>
        <p className="text-sm text-muted-foreground">재고와 메뉴는 이 매장 안에서만 보여요.</p>
      </div>
      <StoreForm />
    </main>
  );
}
