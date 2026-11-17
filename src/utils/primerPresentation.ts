import type { PrimerDocument } from './earthquakePrimer.ts';
import {
  APPROVED_GENERAL_TEMPLATES,
  type PrimerContentState,
} from './primerScientificNarratives.ts';
import { formatUtcAsPst } from './primerSequenceIntegration.ts';

export type PrimerPresentationMode = 'public-draft' | 'scientific-review';

export type PrimerDocumentSlotId =
  | 'overview_location'
  | 'epicenter_figure'
  | 'aftershocks'
  | 'intensity'
  | 'tsunami'
  | 'secondary_hazards'
  | 'volcano_considerations'
  | 'tectonic_setting'
  | 'historical_seismicity'
  | 'preparedness'
  | 'monitoring_response'
  | 'references';

export interface PrimerPresentationConfig {
  sectionOrder: PrimerDocumentSlotId[];
  hiddenSlotIds: PrimerDocumentSlotId[];
  headingStyle: 'question-and-answer' | 'technical-numbered';
  paperSize: 'a4-portrait';
}

export const CANONICAL_PRIMER_SLOT_ORDER: PrimerDocumentSlotId[] = [
  'overview_location',
  'epicenter_figure',
  'aftershocks',
  'intensity',
  'tsunami',
  'secondary_hazards',
  'volcano_considerations',
  'tectonic_setting',
  'historical_seismicity',
  'preparedness',
  'monitoring_response',
  'references',
];

export const DEFAULT_PRIMER_PRESENTATION_CONFIG: PrimerPresentationConfig = {
  sectionOrder: [...CANONICAL_PRIMER_SLOT_ORDER],
  hiddenSlotIds: [],
  headingStyle: 'question-and-answer',
  paperSize: 'a4-portrait',
};

export const PRIMER_SLOT_HEADINGS: Record<
  PrimerDocumentSlotId,
  {
    qaTitle: string;
    technicalTitle: string;
    shortLabel: string;
    optionalToggle: boolean;
  }
> = {
  overview_location: {
    qaTitle: 'What happened during the earthquake?',
    technicalTitle: 'Earthquake Overview & Location Parameters',
    shortLabel: 'Overview & Location',
    optionalToggle: false,
  },
  epicenter_figure: {
    qaTitle: 'Where was the earthquake epicenter located?',
    technicalTitle: 'Epicenter & Geographic Context Map',
    shortLabel: 'Epicenter Figure',
    optionalToggle: false,
  },
  aftershocks: {
    qaTitle: 'Are aftershocks occurring and how active is the sequence?',
    technicalTitle: 'Aftershock Activity & Quantitative Sequence Figures',
    shortLabel: 'Aftershocks & Figures',
    optionalToggle: false,
  },
  intensity: {
    qaTitle: 'How strongly was the earthquake felt?',
    technicalTitle: 'Reported & Instrumental Earthquake Intensities (PEIS)',
    shortLabel: 'Earthquake Intensities',
    optionalToggle: false,
  },
  tsunami: {
    qaTitle: 'Did this earthquake generate a tsunami?',
    technicalTitle: 'Tsunami & Sea-Level Monitoring Information',
    shortLabel: 'Tsunami Information',
    optionalToggle: true,
  },
  secondary_hazards: {
    qaTitle: 'What secondary earthquake hazards could occur?',
    technicalTitle: 'Secondary Earthquake Hazards Assessment',
    shortLabel: 'Secondary Hazards',
    optionalToggle: false,
  },
  volcano_considerations: {
    qaTitle: 'Could this earthquake trigger nearby volcanic activity?',
    technicalTitle: 'Volcano-Related Considerations',
    shortLabel: 'Volcano Considerations',
    optionalToggle: true,
  },
  tectonic_setting: {
    qaTitle: 'What geological structure may have generated this earthquake?',
    technicalTitle: 'Tectonic Setting & Candidate Earthquake Generators',
    shortLabel: 'Tectonic Setting',
    optionalToggle: false,
  },
  historical_seismicity: {
    qaTitle: 'Have significant earthquakes occurred in this region before?',
    technicalTitle: 'Historical Regional Seismicity',
    shortLabel: 'Historical Seismicity',
    optionalToggle: false,
  },
  preparedness: {
    qaTitle: 'What should the public do before, during, and after shaking?',
    technicalTitle: 'Public Safety & Preparedness Advisories',
    shortLabel: 'Public Safety & Preparedness',
    optionalToggle: false,
  },
  monitoring_response: {
    qaTitle: 'What is PHIVOLCS doing in response to this event?',
    technicalTitle: 'PHIVOLCS Monitoring & Response Activities',
    shortLabel: 'Monitoring & Response',
    optionalToggle: false,
  },
  references: {
    qaTitle: 'References and Data Sources',
    technicalTitle: 'References and Data Sources',
    shortLabel: 'References & Sources',
    optionalToggle: false,
  },
};

