(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    csrf: null,
    me: null,
    consent: null,
    consentHistoryPage: 1,
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
      {
        'Content-Type': 'application/json',
      },
      opts.headers || {}
    );

    // Attach CSRF token for state-changing requests
    const method = (opts.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && state.csrf) {
      headers['X-CSRF-Token'] = state.csrf;
    }

    const res = await fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers,
    });

    // Refresh CSRF from response header when present
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
        // Use fixed invite URL as configured by the dashboard requirements.
        const url =
          'https://discord.com/api/oauth2/authorize?client_id=1457843538401300480&scope=bot+applications.commands&permissions=8';
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        toast('Invite failed', e.message, 'error');
      }
    });
  }

  async function bootstrap() {
    try {
      // Fetch CSRF token (also primes header refresh)
      const csrf = await api('/api/csrf');
      state.csrf = csrf.csrfToken;

      state.me = await api('/api/me');
      hydrateMe();

      state.consent = await api('/api/consent');
      hydrateConsent();
      maybeShowConsentBanner();

      hydrateOverviewStats();

      setupConsentPage();
      setupAccountPage();
    } catch (e) {
      // If auth fails, the server will redirect; otherwise show banner
      toast('Something went wrong', e.message, 'error');
    }
  }

  function hydrateMe() {
    if (!state.me) return;
    const emailEl = $('[data-me="email"]');
    const guildEl = $('[data-me="guildCount"]');
    if (emailEl) emailEl.textContent = state.me.discord.email || 'Not available';
    if (guildEl) guildEl.textContent = String(state.me.app.guildCount ?? 0);
  }

  function consentEnabledCount(consent) {
    const optionalKeys = ['analytics', 'diagnostics', 'training', 'marketing'];
    let enabled = 1; // essential
    for (const k of optionalKeys) if (consent?.[k]) enabled += 1;
    return enabled;
  }

  function hydrateConsent() {
    if (!state.consent) return;
    const consent = state.consent.consent;

    // Toggle inputs on privacy page
    $$('[data-consent-toggle]').forEach((el) => {
      const key = el.getAttribute('data-consent-toggle');
      el.checked = !!consent[key];
    });

    const updatedAt = $('[data-consent="updatedAt"]');
    const summary = $('[data-consent="summary"]');
    const enabledCount = $('[data-consent="enabledCount"]');

    if (updatedAt) {
      updatedAt.textContent = state.consent.updatedAt
        ? new Date(state.consent.updatedAt).toLocaleString()
        : 'Not set';
    }

    const enabled = consentEnabledCount(consent);

    if (summary) summary.textContent = `${enabled} of 5 enabled`;
    if (enabledCount) enabledCount.textContent = String(enabled);
  }

  function hydrateOverviewStats() {
    const guildCount = $('[data-stat="guildCount"]');
    const consentSummary = $('[data-stat="consentSummary"]');
    if (guildCount) guildCount.textContent = String(state.me?.app?.guildCount ?? 0);

    if (consentSummary) {
      const enabled = consentEnabledCount(state.consent?.consent);
      consentSummary.textContent = `${enabled}/5`;
    }
  }

  function maybeShowConsentBanner() {
    const banner = $('#consent-banner');
    if (!banner || !state.consent) return;

    if (state.consent.hasChoice) return; // already decided

    banner.classList.remove('hidden');

    const handle = async (mode) => {
      try {
        if (mode === 'customize') {
          window.location.href = '/app/privacy-consent';
          return;
        }

        if (mode === 'essential') {
          await api('/api/consent', {
            method: 'PUT',
            body: JSON.stringify({
              analytics: false,
              diagnostics: false,
              training: false,
              marketing: false,
              source: 'banner',
            }),
          });
        }

        if (mode === 'all') {
          await api('/api/consent', {
            method: 'PUT',
            body: JSON.stringify({
              analytics: true,
              diagnostics: true,
              training: false, // opt-in only; keep false even on accept all
              marketing: true,
              source: 'banner',
            }),
          });
        }

        banner.classList.add('hidden');
        state.consent = await api('/api/consent');
        hydrateConsent();
        hydrateOverviewStats();
        toast('Preferences saved', 'You can change these anytime in Privacy & Consent.');
      } catch (e) {
        toast('Could not save', e.message, 'error');
      }
    };

    $$('[data-consent-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const mode = btn.getAttribute('data-consent-action');
        handle(mode);
      });
    });
  }

  function setupConsentPage() {
    const saveBtn = $('[data-action="save-consent"]');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
      try {
        const payload = { source: 'settings' };
        $$('[data-consent-toggle]').forEach((el) => {
          payload[el.getAttribute('data-consent-toggle')] = !!el.checked;
        });

        // training must be opt-in: allow true only if user checked.
        await api('/api/consent', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });

        state.consent = await api('/api/consent');
        hydrateConsent();
        hydrateOverviewStats();
        toast('Saved', 'Your privacy preferences were updated.');
      } catch (e) {
        toast('Save failed', e.message, 'error');
      }
    });

    const downloadBtn = $('[data-action="download-consent"]');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', async () => {
        try {
          const consent = await api('/api/consent');
          const blob = new Blob([JSON.stringify(consent, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'bright-consent.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (e) {
          toast('Download failed', e.message, 'error');
        }
      });
    }

    const toggleHistory = $('[data-action="toggle-history"]');
    const panel = $('[data-panel="history"]');
    if (toggleHistory && panel) {
      toggleHistory.addEventListener('click', async () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
          await loadConsentHistory(1);
        }
      });
    }

    const prev = $('[data-action="history-prev"]');
    const next = $('[data-action="history-next"]');
    if (prev) prev.addEventListener('click', () => loadConsentHistory(Math.max(1, state.consentHistoryPage - 1)));
    if (next) next.addEventListener('click', () => loadConsentHistory(state.consentHistoryPage + 1));
  }

  async function loadConsentHistory(page) {
    const tbody = $('[data-consent-history]');
    const pageLabel = $('[data-consent="historyPage"]');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td class="px-4 py-4" colspan="3"><div class="skeleton" style="height:14px;width:180px"></div></td></tr>`;

    try {
      const res = await api(`/api/consent/history?page=${page}&limit=10`);
      state.consentHistoryPage = res.page;
      if (pageLabel) pageLabel.textContent = `Page ${res.page}`;

      if (!res.items || res.items.length === 0) {
        tbody.innerHTML = `<tr><td class="px-4 py-4 text-zinc-600 dark:text-zinc-300" colspan="3">No history yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.items
        .map((ev) => {
          const when = new Date(ev.changedAt).toLocaleString();
          const changes = (ev.changes || [])
            .map((c) => (c.key === 'consent_created' ? 'Consent created' : `${c.key}: ${c.from} → ${c.to}`))
            .join(', ');
          return `
          <tr class="border-t border-zinc-200 dark:border-zinc-800">
            <td class="px-4 py-4 text-zinc-600 dark:text-zinc-300">${escapeHtml(when)}</td>
            <td class="px-4 py-4">${escapeHtml(changes || '—')}</td>
            <td class="px-4 py-4 text-zinc-600 dark:text-zinc-300">${escapeHtml(ev.version || '')}</td>
          </tr>
        `;
        })
        .join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td class="px-4 py-4 text-red-600" colspan="3">Failed to load history: ${escapeHtml(e.message)}</td></tr>`;
    }
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
    // Theme
    const themeBtn = $('[data-action="toggle-theme"]');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // Search (placeholder)
    const search = $('[data-global-search]');
    if (search) {
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          toast('Search', 'Global search is not wired yet.');
        }
      });
    }

    // Mobile nav: clone desktop sidebar into overlay
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

  setupGlobalInteractions();
  bootstrap();
})();
