import { GAME_CONFIG, getMaxGroupPoints } from './data/config.js';
import { GROUPS } from './data/groups.js';
import {
  formatDateRange,
  getWindowStatus,
  canEditGroupStage,
  isGroupStageClosed,
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
  getLeaderboardEntries,
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
} from './lib/sharepoint.js';
import {
  fetchLeaderboardEntries,
  isLeaderboardFetchConfigured,
} from './lib/leaderboard.js';
import {
  fetchLiveResultsFile,
  getEffectiveResults,
  getResultsLabel,
  hasScoringResults,
  isLiveResultsEnabled,
} from './lib/live-results.js';
import { assetUrl } from './lib/base.js';

const LOGO_URL = assetUrl('assets/imw-logo.png');

let state = loadState();
let activeTab = 'home';
let toastTimer = null;
let adminPinDraft = '';
let isSubmitting = false;
let isFetchingLeaderboard = false;

const LEADERBOARD_CACHE_MS = 60_000;

async function refreshLiveResults(force = false) {
  if (!isLiveResultsEnabled()) return;

  const fetchedAt = state.liveResultsFetchedAt
    ? Date.parse(state.liveResultsFetchedAt)
    : 0;
  const age = Date.now() - fetchedAt;
  const refreshMs = GAME_CONFIG.liveResults?.refreshMs ?? 300_000;
  if (!force && age < refreshMs) return;

  try {
    const payload = await fetchLiveResultsFile();
    if (payload) {
      state.liveResults = payload;
      state.liveResultsFetchedAt = new Date().toISOString();
      saveState(state);
    }
  } catch (err) {
    console.warn('Live results refresh failed:', err);
  } finally {
    if (activeTab === 'leaderboard') render();
  }
}

async function refreshLeaderboard(force = false) {
  if (!isLeaderboardFetchConfigured()) return;

  const fetchedAt = state.leaderboardFetchedAt
    ? Date.parse(state.leaderboardFetchedAt)
    : 0;
  const age = Date.now() - fetchedAt;
  if (!force && age < LEADERBOARD_CACHE_MS) return;
  if (isFetchingLeaderboard) return;

  isFetchingLeaderboard = true;
  if (activeTab === 'leaderboard') render();

  try {
    state.remoteEntries = await fetchLeaderboardEntries();
    state.leaderboardFetchedAt = new Date().toISOString();
    saveState(state);
  } catch (err) {
    console.warn('Leaderboard refresh failed:', err);
  } finally {
    isFetchingLeaderboard = false;
    if (activeTab === 'leaderboard') render();
  }
}

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
  const groupWindow = GAME_CONFIG.windows.groupStage;
  const groupClosed = isGroupStageClosed();

  return `
    <section class="hero-banner">
      <h1>2026 FIFA World Cup Pool</h1>
      <p class="tagline">${GAME_CONFIG.tagline}</p>
      <p class="subtitle">${GAME_CONFIG.subtitle}</p>
    </section>

    ${
      groupClosed
        ? `<section class="panel">
      <div class="callout warning">
        <strong>Group stage entries are closed.</strong>
        The submission window ended ${formatDateRange(groupWindow.start, groupWindow.end)}.
        No further picks will be accepted. See the <strong>Leaderboard</strong> for standings once results are entered.
      </div>
    </section>`
        : ''
    }

    <section class="panel">
      <h2>Phase 1 — Group stage predictions</h2>
      <p class="muted">
        Rank every team in all 12 groups in the order you think they will finish (1st through 4th).
      </p>
      <div class="callout">
        <strong>Submission window:</strong>
        ${formatDateRange(groupWindow.start, groupWindow.end)}
        &nbsp; ${renderStatusBadge('groupStage')}
      </div>
      ${
        groupClosed
          ? ''
          : isSharePointConfigured()
            ? `<div class="callout success"><strong>Ready to submit.</strong> Complete your picks on the Group Stage tab and click <strong>Submit picks</strong>.</div>`
            : `<div class="callout warning"><strong>Submission pending setup.</strong> An organizer must connect SharePoint — see <code>docs/sharepoint-setup.md</code>.</div>`
      }
    </section>

    <section class="panel">
      <h2>How to play</h2>
      <ol class="muted">
        <li>Enter your name and IMW email, then save.</li>
        <li>Click the <strong>Group Stage</strong> tab and rank teams in every group in the order you think they will finish.</li>
        <li>Click <strong>Submit picks</strong> before the submission window closes (${formatDateRange(groupWindow.start, groupWindow.end)}).</li>
        <li>See the <strong>Rules</strong> tab for scoring details.</li>
        <li>Track standings on the <strong>Leaderboard</strong> once results are entered.</li>
      </ol>
    </section>

    <section class="panel upcoming-phase">
      <h2>Coming next — Knockout stage</h2>
      <p class="muted">
        You will only need to pick game winners for this round. The knockout stage is split into two phases since this round begins on a weekend:
      </p>
      <ul class="muted">
        <li><strong>June 25–26:</strong> Pick the winners of the first 3 Round of 32 games.</li>
        <li><strong>June 29:</strong> Pick game winners for the balance of the Round of 32 and all remaining rounds.</li>
        <li><strong>Final score:</strong> Guess the score of the Final game (tiebreaker only).</li>
      </ul>
      <p class="muted">See the <strong>Rules</strong> tab for scoring.</p>
    </section>
  `;
}

