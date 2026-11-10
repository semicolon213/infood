import { describe, expect, it } from "vitest";
import { MenuInput, RecordWasteInput } from "./contracts";

// 08_API_SPEC 1.4·4장 입력 경계 (v0.3.3)
const menu = (price: number, qty: number) => ({ name: "김치찌개", price, recipe: [{ ingredientId: crypto.randomUUID(), qty }] });
const lotId = crypto.randomUUID();

describe("types/contracts 입력 경계", () => {
  it("수량은 소수 셋째 자리까지 (0.001·1.5·0.1+0.2 통과, 0.0004·1.2345 거부)", () => {
    for (const qty of [0.001, 1.5, 0.1 + 0.2, 1_000_000]) expect(RecordWasteInput.safeParse({ lotId, qty, reason: "other" }).success).toBe(true);
    for (const qty of [0.0004, 0.0015, 1.2345]) {
      expect(RecordWasteInput.safeParse({ lotId, qty, reason: "other" }).error?.issues[0]).toMatchObject({ path: ["qty"], message: "수량은 소수 셋째 자리까지 입력해 주세요" });
    }
  });

  it("판매가는 0 이상 2,147,483,647 이하 정수 (DB int)", () => {
    expect(MenuInput.safeParse(menu(2_147_483_647, 100)).success).toBe(true);
    expect(MenuInput.safeParse(menu(3_000_000_000, 100)).error?.issues[0]).toMatchObject({ path: ["price"], message: "판매가는 2,147,483,647원 이하로 입력해 주세요" });
    expect(MenuInput.safeParse(menu(-1, 100)).success).toBe(false);
    expect(MenuInput.safeParse(menu(7000, 0.0004)).error?.issues[0]).toMatchObject({ path: ["recipe", 0, "qty"] });
  });
});
