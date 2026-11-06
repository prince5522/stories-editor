
(function () {
'use strict';

const KEY = 'storySlotPlannerV1';
const $ = id => document.getElementById(id);

const SLOT_NAMES = ['morning', 'lunch', 'evening'];

const SLOT_LABELS = {
  morning: '🌅 Morning',
  lunch: '☀️ Lunch',
  evening: '🌙 Evening'
};

let refreshTimer = null;
let settings = {};

/* =========================================
   STORAGE
========================================= */

function read(key, fallback) {
  try {
    if (!window.StudioStore) return fallback;
    return window.StudioStore.get(key, fallback);
  } catch (error) {
    console.warn('Planner progress read error:', error);
    return fallback;
  }
}

function readSettings() {
  const value = read(KEY, {});
  return value && typeof value === 'object' ? value : {};
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function normalName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/* =========================================
   EPISODES
========================================= */

function uniqueById(items) {
  const map = new Map();

  items.forEach((item, index) => {
    if (!item) return;

    const key = item.id != null
      ? String(item.id)
      : `episode-${index}`;

    map.set(key, item);
  });

  return [...map.values()];
}

function getEpisodes(slot) {
  if (!slot || !slot.storyName) return [];

  if (slot.type === 'ready') {
    const items = read('readyMadeEpisodes', []);

    if (!Array.isArray(items)) return [];

    return uniqueById(items.filter(ep => {
      const name =
        ep.story_title ||
        ep.storyName ||
        ep.title ||
        'Ready-made episodes';

      return normalName(name) === normalName(slot.storyName);
    })).sort((a, b) =>
      Number(a.season_number || 1) -
        Number(b.season_number || 1) ||
      Number(a.episode_number || 1) -
        Number(b.episode_number || 1)
    );
  }

  const items = read('episodes', []);

  if (!Array.isArray(items)) return [];

  return uniqueById(items.filter(ep => {
    const name = ep.storyTitle || ep.seasonTitle || '';

    return !ep.archived &&
      normalName(name) === normalName(slot.storyName);
  })).sort((a, b) =>
    Number(a.seasonNumber || 1) -
      Number(b.seasonNumber || 1) ||
    Number(a.episodeNumber || 1) -
      Number(b.episodeNumber || 1)
  );
}

/* =========================================
   COMPLETION
========================================= */

function getCompletedRecords(slotName) {
  const records = settings.completed?.[slotName];

  return Array.isArray(records) ? records : [];
}

function getCompletionIds(slotName) {
  return new Set(
    getCompletedRecords(slotName)
      .filter(record => record && record.episodeId != null)
      .map(record => String(record.episodeId))
  );
}

function isReadyPosted(ep) {
  return String(ep.status || '').toLowerCase() === 'posted';
}

function calculateProgress(slotName) {
  const slot = settings.slots?.[slotName];

  if (!slot || !slot.storyName) {
    return {
      configured: false,
      total: 0,
      completed: 0,
      remaining: 0,
      percentage: 0,
      episodes: []
    };
  }

  const episodes = getEpisodes(slot);
  const completedIds = getCompletionIds(slotName);
  const completed = episodes.filter(ep => {
    if (ep.id == null) return false;

    const id = String(ep.id);

    return completedIds.has(id) ||
      (slot.type === 'ready' && isReadyPosted(ep));
  }).length;

  const total = episodes.length;
  const remaining = Math.max(0, total - completed);

  return {
    configured: true,
    total,
    completed,
    remaining,
    percentage: total
      ? Math.round((completed / total) * 100)
      : 0,
    episodes
  };
}

/* =========================================
   PRESERVE FOLDER OPEN/CLOSED STATES
========================================= */

function rememberOpenStates(container) {
  const states = {};

  container.querySelectorAll('details[id]').forEach(folder => {
    states[folder.id] = folder.open;
  });

  return states;
}

function restoreOpenStates(container, states) {
  container.querySelectorAll('details[id]').forEach(folder => {
    if (Object.prototype.hasOwnProperty.call(states, folder.id)) {
      folder.open = states[folder.id];
    }
  });
}

/* =========================================
   PROGRESS SECTION
========================================= */

function ensureProgressSection() {
  let section = $('plannerProgressSection');

  if (section) return section;

  section = document.createElement('section');
  section.id = 'plannerProgressSection';
  section.className = 'section-block panel planner-progress';

  section.innerHTML = `
    <details class="planner-folder" id="postingProgressFolder">
      <summary class="planner-folder-summary">
        <span>
          <span class="planner-folder-title">
            📁 Posting Progress
          </span>
          <span class="planner-folder-hint">
            Independent progress for each daily queue
          </span>
        </span>
        <span class="pill">3 queues</span>
      </summary>

      <div class="planner-folder-content">
        <div id="plannerProgressCards"></div>
      </div>
    </details>
  `;

  const setup = $('plannerSetupStatus');
  const main = document.querySelector('main');

  if (setup?.closest('.section-block')) {
    setup.closest('.section-block').after(section);
  } else if (main) {
    main.appendChild(section);
  }

  return section;
}

function renderProgressCard(slotName) {
  const progress = calculateProgress(slotName);
  const slot = settings.slots?.[slotName];

  const label = SLOT_LABELS[slotName];

  if (!progress.configured) {
    return `
      <details
        class="planner-progress-queue"
        id="${slotName}ProgressFolder"
      >
        <summary>
          <span>${label}</span>
          <span class="pill">Not configured</span>
        </summary>

        <div class="planner-progress-body">
          <p class="small muted">
            Choose a story and save this queue to start tracking progress.
          </p>
        </div>
      </details>
    `;
  }

  const percent = progress.percentage;

  const status = progress.total === 0
    ? 'No episodes uploaded for this story yet.'
    : progress.remaining === 0
      ? 'All available episodes completed.'
      : `${progress.remaining} episodes remaining.`;

  return `
    <details
      class="planner-progress-queue"
      id="${slotName}ProgressFolder"
    >
      <summary>
        <span>${label}</span>
        <span class="pill">${percent}% complete</span>
      </summary>

      <div class="planner-progress-body">
        <h3>${escapeHTML(slot.storyName)}</h3>

        <p class="small muted">
          ${slot.type === 'ready' ? 'Ready-Made story' : 'Serial story'}
        </p>

        <div
          role="progressbar"
          aria-label="Posting progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${percent}"
          style="
            width:100%;
            height:11px;
            border-radius:20px;
            overflow:hidden;
            background:var(--surface-2,rgba(127,127,127,.18));
            margin:14px 0;
          "
        >
          <div style="
            width:${percent}%;
            height:100%;
            border-radius:20px;
            background:var(--accent,var(--primary,#16a34a));
            transition:width .3s ease;
          "></div>
        </div>

        <div class="section-heading">
          <span class="small">
            ✅ Completed: <strong>${progress.completed}</strong>
          </span>

          <span class="small">
            ⏳ Remaining: <strong>${progress.remaining}</strong>
          </span>
        </div>

        <p class="small muted">
          Total episodes: ${progress.total}
        </p>

        <p class="small muted">${escapeHTML(status)}</p>
      </div>
    </details>
  `;
}

function renderProgress() {
  ensureProgressSection();

  const target = $('plannerProgressCards');
  if (!target) return;

  const states = rememberOpenStates(target);

  const html = SLOT_NAMES
    .map(renderProgressCard)
    .join('');

  /* Avoid unnecessary DOM replacement */
  if (target.innerHTML !== html) {
    target.innerHTML = html;
    restoreOpenStates(target, states);
  }
}

/* =========================================
   POSTING HISTORY
========================================= */

function getHistoryEntries() {
  const entries = [];

  SLOT_NAMES.forEach(slotName => {
    getCompletedRecords(slotName).forEach((record, index) => {
      if (!record) return;

      entries.push({
        ...record,
        slotName,
        _fallbackIndex: index
      });
    });
  });

  const unique = new Map();

  entries.forEach(entry => {
    const episodeId = entry.episodeId != null
      ? String(entry.episodeId)
      : '';

    const date = entry.completedAt ||
      entry.date ||
      entry.timestamp ||
      '';

    const key = episodeId
      ? `${entry.slotName}:${episodeId}`
      : `${entry.slotName}:${date}:${entry.label || entry.title || entry._fallbackIndex}`;

    const old = unique.get(key);

    if (!old) {
      unique.set(key, entry);
      return;
    }

    const currentTime = new Date(date || 0).getTime();
    const oldTime = new Date(
      old.completedAt || old.date || old.timestamp || 0
    ).getTime();

    if (currentTime >= oldTime) {
      unique.set(key, entry);
    }
  });

  return [...unique.values()].sort((a, b) => {
    const dateA = new Date(
      a.completedAt || a.date || a.timestamp || 0
    ).getTime();

    const dateB = new Date(
      b.completedAt || b.date || b.timestamp || 0
    ).getTime();

    return dateB - dateA;
  });
}

function formatDate(value) {
  if (!value) return 'Date not recorded';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date not recorded';
  }

  return date.toLocaleString();
}

function renderHistoryEntry(entry) {
  const slotLabel = SLOT_LABELS[entry.slotName] ||
    entry.slotName;

  const title = entry.title ||
    settings.slots?.[entry.slotName]?.storyName ||
    'Story episode';

  const episode = entry.label || 'Episode completed';

  const date = formatDate(
    entry.completedAt ||
    entry.date ||
    entry.timestamp
  );

  return `
    <article class="list-item">
      <div class="section-heading">
        <strong>${escapeHTML(title)}</strong>
        <span class="pill">${escapeHTML(slotLabel)}</span>
      </div>

      <p class="small">✅ ${escapeHTML(episode)}</p>

      <p class="small muted">${escapeHTML(date)}</p>
    </article>
  `;
}

function ensureHistorySection() {
  let section = $('plannerHistorySection');

  if (section) return section;

  section = document.createElement('section');
  section.id = 'plannerHistorySection';
  section.className = 'section-block panel planner-history';

  section.innerHTML = `
    <details class="planner-folder" id="postingHistoryFolder">
      <summary class="planner-folder-summary">
        <span>
          <span class="planner-folder-title">
            📁 Posting History
          </span>
          <span class="planner-folder-hint">
            Completed posts from all three queues
          </span>
        </span>
        <span class="pill">History</span>
      </summary>

      <div class="planner-folder-content">
        <div id="plannerHistoryList"></div>
      </div>
    </details>
  `;

  const progress = $('plannerProgressSection');

  if (progress) {
    progress.after(section);
  } else {
    document.querySelector('main')?.appendChild(section);
  }

  return section;
}

function renderHistory() {
  ensureHistorySection();

  const target = $('plannerHistoryList');
  if (!target) return;

  const entries = getHistoryEntries();

  const html = entries.length
    ? entries.slice(0, 100).map(renderHistoryEntry).join('')
    : `
      <div class="planner-empty">
        <p>No completed posts recorded yet.</p>
        <p class="small muted">
          Completed posting records will appear here.
        </p>
      </div>
    `;

  if (target.innerHTML !== html) {
    target.innerHTML = html;
  }
}

/* =========================================
   REFRESH
========================================= */

function render() {
  settings = readSettings();

  if (!settings.slots) settings.slots = {};
  if (!settings.completed) settings.completed = {};

  renderProgress();
  renderHistory();
}

function scheduleRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    render();
  }, 150);
}

/* =========================================
   EVENTS
========================================= */

function bindEvents() {
  document.addEventListener(
    'planner:posts-updated',
    scheduleRefresh
  );

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh();
  });

  window.addEventListener('focus', scheduleRefresh);
  window.addEventListener('pageshow', scheduleRefresh);
  window.addEventListener('storage', scheduleRefresh);

  document.addEventListener('click', event => {
    if (event.target.closest(
      '#saveAllPlannerSlots, #savePlannerSettings'
    )) {
      scheduleRefresh();
    }
  });
}

/* =========================================
   START
========================================= */

function init() {
  if (!window.StudioStore) {
    console.warn('Planner progress: StudioStore unavailable.');
    return;
  }

  render();
  bindEvents();

  window.setInterval(() => {
    if (!document.hidden) render();
  }, 15000);

  console.log(
    'Planner progress and history folders initialized.'
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
