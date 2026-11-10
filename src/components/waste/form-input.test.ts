import { describe, expect, it } from "vitest";
import { blankWaste, selectWasteIngredient, selectWasteLot, updateRecordError, validateHistory, validateUsage, validateWaste, wasteSelection, type StockIngredient, type UsageDraft } from "./form-input";

const ingredientId = "00000000-0000-4000-8000-000000000102";
const lotId = "00000000-0000-4000-8000-000000000202";
const today = "2026-11-09";
const ingredients: StockIngredient[] = [{ id: ingredientId, name: "두부", unit: "ea", availableRemaining: 6, lots: [{ id: lotId, quantity: 10, remaining: 2, unitPrice: 900, receivedAt: "2026-10-28", expiresAt: "2026-11-02", expirySource: "default", daysLeft: -1 }] }];
const usage: UsageDraft = { usedOn: today, items: [{ ingredientId, qty: "0.125", memo: " 직원 식사 " }] };

// 화면·입력 경계 보조 검사. 실제 RPC·DB 통합 IT-USE/E2E-04와 구분한다.
describe("3.7a 사용·폐기 입력", () => {
  it("E2E-04 보조: 기본 단위 수량·메모를 공유 사용 계약에 전달", () => {
    expect(validateUsage(usage, ingredients, today)).toEqual({ ok: true, data: { usedOn: today, items: [{ ingredientId, qty: 0.125, memo: "직원 식사" }] } });
  });
  it("IT-USE-06 보조: 계약에 따라 같은 재료의 여러 사용 행을 허용", () => {
    expect(validateUsage({ ...usage, items: [...usage.items, ...usage.items] }, ingredients, today).ok).toBe(true);
  });
  it("E2E-04 보조: 빈 재료·수량·미래 날짜 오류를 함께 반환", () => {
    const result = validateUsage({ usedOn: "2026-11-10", items: [{ ingredientId: "", qty: "", memo: "" }] }, ingredients, today);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields).toMatchObject({ usedOn: "미래 날짜는 입력할 수 없어요", "items.0.ingredientId": "재료를 선택해 주세요", "items.0.qty": "수량을 입력해 주세요" });
  });
  it("E2E-04 보조: 0·음수·상한 초과·정밀도 초과·지수 표기는 전송하지 않음", () => {
    for (const qty of ["0", "-1", "1000000.001", "0.0004", "0.0015", "1e3", "0x10", "Infinity"]) {
      expect(validateUsage({ ...usage, items: [{ ...usage.items[0], qty }] }, ingredients, today).ok).toBe(false);
    }
    expect(validateUsage({ ...usage, items: [{ ...usage.items[0], qty: "0.001" }] }, ingredients, today).ok).toBe(true);
  });
  it("E2E-04 보조: 존재하지 않는 날짜·재료·빈 품목·긴 메모 검사", () => {
    expect(validateUsage({ ...usage, usedOn: "2026-02-30" }, ingredients, today).ok).toBe(false);
    expect(validateUsage(usage, [], today).ok).toBe(false);
    expect(validateUsage({ ...usage, items: [] }, ingredients, today).ok).toBe(false);
    expect(validateUsage({ ...usage, items: [{ ...usage.items[0], memo: "가".repeat(101) }] }, ingredients, today).ok).toBe(false);
  });
  it("IT-USE-08 보조: 경과 묶음 링크는 정확한 재료·잔량·경과 사유를 미리 채움", () => {
    expect(wasteSelection(ingredients, lotId, today)).toEqual({ ingredientId, lotId, qty: "2", reason: "expired", memo: "" });
    expect(wasteSelection(ingredients, "잘못된 링크", today)).toEqual(blankWaste());
  });
  it("IT-USE-09 보조: 폐기는 선택한 재료의 묶음과 잔량 이내만 허용", () => {
    const draft = wasteSelection(ingredients, lotId, today);
    expect(validateWaste(draft, ingredients)).toEqual({ ok: true, data: { lotId, qty: 2, reason: "expired", memo: "" } });
    for (const change of [{ qty: "2.001" }, { qty: "0" }, { reason: "" }, { ingredientId: "" }, { lotId: "00000000-0000-4000-8000-000000000999" }]) expect(validateWaste({ ...draft, ...change }, ingredients).ok).toBe(false);
  });
  it("E2E-04 보조: 경과하지 않은 묶음은 사유를 사용자가 선택", () => {
    expect(wasteSelection(ingredients, lotId, "2026-11-01").reason).toBe("");
    expect(wasteSelection(ingredients, lotId, "2026-11-01").qty).toBe("");
  });
  it("E2E-04 보조 D-1: 직접 묶음을 고르면 폐기량·사유·메모를 그대로 유지", () => {
    const draft = { ingredientId, lotId: "", qty: "0.125", reason: "spoiled", memo: "포장 파손" };
    expect(selectWasteLot(draft, lotId)).toEqual({ ...draft, lotId });
    expect(selectWasteLot({ ...draft, qty: "" }, lotId).qty).toBe("");
  });
  it("E2E-04 보조 D-5: 재료를 바꿀 때 단위가 달라질 수 있는 수량·묶음만 초기화", () => {
    const draft = { ingredientId, lotId, qty: "2", reason: "spoiled", memo: "메모 유지" };
    expect(selectWasteIngredient(draft, "00000000-0000-4000-8000-000000000101")).toEqual({ ingredientId: "00000000-0000-4000-8000-000000000101", lotId: "", qty: "", reason: "spoiled", memo: "메모 유지" });
  });
  it("E2E-04 보조: 조회는 31일 경계·역전·미래·종류를 검증", () => {
    expect(validateHistory({ from: "2026-10-10", to: today, type: "" }, today).ok).toBe(true);
    for (const filter of [{ from: "2026-10-09", to: today, type: "" }, { from: today, to: "2026-11-08", type: "usage" }, { from: today, to: "2026-11-10", type: "" }, { from: today, to: today, type: "invalid" }]) expect(validateHistory(filter, today).ok).toBe(false);
  });
  it("E2E-04 보조: 행 추가·재료 수정은 다른 행 오류를 유지", () => {
    const error = { code: "VALIDATION" as const, message: "다시 확인", fields: { usedOn: "날짜 오류", items: "품목 오류", "items.0.ingredientId": "재료 오류", "items.0.qty": "수량 오류", "items.1.qty": "다른 행 오류" } };
    expect(updateRecordError(error, ["items"])?.fields).toHaveProperty("items.1.qty", "다른 행 오류");
    expect(updateRecordError(error, ["items.0.ingredientId"])?.fields).toHaveProperty("items.0.qty", "수량 오류");
  });
  it("E2E-04 보조: 행 삭제 시 남은 오류의 인덱스를 이동", () => {
    const error = { code: "VALIDATION" as const, message: "다시 확인", fields: { usedOn: "날짜 오류", "items.0.qty": "삭제 오류", "items.1.qty": "남은 오류" } };
    expect(updateRecordError(error, [], 0)?.fields).toEqual({ usedOn: "날짜 오류", "items.0.qty": "남은 오류" });
  });
});
