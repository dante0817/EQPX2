import {
  buildPrimerHtmlDocument,
  buildPrimerPdfDocument,
} from './earthquakePrimer.ts';
import {
  buildPrimerReferenceList,
  type PrimerPresentationMode,
} from './primerPresentation.ts';
import {
  validateAndParsePrimerRevisionArchive,
} from './primerRevisionArchive.ts';
import {
  computeCanonicalChecksum,
  deepFreezeRevision,
  type PrimerRevisionRecord,
  toPrimerExportRevisionInfo,
  verifyPrimerRevisionChecksum,
} from './primerRevisions.ts';
import {
  assertNoReviewStatusViolation,
  isAllowedLocalReviewStatus,
  isForbiddenReleaseStatus,
  LOCAL_REVIEW_AUTHORITY_DISCLAIMER,
  LOCAL_REVIEW_INTEGRITY_DISCLAIMER,
  PRIMER_CHECKLIST_STATE_LABELS,
  PRIMER_LOCAL_REVIEW_STATUS_META,
  PRIMER_REVIEW_SCHEMA_VERSION,
  type PrimerChecklistItemState,
  type PrimerLocalReviewStatus,
  type PrimerReviewRecord,
  verifyPrimerReviewChecksum,
} from './primerReviews.ts';
import { formatUtcAsPst } from './primerSequenceIntegration.ts';

export const PRIMER_REVIEW_DB_NAME = 'eqp_primer_reviews_v1';
export const PRIMER_REVIEW_DB_VERSION = 1;
export const PRIMER_REVIEW_STORE_NAME = 'reviews';

export const PRIMER_REVIEW_ARCHIVE_BUNDLE_TYPE = 'eqp-primer-review-archive' as const;
export const PRIMER_REVIEW_PACKAGE_TYPE = 'eqp-primer-scientific-review-package' as const;
export const PRIMER_REVIEW_PACKAGE_RELEASE_BANNER =
  'FOR SCIENTIFIC REVIEW — NOT AN APPROVED PUBLICATION' as const;

export const MAX_ZIP_ARCHIVE_BYTES = 32 * 1024 * 1024; // 32 MiB
export const MAX_ZIP_ENTRY_BYTES = 12 * 1024 * 1024; // 12 MiB per entry
export const MAX_ZIP_ENTRY_COUNT = 64;
export const MAX_JSON_IMPORT_BYTES = 16 * 1024 * 1024;
export const MAX_SVG_BYTES = 4 * 1024 * 1024;
export const MAX_EXPORT_TABLE_ROWS = 500;

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// =============================================================================
// J. PROTOTYPE POLLUTION, JSON & SVG SECURITY VALIDATORS
// =============================================================================

export function findForbiddenKeys(
  value: unknown,
  path = '$',
  visited = new Set<unknown>()
): string[] {
  if (value === null || typeof value !== 'object') return [];
  if (visited.has(value)) return [];
  visited.add(value);

  const hits: string[] = [];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      hits.push(...findForbiddenKeys(value[i], `${path}[${i}]`, visited));
    }
    return hits;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) {
      hits.push(`${path}.${key}`);
    } else {
      const val = (value as Record<string, unknown>)[key];
      hits.push(...findForbiddenKeys(val, `${path}.${key}`, visited));
    }
  }
  return hits;
}

