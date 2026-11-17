export type StationNetworkType = 'seismic' | 'volcanic' | 'strong_motion' | 'temporary';
export type StationOperationalStatus = 'active' | 'temporary' | 'unverified' | 'retired';

export interface StationMetaRecord {
  code: string;
  name: string;
  province: string;
  lat: number;
  lon: number;
  elevationM: number;
  delaySec: number;
  sensor: string;
  networkType: StationNetworkType;
  volcanoName?: string | null;
  status: StationOperationalStatus;
  telemetry?: string | null;
  auditNote?: string | null;
  anomalyFlags?: string[];
}

export interface StationDataIssue {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  kind:
    | 'coordinate_outlier'
    | 'duplicate_conflict'
    | 'duplicate_merged'
    | 'missing_location'
    | 'missing_elevation';
  message: string;
  suggestedFix?: {
    lat?: number;
    lon?: number;
    elevationM?: number;
    province?: string;
    name?: string;
  };
}

export interface PhilstaParseResult {
  stations: StationMetaRecord[];
  issues: StationDataIssue[];
  rawLineCount: number;
}

const VOLCANO_PREFIX_RULES: Array<{
  match: (code: string, location: string) => boolean;
  volcanoName: string;
  defaultProvince: string;
  refLat: number;
  refLon: number;
}> = [
  {
    match: (c) => c.startsWith('VB'),
    volcanoName: 'Bulusan',
    defaultProvince: 'Sorsogon',
    refLat: 12.77,
    refLon: 124.05,
  },
  {
    match: (c) => c.startsWith('VG'),
    volcanoName: 'Matutum / Parker',
    defaultProvince: 'South Cotabato',
    refLat: 6.24,
    refLon: 124.98,
  },
  {
    match: (c) => c.startsWith('VH'),
    volcanoName: 'Hibok-Hibok',
    defaultProvince: 'Camiguin',
    refLat: 9.20,
    refLon: 124.67,
  },
  {
    match: (c, loc) => c === 'VIS' || loc.toUpperCase().includes('ISAROG'),
    volcanoName: 'Isarog',
    defaultProvince: 'Camarines Sur',
    refLat: 13.658,
    refLon: 123.373,
  },
  {
    match: (c, loc) => c === 'VIR' || loc.toUpperCase().includes('IRIGA'),
    volcanoName: 'Iriga',
    defaultProvince: 'Camarines Sur',
    refLat: 13.457,
    refLon: 123.457,
  },
  {
    match: (c) => c.startsWith('VK'),
    volcanoName: 'Kanlaon',
    defaultProvince: 'Negros Occidental',
    refLat: 10.41,
    refLon: 123.13,
  },
  {
    match: (c, loc) =>
      c.startsWith('VM') ||
      c === 'MRH' ||
      c === 'USM' ||
      c === 'VLH' ||
      loc.toUpperCase().includes('MAYON'),
    volcanoName: 'Mayon',
    defaultProvince: 'Albay',
    refLat: 13.26,
    refLon: 123.68,
  },
  {
    match: (c) => c.startsWith('VP') || c === 'PDM',
    volcanoName: 'Pinatubo',
    defaultProvince: 'Zambales / Pampanga',
    refLat: 15.13,
    refLon: 120.35,
  },
  {
    match: (c, loc) =>
      c.startsWith('VT') || c === 'CAL' || loc.toUpperCase().includes('TAAL'),
    volcanoName: 'Taal',
    defaultProvince: 'Batangas',
    refLat: 14.00,
    refLon: 120.99,
  },
  {
    match: (c, loc) =>
      c === 'VAI' || c === 'CVA' || loc.toUpperCase().includes('MT. APO'),
    volcanoName: 'Mt. Apo',
    defaultProvince: 'Davao del Sur / Cotabato',
    refLat: 7.00,
    refLon: 125.27,
  },
];

