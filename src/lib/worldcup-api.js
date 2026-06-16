/** Shared transform for worldcup26.ir API responses. */

export const WORLDCUP_API_BASE = 'https://worldcup26.ir/get';

export function rankTeams(teams) {
  return [...teams].sort((a, b) => {
    const pts = Number(b.pts) - Number(a.pts);
    if (pts) return pts;
    const gd = Number(b.gd) - Number(a.gd);
    if (gd) return gd;
    const gf = Number(b.gf) - Number(a.gf);
    if (gf) return gf;
    return Number(a.team_id) - Number(b.team_id);
  });
}

export function buildGroupStandingsDetail(teams, groups) {
  const teamById = new Map(teams.map((t) => [String(t.id), t]));
  const standings = {};

  for (const group of groups) {
    const groupId = group.name;
    const ranked = rankTeams(group.teams ?? []);
    standings[groupId] = ranked.map((row, index) => {
      const team = teamById.get(String(row.team_id));
      return {
        rank: index + 1,
        code: team?.fifa_code ?? '',
        name: team?.name_en ?? '',
        flag: team?.flag ?? '',
        mp: Number(row.mp),
        w: Number(row.w),
        d: Number(row.d),
        l: Number(row.l),
        gf: Number(row.gf),
        ga: Number(row.ga),
        gd: Number(row.gd),
        pts: Number(row.pts),
      };
    });
  }

  return standings;
}

export function transformWorldCupPayload(teams, groups) {
  const teamById = new Map(teams.map((t) => [String(t.id), t]));
  const groupResults = {};
  let groupsWithMatches = 0;

  for (const group of groups) {
    const groupId = group.name;
    const ranked = rankTeams(group.teams ?? []);
    const codes = ranked
      .map((row) => teamById.get(String(row.team_id))?.fifa_code ?? '')
      .filter(Boolean);

    const matchesPlayed = ranked.some((row) => Number(row.mp) > 0);
    if (matchesPlayed) groupsWithMatches += 1;

    groupResults[groupId] = {
      positions: codes.slice(0, 4),
      matchesPlayed: ranked.reduce(
        (max, row) => Math.max(max, Number(row.mp)),
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
    standings: buildGroupStandingsDetail(teams, groups),
  };
}

export async function fetchWorldCupStandings() {
  const [teamsRes, groupsRes] = await Promise.all([
    fetch(`${WORLDCUP_API_BASE}/teams`),
    fetch(`${WORLDCUP_API_BASE}/groups`),
  ]);

  if (!teamsRes.ok || !groupsRes.ok) {
    throw new Error(
      `World Cup API error (teams ${teamsRes.status}, groups ${groupsRes.status})`
    );
  }

  const { teams } = await teamsRes.json();
  const { groups } = await groupsRes.json();
  return transformWorldCupPayload(teams, groups);
}
