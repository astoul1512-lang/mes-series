// Relais IA pour « Mes Séries » — le point d'entrée, et rien d'autre.
//
// Toute la logique est dans `relais.ts`, la configuration dans `config.ts`, les
// gabarits et la validation dans `gabarits.ts`. Ce fichier ne fait que brancher
// le serveur, pour qu'`index.test.ts` puisse éprouver la fonction sans ouvrir
// de port — exactement le découpage du relais TMDB, et pour la même raison.
//
// Déploiement :  supabase functions deploy ia --no-verify-jwt
//
// `--no-verify-jwt` alors que la fonction EXIGE un jeton : ce n'est pas une
// contradiction. La plateforme rejetterait les requêtes `OPTIONS` du navigateur
// avant d'arriver au code, et le préflight CORS n'en porte jamais. La fonction
// vérifie donc le jeton elle-même, comme `supprimer-compte`, et refuse en 401
// tout ce qui n'en a pas.

import { servir } from "./relais.ts";

Deno.serve(servir);
