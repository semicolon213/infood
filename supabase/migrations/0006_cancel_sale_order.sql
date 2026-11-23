-- supabase/migrations/0006_cancel_sale_order.sql
-- 주문 취소 (WBS 4.8a). 주문별 판매로 줄인 재고를 같은 묶음에 되돌린다.
-- stock_movements는 추가만 하므로(AGENTS 4) 반대 방향 'adjust' 이력(reason 'sales_revision', ref_id = 주문 id)으로 남긴다.

alter table sale_orders add column cancelled_at timestamptz;

create or replace function cancel_sale_order(p_store_id uuid, p_order_id uuid)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_cancelled timestamptz;
  m           record;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  select cancelled_at into v_cancelled from sale_orders where id = p_order_id and store_id = p_store_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_cancelled is not null then raise exception 'CONFLICT'; end if;

  -- 이 주문이 묶음별로 줄인 양 (lot_id 순으로 잠가 교착을 피한다)
  for m in
    select lot_id, ingredient_id, -sum(delta) as qty
      from stock_movements
     where store_id = p_store_id and ref_type = 'sales' and ref_id = p_order_id and type = 'use'
     group by lot_id, ingredient_id
     order by lot_id
  loop
    -- 그 뒤 폐기·사용이 있었어도 묶음에서 빠진 양이 이 주문 몫 이상이므로 quantity를 넘지 않는다
    update stock_lots set remaining = remaining + m.qty where id = m.lot_id;
    insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, reason, memo, ref_type, ref_id)
    values (p_store_id, m.ingredient_id, m.lot_id, 'adjust', m.qty, 'sales_revision', '주문 취소', 'sales', p_order_id);
  end loop;

  update sale_orders set cancelled_at = now() where id = p_order_id;
end $$;

-- 취소한 주문만 있는 날짜는 판매 마감을 다시 받을 수 있게 한다 (0005 본문에서 sale_orders 조건만 바꿈)
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
     or exists (select 1 from sale_orders where store_id = p_store_id and sold_on = p_sold_on and cancelled_at is null) then
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
