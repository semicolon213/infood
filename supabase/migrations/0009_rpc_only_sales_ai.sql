-- supabase/migrations/0009_rpc_only_sales_ai.sql
-- WBS 5.2 점검 (11/24). 0008과 같은 방식으로 판매 기록·AI 사용 횟수도 RPC로만 바꾸게 한다.
-- 이전에는 아래 테이블에 매장 주인 전체 권한(for all) 정책이 있어 브라우저의 anon 키로 REST를 직접 부를 수 있었다.
--   ai_usage    : 오늘 카운트를 지우면 AI 하루 한도(increment_ai_usage)를 우회한다 (팀 AI 키 비용)
--   sales_days·sales : 마감 기록을 지우고 같은 날짜를 다시 마감하면 재고가 두 번 줄어든다
--   sale_orders : 주문을 지우면 같은 주문번호가 중복 확인을 통과해 두 번 차감되고, cancelled_at을 직접 바꾸면 재고를 되돌리지 않고 취소된다
--
-- 바꾼 뒤: 사용자(anon·authenticated)는 네 테이블을 조회만 한다.
-- 이 테이블에 쓰는 함수만 security definer(소유자 권한)로 돌린다. 모두 첫 줄에서 is_my_store로 매장을 확인하고
-- 행을 store_id = p_store_id로만 찾거나 쓴다. search_path는 각 함수에 이미 public으로 고정돼 있다.
-- 함수 본문은 바꾸지 않는다 (0007·0008과 적용 순서가 바뀌어도 같은 결과).

-- 1) 테이블: 조회만
drop policy if exists ai_usage_store on ai_usage;
drop policy if exists sales_days_store on sales_days;
drop policy if exists sales_store on sales;
drop policy if exists sale_orders_all on sale_orders;
create policy ai_usage_select    on ai_usage    for select using (is_my_store(store_id));
create policy sales_days_select  on sales_days  for select using (is_my_store(store_id));
create policy sales_select       on sales       for select using (is_my_store(store_id));
create policy sale_orders_select on sale_orders for select using (is_my_store(store_id));
revoke insert, update, delete, truncate on ai_usage, sales_days, sales, sale_orders from anon, authenticated;

-- 2) 이 테이블에 쓰는 함수 → security definer
alter function public.increment_ai_usage(uuid, date, int) security definer;
alter function public.record_daily_sales(uuid, date, jsonb, jsonb, jsonb) security definer;
alter function public.record_sale_order(uuid, date, text, text, jsonb, jsonb, jsonb) security definer;
alter function public.cancel_sale_order(uuid, uuid) security definer;

-- 3) 로그인하지 않은 호출은 함수 입구에서도 막는다 (is_my_store가 막지만 노출 면을 줄인다)
revoke execute on function public.increment_ai_usage(uuid, date, int) from public, anon;
revoke execute on function public.record_daily_sales(uuid, date, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.record_sale_order(uuid, date, text, text, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.cancel_sale_order(uuid, uuid) from public, anon;
grant execute on function public.increment_ai_usage(uuid, date, int) to authenticated;
grant execute on function public.record_daily_sales(uuid, date, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.record_sale_order(uuid, date, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.cancel_sale_order(uuid, uuid) to authenticated;
