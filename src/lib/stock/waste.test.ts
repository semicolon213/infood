import { describe, expect, it } from "vitest";
import { weekStart, weeklyWaste } from "./waste";

// 주간 폐기 금액 (확장 FR-DASH-05). DB 연동은 IT-X03 (queries/dashboard.test.ts)
describe("lib/stock/waste", () => {
  it("IT-X03 보조: weekStart — 주 시작은 월요일 (월·화·일요일, 연말 넘김)", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16"); // 월
    expect(weekStart("2026-11-17")).toBe("2026-11-16"); // 화
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // 일
    expect(weekStart("2027-01-01")).toBe("2026-12-28"); // 금, 전년도 월요일
  });

  it("IT-X03 보조: 이번 주·지난주 합계, 이번 주 일별(월~오늘, 폐기 없는 날 0원), 범위 밖·단가 없는 묶음 제외", () => {
    const today = "2026-11-18"; // 수
    const result = weeklyWaste(
      [
        { date: "2026-11-16", qty: 300, unitPrice: 1.5 }, // 이번 주 월 450
        { date: "2026-11-18", qty: 2, unitPrice: 900 }, // 오늘 1800
        { date: "2026-11-18", qty: 100, unitPrice: null }, // 단가 없음 → 0원
        { date: "2026-11-09", qty: 1000, unitPrice: 1.5 }, // 지난주 월 1500
        { date: "2026-11-15", qty: 1, unitPrice: 500 }, // 지난주 일 500
        { date: "2026-11-08", qty: 9999, unitPrice: 1 }, // 지지난주 — 제외
      ],
      today,
    );
    expect(result).toEqual({
      thisWeek: 2250,
      lastWeek: 2000,
      daily: [
        { date: "2026-11-16", amount: 450 },
        { date: "2026-11-17", amount: 0 },
        { date: "2026-11-18", amount: 1800 },
      ],
    });
  });

  it("IT-X03 보조: 일별 원 단위 반올림, 주 합계는 반올림한 일별 금액의 합", () => {
    const result = weeklyWaste(
      [
        { date: "2026-11-16", qty: 1, unitPrice: 0.4 },
        { date: "2026-11-16", qty: 1, unitPrice: 0.4 }, // 같은 날 0.8 → 1
        { date: "2026-11-17", qty: 1, unitPrice: 0.4 }, // 0.4 → 0
      ],
      "2026-11-17",
    );
    expect(result.daily).toEqual([{ date: "2026-11-16", amount: 1 }, { date: "2026-11-17", amount: 0 }]);
    expect(result.thisWeek).toBe(1);
  });

  it("IT-X03 보조: 오늘이 월요일이면 daily는 하루, 폐기가 없으면 모두 0", () => {
    expect(weeklyWaste([], "2026-11-16")).toEqual({ thisWeek: 0, lastWeek: 0, daily: [{ date: "2026-11-16", amount: 0 }] });
  });
});
