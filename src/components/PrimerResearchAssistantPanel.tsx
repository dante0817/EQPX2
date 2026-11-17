import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  Ban,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  FlaskConical,
  GitCompare,
  Globe,
  History,
  Info,
  Link2,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { type EQPEvent, isEventUnlocated } from '../data/eqpData';
import type { PrimerDocument } from '../utils/earthquakePrimer';
import type { PrimerSectionKey } from '../utils/primerScientificNarratives';
import {
  buildEventSearchContext,
  buildResearchDiscoveryQuery,
  buildTextPreview,
  buildUsgsSummaryPlainText,
  computeSha256Hex,
  evaluateResearchEventMatch,
  EVENT_MATCH_STATE_LABELS,
  extractSafePlainTextFromHtml,
  inferOrganizationFromUrl,
  RESEARCH_CATEGORY_LABELS,
  RESEARCH_SOURCE_STATUS_LABELS,
  type GeminiSearchCapabilityReport,
  type PrimerResearchSourceRecord,
  type ResearchDiscoveryCandidate,
  type ResearchEventMatchState,
  type ResearchRelevanceDecision,
  type ResearchSourceCategory,
  type ResearchSourceStatus,
  type UsgsEventDetailCandidate,
  type UsgsEventDetailParseResult,
} from '../utils/primerResearchAssistant';
import {
  createManualCandidateFinding,
  detectFindingConflictsAndDuplicates,
  EVIDENCE_VALIDATION_LABELS,
  extractDeterministicFindingsFromSource,
  isSourceRestrictedOrLocal,
  R2_CATEGORY_LABELS,
  R2_CONFLICT_KIND_LABELS,
  R2_FINDING_CATEGORIES,
  type CandidateScientificFinding,
  type FindingEpistemicBasis,
  type FindingRelevanceStatus,
  type R2FindingCategory,
} from '../utils/primerResearchExtraction';
import {
  getPrimerResearchFindingsStore,
  type ResearchFindingsStoreDiagnostics,
} from '../utils/primerResearchFindingsStore';
import {
  getPrimerResearchSourceStore,
  type ResearchSourceStoreDiagnostics,
} from '../utils/primerResearchStore';
import {
  applyReviewedScientificFindingToPrimer,
  buildFindingTransferPreview,
  documentEventMatchResolution,
  evaluateFindingTransferEligibility,
  NO_SUPPORTED_DIRECT_TRANSFER_LABEL,
  R3_TRANSFER_APPROVAL_DISCLAIMER,
  type R3FindingTransferPreview,
  type R3StatusBucket,
  type R3TransferEligibilityResult,
} from '../utils/primerResearchTransfer';
import {
  getPrimerResearchTransferStore,
  R3_LOCAL_AUDIT_DISCLAIMER,
  type R3CollisionResolutionMode,
  type R3TransferAuditLogEntry,
  type ResearchTransferStoreDiagnostics,
} from '../utils/primerResearchTransferStore';
import {
  ALLOWLISTED_OFFICIAL_DOMAINS,
  MAX_RESEARCH_IMPORT_BYTES,
  validateSafePublicHttpsUrl,
} from '../utils/researchUrlSecurity';

interface PrimerResearchAssistantPanelProps {
  event: EQPEvent;
  activePrimer?: PrimerDocument | null;
  primaryLocationLabel?: string | null;
  faultGeneratorLabel?: string | null;
  isPlotResultStale?: boolean;
  readOnly?: boolean;
  onApplyTransferToPrimer?: (updatedPrimer: PrimerDocument, message?: string) => void;
  onJumpToPrimerSection?: (sectionId: PrimerSectionKey) => void;
  onNotice?: (msg: string) => void;
}

type ResearchTabId = 'search' | 'usgs' | 'import' | 'library' | 'findings';

interface GeminiExtractCapabilityReport {
  configured: boolean;
  modelUsed: string;
  structuredJsonSupported: boolean;
  available: boolean;
  reasonUnavailable: string | null;
  mayIncurCharges: boolean;
  billingDisclosure: string;
  checkedAtUtc: string;
}

const STATUS_BADGE_STYLES: Record<ResearchSourceStatus, string> = {
  discovered: 'bg-sky-50 text-sky-900 border-sky-200',
  retrieved: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  imported: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  'retrieval-unavailable': 'bg-rose-50 text-rose-900 border-rose-200',
  'event-match-uncertain': 'bg-amber-50 text-amber-950 border-amber-300',
  archived: 'bg-slate-100 text-slate-700 border-slate-300',
};

const MATCH_BADGE_STYLES: Record<ResearchEventMatchState, string> = {
  'confirmed-id-match': 'bg-emerald-50 text-emerald-900 border-emerald-200',
  'probable-match': 'bg-amber-50 text-amber-950 border-amber-300',
  'ambiguous-match': 'bg-amber-50 text-amber-900 border-amber-300',
  'nonmatching-event': 'bg-rose-50 text-rose-900 border-rose-200',
  'insufficient-evidence': 'bg-slate-100 text-slate-700 border-slate-300',
};

