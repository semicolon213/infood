// 추천 기준별 Concrete Strategy와 선택 함수 (docs/06_ARCHITECTURE.md 7.2).
// 새 기준 추가 = RecommendStrategy 구현 하나 + STRATEGIES에 한 줄 + RecommendBasis·DB basis check에 값 추가.
import { formatQty } from "@/lib/stock/order";
import { availableQty } from "@/lib/stock/status";
import { nearestDaysLeft, stockValue, weeklyUsage } from "@/lib/stock/cost";
import type { ISODate } from "@/types/contracts";
import type { RankedIngredient, RecommendBasis, RecommendSnapshot, RecommendStrategy } from "./types";

type Candidate = RankedIngredient & { lots: RecommendSnapshot["ingredients"][number]["lots"] };

// 사용 가능 재고가 있는 재료만 후보 (경과 묶음만 있는 재료는 추천에 쓰지 않는다, BR-02·05)
function candidates(snapshot: RecommendSnapshot, today: ISODate): Candidate[] {
  return snapshot.ingredients
    .map((i) => ({ ingredientId: i.id, name: i.name, unit: i.unit, availableQty: availableQty(i.lots, today), reason: "", lots: i.lots }))
    .filter((c) => c.availableQty > 0);
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ko");
const strip = (c: Candidate): RankedIngredient => ({
  ingredientId: c.ingredientId, name: c.name, unit: c.unit, availableQty: c.availableQty, reason: c.reason,
});

// 유통기한 우선 (기본값): 남은 일수 오름차순, 기한 없는 재료는 마지막
export const ExpiryFirst: RecommendStrategy = {
  basis: "expiry",
  rankIngredients(snapshot, today) {
    return candidates(snapshot, today)
      .map((c) => ({ c, d: nearestDaysLeft(c.lots, today) }))
      .sort((x, y) => (x.d ?? Infinity) - (y.d ?? Infinity) || byName(x.c, y.c))
      .map(({ c, d }) => strip({ ...c, reason: d === null ? "기한 없음" : `D-${d}` }));
  },
  promptGuide: () => "아래 재료는 유통기한이 가까운 순서입니다. 위에 있는 재료부터 소진하는 메뉴를 우선 추천하세요.",
};

// 원가 우선: 남은 재고 금액(단가 × 사용 가능 재고) 내림차순
export const CostFirst: RecommendStrategy = {
  basis: "cost",
  rankIngredients(snapshot, today) {
    return candidates(snapshot, today)
      .map((c) => ({ c, v: stockValue(c.lots, today) }))
      .sort((x, y) => y.v - x.v || byName(x.c, y.c))
      .map(({ c, v }) => strip({ ...c, reason: `재고 금액 ${v.toLocaleString("ko-KR")}원` }));
  },
  promptGuide: () => "아래 재료는 남은 재고 금액이 큰 순서입니다. 위에 있는 재료를 많이 쓰는 메뉴를 우선 추천해 묶인 돈을 줄이세요.",
};

// 인기 우선: 최근 7일 판매량 × 1인분 소요량으로 구한 주간 사용량 내림차순
export const PopularityFirst: RecommendStrategy = {
  basis: "popularity",
  rankIngredients(snapshot, today) {
    return candidates(snapshot, today)
      .map((c) => ({ c, u: weeklyUsage(c.ingredientId, snapshot.menus, snapshot.sales7d) }))
      .sort((x, y) => y.u - x.u || byName(x.c, y.c))
      .map(({ c, u }) => strip({ ...c, reason: `주간 사용 ${formatQty(u, c.unit)}` }));
  },
  promptGuide: () => "아래 재료는 최근 7일 동안 많이 쓰인 순서입니다. 손님이 많이 찾는 재료로 만드는 메뉴를 우선 추천하세요.",
};

const STRATEGIES: Record<RecommendBasis, RecommendStrategy> = { expiry: ExpiryFirst, cost: CostFirst, popularity: PopularityFirst };

export function getStrategy(basis: RecommendBasis = "expiry"): RecommendStrategy {
  return STRATEGIES[basis];
}
