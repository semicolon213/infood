import { describe, expect, it } from "vitest";
import { shortageText } from "./sales-form";

// 09_DESIGN 7장 부족 문구 (FR-USE-05)
describe("shortageText", () => {
  const s = { ingredientId: "x", requiredQty: 0 };
  it("받침 없으면 가, 있으면 이, 천 단위 구분", () => {
    expect(shortageText({ ...s, name: "양파", unit: "g", shortQty: 300 })).toBe("양파가 300g 부족했어요");
    expect(shortageText({ ...s, name: "대파 뿌리", unit: "g", shortQty: 1500 })).toBe("대파 뿌리가 1,500g 부족했어요");
    expect(shortageText({ ...s, name: "계란", unit: "ea", shortQty: 2 })).toBe("계란이 2ea 부족했어요");
    expect(shortageText({ ...s, name: "돼지고기(앞다리)", unit: "g", shortQty: 1 })).toBe("돼지고기(앞다리)이(가) 1g 부족했어요");
  });
});
