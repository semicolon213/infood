import { fail, HTTP_STATUS, ok } from "@/lib/result";
import { storeFromBearer } from "@/lib/supabase/bearer";

// GET /api/pos/menus — 포스 메뉴 ↔ 재고콕 메뉴 ID 연결용 (WBS 4.8). 활성 메뉴만
export async function GET(request: Request): Promise<Response> {
  const auth = await storeFromBearer(request);
  if (!auth) return Response.json(fail("UNAUTHORIZED", "매장 계정 토큰을 확인해 주세요"), { status: HTTP_STATUS.UNAUTHORIZED });
  const { data, error } = await auth.db.from("menus").select("id, name, price").eq("store_id", auth.storeId).eq("is_active", true).order("name");
  if (error) return Response.json(fail("INTERNAL", "메뉴를 불러오지 못했어요"), { status: HTTP_STATUS.INTERNAL });
  return Response.json(ok(data));
}
