import { GAME_CONFIG, getMaxGroupPoints, getMaxKnockoutPoints } from './data/config.js';
import { GROUPS, getTeamName } from './data/groups.js';
import { KNOCKOUT_MATCHES } from './data/knockout.js';
import { rankEntries } from './lib/scoring.js';
import { loadState, saveState, getLeaderboardEntries } from './lib/storage.js';
import {
  fetchLeaderboardEntries,
  isLeaderboardFetchConfigured,
} from './lib/leaderboard.js';
import {
  fetchLiveResults,
  getEffectiveResults,
  getResultsLabel,
  hasKnockoutScoringResults,
  countKnockoutResults,
  isLiveResultsEnabled,
} from './lib/live-results.js';
import { assetUrl } from './lib/base.js';

let state = loadState();
let expandedLeaderboardKeys = new Set();
let isFetchingLeaderboard = false;
let liveResultsTimer = null;

const LEADERBOARD_CACHE_MS = 60_000;
const CONFETTI_COLORS = ['#f1bf00', '#c60b1e', '#6cace4', '#ffffff', '#ffd700', '#ff6b6b'];

function applySiteBackground() {
  document.body.classList.add('celebration-page');
  document.documentElement.style.setProperty(
    '--bg-spain-team',
    `url("${assetUrl('assets/backgrounds/spain-team.jpg')}")`
  );
}

function renderConfetti(count = 72) {
  const pieces = Array.from({ length: count }, (_, index) => {
    const left = (index * 17) % 100;
    const delay = (index * 0.13) % 4;
    const duration = 3.5 + (index % 5) * 0.45;
    const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
    const size = 6 + (index % 4) * 2;
    return `<span class="confetti-piece" style="left:${left}%; animation-delay:${delay}s; animation-duration:${duration}s; background:${color}; width:${size}px; height:${size * 0.55}px;"></span>`;
  }).join('');

  return `<div class="confetti-layer" aria-hidden="true">${pieces}</div>`;
}

function renderPodium(topThree) {
  const [first, second, third] = topThree;
  const renderStand = (player, place, heightClass, medal) => {
    if (!player) {
      return `<div class="podium-stand ${heightClass} podium-stand--empty"><span class="podium-medal">${medal}</span><span class="podium-name">—</span></div>`;
    }
    return `
      <article class="podium-stand ${heightClass}">
        <span class="podium-medal">${medal}</span>
        <h3 class="podium-name">${player.name}</h3>
        <p class="podium-score">${player.groupPoints + player.knockoutPoints} pts</p>
        <p class="podium-breakdown">${player.groupPoints} group · ${player.knockoutPoints} KO</p>
      </article>`;
  };

  return `
    <section class="podium-stage" aria-label="Pool winners podium">
      <p class="podium-kicker">2026 IMW World Cup Pool</p>
      <h1 class="podium-title">Congratulations, Mali!</h1>
      <p class="podium-subtitle">Spain wins the World Cup 1–0 · Final tiebreaker decides the pool</p>
      <div class="podium-row">
        ${renderStand(second, 2, 'podium-stand--second', '🥈')}
        ${renderStand(first, 1, 'podium-stand--first', '🏆')}
        ${renderStand(third, 3, 'podium-stand--third', '🥉')}
      </div>
    </section>`;
}

