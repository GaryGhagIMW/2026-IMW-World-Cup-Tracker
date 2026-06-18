/** Shared transform for worldcup26.ir API responses. */

export const WORLDCUP_API_BASE = 'https://worldcup26.ir/get';

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptyStats() {
  return { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
}

/** Fix missing draw counts when MP/W/L are present but D is wrong (upstream API bug). */
export function reconcileStandingRow(row) {
  const mp = toNum(row.mp);
  const w = toNum(row.w);
  const l = toNum(row.l);
  let d = toNum(row.d);
  const gf = toNum(row.gf);
  const ga = toNum(row.ga);
  const gd = gf - ga;
  const impliedD = Math.max(0, mp - w - l);

  if (mp > 0 && d !== impliedD) {
    d = impliedD;
  }

  const pts = toNum(row.pts) || w * 3 + d;

  return { mp, w, d, l, gf, ga, gd, pts };
}

export function isGameFinished(game) {
  if (String(game?.finished ?? '').toUpperCase() === 'TRUE') return true;
  const elapsed = String(game?.time_elapsed ?? '').toLowerCase();
  return ['finished', 'ft', 'full', 'fulltime'].includes(elapsed);
}

/** Recompute group tables from finished group-stage match scores. */
export function buildStandingsFromGames(games) {
  const byGroup = {};

  for (const game of games ?? []) {
    if (String(game.type ?? '').toLowerCase() !== 'group') continue;
    if (!isGameFinished(game)) continue;

    const groupId = String(game.group ?? '').toUpperCase();
    const homeId = String(game.home_team_id ?? '');
    const awayId = String(game.away_team_id ?? '');
    if (!groupId || !homeId || !awayId || homeId === '0' || awayId === '0') {
      continue;
    }

    const homeScore = toNum(game.home_score);
    const awayScore = toNum(game.away_score);

    if (!byGroup[groupId]) byGroup[groupId] = {};
    const groupStats = byGroup[groupId];
    if (!groupStats[homeId]) groupStats[homeId] = emptyStats();
    if (!groupStats[awayId]) groupStats[awayId] = emptyStats();

    const home = groupStats[homeId];
    const away = groupStats[awayId];

    home.mp += 1;
    away.mp += 1;
    home.gf += homeScore;
    home.ga += awayScore;
    away.gf += awayScore;
    away.ga += homeScore;

    if (homeScore > awayScore) {
      home.w += 1;
      away.l += 1;
    } else if (homeScore < awayScore) {
      home.l += 1;
      away.w += 1;
    } else {
      home.d += 1;
      away.d += 1;
    }
  }

  for (const groupStats of Object.values(byGroup)) {
    for (const stats of Object.values(groupStats)) {
      stats.gd = stats.gf - stats.ga;
      stats.pts = stats.w * 3 + stats.d;
    }
  }

  return byGroup;
}

function resolveTeamStats(row, groupId, computedByGroup) {
  const teamId = String(row.team_id);
  const fromGames = computedByGroup?.[groupId]?.[teamId];
  if (fromGames?.mp > 0) return fromGames;
  return reconcileStandingRow(row);
}

function enrichGroupTeams(group, computedByGroup) {
  const groupId = group.name;
  return (group.teams ?? []).map((row) => {
    const stats = resolveTeamStats(row, groupId, computedByGroup);
    return {
      ...row,
      mp: stats.mp,
      w: stats.w,
      d: stats.d,
      l: stats.l,
      gf: stats.gf,
      ga: stats.ga,
      gd: stats.gd,
      pts: stats.pts,
    };
  });
}

export function rankTeams(teams) {
  return [...teams].sort((a, b) => {
    const pts = toNum(b.pts) - toNum(a.pts);
    if (pts) return pts;
    const gd = toNum(b.gd) - toNum(a.gd);
    if (gd) return gd;
    const gf = toNum(b.gf) - toNum(a.gf);
    if (gf) return gf;
    return toNum(a.team_id) - toNum(b.team_id);
  });
}

export function buildGroupStandingsDetail(teams, groups, computedByGroup = {}) {
  const teamById = new Map(teams.map((t) => [String(t.id), t]));
  const standings = {};

  for (const group of groups) {
    const groupId = group.name;
    const ranked = rankTeams(enrichGroupTeams(group, computedByGroup));
    standings[groupId] = ranked.map((row, index) => {
      const team = teamById.get(String(row.team_id));
      return {
        rank: index + 1,
        code: team?.fifa_code ?? '',
        name: team?.name_en ?? '',
        flag: team?.flag ?? '',
        mp: toNum(row.mp),
        w: toNum(row.w),
        d: toNum(row.d),
        l: toNum(row.l),
        gf: toNum(row.gf),
        ga: toNum(row.ga),
        gd: toNum(row.gd),
        pts: toNum(row.pts),
      };
    });
  }

  return standings;
}

export function transformWorldCupPayload(teams, groups, games = []) {
  const teamById = new Map(teams.map((t) => [String(t.id), t]));
  const computedByGroup = buildStandingsFromGames(games);
  const groupResults = {};
  let groupsWithMatches = 0;

  for (const group of groups) {
    const groupId = group.name;
    const ranked = rankTeams(enrichGroupTeams(group, computedByGroup));
    const codes = ranked
      .map((row) => teamById.get(String(row.team_id))?.fifa_code ?? '')
      .filter(Boolean);

    const matchesPlayed = ranked.some((row) => toNum(row.mp) > 0);
    if (matchesPlayed) groupsWithMatches += 1;

    groupResults[groupId] = {
      positions: codes.slice(0, 4),
      matchesPlayed: ranked.reduce(
        (max, row) => Math.max(max, toNum(row.mp)),
        0
      ),
      live: matchesPlayed,
    };
  }

  return {
    source: 'worldcup26.ir',
    updatedAt: new Date().toISOString(),
    groupsWithMatches,
    groups: Object.fromEntries(
      Object.entries(groupResults).map(([id, g]) => [id, g.positions])
    ),
    meta: groupResults,
    standings: buildGroupStandingsDetail(teams, groups, computedByGroup),
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

export async function fetchWorldCupStandings() {
  const [teamsPayload, groupsPayload, gamesPayload] = await Promise.all([
    fetchJson(`${WORLDCUP_API_BASE}/teams`),
    fetchJson(`${WORLDCUP_API_BASE}/groups`),
    fetchJson(`${WORLDCUP_API_BASE}/games`),
  ]);

  if (!teamsPayload?.teams || !groupsPayload?.groups) {
    throw new Error('World Cup API error (teams or groups unavailable)');
  }

  return transformWorldCupPayload(
    teamsPayload.teams,
    groupsPayload.groups,
    gamesPayload?.games ?? []
  );
}
