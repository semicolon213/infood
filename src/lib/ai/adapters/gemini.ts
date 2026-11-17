// Adapter: Google Gemini (docs/06_ARCHITECTURE.md 7.1). 기본 공급자 (11/17, 비용 때문에 Claude에서 교체).
// Google AI Studio 무료 등급으로 쓰려고 하루 요청 한도가 넉넉한 Flash-Lite를 고른다. 무료 등급 한도는 AI Studio의 프로젝트별 표를 따른다.
// 모델 ID는 이 파일에만 둔다 (AGENTS 규칙 11). 키는 GOOGLE_GENERATIVE_AI_API_KEY (서버 환경변수).
import "server-only";
import { google } from "@ai-sdk/google";
import { type ModelTable, sdkCall, StructuredAdapter, type StructuredCall } from "./structured";

const MODELS: ModelTable = {
  recommend: "gemini-3.5-flash-lite",
  storage: "gemini-3.5-flash-lite",
  receipt: "gemini-3.5-flash-lite",
};

export class GeminiAdapter extends StructuredAdapter {
  constructor(call: StructuredCall = sdkCall(google)) {
    super(MODELS, call);
  }
}
