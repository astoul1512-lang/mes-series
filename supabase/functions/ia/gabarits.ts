// Relais IA — LES GABARITS, ET LA VALIDATION DE CE QUI REVIENT (SPEC-04 §4.1).
//
// Deux responsabilités, et elles sont les deux moitiés d'une même règle : rien
// de ce qui part n'est écrit par le client, rien de ce qui revient n'est cru
// sur parole.
//
//   1. CONSTRUIRE LE PROMPT côté serveur, à partir de `{tache, params}`. Le
//      gabarit borne ce qui part : il ne lit que les champs qu'il connaît, il
//      coupe les listes, il n'emporte JAMAIS d'identité (§4.1 : titres, genres,
//      notes, signaux agrégés — jamais d'email, de pseudo, d'identifiant, ni
//      l'historique brut).
//   2. VALIDER LA RÉPONSE : schéma, types, longueurs, et la règle §0.4. Une
//      réponse invalide n'est pas réessayée — elle devient un mode dégradé
//      silencieux. Réessayer serait payer deux fois pour la même erreur.

import { TACHES } from "./config.ts";

// ---------------------------------------------------------------------------
// §0.4 — LA RÈGLE QUI NE SE NÉGOCIE PAS
//
// « Le pitch est factuel, jamais émotif par procuration. » Interdit d'affirmer
// ce que quelqu'un a ressenti : « que tu as adoré », « ton coup de cœur »,
// « ton préféré ». Autorisé : ce que le titre EST, et une référence prudente à
// un titre liké (« dans la veine de Dark »).
//
// LA RÈGLE EST ÉCRITE DEUX FOIS, EXPRÈS. Une fois dans le gabarit, en français,
// pour que le modèle la respecte ; une fois en contrôle de sortie, parce qu'un
// modèle qui promet n'est pas un modèle qui tient. Le §6 exige les deux — « le
// gabarit serveur l'interdit explicitement + test sur le gabarit » — et le
// contrôle de sortie est la seule des deux qui soit une garantie.
// ---------------------------------------------------------------------------
export const INTERDIT_EMOTION =
  /\bador\w*|\bcoup de c(?:œ|oe)ur\b|\bpr(?:é|e)f(?:é|e)r\w*|\btu as ador\w*/i;

export const CONSIGNE_COMMUNE = [
  "Tu écris pour une application française de suivi de séries et de films.",
  "RÈGLE ABSOLUE : n'affirme JAMAIS ce que la personne a ressenti.",
  "Sont INTERDITS : « que tu as adoré », « ton coup de cœur », « ton préféré »,",
  "et toute affirmation sur l'intensité d'un avis.",
  "Est AUTORISÉ : dire ce que le titre EST (le genre, la forme, la durée, le",
  "ton), et une référence prudente à un titre déjà aimé (« dans la veine de X »).",
  "Écris en français, au présent, sans emphase et sans point d'exclamation.",
  "Ne pose aucune question. N'invente aucun fait sur le titre.",
].join("\n");

// ---------------------------------------------------------------------------
// Ce que le client a le droit de faire voyager, et rien d'autre.
//
// On ne prend pas `params` tel quel : on en EXTRAIT les champs connus, un par
// un, en les bornant. Un client compromis — ou une version future distraite —
// ne peut donc pas glisser un identifiant dans le prompt : le champ n'aurait
// pas de case où atterrir.
// ---------------------------------------------------------------------------
function texte(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Les sauts de ligne partent : un titre sur trois lignes est une tentative
  // d'écrire dans le gabarit, pas un titre.
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}
function liste(v: unknown, maxTitres: number, maxLong = 80): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => texte(x, maxLong)).filter(Boolean).slice(0, maxTitres);
}
function nombre(v: unknown): string {
  return typeof v === "number" && isFinite(v) ? String(Math.round(v * 10) / 10) : "";
}

export type Gabarit = { consigne: string; schema: Record<string, unknown> };

// Le schéma de sortie, commun aux tâches qui rendent une phrase. Il est envoyé
// AU FOURNISSEUR (sortie structurée) et rejoué à la réception : les deux, parce
// qu'un fournisseur qui ignore le schéma ne le dit pas.
const SCHEMA_TEXTE = {
  type: "object",
  properties: { texte: { type: "string" } },
  required: ["texte"],
};
const SCHEMA_LISTE = {
  type: "object",
  properties: { textes: { type: "array", items: { type: "string" } } },
  required: ["textes"],
};

