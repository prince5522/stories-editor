
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const store = () => window.StudioStore;

  const get = (key, fallback = []) => {
    const s = store();
    return s ? s.get(key, fallback) : fallback;
  };

  const set = (key, value) => {
    const s = store();
    return s ? s.set(key, value) : false;
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

  /* TOAST */

  window.studioToast = function (message) {
    const region = $('toastRegion');

    if (!region) {
      console.info(message);
      return;
    }

    window.StudioNotify?.playTone?.(false);

    const element = document.createElement('div');
    element.className = 'toast';
    element.textContent = message;

    region.appendChild(element);

    setTimeout(() => element.remove(), 3500);
  };

  /* SHARED LIST ITEM */

  function item(title, body, meta, link, removeKey, id) {
    return `
      <article class="list-item">
        <h3>${esc(title)}</h3>
        <p>${esc(body || '')}</p>

        ${meta
          ? `<p class="small muted">${esc(meta)}</p>`
          : ''
        }

        ${link
          ? `<p>
              <a class="text-link"
                 href="${esc(link)}"
                 target="_blank"
                 rel="noopener">
                Open link ↗
              </a>
            </p>`
          : ''
        }

        ${removeKey
          ? `<div class="item-actions">
              <button class="button ghost"
                data-remove="${esc(removeKey)}"
                data-id="${esc(id)}">
                Delete
              </button>
            </div>`
          : ''
        }
      </article>
    `;
  }

  function renderList(id, key, mapper, emptyMessage) {
    const element = $(id);
    if (!element) return;

    const records = get(key);

    element.innerHTML = records.length
      ? records.slice().reverse()
          .map((record, index) =>
            mapper(record, records.length - 1 - index)
          )
          .join('')
      : `<div class="empty-state">${emptyMessage}</div>`;
  }

  /* DELETION */
/* TASK COMPLETION */

function wireTaskCompletion() {
  if (document.documentElement.dataset.taskCompletionWired) return;

  document.documentElement.dataset.taskCompletionWired = '1';

  document.addEventListener('click', event => {
    const button = event.target.closest(
      '[data-home-done], [data-done]'
    );

    if (!button) return;

    const index = Number(
      button.dataset.homeDone ?? button.dataset.done
    );

    const tasks = get('tasks');

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= tasks.length
    ) {
      return;
    }

    tasks[index].done = !tasks[index].done;

    if (!set('tasks', tasks)) {
      window.studioToast('Could not update task.');
      return;
    }

    renderTasks();
    refreshHome();

    window.studioToast(
      tasks[index].done
        ? 'Task marked complete.'
        : 'Task marked pending.'
    );
  });
}

        /* WEEKLY ACTIVITY */

  function renderWeeklyActivity() {
    const container = $('homeWeek');
    if (!container) return;

    const dayNames = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monday = new Date(today);
    monday.setDate(
      monday.getDate() - ((monday.getDay() + 6) % 7)
    );

    const week = dayNames.map((name, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);

      return {
        name,
        date,
        tasks: []
      };
    });

    const tasks = get('tasks').filter(task => task && !task.done);

    tasks.forEach(task => {
      let scheduledDate = null;

      if (task.date) {
        const match = String(task.date).match(
          /^(\d{4})-(\d{2})-(\d{2})/
        );

        if (match) {
          scheduledDate = new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
          );
        }
      }

      // Date-specific tasks appear only on their scheduled date.
      if (scheduledDate && !Number.isNaN(scheduledDate.getTime())) {
        scheduledDate.setHours(0, 0, 0, 0);

        const difference = Math.round(
          (scheduledDate.getTime() - monday.getTime()) /
          86400000
        );

        if (difference >= 0 && difference < 7) {
          week[difference].tasks.push(task);
        }

        return;
      }

      // Weekday-based tasks appear on their selected weekdays.
      const selectedDays = Array.isArray(task.days)
        ? task.days
        : [];

      selectedDays.forEach(day => {
        const index = dayNames.findIndex(name =>
          name.toLowerCase() === String(day).toLowerCase()
        );

        if (index !== -1) {
          week[index].tasks.push(task);
        }
      });
    });

    container.innerHTML = week.map(day => {
      const isToday =
        day.date.getTime() === today.getTime();

      const count = day.tasks.length;

      const taskPreview = day.tasks
        .slice(0, 2)
        .map(task => `
          <p class="home-week-task">
            ${esc(task.title || 'Untitled task')}
          </p>
        `)
        .join('');

      const extra = count > 2
        ? `<p class="small muted">+${count - 2} more</p>`
        : '';

      return `
        <article class="home-week-day
          ${isToday ? 'is-today' : ''}
          ${count ? 'has-activity' : ''}">

          <p class="home-week-name">${day.name}</p>

          <strong class="home-week-date">
            ${day.date.getDate()}
          </strong>

          <span class="home-week-count">
            ${count} ${count === 1 ? 'task' : 'tasks'}
          </span>

          <div class="home-week-preview">
            ${taskPreview}
            ${extra}
          </div>

          ${isToday
            ? '<span class="home-week-today">Today</span>'
            : ''
          }

        </article>
      `;
    }).join('');
  }
        
  /* HOME */

  function refreshHome() {
    renderWeeklyActivity();

    const stories = get('stories');
  const allTasks = get('tasks');
  const channels = get('channels');

  // Keep the dashboard statistics accurate.
  const pendingTasks = allTasks.filter(task => !task.done);

  if ($('storyCount')) {
    $('storyCount').textContent = stories.length;
  }

  if ($('taskCount')) {
    $('taskCount').textContent = pendingTasks.length;
  }

  if ($('channelCount')) {
    $('channelCount').textContent = channels.length;
  }


    
  // Keep each task's original storage index for safe deletion.
  const tasks = allTasks
    .map((task, index) => ({
      ...task,
      _originalIndex: index,
      _scheduledTime: task.date
        ? new Date(task.date).getTime()
        : NaN
    }))
    .filter(task => !task.done);

  // Tasks with dates appear first, ordered by scheduled time.
  // Undated weekly tasks follow them.
  tasks.sort((a, b) => {
    const aHasDate = Number.isFinite(a._scheduledTime);
    const bHasDate = Number.isFinite(b._scheduledTime);

    if (aHasDate && bHasDate) {
      return a._scheduledTime - b._scheduledTime;
    }

    if (aHasDate) return -1;
    if (bHasDate) return 1;

    return a._originalIndex - b._originalIndex;
  });

  const previewTasks = tasks.slice(0, 5);
  const container = $('homeTasks');

  if (!container) return;

  if (!previewTasks.length) {
    container.innerHTML = `
      <div class="empty-state">
        No pending tasks yet. Add your first posting reminder in Planner.
      </div>
    `;
    return;
  }

  const now = Date.now();

  container.innerHTML = previewTasks.map(task => {
    const days = Array.isArray(task.days)
      ? task.days.filter(Boolean)
      : [];

    let schedule = 'No schedule';

    if (days.length) {
      schedule = days.join(', ');

      if (task.repeatWeekly) {
        schedule += ' · Repeats weekly';
      }
    } else if (task.date) {
      const date = new Date(task.date);

      schedule = Number.isNaN(date.getTime())
        ? String(task.date)
        : date.toLocaleString();
    }

    const overdue =
      Number.isFinite(task._scheduledTime) &&
      task._scheduledTime < now;

    const status = overdue
      ? '⚠️ Overdue'
      : '⏳ Pending';

    return `
      <article class="list-item">
        <h3>${esc(task.title || 'Untitled task')}</h3>

        <p>
          ${esc(schedule)}
          · ${esc(task.type || 'Task')}
        </p>

        <p class="small muted">
          ${status}
        </p>

        ${task.notes
          ? `<p class="small muted">${esc(task.notes)}</p>`
          : ''
        }

        <div class="item-actions">
          <button
            class="button ghost"
            data-home-done="${task._originalIndex}"
            type="button">
            Mark complete
          </button>
        </div>
      </article>
    `;
  }).join('');
}

  /* STORIES */

  function setupStories() {
    if (window.initStage2Stories) {
      window.initStage2Stories();
      return;
    }

    const form = $('storyForm');

    if (form) {
      const file = $('storyFile');
      const text = $('storyText');

      if (file) {
        file.addEventListener('change', async () => {
          const selectedFile = file.files?.[0];
          if (!selectedFile) return;

          try {
            if (selectedFile.type === 'application/pdf') {
              if (!window.pdfjsLib) {
                window.studioToast(
                  'PDF reader needs internet access. Please paste text or try again online.'
                );
                return;
              }

              pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

              const pdf = await pdfjsLib.getDocument(
                await selectedFile.arrayBuffer()
              ).promise;

              const pages = [];

              for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();

                pages.push(
                  content.items.map(item => item.str).join(' ')
                );
              }

              text.value = pages.join('\n\n');

              window.studioToast(
                'PDF text extracted. Check it before saving.'
              );
            } else {
              text.value = await selectedFile.text();
            }
          } catch (error) {
            console.error(error);

            window.studioToast(
              'Could not read this file. Try a text file or paste the content.'
            );
          }
        });
      }

      form.addEventListener('submit', event => {
        event.preventDefault();

        const title = $('storyTitle')?.value.trim();
        const content = $('storyText')?.value.trim();

        if (!title || !content) {
          window.studioToast(
            'Enter a title and story text first.'
          );
          return;
        }

        const stories = get('stories');

        stories.push({
          id: Date.now(),
          title,
          content,
          date: new Date().toLocaleString()
        });

        if (!set('stories', stories)) {
          window.studioToast(
            'Storage is full. Export a backup or shorten this story.'
          );
          return;
        }

        form.reset();
        renderStories();

        window.studioToast('Story saved on this device.');
      });

      $('clearStoryForm')?.addEventListener('click', () => {
        form.reset();
      });
    }

    renderStories();
  }

  function renderStories() {
    renderList(
      'storyList',
      'stories',
      (story, index) => item(
        story.title,
        story.content.slice(0, 280) +
          (story.content.length > 280 ? '…' : ''),
        `${story.content.length} characters · ${story.date}`,
        '',
        'stories',
        index
      ),
      'No saved stories yet. Add a story above.'
    );

    if ($('storyLibraryCount')) {
      $('storyLibraryCount').textContent = get('stories').length;
    }

    const select = $('splitStory');

    if (select) {
      const previousValue = select.value;

      select.innerHTML =
        '<option value="">Select a saved story…</option>' +
        get('stories').map((story, index) =>
          `<option value="${index}">${esc(story.title)}</option>`
        ).join('');

      select.value = previousValue;
    }
  }

  /* EPISODE SPLITTER */

  function setupEpisodes() {
    if (window.initStage2Episodes) {
      window.initStage2Episodes();
      return;
    }

    const form = $('splitForm');
    if (!form) return;

    let generated = [];

    function splitIntoWords(text, count) {
      const tokens = text.match(/\S+\s*/g) || [];
      const bins = Array.from({ length: count }, () => []);

      const target = Math.ceil(tokens.length / count) || 1;
      let bin = 0;

      for (let i = 0; i < tokens.length; i++) {
        if (bin < count - 1 && bins[bin].length >= target) {
          bin++;
        }

        bins[bin].push(tokens[i]);
      }

      return bins.map(parts => parts.join(''));
    }

    function splitIntoCharacters(text, count, ignoreSpaces) {
      if (!ignoreSpaces) {
        const size = Math.ceil(text.length / count) || 1;

        return Array.from({ length: count }, (_, index) =>
          text.slice(index * size, (index + 1) * size)
        );
      }

      const bins = [];
      const total = (text.match(/\S/g) || []).length;

      if (!total) {
        return Array.from({ length: count }, () => '');
      }

      const target = Math.ceil(total / count);

      let current = '';
      let characters = 0;

      for (let i = 0; i < text.length; i++) {
        const character = text[i];

        if (
          !/\s/.test(character) &&
          characters >= target &&
          bins.length < count - 1
        ) {
          bins.push(current);
          current = '';
          characters = 0;
        }

        current += character;

        if (!/\s/.test(character)) {
          characters++;
        }
      }

      bins.push(current);

      while (bins.length < count) {
        bins.push('');
      }

      return bins.slice(0, count);
    }

    form.addEventListener('submit', event => {
      event.preventDefault();

      const stories = get('stories');
      const story = stories[Number($('splitStory')?.value)];

      if (!story) {
        window.studioToast(
          'Save or select a story first.'
        );
        return;
      }

      const count = Math.max(
        1,
        Math.min(50, Number($('episodeCount')?.value) || 13)
      );

      const method = $('splitMethod')?.value;
      let chunks = [];

      if (method === 'paragraph') {
        const parts = story.content
          .split(/\n\s*\n/)
          .filter(Boolean);

        const paragraphs = parts.length ? parts : [story.content];

        const bins = Array.from({ length: count }, () => []);
        const sizes = Array(count).fill(0);

        paragraphs.forEach(part => {
          const index = sizes.indexOf(Math.min(...sizes));

          bins[index].push(part);
          sizes[index] += part.length;
        });

        chunks = bins.map(bin => bin.join('\n\n').trim());
      } else if (method === 'words') {
        chunks = splitIntoWords(story.content, count);
      } else if (method === 'noSpaces') {
        chunks = splitIntoCharacters(story.content, count, true);
      } else {
        chunks = splitIntoCharacters(story.content, count, false);
      }

      generated = chunks.map((content, index) => ({
        title: `${story.title} — Episode ${index + 1}`,
        content,
        method
      }));

      const methodName =
        method === 'words'
          ? 'words'
          : method === 'noSpaces'
            ? 'characters without spaces'
            : method === 'characters'
              ? 'characters (including spaces)'
              : 'paragraphs';

      const preview = $('episodePreview');

      preview.innerHTML = `
        <p class="small muted full">
          Split by ${esc(methodName)} · ${count} episode(s) ·
          ${story.content.length.toLocaleString()} total characters.
        </p>

        ${generated.map((episode, index) => `
          <article class="list-item">
            <h3>${esc(episode.title)}</h3>

            <p class="small muted">
              ${episode.content.length.toLocaleString()} characters ·
              ${(episode.content.match(/\S+/g) || []).length.toLocaleString()} words
            </p>

            <p>
              ${esc(
                episode.content.slice(0, 400) ||
                '(This episode has no text because the selected story is shorter than the number of episodes.)'
              )}
            </p>

            <label>
              <input type="checkbox" data-ep="${index}" checked>
              Include in save
            </label>
          </article>
        `).join('')}

        <button class="button primary"
          id="saveEpisodes"
          type="button">
          Save selected episodes
        </button>
      `;

      preview.hidden = false;
    });

    $('episodePreview')?.addEventListener('click', event => {
      if (event.target.id !== 'saveEpisodes') return;

      const preview = $('episodePreview');

      const selected = generated.filter((episode, index) =>
        preview.querySelector(`[data-ep="${index}"]`)?.checked
      );

      const episodes = get('episodes');

      episodes.push(
        ...selected.map(episode => ({
          ...episode,
          date: new Date().toLocaleString()
        }))
      );

      if (!set('episodes', episodes)) {
        window.studioToast('Could not save episodes. Check available storage.');
        return;
      }

      window.studioToast(`${selected.length} episodes saved.`);

      preview.innerHTML = selected.length
        ? selected.map(episode =>
            item(
              episode.title,
              episode.content.slice(0, 240),
              `Saved episode · ${episode.content.length} characters`
            )
          ).join('')
        : '<div class="empty-state">No episodes selected.</div>';
    });
  }

  /* PLANNER */

  function setupPlanner() {
    const form = $('taskForm');

    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();

        const title = $('taskTitle')?.value.trim();
        const date = $('taskDate')?.value;

        const days = [
          ...document.querySelectorAll(
            'input[name="taskDay"]:checked'
          )
        ].map(input => input.value);

        if (!date && !days.length) {
          window.studioToast(
            'Choose a date/time or at least one weekday.'
          );
          return;
        }

        const media = $('taskMediaSelect');
        const tasks = get('tasks');

        const isPost =
          ($('taskType')?.value || 'post') === 'post';

        if (isPost && date) {
          const targetDay = date.slice(0, 10);

          const count = tasks.filter(task =>
            (task.type || 'post') === 'post' &&
            task.date &&
            String(task.date).slice(0, 10) === targetDay
          ).length;

          if (count >= 4) {
            window.studioToast(
              'Maximum 4 planned posts per day. Choose another date or time.'
            );
            return;
          }
        }

        const channel = $('taskChannel');

        tasks.push({
          id: Date.now(),
          title,
          date,
          type: $('taskType')?.value || 'post',
          postText: title,
          channelUrl: channel?.value || '',
          channelName:
            channel?.selectedOptions?.[0]?.textContent || '',
          notes: $('taskNotes')?.value?.trim() || '',
          days,
          repeatWeekly: !!$('taskRepeat')?.checked,
          priority: $('taskPriority')?.value || 'normal',
          reminderMinutes: Number($('taskReminder')?.value || 0),
          mediaId: media?.value || '',
          mediaName:
            media?.selectedOptions?.[0]?.dataset?.name || '',
          mediaKind:
            media?.selectedOptions?.[0]?.dataset?.kind || '',
          done: false
        });

        if (!set('tasks', tasks)) {
          window.studioToast('Could not save Planner item.');
          return;
        }

        form.reset();

        const preview = $('taskMediaPreview');

        if (preview) {
          preview.hidden = true;
          preview.innerHTML = '';
        }

        renderTasks();
        refreshHome();

        window.studioToast('Planner item saved.');
      });
    }

    $('enableNotifications')?.addEventListener('click', async () => {
      const result = await window.StudioNotify.request();

      if ($('notificationStatus')) {
        $('notificationStatus').textContent =
          typeof result === 'string'
            ? result
            : `Notification permission: ${result}`;
      }

      window.studioToast(
        typeof result === 'string'
          ? result
          : `Notification permission: ${result}`
      );
    });

    $('taskFilter')?.addEventListener('change', renderTasks);

    renderTasks();
  }

  function renderTasks() {
    const element = $('taskList');

    // Avoid sorting or processing tasks on pages without a task list.
    if (!element) return;

    const filter = $('taskFilter')?.value || 'all';

    const tasks = get('tasks')
      .map((task, index) => ({
        ...task,
        _i: index
      }))
      .filter(task =>
        filter === 'all' ||
        (filter === 'pending' && !task.done) ||
        (filter === 'done' && !!task.done) ||
        task.type === filter
      );

    const dayNames = [
      'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday', 'Sunday'
    ];

    const order = task => {
      const days = task.days || [];

      return days.length
        ? Math.min(
            ...days.map(day => dayNames.indexOf(day))
              .filter(index => index >= 0)
          )
        : 7;
    };

    tasks.sort((a, b) =>
      order(a) - order(b) ||
      String(a.date || '').localeCompare(String(b.date || ''))
    );

    element.innerHTML = tasks.length
      ? tasks.map(task => {
          const days = (task.days || []).join(', ');

          const schedule = days
            ? `${days}${task.repeatWeekly ? ' · repeats weekly' : ''}`
            : task.date
              ? new Date(task.date).toLocaleString()
              : 'No schedule';

          const media = task.mediaName
            ? `<p class="small muted">
                📎 ${esc(task.mediaKind || 'Media')}: ${esc(task.mediaName)}
              </p>`
            : '';

          const reminder = task.date &&
            task.reminderMinutes !== undefined
            ? `<p class="small muted">
                🔔 Alert: ${
                  task.reminderMinutes === 0
                    ? 'at scheduled time'
                    : task.reminderMinutes < 60
                      ? task.reminderMinutes + ' minutes before'
                      : task.reminderMinutes === 60
                        ? '1 hour before'
                        : task.reminderMinutes === 1440
                          ? '1 day before'
                          : (task.reminderMinutes / 60) + ' hours before'
                }
              </p>`
            : '';

          return `
            <article class="list-item stage4-task priority-${esc(task.priority || 'normal')}">

              <div class="stage4-task-title">
                <h3>${esc(task.title)}</h3>

                <span class="priority-pill priority-${esc(task.priority || 'normal')}">
                  ${esc((task.priority || 'normal').replace(/^./, c => c.toUpperCase()))}
                  priority
                </span>
              </div>

              <p>${esc(schedule)} · ${esc(task.type || 'task')}</p>

              ${reminder}

              ${task.notes
                ? `<p>${esc(task.notes)}</p>`
                : ''
              }

              ${media}

              <p class="small muted">
                ${task.done ? 'Completed' : 'Upcoming'}
              </p>

              <div class="item-actions">
                <button class="button ghost" data-done="${task._i}">
                  ${task.done ? 'Mark pending' : 'Mark complete'}
                </button>

                <button class="button ghost"
                  data-remove="tasks"
                  data-id="${task._i}">
                  Delete
                </button>
              </div>

            </article>
          `;
        }).join('')
      : `
        <div class="empty-state">
          No reminders match this filter. Choose weekdays and attach media to plan your next post.
        </div>
      `;
  }

  /* CHANNELS */

  function setupChannels() {
    const form = $('channelForm');

    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();

        const channels = get('channels');

        channels.push({
          name: $('channelName').value.trim(),
          role: $('channelRole').value,
          url: $('channelUrl').value.trim(),
          date: new Date().toLocaleDateString()
        });

        if (!set('channels', channels)) {
          window.studioToast('Could not save channel.');
          return;
        }

        form.reset();

        renderChannels();
        refreshHome();

        window.studioToast('Channel link saved.');
      });
    }

    renderChannels();
  }

  function renderChannels() {
    renderList(
      'channelList',
      'channels',
      (channel, index) => item(
        channel.name,
        channel.role === 'my'
          ? 'My channel'
          : channel.role === 'source'
            ? 'Source / partner channel'
            : 'Other channel',
        channel.date,
        channel.url,
        'channels',
        index
      ),
      'No channels saved yet. Add one above.'
    );
  }

  /* PROMOTIONS */

  function setupHype() {
    const form = $('hypeForm');

    const make = () => {
      const title =
        $('hypeTitle')?.value.trim() || 'Channel advertisement';

      const caption = $('hypeCaption')?.value.trim() || '';
      const link = $('hypeLink')?.value.trim() || '';
      const source = $('hypeSource')?.value.trim() || '';
      const destination = $('hypeDestination')?.value.trim() || '';

      return `${title}

${caption}${source ? '\n\nFrom: ' + source : ''}${destination ? '\nFor: ' + destination : ''}${link ? '\n\nLink: ' + link : ''}`;
    };

    function preview() {
      if (!$('adPreview')) return;

      $('adPreview').hidden = false;

      $('adPreviewTitle').textContent =
        $('hypeTitle').value.trim() || 'Channel advertisement';

      $('adPreviewCaption').textContent =
        $('hypeCaption').value.trim() ||
        'Add your promotional message above.';

      $('adPreviewLink').textContent =
        $('hypeLink').value.trim();
    }

    $('previewAd')?.addEventListener('click', preview);

    $('copyAd')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(make());

        window.studioToast('Advertisement copied.');
      } catch (error) {
        window.studioToast(
          'Copy is blocked by this browser. Select and copy the preview text manually.'
        );
      }

      preview();
    });

    if (form) {
      form.addEventListener('submit', event => {
        event.preventDefault();

        const hypes = get('hypes');

        hypes.push({
          title: $('hypeTitle').value.trim(),
          source: $('hypeSource').value.trim(),
          destination: $('hypeDestination').value.trim(),
          link: $('hypeLink').value.trim(),
          caption: $('hypeCaption').value.trim(),
          mediaId: $('hypeMediaSelect')?.value || '',
          mediaName:
            $('hypeMediaSelect')?.selectedOptions?.[0]?.textContent || '',
          status: $('hypeStatus').value,
          date: new Date().toLocaleString()
        });

        if (!set('hypes', hypes)) {
          window.studioToast('Could not save promotion.');
          return;
        }

        form.reset();

        preview();
        renderHypes();

        window.studioToast(
          'Promotion saved locally. Publish manually in WhatsApp.'
        );
      });
    }

    renderHypes();
  }

  function renderHypes() {
    renderList(
      'hypeList',
      'hypes',
      (hype, index) => item(
        hype.title,
        hype.caption,
        `${hype.status} · ${hype.date}${hype.mediaId ? ' · Media: ' + (hype.mediaName || 'attached') : ''}`,
        hype.link,
        'hypes',
        index
      ),
      'No promotions saved yet. Create an advertisement above.'
    );
  }

  /* BACKUP */

  /* =====================================================
   BACKUP SYSTEM — STORY STUDIO
   Version 2.0
   Supports new and legacy JSON backups
===================================================== */

