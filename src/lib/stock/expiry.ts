import type { ExpirySource, ISODate } from "@/types/contracts";
import { invalid, type Calc } from "./types";

// 유통기한 결정 (SRS BR-01, 06_ARCHITECTURE 10장)
// - 날짜는 "YYYY-MM-DD" 문자열. 시간대 영향을 받지 않도록 UTC 자정으로만 계산한다.
// - 기간은 일 단위만 쓴다 (월·년 계산 없음).
// - 오늘 날짜는 인자로 받는다 (서버는 todayKST()를 넘김).

const DAY_MS = 86_400_000;

function toUtcMs(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// 날짜 + n일
export function addDays(date: ISODate, days: number): ISODate {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

// 남은 일수. 오늘이 기한이면 0, 경과하면 음수 (D-day 표시·판정에 사용)
export function daysLeft(expiresAt: ISODate, today: ISODate): number {
  return Math.round((toUtcMs(expiresAt) - toUtcMs(today)) / DAY_MS);
}

export type ExpiryInput = {
  receivedOn: ISODate;
  expiresAt?: ISODate | null; // 사용자가 입력한 유통기한
  trackExpiry: boolean;
  defaultShelfDays: number | null;
};

export type Expiry = {
  expiresAt: ISODate | null;
  expirySource: ExpirySource | null;
  basis: string | null; // 계산 근거 문구 (FR-STK-02)
};

// BR-01: ① 입력값(manual) → ② 입고일 + 기본 보관일수(default) → 기한 추적 제외 재료는 null
export function resolveExpiry(input: ExpiryInput): Calc<Expiry> {
  if (!input.trackExpiry) {
    // 소금·설탕 등: 입력이 있어도 기한을 두지 않는다
    return { ok: true, value: { expiresAt: null, expirySource: null, basis: null } };
  }

  if (input.expiresAt) {
    if (input.expiresAt < input.receivedOn) {
      return invalid("expiresAt", "유통기한이 입고일보다 빨라요"); // UC-04 6a
    }
    return { ok: true, value: { expiresAt: input.expiresAt, expirySource: "manual", basis: "직접 입력" } };
  }

  if (input.defaultShelfDays === null) {
    return invalid("expiresAt", "유통기한을 입력해 주세요");
  }
  return {
    ok: true,
    value: {
      expiresAt: addDays(input.receivedOn, input.defaultShelfDays),
      expirySource: "default",
      basis: `입고일 + 기본 보관일수 ${input.defaultShelfDays}일`,
    },
  };
}
