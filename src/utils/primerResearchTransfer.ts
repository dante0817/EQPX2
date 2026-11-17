import type { EQPEvent } from '../data/eqpData';
import {
  updatePrimerStage4Narratives,
  type PrimerDocument,
  type PrimerSectionId,
} from './earthquakePrimer';
import {
  computePrimerEventFingerprint,
  type PrimerMapFigureRecord,
} from './primerMapFigure';
import {
  EVENT_MATCH_STATE_LABELS,
  type PrimerResearchSourceRecord,
  type ResearchEventMatchOperatorResolution,
  type ResearchEventMatchState,
} from './primerResearchAssistant';
import {
  isSourceRestrictedOrLocal,
  R2_CATEGORY_LABELS,
  R2_CATEGORY_TARGET_PRIMER_SECTION,
  sanitizeUntrustedTextValue,
  type CandidateScientificFinding,
  type PrimerResearchR3Stage4DiffPreview,
  type PrimerResearchR3TransferCandidate,
  type R2ConflictKind,
  type R2FindingCategory,
} from './primerResearchExtraction';
import type {
  R3CollisionResolutionMode,
  R3TransferAuditLogEntry,
} from './primerResearchTransferStore';
import {
  buildPrimerStage4Narratives,
  createDefaultStage4ExternalData,
  type PrimerContentState,
  type PrimerHazardCategory,
  type PrimerR3TransferProvenanceLink,
  type PrimerSeaLevelObservation,
  type PrimerSectionKey,
  type PrimerSectionReviewState,
  type PrimerStage4ExternalData,
  type PrimerTsunamiState,
  type PrimerVerifiedHazardObservation,
} from './primerScientificNarratives';
import type { PrimerStage3Package } from './primerSequenceIntegration';

export const R3_TRANSFER_APPROVAL_DISCLAIMER =
  'Accepting a candidate finding for a local PRIMER draft is NOT formal institutional scientific approval, reviewer authentication, or public release authorization.';

export const NO_SUPPORTED_DIRECT_TRANSFER_LABEL = 'NO SUPPORTED DIRECT TRANSFER';

// =============================================================================
// B. FINDING-TO-PRIMER TYPED MAPPING REGISTRY
// =============================================================================

export type R3Stage4MappingSubKind =
  | 'tsunami-official-advisory'
  | 'tsunami-sea-level-observation'
  | 'hazard-landslides'
  | 'hazard-liquefaction'
  | 'hazard-structural-damage'
  | 'tectonic-interpretation'
  | 'tectonic-focal-mechanism'
  | 'volcano-monitoring'
  | 'monitoring-qrt-response'
  | 'monitoring-agency-coordination'
  | 'preparedness-event-advisory'
  | 'unsupported-no-direct-transfer';

export interface R3MappingRegistryEntry {
  category: R2FindingCategory;
  supportedByDefault: boolean;
  targetSectionId: PrimerSectionKey;
  destinationFieldPath: string | null;
  destinationLabel: string;
  supportsAddSeparate: boolean;
  scientificGuardrail: string;
}

export const R2_TO_STAGE4_MAPPING_REGISTRY: Record<
  R2FindingCategory,
  R3MappingRegistryEntry
> = {
  'tsunami-sea-level': {
    category: 'tsunami-sea-level',
    supportedByDefault: true,
    targetSectionId: 'hazards',
    destinationFieldPath: 'externalData.tsunami',
    destinationLabel: 'Stage 4 Tsunami Advisory & Sea-Level Observations (Section 6)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Only explicit official tsunami advisories or verified sea-level measurements may update tsunami fields; USGS tsunamiFlagRaw cannot establish official tsunami status.',
  },
  'landslides-rockfalls': {
    category: 'landslides-rockfalls',
    supportedByDefault: true,
    targetSectionId: 'hazards',
    destinationFieldPath: 'externalData.hazardObservations[landslides]',
    destinationLabel: 'Stage 4 Hazard Observations — Landslides & Rockfalls (Section 6)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Field/reported observations only; modeled USGS ground-failure alerts cannot be claimed as observed landslides.',
  },
  'liquefaction-deformation': {
    category: 'liquefaction-deformation',
    supportedByDefault: true,
    targetSectionId: 'hazards',
    destinationFieldPath: 'externalData.hazardObservations[liquefaction]',
    destinationLabel: 'Stage 4 Hazard Observations — Liquefaction & Deformation (Section 6)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Field/reported observations only; modeled ground-failure estimates cannot claim observed liquefaction.',
  },
  'structural-infrastructure': {
    category: 'structural-infrastructure',
    supportedByDefault: true,
    targetSectionId: 'hazards',
    destinationFieldPath: 'externalData.hazardObservations[structural_damage]',
    destinationLabel: 'Stage 4 Hazard Observations — Structural Damage (Section 6)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Confirmed/reported observations only; modeled LossPAGER alerts cannot be transferred as observed damage.',
  },
  'tectonic-generators': {
    category: 'tectonic-generators',
    supportedByDefault: true,
    targetSectionId: 'tectonic_setting',
    destinationFieldPath: 'externalData.tectonic',
    destinationLabel: 'Stage 4 Tectonic Setting & Generator Interpretation (Section 5)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Candidate interpretation remains flagged requires-scientific-review and preserves proximity non-causality.',
  },
  'focal-mechanism-products': {
    category: 'focal-mechanism-products',
    supportedByDefault: true,
    targetSectionId: 'tectonic_setting',
    destinationFieldPath: 'externalData.tectonic.evidenceReferences',
    destinationLabel: 'Stage 4 Tectonic Evidence & Focal Mechanism Reference (Section 5)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Attaches focal mechanism / moment tensor parameters and contributor provenance without overwriting EQP preferred magnitude.',
  },
  'volcano-monitoring': {
    category: 'volcano-monitoring',
    supportedByDefault: true,
    targetSectionId: 'hazards',
    destinationFieldPath: 'externalData.volcano',
    destinationLabel: 'Stage 4 Volcano Monitoring Considerations (Section 6)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Appends observatory monitoring observations without implying earthquake-triggered volcanic unrest.',
  },
  'phivolcs-monitoring-qrt': {
    category: 'phivolcs-monitoring-qrt',
    supportedByDefault: true,
    targetSectionId: 'recommendations',
    destinationFieldPath: 'externalData.monitoringResponse',
    destinationLabel: 'Stage 4 PHIVOLCS Monitoring & QRT Response (Section 7)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Transfers cited monitoring, QRT, station, or field-investigation updates from documented source passages only.',
  },
  'agency-coordination': {
    category: 'agency-coordination',
    supportedByDefault: true,
    targetSectionId: 'recommendations',
    destinationFieldPath: 'externalData.monitoringResponse.lguAgencyCoordination',
    destinationLabel: 'Stage 4 LGU / DRRMC / Agency Coordination (Section 7)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Appends documented interagency coordination activity with source provenance.',
  },
  'public-safety-preparedness': {
    category: 'public-safety-preparedness',
    supportedByDefault: true,
    targetSectionId: 'recommendations',
    destinationFieldPath: 'externalData.eventSpecificPreparednessAdvisories',
    destinationLabel: 'Stage 4 Event-Specific Official Advisories (Section 7)',
    supportsAddSeparate: true,
    scientificGuardrail:
      'Stays pending officer verification (eventSpecificAdvisoriesVerified=false) during local draft transfer.',
  },
  'official-bulletins': {
    category: 'official-bulletins',
    supportedByDefault: false,
    targetSectionId: 'overview',
    destinationFieldPath: null,
    destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
    supportsAddSeparate: false,
    scientificGuardrail:
      'Core EQP earthquake parameters, PLOT solutions, phase picks, and preferred magnitudes are protected from automated/research overwrite.',
  },
  'reported-intensities': {
    category: 'reported-intensities',
    supportedByDefault: false,
    targetSectionId: 'intensity',
    destinationFieldPath: null,
    destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
    supportsAddSeparate: false,
    scientificGuardrail:
      'External reported intensities and modeled ShakeMap/DYFI MMI cannot write directly into verified EQP PEIS records.',
  },
  'aftershock-cutoffs': {
    category: 'aftershock-cutoffs',
    supportedByDefault: false,
    targetSectionId: 'aftershocks',
    destinationFieldPath: null,
    destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
    supportsAddSeparate: false,
    scientificGuardrail:
      'Stage 3 aftershock statistics derive exclusively from validated EQP/catalog analysis and are protected from narrative scrape overwrite.',
  },
};

export interface R3FindingStage4MappingResolution {
  supported: boolean;
  subKind: R3Stage4MappingSubKind;
  targetSectionId: PrimerSectionKey;
  targetSubsectionId: string;
  destinationFieldPath: string | null;
  destinationLabel: string;
  hazardCategory?: PrimerHazardCategory;
  supportsAddSeparate: boolean;
  unsupportedReason: string | null;
}

const SEA_LEVEL_MEASUREMENT_PATTERN =
  /\b(?:tide\s*gauge|sea[-\s]?level\s*(?:station|reading|observation|height|gauge|record)|wave\s*height|tsunameter|dart\s*buoy|cm\b|centimeter|meters?\b)\b/i;

function isUsgsRawTsunamiFlagFinding(finding: CandidateScientificFinding): boolean {
  if (finding.findingId.endsWith('usgs_tsunami_flag')) return true;
  if (
    finding.structuredValues &&
    Object.prototype.hasOwnProperty.call(finding.structuredValues, 'tsunamiFlagRaw')
  ) {
    return true;
  }
  return /usgs tsunami flag/i.test(finding.findingTitle);
}