export function normalizePresentationConfig(
  partial?: Partial<PrimerPresentationConfig> | null
): PrimerPresentationConfig {
  const rawOrder = Array.isArray(partial?.sectionOrder) ? partial.sectionOrder : [];
  const validSeen = new Set<PrimerDocumentSlotId>();
  const normalizedOrder: PrimerDocumentSlotId[] = [];
  for (const id of rawOrder) {
    if (CANONICAL_PRIMER_SLOT_ORDER.includes(id) && !validSeen.has(id)) {
      validSeen.add(id);
      normalizedOrder.push(id);
    }
  }
  for (const id of CANONICAL_PRIMER_SLOT_ORDER) {
    if (!validSeen.has(id)) {
      normalizedOrder.push(id);
    }
  }

  const hiddenSlotIds = Array.isArray(partial?.hiddenSlotIds)
    ? partial.hiddenSlotIds.filter(
        (id): id is PrimerDocumentSlotId =>
          CANONICAL_PRIMER_SLOT_ORDER.includes(id) &&
          PRIMER_SLOT_HEADINGS[id].optionalToggle
      )
    : [];

  return {
    sectionOrder: normalizedOrder,
    hiddenSlotIds,
    headingStyle:
      partial?.headingStyle === 'technical-numbered'
        ? 'technical-numbered'
        : 'question-and-answer',
    paperSize: 'a4-portrait',
  };
}

export function isTsunamiSupportedForPrimer(primer: PrimerDocument): boolean {
  const pkg4 = primer.extensions?.scientificNarrativePackage;
  if (pkg4) {
    const tsu = pkg4.externalData.tsunami;
    if (
      tsu.state !== 'unavailable' ||
      tsu.officialAdvisoryId.trim() !== '' ||
      tsu.seaLevelObservations.length > 0
    ) {
      return true;
    }
  }
  return primer.extracted.tsunamiStatus !== 'None';
}

export function isVolcanoSupportedForPrimer(primer: PrimerDocument): boolean {
  const pkg4 = primer.extensions?.scientificNarrativePackage;
  if (pkg4) {
    return pkg4.externalData.volcano.includeSection;
  }
  return primer.extracted.isLocated;
}

export interface PrimerExportRevisionInfo {
  revisionId: string;
  revisionNumber: number;
  createdAtUtc: string;
  createdAtPst: string;
  description?: string;
  parentRevisionId?: string | null;
  restoredFromRevisionNumber?: number | null;
}

export interface PrimerFormattedHeaderMeta {
  modeLabel: string;
  draftStatusBanner: string;
  earthquakeDatePst: string;
  earthquakeDateUtc: string;
  originTimePst: string;
  originTimeUtc: string;
  magnitudeLabel: string;
  locationLabel: string;
  depthLabel: string;
  eventIdentifier: string;
  primerUpdatedUtc: string;
  primerUpdatedPst: string;
  catalogCutoffUtc: string | null;
  catalogCutoffPst: string | null;
  revisionNumberLabel: string | null;
  revisionCreatedUtc: string | null;
  revisionCreatedPst: string | null;
  revisionDescription: string | null;
  restoredFromLabel: string | null;
}

