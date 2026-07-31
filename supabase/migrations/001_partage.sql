-- =============================================================================
-- 001 — Partage : la bibliothèque, les profils, les abonnements, les codes.
--
-- Ce fichier décrit ce qui tourne réellement en production le 30/07/2026. Il
-- est REJOUABLE : on peut l'exécuter deux fois de suite sur la prod sans rien
-- casser ni affaiblir une règle. C'est la raison des `if not exists` et du
-- couple `drop policy if exists` / `create policy` avec le nom EXACT de la
-- production — un `drop` qui vise un ancien nom laisserait la nouvelle policy
-- s'ajouter à côté, et deux policies permissives se combinent en OU.
-- =============================================================================

-- L'ORDRE DES BLOCS COMPTE. Postgres analyse l'expression d'une policy au
-- moment où il la crée : la policy de lecture de `mes_series` cite
-- `public.abonnements`, donc `abonnements` doit exister AVANT. Tant que ce
-- bloc était en second, le fichier s'arrêtait en erreur `42P01` sur une base
-- vierge — il ne passait que sur la production, où la table était déjà là.
-- Corrigé le 31/07/2026 (lot 0) : `abonnements` est remonté en tête. Rien
-- d'autre n'a changé, et rejouer le fichier sur la production reste sans effet.

-- --- Les abonnements ---------------------------------------------------------
create table if not exists public.abonnements (
  suiveur uuid        not null references auth.users(id) on delete cascade,
  suivi   uuid        not null references auth.users(id) on delete cascade,
  depuis  timestamptz not null default now(),
  primary key (suiveur, suivi),
  constraint pas_soi_meme check (suiveur <> suivi)
);
alter table public.abonnements enable row level security;

drop policy if exists "je vois mes abonnements et mes abonnes" on public.abonnements;
create policy "je vois mes abonnements et mes abonnes"
  on public.abonnements for select to authenticated
  using (auth.uid() = suiveur or auth.uid() = suivi);

drop policy if exists "je me desabonne ou je retire un abonne" on public.abonnements;
-- Des deux côtés : on peut se désabonner de quelqu'un, et on peut retirer
-- quelqu'un qui nous suit.
create policy "je me desabonne ou je retire un abonne"
  on public.abonnements for delete to authenticated
  using (auth.uid() = suiveur or auth.uid() = suivi);

-- Aucune policy INSERT : on ne s'abonne QUE par `utiliser_code()`, plus bas.
-- C'est ce qui empêche de s'abonner à quelqu'un dont on connaîtrait l'uid.

-- --- La bibliothèque ---------------------------------------------------------
create table if not exists public.mes_series (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.mes_series enable row level security;

drop policy if exists "lecture ma ligne et mes abos" on public.mes_series;
-- Ma ligne, plus celle des gens auxquels je me suis abonné : c'est ce qui rend
-- possible l'écran « la bibliothèque de tes proches ».
create policy "lecture ma ligne et mes abos"
  on public.mes_series for select to authenticated
  using (auth.uid() = user_id
         or exists (select 1 from public.abonnements a
                    where a.suivi = mes_series.user_id and a.suiveur = auth.uid()));

drop policy if exists "creation de ma ligne" on public.mes_series;
create policy "creation de ma ligne"
  on public.mes_series for insert with check (auth.uid() = user_id);

drop policy if exists "modification de ma ligne" on public.mes_series;
create policy "modification de ma ligne"
  on public.mes_series for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "suppression de ma ligne" on public.mes_series;
create policy "suppression de ma ligne"
  on public.mes_series for delete using (auth.uid() = user_id);

-- --- Les profils -------------------------------------------------------------
-- La policy de LECTURE n'est pas ici : elle dépend de `dans_mon_cercle()`, donc
-- de la table `abonnements`. Elle vit dans 004, une fois la fonction créée.
create table if not exists public.profils (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pseudo  text        not null default 'Sans nom',
  maj     timestamptz not null default now()
);
alter table public.profils enable row level security;

drop policy if exists "je cree mon profil" on public.profils;
create policy "je cree mon profil"
  on public.profils for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "je modifie mon profil" on public.profils;
create policy "je modifie mon profil"
  on public.profils for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- --- Les codes de partage ----------------------------------------------------
create table if not exists public.codes_partage (
  code       text primary key,
  proprio    uuid        not null references auth.users(id) on delete cascade,
  cree_le    timestamptz not null default now(),
  expire_le  timestamptz not null default (now() + interval '24 hours'),
  utilise_le timestamptz
);
alter table public.codes_partage enable row level security;

drop policy if exists "je vois mes codes" on public.codes_partage;
create policy "je vois mes codes"
  on public.codes_partage for select to authenticated using (auth.uid() = proprio);

drop policy if exists "je cree mes codes" on public.codes_partage;
create policy "je cree mes codes"
  on public.codes_partage for insert to authenticated with check (auth.uid() = proprio);

drop policy if exists "je supprime mes codes" on public.codes_partage;
create policy "je supprime mes codes"
  on public.codes_partage for delete to authenticated using (auth.uid() = proprio);

-- Pas de policy UPDATE : marquer un code comme utilisé passe par la fonction
-- ci-dessous, qui tourne en `security definer`. Sinon n'importe qui pourrait
-- brûler le code de quelqu'un d'autre.

-- --- Consommer un code -------------------------------------------------------
-- En `security definer` parce qu'elle doit lire le code de QUELQU'UN D'AUTRE
-- pour savoir à qui il appartient — ce que la policy de lecture interdit.
create or replace function public.utiliser_code(le_code text)
returns table(suivi uuid, pseudo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
end $function$;
