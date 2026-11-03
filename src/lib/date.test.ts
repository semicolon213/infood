import { describe, expect, it } from "vitest";
import { todayKST } from "./date";

describe("todayKST", () => {
  it("UTC 15:00 이후는 KST 다음 날", () => {
    expect(todayKST(new Date("2026-11-02T15:00:00Z"))).toBe("2026-11-03");
    expect(todayKST(new Date("2026-11-02T14:59:59Z"))).toBe("2026-11-02");
  });
});
