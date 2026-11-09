"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { createClient } from "@/lib/supabase/server";
import { IdInput, MenuInput, type IdOutput } from "@/types/contracts";

// 08_API_SPEC 4장 — WBS 3.2b. 매장은 세션에서 구하고(AGENTS 6), 매장 격리는 RLS가 한 번 더 막는다.

// FR-MENU-01~02: 메뉴와 레시피를 함께 저장. 레시피는 통째로 교체
export async function saveMenu(input: MenuInput): Promise<ActionResult<IdOutput>> {
  const parsed = MenuInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { id, name, price, recipe } = parsed.data;

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  // 레시피 재료가 이 매장의 활성 재료인지 확인 (recipe_items RLS는 재료의 매장까지는 보지 않는다)
  if (recipe.length > 0) {
    const ids = recipe.map((r) => r.ingredientId);
    const { data: found, error } = await db.from("ingredients").select("id").eq("store_id", store.id).eq("is_active", true).in("id", ids);
    if (error) return fail("INTERNAL", "저장하지 못했어요. 잠시 후 다시 시도해 주세요");
    const allowed = new Set(found.map((f) => f.id));
    const bad = ids.findIndex((x) => !allowed.has(x));
    if (bad >= 0) return fail("VALIDATION", "레시피 재료를 다시 확인해 주세요", { [`recipe.${bad}.ingredientId`]: "쓸 수 없는 재료예요" });
  }

  // 1) 메뉴 저장
  let menuId: string;
  if (id) {
    const { data, error } = await db.from("menus").update({ name, price }).eq("id", id).eq("store_id", store.id).select("id").maybeSingle();
    if (error) return menuError(error.code);
    if (!data) return fail("NOT_FOUND", "메뉴를 찾지 못했어요");
    menuId = data.id;
  } else {
    const { data, error } = await db.from("menus").insert({ store_id: store.id, name, price }).select("id").single();
    if (error) return menuError(error.code);
    menuId = data.id;
  }

  // 2) 레시피 교체: 새 목록을 먼저 upsert하고 빠진 재료만 지운다.
  // shortcut: 두 문장이 한 트랜잭션이 아니다. 중간 실패 시 옛 재료가 남을 수는 있어도 레시피가 비지는 않는다. save_menu RPC가 생기면 바꾼다
  const rows = recipe.map((r) => ({ store_id: store.id, menu_id: menuId, ingredient_id: r.ingredientId, qty: r.qty }));
  if (rows.length > 0) {
    const { error } = await db.from("recipe_items").upsert(rows, { onConflict: "menu_id,ingredient_id" });
    if (error) {
      if (!id) await db.from("menus").delete().eq("id", menuId); // 새 메뉴면 반쯤 저장된 메뉴를 지운다
      return fail("INTERNAL", "레시피를 저장하지 못했어요. 다시 시도해 주세요");
    }
  }
  if (id) {
    let del = db.from("recipe_items").delete().eq("menu_id", menuId);
    if (rows.length > 0) del = del.not("ingredient_id", "in", `(${rows.map((r) => r.ingredient_id).join(",")})`);
    const { error } = await del;
    if (error) return fail("INTERNAL", "레시피를 저장하지 못했어요. 다시 시도해 주세요");
  }

  revalidatePath("/menus");
  return ok({ id: menuId });
}

// FR-MENU-01: 판매 기록이 있을 수 있어 삭제하지 않고 비활성화
export async function deactivateMenu(input: IdInput): Promise<ActionResult<IdOutput>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  const { data, error } = await db
    .from("menus")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("store_id", store.id)
    .select("id")
    .maybeSingle();
  if (error) return fail("INTERNAL", "저장하지 못했어요. 잠시 후 다시 시도해 주세요");
  if (!data) return fail("NOT_FOUND", "메뉴를 찾지 못했어요");

  revalidatePath("/menus");
  return ok({ id: data.id });
}

function menuError(code: string): ActionResult<never> {
  // (store_id, name) unique 위반
  if (code === "23505") return fail("CONFLICT", "같은 이름의 메뉴가 있어요", { name: "같은 이름의 메뉴가 있어요" });
  return fail("INTERNAL", "저장하지 못했어요. 잠시 후 다시 시도해 주세요");
}
