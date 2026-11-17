import type {
  EQPEvent,
  IntensityCategory,
  IntensityEntry,
  IntensityReviewStatus,
  PeisRoman,
} from '../data/eqpData.ts';
import {
  canonicalizeProvinceName,
  normalizeLocalityMatchKey,
  resolvePhilippineLocality,
  type PhilippineLocalityIndex,
} from './intensityLocalityCatalog.ts';

export const PEIS_LEVELS: PeisRoman[] = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
];

export const PEIS_LEVELS_DESC: PeisRoman[] = [...PEIS_LEVELS].reverse();

export const PEIS_RANK: Record<PeisRoman, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
};

export const PEIS_DESCRIPTORS: Record<PeisRoman, string> = {
  I: 'Scarcely Perceptible',
  II: 'Slightly Felt',
  III: 'Weak',
  IV: 'Moderately Strong',
  V: 'Strong',
  VI: 'Very Strong',
  VII: 'Destructive',
  VIII: 'Very Destructive',
  IX: 'Devastating',
  X: 'Completely Devastating',
};

export const REPORT_SOURCE_SUGGESTIONS: string[] = [
  'Official Report',
  'Field Observation',
  'LGU / MDRRMO',
  'PHIVOLCS Station',
  'RDRRMC / OCD',
  'Citizen / Social Report',
];

export const SAMPLE_MANUAL_INTENSITY_TEXT = [
  'Intensity V - Virac, Catanduanes',
  'Intensity IV - Bato and San Miguel, Catanduanes',
  '',
  'Instrumental Intensity:',
  'Intensity I - Nabunturan, DAVAO DE ORO',
].join('\n');

export function comparePeisDesc(a: PeisRoman, b: PeisRoman): number {
  return (PEIS_RANK[b] ?? 0) - (PEIS_RANK[a] ?? 0);
}

export function normalizeIntensityCategory(
  entry: Pick<IntensityEntry, 'category'>
): IntensityCategory {
  return entry.category === 'instrumental' ? 'instrumental' : 'felt';
}

/**
 * Legacy/pre-existing entries loaded from disk or seed catalog without an explicit
 * reviewStatus default to 'verified' to remain 100% backward compatible.
 */
export function normalizeIntensityReviewStatus(
  entry: Pick<IntensityEntry, 'reviewStatus'>
): IntensityReviewStatus {
  if (
    entry.reviewStatus === 'verified' ||
    entry.reviewStatus === 'draft' ||
    entry.reviewStatus === 'conflicting' ||
    entry.reviewStatus === 'unresolved'
  ) {
    return entry.reviewStatus;
  }
  return 'verified';
}

export function splitIntensitiesByCategory(entries: IntensityEntry[]): {
  felt: IntensityEntry[];
  instrumental: IntensityEntry[];
} {
  const felt: IntensityEntry[] = [];
  const instrumental: IntensityEntry[] = [];
  for (const entry of entries) {
    if (normalizeIntensityCategory(entry) === 'instrumental') {
      instrumental.push(entry);
    } else {
      felt.push(entry);
    }
  }
  return { felt, instrumental };
}

export function formatCanonicalLocalityDisplay(parts: {
  specificLocation?: string;
  municipality?: string;
  province?: string;
  fallbackLocality?: string;
}): string {
  const spec = parts.specificLocation?.trim() ?? '';
  const muni = parts.municipality?.trim() ?? '';
  const prov = parts.province?.trim() ?? '';
  const segments = [spec, muni, prov].filter(Boolean);
  if (segments.length > 0) {
    return segments.join(', ');
  }
  return (parts.fallbackLocality ?? '').trim();
}

export function deriveStructuredLocationParts(entry: Pick<
  IntensityEntry,
  'locality' | 'province' | 'municipality' | 'specificLocation'
>): {
  province: string;
  municipality: string;
  specificLocation: string;
} {
  if (entry.province !== undefined || entry.municipality !== undefined || entry.specificLocation !== undefined) {
    const prov = entry.province?.trim() ?? '';
    const muni = entry.municipality?.trim() ?? entry.locality.trim();
    const spec = entry.specificLocation?.trim() ?? '';
    return {
      province: prov,
      municipality: muni,
      specificLocation: spec,
    };
  }

  const raw = entry.locality.trim();
  if (!raw) {
    return { province: '', municipality: '', specificLocation: '' };
  }

  // Handle "Municipality (Province)" pattern
  const parenMatch = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    return {
      municipality: parenMatch[1].trim(),
      province: parenMatch[2].trim(),
      specificLocation: '',
    };
  }

  const commaParts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (commaParts.length >= 3) {
    return {
      specificLocation: commaParts.slice(0, commaParts.length - 2).join(', '),
      municipality: commaParts[commaParts.length - 2],
      province: commaParts[commaParts.length - 1],
    };
  }

  if (commaParts.length === 2) {
    return {
      specificLocation: '',
      municipality: commaParts[0],
      province: commaParts[1],
    };
  }

  return {
    specificLocation: '',
    municipality: raw,
    province: '',
  };
}

export function getLocalityConflictKey(
  entry: Pick<IntensityEntry, 'locality' | 'province' | 'municipality' | 'specificLocation'>
): string {
  const parts = deriveStructuredLocationParts(entry);
  const muniKey = normalizeLocalityMatchKey(parts.municipality || entry.locality);
  const provKey = normalizeLocalityMatchKey(parts.province);
  if (provKey) {
    return `${provKey}::${muniKey}`;
  }
  return `raw::${normalizeLocalityMatchKey(entry.locality)}`;
}

