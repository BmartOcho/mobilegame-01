-- Siegeworks ranked ladder schema. Tables are prefixed so they can share a
-- database with other apps; `drop table siege_turns, siege_matches, siege_profiles cascade;`
-- removes everything.
create extension if not exists pgcrypto;

create table if not exists public.siege_profiles (
  id uuid primary key,
  name text not null default 'Lord Nobody',
  rating integer not null default 1000,
  games integer not null default 0,
  wins integer not null default 0,
  trebuchet jsonb not null,
  projectile jsonb not null,
  castle jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists siege_profiles_rating_idx on public.siege_profiles (rating desc);

create table if not exists public.siege_matches (
  id uuid primary key default gen_random_uuid(),
  attacker uuid not null references public.siege_profiles (id),
  defender uuid not null references public.siege_profiles (id),
  seed text not null,
  round integer not null default 1,
  attacker_kit jsonb not null,
  defender_kit jsonb not null,
  attacker_castle jsonb not null,
  defender_castle jsonb not null,
  attacker_damage double precision not null default 0,
  defender_damage double precision not null default 0,
  status text not null default 'active', -- active | finished | abandoned
  winner uuid references public.siege_profiles (id),
  attacker_delta integer,
  defender_delta integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists siege_matches_attacker_idx on public.siege_matches (attacker, status);

create table if not exists public.siege_turns (
  id bigserial primary key,
  match_id uuid not null references public.siege_matches (id) on delete cascade,
  round integer not null,
  shooter uuid not null references public.siege_profiles (id),
  aim jsonb not null,
  wind jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists siege_turns_match_idx on public.siege_turns (match_id, round);

-- Only the edge function (service role) reads or writes the tables directly.
-- Clients see the ladder through the view below.
alter table public.siege_profiles enable row level security;
alter table public.siege_matches enable row level security;
alter table public.siege_turns enable row level security;

create or replace view public.siege_leaderboard with (security_invoker = false) as
  select name, rating, games, wins from public.siege_profiles order by rating desc limit 100;
grant select on public.siege_leaderboard to anon, authenticated;
