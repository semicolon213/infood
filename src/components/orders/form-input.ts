import { OrderFilter, SaveOrderInput, type IngredientSummary, type OrderDetail, type OrderDraft } from "@/types/contracts";
import { fail, ok, type ActionError, type ActionResult } from "@/lib/result";

export type OrderIngredient = Pick<IngredientSummary, "id" | "name" | "unit">;
export type OrderFormDraft = { orderDate: string; memo: string; items: { key: number; ingredientId: string; qty: string }[] };

// 선택 불가인 기존 행은 추가 한도에 넣지 않는다. 빈 행은 선택 대기 중인 한 칸으로 센다.
export function canAddOrderItem(items: OrderFormDraft["items"], ingredients: OrderIngredient[]): boolean {
  const unused = ingredients.filter((ingredient) => !items.some((row) => row.ingredientId === ingredient.id));
  return unused.length > items.filter((row) => !row.ingredientId).length;
}

// 하이드레이션 전 입력 등으로 표시값과 state가 달라도 제출 시 화면에 보이는 입력값을 쓴다.
export function readOrderForm(data: FormData, draft: OrderFormDraft): OrderFormDraft {
  const text = (key: string, fallback: string) => {
    const value = data.get(key);
    return typeof value === "string" ? value : fallback;
  };
  return {
    orderDate: text("orderDate", draft.orderDate), memo: text("memo", draft.memo),
    items: draft.items.map((row, index) => ({ ...row, ingredientId: text(`items.${index}.ingredientId`, row.ingredientId), qty: text(`items.${index}.qty`, row.qty) })),
  };
}

export function unmappedOrderErrors(fields: Record<string, string>, itemCount: number): string[] {
  return Object.entries(fields).flatMap(([key, message]) => {
    if (["orderDate", "memo", "items"].includes(key)) return [];
    const row = /^items\.(\d+)(?:\.(.+))?$/.exec(key);
    if (row && Number(row[1]) < itemCount && ["ingredientId", "qty"].includes(row[2])) return [];
    return [`${row ? `품목 ${Number(row[1]) + 1}` : key === "id" ? "발주 목록" : "입력 내용"}: ${message}`];
  });
}

export function orderFormDraft(today: string, order?: OrderDetail, suggestion?: OrderDraft): OrderFormDraft {
  return { orderDate: order?.orderDate ?? today, memo: order?.memo ?? "", items: (order?.items ?? suggestion?.items ?? []).map((item, key) => ({
    key, ingredientId: item.ingredientId, qty: String("qty" in item ? item.qty : item.suggestedQty),
  })) };
}

// 입력 문자열만 검사한다. 권장 발주량과 단위 환산은 lib/stock과 서버의 책임이다.
export function validateOrderForm(draft: OrderFormDraft, ingredients: OrderIngredient[], today: string, id?: string): ActionResult<SaveOrderInput> {
  const fields: Record<string, string> = {};
  const items = draft.items.map((row, index) => {
    const value = row.qty.trim();
    const field = `items.${index}.qty`;
    if (!value) fields[field] = "발주량을 입력해 주세요";
    else if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) fields[field] = "발주량은 숫자로 입력해 주세요 (예: 2500, 2500.5)";
    else if ((value.split(".")[1]?.length ?? 0) > 3) fields[field] = "발주량은 소수 셋째 자리까지 입력해 주세요";
    else if (Number(value) > 1_000_000) fields[field] = "발주량은 1,000,000 이하로 입력해 주세요";
    if (!ingredients.some((ingredient) => ingredient.id === row.ingredientId)) fields[`items.${index}.ingredientId`] = row.ingredientId ? "현재 선택할 수 없는 재료예요. 다른 재료로 바꾸거나 삭제해 주세요" : "재료를 선택해 주세요";
    return { ingredientId: row.ingredientId, qty: Number(value) };
  });
  const parsed = SaveOrderInput.safeParse({ id, orderDate: draft.orderDate, memo: draft.memo, items });
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const key = issue.path.join(".");
    fields[key] ??= /[가-힣]/.test(issue.message) ? issue.message : key === "orderDate" ? "발주일을 다시 확인해 주세요" : key === "memo" ? "메모는 200자까지 입력해 주세요" : "입력한 내용을 다시 확인해 주세요";
  }
  if (draft.orderDate > today) fields.orderDate = "발주일은 오늘까지 선택할 수 있어요";
  if (!items.some((item) => item.qty > 0 && Number.isFinite(item.qty))) fields.items = "발주량이 0보다 큰 품목을 하나 이상 추가해 주세요";
  if (Object.keys(fields).length || !parsed.success) return fail("VALIDATION", "입력한 내용을 다시 확인해 주세요", fields);
  // qty ≤ 0 제외는 기존 서버 계약대로 서버가 수행한다. 행 순서를 유지해 서버 오류 경로와 연결한다.
  return ok(parsed.data);
}

export function updateOrderError(error: ActionError | null, changed: string[], removedIndex?: number): ActionError | null {
  if (!error?.fields) return error;
  const fields: Record<string, string> = {};
  for (const [key, message] of Object.entries(error.fields)) {
    let field = key;
    const row = /^items\.(\d+)\.(.+)$/.exec(key);
    if (removedIndex !== undefined && row) {
      const index = Number(row[1]);
      if (index === removedIndex) continue;
      if (index > removedIndex) field = `items.${index - 1}.${row[2]}`;
    }
    if (!changed.includes(field)) fields[field] = message;
  }
  return Object.keys(fields).length ? { ...error, fields } : null;
}

export function parseOrderFilter(from: string | string[] | undefined, to: string | string[] | undefined): ActionResult<OrderFilter> {
  const parsed = OrderFilter.safeParse({ from: from === "" ? undefined : from, to: to === "" ? undefined : to });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] = "조회할 날짜를 다시 확인해 주세요";
    return fail("VALIDATION", "조회할 날짜를 다시 확인해 주세요", fields);
  }
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) return fail("VALIDATION", "시작일은 종료일보다 늦을 수 없어요", { from: "시작일은 종료일보다 늦을 수 없어요", to: "종료일은 시작일보다 빠를 수 없어요" });
  return ok(parsed.data);
}
