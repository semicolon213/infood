// Strategy 패턴의 Context: 추천 생성 (docs/06_ARCHITECTURE.md 7.2, 08_API_SPEC 9·11장).
// 기준(전략)은 입력 순서와 프롬프트만 바꾸고, 출력 검증·재고 대조·원가 계산은 여기서 한 번만 한다 (UT-AI-14).
import "server-only";
import { costOf, latestUnitPrice, nearestDaysLeft } from "@/lib/stock/cost";
import { availableQty } from "@/lib/stock/status";
import { round3 } from "@/lib/stock/unit";
import type { ISODate, RecIngredient, RecommendationView } from "@/types/contracts";
import type { AiClient } from "./client";
import { AiError, type AiErrorCode } from "./errors";
import { Recommendation } from "./schemas";
import type { RankedIngredient, RecommendSnapshot, RecommendStrategy } from "./strategies/types";

export type RecommendBody = Omit<RecommendationView, "id" | "basis">;
export type RecommendResult =
  | { ok: true; body: RecommendBody; ranked: RankedIngredient[] }
  | { ok: false; code: AiErrorCode; ranked: RankedIngredient[] }; // AI 실패 + 대체 메뉴도 없음

const SOON_DAYS = 3; // 임박 D-0~D-3 (BR-05)
const MAX_PUSH = 3;

// ── 프롬프트 (초안. 문구 다듬기는 WBS 3.10b) ─────────────────────────

const SYSTEM = [
  "당신은 소형 식당의 주방장을 돕는 메뉴 기획자입니다.",
  "주어진 재료 목록과 메뉴 목록만 근거로 추천하세요. 목록에 없는 메뉴 ID를 만들지 마세요.",
  "pushMenus: 기존 메뉴 중 지금 팔면 좋은 메뉴 최대 3개. menuId는 메뉴 목록의 id를 그대로 쓰고, consumes에는 그 메뉴 1인분에 드는 재료를 적으세요.",
  "newIdeas: 남은 재료로 만들 수 있는 새 특선 메뉴 최대 3개. 재료는 가능하면 재료 목록의 ingredientId를 쓰고, 목록에 없는 재료는 ingredientId를 null로 두세요.",
  "qty는 재료의 기본 단위(g, ml, ea) 숫자입니다. 가격(suggestedPrice)은 원 단위 정수로, 모르면 null입니다.",
  "reason과 steps는 한국어 한 문장으로 짧게 쓰세요.",
].join("\n");

export function buildRecommendPrompt(ranked: RankedIngredient[], snapshot: RecommendSnapshot, guide: string): string {
  const names = new Map(snapshot.ingredients.map((i) => [i.id, i.name]));
  const ingredients = ranked.map((r) => ({ ingredientId: r.ingredientId, name: r.name, unit: r.unit, available: r.availableQty, note: r.reason }));
  const menus = snapshot.menus.map((m) => ({
    id: m.id,
    name: m.name,
    price: m.price,
    recipe: m.recipe.map((r) => ({ ingredientId: r.ingredientId, name: names.get(r.ingredientId) ?? "", qty: r.qty })),
  }));
  return [guide, "", "재료 목록 (우선순위 순):", JSON.stringify(ingredients), "", "메뉴 목록:", JSON.stringify(menus)].join("\n");
}

// ── 공통 후처리 (기준과 무관, 08_API_SPEC 11장) ─────────────────────

const normalize = (name: string) => name.replace(/\s+/g, "").toLowerCase();

type Ing = RecommendSnapshot["ingredients"][number];

function linker(snapshot: RecommendSnapshot, today: ISODate) {
  const byId = new Map(snapshot.ingredients.map((i) => [i.id, i]));
  const byName = new Map(snapshot.ingredients.map((i) => [normalize(i.name), i]));
  const find = (id: string | null, name: string): Ing | undefined => (id !== null ? byId.get(id) : undefined) ?? byName.get(normalize(name));

  // 재료 연결 → 재고 대조. 항목을 지우지 않고 status만 붙인다 (FR-REC-03, BR-04)
  return (ri: { ingredientId: string | null; name: string; qty: number }): RecIngredient => {
    const ing = find(ri.ingredientId, ri.name);
    if (!ing) return { ingredientId: null, name: ri.name, qty: ri.qty, unit: null, status: "unregistered", availableQty: null };
    const available = availableQty(ing.lots, today);
    const qty = round3(ri.qty);
    return { ingredientId: ing.id, name: ing.name, qty, unit: ing.unit, status: qty > available ? "short" : "have", availableQty: available };
  };
}

function countStatus(rows: RecIngredient[][]) {
  const all = rows.flat();
  return { shortCount: all.filter((r) => r.status === "short").length, unregisteredCount: all.filter((r) => r.status === "unregistered").length };
}