export function safeJsonParseChecked(
  rawJson: string,
  maxBytes = MAX_JSON_IMPORT_BYTES
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof rawJson !== 'string' || !rawJson.trim()) {
    return { ok: false, error: 'JSON input is empty.' };
  }
  const byteLen = new TextEncoder().encode(rawJson).byteLength;
  if (byteLen > maxBytes) {
    return {
      ok: false,
      error: `JSON payload exceeds maximum allowed size (${byteLen} > ${maxBytes} bytes).`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      ok: false,
      error: `Malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const forbidden = findForbiddenKeys(parsed);
  if (forbidden.length > 0) {
    return {
      ok: false,
      error: `Rejected unsafe JSON containing forbidden key(s): ${forbidden.slice(0, 3).join(', ')}`,
    };
  }
  return { ok: true, value: parsed };
}

export function sanitizeAndValidateSvgMarkup(svgMarkup: string): {
  ok: boolean;
  sanitizedSvg: string;
  errors: string[];
} {
  if (typeof svgMarkup !== 'string' || !svgMarkup.trim()) {
    return { ok: false, sanitizedSvg: '', errors: ['SVG markup is empty.'] };
  }
  const bytes = new TextEncoder().encode(svgMarkup).byteLength;
  if (bytes > MAX_SVG_BYTES) {
    return {
      ok: false,
      sanitizedSvg: '',
      errors: [`SVG exceeds maximum safe size (${bytes} > ${MAX_SVG_BYTES} bytes).`],
    };
  }
  const trimmed = svgMarkup.trim();
  if (!/^<(?:<\?xml[\s\S]*?\?>\s*)?svg[\s>]/i.test(trimmed) && !/<svg[\s>]/i.test(trimmed)) {
    return {
      ok: false,
      sanitizedSvg: '',
      errors: ['SVG payload does not contain a root <svg> element.'],
    };
  }

  const errors: string[] = [];
  if (/<\s*script\b/i.test(trimmed)) {
    errors.push('Rejected unsafe SVG containing <script> tag.');
  }
  if (/<\s*foreignObject\b/i.test(trimmed)) {
    errors.push('Rejected unsafe SVG containing <foreignObject> tag.');
  }
  if (/<\s*(iframe|object|embed|applet|meta)\b/i.test(trimmed)) {
    errors.push('Rejected unsafe SVG containing embedded active element.');
  }
  if (/\son[a-z]+\s*=/i.test(trimmed)) {
    errors.push('Rejected unsafe SVG containing inline event handler attribute (on*=).');
  }
  if (/(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(trimmed)) {
    errors.push('Rejected unsafe SVG containing executable URI scheme.');
  }
  if (/expression\s*\(|@import\b/i.test(trimmed)) {
    errors.push('Rejected unsafe SVG containing dynamic CSS expression/@import.');
  }

  if (errors.length > 0) {
    return { ok: false, sanitizedSvg: '', errors };
  }

  return { ok: true, sanitizedSvg: trimmed, errors: [] };
}

// =============================================================================
// PURE TYPESCRIPT STORED PKZIP ENCODER & VALIDATED DECODER (CRC32 + PATH GUARD)
// =============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function isSafeZipEntryPath(entryPath: string): boolean {
  if (typeof entryPath !== 'string' || !entryPath) return false;
  if (entryPath.includes('\0')) return false;
  if (entryPath.includes('\\')) return false;
  if (entryPath.startsWith('/')) return false;
  if (/^[a-zA-Z]:/.test(entryPath)) return false;
  const segments = entryPath.split('/');
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return false;
  }
  return true;
}

export interface ZipInputEntry {
  path: string;
  data: Uint8Array | string;
}

function toDosTimeDate(isoUtc?: string): { dosTime: number; dosDate: number } {
  const d = isoUtc ? new Date(isoUtc) : new Date();
  const valid = Number.isNaN(d.getTime()) ? new Date() : d;
  const year = Math.max(1980, Math.min(2107, valid.getUTCFullYear()));
  const month = valid.getUTCMonth() + 1;
  const day = valid.getUTCDate();
  const hours = valid.getUTCHours();
  const mins = valid.getUTCMinutes();
  const secs = Math.floor(valid.getUTCSeconds() / 2);
  const dosTime = ((hours & 0x1f) << 11) | ((mins & 0x3f) << 5) | (secs & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

export function encodeStoredZip(
  entries: ZipInputEntry[],
  options: { createdAtUtc?: string } = {}
): Uint8Array {
  if (entries.length === 0) {
    throw new Error('Cannot create an empty ZIP archive.');
  }
  if (entries.length > MAX_ZIP_ENTRY_COUNT) {
    throw new Error(`ZIP entry count exceeds maximum allowed (${MAX_ZIP_ENTRY_COUNT}).`);
  }

  const encoder = new TextEncoder();
  const { dosTime, dosDate } = toDosTimeDate(options.createdAtUtc);
  const seenPaths = new Set<string>();

  interface PreparedEntry {
    nameBytes: Uint8Array;
    dataBytes: Uint8Array;
    crc: number;
    offset: number;
  }
  const prepared: PreparedEntry[] = [];
  let runningOffset = 0;

  for (const entry of entries) {
    if (!isSafeZipEntryPath(entry.path)) {
      throw new Error(`Unsafe ZIP entry path rejected: ${entry.path}`);
    }
    if (seenPaths.has(entry.path)) {
      throw new Error(`Duplicate ZIP entry path rejected: ${entry.path}`);
    }
    seenPaths.add(entry.path);

    const nameBytes = encoder.encode(entry.path);
    const dataBytes =
      typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    if (dataBytes.byteLength > MAX_ZIP_ENTRY_BYTES) {
      throw new Error(
        `ZIP entry "${entry.path}" exceeds maximum file size (${MAX_ZIP_ENTRY_BYTES} bytes).`
      );
    }

    const crc = computeCrc32(dataBytes);
    prepared.push({
      nameBytes,
      dataBytes,
      crc,
      offset: runningOffset,
    });
    runningOffset += 30 + nameBytes.length + dataBytes.length;
  }

  const centralDirStart = runningOffset;
  let centralDirSize = 0;
  for (const item of prepared) {
    centralDirSize += 46 + item.nameBytes.length;
  }
  const totalBytes = centralDirStart + centralDirSize + 22;
  if (totalBytes > MAX_ZIP_ARCHIVE_BYTES) {
    throw new Error(
      `ZIP archive exceeds maximum total size (${totalBytes} > ${MAX_ZIP_ARCHIVE_BYTES} bytes).`
    );
  }

  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  let pos = 0;

  // Local file headers + file payloads
  for (const item of prepared) {
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true); // version needed: 2.0
    view.setUint16(pos + 6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(pos + 8, 0, true); // STORE = 0
    view.setUint16(pos + 10, dosTime, true);
    view.setUint16(pos + 12, dosDate, true);
    view.setUint32(pos + 14, item.crc, true);
    view.setUint32(pos + 18, item.dataBytes.length, true);
    view.setUint32(pos + 22, item.dataBytes.length, true);
    view.setUint16(pos + 26, item.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true); // extra field len
    pos += 30;

    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;
    out.set(item.dataBytes, pos);
    pos += item.dataBytes.length;
  }

  // Central directory headers
  for (const item of prepared) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(pos + 10, 0, true); // STORE = 0
    view.setUint16(pos + 12, dosTime, true);
    view.setUint16(pos + 14, dosDate, true);
    view.setUint32(pos + 16, item.crc, true);
    view.setUint32(pos + 20, item.dataBytes.length, true);
    view.setUint32(pos + 24, item.dataBytes.length, true);
    view.setUint16(pos + 28, item.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true); // extra len
    view.setUint16(pos + 32, 0, true); // comment len
    view.setUint16(pos + 34, 0, true); // disk start
    view.setUint16(pos + 36, 0, true); // internal attrs
    view.setUint32(pos + 38, 0, true); // external attrs
    view.setUint32(pos + 42, item.offset, true);
    pos += 46;
    out.set(item.nameBytes, pos);
    pos += item.nameBytes.length;
  }

  // End of Central Directory (EOCD)
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, prepared.length, true);
  view.setUint16(pos + 10, prepared.length, true);
  view.setUint32(pos + 12, centralDirSize, true);
  view.setUint32(pos + 16, centralDirStart, true);
  view.setUint16(pos + 20, 0, true);

  return out;
}

export interface DecodedZipEntry {
  path: string;
  bytes: Uint8Array;
  crc32: number;
}

export function decodeAndValidateStoredZip(
  zipBytes: Uint8Array
): { ok: true; entries: Map<string, DecodedZipEntry> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!(zipBytes instanceof Uint8Array)) {
    return { ok: false, errors: ['ZIP payload must be a Uint8Array.'] };
  }
  if (zipBytes.byteLength < 22) {
    return { ok: false, errors: ['ZIP archive is too small or truncated.'] };
  }
  if (zipBytes.byteLength > MAX_ZIP_ARCHIVE_BYTES) {
    return {
      ok: false,
      errors: [
        `ZIP archive exceeds maximum allowed size (${zipBytes.byteLength} > ${MAX_ZIP_ARCHIVE_BYTES} bytes).`,
      ],
    };
  }

  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  // Locate EOCD signature 0x06054b50 scanning backward up to 65 KiB
  let eocdOffset = -1;
  const minScan = Math.max(0, zipBytes.byteLength - 65557);
  for (let p = zipBytes.byteLength - 22; p >= minScan; p--) {
    if (view.getUint32(p, true) === 0x06054b50) {
      eocdOffset = p;
      break;
    }
  }
  if (eocdOffset < 0) {
    return { ok: false, errors: ['Invalid ZIP: End-of-Central-Directory record not found.'] };
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (totalEntries === 0 || totalEntries > MAX_ZIP_ENTRY_COUNT) {
    return {
      ok: false,
      errors: [
        `ZIP entry count (${totalEntries}) outside safe bounds (1–${MAX_ZIP_ENTRY_COUNT}).`,
      ],
    };
  }
  if (
    centralDirOffset + centralDirSize > eocdOffset ||
    centralDirOffset >= zipBytes.byteLength
  ) {
    return { ok: false, errors: ['Invalid ZIP: Central directory bounds exceed archive size.'] };
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries = new Map<string, DecodedZipEntry>();
  let totalDecodedBytes = 0;
  let cdPos = centralDirOffset;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (cdPos + 46 > eocdOffset) {
      errors.push('Truncated ZIP central directory header.');
      break;
    }
    if (view.getUint32(cdPos, true) !== 0x02014b50) {
      errors.push(`Corrupt central directory signature at entry index ${idx}.`);
      break;
    }

    const method = view.getUint16(cdPos + 10, true);
    const crcExpected = view.getUint32(cdPos + 16, true);
    const compSize = view.getUint32(cdPos + 20, true);
    const uncompSize = view.getUint32(cdPos + 24, true);
    const nameLen = view.getUint16(cdPos + 28, true);
    const extraLen = view.getUint16(cdPos + 30, true);
    const commentLen = view.getUint16(cdPos + 32, true);
    const localHeaderOffset = view.getUint32(cdPos + 42, true);

    if (cdPos + 46 + nameLen + extraLen + commentLen > eocdOffset) {
      errors.push(`ZIP central directory entry #${idx} exceeds bounds.`);
      break;
    }

    let entryPath = '';
    try {
      entryPath = decoder.decode(zipBytes.subarray(cdPos + 46, cdPos + 46 + nameLen));
    } catch {
      errors.push(`Invalid UTF-8 path in ZIP entry #${idx}.`);
      break;
    }
    cdPos += 46 + nameLen + extraLen + commentLen;

    if (!isSafeZipEntryPath(entryPath)) {
      errors.push(`Rejected unsafe ZIP entry path (possible path traversal): "${entryPath}".`);
      continue;
    }
    if (entries.has(entryPath)) {
      errors.push(`Duplicate ZIP entry path rejected: "${entryPath}".`);
      continue;
    }
    if (method !== 0) {
      errors.push(
        `Unsupported ZIP compression method (${method}) for "${entryPath}". Only uncompressed STORE (0) packages are accepted.`
      );
      continue;
    }
    if (compSize !== uncompSize) {
      errors.push(`Size mismatch for stored entry "${entryPath}" (${compSize} ≠ ${uncompSize}).`);
      continue;
    }
    if (uncompSize > MAX_ZIP_ENTRY_BYTES) {
      errors.push(
        `ZIP entry "${entryPath}" exceeds maximum allowed file size (${MAX_ZIP_ENTRY_BYTES} bytes).`
      );
      continue;
    }
    totalDecodedBytes += uncompSize;
    if (totalDecodedBytes > MAX_ZIP_ARCHIVE_BYTES) {
      errors.push('Decoded ZIP payload exceeds maximum total package size.');
      break;
    }

    if (localHeaderOffset + 30 > centralDirOffset) {
      errors.push(`Local header offset out of bounds for "${entryPath}".`);
      continue;
    }
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      errors.push(`Invalid local file header signature for "${entryPath}".`);
      continue;
    }
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + uncompSize;
    if (dataEnd > centralDirOffset) {
      errors.push(`File payload out of bounds for "${entryPath}".`);
      continue;
    }

    const fileBytes = zipBytes.slice(dataStart, dataEnd);
    const actualCrc = computeCrc32(fileBytes);
    if (actualCrc !== crcExpected) {
      errors.push(
        `CRC32 integrity mismatch for "${entryPath}" (expected 0x${crcExpected.toString(16)}, got 0x${actualCrc.toString(16)}).`
      );
      continue;
    }

    entries.set(entryPath, {
      path: entryPath,
      bytes: fileBytes,
      crc32: actualCrc,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, entries };
}

