import { describe, expect, it } from "vitest";
import { matchReceipt, type ReceiptIngredient } from "./receipt";

const onion: ReceiptIngredient = { id: "00000000-0000-4000-8000-000000000001", name: "양파", unit: "g", units: [] };
const leek: ReceiptIngredient = { id: "00000000-0000-4000-8000-000000000002", name: "대파", unit: "g", units: [{ unitName: "단" }] };
const item = (o: Partial<Parameters<typeof matchReceipt>[0]["items"][number]>) => ({
  rawName: "양파", matchedIngredientId: null, quantity: 1, unitText: "kg", totalPrice: null, confidence: "high" as const, ...o,
});

describe("matchReceipt (FR-RCP-01)", () => {
  it("UT-RCP-01: 다른 매장 재료 ID → null로 바꾸고 이름 일치로만 다시 연결", () => {
    const { lines } = matchReceipt({ vendor: null, date: null, items: [
      item({ rawName: "고수", matchedIngredientId: "99999999-0000-4000-8000-000000000000" }),
      item({ rawName: "양 파", matchedIngredientId: "99999999-0000-4000-8000-000000000000" }),
    ] }, [onion, leek]);
    expect(lines[0]).toMatchObject({ ingredientId: null, unit: null, confidence: "low" });
    expect(lines[1]).toMatchObject({ ingredientId: onion.id, unit: "kg", confidence: "high" });
  });

  it("UT-RCP-02: 환산할 수 없는 단위(박스) → unit null, 확인 필요", () => {
    const { lines } = matchReceipt({ vendor: null, date: null, items: [item({ rawName: "대파", unitText: "박스" })] }, [onion, leek]);
    expect(lines[0]).toMatchObject({ ingredientId: leek.id, unit: null, unitText: "박스", confidence: "low" });
  });

  it("등록한 환산 단위·단위 생략은 그대로 쓴다", () => {
    const { lines } = matchReceipt({ vendor: "청과", date: "2026-11-20", items: [
      item({ rawName: "대파", unitText: "단" }),
      item({ rawName: "양파", matchedIngredientId: onion.id, unitText: null }),
    ] }, [onion, leek]);
    expect(lines.map((l) => [l.ingredientId, l.unit])).toEqual([[leek.id, "단"], [onion.id, "g"]]);
  });
});