function renderGroupStageBanner(groupWinner) {
  if (!groupWinner) return '';
  const maxGroup = getMaxGroupPoints();
  return `
    <section class="group-stage-banner" aria-label="Group stage winner">
      <span class="group-stage-banner__icon" aria-hidden="true">🥇</span>
      <div class="group-stage-banner__text">
        <p class="group-stage-banner__kicker">Group stage champion</p>
        <p class="group-stage-banner__title">${groupWinner.name} · ${groupWinner.groupPoints} pts</p>
        <p class="group-stage-banner__sub">Top score in the group stage (${maxGroup} pts max)</p>
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

function renderLeaderboard() {
  const results = getEffectiveResults(state);
  const entries = getLeaderboardEntries(state);
  const resultsLabel = getResultsLabel(
    results,
    state.liveResults ?? { updatedAt: results.updatedAt, source: results.source }
  );

  if (!entries.length && isFetchingLeaderboard) {
    return `
      <section class="panel celebration-panel empty-state">
        <h2>Final leaderboard</h2>
        <p>Loading entries…</p>
      </section>`;
  }

  if (!entries.length) {
    return `
      <section class="panel celebration-panel empty-state">
        <h2>Final leaderboard</h2>
        <p>No pool entries found.</p>
      </section>`;
  }

  const ranked = rankEntries(entries, results);
  const topThree = ranked.slice(0, 3);
  const groupStageWinner = [...ranked].sort(
    (a, b) => b.groupPoints - a.groupPoints || a.name.localeCompare(b.name)
  )[0];
  const maxKnockout = getMaxKnockoutPoints();
  const koFinished = countKnockoutResults(results.knockout);
  const hasKnockoutResults = hasKnockoutScoringResults(results);

  return `
    ${renderConfetti()}
    ${renderPodium(topThree)}
    ${renderGroupStageBanner(groupStageWinner)}

    <section class="panel celebration-panel">
      <div class="leaderboard-header">
        <h2>Final leaderboard</h2>
        <button class="ghost" id="refresh-leaderboard" ${isFetchingLeaderboard ? 'disabled' : ''}>
          ${isFetchingLeaderboard ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      ${
        isLiveResultsEnabled()
          ? `<p class="muted">${resultsLabel || 'Tournament complete · Spain 1–0 Argentina'}</p>`
          : '<p class="muted">Tournament complete · Spain 1–0 Argentina</p>'
      }
      <p class="muted">${entries.length} players · ${koFinished}/${KNOCKOUT_MATCHES.length} knockout matches scored</p>
      ${
        hasKnockoutResults
          ? ''
          : '<p class="callout warning">Knockout scores are still syncing — refresh in a moment.</p>'
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
              const totalPts = row.groupPoints + row.knockoutPoints;
              const podiumClass =
                row.rank === 1
                  ? ' leaderboard-row--gold'
                  : row.rank === 2
                    ? ' leaderboard-row--silver'
                    : row.rank === 3
                      ? ' leaderboard-row--bronze'
                      : '';
              return `
            <tr
              class="leaderboard-summary${podiumClass}${expanded ? ' is-expanded' : ''}"
              data-leaderboard-toggle="${key}"
              role="button"
              tabindex="0"
              aria-expanded="${expanded}"
            >
              <td class="leaderboard-rank">${row.rank}</td>
              <td>
                <span class="leaderboard-player">
                  <span class="leaderboard-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
                  ${row.name}${row.rank === 1 ? ' 🏆' : ''}
                </span>
              </td>
              <td><strong>${row.groupPoints}</strong><span class="muted"> / ${getMaxGroupPoints()}</span></td>
              <td><strong>${row.knockoutPoints}</strong><span class="muted"> / ${maxKnockout}</span></td>
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
    </section>`;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <main class="celebration-main">${renderLeaderboard()}</main>
    <footer class="celebration-footer">
      <a href="${GAME_CONFIG.website}" target="_blank" rel="noopener">${GAME_CONFIG.organization}</a>
      · Spain are World Cup champions · Mali Lombard wins the pool
    </footer>
  `;
  bindEvents();
}

function bindEvents() {
  document.getElementById('refresh-leaderboard')?.addEventListener('click', async () => {
    await refreshLiveResults(true);
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
}

async function refreshLiveResults(force = false) {
  if (!isLiveResultsEnabled()) return;

  const fetchedAt = state.liveResultsFetchedAt
    ? Date.parse(state.liveResultsFetchedAt)
    : 0;
  const age = Date.now() - fetchedAt;
  const refreshMs = GAME_CONFIG.liveResults?.refreshMs ?? 120_000;
  if (!force && age < refreshMs) return;

  render();

  try {
    const payload = await fetchLiveResults();
    if (payload) {
      state.liveResults = payload;
      state.liveResultsFetchedAt = new Date().toISOString();
    }
  } catch (err) {
    console.warn('Live results refresh failed:', err);
  } finally {
    render();
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
  render();

  try {
    state.remoteEntries = await fetchLeaderboardEntries();
    state.leaderboardFetchedAt = new Date().toISOString();
    saveState(state);
  } catch (err) {
    console.warn('Leaderboard refresh failed:', err);
  } finally {
    isFetchingLeaderboard = false;
    render();
  }
}

function startLiveResultsPolling() {
  stopLiveResultsPolling();
  if (!isLiveResultsEnabled()) return;
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  refreshLiveResults(true);
  refreshLeaderboard(true);
});

applySiteBackground();
render();
refreshLiveResults(true);
refreshLeaderboard(true);
startLiveResultsPolling();
