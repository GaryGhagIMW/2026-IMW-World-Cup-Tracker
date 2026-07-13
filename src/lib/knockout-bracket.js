import { GAME_CONFIG } from '../data/config.js';
import { KNOCKOUT_MATCHES, getMatchById } from '../data/knockout.js';
import { createEmptyKnockoutPredictions } from './scoring.js';

/**
 * Visual bracket columns — mirrors FIFA published feed paths (M73–M104).
 * Canada (M73) and Germany (M74) are on opposite sides until a possible Final.
 */
export const BRACKET_TREE = [
  {
    round: 'r32',
    label: 'Round of 32',
    pairs: [
      ['r32-2', 'r32-5'],
      ['r32-1', 'r32-3'],
      ['r32-4', 'r32-6'],
      ['r32-7', 'r32-8'],
      ['r32-11', 'r32-12'],
      ['r32-9', 'r32-10'],
      ['r32-15', 'r32-13'],
      ['r32-14', 'r32-16'],
    ],
  },
  {
    round: 'r16',
    label: 'Round of 16',
    pairs: [
      ['r16-1', 'r16-2'],
      ['r16-3', 'r16-4'],
      ['r16-5', 'r16-6'],
      ['r16-7', 'r16-8'],
    ],
  },
  {
    round: 'qf',
    label: 'Quarter-finals',
    pairs: [
      ['qf-1', 'qf-2'],
      ['qf-3', 'qf-4'],
    ],
  },
  {
    round: 'sf',
    label: 'Semi-finals',
    pairs: [['sf-1', 'sf-2']],
  },
  {
    round: 'final',
    label: 'Final',
    pairs: [['final', null]],
  },
];

const MATCH_NUM_BY_ID = Object.fromEntries(
  KNOCKOUT_MATCHES.map((m) => [m.id, parseMatchNumber(m.label)])
);

function parseMatchNumber(label) {
  return Number.parseInt(String(label).replace(/\D/g, ''), 10);
}

function slotMatchNumbers(match) {
  return [match.homeSlot, match.awaySlot]
    .filter((slot) => String(slot).startsWith('W'))
    .map((slot) => Number.parseInt(String(slot).replace(/\D/g, ''), 10));
}

export function getLockedKnockoutResults() {
  return GAME_CONFIG.lockedKnockoutResults ?? {};
}

/** Matches 73–76 only — submitted picks replaced for everyone (deadline fairness). */
export function getFairnessLockedMatchIds() {
  return GAME_CONFIG.knockoutFairnessAutoCredit ?? [];
}

export function isMatchPickLocked(matchId) {
  return getFairnessLockedMatchIds().includes(matchId);
}

export function applyLockedKnockoutPicks(knockout = {}) {
  const next = { ...createEmptyKnockoutPredictions(), ...knockout };
  const official = getLockedKnockoutResults();
  for (const matchId of getFairnessLockedMatchIds()) {
    if (official[matchId]) {
      next[matchId] = official[matchId];
    }
  }
  return next;
}

/** All matches whose participants depend on the given match's winner. */
export function getDownstreamMatchIds(changedMatchId) {
  const changedNum = MATCH_NUM_BY_ID[changedMatchId];
  if (!changedNum) return [];

  const affectedNums = new Set();
  let frontier = [changedNum];

  while (frontier.length) {
    const nextFrontier = [];
    for (const match of KNOCKOUT_MATCHES) {
      const matchNum = MATCH_NUM_BY_ID[match.id];
      if (affectedNums.has(matchNum)) continue;

      const deps = slotMatchNumbers(match);
      if (deps.some((dep) => dep === changedNum || affectedNums.has(dep))) {
        affectedNums.add(matchNum);
        nextFrontier.push(matchNum);
      }
    }
    frontier = nextFrontier;
  }

  return KNOCKOUT_MATCHES.filter((m) => affectedNums.has(MATCH_NUM_BY_ID[m.id])).map(
    (m) => m.id
  );
}

export function clearDownstreamPicks(knockout, changedMatchId) {
  const next = { ...knockout };
  for (const matchId of getDownstreamMatchIds(changedMatchId)) {
    if (!isMatchPickLocked(matchId)) {
      next[matchId] = '';
    }
  }
  return applyLockedKnockoutPicks(next);
}

export function getBracketMatchIdsInOrder() {
  return BRACKET_TREE.flatMap((col) =>
    col.pairs.flatMap((pair) => pair.filter(Boolean))
  );
}

export function getMatchForBracketSlot(matchId) {
  return matchId ? getMatchById(matchId) : null;
}
