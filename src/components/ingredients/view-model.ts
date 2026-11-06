// 화면 전용 표시 모델. 서버 계약이 아니다.
// presentation.ts에서 contracts.ts DTO를 이 모델로 옮긴다.
// 날짜·상태·수량 계산은 여기서 하지 않고 서버/도메인에서 받은 표시값만 사용한다.
export type IngredientStatus = "soon" | "expired" | "low";
export type StorageFilter = "fridge" | "freezer" | "room";

export type IngredientCardData = {
  id: string;
  name: string;
  category: string;
  storage: StorageFilter;
  stockText: string;
  stockHint?: string;
  noExpiryText?: string;
  statuses: IngredientStatus[];
  expiry: { label: string; date: string | null; tone: "expired" | "urgent" | "soon" | "ok" } | null;
};

export type IngredientDetailData = IngredientCardData & {
  unitLabel: string;
  minStockText: string;
  targetStockText: string;
  shelfLifeText: string;
  totalStockText: string;
  hasRemaining: boolean;
  conversionTexts: string[];
  // lib/queries가 유통기한순(null 마지막)으로 넘긴 순서를 그대로 표시한다.
  lots: {
    id: string;
    receivedOn: string;
    expiresOn: string | null;
    expiryLabel: string;
    expiryTone: NonNullable<IngredientCardData["expiry"]>["tone"] | null;
    remainingText: string;
    quantityText: string;
    unitPriceText: string;
    sourceText: string;
    isExpired: boolean;
  }[];
};

export const storageLabels: Record<StorageFilter, string> = {
  fridge: "냉장 (0~10℃)",
  freezer: "냉동 (-18℃ 이하)",
  room: "실온 (1~35℃)",
};
