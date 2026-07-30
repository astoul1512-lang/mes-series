-- =============================================================================
-- 002 — L'avatar dans le profil partagé.
--
-- `majProfil()` (app-01) écrit ces trois colonnes et `chargerPartage()` les
-- relit : sans elles, l'insertion échoue en PGRST204 et l'erreur est avalée.
-- L'avatar ne se synchronise alors jamais, en silence, et les proches ne
-- voient qu'une initiale grise alors que l'app leur promet le contraire.
-- =============================================================================

alter table public.profils add column if not exists couleur text;
alter table public.profils add column if not exists embleme text;
-- La photo est une image embarquée (data-URL), produite par le recadrage de
-- `app-02`. Jamais une adresse externe : ce champ est rendu tel quel dans un
-- <img src> pour les gens du cercle. La contrainte qui le garantit arrive
-- avec la spec A4, dans sa propre migration — une migration déjà livrée ne se
-- modifie pas.
alter table public.profils add column if not exists photo text;
