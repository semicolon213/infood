import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// 포스 등 외부 기기용 (WBS 4.8). 쿠키 대신 `Authorization: Bearer <access_token>`으로 매장 계정을 인증한다.
// service role이 아니라 그 사용자 토큰으로 접속하므로 RLS가 그대로 적용된다 (AGENTS 7).
export async function storeFromBearer(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: store } = await db.from("stores").select("id").eq("owner_id", user.id).maybeSingle();
  return store ? { db, storeId: store.id } : null;
}
