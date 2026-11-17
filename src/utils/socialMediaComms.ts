import {
  type EarthquakeOriginType,
  type EQPEvent,
  isEventUnlocated,
} from '../data/eqpData.ts';
import { getEqpEventKey } from './eqpHistory.ts';
import {
  formatCanonicalLocalityDisplay,
  normalizeIntensityCategory,
  normalizeIntensityReviewStatus,
  PEIS_RANK,
} from './intensityFormat.ts';
import {
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from './magnitudeEngine.ts';

export type CommunicationChannel =
  | 'viber'
  | 'facebook'
  | 'messenger'
  | 'x_twitter'
  | 'email'
  | 'other';

export type CommunicationTemplateId =
  | 'standard_office'
  | 'concise_viber'
  | 'concise_messenger'
  | 'public_summary'
  | 'x_short'
  | 'updated_bulletin';

export type CommunicationClassification = 'private_office' | 'public_release';

export type SourceVerificationStatus =
  | 'RELEASED_WEB_PUBLISHED'
  | 'LOCAL_BULLETIN_UNVERIFIED'
  | 'STALE_SOURCE'
  | 'UNVERIFIED_SOURCE'
  | 'MISSING_BULLETIN';

export type CommsWarningCode =
  | 'MISSING_BULLETIN'
  | 'UNVERIFIED_SOURCE'
  | 'STALE_SOURCE'
  | 'NO_DESTINATIONS'
  | 'UNSUPPORTED_CHANNEL'
  | 'DUPLICATE_DISPATCH'
  | 'LOCAL_ONLY_RECORD'
  | 'NOT_SENT';

export interface CanonicalBulletinSource {
  eventId: string;
  eventKey: string;
  bulletinId: string;
  bulletinNumber: number;
  bulletinRevision: string;
  sourceFingerprint: string;
  originDateTimePht: string;
  originDateTimeUtc: string;
  bulletinIssueDateTimePht: string | null;
  magnitudeValue: number | null;
  magnitudeScale: string;
  magnitudeDisplay: string;
  latitude: number | null;
  longitude: number | null;
  depthKm: number | null;
  epicentralDescription: string;
  originType: EarthquakeOriginType | null;
  verifiedIntensityInformation: string | null;
  verifiedFeltCount: number;
  verifiedInstrumentalCount: number;
  unverifiedIntensityExcludedCount: number;
  officialBulletinLink: string | null;
  sourceStatus: SourceVerificationStatus;
  sourceStatusLabel: string;
  isReleasedSource: boolean;
  hasBulletinSnapshot: boolean;
  isStaleOrEdited: boolean;
  warnings: CommsWarningCode[];
  warningDetails: string[];
}

export interface OfficeRecord {
  officeId: string;
  officeName: string;
  officeType: string;
  region: string;
  province: string;
  active: boolean;
}

export interface CommunicationDestination {
  destinationId: string;
  officeId?: string;
  channel: CommunicationChannel;
  displayName: string;
  destinationIdentifier: string;
  active: boolean;
  notes: string;
}

export interface DistributionGroup {
  groupId: string;
  groupName: string;
  destinationIds: string[];
  active: boolean;
}

export interface RecipientDirectory {
  offices: OfficeRecord[];
  destinations: CommunicationDestination[];
  groups: DistributionGroup[];
}

export interface LocalAuthorizationRecord {
  authorized: boolean;
  operatorLabel: string;
  recordedAt: string;
  recordAuthenticityLabel: 'UNVERIFIED LOCAL RECORD';
  note: string;
}

export interface CommunicationDraftSnapshot {
  draftId: string;
  eventId: string;
  eventKey: string;
  templateId: CommunicationTemplateId;
  classification: CommunicationClassification;
  subject: string;
  body: string;
  communicationRevisionId: string;
  messageFingerprint: string;
  sourceBulletinId: string;
  sourceBulletinRevision: string;
  sourceFingerprint: string;
  editedFromTemplate: boolean;
  localAuthorization: LocalAuthorizationRecord | null;
  createdAt: string;
  updatedAt: string;
}

export type DispatchStatus =
  | 'PREPARED'
  | 'OPENED_EXTERNALLY'
  | 'OPERATOR_CONFIRMED_SENT'
  | 'FAILED'
  | 'CANCELLED';

export type ConfirmationMethod =
  | 'UNCONFIRMED'
  | 'OPERATOR_MANUAL_CONFIRMATION';

export interface DispatchRecord {
  dispatchId: string;
  eventId: string;
  eventKey: string;
  sourceBulletinId: string;
  sourceBulletinRevision: string;
  sourceFingerprint: string;
  communicationRevisionId: string;
  messageFingerprint: string;
  destinationId: string;
  destinationName: string;
  destinationIdentifier: string;
  channel: CommunicationChannel;
  classification: CommunicationClassification;
  subjectSnapshot: string;
  messageSnapshot: string;
  createdAt: string;
  openedExternallyAt?: string;
  sentConfirmedAt?: string;
  lastActionAt: string;
  status: DispatchStatus;
  operatorLabel: string;
  confirmationMethod: ConfirmationMethod;
  confirmationAuthenticityLabel: 'OPERATOR-CONFIRMED (LOCAL RECORD)' | 'NOT SENT';
  externalReference?: string;
  notes?: string;
}

export interface DispatchStatusVisualMeta {
  status: DispatchStatus;
  shortLabel: string;
  historyLabel: string;
  pillClass: string;
  dotClass: string;
  legendCardClass: string;
  description: string;
}

export const DISPATCH_STATUS_ORDER: ReadonlyArray<DispatchStatus> = [
  'PREPARED',
  'OPENED_EXTERNALLY',
  'OPERATOR_CONFIRMED_SENT',
  'FAILED',
  'CANCELLED',
];

/**
 * Canonical status color-coding and descriptions shared across
 * Dispatch Queue, Status Legend, and Dispatch History.
 */
export const DISPATCH_STATUS_VISUALS: Record<DispatchStatus, DispatchStatusVisualMeta> = {
  PREPARED: {
    status: 'PREPARED',
    shortLabel: 'PREPARED',
    historyLabel: 'PREPARED',
    pillClass: 'bg-amber-100 border-amber-400 text-amber-950',
    dotClass: 'bg-amber-500',
    legendCardClass: 'bg-amber-50 border-amber-300 text-amber-950',
    description:
      'Staged in queue with frozen message snapshot; external app not opened yet (NOT SENT).',
  },
  OPENED_EXTERNALLY: {
    status: 'OPENED_EXTERNALLY',
    shortLabel: 'OPENED_EXTERNALLY',
    historyLabel: 'OPENED_EXTERNALLY',
    pillClass: 'bg-sky-100 border-sky-400 text-sky-950',
    dotClass: 'bg-sky-600',
    legendCardClass: 'bg-sky-50 border-sky-300 text-sky-950',
    description:
      'Text copied and external platform opened; awaiting manual send and operator confirmation (NOT SENT).',
  },
  OPERATOR_CONFIRMED_SENT: {
    status: 'OPERATOR_CONFIRMED_SENT',
    shortLabel: 'CONFIRMED SENT',
    historyLabel: 'CONFIRMED SENT',
    pillClass: 'bg-emerald-100 border-emerald-500 text-emerald-950',
    dotClass: 'bg-emerald-600',
    legendCardClass: 'bg-emerald-50 border-emerald-400 text-emerald-950',
    description:
      'Operator manually confirmed transmission via Confirm Sent; logged as OPERATOR-CONFIRMED (LOCAL RECORD).',
  },
  FAILED: {
    status: 'FAILED',
    shortLabel: 'FAILED',
    historyLabel: 'FAILED',
    pillClass: 'bg-rose-100 border-rose-500 text-rose-950',
    dotClass: 'bg-rose-600',
    legendCardClass: 'bg-rose-50 border-rose-300 text-rose-950',
    description:
      'Delivery failed or rejected externally; excluded from confirmed sent metrics.',
  },
  CANCELLED: {
    status: 'CANCELLED',
    shortLabel: 'CANCELLED',
    historyLabel: 'CANCELLED',
    pillClass: 'bg-slate-200 border-slate-400 text-slate-700',
    dotClass: 'bg-slate-500',
    legendCardClass: 'bg-slate-100 border-slate-300 text-slate-800',
    description:
      'Cancelled prior to send confirmation; safe to re-prepare or stage a new revision.',
  },
};

export interface CommsSettings {
  defaultTemplateId: CommunicationTemplateId;
  defaultGroupId: string;
  defaultClassification: CommunicationClassification;
  operatorLabel: string;
  xHandle: string;
  officialChannelHandles: {
    viber: string;
    facebook: string;
    messenger: string;
    x_twitter: string;
  };
  officialBulletinUrl: string;
  authorizedChannelUrls: {
    viber: string;
    facebook: string;
    messenger: string;
    x_twitter: string;
    other: string;
  };
  xMaxChars: number;
}

export const DEFAULT_COMMS_SETTINGS: CommsSettings = {
  defaultTemplateId: 'standard_office',
  defaultGroupId: '',
  defaultClassification: 'private_office',
  operatorLabel: 'Duty Officer (Local Workstation)',
  xHandle: '',
  officialChannelHandles: {
    viber: '',
    facebook: '',
    messenger: '',
    x_twitter: '',
  },
  officialBulletinUrl: '',
  authorizedChannelUrls: {
    viber: '',
    facebook: '',
    messenger: '',
    x_twitter: 'https://x.com/intent/tweet',
    other: '',
  },
  xMaxChars: 280,
};

export const MOBILE_RECOMMENDED_CHARS = {
  viber: 450,
  messenger: 360,
} as const;

export const TEMPLATE_DEFINITIONS: ReadonlyArray<{
  id: CommunicationTemplateId;
  label: string;
  shortDesc: string;
  intendedClassification: CommunicationClassification;
}> = [
  {
    id: 'standard_office',
    label: '1. Standard Office Notification',
    shortDesc: 'Structured notification for partner agencies and regional desks.',
    intendedClassification: 'private_office',
  },
  {
    id: 'concise_viber',
    label: '2. Concise Viber Notification (Mobile)',
    shortDesc: 'Mobile-first compact alert fitted to <= 450 chars for Viber groups.',
    intendedClassification: 'private_office',
  },
  {
    id: 'concise_messenger',
    label: '3. Mobile Messenger Alert',
    shortDesc: 'Ultra-compact chat alert fitted to <= 360 chars for Messenger push/cards.',
    intendedClassification: 'private_office',
  },
  {
    id: 'public_summary',
    label: '4. Public Earthquake Summary',
    shortDesc: 'Public-facing summary strictly bounded to verified bulletin fields.',
    intendedClassification: 'public_release',
  },
  {
    id: 'x_short',
    label: '5. X/Twitter Short Message',
    shortDesc: 'Character-budgeted summary validated against configured post length.',
    intendedClassification: 'public_release',
  },
  {
    id: 'updated_bulletin',
    label: '6. Updated Bulletin Notification',
    shortDesc: 'Explicitly highlights updated bulletin number/revision parameters.',
    intendedClassification: 'private_office',
  },
];

export const COMMUNICATION_CHANNEL_ORDER: ReadonlyArray<CommunicationChannel> = [
  'viber',
  'facebook',
  'messenger',
  'x_twitter',
  'email',
  'other',
];

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  viber: 'Viber',
  facebook: 'Facebook',
  messenger: 'Messenger',
  x_twitter: 'X / Twitter',
  email: 'Email',
  other: 'Other Channel',
};

