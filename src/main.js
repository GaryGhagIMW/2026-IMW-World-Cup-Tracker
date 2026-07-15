import { GAME_CONFIG, getMaxGroupPoints, getMaxKnockoutPoints, ROUND_LABELS } from './data/config.js';
import { GROUPS, getTeamName, getTeamFlagUrl } from './data/groups.js';
import { KNOCKOUT_MATCHES } from './data/knockout.js';
import {
  formatDateRange,
  formatDate,
  formatWindowRange,
  formatWindowDeadline,
  getWindowStatus,
  isGroupStageClosed,
  canEditKnockoutBracket,
  isKnockoutSubmissionOpen,
} from './lib/dates.js';
import {
  createEmptyEntry,
  createEmptyResults,
  createEmptyKnockoutPredictions,
  validateGroupPredictions,
  validateKnockoutPredictions,
  validateFinalScore,
  rankEntries,
  scoreEntry,
  countKnockoutPicks,
  coerceFinalScore,
  formatFinalScorePick,
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
  getOfficialBracketContext,
  getResultsLabel,
  hasScoringResults,
  hasKnockoutScoringResults,
  countKnockoutResults,
  isLiveResultsEnabled,
} from './lib/live-results.js';
import {
  resolveMatchParticipants,
  getBracketContext,
  getPickBracketContext,
  getEntryBracketContext,
  buildAdminWinnerOptionsHtml,
} from './lib/bracket.js';
import {
  applyLockedKnockoutPicks,
  clearDownstreamPicks,
  getLockedKnockoutResults,
} from './lib/knockout-bracket.js';

function renderFinalShowdownBar() {
  const espFlag = getTeamFlagUrl('ESP');
  const argFlag = getTeamFlagUrl('ARG');
  const finalDate = formatDate(GAME_CONFIG.finalDate);

  return `
    <div class="final-showdown-bar" role="banner">
      <div class="final-showdown-bar__stripe final-showdown-bar__stripe--arg" aria-hidden="true"></div>
      <div class="final-showdown-bar__inner">
        <div class="final-showdown-team final-showdown-team--arg">
          ${argFlag ? `<img class="final-showdown-flag" src="${argFlag}" alt="" width="48" height="36" />` : ''}
          <div class="final-showdown-team-text">
            <span class="final-showdown-team-name">Argentina</span>
            <span class="final-showdown-team-sub">Semi-final winners</span>
          </div>
        </div>
        <div class="final-showdown-center">
          <span class="final-showdown-kicker">2026 FIFA World Cup Final</span>
          <span class="final-showdown-vs">VS</span>
          <span class="final-showdown-date">${finalDate} · MetLife Stadium</span>
        </div>
        <div class="final-showdown-team final-showdown-team--esp">
          <div class="final-showdown-team-text final-showdown-team-text--right">
            <span class="final-showdown-team-name">Spain</span>
            <span class="final-showdown-team-sub">Semi-final winners</span>
          </div>
          ${espFlag ? `<img class="final-showdown-flag" src="${espFlag}" alt="" width="48" height="36" />` : ''}
        </div>
      </div>
      <div class="final-showdown-bar__stripe final-showdown-bar__stripe--esp" aria-hidden="true"></div>
    </div>`;
}

function renderGrandFinalCard(bracketContext, winnersByMatch, { resultsMode = false } = {}) {
  const finalMatch = KNOCKOUT_MATCHES.find((m) => m.id === 'final');
  if (!finalMatch) return '';

  const { home, away } = resolveMatchParticipants(finalMatch, bracketContext);
  const espCode = 'ESP';
  const argCode = 'ARG';
  const homeCode = home.code || espCode;
  const awayCode = away.code || argCode;
  const playerPick = winnersByMatch?.final ?? '';
  const actualResult = resultsMode ? winnersByMatch?.final ?? '' : '';

  const renderSide = (code, sideClass) => {
    const flag = getTeamFlagUrl(code);
    const name = getTeamName(code);
    const highlight = resultsMode
      ? code === actualResult
        ? 'is-result'
        : ''
      : playerPick === code
        ? 'is-pick-pending'
        : '';
    return `
      <div class="grand-final-side ${sideClass} ${highlight}">
        ${flag ? `<img class="grand-final-flag" src="${flag}" alt="" width="72" height="54" loading="lazy" />` : ''}
        <span class="grand-final-name">${name}</span>
      </div>`;
  };

  return `
    <section class="grand-final-card" aria-label="World Cup Final matchup">
      <p class="grand-final-eyebrow">Match 104 · Winner takes the trophy</p>
      <div class="grand-final-matchup">
        ${renderSide(homeCode, 'grand-final-side--home')}
        <div class="grand-final-vs">VS</div>
        ${renderSide(awayCode, 'grand-final-side--away')}
      </div>
      <p class="grand-final-footnote muted">Official bracket is set — Spain and Argentina meet in the Final.</p>
    </section>`;
}

