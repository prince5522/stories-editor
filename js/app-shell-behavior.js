/* =====================================================
   CHANNEL STUDIO — APP SHELL BEHAVIOUR
   Android safe area + global wallpaper restoration
   + reliable Android notification click routing
   Preserves existing wallpaper data.
===================================================== */

(function () {
  'use strict';

  const DB_NAME = 'channelStudioAppearanceDB';
  const STORE_NAME = 'wallpapers';
  const WALLPAPER_KEY = 'custom-wallpaper';
  const BRIGHTNESS_KEY = 'studio_wallpaper_brightness';

  let notificationListenerRegistered = false;
  let notificationRegistrationPromise = null;
  let notificationRetryCount = 0;

  const MAX_NOTIFICATION_RETRIES = 20;
  const NOTIFICATION_RETRY_DELAY = 500;

  /* ---------- ANDROID SAFE AREA ---------- */

  function applyAndroidSafeArea() {
    if (
      !window.Capacitor?.isNativePlatform?.() ||
      window.Capacitor?.getPlatform?.() !== 'android'
    ) {
      return;
    }

    document.documentElement.classList.add(
      'native-android-shell'
    );

    if (
      !document.getElementById(
        'android-status-bar-background'
      )
    ) {
      const statusBackground =
        document.createElement('div');

      statusBackground.id =
        'android-status-bar-background';

      Object.assign(statusBackground.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        height: 'max(28px, env(safe-area-inset-top, 28px))',
        background: '#36594f',
        zIndex: '99999',
        pointerEvents: 'none'
      });

      document.body.appendChild(statusBackground);
    }

    if (
      document.getElementById('android-safe-area-fix')
    ) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'android-safe-area-fix';

    style.textContent = `
      html.native-android-shell body {
        padding-top: max(28px, env(safe-area-inset-top, 0px));
      }

      html.native-android-shell .topbar {
        top: max(28px, env(safe-area-inset-top, 0px));
      }
    `;

    document.head.appendChild(style);
  }

  /* ---------- NOTIFICATION DESTINATION ---------- */

  function getNotificationExtra(event) {
    const notification = event?.notification || {};

    return (
      notification.extra ||
      notification.data ||
      event?.extra ||
      {}
    );
  }

  function openPlannerFromNotification(event) {
    try {
      const extra = getNotificationExtra(event);

      const requestedPage = String(
        extra.page || 'planner.html'
      );

      const targetPage = requestedPage
        .split('?')[0]
        .split('#')[0];

      // Only allow this app's Planner page.
      if (targetPage !== 'planner.html') {
        window.location.assign('planner.html');
        return;
      }

      const targetURL = new URL(
        'planner.html',
        window.location.href
      );

      const slot = String(extra.slot || '');

      if (
        ['morning', 'lunch', 'evening'].includes(slot)
      ) {
        targetURL.searchParams.set('slot', slot);
      }

      const currentPage =
        window.location.pathname.split('/').pop();

      if (
        currentPage === 'planner.html' &&
        window.location.search === targetURL.search
      ) {
        window.dispatchEvent(
          new CustomEvent(
            'planner:notification-opened',
            {
              detail: { slot }
            }
          )
        );

        return;
      }

      window.location.assign(
        targetURL.pathname + targetURL.search
      );

    } catch (error) {
      console.warn(
        'Could not open Planner from notification:',
        error
      );

      window.location.assign('planner.html');
    }
  }

  /* ---------- ANDROID NOTIFICATION LISTENER ---------- */

  function isAndroidApp() {
    return (
      window.Capacitor?.isNativePlatform?.() === true &&
      window.Capacitor?.getPlatform?.() === 'android'
    );
  }

  function registerAndroidNotificationClicks() {
    if (
      !isAndroidApp() ||
      notificationListenerRegistered ||
      notificationRegistrationPromise
    ) {
      return;
    }

    const notifications =
      window.Capacitor?.Plugins?.LocalNotifications;

    if (!notifications?.addListener) {
      scheduleNotificationRetry();
      return;
    }

    try {
      notificationRegistrationPromise = Promise.resolve(
        notifications.addListener(
          'localNotificationActionPerformed',
          openPlannerFromNotification
        )
      );

      notificationRegistrationPromise
        .then(() => {
          notificationListenerRegistered = true;
          notificationRetryCount = 0;

          console.info(
            'Story Studio: Android notification clicks are ready.'
          );
        })
        .catch(error => {
          console.warn(
            'Android notification listener registration failed:',
            error
          );

          notificationRegistrationPromise = null;
          scheduleNotificationRetry();
        });

    } catch (error) {
      notificationRegistrationPromise = null;

      console.warn(
        'Could not register Android notification clicks:',
        error
      );

      scheduleNotificationRetry();
    }
  }

  function scheduleNotificationRetry() {
    if (
      !isAndroidApp() ||
      notificationListenerRegistered ||
      notificationRegistrationPromise ||
      notificationRetryCount >= MAX_NOTIFICATION_RETRIES
    ) {
      return;
    }

    notificationRetryCount++;

    window.setTimeout(() => {
      registerAndroidNotificationClicks();
    }, NOTIFICATION_RETRY_DELAY);
  }

  /* ---------- GLOBAL WALLPAPER ---------- */

  function applyGlobalWallpaper(blob) {
    if (!blob || !(blob instanceof Blob)) return;

    let layer = document.getElementById(
      'studioGlobalWallpaper'
    );

    if (!layer) {
      layer = document.createElement('div');

      layer.id = 'studioGlobalWallpaper';

      Object.assign(layer.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '-1',
        pointerEvents: 'none',
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat'
      });

      document.body.prepend(layer);
    }

    const oldUrl = layer.dataset.objectUrl;

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    const imageUrl = URL.createObjectURL(blob);

    layer.dataset.objectUrl = imageUrl;

    let brightness = 75;

    try {
      const savedBrightness = Number(
        localStorage.getItem(BRIGHTNESS_KEY)
      );

      if (
        Number.isFinite(savedBrightness) &&
        savedBrightness >= 20 &&
        savedBrightness <= 100
      ) {
        brightness = savedBrightness;
      }
    } catch (error) {
      // Continue with default brightness.
    }

    const darkness =
      ((100 - brightness) / 100) * 0.65;

    layer.style.backgroundImage =
      `linear-gradient(rgba(0,0,0,${darkness}), rgba(0,0,0,${darkness})), url("${imageUrl}")`;

    document.documentElement.style.backgroundColor =
      'transparent';

    document.body.style.backgroundColor =
      'transparent';
  }

  function loadGlobalWallpaper() {
    if (!window.indexedDB) return;

    let request;

    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      console.warn(
        'Wallpaper database could not open:',
        error
      );
      return;
    }

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = function () {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        return;
      }

      try {
        const transaction = db.transaction(
          STORE_NAME,
          'readonly'
        );

        const getRequest = transaction
          .objectStore(STORE_NAME)
          .get(WALLPAPER_KEY);

        getRequest.onsuccess = function () {
          applyGlobalWallpaper(getRequest.result);
        };

        getRequest.onerror = function () {
          console.warn(
            'Could not restore saved wallpaper.'
          );
        };

        transaction.oncomplete = function () {
          db.close();
        };

        transaction.onerror = function () {
          db.close();
        };

      } catch (error) {
        console.warn(
          'Wallpaper restoration failed:',
          error
        );

        db.close();
      }
    };

    request.onerror = function () {
      console.warn(
        'Wallpaper database could not be opened.'
      );
    };
  }

  /* ---------- STARTUP ---------- */

  function start() {
    applyAndroidSafeArea();
    registerAndroidNotificationClicks();
    loadGlobalWallpaper();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );
  } else {
    start();
  }

  // Capacitor may finish preparing its native plugins
  // after the page's first startup event.
  document.addEventListener(
    'deviceready',
    registerAndroidNotificationClicks
  );

  document.addEventListener(
    'visibilitychange',
    function () {
      if (!document.hidden) {
        registerAndroidNotificationClicks();
      }
    }
  );

  window.addEventListener(
    'focus',
    registerAndroidNotificationClicks
  );

})();