/**
 * Deterministic 32-bit FNV-1a hash converted to zero-padded uppercase hex.
 */
export function computeDeterministicFingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

const MANILA_DATETIME_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

/**
 * Parses `originDateGmt` + `originTimeGmt` explicitly as UTC and formats in `Asia/Manila` (PHT).
 * Falls back cleanly if date/time strings are incomplete without double-converting already-local values.
 */
export function formatOriginUtcAndPht(
  originDateGmt: string,
  originTimeGmt: string,
  originDateLstFallback?: string,
  originTimeLstFallback?: string
): { pht: string; utc: string } {
  const cleanDate = (originDateGmt || '').trim();
  const cleanTime = (originTimeGmt || '').trim();
  const dMatch = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tMatch = cleanTime.match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);

  if (dMatch && tMatch) {
    const year = Number(dMatch[1]);
    const month = Number(dMatch[2]) - 1;
    const day = Number(dMatch[3]);
    const hour = Number(tMatch[1]);
    const minute = Number(tMatch[2]);
    const second = Math.trunc(Number(tMatch[3] || 0));
    const utcMs = Date.UTC(year, month, day, hour, minute, second);
    const utcDate = new Date(utcMs);
    const phtFormatted = `${MANILA_DATETIME_FORMATTER.format(utcDate)} PHT (Asia/Manila)`;
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    const ss = String(second).padStart(2, '0');
    return {
      pht: phtFormatted,
      utc: `${cleanDate} ${hh}:${mm}:${ss} UTC`,
    };
  }

  // Fallback without adding another +8h offset
  const phtFallback =
    originDateLstFallback && originTimeLstFallback
      ? `${originDateLstFallback} ${originTimeLstFallback} PHT (Asia/Manila · local source)`
      : 'Unavailable';
  const utcFallback =
    cleanDate && cleanTime ? `${cleanDate} ${cleanTime} UTC` : 'Unavailable';
  return { pht: phtFallback, utc: utcFallback };
}

/**
 * Validates an external URL against an explicit allowlist of safe schemes.
 */
export function validateSafeExternalUrl(
  rawUrl: string | undefined | null,
  allowedSchemes: ReadonlyArray<'https:' | 'mailto:' | 'viber:'>
): { valid: boolean; normalizedUrl: string | null; reason: string | null } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, normalizedUrl: null, reason: 'No destination URL configured.' };
  }
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return {
      valid: false,
      normalizedUrl: null,
      reason: 'Blocked unsafe URI scheme.',
    };
  }
  try {
    const parsed = new URL(trimmed);
    const scheme = parsed.protocol.toLowerCase() as 'https:' | 'mailto:' | 'viber:';
    if (!allowedSchemes.includes(scheme)) {
      return {
        valid: false,
        normalizedUrl: null,
        reason: `Unsupported URL scheme (${parsed.protocol}). Allowed: ${allowedSchemes.join(', ')}.`,
      };
    }
    return { valid: true, normalizedUrl: parsed.toString(), reason: null };
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      reason: 'Malformed external URL.',
    };
  }
}

export interface ResolveCanonicalSourceInput {
  event: EQPEvent;
  primaryLocationLabel: string;
  freshness?: MagnitudeFreshnessInspection;
  isBulletinEdited: boolean;
  hasSavedBulletinOnDisk: boolean;
  savedBulletinFilename?: string | null;
  openedBulletinFilename?: string | null;
  officialBulletinUrl?: string | null;
}

/**
 * Extracts verified felt and instrumental intensities without fabricating or leaking draft/conflicting records.
 */
export function buildVerifiedIntensitySummary(event: EQPEvent): {
  summary: string | null;
  verifiedFeltCount: number;
  verifiedInstrumentalCount: number;
  excludedCount: number;
} {
  if (event.intensityBulletinOverride?.trim()) {
    return {
      summary: event.intensityBulletinOverride.trim(),
      verifiedFeltCount: 0,
      verifiedInstrumentalCount: 0,
      excludedCount: 0,
    };
  }

  const verifiedFelt: string[] = [];
  const verifiedInst: string[] = [];
  let excludedCount = 0;

  const sorted = [...(event.intensities ?? [])].sort(
    (a, b) => (PEIS_RANK[b.peis] ?? 0) - (PEIS_RANK[a.peis] ?? 0)
  );

  for (const entry of sorted) {
    const status = normalizeIntensityReviewStatus(entry);
    if (status !== 'verified') {
      excludedCount += 1;
      continue;
    }
    const label =
      formatCanonicalLocalityDisplay({
        specificLocation: entry.specificLocation,
        municipality: entry.municipality,
        province: entry.province,
        fallbackLocality: entry.locality,
      }) || entry.locality;
    if (!label) continue;
    const cat = normalizeIntensityCategory(entry);
    const line = `Intensity ${entry.peis} - ${label}`;
    if (cat === 'instrumental') {
      verifiedInst.push(line);
    } else {
      verifiedFelt.push(line);
    }
  }

  const sections: string[] = [];
  if (verifiedFelt.length > 0) {
    sections.push(`Reported Intensities:\n${verifiedFelt.join('\n')}`);
  }
  if (verifiedInst.length > 0) {
    sections.push(`Instrumental Intensities:\n${verifiedInst.join('\n')}`);
  }

  return {
    summary: sections.length > 0 ? sections.join('\n\n') : null,
    verifiedFeltCount: verifiedFelt.length,
    verifiedInstrumentalCount: verifiedInst.length,
    excludedCount,
  };
}

/**
 * Builds a strictly read-only CanonicalBulletinSource from existing EQP event & bulletin state.
 * Never recalculates seismic parameters or fabricates missing release authority.
 */
