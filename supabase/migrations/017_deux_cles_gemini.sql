-- =============================================================================
-- 017 — Deux clés Gemini : l'échelle passe de trois étages à cinq
--       (décision d'Adrien du 01/09/2026).
--
-- CE QUE ÇA CHANGE, EN UNE PHRASE. Le même modèle est appelable sur DEUX
-- comptes Google différents, donc le quota gratuit est réellement doublé.
--
-- LA CONDITION QUI REND CE LOT VRAI, et elle a été vérifiée avant d'écrire une
-- ligne : le quota gratuit de Gemini se compte PAR PROJET GOOGLE CLOUD, pas par
-- clé. Deux clés du même projet auraient partagé le même compteur — la bascule
-- n'aurait rien apporté et aurait juste ajouté un étage qui échoue. Adrien a
-- confirmé le 01/09 que `GEMINI_API_KEY` et `GEMINI_API_KEY2` viennent de deux
-- PROJETS et de deux COMPTES distincts.
--
-- L'ÉCHELLE VOULUE, et l'ordre a un sens : on épuise un modèle sur les deux
-- comptes avant de descendre en qualité. Un second compte de Flash vaut mieux
-- qu'un premier compte de Flash-Lite (RETOUR-01 point 4 : « on ne descend que
-- contraint »).
--
--   1  gemini-flash          GEMINI_API_KEY     10 / min   1000 / jour
--   2  gemini-flash-2        GEMINI_API_KEY2    10 / min   1000 / jour
--   3  gemini-flash-lite     GEMINI_API_KEY     15 / min   1500 / jour
--   4  gemini-flash-lite-2   GEMINI_API_KEY2    15 / min   1500 / jour
--   5  openrouter            OPENROUTER_API_KEY 20 / min     50 / jour
--
-- POURQUOI DES NOMS DIFFÉRENTS PLUTÔT QU'UNE COLONNE « compte ». Parce que
-- `ia_compteurs` a pour clé (fournisseur, fenêtre) et que `fournisseur` est ce
-- NOM : deux noms distincts donnent deux compteurs séparés, gratuitement, sans
-- toucher à une seule des dix fonctions de la migration 014. Un même nom sur
-- deux clés aurait fait compter les deux comptes ensemble — c'est-à-dire aurait
-- annulé le lot en silence.
--
-- LA COLONNE `cle_env` EST LE VRAI CORRECTIF. Jusqu'ici le relais DEVINAIT la
-- clé à partir du nom (`gemini…` → `GEMINI_API_KEY`, sinon OpenRouter). Tant
-- que la déduction tenait, deux étages Gemini ne pouvaient matériellement pas
-- porter deux clés. Le nom garde son autre rôle — dire le DIALECTE parlé — et
-- la colonne dit le COMPTE débité. Les deux informations étaient confondues.
--
-- LES DEUX ORDRES DE DÉPLOIEMENT SONT SÛRS, et c'est délibéré :
--   · migration AVANT la fonction → la vieille fonction ignore `cle_env` et
--     devine comme avant : les deux étages neufs tapent sur la clé n° 1. Deux
--     tentatives redondantes sur un compte saturé, rien de cassé.
--   · fonction AVANT la migration → les lignes n'ont pas encore `cle_env` et le
--     relais retombe sur `cleParDefaut`, qui est l'ancienne règle mot pour mot.
-- Aucun des deux entre-deux ne peut produire « aucune clé ».
--
-- ET SI `GEMINI_API_KEY2` N'EST PAS POSÉE ? Les étages 2 et 4 sont sautés,
-- journalisés en statut 0, et l'échelle se comporte comme avant ce lot. La
-- migration peut donc passer AVANT que le secret n'existe.
--
-- REJOUABLE : `add column if not exists`, `insert … on conflict do nothing`,
-- et chaque `update` borné par la valeur qu'il remplace — donc sans effet au
-- second passage, et incapable de défaire un réglage fait à la main.
--
-- Dépend de 014 (la table) et suppose 015 passée (les limites).
-- =============================================================================

-- --- 1. La colonne, et le rattrapage des lignes existantes ------------------
--
-- Elle naît NULLABLE : la remplir en même temps qu'on la crée obligerait à
-- choisir un défaut pour toutes les lignes, y compris celles qu'on ne connaît
-- pas. On la remplit ensuite, ligne par ligne, avec la règle exacte que le code
-- appliquait en dur — puis on exige qu'elle soit là.

alter table public.ia_fournisseurs add column if not exists cle_env text;

update public.ia_fournisseurs
   set cle_env = case when nom like 'gemini%' then 'GEMINI_API_KEY'
                      else 'OPENROUTER_API_KEY' end,
       maj = now()
 where cle_env is null;