const LEGACY_DELAY_SEEDS: Record<string, { delaySec: number; sensor?: string }> = {
  BES: { delaySec: 0.05, sensor: 'Broadband 120s' },
  OCL: { delaySec: -0.02, sensor: 'Short-Period 1Hz' },
  CNP: { delaySec: 0.08, sensor: 'Broadband 120s' },
  MSL: { delaySec: 0.03, sensor: 'Broadband 120s' },
  LLP: { delaySec: -0.04, sensor: 'Broadband 60s' },
  BUT: { delaySec: 0.11, sensor: 'Broadband 120s' },
  RCP: { delaySec: 0.06, sensor: 'Short-Period 1Hz' },
  SNP: { delaySec: 0.0, sensor: 'Broadband 120s' },
  GQP: { delaySec: 0.04, sensor: 'Broadband 120s' },
  LQP: { delaySec: -0.09, sensor: 'Broadband 120s' },
  TGY: { delaySec: -0.06, sensor: 'Broadband 120s' },
  SCZ: { delaySec: 0.14, sensor: 'Short-Period 1Hz' },
  SCP: { delaySec: 0.02, sensor: 'Broadband 120s' },
  SGP: { delaySec: 0.02, sensor: 'Broadband 120s' },
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cleanEncodingText(raw: string): string {
  return raw
    .replace(/\bLOS BA OS\b/gi, 'Los Baños')
    .replace(/\bDO A REMEDIOS TRINIDAD\b/gi, 'Doña Remedios Trinidad')
    .replace(/\bPE ABLANCA\b/gi, 'Peñablanca')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((part) => {
      if (part.length === 0 || /^(\s+|-|\/)$/.test(part)) return part;
      if (['of', 'del', 'de', 'la'].includes(part)) return part;
      if (part === 'u.p.') return 'U.P.';
      if (part === 'srpc') return 'SRPC';
      if (part === 'npc') return 'NPC';
      if (part === 'knp') return 'KNP';
      if (part === 'phivolcs') return 'PHIVOLCS';
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

function extractLocationAndNotes(rawLoc: string): {
  cleanPlace: string;
  auditNote: string | null;
  telemetry: string | null;
  inferredSensor: string | null;
  isTemporary: boolean;
  isUnverified: boolean;
} {
  let text = cleanEncodingText(rawLoc);
  const notes: string[] = [];

  // Extract <...> tags like <CEGA/MLAJ-2025>
  text = text.replace(/<([^>]+)>/g, (_m, inner: string) => {
    notes.push(inner.trim());
    return '';
  });

  // Extract trailing -(verified ...) or - (verified ...)
  text = text.replace(/-\s*\(([^)]*)\)/g, (_m, inner: string) => {
    notes.push(inner.trim());
    return '';
  });

  // Extract trailing -(ok, ... or - 091014 dss
  text = text.replace(/-\s*\(?ok,?\s*([^)]*)\)?$/gi, (_m, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return '';
  });
  text = text.replace(/-\s*\d{6}\s*[a-z]*$/i, (m) => {
    notes.push(m.replace(/^-/, '').trim());
    return '';
  });

  // Extract parenthetical metadata tags, keeping short station alias codes if informative
  let telemetry: string | null = null;
  let inferredSensor: string | null = null;
  let isTemporary = false;
  let isUnverified = false;

  text = text.replace(/\(([^)]+)\)/g, (_m, inner: string) => {
    const val = inner.trim();
    const low = val.toLowerCase();
    if (low.includes('qrt')) {
      telemetry = telemetry ? `${telemetry} · QRT` : 'QRT';
    }
    if (low.includes('telemetry') || low.includes('telemerty')) {
      telemetry = telemetry ? `${telemetry} · Telemetry` : 'Telemetry';
    }
    if (low.includes('bband') || low.includes('broadband')) {
      inferredSensor = 'Broadband';
    }
    if (low.includes('temporary')) {
      isTemporary = true;
    }
    if (low.includes('to be verified') || low.includes('new station')) {
      isUnverified = true;
    }
    notes.push(val);
    return '';
  });

  if (/\bacc station\b/i.test(text)) {
    inferredSensor = 'Accelerograph';
  }

  const cleanPlace = text
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/[-,]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanPlace,
    auditNote: notes.length > 0 ? notes.join(' · ') : null,
    telemetry,
    inferredSensor,
    isTemporary,
    isUnverified,
  };
}

