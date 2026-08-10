-- Les tests SQL de la migration 014 — SPEC-04 lot B (10/08/2026).
--
--     psql "<url du projet>" -f supabase/tests/014_relais_ia.test.sql
--
-- ou, sur un PostgreSQL local vierge, après avoir créé les rôles :
--     create role anon; create role authenticated;
--     psql -f supabase/migrations/014_relais_ia.sql
--     psql -f supabase/tests/014_relais_ia.test.sql
--
-- ============================================================================
-- CE FICHIER NE LAISSE RIEN DERRIÈRE LUI, ET CE N'EST PLUS UNE PROMESSE :
-- C'EST UNE TRANSACTION ANNULÉE.
--
-- Sa première version prétendait « n'écrire que sur des fournisseurs préfixés
-- test- ». C'était faux de trois façons, relevé au second tour de relecture :
--   · elle supprimait la ligne `@global`, qui n'est pas un fournisseur de test
--     mais LE COMPTEUR DU BUDGET GLOBAL DU JOUR — le remettre à zéro rouvrait
--     mille requêtes sur un palier gratuit partagé ;
--   · elle appelait `ia_menage()`, qui purge pour de bon le journal et les
--     budgets au-delà de soixante jours ;
--   · et l'INSTALL.md du même commit recommandait de la lancer sur la base de
--     production en affirmant l'inverse.
--
-- Le remède n'est pas de mieux viser : c'est `begin` … `rollback`. Tout ce qui
-- suit s'exécute pour de vrai, les assertions mordent pour de vrai, et rien
-- n'est jamais validé. Une exception interrompt psql (`ON_ERROR_STOP`) et la
-- transaction retombe d'elle-même.
--
-- Seule conséquence à connaître : le test verrouille brièvement les lignes
-- qu'il touche, `@global` compris. Sur une base en service, c'est quelques
-- millisecondes.
-- ============================================================================
--
-- POURQUOI CE FICHIER EXISTE, ET IL A UNE DATE DE NAISSANCE PRÉCISE.
--
-- Le lot B a d'abord été livré avec vingt-cinq tests Deno et zéro test SQL. Un
-- relecteur indépendant a joué la migration sur un vrai PostgreSQL et trouvé un
-- défaut bloquant en trois requêtes : `ia_saturer` n'avait AUCUN effet sur un
-- fournisseur aux limites inconnues — c'est-à-dire sur les deux étages qu'on
-- appelle en premier, et c'était le seul filet prévu à cet endroit.
--
-- Le test Deno qui aurait dû l'attraper vérifiait ceci :
--
--     assert(f.vues.some(v => v.url.indexOf("ia_saturer") >= 0));
--
-- Il vérifiait qu'on APPELLE. Il ne pouvait rien dire de ce que l'appel FAIT,
-- puisque `fetch` était remplacé par un menteur.
--
-- ET LA PREMIÈRE VERSION DE CE FICHIER-CI NE VALAIT GUÈRE MIEUX. Le second tour
-- de relecture l'a soumis au test de mutation — casser le code de six façons et
-- compter les détections : **une sur six**. Il laissait notamment passer B1
-- réintroduit sur la fenêtre `jour`, celle que `ia_reserver_fournisseur` teste
-- en premier, celle des deux étages Gemini. Chaque cas ajouté depuis porte, en
-- commentaire, la mutation qu'il est chargé d'attraper. Un test qui ne dit pas
-- ce qu'il empêche ne se maintient pas.

\set ON_ERROR_STOP on

begin;

