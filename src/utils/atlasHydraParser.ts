import type {
  AtlasPickMetadata,
  EQPEvent,
  StationMeta,
  StationPick,
} from '../data/eqpData';

export interface AtlasEventHeader {
  rawHeaderLine: string;
  rawTimestamp16: string;
  originDateGmt: string;
  originTimeGmt: string;
  originDateLst: string;
  originTimeLst: string;
  originUtcMs: number;
  originIso: string;
}

export interface AtlasPhaseObservation {
  phase: 'P' | 'S';
  phaseMarker: 'P' | 'S';
  stationCode: string;
  network: string;
  channel: string;
  recordCode: string;
  utcMs: number;
  utcIso: string;
  utcTimeDisplay: string;
  utcDateDisplay: string;
  mmSs: string;
  relSecFromOrigin: number;
  duration: number | null;
  rawLine: string;
  lineNumber: number;
}

export interface AtlasStationGroup {
  key: string;
  stationCode: string;
  network: string;
  pCandidates: AtlasPhaseObservation[];
  sCandidates: AtlasPhaseObservation[];
  primaryP: AtlasPhaseObservation | null;
  primaryS: AtlasPhaseObservation | null;
  duration: number | null;
  ambiguousPhases: boolean;
  ambiguityReasons: string[];
  sOnlyMissingP: boolean;
  resolvedDbStation: StationMeta | null;
  resolvedViaThreeCharFallback: boolean;
  threeCharAliasConflict: boolean;
  unknownStation: boolean;
}

export interface AtlasRejectedLine {
  lineNumber: number;
  reason: string;
  rawLine: string;
}

export interface AtlasParseSummary {
  totalStations: number;
  pObservations: number;
  sObservations: number;
  validDurations: number;
  ambiguousStations: number;
  sOnlyStations: number;
  unknownStations: number;
  rejectedLineCount: number;
}

export interface AtlasParseResult {
  isAtlasHydra: boolean;
  valid: boolean;
  error?: string;
  header: AtlasEventHeader | null;
  groups: AtlasStationGroup[];
  rejectedLines: AtlasRejectedLine[];
  warnings: string[];
  summary: AtlasParseSummary;
}

function normalizeNewlinesPreserveColumns(rawText: string): string[] {
  return rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function isValidUtcParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  centisec: number
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isInteger(centisec)
  ) {
    return false;
  }
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;
  if (centisec < 0 || centisec > 99) return false;

  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second, centisec * 10));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute &&
    d.getUTCSeconds() === second
  );
}

function formatDateUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

