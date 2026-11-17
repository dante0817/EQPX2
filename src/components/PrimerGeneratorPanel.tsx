import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Compass,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  FileText,
  Flag,
  GitCompare,
  History,
  Info,
  Layers,
  ListOrdered,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { EQPEvent, PeisRoman } from '../data/eqpData';
import { printBulletinHtmlDocument } from '../utils/bulletinHtml';
import type { ActiveFaultsDataset, GeologyManifest } from '../utils/geologyLayers';
import { PEIS_LEVELS } from '../utils/intensityFormat';
import type { MainOfficeLocation } from '../utils/nearestPlaces';
import {
  buildPrimerHtmlDocument,
  buildPrimerPdfDocument,
  clearAutoDraftSuppressionForEventId,
  DEFAULT_PRIMER_ELIGIBILITY_RULES,
  deletePrimerDraftFromStorage,
  downloadPrimerPdf,
  evaluatePrimerEligibility,
  extractVerifiedPrimerParameters,
  generateInitialEarthquakePrimer,
  loadPrimerEligibilityRules,
  loadSavedPrimerDrafts,
  maybeAutoCreatePrimerDraft,
  type PrimerAutoEligibilityRule,
  type PrimerDocument,
  type PrimerSectionId,
  type PrimerSectionReviewStatus,
  savePrimerDraftToStorage,
  savePrimerEligibilityRules,
  suppressAutoDraftForEvent,
  updatePrimerEpicenterFigure,
  updatePrimerPresentationConfig,
} from '../utils/earthquakePrimer';
import {
  computePrimerEventFingerprint,
  DEFAULT_PRIMER_MAP_LAYERS,
  type GeneratePrimerFigureOptions,
  type PrimerMapExtent,
  type PrimerMapLayerConfig,
  type PrimerMapTheme,
  type PrimerNearestCityPin,
  rasterizePrimerSvgToPng,
} from '../utils/primerMapFigure';
import {
  buildPrimerExportFilename,
  CANONICAL_PRIMER_SLOT_ORDER,
  computePrimerReadinessSummary,
  DEFAULT_PRIMER_PRESENTATION_CONFIG,
  normalizePresentationConfig,
  PRIMER_SLOT_HEADINGS,
  type PrimerDocumentSlotId,
  type PrimerExportRevisionInfo,
  type PrimerPresentationConfig,
  type PrimerPresentationMode,
} from '../utils/primerPresentation';
import {
  getPrimerRevisionArchiveStore,
  type PrimerRevisionArchiveDiagnostics,
  serializePrimerRevisionArchive,
} from '../utils/primerRevisionArchive';
import {
  comparePrimerRevisions,
  createPrimerRevisionRecord,
  detectPrimerSourceChanges,
  type PrimerCompareTarget,
  type PrimerRevisionRecord,
  restoreRevisionAsNewWorkingDraft,
  revisionToCompareTarget,
  toPrimerExportRevisionInfo,
  workingDraftToCompareTarget,
} from '../utils/primerRevisions';
import {
  buildPrimerReviewPackageZip,
  getPrimerReviewStore,
  type PrimerReviewArchiveDiagnostics,
  serializePrimerReviewArchiveJson,
  validateAndImportPrimerReviewPackageZip,
} from '../utils/primerReviewPackage';
import {
  addPrimerReviewComment,
  computeExtendedPrimerReadiness,
  createPrimerReviewRecord,
  evaluatePrimerReviewValidity,
  reopenCorrectionRequest as reopenReviewCorrectionComment,
  resolveCorrectionRequest as resolveReviewCorrectionComment,
  type PrimerReviewRecord,
} from '../utils/primerReviews';
import {
  addSectionCommentToDraft,
  deleteSectionCommentFromDraft,
  editSectionCommentInDraft,
  getSectionCommentsForTarget,
  type SectionCommentCategory,
  type SectionCommentTargetKind,
} from '../utils/primerSectionComments';
import {
  attachLinkedReviewCommentId,
  createCorrectionRequestRecord,
  getPrimerCorrectionRequestStore,
  markCorrectionDraftStarted,
  reopenCorrectionRequestItem,
  resolveCorrectionRequestItem,
  type PrimerCorrectionRequest,
} from '../utils/primerCorrectionRequests';
import { syncStage4NarrativeToEditedSection } from '../utils/primerResearchTransfer';
import { getPrimerResearchTransferStore } from '../utils/primerResearchTransferStore';
import { PrimerCorrectionRequestsPanel, type FlagCorrectionComposerTarget } from './PrimerCorrectionRequestsPanel';
import { PrimerRevisionComparePanel } from './PrimerRevisionComparePanel';
import { PrimerRevisionHistoryPanel } from './PrimerRevisionHistoryPanel';
import { PrimerScientificReviewPanel } from './PrimerScientificReviewPanel';
import { PrimerStage3Panel } from './PrimerStage3Panel';
import { PrimerStage4Panel } from './PrimerStage4Panel';
import { PrimerResearchAssistantPanel } from './PrimerResearchAssistantPanel';
import { InlineSectionCommentDrawer, SectionCommentsPanel } from './SectionCommentsPanel';

export interface PrimerPanelStatus {
  hasPrimer: boolean;
  primerId: string | null;
  primerTitle: string;
  eventId: string;
  hasUnsavedEdits: boolean;
  isSavedToStorage: boolean;
  isReadOnlySnapshot: boolean;
  generationTrigger: PrimerDocument['generationTrigger'] | null;
}

export interface PrimerPanelController {
  getDisplayedPrimer: () => PrimerDocument | null;
  getWorkingPrimer: () => PrimerDocument | null;
  createNewPrimer: () => PrimerDocument | null;
  discardAndCreateNewPrimer: (options?: { removeUnpublishedAutoDraft?: boolean }) => PrimerDocument | null;
  discardEdits: () => void;
  loadOpenedPrimer: (primer: PrimerDocument) => void;
  markPrimerSaved: (savedDoc?: PrimerDocument | null) => void;
}

interface PrimerGeneratorPanelProps {
  event: EQPEvent;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  isPlotResultStale: boolean;
  nearestCitiesPins?: PrimerNearestCityPin[];
  mainOffice?: MainOfficeLocation;
  gisActiveFaultsData?: ActiveFaultsDataset | null;
  gisManifest?: GeologyManifest | null;
  gisFaultsLoading?: boolean;
  onLoadGisActiveFaults?: () => void;
  onNotice?: (msg: string) => void;
  externalPendingPrimer?: PrimerDocument | null;
  onConsumeExternalPendingPrimer?: () => void;
  onControllerReady?: (controller: PrimerPanelController | null) => void;
  onStatusChange?: (status: PrimerPanelStatus) => void;
}

const REVIEW_STATUS_META: Record<
  PrimerSectionReviewStatus,
  { label: string; className: string; iconKind: 'ok' | 'info' | 'warn' }
> = {
  'ready-for-review': {
    label: 'Ready for Review',
    className: 'text-emerald-800 bg-emerald-50 border-emerald-200',
    iconKind: 'ok',
  },
  'requires-info': {
    label: 'Requires Information',
    className: 'text-rose-800 bg-rose-50 border-rose-200',
    iconKind: 'warn',
  },
  'requires-scientific-review': {
    label: 'Requires Scientific Review',
    className: 'text-amber-900 bg-amber-50 border-amber-300',
    iconKind: 'info',
  },
};

