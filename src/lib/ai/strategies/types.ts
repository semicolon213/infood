// Strategy 패턴: 추천 기준 (docs/06_ARCHITECTURE.md 7.2, FR-REC-06).
// 전략은 상태가 없는 순수 객체다. DB·시계·AI에 의존하지 않고 오늘 날짜도 인자로 받는다.
import type { ISODate, RecommendBasis, Unit, UUID } from "@/types/contracts";

export type { RecommendBasis };

export interface SnapshotLot {
  remaining: number;
  expiresAt: ISODate | null;
  unitPrice: number | null; // 원 / 기본 단위
  receivedAt: ISODate; // 원가 계산에 "최근 묶음 단가"를 고르는 기준
}

/** 추천 입력 스냅샷 — Route Handler가 DB에서 모아 넘긴다 (08_API_SPEC 9장 ②). 묶음은 잔량 > 0만 */
export interface RecommendSnapshot {
  ingredients: { id: UUID; name: string; unit: Unit; lots: SnapshotLot[] }[];
  menus: { id: UUID; name: string; price: number; recipe: { ingredientId: UUID; qty: number }[] }[]; // 활성 메뉴만
  sales7d: { menuId: UUID; qty: number }[]; // 최근 7일 판매 수량 합
}

/** 전략이 정한 순서의 후보 재료. 프롬프트에 이 순서대로 넣는다 */
export interface RankedIngredient {
  ingredientId: UUID;
  name: string;
  unit: Unit;
  availableQty: number; // 사용 가능 재고 (BR-05)
  reason: string; // 프롬프트용 근거: "D-1", "재고 금액 9,000원", "주간 사용 1,200g"
}

export interface RecommendStrategy {
  readonly basis: RecommendBasis;
  /** 후보 재료(사용 가능 재고 > 0)를 우선순위대로 정렬한다. 일수·금액·수량 계산은 lib/stock 순수 함수로만 한다 (AGENTS 규칙 2) */
  rankIngredients(snapshot: RecommendSnapshot, today: ISODate): RankedIngredient[];
  /** 프롬프트에 넣을 기준 설명 */
  promptGuide(): string;
}