const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatIsoDateLong(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate || 'Unavailable';
  const [yyyy, mm, dd] = parts;
  const idx = Math.max(0, Math.min(11, (Number(mm) || 1) - 1));
  return `${Number(dd) || dd} ${MONTHS_FULL[idx]} ${yyyy}`;
}

export function formatTimePst12h(timeStr: string): string {
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === 'Unavailable') return 'Unavailable';
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  const h24 = Math.max(0, Math.min(23, Number(parts[0]) || 0));
  const mm = String(Math.max(0, Math.min(59, Number(parts[1]) || 0))).padStart(2, '0');
  const ss = parts[2]
    ? String(Math.max(0, Math.min(59, Math.round(Number(parts[2]) || 0)))).padStart(2, '0')
    : '00';
  const amPm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = String(h24 % 12 || 12).padStart(2, '0');
  return `${h12}:${mm}:${ss} ${amPm} PST (UTC+8)`;
}

export function formatTimeUtc24h(timeStr: string): string {
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === 'Unavailable') return 'Unavailable';
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  const hh = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  const ss = parts[2] ? parts[2].split('.')[0].padStart(2, '0') : '00';
  return `${hh}:${mm}:${ss} UTC`;
}

export function formatPrimerHeaderMetadata(
  primer: PrimerDocument,
  mode: PrimerPresentationMode,
  revisionInfo?: PrimerExportRevisionInfo
): PrimerFormattedHeaderMeta {
  const p = primer.extracted;
  const stage3 = primer.extensions?.sequenceHistoricalAnalysis;
  const stage4 = primer.extensions?.scientificNarrativePackage;

  const magnitudeLabel =
    p.magnitudeValue !== null && p.magnitudeScale
      ? `${p.magnitudeScale} ${p.magnitudeValue.toFixed(1)}`
      : `Pending (${primer.extracted.magnitudeScale ?? 'scale pending determination'})`;

  const locationLabel =
    p.isLocated && p.lat !== null && p.lon !== null
      ? `${p.primaryLocationLabel ?? 'Epicenter located'} (${p.lat.toFixed(3)}°N, ${p.lon.toFixed(3)}°E)`
      : 'Location Pending Determination';

  const depthLabel =
    p.depthKm !== null
      ? `${p.depthKm.toFixed(1)} km${p.depthFixed ? ' (fixed depth)' : ''}`
      : 'Depth Pending';

  const cutoffUtc =
    stage3?.statistics.dataCutoffUtc ?? stage4?.dataCutoffUtc ?? null;
  const cutoffPst =
    stage3?.statistics.dataCutoffPst ?? stage4?.dataCutoffPst ?? null;

  const revNum =
    revisionInfo?.revisionNumber ??
    primer.extensions?.reviewVersioning?.revisionNumber ??
    null;
  const restoredFromNum =
    revisionInfo?.restoredFromRevisionNumber ??
    primer.extensions?.reviewVersioning?.restoredFromRevisionNumber ??
    null;

  const revBannerSuffix = revisionInfo
    ? ` · HISTORICAL SNAPSHOT REV #${revisionInfo.revisionNumber}`
    : '';

  return {
    modeLabel:
      mode === 'public-draft'
        ? 'PUBLIC PRIMER DRAFT (UNRELEASED)'
        : 'SCIENTIFIC REVIEW COPY (INTERNAL DRAFT)',
    draftStatusBanner:
      (mode === 'public-draft'
        ? 'DRAFT EARTHQUAKE PRIMER — UNRELEASED PRE-PUBLICATION COPY · SUBJECT TO AUTHORIZED PHIVOLCS REVIEW'
        : 'DRAFT EARTHQUAKE PRIMER (SCIENTIFIC REVIEW COPY) — INTERNAL VERIFICATION & PROVENANCE EDITION · NOT FOR PUBLIC RELEASE') +
      revBannerSuffix,
    earthquakeDatePst: formatIsoDateLong(p.originDatePst),
    earthquakeDateUtc: formatIsoDateLong(p.originDateUtc),
    originTimePst: formatTimePst12h(p.originTimePst),
    originTimeUtc: formatTimeUtc24h(p.originTimeUtc),
    magnitudeLabel,
    locationLabel,
    depthLabel,
    eventIdentifier: `${p.eventId} (Bulletin No. ${p.bulletinNo})`,
    primerUpdatedUtc: primer.updatedAt,
    primerUpdatedPst: formatUtcAsPst(primer.updatedAt),
    catalogCutoffUtc: cutoffUtc,
    catalogCutoffPst: cutoffPst,
    revisionNumberLabel:
      revNum !== null ? `Rev #${revNum}${revisionInfo ? ` (${revisionInfo.revisionId})` : ''}` : null,
    revisionCreatedUtc: revisionInfo?.createdAtUtc ?? null,
    revisionCreatedPst: revisionInfo?.createdAtPst ?? null,
    revisionDescription: revisionInfo?.description?.trim() || null,
    restoredFromLabel:
      restoredFromNum !== null ? `Working draft restored from Rev #${restoredFromNum}` : null,
  };
}

