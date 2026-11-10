import { MenuInput, type IngredientSummary, type MenuDetail } from "@/types/contracts";
import { fail, ok, type ActionError, type ActionResult } from "@/lib/result";

export type MenuIngredient = Pick<IngredientSummary, "id" | "name" | "unit">;
export type MenuDraft = { name: string; price: string; recipe: { ingredientId: string; qty: string }[] };

// menus.price의 int 범위. 서버 계약의 상한 검증은 담당자 보완 전까지 화면에서 방어한다.
export const MAX_MENU_PRICE = 2_147_483_647;

export function updateMenuError(error: ActionError | null, next: MenuDraft, changed: string[], removedIndex?: number): ActionError | null {
  if (!error?.fields) return error;
  const fields: Record<string, string> = {};
  for (const [key, message] of Object.entries(error.fields)) {
    let field = key;
    const row = /^recipe\.(\d+)\.(.+)$/.exec(key);
    if (removedIndex !== undefined && row) {
      const index = Number(row[1]);
      if (index === removedIndex) continue;
      if (index > removedIndex) field = `recipe.${index - 1}.${row[2]}`;
    }
    if (changed.some((key) => field === key || field.startsWith(`${key}.`))) continue;
    // 다른 행의 재료를 바꾸거나 지워서 해소된 중복 안내만 함께 해제한다.
    const ingredientError = /^recipe\.(\d+)\.ingredientId$/.exec(field);
    if (ingredientError && message === "같은 재료가 두 번 있어요") {
      const ingredientId = next.recipe[Number(ingredientError[1])]?.ingredientId;
      if (next.recipe.filter((item) => item.ingredientId === ingredientId).length < 2) continue;
    }
    fields[field] = message;
  }
  return Object.keys(fields).length ? { ...error, fields } : null;
}

export function menuDraft(menu?: MenuDetail): MenuDraft {
  return menu ? { name: menu.name, price: String(menu.price), recipe: menu.recipe.map((item) => ({ ingredientId: item.ingredientId, qty: String(item.qty) })) }
    : { name: "", price: "", recipe: [] };
}

// 폼 입력 문자열만 숫자로 변환한다. 단위 환산·반올림·원가 계산은 하지 않는다.
export function validateMenuDraft(draft: MenuDraft, ingredients: MenuIngredient[], id?: string): ActionResult<MenuInput> {
  const fields: Record<string, string> = {};
  const number = (value: string, field: string, fallback: number) => {
    if (!value.trim() || !Number.isFinite(Number(value))) {
      fields[field] = value.trim() ? "숫자를 다시 확인해 주세요" : field === "price" ? "판매가를 입력해 주세요" : "소요량을 입력해 주세요";
      return fallback;
    }
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
      fields[field] = field === "price" ? "판매가는 지수 표기 없이 숫자로 입력해 주세요" : "소요량은 지수 표기 없이 숫자로 입력해 주세요";
      return fallback;
    }
    if (field !== "price" && (value.trim().split(".")[1]?.length ?? 0) > 3) {
      fields[field] = "소요량은 소수 셋째 자리까지 입력해 주세요";
      return fallback;
    }
    if (field === "price" && Number(value) > MAX_MENU_PRICE) fields[field] = "판매가는 2,147,483,647원 이하로 입력해 주세요";
    return Number(value);
  };
  const parsed = MenuInput.safeParse({ id, name: draft.name, price: number(draft.price, "price", 0),
    recipe: draft.recipe.map((item, index) => ({ ingredientId: item.ingredientId, qty: number(item.qty, `recipe.${index}.qty`, 1) })),
  });
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    const message = /[가-힣]/.test(issue.message) ? issue.message : path === "price" ? "판매가는 0 이상의 정수로 입력해 주세요"
      : path.endsWith("ingredientId") ? "재료를 선택해 주세요" : path.endsWith("qty") ? "소요량은 0보다 크고 1,000,000 이하로 입력해 주세요" : "입력한 내용을 다시 확인해 주세요";
    fields[path] ??= message;
  }
  const available = new Set(ingredients.map((item) => item.id));
  draft.recipe.forEach((item, index) => {
    if (item.ingredientId && !available.has(item.ingredientId)) fields[`recipe.${index}.ingredientId`] = "현재 선택할 수 없는 재료예요. 다른 재료로 바꾸거나 삭제해 주세요";
  });
  if (Object.keys(fields).length > 0 || !parsed.success) return fail("VALIDATION", "입력한 내용을 다시 확인해 주세요", fields);
  return ok(parsed.data);
}