function renderRules() {
  const g = GAME_CONFIG.scoring.group;
  const k = GAME_CONFIG.scoring.knockout;

  return `
    <section class="panel">
      <h2>Scoring — Group stage</h2>
      <p class="muted">Points awarded for correctly ranking teams in each group.</p>
      <ul>
        <li><strong>${g.perPosition} point</strong> for each team in the correct finishing position (1st–4th).</li>
        <li><strong>${g.winnerBonus} bonus point</strong> for correctly picking the group winner.</li>
      </ul>

      <h2>Scoring — Knockout stage (opens June 25th)</h2>
      <p class="muted">Points awarded for selecting the correct winner of each game. Point values increase each round:</p>
      <ul>
        <li>Round of 32 — <strong>${k.r32} point</strong></li>
        <li>Round of 16 — <strong>${k.r16} points</strong></li>
        <li>Quarter-finals — <strong>${k.qf} points</strong></li>
        <li>Semi-finals — <strong>${k.sf} points</strong></li>
        <li>Final — <strong>${k.final} points</strong></li>
      </ul>
      <p class="muted">The Final score prediction does not earn points — it is used as a tiebreaker only.</p>

      <h2>Winner</h2>
      <p class="muted">
        The person with the highest combined point total from both the Group and Knockout stages wins the pool.
      </p>
      <p class="muted">
        <strong>Tiebreaker:</strong> If multiple people have the same total points, the score prediction of the Final game will be used.
      </p>
    </section>
  `;
}

function renderGroups() {
  const entry = ensureEntry();
  const editable = canEditGroupStage() || state.isAdmin;
  const groupClosed = isGroupStageClosed();
  const positions = ['1st place', '2nd place', '3rd place', '4th place'];
  const completed = countCompletedGroups(entry.groups);
  const spReady = isSharePointConfigured();

  return `
    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h2>Group stage predictions</h2>
        ${renderStatusBadge('groupStage')}
      </div>
      ${
        groupClosed && !state.isAdmin
          ? `<div class="callout warning"><strong>Group stage entries are closed.</strong> Submissions are no longer accepted. You can still view picks on the <strong>Leaderboard</strong>.</div>`
          : ''
      }
      <p class="muted">
        Rank every team in each group in the order you think they will finish (1st through 4th).
        Submission window: ${formatDateRange(GAME_CONFIG.windows.groupStage.start, GAME_CONFIG.windows.groupStage.end)}.
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
        <button class="primary" id="submit-sharepoint" ${editable && spReady && !isSubmitting ? '' : 'disabled'}>
          ${isSubmitting ? 'Submitting…' : 'Submit picks'}
        </button>
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
        Pick the winning team for each knockout game. The first prediction window opens June 25th — before the on-field group stage has finished.
        Bracket matchups will be set up by the organizer before each pick window opens.
      </p>
      <div class="timeline" style="max-width:560px;margin:1.5rem auto 0;text-align:left">
        <div class="timeline-item">
          <div>
            <strong>Phase 1 — June 25–26</strong>
            <div class="muted">Pick the winners of the first 3 Round of 32 games.</div>
          </div>
          <div>${formatDateRange(GAME_CONFIG.windows.knockoutEarly.start, GAME_CONFIG.windows.knockoutEarly.end)}</div>
        </div>
        <div class="timeline-item">
          <div>
            <strong>Phase 2 — June 29</strong>
            <div class="muted">Pick winners for the balance of the Round of 32 and all remaining rounds, plus the Final score (tiebreaker).</div>
          </div>
          <div>${formatDateRange(GAME_CONFIG.windows.knockoutRest.start, GAME_CONFIG.windows.knockoutRest.end)}</div>
        </div>
      </div>
      <p class="muted" style="margin-top:1rem">See the <strong>Rules</strong> tab for scoring.</p>
    </section>
  `;
}

function renderLeaderboard() {
  const results = getEffectiveResults(state);
  const entries = getLeaderboardEntries(state);
  const hasResults = hasScoringResults(results);
  const resultsLabel = getResultsLabel(results, state.liveResults);

  if (!entries.length && isFetchingLeaderboard) {
    return `
      <section class="panel empty-state">
        <h2>Leaderboard — Group stage</h2>
        <p>Loading entries from OneDrive…</p>
      </section>`;
  }

  if (!entries.length) {
    return `
      <section class="panel empty-state">
        <h2>Leaderboard — Group stage</h2>
        <p>No pool entries yet. Players appear here after they submit picks.</p>
      </section>`;
  }

  const ranked = rankGroupEntries(entries, results);

  return `
    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h2>Leaderboard — Group stage</h2>
        <button class="ghost" id="refresh-leaderboard" ${isFetchingLeaderboard ? 'disabled' : ''}>
          ${isFetchingLeaderboard ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      ${
        isLiveResultsEnabled()
          ? `<p class="muted">${resultsLabel}</p>`
          : !hasResults
            ? '<p class="muted">Enter actual group results in Admin to calculate scores.</p>'
            : ''
      }
      ${
        isLeaderboardFetchConfigured()
          ? `<p class="muted">${entries.length} player${entries.length === 1 ? '' : 's'} · synced from OneDrive</p>`
          : `<p class="muted">${entries.length} player${entries.length === 1 ? '' : 's'} registered</p>`
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
  const effectiveResults = getEffectiveResults(state);
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
      <p class="muted">Override live standings for any group if needed. Leave blank to use automatic live updates on the leaderboard.</p>
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
                effectiveResults.groups
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
      if (activeTab === 'leaderboard') {
        refreshLiveResults(true);
        refreshLeaderboard(true);
      }
    });
  });

  document.getElementById('refresh-leaderboard')?.addEventListener('click', () => {
    refreshLiveResults(true);
    refreshLeaderboard(true);
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
      state.allEntries = addOrUpdateEntry(state.allEntries, entry);
      saveState(state);
      showToast(`Picks submitted — ${entry.name}`);
      await refreshLeaderboard(true);
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
refreshLiveResults(true);
refreshLeaderboard(true);
