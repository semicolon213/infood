import { getAiClient } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { buildReceiptRequest } from "@/lib/ai/prompts/receipt";
import { matchReceipt } from "@/lib/ai/receipt";
import { todayKST } from "@/lib/date";
import { getIngredients } from "@/lib/queries/ingredients";
import { getSessionStore } from "@/lib/queries/store";
import { fail, HTTP_STATUS, ok, rpcErrorCode, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

// POST /api/receipts/parse — 명세서 사진 인식 (확장 FR-RCP-01·03, WBS 4.7)
// multipart `image` 하나를 받아 입고 화면에 채울 행을 돌려준다. DB에는 아무것도 쓰지 않고,
// 사용자가 입고 화면에서 확인·수정한 뒤 receiveStock으로 확정한다 (FR-RCP-02, BR-04).
// shortcut: 08_API_SPEC 12장의 receipts 테이블·Storage 업로드·confirm_receipt 없이 처리한다. 명세서 원본 보관이 필요해지면 추가
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // 화면이 1600px JPEG로 줄여 보낸다
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const FAILED = "명세서를 읽지 못했어요. 직접 입력해 주세요";

function respond<T>(result: ActionResult<T>): Response {
  return Response.json(result, { status: result.ok ? 200 : HTTP_STATUS[result.error.code] });
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || !TYPES.includes(image.type)) {
    return respond(fail("VALIDATION", "사진 파일(JPG·PNG·WEBP)을 올려 주세요", { image: "사진 파일을 올려 주세요" }));
  }
  if (image.size > MAX_BYTES) return respond(fail("VALIDATION", "사진이 너무 커요. 4MB 이하로 올려 주세요", { image: "4MB 이하" }));

  const { store } = await getSessionStore();
  if (!store) return respond(fail("UNAUTHORIZED", "다시 로그인해 주세요"));

  const db = await createClient();
  const usage = await db.rpc("increment_ai_usage", {
    p_store_id: store.id,
    p_today: todayKST(),
    p_limit: Number(process.env.AI_DAILY_LIMIT) || 100,
  });
  if (usage.error) {
    return respond(
      rpcErrorCode(usage.error) === "RATE_LIMITED"
        ? fail("RATE_LIMITED", "오늘 AI 사용 횟수를 다 썼어요. 직접 입력해 주세요")
        : fail("INTERNAL", FAILED),
    );
  }

  const ingredients = await getIngredients();
  try {
    const parsed = await getAiClient().generate(
      buildReceiptRequest({
        image: Buffer.from(await image.arrayBuffer()).toString("base64"),
        mediaType: image.type,
        ingredients,
      }),
    );
    const result = matchReceipt(parsed, ingredients);
    if (result.lines.length === 0) return respond(fail("AI_INVALID_OUTPUT", "명세서에서 품목을 찾지 못했어요. 직접 입력해 주세요"));
    return respond(ok(result));
  } catch (error) {
    console.error("[POST /api/receipts/parse]", error);
    return respond(fail(error instanceof AiError ? error.code : "AI_FAILED", FAILED));
  }
}
