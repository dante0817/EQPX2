import { StationMeta, StationPick } from '../data/eqpData';

export type StationSubRegionId =
  | 'NORTHERN_LUZON'
  | 'NCR_CENTRAL_LUZON'
  | 'SOUTHERN_LUZON_BICOL'
  | 'WEST_CENTRAL_VISAYAS'
  | 'EASTERN_VISAYAS'
  | 'NORTH_EAST_MINDANAO'
  | 'WEST_SOUTH_MINDANAO';

export type StationRegionFilter =
  | 'ALL'
  | 'LUZON'
  | 'VISAYAS'
  | 'MINDANAO'
  | StationSubRegionId;

export interface StationRegionOption {
  id: StationRegionFilter;
  label: string;
  shortLabel: string;
  group: 'All' | 'Island Group' | 'Administrative Region';
}

export const STATION_REGION_OPTIONS: StationRegionOption[] = [
  {
    id: 'ALL',
    label: 'All Regions (Philippines)',
    shortLabel: 'All Regions',
    group: 'All',
  },
  {
    id: 'LUZON',
    label: 'Luzon (All Luzon Regions)',
    shortLabel: 'Luzon',
    group: 'Island Group',
  },
  {
    id: 'VISAYAS',
    label: 'Visayas (All Visayas Regions)',
    shortLabel: 'Visayas',
    group: 'Island Group',
  },
  {
    id: 'MINDANAO',
    label: 'Mindanao (All Mindanao Regions)',
    shortLabel: 'Mindanao',
    group: 'Island Group',
  },
  {
    id: 'NORTHERN_LUZON',
    label: 'Northern Luzon (Ilocos, CAR, Cagayan Valley)',
    shortLabel: 'N. Luzon',
    group: 'Administrative Region',
  },
  {
    id: 'NCR_CENTRAL_LUZON',
    label: 'NCR & Central Luzon (Metro Manila, Region III)',
    shortLabel: 'NCR / C. Luzon',
    group: 'Administrative Region',
  },
  {
    id: 'SOUTHERN_LUZON_BICOL',
    label: 'Southern Luzon & Bicol (CALABARZON, MIMAROPA, V)',
    shortLabel: 'S. Luzon / Bicol',
    group: 'Administrative Region',
  },
  {
    id: 'WEST_CENTRAL_VISAYAS',
    label: 'Western & Central Visayas (Regions VI & VII)',
    shortLabel: 'W/C Visayas',
    group: 'Administrative Region',
  },
  {
    id: 'EASTERN_VISAYAS',
    label: 'Eastern Visayas (Region VIII)',
    shortLabel: 'E. Visayas',
    group: 'Administrative Region',
  },
  {
    id: 'NORTH_EAST_MINDANAO',
    label: 'Northern & Eastern Mindanao (Caraga, NorMin, Davao)',
    shortLabel: 'N/E Mindanao',
    group: 'Administrative Region',
  },
  {
    id: 'WEST_SOUTH_MINDANAO',
    label: 'Western & Southern Mindanao (Zamboanga, XII, BARMM)',
    shortLabel: 'W/S Mindanao',
    group: 'Administrative Region',
  },
];

const PROVINCE_RULES: Array<{
  keywords: string[];
  region: StationSubRegionId;
}> = [
  // Northern Luzon: Regions I, II, CAR (+ SRPC San Roque stations in Pangasinan)
  {
    keywords: [
      'abra',
      'apayao',
      'baguio',
      'benguet',
      'batanes',
      'itbayat',
      'bucay',
      'san quintin',
      'cagayan',
      'ifugao',
      'ilocos norte',
      'ilocos sur',
      'isabela',
      'kalinga',
      'la union',
      'manila observatory',
      'mountain province',
      'nueva vizcaya',
      'pangasinan',
      'quirino',
      'srpc ',
    ],
    region: 'NORTHERN_LUZON',
  },
  // NCR & Central Luzon: NCR, Region III (+ Baler/Aurora & Dikildit/Calabuanan/Reserva)
  {
    keywords: [
      'aurora',
      'bataan',
      'bulacan',
      'calabuanan',
      'dikildit',
      'metro manila',
      'ncr',
      'nueva ecija',
      'pampanga',
      'quezon city',
      'reserva',
      'tarlac',
      'zambales',
    ],
    region: 'NCR_CENTRAL_LUZON',
  },
  // Southern Luzon & Bicol: CALABARZON (IV-A), MIMAROPA (IV-B), Bicol (V)
  {
    keywords: [
      'albay',
      'alitagtag',
      'batangas',
      'camarines norte',
      'camarines sur',
      'catanduanes',
      'cavite',
      'laguna',
      'marinduque',
      'masbate',
      'mayon',
      'mindoro',
      'palawan',
      'puerto azul',
      'puerto princesa',
      'quezon',
      'rizal',
      'romblon',
      'sorsogon',
    ],
    region: 'SOUTHERN_LUZON_BICOL',
  },
  // Eastern Visayas: Region VIII
  {
    keywords: [
      'biliran',
      'eastern samar',
      'leyte',
      'northern samar',
      'ormoc',
      'samar',
      'southern leyte',
    ],
    region: 'EASTERN_VISAYAS',
  },
  // Western & Central Visayas: Regions VI & VII
  {
    keywords: [
      'aklan',
      'antique',
      'bohol',
      'capiz',
      'cebu',
      'guimaras',
      'iloilo',
      'lapu-lapu',
      'negros occidental',
      'negros oriental',
      'siquijor',
    ],
    region: 'WEST_CENTRAL_VISAYAS',
  },
  // Western & Southern Mindanao: Regions IX, XII, BARMM
  {
    keywords: [
      'basilan',
      'cotabato',
      'general santos',
      'kidapawan',
      'lanao del sur',
      'maguindanao',
      'sarangani',
      'south cotabato',
      'sultan kudarat',
      'sulu',
      'tawi-tawi',
      'zamboanga',
    ],
    region: 'WEST_SOUTH_MINDANAO',
  },
  // Northern & Eastern Mindanao: Regions X, XI, XIII (Caraga)
  {
    keywords: [
      'agusan',
      'bukidnon',
      'butuan',
      'cagayan de oro',
      'camiguin',
      'davao',
      'dinagat',
      'lanao del norte',
      'misamis',
      'siargao',
      'surigao',
    ],
    region: 'NORTH_EAST_MINDANAO',
  },
];