// =============================================================================
// I. PORTABLE REVIEW PACKAGE (.ZIP) BUILDER & IMPORT VALIDATOR
// =============================================================================

export interface PrimerReviewPackageManifestFile {
  path: string;
  role:
    | 'notice'
    | 'revision-snapshot'
    | 'revision-lineage'
    | 'review-record'
    | 'provenance-ledger'
    | 'figure-svg'
    | 'table-json'
    | 'export-html'
    | 'export-pdf';
  byteSize: number;
  crc32Hex: string;
  canonicalContentChecksum: string;
  rowCount?: number;
  truncatedFromCount?: number;
}

export interface PrimerReviewPackageManifest {
  schemaVersion: '1.0';
  packageType: 'eqp-primer-scientific-review-package';
  releaseStatusBanner: 'FOR SCIENTIFIC REVIEW — NOT AN APPROVED PUBLICATION';
  externalInstitutionalAuthorization: 'UNAVAILABLE / NOT CONFIGURED';
  publicPublicationStatus: 'UNAVAILABLE / NOT CONFIGURED';
  exportedAtUtc: string;
  exportedAtPst: string;
  primerDocumentId: string;
  eventId: string;
  revisionId: string;
  revisionNumber: number;
  revisionContentChecksum: string;
  reviewRecordId: string;
  localReviewStatus: PrimerLocalReviewStatus;
  localReviewStatusLabel: string;
  reviewerEnteredLabel: string;
  reviewerIdentityVerification: 'UNVERIFIED_IDENTITY';
  checklistSummary: {
    total: number;
    satisfactory: number;
    correctionRequired: number;
    notApplicable: number;
    notChecked: number;
  };
  openCorrectionRequests: number;
  resolvedCorrectionRequests: number;
  files: PrimerReviewPackageManifestFile[];
  manifestChecksum: string;
}

export interface BuildReviewPackageZipOptions {
  revision: PrimerRevisionRecord;
  review: PrimerReviewRecord;
  allRevisionsForDoc?: PrimerRevisionRecord[];
  exportedAtUtc?: string;
  includeExports?: boolean;
  publicDraftPdfBytes?: Uint8Array | null;
  scientificReviewPdfBytes?: Uint8Array | null;
  generatePdfsSynchronously?: boolean;
}

export interface BuiltReviewPackageZip {
  filename: string;
  zipBytes: Uint8Array;
  manifest: PrimerReviewPackageManifest;
  warnings: string[];
}

