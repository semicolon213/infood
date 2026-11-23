import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/stock/expiry";
import { planConsumption } from "@/lib/stock/fefo";
import { availableQty, expiryStatus } from "@/lib/stock/status";
import type { Database } from "@/types/database";
import type { Unit } from "@/types/contracts";

export const INGREDIENTS: { name: string; unit: Unit }[] = [
  ...["양파", "대파", "감자", "당근", "애호박", "배추", "양배추", "버섯", "시금치", "오이", "돼지고기", "소고기", "닭고기"].map((name) => ({ name, unit: "g" as const })),
  { name: "두부", unit: "ea" }, { name: "계란", unit: "ea" }, { name: "우유", unit: "ml" },
  { name: "치즈", unit: "g" }, { name: "버터", unit: "g" }, { name: "크림", unit: "ml" },
  ...["오징어", "새우", "고등어", "쌀", "밀가루", "소금", "설탕"].map((name) => ({ name, unit: "g" as const })),
  { name: "간장", unit: "ml" }, { name: "고추장", unit: "g" }, { name: "된장", unit: "g" }, { name: "식용유", unit: "ml" },
];
export const MENUS: { name: string; recipe: [number, number][] }[] = [
  { name: "제육볶음", recipe: [[10, 150], [0, 60], [1, 10], [27, 20]] },
  { name: "불고기", recipe: [[11, 150], [0, 80], [26, 10], [25, 5]] },
  { name: "닭갈비", recipe: [[12, 150], [6, 100], [2, 100], [27, 20]] },
  { name: "된장찌개", recipe: [[13, 1], [4, 50], [28, 20]] },
  { name: "계란말이", recipe: [[14, 2], [3, 20], [29, 5]] },
  { name: "우유계란찜", recipe: [[14, 2], [15, 100], [24, 1]] },
  { name: "버섯크림리조또", recipe: [[7, 60], [18, 100], [22, 100]] },
  { name: "치즈감자전", recipe: [[16, 20], [2, 150], [23, 30], [17, 10]] },
  { name: "시금치무침", recipe: [[8, 100], [26, 5]] },
  { name: "오이무침", recipe: [[9, 100], [25, 5], [27, 10]] },
  { name: "배추양배추볶음", recipe: [[5, 100], [6, 100], [29, 5]] },
  { name: "오징어볶음", recipe: [[19, 150], [0, 50], [27, 20]] },
  { name: "새우볶음밥", recipe: [[20, 100], [22, 150], [14, 1]] },
  { name: "고등어구이", recipe: [[21, 200], [24, 2]] },
  { name: "양파대파버터볶음", recipe: [[0, 100], [1, 30], [17, 10]] },
];

export function localDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("평가는 격리된 로컬 Supabase에서만 실행할 수 있어요");
  return url.origin;
}

