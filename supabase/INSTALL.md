# Monter « Mes Séries » sur un projet Supabase neuf

Ce dossier contient **tout** ce qui vit côté serveur. Un `git clone` suivi de
ces étapes doit donner une application qui fonctionne : créer un compte,
ajouter une série avec son affiche, synchroniser, partager sa bibliothèque et
recevoir une notification.

Si quelque chose manque ici, c'est un bug de ce fichier — pas une étape à
deviner.

---

## 1. Créer le projet

Sur supabase.com, créer un projet. Noter deux choses dans *Project Settings →
API* :

- la **référence du projet** (`abcdefghijklmnop`), qui forme l'URL
  `https://<PROJET>.supabase.co` ;
- la **clé publiable** (`sb_publishable_…`). Elle est destinée au navigateur :
  elle est déjà dans le code client, en clair, dans un dépôt public. C'est
  normal — c'est la RLS qui protège les données, pas cette clé.

**Ne jamais copier la clé `service_role` ailleurs que dans les secrets des Edge
Functions.** Elle contourne toute la RLS.

## 2. Les extensions

Dans *Database → Extensions*, activer :

| Extension | À quoi elle sert |
|---|---|
| `pgcrypto` | tirer le secret du planificateur (`gen_random_bytes`) |
| `pg_net` | appeler la fonction `notifier` depuis la base |
| `pg_cron` | déclencher ce même appel toutes les deux heures |

## 3. Les migrations

Dans *SQL Editor*, exécuter les fichiers de `migrations/` **dans l'ordre**.

| Fichier | Contenu |
|---|---|
| `001_partage.sql` | bibliothèque, profils, abonnements, codes de partage |
| `002_profils_avatar.sql` | couleur, emblème et photo du profil partagé |
| `003_push.sql` | appareils, cloches, réglages et historique des notifications |
| `004_dans_mon_cercle.sql` | **la règle de lecture des profils** — lire l'avertissement en tête |
| `005_cron_notifier.sql` | le secret du planificateur, la fonction SQL et la tâche |
| `006_photo_contrainte.sql` | la photo de profil doit être une image embarquée, et petite |
| `007_nouveau_code.sql` | générer un code côté serveur, et tuer le précédent |
| `008_notifications_films.sql` | les réglages de notification : `{cine, maison}`, et `quand` neutralisé |
| `009_recommandations.sql` | recommander un titre à quelqu'un de son cercle |
| `010_remise_en_phase.sql` | ce qui tournait en production sans exister dans le dépôt |
| `011_suivi_en_retour.sql` | « Suivre en retour », et la notification d'un nouvel abonné |
| `012_durcissements.sql` | verrou sur les codes de partage, droits alignés, purge, défaut corrigé |
| `013_push_endpoint.sql` | **SPEC-01 · C7** — un appareil sonne pour le compte connecté, et pour lui seul |
| `014_relais_ia.sql` | **SPEC-04 · lot B** — l'échelle des fournisseurs d'IA, les compteurs, les budgets et le journal |
| `015_semis_limites_ia.sql` | **RETOUR-01 · point 4** — des limites prudentes là où il n'y en avait aucune (le garde-fou anti-429 était désarmé) |
| `016_recos_centre.sql` | **SPEC-10** — le centre de notifications : recos reçues, retours et sorties |
| `017_deux_cles_gemini.sql` | **01/09/2026** — `cle_env`, et l'échelle passe à cinq étages sur deux comptes Google |
| `018_alerte_ia.sql` | **01/09/2026** — l'incident IA et sa bascule atomique : une seule notification par panne |

> **Les trois dernières lignes manquaient à ce tableau** avant le 01/09/2026 :
> `015` et `016` étaient passées en production sans y être inscrites. Une
> installation neuve montée sur ce fichier seul aurait donc eu un garde-fou
> anti-429 désarmé et pas de centre de notifications. C'est le même défaut que
> celui signalé pour `011` plus bas, et il se répare de la même façon : les
> fichiers sont rejouables, il n'y a rien à défaire avant de les jouer.

Avant d'exécuter `005`, y remplacer deux marques :

- `<PROJET>` → la référence du projet ;
- `<CLE_PUBLIABLE>` → la clé publiable.