export function resolveFindingStage4Mapping(
  finding: CandidateScientificFinding,
  source?: PrimerResearchSourceRecord | null
): R3FindingStage4MappingResolution {
  const reg = R2_TO_STAGE4_MAPPING_REGISTRY[finding.category];

  // Category 11-13: strictly unsupported direct destinations
  if (!reg || !reg.supportedByDefault) {
    return {
      supported: false,
      subKind: 'unsupported-no-direct-transfer',
      targetSectionId: reg?.targetSectionId ?? R2_CATEGORY_TARGET_PRIMER_SECTION[finding.category],
      targetSubsectionId: finding.category,
      destinationFieldPath: null,
      destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
      supportsAddSeparate: false,
      unsupportedReason:
        reg?.scientificGuardrail ??
        `${NO_SUPPORTED_DIRECT_TRANSFER_LABEL}: Category has no safe Stage 4 destination.`,
    };
  }

  // Scientific epistemic block: modeled USGS products (ShakeMap, LossPAGER, Ground-Failure)
  if (finding.category === 'tsunami-sea-level') {
    if (isUsgsRawTsunamiFlagFinding(finding)) {
      return {
        supported: false,
        subKind: 'unsupported-no-direct-transfer',
        targetSectionId: 'hazards',
        targetSubsectionId: 'hazards-tsunami',
        destinationFieldPath: null,
        destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
        supportsAddSeparate: false,
        unsupportedReason:
          `${NO_SUPPORTED_DIRECT_TRANSFER_LABEL}: Raw USGS tsunami flag (0/1) cannot set official PHIVOLCS tsunami advisory status. Retain in Evidence Library or attach an official tsunami bulletin.`,
      };
    }

    const combined = `${finding.findingTitle} ${finding.extractedStatement} ${finding.originalUnits ?? ''}`;
    const looksLikeSeaLevelStation =
      SEA_LEVEL_MEASUREMENT_PATTERN.test(combined) &&
      !/no\s+(?:destructive\s+)?tsunami\s+threat|tsunami\s+(?:warning|advisory|information|cancellation)\s*(?:no\.?|bulletin)/i.test(
        finding.findingTitle
      );

    if (looksLikeSeaLevelStation) {
      return {
        supported: true,
        subKind: 'tsunami-sea-level-observation',
        targetSectionId: 'hazards',
        targetSubsectionId: 'hazards-tsunami',
        destinationFieldPath: 'externalData.tsunami.seaLevelObservations',
        destinationLabel: 'Stage 4 Tsunami Sea-Level / Tide-Gauge Observations (Section 6)',
        supportsAddSeparate: true,
        unsupportedReason: null,
      };
    }

    return {
      supported: true,
      subKind: 'tsunami-official-advisory',
      targetSectionId: 'hazards',
      targetSubsectionId: 'hazards-tsunami',
      destinationFieldPath: 'externalData.tsunami',
      destinationLabel: 'Stage 4 Official Tsunami Information / Advisory (Section 6)',
      supportsAddSeparate: false,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'landslides-rockfalls') {
    if (
      finding.epistemicBasis === 'modeled' ||
      finding.findingId.endsWith('usgs_gf_landslide') ||
      (source?.sourceCategory === 'usgs-event-product' && finding.epistemicBasis === 'estimated')
    ) {
      return {
        supported: false,
        subKind: 'unsupported-no-direct-transfer',
        targetSectionId: 'hazards',
        targetSubsectionId: 'hazards-landslides',
        destinationFieldPath: null,
        destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
        supportsAddSeparate: false,
        unsupportedReason:
          `${NO_SUPPORTED_DIRECT_TRANSFER_LABEL}: Modeled/estimated ground-failure alerts cannot be transferred as observed field landslides.`,
      };
    }
    return {
      supported: true,
      subKind: 'hazard-landslides',
      targetSectionId: 'hazards',
      targetSubsectionId: 'hazards-landslides',
      destinationFieldPath: 'externalData.hazardObservations[landslides]',
      destinationLabel: reg.destinationLabel,
      hazardCategory: 'landslides',
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'liquefaction-deformation') {
    if (
      finding.epistemicBasis === 'modeled' ||
      finding.findingId.endsWith('usgs_gf_liquefaction') ||
      (source?.sourceCategory === 'usgs-event-product' && finding.epistemicBasis === 'estimated')
    ) {
      return {
        supported: false,
        subKind: 'unsupported-no-direct-transfer',
        targetSectionId: 'hazards',
        targetSubsectionId: 'hazards-liquefaction',
        destinationFieldPath: null,
        destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
        supportsAddSeparate: false,
        unsupportedReason:
          `${NO_SUPPORTED_DIRECT_TRANSFER_LABEL}: Modeled/estimated liquefaction alerts cannot be transferred as confirmed field observations.`,
      };
    }
    return {
      supported: true,
      subKind: 'hazard-liquefaction',
      targetSectionId: 'hazards',
      targetSubsectionId: 'hazards-liquefaction',
      destinationFieldPath: 'externalData.hazardObservations[liquefaction]',
      destinationLabel: reg.destinationLabel,
      hazardCategory: 'liquefaction',
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'structural-infrastructure') {
    if (
      finding.epistemicBasis === 'modeled' ||
      finding.epistemicBasis === 'estimated' ||
      finding.findingId.endsWith('usgs_losspager')
    ) {
      return {
        supported: false,
        subKind: 'unsupported-no-direct-transfer',
        targetSectionId: 'hazards',
        targetSubsectionId: 'hazards-structural_damage',
        destinationFieldPath: null,
        destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
        supportsAddSeparate: false,
        unsupportedReason:
          `${NO_SUPPORTED_DIRECT_TRANSFER_LABEL}: Modeled LossPAGER or shaking estimates cannot claim observed structural damage.`,
      };
    }
    return {
      supported: true,
      subKind: 'hazard-structural-damage',
      targetSectionId: 'hazards',
      targetSubsectionId: 'hazards-structural_damage',
      destinationFieldPath: 'externalData.hazardObservations[structural_damage]',
      destinationLabel: reg.destinationLabel,
      hazardCategory: 'structural_damage',
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'tectonic-generators') {
    return {
      supported: true,
      subKind: 'tectonic-interpretation',
      targetSectionId: 'tectonic_setting',
      targetSubsectionId: 'tectonic-generator',
      destinationFieldPath: 'externalData.tectonic',
      destinationLabel: reg.destinationLabel,
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'focal-mechanism-products') {
    return {
      supported: true,
      subKind: 'tectonic-focal-mechanism',
      targetSectionId: 'tectonic_setting',
      targetSubsectionId: 'tectonic-generator',
      destinationFieldPath: 'externalData.tectonic.evidenceReferences',
      destinationLabel: reg.destinationLabel,
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'volcano-monitoring') {
    return {
      supported: true,
      subKind: 'volcano-monitoring',
      targetSectionId: 'hazards',
      targetSubsectionId: 'hazards-volcano',
      destinationFieldPath: 'externalData.volcano',
      destinationLabel: reg.destinationLabel,
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'phivolcs-monitoring-qrt') {
    return {
      supported: true,
      subKind: 'monitoring-qrt-response',
      targetSectionId: 'recommendations',
      targetSubsectionId: 'rec-monitoring-response',
      destinationFieldPath: 'externalData.monitoringResponse',
      destinationLabel: reg.destinationLabel,
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'agency-coordination') {
    return {
      supported: true,
      subKind: 'monitoring-agency-coordination',
      targetSectionId: 'recommendations',
      targetSubsectionId: 'rec-monitoring-response',
      destinationFieldPath: 'externalData.monitoringResponse.lguAgencyCoordination',
      destinationLabel: reg.destinationLabel,
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  if (finding.category === 'public-safety-preparedness') {
    return {
      supported: true,
      subKind: 'preparedness-event-advisory',
      targetSectionId: 'recommendations',
      targetSubsectionId: 'rec-event-advisories',
      destinationFieldPath: 'externalData.eventSpecificPreparednessAdvisories',
      destinationLabel: reg.destinationLabel,
      supportsAddSeparate: true,
      unsupportedReason: null,
    };
  }

  return {
    supported: false,
    subKind: 'unsupported-no-direct-transfer',
    targetSectionId: R2_CATEGORY_TARGET_PRIMER_SECTION[finding.category],
    targetSubsectionId: finding.category,
    destinationFieldPath: null,
    destinationLabel: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
    supportsAddSeparate: false,
    unsupportedReason: `${NO_SUPPORTED_DIRECT_TRANSFER_LABEL}: Unmapped category.`,
  };
}

// =============================================================================
// SOURCE OFFICIALITY & EVENT-MATCH RESOLUTION (NO BLIND DOMAIN TRUST)
// =============================================================================

const RECOGNIZED_OFFICIAL_ORGS: RegExp[] = [
  /\bDOST[-\s]?PHIVOLCS\b/i,
  /\bPHIVOLCS\b/i,
  /\bUSGS\b/i,
  /\bPTWC\b/i,
  /\bNOAA\b/i,
  /\bNDRRMC\b/i,
  /\bOCD\b/i,
  /\bJMA\b/i,
  /\bNAMRIA\b/i,
];

export interface R3SourceAuthorityAssessment {
  isRecognizedOfficialAgencySource: boolean;
  assessmentBasis: string;
  neverInferredFromDomainAlone: true;
  neverInferredFromAiTextAlone: true;
}

/**
 * Evaluates official source status strictly from provenance channel, sourceCategory,
 * and structured agency records — never solely from URL domain names or AI descriptions.
 */
export function assessSourceOfficialAuthority(
  source: PrimerResearchSourceRecord | null | undefined,
  finding: CandidateScientificFinding
): R3SourceAuthorityAssessment {
  if (!source) {
    return {
      isRecognizedOfficialAgencySource: false,
      assessmentBasis: 'Source record unavailable in R1 Source Library.',
      neverInferredFromDomainAlone: true,
      neverInferredFromAiTextAlone: true,
    };
  }

  const isApiOrAllowlistedChannel =
    source.originProvenance.channel === 'usgs-comcat-detail' ||
    source.originProvenance.channel === 'safe-url-fetch';

  const isOfficialCategory =
    source.sourceCategory === 'official-update' ||
    source.sourceCategory === 'tsunami-advisory' ||
    source.sourceCategory === 'usgs-event-product' ||
    source.sourceCategory === 'monitoring-response' ||
    source.sourceCategory === 'field-investigation';

  const orgMatchesRecognized = RECOGNIZED_OFFICIAL_ORGS.some((re) =>
    re.test(source.organization || '')
  );

  // Domain string alone NEVER proves official status; AI extraction text NEVER proves officiality.
  const isOfficial =
    isApiOrAllowlistedChannel &&
    isOfficialCategory &&
    orgMatchesRecognized &&
    source.retrievalStatus === 'retrieved' &&
    finding.extractionMethod !== 'gemini';

  return {
    isRecognizedOfficialAgencySource: isOfficial,
    assessmentBasis: isOfficial
      ? `Retrieved official ${source.organization} source (${source.sourceCategory}) via verified server/API channel (${source.originProvenance.channel}).`
      : `Local, unverified, or AI-extracted record (${source.originProvenance.channel} · method=${finding.extractionMethod}); not treated as authenticated institutional authority solely from domain string or AI text.`,
    neverInferredFromDomainAlone: true,
    neverInferredFromAiTextAlone: true,
  };
}

/**
 * Allows a local operator to document an event-match resolution for 'ambiguous-match'
 * or 'insufficient-evidence' sources without mutating nonmatching events or silently
 * promoting 'probable-match' to 'confirmed-id-match'.
 */
export function documentEventMatchResolution(
  source: PrimerResearchSourceRecord,
  activeEvent: EQPEvent,
  input: {
    rationale: string;
    supportingEvidence: string;
    operatorLabel?: string;
    nowUtc?: string;
  }
): PrimerResearchSourceRecord {
  if (source.linkedEqpEventId !== activeEvent.id) {
    throw new Error(
      `Event ID mismatch: source links to ${source.linkedEqpEventId}, active event is ${activeEvent.id}.`
    );
  }
  if (source.eventMatchState === 'nonmatching-event') {
    throw new Error(
      'Sources classified as "nonmatching-event" cannot be resolved for transfer to this earthquake.'
    );
  }
  if (source.eventMatchState === 'probable-match') {
    throw new Error(
      'Probable event matches must preserve their automated probable-match classification and are never promoted silently to confirmed-id-match.'
    );
  }
  if (source.eventMatchState === 'confirmed-id-match') {
    return structuredClone(source);
  }

  const rationale = sanitizeUntrustedTextValue(input.rationale, 600);
  const supportingEvidence = sanitizeUntrustedTextValue(input.supportingEvidence, 600);
  if (!rationale || !supportingEvidence) {
    throw new Error(
      'Documented rationale and supporting evidence are both required to resolve an ambiguous or insufficient-evidence event match.'
    );
  }

  const resolution: ResearchEventMatchOperatorResolution = {
    resolvedForDraftTransfer: true,
    priorAutoState: source.eventMatchState,
    resolvedByLabel:
      sanitizeUntrustedTextValue(input.operatorLabel, 120) ||
      'Local Operator (Unverified)',
    resolvedAtUtc: input.nowUtc ?? new Date().toISOString(),
    rationale,
    supportingEvidence,
  };

  return {
    ...structuredClone(source),
    // Keep original eventMatchState intact; record resolution transparently inside eventMatchDetails!
    eventMatchDetails: {
      ...structuredClone(source.eventMatchDetails),
      operatorResolution: resolution,
      caveats: Array.from(
        new Set([
          ...source.eventMatchDetails.caveats,
          `Operator event-match resolution documented (${resolution.resolvedAtUtc}) by ${resolution.resolvedByLabel} for local draft evaluation only (prior automated classification "${source.eventMatchState}" preserved).`,
        ])
      ),
    },
  };
}

// =============================================================================
// A. TRANSFER ELIGIBILITY ENGINE (ALL 10 CRITERIA)
// =============================================================================

export interface R3EligibilityIssue {
  code:
    | 'linked-event-mismatch'
    | 'primer-event-mismatch'
    | 'frozen-revision-immutable'
    | 'no-active-primer-draft'
    | 'event-match-nonmatching'
    | 'event-match-unresolved'
    | 'event-match-probable-unverified'
    | 'source-missing'
    | 'source-archived'
    | 'source-superseded-by-newer-version'
    | 'finding-superseded'
    | 'finding-relevance-excluded'
    | 'finding-rejected-by-operator'
    | 'source-hash-mismatch'
    | 'missing-evidence-reference'
    | 'evidence-unresolved'
    | 'no-supported-direct-transfer'
    | 'missing-critical-scientific-value'
    | 'cross-source-conflict-present'
    | 'destination-already-populated'
    | 'destination-edited-section'
    | 'duplicate-already-applied'
    | 'plot-solution-stale'
    | 'event-drift-since-match'
    | 'local-or-restricted-source';
  criterion: string;
  message: string;
  resolvableByOperator: boolean;
}

export type R3StatusBucket =
  | 'eligible'
  | 'blocked'
  | 'no-supported-destination'
  | 'already-applied'
  | 'superseded'
  | 'rejected';

export interface R3TransferEligibilityResult {
  findingId: string;
  eligible: boolean;
  statusBucket: R3StatusBucket;
  blockers: R3EligibilityIssue[];
  warnings: R3EligibilityIssue[];
  mapping: R3FindingStage4MappingResolution;
  candidateSummary: PrimerResearchR3TransferCandidate;
  effectiveMatchState: ResearchEventMatchState;
  matchResolutionApplied: ResearchEventMatchOperatorResolution | null;
  canClassifyAsVerifiedFact: boolean;
  verifiedFactBlockReasons: string[];
  sourceAuthorityAssessment: R3SourceAuthorityAssessment;
  duplicateAlreadyApplied: boolean;
  priorAppliedTransfer: PrimerR3TransferProvenanceLink | null;
}

export interface EvaluateTransferEligibilityContext {
  activeEvent: EQPEvent;
  primer: PrimerDocument | null;
  source: PrimerResearchSourceRecord | null | undefined;
  allSources?: PrimerResearchSourceRecord[];
  allFindings?: CandidateScientificFinding[];
  auditRecords?: R3TransferAuditLogEntry[];
  isFrozenRevision?: boolean;
  isPlotResultStale?: boolean;
  primaryLocationLabel?: string | null;
}

export function evaluateFindingTransferEligibility(
  finding: CandidateScientificFinding,
  context: EvaluateTransferEligibilityContext
): R3TransferEligibilityResult {
  const { activeEvent, primer, source } = context;
  const blockers: R3EligibilityIssue[] = [];
  const warnings: R3EligibilityIssue[] = [];

  const mapping = resolveFindingStage4Mapping(finding, source);
  const authority = assessSourceOfficialAuthority(source, finding);

  // 1. Linked earthquake identity & frozen snapshot check
  if (context.isFrozenRevision) {
    blockers.push({
      code: 'frozen-revision-immutable',
      criterion: '1. Linked Earthquake & Target State',
      message: 'Frozen Stage 6A historical revisions are immutable. Restore as a working draft before transferring findings.',
      resolvableByOperator: false,
    });
  }
  if (finding.linkedEqpEventId !== activeEvent.id) {
    blockers.push({
      code: 'linked-event-mismatch',
      criterion: '1. Linked Earthquake Identity',
      message: `Finding is linked to ${finding.linkedEqpEventId}, which does not match active event ${activeEvent.id}.`,
      resolvableByOperator: false,
    });
  }
  if (primer && primer.eventId !== activeEvent.id) {
    blockers.push({
      code: 'primer-event-mismatch',
      criterion: '1. Linked Earthquake Identity',
      message: `Target primer belongs to ${primer.eventId}, not active event ${activeEvent.id}.`,
      resolvableByOperator: false,
    });
  }

  // 2. Event-match classification
  const effectiveMatchState: ResearchEventMatchState =
    source?.eventMatchState ?? finding.eventMatchState;
  const matchResolutionApplied = source?.eventMatchDetails?.operatorResolution ?? null;

  if (effectiveMatchState === 'nonmatching-event' || finding.excludedByNonMatchingEvent) {
    blockers.push({
      code: 'event-match-nonmatching',
      criterion: '2. Event-Match Classification',
      message:
        'Source or finding is classified as nonmatching-event and is strictly blocked from transfer.',
      resolvableByOperator: false,
    });
  } else if (
    effectiveMatchState === 'ambiguous-match' ||
    effectiveMatchState === 'insufficient-evidence'
  ) {
    const validRes =
      matchResolutionApplied &&
      matchResolutionApplied.resolvedForDraftTransfer &&
      matchResolutionApplied.rationale.trim().length > 0 &&
      matchResolutionApplied.supportingEvidence.trim().length > 0 &&
      source?.eventMatchDetails?.activeEqpEventId === activeEvent.id;

    if (!validRes) {
      blockers.push({
        code: 'event-match-unresolved',
        criterion: '2. Event-Match Classification',
        message: `Event match is "${EVENT_MATCH_STATE_LABELS[effectiveMatchState]}". Operator must document event-match rationale and supporting evidence before transfer.`,
        resolvableByOperator: true,
      });
    } else {
      warnings.push({
        code: 'event-match-unresolved',
        criterion: '2. Event-Match Classification',
        message: `Prior auto state "${effectiveMatchState}" resolved for local draft transfer by ${matchResolutionApplied.resolvedByLabel} (NOT promoted to confirmed-id-match).`,
        resolvableByOperator: false,
      });
    }
  } else if (effectiveMatchState === 'probable-match') {
    warnings.push({
      code: 'event-match-probable-unverified',
      criterion: '2. Event-Match Classification',
      message:
        'Source carries "probable-match" classification (unverified against primary agency ID; never silently promoted to confirmed match).',
      resolvableByOperator: false,
    });
  }

  // 3. Source availability & document version
  let isSuperseded = false;
  if (!source) {
    blockers.push({
      code: 'source-missing',
      criterion: '3. Source Availability & Version',
      message: `Backing R1 source record "${finding.sourceId}" is missing from the local source library.`,
      resolvableByOperator: false,
    });
  } else {
    if (source.archived) {
      blockers.push({
        code: 'source-archived',
        criterion: '3. Source Availability & Version',
        message: 'Backing R1 source record is archived; unarchive before transferring.',
        resolvableByOperator: true,
      });
    }
    const newerInLibrary = (context.allSources ?? []).some(
      (s) =>
        s.linkedEqpEventId === source.linkedEqpEventId &&
        s.duplicateGroupKey === source.duplicateGroupKey &&
        s.versionNumber > source.versionNumber &&
        !s.archived
    );
    if (source.supersededBySourceId || newerInLibrary) {
      isSuperseded = true;
      blockers.push({
        code: 'source-superseded-by-newer-version',
        criterion: '3. Source Availability & Version',
        message: `Source v${source.versionNumber} is superseded by a newer source version. Revalidate or review findings from the latest version.`,
        resolvableByOperator: false,
      });
    }
  }

  if (finding.supersededByRunId) {
    isSuperseded = true;
    blockers.push({
      code: 'finding-superseded',
      criterion: '3. Finding Version',
      message: `Finding was superseded by newer extraction run "${finding.supersededByRunId}".`,
      resolvableByOperator: false,
    });
  }

  if (finding.relevanceStatus !== 'active') {
    blockers.push({
      code: 'finding-relevance-excluded',
      criterion: '3. Operator Relevance Filter',
      message: `Finding is excluded as "${finding.relevanceStatus}". Restore to active before transfer.`,
      resolvableByOperator: true,
    });
  }

  // Check operator rejection history
  const relevantAudit = (context.auditRecords ?? []).filter(
    (r) =>
      r.linkedEqpEventId === activeEvent.id &&
      r.findingId === finding.findingId &&
      r.sourceId === finding.sourceId &&
      r.sourceVersionNumber === finding.sourceVersionNumber
  );
  const latestAction = relevantAudit[0] ?? null;
  const isRejectedByOperator = latestAction?.action === 'transfer-rejected';
  if (isRejectedByOperator) {
    blockers.push({
      code: 'finding-rejected-by-operator',
      criterion: '3. Local Transfer Decision',
      message: `Finding was rejected by operator on ${latestAction.recordedAtUtc}${latestAction.notes ? ` (${latestAction.notes})` : ''}.`,
      resolvableByOperator: false,
    });
  }

  // 4. Source content hash & evidence reference
  if (
    source &&
    source.contentSha256 &&
    finding.sourceContentSha256 &&
    source.contentSha256 !== finding.sourceContentSha256
  ) {
    blockers.push({
      code: 'source-hash-mismatch',
      criterion: '4. Source Content Hash',
      message: `Finding SHA-256 (${finding.sourceContentSha256.slice(0, 10)}) does not match current source record (${source.contentSha256.slice(0, 10)}). Re-extract findings first.`,
      resolvableByOperator: false,
    });
  }

  if (!finding.evidencePassage.trim() && !finding.sourceReference.trim()) {
    blockers.push({
      code: 'missing-evidence-reference',
      criterion: '4. Evidence Reference',
      message: 'Finding has neither a supporting passage nor a verifiable source reference.',
      resolvableByOperator: false,
    });
  }

  // 5. Evidence validation state
  if (
    finding.evidenceValidationStatus === 'evidence-unresolved' ||
    finding.evidenceValidationStatus === 'scanned-no-text' ||
    finding.evidenceValidationStatus === 'insufficient-evidence'
  ) {
    blockers.push({
      code: 'evidence-unresolved',
      criterion: '5. Evidence Validation State',
      message: `Evidence status is "${finding.evidenceValidationStatus}" (${finding.evidenceValidationNote}). Unresolved or scanned-no-text findings cannot be transferred to PRIMER fields.`,
      resolvableByOperator: false,
    });
  }

  // 6. Supported Stage 4 destination mapping
  if (!mapping.supported) {
    blockers.push({
      code: 'no-supported-direct-transfer',
      criterion: '6. Scientific Destination Mapping',
      message:
        mapping.unsupportedReason ??
        `${NO_SUPPORTED_DIRECT_TRANSFER_LABEL}: No compatible PRIMER Stage 4 destination.`,
      resolvableByOperator: false,
    });
  }

  // 7. Missing critical scientific values & cross-source conflicts
  if (
    mapping.supported &&
    mapping.subKind === 'tsunami-sea-level-observation' &&
    !finding.originalValue?.trim() &&
    !finding.extractedStatement.trim()
  ) {
    blockers.push({
      code: 'missing-critical-scientific-value',
      criterion: '7. Scientific Values Completeness',
      message: 'Sea-level observation finding lacks both measurement value and descriptive station note.',
      resolvableByOperator: false,
    });
  }

  if (finding.conflictGroupId || finding.conflictKind) {
    warnings.push({
      code: 'cross-source-conflict-present',
      criterion: '7. Cross-Source Comparison',
      message:
        finding.conflictSummary ||
        `Finding belongs to cross-source comparison cluster (${finding.conflictKind ?? 'conflict'}). Inspect alternative sources before applying.`,
      resolvableByOperator: true,
    });
  }

  // 8. Destination field status & idempotency
  const pkg4 = primer?.extensions?.scientificNarrativePackage;
  const r3Links = pkg4?.externalData.r3TransferredSources ?? [];
  const priorMatch =
    r3Links.find(
      (link) =>
        link.findingId === finding.findingId &&
        link.sourceId === finding.sourceId &&
        link.sourceVersionNumber === finding.sourceVersionNumber &&
        link.destinationFieldPath === (mapping.destinationFieldPath ?? '')
    ) ?? null;
  const duplicateAlreadyApplied = Boolean(priorMatch);

  if (!primer) {
    warnings.push({
      code: 'no-active-primer-draft',
      criterion: '8. Target PRIMER Draft',
      message:
        'Generate or select a local PRIMER draft before applying findings (inspection and event-match resolution remain available).',
      resolvableByOperator: true,
    });
  } else if (mapping.supported) {
    const destStatus = inspectStage4DestinationStatus(
      primer,
      mapping,
      pkg4?.externalData ?? createDefaultStage4ExternalData(activeEvent)
    );
    if (destStatus.hasExistingContent) {
      warnings.push({
        code: 'destination-already-populated',
        criterion: '8. Destination Field Status',
        message: destStatus.summary,
        resolvableByOperator: true,
      });
    }
    if (destStatus.targetSectionIsEdited) {
      warnings.push({
        code: 'destination-edited-section',
        criterion: '8. Human-Edited Narrative Protection',
        message: `Destination PRIMER section "${mapping.targetSectionId}" has manual edits (isEdited=true). Section prose will remain untouched unless you explicitly click "Sync to Section".`,
        resolvableByOperator: false,
      });
    }
  }

  // 9. Event and Stage 4 freshness
  if (context.isPlotResultStale) {
    warnings.push({
      code: 'plot-solution-stale',
      criterion: '9. Event Freshness',
      message: 'Active PLOT location solution is stale relative to modified phase picks.',
      resolvableByOperator: false,
    });
  }
  const activeFp = computePrimerEventFingerprint(activeEvent, {
    primaryLocationLabel: context.primaryLocationLabel,
    isPlotResultStale: context.isPlotResultStale,
  });
  if (
    source?.eventMatchDetails?.activeEventFingerprint &&
    source.eventMatchDetails.activeEventFingerprint !== activeFp
  ) {
    warnings.push({
      code: 'event-drift-since-match',
      criterion: '9. Event Freshness',
      message:
        'Active EQP event parameters changed after R1 source matching ran. Re-check source match details.',
      resolvableByOperator: false,
    });
  }

  // 10. Source restrictions & officiality check
  if (source && isSourceRestrictedOrLocal(source)) {
    warnings.push({
      code: 'local-or-restricted-source',
      criterion: '10. Source Restrictions & Classification',
      message:
        'Source is a local file import or carries internal/restricted markers; keep Stage 4 state preliminary unless independently verified.',
      resolvableByOperator: false,
    });
  }

  // Verified-fact strict gating check
  const verifiedFactBlockReasons: string[] = [];
  if (!authority.isRecognizedOfficialAgencySource) {
    verifiedFactBlockReasons.push(authority.assessmentBasis);
  }
  if (effectiveMatchState !== 'confirmed-id-match') {
    verifiedFactBlockReasons.push(
      `Event match is "${effectiveMatchState}" (confirmed-id-match required for Verified Fact classification).`
    );
  }
  if (finding.evidenceValidationStatus !== 'source-verified') {
    verifiedFactBlockReasons.push(
      `Evidence status is "${finding.evidenceValidationStatus}" (verbatim quote verification required for Verified Fact).`
    );
  }
  if (finding.epistemicBasis === 'modeled' || finding.epistemicBasis === 'estimated') {
    verifiedFactBlockReasons.push(
      `Epistemic basis "${finding.epistemicBasis}" cannot be promoted to Verified Fact.`
    );
  }
  if (finding.conflictKind && finding.conflictKind !== 'duplicate-finding') {
    verifiedFactBlockReasons.push(
      `Active cross-source conflict/scale caveat (${finding.conflictKind}) requires keeping Preliminary Review.`
    );
  }

  const canClassifyAsVerifiedFact = verifiedFactBlockReasons.length === 0;
  const eligible = blockers.length === 0 && !duplicateAlreadyApplied;

  let statusBucket: R3StatusBucket = 'eligible';
  if (duplicateAlreadyApplied) {
    statusBucket = 'already-applied';
  } else if (isRejectedByOperator) {
    statusBucket = 'rejected';
  } else if (isSuperseded) {
    statusBucket = 'superseded';
  } else if (!mapping.supported) {
    statusBucket = 'no-supported-destination';
  } else if (blockers.length > 0) {
    statusBucket = 'blocked';
  }

  const candidateSummary: PrimerResearchR3TransferCandidate = {
    findingId: finding.findingId,
    sourceId: finding.sourceId,
    category: finding.category,
    targetSection: mapping.targetSectionId,
    proposedFieldPath: mapping.destinationFieldPath ?? NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
    candidateValueSummary: formatScientificCandidateSummary(finding),
    evidenceValidationStatus: finding.evidenceValidationStatus,
    eventMatchState: effectiveMatchState,
    conflictKind: finding.conflictKind,
    eligibleForTransfer: eligible,
    blockingReason:
      blockers.length > 0
        ? blockers.map((b) => b.message).join(' | ')
        : duplicateAlreadyApplied
          ? 'Already applied to this primer draft.'
          : null,
  };

  return {
    findingId: finding.findingId,
    eligible,
    statusBucket,
    blockers,
    warnings,
    mapping,
    candidateSummary,
    effectiveMatchState,
    matchResolutionApplied,
    canClassifyAsVerifiedFact,
    verifiedFactBlockReasons,
    sourceAuthorityAssessment: authority,
    duplicateAlreadyApplied,
    priorAppliedTransfer: priorMatch,
  };
}

// =============================================================================
// C & D. SCIENTIFIC VALUE CONVERSION & BEFORE/AFTER PREVIEW
// =============================================================================

/**
 * Formats candidate finding preserving original units, exact magnitude scale (no homogenization),
 * observation/cutoff timestamps, issuing agency, and scientific epistemic qualifications.
 */
export function formatScientificCandidateSummary(
  finding: CandidateScientificFinding
): string {
  const parts: string[] = [];
  if (finding.originalValue) {
    parts.push(
      `${finding.originalValue}${finding.originalUnits ? ` ${finding.originalUnits}` : ''}`
    );
  }
  if (finding.observationTimeRaw) {
    parts.push(
      `Obs: ${finding.observationTimeRaw}${finding.observationTimeZone ? ` ${finding.observationTimeZone}` : ''}`
    );
  }
  parts.push(`[${finding.epistemicBasis}] ${finding.extractedStatement}`);
  return parts.join(' · ');
}

interface Stage4DestinationInspection {
  hasExistingContent: boolean;
  isExistingVerifiedOrReady: boolean;
  summary: string;
  currentState: PrimerContentState;
  targetSectionIsEdited: boolean;
}

function inspectStage4DestinationStatus(
  primer: PrimerDocument,
  mapping: R3FindingStage4MappingResolution,
  externalData: PrimerStage4ExternalData
): Stage4DestinationInspection {
  const targetSection = primer.sections.find((s) => s.id === mapping.targetSectionId);
  const pkg4 = primer.extensions?.scientificNarrativePackage;
  const block = pkg4?.sectionNarratives[mapping.targetSectionId];
  const sub = block?.subsections.find((u) => u.id === mapping.targetSubsectionId);

  const targetSectionIsEdited = Boolean(targetSection?.isEdited);
  const fallbackState: PrimerContentState =
    sub?.contentState ?? block?.contentState ?? 'unavailable-or-unresolved';

  switch (mapping.subKind) {
    case 'tsunami-official-advisory': {
      const tsu = externalData.tsunami;
      const hasAdv =
        tsu.state === 'official-warning-or-advisory' ||
        tsu.state === 'official-no-tsunami' ||
        Boolean(tsu.officialAdvisoryId.trim()) ||
        Boolean(tsu.notes.trim());
      const isVerified =
        (tsu.state === 'official-warning-or-advisory' ||
          tsu.state === 'official-no-tsunami') &&
        Boolean(tsu.officialAdvisoryId.trim() && tsu.issuingAgency.trim());
      return {
        hasExistingContent: hasAdv || tsu.state === 'awaiting-verification',
        isExistingVerifiedOrReady: isVerified,
        summary: hasAdv
          ? `State=${tsu.state}; Advisory=${tsu.officialAdvisoryId || 'N/A'}; Agency=${tsu.issuingAgency}; Areas=${tsu.affectedCoastalAreas || 'unspecified'}; Ref=${tsu.sourceDocumentRef || 'none'}`
          : `State=${tsu.state} (no official advisory attached yet)`,
        currentState: isVerified
          ? 'verified-fact'
          : hasAdv
            ? 'preliminary-review'
            : 'unavailable-or-unresolved',
        targetSectionIsEdited,
      };
    }

    case 'tsunami-sea-level-observation': {
      const obsList = externalData.tsunami.seaLevelObservations;
      const hasAnyReady = obsList.some((o) => o.reviewStatus === 'ready-for-review');
      return {
        hasExistingContent: obsList.length > 0,
        isExistingVerifiedOrReady: hasAnyReady,
        summary:
          obsList.length > 0
            ? `${obsList.length} observation(s): ${obsList
                .slice(0, 3)
                .map((o) => `${o.stationName} (${o.maxWaveHeightM || '?'} m @ ${o.observedAtUtc})`)
                .join('; ')}`
            : 'No sea-level station observations recorded yet',
        currentState: hasAnyReady
          ? 'verified-fact'
          : obsList.length > 0
            ? 'preliminary-review'
            : 'unavailable-or-unresolved',
        targetSectionIsEdited,
      };
    }

    case 'hazard-landslides':
    case 'hazard-liquefaction':
    case 'hazard-structural-damage': {
      const hazType = mapping.hazardCategory!;
      const matching = externalData.hazardObservations.filter(
        (h) => h.hazardType === hazType
      );
      const anyVerified = matching.some((m) => m.reviewStatus === 'ready-for-review');
      return {
        hasExistingContent: matching.length > 0,
        isExistingVerifiedOrReady: anyVerified,
        summary:
          matching.length > 0
            ? `${matching.length} recorded observation(s): ${matching
                .slice(0, 2)
                .map((m) => `${m.location}: ${m.description.slice(0, 90)}`)
                .join(' | ')}`
            : `No ${hazType} observations recorded (general approved guidance template active)`,
        currentState: anyVerified
          ? 'verified-fact'
          : matching.length > 0
            ? 'preliminary-review'
            : 'approved-general-template',
        targetSectionIsEdited,
      };
    }

    case 'tectonic-interpretation':
    case 'tectonic-focal-mechanism': {
      const tec = externalData.tectonic;
      const hasContent =
        Boolean(tec.expertInterpretation.trim()) ||
        Boolean(tec.evidenceReferences.trim());
      const isReady = tec.reviewStatus === 'ready-for-review' && hasContent;
      return {
        hasExistingContent: hasContent,
        isExistingVerifiedOrReady: isReady,
        summary: hasContent
          ? `Status=${tec.reviewStatus}; Interpretation="${tec.expertInterpretation.slice(0, 140) || 'Pending'}"; Refs="${tec.evidenceReferences.slice(0, 100) || 'None'}"`
          : 'Expert causal interpretation & focal mechanism references pending',
        currentState: isReady ? 'verified-fact' : hasContent ? 'preliminary-review' : fallbackState,
        targetSectionIsEdited,
      };
    }

    case 'volcano-monitoring': {
      const vol = externalData.volcano;
      const hasContent =
        Boolean(vol.expertStatement.trim()) ||
        Boolean(vol.citedMonitoringObservations.trim());
      const isReady = vol.reviewStatus === 'ready-for-review' && hasContent;
      return {
        hasExistingContent: hasContent,
        isExistingVerifiedOrReady: isReady,
        summary: hasContent
          ? `Status=${vol.reviewStatus}; Observations="${vol.citedMonitoringObservations.slice(0, 140) || vol.expertStatement.slice(0, 140)}"`
          : 'No volcano observatory monitoring citations attached yet',
        currentState: isReady ? 'verified-fact' : hasContent ? 'preliminary-review' : 'unavailable-or-unresolved',
        targetSectionIsEdited,
      };
    }

    case 'monitoring-qrt-response': {
      const mr = externalData.monitoringResponse;
      const hasContent = Boolean(
        mr.monitoringActivities.trim() ||
          mr.fieldInvestigations.trim() ||
          mr.qrtDeployments.trim() ||
          mr.publishedProducts.trim()
      );
      const isReady = mr.reviewStatus === 'ready-for-review' && hasContent;
      return {
        hasExistingContent: hasContent,
        isExistingVerifiedOrReady: isReady,
        summary: hasContent
          ? `Status=${mr.reviewStatus}; Monitoring="${mr.monitoringActivities.slice(0, 80)}"; QRT="${mr.qrtDeployments.slice(0, 80)}"`
          : 'No PHIVOLCS QRT/monitoring activities supplied yet',
        currentState: isReady ? 'verified-fact' : hasContent ? 'preliminary-review' : 'unavailable-or-unresolved',
        targetSectionIsEdited,
      };
    }

    case 'monitoring-agency-coordination': {
      const mr = externalData.monitoringResponse;
      const hasContent = Boolean(mr.lguAgencyCoordination.trim());
      const isReady = mr.reviewStatus === 'ready-for-review' && hasContent;
      return {
        hasExistingContent: hasContent,
        isExistingVerifiedOrReady: isReady,
        summary: hasContent
          ? `Status=${mr.reviewStatus}; LGU/Agency="${mr.lguAgencyCoordination.slice(0, 140)}"`
          : 'No LGU / DRRMC / interagency coordination notes recorded yet',
        currentState: isReady ? 'verified-fact' : hasContent ? 'preliminary-review' : 'unavailable-or-unresolved',
        targetSectionIsEdited,
      };
    }

    case 'preparedness-event-advisory': {
      const hasContent = Boolean(externalData.eventSpecificPreparednessAdvisories.trim());
      const isReady = externalData.eventSpecificAdvisoriesVerified && hasContent;
      return {
        hasExistingContent: hasContent,
        isExistingVerifiedOrReady: isReady,
        summary: hasContent
          ? `Verified=${externalData.eventSpecificAdvisoriesVerified}; Text="${externalData.eventSpecificPreparednessAdvisories.slice(0, 140)}"`
          : 'No event-specific advisories entered yet (general preparedness templates active)',
        currentState: isReady ? 'verified-fact' : hasContent ? 'preliminary-review' : 'unavailable-or-unresolved',
        targetSectionIsEdited,
      };
    }

    default:
      return {
        hasExistingContent: false,
        isExistingVerifiedOrReady: false,
        summary: NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
        currentState: fallbackState,
        targetSectionIsEdited,
      };
  }
}

export interface R3FindingTransferPreview {
  eligible: boolean;
  eligibility: R3TransferEligibilityResult;
  finding: CandidateScientificFinding;
  source: PrimerResearchSourceRecord | null;
  targetSection: PrimerSectionKey;
  targetSectionTitle: string;
  destinationFieldPath: string | null;
  destinationLabel: string;
  currentFieldSummary: string;
  currentStage4State: PrimerContentState;
  proposedFieldSummary: string;
  defaultProposedState: 'preliminary-review' | 'verified-fact';
  allowedStates: Array<'preliminary-review' | 'verified-fact'>;
  supportsAddSeparate: boolean;
  hasExistingDestinationContent: boolean;
  isExistingDestinationVerified: boolean;
  requiresOverwriteConfirmation: boolean;
  targetSectionIsEdited: boolean;
  editedProtectionNote: string;
  conflictWarnings: string[];
  scientificQualifications: string[];
  provenanceSummary: string;
  stage4DiffSummary: PrimerResearchR3Stage4DiffPreview;
}

export function buildFindingTransferPreview(
  finding: CandidateScientificFinding,
  context: EvaluateTransferEligibilityContext,
  requestedResolutionMode?: R3CollisionResolutionMode
): R3FindingTransferPreview {
  const eligibility = evaluateFindingTransferEligibility(finding, context);
  const mapping = eligibility.mapping;
  const externalData =
    context.primer?.extensions?.scientificNarrativePackage?.externalData ??
    createDefaultStage4ExternalData(context.activeEvent);

  const dest = context.primer
    ? inspectStage4DestinationStatus(context.primer, mapping, externalData)
    : {
        hasExistingContent: false,
        isExistingVerifiedOrReady: false,
        summary: 'No active PRIMER draft selected yet.',
        currentState: 'unavailable-or-unresolved' as PrimerContentState,
        targetSectionIsEdited: false,
      };

  const targetSectionObj = context.primer?.sections.find(
    (s) => s.id === mapping.targetSectionId
  );

  const allowedStates: Array<'preliminary-review' | 'verified-fact'> =
    eligibility.canClassifyAsVerifiedFact
      ? ['preliminary-review', 'verified-fact']
      : ['preliminary-review'];

  const conflictWarnings: string[] = [];
  if (finding.conflictKind) {
    conflictWarnings.push(
      `Conflict flag (${finding.conflictKind}): ${finding.conflictSummary || 'Cross-source differences exist.'}`
    );
  }
  for (const w of eligibility.warnings) {
    if (w.code === 'destination-already-populated' || w.code === 'event-drift-since-match') {
      conflictWarnings.push(w.message);
    }
  }

  const scientificQualifications: string[] = [
    `Epistemic Basis: ${finding.epistemicBasis}`,
    `Evidence Validation: ${finding.evidenceValidationStatus} (${finding.evidenceLocator.label})`,
    `Event Match: ${eligibility.effectiveMatchState}${eligibility.matchResolutionApplied ? ' + Operator Documented Resolution' : ''}`,
    ...finding.caveats,
  ];
  if (finding.originalUnits) {
    scientificQualifications.push(
      `Preserved Unit / Scale: ${finding.originalValue ?? 'N/A'} ${finding.originalUnits} (no silent unit/scale equivalence).`
    );
  }

  const resolutionMode =
    requestedResolutionMode ??
    (dest.hasExistingContent && mapping.supportsAddSeparate
      ? 'add-separate'
      : dest.hasExistingContent
        ? 'replace-with-confirmation'
        : 'add-separate');

  const requiresOverwriteConfirmation =
    dest.hasExistingContent &&
    (resolutionMode === 'replace-with-confirmation' || !mapping.supportsAddSeparate);

  const provenanceSummary = `${finding.sourceOrganization} — ${finding.sourceTitle} (v${finding.sourceVersionNumber}, ${finding.evidenceLocator.label}${finding.sourceContentSha256 ? `, SHA256:${finding.sourceContentSha256.slice(0, 12)}` : ''})`;

  const proposedFieldSummary = buildProposedFieldSummaryText(finding, mapping);

  return {
    eligible: eligibility.eligible,
    eligibility,
    finding,
    source: context.source ?? null,
    targetSection: mapping.targetSectionId,
    targetSectionTitle: targetSectionObj?.title ?? mapping.targetSectionId,
    destinationFieldPath: mapping.destinationFieldPath,
    destinationLabel: mapping.destinationLabel,
    currentFieldSummary: dest.summary,
    currentStage4State: dest.currentState,
    proposedFieldSummary,
    defaultProposedState: 'preliminary-review',
    allowedStates,
    supportsAddSeparate: mapping.supportsAddSeparate,
    hasExistingDestinationContent: dest.hasExistingContent,
    isExistingDestinationVerified: dest.isExistingVerifiedOrReady,
    requiresOverwriteConfirmation,
    targetSectionIsEdited: dest.targetSectionIsEdited,
    editedProtectionNote: dest.targetSectionIsEdited
      ? `Section "${mapping.targetSectionId}" has manual edits (isEdited=true). Applying transfer updates Stage 4 data, provenance, and section autoGeneratedBaseline WITHOUT altering edited text unless you explicitly trigger "Sync to Section".`
      : `Unedited section "${mapping.targetSectionId}" will reflect Stage 4 updates non-destructively while keeping any edited sections intact.`,
    conflictWarnings,
    scientificQualifications,
    provenanceSummary,
    stage4DiffSummary: {
      findingId: finding.findingId,
      targetSection: mapping.targetSectionId,
      existingStage4Summary: dest.summary,
      proposedChangeSummary: proposedFieldSummary,
      targetSectionIsEdited: dest.targetSectionIsEdited,
      existingStage4State: dest.currentState,
      requiresConflictResolution:
        dest.hasExistingContent || Boolean(finding.conflictGroupId),
    },
  };
}

function buildProposedFieldSummaryText(
  finding: CandidateScientificFinding,
  mapping: R3FindingStage4MappingResolution
): string {
  const quoteSuffix = finding.evidencePassage
    ? ` [Quote: "${finding.evidencePassage.slice(0, 140)}"]`
    : '';
  return `[${mapping.destinationLabel}] ${formatScientificCandidateSummary(finding)}${quoteSuffix}`;
}

// =============================================================================
// E, F, G, H, I. NON-DESTRUCTIVE APPLY & SECTION SYNC ENGINE
// =============================================================================

export interface ApplyReviewedFindingOptions {
  activeEvent: EQPEvent;
  primer: PrimerDocument;
  finding: CandidateScientificFinding;
  source: PrimerResearchSourceRecord;
  allSources?: PrimerResearchSourceRecord[];
  allFindings?: CandidateScientificFinding[];
  auditRecords?: R3TransferAuditLogEntry[];
  operatorConfirmedTransfer: boolean;
  operatorLabel?: string;
  appliedAsState?: 'preliminary-review' | 'verified-fact';
  operatorConfirmedVerifiedFact?: boolean;
  resolutionMode?: R3CollisionResolutionMode;
  operatorConfirmedOverwrite?: boolean;
  overwriteReason?: string;
  epicenterFigure?: PrimerMapFigureRecord | null;
  stage3Package?: PrimerStage3Package | null;
  primaryLocationLabel?: string | null;
  faultGeneratorLabel?: string | null;
  isPlotResultStale?: boolean;
  nowUtc?: string;
}

export interface ApplyReviewedFindingResult {
  ok: boolean;
  code:
    | 'applied'
    | 'kept-existing'
    | 'blocked-eligibility'
    | 'blocked-confirmation-required'
    | 'blocked-frozen-snapshot'
    | 'blocked-duplicate'
    | 'blocked-verified-fact-gate'
    | 'blocked-overwrite-confirmation';
  message: string;
  updatedPrimer: PrimerDocument;
  transferLink: PrimerR3TransferProvenanceLink | null;
  auditRecord: R3TransferAuditLogEntry | null;
  editedSectionsPreserved: PrimerSectionId[];
  sectionsNeedingSync: PrimerSectionId[];
  eligibility: R3TransferEligibilityResult;
}

function parseTsunamiCandidateFields(
  finding: CandidateScientificFinding,
  source: PrimerResearchSourceRecord
): {
  state: PrimerTsunamiState;
  advisoryId: string;
  issuingAgency: string;
  advisoryAsOfTime: string;
  issuedAt: string;
  cancelledAt: string;
  coastalAreas: string;
  notesLine: string;
} {
  const txt = `${finding.extractedStatement} ${finding.evidencePassage}`;
  const isNoTsunami =
    /\bno\s+(?:destructive\s+)?tsunami\s+threat\b|\btsunami\s+cancellation\b|\bfinal\s+tsunami\b|\bcancelled\b/i.test(
      txt
    );
  const isWarningOrAdv =
    /\btsunami\s+(?:warning|advisory|watch|alert)\b/i.test(txt) && !isNoTsunami;

  const state: PrimerTsunamiState = isNoTsunami
    ? 'official-no-tsunami'
    : isWarningOrAdv
      ? 'official-warning-or-advisory'
      : 'awaiting-verification';

  const idMatch = txt.match(
    /(?:Tsunami\s+(?:Information|Advisory|Warning|Bulletin)|Advisory)\s*(?:No\.?|#)?\s*([A-Z0-9-]+)/i
  );
  const advisoryId =
    (typeof finding.structuredValues?.advisoryId === 'string' &&
      finding.structuredValues.advisoryId.trim()) ||
    (idMatch ? `Advisory ${idMatch[1]}` : `${source.documentTitle} (v${source.versionNumber})`);

  const isCancellation = /\bcancelled|final\b/i.test(txt);
  const obsTs =
    finding.observationTimeRaw
      ? `${finding.observationTimeRaw}${finding.observationTimeZone ? ` ${finding.observationTimeZone}` : ''}`
      : finding.publishedOrUpdatedUtc || '';

  return {
    state,
    advisoryId: sanitizeUntrustedTextValue(advisoryId, 160),
    issuingAgency: sanitizeUntrustedTextValue(source.organization, 120) || 'Official Agency Source',
    advisoryAsOfTime: obsTs,
    issuedAt: finding.publishedOrUpdatedUtc || obsTs,
    cancelledAt: isCancellation ? obsTs : '',
    coastalAreas:
      typeof finding.structuredValues?.affectedCoastalAreas === 'string'
        ? sanitizeUntrustedTextValue(finding.structuredValues.affectedCoastalAreas, 240)
        : '',
    notesLine: `[${source.organization} v${source.versionNumber}] ${sanitizeUntrustedTextValue(finding.extractedStatement, 500)} (${finding.evidenceLocator.label})`,
  };
}

function appendUniqueParagraph(existing: string, addition: string): string {
  const cleanAdd = addition.trim();
  if (!cleanAdd) return existing;
  const cleanExisting = existing.trim();
  if (!cleanExisting) return cleanAdd;
  if (cleanExisting.includes(cleanAdd)) return cleanExisting;
  return `${cleanExisting}\n\n${cleanAdd}`;
}

export function applyReviewedScientificFindingToPrimer(
  options: ApplyReviewedFindingOptions
): ApplyReviewedFindingResult {
  const { activeEvent, primer, finding, source } = options;

  // Reject frozen revision snapshot objects immediately
  const maybeRevisionLike = primer as unknown as {
    snapshot?: unknown;
    revisionId?: unknown;
    isReadOnlySnapshot?: boolean;
  };
  if (
    Object.isFrozen(primer) ||
    Boolean(maybeRevisionLike?.snapshot) ||
    Boolean(maybeRevisionLike?.isReadOnlySnapshot)
  ) {
    const fallbackElig = evaluateFindingTransferEligibility(finding, {
      activeEvent,
      primer: null,
      source,
      isFrozenRevision: true,
    });
    return {
      ok: false,
      code: 'blocked-frozen-snapshot',
      message:
        'Refused to mutate a frozen historical PRIMER revision. Restore it as a new working draft before transferring findings.',
      updatedPrimer: primer,
      transferLink: null,
      auditRecord: null,
      editedSectionsPreserved: [],
      sectionsNeedingSync: [],
      eligibility: fallbackElig,
    };
  }

  const eligibility = evaluateFindingTransferEligibility(finding, {
    activeEvent,
    primer,
    source,
    allSources: options.allSources,
    allFindings: options.allFindings,
    auditRecords: options.auditRecords,
    isPlotResultStale: options.isPlotResultStale,
    primaryLocationLabel: options.primaryLocationLabel,
  });

  if (!options.operatorConfirmedTransfer) {
    return {
      ok: false,
      code: 'blocked-confirmation-required',
      message:
        'Explicit operator confirmation is required before transferring any R2 finding into a PRIMER draft.',
      updatedPrimer: primer,
      transferLink: null,
      auditRecord: null,
      editedSectionsPreserved: [],
      sectionsNeedingSync: [],
      eligibility,
    };
  }

  if (eligibility.duplicateAlreadyApplied) {
    return {
      ok: false,
      code: 'blocked-duplicate',
      message: `Duplicate transfer blocked: finding "${finding.findingId}" from source "${source.sourceId}" v${source.versionNumber} is already applied to this draft.`,
      updatedPrimer: primer,
      transferLink: null,
      auditRecord: null,
      editedSectionsPreserved: [],
      sectionsNeedingSync: [],
      eligibility,
    };
  }

  if (!eligibility.eligible || !eligibility.mapping.supported) {
    return {
      ok: false,
      code: 'blocked-eligibility',
      message:
        eligibility.blockers.map((b) => b.message).join(' | ') ||
        'Finding is ineligible for transfer.',
      updatedPrimer: primer,
      transferLink: null,
      auditRecord: null,
      editedSectionsPreserved: [],
      sectionsNeedingSync: [],
      eligibility,
    };
  }

  const nowUtc = options.nowUtc ?? new Date().toISOString();
  const operatorLabel =
    sanitizeUntrustedTextValue(options.operatorLabel, 120) ||
    'Local Operator (Unverified)';
  const mapping = eligibility.mapping;

  // Enforce requested Stage 4 contentState gate
  const requestedState: 'preliminary-review' | 'verified-fact' =
    options.appliedAsState ?? 'preliminary-review';

  if (requestedState === 'verified-fact') {
    if (!eligibility.canClassifyAsVerifiedFact || !options.operatorConfirmedVerifiedFact) {
      return {
        ok: false,
        code: 'blocked-verified-fact-gate',
        message: `Cannot transfer as "verified-fact": ${
          eligibility.verifiedFactBlockReasons.join(' ') ||
          'Explicit operator verification confirmation required.'
        } Transfer as "preliminary-review" instead.`,
        updatedPrimer: primer,
        transferLink: null,
        auditRecord: null,
        editedSectionsPreserved: [],
        sectionsNeedingSync: [],
        eligibility,
      };
    }
  }

  const existingPkg4 = primer.extensions?.scientificNarrativePackage;
  const workingExternalData: PrimerStage4ExternalData = structuredClone(
    existingPkg4?.externalData ?? createDefaultStage4ExternalData(activeEvent)
  );
  const destInspection = inspectStage4DestinationStatus(
    primer,
    mapping,
    workingExternalData
  );

  const resolutionMode: R3CollisionResolutionMode =
    options.resolutionMode ??
    (destInspection.hasExistingContent && mapping.supportsAddSeparate
      ? 'add-separate'
      : destInspection.hasExistingContent
        ? 'replace-with-confirmation'
        : 'add-separate');

  if (resolutionMode === 'keep-existing') {
    const auditRecord: R3TransferAuditLogEntry = {
      schemaVersion: '1.0',
      auditId: `r3aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      action: 'transfer-rejected',
      linkedEqpEventId: activeEvent.id,
      primerDocumentId: primer.id,
      findingId: finding.findingId,
      sourceId: source.sourceId,
      sourceTitle: source.documentTitle,
      sourceVersionNumber: source.versionNumber,
      sourceContentSha256: finding.sourceContentSha256,
      findingCategory: finding.category,
      targetSectionId: mapping.targetSectionId,
      destinationFieldPath: mapping.destinationFieldPath,
      appliedAsState: null,
      resolutionMode: 'keep-existing',
      replacementReason: null,
      priorValueSummary: destInspection.summary,
      newValueSummary: formatScientificCandidateSummary(finding),
      evidenceLocatorLabel: finding.evidenceLocator.label,
      evidencePassageQuote: finding.evidencePassage.slice(0, 400) || null,
      preservedEditedSections: true,
      operatorLabel,
      identityStatus: 'UNVERIFIED_OPERATOR',
      recordedAtUtc: nowUtc,
      notes: 'Operator chose Keep Existing destination value.',
      isTamperProof: false,
      storageNote: 'Local browser IndexedDB record (non-institutional).',
    };
    return {
      ok: true,
      code: 'kept-existing',
      message: 'Preserved existing PRIMER Stage 4 value; candidate kept in Research Library.',
      updatedPrimer: primer,
      transferLink: null,
      auditRecord,
      editedSectionsPreserved: primer.sections.filter((s) => s.isEdited).map((s) => s.id),
      sectionsNeedingSync: [],
      eligibility,
    };
  }

  // Overwrite / replacement guard (Requirement F)
  const isAttemptingReplace =
    destInspection.hasExistingContent &&
    (resolutionMode === 'replace-with-confirmation' || !mapping.supportsAddSeparate);

  const cleanOverwriteReason = sanitizeUntrustedTextValue(
    options.overwriteReason,
    400
  );
  if (
    isAttemptingReplace &&
    (!options.operatorConfirmedOverwrite || !cleanOverwriteReason)
  ) {
    return {
      ok: false,
      code: 'blocked-overwrite-confirmation',
      message:
        'Existing destination content cannot be overwritten silently. Provide an explicit confirmation and replacement reason, or add as a separate observation.',
      updatedPrimer: primer,
      transferLink: null,
      auditRecord: null,
      editedSectionsPreserved: [],
      sectionsNeedingSync: [],
      eligibility,
    };
  }

  if (
    resolutionMode === 'replace-with-confirmation' &&
    (!options.operatorConfirmedOverwrite || !cleanOverwriteReason) &&
    destInspection.hasExistingContent
  ) {
    return {
      ok: false,
      code: 'blocked-overwrite-confirmation',
      message:
        'Explicit overwrite confirmation and replacement reason are required to replace an existing Stage 4 field.',
      updatedPrimer: primer,
      transferLink: null,
      auditRecord: null,
      editedSectionsPreserved: [],
      sectionsNeedingSync: [],
      eligibility,
    };
  }

  const targetReviewStatus: PrimerSectionReviewState =
    requestedState === 'verified-fact'
      ? 'ready-for-review'
      : 'requires-scientific-review';

  const sourceCitationLabel = `${source.organization} — ${source.documentTitle} (v${source.versionNumber}, ${finding.evidenceLocator.label})`;
  const safeStatement = sanitizeUntrustedTextValue(finding.extractedStatement, 1000);
  const formattedCandidate = sanitizeUntrustedTextValue(
    formatScientificCandidateSummary(finding),
    1200
  );
  const obsTimestamp =
    finding.observationTimeRaw
      ? `${finding.observationTimeRaw}${finding.observationTimeZone ? ` ${finding.observationTimeZone}` : ''}`
      : finding.publishedOrUpdatedUtc || source.retrievedAtUtc;

  const transferId = `r3tx_${finding.findingId.slice(0, 18)}_${source.sourceId.slice(0, 12)}_v${source.versionNumber}_${Date.now().toString(36)}`;
  let replacedPriorTransferId: string | null = null;

  // Apply structured Stage 4 update according to subKind
  switch (mapping.subKind) {
    case 'tsunami-official-advisory': {
      const parsed = parseTsunamiCandidateFields(finding, source);
      const priorAdv = workingExternalData.tsunami.officialAdvisoryId.trim();
      const priorState = workingExternalData.tsunami.state;
      const hasPriorAdvisory = Boolean(priorAdv) || priorState !== 'unavailable';
      const priorNotes = workingExternalData.tsunami.notes.trim();
      let archivedPriorNote = '';
      if (
        hasPriorAdvisory &&
        (priorAdv !== parsed.advisoryId ||
          priorState !== parsed.state ||
          resolutionMode === 'replace-with-confirmation')
      ) {
        const priorDetails = [
          `State=${priorState}`,
          `ID=${priorAdv || 'Unspecified'}`,
          `Agency=${workingExternalData.tsunami.issuingAgency || 'Unspecified'}`,
          workingExternalData.tsunami.issuedAt
            ? `Issued=${workingExternalData.tsunami.issuedAt}`
            : '',
          workingExternalData.tsunami.cancelledAt
            ? `Cancelled=${workingExternalData.tsunami.cancelledAt}`
            : '',
          workingExternalData.tsunami.affectedCoastalAreas
            ? `Coast=${workingExternalData.tsunami.affectedCoastalAreas}`
            : '',
        ]
          .filter(Boolean)
          .join(', ');
        archivedPriorNote = `[Historical Prior Advisory Preserved (${nowUtc})]: ${priorDetails}${cleanOverwriteReason ? ` (Replaced: ${cleanOverwriteReason})` : ''}.`;
        const priorLinks = (workingExternalData.r3TransferredSources ?? []).filter(
          (l) => l.destinationFieldPath === mapping.destinationFieldPath
        );
        const prevLink = priorLinks[priorLinks.length - 1];
        if (prevLink) replacedPriorTransferId = prevLink.transferId;
      }

      const isExplicitReplace =
        hasPriorAdvisory && resolutionMode === 'replace-with-confirmation';
      workingExternalData.tsunami = {
        ...workingExternalData.tsunami,
        state: parsed.state,
        officialAdvisoryId: parsed.advisoryId,
        issuingAgency: parsed.issuingAgency,
        advisoryStatusAsOfTime:
          parsed.advisoryAsOfTime ||
          (isExplicitReplace
            ? ''
            : workingExternalData.tsunami.advisoryStatusAsOfTime),
        issuedAt:
          parsed.issuedAt ||
          (isExplicitReplace ? '' : workingExternalData.tsunami.issuedAt),
        cancelledAt:
          parsed.cancelledAt ||
          (isExplicitReplace ? '' : workingExternalData.tsunami.cancelledAt),
        affectedCoastalAreas:
          parsed.coastalAreas ||
          (isExplicitReplace
            ? ''
            : workingExternalData.tsunami.affectedCoastalAreas),
        sourceDocumentRef: source.sourceUrl || source.sourceLocation || sourceCitationLabel,
        notes: [priorNotes, archivedPriorNote, parsed.notesLine]
          .filter(Boolean)
          .join('\n'),
      };
      break;
    }

    case 'tsunami-sea-level-observation': {
      const stationName =
        (typeof finding.structuredValues?.stationName === 'string' &&
          finding.structuredValues.stationName.trim()) ||
        sanitizeUntrustedTextValue(finding.findingTitle, 140) ||
        'Coastal Sea-Level Station';
      const maxWaveHeightM =
        finding.originalValue?.trim()
          ? `${finding.originalValue.trim()}${
              finding.originalUnits && !/^m(?:eters?)?$/i.test(finding.originalUnits.trim())
                ? ` ${finding.originalUnits.trim()}`
                : ''
            }`
          : 'See notes';

      const newObs: PrimerSeaLevelObservation = {
        id: `sl_r3_${finding.findingId.slice(0, 14)}_v${source.versionNumber}`,
        stationName,
        maxWaveHeightM,
        observedAtUtc: obsTimestamp,
        observationType: /buoy/i.test(safeStatement)
          ? 'tsunami-buoy'
          : /tide/i.test(safeStatement)
            ? 'tide-gauge'
            : 'other',
        sourceRef: sourceCitationLabel,
        reviewStatus: targetReviewStatus,
      };

      if (resolutionMode === 'replace-with-confirmation') {
        workingExternalData.tsunami.seaLevelObservations = [newObs];
      } else {
        const exists = workingExternalData.tsunami.seaLevelObservations.some(
          (o) => o.id === newObs.id
        );
        if (!exists) {
          workingExternalData.tsunami.seaLevelObservations = [
            ...workingExternalData.tsunami.seaLevelObservations,
            newObs,
          ];
        }
      }
      break;
    }

    case 'hazard-landslides':
    case 'hazard-liquefaction':
    case 'hazard-structural-damage': {
      const hazType = mapping.hazardCategory!;
      const loc =
        (typeof finding.structuredValues?.location === 'string' &&
          finding.structuredValues.location.trim()) ||
        sanitizeUntrustedTextValue(finding.findingTitle, 140) ||
        options.primaryLocationLabel ||
        'Reported Affected Area';

      const obsItem: PrimerVerifiedHazardObservation = {
        id: `haz_r3_${finding.findingId.slice(0, 16)}_v${source.versionNumber}`,
        hazardType: hazType,
        location: loc,
        observedAtUtc: obsTimestamp,
        description: formattedCandidate,
        source: sourceCitationLabel,
        reviewStatus: targetReviewStatus,
      };

      if (resolutionMode === 'replace-with-confirmation') {
        workingExternalData.hazardObservations = [
          ...workingExternalData.hazardObservations.filter(
            (h) => h.hazardType !== hazType
          ),
          obsItem,
        ];
      } else {
        workingExternalData.hazardObservations = [
          ...workingExternalData.hazardObservations,
          obsItem,
        ];
      }
      break;
    }

    case 'tectonic-interpretation': {
      const noteText = `[Candidate Interpretation · ${sourceCitationLabel}]: ${formattedCandidate}`;
      workingExternalData.tectonic = {
        ...workingExternalData.tectonic,
        expertInterpretation:
          resolutionMode === 'replace-with-confirmation'
            ? noteText
            : appendUniqueParagraph(
                workingExternalData.tectonic.expertInterpretation,
                noteText
              ),
        evidenceReferences: appendUniqueParagraph(
          workingExternalData.tectonic.evidenceReferences,
          `${sourceCitationLabel}${source.sourceUrl ? ` (${source.sourceUrl})` : ''}`
        ),
        reviewerName:
          workingExternalData.tectonic.reviewerName || operatorLabel,
        // Tectonic causal interpretation from R2 NEVER becomes ready-for-review automatically!
        reviewStatus: 'requires-scientific-review',
      };
      break;
    }

    case 'tectonic-focal-mechanism': {
      const refLine = `Focal Mechanism / Moment Tensor Product (${sourceCitationLabel}): ${formattedCandidate}${
        source.sourceUrl ? ` — ${source.sourceUrl}` : ''
      }`;
      workingExternalData.tectonic = {
        ...workingExternalData.tectonic,
        evidenceReferences:
          resolutionMode === 'replace-with-confirmation'
            ? refLine
            : appendUniqueParagraph(workingExternalData.tectonic.evidenceReferences, refLine),
        expertInterpretation: appendUniqueParagraph(
          workingExternalData.tectonic.expertInterpretation,
          `[Focal Mechanism Reference Attached (${source.organization}) — subject to specialist evaluation alongside regional geology and aftershock alignment]: ${formattedCandidate}`
        ),
        reviewStatus: 'requires-scientific-review',
      };
      break;
    }

    case 'volcano-monitoring': {
      const obsLine = `[${sourceCitationLabel}]: ${formattedCandidate}`;
      workingExternalData.volcano = {
        ...workingExternalData.volcano,
        includeSection: true,
        citedMonitoringObservations:
          resolutionMode === 'replace-with-confirmation'
            ? obsLine
            : appendUniqueParagraph(
                workingExternalData.volcano.citedMonitoringObservations,
                obsLine
              ),
        expertStatement:
          workingExternalData.volcano.expertStatement.trim() ||
          `Monitoring record cited (${requestedState === 'verified-fact' ? 'source-verified' : 'preliminary review'}): ${safeStatement}`,
        reviewStatus: targetReviewStatus,
      };
      break;
    }

    case 'monitoring-qrt-response': {
      const lower = `${finding.findingTitle} ${finding.extractedStatement}`.toLowerCase();
      const entryLine = `[${source.organization} v${source.versionNumber}]: ${safeStatement}`;
      const mr = { ...workingExternalData.monitoringResponse };

      if (/\bqrt\b|quick\s*response/i.test(lower)) {
        mr.qrtDeployments =
          resolutionMode === 'replace-with-confirmation'
            ? entryLine
            : appendUniqueParagraph(mr.qrtDeployments, entryLine);
      } else if (/\bfield\s*(?:survey|team|investigation|assessment)/i.test(lower)) {
        mr.fieldInvestigations =
          resolutionMode === 'replace-with-confirmation'
            ? entryLine
            : appendUniqueParagraph(mr.fieldInvestigations, entryLine);
      } else if (/\bstation|accelerometer|sensor|facility/i.test(lower)) {
        mr.monitoringFacilitiesOrStations =
          resolutionMode === 'replace-with-confirmation'
            ? entryLine
            : appendUniqueParagraph(mr.monitoringFacilitiesOrStations, entryLine);
      } else if (/\bpublished|bulletin|advisory|primer/i.test(lower)) {
        mr.publishedProducts =
          resolutionMode === 'replace-with-confirmation'
            ? entryLine
            : appendUniqueParagraph(mr.publishedProducts, entryLine);
      } else {
        mr.monitoringActivities =
          resolutionMode === 'replace-with-confirmation'
            ? entryLine
            : appendUniqueParagraph(mr.monitoringActivities, entryLine);
      }
      mr.sourceRef = appendUniqueParagraph(mr.sourceRef, sourceCitationLabel);
      mr.reviewStatus = targetReviewStatus;
      workingExternalData.monitoringResponse = mr;
      break;
    }

    case 'monitoring-agency-coordination': {
      const entryLine = `[${source.organization} v${source.versionNumber}]: ${safeStatement}`;
      workingExternalData.monitoringResponse = {
        ...workingExternalData.monitoringResponse,
        lguAgencyCoordination:
          resolutionMode === 'replace-with-confirmation'
            ? entryLine
            : appendUniqueParagraph(
                workingExternalData.monitoringResponse.lguAgencyCoordination,
                entryLine
              ),
        sourceRef: appendUniqueParagraph(
          workingExternalData.monitoringResponse.sourceRef,
          sourceCitationLabel
        ),
        reviewStatus: targetReviewStatus,
      };
      break;
    }

    case 'preparedness-event-advisory': {
      const advLine = `[${source.organization} v${source.versionNumber}]: ${safeStatement}`;
      workingExternalData.eventSpecificPreparednessAdvisories =
        resolutionMode === 'replace-with-confirmation'
          ? advLine
          : appendUniqueParagraph(
              workingExternalData.eventSpecificPreparednessAdvisories,
              advLine
            );
      workingExternalData.eventSpecificAdvisoriesSource = appendUniqueParagraph(
        workingExternalData.eventSpecificAdvisoriesSource,
        sourceCitationLabel
      );
      // Local draft import never self-authorizes institutional public advisories unless Stage 4 verified toggle is set separately
      workingExternalData.eventSpecificAdvisoriesVerified = false;
      break;
    }

    default:
      break;
  }

  const transferLink: PrimerR3TransferProvenanceLink = {
    transferId,
    findingId: finding.findingId,
    sourceId: source.sourceId,
    sourceTitle: source.documentTitle,
    sourceOrganization: source.organization,
    sourceUrl: source.sourceUrl,
    sourceVersionNumber: source.versionNumber,
    sourceContentSha256: finding.sourceContentSha256,
    evidenceLocatorLabel: finding.evidenceLocator.label,
    evidencePassageQuote: sanitizeUntrustedTextValue(finding.evidencePassage, 600),
    destinationFieldPath: mapping.destinationFieldPath ?? '',
    targetSectionId: mapping.targetSectionId,
    originalValue: finding.originalValue,
    originalUnits: finding.originalUnits,
    observationTimestamp: obsTimestamp || null,
    contentState: requestedState,
    operatorLabel,
    transferredAtUtc: nowUtc,
    replacedPriorTransferId,
  };

  workingExternalData.r3TransferredSources = [
    ...(workingExternalData.r3TransferredSources ?? []),
    transferLink,
  ];

  // Rebuild Stage 4 package & non-destructively update sections (Requirement G)
  const compiledStage4 = buildPrimerStage4Narratives({
    event: activeEvent,
    externalData: workingExternalData,
    epicenterFigure: options.epicenterFigure ?? primer.extensions?.epicenterFigure ?? null,
    stage3Package:
      options.stage3Package ?? primer.extensions?.sequenceHistoricalAnalysis ?? null,
    primaryLocationLabel:
      options.primaryLocationLabel ?? primer.extracted.primaryLocationLabel,
    faultGeneratorLabel:
      options.faultGeneratorLabel ?? primer.extracted.nearestFaultLabel,
    isPlotResultStale: options.isPlotResultStale ?? primer.extracted.isSolutionStale,
    dataCutoffUtc: nowUtc,
  });

  const updatedPrimer = updatePrimerStage4Narratives(primer, compiledStage4, {
    syncSections: true,
    forceOverwriteEdited: false,
  });

  // Never change draft release status — remain 'draft'
  updatedPrimer.status = 'draft';

  // Record R3 summary inside primer.extensions.researchEvidenceLibrary without mutating R1/R2
  const existingLib = updatedPrimer.extensions?.researchEvidenceLibrary ?? {
    schemaVersion: '1.0' as const,
    r1CollectionNote: 'Operator-reviewed R3 local draft transfers linked via provenance.',
    preservedSources: [],
    r3Transfers: [],
  };
  updatedPrimer.extensions = {
    ...(updatedPrimer.extensions ?? {}),
    researchEvidenceLibrary: {
      ...existingLib,
      r3Transfers: [
        ...(existingLib.r3Transfers ?? []),
        {
          transferId,
          sourceId: source.sourceId,
          claimId: finding.findingId,
          targetSectionId: mapping.targetSectionId,
          operatorConfirmedAtUtc: nowUtc,
          preservedManualEdits: updatedPrimer.sections.some((s) => s.isEdited),
          appliedAsState: requestedState,
        },
      ],
    },
  };

  const editedSectionsPreserved = updatedPrimer.sections
    .filter((s) => s.isEdited)
    .map((s) => s.id);

  const sectionsNeedingSync = updatedPrimer.sections
    .filter(
      (s) =>
        s.isEdited &&
        s.autoGeneratedBaseline !== undefined &&
        s.autoGeneratedBaseline !== s.content
    )
    .map((s) => s.id);

  const auditRecord: R3TransferAuditLogEntry = {
    schemaVersion: '1.0',
    auditId: transferId,
    action: 'transfer-applied',
    linkedEqpEventId: activeEvent.id,
    primerDocumentId: updatedPrimer.id,
    findingId: finding.findingId,
    sourceId: source.sourceId,
    sourceTitle: source.documentTitle,
    sourceVersionNumber: source.versionNumber,
    sourceContentSha256: finding.sourceContentSha256,
    findingCategory: finding.category,
    targetSectionId: mapping.targetSectionId,
    destinationFieldPath: mapping.destinationFieldPath,
    appliedAsState: requestedState,
    resolutionMode,
    replacementReason: cleanOverwriteReason || null,
    priorValueSummary: destInspection.summary,
    newValueSummary: formattedCandidate,
    evidenceLocatorLabel: finding.evidenceLocator.label,
    evidencePassageQuote: finding.evidencePassage.slice(0, 400) || null,
    preservedEditedSections: true,
    operatorLabel,
    identityStatus: 'UNVERIFIED_OPERATOR',
    recordedAtUtc: nowUtc,
    notes: `Transferred to ${mapping.destinationLabel} as ${requestedState}${cleanOverwriteReason ? ` (Replace reason: ${cleanOverwriteReason})` : ''}.`,
    isTamperProof: false,
    storageNote: 'Local browser IndexedDB record (non-institutional).',
  };

  return {
    ok: true,
    code: 'applied',
    message: `Transferred candidate finding to ${mapping.destinationLabel} (${requestedState}).${
      editedSectionsPreserved.includes(mapping.targetSectionId)
        ? ` Manual edits in "${mapping.targetSectionId}" preserved; use "Sync to Section" if you wish to overwrite narrative text.`
        : ''
    }`,
    updatedPrimer,
    transferLink,
    auditRecord,
    editedSectionsPreserved,
    sectionsNeedingSync,
    eligibility,
  };
}

/**
 * Explicitly synchronizes the updated Stage 4 narrative into a single manually-edited section
 * ONLY after explicit operator confirmation.
 */
export function syncStage4NarrativeToEditedSection(params: {
  primer: PrimerDocument;
  sectionId: PrimerSectionKey;
  operatorConfirmed: boolean;
  operatorLabel?: string;
  nowUtc?: string;
}): {
  ok: boolean;
  updatedPrimer: PrimerDocument;
  auditRecord: R3TransferAuditLogEntry | null;
  message: string;
} {
  if (!params.operatorConfirmed) {
    return {
      ok: false,
      updatedPrimer: params.primer,
      auditRecord: null,
      message: 'Explicit operator confirmation is required to overwrite an edited narrative section.',
    };
  }
  const maybeRev = params.primer as unknown as { snapshot?: unknown };
  if (Object.isFrozen(params.primer) || Boolean(maybeRev?.snapshot)) {
    return {
      ok: false,
      updatedPrimer: params.primer,
      auditRecord: null,
      message: 'Frozen historical revision snapshots cannot be synced or modified.',
    };
  }
  const pkg4 = params.primer.extensions?.scientificNarrativePackage;
  if (!pkg4) {
    return {
      ok: false,
      updatedPrimer: params.primer,
      auditRecord: null,
      message: 'Stage 4 narrative package is not present on this draft yet.',
    };
  }

  const prevContent =
    params.primer.sections.find((s) => s.id === params.sectionId)?.content ?? '';
  const nextPrimer = updatePrimerStage4Narratives(params.primer, pkg4, {
    syncSections: true,
    forceOverwriteEdited: true,
    targetSectionIds: [params.sectionId],
  });
  nextPrimer.status = 'draft';

  const nowUtc = params.nowUtc ?? new Date().toISOString();
  const auditRecord: R3TransferAuditLogEntry = {
    schemaVersion: '1.0',
    auditId: `r3sync_${params.sectionId}_${Date.now().toString(36)}`,
    action: 'section-synced',
    linkedEqpEventId: nextPrimer.eventId,
    primerDocumentId: nextPrimer.id,
    findingId: null,
    sourceId: 'stage4-narrative-sync',
    sourceTitle: `Stage 4 Narrative Package (${pkg4.inputFingerprint})`,
    sourceVersionNumber: 1,
    sourceContentSha256: null,
    findingCategory: null,
    targetSectionId: params.sectionId,
    destinationFieldPath: `sections.${params.sectionId}.content`,
    appliedAsState: null,
    resolutionMode: 'replace-with-confirmation',
    replacementReason: 'Explicit operator Sync to Section trigger',
    priorValueSummary: prevContent.slice(0, 240),
    newValueSummary:
      pkg4.sectionNarratives[params.sectionId]?.renderedText.slice(0, 240) ?? '',
    evidenceLocatorLabel: null,
    evidencePassageQuote: null,
    preservedEditedSections: false,
    operatorLabel:
      sanitizeUntrustedTextValue(params.operatorLabel, 120) ||
      'Local Operator (Unverified)',
    identityStatus: 'UNVERIFIED_OPERATOR',
    recordedAtUtc: nowUtc,
    notes: `Explicitly synced updated Stage 4 baseline into edited section "${params.sectionId}".`,
    isTamperProof: false,
    storageNote: 'Local browser IndexedDB record (non-institutional).',
  };

  return {
    ok: true,
    updatedPrimer: nextPrimer,
    auditRecord,
    message: `Synced updated Stage 4 narrative into section "${params.sectionId}".`,
  };
}
