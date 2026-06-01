import { GAME_CONFIG, getMaxGroupPoints } from './data/config.js';
import { GROUPS } from './data/groups.js';
import {
  formatDateRange,
  getWindowStatus,
  canEditGroupStage,
} from './lib/dates.js';
import {
  createEmptyEntry,
  createEmptyResults,
  validateGroupPredictions,
  rankGroupEntries,
  scoreGroupPredictions,
} from './lib/scoring.js';
import {
  loadState,
  saveState,
  exportEntry,
  importJsonFile,
  addOrUpdateEntry,
} from './lib/storage.js';
import {
  isAdminUnlocked,
  unlockAdmin,
  lockAdmin,
  verifyAdminPin,
} from './lib/admin.js';
import {
  isSharePointConfigured,
  submitToSharePoint,
  getSharePointListHint,
} from './lib/sharepoint.js';
import { assetUrl } from './lib/base.js';

const LOGO_URL = assetUrl('assets/imw-logo.png');

let state = loadState();
let activeTab = 'home';
let toastTimer = null;
let adminPinDraft = '';
let isSubmitting = false;

function ensureEntry() {
  if (!state.entry) {
    state.entry = createEmptyEntry(state.playerName || '');
  }
  if (state.playerName && state.entry.name !== state.playerName) {
    state.entry.name = state.playerName;
  }
  if (state.playerEmail != null && state.entry.email !== state.playerEmail) {
    state.entry.email = state.playerEmail;
  }
  return state.entry;
}

function ensureResults() {
  if (!state.results) {
    state.results = createEmptyResults();
  }
  return state.results;
}

function persist() {
  saveState(state);
  render();
}

function showToast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  if (toastTimer) clearTimeout(toastTimer);

  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  toastTimer = setTimeout(() => toast.remove(), 4000);
}

function groupTeamOptions(group, selected = '', usedCodes = []) {
  const parts = ['<option value="">— Select —</option>'];
  for (const team of group.teams) {
    const disabled =
      usedCodes.includes(team.code) && team.code !== selected ? ' disabled' : '';
    const sel = team.code === selected ? ' selected' : '';
    parts.push(
      `<option value="${team.code}"${sel}${disabled}>${team.name}</option>`
    );
  }
  return parts.join('');
}

function renderStatusBadge(windowKey) {
  const status = getWindowStatus(windowKey);
  return `<span class="status-badge ${status.state}">${status.label}</span>`;
}

function collectGroupPicksFromDom(entry) {
  document.querySelectorAll('[data-group-pos]').forEach((sel) => {
    const [groupId, idx] = sel.dataset.groupPos.split(':');
    entry.groups[groupId][Number(idx)] = sel.value;
  });
  return entry;
}

function countCompletedGroups(groups) {
  return GROUPS.filter((g) => {
    const picks = groups[g.id] ?? [];
    return picks.length === 4 && picks.every(Boolean);
  }).length;
}

