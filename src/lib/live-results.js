import { GAME_CONFIG } from '../data/config.js';
import { GROUPS } from '../data/groups.js';
import { FINAL_GROUP_STANDINGS } from '../data/final-group-standings.js';
import { KNOCKOUT_MATCHES } from '../data/knockout.js';
import { getLockedKnockoutResults } from './knockout-bracket.js';
import {
  createEmptyGroupPredictions,
  createEmptyFinalScore,
  createEmptyKnockoutPredictions,
  coerceFinalScore,
} from './scoring.js';
import { assetUrl } from './base.js';
import { fetchWorldCupStandings } from './worldcup-api.js';
import { BUNDLED_LIVE_RESULTS } from '../data/bundled-live-results.js';

const LIVE_RESULTS_PATH = 'data/live-results.json';

export function isLiveResultsEnabled() {
  return Boolean(GAME_CONFIG.liveResults?.enabled);
}

function emptyGroupMap() {
  return createEmptyGroupPredictions();
}

function mergeKnockoutResults(live, manual) {
  const merged = createEmptyKnockoutPredictions();
  const locked = getLockedKnockoutResults();
  const liveKnockout = live?.knockout ?? {};
  const manualKnockout = manual?.knockout ?? {};

  for (const match of KNOCKOUT_MATCHES) {
    merged[match.id] =
      manualKnockout[match.id] ||
      liveKnockout[match.id] ||
      locked[match.id] ||
      '';
  }

  let finalScore = createEmptyFinalScore();
  const manualFinal = coerceFinalScore(manual?.finalScore);
  const liveFinal = coerceFinalScore(live?.finalScore);

  if (manualFinal.winnerGoals != null && manualFinal.loserGoals != null) {
    finalScore = manualFinal;
  } else if (liveFinal.winnerGoals != null && liveFinal.loserGoals != null) {
    finalScore = liveFinal;
  }

  return { knockout: merged, finalScore };
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

  const { knockout, finalScore } = mergeKnockoutResults(live, manual);

  return {
    groups: merged,
    knockout,
    finalScore,
    updatedAt: live?.updatedAt ?? manual?.updatedAt ?? null,
    source: live?.source ?? 'manual',
    groupsWithMatches: live?.groupsWithMatches ?? 0,
    knockoutMatchesFinished: live?.knockoutMatchesFinished ?? countKnockoutResults(knockout),
  };
}

export function countKnockoutResults(knockout = {}) {
  return KNOCKOUT_MATCHES.filter((m) => Boolean(knockout[m.id])).length;
}

export function hasScoringResults(results) {
  return (
    Object.values(results?.groups ?? {}).some((row) => row.some(Boolean)) ||
    Object.keys(FINAL_GROUP_STANDINGS).length === 12
  );
}

export function hasKnockoutScoringResults(results) {
  return countKnockoutResults(results?.knockout) > 0;
}

export function getResultsLabel(results, liveMeta) {
  const koFinished =
    liveMeta?.knockoutMatchesFinished ??
    countKnockoutResults(results?.knockout);
  const koTotal = KNOCKOUT_MATCHES.length;

  if (!hasScoringResults(results) && !hasKnockoutScoringResults(results)) {
    return 'Enter results in Admin or wait for live standings to populate.';
  }

  if (liveMeta?.updatedAt) {
    const when = new Date(liveMeta.updatedAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const via = liveMeta.source === 'worldcup26.ir' ? 'live API' : 'cached file';
    const parts = [];

    parts.push(`Group pts locked · KO ${koFinished}/${koTotal} decided`);
    parts.push(`${via} · updated ${when}`);

    return parts.join(' · ');
  }

  if (hasKnockoutScoringResults(results)) {
    return `Group pts locked · KO ${koFinished}/${koTotal} decided · organizer-entered results`;
  }

  return 'Using organizer-entered results.';
}

function scoreLivePayload(payload) {
  if (!payload) return -1;
  const groupsWithMatches = payload.groupsWithMatches ?? 0;
  const knockoutFinished = payload.knockoutMatchesFinished ?? 0;
  const updatedAt = payload.updatedAt ? Date.parse(payload.updatedAt) : 0;
  return (
    knockoutFinished * 1_000_000_000_000_000 +
    groupsWithMatches * 1_000_000_000_000 +
    updatedAt
  );
}

/** Prefer the payload with more group/knockout data; tie-break on updatedAt. */
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
    knockout: createEmptyKnockoutPredictions(),
    finalScore: createEmptyFinalScore(),
  };

  if (!isLiveResultsEnabled()) {
    return mergeResults(BUNDLED_LIVE_RESULTS, manual);
  }

  const livePayload = state.liveResults ?? BUNDLED_LIVE_RESULTS;

  // Manual admin overrides are local to one browser — only the organizer should
  // see them while testing. Everyone else uses the same live feed for scoring.
  const manualForMerge = state.isAdmin
    ? manual
    : {
        groups: emptyGroupMap(),
        knockout: createEmptyKnockoutPredictions(),
        finalScore: createEmptyFinalScore(),
      };

  return mergeResults(livePayload, manualForMerge);
}

/** Bracket context driven by official knockout results (Standings tab). */
export function getOfficialBracketContext(effectiveResults) {
  return {
    groupStandings: effectiveResults?.groups ?? {},
    picks: {},
    results: effectiveResults ?? {},
    preferPicks: false,
  };
}
