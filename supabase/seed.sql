-- WBS 2.9 / SRS C-02, BR-02·04 / docs/07_DB.md v0.3
-- 로컬 개발 전용 가상 매장. 고정 기준일: 2026-11-03 (KST).
-- 2.7 마이그레이션을 적용한 로컬 Supabase에서 db reset으로 통합 확인해야 한다.
-- 실행일 상대 날짜 전환은 3.5a(lib/stock)·todayKST() 준비 후 담당자와 연결한다.
-- SQL에서 now()/current_date로 오늘·기한을 계산하거나 FEFO를 다시 구현하지 않는다.
-- 수량·날짜·차감 계획은 고정 fixture다. 판매·직접 사용 시 재료당 묶음이 하나뿐이다.
-- 재고와 이력은 RPC로만 생성한다. 이 시드는 초기화된 로컬 DB에서 한 번 실행한다.
-- 고정 ID: 사용자 1000..., 매장 2000..., 재료 3000...001~030, 메뉴 4000...001~015.

begin;

do $prerequisites$
begin
  if to_regclass('public.ingredients') is null
     or to_regclass('public.recipe_items') is null
     or to_regprocedure('public.receive_stock(uuid,text,uuid,jsonb)') is null
     or to_regprocedure('public.record_daily_sales(uuid,date,jsonb,jsonb,jsonb)') is null
     or to_regprocedure('public.record_usage(uuid,date,jsonb,jsonb)') is null
     or to_regprocedure('public.record_waste(uuid,uuid,numeric,text,text)') is null
     or to_regprocedure('public.save_order(uuid,uuid,date,text,jsonb)') is null then
    raise exception 'WBS 2.9: 2.7의 테이블·RLS·RPC 마이그레이션을 먼저 적용해 주세요';
  end if;
  if exists (select 1 from public.stores where id = '20000000-0000-4000-8000-000000000001') then
    raise exception 'WBS 2.9: 이미 시드 매장이 있어요. 로컬 db reset으로 재현해 주세요';
  end if;
end
$prerequisites$;

-- 로컬 Auth fixture: 실제 이메일·개인정보·서비스 키·사용 가능한 비밀번호 없음.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'demo@jaegokok.example.invalid', '',
  '2026-11-03T00:00:00+09:00', '{"provider":"email","providers":["email"]}', '{}',
  '2026-11-03T00:00:00+09:00', '2026-11-03T00:00:00+09:00'
);
insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '{"sub":"10000000-0000-4000-8000-000000000001","email":"demo@jaegokok.example.invalid","email_verified":true}',
  'email', '2026-11-03T00:00:00+09:00', '2026-11-03T00:00:00+09:00'
);
insert into public.stores (id, owner_id, name) values (
  '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '테스트 한식당'
);

-- RPC의 is_my_store와 테이블 RLS도 fixture 사용자의 권한으로 통과해야 한다.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $fixtures$
declare
  v_store constant uuid := '20000000-0000-4000-8000-000000000001';
  v_ingredient uuid;
  v_menu uuid;
  v_lot uuid;
  v_order uuid;
  v_lots jsonb := '{}';
  v_plan jsonb;
  v_sales jsonb;
  r record;
