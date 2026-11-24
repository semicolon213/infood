-- supabase/migrations/0005_sale_orders.sql
-- 주문별 판매 (WBS 4.8, 11/22 팀장 요청). 메뉴가 팔릴 때마다(사이트 입력 또는 포스 연동) 레시피만큼 재고를 FEFO로 바로 줄인다.
-- 하루치를 한 번에 넣는 판매 마감(record_daily_sales)과 같은 날짜에 섞어 쓰면 두 번 차감되므로 날짜 단위로 서로 막는다.
-- 차감 이력은 판매 마감과 같은 ref_type 'sales'이고 ref_id가 sale_orders.id다.

create table sale_orders (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  sold_on      date not null,
  source       text not null check (source in ('web', 'pos')),
  external_id  text check (char_length(external_id) between 1 and 100),  -- 포스 주문번호. 같은 번호 재전송은 한 번만 반영
  items        jsonb not null,                                           -- [{menu_id, qty}]
  shortages    jsonb not null default '[]',                              -- [{ingredient_id, required_qty, short_qty}]
  created_at   timestamptz not null default now(),
  unique (store_id, source, external_id)
);
create index idx_sale_orders_day on sale_orders (store_id, sold_on);

alter table sale_orders enable row level security;
create policy sale_orders_all on sale_orders for all using (is_my_store(store_id)) with check (is_my_store(store_id));

create or replace function record_sale_order(
  p_store_id    uuid,
  p_sold_on     date,
  p_source      text,
  p_external_id text,
  p_items       jsonb,   -- [{menu_id, qty}]
  p_plan        jsonb,   -- [{lot_id, qty}]  FEFO 계획 (경과 묶음 제외, lot_id 오름차순)
  p_shortages   jsonb
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from sales_days where store_id = p_store_id and sold_on = p_sold_on) then
    raise exception 'CONFLICT';
  end if;
  begin
    insert into sale_orders (store_id, sold_on, source, external_id, items, shortages)
    values (p_store_id, p_sold_on, p_source, p_external_id, p_items, p_shortages)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CONFLICT';
  end;
  perform private.apply_consumption(p_store_id, 'use', 'sales', v_id, null, null, p_sold_on, p_plan);
  return v_id;
end $$;

-- 판매 마감: 주문별 판매가 있는 날짜는 마감으로 다시 차감하지 않는다 (0004 본문 + 첫 검사만 추가)
create or replace function record_daily_sales(
  p_store_id  uuid,
  p_sold_on   date,
  p_sales     jsonb,
  p_plan      jsonb,
  p_shortages jsonb
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_day uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from sales_days where store_id = p_store_id and sold_on = p_sold_on)
     or exists (select 1 from sale_orders where store_id = p_store_id and sold_on = p_sold_on) then
    raise exception 'CONFLICT';
  end if;
  insert into sales_days (store_id, sold_on, shortages)
  values (p_store_id, p_sold_on, p_shortages)
  returning id into v_day;
  insert into sales (store_id, sales_day_id, menu_id, qty)
  select p_store_id, v_day, (x->>'menu_id')::uuid, (x->>'qty')::int
    from jsonb_array_elements(p_sales) x
   where (x->>'qty')::int > 0;
  perform private.apply_consumption(p_store_id, 'use', 'sales', v_day, null, null, p_sold_on, p_plan);
  return v_day;
end $$;
