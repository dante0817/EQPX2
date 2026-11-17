import type { NearestPlacesCatalog } from './nearestPlaces.ts';

export interface PhilippineLocalityRecord {
  municipality: string;
  province: string;
  isCity: boolean;
  lat?: number;
  lon?: number;
  psgcCode?: string | null;
}

export interface PhilippineLocalityIndex {
  provinces: string[];
  allRecords: PhilippineLocalityRecord[];
  byProvince: Map<string, PhilippineLocalityRecord[]>;
  provinceAliasMap: Map<string, string>;
  recordsByMunicipalityKey: Map<string, PhilippineLocalityRecord[]>;
  recordsByProvinceAndMunicipalityKey: Map<string, PhilippineLocalityRecord>;
}

export interface LocalityResolutionResult {
  matched: boolean;
  status: 'matched' | 'unresolved';
  municipality: string;
  province: string;
  specificLocation?: string;
  psgcCode?: string | null;
  reason?: string;
  candidates?: PhilippineLocalityRecord[];
}

const METRO_MANILA_LGUS: Array<{ municipality: string; isCity: boolean; lat: number; lon: number }> = [
  { municipality: 'City of Manila', isCity: true, lat: 14.5995, lon: 120.9842 },
  { municipality: 'Quezon City', isCity: true, lat: 14.676, lon: 121.0437 },
  { municipality: 'Caloocan City', isCity: true, lat: 14.657, lon: 120.984 },
  { municipality: 'Las Piñas City', isCity: true, lat: 14.4445, lon: 120.9939 },
  { municipality: 'Makati City', isCity: true, lat: 14.5547, lon: 121.0244 },
  { municipality: 'Malabon City', isCity: true, lat: 14.6681, lon: 120.9658 },
  { municipality: 'Mandaluyong City', isCity: true, lat: 14.5794, lon: 121.0359 },
  { municipality: 'Marikina City', isCity: true, lat: 14.6507, lon: 121.1029 },
  { municipality: 'Muntinlupa City', isCity: true, lat: 14.4081, lon: 121.0415 },
  { municipality: 'Navotas City', isCity: true, lat: 14.6667, lon: 120.9417 },
  { municipality: 'Parañaque City', isCity: true, lat: 14.4793, lon: 121.0198 },
  { municipality: 'Pasay City', isCity: true, lat: 14.5378, lon: 121.0014 },
  { municipality: 'Pasig City', isCity: true, lat: 14.5764, lon: 121.0851 },
  { municipality: 'Pateros', isCity: false, lat: 14.5453, lon: 121.0686 },
  { municipality: 'San Juan City', isCity: true, lat: 14.6019, lon: 121.0355 },
  { municipality: 'Taguig City', isCity: true, lat: 14.5176, lon: 121.0509 },
  { municipality: 'Valenzuela City', isCity: true, lat: 14.7011, lon: 120.983 },
];

const PROVINCE_ALIASES: Record<string, string> = {
  'ncr': 'Metro Manila',
  'national capital region': 'Metro Manila',
  'metro manila': 'Metro Manila',
  'metro manila ncr': 'Metro Manila',
  'compostela valley': 'Davao de Oro',
  'davao de oro': 'Davao de Oro',
  'north cotabato': 'Cotabato',
  'northern cotabato': 'Cotabato',
  'western samar': 'Samar',
  'samar western samar': 'Samar',
  'negros occ': 'Negros Occidental',
  'negros or': 'Negros Oriental',
  'davao or': 'Davao Oriental',
  'davao occ': 'Davao Occidental',
  'surigao del n': 'Surigao del Norte',
  'surigao del s': 'Surigao del Sur',
  'agusan del n': 'Agusan del Norte',
  'agusan del s': 'Agusan del Sur',
  'camarines n': 'Camarines Norte',
  'camarines s': 'Camarines Sur',
  'ilocos n': 'Ilocos Norte',
  'ilocos s': 'Ilocos Sur',
  'lanao del n': 'Lanao del Norte',
  'lanao del s': 'Lanao del Sur',
  'misamis occ': 'Misamis Occidental',
  'misamis or': 'Misamis Oriental',
  'zamboanga del n': 'Zamboanga del Norte',
  'zamboanga del s': 'Zamboanga del Sur',
  'occ mindoro': 'Occidental Mindoro',
  'or mindoro': 'Oriental Mindoro',
  'e samar': 'Eastern Samar',
  'n samar': 'Northern Samar',
  's leyte': 'Southern Leyte',
  'mt province': 'Mountain Province',
  'mtn province': 'Mountain Province',
  'maguindanao del norte': 'Maguindanao',
  'maguindanao del sur': 'Maguindanao',
  'shariff kabunsuan': 'Maguindanao',
};

