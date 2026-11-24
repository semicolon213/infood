// 명세서 인식 결과 후처리 (08_API_SPEC 12장 후처리, FR-RCP-01). 순수 함수 — 재료 목록은 호출부가 매장 범위로 넘긴다
import type { ReceiptParse } from "./schemas";

export type ReceiptIngredient = { id: string; name: string; unit: "g" | "ml" | "ea"; units: { unitName: string }[] };

export type ReceiptLine = {
  lineNo: number;
  rawName: string;
  ingredientId: string | null; // 매장 재료로 확인된 ID만
  qty: number;
  unit: string | null; // 그 재료의 입고 단위로 쓸 수 있을 때만. 아니면 null + 확인 필요 (UT-RCP-02)
  unitText: string | null;
  totalPrice: number | null;
  confidence: "high" | "low";
};

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// 입고 화면 단위 선택지와 같은 규칙: 기본 단위, kg/L, 재료의 환산 단위 (BR-03)
function matchUnit(text: string | null, ing: ReceiptIngredient): string | null {
  if (text === null) return ing.unit;
  const t = norm(text);
  if (t === ing.unit || (ing.unit === "ea" && t === "개")) return ing.unit;
  if (ing.unit === "g" && t === "kg") return "kg";
  if (ing.unit === "ml" && t === "l") return "L";
  return ing.units.find((u) => norm(u.unitName) === t)?.unitName ?? null;
}

export function matchReceipt(parsed: ReceiptParse, ingredients: readonly ReceiptIngredient[]) {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const byName = new Map(ingredients.map((i) => [norm(i.name), i]));
  const lines: ReceiptLine[] = parsed.items.map((item, i) => {
    // 다른 매장 ID·잘못된 ID는 버리고(UT-RCP-01) 이름이 정확히 같은 재료로만 다시 연결한다
    const ing = (item.matchedIngredientId ? byId.get(item.matchedIngredientId) : undefined) ?? byName.get(norm(item.rawName));
    const unit = ing ? matchUnit(item.unitText, ing) : null;
    return {
      lineNo: i + 1,
      rawName: item.rawName,
      ingredientId: ing?.id ?? null,
      qty: item.quantity,
      unit,
      unitText: item.unitText,
      totalPrice: item.totalPrice,
      confidence: ing && unit ? item.confidence : "low",
    };
  });
  return { vendor: parsed.vendor, date: parsed.date, lines };
}
