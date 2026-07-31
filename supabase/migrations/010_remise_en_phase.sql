-- =============================================================================
-- 010 — Remettre le dépôt en phase avec la production.
--
-- Ce fichier ne crée RIEN de nouveau. Il écrit ce qui tourne déjà en production
-- (projet `mqwryzopmtykjidabqfv`) et qui n'existait dans aucun fichier du
-- dépôt. Relevé sur la production le 31/07/2026, par lecture seule :
--
--   select pg_get_functiondef(oid), proacl from pg_proc ...
--   select pg_get_triggerdef(oid) from pg_trigger ...
--
-- Trois manques, et chacun a une conséquence différente :
--
--   1. `remplacer_cloches()` est appelée par `app-09-notifications.js:295`.
--      Sans elle, une installation neuve renvoie 404 sur chaque enregistrement
--      de cloche : les notifications sont définitivement cassées, en silence.
--   2. `mes_series_touch()` et son trigger tiennent `updated_at` à jour. Sans
--      eux la colonne garde la valeur de l'insertion, et la synchronisation —
--      qui compare les horodatages — ne voit plus jamais passer une
--      modification distante.
--   3. La révocation sur `declencher_notifier()` existe en production mais
--      dans aucun fichier. Sans elle, un projet reconstruit depuis le dépôt
--      exposerait cette fonction à `anon` via l'API REST — avec la seule clé
--      publiable, qui est en clair dans un dépôt public. C'est exactement la
--      faille refermée par 005, rouverte par une reconstruction.
--
-- REJOUABLE : `create or replace`, `drop trigger if exists` avant `create
-- trigger`, et des `revoke` / `grant` idempotents par nature. L'exécuter deux
-- fois de suite ne produit aucune erreur et ne change aucune règle.
--
-- Ce fichier vient APRÈS 001 (il a besoin de `public.mes_series`), après 003
-- (il a besoin de `public.push_cloches`) et après 005 (il a besoin de
-- `public.declencher_notifier`).
-- =============================================================================

-- --- 1. Enregistrer ses cloches en une seule fois ----------------------------
-- `security definer` : la fonction efface puis réécrit les lignes de l'appelant
-- dans une SEULE transaction. C'est la correction de la fenêtre de panne B6 —
-- l'ancien client faisait DELETE puis INSERT en deux appels, et une coupure
-- réseau entre les deux laissait le serveur à zéro cloche pendant que l'écran
-- affichait « Activées · 3 séries ».
--
-- Elle n'agit JAMAIS que sur les lignes de l'appelant : `auth.uid()` est la
-- seule source d'identité, jamais un paramètre. Un `p_cloches` hostile ne peut
-- donc rien déposer chez quelqu'un d'autre — au pire il remplit sa propre
-- liste. Les types autres que `tv` et `movie` sont écartés par le `where`,
-- ce qui évite de heurter la contrainte de `push_cloches` (003).
create or replace function public.remplacer_cloches(p_cloches jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  moi uuid := auth.uid();
  n   integer;
begin
  if moi is null then
    raise exception 'NON_CONNECTE';
  end if;

  delete from public.push_cloches where user_id = moi;

  insert into public.push_cloches (user_id, type, tmdb_id)
  select moi,
         c->>'type',
         (c->>'tmdb_id')::bigint
  from jsonb_array_elements(coalesce(p_cloches, '[]'::jsonb)) as c
  where c->>'type' in ('tv','movie')
  on conflict (user_id, type, tmdb_id) do nothing;

  get diagnostics n = row_count;
  return n;
end $function$;

-- Les droits tels qu'ils sont en production : `public` (c'est-à-dire « tout le
-- monde, y compris les rôles à venir ») n'a rien, les trois rôles Supabase ont
-- l'exécution.
--
-- `anon` y figure, contrairement à `nouveau_code()` en 007 où il a été révoqué.
-- Ce n'est pas dangereux — la fonction s'arrête sur `NON_CONNECTE` — mais ce
-- n'est pas non plus cohérent avec 007. On DOCUMENTE ici ce qui existe ; le
-- resserrer serait une décision de sécurité, pas une remise en phase, et elle
-- appartient à Adrien.
revoke all on function public.remplacer_cloches(jsonb) from public;
grant execute on function public.remplacer_cloches(jsonb) to anon, authenticated, service_role;

