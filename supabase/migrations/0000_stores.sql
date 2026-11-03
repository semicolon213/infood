-- supabase/migrations/0000_stores.sql
-- WBS 2.4 (로그인·매장 생성)에 필요한 부분만 먼저 만든다. 나머지 스키마는 2.7의 0001_init 이후.
-- 정의는 docs/07_DB.md 3.2(stores), 4장(is_my_store, stores 정책)과 같다.

create extension if not exists pgcrypto;

create table stores (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 50),
  created_at  timestamptz not null default now()
);

create or replace function is_my_store(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from stores where id = sid and owner_id = auth.uid());
$$;

alter table stores enable row level security;

create policy stores_owner on stores
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
