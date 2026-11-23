import { describe, expect, it } from "vitest";
import type { IngredientDetail } from "@/types/contracts";
import { catalogHref, readFilters, registrationReturnTo } from "./filters";
import { emptyDraft, formErrors, ingredientDraft, ingredientFormSchema } from "./form-input";
import { ingredientCard, ingredientDetail } from "./presentation";

const detail: IngredientDetail = {
  id: "00000000-0000-4000-8000-000000000102", name: "두부", category: "가공", unit: "ea", storage: "fridge",
  totalRemaining: 8, availableRemaining: 6, expiredRemaining: 2, minStock: 5, targetStock: 15, isLow: false,
  nearestExpiresAt: "2026-11-02", daysLeft: -1, defaultShelfDays: 5, trackExpiry: true, units: [{ unitName: "모", factor: 1 }],
  lots: [
    { id: "expired", quantity: 10, remaining: 2, unitPrice: 0.1234, receivedAt: "2026-10-28", expiresAt: "2026-11-02", expirySource: "default", daysLeft: -1 },
    { id: "soon", quantity: 6, remaining: 6, unitPrice: null, receivedAt: "2026-11-01", expiresAt: "2026-11-04", expirySource: "manual", daysLeft: 1 },
  ],
};
const valid = { ...emptyDraft, name: " 대파 ", category: " 채소 ", defaultShelfDays: "7" };

