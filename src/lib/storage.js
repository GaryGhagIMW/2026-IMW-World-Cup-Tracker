import { POOL_ENTRIES } from '../data/pool-entries.js';

const STORAGE_KEY = 'imw-wc-2026';

export function getLeaderboardEntries(state = {}) {
  const remoteEntries = state.remoteEntries ?? [];
  const localEntries = state.allEntries ?? [];

  let merged = remoteEntries.length ? [...remoteEntries] : [...POOL_ENTRIES];

  for (const entry of localEntries) {
    merged = addOrUpdateEntry(merged, entry);
  }

  return merged;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    return { ...getDefaultState(), ...JSON.parse(raw) };
  } catch {
    return getDefaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
