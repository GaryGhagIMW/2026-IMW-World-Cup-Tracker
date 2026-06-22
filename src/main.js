import { GAME_CONFIG, getMaxGroupPoints, getMaxKnockoutPoints, ROUND_LABELS, ROUND_POINTS } from './data/config.js';
import { GROUPS, getTeamName } from './data/groups.js';
import { KNOCKOUT_MATCHES } from './data/knockout.js';
import {
  formatDateRange,
  getWindowStatus,
  isGroupStageClosed,
  canEditKnockoutEarly,
  canEditKnockoutRest,
  canEditKnockoutMatch,
  canEditFinalScore,
  isKnockoutSubmissionOpen,
} from './lib/dates.js';
import {
  createEmptyEntry,
  createEmptyResults,
  validateGroupPredictions,
  validateKnockoutPredictions,
  validateFinalScore,
  rankEntries,
  scoreEntry,
  countKnockoutPicks,
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
  submitKnockoutToSharePoint,
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
import {
  resolveMatchParticipants,
  buildWinnerOptionsHtml,
  getBracketContext,
  buildAdminWinnerOptionsHtml,
} from './lib/bracket.js';

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
      <span class="phase-badge">Knockout stage</span>
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
        <li>Submit knockout picks on the <strong>Knockout</strong> tab (opens June 25).</li>
        <li>Track standings on the <strong>Leaderboard</strong>.</li>
      </ol>
    </section>

    <section class="panel upcoming-phase">
      <h2>Phase 2 — Knockout stage</h2>
      <p class="muted">
        Pick the winner of each knockout game on the <strong>Knockout</strong> tab. Two submission windows:
      </p>
      <ul class="muted">
        <li><strong>June 25–26:</strong> First 3 Round of 32 games ${renderStatusBadge('knockoutEarly')}</li>
        <li><strong>June 29 – July 18:</strong> Remaining games + Final score ${renderStatusBadge('knockoutRest')}</li>
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

function collectKnockoutPicksFromDom(entry) {
  document.querySelectorAll('[data-knockout-match]').forEach((sel) => {
    entry.knockout[sel.dataset.knockoutMatch] = sel.value;
  });
  const homeInput = document.getElementById('final-score-home');
  const awayInput = document.getElementById('final-score-away');
  if (homeInput && awayInput) {
    entry.finalScore.home =
      homeInput.value === '' ? null : Number(homeInput.value);
    entry.finalScore.away =
      awayInput.value === '' ? null : Number(awayInput.value);
  }
  return entry;
}

function renderKnockoutMatchCard(match, entry, bracketContext) {
  const { home, away } = resolveMatchParticipants(match, bracketContext);
  const editable = canEditKnockoutMatch(match);
  const pick = entry.knockout?.[match.id] ?? '';
  const points = ROUND_POINTS[match.round];

  return `
    <article class="knockout-match${match.earlyPick ? ' early-pick' : ''}${editable ? '' : ' locked'}">
      <header class="knockout-match-header">
        <span class="knockout-match-label">${match.label}</span>
        ${match.earlyPick ? '<span class="status-badge upcoming">Early pick</span>' : ''}
        <span class="knockout-match-pts muted">${points} pt${points === 1 ? '' : 's'}</span>
      </header>
      <p class="muted knockout-match-desc">${match.description}</p>
      <div class="knockout-match-teams">
        <span class="knockout-team">${home.label}</span>
        <span class="knockout-vs">vs</span>
        <span class="knockout-team">${away.label}</span>
      </div>
      <label class="knockout-pick-label">
        Winner
        <select data-knockout-match="${match.id}" ${editable ? '' : 'disabled'}>
          ${buildWinnerOptionsHtml(match, pick, bracketContext)}
        </select>
      </label>
    </article>`;
}

function renderKnockout() {
  const entry = ensureEntry();
  const effectiveResults = getEffectiveResults(state);
  const bracketContext = getBracketContext(state, effectiveResults);
  const earlyOpen = canEditKnockoutEarly();
  const restOpen = canEditKnockoutRest();
  const picksCount = countKnockoutPicks(entry.knockout);
  const rounds = ['r32', 'r16', 'qf', 'sf', 'final'];

  return `
    <section class="panel knockout-panel">
      <h2>Knockout bracket</h2>

      <div class="callout">
        <strong>Two submission windows</strong>
        <ul class="muted" style="margin:0.5rem 0 0;padding-left:1.2rem">
          <li><strong>Phase 1 — June 25–26:</strong> First 3 Round of 32 games ${renderStatusBadge('knockoutEarly')}</li>
          <li><strong>Phase 2 — June 29 – July 18:</strong> Remaining games + Final score ${renderStatusBadge('knockoutRest')}</li>
        </ul>
      </div>

      <p class="muted">
        ${picksCount} / ${KNOCKOUT_MATCHES.length} winners picked.
        Matchups fill in from live group standings as groups are confirmed.
      </p>

      ${
        !isKnockoutSubmissionOpen()
          ? `<div class="callout warning"><strong>Preview mode.</strong> Picks unlock ${formatDateRange(GAME_CONFIG.windows.knockoutEarly.start, GAME_CONFIG.windows.knockoutEarly.end)}. Save your name and email before submitting.</div>`
          : !entry.name
            ? `<div class="callout warning"><strong>Save your name and email</strong> in the header before submitting picks.</div>`
            : isSharePointConfigured()
              ? `<div class="callout success"><strong>Ready to submit</strong> when your window opens.</div>`
              : `<div class="callout warning"><strong>Submission pending setup.</strong> See <code>docs/knockout-setup.md</code>.</div>`
      }

      ${rounds
        .map((round) => {
          const matches = KNOCKOUT_MATCHES.filter((m) => m.round === round);
          return `
        <section class="knockout-round">
          <h3>${ROUND_LABELS[round]}</h3>
          <div class="knockout-matches-grid">
            ${matches.map((m) => renderKnockoutMatchCard(m, entry, bracketContext)).join('')}
          </div>
        </section>`;
        })
        .join('')}

      <section class="knockout-round">
        <h3>Final score (tiebreaker only)</h3>
        <p class="muted">Does not earn points — breaks ties on total points.</p>
        <div class="final-score-row">
          <label>Home goals
            <input type="number" id="final-score-home" min="0" max="20" placeholder="0"
              value="${entry.finalScore?.home ?? ''}" ${canEditFinalScore() ? '' : 'disabled'} />
          </label>
          <span class="knockout-vs">–</span>
          <label>Away goals
            <input type="number" id="final-score-away" min="0" max="20" placeholder="0"
              value="${entry.finalScore?.away ?? ''}" ${canEditFinalScore() ? '' : 'disabled'} />
          </label>
        </div>
      </section>

      <div class="actions-row">
        ${
          earlyOpen
            ? `<button class="primary" id="submit-knockout-early" ${isSubmitting ? 'disabled' : ''}>${isSubmitting ? 'Submitting…' : 'Submit early picks (3 games)'}</button>`
            : ''
        }
        ${
          restOpen
            ? `<button class="primary" id="submit-knockout-full" ${isSubmitting ? 'disabled' : ''}>${isSubmitting ? 'Submitting…' : 'Submit all knockout picks'}</button>`
            : ''
        }
      </div>
    </section>`;
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

function renderPlayerKnockoutPicks(knockout, bracketContext) {
  const rounds = ['r32', 'r16', 'qf', 'sf', 'final'];
  return `
    <div class="player-knockout-picks">
      ${rounds
        .map((round) => {
          const matches = KNOCKOUT_MATCHES.filter((m) => m.round === round);
          return `
        <section class="player-knockout-round">
          <h4>${ROUND_LABELS[round]}</h4>
          <ul class="player-picks-list">
            ${matches
              .map((match) => {
                const pick = knockout?.[match.id];
                return `<li><span class="player-picks-pos">${match.label.replace('Match ', 'M')}</span><span class="player-picks-team">${pick ? getTeamName(pick) : '—'}</span></li>`;
              })
              .join('')}
          </ul>
        </section>`;
        })
        .join('')}
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

  const ranked = rankEntries(entries, results);
  const maxKnockout = getMaxKnockoutPoints();
  const hasKnockoutResults = Object.values(results.knockout ?? {}).some(Boolean);

  return `
    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h2>Leaderboard</h2>
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
      ${
        !hasKnockoutResults
          ? '<p class="muted">Knockout points appear once knockout results are entered in Admin.</p>'
          : ''
      }
      <table class="score-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Group</th>
            <th>KO</th>
            <th>Total</th>
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
              <td><strong>${row.groupPoints}</strong><span class="muted"> / ${getMaxGroupPoints()}</span></td>
              <td><strong>${row.knockoutPoints}</strong><span class="muted"> / ${maxKnockout}</span></td>
              <td><strong>${row.totalPoints}</strong></td>
            </tr>
            <tr class="leaderboard-details${expanded ? ' is-expanded' : ''}" data-leaderboard-details="${key}">
              <td colspan="5">
                <div class="leaderboard-details-inner">
                  <p class="muted player-picks-heading">Group stage picks</p>
                  ${renderPlayerGroupPicks(row.groups)}
                  ${
                    countKnockoutPicks(row.knockout)
                      ? `<p class="muted player-picks-heading" style="margin-top:1rem">Knockout picks</p>${renderPlayerKnockoutPicks(row.knockout)}`
                      : ''
                  }
                  ${
                    row.finalScore?.home != null && row.finalScore?.away != null
                      ? `<p class="muted" style="margin-top:0.75rem">Final score pick: ${row.finalScore.home}–${row.finalScore.away}</p>`
                      : ''
                  }
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

      <h3>Official knockout results</h3>
      <p class="muted">Enter the actual winner of each knockout match for live scoring.</p>
      <div class="knockout-admin-grid">
        ${KNOCKOUT_MATCHES.map((match) => {
          const bracketContext = getBracketContext(state, effectiveResults);
          const winner = results.knockout?.[match.id] ?? '';
          const options = buildAdminWinnerOptionsHtml(match, winner, {
            ...bracketContext,
            results,
          });
          return `
          <label class="knockout-admin-row">
            <span>${match.label} — ${match.description}</span>
            <select data-result-knockout="${match.id}">${options}</select>
          </label>`;
        }).join('')}
      </div>
      <div class="final-score-row" style="margin-top:1rem">
        <label>Final — home
          <input type="number" id="result-final-home" min="0" max="20" value="${results.finalScore?.home ?? ''}" />
        </label>
        <span class="knockout-vs">–</span>
        <label>Away
          <input type="number" id="result-final-away" min="0" max="20" value="${results.finalScore?.away ?? ''}" />
        </label>
      </div>
      <div class="actions-row">
        <button class="primary" id="save-knockout-results">Save knockout results</button>
      </div>

      ${
        state.entry?.name
          ? (() => {
              const preview = scoreEntry(state.entry, effectiveResults);
              return `<p class="muted" style="margin-top:1rem">Preview — ${state.entry.name}: ${preview.groupPoints} group + ${preview.knockoutPoints} KO = ${preview.totalPoints} total</p>`;
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
      return renderKnockout();
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
    { id: 'knockout', label: 'Knockout' },
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

  async function submitKnockoutPicks(submitPhase) {
    const entry = collectKnockoutPicksFromDom(ensureEntry());
    if (!entry.name) {
      showToast('Save your name first.', true);
      return;
    }

    const bracketContext = getBracketContext(state, getEffectiveResults(state));
    const pickError = validateKnockoutPredictions(entry.knockout, {
      submitPhase,
      bracketContext,
    });
    if (pickError) {
      showToast(pickError, true);
      return;
    }

    if (submitPhase === 'full') {
      const scoreError = validateFinalScore(entry.finalScore);
      if (scoreError) {
        showToast(scoreError, true);
        return;
      }
    }

    isSubmitting = true;
    render();

    try {
      await submitKnockoutToSharePoint(entry, submitPhase);
      state.entry = entry;
      state.allEntries = addOrUpdateEntry(state.allEntries, entry);
      saveState(state);
      showToast(
        submitPhase === 'early'
          ? `Early knockout picks submitted — ${entry.name}`
          : `Knockout picks submitted — ${entry.name}`
      );
      await refreshLeaderboard(true);
    } catch (err) {
      showToast(err.message || 'Knockout submission failed.', true);
    } finally {
      isSubmitting = false;
      render();
    }
  }

  document.getElementById('submit-knockout-early')?.addEventListener('click', () => {
    submitKnockoutPicks('early');
  });

  document.getElementById('submit-knockout-full')?.addEventListener('click', () => {
    submitKnockoutPicks('full');
  });

  document.querySelectorAll('[data-knockout-match]').forEach((sel) => {
    sel.addEventListener('change', () => {
      collectKnockoutPicksFromDom(ensureEntry());
      saveState(state);
      if (activeTab === 'knockout') render();
    });
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
    const entry = collectKnockoutPicksFromDom(
      collectGroupPicksFromDom(ensureEntry())
    );
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

  document.getElementById('save-knockout-results')?.addEventListener('click', () => {
    const results = ensureResults();
    document.querySelectorAll('[data-result-knockout]').forEach((sel) => {
      results.knockout[sel.dataset.resultKnockout] = sel.value;
    });
    const home = document.getElementById('result-final-home')?.value;
    const away = document.getElementById('result-final-away')?.value;
    results.finalScore.home = home === '' ? null : Number(home);
    results.finalScore.away = away === '' ? null : Number(away);
    results.updatedAt = new Date().toISOString();
    state.results = results;
    persist();
    showToast('Knockout results saved.');
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
