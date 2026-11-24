// #87 / WBS 5.2 QA. 실제 POS Route Handler + 로컬 Auth/RLS/RPC를 검사한다.
// 실행·환경: docs/pos-duplicate-87-qa.md. 기대와 다르면 exit 1 (알려진 결함도 실패로 기록).
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { todayKST } from "@/lib/date";
import { addDays } from "@/lib/stock/expiry";

const url = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:57321";
const container = process.env.POS_QA_DB_CONTAINER ?? "supabase_db_infood-pos-qa87";
const output = path.resolve(process.env.POS_QA_OUTPUT ?? "test-results/pos-duplicate-87/check.json");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname), "로컬 Supabase만 허용");
const key = process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
assert.ok(!key.startsWith("sb_secret_"), "service role 키는 사용할 수 없음");
if (key.split(".").length === 3) {
  assert.notEqual(JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role, "service_role", "service role 키는 사용할 수 없음");
}
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
const { POST } = await import("@/app/api/pos/sales/route");
const { recordSaleOrderFor } = await import("@/lib/sales/record-order");
const today = todayKST();
const checks = [];
const clients = [];
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();

async function freshStore() {
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(db);
  const { data: auth, error } = await db.auth.signUp({ email: `pos-qa-${crypto.randomUUID()}@test.local`, password: "password1234" });
  assert.equal(error, null);
  assert.ok(auth.session);
  const { data: store } = await db.from("stores").insert({ owner_id: auth.user.id, name: "POS 중복 QA" }).select("id").single().throwOnError();
  const { data: ing } = await db.from("ingredients").insert({ store_id: store.id, name: "양파", unit: "g", default_shelf_days: 3 }).select("id").single().throwOnError();
  const { data: menu } = await db.from("menus").insert({ store_id: store.id, name: "제육볶음", price: 9000 }).select("id").single().throwOnError();
  await db.from("recipe_items").insert({ store_id: store.id, menu_id: menu.id, ingredient_id: ing.id, qty: 100 }).throwOnError();
  const lots = [];
  for (const [quantity, days] of [[150, 1], [500, 5]]) {
    const { data: ids } = await db.rpc("receive_stock", {
      p_store_id: store.id, p_ref_type: "manual", p_ref_id: null,
      p_lots: [{ ingredient_id: ing.id, quantity, unit_price: null, received_at: addDays(today, -1), expires_at: addDays(today, days), expiry_source: "manual" }],
    }).throwOnError();
    lots.push(ids[0]);
  }
  return { db, storeId: store.id, menuId: menu.id, ingredientId: ing.id, lots, token: auth.session.access_token };
}

