import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/date";
import { loadFefoLots } from "@/lib/queries/stock-lots";
import { fail, ok, rpcErrorCode, validationFail, type ActionResult } from "@/lib/result";
import { planConsumption, salesNeeds, type RecipeLine } from "@/lib/stock/fefo";
import { RecordSaleOrderInput, type RecordSaleOrderOutput, type Unit } from "@/types/contracts";
import type { Database } from "@/types/database";

// 주문별 판매 공통부 (WBS 4.8). 사이트 서버 액션과 포스 Route Handler가 매장을 각자 인증한 뒤 이 함수를 부른다.
// 계획은 lib/stock/fefo, 반영은 record_sale_order RPC만 한다 (AGENTS 2·3). 흐름은 recordDailySales와 같다.
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

export async function recordSaleOrderFor(
  db: SupabaseClient<Database>,
  storeId: string,
  source: "web" | "pos",
  input: unknown,
): Promise<ActionResult<RecordSaleOrderOutput>> {
  const parsed = RecordSaleOrderInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const today = todayKST();
  const { soldOn = today, externalId, items } = parsed.data;
  if (soldOn > today) return fail("VALIDATION", "판매일을 다시 확인해 주세요", { soldOn: "미래 날짜는 입력할 수 없어요" });

  // 같은 포스 주문번호를 다시 보내면(네트워크 재시도 등) 재고를 다시 줄이지 않는다
  if (externalId) {
    const { data: prev } = await db.from("sale_orders").select("id").eq("store_id", storeId).eq("source", source).eq("external_id", externalId).maybeSingle();
    if (prev) return ok({ orderId: prev.id, duplicate: true, shortages: [] });
  }

  const { data: menus, error } = await db
    .from("menus")
    .select("id, recipe_items(qty, ingredients(id, name, unit))")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .in("id", [...new Set(items.map((s) => s.menuId))]);
  if (error) return fail("INTERNAL", SAVE_FAILED);
  type RecipeRow = { qty: number; ingredients: { id: string; name: string; unit: Unit } | null };
  const recipes = new Map(menus.map((m) => [m.id, m.recipe_items as unknown as RecipeRow[]]));

  const invalid: Record<string, string> = {};
  for (const [i, s] of items.entries()) if (!recipes.has(s.menuId)) invalid[`items.${i}.menuId`] = "판매할 수 없는 메뉴예요";
  if (Object.keys(invalid).length > 0) return fail("VALIDATION", "판매할 수 없는 메뉴가 있어요", invalid);

  // 재료별 필요량 = Σ 1인분 소요량 × 수량 (lib/stock, 판매 마감과 같은 계산 #86)
  const names = new Map<string, { name: string; unit: Unit }>();
  const lines = new Map<string, RecipeLine[]>();
  for (const [menuId, rows] of recipes) {
    const list: RecipeLine[] = [];
    for (const r of rows) {
      if (!r.ingredients) continue;
      names.set(r.ingredients.id, { name: r.ingredients.name, unit: r.ingredients.unit });
      list.push({ ingredientId: r.ingredients.id, qty: Number(r.qty) });
    }
    lines.set(menuId, list);
  }
  const needs = salesNeeds(items, lines);
  const needIds = needs.map((n) => n.ingredientId);

  // 계획 뒤 다른 기기에서 잔량이 바뀌면 RPC가 STOCK_CONFLICT로 되돌린다. 최신 재고로 1회만 다시 계획 (AGENTS 16)
  for (let attempt = 0; ; attempt++) {
    const lots = await loadFefoLots(db, storeId, needIds, soldOn);
    if (!lots) return fail("INTERNAL", SAVE_FAILED);
    const plan = planConsumption(needs, lots, soldOn);

    const { data: orderId, error: rpcError } = await db.rpc("record_sale_order", {
      p_store_id: storeId,
      p_sold_on: soldOn,
      p_source: source,
      p_external_id: (externalId ?? null) as unknown as string, // 주문번호가 없으면 null (생성 타입은 not null로 나온다)
      p_items: items.map((s) => ({ menu_id: s.menuId, qty: s.qty })),
      p_plan: plan.items.map((p) => ({ lot_id: p.lotId, qty: p.qty })),
      p_shortages: plan.shortages.map((s) => ({ ingredient_id: s.ingredientId, required_qty: s.requiredQty, short_qty: s.shortQty })),
    });
    if (!rpcError) {
      return ok({
        orderId,
        duplicate: false,
        shortages: plan.shortages.map((s) => ({ ...s, name: names.get(s.ingredientId)?.name ?? "", unit: names.get(s.ingredientId)?.unit ?? "g" })),
      });
    }
    const code = rpcErrorCode(rpcError);
    if (code === "STOCK_CONFLICT" && attempt === 0) continue;
    if (code === "STOCK_CONFLICT") return fail("STOCK_CONFLICT", "재고가 바뀌었어요. 다시 시도해 주세요");
    if (code === "CONFLICT") {
      // 마감한 날짜이거나, 같은 주문번호가 동시에 들어온 경우
      return externalId
        ? fail("CONFLICT", "이미 받은 주문이거나 마감한 날짜예요")
        : fail("CONFLICT", "이미 판매 마감한 날짜예요", { soldOn: "이미 마감한 날짜예요" });
    }
    return fail("INTERNAL", SAVE_FAILED);
  }
}

// 주문 취소 (WBS 4.8a): 줄인 재고를 같은 묶음에 되돌린다. 사이트는 id, 포스는 주문번호(externalId)로 찾는다
export async function cancelSaleOrderFor(
  db: SupabaseClient<Database>,
  storeId: string,
  by: { id: string } | { source: "pos"; externalId: string },
): Promise<ActionResult<{ orderId: string }>> {
  let q = db.from("sale_orders").select("id").eq("store_id", storeId);
  q = "id" in by ? q.eq("id", by.id) : q.eq("source", by.source).eq("external_id", by.externalId);
  const { data: order, error } = await q.maybeSingle();
  if (error) return fail("INTERNAL", SAVE_FAILED);
  if (!order) return fail("NOT_FOUND", "주문을 찾지 못했어요");

  const { error: rpcError } = await db.rpc("cancel_sale_order", { p_store_id: storeId, p_order_id: order.id });
  if (!rpcError) return ok({ orderId: order.id });
  const code = rpcErrorCode(rpcError);
  if (code === "CONFLICT") return fail("CONFLICT", "이미 취소한 주문이에요");
  if (code === "NOT_FOUND") return fail("NOT_FOUND", "주문을 찾지 못했어요");
  return fail("INTERNAL", SAVE_FAILED);
}
