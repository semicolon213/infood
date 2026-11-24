-- supabase/migrations/0010_sales_qty_by_menu.sql
-- WBS 5.2 점검 (11/24). 추천 입력의 최근 7일 판매량(FR-REC-01, "판매량 우선" 기준)을 DB에서 합산한다.
-- 이전에는 sales 행과 sale_orders 행을 그대로 가져와 서버에서 더했는데, PostgREST는 한 번에 최대 1000행만 돌려주므로
-- (config.toml max_rows) 포스로 하루 수백 건이 들어오는 매장은 앞의 1000건만 합산되고 오류도 나지 않았다.
-- 메뉴 수만큼만 돌려주므로 행 제한에 걸리지 않는다.
-- 기간은 서버가 todayKST() 기준으로 넘긴다 (AGENTS 5). security invoker라 RLS로 내 매장 행만 보인다.

create or replace function sales_qty_by_menu(p_store_id uuid, p_from date, p_to date)
returns table (menu_id uuid, qty bigint)
language sql stable security invoker set search_path = public
as $$
  select x.menu_id, sum(x.qty)::bigint
    from (
      -- 판매 마감
      select s.menu_id, s.qty
        from sales s
        join sales_days d on d.id = s.sales_day_id
       where s.store_id = p_store_id and d.sold_on between p_from and p_to
      union all
      -- 주문별 판매 (취소한 주문 제외, 4.8)
      select (i->>'menu_id')::uuid, (i->>'qty')::int
        from sale_orders o
       cross join jsonb_array_elements(o.items) i
       where o.store_id = p_store_id and o.cancelled_at is null and o.sold_on between p_from and p_to
    ) x
   group by x.menu_id
   order by x.menu_id;
$$;

revoke execute on function sales_qty_by_menu(uuid, date, date) from public, anon;
grant execute on function sales_qty_by_menu(uuid, date, date) to authenticated;