export function resolveCanonicalBulletinSource(
  input: ResolveCanonicalSourceInput
): CanonicalBulletinSource {
  const {
    event,
    primaryLocationLabel,
    freshness,
    isBulletinEdited,
    hasSavedBulletinOnDisk,
    savedBulletinFilename,
    openedBulletinFilename,
    officialBulletinUrl,
  } = input;

  const eventKey = getEqpEventKey(event);
  const bulletinNumber = Math.max(1, Math.trunc(event.bulletinNo || 1));
  const magRes = resolveBulletinMagnitude(event, freshness);
  const unlocated = isEventUnlocated(event);

  const { pht: originDateTimePht, utc: originDateTimeUtc } = formatOriginUtcAndPht(
    event.originDateGmt,
    event.originTimeGmt,
    event.originDateLst,
    event.originTimeLst
  );

  const hasIssuedDate = Boolean(event.issuedDate?.trim());
  const hasIssuedTime = Boolean(event.issuedTime?.trim());
  const bulletinIssueDateTimePht =
    hasIssuedDate || hasIssuedTime
      ? `${event.issuedDate?.trim() || 'Date pending'}${
          hasIssuedTime ? ` - ${event.issuedTime.trim()}` : ''
        } PHT (Asia/Manila · local record)`
      : null;

  const hasSnapshot = Boolean(
    hasSavedBulletinOnDisk || openedBulletinFilename || event.webPublished
  );

  const bulletinId =
    openedBulletinFilename ||
    savedBulletinFilename ||
    (hasSnapshot ? `${eventKey}_B${bulletinNumber}` : `DRAFT-${eventKey}-B${bulletinNumber}`);

  const bulletinRevision = `B${bulletinNumber}${
    event.webPublished ? '-PUB' : hasSnapshot ? '-SAVED' : '-DRAFT'
  }`;

  const intensityCheck = buildVerifiedIntensitySummary(event);
  const linkValidation = validateSafeExternalUrl(officialBulletinUrl, ['https:']);
  const officialBulletinLink = linkValidation.valid ? linkValidation.normalizedUrl : null;

  const epicentralDescription = unlocated
    ? 'Epicenter pending hypocenter solution'
    : (primaryLocationLabel || '').trim() || 'Epicentral description unavailable';

  const isStaleOrEdited = Boolean(magRes.isStale || isBulletinEdited);
  const isMagReady = Boolean(magRes.canPublish && magRes.value !== null && !magRes.isStale);

  const warnings: CommsWarningCode[] = ['LOCAL_ONLY_RECORD'];
  const warningDetails: string[] = [
    'Communications state, directory, and approvals in COM-1 are stored locally on this workstation only (not synced across computers).',
  ];

  let sourceStatus: SourceVerificationStatus;
  let sourceStatusLabel: string;
  let isReleasedSource = false;

  if (!hasSnapshot && !event.webPublished) {
    sourceStatus = 'MISSING_BULLETIN';
    sourceStatusLabel = 'MISSING BULLETIN / DRAFT ONLY (No saved or released bulletin)';
    warnings.push('MISSING_BULLETIN', 'UNVERIFIED_SOURCE');
    if (isStaleOrEdited) {
      warnings.push('STALE_SOURCE');
    }
    warningDetails.push(
      'No saved or officially released bulletin was found for the active event. Scientific values below are read-only draft parameters and cannot be treated as an officially released bulletin.'
    );
  } else if (isStaleOrEdited) {
    sourceStatus = 'STALE_SOURCE';
    sourceStatusLabel = isBulletinEdited
      ? 'STALE / UNSAVED BULLETIN EDITS'
      : 'STALE SOURCE (Magnitude or picks changed since last calculation)';
    warnings.push('STALE_SOURCE', 'UNVERIFIED_SOURCE');
    warningDetails.push(
      isBulletinEdited
        ? 'The active bulletin has unsaved local edits in the Bulletin tab. Save or discard edits before releasing communications.'
        : magRes.warning ||
            'Event parameters or magnitude configuration changed after calculation. Recalculate and save the bulletin first.'
    );
  } else if (!isMagReady || unlocated || magRes.requiresAnalystConfirmation) {
    sourceStatus = 'UNVERIFIED_SOURCE';
    sourceStatusLabel = 'UNVERIFIED SOURCE (Pending location or magnitude confirmation)';
    warnings.push('UNVERIFIED_SOURCE');
    warningDetails.push(
      magRes.warning ||
        'Location or preferred magnitude is unverified or pending confirmation.'
    );
  } else if (event.webPublished) {
    sourceStatus = 'RELEASED_WEB_PUBLISHED';
    sourceStatusLabel =
      'WEB-PUBLISHED FLAG PRESENT (No server auth — local operator verification required)';
    isReleasedSource = true;
  } else {
    sourceStatus = 'LOCAL_BULLETIN_UNVERIFIED';
    sourceStatusLabel =
      'SAVED LOCAL BULLETIN — UNVERIFIED RELEASE (No authoritative server release status)';
    warnings.push('UNVERIFIED_SOURCE');
    warningDetails.push(
      'EQP Modern does not currently provide authenticated server-side bulletin release approval. Only draft and manual private office preparation are permitted until official release status is confirmed.'
    );
  }

  if (intensityCheck.excludedCount > 0) {
    warningDetails.push(
      `${intensityCheck.excludedCount} unverified/conflicting intensity record(s) excluded from communication templates.`
    );
  }

  const canonicalPayload = JSON.stringify({
    eventKey,
    bulletinId,
    bulletinNumber,
    originDateGmt: event.originDateGmt,
    originTimeGmt: event.originTimeGmt,
    lat: unlocated ? null : Number(event.lat.toFixed(4)),
    lon: unlocated ? null : Number(event.lon.toFixed(4)),
    depthKm: unlocated ? null : Number(event.depthKm.toFixed(2)),
    magDisplay: magRes.displayText,
    magScale: magRes.scaleLabel,
    epicentralDescription,
    originType: event.originType ?? null,
    verifiedIntensity: intensityCheck.summary,
    issuedDate: event.issuedDate ?? '',
    issuedTime: event.issuedTime ?? '',
    webPublished: Boolean(event.webPublished),
    isStale: Boolean(magRes.isStale),
    isBulletinEdited,
    hasSnapshot,
  });

  const sourceFingerprint = `SRC-${computeDeterministicFingerprint(canonicalPayload)}`;

  return {
    eventId: event.id,
    eventKey,
    bulletinId,
    bulletinNumber,
    bulletinRevision,
    sourceFingerprint,
    originDateTimePht,
    originDateTimeUtc,
    bulletinIssueDateTimePht,
    magnitudeValue: magRes.value,
    magnitudeScale: magRes.scaleLabel,
    magnitudeDisplay: magRes.displayText,
    latitude: unlocated ? null : event.lat,
    longitude: unlocated ? null : event.lon,
    depthKm: unlocated ? null : event.depthKm,
    epicentralDescription,
    originType: event.originType ?? null,
    verifiedIntensityInformation: intensityCheck.summary,
    verifiedFeltCount: intensityCheck.verifiedFeltCount,
    verifiedInstrumentalCount: intensityCheck.verifiedInstrumentalCount,
    unverifiedIntensityExcludedCount: intensityCheck.excludedCount,
    officialBulletinLink,
    sourceStatus,
    sourceStatusLabel,
    isReleasedSource,
    hasBulletinSnapshot: hasSnapshot,
    isStaleOrEdited,
    warnings,
    warningDetails,
  };
}

/**
 * Generates deterministic, zero-fabrication communication subject and body strictly from CanonicalBulletinSource.
 */