let state = loadState();
let activeTab = 'home';
let expandedLeaderboardKeys = new Set();
let toastTimer = null;
let adminPinDraft = '';
let isSubmitting = false;
let isFetchingLeaderboard = false;
let liveResultsTimer = null;
let bracketViewerKey = '';

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
    activeTab === 'leaderboard' ||
    activeTab === 'knockout' ||
    activeTab === 'standings';
  if (affectsUi) render();

  try {
    const payload = await fetchLiveResults();
    if (payload) {
      state.liveResults = payload;
      state.liveResultsFetchedAt = new Date().toISOString();
    }
  } catch (err) {
    console.warn('Live results refresh failed:', err);
  } finally {
    if (affectsUi) render();
  }
}

function startLiveResultsPolling() {
  stopLiveResultsPolling();
  if (!isLiveResultsEnabled()) return;
  if (
    activeTab !== 'leaderboard' &&
    activeTab !== 'knockout' &&
    activeTab !== 'standings'
  ) {
    return;
  }

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
  if (!state.entry.knockout) {
    state.entry.knockout = createEmptyKnockoutPredictions();
  }
  const beforeLock = { ...state.entry.knockout };
  state.entry.knockout = applyLockedKnockoutPicks(state.entry.knockout);
  for (const matchId of Object.keys(getLockedKnockoutResults())) {
    if (beforeLock[matchId] && beforeLock[matchId] !== state.entry.knockout[matchId]) {
      state.entry.knockout = clearDownstreamPicks(state.entry.knockout, matchId);
    }
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
  const bracketWindow = GAME_CONFIG.windows.knockoutBracket;
  const knockoutTabHint =
    'Browse player picks on <strong>Bracket</strong> · live official results on <strong>Standings</strong>.';

  return `
    <section class="hero-banner hero-banner--final">
      <span class="phase-badge phase-badge--final-round">Final Round</span>
      <h1>Argentina vs Spain</h1>
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
        Group stage entries are closed. Follow pool points on the <strong>Leaderboard</strong>.
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
        <li>See scoring rules below on this page.</li>
        <li>${knockoutTabHint}</li>
        <li>Track standings on the <strong>Leaderboard</strong>.</li>
      </ol>
    </section>

    <section class="panel upcoming-phase">
      <h2>Phase 2 — Knockout bracket</h2>
      ${
        getWindowStatus('knockoutBracket').state === 'closed'
          ? `<div class="callout warning"><strong>Knockout submissions are closed.</strong> The deadline was ${formatWindowDeadline(bracketWindow)}. View submitted brackets on the <strong>Bracket</strong> tab.</div>`
          : ''
      }
      <p class="muted">
        Submissions are closed. Use the <strong>Bracket</strong> tab to view each player's picks.
      </p>
      <div class="callout">
        <strong>Submission window:</strong>
        ${formatWindowRange(bracketWindow)}
        &nbsp; ${renderStatusBadge('knockoutBracket')}
      </div>
      <p class="muted">Matches 73–76 are locked to official results (CAN, PAR, MAR, BRA).</p>
    </section>

    ${renderRules()}
  `;
}

function renderRules() {
  const g = GAME_CONFIG.scoring.group;
  const k = GAME_CONFIG.scoring.knockout;

  return `
    <section class="panel" id="rules">
      <h2>Rules &amp; scoring</h2>
      <h3>Group stage</h3>
      <p class="muted">Points awarded for correctly ranking teams in each group.</p>
      <ul>
        <li><strong>${g.perPosition} point</strong> for each team in the correct finishing position (1st–4th).</li>
        <li><strong>${g.winnerBonus} bonus point</strong> for correctly picking the group winner.</li>
      </ul>

      <h3>Knockout stage</h3>
      <p class="muted">Points awarded for selecting the correct winner of each game. Point values increase each round:</p>
      <ul>
        <li>Round of 32 — <strong>${k.r32} point</strong></li>
        <li>Round of 16 — <strong>${k.r16} points</strong></li>
        <li>Quarter-finals — <strong>${k.qf} points</strong></li>
        <li>Semi-finals — <strong>${k.sf} points</strong></li>
        <li>Final — <strong>${k.final} points</strong></li>
      </ul>
      <p class="muted">
        The Final score prediction does not earn points — it is used as a tiebreaker only.
        Predict the score as <strong>winner–loser</strong> (e.g. 4–3), not home/away.
      </p>

      <h3>Winner</h3>
      <p class="muted">
        The person with the highest combined point total from both the Group and Knockout stages wins the pool.
      </p>
      <p class="muted">
        <strong>Tiebreaker:</strong> If totals are tied, whoever is closest to the actual Final score wins.
        Distance = |predicted winner goals − actual| + |predicted loser goals − actual|.
        Exact score wins outright.
      </p>
    </section>
  `;
}

function entryViewerKey(entry) {
  const email = (entry.email ?? '').trim().toLowerCase();
  return email || entry.name.trim().toLowerCase();
}

function resolveDefaultBracketViewerKey(entries) {
  const email = (state.playerEmail ?? '').trim().toLowerCase();
  if (email && entries.some((e) => (e.email ?? '').trim().toLowerCase() === email)) {
    return email;
  }
  const name = (state.playerName ?? '').trim().toLowerCase();
  if (name) {
    const match = entries.find((e) => e.name.trim().toLowerCase() === name);
    if (match) return entryViewerKey(match);
  }
  const withPicks = entries.find((e) => countKnockoutPicks(e.knockout) > 0);
  return entryViewerKey(withPicks ?? entries[0]);
}

function getPlayerPickHighlightClass(teamCode, playerPick, actualResult) {
  if (!teamCode || !playerPick || playerPick !== teamCode) return '';
  if (!actualResult) return 'is-pick-pending';
  if (playerPick === actualResult) return 'is-pick-correct';
  return 'is-pick-wrong';
}

function renderBracketViewerTeam(code, highlightClass = '', { compact = false } = {}) {
  if (!code) {
    return `<div class="bracket-viewer-team muted${compact ? ' bracket-viewer-team--compact' : ''}"><span>—</span></div>`;
  }
  const flag = getTeamFlagUrl(code);
  const name = getTeamName(code);
  const flagSize = compact ? 'width="18" height="13"' : 'width="24" height="18"';
  return `
    <div class="bracket-viewer-team${highlightClass ? ` ${highlightClass}` : ''}${compact ? ' bracket-viewer-team--compact' : ''}" title="${name}">
      ${flag ? `<img class="bracket-viewer-flag" src="${flag}" alt="" ${flagSize} loading="lazy" />` : ''}
      <span class="bracket-viewer-team-name">${name}</span>
    </div>`;
}

function renderBracketViewerMatch(
  match,
  bracketContext,
  winnersByMatch,
  { compact = false, highlightClass = 'is-pick', resultsByMatch = null } = {}
) {
  const { home, away } = resolveMatchParticipants(match, bracketContext);
  const playerPick = winnersByMatch[match.id] ?? '';
  const actualResult = resultsByMatch?.[match.id] ?? '';

  const homeHighlight = resultsByMatch
    ? getPlayerPickHighlightClass(home.code, playerPick, actualResult)
    : playerPick === home.code
      ? highlightClass
      : '';
  const awayHighlight = resultsByMatch
    ? getPlayerPickHighlightClass(away.code, playerPick, actualResult)
    : playerPick === away.code
      ? highlightClass
      : '';

  const matchTag = match.label.replace('Match ', 'M');

  if (compact) {
    return `
    <article class="bracket-viewer-match bracket-viewer-match--compact" title="${match.description}">
      <div class="bracket-viewer-match-label">${matchTag}</div>
      <div class="bracket-viewer-matchup">
        ${renderBracketViewerTeam(home.code, homeHighlight, { compact: true })}
        ${renderBracketViewerTeam(away.code, awayHighlight, { compact: true })}
      </div>
    </article>`;
  }

  return `
    <article class="bracket-viewer-match">
      <div class="bracket-viewer-match-label">${match.label}</div>
      <p class="muted bracket-viewer-desc">${match.description}</p>
      <div class="bracket-viewer-matchup">
        ${renderBracketViewerTeam(home.code, homeHighlight)}
        <span class="bracket-viewer-vs">vs</span>
        ${renderBracketViewerTeam(away.code, awayHighlight)}
      </div>
    </article>`;
}

function renderBracketFunnel({
  bracketContext,
  winnersByMatch,
  resultsByMatch = null,
  highlightClass = 'is-pick',
  ariaLabel = 'Knockout bracket funnel',
}) {
  const rounds = ['r32', 'r16', 'qf', 'sf', 'final'];
  return `
      <div class="bracket-funnel" aria-label="${ariaLabel}">
        ${rounds
          .map((round) => {
            const matches = KNOCKOUT_MATCHES.filter((m) => m.round === round);
            const connectorPct = BRACKET_FUNNEL_CONNECTOR[round];
            return `
          ${connectorPct != null ? `<div class="bracket-funnel-connector" style="--connector-width: ${connectorPct}%" aria-hidden="true"></div>` : ''}
          <section class="bracket-viewer-round bracket-viewer-round--grand-final" data-round="${round}">
            <h3 class="bracket-viewer-round-title">${ROUND_LABELS[round]}</h3>
            <div class="bracket-viewer-round-matches">
              ${matches
                .map((match) =>
                  renderBracketViewerMatch(match, bracketContext, winnersByMatch, {
                    compact: true,
                    highlightClass,
                    resultsByMatch,
                  })
                )
                .join('')}
            </div>
          </section>`;
          })
          .join('')}
      </div>`;
}

const BRACKET_FUNNEL_CONNECTOR = {
  r16: 96,
  qf: 78,
  sf: 52,
  final: 32,
};

function collectKnockoutPicksFromDom(entry) {
  document.querySelectorAll('[data-knockout-match]').forEach((sel) => {
    entry.knockout[sel.dataset.knockoutMatch] = sel.value;
  });
  const homeInput = document.getElementById('final-score-winner');
  const awayInput = document.getElementById('final-score-loser');
  if (homeInput && awayInput) {
    entry.finalScore.winnerGoals =
      homeInput.value === '' ? null : Number(homeInput.value);
    entry.finalScore.loserGoals =
      awayInput.value === '' ? null : Number(awayInput.value);
  }
  return entry;
}

function renderKnockout() {
  const entries = getLeaderboardEntries(state);
  const effectiveResults = getEffectiveResults(state);

  if (!entries.length) {
    return `
      <section class="panel">
        <h2>Bracket viewer</h2>
        <p class="muted">No pool entries yet.</p>
      </section>`;
  }

  if (
    !bracketViewerKey ||
    !entries.some((e) => entryViewerKey(e) === bracketViewerKey)
  ) {
    bracketViewerKey = resolveDefaultBracketViewerKey(entries);
  }

  const selected =
    entries.find((e) => entryViewerKey(e) === bracketViewerKey) ?? entries[0];
  bracketViewerKey = entryViewerKey(selected);

  const knockout = applyLockedKnockoutPicks(selected.knockout ?? {});
  const bracketContext = getEntryBracketContext(selected, effectiveResults);
  const hasPicks = countKnockoutPicks(knockout) > 0;
  const finalScore = formatFinalScorePick(selected.finalScore, knockout.final);

  return `
    <section class="panel knockout-viewer-panel">
      <h2>Bracket viewer</h2>
      <p class="muted">Select a player to view their knockout bracket. The Final is <strong>Spain vs Argentina</strong> on ${formatDate(GAME_CONFIG.finalDate)}. <span class="bracket-legend"><span class="bracket-legend-swatch is-pick-pending">Pending</span> <span class="bracket-legend-swatch is-pick-correct">Correct</span> <span class="bracket-legend-swatch is-pick-wrong">Wrong</span></span></p>

      ${renderGrandFinalCard(bracketContext, knockout)}

      <label class="bracket-viewer-select">
        Player
        <select id="bracket-viewer-player">
          ${entries
            .map((entry) => {
              const key = entryViewerKey(entry);
              const pickCount = countKnockoutPicks(entry.knockout);
              return `<option value="${key}" ${key === bracketViewerKey ? 'selected' : ''}>${entry.name}${pickCount ? '' : ' (no bracket)'}</option>`;
            })
            .join('')}
        </select>
      </label>

      ${
        !hasPicks
          ? '<p class="callout warning" style="margin-top:1rem"><strong>No bracket submitted.</strong> This player has not entered knockout picks yet.</p>'
          : ''
      }
      ${
        finalScore
          ? `<p class="muted" style="margin-top:0.75rem">Final score pick: <strong>${finalScore}</strong></p>`
          : ''
      }

      ${renderBracketFunnel({
        bracketContext,
        winnersByMatch: knockout,
        resultsByMatch: effectiveResults.knockout ?? {},
        ariaLabel: 'Player knockout bracket funnel',
      })}
    </section>`;
}

function renderStandings() {
  const results = getEffectiveResults(state);
  const bracketContext = getOfficialBracketContext(results);
  const winners = results.knockout ?? {};
  const koFinished = countKnockoutResults(winners);
  const resultsLabel = getResultsLabel(results, state.liveResults);
  const finalScore = formatFinalScorePick(results.finalScore, winners.final);

  return `
    <section class="panel knockout-viewer-panel">
      <h2>Knockout standings</h2>
      <p class="muted">Official knockout bracket — <strong>Spain vs Argentina</strong> in the Final (${formatDate(GAME_CONFIG.finalDate)}). Green highlight = match winner.</p>
      ${
        isLiveResultsEnabled()
          ? `<p class="muted">${resultsLabel}</p>`
          : '<p class="muted">Enable live results in config or enter knockout winners in Admin.</p>'
      }
      ${
        koFinished
          ? `<p class="muted">${koFinished} of ${KNOCKOUT_MATCHES.length} knockout matches decided</p>`
          : '<p class="callout warning" style="margin-top:1rem"><strong>No knockout results yet.</strong> Results will appear here as matches finish.</p>'
      }
      ${
        finalScore
          ? `<p class="muted" style="margin-top:0.75rem">Final result: <strong>${finalScore}</strong></p>`
          : ''
      }

      ${renderGrandFinalCard(bracketContext, winners, { resultsMode: true })}

      ${renderBracketFunnel({
        bracketContext,
        winnersByMatch: winners,
        highlightClass: 'is-result',
        ariaLabel: 'Official knockout results funnel',
      })}
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

function renderLeaderboard() {
  const results = getEffectiveResults(state);
  const entries = getLeaderboardEntries(state);
  const hasResults = hasScoringResults(results);
  const resultsLabel = getResultsLabel(
    results,
    state.liveResults ?? { updatedAt: results.updatedAt, source: results.source }
  );

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
  const koFinished = countKnockoutResults(results.knockout);
  const hasKnockoutResults = hasKnockoutScoringResults(results);

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
          ? `<p class="muted">${resultsLabel || 'Group stage final · scores locked through 29 Jun 2026'}</p>`
          : !hasResults
            ? '<p class="muted">Enter actual group results in Admin to calculate scores.</p>'
            : '<p class="muted">Group stage final · scores locked through 29 Jun 2026</p>'
      }
      ${
        isLeaderboardFetchConfigured()
          ? `<p class="muted">${entries.length} player${entries.length === 1 ? '' : 's'} · synced from OneDrive</p>`
          : `<p class="muted">${entries.length} player${entries.length === 1 ? '' : 's'} registered</p>`
      }
      ${
        isLiveResultsEnabled() && hasKnockoutResults
          ? `<p class="muted">Knockout scores locked in site deploy · ${koFinished}/${KNOCKOUT_MATCHES.length} results scored</p>`
          : !hasKnockoutResults
            ? '<p class="muted">Knockout points update with each site deploy.</p>'
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
              const koPts = row.knockoutPoints;
              const totalPts = row.groupPoints + koPts;
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
              <td><strong>${koPts}</strong><span class="muted"> / ${maxKnockout}</span></td>
              <td><strong>${totalPts}</strong></td>
            </tr>
            <tr class="leaderboard-details${expanded ? ' is-expanded' : ''}" data-leaderboard-details="${key}">
              <td colspan="5">
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
      <p class="muted">Enter the organizer PIN to manage results, override submission windows, and run knockout test entries.</p>
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
        <label>Final — winner goals
          <input type="number" id="result-final-winner" min="0" max="20" value="${coerceFinalScore(results.finalScore).winnerGoals ?? ''}" />
        </label>
        <span class="knockout-vs">–</span>
        <label>Loser goals
          <input type="number" id="result-final-loser" min="0" max="20" value="${coerceFinalScore(results.finalScore).loserGoals ?? ''}" />
        </label>
      </div>
      <p class="muted">Enter the actual Final as winner–loser (not FIFA home/away).</p>
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
    case 'knockout':
      return renderKnockout();
    case 'standings':
      return renderStandings();
    case 'leaderboard':
      return renderLeaderboard();
    case 'admin':
      return renderAdmin();
    default:
      return renderHome();
  }
}

function render() {
  if (activeTab === 'rules' || activeTab === 'groups') {
    activeTab = 'home';
  }
  const app = document.getElementById('app');
  const tabs = [
    { id: 'home', label: 'Home' },
    { id: 'knockout', label: 'Bracket' },
    { id: 'standings', label: 'Standings' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'admin', label: 'Admin' },
  ];

  state.isAdmin = isAdminUnlocked();

  app.innerHTML = `
    <div class="site-sticky-header">
      ${renderFinalShowdownBar()}

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

    <main>${renderTabContent()}</main>

    <footer>
      <a href="${GAME_CONFIG.website}" target="_blank" rel="noopener">${GAME_CONFIG.organization}</a>
      · Argentina vs Spain · FIFA World Cup 2026 Final
    </footer>
  `;

  bindEvents();
  if (
    activeTab === 'leaderboard' ||
    activeTab === 'knockout' ||
    activeTab === 'standings'
  ) {
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
      if (activeTab === 'knockout' || activeTab === 'standings') {
        refreshLiveResults(true);
      }
    });
  });

  document.getElementById('bracket-viewer-player')?.addEventListener('change', (event) => {
    bracketViewerKey = event.target.value;
    render();
  });

  document.getElementById('refresh-leaderboard')?.addEventListener('click', async () => {
    await refreshLiveResults(true);
    refreshLeaderboard(true);
    showToast('Leaderboard refreshed.');
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

  async function submitKnockoutBracket() {
    if (!canEditKnockoutBracket()) {
      const w = GAME_CONFIG.windows.knockoutBracket;
      showToast(`Knockout submissions closed — deadline was ${formatWindowDeadline(w)}.`, true);
      return;
    }
    const entry = collectKnockoutPicksFromDom(ensureEntry());
    entry.knockout = applyLockedKnockoutPicks(entry.knockout);
    if (!entry.name) {
      showToast('Save your name first.', true);
      return;
    }

    const bracketContext = getPickBracketContext(state, getEffectiveResults(state));
    const pickError = validateKnockoutPredictions(entry.knockout, { bracketContext });
    if (pickError) {
      showToast(pickError, true);
      return;
    }

    const scoreError = validateFinalScore(entry.finalScore, {
      finalWinner: entry.knockout?.final,
    });
    if (scoreError) {
      showToast(scoreError, true);
      return;
    }

    isSubmitting = true;
    render();

    try {
      await submitKnockoutToSharePoint(entry, 'full');
      state.entry = entry;
      state.allEntries = addOrUpdateEntry(state.allEntries, entry);
      saveState(state);
      showToast(`Full bracket submitted — ${entry.name}`);
      await refreshLeaderboard(true);
    } catch (err) {
      showToast(err.message || 'Knockout submission failed.', true);
    } finally {
      isSubmitting = false;
      render();
    }
  }

  document.getElementById('submit-knockout-full')?.addEventListener('click', () => {
    submitKnockoutBracket();
  });

  document.querySelectorAll('[data-knockout-match]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const matchId = sel.dataset.knockoutMatch;
      if (isMatchPickLocked(matchId)) return;

      let entry = collectKnockoutPicksFromDom(ensureEntry());
      entry.knockout = clearDownstreamPicks(entry.knockout, matchId);
      state.entry = entry;
      saveState(state);
      render();
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
    const winner = document.getElementById('result-final-winner')?.value;
    const loser = document.getElementById('result-final-loser')?.value;
    results.finalScore.winnerGoals = winner === '' ? null : Number(winner);
    results.finalScore.loserGoals = loser === '' ? null : Number(loser);
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  refreshLiveResults(true);
  if (activeTab === 'leaderboard') refreshLeaderboard(true);
});

render();
refreshLiveResults(true);
refreshLeaderboard(true);
