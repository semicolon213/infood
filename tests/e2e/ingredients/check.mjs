// 3.1a 화면 연결 점검. 재료 조회/변경은 프로젝트의 실제 stub을 호출한다.
// 인증 사용자·매장 조회만 로컬 HTTP fixture로 제공한다. 실제 DB/AI를 호출하지 않는다.
// UI-ING-BROWSER는 이 화면 점검의 로컬 이름이며, 공식 IT-ING/E2E 종료 기준에 합산하지 않는다.
// 실행: node tests/e2e/ingredients/check.mjs (별도 pnpm dev 불필요)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
const expect = baseExpect.configure({ timeout: 120_000 });

const port = Number(process.env.INGREDIENT_UI_PORT ?? 3151);
const authPort = Number(process.env.INGREDIENT_AUTH_PORT ?? 54491);
const baseURL = `http://127.0.0.1:${port}`;
const authURL = `http://127.0.0.1:${authPort}`;
const userId = "00000000-0000-4000-8000-000000000001";
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "ui-check@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
const mock = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/v1/user") return res.end(JSON.stringify(user));
  if (req.url?.startsWith("/rest/v1/stores?")) return res.end(JSON.stringify([{ id: "00000000-0000-4000-8000-000000000002", name: "화면 점검 매장" }]));
  res.statusCode = 404; res.end(JSON.stringify({ message: "Unknown fixture endpoint" }));
});
mock.listen(authPort, "127.0.0.1");
await once(mock, "listening");
let logs = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, AI_MOCK: "1", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: authURL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-anon-key" },
});
child.stdout.on("data", (chunk) => { logs += chunk; process.stdout.write(chunk); });
child.stderr.on("data", (chunk) => { logs += chunk; process.stderr.write(chunk); });
let browser;
const checks = [];
const record = (message) => { checks.push(message); console.log(`PASS ${message}`); };
const output = path.resolve("test-results/ingredients-ui-check");
await mkdir(output, { recursive: true });
try {
  const deadline = Date.now() + 120_000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${child.exitCode}\n${logs}`);
    try { if ((await fetch(`${baseURL}/login`, { signal: AbortSignal.timeout(10_000) })).ok) break; } catch { /* 구동 대기 */ }
    if (Date.now() > deadline) throw new Error(`Next readiness timeout\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const cookies = new Map();
  const client = createServerClient(authURL, "test-public-anon-key", { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)) } });
  const tokenPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${tokenPart({ alg: "HS256", typ: "JWT" })}.${tokenPart({ sub: userId, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.${Buffer.from("fixture-signature").toString("base64url")}`;
  const session = await client.auth.setSession({ access_token: token, refresh_token: "fixture-refresh-token" });
  assert.equal(session.error, null);
  // 화면 검사 제한 시간에 첫 Turbopack 컴파일 시간을 섞지 않는다.
  const cookieHeader = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  for (const route of ["/ingredients", "/ingredients/00000000-0000-4000-8000-000000000102", "/ingredients/00000000-0000-4000-8000-000000000102/edit", "/ingredients/new", "/ingredients/preview"]) {
    const response = await fetch(`${baseURL}${route}`, { headers: { Cookie: cookieHeader }, signal: AbortSignal.timeout(120_000) });
    assert.equal(response.status, 200, `warmup ${route}`);
    await response.text();
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 }, locale: "ko-KR", timezoneId: "Asia/Seoul", isMobile: true, hasTouch: true });
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: baseURL })));
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  // Windows의 첫 Turbopack 컴파일은 화면 응답과 별도로 충분히 기다린다.
  page.setDefaultNavigationTimeout(120_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const capture = async (name, fullPage = true) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    // Checkbox는 Radix의 숨긴 native input 대신 클릭 가능한 Label 영역을 측정한다.
    const smallTargets = await page.locator('main button:not([role="checkbox"]), main a, main input:not([type="checkbox"]), main label:has([role="checkbox"]), main [role="combobox"], [role="option"]').evaluateAll((elements) => elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44) ? [{ text: element.textContent, width: rect.width, height: rect.height }] : [];
    }));
    assert.deepEqual(smallTargets, [], `${name}: touch target under 44px`);
    // 전체 페이지 기록에서 고정 바가 콘텐츠 중간을 가리지 않게 촬영 중에만 배치한다.
    const style = "nextjs-portal { display: none; }" + (fullPage
      ? 'header.sticky, form > .sticky, nav[aria-label="주요 메뉴"] { position: static !important; }' : "");
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage, style });
  };
  const list = () => page.getByRole("list", { name: "재료 목록" });
  await page.goto("/ingredients?status=low");
  await expect(page.getByRole("button", { name: "부족", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(list().getByRole("listitem")).toHaveCount(2);
  await expect(list()).toContainText("대파");
  record("UI-ING-BROWSER: direct status=low link");
  await page.getByRole("textbox", { name: "재료 이름 검색" }).fill("대파");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(list().getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "재료 이름 검색" })).toHaveValue("대파");
  await expect(list().getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "냉동", exact: true }).click();
  await expect(page.getByRole("heading", { name: "조건에 맞는 재료가 없어요" })).toBeVisible();
  await page.getByRole("button", { name: "검색·필터 초기화" }).click();
  await expect(list().getByRole("listitem")).toHaveCount(6);
  await capture("catalog-375");
  record("UI-ING-BROWSER: search, reload, storage, empty/reset");
  await page.getByRole("link", { name: "두부 상세 보기" }).click();
  await expect(page.getByRole("heading", { name: "입고 묶음 2개" })).toBeVisible();
  await expect(page.getByRole("button", { name: "재료 비활성화" })).toBeDisabled();
  await expect(page.getByRole("listitem").first()).toContainText("2026-11-02");
  await expect(page.getByRole("listitem").filter({ hasText: "D-1" }).getByText("D-1", { exact: true })).toHaveClass(/border-destructive/);
  await capture("detail-375");
  record("UI-ING-BROWSER: remaining stock guard, lot order, expired lot");
  await page.getByRole("link", { name: "재료 정보 수정" }).click();
  await expect(page.getByRole("textbox", { name: "카테고리 (선택)" })).toHaveValue("가공");
  await expect(page.getByRole("combobox", { name: "기본 단위" })).toBeDisabled();
  await page.getByRole("textbox", { name: "재료 이름" }).fill("두부 수정 확인");
  await page.getByRole("button", { name: "재료 저장" }).click();
  await expect(page).toHaveURL(/\/ingredients\/00000000-0000-4000-8000-000000000102$/);
  await expect(page.getByText("재료 정보를 수정했어요", { exact: true })).toBeVisible();
  record("UI-ING-BROWSER: edit action and navigation (stub)");
  await page.goto("/ingredients/00000000-0000-4000-8000-000000000104");
  await expect(page.getByRole("listitem").getByText("D-2", { exact: true })).toHaveClass(/bg-status-soon/);
  await capture("soon-detail-375");
  record("UI-ING-BROWSER: urgent and soon lots use status badges");
  await page.goto("/ingredients/new");
  await page.getByRole("textbox", { name: "재료 이름" }).fill("검증");
  await page.getByRole("spinbutton", { name: "최소 재고" }).fill("");
  await page.getByRole("spinbutton", { name: "적정 재고" }).fill("-1");
  await page.getByRole("spinbutton", { name: "기본 보관일수 (일)" }).fill("1.5");
  for (const [unitName, factor] of [["KG", "0"], ["단", "1"], [" 단", "-3"]]) {
    await page.getByRole("button", { name: /환산 단위 추가/ }).click();
    await page.getByRole("textbox", { name: "단위 이름", exact: true }).last().fill(unitName);
    await page.getByRole("spinbutton", { name: "1단위당 g", exact: true }).last().fill(factor);
  }
  await page.getByRole("button", { name: "재료 저장" }).click();
  for (const message of ["숫자를 입력해 주세요", "0 이상으로 입력해 주세요", "1~3650 사이의 정수로 입력해 주세요", "기본 단위는 환산 단위로 쓸 수 없어요", "같은 단위 이름이 있어요"]) {
    await expect(page.getByText(message, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("0보다 큰 값을 입력해 주세요", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "환산 단위 1 삭제", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "최소 재고" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("0 이상으로 입력해 주세요", { exact: true })).toBeVisible();
  await expect(page.getByText("1~3650 사이의 정수로 입력해 주세요", { exact: true })).toBeVisible();
  record("UI-ING-BROWSER: all field errors appear together and unit removal preserves other errors");
  await page.goto("/ingredients/new");
  await page.getByRole("button", { name: "재료 저장" }).click();
  await expect(page.getByText("재료 이름을 입력해 주세요", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "재료 이름" }).fill("양파");
  await page.getByRole("spinbutton", { name: "기본 보관일수 (일)" }).fill("7");
  await page.getByRole("button", { name: "재료 저장" }).click();
  await expect(page.getByRole("textbox", { name: "재료 이름" })).toHaveValue("양파");
  await expect(page.getByRole("textbox", { name: "재료 이름" })).toHaveAttribute("aria-invalid", "true");
  record("UI-ING-BROWSER: required fields and server duplicate preserve draft");
  await page.getByRole("textbox", { name: "재료 이름" }).fill("검증용 새 재료");
  await page.getByRole("spinbutton", { name: "최소 재고" }).fill("100");
  await page.getByRole("spinbutton", { name: "적정 재고" }).fill("50");
  await page.getByRole("button", { name: "재료 저장" }).click();
  await expect(page.getByText("적정 재고는 최소 재고 이상이어야 해요", { exact: true })).toBeVisible();
  await page.getByRole("spinbutton", { name: "적정 재고" }).fill("200");
  await page.getByRole("button", { name: /환산 단위 추가/ }).click();
  await page.getByRole("textbox", { name: "단위 이름" }).fill("단");
  await page.getByRole("spinbutton", { name: "1단위당 g" }).fill("800");
  await capture("form-375");
  await page.getByRole("combobox", { name: "보관 방식" }).click();
  await expect(page.getByRole("option", { name: "냉동 (-18℃ 이하)" })).toBeVisible();
  await capture("select-options-375", false);
  await page.getByRole("option", { name: "냉동 (-18℃ 이하)" }).click();
  await page.getByRole("checkbox", { name: "유통기한 추적" }).uncheck();
  await expect(page.getByRole("spinbutton", { name: "기본 보관일수 (일)" })).toHaveCount(0);
  await page.route("**/ingredients/new", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "재료 저장" }).click();
  await expect(page.getByText("저장하지 못했어요. 입력한 내용은 그대로예요. 다시 시도해 주세요", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "재료 이름" })).toHaveValue("검증용 새 재료");
  await page.unroute("**/ingredients/new");
  record("UI-ING-BROWSER: failed network preserves draft and allows retry");
  await page.getByRole("button", { name: "재료 저장" }).click();
  await expect(page).toHaveURL(`${baseURL}/ingredients`);
  await expect(page.getByText("재료를 등록했어요", { exact: true })).toBeVisible();
  record("UI-ING-BROWSER: form, unit, expiry toggle, create action (stub)");
  await page.goto("/ingredients/00000000-0000-4000-8000-000000000103");
  await page.getByRole("button", { name: "재료 비활성화" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog").getByRole("button")).toHaveCount(2);
  // 열림 확대 애니메이션이 끝난 실제 터치 영역을 확인한다.
  await expect.poll(() => page.getByRole("dialog").getByRole("button").evaluateAll((buttons) => buttons.every((button) => {
    const { width, height } = button.getBoundingClientRect();
    return width >= 44 && height >= 44;
  }))).toBe(true);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "재료 비활성화" }).click();
  await page.getByRole("button", { name: "비활성화", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/ingredients`);
  record("UI-ING-BROWSER: zero-stock deactivate confirm/cancel/action (stub)");
  for (const id of ["invalid-id", "00000000-0000-4000-8000-000000000999"]) {
    for (const suffix of ["", "/edit"]) {
      await page.goto(`/ingredients/${id}${suffix}`);
      // loading.tsx 경계로 먼저 스트리밍되면 HTTP 200이어도 not-found UI가 렌더링된다.
      await expect(page.getByRole("heading", { name: "재료를 찾지 못했어요", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "재료 목록", exact: true }).click();
      await expect(page).toHaveURL(`${baseURL}/ingredients`);
    }
  }
  record("UI-ING-BROWSER: invalid and missing IDs show Korean not-found and return links in detail/edit");
  await page.goto("/ingredients/preview");
  await page.getByRole("button", { name: "우유 상세 보기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "우유", exact: true })).toBeVisible();
  await capture("milk-detail-375");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ viewport: "375x812", auth: "local HTTP fixture", ingredients: "actual project stubs, no DB persistence", checks, pageErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, screenshots: output, checks }, null, 2));
} catch (error) {
  console.error(error);
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
      await page.content().then((html) => writeFile(path.join(output, "failure.html"), html)).catch(() => {});
    }
  }
  throw error;
} finally {
  await browser?.close();
  child.kill();
  await writeFile(path.join(output, "next.log"), logs);
  mock.closeAllConnections();
  await new Promise((resolve) => mock.close(resolve));
}