function buildUint8Checksum(bytes: Uint8Array): string {
  // Fast deterministic dual-FNV over binary bytes
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= b + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function buildPrimerReviewPackageZip(
  options: BuildReviewPackageZipOptions
): BuiltReviewPackageZip {
  const { revision, review } = options;
  if (!verifyPrimerRevisionChecksum(revision)) {
    throw new Error('Cannot export review package: frozen revision failed checksum check.');
  }
  if (!verifyPrimerReviewChecksum(review)) {
    throw new Error('Cannot export review package: review record failed checksum check.');
  }
  if (
    review.revisionId !== revision.revisionId ||
    review.revisionContentChecksum !== revision.contentChecksum
  ) {
    throw new Error(
      'Cannot export review package: review record is not bound to the supplied revision checksum.'
    );
  }
  if (isForbiddenReleaseStatus(review.status) || !isAllowedLocalReviewStatus(review.status)) {
    throw new Error(`Invalid local review status: ${review.status}`);
  }

  const exportedAtUtc = options.exportedAtUtc ?? new Date().toISOString();
  const exportedAtPst = formatUtcAsPst(exportedAtUtc);
  const warnings: string[] = [];
  const enc = new TextEncoder();

  const entries: ZipInputEntry[] = [];
  const manifestFiles: PrimerReviewPackageManifestFile[] = [];

  const pushFile = (
    path: string,
    role: PrimerReviewPackageManifestFile['role'],
    payload: string | Uint8Array,
    extra?: { rowCount?: number; truncatedFromCount?: number }
  ) => {
    const bytes = typeof payload === 'string' ? enc.encode(payload) : payload;
    const crc32Hex = computeCrc32(bytes).toString(16).padStart(8, '0');
    const canonicalContentChecksum = buildUint8Checksum(bytes);
    entries.push({ path, data: bytes });
    manifestFiles.push({
      path,
      role,
      byteSize: bytes.byteLength,
      crc32Hex,
      canonicalContentChecksum,
      ...extra,
    });
  };

  // 1. Mandatory Review Notice README
  const statusMeta = PRIMER_LOCAL_REVIEW_STATUS_META[review.status];
  const readmeText = [
    '================================================================================',
    `  ${PRIMER_REVIEW_PACKAGE_RELEASE_BANNER}`,
    '================================================================================',
    '',
    `Primer Document ID : ${revision.primerDocumentId}`,
    `Event ID           : ${revision.eventId} (Bulletin No. ${revision.snapshot.bulletinNo})`,
    `Frozen Revision    : #${revision.revisionNumber} (${revision.revisionId})`,
    `Revision Created   : ${revision.createdAtPst} (${revision.createdAtUtc})`,
    `Revision Checksum  : ${revision.contentChecksum}`,
    `Review Record ID   : ${review.reviewRecordId}`,
    `Local Review State : ${statusMeta.label}`,
    `Reviewer Label     : ${review.reviewerIdentity.enteredLabel} [UNVERIFIED_IDENTITY]`,
    `External Auth      : UNAVAILABLE / NOT CONFIGURED`,
    `Public Publication : UNAVAILABLE / NOT CONFIGURED`,
    `Package Exported   : ${exportedAtPst} (${exportedAtUtc})`,
    '',
    'IMPORTANT SCIENTIFIC & AUTHORIZATION NOTICE:',
    `- ${LOCAL_REVIEW_AUTHORITY_DISCLAIMER}`,
    `- ${LOCAL_REVIEW_INTEGRITY_DISCLAIMER}`,
    '- Any names or review statuses inside this package are local operator records only',
    '  and must be independently verified through authorized PHIVOLCS institutional review.',
    '- Raw Research Assistant source documents, full-text caches, and R2/R3 local libraries',
    '  (IndexedDB eqp_primer_research_sources_v1 / external source URLs) reside outside this ZIP;',
    '  structured R3 transfer quotes, hashes, and citations are recorded in',
    '  provenance/scientific-provenance-ledger.json.',
    '',
    'CHECKLIST SUMMARY:',
    ...review.checklist.map(
      (c) =>
        `  [${String(c.order).padStart(2, '0')}] ${PRIMER_CHECKLIST_STATE_LABELS[c.state]} — ${c.label}${
          c.state === 'not-applicable' && c.notApplicableJustification
            ? ` (N/A justification: ${c.notApplicableJustification})`
            : ''
        }`
    ),
    '',
    `OPEN CORRECTION REQUESTS (${review.comments.filter((c) => c.isCorrectionRequest && c.resolutionState === 'open').length}):`,
    ...review.comments
      .filter((c) => c.isCorrectionRequest && c.resolutionState === 'open')
      .map(
        (c) =>
          `  - [${c.targetLabel}] ${c.body} (Author: ${c.authorLabel} [UNVERIFIED_IDENTITY] @ ${c.createdAtPst})`
      ),
    '',
  ].join('\n');
  pushFile('README_REVIEW_NOTICE.txt', 'notice', readmeText);

  // 2. Frozen Revision Record JSON
  pushFile(
    'revision/revision-record.json',
    'revision-snapshot',
    JSON.stringify(revision, null, 2)
  );

  // 3. Revision Lineage JSON
  const lineageList = (options.allRevisionsForDoc ?? [revision])
    .filter((r) => r.primerDocumentId === revision.primerDocumentId)
    .sort((a, b) => a.revisionNumber - b.revisionNumber)
    .map((r) => ({
      revisionId: r.revisionId,
      revisionNumber: r.revisionNumber,
      parentRevisionId: r.parentRevisionId,
      createdAtUtc: r.createdAtUtc,
      createdAtPst: r.createdAtPst,
      description: r.description,
      contentChecksum: r.contentChecksum,
      sourceEventFingerprint: r.sourceEventFingerprint,
    }));
  pushFile(
    'revision/revision-lineage.json',
    'revision-lineage',
    JSON.stringify(
      {
        primerDocumentId: revision.primerDocumentId,
        boundRevisionId: revision.revisionId,
        boundRevisionNumber: revision.revisionNumber,
        parentRevisionId: revision.parentRevisionId,
        restoredFromRevisionId:
          revision.snapshot.extensions?.reviewVersioning?.restoredFromRevisionId ?? null,
        restoredFromRevisionNumber:
          revision.snapshot.extensions?.reviewVersioning?.restoredFromRevisionNumber ?? null,
        lineageHistory: lineageList,
      },
      null,
      2
    )
  );

  // 4. Review Record JSON (Checklist + Comments + Correction Requests)
  pushFile('review/review-record.json', 'review-record', JSON.stringify(review, null, 2));

  // 5. Provenance & Source/Cutoff Ledger JSON
  const stage3 = revision.snapshot.extensions?.sequenceHistoricalAnalysis ?? null;
  const stage4 = revision.snapshot.extensions?.scientificNarrativePackage ?? null;
  const provenancePayload = {
    eventId: revision.eventId,
    bulletinNo: revision.snapshot.bulletinNo,
    sourceEventFingerprint: revision.sourceEventFingerprint,
    stage2FigureFingerprint: revision.stage2FigureFingerprint,
    stage3SequenceFingerprint: revision.stage3SequenceFingerprint,
    stage4NarrativeFingerprint: revision.stage4NarrativeFingerprint,
    completenessIndicators: revision.completenessIndicators,
    stage2Provenance: revision.snapshot.extensions?.epicenterFigure?.provenance ?? null,
    stage3Provenance: stage3 ? stage3.provenance : null,
    stage3DataCutoffUtc: stage3?.statistics.dataCutoffUtc ?? null,
    stage3DataCutoffPst: stage3?.statistics.dataCutoffPst ?? null,
    stage4DataCutoffUtc: stage4?.dataCutoffUtc ?? null,
    stage4DataCutoffPst: stage4?.dataCutoffPst ?? null,
    stage4TemplateVersion: stage4?.templateVersion ?? null,
    stage4Ledger: stage4?.provenanceLedger ?? [],
    r3TransferredSources: stage4?.externalData?.r3TransferredSources ?? [],
    references: buildPrimerReferenceList(revision.snapshot),
  };
  pushFile(
    'provenance/scientific-provenance-ledger.json',
    'provenance-ledger',
    JSON.stringify(provenancePayload, null, 2)
  );

  // 6. Stage 3 Tables (Row-capped)
  if (stage3) {
    const dayRows = stage3.statistics.countsByDay.slice(0, MAX_EXPORT_TABLE_ROWS);
    pushFile(
      'tables/aftershock-daily-counts.json',
      'table-json',
      JSON.stringify(
        {
          totalAvailableRows: stage3.statistics.countsByDay.length,
          exportedRowCount: dayRows.length,
          rowCap: MAX_EXPORT_TABLE_ROWS,
          dataCutoffUtc: stage3.statistics.dataCutoffUtc,
          dataCutoffPst: stage3.statistics.dataCutoffPst,
          membershipBasis: stage3.statistics.membershipBasis,
          countsByInterval: stage3.statistics.countsByInterval,
          maxAftershock: stage3.statistics.maxAftershock,
          rows: dayRows,
        },
        null,
        2
      ),
      {
        rowCount: dayRows.length,
        truncatedFromCount:
          stage3.statistics.countsByDay.length > MAX_EXPORT_TABLE_ROWS
            ? stage3.statistics.countsByDay.length
            : undefined,
      }
    );

    const magRows = stage3.statistics.magnitudeDistribution.slice(0, MAX_EXPORT_TABLE_ROWS);
    pushFile(
      'tables/magnitude-distribution.json',
      'table-json',
      JSON.stringify(
        {
          totalAvailableRows: stage3.statistics.magnitudeDistribution.length,
          exportedRowCount: magRows.length,
          rowCap: MAX_EXPORT_TABLE_ROWS,
          magnitudesByScale: stage3.statistics.magnitudesByScale,
          hasMixedMagnitudeScales: stage3.statistics.hasMixedMagnitudeScales,
          rows: magRows,
        },
        null,
        2
      ),
      {
        rowCount: magRows.length,
        truncatedFromCount:
          stage3.statistics.magnitudeDistribution.length > MAX_EXPORT_TABLE_ROWS
            ? stage3.statistics.magnitudeDistribution.length
            : undefined,
      }
    );

    const histRows = stage3.historical.rows.slice(0, MAX_EXPORT_TABLE_ROWS);
    pushFile(
      'tables/historical-seismicity.json',
      'table-json',
      JSON.stringify(
        {
          totalMatchingCount: stage3.historical.totalMatchingCount,
          exportedRowCount: histRows.length,
          rowCap: MAX_EXPORT_TABLE_ROWS,
          radiusKm: stage3.historical.radiusKm,
          minMag: stage3.historical.minMag,
          rows: histRows,
        },
        null,
        2
      ),
      {
        rowCount: histRows.length,
        truncatedFromCount:
          stage3.historical.rows.length > MAX_EXPORT_TABLE_ROWS
            ? stage3.historical.rows.length
            : undefined,
      }
    );
  }

  // 7. Sanitized Vector Figures (SVG)
  const figSlots: Array<{ path: string; svg: string | undefined; status?: string }> = [
    {
      path: 'figures/epicenter.svg',
      svg: revision.snapshot.extensions?.epicenterFigure?.svgMarkup,
      status: revision.snapshot.extensions?.epicenterFigure?.status,
    },
    {
      path: 'figures/aftershock_map.svg',
      svg: stage3?.figures.aftershockMap.svgMarkup,
      status: stage3?.figures.aftershockMap.status,
    },
    {
      path: 'figures/activity_chart.svg',
      svg: stage3?.figures.activityChart.svgMarkup,
      status: stage3?.figures.activityChart.status,
    },
    {
      path: 'figures/magnitude_chart.svg',
      svg: stage3?.figures.magnitudeChart.svgMarkup,
      status: stage3?.figures.magnitudeChart.status,
    },
  ];
  for (const fig of figSlots) {
    if (fig.status === 'ready' && fig.svg && fig.svg.trim()) {
      const check = sanitizeAndValidateSvgMarkup(fig.svg);
      if (check.ok) {
        pushFile(fig.path, 'figure-svg', check.sanitizedSvg);
      } else {
        warnings.push(`Skipped ${fig.path}: ${check.errors.join(' ')}`);
      }
    }
  }

  // 8. Exported HTML & PDF Artifacts (Public Draft + Scientific Review Copy)
  if (options.includeExports !== false) {
    const revInfo = toPrimerExportRevisionInfo(revision);
    const modes: Array<{
      mode: PrimerPresentationMode;
      htmlPath: string;
      pdfPath: string;
      suppliedPdf?: Uint8Array | null;
    }> = [
      {
        mode: 'public-draft',
        htmlPath: 'exports/public-draft.html',
        pdfPath: 'exports/public-draft.pdf',
        suppliedPdf: options.publicDraftPdfBytes,
      },
      {
        mode: 'scientific-review',
        htmlPath: 'exports/scientific-review.html',
        pdfPath: 'exports/scientific-review.pdf',
        suppliedPdf: options.scientificReviewPdfBytes,
      },
    ];

    for (const spec of modes) {
      const html = buildPrimerHtmlDocument(revision.snapshot, {
        mode: spec.mode,
        includePageBreakGuides: false,
        revisionInfo: revInfo,
      });
      pushFile(spec.htmlPath, 'export-html', html);

      if (spec.suppliedPdf && spec.suppliedPdf.byteLength > 0) {
        pushFile(spec.pdfPath, 'export-pdf', spec.suppliedPdf);
      } else if (options.generatePdfsSynchronously) {
        const { doc } = buildPrimerPdfDocument(revision.snapshot, {
          mode: spec.mode,
          revisionInfo: revInfo,
        });
        const buf = new Uint8Array(doc.output('arraybuffer'));
        pushFile(spec.pdfPath, 'export-pdf', buf);
      }
    }
  }

  const baseManifest: Omit<PrimerReviewPackageManifest, 'manifestChecksum'> = {
    schemaVersion: '1.0',
    packageType: PRIMER_REVIEW_PACKAGE_TYPE,
    releaseStatusBanner: PRIMER_REVIEW_PACKAGE_RELEASE_BANNER,
    externalInstitutionalAuthorization: 'UNAVAILABLE / NOT CONFIGURED',
    publicPublicationStatus: 'UNAVAILABLE / NOT CONFIGURED',
    exportedAtUtc,
    exportedAtPst,
    primerDocumentId: revision.primerDocumentId,
    eventId: revision.eventId,
    revisionId: revision.revisionId,
    revisionNumber: revision.revisionNumber,
    revisionContentChecksum: revision.contentChecksum,
    reviewRecordId: review.reviewRecordId,
    localReviewStatus: review.status,
    localReviewStatusLabel: statusMeta.label,
    reviewerEnteredLabel: review.reviewerIdentity.enteredLabel,
    reviewerIdentityVerification: 'UNVERIFIED_IDENTITY',
    checklistSummary: {
      total: review.checklist.length,
      satisfactory: review.checklist.filter(
        (c) => c.state === 'satisfactory-for-local-review'
      ).length,
      correctionRequired: review.checklist.filter((c) => c.state === 'correction-required')
        .length,
      notApplicable: review.checklist.filter((c) => c.state === 'not-applicable').length,
      notChecked: review.checklist.filter((c) => c.state === 'not-checked').length,
    },
    openCorrectionRequests: review.comments.filter(
      (c) => c.isCorrectionRequest && c.resolutionState === 'open'
    ).length,
    resolvedCorrectionRequests: review.comments.filter(
      (c) => c.isCorrectionRequest && c.resolutionState === 'resolved'
    ).length,
    files: manifestFiles,
  };

  const manifest: PrimerReviewPackageManifest = {
    ...baseManifest,
    manifestChecksum: computeCanonicalChecksum(baseManifest),
  };

  entries.push({
    path: 'manifest.json',
    data: JSON.stringify(manifest, null, 2),
  });

  const zipBytes = encodeStoredZip(entries, { createdAtUtc: exportedAtUtc });
  const safeEvent = revision.eventId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `EQP_Primer_ReviewPackage_${safeEvent}_REV${revision.revisionNumber}.zip`;

  return {
    filename,
    zipBytes,
    manifest,
    warnings,
  };
}

// =============================================================================
// VALIDATED REVIEW RECORD & ZIP PACKAGE IMPORT
// =============================================================================

export interface ValidatedReviewRecordResult {
  ok: boolean;
  review: PrimerReviewRecord | null;
  errors: string[];
}

const VALID_CHECKLIST_STATES = new Set<PrimerChecklistItemState>([
  'not-checked',
  'satisfactory-for-local-review',
  'correction-required',
  'not-applicable',
]);

export function validateSingleReviewRecord(
  raw: unknown,
  contextLabel = 'review'
): ValidatedReviewRecordResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, review: null, errors: [`${contextLabel} is not a JSON object.`] };
  }
  const r = raw as Partial<PrimerReviewRecord>;

  if (r.schemaVersion !== PRIMER_REVIEW_SCHEMA_VERSION) {
    errors.push(`${contextLabel}: unsupported schemaVersion "${String(r.schemaVersion)}".`);
  }
  if (!r.reviewRecordId || typeof r.reviewRecordId !== 'string') {
    errors.push(`${contextLabel}: missing reviewRecordId.`);
  }
  if (!r.primerDocumentId || typeof r.primerDocumentId !== 'string') {
    errors.push(`${contextLabel}: missing primerDocumentId.`);
  }
  if (!r.revisionId || typeof r.revisionId !== 'string') {
    errors.push(`${contextLabel}: missing bound revisionId.`);
  }
  if (typeof r.revisionNumber !== 'number' || !Number.isFinite(r.revisionNumber)) {
    errors.push(`${contextLabel}: invalid revisionNumber.`);
  }
  if (!r.revisionContentChecksum || typeof r.revisionContentChecksum !== 'string') {
    errors.push(`${contextLabel}: missing revisionContentChecksum.`);
  }
  if (typeof r.status !== 'string') {
    errors.push(`${contextLabel}: missing status.`);
  } else if (isForbiddenReleaseStatus(r.status) || !isAllowedLocalReviewStatus(r.status)) {
    errors.push(
      `${contextLabel}: rejected disallowed or unknown review status "${r.status}". Only local workflow statuses are permitted.`
    );
  }
  if (
    !r.reviewerIdentity ||
    r.reviewerIdentity.identityVerification !== 'UNVERIFIED_IDENTITY'
  ) {
    errors.push(
      `${contextLabel}: reviewerIdentity.identityVerification must be UNVERIFIED_IDENTITY.`
    );
  }
  if (!Array.isArray(r.checklist)) {
    errors.push(`${contextLabel}: checklist must be an array.`);
  } else {
    for (let i = 0; i < r.checklist.length; i++) {
      const item = r.checklist[i];
      if (!item || typeof item !== 'object' || !VALID_CHECKLIST_STATES.has(item.state)) {
        errors.push(`${contextLabel}: invalid checklist item state at index ${i}.`);
      }
    }
  }
  if (!Array.isArray(r.comments)) {
    errors.push(`${contextLabel}: comments must be an array.`);
  } else {
    for (let i = 0; i < r.comments.length; i++) {
      const c = r.comments[i];
      if (
        !c ||
        typeof c !== 'object' ||
        typeof c.commentId !== 'string' ||
        typeof c.body !== 'string' ||
        c.authorIdentityVerification !== 'UNVERIFIED_IDENTITY'
      ) {
        errors.push(
          `${contextLabel}: invalid comment or missing UNVERIFIED_IDENTITY marker at index ${i}.`
        );
      }
    }
  }

  if (errors.length === 0) {
    const candidate = r as PrimerReviewRecord;
    if (!verifyPrimerReviewChecksum(candidate)) {
      errors.push(`${contextLabel} (${candidate.reviewRecordId}): checksum verification failed.`);
    } else {
      return {
        ok: true,
        review: {
          ...candidate,
          localArchival: {
            ...candidate.localArchival,
            storageKind: 'imported-archive',
            isTamperProof: false,
            integrityNote: LOCAL_REVIEW_INTEGRITY_DISCLAIMER,
          },
        },
        errors: [],
      };
    }
  }

  return { ok: false, review: null, errors };
}

