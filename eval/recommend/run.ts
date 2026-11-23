import "server-only";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRecommendation } from "@/app/api/recommendations/create";
import { getAiClient, type AiClient, type AiRequest } from "@/lib/ai/client";
import { todayKST } from "@/lib/date";
import type { RecommendBasis } from "@/types/contracts";
import { cliArgs } from "../../tests/e2e/results/common.mjs";
import { sourceProvenance } from "../../tests/e2e/results/source.mjs";
import { INGREDIENTS, MENUS, localDatabaseUrl, prepareFixture } from "./fixtures";
import { PLAN, SCENARIOS, summarize } from "./metrics.mjs";
import { diagnostic, runAttempt, runAttempts } from "./attempt.mjs";

const usage = `WBS 4.4 / NFR-03 실제 AI 평가
  pnpm eval:recommend --plan
  $evalCommit = git rev-parse HEAD
  pnpm eval:recommend --prepare-only --source-commit $evalCommit
  pnpm eval:recommend --live --source-commit $evalCommit

Git 없는 실행 복사본에는 원본에서 생성한 --source-manifest JSON도 필요합니다.
--live는 5시나리오×4회, expiry 10·cost 5·popularity 5의 20회 요청입니다.
기존 Adapter 내부 재시도는 유지하며 표본 보충 호출은 하지 않습니다.
SUPABASE_TEST_URL·SUPABASE_TEST_ANON_KEY와 공급자 키는 프로세스 환경에 설정합니다.
로컬 DB의 새 일반 사용자·매장만 사용합니다. .env 파일을 자동으로 읽지 않습니다.
--prepare-only는 DB fixture만 만들고 AI를 부르지 않습니다.`;
type Sample = Awaited<ReturnType<typeof runAttempt>>["sample"];

