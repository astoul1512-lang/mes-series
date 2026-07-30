-- =============================================================================
-- 007 — I2 : un code de partage remplacé cesse immédiatement de fonctionner.
--
-- Avant : le client faisait un INSERT seul, jamais de DELETE. Chaque « Générer
-- un autre code » laissait le précédent VALIDE et consommable pendant 24 h,
-- alors que l'écran venait d'afficher le nouveau à sa place. Celui qu'on avait
-- montré à quelqu'un puis « remplacé » ouvrait toujours la porte.
--
-- La correction n'est PAS un DELETE suivi d'un INSERT côté client : entre les
-- deux, une coupure réseau laisse la personne sans aucun code alors que son
-- écran en montre un. C'est exactement la fenêtre de panne décrite en §B6.
-- Une seule fonction, donc, et une seule transaction.
--
-- `security definer` pour la même raison que `utiliser_code` : la fonction doit
-- pouvoir écrire dans `codes_partage` sans dépendre de l'ordre d'évaluation des
-- policies. Elle n'agit JAMAIS que sur les lignes de l'appelant — `auth.uid()`
-- est la seule source d'identité, jamais un paramètre.
--
-- Le code est tiré ICI et non côté client : c'est la seule façon de garantir
-- qu'une ligne de `codes_partage` ne peut pas être choisie. `gen_random_bytes`
-- vient de pgcrypto, installé dans le schéma `extensions` (vérifié en prod le
-- 30/07) — donc qualifié en dur, puisque `search_path` est verrouillé sur
-- `public`.
--
-- REJOUABLE : `create or replace`, et les `grant` sont idempotents.
-- =============================================================================

create or replace function public.nouveau_code()
returns table(code text, expire_le timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- Ni I, ni O, ni 0, ni 1 : lus à voix haute ou recopiés à la main, ils se
  -- confondent. Même alphabet que celui qu'utilisait le client.
  lettres constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  tirage  text;
  essai   int := 0;
  octets  bytea;
begin
  if auth.uid() is null then
    raise exception 'NON_CONNECTE';
  end if;

  -- Les codes précédents de CETTE personne meurent ici, dans la même
  -- transaction que la création du nouveau. À aucun instant il n'y en a deux
  -- de valides, ni zéro.
  delete from public.codes_partage c where c.proprio = auth.uid();

  -- Collision sur la clé primaire : ~1 chance sur 10^9 à cette échelle, mais
  -- une boucle coûte moins cher qu'un message d'erreur incompréhensible.
  loop
    essai := essai + 1;
    tirage := '';
    octets := extensions.gen_random_bytes(6);
    for i in 0..5 loop
      tirage := tirage || substr(lettres, (get_byte(octets, i) % length(lettres)) + 1, 1);
    end loop;

    begin
      insert into public.codes_partage (code, proprio) values (tirage, auth.uid());
      exit;
    exception when unique_violation then
      if essai >= 8 then
        raise exception 'CODE_INDISPONIBLE';
      end if;
    end;
  end loop;

  return query
    select c.code, c.expire_le
    from public.codes_partage c
    where c.code = tirage;
end $function$;

-- Appelable par une session ouverte seulement. `anon` n'a rien à faire ici :
-- la fonction s'arrête de toute façon sur `auth.uid() is null`, mais on ne
-- laisse pas la porte entrouverte pour autant.
revoke all on function public.nouveau_code() from public, anon;
grant execute on function public.nouveau_code() to authenticated;

-- Note : « Annuler ce code » ne demande AUCUNE fonction. La policy
-- « je supprime mes codes » de 001 autorise déjà le DELETE sur ses propres
-- lignes, et un code annulé qui ne se recrée pas n'a pas de fenêtre de panne.