describe("3.1a 입력 계약 연결", () => {
  it("UI-ING-UNIT: 문자열 입력을 공유 DTO로 변환하고 선택값을 생략한다", () => {
    expect(ingredientFormSchema.parse(valid)).toMatchObject({ name: "대파", category: "채소", minStock: 0, targetStock: undefined, defaultShelfDays: 7 });
  });
  it("UI-ING-UNIT: 기한 추적 시 보관일수가 없으면 필드 오류를 반환한다", () => {
    const result = ingredientFormSchema.safeParse({ ...valid, defaultShelfDays: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formErrors(result.error).defaultShelfDays).toBe("기본 보관일수를 입력해 주세요");
  });
  it.each(["1.5", "0", "3651", "Infinity", "숫자아님"])("UI-ING-UNIT: 잘못된 보관일수 %s를 거절한다", (value) => {
    expect(ingredientFormSchema.safeParse({ ...valid, defaultShelfDays: value }).success).toBe(false);
  });
  it("UI-ING-UNIT: 추적을 끄면 숨긴 보관일수를 보내지 않는다", () => {
    expect(ingredientFormSchema.parse({ ...valid, trackExpiry: false, defaultShelfDays: "이전 입력" }).defaultShelfDays).toBeUndefined();
  });
  it("UI-ING-UNIT: 적정 재고가 최소보다 작으면 필드 오류를 반환한다", () => {
    const result = ingredientFormSchema.safeParse({ ...valid, minStock: "10", targetStock: "9" });
    expect(result.success).toBe(false);
    if (!result.success) expect(formErrors(result.error).targetStock).toContain("최소 재고");
  });
  it("UI-ING-UNIT: 비어 있는 필수 수량을 0으로 바꾸지 않는다", () => {
    expect(ingredientFormSchema.safeParse({ ...valid, minStock: " " }).success).toBe(false);
  });
  it("UI-ING-UNIT: 수정 시 한국어 카테고리와 환산 계수를 보존한다", () => {
    expect(ingredientFormSchema.parse(ingredientDraft(detail))).toMatchObject({ category: "가공", units: [{ unitName: "모", factor: 1 }] });
  });
  it.each(["kg", "L", "g", "ml", "ea"])("UI-ING-UNIT: 예약 단위 %s를 거절한다", (unitName) => {
    expect(ingredientFormSchema.safeParse({ ...valid, units: [{ unitName, factor: "1" }] }).success).toBe(false);
  });
  it("UI-ING-UNIT: 공백 정리 후 중복 단위와 10개 초과를 거절한다", () => {
    expect(ingredientFormSchema.safeParse({ ...valid, units: [{ unitName: "단", factor: "1" }, { unitName: " 단 ", factor: "2" }] }).success).toBe(false);
    expect(ingredientFormSchema.safeParse({ ...valid, units: Array.from({ length: 11 }, (_, i) => ({ unitName: `묶음${i}`, factor: "1" })) }).success).toBe(false);
  });
  it("UI-ING-UNIT: 숫자 변환·계약·중복 단위 오류를 첫 제출에서 모두 반환한다", () => {
    const result = ingredientFormSchema.safeParse({ ...valid, minStock: "", targetStock: "-1", defaultShelfDays: "1.5",
      units: [{ unitName: "KG", factor: "0" }, { unitName: "단", factor: "1" }, { unitName: " 단", factor: "-3" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(formErrors(result.error)).toEqual({
      minStock: "숫자를 입력해 주세요", targetStock: "0 이상으로 입력해 주세요",
      defaultShelfDays: "1~3650 사이의 정수로 입력해 주세요",
      "units.0.unitName": "기본 단위는 환산 단위로 쓸 수 없어요", "units.0.factor": "0보다 큰 값을 입력해 주세요",
      "units.2.unitName": "같은 단위 이름이 있어요", "units.2.factor": "0보다 큰 값을 입력해 주세요",
    });
  });
  it("UI-ING-UNIT: 잘못된 계수와 보관일수가 이름·필수 보관일수·중복 오류를 숨기지 않는다", () => {
    const result = ingredientFormSchema.safeParse({ ...valid, name: "", minStock: "Infinity", defaultShelfDays: "",
      units: [{ unitName: "단", factor: "숫자아님" }, { unitName: " 단 ", factor: "" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(formErrors(result.error)).toMatchObject({
      name: "재료 이름을 입력해 주세요", minStock: "숫자를 다시 확인해 주세요",
      defaultShelfDays: "기본 보관일수를 입력해 주세요", "units.1.unitName": "같은 단위 이름이 있어요",
      "units.0.factor": "숫자를 다시 확인해 주세요", "units.1.factor": "숫자를 입력해 주세요",
    });
  });
});

describe("3.1a 조회 DTO 표시", () => {
  it("UI-ING-UNIT: 경과 재고도 잔량으로 취급하고 사용 가능량은 서버 값을 쓴다", () => {
    const model = ingredientDetail({ ...detail, availableRemaining: 0, totalRemaining: 2 });
    expect(model.hasRemaining).toBe(true); expect(model.stockText).toBe("0ea"); expect(model.stockHint).toContain("2ea");
  });
  it("UI-ING-UNIT: 서버 묶음 순서와 단가 정밀도를 표시한다", () => {
    const model = ingredientDetail(detail);
    expect(model.lots.map((lot) => lot.id)).toEqual(["expired", "soon"]);
    expect(model.lots[0]).toMatchObject({ isExpired: true, expiryLabel: "지남", unitPriceText: "0.1234원/ea" });
    expect(model.lots[1]).toMatchObject({ expiryLabel: "D-1", unitPriceText: "미입력" });
  });
  it.each([[-1, "expired"], [0, "urgent"], [1, "urgent"], [2, "soon"], [3, "soon"], [4, "ok"]] as const)("UI-ING-UNIT: 묶음 D-%s에 목록과 같은 %s 배지 톤을 전달한다", (daysLeft, tone) => {
    const model = ingredientDetail({ ...detail, lots: [{ ...detail.lots[0], daysLeft }] });
    expect(model.lots[0].expiryTone).toBe(tone);
    expect(model.lots[0].expiryTone).toBe(ingredientCard({ ...detail, daysLeft }).expiry?.tone);
  });
  it("UI-ING-UNIT: 기한 없는 묶음에는 상태 색을 붙이지 않는다", () => {
    const model = ingredientDetail({ ...detail, lots: [{ ...detail.lots[0], daysLeft: null, expiresAt: null }] });
    expect(model.lots[0]).toMatchObject({ expiryTone: null, expiryLabel: "기한 정보 없음" });
  });
  it("UI-ING-UNIT: 부족 여부와 남은 일수는 현재 날짜로 재계산하지 않는다", () => {
    expect(ingredientCard({ ...detail, daysLeft: 2, isLow: true })).toMatchObject({ statuses: ["expired", "soon", "low"], expiry: { label: "D-2" } });
  });
  it("UI-ING-UNIT: 기한 정보 없음과 기한 추적 제외를 구분한다", () => {
    expect(ingredientCard({ ...detail, daysLeft: null, nearestExpiresAt: null }).noExpiryText).toBe("기한 정보가 없어요");
    expect(ingredientDetail({ ...detail, trackExpiry: false, daysLeft: null, nearestExpiresAt: null, defaultShelfDays: null }).shelfLifeText).toBe("기한 추적 안 함");
  });
});

describe("3.1a URL 연결", () => {
  it("UI-ING-UNIT: 부족 링크·검색·보관 필터를 새로고침 후에도 읽는다", () => {
    const filters = readFilters({ q: " 대파 ", status: "low", storage: "fridge" });
    expect(filters).toEqual({ q: "대파", status: "low", storage: "fridge" });
    expect(readFilters(Object.fromEntries(new URL(catalogHref(filters), "http://localhost").searchParams))).toEqual(filters);
  });
  it("UI-ING-UNIT: 잘못된 URL 조건은 기본값으로 처리한다", () => {
    expect(readFilters({ q: "가".repeat(31), status: "invalid", storage: "invalid" })).toEqual({ q: "", status: "all", storage: "all" });
    expect(readFilters({ status: ["low", "expired"] }).status).toBe("low");
  });
  it("UI-ING-UNIT: 입고 복귀만 허용하고 외부 경로는 목록으로 돌린다", () => {
    expect(registrationReturnTo("/receive")).toBe("/receive");
    expect(registrationReturnTo("https://example.com")).toBe("/ingredients");
    expect(registrationReturnTo("//example.com")).toBe("/ingredients");
  });
});
