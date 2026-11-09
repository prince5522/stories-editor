
/* =====================================================
   CHANNEL STUDIO — APP SHELL BEHAVIOUR
   Android safe area + global wallpaper restoration
   Preserves the existing wallpaper database.
===================================================== */

(function () {
  'use strict';

  const DB_NAME = 'channelStudioAppearanceDB';
  const STORE_NAME = 'wallpapers';
  const WALLPAPER_KEY = 'custom-wallpaper';
  const BRIGHTNESS_KEY = 'studio_wallpaper_brightness';

  function applyAndroidSafeArea() {
    if (
      !window.Capacitor?.isNativePlatform?.() ||
      window.Capacitor?.getPlatform?.() !== 'android'
    ) {
      return;
    }

    document.documentElement.classList.add('native-android-shell');

    // Solid background behind Android's status bar.
    if (!document.getElementById('android-status-bar-background')) {
      const statusBackground = document.createElement('div');

      statusBackground.id = 'android-status-bar-background';

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

    if (document.getElementById('android-safe-area-fix')) {
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

  // Restore the global wallpaper without changing its saved data.
  function applyGlobalWallpaper(blob) {
    if (!blob || !(blob instanceof Blob)) return;

    let layer = document.getElementById('studioGlobalWallpaper');

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
      // Continue with the default brightness.
    }

    const darkness = (100 - brightness) / 100 * 0.65;

    layer.style.backgroundImage =
      `linear-gradient(rgba(0,0,0,${darkness}), rgba(0,0,0,${darkness})), url("${imageUrl}")`;

    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
  }

  function loadGlobalWallpaper() {
    if (!window.indexedDB) return;

    let request;

    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      console.warn('Wallpaper database could not open:', error);
      return;
    }

    // IMPORTANT:
    // Create the wallpaper object store when the database
    // is first created. Do not remove or overwrite existing data.
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
          console.warn('Could not restore saved wallpaper.');
        };

        transaction.oncomplete = function () {
          db.close();
        };

        transaction.onerror = function () {
          db.close();
        };

      } catch (error) {
        console.warn('Wallpaper restoration failed:', error);
        db.close();
      }
    };

    request.onerror = function () {
      console.warn('Wallpaper database could not be opened.');
    };
  }

  function start() {
    applyAndroidSafeArea();
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

})();