export async function prepareFixture(scenario: string, today: string, url: string, anonKey: string) {
  const db = createClient<Database>(localDatabaseUrl(url), anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await db.auth.signUp({ email: `eval-${randomUUID()}@test.local`, password: `Eval-${randomUUID()}!` });
  if (auth.error || !auth.data.user || !auth.data.session) throw new Error("로컬 평가 사용자 가입·로그인에 실패했어요");
  const store = (await db.from("stores").insert({ owner_id: auth.data.user.id, name: `4.4-${scenario}` }).select("id").single().throwOnError()).data!;
  const ingredients = INGREDIENTS.map((i, index) => ({ ...i, id: randomUUID(), index }));
  await db.from("ingredients").insert(ingredients.map((i) => ({ id: i.id, store_id: store.id, name: i.name, unit: i.unit, storage: i.index >= 22 ? "room" as const : "fridge" as const, default_shelf_days: 7, track_expiry: true, min_stock: i.unit === "ea" ? 5 : 1000, target_stock: i.unit === "ea" ? 20 : 3000 }))).throwOnError();
  const menus = MENUS.map((m, index) => ({ ...m, name: scenario === "unregistered" && index === 6 ? "바질향 버섯크림리조또" : m.name, id: randomUUID(), index }));
  await db.from("menus").insert(menus.map((m) => ({ id: m.id, store_id: store.id, name: m.name, price: 7000 + m.index * 100 }))).throwOnError();
  await db.from("recipe_items").insert(menus.flatMap((m) => m.recipe.map(([i, qty]) => ({ store_id: store.id, menu_id: m.id, ingredient_id: ingredients[i].id, qty })))).throwOnError();

  const receive = async (lots: Database["public"]["Functions"]["receive_stock"]["Args"]["p_lots"]) => {
    const result = await db.rpc("receive_stock", { p_store_id: store.id, p_ref_type: "manual", p_ref_id: null as unknown as string, p_lots: lots });
    if (result.error) throw new Error("평가용 입고에 실패했어요");
  };
  // 과거 판매는 기한 안의 이력용 묶음에서 정식 RPC로 차감한다. 평가 당일에는 모두 경과한다.
  await receive(ingredients.map((i) => ({ ingredient_id: i.id, quantity: i.unit === "ea" ? 10000 : 1_000_000, unit_price: 1, received_at: addDays(today, -16), expires_at: addDays(today, -1), expiry_source: "manual" })));
  for (let day = -14; day < 0; day++) {
    const soldOn = addDays(today, day);
    const sales = menus.map((m) => ({ menu_id: m.id, qty: scenario === "cost-popularity" ? 15 - m.index : m.index % 4 + 1 }));
    const needs = menus.flatMap((m, index) => m.recipe.map(([i, qty]) => ({ ingredientId: ingredients[i].id, qty: qty * sales[index].qty })));
    const lots = (await db.from("stock_lots").select("id, ingredient_id, remaining, expires_at, received_at").eq("store_id", store.id).gt("remaining", 0).throwOnError()).data!;
    const plan = planConsumption(needs, lots.map((l) => ({ id: l.id, ingredientId: l.ingredient_id, remaining: Number(l.remaining), expiresAt: l.expires_at, receivedAt: l.received_at })), soldOn);
    const result = await db.rpc("record_daily_sales", { p_store_id: store.id, p_sold_on: soldOn, p_sales: sales, p_plan: plan.items.map((p) => ({ lot_id: p.lotId, qty: p.qty })), p_shortages: plan.shortages.map((s) => ({ ingredient_id: s.ingredientId, required_qty: s.requiredQty, short_qty: s.shortQty })) });
    if (result.error) throw new Error("평가용 판매 이력 생성에 실패했어요");
  }
  const quantity = (i: typeof ingredients[number]) => scenario === "shortage" ? i.unit === "ea" ? 0.5 : 10 : i.unit === "ea" ? 20 : i.index % 7 === 0 ? 1000 : 3000;
  await receive(ingredients.map((i) => ({ ingredient_id: i.id, quantity: quantity(i), unit_price: scenario === "cost-popularity" ? (i.index === 21 ? 100 : 1) : (i.index % 5 + 1), received_at: scenario === "expired-only" ? addDays(today, -2) : today, expires_at: addDays(today, scenario === "expired-only" ? -1 : i.index % 6), expiry_source: "manual" })));
  const stock = (await db.rpc("get_ingredient_stock", { p_store_id: store.id, p_today: today }).throwOnError()).data!;
  const expected = new Map<string, number>(ingredients.map((i) => [i.id, scenario === "expired-only" ? 0 : quantity(i)]));
  if (stock.length !== 30 || stock.some((r) => Number(r.available_remaining) !== expected.get(r.ingredient_id))) throw new Error("손계산 정답과 DB 스냅샷이 달라 평가를 중단했어요");
  const dbLots = (await db.from("stock_lots").select("id, ingredient_id, remaining, expires_at, received_at").eq("store_id", store.id).throwOnError()).data!;
  const oracle = ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, availableQty: expected.get(i.id)!, soon: scenario !== "expired-only" && i.index % 6 <= 3 }));
  for (const row of oracle) {
    const lots = dbLots.filter((l) => l.ingredient_id === row.id).map((l) => ({ remaining: Number(l.remaining), expiresAt: l.expires_at }));
    const dbSoon = lots.some((l) => l.remaining > 0 && expiryStatus(l.expiresAt, today).status === "soon");
    if (availableQty(lots, today) !== row.availableQty || dbSoon !== row.soon) throw new Error("사전 정답과 DB 묶음의 수량·임박 여부가 달라요");
  }
  const state = async () => {
    const [lots, history] = await Promise.all([
      db.from("stock_lots").select("id, remaining").eq("store_id", store.id).order("id").throwOnError(),
      db.from("stock_movements").select("id").eq("store_id", store.id).order("id").throwOnError(),
    ]);
    return { lots: lots.data, movements: history.data };
  };
  const menuOracle = menus.map((m) => ({ id: m.id, name: m.name, recipe: m.recipe.map(([index, qty]) => ({ ingredientId: ingredients[index].id, qty })) }));
  return { db, storeId: store.id, oracle, menus: menuOracle, state, metadata: { scenario, storeId: store.id, today, ingredients: 30, menus: 15, salesDays: 14, oracle, menuOracle, stock, lots: dbLots } };
}
