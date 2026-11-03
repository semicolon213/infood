-- supabase/migrations/0001_init.sql
-- WBS 2.7. 정의는 docs/07_DB.md v0.3 3.1~3.4와 같다.
-- stores 테이블과 pgcrypto는 0000_stores.sql(WBS 2.4)에서 만들었으므로 여기서는 다시 만들지 않는다.

-- 3.1 타입
create type unit_type      as enum ('g', 'ml', 'ea');
create type storage_type   as enum ('fridge', 'freezer', 'room');  -- 식품공전: 냉장 0~10℃ / 냉동 -18℃ 이하 / 실온 1~35℃
create type expiry_source  as enum ('manual', 'default');           -- SRS BR-01
create type movement_type  as enum ('in', 'use', 'waste', 'adjust');
create type order_status   as enum ('draft', 'ordered', 'received'); -- 작성중 / 발주완료 / 입고완료

-- 3.2 테이블
create table ingredients (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 30),
  category            text,
  unit                unit_type not null,
  min_stock           numeric(12,3) not null default 0 check (min_stock >= 0),
  target_stock        numeric(12,3),                                  -- 적정 재고, 없으면 최소 재고 × 2 (BR-06)
  storage             storage_type not null default 'fridge',
  default_shelf_days  int check (default_shelf_days between 1 and 3650),
  track_expiry        boolean not null default true,                  -- 소금·설탕 등은 false (BR-01)
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (store_id, name),
  check (not track_expiry or default_shelf_days is not null),
  check (target_stock is null or target_stock >= min_stock)
);

create table ingredient_units (
  store_id       uuid not null references stores(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete cascade,
  unit_name      text not null check (char_length(unit_name) between 1 and 10),  -- "단", "박스", "판"
  factor         numeric(12,4) not null check (factor > 0),                      -- 1단위당 기본 단위 양
  primary key (ingredient_id, unit_name)
);

create table stock_lots (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  ingredient_id   uuid not null references ingredients(id) on delete restrict,
  quantity        numeric(12,3) not null check (quantity > 0),
  remaining       numeric(12,3) not null,
  unit_price      numeric(12,4) check (unit_price >= 0),      -- 원 / 기본 단위, 서버가 품목 금액에서 계산
  received_at     date not null,
  expires_at      date,                                       -- 기한 추적 제외 재료는 null
  expiry_source   expiry_source,
  receipt_id      uuid,                                       -- 확장(07_DB 10.1)에서 receipts FK 추가
  created_at      timestamptz not null default now(),
  check (remaining >= 0 and remaining <= quantity),
  check ((expires_at is null) = (expiry_source is null)),
  check (expires_at is null or expires_at >= received_at)
);

create table stock_movements (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete restrict,
  lot_id         uuid references stock_lots(id) on delete restrict,
  type           movement_type not null,
  delta          numeric(12,3) not null check (delta <> 0),  -- 입고 +, 사용·폐기 -, 조정 ±
  reason         text,      -- 폐기: expired|spoiled|mistake|other, 조정: count|sales_revision
  memo           text,
  ref_type       text not null check (ref_type in ('receipt', 'manual', 'sales', 'usage', 'waste', 'adjust')),
  ref_id         uuid,
  created_at     timestamptz not null default now()
);

create table menus (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 30),
  price       int not null check (price >= 0),
  is_active   boolean not null default true,
  is_special  boolean not null default false,                -- AI 특선에서 등록 (FR-REC-07)
  created_at  timestamptz not null default now(),
  unique (store_id, name)
);