export function generateDeterministicMessage(
  source: CanonicalBulletinSource,
  templateId: CommunicationTemplateId
): { subject: string; body: string } {
  const banner = !source.isReleasedSource
    ? '[DRAFT / UNVERIFIED LOCAL RECORD — NOT AN OFFICIAL RELEASED BULLETIN]\n\n'
    : '';

  const coordsLine =
    source.latitude !== null && source.longitude !== null
      ? `${source.latitude.toFixed(2)}°N, ${source.longitude.toFixed(2)}°E`
      : 'Coordinates pending';
  const depthLine =
    source.depthKm !== null ? `${Math.round(source.depthKm)} km` : 'Depth pending';
  const magLine = source.magnitudeDisplay || 'Magnitude pending';
  const originTypeLine = source.originType ? source.originType : 'Not specified';
  const issueLine = source.bulletinIssueDateTimePht || 'Issue time not yet recorded';
  const intensityBlock = source.verifiedIntensityInformation
    ? `\n\n${source.verifiedIntensityInformation}`
    : '';
  const linkBlock = source.officialBulletinLink
    ? `\n\nOfficial Bulletin Link: ${source.officialBulletinLink}`
    : '';

  const fitMobileMessage = (
    coreLines: string[],
    intensityLines: string[],
    linkLine: string,
    maxChars: number
  ): string => {
    const baseText = coreLines.join('\n');
    const parts = [baseText];
    let current = baseText;

    if (intensityLines.length > 0) {
      const reservedForLink =
        linkLine && baseText.length + 1 + linkLine.length <= maxChars
          ? 1 + linkLine.length
          : 0;
      const kept: string[] = [];
      for (let i = 0; i < intensityLines.length; i += 1) {
        const remaining = intensityLines.length - (i + 1);
        const overflowSuffix =
          remaining > 0 ? `\n(+${remaining} more verified)` : '';
        const candidateBlock =
          kept.length === 0
            ? `\nVerified: ${intensityLines[i]}${overflowSuffix}`
            : `\nVerified:\n${[...kept, intensityLines[i]].join('\n')}${overflowSuffix}`;
        if (baseText.length + candidateBlock.length + reservedForLink <= maxChars) {
          kept.push(intensityLines[i]);
        } else {
          break;
        }
      }
      if (kept.length > 0) {
        const remaining = intensityLines.length - kept.length;
        const header = kept.length === 1 && remaining === 0
          ? `Verified: ${kept[0]}`
          : `Verified:\n${kept.join('\n')}${
              remaining > 0 ? `\n(+${remaining} more verified)` : ''
            }`;
        parts.push(header);
      }
    }

    current = parts.join('\n');
    if (linkLine && current.length + 1 + linkLine.length <= maxChars) {
      current = `${current}\n${linkLine}`;
    }
    return current;
  };

  if (templateId === 'concise_viber' || templateId === 'concise_messenger') {
    const isMessenger = templateId === 'concise_messenger';
    const maxRecommended = isMessenger
      ? MOBILE_RECOMMENDED_CHARS.messenger
      : MOBILE_RECOMMENDED_CHARS.viber;
    const mobileDraftTag = !source.isReleasedSource ? '[DRAFT / UNVERIFIED]\n' : '';
    const shortOrigin = source.originDateTimePht.replace(' (Asia/Manila)', '').replace(' · local source', '');
    const subject = `EQ No. ${source.bulletinNumber} — ${magLine} | ${source.epicentralDescription}`;

    const intensityLines = (source.verifiedIntensityInformation || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.endsWith(':'));

    const coreLines = isMessenger
      ? [
          `${mobileDraftTag}EQ INFO #${source.bulletinNumber} (${source.bulletinRevision})`,
          `${magLine} | Depth: ${depthLine}`,
          `Time: ${shortOrigin}`,
          `Loc: ${source.epicentralDescription} (${coordsLine})`,
          `Origin: ${originTypeLine}`,
        ]
      : [
          `${mobileDraftTag}EARTHQUAKE INFO NO. ${source.bulletinNumber} (${source.bulletinRevision})`,
          `Mag: ${magLine} | Depth: ${depthLine} | ${originTypeLine}`,
          `Time: ${shortOrigin}`,
          `Loc: ${coordsLine} - ${source.epicentralDescription}`,
        ];

    const linkLine = source.officialBulletinLink
      ? `${isMessenger ? 'Link' : 'Bulletin'}: ${source.officialBulletinLink}`
      : '';

    const body = fitMobileMessage(coreLines, intensityLines, linkLine, maxRecommended);
    return { subject, body };
  }

  if (templateId === 'public_summary') {
    const subject = `Earthquake Information No. ${source.bulletinNumber}: ${magLine} (${source.epicentralDescription})`;
    const body =
      `${banner}Earthquake Information No. ${source.bulletinNumber}\n` +
      `Date and Time: ${source.originDateTimePht}\n` +
      `Location: ${source.epicentralDescription} (${coordsLine})\n` +
      `Depth of Focus: ${depthLine}\n` +
      `Magnitude: ${magLine}\n` +
      `Origin: ${originTypeLine}\n` +
      `Bulletin Issued: ${issueLine}` +
      intensityBlock +
      linkBlock;
    return { subject, body };
  }

  if (templateId === 'x_short') {
    const subject = `EQ Info No. ${source.bulletinNumber} (${magLine})`;
    const statusTag = !source.isReleasedSource ? '[DRAFT] ' : '';
    const linkSuffix = source.officialBulletinLink
      ? ` ${source.officialBulletinLink}`
      : '';
    const core =
      `${statusTag}EQ Info No. ${source.bulletinNumber}: ${magLine}, ` +
      `${source.originDateTimePht.replace(' (Asia/Manila)', '')}, ` +
      `${source.epicentralDescription} (${coordsLine}), Depth ${depthLine}, ` +
      `Origin: ${originTypeLine}.${linkSuffix}`;
    return { subject, body: core };
  }

  if (templateId === 'updated_bulletin') {
    const subject = `UPDATED Earthquake Bulletin No. ${source.bulletinNumber} (${source.bulletinRevision}) — ${magLine}`;
    const body =
      `${banner}UPDATED EARTHQUAKE BULLETIN NOTICE\n` +
      `Event ID: ${source.eventKey}\n` +
      `Bulletin No. / Revision: ${source.bulletinNumber} (${source.bulletinRevision})\n` +
      `Origin Date/Time (PHT): ${source.originDateTimePht}\n` +
      `Origin Date/Time (UTC): ${source.originDateTimeUtc}\n` +
      `Bulletin Issue Time: ${issueLine}\n` +
      `Magnitude: ${magLine}\n` +
      `Coordinates: ${coordsLine}\n` +
      `Depth: ${depthLine}\n` +
      `Epicentral Description: ${source.epicentralDescription}\n` +
      `Origin Type: ${originTypeLine}` +
      intensityBlock +
      linkBlock;
    return { subject, body };
  }

  // standard_office
  const subject = `Earthquake Information No. ${source.bulletinNumber} — ${magLine} (${source.epicentralDescription})`;
  const body =
    `${banner}EARTHQUAKE INFORMATION NO. ${source.bulletinNumber}\n` +
    `Event ID: ${source.eventKey} | Bulletin Revision: ${source.bulletinRevision}\n` +
    `Origin Date/Time (PHT): ${source.originDateTimePht}\n` +
    `Origin Date/Time (UTC): ${source.originDateTimeUtc}\n` +
    `Bulletin Issue Date/Time: ${issueLine}\n` +
    `Magnitude: ${magLine}\n` +
    `Location: ${coordsLine}\n` +
    `Depth: ${depthLine}\n` +
    `Epicentral Description: ${source.epicentralDescription}\n` +
    `Origin Type: ${originTypeLine}` +
    intensityBlock +
    linkBlock;
  return { subject, body };
}

export function buildMessageFingerprint(
  templateId: CommunicationTemplateId,
  classification: CommunicationClassification,
  subject: string,
  body: string
): string {
  return `MSG-${computeDeterministicFingerprint(
    JSON.stringify({ templateId, classification, subject, body })
  )}`;
}

/**
 * Evaluates X/Twitter message length constraints against configured limit.
 */
export function validateXPostLength(
  body: string,
  maxChars: number = 280
): { length: number; maxChars: number; valid: boolean; overflow: number } {
  const limit = Math.max(1, Math.trunc(maxChars || 280));
  const length = body.length;
  return {
    length,
    maxChars: limit,
    valid: length <= limit,
    overflow: Math.max(0, length - limit),
  };
}

/**
 * Evaluates mobile messaging recommended length constraints (Viber / Messenger).
 */
export function validateMobileMessageLength(
  channel: 'viber' | 'messenger',
  body: string,
  maxRecommended: number = MOBILE_RECOMMENDED_CHARS[channel]
): { length: number; maxRecommended: number; fits: boolean; overflow: number } {
  const limit = Math.max(1, Math.trunc(maxRecommended || MOBILE_RECOMMENDED_CHARS[channel]));
  const length = body.length;
  return {
    length,
    maxRecommended: limit,
    fits: length <= limit,
    overflow: Math.max(0, length - limit),
  };
}

/**
 * Resolves unique active destinations across selected individual destination IDs and distribution groups.
 * Eliminates duplicate destination entries when overlapping groups share the same destination.
 */
export function resolveUniqueSelectedDestinations(params: {
  directory: RecipientDirectory;
  selectedDestinationIds: string[];
  selectedGroupIds: string[];
}): {
  destinations: CommunicationDestination[];
  dedupedCount: number;
  selectedGroupNames: string[];
} {
  const { directory, selectedDestinationIds, selectedGroupIds } = params;
  const activeDestById = new Map(
    directory.destinations
      .filter((d) => d.active)
      .map((d) => [d.destinationId, d])
  );

  const orderedIds: string[] = [];
  let rawSelectionCount = 0;

  for (const id of selectedDestinationIds) {
    rawSelectionCount += 1;
    orderedIds.push(id);
  }

  const selectedGroupNames: string[] = [];
  for (const groupId of selectedGroupIds) {
    const group = directory.groups.find((g) => g.groupId === groupId && g.active);
    if (!group) continue;
    selectedGroupNames.push(group.groupName);
    for (const dId of group.destinationIds) {
      rawSelectionCount += 1;
      orderedIds.push(dId);
    }
  }

  const seen = new Set<string>();
  const resolved: CommunicationDestination[] = [];
  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    const dest = activeDestById.get(id);
    if (!dest) continue;
    seen.add(id);
    resolved.push(dest);
  }

  return {
    destinations: resolved,
    dedupedCount: Math.max(0, rawSelectionCount - resolved.length),
    selectedGroupNames,
  };
}