do $$
declare
  n int;
  d timestamptz;
  UID_TEST constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- ==========================================================================
  -- B1 — LE DÉFAUT QUI A MOTIVÉ CE FICHIER
  --
  -- Un fournisseur AUX LIMITES INCONNUES, saturé par un 429, ne doit plus
  -- accepter une seule réservation jusqu'à la fin de sa fenêtre.
  -- ==========================================================================
  perform public.ia_saturer('test-inconnu', 'minute');
  if public.ia_reserver_fenetre('test-inconnu', 'minute', null) then
    raise exception 'B1 : un fournisseur saturé aux limites INCONNUES accepte encore';
  end if;
  -- Et pas seulement la première fois : c'est ce que « une fois par fenêtre »
  -- veut dire.
  if public.ia_reserver_fenetre('test-inconnu', 'minute', null) then
    raise exception 'B1 : le refus ne tient pas au second appel';
  end if;

  -- Une limite inconnue laisse passer l'usage NORMAL — la sentinelle ne doit pas
  -- fermer la porte à tout le monde.
  if not public.ia_reserver_fenetre('test-libre', 'minute', null) then
    raise exception 'B1 : une limite inconnue bloque un usage normal';
  end if;

  -- --------------------------------------------------------------------------
  -- B1 PAR LA PORTE DE SERVICE — mutation « B1 réintroduit sur la fenêtre jour »
  --
  -- Le fichier d'origine ne testait la fenêtre `jour` qu'avec une limite CONNUE,
  -- et n'appelait jamais `ia_reserver_fournisseur` avec des limites nulles. Or
  -- c'est exactement la configuration des deux étages Gemini, et
  -- `ia_reserver_fournisseur` teste le JOUR EN PREMIER. Un court-circuit
  -- réintroduit sur ce seul chemin passait donc inaperçu.
  -- --------------------------------------------------------------------------
  perform public.ia_saturer('test-jour-nul', 'jour');
  if public.ia_reserver_fenetre('test-jour-nul', 'jour', null) then
    raise exception 'B1 (jour) : la journée saturée aux limites inconnues accepte encore';
  end if;
  if public.ia_reserver_fournisseur('test-jour-nul', null, null) then
    raise exception 'B1 (jour) : `ia_reserver_fournisseur` passe sur un jour saturé aux limites nulles';
  end if;
  -- Et par la minute, pour que les deux chemins soient couverts.
  perform public.ia_saturer('test-min-nul', 'minute');
  if public.ia_reserver_fournisseur('test-min-nul', null, null) then
    raise exception 'B1 (minute) : `ia_reserver_fournisseur` passe sur une minute saturée aux limites nulles';
  end if;
  -- Le refus par la minute ne doit pas avoir laissé une unité de jour derrière
  -- lui : c'est le remboursement croisé, testé ici sur le chemin « limites
  -- inconnues » où il n'était pas couvert.
  select coalesce(c.n, 0) into n from public.ia_compteurs c
   where c.fournisseur = 'test-min-nul' and c.fenetre = 'jour';
  if n <> 0 then
    raise exception 'B1 (minute) : le refus a laissé % unité(s) de jour consommée(s)', n;
  end if;

  -- ==========================================================================
  -- R1 — SATURER UNE FENÊTRE N'EN MURE PAS UNE AUTRE
  --
  -- Un 429 de rythme ne doit pas condamner le fournisseur jusqu'à minuit.
  -- ==========================================================================
  perform public.ia_saturer('test-r1', 'minute');
  if public.ia_reserver_fenetre('test-r1', 'minute', 20) then
    raise exception 'R1 : la minute saturée accepte encore';
  end if;
  if not public.ia_reserver_fenetre('test-r1', 'jour', 50) then
    raise exception 'R1 : saturer la minute a muré la journée entière';
  end if;
  -- Et l'inverse tient aussi : un quota journalier épuisé ferme bien le jour.
  perform public.ia_saturer('test-r1', 'jour');
  if public.ia_reserver_fenetre('test-r1', 'jour', 50) then
    raise exception 'R1 : la journée saturée accepte encore';
  end if;

  -- La fenêtre repasse : le compteur repart de zéro tout seul.
  update public.ia_compteurs set debut = debut - interval '2 minutes'
   where fournisseur = 'test-r1' and fenetre = 'minute';
  if not public.ia_reserver_fenetre('test-r1', 'minute', 20) then
    raise exception 'R1 : la minute suivante n''a pas remis le compteur à zéro';
  end if;
  -- Y compris pour une SENTINELLE : un fournisseur saturé hier redevient
  -- appelable aujourd'hui, sinon le filet se transforme en bannissement.
  perform public.ia_saturer('test-r1j', 'jour');
  update public.ia_compteurs set debut = debut - interval '1 day'
   where fournisseur = 'test-r1j' and fenetre = 'jour';
  if not public.ia_reserver_fenetre('test-r1j', 'jour', null) then
    raise exception 'R1 : une sentinelle de jour survit au changement de jour';
  end if;

  -- ==========================================================================
  -- LES LIMITES CONNUES — on s'arrête EXACTEMENT au plafond
  -- ==========================================================================
  n := 0;
  for i in 1..25 loop
    if public.ia_reserver_fenetre('test-20', 'minute', 20) then n := n + 1; end if;
  end loop;
  if n <> 20 then
    raise exception 'plafond minute : % acceptées au lieu de 20', n;
  end if;

  -- R-f — UNE LIMITE À ZÉRO ÉTEINT VRAIMENT L'ÉTAGE.
  -- Mutation visée : le `where` du `on conflict` ne garde que le chemin de
  -- conflit ; l'insertion d'une fenêtre neuve était inconditionnelle, et une
  -- limite à 0 laissait donc passer un appel par fenêtre.
  if public.ia_reserver_fenetre('test-zero', 'minute', 0) then
    raise exception 'R-f : une limite à 0 laisse passer un appel';
  end if;
  if public.ia_reserver_fournisseur('test-zero2', 0, 0) then
    raise exception 'R-f : une limite à 0 laisse passer un appel par `ia_reserver_fournisseur`';
  end if;

  -- R-b — UNE LIMITE AU-DESSUS DE LA SENTINELLE NE LA REND PAS INVISIBLE.
  -- Mutation visée : `coalesce` seul ne couvrait que les limites NULL ; une
  -- limite connue supérieure au plafond réarmait B1 mot pour mot.
  perform public.ia_saturer('test-rb2', 'jour');
  if public.ia_reserver_fenetre('test-rb2', 'jour', 2000000) then
    raise exception 'R-b : une limite au-dessus du plafond fait disparaître la sentinelle';
  end if;
  -- Et la table refuse de porter une telle limite, ceinture et bretelles.
  begin
    update public.ia_fournisseurs set limite_jour = 2000000 where nom = 'openrouter';
    raise exception 'R-b : la table accepte une limite au-dessus du plafond';
  exception when check_violation then null;
  end;

  -- ==========================================================================
  -- LE REMBOURSEMENT — la minute refuse après que le jour a accepté
  --
  -- Sans lui, un fournisseur bridé à la minute mange son quota journalier en
  -- refus : cinq tentatives coûteraient cinq unités de jour pour zéro appel.
  -- ==========================================================================
  for i in 1..5 loop
    perform public.ia_reserver_fournisseur('test-rb', 2, 50);
  end loop;
  select coalesce(c.n, 0) into n from public.ia_compteurs c
   where c.fournisseur = 'test-rb' and c.fenetre = 'jour';
  if n <> 2 then
    raise exception 'remboursement : le compteur jour vaut % au lieu de 2', n;
  end if;

  -- ==========================================================================
  -- ET LE REMBOURSEMENT QUAND L'APPEL N'A JAMAIS EU LIEU (5xx, délai, clé absente)
  -- ==========================================================================
  perform public.ia_reserver_fournisseur('test-rf', 20, 50);
  perform public.ia_rendre_fournisseur('test-rf');
  select coalesce(sum(c.n), 0) into n from public.ia_compteurs c where c.fournisseur = 'test-rf';
  if n <> 0 then
    raise exception 'un échec réseau a consommé du quota : total %', n;
  end if;

  -- Un compteur ne descend JAMAIS sous zéro.
  -- Mutation visée : `greatest(0, n - 1)` remplacé par `n - 1`.
  perform public.ia_rendre_fournisseur('test-rf');
  perform public.ia_rendre_fournisseur('test-rf');
  select coalesce(min(c.n), 0) into n from public.ia_compteurs c where c.fournisseur = 'test-rf';
  if n < 0 then
    raise exception 'un compteur est passé sous zéro (%)', n;
  end if;

  -- R-a — ON NE REMBOURSE PAS UNE SENTINELLE.
  -- Mutation visée, et c'est un vrai scénario de production : A prend un 429 et
  -- sature ; B, concurrent, prend un 503 et rembourse. Sans garde, le compteur
  -- retombe sous le plafond et le fournisseur saturé réaccepte.
  perform public.ia_reserver_fournisseur('test-ra', null, null);
  perform public.ia_saturer('test-ra', 'minute');
  perform public.ia_rendre_fournisseur('test-ra');
  if public.ia_reserver_fenetre('test-ra', 'minute', null) then
    raise exception 'R-a : un remboursement concurrent a dé-saturé un fournisseur';
  end if;

  -- R-e — ON NE REMBOURSE QUE LA FENÊTRE COURANTE.
  -- Mutation visée : sans regarder `debut`, une requête lente partie à la minute
  -- M et remboursée à M+2 effaçait la réservation de quelqu'un d'autre.
  perform public.ia_reserver_fenetre('test-re', 'minute', 20);
  update public.ia_compteurs set debut = debut - interval '2 minutes'
   where fournisseur = 'test-re' and fenetre = 'minute';
  perform public.ia_rendre_fenetre('test-re', 'minute');
  select c.n into n from public.ia_compteurs c
   where c.fournisseur = 'test-re' and c.fenetre = 'minute';
  if n <> 1 then
    raise exception 'R-e : un remboursement tardif a touché une fenêtre périmée (n = %)', n;
  end if;
  -- Le remboursement légitime, lui, marche toujours.
  perform public.ia_reserver_fenetre('test-re2', 'minute', 20);
  perform public.ia_rendre_fenetre('test-re2', 'minute');
  select c.n into n from public.ia_compteurs c
   where c.fournisseur = 'test-re2' and c.fenetre = 'minute';
  if n <> 0 then
    raise exception 'R-e : le remboursement de la fenêtre courante ne marche plus (n = %)', n;
  end if;

  -- ==========================================================================
  -- LES BUDGETS
  -- ==========================================================================
  n := 0;
  for i in 1..35 loop
    if public.ia_reserver_budget(UID_TEST, 30, 1000000) then n := n + 1; end if;
  end loop;
  if n <> 30 then
    raise exception 'budget personne : % acceptées au lieu de 30', n;
  end if;

  -- R3 — LE BUDGET SE REND quand aucun étage n'aboutit.
  perform public.ia_rendre_budget(UID_TEST);
  select b.n into n from public.ia_budget_jour b
   where b.uid = UID_TEST and b.jour = (now() at time zone 'utc')::date;
  if n <> 29 then
    raise exception 'R3 : le budget personnel n''a pas été rendu (vaut %)', n;
  end if;

  -- Le global refuse → l'unité personnelle est rendue.
  delete from public.ia_budget_jour where uid = UID_TEST;
  n := 0;
  for i in 1..5 loop
    if public.ia_reserver_budget(UID_TEST, 30, 0) then n := n + 1; end if;
  end loop;
  if n <> 0 then
    raise exception 'budget global à 0 : % acceptées au lieu de 0', n;
  end if;
  select coalesce(b.n, 0) into n from public.ia_budget_jour b
   where b.uid = UID_TEST and b.jour = (now() at time zone 'utc')::date;
  if n <> 0 then
    raise exception 'le refus global a consommé du budget personnel (vaut %)', n;
  end if;

  -- ==========================================================================
  -- UNE SEULE SOURCE POUR LA SENTINELLE
  --
  -- Le plafond « limite inconnue » et la valeur posée par `ia_saturer` doivent
  -- venir du même endroit. Écrits deux fois, ils auraient fini par diverger, et
  -- le filet serait retombé sans bruit — ce qui est très exactement B1.
  -- ==========================================================================
  perform public.ia_saturer('test-sent', 'jour');
  select c.n into n from public.ia_compteurs c
   where c.fournisseur = 'test-sent' and c.fenetre = 'jour';
  if n < public.ia_plafond_inconnu() then
    raise exception 'la sentinelle (%) est sous le plafond des limites inconnues (%)',
      n, public.ia_plafond_inconnu();
  end if;

  -- ==========================================================================
  -- LES FUSEAUX HORAIRES — une seule référence, en UTC
  --
  -- Mutation visée : `ia_debut_fenetre` revenant au fuseau de la session. Le
  -- fichier d'origine ne faisait jamais `set timezone`, donc le correctif de
  -- fuseau avait exactement zéro couverture. `set local` : annulé au rollback.
  -- ==========================================================================
  set local timezone = 'Pacific/Kiritimati';          -- UTC+14
  d := public.ia_debut_fenetre('jour');
  set local timezone = 'Pacific/Niue';                -- UTC-11
  if public.ia_debut_fenetre('jour') <> d then
    raise exception 'fuseau : le début du jour dépend du fuseau de la session';
  end if;
  -- Le budget du jour suit la même référence que les compteurs.
  perform public.ia_reserver_budget(UID_TEST, 30, 1000000);
  if not exists (select 1 from public.ia_budget_jour
                  where uid = UID_TEST and jour = (now() at time zone 'utc')::date) then
    raise exception 'fuseau : `ia_budget_jour.jour` ne suit pas UTC';
  end if;
  set local timezone = 'UTC';

  -- ==========================================================================
  -- LE MÉNAGE — soixante jours, ET LA BORNE EST TESTÉE
  --
  -- Mutation visée : un ménage à 5 jours passait, parce que le fichier
  -- d'origine ne posait que des lignes à −90 et à 0 — ce qui ne distingue pas
  -- 60 de n'importe quelle valeur entre 1 et 89.
  -- ==========================================================================
  insert into public.ia_journal (jour, tache, fournisseur, ok, statut, duree_ms)
  values ((now() at time zone 'utc')::date - 61, 'pitch_jour', 'test-menage', false, 429, 10),
         ((now() at time zone 'utc')::date - 59, 'pitch_jour', 'test-menage', true,  200, 10),
         ((now() at time zone 'utc')::date,      'pitch_jour', 'test-menage', true,  200, 10);
  perform public.ia_menage();
  select count(*) into n from public.ia_journal where fournisseur = 'test-menage';
  if n <> 2 then
    raise exception 'ménage : % lignes gardées au lieu de 2 — la borne des 60 jours a bougé', n;
  end if;
  if exists (select 1 from public.ia_journal
              where fournisseur = 'test-menage'
                and jour < (now() at time zone 'utc')::date - 60) then
    raise exception 'ménage : une ligne de plus de 60 jours a survécu';
  end if;

  -- ==========================================================================
  -- LA COLONNE QUI MANQUAIT (R2) — le journal sait dire POURQUOI
  -- ==========================================================================
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ia_journal' and column_name = 'statut'
  ) then
    raise exception 'R2 : `ia_journal.statut` est absente, le journal reste aveugle';
  end if;

  -- ==========================================================================
  -- BL-1 — PERSONNE N'APPELLE CES FONCTIONS, ET « PERSONNE » INCLUT `PUBLIC`
  --
  -- Le défaut le plus grave du lot : `revoke … from anon, authenticated` ne
  -- retire pas la permission `EXECUTE` que PostgreSQL accorde à `PUBLIC` à la
  -- création. Comme les dix fonctions sont `security definer`, elles passent
  -- au-dessus du RLS : la clé publiable de l'app suffisait à éteindre l'IA.
  -- Ce test-ci est le seul qui aurait pu l'attraper.
  -- ==========================================================================
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'ia\_%'
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  if n <> 0 then
    raise exception 'BL-1 : % fonction(s) restent appelables par anon ou authenticated', n;
  end if;

  -- Et les tables restent fermées, RLS activé, aucune policy.
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname in
         ('ia_fournisseurs','ia_compteurs','ia_budget_jour','ia_journal')
     and c.relrowsecurity;
  if n <> 4 then
    raise exception 'RLS : seulement % table(s) sur 4 protégées', n;
  end if;
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('ia_fournisseurs','ia_compteurs','ia_budget_jour','ia_journal');
  if n <> 0 then
    raise exception 'RLS : % policy(ies) ouvrent une porte', n;
  end if;

  -- Les dix fonctions sont bien `security definer` avec un `search_path` figé.
  -- Mutation visée : passage en `security invoker` + `reset search_path`, qui
  -- passait sans qu'un seul cas bronche.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'ia\_%'
     and p.proname not in ('ia_plafond_inconnu', 'ia_debut_fenetre')
     and (not p.prosecdef
       or p.proconfig is null
       or not exists (select 1 from unnest(p.proconfig) x where x like 'search\_path=%'));
  if n <> 0 then
    raise exception 'sécurité : % fonction(s) sans `security definer` ou sans `search_path` figé', n;
  end if;

  -- R-c — LA VERSION FANTÔME D'`ia_saturer` NE DOIT PLUS EXISTER.
  -- `create or replace` ne change pas une signature : sur une base ayant connu
  -- la version précédente, `ia_saturer(text)` — celle d'avant R1, qui murait les
  -- deux fenêtres — survivait à côté de la nouvelle, et rendait tout appel à un
  -- argument ambigu.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'ia_saturer';
  if n <> 1 then
    raise exception 'R-c : % versions d''`ia_saturer` cohabitent', n;
  end if;

  raise notice 'TOUS LES CAS SQL PASSENT';
end $$;

-- RIEN N'EST VALIDÉ. Voir le pavé du haut : c'est la transaction annulée, et non
-- une discipline de nommage, qui garantit que ce fichier ne touche pas à tes
-- données. Ne remplace jamais ce `rollback` par un `commit`.
rollback;
