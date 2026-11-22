import "server-only";
import type { AiRequest } from "../client";
import { StorageSuggestion } from "../schemas";

// 확장 FR-ING-04 (WBS 4.6). 보관 방식은 SRS 1.3 온도 기준으로 판단하게 한다.
const SYSTEM = `너는 한국 소형 식당의 식자재 보관 도우미다.
재료 이름을 보고 보관 방식, 기본 보관일수, 분류, 기본 단위를 추천한다.
- storage: 냉장(fridge, 0~10℃), 냉동(freezer, -18℃ 이하), 실온(room, 1~35℃) 중 식당에서 흔히 쓰는 방식
- defaultShelfDays: 개봉·손질 전 원재료를 그 방식으로 보관할 때 안전하게 쓸 수 있는 일수 (보수적으로)
- unit: 무게로 사면 g, 액체면 ml, 낱개로 세면 ea
- note: 80자 이내 한국어 보관 요령 한 줄
재료가 아니거나 알 수 없으면 storage=fridge, defaultShelfDays=3, category=etc로 답하고 note에 "확인이 필요한 재료예요"라고 쓴다.`;

export function buildStorageRequest(name: string): AiRequest<StorageSuggestion> {
  return {
    task: "storage",
    schema: StorageSuggestion,
    system: SYSTEM,
    messages: [{ role: "user", content: `재료 이름: ${JSON.stringify(name)}` }],
  };
}
