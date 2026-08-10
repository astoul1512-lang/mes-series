-- =============================================================================
-- 014 — Le relais IA (SPEC-04 §4.2, lot B — 10/08/2026).
--
-- Quatre tables, quatre fonctions, et une seule idée : ON COMPTE AVANT
-- D'APPELER. Le §4.2 le dit en une phrase — « le relais N'APPELLE PAS un
-- fournisseur dont le compteur local dit qu'il est plein ; on ne découvre pas
-- le 429, on l'évite ». Tout ce fichier sert à rendre cette phrase vraie.
--
--   ia_fournisseurs  l'échelle, ses limites, son ordre — des DONNÉES, qu'on
--                    change en une ligne de SQL sans rien redéployer.
--   ia_compteurs     une ligne par (fournisseur, fenêtre). Deux fenêtres :
--                    la minute et le jour.
--   ia_budget_jour   une ligne par (personne, jour) — le plafond individuel.
--   ia_journal       jour, tâche, fournisseur, résultat, durée. RIEN d'autre :
--                    ni prompt, ni réponse, ni identifiant de personne.
--
-- AUCUNE POLICY, ET C'EST VOULU. Les quatre tables ont RLS activé et zéro
-- policy : personne n'y touche, sauf la clé de service, qui passe au-dessus.
-- C'est de la comptabilité interne — aucun écran n'en a besoin, donc personne
-- n'a besoin d'y accéder. La posture la plus fermée est ici la bonne, et elle
-- suit la ligne de 012.
--
-- LES RÉSERVATIONS SONT ATOMIQUES, et ce n'est pas du zèle. Deux requêtes IA
-- simultanées — deux appareils, ou deux onglets — liraient le même compteur
-- avant que l'une ait écrit : les deux passeraient, et le plafond serait
-- dépassé d'autant. C'est exactement la course que 012 avait refermée sur les
-- codes de partage. `insert … on conflict … do update` avec la condition DANS
-- le `where` fait le test et l'incrément en une seule instruction.
--
-- REJOUABLE : `create table if not exists`, `create or replace function`,
-- `insert … on conflict do nothing`, `drop policy if exists`. Trois passages
-- d'affilée ne changent rien.
--
-- Ce fichier ne dépend d'aucune migration précédente.
-- =============================================================================

-- --- 1. L'échelle des fournisseurs ------------------------------------------
--
-- `limite_minute` et `limite_jour` acceptent NULL, et NULL VEUT DIRE
-- « INCONNUE », PAS « ILLIMITÉE ». La distinction est le point sensible de
-- cette migration.
--
-- POURQUOI DEUX LIGNES SUR TROIS PARTENT À NULL. La spec demande de relever les
-- limites officielles avant de les figer. Relevé le 10/08/2026 : Google NE
-- PUBLIE PLUS de chiffres pour son palier gratuit. La page « Rate limits » de
-- la documentation Gemini ne porte plus aucun tableau RPM/RPD/TPM ; elle renvoie
-- au tableau de bord AI Studio, derrière authentification, en précisant que les
-- limites « are not guaranteed ». Les seuls chiffres qui circulent viennent de
-- forums. On ne fige pas un compteur de production sur un forum.
--
-- Tant que ces deux lignes valent NULL, la réservation passe toujours pour les
-- étages Gemini et c'est le 429 qui les arrête, une fois par fenêtre. Le
-- mécanisme est complet, il attend juste ses chiffres.
--
-- POUR LES POSER, une fois lus dans AI Studio (voir INSTALL.md §7) :
--   update public.ia_fournisseurs
--      set limite_minute = 15, limite_jour = 1000   -- vos vrais chiffres
--    where nom = 'gemini-flash';
--
-- OPENROUTER, lui, publie : 20 requêtes/minute et 50 requêtes/jour tant que le
-- compte n'a pas acheté 10 $ de crédits cumulés (1 000/jour au-delà, acquis à
-- vie). Compteur au niveau du COMPTE, pas du modèle.
-- Source : openrouter.ai/docs/api-reference/limits, relevé le 10/08/2026.
create table if not exists public.ia_fournisseurs (
  nom            text primary key,
  rang           int  not null,
  modele         text not null,
  limite_minute  int,
  limite_jour    int,
  actif          boolean not null default true,
  maj            timestamptz not null default now()
);

insert into public.ia_fournisseurs (nom, rang, modele, limite_minute, limite_jour, actif)
values
  ('gemini-flash',      1, 'gemini-3.6-flash',              null, null, true),
  ('gemini-flash-lite', 2, 'gemini-3.5-flash-lite',         null, null, true),
  ('openrouter',        3, 'inclusionai/ling-3.0-tiny:free',  20,   50, true)
on conflict (nom) do nothing;

