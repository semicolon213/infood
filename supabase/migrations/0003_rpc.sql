-- supabase/migrations/0003_rpc.sql
-- WBS 2.7. 정의는 docs/07_DB.md v0.3 5장과 같다.
-- 모두 security invoker — 호출한 사용자의 RLS가 그대로 적용된다.
-- 계획(무엇을 얼마나)은 서버 TypeScript(lib/stock)가 만들고, 함수는 잠금 → 재검증 → 반영 → 이력만 한다.
-- 날짜 인자(p_sold_on, p_used_on 등)는 서버가 넘긴다.

-- 5.1 receive_stock — 입고
create or replace function receive_stock(
  p_store_id  uuid,
  p_ref_type  text,          -- 'manual' (확장 명세서 입고는 'receipt')
  p_ref_id    uuid,          -- 명세서 입고면 receipt id, 아니면 null
  p_lots      jsonb          -- [{ingredient_id, quantity, unit_price, received_at, expires_at, expiry_source}]
) returns setof uuid
language plpgsql security invoker set search_path = public
as $$
declare
  e     jsonb;
  v_lot uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  if p_ref_type not in ('manual', 'receipt') then raise exception 'VALIDATION'; end if;

  for e in select * from jsonb_array_elements(p_lots) loop
    if not exists (select 1 from ingredients
                   where id = (e->>'ingredient_id')::uuid and store_id = p_store_id and is_active) then
      raise exception 'NOT_FOUND';
    end if;

    insert into stock_lots (store_id, ingredient_id, quantity, remaining, unit_price,
                            received_at, expires_at, expiry_source, receipt_id)
    values (p_store_id,
            (e->>'ingredient_id')::uuid,
            (e->>'quantity')::numeric,
            (e->>'quantity')::numeric,
            (e->>'unit_price')::numeric,
            (e->>'received_at')::date,
            (e->>'expires_at')::date,
            (e->>'expiry_source')::expiry_source,
            case when p_ref_type = 'receipt' then p_ref_id end)
    returning id into v_lot;

    insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, ref_type, ref_id)
    values (p_store_id, (e->>'ingredient_id')::uuid, v_lot, 'in', (e->>'quantity')::numeric,
            p_ref_type, coalesce(p_ref_id, v_lot));

    return next v_lot;
  end loop;
end $$;

-- 5.2 apply_consumption — 묶음 차감 (공통, 다른 RPC 안에서만 호출)
create or replace function apply_consumption(
  p_store_id  uuid,
  p_type      movement_type,   -- 'use' | 'waste'
  p_ref_type  text,            -- 'sales' | 'usage' | 'waste'
  p_ref_id    uuid,
  p_reason    text,
  p_memo      text,
  p_base_date date,            -- 'use'일 때 판매일·사용일. 이 날 기준 경과 묶음은 거부 (BR-02)
  p_items     jsonb            -- [{lot_id, qty}]  (lot_id 오름차순 정렬해서 전달)
) returns void
language plpgsql security invoker set search_path = public
as $$
declare
  e           jsonb;
  v_qty       numeric;
  v_remaining numeric;
  v_expires   date;
  v_ing       uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  if p_type not in ('use', 'waste') then raise exception 'VALIDATION'; end if;

  for e in select * from jsonb_array_elements(p_items) loop
    v_qty := (e->>'qty')::numeric;
    if v_qty <= 0 then raise exception 'VALIDATION'; end if;

    select remaining, expires_at, ingredient_id into v_remaining, v_expires, v_ing
      from stock_lots
     where id = (e->>'lot_id')::uuid and store_id = p_store_id
       for update;

    if not found then raise exception 'NOT_FOUND'; end if;
    -- 계획 이후 재고가 바뀌었거나, 사용 차감인데 기준일에 경과한 묶음이면 다시 계획하게 한다
    if v_remaining < v_qty then raise exception 'STOCK_CONFLICT'; end if;
    if p_type = 'use' and v_expires is not null and v_expires < p_base_date then
      raise exception 'STOCK_CONFLICT';
    end if;

    update stock_lots set remaining = remaining - v_qty where id = (e->>'lot_id')::uuid;

    insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, reason, memo, ref_type, ref_id)
    values (p_store_id, v_ing, (e->>'lot_id')::uuid, p_type, -v_qty, p_reason, p_memo, p_ref_type,
            coalesce(p_ref_id, (e->>'lot_id')::uuid));
  end loop;
end $$;

