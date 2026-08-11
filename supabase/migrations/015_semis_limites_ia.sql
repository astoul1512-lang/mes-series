-- =============================================================================
-- 015 — Le semis de `ia_fournisseurs` pose enfin des LIMITES
--       (RETOUR-01 point 4, 11/08/2026).
--
-- CE QUI S'EST PASSÉ EN PRODUCTION. Le semis de 014 posait `limite_minute` et
-- `limite_jour` à NULL pour les deux étages Gemini, avec une raison honnête :
-- Google ne publie plus ces chiffres, et « NULL veut dire INCONNUE, pas
-- ILLIMITÉE ». Le raisonnement tenait sur le papier. À l'usage, il ne tient
-- pas : `ia_plafond_inconnu()` vaut un million, donc une limite inconnue
-- laisse TOUT passer, donc le garde-fou anti-429 du §4.2 — « on ne découvre
-- pas le 429, on l'évite » — était désarmé sur les deux étages qui comptent.
-- On découvrait la limite en la dépassant, ce que le §4.2 interdit en toutes
-- lettres.
--
-- CE QUE CETTE MIGRATION CHANGE, ET RIEN D'AUTRE. Elle pose des limites
-- PRUDENTES là où il n'y en avait aucune. Ce sont exactement les valeurs
-- qu'Adrien a posées à la main le 10/08 en débloquant l'IA, et elles font foi :
--
--     gemini-flash        10 / minute    1000 / jour
--     gemini-flash-lite   15 / minute    1500 / jour
--
-- Elles ne prétendent pas être les vraies limites de Google — personne ne les
-- connaît. Elles prétendent seulement être ASSEZ BASSES POUR PROTÉGER et assez
-- hautes pour ne gêner aucun usage réel : le budget par personne est de 30
-- requêtes par jour (`BUDGET_UTILISATEUR_JOUR`), le budget global de 1000.
-- Une limite prudente et fausse protège ; une limite absente ne protège rien.
--
-- POURQUOI UN `update … where … is null` ET PAS UN `insert on conflict`.
-- Parce que la table est déjà semée sur le projet : un `insert` ne ferait
-- rien du tout. Et parce que le `where limite_minute is null` est ce qui
-- garantit qu'on ne DÉFAIT AUCUN RÉGLAGE FAIT À LA MAIN. Quelqu'un qui a relevé
-- les vrais chiffres dans AI Studio et les a posés en base garde les siens.
-- C'est le même motif que la réparation du modèle OpenRouter en 014.
--
-- REJOUABLE. Passée une fois, le `is null` ne mord plus : la rejouer ne change
-- rien. C'est la propriété qu'on demande à toutes les migrations de ce dépôt.
--
-- LE SEMIS LUI-MÊME EST CORRIGÉ À LA SOURCE. L'`insert` ci-dessous porte
-- désormais les limites : une base NEUVE (nouveau projet Supabase, `INSTALL.md`
-- déroulé de zéro) n'aura jamais la fenêtre de vulnérabilité qu'a connue
-- celle-ci. Il garde son `on conflict do nothing` — sur la base existante il ne
-- fera rien, et c'est l'`update` qui travaille.
-- =============================================================================

-- --- 1. Le semis, corrigé à la source (base neuve) --------------------------

insert into public.ia_fournisseurs (nom, rang, modele, limite_minute, limite_jour, actif)
values
  ('gemini-flash',      1, 'gemini-3.6-flash',                10, 1000, true),
  ('gemini-flash-lite', 2, 'gemini-3.5-flash-lite',           15, 1500, true),
  ('openrouter',        3, 'nvidia/nemotron-nano-9b-v2:free', 20,   50, true)
on conflict (nom) do nothing;

-- --- 2. Le rattrapage des lignes semées sans limites ------------------------
--
-- Une seule instruction par étage, chacune bornée par `is null`. La contrainte
-- `ia_fournisseurs_limites_sous_plafond` (014) exige des valeurs strictement
-- sous un million : 10, 1000, 15 et 1500 la respectent très largement.

update public.ia_fournisseurs
   set limite_minute = 10, limite_jour = 1000, maj = now()
 where nom = 'gemini-flash'
   and (limite_minute is null or limite_jour is null);

update public.ia_fournisseurs
   set limite_minute = 15, limite_jour = 1500, maj = now()
 where nom = 'gemini-flash-lite'
   and (limite_minute is null or limite_jour is null);

-- --- 3. Le contrôle qui rend la correction vérifiable -----------------------
--
-- Après cette migration, plus AUCUN fournisseur actif ne doit porter de limite
-- inconnue. Si la ligne ci-dessous rend autre chose que zéro, le garde-fou est
-- encore désarmé quelque part et il faut le savoir tout de suite, pas au
-- premier 429.
--
--   select count(*) from public.ia_fournisseurs
--    where actif and (limite_minute is null or limite_jour is null);
--
-- Attendu : 0.

do $$
declare n int;
begin
  select count(*) into n from public.ia_fournisseurs
   where actif and (limite_minute is null or limite_jour is null);
  if n > 0 then
    raise exception
      'RETOUR-01 point 4 : % fournisseur(s) actif(s) sans limite — le garde-fou anti-429 reste désarmé', n;
  end if;
end $$;
