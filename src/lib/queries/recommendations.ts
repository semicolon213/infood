import "server-only";
import type { SavedRecommendation, UUID } from "@/types/contracts";
import { STUB_RECOMMENDATION } from "./stub-data";

// 08_API_SPEC 9장. WBS 2.10 stub — 실제 구현은 4.2
// 저장된 추천 결과와 특선 등록 여부 (FR-REC-08). 없으면 null
export async function getRecommendation(id: UUID): Promise<SavedRecommendation | null> {
  return id === STUB_RECOMMENDATION.id ? STUB_RECOMMENDATION : null;
}
