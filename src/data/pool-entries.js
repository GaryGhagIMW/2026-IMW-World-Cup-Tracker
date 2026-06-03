import { createEmptyKnockoutPredictions } from '../lib/scoring.js';

function poolEntry(name, email, groups, updatedAt) {
  return {
    name,
    email,
    groups,
    knockout: createEmptyKnockoutPredictions(),
    finalScore: { home: null, away: null },
    updatedAt,
  };
}

/** Official pool entries synced from OneDrive Group Stage Entries.xlsx */
export const POOL_ENTRIES = [
  poolEntry(
    'Abner Chinchilla',
    'abner.chinchilla@imw.ca',
    {
      A: ['MEX', 'KOR', 'CZE', 'RSA'],
      B: ['SUI', 'CAN', 'BIH', 'QAT'],
      C: ['BRA', 'MAR', 'SCO', 'HAI'],
      D: ['USA', 'TUR', 'AUS', 'PAR'],
      E: ['GER', 'CIV', 'ECU', 'CUW'],
      F: ['NED', 'JPN', 'SWE', 'TUN'],
      G: ['BEL', 'EGY', 'IRN', 'NZL'],
      H: ['ESP', 'URU', 'KSA', 'CPV'],
      I: ['FRA', 'NOR', 'SEN', 'IRQ'],
      J: ['ARG', 'AUT', 'ALG', 'JOR'],
      K: ['POR', 'COL', 'COD', 'UZB'],
      L: ['ENG', 'CRO', 'GHA', 'PAN'],
    },
    '2026-06-02T20:22:07.614Z'
  ),
  poolEntry(
    'Andre Dancs',
    'Andre.Dancs@imw.ca',
    {
      A: ['CZE', 'MEX', 'RSA', 'KOR'],
      B: ['SUI', 'CAN', 'BIH', 'QAT'],
      C: ['SCO', 'BRA', 'MAR', 'HAI'],
      D: ['USA', 'PAR', 'TUR', 'AUS'],
      E: ['GER', 'CIV', 'CUW', 'ECU'],
      F: ['SWE', 'NED', 'JPN', 'TUN'],
      G: ['BEL', 'EGY', 'IRN', 'NZL'],
      H: ['ESP', 'CPV', 'URU', 'KSA'],
      I: ['NOR', 'FRA', 'SEN', 'IRQ'],
      J: ['AUT', 'ARG', 'ALG', 'JOR'],
      K: ['COD', 'POR', 'UZB', 'COL'],
      L: ['ENG', 'CRO', 'PAN', 'GHA'],
    },
    '2026-06-02T16:48:06.000Z'
  ),
  poolEntry(
    'Creigh Sullivan',
    'creigh.sullivan@imw.ca',
    {
      A: ['MEX', 'KOR', 'CZE', 'RSA'],
      B: ['SUI', 'CAN', 'BIH', 'QAT'],
      C: ['BRA', 'MAR', 'SCO', 'HAI'],
      D: ['USA', 'TUR', 'PAR', 'AUS'],
      E: ['GER', 'ECU', 'CIV', 'CUW'],
      F: ['NED', 'JPN', 'SWE', 'TUN'],
      G: ['BEL', 'EGY', 'IRN', 'NZL'],
      H: ['ESP', 'URU', 'KSA', 'CPV'],
      I: ['FRA', 'NOR', 'SEN', 'IRQ'],
      J: ['ARG', 'AUT', 'ALG', 'JOR'],
      K: ['POR', 'COL', 'UZB', 'COD'],
      L: ['ENG', 'CRO', 'GHA', 'PAN'],
    },
    '2026-06-03T15:46:59.871Z'
  ),
  poolEntry(
    'Gary Ghag',
    'gary.ghag@imw.ca',
    {
      A: ['MEX', 'KOR', 'CZE', 'RSA'],
      B: ['SUI', 'CAN', 'QAT', 'BIH'],
      C: ['BRA', 'MAR', 'SCO', 'HAI'],
      D: ['USA', 'TUR', 'PAR', 'AUS'],
      E: ['GER', 'ECU', 'CIV', 'CUW'],
      F: ['NED', 'JPN', 'SWE', 'TUN'],
      G: ['BEL', 'IRN', 'EGY', 'NZL'],
      H: ['ESP', 'URU', 'KSA', 'CPV'],
      I: ['FRA', 'SEN', 'NOR', 'IRQ'],
      J: ['ARG', 'AUT', 'ALG', 'JOR'],
      K: ['POR', 'COL', 'COD', 'UZB'],
      L: ['ENG', 'CRO', 'PAN', 'GHA'],
    },
    '2026-06-02T20:06:04.596Z'
  ),
  poolEntry(
    'Gary Lau',
    'Gary.Lau@imw.ca',
    {
      A: ['MEX', 'KOR', 'RSA', 'CZE'],
      B: ['SUI', 'CAN', 'QAT', 'BIH'],
      C: ['BRA', 'MAR', 'SCO', 'HAI'],
      D: ['TUR', 'USA', 'AUS', 'PAR'],
      E: ['GER', 'ECU', 'CIV', 'CUW'],
      F: ['NED', 'JPN', 'SWE', 'TUN'],
      G: ['BEL', 'IRN', 'EGY', 'NZL'],
      H: ['ESP', 'URU', 'KSA', 'CPV'],
      I: ['FRA', 'SEN', 'NOR', 'IRQ'],
      J: ['ARG', 'AUT', 'ALG', 'JOR'],
      K: ['POR', 'COL', 'COD', 'UZB'],
      L: ['ENG', 'CRO', 'PAN', 'GHA'],
    },
    '2026-06-02T18:17:48.000Z'
  ),
  poolEntry(
    'Jackson Lau',
    'jackson.lau@imw.ca',
    {
      A: ['KOR', 'MEX', 'CZE', 'RSA'],
      B: ['SUI', 'CAN', 'BIH', 'QAT'],
      C: ['BRA', 'MAR', 'SCO', 'HAI'],
      D: ['TUR', 'AUS', 'PAR', 'USA'],
      E: ['GER', 'ECU', 'CIV', 'CUW'],
      F: ['NED', 'JPN', 'SWE', 'TUN'],
      G: ['BEL', 'NZL', 'EGY', 'IRN'],
      H: ['ESP', 'URU', 'KSA', 'CPV'],
      I: ['FRA', 'NOR', 'SEN', 'IRQ'],
      J: ['ARG', 'AUT', 'ALG', 'JOR'],
      K: ['COL', 'POR', 'COD', 'UZB'],
      L: ['ENG', 'CRO', 'GHA', 'PAN'],
    },
    '2026-06-02T15:32:23.000Z'
  ),
  poolEntry(
    'Rahat Williams',
    'rahat.williams@imw.ca',
    {
      A: ['CZE', 'RSA', 'MEX', 'KOR'],
      B: ['BIH', 'QAT', 'CAN', 'SUI'],
      C: ['BRA', 'SCO', 'MAR', 'HAI'],
      D: ['PAR', 'USA', 'TUR', 'AUS'],
      E: ['CUW', 'CIV', 'GER', 'ECU'],
      F: ['SWE', 'JPN', 'NED', 'TUN'],
      G: ['BEL', 'NZL', 'EGY', 'IRN'],
      H: ['ESP', 'URU', 'KSA', 'CPV'],
      I: ['SEN', 'NOR', 'FRA', 'IRQ'],
      J: ['ARG', 'ALG', 'AUT', 'JOR'],
      K: ['COL', 'POR', 'COD', 'UZB'],
      L: ['ENG', 'CRO', 'GHA', 'PAN'],
    },
    '2026-06-03T15:47:34.796Z'
  ),
];
