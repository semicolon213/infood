import { describe, expect, it } from "vitest";
import { canAddOrderItem, orderFormDraft, parseOrderFilter, readOrderForm, unmappedOrderErrors, updateOrderError, validateOrderForm, type OrderFormDraft } from "./form-input";
import type { ActionError } from "@/lib/result";

const today = "2026-11-17";
const ingredients = [
  { id: "00000000-0000-4000-8000-000000000101", name: "양파", unit: "g" as const },
  { id: "00000000-0000-4000-8000-000000000105", name: "계란", unit: "ea" as const },
];
const draft = (qty = "2500.125"): OrderFormDraft => ({ orderDate: today, memo: "오전 배송", items: [{ key: 0, ingredientId: ingredients[0].id, qty }] });

describe("E2E-07 보조: 발주 폼 입력과 서버 계약", () => {
  it("권장 발주량을 다시 계산하지 않고 기본 단위 그대로 채운다", () => {
    expect(orderFormDraft(today, undefined, { items: [{ ingredientId: ingredients[0].id, name: "양파", unit: "g", availableQty: 100, targetQty: 3000, pendingQty: 500, suggestedQty: 2400 }] }).items[0].qty).toBe("2400");
    const result = validateOrderForm(draft(), ingredients, today);
    expect(result).toMatchObject({ ok: true, data: { items: [{ ingredientId: ingredients[0].id, qty: 2500.125 }] } });
  });

  it.each(["", "1e3", "Infinity", "NaN", "0.0001", "1000001"])("수량 %s를 서버에 보내지 않는다", (qty) => {
    const result = validateOrderForm(draft(qty), ingredients, today);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION", fields: { "items.0.qty": expect.any(String) } } });
  });

  it("0 이하 행을 유지해 서버 오류의 행 번호가 어긋나지 않는다", () => {
    const value = draft("0");
    value.items.push({ key: 1, ingredientId: ingredients[1].id, qty: "30" });
    expect(validateOrderForm(value, ingredients, today)).toMatchObject({ ok: true, data: { items: [{ qty: 0 }, { qty: 30 }] } });
    expect(validateOrderForm(draft("-1"), ingredients, today).ok).toBe(false);
  });

  it("중복 재료와 선택할 수 없는 재료를 거절한다", () => {
    const value = draft();
    value.items.push({ ...value.items[0], key: 1 });
    expect(validateOrderForm(value, ingredients, today)).toMatchObject({ ok: false, error: { fields: { "items.1.ingredientId": "같은 재료가 두 번 있어요" } } });
    expect(validateOrderForm(draft(), [], today)).toMatchObject({ ok: false, error: { fields: { "items.0.ingredientId": expect.any(String) } } });
  });

  it("실제 날짜가 아닌 발주일과 미래 날짜를 거절한다", () => {
    expect(validateOrderForm({ ...draft(), orderDate: "2026-02-30" }, ingredients, today).ok).toBe(false);
    expect(validateOrderForm({ ...draft(), orderDate: "2026-11-18" }, ingredients, today).ok).toBe(false);
  });

  it("행 삭제 뒤 오류 경로를 남은 품목에 맞추고 수정한 오류만 지운다", () => {
    const error: ActionError = { code: "VALIDATION", message: "입력을 확인해 주세요", fields: { "items.0.qty": "삭제할 행", "items.1.qty": "남은 행", memo: "메모 오류" } };
    const next = updateOrderError(error, ["items"], 0);
    expect(next?.fields).toEqual({ "items.0.qty": "남은 행", memo: "메모 오류" });
    expect(updateOrderError(next, ["items.0.qty"])?.fields).toEqual({ memo: "메모 오류" });
  });

  it("날짜 역전·중복 검색값을 거절하고 빈 기간은 전체 조회로 넘긴다", () => {
    expect(parseOrderFilter("2026-11-18", "2026-11-17").ok).toBe(false);
    expect(parseOrderFilter(["2026-11-17", "2026-11-18"], undefined).ok).toBe(false);
    expect(parseOrderFilter("", "")).toEqual({ ok: true, data: { from: undefined, to: undefined } });
  });

  it("선택 불가인 기존 행이 있어도 아직 쓰지 않은 재료를 추가한다", () => {
    const rows = [{ key: 0, ingredientId: "unavailable", qty: "100" }, { key: 1, ingredientId: ingredients[0].id, qty: "100" }];
    expect(canAddOrderItem(rows, ingredients)).toBe(true);
    expect(canAddOrderItem([...rows, { key: 2, ingredientId: "", qty: "" }], ingredients)).toBe(false);
    expect(canAddOrderItem([...rows, { key: 2, ingredientId: ingredients[1].id, qty: "30" }], ingredients)).toBe(false);
  });

  it("state와 다른 화면 입력값을 제출 시 읽고 빈 문자열도 유지한다", () => {
    const data = new FormData();
    data.set("orderDate", "2026-11-01"); data.set("memo", ""); data.set("items.0.qty", "1049");
    expect(readOrderForm(data, draft())).toMatchObject({ orderDate: "2026-11-01", memo: "", items: [{ ingredientId: ingredients[0].id, qty: "1049" }] });
  });

  it("화면에 연결할 수 없는 서버 오류도 사용자에게 전달한다", () => {
    expect(unmappedOrderErrors({ orderDate: "날짜 오류", "items.0.qty": "수량 오류", id: "목록 없음", "items.0": "품목 확인", _: "전체 확인" }, 1)).toEqual(["발주 목록: 목록 없음", "품목 1: 품목 확인", "입력 내용: 전체 확인"]);
  });

  it("잘못된 날짜 필드만 오류로 표시한다", () => {
    expect(parseOrderFilter("broken", "2026-11-17")).toMatchObject({ ok: false, error: { fields: { from: expect.any(String) } } });
    const result = parseOrderFilter("2026-11-17", ["2026-11-17", "2026-11-18"]);
    expect(result.ok ? null : Object.keys(result.error.fields ?? {})).toEqual(["to"]);
  });
});
