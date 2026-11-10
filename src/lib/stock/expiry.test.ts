import { describe, expect, it } from "vitest";
import { addDays, daysLeft, resolveExpiry } from "./expiry";

// docs/10_TEST_PLAN.md 3.1 유통기한 결정 (BR-01). 날짜는 모두 인자로 고정한다.
const base = { trackExpiry: true, defaultShelfDays: 3 };

describe("lib/stock/expiry", () => {
  it("UT-EXP-01: 사용자 입력이 있으면 입력값 우선, source=manual", () => {
    const r = resolveExpiry({ ...base, receivedOn: "2026-11-03", expiresAt: "2026-11-05" });
    expect(r).toEqual({ ok: true, value: { expiresAt: "2026-11-05", expirySource: "manual", basis: "직접 입력" } });
  });

  it("UT-EXP-02: 입력 없음 → 입고일 + 기본 보관일수 30, source=default", () => {
    const r = resolveExpiry({ ...base, defaultShelfDays: 30, receivedOn: "2026-10-28" });
    expect(r.ok && r.value).toMatchObject({ expiresAt: "2026-11-27", expirySource: "default" });
  });

  it("UT-EXP-03: 기본 보관일수 1 → 다음 날", () => {
    const r = resolveExpiry({ ...base, defaultShelfDays: 1, receivedOn: "2026-11-03" });
    expect(r.ok && r.value.expiresAt).toBe("2026-11-04");
  });

  it("UT-EXP-04: 입력 기한이 입고일보다 이르면 VALIDATION (UC-04 6a)", () => {
    const r = resolveExpiry({ ...base, receivedOn: "2026-11-03", expiresAt: "2026-11-01" });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION", field: "expiresAt" });
  });

  it("UT-EXP-05: 월 경계 — 10/30 + 3일 = 11/02", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("UT-EXP-06: 기한 추적 제외 재료는 null, source 없음 (입력이 있어도)", () => {
    const r = resolveExpiry({ receivedOn: "2026-11-03", expiresAt: "2026-11-05", trackExpiry: false, defaultShelfDays: null });
    expect(r).toEqual({ ok: true, value: { expiresAt: null, expirySource: null, basis: null } });
  });

  it("UT-EXP-07: 윤년 경계 — 2028-02-27 + 2일 = 2028-02-29", () => {
    expect(addDays("2028-02-27", 2)).toBe("2028-02-29");
  });

  it("UT-EXP-08: 연 경계 — 12/30 + 5일 = 2027-01-04", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });

  it("UT-EXP-09: daysLeft — 오늘 10/28, 기한 10/27 → -1", () => {
    expect(daysLeft("2026-10-27", "2026-10-28")).toBe(-1);
  });

  it("UT-EXP-10: daysLeft — 오늘이 기한이면 0", () => {
    expect(daysLeft("2026-11-03", "2026-11-03")).toBe(0);
  });

  it("UT-EXP-11: 계산 근거 문자열 (FR-STK-02)", () => {
    const r = resolveExpiry({ ...base, defaultShelfDays: 5, receivedOn: "2026-11-03" });
    expect(r.ok && r.value.basis).toBe("입고일 + 기본 보관일수 5일");
  });

  // 계획서에 없는 방어 케이스 (DB 제약상 생길 수 없지만 서버 액션이 안전하게 처리하도록)
  it("기한 추적 재료인데 입력도 기본 보관일수도 없으면 VALIDATION", () => {
    const r = resolveExpiry({ receivedOn: "2026-11-03", trackExpiry: true, defaultShelfDays: null });
    expect(r).toMatchObject({ ok: false, field: "expiresAt" });
  });

  it("입고일과 같은 날 기한은 허용", () => {
    const r = resolveExpiry({ ...base, receivedOn: "2026-11-03", expiresAt: "2026-11-03" });
    expect(r.ok).toBe(true);
  });
});