function parseNameAndProvince(
  code: string,
  cleanPlace: string,
  volcanoRule: (typeof VOLCANO_PREFIX_RULES)[number] | undefined
): { name: string; province: string } {
  if (!cleanPlace) {
    if (volcanoRule) {
      return {
        name: `${code} ${volcanoRule.volcanoName} Station`,
        province: volcanoRule.defaultProvince,
      };
    }
    return {
      name: `${code} Seismic Station`,
      province: 'Unassigned',
    };
  }

  // Handle "Barangay X, MUNICIPALITY, PROVINCE" or "Olivo, Tabuelan, Cebu"
  const parts = cleanPlace
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    const provRaw = parts[parts.length - 1];
    const muniRaw = parts[parts.length - 2];
    const siteRaw = parts.slice(0, -2).join(', ');
    const siteClean = siteRaw.replace(/^Barangay$/i, '').trim();
    const name = siteClean
      ? `${toTitleCase(muniRaw)} (${toTitleCase(siteClean)})`
      : toTitleCase(muniRaw);
    return {
      name,
      province: toTitleCase(provRaw),
    };
  }

  if (parts.length === 2) {
    const left = toTitleCase(parts[0]);
    const right = toTitleCase(parts[1]);
    // e.g. "Barangay Poblacion, NUEVA ERA" or "San Vicente, Tabogon" or "Mabini, Batangas"
    if (/^(barangay|brgy\.?|sitio|ermita|musuan|camiguin|lydia|valbuena|san roque dam)/i.test(left)) {
      return {
        name: `${right} (${left})`,
        province: volcanoRule?.defaultProvince ?? right,
      };
    }
    return {
      name: left,
      province: right,
    };
  }

  // Single segment
  const single = toTitleCase(parts[0]);
  return {
    name: single,
    province: volcanoRule?.defaultProvince ?? single,
  };
}

function classifyNetworkType(
  code: string,
  rawLocation: string,
  volcanoRule: (typeof VOLCANO_PREFIX_RULES)[number] | undefined,
  isTemporary: boolean
): StationNetworkType {
  const locUpper = rawLocation.toUpperCase();
  if (
    code === 'SMP' ||
    /^ZN[P-X]$/.test(code) ||
    locUpper.includes('ACC STATION') ||
    locUpper.includes('SRPC') ||
    locUpper.includes('SAN ROQUE DAM')
  ) {
    return 'strong_motion';
  }
  if (volcanoRule || locUpper.includes('VOLCANO')) {
    return 'volcanic';
  }
  if (
    isTemporary ||
    /^ST\d+$/.test(code) ||
    ['CHD', 'CTC', 'CMD', 'CKS', 'CTS'].includes(code)
  ) {
    return 'temporary';
  }
  return 'seismic';
}

function parseCsvRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function escapeCsvCell(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function isCsvFormat(lines: string[]): boolean {
  const firstNonEmpty = lines.find((l) => l.trim().length > 0)?.trim() ?? '';
  if (!firstNonEmpty.includes(',')) return false;
  const cols = parseCsvRow(firstNonEmpty).map((c) => c.toLowerCase());
  if (
    cols.some((c) => c === 'code' || c === 'station' || c === 'sta') &&
    cols.some((c) => c === 'lat' || c === 'latitude')
  ) {
    return true;
  }
  return cols.length >= 4 && /^[A-Za-z0-9_-]{2,8}$/.test(cols[0]) && Number.isFinite(Number(cols[1]));
}

function parseStationsCsv(
  lines: string[],
  existingOverrides: Record<string, Partial<StationMetaRecord>> = {}
): PhilstaParseResult {
  const issues: StationDataIssue[] = [];
  const byCode = new Map<string, StationMetaRecord>();
  let rawLineCount = 0;

  const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return { stations: [], issues, rawLineCount: 0 };

  const firstCols = parseCsvRow(nonEmpty[0]).map((c) => c.toLowerCase().replace(/\s+/g, '_'));
  const hasHeader =
    firstCols.some((c) => c === 'code' || c === 'station' || c === 'sta') &&
    firstCols.some((c) => c === 'lat' || c === 'latitude');

  const colIndex = (aliases: string[], fallbackIdx: number) => {
    if (!hasHeader) return fallbackIdx;
    const found = firstCols.findIndex((c) => aliases.includes(c));
    return found >= 0 ? found : -1;
  };

  const idxCode = colIndex(['code', 'station', 'sta'], 0);
  const idxName = colIndex(['name', 'station_name', 'location'], 1);
  const idxProv = colIndex(['province', 'region'], 2);
  const idxLat = colIndex(['lat', 'latitude'], 3);
  const idxLon = colIndex(['lon', 'lng', 'longitude'], 4);
  const idxElev = colIndex(['elevation_m', 'elevation', 'elev', 'elev_m'], 5);
  const idxDelay = colIndex(['delay_sec', 'delay', 'delay_s'], 6);
  const idxNet = colIndex(['network_type', 'network', 'type'], 7);
  const idxVolc = colIndex(['volcano_name', 'volcano'], 8);
  const idxSensor = colIndex(['sensor', 'sensor_model'], 9);
  const idxStatus = colIndex(['status', 'state'], 10);
  const idxNote = colIndex(['audit_note', 'notes', 'note'], 11);

  const startRow = hasHeader ? 1 : 0;
  for (let i = startRow; i < nonEmpty.length; i++) {
    rawLineCount++;
    const cols = parseCsvRow(nonEmpty[i]);
    const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : '');

    const rawCode = get(idxCode);
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const lat = Number(get(idxLat));
    const lon = Number(get(idxLon));
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const elevRaw = Number(get(idxElev));
    const elevationM = Number.isFinite(elevRaw) ? Math.round(elevRaw) : 0;
    const delayRaw = Number(get(idxDelay));
    const override = existingOverrides[code];
    const delaySec = Number.isFinite(delayRaw)
      ? Number(delayRaw.toFixed(3))
      : override?.delaySec ?? LEGACY_DELAY_SEEDS[code]?.delaySec ?? 0;

    const rawName = get(idxName);
    const rawProv = get(idxProv);
    const volcanoRule = VOLCANO_PREFIX_RULES.find((r) =>
      r.match(code, `${rawName} ${rawProv}`)
    );

    const netRaw = get(idxNet).toLowerCase();
    const networkType: StationNetworkType =
      netRaw === 'volcanic' ||
      netRaw === 'seismic' ||
      netRaw === 'strong_motion' ||
      netRaw === 'temporary'
        ? netRaw
        : classifyNetworkType(code, `${rawName} ${rawProv}`, volcanoRule, false);

    const statusRaw = get(idxStatus).toLowerCase();
    const status: StationOperationalStatus =
      statusRaw === 'active' ||
      statusRaw === 'temporary' ||
      statusRaw === 'unverified' ||
      statusRaw === 'retired'
        ? statusRaw
        : 'active';

    const volcanoName =
      get(idxVolc) || (networkType === 'volcanic' ? volcanoRule?.volcanoName ?? null : null);

    const candidate: StationMetaRecord = {
      code,
      name: rawName || `${code} Station`,
      province: rawProv || volcanoRule?.defaultProvince || 'Philippines',
      lat,
      lon,
      elevationM,
      delaySec,
      sensor:
        get(idxSensor) ||
        override?.sensor ||
        (networkType === 'strong_motion'
          ? 'Accelerograph'
          : networkType === 'volcanic'
            ? 'Volcano-Seismic'
            : 'Broadband 120s'),
      networkType,
      volcanoName,
      status,
      auditNote: get(idxNote) || null,
    };

    if (lat < 4.3 || lat > 21.5 || lon < 116.5 || lon > 127.5) {
      candidate.anomalyFlags = ['Coordinates outside Philippine bounding box'];
      issues.push({
        id: `csv-bbox-${code}-${i}`,
        code,
        severity: 'error',
        kind: 'coordinate_outlier',
        message: `${code} coordinates (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E) fall outside Philippine bounds.`,
      });
    }

    byCode.set(code, candidate);
  }

  return {
    stations: Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code)),
    issues,
    rawLineCount,
  };
}

