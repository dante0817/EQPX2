import {
  ACTIVE_VOLCANOES,
  type EQPEvent,
  isEventUnlocated,
  type PeisRoman,
} from '../data/eqpData.ts';
import {
  analyzeIntensityEntries,
  formatGroupedBulletinIntensityBlock,
  PEIS_DESCRIPTORS,
  PEIS_RANK,
} from './intensityFormat.ts';
import { computeDistanceAndBearing } from './nearestPlaces.ts';
import {
  computePrimerEventFingerprint,
  type PrimerMapFigureRecord,
} from './primerMapFigure.ts';
import {
  formatUtcAsPst,
  type PrimerStage3Package,
} from './primerSequenceIntegration.ts';

export const STAGE4_TEMPLATE_VERSION = 'eqp-primer-templates-v1.0';

export type PrimerSectionKey =
  | 'overview'
  | 'location'
  | 'aftershocks'
  | 'intensity'
  | 'tectonic_setting'
  | 'hazards'
  | 'recommendations';

export type PrimerSectionReviewState =
  | 'ready-for-review'
  | 'requires-info'
  | 'requires-scientific-review';

/**
 * Four explicit content states mandated for scientific traceability:
 * - verified-fact: Confirmed from adopted EQPEvent, Stage 2 verified geo, Stage 3 reviewed catalog, verified PEIS, or official bulletin metadata.
 * - approved-general-template: Versioned general educational/scientific guidance (PHIVOLCS-aligned, original wording).
 * - preliminary-review: Candidate or preliminary information pending scientific/specialist validation.
 * - unavailable-or-unresolved: Missing, unlocated, or unresolved data (never converted into a confirmed negative).
 */
export type PrimerContentState =
  | 'verified-fact'
  | 'approved-general-template'
  | 'preliminary-review'
  | 'unavailable-or-unresolved';

export type PrimerTsunamiState =
  | 'official-warning-or-advisory'
  | 'official-no-tsunami'
  | 'awaiting-verification'
  | 'unavailable';

export type PrimerHazardCategory =
  | 'ground_shaking'
  | 'landslides'
  | 'liquefaction'
  | 'coastal_hazards'
  | 'structural_damage';

export interface PrimerSeaLevelObservation {
  id: string;
  stationName: string;
  maxWaveHeightM: string;
  observedAtUtc: string;
  observationType: 'tide-gauge' | 'tsunami-buoy' | 'eyewitness-verified' | 'other';
  sourceRef: string;
  reviewStatus: PrimerSectionReviewState;
}

export interface PrimerTsunamiInformation {
  state: PrimerTsunamiState;
  officialAdvisoryId: string;
  issuingAgency: string;
  advisoryStatusAsOfTime: string;
  issuedAt: string;
  cancelledAt: string;
  affectedCoastalAreas: string;
  sourceDocumentRef: string;
  seaLevelObservations: PrimerSeaLevelObservation[];
  notes: string;
}

export interface PrimerTectonicExpertData {
  expertInterpretation: string;
  evidenceReferences: string;
  reviewerName: string;
  reviewStatus: 'requires-scientific-review' | 'ready-for-review';
}

export interface PrimerVerifiedHazardObservation {
  id: string;
  hazardType: PrimerHazardCategory;
  location: string;
  observedAtUtc: string;
  description: string;
  source: string;
  reviewStatus: PrimerSectionReviewState;
}

export interface PrimerVolcanoConsiderationData {
  includeSection: boolean;
  expertStatement: string;
  citedMonitoringObservations: string;
  reviewStatus: PrimerSectionReviewState;
}

export interface PrimerMonitoringResponseData {
  monitoringActivities: string;
  fieldInvestigations: string;
  qrtDeployments: string;
  lguAgencyCoordination: string;
  publishedProducts: string;
  monitoringFacilitiesOrStations: string;
  sourceRef: string;
  reviewStatus: PrimerSectionReviewState;
}

export interface PrimerR3TransferProvenanceLink {
  transferId: string;
  findingId: string;
  sourceId: string;
  sourceTitle: string;
  sourceOrganization: string;
  sourceUrl: string | null;
  sourceVersionNumber: number;
  sourceContentSha256: string | null;
  evidenceLocatorLabel: string;
  evidencePassageQuote: string;
  destinationFieldPath: string;
  targetSectionId: PrimerSectionKey;
  originalValue: string | null;
  originalUnits: string | null;
  observationTimestamp: string | null;
  contentState: 'preliminary-review' | 'verified-fact';
  operatorLabel: string;
  transferredAtUtc: string;
  replacedPriorTransferId: string | null;
}

export interface PrimerStage4ExternalData {
  tsunami: PrimerTsunamiInformation;
  tectonic: PrimerTectonicExpertData;
  hazardObservations: PrimerVerifiedHazardObservation[];
  volcano: PrimerVolcanoConsiderationData;
  monitoringResponse: PrimerMonitoringResponseData;
  eventSpecificPreparednessAdvisories: string;
  eventSpecificAdvisoriesSource: string;
  eventSpecificAdvisoriesVerified: boolean;
  r3TransferredSources?: PrimerR3TransferProvenanceLink[];
}

export interface PrimerProvenanceRecord {
  claimKey: string;
  sectionId: PrimerSectionKey;
  sourceIdentity: string;
  sourceReference: string;
  sourceRevision: string | null;
  observationOrBulletinTimestamp: string | null;
  dataCutoffTimestamp: string;
  reviewStatus: PrimerSectionReviewState;
  contentState: PrimerContentState;
}

export interface PrimerNarrativeSubsection {
  id: string;
  title: string;
  contentState: PrimerContentState;
  reviewStatus: PrimerSectionReviewState;
  body: string;
  provenanceRefs: string[];
}

export interface PrimerStructuredNarrativeBlock {
  sectionId: PrimerSectionKey;
  title: string;
  contentState: PrimerContentState;
  reviewStatus: PrimerSectionReviewState;
  missingIndicators: string[];
  subsections: PrimerNarrativeSubsection[];
  renderedText: string;
}

export interface PrimerStage4NarrativePackage {
  packageVersion: '1.0';
  templateVersion: string;
  generatedAtUtc: string;
  dataCutoffUtc: string;
  dataCutoffPst: string;
  inputFingerprint: string;
  eventFingerprint: string;
  stage3Fingerprint: string | null;
  externalData: PrimerStage4ExternalData;
  sectionNarratives: Record<PrimerSectionKey, PrimerStructuredNarrativeBlock>;
  provenanceLedger: PrimerProvenanceRecord[];
  stateSummary: Record<PrimerContentState, number>;
}

/**
 * Approved general scientific & preparedness text templates (original PHIVOLCS-aligned prose,
 * distinct from event-specific claims).
 */
