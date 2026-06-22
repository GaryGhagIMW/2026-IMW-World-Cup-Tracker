import { GAME_CONFIG } from '../data/config.js';
import { GROUPS } from '../data/groups.js';
import { KNOCKOUT_MATCHES } from '../data/knockout.js';
import { createEmptyKnockoutPredictions } from './scoring.js';

export function isLeaderboardFetchConfigured() {
  return Boolean(getLeaderboardFetchUrl());
}

export function getLeaderboardFetchUrl() {
  // Only use a dedicated fetch URL. Never POST { action: 'list' } to the submit
  // webhook unless that flow has a list branch — otherwise Power Automate adds
  // blank rows to Excel on every page load.
  return GAME_CONFIG.sharepoint.leaderboardFetchUrl?.trim() || '';
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.entries)) return payload.entries;
  return [];
}

function parseSubmittedAt(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function parseKnockoutFromRow(row) {
  const knockout = createEmptyKnockoutPredictions();
  let finalScore = { home: null, away: null };

  const jsonRaw = row.EntryJson ?? row.entryJson;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed.knockout) {
        Object.assign(knockout, parsed.knockout);
      }
      if (parsed.finalScore) {
        finalScore = {
          home: parsed.finalScore.home ?? null,
          away: parsed.finalScore.away ?? null,
        };
      }
    } catch {
      // ignore malformed JSON
    }
  }

  for (const match of KNOCKOUT_MATCHES) {
    const col = `Knockout_${match.id.replace(/-/g, '_')}`;
    if (row[col]) knockout[match.id] = row[col];
  }

  if (row.FinalScoreHome !== undefined && row.FinalScoreHome !== '') {
    finalScore.home = Number(row.FinalScoreHome);
  }
  if (row.FinalScoreAway !== undefined && row.FinalScoreAway !== '') {
    finalScore.away = Number(row.FinalScoreAway);
  }

  return { knockout, finalScore };
}

export function excelRowToEntry(row) {
  const name = (row.PlayerName ?? row.playerName ?? '').trim();
  if (!name) return null;

  const groups = {};
  for (const group of GROUPS) {
    groups[group.id] = [
      row[`Group${group.id}_1st`] ?? '',
      row[`Group${group.id}_2nd`] ?? '',
      row[`Group${group.id}_3rd`] ?? '',
      row[`Group${group.id}_4th`] ?? '',
    ];
  }

  const { knockout, finalScore } = parseKnockoutFromRow(row);

  return {
    name,
    email: (row.Email ?? row.playerEmail ?? row.email ?? '').trim(),
    groups,
    knockout,
    finalScore,
    updatedAt: parseSubmittedAt(row.SubmittedAt ?? row.submittedAt),
  };
}

export function rowsToEntries(rows) {
  return normalizeRows(rows)
    .map(excelRowToEntry)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Fetch all rows from the OneDrive Excel log via Power Automate. */
export async function fetchLeaderboardEntries() {
  const url = getLeaderboardFetchUrl();
  if (!url) {
    throw new Error('Leaderboard fetch URL is not configured.');
  }

  const body = JSON.stringify({ action: 'list' });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`Leaderboard fetch returned ${response.status}`);
  }

  const text = (await response.text()).trim();
  if (!text) {
    throw new Error(
      'Leaderboard fetch returned an empty response. Add the list branch to your Power Automate flow (see docs/sharepoint-setup.md).'
    );
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Leaderboard fetch returned invalid JSON.');
  }

  const entries = rowsToEntries(payload);
  if (!entries.length) {
    throw new Error('Leaderboard fetch returned no player entries.');
  }

  return entries;
}
