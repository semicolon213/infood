// 3.7a 화면 보조 검사. 실제 3.7b/Supabase 재고 변경 검증과 구분한다.
// 실행: node tests/e2e/waste/check.mjs. STOCK_APP_DIR로 검증용 소스 복사본 지정 가능.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

const expect = baseExpect.configure({ timeout: 30_000 });
const port = Number(process.env.STOCK_UI_PORT ?? 3154);
const apiPort = Number(process.env.STOCK_AUTH_PORT ?? 54494);
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const appDir = path.resolve(process.env.STOCK_APP_DIR ?? process.cwd());
const output = path.resolve("test-results/waste-ui-check");
const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const user = { id: id(1), aud: "authenticated", role: "authenticated", email: "stock-check@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
let authExpired = false;
const mock = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/v1/user") { res.statusCode = authExpired ? 401 : 200; return res.end(JSON.stringify(authExpired ? { code: "bad_jwt", message: "JWT expired" } : user)); }
  if (req.url?.startsWith("/rest/v1/stores?")) return res.end(JSON.stringify([{ id: id(2), name: "사용·폐기 화면 점검 매장" }]));
  res.statusCode = 404; res.end(JSON.stringify({ message: "Unknown fixture endpoint" }));
});
mock.listen(apiPort, "127.0.0.1");
await once(mock, "listening");
let logs = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: appDir, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, AI_MOCK: "1", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: apiURL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-anon-key" },
});
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });
await mkdir(output, { recursive: true });
let browser;
const checks = [];
const record = (name) => { checks.push(name); console.log(`PASS ${name}`); };
try {
  const deadline = Date.now() + 240_000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${child.exitCode}\n${logs}`);
    try { if ((await fetch(`${baseURL}/login`, { signal: AbortSignal.timeout(5000) })).ok) break; } catch { /* 구동 대기 */ }
    if (Date.now() > deadline) throw new Error(`Next readiness timeout\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const cookies = new Map();
  const client = createServerClient(apiURL, "test-public-anon-key", { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)) } });
  const tokenPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${tokenPart({ alg: "HS256", typ: "JWT" })}.${tokenPart({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.${Buffer.from("fixture-signature").toString("base64url")}`;
  assert.equal((await client.auth.setSession({ access_token: token, refresh_token: "fixture-refresh-token" })).error, null);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 }, locale: "ko-KR", timezoneId: "Asia/Seoul", isMobile: true, hasTouch: true });
  const restoreAuth = async () => { authExpired = false; await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: baseURL }))); };
  await restoreAuth();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(120_000);
  const errors = [];
  const posts = [];
  const resultLayouts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.method() === "POST" && request.headers()["next-action"]) posts.push({ url: request.url(), body: request.postData() }); });
  const usage = () => page.getByRole("form", { name: "재료 사용 기록", exact: true });
  const waste = () => page.getByRole("form", { name: "묶음 폐기 기록", exact: true });
  const pickUsage = async (index, name) => { await usage().getByRole("combobox", { name: `사용 재료 ${index}`, exact: true }).click(); await page.getByRole("option", { name, exact: true }).click(); };
  const capture = async (name) => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    const selector = 'main button, main a, main input:not([type="radio"]), main textarea, main label:has(input[type="radio"]), main [role="combobox"], [role="option"]';
    await expect.poll(() => page.locator('[role="option"]').evaluateAll((elements) => elements.every((element) => element.getBoundingClientRect().height >= 44))).toBe(true);
    const small = await page.locator(selector).evaluateAll((elements) => elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44) ? [{ text: element.textContent, width: rect.width, height: rect.height }] : [];
    }));
    assert.deepEqual(small, [], `${name}: touch target under 44px`);
    // 실제 고정 헤더·저장바·하단 탭과 현재 스크롤을 유지한다.
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false, style: 'nextjs-portal, [data-sonner-toaster] { display: none; }' });
  };
  const checkResultLayout = async (form, name) => {
    const region = form.getByRole("status", { name });
    await expect(region).toBeFocused();
    await expect.poll(() => region.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const header = document.querySelector("header.sticky")?.getBoundingClientRect();
      const saveBar = element.closest("form")?.querySelector(":scope > .sticky")?.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="주요 메뉴"]')?.getBoundingClientRect();
      return rect.top >= (header?.bottom ?? 0) && rect.bottom <= Math.min(saveBar?.top ?? innerHeight, nav?.top ?? innerHeight, innerHeight);
    })).toBe(true);
    resultLayouts.push({ name, focused: true, visibleBetweenFixedBars: true, box: await region.boundingBox() });
  };
  // 미구현 부족분·충돌 응답만 액션 전송 경계에서 모의한다. 서버 소스는 바꾸지 않는다.
  const replaceAction = async (replacement) => page.route("**/waste**", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    let replaced = false;
    const lines = body.split("\n").map((line) => {
      const match = /^([0-9a-f]+):(.+)$/.exec(line);
      if (!match) return line;
      try {
        const value = JSON.parse(match[2]);
        if (value && typeof value.ok === "boolean") { replaced = true; return `${match[1]}:${JSON.stringify(replacement)}`; }
      } catch { /* JSON이 아닌 Flight 행 */ }
      return line;
    });
    assert.equal(replaced, true, "local action fixture must locate the ActionResult frame");
    await route.fulfill({ response, body: lines.join("\n") });
  });

  await page.goto("/waste");
  await page.evaluate(() => document.fonts.ready);
  const today = await usage().getByLabel("사용일", { exact: true }).inputValue();
  assert.equal(today, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()));
  await expect(page.getByRole("tab", { name: "사용", exact: true })).toHaveAttribute("aria-selected", "true");
  await usage().getByRole("button", { name: "사용 품목 추가", exact: true }).click();
  await usage().getByRole("button", { name: "사용 품목 추가", exact: true }).click();
  await usage().getByRole("button", { name: "사용 기록 저장", exact: true }).click();
  await expect(usage().locator('[aria-invalid="true"]')).toHaveCount(6);
  await expect(usage().getByRole("combobox", { name: "사용 재료 1", exact: true })).toBeFocused();
  await pickUsage(1, "두부 (ea)");
  await usage().getByRole("spinbutton", { name: "사용량 1 (ea)", exact: true }).fill("0.125");
  await pickUsage(2, "양파 (g)");
  await expect(usage().locator('[aria-invalid="true"]')).toHaveCount(3);
  await usage().getByRole("button", { name: "사용 품목 1 삭제", exact: true }).click();
  await expect(usage().locator('[aria-invalid="true"]')).toHaveCount(3);
  await expect(usage().getByRole("spinbutton", { name: "사용량 1 (g)", exact: true })).toHaveAttribute("aria-invalid", "true");
  assert.equal(posts.length, 0);
  record("E2E-04 UI: KST default, simultaneous errors, focus and row error remapping");

  await page.goto("/waste");
  await pickUsage(1, "양파 (g)");
  await usage().getByRole("spinbutton", { name: "사용량 1 (g)", exact: true }).fill("300");
  await usage().getByRole("textbox", { name: "메모 1 (선택)", exact: true }).fill("직원 식사");
  await usage().getByRole("button", { name: "사용 품목 추가", exact: true }).click();
  await pickUsage(2, "계란 (ea)");
  await usage().getByRole("spinbutton", { name: "사용량 2 (ea)", exact: true }).fill("2");
  await page.getByRole("tab", { name: "폐기", exact: true }).click();
  await page.getByRole("tab", { name: "사용", exact: true }).click();
  await expect(usage().getByRole("spinbutton", { name: "사용량 1 (g)", exact: true })).toHaveValue("300");
  await usage().getByLabel("사용일", { exact: true }).fill("2999-01-01");
  await usage().getByRole("spinbutton", { name: "사용량 1 (g)", exact: true }).fill("0.0004");
  await usage().getByRole("button", { name: "사용 기록 저장", exact: true }).click();
  await expect(usage().getByText("미래 날짜는 입력할 수 없어요", { exact: true })).toBeVisible();
  await expect(usage().getByText("수량은 소수 셋째 자리까지 입력해 주세요", { exact: true })).toBeVisible();
  assert.equal(posts.length, 0);
  await usage().getByLabel("사용일", { exact: true }).fill(today);
  await usage().getByRole("spinbutton", { name: "사용량 1 (g)", exact: true }).fill("300");
  await capture("usage-form-375");
  record("E2E-04 UI: multi-item memo/base units, tab draft preservation and date/precision validation");

  await page.route("**/waste**", (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await usage().getByRole("button", { name: "사용 기록 저장", exact: true }).click();
  await expect(usage().getByText("저장 결과를 확인하지 못했어요. 입력한 내용은 그대로예요. 기록을 확인한 뒤 다시 시도해 주세요", { exact: true })).toBeVisible();
  await expect(usage().getByRole("textbox", { name: "메모 1 (선택)", exact: true })).toHaveValue("직원 식사");
  await page.unroute("**/waste**");
  record("E2E-04 UI: failed network preserves input and permits retry");
  await replaceAction({ ok: true, data: { recordIds: [id(501)], shortages: [{ ingredientId: id(103), name: "대파", unit: "g", requiredQty: 300, shortQty: 100 }] } });
  await usage().getByRole("button", { name: "사용 기록 저장", exact: true }).click();
  await expect(usage().getByRole("status", { name: "사용 저장 결과" })).toContainText("대파 재고가 100g 부족했어요");
  await checkResultLayout(usage(), "사용 저장 결과");
  record("E2E-04 UI D-2/D-7: success and shortage focused/visible with fixed bars unchanged");
  const submitted = JSON.parse(posts.at(-1).body)[0];
  assert.equal(submitted.items[0].qty, 300); assert.equal(submitted.items[0].memo, "직원 식사"); assert.equal(submitted.items[0].unit, undefined);
  const afterUsage = posts.length;
  await usage().dispatchEvent("submit");
  assert.equal(posts.length, afterUsage);
  await expect(usage().getByRole("button", { name: "저장 완료", exact: true })).toBeDisabled();
  await capture("usage-shortage-375");
  await checkResultLayout(usage(), "사용 저장 결과");
  await usage().getByRole("button", { name: "새 사용 기록", exact: true }).click();
  await expect(usage().getByRole("combobox", { name: "사용 재료 1", exact: true })).toHaveText("재료를 선택해 주세요");
  await page.unroute("**/waste**");
  record("IT-USE-07 UI fixture: server shortage display, payload and explicit new-record duplicate guard");
  await pickUsage(1, "계란 (ea)");
  await usage().getByRole("spinbutton", { name: "사용량 1 (ea)", exact: true }).fill("20");
  await replaceAction({ ok: true, data: { recordIds: [id(501)], shortages: [{ ingredientId: id(105), name: "계란", unit: "ea", requiredQty: 20, shortQty: 10 }] } });
  await usage().getByRole("button", { name: "사용 기록 저장", exact: true }).click();
  await expect(usage().getByRole("status", { name: "사용 저장 결과" })).toContainText("계란 재고가 10ea 부족했어요");
  await checkResultLayout(usage(), "사용 저장 결과");
  await capture("shortage-particle-375");
  await page.unroute("**/waste**");
  record("E2E-04 UI D-4: shortage wording handles names ending with a consonant");

  await page.goto(`/ingredients/${id(102)}`);
  await page.getByRole("link", { name: "이 묶음 폐기", exact: true }).first().click();
  await expect(page.getByRole("tab", { name: "폐기", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(waste().getByRole("radio").first()).toBeChecked();
  await expect(waste().getByRole("spinbutton", { name: "폐기량 (ea)", exact: true })).toHaveValue("2");
  await expect(waste().getByRole("combobox", { name: "폐기 사유", exact: true })).toHaveText("기한 경과");
  await capture("waste-preselected-375");
  record("IT-USE-08 UI: ingredient-detail lot link preselects exact expired lot, quantity and reason");
  const beforeWaste = posts.length;
  await waste().getByRole("spinbutton", { name: "폐기량 (ea)", exact: true }).fill("2.001");
  await waste().getByRole("button", { name: "폐기 기록 저장", exact: true }).click();
  await expect(waste().getByText("남은 양보다 많이 폐기할 수 없어요", { exact: true })).toBeVisible();
  assert.equal(posts.length, beforeWaste);
  await waste().getByRole("spinbutton", { name: "폐기량 (ea)", exact: true }).fill("1");
  await replaceAction({ ok: false, error: { code: "STOCK_CONFLICT", message: "다른 기기에서 재고가 바뀌었어요" } });
  await waste().getByRole("button", { name: "폐기 기록 저장", exact: true }).click();
  await expect(waste().getByRole("button", { name: "재고 새로고침", exact: true })).toBeVisible();
  await expect(waste().getByRole("spinbutton", { name: "폐기량 (ea)", exact: true })).toHaveValue("1");
  await page.unroute("**/waste**");
  await waste().getByRole("button", { name: "재고 새로고침", exact: true }).click();
  await waste().getByRole("button", { name: "폐기 기록 저장", exact: true }).click();
  await expect(waste().getByRole("status", { name: "폐기 저장 결과" })).toContainText("이 묶음의 남은 양: 1ea");
  await checkResultLayout(waste(), "폐기 저장 결과");
  await expect(waste().getByRole("button", { name: "저장 완료", exact: true })).toBeDisabled();
  await capture("waste-result-375");
  await checkResultLayout(waste(), "폐기 저장 결과");
  await waste().getByRole("button", { name: "새 폐기 기록", exact: true }).click();
  await expect(waste().getByRole("radio").first()).not.toBeChecked();
  record("IT-USE-09 UI: excess guard, STOCK_CONFLICT fixture, draft/retry and server remaining result");
  for (const link of ["invalid", id(999)]) {
    await page.goto(`/waste?lotId=${link}`);
    await expect(waste().getByRole("alert")).toContainText("해당 묶음을 찾지 못했어요");
    await expect(waste().getByRole("radio" )).toHaveCount(0);
  }
  await waste().getByRole("combobox", { name: "폐기 재료", exact: true }).click();
  await page.getByRole("option", { name: "대파 (g)", exact: true }).click();
  await expect(waste().getByText("남은 입고 묶음이 없어요. 다른 재료를 선택해 주세요.", { exact: true })).toBeVisible();
  record("E2E-04 UI: malformed/missing lot link never chooses another lot, no-lot ingredient guidance");
  await page.goto("/waste?tab=waste");
  await waste().getByRole("combobox", { name: "폐기 재료", exact: true }).click();
  await page.getByRole("option", { name: "양파 (g)", exact: true }).click();
  await waste().getByRole("combobox", { name: "폐기 사유", exact: true }).click();
  await page.getByRole("option", { name: "변질", exact: true }).click();
  await waste().getByRole("spinbutton", { name: "폐기량 (g)", exact: true }).fill("10");
  await waste().getByRole("textbox", { name: "폐기 메모 (선택)", exact: true }).fill("포장 파손");
  await waste().getByRole("radio").first().check();
  await expect(waste().getByRole("spinbutton", { name: "폐기량 (g)", exact: true })).toHaveValue("10");
  await expect(waste().getByRole("combobox", { name: "폐기 사유", exact: true })).toHaveText("변질");
  await capture("manual-lot-preserves-375");
  record("E2E-04 UI D-1: manual lot choice preserves quantity/reason instead of taking the whole lot");
  await waste().getByRole("combobox", { name: "폐기 재료", exact: true }).click();
  await page.getByRole("option", { name: "계란 (ea)", exact: true }).click();
  await waste().getByRole("radio").first().check();
  await expect(waste().getByRole("spinbutton", { name: "폐기량 (ea)", exact: true })).toHaveValue("");
  await expect(waste().getByRole("textbox", { name: "폐기 메모 (선택)", exact: true })).toHaveValue("포장 파손");
  await expect(waste().getByRole("combobox", { name: "폐기 사유", exact: true })).toHaveText("변질");
  record("E2E-04 UI D-5: ingredient change keeps memo/reason and clears only lot/quantity");
  await waste().getByRole("spinbutton", { name: "폐기량 (ea)", exact: true }).fill("10");
  await replaceAction({ ok: false, error: { code: "NOT_FOUND", message: "재고 묶음을 찾지 못했어요" } });
  await waste().getByRole("button", { name: "폐기 기록 저장", exact: true }).click();
  await expect(waste().getByRole("button", { name: "재고 새로고침", exact: true })).toBeVisible();
  await page.unroute("**/waste**");
  await waste().getByRole("button", { name: "재고 새로고침", exact: true }).click();
  await expect(waste().getByRole("textbox", { name: "폐기 메모 (선택)", exact: true })).toHaveValue("포장 파손");
  await expect(waste().getByRole("spinbutton", { name: "폐기량 (ea)", exact: true })).toHaveValue("10");
  record("E2E-04 UI D-6: NOT_FOUND offers stock refresh while preserving draft");

  await page.goto("/waste?from=2026-11-01&to=2026-11-03");
  await expect(page.getByRole("list", { name: "사용·폐기 이력" }).getByRole("listitem")).toHaveCount(3);
  const history = page.getByRole("form", { name: "기록 조회 조건" });
  await history.getByRole("combobox", { name: "기록 종류", exact: true }).click();
  await page.getByRole("option", { name: "사용", exact: true }).click();
  await history.getByRole("button", { name: "기록 조회", exact: true }).click();
  await expect(page).toHaveURL(/type=usage/);
  await expect(page.getByRole("list", { name: "사용·폐기 이력" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "사용·폐기 이력" })).toContainText("부족 100g");
  await history.getByLabel("조회 시작일", { exact: true }).fill("2026-10-01");
  await history.getByRole("button", { name: "기록 조회", exact: true }).click();
  await expect(history.getByText("한 번에 31일까지 조회할 수 있어요", { exact: true })).toBeVisible();
  await page.goto("/waste?from=2025-01-01&to=2025-01-01");
  await expect(page.getByText("조건에 맞는 기록이 없어요", { exact: true })).toBeVisible();
  record("E2E-04 UI: history range/type URL, shortage history, 31-day validation and empty state");

  await page.goto("/waste");
  await pickUsage(1, "양파 (g)");
  await usage().getByRole("spinbutton", { name: "사용량 1 (g)", exact: true }).fill("3");
  await usage().getByRole("textbox", { name: "메모 1 (선택)", exact: true }).fill("인증 복구 확인");
  authExpired = true;
  await usage().getByRole("button", { name: "사용 기록 저장", exact: true }).click();
  await expect(usage().getByRole("button", { name: "기록 새로고침", exact: true })).toHaveCount(0);
  const lookup = usage().getByRole("link", { name: "기록 확인 (새 창)", exact: true });
  await expect(lookup).toHaveAttribute("target", "_blank");
  const lookupPromise = context.waitForEvent("page"); await lookup.click(); const lookupPage = await lookupPromise;
  await lookupPage.waitForURL((url) => url.pathname === "/login");
  await expect(page).toHaveURL(`${baseURL}/waste`);
  await expect(usage().getByRole("textbox", { name: "메모 1 (선택)", exact: true })).toHaveValue("인증 복구 확인");
  await lookupPage.close();
  record("E2E-04 UI D-3: expired-session record lookup opens another window and preserves the original form");
  const login = usage().getByRole("link", { name: "다시 로그인 (새 창)", exact: true });
  await expect(login).toHaveAttribute("target", "_blank");
  const popupPromise = context.waitForEvent("page"); await login.click(); const popup = await popupPromise;
  await popup.waitForURL(`${baseURL}/login`);
  await expect(usage().getByRole("textbox", { name: "메모 1 (선택)", exact: true })).toHaveValue("인증 복구 확인");
  await restoreAuth(); await popup.close();
  await usage().getByRole("button", { name: "사용 기록 저장", exact: true }).click();
  await expect(usage().getByRole("status", { name: "사용 저장 결과" })).toContainText("사용 기록을 저장했어요");
  record("E2E-04 UI: proxy auth expiry, new-window login, draft preservation and retry");

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`/waste?lotId=${id(202)}`);
  await capture("waste-1024");
  await page.getByRole("tab", { name: "폐기", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "사용", exact: true })).toBeFocused();
  await capture("usage-1024");
  assert.deepEqual(errors, []);
  record("E2E-04 UI: 375x812/1024 layouts, touch targets, no overflow and keyboard tabs");
  await writeFile(path.join(output, "result.json"), JSON.stringify({ checks, viewport: "375x812 + 1024x900", server: "project ingredient/usage/history stubs", auth: "local HTTP fixture", responseFixtures: "shortages + STOCK_CONFLICT + NOT_FOUND; not actual DB behavior", screenshots: "unaltered fixed layout/current scroll", resultLayouts, posts, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output }, null, 2));
} catch (error) {
  if (browser) { const page = browser.contexts()[0]?.pages()[0]; if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {}); }
  throw error;
} finally {
  await browser?.close(); child.kill(); await writeFile(path.join(output, "next.log"), logs);
  mock.closeAllConnections(); await new Promise((resolve) => mock.close(resolve));
}
