import { GROUPS, getTeamName } from '../data/groups.js';
import { KNOCKOUT_MATCHES } from '../data/knockout.js';
import { applyLockedKnockoutPicks } from './knockout-bracket.js';

/** Eligible third-place groups per R32 match (from FIFA bracket). */
export const THIRD_PLACE_SLOTS = {
  'r32-2': ['A', 'B', 'C', 'D', 'F'],
  'r32-5': ['C', 'D', 'F', 'G', 'H'],
  'r32-7': ['C', 'E', 'F', 'H', 'I'],
  'r32-8': ['E', 'H', 'I', 'J', 'K'],
  'r32-9': ['B', 'E', 'F', 'I', 'J'],
  'r32-10': ['A', 'E', 'H', 'I', 'J'],
  'r32-14': ['E', 'F', 'G', 'I', 'J'],
  'r32-16': ['D', 'E', 'I', 'J', 'L'],
};

const MATCH_NUM_TO_ID = Object.fromEntries(
  KNOCKOUT_MATCHES.map((m) => [parseMatchNumber(m.label), m.id])
);

function parseMatchNumber(label) {
  return Number.parseInt(String(label).replace(/\D/g, ''), 10);
}

function normalizeGroupRow(groupStandings, groupId) {
  const row = groupStandings?.[groupId];
  if (Array.isArray(row)) return row;
  if (row?.positions) return row.positions;
  return ['', '', '', ''];
}

function resolveGroupSlot(slot, groupStandings) {
  const match = slot.match(/^([12])([A-L])$/);
  if (!match) {
    return { code: '', label: slot, candidates: [] };
  }

  const pos = match[1] === '1' ? 0 : 1;
  const groupId = match[2];
  const row = normalizeGroupRow(groupStandings, groupId);
  const code = row[pos] ?? '';

  if (code) {
    return { code, label: getTeamName(code), candidates: [code] };
  }

  return {
    code: '',
    label: `${match[1]}${groupId}`,
    candidates: [],
  };
}

function resolveThirdPlace(matchId, groupStandings) {
  const eligible = THIRD_PLACE_SLOTS[matchId] ?? [];
  const candidates = eligible
    .map((groupId) => normalizeGroupRow(groupStandings, groupId)[2])
    .filter(Boolean);

  const unique = [...new Set(candidates)];
  const label =
    unique.length === 1
      ? getTeamName(unique[0])
      : unique.length > 1
        ? unique.map(getTeamName).join(' / ')
        : `3rd (${eligible.join('/')})`;

  return {
    code: unique.length === 1 ? unique[0] : '',
    label,
    candidates: unique,
  };
}

function resolveWinnerSlot(slot, picks, results, { preferPicks = false } = {}) {
  const num = Number.parseInt(String(slot).replace(/\D/g, ''), 10);
  const sourceId = MATCH_NUM_TO_ID[num];
  if (!sourceId) {
    return { code: '', label: slot, candidates: [] };
  }

  const official = results?.knockout?.[sourceId] ?? '';
  const predicted = picks?.[sourceId] ?? '';
  const winner = preferPicks ? predicted : official || predicted;
  return {
    code: winner,
    label: winner ? getTeamName(winner) : `Winner M${num}`,
    candidates: winner ? [winner] : [],
  };
}

function resolveSlot(slot, match, context) {
  if (!slot) return { code: '', label: 'TBD', candidates: [] };
  if (String(slot).startsWith('W')) {
    return resolveWinnerSlot(slot, context.picks, context.results, {
      preferPicks: Boolean(context.preferPicks),
    });
  }
  if (slot === '3rd') {
    return resolveThirdPlace(match.id, context.groupStandings);
  }
  return resolveGroupSlot(slot, context.groupStandings);
}

export function resolveMatchParticipants(match, context = {}) {
  const home = resolveSlot(match.homeSlot, match, context);
  const away = resolveSlot(match.awaySlot, match, context);

  return { home, away };
}

export function getMatchSideOptions(match, side, context = {}) {
  const { home, away } = resolveMatchParticipants(match, context);
  const data = side === 'home' ? home : away;
  if (data.candidates?.length) return data.candidates;
  if (data.code) return [data.code];
  return [];
}

export function getValidWinnersForMatch(match, context = {}) {
  const { home, away } = resolveMatchParticipants(match, context);
  const options = new Set([
    ...(home.candidates ?? []),
    ...(away.candidates ?? []),
    home.code,
    away.code,
  ].filter(Boolean));
  return [...options];
}

export function buildWinnerOptionsHtml(match, selected, context = {}) {
  const options = getValidWinnersForMatch(match, context);
  const { home, away } = resolveMatchParticipants(match, context);

  if (!options.length) {
    return `<option value="">Teams TBD</option>`;
  }

  const parts = ['<option value="">— Pick winner —</option>'];
  for (const code of options) {
    const sel = code === selected ? ' selected' : '';
    parts.push(`<option value="${code}"${sel}>${getTeamName(code)}</option>`);
  }

  if (!options.length && (home.label || away.label)) {
    parts.push(
      `<option value="" disabled>${home.label || 'TBD'} vs ${away.label || 'TBD'}</option>`
    );
  }

  return parts.join('');
}

export function getBracketContext(state, effectiveResults) {
  return {
    groupStandings: effectiveResults?.groups ?? {},
    picks: state.entry?.knockout ?? {},
    results: effectiveResults ?? {},
    preferPicks: false,
  };
}

/** Bracket context for the player pick form — later rounds follow the user's picks only. */
export function getPickBracketContext(state, effectiveResults) {
  const picks = applyLockedKnockoutPicks(state.entry?.knockout ?? {});
  return {
    groupStandings: effectiveResults?.groups ?? {},
    picks,
    results: effectiveResults ?? {},
    preferPicks: true,
  };
}

export function buildAdminWinnerOptionsHtml(match, selected, context = {}) {
  let options = getValidWinnersForMatch(match, context);
  if (!options.length) {
    options = GROUPS.flatMap((g) => g.teams.map((t) => t.code));
  }

  const parts = ['<option value="">— Select —</option>'];
  for (const code of options) {
    const sel = code === selected ? ' selected' : '';
    parts.push(`<option value="${code}"${sel}>${getTeamName(code)}</option>`);
  }
  return parts.join('');
}
