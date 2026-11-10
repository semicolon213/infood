import { describe, expect, it } from "vitest";
import { MAX_MENU_PRICE, menuDraft, updateMenuError, validateMenuDraft, type MenuDraft, type MenuIngredient } from "./form-input";

const ingredients: MenuIngredient[] = [
  { id: "00000000-0000-4000-8000-000000000101", name: "양파", unit: "g" },
  { id: "00000000-0000-4000-8000-000000000105", name: "계란", unit: "ea" },
];
const valid: MenuDraft = { name: " 계란말이 ", price: "8000", recipe: [{ ingredientId: ingredients[0].id, qty: "30.125" }, { ingredientId: ingredients[1].id, qty: "2" }] };

// E2E-02의 입력 경계 보조 검사. 실제 DB 통합·전체 E2E 통과로 집계하지 않는다.
describe("3.2a 메뉴 폼 입력", () => {
  it("E2E-02 보조: 기본 단위 수량과 원 정수를 공유 계약으로 전달", () => {
    expect(validateMenuDraft(valid, ingredients)).toEqual({ ok: true, data: { name: "계란말이", price: 8000, recipe: [{ ingredientId: ingredients[0].id, qty: 30.125 }, { ingredientId: ingredients[1].id, qty: 2 }] } });
  });
  it("E2E-02 보조: 빈 금액·소요량을 0으로 바꾸지 않고 이름 오류도 함께 안내", () => {
    const result = validateMenuDraft({ name: " ", price: "", recipe: [{ ingredientId: "", qty: "" }] }, ingredients);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.error.fields ?? {}).sort()).toEqual(["name", "price", "recipe.0.ingredientId", "recipe.0.qty"]);
  });
  it("E2E-02 보조: 소수 판매가·잘못된 소요량과 재료 중복을 동시에 검출", () => {
    const result = validateMenuDraft({ ...valid, price: "1.5", recipe: [{ ingredientId: ingredients[0].id, qty: "NaN" }, { ingredientId: ingredients[0].id, qty: "0" }] }, ingredients);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields).toMatchObject({ price: "판매가는 0 이상의 정수로 입력해 주세요", "recipe.0.qty": "숫자를 다시 확인해 주세요", "recipe.1.ingredientId": "같은 재료가 두 번 있어요", "recipe.1.qty": "소요량은 0보다 크고 1,000,000 이하로 입력해 주세요" });
  });
  it("E2E-02 보조: 계약의 수량 상한·0원·빈 레시피를 유지", () => {
    expect(validateMenuDraft({ ...valid, price: "0", recipe: [] }, ingredients).ok).toBe(true);
    expect(validateMenuDraft({ ...valid, recipe: [{ ingredientId: ingredients[0].id, qty: "1000000" }] }, ingredients).ok).toBe(true);
    for (const qty of ["-1", "0", "1000000.001", "Infinity"]) expect(validateMenuDraft({ ...valid, recipe: [{ ingredientId: ingredients[0].id, qty }] }, ingredients).ok).toBe(false);
  });
  it("E2E-02 보조: 수정 중 선택할 수 없게 된 재료를 자동 삭제하지 않고 안내", () => {
    const result = validateMenuDraft(valid, [], "00000000-0000-4000-8000-000000000301");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields).toHaveProperty("recipe.0.ingredientId", "현재 선택할 수 없는 재료예요. 다른 재료로 바꾸거나 삭제해 주세요");
    expect(valid.recipe).toHaveLength(2);
  });
  it("E2E-02 보조: 수정 초깃값은 저장된 수량을 손실 없이 문자열로 표시", () => {
    expect(menuDraft({ id: "00000000-0000-4000-8000-000000000301", name: "계란말이", price: 8000, isActive: false, isSpecial: false, recipe: [{ ingredientId: ingredients[0].id, name: "양파", unit: "g", qty: 30.125 }] })).toEqual({ name: "계란말이", price: "8000", recipe: [{ ingredientId: ingredients[0].id, qty: "30.125" }] });
  });
  it("E2E-02 보조 D-3: 소수 넷째 자리 입력은 반올림하거나 전송하지 않는다", () => {
    for (const qty of ["0.0004", "0.0015", "1.23456"]) {
      const result = validateMenuDraft({ ...valid, recipe: [{ ingredientId: ingredients[0].id, qty }] }, ingredients);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fields).toHaveProperty("recipe.0.qty", "소요량은 소수 셋째 자리까지 입력해 주세요");
    }
    expect(validateMenuDraft({ ...valid, recipe: [{ ingredientId: ingredients[0].id, qty: "0.001" }] }, ingredients).ok).toBe(true);
  });
  it("E2E-02 보조 D-6·D-7: 판매가 int 상한을 지키고 지수·진법 표기는 거부", () => {
    expect(validateMenuDraft({ ...valid, price: String(MAX_MENU_PRICE) }, ingredients).ok).toBe(true);
    for (const price of ["2147483648", "3000000000", "1e3", "0x10"]) {
      const result = validateMenuDraft({ ...valid, price }, ingredients);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.fields).toHaveProperty("price");
    }
    expect(validateMenuDraft({ ...valid, recipe: [{ ingredientId: ingredients[0].id, qty: "1e-4" }] }, ingredients).ok).toBe(false);
  });
  it("E2E-02 보조 D-4: 재료 변경 시 그 필드만 해제하고 다른 행·수량 오류는 유지", () => {
    const error = { code: "VALIDATION" as const, message: "다시 확인해 주세요", fields: { name: "이름 오류", "recipe.0.ingredientId": "재료 오류", "recipe.0.qty": "수량 오류", "recipe.1.qty": "다른 행 오류" } };
    expect(updateMenuError(error, valid, ["recipe.0.ingredientId"])?.fields).toEqual({ name: "이름 오류", "recipe.0.qty": "수량 오류", "recipe.1.qty": "다른 행 오류" });
  });
  it("E2E-02 보조 D-4: 행 삭제 시 남은 오류를 새 인덱스에 연결", () => {
    const error = { code: "VALIDATION" as const, message: "다시 확인해 주세요", fields: { price: "판매가 오류", "recipe.0.qty": "삭제되는 오류", "recipe.1.ingredientId": "남는 재료 오류", "recipe.2.qty": "남는 수량 오류" } };
    expect(updateMenuError(error, valid, [], 0)?.fields).toEqual({ price: "판매가 오류", "recipe.0.ingredientId": "남는 재료 오류", "recipe.1.qty": "남는 수량 오류" });
  });
  it("E2E-02 보조 D-4: 다른 행의 변경으로 해소된 중복 안내만 해제", () => {
    const error = { code: "VALIDATION" as const, message: "다시 확인해 주세요", fields: { "recipe.1.ingredientId": "같은 재료가 두 번 있어요", "recipe.1.qty": "소요량 오류" } };
    expect(updateMenuError(error, valid, ["recipe.0.ingredientId"])?.fields).toEqual({ "recipe.1.qty": "소요량 오류" });
  });
});