export const APPROVED_GENERAL_TEMPLATES: {
  version: string;
  tectonicContextNote: string;
  hazards: Record<PrimerHazardCategory, { title: string; template: string }>;
  preparedness: {
    earthquakeProtectiveActions: string;
    aftershockGuidance: string;
    structuralSafety: string;
    landslidePrecautions: string;
    coastalNaturalWarnings: string;
  };
  volcanoNonInferenceNote: string;
} = {
  version: STAGE4_TEMPLATE_VERSION,
  tectonicContextNote:
    'The Philippine Archipelago lies within a complex zone of oblique plate convergence between the Philippine Sea Plate and the Sunda/Eurasian Plate, accommodated along active subduction trenches and crustal fault systems such as the Philippine Fault Zone. Identifying the definitive causative rupture plane requires specialist evaluation integrating aftershock relocation alignments, focal mechanism solutions, regional geology, and geodetic observations rather than epicenter-to-trace distance alone.',
  hazards: {
    ground_shaking: {
      title: 'Strong Ground Shaking',
      template:
        'Seismic waves radiating from an earthquake rupture cause ground shaking whose local severity varies with magnitude, focal depth, epicentral distance, rupture directivity, and near-surface soil amplification (soft alluvial basins and reclaimed ground can amplify seismic waves relative to bedrock sites).',
    },
    landslides: {
      title: 'Earthquake-Induced Landslides and Rockfalls',
      template:
        'Strong ground shaking can destabilize steep mountain slopes, road cuts, escarpments, and fractured rock masses. Landslide and rockfall susceptibility increases substantially when slopes are weakened by prior weathering, antecedent rainfall, or ongoing aftershocks.',
    },
    liquefaction: {
      title: 'Liquefaction and Ground Deformation',
      template:
        'Areas underlain by loose, water-saturated sandy or silty deposits—such as coastal plains, river floodplains, deltas, and lake margins—may experience liquefaction during strong sustained shaking, manifesting as sand boils, lateral spreading, differential settlement, or localized fissuring.',
    },
    coastal_hazards: {
      title: 'Potential Coastal Hazards and Sea-Level Perturbations',
      template:
        'Large offshore or near-coastal shallow earthquakes have the potential to displace the seafloor or trigger submarine slope failures that generate tsunamis or localized sea-level disturbances. Whether a specific earthquake generates hazardous waves depends on rupture geometry, seafloor displacement, and verified instrumental sea-level observations.',
    },
    structural_damage: {
      title: 'Structural Damage Considerations',
      template:
        'Damage susceptibility depends on shaking intensity, frequency content, building age, structural system, construction quality, and compliance with the National Structural Code of the Philippines (NSCP). Non-structural elements (parapets, masonry infills, suspended ceilings, utilities) may sustain damage even at moderate shaking levels.',
    },
  },
  preparedness: {
    earthquakeProtectiveActions:
      'During shaking, practice DROP, COVER, and HOLD ON under a sturdy table or desk away from glass, heavy shelves, and exterior walls. When outdoors, move to an open area clear of buildings, utility poles, and overhanging slopes.',
    aftershockGuidance:
      'Additional earthquakes (aftershocks) may follow a significant seismic event over days to weeks. Stay alert for renewed shaking, secure heavy furniture and utilities, and follow official advisories issued by PHIVOLCS and local DRRM offices.',
    structuralSafety:
      'Evacuate buildings calmly after shaking stops if visible cracks, tilted columns, damaged foundations, or utility leaks are observed. Structures exhibiting suspected damage must be inspected by licensed civil/structural engineers or local building officials before re-occupancy.',
    landslidePrecautions:
      'Avoid steep slopes, cliff bases, unstable road cuts, and narrow river valleys prone to rockfalls or earthquake-triggered landslides, particularly during aftershocks or heavy rainfall.',
    coastalNaturalWarnings:
      'Natural Tsunami Warning Signs: If you are near the coast and feel strong earthquake shaking (hard to stand), observe a sudden unusual drop or rise in sea level, or hear a loud roaring sound coming from the ocean, immediately evacuate on foot to higher ground or farther inland without waiting for an official alert.',
  },
  volcanoNonInferenceNote:
    'Geographic proximity of active volcanoes to an earthquake epicenter does not establish a volcanic origin or confirm earthquake-triggered volcanic unrest. Assessing volcanic response requires dedicated seismic, ground-deformation, geochemical, and visual monitoring from volcano observatories.',
};

export function createDefaultStage4ExternalData(
  event: EQPEvent
): PrimerStage4ExternalData {
  // Never infer "no tsunami" or "tsunami warning" purely from EQPEvent metadata alone:
  // Any non-None bulletin status still requires explicit official tsunami bulletin metadata verification.
  const initialTsunamiState: PrimerTsunamiState =
    event.tsunamiStatus === 'Warning' || event.tsunamiStatus === 'Information'
      ? 'awaiting-verification'
      : 'unavailable';

  const recordedStationsList =
    event.picks.length > 0
      ? event.picks
          .map((p) => p.sta)
          .filter(Boolean)
          .join(', ')
      : '';

  return {
    tsunami: {
      state: initialTsunamiState,
      officialAdvisoryId: '',
      issuingAgency: 'PHIVOLCS-DOST',
      advisoryStatusAsOfTime: '',
      issuedAt: '',
      cancelledAt: '',
      affectedCoastalAreas: '',
      sourceDocumentRef: '',
      seaLevelObservations: [],
      notes: '',
    },
    tectonic: {
      expertInterpretation: '',
      evidenceReferences: '',
      reviewerName: '',
      reviewStatus: 'requires-scientific-review',
    },
    hazardObservations: [],
    volcano: {
      includeSection: true,
      expertStatement: '',
      citedMonitoringObservations: '',
      reviewStatus: 'requires-info',
    },
    monitoringResponse: {
      monitoringActivities: '',
      fieldInvestigations: '',
      qrtDeployments: '',
      lguAgencyCoordination: '',
      publishedProducts: '',
      monitoringFacilitiesOrStations: recordedStationsList
        ? `Stations recorded in active EQP pick file (${event.picks.length}): ${recordedStationsList}`
        : '',
      sourceRef: '',
      reviewStatus: 'requires-info',
    },
    eventSpecificPreparednessAdvisories: '',
    eventSpecificAdvisoriesSource: '',
    eventSpecificAdvisoriesVerified: false,
  };
}

