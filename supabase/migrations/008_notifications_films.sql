-- =============================================================================
-- 008 — I8 + I9 : les réglages de notification, côté base.
--
-- I8. `push_reglages.films` portait trois drapeaux — `cine`, `stream`, `vod` —
-- pour DEUX événements réels. Côté `notifier`, `stream` valait le type 4 de
-- TMDB et `vod` les types 4 et 5 ; or le type 5 (le disque) est écarté partout
-- ailleurs dans l'app. Deux réglages déclenchés par la même donnée, et un film
-- sorti en numérique pouvait produire deux notifications pour un seul
-- événement. On plie sur `{cine, maison}`.
--
-- I9. `quand` pouvait valoir `soir` ou `samedi`. Ces deux valeurs n'ont jamais
-- été implémentées : la fonction sautait la personne, qui ne recevait donc plus
-- RIEN. Toutes les lignes repassent à `sortie`. La colonne est conservée — elle
-- redeviendra utile le jour où un résumé existera vraiment — mais elle ne
-- pilote plus rien côté serveur.
--
-- MESURÉ AVANT ÉCRITURE (production, 30/07/2026) :
--   · `push_reglages` : 1 ligne, déjà en `quand = 'sortie'`, `films` portant
--     bien les trois clés `cine` / `stream` / `vod`.
--   · `push_envois`   : 0 ligne.
-- Donc la réécriture des clés d'envoi ci-dessous ne touche rien aujourd'hui.
-- Elle est écrite quand même : elle est la seule chose qui empêche un titre
-- déjà annoncé en « streaming » d'être réannoncé en « à la maison » sur une
-- base qui, elle, aurait de l'historique.
--
-- REJOUABLE : chaque instruction est idempotente — une fois `stream` et `vod`
-- retirés, les `where` ne trouvent plus rien.
-- =============================================================================

-- --- I9 : plus personne n'est éteint ----------------------------------------
update public.push_reglages
   set quand = 'sortie',
       maj   = now()
 where quand is distinct from 'sortie';

-- --- I8 : {cine, stream, vod} -> {cine, maison} ------------------------------
-- `maison` vaut vrai si l'un des deux anciens drapeaux valait vrai. On ne
-- touche pas à `cine`. Les deux anciennes clés sont retirées de l'objet : les
-- laisser traîner, c'est garantir qu'un jour quelqu'un les relira.
update public.push_reglages
   set films = (coalesce(films, '{}'::jsonb) - 'stream' - 'vod')
               || jsonb_build_object(
                    'maison',
                    coalesce((films ->> 'maison')::boolean, false)
                      or coalesce((films ->> 'stream')::boolean, false)
                      or coalesce((films ->> 'vod')::boolean, false)),
       maj   = now()
 where films ? 'stream' or films ? 'vod';

-- --- I8 : l'historique des envois -------------------------------------------
-- `push_envois.cle` vaut « movie:<id>:<genre> » et sert de verrou anti-doublon
-- (clé primaire (user_id, cle)). Les clés en `stream` et `vod` désignent
-- désormais le même événement que `maison` : sans réécriture, un film déjà
-- annoncé le serait une seconde fois sous le nouveau nom.
--
-- On supprime d'abord les futurs doublons — un film annoncé À LA FOIS en
-- `stream` et en `vod` donnerait deux fois la même clé `maison`, ce qui
-- violerait la clé primaire — puis on renomme ce qui reste.
delete from public.push_envois e
 where e.cle like 'movie:%:vod'
   and exists (select 1 from public.push_envois d
                where d.user_id = e.user_id
                  and d.cle = replace(e.cle, ':vod', ':stream'));

update public.push_envois
   set cle = regexp_replace(cle, ':(stream|vod)$', ':maison')
 where cle ~ ':(stream|vod)$';
