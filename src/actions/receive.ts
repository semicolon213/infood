"use server";

import { revalidatePath } from "next/cache";
import { todayKST } from "@/lib/date";
import { fail, ok, rpcErrorCode, validationFail, type ActionResult } from "@/lib/result";
import { getSessionStore } from "@/lib/queries/store";
import { resolveExpiry } from "@/lib/stock/expiry";
import { toBaseQty, unitPriceOf } from "@/lib/stock/unit";
import { createClient } from "@/lib/supabase/server";
import { ReceiveStockInput, type ReceivedLot, type ReceiveStockOutput } from "@/types/contracts";

// 08_API_SPEC 5장 — WBS 3.3b. 계산은 lib/stock이 하고(AGENTS 2), 반영은 receive_stock RPC만 한다(AGENTS 3).
// 순서: 단위 환산(BR-03) → 기본 단위당 단가 → 유통기한 결정(BR-01) → rpc receive_stock (전체가 한 트랜잭션)

const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const NOT_FOUND = "재료를 찾지 못했어요";

// FR-STK-01~04, BR-01, BR-03
export async function receiveStock(input: ReceiveStockInput): Promise<ActionResult<ReceiveStockOutput>> {
  const parsed = ReceiveStockInput.safeParse(input);
  if (!parsed.success) return validationFail(parsed.error);
  const { receivedOn, items } = parsed.data;
  if (receivedOn > todayKST()) {
    return fail("VALIDATION", "입고일을 다시 확인해 주세요", { receivedOn: "미래 날짜는 입력할 수 없어요" });
  }

  const { store } = await getSessionStore();
  if (!store) return fail("UNAUTHORIZED", "다시 로그인해 주세요");
  const db = await createClient();

  // 비활성 재료·다른 매장 재료는 조회되지 않아 NOT_FOUND가 된다
  const ids = [...new Set(items.map((i) => i.ingredientId))];
  const { data: rows, error } = await db
    .from("ingredients")
    .select("id, name, unit, track_expiry, default_shelf_days, ingredient_units(unit_name, factor)")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .in("id", ids);
  if (error) return fail("INTERNAL", SAVE_FAILED);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const missing: Record<string, string> = {};
  const invalid: Record<string, string> = {};
  // 단가는 저장만 하고 응답에는 넣지 않는다 (08_API_SPEC 5장 출력)
  const planned: { lot: Omit<ReceivedLot, "lotId">; unitPrice: number | null }[] = [];
  for (const [i, item] of items.entries()) {
    const ing = byId.get(item.ingredientId);
    if (!ing) {
      missing[`items.${i}.ingredientId`] = NOT_FOUND;
      continue;
    }
    const units = ing.ingredient_units.map((u) => ({ unitName: u.unit_name, factor: Number(u.factor) }));
    const qty = toBaseQty(item.qty, item.unit, ing.unit, units);
    if (!qty.ok) invalid[`items.${i}.${qty.field}`] = qty.message;
    const expiry = resolveExpiry({
      receivedOn,
      expiresAt: item.expiresAt,
      trackExpiry: ing.track_expiry,
      defaultShelfDays: ing.default_shelf_days,
    });
    if (!expiry.ok) invalid[`items.${i}.${expiry.field}`] = expiry.message;
    if (!qty.ok || !expiry.ok) continue;

    planned.push({
      lot: { ingredientId: ing.id, name: ing.name, quantity: qty.value, unit: ing.unit, ...expiry.value },
      unitPrice: unitPriceOf(item.totalPrice, qty.value),
    });
  }
  if (Object.keys(missing).length > 0) return fail("NOT_FOUND", NOT_FOUND, missing);
  if (Object.keys(invalid).length > 0) return fail("VALIDATION", "입력값을 다시 확인해 주세요", invalid);

  const { data: lotIds, error: rpcError } = await db.rpc("receive_stock", {
    p_store_id: store.id,
    p_ref_type: "manual",
    p_ref_id: null as unknown as string, // 수기 입고는 참조 없음 (생성 타입은 not null로 나온다)
    p_lots: planned.map(({ lot, unitPrice }) => ({
      ingredient_id: lot.ingredientId,
      quantity: lot.quantity,
      unit_price: unitPrice,
      received_at: receivedOn,
      expires_at: lot.expiresAt,
      expiry_source: lot.expirySource,
    })),
  });
  // 조회와 RPC 사이에 재료가 비활성화되면 RPC가 NOT_FOUND로 전체를 되돌린다
  if (rpcError) return rpcErrorCode(rpcError) === "NOT_FOUND" ? fail("NOT_FOUND", NOT_FOUND) : fail("INTERNAL", SAVE_FAILED);

  // RPC는 p_lots 순서대로 묶음 ID를 돌려준다
  const lotIdList = lotIds as unknown as string[];
  const lots: ReceivedLot[] = planned.map(({ lot }, i) => ({ lotId: lotIdList[i], ...lot }));

  revalidatePath("/receive");
  revalidatePath("/ingredients");
  for (const id of ids) revalidatePath(`/ingredients/${id}`);
  revalidatePath("/");
  return ok({ lots });
}
