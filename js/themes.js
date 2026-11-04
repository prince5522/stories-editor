
(function () {
  'use strict';

  const DEFAULTS = {
    theme: 'system',
    font: 'modern',
    motion: 'full'
  };

  const THEMES = [
    'system',
    'light',
    'dark',
    'ocean',
    'sunset',
    'forest',
    'midnight',
    'rose',
    'arctic',
    'neon',
    'amoled'
  ];

  const FONTS = [
    'modern',
    'rounded',
    'handwriting',
    'serif',
    'montserrat',
    'outfit',
    'gothic',
    'mono'
  ];

  const MOTIONS = ['full', 'reduced'];

  const THEME_LABELS = {
    system: 'System Default',
    light: 'Light',
    dark: 'Dark',
    ocean: 'Ocean Blue',
    sunset: 'Sunset',
    forest: 'Forest Green',
    midnight: 'Midnight',
    rose: 'Rose',
    arctic: 'Arctic',
    neon: 'Neon',
    amoled: 'AMOLED Black'
  };

  const FONT_LABELS = {
    modern: 'Modern',
    rounded: 'Rounded',
    handwriting: 'Handwriting',
    serif: 'Classic Serif',
    montserrat: 'Montserrat Style',
    outfit: 'Outfit Style',
    gothic: 'Gothic / Blackletter',
    mono: 'Monospace'
  };

  function getSetting(key) {
    try {
      const store = window.StudioStore;

      if (store && typeof store.get === 'function') {
        const value = store.get(key, DEFAULTS[key]);

        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
    } catch (error) {}

    try {
      const value = localStorage.getItem('studio_' + key);
      if (value !== null) return value;
    } catch (error) {}

    return DEFAULTS[key];
  }

  function setSetting(key, value) {
    try {
      if (
        window.StudioStore &&
        typeof window.StudioStore.set === 'function'
      ) {
        window.StudioStore.set(key, value);
        return;
      }
    } catch (error) {}

    try {
      localStorage.setItem('studio_' + key, value);
    } catch (error) {}
  }

  function normalize(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  function addMissingOptions(select, values, labels) {
    if (!select) return;

    values.forEach(function (value) {
      const exists = Array.from(select.options).some(function (option) {
        return option.value === value;
      });

      if (!exists) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labels[value] || value;
        select.appendChild(option);
      }
    });
  }

  function apply() {
    const savedTheme = normalize(
      getSetting('theme'),
      THEMES,
      'system'
    );

    const font = normalize(
      getSetting('font'),
      FONTS,
      'modern'
    );

    let motion = getSetting('motion');

    if (motion === 'off' || motion === 'reduced') {
      motion = 'reduced';
    } else {
      motion = 'full';
    }

    const systemDark = Boolean(
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );

    const actualTheme = savedTheme === 'system'
      ? (systemDark ? 'dark' : 'light')
      : savedTheme;

    document.documentElement.dataset.theme = actualTheme;

    if (document.body) {
      document.body.dataset.theme = actualTheme;
      document.body.dataset.font = font;
      document.body.dataset.motion = motion;
    }

    const themeSelect = document.getElementById('themeSelect');
    addMissingOptions(themeSelect, THEMES, THEME_LABELS);

    if (themeSelect) {
      themeSelect.value = savedTheme;
    }

    const fontSelect = document.getElementById('fontSelect');
    addMissingOptions(fontSelect, FONTS, FONT_LABELS);

    if (fontSelect) {
      fontSelect.value = font;
    }

    const motionSelect = document.getElementById('motionSelect');

    if (motionSelect) {
      motionSelect.value = motion;
    }

    const darkThemes = [
      'dark',
      'forest',
      'midnight',
      'neon',
      'amoled'
    ];

    document.documentElement.style.colorScheme =
      darkThemes.includes(actualTheme) ? 'dark' : 'light';
  }

  window.applyStudioTheme = apply;

  window.saveStudioAppearance = function (theme, font, motion) {
    setSetting(
      'theme',
      normalize(theme, THEMES, 'system')
    );

    setSetting(
      'font',
      normalize(font, FONTS, 'modern')
    );

    setSetting(
      'motion',
      normalize(motion, MOTIONS, 'full')
    );

    apply();
  };

  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('storage', apply);

  if (window.matchMedia) {
    const preference = window.matchMedia(
      '(prefers-color-scheme: dark)'
    );

    const handlePreferenceChange = function () {
      if (getSetting('theme') === 'system') {
        apply();
      }
    };

    if (preference.addEventListener) {
      preference.addEventListener('change', handlePreferenceChange);
    } else if (preference.addListener) {
      preference.addListener(handlePreferenceChange);
    }
  }

  if (document.readyState !== 'loading') {
    apply();
  }
})();
