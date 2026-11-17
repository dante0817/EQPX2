import type { PlaceCandidate } from '../data/eqpData.ts';

export interface CityPlaceRecord {
  name: string;
  lat: number;
  lon: number;
}

export interface TownPlaceRecord {
  name: string;
  province: string;
  population?: number;
  lat: number;
  lon: number;
}

export interface GeneratorTraceRecord {
  name: string;
  points: Array<[number, number]>; // [lat, lon]
}

export interface NearestPlacesCatalog {
  cities: CityPlaceRecord[];
  towns: TownPlaceRecord[];
  generators: GeneratorTraceRecord[];
}

export interface ComputedNearestPlaces {
  centralOfficeBearing: string;
  cities: PlaceCandidate[];
  selectedCityId: string;
  towns: PlaceCandidate[];
  selectedTownId: string;
  generators: PlaceCandidate[];
  selectedGeneratorId: string;
}

export interface MainOfficeLocation {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export const DEFAULT_MAIN_OFFICE: MainOfficeLocation = {
  code: 'QVP',
  name: 'Quezon City',
  lat: 14.652,
  lon: 121.059,
};

export const QUEZON_CITY_OFFICE = DEFAULT_MAIN_OFFICE;

export function formatCentralOfficeBearing(
  epicenterLat: number,
  epicenterLon: number,
  office: MainOfficeLocation = DEFAULT_MAIN_OFFICE
): string {
  const info = computeDistanceAndBearing(
    office.lat,
    office.lon,
    epicenterLat,
    epicenterLon
  );
  const labelName = office.name.trim() || office.code.trim() || 'Quezon City';
  return `${String(Math.round(info.distKm)).padStart(3, '0')} km ${info.quadrantLabel} of ${labelName}`;
}

export function computeDistanceAndBearing(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): { distKm: number; azimDeg: number; quadrantLabel: string } {
  const rad = Math.PI / 180;
  const meanLatRad = ((fromLat + toLat) / 2) * rad;
  const dLatKm = (toLat - fromLat) * 111.32;
  const dLonKm = (toLon - fromLon) * 111.32 * Math.max(0.25, Math.cos(meanLatRad));
  const distKm = Math.hypot(dLatKm, dLonKm);
  const rawAzim = (Math.atan2(dLonKm, dLatKm) * 180) / Math.PI;
  const azimDeg = ((rawAzim % 360) + 360) % 360;

  let ns = 'N';
  let ew = 'E';
  let angle = azimDeg;
  if (azimDeg > 90 && azimDeg <= 180) {
    ns = 'S';
    ew = 'E';
    angle = 180 - azimDeg;
  } else if (azimDeg > 180 && azimDeg < 270) {
    ns = 'S';
    ew = 'W';
    angle = azimDeg - 180;
  } else if (azimDeg >= 270) {
    ns = 'N';
    ew = 'W';
    angle = 360 - azimDeg;
  }
  const roundedAngle = Math.round(angle);
  return {
    distKm,
    azimDeg,
    quadrantLabel: `${ns} ${String(roundedAngle).padStart(2, '0')}° ${ew}`,
  };
}

const LOWERCASE_CONNECTORS = new Set(['of', 'del', 'de', 'la', 'las', 'los', 'y']);

function normalizeKnownSpanishN(raw: string): string {
  return raw
    .replace(/\u00a5/g, 'Ñ')
    .replace(/\uFFFD/g, 'Ñ')
    .replace(/\bPE ARRUBIA\b/gi, 'PEÑARRUBIA')
    .replace(/\bSANTO NI O\b/gi, 'SANTO NIÑO')
    .replace(/\bDASMARI AS\b/gi, 'DASMARIÑAS')
    .replace(/\bBI AN\b/gi, 'BIÑAN')
    .replace(/\bLOS BA OS\b/gi, 'LOS BAÑOS')
    .replace(/\bMU OZ\b/gi, 'MUÑOZ');
}

export function formatPlaceTitleCase(raw: string): string {
  const cleaned = normalizeKnownSpanishN(raw).trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  // Split preserving separators (spaces, parentheses, hyphens, periods, slashes)
  const tokens = cleaned.split(/(\s+|\(|\)|-|\/)/);
  let seenWord = false;

  return tokens
    .map((tok) => {
      if (!tok || /^(\s+|\(|\)|-|\/)$/.test(tok)) {
        if (tok === '(') seenWord = false;
        return tok;
      }
      const lower = tok.toLowerCase();
      const isConnector = seenWord && LOWERCASE_CONNECTORS.has(lower);
      seenWord = true;
      if (isConnector) return lower;

      // Capitalize first letter (supporting Ñ) and lowercase the rest
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

export function isValidPhCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 3 &&
    lat <= 23 &&
    lon >= 112 &&
    lon <= 130
  );
}

/**
 * Parses CITY_f9a7e5f3.csv
 * Format: LAT,LON,NAME
 */
export function parseCityCsvText(rawText: string): CityPlaceRecord[] {
  const normalized = normalizeKnownSpanishN(rawText);
  const lines = normalized.split(/\r?\n/);
  const result: CityPlaceRecord[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^lat\s*,/i.test(trimmed)) continue;
    const parts = trimmed.split(',');
    if (parts.length < 3) continue;
    const lat = Number.parseFloat(parts[0]);
    const lon = Number.parseFloat(parts[1]);
    const rawName = parts.slice(2).join(',').replace(/^"|"$/g, '').trim();
    if (!rawName || !isValidPhCoordinate(lat, lon)) continue;

    const name = formatPlaceTitleCase(rawName);
    const dedupKey = `${name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    result.push({ name, lat, lon });
  }

  return result;
}

/**
 * Parses Population_Centers_2007_e2850078.txt
 * Format: lon,lat,"pop","households","TOWN","PROVINCE",...
 */
export function parsePopulationCentersText(rawText: string): TownPlaceRecord[] {
  const lines = rawText.split(/\r?\n/);
  const result: TownPlaceRecord[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^"longitude"/i.test(trimmed)) continue;

    const match = trimmed.match(
      /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/
    );
    if (!match) continue;

    const lon = Number.parseFloat(match[1]);
    const lat = Number.parseFloat(match[2]);
    if (!isValidPhCoordinate(lat, lon)) continue;

    const popNum = Number.parseInt(match[3].replace(/[^0-9]/g, ''), 10);
    const rawTown = match[5].trim();
    const rawProvince = match[6].trim();
    if (!rawTown) continue;

    const name = formatPlaceTitleCase(rawTown);
    const province = formatPlaceTitleCase(rawProvince);
    const dedupKey = `${name.toLowerCase()}|${province.toLowerCase()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    result.push({
      name,
      province,
      population: Number.isFinite(popNum) ? popNum : undefined,
      lat,
      lon,
    });
  }

  return result;
}

/**
 * Parses GENTR_ab406a82.txt
 * Format: LAT   LON   GENERATOR_NAME
 */
export function parseGentrText(rawText: string): GeneratorTraceRecord[] {
  const lines = rawText.split(/\r?\n/);
  const grouped = new Map<string, Array<[number, number]>>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/);
    if (!match) continue;

    const lat = Number.parseFloat(match[1]);
    const lon = Number.parseFloat(match[2]);
    const name = match[3].trim().replace(/\s+/g, ' ');
    if (!name || !isValidPhCoordinate(lat, lon)) continue;

    let pts = grouped.get(name);
    if (!pts) {
      pts = [];
      grouped.set(name, pts);
    }
    pts.push([lat, lon]);
  }