begin
  -- 채소 10·육류 5·수산 4·유제품/계란 4·양념 5·곡류 1·기타 1 = 30종.
  -- shelf는 참고 기본값, 아래 expires는 수동 확인한 고정 기한이다.
  for r in select * from jsonb_to_recordset($data$[
    {"n":1,"name":"양파","category":"vegetable","unit":"g","min":3000,"target":10000,"storage":"fridge","shelf":14,"qty":10000,"cost":2,"expires":"2026-11-03"},
    {"n":2,"name":"대파","category":"vegetable","unit":"g","min":1000,"target":4000,"storage":"fridge","shelf":7,"qty":5000,"cost":3,"expires":"2026-11-04"},
    {"n":3,"name":"당근","category":"vegetable","unit":"g","min":1000,"target":4000,"storage":"fridge","shelf":14,"qty":5000,"cost":2,"expires":"2026-11-10"},
    {"n":4,"name":"감자","category":"vegetable","unit":"g","min":2000,"target":6000,"storage":"room","shelf":21,"qty":8000,"cost":2,"expires":"2026-11-10"},
    {"n":5,"name":"애호박","category":"vegetable","unit":"g","min":500,"target":2000,"storage":"fridge","shelf":7,"qty":3000,"cost":3,"expires":"2026-11-05"},
    {"n":6,"name":"배추김치","category":"vegetable","unit":"g","min":2000,"target":6000,"storage":"fridge","shelf":30,"qty":8000,"cost":4,"expires":"2026-11-19"},
    {"n":7,"name":"시금치","category":"vegetable","unit":"g","min":500,"target":2000,"storage":"fridge","shelf":5,"qty":3000,"cost":4,"expires":"2026-11-06"},
    {"n":8,"name":"콩나물","category":"vegetable","unit":"g","min":500,"target":2000,"storage":"fridge","shelf":4,"qty":3000,"cost":2,"expires":"2026-11-05"},
    {"n":9,"name":"표고버섯","category":"vegetable","unit":"g","min":500,"target":2000,"storage":"fridge","shelf":7,"qty":3000,"cost":6,"expires":"2026-11-06"},
    {"n":10,"name":"마늘","category":"vegetable","unit":"g","min":500,"target":2000,"storage":"fridge","shelf":21,"qty":3000,"cost":5,"expires":"2026-11-10"},
    {"n":11,"name":"돼지고기","category":"meat","unit":"g","min":2000,"target":6000,"storage":"freezer","shelf":90,"qty":8000,"cost":12,"expires":"2026-12-01"},
    {"n":12,"name":"소고기","category":"meat","unit":"g","min":1000,"target":4000,"storage":"freezer","shelf":90,"qty":5000,"cost":30,"expires":"2026-12-01"},
    {"n":13,"name":"닭고기","category":"meat","unit":"g","min":1500,"target":5000,"storage":"freezer","shelf":90,"qty":6000,"cost":8,"expires":"2026-12-01"},
    {"n":14,"name":"베이컨","category":"meat","unit":"g","min":500,"target":null,"storage":"freezer","shelf":60,"qty":3000,"cost":15,"expires":"2026-12-01"},
    {"n":15,"name":"햄","category":"meat","unit":"g","min":500,"target":null,"storage":"fridge","shelf":30,"qty":3000,"cost":10,"expires":"2026-11-15"},
    {"n":16,"name":"오징어","category":"seafood","unit":"g","min":500,"target":null,"storage":"freezer","shelf":90,"qty":100,"cost":12,"expires":"2026-12-01"},
    {"n":17,"name":"새우","category":"seafood","unit":"g","min":500,"target":null,"storage":"fridge","shelf":3,"qty":3000,"cost":18,"expires":"2026-11-02"},
    {"n":18,"name":"동태","category":"seafood","unit":"g","min":500,"target":null,"storage":"fridge","shelf":3,"qty":4000,"cost":8,"expires":"2026-11-01"},
    {"n":19,"name":"멸치","category":"seafood","unit":"g","min":300,"target":null,"storage":"freezer","shelf":90,"qty":2000,"cost":10,"expires":"2026-12-01"},
    {"n":20,"name":"우유","category":"dairy","unit":"ml","min":1000,"target":null,"storage":"fridge","shelf":7,"qty":3000,"cost":3,"expires":"2026-11-02"},
    {"n":21,"name":"계란","category":"dairy","unit":"ea","min":30,"target":90,"storage":"fridge","shelf":30,"qty":90,"cost":250,"expires":"2026-11-19"},
    {"n":22,"name":"생크림","category":"dairy","unit":"ml","min":500,"target":null,"storage":"fridge","shelf":7,"qty":100,"cost":8,"expires":"2026-11-07"},
    {"n":23,"name":"버터","category":"dairy","unit":"g","min":500,"target":null,"storage":"fridge","shelf":60,"qty":200,"cost":12,"expires":"2026-12-01"},
    {"n":24,"name":"두부","category":"etc","unit":"g","min":1000,"target":4000,"storage":"fridge","shelf":7,"qty":5000,"cost":3,"expires":"2026-11-04"},
    {"n":25,"name":"쌀","category":"grain","unit":"g","min":5000,"target":null,"storage":"room","shelf":180,"qty":20000,"cost":3,"expires":"2027-04-01"},
    {"n":26,"name":"간장","category":"sauce","unit":"ml","min":500,"target":null,"storage":"room","shelf":365,"qty":3000,"cost":4,"expires":"2027-10-20"},
    {"n":27,"name":"된장","category":"sauce","unit":"g","min":500,"target":null,"storage":"fridge","shelf":180,"qty":3000,"cost":5,"expires":"2027-04-01"},
    {"n":28,"name":"고추장","category":"sauce","unit":"g","min":500,"target":null,"storage":"fridge","shelf":180,"qty":3000,"cost":5,"expires":"2027-04-01"},
    {"n":29,"name":"소금","category":"sauce","unit":"g","min":300,"target":null,"storage":"room","shelf":null,"qty":2000,"cost":1,"expires":null},
    {"n":30,"name":"설탕","category":"sauce","unit":"g","min":500,"target":null,"storage":"room","shelf":null,"qty":3000,"cost":2,"expires":null}
  ]$data$::jsonb) as x(n int, name text, category text, unit text, min numeric, target numeric, storage text, shelf int, qty numeric, cost numeric, expires date)
  loop
    v_ingredient := ('30000000-0000-4000-8000-' || lpad(r.n::text, 12, '0'))::uuid;
    insert into ingredients (id, store_id, name, category, unit, min_stock, target_stock, storage, default_shelf_days, track_expiry)
    values (v_ingredient, v_store, r.name, r.category, r.unit::unit_type, r.min, r.target, r.storage::storage_type, r.shelf, r.shelf is not null);
    select id into strict v_lot from receive_stock(v_store, 'manual', null, jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_ingredient, 'quantity', r.qty, 'unit_price', r.cost,
      'received_at', '2026-10-20', 'expires_at', r.expires,
      'expiry_source', case when r.expires is null then null else 'manual' end
    ))) as received(id);
    v_lots := v_lots || jsonb_build_object(r.n::text, v_lot);
  end loop;

  insert into ingredient_units (store_id, ingredient_id, unit_name, factor) values
    (v_store, '30000000-0000-4000-8000-000000000002', '단', 1000),
    (v_store, '30000000-0000-4000-8000-000000000021', '판', 30),
    (v_store, '30000000-0000-4000-8000-000000000024', '모', 300);

  for r in select * from jsonb_to_recordset($data$[
    {"n":1,"name":"김치찌개","price":9000,"recipe":[[6,150],[11,100],[24,100],[2,20]]},
    {"n":2,"name":"된장찌개","price":8500,"recipe":[[27,30],[24,100],[5,80],[1,50]]},
    {"n":3,"name":"제육볶음","price":10000,"recipe":[[11,180],[1,80],[28,25],[2,20]]},
    {"n":4,"name":"소불고기","price":13000,"recipe":[[12,150],[1,80],[26,20],[30,10]]},
    {"n":5,"name":"닭볶음탕","price":11000,"recipe":[[13,200],[4,100],[3,50],[28,25]]},
    {"n":6,"name":"계란말이","price":7000,"recipe":[[21,3],[3,20],[2,10],[29,2]]},
    {"n":7,"name":"김치볶음밥","price":8500,"recipe":[[25,150],[6,100],[21,1],[14,30]]},
    {"n":8,"name":"콩나물국밥","price":8000,"recipe":[[25,150],[8,150],[21,1],[19,10]]},
    {"n":9,"name":"동태찌개","price":10000,"recipe":[[18,200],[24,80],[2,20],[10,10]]},
    {"n":10,"name":"새우볶음밥","price":9500,"recipe":[[17,100],[25,150],[3,30],[21,1]]},
    {"n":11,"name":"시금치비빔밥","price":9000,"recipe":[[7,100],[25,150],[3,40],[28,20]]},
    {"n":12,"name":"버섯덮밥","price":9000,"recipe":[[9,100],[25,150],[1,50],[26,20]]},
    {"n":13,"name":"감자조림정식","price":8500,"recipe":[[4,150],[25,150],[26,20],[30,10]]},
    {"n":14,"name":"햄계란볶음밥","price":8500,"recipe":[[15,80],[21,1],[25,150],[1,30]]},
    {"n":15,"name":"우유계란찜","price":6500,"recipe":[[20,100],[21,2],[29,2]]}
  ]$data$::jsonb) as x(n int, name text, price int, recipe jsonb)
  loop
    v_menu := ('40000000-0000-4000-8000-' || lpad(r.n::text, 12, '0'))::uuid;
    insert into menus (id, store_id, name, price) values (v_menu, v_store, r.name, r.price);
    insert into recipe_items (store_id, menu_id, ingredient_id, qty)
    select v_store, v_menu, ('30000000-0000-4000-8000-' || lpad((item->>0), 12, '0'))::uuid, (item->>1)::numeric
      from jsonb_array_elements(r.recipe) as items(item);
  end loop;

  -- 14일 연속 마감, 15개 메뉴 모두 판매. 소요량×판매량을 고정 계획과 검산한다.
  for r in select * from jsonb_to_recordset($data$[
    {"date":"2026-10-20","sales":[[1,2]],"plan":[[6,300],[11,200],[24,200],[2,40]]},
    {"date":"2026-10-21","sales":[[2,2]],"plan":[[27,60],[24,200],[5,160],[1,100]]},
    {"date":"2026-10-22","sales":[[3,2]],"plan":[[11,360],[1,160],[28,50],[2,40]]},
    {"date":"2026-10-23","sales":[[4,2]],"plan":[[12,300],[1,160],[26,40],[30,20]]},
    {"date":"2026-10-24","sales":[[5,2]],"plan":[[13,400],[4,200],[3,100],[28,50]]},
    {"date":"2026-10-25","sales":[[6,2]],"plan":[[21,6],[3,40],[2,20],[29,4]]},
    {"date":"2026-10-26","sales":[[7,2]],"plan":[[25,300],[6,200],[21,2],[14,60]]},
    {"date":"2026-10-27","sales":[[8,2]],"plan":[[25,300],[8,300],[21,2],[19,20]]},
    {"date":"2026-10-28","sales":[[9,2]],"plan":[[18,400],[24,160],[2,40],[10,20]]},
    {"date":"2026-10-29","sales":[[10,2]],"plan":[[17,200],[25,300],[3,60],[21,2]]},
    {"date":"2026-10-30","sales":[[11,2]],"plan":[[7,200],[25,300],[3,80],[28,40]]},
    {"date":"2026-10-31","sales":[[12,2]],"plan":[[9,200],[25,300],[1,100],[26,40]]},
    {"date":"2026-11-01","sales":[[13,2]],"plan":[[4,300],[25,300],[26,40],[30,20]]},
    {"date":"2026-11-02","sales":[[14,2],[15,2]],"plan":[[15,160],[21,6],[25,300],[1,60],[20,200],[29,4]]}
  ]$data$::jsonb) as x(date date, sales jsonb, plan jsonb)
  loop
    select jsonb_agg(jsonb_build_object('menu_id', ('40000000-0000-4000-8000-' || lpad(item->>0,12,'0'))::uuid, 'qty', (item->>1)::int))
      into v_sales from jsonb_array_elements(r.sales) as items(item);
    select jsonb_agg(jsonb_build_object('lot_id', v_lots->>(item->>0), 'qty', (item->>1)::numeric) order by v_lots->>(item->>0))
      into v_plan from jsonb_array_elements(r.plan) as items(item);
    if exists (
      with required as (
        select ri.ingredient_id, sum(ri.qty * (sale->>'qty')::int) qty
          from jsonb_array_elements(v_sales) as items(sale)
          join recipe_items ri on ri.menu_id = (sale->>'menu_id')::uuid
         group by ri.ingredient_id
      ), planned as (
        select ('30000000-0000-4000-8000-' || lpad(item->>0,12,'0'))::uuid ingredient_id, (item->>1)::numeric qty
          from jsonb_array_elements(r.plan) as items(item)
      ) select 1 from required full join planned using (ingredient_id)
         where required.qty is distinct from planned.qty
    ) then raise exception '판매 fixture 검산 실패: %', r.date; end if;
    perform record_daily_sales(v_store, r.date, v_sales, v_plan, '[]'::jsonb);
  end loop;

  -- 직접 사용 3건: 판매 차감 후에도 같은 재료에 묶음은 하나뿐이다.
  for r in select * from (values (1,100,'직원 식사'), (21,2,'시식'), (25,100,'직원 식사')) as x(n,qty,memo)
  loop
    v_ingredient := ('30000000-0000-4000-8000-' || lpad(r.n::text,12,'0'))::uuid;
    perform record_usage(v_store, '2026-11-02',
      jsonb_build_array(jsonb_build_object('ingredient_id',v_ingredient,'qty',r.qty,'short_qty',0,'memo',r.memo)),
      jsonb_build_array(jsonb_build_object('ingredient_id',v_ingredient,'lot_id',v_lots->>r.n::text,'qty',r.qty)));
  end loop;
  -- 경과 묶음 3건 부분 폐기: 남은 경과 재고도 대시보드에 표시된다.
  perform record_waste(v_store, (v_lots->>'17')::uuid, 50, 'expired', '가상 데이터: 일부 폐기');
  perform record_waste(v_store, (v_lots->>'18')::uuid, 50, 'expired', '가상 데이터: 일부 폐기');
  perform record_waste(v_store, (v_lots->>'20')::uuid, 100, 'expired', '가상 데이터: 일부 폐기');

  -- 모든 차감 후 두부 두 번째 묶음 추가. 과거 판매의 FEFO 순서에 영향을 주지 않는다.
  perform receive_stock(v_store, 'manual', null,
    '[{"ingredient_id":"30000000-0000-4000-8000-000000000024","quantity":600,"unit_price":3,"received_at":"2026-11-03","expires_at":"2026-11-10","expiry_source":"manual"}]'::jsonb);

  v_order := save_order(v_store, null, '2026-11-03', '가상 데이터: 오늘 발주 초안',
    '[{"ingredient_id":"30000000-0000-4000-8000-000000000016","qty":900},{"ingredient_id":"30000000-0000-4000-8000-000000000022","qty":900}]');
  v_order := save_order(v_store, null, '2026-11-02', '가상 데이터: 상태 액션 준비 후 발주완료로 전환할 목록',
    '[{"ingredient_id":"30000000-0000-4000-8000-000000000023","qty":800}]');
  -- 2.10/4.3b 상태 액션이 없으므로 두 목록 모두 draft로 둔다.
  -- ordered fixture는 상태 액션 연결 후 추가한다. 테이블 직접 update로 우회하지 않는다.
end
$fixtures$;

-- DB 제약과 함께 fixture 자체도 검산한다. 아래 합계는 검증 전용이며 차감 계획에 쓰지 않는다.
do $verify$
declare v_store constant uuid := '20000000-0000-4000-8000-000000000001';
begin
  if (select count(*) from ingredients where store_id=v_store) <> 30
     or (select count(*) from menus where store_id=v_store) <> 15
     or (select count(*) from sales_days where store_id=v_store) <> 14
     or (select count(*) from ingredient_units where store_id=v_store) <> 3
     or (select count(*) from usage_records where store_id=v_store) <> 3
     or (select count(*) from stock_movements where store_id=v_store and type='waste') <> 3
     or (select count(*) from ingredients where store_id=v_store and not track_expiry) <> 2
     or (select count(*) from ingredients where store_id=v_store and target_stock is not null) < 10 then
    raise exception 'WBS 2.9 fixture 개수 검증 실패';
  end if;
  if exists (
    select 1 from stock_lots l left join stock_movements m on m.lot_id=l.id
     where l.store_id=v_store group by l.id having l.remaining <> coalesce(sum(m.delta),0)
  ) then raise exception 'WBS 2.9 묶음 잔량·이력 검증 실패'; end if;
end
$verify$;

commit;
