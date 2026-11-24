-- supabase/migrations/0012_sales_revision_net.sql
-- WBS 4.5 후속 (#74 리뷰, 11/24). 판매 재입력·주문 취소의 되돌림이 입고 수량을 넘던 문제.
--
-- 문제: 0007은 그날 차감을 전부 되돌린 뒤(remaining + 차감량) 다시 차감했다. 마감 뒤 실사 보정(adjust_lot)으로 잔량을 늘리면
--   되돌린 값이 quantity를 넘어 remaining <= quantity 제약에 걸리고 INTERNAL로 실패했다 (예: 500g 묶음, 300 판매 → 200, 실사 450, 재입력 → 750).
--   되돌림만 quantity에서 자르면 실패는 없지만, 판매량이 같아도 잔량이 줄어든다(450 → 200). 실사로 확인한 잔량을 잃는다.
-- 고친 뒤: 재입력은 묶음마다 (새 계획 − 그날 순 차감량)의 차이만 반영한다.
--   차이 > 0이면 그만큼 더 차감('use', 잔량·경과 재검증 → STOCK_CONFLICT), 차이 < 0이면 그만큼 되돌림('adjust', reason 'sales_revision', quantity까지).
--   판매량이 같으면 잔량이 바뀌지 않는다. 그날 이력의 합은 늘 실제로 바뀐 양과 같아 다음 재입력도 같은 계산을 쓴다.
--   서버 계획(withRestored, UT-FEFO-06)은 그대로다: 계획량 ≤ 현재 잔량 + 그날 차감량이므로 차이 ≤ 현재 잔량.
-- 주문 취소(cancel_sale_order)는 한 번만 되돌리므로 되돌림을 quantity까지로 자른다.
-- 같은 날짜 판매 마감과 주문별 판매가 동시에 오면 둘 다 "상대 기록 없음"을 확인하고 두 번 차감했다 (#90 QA 재현, 1000 → 800).
--   record_daily_sales·record_sale_order 첫머리에 매장+판매일 트랜잭션 잠금(pg_advisory_xact_lock)을 걸어 한쪽씩 처리한다. 늦은 쪽은 CONFLICT.
-- 세 함수 모두 0008·0009와 같이 security definer, 첫 줄 is_my_store, 묶음·이력은 store_id = p_store_id로만 찾는다.
-- search_path는 0010(#90)과 같이 public, pg_temp로 둔다 (create or replace가 함수 설정을 다시 쓰므로 여기서도 지정).

create or replace function record_daily_sales(
  p_store_id  uuid,
  p_sold_on   date,
  p_sales     jsonb,
  p_plan      jsonb,
  p_shortages jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_day uuid;
  r     record;
  v_lot stock_lots%rowtype;
  v_add numeric;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  -- 같은 매장·판매일의 마감·주문별 판매를 한쪽씩 (record_sale_order와 같은 키)
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || '/' || p_sold_on::text, 0));
  if exists (select 1 from sale_orders where store_id = p_store_id and sold_on = p_sold_on and cancelled_at is null) then
    raise exception 'CONFLICT';
  end if;

  -- 같은 날짜 동시 재입력은 이 행 잠금으로 순서를 정한다
  select id into v_day from sales_days where store_id = p_store_id and sold_on = p_sold_on for update;

  if v_day is null then
    insert into sales_days (store_id, sold_on, shortages)
    values (p_store_id, p_sold_on, p_shortages)
    returning id into v_day;
    insert into sales (store_id, sales_day_id, menu_id, qty)
    select p_store_id, v_day, (x->>'menu_id')::uuid, (x->>'qty')::int
      from jsonb_array_elements(p_sales) x
     where (x->>'qty')::int > 0;
    -- 첫 마감: 차감 (잔량·경과 재검증 포함)
    perform private.apply_consumption(p_store_id, 'use', 'sales', v_day, null, null, p_sold_on, p_plan);
    return v_day;
  end if;

  -- 재입력: 판매 기록 교체
  delete from sales where sales_day_id = v_day;
  update sales_days set shortages = p_shortages, updated_at = now() where id = v_day;
  insert into sales (store_id, sales_day_id, menu_id, qty)
  select p_store_id, v_day, (x->>'menu_id')::uuid, (x->>'qty')::int
    from jsonb_array_elements(p_sales) x
   where (x->>'qty')::int > 0;

  if exists (select 1 from jsonb_array_elements(p_plan) e where (e->>'qty')::numeric <= 0) then
    raise exception 'VALIDATION';
  end if;

  -- 묶음마다 (새 계획 − 그날 순 차감량). lot_id 순으로 잠가 교착을 피한다
  for r in
    with old as (
      select m.lot_id, -sum(m.delta) as qty
        from stock_movements m
       where m.store_id = p_store_id and m.ref_type = 'sales' and m.ref_id = v_day
       group by m.lot_id
    ), new as (
      select (e->>'lot_id')::uuid as lot_id, sum((e->>'qty')::numeric) as qty
        from jsonb_array_elements(p_plan) e
       group by 1
    )
    select coalesce(n.lot_id, o.lot_id) as lot_id, coalesce(n.qty, 0) - coalesce(o.qty, 0) as diff
      from new n full join old o on o.lot_id = n.lot_id
     order by 1
  loop
    continue when r.diff = 0;
    select * into v_lot from stock_lots where id = r.lot_id and store_id = p_store_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;

    if r.diff > 0 then
      -- 더 차감: 계획 이후 잔량이 줄었거나 판매일 기준 경과 묶음이면 다시 계획하게 한다 (apply_consumption과 같은 검사)
      if v_lot.remaining < r.diff then raise exception 'STOCK_CONFLICT'; end if;
      if v_lot.expires_at is not null and v_lot.expires_at < p_sold_on then raise exception 'STOCK_CONFLICT'; end if;
      update stock_lots set remaining = remaining - r.diff where id = r.lot_id;
      insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, reason, memo, ref_type, ref_id)
      values (p_store_id, v_lot.ingredient_id, r.lot_id, 'use', -r.diff, null, null, 'sales', v_day);
    else
      -- 되돌림: 입고 수량까지만 (실사 보정으로 잔량이 늘었을 수 있다)
      v_add := least(-r.diff, v_lot.quantity - v_lot.remaining);
      continue when v_add <= 0;
      update stock_lots set remaining = remaining + v_add where id = r.lot_id;
      insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, reason, memo, ref_type, ref_id)
      values (p_store_id, v_lot.ingredient_id, r.lot_id, 'adjust', v_add, 'sales_revision', '판매 재입력', 'sales', v_day);
    end if;
  end loop;
  return v_day;
