// Relais TMDB pour « Mes Séries » — le point d'entrée, et rien d'autre.
//
// Toute la logique est dans `relais.ts` : la liste blanche des chemins, la
// liste blanche des origines (S1, 09/08) et l'appel à TMDB. Ce fichier ne fait
// que la brancher sur le serveur, pour qu'`index.test.ts` puisse éprouver la
// fonction sans ouvrir de port.
//
// Déploiement inchangé :  supabase functions deploy tmdb
// (les modules importés par l'entrée sont embarqués dans le paquet).

import { servir } from "./relais.ts";

Deno.serve(servir);
