-- =============================================================================
-- 014 — Le relais IA (SPEC-04 §4.2, lot B — 10/08/2026).
--
-- Quatre tables, dix fonctions, et une seule idée : ON COMPTE AVANT
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
-- Tant que ces deux lignes valent NULL, la réservation passe pour les étages
-- Gemini jusqu'au plafond de `ia_plafond_inconnu()`, et c'est le 429 qui les
-- arrête — une fois par fenêtre, pour de bon depuis le correctif B1 (§6). Le
-- mécanisme est complet, il attend juste ses chiffres.
--
-- POUR LES POSER, une fois lus dans AI Studio (voir INSTALL.md §8) :
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

/* UNE LIMITE RESTE SOUS LA SENTINELLE, ET CE N'EST PAS UNE COQUETTERIE.
   R-b (relecture du 10/08, second tour) : `ia_saturer` marque un fournisseur
   saturé en portant son compteur à `ia_plafond_inconnu()` (1 000 000). Une
   limite configurée AU-DESSUS de ce nombre rendrait la sentinelle invisible —
   c'est-à-dire B1 à l'identique, réarmé par un simple `update`. Le nombre est
   déjà mille fois au-dessus de tout palier gratuit existant : personne n'a de
   raison légitime de le franchir, et `ia_reserver_fenetre` sait de toute façon
   se protéger seule (`least`). Deux verrous plutôt qu'un, sur le défaut qui a
   déjà coûté une relecture.
   `alter … add constraint if not exists` n'existe pas : d'où le bloc. */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ia_fournisseurs_limites_sous_plafond') then
    alter table public.ia_fournisseurs add constraint ia_fournisseurs_limites_sous_plafond
      check ((limite_minute is null or limite_minute < 1000000)
         and (limite_jour   is null or limite_jour   < 1000000));
  end if;
end $$;

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

/* `FROM PUBLIC` D'ABORD — voir le pavé de la section 12, où l'oubli de ce mot
   a coûté le défaut le plus grave du lot. Les tables n'ont pas de droit `public`
   par défaut, contrairement aux fonctions, mais on écrit la même formule partout
   pour qu'il n'y ait qu'une seule habitude à prendre. */
revoke all on public.ia_fournisseurs from public, anon, authenticated;
revoke all on public.ia_compteurs    from public, anon, authenticated;
revoke all on public.ia_budget_jour  from public, anon, authenticated;
revoke all on public.ia_journal      from public, anon, authenticated;

-- --- 5 bis. Le journal sait dire POURQUOI ------------------------------------
--
-- R2 (relecture du 10/08) — LE JOURNAL NE SAVAIT PAS DIAGNOSTIQUER. Il ne
-- portait qu'un booléen, et une seule ligne était écrite par requête : un 429
-- sur l'étage 1 suivi d'un succès sur l'étage 2 ne laissait qu'une trace,
-- « flash-lite, ok ». Le 429 était invisible, et « échec » ne distinguait pas un
-- quota plein, un délai dépassé, un schéma refusé et une clé absente.
--
-- Pour régler les budgets — le but que le §4.2 assigne au journal — c'était
-- suffisant. Pour le contrôle de bout en bout, qui est le SEUL moyen d'éprouver
-- les deux zones que personne n'a pu tester (l'API Gemini et la sortie
-- structurée d'OpenRouter), c'était aveugle : un échec silencieux y ressemble
-- trait pour trait à un mode dégradé qui fonctionne.
--
-- On ajoute donc une colonne, et le relais écrit désormais UNE LIGNE PAR ÉTAGE
-- TENTÉ. `alter … if not exists` : la table existe peut-être déjà.
alter table public.ia_journal add column if not exists statut int;

comment on column public.ia_journal.statut is
  'Le code HTTP du fournisseur, ou : 0 clé absente · 1 réponse invalide · '
  '2 quota local plein (pas d''appel) · 3 budget refusé · 599 délai/réseau.';

