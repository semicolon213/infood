import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentStore = { id: string; name: string };

// 로그인한 사용자와 그 매장. 매장은 클라이언트 값이 아니라 세션에서 구한다 (AGENTS 규칙 6).
// cache: 한 요청(렌더링·서버 액션) 안에서는 한 번만 조회한다. 요청이 끝나면 버려져 사용자 간에 공유되지 않는다.
export const getSessionStore = cache(async (): Promise<{
  userId: string | null;
  store: CurrentStore | null;
}> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, store: null };

  const { data } = await supabase.from("stores").select("id, name").eq("owner_id", user.id).maybeSingle();
  return { userId: user.id, store: data ?? null };
});
