/* Service worker — démarrage instantané et fonctionnement hors-ligne.
   Stratégie : network-first sur les fichiers de l'app (pour recevoir les mises à jour),
   repli sur le cache quand le réseau est absent. Les appels TMDB ne sont jamais mis en cache. */
const CACHE = 'mes-series-v86';

/* Au-delà de ce délai, on sert le cache sans attendre la réponse du réseau.
   Sans lui, un réseau qui PEND — portail captif d'hôtel qui ne répond ni oui
   ni non, 3G morte — laissait l'app sur un écran vide indéfiniment : `fetch`
   ne rejette pas, il attend. Le repli sur le cache n'arrivait donc jamais,
   alors que tout était là.

   4 secondes : au-dessus du temps de réponse normal de GitHub Pages, même sur
   un réseau mobile lent, et en dessous du seuil où l'on croit que l'app est
   cassée. Le fetch n'est pas annulé pour autant — il continue en arrière-plan
   et met le cache à jour s'il finit par répondre. */
const DELAI_RESEAU = 4000;

const SHELL = ['./', './index.html', './app.css', './manifest.json',
               './icon-192.png', './icon-512.png',
               /* Déclarée dans `manifest.json` mais absente d'ici : à la
                  première installation depuis un réseau coupé, Android n'avait
                  pas d'icône adaptative à découper. */
               './icon-512-maskable.png',
               './apple-touch-icon.png',
               './app-01-noyau.js',
               './app-02-outils.js',
               './app-03-vues.js',
               './app-04-decouvrir.js',
               './app-05-plateformes.js',
               './app-06-serie.js',
               './app-07-partage.js',
               './app-08-reglages.js',
               './app-09-notifications.js',
               './app-10-sorties.js',
               './app-11-gouts.js',
               './app-12-recherche.js',
               './app-13-inscription.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      /* Pas de .catch() ici : si un fichier manque, l'installation doit échouer
         pour que l'ancienne version, elle, reste utilisable hors-ligne. */
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Ressources de l'app : réseau d'abord, cache en secours
  if (url.origin === location.origin) {
    /* {cache:'reload'} : sans ça, ce fetch repassait par le cache HTTP du
       navigateur, et GitHub Pages y pose un max-age. Une nouvelle version
       pouvait mettre une dizaine de minutes à arriver, même en rechargeant. */
    const reseau = fetch(req, { cache: 'reload' })
      .then(res => {
        /* On ne met en cache qu'une vraie réponse : une page d'erreur 404 gardée
           en secours rendrait l'app inutilisable hors-ligne. */
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      });

    /* Le repli sur `index.html` ne vaut que pour une NAVIGATION. Servi à la
       place d'un fichier .js absent du cache, il rendait du HTML au navigateur,
       qui levait « Unexpected token '<' » — et comme app-08-reglages.js est
       chargé en dernier et porte l'appel `boot()`, l'app ne démarrait pas du
       tout : écran noir, sans message. Un fichier manquant doit échouer
       franchement, c'est diagnosticable.
       Revue de stabilité du 02/08, constat A5-5. */
    const secours = () => caches.match(req).then(m =>
      m || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));

    e.respondWith(new Promise(resolve => {
      let rendu = false;
      const servir = r => { if (!rendu) { rendu = true; resolve(r); } };

      /* Le réseau gagne s'il répond à temps ; s'il échoue, on sert le cache. */
      reseau.then(servir, () => { if (!rendu) servir(secours()); });

      /* Le délai ne sert le cache que si le cache A la ressource. Sinon on
         continue d'attendre le réseau : mieux vaut une attente qu'un échec
         certain. Le fetch, lui, n'est jamais annulé — il finira de remplir le
         cache pour la fois d'après. */
      setTimeout(() => {
        if (rendu) return;
        caches.match(req).then(m => { if (m) servir(m); }).catch(()=>{});
      }, DELAI_RESEAU);
    }));
    return;
  }

  // Tout le reste (API et images TMDB) passe directement par le réseau et le cache HTTP du navigateur.
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

/* ---------------------------------------------------------------------------
   Notifications

   iOS coupe l'abonnement d'une app qui reçoit un push sans rien afficher :
   tout passe donc par `waitUntil` et se termine toujours par une notification,
   même si le message reçu est illisible.

   L'affiche est transmise quand le serveur en envoie une. iOS l'ignore et
   remet l'icône du manifeste ; Android l'afficherait. On la joint quand même :
   ça ne coûte rien, et le jour où Apple l'acceptera, elle apparaîtra sans
   qu'on ait une ligne à changer.
--------------------------------------------------------------------------- */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
    const titre = d.titre || 'Mes séries';
    const opts = {
      body: d.corps || '',
      tag: d.tag || 'mes-series',
      /* Sans ça, deux notifications portant le même tag se remplacent en
         silence : on veut que la seconde se signale quand même. */
      renotify: true,
      data: { url: d.url || './' }
    };
    if (d.affiche) opts.icon = d.affiche;
    if (d.bandeau) opts.image = d.bandeau;
    await self.registration.showNotification(titre, opts);
  })());
});

/* Un appui ouvre l'app sur l'écran concerné, ou remet au premier plan
   l'onglet déjà ouvert plutôt que d'en empiler un deuxième. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const cible = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const dest = new URL(cible, self.location.href).href;
    const liste = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of liste) {
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
        if ('navigate' in c && c.url !== dest) { try { await c.navigate(dest); } catch (err) {} }
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(dest);
  })());
});
