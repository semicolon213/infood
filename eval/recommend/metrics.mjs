// 10_TEST_PLAN 7장. 전체 응답 재료와 AI 아이디어 재료를 분리해서 보여 준다.
export const SCENARIOS = ["mixed", "expired-only", "shortage", "unregistered", "cost-popularity"];
export const BASES = ["expiry", "expiry", "cost", "popularity"];
export const PLAN = SCENARIOS.flatMap((scenario) => BASES.map((basis, index) => ({ scenario, basis, index })));
const rate = (n, d) => d ? n / d : null;
const keyOf = (s) => `${s.scenario}/${s.basis}/${s.index}`;

export function nearestRank95(values) {
  if (!values.length) return null;
  if (values.some((v) => !Number.isFinite(v) || v < 0)) throw new Error("지연 값이 잘못됐어요");
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
}
const mentionsOf = (body) => [
  ...body.pushMenus.flatMap((m) => m.consumes.map((row) => ({ ...row, origin: "server-recipe" }))),
  ...body.newIdeas.flatMap((m) => m.ingredients.map((row) => ({ ...row, origin: "ai-idea" }))),
];

export function compareIngredients(body, oracle) {
  const normalized = (name) => name.replace(/\s/g, "").toLowerCase();
  const byId = new Map(oracle.map((row) => [row.id, row]));
  const byName = new Map(oracle.map((row) => [normalized(row.name), row]));
  return mentionsOf(body).map((row) => {
    const answer = byId.get(row.ingredientId) ?? byName.get(normalized(row.name));
    const qtyValid = Number.isFinite(row.qty) && row.qty >= 0;
    const expected = answer ? row.qty > answer.availableQty ? "short" : "have" : "unregistered";
    const fieldsMatch = qtyValid && (answer ? row.ingredientId === answer.id && row.availableQty === answer.availableQty && row.unit === answer.unit && row.name === answer.name : row.ingredientId === null && row.availableQty === null && row.unit === null);
    return { origin: row.origin, ingredientId: row.ingredientId, name: row.name, expected, actual: row.status, match: qtyValid && row.status === expected, fieldsMatch };
  });
}

function checkCounters(sample) {
  const rows = mentionsOf(sample.result);
  const expected = { shortCount: rows.filter((r) => r.status === "short").length, unregisteredCount: rows.filter((r) => r.status === "unregistered").length };
  if (sample.outcome === "fallback") expected.droppedCount = 0;
  else if (sample.menus && sample.raw) {
    const menuIds = new Set(sample.menus.map((m) => m.id));
    // 중복 제거는 droppedCount와 다른 지표다 (기존 후처리 계약).
    expected.droppedCount = sample.raw.pushMenus.filter((p) => !menuIds.has(p.menuId)).length;
  }
  return { checked: Object.keys(expected), mismatches: Object.entries(expected).filter(([key, value]) => sample.result[key] !== value).map(([key, value]) => ({ attempt: sample.attempt, field: key, expected: value, actual: sample.result[key] ?? null })) };
}

