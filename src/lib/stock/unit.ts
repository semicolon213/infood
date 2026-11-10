import type { Unit } from "@/types/contracts";
import { invalid, type Calc } from "./types";

// 단위 환산 (SRS BR-03, 08_API_SPEC 1.4)
// 재고는 재료의 기본 단위(g/ml/ea)로 저장한다. 환산은 이 모듈로만 한다.

// 부동소수 오차 없이 소수 n자리 반올림 ("1.2345e3" 방식)
function roundTo(n: number, digits: number): number {
  // 1e-7처럼 이미 지수 표기인 수는 문자열 조합이 안 되므로 일반 계산 (오차가 결과 자릿수에 영향 없음)
  if (String(n).includes("e")) return Math.round(n * 10 ** digits) / 10 ** digits;
  return Number(`${Math.round(Number(`${n}e${digits}`))}e-${digits}`);
}

// 수량 계산의 중간값·저장값은 소수 3자리 (06_ARCHITECTURE 10장)
export function round3(n: number): number {
  return roundTo(n, 3);
}

// 고정 환산: 입력 단위 → [기본 단위, 계수]
const FIXED: Record<string, [Unit, number]> = {
  g: ["g", 1],
  kg: ["g", 1000],
  ml: ["ml", 1],
  l: ["ml", 1000],
  ea: ["ea", 1],
};

export type IngredientUnit = { unitName: string; factor: number }; // 1단위당 기본 단위 양

// 입력 수량을 기본 단위 수량으로. 환산 단위가 없으면 VALIDATION (UC-04, FR-ING-05)
export function toBaseQty(qty: number, inputUnit: string, baseUnit: Unit, units: IngredientUnit[] = []): Calc<number> {
  const name = inputUnit.trim();
  const fixed = FIXED[name.toLowerCase()];
  if (fixed) {
    const [unit, factor] = fixed;
    if (unit !== baseUnit) return invalid("unit", "이 재료에는 쓸 수 없는 단위예요");
    return { ok: true, value: round3(qty * factor) };
  }

  const custom = units.find((u) => u.unitName === name);
  if (!custom) return invalid("unit", "환산 계수를 입력해 주세요");
  return { ok: true, value: round3(qty * custom.factor) };
}

// 기본 단위당 단가 = 총액 ÷ 기본 단위 수량. DB numeric(12,4)에 맞춰 소수 4자리. 총액이 없으면 null
export function unitPriceOf(totalPrice: number | null | undefined, baseQty: number): number | null {
  if (totalPrice === null || totalPrice === undefined || baseQty <= 0) return null;
  return roundTo(totalPrice / baseQty, 4);
}