export const PrimerGeneratorPanel: React.FC<PrimerGeneratorPanelProps> = ({
  event,
  primaryLocationLabel,
  faultGeneratorLabel,
  isPlotResultStale,
  nearestCitiesPins = [],
  mainOffice,
  gisActiveFaultsData = null,
  gisManifest = null,
  gisFaultsLoading = false,
  onLoadGisActiveFaults,
  onNotice,
  externalPendingPrimer = null,
  onConsumeExternalPendingPrimer,
  onControllerReady,
  onStatusChange,
}) => {
  const [rules, setRules] = useState<PrimerAutoEligibilityRule>(() =>
    loadPrimerEligibilityRules()
  );
  const [savedDrafts, setSavedDrafts] = useState<PrimerDocument[]>(() =>
    loadSavedPrimerDrafts()
  );
  const [activePrimer, setActivePrimer] = useState<PrimerDocument | null>(null);
  const [hasUnsavedDraftEdits, setHasUnsavedDraftEdits] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [confirmOverwriteAuto, setConfirmOverwriteAuto] = useState(false);

  // Stage 2 Epicenter Map & Geographic Context controls
  const [mapExtent, setMapExtent] = useState<PrimerMapExtent>('regional');
  const [mapTheme, setMapTheme] = useState<PrimerMapTheme>('classic');
  const [mapLayers, setMapLayers] = useState<PrimerMapLayerConfig>(
    DEFAULT_PRIMER_MAP_LAYERS
  );
  const [isCaptionEdited, setIsCaptionEdited] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [currentStage3Fingerprint, setCurrentStage3Fingerprint] = useState<string | undefined>(
    undefined
  );
  const [currentStage4Fingerprint, setCurrentStage4Fingerprint] = useState<string | undefined>(
    undefined
  );

  // Stage 5 Presentation Mode, A4 Print Preview, & Configurable Section Layout
  const [presentationMode, setPresentationMode] =
    useState<PrimerPresentationMode>('public-draft');
  const [previewZoom, setPreviewZoom] = useState<'fit' | '0.75' | '1' | '1.25'>('fit');
  const [previewRefreshSeq, setPreviewRefreshSeq] = useState(0);
  const [showSectionOrderPanel, setShowSectionOrderPanel] = useState(false);

  // Stage 6A Revision Control, Immutable Historical Viewing, Comparison & Local Archive
  const archiveStore = useMemo(() => getPrimerRevisionArchiveStore(), []);
  const [revisions, setRevisions] = useState<PrimerRevisionRecord[]>([]);
  const [archiveDiagnostics, setArchiveDiagnostics] =
    useState<PrimerRevisionArchiveDiagnostics | null>(null);
  const [viewingRevision, setViewingRevision] = useState<PrimerRevisionRecord | null>(null);
  const [comparisonTarget, setComparisonTarget] = useState<{
    left: PrimerCompareTarget;
    right: PrimerCompareTarget;
  } | null>(null);

  // Stage 6B Scientific Review, Correction Tracking & Portable Review Package
  const reviewStore = useMemo(() => getPrimerReviewStore(), []);
  const [reviews, setReviews] = useState<PrimerReviewRecord[]>([]);
  const [reviewDiagnostics, setReviewDiagnostics] =
    useState<PrimerReviewArchiveDiagnostics | null>(null);
  const [selectedReviewRevisionId, setSelectedReviewRevisionId] = useState<string | null>(null);
  const [isExportingReviewZip, setIsExportingReviewZip] = useState(false);

  // Section Comments & Dedicated Correction Requests Workflow
  const correctionStore = useMemo(() => getPrimerCorrectionRequestStore(), []);
  const [correctionRequests, setCorrectionRequests] = useState<PrimerCorrectionRequest[]>([]);
  const [openCommentTargets, setOpenCommentTargets] = useState<Record<string, boolean>>({});
  const [flagComposerTarget, setFlagComposerTarget] =
    useState<FlagCorrectionComposerTarget | null>(null);
  const correctionPanelRef = React.useRef<HTMLDivElement | null>(null);

  const displayedPrimer = viewingRevision ? viewingRevision.snapshot : activePrimer;
  const isReadOnlySnapshot = viewingRevision !== null;

  const refreshArchiveState = useCallback(async () => {
    try {
      const [allRevs, diag, allReviews, reviewDiag, allCorrections] = await Promise.all([
        archiveStore.listRevisions(),
        archiveStore.getDiagnostics(),
        reviewStore.listReviews(),
        reviewStore.getDiagnostics(),
        correctionStore.listRequests(),
      ]);
      setRevisions(allRevs);
      setArchiveDiagnostics(diag);
      setReviews(allReviews);
      setReviewDiagnostics(reviewDiag);
      setCorrectionRequests(allCorrections);
    } catch {
      // Fallback silently; diagnostics remain non-blocking
    }
  }, [archiveStore, reviewStore, correctionStore]);

  useEffect(() => {
    void refreshArchiveState();
  }, [refreshArchiveState, savedDrafts.length]);

  const extractionOptions = useMemo(
    () => ({
      primaryLocationLabel,
      faultGeneratorLabel,
      isSolutionStale: isPlotResultStale,
    }),
    [primaryLocationLabel, faultGeneratorLabel, isPlotResultStale]
  );

  const currentEventFingerprint = useMemo(
    () =>
      computePrimerEventFingerprint(event, {
        primaryLocationLabel,
        isPlotResultStale,
      }),
    [event, primaryLocationLabel, isPlotResultStale]
  );

  const buildFigureOptions = (
    overrides: Partial<GeneratePrimerFigureOptions> = {}
  ): GeneratePrimerFigureOptions => ({
    extent: overrides.extent ?? mapExtent,
    theme: overrides.theme ?? mapTheme,
    layers: overrides.layers ?? mapLayers,
    primaryLocationLabel,
    faultGeneratorLabel,
    nearestCitiesPins,
    isPlotResultStale,
    gisActiveFaultsData,
    gisManifest,
    mainOffice,
    customCaption:
      overrides.customCaption !== undefined
        ? overrides.customCaption
        : isCaptionEdited
          ? activePrimer?.extensions?.epicenterFigure?.caption
          : undefined,
  });

  const extracted = useMemo(
    () => extractVerifiedPrimerParameters(event, extractionOptions),
    [event, extractionOptions]
  );

  const eligibility = useMemo(
    () => evaluatePrimerEligibility(event, rules, extractionOptions),
    [event, rules, extractionOptions]
  );

  const eventDrafts = useMemo(
    () => savedDrafts.filter((d) => d.eventId === event.id),
    [savedDrafts, event.id]
  );

  const otherEventDrafts = useMemo(
    () => savedDrafts.filter((d) => d.eventId !== event.id),
    [savedDrafts, event.id]
  );

  // Persist eligibility rules whenever adjusted
  useEffect(() => {
    savePrimerEligibilityRules(rules);
  }, [rules]);

  // Synchronize local map controls when displayedPrimer changes id or restored revision
  useEffect(() => {
    const fig = displayedPrimer?.extensions?.epicenterFigure;
    if (!fig) return;
    setMapExtent(fig.extent);
    setMapTheme(fig.theme);
    setMapLayers(fig.layers);
  }, [
    displayedPrimer?.id,
    displayedPrimer?.extensions?.reviewVersioning?.restoredFromRevisionId,
  ]);

  // Automatically re-render the figure once GIS active faults finish loading if the user enabled that layer
  useEffect(() => {
    if (
      activePrimer &&
      mapLayers.gisCandidateFaults &&
      gisActiveFaultsData
    ) {
      setActivePrimer((curr) =>
        curr
          ? updatePrimerEpicenterFigure(curr, event, {
              extent: mapExtent,
              theme: mapTheme,
              layers: mapLayers,
              primaryLocationLabel,
              faultGeneratorLabel,
              nearestCitiesPins,
              isPlotResultStale,
              gisActiveFaultsData,
              gisManifest,
              mainOffice,
              customCaption: isCaptionEdited
                ? curr.extensions?.epicenterFigure?.caption
                : undefined,
            })
          : curr
      );
    }
  }, [gisActiveFaultsData]);

  const externalPendingPrimerRef = React.useRef<PrimerDocument | null>(externalPendingPrimer);
  externalPendingPrimerRef.current = externalPendingPrimer;
  const onConsumeExternalPendingPrimerRef = React.useRef(onConsumeExternalPendingPrimer);
  onConsumeExternalPendingPrimerRef.current = onConsumeExternalPendingPrimer;
  const onStatusChangeRef = React.useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onControllerReadyRef = React.useRef(onControllerReady);
  onControllerReadyRef.current = onControllerReady;

  // Synchronize active draft or run automatic draft eligibility rule when switching events or adjusting rules
  useEffect(() => {
    setViewingRevision(null);
    setConfirmOverwriteAuto(false);
    setIsCaptionEdited(false);
    const allDrafts = loadSavedPrimerDrafts();
    setSavedDrafts(allDrafts);

    if (externalPendingPrimerRef.current) {
      const incoming = externalPendingPrimerRef.current;
      externalPendingPrimerRef.current = null;
      setActivePrimer(incoming);
      setHasUnsavedDraftEdits(false);
      setViewMode('edit');
      onConsumeExternalPendingPrimerRef.current?.();
      return;
    }

    const existingForEvent = allDrafts.filter((d) => d.eventId === event.id);
    if (existingForEvent.length > 0) {
      setActivePrimer((curr) =>
        curr && curr.eventId === event.id ? curr : existingForEvent[0]
      );
      setHasUnsavedDraftEdits(false);
      return;
    }

    const autoRes = maybeAutoCreatePrimerDraft(event, {
      ...extractionOptions,
      rules,
      figureOptions: {
        extent: mapExtent,
        theme: mapTheme,
        layers: mapLayers,
        nearestCitiesPins,
        gisActiveFaultsData,
        gisManifest,
        mainOffice,
      },
    });
    if (autoRes.created && autoRes.draft) {
      setSavedDrafts(autoRes.savedDrafts);
      setActivePrimer(autoRes.draft);
      setHasUnsavedDraftEdits(false);
      onNotice?.(
        `Auto-generated draft primer with epicenter figure for ${event.id} (unpublished draft)`
      );
      return;
    }

    setActivePrimer((curr) => (curr && curr.eventId === event.id ? curr : null));
    setHasUnsavedDraftEdits(false);
  }, [
    event.id,
    rules.enabled,
    rules.minMagnitude,
    rules.requireLocated,
    rules.minPeisTrigger,
    eligibility.eligible,
    isPlotResultStale,
  ]);

  // Apply external opened primer when event.id did not change
  useEffect(() => {
    if (!externalPendingPrimer || !externalPendingPrimerRef.current) return;
    const incoming = externalPendingPrimerRef.current;
    externalPendingPrimerRef.current = null;
    setViewingRevision(null);
    setConfirmOverwriteAuto(false);
    setIsCaptionEdited(false);
    setSavedDrafts(loadSavedPrimerDrafts());
    setActivePrimer(incoming);
    setHasUnsavedDraftEdits(false);
    setViewMode('edit');
    onConsumeExternalPendingPrimerRef.current?.();
  }, [externalPendingPrimer]);

  const handleManualGeneratePrimer = (createFreshCopy = false) => {
    if (isReadOnlySnapshot) return;
    if (activePrimer && hasUnsavedDraftEdits && !createFreshCopy && !confirmOverwriteAuto) {
      setConfirmOverwriteAuto(true);
      return;
    }
    setConfirmOverwriteAuto(false);
    setIsCaptionEdited(false);
    clearAutoDraftSuppressionForEventId(event.id);
    const freshDraft = generateInitialEarthquakePrimer(event, {
      ...extractionOptions,
      trigger: 'manual',
      rules,
      figureOptions: {
        extent: mapExtent,
        theme: mapTheme,
        layers: mapLayers,
        nearestCitiesPins,
        gisActiveFaultsData,
        gisManifest,
        mainOffice,
      },
    });
    setActivePrimer(freshDraft);
    setHasUnsavedDraftEdits(true);
    setViewMode('edit');
    onNotice?.(
      `Generated Earthquake Primer draft & epicenter figure for ${event.id} (status: Draft — not published)`
    );
  };

  const createNewPrimerProgrammatic = (): PrimerDocument => {
    setViewingRevision(null);
    setConfirmOverwriteAuto(false);
    setIsCaptionEdited(false);
    clearAutoDraftSuppressionForEventId(event.id);
    const freshDraft = generateInitialEarthquakePrimer(event, {
      ...extractionOptions,
      trigger: 'manual',
      rules,
      figureOptions: {
        extent: mapExtent,
        theme: mapTheme,
        layers: mapLayers,
        nearestCitiesPins,
        gisActiveFaultsData,
        gisManifest,
        mainOffice,
      },
    });
    setActivePrimer(freshDraft);
    setHasUnsavedDraftEdits(true);
    setViewMode('edit');
    onNotice?.(
      `Created new Earthquake Primer draft for ${event.id} (unsaved — click Save to store)`
    );
    return freshDraft;
  };

  const discardAndCreateNewPrimerProgrammatic = (options?: {
    removeUnpublishedAutoDraft?: boolean;
  }): PrimerDocument => {
    const current = activePrimer;
    if (
      current &&
      options?.removeUnpublishedAutoDraft &&
      current.generationTrigger === 'auto-rule-draft'
    ) {
      const updated = deletePrimerDraftFromStorage(current.id);
      setSavedDrafts(updated);
    }
    return createNewPrimerProgrammatic();
  };

  const discardPrimerEditsProgrammatic = () => {
    setViewingRevision(null);
    setConfirmOverwriteAuto(false);
    setIsCaptionEdited(false);
    if (!activePrimer) {
      setHasUnsavedDraftEdits(false);
      return;
    }
    const persisted = savedDrafts.find((d) => d.id === activePrimer.id) ?? null;
    if (persisted) {
      setActivePrimer(persisted);
    } else {
      setActivePrimer(null);
    }
    setHasUnsavedDraftEdits(false);
    onNotice?.(`Discarded unsaved edits in primer ${activePrimer.title}`);
  };

  const loadOpenedPrimerProgrammatic = (primer: PrimerDocument) => {
    setViewingRevision(null);
    setConfirmOverwriteAuto(false);
    setIsCaptionEdited(false);
    setSavedDrafts(loadSavedPrimerDrafts());
    setActivePrimer(primer);
    setHasUnsavedDraftEdits(false);
    setViewMode('edit');
  };

  const markPrimerSavedProgrammatic = (savedDoc?: PrimerDocument | null) => {
    const targetDoc = savedDoc ?? activePrimer;
    if (!targetDoc) return;
    clearAutoDraftSuppressionForEventId(targetDoc.eventId);
    const updatedList = savePrimerDraftToStorage({
      ...targetDoc,
      status: 'draft',
      updatedAt: targetDoc.updatedAt || new Date().toISOString(),
    });
    setSavedDrafts(updatedList);
    const savedCopy = updatedList.find((d) => d.id === targetDoc.id) ?? targetDoc;
    setViewingRevision(null);
    setActivePrimer(savedCopy);
    setHasUnsavedDraftEdits(false);
  };

  const isActivePrimerSavedToStorage = useMemo(() => {
    if (!displayedPrimer) return false;
    if (viewingRevision) return true;
    return (
      Boolean(displayedPrimer.savedAt) ||
      savedDrafts.some((d) => d.id === displayedPrimer.id)
    );
  }, [displayedPrimer, viewingRevision, savedDrafts]);

  useEffect(() => {
    onStatusChangeRef.current?.({
      hasPrimer: Boolean(displayedPrimer),
      primerId: displayedPrimer?.id ?? null,
      primerTitle: displayedPrimer?.title ?? '',
      eventId: displayedPrimer?.eventId ?? event.id,
      hasUnsavedEdits: hasUnsavedDraftEdits,
      isSavedToStorage: isActivePrimerSavedToStorage,
      isReadOnlySnapshot,
      generationTrigger: displayedPrimer?.generationTrigger ?? null,
    });
  }, [
    displayedPrimer,
    event.id,
    hasUnsavedDraftEdits,
    isActivePrimerSavedToStorage,
    isReadOnlySnapshot,
  ]);

  const controllerActionsRef = React.useRef<PrimerPanelController>({
    getDisplayedPrimer: () => displayedPrimer,
    getWorkingPrimer: () => activePrimer,
    createNewPrimer: createNewPrimerProgrammatic,
    discardAndCreateNewPrimer: discardAndCreateNewPrimerProgrammatic,
    discardEdits: discardPrimerEditsProgrammatic,
    loadOpenedPrimer: loadOpenedPrimerProgrammatic,
    markPrimerSaved: markPrimerSavedProgrammatic,
  });
  controllerActionsRef.current = {
    getDisplayedPrimer: () => displayedPrimer,
    getWorkingPrimer: () => activePrimer,
    createNewPrimer: createNewPrimerProgrammatic,
    discardAndCreateNewPrimer: discardAndCreateNewPrimerProgrammatic,
    discardEdits: discardPrimerEditsProgrammatic,
    loadOpenedPrimer: loadOpenedPrimerProgrammatic,
    markPrimerSaved: markPrimerSavedProgrammatic,
  };

  useEffect(() => {
    const stableController: PrimerPanelController = {
      getDisplayedPrimer: () => controllerActionsRef.current.getDisplayedPrimer(),
      getWorkingPrimer: () => controllerActionsRef.current.getWorkingPrimer(),
      createNewPrimer: () => controllerActionsRef.current.createNewPrimer(),
      discardAndCreateNewPrimer: (options) =>
        controllerActionsRef.current.discardAndCreateNewPrimer(options),
      discardEdits: () => controllerActionsRef.current.discardEdits(),
      loadOpenedPrimer: (primer) => controllerActionsRef.current.loadOpenedPrimer(primer),
      markPrimerSaved: (savedDoc) => controllerActionsRef.current.markPrimerSaved(savedDoc),
    };
    onControllerReadyRef.current?.(stableController);
    return () => {
      onControllerReadyRef.current?.(null);
    };
  }, []);

  const handleRefreshFigure = (overrides: Partial<GeneratePrimerFigureOptions> = {}) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    const updatedPrimer = updatePrimerEpicenterFigure(
      activePrimer,
      event,
      buildFigureOptions(overrides)
    );
    setActivePrimer(updatedPrimer);
    setHasUnsavedDraftEdits(true);
    onNotice?.(
      `Updated Stage 2 epicenter map figure for ${event.id} (edited narrative sections preserved)`
    );
  };

  const handleChangeExtent = (nextExtent: PrimerMapExtent) => {
    if (isReadOnlySnapshot) return;
    setMapExtent(nextExtent);
    if (activePrimer) {
      const updated = updatePrimerEpicenterFigure(
        activePrimer,
        event,
        buildFigureOptions({ extent: nextExtent })
      );
      setActivePrimer(updated);
      setHasUnsavedDraftEdits(true);
    }
  };

  const handleChangeTheme = (nextTheme: PrimerMapTheme) => {
    if (isReadOnlySnapshot) return;
    setMapTheme(nextTheme);
    if (activePrimer) {
      const updated = updatePrimerEpicenterFigure(
        activePrimer,
        event,
        buildFigureOptions({ theme: nextTheme })
      );
      setActivePrimer(updated);
      setHasUnsavedDraftEdits(true);
    }
  };

  const handleToggleLayer = (layerKey: keyof PrimerMapLayerConfig, checked: boolean) => {
    if (isReadOnlySnapshot) return;
    const nextLayers: PrimerMapLayerConfig = {
      ...mapLayers,
      [layerKey]: checked,
    };
    setMapLayers(nextLayers);
    if (layerKey === 'gisCandidateFaults' && checked && !gisActiveFaultsData) {
      onLoadGisActiveFaults?.();
    }
    if (activePrimer) {
      const updated = updatePrimerEpicenterFigure(
        activePrimer,
        event,
        buildFigureOptions({ layers: nextLayers })
      );
      setActivePrimer(updated);
      setHasUnsavedDraftEdits(true);
    }
  };

  const handleUpdateFigureCaption = (nextCaption: string) => {
    if (!activePrimer?.extensions?.epicenterFigure || isReadOnlySnapshot) return;
    setIsCaptionEdited(true);
    setActivePrimer({
      ...activePrimer,
      updatedAt: new Date().toISOString(),
      extensions: {
        ...activePrimer.extensions,
        epicenterFigure: {
          ...activePrimer.extensions.epicenterFigure,
          caption: nextCaption,
        },
      },
    });
    setHasUnsavedDraftEdits(true);
  };

  const handleSaveDraft = () => {
    if (!activePrimer || isReadOnlySnapshot) return;
    clearAutoDraftSuppressionForEventId(activePrimer.eventId);
    const updatedList = savePrimerDraftToStorage({
      ...activePrimer,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
    setSavedDrafts(updatedList);
    const savedCopy = updatedList.find((d) => d.id === activePrimer.id);
    if (savedCopy) {
      setActivePrimer(savedCopy);
    }
    setHasUnsavedDraftEdits(false);
    onNotice?.(`Saved primer draft for ${activePrimer.eventId} locally`);
  };

  const handleLoadDraft = (draft: PrimerDocument) => {
    setViewingRevision(null);
    setActivePrimer(draft);
    setHasUnsavedDraftEdits(false);
    setConfirmOverwriteAuto(false);
    onNotice?.(`Loaded saved draft (${draft.eventId})`);
  };

  const handleDeleteDraft = (draftId: string) => {
    const target = savedDrafts.find((d) => d.id === draftId);
    if (target && target.eventId === event.id) {
      suppressAutoDraftForEvent(event, {
        primaryLocationLabel,
        isSolutionStale: isPlotResultStale,
      });
    }
    const updatedList = deletePrimerDraftFromStorage(draftId);
    setSavedDrafts(updatedList);
    if (activePrimer?.id === draftId) {
      const nextForEvent = updatedList.find((d) => d.eventId === event.id) ?? null;
      setActivePrimer(nextForEvent);
      setHasUnsavedDraftEdits(false);
    }
    onNotice?.('Deleted saved primer draft');
  };

  const handleUpdateTitle = (nextTitle: string) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    setActivePrimer({
      ...activePrimer,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
    });
    setHasUnsavedDraftEdits(true);
  };

  const handleUpdateSubtitle = (nextSubtitle: string) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    setActivePrimer({
      ...activePrimer,
      subtitle: nextSubtitle,
      updatedAt: new Date().toISOString(),
    });
    setHasUnsavedDraftEdits(true);
  };

  const handleUpdateSectionContent = (sectionId: PrimerSectionId, content: string) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    setActivePrimer({
      ...activePrimer,
      updatedAt: new Date().toISOString(),
      sections: activePrimer.sections.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              content,
              isEdited: content !== sec.autoGeneratedBaseline,
            }
          : sec
      ),
    });
    setHasUnsavedDraftEdits(true);
  };

  const handleResetSection = (sectionId: PrimerSectionId) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    setActivePrimer({
      ...activePrimer,
      updatedAt: new Date().toISOString(),
      sections: activePrimer.sections.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              content: sec.autoGeneratedBaseline,
              isEdited: false,
            }
          : sec
      ),
    });
    setHasUnsavedDraftEdits(true);
  };

  const handleSyncSectionToStage4Baseline = (sectionId: PrimerSectionId) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    const result = syncStage4NarrativeToEditedSection({
      primer: activePrimer,
      sectionId,
      operatorConfirmed: true,
    });
    if (!result.ok) {
      onNotice?.(result.message);
      return;
    }
    setActivePrimer(result.updatedPrimer);
    setHasUnsavedDraftEdits(true);
    if (result.auditRecord) {
      void getPrimerResearchTransferStore().appendAuditRecord(result.auditRecord);
    }
    onNotice?.(result.message);
  };

  const handleCycleSectionReviewStatus = (sectionId: PrimerSectionId) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    const order: PrimerSectionReviewStatus[] = [
      'requires-info',
      'requires-scientific-review',
      'ready-for-review',
    ];
    setActivePrimer({
      ...activePrimer,
      updatedAt: new Date().toISOString(),
      sections: activePrimer.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const idx = order.indexOf(sec.reviewStatus);
        const nextStatus = order[(idx + 1) % order.length];
        return {
          ...sec,
          reviewStatus: nextStatus,
        };
      }),
    });
    setHasUnsavedDraftEdits(true);
  };

  const handleUpdatePresentationConfig = (patch: Partial<PrimerPresentationConfig>) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    const next = updatePrimerPresentationConfig(activePrimer, patch);
    setActivePrimer(next);
    setHasUnsavedDraftEdits(true);
  };

  const handleMoveSlotOrder = (slotId: PrimerDocumentSlotId, direction: -1 | 1) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    const cfg = normalizePresentationConfig(activePrimer.extensions?.presentationConfig);
    const idx = cfg.sectionOrder.indexOf(slotId);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= cfg.sectionOrder.length) return;
    const nextOrder = [...cfg.sectionOrder];
    const [moved] = nextOrder.splice(idx, 1);
    nextOrder.splice(targetIdx, 0, moved);
    handleUpdatePresentationConfig({ sectionOrder: nextOrder });
  };

  const handleToggleOptionalSlotVisibility = (
    slotId: PrimerDocumentSlotId,
    visible: boolean
  ) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    const cfg = normalizePresentationConfig(activePrimer.extensions?.presentationConfig);
    const nextHidden = visible
      ? cfg.hiddenSlotIds.filter((id) => id !== slotId)
      : Array.from(new Set([...cfg.hiddenSlotIds, slotId]));
    handleUpdatePresentationConfig({ hiddenSlotIds: nextHidden });
  };

  // Stage 6A Revision Handlers
  const handleSaveNewRevision = async (description: string) => {
    if (!activePrimer || isReadOnlySnapshot) return;
    const { revision, updatedWorkingDraft } = createPrimerRevisionRecord(activePrimer, {
      description,
      existingRevisions: revisions,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      isPlotResultStale,
    });
    await archiveStore.saveRevision(revision);
    const updatedList = savePrimerDraftToStorage(updatedWorkingDraft);
    setSavedDrafts(updatedList);
    const savedCopy =
      updatedList.find((d) => d.id === updatedWorkingDraft.id) ?? updatedWorkingDraft;
    setActivePrimer(savedCopy);
    setHasUnsavedDraftEdits(false);
    setSelectedReviewRevisionId(revision.revisionId);
    await refreshArchiveState();
    onNotice?.(
      `Saved immutable Revision #${revision.revisionNumber} (${revision.revisionId}) to local archive`
    );
  };

  const handleViewRevision = (revision: PrimerRevisionRecord) => {
    setViewingRevision(revision);
    setShowSectionOrderPanel(false);
    setConfirmOverwriteAuto(false);
    onNotice?.(
      `Viewing frozen historical Revision #${revision.revisionNumber} (${revision.eventId}) — read-only`
    );
  };

  const handleReturnToWorkingDraft = () => {
    setViewingRevision(null);
    onNotice?.('Returned to editable working draft');
  };

  const handleRestoreAsNewWorkingDraft = (revision: PrimerRevisionRecord): PrimerDocument => {
    const restoredDraft = restoreRevisionAsNewWorkingDraft(revision);
    const updatedList = savePrimerDraftToStorage(restoredDraft);
    setSavedDrafts(updatedList);
    const savedCopy = updatedList.find((d) => d.id === restoredDraft.id) ?? restoredDraft;
    setActivePrimer(savedCopy);
    setViewingRevision(null);
    setHasUnsavedDraftEdits(false);
    setConfirmOverwriteAuto(false);
    setViewMode('edit');
    setIsCaptionEdited(false);
    onNotice?.(
      `Restored frozen Revision #${revision.revisionNumber} into new editable working draft (${savedCopy.id})`
    );
    return savedCopy;
  };

  const handleCompareWithWorkingDraft = (revision: PrimerRevisionRecord) => {
    if (!activePrimer) {
      onNotice?.(
        'No active editable working draft loaded. Restore this revision as a new working draft or compare two archived revisions.'
      );
      return;
    }
    setComparisonTarget({
      left: revisionToCompareTarget(revision),
      right: workingDraftToCompareTarget(activePrimer, currentEventFingerprint),
    });
  };

  const handleCompareTwoRevisions = (
    left: PrimerRevisionRecord,
    right: PrimerRevisionRecord
  ) => {
    setComparisonTarget({
      left: revisionToCompareTarget(left),
      right: revisionToCompareTarget(right),
    });
  };

  const handleExportRevisionJson = (revision: PrimerRevisionRecord) => {
    const json = serializePrimerRevisionArchive([revision]);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `EQP_Primer_${revision.eventId}_REV${revision.revisionNumber}.primer-archive.json`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onNotice?.(`Exported portable JSON snapshot for Revision #${revision.revisionNumber}`);
  };

  const handleExportAllArchiveJson = () => {
    const json = serializePrimerRevisionArchive(revisions);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `EQP_Primer_Archive_${new Date().toISOString().slice(0, 10)}.primer-archive.json`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onNotice?.(`Exported portable JSON archive (${revisions.length} revisions)`);
  };

  const handleImportArchiveJson = async (rawJson: string) => {
    const result = await archiveStore.importArchiveJson(rawJson);
    await refreshArchiveState();
    if (result.ok) {
      onNotice?.(
        `Imported ${result.importedCount} primer revision(s) into local archive${
          result.skippedDuplicateIds.length > 0
            ? ` (${result.skippedDuplicateIds.length} duplicate ID(s) skipped)`
            : ''
        }`
      );
    } else {
      onNotice?.(`Archive import rejected: ${result.errors[0] ?? 'Validation failed'}`);
    }
    return result;
  };

  // Stage 6B Review Persistence & Portable ZIP Review Package Handlers
  const handleSaveReview = async (review: PrimerReviewRecord) => {
    await reviewStore.saveReview(review);
    await refreshArchiveState();
  };

  // Section Comments Handlers (bound to Revision ID; immutable once captured in snapshot)
  const toggleSectionCommentDrawer = (
    targetKind: SectionCommentTargetKind,
    targetId: string
  ) => {
    const key = `${targetKind}:${targetId}`;
    setOpenCommentTargets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddSectionComment = (input: {
    targetKind: SectionCommentTargetKind;
    targetId: string;
    targetLabel: string;
    category: SectionCommentCategory;
    body: string;
  }) => {
    if (!activePrimer || isReadOnlySnapshot) {
      onNotice?.('Cannot add draft notes while viewing a frozen historical snapshot.');
      return;
    }
    try {
      const next = addSectionCommentToDraft(activePrimer, {
        ...input,
        boundRevisionId:
          activePrimer.extensions?.reviewVersioning?.activeRevisionId ??
          selectedReviewRevision?.revisionId ??
          undefined,
        boundRevisionNumber:
          activePrimer.extensions?.reviewVersioning?.revisionNumber ??
          selectedReviewRevision?.revisionNumber ??
          null,
      });
      setActivePrimer(next);
      setHasUnsavedDraftEdits(true);
      onNotice?.(`Added note on ${input.targetLabel}`);
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : String(err));
    }
  };

  const handleEditSectionComment = (commentId: string, nextBody: string) => {
    if (!activePrimer || isReadOnlySnapshot) {
      onNotice?.('Cannot edit notes inside a frozen historical revision snapshot.');
      return;
    }
    try {
      const next = editSectionCommentInDraft(activePrimer, commentId, nextBody);
      setActivePrimer(next);
      setHasUnsavedDraftEdits(true);
      onNotice?.('Updated section note');
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteSectionComment = (commentId: string) => {
    if (!activePrimer || isReadOnlySnapshot) {
      onNotice?.('Cannot delete notes inside a frozen historical revision snapshot.');
      return;
    }
    try {
      const next = deleteSectionCommentFromDraft(activePrimer, commentId);
      setActivePrimer(next);
      setHasUnsavedDraftEdits(true);
      onNotice?.('Deleted draft section note');
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : String(err));
    }
  };

  // Correction Requests Workflow Handlers
  const activeBaseRevision = useMemo(() => {
    if (viewingRevision) return viewingRevision;
    const baseRevId = activePrimer?.extensions?.reviewVersioning?.activeRevisionId;
    if (baseRevId) {
      const exact = revisions.find((r) => r.revisionId === baseRevId);
      if (exact) return exact;
    }
    return (
      revisions
        .filter((r) => r.eventId === event.id)
        .sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null
    );
  }, [viewingRevision, activePrimer, revisions, event.id]);

  const handleTriggerFlagForCorrection = (
    targetKind: SectionCommentTargetKind,
    targetId: string,
    targetLabel: string
  ) => {
    setFlagComposerTarget({
      targetKind,
      targetId,
      targetLabel,
      nonce: Date.now(),
    });
    correctionPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleCreateCorrectionRequest = async (input: {
    targetKind: SectionCommentTargetKind;
    targetId: string;
    targetLabel: string;
    summary: string;
    reason: string;
    requestedByLabel: string;
  }) => {
    let sourceRevision = viewingRevision ?? activeBaseRevision;

    // Ensure every Correction Request anchors to a real immutable frozen snapshot
    if (!sourceRevision) {
      if (!activePrimer) {
        throw new Error('Generate or load a primer before flagging a section for correction.');
      }
      const { revision, updatedWorkingDraft } = createPrimerRevisionRecord(activePrimer, {
        description: `Baseline frozen snapshot prior to correction flag (${input.targetLabel})`,
        existingRevisions: revisions,
        currentEventFingerprint,
        currentStage3Fingerprint,
        currentStage4Fingerprint,
        isPlotResultStale,
      });
      await archiveStore.saveRevision(revision);
      const updatedList = savePrimerDraftToStorage(updatedWorkingDraft);
      setSavedDrafts(updatedList);
      const savedCopy =
        updatedList.find((d) => d.id === updatedWorkingDraft.id) ?? updatedWorkingDraft;
      setActivePrimer(savedCopy);
      setHasUnsavedDraftEdits(false);
      setSelectedReviewRevisionId(revision.revisionId);
      sourceRevision = revision;
    }

    let request = createCorrectionRequestRecord(sourceRevision, {
      targetKind: input.targetKind,
      targetId: input.targetId,
      targetLabel: input.targetLabel,
      summary: input.summary,
      reason: input.reason,
      requestedByLabel: input.requestedByLabel,
    });

    // Synchronize with revision-bound Scientific Review record
    const existingReview =
      reviews
        .filter((r) => r.revisionId === sourceRevision!.revisionId)
        .sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc))[0] ??
      createPrimerReviewRecord(sourceRevision, {
        reviewerLabel: input.requestedByLabel,
      });

    const updatedReview = addPrimerReviewComment(existingReview, {
      targetKind: input.targetKind,
      targetId: input.targetId,
      targetLabel: input.targetLabel,
      category: 'correction-request',
      body:
        input.reason && input.reason !== input.summary
          ? `${input.summary} — ${input.reason}`
          : input.summary,
      isCorrectionRequest: true,
      authorLabel: input.requestedByLabel,
    });
    const linkedComment = updatedReview.comments[0];
    if (linkedComment) {
      request = attachLinkedReviewCommentId(request, linkedComment.commentId);
    }

    await reviewStore.saveReview(updatedReview);
    await correctionStore.saveRequest(request);
    await refreshArchiveState();
    onNotice?.(
      `Created Correction Request ${request.requestId} linked to Rev #${sourceRevision.revisionNumber} (historical snapshot preserved)`
    );
  };

  const handleStartDraftCorrection = async (
    request: PrimerCorrectionRequest,
    sourceRevision: PrimerRevisionRecord
  ) => {
    const restoredDraft = handleRestoreAsNewWorkingDraft(sourceRevision);
    const updatedReq = markCorrectionDraftStarted(request, restoredDraft.id);
    await correctionStore.saveRequest(updatedReq);
    await refreshArchiveState();
    onNotice?.(
      `Created editable draft copy (${restoredDraft.id}) for ${request.targetLabel} without modifying Rev #${sourceRevision.revisionNumber}`
    );
  };

  const handleResolveCorrectionRequest = async (
    request: PrimerCorrectionRequest,
    options: {
      resolutionNote: string;
      resolvedInRevision: PrimerRevisionRecord | null;
    }
  ) => {
    const updatedReq = resolveCorrectionRequestItem(request, options);
    await correctionStore.saveRequest(updatedReq);

    if (request.linkedReviewCommentId) {
      const boundReview = reviews.find(
        (r) => r.revisionId === request.sourceRevisionId
      );
      if (boundReview) {
        const targetComment = boundReview.comments.find(
          (c) => c.commentId === request.linkedReviewCommentId
        );
        if (targetComment && targetComment.resolutionState !== 'resolved') {
          const updatedRev = resolveReviewCorrectionComment(
            boundReview,
            targetComment.commentId,
            options.resolutionNote
          );
          await reviewStore.saveReview(updatedRev);
        }
      }
    }

    await refreshArchiveState();
    onNotice?.(`Resolved Correction Request ${request.requestId}`);
  };

  const handleReopenCorrectionRequest = async (request: PrimerCorrectionRequest) => {
    const reopened = reopenCorrectionRequestItem(request);
    await correctionStore.saveRequest(reopened);

    if (request.linkedReviewCommentId) {
      const boundReview = reviews.find(
        (r) => r.revisionId === request.sourceRevisionId
      );
      if (boundReview) {
        const targetComment = boundReview.comments.find(
          (c) => c.commentId === request.linkedReviewCommentId
        );
        if (targetComment && targetComment.resolutionState === 'resolved') {
          const updatedRev = reopenReviewCorrectionComment(
            boundReview,
            targetComment.commentId,
            'Reopened from Correction Requests workflow'
          );
          await reviewStore.saveReview(updatedRev);
        }
      }
    }

    await refreshArchiveState();
    onNotice?.(`Reopened Correction Request ${request.requestId}`);
  };

  const handleExportReviewPackageZip = async (
    revision: PrimerRevisionRecord,
    review: PrimerReviewRecord
  ) => {
    if (isExportingReviewZip) return;
    setIsExportingReviewZip(true);
    try {
      const snap = revision.snapshot;
      const fig = snap.extensions?.epicenterFigure;
      const stage3 = snap.extensions?.sequenceHistoricalAnalysis;
      const [mapPngDataUrl, s3MapPng, s3TimePng, s3MagPng] = await Promise.all([
        fig && fig.status === 'ready' && fig.svgMarkup
          ? rasterizePrimerSvgToPng(fig.svgMarkup, 1520, 1096)
          : Promise.resolve(null),
        stage3?.figures.aftershockMap.status === 'ready' &&
        stage3.figures.aftershockMap.svgMarkup
          ? rasterizePrimerSvgToPng(stage3.figures.aftershockMap.svgMarkup, 1520, 984)
          : Promise.resolve(null),
        stage3?.figures.activityChart.status === 'ready' &&
        stage3.figures.activityChart.svgMarkup
          ? rasterizePrimerSvgToPng(stage3.figures.activityChart.svgMarkup, 1520, 580)
          : Promise.resolve(null),
        stage3?.figures.magnitudeChart.status === 'ready' &&
        stage3.figures.magnitudeChart.svgMarkup
          ? rasterizePrimerSvgToPng(stage3.figures.magnitudeChart.svgMarkup, 1520, 496)
          : Promise.resolve(null),
      ]);

      const revInfo = toPrimerExportRevisionInfo(revision);
      const pdfCommon = {
        mapPngDataUrl: mapPngDataUrl ?? undefined,
        revisionInfo: revInfo,
        stage3Pngs: {
          aftershockMap: s3MapPng ?? undefined,
          activityChart: s3TimePng ?? undefined,
          magnitudeChart: s3MagPng ?? undefined,
        },
      };

      const pubPdf = new Uint8Array(
        buildPrimerPdfDocument(snap, { ...pdfCommon, mode: 'public-draft' }).doc.output(
          'arraybuffer'
        )
      );
      const sciPdf = new Uint8Array(
        buildPrimerPdfDocument(snap, {
          ...pdfCommon,
          mode: 'scientific-review',
        }).doc.output('arraybuffer')
      );

      const built = buildPrimerReviewPackageZip({
        revision,
        review,
        allRevisionsForDoc: revisions.filter(
          (r) => r.primerDocumentId === revision.primerDocumentId
        ),
        includeExports: true,
        publicDraftPdfBytes: pubPdf,
        scientificReviewPdfBytes: sciPdf,
      });

      const blob = new Blob([built.zipBytes.buffer as ArrayBuffer], {
        type: 'application/zip',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = built.filename;
      a.click();
      URL.revokeObjectURL(url);
      onNotice?.(
        `Exported portable Scientific Review Package (${built.filename}) — labeled NOT AN APPROVED PUBLICATION`
      );
    } finally {
      setIsExportingReviewZip(false);
    }
  };

  const handleImportReviewPackageZip = async (bytes: Uint8Array) => {
    const res = validateAndImportPrimerReviewPackageZip(bytes);
    if (!res.ok || !res.revision || !res.review) {
      onNotice?.(`Review package ZIP rejected: ${res.errors[0] ?? 'Validation failed'}`);
      return {
        ok: false,
        message: 'Review package validation failed.',
        errors: res.errors,
      };
    }

    const existingRevIds = new Set(revisions.map((r) => r.revisionId));
    if (!existingRevIds.has(res.revision.revisionId)) {
      await archiveStore.saveRevision(res.revision);
    }
    await reviewStore.saveReview(res.review);
    setSelectedReviewRevisionId(res.revision.revisionId);
    await refreshArchiveState();
    const msg = `Imported validated Review Package for Rev #${res.revision.revisionNumber} (${res.revision.eventId})`;
    onNotice?.(msg);
    return { ok: true, message: msg, errors: [] };
  };

  const handleExportReviewArchiveJson = () => {
    const json = serializePrimerReviewArchiveJson(reviews);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EQP_Primer_Reviews_${new Date().toISOString().slice(0, 10)}.review-archive.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotice?.(`Exported portable review archive JSON (${reviews.length} record(s))`);
  };

  const handleImportReviewArchiveJson = async (rawJson: string) => {
    const result = await reviewStore.importArchiveJson(rawJson);
    await refreshArchiveState();
    if (result.ok) {
      onNotice?.(`Imported ${result.importedCount} validated local review record(s)`);
    } else {
      onNotice?.(`Review archive rejected: ${result.errors[0] ?? 'Validation failed'}`);
    }
    return {
      ok: result.ok,
      importedCount: result.importedCount,
      errors: result.errors,
    };
  };

  const handleExportHtml = (
    targetMode: PrimerPresentationMode = presentationMode,
    overrideDoc?: PrimerDocument,
    overrideRevisionInfo?: PrimerExportRevisionInfo
  ) => {
    const docToExport = overrideDoc ?? displayedPrimer;
    if (!docToExport) return;
    const revInfo =
      overrideRevisionInfo ??
      (viewingRevision ? toPrimerExportRevisionInfo(viewingRevision) : undefined);
    const html = buildPrimerHtmlDocument(docToExport, {
      mode: targetMode,
      includePageBreakGuides: false,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      revisionInfo: revInfo,
    });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = buildPrimerExportFilename(docToExport, targetMode, 'html', revInfo);
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    const modeTitle =
      targetMode === 'public-draft' ? 'Public Primer Draft' : 'Scientific Review Copy';
    onNotice?.(`Exported ${modeTitle} HTML primer: ${filename}`);
  };

  const handleExportPdf = async (
    targetMode: PrimerPresentationMode = presentationMode,
    overrideDoc?: PrimerDocument,
    overrideRevisionInfo?: PrimerExportRevisionInfo
  ) => {
    const docToExport = overrideDoc ?? displayedPrimer;
    if (!docToExport || isExportingPdf) return;
    const revInfo =
      overrideRevisionInfo ??
      (viewingRevision ? toPrimerExportRevisionInfo(viewingRevision) : undefined);
    setIsExportingPdf(true);
    try {
      const fig = docToExport.extensions?.epicenterFigure;
      const stage3 = docToExport.extensions?.sequenceHistoricalAnalysis;
      const [mapPngDataUrl, s3MapPng, s3TimePng, s3MagPng] = await Promise.all([
        fig && fig.status === 'ready' && fig.svgMarkup
          ? rasterizePrimerSvgToPng(fig.svgMarkup, 1520, 1096)
          : Promise.resolve(null),
        stage3?.figures.aftershockMap.status === 'ready' &&
        stage3.figures.aftershockMap.svgMarkup
          ? rasterizePrimerSvgToPng(stage3.figures.aftershockMap.svgMarkup, 1520, 984)
          : Promise.resolve(null),
        stage3?.figures.activityChart.status === 'ready' &&
        stage3.figures.activityChart.svgMarkup
          ? rasterizePrimerSvgToPng(stage3.figures.activityChart.svgMarkup, 1520, 580)
          : Promise.resolve(null),
        stage3?.figures.magnitudeChart.status === 'ready' &&
        stage3.figures.magnitudeChart.svgMarkup
          ? rasterizePrimerSvgToPng(stage3.figures.magnitudeChart.svgMarkup, 1520, 496)
          : Promise.resolve(null),
      ]);

      const missingPngWarnings: string[] = [];
      if (fig?.status === 'ready' && !mapPngDataUrl) {
        missingPngWarnings.push(
          'Epicenter & Geographic Context Map SVG rasterization returned null (canvas fallback invoked)'
        );
      }
      if (stage3?.figures.aftershockMap.status === 'ready' && !s3MapPng) {
        missingPngWarnings.push('Sequence & Historical Seismicity Map failed PNG rasterization');
      }
      if (stage3?.figures.activityChart.status === 'ready' && !s3TimePng) {
        missingPngWarnings.push('Earthquake Activity vs. Time Chart failed PNG rasterization');
      }
      if (stage3?.figures.magnitudeChart.status === 'ready' && !s3MagPng) {
        missingPngWarnings.push('Catalog Magnitude Distribution Chart failed PNG rasterization');
      }

      const filename = downloadPrimerPdf(docToExport, {
        event: revInfo ? undefined : event,
        mode: targetMode,
        mapPngDataUrl: mapPngDataUrl ?? undefined,
        currentEventFingerprint,
        currentStage3Fingerprint,
        currentStage4Fingerprint,
        revisionInfo: revInfo,
        missingPngWarnings: missingPngWarnings.length > 0 ? missingPngWarnings : undefined,
        stage3Pngs: {
          aftershockMap: s3MapPng ?? undefined,
          activityChart: s3TimePng ?? undefined,
          magnitudeChart: s3MagPng ?? undefined,
        },
      });
      const modeTitle =
        targetMode === 'public-draft' ? 'Public Primer Draft' : 'Scientific Review Copy';
      if (missingPngWarnings.length > 0) {
        onNotice?.(
          `Exported ${modeTitle} PDF (${filename}) with figure raster warnings: ${missingPngWarnings.join('; ')}`
        );
      } else {
        onNotice?.(`Exported print-ready ${modeTitle} PDF primer: ${filename}`);
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintPrimer = (targetMode: PrimerPresentationMode = presentationMode) => {
    if (!displayedPrimer) return;
    const revInfo = viewingRevision ? toPrimerExportRevisionInfo(viewingRevision) : undefined;
    const html = buildPrimerHtmlDocument(displayedPrimer, {
      mode: targetMode,
      includePageBreakGuides: false,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      revisionInfo: revInfo,
    });
    const ok = printBulletinHtmlDocument(html);
    if (ok) {
      onNotice?.(
        `Sent ${targetMode === 'public-draft' ? 'Public Primer Draft' : 'Scientific Review Copy'} (${displayedPrimer.eventId}) to print dialog`
      );
    } else {
      onNotice?.('Unable to open browser print preview for primer');
    }
  };

  const handleRefreshPreview = () => {
    setPreviewRefreshSeq((s) => s + 1);
    onNotice?.('Refreshed Stage 5 A4 print preview from current primer state');
  };

  const sectionCounts = useMemo(() => {
    if (!displayedPrimer) {
      return { total: 7, ready: 0, requiresInfo: 0, scientificReview: 0 };
    }
    let ready = 0;
    let requiresInfo = 0;
    let scientificReview = 0;
    for (const sec of displayedPrimer.sections) {
      if (sec.reviewStatus === 'ready-for-review') ready++;
      else if (sec.reviewStatus === 'requires-info') requiresInfo++;
      else scientificReview++;
    }
    return {
      total: displayedPrimer.sections.length,
      ready,
      requiresInfo,
      scientificReview,
    };
  }, [displayedPrimer]);

  const presConfig = useMemo(
    () =>
      normalizePresentationConfig(
        displayedPrimer?.extensions?.presentationConfig ?? DEFAULT_PRIMER_PRESENTATION_CONFIG
      ),
    [displayedPrimer?.extensions?.presentationConfig]
  );

  const readinessSummary = useMemo(
    () =>
      displayedPrimer
        ? computePrimerReadinessSummary(displayedPrimer, {
            currentEventFingerprint,
            currentStage3Fingerprint,
            currentStage4Fingerprint,
            isPlotResultStale,
          })
        : null,
    [
      displayedPrimer,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      isPlotResultStale,
    ]
  );

  const selectedReviewRevision = useMemo(() => {
    if (viewingRevision) return viewingRevision;
    if (selectedReviewRevisionId) {
      const exact = revisions.find((r) => r.revisionId === selectedReviewRevisionId);
      if (exact) return exact;
    }
    const forEvent = revisions
      .filter((r) => r.eventId === event.id)
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
    return forEvent[0] ?? revisions[0] ?? null;
  }, [viewingRevision, selectedReviewRevisionId, revisions, event.id]);

  const liveReviewSourceContext = useMemo(
    () => ({
      event,
      primaryLocationLabel,
      faultGeneratorLabel,
      isPlotResultStale,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      liveExternalData: activePrimer?.extensions?.scientificNarrativePackage?.externalData,
    }),
    [
      event,
      primaryLocationLabel,
      faultGeneratorLabel,
      isPlotResultStale,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      activePrimer?.extensions?.scientificNarrativePackage?.externalData,
    ]
  );

  const extendedReadinessSummary = useMemo(() => {
    if (!displayedPrimer) return null;
    const boundReview = selectedReviewRevision
      ? reviews
          .filter((r) => r.revisionId === selectedReviewRevision.revisionId)
          .sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc))[0] ?? null
      : null;
    const sameDocRevs = selectedReviewRevision
      ? revisions.filter(
          (r) => r.primerDocumentId === selectedReviewRevision.primerDocumentId
        )
      : [];
    const validity =
      boundReview && selectedReviewRevision
        ? evaluatePrimerReviewValidity(
            boundReview,
            selectedReviewRevision,
            sameDocRevs,
            liveReviewSourceContext
          )
        : null;

    return computeExtendedPrimerReadiness(displayedPrimer, {
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      isPlotResultStale,
      activeRevision: selectedReviewRevision,
      reviewRecord: boundReview,
      reviewValidity: validity,
    });
  }, [
    displayedPrimer,
    selectedReviewRevision,
    reviews,
    revisions,
    liveReviewSourceContext,
    currentEventFingerprint,
    currentStage3Fingerprint,
    currentStage4Fingerprint,
    isPlotResultStale,
  ]);

  const sourceChangeReport = useMemo(() => {
    if (!displayedPrimer) return null;
    return detectPrimerSourceChanges(viewingRevision ?? displayedPrimer, {
      event,
      primaryLocationLabel,
      faultGeneratorLabel,
      isPlotResultStale,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      liveExternalData: viewingRevision
        ? activePrimer?.extensions?.scientificNarrativePackage?.externalData
        : undefined,
    });
  }, [
    viewingRevision,
    displayedPrimer,
    event,
    primaryLocationLabel,
    faultGeneratorLabel,
    isPlotResultStale,
    currentEventFingerprint,
    currentStage3Fingerprint,
    currentStage4Fingerprint,
    activePrimer?.extensions?.scientificNarrativePackage?.externalData,
  ]);

  const comparisonReport = useMemo(
    () =>
      comparisonTarget
        ? comparePrimerRevisions(comparisonTarget.left, comparisonTarget.right)
        : null,
    [comparisonTarget]
  );

  const currentFigure = displayedPrimer?.extensions?.epicenterFigure ?? null;
  const isFigureStale = Boolean(
    currentFigure &&
      (currentFigure.provenance.sourceEventFingerprint !== currentEventFingerprint ||
        currentFigure.provenance.sourceSolutionStatus === 'stale' ||
        isPlotResultStale)
  );
  const figureImgSrc = useMemo(() => {
    if (!currentFigure || currentFigure.status !== 'ready' || !currentFigure.svgMarkup) {
      return '';
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(currentFigure.svgMarkup)}`;
  }, [currentFigure]);

  const previewHtml = useMemo(
    () =>
      displayedPrimer
        ? buildPrimerHtmlDocument(displayedPrimer, {
            mode: presentationMode,
            includePageBreakGuides: true,
            currentEventFingerprint,
            currentStage3Fingerprint,
            currentStage4Fingerprint,
            revisionInfo: viewingRevision
              ? toPrimerExportRevisionInfo(viewingRevision)
              : undefined,
          })
        : '',
    [
      displayedPrimer,
      viewingRevision,
      presentationMode,
      currentEventFingerprint,
      currentStage3Fingerprint,
      currentStage4Fingerprint,
      previewRefreshSeq,
    ]
  );

  return (
    <div className="bg-slate-50 border border-slate-300 rounded-xs shadow-xs overflow-hidden text-slate-900">
      {/* Top Workstation Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold tracking-tight text-slate-900">
              Automatic Earthquake Primer Generator
            </h2>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              Event {event.id} · B{event.bulletinNo}
            </span>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-medium text-amber-800">
              Draft Workflow Only (Never Auto-Published)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Stage 1–6B print-ready Earthquake Primer workstation: verified parameters, Epicenter Map, Sequence &amp; Historical Seismicity, Hazard/Tsunami Safeguards, Public/Scientific A4 Exports, Immutable Revisions, and Local Scientific Review. Never alters PLOT solutions or official event parameters.
          </p>
        </div>

        {/* Primary Action Controls */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {!isReadOnlySnapshot && (
            <button
              type="button"
              onClick={() => handleManualGeneratePrimer(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] transition-colors whitespace-nowrap shrink-0"
              title="Manually generate a fresh Earthquake Primer draft regardless of magnitude"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>{activePrimer ? 'Regenerate Primer' : 'Generate Primer'}</span>
            </button>
          )}

          {displayedPrimer && (
            <>
              {!isReadOnlySnapshot && (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      hasUnsavedDraftEdits
                        ? 'bg-emerald-700 border-emerald-800 text-white hover:bg-emerald-800'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{hasUnsavedDraftEdits ? 'Save Draft*' : 'Save Draft'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveNewRevision('')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs border border-[#005a94] bg-white text-[#005a94] text-xs font-semibold hover:bg-sky-50 transition-colors whitespace-nowrap shrink-0"
                    title="Freeze current working draft into an immutable historical revision in local archive"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Save New Revision</span>
                  </button>
                </>
              )}

              {isReadOnlySnapshot && viewingRevision && (
                <button
                  type="button"
                  onClick={() => handleRestoreAsNewWorkingDraft(viewingRevision)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore as New Draft</span>
                </button>
              )}

              <div
                className="inline-flex rounded-xs border border-slate-300 bg-slate-100 p-0.5 shrink-0"
                role="group"
                aria-label="Primer view mode"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-xs whitespace-nowrap shrink-0 ${
                    viewMode === 'edit'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isReadOnlySnapshot ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <Pencil className="w-3 h-3" />
                  )}
                  <span>{isReadOnlySnapshot ? 'Inspect Snapshot' : 'Edit Sections'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-xs whitespace-nowrap shrink-0 ${
                    viewMode === 'preview'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3 h-3" />
                  <span>Print Preview</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stage 5 Presentation Mode & Explicit Publication Draft Export Toolbar */}
      {displayedPrimer && (
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
              Presentation Mode:
            </span>
            <div
              className="inline-flex rounded-xs border border-slate-300 bg-slate-100 p-0.5 shrink-0"
              role="group"
              aria-label="Presentation document mode"
            >
              <button
                type="button"
                onClick={() => setPresentationMode('public-draft')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-xs whitespace-nowrap shrink-0 ${
                  presentationMode === 'public-draft'
                    ? 'bg-white text-[#005a94] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Public Primer Draft
              </button>
              <button
                type="button"
                onClick={() => setPresentationMode('scientific-review')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-xs whitespace-nowrap shrink-0 ${
                  presentationMode === 'scientific-review'
                    ? 'bg-white text-[#005a94] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Scientific Review Copy
              </button>
            </div>

            {viewMode === 'edit' && !isReadOnlySnapshot && (
              <button
                type="button"
                onClick={() => setShowSectionOrderPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  showSectionOrderPanel
                    ? 'bg-[#005a94] border-[#005a94] text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Section Order &amp; Headings</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleExportPdf('public-draft')}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <FileText className="w-3 h-3" />
              <span>Export Public Draft (.PDF)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportHtml('public-draft')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Download className="w-3 h-3" />
              <span>Export Public Draft (.HTML)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportPdf('scientific-review')}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <FileText className="w-3 h-3" />
              <span>Export Scientific Review (.PDF)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExportHtml('scientific-review')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Download className="w-3 h-3" />
              <span>Export Scientific Review (.HTML)</span>
            </button>
            <button
              type="button"
              onClick={() => handlePrintPrimer(presentationMode)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Printer className="w-3 h-3" />
              <span>Print Preview</span>
            </button>
          </div>
        </div>
      )}

      {/* Inline Overwrite Confirmation when unsaved edits exist */}
      {confirmOverwriteAuto && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
          <span>
            You have unsaved edits in the current primer draft. Regenerating will replace text sections with a fresh deterministic template for Event {event.id}.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleManualGeneratePrimer(true)}
              className="px-2.5 py-1 rounded-xs bg-amber-800 text-white font-semibold hover:bg-amber-900 whitespace-nowrap"
            >
              Replace with Fresh Template
            </button>
            <button
              type="button"
              onClick={() => setConfirmOverwriteAuto(false)}
              className="px-2.5 py-1 rounded-xs border border-amber-300 bg-white text-amber-950 font-medium hover:bg-amber-100 whitespace-nowrap"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Split Workspace: Left Audit & Rules Rail + Right Editable Document Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-[350px_minmax(0,1fr)] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        {/* LEFT COLUMN: Extracted Event Parameters, Eligibility Rules, Saved Drafts */}
        <aside className="bg-slate-50 p-4 space-y-4">
          {/* 1. Read-Only Extracted Event Parameters */}
          <section className="bg-white border border-slate-200 rounded-xs p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Extracted Event Data
              </h3>
              <span className="text-[10.5px] font-mono text-slate-500">
                Read-Only
              </span>
            </div>

            <dl className="space-y-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Event ID</dt>
                <dd className="font-mono tabular-nums font-semibold text-slate-900 text-right">
                  {extracted.eventId}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Origin (UTC)</dt>
                <dd className="font-mono tabular-nums text-slate-800 text-right">
                  {extracted.originDateUtc} {extracted.originTimeUtc}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Origin (PST)</dt>
                <dd className="font-mono tabular-nums text-slate-800 text-right">
                  {extracted.originDatePst} {extracted.originTimePst}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Coordinates</dt>
                <dd
                  className={`font-mono tabular-nums text-right ${
                    extracted.isLocated ? 'text-slate-900 font-semibold' : 'text-rose-700 font-semibold'
                  }`}
                >
                  {extracted.isLocated && extracted.lat !== null && extracted.lon !== null
                    ? `${extracted.lat.toFixed(3)}°N, ${extracted.lon.toFixed(3)}°E`
                    : 'Pending Location'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Focal Depth</dt>
                <dd className="font-mono tabular-nums text-slate-900 text-right">
                  {extracted.depthKm !== null
                    ? `${extracted.depthKm.toFixed(1)} km`
                    : 'Pending'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Magnitude</dt>
                <dd
                  className={`font-mono tabular-nums text-right ${
                    extracted.magnitudeValue !== null
                      ? 'text-slate-900 font-semibold'
                      : 'text-rose-700 font-semibold'
                  }`}
                >
                  {extracted.magnitudeValue !== null && extracted.magnitudeScale
                    ? `${extracted.magnitudeScale} ${extracted.magnitudeValue.toFixed(1)}`
                    : `Pending (${event.preferredScale})`}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Verified PEIS</dt>
                <dd className="font-mono tabular-nums text-slate-800 text-right">
                  {extracted.verifiedFeltCount} felt · {extracted.verifiedInstrumentalCount} instr
                  {extracted.maxVerifiedPeis ? ` (Max ${extracted.maxVerifiedPeis})` : ''}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 shrink-0">Tsunami Status</dt>
                <dd className="font-semibold text-slate-800 text-right">
                  {extracted.tsunamiStatus}
                </dd>
              </div>
            </dl>

            {extracted.unavailableOrUnverifiedFields.length > 0 && (
              <div className="pt-2 border-t border-slate-200">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-800 mb-1">
                  Missing / Unverified Fields ({extracted.unavailableOrUnverifiedFields.length})
                </div>
                <ul className="space-y-1 text-[11px] text-slate-600 list-disc pl-4">
                  {extracted.unavailableOrUnverifiedFields.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* 2. Configurable Automatic Draft Eligibility Rules */}
          <section className="bg-white border border-slate-200 rounded-xs p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#005a94]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Auto-Draft Eligibility Rules
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRules(DEFAULT_PRIMER_ELIGIBILITY_RULES)}
                className="text-[11px] text-[#005a94] hover:underline font-medium"
              >
                Reset
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-medium text-slate-800">
                  Enable Automatic Draft Creation
                </span>
                <input
                  type="checkbox"
                  checked={rules.enabled}
                  onChange={(e) =>
                    setRules((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="accent-[#005a94]"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="primer-min-mag"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Min Magnitude
                  </label>
                  <input
                    id="primer-min-mag"
                    type="number"
                    min={1}
                    max={9.5}
                    step={0.1}
                    value={rules.minMagnitude}
                    onChange={(e) => {
                      const val = Number.parseFloat(e.target.value);
                      if (Number.isFinite(val)) {
                        setRules((prev) => ({
                          ...prev,
                          minMagnitude: Math.max(0, Math.min(9.5, val)),
                        }));
                      }
                    }}
                    className="w-full px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="primer-min-peis"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Or Verified PEIS ≥
                  </label>
                  <select
                    id="primer-min-peis"
                    value={rules.minPeisTrigger}
                    onChange={(e) =>
                      setRules((prev) => ({
                        ...prev,
                        minPeisTrigger: e.target.value as PeisRoman | 'none',
                      }))
                    }
                    className="w-full px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  >
                    <option value="none">Disabled</option>
                    {PEIS_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        PEIS {lvl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-slate-700">Require Located Epicenter</span>
                <input
                  type="checkbox"
                  checked={rules.requireLocated}
                  onChange={(e) =>
                    setRules((prev) => ({ ...prev, requireLocated: e.target.checked }))
                  }
                  className="accent-[#005a94]"
                />
              </label>

              <div
                className={`p-2 rounded-xs border text-[11px] ${
                  eligibility.eligible
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <div className="font-semibold">
                  {eligibility.eligible
                    ? 'Eligible for Automatic Draft'
                    : 'Manual Generation Only'}
                </div>
                <div className="mt-0.5">{eligibility.summary}</div>
              </div>
            </div>
          </section>

          {/* 3. Saved Primer Drafts Repository */}
          <section className="bg-white border border-slate-200 rounded-xs p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Saved Drafts ({savedDrafts.length})
              </h3>
              <button
                type="button"
                onClick={() => handleManualGeneratePrimer(true)}
                className="text-[11px] font-semibold text-[#005a94] hover:underline whitespace-nowrap"
              >
                + New Draft
              </button>
            </div>

            {eventDrafts.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No saved primer drafts for Event {event.id} yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                  Active Event ({eventDrafts.length})
                </div>
                {eventDrafts.map((draft) => {
                  const isCurrent = activePrimer?.id === draft.id;
                  return (
                    <div
                      key={draft.id}
                      className={`border rounded-xs p-2 text-xs transition-colors ${
                        isCurrent
                          ? 'bg-sky-50 border-[#005a94]'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadDraft(draft)}
                          className="text-left min-w-0 flex-1"
                        >
                          <div className="font-semibold text-slate-900 truncate">
                            {draft.generationTrigger === 'auto-rule-draft'
                              ? 'Auto-Rule Draft'
                              : 'Manual Draft'}{' '}
                            · B{draft.bulletinNo}
                          </div>
                          <div className="text-[10.5px] font-mono tabular-nums text-slate-500 mt-0.5">
                            Saved {new Date(draft.savedAt || draft.updatedAt).toLocaleString()}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDraft(draft.id)}
                          aria-label={`Delete draft ${draft.id}`}
                          className="p-1 text-slate-400 hover:text-rose-700 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {otherEventDrafts.length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                  Other Events ({otherEventDrafts.length})
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {otherEventDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="flex items-center justify-between gap-1.5 border border-slate-200 rounded-xs px-2 py-1.5 text-[11px] bg-slate-50/70"
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadDraft(draft)}
                        className="text-left truncate font-mono text-slate-700 hover:text-[#005a94] flex-1"
                      >
                        {draft.eventId} (B{draft.bulletinNo})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(draft.id)}
                        aria-label={`Delete draft ${draft.id}`}
                        className="p-0.5 text-slate-400 hover:text-rose-700 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </aside>

        {/* RIGHT COLUMN: Editable Document Workspace / Immutable Snapshot Viewer / Archive */}
        <div className="bg-white p-4 sm:p-5 space-y-4 min-w-0">
          {/* Immutable Historical Revision Read-Only Banner */}
          {viewingRevision && (
            <div className="border border-sky-300 bg-sky-50 rounded-xs px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-900">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2 font-bold text-[#004877]">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    READ-ONLY HISTORICAL SNAPSHOT · Revision #{viewingRevision.revisionNumber}
                  </span>
                  <span className="font-mono text-[10.5px] font-normal text-slate-700">
                    ({viewingRevision.revisionId})
                  </span>
                </div>
                <div className="text-[11px] text-slate-700 font-mono tabular-nums">
                  Created {viewingRevision.createdAtPst} ({viewingRevision.createdAtUtc}) · Event{' '}
                  {viewingRevision.eventId} · Recorded Fingerprint{' '}
                  {viewingRevision.sourceEventFingerprint.slice(0, 12)}
                </div>
                <div className="text-[11px] text-slate-800">
                  <strong>Revision Note:</strong> {viewingRevision.description} — Historical snapshots cannot be silently edited or overwritten.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCompareWithWorkingDraft(viewingRevision)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                >
                  <GitCompare className="w-3 h-3" />
                  <span>Compare w/ Working Draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRestoreAsNewWorkingDraft(viewingRevision)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restore as New Working Draft</span>
                </button>
                <button
                  type="button"
                  onClick={handleReturnToWorkingDraft}
                  className="px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                >
                  Return to Working Draft
                </button>
              </div>
            </div>
          )}

          {/* Restored Lineage Banner on Editable Working Draft */}
          {!isReadOnlySnapshot &&
            activePrimer?.extensions?.reviewVersioning?.restoredFromRevisionNumber && (
              <div className="border border-slate-300 bg-slate-50 rounded-xs px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-800">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-[#005a94] shrink-0" />
                  <span>
                    <strong>Editable Working Draft Restored from Frozen Revision #{activePrimer.extensions.reviewVersioning.restoredFromRevisionNumber}</strong>{' '}
                    <span className="font-mono text-[11px] text-slate-600">
                      ({activePrimer.extensions.reviewVersioning.restoredFromRevisionId})
                    </span>{' '}
                    — Original historical snapshot remains intact.
                  </span>
                </div>
                <span className="font-mono text-[10.5px] text-slate-500">
                  Draft ID: {activePrimer.id}
                </span>
              </div>
            )}

          {/* Live Source Change Detection Banner */}
          {displayedPrimer && sourceChangeReport && sourceChangeReport.hasSourceChanges && (
            <div className="border border-amber-300 bg-amber-50 rounded-xs px-3.5 py-2.5 space-y-1.5 text-xs text-amber-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Source Change Detection ({sourceChangeReport.changes.length} update(s) vs. active EQP state)
                  </span>
                </div>
                <span className="font-mono text-[10.5px] text-amber-900">
                  Affected sections: {sourceChangeReport.affectedSections.join(', ')}
                </span>
              </div>
              <ul className="space-y-0.5 text-[11px] list-disc pl-5">
                {sourceChangeReport.changes.map((chg, idx) => (
                  <li key={`${chg.category}-${idx}`}>
                    <strong>{chg.label}:</strong> {chg.detail}{' '}
                    <span className="font-mono text-[10px] text-amber-900">
                      [{chg.affectedSections.join(', ')}]
                    </span>
                  </li>
                ))}
              </ul>
              {sourceChangeReport.preservedHistoricalProvenanceNote && (
                <div className="text-[11px] font-medium text-amber-900 pt-1 border-t border-amber-200">
                  {sourceChangeReport.preservedHistoricalProvenanceNote}
                </div>
              )}
            </div>
          )}

          {/* Stage 6A Revision Comparison Panel */}
          {comparisonReport && comparisonTarget && (
            <PrimerRevisionComparePanel
              report={comparisonReport}
              onSwapDirection={() =>
                setComparisonTarget((prev) =>
                  prev ? { left: prev.right, right: prev.left } : null
                )
              }
              onClose={() => setComparisonTarget(null)}
            />
          )}

          {!displayedPrimer ? (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xs bg-slate-50/60 p-8 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 text-[#005a94]">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  No Earthquake Primer Draft Generated for {event.id}
                </h3>
                <p className="text-xs text-slate-600 max-w-xl mx-auto leading-relaxed">
                  {eligibility.summary}. You can still manually generate a structured Stage 1 primer draft anytime using verified parameters extracted from the active event, or inspect/restore a historical revision below.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleManualGeneratePrimer(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] transition-colors whitespace-nowrap"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    <span>Generate Primer Draft Now</span>
                  </button>
                </div>
              </div>

              <PrimerResearchAssistantPanel
                event={event}
                activePrimer={displayedPrimer}
                primaryLocationLabel={primaryLocationLabel}
                faultGeneratorLabel={faultGeneratorLabel}
                isPlotResultStale={isPlotResultStale}
                readOnly={false}
                onNotice={onNotice}
              />
            </div>
          ) : viewMode === 'preview' ? (
            <div className="space-y-3">
              {/* Stage 5 Document-Readiness Summary (Preview Header Strip) */}
              {readinessSummary && (
                <div className="border border-slate-200 rounded-xs bg-slate-50 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Document-Readiness Summary
                    </span>
                    <span className="text-[10.5px] font-medium text-amber-900">
                      {readinessSummary.disclaimer}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 text-xs">
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Populated</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900">
                        {readinessSummary.populatedCount}/{readinessSummary.totalSections}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Requires Info</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.requiresInfoCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {readinessSummary.requiresInfoCount}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Sci. Review</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.requiresScientificReviewCount > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                        {readinessSummary.requiresScientificReviewCount}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Stale Alerts</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.staleIndicators.length > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                        {readinessSummary.staleIndicators.length}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Ready Figures</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900">
                        {readinessSummary.readyFigureCount}/{readinessSummary.totalFigureSlots}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Export Issues</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.exportIssues.length > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                        {readinessSummary.exportIssues.length}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* A4 Print Preview Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-300 rounded-xs px-3 py-2 text-xs text-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900">
                    {presentationMode === 'public-draft'
                      ? 'Public Primer Draft (Unreleased Q&A Layout)'
                      : 'Scientific Review Copy (Full Audit & Provenance)'}
                  </span>
                  <span className="font-mono text-[10.5px] text-slate-500 border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded-xs">
                    A4 Portrait · 210 × 297 mm
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="primer-preview-zoom" className="text-[11px] font-semibold text-slate-600">
                    Zoom:
                  </label>
                  <select
                    id="primer-preview-zoom"
                    value={previewZoom}
                    onChange={(e) =>
                      setPreviewZoom(e.target.value as 'fit' | '0.75' | '1' | '1.25')
                    }
                    className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  >
                    <option value="fit">Fit Width</option>
                    <option value="0.75">75%</option>
                    <option value="1">100% (A4)</option>
                    <option value="1.25">125%</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleRefreshPreview}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportHtml(presentationMode)}
                    className="px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Download .HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportPdf(presentationMode)}
                    disabled={isExportingPdf}
                    className="px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {isExportingPdf ? 'Exporting .PDF...' : 'Download .PDF'}
                  </button>
                </div>
              </div>

              <div className="border border-slate-300 rounded-xs bg-slate-200/80 p-3 sm:p-5 overflow-auto">
                <div
                  className="mx-auto transition-all"
                  style={
                    previewZoom === 'fit'
                      ? { width: '100%' }
                      : {
                          width: `${Math.round(820 * Number(previewZoom))}px`,
                        }
                  }
                >
                  <iframe
                    key={`${presentationMode}-${previewRefreshSeq}`}
                    title="Earthquake Primer Print Preview"
                    srcDoc={previewHtml}
                    className="w-full h-[840px] border border-slate-300 rounded-xs bg-white shadow-sm"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Unpublished Draft Notice Banner */}
              <div className="bg-amber-50 border border-amber-300 rounded-xs px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="font-semibold">
                    DRAFT PRIMER — NOT FOR PUBLIC RELEASE · REQUIRES SCIENTIFIC REVIEW
                  </span>
                </div>
                <div className="font-mono tabular-nums text-[11px] text-amber-900">
                  {sectionCounts.ready} ready · {sectionCounts.scientificReview} scientific review ·{' '}
                  {sectionCounts.requiresInfo} needs info
                </div>
              </div>

              {/* Stage 5 Document-Readiness Summary */}
              {readinessSummary && (
                <section className="border border-slate-200 rounded-xs bg-slate-50 p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Document-Readiness Summary
                    </h3>
                    <span className="text-[10.5px] font-medium text-amber-900">
                      {readinessSummary.disclaimer}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 text-xs">
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Populated Sections</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900">
                        {readinessSummary.populatedCount}/{readinessSummary.totalSections}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Requires Info</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.requiresInfoCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {readinessSummary.requiresInfoCount}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Sci. Review Needed</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.requiresScientificReviewCount > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                        {readinessSummary.requiresScientificReviewCount}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Stale Indicators</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.staleIndicators.length > 0 ? 'text-amber-800' : 'text-slate-900'}`}>
                        {readinessSummary.staleIndicators.length}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Ready Figures</div>
                      <div className="font-mono tabular-nums font-bold text-slate-900">
                        {readinessSummary.readyFigureCount}/{readinessSummary.totalFigureSlots}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">Export Warnings</div>
                      <div className={`font-mono tabular-nums font-bold ${readinessSummary.exportIssues.length > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                        {readinessSummary.exportIssues.length}
                      </div>
                    </div>
                  </div>
                  {(readinessSummary.exportIssues.length > 0 || readinessSummary.availableFigures.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                        <span className="font-semibold text-slate-700">Figure Sequence Status: </span>
                        <span className="text-slate-600">
                          {readinessSummary.availableFigures
                            .map((f) =>
                              f.status === 'ready' && f.figureNumber !== null
                                ? `Fig ${f.figureNumber}: ${f.label}`
                                : `${f.label} (Unavailable)`
                            )
                            .join(' · ')}
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
                        <span className="font-semibold text-slate-700">Pending / Export Notes: </span>
                        <span className={readinessSummary.exportIssues.length > 0 ? 'text-amber-900' : 'text-emerald-800'}>
                          {readinessSummary.exportIssues.length > 0
                            ? readinessSummary.exportIssues.join(' · ')
                            : 'No stale snapshots or blocking export warnings detected.'}
                        </span>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Configurable Document Section Order & Heading Style Panel */}
              {showSectionOrderPanel && !isReadOnlySnapshot && (
                <section className="border border-slate-300 rounded-xs bg-slate-50 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        Configurable Primer Layout &amp; Section Ordering (A4 Export)
                      </h3>
                      <p className="text-[11px] text-slate-600">
                        Reorder 12 structured document slots or switch heading styles for HTML/PDF presentation without changing underlying scientific data.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdatePresentationConfig({
                          sectionOrder: [...CANONICAL_PRIMER_SLOT_ORDER],
                          hiddenSlotIds: [],
                          headingStyle: 'question-and-answer',
                        })
                      }
                      className="px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                    >
                      Reset Default Order
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-semibold text-slate-700">Heading Style:</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="primer-heading-style"
                        checked={presConfig.headingStyle === 'question-and-answer'}
                        onChange={() =>
                          handleUpdatePresentationConfig({ headingStyle: 'question-and-answer' })
                        }
                        className="accent-[#005a94]"
                      />
                      <span>PHIVOLCS Q&amp;A Headings</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="primer-heading-style"
                        checked={presConfig.headingStyle === 'technical-numbered'}
                        onChange={() =>
                          handleUpdatePresentationConfig({ headingStyle: 'technical-numbered' })
                        }
                        className="accent-[#005a94]"
                      />
                      <span>Numbered Technical Headings</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {presConfig.sectionOrder.map((slotId, idx) => {
                      const meta = PRIMER_SLOT_HEADINGS[slotId];
                      const isHidden = presConfig.hiddenSlotIds.includes(slotId);
                      return (
                        <div
                          key={slotId}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xs border text-xs ${
                            isHidden
                              ? 'bg-slate-100 border-slate-200 text-slate-400'
                              : 'bg-white border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-[10.5px] text-slate-500 mr-1.5">
                              {String(idx + 1).padStart(2, '0')}.
                            </span>
                            <span className="font-medium truncate">
                              {presConfig.headingStyle === 'question-and-answer'
                                ? meta.qaTitle
                                : meta.technicalTitle}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {meta.optionalToggle && (
                              <label className="inline-flex items-center gap-1 text-[10.5px] text-slate-600 mr-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!isHidden}
                                  onChange={(e) =>
                                    handleToggleOptionalSlotVisibility(slotId, e.target.checked)
                                  }
                                  className="accent-[#005a94]"
                                />
                                <span>Include</span>
                              </label>
                            )}
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveSlotOrder(slotId, -1)}
                              aria-label={`Move ${meta.shortLabel} up`}
                              className="p-1 border border-slate-200 rounded-xs bg-slate-50 hover:bg-slate-100 disabled:opacity-40"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === presConfig.sectionOrder.length - 1}
                              onClick={() => handleMoveSlotOrder(slotId, 1)}
                              aria-label={`Move ${meta.shortLabel} down`}
                              className="p-1 border border-slate-200 rounded-xs bg-slate-50 hover:bg-slate-100 disabled:opacity-40"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Editable / Read-Only Document Title & Subtitle */}
              <div className="border border-slate-200 rounded-xs bg-slate-50/50 p-3.5 space-y-2.5">
                <div>
                  <label
                    htmlFor="primer-doc-title"
                    className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                  >
                    Primer Document Title
                  </label>
                  <input
                    id="primer-doc-title"
                    type="text"
                    value={displayedPrimer.title}
                    disabled={isReadOnlySnapshot}
                    onChange={(e) => handleUpdateTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94] disabled:bg-slate-50 disabled:text-slate-700"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                  <div>
                    <label
                      htmlFor="primer-doc-subtitle"
                      className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                    >
                      Document Subtitle / Reference
                    </label>
                    <input
                      id="primer-doc-subtitle"
                      type="text"
                      value={displayedPrimer.subtitle}
                      disabled={isReadOnlySnapshot}
                      onChange={(e) => handleUpdateSubtitle(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94] disabled:bg-slate-50 disabled:text-slate-600"
                    />
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 px-1 py-1.5">
                    {viewingRevision
                      ? `Frozen snapshot Rev #${viewingRevision.revisionNumber} (${viewingRevision.createdAtPst})`
                      : displayedPrimer.savedAt
                        ? `Last saved: ${new Date(displayedPrimer.savedAt).toLocaleTimeString()}`
                        : 'Unsaved draft'}
                  </div>
                </div>
              </div>

              {/* STAGE 2: EPICENTER MAP & GEOGRAPHIC CONTEXT FIGURE */}
              <section className="border border-slate-200 rounded-xs bg-white overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapIcon className="w-4 h-4 text-[#005a94] shrink-0" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Epicenter Map &amp; Geographic Context Figure
                    </h3>
                    {currentFigure && (
                      <span
                        className={`text-[10.5px] font-mono px-2 py-0.5 border rounded-xs whitespace-nowrap ${
                          currentFigure.status === 'unavailable'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : isFigureStale
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {currentFigure.status === 'unavailable'
                          ? 'Coordinates Unavailable'
                          : isFigureStale
                            ? 'Snapshot Stale'
                            : 'Synchronized'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {(() => {
                      const figCommentCount = getSectionCommentsForTarget(
                        displayedPrimer,
                        'figure',
                        'epicenter'
                      ).length;
                      const openFigCorrCount = correctionRequests.filter(
                        (r) =>
                          r.eventId === event.id &&
                          r.targetKind === 'figure' &&
                          r.targetId === 'epicenter' &&
                          r.status !== 'resolved'
                      ).length;
                      const drawerOpen = Boolean(openCommentTargets['figure:epicenter']);
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              toggleSectionCommentDrawer('figure', 'epicenter')
                            }
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-xs border text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                              drawerOpen || figCommentCount > 0
                                ? 'border-[#005a94] bg-sky-50 text-[#005a94]'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Comments ({figCommentCount})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleTriggerFlagForCorrection(
                                'figure',
                                'epicenter',
                                'Figure 1: Epicenter & Geographic Context Map'
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-xs border text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                              openFigCorrCount > 0
                                ? 'border-rose-300 bg-rose-50 text-rose-800'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300'
                            }`}
                          >
                            <Flag className="w-3 h-3" />
                            <span>
                              {openFigCorrCount > 0
                                ? `Correction Open (${openFigCorrCount})`
                                : 'Flag for Correction'}
                            </span>
                          </button>
                        </>
                      );
                    })()}

                    {!isReadOnlySnapshot && (
                      <button
                        type="button"
                        onClick={() => handleRefreshFigure()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>
                          {currentFigure ? 'Refresh Figure' : 'Generate Epicenter Figure'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Stale / Fingerprint Mismatch Alert */}
                {currentFigure && isFigureStale && (
                  <div className="bg-amber-50 border-b border-amber-300 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        {isReadOnlySnapshot
                          ? 'Active event or PLOT solution differs from this frozen historical figure snapshot (historical provenance preserved).'
                          : isPlotResultStale
                            ? 'Active PLOT solution is marked stale relative to station picks. Re-run Locate and refresh figure.'
                            : 'Active event parameters changed since this figure snapshot was generated.'}{' '}
                        <span className="font-mono text-[11px]">
                          (Snapshot {currentFigure.provenance.sourceEventFingerprint.slice(0, 8)} ≠ Active{' '}
                          {currentEventFingerprint.slice(0, 8)})
                        </span>
                      </span>
                    </div>
                    {!isReadOnlySnapshot && (
                      <button
                        type="button"
                        onClick={() => handleRefreshFigure()}
                        className="px-2.5 py-1 rounded-xs border border-amber-400 bg-white text-amber-950 text-[11px] font-semibold hover:bg-amber-100 whitespace-nowrap"
                      >
                        Refresh Now
                      </button>
                    )}
                  </div>
                )}

                {!currentFigure ? (
                  <div className="p-5 text-center space-y-2.5 bg-slate-50/40">
                    <p className="text-xs text-slate-600">
                      This Stage 1 draft does not include an Epicenter Map Figure yet. Generating the figure will preserve all edited narrative sections.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRefreshFigure()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Generate Epicenter Figure for Draft</span>
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 space-y-3">
                    {/* Figure Controls Bar */}
                    <fieldset
                      disabled={isReadOnlySnapshot}
                      className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xs p-2.5 text-xs disabled:opacity-80"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <div>
                            <label
                              htmlFor="primer-map-extent"
                              className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                            >
                              Map Extent
                            </label>
                            <select
                              id="primer-map-extent"
                              value={mapExtent}
                              onChange={(e) =>
                                handleChangeExtent(e.target.value as PrimerMapExtent)
                              }
                              className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                            >
                              <option value="focused">Focused (±1.6°)</option>
                              <option value="regional">Regional (±3.4°)</option>
                              <option value="national">Philippines Overview</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="primer-map-theme"
                              className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                            >
                              Print Style
                            </label>
                            <select
                              id="primer-map-theme"
                              value={mapTheme}
                              onChange={(e) =>
                                handleChangeTheme(e.target.value as PrimerMapTheme)
                              }
                              className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                            >
                              <option value="classic">PHIVOLCS Color</option>
                              <option value="print-bw">Print Grayscale</option>
                            </select>
                          </div>
                        </div>

                        {/* Geographic Context Distinction */}
                        <div className="border-t border-slate-200 pt-2 space-y-1 text-[11px] text-slate-700">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <Compass className="w-3.5 h-3.5 text-[#005a94]" />
                            <span>Verified Geographic Context</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Nearest Locality: </span>
                            <span className="font-medium">
                              {displayedPrimer.extracted.primaryLocationLabel ?? 'Pending location'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Tectonic Generator: </span>
                            <span className="font-medium">
                              {displayedPrimer.extracted.nearestFaultLabel ?? 'Unavailable / pending lookup'}
                            </span>
                          </div>
                          <div className="text-[10.5px] text-slate-500 italic">
                            {currentFigure.provenance.nonCausalDisclaimer}
                          </div>
                        </div>
                      </div>

                      {/* Optional & Manifest-Gated Layers */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
                          <Layers className="w-3.5 h-3.5 text-[#005a94]" />
                          <span>Map Overlays (Source-Gated)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mapLayers.nearestLocalities}
                              onChange={(e) =>
                                handleToggleLayer('nearestLocalities', e.target.checked)
                              }
                              className="accent-[#005a94]"
                            />
                            <span>Cities / Localities</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mapLayers.schematicFaults}
                              onChange={(e) =>
                                handleToggleLayer('schematicFaults', e.target.checked)
                              }
                              className="accent-[#005a94]"
                            />
                            <span>Schematic Faults</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mapLayers.stations}
                              onChange={(e) =>
                                handleToggleLayer('stations', e.target.checked)
                              }
                              className="accent-[#005a94]"
                            />
                            <span>Event Stations ({event.picks.length})</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mapLayers.mainOfficeVector}
                              onChange={(e) =>
                                handleToggleLayer('mainOfficeVector', e.target.checked)
                              }
                              className="accent-[#005a94]"
                            />
                            <span>{mainOffice?.code ?? 'Main Office'} Vector</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer col-span-2">
                            <input
                              type="checkbox"
                              checked={mapLayers.gisCandidateFaults}
                              onChange={(e) =>
                                handleToggleLayer('gisCandidateFaults', e.target.checked)
                              }
                              className="accent-[#005a94]"
                            />
                            <span>
                              GIS Active Faults (Candidate)
                              {gisFaultsLoading
                                ? ' — Loading...'
                                : gisActiveFaultsData
                                  ? ` (${gisActiveFaultsData.features.length} features ready)`
                                  : ' — Load GeoJSON'}
                            </span>
                          </label>
                          <label
                            className="flex items-center gap-1.5 cursor-pointer col-span-2 text-slate-600"
                            title="Withheld automatically per GIS manifest: EPSG:4253 (Luzon 1911) to WGS84 datum transform unavailable"
                          >
                            <input
                              type="checkbox"
                              checked={mapLayers.trenchSystemsGis}
                              onChange={(e) =>
                                handleToggleLayer('trenchSystemsGis', e.target.checked)
                              }
                              className="accent-amber-700"
                            />
                            <span>
                              GIS Trench Systems (Check Manifest Status — Unavailable / EPSG:4253 Review Only)
                            </span>
                          </label>
                        </div>
                      </div>
                    </fieldset>

                    {/* Rendered SVG Map OR Informative Unavailable State */}
                    {currentFigure.status === 'unavailable' ? (
                      <div className="border border-rose-200 bg-rose-50 rounded-xs p-5 text-center space-y-2">
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-900">
                          <AlertTriangle className="w-4 h-4 text-rose-700" />
                          <span>Epicenter Map Unavailable</span>
                        </div>
                        <p className="text-xs text-rose-800 max-w-xl mx-auto">
                          {currentFigure.unavailableReason}
                        </p>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xs bg-white p-2 flex justify-center">
                        <img
                          src={figureImgSrc}
                          alt={currentFigure.caption}
                          className="w-full max-w-[760px] h-auto block"
                        />
                      </div>
                    )}

                    {/* Editable Figure Caption */}
                    <div>
                      <label
                        htmlFor="primer-figure-caption"
                        className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                      >
                        Figure 1 Caption (Included in HTML / PDF Export)
                      </label>
                      <input
                        id="primer-figure-caption"
                        type="text"
                        value={currentFigure.caption}
                        disabled={isReadOnlySnapshot}
                        onChange={(e) => handleUpdateFigureCaption(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94] disabled:bg-slate-50 disabled:text-slate-600"
                      />
                    </div>

                    {/* Figure Provenance & Audit Metadata */}
                    <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5 text-[11px] text-slate-600 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-[10.5px] text-slate-700">
                        <span>
                          <strong>Status:</strong> {currentFigure.provenance.sourceSolutionStatus}
                        </span>
                        <span>
                          <strong>Event Fingerprint:</strong> {currentFigure.provenance.sourceEventFingerprint}
                        </span>
                        <span>
                          <strong>Scale Bar:</strong>{' '}
                          {currentFigure.scaleBarKm ? `${currentFigure.scaleBarKm} km` : 'N/A'}
                        </span>
                        <span>
                          <strong>Generated:</strong>{' '}
                          {new Date(currentFigure.provenance.generatedAt).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <strong className="text-slate-700">Solution Note:</strong>{' '}
                        {currentFigure.provenance.sourceSolutionNote}
                      </div>
                      <div>
                        <strong className="text-slate-700">Sources:</strong>{' '}
                        {currentFigure.provenance.basemapSource} ·{' '}
                        {currentFigure.provenance.dataSources.join(' · ')}
                      </div>
                      {currentFigure.provenance.unavailableLayers.length > 0 && (
                        <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded-xs px-2 py-1 mt-1">
                          <strong>Withheld / Unavailable Layers:</strong>{' '}
                          {currentFigure.provenance.unavailableLayers
                            .map((item) => `${item.layer} (${item.reason})`)
                            .join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {openCommentTargets['figure:epicenter'] && (
                  <InlineSectionCommentDrawer
                    primer={displayedPrimer}
                    targetKind="figure"
                    targetId="epicenter"
                    targetLabel="Figure 1: Epicenter & Geographic Context Map"
                    isReadOnlySnapshot={isReadOnlySnapshot}
                    viewingRevisionNumber={viewingRevision?.revisionNumber ?? null}
                    viewingRevisionId={viewingRevision?.revisionId ?? null}
                    onAddComment={handleAddSectionComment}
                    onEditComment={handleEditSectionComment}
                    onDeleteComment={handleDeleteSectionComment}
                  />
                )}
              </section>

              {/* STAGE 3: AFTERSHOCK SEQUENCE & HISTORICAL SEISMICITY */}
              <PrimerStage3Panel
                event={event}
                primer={displayedPrimer}
                primaryLocationLabel={primaryLocationLabel}
                isPlotResultStale={isPlotResultStale}
                nearestCitiesPins={nearestCitiesPins}
                mapTheme={mapTheme}
                readOnly={isReadOnlySnapshot}
                onUpdatePrimer={(next, msg) => {
                  if (isReadOnlySnapshot) return;
                  setActivePrimer(next);
                  setHasUnsavedDraftEdits(true);
                  if (msg) onNotice?.(msg);
                }}
                onStage3FingerprintChange={setCurrentStage3Fingerprint}
                onNotice={onNotice}
              />

              {/* RESEARCH ASSISTANT R1/R2/R3: SOURCE DISCOVERY, FINDINGS EXTRACTION & REVIEWED TRANSFER */}
              <PrimerResearchAssistantPanel
                event={event}
                activePrimer={displayedPrimer}
                primaryLocationLabel={primaryLocationLabel}
                faultGeneratorLabel={faultGeneratorLabel}
                isPlotResultStale={isPlotResultStale}
                readOnly={isReadOnlySnapshot}
                onApplyTransferToPrimer={(updated, msg) => {
                  if (isReadOnlySnapshot) return;
                  setActivePrimer(updated);
                  setHasUnsavedDraftEdits(true);
                  if (msg) onNotice?.(msg);
                }}
                onJumpToPrimerSection={(sectionId) => {
                  setViewMode('edit');
                  window.setTimeout(() => {
                    document
                      .getElementById(`primer-section-${sectionId}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 60);
                }}
                onNotice={onNotice}
              />

              {/* STAGE 4: SCIENTIFIC NARRATIVES, HAZARDS, TSUNAMI & PROVENANCE */}
              <PrimerStage4Panel
                event={event}
                primer={displayedPrimer}
                primaryLocationLabel={primaryLocationLabel}
                faultGeneratorLabel={faultGeneratorLabel}
                isPlotResultStale={isPlotResultStale}
                readOnly={isReadOnlySnapshot}
                onUpdatePrimer={(next, msg) => {
                  if (isReadOnlySnapshot) return;
                  setActivePrimer(next);
                  setHasUnsavedDraftEdits(true);
                  if (msg) onNotice?.(msg);
                }}
                onStage4FingerprintChange={setCurrentStage4Fingerprint}
                onNotice={onNotice}
              />

              {/* 7 Editable / Read-Only Sections */}
              <div className="space-y-3">
                {displayedPrimer.sections.map((section) => {
                  const statusMeta = REVIEW_STATUS_META[section.reviewStatus];
                  const lineCount = Math.max(4, Math.min(14, section.content.split('\n').length + 1));

                  return (
                    <section
                      key={section.id}
                      id={`primer-section-${section.id}`}
                      className="border border-slate-200 rounded-xs bg-white overflow-hidden"
                    >
                      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h4 className="text-xs font-bold text-slate-900">
                            {section.title}
                          </h4>
                          {section.contentState && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 border border-slate-300 bg-white text-slate-700 rounded-xs">
                              {section.contentState}
                            </span>
                          )}
                          {section.isEdited && (
                            <span className="text-[10.5px] font-mono text-[#005a94] font-semibold">
                              [Edited]
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {(() => {
                            const secCommentCount = getSectionCommentsForTarget(
                              displayedPrimer,
                              'section',
                              section.id
                            ).length;
                            const openSecCorrCount = correctionRequests.filter(
                              (r) =>
                                r.eventId === event.id &&
                                r.targetKind === 'section' &&
                                r.targetId === section.id &&
                                r.status !== 'resolved'
                            ).length;
                            const drawerOpen = Boolean(
                              openCommentTargets[`section:${section.id}`]
                            );
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleSectionCommentDrawer('section', section.id)
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                                    drawerOpen || secCommentCount > 0
                                      ? 'border-[#005a94] bg-sky-50 text-[#005a94]'
                                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>Comments ({secCommentCount})</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleTriggerFlagForCorrection(
                                      'section',
                                      section.id,
                                      section.title
                                    )
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                                    openSecCorrCount > 0
                                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                                      : 'border-slate-300 bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300'
                                  }`}
                                >
                                  <Flag className="w-3 h-3" />
                                  <span>
                                    {openSecCorrCount > 0
                                      ? `Correction Open (${openSecCorrCount})`
                                      : 'Flag for Correction'}
                                  </span>
                                </button>
                              </>
                            );
                          })()}

                          {section.isEdited && !isReadOnlySnapshot && (
                            <button
                              type="button"
                              onClick={() => handleResetSection(section.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                              title="Reset section back to deterministic template text"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset Template</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isReadOnlySnapshot}
                            onClick={() => handleCycleSectionReviewStatus(section.id)}
                            title={
                              isReadOnlySnapshot
                                ? 'Historical snapshot review status is read-only'
                                : 'Click to toggle section review state during drafting'
                            }
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border text-[11px] font-semibold whitespace-nowrap disabled:cursor-default ${statusMeta.className}`}
                          >
                            {statusMeta.iconKind === 'ok' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : statusMeta.iconKind === 'warn' ? (
                              <AlertTriangle className="w-3 h-3" />
                            ) : (
                              <Info className="w-3 h-3" />
                            )}
                            <span>{statusMeta.label}</span>
                          </button>
                        </div>
                      </div>

                      {section.reviewFlags.length > 0 && (
                        <div className="bg-slate-50/70 border-b border-slate-200/80 px-3.5 py-1.5 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">Review Notes: </span>
                          {section.reviewFlags.join(' · ')}
                        </div>
                      )}

                      {section.missingIndicators && section.missingIndicators.length > 0 && (
                        <div className="bg-amber-50/70 border-b border-amber-200 px-3.5 py-1.5 text-[11px] text-amber-950">
                          <span className="font-semibold">Missing / Pending Info: </span>
                          {section.missingIndicators.join(' · ')}
                        </div>
                      )}

                      {section.isEdited &&
                        !isReadOnlySnapshot &&
                        Boolean(section.autoGeneratedBaseline) &&
                        section.autoGeneratedBaseline !== section.content && (
                          <div className="bg-sky-50/80 border-b border-sky-200 px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-sky-950">
                            <span>
                              Updated Stage 4 / R3 baseline is available while preserving your manual edits.
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSyncSectionToStage4Baseline(section.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border border-[#005a94] bg-white text-[11px] font-semibold text-[#005a94] hover:bg-sky-100 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Sync to Section</span>
                            </button>
                          </div>
                        )}

                      <div className="p-3">
                        <textarea
                          aria-label={section.title}
                          rows={lineCount}
                          value={section.content}
                          readOnly={isReadOnlySnapshot}
                          disabled={isReadOnlySnapshot}
                          onChange={(e) =>
                            handleUpdateSectionContent(section.id, e.target.value)
                          }
                          className="w-full px-3 py-2 text-xs leading-relaxed text-slate-900 bg-white border border-slate-200 rounded-xs focus:outline-none focus:border-[#005a94] font-sans resize-y disabled:bg-slate-50 disabled:text-slate-700"
                        />
                      </div>

                      {openCommentTargets[`section:${section.id}`] && (
                        <InlineSectionCommentDrawer
                          primer={displayedPrimer}
                          targetKind="section"
                          targetId={section.id}
                          targetLabel={section.title}
                          isReadOnlySnapshot={isReadOnlySnapshot}
                          viewingRevisionNumber={viewingRevision?.revisionNumber ?? null}
                          viewingRevisionId={viewingRevision?.revisionId ?? null}
                          onAddComment={handleAddSectionComment}
                          onEditComment={handleEditSectionComment}
                          onDeleteComment={handleDeleteSectionComment}
                        />
                      )}
                    </section>
                  );
                })}
              </div>

              {/* Consolidated Section Comments & Figure Notes Panel */}
              <SectionCommentsPanel
                primer={displayedPrimer}
                isReadOnlySnapshot={isReadOnlySnapshot}
                viewingRevisionNumber={viewingRevision?.revisionNumber ?? null}
                viewingRevisionId={viewingRevision?.revisionId ?? null}
                onAddComment={handleAddSectionComment}
                onEditComment={handleEditSectionComment}
                onDeleteComment={handleDeleteSectionComment}
              />

              {/* Reserved Extension Hooks Notice */}
              <div className="border border-slate-200 rounded-xs bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">
                  Scientific Safety &amp; Remaining Extension Slots:
                </span>{' '}
                Epicenter &amp; sequence figures reflect verified event records and explicitly imported/queried catalog entries without fabricated decay laws, forecasts, or shaking contours. Extension interfaces remain reserved for verified external ShakeMap products and multi-reviewer approval.
              </div>
            </div>
          )}

          {/* CORRECTION REQUESTS WORKFLOW PANEL (Always accessible in PRIMER tab) */}
          <div ref={correctionPanelRef}>
            <PrimerCorrectionRequestsPanel
              activeEventId={event.id}
              revisions={revisions}
              requests={correctionRequests}
              viewingRevision={viewingRevision}
              activeBaseRevision={activeBaseRevision}
              preselectedTarget={flagComposerTarget}
              onCreateCorrectionRequest={handleCreateCorrectionRequest}
              onStartDraftCorrection={handleStartDraftCorrection}
              onResolveCorrection={handleResolveCorrectionRequest}
              onReopenCorrection={handleReopenCorrectionRequest}
              onViewRevision={(rev) => {
                setSelectedReviewRevisionId(rev.revisionId);
                handleViewRevision(rev);
              }}
              onCompareRevisions={handleCompareTwoRevisions}
            />
          </div>

          {/* STAGE 6A: REVISION HISTORY & LOCAL ARCHIVE PANEL (Inside PRIMER Tab) */}
          <PrimerRevisionHistoryPanel
            activeEventId={event.id}
            workingDraft={activePrimer}
            viewingRevision={viewingRevision}
            revisions={revisions}
            diagnostics={archiveDiagnostics}
            liveEventFingerprint={currentEventFingerprint}
            liveStage3Fingerprint={currentStage3Fingerprint}
            liveStage4Fingerprint={currentStage4Fingerprint}
            isExportingPdf={isExportingPdf}
            onSaveNewRevision={handleSaveNewRevision}
            onViewRevision={(rev) => {
              setSelectedReviewRevisionId(rev.revisionId);
              handleViewRevision(rev);
            }}
            onReturnToWorkingDraft={handleReturnToWorkingDraft}
            onCompareWithWorkingDraft={handleCompareWithWorkingDraft}
            onCompareTwoRevisions={handleCompareTwoRevisions}
            onRestoreAsWorkingDraft={handleRestoreAsNewWorkingDraft}
            onExportRevisionHtml={(rev, mode) =>
              handleExportHtml(mode, rev.snapshot, toPrimerExportRevisionInfo(rev))
            }
            onExportRevisionPdf={(rev, mode) =>
              handleExportPdf(mode, rev.snapshot, toPrimerExportRevisionInfo(rev))
            }
            onExportRevisionJson={handleExportRevisionJson}
            onExportAllArchiveJson={handleExportAllArchiveJson}
            onImportArchiveJson={handleImportArchiveJson}
          />

          {/* STAGE 6B: SCIENTIFIC REVIEW, CORRECTION TRACKING & RELEASE PREPARATION */}
          <PrimerScientificReviewPanel
            activeEventId={event.id}
            workingDraft={activePrimer}
            revisions={revisions}
            reviews={reviews}
            selectedRevisionId={selectedReviewRevisionId}
            onSelectRevisionId={setSelectedReviewRevisionId}
            reviewDiagnostics={reviewDiagnostics}
            extendedReadiness={extendedReadinessSummary}
            liveSourceContext={liveReviewSourceContext}
            isExportingZip={isExportingReviewZip}
            onSaveReview={handleSaveReview}
            onSaveNewRevisionFromDraft={activePrimer ? handleSaveNewRevision : undefined}
            onViewRevision={(rev) => {
              setSelectedReviewRevisionId(rev.revisionId);
              handleViewRevision(rev);
            }}
            onRestoreForCorrection={handleRestoreAsNewWorkingDraft}
            onCompareRevisions={handleCompareTwoRevisions}
            onCompareWithWorkingDraft={handleCompareWithWorkingDraft}
            onExportReviewPackageZip={handleExportReviewPackageZip}
            onImportReviewPackageZip={handleImportReviewPackageZip}
            onExportReviewArchiveJson={handleExportReviewArchiveJson}
            onImportReviewArchiveJson={handleImportReviewArchiveJson}
          />
        </div>
      </div>
    </div>
  );
};
