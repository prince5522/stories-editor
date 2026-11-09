/* =====================================================
   STORIES EDITOR — SAFE ANDROID BACKUP IMPORT
   Imports missing data without replacing existing data.
===================================================== */

(function () {
  'use strict';

  const MAX_BACKUP_SIZE = 25 * 1024 * 1024;

  const fileInput = document.getElementById('androidBackupFile');
  const importButton = document.getElementById('androidImportButton');
  const info = document.getElementById('androidImportInfo');
  const status = document.getElementById('androidImportStatus');

  if (!fileInput || !importButton || !status) return;

  function isPlainObject(value) {
    return value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value);
  }

  function isEmpty(value) {
    if (value === null || value === undefined) return true;

    if (typeof value === 'string') {
      return value.trim() === '';
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    if (isPlainObject(value)) {
      return Object.values(value).every(isEmpty);
    }

    return false;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /*
    Fill missing or empty values only.
    Existing non-empty values are always preserved.
    Non-empty arrays are not combined, preventing duplicates.
  */
  function mergeMissing(current, incoming) {
    if (isPlainObject(current) && isPlainObject(incoming)) {
      const result = clone(current);

      for (const key of Object.keys(incoming)) {
        if (
          !Object.prototype.hasOwnProperty.call(result, key) ||
          isEmpty(result[key])
        ) {
          result[key] = clone(incoming[key]);
        } else if (
          isPlainObject(result[key]) &&
          isPlainObject(incoming[key])
        ) {
          result[key] = mergeMissing(result[key], incoming[key]);
        }
      }

      return result;
    }

    if (isEmpty(current)) {
      return clone(incoming);
    }

    return clone(current);
  }

  function showStatus(message, isError) {
    status.textContent = message;
    status.style.color = isError ? '#dc3545' : '';
  }

  fileInput.addEventListener('change', function () {
    const file = fileInput.files?.[0];

    if (info) {
      info.textContent = file
        ? file.name + ' • ' + (file.size / 1024).toFixed(1) + ' KB'
        : 'No backup file selected.';
    }

    showStatus('', false);
  });

  importButton.addEventListener('click', async function () {
    const file = fileInput.files?.[0];

    if (!file) {
      showStatus('Choose your downloaded backup JSON file first.', true);
      return;
    }

    if (file.size > MAX_BACKUP_SIZE) {
      showStatus('This backup is larger than the 25 MB limit.', true);
      return;
    }

    if (!file.name.toLowerCase().endsWith('.json')) {
      showStatus('Please select a Story Studio JSON backup.', true);
      return;
    }

    const storage = window.StudioStore;

    if (!storage || typeof storage.get !== 'function' ||
        typeof storage.set !== 'function' ||
        typeof storage.all !== 'function') {
      showStatus('Story Studio storage is not ready. Reload and try again.', true);
      return;
    }

    const confirmed = window.confirm(
      'Import this backup into Stories Editor?\n\n' +
      'Existing non-empty data will be preserved. ' +
      'Missing or empty values may be filled from the backup.'
    );

    if (!confirmed) return;

    importButton.disabled = true;
    importButton.textContent = 'Importing backup…';

    try {
      const parsed = JSON.parse(await file.text());

      if (
        !parsed ||
        parsed.application !== 'Story Studio' ||
        parsed.format !== 'story-studio-backup' ||
        !isPlainObject(parsed.records)
      ) {
        throw new Error('This is not a supported Story Studio backup.');
      }

      if (parsed.version !== 2) {
        throw new Error('This backup version is not supported by this importer.');
      }

      const records = parsed.records;
      const keys = Object.keys(records);

      if (!keys.length) {
        throw new Error('The backup contains no saved records.');
      }

      const existing = storage.all() || {};
      let imported = 0;
      let preserved = 0;

      for (const key of keys) {
        if (
          !key ||
          key.length > 200 ||
          key.startsWith('__') ||
          records[key] === undefined
        ) {
          preserved++;
          continue;
        }

        const hasExisting = Object.prototype.hasOwnProperty.call(
          existing,
          key
        );

        if (!hasExisting || isEmpty(existing[key])) {
          storage.set(key, clone(records[key]));
          imported++;
          continue;
        }

        if (
          isPlainObject(existing[key]) &&
          isPlainObject(records[key])
        ) {
          const merged = mergeMissing(existing[key], records[key]);

          if (JSON.stringify(merged) !== JSON.stringify(existing[key])) {
            storage.set(key, merged);
            imported++;
          } else {
            preserved++;
          }

          continue;
        }

        preserved++;
      }

      showStatus(
        'Import finished. ' + imported +
        ' data sections imported or filled; ' +
        preserved + ' existing sections preserved. ' +
        'Please check your stories and planner.',
        false
      );

      window.studioToast?.('Backup import completed.');

    } catch (error) {
      console.error('Android backup import failed:', error);
      showStatus(error.message || 'Import failed. Your existing data was not intentionally replaced.', true);

    } finally {
      importButton.disabled = false;
      importButton.textContent = 'Import backup safely';
    }
  });

})();
