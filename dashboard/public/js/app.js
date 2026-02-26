(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    csrf: null,
    me: null,
  };

  function toast(title, message, type = 'info') {
    const root = document.getElementById('toast-root');
    if (!root) return;

    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="toast-title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast-sub">${escapeHtml(message)}</div>` : ''}
    `;

    if (type === 'error') {
      el.style.borderColor = 'rgba(220,38,38,.35)';
    }

    root.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(4px)';
      el.style.transition = 'all .2s ease';
      setTimeout(() => el.remove(), 220);
    }, 3200);
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function api(path, opts = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {}
    );

    const method = (opts.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && state.csrf) {
      headers['X-CSRF-Token'] = state.csrf;
    }

    const res = await fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers,
    });

    const newCsrf = res.headers.get('X-CSRF-Token');
    if (newCsrf) state.csrf = newCsrf;

    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = typeof body === 'string' ? body : body?.error || 'Request failed';
      throw new Error(msg);
    }

    return body;
  }

  function setTheme(next) {
    const root = document.documentElement;
    if (next === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('bright_theme', next);
    } catch (e) {}
  }

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    setTheme(next);
    toast('Theme updated', next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled');
  }

  function setupUserMenu() {
    const btn = $('[data-action="user-menu"]');
    const menu = $('[data-user-menu]');
    if (!btn || !menu) return;

    function close() {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const open = menu.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function setupInviteCTA() {
    const btn = $('[data-action="invite"]');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      try {
        const url =
          'https://discord.com/api/oauth2/authorize?client_id=1457843538401300480&scope=bot+applications.commands&permissions=8';
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        toast('Invite failed', e.message, 'error');
      }
    });
  }

  function hydrateMe() {
    if (!state.me) return;
    const emailEl = $('[data-me="email"]');
    const guildEl = $('[data-me="guildCount"]');
    if (emailEl) emailEl.textContent = state.me.discord.email || 'Not available';
    if (guildEl) guildEl.textContent = String(state.me.app.guildCount ?? 0);
  }

  function setupAccountPage() {
    const exportBtn = $('[data-action="export-data"]');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          exportBtn.disabled = true;
          exportBtn.textContent = 'Exporting…';
          const data = await api('/api/account/export', { method: 'POST', body: JSON.stringify({}) });
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'bright-account-export.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast('Export ready', 'Downloaded your data as JSON.');
        } catch (e) {
          toast('Export failed', e.message, 'error');
        } finally {
          exportBtn.disabled = false;
          exportBtn.textContent = 'Export my data';
        }
      });
    }

    const deleteBtn = $('[data-action="delete-account"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const confirmText = prompt('Type DELETE to permanently remove your dashboard data.');
        if (confirmText !== 'DELETE') {
          toast('Cancelled', 'Account deletion was not confirmed.');
          return;
        }

        try {
          deleteBtn.disabled = true;
          deleteBtn.textContent = 'Deleting…';
          await api('/api/account/delete', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) });
          toast('Account deleted', 'Redirecting to login…');
          setTimeout(() => (window.location.href = '/'), 800);
        } catch (e) {
          toast('Delete failed', e.message, 'error');
        } finally {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Delete account';
        }
      });
    }

    const signoutAllBtn = $('[data-action="signout-all"]');
    if (signoutAllBtn) {
      signoutAllBtn.addEventListener('click', async () => {
        const ok = confirm('Sign out all sessions for this account?');
        if (!ok) return;
        try {
          signoutAllBtn.disabled = true;
          signoutAllBtn.textContent = 'Signing out…';
          await api('/api/account/signout-all', { method: 'POST', body: JSON.stringify({}) });
          window.location.href = '/';
        } catch (e) {
          toast('Sign out failed', e.message, 'error');
        } finally {
          signoutAllBtn.disabled = false;
          signoutAllBtn.textContent = 'Sign out all sessions';
        }
      });
    }
  }

  function setupGlobalInteractions() {
    const themeBtn = $('[data-action="toggle-theme"]');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const search = $('[data-global-search]');
    if (search) {
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          toast('Search', 'Global search is not wired yet.');
        }
      });
    }

    const openMobile = $('[data-action="open-mobile-nav"]');
    if (openMobile) {
      openMobile.addEventListener('click', () => {
        let overlay = document.getElementById('mobile-nav-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'mobile-nav-overlay';
          overlay.style.position = 'fixed';
          overlay.style.inset = '0';
          overlay.style.zIndex = '60';
          overlay.innerHTML = `
            <div style="position:absolute;inset:0;background:rgba(0,0,0,.4)"></div>
            <div id="mobile-nav-panel" style="position:absolute;left:0;top:0;bottom:0;width:88vw;max-width:22rem;overflow:auto"></div>
          `;
          document.body.appendChild(overlay);

          overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target === overlay.firstElementChild) {
              overlay.style.display = 'none';
            }
          });

          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') overlay.style.display = 'none';
          });
        }

        const panel = document.getElementById('mobile-nav-panel');
        const sidebar = document.getElementById('sidebar');
        if (panel && sidebar) {
          panel.innerHTML = '';
          const clone = sidebar.cloneNode(true);
          clone.classList.remove('hidden');
          clone.classList.add('block');
          panel.appendChild(clone);
        }

        overlay.style.display = 'block';
      });
    }

    setupUserMenu();
    setupInviteCTA();
  }

  async function bootstrap() {
    try {
      const csrf = await api('/api/csrf');
      state.csrf = csrf.csrfToken;

      state.me = await api('/api/me');
      hydrateMe();

      setupAccountPage();
    } catch (e) {
      toast('Something went wrong', e.message, 'error');
    }
  }

  setupGlobalInteractions();
  bootstrap();
})();
