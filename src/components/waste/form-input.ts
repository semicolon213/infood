import type { ZodError } from "zod";
import { RecordUsageInput, RecordWasteInput, StockHistoryFilter, type IngredientDetail } from "@/types/contracts";
import { fail, ok, type ActionError, type ActionResult } from "@/lib/result";
import { daysLeft } from "@/lib/stock/expiry";

export type StockIngredient = Pick<IngredientDetail, "id" | "name" | "unit" | "availableRemaining" | "lots">;
export type UsageDraft = { usedOn: string; items: { ingredientId: string; qty: string; memo: string }[] };
export type WasteDraft = { ingredientId: string; lotId: string; qty: string; reason: string; memo: string };
export type HistoryDraft = { from: string; to: string; type: string };
export const wasteReasons = { expired: "기한 경과", spoiled: "변질", mistake: "실수", other: "기타" } as const;
export const blankUsageItem = () => ({ ingredientId: "", qty: "", memo: "" });
export const blankWaste = (): WasteDraft => ({ ingredientId: "", lotId: "", qty: "", reason: "", memo: "" });

function collect(error: ZodError, fields: Record<string, string>) {
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    fields[path] ??= /[가-힣]/.test(issue.message) ? issue.message : path === "usedOn" ? "사용일을 다시 확인해 주세요"
      : path === "from" || path === "to" ? "날짜를 다시 확인해 주세요" : path.endsWith("ingredientId") ? "재료를 선택해 주세요"
      : path === "lotId" ? "폐기할 묶음을 선택해 주세요" : path === "reason" ? "폐기 사유를 선택해 주세요"
      : path.endsWith("memo") ? "메모는 100자 이내로 입력해 주세요" : path.endsWith("qty") ? "수량은 0보다 크고 1,000,000 이하로 입력해 주세요" : "입력한 내용을 다시 확인해 주세요";
  }
}

// 입력 파싱만 한다. 수량 환산·차감·부족량 계산은 서버의 lib/stock/RPC에 맡긴다.
function quantity(text: string, field: string, fields: Record<string, string>): number {
  const value = text.trim();
  if (!value || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) {
    fields[field] = value ? "수량은 지수 표기 없이 숫자로 입력해 주세요" : "수량을 입력해 주세요";
    return 1;
  }
  if ((value.split(".")[1]?.length ?? 0) > 3) fields[field] = "수량은 소수 셋째 자리까지 입력해 주세요";
  return Number(value);
}

export function validateUsage(draft: UsageDraft, ingredients: StockIngredient[], today: string): ActionResult<RecordUsageInput> {
  const fields: Record<string, string> = {};
  const parsed = RecordUsageInput.safeParse({ usedOn: draft.usedOn, items: draft.items.map((item, index) => ({ ingredientId: item.ingredientId,
    qty: quantity(item.qty, `items.${index}.qty`, fields), memo: item.memo })) });
  if (!parsed.success) collect(parsed.error, fields);
  if (draft.usedOn > today) fields.usedOn = "미래 날짜는 입력할 수 없어요";
  draft.items.forEach((item, index) => { if (item.ingredientId && !ingredients.some((candidate) => candidate.id === item.ingredientId)) fields[`items.${index}.ingredientId`] = "현재 선택할 수 없는 재료예요. 다시 선택해 주세요"; });
  return parsed.success && Object.keys(fields).length === 0 ? ok(parsed.data) : fail("VALIDATION", "입력한 내용을 다시 확인해 주세요", fields);
}

export function wasteSelection(ingredients: StockIngredient[], lotId: string | undefined, today: string): WasteDraft {
  for (const ingredient of ingredients) {
    const lot = ingredient.lots.find((item) => item.id === lotId && item.remaining > 0);
    if (lot) {
      const expired = lot.expiresAt !== null && lot.expiresAt < today;
      return { ingredientId: ingredient.id, lotId: lot.id, qty: expired ? String(lot.remaining) : "", reason: expired ? "expired" : "", memo: "" };
    }
  }
  return blankWaste();
}

// 직접 선택은 대상만 바꾼다. 경과 묶음 링크의 초깃값 채우기와 구분한다.
export const selectWasteLot = (draft: WasteDraft, lotId: string): WasteDraft => ({ ...draft, lotId });
export const selectWasteIngredient = (draft: WasteDraft, ingredientId: string): WasteDraft => ({ ...draft, ingredientId, lotId: "", qty: "" });

export function validateWaste(draft: WasteDraft, ingredients: StockIngredient[]): ActionResult<RecordWasteInput> {
  const fields: Record<string, string> = {};
  const qty = quantity(draft.qty, "qty", fields);
  const parsed = RecordWasteInput.safeParse({ lotId: draft.lotId, qty, reason: draft.reason, memo: draft.memo });
  if (!parsed.success) collect(parsed.error, fields);
  const ingredient = ingredients.find((item) => item.id === draft.ingredientId);
  if (!ingredient) fields.ingredientId = "재료를 선택해 주세요";
  const lot = ingredient?.lots.find((item) => item.id === draft.lotId && item.remaining > 0);
  if (!lot) fields.lotId = "폐기할 묶음을 다시 선택해 주세요";
  else if (qty > lot.remaining) fields.qty = "남은 양보다 많이 폐기할 수 없어요";
  return parsed.success && Object.keys(fields).length === 0 ? ok(parsed.data) : fail("VALIDATION", "입력한 내용을 다시 확인해 주세요", fields);
}

export function validateHistory(draft: HistoryDraft, today: string): ActionResult<StockHistoryFilter> {
  const parsed = StockHistoryFilter.safeParse({ from: draft.from, to: draft.to, type: draft.type || undefined });
  const fields: Record<string, string> = {};
  if (!parsed.success) collect(parsed.error, fields);
  else {
    if (draft.from > draft.to) fields.to = "종료일은 시작일 이후로 선택해 주세요";
    else if (daysLeft(draft.to, draft.from) > 30) fields.to = "한 번에 31일까지 조회할 수 있어요";
    if (draft.to > today) fields.to = "오늘까지의 기록을 조회할 수 있어요";
  }
  return parsed.success && Object.keys(fields).length === 0 ? ok(parsed.data) : fail("VALIDATION", "조회 조건을 다시 확인해 주세요", fields);
}

// 입력 수정은 해당 필드만 해제하고 삭제한 행 뒤의 오류는 새 인덱스로 연결한다.
export function updateRecordError(error: ActionError | null, changed: string[], removedIndex?: number): ActionError | null {
  if (!error?.fields) return error;
  const fields: Record<string, string> = {};
  for (const [key, message] of Object.entries(error.fields)) {
    let field = key;
    const row = /^items\.(\d+)\.(.+)$/.exec(key);
    if (row && removedIndex !== undefined) {
      const index = Number(row[1]);
      if (index === removedIndex) continue;
      if (index > removedIndex) field = `items.${index - 1}.${row[2]}`;
    }
    if (!changed.some((key) => field === key || (key !== "items" && field.startsWith(`${key}.`)))) fields[field] = message;
  }
  return Object.keys(fields).length ? { ...error, fields } : null;
}
