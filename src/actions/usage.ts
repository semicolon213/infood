"use server";

import { revalidatePath } from "next/cache";
import { todayKST } from "@/lib/date";
import { fail, ok, rpcErrorCode, validationFail, type ActionResult } from "@/lib/result";
import { STUB_INGREDIENTS } from "@/lib/queries/stub-data";
import { getSessionStore } from "@/lib/queries/store";
import { loadFefoLots } from "@/lib/queries/stock-lots";
import { planConsumption } from "@/lib/stock/fefo";
import { round3, toBaseQty } from "@/lib/stock/unit";
import { createClient } from "@/lib/supabase/server";
import {
  AdjustLotInput,
  RecordUsageInput,
  RecordWasteInput,
  type AdjustLotOutput,
  type RecordUsageOutput,
  type RecordWasteOutput,
  type Unit,
} from "@/types/contracts";

// 08_API_SPEC 7장 — WBS 3.7b (adjustLot은 확장 4.5, 아직 stub).
// 계획은 lib/stock/fefo가 하고(AGENTS 2), 반영은 record_usage·record_waste RPC만 한다(AGENTS 3).

type Db = Awaited<ReturnType<typeof createClient>>;

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const NOT_FOUND = "재료를 찾지 못했어요";
const LOT_NOT_FOUND = "재고 묶음을 찾지 못했어요";
const STOCK_CHANGED = "재고가 바뀌었어요. 다시 시도해 주세요";

// FR-USE-03, 05, BR-02. 단위 환산 → 같은 재료 합침 → FEFO 계획(기준일 = 사용일) → rpc record_usage. STOCK_CONFLICT면 1회 다시 계획
export async function recordUsage(input: RecordUsageInput): Promise<ActionResult<RecordUsageOutput>> {
  const parsed = RecordUsageInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { usedOn, items } = parsed.data;
  if (usedOn > todayKST()) {
    return fail("VALIDATION", "사용일을 다시 확인해 주세요", { usedOn: "미래 날짜는 입력할 수 없어요" });
  }

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  // 비활성·다른 매장 재료는 조회되지 않아 NOT_FOUND
  const { data: rows, error } = await db
    .from("ingredients")
    .select("id, name, unit, ingredient_units(unit_name, factor)")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .in("id", [...new Set(items.map((i) => i.ingredientId))]);
  if (error) return fail("INTERNAL", SAVE_FAILED);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const missing: Record<string, string> = {};
  const invalid: Record<string, string> = {};
  const merged = new Map<string, { qty: number; memos: string[] }>();
  for (const [i, item] of items.entries()) {
    const ing = byId.get(item.ingredientId);
    if (!ing) {
      missing[`items.${i}.ingredientId`] = NOT_FOUND;
      continue;
    }
    const units = ing.ingredient_units.map((u) => ({ unitName: u.unit_name, factor: Number(u.factor) }));
    const qty = toBaseQty(item.qty, item.unit ?? ing.unit, ing.unit, units);
    if (!qty.ok) invalid[`items.${i}.${qty.field}`] = qty.message;
    // 소수 3자리 반올림으로 0이 되면 DB의 qty > 0에 걸린다
    else if (qty.value <= 0) invalid[`items.${i}.qty`] = "수량을 다시 확인해 주세요";
    else {
      const m = merged.get(ing.id) ?? { qty: 0, memos: [] };
      m.qty = round3(m.qty + qty.value);
      if (item.memo && !m.memos.includes(item.memo)) m.memos.push(item.memo);
      merged.set(ing.id, m);
    }
  }
  if (Object.keys(missing).length > 0) return fail("NOT_FOUND", NOT_FOUND, missing);
  if (Object.keys(invalid).length > 0) return fail("VALIDATION", "입력값을 다시 확인해 주세요", invalid);

  // record_usage는 재료 중복 없이 ingredient_id 오름차순으로 받는다 (07_DB 5.4)
  const ingredientIds = [...merged.keys()].sort();
  const needs = ingredientIds.map((id) => ({ ingredientId: id, qty: merged.get(id)!.qty }));

  for (let attempt = 0; ; attempt++) {
    const lots = await loadFefoLots(db, store.id, ingredientIds, usedOn);
    if (!lots) return fail("INTERNAL", SAVE_FAILED);
    const plan = planConsumption(needs, lots, usedOn);
    const shortOf = new Map(plan.shortages.map((s) => [s.ingredientId, s.shortQty]));

    const { data: recordIds, error: rpcError } = await db.rpc("record_usage", {
      p_store_id: store.id,
      p_used_on: usedOn,
      p_items: needs.map((n) => ({
        ingredient_id: n.ingredientId,
        qty: n.qty,
        short_qty: shortOf.get(n.ingredientId) ?? 0,
        memo: merged.get(n.ingredientId)!.memos.join(" / ").slice(0, 100) || null,
      })),
      p_plan: plan.items.map((p) => ({ ingredient_id: p.ingredientId, lot_id: p.lotId, qty: p.qty })),
    });
    if (!rpcError) {
      revalidate(ingredientIds);
      return ok({
        recordIds: recordIds as unknown as string[],
        shortages: plan.shortages.map((s) => ({ ...s, name: byId.get(s.ingredientId)!.name, unit: byId.get(s.ingredientId)!.unit as Unit })),
      });
    }

    const code = rpcErrorCode(rpcError);
    if (code === "STOCK_CONFLICT" && attempt === 0) continue;
    if (code === "STOCK_CONFLICT") return fail("STOCK_CONFLICT", STOCK_CHANGED);
    return fail("INTERNAL", SAVE_FAILED);
  }
}

