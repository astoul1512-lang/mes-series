-- =============================================================================
-- 006 — La photo de profil doit être une image embarquée, et rester petite.
--
-- `profils.photo` est rendue telle quelle dans un `<img src>` pour les gens du
-- cercle. Sans contrainte, un abonné peut y mettre :
--   — une adresse externe, qui devient une balise de traçage : notre adresse IP
--     et l'heure d'ouverture de l'app lui sont transmises à chaque affichage ;
--   — une data-URL de plusieurs mégaoctets, que tout le cercle télécharge.
--
-- La borne vient d'une MESURE, pas d'une intuition. Le recadrage de `app-02`
-- produit un JPEG 256×256 à qualité 0,82. Mesuré le 30/07 :
--     aplat uni ................  1 547 caractères
--     image type photo .........  15 243
--     bruit pur (pire cas) .....  50 947
-- Aucune photo réelle n'atteint le bruit pur. 80 000 laisse donc 57 % de marge
-- au-dessus du pire cas théorique, tout en refusant tout ce qui n'est pas une
-- vignette d'avatar. Les 60 000 initialement envisagés n'en laissaient que 18 %.
--
-- Si le recadrage change (taille ou qualité), REMESURER avant de toucher ici.
-- =============================================================================

alter table public.profils drop constraint if exists photo_data_url;
alter table public.profils
  add constraint photo_data_url check (
    photo is null
    or (photo like 'data:image/%' and length(photo) < 80000)
  );

-- Contrôle après exécution — doit refuser :
--   update public.profils set photo = 'https://exemple.fr/pixel.gif' where true;
