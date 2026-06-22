import { GAME_CONFIG } from '../data/config.js';

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getToday() {
  return startOfDay(new Date());
}

export function isWindowOpen(windowKey, today = getToday()) {
  const window = GAME_CONFIG.windows[windowKey];
  if (!window) return false;
  if (window.submissionsClosed) return false;
  const start = parseDate(window.start);
  const end = parseDate(window.end);
  return today >= start && today <= end;
}

export function getWindowStatus(windowKey, today = getToday()) {
  const window = GAME_CONFIG.windows[windowKey];
  if (!window) return { state: 'unknown' };

  if (window.submissionsClosed) {
    return {
      state: 'closed',
      label: 'Entries closed',
    };
  }

  const start = parseDate(window.start);
  const end = parseDate(window.end);

  if (today < start) {
    return {
      state: 'upcoming',
      label: `Opens ${formatDate(window.start)}`,
      daysUntil: Math.ceil((start - today) / 86400000),
    };
  }
  if (today > end) {
    return {
      state: 'closed',
      label: `Closed ${formatDate(window.end)}`,
    };
  }
  return {
    state: 'open',
    label: `Open until ${formatDate(window.end)}`,
    daysLeft: Math.ceil((end - today) / 86400000),
  };
}

export function formatDate(dateStr) {
  const date = parseDate(dateStr);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateRange(start, end) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function canEditGroupStage(today = getToday()) {
  return isWindowOpen('groupStage', today);
}

export function isGroupStageClosed() {
  return Boolean(GAME_CONFIG.windows.groupStage?.submissionsClosed);
}

export function canEditKnockoutEarly(today = getToday()) {
  return isWindowOpen('knockoutEarly', today);
}

export function canEditKnockoutRest(today = getToday()) {
  return isWindowOpen('knockoutRest', today);
}

export function canEditKnockoutMatch(match, today = getToday()) {
  if (match.earlyPick) {
    return canEditKnockoutEarly(today) || canEditKnockoutRest(today);
  }
  return canEditKnockoutRest(today);
}

export function canEditFinalScore(today = getToday()) {
  return canEditKnockoutRest(today);
}

export function isKnockoutSubmissionOpen(today = getToday()) {
  return canEditKnockoutEarly(today) || canEditKnockoutRest(today);
}
