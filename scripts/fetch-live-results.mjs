/**
 * Fetch live group standings from worldcup26.ir and write public/data/live-results.json
 * Run locally: node scripts/fetch-live-results.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWorldCupStandings } from '../src/lib/worldcup-api.js';

const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'data',
  'live-results.json'
);

async function main() {
  const results = await fetchWorldCupStandings();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${OUT_PATH} (${results.groupsWithMatches}/12 groups with matches played)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
