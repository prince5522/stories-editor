
(function () {
  'use strict';

  const DB_NAME = 'channelStudioAppearanceDB';
  const STORE_NAME = 'wallpapers';
  const WALLPAPER_KEY = 'custom-wallpaper';
  const BRIGHTNESS_KEY = 'studio_wallpaper_brightness';

  const $ = id => document.getElementById(id);

  let currentObjectURL = null;
  let database = null;

  function status(message) {
    const element = $('wallpaperStatus');
    if (element) element.textContent = message;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('Image storage is not supported.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = function () {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = function () {
        database = request.result;
        resolve(database);
      };

      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function saveImage(blob) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAME,
        'readwrite'
      );

      transaction.objectStore(STORE_NAME).put(
        blob,
        WALLPAPER_KEY
      );

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function readImage() {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAME,
        'readonly'
      );

      const request = transaction.objectStore(STORE_NAME).get(
        WALLPAPER_KEY
      );

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  function deleteImage() {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(
        STORE_NAME,
        'readwrite'
      );

      transaction.objectStore(STORE_NAME).delete(WALLPAPER_KEY);

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function brightness() {
    let value = 85;

    try {
      const saved = Number(localStorage.getItem(BRIGHTNESS_KEY));

      if (Number.isFinite(saved) && saved >= 20 && saved <= 100) {
        value = saved;
      }
    } catch (error) {}

    return value;
  }

  function releaseOldURL() {
    if (currentObjectURL) {
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = null;
    }
  }

  function applyWallpaper(blob) {
    releaseOldURL();

    if (!blob) {
      removeWallpaperFromPage();
      return;
    }

    currentObjectURL = URL.createObjectURL(blob);

    const imageURL = 'url("' + currentObjectURL + '")';
    const dim = 1 - (brightness() / 100);

    const background = [
      'linear-gradient(rgba(0,0,0,' + dim.toFixed(2) + '), rgba(0,0,0,' + dim.toFixed(2) + '))',
      imageURL
    ].join(',');

    const targets = [
      document.body,
      document.querySelector('.welcome-page')
    ].filter(Boolean);

    targets.forEach(function (element) {
      element.style.backgroundImage = background;
      element.style.backgroundSize = 'cover';
      element.style.backgroundPosition = 'center';
      element.style.backgroundAttachment = 'fixed';
      element.style.backgroundRepeat = 'no-repeat';
    });

    const preview = $('wallpaperPreview');

    if (preview) {
      preview.style.backgroundImage = imageURL;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
    }

    const previewText = $('wallpaperPreviewText');

    if (previewText) {
      previewText.textContent = 'Your custom wallpaper is active';
    }
  }

  function removeWallpaperFromPage() {
    releaseOldURL();

    const targets = [
      document.body,
      document.querySelector('.welcome-page')
    ].filter(Boolean);

    targets.forEach(function (element) {
      element.style.removeProperty('background-image');
      element.style.removeProperty('background-size');
      element.style.removeProperty('background-position');
      element.style.removeProperty('background-attachment');
      element.style.removeProperty('background-repeat');
    });

    const preview = $('wallpaperPreview');

    if (preview) {
      preview.style.backgroundImage = '';
    }

    const previewText = $('wallpaperPreviewText');

    if (previewText) {
      previewText.textContent = 'Your wallpaper preview';
    }
  }

  function updateBrightness(value) {
    const amount = Number(value);

    try {
      localStorage.setItem(BRIGHTNESS_KEY, String(amount));
    } catch (error) {}

    const output = $('wallpaperBrightnessValue');

    if (output) {
      output.textContent = amount + '%';
    }

    readImage().then(function (blob) {
      if (blob) applyWallpaper(blob);
    }).catch(function () {});
  }

  async function handleFile(file) {
    if (!file) return;

    if (!file.type || !file.type.startsWith('image/')) {
      status('Please choose an image file.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      status('Image is too large. Please choose an image under 8 MB.');
      return;
    }

    try {
      status('Saving your wallpaper…');

      await saveImage(file);
      applyWallpaper(file);

      status('Wallpaper saved and applied successfully.');
    } catch (error) {
      console.error('Wallpaper save error:', error);
      status('Could not save wallpaper. Please try another image.');
    }
  }

  async function restoreWallpaper() {
    try {
      const blob = await readImage();

      if (blob) {
        applyWallpaper(blob);
        status('Your saved wallpaper is active.');
      } else {
        removeWallpaperFromPage();
        status('Using the selected theme background.');
      }
    } catch (error) {
      status('Wallpaper storage could not be opened.');
    }
  }

  async function removeCustomWallpaper() {
    try {
      await deleteImage();
      removeWallpaperFromPage();
      status('Custom wallpaper removed. Your theme background is restored.');
    } catch (error) {
      status('Could not remove wallpaper. Please try again.');
    }
  }

  async function initialize() {
    const fileInput = $('wallpaperFile');
    const brightnessInput = $('wallpaperBrightness');
    const removeButton = $('removeWallpaper');

    if (!fileInput || !brightnessInput || !removeButton) return;

    const savedBrightness = brightness();

    brightnessInput.value = savedBrightness;

    const output = $('wallpaperBrightnessValue');

    if (output) {
      output.textContent = savedBrightness + '%';
    }

    fileInput.addEventListener('change', function () {
      const file = fileInput.files && fileInput.files[0];

      handleFile(file);

      /* Allow choosing the same image again later. */
      fileInput.value = '';
    });

    brightnessInput.addEventListener('input', function () {
      updateBrightness(brightnessInput.value);
    });

    removeButton.addEventListener('click', removeCustomWallpaper);

    try {
      await openDatabase();
      await restoreWallpaper();
    } catch (error) {
      console.error('Wallpaper initialization error:', error);
      status('Wallpaper storage is unavailable in this browser.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
