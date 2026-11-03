import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) {
  console.error("사용법: node docs/seed-validation/verify.mjs <PGlite package 경로> [출력 폴더]");
  process.exit(2);
}
const packagePath = path.resolve(process.argv[2]);
const { PGlite } = await import(pathToFileURL(path.join(packagePath, "dist/index.js")).href);
const engineVersion = JSON.parse(await fs.readFile(path.join(packagePath, "package.json"), "utf8")).version;

const base = path.resolve(process.argv[3] ?? ".next/seed-validation");
await fs.mkdir(base, { recursive: true });
const source = path.resolve("supabase/seed.sql");
const seed = await fs.readFile(source, "utf8");
const design = await fs.readFile("docs/07_DB.md", "utf8");
const report = {
  engine: `PGlite ${engineVersion}`, seed: "supabase/seed.sql", date: "2026-11-03",
  seedSha256: crypto.createHash("sha256").update(seed).digest("hex"),
  schemaDesignSha256: crypto.createHash("sha256").update(design).digest("hex"),
  limitations: ["임시 메모리 DB와 07_DB.md SQL 사용, 실제 2.7 마이그레이션 아님", "auth.users/identities/uid는 최소 모의이며 GoTrue·메일 로그인·Supabase 실제 통합은 미검증", "고정 기준일 2026-11-03, 실행일 날짜 연동 미완료", "발주 목록은 draft2개, ordered fixture는 상태 액션 대기"],
  tests: [],
};
const auth = `
  create role authenticated nologin nobypassrls;
  create schema auth;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text unique,
    encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz
  );
  create table auth.identities (
    id uuid primary key, user_id uuid references auth.users(id), provider_id text,
    identity_data jsonb, provider text, created_at timestamptz, updated_at timestamptz,
    unique(provider_id, provider)
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
  $$;
`;
const storeId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
function sqlAfter(heading) {
  const position = design.indexOf(heading);
  assert.ok(position >= 0, heading);
  const match = design.slice(position).match(/```sql\r?\n([\s\S]*?)```/);
  assert.ok(match, heading);
  return match[1].replace(/^create extension if not exists pgcrypto;\s*$/m, "");
}
async function asUser(db, userId, operation) {
  await db.exec("begin; set local role authenticated;");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await operation();
  } finally { await db.exec("rollback"); }
}
async function expectFailure(db, name, operation, pattern) {
  let caught;
  try { await operation(); } catch (error) { caught = error; }
  await db.exec("rollback");
  assert.ok(caught, `${name}: expected failure`);
  assert.match(caught.message, pattern, name);
  report.tests.push({ name, passed: true, message: caught.message, code: caught.code });
}