end $$;

create or replace function cancel_sale_order(p_store_id uuid, p_order_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cancelled timestamptz;
  m           record;
  v_add       numeric;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  select cancelled_at into v_cancelled from sale_orders where id = p_order_id and store_id = p_store_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_cancelled is not null then raise exception 'CONFLICT'; end if;

  -- 이 주문이 줄인 묶음을 lot_id 순으로 먼저 잠근다 (교착 방지, 잠근 뒤의 잔량으로 상한 계산)
  perform 1 from stock_lots
   where store_id = p_store_id
     and id in (select lot_id from stock_movements where store_id = p_store_id and ref_type = 'sales' and ref_id = p_order_id and type = 'use')
   order by id
     for update;

  -- 이 주문이 묶음별로 줄인 양
  for m in
    select mv.lot_id, mv.ingredient_id, -sum(mv.delta) as qty, l.quantity, l.remaining
      from stock_movements mv
      join stock_lots l on l.id = mv.lot_id and l.store_id = p_store_id
     where mv.store_id = p_store_id and mv.ref_type = 'sales' and mv.ref_id = p_order_id and mv.type = 'use'
     group by mv.lot_id, mv.ingredient_id, l.quantity, l.remaining
     order by mv.lot_id
  loop
    -- 주문 뒤 실사 보정으로 잔량이 늘었으면 입고 수량까지만 되돌린다
    v_add := least(m.qty, m.quantity - m.remaining);
    continue when v_add <= 0;
    update stock_lots set remaining = remaining + v_add where id = m.lot_id;
    insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, reason, memo, ref_type, ref_id)
    values (p_store_id, m.ingredient_id, m.lot_id, 'adjust', v_add, 'sales_revision', '주문 취소', 'sales', p_order_id);
  end loop;

  update sale_orders set cancelled_at = now() where id = p_order_id;
end $$;

create or replace function record_sale_order(
  p_store_id    uuid,
  p_sold_on     date,
  p_source      text,
  p_external_id text,
  p_items       jsonb,   -- [{menu_id, qty}]
  p_plan        jsonb,   -- [{lot_id, qty}]  FEFO 계획 (경과 묶음 제외, lot_id 오름차순)
  p_shortages   jsonb
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  -- 같은 매장·판매일의 마감·주문별 판매를 한쪽씩 (record_daily_sales와 같은 키)
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || '/' || p_sold_on::text, 0));
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
