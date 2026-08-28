-- =============================================================================
-- 016 — SPEC-10 : les recos entrent dans un centre de notifications.
--
-- La table `recommandations` (009) ne bouge pas : elle GAGNE cinq colonnes, et
-- rien d'autre. Aucune policy n'est touchée — ni celle du cercle à l'insert, ni
-- celle du destinataire à l'update, ni celle de l'expéditeur au delete. C'est
-- une consigne explicite de la spec, et c'est aussi la prudence : ces règles
-- sont la seule chose qui empêche de déposer n'importe quoi chez n'importe qui,
-- et une migration qui « rafraîchit » des policies pour faire propre est
-- exactement la façon dont une porte s'ouvre sans que personne l'ait voulu.
--
-- CE QUE CHAQUE COLONNE PORTE, ET QUI L'ÉCRIT :
--
--   mot      — le mot personnel de l'expéditeur, écrit UNE FOIS à l'insert et
--              jamais retouché. Il s'affiche dans la bulle de la carte reçue.
--              Borné à 280 caractères par un `check` : c'est une phrase, pas un
--              message ; et la borne est ici, en base, parce que le compteur de
--              l'écran est une politesse, pas une garantie.
--   ajoute   — posé par le DESTINATAIRE quand il fait « + À voir ».
--   termine  — posé par le destinataire quand il termine le titre.
--   aime     — posé par le destinataire quand il pose un 👍 dessus.
--              Ces trois-là sont OPPORTUNISTES : ils arrivent au moment du
--              geste, silencieusement, et s'ils n'arrivent jamais il ne se
--              passe rien. Aucun écran ne les réclame.
--   notifie  — posé par la fonction `notifier` quand le push de la reco est
--              parti. PERSONNE D'AUTRE NE L'ÉCRIT : c'est lui qui garantit
--              « un push par reco, jamais deux », et c'est pour ça qu'il est
--              écrit en droits `service_role` et jamais depuis l'app.
--
-- La policy d'update de 009 (« le destinataire classe ce qu il recoit »)
-- couvre déjà `ajoute / termine / aime` : elle autorise le destinataire à
-- mettre à jour SA ligne, quelle qu'en soit la colonne. Rien à ajouter.
-- `notifie` est écrit par la fonction Edge, qui passe outre RLS.
--
-- REJOUABLE : `if not exists` partout, et le `check` du mot est ajouté sous
-- garde — `add constraint … if not exists` n'existe pas en PostgreSQL, on
-- passe donc par un bloc qui regarde le catalogue avant d'écrire.
-- =============================================================================

alter table public.recommandations
  add column if not exists mot     text not null default '',
  add column if not exists ajoute  timestamptz,
  add column if not exists termine timestamptz,
  add column if not exists aime    timestamptz,
  add column if not exists notifie timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.recommandations'::regclass
       and conname  = 'mot_borne'
  ) then
    alter table public.recommandations
      add constraint mot_borne check (char_length(mot) <= 280);
  end if;
end $$;

-- Le balayage de `notifier` cherche exactement ceci : les lignes jamais
-- notifiées, les plus récentes d'abord. Sans cet index il lit toute la table à
-- chaque tour du planificateur — sur une petite table ça ne se voit pas, et
-- c'est justement le moment de le poser.
create index if not exists recommandations_a_notifier_idx
  on public.recommandations (cree desc)
  where notifie is null;
