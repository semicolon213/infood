// 3.2a / E2E-02의 화면·계약 연결 보조 점검. 실제 DB 통합 E2E와 구분한다.
// 인증·PostgREST는 로컬 HTTP fixture, 재료 조회는 프로젝트의 3.1b 이전 stub.
// 실행: node tests/e2e/menus/check.mjs (별도 dev 서버 불필요, 실제 AI/DB 호출 없음)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

const expect = baseExpect.configure({ timeout: 30_000 });
const port = Number(process.env.MENU_UI_PORT ?? 3152);
const apiPort = Number(process.env.MENU_API_PORT ?? 54492);
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const storeId = id(2);
const user = { id: id(1), aud: "authenticated", role: "authenticated", email: "menu-check@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
const ingredients = [{ id: id(101), name: "양파", unit: "g", store_id: storeId, is_active: true }, { id: id(105), name: "계란", unit: "ea", store_id: storeId, is_active: true }];
const menus = [];
const recipes = [];
let sequence = 900;
let writes = 0;
let failRead = false;
let failDeactivate = false;
let authExpired = false;
const requests = [];
function matches(row, params) {
  for (const [key, value] of params) {
    if (value.startsWith("eq.") && String(row[key]) !== value.slice(3)) return false;
    if (value.startsWith("in.(") && !value.slice(4, -1).split(",").includes(String(row[key]))) return false;
  }
  return true;
}
const fixture = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, apiURL);
  const send = (data, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  const replyRows = (rows) => send(req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows);
  if (url.pathname === "/auth/v1/user") return authExpired ? send({ code: "bad_jwt", message: "JWT expired" }, 401) : send(user);
  if (url.pathname === "/rest/v1/stores") return send([{ id: storeId, name: "메뉴 화면 점검 매장" }]);
  const table = url.pathname.replace("/rest/v1/", "");
  if (!["menus", "ingredients", "recipe_items"].includes(table)) return send({ message: "Unknown fixture endpoint" }, 404);
  let body;
  if (req.method !== "GET") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString() || "null");
    requests.push({ table, method: req.method, body: structuredClone(body) });
    writes++;
  }
  if (table === "ingredients") return send(ingredients.filter((item) => matches(item, url.searchParams)).map((item) => ({ id: item.id })));
  if (table === "menus") {
    const selectedId = url.searchParams.get("id")?.replace("eq.", "");
    const rows = menus.filter((menu) => matches(menu, url.searchParams));
    if (req.method === "GET") {
      if (failRead) return send({ code: "fixture-read-failed", message: "fixture read error" }, 500);
      return replyRows(rows.map((menu) => ({ ...menu, recipe_items: recipes.filter((row) => row.menu_id === menu.id).map((row) => ({ qty: row.qty, ingredients: ingredients.find((item) => item.id === row.ingredient_id) ?? { id: row.ingredient_id, name: "숨겨진 재료", unit: "g" } })) })));
    }
    if (req.method === "POST" || req.method === "PATCH") {
      if (body.price !== undefined && (!Number.isInteger(body.price) || body.price < 0 || body.price > 2_147_483_647)) return send({ code: "22003" }, 400);
      if (failDeactivate && body.is_active === false) return send({ code: "fixture-deactivate-failed" }, 500);
      if (body.name && menus.some((menu) => menu.name === body.name && menu.id !== selectedId)) return send({ code: "23505" }, 409);
      // 중복 클릭 방지와 저장 중 잠김을 관찰할 수 있도록 fixture 응답을 잠깐 늦춘다.
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (req.method === "POST") {
        const menu = { id: id(sequence++), store_id: storeId, is_active: true, is_special: false, ...body };
        menus.push(menu);
        return replyRows([menu]);
      }
      rows.forEach((row) => Object.assign(row, body));
      return replyRows(rows);
    }
  }
  if (table === "recipe_items") {
    if (req.method === "POST") {
      // numeric(12,3) 저장 제약 일부를 모사한다. 실제 PostgreSQL 검증을 대신하지 않는다.
      const rows = body.map((item) => ({ ...item, qty: Math.round(item.qty * 1000) / 1000 }));
      if (rows.some((item) => !Number.isFinite(item.qty) || item.qty <= 0 || item.qty > 999_999_999.999)) return send({ code: "23514" }, 400);
      if (rows.some((item) => item.store_id !== storeId || !menus.some((menu) => menu.id === item.menu_id && menu.store_id === item.store_id) || !ingredients.some((ingredient) => ingredient.id === item.ingredient_id && ingredient.store_id === item.store_id))) return send({ code: "23503" }, 400);
      for (const item of rows) {
        const row = recipes.find((row) => row.menu_id === item.menu_id && row.ingredient_id === item.ingredient_id);
        if (row) Object.assign(row, item); else recipes.push(structuredClone(item));
      }
      res.statusCode = 201;
      return res.end();
    }
    if (req.method === "DELETE") {
      const menuId = url.searchParams.get("menu_id")?.replace("eq.", "");
      const keep = url.searchParams.get("ingredient_id") ?? "";
      for (let index = recipes.length - 1; index >= 0; index--) if (recipes[index].menu_id === menuId && !keep.includes(recipes[index].ingredient_id)) recipes.splice(index, 1);
      res.statusCode = 204;
      return res.end();
    }
  }
  return send({ message: "Unexpected fixture request" }, 400);
});