export interface DuplicateDispatchMatch {
  destinationId: string;
  destinationName: string;
  channel: CommunicationChannel;
  existingStatus: DispatchStatus;
  existingDispatchId: string;
}

/**
 * Detects duplicate dispatch attempts matching (eventKey, sourceBulletinRevision, communicationRevisionId, destinationId, channel).
 */
export function findDuplicateDispatches(params: {
  destinations: CommunicationDestination[];
  eventKey: string;
  sourceBulletinRevision: string;
  communicationRevisionId: string;
  existingRecords: DispatchRecord[];
}): DuplicateDispatchMatch[] {
  const {
    destinations,
    eventKey,
    sourceBulletinRevision,
    communicationRevisionId,
    existingRecords,
  } = params;
  const matches: DuplicateDispatchMatch[] = [];

  for (const dest of destinations) {
    const existing = existingRecords.find(
      (r) =>
        r.status !== 'CANCELLED' &&
        r.eventKey === eventKey &&
        r.sourceBulletinRevision === sourceBulletinRevision &&
        r.communicationRevisionId === communicationRevisionId &&
        r.destinationId === dest.destinationId &&
        r.channel === dest.channel
    );
    if (existing) {
      matches.push({
        destinationId: dest.destinationId,
        destinationName: dest.displayName,
        channel: dest.channel,
        existingStatus: existing.status,
        existingDispatchId: existing.dispatchId,
      });
    }
  }

  return matches;
}

/**
 * Builds the Viber desktop protocol handler URI (`viber://forward?text=...`)
 * with URL-encoded pre-formatted message content.
 */
export function buildViberProtocolForwardUrl(messageBody: string): string {
  return `viber://forward?text=${encodeURIComponent(messageBody)}`;
}

/**
 * Resolves a validated manual-assisted external entry URL for the given destination & channel.
 * Returns null if unsupported/unconfigured (never constructs unsafe URLs or auto-publishes).
 */
export function buildManualAssistedChannelUrl(params: {
  channel: CommunicationChannel;
  destinationIdentifier: string;
  subject: string;
  body: string;
  settings: CommsSettings;
}): { url: string | null; note: string; isSupported: boolean } {
  const { channel, destinationIdentifier, subject, body, settings } = params;

  if (channel === 'email') {
    const cleanTo = destinationIdentifier
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
      .join(',');
    if (!cleanTo) {
      return {
        url: null,
        isSupported: false,
        note: 'Valid email address required on destination to launch mail draft.',
      };
    }
    const mailto = `mailto:${encodeURIComponent(cleanTo).replace(/%2C/g, ',')}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    return {
      url: mailto,
      isSupported: true,
      note: 'Opens local mail-client draft only (no attachments added automatically).',
    };
  }

  if (channel === 'x_twitter') {
    const base = settings.authorizedChannelUrls.x_twitter || 'https://x.com/intent/tweet';
    const check = validateSafeExternalUrl(base, ['https:']);
    if (!check.valid || !check.normalizedUrl) {
      return {
        url: null,
        isSupported: false,
        note: check.reason || 'Configure a valid https:// X/Twitter compose URL in Settings.',
      };
    }
    const target = new URL(check.normalizedUrl);
    if (target.pathname.includes('/intent/')) {
      target.searchParams.set('text', body);
      const handleValidation = validateXTwitterHandle(settings.xHandle || '');
      if (handleValidation.valid && handleValidation.normalizedHandle) {
        target.searchParams.set('via', handleValidation.normalizedHandle.replace(/^@/, ''));
      }
    }
    return {
      url: target.toString(),
      isSupported: true,
      note: 'Opens X/Twitter compose page for manual operator review & posting.',
    };
  }

  if (channel === 'viber') {
    const candidate = destinationIdentifier.trim() || settings.authorizedChannelUrls.viber;
    if (candidate) {
      const check = validateSafeExternalUrl(candidate, ['https:', 'viber:']);
      if (check.valid && check.normalizedUrl) {
        return {
          url: check.normalizedUrl,
          isSupported: true,
          note: 'Copies text & opens configured Viber entry point; operator selects target group manually and clicks Confirm Sent.',
        };
      }
    }
    const forwardUrl = buildViberProtocolForwardUrl(body);
    return {
      url: forwardUrl,
      isSupported: true,
      note: 'Launches Viber desktop forward handoff if installed; operator must manually select existing group and confirm send.',
    };
  }

  if (channel === 'facebook') {
    const candidate = destinationIdentifier.trim() || settings.authorizedChannelUrls.facebook;
    const check = validateSafeExternalUrl(candidate, ['https:']);
    if (!check.valid || !check.normalizedUrl) {
      return {
        url: null,
        isSupported: false,
        note: 'Configure a validated https:// authorized Facebook Page URL on the destination or in Settings.',
      };
    }
    return {
      url: check.normalizedUrl,
      isSupported: true,
      note: 'Copies content & opens authorized Facebook Page for manual publishing.',
    };
  }

  if (channel === 'messenger') {
    const candidate = destinationIdentifier.trim() || settings.authorizedChannelUrls.messenger;
    const check = validateSafeExternalUrl(candidate, ['https:']);
    if (!check.valid || !check.normalizedUrl) {
      return {
        url: null,
        isSupported: false,
        note: 'Configure a validated https:// Messenger thread or entry URL (no unrestricted recipient promise).',
      };
    }
    return {
      url: check.normalizedUrl,
      isSupported: true,
      note: 'Copies content & opens configured Messenger conversation entry point.',
    };
  }

  // 'other'
  const candidate = destinationIdentifier.trim() || settings.authorizedChannelUrls.other;
  const check = validateSafeExternalUrl(candidate, ['https:']);
  if (!check.valid || !check.normalizedUrl) {
    return {
      url: null,
      isSupported: false,
      note: 'Configure a valid https:// URL for this custom destination (copy-only supported otherwise).',
    };
  }
  return {
    url: check.normalizedUrl,
    isSupported: true,
    note: 'Generic copy-and-open workflow for configured https:// destination.',
  };
}

/**
 * Checks whether a draft or queue record is stale against the latest canonical bulletin source.
 */
export function isRecordStaleAgainstSource(
  recordSourceFingerprint: string,
  latestSourceFingerprint: string
): boolean {
  return Boolean(recordSourceFingerprint && latestSourceFingerprint && recordSourceFingerprint !== latestSourceFingerprint);
}

/**
 * Checks whether the canonical bulletin source itself is marked as STALE
 * (e.g., unsaved bulletin edits, or outdated magnitude/picks relative to active solution).
 */
export function isSourceMarkedStale(source: CanonicalBulletinSource): boolean {
  return (
    source.sourceStatus === 'STALE_SOURCE' ||
    source.isStaleOrEdited ||
    source.warnings.includes('STALE_SOURCE')
  );
}

export type PrepareDispatchBlockReasonCode =
  | 'SOURCE_MARKED_STALE'
  | 'DRAFT_STALE_AGAINST_SOURCE'
  | 'REVISION_MISMATCH'
  | 'NO_RECIPIENTS_SELECTED'
  | 'PUBLIC_RELEASE_UNVERIFIED_SOURCE'
  | 'PUBLIC_RELEASE_AUTH_REQUIRED'
  | 'X_CHAR_LIMIT_EXCEEDED';

export interface PrepareDispatchValidationResult {
  canDispatch: boolean;
  isSourceStale: boolean;
  isDraftStale: boolean;
  hasRevisionMismatch: boolean;
  blockingCodes: PrepareDispatchBlockReasonCode[];
  blockingReasons: string[];
  primaryBlockingReason: string | null;
}

/**
 * Client-side revision protection and pre-dispatch validation for Section A (Prepare Message).
 * Explicitly blocks staging/dispatching whenever the bulletin source is marked STALE,
 * the draft fingerprint is stale against source, bulletin revisions mismatch,
 * or public release / X length rules are not satisfied.
 */
export function validatePrepareMessageForDispatch(params: {
  source: CanonicalBulletinSource;
  draft: CommunicationDraftSnapshot;
  selectedDestinations: CommunicationDestination[];
  xMaxChars: number;
}): PrepareDispatchValidationResult {
  const { source, draft, selectedDestinations, xMaxChars } = params;
  const blockingCodes: PrepareDispatchBlockReasonCode[] = [];
  const blockingReasons: string[] = [];

  const isSourceStale = isSourceMarkedStale(source);
  const isDraftStale = isRecordStaleAgainstSource(
    draft.sourceFingerprint,
    source.sourceFingerprint
  );
  const hasRevisionMismatch =
    draft.sourceBulletinId !== source.bulletinId ||
    draft.sourceBulletinRevision !== source.bulletinRevision;

  if (isSourceStale) {
    blockingCodes.push('SOURCE_MARKED_STALE');
    blockingReasons.push(
      `Dispatch blocked by revision protection: bulletin source ${source.bulletinId} (${source.bulletinRevision}) is marked as STALE (${source.sourceStatusLabel}). Save or recalculate the bulletin before dispatching.`
    );
  }

  if (isDraftStale) {
    blockingCodes.push('DRAFT_STALE_AGAINST_SOURCE');
    blockingReasons.push(
      `Message draft is stale against the latest bulletin source (${draft.sourceFingerprint} vs ${source.sourceFingerprint}). Regenerate the message from source first.`
    );
  }

  if (hasRevisionMismatch && !isDraftStale) {
    blockingCodes.push('REVISION_MISMATCH');
    blockingReasons.push(
      `Draft bulletin revision (${draft.sourceBulletinId} / ${draft.sourceBulletinRevision}) does not match active source (${source.bulletinId} / ${source.bulletinRevision}). Regenerate message before dispatching.`
    );
  }

  if (draft.classification === 'public_release') {
    if (!source.isReleasedSource) {
      blockingCodes.push('PUBLIC_RELEASE_UNVERIFIED_SOURCE');
      blockingReasons.push(
        'Public release staging is blocked because the canonical bulletin source is draft/unverified or stale.'
      );
    } else if (!draft.localAuthorization?.authorized) {
      blockingCodes.push('PUBLIC_RELEASE_AUTH_REQUIRED');
      blockingReasons.push(
        'Public release staging requires recording a Local Authorization check first.'
      );
    }
  }

  if (selectedDestinations.length === 0) {
    blockingCodes.push('NO_RECIPIENTS_SELECTED');
    blockingReasons.push(
      'Select at least one active destination or distribution group before staging to Dispatch Queue.'
    );
  } else {
    const hasX = selectedDestinations.some((d) => d.channel === 'x_twitter');
    if (hasX) {
      const xCheck = validateXPostLength(draft.body, xMaxChars);
      if (!xCheck.valid) {
        blockingCodes.push('X_CHAR_LIMIT_EXCEEDED');
        blockingReasons.push(
          `X/Twitter post exceeds ${xCheck.maxChars} characters by ${xCheck.overflow}. Shorten message or switch template.`
        );
      }
    }
  }

  return {
    canDispatch: blockingCodes.length === 0,
    isSourceStale,
    isDraftStale,
    hasRevisionMismatch,
    blockingCodes,
    blockingReasons,
    primaryBlockingReason: blockingReasons[0] ?? null,
  };
}

/**
 * Escapes CSV cell with strict spreadsheet-formula injection protection.
 * Prefixes cells starting with =, +, -, @, tab, or CR (even after leading spaces) with a single quote.
 */
export function escapeFormulaSafeCsvCell(
  value: string | number | boolean | null | undefined
): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const formulaSafe = /^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}

export function exportDispatchHistoryCsv(records: DispatchRecord[]): string {
  const headers = [
    'Dispatch ID',
    'Event Key',
    'Bulletin ID',
    'Bulletin Revision',
    'Comm Revision',
    'Destination',
    'Identifier',
    'Channel',
    'Classification',
    'Status',
    'Confirmation',
    'Operator',
    'Sent Confirmed At',
    'Last Action At',
    'External Ref',
    'Notes',
    'Message Preview',
  ];
  const rows = records.map((r) =>
    [
      r.dispatchId,
      r.eventKey,
      r.sourceBulletinId,
      r.sourceBulletinRevision,
      r.communicationRevisionId,
      r.destinationName,
      r.destinationIdentifier,
      CHANNEL_LABELS[r.channel],
      r.classification,
      r.status,
      r.confirmationAuthenticityLabel,
      r.operatorLabel,
      r.sentConfirmedAt ?? '',
      r.lastActionAt,
      r.externalReference ?? '',
      r.notes ?? '',
      r.messageSnapshot.replace(/\r?\n/g, ' | ').slice(0, 240),
    ]
      .map(escapeFormulaSafeCsvCell)
      .join(',')
  );

  return [headers.map(escapeFormulaSafeCsvCell).join(','), ...rows].join('\r\n');
}

const MANILA_HUMAN_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatCsvManilaTimestamp(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  try {
    const parts = MANILA_HUMAN_TIMESTAMP_FORMATTER.formatToParts(dt);
    const getPart = (t: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === t)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')} PHT`;
  } catch {
    return iso;
  }
}

