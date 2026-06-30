import { GAME_CONFIG } from '../data/config.js';
import { GROUPS, getTeamName } from '../data/groups.js';
import { getFinalizedGroupPoints } from '../data/group-stage-scores.js';
import {
  KNOCKOUT_MATCHES,
} from '../data/knockout.js';
import { getValidWinnersForMatch } from './bracket.js';
import {
  applyLockedKnockoutPicks,
  getLockedKnockoutResults,
  isMatchPickLocked,
} from './knockout-bracket.js';

function scoreDifference(actual, predicted) {
  if (
    actual == null ||
    predicted == null ||
    Number.isNaN(actual) ||
    Number.isNaN(predicted)
  ) {
    return null;
  }
  return Math.abs(actual - predicted);
}

/** @typedef {{ winnerGoals: number|null, loserGoals: number|null }} FinalScorePick */

export function createEmptyFinalScore() {
  return { winnerGoals: null, loserGoals: null };
}

/**
 * Normalize stored final score to winner/loser goals.
 * Migrates legacy home/away by taking max as winner, min as loser.
 */
export function coerceFinalScore(finalScore) {
  if (!finalScore) return createEmptyFinalScore();

  if (
    finalScore.winnerGoals != null &&
    finalScore.loserGoals != null &&
    !Number.isNaN(finalScore.winnerGoals) &&
    !Number.isNaN(finalScore.loserGoals)
  ) {
    return {
      winnerGoals: Number(finalScore.winnerGoals),
      loserGoals: Number(finalScore.loserGoals),
    };
  }

  if (
    finalScore.home != null &&
    finalScore.away != null &&
    !Number.isNaN(finalScore.home) &&
    !Number.isNaN(finalScore.away)
  ) {
    const home = Number(finalScore.home);
    const away = Number(finalScore.away);
    return {
      winnerGoals: Math.max(home, away),
      loserGoals: Math.min(home, away),
    };
  }

  return createEmptyFinalScore();
}

export function formatFinalScorePick(finalScore, finalWinnerCode) {
  const { winnerGoals, loserGoals } = coerceFinalScore(finalScore);
  if (winnerGoals == null || loserGoals == null) return '';

  const winnerLabel = finalWinnerCode ? getTeamName(finalWinnerCode) : 'Winner';
  return `${winnerLabel} ${winnerGoals}–${loserGoals}`;
}

export function scoreFinalPrediction(prediction, result) {
  const pred = coerceFinalScore(prediction);
  const actual = coerceFinalScore(result);

  if (pred.winnerGoals == null || pred.loserGoals == null) {
    return { tiebreakerDistance: null, exactScore: false };
  }
  if (actual.winnerGoals == null || actual.loserGoals == null) {
    return { tiebreakerDistance: null, exactScore: false };
  }

  const winnerDiff = scoreDifference(actual.winnerGoals, pred.winnerGoals);
  const loserDiff = scoreDifference(actual.loserGoals, pred.loserGoals);
  const combinedDiff =
    winnerDiff != null && loserDiff != null ? winnerDiff + loserDiff : null;

  const exactScore =
    pred.winnerGoals === actual.winnerGoals &&
    pred.loserGoals === actual.loserGoals;

  const predTotal = pred.winnerGoals + pred.loserGoals;
  const actualTotal = actual.winnerGoals + actual.loserGoals;

  return {
    tiebreakerDistance: combinedDiff,
    exactScore,
    totalGoalsDiff: scoreDifference(actualTotal, predTotal),
  };
}

export function scoreGroupPredictions(predictions, results) {
  const { perPosition, winnerBonus } = GAME_CONFIG.scoring.group;
  let points = 0;
  let maxPoints = 0;
  const breakdown = [];

  for (const group of GROUPS) {
    const predicted = predictions?.[group.id] ?? [];
    const actual = results?.[group.id] ?? [];
    let groupPoints = 0;
    let groupMax = 0;

    for (let i = 0; i < 4; i++) {
      groupMax += perPosition;
      if (actual[i] && predicted[i] && actual[i] === predicted[i]) {
        groupPoints += perPosition;
      }
    }

    groupMax += winnerBonus;
    if (actual[0] && predicted[0] && actual[0] === predicted[0]) {
      groupPoints += winnerBonus;
    }

    points += groupPoints;
    maxPoints += groupMax;
    breakdown.push({
      groupId: group.id,
      points: groupPoints,
      maxPoints: groupMax,
    });
  }

  return { points, maxPoints, breakdown };
}

export function scoreKnockoutPredictions(predictions, results) {
  const weights = GAME_CONFIG.scoring.knockout;
  const autoCredit = new Set(GAME_CONFIG.knockoutFairnessAutoCredit ?? []);
  let points = 0;
  let maxPoints = 0;
  const breakdown = [];

  for (const match of KNOCKOUT_MATCHES) {
    const weight = weights[match.round];
    maxPoints += weight;

    if (autoCredit.has(match.id)) {
      points += weight;
      breakdown.push({
        matchId: match.id,
        round: match.round,
        points: weight,
        maxPoints: weight,
        correct: true,
        autoCredit: true,
      });
      continue;
    }

    const predicted = predictions?.[match.id];
    const actual = results?.[match.id];
    const correct = predicted && actual && predicted === actual;
    if (correct) points += weight;
    breakdown.push({
      matchId: match.id,
      round: match.round,
      points: correct ? weight : 0,
      maxPoints: weight,
      correct,
    });
  }

  return { points, maxPoints, breakdown };
}