export interface ImportedReviewPackageResult {
  ok: boolean;
  manifest: PrimerReviewPackageManifest | null;
  revision: PrimerRevisionRecord | null;
  review: PrimerReviewRecord | null;
  errors: string[];
  warnings: string[];
}

export function validateAndImportPrimerReviewPackageZip(
  zipBytes: Uint8Array
): ImportedReviewPackageResult {
  const warnings: string[] = [];
  const decoded = decodeAndValidateStoredZip(zipBytes);
  if (!decoded.ok) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: decoded.errors,
      warnings,
    };
  }

  const dec = new TextDecoder('utf-8', { fatal: true });
  const manifestEntry = decoded.entries.get('manifest.json');
  const revisionEntry = decoded.entries.get('revision/revision-record.json');
  const reviewEntry = decoded.entries.get('review/review-record.json');

  if (!manifestEntry || !revisionEntry || !reviewEntry) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: [
        'Missing mandatory package file(s): manifest.json, revision/revision-record.json, or review/review-record.json.',
      ],
      warnings,
    };
  }

  let manifestText = '';
  let revisionText = '';
  let reviewText = '';
  try {
    manifestText = dec.decode(manifestEntry.bytes);
    revisionText = dec.decode(revisionEntry.bytes);
    reviewText = dec.decode(reviewEntry.bytes);
  } catch {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: ['Malformed UTF-8 text inside review package JSON files.'],
      warnings,
    };
  }

  const parsedManifest = safeJsonParseChecked(manifestText);
  if (!parsedManifest.ok) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: [`manifest.json rejected: ${parsedManifest.error}`],
      warnings,
    };
  }
  const manifest = parsedManifest.value as Partial<PrimerReviewPackageManifest>;
  if (
    manifest.schemaVersion !== '1.0' ||
    manifest.packageType !== PRIMER_REVIEW_PACKAGE_TYPE ||
    !Array.isArray(manifest.files) ||
    typeof manifest.manifestChecksum !== 'string'
  ) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: ['manifest.json has unsupported schemaVersion or packageType.'],
      warnings,
    };
  }

  if (
    typeof manifest.localReviewStatus === 'string' &&
    (isForbiddenReleaseStatus(manifest.localReviewStatus) ||
      !isAllowedLocalReviewStatus(manifest.localReviewStatus))
  ) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: [
        `manifest.json rejected disallowed review status "${manifest.localReviewStatus}".`,
      ],
      warnings,
    };
  }

  const { manifestChecksum, ...manifestBase } = manifest as PrimerReviewPackageManifest;
  if (computeCanonicalChecksum(manifestBase) !== manifestChecksum) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: ['manifest.json checksum verification failed (manifest may have been modified).'],
      warnings,
    };
  }

  // Verify every listed manifest file against decoded ZIP entry bytes & checksum
  const errors: string[] = [];
  for (const fileMeta of manifest.files) {
    if (!isSafeZipEntryPath(fileMeta.path)) {
      errors.push(`Manifest lists unsafe path: ${fileMeta.path}`);
      continue;
    }
    const zipEntry = decoded.entries.get(fileMeta.path);
    if (!zipEntry) {
      errors.push(`Manifest entry missing from ZIP archive: ${fileMeta.path}`);
      continue;
    }
    if (zipEntry.bytes.byteLength !== fileMeta.byteSize) {
      errors.push(`File size mismatch for ${fileMeta.path}.`);
      continue;
    }
    const actualChecksum = buildUint8Checksum(zipEntry.bytes);
    if (actualChecksum !== fileMeta.canonicalContentChecksum) {
      errors.push(`Content checksum mismatch for ${fileMeta.path}.`);
      continue;
    }
    if (fileMeta.role === 'figure-svg') {
      try {
        const svgStr = dec.decode(zipEntry.bytes);
        const svgCheck = sanitizeAndValidateSvgMarkup(svgStr);
        if (!svgCheck.ok) {
          errors.push(`Unsafe SVG figure "${fileMeta.path}": ${svgCheck.errors.join(' ')}`);
        }
      } catch {
        errors.push(`Invalid UTF-8 SVG figure "${fileMeta.path}".`);
      }
    }
  }

  // Also ensure no unlisted SVG scripts snuck into figures/
  for (const [path, zipEntry] of decoded.entries) {
    if (path.toLowerCase().endsWith('.svg')) {
      try {
        const svgStr = dec.decode(zipEntry.bytes);
        const svgCheck = sanitizeAndValidateSvgMarkup(svgStr);
        if (!svgCheck.ok) {
          errors.push(`Unsafe SVG "${path}": ${svgCheck.errors.join(' ')}`);
        }
      } catch {
        errors.push(`Malformed SVG encoding at "${path}".`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors,
      warnings,
    };
  }

  // Validate revision record via Stage 6A archive rules
  const revParsed = safeJsonParseChecked(revisionText);
  if (!revParsed.ok) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: [`revision/revision-record.json rejected: ${revParsed.error}`],
      warnings,
    };
  }
  const revCandidate = revParsed.value as PrimerRevisionRecord;
  const revBundleCheck = validateAndParsePrimerRevisionArchive(
    JSON.stringify({
      schemaVersion: '1.0',
      bundleType: 'eqp-primer-revision-archive',
      exportedAtUtc: manifest.exportedAtUtc,
      exportedAtPst: manifest.exportedAtPst,
      sourceApplication: 'ReviewPackageImport',
      integrityNote: 'Check',
      revisionCount: 1,
      eventIds: [revCandidate.eventId],
      primerDocumentIds: [revCandidate.primerDocumentId],
      archiveChecksum: computeCanonicalChecksum({
        schemaVersion: '1.0',
        bundleType: 'eqp-primer-revision-archive',
        revisions: [
          {
            revisionId: revCandidate.revisionId,
            revisionNumber: revCandidate.revisionNumber,
            primerDocumentId: revCandidate.primerDocumentId,
            eventId: revCandidate.eventId,
            contentChecksum: revCandidate.contentChecksum,
          },
        ],
      }),
      revisions: [revCandidate],
    })
  );
  if (!revBundleCheck.ok || revBundleCheck.revisions.length !== 1) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: [
        'Frozen revision inside review package failed validation:',
        ...revBundleCheck.errors,
      ],
      warnings,
    };
  }
  const validRevision = deepFreezeRevision(revBundleCheck.revisions[0]);

  // Also sanitize SVGs inside the imported revision snapshot
  const fig1Svg = validRevision.snapshot.extensions?.epicenterFigure?.svgMarkup;
  if (fig1Svg && fig1Svg.trim()) {
    const c = sanitizeAndValidateSvgMarkup(fig1Svg);
    if (!c.ok) {
      return {
        ok: false,
        manifest: null,
        revision: null,
        review: null,
        errors: [`Revision epicenter SVG failed security scan: ${c.errors.join(' ')}`],
        warnings,
      };
    }
  }

  // Validate review record
  const reviewParsed = safeJsonParseChecked(reviewText);
  if (!reviewParsed.ok) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: [`review/review-record.json rejected: ${reviewParsed.error}`],
      warnings,
    };
  }
  const reviewValidated = validateSingleReviewRecord(
    reviewParsed.value,
    'review/review-record.json'
  );
  if (!reviewValidated.ok || !reviewValidated.review) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: reviewValidated.errors,
      warnings,
    };
  }
  const validReview = reviewValidated.review;

  if (
    validReview.revisionId !== validRevision.revisionId ||
    validReview.revisionContentChecksum !== validRevision.contentChecksum ||
    validReview.primerDocumentId !== validRevision.primerDocumentId
  ) {
    return {
      ok: false,
      manifest: null,
      revision: null,
      review: null,
      errors: [
        'Imported review record binding mismatch: revisionId or revisionContentChecksum does not match bundled frozen revision.',
      ],
      warnings,
    };
  }

  return {
    ok: true,
    manifest: manifest as PrimerReviewPackageManifest,
    revision: validRevision,
    review: validReview,
    errors: [],
    warnings,
  };
}