export function parsePhilstaText(
  rawText: string,
  existingOverrides: Record<string, Partial<StationMetaRecord>> = {}
): PhilstaParseResult {
  const lines = rawText.split(/\r?\n/);
  if (isCsvFormat(lines)) {
    return parseStationsCsv(lines, existingOverrides);
  }

  const issues: StationDataIssue[] = [];
  const byCode = new Map<string, StationMetaRecord>();

  let rawLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;
    if (/^STATION\s+LATITUDE\s+LONGITUDE/i.test(rawLine)) continue;

    rawLineCount++;
    const match = rawLine.match(
      /^([A-Za-z0-9_-]{2,8})\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+)(?:\s+(.*))?$/
    );
    if (!match) continue;

    const rawCode = match[1];
    const code = rawCode.toUpperCase();
    const lat = Number(match[2]);
    const lon = Number(match[3]);
    const elevationM = Number(match[4]);
    let rawLoc = (match[5] ?? '').trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    // Support optional exported DELAY and TYPE columns from formatPhilstaDat:
    // e.g. "+0.05  VOLC:Taal         Tagaytay, Cavite" or "-0.02  SEISMIC  Ormoc, Leyte"
    let explicitDelay: number | undefined;
    let explicitNetType: StationNetworkType | undefined;
    let explicitVolcano: string | null | undefined;
    const extMatch = rawLoc.match(
      /^([+-]\d+(?:\.\d+)?)\s+(SEISMIC|STRONG_MOTION|TEMPORARY|VOLC:\S+)(?:\s+(.*))?$/i
    );
    if (extMatch) {
      const parsedDelay = Number(extMatch[1]);
      if (Number.isFinite(parsedDelay)) explicitDelay = parsedDelay;
      const typeToken = extMatch[2].toUpperCase();
      if (typeToken === 'SEISMIC') explicitNetType = 'seismic';
      else if (typeToken === 'STRONG_MOTION') explicitNetType = 'strong_motion';
      else if (typeToken === 'TEMPORARY') explicitNetType = 'temporary';
      else if (typeToken.startsWith('VOLC:')) {
        explicitNetType = 'volcanic';
        const vName = extMatch[2].slice(5).replace(/_/g, ' ').trim();
        if (vName && vName.toUpperCase() !== 'GEN') explicitVolcano = vName;
      }
      rawLoc = (extMatch[3] ?? '').trim();
    }

    const extracted = extractLocationAndNotes(rawLoc);
    const volcanoRule = VOLCANO_PREFIX_RULES.find((r) => r.match(code, rawLoc));
    const networkType =
      explicitNetType ?? classifyNetworkType(code, rawLoc, volcanoRule, extracted.isTemporary);
    const { name, province } = parseNameAndProvince(code, extracted.cleanPlace, volcanoRule);

    const anomalyFlags: string[] = [];
    if (rawCode !== code) {
      anomalyFlags.push(`Normalized code casing (${rawCode} → ${code})`);
    }
    if (!extracted.cleanPlace) {
      anomalyFlags.push('Missing location description');
      issues.push({
        id: `missing-loc-${code}-${i}`,
        code,
        severity: 'info',
        kind: 'missing_location',
        message: `${code} (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E) has no location text in the source file.`,
      });
    }
    if (elevationM === 0) {
      anomalyFlags.push('Elevation placeholder (0 m)');
    }

    // Check Philippine archipelago bounding box
    if (lat < 4.3 || lat > 21.5 || lon < 116.5 || lon > 127.5) {
      anomalyFlags.push('Coordinates outside Philippine bounding box');
      issues.push({
        id: `bbox-${code}-${i}`,
        code,
        severity: 'error',
        kind: 'coordinate_outlier',
        message: `${code} coordinates (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E) fall outside the Philippine network bounds.`,
      });
    }

    // Check volcano cluster proximity (> 85 km away from parent volcano is likely a coordinate typo)
    if (volcanoRule) {
      const distKm = haversineKm(lat, lon, volcanoRule.refLat, volcanoRule.refLon);
      if (distKm > 85) {
        // Check if shifting longitude by +4 or -1 brings it near the volcano (e.g. VBM 120.001 -> 124.001, VKC 124.203 -> 123.203)
        let suggestedLon: number | undefined;
        for (const candidateLon of [lon + 4, lon - 1, lon + 1, lon - 4]) {
          if (haversineKm(lat, candidateLon, volcanoRule.refLat, volcanoRule.refLon) < 40) {
            suggestedLon = Number(candidateLon.toFixed(4));
            break;
          }
        }
        anomalyFlags.push(
          `Coordinate outlier: ${Math.round(distKm)} km from ${volcanoRule.volcanoName} Volcano`
        );
        issues.push({
          id: `volc-outlier-${code}-${i}`,
          code,
          severity: 'error',
          kind: 'coordinate_outlier',
          message: `${code} (${name}) is plotted ${Math.round(distKm)} km from ${volcanoRule.volcanoName} (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)${
            suggestedLon !== undefined
              ? ` — likely longitude typo (suggested ${suggestedLon.toFixed(3)}°E).`
              : '.'
          }`,
          suggestedFix: suggestedLon !== undefined ? { lon: suggestedLon } : undefined,
        });
      }
    }

    const legacySeed = LEGACY_DELAY_SEEDS[code];
    const override = existingOverrides[code];
    const sensor =
      override?.sensor ??
      extracted.inferredSensor ??
      legacySeed?.sensor ??
      (networkType === 'strong_motion'
        ? 'Accelerograph'
        : networkType === 'volcanic'
          ? 'Volcano-Seismic'
          : 'Seismic');

    const status: StationOperationalStatus =
      override?.status ??
      (extracted.isTemporary
        ? 'temporary'
        : extracted.isUnverified || anomalyFlags.some((f) => f.includes('outlier'))
          ? 'unverified'
          : 'active');

    const candidate: StationMetaRecord = {
      code,
      name: override?.name ?? name,
      province: override?.province ?? province,
      lat: override?.lat ?? lat,
      lon: override?.lon ?? lon,
      elevationM: override?.elevationM ?? elevationM,
      delaySec: explicitDelay ?? override?.delaySec ?? legacySeed?.delaySec ?? 0,
      sensor,
      networkType: override?.networkType ?? networkType,
      volcanoName:
        explicitVolcano !== undefined
          ? explicitVolcano
          : override?.volcanoName !== undefined
            ? override.volcanoName
            : volcanoRule?.volcanoName ?? null,
      status,
      telemetry: extracted.telemetry,
      auditNote: extracted.auditNote,
      anomalyFlags: anomalyFlags.length > 0 ? anomalyFlags : undefined,
    };

    const existing = byCode.get(code);
    if (existing) {
      const sepKm = haversineKm(existing.lat, existing.lon, candidate.lat, candidate.lon);
      if (sepKm > 5) {
        // Conflicting coordinates for same code!
        // Heuristic: for Cebu stations (OTCB, SVCB), keep the coordinate that is near Cebu (lon ~123.6-124.2) rather than Leyte (~125.2).
        const existingLooksCebu = existing.province.toLowerCase().includes('cebu');
        const candidateLooksCebu = candidate.province.toLowerCase().includes('cebu');
        let chosen = candidate;
        let discarded = existing;
        if (existingLooksCebu && candidateLooksCebu) {
          const existNearCebu = existing.lon >= 123.3 && existing.lon <= 124.4;
          const candNearCebu = candidate.lon >= 123.3 && candidate.lon <= 124.4;
          if (existNearCebu && !candNearCebu) {
            chosen = existing;
            discarded = candidate;
          }
        }
        chosen.anomalyFlags = Array.from(
          new Set([
            ...(chosen.anomalyFlags ?? []),
            `Duplicate conflict resolved (kept ${chosen.lat.toFixed(3)}, ${chosen.lon.toFixed(3)}; rejected ${discarded.lat.toFixed(3)}, ${discarded.lon.toFixed(3)})`,
          ])
        );
        byCode.set(code, chosen);
        issues.push({
          id: `dup-conflict-${code}-${i}`,
          code,
          severity: 'warning',
          kind: 'duplicate_conflict',
          message: `Duplicate code ${code} had two coordinates ${Math.round(sepKm)} km apart (${existing.lat.toFixed(3)}, ${existing.lon.toFixed(3)} vs. ${candidate.lat.toFixed(3)}, ${candidate.lon.toFixed(3)}). Kept ${chosen.lat.toFixed(3)}°N, ${chosen.lon.toFixed(3)}°E.`,
          suggestedFix: {
            lat: chosen.lat,
            lon: chosen.lon,
            elevationM: chosen.elevationM,
          },
        });
      } else {
        // Precision/metadata update for same site
        const merged: StationMetaRecord = {
          ...existing,
          ...candidate,
          name:
            candidate.name.length >= existing.name.length ? candidate.name : existing.name,
          auditNote:
            [existing.auditNote, candidate.auditNote].filter(Boolean).join(' · ') || null,
          anomalyFlags: Array.from(
            new Set([
              ...(existing.anomalyFlags ?? []),
              ...(candidate.anomalyFlags ?? []),
              'Merged duplicate entry (higher-precision coordinates retained)',
            ])
          ),
        };
        byCode.set(code, merged);
        issues.push({
          id: `dup-merged-${code}-${i}`,
          code,
          severity: 'info',
          kind: 'duplicate_merged',
          message: `Merged duplicate ${code} rows (retained ${merged.lat.toFixed(5)}°N, ${merged.lon.toFixed(5)}°E).`,
        });
      }
    } else {
      byCode.set(code, candidate);
    }
  }

  const stations = Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
  return { stations, issues, rawLineCount };
}