export function scoreEntry(entry, results) {
  const finalizedGroupPoints = getFinalizedGroupPoints(entry);
  const group =
    finalizedGroupPoints != null
      ? { points: finalizedGroupPoints, breakdown: [] }
      : scoreGroupPredictions(entry.groups, results.groups);
  const knockout = scoreKnockoutPredictions(entry.knockout, results.knockout);
  const finalScore = scoreFinalPrediction(
    entry.finalScore,
    results.finalScore
  );

  return {
    name: entry.name,
    groupPoints: group.points,
    knockoutPoints: knockout.points,
    totalPoints: group.points + knockout.points,
    groupBreakdown: group.breakdown,
    knockoutBreakdown: knockout.breakdown,
    tiebreakerDistance: finalScore.tiebreakerDistance,
    exactFinalScore: finalScore.exactScore,
  };
}

export function rankEntries(entries, results) {
  const scored = entries.map((entry) => ({
    ...scoreEntry(entry, results),
    email: entry.email ?? '',
    groups: entry.groups,
    knockout: entry.knockout,
    finalScore: entry.finalScore,
  }));

  scored.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    const aDist = a.tiebreakerDistance ?? Infinity;
    const bDist = b.tiebreakerDistance ?? Infinity;
    if (aDist !== bDist) return aDist - bDist;
    return a.name.localeCompare(b.name);
  });

  return scored.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function createEmptyGroupPredictions() {
  return Object.fromEntries(GROUPS.map((g) => [g.id, ['', '', '', '']]));
}

export function createEmptyKnockoutPredictions() {
  return Object.fromEntries(KNOCKOUT_MATCHES.map((m) => [m.id, '']));
}

export function createEmptyEntry(name = '') {
  return {
    name,
    groups: createEmptyGroupPredictions(),
    knockout: createEmptyKnockoutPredictions(),
    finalScore: createEmptyFinalScore(),
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyResults() {
  return {
    groups: createEmptyGroupPredictions(),
    knockout: createEmptyKnockoutPredictions(),
    finalScore: createEmptyFinalScore(),
    updatedAt: null,
  };
}

export function validateGroupPredictions(groups) {
  for (const group of GROUPS) {
    const picks = groups[group.id] ?? [];
    if (picks.length !== 4) return `Group ${group.id}: pick all four positions.`;
    if (picks.some((p) => !p)) return `Group ${group.id}: fill every position.`;
    const unique = new Set(picks);
    if (unique.size !== 4) {
      return `Group ${group.id}: each team can only appear once.`;
    }
    const validCodes = new Set(group.teams.map((t) => t.code));
    if (picks.some((p) => !validCodes.has(p))) {
      return `Group ${group.id}: invalid team selected.`;
    }
  }
  return null;
}

export function validateKnockoutPredictions(
  knockout,
  { bracketContext = {} } = {}
) {
  const picks = applyLockedKnockoutPicks(knockout);

  for (const match of KNOCKOUT_MATCHES) {
    const pick = picks?.[match.id];
    if (!pick) {
      return `Pick a winner for ${match.label} (${match.description}).`;
    }

    if (isMatchPickLocked(match.id)) {
      const locked = getLockedKnockoutResults()[match.id];
      if (pick !== locked) {
        return `${match.label} is locked — ${getTeamName(locked)} won.`;
      }
      continue;
    }

    const valid = getValidWinnersForMatch(match, bracketContext);
    if (valid.length && !valid.includes(pick)) {
      return `Invalid pick for ${match.label} — pick must match your earlier bracket.`;
    }
  }

  return null;
}

export function validateFinalScore(finalScore, { finalWinner } = {}) {
  const { winnerGoals, loserGoals } = coerceFinalScore(finalScore);

  if (winnerGoals == null || loserGoals == null) {
    return 'Enter your Final score prediction (winner goals and loser goals).';
  }
  if (winnerGoals < 0 || loserGoals < 0) {
    return 'Final score must be zero or greater.';
  }
  if (winnerGoals < loserGoals) {
    return 'Winner goals must be higher than loser goals (e.g. 4–3).';
  }
  if (finalWinner && winnerGoals === loserGoals) {
    return 'Winner and loser goals cannot be equal — pick a decisive score for your Final winner.';
  }
  return null;
}

export function countKnockoutPicks(knockout) {
  return KNOCKOUT_MATCHES.filter((m) => Boolean(knockout?.[m.id])).length;
}

export function rankGroupEntries(entries, results) {
  const scored = entries.map((entry) => {
    const group = scoreGroupPredictions(entry.groups, results.groups);
    return {
      name: entry.name,
      email: entry.email ?? '',
      groups: entry.groups,
      groupPoints: group.points,
      totalPoints: group.points,
      groupBreakdown: group.breakdown,
    };
  });

  scored.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.name.localeCompare(b.name);
  });

  return scored.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function getMaxPossiblePoints() {
  const groupMax =
    GROUPS.length *
    (4 * GAME_CONFIG.scoring.group.perPosition +
      GAME_CONFIG.scoring.group.winnerBonus);
  const knockoutMax = KNOCKOUT_MATCHES.reduce(
    (sum, m) => sum + GAME_CONFIG.scoring.knockout[m.round],
    0
  );
  return groupMax + knockoutMax;
}
