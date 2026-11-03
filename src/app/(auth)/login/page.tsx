import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인 · 재고콕" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-2">
        <h1 className="text-[22px]/[30px] font-bold">재고콕</h1>
        <p className="text-sm text-muted-foreground">
          이메일로 받은 링크를 누르면 바로 로그인돼요. 비밀번호는 필요 없어요.
        </p>
      </div>
      {error === "link" && (
        <p role="alert" className="rounded-[10px] bg-status-expired px-3 py-2 text-sm text-status-expired-foreground">
          로그인 링크가 만료됐거나 이미 사용됐어요. 다시 받아 주세요.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