export function stripDiacritics(input: string): string {
  return input
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeLocalityMatchKey(raw: string): string {
  return stripDiacritics(raw)
    .toLowerCase()
    .replace(/[.'’`()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMunicipalityKeyVariants(name: string): string[] {
  const base = normalizeLocalityMatchKey(name);
  if (!base) return [];
  const variants = new Set<string>([base]);

  if (base.startsWith('city of ')) {
    const core = base.slice('city of '.length).trim();
    if (core) {
      variants.add(core);
      variants.add(`${core} city`);
    }
  } else if (base.endsWith(' city')) {
    const core = base.slice(0, -' city'.length).trim();
    if (core) {
      variants.add(core);
      variants.add(`city of ${core}`);
    }
  } else {
    variants.add(`city of ${base}`);
    variants.add(`${base} city`);
  }

  // Handle "Sto." / "Sta." abbreviations
  for (const variant of Array.from(variants)) {
    const expanded = variant
      .replace(/\bsto\b/g, 'santo')
      .replace(/\bsta\b/g, 'santa');
    variants.add(expanded);
    const contracted = variant
      .replace(/\bsanto\b/g, 'sto')
      .replace(/\bsanta\b/g, 'sta');
    variants.add(contracted);
  }

  return Array.from(variants);
}

function isLikelyCityName(name: string): boolean {
  return /\bcity\b/i.test(name);
}

export function formatCanonicalMunicipalityDisplay(name: string): string {
  const trimmed = name.trim();
  const m = trimmed.match(/^City\s+of\s+(.+)$/i);
  if (m) {
    return `${m[1].trim()} City`;
  }
  return trimmed;
}

export function buildPhilippineLocalityIndex(
  catalog: NearestPlacesCatalog | null
): PhilippineLocalityIndex {
  const byProvince = new Map<string, PhilippineLocalityRecord[]>();
  const provinceCanonicalLookup = new Map<string, string>();
  const recordsByProvinceAndMunicipalityKey = new Map<string, PhilippineLocalityRecord>();
  const recordsByMunicipalityKey = new Map<string, PhilippineLocalityRecord[]>();
  const dedupCanonical = new Set<string>();

  const registerRecord = (rec: PhilippineLocalityRecord) => {
    const provTrim = rec.province.trim();
    const muniTrim = rec.municipality.trim();
    if (!provTrim || !muniTrim) return;

    const provKey = normalizeLocalityMatchKey(provTrim);
    const canonicalProv = provinceCanonicalLookup.get(provKey) ?? provTrim;
    if (!provinceCanonicalLookup.has(provKey)) {
      provinceCanonicalLookup.set(provKey, canonicalProv);
    }

    const muniCanon = normalizeLocalityMatchKey(formatCanonicalMunicipalityDisplay(muniTrim));
    const dedupKey = `${provKey}::${muniCanon}`;
    if (dedupCanonical.has(dedupKey)) return;
    dedupCanonical.add(dedupKey);

    const normalizedRec: PhilippineLocalityRecord = {
      ...rec,
      province: canonicalProv,
      municipality: muniTrim,
    };

    const list = byProvince.get(canonicalProv) ?? [];
    list.push(normalizedRec);
    byProvince.set(canonicalProv, list);

    for (const variant of getMunicipalityKeyVariants(muniTrim)) {
      const compositeKey = `${provKey}::${variant}`;
      if (!recordsByProvinceAndMunicipalityKey.has(compositeKey)) {
        recordsByProvinceAndMunicipalityKey.set(compositeKey, normalizedRec);
      }
      const muniBucket = recordsByMunicipalityKey.get(variant) ?? [];
      if (!muniBucket.some((item) => item.province === canonicalProv && item.municipality === muniTrim)) {
        muniBucket.push(normalizedRec);
        recordsByMunicipalityKey.set(variant, muniBucket);
      }
    }
  };

  // Always include Metro Manila NCR LGUs
  for (const lgu of METRO_MANILA_LGUS) {
    registerRecord({
      municipality: lgu.municipality,
      province: 'Metro Manila',
      isCity: lgu.isCity,
      lat: lgu.lat,
      lon: lgu.lon,
      psgcCode: null,
    });
  }

  // Load towns from NearestPlacesCatalog (Population_Centers_2007)
  if (catalog?.towns) {
    for (const town of catalog.towns) {
      if (!town.name?.trim() || !town.province?.trim()) continue;
      registerRecord({
        municipality: town.name.trim(),
        province: town.province.trim(),
        isCity: isLikelyCityName(town.name),
        lat: town.lat,
        lon: town.lon,
        psgcCode: null,
      });
    }
  }

  // Merge cities that carry a parenthetical province tag e.g. "Angeles City", "Borongan (Eastern Samar)"
  if (catalog?.cities) {
    for (const city of catalog.cities) {
      const parenMatch = city.name.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (parenMatch) {
        const muniName = parenMatch[1].trim();
        const rawProv = parenMatch[2].trim();
        const aliasTarget = PROVINCE_ALIASES[normalizeLocalityMatchKey(rawProv)] ?? rawProv;
        registerRecord({
          municipality: muniName,
          province: aliasTarget,
          isCity: true,
          lat: city.lat,
          lon: city.lon,
          psgcCode: null,
        });
      }
    }
  }

  const provinces = Array.from(byProvince.keys()).sort((a, b) => a.localeCompare(b));
  for (const prov of provinces) {
    const arr = byProvince.get(prov)!;
    arr.sort((a, b) => a.municipality.localeCompare(b.municipality));
  }

  const provinceAliasMap = new Map<string, string>();
  for (const prov of provinces) {
    provinceAliasMap.set(normalizeLocalityMatchKey(prov), prov);
  }
  for (const [aliasKey, targetName] of Object.entries(PROVINCE_ALIASES)) {
    const matchedProv = provinceAliasMap.get(normalizeLocalityMatchKey(targetName));
    if (matchedProv) {
      provinceAliasMap.set(aliasKey, matchedProv);
    }
  }

  const allRecords = provinces.flatMap((prov) => byProvince.get(prov) ?? []);

  return {
    provinces,
    allRecords,
    byProvince,
    provinceAliasMap,
    recordsByMunicipalityKey,
    recordsByProvinceAndMunicipalityKey,
  };
}

export function canonicalizeProvinceName(
  index: PhilippineLocalityIndex,
  rawProvince: string
): string | null {
  const key = normalizeLocalityMatchKey(rawProvince);
  if (!key) return null;
  return index.provinceAliasMap.get(key) ?? null;
}

export function getMunicipalitiesForProvince(
  index: PhilippineLocalityIndex,
  province: string
): PhilippineLocalityRecord[] {
  const canonical = canonicalizeProvinceName(index, province) ?? province.trim();
  return index.byProvince.get(canonical) ?? [];
}

export function resolvePhilippineLocality(
  index: PhilippineLocalityIndex,
  localityInput: string,
  provinceHint?: string
): LocalityResolutionResult {
  const raw = localityInput.trim();
  if (!raw) {
    return {
      matched: false,
      status: 'unresolved',
      municipality: '',
      province: provinceHint?.trim() || '',
      reason: 'Empty locality input',
    };
  }

  let workingText = raw;
  let explicitProvince: string | null = null;
  let specificLocation: string | undefined;

  if (provinceHint?.trim()) {
    explicitProvince = canonicalizeProvinceName(index, provinceHint) ?? provinceHint.trim();
  }

  // Extract parenthetical province if present, e.g. "San Julian (Eastern Samar)"
  const parenMatch = workingText.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const maybeProv = canonicalizeProvinceName(index, parenMatch[2]);
    if (maybeProv) {
      explicitProvince = explicitProvince ?? maybeProv;
      workingText = parenMatch[1].trim();
    }
  }

  const commaParts = workingText
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  let muniCandidate = workingText;

  if (commaParts.length >= 2) {
    const lastPart = commaParts[commaParts.length - 1];
    const resolvedLastProv = canonicalizeProvinceName(index, lastPart);
    if (resolvedLastProv) {
      explicitProvince = resolvedLastProv;
      if (commaParts.length === 2) {
        muniCandidate = commaParts[0];
      } else {
        muniCandidate = commaParts[commaParts.length - 2];
        specificLocation = commaParts.slice(0, commaParts.length - 2).join(', ');
      }
    } else if (explicitProvince) {
      // Specific location + municipality given alongside external provinceHint
      muniCandidate = commaParts[commaParts.length - 1];
      specificLocation = commaParts.slice(0, commaParts.length - 1).join(', ');
    }
  }

  // Try matching within explicit province first
  if (explicitProvince) {
    const canonProv = canonicalizeProvinceName(index, explicitProvince);
    if (canonProv) {
      const provKey = normalizeLocalityMatchKey(canonProv);
      for (const variant of getMunicipalityKeyVariants(muniCandidate)) {
        const hit = index.recordsByProvinceAndMunicipalityKey.get(`${provKey}::${variant}`);
        if (hit) {
          return {
            matched: true,
            status: 'matched',
            municipality: hit.municipality,
            province: hit.province,
            specificLocation,
            psgcCode: hit.psgcCode ?? null,
          };
        }
      }
      // Also check if trailing word contains province or barangay prefix ("Brgy X, Virac")
      return {
        matched: false,
        status: 'unresolved',
        municipality: muniCandidate,
        province: canonProv,
        specificLocation,
        reason: `"${muniCandidate}" not found under ${canonProv} in reference catalog`,
      };
    }

    return {
      matched: false,
      status: 'unresolved',
      municipality: muniCandidate,
      province: explicitProvince,
      specificLocation,
      reason: `Unrecognized province "${explicitProvince}"`,
    };
  }

  // No province provided: try exact municipality lookup across catalog (only unambiguous matches succeed!)
  const matches: PhilippineLocalityRecord[] = [];
  const seenKey = new Set<string>();
  for (const variant of getMunicipalityKeyVariants(muniCandidate)) {
    const hits = index.recordsByMunicipalityKey.get(variant) ?? [];
    for (const h of hits) {
      const k = `${h.province}::${h.municipality}`;
      if (!seenKey.has(k)) {
        seenKey.add(k);
        matches.push(h);
      }
    }
  }

  if (matches.length === 1) {
    return {
      matched: true,
      status: 'matched',
      municipality: matches[0].municipality,
      province: matches[0].province,
      specificLocation,
      psgcCode: matches[0].psgcCode ?? null,
    };
  }

  if (matches.length > 1) {
    return {
      matched: false,
      status: 'unresolved',
      municipality: muniCandidate,
      province: '',
      specificLocation,
      candidates: matches.slice(0, 6),
      reason: `Ambiguous locality "${muniCandidate}" matches ${matches.length} provinces (${matches
        .slice(0, 3)
        .map((m) => m.province)
        .join(', ')}${matches.length > 3 ? ', …' : ''}) — specify province`,
    };
  }

  return {
    matched: false,
    status: 'unresolved',
    municipality: muniCandidate,
    province: '',
    specificLocation,
    reason: `Locality "${raw}" not matched in Philippine reference catalog`,
  };
}