/**
 * Filters and deduplicates dispatch history records matching today's date in Asia/Manila (PHT),
 * sorted newest first.
 */
export function filterTodayDispatchHistoryRecords(
  records: DispatchRecord[],
  now: Date = new Date()
): { dateKeyPht: string; records: DispatchRecord[] } {
  const dateKeyPht = getManilaDateKey(now) || '';
  const uniqueById = new Map<string, DispatchRecord>();

  for (const r of records) {
    const ts = r.sentConfirmedAt || r.lastActionAt || r.createdAt;
    const recordDay = getManilaDateKey(ts) || getManilaDateKey(r.createdAt);
    if (!recordDay || recordDay !== dateKeyPht) continue;
    const existing = uniqueById.get(r.dispatchId);
    if (
      !existing ||
      r.status === 'OPERATOR_CONFIRMED_SENT' ||
      ts >= (existing.sentConfirmedAt || existing.lastActionAt || existing.createdAt)
    ) {
      uniqueById.set(r.dispatchId, r);
    }
  }

  const sorted = Array.from(uniqueById.values()).sort((a, b) => {
    const aTime = a.sentConfirmedAt || a.lastActionAt || a.createdAt;
    const bTime = b.sentConfirmedAt || b.lastActionAt || b.createdAt;
    return bTime.localeCompare(aTime);
  });

  return { dateKeyPht, records: sorted };
}

/**
 * Generates an Excel/Calc-ready UTF-8 BOM + CRLF CSV report for today's dispatch history
 * with strict formula-injection escaping on every cell.
 */
export function exportTodayChannelReportCsv(
  records: DispatchRecord[],
  now: Date = new Date()
): { csv: string; filename: string; dateKeyPht: string; rowCount: number } {
  const { dateKeyPht, records: todayRecords } = filterTodayDispatchHistoryRecords(records, now);
  const headers = [
    'Channel',
    'Destination',
    'Identifier',
    'Status',
    'Confirmation Label',
    'Dispatch ID',
    'Event Key',
    'Bulletin ID',
    'Bulletin Revision',
    'Comm Revision',
    'Classification',
    'Operator',
    'Timestamp (Asia/Manila PHT)',
    'Sent Confirmed At (ISO)',
    'Last Action At (ISO)',
    'External Ref',
    'Notes',
    'Subject',
    'Message Snapshot',
  ];

  const rows = todayRecords.map((r) =>
    [
      CHANNEL_LABELS[r.channel],
      r.destinationName,
      r.destinationIdentifier,
      r.status,
      r.confirmationAuthenticityLabel,
      r.dispatchId,
      r.eventKey,
      r.sourceBulletinId,
      r.sourceBulletinRevision,
      r.communicationRevisionId,
      r.classification,
      r.operatorLabel,
      formatCsvManilaTimestamp(r.sentConfirmedAt || r.lastActionAt),
      r.sentConfirmedAt ?? '',
      r.lastActionAt,
      r.externalReference ?? '',
      r.notes ?? '',
      r.subjectSnapshot,
      r.messageSnapshot.replace(/\r?\n/g, ' | '),
    ]
      .map(escapeFormulaSafeCsvCell)
      .join(',')
  );

  const csvBody = [headers.map(escapeFormulaSafeCsvCell).join(','), ...rows].join('\r\n');
  return {
    csv: `\uFEFF${csvBody}`,
    filename: `eqp_channel_export_${dateKeyPht || 'today'}.csv`,
    dateKeyPht,
    rowCount: todayRecords.length,
  };
}

const MANILA_DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Formats an ISO string or Date as YYYY-MM-DD in Asia/Manila (PHT).
 */
