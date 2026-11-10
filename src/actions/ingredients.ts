"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, validationFail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { createClient } from "@/lib/supabase/server";
import { IdInput, IngredientInput, type IdOutput } from "@/types/contracts";

// 08_API_SPEC 3장 — WBS 3.1b. 매장은 세션에서 구하고(AGENTS 6), 매장 격리는 RLS가 한 번 더 막는다.

type Db = Awaited<ReturnType<typeof createClient>>;
type Unit = { unitName: string; factor: number };

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

// FR-ING-01, FR-ING-05, BR-03
export async function createIngredient(input: IngredientInput): Promise<ActionResult<IdOutput>> {
  const parsed = IngredientInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  const { data, error } = await db
    .from("ingredients")
    .insert({ store_id: store.id, ...toRow(parsed.data) })
    .select("id")
    .single();
  if (error) return ingredientError(error.code);

  const units = parsed.data.units ?? [];
  if (units.length > 0) {
    const { error: unitError } = await db.from("ingredient_units").insert(unitRows(store.id, data.id, units));
    if (unitError) {
      await db.from("ingredients").delete().eq("id", data.id); // 반쯤 저장된 재료를 지운다
      return fail("INTERNAL", SAVE_FAILED);
    }
  }

  revalidate();
  return ok({ id: data.id });
}

// FR-ING-01. units는 통째로 교체, unit은 묶음이 없을 때만 변경
export async function updateIngredient(input: IngredientInput): Promise<ActionResult<IdOutput>> {
  const parsed = IngredientInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { id } = parsed.data;
  if (!id) return fail("VALIDATION", "수정할 재료를 찾지 못했어요", { id: "필수 항목이에요" });

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  const { data: current, error } = await db
    .from("ingredients")
    .select("id, unit")
    .eq("id", id)
    .eq("store_id", store.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return fail("INTERNAL", SAVE_FAILED);
  if (!current) return fail("NOT_FOUND", "재료를 찾지 못했어요");

  // 기본 단위 변경: 잔량이 0인 과거 묶음도 막는다 (수량·단가·이력이 옛 단위로 남아 있음)
  if (current.unit !== parsed.data.unit) {
    const { count, error: lotError } = await db
      .from("stock_lots")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .eq("ingredient_id", id);
    if (lotError) return fail("INTERNAL", SAVE_FAILED);
    if ((count ?? 0) > 0) {
      return fail("CONFLICT", "재고가 있는 재료는 기본 단위를 바꿀 수 없어요", { unit: "재고가 있어 바꿀 수 없어요" });
    }
  }

  const { error: updateError } = await db.from("ingredients").update(toRow(parsed.data)).eq("id", id).eq("store_id", store.id);
  if (updateError) return ingredientError(updateError.code);

  const unitResult = await replaceUnits(db, store.id, id, parsed.data.units ?? []);
  if (!unitResult) return fail("INTERNAL", "환산 단위를 저장하지 못했어요. 다시 시도해 주세요");

  revalidate(id);
  return ok({ id });
}

// FR-ING-01. 잔량(사용 가능 + 경과)이 남아 있으면 CONFLICT
export async function deactivateIngredient(input: IdInput): Promise<ActionResult<IdOutput>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { id } = parsed.data;

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  const { data: current, error } = await db
    .from("ingredients")
    .select("id")
    .eq("id", id)
    .eq("store_id", store.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return fail("INTERNAL", SAVE_FAILED);
  if (!current) return fail("NOT_FOUND", "재료를 찾지 못했어요");

  const { count, error: lotError } = await db
    .from("stock_lots")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store.id)
    .eq("ingredient_id", id)
    .gt("remaining", 0);
  if (lotError) return fail("INTERNAL", SAVE_FAILED);
  if ((count ?? 0) > 0) return fail("CONFLICT", "남은 재고를 먼저 사용·폐기 처리해 주세요");

  const { error: updateError } = await db.from("ingredients").update({ is_active: false }).eq("id", id).eq("store_id", store.id);
  if (updateError) return fail("INTERNAL", SAVE_FAILED);

  revalidate(id);
  return ok({ id });
}

function toRow(v: IngredientInput) {
  return {
    name: v.name,
    category: v.category || null,
    unit: v.unit,
    min_stock: v.minStock,
    target_stock: v.targetStock ?? null,
    storage: v.storage,
    default_shelf_days: v.defaultShelfDays ?? null,
    track_expiry: v.trackExpiry,
  };
}

function unitRows(storeId: string, ingredientId: string, units: Unit[]) {
  return units.map((u) => ({ store_id: storeId, ingredient_id: ingredientId, unit_name: u.unitName, factor: u.factor }));
}

// 새 목록을 먼저 upsert하고 빠진 단위만 지운다.
// shortcut: 두 문장이 한 트랜잭션이 아니다. 중간 실패 시 옛 단위가 남을 수는 있어도 쓰던 단위가 사라지지는 않는다
async function replaceUnits(db: Db, storeId: string, ingredientId: string, units: Unit[]): Promise<boolean> {
  if (units.length > 0) {
    const { error } = await db.from("ingredient_units").upsert(unitRows(storeId, ingredientId, units), { onConflict: "ingredient_id,unit_name" });
    if (error) return false;
  }
  // 이름은 PostgREST in 목록에 넣으려고 큰따옴표로 감싼다 ("1/2 박스" 같은 이름)
  let del = db.from("ingredient_units").delete().eq("ingredient_id", ingredientId).eq("store_id", storeId);
  if (units.length > 0) del = del.not("unit_name", "in", `(${units.map((u) => `"${u.unitName.replaceAll('"', '\\"')}"`).join(",")})`);
  const { error } = await del;
  return !error;
}

function ingredientError(code: string): ActionResult<never> {
  // (store_id, name) unique 위반 — 비활성 재료의 이름도 포함
  if (code === "23505") return fail("CONFLICT", "같은 이름의 재료가 있어요", { name: "같은 이름의 재료가 있어요" });
  return fail("INTERNAL", SAVE_FAILED);
}

function revalidate(id?: string) {
  revalidatePath("/ingredients");
  if (id) revalidatePath(`/ingredients/${id}`);
  revalidatePath("/receive");
}
