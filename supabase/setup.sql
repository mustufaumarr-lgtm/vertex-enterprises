-- =====================================================================
-- Vertex Enterprises — Supabase setup
-- Paste ALL of this into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
-- BEFORE RUNNING: change the two e-mail addresses at the bottom.
-- =====================================================================

-- 1) Who is allowed in (partners). Only these e-mails can read/write.
create table if not exists public.members (
  email text primary key
);

-- 2) All app data. One row per record, e.g. path = 'projects/prj-123'.
create table if not exists public.docs (
  path        text primary key,
  coll        text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index if not exists docs_coll_idx on public.docs (coll);

-- 3) Helper: is the signed-in user on the members list?
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 4) Row-level security: nobody (not even with the public anon key) can
--    touch data unless signed in AND on the members list.
alter table public.docs    enable row level security;
alter table public.members enable row level security;

drop policy if exists "members read docs"   on public.docs;
drop policy if exists "members insert docs" on public.docs;
drop policy if exists "members update docs" on public.docs;
drop policy if exists "members delete docs" on public.docs;
create policy "members read docs"   on public.docs for select to authenticated using (public.is_member());
create policy "members insert docs" on public.docs for insert to authenticated with check (public.is_member());
create policy "members update docs" on public.docs for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members delete docs" on public.docs for delete to authenticated using (public.is_member());

drop policy if exists "see own membership" on public.members;
create policy "see own membership" on public.members for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- 4b) Let signed-in users reach these tables through the API
--     (RLS above still decides what each person can actually see).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.docs to authenticated;
grant select on public.members to authenticated;
revoke all on public.docs from anon;
revoke all on public.members from anon;
grant execute on function public.is_member() to authenticated;

-- 5) Live updates between partners' screens.
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 6) Private storage for receipt / slip photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slips', 'slips', false, 20971520, array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update set public = false;

drop policy if exists "members read slips"   on storage.objects;
drop policy if exists "members upload slips" on storage.objects;
drop policy if exists "members delete slips" on storage.objects;
create policy "members read slips"   on storage.objects for select to authenticated using (bucket_id = 'slips' and public.is_member());
create policy "members upload slips" on storage.objects for insert to authenticated with check (bucket_id = 'slips' and public.is_member());
create policy "members delete slips" on storage.objects for delete to authenticated using (bucket_id = 'slips' and public.is_member());

-- 7) Starting settings: company name and partners (50 / 50).
insert into public.docs (path, coll, data) values ('meta/settings', 'meta', jsonb_build_object(
  'companyName', 'Vertex Enterprises', 'city', 'Karachi, Sindh',
  'partners', jsonb_build_array(
    jsonb_build_object('id','p1','name','Murtuza','share',50),
    jsonb_build_object('id','p2','name','Hisham','share',50)),
  'openingCash', 0, 'openingBank', 0, 'openingDate', '', 'paymentTermsDays', 30,
  'defaults', jsonb_build_object('incomeTax',0,'salesTax',0,'penalty',0,'other',0),
  'lastBackup', null, 'pinHash', '', 'agreementNotes', ''))
on conflict (path) do nothing;

-- 8) >>> CHANGE THESE TWO E-MAILS to the ones you and Hisham will log in with <<<
insert into public.members (email) values
  ('YOUR-EMAIL@example.com'),
  ('HISHAM-EMAIL@example.com')
on conflict do nothing;
