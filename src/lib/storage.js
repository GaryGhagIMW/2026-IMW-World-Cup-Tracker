import { POOL_ENTRIES } from '../data/pool-entries.js';
import { KNOCKOUT_MATCHES } from '../data/knockout.js';
import { createEmptyKnockoutPredictions, coerceFinalScore } from './scoring.js';

const STORAGE_KEY = 'imw-wc-2026';

export function getLeaderboardEntries(state = {}) {
  const remoteEntries = state.remoteEntries ?? [];
  const localEntries = state.allEntries ?? [];

  let merged = [...POOL_ENTRIES];

  for (const entry of remoteEntries) {
    merged = addOrUpdateEntry(merged, entry);
  }

  for (const entry of localEntries) {
    merged = addOrUpdateEntry(merged, entry);
  }

  return dedupeEntriesByEmail(merged);
}

function mergeEntryData(existing, incoming) {
  const hasKnockout = KNOCKOUT_MATCHES.some((m) => incoming.knockout?.[m.id]);
  const hasFinal = (() => {
    const { winnerGoals, loserGoals } = coerceFinalScore(incoming.finalScore);
    return winnerGoals != null && loserGoals != null;
  })();

  return {
    ...existing,
    ...incoming,
    groups: incoming.groups ?? existing.groups,
    knockout: hasKnockout
      ? {
          ...(existing.knockout ?? createEmptyKnockoutPredictions()),
          ...incoming.knockout,
        }
      : existing.knockout ?? incoming.knockout ?? createEmptyKnockoutPredictions(),
    finalScore: hasFinal ? incoming.finalScore : existing.finalScore ?? incoming.finalScore,
    updatedAt: incoming.updatedAt ?? existing.updatedAt,
  };
}

function dedupeEntriesByEmail(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const email = (entry.email ?? '').trim().toLowerCase();
    const key = email || `name:${entry.name.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    const existingAt = Date.parse(existing.updatedAt || 0) || 0;
    const entryAt = Date.parse(entry.updatedAt || 0) || 0;
    const [older, newer] =
      entryAt >= existingAt ? [existing, entry] : [entry, existing];
    byKey.set(key, mergeEntryData(older, newer));
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    // Live standings are fetched on each visit — do not restore stale per-browser snapshots.
    delete parsed.liveResults;
    delete parsed.liveResultsFetchedAt;
    return { ...getDefaultState(), ...parsed };
  } catch {
    return getDefaultState();
  }
}

export function saveState(state) {
  const { liveResults, liveResultsFetchedAt, ...persisted } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

export function getDefaultState() {
  return {
    playerName: '',
    playerEmail: '',
    entry: null,
    results: null,
    isAdmin: false,
    allEntries: [],
    remoteEntries: [],
    leaderboardFetchedAt: null,
    liveResults: null,
    liveResultsFetchedAt: null,
  };
}

export function exportEntry(entry) {
  const blob = new Blob([JSON.stringify(entry, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `world-cup-picks-${entry.name || 'anonymous'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function importJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    };
    input.click();
  });
}

export function addOrUpdateEntry(allEntries, entry) {
  const idx = allEntries.findIndex(
    (e) => e.name.toLowerCase() === entry.name.toLowerCase()
  );
  const next = [...allEntries];
  const stamped = { ...entry, updatedAt: new Date().toISOString() };
  if (idx >= 0) next[idx] = stamped;
  else next.push(stamped);
  return next.sort((a, b) => a.name.localeCompare(b.name));
}