export function getExactEntryDedupeKey(
  entry: Pick<
    IntensityEntry,
    'category' | 'peis' | 'locality' | 'province' | 'municipality' | 'specificLocation'
  >
): string {
  const cat = normalizeIntensityCategory(entry);
  const locKey = getLocalityConflictKey(entry);
  const parts = deriveStructuredLocationParts(entry);
  const specKey = normalizeLocalityMatchKey(parts.specificLocation);
  return `${cat}|${entry.peis}|${locKey}|${specKey}`;
}

export interface IntensityConflictInfo {
  localityDisplay: string;
  peisValues: PeisRoman[];
  entryIds: string[];
  sources: string[];
}

export interface DuplicateGroupInfo {
  localityDisplay: string;
  peis: PeisRoman;
  category: IntensityCategory;
  count: number;
  entryIds: string[];
}

export interface IntensityAnalysisResult {
  conflictByEntryId: Map<string, IntensityConflictInfo>;
  conflictsList: IntensityConflictInfo[];
  duplicateIds: Set<string>;
  duplicateGroups: DuplicateGroupInfo[];
  eligibleFelt: IntensityEntry[];
  eligibleInstrumental: IntensityEntry[];
  counts: {
    total: number;
    feltTotal: number;
    instrumentalTotal: number;
    verified: number;
    draft: number;
    conflicting: number;
    unresolved: number;
    conflictGroups: number;
    duplicateEntries: number;
  };
}

export function analyzeIntensityEntries(entries: IntensityEntry[]): IntensityAnalysisResult {
  const byCategoryAndLoc = new Map<string, IntensityEntry[]>();
  const duplicateIds = new Set<string>();
  const exactGroups = new Map<string, IntensityEntry[]>();

  for (const entry of entries) {
    const exactKey = getExactEntryDedupeKey(entry);
    const exactBucket = exactGroups.get(exactKey) ?? [];
    exactBucket.push(entry);
    exactGroups.set(exactKey, exactBucket);

    const cat = normalizeIntensityCategory(entry);
    const conflictKey = `${cat}::${getLocalityConflictKey(entry)}`;
    const bucket = byCategoryAndLoc.get(conflictKey) ?? [];
    bucket.push(entry);
    byCategoryAndLoc.set(conflictKey, bucket);
  }

  const duplicateGroups: DuplicateGroupInfo[] = [];
  for (const exactBucket of exactGroups.values()) {
    if (exactBucket.length > 1) {
      for (let i = 1; i < exactBucket.length; i++) {
        duplicateIds.add(exactBucket[i].id);
      }
      duplicateGroups.push({
        localityDisplay: exactBucket[0].locality,
        peis: exactBucket[0].peis,
        category: normalizeIntensityCategory(exactBucket[0]),
        count: exactBucket.length,
        entryIds: exactBucket.map((e) => e.id),
      });
    }
  }

  const conflictByEntryId = new Map<string, IntensityConflictInfo>();
  const conflictsList: IntensityConflictInfo[] = [];

  for (const group of byCategoryAndLoc.values()) {
    if (group.length < 2) continue;
    const distinctPeis = Array.from(new Set(group.map((e) => e.peis))).sort(comparePeisDesc);
    if (distinctPeis.length > 1) {
      const firstParts = deriveStructuredLocationParts(group[0]);
      const info: IntensityConflictInfo = {
        localityDisplay:
          formatCanonicalLocalityDisplay({
            municipality: firstParts.municipality,
            province: firstParts.province,
            fallbackLocality: group[0].locality,
          }) || group[0].locality,
        peisValues: distinctPeis,
        entryIds: group.map((e) => e.id),
        sources: Array.from(
          new Set(group.map((e) => e.reportSource?.trim() || 'Unspecified source'))
        ),
      };
      conflictsList.push(info);
      for (const item of group) {
        conflictByEntryId.set(item.id, info);
      }
    }
  }

  const eligibleFelt: IntensityEntry[] = [];
  const eligibleInstrumental: IntensityEntry[] = [];
  let feltTotal = 0;
  let instrumentalTotal = 0;
  let verified = 0;
  let draft = 0;
  let conflicting = 0;
  let unresolved = 0;

  for (const entry of entries) {
    const cat = normalizeIntensityCategory(entry);
    if (cat === 'instrumental') {
      instrumentalTotal++;
    } else {
      feltTotal++;
    }

    const baseStatus = normalizeIntensityReviewStatus(entry);
    const hasAutoConflict = conflictByEntryId.has(entry.id);
    const effectiveStatus: IntensityReviewStatus =
      baseStatus === 'unresolved'
        ? 'unresolved'
        : hasAutoConflict || baseStatus === 'conflicting'
          ? 'conflicting'
          : baseStatus;

    if (effectiveStatus === 'verified') {
      verified++;
      if (cat === 'instrumental') {
        eligibleInstrumental.push(entry);
      } else {
        eligibleFelt.push(entry);
      }
    } else if (effectiveStatus === 'draft') {
      draft++;
    } else if (effectiveStatus === 'conflicting') {
      conflicting++;
    } else {
      unresolved++;
    }
  }

  return {
    conflictByEntryId,
    conflictsList,
    duplicateIds,
    duplicateGroups,
    eligibleFelt,
    eligibleInstrumental,
    counts: {
      total: entries.length,
      feltTotal,
      instrumentalTotal,
      verified,
      draft,
      conflicting,
      unresolved,
      conflictGroups: conflictsList.length,
      duplicateEntries: duplicateIds.size,
    },
  };
}

