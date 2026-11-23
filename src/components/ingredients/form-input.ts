import { z } from "zod";
import { IngredientInput, type IngredientDetail } from "@/types/contracts";

export type IngredientFormDraft = {
  name: string; category: string; unit: "g" | "ml" | "ea";
  minStock: string; targetStock: string; storage: "fridge" | "freezer" | "room";
  trackExpiry: boolean; defaultShelfDays: string;
  units: { unitName: string; factor: string }[];
};
const numberText = z.string().trim().min(1, "숫자를 입력해 주세요").pipe(z.coerce.number<string>().finite("숫자를 다시 확인해 주세요"));
// 숫자 변환 오류를 모으고, 다른 필드와 공유 계약의 교차 검증도 끝까지 실행한다.
export const ingredientFormSchema = z.object({
  name: z.string(), category: z.string(), unit: z.enum(["g", "ml", "ea"]),
  minStock: z.string(), targetStock: z.string(),
  storage: z.enum(["fridge", "freezer", "room"]), trackExpiry: z.boolean(),
  defaultShelfDays: z.string(),
  units: z.array(z.object({ unitName: z.string(), factor: z.string() })),
}).transform((value, ctx) => {
  const number = (text: string, path: (string | number)[], fallback: number) => {
    const result = numberText.safeParse(text);
    if (result.success) return result.data;
    for (const issue of result.error.issues) ctx.addIssue({ code: "custom", path,
      message: /[가-힣]/.test(issue.message) ? issue.message : "숫자를 다시 확인해 주세요" });
    // 오류를 이미 기록했으므로 이 값은 다른 필드 검증에만 쓰이고 전송되지 않는다.
    return fallback;
  };
  const optionalNumber = (text: string, path: string[]) => text.trim() ? number(text, path, 0) : undefined;
  let defaultShelfDays = value.trackExpiry ? optionalNumber(value.defaultShelfDays, ["defaultShelfDays"]) : undefined;
  const days = IngredientInput.shape.defaultShelfDays.safeParse(defaultShelfDays);
  if (!days.success) {
    for (const issue of days.error.issues) ctx.addIssue({ ...issue, path: ["defaultShelfDays", ...issue.path] });
    // 정수 검증 실패도 공유 계약의 중복 단위 등 교차 검증을 막지 않게 한다.
    defaultShelfDays = 1;
  }
  const result = IngredientInput.safeParse({ ...value, category: value.category.trim() || undefined,
    minStock: number(value.minStock, ["minStock"], 0),
    targetStock: optionalNumber(value.targetStock, ["targetStock"]), defaultShelfDays,
    units: value.units.map((unit, index) => ({ ...unit, factor: number(unit.factor, ["units", index, "factor"], 1) })),
  });
  if (result.success) return result.data;
  for (const issue of result.error.issues) ctx.addIssue({ ...issue });
  return z.NEVER;
});

export const emptyDraft: IngredientFormDraft = { name: "", category: "", unit: "g", minStock: "0", targetStock: "", storage: "fridge", trackExpiry: true, defaultShelfDays: "", units: [] };

export function ingredientDraft(data: IngredientDetail): IngredientFormDraft {
  return { name: data.name, category: data.category ?? "", unit: data.unit,
    minStock: String(data.minStock), targetStock: data.targetStock === null ? "" : String(data.targetStock),
    storage: data.storage, trackExpiry: data.trackExpiry, defaultShelfDays: data.defaultShelfDays === null ? "" : String(data.defaultShelfDays),
    units: data.units.map((unit) => ({ unitName: unit.unitName, factor: String(unit.factor) })),
  };
}

export function formErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    const fallback = path === "category" ? "20자 이내로 입력해 주세요"
      : path === "units" ? "환산 단위는 10개까지 등록할 수 있어요"
      : path === "defaultShelfDays" ? "1~3650 사이의 정수로 입력해 주세요"
      : path === "minStock" || path === "targetStock" ? "0 이상으로 입력해 주세요"
      : "숫자를 다시 확인해 주세요";
    fields[path] ??= /[가-힣]/.test(issue.message) ? issue.message : fallback;
  }
  return fields;
}
