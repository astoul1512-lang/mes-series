/* Service worker — démarrage instantané et fonctionnement hors-ligne.
   Stratégie : network-first sur les fichiers de l'app (pour recevoir les mises à jour),
   repli sur le cache quand le réseau est absent. Les appels TMDB ne sont jamais mis en cache. */
const CACHE = 'mes-series-v21';
const SHELL = ['./', './index.html', './app.css', './manifest.json',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png',
               './app-01-noyau.js',
               './app-02-outils.js',
               './app-03-vues.js',
               './app-04-decouvrir.js',
               './app-05-plateformes.js',
               './app-06-serie.js',
               './app-07-partage.js',
               './app-08-reglages.js'];

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
    e.respondWith(
      fetch(req)
        .then(res => {
          /* On ne met en cache qu'une vraie réponse : une page d'erreur 404 gardée
             en secours rendrait l'app inutilisable hors-ligne. */
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // Tout le reste (API et images TMDB) passe directement par le réseau et le cache HTTP du navigateur.
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