export interface GroupedBulletinPeisLine {
  peis: PeisRoman;
  localities: string[];
  formattedBlock: string;
}

export interface GroupedBulletinResult {
  text: string;
  feltText: string;
  instrumentalText: string;
  feltGroups: GroupedBulletinPeisLine[];
  instrumentalGroups: GroupedBulletinPeisLine[];
  eligibleFeltCount: number;
  excludedFeltCount: number;
  eligibleInstrumentalCount: number;
  excludedInstrumentalCount: number;
}

function buildPeisGroups(entries: IntensityEntry[]): GroupedBulletinPeisLine[] {
  const ordered = [...entries].sort((a, b) => comparePeisDesc(a.peis, b.peis));
  const byPeis = new Map<PeisRoman, { seenKeys: Set<string>; localities: string[] }>();

  for (const lvl of PEIS_LEVELS_DESC) {
    byPeis.set(lvl, { seenKeys: new Set(), localities: [] });
  }

  for (const entry of ordered) {
    const bucket = byPeis.get(entry.peis);
    if (!bucket) continue;
    const display = entry.locality.trim();
    if (!display) continue;
    const dedupeKey = normalizeLocalityMatchKey(display);
    if (bucket.seenKeys.has(dedupeKey)) continue;
    bucket.seenKeys.add(dedupeKey);
    bucket.localities.push(display);
  }

  const groups: GroupedBulletinPeisLine[] = [];
  for (const lvl of PEIS_LEVELS_DESC) {
    const bucket = byPeis.get(lvl);
    if (!bucket || bucket.localities.length === 0) continue;
    const prefix = `Intensity ${lvl} - `;
    const indent = ' '.repeat(prefix.length);
    const formattedBlock = bucket.localities
      .map((loc, idx) => {
        const hasNext = idx < bucket.localities.length - 1;
        const suffix = hasNext ? ';' : '';
        return idx === 0 ? `${prefix}${loc}${suffix}` : `${indent}${loc}${suffix}`;
      })
      .join('\n');

    groups.push({
      peis: lvl,
      localities: bucket.localities,
      formattedBlock,
    });
  }
  return groups;
}

/**
 * Generates PHIVOLCS bulletin intensity text strictly from eligible verified &
 * non-conflicting reports, sorted highest-to-lowest PEIS and grouped cleanly without
 * duplicate localities per PEIS level.
 */
export function formatGroupedBulletinIntensityBlock(
  entries: IntensityEntry[],
  options?: { includeDrafts?: boolean }
): GroupedBulletinResult {
  const analysis = analyzeIntensityEntries(entries);

  const feltEligible = options?.includeDrafts
    ? analysis.eligibleFelt.concat(
        entries.filter(
          (e) =>
            normalizeIntensityCategory(e) === 'felt' &&
            normalizeIntensityReviewStatus(e) === 'draft' &&
            !analysis.conflictByEntryId.has(e.id)
        )
      )
    : analysis.eligibleFelt;

  const instrEligible = options?.includeDrafts
    ? analysis.eligibleInstrumental.concat(
        entries.filter(
          (e) =>
            normalizeIntensityCategory(e) === 'instrumental' &&
            normalizeIntensityReviewStatus(e) === 'draft' &&
            !analysis.conflictByEntryId.has(e.id)
        )
      )
    : analysis.eligibleInstrumental;

  const feltGroups = buildPeisGroups(feltEligible);
  const instrumentalGroups = buildPeisGroups(instrEligible);

  const feltText = feltGroups.map((g) => g.formattedBlock).join('\n');
  const instrumentalText =
    instrumentalGroups.length > 0
      ? `Instrumental Intensity:\n${instrumentalGroups.map((g) => g.formattedBlock).join('\n')}`
      : '';

  const text = [feltText, instrumentalText].filter(Boolean).join('\n\n');

  return {
    text,
    feltText,
    instrumentalText,
    feltGroups,
    instrumentalGroups,
    eligibleFeltCount: feltEligible.length,
    excludedFeltCount: Math.max(0, analysis.counts.feltTotal - feltEligible.length),
    eligibleInstrumentalCount: instrEligible.length,
    excludedInstrumentalCount: Math.max(
      0,
      analysis.counts.instrumentalTotal - instrEligible.length
    ),
  };
}

export interface ParsedIntensityResult {
  entries: IntensityEntry[];
  unrecognizedLines: string[];
}

const ROMAN_PATTERN = 'VIII|VII|VI|IV|IX|III|II|I|V|X';

