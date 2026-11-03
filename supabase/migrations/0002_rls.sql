-- supabase/migrations/0002_rls.sql
-- WBS 2.7. 정의는 docs/07_DB.md v0.3 4장과 같다.
-- is_my_store()와 stores RLS·stores_owner 정책은 0000_stores.sql(WBS 2.4)에서 만들었으므로 여기서는 빼고 쓴다.

alter table ingredients          enable row level security;
alter table ingredient_units     enable row level security;
alter table stock_lots           enable row level security;
alter table stock_movements      enable row level security;
alter table menus                enable row level security;
alter table recipe_items         enable row level security;
alter table sales_days           enable row level security;
alter table sales                enable row level security;
alter table usage_records        enable row level security;
alter table purchase_orders      enable row level security;
alter table purchase_order_items enable row level security;
alter table recommendations      enable row level security;
alter table ai_usage             enable row level security;

-- 매장 소유 테이블: 같은 패턴
do $$
declare t text;
begin
  foreach t in array array[
    'ingredients', 'ingredient_units', 'stock_lots', 'menus', 'recipe_items',
    'sales_days', 'sales', 'usage_records', 'purchase_orders', 'purchase_order_items',
    'recommendations', 'ai_usage'
  ] loop
    execute format(
      'create policy %I on %I for all using (is_my_store(store_id)) with check (is_my_store(store_id))',
      t || '_store', t);
  end loop;
end $$;

-- 이력은 추가·조회만 (수정·삭제 정책 없음 → 거부)
create policy movements_select on stock_movements for select using (is_my_store(store_id));
create policy movements_insert on stock_movements for insert with check (is_my_store(store_id));
