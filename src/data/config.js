/** Game rules, scoring weights, branding, and submission settings. */
export const GAME_CONFIG = {
  title: '2026 World Cup Pool — Champions',
  subtitle: 'IMW Industries · Final standings',
  tagline: 'Spain 1–0 Argentina · Mali Lombard wins the pool',
  organization: 'IMW Industries',
  website: 'https://www.imw.ca',

  /** Current app phase — sent with SharePoint / Excel submissions. */
  phase: 'knockout',

  adminPin: '22002266',

  /**
   * SharePoint submission endpoint.
   * Paste your Power Automate HTTP trigger URL after following docs/sharepoint-setup.md.
   * The flow writes each submission to a SharePoint List (no local file needed).
   */
  sharepoint: {
    enabled: true,
    webhookUrl:
      'https://defaultce489f496a08487cbc9c7d75078824.ea.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/b11215c7b719489eb98d80e420ecc2a9/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=0p7lexnvSJPBp_SqknHYg3wRYPcMojqxMXdRk4TkwYc',
    /** Paste URL for the "Get leaderboard" Power Automate flow after Step 4 in docs/sharepoint-setup.md. Leave blank until the list branch is configured — do not use the submit URL here before that. */
    leaderboardFetchUrl: '',
    listName: 'World Cup 2026 Entries',
    /** OneDrive workbook for knockout picks (Knockout sheet / KnockoutEntries table). */
    knockoutExcelPath: 'World Cup 2026 Pool/Group Stage Entries.xlsx',
    knockoutWorksheetName: 'Knockout',
    knockoutTableName: 'KnockoutEntries',
  },

  scoring: {
    group: {
      perPosition: 1,
      winnerBonus: 1,
    },
    knockout: {
      r32: 1,
      r16: 2,
      qf: 4,
      sf: 8,
      final: 16,
    },
  },

  windows: {
    groupStage: {
      id: 'groupStage',
      label: 'Group stage picks',
      start: '2026-06-01',
      end: '2026-06-10',
      /** Manual close — submissions disabled even if still inside the date window. */
      submissionsClosed: true,
      description: 'Rank all 12 groups (1st through 4th place).',
    },
    knockoutEarly: {
      id: 'knockoutEarly',
      label: 'First 3 knockout games',
      start: '2026-06-25',
      end: '2026-06-26',
      submissionsClosed: true,
      description: 'Superseded by full bracket submission.',
    },
    knockoutBatch2: {
      id: 'knockoutBatch2',
      label: 'Match 52 (Brazil vs Japan)',
      start: '2026-06-26',
      end: '2026-06-28',
      submissionsClosed: true,
      description: 'Superseded by full bracket submission.',
    },
    knockoutBracket: {
      id: 'knockoutBracket',
      label: 'Full knockout bracket',
      start: '2026-06-26',
      end: '2026-06-30',
      endTime: '10:00',
      endTimeOffset: '-08:00',
      endTimeLabel: 'PST',
      /** Closed manually at deadline — Jun 30, 2026 10:00 AM PST. */
      submissionsClosed: true,
      description:
        'Predict the entire knockout bracket through the Final and submit once.',
    },
    knockoutRest: {
      id: 'knockoutRest',
      label: 'Remaining knockout picks',
      start: '2026-06-29',
      end: '2026-07-18',
      submissionsClosed: true,
      description: 'Superseded by full bracket submission.',
    },
  },

  /** Official results for completed knockout matches — picks are locked for all users. */
  lockedKnockoutResults: {
    /** Match 73 — South Africa 0-1 Canada (Jun 28, 2026) */
    'r32-1': 'CAN',
    /** Match 74 — Germany 1-1 Paraguay, PAR wins 4-3 pens (Jun 29, 2026) */
    'r32-2': 'PAR',
    /** Match 75 — Netherlands 1-1 Morocco, MAR wins 3-2 pens (Jun 29, 2026) */
    'r32-3': 'MAR',
    /** Match 76 — Brazil 2-1 Japan (Jun 29, 2026) */
    'r32-4': 'BRA',
    /** Match 77 — France 2-0 Sweden (Jun 30, 2026) */
    'r32-5': 'FRA',
    /** Match 78 — Ivory Coast 0-2 Norway (Jun 30, 2026) */
    'r32-6': 'NOR',
    /** Match 79 — Mexico 2-0 Ecuador (Jun 30, 2026) */
    'r32-7': 'MEX',
    /** Match 80 — England 2-0 DR Congo (Jul 1, 2026) */
    'r32-8': 'ENG',
    /** Match 81 — USA 2-1 Bosnia (Jul 1, 2026) */
    'r32-9': 'USA',
    /** Match 82 — Belgium 2-0 Egypt (Jul 1, 2026) */
    'r32-10': 'BEL',
    /** Match 83 — Portugal 2-1 Colombia (Jul 2, 2026) */
    'r32-11': 'POR',
    /** Match 84 — Spain 2-1 Algeria (Jul 2, 2026) */
    'r32-12': 'ESP',
    /** Match 85 — Australia 0-1 Egypt (Jul 3, 2026) — EGY advanced */
    'r32-13': 'EGY',
    /** Match 86 — Switzerland 2-1 Algeria (Jul 3, 2026) */
    'r32-14': 'SUI',
    /** Match 87 — Argentina 2-0 Venezuela (Jul 4, 2026) */
    'r32-15': 'ARG',
    /** Match 88 — Colombia 1-0 Ghana (Jul 4, 2026) */
    'r32-16': 'COL',
    /** Match 89 — France 2-0 Mexico (Jul 4, 2026) */
    'r16-1': 'FRA',
    /** Match 90 — Canada 0-2 Morocco (Jul 4, 2026) */
    'r16-2': 'MAR',
    /** Match 91 — Brazil 2-1 Norway (Jul 5, 2026) */
    'r16-3': 'NOR',
    /** Match 92 — England 2-0 Switzerland (Jul 5, 2026) */
    'r16-4': 'ENG',
    /** Match 93 — Portugal 0-1 Spain (Jul 6, 2026) */
    'r16-5': 'ESP',
    /** Match 94 — USA 1-4 Belgium (Jul 6, 2026) */
    'r16-6': 'BEL',
    /** Match 95 — Argentina 3-2 Egypt (Jul 7, 2026) */
    'r16-7': 'ARG',
    /** Match 96 — Switzerland 0-0 Colombia, SUI wins pens (Jul 7, 2026) */
    'r16-8': 'SUI',
    /** Match 97 — France 2-0 Morocco (Jul 9, 2026) */
    'qf-1': 'FRA',
    /** Match 98 — Spain 2-1 Belgium (Jul 10, 2026) */
    'qf-2': 'ESP',
    /** Match 99 — Norway 1-2 England (Jul 11, 2026) */
    'qf-3': 'ENG',
    /** Match 100 — Argentina 3-1 Switzerland (Jul 11, 2026) */
    'qf-4': 'ARG',
    /** Match 101 — Spain 2-0 France (Jul 14, 2026) */
    'sf-1': 'ESP',
    /** Match 102 — Argentina 1-0 England (Jul 15, 2026) */
    'sf-2': 'ARG',
    /** Match 104 — Spain 1-0 Argentina (Jul 19, 2026) */
    'final': 'ESP',
  },

  /**
   * R32 matches compromised by the Jun 30 10:00 AM PST deadline — results were
   * known to some players before submit. Everyone receives 1 pt per match here.
   */
  knockoutFairnessAutoCredit: ['r32-1', 'r32-2', 'r32-3', 'r32-4'],

  finalDate: '2026-07-19',

  /** Auto-fetch knockout results for live leaderboard scoring (see scripts/fetch-live-results.mjs). */
  liveResults: {
    enabled: true,
    provider: 'worldcup26.ir',
    /** Pull directly from the API in the browser (falls back to live-results.json). */
    fetchFromApi: true,
    /** Refresh while viewing the leaderboard or standings (ms). */
    refreshMs: 120_000,
  },
};

export const ROUND_LABELS = {
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-finals',
  sf: 'Semi-finals',
  final: 'Final',
};

export const ROUND_POINTS = GAME_CONFIG.scoring.knockout;

export function getMaxGroupPoints() {
  return (
    12 *
    (4 * GAME_CONFIG.scoring.group.perPosition +
      GAME_CONFIG.scoring.group.winnerBonus)
  );
}

export function getMaxKnockoutPoints() {
  const weights = GAME_CONFIG.scoring.knockout;
  return (
    16 * weights.r32 +
    8 * weights.r16 +
    4 * weights.qf +
    2 * weights.sf +
    1 * weights.final
  );
}