export function construire(tache: string, params: unknown): Gabarit | null {
  const t = TACHES[tache];
  if (!t) return null;
  const p = (params && typeof params === "object" && !Array.isArray(params))
    ? params as Record<string, unknown>
    : {};

  const titre = texte(p.titre, 120);
  const genres = liste(p.genres, 5, 40).join(", ");
  const note = nombre(p.note);
  const aimes = liste(p.aimes, t.maxtitres);
  const forme = texte(p.forme, 60);            // « série · 9 épisodes de 45 min »

  if (tache === "pitch_jour" || tache === "pitch_humeur") {
    if (!titre) return null;                    // sans titre, il n'y a rien à dire
    const humeur = texte(p.humeur, 30);
    const lignes = [
      CONSIGNE_COMMUNE,
      "",
      "Écris UNE phrase de deux lignes au plus (220 caractères maximum) qui",
      "donne envie de regarder ce titre ce soir, en disant ce qu'il est.",
    ];
    if (tache === "pitch_humeur" && humeur) {
      lignes.push(
        "La personne a demandé une ambiance : « " + humeur + " ».",
        "Dis en quoi ce titre y répond, factuellement.",
      );
    }
    lignes.push(
      "",
      "TITRE : " + titre,
      genres ? "GENRES : " + genres : "",
      note ? "NOTE PUBLIQUE : " + note + "/10" : "",
      forme ? "FORME : " + forme : "",
      aimes.length
        ? "TITRES DÉJÀ AIMÉS PAR LA PERSONNE (tu peux en citer UN au plus, sous la " +
          "forme « dans la veine de X », et seulement si le rapprochement est juste) : " +
          aimes.join(", ")
        : "",
    );
    return { consigne: lignes.filter(Boolean).join("\n"), schema: SCHEMA_TEXTE };
  }

  if (tache === "profil_humeur") {
    const humeur = texte(p.humeur, 30);
    if (!humeur) return null;
    return {
      consigne: [
        CONSIGNE_COMMUNE,
        "",
        "L'ambiance demandée est « " + humeur + " ».",
        "En une phrase de 120 caractères au plus, dis quelle FORME de cette",
        "ambiance conviendrait à quelqu'un dont les goûts ressemblent à ceci.",
        "Décris la sélection, pas la personne.",
        "",
        aimes.length ? "TITRES AIMÉS : " + aimes.join(", ") : "TITRES AIMÉS : aucun",
        genres ? "GENRES LES PLUS AIMÉS : " + genres : "",
      ].filter(Boolean).join("\n"),
      schema: SCHEMA_TEXTE,
    };
  }

  if (tache === "intitules_rangees") {
    const base = liste(p.intitules, t.maxtitres, 60);
    if (!base.length) return null;
    return {
      consigne: [
        CONSIGNE_COMMUNE,
        "",
        "Voici des titres de rangées d'un écran de découverte. Réécris CHACUN",
        "en 60 caractères au plus, en gardant EXACTEMENT le même sens et la même",
        "source. Un titre de rangée doit dire d'où elle vient. Rends-en autant",
        "que tu en reçois, dans le même ordre.",
        "",
        base.map((x, i) => (i + 1) + ". " + x).join("\n"),
      ].join("\n"),
      schema: SCHEMA_LISTE,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// LA VALIDATION DE SORTIE
//
// Elle rend `null` dès que quelque chose cloche, et l'appelant traduit `null`
// en mode dégradé. Elle ne « répare » rien : un texte tronqué proprement serait
// un texte que personne n'a écrit, et le §4.1 laisse le choix entre tronquer et
// rejeter. On rejette — c'est la seule des deux options qui ne produise jamais
// une phrase coupée au milieu sous les yeux de quelqu'un.
// ---------------------------------------------------------------------------
export function valider(tache: string, brut: unknown): { texte?: string; textes?: string[] } | null {
  const t = TACHES[tache];
  if (!t || !brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;

  const propre = (s: unknown): string | null => {
    if (typeof s !== "string") return null;
    const v = s.replace(/\s+/g, " ").trim();
    if (!v) return null;
    if (v.length > t.maxlong) return null;
    if (INTERDIT_EMOTION.test(v)) return null;   // §0.4, contrôle de sortie
    return v;
  };

  if (tache === "intitules_rangees") {
    if (!Array.isArray(o.textes)) return null;
    const l: string[] = [];
    for (const x of o.textes) {
      const v = propre(x);
      if (v === null) return null;               // un seul mauvais et tout tombe
      l.push(v);
    }
    return l.length ? { textes: l } : null;
  }

  const v = propre(o.texte);
  return v === null ? null : { texte: v };
}