export function computeStage4InputFingerprint(params: {
  event: EQPEvent;
  primaryLocationLabel?: string | null;
  faultGeneratorLabel?: string | null;
  isPlotResultStale?: boolean;
  stage3Package?: PrimerStage3Package | null;
  externalData: PrimerStage4ExternalData;
}): string {
  const eventFp = computePrimerEventFingerprint(params.event, {
    primaryLocationLabel: params.primaryLocationLabel,
    isPlotResultStale: params.isPlotResultStale,
  });

  const intensityAnalysis = analyzeIntensityEntries(params.event.intensities);
  const verifiedPeisSig = [
    ...intensityAnalysis.eligibleFelt,
    ...intensityAnalysis.eligibleInstrumental,
  ]
    .map((e) => `${e.category ?? 'felt'}:${e.peis}:${e.locality}`)
    .sort()
    .join('|');

  const payload = JSON.stringify({
    eventFp,
    originType: params.event.originType ?? null,
    tsunamiFlag: params.event.tsunamiStatus,
    expectingDamage: params.event.expectingDamage,
    expectingAftershocks: params.event.expectingAftershocks,
    faultGeneratorLabel: params.faultGeneratorLabel ?? null,
    verifiedPeisSig,
    stage3Fp: params.stage3Package?.provenance.inputFingerprint ?? null,
    externalData: params.externalData,
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function getActiveEventMagInfo(event: EQPEvent): {
  value: number | null;
  scale: EQPEvent['preferredScale'] | null;
} {
  const raw =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;
  if (Number.isFinite(raw) && raw > 0) {
    return { value: raw, scale: event.preferredScale };
  }
  return { value: null, scale: null };
}

function resolvePrimaryLocalityLabel(
  event: EQPEvent,
  primaryLocationLabel?: string | null
): string | null {
  if (primaryLocationLabel && primaryLocationLabel !== 'Location pending') {
    return primaryLocationLabel;
  }
  const city = event.cities.find((c) => c.id === event.selectedCityId) ?? null;
  const town = event.towns.find((t) => t.id === event.selectedTownId) ?? null;
  if (event.primaryHeadline === 'town') {
    return town?.label ?? city?.label ?? null;
  }
  return city?.label ?? town?.label ?? null;
}

function resolveNearestFaultLabel(
  event: EQPEvent,
  faultGeneratorLabel?: string | null
): string | null {
  if (faultGeneratorLabel && faultGeneratorLabel.trim()) return faultGeneratorLabel.trim();
  const gen = event.generators.find((g) => g.id === event.selectedGeneratorId) ?? null;
  return gen?.label ?? null;
}

export interface BuildStage4NarrativesParams {
  event: EQPEvent;
  externalData?: PrimerStage4ExternalData;
  epicenterFigure?: PrimerMapFigureRecord | null;
  stage3Package?: PrimerStage3Package | null;
  primaryLocationLabel?: string | null;
  faultGeneratorLabel?: string | null;
  isPlotResultStale?: boolean;
  dataCutoffUtc?: string;
}

/**
 * Deterministically compiles the comprehensive Stage 4 scientific narrative package
 * across all primer domains without mutating input events or fabricating missing data.
 */
export function buildPrimerStage4Narratives(
  params: BuildStage4NarrativesParams
): PrimerStage4NarrativePackage {
  const { event } = params;
  const externalData = params.externalData ?? createDefaultStage4ExternalData(event);
  const nowUtc = params.dataCutoffUtc || new Date().toISOString();
  const nowPst = formatUtcAsPst(nowUtc);

  const eventFingerprint = computePrimerEventFingerprint(event, {
    primaryLocationLabel: params.primaryLocationLabel,
    isPlotResultStale: params.isPlotResultStale,
  });
  const stage3Fp = params.stage3Package?.provenance.inputFingerprint ?? null;
  const inputFingerprint = computeStage4InputFingerprint({
    event,
    primaryLocationLabel: params.primaryLocationLabel,
    faultGeneratorLabel: params.faultGeneratorLabel,
    isPlotResultStale: params.isPlotResultStale,
    stage3Package: params.stage3Package,
    externalData,
  });

  const unlocated = isEventUnlocated(event);
  const magInfo = getActiveEventMagInfo(event);
  const primaryLoc = !unlocated
    ? resolvePrimaryLocalityLabel(event, params.primaryLocationLabel)
    : null;
  const nearestFault = !unlocated
    ? resolveNearestFaultLabel(event, params.faultGeneratorLabel)
    : null;

  const intensityAnalysis = analyzeIntensityEntries(event.intensities);
  const groupedIntensity = formatGroupedBulletinIntensityBlock(event.intensities);
  const verifiedAll = [
    ...intensityAnalysis.eligibleFelt,
    ...intensityAnalysis.eligibleInstrumental,
  ];
  let maxPeis: PeisRoman | null = null;
  for (const entry of verifiedAll) {
    if (!maxPeis || PEIS_RANK[entry.peis] > PEIS_RANK[maxPeis]) {
      maxPeis = entry.peis;
    }
  }
  const unverifiedIntensityCount =
    intensityAnalysis.counts.draft +
    intensityAnalysis.counts.conflicting +
    intensityAnalysis.counts.unresolved;

  const bulletinSourceId = `EQP Event ${event.id} (Bulletin No. ${event.bulletinNo})`;
  const bulletinRevision = event.version ? `v${event.version}` : null;
  const bulletinTs =
    event.originDateGmt && event.originTimeGmt
      ? `${event.originDateGmt} ${event.originTimeGmt} UTC`
      : null;

  const provenanceLedger: PrimerProvenanceRecord[] = [];
  const pushProv = (rec: PrimerProvenanceRecord) => {
    provenanceLedger.push(rec);
  };

  // =========================================================================
  // B. EARTHQUAKE OVERVIEW (Section 1)
  // =========================================================================
  const ovMissing: string[] = [];
  if (unlocated) ovMissing.push('Epicenter coordinates and focal depth unavailable');
  if (magInfo.value === null)
    ovMissing.push(`Preferred magnitude (${event.preferredScale}) not yet determined`);
  if (params.isPlotResultStale)
    ovMissing.push('Adopted PLOT solution is stale relative to modified phase picks');

  const ovOriginText =
    event.originDateLst && event.originTimeLst
      ? `On ${event.originDateLst} at ${event.originTimeLst} PST (${event.originDateGmt} ${event.originTimeGmt} UTC)`
      : `At ${event.originDateGmt || 'Unavailable Date'} ${event.originTimeGmt || ''} UTC`;
  const ovMagText =
    magInfo.value !== null && magInfo.scale
      ? `a Magnitude ${magInfo.scale} ${magInfo.value.toFixed(1)} earthquake`
      : `an earthquake (preferred magnitude ${event.preferredScale} pending calculation)`;
  const ovLocText =
    !unlocated && primaryLoc
      ? `with epicenter located at ${event.lat.toFixed(3)}°N, ${event.lon.toFixed(
          3
        )}°E (${primaryLoc})`
      : !unlocated
        ? `with epicenter coordinates at ${event.lat.toFixed(3)}°N, ${event.lon.toFixed(
            3
          )}°E (nearest city/municipality label pending)`
        : 'whose epicenter coordinates and focal depth remain pending determination';
  const ovDepthText =
    !unlocated && Number.isFinite(event.depthKm)
      ? `and a focal depth of ${event.depthKm.toFixed(1)} km${
          event.locationMetadata?.depthFixed ? ' (depth fixed during solution)' : ''
        }`
      : 'with focal depth pending solution';

  const ovFeltNote =
    intensityAnalysis.eligibleFelt.length > 0 && maxPeis
      ? `Verified felt reports indicate shaking up to PEIS ${maxPeis} (${PEIS_DESCRIPTORS[maxPeis]}) across ${intensityAnalysis.eligibleFelt.length} verified locality entry/entries.`
      : 'Verified macroseismic felt intensity (PEIS) observations are not yet confirmed in the event record.';

  const figureRefs: string[] = [];
  if (params.epicenterFigure?.status === 'ready') {
    figureRefs.push('Figure 1 (Epicenter & Geographic Context Map)');
  }
  if (params.stage3Package?.figures.aftershockMap.status === 'ready') {
    figureRefs.push('Figure 2 (Sequence & Historical Distribution Map)');
  }
  if (params.stage3Package?.figures.activityChart.status === 'ready') {
    figureRefs.push('Figure 3 (Activity vs. Time)');
  }
  if (params.stage3Package?.figures.magnitudeChart.status === 'ready') {
    figureRefs.push('Figure 4 (Magnitude Distribution)');
  }
  const ovFigureSentence =
    figureRefs.length > 0
      ? `Spatial and sequence context are illustrated in ${figureRefs.join(', ')}.`
      : 'Spatial and sequence figures are not yet attached or await validated inputs.';

  const ovState: PrimerContentState =
    unlocated || magInfo.value === null
      ? 'unavailable-or-unresolved'
      : params.isPlotResultStale ||
          event.locationMetadata?.validationStatus !== 'verified'
        ? 'preliminary-review'
        : 'verified-fact';

  const ovReviewStatus: PrimerSectionReviewState =
    unlocated || magInfo.value === null
      ? 'requires-info'
      : 'requires-scientific-review';

  const ovLines = [
    `${ovOriginText}, PHIVOLCS recorded ${ovMagText}${
      event.originType ? ` (${event.originType.toLowerCase()} origin)` : ''
    } ${ovLocText}, ${ovDepthText}.`,
    '',
    ovFeltNote,
    ovFigureSentence,
    '',
    `Source Attribution: ${bulletinSourceId} · File: ${event.filename}${
      event.locationMetadata
        ? ` · Solver: ${event.locationMetadata.solver} (${event.locationMetadata.modelName}, status: ${event.locationMetadata.validationStatus})`
        : ''
    }.`,
  ];
  if (ovMissing.length > 0) {
    ovLines.push(
      '',
      `[REQUIRES INFORMATION / SCIENTIFIC REVIEW: ${ovMissing.join('; ')}.]`
    );
  }

  pushProv({
    claimKey: 'overview.eventParameters',
    sectionId: 'overview',
    sourceIdentity: bulletinSourceId,
    sourceReference: event.filename,
    sourceRevision: bulletinRevision,
    observationOrBulletinTimestamp: bulletinTs,
    dataCutoffTimestamp: nowUtc,
    reviewStatus: ovReviewStatus,
    contentState: ovState,
  });

  const overviewBlock: PrimerStructuredNarrativeBlock = {
    sectionId: 'overview',
    title: '1. Earthquake Overview',
    contentState: ovState,
    reviewStatus: ovReviewStatus,
    missingIndicators: ovMissing,
    subsections: [
      {
        id: 'overview-summary',
        title: 'Event Summary & Attached Figures',
        contentState: ovState,
        reviewStatus: ovReviewStatus,
        body: ovLines.join('\n'),
        provenanceRefs: ['overview.eventParameters'],
      },
    ],
    renderedText: ovLines.join('\n'),
  };

  // =========================================================================
  // B2. EARTHQUAKE LOCATION (Section 2)
  // =========================================================================
  const locMissing: string[] = [];
  if (unlocated) locMissing.push('Hypocenter coordinates unlocated');
  if (!primaryLoc) locMissing.push('Nearest city/municipality reference unavailable');
  if (params.isPlotResultStale)
    locMissing.push('Location solution stale relative to modified phase picks');

  const activeSta = event.picks.filter(
    (p) => !p.pExcluded || (p.sTime.trim() !== '' && !p.sExcluded)
  ).length;

  const locState: PrimerContentState = unlocated
    ? 'unavailable-or-unresolved'
    : params.isPlotResultStale
      ? 'preliminary-review'
      : 'verified-fact';
  const locReview: PrimerSectionReviewState = unlocated
    ? 'requires-info'
    : params.isPlotResultStale || !primaryLoc
      ? 'requires-scientific-review'
      : 'ready-for-review';

  const locLines: string[] = unlocated
    ? [
        '[REQUIRES INFORMATION: Hypocenter latitude, longitude, focal depth, and nearest locality distances are currently unavailable.]',
        `Station picks loaded: ${event.picks.length} (${activeSta} active).`,
      ]
    : [
        `Epicenter Coordinates: ${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E`,
        `Focal Depth: ${event.depthKm.toFixed(1)} km${
          event.locationMetadata?.depthFixed
            ? ` (fixed${
                event.locationMetadata.depthFixReason
                  ? ` — ${event.locationMetadata.depthFixReason}`
                  : ''
              })`
            : ' (free-depth solution)'
        }`,
        `Nearest Geographic Reference: ${primaryLoc ?? '[REQUIRES INFORMATION]'}`,
        ...(event.centralOfficeBearing
          ? [`Distance & Bearing from Main Office: ${event.centralOfficeBearing}`]
          : []),
        `Solution Quality: RMS ${event.rmsSec.toFixed(2)} s · Horizontal Uncertainty ±${event.errKm.toFixed(
          2
        )} km · Active/Total Stations: ${activeSta}/${event.picks.length}${
          event.locationMetadata ? ` · Model: ${event.locationMetadata.modelName}` : ''
        }`,
        ...(params.epicenterFigure?.status === 'ready'
          ? [
              `Map Reference: ${params.epicenterFigure.caption} (Fingerprint: ${params.epicenterFigure.provenance.sourceEventFingerprint}).`,
            ]
          : ['Map Reference: Stage 2 epicenter figure pending or unavailable.']),
      ];

  if (params.isPlotResultStale) {
    locLines.push(
      '',
      '[REQUIRES SCIENTIFIC REVIEW: Station phase picks were modified after this location was adopted; re-run Locate and verify solution.]'
    );
  }

  pushProv({
    claimKey: 'location.hypocenter',
    sectionId: 'location',
    sourceIdentity: bulletinSourceId,
    sourceReference: event.locationMetadata
      ? `${event.locationMetadata.solver} (${event.locationMetadata.modelName})`
      : event.filename,
    sourceRevision: bulletinRevision,
    observationOrBulletinTimestamp: event.locationMetadata?.adoptedAt ?? bulletinTs,
    dataCutoffTimestamp: nowUtc,
    reviewStatus: locReview,
    contentState: locState,
  });

  const locationBlock: PrimerStructuredNarrativeBlock = {
    sectionId: 'location',
    title: '2. Earthquake Location & Hypocenter Parameters',
    contentState: locState,
    reviewStatus: locReview,
    missingIndicators: locMissing,
    subsections: [
      {
        id: 'location-params',
        title: 'Hypocenter Coordinates & Diagnostics',
        contentState: locState,
        reviewStatus: locReview,
        body: locLines.join('\n'),
        provenanceRefs: ['location.hypocenter'],
      },
    ],
    renderedText: locLines.join('\n'),
  };

  // =========================================================================
  // C. AFTERSHOCK ACTIVITY (Section 3 — reuses Stage 3 strictly)
  // =========================================================================
  const pkg3 = params.stage3Package ?? null;
  const aftMissing: string[] = [];
  let aftState: PrimerContentState;
  let aftReview: PrimerSectionReviewState;
  const aftLines: string[] = [
    `Bulletin Flag — Expecting Aftershocks: ${event.expectingAftershocks ? 'YES' : 'NO'}`,
  ];

  if (!pkg3 || pkg3.statistics.membershipBasis === 'unavailable') {
    aftMissing.push(
      'Stage 3 earthquake catalog sequence analysis has not been run or catalog records are unavailable'
    );
    aftState = 'unavailable-or-unresolved';
    aftReview = 'requires-info';
    aftLines.push(
      '',
      '[REQUIRES INFORMATION: Quantitative aftershock statistics are unavailable until validated earthquake catalog records are analyzed in Stage 3. No aftershock counts or duration forecasts are inferred.]'
    );
  } else {
    const s3 = pkg3.statistics;
    const isReviewed = s3.membershipBasis === 'reviewed-sequence-membership';
    aftState = isReviewed ? 'verified-fact' : 'preliminary-review';
    aftReview = isReviewed ? 'ready-for-review' : 'requires-scientific-review';
    if (!isReviewed) {
      aftMissing.push(
        'Aftershock membership is currently based on spatiotemporal candidate windowing and awaits specialist sequence review'
      );
    }

    aftLines.push(
      `Data Cutoff: ${s3.dataCutoffPst} (${s3.dataCutoffUtc}) · Elapsed Since Reference: ${s3.elapsedLabel}`,
      `Catalog Source: ${pkg3.provenance.sourceLabel} (v${pkg3.provenance.catalogVersion}, ${s3.totalCatalogCount} records; Fingerprint: ${pkg3.provenance.inputFingerprint})`
    );

    if (s3.nominatedMainshock) {
      aftLines.push(
        `Reviewed/Anchor Mainshock: ${s3.nominatedMainshock.eventId} (${s3.nominatedMainshock.magnitudeType} ${
          s3.nominatedMainshock.magnitude?.toFixed(1) ?? 'N/A'
        }, ${s3.nominatedMainshock.originTimeUtc})`
      );
    } else {
      aftLines.push(
        `Reference Anchor: ${s3.referenceEventId} (used strictly as spatiotemporal center; mainshock role not automatically assumed)`
      );
    }

    if (isReviewed && s3.scientificallyAcceptedAftershockCount !== null) {
      aftLines.push(
        `Reviewed Aftershocks: ${s3.scientificallyAcceptedAftershockCount} scientifically accepted post-event earthquakes out of ${s3.eligiblePostEventCount} eligible catalog records within ${pkg3.config.filters.radiusKm} km (+${pkg3.config.filters.postDays} days window, reference event excluded).`
      );
    } else {
      aftLines.push(
        `Post-Event Spatiotemporal Candidates (Preliminary): ${s3.eligiblePostEventCount} catalog earthquakes recorded within ${pkg3.config.filters.radiusKm} km up to +${pkg3.config.filters.postDays} days (reference event excluded; formal sequence membership pending scientific review).`
      );
    }

    aftLines.push(
      `Time Window Breakdown: ${s3.countsByInterval.within24h} within +24h · ${s3.countsByInterval.within72h} within +72h · ${s3.countsByInterval.within7d} within +7d · ${s3.countsByInterval.within30d} within +30d.`
    );

    if (s3.magnitudesByScale.length > 0) {
      aftLines.push(
        `Recorded Magnitude Ranges (Scale-Separated): ${s3.magnitudesByScale
          .map((m) => `${m.magType}: n=${m.count}, M ${m.min.toFixed(1)}–${m.max.toFixed(1)}`)
          .join(' | ')}.${
          s3.hasMixedMagnitudeScales
            ? ' Multiple scales are preserved without homogenization.'
            : ''
        }`
      );
    } else {
      aftLines.push(
        'Recorded Magnitude Ranges: Unavailable (no numeric catalog magnitudes in post-event window).'
      );
    }

    if (s3.maxAftershock) {
      aftLines.push(
        `Largest Post-Event Event in Window: ${s3.maxAftershock.eventId} (${s3.maxAftershock.magnitudeType} ${s3.maxAftershock.magnitude.toFixed(
          1
        )}) on ${s3.maxAftershock.originTimeUtc}, ${s3.maxAftershock.distanceKm.toFixed(1)} km from reference.`
      );
    }

    const s3Figs: string[] = [];
    if (pkg3.figures.aftershockMap.status === 'ready') s3Figs.push('Figure 2 (Sequence Map)');
    if (pkg3.figures.activityChart.status === 'ready')
      s3Figs.push('Figure 3 (Activity vs. Time)');
    if (pkg3.figures.magnitudeChart.status === 'ready')
      s3Figs.push('Figure 4 (Magnitude Distribution)');
    if (s3Figs.length > 0) {
      aftLines.push(`Referenced Stage 3 Figures: ${s3Figs.join(', ')}.`);
    }

    aftLines.push(
      '',
      'Methodological Note: Reported counts reflect observed catalog records up to the stated cutoff and exclude unvalidated Omori decay forecasts or exact aftershock duration predictions.'
    );

    pushProv({
      claimKey: 'aftershocks.stage3Sequence',
      sectionId: 'aftershocks',
      sourceIdentity: pkg3.provenance.sourceLabel,
      sourceReference: `Stage 3 Snapshot ${pkg3.provenance.inputFingerprint}`,
      sourceRevision: `v${pkg3.provenance.catalogVersion}`,
      observationOrBulletinTimestamp: pkg3.provenance.generatedAtUtc,
      dataCutoffTimestamp: s3.dataCutoffUtc,
      reviewStatus: aftReview,
      contentState: aftState,
    });
  }

  const aftershocksBlock: PrimerStructuredNarrativeBlock = {
    sectionId: 'aftershocks',
    title: '3. Aftershocks',
    contentState: aftState,
    reviewStatus: aftReview,
    missingIndicators: aftMissing,
    subsections: [
      {
        id: 'aftershocks-narrative',
        title: 'Observed Sequence Statistics & Cutoff',
        contentState: aftState,
        reviewStatus: aftReview,
        body: aftLines.join('\n'),
        provenanceRefs: pkg3 ? ['aftershocks.stage3Sequence'] : [],
      },
    ],
    renderedText: aftLines.join('\n'),
  };

  // =========================================================================
  // D. INTENSITY INFORMATION (Section 4)
  // =========================================================================
  const intMissing: string[] = [];
  if (intensityAnalysis.eligibleFelt.length === 0) {
    intMissing.push('No verified felt PEIS observations recorded');
  }
  if (unverifiedIntensityCount > 0) {
    intMissing.push(
      `${unverifiedIntensityCount} draft, conflicting, or unresolved intensity entry/entries excluded from verified claims`
    );
  }

  const intState: PrimerContentState =
    verifiedAll.length === 0
      ? 'unavailable-or-unresolved'
      : unverifiedIntensityCount > 0
        ? 'preliminary-review'
        : 'verified-fact';

  const intReview: PrimerSectionReviewState =
    verifiedAll.length === 0
      ? 'requires-info'
      : unverifiedIntensityCount > 0
        ? 'requires-scientific-review'
        : 'ready-for-review';

  const intLines: string[] = [];
  if (verifiedAll.length > 0 && maxPeis) {
    const descriptor = PEIS_DESCRIPTORS[maxPeis];
    const highestFeltPeis =
      intensityAnalysis.eligibleFelt.length > 0
        ? intensityAnalysis.eligibleFelt
            .map((e) => e.peis)
            .sort((a, b) => PEIS_RANK[b] - PEIS_RANK[a])[0]
        : null;

    if (highestFeltPeis) {
      intLines.push(
        `Highest Verified Reported (Felt) Intensity: PEIS ${highestFeltPeis} — "${PEIS_DESCRIPTORS[highestFeltPeis]}"`
      );
    } else {
      intLines.push(
        `Highest Verified Instrumental Intensity: PEIS ${maxPeis} — "${descriptor}" (no verified felt reports recorded yet; instrumental measurements are distinct from human felt reports).`
      );
    }

    intLines.push(
      `Source Bulletin & Revision: ${bulletinSourceId}${bulletinRevision ? `, Revision ${bulletinRevision}` : ''}`
    );

    if (groupedIntensity.feltGroups.length > 0) {
      intLines.push('', 'Verified Reported (Felt) Intensities (PEIS):');
      for (const grp of groupedIntensity.feltGroups) {
        intLines.push(
          `- Intensity ${grp.peis} (${PEIS_DESCRIPTORS[grp.peis]}): ${grp.localities.join('; ')}`
        );
      }
    }

    if (groupedIntensity.instrumentalGroups.length > 0) {
      intLines.push(
        '',
        'Verified Instrumental Intensities (Recorded by Accelerographs / Seismic Sensors):'
      );
      for (const grp of groupedIntensity.instrumentalGroups) {
        intLines.push(
          `- Intensity ${grp.peis} (${PEIS_DESCRIPTORS[grp.peis]}): ${grp.localities.join('; ')}`
        );
      }
      intLines.push(
        'Note: Instrumental intensity values derive from ground-motion recordings at sensor sites and do not substitute for field-verified human felt PEIS surveys.'
      );
    }
  } else {
    intLines.push(
      '[REQUIRES INFORMATION: No verified PHIVOLCS Earthquake Intensity Scale (PEIS) felt or instrumental intensity reports are currently recorded. Calculated or theoretical shaking levels are not substituted for verified PEIS observations.]'
    );
  }

  if (unverifiedIntensityCount > 0) {
    intLines.push(
      '',
      `[REQUIRES SCIENTIFIC REVIEW: ${unverifiedIntensityCount} additional intensity report(s) are currently marked draft (${intensityAnalysis.counts.draft}), conflicting (${intensityAnalysis.counts.conflicting}), or unresolved (${intensityAnalysis.counts.unresolved}) and were strictly excluded from confirmed intensity claims.]`
    );
  }

  pushProv({
    claimKey: 'intensity.verifiedPeis',
    sectionId: 'intensity',
    sourceIdentity: bulletinSourceId,
    sourceReference: `${intensityAnalysis.eligibleFelt.length} felt / ${intensityAnalysis.eligibleInstrumental.length} instrumental verified entries`,
    sourceRevision: bulletinRevision,
    observationOrBulletinTimestamp: bulletinTs,
    dataCutoffTimestamp: nowUtc,
    reviewStatus: intReview,
    contentState: intState,
  });

  const intensityBlock: PrimerStructuredNarrativeBlock = {
    sectionId: 'intensity',
    title: '4. Reported & Instrumental Intensities (PEIS)',
    contentState: intState,
    reviewStatus: intReview,
    missingIndicators: intMissing,
    subsections: [
      {
        id: 'intensity-verified',
        title: 'Verified PEIS Summary & Exclusion Audit',
        contentState: intState,
        reviewStatus: intReview,
        body: intLines.join('\n'),
        provenanceRefs: ['intensity.verifiedPeis'],
      },
    ],
    renderedText: intLines.join('\n'),
  };

  // =========================================================================
  // F & I. TECTONIC SETTING, POSSIBLE GENERATOR & HISTORICAL SEISMICITY (Section 5)
  // =========================================================================
  const tecMissing: string[] = [];
  if (!event.originType) tecMissing.push('Origin classification (Tectonic/Volcanic) unset');
  if (!nearestFault) tecMissing.push('Nearest mapped tectonic generator unavailable');
  if (!externalData.tectonic.expertInterpretation.trim()) {
    tecMissing.push('Expert causal interpretation & focal mechanism evaluation pending');
  }

  const tecReview: PrimerSectionReviewState =
    !nearestFault || !event.originType
      ? 'requires-info'
      : externalData.tectonic.reviewStatus;

  const tecState: PrimerContentState =
    externalData.tectonic.expertInterpretation.trim() &&
    externalData.tectonic.reviewStatus === 'ready-for-review'
      ? 'verified-fact'
      : 'preliminary-review';

  const nearestStructureLine = nearestFault
    ? `Nearest Mapped Tectonic Structure (Proximity Only): ${nearestFault}`
    : 'Nearest Mapped Tectonic Structure: [REQUIRES INFORMATION — run Nearest Places / GIS lookup]';

  const candidateAssocLine = !unlocated && nearestFault
    ? `Candidate Geographic Association: Based on epicenter-to-trace distance within built-in EQP schematic reference traces, ${nearestFault} is the closest mapped tectonic feature. NOTE: Schematic fault traces on baseline maps are geographic context references only, not authoritative rupture proof; proximity does not establish fault causation.`
    : 'Candidate Geographic Association: Pending verified epicenter and mapped structure lookup.';

  const expertInterpBody = externalData.tectonic.expertInterpretation.trim()
    ? [
        `Reviewed / Authored Expert Interpretation (${externalData.tectonic.reviewStatus}): ${externalData.tectonic.expertInterpretation.trim()}`,
        ...(externalData.tectonic.evidenceReferences.trim()
          ? [`Evidence References: ${externalData.tectonic.evidenceReferences.trim()}`]
          : []),
        ...(externalData.tectonic.reviewerName.trim()
          ? [`Specialist Reviewer: ${externalData.tectonic.reviewerName.trim()}`]
          : []),
      ].join('\n')
    : '[REQUIRES SCIENTIFIC REVIEW: Scientifically reviewed causative fault interpretation (incorporating focal mechanism / centroid moment tensor, fault plane orientation, and aftershock distribution) has not yet been authored.]';

  // Reuse Stage 3 Historical Seismicity (Requirement I)
  const histSubLines: string[] = [];
  let histSubState: PrimerContentState;
  let histSubReview: PrimerSectionReviewState;
  if (!pkg3 || pkg3.historical.status === 'unavailable') {
    histSubState = 'unavailable-or-unresolved';
    histSubReview = 'requires-info';
    tecMissing.push('Stage 3 regional historical seismicity summary unavailable');
    histSubLines.push(
      `[REQUIRES INFORMATION: ${
        pkg3?.historical.unavailableReason ||
        'Regional historical earthquake catalog summary unavailable until Stage 3 catalog analysis is run.'
      }]`
    );
  } else if (pkg3.historical.totalMatchingCount === 0) {
    histSubState = 'verified-fact';
    histSubReview = 'ready-for-review';
    histSubLines.push(
      `Historical Catalog Query (M ≥ ${pkg3.historical.minMag.toFixed(1)}, R=${pkg3.historical.radiusKm} km, preceding ${pkg3.historical.lookbackYears} years): 0 catalog entries matched within the loaded regional catalog (${pkg3.provenance.sourceLabel}, v${pkg3.provenance.catalogVersion}). Absence of matches reflects only the loaded catalog scope and completeness threshold.`,
      pkg3.historical.associationDisclaimer
    );
  } else {
    histSubState = 'verified-fact';
    histSubReview = 'requires-scientific-review';
    histSubLines.push(
      `Regional Historical Context (${pkg3.provenance.sourceLabel}, v${pkg3.provenance.catalogVersion}): ${pkg3.historical.totalMatchingCount} catalog earthquake(s) with M ≥ ${pkg3.historical.minMag.toFixed(
        1
      )} occurred within ${pkg3.historical.radiusKm} km over the preceding ${pkg3.historical.lookbackYears} year(s) (see Table 1).`
    );
    for (const row of pkg3.historical.rows.slice(0, 6)) {
      histSubLines.push(
        `- ${row.originTimeUtc.slice(0, 10)} (${row.eventId}): ${
          row.magnitude !== null ? `${row.magnitudeType} ${row.magnitude.toFixed(1)}` : 'Mag N/A'
        }, depth ${row.depthKm !== null ? `${row.depthKm.toFixed(1)} km` : 'N/A'}, ${row.distanceKm.toFixed(
          1
        )} km (${row.dataSource})`
      );
    }
    histSubLines.push('', pkg3.historical.associationDisclaimer);
  }

  pushProv({
    claimKey: 'tectonic.proximityAndRegionalContext',
    sectionId: 'tectonic_setting',
    sourceIdentity: nearestFault ? 'EQP Nearest Places / GENTR Reference' : bulletinSourceId,
    sourceReference: nearestFault ?? 'Unavailable',
    sourceRevision: STAGE4_TEMPLATE_VERSION,
    observationOrBulletinTimestamp: bulletinTs,
    dataCutoffTimestamp: nowUtc,
    reviewStatus: tecReview,
    contentState: 'preliminary-review',
  });

  if (externalData.tectonic.expertInterpretation.trim()) {
    pushProv({
      claimKey: 'tectonic.expertInterpretation',
      sectionId: 'tectonic_setting',
      sourceIdentity: externalData.tectonic.reviewerName.trim() || 'Specialist Author',
      sourceReference:
        externalData.tectonic.evidenceReferences.trim() || 'Pending citation',
      sourceRevision: null,
      observationOrBulletinTimestamp: nowUtc,
      dataCutoffTimestamp: nowUtc,
      reviewStatus: externalData.tectonic.reviewStatus,
      contentState:
        externalData.tectonic.reviewStatus === 'ready-for-review'
          ? 'verified-fact'
          : 'preliminary-review',
    });
  }

  const tectonicFullLines = [
    `Origin Classification: ${event.originType ?? '[REQUIRES INFORMATION]'}`,
    nearestStructureLine,
    candidateAssocLine,
    '',
    'Scientifically Reviewed Causative Interpretation:',
    expertInterpBody,
    '',
    `Regional Tectonic Context (${APPROVED_GENERAL_TEMPLATES.version}):`,
    APPROVED_GENERAL_TEMPLATES.tectonicContextNote,
    '',
    'Historical Regional Seismicity:',
    ...histSubLines,
  ];

  const tectonicBlock: PrimerStructuredNarrativeBlock = {
    sectionId: 'tectonic_setting',
    title: '5. Tectonic Setting, Possible Generator & Historical Seismicity',
    contentState: tecState,
    reviewStatus: tecReview,
    missingIndicators: tecMissing,
    subsections: [
      {
        id: 'tectonic-generator',
        title: 'Nearest Mapped Structure vs. Candidate Association vs. Expert Interpretation',
        contentState: tecState,
        reviewStatus: tecReview,
        body: [nearestStructureLine, candidateAssocLine, expertInterpBody].join('\n\n'),
        provenanceRefs: ['tectonic.proximityAndRegionalContext'],
      },
      {
        id: 'tectonic-regional-template',
        title: 'Regional Tectonic Setting (Approved General Template)',
        contentState: 'approved-general-template',
        reviewStatus: 'ready-for-review',
        body: APPROVED_GENERAL_TEMPLATES.tectonicContextNote,
        provenanceRefs: [],
      },
      {
        id: 'tectonic-historical-seismicity',
        title: 'Regional Historical Seismicity Summary',
        contentState: histSubState,
        reviewStatus: histSubReview,
        body: histSubLines.join('\n'),
        provenanceRefs: pkg3 ? ['aftershocks.stage3Sequence'] : [],
      },
    ],
    renderedText: tectonicFullLines.join('\n'),
  };

  // =========================================================================
  // E, G & H. TSUNAMI INFORMATION, SECONDARY HAZARDS & VOLCANO CONSIDERATIONS (Section 6)
  // =========================================================================
  const hazMissing: string[] = [];
  const tsu = externalData.tsunami;

  let tsuState: PrimerContentState;
  let tsuReview: PrimerSectionReviewState;
  const tsuLines: string[] = [];

  if (tsu.state === 'official-warning-or-advisory' || tsu.state === 'official-no-tsunami') {
    const hasRef = Boolean(tsu.officialAdvisoryId.trim() && tsu.issuingAgency.trim());
    tsuState = hasRef ? 'verified-fact' : 'preliminary-review';
    tsuReview = hasRef ? 'ready-for-review' : 'requires-scientific-review';
    if (!hasRef) {
      hazMissing.push('Official tsunami advisory identifier or issuing agency missing');
    }

    tsuLines.push(
      `Tsunami Advisory Category: ${
        tsu.state === 'official-warning-or-advisory'
          ? 'Official Tsunami Warning / Advisory Information Supplied'
          : 'Official No-Tsunami Statement Supplied'
      }`,
      `Advisory Identifier: ${tsu.officialAdvisoryId.trim() || '[REQUIRES INFORMATION]'} · Issuing Agency: ${
        tsu.issuingAgency.trim() || '[REQUIRES INFORMATION]'
      }`,
      ...(tsu.issuedAt.trim() ? [`Issued At: ${tsu.issuedAt.trim()}`] : []),
      ...(tsu.cancelledAt.trim() ? [`Cancelled At: ${tsu.cancelledAt.trim()}`] : []),
      ...(tsu.advisoryStatusAsOfTime.trim()
        ? [`Status As-Of Time: ${tsu.advisoryStatusAsOfTime.trim()}`]
        : []),
      ...(tsu.affectedCoastalAreas.trim()
        ? [`Affected / Monitored Coastal Areas: ${tsu.affectedCoastalAreas.trim()}`]
        : []),
      ...(tsu.sourceDocumentRef.trim()
        ? [`Source Document / Bulletin Ref: ${tsu.sourceDocumentRef.trim()}`]
        : []),
      ...(tsu.notes.trim() ? [`Official Summary Notes: ${tsu.notes.trim()}`] : [])
    );

    if (tsu.seaLevelObservations.length > 0) {
      tsuLines.push('Verified Sea-Level Observations:');
      for (const obs of tsu.seaLevelObservations) {
        tsuLines.push(
          `- Station ${obs.stationName}: max height ${obs.maxWaveHeightM} m at ${obs.observedAtUtc} (${obs.observationType}; Source: ${obs.sourceRef}; Status: ${obs.reviewStatus})`
        );
      }
    } else {
      tsuLines.push('Sea-Level Observations: None supplied or recorded at this cutoff.');
    }

    pushProv({
      claimKey: 'hazards.tsunamiOfficial',
      sectionId: 'hazards',
      sourceIdentity: tsu.issuingAgency.trim() || 'Official Tsunami Authority',
      sourceReference:
        tsu.officialAdvisoryId.trim() ||
        tsu.sourceDocumentRef.trim() ||
        'Advisory ID pending',
      sourceRevision: null,
      observationOrBulletinTimestamp: tsu.advisoryStatusAsOfTime.trim() || tsu.issuedAt.trim() || null,
      dataCutoffTimestamp: nowUtc,
      reviewStatus: tsuReview,
      contentState: tsuState,
    });
  } else {
    tsuState = 'unavailable-or-unresolved';
    tsuReview = 'requires-info';
    hazMissing.push(
      tsu.state === 'awaiting-verification'
        ? 'Official tsunami advisory details awaiting verification'
        : 'Official tsunami bulletin / sea-level verification unavailable'
    );
    tsuLines.push(
      `Tsunami Information Status: ${
        tsu.state === 'awaiting-verification'
          ? 'AWAITING VERIFICATION'
          : 'INFORMATION UNAVAILABLE'
      }`,
      `EQP Event Bulletin Flag Reference: ${event.tsunamiStatus} (Preliminary event flag alone does not replace an official Tsunami Information / Advisory record).`,
      '[REQUIRES INFORMATION: Official Tsunami Bulletin ID, issuing agency statement, coastal status as-of time, and verified tide-gauge observations are not yet supplied. This primer never infers tsunami occurrence, absence, or coastal safety from magnitude, focal depth, or offshore coordinates.]'
    );

    pushProv({
      claimKey: 'hazards.tsunamiUnavailable',
      sectionId: 'hazards',
      sourceIdentity: bulletinSourceId,
      sourceReference: `EQP tsunamiStatus=${event.tsunamiStatus} (unverified for primer)`,
      sourceRevision: bulletinRevision,
      observationOrBulletinTimestamp: bulletinTs,
      dataCutoffTimestamp: nowUtc,
      reviewStatus: 'requires-info',
      contentState: 'unavailable-or-unresolved',
    });
  }

  // Secondary Hazard 5 subsections (General Approved Templates + Optional Verified Observations)
  const hazardSubsections: PrimerNarrativeSubsection[] = [
    {
      id: 'hazards-tsunami',
      title: 'Tsunami & Sea-Level Information',
      contentState: tsuState,
      reviewStatus: tsuReview,
      body: tsuLines.join('\n'),
      provenanceRefs: [
        tsu.state === 'official-warning-or-advisory' || tsu.state === 'official-no-tsunami'
          ? 'hazards.tsunamiOfficial'
          : 'hazards.tsunamiUnavailable',
      ],
    },
  ];

  const hazardRenderedBlocks: string[] = ['Tsunami & Sea-Level Information:', ...tsuLines, ''];

  const hazardCategories: PrimerHazardCategory[] = [
    'ground_shaking',
    'landslides',
    'liquefaction',
    'coastal_hazards',
    'structural_damage',
  ];

  for (const cat of hazardCategories) {
    const meta = APPROVED_GENERAL_TEMPLATES.hazards[cat];
    const matchingObs = externalData.hazardObservations.filter((o) => o.hazardType === cat);
    const subLines: string[] = [
      `[General Scientific Guidance (${APPROVED_GENERAL_TEMPLATES.version})] ${meta.template}`,
    ];
    if (matchingObs.length > 0) {
      subLines.push('Verified / Field-Reported Observations:');
      for (const obs of matchingObs) {
        subLines.push(
          `- ${obs.location} (${obs.observedAtUtc}): ${obs.description} [Source: ${obs.source} · Status: ${obs.reviewStatus}]`
        );
        pushProv({
          claimKey: `hazards.obs.${obs.id}`,
          sectionId: 'hazards',
          sourceIdentity: obs.source,
          sourceReference: obs.location,
          sourceRevision: null,
          observationOrBulletinTimestamp: obs.observedAtUtc,
          dataCutoffTimestamp: nowUtc,
          reviewStatus: obs.reviewStatus,
          contentState:
            obs.reviewStatus === 'ready-for-review'
              ? 'verified-fact'
              : 'preliminary-review',
        });
      }
    } else {
      subLines.push(
        'Event-Specific Field Observations: None confirmed/supplied at data cutoff (expectingDamage event flag: ' +
          (event.expectingDamage ? 'YES' : 'NO') +
          '; field verification required before reporting localized damage or secondary hazard impacts).'
      );
    }

    const subState: PrimerContentState =
      matchingObs.some((o) => o.reviewStatus === 'ready-for-review')
        ? 'verified-fact'
        : matchingObs.length > 0
          ? 'preliminary-review'
          : 'approved-general-template';

    hazardSubsections.push({
      id: `hazards-${cat}`,
      title: meta.title,
      contentState: subState,
      reviewStatus:
        matchingObs.length > 0
          ? matchingObs.every((o) => o.reviewStatus === 'ready-for-review')
            ? 'ready-for-review'
            : 'requires-scientific-review'
          : 'requires-scientific-review',
      body: subLines.join('\n'),
      provenanceRefs: matchingObs.map((o) => `hazards.obs.${o.id}`),
    });

    hazardRenderedBlocks.push(`${meta.title}:`, ...subLines, '');
  }

  // H. Optional Volcano-Related Considerations
  if (externalData.volcano.includeSection) {
    const nearestVolcanoes = !unlocated
      ? ACTIVE_VOLCANOES.map((v) => {
          const info = computeDistanceAndBearing(v.lat, v.lon, event.lat, event.lon);
          return {
            name: v.name,
            province: v.province,
            distKm: Math.round(info.distKm),
            bearing: info.quadrantLabel,
          };
        })
          .sort((a, b) => a.distKm - b.distKm)
          .slice(0, 3)
      : [];

    const volLines: string[] = [];
    if (nearestVolcanoes.length > 0) {
      volLines.push(
        `Nearest Active Volcanoes (Geographic Distance Reference Only): ${nearestVolcanoes
          .map((v) => `${v.name} (${v.province}) — ${v.distKm} km ${v.bearing}`)
          .join('; ')}.`
      );
    } else {
      volLines.push(
        'Nearest Active Volcanoes: Geographic proximity unavailable while epicenter coordinates remain unlocated.'
      );
    }

    volLines.push(APPROVED_GENERAL_TEMPLATES.volcanoNonInferenceNote);

    const hasVolExpert = Boolean(externalData.volcano.expertStatement.trim());
    if (hasVolExpert) {
      volLines.push(
        `Volcano Monitoring Statement (${externalData.volcano.reviewStatus}): ${externalData.volcano.expertStatement.trim()}`
      );
      if (externalData.volcano.citedMonitoringObservations.trim()) {
        volLines.push(
          `Cited Volcano Observatory Observations: ${externalData.volcano.citedMonitoringObservations.trim()}`
        );
      }
      pushProv({
        claimKey: 'hazards.volcanoConsiderations',
        sectionId: 'hazards',
        sourceIdentity: 'PHIVOLCS Volcano Monitoring / Expert Author',
        sourceReference:
          externalData.volcano.citedMonitoringObservations.trim() ||
          'Volcano monitoring citation pending',
        sourceRevision: null,
        observationOrBulletinTimestamp: nowUtc,
        dataCutoffTimestamp: nowUtc,
        reviewStatus: externalData.volcano.reviewStatus,
        contentState:
          externalData.volcano.reviewStatus === 'ready-for-review'
            ? 'verified-fact'
            : 'preliminary-review',
      });
    } else {
      hazMissing.push('Volcano-related monitoring assessment not yet authored');
      volLines.push(
        '[REQUIRES INFORMATION: Verified volcano observatory status or expert-authored statement has not been supplied. No inference is made regarding whether volcanic unrest did or did not occur.]'
      );
    }

    const volState: PrimerContentState = hasVolExpert
      ? externalData.volcano.reviewStatus === 'ready-for-review'
        ? 'verified-fact'
        : 'preliminary-review'
      : 'unavailable-or-unresolved';

    hazardSubsections.push({
      id: 'hazards-volcano',
      title: 'Volcano-Related Considerations',
      contentState: volState,
      reviewStatus: externalData.volcano.reviewStatus,
      body: volLines.join('\n'),
      provenanceRefs: hasVolExpert ? ['hazards.volcanoConsiderations'] : [],
    });

    hazardRenderedBlocks.push('Volcano-Related Considerations:', ...volLines, '');
  }

  const hazardsReview: PrimerSectionReviewState =
    tsuReview === 'requires-info' ? 'requires-scientific-review' : tsuReview;

  const hazardsBlock: PrimerStructuredNarrativeBlock = {
    sectionId: 'hazards',
    title: '6. Earthquake Hazards, Tsunami & Volcano Considerations',
    contentState:
      tsuState === 'verified-fact' ? 'preliminary-review' : 'approved-general-template',
    reviewStatus: hazardsReview,
    missingIndicators: hazMissing,
    subsections: hazardSubsections,
    renderedText: hazardRenderedBlocks.join('\n').trim(),
  };

  // =========================================================================
  // J & K. PREPAREDNESS, RECOMMENDATIONS & PHIVOLCS MONITORING / RESPONSE (Section 7)
  // =========================================================================
  const recMissing: string[] = [];
  const mr = externalData.monitoringResponse;
  const hasAnyMr = Boolean(
    mr.monitoringActivities.trim() ||
      mr.fieldInvestigations.trim() ||
      mr.qrtDeployments.trim() ||
      mr.lguAgencyCoordination.trim() ||
      mr.publishedProducts.trim()
  );

  if (!hasAnyMr) {
    recMissing.push('PHIVOLCS monitoring actions & QRT/field response details not yet supplied');
  }
  if (!externalData.eventSpecificPreparednessAdvisories.trim()) {
    recMissing.push('Event-specific authorized public advisories pending duty officer entry');
  }

  const prepGeneralLines: string[] = [
    `[Approved General Guidance (${APPROVED_GENERAL_TEMPLATES.version})]`,
    `- Protective Actions: ${APPROVED_GENERAL_TEMPLATES.preparedness.earthquakeProtectiveActions}`,
    `- Aftershock Preparedness: ${APPROVED_GENERAL_TEMPLATES.preparedness.aftershockGuidance}`,
    `- Structural Safety: ${APPROVED_GENERAL_TEMPLATES.preparedness.structuralSafety}`,
    `- Landslide & Slope Precaution: ${APPROVED_GENERAL_TEMPLATES.preparedness.landslidePrecautions}`,
    `- Coastal Natural Warning Signs: ${APPROVED_GENERAL_TEMPLATES.preparedness.coastalNaturalWarnings}`,
  ];

  const hasEventSpecificAdv = Boolean(
    externalData.eventSpecificPreparednessAdvisories.trim()
  );
  const eventSpecificAdvState: PrimerContentState =
    hasEventSpecificAdv && externalData.eventSpecificAdvisoriesVerified
      ? 'verified-fact'
      : hasEventSpecificAdv
        ? 'preliminary-review'
        : 'unavailable-or-unresolved';
  const eventSpecificAdvLines: string[] = hasEventSpecificAdv
    ? [
        `Authorized Event-Specific Advisories (${
          externalData.eventSpecificAdvisoriesVerified
            ? 'Verified by Authorized Personnel'
            : 'Pending Officer Verification'
        }):`,
        externalData.eventSpecificPreparednessAdvisories.trim(),
        ...(externalData.eventSpecificAdvisoriesSource.trim()
          ? [`Authorization / Reference: ${externalData.eventSpecificAdvisoriesSource.trim()}`]
          : []),
      ]
    : [
        'Authorized Event-Specific Advisories: [REQUIRES SCIENTIFIC REVIEW — To be supplied/approved by authorized PHIVOLCS duty personnel rather than auto-invented.]',
      ];

  if (hasEventSpecificAdv) {
    pushProv({
      claimKey: 'recommendations.eventAdvisories',
      sectionId: 'recommendations',
      sourceIdentity:
        externalData.eventSpecificAdvisoriesSource.trim() || 'Authorized Duty Officer',
      sourceReference: bulletinSourceId,
      sourceRevision: null,
      observationOrBulletinTimestamp: nowUtc,
      dataCutoffTimestamp: nowUtc,
      reviewStatus: externalData.eventSpecificAdvisoriesVerified
        ? 'ready-for-review'
        : 'requires-scientific-review',
      contentState: eventSpecificAdvState,
    });
  }

  const mrState: PrimerContentState = hasAnyMr
    ? mr.reviewStatus === 'ready-for-review'
      ? 'verified-fact'
      : 'preliminary-review'
    : 'unavailable-or-unresolved';

  const mrLines: string[] = [
    `Operational Review Status: ${mr.reviewStatus}${mr.sourceRef.trim() ? ` · Source: ${mr.sourceRef.trim()}` : ''}`,
    `Monitoring Activities: ${mr.monitoringActivities.trim() || '[Unavailable / Pending Entry]'}`,
    `Scientific Field Investigations: ${mr.fieldInvestigations.trim() || '[Unavailable / Pending Entry]'}`,
    `Quick Response Team (QRT) Deployment: ${mr.qrtDeployments.trim() || '[Unavailable / Pending Entry]'}`,
    `LGU / DRRMC / Agency Coordination: ${mr.lguAgencyCoordination.trim() || '[Unavailable / Pending Entry]'}`,
    `Published Information Products: ${mr.publishedProducts.trim() || '[Unavailable / Pending Entry]'}`,
    `Monitoring Facilities / Stations: ${
      mr.monitoringFacilitiesOrStations.trim() || '[No verified facility list supplied]'
    }`,
  ];

  if (hasAnyMr) {
    pushProv({
      claimKey: 'recommendations.monitoringResponse',
      sectionId: 'recommendations',
      sourceIdentity: mr.sourceRef.trim() || 'PHIVOLCS Operations / Duty Team',
      sourceReference: bulletinSourceId,
      sourceRevision: null,
      observationOrBulletinTimestamp: nowUtc,
      dataCutoffTimestamp: nowUtc,
      reviewStatus: mr.reviewStatus,
      contentState: mrState,
    });
  }

  const recRenderedText = [
    ...prepGeneralLines,
    '',
    ...eventSpecificAdvLines,
    '',
    'PHIVOLCS Monitoring & Response:',
    ...mrLines,
  ].join('\n');

  const recommendationsBlock: PrimerStructuredNarrativeBlock = {
    sectionId: 'recommendations',
    title: '7. Public Safety, Preparedness & PHIVOLCS Monitoring/Response',
    contentState:
      eventSpecificAdvState === 'verified-fact' && mrState === 'verified-fact'
        ? 'verified-fact'
        : 'approved-general-template',
    reviewStatus: 'requires-scientific-review',
    missingIndicators: recMissing,
    subsections: [
      {
        id: 'rec-general-preparedness',
        title: 'Approved General Preparedness Templates',
        contentState: 'approved-general-template',
        reviewStatus: 'ready-for-review',
        body: prepGeneralLines.join('\n'),
        provenanceRefs: [],
      },
      {
        id: 'rec-event-advisories',
        title: 'Event-Specific Official Advisories',
        contentState: eventSpecificAdvState,
        reviewStatus: externalData.eventSpecificAdvisoriesVerified
          ? 'ready-for-review'
          : 'requires-scientific-review',
        body: eventSpecificAdvLines.join('\n'),
        provenanceRefs: hasEventSpecificAdv ? ['recommendations.eventAdvisories'] : [],
      },
      {
        id: 'rec-monitoring-response',
        title: 'PHIVOLCS Monitoring & Response Activities',
        contentState: mrState,
        reviewStatus: mr.reviewStatus,
        body: mrLines.join('\n'),
        provenanceRefs: hasAnyMr ? ['recommendations.monitoringResponse'] : [],
      },
    ],
    renderedText: recRenderedText,
  };

  const sectionNarratives: Record<PrimerSectionKey, PrimerStructuredNarrativeBlock> = {
    overview: overviewBlock,
    location: locationBlock,
    aftershocks: aftershocksBlock,
    intensity: intensityBlock,
    tectonic_setting: tectonicBlock,
    hazards: hazardsBlock,
    recommendations: recommendationsBlock,
  };

  if (Array.isArray(externalData.r3TransferredSources)) {
    for (const r3 of externalData.r3TransferredSources) {
      pushProv({
        claimKey: `r3.${r3.targetSectionId}.${r3.transferId}`,
        sectionId: r3.targetSectionId,
        sourceIdentity: `${r3.sourceOrganization} — ${r3.sourceTitle}`,
        sourceReference: [
          r3.sourceUrl || r3.sourceId,
          r3.evidenceLocatorLabel ? `Locator: ${r3.evidenceLocatorLabel}` : null,
          r3.sourceContentSha256 ? `SHA256:${r3.sourceContentSha256.slice(0, 12)}` : null,
          `Reviewed transfer by ${r3.operatorLabel}`,
        ]
          .filter(Boolean)
          .join(' · '),
        sourceRevision: `v${r3.sourceVersionNumber}`,
        observationOrBulletinTimestamp: r3.observationTimestamp ?? r3.transferredAtUtc,
        dataCutoffTimestamp: nowUtc,
        reviewStatus:
          r3.contentState === 'verified-fact'
            ? 'ready-for-review'
            : 'requires-scientific-review',
        contentState: r3.contentState,
      });
    }
  }

  const stateSummary: Record<PrimerContentState, number> = {
    'verified-fact': 0,
    'approved-general-template': 0,
    'preliminary-review': 0,
    'unavailable-or-unresolved': 0,
  };
  for (const block of Object.values(sectionNarratives)) {
    for (const sub of block.subsections) {
      stateSummary[sub.contentState] += 1;
    }
  }

  return {
    packageVersion: '1.0',
    templateVersion: STAGE4_TEMPLATE_VERSION,
    generatedAtUtc: nowUtc,
    dataCutoffUtc: nowUtc,
    dataCutoffPst: nowPst,
    inputFingerprint,
    eventFingerprint,
    stage3Fingerprint: stage3Fp,
    externalData,
    sectionNarratives,
    provenanceLedger,
    stateSummary,
  };
}
