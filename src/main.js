import { GAME_CONFIG, getMaxGroupPoints } from './data/config.js';
import { GROUPS, getTeamName } from './data/groups.js';
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
  fetchLiveResults,
  getEffectiveResults,
  getResultsLabel,
  hasScoringResults,
  isLiveResultsEnabled,
} from './lib/live-results.js';
import { assetUrl } from './lib/base.js';

const LOGO_URL = assetUrl('assets/imw-logo.png');

let state = loadState();
let activeTab = 'home';
let expandedLeaderboardKeys = new Set();
let toastTimer = null;
let adminPinDraft = '';
let isSubmitting = false;
let isFetchingLeaderboard = false;
let isFetchingGroupStandings = false;
let liveResultsTimer = null;

const LEADERBOARD_CACHE_MS = 60_000;

async function refreshLiveResults(force = false) {
  if (!isLiveResultsEnabled()) return;

  const fetchedAt = state.liveResultsFetchedAt
    ? Date.parse(state.liveResultsFetchedAt)
    : 0;
  const age = Date.now() - fetchedAt;
  const refreshMs = GAME_CONFIG.liveResults?.refreshMs ?? 120_000;
  if (!force && age < refreshMs) return;

  const affectsUi =
    activeTab === 'leaderboard' || activeTab === 'groups';
  if (activeTab === 'groups') isFetchingGroupStandings = true;
  if (affectsUi) render();

  try {
    const payload = await fetchLiveResults();
    if (payload) {
      state.liveResults = payload;
      state.liveResultsFetchedAt = new Date().toISOString();
      saveState(state);
    }
  } catch (err) {
    console.warn('Live results refresh failed:', err);
  } finally {
    isFetchingGroupStandings = false;
    if (affectsUi) render();
  }
}

function startLiveResultsPolling() {
  stopLiveResultsPolling();
  if (!isLiveResultsEnabled()) return;
  if (activeTab !== 'leaderboard' && activeTab !== 'groups') return;

  const refreshMs = GAME_CONFIG.liveResults?.refreshMs ?? 120_000;
  liveResultsTimer = setInterval(() => {
    refreshLiveResults(true);
  }, refreshMs);
}

