import "server-only";
import type { AiRequest } from "../client";
import { ReceiptParse } from "../schemas";

// 확장 FR-RCP-01 (WBS 4.7). 재료 연결·단위 환산은 서버가 lib/ai/receipt.ts로 다시 확인한다
const SYSTEM = `너는 한국 식당의 거래명세서(납품서) 사진을 읽는 도우미다.
사진에서 품목마다 품목명, 수량, 단위, 금액(그 줄의 합계, 원)을 읽는다.
- rawName: 명세서에 적힌 품목명 그대로
- matchedIngredientId: 아래 매장 재료 목록에서 같은 재료라고 확실할 때만 그 id, 아니면 null
- unitText: 적힌 단위 원문 (kg, g, L, ml, 개, 단, 박스 등). 없으면 null
- totalPrice: 그 줄의 금액(원, 정수). 없으면 null
- confidence: 글자가 흐리거나 추측했으면 low
- vendor: 거래처 이름, date: 거래 날짜(YYYY-MM-DD). 없으면 null
합계·부가세·배송비 줄은 품목이 아니므로 빼라. 명세서가 아니거나 읽을 수 없으면 items를 빈 배열로 답한다.`;

export function buildReceiptRequest(args: {
  image: string; // base64
  mediaType: string;
  ingredients: readonly { id: string; name: string; unit: string }[];
}): AiRequest<ReceiptParse> {
  const list = args.ingredients.map((i) => `${i.id}\t${i.name}\t${i.unit}`).join("\n");
  return {
    task: "receipt",
    schema: ReceiptParse,
    system: SYSTEM,
    messages: [{ role: "user", content: `매장 재료 목록 (id, 이름, 기본 단위):\n${list || "(없음)"}` }],
    image: { data: args.image, mediaType: args.mediaType },
  };
}
