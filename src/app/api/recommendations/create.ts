import "server-only";
import type { AiClient } from "@/lib/ai/client";
import { recommend } from "@/lib/ai/recommend";
import { getStrategy } from "@/lib/ai/strategies";
import { loadRecommendSnapshot } from "@/lib/queries/recommendations";
import { fail, ok, type ActionResult } from "@/lib/result";
import type { createClient } from "@/lib/supabase/server";
import type { ISODate, RecommendBasis, RecommendationView, UUID } from "@/types/contracts";

// POST /api/recommendations 본문 처리 (08_API_SPEC 9장 ①~⑦). Route Handler와 통합 테스트(IT-REC)가 함께 쓴다.

type Db = Awaited<ReturnType<typeof createClient>>;

const AI_FAILED_MESSAGE = "추천을 만들지 못했어요. 잠시 후 다시 시도해 주세요";

export async function createRecommendation(args: {
  db: Db;
  storeId: UUID;
  today: ISODate;
  basis: RecommendBasis;
  ai: AiClient;
  dailyLimit: number;
}): Promise<ActionResult<RecommendationView>> {
  const { db, storeId, today, basis, ai, dailyLimit } = args;

  // ② 입력 스냅샷. 활성 메뉴가 없으면 추천할 수 없다 (IT-REC-01)
  const snapshot = await loadRecommendSnapshot(db, storeId, today);
  if (snapshot.menus.length === 0) {
    return fail("VALIDATION", "메뉴를 먼저 등록해 주세요", { menus: "등록된 메뉴가 없어요" });
  }

  // ① 일일 한도 — AI를 부르기 전에 센다 (IT-REC-06: 초과면 AI 호출 0회)
  const usage = await db.rpc("increment_ai_usage", { p_store_id: storeId, p_today: today, p_limit: dailyLimit });
  if (usage.error) {
    if (usage.error.message.includes("RATE_LIMITED")) return fail("RATE_LIMITED", "오늘 추천 횟수를 다 썼어요. 내일 다시 시도해 주세요");
    throw usage.error;
  }

  // ③~⑥ 전략으로 순서 정하기 → AI 호출 → 공통 후처리 (실패하면 규칙 기반 대체)
  const strategy = getStrategy(basis);
  const result = await recommend({ snapshot, strategy, today, ai });
  if (!result.ok) return fail(result.code, AI_FAILED_MESSAGE);

  // ⑦ 저장 (FR-REC-08). 스냅샷에는 전략이 정한 재료 순서를 남긴다 (IT-REC-05)
  const { body } = result;
  const { data, error } = await db
    .from("recommendations")
    .insert({
      store_id: storeId,
      basis,
      input_snapshot: { today, ranked: result.ranked, menuCount: snapshot.menus.length } as never,
      result_json: body as never,
      dropped_count: body.droppedCount,
      short_count: body.shortCount,
      unregistered_count: body.unregisteredCount,
      fallback: body.fallback,
    })
    .select("id")
    .single();
  if (error) throw error;

  return ok({ ...body, id: data.id, basis });
}
