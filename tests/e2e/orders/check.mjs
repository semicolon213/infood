// E2E-07 / IT-ORD 보조: 화면과 계약 연결 검사. 실제 DB/RLS/RPC 검증을 대신하지 않는다.
// 실행: node tests/e2e/orders/check.mjs. 운영 소스는 그대로 두고 복사본의 조회·액션만 fixture로 교체한다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";

const expect = baseExpect.configure({ timeout: 30_000 });
const root = process.cwd();
const output = path.resolve("test-results/orders-ui-check");
const appDir = path.resolve(process.env.ORDER_UI_APP_DIR ?? "test-results/orders-browser-app");
const port = Number(process.env.ORDER_UI_PORT ?? 3155);
const apiPort = Number(process.env.ORDER_API_PORT ?? 54495);
const baseURL = `http://127.0.0.1:${port}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const user = { id: id(1), aud: "authenticated", role: "authenticated", email: "order-check@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
const ingredients = [{ id: id(103), name: "대파", unit: "g" }, { id: id(104), name: "돼지고기(앞다리)", unit: "g" }, { id: id(105), name: "계란", unit: "ea" }];
const suggestion = { items: [
  { ingredientId: id(103), name: "대파", unit: "g", availableQty: 0, targetQty: 2000, pendingQty: 0, suggestedQty: 2000 },
  { ingredientId: id(104), name: "돼지고기(앞다리)", unit: "g", availableQty: 1200, targetQty: 4000, pendingQty: 1000, suggestedQty: 1800 },
] };
const orders = [{ id: id(601), orderDate: "2026-11-03", status: "draft", memo: "오전 배송", items: [{ ingredientId: id(103), name: "대파", unit: "g", qty: 2000 }] }];
const calls = [];
let sequence = 900;
let mutationError = null;
let readError = false;
let emptyIngredients = false;
let emptySuggestion = false;
const fail = (code, message, fields) => ({ ok: false, error: { code, message, ...(fields ? { fields } : {}) } });
const fixture = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const url = new URL(req.url, apiURL);
  const send = (data, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  if (url.pathname === "/auth/v1/user") return send(user);
  if (url.pathname === "/rest/v1/stores") return send([{ id: id(2), name: "발주 화면 점검 매장" }]);
  if (req.method === "GET") {
    if (readError) return send({ message: "read failed" }, 500);
    if (url.pathname === "/ingredients") return send(emptyIngredients ? [] : ingredients);
    if (url.pathname === "/draft") return send(emptySuggestion ? { items: [] } : suggestion);
    if (url.pathname === "/order") return send(orders.find((order) => order.id === url.searchParams.get("id")) ?? null);
    if (url.pathname === "/orders") return send(orders.filter((order) => (!url.searchParams.get("from") || order.orderDate >= url.searchParams.get("from")) && (!url.searchParams.get("to") || order.orderDate <= url.searchParams.get("to"))).toSorted((a, b) => b.orderDate.localeCompare(a.orderDate)).map((order) => ({ ...order, itemCount: order.items.length })));
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString() || "{}");
  calls.push({ endpoint: url.pathname, input });
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (mutationError) return send({ ok: false, error: mutationError });
  const order = orders.find((item) => item.id === input.id);
  if (url.pathname === "/save") {
    if (input.id && !order) return send(fail("NOT_FOUND", "발주 목록을 찾지 못했어요"));
    if (order && order.status !== "draft") return send(fail("CONFLICT", "작성중인 목록만 고칠 수 있어요"));
    const items = input.items.filter((item) => item.qty > 0).map((item) => ({ ...item, name: ingredients.find((i) => i.id === item.ingredientId).name, unit: ingredients.find((i) => i.id === item.ingredientId).unit }));
    const saved = { id: order?.id ?? id(sequence++), orderDate: input.orderDate, status: "draft", memo: input.memo || null, items };
    if (order) Object.assign(order, saved); else orders.push(saved);
    return send({ ok: true, data: { id: saved.id } });
  }
  if (!order) return send(fail("NOT_FOUND", "발주 목록을 찾지 못했어요"));
  if (url.pathname === "/status") {
    const allowed = { draft: ["ordered"], ordered: ["draft", "received"], received: [] };
    if (!allowed[order.status].includes(input.status)) return send(fail("CONFLICT", "지금 상태에서는 바꿀 수 없어요"));
    order.status = input.status;
    return send({ ok: true, data: { id: order.id, status: order.status } });
  }
  if (url.pathname === "/delete" && order.status === "draft") {
    orders.splice(orders.indexOf(order), 1);
    return send({ ok: true, data: { id: order.id } });
  }
  return send(fail("CONFLICT", "작성중인 목록만 지울 수 있어요"));
});

await mkdir(appDir, { recursive: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "src"), path.join(appDir, "src"), { recursive: true });
for (const file of ["package.json", "tsconfig.json", ".gitignore"]) await cp(path.join(root, file), path.join(appDir, file));
// 공용 의존성을 위한 넓은 Turbopack root와 별개로, Tailwind는 이 복사본의 src만 스캔한다.
const cssPath = path.join(appDir, "src/app/globals.css");
await writeFile(cssPath, (await readFile(cssPath, "utf8")).replace('@import "tailwindcss";', '@import "tailwindcss" source("../");'));
const dependencies = await realpath(path.join(root, "node_modules"));
try { await symlink(dependencies, path.join(appDir, "node_modules"), "junction"); } catch (error) { if (error.code !== "EEXIST") throw error; }
// 복사본 전용 설정. 대화형 업그레이드 안내는 자동 화면 검사를 중단하므로 복사본에서만 끈다.
// 원본 Next 버전·설정은 유지하며, 보안 업데이트 권고는 검토 기록에 별도로 남긴다.
await writeFile(path.join(appDir, "next.config.ts"), `export default { cacheComponents: false, experimental: { agentUpgrade: false }, turbopack: { root: ${JSON.stringify(path.dirname(dependencies))}, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } } };`);
const query = `async function query(endpoint: string, filter: Record<string, string | undefined> = {}) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(filter)) { if (value !== undefined) params.set(key, value); } const response = await fetch(${JSON.stringify(apiURL)} + endpoint + "?" + params, { cache: "no-store" }); if (!response.ok) throw new Error("fixture read failed"); return response.json(); }`;
await writeFile(path.join(appDir, "src/lib/queries/orders.ts"), `import "server-only"; import type { OrderDraft, OrderFilter, OrderSummary, OrderDetail } from "@/types/contracts"; ${query}
export async function getOrderDraft(): Promise<OrderDraft> { return query("/draft"); }
export async function getOrders(filter: OrderFilter = {}): Promise<OrderSummary[]> { return query("/orders", filter); }
export async function getOrder(id: string): Promise<OrderDetail | null> { return query("/order", { id }); }`);
await cp(path.join(root, "src/lib/queries/ingredients.ts"), path.join(appDir, "src/lib/queries/ingredients-original.ts"));
await writeFile(path.join(appDir, "src/lib/queries/ingredients.ts"), `import "server-only"; import type { IngredientFilter, IngredientSummary } from "@/types/contracts"; ${query}
export { getIngredient } from "./ingredients-original";
export async function getIngredients(filter: IngredientFilter = {}): Promise<IngredientSummary[]> { return query("/ingredients", filter); }`);
await writeFile(path.join(appDir, "src/actions/orders.ts"), `"use server";
import { IdInput, SaveOrderInput, SetOrderStatusInput } from "@/types/contracts";
import { validationFail, type ActionResult } from "@/lib/result";
async function call<T>(endpoint: string, input: unknown): Promise<ActionResult<T>> { return (await fetch(${JSON.stringify(apiURL)} + endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).json(); }
export async function saveOrder(input: SaveOrderInput): Promise<ActionResult<{ id: string }>> { const parsed = SaveOrderInput.safeParse(input); return parsed.success ? call("/save", parsed.data) : validationFail(parsed.error); }
export async function setOrderStatus(input: SetOrderStatusInput): Promise<ActionResult<{ id: string; status: SetOrderStatusInput["status"] }>> { const parsed = SetOrderStatusInput.safeParse(input); return parsed.success ? call("/status", parsed.data) : validationFail(parsed.error); }
export async function deleteOrder(input: IdInput): Promise<ActionResult<{ id: string }>> { const parsed = IdInput.safeParse(input); return parsed.success ? call("/delete", parsed.data) : validationFail(parsed.error); }`);

fixture.listen(apiPort, "127.0.0.1");
await once(fixture, "listening");
let logs = "";
const child = spawn(process.execPath, [path.join(dependencies, "next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: appDir, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, AI_MOCK: "1", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: apiURL, NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-public-anon-key" } });
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });
let browser;
const checks = [];
const record = (name) => { checks.push(name); console.log(`PASS ${name}`); };
try {
  const deadline = Date.now() + 180_000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${child.exitCode}\n${logs}`);
    try { if ((await fetch(`${baseURL}/login`, { signal: AbortSignal.timeout(5000) })).ok) break; } catch { /* 서버 구동 대기 */ }
    if (Date.now() > deadline) throw new Error(`Next readiness timeout\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const cookies = new Map();
  const client = createServerClient(apiURL, "test-public-anon-key", { cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)) } });
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.fixture`;
  assert.equal((await client.auth.setSession({ access_token: token, refresh_token: "fixture-refresh" })).error, null);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 812 }, locale: "ko-KR", timezoneId: "Asia/Seoul", isMobile: true, hasTouch: true });
  await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: baseURL })));
  await context.addInitScript(() => {
    window.orderClipboard = "";
    window.rejectOrderClipboard = false;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { if (window.rejectOrderClipboard) throw new Error("denied"); window.orderClipboard = text; } } });
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const capture = async (name) => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    // Dialog의 진입 scale 애니메이션이 끝난 뒤 실제 터치 영역을 확인한다.
    await expect.poll(() => page.locator('main button, main a, main input, main textarea, header a, [role="dialog"] button').evaluateAll((elements) => elements.flatMap((element) => { const r = element.getBoundingClientRect(); return r.width && r.height && (r.height < 44 || r.width < 44) ? [`${element.textContent}: ${r.width}x${r.height}`] : []; })), { message: `${name}: touch targets` }).toEqual([]);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  };
  const action = (name) => page.getByRole("dialog").getByRole("button", { name, exact: true });
  const status = (name) => expect(page.getByText(name, { exact: true })).toBeVisible();

  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "발주 목록", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "발주 기록 · 1건", exact: true })).toBeVisible();
  await capture("list-375");
  await page.goto("/orders?from=2026-11-18&to=2026-11-17");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("시작일은 종료일보다 늦을 수 없어요");
  record("E2E-07 보조: 목록·역전 기간 검증");

  await page.goto("/orders/new");
  await expect(page.getByLabel("품목 1 발주량 (g)", { exact: true })).toHaveValue("2000");
  await expect(page.getByLabel("품목 2 발주량 (g)", { exact: true })).toHaveValue("1800");
  await expect(page.getByLabel("발주일", { exact: true })).toHaveValue(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()));
  await expect(page.getByText("발주했지만 아직 안 온 양 1,000g (약 1kg)")).toBeVisible();
  await capture("new-375");
  record("E2E-07 보조: 권장량·미입고량·KST 오늘 표시");

  await page.getByLabel("품목 1 발주량 (g)", { exact: true }).fill("0.0001");
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).click();
  await expect(page.getByText("발주량은 소수 셋째 자리까지 입력해 주세요")).toBeVisible();
  assert.equal(calls.length, 0);
  await page.getByLabel("품목 1 발주량 (g)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "품목 추가", exact: true }).click();
  await page.getByRole("combobox", { name: "품목 3 재료", exact: true }).click();
  await expect(page.getByRole("option", { name: "대파 (g)", exact: true })).toBeDisabled();
  await page.getByRole("option", { name: "계란 (ea)", exact: true }).click();
  await page.getByLabel("품목 3 발주량 (ea)", { exact: true }).fill("30");
  await page.getByLabel("메모 (선택)", { exact: true }).fill("오전 배송 부탁해요");
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page).toHaveURL(new RegExp(`/orders/${id(900)}$`));
  await expect(page.getByRole("list").filter({ hasText: "돼지고기" })).toContainText("1.8kg");
  assert.equal(calls.filter((call) => call.endpoint === "/save").length, 1);
  assert.equal(calls[0].input.items[0].qty, 0);
  assert.equal(orders.at(-1).items.length, 2);
  await capture("detail-375");
  record("E2E-07 보조: 품목 추가·중복 차단·0행 계약·중복 저장 방지");

  await page.getByRole("button", { name: "발주 목록 복사", exact: true }).click();
  const copied = await page.evaluate(() => window.orderClipboard);
  assert.equal(copied.split("\n")[0], "돼지고기(앞다리) 1.8kg");
  assert.equal(copied.split("\n").length, 2); // ea 표기의 합의 전에는 g 행과 줄바꿈만 판정한다.
  await page.evaluate(() => { window.rejectOrderClipboard = true; });
  await page.getByRole("button", { name: "발주 목록 복사", exact: true }).click();
  await expect(page.getByLabel("복사할 발주 내용")).toHaveValue(copied);
  await capture("copy-fallback-375");
  await action("닫기").click();
  await expect(page.getByRole("button", { name: "발주 목록 복사", exact: true })).toBeFocused();
  record("E2E-07 보조: g 복사·줄바꿈·클립보드 실패 복구 (ea 표기 판정 보류)");

  await page.getByRole("link", { name: "품목·수량 수정", exact: true }).click();
  await page.getByLabel("품목 1 발주량 (g)", { exact: true }).fill("2500");
  mutationError = { code: "VALIDATION", message: "발주량을 다시 확인해 주세요", fields: { "items.0.qty": "재료 수량을 다시 확인해 주세요" } };
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).click();
  await expect(page.getByLabel("품목 1 발주량 (g)", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("메모 (선택)")).toHaveValue("오전 배송 부탁해요");
  mutationError = { code: "UNAUTHORIZED", message: "로그인이 필요해요" };
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).click();
  await expect(page.getByRole("link", { name: "다시 로그인 (새 창)" })).toHaveAttribute("target", "_blank");
  await expect(page.getByLabel("품목 1 발주량 (g)", { exact: true })).toHaveValue("2500");
  await capture("form-auth-error-375");
  mutationError = null;
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${id(900)}$`));
  await expect(page.getByRole("list").filter({ hasText: "돼지고기" })).toContainText("2,500g (약 2.5kg)");
  record("IT-ORD-02 보조: 수정·필드 오류·UNAUTHORIZED 응답에서 입력 보존·재시도");

  const orderedButton = page.getByRole("button", { name: "발주완료로 표시", exact: true });
  await orderedButton.focus();
  await orderedButton.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(orderedButton).toBeFocused();
  await orderedButton.press("Enter");
  const beforeCancel = calls.length;
  await action("취소").click();
  await expect(orderedButton).toBeFocused();
  assert.equal(calls.length, beforeCancel);
  await page.getByRole("button", { name: "발주완료로 표시", exact: true }).click();
  await action("발주완료로 표시").evaluate((button) => { button.click(); button.click(); });
  await status("발주완료");
  await expect(page.locator('section[aria-label="발주 정보"] h2')).toBeFocused();
  assert.equal(calls.filter((call) => call.endpoint === "/status").length, 1);
  await expect(page.getByRole("link", { name: "품목·수량 수정" })).toHaveCount(0);
  await capture("ordered-375");
  await page.goto(`/orders/${id(900)}/edit`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("작성중으로 되돌린 뒤");
  await page.getByRole("link", { name: "발주 상세 보기", exact: true }).click();
  record("IT-ORD-03·04·UI-REG-11 보조: 확인 전 변경 없음·요청 잠금·수정 차단·Esc/취소/성공 포커스 복귀");

  await page.getByRole("button", { name: "작성중으로 되돌리기", exact: true }).click();
  mutationError = { code: "CONFLICT", message: "다른 곳에서 상태가 바뀌었어요. 최신 상태를 확인해 주세요" };
  await action("작성중으로 되돌리기").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("최신 상태");
  assert.equal(orders.at(-1).status, "ordered");
  mutationError = null;
  await action("작성중으로 되돌리기").click();
  await status("작성중");
  await page.getByRole("button", { name: "발주완료로 표시", exact: true }).click();
  await action("발주완료로 표시").click();
  await status("발주완료");
  await page.getByRole("button", { name: "입고완료로 표시", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("재고를 늘리지 않아요");
  await action("입고완료로 표시").click();
  await status("입고완료");
  await expect(page.getByRole("button", { name: "작성중으로 되돌리기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "목록 삭제" })).toHaveCount(0);
  await capture("received-375");
  await expect(page.locator('section[aria-label="발주 정보"] h2')).toBeFocused();
  record("IT-ORD-04·UI-REG-11 보조: 충돌 재시도·되돌리기·입고완료 이후 잠금·제목 포커스");

  await page.goto(`/orders/${id(601)}`);
  await page.getByRole("button", { name: "목록 삭제", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("되돌릴 수 없어요");
  await action("삭제").click();
  await expect(page).toHaveURL(`${baseURL}/orders`);
  assert.equal(orders.some((order) => order.id === id(601)), false);
  await page.goto("/orders/not-an-id");
  await expect(page.getByText("발주 목록을 찾지 못했어요. 삭제됐거나 볼 수 없는 목록이에요.")).toBeVisible();
  record("E2E-07 보조: 작성중 삭제 확인·목록 이동·잘못된 ID");

  emptySuggestion = true;
  await page.goto("/orders/new");
  await expect(page.getByText("부족한 재료가 없어요. 필요한 품목을 직접 추가할 수 있어요.")).toBeVisible();
  emptyIngredients = true;
  await page.reload();
  await expect(page.getByRole("link", { name: "재료 등록", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "작성중으로 저장", exact: true })).toBeDisabled();
  await capture("empty-375");
  emptyIngredients = false;
  readError = true;
  await page.goto("/orders");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("불러오지 못했어요");
  readError = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("heading", { name: "발주 기록 · 1건", exact: true })).toBeVisible();
  record("E2E-07 보조: 부족 없음·재료 없음·조회 실패 재시도");

  const unavailableOrder = { id: id(950), orderDate: "2026-11-03", status: "draft", memo: null, items: [{ ingredientId: id(9999), name: "선택 불가 재료", unit: "g", qty: 100 }, ...ingredients.slice(0, 2).map((item) => ({ ingredientId: item.id, name: item.name, unit: item.unit, qty: 100 }))] };
  orders.push(unavailableOrder);
  await page.goto(`/orders/${unavailableOrder.id}/edit`);
  await expect(page.getByRole("button", { name: "품목 추가", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "품목 추가", exact: true }).click();
  await expect(page.getByRole("button", { name: "품목 추가", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "품목 4 재료", exact: true }).click();
  await page.getByRole("option", { name: "계란 (ea)", exact: true }).click();
  await expect(page.getByLabel("품목 4 발주량 (ea)", { exact: true })).toBeVisible();
  record("E2E-07 보조 M1: 선택 불가 행이 있어도 남은 재료 추가·빈 행 추가 한도");

  await page.goto(`/orders/${unavailableOrder.id}`);
  await page.getByRole("button", { name: "발주완료로 표시", exact: true }).click();
  unavailableOrder.status = "received";
  mutationError = { code: "CONFLICT", message: "다른 곳에서 상태가 바뀌었어요" };
  await action("발주완료로 표시").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("상태가 바뀌었어요");
  mutationError = null;
  await action("최신 상태 확인").click();
  await status("입고완료");
  await expect(page.locator('section[aria-label="발주 정보"] h2')).toBeFocused();
  record("UI-REG-11 보조 M2: 실제 fixture 상태 변경 뒤 최신 조회·포커스 복구");

  emptySuggestion = false;
  suggestion.items[0].suggestedQty = 1766;
  suggestion.items[0].pendingQty = 1049;
  await page.goto("/orders/new");
  await expect(page.locator("article").first()).toContainText("권장 1,766g (약 1.8kg)");
  await expect(page.locator("article").first()).toContainText("발주했지만 아직 안 온 양 1,049g (약 1kg)");
  mutationError = { code: "VALIDATION", message: "입력값을 다시 확인해 주세요", fields: { id: "목록을 확인해 주세요", "items.0": "품목을 확인해 주세요", _: "전체 내용을 확인해 주세요" } };
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).click();
  await expect(page.getByText("발주 목록: 목록을 확인해 주세요", { exact: true })).toBeVisible();
  await expect(page.getByText("품목 1: 품목을 확인해 주세요", { exact: true })).toBeVisible();
  await expect(page.getByText("입력 내용: 전체 내용을 확인해 주세요", { exact: true })).toBeVisible();
  mutationError = { code: "VALIDATION", message: "입력값을 다시 확인해 주세요", fields: { "items.0.ingredientId": "재료를 다시 확인해 주세요", memo: "메모를 다시 확인해 주세요" } };
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "품목 1 재료", exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("메모 (선택)", { exact: true })).toHaveAttribute("aria-invalid", "true");
  mutationError = null;
  await page.getByLabel("품목 1 발주량 (g)", { exact: true }).fill("0");
  await page.getByLabel("품목 2 발주량 (g)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "작성중으로 저장", exact: true }).click();
  await expect(page.getByText("발주량이 0보다 큰 품목을 하나 이상 추가해 주세요", { exact: true })).toBeFocused();
  assert.equal(await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 56 && r.bottom <= innerHeight - 148; }), true);
  record("UI-REG-11 보조 I1·I3·I6: 원값·근삿값 병기·누락 필드 오류·품목 오류 위치와 포커스");

  await page.getByLabel("품목 1 발주량 (g)", { exact: true }).fill("1766");
  await page.getByLabel("품목 2 발주량 (g)", { exact: true }).fill("1800");
  await page.getByLabel("발주일", { exact: true }).evaluate((input) => { input.value = "2026-11-01"; });
  await page.getByRole("form", { name: "발주 등록", exact: true }).evaluate((form) => form.requestSubmit());
  await expect(page).toHaveURL(new RegExp(`/orders/${id(901)}$`));
  assert.equal(calls.at(-1).input.orderDate, "2026-11-01");
  record("E2E-07 보조: 화면 값과 state가 달라도 실제 표시된 발주일 제출");

  await page.goto("/orders?from=broken&to=2026-11-17");
  await expect(page.getByLabel("시작일", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("시작일", { exact: true })).toHaveAttribute("aria-describedby", "order-filter-error");
  await expect(page.getByLabel("종료일", { exact: true })).toHaveAttribute("aria-invalid", "false");
  record("UI-REG-11 보조 I4: 잘못된 날짜만 오류 표시·안내 연결");
  await page.setViewportSize({ width: 360, height: 812 });
  await page.goto(`/orders/${id(901)}`);
  await capture("quantity-360");
  await page.setViewportSize({ width: 1024, height: 812 });
  await capture("quantity-1024");
  record("UI-REG-11 보조: 360·1024 화면의 수량 원값·가로 넘침·터치 영역");
  orders.push({ id: id(960), orderDate: "2026-11-03", status: "received", memo: null, items: [{ ingredientId: id(103), name: "대파", unit: "g", qty: 1049 }, { ingredientId: id(106), name: "우유", unit: "ml", qty: 1766 }] });
  await page.goto(`/orders/${id(960)}`);
  await page.getByRole("button", { name: "발주 목록 복사", exact: true }).click();
  assert.equal(await page.evaluate(() => window.orderClipboard), "대파 1kg\n우유 1.8L");
  record("IT-ORD-08 보조: g·ml 복사 표기 (ea 합의 대기)");

  await page.goto(`/orders/${id(901)}`);
  await page.getByRole("button", { name: "목록 삭제", exact: true }).click();
  orders.splice(orders.findIndex((item) => item.id === id(901)), 1);
  mutationError = { code: "NOT_FOUND", message: "발주 목록을 찾지 못했어요" };
  await action("삭제").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("발주 목록을 찾지 못했어요");
  mutationError = null;
  await action("최신 상태 확인").click();
  await expect(page.getByText("발주 목록을 찾지 못했어요. 삭제됐거나 볼 수 없는 목록이에요.")).toBeVisible();
  record("E2E-07 보조: 삭제 NOT_FOUND에서 최신 조회로 복구");
  assert.deepEqual(errors.filter((error) => !error.includes("fixture read failed")), []);
  await writeFile(path.join(output, "report.json"), JSON.stringify({ viewports: ["375x812", "360x812", "1024x812"], checks, calls, limitations: ["조회·액션은 복사본 fixture. 실제 DB/RLS/RPC 검증 아님", "인증 만료는 ActionResult 응답만 검증. proxy 리다이렉트 경로는 미검증", "ea는 기존 formatOrderText의 개 표기를 사용. API ea 예제와의 불일치는 기존 보류 사항"] }, null, 2));
  console.log(`PASS ${checks.length} browser checks; ${output}`);
} catch (error) {
  await writeFile(path.join(output, "next.log"), logs);
  throw error;
} finally {
  await browser?.close();
  fixture.closeAllConnections();
  fixture.close();
  // Next의 worker까지 이 검사에서 시작한 프로세스 트리만 종료한다.
  try { if (child.pid) {
    if (process.platform === "win32") {
      await new Promise((resolve, reject) => {
        const cleanup = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        const timeout = setTimeout(() => { cleanup.kill(); reject(new Error(`QA 서버 종료 시간 초과: PID ${child.pid}`)); }, 10_000);
        cleanup.once("error", (error) => { clearTimeout(timeout); reject(error); });
        cleanup.once("exit", () => { clearTimeout(timeout); resolve(); });
      });
    } else {
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  } } finally { child.stdout.destroy(); child.stderr.destroy(); }
}
