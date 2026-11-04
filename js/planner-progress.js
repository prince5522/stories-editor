
(function () {
'use strict';

const KEY = 'storySlotPlannerV1';
const $ = id => document.getElementById(id);
const SLOT_NAMES = ['morning', 'lunch', 'evening'];

function getSettings() {
  return window.StudioStore?.get(KEY, {}) || {};
}

function getEpisodes(slot) {
  if (!slot || !slot.storyName || !window.StudioStore) return [];

  if (slot.type === 'ready') {
    return (window.StudioStore.get('readyMadeEpisodes', []) || [])
      .filter(ep => {
        const name = ep.story_title || ep.storyName || ep.title || '';
        return name.toLowerCase() === slot.storyName.toLowerCase();
      });
  }

  return (window.StudioStore.get('episodes', []) || [])
    .filter(ep => {
      const name = ep.storyTitle || ep.seasonTitle || '';
      return !ep.archived &&
        name.toLowerCase() === slot.storyName.toLowerCase();
    });
}

function getCompleted(settings, slotName) {
  return settings.completed?.[slotName] || [];
}

/* ---------- QUEUE PACKAGE ---------- */

function ensureQueuePackage() {
  const slots = document.querySelector('.planner-slots');
  if (!slots) return null;

  let packageBox = document.getElementById('plannerQueuePackage');

  if (packageBox) return packageBox;

  packageBox = document.createElement('details');
  packageBox.id = 'plannerQueuePackage';
  packageBox.className = 'planner-queue-package';

  const summary = document.createElement('summary');
  summary.className = 'planner-queue-package-summary';
  summary.innerHTML = `
    <span class="planner-queue-icon">📦</span>
    <span class="planner-queue-heading">
      <strong>My posting queues</strong>
      <small>Morning · Lunch · Evening</small>
    </span>
    <span class="planner-queue-arrow">⌄</span>
  `;

  const content = document.createElement('div');
  content.className = 'planner-queue-package-content';

  slots.parentNode.insertBefore(packageBox, slots);
  packageBox.appendChild(summary);
  packageBox.appendChild(content);
  content.appendChild(slots);

  return packageBox;
}

function updateQueuePackage(settings) {
  const packageBox = ensureQueuePackage();
  if (!packageBox) return;

  const summary = packageBox.querySelector('.planner-queue-package-summary');
  if (!summary) return;

  const configured = SLOT_NAMES.filter(name => {
    const slot = settings.slots?.[name];
    return slot && slot.storyName && slot.channelUrl;
  }).length;

  const subtitle = summary.querySelector('small');

  if (subtitle) {
    subtitle.textContent =
      `${configured}/3 queues configured · Morning · Lunch · Evening`;
  }
}

/* ---------- PROGRESS ---------- */

function renderSlot(slotName, slot, settings) {
  const panel = document.querySelector(`[data-slot="${slotName}"]`);
  if (!panel) return;

  let box = panel.querySelector('.planner-progress');

  if (!box) {
    box = document.createElement('div');
    box.className = 'planner-progress';
    panel.appendChild(box);
  }

  const episodes = getEpisodes(slot);
  const completed = getCompleted(settings, slotName);
  const total = episodes.length;
  const done = completed.length;
  const remaining = Math.max(0, total - done);
  const percent = total
    ? Math.min(100, Math.round(done / total * 100))
    : 0;

  box.innerHTML = `
    <div class="planner-progress-heading">
      <strong>📊 Posting progress</strong>
      <span>${percent}%</span>
    </div>

    <div class="planner-progress-track">
      <div class="planner-progress-fill" style="width:${percent}%"></div>
    </div>

    <div class="planner-progress-stats">
      <span>✅ Posted: <strong>${done}</strong></span>
      <span>⏳ Remaining: <strong>${remaining}</strong></span>
      <span>📚 Total: <strong>${total}</strong></span>
    </div>

    ${total ? '' : '<p class="small muted">Select a story to see its posting progress.</p>'}
  `;
}

/* ---------- COLLAPSIBLE HISTORY ---------- */

function renderHistory(settings) {
  const panels = document.querySelectorAll('[data-slot]');
  if (!panels.length) return;

  let history = document.getElementById('plannerPostingHistory');

  if (!history) {
    history = document.createElement('details');
    history.id = 'plannerPostingHistory';
    history.className = 'planner-history';

    const main = document.querySelector('main') || document.body;
    main.appendChild(history);
  }

  const entries = [];

  SLOT_NAMES.forEach(slotName => {
    const slot = settings.slots?.[slotName];
    if (!slot) return;

    getCompleted(settings, slotName).forEach(item => {
      entries.push({
        ...item,
        slotName,
        storyName: item.title || slot.storyName || 'Story'
      });
    });
  });

  entries.sort((a, b) =>
    new Date(b.completedAt || 0) - new Date(a.completedAt || 0)
  );

  history.innerHTML = `
    <summary class="planner-history-summary">
      <span>🗂️ Posting history</span>
      <span class="planner-history-count">${entries.length} records</span>
      <span class="planner-queue-arrow">⌄</span>
    </summary>

    <div class="planner-history-content">
      ${
        entries.length
          ? entries.slice(0, 50).map(item => `
            <div class="planner-history-item">
              <strong>${escapeHTML(item.storyName)}</strong>
              <span>${escapeHTML(item.label || 'Episode')}</span>
              <small>${escapeHTML(item.slotName)} · ${formatDate(item.completedAt)}</small>
            </div>
          `).join('')
          : '<p class="small muted">Your completed episodes will appear here.</p>'
      }
    </div>
  `;

  // Always start closed, but don't force it closed during normal refreshes.
  if (!history.dataset.initialized) {
    history.open = false;
    history.dataset.initialized = 'true';
  }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function formatDate(value) {
  if (!value) return 'Date unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleString();
}

/* ---------- STYLES ---------- */

function addStyles() {
  if (document.getElementById('plannerProgressStyles')) return;

  const style = document.createElement('style');
  style.id = 'plannerProgressStyles';

  style.textContent = `
    .planner-queue-package,
    .planner-history {
      margin: 18px 0;
      border: 1px solid var(--border-color, #8885);
      border-radius: 18px;
      overflow: hidden;
      background: var(--card-bg, rgba(255,255,255,.045));
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .planner-queue-package-summary,
    .planner-history-summary {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      cursor: pointer;
      list-style: none;
      user-select: none;
      -webkit-user-select: none;
    }

    .planner-queue-package-summary::-webkit-details-marker,
    .planner-history-summary::-webkit-details-marker {
      display: none;
    }

    .planner-queue-icon {
      font-size: 25px;
    }

    .planner-queue-heading {
      display: flex;
      flex: 1;
      min-width: 0;
      flex-direction: column;
      gap: 3px;
    }

    .planner-queue-heading small {
      opacity: .7;
      font-size: 12px;
    }

    .planner-queue-arrow {
      margin-left: auto;
      font-size: 20px;
      opacity: .7;
      transition: transform .2s ease;
    }

    .planner-queue-package[open] > summary .planner-queue-arrow,
    .planner-history[open] > summary .planner-queue-arrow {
      transform: rotate(180deg);
    }

    .planner-queue-package-content {
      padding: 0 12px 12px;
    }

    .planner-queue-package-content .planner-slots {
      margin-top: 0;
    }

    .planner-progress {
      margin-top: 18px;
      padding: 14px;
      border: 1px solid var(--border-color, #8885);
      border-radius: 14px;
      background: rgba(128,128,128,.035);
    }

    .planner-progress-heading,
    .planner-progress-stats {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .planner-progress-track {
      height: 9px;
      margin: 12px 0;
      overflow: hidden;
      border-radius: 20px;
      background: var(--border-color, #8885);
    }

    .planner-progress-fill {
      height: 100%;
      border-radius: inherit;
      background: var(--primary, #16a34a);
      transition: width .3s ease;
    }

    .planner-progress-stats {
      font-size: 12px;
    }

    .planner-history-summary {
      justify-content: space-between;
    }

    .planner-history-count {
      margin-left: auto;
      font-size: 12px;
      opacity: .7;
    }

    .planner-history-content {
      padding: 0 16px 12px;
    }

    .planner-history-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-color, #8885);
    }

    .planner-history-item:last-child {
      border-bottom: 0;
    }

    .planner-history-item small {
      opacity: .7;
    }

    @media (max-width: 520px) {
      .planner-queue-package-content {
        padding-left: 8px;
        padding-right: 8px;
      }
    }
  `;

  document.head.appendChild(style);
}

/* ---------- REFRESH ---------- */

function render() {
  if (!window.StudioStore) return;

  const settings = getSettings();
  if (!settings.slots) return;

  updateQueuePackage(settings);

  SLOT_NAMES.forEach(slotName => {
    const slot = settings.slots[slotName];
    if (slot) renderSlot(slotName, slot, settings);
  });

  renderHistory(settings);
}

function init() {
  addStyles();
  render();

  document.addEventListener('planner:posts-updated', render);

  $('saveAllPlannerSlots')?.addEventListener('click', () => {
    setTimeout(render, 150);
  });

  window.addEventListener('focus', render);
  window.addEventListener('pageshow', render);
}

document.addEventListener('DOMContentLoaded', init);

})();