Il n'y a **aucun autre secret à saisir**. Celui du planificateur est tiré par
la base elle-même et lu au même endroit par la fonction SQL et par l'Edge
Function : personne n'a besoin de le connaître.

> **`011` manquait à ce tableau.** Toute installation montée en suivant ce
> fichier avant le 09/08/2026 n'a donc PAS `suivre_en_retour()` : le bouton
> « Suivre » d'un abonné non réciproque répond `404`, en silence. Exécuter
> `011` puis `012` sur une base existante répare le manque — les deux fichiers
> sont rejouables, il n'y a rien à défaire avant. `013` se joue à la suite,
> même discipline.

Les treize fichiers sont **rejouables**. Les exécuter deux fois d'affilée ne doit
produire aucune erreur et ne changer aucune règle. Vérifié le 31/07/2026 sur un
Postgres vierge pour `001` à `010` : les dix passent dans l'ordre, trois fois de
suite, et la base obtenue porte exactement les mêmes vingt policies et les mêmes
droits de fonction que la production. `011` et `012` suivent la même discipline
(`create or replace`, `drop policy if exists`, `unschedule` avant `schedule`)
mais n'ont pas encore été éprouvés par ce même passage en triple. `013` aussi :
son `delete` est idempotent et sa fonction est en `create or replace`.

Après le premier passage, vérifier :

```sql
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' order by tablename, cmd;
```

`profils` doit avoir **exactement une** policy `SELECT`, et son expression doit
être `dans_mon_cercle(user_id)`. Si une seconde apparaît, quelque chose a
rejoué un vieux fichier : voir l'avertissement de `004`.

Et les droits d'exécution, que `010` met en phase avec la production :

```sql
select proname, proacl::text from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' order by 1;
```

`declencher_notifier` ne doit être exécutable que par `postgres` et
`service_role` — surtout pas par `anon`, qui est le rôle que porte la clé
publiable, en clair dans le dépôt.

## 4. Les secrets des fonctions

Dans *Edge Functions → Secrets* :

| Secret | Valeur |
|---|---|
| `TMDB_KEY` | une clé TMDB. Les deux formats marchent : clé v3 courte, ou jeton v4 (long, commençant par `eyJ`). |
| `VAPID_PRIVEE` | la clé privée VAPID des notifications push. |
| `GEMINI_API_KEY` | une clé Google AI Studio. Elle sert aux étages **1** et **3** de l'échelle IA (Flash et Flash-Lite du premier compte). |
| `GEMINI_API_KEY2` | une clé Google AI Studio d'un **autre projet ET d'un autre compte**. Elle sert aux étages **2** et **4** — les mêmes modèles, sur un second quota gratuit. Facultative : sans elle, ces deux étages sont sautés et l'échelle se comporte comme avant le 01/09/2026. |
| `OPENROUTER_API_KEY` | une clé OpenRouter, pour l'étage de secours. |
| `IA_ALERTE_UID` | l'identifiant du compte à prévenir quand l'IA tombe (voir §9). Facultatif : sans lui, l'alerte est simplement éteinte. |

**La condition qui rend `GEMINI_API_KEY2` utile, et il faut la vérifier avant de
la poser** : le quota gratuit de Gemini se compte **par projet Google Cloud**,
pas par clé. Deux clés du même projet partageraient le même compteur — la
bascule n'apporterait rien et ajouterait seulement un étage qui échoue. Deux
projets **et** deux comptes distincts : c'est la configuration d'Adrien,
confirmée le 01/09/2026.

Les clés d'IA ne sont pas obligatoires : sans elles, le relais `ia` rend
`{indisponible:true}` et l'app fonctionne exactement comme si l'IA était
éteinte. C'est le mode dégradé de SPEC-04 §4.5, et il est le socle, pas un
pis-aller.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement par
la plateforme : ne pas les créer.

La clé VAPID **publique** correspondante est écrite en dur à deux endroits, qui
doivent rester d'accord : `functions/notifier/index.ts` et `app-09` côté
client. En changer une seule casse les notifications sans message.

## 5. Les fonctions

