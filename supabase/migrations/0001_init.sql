-- Siegeworks ranked ladder schema.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Lord Nobody',
  rating integer not null default 1000,
  games integer not null default 0,
  wins integer not null default 0,
  trebuchet jsonb not null,
  projectile jsonb not null,
  castle jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_rating_idx on public.profiles (rating desc);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  attacker uuid not null references public.profiles (id),
  defender uuid not null references public.profiles (id),
  seed text not null,
  round integer not null default 1,
  attacker_kit jsonb not null,
  defender_kit jsonb not null,
  attacker_castle jsonb not null,
  defender_castle jsonb not null,
  attacker_damage double precision not null default 0,
  defender_damage double precision not null default 0,
  status text not null default 'active', -- active | finished | abandoned
  winner uuid references public.profiles (id),
  attacker_delta integer,
  defender_delta integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists matches_attacker_idx on public.matches (attacker, status);

create table if not exists public.turns (
  id bigserial primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  round integer not null,
  shooter uuid not null references public.profiles (id),
  aim jsonb not null,
  wind jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists turns_match_idx on public.turns (match_id, round);

-- Row level security: everyone can read the ladder, only the owner edits their kit,
-- and only the edge function (service role) touches ratings and matches.
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.turns enable row level security;

create policy "profiles are public" on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id and rating = (select rating from public.profiles p where p.id = auth.uid()) and games = (select games from public.profiles p where p.id = auth.uid()) and wins = (select wins from public.profiles p where p.id = auth.uid()));

create policy "participants read matches" on public.matches for select using (auth.uid() = attacker or auth.uid() = defender);
create policy "participants read turns" on public.turns for select using (exists (select 1 from public.matches m where m.id = match_id and (m.attacker = auth.uid() or m.defender = auth.uid())));

create or replace view public.leaderboard as
  select name, rating, games, wins from public.profiles order by rating desc limit 100;
grant select on public.leaderboard to anon, authenticated;
