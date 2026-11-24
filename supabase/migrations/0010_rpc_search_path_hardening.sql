-- WBS 4.4: 보안 1번 QA 후속. 0008(PR #79)·0009(PR #82) 뒤에 적용한다.
-- 함수 본문은 유지해 0007의 판매 재입력 구현을 보존한다.
do $$
begin
  -- 마이그레이션 번호만 믿지 않고 API 역할의 재고 쓰기 권한과 RPC 실행 모드를 확인한다.
  if exists (
    select 1
      from unnest(array['anon', 'authenticated']) as roles(role_name)
      cross join unnest(array['stock_lots', 'stock_movements']) as tables(table_name)
      cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as privileges(privilege_name)
     where has_table_privilege(role_name, 'public.' || table_name, privilege_name)
  ) or exists (
    select 1 from pg_catalog.pg_proc
     where oid in (
       'public.increment_ai_usage(uuid,date,integer)'::regprocedure,
       'public.record_daily_sales(uuid,date,jsonb,jsonb,jsonb)'::regprocedure,
       'public.record_sale_order(uuid,date,text,text,jsonb,jsonb,jsonb)'::regprocedure,
       'public.cancel_sale_order(uuid,uuid)'::regprocedure,
       'private.apply_consumption(uuid,public.movement_type,text,uuid,text,text,date,jsonb)'::regprocedure
     ) and not prosecdef
  ) then
    raise exception 'Apply 0008_stock_write_rpc_only.sql and 0009_rpc_only_sales_ai.sql before 0010';
  end if;
end $$;

-- DEFINER가 조회하는 public에 API 사용자가 가짜 객체를 만들지 못하게 한다.
revoke create on schema public from public, anon, authenticated;
revoke insert, update, delete, truncate on table
  public.ai_usage, public.sales_days, public.sales, public.sale_orders
from public, anon, authenticated;

-- PostgreSQL 권장 순서: 신뢰할 스키마를 먼저, pg_temp를 마지막에 둔다.
alter function public.is_my_store(uuid) set search_path = public, pg_temp;
alter function private.apply_consumption(uuid, public.movement_type, text, uuid, text, text, date, jsonb)
  set search_path = public, pg_temp;
alter function public.increment_ai_usage(uuid, date, integer)
  set search_path = public, pg_temp;
alter function public.record_daily_sales(uuid, date, jsonb, jsonb, jsonb)
  set search_path = public, pg_temp;
alter function public.record_sale_order(uuid, date, text, text, jsonb, jsonb, jsonb)
  set search_path = public, pg_temp;
alter function public.cancel_sale_order(uuid, uuid)
  set search_path = public, pg_temp;
