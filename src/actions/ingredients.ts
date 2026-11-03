"use server";

import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { STUB_IDS, STUB_INGREDIENTS } from "@/lib/queries/stub-data";
import { IdInput, IngredientInput, type IdOutput } from "@/types/contracts";

// 08_API_SPEC 3장. WBS 2.10 stub (시그니처 최종, 본문은 고정값) — 실제 구현은 3.1b

// FR-ING-01, FR-ING-05, BR-03
export async function createIngredient(input: IngredientInput): Promise<ActionResult<IdOutput>> {
  const parsed = IngredientInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  if (STUB_INGREDIENTS.some((i) => i.name === parsed.data.name)) {
    return fail("CONFLICT", "같은 이름의 재료가 있어요", { name: "같은 이름의 재료가 있어요" });
  }
  return ok({ id: STUB_IDS.newId });
}

// FR-ING-01. units는 통째로 교체, unit은 묶음이 없을 때만 변경
export async function updateIngredient(input: IngredientInput): Promise<ActionResult<IdOutput>> {
  const parsed = IngredientInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  if (!parsed.data.id) return fail("VALIDATION", "수정할 재료를 찾지 못했어요", { id: "필수 항목이에요" });
  const current = STUB_INGREDIENTS.find((i) => i.id === parsed.data.id);
  if (!current) return fail("NOT_FOUND", "재료를 찾지 못했어요");
  if (current.unit !== parsed.data.unit && current.lots.length > 0) {
    return fail("CONFLICT", "재고가 있는 재료는 기본 단위를 바꿀 수 없어요", { unit: "재고가 있어 바꿀 수 없어요" });
  }
  return ok({ id: current.id });
}

// FR-ING-01. 잔량(사용 가능 + 경과)이 남아 있으면 CONFLICT
export async function deactivateIngredient(input: IdInput): Promise<ActionResult<IdOutput>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const current = STUB_INGREDIENTS.find((i) => i.id === parsed.data.id);
  if (!current) return fail("NOT_FOUND", "재료를 찾지 못했어요");
  if (current.totalRemaining > 0) return fail("CONFLICT", "남은 재고를 먼저 사용·폐기 처리해 주세요");
  return ok({ id: current.id });
}