Déployer les trois dossiers de `functions/`, **toutes avec `verify_jwt`
désactivé** :

```
supabase functions deploy tmdb             --no-verify-jwt
supabase functions deploy supprimer-compte --no-verify-jwt
supabase functions deploy notifier         --no-verify-jwt
supabase functions deploy ia               --no-verify-jwt
```

`verify_jwt` est désactivé volontairement, pour une raison différente à chaque
fois — et chacune est protégée autrement :

- **`tmdb`** est appelée par des gens qui n'ont pas encore de compte. Elle est
  protégée par **deux** listes blanches — les chemins et les origines — et
  retire `api_key` de ce qu'on lui passe.
- **`supprimer-compte`** doit répondre aux requêtes `OPTIONS` du navigateur,
  que `verify_jwt` rejetterait avant d'arriver au code. Elle vérifie le jeton
  elle-même et ne supprime que l'identité que le serveur d'authentification
  associe à ce jeton.
- **`notifier`** est appelée par le planificateur, qui n'a pas de session. Elle
  est protégée par le secret partagé de `005`.
- **`ia`** EXIGE pourtant un jeton, et ce n'est pas une contradiction : la
  plateforme rejetterait les requêtes `OPTIONS` du navigateur avant d'arriver au
  code, et un préflight CORS n'en porte jamais. La fonction vérifie donc le
  jeton elle-même — comme `supprimer-compte` — et refuse en `401` tout ce qui
  n'en a pas. Elle est en outre protégée par la liste blanche des origines, la
  liste blanche fermée des tâches, et deux plafonds de requêtes.

### 5 bis. L'adresse depuis laquelle l'app a le droit d'appeler `tmdb`

**À faire sur toute installation qui n'est pas `astoul1512-lang.github.io`.**

Le relais répondait à `Access-Control-Allow-Origin: *`, c'est-à-dire à
n'importe quel site du monde : un tiers pouvait s'en servir comme de sa propre
API TMDB, sur cette clé et sur ce quota d'invocations (500 000 par mois en
offre gratuite). Ce n'est pas une fuite de données, c'est une facture — et une
coupure pour les vrais utilisateurs le jour où le quota tombe.

La liste des adresses autorisées est en tête de
`functions/tmdb/relais.ts` :

```ts
export const ORIGINES: string[] = [
  "https://astoul1512-lang.github.io",
  "http://localhost:8099",
  "http://127.0.0.1:8099",
];
```

Y mettre l'adresse **exacte** du site (protocole + domaine, sans chemin :
`https://mon-site.fr`, pas `https://mon-site.fr/mes-series/`), puis
redéployer. Une adresse absente reçoit `403` et le navigateur ne lit rien.

Une requête **sans** en-tête `Origin` est acceptée — un client hors navigateur,
ou certains contextes de l'app installée — **sauf** si le navigateur annonce
lui-même qu'elle vient d'un autre site (`Sec-Fetch-Site: cross-site`). Cette
seconde condition n'est pas un détail : une balise `<img src=…>` ou
`<script src=…>` posée par une page tierce n'envoie **aucun** `Origin`, et
contrôler `Origin` seul aurait laissé passer exactement l'abus qu'on cherche à
fermer. Un client hors navigateur, lui, n'envoie pas `Sec-Fetch-Site` du tout et
reste servi.

Ce qui n'est **pas** couvert : un abus mené hors navigateur (script, serveur),
qui n'envoie ni l'un ni l'autre. Le seul remède serait un compteur par adresse
IP ; il n'est pas posé tant que l'abus n'est pas constaté, parce qu'il coûte une
table et un appel de plus à chaque requête. À décider si le quota se met à
descendre sans raison.

Les tests du relais tournent sans réseau et sans Supabase :

```
deno test --allow-env supabase/functions/tmdb/index.test.ts
deno test --allow-env supabase/functions/ia/index.test.ts
```

Ils couvrent les deux listes blanches — origine connue, origine inconnue,
absence d'`Origin`, préflight, `/tv/123` accepté, `/account` et
`/tv/123/../../account` refusés, `api_key` entrant ignoré. Le relais est la
seule barrière devant la clé TMDB : ne pas livrer une modification de ce
dossier sans les avoir joués.

