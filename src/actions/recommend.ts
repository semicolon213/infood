"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { createClient } from "@/lib/supabase/server";
import { AcceptRecommendationInput, type AcceptRecommendationOutput, type RecommendationView } from "@/types/contracts";

// 08_API_SPEC 9장 — WBS 4.2b. 추천 생성은 Route Handler POST /api/recommendations

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

// FR-REC-07, BR-04: 사용자가 검토·수정한 값으로 특선 메뉴 등록. AI 값은 그대로 쓰지 않고 입력값만 저장한다
export async function acceptRecommendation(
  input: AcceptRecommendationInput,
): Promise<ActionResult<AcceptRecommendationOutput>> {
  const parsed = AcceptRecommendationInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { recommendationId, ideaIndex, name, price, ingredients } = parsed.data;

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  // 1) 이 매장의 추천과 아이디어가 있는지
  const { data: rec, error: recError } = await db
    .from("recommendations")
    .select("id, result_json")
    .eq("id", recommendationId)
    .eq("store_id", store.id)
    .maybeSingle();
  if (recError) return fail("INTERNAL", SAVE_FAILED);
  const ideas = (rec?.result_json as unknown as Pick<RecommendationView, "newIdeas"> | undefined)?.newIdeas ?? [];
  if (!rec || !ideas.some((i) => i.index === ideaIndex)) return fail("NOT_FOUND", "추천 결과를 찾지 못했어요");

  // 2) 재료가 모두 이 매장의 활성 재료인지 — 등록되지 않은 재료가 남으면 저장하지 않는다 (IT-REC-09)
  const ids = ingredients.map((r) => r.ingredientId);
  const { data: found, error: ingError } = await db.from("ingredients").select("id").eq("store_id", store.id).eq("is_active", true).in("id", ids);
  if (ingError) return fail("INTERNAL", SAVE_FAILED);
  const allowed = new Set(found.map((f) => f.id));
  const bad = ids.findIndex((x) => !allowed.has(x));
  if (bad >= 0) {
    return fail("VALIDATION", "연결되지 않은 재료가 있어요. 매장 재료를 고르거나 빼 주세요", { [`ingredients.${bad}.ingredientId`]: "매장 재료를 골라 주세요" });
  }

  // 3) 특선 메뉴 + 레시피
  const { data: menu, error: menuError } = await db
    .from("menus")
    .insert({ store_id: store.id, name, price, is_special: true })
    .select("id")
    .single();
  if (menuError) {
    if (menuError.code === "23505") return fail("CONFLICT", "같은 이름의 메뉴가 있어요", { name: "같은 이름의 메뉴가 있어요" });
    return fail("INTERNAL", SAVE_FAILED);
  }
  const rows = ingredients.map((r) => ({ store_id: store.id, menu_id: menu.id, ingredient_id: r.ingredientId, qty: r.qty }));
  const { error: recipeError } = await db.from("recipe_items").insert(rows);
  if (recipeError) {
    await db.from("menus").delete().eq("id", menu.id); // 반쯤 저장된 메뉴를 지운다
    return fail("INTERNAL", "레시피를 저장하지 못했어요. 다시 시도해 주세요");
  }

  // 4) 추천에 등록 여부 표시 (FR-REC-08). 실패해도 메뉴는 이미 저장됐으므로 성공으로 돌려준다
  const { error: acceptError } = await db.from("recommendations").update({ accepted: true }).eq("id", rec.id).eq("store_id", store.id);
  if (acceptError) console.error("[acceptRecommendation] accepted 표시 실패", rec.id, acceptError.message);

  revalidatePath("/menus");
  return ok({ menuId: menu.id });
}
