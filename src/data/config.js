/** Game rules, scoring weights, branding, and submission settings. */
export const GAME_CONFIG = {
  title: '2026 World Cup Pool',
  subtitle: 'IMW Industries · EEC activity',
  tagline: 'Driven by knowledge, fueled by Experience',
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
  },

  finalDate: '2026-07-19',

  /** Auto-fetch group standings for live leaderboard scoring (see scripts/fetch-live-results.mjs). */
  liveResults: {
    enabled: true,
    provider: 'worldcup26.ir',
    /** Pull directly from the API in the browser (falls back to live-results.json). */
    fetchFromApi: true,
    /** Refresh while viewing the leaderboard (ms). */
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
