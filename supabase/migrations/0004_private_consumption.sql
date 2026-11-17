-- supabase/migrations/0004_private_consumption.sql
-- WBS 3.4. apply_consumption을 private 스키마로 옮겨 PostgREST(/rest/v1/rpc)로 직접 부르지 못하게 한다 (PR #3 리뷰).
-- PostgREST는 config.toml [api] schemas(public, graphql_public)만 노출하므로 private 함수는 REST에 나타나지 않는다.
-- 함수가 security invoker라 다른 RPC 안에서 부를 때 호출자(authenticated)에게 스키마 usage·execute가 있어야 한다.
-- 정의는 docs/07_DB.md 5.2~5.5와 같다. 0003의 함수 본문은 그대로이고 호출만 private.apply_consumption으로 바꾼다.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.apply_consumption(uuid, public.movement_type, text, uuid, text, text, date, jsonb) set schema private;
revoke all on function private.apply_consumption(uuid, public.movement_type, text, uuid, text, text, date, jsonb) from public, anon;
grant execute on function private.apply_consumption(uuid, public.movement_type, text, uuid, text, text, date, jsonb) to authenticated;

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
  perform private.apply_consumption(p_store_id, 'use', 'sales', v_day, null, null, p_sold_on, p_plan);

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
    perform private.apply_consumption(p_store_id, 'use', 'usage', v_rec, null, e->>'memo', p_used_on,
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
  perform private.apply_consumption(p_store_id, 'waste', 'waste', p_lot_id, p_reason, p_memo, null,
                                    jsonb_build_array(jsonb_build_object('lot_id', p_lot_id, 'qty', p_qty)));
end $$;