-- 5.3 record_daily_sales — 판매 마감
create or replace function record_daily_sales(
  p_store_id  uuid,
  p_sold_on   date,
  p_sales     jsonb,   -- [{menu_id, qty}]
  p_plan      jsonb,   -- [{lot_id, qty}]  FEFO 계획 (경과 묶음 제외, lot_id 오름차순)
  p_shortages jsonb    -- [{ingredient_id, required_qty, short_qty}]
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_day uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;

  -- 같은 날짜를 다시 마감하는 기능(FR-USE-06)은 확장. 구현 전에는 거부한다 (07_DB 10.2에서 교체)
  if exists (select 1 from sales_days where store_id = p_store_id and sold_on = p_sold_on) then
    raise exception 'CONFLICT';
  end if;

  insert into sales_days (store_id, sold_on, shortages)
  values (p_store_id, p_sold_on, p_shortages)
  returning id into v_day;

  insert into sales (store_id, sales_day_id, menu_id, qty)
  select p_store_id, v_day, (x->>'menu_id')::uuid, (x->>'qty')::int
    from jsonb_array_elements(p_sales) x
   where (x->>'qty')::int > 0;

  -- 차감 적용 (잔량·경과 재검증 포함)
  perform apply_consumption(p_store_id, 'use', 'sales', v_day, null, null, p_sold_on, p_plan);

  return v_day;
end $$;

-- 5.4 record_usage — 직접 사용
create or replace function record_usage(
  p_store_id uuid,
  p_used_on  date,
  p_items    jsonb,   -- [{ingredient_id, qty, short_qty, memo}]  재료 중복 없음, ingredient_id 오름차순
  p_plan     jsonb    -- [{ingredient_id, lot_id, qty}]  FEFO 계획 (경과 묶음 제외)
) returns setof uuid
language plpgsql security invoker set search_path = public
as $$
declare
  e     jsonb;
  v_rec uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;

  for e in select * from jsonb_array_elements(p_items) loop
    insert into usage_records (store_id, used_on, ingredient_id, qty, short_qty, memo)
    values (p_store_id, p_used_on, (e->>'ingredient_id')::uuid, (e->>'qty')::numeric,
            coalesce((e->>'short_qty')::numeric, 0), e->>'memo')
    returning id into v_rec;

    -- 이 재료의 계획만 골라 차감. 이력의 ref_id는 사용 기록 id
    perform apply_consumption(p_store_id, 'use', 'usage', v_rec, null, e->>'memo', p_used_on,
      coalesce((select jsonb_agg(jsonb_build_object('lot_id', x->>'lot_id', 'qty', x->>'qty')
                                 order by x->>'lot_id')
                  from jsonb_array_elements(p_plan) x
                 where x->>'ingredient_id' = e->>'ingredient_id'), '[]'::jsonb));

    return next v_rec;
  end loop;
end $$;

-- 5.5 record_waste — 폐기
create or replace function record_waste(
  p_store_id uuid,
  p_lot_id   uuid,
  p_qty      numeric,
  p_reason   text,     -- 'expired' | 'spoiled' | 'mistake' | 'other'
  p_memo     text
) returns void
language plpgsql security invoker set search_path = public
as $$
begin
  if p_reason not in ('expired', 'spoiled', 'mistake', 'other') then raise exception 'VALIDATION'; end if;
  -- 폐기는 경과 묶음도 대상이므로 기준일 검사를 하지 않는다 (p_base_date = null)
  perform apply_consumption(p_store_id, 'waste', 'waste', p_lot_id, p_reason, p_memo, null,
                            jsonb_build_array(jsonb_build_object('lot_id', p_lot_id, 'qty', p_qty)));
end $$;

-- 5.6 save_order — 발주 목록 저장
-- 재고를 바꾸지 않지만, 목록과 품목을 한 번에 교체해야 해서 함수로 묶는다
create or replace function save_order(
  p_store_id   uuid,
  p_order_id   uuid,      -- 새 목록이면 null
  p_order_date date,
  p_memo       text,
  p_items      jsonb      -- [{ingredient_id, qty}]
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;

  if exists (select 1 from jsonb_array_elements(p_items) x
              where not exists (select 1 from ingredients
                                 where id = (x->>'ingredient_id')::uuid and store_id = p_store_id)) then
    raise exception 'NOT_FOUND';
  end if;

  if p_order_id is null then
    insert into purchase_orders (store_id, order_date, memo)
    values (p_store_id, p_order_date, p_memo)
    returning id into v_id;
  else
    -- 작성중(draft)일 때만 수정할 수 있다 (FR-ORD-03)
    update purchase_orders
       set order_date = p_order_date, memo = p_memo, updated_at = now()
     where id = p_order_id and store_id = p_store_id and status = 'draft'
    returning id into v_id;
    if v_id is null then raise exception 'CONFLICT'; end if;
    delete from purchase_order_items where order_id = v_id;
  end if;

  -- 발주량 0 이하 품목은 저장하지 않는다 (UC-09 3a)
  insert into purchase_order_items (order_id, store_id, ingredient_id, qty)
  select v_id, p_store_id, (x->>'ingredient_id')::uuid, (x->>'qty')::numeric
    from jsonb_array_elements(p_items) x
   where (x->>'qty')::numeric > 0;

  return v_id;
end $$;

-- 5.7 adjust_lot — 실사 보정 (확장, FR-USE-07)
create or replace function adjust_lot(
  p_lot_id        uuid,
  p_new_remaining numeric,
  p_memo          text
) returns numeric
language plpgsql security invoker set search_path = public
as $$
declare
  v_lot   stock_lots%rowtype;
  v_delta numeric;
begin
  select * into v_lot from stock_lots where id = p_lot_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not is_my_store(v_lot.store_id) then raise exception 'FORBIDDEN'; end if;
  if p_new_remaining < 0 or p_new_remaining > v_lot.quantity then raise exception 'VALIDATION'; end if;

  v_delta := p_new_remaining - v_lot.remaining;
  if v_delta = 0 then return 0; end if;

  update stock_lots set remaining = p_new_remaining where id = p_lot_id;
  insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, reason, memo, ref_type, ref_id)
  values (v_lot.store_id, v_lot.ingredient_id, p_lot_id, 'adjust', v_delta, 'count', p_memo, 'adjust', p_lot_id);
  return v_delta;
end $$;

-- 5.8 increment_ai_usage — AI 호출 한도
create or replace function increment_ai_usage(p_store_id uuid, p_today date, p_limit int)
returns int
language plpgsql security invoker set search_path = public
as $$
declare v_count int;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  insert into ai_usage (store_id, used_on, count) values (p_store_id, p_today, 1)
  on conflict (store_id, used_on) do update set count = ai_usage.count + 1
  returning count into v_count;
  if v_count > p_limit then raise exception 'RATE_LIMITED'; end if;
  return v_count;
end $$;
