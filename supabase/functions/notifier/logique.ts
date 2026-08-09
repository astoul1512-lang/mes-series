// ---------------------------------------------------------------------------
// notifier — la logique pure, celle qui se teste sans base, sans réseau et sans
// clé.
//
// B14/B15 (09/08) — CE FICHIER EXISTE POUR QUE LES TESTS SOIENT POSSIBLES.
// `index.ts` ouvre un serveur (`Deno.serve`), lit trois secrets d'environnement
// et construit un client Supabase DÈS SON CHARGEMENT : l'importer depuis un
// test démarrerait le facteur pour de bon. Les fonctions qui ne dépendent de
// rien vivent donc ici, et `index.ts` les importe.
//
// RÈGLE : on ne met ici que ce qui est pur — même entrée, même sortie, aucun
// effet. Tout ce qui parle à TMDB, à la base ou au push reste dans `index.ts`.
//
// Test : deno test supabase/functions/notifier/logique.test.ts
// ---------------------------------------------------------------------------

// `{cine, stream, vod}` → `{cine, maison}`. Le même pliage que
// `normaliserFilmsNotif` côté app : les deux doivent rester d'accord.
//
// I8 — il y avait TROIS genres côté client (« cinéma », « streaming », « VOD »)
// pour DEUX événements réels : `stream` valait le type 4, `vod` les types 4 et
// 5, et le type 5 (le disque) est écarté partout ailleurs dans l'app. Deux
// réglages qui se déclenchent sur la même donnée annoncent une finesse qui
// n'existe pas — et un film sorti en numérique pouvait produire deux
// notifications. Il en reste deux, qui recouvrent bien deux choses distinctes.
//
// L'ancienne forme est encore acceptée en lecture : un téléphone resté en
// arrière peut continuer d'écrire `{stream, vod}` dans `push_reglages` pendant
// quelques jours. Elle est repliée à l'entrée, pas propagée.
//
// S7 (SPEC-02) — QUAND POURRA-T-ON RETIRER CE REPLI, ET SUR QUELLE PREUVE.
// La migration 012 a tari DEUX des trois sources d'anciennes clés : le défaut
// de colonne de `push_reglages.films`, qui fabriquait une ligne périmée à
// chaque compte créé sans toucher aux réglages, et les lignes déjà nées de ce
// défaut. La troisième ne l'est pas : un téléphone qui tourne encore une
// version d'avant le 30/07 envoie `films` tel quel, et le service worker sert
// d'abord son cache — on ne décide pas d'ici du jour où le dernier appareil
// aura basculé. Retirer le repli trop tôt mettrait `maison = false` chez cette
// personne : plus aucune notification « à la maison », sans erreur, sans
// message, sans rien à voir dans les réglages.
// LA PREUVE À EXIGER avant de le retirer est le contrôle n°4 de 012 : plus
// aucune ligne de `push_reglages` ne porte `stream` ni `vod` après quelques
// jours de production. Il part alors EN MÊME TEMPS que `normaliserFilmsNotif`
// côté app (app-09) — les deux doivent rester d'accord.
export function genresVoulus(films: Record<string, boolean>): Record<string, boolean> {
  const f = films ?? {};
  return {
    cine:   f.cine === true,
    maison: f.maison === true || f.stream === true || f.vod === true
  };
}

// B14 — la découpe en paquets du balayage. Une liste vide rend une liste vide ;
// une taille absurde (0, négative, décimale) est ramenée à au moins 1, sans
// quoi la boucle appelante tournerait pour toujours.
export function parPaquets<T>(liste: T[], taille: number): T[][] {
  const n = Math.max(1, Math.floor(taille) || 1);
  const out: T[][] = [];
  const l = liste || [];
  for (let i = 0; i < l.length; i += n) out.push(l.slice(i, i + n));
  return out;
}

// B15 — combien d'épisodes de cette saison portent la même date de diffusion.
// C'est ce qui distingue « S2E8 est sorti » d'« une saison entière est
// disponible ». Rend toujours au moins 1 : l'épisode qu'on tient est sorti, la
// saison peut très bien ne pas avoir répondu.
export function memesEpisodesLeJour(saison: unknown, date: string): number {
  const l = (saison as any)?.episodes;
  if (!Array.isArray(l) || !date) return 1;
  const n = l.filter((e: any) => e && e.air_date === date).length;
  return n > 0 ? n : 1;
}

// B15 — le titre d'une annonce de série. Un seul endroit décide de la formule,
// et c'est celui qu'on teste.
export function titreSerie(nom: string, saison: number, episode: number, combien: number): string {
  return combien > 1
    ? `${nom} · ${combien} épisodes sont disponibles`
    : `${nom} · S${saison}E${episode} est sorti`;
}
