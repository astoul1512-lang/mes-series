-- =============================================================================
-- 005 — Le planificateur des notifications, et le secret qui le protège.
--
-- La fonction `notifier` balaie TOUS les utilisateurs en droits service_role.
-- Sans garde-fou, un simple `POST {}` sans aucune authentification suffisait à
-- la déclencher : de quoi brûler le compteur d'échecs des appareils de tout le
-- monde (trois de suite et l'abonnement est supprimé), amplifier des appels
-- TMDB à volonté, et lire dans le bilan les identifiants des cloches d'autrui.
-- Faille fermée le 30/07/2026 (spec A1).
--
-- Le secret vit en base plutôt que dans une variable d'environnement : la
-- fonction SQL et l'Edge Function le lisent au même endroit, si bien que
-- personne n'a besoin de le connaître ni de le recopier pour installer le
-- projet. Il est tiré par la base, il n'apparaît donc dans aucun journal.
-- =============================================================================

create table if not exists public.cron_secrets (
  nom    text primary key,
  valeur text not null,
  cree   timestamptz not null default now()
);

-- RLS active et AUCUNE policy : `anon` et `authenticated` ne voient rien.
-- `service_role` contourne la RLS, c'est la seule voie de lecture.
alter table public.cron_secrets enable row level security;
revoke all on public.cron_secrets from anon, authenticated;

-- `on conflict do nothing` : rejouer ce fichier ne fabrique pas un nouveau
-- secret, ce qui couperait les notifications jusqu'au redéploiement.
insert into public.cron_secrets (nom, valeur)
values ('notifier', translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'))
on conflict (nom) do nothing;

-- --- Le déclencheur ----------------------------------------------------------
-- Remplacer <PROJET> par la référence du projet Supabase et <CLE_PUBLIABLE>
-- par la clé publiable (celle qui est déjà dans le code client, app-01) —
-- voir INSTALL.md. Aucun secret en clair ici.
create or replace function public.declencher_notifier()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select valeur into v_secret from public.cron_secrets where nom = 'notifier';
  perform net.http_post(
    url     := 'https://<PROJET>.supabase.co/functions/v1/notifier',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', '<CLE_PUBLIABLE>',
                 'Authorization', 'Bearer <CLE_PUBLIABLE>',
                 -- Sans cet en-tête, la fonction répond 401 et ne lit aucune table.
                 'x-cron-secret', coalesce(v_secret, '')),
    body    := '{}'::jsonb
  );
end $function$;

-- --- La planification --------------------------------------------------------
-- Toutes les deux heures. Les sorties TMDB sont tolérées sur deux jours par la
-- fonction : un tour manqué se rattrape tout seul.
-- `unschedule` d'abord, sinon rejouer ce fichier empile les tâches.
select cron.unschedule('notifier') where exists (
  select 1 from cron.job where jobname = 'notifier');
select cron.schedule('notifier', '0 */2 * * *', 'select public.declencher_notifier()');

-- Contrôle après exécution :
--   select jobname, schedule, active from cron.job;
--   select public.declencher_notifier();
--   select status_code, content from net._http_response order by id desc limit 1;
-- Attendu : 200 et un bilan JSON. Un 401 « reserve au planificateur » veut dire
-- que la fonction a été déployée sans que le secret existe encore.