Les 77 tests du relais `ia` couvrent le même genre de barrières : origine
inconnue, absence de jeton, jeton refusé, tâche hors liste blanche, budget
atteint, compteur plein, bascule sur `429`, tous les étages épuisés, réponse
malformée, réponse trop longue, et la règle §0.4 (aucun texte généré ne prête un
sentiment à qui que ce soit). Ils vérifient AUSSI ce qui serait envoyé aux
fournisseurs : aucun prompt venu du client, aucun identifiant, aucune adresse.

**SPEC-05 lot B (10/08/2026) — la liste blanche compte désormais SIX tâches.**
Aux trois de Découvrir (`pitch_jour`, `pitch_humeur`, `intitules_rangees`)
s'ajoutent les trois de la Recherche :

| tâche | déclencheur | rend | étage de départ |
|---|---|---|---|
| `envie_phrase` | validation d'une envie écrite dans la barre | une liste de critères | 1 |
| `ambiance_desc` | « ✦ Traduire en réglages » d'une ambiance | des critères + un nom + un emoji | 1 |
| `pourquoi_lui` | ouverture d'un aperçu depuis une recherche | deux lignes de texte | 2 |

Les deux premières ne rendent PAS de texte libre : elles rendent des
identifiants choisis dans un **vocabulaire fermé**, `CRITERES_PERMIS` en tête de
`functions/ia/gabarits.ts`. Le gabarit l'énumère au modèle et la validation le
recoupe à la réception ; un critère inventé est jeté sans que le reste tombe.
Ajouter une valeur à ce vocabulaire demande un redéploiement de la fonction —
c'est voulu, le vocabulaire d'un modèle n'est pas un réglage.

**`profil_humeur` a été RETIRÉE** au même moment (décision d'Adrien du 10/08) :
elle n'avait aucun appelant, et une liste blanche fermée qui garde une porte
inutilisée n'est plus fermée. Le pavé de `functions/ia/config.ts` dit pourquoi
en détail. Deux contrôles tiennent maintenant l'accord entre les tâches
DÉCLARÉES et les tâches APPELÉES — un cas d'`index.test.ts` qui fige la liste
des six, et le contrôle n° 15 de `tests/lance-tests.js` qui relit les
`appelIA('…')` du front. Ajouter une tâche « pour plus tard » fera tomber les
deux : c'est voulu.

Aucune migration SQL n'accompagne ce lot : `ia_journal.tache` est du texte
libre, les compteurs et les budgets sont les mêmes, et les trois tâches passent
par la même échelle de fournisseurs.

### Et les tests SQL — ceux-là, rien d'autre ne les remplace

```
psql "<url du projet>" -f supabase/tests/014_relais_ia.test.sql
```

Les tests Deno remplacent `fetch` par un menteur : ils savent dire qu'un appel
EST PARTI, jamais ce qu'il FAIT une fois arrivé. La première version du lot B
est passée verte sur ce point précis, avec une fonction `ia_saturer` qui n'avait
strictement aucun effet sur un fournisseur aux limites inconnues — c'est-à-dire
sur les deux étages qu'on appelle en premier, et c'était le seul filet prévu à
cet endroit.

`014_relais_ia.test.sql` exécute le vrai SQL sur un vrai moteur et éprouve les
comptes eux-mêmes : la saturation d'une fenêtre, le fait qu'elle n'en mure pas
une autre, l'arrêt exact au plafond, les deux remboursements (compteur de
fournisseur et budget), la cohérence entre la sentinelle et le plafond des
limites inconnues, et le ménage à soixante jours. Chaque cas lève une exception
nommée : `psql` s'arrête et dit lequel. **Le fichier tout entier est une transaction annulée** (`begin` … `rollback`) :
tout s'exécute pour de vrai, les assertions mordent pour de vrai, et rien n'est
jamais validé. C'est ce qui le rend sûr sur la base de production — et non une
discipline de nommage, qui avait d'ailleurs échoué : la première version
supprimait la ligne `@global`, c'est-à-dire le compteur du budget global du
jour, et déclenchait une purge du journal.

Il tourne aussi sur un PostgreSQL local vierge, ce qui évite de toucher au
projet en ligne :