// =============================================================================
// PORTABLE REVIEW ARCHIVE JSON EXPORT & STRICT VALIDATED IMPORT
// =============================================================================

export interface PrimerReviewArchiveBundle {
  schemaVersion: '1.0';
  bundleType: 'eqp-primer-review-archive';
  exportedAtUtc: string;
  exportedAtPst: string;
  integrityNote: string;
  reviewCount: number;
  archiveChecksum: string;
  reviews: PrimerReviewRecord[];
}

export function serializePrimerReviewArchiveJson(
  reviews: PrimerReviewRecord[],
  options: { exportedAtUtc?: string } = {}
): string {
  const exportedAtUtc = options.exportedAtUtc ?? new Date().toISOString();
  const sorted = [...reviews].sort((a, b) =>
    a.revisionNumber !== b.revisionNumber
      ? a.revisionNumber - b.revisionNumber
      : a.reviewRecordId.localeCompare(b.reviewRecordId)
  );
  const archiveChecksum = computeCanonicalChecksum({
    schemaVersion: '1.0',
    bundleType: PRIMER_REVIEW_ARCHIVE_BUNDLE_TYPE,
    reviews: sorted.map((r) => ({
      reviewRecordId: r.reviewRecordId,
      revisionId: r.revisionId,
      revisionContentChecksum: r.revisionContentChecksum,
      recordChecksum: r.localArchival.recordChecksum,
    })),
  });
  const bundle: PrimerReviewArchiveBundle = {
    schemaVersion: '1.0',
    bundleType: PRIMER_REVIEW_ARCHIVE_BUNDLE_TYPE,
    exportedAtUtc,
    exportedAtPst: formatUtcAsPst(exportedAtUtc),
    integrityNote: `${LOCAL_REVIEW_AUTHORITY_DISCLAIMER} ${LOCAL_REVIEW_INTEGRITY_DISCLAIMER}`,
    reviewCount: sorted.length,
    archiveChecksum,
    reviews: sorted,
  };
  return JSON.stringify(bundle, null, 2);
}

