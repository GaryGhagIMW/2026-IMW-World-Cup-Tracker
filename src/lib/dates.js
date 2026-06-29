import { GAME_CONFIG } from '../data/config.js';
import { isAdminUnlocked } from './admin.js';
import { isMatchPickLocked } from './knockout-bracket.js';

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseWindowStart(window) {
  return parseDate(window.start);
}

function parseWindowEnd(window) {
  const base = parseDate(window.end);
  if (window.endTime && window.endTimeOffset) {
    const [h, m] = window.endTime.split(':').map(Number);
    const hh = String(h).padStart(2, '0');
    const mm = String(m ?? 0).padStart(2, '0');
    return new Date(`${window.end}T${hh}:${mm}:00.000${window.endTimeOffset}`);
  }
  if (window.endTime) {
    const [h, m] = window.endTime.split(':').map(Number);
    return new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      h,
      m ?? 0,
      59,
      999
    );
  }
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    23,
    59,
    59,
    999
  );
}

export function getToday() {
  return startOfDay(new Date());
}

export function isWindowOpen(windowKey, now = new Date()) {
  const window = GAME_CONFIG.windows[windowKey];
  if (!window) return false;
  if (window.submissionsClosed) return false;
  const start = parseWindowStart(window);
  const end = parseWindowEnd(window);
  return now >= start && now <= end;
}

export function getWindowStatus(windowKey, now = new Date()) {
  const window = GAME_CONFIG.windows[windowKey];
  if (!window) return { state: 'unknown' };

  if (window.submissionsClosed) {
    return {
      state: 'closed',
      label: 'Closed',
    };
  }

  const start = parseWindowStart(window);
  const end = parseWindowEnd(window);
  const today = startOfDay(now);
  const startDay = startOfDay(start);

  if (today < startDay) {
    return {
      state: 'upcoming',
      label: `Opens ${formatDate(window.start)}`,
      daysUntil: Math.ceil((startDay - today) / 86400000),
    };
  }
  if (now > end) {
    return {
      state: 'closed',
      label: `Closed ${formatWindowDeadline(window)}`,
    };
  }
  return {
    state: 'open',
    label: `Open until ${formatWindowDeadline(window)}`,
    msLeft: end - now,
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

export function formatWindowDeadline(window) {
  if (window.endTime) {
    const [h, m] = window.endTime.split(':').map(Number);
    const date = parseDate(window.end);
    const hour12 = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    const mm = String(m ?? 0).padStart(2, '0');
    const dateLabel = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const tz = window.endTimeLabel ?? '';
    return tz
      ? `${dateLabel}, ${hour12}:${mm} ${ampm} ${tz}`
      : `${dateLabel}, ${hour12}:${mm} ${ampm}`;
  }
  return formatDate(window.end);
}

export function formatWindowRange(window) {
  return `${formatDate(window.start)} – ${formatWindowDeadline(window)}`;
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

export function canEditKnockoutBracket(now = new Date()) {
  return isAdminUnlocked() || isWindowOpen('knockoutBracket', now);
}

/** @deprecated Use canEditKnockoutBracket */
export function canEditKnockoutEarly(now = new Date()) {
  return canEditKnockoutBracket(now);
}

/** @deprecated Use canEditKnockoutBracket */
export function canEditKnockoutBatch2(now = new Date()) {
  return canEditKnockoutBracket(now);
}

/** @deprecated Use canEditKnockoutBracket */
export function canEditKnockoutRest(now = new Date()) {
  return canEditKnockoutBracket(now);
}

export function canEditKnockoutMatch(match, now = new Date()) {
  if (isMatchPickLocked(match.id)) return false;
  return canEditKnockoutBracket(now);
}

export function canEditFinalScore(now = new Date()) {
  return canEditKnockoutBracket(now);
}

export function isKnockoutSubmissionOpen(now = new Date()) {
  return canEditKnockoutBracket(now);
}