function formatTimeUtc(d: Date, centisec: number): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(
    2,
    '0'
  )}:${String(d.getUTCSeconds()).padStart(2, '0')}.${String(centisec).padStart(2, '0')}`;
}

/**
 * Rule 1: Read first 16 characters of line 1 as YYYYMMDDHHMMSScc in UTC/GMT.
 * Does not fabricate coordinates, depth, or magnitude from unverified header columns.
 */
export function parseAtlasHeaderLine(headerLine: string): AtlasEventHeader | null {
  if (!headerLine || headerLine.length < 16) return null;
  const ts16 = headerLine.slice(0, 16);
  if (!/^\d{16}$/.test(ts16)) return null;

  const year = Number(ts16.slice(0, 4));
  const month = Number(ts16.slice(4, 6));
  const day = Number(ts16.slice(6, 8));
  const hour = Number(ts16.slice(8, 10));
  const minute = Number(ts16.slice(10, 12));
  const second = Number(ts16.slice(12, 14));
  const centisec = Number(ts16.slice(14, 16));

  if (!isValidUtcParts(year, month, day, hour, minute, second, centisec)) {
    return null;
  }

  const originUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, centisec * 10);
  const dUtc = new Date(originUtcMs);
  const dLst = new Date(originUtcMs + 8 * 3600 * 1000);

  return {
    rawHeaderLine: headerLine,
    rawTimestamp16: ts16,
    originDateGmt: formatDateUtc(dUtc),
    originTimeGmt: formatTimeUtc(dUtc, centisec),
    originDateLst: formatDateUtc(dLst),
    originTimeLst: formatTimeUtc(dLst, centisec),
    originUtcMs,
    originIso: dUtc.toISOString(),
  };
}

/**
 * Rule 2: Ignore non-observation control lines:
 * - blank lines
 * - $1 section markers & standalone $ separators
 * - trailing $ control records and lines with only spaces and terminal zeros
 */
export function isAtlasControlLine(line: string): boolean {
  if (line.trim() === '') return true;
  if (line.startsWith('$')) return true;
  if (/^\s*0+\s*$/.test(line)) return true;
  return false;
}

function parseSecondsHundredths(raw4: string): { second: number; centisec: number } | null {
  if (raw4.length !== 4) return null;
  const secSlice = raw4.slice(0, 2);
  const csSlice = raw4.slice(2, 4);
  if (!/^[\d ]\d$/.test(secSlice) || !/^\d{2}$/.test(csSlice)) return null;

  const second = Number(secSlice.trim());
  const centisec = Number(csSlice);
  if (!Number.isInteger(second) || second < 0 || second > 59) return null;
  if (!Number.isInteger(centisec) || centisec < 0 || centisec > 99) return null;
  return { second, centisec };
}

function buildPhaseTimestamp(
  obsDateTime12: string,
  secRaw4: string,
  originUtcMs: number
): {
  utcMs: number;
  utcIso: string;
  utcTimeDisplay: string;
  utcDateDisplay: string;
  mmSs: string;
  relSecFromOrigin: number;
} | null {
  if (!/^\d{12}$/.test(obsDateTime12)) return null;
  const parsedSec = parseSecondsHundredths(secRaw4);
  if (!parsedSec) return null;

  const year = Number(obsDateTime12.slice(0, 4));
  const month = Number(obsDateTime12.slice(4, 6));
  const day = Number(obsDateTime12.slice(6, 8));
  const hour = Number(obsDateTime12.slice(8, 10));
  const minute = Number(obsDateTime12.slice(10, 12));
  const { second, centisec } = parsedSec;

  if (!isValidUtcParts(year, month, day, hour, minute, second, centisec)) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, centisec * 10);
  const d = new Date(utcMs);

  return {
    utcMs,
    utcIso: d.toISOString(),
    utcTimeDisplay: formatTimeUtc(d, centisec),
    utcDateDisplay: formatDateUtc(d),
    mmSs: `${String(minute).padStart(2, '0')}${String(second).padStart(2, '0')}.${String(
      centisec
    ).padStart(2, '0')}`,
    relSecFromOrigin: Number(((utcMs - originUtcMs) / 1000).toFixed(2)),
  };
}

/**
 * Rule 6: Extract coda duration strictly from columns 89-91 (0-based 88..91) of P records.
 * Never compute duration from S - P. Missing values remain null.
 */
export function parseAtlasDurationField(line: string): number | null {
  const rawDuration = line.slice(88, 91).trim();
  return /^\d+$/.test(rawDuration) ? Number(rawDuration) : null;
}

/**
 * Fixed-column extraction (1-based columns per ATLAS/HYDRA spec):
 * - Station code: 1-4 -> slice(0, 4)
 * - Network: 6-7 -> slice(5, 7)
 * - Channel: 10-12 -> slice(9, 12)
 * - P marker: 15 -> line[14]
 * - Record code: 17 -> line[16]
 * - Obs date/time: 18-29 -> slice(17, 29)
 * - P sec/cs: 31-34 -> slice(30, 34)
 * - S sec/cs: 43-46 -> slice(42, 46)
 * - S marker: 48 -> line[47]
 * - Coda duration: 89-91 -> slice(88, 91)
 */
export function parseAtlasObservationLine(
  line: string,
  lineNumber: number,
  originUtcMs: number
): { observations: AtlasPhaseObservation[]; rejected: AtlasRejectedLine | null } {
  const stationCode = line.slice(0, 4).trim().toUpperCase();
  const network = line.slice(5, 7).trim().toUpperCase();
  const channel = line.slice(9, 12).trim().toUpperCase();
  const pMarker = (line[14] ?? ' ').toUpperCase();
  const recordCode = (line[16] ?? ' ').trim();
  const obsDateTime12 = line.slice(17, 29);
  const pSecRaw = line.slice(30, 34);
  const sSecRaw = line.slice(42, 46);
  const sMarker = (line[47] ?? ' ').toUpperCase();

  if (!stationCode || !/^[A-Z0-9_-]{2,4}$/.test(stationCode)) {
    return {
      observations: [],
      rejected: {
        lineNumber,
        reason: `Invalid or missing station code in cols 1-4 ("${line.slice(0, 4)}")`,
        rawLine: line,
      },
    };
  }

  const hasP = pMarker === 'P';
  const hasS = sMarker === 'S';
  if (!hasP && !hasS) {
    return {
      observations: [],
      rejected: {
        lineNumber,
        reason: 'Missing P marker (col 15) and S marker (col 48)',
        rawLine: line,
      },
    };
  }

  const observations: AtlasPhaseObservation[] = [];

  if (hasP) {
    const pTs = buildPhaseTimestamp(obsDateTime12, pSecRaw, originUtcMs);
    if (!pTs) {
      return {
        observations: [],
        rejected: {
          lineNumber,
          reason: `Malformed P timestamp (cols 18-29="${obsDateTime12}", cols 31-34="${pSecRaw}")`,
          rawLine: line,
        },
      };
    }
    observations.push({
      phase: 'P',
      phaseMarker: 'P',
      stationCode,
      network,
      channel,
      recordCode,
      utcMs: pTs.utcMs,
      utcIso: pTs.utcIso,
      utcTimeDisplay: pTs.utcTimeDisplay,
      utcDateDisplay: pTs.utcDateDisplay,
      mmSs: pTs.mmSs,
      relSecFromOrigin: pTs.relSecFromOrigin,
      duration: parseAtlasDurationField(line),
      rawLine: line,
      lineNumber,
    });
  }

  if (hasS) {
    const sTs = buildPhaseTimestamp(obsDateTime12, sSecRaw, originUtcMs);
    if (!sTs) {
      return {
        observations: [],
        rejected: {
          lineNumber,
          reason: `Malformed S timestamp (cols 18-29="${obsDateTime12}", cols 43-46="${sSecRaw}")`,
          rawLine: line,
        },
      };
    }
    observations.push({
      phase: 'S',
      phaseMarker: 'S',
      stationCode,
      network,
      channel,
      recordCode,
      utcMs: sTs.utcMs,
      utcIso: sTs.utcIso,
      utcTimeDisplay: sTs.utcTimeDisplay,
      utcDateDisplay: sTs.utcDateDisplay,
      mmSs: sTs.mmSs,
      relSecFromOrigin: sTs.relSecFromOrigin,
      duration: null,
      rawLine: line,
      lineNumber,
    });
  }

  return { observations, rejected: null };
}

function getHeaderStartIndex(lines: string[]): number {
  let idx = 0;
  while (idx < lines.length && lines[idx].trim() === '') {
    idx++;
  }
  return idx;
}

/**
 * Stage 2 Format Detection:
 * Recognizes ATLAS/HYDRA clipboard data when:
 * - First line is a plausible ATLAS event header (16-digit UTC timestamp)
 * - Second line immediately following begins with "$1"
 * - Subsequent lines contain at least one recognizable fixed-column P or S record
 */
export function detectAtlasHydraFormat(rawText: string): boolean {
  if (!rawText || typeof rawText !== 'string') return false;
  const lines = normalizeNewlinesPreserveColumns(rawText);
  const startIdx = getHeaderStartIndex(lines);
  if (startIdx + 2 >= lines.length) return false;

  const headerLine = lines[startIdx];
  const sectionLine = lines[startIdx + 1];
  if (!sectionLine.startsWith('$1')) return false;

  const header = parseAtlasHeaderLine(headerLine);
  if (!header) return false;

  for (let i = startIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (isAtlasControlLine(line)) continue;
    const { observations } = parseAtlasObservationLine(line, i + 1, header.originUtcMs);
    if (observations.length > 0) return true;
  }

  return false;
}

/**
 * Full ATLAS/HYDRA parser pipeline:
 * Header -> Control filtering -> Fixed-column phase extraction ->
 * Event/Station/Network grouping -> Ambiguity & station DB verification.
 */
export function parseAtlasHydraClipboard(
  rawText: string,
  stations: ReadonlyArray<StationMeta>
): AtlasParseResult {
  const emptySummary: AtlasParseSummary = {
    totalStations: 0,
    pObservations: 0,
    sObservations: 0,
    validDurations: 0,
    ambiguousStations: 0,
    sOnlyStations: 0,
    unknownStations: 0,
    rejectedLineCount: 0,
  };

  if (!rawText || typeof rawText !== 'string') {
    return {
      isAtlasHydra: false,
      valid: false,
      error: 'Clipboard text is empty.',
      header: null,
      groups: [],
      rejectedLines: [],
      warnings: [],
      summary: emptySummary,
    };
  }

  const lines = normalizeNewlinesPreserveColumns(rawText);
  const startIdx = getHeaderStartIndex(lines);
  if (startIdx + 1 >= lines.length) {
    return {
      isAtlasHydra: false,
      valid: false,
      header: null,
      groups: [],
      rejectedLines: [],
      warnings: [],
      summary: emptySummary,
    };
  }

  const headerLine = lines[startIdx];
  const sectionLine = lines[startIdx + 1];
  const header = parseAtlasHeaderLine(headerLine);

  if (!header || !sectionLine.startsWith('$1')) {
    return {
      isAtlasHydra: false,
      valid: false,
      error: 'Clipboard content does not match ATLAS/HYDRA ($1) format.',
      header: null,
      groups: [],
      rejectedLines: [],
      warnings: [],
      summary: emptySummary,
    };
  }

  const groupMap = new Map<
    string,
    {
      key: string;
      stationCode: string;
      network: string;
      pCandidates: AtlasPhaseObservation[];
      sCandidates: AtlasPhaseObservation[];
    }
  >();
  const rejectedLines: AtlasRejectedLine[] = [];

  for (let i = startIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (isAtlasControlLine(line)) continue;

    const { observations, rejected } = parseAtlasObservationLine(
      line,
      i + 1,
      header.originUtcMs
    );
    if (rejected) {
      rejectedLines.push(rejected);
      continue;
    }

    for (const obs of observations) {
      const groupKey = `${obs.stationCode}::${obs.network}`;
      let grp = groupMap.get(groupKey);
      if (!grp) {
        grp = {
          key: groupKey,
          stationCode: obs.stationCode,
          network: obs.network,
          pCandidates: [],
          sCandidates: [],
        };
        groupMap.set(groupKey, grp);
      }
      if (obs.phase === 'P') {
        grp.pCandidates.push(obs);
      } else {
        grp.sCandidates.push(obs);
      }
    }
  }

  if (groupMap.size === 0) {
    return {
      isAtlasHydra: true,
      valid: false,
      error: 'ATLAS/HYDRA header and $1 section found, but no valid station phase records were parsed.',
      header,
      groups: [],
      rejectedLines,
      warnings: rejectedLines.map((r) => `Line ${r.lineNumber}: ${r.reason}`),
      summary: { ...emptySummary, rejectedLineCount: rejectedLines.length },
    };
  }

  // Index existing PHILSTA database cleanly without overwriting duplicates
  const stationByExactCode = new Map<string, StationMeta>();
  for (const st of stations) {
    const code = st.code.trim().toUpperCase();
    if (code && !stationByExactCode.has(code)) {
      stationByExactCode.set(code, st);
    }
  }

  // Track distinct 4-character stations sharing the same 3-character prefix in this event
  // so we NEVER silently merge distinct stations sharing a 3-char prefix (Rule 3).
  const distinctFourCharByPrefix3 = new Map<string, Set<string>>();
  for (const grp of groupMap.values()) {
    if (grp.stationCode.length === 4 && !stationByExactCode.has(grp.stationCode)) {
      const prefix3 = grp.stationCode.slice(0, 3);
      let set = distinctFourCharByPrefix3.get(prefix3);
      if (!set) {
        set = new Set<string>();
        distinctFourCharByPrefix3.set(prefix3, set);
      }
      set.add(grp.stationCode);
    }
  }

  const warnings: string[] = [];
  const groups: AtlasStationGroup[] = [];
  let pObservations = 0;
  let sObservations = 0;
  let validDurations = 0;
  let ambiguousStations = 0;
  let sOnlyStations = 0;
  let unknownStations = 0;

  for (const rawGrp of groupMap.values()) {
    const primaryP = rawGrp.pCandidates[0] ?? null;
    const primaryS = rawGrp.sCandidates[0] ?? null;
    const pDurations = rawGrp.pCandidates
      .map((p) => p.duration)
      .filter((d): d is number => d !== null);
    const uniqueDurations = Array.from(new Set(pDurations));
    const duration = primaryP?.duration ?? null;

    const ambiguityReasons: string[] = [];
    if (rawGrp.pCandidates.length > 1) {
      ambiguityReasons.push(`Multiple P picks (${rawGrp.pCandidates.length}) retained for review`);
    }
    if (rawGrp.sCandidates.length > 1) {
      ambiguityReasons.push(`Multiple S picks (${rawGrp.sCandidates.length}) retained for review`);
    }
    if (uniqueDurations.length > 1) {
      ambiguityReasons.push(`Conflicting coda durations (${uniqueDurations.join(', ')}s)`);
    }

    const sOnlyMissingP = primaryP === null && primaryS !== null;
    if (sOnlyMissingP) {
      sOnlyStations++;
      warnings.push(
        `${rawGrp.stationCode}: S-only observation (no P pick; EQP duration magnitude and P-residual workflows require P).`
      );
    }

    let resolvedDbStation: StationMeta | null =
      stationByExactCode.get(rawGrp.stationCode) ?? null;
    let resolvedViaThreeCharFallback = false;
    let threeCharAliasConflict = false;

    if (!resolvedDbStation && rawGrp.stationCode.length === 4) {
      const prefix3 = rawGrp.stationCode.slice(0, 3);
      const sharing = distinctFourCharByPrefix3.get(prefix3);
      if (sharing && sharing.size > 1) {
        threeCharAliasConflict = true;
        ambiguityReasons.push(
          `Multiple 4-char stations (${Array.from(sharing).join(', ')}) share 3-char prefix ${prefix3}`
        );
      } else {
        const legacyMatch = stationByExactCode.get(prefix3) ?? null;
        if (legacyMatch) {
          resolvedDbStation = legacyMatch;
          resolvedViaThreeCharFallback = true;
        }
      }
    }

    const unknownStation = resolvedDbStation === null;
    if (unknownStation) {
      unknownStations++;
      warnings.push(
        `${rawGrp.stationCode}: No matching station found in active PHILSTA catalog${
          threeCharAliasConflict ? ' (3-char prefix conflict)' : ''
        }.`
      );
    }

    const ambiguousPhases = ambiguityReasons.length > 0;
    if (ambiguousPhases) {
      ambiguousStations++;
      warnings.push(`${rawGrp.stationCode}: ${ambiguityReasons.join('; ')}.`);
    }

    if (primaryP) pObservations++;
    if (primaryS) sObservations++;
    if (duration !== null) validDurations++;

    groups.push({
      key: rawGrp.key,
      stationCode: rawGrp.stationCode,
      network: rawGrp.network,
      pCandidates: rawGrp.pCandidates,
      sCandidates: rawGrp.sCandidates,
      primaryP,
      primaryS,
      duration,
      ambiguousPhases,
      ambiguityReasons,
      sOnlyMissingP,
      resolvedDbStation,
      resolvedViaThreeCharFallback,
      threeCharAliasConflict,
      unknownStation,
    });
  }

  for (const r of rejectedLines) {
    warnings.push(`Skipped line ${r.lineNumber}: ${r.reason}.`);
  }

  return {
    isAtlasHydra: true,
    valid: true,
    header,
    groups,
    rejectedLines,
    warnings,
    summary: {
      totalStations: groups.length,
      pObservations,
      sObservations,
      validDurations,
      ambiguousStations,
      sOnlyStations,
      unknownStations,
      rejectedLineCount: rejectedLines.length,
    },
  };
}

let atlasPickSequence = 0;

function parseOriginUtcMs(dateGmt: string, timeGmt: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateGmt.trim());
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,2}))?$/.exec(timeGmt.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3]);
  const csRaw = (timeMatch[4] ?? '00').padEnd(2, '0');
  const centisec = Number(csRaw);

  if (!isValidUtcParts(year, month, day, hour, minute, second, centisec)) {
    return null;
  }
  return Date.UTC(year, month - 1, day, hour, minute, second, centisec * 10);
}

export interface AtlasAppendOutcome {
  event: EQPEvent;
  mode: 'noop-failed' | 'populated-empty' | 'appended-existing';
  existingCountBefore: number;
  appendedCount: number;
  totalCountAfter: number;
  originTimeMismatch: boolean;
  existingOriginLabel: string;
  pastedOriginLabel: string;
  appendedPicks: StationPick[];
}

/**
 * Converts parsed ATLAS/HYDRA station groups into EQP Modern StationPick records,
 * preserving full 4-char station identifiers, MMSS.ss phase picks, UTC provenance,
 * coda duration, and missing-field fidelity.
 */
export function convertAtlasResultToStationPicks(
  parsed: AtlasParseResult,
  referenceOriginUtcMs?: number | null
): StationPick[] {
  const stamp = Date.now();
  const hasRefOrigin =
    typeof referenceOriginUtcMs === 'number' && Number.isFinite(referenceOriginUtcMs);

  return parsed.groups.map((grp, idx) => {
    atlasPickSequence += 1;
    const rawLines = Array.from(
      new Set([
        ...grp.pCandidates.map((c) => c.rawLine),
        ...grp.sCandidates.map((c) => c.rawLine),
      ])
    );

    const atlasMetadata: AtlasPickMetadata = {
      originalStationCode: grp.stationCode,
      resolvedStationCode: grp.resolvedDbStation?.code ?? null,
      network: grp.network,
      pChannel: grp.primaryP?.channel ?? null,
      sChannel: grp.primaryS?.channel ?? null,
      pUtcTime: grp.primaryP?.utcTimeDisplay ?? null,
      sUtcTime: grp.primaryS?.utcTimeDisplay ?? null,
      pUtcIso: grp.primaryP?.utcIso ?? null,
      sUtcIso: grp.primaryS?.utcIso ?? null,
      pMarker: grp.primaryP?.phaseMarker ?? null,
      sMarker: grp.primaryS?.phaseMarker ?? null,
      pCandidateCount: grp.pCandidates.length,
      sCandidateCount: grp.sCandidates.length,
      ambiguousPhases: grp.ambiguousPhases,
      sOnlyMissingP: grp.sOnlyMissingP,
      unknownStation: grp.unknownStation,
      threeCharAliasConflict: grp.threeCharAliasConflict,
      rawLines,
    };

    const computeRelSec = (obs: AtlasPhaseObservation | null): number => {
      if (!obs) return 0;
      if (hasRefOrigin && Math.abs(obs.utcMs - referenceOriginUtcMs!) <= 3600 * 1000) {
        return Number(Math.max(0, (obs.utcMs - referenceOriginUtcMs!) / 1000).toFixed(2));
      }
      return Math.max(0, obs.relSecFromOrigin);
    };

    return {
      id: `atlas-${stamp}-${atlasPickSequence}-${idx}-${grp.stationCode}`,
      sta: grp.stationCode,
      pTime: grp.primaryP ? grp.primaryP.mmSs : '',
      pExcluded: false,
      sTime: grp.primaryS ? grp.primaryS.mmSs : '',
      sExcluded: false,
      duration: grp.duration,
      durationSource: grp.duration !== null ? 'atlas_coda' : undefined,
      amplitude: null,
      polarity: '',
      quality: 'B',
      lat: grp.resolvedDbStation?.lat ?? 0,
      lon: grp.resolvedDbStation?.lon ?? 0,
      toa: 0,
      azim: 0,
      delta: 0,
      resP: 0,
      resS: 0,
      obsP: computeRelSec(grp.primaryP),
      obsS: computeRelSec(grp.primaryS),
      calcP: 0,
      calcS: 0,
      ms: null,
      mb: null,
      md: null,
      atlasMetadata,
    };
  });
}

/**
 * Append-only ATLAS/HYDRA merge helper:
 * - If panel is empty (baseEvent.picks.length === 0), populates origin date/time and picks normally.
 * - If panel already has observations, preserves all existing rows in original order and
 *   appends new rows at the bottom without merging duplicates, sorting, or overwriting origin/event fields.
 * - If parsing failed, returns baseEvent completely unchanged.
 */
export function appendAtlasParseToEqpEvent(
  baseEvent: EQPEvent,
  parsed: AtlasParseResult
): AtlasAppendOutcome {
  const existingCountBefore = baseEvent.picks.length;
  const existingOriginLabel = `${baseEvent.originDateGmt} ${baseEvent.originTimeGmt}`.trim();
  const pastedOriginLabel = parsed.header
    ? `${parsed.header.originDateGmt} ${parsed.header.originTimeGmt}`
    : '';

  if (!parsed.valid || !parsed.header || parsed.groups.length === 0) {
    return {
      event: baseEvent,
      mode: 'noop-failed',
      existingCountBefore,
      appendedCount: 0,
      totalCountAfter: existingCountBefore,
      originTimeMismatch: false,
      existingOriginLabel,
      pastedOriginLabel,
      appendedPicks: [],
    };
  }

  if (existingCountBefore === 0) {
    const picks = convertAtlasResultToStationPicks(parsed, parsed.header.originUtcMs);
    const nextEvent: EQPEvent = {
      ...baseEvent,
      originDateGmt: parsed.header.originDateGmt,
      originTimeGmt: parsed.header.originTimeGmt,
      originDateLst: parsed.header.originDateLst,
      originTimeLst: parsed.header.originTimeLst,
      lat: 0,
      lon: 0,
      depthKm: 0,
      iterations: 0,
      errLatDeg: 0,
      errLonDeg: 0,
      errKm: 0,
      errSec: undefined,
      rmsSec: 0,
      ms: 0,
      mb: 0,
      md: 0,
      centralOfficeBearing: '',
      cities: [],
      selectedCityId: '',
      towns: [],
      selectedTownId: '',
      generators: [],
      selectedGeneratorId: '',
      locationMetadata: undefined,
      amplitudeMeasurements: [],
      amplitudeAssociationIssues: undefined,
      picks,
    };
    return {
      event: nextEvent,
      mode: 'populated-empty',
      existingCountBefore: 0,
      appendedCount: picks.length,
      totalCountAfter: picks.length,
      originTimeMismatch: false,
      existingOriginLabel: pastedOriginLabel,
      pastedOriginLabel,
      appendedPicks: picks,
    };
  }

  const existingOriginUtcMs = parseOriginUtcMs(baseEvent.originDateGmt, baseEvent.originTimeGmt);
  const originTimeMismatch =
    existingOriginUtcMs !== null
      ? Math.abs(existingOriginUtcMs - parsed.header.originUtcMs) >= 10
      : existingOriginLabel !== '' && existingOriginLabel !== pastedOriginLabel;

  const appendedPicks = convertAtlasResultToStationPicks(
    parsed,
    existingOriginUtcMs ?? parsed.header.originUtcMs
  );
  const combinedPicks = [...baseEvent.picks, ...appendedPicks];

  return {
    event: {
      ...baseEvent,
      picks: combinedPicks,
    },
    mode: 'appended-existing',
    existingCountBefore,
    appendedCount: appendedPicks.length,
    totalCountAfter: combinedPicks.length,
    originTimeMismatch,
    existingOriginLabel,
    pastedOriginLabel,
    appendedPicks,
  };
}

/**
 * Applies parsed ATLAS/HYDRA header origin time and picks to an EQPEvent without
 * auto-executing earthquake location. Uses append-only behavior when observations already exist.
 */
export function applyAtlasParseToEqpEvent(
  baseEvent: EQPEvent,
  parsed: AtlasParseResult
): EQPEvent {
  return appendAtlasParseToEqpEvent(baseEvent, parsed).event;
}

/**
 * Builds verified station metadata overrides when Locate is invoked so 4-character
 * ATLAS codes (e.g., APYP -> APY) resolve cleanly against the active PHILSTA database
 * without silently merging distinct 4-char codes sharing the same 3-char prefix.
 */
export function buildStationMetadataOverridesForPicks(
  picks: ReadonlyArray<StationPick>,
  stations: ReadonlyArray<StationMeta>
): Record<string, Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>> {
  const exactMap = new Map<string, StationMeta>();
  for (const st of stations) {
    const code = st.code.trim().toUpperCase();
    if (code && !exactMap.has(code)) {
      exactMap.set(code, st);
    }
  }

  const fourCharByPrefix3 = new Map<string, Set<string>>();
  for (const p of picks) {
    const upper = p.sta.trim().toUpperCase();
    if (upper.length === 4 && !exactMap.has(upper)) {
      const prefix3 = upper.slice(0, 3);
      let set = fourCharByPrefix3.get(prefix3);
      if (!set) {
        set = new Set<string>();
        fourCharByPrefix3.set(prefix3, set);
      }
      set.add(upper);
    }
  }

  const overrides: Record<
    string,
    Pick<StationMeta, 'lat' | 'lon' | 'delaySec' | 'elevationM'>
  > = {};
  for (const p of picks) {
    const upper = p.sta.trim().toUpperCase();
    if (!upper || exactMap.has(upper)) continue;

    if (p.atlasMetadata?.threeCharAliasConflict) continue;

    const explicitAlias = p.atlasMetadata?.resolvedStationCode?.trim().toUpperCase();
    if (explicitAlias && exactMap.has(explicitAlias)) {
      const meta = exactMap.get(explicitAlias)!;
      overrides[upper] = {
        lat: meta.lat,
        lon: meta.lon,
        delaySec: meta.delaySec,
        elevationM: meta.elevationM,
      };
      continue;
    }

    if (upper.length === 4) {
      const prefix3 = upper.slice(0, 3);
      const sharing = fourCharByPrefix3.get(prefix3);
      if (sharing && sharing.size === 1 && exactMap.has(prefix3)) {
        const meta = exactMap.get(prefix3)!;
        overrides[upper] = {
          lat: meta.lat,
          lon: meta.lon,
          delaySec: meta.delaySec,
          elevationM: meta.elevationM,
        };
      }
    }
  }

  return overrides;
}