```
createdb essai
psql -d essai -c 'create role anon; create role authenticated; create role service_role;'
psql -d essai -f supabase/migrations/014_relais_ia.sql
psql -d essai -f supabase/tests/014_relais_ia.test.sql
```

> **`service_role` fait partie de la recette, et ce n'est pas un détail.** La
> migration révoque tout de `public` ; sans grant explicite, la clé de service
> n'a plus aucun droit et le relais est **muet**. Sur Supabase les *default
> privileges* le sauvaient, mais c'était un hasard, pas une intention : depuis le
> 10/08 la migration pose le grant elle-même, et le fichier de tests exige les
> deux moitiés — `anon` ne peut pas, `service_role` peut encore. Sans le rôle, ce
> second cas est simplement sauté (avec un `NOTICE`).

> La logique vit dans `functions/tmdb/relais.ts` ; `functions/tmdb/index.ts`
> ne fait plus que la brancher sur `Deno.serve`. C'est ce qui permet aux tests
> d'éprouver la fonction sans ouvrir de port. La commande de déploiement ne
> change pas : les modules importés par l'entrée sont embarqués. `functions/ia`
> suit exactement le même découpage, en quatre fichiers : `index.ts` (l'entrée),
> `relais.ts` (la logique), `config.ts` (l'échelle et les budgets) et
> `gabarits.ts` (les prompts et la validation).

## 6. Vérifier

```sql
-- Le planificateur passe et la fonction répond.
select public.declencher_notifier();
select status_code, content from net._http_response order by id desc limit 1;
```

Attendu : `200` et un bilan JSON. Deux réponses à savoir lire :

- `401 {"erreur":"reserve au planificateur"}` → la fonction a été déployée mais
  `005` n'a pas été exécuté, ou l'a été après.
- `200` avec `"erreurs": ["tv:… → TMDB 401 …"]` sur chaque cloche → la clé TMDB
  est refusée. C'est le symptôme d'une clé v4 envoyée en paramètre d'URL ; les
  deux fonctions doivent faire le même test de format (voir le commentaire dans
  `notifier/index.ts`).

Puis, depuis l'app : créer un compte, ajouter une série, vérifier que l'affiche
s'affiche (c'est `tmdb` qui répond), générer un code de partage, et activer une
cloche sur une série depuis les réglages — puis vérifier en base qu'elle est
bien arrivée :

```sql
select user_id, type, tmdb_id from public.push_cloches;
```

C'est le chemin qui passe par `remplacer_cloches()` (migration `010`) : s'il
répond `404`, c'est que `010` n'a pas été exécuté.

> **Si tu rejoues `010`, rejoue `012` juste derrière.** `010` accorde
> `remplacer_cloches()` au rôle `anon` ; `012` le lui retire. Rejouer `010`
> seul remet donc la porte entrouverte, sans rien afficher. Le contrôle est
> écrit en pied de `012`.

> **Il n'y a pas de « notification d'essai ».** Une version précédente de ce
> fichier en promettait une depuis les réglages : elle n'existe nulle part côté
> client. La seule façon de provoquer un envoi à la demande est le
> `select public.declencher_notifier();` ci-dessus, et il n'envoie que ce qui
> sort réellement aujourd'hui.

## 7. Côté client

L'app lit l'URL du projet et la clé publiable dans `app-01` (`DEFAULT_SYNC`).
Les remplacer par celles du nouveau projet.

## 8. Les limites de l'IA — le chiffre qu'il faut aller chercher soi-même

**À faire une fois, après le déploiement de `ia`.** Tant que ce n'est pas fait,
le relais fonctionne, mais il découvre la saturation au lieu de l'éviter.

Le § 4.2 de SPEC-04 veut que le relais **n'appelle pas** un fournisseur dont le
compteur dit qu'il est plein. Pour cela il lui faut deux nombres par étage :
requêtes par minute, requêtes par jour.

**Google ne les publie plus.** Relevé le 10/08/2026 : la page officielle
*Gemini API — Rate limits* ne porte plus aucun tableau RPM / RPD / TPM, elle
renvoie au tableau de bord d'AI Studio et précise que les limites « are not
guaranteed ».

**Ce que la migration 015 a changé (RETOUR-01 point 4, 11/08/2026).** Les deux
étages Gemini partaient avec `limite_minute` et `limite_jour` à `NULL`, ce qui
veut dire *inconnue* et non *illimitée* — sauf que la réservation laisse alors
tout passer, et que le garde-fou anti-429 du § 4.2 était donc **désarmé en
production**. La migration 015 pose des limites prudentes, à la fois dans le
semis (base neuve) et par rattrapage sur les lignes déjà semées sans limite :

| étage | limite_minute | limite_jour |
|---|---|---|
| `gemini-flash` | 10 | 1000 |
| `gemini-flash-lite` | 15 | 1500 |

Ces chiffres ne prétendent pas être ceux de Google : ils sont **assez bas pour
protéger** et assez hauts pour ne gêner aucun usage réel. Le rattrapage est borné
par `where limite_minute is null` : un chiffre posé à la main n'est jamais défait.

**Ce que la migration 017 a ajouté (01/09/2026).** L'échelle passe à cinq
étages : les mêmes deux modèles Gemini apparaissent deux fois, sur deux comptes.
Les jumeaux `gemini-flash-2` et `gemini-flash-lite-2` portent **les mêmes
limites** que leur modèle — même palier gratuit, autre compte — et leur propre
compteur, parce que `ia_compteurs` est indexé par le **nom** du fournisseur.

| rang | étage | clé | limite_minute | limite_jour |
|---|---|---|---|---|
| 1 | `gemini-flash` | `GEMINI_API_KEY` | 10 | 1000 |
| 2 | `gemini-flash-2` | `GEMINI_API_KEY2` | 10 | 1000 |
| 3 | `gemini-flash-lite` | `GEMINI_API_KEY` | 15 | 1500 |
| 4 | `gemini-flash-lite-2` | `GEMINI_API_KEY2` | 15 | 1500 |
| 5 | `openrouter` | `OPENROUTER_API_KEY` | 20 | 50 |

L'ordre est une décision : on épuise un modèle **sur les deux comptes** avant de
descendre en qualité (RETOUR-01 point 4, « on ne descend que contraint »).

**Le seul chiffre qui dit si le second compte sert vraiment**, une fois quelques
requêtes passées :

```sql
select fournisseur, count(*), sum((ok)::int) as succes
  from public.ia_journal
 where jour = current_date group by fournisseur order by 1;
```

Un `gemini-flash-2` absent est normal tant que l'étage 1 tient la charge. Un
`gemini-flash-2` toujours en **statut 0** veut dire que le secret
`GEMINI_API_KEY2` n'est pas posé sur la fonction.

**Le taux d'escalade de la recherche ✦ (RETOUR-10 §1, 01/09/2026).** La tâche
`interpreter_recherche` démarre au petit modèle et ne remonte au fort que si la
réponse ne vaut rien. Deux chiffres disent si le pari tient — à relever une
semaine après la mise en service :

```sql
-- Durée médiane par étage, sur la seule tâche de la recherche ✦
select fournisseur,
       count(*)                                                  as appels,
       percentile_cont(0.5) within group (order by duree_ms)::int as median_ms
  from public.ia_journal
 where tache = 'interpreter_recherche' and ok
 group by fournisseur order by 1;

-- Taux d'escalade : part des requêtes qui ont dû remonter au modèle fort
select round(100.0 * count(*) filter (where fournisseur like 'gemini-flash'
                                         or fournisseur like 'gemini-flash-2')
             / nullif(count(*) filter (where fournisseur like 'gemini-flash-lite%'), 0), 1)
       as pct_escalade
  from public.ia_journal
 where tache = 'interpreter_recherche' and jour > current_date - 7;
```

**Le seuil qui déclenche un retour en arrière : ~40 %.** Au-delà, une requête
sur deux paie DEUX appels au lieu d'un, et le gain de médiane est mangé par les
escalades — il faut alors remettre la tâche à l'étage 1 (une ligne dans
`config.ts`, `etage_depart: 1`, et retirer `escalade_vers`).