  return Array.from(grouped.entries()).map(([name, points]) => ({ name, points }));
}

function normalizeMatchKey(val: string): string {
  return val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchPreviousCandidateId(
  candidates: PlaceCandidate[],
  prevSelectedName?: string | null,
  hadExplicitClear?: boolean
): string {
  if (hadExplicitClear) return '';
  if (prevSelectedName) {
    const target = normalizeMatchKey(prevSelectedName);
    const exact = candidates.find((c) => normalizeMatchKey(c.name) === target);
    if (exact) return exact.id;
  }
  return candidates[0]?.id ?? '';
}

export function computeNearestPlacesForEpicenter(
  epicenterLat: number,
  epicenterLon: number,
  catalog: NearestPlacesCatalog,
  previous?: {
    selectedCityName?: string | null;
    cityCleared?: boolean;
    selectedTownName?: string | null;
    townCleared?: boolean;
    selectedGeneratorName?: string | null;
  },
  mainOffice: MainOfficeLocation = DEFAULT_MAIN_OFFICE
): ComputedNearestPlaces {
  const centralOfficeBearing = formatCentralOfficeBearing(
    epicenterLat,
    epicenterLon,
    mainOffice
  );

  const cities: PlaceCandidate[] = catalog.cities
    .map((city) => {
      const info = computeDistanceAndBearing(city.lat, city.lon, epicenterLat, epicenterLon);
      const distRounded = Math.round(info.distKm);
      return {
        rawDist: info.distKm,
        distanceKm: distRounded,
        bearing: info.quadrantLabel,
        name: city.name,
        label: `${String(distRounded).padStart(3, '0')} km ${info.quadrantLabel} of ${city.name}`,
      };
    })
    .sort((a, b) => a.rawDist - b.rawDist)
    .slice(0, 5)
    .map((item, idx) => ({
      id: `c${idx + 1}`,
      distanceKm: item.distanceKm,
      bearing: item.bearing,
      name: item.name,
      label: item.label,
    }));

  const towns: PlaceCandidate[] = catalog.towns
    .map((town) => {
      const info = computeDistanceAndBearing(town.lat, town.lon, epicenterLat, epicenterLon);
      const distRounded = Math.round(info.distKm);
      const displayName = town.province ? `${town.name} (${town.province})` : town.name;
      return {
        rawDist: info.distKm,
        distanceKm: distRounded,
        bearing: info.quadrantLabel,
        name: displayName,
        label: `${String(distRounded).padStart(3, '0')} km ${info.quadrantLabel} of ${displayName}`,
      };
    })
    .sort((a, b) => a.rawDist - b.rawDist)
    .slice(0, 10)
    .map((item, idx) => ({
      id: `t${idx + 1}`,
      distanceKm: item.distanceKm,
      bearing: item.bearing,
      name: item.name,
      label: item.label,
    }));

  const generators: PlaceCandidate[] = catalog.generators
    .map((gen) => {
      let minDist = Infinity;
      let bestQuad = 'N 00° E';
      for (const [ptLat, ptLon] of gen.points) {
        const info = computeDistanceAndBearing(ptLat, ptLon, epicenterLat, epicenterLon);
        if (info.distKm < minDist) {
          minDist = info.distKm;
          bestQuad = info.quadrantLabel;
        }
      }
      const distRounded = Math.round(minDist);
      return {
        rawDist: minDist,
        distanceKm: distRounded,
        bearing: bestQuad,
        name: gen.name,
        label: `${String(distRounded).padStart(3, '0')} km ${bestQuad} of ${gen.name}`,
      };
    })
    .sort((a, b) => a.rawDist - b.rawDist)
    .slice(0, 5)
    .map((item, idx) => ({
      id: `g${idx + 1}`,
      distanceKm: item.distanceKm,
      bearing: item.bearing,
      name: item.name,
      label: item.label,
    }));

  return {
    centralOfficeBearing,
    cities,
    selectedCityId: matchPreviousCandidateId(
      cities,
      previous?.selectedCityName,
      previous?.cityCleared
    ),
    towns,
    selectedTownId: matchPreviousCandidateId(
      towns,
      previous?.selectedTownName,
      previous?.townCleared
    ),
    generators,
    selectedGeneratorId: matchPreviousCandidateId(
      generators,
      previous?.selectedGeneratorName,
      false
    ),
  };
}

export function formatCoordFlexible(
  value: number,
  minDecimals: number,
  maxDecimals = 4,
  padIntWidth = 0
): string {
  const fixed = value.toFixed(maxDecimals);
  const [intPart, decPart = ''] = fixed.split('.');
  let trimmedDec = decPart;
  while (trimmedDec.length > minDecimals && trimmedDec.endsWith('0')) {
    trimmedDec = trimmedDec.slice(0, -1);
  }
  const paddedInt = padIntWidth > 0 ? intPart.padStart(padIntWidth, '0') : intPart;
  return trimmedDec.length > 0 ? `${paddedInt}.${trimmedDec}` : paddedInt;
}

export function formatCityCsvText(cities: CityPlaceRecord[]): string {
  const header = 'LAT,LON,NAME';
  const rows = cities.map(
    (c) =>
      `${formatCoordFlexible(c.lat, 3, 4)},${formatCoordFlexible(c.lon, 3, 4)},${c.name.toUpperCase()}`
  );
  return [header, ...rows].join('\n');
}

export function formatPopulationCentersText(towns: TownPlaceRecord[]): string {
  const header =
    '"longitude","latitude","   Population (2007)= ","   Households (2005)= ","   Town name= ","     Province= "';
  const rows = towns.map((t) => {
    const pop = Number.isFinite(t.population) ? ` ${Math.round(t.population as number)}` : ' 0';
    return `${t.lon.toFixed(6)},${t.lat.toFixed(6)},"${pop}"," 0","${t.name.toUpperCase()}","${t.province.toUpperCase()}"`;
  });
  return [header, ...rows].join('\n');
}

export function formatGentrText(generators: GeneratorTraceRecord[]): string {
  const lines: string[] = [];
  for (const gen of generators) {
    const upperName = gen.name.trim().toUpperCase();
    for (const [lat, lon] of gen.points) {
      const latStr = formatCoordFlexible(lat, 2, 4, 2);
      const lonStr = formatCoordFlexible(lon, 2, 4, 3);
      lines.push(`${latStr}   ${lonStr}  ${upperName}`);
    }
  }
  return lines.join('\n');
}