export function classifyStationSubRegion(params: {
  province?: string | null;
  name?: string | null;
  lat: number;
  lon: number;
}): StationSubRegionId {
  const prov = (params.province ?? '').trim().toLowerCase();
  const name = (params.name ?? '').trim().toLowerCase();

  // Check explicit province matches first (longer/more specific rules checked properly)
  if (prov && prov !== 'unassigned') {
    for (const rule of PROVINCE_RULES) {
      if (rule.keywords.some((kw) => prov.includes(kw))) {
        return rule.region;
      }
    }
  }
  if (name) {
    for (const rule of PROVINCE_RULES) {
      if (rule.keywords.some((kw) => name.includes(kw))) {
        return rule.region;
      }
    }
  }

  // Coordinate fallback for unassigned or newly plotted stations
  const { lat, lon } = params;
  if (lat >= 16.0) {
    return 'NORTHERN_LUZON';
  }
  if (lat >= 14.65) {
    return 'NCR_CENTRAL_LUZON';
  }
  if (lat >= 12.1 || (lon < 120.6 && lat >= 7.5)) {
    // Handles Mindoro, CALABARZON, Bicol, Masbate, and Palawan
    return 'SOUTHERN_LUZON_BICOL';
  }
  if (lat >= 10.45 && lon >= 124.2) {
    return 'EASTERN_VISAYAS';
  }
  if (lat >= 9.0 && lon < 124.75) {
    return 'WEST_CENTRAL_VISAYAS';
  }
  // Mindanao split: eastern & northern Mindanao (Regions X, XI, XIII) vs western/southern (IX, XII, BARMM)
  if (lon >= 125.2 && (lat >= 7.0 || lon >= 125.35)) {
    return 'NORTH_EAST_MINDANAO';
  }
  if (lat >= 8.3 && lon >= 124.3) {
    return 'NORTH_EAST_MINDANAO';
  }
  return 'WEST_SOUTH_MINDANAO';
}

export function isSubRegionInFilter(
  subRegion: StationSubRegionId,
  filter: StationRegionFilter
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'LUZON') {
    return (
      subRegion === 'NORTHERN_LUZON' ||
      subRegion === 'NCR_CENTRAL_LUZON' ||
      subRegion === 'SOUTHERN_LUZON_BICOL'
    );
  }
  if (filter === 'VISAYAS') {
    return subRegion === 'WEST_CENTRAL_VISAYAS' || subRegion === 'EASTERN_VISAYAS';
  }
  if (filter === 'MINDANAO') {
    return (
      subRegion === 'NORTH_EAST_MINDANAO' ||
      subRegion === 'WEST_SOUTH_MINDANAO'
    );
  }
  return subRegion === filter;
}

export function stationMetaMatchesRegion(
  station: Pick<StationMeta, 'province' | 'name' | 'lat' | 'lon'>,
  filter: StationRegionFilter
): boolean {
  if (filter === 'ALL') return true;
  const sub = classifyStationSubRegion({
    province: station.province,
    name: station.name,
    lat: station.lat,
    lon: station.lon,
  });
  return isSubRegionInFilter(sub, filter);
}

export function stationPickMatchesRegion(
  pick: Pick<StationPick, 'sta' | 'lat' | 'lon'>,
  filter: StationRegionFilter,
  stationLookup?: Record<string, StationMeta>
): boolean {
  if (filter === 'ALL') return true;
  const meta = stationLookup?.[pick.sta] ?? stationLookup?.[pick.sta.toUpperCase()];
  const sub = classifyStationSubRegion({
    province: meta?.province,
    name: meta?.name,
    lat: meta?.lat ?? pick.lat,
    lon: meta?.lon ?? pick.lon,
  });
  return isSubRegionInFilter(sub, filter);
}

export function getRegionOptionLabel(filter: StationRegionFilter): string {
  return (
    STATION_REGION_OPTIONS.find((opt) => opt.id === filter)?.label ??
    'All Regions (Philippines)'
  );
}