Pour poser les vrais chiffres le jour où on les connaît :

1. Ouvrir <https://aistudio.google.com/rate-limit> avec le compte qui porte
   `GEMINI_API_KEY`, et relever les limites du **Free Tier** pour les deux
   modèles de l'échelle (colonnes « Requests per minute » et « Requests per
   day »).
2. Les poser en base, dans *SQL Editor* :

```sql
update public.ia_fournisseurs
   set limite_minute = 15,      -- remplacer par le vrai chiffre relevé
       limite_jour   = 1000,    -- idem
       maj = now()
 where nom = 'gemini-flash';

update public.ia_fournisseurs
   set limite_minute = 30,      -- idem
       limite_jour   = 1000,    -- idem
       maj = now()
 where nom = 'gemini-flash-lite';
```

Aucun redéploiement : la fonction relit la table, avec une minute de cache.
Reporter aussi les valeurs dans `FOURNISSEURS` (`config.ts`), qui sert de repli
quand la table est injoignable — sinon le repli réintroduit l'écart.

**Le contrôle qui dit que c'est fermé** — attendu : `0`.

```sql
select count(*) from public.ia_fournisseurs
 where actif and (limite_minute is null or limite_jour is null);
```

### Hors dépôt — les fonctions déployées qui n'y sont pas

