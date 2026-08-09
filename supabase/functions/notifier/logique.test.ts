// ---------------------------------------------------------------------------
// Les tests de la logique du facteur.
//
//     deno test supabase/functions/notifier/logique.test.ts
//
// Ils ne touchent ni la base, ni TMDB, ni le push : tout ce qui est testable
// ici l'est SANS clé et SANS réseau, et c'est exactement pour cette raison que
// `logique.ts` existe (voir son en-tête).
//
// Chaque cas porte la trace d'un défaut réel — aucun n'est là par principe.
// ---------------------------------------------------------------------------
// AUCUNE DÉPENDANCE, VOLONTAIREMENT. `jsr:@std/assert` obligerait à un accès
// réseau pour lancer les tests — dans un atelier hors ligne (ou derrière un
// filtre), la suite ne démarrerait tout simplement pas. La comparaison tient en
// six lignes ; on les écrit.
import { genresVoulus, parPaquets, memesEpisodesLeJour, titreSerie } from './logique.ts';

function assertEquals(recu: unknown, attendu: unknown, note = '') {
  const a = JSON.stringify(recu), b = JSON.stringify(attendu);
  if (a !== b) throw new Error(`${note ? note + ' — ' : ''}attendu ${b}, reçu ${a}`);
}

// --- genresVoulus (B14, B15) -------------------------------------------------
Deno.test('genresVoulus — la forme actuelle passe telle quelle', () => {
  assertEquals(genresVoulus({ cine: true, maison: false }), { cine: true, maison: false });
  assertEquals(genresVoulus({ cine: false, maison: true }), { cine: false, maison: true });
});

Deno.test('genresVoulus — I8 : l\'ancienne forme {stream, vod} se replie sur maison', () => {
  assertEquals(genresVoulus({ stream: true } as any), { cine: false, maison: true });
  assertEquals(genresVoulus({ vod: true } as any),    { cine: false, maison: true });
  // Les deux à la fois ne font toujours qu'un seul genre : c'est le sens du pliage.
  assertEquals(genresVoulus({ stream: true, vod: true } as any), { cine: false, maison: true });
});

Deno.test('genresVoulus — rien n\'est vrai par défaut (B15 : c\'est ce test qui évite les appels TMDB)', () => {
  assertEquals(genresVoulus({}), { cine: false, maison: false });
  assertEquals(genresVoulus(null as any), { cine: false, maison: false });
  // Une valeur qui n'est pas exactement `true` ne vaut pas oui.
  assertEquals(genresVoulus({ cine: 1 } as any), { cine: false, maison: false });
});

// --- parPaquets (B14) --------------------------------------------------------
Deno.test('parPaquets — la découpe couvre tout, sans doublon ni trou', () => {
  assertEquals(parPaquets([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(parPaquets([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  assertEquals(parPaquets([1], 5), [[1]]);
});

Deno.test('parPaquets — une liste vide ne fait aucun paquet', () => {
  assertEquals(parPaquets([], 4), []);
  assertEquals(parPaquets(null as any, 4), []);
});

Deno.test('parPaquets — une taille absurde ne fait pas tourner la boucle pour toujours', () => {
  assertEquals(parPaquets([1, 2, 3], 0), [[1], [2], [3]]);
  assertEquals(parPaquets([1, 2, 3], -4), [[1], [2], [3]]);
  assertEquals(parPaquets([1, 2, 3], 1.9), [[1], [2], [3]]);
});

Deno.test('parPaquets — 25 personnes passent toutes, par lots de 20 puis de 4', () => {
  // Le cas du plafond PostgREST, en miniature : c'est la découpe qui garantit
  // qu'aucune personne au-delà du premier lot n'est oubliée.
  const gens = Array.from({ length: 25 }, (_, i) => i + 1);
  const lots = parPaquets(gens, 20);
  assertEquals(lots.length, 2);
  assertEquals(lots[0].length, 20);
  assertEquals(lots[1].length, 5);
  assertEquals(lots.flat().length, 25);
  assertEquals(new Set(lots.flat()).size, 25);
  // Et à l'intérieur d'un lot, les paquets de traitement en parallèle.
  assertEquals(parPaquets(lots[0], 4).length, 5);
});

// --- memesEpisodesLeJour + titreSerie (B15) ---------------------------------
Deno.test('memesEpisodesLeJour — un drop de saison est compté', () => {
  const saison = { episodes: [
    { episode_number: 1, air_date: '2026-08-09' },
    { episode_number: 2, air_date: '2026-08-09' },
    { episode_number: 3, air_date: '2026-08-09' },
    { episode_number: 4, air_date: '2026-08-16' }
  ] };
  assertEquals(memesEpisodesLeJour(saison, '2026-08-09'), 3);
  assertEquals(memesEpisodesLeJour(saison, '2026-08-16'), 1);
});

Deno.test('memesEpisodesLeJour — une saison illisible rend 1, jamais 0', () => {
  assertEquals(memesEpisodesLeJour(null, '2026-08-09'), 1);
  assertEquals(memesEpisodesLeJour({}, '2026-08-09'), 1);
  assertEquals(memesEpisodesLeJour({ episodes: [] }, '2026-08-09'), 1);
  // Date inconnue de la saison : l'épisode qu'on tient est sorti quand même.
  assertEquals(memesEpisodesLeJour({ episodes: [{ air_date: '2020-01-01' }] }, '2026-08-09'), 1);
});

Deno.test('titreSerie — une seule notification, avec le compte', () => {
  assertEquals(titreSerie('Severance', 2, 8, 1), 'Severance · S2E8 est sorti');
  assertEquals(titreSerie('Severance', 2, 8, 8), 'Severance · 8 épisodes sont disponibles');
});