async function main() {
  const { values } = parseArgs({ args: cliArgs(), options: {
    help: { type: "boolean" }, plan: { type: "boolean" }, live: { type: "boolean" },
    "prepare-only": { type: "boolean" }, "source-commit": { type: "string" }, "source-manifest": { type: "string" }, output: { type: "string" },
  } });
  if (values.help || (!values.plan && !values.live && !values["prepare-only"])) { console.log(usage); return; }
  if ([values.plan, values.live, values["prepare-only"]].filter(Boolean).length > 1) throw new Error("실행 모드는 하나만 선택해 주세요");
  if (values.plan) { console.log(JSON.stringify({ scenarios: SCENARIOS, ingredients: INGREDIENTS.length, menus: MENUS.length, salesDays: 14, requests: PLAN, actualAiCalls: 0 }, null, 2)); return; }
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const source = await sourceProvenance(root, values["source-commit"] ?? "", values["source-manifest"]);
  const url = localDatabaseUrl(process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321");
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  if (!anonKey || anonKey.startsWith("sb_secret_")) throw new Error("로컬 Supabase 공개 anon 키를 설정해 주세요");
  let role: string | undefined;
  try { role = JSON.parse(Buffer.from(anonKey.split(".")[1] ?? "", "base64url").toString()).role; } catch { /* publishable 키는 JWT가 아니다 */ }
  if (role === "service_role") throw new Error("service role 키는 사용할 수 없어요");
  const provider = process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "google";
  if (values.live) {
    if (["1", "fail"].includes(process.env.AI_MOCK ?? "")) throw new Error("AI_MOCK가 켜져 있어 실제 평가를 중단했어요");
    if (!(provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.GOOGLE_GENERATIVE_AI_API_KEY)) throw new Error("선택한 공급자 API 키가 없어요. 키 값은 기록하지 않습니다");
  }
  const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!health?.ok) throw new Error("로컬 Supabase에 연결할 수 없어요");
  const today = todayKST();
  const runId = `${today}-recommend-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const output = path.resolve(values.output ?? path.join("eval/results", runId));
  await mkdir(path.dirname(output), { recursive: true }); await mkdir(output, { recursive: false });
  const json = async (name: string, value: unknown) => {
    const file = path.join(output, name);
    await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2)); await rename(`${file}.tmp`, file);
  };
  await json("metadata.json", { runId, today, source, provider, node: process.version, platform: process.platform, database: url, live: Boolean(values.live), timingScope: "createRecommendation body; HTTP/auth overhead excluded", plan: PLAN });
  await json("run-state.json", { state: "preparing", runId });
  let stage = "prepare-fixtures";
  try {
    const fixtures = new Map<string, Awaited<ReturnType<typeof prepareFixture>>>();
    for (const scenario of SCENARIOS) {
      const fixture = await prepareFixture(scenario, today, url, anonKey); fixtures.set(scenario, fixture);
      await json(`${scenario}-fixture.json`, fixture.metadata);
      console.log(`PREPARED ${scenario}: 30재료·15메뉴·14일, DB 수량·기한 대조 완료`);
    }
    if (values["prepare-only"]) { await json("run-state.json", { state: "prepared", actualAiCalls: 0, runId }); console.log(`AI 호출 없음. 증거: ${output}`); return; }
    stage = "recommendations";
    const client = getAiClient();
    const result = await runAttempts({
      plan: PLAN, isSameDay: () => todayKST() === today,
      execute: async (request: typeof PLAN[number] & { attempt: number }) => {
        const fixture = fixtures.get(request.scenario)!;
        return runAttempt({ request, oracle: fixture.oracle, menus: fixture.menus, readState: fixture.state,
          save: async (sample: Sample) => json(`${String(request.attempt).padStart(2, "0")}.json`, sample),
          invoke: async (recorder: { request(value: unknown): Promise<void>; raw(value: unknown): Promise<void> }) => {
            const recordingClient: AiClient = { async generate<T>(req: AiRequest<T>): Promise<T> {
              await recorder.request({ task: req.task, system: req.system, messages: req.messages });
              const raw = await client.generate(req); await recorder.raw(raw); return raw;
            } };
            return createRecommendation({ db: fixture.db, storeId: fixture.storeId, today, basis: request.basis as RecommendBasis, ai: recordingClient, dailyLimit: 100 });
          },
        });
      },
      finish: async (samples: Sample[], abort: { code: string } | null) => {
        const summary = summarize(samples); await json("summary.json", summary);
        await json("run-state.json", { state: abort ? "aborted" : "completed", runId, abort, recordedAttempts: samples.length, expectedAttempts: PLAN.length });
        const rate = (v: number | null) => v === null ? "산출 불가" : `${(v * 100).toFixed(2)}%`;
        const markdown = `# AI 추천 평가 ${runId}\n\n대상 ${source.sourceCommit} · ${provider} · ${process.version} · 기준일 ${today}\n\n| 항목 | 결과 |\n|---|---|\n| 실행 상태 | ${abort ? `중단: ${abort.code}` : "완료"} |\n| NFR-03 | ${summary.nfr03} |\n| 요청 / AI / 대체 / 오류 / 미완료 | ${summary.attempts} / ${summary.ai} / ${summary.fallback} / ${summary.errors} / ${summary.incomplete} |\n| 전체 응답 재료 상태 일치율 | ${rate(summary.agreement)} |\n| 상태·수량·단위·이름 전체 일치율 | ${rate(summary.fieldAgreement)} |\n| 재료 불일치 / 서버 집계 불일치 | ${summary.mismatches.length} / ${summary.counterMismatches.length} |\n| 서버 레시피 재료 / AI 아이디어 재료 언급 | ${summary.origins["server-recipe"].mentions} / ${summary.origins["ai-idea"].mentions} |\n| 유효율 | ${rate(summary.validRate)} |\n| 임박 활용률 (계획 원분모) | ${rate(summary.expiryUtilization)} |\n| 임박 기회 없음 / 분모 / 달성 가능 상한 | ${summary.expiryNoOpportunity} / ${summary.expirySamples} / ${rate(summary.expiryCeiling)} |\n| 임박 재료 보유 표본의 활용률 (참고) | ${rate(summary.expiryEligibleUtilization)} |\n| 미등록 비율 | ${rate(summary.unregisteredRate)} |\n| 본문 처리 P95 | ${summary.p95Ms === null ? "산출 불가" : `${summary.p95Ms}ms`} |\n\n상태 일치율이 100%여도 필드·서버 집계 오류가 있으면 FAIL입니다. 임박 보조율로 원래 목표의 통과 여부를 대신하지 않습니다. AI/대체/오류별 지연과 계수·분포·무결성 오류는 summary.json에 기록합니다. 본문 시간은 HTTP·인증을 제외하므로 NFR-06 전체 응답 통과가 아닙니다. Adapter 내부 실패 HTTP 원문·재시도 횟수는 관측 범위 밖입니다.\n`;
        await writeFile(path.join(output, "report.md"), markdown);
        console.log(`NFR-03 ${summary.nfr03}. 증거: ${output}`);
        if (abort || summary.nfr03 !== "PASS") process.exitCode = 1;
      },
    });
    if (result.abort) process.exitCode = 1;
  } catch (error) {
    await json("run-state.json", { state: "aborted", runId, diagnostic: diagnostic(error, stage) });
    throw new Error(`평가 실행이 중단됐어요. 단계: ${stage}. 기존 표본 증거: ${output}`);
  }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "평가 실행에 실패했어요"); process.exitCode = 1; });
