/**
 * Fetch live group standings from worldcup26.ir and write public/data/live-results.json
 * Run locally: node scripts/fetch-live-results.mjs
 *
 * Never exits with a non-zero code — CI should deploy even when the API is temporarily down.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

const EMPTY_RESULTS = {
  source: 'worldcup26.ir',
  updatedAt: new Date().toISOString(),
  groupsWithMatches: 0,
  groups: {},
  meta: {},
  standings: {},
};

async function fetchWithRetry(retries = 3, delayMs = 2000) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetchWorldCupStandings();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.warn(`Fetch attempt ${attempt} failed: ${err.message}. Retrying…`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr;
}

async function main() {
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  try {
    const results = await fetchWithRetry();
    writeFileSync(OUT_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    console.log(
      `Wrote ${OUT_PATH} (${results.groupsWithMatches}/12 groups with matches played)`
    );
    return;
  } catch (err) {
    console.warn(`Live standings fetch failed after retries: ${err.message}`);
  }

  if (existsSync(OUT_PATH)) {
    console.warn(`Keeping existing ${OUT_PATH}`);
    return;
  }

  console.warn(`Writing empty fallback to ${OUT_PATH}`);
  writeFileSync(OUT_PATH, `${JSON.stringify(EMPTY_RESULTS, null, 2)}\n`, 'utf8');
}

main().catch((err) => {
  console.error(err);
});
