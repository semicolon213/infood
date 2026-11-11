"use server";

import { revalidatePath } from "next/cache";
import { todayKST } from "@/lib/date";
import { fail, ok, rpcErrorCode, validationFail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { planConsumption, type FefoLot, type Plan } from "@/lib/stock/fefo";
import { round3 } from "@/lib/stock/unit";
import { createClient } from "@/lib/supabase/server";
import { RecordDailySalesInput, type RecordDailySalesOutput, type Unit } from "@/types/contracts";

// 08_API_SPEC 6장 — WBS 3.6b. 계획은 lib/stock/fefo가 하고(AGENTS 2), 반영은 record_daily_sales RPC만 한다(AGENTS 3).
// 순서: 레시피 × 수량 합산 → FEFO 입력 조회(기준일 = 판매일) → planConsumption → rpc. STOCK_CONFLICT면 최신 재고로 1회 다시 계획

type Db = Awaited<ReturnType<typeof createClient>>;
type Ingredient = { name: string; unit: Unit };

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

// FR-USE-01, 02, 05, BR-02
export async function recordDailySales(input: RecordDailySalesInput): Promise<ActionResult<RecordDailySalesOutput>> {
  const parsed = RecordDailySalesInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { soldOn, sales } = parsed.data;
  if (soldOn > todayKST()) {
    return fail("VALIDATION", "판매일을 다시 확인해 주세요", { soldOn: "미래 날짜는 입력할 수 없어요" });
  }

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  // 이 매장의 활성 메뉴만. 비활성·다른 매장 메뉴는 조회되지 않아 VALIDATION
  const { data: menus, error } = await db
    .from("menus")
    .select("id, recipe_items(qty, ingredients(id, name, unit))")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .in("id", [...new Set(sales.map((s) => s.menuId))]);
  if (error) return fail("INTERNAL", SAVE_FAILED);
  type RecipeRow = { qty: number; ingredients: { id: string; name: string; unit: Unit } | null };
  const recipes = new Map(menus.map((m) => [m.id, m.recipe_items as unknown as RecipeRow[]]));

  const invalid: Record<string, string> = {};
  for (const [i, s] of sales.entries()) {
    if (!recipes.has(s.menuId)) invalid[`sales.${i}.menuId`] = "판매할 수 없는 메뉴예요";
  }
  if (Object.keys(invalid).length > 0) return fail("VALIDATION", "판매할 수 없는 메뉴가 있어요", invalid);

  // 재료별 필요량 = Σ 1인분 소요량 × 판매 수량 (기본 단위)
  const need = new Map<string, number>();
  const ingredients = new Map<string, Ingredient>();
  for (const s of sales) {
    if (s.qty === 0) continue;
    for (const r of recipes.get(s.menuId)!) {
      if (!r.ingredients) continue;
      ingredients.set(r.ingredients.id, { name: r.ingredients.name, unit: r.ingredients.unit });
      need.set(r.ingredients.id, round3((need.get(r.ingredients.id) ?? 0) + Number(r.qty) * s.qty));
    }
  }
  const needs = [...need].map(([ingredientId, qty]) => ({ ingredientId, qty }));
  const soldMenus = sales.filter((s) => s.qty > 0).map((s) => ({ menu_id: s.menuId, qty: s.qty }));

  // 계획 이후 다른 기기에서 잔량이 바뀌면 RPC가 STOCK_CONFLICT로 전체를 되돌린다. 최신 재고로 1회만 다시 계획
  for (let attempt = 0; ; attempt++) {
    const lots = await loadLots(db, store.id, [...need.keys()], soldOn);
    if (!lots) return fail("INTERNAL", SAVE_FAILED);
    const plan = planConsumption(needs, lots, soldOn);

    const { data: salesDayId, error: rpcError } = await db.rpc("record_daily_sales", {
      p_store_id: store.id,
      p_sold_on: soldOn,
      p_sales: soldMenus,
      p_plan: plan.items.map((p) => ({ lot_id: p.lotId, qty: p.qty })),
      p_shortages: plan.shortages.map((s) => ({ ingredient_id: s.ingredientId, required_qty: s.requiredQty, short_qty: s.shortQty })),
    });
    if (!rpcError) {
      revalidatePath("/sales");
      revalidatePath("/");
      revalidatePath("/ingredients");
      return ok(toOutput(salesDayId, plan, ingredients));
    }

    const code = rpcErrorCode(rpcError);
    if (code === "STOCK_CONFLICT" && attempt === 0) continue;
    if (code === "STOCK_CONFLICT") return fail("STOCK_CONFLICT", "재고가 바뀌었어요. 다시 시도해 주세요");
    if (code === "CONFLICT") return fail("CONFLICT", "이미 마감한 날짜예요", { soldOn: "이미 마감한 날짜예요" }); // FR-USE-06 구현 전
    return fail("INTERNAL", SAVE_FAILED);
  }
}

// FEFO 계획 입력: 잔량 > 0이고 판매일 기준 경과하지 않은 묶음 (07_DB 6장). 순서는 planConsumption이 정한다
async function loadLots(db: Db, storeId: string, ingredientIds: string[], baseDate: string): Promise<FefoLot[] | null> {
  if (ingredientIds.length === 0) return [];
  const { data, error } = await db
    .from("stock_lots")
    .select("id, ingredient_id, remaining, expires_at, received_at")
    .eq("store_id", storeId)
    .in("ingredient_id", ingredientIds)
    .gt("remaining", 0)
    .or(`expires_at.is.null,expires_at.gte.${baseDate}`);
  if (error) return null;
  return data.map((l) => ({
    id: l.id,
    ingredientId: l.ingredient_id,
    remaining: Number(l.remaining),
    expiresAt: l.expires_at,
    receivedAt: l.received_at,
  }));
}

function toOutput(salesDayId: string, plan: Plan, ingredients: Map<string, Ingredient>): RecordDailySalesOutput {
  const consumed = new Map<string, number>();
  for (const p of plan.items) consumed.set(p.ingredientId, round3((consumed.get(p.ingredientId) ?? 0) + p.qty));
  return {
    salesDayId,
    consumed: [...consumed].map(([ingredientId, qty]) => ({ ingredientId, qty })),
    shortages: plan.shortages.map((s) => ({ ...s, name: ingredients.get(s.ingredientId)?.name ?? "", unit: ingredients.get(s.ingredientId)?.unit ?? "g" })),
  };
}