function stopLiveResultsPolling() {
  if (liveResultsTimer) {
    clearInterval(liveResultsTimer);
    liveResultsTimer = null;
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
      <h2>Phase 1 — Group stage</h2>
      <p class="muted">
        Group stage entries are closed. Follow live group rankings on the <strong>Group Rankings</strong> tab and track pool points on the <strong>Leaderboard</strong>.
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
        <li>Track live group rankings on the <strong>Group Rankings</strong> tab.</li>
        <li>See the <strong>Rules</strong> tab for scoring details.</li>
        <li>Track standings on the <strong>Leaderboard</strong>.</li>
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

function formatStandingsUpdatedAt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function renderGroupStandingsTable(rows) {
  if (!rows?.length) {
    return '<p class="muted">No standings yet.</p>';
  }

  return `
    <table class="group-standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>MP</th>
          <th>W</th>
          <th>D</th>
          <th>L</th>
          <th>GD</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr class="${row.rank <= 2 ? 'qualifying' : ''}">
            <td>${row.rank}</td>
            <td class="team-cell">
              ${
                row.flag
                  ? `<img class="team-flag" src="${row.flag}" alt="" width="20" height="15" loading="lazy" />`
                  : ''
              }
              ${row.name}
            </td>
            <td>${row.mp}</td>
            <td>${row.w}</td>
            <td>${row.d}</td>
            <td>${row.l}</td>
            <td>${row.gd > 0 ? `+${row.gd}` : row.gd}</td>
            <td><strong>${row.pts}</strong></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderGroups() {
  const standings = state.liveResults?.standings ?? {};
  const updatedAt = state.liveResults?.updatedAt;
  const liveCount = state.liveResults?.groupsWithMatches ?? 0;
  const sortedGroups = [...GROUPS].sort((a, b) => a.id.localeCompare(b.id));

  if (isFetchingGroupStandings && !Object.keys(standings).length) {
    return `
      <section class="panel">
        <h2>Live group rankings</h2>
        <p class="muted">Loading standings…</p>
      </section>`;
  }

  return `
    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h2>Live group rankings</h2>
        ${renderStatusBadge('groupStage')}
      </div>
      <div class="callout">
        <strong>Group stage entries are closed.</strong>
        Live tables below update automatically as matches are played.
      </div>
      <p class="muted">
        ${
          updatedAt
            ? `${liveCount}/12 groups with results · updated ${formatStandingsUpdatedAt(updatedAt)}`
            : 'Standings will appear once match results are available.'
        }
      </p>
      <div class="actions-row" style="margin-bottom:1rem">
        <button class="ghost" id="refresh-group-standings" ${isFetchingGroupStandings ? 'disabled' : ''}>
          ${isFetchingGroupStandings ? 'Refreshing…' : 'Refresh standings'}
        </button>
      </div>

      <div class="group-rankings-grid">
        ${sortedGroups
          .map((group) => {
            const rows = standings[group.id] ?? [];
            return `
            <article class="group-card">
              <h3>${group.name}</h3>
              ${renderGroupStandingsTable(rows)}
            </article>`;
          })
          .join('')}
      </div>
      <p class="muted" style="margin-top:1rem">
        Top two in each group advance to the knockout stage. Data source: FIFA World Cup 2026 live feed.
      </p>
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

function leaderboardPlayerKey(row) {
  const email = (row.email ?? '').trim().toLowerCase();
  return email || row.name.trim().toLowerCase();
}

function renderPlayerGroupPicks(groups) {
  return `
    <div class="player-picks-grid">
      ${GROUPS.map((group) => {
        const picks = groups?.[group.id] ?? [];
        return `
        <article class="player-picks-group">
          <h4>${group.name}</h4>
          <ol class="player-picks-list">
            ${[0, 1, 2, 3]
              .map(
                (i) => `
              <li>
                <span class="player-picks-pos">${i + 1}</span>
                <span class="player-picks-team">${getTeamName(picks[i])}</span>
              </li>`
              )
              .join('')}
          </ol>
        </article>`;
      }).join('')}
    </div>`;
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
            .map((row) => {
              const key = leaderboardPlayerKey(row);
              const expanded = expandedLeaderboardKeys.has(key);
              return `
            <tr
              class="leaderboard-summary${expanded ? ' is-expanded' : ''}"
              data-leaderboard-toggle="${key}"
              role="button"
              tabindex="0"
              aria-expanded="${expanded}"
            >
              <td class="leaderboard-rank">${row.rank}</td>
              <td>
                <span class="leaderboard-player">
                  <span class="leaderboard-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
                  ${row.name}
                </span>
              </td>
              <td><strong>${row.groupPoints}</strong></td>
              <td class="muted">${getMaxGroupPoints()}</td>
            </tr>
            <tr class="leaderboard-details${expanded ? ' is-expanded' : ''}" data-leaderboard-details="${key}">
              <td colspan="4">
                <div class="leaderboard-details-inner">
                  <p class="muted player-picks-heading">Group stage picks</p>
                  ${renderPlayerGroupPicks(row.groups)}
                </div>
              </td>
            </tr>`;
            })
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
    { id: 'groups', label: 'Group Rankings' },
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
  if (activeTab === 'leaderboard' || activeTab === 'groups') {
    startLiveResultsPolling();
  } else {
    stopLiveResultsPolling();
  }
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
      if (activeTab === 'groups') {
        refreshLiveResults(true);
      }
    });
  });

  document.getElementById('refresh-leaderboard')?.addEventListener('click', () => {
    refreshLiveResults(true);
    refreshLeaderboard(true);
  });

  document.querySelectorAll('[data-leaderboard-toggle]').forEach((row) => {
    const toggle = () => {
      const key = row.dataset.leaderboardToggle;
      if (!key) return;
      if (expandedLeaderboardKeys.has(key)) {
        expandedLeaderboardKeys.delete(key);
      } else {
        expandedLeaderboardKeys.add(key);
      }
      render();
    };

    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });
  });

  document.getElementById('refresh-group-standings')?.addEventListener('click', () => {
    refreshLiveResults(true);
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