// FR-USE-04. 경과 묶음도 폐기 가능.
// 폐기량 > 현재 잔량(입력 실수)은 RPC 전에 VALIDATION (IT-USE-09).
// 확인 이후 다른 기기에서 잔량이 줄면 RPC가 STOCK_CONFLICT를 돌려준다 (DB-13)
export async function recordWaste(input: RecordWasteInput): Promise<ActionResult<RecordWasteOutput>> {
  const parsed = RecordWasteInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { lotId, qty, reason, memo } = parsed.data;

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  const lot = await lotOf(db, store.id, lotId);
  if (lot === undefined) return fail("INTERNAL", SAVE_FAILED);
  if (!lot) return fail("NOT_FOUND", LOT_NOT_FOUND);
  if (qty > lot.remaining) {
    return fail("VALIDATION", "폐기량을 다시 확인해 주세요", { qty: `남은 양(${lot.remaining})보다 많이 폐기할 수 없어요` });
  }

  const { error } = await db.rpc("record_waste", { p_store_id: store.id, p_lot_id: lotId, p_qty: qty, p_reason: reason, p_memo: (memo ?? null) as unknown as string }); // 메모가 없으면 null (사용 기록과 같게, PR #42 리뷰)
  if (error) {
    const code = rpcErrorCode(error);
    if (code === "STOCK_CONFLICT") return fail("STOCK_CONFLICT", STOCK_CHANGED);
    if (code === "NOT_FOUND") return fail("NOT_FOUND", LOT_NOT_FOUND);
    return fail("INTERNAL", SAVE_FAILED);
  }

  const after = await lotOf(db, store.id, lotId);
  revalidate([lot.ingredientId]);
  return ok({ lotId, remaining: after ? after.remaining : round3(lot.remaining - qty) });
}

// 확장 FR-USE-07: 실사 보정 (WBS 4.5 전까지 stub)
const findLot = (lotId: string) => STUB_INGREDIENTS.flatMap((i) => i.lots).find((l) => l.id === lotId);
export async function adjustLot(input: AdjustLotInput): Promise<ActionResult<AdjustLotOutput>> {
  const parsed = AdjustLotInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const lot = findLot(parsed.data.lotId);
  if (!lot) return fail("NOT_FOUND", LOT_NOT_FOUND);
  if (parsed.data.newRemaining > lot.quantity) {
    return fail("VALIDATION", "입고 수량보다 많을 수 없어요", { newRemaining: "입고 수량보다 많을 수 없어요" });
  }
  return ok({ lotId: lot.id, delta: parsed.data.newRemaining - lot.remaining });
}

// 이 매장의 묶음. 없으면 null, 조회 실패면 undefined
async function lotOf(db: Db, storeId: string, lotId: string) {
  const { data, error } = await db.from("stock_lots").select("ingredient_id, remaining").eq("id", lotId).eq("store_id", storeId).maybeSingle();
  if (error) return undefined;
  return data && { ingredientId: data.ingredient_id, remaining: Number(data.remaining) };
}

function revalidate(ingredientIds: string[]) {
  revalidatePath("/waste");
  revalidatePath("/");
  revalidatePath("/ingredients");
  for (const id of ingredientIds) revalidatePath(`/ingredients/${id}`);
}