export const PrimerResearchAssistantPanel: React.FC<PrimerResearchAssistantPanelProps> = ({
  event,
  activePrimer = null,
  primaryLocationLabel = null,
  faultGeneratorLabel = null,
  isPlotResultStale = false,
  readOnly = false,
  onApplyTransferToPrimer,
  onJumpToPrimerSection,
  onNotice,
}) => {
  const store = useMemo(() => getPrimerResearchSourceStore(), []);
  const findingsStore = useMemo(() => getPrimerResearchFindingsStore(), []);
  const transferStore = useMemo(() => getPrimerResearchTransferStore(), []);

  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ResearchTabId>('search');

  // Library state (IndexedDB)
  const [sources, setSources] = useState<PrimerResearchSourceRecord[]>([]);
  const [storeDiagnostics, setStoreDiagnostics] =
    useState<ResearchSourceStoreDiagnostics | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [inspectingSourceId, setInspectingSourceId] = useState<string | null>(null);

  // R2 Scientific Findings state (separate IndexedDB store)
  const [findings, setFindings] = useState<CandidateScientificFinding[]>([]);
  const [findingsDiagnostics, setFindingsDiagnostics] =
    useState<ResearchFindingsStoreDiagnostics | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [extractCapability, setExtractCapability] =
    useState<GeminiExtractCapabilityReport | null>(null);
  const [extractCapabilityLoading, setExtractCapabilityLoading] = useState(false);
  const [aiConsentOpen, setAiConsentOpen] = useState(false);
  const [aiConfirmSendChecked, setAiConfirmSendChecked] = useState(false);
  const [aiAuthorizeRestrictedChecked, setAiAuthorizeRestrictedChecked] = useState(false);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [detExtracting, setDetExtracting] = useState(false);
  const [extractionFeedback, setExtractionFeedback] = useState<{
    kind: 'ok' | 'warn' | 'err';
    message: string;
  } | null>(null);
  const [showSupersededFindings, setShowSupersededFindings] = useState(false);
  const [showHiddenFindings, setShowHiddenFindings] = useState(true);
  const [comparePanelOpen, setComparePanelOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<R2FindingCategory | 'all'>('all');
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [manualSourceId, setManualSourceId] = useState('');
  const [manualCategory, setManualCategory] =
    useState<R2FindingCategory>('official-bulletins');
  const [manualBasis, setManualBasis] = useState<FindingEpistemicBasis>('reported');
  const [manualTitle, setManualTitle] = useState('');
  const [manualStatement, setManualStatement] = useState('');
  const [manualPassage, setManualPassage] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [manualUnits, setManualUnits] = useState('');
  const [manualObsTime, setManualObsTime] = useState('');
  const [manualObsTz, setManualObsTz] = useState('');
  const aiAbortRef = useRef<AbortController | null>(null);

  // R3 Transfer, Event-Match Resolution & Audit History state
  const [auditRecords, setAuditRecords] = useState<R3TransferAuditLogEntry[]>([]);
  const [transferDiagnostics, setTransferDiagnostics] =
    useState<ResearchTransferStoreDiagnostics | null>(null);
  const [statusBucketFilter, setStatusBucketFilter] = useState<
    R3StatusBucket | 'all' | 'history'
  >('all');
  const [reviewingFindingId, setReviewingFindingId] = useState<string | null>(null);
  const [reviewAppliedState, setReviewAppliedState] = useState<
    'preliminary-review' | 'verified-fact'
  >('preliminary-review');
  const [reviewConfirmVerifiedFact, setReviewConfirmVerifiedFact] = useState(false);
  const [reviewResolutionMode, setReviewResolutionMode] =
    useState<R3CollisionResolutionMode>('add-separate');
  const [reviewConfirmOverwrite, setReviewConfirmOverwrite] = useState(false);
  const [reviewOverwriteReason, setReviewOverwriteReason] = useState('');
  const [reviewConfirmTransfer, setReviewConfirmTransfer] = useState(false);
  const [reviewOperatorLabel, setReviewOperatorLabel] = useState(
    'Local Operator (Unverified)'
  );
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{
    kind: 'ok' | 'warn' | 'err';
    message: string;
  } | null>(null);
  const [resolvingSourceId, setResolvingSourceId] = useState<string | null>(null);
  const [resolveRationale, setResolveRationale] = useState('');
  const [resolveEvidence, setResolveEvidence] = useState('');
  const [resolveOperatorLabel, setResolveOperatorLabel] = useState(
    'Local Operator (Unverified)'
  );
  const [rejectingFindingId, setRejectingFindingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Section 1: Official Source Discovery & Gemini Capability Check
  const [capabilityReport, setCapabilityReport] =
    useState<GeminiSearchCapabilityReport | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [searchCategory, setSearchCategory] =
    useState<ResearchSourceCategory>('official-update');
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSummaryNote, setSearchSummaryNote] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [discoveryCandidates, setDiscoveryCandidates] = useState<ResearchDiscoveryCandidate[]>([]);

  // Section 2: USGS Event Products
  const [usgsSearchLoading, setUsgsSearchLoading] = useState(false);
  const [usgsSearchError, setUsgsSearchError] = useState<string | null>(null);
  const [usgsCandidates, setUsgsCandidates] = useState<UsgsEventDetailCandidate[]>([]);
  const [manualUsgsId, setManualUsgsId] = useState('');
  const [usgsDetailLoading, setUsgsDetailLoading] = useState(false);
  const [selectedUsgsDetail, setSelectedUsgsDetail] =
    useState<UsgsEventDetailParseResult | null>(null);
  const [selectedUsgsRawSha, setSelectedUsgsRawSha] = useState<string | null>(null);
  const [selectedUsgsBytes, setSelectedUsgsBytes] = useState<number | null>(null);

  // Section 3: Import Documents (Local File & Safe URL)
  const [importTitle, setImportTitle] = useState('');
  const [importOrg, setImportOrg] = useState('');
  const [importCategory, setImportCategory] =
    useState<ResearchSourceCategory>('official-update');
  const [importPublishedUtc, setImportPublishedUtc] = useState('');
  const [importExternalIds, setImportExternalIds] = useState('');
  const [importHintOriginUtc, setImportHintOriginUtc] = useState('');
  const [importHintLat, setImportHintLat] = useState('');
  const [importHintLon, setImportHintLon] = useState('');
  const [importHintMag, setImportHintMag] = useState('');
  const [importHintMagType, setImportHintMagType] = useState('');
  const [importUrlInput, setImportUrlInput] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{
    kind: 'ok' | 'warn' | 'err';
    message: string;
  } | null>(null);

  const searchContext = useMemo(
    () => buildEventSearchContext(event, primaryLocationLabel),
    [event, primaryLocationLabel]
  );

  // Reset transient query/results cleanly when active EQPEvent changes (zero auto-search!)
  useEffect(() => {
    setCustomSearchQuery(buildResearchDiscoveryQuery(searchContext, searchCategory));
  }, [searchContext.eventId, searchCategory]);

  useEffect(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setDiscoveryCandidates([]);
    setSearchSummaryNote('');
    setSearchError(null);
    setUsgsCandidates([]);
    setSelectedUsgsDetail(null);
    setUsgsSearchError(null);
    setImportFeedback(null);
    setInspectingSourceId(null);
    setSelectedSourceIds([]);
    setAiConsentOpen(false);
    setAiConfirmSendChecked(false);
    setAiAuthorizeRestrictedChecked(false);
    setAiExtracting(false);
    setExtractionFeedback(null);
    setManualFormOpen(false);
    setComparePanelOpen(false);
    setStatusBucketFilter('all');
    setReviewingFindingId(null);
    setReviewAppliedState('preliminary-review');
    setReviewConfirmVerifiedFact(false);
    setReviewResolutionMode('add-separate');
    setReviewConfirmOverwrite(false);
    setReviewOverwriteReason('');
    setReviewConfirmTransfer(false);
    setTransferFeedback(null);
    setResolvingSourceId(null);
    setResolveRationale('');
    setResolveEvidence('');
    setRejectingFindingId(null);
    setRejectReason('');
  }, [event.id]);

  const reloadSources = useCallback(async () => {
    const [rows, diag] = await Promise.all([
      store.listSources({ linkedEqpEventId: event.id, includeArchived: true }),
      store.getDiagnostics(),
    ]);
    setSources(rows);
    setStoreDiagnostics(diag);
  }, [store, event.id]);

  const reloadFindings = useCallback(async () => {
    const [rows, diag] = await Promise.all([
      findingsStore.listFindings({
        linkedEqpEventId: event.id,
        includeSuperseded: true,
        includeIrrelevant: true,
        includeNonMatching: true,
      }),
      findingsStore.getDiagnostics(),
    ]);
    setFindings(rows);
    setFindingsDiagnostics(diag);
  }, [findingsStore, event.id]);

  const reloadTransferAudit = useCallback(async () => {
    const [rows, diag] = await Promise.all([
      transferStore.listRecords({ linkedEqpEventId: event.id }),
      transferStore.getDiagnostics(),
    ]);
    setAuditRecords(rows);
    setTransferDiagnostics(diag);
  }, [transferStore, event.id]);

  useEffect(() => {
    void reloadSources();
    void reloadFindings();
    void reloadTransferAudit();
  }, [reloadSources, reloadFindings, reloadTransferAudit]);

  const checkGeminiCapability = useCallback(async (runLiveProbe: boolean) => {
    setCapabilityLoading(true);
    try {
      const resp = await fetch(
        runLiveProbe
          ? '/api/primer/research/gemini-capability/probe'
          : '/api/primer/research/gemini-capability',
        { method: runLiveProbe ? 'POST' : 'GET' }
      );
      const data = (await resp.json()) as {
        ok?: boolean;
        report?: GeminiSearchCapabilityReport;
        error?: string;
      };
      if (data.report) {
        setCapabilityReport(data.report);
      } else if (data.error) {
        setSearchError(data.error);
      }
    } catch {
      setCapabilityReport({
        configured: false,
        modelUsed: 'gemini-4-hydrogen',
        sdkSupportsGoogleSearchTool: true,
        liveVerified: false,
        searchGroundingWorked: false,
        usableMetadataReturned: false,
        groundingChunksCount: 0,
        webSearchQueriesCount: 0,
        authOrQuotaRestriction:
          'Local server capability endpoint unreachable (offline mode). Local import and library features remain functional.',
        mayIncurCharges: false,
        billingDisclosure: 'Offline mode.',
        checkedAtUtc: new Date().toISOString(),
      });
    } finally {
      setCapabilityLoading(false);
    }
  }, []);

  const checkExtractCapability = useCallback(async () => {
    setExtractCapabilityLoading(true);
    try {
      const resp = await fetch('/api/primer/research/extract-capability');
      const data = (await resp.json()) as {
        ok?: boolean;
        report?: GeminiExtractCapabilityReport;
      };
      if (data.report) {
        setExtractCapability(data.report);
      }
    } catch {
      setExtractCapability({
        configured: false,
        modelUsed: 'gemini-4-hydrogen',
        structuredJsonSupported: true,
        available: false,
        reasonUnavailable:
          'AI Extraction Unavailable: Server endpoint unreachable (offline). Deterministic extraction and manual candidate findings remain functional.',
        mayIncurCharges: false,
        billingDisclosure: 'Offline mode.',
        checkedAtUtc: new Date().toISOString(),
      });
    } finally {
      setExtractCapabilityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isExpanded && !capabilityReport) {
      void checkGeminiCapability(false);
    }
    if (isExpanded && !extractCapability) {
      void checkExtractCapability();
    }
  }, [isExpanded, capabilityReport, extractCapability, checkGeminiCapability, checkExtractCapability]);

  // Helper to evaluate match for imported/fetched metadata
  const evaluateImportCandidateMatch = useCallback(
    (extra?: {
      externalEventIds?: string[];
      originTimeUtc?: string | null;
      lat?: number | null;
      lon?: number | null;
      depthKm?: number | null;
      magnitude?: number | null;
      magnitudeType?: string | null;
    }) => {
      const parsedIds = [
        ...importExternalIds
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        ...(extra?.externalEventIds ?? []),
      ];
      const hintLatNum = Number(importHintLat);
      const hintLonNum = Number(importHintLon);
      const hintMagNum = Number(importHintMag);

      return evaluateResearchEventMatch(
        {
          externalEventIds: parsedIds,
          originTimeUtc: extra?.originTimeUtc ?? (importHintOriginUtc.trim() || null),
          lat:
            extra?.lat ??
            (importHintLat.trim() && Number.isFinite(hintLatNum) ? hintLatNum : null),
          lon:
            extra?.lon ??
            (importHintLon.trim() && Number.isFinite(hintLonNum) ? hintLonNum : null),
          depthKm: extra?.depthKm ?? null,
          magnitude:
            extra?.magnitude ??
            (importHintMag.trim() && Number.isFinite(hintMagNum) ? hintMagNum : null),
          magnitudeType: extra?.magnitudeType ?? (importHintMagType.trim() || null),
        },
        event
      );
    },
    [
      event,
      importExternalIds,
      importHintOriginUtc,
      importHintLat,
      importHintLon,
      importHintMag,
      importHintMagType,
    ]
  );

  // =========================================================================
  // 1. Official Source Search Handlers
  // =========================================================================

  const handleRunOfficialSearch = async () => {
    if (searchLoading) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchSummaryNote('');
    try {
      const resp = await fetch('/api/primer/research/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmUserInitiated: true,
          eventContext: searchContext,
          category: searchCategory,
          customQuery: customSearchQuery.trim(),
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        unavailable?: boolean;
        summaryNote?: string;
        candidates?: ResearchDiscoveryCandidate[];
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setSearchError(
          data.error ||
            'Official source search is unavailable right now. Use Import Documents or USGS Event Products.'
        );
        setDiscoveryCandidates([]);
        return;
      }
      setSearchSummaryNote(data.summaryNote ?? '');
      setDiscoveryCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      onNotice?.(
        `Discovered ${data.candidates?.length ?? 0} source candidate(s) for ${event.id} (unverified until retrieved & checked).`
      );
    } catch {
      setSearchError(
        'Unable to reach Google Search grounding endpoint (offline or server unavailable). Offline imports remain available.'
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePreserveDiscoveryCandidate = async (cand: ResearchDiscoveryCandidate) => {
    if (readOnly) return;
    const match = evaluateResearchEventMatch(
      {
        externalEventIds: [],
        placeDescription: cand.title,
        sourceName: cand.organization,
      },
      event
    );
    const urlCheck = validateSafePublicHttpsUrl(cand.url, { requireAllowlist: false });
    const safeUrl = urlCheck.ok ? urlCheck.normalizedUrl : null;
    const nowUtc = new Date().toISOString();

    const resolution = await store.importOrAddSource({
      schemaVersion: '1.0',
      sourceId: `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      linkedEqpEventId: event.id,
      documentTitle: cand.title,
      organization: cand.organization,
      sourceLocation: safeUrl || cand.url,
      sourceUrl: safeUrl,
      localImportId: null,
      sourceCategory: cand.category,
      publishedAtUtc: cand.publishedHint,
      retrievedAtUtc: nowUtc,
      contentType: 'text/uri-list',
      sizeBytes: null,
      contentSha256: null,
      textAvailability: 'metadata-only',
      textUnavailableReason:
        'Discovered link reference only — retrieve via Safe URL Fetch or upload local PDF/HTML to extract text.',
      extractedText: '',
      extractedTextPreview: cand.snippet,
      pageCount: null,
      eventMatchState: match.state,
      eventMatchDetails: match,
      externalEventIds: [],
      retrievalStatus: 'discovered',
      originProvenance: {
        channel: 'gemini-google-search',
        adapterId: 'gemini-search-grounding',
        queryOrRequestSummary: cand.queryUsed,
        modelUsed: cand.modelUsed,
        groundingUsed: true,
        retrievedViaServer: true,
        accessConditionNote: cand.isAllowlistedDomain
          ? null
          : 'Non-allowlisted external domain; retrieve manually in browser and use Import Documents.',
      },
      relevance: 'unreviewed',
      archived: false,
      notes: '',
    });
    await reloadSources();
    onNotice?.(resolution.message);
  };

  // =========================================================================
  // 2. USGS Event Products Handlers
  // =========================================================================

  const handleSearchUsgsCandidates = async () => {
    if (usgsSearchLoading) return;
    if (isEventUnlocated(event)) {
      setUsgsSearchError(
        'Active EQP event is unlocated. Enter a known USGS Event ID manually below or locate the event first.'
      );
      return;
    }
    setUsgsSearchLoading(true);
    setUsgsSearchError(null);
    try {
      const originUtc =
        event.originDateGmt && event.originTimeGmt
          ? `${event.originDateGmt}T${event.originTimeGmt}Z`
          : undefined;
      const resp = await fetch('/api/primer/research/usgs-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: event.lat,
          lon: event.lon,
          originTimeUtc: originUtc,
          radiusKm: 120,
          windowHours: 24,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        candidates?: Array<{
          usgsEventId: string;
          title: string;
          place: string;
          originTimeUtc: string | null;
          lat: number | null;
          lon: number | null;
          depthKm: number | null;
          magnitude: number | null;
          magnitudeType: string | null;
          eventPageUrl: string | null;
          detailApiUrl: string | null;
          tsunamiFlagRaw: number | null;
        }>;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        setUsgsSearchError(data.error || 'USGS candidate search failed.');
        return;
      }
      const mapped: UsgsEventDetailCandidate[] = (data.candidates ?? []).map((c) => ({
        ...c,
        match: evaluateResearchEventMatch(
          {
            externalEventIds: [c.usgsEventId],
            originTimeUtc: c.originTimeUtc,
            lat: c.lat,
            lon: c.lon,
            depthKm: c.depthKm,
            magnitude: c.magnitude,
            magnitudeType: c.magnitudeType,
            placeDescription: c.place,
          },
          event
        ),
      }));
      setUsgsCandidates(mapped);
      if (mapped.length === 0) {
        setUsgsSearchError(
          'No USGS FDSN events matched within 120 km / ±24h of the active EQP event.'
        );
      }
    } catch {
      setUsgsSearchError('Unable to reach USGS FDSN search proxy (offline or network unavailable).');
    } finally {
      setUsgsSearchLoading(false);
    }
  };

  const handleFetchUsgsDetail = async (usgsEventId: string) => {
    const clean = usgsEventId.trim();
    if (!clean || usgsDetailLoading) return;
    setUsgsDetailLoading(true);
    setUsgsSearchError(null);
    try {
      const resp = await fetch('/api/primer/research/usgs-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usgsEventId: clean }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        detail?: UsgsEventDetailParseResult;
        rawSha256?: string;
        sizeBytes?: number;
        error?: string;
      };
      if (!resp.ok || !data.ok || !data.detail) {
        setUsgsSearchError(data.error || `Failed to retrieve USGS detail for "${clean}".`);
        return;
      }
      setSelectedUsgsDetail(data.detail);
      setSelectedUsgsRawSha(data.rawSha256 ?? null);
      setSelectedUsgsBytes(data.sizeBytes ?? null);
      onNotice?.(`Retrieved USGS ComCat product metadata for ${data.detail.usgsEventId}.`);
    } catch {
      setUsgsSearchError('Unable to reach USGS ComCat detail endpoint (offline or network unavailable).');
    } finally {
      setUsgsDetailLoading(false);
    }
  };

  const handleSaveUsgsDetailToLibrary = async () => {
    if (!selectedUsgsDetail || readOnly) return;
    const summaryText = buildUsgsSummaryPlainText(selectedUsgsDetail);
    const match = evaluateResearchEventMatch(
      {
        externalEventIds: [selectedUsgsDetail.usgsEventId],
        originTimeUtc: selectedUsgsDetail.originTimeUtc,
        lat: selectedUsgsDetail.lat,
        lon: selectedUsgsDetail.lon,
        depthKm: selectedUsgsDetail.depthKm,
        magnitude: selectedUsgsDetail.magnitude,
        magnitudeType: selectedUsgsDetail.magnitudeType,
        placeDescription: selectedUsgsDetail.place,
        sourceName: 'USGS ComCat',
      },
      event,
      undefined,
      { knownMatchingExternalIds: [selectedUsgsDetail.usgsEventId] }
    );
    // Notice: even if ID matched against itself, require probable/confirmed status carefully:
    const adjustedMatch =
      match.state === 'confirmed-id-match' &&
      !event.id.toLowerCase().includes(selectedUsgsDetail.usgsEventId.toLowerCase())
        ? { ...match, state: 'probable-match' as const }
        : match;

    const status: ResearchSourceStatus =
      adjustedMatch.state === 'ambiguous-match' || adjustedMatch.state === 'nonmatching-event'
        ? 'event-match-uncertain'
        : 'retrieved';

    const resolution = await store.importOrAddSource({
      schemaVersion: '1.0',
      sourceId: `src_usgs_${selectedUsgsDetail.usgsEventId}_${Date.now()}`,
      linkedEqpEventId: event.id,
      documentTitle: `${selectedUsgsDetail.title} (USGS ComCat Products)`,
      organization: 'USGS Earthquake Hazards Program',
      sourceLocation: selectedUsgsDetail.eventPageUrl || selectedUsgsDetail.detailQueryUrl,
      sourceUrl: selectedUsgsDetail.eventPageUrl || selectedUsgsDetail.detailQueryUrl,
      localImportId: null,
      sourceCategory: 'usgs-event-product',
      publishedAtUtc: selectedUsgsDetail.originTimeUtc,
      retrievedAtUtc: selectedUsgsDetail.retrievedAtUtc,
      contentType: 'application/geo+json',
      sizeBytes: selectedUsgsBytes,
      contentSha256: selectedUsgsRawSha,
      textAvailability: 'available',
      textUnavailableReason: null,
      extractedText: summaryText,
      extractedTextPreview: buildTextPreview(summaryText),
      pageCount: null,
      eventMatchState: adjustedMatch.state,
      eventMatchDetails: adjustedMatch,
      externalEventIds: [selectedUsgsDetail.usgsEventId],
      retrievalStatus: status,
      originProvenance: {
        channel: 'usgs-comcat-detail',
        adapterId: 'usgs-fdsn-event-detail-v1',
        queryOrRequestSummary: selectedUsgsDetail.detailQueryUrl,
        modelUsed: null,
        groundingUsed: false,
        retrievedViaServer: true,
        accessConditionNote: null,
      },
      usgsDetail: selectedUsgsDetail,
      relevance: 'unreviewed',
      archived: false,
      notes: '',
    });
    await reloadSources();
    setActiveTab('library');
    onNotice?.(resolution.message);
  };

  // =========================================================================
  // 3. Import Documents & Safe URL Retrieval Handlers
  // =========================================================================

  const handleFetchSafeUrl = async (targetUrl?: string) => {
    const raw = (targetUrl ?? importUrlInput).trim();
    if (!raw || importBusy || readOnly) return;
    setImportBusy(true);
    setImportFeedback(null);

    try {
      const resp = await fetch('/api/primer/research/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        retrievalStatus?: 'retrieved' | 'retrieval-unavailable';
        finalUrl?: string;
        authRequiredOrBlocked?: boolean;
        title?: string;
        organization?: string;
        contentType?: string;
        sizeBytes?: number | null;
        contentSha256?: string | null;
        textAvailability?: PrimerResearchSourceRecord['textAvailability'];
        textUnavailableReason?: string | null;
        extractedText?: string;
        pageCount?: number | null;
        error?: string;
      };

      const orgMeta = inferOrganizationFromUrl(data.finalUrl || raw);
      const match = evaluateImportCandidateMatch();
      const nowUtc = new Date().toISOString();

      if (!resp.ok || !data.ok) {
        // Preserve the URL reference cleanly as retrieval-unavailable so operator can still upload locally
        const urlCheck = validateSafePublicHttpsUrl(raw, { requireAllowlist: false });
        const resolution = await store.importOrAddSource({
          schemaVersion: '1.0',
          sourceId: `src_unavail_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          linkedEqpEventId: event.id,
          documentTitle: importTitle.trim() || data.title || raw,
          organization: importOrg.trim() || data.organization || orgMeta.organization,
          sourceLocation: raw,
          sourceUrl: urlCheck.ok ? urlCheck.normalizedUrl : null,
          localImportId: null,
          sourceCategory: importCategory,
          publishedAtUtc: importPublishedUtc.trim() || null,
          retrievedAtUtc: nowUtc,
          contentType: data.contentType || 'unknown',
          sizeBytes: null,
          contentSha256: null,
          textAvailability: 'unavailable',
          textUnavailableReason: data.error || 'Safe URL retrieval unavailable.',
          extractedText: '',
          extractedTextPreview: '',
          pageCount: null,
          eventMatchState: match.state,
          eventMatchDetails: match,
          externalEventIds: importExternalIds
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          retrievalStatus: 'retrieval-unavailable',
          originProvenance: {
            channel: 'safe-url-fetch',
            adapterId: 'server-ssrf-guarded-fetch',
            queryOrRequestSummary: raw,
            modelUsed: null,
            groundingUsed: false,
            retrievedViaServer: true,
            accessConditionNote: data.error ?? null,
          },
          relevance: 'unreviewed',
          archived: false,
          notes: '',
        });
        await reloadSources();
        setImportFeedback({
          kind: 'warn',
          message: `${data.error || 'URL retrieval blocked.'} Reference preserved in Source Library (${resolution.record.sourceId}) for manual file import.`,
        });
        return;
      }

      const status: ResearchSourceStatus =
        match.state === 'ambiguous-match' || match.state === 'nonmatching-event'
          ? 'event-match-uncertain'
          : 'retrieved';

      const resolution = await store.importOrAddSource({
        schemaVersion: '1.0',
        sourceId: `src_url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        linkedEqpEventId: event.id,
        documentTitle: importTitle.trim() || data.title || raw,
        organization: importOrg.trim() || data.organization || orgMeta.organization,
        sourceLocation: data.finalUrl || raw,
        sourceUrl: data.finalUrl || raw,
        localImportId: null,
        sourceCategory: importCategory,
        publishedAtUtc: importPublishedUtc.trim() || null,
        retrievedAtUtc: nowUtc,
        contentType: data.contentType || 'text/plain',
        sizeBytes: data.sizeBytes ?? null,
        contentSha256: data.contentSha256 ?? null,
        textAvailability: data.textAvailability ?? 'available',
        textUnavailableReason: data.textUnavailableReason ?? null,
        extractedText: data.extractedText ?? '',
        extractedTextPreview: buildTextPreview(data.extractedText ?? ''),
        pageCount: data.pageCount ?? null,
        eventMatchState: match.state,
        eventMatchDetails: match,
        externalEventIds: importExternalIds
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        retrievalStatus: status,
        originProvenance: {
          channel: 'safe-url-fetch',
          adapterId: 'server-ssrf-guarded-fetch',
          queryOrRequestSummary: raw,
          modelUsed: null,
          groundingUsed: false,
          retrievedViaServer: true,
          accessConditionNote: null,
        },
        relevance: 'unreviewed',
        archived: false,
        notes: '',
      });
      await reloadSources();
      setImportFeedback({
        kind: data.textAvailability === 'scanned-no-text' ? 'warn' : 'ok',
        message: `${resolution.message}${data.textAvailability === 'scanned-no-text' ? ' Searchable text is unavailable (scanned/image-only PDF).' : ''}`,
      });
      onNotice?.(resolution.message);
    } catch {
      setImportFeedback({
        kind: 'err',
        message:
          'Unable to reach server URL fetch endpoint. You can still upload a downloaded PDF, HTML, or TXT file directly below.',
      });
    } finally {
      setImportBusy(false);
    }
  };

  const handleLocalFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || readOnly) return;

    setImportBusy(true);
    setImportFeedback(null);

    try {
      const lowerName = file.name.toLowerCase();
      const isSupportedExt =
        lowerName.endsWith('.pdf') ||
        lowerName.endsWith('.html') ||
        lowerName.endsWith('.htm') ||
        lowerName.endsWith('.txt');

      if (!isSupportedExt) {
        setImportFeedback({
          kind: 'err',
          message: `Unsupported file "${file.name}". Only PDF (.pdf), HTML (.html/.htm), and Plain Text (.txt) are supported in R1.`,
        });
        return;
      }

      if (file.size === 0) {
        setImportFeedback({ kind: 'err', message: `File "${file.name}" is empty (0 bytes).` });
        return;
      }
      if (file.size > MAX_RESEARCH_IMPORT_BYTES) {
        setImportFeedback({
          kind: 'err',
          message: `File "${file.name}" exceeds the ${Math.round(MAX_RESEARCH_IMPORT_BYTES / (1024 * 1024))} MiB import limit.`,
        });
        return;
      }

      const arrayBuf = await file.arrayBuffer();
      const rawBytes = new Uint8Array(arrayBuf);
      let extractedTitle = importTitle.trim() || file.name;
      let contentType = file.type || (lowerName.endsWith('.pdf') ? 'application/pdf' : lowerName.endsWith('.html') || lowerName.endsWith('.htm') ? 'text/html' : 'text/plain');
      let sha256 = await computeSha256Hex(rawBytes);
      let textAvailability: PrimerResearchSourceRecord['textAvailability'] = 'unavailable';
      let textUnavailableReason: string | null = null;
      let extractedText = '';
      let pageCount: number | null = null;

      try {
        const resp = await fetch('/api/primer/research/import-file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-eqp-filename': file.name,
            'x-eqp-mime': contentType,
            'x-eqp-title': extractedTitle,
          },
          body: arrayBuf,
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          title?: string;
          contentType?: string;
          contentSha256?: string;
          textAvailability?: PrimerResearchSourceRecord['textAvailability'];
          textUnavailableReason?: string | null;
          extractedText?: string;
          pageCount?: number | null;
          error?: string;
        };
        if (!resp.ok || !data.ok) {
          setImportFeedback({
            kind: 'err',
            message: data.error || `Failed to import "${file.name}".`,
          });
          return;
        }
        extractedTitle = importTitle.trim() || data.title || file.name;
        contentType = data.contentType || contentType;
        sha256 = data.contentSha256 || sha256;
        textAvailability = data.textAvailability ?? 'available';
        textUnavailableReason = data.textUnavailableReason ?? null;
        extractedText = data.extractedText ?? '';
        pageCount = data.pageCount ?? null;
      } catch {
        // Pure offline browser fallback for HTML and TXT when server is unreachable
        if (lowerName.endsWith('.pdf')) {
          setImportFeedback({
            kind: 'err',
            message:
              'PDF text extraction requires the local EQP server endpoint (/api/primer/research/import-file). Plain .txt and .html files can still be imported offline.',
          });
          return;
        }
        const text = new TextDecoder('utf-8').decode(rawBytes);
        if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
          const parsedHtml = extractSafePlainTextFromHtml(text);
          extractedTitle = importTitle.trim() || parsedHtml.title || file.name;
          extractedText = parsedHtml.plainText;
          textAvailability = extractedText.trim() ? 'available' : 'unavailable';
        } else {
          extractedText = text.trim();
          textAvailability = extractedText ? 'available' : 'unavailable';
        }
      }

      const match = evaluateImportCandidateMatch();
      const status: ResearchSourceStatus =
        match.state === 'ambiguous-match' || match.state === 'nonmatching-event'
          ? 'event-match-uncertain'
          : 'imported';

      const nowUtc = new Date().toISOString();
      const localId = `local://${file.name}`;
      const urlHint = importUrlInput.trim();
      const safeUrlCheck = urlHint
        ? validateSafePublicHttpsUrl(urlHint, { requireAllowlist: false })
        : null;

      const resolution = await store.importOrAddSource({
        schemaVersion: '1.0',
        sourceId: `src_file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        linkedEqpEventId: event.id,
        documentTitle: extractedTitle,
        organization: importOrg.trim() || 'Operator Local Import',
        sourceLocation: safeUrlCheck?.ok ? safeUrlCheck.normalizedUrl : localId,
        sourceUrl: safeUrlCheck?.ok ? safeUrlCheck.normalizedUrl : null,
        localImportId: localId,
        sourceCategory: importCategory,
        publishedAtUtc: importPublishedUtc.trim() || null,
        retrievedAtUtc: nowUtc,
        contentType,
        sizeBytes: file.size,
        contentSha256: sha256,
        textAvailability,
        textUnavailableReason,
        extractedText,
        extractedTextPreview: buildTextPreview(extractedText),
        pageCount,
        eventMatchState: match.state,
        eventMatchDetails: match,
        externalEventIds: importExternalIds
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        retrievalStatus: status,
        originProvenance: {
          channel: 'local-file-import',
          adapterId: 'local-operator-import-v1',
          queryOrRequestSummary: file.name,
          modelUsed: null,
          groundingUsed: false,
          retrievedViaServer: true,
          accessConditionNote: null,
        },
        relevance: 'unreviewed',
        archived: false,
        notes: '',
      });

      await reloadSources();
      setImportFeedback({
        kind: textAvailability === 'scanned-no-text' ? 'warn' : 'ok',
        message: `${resolution.message}${textAvailability === 'scanned-no-text' ? ' Notice: Scanned/image-only PDF has no searchable text (no text fabricated).' : ''}`,
      });
      onNotice?.(resolution.message);
    } finally {
      setImportBusy(false);
    }
  };

  // =========================================================================
  // 4. Library Management Actions
  // =========================================================================

  const handleSetRelevance = async (
    sourceId: string,
    relevance: ResearchRelevanceDecision
  ) => {
    if (readOnly) return;
    await store.updateRelevance(sourceId, relevance);
    await reloadSources();
    onNotice?.(
      `Updated source relevance to "${relevance}" (note: does not auto-create PRIMER verified facts).`
    );
  };

  const handleToggleArchive = async (rec: PrimerResearchSourceRecord) => {
    if (readOnly) return;
    await store.updateArchived(rec.sourceId, !rec.archived);
    await reloadSources();
  };

  const handleRemoveSource = async (rec: PrimerResearchSourceRecord) => {
    if (readOnly) return;
    await store.removeSource(rec.sourceId);
    if (inspectingSourceId === rec.sourceId) {
      setInspectingSourceId(null);
    }
    await reloadSources();
    onNotice?.(`Removed source "${rec.documentTitle}" from active collection.`);
  };

  const handlePrepareNewVersionImport = (rec: PrimerResearchSourceRecord) => {
    setImportTitle(rec.documentTitle);
    setImportOrg(rec.organization);
    setImportCategory(rec.sourceCategory);
    setImportUrlInput(rec.sourceUrl ?? '');
    setImportExternalIds(rec.externalEventIds.join(', '));
    setImportFeedback({
      kind: 'ok',
      message: `Prepared re-import for "${rec.documentTitle}" (currently v${rec.versionNumber}). Importing updated content will preserve v${rec.versionNumber} and save v${rec.versionNumber + 1}.`,
    });
    setActiveTab('import');
  };

  const handleExportLibraryJson = async () => {
    const json = await store.exportEventSourcesJson(event.id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EQP_${event.id}_Research_Sources.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFindingsJson = async () => {
    const json = await findingsStore.exportEventFindingsJson(event.id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EQP_${event.id}_Candidate_Findings_R2.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // 5. R2 Scientific Findings Extraction & Comparison Handlers
  // =========================================================================

  const selectedSources = useMemo(
    () => sources.filter((s) => selectedSourceIds.includes(s.sourceId)),
    [sources, selectedSourceIds]
  );

  const anySelectedRestrictedOrLocal = useMemo(
    () => selectedSources.some((s) => isSourceRestrictedOrLocal(s)),
    [selectedSources]
  );

  const toggleSourceSelection = (sourceId: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]
    );
    setAiConfirmSendChecked(false);
    setAiAuthorizeRestrictedChecked(false);
  };

  const handleRunDeterministicExtraction = async () => {
    if (readOnly || detExtracting || selectedSources.length === 0) return;
    setDetExtracting(true);
    setExtractionFeedback(null);
    try {
      let totalSaved = 0;
      const warnings: string[] = [];
      for (const src of selectedSources) {
        if (src.textAvailability === 'scanned-no-text') {
          warnings.push(`"${src.documentTitle}" is scanned/image-only (no searchable text; zero findings fabricated).`);
          continue;
        }
        const extracted = extractDeterministicFindingsFromSource(src);
        const saved = await findingsStore.saveExtractionRun({
          linkedEqpEventId: event.id,
          sourceId: src.sourceId,
          extractionMethod: 'deterministic',
          findings: extracted,
        });
        totalSaved += saved.savedCount;
        if (saved.savedCount === 0) {
          warnings.push(`No matching deterministic patterns found in "${src.documentTitle}".`);
        }
      }
      await reloadFindings();
      setExtractionFeedback({
        kind: warnings.length > 0 && totalSaved === 0 ? 'warn' : 'ok',
        message: `Deterministic extraction preserved ${totalSaved} candidate finding(s) across ${selectedSources.length} source(s).${warnings.length > 0 ? ` Notes: ${warnings.join(' ')}` : ''}`,
      });
      onNotice?.(
        `R2 Deterministic extraction recorded ${totalSaved} candidate finding(s) (Stage 4 verified facts unchanged).`
      );
    } finally {
      setDetExtracting(false);
    }
  };

  const handleRunConsentedAiExtraction = async () => {
    if (readOnly || aiExtracting || selectedSources.length === 0) return;
    if (!aiConfirmSendChecked) return;
    if (anySelectedRestrictedOrLocal && !aiAuthorizeRestrictedChecked) return;

    const ac = new AbortController();
    aiAbortRef.current = ac;
    setAiExtracting(true);
    setExtractionFeedback(null);

    let totalSaved = 0;
    let totalRejected = 0;
    const notes: string[] = [];

    try {
      for (const src of selectedSources) {
        if (ac.signal.aborted) break;
        if (src.textAvailability === 'scanned-no-text') {
          notes.push(`Skipped "${src.documentTitle}" (scanned PDF without text).`);
          continue;
        }
        if (!src.extractedText.trim()) {
          notes.push(`Skipped "${src.documentTitle}" (empty extracted text).`);
          continue;
        }
        const resp = await fetch('/api/primer/research/extract-findings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({
            operatorConfirmedSendToAi: true,
            operatorAuthorizedExternalTransmission: aiAuthorizeRestrictedChecked,
            source: src,
            eventContext: searchContext,
            extractionRunVersion: 1,
          }),
        });
        const data = (await resp.json()) as {
          ok?: boolean;
          unavailable?: boolean;
          code?: string;
          modelUsed?: string;
          rejectedItemsCount?: number;
          findings?: CandidateScientificFinding[];
          error?: string;
        };

        if (!resp.ok || !data.ok) {
          if (data.unavailable || data.code === 'NO_API_KEY') {
            setExtractionFeedback({
              kind: 'warn',
              message:
                data.error ||
                'AI Extraction Unavailable: GEMINI_API_KEY is not configured. Use Deterministic Extraction or Manual Entry.',
            });
            setAiConsentOpen(false);
            return;
          }
          notes.push(`"${src.documentTitle}": ${data.error || 'Extraction failed.'}`);
          continue;
        }

        const returned = Array.isArray(data.findings) ? data.findings : [];
        totalRejected += data.rejectedItemsCount ?? 0;
        const saved = await findingsStore.saveExtractionRun({
          linkedEqpEventId: event.id,
          sourceId: src.sourceId,
          extractionMethod: 'gemini',
          findings: returned,
        });
        totalSaved += saved.savedCount;
      }

      await reloadFindings();
      setAiConsentOpen(false);
      setAiConfirmSendChecked(false);
      setAiAuthorizeRestrictedChecked(false);
      setExtractionFeedback({
        kind: totalSaved > 0 ? 'ok' : 'warn',
        message: `AI extraction saved ${totalSaved} schema-validated candidate finding(s)${totalRejected > 0 ? ` (${totalRejected} malformed item(s) rejected)` : ''}.${notes.length > 0 ? ` ${notes.join(' ')}` : ''}`,
      });
      onNotice?.(
        `R2 Gemini extraction completed (${totalSaved} candidate findings preserved; unverified until review).`
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setExtractionFeedback({
          kind: 'warn',
          message: 'AI extraction cancelled by operator.',
        });
      } else {
        setExtractionFeedback({
          kind: 'err',
          message:
            'Unable to reach server AI extraction endpoint. Deterministic extraction and manual entry remain available offline.',
        });
      }
    } finally {
      aiAbortRef.current = null;
      setAiExtracting(false);
    }
  };

  const handleSaveManualFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const src = sources.find((s) => s.sourceId === manualSourceId);
    if (!src || !manualTitle.trim() || !manualStatement.trim()) return;
    const candidate = createManualCandidateFinding({
      source: src,
      category: manualCategory,
      epistemicBasis: manualBasis,
      findingTitle: manualTitle.trim(),
      extractedStatement: manualStatement.trim(),
      evidencePassage: manualPassage.trim(),
      originalValue: manualValue.trim() || null,
      originalUnits: manualUnits.trim() || null,
      observationTimeRaw: manualObsTime.trim() || null,
      observationTimeZone: manualObsTz.trim() || null,
    });
    await findingsStore.saveSingleFinding(candidate);
    await reloadFindings();
    setManualTitle('');
    setManualStatement('');
    setManualPassage('');
    setManualValue('');
    setManualUnits('');
    setManualObsTime('');
    setManualObsTz('');
    setManualFormOpen(false);
    setExtractionFeedback({
      kind: candidate.evidenceValidationStatus === 'source-verified' ? 'ok' : 'warn',
      message: `Saved manual candidate finding "${candidate.findingTitle}" (${EVIDENCE_VALIDATION_LABELS[candidate.evidenceValidationStatus]}).`,
    });
  };

  const handleSetFindingRelevance = async (
    findingId: string,
    status: FindingRelevanceStatus
  ) => {
    if (readOnly) return;
    await findingsStore.updateRelevanceStatus(findingId, status);
    await reloadFindings();
  };

  const handleRevalidateAgainstNewerSources = async () => {
    if (readOnly) return;
    const versionedSources = sources.filter((s) => Boolean(s.supersedesSourceId));
    let totalReval = 0;
    let totalUnresolved = 0;
    for (const newer of versionedSources) {
      const res = await findingsStore.revalidateAgainstSourceVersion(
        newer,
        newer.supersedesSourceId ?? undefined,
        event
      );
      totalReval += res.revalidatedCount;
      totalUnresolved += res.unresolvedAfterUpdateCount;
    }
    await reloadFindings();
    setExtractionFeedback({
      kind: totalUnresolved > 0 ? 'warn' : 'ok',
      message: `Revalidated ${totalReval} finding(s) against newer source versions (${totalUnresolved} marked Evidence Unresolved).`,
    });
  };

  const handleOpenSourceFromFinding = (sourceId: string) => {
    const target = sources.find((s) => s.sourceId === sourceId);
    if (target?.archived) {
      setShowArchived(true);
    }
    setInspectingSourceId(sourceId);
    setActiveTab('library');
  };

  const visibleSources = useMemo(
    () => (showArchived ? sources : sources.filter((s) => !s.archived)),
    [sources, showArchived]
  );

  const inspectingSource = useMemo(
    () => sources.find((s) => s.sourceId === inspectingSourceId) ?? null,
    [sources, inspectingSourceId]
  );

  const comparisonResult = useMemo(
    () => detectFindingConflictsAndDuplicates(findings),
    [findings]
  );

  const sourceById = useMemo(() => {
    const map = new Map<string, PrimerResearchSourceRecord>();
    for (const src of sources) {
      map.set(src.sourceId, src);
    }
    return map;
  }, [sources]);

  const eligibilityByFindingId = useMemo(() => {
    const map: Record<string, R3TransferEligibilityResult> = {};
    for (const f of comparisonResult.annotatedFindings) {
      map[f.findingId] = evaluateFindingTransferEligibility(f, {
        activeEvent: event,
        primer: activePrimer,
        source: sourceById.get(f.sourceId),
        allSources: sources,
        allFindings: findings,
        auditRecords,
        isFrozenRevision: readOnly,
        isPlotResultStale,
        primaryLocationLabel,
      });
    }
    return map;
  }, [
    comparisonResult.annotatedFindings,
    event,
    activePrimer,
    sourceById,
    sources,
    findings,
    auditRecords,
    readOnly,
    isPlotResultStale,
    primaryLocationLabel,
  ]);

  const bucketCounts = useMemo(() => {
    const counts: Record<R3StatusBucket, number> = {
      eligible: 0,
      blocked: 0,
      'already-applied': 0,
      superseded: 0,
      rejected: 0,
      'no-supported-destination': 0,
    };
    for (const f of comparisonResult.annotatedFindings) {
      const b = eligibilityByFindingId[f.findingId]?.statusBucket;
      if (b) counts[b] += 1;
    }
    return counts;
  }, [comparisonResult.annotatedFindings, eligibilityByFindingId]);

  const reviewingFinding = useMemo(
    () =>
      reviewingFindingId
        ? comparisonResult.annotatedFindings.find((f) => f.findingId === reviewingFindingId) ??
          null
        : null,
    [comparisonResult.annotatedFindings, reviewingFindingId]
  );

  const reviewPreview: R3FindingTransferPreview | null = useMemo(() => {
    if (!reviewingFinding) return null;
    return buildFindingTransferPreview(
      reviewingFinding,
      {
        activeEvent: event,
        primer: activePrimer,
        source: sourceById.get(reviewingFinding.sourceId),
        allSources: sources,
        allFindings: findings,
        auditRecords,
        isFrozenRevision: readOnly,
        isPlotResultStale,
        primaryLocationLabel,
      },
      reviewResolutionMode
    );
  }, [
    reviewingFinding,
    event,
    activePrimer,
    sourceById,
    sources,
    findings,
    auditRecords,
    readOnly,
    isPlotResultStale,
    primaryLocationLabel,
    reviewResolutionMode,
  ]);

  const handleOpenReviewTransfer = (finding: CandidateScientificFinding) => {
    const preview = buildFindingTransferPreview(finding, {
      activeEvent: event,
      primer: activePrimer,
      source: sourceById.get(finding.sourceId),
      allSources: sources,
      allFindings: findings,
      auditRecords,
      isFrozenRevision: readOnly,
      isPlotResultStale,
      primaryLocationLabel,
    });
    setReviewingFindingId(finding.findingId);
    setReviewAppliedState('preliminary-review');
    setReviewConfirmVerifiedFact(false);
    setReviewResolutionMode(
      preview.hasExistingDestinationContent && preview.supportsAddSeparate
        ? 'add-separate'
        : preview.hasExistingDestinationContent
          ? 'replace-with-confirmation'
          : 'add-separate'
    );
    setReviewConfirmOverwrite(false);
    setReviewOverwriteReason('');
    setReviewConfirmTransfer(false);
    setTransferFeedback(null);
  };

  const handleConfirmTransferToPrimer = async () => {
    if (readOnly || transferBusy || !activePrimer || !reviewingFinding || !reviewPreview) return;
    const src = sourceById.get(reviewingFinding.sourceId);
    if (!src) {
      setTransferFeedback({
        kind: 'err',
        message: 'Backing R1 source record is missing from IndexedDB.',
      });
      return;
    }

    setTransferBusy(true);
    setTransferFeedback(null);
    try {
      const result = applyReviewedScientificFindingToPrimer({
        activeEvent: event,
        primer: activePrimer,
        finding: reviewingFinding,
        source: src,
        allSources: sources,
        allFindings: findings,
        auditRecords,
        operatorConfirmedTransfer: reviewConfirmTransfer,
        operatorLabel: reviewOperatorLabel,
        appliedAsState: reviewAppliedState,
        operatorConfirmedVerifiedFact: reviewConfirmVerifiedFact,
        resolutionMode: reviewResolutionMode,
        operatorConfirmedOverwrite: reviewConfirmOverwrite,
        overwriteReason: reviewOverwriteReason,
        primaryLocationLabel,
        faultGeneratorLabel,
        isPlotResultStale,
      });

      if (!result.ok) {
        setTransferFeedback({
          kind: 'warn',
          message: result.message,
        });
        return;
      }

      if (result.auditRecord) {
        await transferStore.appendAuditRecord(result.auditRecord);
        await reloadTransferAudit();
      }

      if (result.code === 'applied') {
        onApplyTransferToPrimer?.(result.updatedPrimer, result.message);
      }

      setReviewingFindingId(null);
      setReviewConfirmTransfer(false);
      setReviewConfirmOverwrite(false);
      setReviewOverwriteReason('');
      setTransferFeedback({
        kind: 'ok',
        message: result.message,
      });
    } finally {
      setTransferBusy(false);
    }
  };

  const handleConfirmRejectFinding = async (finding: CandidateScientificFinding) => {
    if (readOnly || transferBusy) return;
    const reason = rejectReason.trim() || 'Rejected during local operator review.';
    setTransferBusy(true);
    try {
      const src = sourceById.get(finding.sourceId);
      const entry: R3TransferAuditLogEntry = {
        schemaVersion: '1.0',
        auditId: `r3rej_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'transfer-rejected',
        linkedEqpEventId: event.id,
        primerDocumentId: activePrimer?.id ?? null,
        findingId: finding.findingId,
        sourceId: finding.sourceId,
        sourceTitle: finding.sourceTitle,
        sourceVersionNumber: finding.sourceVersionNumber,
        sourceContentSha256: finding.sourceContentSha256,
        findingCategory: finding.category,
        targetSectionId: null,
        destinationFieldPath: null,
        appliedAsState: null,
        resolutionMode: 'reject',
        replacementReason: reason,
        priorValueSummary: null,
        newValueSummary: finding.extractedStatement.slice(0, 240),
        evidenceLocatorLabel: finding.evidenceLocator.label,
        evidencePassageQuote: finding.evidencePassage.slice(0, 400),
        preservedEditedSections: true,
        operatorLabel: reviewOperatorLabel.trim() || 'Local Operator (Unverified)',
        identityStatus: 'UNVERIFIED_OPERATOR',
        recordedAtUtc: new Date().toISOString(),
        notes: `Operator rejected candidate finding transfer (${src?.organization ?? finding.sourceOrganization}): ${reason}`,
        isTamperProof: false,
        storageNote: R3_LOCAL_AUDIT_DISCLAIMER,
      };
      await transferStore.appendAuditRecord(entry);
      await reloadTransferAudit();
      setRejectingFindingId(null);
      setRejectReason('');
      setTransferFeedback({
        kind: 'ok',
        message: `Marked "${finding.findingTitle}" as rejected (preserved in source/evidence library and R3 history).`,
      });
    } finally {
      setTransferBusy(false);
    }
  };

  const handleConfirmResolveEventMatch = async (sourceId: string) => {
    if (readOnly || transferBusy) return;
    const src = sourceById.get(sourceId);
    if (!src) return;
    setTransferBusy(true);
    setTransferFeedback(null);
    try {
      const resolved = documentEventMatchResolution(src, event, {
        rationale: resolveRationale,
        supportingEvidence: resolveEvidence,
        operatorLabel: resolveOperatorLabel,
      });
      await store.updateEventMatch(resolved.sourceId, resolved.eventMatchDetails);
      const resolution = resolved.eventMatchDetails.operatorResolution!;
      await transferStore.appendAuditRecord({
        schemaVersion: '1.0',
        auditId: `r3match_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'event-match-resolved',
        linkedEqpEventId: event.id,
        primerDocumentId: activePrimer?.id ?? null,
        findingId: null,
        sourceId: resolved.sourceId,
        sourceTitle: resolved.documentTitle,
        sourceVersionNumber: resolved.versionNumber,
        sourceContentSha256: resolved.contentSha256,
        findingCategory: null,
        targetSectionId: null,
        destinationFieldPath: 'source.eventMatchDetails.operatorResolution',
        appliedAsState: null,
        resolutionMode: null,
        replacementReason: null,
        priorValueSummary: `Prior state: ${resolution.priorAutoState}`,
        newValueSummary: `Resolved for local draft evaluation: ${resolution.rationale}`,
        evidenceLocatorLabel: 'Operator Match Resolution',
        evidencePassageQuote: resolution.supportingEvidence,
        preservedEditedSections: true,
        operatorLabel: resolution.resolvedByLabel,
        identityStatus: 'UNVERIFIED_OPERATOR',
        recordedAtUtc: resolution.resolvedAtUtc,
        notes:
          'Local operator documented event-match resolution with supporting evidence (original automated match state preserved).',
        isTamperProof: false,
        storageNote: R3_LOCAL_AUDIT_DISCLAIMER,
      });
      await Promise.all([reloadSources(), reloadTransferAudit()]);
      setResolvingSourceId(null);
      setResolveRationale('');
      setResolveEvidence('');
      setTransferFeedback({
        kind: 'ok',
        message: `Documented event-match resolution for "${resolved.documentTitle}" (prior "${resolution.priorAutoState}" classification preserved).`,
      });
    } catch (err) {
      setTransferFeedback({
        kind: 'err',
        message: err instanceof Error ? err.message : 'Unable to resolve event match.',
      });
    } finally {
      setTransferBusy(false);
    }
  };

  const handleExportTransferHistoryJson = async () => {
    const json = await transferStore.exportEventHistoryJson(event.id);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eqp_r3_transfer_history_${event.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayedFindings = useMemo(() => {
    return comparisonResult.annotatedFindings.filter((f) => {
      if (!showSupersededFindings && f.supersededByRunId) return false;
      if (!showHiddenFindings && f.relevanceStatus !== 'active') return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (
        statusBucketFilter !== 'all' &&
        statusBucketFilter !== 'history' &&
        eligibilityByFindingId[f.findingId]?.statusBucket !== statusBucketFilter
      ) {
        return false;
      }
      return true;
    });
  }, [
    comparisonResult.annotatedFindings,
    showSupersededFindings,
    showHiddenFindings,
    categoryFilter,
    statusBucketFilter,
    eligibilityByFindingId,
  ]);

  const activeFindingsCount = useMemo(
    () =>
      findings.filter(
        (f) =>
          !f.supersededByRunId &&
          f.relevanceStatus === 'active' &&
          !f.excludedByNonMatchingEvent
      ).length,
    [findings]
  );

  const tabItems: Array<{
    id: ResearchTabId;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'search',
      label: '1. Search Official Sources',
      icon: <Search className="w-3.5 h-3.5" />,
      badge: discoveryCandidates.length || undefined,
    },
    {
      id: 'usgs',
      label: '2. USGS Event Products',
      icon: <Globe className="w-3.5 h-3.5" />,
      badge: usgsCandidates.length || undefined,
    },
    {
      id: 'import',
      label: '3. Import Documents',
      icon: <Upload className="w-3.5 h-3.5" />,
    },
    {
      id: 'library',
      label: '4. Source Library',
      icon: <BookOpen className="w-3.5 h-3.5" />,
      badge: sources.length,
    },
    {
      id: 'findings',
      label: '5. Scientific Findings',
      icon: <FlaskConical className="w-3.5 h-3.5" />,
      badge: activeFindingsCount || undefined,
    },
  ];

  return (
    <section
      className="border border-slate-200 rounded-xs bg-white overflow-hidden"
      aria-label="Research Missing Information Workspace (R1/R2)"
    >
      {/* Collapsible Header Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="w-4 h-4 text-[#005a94] shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Research Missing Information · Source Library, Findings &amp; Reviewed Transfer (R1–R3)
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-700 whitespace-nowrap">
              {sources.length} source{sources.length === 1 ? '' : 's'} · {activeFindingsCount} finding{activeFindingsCount === 1 ? '' : 's'} · {auditRecords.length} R3 log
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Source collection &amp; reviewed local draft transfer for{' '}
            <span className="font-mono font-semibold text-slate-800">{event.id}</span>. Every Stage 4 update requires explicit operator confirmation; edited sections remain protected.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Collapse Workspace</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Open Research Workspace</span>
            </>
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="divide-y divide-slate-200">
          {/* Read-Only Active Earthquake Context Strip */}
          <div className="bg-sky-50/50 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold text-[#005a94]">Active Search Context (Read-Only):</span>
              <span className="font-mono">
                ID: <strong>{searchContext.eventId}</strong> (B{searchContext.bulletinNo})
              </span>
              <span className="font-mono">
                Origin: {searchContext.originDateUtc} {searchContext.originTimeUtc} UTC
              </span>
              <span className="font-mono">
                {searchContext.isLocated && searchContext.lat !== null && searchContext.lon !== null
                  ? `${searchContext.lat.toFixed(3)}°N, ${searchContext.lon.toFixed(3)}°E · ${searchContext.depthKm?.toFixed(1) ?? '?'} km`
                  : 'Unlocated'}
              </span>
              <span className="font-mono">
                Mag:{' '}
                {searchContext.magnitudeValue !== null && searchContext.magnitudeScale
                  ? `${searchContext.magnitudeScale} ${searchContext.magnitudeValue.toFixed(1)}`
                  : 'Pending'}
              </span>
              {searchContext.primaryLocationLabel && (
                <span>Ref: {searchContext.primaryLocationLabel}</span>
              )}
            </div>
            <span className="text-[10.5px] font-mono text-slate-500">
              Store: {storeDiagnostics?.dbName ?? 'eqp_primer_research_sources_v1'} (Isolated from localStorage)
            </span>
          </div>

          {/* 4-Section Sub-Navigation */}
          <div
            className="bg-slate-50/70 px-3 py-1.5 flex flex-wrap gap-1"
            role="tablist"
            aria-label="PRIMER Research Assistant sections"
          >
            {tabItems.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-xs border transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-[#005a94] border-slate-300'
                      : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span className="ml-0.5 px-1.5 py-0 text-[10px] font-mono rounded-xs bg-slate-200 text-slate-800">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB BODY */}
          <div className="p-3.5 space-y-3 text-xs">
            {/* =============================================================== */}
            {/* 1. SEARCH OFFICIAL SOURCES                                      */}
            {/* =============================================================== */}
            {activeTab === 'search' && (
              <div className="space-y-3">
                {/* Gemini Capability Check Diagnostics */}
                <div className="border border-slate-200 rounded-xs bg-slate-50 p-2.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#005a94]" />
                      <span className="font-bold text-slate-800">
                        Gemini Search Grounding Capability Check
                      </span>
                      {capabilityReport && (
                        <span
                          className={`text-[10.5px] font-mono px-1.5 py-0.5 border rounded-xs ${
                            capabilityReport.configured
                              ? capabilityReport.searchGroundingWorked
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                : 'bg-sky-50 text-sky-900 border-sky-200'
                              : 'bg-amber-50 text-amber-950 border-amber-300'
                          }`}
                        >
                          {!capabilityReport.configured
                            ? 'API Key Not Configured (Offline/Manual Active)'
                            : capabilityReport.liveVerified
                              ? capabilityReport.searchGroundingWorked
                                ? `Verified (${capabilityReport.modelUsed})`
                                : `Probe Failed (${capabilityReport.modelUsed})`
                              : `Configured (${capabilityReport.modelUsed}, Unprobed)`}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={capabilityLoading}
                      onClick={() => void checkGeminiCapability(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {capabilityLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      <span>Run Server Capability Probe</span>
                    </button>
                  </div>

                  {capabilityReport && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-slate-600 pt-1">
                      <div>
                        <span className="font-semibold text-slate-700">Model:</span>{' '}
                        <span className="font-mono">{capabilityReport.modelUsed}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Search Grounding:</span>{' '}
                        {capabilityReport.liveVerified
                          ? capabilityReport.searchGroundingWorked
                            ? 'Worked'
                            : 'Did not succeed'
                          : capabilityReport.configured
                            ? 'Opt-in probe ready'
                            : 'Unavailable (no key)'}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Usable Metadata:</span>{' '}
                        {capabilityReport.usableMetadataReturned
                          ? `Yes (${capabilityReport.groundingChunksCount} chunks)`
                          : 'No / Not run'}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-700">Charge Risk:</span>{' '}
                        {capabilityReport.mayIncurCharges
                          ? 'Quota/tier charges possible'
                          : 'None (offline)'}
                      </div>
                    </div>
                  )}

                  {capabilityReport?.authOrQuotaRestriction && (
                    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xs px-2 py-1">
                      {capabilityReport.authOrQuotaRestriction}
                    </p>
                  )}
                </div>

                {/* User-Initiated Discovery Query Form */}
                <div className="border border-slate-200 rounded-xs p-3 space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label
                        htmlFor="research-search-category"
                        className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                      >
                        Information Category
                      </label>
                      <select
                        id="research-search-category"
                        value={searchCategory}
                        onChange={(e) =>
                          setSearchCategory(e.target.value as ResearchSourceCategory)
                        }
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                      >
                        {(
                          [
                            'official-update',
                            'tsunami-advisory',
                            'field-investigation',
                            'secondary-hazards',
                            'scientific-study',
                            'monitoring-response',
                          ] as ResearchSourceCategory[]
                        ).map((cat) => (
                          <option key={cat} value={cat}>
                            {RESEARCH_CATEGORY_LABELS[cat]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label
                        htmlFor="research-search-query"
                        className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                      >
                        Event-Specific Official Source Query (User-Initiated Only)
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="research-search-query"
                          type="text"
                          value={customSearchQuery}
                          onChange={(e) => setCustomSearchQuery(e.target.value)}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                          placeholder="Query using date, location, magnitude type/value, event ID..."
                        />
                        <button
                          type="button"
                          disabled={searchLoading || !customSearchQuery.trim()}
                          onClick={() => void handleRunOfficialSearch()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          {searchLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Search className="w-3.5 h-3.5" />
                          )}
                          <span>Search Official Sources</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      Produces unverified source candidates with actual grounded URLs/titles only — never auto-runs on event switch and never creates verified claims.
                    </span>
                  </p>
                </div>

                {searchError && (
                  <div className="border border-amber-300 bg-amber-50 rounded-xs px-3 py-2 text-xs text-amber-950 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold">Retrieval Unavailable (Search Grounding)</div>
                      <div>{searchError}</div>
                    </div>
                  </div>
                )}

                {searchSummaryNote && (
                  <div className="border border-slate-200 bg-slate-50 rounded-xs p-2.5 text-[11px] text-slate-700 whitespace-pre-wrap">
                    <div className="font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-1">
                      Grounded Search Overview (Not Verified Scientific Text)
                    </div>
                    {searchSummaryNote}
                  </div>
                )}

                {discoveryCandidates.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Discovered Source Candidates ({discoveryCandidates.length})
                    </div>
                    {discoveryCandidates.map((cand) => (
                      <div
                        key={cand.candidateId}
                        className="border border-slate-200 rounded-xs p-2.5 bg-white flex flex-wrap items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${STATUS_BADGE_STYLES.discovered}`}
                            >
                              {RESEARCH_SOURCE_STATUS_LABELS.discovered}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 border border-slate-200 bg-slate-50 text-slate-700 rounded-xs">
                              {cand.organization}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${
                                cand.isAllowlistedDomain
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-900 border-amber-200'
                              }`}
                            >
                              {cand.isAllowlistedDomain ? 'Allowlisted Domain' : 'External Domain'}
                            </span>
                          </div>
                          <div className="font-semibold text-slate-900 break-words">
                            {cand.title}
                          </div>
                          <a
                            href={cand.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[#005a94] hover:underline break-all"
                          >
                            <span>{cand.url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </div>

                        {!readOnly && (
                          <div className="flex flex-wrap gap-1.5 shrink-0">
                            {cand.isAllowlistedDomain && (
                              <button
                                type="button"
                                onClick={() => {
                                  setImportTitle(cand.title);
                                  setImportOrg(cand.organization);
                                  setImportCategory(cand.category);
                                  setImportUrlInput(cand.url);
                                  setActiveTab('import');
                                  void handleFetchSafeUrl(cand.url);
                                }}
                                className="px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] whitespace-nowrap"
                              >
                                Retrieve Safe URL
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handlePreserveDiscoveryCandidate(cand)}
                              className="px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 whitespace-nowrap"
                            >
                              Save Link to Library
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* 2. USGS EVENT PRODUCTS                                          */}
            {/* =============================================================== */}
            {activeTab === 'usgs' && (
              <div className="space-y-3">
                <div className="border border-slate-200 rounded-xs p-3 bg-slate-50/60 flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-bold text-slate-800">
                      USGS ComCat / FDSN Event Product Lookup
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Query USGS FDSN events near active EQP coordinates or fetch a specific USGS Event ID (e.g.{' '}
                      <span className="font-mono">usb000kdb4</span>). Never modifies active EQP event parameters.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={usgsSearchLoading}
                      onClick={() => void handleSearchUsgsCandidates()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap"
                    >
                      {usgsSearchLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Globe className="w-3.5 h-3.5" />
                      )}
                      <span>Find Matching USGS Events</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={manualUsgsId}
                        onChange={(e) => setManualUsgsId(e.target.value)}
                        placeholder="USGS Event ID (e.g. usb000kdb4)"
                        className="px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs w-48 focus:outline-none focus:border-[#005a94]"
                      />
                      <button
                        type="button"
                        disabled={usgsDetailLoading || !manualUsgsId.trim()}
                        onClick={() => void handleFetchUsgsDetail(manualUsgsId)}
                        className="px-2.5 py-1.5 rounded-xs border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        Fetch Detail
                      </button>
                    </div>
                  </div>
                </div>

                {usgsSearchError && (
                  <div className="border border-rose-200 bg-rose-50 rounded-xs px-3 py-2 text-xs text-rose-900">
                    {usgsSearchError}
                  </div>
                )}

                {usgsCandidates.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Candidate USGS Events ({usgsCandidates.length})
                    </div>
                    <div className="border border-slate-200 rounded-xs divide-y divide-slate-200">
                      {usgsCandidates.map((c) => (
                        <div
                          key={c.usgsEventId}
                          className="p-2.5 flex flex-wrap items-center justify-between gap-2 bg-white"
                        >
                          <div className="space-y-0.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900">
                                {c.usgsEventId}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${MATCH_BADGE_STYLES[c.match.state]}`}
                              >
                                {EVENT_MATCH_STATE_LABELS[c.match.state]}
                              </span>
                              <span className="font-mono text-[11px] text-slate-700">
                                {c.magnitude !== null
                                  ? `${c.magnitudeType ?? 'Mag'} ${c.magnitude.toFixed(1)}`
                                  : 'Mag N/A'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-700">{c.title}</div>
                            <div className="text-[10.5px] font-mono text-slate-500">
                              Origin: {c.originTimeUtc ?? 'N/A'} · Offset:{' '}
                              {c.match.epicentralDistanceKm ?? '?'} km · Δt:{' '}
                              {c.match.originTimeDeltaSec ?? '?'} s
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={usgsDetailLoading}
                            onClick={() => void handleFetchUsgsDetail(c.usgsEventId)}
                            className="px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap"
                          >
                            Retrieve Products
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedUsgsDetail && (
                  <div className="border border-slate-300 rounded-xs bg-white overflow-hidden">
                    <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">
                          {selectedUsgsDetail.title} ({selectedUsgsDetail.usgsEventId})
                        </div>
                        <div className="text-[11px] font-mono text-slate-600">
                          Origin: {selectedUsgsDetail.originTimeUtc ?? 'Unavailable'} ·{' '}
                          {selectedUsgsDetail.lat !== null && selectedUsgsDetail.lon !== null
                            ? `${selectedUsgsDetail.lat.toFixed(3)}°N, ${selectedUsgsDetail.lon.toFixed(3)}°E`
                            : 'Coords N/A'}{' '}
                          · Depth: {selectedUsgsDetail.depthKm?.toFixed(1) ?? '?'} km
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedUsgsDetail.eventPageUrl && (
                          <a
                            href={selectedUsgsDetail.eventPageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-[#005a94] hover:bg-slate-50"
                          >
                            <span>USGS Event Page</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => void handleSaveUsgsDetailToLibrary()}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-xs bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800 whitespace-nowrap"
                          >
                            <FilePlus2 className="w-3.5 h-3.5" />
                            <span>Save to Source Library</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="bg-amber-50 border border-amber-200 rounded-xs px-2.5 py-1.5 text-[11px] text-amber-950 space-y-0.5">
                        {selectedUsgsDetail.disclaimers.map((d, idx) => (
                          <div key={idx}>• {d}</div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {selectedUsgsDetail.products.map((prod) => (
                          <div
                            key={prod.productType}
                            className={`border rounded-xs p-2 text-[11px] ${
                              prod.available
                                ? 'border-slate-200 bg-white'
                                : 'border-slate-200 bg-slate-50/70 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold uppercase text-slate-800">
                                {prod.productType}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${
                                  prod.available
                                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-300'
                                }`}
                              >
                                {prod.available ? 'Available' : 'Not Published'}
                              </span>
                            </div>
                            {prod.available && (
                              <div className="mt-1 space-y-0.5 text-slate-700 font-mono text-[10.5px]">
                                <div>
                                  Contributor: {prod.sourceContributor ?? 'unknown'} · Updated:{' '}
                                  {prod.updateTimeUtc ?? 'unknown'}
                                </div>
                                <div className="text-slate-600 break-all">
                                  {Object.entries(prod.metadata)
                                    .filter(([, v]) => v !== null && v !== undefined && v !== '')
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(' · ')}
                                </div>
                              </div>
                            )}
                            {prod.caveat && (
                              <div className="mt-1 text-[10.5px] text-amber-900">
                                {prod.caveat}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* 3. IMPORT DOCUMENTS (LOCAL FILE & SAFE URL RETRIEVAL)           */}
            {/* =============================================================== */}
            {activeTab === 'import' && (
              <div className="space-y-3">
                {/* Metadata & Matching Hints */}
                <div className="border border-slate-200 rounded-xs p-3 bg-slate-50/50 space-y-2.5">
                  <div className="font-bold text-slate-800">
                    Document Metadata &amp; Optional Event-Match Hints
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input
                      type="text"
                      value={importTitle}
                      onChange={(e) => setImportTitle(e.target.value)}
                      placeholder="Document Title (optional — auto from file)"
                      className="px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                    />
                    <input
                      type="text"
                      value={importOrg}
                      onChange={(e) => setImportOrg(e.target.value)}
                      placeholder="Organization (e.g. DOST-PHIVOLCS, NDRRMC)"
                      className="px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                    />
                    <select
                      value={importCategory}
                      onChange={(e) =>
                        setImportCategory(e.target.value as ResearchSourceCategory)
                      }
                      className="px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                    >
                      {Object.entries(RESEARCH_CATEGORY_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={importPublishedUtc}
                      onChange={(e) => setImportPublishedUtc(e.target.value)}
                      placeholder="Published UTC (optional ISO)"
                      className="px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                    <input
                      type="text"
                      value={importExternalIds}
                      onChange={(e) => setImportExternalIds(e.target.value)}
                      placeholder="External IDs (optional)"
                      className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs"
                    />
                    <input
                      type="text"
                      value={importHintOriginUtc}
                      onChange={(e) => setImportHintOriginUtc(e.target.value)}
                      placeholder="Origin UTC hint"
                      className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs"
                    />
                    <input
                      type="text"
                      value={importHintLat}
                      onChange={(e) => setImportHintLat(e.target.value)}
                      placeholder="Lat (°N)"
                      className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs"
                    />
                    <input
                      type="text"
                      value={importHintLon}
                      onChange={(e) => setImportHintLon(e.target.value)}
                      placeholder="Lon (°E)"
                      className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs"
                    />
                    <input
                      type="text"
                      value={importHintMag}
                      onChange={(e) => setImportHintMag(e.target.value)}
                      placeholder="Magnitude"
                      className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs"
                    />
                    <input
                      type="text"
                      value={importHintMagType}
                      onChange={(e) => setImportHintMagType(e.target.value)}
                      placeholder="Scale (Ms/Mw/Mb)"
                      className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Local Document File Import */}
                  <div className="border border-slate-200 rounded-xs p-3 space-y-2 bg-white">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <FileText className="w-4 h-4 text-[#005a94]" />
                      <span>Local Document Import (PDF, HTML, Plain Text)</span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Offline-safe local import (up to {Math.round(MAX_RESEARCH_IMPORT_BYTES / (1024 * 1024))} MiB). Scanned image-only PDFs report missing searchable text without fabricating OCR. Imported documents are never transmitted to Gemini automatically.
                    </p>
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs border text-xs font-semibold cursor-pointer ${
                        readOnly || importBusy
                          ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed'
                          : 'bg-[#005a94] border-[#005a94] text-white hover:bg-[#004877]'
                      }`}
                    >
                      {importBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>Choose .pdf, .html, or .txt File</span>
                      <input
                        type="file"
                        accept=".pdf,.html,.htm,.txt,application/pdf,text/html,text/plain"
                        disabled={readOnly || importBusy}
                        onChange={(e) => void handleLocalFileImport(e)}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* Safe HTTPS URL Retrieval */}
                  <div className="border border-slate-200 rounded-xs p-3 space-y-2 bg-white">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Link2 className="w-4 h-4 text-[#005a94]" />
                      <span>Safe Public Official URL Retrieval (HTTPS Allowlist)</span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Allows HTTPS URLs on official agency/scientific domains (e.g.{' '}
                      <span className="font-mono">
                        {ALLOWLISTED_OFFICIAL_DOMAINS.slice(0, 4)
                          .map((d) => d.domain)
                          .join(', ')}
                      </span>
                      ). Enforces DNS private-IP rejection &amp; max 3 verified redirects.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={importUrlInput}
                        onChange={(e) => setImportUrlInput(e.target.value)}
                        placeholder="https://earthquake.usgs.gov/... or https://phivolcs.dost.gov.ph/..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                      />
                      <button
                        type="button"
                        disabled={readOnly || importBusy || !importUrlInput.trim()}
                        onClick={() => void handleFetchSafeUrl()}
                        className="px-3 py-1.5 rounded-xs border border-[#005a94] bg-white text-[#005a94] text-xs font-semibold hover:bg-sky-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        Retrieve URL
                      </button>
                    </div>
                  </div>
                </div>

                {importFeedback && (
                  <div
                    className={`border rounded-xs px-3 py-2 text-xs flex items-start gap-2 ${
                      importFeedback.kind === 'ok'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : importFeedback.kind === 'warn'
                          ? 'border-amber-300 bg-amber-50 text-amber-950'
                          : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    {importFeedback.kind === 'ok' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{importFeedback.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* 4. SOURCE LIBRARY                                               */}
            {/* =============================================================== */}
            {activeTab === 'library' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xs px-3 py-2">
                  <div className="text-[11px] text-slate-700">
                    <strong>Active Event Collection ({event.id}):</strong> {visibleSources.length} shown ({sources.length} total). Relevance marks never create verified-fact entries in Stage 4.
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={(e) => setShowArchived(e.target.checked)}
                      />
                      <span>Show Archived</span>
                    </label>
                    {sources.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleExportLibraryJson()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export JSON</span>
                      </button>
                    )}
                  </div>
                </div>

                {visibleSources.length === 0 ? (
                  <div className="border border-slate-200 rounded-xs p-6 text-center text-xs text-slate-500">
                    No source documents preserved for {event.id} yet. Use tabs 1–3 to search official sources, retrieve USGS ComCat products, or import PDF/HTML/TXT files.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleSources.map((rec) => {
                      const isInspecting = inspectingSourceId === rec.sourceId;
                      return (
                        <div
                          key={rec.sourceId}
                          className="border border-slate-200 rounded-xs bg-white overflow-hidden"
                        >
                          <div className="p-2.5 space-y-1.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${STATUS_BADGE_STYLES[rec.retrievalStatus]}`}
                                  >
                                    {RESEARCH_SOURCE_STATUS_LABELS[rec.retrievalStatus]}
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${MATCH_BADGE_STYLES[rec.eventMatchState]}`}
                                  >
                                    {EVENT_MATCH_STATE_LABELS[rec.eventMatchState]}
                                  </span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 border border-slate-200 bg-slate-50 text-slate-700 rounded-xs">
                                    v{rec.versionNumber}
                                    {rec.supersededBySourceId ? ' (Superseded)' : ''}
                                  </span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 border border-slate-200 bg-white text-slate-600 rounded-xs">
                                    {RESEARCH_CATEGORY_LABELS[rec.sourceCategory]}
                                  </span>
                                  {rec.relevance !== 'unreviewed' && (
                                    <span
                                      className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${
                                        rec.relevance === 'relevant'
                                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                          : 'bg-slate-100 text-slate-600 border-slate-300'
                                      }`}
                                    >
                                      Marked: {rec.relevance}
                                    </span>
                                  )}
                                </div>

                                <div className="font-bold text-slate-900 break-words">
                                  {rec.documentTitle}
                                </div>
                                <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <span>Org: <strong>{rec.organization}</strong></span>
                                  <span className="font-mono">{rec.contentType}</span>
                                  {rec.sizeBytes !== null && (
                                    <span className="font-mono">
                                      {(rec.sizeBytes / 1024).toFixed(1)} KB
                                    </span>
                                  )}
                                  <span className="font-mono">
                                    Retrieved: {rec.retrievedAtUtc}
                                  </span>
                                  {rec.publishedAtUtc && (
                                    <span className="font-mono">
                                      Published: {rec.publishedAtUtc}
                                    </span>
                                  )}
                                </div>

                                {rec.sourceUrl && (
                                  <a
                                    href={rec.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-mono text-[#005a94] hover:underline break-all"
                                  >
                                    <span>{rec.sourceUrl}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                )}

                                {rec.extractedTextPreview ? (
                                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xs px-2 py-1">
                                    {rec.extractedTextPreview}
                                  </p>
                                ) : rec.textUnavailableReason ? (
                                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xs px-2 py-1">
                                    {rec.textUnavailableReason}
                                  </p>
                                ) : null}
                              </div>

                              {/* Operator Library Actions */}
                              <div className="flex flex-wrap items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInspectingSourceId(isInspecting ? null : rec.sourceId)
                                  }
                                  className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  {isInspecting ? 'Hide Details' : 'Inspect'}
                                </button>
                                {!readOnly && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleSetRelevance(
                                          rec.sourceId,
                                          rec.relevance === 'relevant' ? 'unreviewed' : 'relevant'
                                        )
                                      }
                                      className={`px-2 py-1 rounded-xs border text-[11px] font-semibold ${
                                        rec.relevance === 'relevant'
                                          ? 'bg-emerald-700 text-white border-emerald-800'
                                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                      }`}
                                    >
                                      Relevant
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleSetRelevance(
                                          rec.sourceId,
                                          rec.relevance === 'irrelevant'
                                            ? 'unreviewed'
                                            : 'irrelevant'
                                        )
                                      }
                                      className={`px-2 py-1 rounded-xs border text-[11px] font-semibold ${
                                        rec.relevance === 'irrelevant'
                                          ? 'bg-slate-700 text-white border-slate-800'
                                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                      }`}
                                    >
                                      Irrelevant
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handlePrepareNewVersionImport(rec)}
                                      className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-[#005a94] hover:bg-sky-50"
                                      title="Re-import newer version while preserving this version"
                                    >
                                      New Version
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleToggleArchive(rec)}
                                      className="p-1 rounded-xs border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                                      title={rec.archived ? 'Unarchive' : 'Archive source'}
                                    >
                                      <Archive className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveSource(rec)}
                                      className="p-1 rounded-xs border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                                      title="Remove source from collection"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Inspect Drawer: Metadata, Event Match Details, & Sanitized Plain-Text Viewer */}
                          {isInspecting && inspectingSource && (
                            <div className="border-t border-slate-200 bg-slate-50 p-3 space-y-2 text-[11px]">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="border border-slate-200 bg-white rounded-xs p-2 space-y-0.5">
                                  <div className="font-bold text-slate-800">
                                    Provenance &amp; File Integrity
                                  </div>
                                  <div className="font-mono text-slate-600 break-all">
                                    Source ID: {inspectingSource.sourceId}
                                  </div>
                                  <div className="font-mono text-slate-600 break-all">
                                    SHA-256: {inspectingSource.contentSha256 ?? 'N/A (reference only)'}
                                  </div>
                                  <div className="text-slate-600">
                                    Channel: {inspectingSource.originProvenance.channel} · Adapter:{' '}
                                    {inspectingSource.originProvenance.adapterId}
                                  </div>
                                  {inspectingSource.supersedesSourceId && (
                                    <div className="font-mono text-slate-600">
                                      Supersedes: {inspectingSource.supersedesSourceId}
                                    </div>
                                  )}
                                </div>

                                <div className="border border-slate-200 bg-white rounded-xs p-2 space-y-0.5">
                                  <div className="font-bold text-slate-800">
                                    Event-Match Evaluation
                                  </div>
                                  <div className="text-slate-700">
                                    {inspectingSource.eventMatchDetails.explanation}
                                  </div>
                                  {inspectingSource.eventMatchDetails.caveats.map((c, idx) => (
                                    <div key={idx} className="text-amber-900">
                                      • {c}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="border border-slate-200 bg-white rounded-xs p-2">
                                <div className="font-bold text-slate-800 mb-1">
                                  Extracted Plain Text (Sanitized Read-Only View)
                                </div>
                                {inspectingSource.extractedText ? (
                                  <pre className="max-h-64 overflow-auto text-[11px] font-mono text-slate-800 whitespace-pre-wrap break-words bg-slate-50 p-2 border border-slate-200 rounded-xs">
                                    {inspectingSource.extractedText}
                                  </pre>
                                ) : (
                                  <div className="text-slate-500 italic">
                                    {inspectingSource.textUnavailableReason ||
                                      'No extracted text available for this source.'}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* 5. SCIENTIFIC FINDINGS (R2 CANDIDATE EXTRACTION & COMPARISON)   */}
            {/* =============================================================== */}
            {activeTab === 'findings' && (
              <div className="space-y-3">
                {/* Boundary & Capability Diagnostics Bar */}
                <div className="border border-slate-200 rounded-xs bg-slate-50 p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 text-[#005a94]" />
                      <span className="font-bold text-slate-800">
                        Candidate Scientific Findings (Unverified · R2 Extraction Only)
                      </span>
                      {extractCapability && (
                        <span
                          className={`text-[10.5px] font-mono px-1.5 py-0.5 border rounded-xs ${
                            extractCapability.available
                              ? 'bg-sky-50 text-sky-900 border-sky-200'
                              : 'bg-amber-50 text-amber-950 border-amber-300'
                          }`}
                        >
                          {extractCapability.available
                            ? `Gemini Structured JSON Ready (${extractCapability.modelUsed})`
                            : 'AI Extraction Unavailable (Offline Deterministic Active)'}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={extractCapabilityLoading}
                        onClick={() => void checkExtractCapability()}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${extractCapabilityLoading ? 'animate-spin' : ''}`}
                        />
                        <span>Check AI Status</span>
                      </button>
                      {findings.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleExportFindingsJson()}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Download className="w-3 h-3" />
                          <span>Export Findings JSON</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {extractCapability && !extractCapability.available && (
                    <div className="text-[11px] text-amber-950 bg-amber-50 border border-amber-200 rounded-xs px-2.5 py-1.5">
                      {extractCapability.reasonUnavailable ||
                        'AI Extraction Unavailable: GEMINI_API_KEY is not configured. Deterministic extraction, manual candidate entry, and cross-source comparison remain fully functional.'}
                    </div>
                  )}

                  <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      R2 produces structured <strong>candidate findings</strong> only — never auto-updates Stage 4 verified facts, edited prose, tsunami advisories, or Stage 6A/6B reviews.
                    </span>
                    <span className="font-mono text-[10.5px] text-slate-500">
                      Store: {findingsDiagnostics?.dbName ?? 'eqp_primer_research_findings_v1'}
                    </span>
                  </div>
                </div>

                {/* Source Selection & Extraction Controls */}
                <div className="border border-slate-200 rounded-xs bg-white p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-slate-800">
                      Select Source(s) for Scientific Extraction ({selectedSourceIds.length} selected)
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {sources.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSourceIds(
                                sources
                                  .filter((s) => s.eventMatchState !== 'nonmatching-event')
                                  .map((s) => s.sourceId)
                              )
                            }
                            className="px-2 py-0.5 rounded-xs border border-slate-300 bg-slate-50 text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Select Matching Sources
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedSourceIds([])}
                            className="px-2 py-0.5 rounded-xs border border-slate-300 bg-white text-[10.5px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {sources.length === 0 ? (
                    <div className="border border-slate-200 rounded-xs p-3 text-center text-[11px] text-slate-500 bg-slate-50/50">
                      No R1 source documents collected for {event.id} yet. Retrieve USGS products or import PDF/HTML/TXT files in tabs 1–3 first.
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-auto border border-slate-200 rounded-xs divide-y divide-slate-200">
                      {sources.map((src) => {
                        const checked = selectedSourceIds.includes(src.sourceId);
                        const restricted = isSourceRestrictedOrLocal(src);
                        return (
                          <label
                            key={src.sourceId}
                            className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer text-[11px] ${
                              checked ? 'bg-sky-50/60' : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSourceSelection(src.sourceId)}
                              />
                              <span className="font-semibold text-slate-900 truncate">
                                {src.documentTitle}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500">
                                ({src.organization}, v{src.versionNumber})
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1 shrink-0">
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${MATCH_BADGE_STYLES[src.eventMatchState]}`}
                              >
                                {EVENT_MATCH_STATE_LABELS[src.eventMatchState]}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 border border-slate-200 bg-slate-50 text-slate-700 rounded-xs">
                                {src.textAvailability === 'scanned-no-text'
                                  ? 'Scanned (No Text)'
                                  : src.usgsDetail
                                    ? 'USGS GeoJSON + Text'
                                    : src.extractedText
                                      ? `${src.extractedText.length} chars`
                                      : 'Metadata Only'}
                              </span>
                              {restricted && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 border border-amber-300 bg-amber-50 text-amber-900 rounded-xs">
                                  Local/Internal
                                </span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Action Buttons */}
                  {!readOnly && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={detExtracting || selectedSources.length === 0}
                        onClick={() => void handleRunDeterministicExtraction()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] disabled:opacity-50"
                      >
                        {detExtracting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FlaskConical className="w-3.5 h-3.5" />
                        )}
                        <span>Extract Deterministic Findings</span>
                      </button>

                      <button
                        type="button"
                        disabled={
                          aiExtracting ||
                          selectedSources.length === 0 ||
                          extractCapability?.available === false
                        }
                        onClick={() => {
                          setAiConfirmSendChecked(false);
                          setAiAuthorizeRestrictedChecked(false);
                          setAiConsentOpen((v) => !v);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs border border-[#005a94] bg-white text-[#005a94] text-xs font-semibold hover:bg-sky-50 disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Extract Scientific Findings (Gemini AI...)</span>
                      </button>

                      {aiExtracting && (
                        <button
                          type="button"
                          onClick={() => aiAbortRef.current?.abort()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xs border border-rose-300 bg-rose-50 text-rose-900 text-xs font-semibold hover:bg-rose-100"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel AI Extraction</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={sources.length === 0}
                        onClick={() => {
                          if (!manualSourceId && sources[0]) {
                            setManualSourceId(sources[0].sourceId);
                          }
                          setManualFormOpen((v) => !v);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xs border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Add Manual Finding</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setComparePanelOpen((v) => !v)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xs border text-xs font-semibold ${
                          comparePanelOpen
                            ? 'bg-slate-800 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <GitCompare className="w-3.5 h-3.5" />
                        <span>
                          Compare Findings ({comparisonResult.clusters.length})
                        </span>
                      </button>

                      {sources.some((s) => Boolean(s.supersedesSourceId)) && (
                        <button
                          type="button"
                          onClick={() => void handleRevalidateAgainstNewerSources()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xs border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Revalidate vs. Newer Source Versions</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Explicit Gemini Consent & Privacy Disclosure Drawer (Section C) */}
                  {aiConsentOpen && selectedSources.length > 0 && !readOnly && (
                    <div className="border border-amber-300 bg-amber-50/70 rounded-xs p-3 space-y-2 text-[11px]">
                      <div className="font-bold text-amber-950 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-amber-800 shrink-0" />
                        <span>
                          External AI Transmission Consent &amp; Data Privacy Review
                        </span>
                      </div>
                      <p className="text-amber-950">
                        Only the specific selected document(s) listed below will be transmitted to the external Google Gemini API (model{' '}
                        <span className="font-mono">{extractCapability?.modelUsed ?? 'gemini-4-hydrogen'}</span>
                        , bounded chunks, zero autonomous web search). API keys remain server-side; unrelated events and other IndexedDB sources are NOT transmitted.
                      </p>

                      <div className="bg-white border border-amber-200 rounded-xs p-2 space-y-1">
                        <div className="font-semibold text-slate-800">
                          Documents Queued for Transmission ({selectedSources.length}):
                        </div>
                        {selectedSources.map((s) => (
                          <div key={s.sourceId} className="font-mono text-[10.5px] text-slate-700">
                            • {s.documentTitle} [{s.organization}, v{s.versionNumber},{' '}
                            {s.textAvailability === 'scanned-no-text'
                              ? 'SKIPPED: scanned-no-text'
                              : `${s.extractedText.length} chars`}
                            {isSourceRestrictedOrLocal(s) ? ' · LOCAL/INTERNAL' : ''}]
                          </div>
                        ))}
                      </div>

                      <label className="flex items-start gap-2 cursor-pointer text-slate-900">
                        <input
                          type="checkbox"
                          checked={aiConfirmSendChecked}
                          onChange={(e) => setAiConfirmSendChecked(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>
                          I confirm transmitting these specific document text chunk(s) to the external Gemini AI service for candidate extraction (output stays unverified).
                        </span>
                      </label>

                      {anySelectedRestrictedOrLocal && (
                        <label className="flex items-start gap-2 cursor-pointer text-rose-950 bg-rose-50 border border-rose-200 rounded-xs p-2">
                          <input
                            type="checkbox"
                            checked={aiAuthorizeRestrictedChecked}
                            onChange={(e) => setAiAuthorizeRestrictedChecked(e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            <strong>Restricted / Local File Authorization Required:</strong> At least one selected source is a local import or marked internal/restricted. Explicitly authorize external AI processing of its contents.
                          </span>
                        </label>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={
                            aiExtracting ||
                            !aiConfirmSendChecked ||
                            (anySelectedRestrictedOrLocal && !aiAuthorizeRestrictedChecked)
                          }
                          onClick={() => void handleRunConsentedAiExtraction()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] disabled:opacity-50"
                        >
                          {aiExtracting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>Confirm &amp; Send Selected to Gemini</span>
                        </button>
                        <button
                          type="button"
                          disabled={aiExtracting}
                          onClick={() => setAiConsentOpen(false)}
                          className="px-2.5 py-1.5 rounded-xs border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Manual Candidate Finding Form (Section B/D Offline Support) */}
                  {manualFormOpen && !readOnly && (
                    <form
                      onSubmit={(e) => void handleSaveManualFinding(e)}
                      className="border border-slate-300 bg-slate-50 rounded-xs p-3 space-y-2 text-[11px]"
                    >
                      <div className="font-bold text-slate-800">
                        Add Manual Candidate Scientific Finding (Quote-Checked Against Source)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select
                          value={manualSourceId}
                          onChange={(e) => setManualSourceId(e.target.value)}
                          className="px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-xs"
                        >
                          {sources.map((s) => (
                            <option key={s.sourceId} value={s.sourceId}>
                              {s.documentTitle} (v{s.versionNumber})
                            </option>
                          ))}
                        </select>
                        <select
                          value={manualCategory}
                          onChange={(e) => setManualCategory(e.target.value as R2FindingCategory)}
                          className="px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-xs"
                        >
                          {R2_FINDING_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {R2_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        <select
                          value={manualBasis}
                          onChange={(e) => setManualBasis(e.target.value as FindingEpistemicBasis)}
                          className="px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-xs"
                        >
                          {(['measured', 'reported', 'estimated', 'modeled', 'interpreted'] as FindingEpistemicBasis[]).map(
                            (b) => (
                              <option key={b} value={b}>
                                Basis: {b}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <input
                        type="text"
                        required
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="Finding Title (e.g., PEIS Intensity VII in Sagbayan)"
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-xs"
                      />
                      <textarea
                        rows={2}
                        required
                        value={manualStatement}
                        onChange={(e) => setManualStatement(e.target.value)}
                        placeholder="Extracted scientific statement (preserve raw numbers and units)"
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-xs"
                      />
                      <textarea
                        rows={2}
                        value={manualPassage}
                        onChange={(e) => setManualPassage(e.target.value)}
                        placeholder="Exact verbatim evidence passage copied from the source text"
                        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-xs font-mono"
                      />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <input
                          type="text"
                          value={manualValue}
                          onChange={(e) => setManualValue(e.target.value)}
                          placeholder="Raw value (optional)"
                          className="px-2 py-1 bg-white border border-slate-300 rounded-xs text-xs font-mono"
                        />
                        <input
                          type="text"
                          value={manualUnits}
                          onChange={(e) => setManualUnits(e.target.value)}
                          placeholder="Units/scale (e.g. Ms, PEIS, km)"
                          className="px-2 py-1 bg-white border border-slate-300 rounded-xs text-xs font-mono"
                        />
                        <input
                          type="text"
                          value={manualObsTime}
                          onChange={(e) => setManualObsTime(e.target.value)}
                          placeholder="Observation/cutoff time"
                          className="px-2 py-1 bg-white border border-slate-300 rounded-xs text-xs font-mono"
                        />
                        <input
                          type="text"
                          value={manualObsTz}
                          onChange={(e) => setManualObsTz(e.target.value)}
                          placeholder="Time zone (PST / UTC)"
                          className="px-2 py-1 bg-white border border-slate-300 rounded-xs text-xs font-mono"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          className="px-3 py-1 rounded-xs bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                        >
                          Save Manual Candidate Finding
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualFormOpen(false)}
                          className="px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {extractionFeedback && (
                    <div
                      className={`border rounded-xs px-3 py-2 text-xs flex items-start gap-2 ${
                        extractionFeedback.kind === 'ok'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : extractionFeedback.kind === 'warn'
                            ? 'border-amber-300 bg-amber-50 text-amber-950'
                            : 'border-rose-200 bg-rose-50 text-rose-900'
                      }`}
                    >
                      {extractionFeedback.kind === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{extractionFeedback.message}</span>
                    </div>
                  )}
                </div>

                {/* Source Comparison & Conflict Clusters Drawer (Section H) */}
                {comparePanelOpen && (
                  <div className="border border-slate-300 rounded-xs bg-slate-50 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <GitCompare className="w-4 h-4 text-[#005a94]" />
                        <span>
                          Cross-Source Comparison &amp; Conflict Matrix ({comparisonResult.clusters.length} group(s))
                        </span>
                      </div>
                      <span className="text-[10.5px] font-mono text-slate-600">
                        Never auto-resolves or declares newer versions correct
                      </span>
                    </div>

                    {comparisonResult.clusters.length === 0 ? (
                      <div className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-xs p-2.5">
                        No cross-source conflicts, scale differences, cutoff spreads, or duplicate clusters detected among active matching findings.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {comparisonResult.clusters.map((cl) => (
                          <div
                            key={cl.conflictGroupId}
                            className="bg-white border border-slate-200 rounded-xs p-2.5 space-y-1 text-[11px]"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 border rounded-xs ${
                                  cl.kind === 'duplicate-finding'
                                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                                    : cl.kind === 'magnitude-scale-difference' ||
                                        cl.kind === 'aftershock-cutoff-difference' ||
                                        cl.kind === 'catalog-scope-difference' ||
                                        cl.kind === 'measurement-type-difference'
                                      ? 'bg-sky-50 text-sky-900 border-sky-200'
                                      : 'bg-amber-50 text-amber-950 border-amber-300'
                                }`}
                              >
                                {R2_CONFLICT_KIND_LABELS[cl.kind]}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500">
                                {R2_CATEGORY_LABELS[cl.category]} · {cl.sourceIds.length} source(s) · {cl.findingIds.length} finding(s)
                              </span>
                            </div>
                            <div className="text-slate-800">{cl.summary}</div>
                            <div className="text-[10.5px] text-slate-500 italic">
                              {cl.neverAutoResolveNote}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Findings Filter & R3 Eligibility Bucket Strip */}
                <div className="bg-slate-50 border border-slate-200 rounded-xs px-3 py-2 space-y-2 text-[11px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-700">Category Filter:</span>
                      <select
                        value={categoryFilter}
                        onChange={(e) =>
                          setCategoryFilter(e.target.value as R2FindingCategory | 'all')
                        }
                        className="px-2 py-1 bg-white border border-slate-300 rounded-xs text-[11px]"
                      >
                        <option value="all">All Categories ({findings.length})</option>
                        {R2_FINDING_CATEGORIES.map((c) => {
                          const cnt = findings.filter((f) => f.category === c).length;
                          if (cnt === 0) return null;
                          return (
                            <option key={c} value={c}>
                              {R2_CATEGORY_LABELS[c]} ({cnt})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={showSupersededFindings}
                          onChange={(e) => setShowSupersededFindings(e.target.checked)}
                        />
                        <span>Show Superseded Runs</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={showHiddenFindings}
                          onChange={(e) => setShowHiddenFindings(e.target.checked)}
                        />
                        <span>Show Excluded/Irrelevant</span>
                      </label>
                    </div>
                  </div>

                  {/* R3 Eligibility Status Buckets & History Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-200">
                    <div className="flex flex-wrap items-center gap-1">
                      {(
                        [
                          { id: 'all', label: `All (${findings.length})` },
                          { id: 'eligible', label: `Eligible (${bucketCounts.eligible})` },
                          { id: 'blocked', label: `Blocked (${bucketCounts.blocked})` },
                          {
                            id: 'already-applied',
                            label: `Applied (${bucketCounts['already-applied']})`,
                          },
                          {
                            id: 'superseded',
                            label: `Superseded (${bucketCounts.superseded})`,
                          },
                          { id: 'rejected', label: `Rejected (${bucketCounts.rejected})` },
                          {
                            id: 'no-supported-destination',
                            label: `Unsupported (${bucketCounts['no-supported-destination']})`,
                          },
                          { id: 'history', label: `R3 History (${auditRecords.length})` },
                        ] as const
                      ).map((bucket) => (
                        <button
                          key={bucket.id}
                          type="button"
                          onClick={() => setStatusBucketFilter(bucket.id)}
                          className={`px-2 py-1 rounded-xs border text-[10.5px] font-mono whitespace-nowrap shrink-0 cursor-pointer ${
                            statusBucketFilter === bucket.id
                              ? 'bg-[#005a94] text-white border-[#005a94] font-semibold'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {bucket.label}
                        </button>
                      ))}
                    </div>

                    {auditRecords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleExportTransferHistoryJson()}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Export R3 History JSON</span>
                      </button>
                    )}
                  </div>
                </div>

                {transferFeedback && (
                  <div
                    className={`border rounded-xs px-3 py-2 text-xs flex items-start gap-2 ${
                      transferFeedback.kind === 'ok'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : transferFeedback.kind === 'warn'
                          ? 'border-amber-300 bg-amber-50 text-amber-950'
                          : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    {transferFeedback.kind === 'ok' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{transferFeedback.message}</span>
                  </div>
                )}

                {/* R3 Explicit Before/After Transfer Review & Confirmation Drawer */}
                {reviewingFinding && reviewPreview && !readOnly && (
                  <div className="border border-[#005a94] rounded-xs bg-white p-3 space-y-2.5 text-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <ArrowRightLeft className="w-4 h-4 text-[#005a94]" />
                        <span>
                          R3 Operator Transfer Review · {reviewingFinding.findingTitle}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReviewingFindingId(null)}
                        className="px-2 py-0.5 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Close Review
                      </button>
                    </div>

                    <div className="border border-amber-300 bg-amber-50/70 rounded-xs px-2.5 py-1.5 text-amber-950 font-medium">
                      {R3_TRANSFER_APPROVAL_DISCLAIMER}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div className="border border-slate-200 bg-slate-50 rounded-xs p-2 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Current Destination ({reviewPreview.destinationFieldPath ?? 'N/A'})
                        </div>
                        <div className="text-slate-800">{reviewPreview.currentFieldSummary}</div>
                        <div className="font-mono text-[10px] text-slate-600">
                          State: {reviewPreview.currentStage4State} · Section Edited:{' '}
                          {reviewPreview.targetSectionIsEdited ? 'YES (Protected)' : 'No'}
                        </div>
                      </div>

                      <div className="border border-sky-200 bg-sky-50/50 rounded-xs p-2 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#005a94]">
                          Proposed Stage 4 Update ({reviewPreview.destinationLabel})
                        </div>
                        <div className="text-slate-900">{reviewPreview.proposedFieldSummary}</div>
                        <div className="font-mono text-[10px] text-slate-700">
                          Provenance: {reviewPreview.provenanceSummary}
                        </div>
                      </div>
                    </div>

                    {reviewingFinding.evidencePassage && (
                      <blockquote className="border border-slate-200 bg-slate-50 rounded-xs p-2 font-mono text-[10.5px] text-slate-700 break-words">
                        <span className="font-sans font-bold text-[10px] uppercase tracking-wider text-slate-500 block">
                          Supporting Verbatim Passage · {reviewingFinding.evidenceLocator.label}
                        </span>
                        &ldquo;{reviewingFinding.evidencePassage}&rdquo;
                      </blockquote>
                    )}

                    <div className="text-[10.5px] text-slate-700 bg-slate-50 border border-slate-200 rounded-xs p-2 space-y-0.5">
                      <div className="font-bold text-slate-800">
                        Edited Section Protection &amp; Scientific Qualifications
                      </div>
                      <div>{reviewPreview.editedProtectionNote}</div>
                      {reviewPreview.scientificQualifications.map((q, i) => (
                        <div key={i} className="font-mono text-[10px] text-slate-600">
                          • {q}
                        </div>
                      ))}
                      {reviewPreview.conflictWarnings.map((w, i) => (
                        <div key={i} className="text-amber-950 font-semibold">
                          Warning: {w}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                          Collision / Existing Value Mode
                        </label>
                        <select
                          value={reviewResolutionMode}
                          onChange={(e) => {
                            setReviewResolutionMode(
                              e.target.value as R3CollisionResolutionMode
                            );
                            setReviewConfirmOverwrite(false);
                          }}
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-[11px]"
                        >
                          {reviewPreview.supportsAddSeparate && (
                            <option value="add-separate">Add Separate Observation</option>
                          )}
                          <option value="keep-existing">Keep Existing (Audit Only)</option>
                          <option value="replace-with-confirmation">
                            Replace with Explicit Confirmation
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                          Target Stage 4 Content State
                        </label>
                        <select
                          value={reviewAppliedState}
                          onChange={(e) => {
                            const val = e.target.value as
                              | 'preliminary-review'
                              | 'verified-fact';
                            setReviewAppliedState(val);
                            if (val !== 'verified-fact') {
                              setReviewConfirmVerifiedFact(false);
                            }
                          }}
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-[11px]"
                        >
                          <option value="preliminary-review">
                            Preliminary Review (Recommended)
                          </option>
                          <option
                            value="verified-fact"
                            disabled={!reviewPreview.allowedStates.includes('verified-fact')}
                          >
                            Verified Fact (Official Confirmed + Quote Verified Only)
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                          Local Operator Label (Unverified)
                        </label>
                        <input
                          type="text"
                          value={reviewOperatorLabel}
                          onChange={(e) => setReviewOperatorLabel(e.target.value)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs text-[11px] font-mono"
                        />
                      </div>
                    </div>

                    {!reviewPreview.eligibility.canClassifyAsVerifiedFact && (
                      <div className="text-[10.5px] text-slate-600">
                        Verified-Fact gate note:{' '}
                        {reviewPreview.eligibility.verifiedFactBlockReasons.join(' · ')}
                      </div>
                    )}

                    {reviewAppliedState === 'verified-fact' && (
                      <label className="flex items-start gap-2 cursor-pointer bg-amber-50 border border-amber-200 rounded-xs p-2 text-amber-950">
                        <input
                          type="checkbox"
                          checked={reviewConfirmVerifiedFact}
                          onChange={(e) =>
                            setReviewConfirmVerifiedFact(e.target.checked)
                          }
                          className="mt-0.5"
                        />
                        <span>
                          I confirm this finding meets official-agency provenance, confirmed-id-match, and verbatim quote requirements to be marked &ldquo;verified-fact&rdquo; in local draft Stage 4 fields (still NOT formal institutional sign-off).
                        </span>
                      </label>
                    )}

                    {reviewPreview.requiresOverwriteConfirmation &&
                      reviewResolutionMode === 'replace-with-confirmation' && (
                        <div className="border border-rose-200 bg-rose-50/60 rounded-xs p-2 space-y-1.5">
                          <label className="flex items-start gap-2 cursor-pointer text-rose-950 font-semibold">
                            <input
                              type="checkbox"
                              checked={reviewConfirmOverwrite}
                              onChange={(e) =>
                                setReviewConfirmOverwrite(e.target.checked)
                              }
                              className="mt-0.5"
                            />
                            <span>
                              Confirm replacing existing Stage 4 content (historical tsunami advisories are preserved inside notes rather than deleted).
                            </span>
                          </label>
                          <input
                            type="text"
                            value={reviewOverwriteReason}
                            onChange={(e) => setReviewOverwriteReason(e.target.value)}
                            placeholder="Mandatory replacement rationale (min 6 chars)..."
                            className="w-full px-2 py-1 bg-white border border-rose-300 rounded-xs text-[11px]"
                          />
                        </div>
                      )}

                    <label className="flex items-start gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-xs p-2 font-semibold text-slate-900">
                      <input
                        type="checkbox"
                        checked={reviewConfirmTransfer}
                        onChange={(e) => setReviewConfirmTransfer(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        I explicitly authorize transferring this candidate finding into my local PRIMER draft Stage 4 structures (PRIMER remains status: &ldquo;draft&rdquo;).
                      </span>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          transferBusy ||
                          !activePrimer ||
                          !reviewConfirmTransfer ||
                          (reviewAppliedState === 'verified-fact' &&
                            !reviewConfirmVerifiedFact) ||
                          (reviewPreview.requiresOverwriteConfirmation &&
                            reviewResolutionMode === 'replace-with-confirmation' &&
                            (!reviewConfirmOverwrite ||
                              reviewOverwriteReason.trim().length < 6))
                        }
                        onClick={() => void handleConfirmTransferToPrimer()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {reviewResolutionMode === 'keep-existing'
                            ? 'Confirm Keep Existing & Record Audit'
                            : 'Confirm Local Draft Transfer'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewingFindingId(null)}
                        className="px-2.5 py-1.5 rounded-xs border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* R3 Append-Only Audit History View */}
                {statusBucketFilter === 'history' ? (
                  <div className="border border-slate-200 rounded-xs bg-white p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900">
                        <History className="w-4 h-4 text-[#005a94]" />
                        <span>
                          R3 Local Operator Transfer Audit Log ({auditRecords.length})
                        </span>
                      </div>
                      <span className="font-mono text-[10.5px] text-slate-500">
                        Store: {transferDiagnostics?.dbName ?? 'eqp_primer_research_transfers_v1'} ({transferDiagnostics?.backend ?? 'indexeddb'})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xs px-2.5 py-1.5">
                      {R3_LOCAL_AUDIT_DISCLAIMER}
                    </div>
                    {auditRecords.length === 0 ? (
                      <div className="text-center text-xs text-slate-500 py-4">
                        No R3 transfer, rejection, event-match resolution, or section-sync events recorded for {event.id} yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {auditRecords.map((rec) => (
                          <div key={rec.auditId} className="py-2 space-y-1 text-[11px]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono font-bold text-slate-900">
                                {rec.action} · {rec.sourceTitle} (v{rec.sourceVersionNumber})
                              </span>
                              <span className="font-mono tabular-nums text-[10px] text-slate-500">
                                {new Date(rec.recordedAtUtc).toLocaleString()} · {rec.operatorLabel} [{rec.identityStatus}]
                              </span>
                            </div>
                            <div className="text-slate-700">{rec.notes}</div>
                            {(rec.priorValueSummary || rec.newValueSummary) && (
                              <div className="font-mono text-[10px] text-slate-600">
                                {rec.priorValueSummary ? `Prior: ${rec.priorValueSummary} · ` : ''}
                                {rec.newValueSummary ? `Updated: ${rec.newValueSummary}` : ''}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : displayedFindings.length === 0 ? (
                  <div className="border border-slate-200 rounded-xs p-6 text-center text-xs text-slate-500">
                    No candidate scientific findings preserved for {event.id} matching the current filter. Select preserved source(s) above and run Deterministic or Gemini extraction.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {R2_FINDING_CATEGORIES.map((cat) => {
                      const items = displayedFindings.filter((f) => f.category === cat);
                      if (items.length === 0) return null;
                      return (
                        <div
                          key={cat}
                          className="border border-slate-200 rounded-xs bg-white overflow-hidden"
                        >
                          <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 text-[11.5px]">
                              {R2_CATEGORY_LABELS[cat]}
                            </span>
                            <span className="font-mono text-[10.5px] text-slate-600">
                              {items.length} item{items.length === 1 ? '' : 's'}
                            </span>
                          </div>

                          <div className="divide-y divide-slate-200">
                            {items.map((f) => {
                              const elig = eligibilityByFindingId[f.findingId];
                              const needsMatchResolution = Boolean(
                                elig?.blockers.some((b) => b.code === 'event-match-unresolved')
                              );
                              return (
                                <div
                                  key={f.findingId}
                                  className={`p-2.5 space-y-1.5 ${
                                    f.excludedByNonMatchingEvent
                                      ? 'bg-rose-50/40'
                                      : f.supersededByRunId
                                        ? 'bg-slate-50/70 opacity-80'
                                        : f.relevanceStatus !== 'active'
                                          ? 'bg-slate-50/50 opacity-75'
                                          : 'bg-white'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1 space-y-1">
                                      {/* Clean Monospace Status Line */}
                                      <div className="text-[10.5px] font-mono tabular-nums text-slate-600">
                                        {EVIDENCE_VALIDATION_LABELS[f.evidenceValidationStatus]} ·{' '}
                                        {f.epistemicBasis} · {f.extractionMethod}
                                        {f.modelUsed ? ` (${f.modelUsed})` : ''} v
                                        {f.extractionRunVersion} ·{' '}
                                        {EVENT_MATCH_STATE_LABELS[f.eventMatchState]}
                                        {f.excludedByNonMatchingEvent ? ' (Excluded)' : ''}
                                        {f.conflictKind
                                          ? ` · ${R2_CONFLICT_KIND_LABELS[f.conflictKind]}`
                                          : ''}
                                        {f.supersededByRunId ? ' · Superseded' : ''}
                                        {f.relevanceStatus !== 'active'
                                          ? ` · Flagged: ${f.relevanceStatus}`
                                          : ''}
                                      </div>

                                      {/* Title & Extracted Statement */}
                                      <div className="font-bold text-slate-900 text-xs">
                                        {f.findingTitle}
                                      </div>
                                      <div className="text-[11.5px] text-slate-800">
                                        {f.extractedStatement}
                                      </div>

                                      {/* Structured Values / Timing */}
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] font-mono text-slate-600">
                                        <span>
                                          Source: <strong>{f.sourceTitle}</strong> ({f.sourceOrganization}, v{f.sourceVersionNumber})
                                        </span>
                                        {f.originalValue && (
                                          <span>
                                            Raw: <strong>{f.originalValue}</strong>{' '}
                                            {f.originalUnits ?? ''}
                                          </span>
                                        )}
                                        {f.normalizedValue !== null && (
                                          <span>
                                            Norm: {f.normalizedValue} {f.normalizedUnits ?? ''}
                                          </span>
                                        )}
                                        {f.observationTimeRaw && (
                                          <span>
                                            Obs/Cutoff: {f.observationTimeRaw}{' '}
                                            {f.observationTimeZone ?? ''}
                                          </span>
                                        )}
                                      </div>

                                      {/* Verbatim Evidence Passage & Locator */}
                                      {f.evidencePassage && (
                                        <blockquote className="border border-slate-200 px-2.5 py-1 bg-slate-50/70 text-[11px] font-mono text-slate-700 break-words rounded-xs">
                                          <span className="text-[10px] uppercase tracking-wider font-sans font-bold text-slate-500 block">
                                            Supporting Evidence Passage · {f.evidenceLocator.label}
                                          </span>
                                          &ldquo;{f.evidencePassage}&rdquo;
                                        </blockquote>
                                      )}

                                      {f.conflictSummary && (
                                        <div className="text-[10.5px] text-amber-950 bg-amber-50/70 border border-amber-200 rounded-xs px-2 py-1">
                                          {f.conflictSummary}
                                        </div>
                                      )}

                                      {/* R3 Eligibility & Destination Summary */}
                                      {elig && (
                                        <div className="border border-slate-200 bg-slate-50/70 rounded-xs px-2 py-1.5 text-[10.5px] space-y-0.5">
                                          <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                                            <span
                                              className={`font-semibold ${
                                                elig.statusBucket === 'eligible'
                                                  ? 'text-emerald-800'
                                                  : elig.statusBucket === 'already-applied'
                                                    ? 'text-[#005a94]'
                                                    : elig.statusBucket === 'blocked'
                                                      ? 'text-rose-800'
                                                      : 'text-slate-700'
                                              }`}
                                            >
                                              R3 Status: {elig.statusBucket.toUpperCase()}
                                            </span>
                                            <span className="text-slate-600">
                                              {elig.mapping.supported
                                                ? elig.mapping.destinationLabel
                                                : NO_SUPPORTED_DIRECT_TRANSFER_LABEL}
                                            </span>
                                          </div>
                                          {elig.blockers.map((b, bi) => (
                                            <div key={bi} className="text-rose-900">
                                              Blocker ({b.criterion}): {b.message}
                                            </div>
                                          ))}
                                          {elig.warnings.map((w, wi) => (
                                            <div key={wi} className="text-amber-950">
                                              Note: {w.message}
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {/* Inline Event-Match Resolution Form */}
                                      {resolvingSourceId === f.sourceId && !readOnly && (
                                        <div className="border border-amber-300 bg-amber-50/70 rounded-xs p-2 space-y-1.5 text-[11px]">
                                          <div className="font-bold text-amber-950">
                                            Document Event-Match Resolution for &ldquo;{f.sourceTitle}&rdquo;
                                          </div>
                                          <input
                                            type="text"
                                            value={resolveRationale}
                                            onChange={(e) => setResolveRationale(e.target.value)}
                                            placeholder="Documented rationale linking source to active earthquake..."
                                            className="w-full px-2 py-1 bg-white border border-amber-300 rounded-xs text-[11px]"
                                          />
                                          <input
                                            type="text"
                                            value={resolveEvidence}
                                            onChange={(e) => setResolveEvidence(e.target.value)}
                                            placeholder="Supporting verbatim evidence / locator..."
                                            className="w-full px-2 py-1 bg-white border border-amber-300 rounded-xs text-[11px] font-mono"
                                          />
                                          <div className="flex flex-wrap items-center gap-2">
                                            <input
                                              type="text"
                                              value={resolveOperatorLabel}
                                              onChange={(e) =>
                                                setResolveOperatorLabel(e.target.value)
                                              }
                                              placeholder="Local Operator Label"
                                              className="px-2 py-1 bg-white border border-amber-300 rounded-xs text-[11px] font-mono"
                                            />
                                            <button
                                              type="button"
                                              disabled={
                                                transferBusy ||
                                                !resolveRationale.trim() ||
                                                !resolveEvidence.trim()
                                              }
                                              onClick={() =>
                                                void handleConfirmResolveEventMatch(f.sourceId)
                                              }
                                              className="px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                                            >
                                              Save Event-Match Resolution
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setResolvingSourceId(null)}
                                              className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Inline Reject Finding Form */}
                                      {rejectingFindingId === f.findingId && !readOnly && (
                                        <div className="border border-rose-200 bg-rose-50/60 rounded-xs p-2 space-y-1.5 text-[11px]">
                                          <div className="font-bold text-rose-950">
                                            Reject Candidate Transfer (Source Remains in Library)
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <input
                                              type="text"
                                              value={rejectReason}
                                              onChange={(e) => setRejectReason(e.target.value)}
                                              placeholder="Optional rejection rationale..."
                                              className="flex-1 min-w-[200px] px-2 py-1 bg-white border border-rose-300 rounded-xs text-[11px]"
                                            />
                                            <button
                                              type="button"
                                              disabled={transferBusy}
                                              onClick={() => void handleConfirmRejectFinding(f)}
                                              className="px-2.5 py-1 rounded-xs bg-rose-700 text-white text-[11px] font-semibold hover:bg-rose-800 whitespace-nowrap shrink-0 cursor-pointer"
                                            >
                                              Confirm Reject
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setRejectingFindingId(null)}
                                              className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Action Controls */}
                                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSourceFromFinding(f.sourceId)}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-[#005a94] hover:bg-sky-50 whitespace-nowrap shrink-0 cursor-pointer"
                                      >
                                        <BookOpen className="w-3 h-3" />
                                        <span>Open Source</span>
                                      </button>

                                      {elig?.duplicateAlreadyApplied &&
                                        elig.mapping.targetSectionId &&
                                        onJumpToPrimerSection && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onJumpToPrimerSection(elig.mapping.targetSectionId)
                                            }
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-[#005a94] bg-sky-50 text-[11px] font-semibold text-[#005a94] hover:bg-sky-100 whitespace-nowrap shrink-0 cursor-pointer"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                            <span>Open Section</span>
                                          </button>
                                        )}

                                      {!readOnly && needsMatchResolution && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setResolvingSourceId(f.sourceId);
                                            setResolveRationale('');
                                            setResolveEvidence('');
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-amber-400 bg-amber-50 text-[11px] font-semibold text-amber-950 hover:bg-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
                                        >
                                          <ShieldAlert className="w-3 h-3" />
                                          <span>Resolve Event Match</span>
                                        </button>
                                      )}

                                      {!readOnly && elig?.eligible && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenReviewTransfer(f)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-[#005a94] bg-[#005a94] text-[11px] font-semibold text-white hover:bg-[#004877] whitespace-nowrap shrink-0 cursor-pointer"
                                          >
                                            <ArrowRightLeft className="w-3 h-3" />
                                            <span>Review Transfer</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setRejectingFindingId(f.findingId);
                                              setRejectReason('');
                                            }}
                                            className="px-2 py-1 rounded-xs border border-rose-300 bg-white text-[11px] font-semibold text-rose-800 hover:bg-rose-50 whitespace-nowrap shrink-0 cursor-pointer"
                                          >
                                            Reject
                                          </button>
                                        </>
                                      )}

                                      {!readOnly && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleSetFindingRelevance(
                                                f.findingId,
                                                f.relevanceStatus === 'irrelevant'
                                                  ? 'active'
                                                  : 'irrelevant'
                                              )
                                            }
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-xs border text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                                              f.relevanceStatus === 'irrelevant'
                                                ? 'bg-slate-700 text-white border-slate-800'
                                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                            }`}
                                            title="Exclude irrelevant candidate finding"
                                          >
                                            <Ban className="w-3 h-3" />
                                            <span>
                                              {f.relevanceStatus === 'irrelevant'
                                                ? 'Restore'
                                                : 'Exclude'}
                                            </span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleSetFindingRelevance(
                                                f.findingId,
                                                f.relevanceStatus === 'insufficient-evidence'
                                                  ? 'active'
                                                  : 'insufficient-evidence'
                                              )
                                            }
                                            className={`px-2 py-1 rounded-xs border text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                                              f.relevanceStatus === 'insufficient-evidence'
                                                ? 'bg-amber-700 text-white border-amber-800'
                                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                            }`}
                                          >
                                            Flag Insufficient
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