-- --- 2. Les compteurs -------------------------------------------------------
--
-- Une ligne par (fournisseur, fenêtre). `debut` porte le début de la fenêtre
-- courante : quand l'horloge en sort, on repart de zéro. Pas de tâche de
-- ménage, pas de cron — la remise à zéro est portée par la lecture, donc elle
-- ne peut pas être oubliée.
--
-- Le fournisseur conventionnel `@global` porte le budget global du §4.2 : c'est
-- un compteur de la même nature, il n'a pas besoin d'une table à lui.
create table if not exists public.ia_compteurs (
  fournisseur text not null,
  fenetre     text not null check (fenetre in ('minute', 'jour')),
  debut       timestamptz not null default now(),
  n           int not null default 0,
  primary key (fournisseur, fenetre)
);

-- --- 3. Le budget par personne ----------------------------------------------
--
-- L'identifiant vit ICI et nulle part ailleurs — surtout pas dans le journal.
-- Une ligne par personne et par jour, et rien qui dise ce qui a été demandé.
create table if not exists public.ia_budget_jour (
  uid  uuid not null,
  jour date not null default ((now() at time zone 'utc')::date),
  n    int  not null default 0,
  primary key (uid, jour)
);

-- --- 4. Le journal ----------------------------------------------------------
--
-- Quatre colonnes utiles, et pas une de plus. Ni prompt ni réponse : vie privée
-- d'un côté, poids de l'autre — une table qui garderait les textes grossirait
-- de plusieurs kilo-octets par appel pour une information qu'on ne relira
-- jamais. Ce qu'on veut savoir, c'est ce qui se consomme et si ça tient.
create table if not exists public.ia_journal (
  id          bigserial primary key,
  jour        date not null default ((now() at time zone 'utc')::date),
  tache       text not null,
  fournisseur text,
  ok          boolean not null,
  duree_ms    int,
  cree        timestamptz not null default now()
);
create index if not exists ia_journal_jour_idx on public.ia_journal (jour);

-- --- 5. Personne n'entre ----------------------------------------------------
alter table public.ia_fournisseurs enable row level security;
alter table public.ia_compteurs    enable row level security;
alter table public.ia_budget_jour  enable row level security;
alter table public.ia_journal      enable row level security;

-- Aucune policy n'est créée. Ces `drop … if exists` sont là pour qu'une
-- installation où quelqu'un en aurait ajouté une revienne à l'état voulu : la
-- migration décrit un état, elle ne suppose pas d'où l'on part.
drop policy if exists ia_fournisseurs_lecture on public.ia_fournisseurs;
drop policy if exists ia_compteurs_lecture    on public.ia_compteurs;
drop policy if exists ia_budget_lecture       on public.ia_budget_jour;
drop policy if exists ia_journal_lecture      on public.ia_journal;

revoke all on public.ia_fournisseurs from anon, authenticated;
revoke all on public.ia_compteurs    from anon, authenticated;
revoke all on public.ia_budget_jour  from anon, authenticated;
revoke all on public.ia_journal      from anon, authenticated;