-- --- 2. `updated_at` se tient à jour tout seul -------------------------------
-- La synchronisation (`app-01`) compare l'horodatage local et l'horodatage
-- distant pour décider qui gagne. Si la base ne touche pas `updated_at` à
-- chaque écriture, cette comparaison se fait sur la date de création : deux
-- appareils cessent de se voir.
--
-- Pas de `security definer` ici, et pas de `grant` : une fonction de trigger
-- n'est jamais appelée directement, elle l'est par le moteur au nom du
-- propriétaire de la table. On la laisse donc avec les droits par défaut,
-- exactement comme en production.
create or replace function public.mes_series_touch()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end $function$;

-- `drop` avant `create` : `create trigger` n'accepte pas `or replace` sur
-- toutes les versions de Postgres, et rejouer le fichier ne doit pas empiler
-- deux triggers qui feraient le même travail deux fois.
drop trigger if exists mes_series_touch on public.mes_series;
create trigger mes_series_touch
  before insert or update on public.mes_series
  for each row execute function public.mes_series_touch();

-- --- 3. Refermer `declencher_notifier()` -------------------------------------
-- La fonction tourne en `security definer` et déclenche l'Edge Function
-- `notifier`, qui balaie TOUS les utilisateurs en droits `service_role`. Le
-- secret de 005 protège l'Edge Function, mais rien ne protégeait l'appel SQL
-- lui-même : `anon` pouvait l'invoquer via `/rest/v1/rpc/declencher_notifier`
-- avec la clé publiable, et donc rejouer le planificateur à volonté.
--
-- En production, seuls `postgres` et `service_role` ont l'exécution. C'est ce
-- qu'on écrit ici. `pg_cron` exécute la tâche en tant que `postgres` : la
-- planification de 005 continue de fonctionner.
revoke all on function public.declencher_notifier() from public, anon, authenticated;

-- --- 4. Deux révocations mineures, relevées au passage -----------------------
-- En comparant les droits de la production à ceux qu'obtient une base
-- reconstruite depuis le dépôt, deux autres écarts sont apparus :
-- `dans_mon_cercle()` (004) et `utiliser_code()` (001) n'ont plus le rôle
-- `public` en production, alors qu'une reconstruction le leur redonne.
--
-- Sans conséquence pratique — `anon` et `authenticated` gardent l'exécution des
-- deux côtés, et ce sont les seuls rôles qui existent. Mais « le dépôt décrit
-- la production » est soit vrai, soit faux ; on referme l'écart plutôt que de
-- laisser une différence inexpliquée que quelqu'un remesurera dans six mois.
--
-- Les `grant` qui suivent chaque `revoke` ne sont pas décoratifs : sur un
-- projet où les privilèges par défaut de Supabase n'auraient pas été posés,
-- révoquer `public` seul couperait l'accès à tout le monde.
revoke all on function public.dans_mon_cercle(uuid) from public;
grant execute on function public.dans_mon_cercle(uuid) to anon, authenticated, service_role;

revoke all on function public.utiliser_code(text) from public;
grant execute on function public.utiliser_code(text) to anon, authenticated, service_role;

-- Contrôle après exécution — doit renvoyer exactement ces trois lignes :
--
--   select proname, proacl::text from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and proname in ('remplacer_cloches','mes_series_touch','declencher_notifier')
--    order by 1;
--
--   declencher_notifier | {postgres=X/postgres,service_role=X/postgres}
--   mes_series_touch    | {=X/postgres,postgres=X/postgres,anon=X/postgres,
--                          authenticated=X/postgres,service_role=X/postgres}
--   remplacer_cloches   | {postgres=X/postgres,anon=X/postgres,
--                          authenticated=X/postgres,service_role=X/postgres}
--
-- Et le trigger doit exister, une seule fois :
--   select tgname from pg_trigger where tgrelid = 'public.mes_series'::regclass
--    and not tgisinternal;
