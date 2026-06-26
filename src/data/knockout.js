/**
 * Knockout bracket structure for the 48-team format.
 * Match labels use FIFA slot notation; update team codes after the draw
 * resolves third-place assignments.
 *
 * earlyPick: true = must be submitted June 25–26 (first 3 R32 games).
 */
export const KNOCKOUT_MATCHES = [
  // Round of 32 — first weekend batch (early picks)
  {
    id: 'r32-1',
    round: 'r32',
    label: 'Match 49',
    description: '2A vs 2B',
    homeSlot: '2A',
    awaySlot: '2B',
    earlyPick: true,
    kickoff: '2026-06-28',
  },
  {
    id: 'r32-2',
    round: 'r32',
    label: 'Match 50',
    description: '1E vs 3A/B/C/D/F',
    homeSlot: '1E',
    awaySlot: '3rd',
    earlyPick: true,
    kickoff: '2026-06-28',
  },
  {
    id: 'r32-3',
    round: 'r32',
    label: 'Match 51',
    description: '1F vs 2C',
    homeSlot: '1F',
    awaySlot: '2C',
    earlyPick: true,
    kickoff: '2026-06-28',
  },

  // Round of 32 — remaining
  {
    id: 'r32-4',
    round: 'r32',
    label: 'Match 52',
    description: '1C vs 2F',
    homeSlot: '1C',
    awaySlot: '2F',
    batch2Pick: true,
    kickoff: '2026-06-29',
  },
  {
    id: 'r32-5',
    round: 'r32',
    label: 'Match 53',
    description: '1I vs 3C/D/F/G/H',
    homeSlot: '1I',
    awaySlot: '3rd',
    kickoff: '2026-06-29',
  },
  {
    id: 'r32-6',
    round: 'r32',
    label: 'Match 54',
    description: '2E vs 2I',
    homeSlot: '2E',
    awaySlot: '2I',
    kickoff: '2026-06-29',
  },
  {
    id: 'r32-7',
    round: 'r32',
    label: 'Match 55',
    description: '1A vs 3C/E/F/H/I',
    homeSlot: '1A',
    awaySlot: '3rd',
    kickoff: '2026-06-29',
  },
  {
    id: 'r32-8',
    round: 'r32',
    label: 'Match 56',
    description: '1L vs 3E/H/I/J/K',
    homeSlot: '1L',
    awaySlot: '3rd',
    kickoff: '2026-06-29',
  },
  {
    id: 'r32-9',
    round: 'r32',
    label: 'Match 57',
    description: '1D vs 3B/E/F/I/J',
    homeSlot: '1D',
    awaySlot: '3rd',
    kickoff: '2026-06-30',
  },
  {
    id: 'r32-10',
    round: 'r32',
    label: 'Match 58',
    description: '1G vs 3A/E/H/I/J',
    homeSlot: '1G',
    awaySlot: '3rd',
    kickoff: '2026-06-30',
  },
  {
    id: 'r32-11',
    round: 'r32',
    label: 'Match 59',
    description: '2K vs 2L',
    homeSlot: '2K',
    awaySlot: '2L',
    kickoff: '2026-06-30',
  },
  {
    id: 'r32-12',
    round: 'r32',
    label: 'Match 60',
    description: '1H vs 2J',
    homeSlot: '1H',
    awaySlot: '2J',
    kickoff: '2026-06-30',
  },
  {
    id: 'r32-13',
    round: 'r32',
    label: 'Match 61',
    description: '2D vs 2G',
    homeSlot: '2D',
    awaySlot: '2G',
    kickoff: '2026-07-01',
  },
  {
    id: 'r32-14',
    round: 'r32',
    label: 'Match 62',
    description: '1B vs 3E/F/G/I/J',
    homeSlot: '1B',
    awaySlot: '3rd',
    kickoff: '2026-07-01',
  },
  {
    id: 'r32-15',
    round: 'r32',
    label: 'Match 63',
    description: '1J vs 2H',
    homeSlot: '1J',
    awaySlot: '2H',
    kickoff: '2026-07-01',
  },
  {
    id: 'r32-16',
    round: 'r32',
    label: 'Match 64',
    description: '1K vs 3D/E/I/J/L',
    homeSlot: '1K',
    awaySlot: '3rd',
    kickoff: '2026-07-01',
  },

  // Round of 16
  {
    id: 'r16-1',
    round: 'r16',
    label: 'Match 73',
    description: 'Winner M49 vs Winner M50',
    homeSlot: 'W49',
    awaySlot: 'W50',
    kickoff: '2026-07-04',
  },
  {
    id: 'r16-2',
    round: 'r16',
    label: 'Match 74',
    description: 'Winner M53 vs Winner M54',
    homeSlot: 'W53',
    awaySlot: 'W54',
    kickoff: '2026-07-04',
  },
  {
    id: 'r16-3',
    round: 'r16',
    label: 'Match 75',
    description: 'Winner M51 vs Winner M52',
    homeSlot: 'W51',
    awaySlot: 'W52',
    kickoff: '2026-07-05',
  },
  {
    id: 'r16-4',
    round: 'r16',
    label: 'Match 76',
    description: 'Winner M55 vs Winner M56',
    homeSlot: 'W55',
    awaySlot: 'W56',
    kickoff: '2026-07-05',
  },
  {
    id: 'r16-5',
    round: 'r16',
    label: 'Match 77',
    description: 'Winner M57 vs Winner M58',
    homeSlot: 'W57',
    awaySlot: 'W58',
    kickoff: '2026-07-06',
  },
  {
    id: 'r16-6',
    round: 'r16',
    label: 'Match 78',
    description: 'Winner M59 vs Winner M60',
    homeSlot: 'W59',
    awaySlot: 'W60',
    kickoff: '2026-07-06',
  },
  {
    id: 'r16-7',
    round: 'r16',
    label: 'Match 79',
    description: 'Winner M61 vs Winner M62',
    homeSlot: 'W61',
    awaySlot: 'W62',
    kickoff: '2026-07-07',
  },
  {
    id: 'r16-8',
    round: 'r16',
    label: 'Match 80',
    description: 'Winner M63 vs Winner M64',
    homeSlot: 'W63',
    awaySlot: 'W64',
    kickoff: '2026-07-07',
  },

  // Quarter-finals
  {
    id: 'qf-1',
    round: 'qf',
    label: 'Match 89',
    description: 'Winner M73 vs Winner M74',
    homeSlot: 'W73',
    awaySlot: 'W74',
    kickoff: '2026-07-09',
  },
  {
    id: 'qf-2',
    round: 'qf',
    label: 'Match 90',
    description: 'Winner M75 vs Winner M76',
    homeSlot: 'W75',
    awaySlot: 'W76',
    kickoff: '2026-07-10',
  },
  {
    id: 'qf-3',
    round: 'qf',
    label: 'Match 91',
    description: 'Winner M77 vs Winner M78',
    homeSlot: 'W77',
    awaySlot: 'W78',
    kickoff: '2026-07-11',
  },
  {
    id: 'qf-4',
    round: 'qf',
    label: 'Match 92',
    description: 'Winner M79 vs Winner M80',
    homeSlot: 'W79',
    awaySlot: 'W80',
    kickoff: '2026-07-11',
  },

  // Semi-finals
  {
    id: 'sf-1',
    round: 'sf',
    label: 'Match 97',
    description: 'Winner M89 vs Winner M90',
    homeSlot: 'W89',
    awaySlot: 'W90',
    kickoff: '2026-07-14',
  },
  {
    id: 'sf-2',
    round: 'sf',
    label: 'Match 98',
    description: 'Winner M91 vs Winner M92',
    homeSlot: 'W91',
    awaySlot: 'W92',
    kickoff: '2026-07-15',
  },

  // Final
  {
    id: 'final',
    round: 'final',
    label: 'Match 104',
    description: 'Winner M97 vs Winner M98',
    homeSlot: 'W97',
    awaySlot: 'W98',
    kickoff: '2026-07-19',
  },
];

export function getEarlyKnockoutMatches() {
  return KNOCKOUT_MATCHES.filter((m) => m.earlyPick);
}

export function getBatch2KnockoutMatches() {
  return KNOCKOUT_MATCHES.filter((m) => m.batch2Pick);
}

export function getLateKnockoutMatches() {
  return KNOCKOUT_MATCHES.filter((m) => !m.earlyPick && !m.batch2Pick);
}

export function getMatchById(id) {
  return KNOCKOUT_MATCHES.find((m) => m.id === id);
}
