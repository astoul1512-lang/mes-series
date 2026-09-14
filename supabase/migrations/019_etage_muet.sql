-- =============================================================================
-- 019 — Le 5e étage était mort depuis trois semaines, et rien ne l'a dit
--       (constat du 14/09/2026).
--
-- CE QUI S'EST PASSÉ, ET IL FAUT LE LIRE EN ENTIER PARCE QUE C'EST LA DEUXIÈME
-- FOIS. Le 25/08, OpenRouter a cessé de répondre : quatre appels, quatre 404,
-- puis plus rien jusqu'au 14/09. Motif : `nvidia/nemotron-nano-9b-v2:free`
-- N'EXISTE PLUS. Vérifié le 14/09 sur la liste publique `openrouter.ai/api/v1/
-- models` — 445 modèles publiés, celui-là n'en fait pas partie. Un modèle retiré
-- répond 404, et un 404 ressemble à une panne passagère.
--
-- LA PREMIÈRE FOIS, C'ÉTAIT LA MIGRATION 014. Le modèle d'origine
-- (`inclusionai/ling-3.0-tiny:free`) ne déclarait pas `structured_outputs` :
-- HTTP 400, étage muet, même silence. On avait corrigé LE MODÈLE. On n'avait
-- pas corrigé CE QUI REND UN ÉTAGE MUET INVISIBLE — d'où cette migration-ci.
--
-- POURQUOI PERSONNE N'A RIEN VU, ET CE N'EST PAS UNE NÉGLIGENCE. L'alerte de la
-- migration 018 ne parle QUE si personne ne répond : c'est sa règle, elle est
-- juste, et elle protège la crédibilité de la notification. Or les étages 1 à 4
-- répondaient. Du point de vue de l'utilisateur, RIEN N'ÉTAIT CASSÉ — et c'est
-- exactement ce qui rend la panne durable : un filet de sécurité ne manque à
-- personne tant qu'on ne tombe pas dedans. On ne s'en aperçoit que le jour où
-- l'on en a besoin, c'est-à-dire le pire jour possible.
--
-- CE QUE CE FICHIER AJOUTE, ET CE QU'IL N'AJOUTE PAS. Il ajoute le MOYEN de
-- constater (`ia_etages_muets`), pas le moyen d'être prévenu : envoyer une
-- notification demande de choisir quand et comment, ce qui est une décision
-- d'Adrien et pas une conséquence technique. La fonction est écrite pour qu'un
-- appelant — le cron `notifier`, ou une main — n'ait qu'à la lire.
--
-- POURQUOI UNE FONCTION ET PAS UNE VUE. `ia_journal` n'a aucune policy (014) :
-- une vue serait soumise aux droits de qui l'interroge et ne rendrait rien.
-- `security definer` fait le tour, et le `revoke`/`grant` du §4 garde la porte
-- aussi fermée que celle des quatre autres fonctions du relais.
--
-- REJOUABLE : `update` borné par la valeur qu'il remplace, `create or replace
-- function`. Trois passages d'affilée ne changent rien, et aucun ne peut défaire
-- un réglage fait à la main.
--
-- Dépend de 014 (`ia_journal`, `ia_fournisseurs`) et de 015 (le modèle qu'on
-- remplace ici vient de là).
-- =============================================================================

-- --- 1. Le modèle mort, remplacé -------------------------------------------
--
-- MÊME FORME QUE LE RATTRAPAGE DE 014, ET POUR LA MÊME RAISON : l'`update` est
-- borné par l'ancienne valeur, donc il ne touche QUE la ligne encore porteuse du
-- modèle retiré. Une base où quelqu'un a déjà choisi autre chose à la main est
-- laissée tranquille, et un second passage ne mord plus.
--
-- LE REMPLAÇANT, ET SUR QUOI IL A ÉTÉ CHOISI. Relevé le 14/09 sur la liste
-- publique d'OpenRouter : il ne reste que DIX-NEUF modèles `:free`, dont CINQ
-- seulement déclarent `structured_outputs` — la contrainte que 014 a payée au
-- prix d'un aller-retour, et qui n'est pas négociable ici (le relais envoie un
-- `response_format` en `json_schema` strict, voir `appeler` dans `relais.ts`).
-- Des cinq, `nex-agi/nex-n2.5-mini:free` est retenu : 262 k de contexte, et un
-- « mini » qui promet de la vitesse — ce qui compte pour un étage qui, depuis
-- RETOUR-12, n'est atteint qu'en dernier et avec ce qui reste des dix secondes.
-- Les autres sont écartés pour des raisons qui se disent en une ligne :
--   · `dots-studio/dots-3-note-preview:free` — « preview » dans le nom, donc
--     candidat au retrait : ce serait reproduire la panne qu'on répare ;
--   · `nvidia/nemotron-3-super-120b-a12b:free` — 120 B, trop lent pour un
--     dernier étage sous plafond de temps ;
--   · `nex-agi/nex-n2.5-pro:free` — le grand frère du retenu, même remarque ;
--   · `liquid/lfm-2.5-2.6b:free` — 8 192 jetons de sortie, sous le confort.
--
-- CE CHOIX N'EST PAS MESURÉ, et le dire fait partie du lot. « Mesure fait foi »
-- s'applique : la vraie sélection se lira dans `ia_journal` après quelques
-- appels réels. Si celui-ci se tait à son tour, le §2 le dira — c'est tout
-- l'objet de la seconde moitié de ce fichier.

update public.ia_fournisseurs
   set modele = 'nex-agi/nex-n2.5-mini:free', maj = now()
 where nom = 'openrouter'
   and modele = 'nvidia/nemotron-nano-9b-v2:free';

-- --- 2. Les étages muets ----------------------------------------------------
--
-- « MUET » A UNE DÉFINITION PRÉCISE, et chacun de ses trois termes a été choisi
-- contre un faux positif :
--
--   · ACTIF. Un étage désactivé à la main ne répond pas, et c'est voulu. Le
--     signaler apprendrait à ignorer le signal.
--
--   · AU MOINS `p_min` TENTATIVES. Un étage jamais atteint n'est pas muet — il
--     est en réserve, ce qui est son rôle normal. C'est le cas ORDINAIRE du rang
--     5 tant que les quatre premiers tiennent la charge : sans ce seuil, la
--     fonction crierait tous les jours sur un étage en parfaite santé, et le
--     §5 du pavé de 018 dit pourquoi c'est le pire résultat possible.
--
--   · ZÉRO SUCCÈS. Pas « peu de succès » : ZÉRO. Un étage qui répond une fois
--     sur dix est un problème de qualité, pas une panne de configuration, et il
--     se lit dans le journal. Ici on cherche la panne SILENCIEUSE — celle qui
--     ressemble à rien parce que les étages du dessus absorbent tout.
--
-- LA FENÊTRE EST UN PARAMÈTRE, avec trois jours par défaut. Plus court, et un
-- week-end calme suffirait à faire crier un étage qui va bien ; plus long, et on
-- remettrait trois semaines à s'apercevoir de quoi que ce soit — ce qui est
-- précisément ce qu'on répare.
--
-- `statut_frequent` EST LA MOITIÉ UTILE DE LA RÉPONSE. Savoir qu'un étage est
-- muet ne dit pas quoi faire ; le code qu'il rend, si. Dans l'ordre de ce qu'on
-- a réellement vu sur ce projet :
--   404 → le modèle n'existe plus (ce lot, et il faudra le remplacer)
--   400 → le modèle ne sait pas rendre du JSON structuré (migration 014)
--     0 → la clé n'est pas posée sur la fonction
--   429 → quota épuisé, ce qui n'est PAS une panne mais une limite
--   599 → il ne répond pas dans les huit secondes
-- Les trois premiers se réparent sans écrire une ligne de code. C'est la raison
-- d'être de cette colonne : elle transforme « quelque chose ne va pas » en un
-- geste précis.

create or replace function public.ia_etages_muets(
  p_jours int default 3,
  p_min   int default 3
)
returns table (
  fournisseur     text,
  rang            int,
  modele          text,
  tentatives      bigint,
  statut_frequent int,
  derniere        date
)
language sql
security definer
set search_path to 'public'
as $function$
  select j.fournisseur,
         f.rang,
         f.modele,
         count(*) as tentatives,
         /* Le statut le PLUS FRÉQUENT sur la fenêtre, pas le dernier : un
            unique 429 de passage ne doit pas masquer trente 404 identiques. */
         (select j2.statut
            from public.ia_journal j2
           where j2.fournisseur = j.fournisseur
             and j2.jour >= current_date - greatest(p_jours, 0)
           group by j2.statut
           order by count(*) desc, j2.statut
           limit 1) as statut_frequent,
         max(j.jour) as derniere
    from public.ia_journal j
    join public.ia_fournisseurs f on f.nom = j.fournisseur
   where j.jour >= current_date - greatest(p_jours, 0)
     and f.actif
   group by j.fournisseur, f.rang, f.modele
  having count(*) >= greatest(p_min, 1)
     and count(*) filter (where j.ok) = 0
   order by f.rang;
$function$;

-- --- 3. Le compagnon : l'étage qui n'a JAMAIS été atteint --------------------
--
-- Le §2 ne voit que ce qui a été tenté, et c'est délibéré. Mais il laisse un
-- angle mort exact : un étage que l'échelle n'atteint jamais n'écrit aucune
-- ligne, donc il ne peut pas être muet — il est ABSENT, ce qui se dit
-- autrement et se répare autrement.
--
-- CE N'EST PAS UNE ALERTE, C'EST UN CONSTAT. Un rang 5 jamais atteint pendant
-- que les rangs 1 à 4 tiennent est la situation NORMALE et souhaitable. La
-- fonction existe pour qu'on sache faire la différence, au moment où l'on
-- regarde, entre « il va bien » et « il ne vient jamais » — sans quoi on
-- croirait un étage en bonne santé simplement parce qu'il n'a rien à dire.
-- C'est l'erreur de raisonnement exacte qui a laissé passer trois semaines.

create or replace function public.ia_etages_jamais_atteints(p_jours int default 3)
returns table (fournisseur text, rang int, modele text)
language sql
security definer
set search_path to 'public'
as $function$
  select f.nom, f.rang, f.modele
    from public.ia_fournisseurs f
   where f.actif
     and not exists (
       select 1 from public.ia_journal j
        where j.fournisseur = f.nom
          and j.jour >= current_date - greatest(p_jours, 0))
   order by f.rang;
$function$;

-- --- 4. Les droits — la posture de 014 et 018, sans exception ---------------
--
-- Ces fonctions lisent `ia_journal`, qui n'a AUCUNE policy et n'a jamais eu
-- vocation à être lu par un compte connecté. `security definer` leur fait
-- traverser la RLS : sans le `revoke` ci-dessous, elles offriraient à
-- `authenticated` exactement la lecture que 014 avait refusée. Le `public`
-- explicite est là parce que 014 a déjà payé son oubli une fois.

revoke all on function public.ia_etages_muets(int, int)      from public, anon, authenticated;
revoke all on function public.ia_etages_jamais_atteints(int)  from public, anon, authenticated;
grant execute on function public.ia_etages_muets(int, int)     to service_role;
grant execute on function public.ia_etages_jamais_atteints(int) to service_role;

-- --- 5. Ce qu'on regarde après coup -----------------------------------------
--
-- La question « est-ce qu'un étage est mort sans le dire ? », en une ligne :
--
--   select * from public.ia_etages_muets();
--
-- AUCUNE LIGNE = tout va bien. Une ligne = l'étage nommé a été essayé au moins
-- trois fois en trois jours et n'a jamais abouti ; `statut_frequent` dit quoi
-- faire (voir le pavé du §2).
--
-- Et son complément, pour ne pas confondre « en bonne santé » et « jamais
-- sollicité » :
--
--   select * from public.ia_etages_jamais_atteints();
--
-- CE QU'AURAIT DONNÉ CETTE REQUÊTE LE 28/08 — la date compte, c'est trois jours
-- après la première 404 et dix-sept jours avant qu'on s'en aperçoive :
--
--   fournisseur | rang | modele                          | tentatives | statut_frequent
--   openrouter  |    5 | nvidia/nemotron-nano-9b-v2:free |          4 |             404
--
-- Un nom, un code, et le geste à faire. C'est tout ce qui manquait.