-- --- 6. Le plafond d'une limite inconnue -------------------------------------
--
-- B1 (relecture du 10/08) — LE FILET NE RETENAIT RIEN, ET C'EST LE DÉFAUT LE
-- PLUS COÛTEUX DU LOT.
--
-- La version d'origine testait `where p_limite is null or … or n < p_limite`.
-- Quand la limite est inconnue, le premier terme est vrai et la condition
-- court-circuite AVANT de regarder le compteur : la sentinelle posée par
-- `ia_saturer` n'était jamais lue. Reproduit sur PostgreSQL 16.13 — après
-- saturation, `n` valait 1 000 000 et la réservation rendait quand même `true`,
-- deux fois de suite.
--
-- Conséquence réelle : sur les deux étages Gemini — ceux qu'on appelle en
-- PREMIER — le 429 n'était pas redécouvert « une fois par fenêtre » mais À
-- CHAQUE REQUÊTE. Chaque appel payait deux allers-retours refusés avant
-- d'atteindre OpenRouter, et Google voyait une clé qui insiste sur un quota
-- qu'il venait de refuser.
--
-- LE CORRECTIF : on ne court-circuite plus, on compare toujours le compteur à
-- quelque chose. Une limite inconnue devient un plafond très haut — assez pour
-- ne jamais gêner un usage normal, assez bas pour que la sentinelle le dépasse.
-- Les deux nombres sortent de la même fonction : écrits à deux endroits, ils
-- auraient fini par diverger, et le filet serait retombé sans bruit.
create or replace function public.ia_plafond_inconnu()
returns int language sql immutable as $function$ select 1000000 $function$;

-- Le début de la fenêtre courante, TOUJOURS en UTC.
--
-- Broutille relevée par la relecture, et elle méritait d'être fermée :
-- `ia_budget_jour.jour` était calculé en UTC pendant que `ia_compteurs.debut`
-- suivait le fuseau de la session. Identique sur Supabase, qui tourne en UTC —
-- divergent partout ailleurs, et divergent EN SILENCE. Une seule référence.
create or replace function public.ia_debut_fenetre(p_fenetre text)
returns timestamptz language sql stable as $function$
  select case when p_fenetre = 'jour'
              then date_trunc('day',    now() at time zone 'utc') at time zone 'utc'
              else date_trunc('minute', now() at time zone 'utc') at time zone 'utc'
         end
$function$;

