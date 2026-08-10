-- Les tests SQL de la migration 014 — SPEC-04 lot B (10/08/2026).
--
--     psql "<url du projet>" -f supabase/tests/014_relais_ia.test.sql
--
-- ou, sur un PostgreSQL local vierge, après avoir créé les rôles :
--     create role anon; create role authenticated;
--     psql -f supabase/migrations/014_relais_ia.sql
--     psql -f supabase/tests/014_relais_ia.test.sql
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
-- puisque `fetch` était remplacé par un menteur. L'appel partait, le test était
-- vert, et l'effet n'existait pas.
--
-- C'est la frontière entre CONFORME et ÉPROUVÉ, et elle ne se franchit qu'ici :
-- du SQL exécuté par un vrai moteur. Tout ce qui suit est écrit contre ce
-- souvenir-là.
--
-- Chaque cas lève une exception nommée en cas d'échec : `psql` s'arrête et dit
-- lequel. Le fichier se termine par une remise à zéro, il est donc rejouable.

\set ON_ERROR_STOP on

-- Un bac à sable : on ne veut pas compter les lignes d'une vraie installation.
delete from public.ia_compteurs   where fournisseur like 'test-%' or fournisseur = '@global';
delete from public.ia_budget_jour where uid = '00000000-0000-0000-0000-000000000001';

do $$
declare
  n int;
  ok boolean;
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

  -- ==========================================================================
  -- R1 — SATURER UNE FENÊTRE N'EN MURE PAS UNE AUTRE
  --
  -- Un 429 de rythme ne doit pas condamner le fournisseur jusqu'à minuit.
  -- ==========================================================================
  delete from public.ia_compteurs where fournisseur = 'test-r1';
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

  -- ==========================================================================
  -- LES LIMITES CONNUES — on s'arrête EXACTEMENT au plafond
  -- ==========================================================================
  delete from public.ia_compteurs where fournisseur = 'test-20';
  n := 0;
  for i in 1..25 loop
    if public.ia_reserver_fenetre('test-20', 'minute', 20) then n := n + 1; end if;
  end loop;
  if n <> 20 then
    raise exception 'plafond minute : % acceptées au lieu de 20', n;
  end if;

  -- ==========================================================================
  -- LE REMBOURSEMENT — la minute refuse après que le jour a accepté
  --
  -- Sans lui, un fournisseur bridé à la minute mange son quota journalier en
  -- refus : cinq tentatives coûteraient cinq unités de jour pour zéro appel.
  -- ==========================================================================
  delete from public.ia_compteurs where fournisseur = 'test-rb';
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
  delete from public.ia_compteurs where fournisseur = 'test-rf';
  perform public.ia_reserver_fournisseur('test-rf', 20, 50);
  perform public.ia_rendre_fournisseur('test-rf');
  select coalesce(sum(c.n), 0) into n from public.ia_compteurs c where c.fournisseur = 'test-rf';
  if n <> 0 then
    raise exception 'un échec réseau a consommé du quota : total %', n;
  end if;

  -- ==========================================================================
  -- LES BUDGETS
  -- ==========================================================================
  delete from public.ia_budget_jour where uid = UID_TEST;
  delete from public.ia_compteurs where fournisseur = '@global';
  n := 0;
  for i in 1..35 loop
    if public.ia_reserver_budget(UID_TEST, 30, 1000) then n := n + 1; end if;
  end loop;
  if n <> 30 then
    raise exception 'budget personne : % acceptées au lieu de 30', n;
  end if;

  -- R3 — LE BUDGET SE REND quand aucun étage n'aboutit.
  perform public.ia_rendre_budget(UID_TEST);
  select b.n into n from public.ia_budget_jour b where b.uid = UID_TEST;
  if n <> 29 then
    raise exception 'R3 : le budget personnel n''a pas été rendu (vaut %)', n;
  end if;
  select c.n into n from public.ia_compteurs c
   where c.fournisseur = '@global' and c.fenetre = 'jour';
  if n <> 29 then
    raise exception 'R3 : le budget global n''a pas été rendu (vaut %)', n;
  end if;

  -- Le global refuse → l'unité personnelle est rendue.
  delete from public.ia_budget_jour where uid = UID_TEST;
  delete from public.ia_compteurs where fournisseur = '@global';
  n := 0;
  for i in 1..5 loop
    if public.ia_reserver_budget(UID_TEST, 30, 3) then n := n + 1; end if;
  end loop;
  if n <> 3 then
    raise exception 'budget global : % acceptées au lieu de 3', n;
  end if;
  select b.n into n from public.ia_budget_jour b where b.uid = UID_TEST;
  if n <> 3 then
    raise exception 'le refus global a consommé du budget personnel (vaut %)', n;
  end if;

  -- ==========================================================================
  -- UNE SEULE SOURCE POUR LA SENTINELLE
  --
  -- Le plafond « limite inconnue » et la valeur posée par `ia_saturer` doivent
  -- venir du même endroit. Écrits deux fois, ils auraient fini par diverger, et
  -- le filet serait retombé sans bruit — ce qui est très exactement B1.
  -- ==========================================================================
  delete from public.ia_compteurs where fournisseur = 'test-sent';
  perform public.ia_saturer('test-sent', 'jour');
  select c.n into n from public.ia_compteurs c
   where c.fournisseur = 'test-sent' and c.fenetre = 'jour';
  if n < public.ia_plafond_inconnu() then
    raise exception 'la sentinelle (%) est sous le plafond des limites inconnues (%)',
      n, public.ia_plafond_inconnu();
  end if;

  -- ==========================================================================
  -- LE MÉNAGE — soixante jours, pas un de plus
  -- ==========================================================================
  insert into public.ia_journal (jour, tache, fournisseur, ok, statut, duree_ms)
  values ((now() at time zone 'utc')::date - 90, 'pitch_jour', 'test', false, 429, 10),
         ((now() at time zone 'utc')::date,      'pitch_jour', 'test', true,  200, 10);
  perform public.ia_menage();
  select count(*) into n from public.ia_journal where fournisseur = 'test';
  if n <> 1 then
    raise exception 'le ménage a gardé % lignes au lieu de 1', n;
  end if;
  delete from public.ia_journal where fournisseur = 'test';

  -- ==========================================================================
  -- LA COLONNE QUI MANQUAIT (R2) — le journal sait dire POURQUOI
  -- ==========================================================================
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ia_journal' and column_name = 'statut'
  ) then
    raise exception 'R2 : `ia_journal.statut` est absente, le journal reste aveugle';
  end if;

  raise notice 'TOUS LES CAS SQL PASSENT';
end $$;

-- Remise à zéro : le fichier est rejouable, et il ne laisse rien derrière lui.
delete from public.ia_compteurs   where fournisseur like 'test-%' or fournisseur = '@global';
delete from public.ia_budget_jour where uid = '00000000-0000-0000-0000-000000000001';
