-- =============================================================================
-- 012 — Durcissements (SPEC-02, S7 — 09/08/2026).
--
-- Quatre points sans rapport entre eux, réunis parce qu'ils ont la même nature :
-- aucun n'ouvre de fonctionnalité, chacun ferme un écart entre ce que le dépôt
-- dit et ce que la base fait.
--
--   1. UNE COURSE SUR LES CODES DE PARTAGE. `utiliser_code()` lit le code, puis
--      le marque utilisé. Entre les deux, une SECONDE transaction pouvait lire
--      le même code encore libre : un code « à usage unique » consommé deux
--      fois, donc un abonnement de plus que ce que son propriétaire a accordé.
--      Le verrou de ligne referme la fenêtre.
--   2. UN DROIT INCOHÉRENT. `remplacer_cloches()` est exécutable par `anon`,
--      alors que `nouveau_code()` (007) et `suivre_en_retour()` (011) le lui
--      refusent. 010 avait CONSTATÉ l'incohérence en laissant la décision à
--      Adrien ; elle est prise ici.
--   3. LES CODES EXPIRÉS NE PARTAIENT JAMAIS. La table ne fait que grossir, et
--      chaque ligne porte un identifiant d'utilisateur.
--   4. UN DÉFAUT PÉRIMÉ. `push_reglages.films` prenait encore par défaut
--      l'ancien schéma à trois clés que 008 devait éliminer.
--
-- REJOUABLE : `create or replace`, `revoke` idempotent, `unschedule` avant
-- `schedule`, `alter column set default`, et un `update` dont le `where` ne
-- retient plus rien au second passage. VÉRIFIÉ le 09/08/2026 sur un
-- PostgreSQL 16 vierge : trois passages d'affilée, aucune erreur, aucune
-- règle changée entre le premier et le troisième (le bloc `cron` excepté,
-- l'extension n'étant pas installable sur le banc d'essai).
--
-- Ce fichier vient APRÈS 001 (`utiliser_code`, `codes_partage`), après 003
-- (`push_reglages`), après 005 (`pg_cron` est déjà en place) et après 010
-- (`remplacer_cloches`).
-- =============================================================================

-- --- 1. Un code à usage unique ne se consomme qu'une fois --------------------
--
-- LE SCÉNARIO. Deux appareils saisissent le même code au même instant — ou,
-- plus simplement, quelqu'un rejoue la requête pendant que la première est en
-- vol. En `read committed`, les deux transactions lisent la ligne AVANT que
-- l'une ait écrit `utilise_le` : les deux la trouvent libre, les deux passent,
-- deux abonnements sont créés. Le propriétaire du code en a accordé un.
--
-- LE CORRECTIF tient en deux mots : `for update`. La seconde transaction
-- attend la première, puis Postgres réévalue la condition sur la version à
-- jour de la ligne — `utilise_le` n'est plus nul, la ligne ne correspond plus,
-- `cible` reste nul et l'appel se termine sur `CODE_INVALIDE`. C'est
-- exactement ce qu'on veut lui dire : le code a servi.
--
-- Le corps est repris MOT POUR MOT de 001, à la seule ligne `for update`
-- près : si 001 change un jour, ce fichier doit changer avec lui.
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
    and c.expire_le > now()
  for update;

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

-- Les droits ne changent pas : `create or replace` les conserve, mais on les
-- réaffirme pour qu'une lecture de ce seul fichier n'ait rien à deviner.
revoke all on function public.utiliser_code(text) from public;
grant execute on function public.utiliser_code(text) to anon, authenticated, service_role;

-- --- 2. `remplacer_cloches()` n'a rien à faire chez `anon` -------------------
--
-- 010:79-83 le disait déjà : `anon` figure dans les droits de cette fonction
-- alors que `nouveau_code()` (007:80) et `suivre_en_retour()` (011:60) le lui
-- refusent, et « le resserrer serait une décision de sécurité ». La voici.
--
-- Ce n'est pas une correction de faille : la fonction s'arrête de toute façon
-- sur `auth.uid()`. C'est le refus d'une porte entrouverte — `anon` est le rôle
-- que porte la clé publiable, écrite en clair dans un dépôt public, et une
-- fonction `security definer` accessible à ce rôle est exactement le genre de
-- détail qui devient grave le jour où son corps change.
revoke execute on function public.remplacer_cloches(jsonb) from anon;

-- ATTENTION, PIÈGE DE REJEU : `010:85` accorde ce droit à `anon`. Rejouer 010
-- SEUL — ce que la section « Vérifier » d'INSTALL.md invite à faire quand les
-- cloches ne remontent pas — remet donc la porte entrouverte, sans rien dire.
-- Règle : 010 ne se rejoue jamais seul, 012 passe derrière. C'est écrit ici,
-- dans INSTALL.md, et c'est la raison pour laquelle le contrôle n°2 ci-dessous
-- existe.

-- --- 3. Les codes expirés ne restent pas ------------------------------------
--
-- Un code vit 24 heures (001:99). Passé ce délai il ne sert plus à rien, mais
-- la ligne restait : la table ne faisait que grossir, et chaque ligne porte un
-- identifiant d'utilisateur. Sept jours de marge au-delà de l'expiration —
-- assez pour qu'un incident soit encore lisible, assez peu pour que rien ne
-- traîne.
--
-- Le nettoyage passe par `pg_cron`, déjà en place depuis 005 : rien de neuf à
-- installer, et le ménage ne s'invite pas dans le chemin d'un utilisateur qui
-- demande un code. `unschedule` d'abord, sinon rejouer ce fichier empile les
-- tâches — même précaution qu'en 005.
select cron.unschedule('purge-codes') where exists (
  select 1 from cron.job where jobname = 'purge-codes');
select cron.schedule(
  'purge-codes', '23 4 * * *',
  $purge$delete from public.codes_partage where expire_le < now() - interval '7 days'$purge$);

-- --- 4. Le défaut de `push_reglages.films` ----------------------------------
--
-- 008 a plié `{cine, stream, vod}` en `{cine, maison}` et converti les lignes
-- existantes. Le DÉFAUT de la colonne, lui, est resté à l'ancien schéma
-- (003:47) : toute ligne insérée sans `films` naissait donc périmée, dans le
-- format que 008 devait éliminer. Le serveur ne le voyait pas parce que
-- `genresVoulus()` repliait encore `stream`/`vod` à l'entrée — un repli posé
-- « pour quelques jours » le 30/07, qui masquait la vraie cause.
alter table public.push_reglages
  alter column films set default '{"cine": true, "maison": true}'::jsonb;

-- ET LES LIGNES DÉJÀ NÉES DE CE DÉFAUT. Corriger le défaut ne répare pas le
-- passé : chaque compte créé depuis le 30/07 sans toucher à ses réglages porte
-- une ligne à l'ancien schéma. Tant que le repli serveur existe, elles sont
-- lues correctement ; le jour où il partira, elles cesseraient silencieusement
-- de produire des notifications « à la maison ». On les plie donc MAINTENANT,
-- avec exactement la règle de 008 : `maison` vaut vrai si `stream` OU `vod`
-- l'était.
--
-- Rejouable : la clause `where` ne retient que les lignes qui portent encore
-- une des deux anciennes clés. Au second passage, il n'y en a plus.
update public.push_reglages
   set films = (films - 'stream' - 'vod')
               || jsonb_build_object(
                    'cine',   coalesce((films->>'cine')::boolean, true),
                    'maison', coalesce((films->>'maison')::boolean,
                                       coalesce((films->>'stream')::boolean, false)
                                    or coalesce((films->>'vod')::boolean, false)))
 where films ? 'stream' or films ? 'vod' or not (films ? 'maison');

-- =============================================================================
-- Contrôles après exécution
-- =============================================================================
--
-- 1. Le verrou est bien dans la fonction :
--      select pg_get_functiondef('public.utiliser_code(text)'::regprocedure)
--             like '%for update%';
--    Attendu : t
--
--    L'épreuve réelle demande DEUX sessions SQL ouvertes en parallèle :
--      -- session B            -- session C
--      begin;                  begin;
--      select public.utiliser_code('ABC123');
--                              select public.utiliser_code('ABC123');  -- attend
--      commit;
--                              -- repart, et lève CODE_INVALIDE
--    Attendu : un seul abonnement créé.
--      select count(*) from public.abonnements where suivi = (le proprio du code);
--
--    MESURÉ le 09/08/2026 sur un PostgreSQL 16 vierge, avec ce scénario exact,
--    deux sessions lancées à 400 ms d'intervalle :
--      · corps de 001 (sans `for update`) → les DEUX passent, 2 abonnements ;
--      · corps ci-dessus (avec)           → C attend, puis CODE_INVALIDE,
--                                           1 abonnement.
--    La course n'était donc pas théorique, et le verrou la ferme.
--
-- 2. Les droits sont alignés :
--      select proname, proacl::text from pg_proc p
--        join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and proname in
--             ('remplacer_cloches','nouveau_code','suivre_en_retour');
--    Attendu : aucune des trois ne porte `anon=X`.
--
-- 3. Le ménage est planifié :
--      select jobname, schedule, active from cron.job order by jobname;
--    Attendu : `notifier` et `purge-codes`, toutes deux actives.
--
-- 4. Le défaut est le bon :
--      select column_default from information_schema.columns
--       where table_name = 'push_reglages' and column_name = 'films';
--    Attendu : le JSON à DEUX clés, `cine` et `maison`.
--
--    Et plus aucune ligne à l'ancien schéma :
--      select count(*) from public.push_reglages
--       where films ? 'stream' or films ? 'vod' or not (films ? 'maison');
--    Attendu : 0
-- =============================================================================
