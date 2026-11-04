
/* =========================================
   CHANNEL STUDIO v18
   Planner queue updates + reliable cache refresh
========================================= */

const CACHE = 'channel-studio-shell-v18';

const CORE = [
  './',
  'index.html',
  'home.html',
  'stories.html',
  'docs.html',
  'episodes.html',
  'ready-made.html',
  'planner.html',
  'publish.html',
  'hype.html',
  'media.html',
  'channels.html',
  'complaints.html',
  'reviews.html',
  'notifications.html',
  'backup.html',
  'settings.html',
  'manifest.webmanifest',

  'css/styles.css',
  'css/animations.css',
  'css/themes.css',
  'css/whatsapp-shell.css',
  'css/ready-made.css',

  'js/app-shell-behavior.js',
  'js/storage.js',
  'js/themes.js',
  'js/transitions.js',
  'js/effects.js',
  'js/notifications.js',
  'js/feedback.js',
  'js/app.js',
  'js/story-engine.js',
  'js/story-split-post.js',
  'js/documents.js',
  'js/creator-lab.js',
  'js/media.js',
  'js/media-attach.js',
  'js/planner-media.js',
  'js/planner-story-slots.js',
  'js/planner-publish.js',
  'js/planner-progress.js',
  'js/planner-stage3.js',
  'js/planner-stage4.js',
  'js/ready-made.js',
  'js/supabase-cloud.js',
  'js/whatsapp-shell.js',

  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

/* =========================================
   INSTALL
========================================= */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    await Promise.all(
      CORE.map(async path => {
        try {
          const request = new Request(path, {
            cache: 'reload'
          });

          const response = await fetch(request);

          if (response.ok) {
            await cache.put(request, response);
          } else {
            console.warn(
              '[Channel Studio] Precache failed:',
              path,
              response.status
            );
          }
        } catch (error) {
          console.warn(
            '[Channel Studio] Could not precache:',
            path,
            error
          );
        }
      })
    );

    await self.skipWaiting();
  })());
});

/* =========================================
   ACTIVATE
========================================= */

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key =>
          key.startsWith('channel-studio-shell-') &&
          key !== CACHE
        )
        .map(key => caches.delete(key))
    );

    await self.clients.claim();

    console.log('[Channel Studio] v18 activated');
  })());
});

/* =========================================
   MANUAL UPDATE MESSAGE
========================================= */

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* =========================================
   REQUEST HELPERS
========================================= */

function isAppCodeOrPage(request) {
  const destination = request.destination;
  const url = new URL(request.url);
  const path = url.pathname.toLowerCase();

  return (
    destination === 'document' ||
    destination === 'script' ||
    destination === 'style' ||
    destination === 'worker' ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.webmanifest')
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request, {
      cache: 'no-cache'
    });

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request, {
      ignoreSearch: true
    });

    if (cached) return cached;

    if (request.mode === 'navigate') {
      const fallback =
        await cache.match('index.html') ||
        await cache.match('./');

      if (fallback) return fallback;
    }

    return new Response(
      'You are offline. This item is not available yet.',
      {
        status: 503,
        statusText: 'Offline',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);

  const cached = await cache.match(request, {
    ignoreSearch: true
  });

  if (cached) return cached;

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    return new Response('Offline resource unavailable.', {
      status: 503,
      statusText: 'Offline'
    });
  }
}

/* =========================================
   FETCH
========================================= */

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (isAppCodeOrPage(request)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

/* =========================================
   NOTIFICATION CLICK
========================================= */

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const target =
    event.notification.data &&
    event.notification.data.url ||
    'planner.html';

  event.waitUntil((async () => {
    const targetURL = new URL(
      target,
      self.registration.scope
    );

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();

        if ('navigate' in client) {
          await client.navigate(targetURL.href);
        }

        return;
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetURL.href);
    }
  })());
});
