import { GAME_CONFIG } from '../data/config.js';
import { GROUPS } from '../data/groups.js';
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

  return {
    name,
    email: (row.Email ?? row.playerEmail ?? row.email ?? '').trim(),
    groups,
    knockout: createEmptyKnockoutPredictions(),
    finalScore: { home: null, away: null },
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
