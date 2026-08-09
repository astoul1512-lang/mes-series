-- =============================================================================
-- 012 — C7 : un appareil ne sonne plus pour le compte précédent.
--
-- LE DÉFAUT. `push_appareils` a `id uuid` en clé primaire et `endpoint` en
-- simple contrainte UNIQUE (003). Le client posait son abonnement avec
-- `Prefer: resolution=merge-duplicates` mais SANS dire sur quelle colonne
-- résoudre : PostgREST résolvait donc sur la clé primaire, qui ne collisionne
-- jamais puisqu'elle est tirée au hasard. La violation d'unicité sur
-- `endpoint` remontait en 409, et deux choses en découlaient :
--
--   · réinstaller la PWA (même endpoint navigateur) rendait la réinscription
--     impossible, avec un message PostgREST brut à l'écran ;
--   · si B se connecte sur le téléphone de A sans que A se soit déconnecté, la
--     ligne de A SURVIT : A continue de recevoir ses notifications sur le
--     téléphone de B, et B n'en reçoit aucune.
--
-- Le client ajoute désormais `?on_conflict=endpoint`. Ça suffit quand la ligne
-- appartient déjà à la personne connectée. Ça ne suffit PAS dans le second cas :
-- l'`ON CONFLICT DO UPDATE` sous-jacent porte sur une ligne dont le `user_id`
-- est celui de A, et la policy « mes lignes seulement » de 003 la rend
-- invisible à B. Postgres refuse, et c'est le bon comportement par défaut.
--
-- D'OÙ CETTE FONCTION. Elle est le seul endroit autorisé à franchir cette
-- frontière, et elle le fait dans un sens précis et unique : effacer toute
-- ligne portant CET endpoint, puis en insérer une pour l'appelant.
--
-- CE QU'ELLE NE PERMET PAS. Elle ne rend rien lisible : aucune donnée de A ne
-- sort. Elle ne permet pas de viser quelqu'un — on ne peut nommer qu'un
-- endpoint, et un endpoint est une URL opaque que le service de push ne donne
-- qu'au navigateur qui la possède. Le pire abus imaginable est de désabonner un
-- appareil dont on connaît déjà l'endpoint, c'est-à-dire un appareil qu'on a
-- en main. C'est exactement ce que l'écran propose de faire.
--
-- Rejouable sans dommage : `create or replace`, et le `delete` est idempotent.
-- =============================================================================

create or replace function public.reprendre_endpoint(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
) returns void
language plpgsql
security definer
-- Obligatoire sur une fonction `security definer` : sans lui, un `search_path`
-- posé par l'appelant pourrait faire pointer `push_appareils` ailleurs.
set search_path = public
as $$
begin
  -- `security definer` contourne la RLS : la première chose à faire est donc de
  -- vérifier soi-même qu'il y a bien quelqu'un derrière l'appel.
  if auth.uid() is null then
    raise exception 'authentification requise';
  end if;
  if p_endpoint is null or length(p_endpoint) < 20 then
    raise exception 'endpoint invalide';
  end if;

  delete from public.push_appareils where endpoint = p_endpoint;

  insert into public.push_appareils (user_id, endpoint, p256dh, auth, vu, echecs)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, now(), 0);
end;
$$;

-- La porte est fermée par défaut, puis ouverte à la seule personne connectée.
-- `anon` est nommé explicitement : c'est le rôle de la clé publiable, présente
-- en clair dans le navigateur.
revoke all     on function public.reprendre_endpoint(text, text, text) from public;
revoke execute on function public.reprendre_endpoint(text, text, text) from anon;
grant  execute on function public.reprendre_endpoint(text, text, text) to authenticated;
