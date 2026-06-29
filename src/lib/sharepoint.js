import { GAME_CONFIG } from '../data/config.js';
import { KNOCKOUT_MATCHES } from '../data/knockout.js';
import { isGroupStageClosed, isKnockoutSubmissionOpen } from './dates.js';
import { isAdminUnlocked } from './admin.js';
import { GROUPS } from '../data/groups.js';
import { coerceFinalScore } from './scoring.js';

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

function flattenKnockoutForSharePoint(knockout, finalScore) {
  const flat = {};
  for (const match of KNOCKOUT_MATCHES) {
    const key = `Knockout_${match.id.replace(/-/g, '_')}`;
    flat[key] = knockout?.[match.id] ?? '';
  }
  const normalized = coerceFinalScore(finalScore);
  flat.FinalScoreWinner =
    normalized.winnerGoals != null ? normalized.winnerGoals : '';
  flat.FinalScoreLoser =
    normalized.loserGoals != null ? normalized.loserGoals : '';
  /** Legacy Excel columns — winner/loser goals (not FIFA home/away). */
  flat.FinalScoreHome = flat.FinalScoreWinner;
  flat.FinalScoreAway = flat.FinalScoreLoser;
  return flat;
}

export function buildSharePointPayload(entry) {
  const submittedAt = new Date().toISOString();
  return {
    playerName: entry.name,
    playerEmail: entry.email ?? '',
    submittedAt,
    phase: 'groupStage',
    action: 'submitGroup',
    groups: entry.groups,
    entryJson: JSON.stringify({
      name: entry.name,
      email: entry.email ?? '',
      groups: entry.groups,
      submittedAt,
      phase: 'groupStage',
    }),
    ...flattenGroupsForSharePoint(entry.groups),
  };
}

export function buildKnockoutSharePointPayload(entry, submitPhase) {
  const submittedAt = new Date().toISOString();
  const entryJson = JSON.stringify({
    name: entry.name,
    email: entry.email ?? '',
    groups: entry.groups,
    knockout: entry.knockout,
    finalScore: entry.finalScore,
    submittedAt,
    phase: 'knockout',
    submitPhase,
  });

  return {
    action: 'submitKnockout',
    phase: 'knockout',
    submitPhase,
    playerName: entry.name,
    playerEmail: entry.email ?? '',
    submittedAt,
    groups: entry.groups,
    knockout: entry.knockout,
    finalScore: entry.finalScore,
    entryJson,
    /** Excel KnockoutEntries column names for Power Automate mapping */
    PlayerName: entry.name,
    Email: entry.email ?? '',
    SubmittedAt: submittedAt,
    SubmitPhase: submitPhase,
    EntryJson: entryJson,
    ...flattenKnockoutForSharePoint(entry.knockout, entry.finalScore),
  };
}

export function isSharePointConfigured() {
  const url = GAME_CONFIG.sharepoint.webhookUrl?.trim();
  return GAME_CONFIG.sharepoint.enabled && Boolean(url);
}

async function postToWebhook(payload) {
  const webhookUrl = GAME_CONFIG.sharepoint.webhookUrl?.trim();
  if (!webhookUrl) {
    throw new Error(
      'SharePoint webhook URL is not configured. See docs/sharepoint-setup.md.'
    );
  }

  const body = JSON.stringify(payload);
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

/**
 * Submit group-stage entry to SharePoint via a thin HTTP gateway flow.
 */
export async function submitToSharePoint(entry) {
  if (isGroupStageClosed()) {
    throw new Error('Group stage entries are closed. Submissions are no longer accepted.');
  }
  return postToWebhook(buildSharePointPayload(entry));
}

/** Submit knockout picks to the same Power Automate flow (phase: knockout). */
export async function submitKnockoutToSharePoint(entry, submitPhase) {
  if (!isKnockoutSubmissionOpen() && !isAdminUnlocked()) {
    throw new Error('Knockout submission window is not open.');
  }
  return postToWebhook(buildKnockoutSharePointPayload(entry, submitPhase));
}

export function getSharePointListHint() {
  return GAME_CONFIG.sharepoint.listName;
}
