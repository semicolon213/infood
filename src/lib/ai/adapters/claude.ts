// Adapter: Anthropic Claude (docs/06_ARCHITECTURE.md 7.1). 11/17부터 기본 공급자는 Gemini(gemini.ts)이고,
// 이 어댑터는 AI_PROVIDER=anthropic일 때만 쓴다. 모델 ID는 이 파일에만 둔다 (AGENTS 규칙 11).
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { type ModelTable, sdkCall, StructuredAdapter, type StructuredCall } from "./structured";

export type { StructuredCall };

const MODELS: ModelTable = {
  recommend: "claude-sonnet-5-5",
  storage: "claude-haiku-5-5",
  receipt: "claude-sonnet-5-5",
};

export class ClaudeAdapter extends StructuredAdapter {
  constructor(call: StructuredCall = sdkCall(anthropic)) {
    super(MODELS, call);
  }
}