-- --- 2. Les deux étages neufs ----------------------------------------------
--
-- `on conflict do nothing` : si quelqu'un les a déjà posés à la main avec
-- d'autres limites, ce sont les siennes qui restent.

insert into public.ia_fournisseurs (nom, rang, modele, cle_env, limite_minute, limite_jour, actif)
values
  ('gemini-flash-2',      2, 'gemini-3.6-flash',      'GEMINI_API_KEY2', 10, 1000, true),
  ('gemini-flash-lite-2', 4, 'gemini-3.5-flash-lite', 'GEMINI_API_KEY2', 15, 1500, true)
on conflict (nom) do nothing;

-- --- 3. La renumérotation des étages existants ------------------------------
--
-- `rang` n'est PAS unique dans 014 (seul `nom` est clé primaire), donc l'ordre
-- de ces instructions n'a aucune importance et deux étages ne peuvent pas
-- « entrer en collision ». Chaque `update` est borné par l'ancienne valeur : au
-- second passage il ne mord plus, et un rang déjà changé à la main est laissé
-- tranquille.
--
-- ATTENTION AUX ÉTAGES DE DÉPART. `TACHES[…].etage_depart` de `config.ts` est
-- un RANG comparé à celui-ci. Toutes les tâches partent aujourd'hui du rang 1,
-- donc cette renumérotation ne change l'étage de départ d'AUCUNE tâche. Si une
-- tâche partait un jour du rang 2, ce fichier l'aurait déplacée de Flash-Lite
-- vers le second compte de Flash sans le dire.

update public.ia_fournisseurs set rang = 3, maj = now()
 where nom = 'gemini-flash-lite' and rang = 2;
update public.ia_fournisseurs set rang = 5, maj = now()
 where nom = 'openrouter'        and rang = 3;

-- --- 4. La colonne devient obligatoire --------------------------------------
--
-- Une ligne SANS `cle_env` est rattrapée par le code ; une ligne AVEC une
-- `cle_env` vide est écartée par le code, donc l'étage disparaîtrait en
-- silence. La contrainte interdit les deux à la source.
-- `alter table … add constraint if not exists` n'existe pas : d'où le bloc,
-- comme pour `ia_fournisseurs_limites_sous_plafond` en 014.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ia_fournisseurs_cle_env_presente') then
    alter table public.ia_fournisseurs add constraint ia_fournisseurs_cle_env_presente
      check (cle_env is not null and length(btrim(cle_env)) > 0);
  end if;
end $$;

-- --- 5. Les contrôles qui rendent la migration vérifiable -------------------
--
-- Trois choses peuvent avoir mal tourné, et aucune ne se verrait à l'œil :
--   · un étage actif sans clé — le relais l'écarterait, l'échelle rétrécirait ;
--   · deux étages actifs au MÊME rang — l'ordre deviendrait indéterminé, donc
--     l'échelle dépendrait du hasard du tri ;
--   · les deux comptes réunis sur la même clé — c'est-à-dire le lot annulé,
--     avec deux fois plus d'appels pour le même quota.
-- Chacune lève ici, tout de suite, plutôt qu'au premier 429.

do $$
declare n int;
begin
  select count(*) into n from public.ia_fournisseurs
   where actif and (cle_env is null or length(btrim(cle_env)) = 0);
  if n > 0 then
    raise exception '017 : % fournisseur(s) actif(s) sans cle_env', n;
  end if;

  select count(*) into n from (
    select rang from public.ia_fournisseurs where actif group by rang having count(*) > 1
  ) d;
  if n > 0 then
    raise exception '017 : % rang(s) en double parmi les fournisseurs actifs', n;
  end if;

  select count(distinct cle_env) into n from public.ia_fournisseurs
   where actif and nom like 'gemini%';
  if n < 2 then
    raise exception
      '017 : les étages Gemini partagent une seule clé — le quota n''est pas doublé';
  end if;
end $$;

-- --- 6. Ce qu'on regarde après coup -----------------------------------------
--
--   select rang, nom, modele, cle_env, limite_minute, limite_jour, actif
--     from public.ia_fournisseurs order by rang;
--
-- Et, une fois quelques requêtes passées, la preuve que le second compte sert
-- VRAIMENT (c'est le seul chiffre qui dit si le lot a marché) :
--
--   select fournisseur, count(*), sum((ok)::int) as succes
--     from public.ia_journal
--    where jour = current_date group by fournisseur order by 1;
--
-- Un `gemini-flash-2` qui n'apparaît jamais est normal tant que l'étage 1 tient
-- la charge. Un `gemini-flash-2` qui apparaît TOUJOURS en statut 0 veut dire
-- que le secret `GEMINI_API_KEY2` n'est pas posé sur la fonction.