export interface PrimerReviewArchiveParseResult {
  ok: boolean;
  reviews: PrimerReviewRecord[];
  errors: string[];
  warnings: string[];
}

export function validateAndParsePrimerReviewArchiveJson(
  rawJson: string
): PrimerReviewArchiveParseResult {
  const parsedRes = safeJsonParseChecked(rawJson);
  if (!parsedRes.ok) {
    return { ok: false, reviews: [], errors: [parsedRes.error], warnings: [] };
  }

  const obj = parsedRes.value;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return {
      ok: false,
      reviews: [],
      errors: ['Review archive root must be a JSON object.'],
      warnings: [],
    };
  }

  const bundle = obj as Partial<PrimerReviewArchiveBundle>;
  if (
    bundle.schemaVersion !== '1.0' ||
    bundle.bundleType !== PRIMER_REVIEW_ARCHIVE_BUNDLE_TYPE ||
    !Array.isArray(bundle.reviews)
  ) {
    return {
      ok: false,
      reviews: [],
      errors: [
        'Unsupported review archive schemaVersion or bundleType (expected eqp-primer-review-archive v1.0).',
      ],
      warnings: [],
    };
  }

  const validReviews: PrimerReviewRecord[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < bundle.reviews.length; i++) {
    const res = validateSingleReviewRecord(bundle.reviews[i], `Review[${i}]`);
    if (!res.ok || !res.review) {
      errors.push(...res.errors);
    } else if (seenIds.has(res.review.reviewRecordId)) {
      errors.push(`Duplicate reviewRecordId in archive: ${res.review.reviewRecordId}`);
    } else {
      seenIds.add(res.review.reviewRecordId);
      validReviews.push(res.review);
    }
  }

  if (errors.length > 0) {
    return { ok: false, reviews: [], errors, warnings: [] };
  }

  const expectedBundleChecksum = computeCanonicalChecksum({
    schemaVersion: '1.0',
    bundleType: PRIMER_REVIEW_ARCHIVE_BUNDLE_TYPE,
    reviews: validReviews.map((r) => ({
      reviewRecordId: r.reviewRecordId,
      revisionId: r.revisionId,
      revisionContentChecksum: r.revisionContentChecksum,
      recordChecksum: r.localArchival.recordChecksum,
    })),
  });
  if (
    typeof bundle.archiveChecksum !== 'string' ||
    bundle.archiveChecksum !== expectedBundleChecksum
  ) {
    return {
      ok: false,
      reviews: [],
      errors: ['Review archive bundle checksum verification failed.'],
      warnings: [],
    };
  }

  return { ok: true, reviews: validReviews, errors: [], warnings: [] };
}

