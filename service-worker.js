
/* =========================================
   CHANNEL STUDIO v26
   COMPLETE OFFLINE CACHE
   Planner folders + fresh planner scripts
========================================= */

const CACHE = 'channel-studio-shell-v26';
const CACHE_PREFIX = 'channel-studio-shell-';
const FETCH_TIMEOUT = 6000;

const PAGES = [
  './',
  'index.html',
  'login.html',
  'home.html',
  'stories.html',
  'episodes.html',
  'ready-made.html',
  'planner.html',
  'publish.html',
  'hype.html',
  'media.html',
  'channels.html',
  'docs.html',
  'complaints.html',
  'reviews.html',
  'notifications.html',
  'backup.html',
  'settings.html',
  'accounts.html'
];

const STYLES = [
  'css/styles.css',
  'css/animations.css',
  'css/themes.css',
  'css/whatsapp-shell.css',
  'css/ready-made.css'
];

const SCRIPTS = [
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
  'js/auth.js',
  'js/whatsapp-shell.js',
  'js/wallpaper.js',
  'js/story-runway-alerts.js'
];

const OTHER_FILES = [
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

const CORE = [
  ...PAGES,
  ...STYLES,
  ...SCRIPTS,
  ...OTHER_FILES
];

async function fetchWithTimeout(url) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT
  );

  try {
    return await fetch(url, {
      cache: 'reload',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================
   INSTALL
========================================= */

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    /* Preserve files from previous versions */
    const oldCaches = (await caches.keys()).filter(name =>
      name.startsWith(CACHE_PREFIX) &&
      name !== CACHE
    );

    for (const oldName of oldCaches) {
      try {
        const oldCache = await caches.open(oldName);
        const requests = await oldCache.keys();

        for (const request of requests) {
          try {
            if (await cache.match(request)) continue;

            const response = await oldCache.match(request);

            if (response) {
              await cache.put(request, response);
            }
          } catch (error) {
            console.warn(
              '[Channel Studio] Migration item failed:',
              request.url,
              error
            );
          }
        }
      } catch (error) {
        console.warn(
          '[Channel Studio] Cache migration failed:',
          error
        );
      }
    }

    /* Refresh every core file independently */
    await Promise.all(CORE.map(async path => {
      const url = new URL(
        path,
        self.registration.scope
      );

      try {
        const response = await fetchWithTimeout(url.href);

        if (response && response.ok) {
          await cache.put(url.href, response);
        }
      } catch (error) {
        console.warn(
          '[Channel Studio] Keeping cached file:',
          path
        );
      }
    }));

    await self.skipWaiting();

    console.log('[Channel Studio] v26 installed');
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
        .filter(name =>
          name.startsWith(CACHE_PREFIX) &&
          name !== CACHE
        )
        .map(name => caches.delete(name))
    );

    await self.clients.claim();

    console.log('[Channel Studio] v26 activated');
  })());
});

/* =========================================
   MANUAL UPDATE SUPPORT
========================================= */

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* =========================================
   OFFLINE FALLBACK
========================================= */

async function offlineResponse(request) {
  const cache = await caches.open(CACHE);

  if (request.mode === 'navigate') {
    const cachedPage = await cache.match(
      request,
      { ignoreSearch: true }
    );

    if (cachedPage) return cachedPage;

    const homePage = await cache.match('home.html');

    if (homePage) return homePage;

    const welcomePage = await cache.match('index.html');

    if (welcomePage) return welcomePage;

    return new Response(
      'Channel Studio is offline. Please open a page that has already been cached.',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        }
      }
    );
  }

  return new Response(
    'This resource is not available offline yet.',
    {
      status: 504,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    }
  );
}

/* =========================================
   FETCH HANDLER
========================================= */

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.headers.has('range')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    try {
      const cached = await cache.match(
        request,
        { ignoreSearch: true }
      );

      if (cached) return cached;

      const response = await fetch(request);

      if (response && response.ok) {
        await cache.put(
          request,
          response.clone()
        );
      }

      return response;

    } catch (error) {
      return offlineResponse(request);
    }
  })());
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
