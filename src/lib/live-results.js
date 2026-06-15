import { GAME_CONFIG } from '../data/config.js';
import { GROUPS } from '../data/groups.js';
import { createEmptyGroupPredictions } from './scoring.js';
import { assetUrl } from './base.js';
import { fetchWorldCupStandings } from './worldcup-api.js';

const LIVE_RESULTS_PATH = 'data/live-results.json';

export function isLiveResultsEnabled() {
  return Boolean(GAME_CONFIG.liveResults?.enabled);
}

function emptyGroupMap() {
  return createEmptyGroupPredictions();
}

/** Merge live standings with optional manual admin overrides (admin wins per group). */
export function mergeResults(live, manual) {
  const merged = emptyGroupMap();
  const liveGroups = live?.groups ?? {};
  const manualGroups = manual?.groups ?? {};

  for (const group of GROUPS) {
    const id = group.id;
    const manualRow = manualGroups[id] ?? [];
    const manualComplete =
      manualRow.length === 4 && manualRow.every(Boolean);

    if (manualComplete) {
      merged[id] = [...manualRow];
      continue;
    }

    const liveRow = liveGroups[id] ?? [];
    const liveComplete = liveRow.length === 4 && liveRow.every(Boolean);
    if (liveComplete) {
      merged[id] = [...liveRow];
    } else {
      merged[id] = manualRow.length ? [...manualRow] : ['', '', '', ''];
    }
  }

  return {
    groups: merged,
    knockout: manual?.knockout ?? {},
    finalScore: manual?.finalScore ?? { home: null, away: null },
    updatedAt: live?.updatedAt ?? manual?.updatedAt ?? null,
    source: live?.source ?? 'manual',
    groupsWithMatches: live?.groupsWithMatches ?? 0,
  };
}

export function hasScoringResults(results) {
  return Object.values(results?.groups ?? {}).some((row) =>
    row.some(Boolean)
  );
}

export function getResultsLabel(results, liveMeta) {
  if (!hasScoringResults(results)) {
    return 'Enter results in Admin or wait for live standings to populate.';
  }
  if (liveMeta?.updatedAt) {
    const when = new Date(liveMeta.updatedAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const liveCount = liveMeta.groupsWithMatches ?? 0;
    const via = liveMeta.source === 'worldcup26.ir' ? 'live API' : 'cached file';
    if (liveCount > 0) {
      return `Live standings · ${liveCount}/12 groups in play · ${via} · updated ${when}`;
    }
    return `Standings (${via}) updated ${when} · waiting for match results`;
  }
  return 'Using organizer-entered results.';
}

/** Fetch live standings — API first, bundled JSON fallback. */
export async function fetchLiveResults() {
  if (!isLiveResultsEnabled()) return null;

  if (GAME_CONFIG.liveResults?.fetchFromApi !== false) {
    try {
      return await fetchWorldCupStandings();
    } catch (err) {
      console.warn('Live API fetch failed, using bundled file:', err);
    }
  }

  return fetchLiveResultsFile();
}

/** Load bundled live-results.json (updated by GitHub Action). */
export async function fetchLiveResultsFile() {
  if (!isLiveResultsEnabled()) return null;

  const url = `${assetUrl(LIVE_RESULTS_PATH)}?t=${Date.now()}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn('Live results fetch failed:', err);
    return null;
  }
}

export function getEffectiveResults(state) {
  const manual = state.results ?? {
    groups: emptyGroupMap(),
    knockout: {},
    finalScore: { home: null, away: null },
  };

  if (!isLiveResultsEnabled() || !state.liveResults) {
    return manual;
  }

  return mergeResults(state.liveResults, manual);
}