export function formatPhilstaDat(stations: StationMetaRecord[]): string {
  const header = 'STATION LATITUDE   LONGITUDE  ELEVATION  DELAY   TYPE            LOCATION';
  const rows = [...stations]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((st) => {
      const codeCol = st.code.padEnd(7, ' ');
      const latCol = st.lat.toFixed(5).padStart(9, ' ');
      const lonCol = st.lon.toFixed(5).padStart(10, ' ');
      const elevCol = String(Math.round(st.elevationM)).padStart(6, ' ');
      const delayCol = `${st.delaySec >= 0 ? '+' : ''}${st.delaySec.toFixed(2)}`.padStart(6, ' ');
      const typeLabel =
        st.networkType === 'volcanic'
          ? `VOLC:${(st.volcanoName ?? 'GEN').replace(/\s+/g, '_')}`
          : st.networkType.toUpperCase();
      const typeCol = typeLabel.slice(0, 15).padEnd(15, ' ');
      const locText = `${st.name}, ${st.province}${st.auditNote ? ` (${st.auditNote})` : ''}`;
      return `${codeCol} ${latCol} ${lonCol} ${elevCol}     ${delayCol}  ${typeCol} ${locText}`;
    });
  return [header, ...rows].join('\n');
}

export function formatStationsCsv(stations: StationMetaRecord[]): string {
  const header = [
    'code',
    'name',
    'province',
    'lat',
    'lon',
    'elevation_m',
    'delay_sec',
    'network_type',
    'volcano_name',
    'sensor',
    'status',
    'audit_note',
  ].join(',');
  const rows = [...stations]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((st) =>
      [
        st.code,
        st.name,
        st.province,
        st.lat.toFixed(5),
        st.lon.toFixed(5),
        Math.round(st.elevationM),
        st.delaySec.toFixed(3),
        st.networkType,
        st.volcanoName ?? '',
        st.sensor,
        st.status,
        st.auditNote ?? '',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  return [header, ...rows].join('\n');
}
