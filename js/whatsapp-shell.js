
(() => {
  'use strict';

  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  // Main bottom navigation
  const items = [
    ['home.html', 'Home', '⌂'],
    ['stories.html', 'Stories', '▤'],
    ['episodes.html', 'Episodes', '▥'],
    ['planner.html', 'Planner', '◷'],
    ['settings.html', 'Settings', '⚙']
  ];

  // Keep the welcome screen free of the app taskbar.
  if (
    document.body.classList.contains('welcome-page') ||
    page === 'index.html'
  ) {
    document.querySelectorAll('.wa-bottom-nav').forEach(el => el.remove());
    return;
  }

  const header = document.querySelector('.topbar');

  if (header) {
    const actions = header.querySelector('.topbar-actions') || header;

    // Search bar
    if (!header.querySelector('.wa-search-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'wa-search-wrap';

      wrap.innerHTML = `
        <span class="wa-search-icon">⌕</span>
        <input
          class="wa-search"
          type="search"
          placeholder="Search Channel Studio"
          aria-label="Search Channel Studio"
        >
      `;

      header.insertBefore(
        wrap,
        actions === header ? null : actions
      );

      wrap.querySelector('input').addEventListener('input', event => {
        search(event.target.value);
      });
    }

    // Three-dot menu
    if (!header.querySelector('.wa-menu-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'wa-menu-wrap';

      wrap.innerHTML = `
        <button class="icon-button wa-menu-button" aria-label="More options">
          ⋮
        </button>

        <div class="wa-overflow" hidden>
          <a href="accounts.html">♙ &nbsp; Accounts</a>
          <a href="channels.html">◎ &nbsp; Channels</a>
          <a href="notifications.html">♧ &nbsp; Notifications</a>
          <a href="backup.html">▣ &nbsp; Backup & restore</a>
          <a href="settings.html">⚙ &nbsp; Settings</a>
        </div>
      `;

      const button = wrap.querySelector('button');
      const menu = wrap.querySelector('.wa-overflow');

      button.addEventListener('click', event => {
        event.stopPropagation();
        menu.hidden = !menu.hidden;
      });

      document.addEventListener('click', event => {
        if (!wrap.contains(event.target)) {
          menu.hidden = true;
        }
      });

      actions.append(wrap);
    }
  }

  // Create bottom taskbar
  if (!document.querySelector('.wa-bottom-nav')) {
    const nav = document.createElement('nav');

    nav.className = 'wa-bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');

    items.forEach(([url, label, symbol]) => {
      const link = document.createElement('a');

      link.href = url;
      link.className = page === url ? 'active' : '';

      link.innerHTML = `
        <span class="wa-nav-icon">${symbol}</span>
        ${label}
      `;

      nav.append(link);
    });

    document.body.append(nav);
  }

  // Page search
  function search(query) {
    document.querySelectorAll('.wa-search-results').forEach(el => el.remove());

    query = query.trim().toLowerCase();

    if (!query) return;

    const matches = [
      ...document.querySelectorAll(
        'main h1, main h2, main h3, main p, main .card, main .list-item, main button'
      )
    ]
      .filter(element =>
        (element.innerText || '').toLowerCase().includes(query)
      )
      .slice(0, 12);

    const box = document.createElement('div');
    box.className = 'wa-search-results';

    if (!matches.length) {
      box.textContent = 'No matches on this page.';
    }

    matches.forEach(element => {
      const link = document.createElement('a');

      link.href = '#';
      link.textContent = element.innerText.trim().slice(0, 130);

      link.addEventListener('click', event => {
        event.preventDefault();

        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

        box.remove();
      });

      box.append(link);
    });

    document.body.append(box);
  }
})();
