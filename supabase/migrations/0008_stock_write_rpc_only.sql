-- supabase/migrations/0008_stock_write_rpc_only.sql
-- AGENTS 규칙 3·4를 DB에서 강제한다 (4.4 대조 중 발견, 11/24).
-- 이전에는 stock_lots에 매장 주인 전체 권한(for all) 정책이 있어 REST로 remaining을 직접 바꿀 수 있었고,
-- stock_movements도 직접 insert할 수 있었다. RPC가 security invoker라 호출자 권한이 필요했기 때문이다.
--
-- 바꾼 뒤: 사용자(anon·authenticated)는 두 테이블을 조회만 한다.
-- 재고를 바꾸는 함수만 security definer(소유자 권한)로 돌린다. 이 함수들은 모두 첫 줄에서 is_my_store로 매장을 확인하고,
-- 묶음·이력을 store_id = p_store_id(또는 묶음의 store_id 확인)로만 찾으므로 RLS 없이도 다른 매장 데이터에 닿지 않는다.
-- search_path는 각 함수에 이미 public으로 고정돼 있다.

-- 1) 테이블: 조회만
drop policy if exists stock_lots_store on stock_lots;
create policy stock_lots_select on stock_lots for select using (is_my_store(store_id));
drop policy if exists movements_insert on stock_movements;
revoke insert, update, delete, truncate on stock_lots, stock_movements from anon, authenticated;

-- 2) 재고를 직접 바꾸는 함수 → security definer
alter function public.receive_stock(uuid, text, uuid, jsonb) security definer;
alter function private.apply_consumption(uuid, public.movement_type, text, uuid, text, text, date, jsonb) security definer;
alter function public.adjust_lot(uuid, numeric, text) security definer;
alter function public.cancel_sale_order(uuid, uuid) security definer;
-- 판매 재입력(0007)은 되돌림에서 stock_lots를 직접 갱신한다
alter function public.record_daily_sales(uuid, date, jsonb, jsonb, jsonb) security definer;

-- 3) 로그인하지 않은 호출은 함수 입구에서도 막는다 (is_my_store가 막지만 노출 면을 줄인다)
revoke execute on function public.receive_stock(uuid, text, uuid, jsonb) from public, anon;
revoke execute on function public.adjust_lot(uuid, numeric, text) from public, anon;
revoke execute on function public.cancel_sale_order(uuid, uuid) from public, anon;
revoke execute on function public.record_daily_sales(uuid, date, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.receive_stock(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.adjust_lot(uuid, numeric, text) to authenticated;
grant execute on function public.cancel_sale_order(uuid, uuid) to authenticated;
grant execute on function public.record_daily_sales(uuid, date, jsonb, jsonb, jsonb) to authenticated;
