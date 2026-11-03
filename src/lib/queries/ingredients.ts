import "server-only";
import type { IngredientDetail, IngredientFilter, IngredientSummary, UUID } from "@/types/contracts";
import { STUB_INGREDIENTS, toSummary } from "./stub-data";

// 08_API_SPEC 3장. WBS 2.10 stub — 실제 구현은 3.1b (get_ingredient_stock, 07_DB 3.4)

// FR-ING-03: 이름 순, q = 이름 검색, status = soon(임박 묶음) | expired(경과 묶음) | low(부족, BR-05)
export async function getIngredients(filter: IngredientFilter = {}): Promise<IngredientSummary[]> {
  const q = filter.q?.trim();
  return STUB_INGREDIENTS.map(toSummary)
    .filter((i) => !q || i.name.includes(q))
    .filter((i) => {
      if (filter.status === "low") return i.isLow;
      if (filter.status === "expired") return i.expiredRemaining > 0;
      if (filter.status === "soon") return i.daysLeft !== null && i.daysLeft >= 0 && i.daysLeft <= 3;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// FR-ING-02: 묶음 목록 포함. 없거나 다른 매장 재료면 null
export async function getIngredient(id: UUID): Promise<IngredientDetail | null> {
  return STUB_INGREDIENTS.find((i) => i.id === id) ?? null;
}