export function getManilaDateKey(input: Date | string): string | null {
  try {
    const dt = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(dt.getTime())) return null;
    return MANILA_DATE_KEY_FORMATTER.format(dt);
  } catch {
    return null;
  }
}

export interface TodayDispatchStats {
  dateKeyPht: string;
  attemptedToday: number;
  failedToday: number;
  confirmedSentToday: number;
  pendingPreparedToday: number;
  cancelledToday: number;
}

/**
 * Computes deduplicated today's communication stats (Asia/Manila day) across Queue & History.
 */
export function computeTodayDispatchStats(
  queue: DispatchRecord[],
  history: DispatchRecord[],
  now: Date = new Date()
): TodayDispatchStats {
  const dateKeyPht = getManilaDateKey(now) || '';
  const uniqueById = new Map<string, DispatchRecord>();

  for (const r of queue) {
    uniqueById.set(r.dispatchId, r);
  }
  for (const r of history) {
    const existing = uniqueById.get(r.dispatchId);
    if (
      !existing ||
      r.status === 'OPERATOR_CONFIRMED_SENT' ||
      r.lastActionAt >= existing.lastActionAt
    ) {
      uniqueById.set(r.dispatchId, r);
    }
  }

  let attemptedToday = 0;
  let failedToday = 0;
  let confirmedSentToday = 0;
  let pendingPreparedToday = 0;
  let cancelledToday = 0;

  for (const r of uniqueById.values()) {
    const recordDay = getManilaDateKey(r.lastActionAt) || getManilaDateKey(r.createdAt);
    if (!recordDay || recordDay !== dateKeyPht) continue;

    if (r.status === 'OPERATOR_CONFIRMED_SENT') {
      confirmedSentToday += 1;
      attemptedToday += 1;
    } else if (r.status === 'FAILED') {
      failedToday += 1;
      attemptedToday += 1;
    } else if (r.status === 'OPENED_EXTERNALLY') {
      attemptedToday += 1;
    } else if (r.status === 'PREPARED') {
      pendingPreparedToday += 1;
    } else if (r.status === 'CANCELLED') {
      cancelledToday += 1;
    }
  }

  return {
    dateKeyPht,
    attemptedToday,
    failedToday,
    confirmedSentToday,
    pendingPreparedToday,
    cancelledToday,
  };
}

export interface DispatchQueueFilterOptions {
  statusFilter?: 'ALL' | DispatchStatus;
  channelFilter?: 'ALL' | CommunicationChannel;
  selectedStatuses?: ReadonlyArray<DispatchStatus> | null;
  selectedChannels?: ReadonlyArray<CommunicationChannel> | null;
  activeEventKey?: string | null;
}

/**
 * Filters dispatch queue records by active event scope, dispatch status(es), and communication channel(s).
 */
export function filterDispatchQueueRecords(
  records: DispatchRecord[],
  options: DispatchQueueFilterOptions
): DispatchRecord[] {
  const {
    statusFilter = 'ALL',
    channelFilter = 'ALL',
    selectedStatuses = null,
    selectedChannels = null,
    activeEventKey = null,
  } = options;
  return records.filter((item) => {
    if (activeEventKey && item.eventKey !== activeEventKey) return false;
    if (Array.isArray(selectedStatuses)) {
      if (!selectedStatuses.includes(item.status)) return false;
    } else if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }
    if (Array.isArray(selectedChannels)) {
      if (!selectedChannels.includes(item.channel)) return false;
    } else if (channelFilter !== 'ALL' && item.channel !== channelFilter) {
      return false;
    }
    return true;
  });
}

export const DISPATCH_QUEUE_FILTER_SESSION_KEY = 'eqp_com1_dispatch_queue_filters_v1';

export interface DispatchQueueFilterSessionState {
  selectedStatuses: DispatchStatus[];
  selectedChannels: CommunicationChannel[];
  activeEventOnly: boolean;
}

export function createDefaultDispatchQueueFilterState(): DispatchQueueFilterSessionState {
  return {
    selectedStatuses: [...DISPATCH_STATUS_ORDER],
    selectedChannels: [...COMMUNICATION_CHANNEL_ORDER],
    activeEventOnly: false,
  };
}

export function toggleFilterItem<T extends string>(
  current: ReadonlyArray<T>,
  item: T,
  canonicalOrder: ReadonlyArray<T>
): T[] {
  const nextSet = new Set(current);
  if (nextSet.has(item)) {
    nextSet.delete(item);
  } else {
    nextSet.add(item);
  }
  return canonicalOrder.filter((entry) => nextSet.has(entry));
}

export function sanitizeDispatchQueueFilterState(
  raw: unknown
): DispatchQueueFilterSessionState {
  const defaults = createDefaultDispatchQueueFilterState();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const obj = raw as Partial<DispatchQueueFilterSessionState>;

  const validStatuses = new Set<DispatchStatus>(DISPATCH_STATUS_ORDER);
  const selectedStatuses = Array.isArray(obj.selectedStatuses)
    ? DISPATCH_STATUS_ORDER.filter(
        (s) => validStatuses.has(s) && obj.selectedStatuses!.includes(s)
      )
    : defaults.selectedStatuses;

  const validChannels = new Set<CommunicationChannel>(COMMUNICATION_CHANNEL_ORDER);
  const selectedChannels = Array.isArray(obj.selectedChannels)
    ? COMMUNICATION_CHANNEL_ORDER.filter(
        (c) => validChannels.has(c) && obj.selectedChannels!.includes(c)
      )
    : defaults.selectedChannels;

  return {
    selectedStatuses,
    selectedChannels,
    activeEventOnly: Boolean(obj.activeEventOnly),
  };
}

export function loadDispatchQueueFilterSessionState(
  storage?: Pick<Storage, 'getItem'> | null
): DispatchQueueFilterSessionState {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
        ? window.sessionStorage
        : null;
    if (!store) return createDefaultDispatchQueueFilterState();
    const raw = store.getItem(DISPATCH_QUEUE_FILTER_SESSION_KEY);
    if (!raw) return createDefaultDispatchQueueFilterState();
    return sanitizeDispatchQueueFilterState(JSON.parse(raw));
  } catch {
    return createDefaultDispatchQueueFilterState();
  }
}

export function saveDispatchQueueFilterSessionState(
  state: DispatchQueueFilterSessionState,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
        ? window.sessionStorage
        : null;
    if (!store) return;
    store.setItem(
      DISPATCH_QUEUE_FILTER_SESSION_KEY,
      JSON.stringify(sanitizeDispatchQueueFilterState(state))
    );
  } catch {
    // Ignore storage errors (e.g., private browsing / quota)
  }
}

export interface DispatchQueueFilterCounts {
  totalInScope: number;
  byStatus: Record<DispatchStatus, number>;
  byChannel: Record<CommunicationChannel, number>;
}

/**
 * Computes dispatch status and communication channel counts across records in scope.
 */
export function computeDispatchQueueFilterCounts(
  records: DispatchRecord[],
  activeEventKey?: string | null
): DispatchQueueFilterCounts {
  const inScope = activeEventKey
    ? records.filter((item) => item.eventKey === activeEventKey)
    : records;

  const byStatus: Record<DispatchStatus, number> = {
    PREPARED: 0,
    OPENED_EXTERNALLY: 0,
    OPERATOR_CONFIRMED_SENT: 0,
    FAILED: 0,
    CANCELLED: 0,
  };
  const byChannel: Record<CommunicationChannel, number> = {
    viber: 0,
    facebook: 0,
    messenger: 0,
    x_twitter: 0,
    email: 0,
    other: 0,
  };

  for (const item of inScope) {
    byStatus[item.status] += 1;
    byChannel[item.channel] += 1;
  }

  return {
    totalInScope: inScope.length,
    byStatus,
    byChannel,
  };
}