export function parseManualIntensityBlock(
  rawText: string,
  options?: {
    idPrefix?: string;
    defaultCategory?: IntensityCategory;
  }
): ParsedIntensityResult {
  const idPrefix = options?.idPrefix ?? 'int';
  let currentCategory: IntensityCategory = options?.defaultCategory ?? 'felt';
  const entries: IntensityEntry[] = [];
  const unrecognizedLines: string[] = [];

  const lines = rawText.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;

    // Pure section header switches active category
    if (/^instrumental\s+intensit(?:y|ies)\s*:?\s*$/i.test(trimmed)) {
      currentCategory = 'instrumental';
      return;
    }
    if (/^(?:reported|felt|macroseismic)\s+intensit(?:y|ies)\s*:?\s*$/i.test(trimmed)) {
      currentCategory = 'felt';
      return;
    }

    let lineToParse = trimmed;
    let lineCategory: IntensityCategory = currentCategory;

    // Handle inline section prefix like "Instrumental Intensity: Intensity I - ..."
    const inlineInstrHeader = lineToParse.match(
      /^instrumental\s+intensit(?:y|ies)\s*:\s*(.+)$/i
    );
    if (inlineInstrHeader) {
      currentCategory = 'instrumental';
      lineCategory = 'instrumental';
      lineToParse = inlineInstrHeader[1].trim();
    } else {
      const inlineFeltHeader = lineToParse.match(
        /^(?:reported|felt|macroseismic)\s+intensit(?:y|ies)\s*:\s*(.+)$/i
      );
      if (inlineFeltHeader) {
        currentCategory = 'felt';
        lineCategory = 'felt';
        lineToParse = inlineFeltHeader[1].trim();
      }
    }

    // Strip optional leading bullet markers (- , * , • )
    lineToParse = lineToParse.replace(/^[-*•]\s+/, '').trim();

    const fullRegex = new RegExp(
      `^(?:(Instrumental|Reported|Felt)\\s+)?(?:Intensity|PEIS)\\s+(${ROMAN_PATTERN})\\s*[-–—:]\\s*(.+)$`,
      'i'
    );
    const bareRomanRegex = new RegExp(
      `^(${ROMAN_PATTERN})\\s*[-–—:]\\s*(.+)$`,
      'i'
    );

    let peisRaw: string | null = null;
    let localityRaw: string | null = null;

    const fullMatch = lineToParse.match(fullRegex);
    if (fullMatch) {
      const explicitPrefix = fullMatch[1]?.toLowerCase();
      if (explicitPrefix === 'instrumental') {
        lineCategory = 'instrumental';
      } else if (explicitPrefix === 'reported' || explicitPrefix === 'felt') {
        lineCategory = 'felt';
      }
      peisRaw = fullMatch[2];
      localityRaw = fullMatch[3];
    } else {
      const bareMatch = lineToParse.match(bareRomanRegex);
      if (bareMatch) {
        peisRaw = bareMatch[1];
        localityRaw = bareMatch[2];
      }
    }

    if (peisRaw && localityRaw) {
      let cleanedLocality = localityRaw.trim();
      const trailingInstr = cleanedLocality.match(
        /^(.*?)\s*(?:\(|\[)instrumental(?:\)|\])\s*$/i
      );
      if (trailingInstr) {
        lineCategory = 'instrumental';
        cleanedLocality = trailingInstr[1].trim();
      }
      if (!cleanedLocality) {
        unrecognizedLines.push(trimmed);
        return;
      }
      const derived = deriveStructuredLocationParts({ locality: cleanedLocality });
      entries.push({
        id: `${idPrefix}-${idx}-${entries.length}`,
        peis: peisRaw.toUpperCase() as PeisRoman,
        locality: cleanedLocality,
        category: lineCategory,
        ...(derived.province ? { province: derived.province } : {}),
        ...(derived.municipality ? { municipality: derived.municipality } : {}),
        ...(derived.specificLocation ? { specificLocation: derived.specificLocation } : {}),
      });
    } else {
      unrecognizedLines.push(trimmed);
    }
  });

  return { entries, unrecognizedLines };
}

export type RawParseValidationStatus = 'matched' | 'unresolved' | 'duplicate' | 'conflict';

export interface ParsedRawIntensityRow {
  id: string;
  peis: PeisRoman;
  category: IntensityCategory;
  rawSegment: string;
  locality: string;
  province: string;
  municipality: string;
  specificLocation?: string;
  psgcCode?: string | null;
  validationStatus: RawParseValidationStatus;
  validationNote: string;
  conflictWithPeis?: PeisRoman[];
}

export interface ParsedRawReportAnalysis {
  rows: ParsedRawIntensityRow[];
  unrecognizedLines: string[];
  summary: {
    parsed: number;
    matched: number;
    unresolved: number;
    duplicates: number;
    conflicts: number;
  };
}