let db;
try {
  // 0000만 적용한 선행 누락 상황도 검사. 프로젝트 파일은 수정하지 않는다.
  db = await PGlite.create();
  report.postgres = (await db.query("select version() as version")).rows[0].version;
  await db.exec(auth);
  const initialMigration = (await fs.readFile("supabase/migrations/0000_stores.sql", "utf8")).replace(/^create extension if not exists pgcrypto;\s*$/m, "");
  await db.exec(initialMigration);
  await expectFailure(db, "선행 2.7 누락 시 명확한 안내", () => db.exec(seed), /2\.7의 테이블/);
  assert.equal((await db.query("select count(*)::int as n from stores")).rows[0].n, 0);
  await db.close();
  db = await PGlite.create();
  await db.exec(auth);
  for (const heading of ["### 3.1 타입", "### 3.2 테이블", "### 3.3 인덱스", "### 3.4 재고 요약 함수", "## 4. RLS 정책", "### 5.1 `receive_stock`", "### 5.2 `apply_consumption`", "### 5.3 `record_daily_sales`", "### 5.4 `record_usage`", "### 5.5 `record_waste`", "### 5.6 `save_order`"]) {
    await db.exec(sqlAfter(heading));
  }
  // Supabase의 테이블 자동 권한을 모의한다. RLS는 위 설계서 정책 그대로 적용한다.
  await db.exec("grant usage on schema public, auth to authenticated; grant all on all tables in schema public to authenticated; grant execute on all functions in schema public, auth to authenticated;");
  await db.exec(seed);
  report.tests.push({ name: "고정 시점 시드 SQL 전체 실행 및 내부 검산", passed: true });
  const tables = ["stores", "ingredients", "ingredient_units", "menus", "recipe_items", "sales_days", "sales", "stock_lots", "stock_movements", "usage_records", "purchase_orders"];
  report.counts = {};
  for (const table of tables) report.counts[table] = (await db.query(`select count(*)::int as n from ${table} where ${table === "stores" ? "id" : "store_id"}=$1`, [storeId])).rows[0].n;
  assert.equal(report.counts.ingredients, 30);
  assert.equal(report.counts.menus, 15);
  assert.equal(report.counts.sales_days, 14);
  assert.equal(report.counts.sales, 15);
  assert.equal(report.counts.stock_lots, 31);
  assert.equal(report.counts.usage_records, 3);
  assert.equal(report.counts.ingredient_units, 3);
  assert.equal(report.counts.purchase_orders, 2);
  const salesRange = (await db.query("select min(sold_on)::text as first, max(sold_on)::text as last, count(distinct sold_on)::int as days from sales_days where store_id=$1", [storeId])).rows[0];
  assert.deepEqual(salesRange, { first: "2026-10-20", last: "2026-11-02", days: 14 });
  report.tests.push({ name: "재료30·메뉴15·14일 연속 판매·사용3·묶음31 검증", passed: true, salesRange });
  const stock = (await db.query("select * from get_ingredient_stock($1, '2026-11-03') order by name", [storeId])).rows;
  const milk = stock.find((row) => row.name === "우유");
  assert.equal(Number(milk.total_remaining), 2700);
  assert.equal(Number(milk.available_remaining), 0);
  assert.equal(Number(milk.expired_remaining), 2700);
  assert.equal(milk.is_low, true);
  assert.ok(stock.filter((row) => row.is_low).length >= 3);
  assert.equal(Number(stock.find((row) => row.name === "양파").total_remaining), 9320);
  assert.equal(Number(stock.find((row) => row.name === "두부").total_remaining), 5040);
  const invalid = await db.query("select id from stock_lots where remaining<0 or remaining>quantity");
  assert.equal(invalid.rows.length, 0);
  report.tests.push({ name: "사용 가능·경과·부족 판정 및 잔량 검산", passed: true, lowIngredients: stock.filter((row) => row.is_low).map((row) => row.name), milk });
  const visibleOwner = await asUser(db, ownerId, async () => (await db.query("select count(*)::int as n from ingredients")).rows[0].n);
  const visibleOther = await asUser(db, "10000000-0000-4000-8000-000000000999", async () => (await db.query("select count(*)::int as n from ingredients")).rows[0].n);
  assert.equal(visibleOwner, 30);
  assert.equal(visibleOther, 0);
  report.tests.push({ name: "설계 정책을 이용한 모의 세션 RLS 조회 격리", passed: true, visibleOwner, visibleOther });
  await asUser(db, ownerId, async () => {
    const update = await db.query("update stock_movements set memo='검증' returning id");
    const remove = await db.query("delete from stock_movements returning id");
    assert.equal(update.rows.length, 0);
    assert.equal(remove.rows.length, 0);
  });
  report.tests.push({ name: "모의 세션에서 재고 이력 수정·삭제0행", passed: true });
  await expectFailure(db, "같은 시드 재실행 차단 및 기존 데이터 보존", () => db.exec(seed), /이미 시드 매장이/);
  assert.equal((await db.query("select count(*)::int as n from ingredients")).rows[0].n, 30);
  report.orderStates = (await db.query("select status::text, count(*)::int as count from purchase_orders group by status order by status")).rows;
  assert.deepEqual(report.orderStates, [{ status: "draft", count: 2 }]);
  report.success = true;
  await fs.writeFile(path.join(base, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ success: true, postgres: report.postgres, passed: report.tests.length, counts: report.counts, orderStates: report.orderStates, limitations: report.limitations }, null, 2));
} catch (error) {
  report.success = false;
  report.error = { message: error.message, code: error.code, detail: error.detail, where: error.where?.slice(0, 700) };
  await fs.writeFile(path.join(base, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.error, null, 2));
  process.exitCode = 1;
} finally { await db?.close(); }