export type PrimerFigureKey =
  | 'epicenter'
  | 'aftershockMap'
  | 'activityChart'
  | 'magnitudeChart';

export interface NumberedPrimerFigure {
  key: PrimerFigureKey;
  figureNumber: number | null;
  status: 'ready' | 'unavailable';
  title: string;
  caption: string;
  svgMarkup: string;
  unavailableReason?: string;
}

export function stripLeadingFigurePrefix(caption: string): string {
  return caption.replace(/^Figure\s+\d+\s*[.:—-]\s*/i, '').trim();
}

/**
 * Dynamically numbers actually included figures sequentially (Figure 1, Figure 2, ...)
 * without skipping numbers or fabricating empty placeholders.
 */
export function assignPrimerFigureNumbers(
  primer: PrimerDocument
): Record<PrimerFigureKey, NumberedPrimerFigure | null> {
  const fig1 = primer.extensions?.epicenterFigure ?? null;
  const pkg3 = primer.extensions?.sequenceHistoricalAnalysis ?? null;

  let nextNum = 1;
  const assign = (
    key: PrimerFigureKey,
    title: string,
    status: 'ready' | 'unavailable',
    svgMarkup: string,
    rawCaption: string,
    unavailableReason?: string
  ): NumberedPrimerFigure => {
    const cleaned = stripLeadingFigurePrefix(rawCaption);
    if (status === 'ready' && svgMarkup.trim()) {
      const n = nextNum++;
      return {
        key,
        figureNumber: n,
        status: 'ready',
        title,
        caption: `Figure ${n}. ${cleaned}`,
        svgMarkup,
      };
    }
    return {
      key,
      figureNumber: null,
      status: 'unavailable',
      title,
      caption: cleaned,
      svgMarkup: '',
      unavailableReason:
        unavailableReason || 'Insufficient verified data for figure generation.',
    };
  };

  return {
    epicenter: fig1
      ? assign(
          'epicenter',
          'Epicenter & Geographic Context Map',
          fig1.status,
          fig1.svgMarkup,
          fig1.caption,
          fig1.unavailableReason
        )
      : null,
    aftershockMap: pkg3
      ? assign(
          'aftershockMap',
          'Earthquake Sequence & Historical Seismicity Distribution',
          pkg3.figures.aftershockMap.status,
          pkg3.figures.aftershockMap.svgMarkup,
          pkg3.figures.aftershockMap.caption,
          pkg3.figures.aftershockMap.unavailableReason
        )
      : null,
    activityChart: pkg3
      ? assign(
          'activityChart',
          'Earthquake Activity Versus Time',
          pkg3.figures.activityChart.status,
          pkg3.figures.activityChart.svgMarkup,
          pkg3.figures.activityChart.caption,
          pkg3.figures.activityChart.unavailableReason
        )
      : null,
    magnitudeChart: pkg3
      ? assign(
          'magnitudeChart',
          'Catalog Magnitude Distribution',
          pkg3.figures.magnitudeChart.status,
          pkg3.figures.magnitudeChart.svgMarkup,
          pkg3.figures.magnitudeChart.caption,
          pkg3.figures.magnitudeChart.unavailableReason
        )
      : null,
  };
}