function expandMultiLocalityClause(
  clauseText: string,
  index: PhilippineLocalityIndex
): Array<{ localityText: string; provinceHint?: string }> {
  const trimmed = clauseText.trim().replace(/;+\s*$/, '').trim();
  if (!trimmed) return [];

  // Split explicit semicolon clauses if multiple independent localities exist on a line
  const semiParts = trimmed
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  if (semiParts.length > 1) {
    return semiParts.flatMap((part) => expandMultiLocalityClause(part, index));
  }

  // Pattern: "<item1>, <item2> and <item3>, <PROVINCE>" or "<item1> and <item2>, <PROVINCE>"
  const lastCommaIdx = trimmed.lastIndexOf(',');
  if (lastCommaIdx > 0) {
    const beforeProvince = trimmed.slice(0, lastCommaIdx).trim();
    const afterProvince = trimmed.slice(lastCommaIdx + 1).trim();
    const canonicalProv = canonicalizeProvinceName(index, afterProvince);

    if (canonicalProv && (/\band\b|&/i.test(beforeProvince) || beforeProvince.includes(','))) {
      // Split candidate pieces sharing the trailing province
      const pieces = beforeProvince
        .split(/\s*(?:,\s*and\s+|,\s*&\s*|\s+and\s+|\s*&\s*|,)\s*/i)
        .map((p) => p.trim())
        .filter(Boolean);

      if (pieces.length > 1) {
        const hasConjunction = /\band\b|&/i.test(beforeProvince);
        const resolvedCount = pieces.filter(
          (piece) => resolvePhilippineLocality(index, piece, canonicalProv).matched
        ).length;

        // Treat as multi-locality when conjunction ("and"/"&") is used OR at least 2 pieces match catalog LGUs under this province.
        // Otherwise preserve single-clause specificLocation + municipality (e.g. "Brgy. Concepcion, Virac, Catanduanes").
        if (hasConjunction || resolvedCount >= 2) {
          return pieces.map((piece) => ({
            localityText: `${piece}, ${canonicalProv}`,
            provinceHint: canonicalProv,
          }));
        }
      }
    }
  }

  // Pattern without trailing province: "Bato and San Miguel" (kept explicit; resolved only if unambiguous)
  if (/\s+(?:and|&)\s+/i.test(trimmed)) {
    const pieces = trimmed
      .split(/\s+(?:and|&)\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
    if (pieces.length > 1) {
      return pieces.map((p) => ({ localityText: p }));
    }
  }

  return [{ localityText: trimmed }];
}

/**
 * Parses raw pasted PHIVOLCS intensity text blocks, expands multi-municipality clauses
 * cleanly without guessing ambiguous names, resolves localities against the Philippine
 * reference index, and checks conflicts/duplicates against recorded intensities.
 */
export function parseRawIntensityReports(
  rawText: string,
  localityIndex: PhilippineLocalityIndex,
  existingEntries: IntensityEntry[],
  options?: {
    idPrefix?: string;
    defaultCategory?: IntensityCategory;
  }
): ParsedRawReportAnalysis {
  const idPrefix = options?.idPrefix ?? 'imp';
  const lines = rawText.split(/\r?\n/);

  // Recombine wrapped continuation lines like:
  // "Intensity IV - Bato, Catanduanes;\n               San Miguel, Catanduanes"
  const logicalLines: string[] = [];
  const fullLineRegex = new RegExp(
    `^(?:(?:Instrumental|Reported|Felt)\\s+)?(?:Intensity|PEIS)\\s+(?:${ROMAN_PATTERN})\\s*[-–—:]`,
    'i'
  );
  const bareLineRegex = new RegExp(`^(?:${ROMAN_PATTERN})\\s*[-–—:]`, 'i');

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      logicalLines.push('');
      continue;
    }
    const isHeader =
      /^(?:instrumental|reported|felt|macroseismic)\s+intensit(?:y|ies)\s*:?$/i.test(trimmed);
    const isNewEntry = fullLineRegex.test(trimmed) || bareLineRegex.test(trimmed);

    if (
      !isHeader &&
      !isNewEntry &&
      logicalLines.length > 0 &&
      /;\s*$/.test(logicalLines[logicalLines.length - 1])
    ) {
      logicalLines[logicalLines.length - 1] = `${logicalLines[logicalLines.length - 1]} ${trimmed}`;
    } else {
      logicalLines.push(trimmed);
    }
  }

  const baseParsed = parseManualIntensityBlock(logicalLines.join('\n'), {
    idPrefix,
    defaultCategory: options?.defaultCategory ?? 'felt',
  });

  const existingByLocKey = new Map<string, IntensityEntry[]>();
  const existingExactKeys = new Set<string>();
  for (const entry of existingEntries) {
    const cat = normalizeIntensityCategory(entry);
    const locKey = `${cat}::${getLocalityConflictKey(entry)}`;
    const bucket = existingByLocKey.get(locKey) ?? [];
    bucket.push(entry);
    existingByLocKey.set(locKey, bucket);
    existingExactKeys.add(getExactEntryDedupeKey(entry));
  }

  const batchSeenExact = new Set<string>();
  const batchSeenByLocKey = new Map<string, PeisRoman[]>();

  const rows: ParsedRawIntensityRow[] = [];

  for (const parsedEntry of baseParsed.entries) {
    const cat = normalizeIntensityCategory(parsedEntry);
    const expandedClauses = expandMultiLocalityClause(parsedEntry.locality, localityIndex);

    for (const clause of expandedClauses) {
      const resolved = resolvePhilippineLocality(
        localityIndex,
        clause.localityText,
        clause.provinceHint
      );

      const displayLocality = resolved.matched
        ? formatCanonicalLocalityDisplay({
            specificLocation: resolved.specificLocation,
            municipality: resolved.municipality,
            province: resolved.province,
          })
        : clause.localityText;

      const candidateEntry: IntensityEntry = {
        id: `${idPrefix}-${rows.length}`,
        peis: parsedEntry.peis,
        locality: displayLocality,
        category: cat,
        province: resolved.province || undefined,
        municipality: resolved.municipality || undefined,
        specificLocation: resolved.specificLocation,
      };

      const locKey = `${cat}::${getLocalityConflictKey(candidateEntry)}`;
      const exactKey = getExactEntryDedupeKey(candidateEntry);

      const existingSameLoc = existingByLocKey.get(locKey) ?? [];
      const existingConflictPeis = existingSameLoc
        .filter((e) => e.peis !== parsedEntry.peis)
        .map((e) => e.peis);
      const batchPeisList = batchSeenByLocKey.get(locKey) ?? [];
      const batchConflictPeis = batchPeisList.filter((p) => p !== parsedEntry.peis);
      const allConflictPeis = Array.from(
        new Set([...existingConflictPeis, ...batchConflictPeis])
      ).sort(comparePeisDesc);

      let validationStatus: RawParseValidationStatus;
      let validationNote: string;

      if (!resolved.matched) {
        validationStatus = 'unresolved';
        validationNote = resolved.reason || 'Unresolved locality — verify before adding';
      } else if (existingExactKeys.has(exactKey) || batchSeenExact.has(exactKey)) {
        validationStatus = 'duplicate';
        validationNote = `Duplicate of existing Intensity ${parsedEntry.peis} report (will be skipped)`;
      } else if (allConflictPeis.length > 0) {
        validationStatus = 'conflict';
        validationNote = `Conflicts with existing Intensity ${allConflictPeis.join(', ')} at ${displayLocality}`;
      } else {
        validationStatus = 'matched';
        validationNote = `Matched ${resolved.municipality}, ${resolved.province}`;
      }

      batchSeenExact.add(exactKey);
      batchSeenByLocKey.set(locKey, [...batchPeisList, parsedEntry.peis]);

      rows.push({
        id: candidateEntry.id,
        peis: parsedEntry.peis,
        category: cat,
        rawSegment: clause.localityText,
        locality: displayLocality,
        province: resolved.province,
        municipality: resolved.municipality,
        specificLocation: resolved.specificLocation,
        psgcCode: resolved.psgcCode ?? null,
        validationStatus,
        validationNote,
        ...(allConflictPeis.length > 0 ? { conflictWithPeis: allConflictPeis } : {}),
      });
    }
  }

  let matched = 0;
  let unresolved = 0;
  let duplicates = 0;
  let conflicts = 0;
  for (const r of rows) {
    if (r.validationStatus === 'matched') matched++;
    else if (r.validationStatus === 'unresolved') unresolved++;
    else if (r.validationStatus === 'duplicate') duplicates++;
    else if (r.validationStatus === 'conflict') conflicts++;
  }

  return {
    rows,
    unrecognizedLines: baseParsed.unrecognizedLines,
    summary: {
      parsed: rows.length,
      matched,
      unresolved,
      duplicates,
      conflicts,
    },
  };
}