/** AI 출력 → 응답 본문. AI가 준 수량·원가·재고 판단은 쓰지 않고 DB 기준으로 다시 계산한다 */
export function postprocess(out: Recommendation, snapshot: RecommendSnapshot, today: ISODate): RecommendBody {
  const link = linker(snapshot, today);
  const menus = new Map(snapshot.menus.map((m) => [m.id, m]));
  const ings = new Map(snapshot.ingredients.map((i) => [i.id, i]));
  let droppedCount = 0;

  const pushMenus: RecommendBody["pushMenus"] = [];
  for (const p of out.pushMenus) {
    const menu = menus.get(p.menuId);
    if (!menu) {
      droppedCount += 1; // 매장의 활성 메뉴가 아님 (FR-REC-04)
      continue;
    }
    pushMenus.push({ menuId: menu.id, name: menu.name, reason: p.reason, consumes: p.consumes.map(link) });
  }

  const newIdeas: RecommendBody["newIdeas"] = out.newIdeas.map((idea, index) => {
    const ingredients = idea.ingredients.map(link);
    // 원가는 연결된 재료만 최근 묶음 단가로 (UT-AI-06). 미등록 재료는 원가에서 빠진다
    const estCost = costOf(
      ingredients.flatMap((r) => (r.ingredientId === null ? [] : [{ qty: r.qty, unitPrice: latestUnitPrice(ings.get(r.ingredientId)!.lots) }])),
    );
    return { index, name: idea.name, ingredients, steps: idea.steps, estCost, suggestedPrice: idea.suggestedPrice };
  });

  return {
    fallback: false,
    pushMenus,
    newIdeas,
    droppedCount,
    ...countStatus([...pushMenus.map((p) => p.consumes), ...newIdeas.map((i) => i.ingredients)]),
  };
}

// 받침 유무로 "이/가" (두부가, 양파가, 대파가 / 우유가, 계란이)
function subject(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}이(가)`;
  return `${word}${code % 28 === 0 ? "가" : "이"}`;
}

/** AI 실패 시 규칙 기반 대체: 임박(D-0~D-3) 재료가 들어간 기존 메뉴 (UC-08 3a, UT-AI-20·21) */
export function fallbackRecommendation(snapshot: RecommendSnapshot, today: ISODate): RecommendBody {
  const link = linker(snapshot, today);
  const soon = new Map<string, number>();
  for (const ing of snapshot.ingredients) {
    const d = nearestDaysLeft(ing.lots, today);
    if (d !== null && d <= SOON_DAYS) soon.set(ing.id, d);
  }
  const names = new Map(snapshot.ingredients.map((i) => [i.id, i.name]));

  const scored = snapshot.menus
    .map((m) => {
      const hits = m.recipe.filter((r) => soon.has(r.ingredientId)).sort((a, b) => soon.get(a.ingredientId)! - soon.get(b.ingredientId)!);
      return { m, hits };
    })
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => soon.get(a.hits[0].ingredientId)! - soon.get(b.hits[0].ingredientId)! || a.m.name.localeCompare(b.m.name, "ko"))
    .slice(0, MAX_PUSH);

  const pushMenus = scored.map(({ m, hits }) => {
    const first = hits[0];
    return {
      menuId: m.id,
      name: m.name,
      reason: `${subject(names.get(first.ingredientId) ?? "")} D-${soon.get(first.ingredientId)}이라 먼저 쓰기 좋아요`,
      consumes: m.recipe.map((r) => link({ ingredientId: r.ingredientId, name: names.get(r.ingredientId) ?? "", qty: r.qty })),
    };
  });
  return { fallback: true, pushMenus, newIdeas: [], droppedCount: 0, ...countStatus(pushMenus.map((p) => p.consumes)) };
}

/** 전략으로 입력 구성 → AiClient 호출 → 공통 후처리. AI가 실패하면 규칙 기반 대체 */
export async function recommend(args: { snapshot: RecommendSnapshot; strategy: RecommendStrategy; today: ISODate; ai: AiClient }): Promise<RecommendResult> {
  const { snapshot, strategy, today, ai } = args;
  const ranked = strategy.rankIngredients(snapshot, today);
  try {
    // 형식 오류 1회 재시도는 어댑터가 한다 (ClaudeAdapter, UT-AI-03)
    const out = await ai.generate({
      task: "recommend",
      schema: Recommendation,
      system: SYSTEM,
      messages: [{ role: "user", content: buildRecommendPrompt(ranked, snapshot, strategy.promptGuide()) }],
    });
    return { ok: true, body: postprocess(out, snapshot, today), ranked };
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    const body = fallbackRecommendation(snapshot, today);
    // 대체할 메뉴도 없으면 원래 오류 (08_API_SPEC 9장 대체 동작)
    return body.pushMenus.length > 0 ? { ok: true, body, ranked } : { ok: false, code: error.code, ranked };
  }
}