fixture.listen(apiPort, "127.0.0.1");
await once(fixture, "listening");
let logs = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, AI_MOCK: "1", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: apiURL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-anon-key" },
});
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });
let browser;
const checks = [];
const record = (message) => { checks.push(message); console.log(`PASS ${message}`); };
const output = path.resolve("test-results/menus-ui-check");
await mkdir(output, { recursive: true });
try {
  const deadline = Date.now() + 120_000;
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
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: baseURL })));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const capture = async (name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    // Radix 열림 애니메이션의 scale이 끝난 실제 터치 영역을 측정한다.
    await expect.poll(() => page.locator('[role="option"], [role="dialog"] button').evaluateAll((elements) => elements.every((element) => {
      const rect = element.getBoundingClientRect();
      return !rect.width || !rect.height || (rect.width >= 44 && rect.height >= 44);
    }))).toBe(true);
    const smallTargets = await page.locator('main button, main a, main input, main [role="combobox"], [role="option"], [role="dialog"] button').evaluateAll((elements) => elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44) ? [{ text: element.textContent, width: rect.width, height: rect.height }] : [];
    }));
    assert.deepEqual(smallTargets, [], `${name}: touch target under 44px`);
    const overlay = await page.locator('[role="option"], [role="dialog"]').count() > 0;
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: !overlay, style: 'nextjs-portal, [data-sonner-toaster] { display: none; }' + (overlay ? "" : 'header.sticky, form > .sticky, nav[aria-label="주요 메뉴"] { position: static !important; }') });
  };

  await page.goto("/menus");
  await expect(page.getByText("아직 등록한 메뉴가 없어요", { exact: true })).toBeVisible();
  await capture("empty-375");
  record("E2E-02 UI: empty menu catalog and registration link");
  await page.getByRole("link", { name: "첫 메뉴 등록하기" }).click();
  await page.getByRole("button", { name: "레시피 재료 추가" }).click();
  const beforeInvalid = writes;
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  for (const message of ["메뉴 이름을 입력해 주세요", "판매가를 입력해 주세요", "소요량을 입력해 주세요"]) await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "레시피 재료 1", exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("textbox", { name: "메뉴 이름", exact: true })).toBeFocused();
  assert.equal(writes, beforeInvalid);
  record("E2E-02 UI: simultaneous validation and no mutation on invalid input");
  record("E2E-02 UI D-5: first invalid field receives focus in screen order");
  await page.getByRole("combobox", { name: "레시피 재료 1", exact: true }).click();
  await page.getByRole("option", { name: "양파 (g)", exact: true }).click();
  await page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true }).fill("30");
  await page.getByRole("button", { name: "레시피 재료 추가" }).click();
  await page.getByRole("button", { name: "레시피 재료 추가" }).click();
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByRole("form").locator('[aria-invalid="true"]')).toHaveCount(6);
  await page.getByRole("combobox", { name: "레시피 재료 2", exact: true }).click();
  await page.getByRole("option", { name: "계란 (ea)", exact: true }).click();
  await expect(page.getByRole("form").locator('[aria-invalid="true"]')).toHaveCount(5);
  await expect(page.getByRole("spinbutton", { name: "1인분 소요량 2 (ea)", exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "레시피 재료 1 삭제", exact: true }).click();
  await expect(page.getByRole("form").locator('[aria-invalid="true"]')).toHaveCount(5);
  await expect(page.getByRole("spinbutton", { name: "1인분 소요량 1 (ea)", exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("combobox", { name: "레시피 재료 2", exact: true })).toHaveAttribute("aria-invalid", "true");
  await capture("error-scope-after-delete-375");
  record("E2E-02 UI D-4: ingredient change preserves other errors and row removal remaps them");
  await page.goto("/menus/new");
  await page.getByRole("button", { name: "레시피 재료 추가" }).click();
  await page.getByRole("textbox", { name: "메뉴 이름", exact: true }).fill("검증용 계란말이");
  await page.getByRole("spinbutton", { name: "판매가 (원)", exact: true }).fill("8000");
  await page.getByRole("combobox", { name: "레시피 재료 1", exact: true }).click();
  await expect(page.getByRole("option", { name: "양파 (g)", exact: true })).toBeVisible();
  await capture("ingredient-options-375");
  await page.getByRole("option", { name: "양파 (g)", exact: true }).click();
  await page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true }).fill("30.125");
  await page.getByRole("button", { name: "레시피 재료 추가" }).click();
  await page.getByRole("combobox", { name: "레시피 재료 2", exact: true }).click();
  await expect(page.getByRole("option", { name: "양파 (g)", exact: true })).toHaveAttribute("data-disabled", "");
  await page.getByRole("option", { name: "계란 (ea)", exact: true }).click();
  await page.getByRole("spinbutton", { name: "1인분 소요량 2 (ea)", exact: true }).fill("0");
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByRole("spinbutton", { name: "1인분 소요량 2 (ea)", exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("spinbutton", { name: "1인분 소요량 2 (ea)", exact: true }).fill("2");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  const beforeBoundary = writes;
  for (const qty of ["0.0004", "0.0015"]) {
    await page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true }).fill(qty);
    await page.getByRole("button", { name: "메뉴 저장" }).click();
    await expect(page.getByText("소요량은 소수 셋째 자리까지 입력해 주세요", { exact: true })).toBeVisible();
    assert.equal(writes, beforeBoundary);
  }
  await page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true }).fill("30.125");
  for (const price of ["3000000000", "1e3"]) {
    await page.getByRole("spinbutton", { name: "판매가 (원)", exact: true }).fill(price);
    await page.getByRole("button", { name: "메뉴 저장" }).click();
    await expect(page.getByRole("spinbutton", { name: "판매가 (원)", exact: true })).toHaveAttribute("aria-invalid", "true");
    assert.equal(writes, beforeBoundary);
  }
  await page.getByRole("spinbutton", { name: "판매가 (원)", exact: true }).fill("8000");
  await capture("form-375");
  record("E2E-02 UI: ingredient units, decimal quantity, duplicate prevention and zero rejection");
  record("E2E-02 UI D-3/D-6/D-7: precision, price overflow and exponent notation rejected before mutation");
  await page.route("**/menus/new", async (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByText("저장하지 못했어요. 입력한 내용은 그대로예요. 다시 시도해 주세요", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "메뉴 이름", exact: true })).toHaveValue("검증용 계란말이");
  await expect(page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true })).toHaveValue("30.125");
  await page.unroute("**/menus/new");
  record("E2E-02 UI: failed network preserves draft and allows retry");
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByRole("button", { name: "저장하고 있어요", exact: true })).toBeDisabled();
  await expect(page).toHaveURL(new RegExp(`/menus/${id(900)}$`));
  await expect(page.getByRole("list", { name: "레시피 재료" })).toContainText("30.125g");
  await expect(page.getByRole("list", { name: "레시피 재료" })).toContainText("2ea");
  assert.equal(requests.filter((request) => request.table === "menus" && request.method === "POST").length, 1);
  assert.deepEqual(recipes.map((row) => row.qty), [30.125, 2]);
  await capture("detail-375");
  record("E2E-02 UI: create action payload, single submission, detail after save (HTTP fixture)");
  await page.goto("/menus/new");
  await page.getByRole("textbox", { name: "메뉴 이름", exact: true }).fill("검증용 계란말이");
  await page.getByRole("spinbutton", { name: "판매가 (원)", exact: true }).fill("9000");
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByRole("textbox", { name: "메뉴 이름", exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("spinbutton", { name: "판매가 (원)", exact: true })).toHaveValue("9000");
  record("E2E-02 UI: server CONFLICT maps to name and preserves price");
  await page.goto("/menus/new");
  await page.getByRole("textbox", { name: "메뉴 이름", exact: true }).fill("재료 검증 확인");
  await page.getByRole("spinbutton", { name: "판매가 (원)", exact: true }).fill("8000");
  await page.getByRole("button", { name: "레시피 재료 추가" }).click();
  await page.getByRole("combobox", { name: "레시피 재료 1", exact: true }).click();
  await page.getByRole("option", { name: "양파 (g)", exact: true }).click();
  await page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true }).fill("30");
  for (const [key, value] of [["store_id", id(999)], ["is_active", false], ["id", id(999)]]) {
    const original = ingredients[0][key];
    const before = writes;
    try {
      ingredients[0][key] = value;
      await page.getByRole("button", { name: "메뉴 저장" }).click();
      await expect(page.getByText("쓸 수 없는 재료예요", { exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "레시피 재료 1", exact: true })).toHaveAttribute("aria-invalid", "true");
      assert.equal(writes, before);
    } finally { ingredients[0][key] = original; }
  }
  record("E2E-02 UI D-8: fixture ingredient store/active/ID filters exercise server rejection");
  await page.goto(`/menus/${id(900)}/edit`);
  const beforePrecisionEdit = writes;
  await page.getByRole("textbox", { name: "메뉴 이름", exact: true }).fill("저장되면 안 되는 이름");
  await page.getByRole("spinbutton", { name: "1인분 소요량 1 (ea)", exact: true }).fill("0.0004");
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByText("소요량은 소수 셋째 자리까지 입력해 주세요", { exact: true })).toBeVisible();
  assert.equal(writes, beforePrecisionEdit);
  assert.equal(menus[0].name, "검증용 계란말이");
  await page.getByRole("spinbutton", { name: "1인분 소요량 1 (ea)", exact: true }).fill("2");
  record("E2E-02 UI D-3: invalid precision on edit cannot partially change menu name");
  await expect(page.getByRole("spinbutton", { name: "1인분 소요량 1 (ea)", exact: true })).toHaveValue("2");
  // 조회는 재료 이름 순이므로 계란 → 양파. 계란을 삭제하고 양파만 남긴다.
  await page.getByRole("button", { name: "레시피 재료 1 삭제", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true })).toHaveValue("30.125");
  await page.getByRole("spinbutton", { name: "1인분 소요량 1 (g)", exact: true }).fill("45");
  await page.getByRole("textbox", { name: "메뉴 이름", exact: true }).fill("수정한 계란말이");
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByRole("heading", { name: "수정한 계란말이", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "레시피 재료" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("list", { name: "레시피 재료" })).toContainText("45g");
  const firstRecipeWrite = requests.find((request) => request.table === "recipe_items" && request.method === "POST");
  assert.equal(firstRecipeWrite.body[0].qty, 30.125);
  record("E2E-02 UI: edit prefill, row removal, replacement payload and refreshed detail");
  record("E2E-02 UI D-8: original request evidence remains unchanged after later upsert");
  await page.getByRole("button", { name: "메뉴 비활성화", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  assert.equal(menus[0].is_active, true);
  await page.getByRole("button", { name: "메뉴 비활성화", exact: true }).click();
  failDeactivate = true;
  await page.getByRole("button", { name: "비활성화", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("저장하지 못했어요");
  await capture("deactivate-error-375");
  failDeactivate = false;
  await page.getByRole("button", { name: "비활성화", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/menus`);
  await expect(page.getByRole("list", { name: "메뉴 목록" })).toContainText("비활성");
  await capture("catalog-375");
  await page.getByRole("link", { name: "수정한 계란말이 상세 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "메뉴 비활성화", exact: true })).toBeDisabled();
  record("E2E-02 UI: deactivate confirm/cancel, failure/retry and inactive state");
  for (const suffix of ["invalid-id", `${id(999)}`, `${id(999)}/edit`]) {
    await page.goto(`/menus/${suffix}`);
    await expect(page.getByRole("heading", { name: "메뉴를 찾지 못했어요", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "메뉴 목록", exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/menus`);
  }
  record("E2E-02 UI: malformed/missing IDs show Korean not-found and return links");
  await page.goto("/menus/new");
  await page.getByRole("textbox", { name: "메뉴 이름", exact: true }).fill("인증 복구 확인");
  await page.getByRole("spinbutton", { name: "판매가 (원)", exact: true }).fill("5000");
  const beforeAuth = writes;
  authExpired = true;
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  const login = page.getByRole("link", { name: "다시 로그인 (새 창)", exact: true });
  await expect(login).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("textbox", { name: "메뉴 이름", exact: true })).toHaveValue("인증 복구 확인");
  assert.equal(writes, beforeAuth);
  await capture("auth-expired-375");
  const popupPromise = context.waitForEvent("page");
  await login.click();
  const popup = await popupPromise;
  await popup.waitForURL(`${baseURL}/login`);
  await expect(popup.getByRole("button", { name: "로그인 링크 받기", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "메뉴 이름", exact: true })).toHaveValue("인증 복구 확인");
  authExpired = false;
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: baseURL })));
  await popup.close();
  await page.getByRole("button", { name: "메뉴 저장" }).click();
  await expect(page.getByRole("heading", { name: "인증 복구 확인", exact: true })).toBeVisible();
  record("E2E-02 UI D-2: proxy auth expiry exposes new-window login, preserves draft and retries");
  await page.getByRole("button", { name: "메뉴 비활성화", exact: true }).click();
  authExpired = true;
  await page.getByRole("button", { name: "비활성화", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "다시 로그인 (새 창)", exact: true })).toHaveAttribute("target", "_blank");
  authExpired = false;
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: baseURL })));
  await page.getByRole("button", { name: "비활성화", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/menus`);
  record("E2E-02 UI D-2: deactivate exposes login recovery after proxy redirect and retries");
  failRead = true;
  await page.goto("/menus");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("메뉴 정보를 불러오지 못했어요");
  await expect(page.getByText("아직 등록한 메뉴가 없어요", { exact: true })).toHaveCount(0);
  failRead = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("list", { name: "메뉴 목록" })).toContainText("수정한 계란말이");
  record("E2E-02 UI: query failure stays distinct from empty and retries successfully");
  // 위의 조회 실패는 의도적으로 오류 경계를 실행한다.
  const unexpected = pageErrors.filter((message) => !message.includes("fixture read error") && !message.includes("fixture-read-failed"));
  assert.deepEqual(unexpected, []);
  await page.setViewportSize({ width: 1024, height: 900 });
  await capture("catalog-1024");
  await page.goto(`/menus/${id(900)}`);
  await expect(page.getByRole("heading", { name: "수정한 계란말이", exact: true })).toBeVisible();
  await capture("detail-1024");
  await page.goto(`/menus/${id(900)}/edit`);
  await expect(page.getByRole("textbox", { name: "메뉴 이름", exact: true })).toHaveValue("수정한 계란말이");
  await capture("edit-1024");
  await page.goto("/menus/new");
  await expect(page.getByRole("textbox", { name: "메뉴 이름", exact: true })).toHaveValue("");
  await capture("new-1024");
  record("E2E-02 UI: 375x812 touch targets/overflow and desktop layout");
  await writeFile(path.join(output, "result.json"), JSON.stringify({ checks, viewport: "375x812 + 1024x900", authAndDatabase: "local HTTP fixture, not real Supabase integration", pageErrors, requests }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output }, null, 2));
} catch (error) {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  child.kill();
  await writeFile(path.join(output, "next.log"), logs);
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