export function formatIntensityBlockText(entries: IntensityEntry[]): string {
  const { felt, instrumental } = splitIntensitiesByCategory(entries);
  const blocks: string[] = [];

  if (felt.length > 0) {
    blocks.push(
      felt.map((e) => `Intensity ${e.peis} - ${e.locality}`).join('\n')
    );
  }

  if (instrumental.length > 0) {
    const instrLines = [
      'Instrumental Intensity:',
      ...instrumental.map((e) => `Intensity ${e.peis} - ${e.locality}`),
    ].join('\n');
    blocks.push(instrLines);
  }

  return blocks.join('\n\n');
}

export type EventFeltDisplayCode = 'felt' | 'pending' | 'instrumental-only' | 'unfelt';

export function hasEventFeltDesignation(
  event: Pick<EQPEvent, 'intensities' | 'feltStatusOverride'>
): boolean {
  if (event.feltStatusOverride === true) return true;
  if (event.feltStatusOverride === false) return false;
  return event.intensities.some(
    (entry) => normalizeIntensityReviewStatus(entry) === 'verified'
  );
}

export function getEventFeltStatusSummary(
  event: Pick<EQPEvent, 'intensities' | 'feltStatusOverride'>
): {
  code: EventFeltDisplayCode;
  label: string;
  isFeltFlag: boolean;
} {
  if (event.feltStatusOverride === true) {
    return {
      code: 'felt',
      label: 'Felt (F)',
      isFeltFlag: true,
    };
  }
  const analysis = analyzeIntensityEntries(event.intensities);
  if (analysis.eligibleFelt.length > 0) {
    return {
      code: 'felt',
      label: 'Felt (F)',
      isFeltFlag: true,
    };
  }
  if (analysis.counts.feltTotal > 0) {
    return {
      code: 'pending',
      label: 'Pending Review',
      isFeltFlag: false,
    };
  }
  if (analysis.eligibleInstrumental.length > 0) {
    return {
      code: 'instrumental-only',
      label: 'Instrumental Only',
      isFeltFlag: false,
    };
  }
  return {
    code: 'unfelt',
    label: 'Unfelt',
    isFeltFlag: false,
  };
}

export type GeographicReferenceStatus = 'empty' | 'matched' | 'ambiguous' | 'not-found';

export interface GeographicCandidateOption {
  municipality: string;
  province: string;
  psgcCode?: string | null;
}

export type DuplicateReportKind =
  | 'none'
  | 'exact-duplicate'
  | 'same-locality-conflict'
  | 'same-locality-same-peis';

export interface ValidateCandidateIntensityParams {
  peis: PeisRoman;
  category: IntensityCategory;
  province: string;
  localityText: string;
  specificLocation?: string;
  catalogLoaded: boolean;
  localityIndex: PhilippineLocalityIndex;
  existingEntries: IntensityEntry[];
  excludeEntryId?: string;
}

export interface CandidateIntensityValidation {
  geographicStatus: GeographicReferenceStatus;
  geographicMessage: string;
  catalogLoaded: boolean;
  catalogRecordCount: number;
  canonicalProvince: string;
  canonicalMunicipality: string;
  specificLocation: string;
  displayLocality: string;
  psgcCode?: string | null;
  candidates: GeographicCandidateOption[];

  duplicateKind: DuplicateReportKind;
  duplicateMessage: string;
  matchingLocalityEntries: IntensityEntry[];
  exactDuplicateEntries: IntensityEntry[];
  conflictingEntries: IntensityEntry[];
  sameLocalitySamePeisEntries: IntensityEntry[];

