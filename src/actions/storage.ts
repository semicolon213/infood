"use server";

import { z } from "zod";
import { getAiClient } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { buildStorageRequest } from "@/lib/ai/prompts/storage";
import type { StorageSuggestion } from "@/lib/ai/schemas";
import { todayKST } from "@/lib/date";
import { getSessionStore } from "@/lib/queries/store";
import { fail, ok, rpcErrorCode, validationFail, type ActionResult } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

// 확장 FR-ING-04 (WBS 4.6): 재료 이름 → AI 보관 방식·보관일수 추천. 저장하지 않고 폼에 채우기만 한다 (BR-04)
const Input = z.object({ name: z.string().trim().min(1, "재료 이름을 먼저 입력해 주세요").max(30) });

export async function suggestStorage(input: { name: string }): Promise<ActionResult<StorageSuggestion>> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");

  // 추천 API와 같은 일일 한도를 쓴다 (AI 비용)
  const db = await createClient();
  const usage = await db.rpc("increment_ai_usage", {
    p_store_id: store.id,
    p_today: todayKST(),
    p_limit: Number(process.env.AI_DAILY_LIMIT) || 100,
  });
  if (usage.error) {
    return rpcErrorCode(usage.error) === "RATE_LIMITED"
      ? fail("RATE_LIMITED", "오늘 AI 사용 횟수를 다 썼어요. 직접 입력해 주세요")
      : fail("INTERNAL", "추천을 받지 못했어요. 직접 입력해 주세요");
  }

  try {
    return ok(await getAiClient().generate(buildStorageRequest(parsed.data.name)));
  } catch (error) {
    const code = error instanceof AiError ? error.code : "AI_FAILED";
    return fail(code, "추천을 받지 못했어요. 직접 입력해 주세요");
  }
}
