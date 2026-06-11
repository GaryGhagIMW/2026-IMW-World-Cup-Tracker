/**
 * Fetch live group standings from worldcup26.ir and write public/data/live-results.json
 * Run locally: node scripts/fetch-live-results.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://worldcup26.ir/get';
const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'data',
  'live-results.json'
);

function rankTeams(teams) {
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

async function fetchLiveResults() {
  const [teamsRes, groupsRes] = await Promise.all([
    fetch(`${API_BASE}/teams`),
    fetch(`${API_BASE}/groups`),
  ]);

  if (!teamsRes.ok || !groupsRes.ok) {
    throw new Error(
      `API error (teams ${teamsRes.status}, groups ${groupsRes.status})`
    );
  }

  const { teams } = await teamsRes.json();
  const { groups } = await groupsRes.json();

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
      matchesPlayed: ranked.reduce((sum, row) => Math.max(sum, Number(row.mp)), 0),
      live: matchesPlayed,
    };
  }

  const results = {
    source: 'worldcup26.ir',
    updatedAt: new Date().toISOString(),
    groupsWithMatches,
    groups: Object.fromEntries(
      Object.entries(groupResults).map(([id, g]) => [id, g.positions])
    ),
    meta: groupResults,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  console.log(
    `Wrote ${OUT_PATH} (${groupsWithMatches}/12 groups with matches played)`
  );
}

fetchLiveResults().catch((err) => {
  console.error(err);
  process.exit(1);
});
