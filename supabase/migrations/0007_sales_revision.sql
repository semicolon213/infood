-- supabase/migrations/0007_sales_revision.sql
-- WBS 4.5, FR-USE-06: 같은 날짜 판매 재입력. 이미 마감한 날짜면 CONFLICT 대신
-- 그날 판매 차감을 묶음별로 되돌리고(반대 방향 adjust 이력, reason 'sales_revision') 판매 기록을 교체한 뒤 다시 차감한다 (07_DB 10.2).
-- 주문별 판매(sale_orders)가 있는 날짜는 그대로 CONFLICT (이중 차감 방지, 0005·0006).
-- 서버 계획(planConsumption)은 되돌린 잔량을 기준으로 만든다 (UT-FEFO-06). apply_consumption이 잔량을 다시 검사한다.

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
  r     record;
begin
  if not is_my_store(p_store_id) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from sale_orders where store_id = p_store_id and sold_on = p_sold_on and cancelled_at is null) then
    raise exception 'CONFLICT';
  end if;

  -- 같은 날짜 동시 재입력은 이 행 잠금으로 순서를 정한다
  select id into v_day from sales_days where store_id = p_store_id and sold_on = p_sold_on for update;

  if v_day is null then
    insert into sales_days (store_id, sold_on, shortages)
    values (p_store_id, p_sold_on, p_shortages)
    returning id into v_day;
  else
    -- 1) 기존 차감 되돌리기 (순 차감량 기준, lot_id 순으로 잠금)
    for r in
      select m.lot_id, m.ingredient_id, -sum(m.delta) as consumed
        from stock_movements m
       where m.store_id = p_store_id and m.ref_type = 'sales' and m.ref_id = v_day
       group by m.lot_id, m.ingredient_id
      having sum(m.delta) < 0
       order by m.lot_id
    loop
      update stock_lots set remaining = remaining + r.consumed where id = r.lot_id;
      insert into stock_movements (store_id, ingredient_id, lot_id, type, delta, reason, memo, ref_type, ref_id)
      values (p_store_id, r.ingredient_id, r.lot_id, 'adjust', r.consumed, 'sales_revision', '판매 재입력', 'sales', v_day);
    end loop;
    -- 2) 판매 기록 교체
    delete from sales where sales_day_id = v_day;
    update sales_days set shortages = p_shortages, updated_at = now() where id = v_day;
  end if;

  insert into sales (store_id, sales_day_id, menu_id, qty)
  select p_store_id, v_day, (x->>'menu_id')::uuid, (x->>'qty')::int
    from jsonb_array_elements(p_sales) x
   where (x->>'qty')::int > 0;
  -- 3) 새 차감 (잔량·경과 재검증 포함)
  perform private.apply_consumption(p_store_id, 'use', 'sales', v_day, null, null, p_sold_on, p_plan);
  return v_day;
end $$;