Une fonction peut vivre sur le projet Supabase sans exister ici : le déploiement
se fait par la CLI, le dépôt ne le sait pas. **`ia-controle-temporaire` est dans
ce cas** — posée pendant le contrôle de bout en bout du 10/08/2026, jamais
commitée, et restée déployée ensuite. `grep controle-temporaire` sur tout l'arbre
rend zéro : rien ici ne pouvait le dire.

**Elle doit être supprimée** (RETOUR-01 point 4) : Supabase → **Edge Functions**
→ `ia-controle-temporaire` → **Delete**.

La règle qui en découle, et qui vaut pour la suite : *toute fonction déployée sur
le projet doit exister dans `supabase/functions/`.* Le contrôle, à la main :

```
supabase functions list
```

Tout nom qui n'a pas de dossier ici est soit à commiter, soit à supprimer. Un
relais qu'on ne peut pas relire est un relais qu'on ne peut pas garder.

### Avant de changer le modèle OpenRouter — lire son catalogue

Le premier modèle choisi ne déclarait pas `structured_outputs`, et l'étage 3
refusait donc **toutes** les requêtes en HTTP 400, silencieusement. Le catalogue
le disait d'avance ; il n'avait pas été lu. Avant de poser un modèle ici :

```
curl -s https://openrouter.ai/api/v1/models \
  | jq '.data[] | select(.id=="<le modèle>") | .supported_parameters'
```

`structured_outputs` doit y figurer. Un modèle qui ne l'a pas **ne dégrade pas,
il refuse** — et l'étage est mort sans un mot dans l'interface. Le changement se
fait en une ligne, sans redéploiement :

```sql
update public.ia_fournisseurs
   set modele = 'nvidia/nemotron-nano-9b-v2:free', maj = now()
 where nom = 'openrouter';
```

(À reporter aussi dans `config.ts`, qui sert de repli quand la table est
injoignable — sinon le repli réintroduit la panne.)

**OpenRouter, lui, publie ses chiffres** et ils sont déjà en base : 20 requêtes
par minute, 50 par jour tant que le compte n'a pas acheté 10 $ de crédits
cumulés — au-delà, 1 000 par jour, et le palier reste acquis même si le solde
retombe. Le compteur est au niveau du **compte**, pas du modèle. Si des crédits
sont achetés un jour :

```sql
update public.ia_fournisseurs set limite_jour = 1000, maj = now()
 where nom = 'openrouter';
```

### Régler les budgets sur l'usage réel

Au bout de quelques jours, le journal dit ce qui se consomme vraiment :

```sql
select jour, fournisseur, statut, count(*) as n, round(avg(duree_ms)) as ms
  from public.ia_journal
 group by jour, fournisseur, statut
 order by jour desc, fournisseur, statut;
```

