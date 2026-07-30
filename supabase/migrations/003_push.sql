-- =============================================================================
-- 003 — Notifications : appareils abonnés, cloches, réglages, historique.
--
-- Les quatre tables suivent le même principe : chacune est strictement privée,
-- une seule policy `ALL` sur `user_id = auth.uid()`. Le serveur, lui, les lit
-- en droits `service_role` et contourne donc la RLS — c'est pour cette raison
-- que la fonction `notifier` doit être protégée par un secret (voir 005).
-- =============================================================================

-- Un appareil = un abonnement push. `endpoint` est unique : le même téléphone
-- réinstallé remplace sa ligne au lieu d'en créer une seconde.
create table if not exists public.push_appareils (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid        not null references auth.users(id) on delete cascade,
  endpoint text        not null unique,
  p256dh   text        not null,
  auth     text        not null,
  cree     timestamptz not null default now(),
  vu       timestamptz not null default now(),
  -- Trois échecs d'affilée et l'abonnement est oublié : il a expiré.
  echecs   smallint    not null default 0
);
create index if not exists push_appareils_user on public.push_appareils (user_id);
alter table public.push_appareils enable row level security;
drop policy if exists "mes lignes seulement" on public.push_appareils;
create policy "mes lignes seulement" on public.push_appareils for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Les titres que l'on veut être averti de voir sortir.
create table if not exists public.push_cloches (
  user_id uuid        not null references auth.users(id) on delete cascade,
  type    text        not null check (type in ('tv','movie')),
  tmdb_id bigint      not null,
  maj     timestamptz not null default now(),
  primary key (user_id, type, tmdb_id)
);
alter table public.push_cloches enable row level security;
drop policy if exists "mes lignes seulement" on public.push_cloches;
create policy "mes lignes seulement" on public.push_cloches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Les préférences. « soir » et « samedi » sont acceptés par la contrainte mais
-- le serveur n'implémente que « sortie » : voir la spec I9.
create table if not exists public.push_reglages (
  user_id uuid        primary key references auth.users(id) on delete cascade,
  quand   text        not null default 'sortie' check (quand in ('sortie','soir','samedi')),
  films   jsonb       not null default '{"cine": true, "stream": true, "vod": false}'::jsonb,
  maj     timestamptz not null default now()
);
alter table public.push_reglages enable row level security;
drop policy if exists "mes lignes seulement" on public.push_reglages;
create policy "mes lignes seulement" on public.push_reglages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ce qui a déjà été annoncé. La clé primaire fait office de verrou : on tente
-- l'insertion, un conflit veut dire « on l'a déjà dit ».
create table if not exists public.push_envois (
  user_id uuid        not null references auth.users(id) on delete cascade,
  cle     text        not null,
  envoye  timestamptz not null default now(),
  primary key (user_id, cle)
);
alter table public.push_envois enable row level security;
drop policy if exists "mes lignes seulement" on public.push_envois;
create policy "mes lignes seulement" on public.push_envois for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