export interface PrimerReferenceEntry {
  index: number;
  organizationOrAuthor: string;
  title: string;
  dateOrVersion: string | null;
  documentIdOrUrl: string | null;
  dataCutoff: string | null;
}

/**
 * Builds a deduplicated, non-fabricated References and Data Sources list
 * solely from genuine source metadata present in the PrimerDocument.
 */
export function buildPrimerReferenceList(
  primer: PrimerDocument
): PrimerReferenceEntry[] {
  const seenKeys = new Set<string>();
  const entries: PrimerReferenceEntry[] = [];

  const pushRef = (item: Omit<PrimerReferenceEntry, 'index'>) => {
    const key = [
      item.organizationOrAuthor.trim().toLowerCase(),
      item.title.trim().toLowerCase(),
      (item.documentIdOrUrl ?? '').trim().toLowerCase(),
      (item.dateOrVersion ?? '').trim().toLowerCase(),
    ].join('|');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    entries.push({
      index: entries.length + 1,
      ...item,
    });
  };

  const p = primer.extracted;
  pushRef({
    organizationOrAuthor: p.issuedBy
      ? `DOST-PHIVOLCS (${p.issuedBy})`
      : 'DOST-PHIVOLCS EQP Active Event Record',
    title: `Earthquake Information Bulletin No. ${p.bulletinNo} — Event ${p.eventId}`,
    dateOrVersion:
      p.originDateUtc !== 'Unavailable'
        ? `${p.originDateUtc} ${p.originTimeUtc} UTC`
        : null,
    documentIdOrUrl: `Event ID: ${p.eventId} (Source file: ${p.filename})`,
    dataCutoff: null,
  });

  const fig1 = primer.extensions?.epicenterFigure;
  if (fig1) {
    pushRef({
      organizationOrAuthor: 'EQP Modern Built-In Geographic Layer',
      title: fig1.provenance.basemapSource,
      dateOrVersion: `Generated ${fig1.provenance.generatedAt}`,
      documentIdOrUrl:
        fig1.provenance.dataSources.length > 0
          ? fig1.provenance.dataSources.join('; ')
          : null,
      dataCutoff: null,
    });
  }

  const stage3 = primer.extensions?.sequenceHistoricalAnalysis;
  if (stage3) {
    pushRef({
      organizationOrAuthor: stage3.provenance.sourceLabel,
      title: `Earthquake Catalog Records for Sequence & Historical Analysis (${stage3.provenance.catalogCount} records)`,
      dateOrVersion: `Catalog v${stage3.provenance.catalogVersion}`,
      documentIdOrUrl:
        stage3.provenance.coverage.sources.length > 0
          ? `Sources: ${stage3.provenance.coverage.sources.map((s) => s.source).join(', ')}`
          : null,
      dataCutoff: `${stage3.statistics.dataCutoffPst} / ${stage3.statistics.dataCutoffUtc}`,
    });
  }

  const stage4 = primer.extensions?.scientificNarrativePackage;
  if (stage4) {
    for (const rec of stage4.provenanceLedger) {
      if (rec.contentState === 'unavailable-or-unresolved') continue;
      if (rec.claimKey === 'overview.eventParameters') continue; // already added above
      pushRef({
        organizationOrAuthor: rec.sourceIdentity,
        title: `Verified/Preliminary Source Record (${rec.claimKey})`,
        dateOrVersion:
          rec.observationOrBulletinTimestamp ?? rec.sourceRevision ?? null,
        documentIdOrUrl: rec.sourceReference || null,
        dataCutoff: rec.dataCutoffTimestamp || null,
      });
    }

    pushRef({
      organizationOrAuthor: 'EQP Modern Primer Standard Guidance Templates',
      title: 'General Earthquake Hazards & Public Preparedness Educational Templates',
      dateOrVersion: stage4.templateVersion,
      documentIdOrUrl: null,
      dataCutoff: null,
    });
  } else {
    pushRef({
      organizationOrAuthor: 'EQP Modern Primer Standard Guidance Templates',
      title: 'General Earthquake Hazards & Public Preparedness Educational Templates',
      dateOrVersion: APPROVED_GENERAL_TEMPLATES.version,
      documentIdOrUrl: null,
      dataCutoff: null,
    });
  }

  return entries;
}

