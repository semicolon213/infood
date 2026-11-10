"use server";

import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { STUB_IDS, STUB_RECOMMENDATION } from "@/lib/queries/stub-data";
import { AcceptRecommendationInput, type AcceptRecommendationOutput } from "@/types/contracts";

// 08_API_SPEC 9장. WBS 2.10 stub — 실제 구현은 4.2 (추천 생성은 Route Handler POST /api/recommendations)

// FR-REC-07, BR-04: 사용자가 검토·수정한 값으로 특선 메뉴 등록
export async function acceptRecommendation(
  input: AcceptRecommendationInput,
): Promise<ActionResult<AcceptRecommendationOutput>> {
  const parsed = AcceptRecommendationInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const rec = parsed.data.recommendationId === STUB_RECOMMENDATION.id ? STUB_RECOMMENDATION : null;
  if (!rec || !rec.newIdeas.some((i) => i.index === parsed.data.ideaIndex)) {
    return fail("NOT_FOUND", "추천 결과를 찾지 못했어요");
  }
  return ok({ menuId: STUB_IDS.newId });
}
