import { createBrowserClient } from "@supabase/ssr";

// 클라이언트 컴포넌트용. 로그인(매직링크 요청)에만 쓴다.
// 테이블 변경은 클라이언트에서 하지 않는다 (AGENTS 규칙 10).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
