-- =============================================================================
-- NEXUS CS LABS — Supabase schema (idempotent: safe to run again and again)
-- Paste into Supabase Dashboard → SQL Editor → Run.
--
-- Security model
--   * Every table has Row Level Security ON. Users can only READ their own rows.
--   * Clients can NEVER write XP, rank, streak, lesson_progress or ctf_flags
--     directly. All writes go through SECURITY DEFINER RPC functions that
--     validate input, are idempotent (no double XP), and update the streak.
--   * CTF flags are verified server-side against SHA-256 hashes stored in
--     ctf_challenges. The hash column is never exposed to the API.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (display_name is null or char_length(display_name) between 2 and 40),
  xp               integer not null default 0 check (xp >= 0),
  rank             text    not null default 'Initiate',
  streak           integer not null default 0 check (streak >= 0),
  last_active_date date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  user_id      uuid not null references auth.users (id) on delete cascade,
  lesson_id    text not null check (char_length(lesson_id) between 1 and 120),
  track_id     text not null check (char_length(track_id) between 1 and 60),
  xp_awarded   integer not null default 0 check (xp_awarded between 0 and 500),
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Catalog of security challenges. Only the flag HASH is stored.
create table if not exists public.ctf_challenges (
  id         text primary key,
  title      text not null,
  category   text not null default 'reverse-engineering',
  points     integer not null check (points between 0 and 1000),
  flag_hash  text not null,              -- hex(sha256(flag))
  created_at timestamptz not null default now()
);