// =============================================================================
// LOCAL INDEXEDDB REVIEW RECORD ARCHIVE STORE (Separate from Stage 6A revisions)
// =============================================================================

export interface PrimerReviewArchiveDiagnostics {
  backend: 'indexeddb' | 'memory-fallback';
  dbName: string;
  reviewCount: number;
  isTamperProof: false;
  integrityDisclaimer: string;
}

export interface PrimerReviewArchiveStore {
  listReviews(filter?: {
    primerDocumentId?: string;
    revisionId?: string;
    eventId?: string;
  }): Promise<PrimerReviewRecord[]>;
  getReviewByRevision(revisionId: string): Promise<PrimerReviewRecord | null>;
  saveReview(review: PrimerReviewRecord): Promise<PrimerReviewRecord>;
  importArchiveJson(
    rawJson: string
  ): Promise<{ ok: boolean; importedCount: number; skippedIds: string[]; errors: string[] }>;
  getDiagnostics(): Promise<PrimerReviewArchiveDiagnostics>;
}

export function createMemoryReviewStore(
  initial: PrimerReviewRecord[] = []
): PrimerReviewArchiveStore {
  const map = new Map<string, PrimerReviewRecord>();
  for (const r of initial) {
    map.set(r.reviewRecordId, r);
  }

  return {
    async listReviews(filter) {
      let arr = Array.from(map.values());
      if (filter?.primerDocumentId) {
        arr = arr.filter((r) => r.primerDocumentId === filter.primerDocumentId);
      }
      if (filter?.revisionId) {
        arr = arr.filter((r) => r.revisionId === filter.revisionId);
      }
      if (filter?.eventId) {
        arr = arr.filter((r) => r.eventId === filter.eventId);
      }
      return arr.sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc));
    },
    async getReviewByRevision(revisionId) {
      const matching = Array.from(map.values())
        .filter((r) => r.revisionId === revisionId)
        .sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc));
      return matching[0] ?? null;
    },
    async saveReview(review) {
      assertNoReviewStatusViolation(review.status);
      if (!verifyPrimerReviewChecksum(review)) {
        throw new Error(`Cannot save review ${review.reviewRecordId}: checksum invalid.`);
      }
      const normalized: PrimerReviewRecord = {
        ...review,
        localArchival: {
          ...review.localArchival,
          storageKind: 'memory-fallback',
        },
      };
      map.set(normalized.reviewRecordId, normalized);
      return normalized;
    },
    async importArchiveJson(rawJson) {
      const parsed = validateAndParsePrimerReviewArchiveJson(rawJson);
      if (!parsed.ok) {
        return {
          ok: false,
          importedCount: 0,
          skippedIds: [],
          errors: parsed.errors,
        };
      }
      let importedCount = 0;
      const skippedIds: string[] = [];
      for (const r of parsed.reviews) {
        if (map.has(r.reviewRecordId)) {
          skippedIds.push(r.reviewRecordId);
        } else {
          map.set(r.reviewRecordId, r);
          importedCount++;
        }
      }
      return { ok: true, importedCount, skippedIds, errors: [] };
    },
    async getDiagnostics() {
      return {
        backend: 'memory-fallback',
        dbName: PRIMER_REVIEW_DB_NAME,
        reviewCount: map.size,
        isTamperProof: false,
        integrityDisclaimer: LOCAL_REVIEW_INTEGRITY_DISCLAIMER,
      };
    },
  };
}

function openReviewDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(PRIMER_REVIEW_DB_NAME, PRIMER_REVIEW_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRIMER_REVIEW_STORE_NAME)) {
        const store = db.createObjectStore(PRIMER_REVIEW_STORE_NAME, {
          keyPath: 'reviewRecordId',
        });
        store.createIndex('byRevisionId', 'revisionId', { unique: false });
        store.createIndex('byPrimerDocumentId', 'primerDocumentId', { unique: false });
        store.createIndex('byEventId', 'eventId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open review IndexedDB'));
  });
}

export function createIndexedDbReviewStore(): PrimerReviewArchiveStore {
  const memoryFallback = createMemoryReviewStore();
  let useFallback =
    typeof window === 'undefined' || typeof window.indexedDB === 'undefined';

  async function withStore<T>(
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    if (useFallback) return fallbackFn();
    try {
      const db = await openReviewDatabase();
      try {
        const tx = db.transaction(PRIMER_REVIEW_STORE_NAME, mode);
        const store = tx.objectStore(PRIMER_REVIEW_STORE_NAME);
        return await op(store);
      } finally {
        db.close();
      }
    } catch {
      useFallback = true;
      return fallbackFn();
    }
  }

  return {
    async listReviews(filter) {
      return withStore(
        'readonly',
        (store) =>
          new Promise<PrimerReviewRecord[]>((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => {
              let rows = (req.result as PrimerReviewRecord[]) ?? [];
              if (filter?.primerDocumentId) {
                rows = rows.filter((r) => r.primerDocumentId === filter.primerDocumentId);
              }
              if (filter?.revisionId) {
                rows = rows.filter((r) => r.revisionId === filter.revisionId);
              }
              if (filter?.eventId) {
                rows = rows.filter((r) => r.eventId === filter.eventId);
              }
              resolve(rows.sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc)));
            };
            req.onerror = () => reject(req.error);
          }),
        () => memoryFallback.listReviews(filter)
      );
    },
    async getReviewByRevision(revisionId) {
      const rows = await this.listReviews({ revisionId });
      return rows[0] ?? null;
    },
    async saveReview(review) {
      assertNoReviewStatusViolation(review.status);
      if (!verifyPrimerReviewChecksum(review)) {
        throw new Error(`Cannot save review ${review.reviewRecordId}: checksum invalid.`);
      }
      return withStore(
        'readwrite',
        (store) =>
          new Promise<PrimerReviewRecord>((resolve, reject) => {
            const req = store.put(review);
            req.onsuccess = () => resolve(review);
            req.onerror = () => reject(req.error);
          }),
        () => memoryFallback.saveReview(review)
      );
    },
    async importArchiveJson(rawJson) {
      const parsed = validateAndParsePrimerReviewArchiveJson(rawJson);
      if (!parsed.ok) {
        return {
          ok: false,
          importedCount: 0,
          skippedIds: [],
          errors: parsed.errors,
        };
      }
      const existing = await this.listReviews();
      const existingIds = new Set(existing.map((r) => r.reviewRecordId));
      let importedCount = 0;
      const skippedIds: string[] = [];
      for (const r of parsed.reviews) {
        if (existingIds.has(r.reviewRecordId)) {
          skippedIds.push(r.reviewRecordId);
        } else {
          await this.saveReview(r);
          importedCount++;
        }
      }
      return { ok: true, importedCount, skippedIds, errors: [] };
    },
    async getDiagnostics() {
      const rows = await this.listReviews();
      return {
        backend: useFallback ? 'memory-fallback' : 'indexeddb',
        dbName: PRIMER_REVIEW_DB_NAME,
        reviewCount: rows.length,
        isTamperProof: false,
        integrityDisclaimer: LOCAL_REVIEW_INTEGRITY_DISCLAIMER,
      };
    },
  };
}

let singletonReviewStore: PrimerReviewArchiveStore | null = null;
export function getPrimerReviewStore(): PrimerReviewArchiveStore {
  if (!singletonReviewStore) {
    singletonReviewStore = createIndexedDbReviewStore();
  }
  return singletonReviewStore;
}
