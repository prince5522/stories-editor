(function () {
'use strict';

const KEY = 'storySlotPlannerV1';
const $ = id => document.getElementById(id);
const SLOT_NAMES = ['morning', 'lunch', 'evening'];

function getSettings() {
  return window.StudioStore?.get(KEY, {}) || {};
}

function getEpisodes(slot) {
  const settings = getSettings();

  if (!slot.storyName) return [];

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
      return !ep.archived && name.toLowerCase() === slot.storyName.toLowerCase();
    });
}

function getCompleted(settings, slotName) {
  return settings.completed?.[slotName] || [];
}

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
  const percent = total ? Math.min(100, Math.round(done / total * 100)) : 0;

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

function renderHistory(settings) {
  const panels = document.querySelectorAll('[data-slot]');
  if (!panels.length) return;

  let history = document.getElementById('plannerPostingHistory');

  if (!history) {
    history = document.createElement('section');
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
    <h3>🗂️ Posting history</h3>
    ${
      entries.length
        ? entries.slice(0, 30).map(item => `
          <div class="planner-history-item">
            <strong>${escapeHTML(item.storyName)}</strong>
            <span>${escapeHTML(item.label || 'Episode')}</span>
            <small>${formatDate(item.completedAt)}</small>
          </div>
        `).join('')
        : '<p class="small muted">Your completed episodes will appear here.</p>'
    }
  `;
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

function addStyles() {
  if (document.getElementById('plannerProgressStyles')) return;

  const style = document.createElement('style');
  style.id = 'plannerProgressStyles';
  style.textContent = `
    .planner-progress {
      margin-top: 18px;
      padding: 14px;
      border: 1px solid var(--border-color, #8884);
      border-radius: 14px;
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
      background: var(--border-color, #8884);
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

    .planner-history {
      margin: 24px 0;
      padding: 16px;
      border: 1px solid var(--border-color, #8884);
      border-radius: 16px;
    }

    .planner-history-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-color, #8884);
    }

    .planner-history-item:last-child {
      border-bottom: 0;
    }

    .planner-history-item small {
      opacity: .7;
    }
  `;

  document.head.appendChild(style);
}

function render() {
  if (!window.StudioStore) return;

  const settings = getSettings();
  if (!settings.slots) return;

  SLOT_NAMES.forEach(slotName => {
    const slot = settings.slots[slotName];
    if (slot) renderSlot(slotName, slot, settings);
  });

  renderHistory(settings);
}

document.addEventListener('DOMContentLoaded', () => {
  addStyles();
  render();

  document.addEventListener('planner:posts-updated', render);

  $('saveAllPlannerSlots')?.addEventListener('click', () => {
    setTimeout(render, 150);
  });

  window.addEventListener('focus', render);
});

})();