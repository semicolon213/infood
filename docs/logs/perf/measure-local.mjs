// NFR-06 보조 측정: 로컬 프로덕션 빌드 + 로컬 Supabase, 375×812, 화면별 응답(HTML 첫 바이트)·로드 완료 시간. 1회 예열 후 5회 중앙값
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
const URL = "http://127.0.0.1:54321";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const db = createClient(URL, KEY, { auth: { persistSession: false } });
const mail = `perf-${Date.now()}@test.local`;
const { data: a } = await db.auth.signUp({ email: mail, password: "password1234" });
const { data: store } = await db.from("stores").insert({ owner_id: a.user.id, name: "측정 매장" }).select("id").single();
// 재료 30·메뉴 15·묶음 60 정도로 채운다 (시드 규모)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const day = (n) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const { data: ings } = await db.from("ingredients").insert(Array.from({ length: 30 }, (_, i) => ({ store_id: store.id, name: `재료${i + 1}`, unit: "g", default_shelf_days: 5, min_stock: 500 }))).select("id");
await db.rpc("receive_stock", { p_store_id: store.id, p_ref_type: "manual", p_ref_id: null,
  p_lots: ings.flatMap((g, i) => [0, 1].map((k) => ({ ingredient_id: g.id, quantity: 1000, unit_price: 3, received_at: day(-3), expires_at: day((i % 7) - 1 + k * 3), expiry_source: "manual" }))) });
const { data: menus } = await db.from("menus").insert(Array.from({ length: 15 }, (_, i) => ({ store_id: store.id, name: `메뉴${i + 1}`, price: 9000 }))).select("id");
await db.from("recipe_items").insert(menus.flatMap((m, i) => [0, 1, 2].map((k) => ({ store_id: store.id, menu_id: m.id, ingredient_id: ings[(i * 2 + k) % 30].id, qty: 50 }))));
const jar = [];
const ssr = createServerClient(URL, KEY, { cookies: { getAll: () => jar, setAll: (c) => { for (const x of c) { const i = jar.findIndex((y) => y.name === x.name); if (i >= 0) jar.splice(i, 1); jar.push(x); } } } });
await ssr.auth.signInWithPassword({ email: mail, password: "password1234" });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
await ctx.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
const page = await ctx.newPage();
const routes = ["/", "/ingredients", `/ingredients/${ings[0].id}`, "/receive", "/sales", "/sell", "/menus", "/orders", "/waste", "/recommend"];
const med = (xs) => xs.sort((p, q) => p - q)[Math.floor(xs.length / 2)];
const rows = [];
for (const r of routes) {
  await page.goto(`http://localhost:3000${r}`);
  const ttfb = [], load = [];
  for (let i = 0; i < 5; i++) {
    await page.goto(`http://localhost:3000${r}`, { waitUntil: "load" });
    const t = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return [n.responseStart - n.requestStart, n.loadEventEnd - n.startTime]; });
    ttfb.push(t[0]); load.push(t[1]);
  }
  rows.push([r.replace(ings[0].id, ":id"), Math.round(med(ttfb)), Math.round(med(load)), Math.round(Math.max(...load))]);
}
console.log("| 화면 | 서버 응답 중앙값(ms) | 로드 완료 중앙값(ms) | 로드 최대(ms) |\n|---|---:|---:|---:|");
for (const r of rows) console.log(`| \`${r[0]}\` | ${r[1]} | ${r[2]} | ${r[3]} |`);
// 추천 (AI_MOCK=1 → 모델 시간 제외, 서버 처리만)
const rec = [];
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  const res = await page.request.post("http://localhost:3000/api/recommendations", { data: { basis: "expiry" } });
  rec.push([Date.now() - t0, res.status()]);
}
console.log("recommend(mock) ms/status:", JSON.stringify(rec));
await browser.close();
