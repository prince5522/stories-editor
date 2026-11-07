
/* =====================================================
   STORY STUDIO — LOCAL STORAGE ENGINE
   Version: 2.0
   Prefix: channelStudio.

   Features:
   - Safe local saving and reading
   - JSON validation
   - Corrupted-record protection
   - Storage quota error handling
   - Existing data preservation
   - Supabase synchronization compatibility
   ===================================================== */

(function () {
  'use strict';

  const PREFIX = 'channelStudio.';

  const memoryFallback = Object.create(null);

  let storageAvailable = true;

  /* -----------------------------------------------
     STORAGE ACCESS
  ----------------------------------------------- */

  function getStorage() {
    try {
      if (!window.localStorage) {
        storageAvailable = false;
        return null;
      }

      const testKey = PREFIX + '__storage_test__';

      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);

      storageAvailable = true;

      return window.localStorage;

    } catch (error) {
      storageAvailable = false;

      console.warn(
        'Story Studio: Browser storage is unavailable.',
        error
      );

      return null;
    }
  }

  /* -----------------------------------------------
     KEY VALIDATION
  ----------------------------------------------- */

  function makeKey(key) {
    if (
      typeof key !== 'string' ||
      !key.trim()
    ) {
      throw new Error(
        'Storage key must be a non-empty string.'
      );
    }

    return PREFIX + key.trim();
  }

  /* -----------------------------------------------
     SAFE JSON PARSING
  ----------------------------------------------- */

  function parseValue(raw, fallback, key) {
    if (raw === null || raw === undefined) {
      return fallback;
    }

    try {
      return JSON.parse(raw);

    } catch (error) {
      console.warn(
        'Story Studio: Could not read saved record:',
        key,
        error
      );

      // Preserve the original record.
      // Do not automatically delete potentially
      // recoverable user data.
      return fallback;
    }
  }

  /* -----------------------------------------------
     GET DATA
  ----------------------------------------------- */

  function get(key, fallback = null) {
    let fullKey;

    try {
      fullKey = makeKey(key);
    } catch (error) {
      console.warn(error);
      return fallback;
    }

    const storage = getStorage();

    if (!storage) {
      return Object.prototype.hasOwnProperty.call(
        memoryFallback,
        fullKey
      )
        ? memoryFallback[fullKey]
        : fallback;
    }

    try {
      const raw = storage.getItem(fullKey);

      if (raw === null) {
        return Object.prototype.hasOwnProperty.call(
          memoryFallback,
          fullKey
        )
          ? memoryFallback[fullKey]
          : fallback;
      }

      return parseValue(raw, fallback, key);

    } catch (error) {
      console.error(
        'Story Studio: Storage read failed:',
        key,
        error
      );

      return Object.prototype.hasOwnProperty.call(
        memoryFallback,
        fullKey
      )
        ? memoryFallback[fullKey]
        : fallback;
    }
  }

  /* -----------------------------------------------
     SET DATA
  ----------------------------------------------- */

  function set(key, value) {
    let fullKey;

    try {
      fullKey = makeKey(key);
    } catch (error) {
      console.warn(error);
      return false;
    }

    let serialized;

    try {
      serialized = JSON.stringify(value);

      if (serialized === undefined) {
        throw new Error(
          'This value cannot be saved as JSON.'
        );
      }

    } catch (error) {
      console.error(
        'Story Studio: Data could not be converted to JSON:',
        key,
        error
      );

      return false;
    }

    const storage = getStorage();

    if (!storage) {
      memoryFallback[fullKey] = value;

      return false;
    }

    try {
      storage.setItem(fullKey, serialized);

      // Keep the fallback synchronized.
      memoryFallback[fullKey] = value;

      return true;

    } catch (error) {
      console.error(
        'Story Studio: Storage write failed:',
        key,
        error
      );

      // Preserve the latest value in memory for
      // the current page session.
      memoryFallback[fullKey] = value;

      if (
        error.name === 'QuotaExceededError' ||
        error.code === 22 ||
        error.code === 1014
      ) {
        console.warn(
          'Story Studio: Storage space is full. ' +
          'Existing saved data has not been deleted.'
        );
      }

      return false;
    }
  }

  /* -----------------------------------------------
     REMOVE DATA
  ----------------------------------------------- */

  function remove(key) {
    let fullKey;

    try {
      fullKey = makeKey(key);
    } catch (error) {
      console.warn(error);
      return false;
    }

    const storage = getStorage();

    try {
      if (storage) {
        storage.removeItem(fullKey);
      }

      delete memoryFallback[fullKey];

      return true;

    } catch (error) {
      console.warn(
        'Story Studio: Could not remove saved data:',
        key,
        error
      );

      return false;
    }
  }

  /* -----------------------------------------------
     GET ALL STORY STUDIO DATA
  ----------------------------------------------- */

  function all() {
    const output = Object.create(null);

    const storage = getStorage();

    if (storage) {
      try {
        for (
          let index = 0;
          index < storage.length;
          index++
        ) {
          const fullKey = storage.key(index);

          if (
            !fullKey ||
            !fullKey.startsWith(PREFIX)
          ) {
            continue;
          }

          const key = fullKey.slice(PREFIX.length);

          try {
            const raw = storage.getItem(fullKey);

            if (raw === null) continue;

            output[key] = JSON.parse(raw);

          } catch (error) {
            console.warn(
              'Story Studio: Skipping unreadable record:',
              key
            );
          }
        }

      } catch (error) {
        console.error(
          'Story Studio: Could not retrieve all records:',
          error
        );
      }
    }

    // Include session-only fallback values.
    Object.keys(memoryFallback).forEach(fullKey => {
      if (!fullKey.startsWith(PREFIX)) return;

      const key = fullKey.slice(PREFIX.length);

      if (!Object.prototype.hasOwnProperty.call(output, key)) {
        output[key] = memoryFallback[fullKey];
      }
    });

    return output;
  }

  /* -----------------------------------------------
     STORAGE STATUS
  ----------------------------------------------- */

  function isAvailable() {
    return !!getStorage();
  }

  /* -----------------------------------------------
     PUBLIC STORAGE API
  ----------------------------------------------- */

  window.StudioStore = {
    get: get,
    set: set,
    remove: remove,
    all: all,
    isAvailable: isAvailable
  };

  console.info(
    'Story Studio local storage initialized.'
  );

})();