create table recipe_items (
  store_id       uuid not null references stores(id) on delete cascade,
  menu_id        uuid not null references menus(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete restrict,
  qty            numeric(12,3) not null check (qty > 0),     -- 1인분, 기본 단위
  primary key (menu_id, ingredient_id)
);

create table sales_days (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  sold_on     date not null,
  shortages   jsonb not null default '[]',                   -- [{ingredient_id, required_qty, short_qty}] (FR-USE-05)
  updated_at  timestamptz not null default now(),
  unique (store_id, sold_on)
);

create table sales (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  sales_day_id  uuid not null references sales_days(id) on delete cascade,
  menu_id       uuid not null references menus(id) on delete restrict,
  qty           int not null check (qty > 0),
  unique (sales_day_id, menu_id)
);

create table usage_records (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references stores(id) on delete cascade,
  used_on        date not null,
  ingredient_id  uuid not null references ingredients(id) on delete restrict,
  qty            numeric(12,3) not null check (qty > 0),     -- 요청한 사용량, 기본 단위
  short_qty      numeric(12,3) not null default 0 check (short_qty >= 0 and short_qty <= qty),  -- 차감하지 못한 양 (FR-USE-05)
  memo           text check (char_length(memo) <= 100),      -- 직원 식사, 시식 등
  created_at     timestamptz not null default now()
);

create table purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  status       order_status not null default 'draft',
  order_date   date not null,
  memo         text check (char_length(memo) <= 200),
  ordered_at   timestamptz,
  received_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table purchase_order_items (
  order_id       uuid not null references purchase_orders(id) on delete cascade,
  store_id       uuid not null references stores(id) on delete cascade,
  ingredient_id  uuid not null references ingredients(id) on delete restrict,
  qty            numeric(12,3) not null check (qty > 0),     -- 기본 단위
  primary key (order_id, ingredient_id)
);

create table recommendations (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  basis               text not null default 'expiry' check (basis in ('expiry', 'cost', 'popularity')),  -- FR-REC-06
  input_snapshot      jsonb not null,
  result_json         jsonb not null,                        -- 검증 후 RecommendationView
  dropped_count       int not null default 0,                -- 없는 메뉴·형식 오류로 제외 (FR-REC-04)
  short_count         int not null default 0,                -- status = short 재료 수 (FR-REC-03)
  unregistered_count  int not null default 0,                -- status = unregistered 재료 수
  fallback            boolean not null default false,        -- AI 실패 후 규칙 기반 대체 (UC-08 3a)
  accepted            boolean not null default false,        -- 특선 등록 여부 (FR-REC-07)
  created_at          timestamptz not null default now()
);

create table ai_usage (
  store_id  uuid not null references stores(id) on delete cascade,
  used_on   date not null,
  count     int not null default 0,
  primary key (store_id, used_on)
);

-- 3.3 인덱스
create index idx_lots_active       on stock_lots (store_id, ingredient_id, expires_at) where remaining > 0;
create index idx_lots_expiring     on stock_lots (store_id, expires_at) where remaining > 0 and expires_at is not null;
create index idx_movements_ref     on stock_movements (ref_type, ref_id);
create index idx_movements_store   on stock_movements (store_id, created_at desc);
create index idx_movements_waste   on stock_movements (store_id, created_at) where type = 'waste';
create index idx_usage_store       on usage_records (store_id, used_on desc);
create index idx_orders_store      on purchase_orders (store_id, order_date desc);
create index idx_order_items_ing   on purchase_order_items (store_id, ingredient_id);
create index idx_recs_store        on recommendations (store_id, created_at desc);

-- 3.4 재고 요약 함수
-- 재료별 재고 요약. 오늘은 서버가 todayKST()로 넘긴다 (DB에서 오늘을 구하지 않음)
-- security invoker라 RLS가 그대로 적용된다
create or replace function get_ingredient_stock(p_store_id uuid, p_today date)
returns table (
  ingredient_id       uuid,
  name                text,
  unit                unit_type,
  min_stock           numeric,
  target_stock        numeric,
  total_remaining     numeric,
  available_remaining numeric,   -- 경과하지 않은 묶음 잔량 합 (BR-05)
  expired_remaining   numeric,   -- 경과 묶음 잔량 합 (폐기 안내 대상)
  nearest_expires_at  date,      -- 경과 묶음 포함 가장 빠른 기한 (목록 배지용)
  is_low              boolean    -- 최소 재고 > 0 이고 사용 가능 재고 < 최소 재고
)
language sql stable security invoker set search_path = public
as $$
  select i.id, i.name, i.unit, i.min_stock, i.target_stock,
         coalesce(sum(l.remaining), 0),
         coalesce(sum(l.remaining) filter (where l.expires_at is null or l.expires_at >= p_today), 0),
         coalesce(sum(l.remaining) filter (where l.expires_at < p_today), 0),
         min(l.expires_at),
         i.min_stock > 0
           and coalesce(sum(l.remaining) filter (where l.expires_at is null or l.expires_at >= p_today), 0) < i.min_stock
    from ingredients i
    left join stock_lots l on l.ingredient_id = i.id and l.remaining > 0
   where i.store_id = p_store_id and i.is_active
   group by i.id;
$$;
