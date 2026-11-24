import { fail, HTTP_STATUS, type ActionResult } from "@/lib/result";
import { recordSaleOrderFor } from "@/lib/sales/record-order";
import { storeFromBearer } from "@/lib/supabase/bearer";

// POST /api/pos/sales — 포스 주문 연동 (WBS 4.8). 본문은 RecordSaleOrderInput과 같다:
// { "externalId": "POS-0001", "items": [{ "menuId": "<uuid>", "qty": 2 }], "soldOn"?: "YYYY-MM-DD" }
// 같은 externalId를 다시 보내면 재고를 다시 줄이지 않고 { duplicate: true }를 돌려준다.
function respond<T>(result: ActionResult<T>): Response {
  return Response.json(result, { status: result.ok ? 200 : HTTP_STATUS[result.error.code] });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await storeFromBearer(request);
  if (!auth) return respond(fail("UNAUTHORIZED", "매장 계정 토큰을 확인해 주세요"));
  const body: unknown = await request.json().catch(() => null);
  return respond(await recordSaleOrderFor(auth.db, auth.storeId, "pos", body));
}
