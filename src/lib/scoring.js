import { GAME_CONFIG } from '../data/config.js';
import { GROUPS } from '../data/groups.js';
import { KNOCKOUT_MATCHES } from '../data/knockout.js';

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
  let points = 0;
  let maxPoints = 0;
  const breakdown = [];

  for (const match of KNOCKOUT_MATCHES) {
    const weight = weights[match.round];
    maxPoints += weight;
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

export function scoreFinalPrediction(prediction, result) {
  if (!prediction || !result) {
    return { tiebreakerDistance: null, exactScore: false };
  }

  const predTotal = prediction.home + prediction.away;
  const actualTotal = result.home + result.away;
  const totalDiff = scoreDifference(actualTotal, predTotal);

  const exactScore =
    prediction.home === result.home && prediction.away === result.away;

  const homeDiff = scoreDifference(result.home, prediction.home);
  const awayDiff = scoreDifference(result.away, prediction.away);
  const combinedDiff =
    homeDiff != null && awayDiff != null ? homeDiff + awayDiff : totalDiff;

  return {
    tiebreakerDistance: combinedDiff,
    exactScore,
    totalGoalsDiff: totalDiff,
  };
}

export function scoreEntry(entry, results) {
  const group = scoreGroupPredictions(entry.groups, results.groups);
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
  const scored = entries.map((entry) => scoreEntry(entry, results));

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
    finalScore: { home: null, away: null },
    updatedAt: new Date().toISOString(),
  };
}

export function createEmptyResults() {
  return {
    groups: createEmptyGroupPredictions(),
    knockout: createEmptyKnockoutPredictions(),
    finalScore: { home: null, away: null },
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