export interface PrimerReadinessSummary {
  populatedCount: number;
  totalSections: number;
  readyForReviewCount: number;
  requiresInfoCount: number;
  requiresScientificReviewCount: number;
  staleIndicators: string[];
  availableFigures: Array<{
    key: PrimerFigureKey;
    label: string;
    figureNumber: number | null;
    status: 'ready' | 'unavailable';
    reason?: string;
  }>;
  readyFigureCount: number;
  totalFigureSlots: number;
  exportIssues: string[];
  disclaimer: string;
}

export function computePrimerReadinessSummary(
  primer: PrimerDocument,
  options: {
    currentEventFingerprint?: string;
    currentStage3Fingerprint?: string;
    currentStage4Fingerprint?: string;
    isPlotResultStale?: boolean;
  } = {}
): PrimerReadinessSummary {
  let populatedCount = 0;
  let readyForReviewCount = 0;
  let requiresInfoCount = 0;
  let requiresScientificReviewCount = 0;

  for (const sec of primer.sections) {
    if (sec.content.trim().length > 0 && sec.contentState !== 'unavailable-or-unresolved') {
      populatedCount++;
    }
    if (sec.reviewStatus === 'ready-for-review') readyForReviewCount++;
    else if (sec.reviewStatus === 'requires-info') requiresInfoCount++;
    else requiresScientificReviewCount++;
  }

  const staleIndicators: string[] = [];
  if (options.isPlotResultStale) {
    staleIndicators.push('PLOT hypocenter solution is stale relative to edited phase picks');
  }
  const fig1 = primer.extensions?.epicenterFigure;
  if (
    fig1 &&
    (fig1.provenance.sourceSolutionStatus === 'stale' ||
      (options.currentEventFingerprint &&
        fig1.provenance.sourceEventFingerprint !== options.currentEventFingerprint))
  ) {
    staleIndicators.push('Stage 2 epicenter map figure is stale vs. active event');
  }

  const stage3 = primer.extensions?.sequenceHistoricalAnalysis;
  if (
    stage3 &&
    options.currentStage3Fingerprint &&
    stage3.provenance.inputFingerprint !== options.currentStage3Fingerprint
  ) {
    staleIndicators.push('Stage 3 aftershock & historical package is stale');
  }

  const stage4 = primer.extensions?.scientificNarrativePackage;
  if (
    stage4 &&
    options.currentStage4Fingerprint &&
    stage4.inputFingerprint !== options.currentStage4Fingerprint
  ) {
    staleIndicators.push('Stage 4 scientific narrative package inputs changed');
  }

  const numberedFigs = assignPrimerFigureNumbers(primer);
  const availableFigures: PrimerReadinessSummary['availableFigures'] = [];
  const candidates: Array<{ key: PrimerFigureKey; label: string }> = [
    { key: 'epicenter', label: 'Epicenter & Geographic Context Map' },
    { key: 'aftershockMap', label: 'Sequence & Historical Seismicity Map' },
    { key: 'activityChart', label: 'Earthquake Activity vs. Time Chart' },
    { key: 'magnitudeChart', label: 'Catalog Magnitude Distribution Chart' },
  ];

  for (const item of candidates) {
    const rec = numberedFigs[item.key];
    if (!rec) {
      availableFigures.push({
        key: item.key,
        label: item.label,
        figureNumber: null,
        status: 'unavailable',
        reason: 'Not yet generated',
      });
    } else {
      availableFigures.push({
        key: item.key,
        label: item.label,
        figureNumber: rec.figureNumber,
        status: rec.status,
        reason: rec.unavailableReason,
      });
    }
  }

  const readyFigureCount = availableFigures.filter((f) => f.status === 'ready').length;

  const exportIssues: string[] = [];
  if (!primer.extracted.isLocated) {
    exportIssues.push('Event epicenter location is pending');
  }
  if (primer.extracted.magnitudeValue === null) {
    exportIssues.push('Magnitude value is pending determination');
  }
  if (!fig1 || fig1.status !== 'ready') {
    exportIssues.push('Epicenter map figure unavailable for export');
  }
  if (primer.extracted.unverifiedIntensityCount > 0) {
    exportIssues.push(
      `${primer.extracted.unverifiedIntensityCount} intensity report(s) excluded pending verification`
    );
  }
  for (const s of staleIndicators) {
    exportIssues.push(s);
  }

  return {
    populatedCount,
    totalSections: primer.sections.length,
    readyForReviewCount,
    requiresInfoCount,
    requiresScientificReviewCount,
    staleIndicators,
    availableFigures,
    readyFigureCount,
    totalFigureSlots: availableFigures.length,
    exportIssues,
    disclaimer:
      'Document-preparation indicator only — NOT a formal scientific approval or publication authorization.',
  };
}

