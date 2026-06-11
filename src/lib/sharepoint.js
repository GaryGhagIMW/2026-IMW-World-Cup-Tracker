import { GAME_CONFIG } from '../data/config.js';
import { isGroupStageClosed } from './dates.js';
import { GROUPS } from '../data/groups.js';

function flattenGroupsForSharePoint(groups) {
  const flat = {};
  for (const group of GROUPS) {
    const picks = groups[group.id] ?? [];
    flat[`Group${group.id}_1st`] = picks[0] ?? '';
    flat[`Group${group.id}_2nd`] = picks[1] ?? '';
    flat[`Group${group.id}_3rd`] = picks[2] ?? '';
    flat[`Group${group.id}_4th`] = picks[3] ?? '';
  }
  return flat;
}

export function buildSharePointPayload(entry) {
  const submittedAt = new Date().toISOString();
  return {
    playerName: entry.name,
    playerEmail: entry.email ?? '',
    submittedAt,
    phase: GAME_CONFIG.phase,
    groups: entry.groups,
    entryJson: JSON.stringify({
      name: entry.name,
      email: entry.email ?? '',
      groups: entry.groups,
      submittedAt,
      phase: GAME_CONFIG.phase,
    }),
    ...flattenGroupsForSharePoint(entry.groups),
  };
}

export function isSharePointConfigured() {
  const url = GAME_CONFIG.sharepoint.webhookUrl?.trim();
  return GAME_CONFIG.sharepoint.enabled && Boolean(url);
}

/**
 * Submit group-stage entry to SharePoint via a thin HTTP gateway flow.
 * SharePoint List is the system of record; Power Automate (optional) only
 * receives the POST and creates the list item — no local file required.
 */
export async function submitToSharePoint(entry) {
  if (isGroupStageClosed()) {
    throw new Error('Group stage entries are closed. Submissions are no longer accepted.');
  }

  const webhookUrl = GAME_CONFIG.sharepoint.webhookUrl?.trim();
  if (!webhookUrl) {
    throw new Error(
      'SharePoint webhook URL is not configured. See docs/sharepoint-setup.md.'
    );
  }

  const payload = buildSharePointPayload(entry);
  const body = JSON.stringify(payload);

  // Try standard JSON POST first, then text/plain to avoid CORS preflight.
  const attempts = [
    { headers: { 'Content-Type': 'application/json' }, body },
    { headers: { 'Content-Type': 'text/plain' }, body },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: attempt.headers,
        body: attempt.body,
      });
      if (response.ok || response.status === 202) {
        return { ok: true, status: response.status };
      }
      lastError = new Error(`SharePoint gateway returned ${response.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error('Could not reach SharePoint gateway.');
}

export function getSharePointListHint() {
  return GAME_CONFIG.sharepoint.listName;
}
