-- =============================================================================
-- 009 — I6 : recommander un titre à quelqu'un de son cercle.
--
-- Jusqu'ici le partage était à sens unique : on pouvait REGARDER la
-- bibliothèque d'un proche, jamais lui dire « regarde ça ». C'est le seul geste
-- qui transforme un droit de regard en échange.
--
-- Trois règles, et elles sont toutes du côté serveur — l'interface ne propose
-- que les gens du cercle, mais ce n'est pas elle qui décide :
--
--   1. On ne recommande qu'à quelqu'un avec qui un abonnement existe, dans un
--      sens ou dans l'autre. Sans cette condition, connaître un uid suffirait à
--      déposer n'importe quoi chez n'importe qui.
--   2. On ne lit que ce qu'on a envoyé ou ce qu'on a reçu.
--   3. Seul le destinataire marque « vu » ou « écarté ». L'expéditeur ne peut
--      pas effacer sa recommandation de l'écran d'en face après coup — il peut
--      en revanche la retirer entièrement (DELETE), ce qui est honnête.
--
-- Aucune donnée d'un tiers ne transite : la table ne porte qu'un identifiant
-- TMDB et un titre, tous deux publics.
--
-- REJOUABLE : `if not exists` partout, et le couple `drop policy if exists` /
-- `create policy` avec le nom exact.
-- =============================================================================

create table if not exists public.recommandations (
  id      uuid        primary key default gen_random_uuid(),
  de      uuid        not null references auth.users(id) on delete cascade,
  vers    uuid        not null references auth.users(id) on delete cascade,
  type    text        not null check (type in ('tv','movie')),
  tmdb_id bigint      not null,
  -- Le titre est recopié à l'envoi : sans lui, afficher la liste reçue
  -- demanderait un appel TMDB par ligne avant même de savoir si ça intéresse.
  titre   text        not null default '',
  cree    timestamptz not null default now(),
  vu      timestamptz,
  ecarte  timestamptz,
  constraint pas_a_soi_meme check (de <> vers),
  -- Deux fois le même titre à la même personne, c'est une insistance, pas une
  -- information. La seconde tentative ne crée rien (`on conflict do nothing`).
  constraint une_seule_fois unique (de, vers, type, tmdb_id)
);
alter table public.recommandations enable row level security;

create index if not exists recommandations_vers_idx
  on public.recommandations (vers, ecarte, cree desc);

drop policy if exists "je vois ce que j envoie et ce que je recois" on public.recommandations;
create policy "je vois ce que j envoie et ce que je recois"
  on public.recommandations for select to authenticated
  using (auth.uid() = de or auth.uid() = vers);

drop policy if exists "je recommande a mon cercle seulement" on public.recommandations;
-- `dans_mon_cercle()` (migration 004) répond exactement à la question posée :
-- « cette personne et moi sommes-nous liés par un abonnement, dans un sens ou
-- dans l'autre ? ». On la réemploie plutôt que de réécrire la condition, pour
-- qu'il n'y ait qu'un seul endroit à corriger si la définition du cercle bouge.
create policy "je recommande a mon cercle seulement"
  on public.recommandations for insert to authenticated
  with check (auth.uid() = de and public.dans_mon_cercle(vers));

drop policy if exists "le destinataire classe ce qu il recoit" on public.recommandations;
-- `with check` répète la condition de `using` : sans lui, le destinataire
-- pourrait réécrire `vers` et déplacer la ligne chez quelqu'un d'autre.
create policy "le destinataire classe ce qu il recoit"
  on public.recommandations for update to authenticated
  using (auth.uid() = vers) with check (auth.uid() = vers);

drop policy if exists "je retire ce que j ai envoye" on public.recommandations;
create policy "je retire ce que j ai envoye"
  on public.recommandations for delete to authenticated
  using (auth.uid() = de);