export function buildPrimerExportFilename(
  primer: PrimerDocument,
  mode: PrimerPresentationMode,
  ext: 'html' | 'pdf',
  revisionInfo?: Pick<PrimerExportRevisionInfo, 'revisionNumber'>
): string {
  const datePart =
    primer.extracted.originDatePst && primer.extracted.originDatePst !== 'Unavailable'
      ? primer.extracted.originDatePst.replace(/[^0-9-]/g, '')
      : primer.extracted.originDateUtc.replace(/[^0-9-]/g, '') || 'UNDATED';
  const safeEventId = primer.eventId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const revTag = revisionInfo ? `_REV${revisionInfo.revisionNumber}` : '';
  const modeTag =
    mode === 'public-draft' ? 'PUBLIC_DRAFT' : 'SCIENTIFIC_REVIEW_DRAFT';
  return `PHIVOLCS_EQ_PRIMER_${datePart}_${safeEventId}_B${primer.bulletinNo}${revTag}_${modeTag}.${ext}`;
}

export function getContentStateLabel(state: PrimerContentState): string {
  if (state === 'verified-fact') return 'Verified Event Fact';
  if (state === 'approved-general-template') return 'General Scientific / Preparedness Guidance';
  if (state === 'preliminary-review') return 'Preliminary / Pending Scientific Review';
  return 'Information Unavailable / Pending Verification';
}

export function resolveSlotHeading(
  slotId: PrimerDocumentSlotId,
  style: PrimerPresentationConfig['headingStyle'],
  displayNumber: number
): string {
  const meta = PRIMER_SLOT_HEADINGS[slotId];
  const baseTitle =
    style === 'question-and-answer' ? meta.qaTitle : meta.technicalTitle;
  return `${displayNumber}. ${baseTitle}`;
}
