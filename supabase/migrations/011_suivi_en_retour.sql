-- =============================================================================
-- 011 — Le suivi en retour, et la notification qui le déclenche (cycle 3, pt 6).
--
-- Deux objets :
--   1. `suivre_en_retour(cible)` — la SEULE porte pour suivre quelqu'un sans
--      code : elle vérifie ELLE-MÊME la réciprocité (la cible doit déjà nous
--      suivre) avant d'insérer.
--   2. Un déclencheur `after insert` sur `abonnements` qui fait partir la
--      notification DANS LA SECONDE, par `pg_net` — l'envoi est mis en file et
--      rend la main immédiatement : la validation d'un code reste instantanée
--      même si le service d'envoi est lent.
--
-- CE QUE CE FICHIER NE FAIT PAS, ET NE DOIT JAMAIS FAIRE : ajouter une policy
-- INSERT sur `public.abonnements`. Le commentaire de 001 est la règle : « on ne
-- s'abonne QUE par utiliser_code() » — et désormais aussi par
-- `suivre_en_retour()`, qui est une fonction, pas une policy ouverte. C'est ce
-- qui empêche de s'abonner à quelqu'un dont on connaîtrait l'uid.
--
-- AVANT D'EXÉCUTER : remplacer <PROJET> par la référence du projet Supabase et
-- <CLE_PUBLIABLE> par la clé publiable (les mêmes valeurs que dans 005 —
-- voir INSTALL.md). Aucun secret en clair ici : le secret d'appel est lu dans
-- `cron_secrets`, comme pour le planificateur.
--
-- REJOUABLE : `create or replace` et `drop trigger if exists` — l'exécuter deux
-- fois de suite ne produit aucune erreur et ne change aucune règle.
-- Vient APRÈS 001 (abonnements, profils), 003 (les appareils push) et
-- 005 (cron_secrets, la fonction notifier déployée).
-- =============================================================================

-- --- 1. Suivre en retour -----------------------------------------------------
-- `security definer` parce que la table n'a AUCUNE policy d'écriture : c'est la
-- fonction qui insère, et elle seule. Aucun paramètre n'est un identifiant
-- qu'on pourrait inventer utilement : sans réciprocité préalable, elle refuse.
create or replace function public.suivre_en_retour(cible uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'NON_CONNECTE';
  end if;
  if cible = auth.uid() then
    raise exception 'SOI_MEME';
  end if;

  -- La cible doit DÉJÀ nous suivre : c'est toute la règle du « en retour ».
  if not exists (select 1 from public.abonnements a
                 where a.suiveur = cible and a.suivi = auth.uid()) then
    raise exception 'PAS_RECIPROQUE';
  end if;

  insert into public.abonnements (suiveur, suivi)
  values (auth.uid(), cible)
  on conflict do nothing;
end $function$;

-- Appelable par une session ouverte seulement — même règle que `nouveau_code`.
revoke all on function public.suivre_en_retour(uuid) from public, anon;
grant execute on function public.suivre_en_retour(uuid) to authenticated;

-- --- 2. La notification, à l'insertion d'un abonnement -----------------------
-- UN SEUL déclencheur, DEUX messages : il regarde si l'abonnement inverse
-- existe déjà au moment de l'insertion.
--   · pas de réciproque  → « {prénom} t'a ajouté » — c'est un code qui vient
--     d'être saisi ;
--   · réciproque déjà là → « {prénom} t'a suivi en retour ».
-- Deux insertions au maximum pour une paire (une par sens) : la clé primaire
-- (suiveur, suivi) empêche d'aller plus loin — pas de boucle possible.
-- L'envoi passe par la fonction `notifier` en mode « un utilisateur, un
-- message », avec le même secret que le planificateur.
create or replace function public.notifier_abonnement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
  v_pseudo text;
  v_recip  boolean;
  v_titre  text;
  v_corps  text;
begin
  -- L'abonnement inverse existe-t-il déjà ?
  select exists (select 1 from public.abonnements a
                 where a.suiveur = new.suivi and a.suivi = new.suiveur)
    into v_recip;

  -- Le prénom vient de `profils` ; s'il est vide, l'app dit déjà « Sans nom »
  -- (utiliser_code) : on reprend ce mot, on n'en invente pas un autre.
  select coalesce(p.pseudo, 'Sans nom') into v_pseudo
  from public.profils p where p.user_id = new.suiveur;
  if v_pseudo is null or v_pseudo = '' then v_pseudo := 'Sans nom'; end if;

  if v_recip then
    v_titre := v_pseudo || ' t''a suivi en retour';
    v_corps := 'Vous vous suivez maintenant.';
  else
    v_titre := v_pseudo || ' t''a ajouté';
    v_corps := 'Il voit ta bibliothèque. Tu peux le suivre en retour.';
  end if;

  select valeur into v_secret from public.cron_secrets where nom = 'notifier';

  -- `net.http_post` met la requête en file et rend la main tout de suite : le
  -- déclencheur ne fait JAMAIS attendre celui qui a saisi le code. Un appel
  -- HTTP synchrone ici ferait attendre l'écran de celui qui valide.
  perform net.http_post(
    url     := 'https://<PROJET>.supabase.co/functions/v1/notifier',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'apikey', '<CLE_PUBLIABLE>',
                 'Authorization', 'Bearer <CLE_PUBLIABLE>',
                 'x-cron-secret', coalesce(v_secret, '')),
    body    := jsonb_build_object('direct', jsonb_build_object(
                 'user_id', new.suivi,
                 'titre',   v_titre,
                 'corps',   v_corps,
                 -- Un appui ouvre l'écran des abonnements.
                 'url',     '#/abonnements',
                 'cle',     'abo-' || new.suiveur || '-' ||
                            floor(extract(epoch from now()))::bigint))
  );
  return new;
exception when others then
  -- Une notification qui échoue ne doit JAMAIS empêcher l'abonnement : le
  -- geste de l'utilisateur passe, la notification est un agrément.
  return new;
end $function$;

drop trigger if exists abonnement_notifie on public.abonnements;
create trigger abonnement_notifie
  after insert on public.abonnements
  for each row execute function public.notifier_abonnement();

-- Personne n'appelle `notifier_abonnement()` à la main : elle n'existe que
-- pour le déclencheur.
revoke all on function public.notifier_abonnement() from public, anon, authenticated;

-- Contrôle après exécution :
--   select proname from pg_proc where proname in ('suivre_en_retour','notifier_abonnement');
--   select tgname from pg_trigger where tgname = 'abonnement_notifie';
--   -- Et surtout : AUCUNE policy insert ne doit exister sur abonnements —
--   select polname, polcmd from pg_policy
--     where polrelid = 'public.abonnements'::regclass;
--   -- Attendu : uniquement 'r' (select) et 'd' (delete). Aucun 'a' (insert).
