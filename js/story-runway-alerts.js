
/*
 * STORY STUDIO — STORY RUNWAY & ENDING ALERTS
 * Uses existing StudioStore, storySlotPlannerV1 and StudioNotify.
 * Each season has 13 episodes.
 */
(function () {
  'use strict';

  const PLANNER_KEY = 'storySlotPlannerV1';
  const EPISODES_PER_SEASON = 13;
  const ALERT_LEVELS = [3, 1];
  const $ = id => document.getElementById(id);

  let timer = null;

  function getStore() {
    return window.StudioStore;
  }

  function get(key, fallback) {
    try {
      return getStore()?.get(key, fallback) ?? fallback;
    } catch (error) {
      console.warn('Story Runway storage error:', error);
      return fallback;
    }
  }

  function save(key, value) {
    try {
      return getStore()?.set(key, value) !== false;
    } catch (error) {
      console.warn('Story Runway could not save:', error);
      return false;
    }
  }

  function plannerData() {
    const data = get(PLANNER_KEY, {}) || {};
    data.completed = data.completed || {};
    data.slots = data.slots || {};
    data.runwayAlerts = data.runwayAlerts || {};
    return data;
  }

  function stories() {
    return get('stories', []) || [];
  }

  function episodes() {
    return get('episodes', []) || [];
  }

  function storyTitle(story) {
    return String(
      story.title || story.storyTitle || 'Untitled story'
    ).trim();
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function storySeasons(story) {
    const title = normalize(storyTitle(story));
    const related = stories().filter(item =>
      normalize(storyTitle(item)) === title
    );

    const numbers = related.map(item =>
      Number(item.seasonNumber || item.season_number || 1)
    ).filter(Number.isFinite);

    return Math.max(1, ...numbers);
  }

  function storyEpisodes(story) {
    return episodes().filter(ep =>
      String(ep.storyId || '') === String(story.id || '')
    );
  }

  function postedCount(story, data) {
    const ids = new Set(
      storyEpisodes(story).map(ep => String(ep.id))
    );

    return Object.keys(data.completed).filter(id =>
      ids.has(String(id))
    ).length;
  }

  function assignedSlots(story, data) {
    return Object.entries(data.slots).filter(([id, slot]) =>
      slot &&
      slot.type === 'serial' &&
      String(slot.storyId || '') === String(story.id) &&
      /^\d{2}:\d{2}$/.test(String(slot.time || '')) &&
      slot.channelUrl
    ).map(([id, slot]) => ({
      id,
      time: slot.time
    })).sort((a, b) => a.time.localeCompare(b.time));
  }

  function estimateFinish(remaining, slots) {
    if (!slots.length) return null;
    if (remaining <= 0) return new Date();

    const now = new Date();
    let count = 0;
    const candidate = new Date(now);

    // Estimate using only slots assigned to this story.
    // A slot already passed today is counted from tomorrow.
    for (let day = 0; day < 3660; day++) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + day
      );

      for (const slot of slots) {
        const [hour, minute] = slot.time.split(':').map(Number);
        const scheduled = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          hour,
          minute
        );

        if (scheduled <= now) continue;

        count++;
        if (count >= remaining) return scheduled;
      }
    }

    return null;
  }

  function formatDate(date) {
    if (!date) return 'Assign a serial posting slot';
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function progressCard(story, data) {
    const seasons = storySeasons(story);
    const target = seasons * EPISODES_PER_SEASON;
    const posted = postedCount(story, data);
    const remaining = Math.max(0, target - posted);
    const slots = assignedSlots(story, data);
    const finish = estimateFinish(remaining, slots);
    const percentage = Math.min(
      100,
      Math.round((posted / target) * 100)
    );

    return `
      <article class="sra-card">
        <h3>📖 ${escapeHtml(storyTitle(story))}</h3>

        <div class="sra-stats">
          <strong>${posted} / ${target}</strong>
          <span>${remaining} episodes remaining</span>
        </div>

        <div class="sra-progress">
          <div style="width:${percentage}%"></div>
        </div>

        <p>${seasons} season(s) × 13 episodes</p>
        <p>📅 Estimated finish: <strong>${escapeHtml(formatDate(finish))}</strong></p>
        <p>${slots.length} assigned serial posting slot(s) per day</p>

        ${remaining === 0
          ? '<p class="sra-finished">🏆 Planned episodes completed!</p>'
          : slots.length === 0
            ? '<p class="sra-warning">Assign this story to a serial slot in Daily Story Planner.</p>'
            : ''}
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function render() {
    const host = $('storyRunwayAlerts');
    if (!host) return;

    const data = plannerData();
    const allStories = stories().filter(story => story && story.id);

    if (!allStories.length) {
      host.innerHTML = `
        <section class="sra-panel">
          <h2>🏁 Story Runway</h2>
          <p>Your saved stories will appear here.</p>
        </section>`;
      return;
    }

    host.innerHTML = `
      <section class="sra-panel">
        <p class="sra-eyebrow">SEASON PROGRESS</p>
        <h2>🏁 Story Runway & Ending Alerts</h2>
        <p class="sra-description">
          Track each story's progress and estimated completion date.
          Estimates use the serial posting slots assigned to that story.
          Each season is counted as 13 episodes.
        </p>
        ${allStories.map(story =>
          progressCard(story, data)
        ).join('')}
        <p class="sra-note">
          Estimates assume each assigned slot publishes one episode
          on each eligible day. Actual dates can change if you skip posts.
        </p>
      </section>`;
  }

  function checkEndingAlerts() {
    const data = plannerData();
    let changed = false;

    for (const story of stories()) {
      if (!story || !story.id) continue;

      const target = storySeasons(story) * EPISODES_PER_SEASON;
      const posted = postedCount(story, data);
      const remaining = Math.max(0, target - posted);
      const id = String(story.id);

      for (const level of ALERT_LEVELS) {
        const key = id + ':' + level;

        if (
          remaining > 0 &&
          remaining <= level &&
          !data.runwayAlerts[key]
        ) {
          const notifier = window.StudioNotify;

          if (
            notifier &&
            typeof notifier.send === 'function'
          ) {
            notifier.send(
              level === 1
                ? '🏁 One episode left!'
                : '📚 Your story is nearly ending',
              storyTitle(story) + ' has ' +
                remaining + ' episode(s) remaining.',
              { tag: 'story-runway-' + id + '-' + level }
            );
          }

          data.runwayAlerts[key] = new Date().toISOString();
          changed = true;
        }
      }
    }

    if (changed) save(PLANNER_KEY, data);
  }

  function injectStyles() {
    if ($('storyRunwayStyles')) return;

    const style = document.createElement('style');
    style.id = 'storyRunwayStyles';
    style.textContent = `
      #storyRunwayAlerts { margin:18px 0; }
      .sra-panel {
        border:1px solid var(--border,#8885);
        border-radius:16px;
        padding:16px;
        margin:12px 0;
        background:var(--card,transparent);
      }
      .sra-card {
        border:1px solid var(--border,#8885);
        border-radius:13px;
        padding:14px;
        margin:12px 0;
        background:var(--surface,transparent);
      }
      .sra-card h3 { margin-top:0; }
      .sra-stats {
        display:flex;
        justify-content:space-between;
        flex-wrap:wrap;
        gap:8px;
        margin:12px 0;
      }
      .sra-progress {
        height:10px;
        overflow:hidden;
        border-radius:20px;
        background:var(--border,#8884);
      }
      .sra-progress div {
        height:100%;
        border-radius:20px;
        background:var(--primary,#299d65);
      }
      .sra-eyebrow {
        font-size:11px;
        letter-spacing:1.5px;
        opacity:.7;
      }
      .sra-description,.sra-note {
        font-size:13px;
        opacity:.75;
        line-height:1.5;
      }
      .sra-warning { color:#d28a25; }
      .sra-finished { font-weight:bold; }
    `;
    document.head.appendChild(style);
  }

  function init() {
    if (!getStore() || !$('storySlotPlanner')) return;

    injectStyles();

    if (!$('storyRunwayAlerts')) {
      const host = document.createElement('div');
      host.id = 'storyRunwayAlerts';
      $('storySlotPlanner').appendChild(host);
    }

    render();
    checkEndingAlerts();

    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      checkEndingAlerts();
      render();
    }, 30000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkEndingAlerts();
        render();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(init, 300);
    });
  } else {
    setTimeout(init, 300);
  }
})();
