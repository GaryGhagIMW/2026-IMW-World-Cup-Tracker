/** Game rules, scoring weights, branding, and submission settings. */
export const GAME_CONFIG = {
  title: '2026 World Cup Pool',
  subtitle: 'IMW Industries · EEC activity',
  tagline: 'Driven by knowledge, fueled by Experience',
  organization: 'IMW Industries',
  website: 'https://www.imw.ca',

  /** Current app phase — knockout UI unlocks after group stage. */
  phase: 'groupStage',

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
    listName: 'World Cup 2026 Entries',
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
      description: 'Rank all 12 groups (1st through 4th place).',
    },
    knockoutEarly: {
      id: 'knockoutEarly',
      label: 'First 3 knockout games',
      start: '2026-06-25',
      end: '2026-06-26',
      description:
        'Opens after group stage — pick winners for the first three Round of 32 matches.',
    },
    knockoutRest: {
      id: 'knockoutRest',
      label: 'Remaining knockout picks',
      start: '2026-06-29',
      end: '2026-07-18',
      description:
        'Pick all remaining knockout winners and predict the Final score (tiebreaker).',
    },
  },

  finalDate: '2026-07-19',
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