  hasExactDuplicate: boolean;
  hasConflictingPeis: boolean;
  hasSameLocalityDuplicate: boolean;
  canSubmit: boolean;
}

export function validateCandidateIntensityInput(
  params: ValidateCandidateIntensityParams
): CandidateIntensityValidation {
  const rawLoc = params.localityText.trim();
  const rawProv = params.province.trim();
  const rawSpec = (params.specificLocation ?? '').trim();
  const catalogRecordCount = params.localityIndex.allRecords.length;

  if (!rawLoc) {
    return {
      geographicStatus: 'empty',
      geographicMessage: '',
      catalogLoaded: params.catalogLoaded,
      catalogRecordCount,
      canonicalProvince: rawProv
        ? canonicalizeProvinceName(params.localityIndex, rawProv) ?? rawProv
        : '',
      canonicalMunicipality: '',
      specificLocation: rawSpec,
      displayLocality: '',
      psgcCode: null,
      candidates: [],
      duplicateKind: 'none',
      duplicateMessage: '',
      matchingLocalityEntries: [],
      exactDuplicateEntries: [],
      conflictingEntries: [],
      sameLocalitySamePeisEntries: [],
      hasExactDuplicate: false,
      hasConflictingPeis: false,
      hasSameLocalityDuplicate: false,
      canSubmit: false,
    };
  }

  const resolution = resolvePhilippineLocality(
    params.localityIndex,
    rawLoc,
    rawProv || undefined
  );

  const canonicalProvince = resolution.matched
    ? resolution.province
    : rawProv
      ? canonicalizeProvinceName(params.localityIndex, rawProv) ?? rawProv
      : resolution.province;
  const canonicalMunicipality = resolution.matched
    ? resolution.municipality
    : resolution.municipality || rawLoc;
  const finalSpec = rawSpec || resolution.specificLocation || '';

  const displayLocality = formatCanonicalLocalityDisplay({
    specificLocation: finalSpec,
    municipality: canonicalMunicipality,
    province: canonicalProvince,
    fallbackLocality: rawLoc,
  });

  const candidates: GeographicCandidateOption[] = (resolution.candidates ?? []).map((c) => ({
    municipality: c.municipality,
    province: c.province,
    psgcCode: c.psgcCode ?? null,
  }));

  let geographicStatus: GeographicReferenceStatus;
  let geographicMessage: string;

  if (resolution.matched) {
    geographicStatus = 'matched';
    geographicMessage = params.catalogLoaded
      ? `Verified in geographic reference dataset (${resolution.municipality}, ${resolution.province})`
      : `Matched built-in reference (${resolution.municipality}, ${resolution.province}) — full catalog loading`;
  } else if (candidates.length > 0) {
    geographicStatus = 'ambiguous';
    geographicMessage =
      resolution.reason ||
      `"${canonicalMunicipality}" matches ${candidates.length} provinces in the reference dataset — select a province.`;
  } else {
    geographicStatus = 'not-found';
    geographicMessage = params.catalogLoaded
      ? `"${rawLoc}"${canonicalProvince ? ` (${canonicalProvince})` : ''} was not found in the current geographic reference dataset (${catalogRecordCount.toLocaleString()} LGUs).`
      : `Full geographic reference catalog is still loading; "${rawLoc}" not found in initial dataset.`;
  }

  // Duplicate & same-locality check against active event entries
  const candidateForKeys: IntensityEntry = {
    id: '__candidate__',
    peis: params.peis,
    locality: displayLocality,
    category: params.category,
    province: canonicalProvince || undefined,
    municipality: canonicalMunicipality || undefined,
    specificLocation: finalSpec || undefined,
  };

  const exactKey = getExactEntryDedupeKey(candidateForKeys);
  const locKey = getLocalityConflictKey(candidateForKeys);

  const comparableEntries = params.existingEntries.filter(
    (item) =>
      item.id !== params.excludeEntryId &&
      normalizeIntensityCategory(item) === params.category
  );

  const matchingLocalityEntries = comparableEntries.filter(
    (item) => getLocalityConflictKey(item) === locKey
  );
  const exactDuplicateEntries = comparableEntries.filter(
    (item) => getExactEntryDedupeKey(item) === exactKey
  );
  const exactDuplicateIds = new Set(exactDuplicateEntries.map((item) => item.id));
  const conflictingEntries = matchingLocalityEntries.filter(
    (item) => item.peis !== params.peis
  );
  const sameLocalitySamePeisEntries = matchingLocalityEntries.filter(
    (item) => item.peis === params.peis && !exactDuplicateIds.has(item.id)
  );

  const hasExactDuplicate = exactDuplicateEntries.length > 0;
  const hasConflictingPeis = conflictingEntries.length > 0;
  const hasSameLocalityDuplicate = matchingLocalityEntries.length > 0;

  const formatEntryMeta = (item: IntensityEntry) => {
    const status = normalizeIntensityReviewStatus(item);
    return `${status}${item.reportSource ? ` · ${item.reportSource}` : ''}`;
  };

  let duplicateKind: DuplicateReportKind = 'none';
  let duplicateMessage = '';

  if (hasExactDuplicate) {
    duplicateKind = 'exact-duplicate';
    duplicateMessage = `Duplicate intensity report detected: Intensity ${params.peis} for ${displayLocality} already exists (${exactDuplicateEntries
      .map(formatEntryMeta)
      .join('; ')}).`;
  } else if (hasConflictingPeis) {
    duplicateKind = 'same-locality-conflict';
    const existingList = conflictingEntries
      .map((item) => `Intensity ${item.peis} (${formatEntryMeta(item)})`)
      .join(', ');
    duplicateMessage = `Duplicate locality with different intensity: ${canonicalMunicipality || rawLoc}${canonicalProvince ? `, ${canonicalProvince}` : ''} already has ${existingList}.`;
  } else if (sameLocalitySamePeisEntries.length > 0) {
    duplicateKind = 'same-locality-same-peis';
    const existingList = sameLocalitySamePeisEntries
      .map((item) =>
        item.specificLocation
          ? `${item.specificLocation} (${formatEntryMeta(item)})`
          : `${item.locality} (${formatEntryMeta(item)})`
      )
      .join('; ');
    duplicateMessage = `Existing report at this locality: ${canonicalMunicipality || rawLoc}${canonicalProvince ? `, ${canonicalProvince}` : ''} already has Intensity ${params.peis} (${existingList}).`;
  }

  return {
    geographicStatus,
    geographicMessage,
    catalogLoaded: params.catalogLoaded,
    catalogRecordCount,
    canonicalProvince,
    canonicalMunicipality,
    specificLocation: finalSpec,
    displayLocality,
    psgcCode: resolution.psgcCode ?? null,
    candidates,
    duplicateKind,
    duplicateMessage,
    matchingLocalityEntries,
    exactDuplicateEntries,
    conflictingEntries,
    sameLocalitySamePeisEntries,
    hasExactDuplicate,
    hasConflictingPeis,
    hasSameLocalityDuplicate,
    canSubmit: !hasExactDuplicate,
  };
}