const SENSITIVE_TOKEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /\bsk-[A-Za-z0-9]{12,}/,
  /\bghp_[A-Za-z0-9]{12,}/,
  /\bxox[bpa]-[A-Za-z0-9-]+/i,
  /\bAIza[0-9A-Za-z_-]{16,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /(?:^|[?&#\s])(?:access_token|oauth_token|api_key|apikey|client_secret|app_secret|password|auth_token|refresh_token|bearer)\s*[=:]/i,
];

/**
 * Detects credential/token patterns so Settings never persist sensitive access tokens.
 */
export function containsSensitiveTokenPattern(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return SENSITIVE_TOKEN_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Validates and normalizes an optional public X/Twitter handle (1-15 alphanumeric/underscore chars).
 */
export function validateXTwitterHandle(rawHandle: string): {
  valid: boolean;
  normalizedHandle: string;
  error: string | null;
} {
  const trimmed = rawHandle.trim();
  if (!trimmed) {
    return { valid: true, normalizedHandle: '', error: null };
  }
  if (containsSensitiveTokenPattern(trimmed)) {
    return {
      valid: false,
      normalizedHandle: '',
      error: 'Sensitive access tokens or credentials must never be entered in the X/Twitter handle field.',
    };
  }
  const cleanBody = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleanBody)) {
    return {
      valid: false,
      normalizedHandle: '',
      error: 'X/Twitter handle must be 1 to 15 letters, numbers, or underscores (e.g., @eqp_desk).',
    };
  }
  return {
    valid: true,
    normalizedHandle: `@${cleanBody}`,
    error: null,
  };
}

/**
 * Validates and normalizes public official handles for Viber, Facebook, Messenger, and X/Twitter.
 */
export function validatePublicChannelHandle(
  channel: 'viber' | 'facebook' | 'messenger' | 'x_twitter',
  rawHandle: string
): {
  valid: boolean;
  normalizedHandle: string;
  error: string | null;
} {
  if (channel === 'x_twitter') {
    return validateXTwitterHandle(rawHandle);
  }
  const trimmed = rawHandle.trim();
  if (!trimmed) {
    return { valid: true, normalizedHandle: '', error: null };
  }
  if (containsSensitiveTokenPattern(trimmed)) {
    return {
      valid: false,
      normalizedHandle: '',
      error: `Sensitive access tokens or credentials must never be entered in the ${CHANNEL_LABELS[channel]} handle field.`,
    };
  }
  if (/[:/?#=&]/.test(trimmed) || /\s/.test(trimmed)) {
    return {
      valid: false,
      normalizedHandle: '',
      error: `${CHANNEL_LABELS[channel]} handle must be a short public handle only (no spaces, URLs, or parameters).`,
    };
  }
  const cleanBody = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!/^[A-Za-z0-9._-]{2,64}$/.test(cleanBody)) {
    return {
      valid: false,
      normalizedHandle: '',
      error: `${CHANNEL_LABELS[channel]} handle must be 2 to 64 letters, numbers, dots, hyphens, or underscores.`,
    };
  }
  return {
    valid: true,
    normalizedHandle: `@${cleanBody}`,
    error: null,
  };
}

export interface SettingsValidationResult {
  valid: boolean;
  fieldErrors: Partial<
    Record<
      | 'xHandle'
      | 'handle_viber'
      | 'handle_facebook'
      | 'handle_messenger'
      | 'handle_x_twitter'
      | 'officialBulletinUrl'
      | 'viber'
      | 'facebook'
      | 'messenger'
      | 'x_twitter'
      | 'other',
      string
    >
  >;
  normalizedSettings: CommsSettings;
}

/**
 * Strips any disallowed sensitive credential patterns before persisting CommsSettings locally.
 */
export function stripSensitiveCredentialsFromSettings(candidate: CommsSettings): CommsSettings {
  const safeString = (val: string | undefined): string => {
    const trimmed = (val ?? '').trim();
    return containsSensitiveTokenPattern(trimmed) ? '' : trimmed;
  };
  const resolvedXHandle = safeString(
    candidate.officialChannelHandles?.x_twitter || candidate.xHandle
  );
  return {
    defaultTemplateId: candidate.defaultTemplateId,
    defaultGroupId: safeString(candidate.defaultGroupId),
    defaultClassification: candidate.defaultClassification,
    operatorLabel: safeString(candidate.operatorLabel) || DEFAULT_COMMS_SETTINGS.operatorLabel,
    xHandle: resolvedXHandle,
    officialChannelHandles: {
      viber: safeString(candidate.officialChannelHandles?.viber),
      facebook: safeString(candidate.officialChannelHandles?.facebook),
      messenger: safeString(candidate.officialChannelHandles?.messenger),
      x_twitter: resolvedXHandle,
    },
    officialBulletinUrl: safeString(candidate.officialBulletinUrl),
    authorizedChannelUrls: {
      viber: safeString(candidate.authorizedChannelUrls?.viber),
      facebook: safeString(candidate.authorizedChannelUrls?.facebook),
      messenger: safeString(candidate.authorizedChannelUrls?.messenger),
      x_twitter: safeString(candidate.authorizedChannelUrls?.x_twitter),
      other: safeString(candidate.authorizedChannelUrls?.other),
    },
    xMaxChars: Math.max(80, Math.min(4000, Math.trunc(candidate.xMaxChars || 280))),
  };
}

/**
 * Validates platform destination URLs and official channel handles while rejecting any token-like strings.
 */
export function validateSettingsUrlsAndHandle(
  candidate: CommsSettings
): SettingsValidationResult {
  const fieldErrors: SettingsValidationResult['fieldErrors'] = {};

  const rawXHandle = candidate.officialChannelHandles?.x_twitter || candidate.xHandle || '';
  const xHandleCheck = validateXTwitterHandle(rawXHandle);
  if (!xHandleCheck.valid && xHandleCheck.error) {
    fieldErrors.xHandle = xHandleCheck.error;
    fieldErrors.handle_x_twitter = xHandleCheck.error;
  }

  const viberHandleCheck = validatePublicChannelHandle(
    'viber',
    candidate.officialChannelHandles?.viber ?? ''
  );
  if (!viberHandleCheck.valid && viberHandleCheck.error) {
    fieldErrors.handle_viber = viberHandleCheck.error;
  }

  const fbHandleCheck = validatePublicChannelHandle(
    'facebook',
    candidate.officialChannelHandles?.facebook ?? ''
  );
  if (!fbHandleCheck.valid && fbHandleCheck.error) {
    fieldErrors.handle_facebook = fbHandleCheck.error;
  }

  const msgHandleCheck = validatePublicChannelHandle(
    'messenger',
    candidate.officialChannelHandles?.messenger ?? ''
  );
  if (!msgHandleCheck.valid && msgHandleCheck.error) {
    fieldErrors.handle_messenger = msgHandleCheck.error;
  }

  const checkUrlField = (
    field: 'officialBulletinUrl' | 'viber' | 'facebook' | 'messenger' | 'x_twitter' | 'other',
    rawValue: string,
    allowedProtocols: ReadonlyArray<'https:' | 'viber:' | 'mailto:'>
  ): string => {
    const trimmed = rawValue.trim();
    if (!trimmed) return '';
    if (containsSensitiveTokenPattern(trimmed)) {
      fieldErrors[field] =
        'Sensitive access tokens, API keys, or query credentials are prohibited in Settings URLs.';
      return trimmed;
    }
    const check = validateSafeExternalUrl(trimmed, allowedProtocols);
    if (!check.valid || !check.normalizedUrl) {
      fieldErrors[field] =
        check.reason || `Must be a valid URL using ${allowedProtocols.join(' or ')}.`;
      return trimmed;
    }
    return check.normalizedUrl;
  };

  const normalizedOfficialUrl = checkUrlField(
    'officialBulletinUrl',
    candidate.officialBulletinUrl || '',
    ['https:']
  );
  const normalizedUrls = {
    viber: checkUrlField('viber', candidate.authorizedChannelUrls.viber || '', [
      'https:',
      'viber:',
    ]),
    facebook: checkUrlField('facebook', candidate.authorizedChannelUrls.facebook || '', [
      'https:',
    ]),
    messenger: checkUrlField('messenger', candidate.authorizedChannelUrls.messenger || '', [
      'https:',
    ]),
    x_twitter: checkUrlField('x_twitter', candidate.authorizedChannelUrls.x_twitter || '', [
      'https:',
    ]),
    other: checkUrlField('other', candidate.authorizedChannelUrls.other || '', ['https:']),
  };

  const normalizedXHandle = xHandleCheck.valid ? xHandleCheck.normalizedHandle : rawXHandle.trim();

  const normalizedSettings: CommsSettings = {
    ...candidate,
    operatorLabel: candidate.operatorLabel.trim() || DEFAULT_COMMS_SETTINGS.operatorLabel,
    xHandle: normalizedXHandle,
    officialChannelHandles: {
      viber: viberHandleCheck.valid
        ? viberHandleCheck.normalizedHandle
        : (candidate.officialChannelHandles?.viber ?? '').trim(),
      facebook: fbHandleCheck.valid
        ? fbHandleCheck.normalizedHandle
        : (candidate.officialChannelHandles?.facebook ?? '').trim(),
      messenger: msgHandleCheck.valid
        ? msgHandleCheck.normalizedHandle
        : (candidate.officialChannelHandles?.messenger ?? '').trim(),
      x_twitter: normalizedXHandle,
    },
    officialBulletinUrl: normalizedOfficialUrl,
    authorizedChannelUrls: normalizedUrls,
    xMaxChars: Math.max(80, Math.min(4000, Math.trunc(candidate.xMaxChars || 280))),
  };

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    normalizedSettings,
  };
}

