import { GAME_CONFIG } from '../data/config.js';
import { GROUPS } from '../data/groups.js';
import { FINAL_GROUP_STANDINGS } from '../data/final-group-standings.js';
import { createEmptyGroupPredictions, createEmptyFinalScore } from './scoring.js';
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
      continue;
    }

    const finalRow = FINAL_GROUP_STANDINGS[id] ?? [];
    const finalComplete = finalRow.length === 4 && finalRow.every(Boolean);
    if (finalComplete) {
      merged[id] = [...finalRow];
    } else {
      merged[id] = manualRow.length ? [...manualRow] : ['', '', '', ''];
    }
  }

  return {
    groups: merged,
    knockout: manual?.knockout ?? {},
    finalScore: createEmptyFinalScore(),
    updatedAt: live?.updatedAt ?? manual?.updatedAt ?? null,
    source: live?.source ?? 'manual',
    groupsWithMatches: live?.groupsWithMatches ?? 0,
  };
}

export function hasScoringResults(results) {
  return (
    Object.values(results?.groups ?? {}).some((row) => row.some(Boolean)) ||
    Object.keys(FINAL_GROUP_STANDINGS).length === 12
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

function scoreLivePayload(payload) {
  if (!payload) return -1;
  const groupsWithMatches = payload.groupsWithMatches ?? 0;
  const updatedAt = payload.updatedAt ? Date.parse(payload.updatedAt) : 0;
  return groupsWithMatches * 1_000_000_000_000 + updatedAt;
}

/** Prefer the payload with more group data; tie-break on updatedAt. */
export function pickBestLiveResults(apiResult, fileResult) {
  if (apiResult && fileResult) {
    return scoreLivePayload(apiResult) >= scoreLivePayload(fileResult)
      ? apiResult
      : fileResult;
  }
  return apiResult ?? fileResult ?? null;
}

/** Fetch live standings — API and bundled JSON in parallel, pick the best snapshot. */
export async function fetchLiveResults() {
  if (!isLiveResultsEnabled()) return null;

  const useApi = GAME_CONFIG.liveResults?.fetchFromApi !== false;
  const [apiResult, fileResult] = await Promise.all([
    useApi
      ? fetchWorldCupStandings().catch((err) => {
          console.warn('Live API fetch failed:', err);
          return null;
        })
      : Promise.resolve(null),
    fetchLiveResultsFile().catch((err) => {
      console.warn('Bundled live-results fetch failed:', err);
      return null;
    }),
  ]);

  const best = pickBestLiveResults(apiResult, fileResult);
  if (!best) {
    throw new Error('Live standings unavailable (API and bundled file both failed).');
  }
  return best;
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
    finalScore: createEmptyFinalScore(),
  };

  if (!isLiveResultsEnabled()) {
    return mergeResults(null, manual);
  }

  if (!state.liveResults) {
    return mergeResults(null, manual);
  }

  // Manual admin overrides are local to one browser — only the organizer should
  // see them while testing. Everyone else uses the same live feed for scoring.
  const manualForMerge = state.isAdmin ? manual : {
    groups: emptyGroupMap(),
    knockout: {},
    finalScore: createEmptyFinalScore(),
  };

  return mergeResults(state.liveResults, manualForMerge);
}