async function pos(s, externalId, qty = 2) {
  const response = await POST(new Request("http://localhost/api/pos/sales", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.token}` },
    body: JSON.stringify({ externalId, soldOn: today, items: [{ menuId: s.menuId, qty }] }),
  }));
  return { status: response.status, body: await response.json() };
}

async function snapshot(s) {
  const [lots, orders, moves, days, sales] = await Promise.all([
    s.db.from("stock_lots").select("id, remaining").eq("store_id", s.storeId).throwOnError(),
    s.db.from("sale_orders").select("id, source, external_id, shortages").eq("store_id", s.storeId).order("id").throwOnError(),
    s.db.from("stock_movements").select("lot_id, delta, ref_id").eq("store_id", s.storeId).eq("ref_type", "sales").order("id").throwOnError(),
    s.db.from("sales_days").select("id").eq("store_id", s.storeId).order("id").throwOnError(),
    s.db.from("sales").select("id, qty").eq("store_id", s.storeId).order("id").throwOnError(),
  ]);
  return { remaining: s.lots.map((id) => Number(lots.data.find((lot) => lot.id === id).remaining)), orders: orders.data, moves: moves.data, days: days.data, sales: sales.data };
}

// 앱·RPC는 변경하지 않는다. 관리 접속은 로컬 테스트 DB의 잠금·대기 감시에만 쓴다.
function sql(query) {
  return execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8", windowsHide: true, timeout: 5000 }).trim();
}

async function race(s, requests) {
  assert.match(s.storeId, /^[0-9a-f-]{36}$/);
  const lockKey = `hashtextextended('${s.storeId}/${today}', 0)`;
  const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const exited = once(child, "exit");
  let lockOutput = "";
  let lockError = "";
  child.stdout.on("data", (chunk) => { lockOutput += chunk; });
  child.stderr.on("data", (chunk) => { lockError += chunk; });
  let pending;
  try {
    child.stdin.write(`begin; set local idle_in_transaction_session_timeout = '30s'; select pg_advisory_xact_lock(${lockKey}); select 'QA_LOCK_READY';\n`);
    const readyDeadline = Date.now() + 10_000;
    while (!lockOutput.includes("QA_LOCK_READY")) {
      assert.equal(child.exitCode, null, lockError);
      assert.ok(Date.now() < readyDeadline, "잠금 획득 시간 초과");
      await delay(50);
    }
    pending = Promise.all(requests.map((request) => request()));
    // 두 요청 모두 사전 중복 조회를 통과하고 실제 RPC에서 기다리는 것을 확인한다.
    const deadline = Date.now() + 10_000;
    let waiting = 0;
    while (waiting < requests.length) {
      waiting = Number(sql(`select count(*) from pg_locks where locktype = 'advisory' and not granted and classid::bigint = ((${lockKey} >> 32) & 4294967295) and objid::bigint = (${lockKey} & 4294967295)`));
      assert.ok(Date.now() < deadline, `RPC 대기 시간 초과: ${waiting}/${requests.length}`);
      if (waiting < requests.length) await delay(50);
    }
    child.stdin.end("rollback;\n\\q\n");
    const responses = await pending;
    const [code] = await exited;
    assert.equal(code, 0, lockError);
    return { waiting, responses };
  } finally {
    if (!child.stdin.writableEnded) child.stdin.end("rollback;\n\\q\n");
    await Promise.allSettled([exited, pending]);
  }
}

async function check(name, run) {
  const result = { name, passed: false, details: {} };
  checks.push(result);
  try { await run(result.details); result.passed = true; }
  catch (error) { result.error = error.message; }
  console.log(`${result.passed ? "PASS" : "FAIL"} ${name}`);
}

try {
  await check("IT-USE-05 보조 #87-01: 순차 재전송은 같은 주문으로 200·duplicate", async (d) => {
    const s = await freshStore();
    d.responses = [await pos(s, "SEQ"), await pos(s, "SEQ")];
    d.state = await snapshot(s);
    assert.deepEqual(d.responses.map((r) => r.status), [200, 200]);
    assert.deepEqual(d.responses.map((r) => r.body.data.duplicate), [false, true]);
    assert.equal(d.responses[0].body.data.orderId, d.responses[1].body.data.orderId);
    assert.deepEqual(d.state.remaining, [0, 450]);
    assert.equal(d.state.orders.length, 1);
    assert.equal(d.state.moves.length, 2);
  });

  for (const qty of [2, 7]) {
    await check(`IT-USE-05 보조 #87-0${qty === 2 ? 2 : 3}: 동시 중복 주문 ${qty}인분은 양쪽 200`, async (d) => {
      const s = await freshStore();
      Object.assign(d, await race(s, [() => pos(s, "RACE", qty), () => pos(s, "RACE", qty)]));
      d.state = await snapshot(s);
      d.retry = await pos(s, "RACE", qty);
      assert.deepEqual(await snapshot(s), d.state, "후속 재전송은 DB 불변");
      assert.deepEqual(d.state.remaining, qty === 2 ? [0, 450] : [0, 0]);
      assert.equal(d.state.orders.length, 1);
      assert.equal(d.state.moves.length, 2);
      assert.equal(d.state.moves.reduce((sum, m) => sum + Number(m.delta), 0), qty === 2 ? -200 : -650);
      assert.ok(d.state.moves.every((m) => m.ref_id === d.state.orders[0].id));
      assert.equal(d.state.days.length, 0);
      assert.equal(d.state.sales.length, 0);
      assert.deepEqual(d.state.orders[0].shortages, qty === 2 ? [] : [{ ingredient_id: s.ingredientId, required_qty: 700, short_qty: 50 }]);
      assert.equal(d.retry.status, 200);
      assert.equal(d.retry.body.data.duplicate, true);
      assert.equal(d.retry.body.data.orderId, d.state.orders[0].id);
      d.stockAndRecordsCorrect = true;
      assert.deepEqual(d.responses.map((r) => r.status).sort(), [200, 200]);
      assert.deepEqual(d.responses.map((r) => r.body.data.duplicate).sort(), [false, true]);
      assert.ok(d.responses.every((r) => r.body.data.orderId === d.state.orders[0].id));
    });
  }

  await check("IT-USE-03 보조 #87-04: 마감 날짜는 주문번호 유무와 관계없이 409·DB 불변", async (d) => {
    const s = await freshStore();
    await s.db.rpc("record_daily_sales", {
      p_store_id: s.storeId, p_sold_on: today, p_sales: [{ menu_id: s.menuId, qty: 1 }],
      p_plan: [{ lot_id: s.lots[0], qty: 100 }], p_shortages: [],
    }).throwOnError();
    d.before = await snapshot(s);
    d.responses = [await pos(s, "CLOSED"), await pos(s, undefined)];
    assert.ok(d.responses.every((r) => r.status === 409 && r.body.error.code === "CONFLICT"));
    assert.deepEqual(await snapshot(s), d.before);
  });

  await check("DB-01 보조 #87-05: 다른 매장의 같은 주문번호는 각각 새 주문·RLS 격리", async (d) => {
    const a = await freshStore();
    const b = await freshStore();
    d.responses = await Promise.all([pos(a, "SHARED"), pos(b, "SHARED")]);
    assert.ok(d.responses.every((r) => r.status === 200 && r.body.data.duplicate === false));
    assert.notEqual(d.responses[0].body.data.orderId, d.responses[1].body.data.orderId);
    d.states = [await snapshot(a), await snapshot(b)];
    assert.ok(d.states.every((s) => s.orders.length === 1 && s.moves.length === 2));
    assert.deepEqual(d.states.map((s) => s.remaining), [[0, 450], [0, 450]]);
    const { data } = await b.db.from("sale_orders").select("id").eq("id", d.responses[0].body.data.orderId).throwOnError();
    assert.deepEqual(data, []);
  });

  await check("IT-USE-05 보조 #87-06: 주문번호 없는 동시 판매는 별개 주문 2건·재계획", async (d) => {
    const s = await freshStore();
    Object.assign(d, await race(s, [() => pos(s, undefined), () => pos(s, undefined)]));
    d.state = await snapshot(s);
    assert.deepEqual(d.responses.map((r) => r.status), [200, 200]);
    assert.ok(d.responses.every((r) => r.body.data.duplicate === false));
    assert.deepEqual(d.state.remaining, [0, 250]);
    assert.equal(d.state.orders.length, 2);
    assert.equal(d.state.moves.length, 3);
    assert.equal(d.state.moves.reduce((sum, m) => sum + Number(m.delta), 0), -400);
  });

  await check("IT-USE-05 보조 #87-07: 같은 매장·주문번호라도 source가 다르면 별개 주문", async (d) => {
    const s = await freshStore();
    d.pos = await pos(s, "SOURCE");
    d.web = await recordSaleOrderFor(s.db, s.storeId, "web", { externalId: "SOURCE", soldOn: today, items: [{ menuId: s.menuId, qty: 2 }] });
    d.state = await snapshot(s);
    assert.equal(d.pos.status, 200);
    assert.equal(d.web.ok, true);
    assert.equal(d.web.data.duplicate, false);
    assert.notEqual(d.pos.body.data.orderId, d.web.data.orderId);
    assert.deepEqual(d.state.remaining, [0, 250]);
    assert.deepEqual(d.state.orders.map((o) => o.source).sort(), ["pos", "web"]);
  });
} finally {
  await Promise.allSettled(clients.map((db) => db.auth.signOut()));
  const report = { issue: 87, task: "5.2", sourceCommit, recordedAt: new Date().toISOString(), todayKST: today, supabaseUrl: url, mode: "actual Route Handler + local Auth/RLS/RPC; no HTTP listener", checks };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`${checks.filter((c) => c.passed).length}/${checks.length} PASS; ${output}`);
  if (checks.some((c) => !c.passed)) process.exitCode = 1;
}
