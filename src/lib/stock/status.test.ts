import { describe, expect, it } from "vitest";
import { availableQty, expiredQty, expiryStatus, isLow } from "./status";

// docs/10_TEST_PLAN.md 3.4 임박·경과·부족 판정 (BR-05). 오늘 = 2026-11-03
const today = "2026-11-03";

describe("lib/stock/status", () => {
  it("UT-STAT-01: 기한 11/02 → 경과", () => {
    expect(expiryStatus("2026-11-02", today)).toEqual({ status: "expired", daysLeft: -1 });
  });

  it("UT-STAT-02: 기한 11/03 → 임박, D-0", () => {
    expect(expiryStatus("2026-11-03", today)).toEqual({ status: "soon", daysLeft: 0 });
  });

  it("UT-STAT-03: 기한 11/06 → 임박, D-3", () => {
    expect(expiryStatus("2026-11-06", today)).toEqual({ status: "soon", daysLeft: 3 });
  });

  it("UT-STAT-04: 기한 11/07 → 정상 (D-4)", () => {
    expect(expiryStatus("2026-11-07", today)).toEqual({ status: "ok", daysLeft: 4 });
  });

  it("UT-STAT-05: 기한 null → 판정 안 함", () => {
    expect(expiryStatus(null, today)).toEqual({ status: "none", daysLeft: null });
  });

  it("UT-STAT-06: 경과 500 + 11/05 300 + null 200 → 사용 가능 500, 경과 500", () => {
    const lots = [
      { remaining: 500, expiresAt: "2026-11-02" },
      { remaining: 300, expiresAt: "2026-11-05" },
      { remaining: 200, expiresAt: null },
    ];
    expect(availableQty(lots, today)).toBe(500);
    expect(expiredQty(lots, today)).toBe(500);
  });

  it("UT-STAT-07: 최소 재고 0, 사용 가능 0 → 부족 아님", () => {
    expect(isLow(0, 0)).toBe(false);
  });

  it("UT-STAT-08: 최소 1000, 사용 가능 999 → 부족", () => {
    expect(isLow(999, 1000)).toBe(true);
  });

  it("UT-STAT-09: 최소 1000, 사용 가능 1000 → 부족 아님", () => {
    expect(isLow(1000, 1000)).toBe(false);
  });

  it("UT-STAT-10: 최소 1000, 총 1500 중 경과 800 → 사용 가능 700, 부족", () => {
    const lots = [
      { remaining: 800, expiresAt: "2026-11-01" },
      { remaining: 700, expiresAt: "2026-11-10" },
    ];
    const available = availableQty(lots, today);
    expect(available).toBe(700);
    expect(isLow(available, 1000)).toBe(true);
  });

  // 계획서에 없는 보조 케이스
  it("잔량 합의 부동소수 오차를 소수 3자리로 정리", () => {
    expect(availableQty([{ remaining: 0.1, expiresAt: null }, { remaining: 0.2, expiresAt: null }], today)).toBe(0.3);
  });
});