Il ne contient ni prompt, ni réponse, ni identifiant de personne — un test fige
la liste exacte des cinq champs écrits, pour qu'on ne puisse pas en ajouter un
par distraction. `duree_ms` est la durée de l'ÉTAGE, pas de la requête : la
moyenne par fournisseur ci-dessus est donc lisible telle quelle (elle ne l'était
pas avant le 10/08 — elle cumulait les étages précédents). Les plafonds, eux, sont dans `functions/ia/config.ts`
(`BUDGET_UTILISATEUR_JOUR`, `BUDGET_GLOBAL_JOUR`) — les changer demande un
redéploiement de la fonction, contrairement à l'échelle.

### Le ménage

`ia_journal` et `ia_budget_jour` ne font que grossir, et la seconde porte des
identifiants. La migration installe `public.ia_menage()`, qui garde soixante
jours. À appeler de temps en temps, ou à greffer sur le planificateur de `005` :

```sql
select public.ia_menage();
```

## 9. L'alerte quand l'IA tombe — le seul signal qui reste

**À faire une fois, après le déploiement de `ia`.** Sans cette étape, l'alerte
est simplement éteinte : le relais fonctionne, mais personne n'est prévenu.

Le plafond par utilisateur a été **supprimé** le 01/09/2026 (décision d'Adrien —
le repli local existe partout, donc une panne de quota dégrade sans casser).
Conséquence à connaître : les quotas amont sont **partagés**, donc une boucle sur
un seul appareil peut faire tomber tous les comptes en dégradé. Plus rien ne le
signale — sauf ceci.

**Ce qui déclenche une notification :** l'échelle entièrement épuisée (personne
ne répond) ou le budget **global** du jour atteint. **Une seule par incident**,
à la bascule « ça marchait → ça ne marche plus » ; une nouvelle seulement si
l'IA repart puis retombe. Une réponse mal écrite par un fournisseur n'est PAS un
incident : il a répondu.

**Deux textes, parce qu'il y a deux pannes** — annoncer l'une pour l'autre serait
faux une fois sur deux, et une alerte fausse ne se croit plus :

> ⚠️ Quota IA atteint
> Plus de requêtes jusqu'à demain — l'app continue sans l'IA.

> ⚠️ IA injoignable
> Aucun fournisseur ne répond — l'app continue sans l'IA.

### Les deux secrets à poser sur la fonction `ia`

1. **`VAPID_PRIVEE`** — la même valeur que sur `notifier`. C'est la clé qui
   signe les notifications ; sans elle, rien ne peut partir. Elle vit désormais
   sur deux fonctions : c'est le prix d'une alerte immédiate plutôt qu'au
   prochain passage du facteur (qui tourne toutes les deux heures).
2. **`IA_ALERTE_UID`** — l'identifiant du compte à prévenir. Dans le tableau de
   bord Supabase, *Authentication → Users*, chercher l'adresse voulue et copier
   la colonne **UID**. En SQL :

```sql
select id from auth.users where email = 'adrien.astoul@yahoo.fr';
```

Le compte doit avoir **au moins un appareil abonné** (`push_appareils`) — donc
avoir activé les notifications au moins une fois depuis l'app, sur le téléphone
qui doit sonner :

```sql
select count(*) from public.push_appareils
 where user_id = (select id from auth.users where email = 'adrien.astoul@yahoo.fr');
```

**Zéro ici veut dire que l'alerte ne partira jamais**, sans le moindre message.
C'est le point de défaillance silencieux de tout ce dispositif : à revérifier
après chaque changement de téléphone, et après une longue période sans
notifications (trois échecs d'affilée suppriment un abonnement — voir `notifier`).

### Vérifier que ça marche, sans attendre une vraie panne

```sql
-- 1. Simuler la bascule : doit rendre `true` la PREMIÈRE fois, `false` ensuite.
select public.ia_ouvrir_incident('injoignable');
select public.ia_ouvrir_incident('injoignable');   -- attendu : false

-- 2. Remettre à zéro
select public.ia_fermer_incident();

-- 3. L'état, et l'historique
select * from public.ia_incident;
```

`alertes` qui grimpe de plusieurs unités par jour veut dire que l'IA bat de
l'aile par intermittence : c'est alors `ia_journal` (statuts 429 et 599) qui dit
chez quel fournisseur.