function renderHome() {
  const maxPts = getMaxGroupPoints();
  const groupWindow = GAME_CONFIG.windows.groupStage;

  return `
    <section class="hero-banner">
      <h1>2026 FIFA World Cup Pool</h1>
      <p class="tagline">${GAME_CONFIG.tagline}</p>
      <p class="subtitle">${GAME_CONFIG.subtitle}</p>
    </section>

    <section class="panel">
      <h2>Phase 1 — Group stage predictions</h2>
      <p class="muted">
        Rank every team in all 12 groups from <strong>1st through 4th place</strong>.
        Knockout bracket picks open after the group stage window closes.
      </p>
      <div class="callout">
        <strong>Submission window:</strong>
        ${formatDateRange(groupWindow.start, groupWindow.end)}
        &nbsp; ${renderStatusBadge('groupStage')}
      </div>
      ${
        isSharePointConfigured()
          ? `<div class="callout success"><strong>SharePoint connected.</strong> Submit your rankings directly to the <em>${getSharePointListHint()}</em> list.</div>`
          : `<div class="callout warning"><strong>SharePoint pending setup.</strong> An organizer must add the webhook URL in config — see <code>docs/sharepoint-setup.md</code>.</div>`
      }
    </section>

    <section class="panel">
      <h2>How to play</h2>
      <ol class="muted">
        <li>Enter your name and IMW email, then save.</li>
        <li>Open <strong>Group Stage</strong> and rank teams in every group.</li>
        <li>Click <strong>Submit to SharePoint</strong> before ${formatDateRange(groupWindow.start, groupWindow.end).split('–')[1]?.trim() || 'Jun 10'}.</li>
        <li>Track standings on the <strong>Leaderboard</strong> once results are entered.</li>
      </ol>
      <p class="muted">Group stage maximum: <strong>${maxPts} points</strong>.</p>
    </section>

    <section class="panel upcoming-phase">
      <h2>Coming next — Knockout stage</h2>
      <p class="muted">
        After group play ends, you'll pick Round of 32 winners in two windows
        (Jun 25–26 for the first three matches, then Jun 29 for the rest).
        Bracket slots involving third-place teams will be refined once the group stage finishes.
      </p>
    </section>
  `;
}

function renderRules() {
  const g = GAME_CONFIG.scoring.group;

  return `
    <section class="panel">
      <h2>Scoring — Group stage (active now)</h2>
      <ul>
        <li><strong>${g.perPosition} point</strong> for each team in the correct finishing position (1st–4th).</li>
        <li><strong>${g.winnerBonus} bonus point</strong> if you correctly pick the group winner.</li>
        <li>12 groups × up to 5 points = <strong>${getMaxGroupPoints()} points</strong>.</li>
      </ul>

      <h3>Knockout stage (opens later)</h3>
      <p class="muted">
        Round of 32 (1 pt), Round of 16 (2 pts), Quarter-finals (4 pts),
        Semi-finals (8 pts), Final (16 pts). Final score prediction used as tiebreaker only.
      </p>
    </section>
  `;
}

function renderGroups() {
  const entry = ensureEntry();
  const editable = canEditGroupStage() || state.isAdmin;
  const positions = ['1st place', '2nd place', '3rd place', '4th place'];
  const completed = countCompletedGroups(entry.groups);
  const spReady = isSharePointConfigured();

  return `
    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h2>Group stage predictions</h2>
        ${renderStatusBadge('groupStage')}
      </div>
      <p class="muted">
        Rank every team in each group from 1st to 4th.
        Window: ${formatDateRange(GAME_CONFIG.windows.groupStage.start, GAME_CONFIG.windows.groupStage.end)}.
      </p>
      <p class="progress-hint">${completed} of ${GROUPS.length} groups completed</p>
      ${!editable ? '<p class="muted">This window is closed. View-only unless admin is unlocked.</p>' : ''}

      <div class="groups-grid">
        ${GROUPS.map((group) => {
          const picks = entry.groups[group.id] ?? ['', '', '', ''];
          return `
            <article class="group-card" data-group="${group.id}">
              <h3>${group.name}</h3>
              ${positions
                .map(
                  (label, idx) => `
                <div class="position-row">
                  <span class="position-label">${label}</span>
                  <select data-group-pos="${group.id}:${idx}" ${editable ? '' : 'disabled'}>
                    ${groupTeamOptions(group, picks[idx], picks)}
                  </select>
                </div>`
                )
                .join('')}
            </article>`;
        }).join('')}
      </div>

      <div class="actions-row">
        <button class="secondary" id="save-groups" ${editable ? '' : 'disabled'}>Save draft locally</button>
        <button class="primary" id="submit-sharepoint" ${editable && spReady && !isSubmitting ? '' : 'disabled'}>
          ${isSubmitting ? 'Submitting…' : 'Submit to SharePoint'}
        </button>
        <button class="ghost" id="export-entry">Export JSON backup</button>
      </div>
      ${
        !spReady
          ? '<p class="muted">SharePoint submit disabled until webhook URL is configured.</p>'
          : ''
      }
    </section>
  `;
}

