-- ============================================================
--  Mes Séries — mise en place de la sauvegarde en ligne
--  À coller dans Supabase : menu « SQL Editor » → New query → Run
-- ============================================================

-- 1. La table : une seule ligne par utilisateur, contenant toutes ses données
create table if not exists public.mes_series (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Sécurité : chacun ne voit et ne modifie que sa propre ligne
alter table public.mes_series enable row level security;

drop policy if exists "lecture de ma ligne"      on public.mes_series;
drop policy if exists "creation de ma ligne"     on public.mes_series;
drop policy if exists "modification de ma ligne" on public.mes_series;
drop policy if exists "suppression de ma ligne"  on public.mes_series;

create policy "lecture de ma ligne"
  on public.mes_series for select
  using (auth.uid() = user_id);

create policy "creation de ma ligne"
  on public.mes_series for insert
  with check (auth.uid() = user_id);

create policy "modification de ma ligne"
  on public.mes_series for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "suppression de ma ligne"
  on public.mes_series for delete
  using (auth.uid() = user_id);

-- 3. Horodatage automatique à chaque écriture
create or replace function public.mes_series_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists mes_series_touch on public.mes_series;
create trigger mes_series_touch
  before insert or update on public.mes_series
  for each row execute function public.mes_series_touch();
