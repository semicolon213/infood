import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withImage } from "./structured";

describe("withImage (명세서 인식 4.7)", () => {
  const req = { task: "receipt" as const, schema: z.object({}), system: "", messages: [{ role: "user" as const, content: "재료 목록" }] };
  it("이미지가 없으면 메시지를 그대로 쓴다", () => {
    expect(withImage(req)).toBe(req.messages);
  });
  it("이미지를 마지막 사용자 메시지에 붙인다", () => {
    expect(withImage({ ...req, image: { data: "AAA", mediaType: "image/jpeg" } })).toEqual([
      { role: "user", content: [{ type: "text", text: "재료 목록" }, { type: "image", image: "AAA", mediaType: "image/jpeg" }] },
    ]);
  });
});
