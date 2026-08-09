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
| `011_suivi_en_retour.sql` | le suivi en retour d'un abonnement |
| `012_push_endpoint.sql` | **C7** — un appareil sonne pour le compte connecté, et pour lui seul. Rejouable. |

Avant d'exécuter `005`, y remplacer deux marques :

- `<PROJET>` → la référence du projet ;
- `<CLE_PUBLIABLE>` → la clé publiable.

Il n'y a **aucun autre secret à saisir**. Celui du planificateur est tiré par
la base elle-même et lu au même endroit par la fonction SQL et par l'Edge
Function : personne n'a besoin de le connaître.

Les dix fichiers sont **rejouables**. Les exécuter deux fois d'affilée ne doit
produire aucune erreur et ne changer aucune règle. Vérifié le 31/07/2026 sur un
Postgres vierge : les dix passent dans l'ordre, trois fois de suite, et la base
obtenue porte exactement les mêmes vingt policies et les mêmes droits de
fonction que la production.

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
```

`verify_jwt` est désactivé volontairement, pour une raison différente à chaque
fois — et chacune est protégée autrement :

- **`tmdb`** est appelée par des gens qui n'ont pas encore de compte. Elle est
  protégée par une liste blanche de chemins et retire `api_key` de ce qu'on lui
  passe.
- **`supprimer-compte`** doit répondre aux requêtes `OPTIONS` du navigateur,
  que `verify_jwt` rejetterait avant d'arriver au code. Elle vérifie le jeton
  elle-même et ne supprime que l'identité que le serveur d'authentification
  associe à ce jeton.
- **`notifier`** est appelée par le planificateur, qui n'a pas de session. Elle
  est protégée par le secret partagé de `005`.

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

> **Il n'y a pas de « notification d'essai ».** Une version précédente de ce
> fichier en promettait une depuis les réglages : elle n'existe nulle part côté
> client. La seule façon de provoquer un envoi à la demande est le
> `select public.declencher_notifier();` ci-dessus, et il n'envoie que ce qui
> sort réellement aujourd'hui.

## 7. Côté client

L'app lit l'URL du projet et la clé publiable dans `app-01` (`DEFAULT_SYNC`).
Les remplacer par celles du nouveau projet.
