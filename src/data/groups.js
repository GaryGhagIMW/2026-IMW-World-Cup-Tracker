/** Official FIFA World Cup 2026 draw (April 2026). Update if the draw changes. */
export const GROUPS = [
  {
    id: 'A',
    name: 'Group A',
    teams: [
      { code: 'MEX', name: 'Mexico' },
      { code: 'RSA', name: 'South Africa' },
      { code: 'KOR', name: 'Korea Republic' },
      { code: 'CZE', name: 'Czechia' },
    ],
  },
  {
    id: 'B',
    name: 'Group B',
    teams: [
      { code: 'CAN', name: 'Canada' },
      { code: 'BIH', name: 'Bosnia and Herzegovina' },
      { code: 'QAT', name: 'Qatar' },
      { code: 'SUI', name: 'Switzerland' },
    ],
  },
  {
    id: 'C',
    name: 'Group C',
    teams: [
      { code: 'BRA', name: 'Brazil' },
      { code: 'MAR', name: 'Morocco' },
      { code: 'HAI', name: 'Haiti' },
      { code: 'SCO', name: 'Scotland' },
    ],
  },
  {
    id: 'D',
    name: 'Group D',
    teams: [
      { code: 'USA', name: 'United States' },
      { code: 'PAR', name: 'Paraguay' },
      { code: 'AUS', name: 'Australia' },
      { code: 'TUR', name: 'Türkiye' },
    ],
  },
  {
    id: 'E',
    name: 'Group E',
    teams: [
      { code: 'GER', name: 'Germany' },
      { code: 'CUW', name: 'Curaçao' },
      { code: 'CIV', name: "Côte d'Ivoire" },
      { code: 'ECU', name: 'Ecuador' },
    ],
  },
  {
    id: 'F',
    name: 'Group F',
    teams: [
      { code: 'NED', name: 'Netherlands' },
      { code: 'JPN', name: 'Japan' },
      { code: 'SWE', name: 'Sweden' },
      { code: 'TUN', name: 'Tunisia' },
    ],
  },
  {
    id: 'G',
    name: 'Group G',
    teams: [
      { code: 'BEL', name: 'Belgium' },
      { code: 'EGY', name: 'Egypt' },
      { code: 'IRN', name: 'IR Iran' },
      { code: 'NZL', name: 'New Zealand' },
    ],
  },
  {
    id: 'H',
    name: 'Group H',
    teams: [
      { code: 'ESP', name: 'Spain' },
      { code: 'CPV', name: 'Cabo Verde' },
      { code: 'KSA', name: 'Saudi Arabia' },
      { code: 'URU', name: 'Uruguay' },
    ],
  },
  {
    id: 'I',
    name: 'Group I',
    teams: [
      { code: 'FRA', name: 'France' },
      { code: 'SEN', name: 'Senegal' },
      { code: 'IRQ', name: 'Iraq' },
      { code: 'NOR', name: 'Norway' },
    ],
  },
  {
    id: 'J',
    name: 'Group J',
    teams: [
      { code: 'ARG', name: 'Argentina' },
      { code: 'ALG', name: 'Algeria' },
      { code: 'AUT', name: 'Austria' },
      { code: 'JOR', name: 'Jordan' },
    ],
  },
  {
    id: 'K',
    name: 'Group K',
    teams: [
      { code: 'POR', name: 'Portugal' },
      { code: 'COD', name: 'Congo DR' },
      { code: 'UZB', name: 'Uzbekistan' },
      { code: 'COL', name: 'Colombia' },
    ],
  },
  {
    id: 'L',
    name: 'Group L',
    teams: [
      { code: 'ENG', name: 'England' },
      { code: 'CRO', name: 'Croatia' },
      { code: 'GHA', name: 'Ghana' },
      { code: 'PAN', name: 'Panama' },
    ],
  },
];

export function getTeamByCode(code) {
  for (const group of GROUPS) {
    const team = group.teams.find((t) => t.code === code);
    if (team) return { ...team, groupId: group.id };
  }
  return null;
}

export function getTeamName(code) {
  if (!code) return '—';
  return getTeamByCode(code)?.name ?? code;
}

/** ISO 3166 codes for flagcdn.com (FIFA code → flag slug). */
const FLAG_ISO = {
  MEX: 'mx', RSA: 'za', KOR: 'kr', CZE: 'cz', SUI: 'ch', CAN: 'ca', BIH: 'ba', QAT: 'qa',
  BRA: 'br', MAR: 'ma', SCO: 'gb-sct', HAI: 'ht', USA: 'us', AUS: 'au', PAR: 'py', TUR: 'tr',
  GER: 'de', CIV: 'ci', ECU: 'ec', CUW: 'cw', NED: 'nl', JPN: 'jp', SWE: 'se', TUN: 'tn',
  BEL: 'be', EGY: 'eg', IRN: 'ir', NZL: 'nz', ESP: 'es', CPV: 'cv', URU: 'uy', KSA: 'sa',
  FRA: 'fr', NOR: 'no', SEN: 'sn', IRQ: 'iq', ARG: 'ar', AUT: 'at', ALG: 'dz', JOR: 'jo',
  COL: 'co', POR: 'pt', COD: 'cd', UZB: 'uz', ENG: 'gb-eng', CRO: 'hr', GHA: 'gh', PAN: 'pa',
};

export function getTeamFlagUrl(code) {
  if (!code) return '';
  const iso = FLAG_ISO[code];
  if (!iso) return '';
  return `https://flagcdn.com/w40/${iso}.png`;
}

export function getAllTeams() {
  return GROUPS.flatMap((g) => g.teams.map((t) => ({ ...t, groupId: g.id })));
}