-- --- 6. Réserver une place chez un fournisseur ------------------------------
--
-- Rend `true` si la place est prise, `false` si le fournisseur est plein. LE
-- TEST ET L'INCRÉMENT SONT LA MÊME INSTRUCTION : c'est ce qui empêche deux
-- requêtes simultanées de passer toutes les deux sur la dernière place.
--
-- La remise à zéro de fenêtre est portée par le `on conflict` : si `debut` est
-- sorti de la fenêtre, on réécrit `debut` et on repart à 1. Sinon on
-- incrémente, mais SEULEMENT si la limite le permet — et quand la limite est
-- NULL (inconnue), la condition est vraie et on laisse passer.
--
-- `security definer` : la fonction est appelée avec la clé de service, qui a
-- déjà tous les droits ; le marqueur sert à ce qu'elle continue de fonctionner
-- si un jour on l'appelle autrement. `search_path` figé, comme partout ailleurs
-- dans ce dépôt.
create or replace function public.ia_reserver_fournisseur(
  p_fournisseur   text,
  p_limite_minute int,
  p_limite_jour   int
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ok_minute boolean;
  ok_jour   boolean;
begin
  -- La fenêtre « jour » d'abord : c'est la plus contraignante des deux, et un
  -- jour plein rend inutile tout test de minute.
  insert into public.ia_compteurs (fournisseur, fenetre, debut, n)
  values (p_fournisseur, 'jour', date_trunc('day', now()), 1)
  on conflict (fournisseur, fenetre) do update
     set n     = case when public.ia_compteurs.debut < date_trunc('day', now())
                      then 1 else public.ia_compteurs.n + 1 end,
         debut = greatest(public.ia_compteurs.debut, date_trunc('day', now()))
   where p_limite_jour is null
      or public.ia_compteurs.debut < date_trunc('day', now())
      or public.ia_compteurs.n < p_limite_jour
  returning true into ok_jour;

  if ok_jour is not true then
    return false;
  end if;

  insert into public.ia_compteurs (fournisseur, fenetre, debut, n)
  values (p_fournisseur, 'minute', date_trunc('minute', now()), 1)
  on conflict (fournisseur, fenetre) do update
     set n     = case when public.ia_compteurs.debut < date_trunc('minute', now())
                      then 1 else public.ia_compteurs.n + 1 end,
         debut = greatest(public.ia_compteurs.debut, date_trunc('minute', now()))
   where p_limite_minute is null
      or public.ia_compteurs.debut < date_trunc('minute', now())
      or public.ia_compteurs.n < p_limite_minute
  returning true into ok_minute;

  -- LA MINUTE REFUSE APRÈS QUE LE JOUR A ACCEPTÉ : on a donc consommé une unité
  -- de jour pour un appel qui n'aura pas lieu. On la rend. Sans cette ligne, un
  -- fournisseur bridé à la minute mangerait son quota journalier en refus.
  if ok_minute is not true then
    update public.ia_compteurs
       set n = greatest(0, n - 1)
     where fournisseur = p_fournisseur and fenetre = 'jour';
    return false;
  end if;

  return true;
end;
$function$;

-- --- 7. Marquer un fournisseur saturé ---------------------------------------
--
-- Appelée sur un 429. Le fournisseur a dit non : on le croit, et on ne le
-- rappelle plus jusqu'à la fin de sa fenêtre. C'est le filet quand la limite
-- est inconnue — c'est-à-dire, aujourd'hui, sur les deux étages Gemini.
--
-- On pose un compteur volontairement énorme : la borne exacte n'a pas besoin
-- d'être connue pour que « plein » soit vrai jusqu'au prochain tour d'horloge.
create or replace function public.ia_saturer(p_fournisseur text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.ia_compteurs (fournisseur, fenetre, debut, n)
  values (p_fournisseur, 'minute', date_trunc('minute', now()), 1000000),
         (p_fournisseur, 'jour',   date_trunc('day',    now()), 1000000)
  on conflict (fournisseur, fenetre) do update
     set n = 1000000, debut = excluded.debut;
$function$;

-- --- 8. Réserver une unité de budget ----------------------------------------
--
-- Les deux plafonds du §4.2 en une seule instruction chacun : celui de la
-- personne, puis le global. Même atomicité, même raison.
--
-- SI LE GLOBAL REFUSE, ON REND L'UNITÉ INDIVIDUELLE. Sans ça, un plafond global
-- atteint consommerait le budget de tout le monde en refus, et le lendemain
-- personne n'aurait rien alors que personne n'a rien obtenu.
create or replace function public.ia_reserver_budget(
  p_uid            uuid,
  p_max_utilisateur int,
  p_max_global      int
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ok_perso  boolean;
  ok_global boolean;
  aujourd   date := (now() at time zone 'utc')::date;
begin
  insert into public.ia_budget_jour (uid, jour, n)
  values (p_uid, aujourd, 1)
  on conflict (uid, jour) do update
     set n = public.ia_budget_jour.n + 1
   where public.ia_budget_jour.n < p_max_utilisateur
  returning true into ok_perso;

  if ok_perso is not true then
    return false;
  end if;

  insert into public.ia_compteurs (fournisseur, fenetre, debut, n)
  values ('@global', 'jour', date_trunc('day', now()), 1)
  on conflict (fournisseur, fenetre) do update
     set n     = case when public.ia_compteurs.debut < date_trunc('day', now())
                      then 1 else public.ia_compteurs.n + 1 end,
         debut = greatest(public.ia_compteurs.debut, date_trunc('day', now()))
   where public.ia_compteurs.debut < date_trunc('day', now())
      or public.ia_compteurs.n < p_max_global
  returning true into ok_global;

  if ok_global is not true then
    update public.ia_budget_jour set n = greatest(0, n - 1)
     where uid = p_uid and jour = aujourd;
    return false;
  end if;

  return true;
end;
$function$;

-- --- 9. Le ménage -----------------------------------------------------------
--
-- Ces deux tables ne font que grossir, et l'une porte des identifiants. On
-- garde soixante jours : de quoi régler les budgets sur deux mois d'usage réel,
-- ce que le §4.2 demande, et pas une ligne de plus.
--
-- Pas de `cron` ici : `005` a déjà un planificateur, et lui ajouter une tâche
-- pour deux `delete` par mois serait cher payé. La fonction est là, appelable à
-- la main ou depuis n'importe quel tour du planificateur existant le jour où
-- ça deviendra utile.
create or replace function public.ia_menage()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  delete from public.ia_journal     where jour < ((now() at time zone 'utc')::date - 60);
  delete from public.ia_budget_jour where jour < ((now() at time zone 'utc')::date - 60);
$function$;

revoke all on function public.ia_reserver_fournisseur(text, int, int) from anon, authenticated;
revoke all on function public.ia_saturer(text)                        from anon, authenticated;
revoke all on function public.ia_reserver_budget(uuid, int, int)      from anon, authenticated;
revoke all on function public.ia_menage()                             from anon, authenticated;
