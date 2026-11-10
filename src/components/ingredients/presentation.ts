import type { IngredientDetail, IngredientSummary } from "@/types/contracts";
import type { IngredientCardData, IngredientDetailData } from "./view-model";

const quantity = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });
const price = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
const qty = (value: number, unit: string) => `${quantity.format(value)}${unit}`;

// daysLeft와 재고 집계는 조회 계층이 제공한다. 화면에서는 표기만 정한다.
function expiry(days: number | null, date: string | null): IngredientCardData["expiry"] {
  if (days === null || date === null) return null;
  if (days < 0) return { label: "지남", date, tone: "expired" };
  return { label: `D-${days}`, date, tone: days <= 1 ? "urgent" : days <= 3 ? "soon" : "ok" };
}

export function ingredientCard(data: IngredientSummary): IngredientCardData {
  const badge = expiry(data.daysLeft, data.nearestExpiresAt);
  return { id: data.id, name: data.name, category: data.category || "미분류", storage: data.storage,
    stockText: qty(data.availableRemaining, data.unit),
    stockHint: data.expiredRemaining > 0 ? `기한 지난 ${qty(data.expiredRemaining, data.unit)}는 사용 가능 재고에서 뺐어요` : undefined,
    noExpiryText: "기한 정보가 없어요", expiry: badge,
    statuses: [ ...(data.expiredRemaining > 0 ? ["expired" as const] : []),
      ...(data.daysLeft !== null && data.daysLeft >= 0 && data.daysLeft <= 3 ? ["soon" as const] : []),
      ...(data.isLow ? ["low" as const] : []) ],
  };
}

export function ingredientDetail(data: IngredientDetail): IngredientDetailData {
  return { ...ingredientCard(data), noExpiryText: data.trackExpiry ? "기한 정보가 없어요" : "기한 추적 안 함",
    unitLabel: data.unit, minStockText: qty(data.minStock, data.unit),
    targetStockText: data.targetStock === null ? "설정 안 함" : qty(data.targetStock, data.unit),
    shelfLifeText: !data.trackExpiry ? "기한 추적 안 함" : data.defaultShelfDays === null ? "설정 안 함" : `${data.defaultShelfDays}일`,
    totalStockText: qty(data.totalRemaining, data.unit), hasRemaining: data.totalRemaining > 0,
    conversionTexts: data.units.map((unit) => `1${unit.unitName} = ${qty(unit.factor, data.unit)}`),
    lots: data.lots.map((lot) => ({ id: lot.id, receivedOn: lot.receivedAt, expiresOn: lot.expiresAt,
      expiryLabel: expiry(lot.daysLeft, lot.expiresAt)?.label ?? (data.trackExpiry ? "기한 정보 없음" : "기한 추적 안 함"),
      expiryTone: expiry(lot.daysLeft, lot.expiresAt)?.tone ?? null,
      remainingText: qty(lot.remaining, data.unit), quantityText: qty(lot.quantity, data.unit),
      unitPriceText: lot.unitPrice === null ? "미입력" : `${price.format(lot.unitPrice)}원/${data.unit}`,
      sourceText: lot.expirySource === "manual" ? "직접 입력한 기한이에요" : lot.expirySource === "default" ? "기본 보관일수로 정한 매장 기준 권장 기한이에요" : "기한 정보가 없어요",
      isExpired: lot.daysLeft !== null && lot.daysLeft < 0,
    })),
  };
}
