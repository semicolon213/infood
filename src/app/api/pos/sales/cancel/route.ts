import { z } from "zod";
import { fail, HTTP_STATUS, validationFail, type ActionResult } from "@/lib/result";
import { cancelSaleOrderFor } from "@/lib/sales/record-order";
import { storeFromBearer } from "@/lib/supabase/bearer";

// POST /api/pos/sales/cancel — 포스 주문 취소·환불 (WBS 4.8a). 본문 { "externalId": "POS-0001" }
const Body = z.object({ externalId: z.string().trim().min(1).max(100) });

function respond<T>(result: ActionResult<T>): Response {
  return Response.json(result, { status: result.ok ? 200 : HTTP_STATUS[result.error.code] });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await storeFromBearer(request);
  if (!auth) return respond(fail("UNAUTHORIZED", "매장 계정 토큰을 확인해 주세요"));
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respond(validationFail(parsed.error));
  return respond(await cancelSaleOrderFor(auth.db, auth.storeId, { source: "pos", externalId: parsed.data.externalId }));
}
