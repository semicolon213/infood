import { getAiClient } from "@/lib/ai/client";
import { todayKST } from "@/lib/date";
import { getSessionStore } from "@/lib/queries/store";
import { fail, HTTP_STATUS, validationFail, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import { RecommendRequest } from "@/types/contracts";
import { createRecommendation } from "./create";

// POST /api/recommendations — AI 메뉴 추천 (08_API_SPEC 9장, FR-REC-01~06·08). WBS 4.2
// AI 타임아웃 45초(ClaudeAdapter) + 조회·저장 여유
export const maxDuration = 60;

const DEFAULT_DAILY_LIMIT = 100;

function respond<T>(result: ActionResult<T>): Response {
  return Response.json(result, { status: result.ok ? 200 : HTTP_STATUS[result.error.code] });
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = RecommendRequest.safeParse(body ?? {});
  if (!parsed.success) return respond(validationFail(parsed.error));

  const { store } = await getSessionStore();
  if (!store) return respond(fail("UNAUTHORIZED", "다시 로그인해 주세요"));

  try {
    const result = await createRecommendation({
      db: await createClient(),
      storeId: store.id,
      today: todayKST(),
      basis: parsed.data.basis,
      ai: getAiClient(),
      dailyLimit: Number(process.env.AI_DAILY_LIMIT) || DEFAULT_DAILY_LIMIT,
    });
    return respond(result);
  } catch (error) {
    console.error("[POST /api/recommendations]", error);
    return respond(fail("INTERNAL", "추천을 저장하지 못했어요. 잠시 후 다시 시도해 주세요"));
  }
}