function renderKnockoutComingSoon() {
  return `
    <section class="panel coming-soon-panel">
      <h2>Knockout stage</h2>
      <p class="muted">
        Bracket predictions open after the group stage submission window closes.
        Third-place team matchups will be finalized once group results are known.
      </p>
      <div class="timeline" style="max-width:520px;margin:1.5rem auto 0;text-align:left">
        <div class="timeline-item">
          <div><strong>First 3 Round of 32 games</strong></div>
          <div>${formatDateRange(GAME_CONFIG.windows.knockoutEarly.start, GAME_CONFIG.windows.knockoutEarly.end)}</div>
        </div>
        <div class="timeline-item">
          <div><strong>Remaining knockout picks + Final score</strong></div>
          <div>${formatDateRange(GAME_CONFIG.windows.knockoutRest.start, GAME_CONFIG.windows.knockoutRest.end)}</div>
        </div>
      </div>
    </section>
  `;
}

function renderLeaderboard() {
  const results = ensureResults();
  const entries = state.allEntries.length
    ? state.allEntries
    : state.entry?.name
      ? [state.entry]
      : [];

  if (!entries.length) {
    return `
      <section class="panel empty-state">
        <h2>Leaderboard — Group stage</h2>
        <p>No local entries yet. Submissions in SharePoint can be scored here once an admin imports or enters results.</p>
      </section>`;
  }

  const ranked = rankGroupEntries(entries, results);
  const hasResults = Object.values(results.groups).some((g) => g.some(Boolean));

  return `
    <section class="panel">
      <h2>Leaderboard — Group stage</h2>
      ${
        !hasResults
          ? '<p class="muted">Enter actual group results in Admin to calculate scores.</p>'
          : ''
      }
      <table class="score-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Group pts</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          ${ranked
            .map(
              (row) => `
            <tr>
              <td class="leaderboard-rank">${row.rank}</td>
              <td>${row.name}</td>
              <td><strong>${row.groupPoints}</strong></td>
              <td class="muted">${getMaxGroupPoints()}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </section>
  `;
}

function renderAdminPinGate() {
  return `
    <section class="panel">
      <h2>Admin access</h2>
      <p class="muted">Enter the organizer PIN to manage results and override submission windows.</p>
      <div class="pin-gate">
        <input type="password" id="admin-pin-input" placeholder="Admin PIN" maxlength="12" autocomplete="off" />
        <button class="primary" id="admin-pin-submit">Unlock admin</button>
      </div>
    </section>
  `;
}

function renderAdmin() {
  if (!isAdminUnlocked()) {
    return renderAdminPinGate();
  }

  const results = ensureResults();
  const entryCount = state.allEntries.length;

  return `
    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h2>Admin</h2>
        <button class="ghost" id="admin-lock">Lock admin</button>
      </div>
      <p class="muted">Enter official group results, import SharePoint exports, and preview scores.</p>

      <h3>Import / export</h3>
      <div class="actions-row">
        <button class="secondary" id="import-entry">Import entry JSON</button>
        <button class="secondary" id="register-entry">Add current picks to local pool</button>
        <button class="ghost" id="export-entry">Export current entry</button>
      </div>

      <h3>Local pool entries (${entryCount})</h3>
      ${
        entryCount
          ? `<ul class="muted">${state.allEntries.map((e) => `<li>${e.name}${e.email ? ` &lt;${e.email}&gt;` : ''}</li>`).join('')}</ul>`
          : '<p class="muted">Import JSON files exported from SharePoint or player backups.</p>'
      }

      <h3>Official group results</h3>
      <p class="muted">Set the actual 1st–4th finish for each group to score the leaderboard.</p>
      <div class="groups-grid">
        ${GROUPS.map((group) => {
          const picks = results.groups[group.id] ?? ['', '', '', ''];
          const positions = ['1st', '2nd', '3rd', '4th'];
          return `
            <article class="group-card">
              <h3>${group.name}</h3>
              ${positions
                .map(
                  (label, idx) => `
                <div class="position-row">
                  <span class="position-label">${label}</span>
                  <select data-result-group="${group.id}:${idx}">
                    ${groupTeamOptions(group, picks[idx], picks)}
                  </select>
                </div>`
                )
                .join('')}
            </article>`;
        }).join('')}
      </div>
      <div class="actions-row">
        <button class="primary" id="save-results">Save group results</button>
        <button class="ghost" id="clear-results">Clear results</button>
      </div>

      ${
        state.entry?.name
          ? (() => {
              const preview = scoreGroupPredictions(
                state.entry.groups,
                results.groups
              );
              return `<p class="muted" style="margin-top:1rem">Preview — ${state.entry.name}: ${preview.points} / ${preview.maxPoints} group pts</p>`;
            })()
          : ''
      }
    </section>
  `;
}

function renderTabContent() {
  switch (activeTab) {
    case 'rules':
      return renderRules();
    case 'groups':
      return renderGroups();
    case 'knockout':
      return renderKnockoutComingSoon();
    case 'leaderboard':
      return renderLeaderboard();
    case 'admin':
      return renderAdmin();
    default:
      return renderHome();
  }
}

function render() {
  const app = document.getElementById('app');
  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'rules', label: 'Rules' },
    { id: 'groups', label: 'Group Stage' },
    { id: 'knockout', label: 'Knockout', soon: true },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'admin', label: 'Admin' },
  ];

  state.isAdmin = isAdminUnlocked();

  app.innerHTML = `
    <div class="site-topbar">
      <div class="site-topbar-inner">
        <a href="${GAME_CONFIG.website}" target="_blank" rel="noopener">
          <img src="${LOGO_URL}" alt="IMW Industries" width="120" height="42" />
        </a>
        <a class="org-link" href="${GAME_CONFIG.website}" target="_blank" rel="noopener">imw.ca</a>
      </div>
    </div>

    <header class="app-header">
      <div class="player-bar">
        <label>Name
          <input type="text" id="player-name" placeholder="Your name" value="${state.playerName || ''}" maxlength="60" />
        </label>
        <label>IMW email
          <input type="email" id="player-email" placeholder="you@imw.ca" value="${state.playerEmail || ''}" maxlength="120" />
        </label>
        <button class="secondary" id="save-name" style="align-self:end">Save</button>
      </div>
    </header>

    <nav class="tabs">
      ${tabs
        .map((t) => {
          if (t.soon && activeTab !== t.id) {
            return `<button type="button" data-tab="${t.id}" class="${activeTab === t.id ? 'active' : ''}" title="Opens after group stage">${t.label}</button>`;
          }
          return `<button type="button" data-tab="${t.id}" class="${activeTab === t.id ? 'active' : ''}">${t.label}</button>`;
        })
        .join('')}
    </nav>

    <main>${renderTabContent()}</main>

    <footer>
      <a href="${GAME_CONFIG.website}" target="_blank" rel="noopener">${GAME_CONFIG.organization}</a>
      · FIFA World Cup 2026 · Canada / Mexico / USA
    </footer>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      render();
    });
  });

  document.getElementById('save-name')?.addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    const email = document.getElementById('player-email').value.trim();
    if (!name) {
      showToast('Please enter your name.', true);
      return;
    }
    state.playerName = name;
    state.playerEmail = email;
    const entry = ensureEntry();
    entry.name = name;
    entry.email = email;
    persist();
    showToast(`Saved — ${name}`);
  });

  document.getElementById('save-groups')?.addEventListener('click', () => {
    const entry = collectGroupPicksFromDom(ensureEntry());
    const error = validateGroupPredictions(entry.groups);
    if (error) {
      showToast(error, true);
      return;
    }
    state.entry = entry;
    persist();
    showToast('Draft saved on this device.');
  });

  document.getElementById('submit-sharepoint')?.addEventListener('click', async () => {
    const entry = collectGroupPicksFromDom(ensureEntry());
    if (!entry.name) {
      showToast('Save your name first.', true);
      return;
    }
    const error = validateGroupPredictions(entry.groups);
    if (error) {
      showToast(error, true);
      return;
    }

    isSubmitting = true;
    render();

    try {
      await submitToSharePoint(entry);
      state.entry = entry;
      saveState(state);
      showToast(`Submitted to SharePoint — ${entry.name}`);
    } catch (err) {
      showToast(err.message || 'SharePoint submission failed.', true);
    } finally {
      isSubmitting = false;
      render();
    }
  });

  document.querySelectorAll('[data-group-pos]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const card = sel.closest('.group-card');
      const groupId = card.dataset.group;
      const group = GROUPS.find((g) => g.id === groupId);
      const selects = card.querySelectorAll('[data-group-pos]');
      const used = Array.from(selects)
        .map((s) => s.value)
        .filter(Boolean);
      selects.forEach((s) => {
        s.innerHTML = groupTeamOptions(group, s.value, used);
      });
    });
  });

  document.getElementById('admin-pin-submit')?.addEventListener('click', () => {
    const pin = document.getElementById('admin-pin-input')?.value ?? adminPinDraft;
    if (verifyAdminPin(pin, GAME_CONFIG.adminPin)) {
      unlockAdmin();
      showToast('Admin unlocked for this session.');
      render();
    } else {
      showToast('Incorrect PIN.', true);
    }
  });

  document.getElementById('admin-pin-input')?.addEventListener('input', (e) => {
    adminPinDraft = e.target.value;
  });

  document.getElementById('admin-pin-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('admin-pin-submit')?.click();
    }
  });

  document.getElementById('admin-lock')?.addEventListener('click', () => {
    lockAdmin();
    state.isAdmin = false;
    showToast('Admin locked.');
    render();
  });

  document.getElementById('register-entry')?.addEventListener('click', () => {
    const entry = ensureEntry();
    if (!entry.name) {
      showToast('Save your name first.', true);
      return;
    }
    state.allEntries = addOrUpdateEntry(state.allEntries, entry);
    persist();
    showToast(`${entry.name} added to local pool.`);
  });

  document.getElementById('export-entry')?.addEventListener('click', () => {
    const entry = collectGroupPicksFromDom(ensureEntry());
    if (!entry.name) {
      showToast('Save your name first.', true);
      return;
    }
    exportEntry(entry);
    showToast('JSON backup downloaded.');
  });

  document.getElementById('import-entry')?.addEventListener('click', async () => {
    try {
      const data = await importJsonFile();
      if (!data?.name || !data?.groups) {
        throw new Error('Invalid entry file');
      }
      state.allEntries = addOrUpdateEntry(state.allEntries, data);
      persist();
      showToast(`Imported ${data.name} into local pool.`);
    } catch (err) {
      showToast(err.message || 'Import failed.', true);
    }
  });

  document.getElementById('save-results')?.addEventListener('click', () => {
    const results = ensureResults();
    document.querySelectorAll('[data-result-group]').forEach((sel) => {
      const [groupId, idx] = sel.dataset.resultGroup.split(':');
      results.groups[groupId][Number(idx)] = sel.value;
    });
    results.updatedAt = new Date().toISOString();
    state.results = results;
    persist();
    showToast('Group results saved.');
  });

  document.getElementById('clear-results')?.addEventListener('click', () => {
    state.results = createEmptyResults();
    persist();
    showToast('Results cleared.');
  });

  document.querySelectorAll('[data-result-group]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const card = sel.closest('.group-card');
      const groupId = sel.dataset.resultGroup.split(':')[0];
      const group = GROUPS.find((g) => g.id === groupId);
      const selects = card.querySelectorAll('[data-result-group]');
      const used = Array.from(selects)
        .map((s) => s.value)
        .filter(Boolean);
      selects.forEach((s) => {
        s.innerHTML = groupTeamOptions(group, s.value, used);
      });
    });
  });
}

render();
