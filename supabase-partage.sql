-- ============================================================
--  Mes Séries — partage par abonnement
--  À coller dans Supabase : SQL Editor → New query → Run
--  (complète supabase-setup.sql, ne le remplace pas)
-- ============================================================

-- 1. Profils publics : uniquement un prénom, pour savoir qui est qui.
--    Aucune donnée de visionnage ici.
create table if not exists public.profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pseudo  text not null default 'Sans nom',
  maj     timestamptz not null default now()
);
alter table public.profils enable row level security;

drop policy if exists "profils lisibles par les connectes" on public.profils;
drop policy if exists "je cree mon profil"                 on public.profils;
drop policy if exists "je modifie mon profil"              on public.profils;

create policy "profils lisibles par les connectes"
  on public.profils for select to authenticated using (true);
create policy "je cree mon profil"
  on public.profils for insert to authenticated with check (auth.uid() = user_id);
create policy "je modifie mon profil"
  on public.profils for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- 2. Abonnements : « suiveur » consulte la bibliothèque de « suivi ».
create table if not exists public.abonnements (
  suiveur uuid not null references auth.users(id) on delete cascade,
  suivi   uuid not null references auth.users(id) on delete cascade,
  depuis  timestamptz not null default now(),
  primary key (suiveur, suivi),
  constraint pas_soi_meme check (suiveur <> suivi)
);
alter table public.abonnements enable row level security;

drop policy if exists "je vois mes abonnements et mes abonnes" on public.abonnements;
drop policy if exists "je me desabonne ou je retire un abonne" on public.abonnements;

-- Je vois les liens qui me concernent, dans un sens comme dans l'autre.
create policy "je vois mes abonnements et mes abonnes"
  on public.abonnements for select to authenticated
  using (auth.uid() = suiveur or auth.uid() = suivi);

-- Je peux rompre un lien dont je fais partie : me désabonner, ou retirer un abonné.
create policy "je me desabonne ou je retire un abonne"
  on public.abonnements for delete to authenticated
  using (auth.uid() = suiveur or auth.uid() = suivi);

-- Pas de politique d'insertion : on ne s'abonne QUE par code, via la fonction ci-dessous.


-- 3. Codes de partage : à usage unique, valables 24 h, générés par la personne suivie.
create table if not exists public.codes_partage (
  code       text primary key,
  proprio    uuid not null references auth.users(id) on delete cascade,
  cree_le    timestamptz not null default now(),
  expire_le  timestamptz not null default now() + interval '24 hours',
  utilise_le timestamptz
);
alter table public.codes_partage enable row level security;

drop policy if exists "je vois mes codes"     on public.codes_partage;
drop policy if exists "je cree mes codes"     on public.codes_partage;
drop policy if exists "je supprime mes codes" on public.codes_partage;

-- Un code n'est jamais lisible par les autres : il se consomme par la fonction.
create policy "je vois mes codes"
  on public.codes_partage for select to authenticated using (auth.uid() = proprio);
create policy "je cree mes codes"
  on public.codes_partage for insert to authenticated with check (auth.uid() = proprio);
create policy "je supprime mes codes"
  on public.codes_partage for delete to authenticated using (auth.uid() = proprio);


-- 4. Consommer un code : seule porte d'entrée vers un abonnement.
--    S'exécute avec les droits du propriétaire de la fonction, ce qui lui permet
--    de vérifier un code sans que personne ne puisse lire la table des codes.
create or replace function public.utiliser_code(le_code text)
returns table (suivi uuid, pseudo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  cible uuid;
begin
  if auth.uid() is null then
    raise exception 'NON_CONNECTE';
  end if;

  select c.proprio into cible
  from public.codes_partage c
  where upper(c.code) = upper(trim(le_code))
    and c.utilise_le is null
    and c.expire_le > now();

  if cible is null then
    raise exception 'CODE_INVALIDE';
  end if;
  if cible = auth.uid() then
    raise exception 'CODE_A_SOI';
  end if;

  update public.codes_partage
     set utilise_le = now()
   where upper(code) = upper(trim(le_code));

  insert into public.abonnements (suiveur, suivi)
  values (auth.uid(), cible)
  on conflict do nothing;

  return query
    select cible, coalesce(p.pseudo, 'Sans nom')
    from (select 1) x
    left join public.profils p on p.user_id = cible;
end $$;

revoke all on function public.utiliser_code(text) from public;
grant execute on function public.utiliser_code(text) to authenticated;


-- 5. La règle qui ouvre la lecture : je vois ma ligne, et celle des personnes
--    auxquelles je suis abonné. Rien d'autre, et toujours en lecture seule.
drop policy if exists "lecture de ma ligne"          on public.mes_series;
drop policy if exists "lecture ma ligne et mes abos" on public.mes_series;

create policy "lecture ma ligne et mes abos"
  on public.mes_series for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.abonnements a
      where a.suivi = mes_series.user_id
        and a.suiveur = auth.uid()
    )
  );

-- Les écritures restent strictement personnelles : les politiques d'insertion,
-- de modification et de suppression posées par supabase-setup.sql sont inchangées.