-- --- 7. Réserver et rendre, une fenêtre à la fois ----------------------------
--
-- Le test et l'incrément sont la MÊME instruction : c'est ce qui empêche deux
-- requêtes simultanées de passer toutes les deux sur la dernière place. Éprouvé
-- sous contention réelle — douze sessions concurrentes, limite à dix, dix
-- acceptées.
create or replace function public.ia_reserver_fenetre(
  p_fournisseur text, p_fenetre text, p_limite int
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ok      boolean;
  depart  timestamptz := public.ia_debut_fenetre(p_fenetre);
  /* `least(…, plafond_inconnu)` : LA SENTINELLE DOIT TOUJOURS GAGNER.
     R-b (relecture du 10/08, second tour). `coalesce` seul ne couvrait que les
     limites NULL. Avec une limite CONNUE supérieure au plafond — un
     `update ia_fournisseurs set limite_jour = 2000000`, geste que la migration
     elle-même et INSTALL.md §8 invitent à faire — la sentinelle posée par
     `ia_saturer` redevenait inférieure au plafond, donc invisible. C'est B1 mot
     pour mot, réarmé par une ligne de configuration. Le `check` de la table
     l'interdit déjà ; ce `least` le rend impossible même si le `check` saute. */
  plafond int := least(coalesce(p_limite, public.ia_plafond_inconnu()),
                       public.ia_plafond_inconnu());
begin
  /* R-f — UNE LIMITE À ZÉRO LAISSAIT PASSER UN APPEL PAR FENÊTRE. Le `where` du
     `on conflict` ne garde que le chemin de conflit ; l'insertion d'une fenêtre
     neuve, elle, était inconditionnelle. Poser `limite_minute = 0` pour éteindre
     un étage sans toucher `actif` ne l'éteignait donc pas. */
  if plafond <= 0 then return false; end if;

  insert into public.ia_compteurs (fournisseur, fenetre, debut, n)
  values (p_fournisseur, p_fenetre, depart, 1)
  on conflict (fournisseur, fenetre) do update
     set n     = case when public.ia_compteurs.debut < depart
                      then 1 else public.ia_compteurs.n + 1 end,
         debut = greatest(public.ia_compteurs.debut, depart)
   where public.ia_compteurs.debut < depart
      or public.ia_compteurs.n < plafond
  returning true into ok;
  return coalesce(ok, false);
end;
$function$;

-- Rendre une unité. Sert deux fois : quand la seconde fenêtre refuse après que
-- la première a accepté, et quand l'appel n'a jamais atteint le fournisseur.
--
-- DEUX GARDES, ET CHACUNE FERME UN DÉFAUT TROUVÉ À LA RELECTURE DU 10/08 :
--
-- R-a — ON NE REMBOURSE JAMAIS UNE SENTINELLE. Le relais appelle
-- `ia_rendre_fournisseur` sur tout échec non-429. Deux requêtes concurrentes
-- suffisaient : A prend un 429 et sature (n = 1 000 000), B prend un 503 et
-- rembourse — n retombe à 999 999, sous le plafond, et le fournisseur saturé
-- réaccepte. La garantie « un 429 par fenêtre » devenait « un par fenêtre, plus
-- un par échec concurrent ». Sur une edge function, la concurrence est la norme.
--
-- R-e — ON NE REMBOURSE QUE LA FENÊTRE COURANTE. Sans regarder `debut`, une
-- requête lente partie à la minute M et remboursée à M+2 effaçait la
-- réservation de quelqu'un d'autre. Même chose au passage de minuit pour la
-- fenêtre `jour`.
create or replace function public.ia_rendre_fenetre(p_fournisseur text, p_fenetre text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.ia_compteurs set n = greatest(0, n - 1)
   where fournisseur = p_fournisseur
     and fenetre     = p_fenetre
     and debut       = public.ia_debut_fenetre(p_fenetre)
     and n           < public.ia_plafond_inconnu();
$function$;

-- --- 8. Réserver une place chez un fournisseur -------------------------------
--
-- Le jour d'abord — c'est la fenêtre la plus contraignante, et un jour plein
-- rend inutile tout test de minute.
--
-- SI LA MINUTE REFUSE APRÈS QUE LE JOUR A ACCEPTÉ, on rend l'unité de jour.
-- Sans cette ligne, un fournisseur bridé à la minute mangerait son quota
-- journalier en refus.
create or replace function public.ia_reserver_fournisseur(
  p_fournisseur text, p_limite_minute int, p_limite_jour int
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.ia_reserver_fenetre(p_fournisseur, 'jour', p_limite_jour) then
    return false;
  end if;
  if not public.ia_reserver_fenetre(p_fournisseur, 'minute', p_limite_minute) then
    perform public.ia_rendre_fenetre(p_fournisseur, 'jour');
    return false;
  end if;
  return true;
end;
$function$;

-- L'appel n'a jamais eu lieu (clé absente, délai dépassé, 5xx) : on rend les
-- deux unités.
--
-- BROUTILLE RELEVÉE PAR LA RELECTURE, et elle comptait : un étage qui bat de
-- l'aile mangeait son quota en refus. Sur les cinquante requêtes quotidiennes
-- d'OpenRouter, quelques 5xx suffisaient à fermer la journée sans qu'une seule
-- phrase ait été écrite. Un 429, lui, n'est PAS rendu : le fournisseur a bien vu
-- la requête, et c'est lui qui l'a comptée.
create or replace function public.ia_rendre_fournisseur(p_fournisseur text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  select public.ia_rendre_fenetre(p_fournisseur, 'jour');
  select public.ia_rendre_fenetre(p_fournisseur, 'minute');
$function$;

-- --- 9. Marquer un fournisseur saturé ----------------------------------------
--
-- Appelée sur un 429. Le fournisseur a dit non : on le croit, et on ne le
-- rappelle plus jusqu'à la fin de la fenêtre CONCERNÉE.
--
-- R1 (relecture du 10/08) — LA FENÊTRE EST UN PARAMÈTRE, et ce n'était pas un
-- détail. La version d'origine murait les DEUX fenêtres d'un coup : un 429 de
-- rythme — le cas courant, celui qu'on récolte en envoyant deux requêtes dans la
-- même seconde — condamnait le fournisseur jusqu'à minuit UTC. Sur OpenRouter
-- (20 à la minute, 50 au jour), une rafale coûtait tout le quota restant de la
-- journée. Prouvé par la relecture : la fenêtre minute repassée, la réservation
-- refusait toujours.
--
-- Le relais choisit désormais la fenêtre sur `Retry-After` quand le fournisseur
-- le donne — plus de deux minutes d'attente, c'est un quota journalier ; en
-- dessous, c'est du rythme. Sans en-tête, on mure la minute : se tromper d'une
-- minute coûte une minute, se tromper d'un jour coûte un jour.
create or replace function public.ia_saturer(p_fournisseur text, p_fenetre text default 'minute')
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  insert into public.ia_compteurs (fournisseur, fenetre, debut, n)
  values (p_fournisseur, p_fenetre, public.ia_debut_fenetre(p_fenetre),
          public.ia_plafond_inconnu())
  on conflict (fournisseur, fenetre) do update
     set n = public.ia_plafond_inconnu(), debut = excluded.debut
  returning true;
$function$;

-- --- 10. Réserver une unité de budget ----------------------------------------
--
-- Les deux plafonds du §4.2, chacun en une seule instruction. Si le global
-- refuse, on rend l'unité individuelle : sans ça, un plafond global atteint
-- consommerait le budget de tout le monde en refus, et le lendemain personne
-- n'aurait rien alors que personne n'a rien obtenu.
create or replace function public.ia_reserver_budget(
  p_uid uuid, p_max_utilisateur int, p_max_global int
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ok      boolean;
  aujourd date := (now() at time zone 'utc')::date;
begin
  insert into public.ia_budget_jour (uid, jour, n)
  values (p_uid, aujourd, 1)
  on conflict (uid, jour) do update
     set n = public.ia_budget_jour.n + 1
   where public.ia_budget_jour.n < p_max_utilisateur
  returning true into ok;
  if ok is not true then return false; end if;

  if not public.ia_reserver_fenetre('@global', 'jour', p_max_global) then
    update public.ia_budget_jour set n = greatest(0, n - 1)
     where uid = p_uid and jour = aujourd;
    return false;
  end if;
  return true;
end;
$function$;

-- R3 (relecture du 10/08) — LE BUDGET SE REND QUAND RIEN N'ABOUTIT.
--
-- Il était réservé avant la boucle et jamais rendu : une journée où toute la
-- chaîne est en panne consommait les trente unités de chaque personne pour zéro
-- texte. Le lendemain, un utilisateur pouvait se retrouver à court sans avoir
-- jamais rien reçu. Le relais appelle donc ceci quand aucun étage n'a abouti.
create or replace function public.ia_rendre_budget(p_uid uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.ia_budget_jour set n = greatest(0, n - 1)
   where uid = p_uid and jour = (now() at time zone 'utc')::date;
  select public.ia_rendre_fenetre('@global', 'jour');
$function$;

-- --- 11. Le ménage -----------------------------------------------------------
--
-- Ces deux tables ne font que grossir, et l'une porte des identifiants. On garde
-- soixante jours : de quoi régler les budgets sur deux mois d'usage réel, ce que
-- le §4.2 demande, et pas une ligne de plus.
create or replace function public.ia_menage()
returns void
language sql
security definer
set search_path to 'public'
as $function$
  delete from public.ia_journal     where jour < ((now() at time zone 'utc')::date - 60);
  delete from public.ia_budget_jour where jour < ((now() at time zone 'utc')::date - 60);
$function$;

-- --- 12. QUI A LE DROIT D'APPELER CES FONCTIONS ------------------------------
--
-- BL-1 (relecture du 10/08, second tour) — CES DIX LIGNES NE RÉVOQUAIENT RIEN,
-- ET C'ÉTAIT LE DÉFAUT LE PLUS GRAVE DU LOT.
--
-- PostgreSQL accorde `EXECUTE` à `PUBLIC` sur toute fonction, à sa création.
-- `anon` et `authenticated` héritent de `PUBLIC`. Révoquer d'un rôle nommé ne
-- retire pas la permission héritée : la version d'origine écrivait
-- « from anon, authenticated », ce qui laissait la grant `PUBLIC` intacte.
-- Vérifié : `has_function_privilege('anon', …, 'execute')` rendait `true` pour
-- les dix fonctions. Et comme elles sont toutes `security definer`, elles
-- passent AU-DESSUS du RLS des tables : la posture « personne n'entre » de la
-- section 5 était décorative.
--
-- Ce que ça ouvrait, avec la clé publiable qui est dans le bundle de l'app :
--   · trois appels à `ia_saturer` et l'IA de toute l'application est éteinte
--     jusqu'à minuit UTC — en silence, puisque le relais rend
--     `{indisponible:true}` en HTTP 200 et que le client ne montre rien ;
--   · `ia_reserver_budget(uid, 1, 999999)` devient un oracle : sa valeur de
--     retour dit si telle personne a consommé de l'IA aujourd'hui ;
--   · `ia_menage()` purge le journal et les budgets à la demande d'un anonyme.
--
-- LA MIGRATION ÉTAIT LA SEULE DU DÉPÔT À AVOIR PERDU LE `public` : 007, 010, 011
-- et 012 l'écrivent toutes. C'est une régression contre une convention établie,
-- pas une subtilité qu'on découvre.
--
-- On garde `anon, authenticated` en plus de `public` : ils sont redondants tant
-- que ces rôles n'ont pas de grant directe, ils ne coûtent rien, et ils disent
-- l'intention à qui relit.
revoke all on function public.ia_plafond_inconnu()                    from public, anon, authenticated;
revoke all on function public.ia_debut_fenetre(text)                  from public, anon, authenticated;
revoke all on function public.ia_reserver_fenetre(text, text, int)    from public, anon, authenticated;
revoke all on function public.ia_rendre_fenetre(text, text)           from public, anon, authenticated;
revoke all on function public.ia_reserver_fournisseur(text, int, int) from public, anon, authenticated;
revoke all on function public.ia_rendre_fournisseur(text)             from public, anon, authenticated;
revoke all on function public.ia_saturer(text, text)                  from public, anon, authenticated;
revoke all on function public.ia_reserver_budget(uuid, int, int)      from public, anon, authenticated;
revoke all on function public.ia_rendre_budget(uuid)                  from public, anon, authenticated;
revoke all on function public.ia_menage()                             from public, anon, authenticated;

-- --- 13. LA VERSION FANTÔME D'`ia_saturer` -----------------------------------
--
-- R-c (relecture du 10/08, second tour). `[B4]` a fait passer `ia_saturer` de
-- `(text)` à `(text, text default 'minute')`. `create or replace function` ne
-- sait pas changer une signature : sur une base où la version précédente de
-- cette migration a déjà tourné, il en CRÉE UNE SECONDE et laisse la première.
--
-- La première est celle d'avant R1 — elle mure les DEUX fenêtres d'un coup — et
-- elle reste appelable. Pire, `select public.ia_saturer('x')` devient ambigu :
--   ERROR:  function public.ia_saturer(unknown) is not unique
--
-- Le relais envoie toujours ses deux paramètres, donc PostgREST résout bien ;
-- mais un geste manuel casse, et une fonction d'avant-correctif qui traîne est
-- exactement le genre de chose qu'on retrouve six mois plus tard sans comprendre.
drop function if exists public.ia_saturer(text);