export function summarize(samples) {
  const ai = samples.filter((s) => s.outcome === "ai");
  const fallback = samples.filter((s) => s.outcome === "fallback");
  const errors = samples.filter((s) => s.outcome === "error");
  const incomplete = samples.filter((s) => !["ai", "fallback", "error"].includes(s.outcome));
  const sampleIssues = []; const counterMismatches = [];
  const compare = (values) => values.flatMap((s) => {
    try {
      const counts = checkCounters(s); counterMismatches.push(...counts.mismatches);
      if (!counts.checked.includes("droppedCount")) sampleIssues.push({ attempt: s.attempt, reason: "제외 건수 대조에 필요한 메뉴·원시 출력 없음" });
      return compareIngredients(s.result, s.oracle).map((row) => ({ ...row, attempt: s.attempt }));
    } catch { sampleIssues.push({ attempt: s.attempt, reason: "응답 또는 정답 구조가 올바르지 않음" }); return []; }
  });
  const comparisons = compare(ai); const fallbackComparisons = compare(fallback);
  const mismatches = comparisons.filter((row) => !row.match || !row.fieldsMatch);
  const distribution = Object.fromEntries(SCENARIOS.map((key) => [key, ai.filter((s) => s.scenario === key).length]));
  const basisDistribution = Object.fromEntries(["expiry", "cost", "popularity"].map((key) => [key, ai.filter((s) => s.basis === key).length]));
  const planCounts = new Map(); for (const s of samples) planCounts.set(keyOf(s), (planCounts.get(keyOf(s)) ?? 0) + 1);
  const missingPlan = PLAN.filter((p) => !planCounts.has(keyOf(p))).map(keyOf);
  const duplicateOrUnknown = [...planCounts].filter(([key, n]) => n !== 1 || !PLAN.some((p) => keyOf(p) === key)).map(([key]) => key);
  const planComplete = samples.length === PLAN.length && !missingPlan.length && !duplicateOrUnknown.length;
  const sufficient = planComplete && ai.length === PLAN.length;
  let rawCount = 0; let kept = 0; let rawComplete = true;
  for (const s of ai) {
    try {
      const raw = s.raw.pushMenus.length + s.raw.newIdeas.length;
      const retained = s.result.pushMenus.length + s.result.newIdeas.length;
      if (retained > raw) throw new Error();
      rawCount += raw; kept += retained;
    } catch { rawComplete = false; sampleIssues.push({ attempt: s.attempt, reason: "원시 항목·유지 항목 대조 불가" }); }
  }
  const expiry = ai.filter((s) => s.basis === "expiry");
  const eligible = expiry.filter((s) => s.oracle.some((row) => row.soon && row.availableQty > 0));
  const expiryHits = eligible.filter((s) => {
    const soon = new Set(s.oracle.filter((row) => row.soon && row.availableQty > 0).map((row) => row.id));
    try { return mentionsOf(s.result).some((row) => soon.has(row.ingredientId) && row.qty > 0); } catch { return false; }
  }).length;
  const timings = Object.fromEntries([["all", samples], ["ai", ai], ["fallback", fallback], ["error", errors]].map(([key, rows]) => {
    const invalid = rows.filter((s) => !Number.isFinite(s.durationMs) || s.durationMs < 0).map((s) => s.attempt ?? keyOf(s));
    return [key, { count: rows.length, invalid, p95Ms: invalid.length ? null : nearestRank95(rows.map((s) => s.durationMs)) }];
  }));
  const origins = Object.fromEntries(["server-recipe", "ai-idea"].map((origin) => {
    const rows = comparisons.filter((r) => r.origin === origin);
    return [origin, { mentions: rows.length, statusAgreement: rate(rows.filter((r) => r.match).length, rows.length), mismatches: rows.filter((r) => !r.match || !r.fieldsMatch).length }];
  }));
  const stockChanged = samples.filter((s) => s.integrity?.status === "changed").map((s) => s.attempt);
  const stockUnknown = samples.filter((s) => !s.integrity || (s.integrity.status !== "verified" && s.integrity.status !== "changed")).map((s) => s.attempt ?? keyOf(s));
  return {
    attempts: samples.length, expectedAttempts: PLAN.length, ai: ai.length, fallback: fallback.length, errors: errors.length, incomplete: incomplete.length,
    planComplete, missingPlan, duplicateOrUnknown, distribution, basisDistribution, sufficient, mentions: comparisons.length, origins,
    agreement: rate(comparisons.filter((r) => r.match).length, comparisons.length), fieldAgreement: rate(comparisons.filter((r) => r.match && r.fieldsMatch).length, comparisons.length), mismatches,
    counterMismatches, sampleIssues, stockChanged, stockUnknown,
    nfr03: mismatches.length || counterMismatches.length || stockChanged.length ? "FAIL" : sufficient && comparisons.length && !sampleIssues.length && !stockUnknown.length ? "PASS" : "BLOCKED",
    validRate: rawComplete ? rate(kept, rawCount) : null, rawCount, excludedCount: rawComplete ? rawCount - kept : null,
    expiryUtilization: rate(expiryHits, expiry.length), expirySamples: expiry.length, expiryHits,
    expiryEligibleSamples: eligible.length, expiryNoOpportunity: expiry.length - eligible.length,
    expiryEligibleUtilization: rate(expiryHits, eligible.length), expiryCeiling: rate(eligible.length, expiry.length),
    unregisteredRate: rate(comparisons.filter((r) => r.actual === "unregistered").length, comparisons.length),
    p95Ms: timings.all.p95Ms, timings, timingVerdict: timings.all.invalid.length || !planComplete ? "BLOCKED" : "MEASURED_BODY_ONLY", timingScope: "createRecommendation body; HTTP/auth overhead excluded",
    fallbackRate: rate(fallback.length, samples.length), errorRate: rate(errors.length, samples.length), fallbackMismatches: fallbackComparisons.filter((r) => !r.match || !r.fieldsMatch),
  };
}
