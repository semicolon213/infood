import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CurrentStore = { id: string; name: string };

// 로그인한 사용자와 그 매장. 매장은 클라이언트 값이 아니라 세션에서 구한다 (AGENTS 규칙 6).
export async function getSessionStore(): Promise<{
  userId: string | null;
  store: CurrentStore | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, store: null };

  const { data } = await supabase.from("stores").select("id, name").eq("owner_id", user.id).maybeSingle();
  return { userId: user.id, store: data ?? null };
}
