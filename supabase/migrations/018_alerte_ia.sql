-- =============================================================================
-- 018 — L'alerte quand l'IA tombe, et UNE SEULE par incident
--       (décision d'Adrien du 01/09/2026).
--
-- POURQUOI CETTE TABLE EXISTE MAINTENANT ET PAS AVANT. Le même jour, Adrien a
-- décidé de SUPPRIMER le plafond par utilisateur (« avec les backups on n'a pas
-- besoin de plafond »). J'ai objecté que l'échelle protège contre un
-- fournisseur EN PANNE, pas contre l'app qui APPELLE TROP : sans plafond
-- individuel, une boucle épuise le quota PARTAGÉ et fait tomber tous les
-- comptes en dégradé, pas seulement le fautif. Il a maintenu, avec une raison
-- qui tient : le repli local existe partout, donc une panne de quota dégrade
-- sans casser. Reste que plus rien ne PRÉVIENT. Cette table est ce qui reste
-- comme signal, et c'est la seule raison d'être du lot.
--
-- « JE VEUX JUSTE UNE NOTIF » — c'est la phrase qui a dessiné cette migration.
-- Adrien avait d'abord demandé « aucune limite de fréquence » ; une panne de
-- six heures aurait alors envoyé des dizaines de notifications sur son iPhone,
-- ce qui est la façon la plus sûre de faire couper les notifications d'une app
-- pour de bon. La règle retenue : UNE alerte par INCIDENT, à la bascule
-- « ça marchait » → « ça ne marche plus », et une nouvelle seulement si l'IA
-- repart puis retombe.
--
-- LA BASCULE EST ATOMIQUE, ET C'EST TOUT L'INTÉRÊT DE LA FAIRE EN SQL. Deux
-- requêtes IA simultanées — deux onglets, deux appareils — trouveraient toutes
-- les deux « pas encore en panne » si on lisait avant d'écrire, et deux
-- notifications partiraient pour un seul incident. `update … where not
-- en_panne … returning` fait le test et l'écriture en une seule instruction :
-- la seconde transaction attend le verrou de ligne, relit la condition après
-- coup, ne trouve plus rien à mettre à jour, et rend `false`. C'est exactement
-- le motif des réservations de 014, pour exactement la même raison.
--
-- UNE SEULE LIGNE, ET LE TYPE LE DIT. La clé primaire est un booléen contraint
-- à `true` : la table ne PEUT pas contenir deux lignes. C'est plus solide qu'un
-- `id = 1` par convention, qu'un `insert` de trop finirait par contredire.
--
-- RLS SANS AUCUNE POLICY, comme les quatre tables de 014 : c'est de la
-- comptabilité interne, aucun écran n'en a besoin, seule la clé de service y
-- touche.
--
-- REJOUABLE : `create table if not exists`, `insert … on conflict do nothing`,
-- `create or replace function`. Trois passages d'affilée ne changent rien.
--
-- Dépend de 014 (les conventions de nommage et de droits du relais IA).
-- =============================================================================

-- --- 1. L'état, en une ligne -----------------------------------------------
--
-- `motif` distingue les deux pannes, parce qu'elles ne se disent pas pareil à
-- l'écran : « quota » (on a tout consommé, c'est notre faute, ça repart demain)
-- et « injoignable » (personne ne répond, ce n'est pas notre faute, ça peut
-- repartir dans cinq minutes). Une notification qui annoncerait un quota
-- atteint alors que Google est en panne serait fausse une fois sur deux — et
-- une alerte fausse ne se croit plus.
--
-- `alertes` compte les incidents depuis toujours. Ce n'est pas de la
-- décoration : c'est le seul moyen de répondre à « est-ce que ça arrive
-- souvent ? » sans avoir gardé les notifications elles-mêmes.
create table if not exists public.ia_incident (
  id        boolean primary key default true check (id),
  en_panne  boolean     not null default false,
  depuis    timestamptz,
  motif     text,
  alertes   int         not null default 0,
  maj       timestamptz not null default now()
);

insert into public.ia_incident (id) values (true) on conflict (id) do nothing;

alter table public.ia_incident enable row level security;
revoke all on public.ia_incident from public, anon, authenticated;

-- --- 2. Ouvrir — et ne rendre `true` QU'À LA BASCULE ------------------------
--
-- C'est cette valeur de retour qui décide si une notification part. Rendre
-- `true` à chaque appel enverrait une alerte par requête échouée ; rendre
-- toujours `false` n'en enverrait jamais. Il n'y a pas de troisième
-- comportement à espérer d'ici, et c'est pour ça que la fonction ne fait que ça.
create or replace function public.ia_ouvrir_incident(p_motif text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare bascule boolean;
begin
  update public.ia_incident
     set en_panne = true,
         depuis   = now(),
         motif    = p_motif,
         alertes  = public.ia_incident.alertes + 1,
         maj      = now()
   where id and not en_panne
  returning true into bascule;
  /* `coalesce` parce qu'un `update` sans ligne touchée laisse `bascule` à NULL,
     et qu'un NULL rendu à l'appelant se lirait comme « peut-être » — alors que
     la seule question posée est « dois-je envoyer une notification ». */
  return coalesce(bascule, false);
end;
$function$;

-- --- 3. Fermer — et le dire, pour que l'incident suivant puisse alerter ------
--
-- Appelée à CHAQUE réponse réussie du relais. Elle ne coûte une écriture que
-- lorsqu'un incident était réellement ouvert : le `where … and en_panne` fait
-- que le cas ordinaire — tout va bien, tout allait déjà bien — ne touche pas la
-- ligne. Sans cette garde, chaque requête IA du monde entier écrirait dans une
-- même ligne, c'est-à-dire créerait un point de contention là où il n'y a
-- rien à écrire.
create or replace function public.ia_fermer_incident()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare ferme boolean;
begin
  update public.ia_incident
     set en_panne = false, motif = null, maj = now()
   where id and en_panne
  returning true into ferme;
  return coalesce(ferme, false);
end;
$function$;

-- --- 4. Les droits — la même posture que 014 --------------------------------
--
-- Sans ce bloc, `authenticated` pourrait appeler ces fonctions : n'importe quel
-- compte connecté fermerait l'incident en boucle et l'alerte ne partirait
-- jamais, ou l'ouvrirait pour faire sonner le téléphone d'Adrien. Le `public`
-- explicite est là parce que 014 a déjà payé son oubli une fois.
revoke all on function public.ia_ouvrir_incident(text) from public, anon, authenticated;
revoke all on function public.ia_fermer_incident()     from public, anon, authenticated;
grant execute on function public.ia_ouvrir_incident(text) to service_role;
grant execute on function public.ia_fermer_incident()     to service_role;

-- --- 5. Ce qu'on regarde après coup -----------------------------------------
--
--   select * from public.ia_incident;
--
-- `en_panne = true` avec un `depuis` vieux de plusieurs heures veut dire que
-- l'IA n'est jamais repartie — et donc qu'une seule notification est partie,
-- ce qui est le comportement voulu. `alertes` qui grimpe de plusieurs unités
-- par jour veut dire que l'IA bat de l'aile par intermittence : c'est alors le
-- journal (`ia_journal`, statuts 429 et 599) qui dit chez qui.