create table if not exists public.ctf_flags (
  user_id      uuid not null references auth.users (id) on delete cascade,
  challenge_id text not null references public.ctf_challenges (id) on delete cascade,
  points       integer not null default 0,
  captured_at  timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create index if not exists lesson_progress_user_idx on public.lesson_progress (user_id, completed_at desc);
create index if not exists ctf_flags_user_idx       on public.ctf_flags (user_id, captured_at desc);

-- -----------------------------------------------------------------------------
-- 2. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.ctf_challenges  enable row level security;
alter table public.ctf_flags       enable row level security;

-- profiles: read own row, update ONLY display_name (column grant below)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- lesson_progress / ctf_flags: read own rows only. No insert/update/delete
-- policies exist, so direct writes from the client are denied.
drop policy if exists "lesson_progress_select_own" on public.lesson_progress;
create policy "lesson_progress_select_own" on public.lesson_progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "ctf_flags_select_own" on public.ctf_flags;
create policy "ctf_flags_select_own" on public.ctf_flags
  for select to authenticated using ((select auth.uid()) = user_id);

-- ctf_challenges: anyone signed in can list challenges (but not the hash).
drop policy if exists "ctf_challenges_select_all" on public.ctf_challenges;
create policy "ctf_challenges_select_all" on public.ctf_challenges
  for select to authenticated using (true);

-- Column-level privileges (defence in depth on top of RLS)
revoke all on public.profiles        from anon, authenticated;
revoke all on public.lesson_progress from anon, authenticated;
revoke all on public.ctf_flags       from anon, authenticated;
revoke all on public.ctf_challenges  from anon, authenticated;

grant select on public.profiles                 to authenticated;
grant update (display_name) on public.profiles  to authenticated;
grant select on public.lesson_progress          to authenticated;
grant select on public.ctf_flags                to authenticated;
grant select (id, title, category, points, created_at) on public.ctf_challenges to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Helper functions
-- -----------------------------------------------------------------------------

-- Rank ladder — keep in sync with src/lib/ranks.ts
create or replace function public.rank_for_xp(p_xp integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_xp >= 6000 then 'Nexus Legend'
    when p_xp >= 3000 then 'Principal'
    when p_xp >= 1500 then 'Architect'
    when p_xp >= 750  then 'Engineer'
    when p_xp >= 250  then 'Operator'
    else 'Initiate'
  end;
$$;

-- Adds XP, recomputes rank, and advances the daily streak for one user.
create or replace function public.apply_activity(p_user uuid, p_xp integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;

  update public.profiles p
  set xp               = p.xp + greatest(p_xp, 0),
      rank             = public.rank_for_xp(p.xp + greatest(p_xp, 0)),
      streak           = case
                           when p.last_active_date = v_today     then greatest(p.streak, 1)
                           when p.last_active_date = v_today - 1 then p.streak + 1
                           else 1
                         end,
      last_active_date = v_today,
      updated_at       = now()
  where p.id = p_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Public RPCs (called from the client with supabase.rpc)
-- -----------------------------------------------------------------------------

-- Mark a lesson complete. Idempotent: completing twice never double-awards XP.
-- Returns the XP actually awarded (0 if it was already complete).
create or replace function public.complete_lesson(p_lesson_id text, p_track_id text, p_xp integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid    := auth.uid();
  v_xp      integer := least(greatest(coalesce(p_xp, 0), 0), 500);  -- clamp
  v_awarded integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_lesson_id is null or char_length(p_lesson_id) not between 1 and 120 then
    raise exception 'invalid lesson id' using errcode = '22023';
  end if;

  insert into public.lesson_progress (user_id, lesson_id, track_id, xp_awarded)
  values (v_user, p_lesson_id, coalesce(p_track_id, 'unknown'), v_xp)
  on conflict (user_id, lesson_id) do nothing;

  if found then
    v_awarded := v_xp;
  end if;

  perform public.apply_activity(v_user, v_awarded);
  return v_awarded;
end;
$$;

-- Submit a CTF flag. Verified against the stored SHA-256 hash.
-- Returns: 'captured' | 'already_captured' | 'wrong_flag' | 'unknown_challenge'
create or replace function public.submit_flag(p_challenge_id text, p_flag text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := auth.uid();
  v_challenge public.ctf_challenges%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_challenge from public.ctf_challenges where id = p_challenge_id;
  if not found then
    return 'unknown_challenge';
  end if;

  if encode(extensions.digest(convert_to(trim(coalesce(p_flag, '')), 'UTF8'), 'sha256'), 'hex')
     <> v_challenge.flag_hash then
    return 'wrong_flag';
  end if;

  insert into public.ctf_flags (user_id, challenge_id, points)
  values (v_user, v_challenge.id, v_challenge.points)
  on conflict (user_id, challenge_id) do nothing;

  if not found then
    return 'already_captured';
  end if;

  perform public.apply_activity(v_user, v_challenge.points);
  return 'captured';
end;
$$;

-- Lock down function execution: helpers are internal, RPCs are for signed-in users.
revoke all on function public.apply_activity(uuid, integer)           from public, anon, authenticated;
revoke all on function public.complete_lesson(text, text, integer)    from public, anon;
revoke all on function public.submit_flag(text, text)                 from public, anon;
grant execute on function public.complete_lesson(text, text, integer) to authenticated;
grant execute on function public.submit_flag(text, text)              to authenticated;
grant execute on function public.rank_for_xp(integer)                 to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Auto-create a profile row when a user signs up
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40));
begin
  -- Only keep names that satisfy the profiles.display_name check (2–40 chars);
  -- otherwise store NULL so sign-up never fails on a short name or email.
  insert into public.profiles (id, display_name)
  values (new.id, case when char_length(v_name) between 2 and 40 then v_name else null end)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on display_name edits
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Seed: challenge catalog — CrackMe (Day 1) + Prompt Security (Day 2)
--    flag_hash = sha256 of the flag string. Re-run this file to add new challenges.
-- -----------------------------------------------------------------------------

insert into public.ctf_challenges (id, title, category, points, flag_hash) values
  ('crackme-l1', 'vault_trial_v1.exe — Strings Analysis', 'reverse-engineering', 100,
   '524ccd9060f82521e9c775eb122eb0f727e83c1bf7d19eb3325ff07b30f2e67b'),
  ('crackme-l2', 'vault_trial_v1.exe — Keygen Logic Reversal', 'reverse-engineering', 150,
   '5b131d315ae970ae60e16540bebd4b114dcef17070d5404e3bd72ec454c4bbf9'),
  ('crackme-l3', 'vault_trial_v1.exe — Binary Patching', 'reverse-engineering', 200,
   '6f81a0e24b460f68dd4dae288d0da2f632c40c80d98162f6ebcaed086aeff586'),
  -- Day 2: Prompt Security Lab (Red-Team Arena)
  ('promptsec-l1', 'Prompt Injection — Naive Bot', 'prompt-injection', 100,
   '8b94ee2224b7828467a1e7b1b5b96edd787bf9db895fe82a3bf033a6cc697a24'),
  ('promptsec-l2', 'Prompt Injection — Keyword Filter Bypass', 'prompt-injection', 150,
   '04c5af3a6b8dac2e2445d5ac364a2188243d2f7cf16dc0d909e42b5bd099904e'),
  ('promptsec-l3', 'Prompt Injection — Output Scanner Evasion', 'prompt-injection', 200,
   'c09843440f61d45125d205330bc0d7ae55b900089208a324f42bfd9775a1536f'),
  ('promptsec-l4', 'Prompt Injection — Indirect (RAG) Injection', 'prompt-injection', 250,
   'bbaad8ce2cbf7e343d127f67af673193158a020632075ef54dfb569634ca51bd')
on conflict (id) do update
  set title     = excluded.title,
      category  = excluded.category,
      points    = excluded.points,
      flag_hash = excluded.flag_hash;

-- Backfill profiles for users who signed up before this script ran
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;
