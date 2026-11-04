
(function () {
  'use strict';

  /* ==========================================
     CHANNEL STUDIO — APPEARANCE CONTROLLER
     Themes, fonts, motion and saved preferences
     ========================================== */

  const DEFAULTS = {
    theme: 'system',
    font: 'modern',
    motion: 'full'
  };

  const THEMES = [
    'system', 'light', 'dark', 'ocean', 'sunset',
    'forest', 'midnight', 'rose', 'arctic', 'neon',
    'amoled'
  ];

  const FONTS = [
    'modern', 'rounded', 'handwriting', 'serif',
    'montserrat', 'outfit', 'gothic', 'mono'
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

  const FONT_STACKS = {
    modern: 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
    rounded: '"Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif',
    handwriting: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive',
    serif: 'Georgia, "Times New Roman", serif',
    montserrat: 'Montserrat, Arial, sans-serif',
    outfit: 'Outfit, "Trebuchet MS", sans-serif',
    gothic: '"Old English Text MT", "UnifrakturCook", "Lucida Blackletter", Georgia, serif',
    mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
  };

  const DARK_THEMES = [
    'dark', 'ocean', 'forest', 'midnight', 'neon', 'amoled'
  ];

  function normalize(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  /* ---------- STORAGE ---------- */

  function getSetting(key) {
    try {
      const store = window.StudioStore;

      if (store && typeof store.get === 'function') {
        const value = store.get(key, DEFAULTS[key]);

        if (value !== undefined && value !== null && value !== '') {
          return value;
        }
      }
    } catch (error) {
      console.warn('Appearance read error:', error);
    }

    try {
      const value = localStorage.getItem('studio_' + key);

      if (value !== null) return value;
    } catch (error) {}

    return DEFAULTS[key];
  }

  function setSetting(key, value) {
    let saved = false;

    try {
      const store = window.StudioStore;

      if (store && typeof store.set === 'function') {
        store.set(key, value);
        saved = true;
      }
    } catch (error) {
      console.warn('Appearance save error:', error);
    }

    if (!saved) {
      try {
        localStorage.setItem('studio_' + key, value);
      } catch (error) {
        console.warn('Local appearance save error:', error);
      }
    }
  }

  /* ---------- SELECT OPTIONS ---------- */

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

  function updateSelectors(theme, font, motion) {
    const themeSelect = document.getElementById('themeSelect');
    const fontSelect = document.getElementById('fontSelect');
    const motionSelect = document.getElementById('motionSelect');

    addMissingOptions(themeSelect, THEMES, THEME_LABELS);
    addMissingOptions(fontSelect, FONTS, FONT_LABELS);

    if (themeSelect) themeSelect.value = theme;
    if (fontSelect) fontSelect.value = font;
    if (motionSelect) motionSelect.value = motion;
  }

  /* ---------- APPLY FONT ---------- */

  function applyFont(font) {
    const stack = FONT_STACKS[font] || FONT_STACKS.modern;

    document.documentElement.dataset.font = font;
    document.documentElement.style.setProperty(
      '--studio-font-family',
      stack
    );

    if (document.body) {
      document.body.dataset.font = font;
      document.body.style.setProperty(
        '--studio-font-family',
        stack
      );

      document.body.style.fontFamily = stack;
    }
  }

  /* ---------- APPLY THEME ---------- */

  function applyTheme(theme) {
    const systemDark = Boolean(
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );

    const actualTheme = theme === 'system'
      ? (systemDark ? 'dark' : 'light')
      : theme;

    document.documentElement.dataset.theme = actualTheme;
    document.documentElement.dataset.savedTheme = theme;

    document.documentElement.style.colorScheme =
      DARK_THEMES.includes(actualTheme) ? 'dark' : 'light';

    if (document.body) {
      document.body.dataset.theme = actualTheme;
      document.body.dataset.savedTheme = theme;
    }

    return actualTheme;
  }

  /* ---------- MAIN APPLY FUNCTION ---------- */

  function apply() {
    const theme = normalize(
      getSetting('theme'),
      THEMES,
      DEFAULTS.theme
    );

    const font = normalize(
      getSetting('font'),
      FONTS,
      DEFAULTS.font
    );

    let motion = getSetting('motion');

    if (motion === 'off' || motion === 'reduced') {
      motion = 'reduced';
    } else {
      motion = 'full';
    }

    applyTheme(theme);
    applyFont(font);

    document.documentElement.dataset.motion = motion;

    if (document.body) {
      document.body.dataset.motion = motion;
    }

    updateSelectors(theme, font, motion);

    return {
      theme: theme,
      font: font,
      motion: motion
    };
  }

  /* ---------- SAVE APPEARANCE ---------- */

  function saveStudioAppearance(theme, font, motion) {
    theme = normalize(theme, THEMES, DEFAULTS.theme);
    font = normalize(font, FONTS, DEFAULTS.font);
    motion = normalize(motion, MOTIONS, DEFAULTS.motion);

    setSetting('theme', theme);
    setSetting('font', font);
    setSetting('motion', motion);

    apply();

    window.dispatchEvent(
      new CustomEvent('studio:appearance-changed', {
        detail: {
          theme: theme,
          font: font,
          motion: motion
        }
      })
    );
  }

  window.applyStudioTheme = apply;
  window.saveStudioAppearance = saveStudioAppearance;

  /* ---------- AUTOMATIC SELECTOR LISTENERS ---------- */

  document.addEventListener('change', function (event) {
    const target = event.target;

    if (!target || !target.id) return;

    if (
      target.id === 'themeSelect' ||
      target.id === 'fontSelect' ||
      target.id === 'motionSelect'
    ) {
      const current = {
        theme: getSetting('theme'),
        font: getSetting('font'),
        motion: getSetting('motion')
      };

      const theme = target.id === 'themeSelect'
        ? target.value
        : current.theme;

      const font = target.id === 'fontSelect'
        ? target.value
        : current.font;

      const motion = target.id === 'motionSelect'
        ? target.value
        : current.motion;

      saveStudioAppearance(theme, font, motion);
    }
  });

  /* ---------- SYSTEM PREFERENCE ---------- */

  if (window.matchMedia) {
    const preference = window.matchMedia(
      '(prefers-color-scheme: dark)'
    );

    function handlePreferenceChange() {
      if (getSetting('theme') === 'system') {
        apply();
      }
    }

    if (preference.addEventListener) {
      preference.addEventListener('change', handlePreferenceChange);
    } else if (preference.addListener) {
      preference.addListener(handlePreferenceChange);
    }
  }

  /* ---------- INITIALIZATION ---------- */

  document.addEventListener('DOMContentLoaded', apply);

  window.addEventListener('storage', function () {
    apply();
  });

  if (document.readyState !== 'loading') {
    apply();
  }

})();