function getAll() {
  return store().all();
}

function setupBackup() {
  const exportButton = $('exportBackup');
  const restoreButton = $('restoreBackup');
  const fileInput = $('backupFile');
  const status = $('backupStatus');
  const exportStatus = $('exportStatus');
  const fileInfo = $('selectedBackupInfo');

  const MAX_BACKUP_SIZE = 25 * 1024 * 1024;

  function showStatus(message, isError = false) {
    if (status) {
      status.textContent = message;
      status.style.color = isError ? '#dc5656' : '';
    }

    if (window.studioToast) {
      window.studioToast(message);
    }
  }

  function setButtonLoading(button, loading, normalText) {
    if (!button) return;

    button.disabled = loading;
    button.textContent = loading
      ? 'Please wait...'
      : normalText;
  }

  function validateData(data) {
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      throw new Error('Invalid backup structure.');
    }

    const entries = Object.entries(data);

    if (!entries.length) {
      throw new Error('The backup contains no saved data.');
    }

    for (const [key, value] of entries) {
      if (
        typeof key !== 'string' ||
        !key.trim() ||
        key.length > 200
      ) {
        throw new Error('Invalid backup record name.');
      }

      if (value === undefined) {
        throw new Error('Backup contains an invalid value.');
      }

      JSON.stringify(value);
    }

    return data;
  }

  function createBackup() {
    const data = getAll();

    const backup = {
      application: 'Story Studio',
      format: 'story-studio-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      records: data
    };

    return backup;
  }

  /* EXPORT */

  exportButton?.addEventListener('click', () => {
    try {
      setButtonLoading(
        exportButton,
        true,
        'Download full backup'
      );

      const backup = createBackup();

      const json = JSON.stringify(backup, null, 2);

      const blob = new Blob(
        [json],
        { type: 'application/json' }
      );

      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');

      const date = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');

      link.href = url;
      link.download = `story-studio-backup-${date}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1500);

      const count = Object.keys(backup.records).length;

      const message =
        `Backup exported successfully. ${count} data sections included.`;

      if (exportStatus) {
        exportStatus.textContent = message;
      }

      window.studioToast?.('Backup downloaded successfully.');

    } catch (error) {
      console.error('Backup export failed:', error);

      if (exportStatus) {
        exportStatus.textContent =
          'Backup export failed. Check browser storage.';
      }

      window.studioToast?.('Could not create backup.');

    } finally {
      setButtonLoading(
        exportButton,
        false,
        'Download full backup'
      );
    }
  });

  /* SELECTED FILE INFORMATION */

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];

    if (!file) {
      if (fileInfo) {
        fileInfo.textContent = 'No backup file selected.';
      }
      return;
    }

    if (fileInfo) {
      const size = (file.size / 1024).toFixed(1);

      fileInfo.textContent =
        `${file.name} • ${size} KB`;
    }

    if (status) {
      status.textContent = '';
    }
  });

  /* RESTORE */

  restoreButton?.addEventListener('click', async () => {
    const file = fileInput?.files?.[0];

    if (!file) {
      showStatus('Choose a backup JSON file first.', true);
      return;
    }

    if (file.size > MAX_BACKUP_SIZE) {
      showStatus(
        'This backup is too large. Maximum supported size is 25 MB.',
        true
      );
      return;
    }

    if (!file.name.toLowerCase().endsWith('.json')) {
      showStatus('Please select a JSON backup file.', true);
      return;
    }

    const confirmed = window.confirm(
      'Restore this backup?\n\n' +
      'Your current local app data will be replaced. ' +
      'Make sure you have downloaded a backup of your current data first.'
    );

    if (!confirmed) return;

    setButtonLoading(
      restoreButton,
      true,
      'Restore selected backup'
    );

    try {
      const text = await file.text();

      const parsed = JSON.parse(text);

      let importedData;

      // Version 2 backup format.
      if (
        parsed &&
        parsed.format === 'story-studio-backup' &&
        parsed.application === 'Story Studio'
      ) {
        importedData = parsed.records;
      } else {
        // Support older backups that stored
        // the records directly in the JSON object.
        importedData = parsed;
      }

      validateData(importedData);

      const storage = store();

      if (
        !storage ||
        typeof storage.all !== 'function' ||
        typeof storage.set !== 'function' ||
        typeof storage.remove !== 'function'
      ) {
        throw new Error('Local storage service is unavailable.');
      }

      // Save a recovery snapshot before modifying anything.
      const previousData = storage.all();

      const previousKeys = Object.keys(previousData);

      try {
        // Remove current records first.
        previousKeys.forEach(key => {
          storage.remove(key);
        });

        // Restore all imported records.
        for (const [key, value] of Object.entries(importedData)) {
          const saved = storage.set(key, value);

          if (saved !== true) {
            throw new Error(
              `Could not restore record: ${key}`
            );
          }
        }

        // Verify the restored records.
        const restoredData = storage.all();

        for (const key of Object.keys(importedData)) {
          if (
            !Object.prototype.hasOwnProperty.call(
              restoredData,
              key
            )
          ) {
            throw new Error(
              `Restore verification failed: ${key}`
            );
          }
        }

      } catch (restoreError) {
        console.error(
          'Restore failed. Attempting recovery.',
          restoreError
        );

        // Attempt to return the device to its previous state.
        Object.keys(storage.all()).forEach(key => {
          storage.remove(key);
        });

        for (const [key, value] of Object.entries(previousData)) {
          storage.set(key, value);
        }

        throw restoreError;
      }

      showStatus(
        'Backup restored successfully. Refreshing app...'
      );

      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('Backup restore failed:', error);

      showStatus(
        error.message || 'Could not restore this backup.',
        true
      );

    } finally {
      setButtonLoading(
        restoreButton,
        false,
        'Restore selected backup'
      );
    }
  });
}
  /* SETTINGS */

  function setupSettings() {
    $('saveSettings')?.addEventListener('click', () => {
      set('theme', $('themeSelect')?.value || 'system');
      set('font', $('fontSelect')?.value || 'modern');
      set('motion', $('motionSelect')?.value || 'full');

      window.applyStudioTheme?.();

      if ($('settingsStatus')) {
        $('settingsStatus').textContent =
          'Appearance saved on this device.';
      }

      window.studioToast('Appearance saved.');
    });

    $('quickTheme')?.addEventListener('click', () => {
      const current =
        document.body.dataset.theme === 'dark'
          ? 'light'
          : 'dark';

      set('theme', current);

      window.applyStudioTheme?.();

      window.studioToast(`Switched to ${current} theme.`);
    });

    if ($('toneSelect')) {
      $('toneSelect').value = get('notificationTone', 'chime');
      $('toneEnabled').checked =
        get('notificationToneEnabled', true);

      $('toneSelect').addEventListener('change', () => {
        set('notificationTone', $('toneSelect').value);
      });

      $('toneEnabled').addEventListener('change', () => {
        set(
          'notificationToneEnabled',
          $('toneEnabled').checked
        );

        if ($('toneStatus')) {
          $('toneStatus').textContent =
            $('toneEnabled').checked
              ? 'Notification sounds are on.'
              : 'Notification sounds are off.';
        }
      });

      $('testTone')?.addEventListener('click', () => {
        set('notificationTone', $('toneSelect').value);
        set(
          'notificationToneEnabled',
          $('toneEnabled').checked
        );

        const result =
          window.StudioNotify?.playTone?.(true);

        if ($('toneStatus')) {
          $('toneStatus').textContent = result
            ? 'Playing test tone. If you cannot hear it, check your media volume.'
            : 'This browser could not play the tone. Try tapping Test sound again.';
        }
      });
    }

    if ($('storageInfo')) {
      try {
        $('storageInfo').textContent =
          `${Object.keys(getAll()).length} local data categories · stored in this browser`;
      } catch (error) {
        console.warn('Storage information unavailable.', error);
      }
    }
  }

  /* NOTIFICATIONS PAGE */

  function setupNotifications() {
    $('requestPermission')?.addEventListener('click', async () => {
      const result = await window.StudioNotify.request();

      if ($('permissionBadge')) {
        $('permissionBadge').textContent =
          typeof result === 'string'
            ? result
            : `Permission: ${result}`;
      }
    });

    renderList(
      'notificationTasks',
      'tasks',
      (task, index) => item(
        task.title,
        task.date,
        task.notes,
        '',
        'tasks',
        index
      ),
      'No reminders saved yet.'
    );
  }

  /* INITIALIZATION */

 /* INITIALIZATION */

function initializeApplication() {
  wireTaskCompletion();

  // Stories page
  if (
    $('storyForm') ||
    $('storyList') ||
    $('splitStory')
  ) {
    setupStories();
  }

  // Episode splitter
  if ($('splitForm')) {
    setupEpisodes();
  }

  // Planner
  if (
    $('taskForm') ||
    $('taskList') ||
    $('taskFilter') ||
    $('enableNotifications')
  ) {
    setupPlanner();
  }

  // Channels
  if ($('channelForm') || $('channelList')) {
    setupChannels();
  }

  // Promotions
  if ($('hypeForm') || $('hypeList')) {
    setupHype();
  }

  // Backup
  if ($('exportBackup') || $('restoreBackup')) {
    setupBackup();
  }

  // Settings
  if (
    $('saveSettings') ||
    $('quickTheme') ||
    $('toneSelect') ||
    $('storageInfo')
  ) {
    setupSettings();
  }

  // Notifications
  if ($('requestPermission') || $('notificationTasks')) {
    setupNotifications();
  }

  // Home statistics and saved content
  if (
    $('storyCount') ||
    $('taskCount') ||
    $('channelCount') ||
    $('homeTasks')
  ) {
    refreshHome();
  }

  // Navigation highlighting
  const currentPage = location.pathname.split('/').pop();

  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });

  // Mobile sidebar
  const menuToggle = $('menuToggle');
  const sidebar = document.querySelector('.sidebar');

  if (menuToggle && sidebar && !menuToggle.dataset.wired) {
    menuToggle.dataset.wired = '1';

    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', event => {
      if (
        sidebar.classList.contains('open') &&
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        sidebar.classList.remove('open');
      }
    });
  }

  // Service worker
  if (
    'serviceWorker' in navigator &&
    location.protocol.startsWith('http')
  ) {
    navigator.serviceWorker
      .register('service-worker.js')
      .catch(error => {
        console.warn('Offline cache not available', error);
      });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    initializeApplication,
    { once: true }
  );
} else {
  initializeApplication();
}
 
})();