export interface MergeConflictObservationConfig {
  baseEntryId: string;
  peis: PeisRoman;
  specificLocation?: string;
  reportSource?: string;
  remarks?: string;
  reviewStatus?: 'verified' | 'draft';
}

function isAutoGeneratedConflictRemark(remark?: string): boolean {
  if (!remark) return false;
  const trimmed = remark.trim();
  return (
    trimmed.startsWith('Conflicting intensity recorded') ||
    trimmed.startsWith('Conflicts with existing Intensity')
  );
}

/**
 * Resolves a conflict group by keeping a single winning observation and removing its
 * conflicting siblings from the event intensity list.
 */
export function selectWinningConflictObservation(
  entries: IntensityEntry[],
  conflictEntryIds: string[],
  winningEntryId: string,
  options?: {
    reviewStatus?: 'verified' | 'draft';
    remarks?: string;
  }
): IntensityEntry[] {
  const conflictIdSet = new Set(conflictEntryIds);
  if (!conflictIdSet.has(winningEntryId)) {
    return entries;
  }

  const nowIso = new Date().toISOString();
  const nextStatus: IntensityReviewStatus = options?.reviewStatus ?? 'verified';

  const result: IntensityEntry[] = [];
  for (const item of entries) {
    if (!conflictIdSet.has(item.id)) {
      result.push(item);
      continue;
    }
    if (item.id !== winningEntryId) {
      continue;
    }

    const cleanedRemarks =
      options?.remarks !== undefined
        ? options.remarks.trim() || undefined
        : isAutoGeneratedConflictRemark(item.remarks)
          ? undefined
          : item.remarks;

    result.push({
      ...item,
      reviewStatus: nextStatus,
      remarks: cleanedRemarks,
      updatedAt: nowIso,
    });
  }
  return result;
}

/**
 * Resolves a conflict group by merging chosen fields (PEIS, specific location, source,
 * remarks, reviewStatus) into the anchor observation and removing conflicting siblings.
 */
export function mergeConflictingObservations(
  entries: IntensityEntry[],
  conflictEntryIds: string[],
  config: MergeConflictObservationConfig
): IntensityEntry[] {
  const conflictIdSet = new Set(conflictEntryIds);
  const groupEntries = entries.filter((e) => conflictIdSet.has(e.id));
  if (groupEntries.length === 0) return entries;

  const anchor =
    groupEntries.find((e) => e.id === config.baseEntryId) ?? groupEntries[0];
  const parts = deriveStructuredLocationParts(anchor);
  const nextSpec = (config.specificLocation ?? '').trim();
  const nextLocality =
    formatCanonicalLocalityDisplay({
      specificLocation: nextSpec,
      municipality: parts.municipality,
      province: parts.province,
      fallbackLocality: anchor.locality,
    }) || anchor.locality;

  const nowIso = new Date().toISOString();
  const nextStatus: IntensityReviewStatus = config.reviewStatus ?? 'verified';
  const nextSource =
    config.reportSource !== undefined
      ? config.reportSource.trim() || undefined
      : anchor.reportSource;
  const nextRemarks =
    config.remarks !== undefined
      ? config.remarks.trim() || undefined
      : isAutoGeneratedConflictRemark(anchor.remarks)
        ? undefined
        : anchor.remarks;

  const result: IntensityEntry[] = [];
  for (const item of entries) {
    if (!conflictIdSet.has(item.id)) {
      result.push(item);
      continue;
    }
    if (item.id !== anchor.id) {
      continue;
    }
    result.push({
      ...item,
      peis: config.peis,
      locality: nextLocality,
      province: parts.province || item.province,
      municipality: parts.municipality || item.municipality,
      specificLocation: nextSpec || undefined,
      reportSource: nextSource,
      remarks: nextRemarks,
      reviewStatus: nextStatus,
      previousPeis: config.peis !== item.peis ? item.peis : item.previousPeis,
      updatedAt: nowIso,
    });
  }
  return result;
}


