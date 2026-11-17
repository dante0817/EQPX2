import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Compass,
  Download,
  FolderOpen,
  Globe,
  Layers,
  MapPin,
  Radar,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Square,
  Trash2,
  TrendingDown,
  Upload,
} from 'lucide-react';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import {
  loadActiveFaultsDataset,
  loadTrenchSystemsDataset,
  type ActiveFaultsDataset,
  type TrenchSystemsDataset,
} from '../utils/geologyLayers';
import {
  exportStressReadyMechanismDataset,
  type FilteredHistoricalEvent,
  type HistoricalCatalogPayload,
  type HistoricalEarthquakeRecord,
} from '../utils/historicalSeismicity';
import {
  assembleEarthquakeSequence,
  buildSequenceInputFingerprint,
  buildSequenceQualityReport,
  computeConditionalOmoriDecay,
  computeMagnitudeFrequencyAnalysis,
  computeTimelineRateSummary,
  DEFAULT_SEQUENCE_FILTERS,
  exportSequenceEventsCsv,
  exportSequenceGeoJson,
  exportSequenceInvestigationJson,
  getActiveEventMagnitude,
  parseSequenceInvestigationJson,
  SavedSequenceInvestigation,
  SEQUENCE_METHOD_VERSION,
  SequenceCandidateEvent,
  SequenceEventRole,
  SequenceFilterConfig,
  SequenceMcMethod,
  SequenceSectionId,
} from '../utils/earthquakeSequence';
import { triggerTextDownload } from './HistoricalBeachballIcon';
import {
  SequenceMagnitudePanel,
  SequenceSpatialPanel,
  SequenceTimelinePanel,
} from './EarthquakeSequenceSubPanels';

interface EarthquakeSequencePanelProps {
  event: EQPEvent;
  onNotice?: (msg: string) => void;
  onOpenHistoricalSeismicity?: () => void;
  onOpenFocalMechanism?: () => void;
  onOpenRegionalStress?: () => void;
}

const ROLE_OPTIONS: SequenceEventRole[] = [
  'Unclassified',
  'Candidate Mainshock',
  'Candidate Foreshock',
  'Candidate Aftershock',
  'Candidate Swarm/Cluster',
  'Reference Event',
];

const SECTION_TABS: Array<{ id: SequenceSectionId; label: string; icon: React.ReactNode }> = [
  { id: 'identify', label: 'A. Sequence Identification', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'timeline', label: 'B. Timeline & Seismicity Rate', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'spatial', label: 'C. Spatial & Depth Analysis', icon: <MapPin className="w-3.5 h-3.5" /> },
  { id: 'magnitude', label: 'D. Magnitude–Frequency Analysis', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'decay', label: 'E. Sequence Decay & Quality', icon: <TrendingDown className="w-3.5 h-3.5" /> },
];

export const EarthquakeSequencePanel: React.FC<EarthquakeSequencePanelProps> = ({
  event,
  onNotice,
  onOpenHistoricalSeismicity,
  onOpenFocalMechanism,
  onOpenRegionalStress,
}) => {
  const unlocated = isEventUnlocated(event);
  const activeMag = useMemo(() => getActiveEventMagnitude(event), [event]);

  // Active internal section tab
  const [activeSection, setActiveSection] = useState<SequenceSectionId>('identify');

  // Historical catalog state (single read-only catalog source)
  const [catalog, setCatalog] = useState<HistoricalEarthquakeRecord[]>([]);
  const [catalogVersion, setCatalogVersion] = useState<number>(1);
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState<string>('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Verified GIS layers (lazy read-only)
  const [activeFaultsDataset, setActiveFaultsDataset] = useState<ActiveFaultsDataset | null>(null);
  const [trenchSystemsDataset, setTrenchSystemsDataset] = useState<TrenchSystemsDataset | null>(null);

  // Saved sequence investigations state
  const [savedInvestigations, setSavedInvestigations] = useState<SavedSequenceInvestigation[]>([]);
  const [investigationName, setInvestigationName] = useState<string>(
    () => `SEQ-${event.filename.replace(/\.eqp$/i, '')}`
  );
  const [investigationNotes, setInvestigationNotes] = useState<string>('');
  const [loadedInvestigationId, setLoadedInvestigationId] = useState<string | null>(null);
  const [loadedFingerprint, setLoadedFingerprint] = useState<string | null>(null);
  const [loadedRefEventId, setLoadedRefEventId] = useState<string | null>(null);
  const [isSavingInv, setIsSavingInv] = useState<boolean>(false);
  const invImportInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronized Sequence Parameters & Selections
  const [filters, setFilters] = useState<SequenceFilterConfig>(DEFAULT_SEQUENCE_FILTERS);
  const [candidateMainshockId, setCandidateMainshockId] = useState<string | null>(null);
  const [manualIncludedIds, setManualIncludedIds] = useState<Set<string>>(new Set());
  const [manualExcludedIds, setManualExcludedIds] = useState<Set<string>>(new Set());
  const [manualRoles, setManualRoles] = useState<Record<string, SequenceEventRole>>({});
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // Magnitude-Frequency state (Section D)
  const [selectedMagType, setSelectedMagType] = useState<string>('');
  const [mcMethod, setMcMethod] = useState<SequenceMcMethod>('maxc');
  const [manualMc, setManualMc] = useState<number>(3.0);
  const [mfdBinWidth, setMfdBinWidth] = useState<number>(0.1);

  // Omori-Utsu Decay state (Section E)
  const [omoriFitStartDays, setOmoriFitStartDays] = useState<number>(0.05);
  const [omoriFitEndDays, setOmoriFitEndDays] = useState<number>(60);
  const [omoriMc, setOmoriMc] = useState<number>(3.0);
  const [omoriMcSyncedToMfd, setOmoriMcSyncedToMfd] = useState<boolean>(true);

  // Table filter & sorting in Section A
  const [tableShowMode, setTableShowMode] = useState<'selected' | 'all' | 'excluded'>('all');
  const [sortCol, setSortCol] = useState<'time' | 'mag' | 'depth' | 'dist'>('time');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const loadCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);
    setCatalogError(null);
    try {
      const resp = await fetch('/api/research/historical-catalog');
      const data = (await resp.json()) as HistoricalCatalogPayload & {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setCatalog(Array.isArray(data.events) ? data.events : []);
      setCatalogVersion(data.catalogVersion ?? 1);
      setCatalogUpdatedAt(data.updatedAt ?? '');
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Unable to load historical catalog.');
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  const loadSavedInvestigations = useCallback(async () => {
    try {
      const resp = await fetch('/api/research/sequence-investigations');
      const data = await resp.json();
      if (resp.ok && data.ok !== false && Array.isArray(data.investigations)) {
        setSavedInvestigations(data.investigations);
      }
    } catch {
      // Non-blocking fallback
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadSavedInvestigations();
    void loadActiveFaultsDataset().then(setActiveFaultsDataset).catch(() => null);
    void loadTrenchSystemsDataset().then(setTrenchSystemsDataset).catch(() => null);
  }, [loadCatalog, loadSavedInvestigations]);

  // Distinct magnitude types & data sources in catalog
  const availableMagTypes = useMemo(() => {
    const s = new Set<string>();
    catalog.forEach((e) => s.add(e.magnitudeType || 'Unknown'));
    return Array.from(s).sort();
  }, [catalog]);

  const availableSources = useMemo(() => {
    const s = new Set<string>();
    catalog.forEach((e) => s.add(e.dataSource));
    return Array.from(s).sort();
  }, [catalog]);

  // ES1 Assembly
  const assembly = useMemo(
    () =>
      assembleEarthquakeSequence({
        catalog,
        activeEvent: event,
        filters,
        candidateMainshockId,
        manualIncludedIds,
        manualExcludedIds,
        manualRoles,
      }),
    [catalog, event, filters, candidateMainshockId, manualIncludedIds, manualExcludedIds, manualRoles]
  );

  // ES2 Timeline & Rate Summary
  const timeline = useMemo(
    () =>
      computeTimelineRateSummary({
        selectedEvents: assembly.selectedEvents,
        referenceTimeMs: assembly.referenceTimeMs,
        filters,
      }),
    [assembly.selectedEvents, assembly.referenceTimeMs, filters]
  );

  // ES3 Magnitude-Frequency Analysis (strictly single-scale)
  const mfd = useMemo(
    () =>
      computeMagnitudeFrequencyAnalysis({
        selectedEvents: assembly.selectedEvents,
        selectedMagType,
        mcMethod,
        manualMc,
        binWidth: mfdBinWidth,
      }),
    [assembly.selectedEvents, selectedMagType, mcMethod, manualMc, mfdBinWidth]
  );

  const effectiveOmoriMc = useMemo(() => {
    if (omoriMcSyncedToMfd && mfd.mcValue !== null) return mfd.mcValue;
    return omoriMc;
  }, [omoriMcSyncedToMfd, mfd.mcValue, omoriMc]);

  // ES3 Conditional Omori-Utsu Decay
  const omori = useMemo(
    () =>
      computeConditionalOmoriDecay({
        selectedEvents: assembly.selectedEvents,
        characterization: assembly.characterization,
        referenceTimeMs: assembly.referenceTimeMs,
        candidateMainshockTimeMs: assembly.candidateMainshockTimeMs,
        fitStartDays: omoriFitStartDays,
        fitEndDays: omoriFitEndDays,
        mcThreshold: effectiveOmoriMc,
        magTypeFilter: mfd.selectedMagType,
      }),
    [
      assembly.selectedEvents,
      assembly.characterization,
      assembly.referenceTimeMs,
      assembly.candidateMainshockTimeMs,
      omoriFitStartDays,
      omoriFitEndDays,
      effectiveOmoriMc,
      mfd.selectedMagType,
    ]
  );

  // ES3 Holistic Quality Assessment
  const quality = useMemo(
    () =>
      buildSequenceQualityReport({
        assembly,
        timeline,
        mfd,
        omori,
      }),
    [assembly, timeline, mfd, omori]
  );

  const currentFingerprint = useMemo(
    () =>
      buildSequenceInputFingerprint({
        event,
        catalogVersion,
        catalogCount: catalog.length,
        candidateMainshockId,
        filters,
        manualIncludedIds,
        manualExcludedIds,
        manualRoles,
        selectedMagType: mfd.selectedMagType ?? selectedMagType,
        mcMethod,
        manualMc,
        omoriFitStartDays,
        omoriFitEndDays,
        omoriMc: effectiveOmoriMc,
      }),
    [
      event,
      catalogVersion,
      catalog.length,
      candidateMainshockId,
      filters,
      manualIncludedIds,
      manualExcludedIds,
      manualRoles,
      mfd.selectedMagType,
      selectedMagType,
      mcMethod,
      manualMc,
      omoriFitStartDays,
      omoriFitEndDays,
      effectiveOmoriMc,
    ]
  );

  const isStaleSinceLoad = Boolean(
    loadedFingerprint && loadedFingerprint !== currentFingerprint
  );

  const candidateMainshockRecord = useMemo(
    () =>
      candidateMainshockId
        ? assembly.events.find((e) => e.record.id === candidateMainshockId) ?? null
        : null,
    [assembly.events, candidateMainshockId]
  );

  const largestEligibleEvent = useMemo(
    () =>
      assembly.largestEligibleId
        ? assembly.events.find((e) => e.record.id === assembly.largestEligibleId) ?? null
        : null,
    [assembly.events, assembly.largestEligibleId]
  );

  // Handlers for manual membership & role curation
  const toggleIncludeEvent = (row: SequenceCandidateEvent) => {
    const id = row.record.id;
    if (row.included) {
      setManualExcludedIds((prev) => new Set(prev).add(id));
      setManualIncludedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setManualExcludedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setManualIncludedIds((prev) => new Set(prev).add(id));
    }
  };

  const handleSetManualRole = (recordId: string, role: SequenceEventRole) => {
    if (role === 'Candidate Mainshock') {
      setCandidateMainshockId(recordId);
      setManualExcludedIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
      setManualIncludedIds((prev) => new Set(prev).add(recordId));
    } else if (candidateMainshockId === recordId) {
      setCandidateMainshockId(null);
    }
    setManualRoles((prev) => ({ ...prev, [recordId]: role }));
  };

  const handleNominateMainshock = (recordId: string | null) => {
    setCandidateMainshockId(recordId);
    if (recordId) {
      setManualExcludedIds((prev) => {
        const next = new Set(prev);
        next.delete(recordId);
        return next;
      });
      setManualIncludedIds((prev) => new Set(prev).add(recordId));
      setManualRoles((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v === 'Candidate Mainshock' && k !== recordId) delete next[k];
        }
        next[recordId] = 'Candidate Mainshock';
        return next;
      });
    }
  };

  const handleResetWorkspace = () => {
    setFilters(DEFAULT_SEQUENCE_FILTERS);
    setCandidateMainshockId(null);
    setManualIncludedIds(new Set());
    setManualExcludedIds(new Set());
    setManualRoles({});
    setInvestigationNotes('');
    setLoadedInvestigationId(null);
    setLoadedFingerprint(null);
    setLoadedRefEventId(null);
    onNotice?.('Reset Earthquake Sequence filters and manual annotations.');
  };

  const handleSaveInvestigation = async (saveAsNew = false) => {
    const trimmed = investigationName.trim();
    if (!trimmed) {
      onNotice?.('Enter an investigation name before saving.');
      return;
    }
    setIsSavingInv(true);
    try {
      const payload: Partial<SavedSequenceInvestigation> = {
        id: !saveAsNew && loadedInvestigationId ? loadedInvestigationId : undefined,
        name: trimmed,
        notes: investigationNotes.trim(),
        referenceEventId: event.id,
        acceptedSolutionIterations: event.iterations,
        candidateMainshockId,
        includedEventIds: Array.from(manualIncludedIds),
        excludedEventIds: Array.from(manualExcludedIds),
        manualRoles,
        filters,
        mcMethod,
        manualMc,
        selectedMagType: mfd.selectedMagType ?? selectedMagType,
        omoriFitStartDays,
        omoriFitEndDays,
        omoriMc: effectiveOmoriMc,
        catalogVersion,
        analysisMethodVersion: SEQUENCE_METHOD_VERSION,
        inputFingerprint: currentFingerprint,
        summarySnapshot: {
          selectedCount: assembly.selectedCount,
          characterization: assembly.characterization,
          bValue: mfd.bValue,
          mcValue: mfd.mcValue,
          omoriP: omori.pValue,
          overallStatus: quality.overallStatus,
        },
      };
      const resp = await fetch('/api/research/sequence-investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      if (Array.isArray(data.investigations)) {
        setSavedInvestigations(data.investigations);
      }
      if (data.saved?.id) {
        setLoadedInvestigationId(data.saved.id);
        setLoadedFingerprint(currentFingerprint);
        setLoadedRefEventId(event.id);
      }
      onNotice?.(
        `${saveAsNew ? 'Saved new' : 'Saved'} sequence investigation "${trimmed}"`
      );
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : 'Failed to save investigation.');
    } finally {
      setIsSavingInv(false);
    }
  };

  const handleLoadInvestigation = (inv: SavedSequenceInvestigation) => {
    setInvestigationName(inv.name);
    setInvestigationNotes(inv.notes ?? '');
    setLoadedInvestigationId(inv.id || null);
    setLoadedRefEventId(inv.referenceEventId || null);
    setFilters(inv.filters ?? DEFAULT_SEQUENCE_FILTERS);
    setCandidateMainshockId(inv.candidateMainshockId ?? null);
    setManualIncludedIds(new Set(inv.includedEventIds ?? []));
    setManualExcludedIds(new Set(inv.excludedEventIds ?? []));
    setManualRoles(inv.manualRoles ?? {});
    setMcMethod(inv.mcMethod ?? 'maxc');
    setManualMc(inv.manualMc ?? 3.0);
    setSelectedMagType(inv.selectedMagType ?? '');
    setOmoriFitStartDays(inv.omoriFitStartDays ?? 0.05);
    setOmoriFitEndDays(inv.omoriFitEndDays ?? 60);
    setOmoriMc(inv.omoriMc ?? 3.0);
    setOmoriMcSyncedToMfd(false);
    setLoadedFingerprint(inv.inputFingerprint || null);
    onNotice?.(
      inv.referenceEventId && inv.referenceEventId !== event.id
        ? `Loaded "${inv.name}" (created for reference event ${inv.referenceEventId})`
        : `Loaded investigation "${inv.name}"`
    );
  };

  const handleExportInvestigationPackage = () => {
    const json = exportSequenceInvestigationJson({
      investigationName,
      notes: investigationNotes,
      activeEvent: event,
      filters,
      assembly,
      timeline,
      mfd,
      omori,
      quality,
      catalogVersion,
      inputFingerprint: currentFingerprint,
      includedEventIds: Array.from(manualIncludedIds),
      excludedEventIds: Array.from(manualExcludedIds),
      manualRoles,
      mcMethod,
      manualMc,
      omoriFitStartDays,
      omoriFitEndDays,
      omoriMc: effectiveOmoriMc,
    });
    const fname = `${investigationName.trim() || 'sequence'}_investigation.json`;
    triggerTextDownload(fname, json, 'application/json;charset=utf-8');
    onNotice?.(`Exported ${fname}`);
  };

  const handleImportInvestigationFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedInv = parseSequenceInvestigationJson(text);
      handleLoadInvestigation(parsedInv);
    } catch (err) {
      onNotice?.(
        err instanceof Error ? err.message : 'Failed to parse sequence investigation JSON.'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteInvestigation = async (id: string, name: string) => {
    try {
      const resp = await fetch(`/api/research/sequence-investigations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.investigations)) {
        setSavedInvestigations(data.investigations);
        if (loadedInvestigationId === id) {
          setLoadedInvestigationId(null);
          setLoadedFingerprint(null);
          setLoadedRefEventId(null);
        }
        onNotice?.(`Deleted investigation "${name}"`);
      }
    } catch {
      onNotice?.('Failed to delete sequence investigation.');
    }
  };

  // Filtered & sorted table rows for Section A
  const tableRows = useMemo(() => {
    const base = assembly.events.filter((row) => {
      if (tableShowMode === 'selected') return row.included;
      if (tableShowMode === 'excluded') return !row.included;
      return true;
    });
    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'time') cmp = a.record.originTimeMs - b.record.originTimeMs;
      else if (sortCol === 'dist') cmp = a.distanceKm - b.distanceKm;
      else if (sortCol === 'mag') cmp = (a.record.magnitude ?? -99) - (b.record.magnitude ?? -99);
      else if (sortCol === 'depth') cmp = (a.record.depthKm ?? 9999) - (b.record.depthKm ?? 9999);
      return sortAsc ? cmp : -cmp;
    });
  }, [assembly.events, tableShowMode, sortCol, sortAsc]);

  const toggleSort = (col: 'time' | 'mag' | 'depth' | 'dist') => {
    if (sortCol === col) setSortAsc((v) => !v);
    else {
      setSortCol(col);
      setSortAsc(col === 'time' || col === 'dist');
    }
  };

  const selectedWithMechanisms = useMemo(
    () => assembly.selectedEvents.filter((e) => e.record.focalMechanism !== null),
    [assembly.selectedEvents]
  );

  const handleExportStressReady = () => {
    if (selectedWithMechanisms.length === 0) {
      onNotice?.('No selected sequence events have focal mechanisms available to export.');
      return;
    }
    const filteredStyle: FilteredHistoricalEvent[] = selectedWithMechanisms.map((s) => ({
      record: s.record,
      distanceKm: s.distanceKm,
      azimuthDeg: s.azimuthDeg,
      dtHoursRelativeToActive: s.dtHoursFromReference,
      sequenceCandidate: 'Origin Window Candidate',
    }));
    const json = exportStressReadyMechanismDataset(filteredStyle, {
      activeEvent: event,
      catalogVersion,
    });
    const fname = `${investigationName.trim() || 'sequence'}_stress_ready_mechanisms.json`;
    triggerTextDownload(fname, json, 'application/json;charset=utf-8');
    onNotice?.(
      `Exported ${selectedWithMechanisms.length} focal mechanism(s) for Regional Stress Analysis`
    );
  };

  return (
    <div className="space-y-3 text-slate-900">
      {/* SHARED EVENT & SEQUENCE CONTEXT HEADER */}
      <section className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                Earthquake Sequence Analysis
              </h2>
              <span className="text-[11px] font-mono text-slate-600">
                Read-Only EQP Reference · {quality.overallStatus} · Catalog v{catalogVersion} ({catalog.length} records)
              </span>
            </div>

            {unlocated ? (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xs">
                Active EQP earthquake is unlocated. Locate or load an earthquake in the Data tab to anchor spatial-temporal sequence windows.
              </div>
            ) : (
              <div className="text-xs font-mono tabular-nums text-slate-700 leading-relaxed">
                Ref EQP: <strong className="text-slate-900">{event.filename}</strong> ({event.id}) · UTC{' '}
                {event.originDateGmt} {event.originTimeGmt} · {event.lat.toFixed(4)}°N,{' '}
                {event.lon.toFixed(4)}°E · Z={event.depthKm.toFixed(1)} km ·{' '}
                {activeMag.scale} {activeMag.mag !== null ? activeMag.mag.toFixed(1) : 'N/A'} ·{' '}
                Candidate Mainshock:{' '}
                <strong className="text-slate-900">
                  {candidateMainshockRecord
                    ? `${candidateMainshockRecord.record.eventId} (${candidateMainshockRecord.record.magnitudeType} ${
                        candidateMainshockRecord.record.magnitude?.toFixed(1) ?? 'N/A'
                      })`
                    : 'Not nominated (Ref is not assumed mainshock)'}
                </strong>
              </div>
            )}

            <div className="text-[11px] font-mono tabular-nums text-slate-600">
              Investigation: <strong className="text-slate-800">{investigationName}</strong> ·{' '}
              Characterization: <strong className="text-slate-800">{assembly.characterization}</strong> ·{' '}
              Filters: R={filters.radiusKm} km, −{filters.preDays}d / +{filters.postDays}d (bg −{filters.backgroundDays}d) ·{' '}
              Total {assembly.totalCatalogCount} · Eligible {assembly.eligibleCount} · Selected{' '}
              <strong className="text-blue-800">{assembly.selectedCount}</strong> · Excluded{' '}
              {assembly.excludedCount} · Duplicates {assembly.duplicateCount}
              {catalogUpdatedAt ? ` · Synced ${catalogUpdatedAt.slice(0, 16).replace('T', ' ')} UTC` : ''}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {onOpenHistoricalSeismicity && (
              <button
                type="button"
                onClick={onOpenHistoricalSeismicity}
                className="px-2 py-1 text-[11px] font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-xs inline-flex items-center gap-1"
                title="Manage historical earthquake imports or USGS queries in Historical Seismicity"
              >
                <Globe className="w-3.5 h-3.5 text-blue-700" />
                Catalog Manager
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadCatalog()}
              className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xs inline-flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCatalog ? 'animate-spin' : ''}`} />
              Reload Catalog
            </button>
            <button
              type="button"
              onClick={handleResetWorkspace}
              className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xs inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        {isStaleSinceLoad && (
          <div className="px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-xs flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>
                Inputs, reference event, filters, or catalog changed since this investigation snapshot was saved/loaded. Metrics reflect live inputs.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLoadedFingerprint(currentFingerprint)}
              className="px-2 py-0.5 bg-white border border-amber-400 rounded-xs font-semibold hover:bg-amber-100"
            >
              Acknowledge
            </button>
          </div>
        )}

        {catalogError && (
          <div className="px-2.5 py-1.5 bg-red-50 border border-red-300 rounded-xs text-xs text-red-800">
            {catalogError}
          </div>
        )}

        {!isLoadingCatalog && catalog.length === 0 && (
          <div className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xs flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <span>
              The shared Historical Seismicity catalog is currently empty. Import PHIVOLCS/ISC CSV/GeoJSON files or run a USGS query in the Historical Seismicity module first.
            </span>
            {onOpenHistoricalSeismicity && (
              <button
                type="button"
                onClick={onOpenHistoricalSeismicity}
                className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded-xs text-[11px] font-semibold"
              >
                Open Historical Seismicity
              </button>
            )}
          </div>
        )}

        {/* Five Compact Internal Section Tabs */}
        <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-slate-600/35">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border rounded transition-colors ${
                activeSection === tab.id
                  ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                  : 'bg-[#ccd6e5] text-slate-800 border-slate-500/60 hover:bg-[#e1e7f0]'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* SECTION A: SEQUENCE IDENTIFICATION */}
      {activeSection === 'identify' && (
        <div className="space-y-3">
          {/* Controls Grid */}
          <section className="bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
              {/* Spatial & Temporal Observation Windows */}
              <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <div className="font-bold text-slate-900 border-b border-amber-800/35 pb-1">
                  Spatial &amp; Observation Windows
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 block">Radius (km)</span>
                    <input
                      type="number"
                      min={1}
                      max={1500}
                      value={filters.radiusKm}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          radiusKm: Math.max(1, Number(e.target.value) || 100),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 block">Background (−d)</span>
                    <input
                      type="number"
                      min={1}
                      max={36500}
                      value={filters.backgroundDays}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          backgroundDays: Math.max(1, Number(e.target.value) || 365),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 block">Pre-Event (−d)</span>
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={filters.preDays}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          preDays: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 block">Post-Event (+d)</span>
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={filters.postDays}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          postDays: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                    />
                  </label>
                </div>
              </div>

              {/* Magnitude, Depth & Deduplication */}
              <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <div className="font-bold text-slate-900 border-b border-amber-800/35 pb-1">
                  Magnitude, Depth &amp; Deduplication
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Min Mag"
                    value={filters.minMag}
                    onChange={(e) => setFilters((f) => ({ ...f, minMag: e.target.value }))}
                    className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                  />
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Max Mag"
                    value={filters.maxMag}
                    onChange={(e) => setFilters((f) => ({ ...f, maxMag: e.target.value }))}
                    className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                  />
                  <input
                    type="number"
                    step="1"
                    placeholder="Min Z (km)"
                    value={filters.minDepthKm}
                    onChange={(e) => setFilters((f) => ({ ...f, minDepthKm: e.target.value }))}
                    className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                  />
                  <input
                    type="number"
                    step="1"
                    placeholder="Max Z (km)"
                    value={filters.maxDepthKm}
                    onChange={(e) => setFilters((f) => ({ ...f, maxDepthKm: e.target.value }))}
                    className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] pt-0.5">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.includeMissingDepth}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, includeMissingDepth: e.target.checked }))
                      }
                    />
                    Missing depth
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.excludeDuplicates}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, excludeDuplicates: e.target.checked }))
                      }
                    />
                    Exclude duplicates
                  </label>
                </div>
              </div>

              {/* Optional ST-DBSCAN Cluster Assist */}
              <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <div className="font-bold text-slate-900 border-b border-amber-800/35 pb-1 flex items-center justify-between">
                  <span>Cluster-Assisted Grouping</span>
                  <label className="inline-flex items-center gap-1 text-[11px] font-normal cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.enableClusterAssist}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, enableClusterAssist: e.target.checked }))
                      }
                    />
                    Enable ST-DBSCAN
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 block">Eps (km)</span>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      disabled={!filters.enableClusterAssist}
                      value={filters.clusterEpsKm}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          clusterEpsKm: Math.max(1, Number(e.target.value) || 25),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono disabled:bg-slate-100"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 block">Δt (h)</span>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      disabled={!filters.enableClusterAssist}
                      value={filters.clusterTimeHours}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          clusterTimeHours: Math.max(1, Number(e.target.value) || 72),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono disabled:bg-slate-100"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 block">MinPts</span>
                    <input
                      type="number"
                      min={2}
                      max={50}
                      disabled={!filters.enableClusterAssist}
                      value={filters.clusterMinPts}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          clusterMinPts: Math.max(2, Number(e.target.value) || 4),
                        }))
                      }
                      className="w-full border border-slate-300 rounded-xs px-1.5 py-1 font-mono disabled:bg-slate-100"
                    />
                  </label>
                </div>
                <div className="text-[10px] text-slate-500">
                  Detected clusters: {assembly.clusterCount}. Provisional research aid only.
                </div>
              </div>

              {/* Candidate Mainshock & Largest Eligible Event */}
              <div className="space-y-1.5 bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <div className="font-bold text-slate-900 border-b border-amber-800/35 pb-1">
                  Mainshock &amp; Largest Event
                </div>
                <div className="text-[11px] font-mono text-slate-700">
                  Largest Eligible:{' '}
                  {largestEligibleEvent ? (
                    <strong className="text-slate-900">
                      {largestEligibleEvent.record.eventId} ({largestEligibleEvent.record.magnitudeType}{' '}
                      {largestEligibleEvent.record.magnitude?.toFixed(1) ?? 'N/A'})
                    </strong>
                  ) : (
                    'None'
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {largestEligibleEvent && (
                    <button
                      type="button"
                      onClick={() => handleNominateMainshock(largestEligibleEvent.record.id)}
                      className="px-2 py-1 text-[11px] font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-xs"
                    >
                      Nominate Largest as Mainshock
                    </button>
                  )}
                  {candidateMainshockId && (
                    <button
                      type="button"
                      onClick={() => handleNominateMainshock(null)}
                      className="px-2 py-1 text-[11px] border border-slate-300 bg-white hover:bg-slate-50 rounded-xs"
                    >
                      Clear Mainshock
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">
                  Nearby earthquakes remain Unclassified unless clustered or explicitly nominated.
                </div>
              </div>
            </div>

            {/* Source & Scale Filter Strip */}
            {(availableMagTypes.length > 0 || availableSources.length > 0) && (
              <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 text-[11px]">
                {availableMagTypes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold text-slate-600">Mag Scale:</span>
                    {availableMagTypes.map((mt) => {
                      const active = filters.magTypes.includes(mt);
                      return (
                        <button
                          key={mt}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              magTypes: active
                                ? f.magTypes.filter((x) => x !== mt)
                                : [...f.magTypes, mt],
                            }))
                          }
                          className={`px-1.5 py-0.5 font-mono border rounded-xs ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {mt}
                        </button>
                      );
                    })}
                  </div>
                )}
                {availableSources.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold text-slate-600">Source:</span>
                    {availableSources.map((src) => {
                      const active = filters.dataSources.includes(src);
                      return (
                        <button
                          key={src}
                          type="button"
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              dataSources: active
                                ? f.dataSources.filter((x) => x !== src)
                                : [...f.dataSources, src],
                            }))
                          }
                          className={`px-1.5 py-0.5 border rounded-xs ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {src}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Save / Load / Export / Import Sequence Investigation Persistence Bar */}
            <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Investigation:</span>
                  <input
                    type="text"
                    value={investigationName}
                    onChange={(e) => setInvestigationName(e.target.value)}
                    className="border border-slate-300 rounded-xs px-2 py-1 font-mono text-xs w-48"
                    placeholder="Investigation name"
                  />
                  <input
                    type="text"
                    value={investigationNotes}
                    onChange={(e) => setInvestigationNotes(e.target.value)}
                    className="border border-slate-300 rounded-xs px-2 py-1 text-xs w-60"
                    placeholder="Analyst notes / rationale (saved with sequence)"
                  />
                  <button
                    type="button"
                    disabled={isSavingInv}
                    onClick={() => void handleSaveInvestigation(false)}
                    className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 text-white rounded-xs text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSavingInv ? 'Saving...' : loadedInvestigationId ? 'Update Saved' : 'Save Investigation'}
                  </button>
                  {loadedInvestigationId && (
                    <button
                      type="button"
                      disabled={isSavingInv}
                      onClick={() => void handleSaveInvestigation(true)}
                      className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-xs text-[11px] font-medium"
                    >
                      Save as New
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <input
                    ref={invImportInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => void handleImportInvestigationFile(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => invImportInputRef.current?.click()}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-xs inline-flex items-center gap-1 font-medium"
                    title="Load saved sequence filters, membership overrides, and roles from a JSON package"
                  >
                    <Upload className="w-3.5 h-3.5" /> Import JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleExportInvestigationPackage}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-xs inline-flex items-center gap-1 font-medium"
                    title="Export complete sequence metadata, membership decisions, and results as JSON"
                  >
                    <Download className="w-3.5 h-3.5" /> Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportSequenceEventsCsv({
                        investigationName,
                        activeEvent: event,
                        assembly,
                        catalogVersion,
                      });
                      const fname = `${investigationName.trim() || 'sequence'}_events.csv`;
                      triggerTextDownload(fname, csv, 'text/csv;charset=utf-8');
                      onNotice?.(`Exported ${fname}`);
                    }}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-xs inline-flex items-center gap-1 font-medium"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              </div>

              {loadedRefEventId && loadedRefEventId !== event.id && (
                <div className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-xs text-[11px] text-amber-900">
                  Loaded investigation was originally anchored to reference EQP event{' '}
                  <strong className="font-mono">{loadedRefEventId}</strong> (active EQP is{' '}
                  <strong className="font-mono">{event.id}</strong>). Distance/time metrics reflect the active event unless updated.
                </div>
              )}

              {savedInvestigations.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-600">Saved Investigations:</span>
                  {savedInvestigations.slice(0, 8).map((inv) => (
                    <span
                      key={inv.id}
                      className={`inline-flex items-center border rounded-xs ${
                        loadedInvestigationId === inv.id
                          ? 'bg-blue-50 border-blue-400 text-blue-900'
                          : 'bg-slate-50 border-slate-300 text-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadInvestigation(inv)}
                        className="px-2 py-0.5 font-mono hover:underline"
                        title={`Load ${inv.name} · ${inv.summarySnapshot.selectedCount} events · ${inv.summarySnapshot.characterization} · Ref ${inv.referenceEventId} · Saved ${inv.savedAtUtc.slice(0, 16).replace('T', ' ')} UTC`}
                      >
                        {inv.name} ({inv.summarySnapshot.selectedCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteInvestigation(inv.id, inv.name)}
                        className="px-1 py-0.5 text-slate-400 hover:text-red-700 border-l border-slate-200"
                        title={`Delete ${inv.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Interactive Sequence Event Table */}
          <section className="bg-[#f1f4f9] border border-slate-600/70 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-slate-800">
                Sequence Candidate &amp; Background Event Table ({tableRows.length} shown)
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {(
                  [
                    ['all', `All (${assembly.events.length})`],
                    ['selected', `Selected (${assembly.selectedCount})`],
                    ['excluded', `Excluded (${assembly.excludedCount})`],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTableShowMode(mode)}
                    className={`px-2 py-0.5 border rounded-xs ${
                      tableShowMode === mode
                        ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                        : 'bg-[#dfe6f0] text-slate-800 border-slate-600/60 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-96 overflow-auto border border-slate-600/50 rounded">
              <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                <thead className="bg-[#dfe6f0] text-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 border-b border-slate-200">Incl</th>
                    <th className="px-2 py-1.5 border-b border-slate-200">Event ID</th>
                    <th
                      className="px-2 py-1.5 border-b border-slate-200 cursor-pointer hover:text-blue-700"
                      onClick={() => toggleSort('time')}
                    >
                      Origin UTC {sortCol === 'time' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th
                      className="px-2 py-1.5 border-b border-slate-200 text-right cursor-pointer hover:text-blue-700"
                      onClick={() => toggleSort('mag')}
                    >
                      Mag {sortCol === 'mag' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th
                      className="px-2 py-1.5 border-b border-slate-200 text-right cursor-pointer hover:text-blue-700"
                      onClick={() => toggleSort('depth')}
                    >
                      Depth {sortCol === 'depth' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th
                      className="px-2 py-1.5 border-b border-slate-200 text-right cursor-pointer hover:text-blue-700"
                      onClick={() => toggleSort('dist')}
                    >
                      Dist {sortCol === 'dist' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th className="px-2 py-1.5 border-b border-slate-200">Window</th>
                    <th className="px-2 py-1.5 border-b border-slate-200">Provisional Role</th>
                    <th className="px-2 py-1.5 border-b border-slate-200">Source / Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(0, 400).map((row) => {
                    const isSel = selectedRecordId === row.record.id;
                    return (
                      <tr
                        key={row.record.id}
                        onClick={() => setSelectedRecordId(row.record.id)}
                        className={`border-b border-slate-100 cursor-pointer ${
                          isSel
                            ? 'bg-blue-50'
                            : !row.included
                            ? 'bg-slate-50 text-slate-400'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td
                          className="px-2 py-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleIncludeEvent(row);
                          }}
                        >
                          {row.included ? (
                            <CheckSquare className="w-3.5 h-3.5 text-blue-700" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </td>
                        <td className="px-2 py-1 font-semibold text-slate-900">
                          {row.record.eventId}
                          {row.record.id === assembly.largestEligibleId && (
                            <span className="ml-1 text-[10px] text-purple-800 font-bold">[MAX]</span>
                          )}
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {row.record.originTimeUtc.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {row.record.magnitude !== null
                            ? `${row.record.magnitudeType} ${row.record.magnitude.toFixed(1)}`
                            : '—'}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {row.record.depthKm !== null ? `${row.record.depthKm.toFixed(1)} km` : '—'}
                        </td>
                        <td className="px-2 py-1 text-right">{row.distanceKm.toFixed(1)} km</td>
                        <td className="px-2 py-1">{row.window}</td>
                        <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={row.role}
                            onChange={(e) =>
                              handleSetManualRole(row.record.id, e.target.value as SequenceEventRole)
                            }
                            className="border border-slate-300 rounded-xs px-1 py-0.5 bg-white text-[10px]"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-[10px]">
                          <span>{row.record.dataSource}</span>
                          {row.clusterId !== null && (
                            <span className="ml-1 text-teal-700">· C#{row.clusterId}</span>
                          )}
                          {row.isReferenceMatch && (
                            <span className="ml-1 text-red-700 font-bold">· RefMatch</span>
                          )}
                          {row.isDuplicate && (
                            <span
                              className="ml-1 text-amber-800"
                              title={row.duplicateNote || 'Flagged duplicate'}
                            >
                              · {row.duplicateUncertain ? 'UncertainDup' : 'Dup'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {tableRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-slate-500 font-sans">
                        No events match the current table view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* SECTION B: TIMELINE & SEISMICITY RATE */}
      {activeSection === 'timeline' && (
        <SequenceTimelinePanel
          investigationName={investigationName}
          assembly={assembly}
          timeline={timeline}
          filters={filters}
          selectedRecordId={selectedRecordId}
          onSelectRecord={setSelectedRecordId}
          onChangeFilters={setFilters}
          onNotice={onNotice}
        />
      )}

      {/* SECTION C: SPATIAL & DEPTH ANALYSIS */}
      {activeSection === 'spatial' && (
        <SequenceSpatialPanel
          activeEvent={event}
          assembly={assembly}
          filters={filters}
          selectedRecordId={selectedRecordId}
          onSelectRecord={setSelectedRecordId}
          activeFaultsDataset={activeFaultsDataset}
          trenchSystemsDataset={trenchSystemsDataset}
          onNotice={onNotice}
        />
      )}

      {/* SECTION D: MAGNITUDE-FREQUENCY ANALYSIS */}
      {activeSection === 'magnitude' && (
        <SequenceMagnitudePanel
          investigationName={investigationName}
          mfd={mfd}
          selectedMagType={selectedMagType}
          onChangeMagType={setSelectedMagType}
          mcMethod={mcMethod}
          onChangeMcMethod={setMcMethod}
          manualMc={manualMc}
          onChangeManualMc={setManualMc}
          binWidth={mfdBinWidth}
          onChangeBinWidth={setMfdBinWidth}
          onNotice={onNotice}
        />
      )}

      {/* SECTION E: SEQUENCE DECAY & QUALITY */}
      {activeSection === 'decay' && (
        <div className="space-y-3">
          {/* Omori-Utsu Decay Card */}
          <section className="bg-[#f3f1fb] border border-indigo-700/60 rounded-lg p-3.5 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-700/35 pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                  Conditional Modified Omori–Utsu Decay: n(t) = K / (t + c)^p (Ogata 1983 MLE)
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
                  {omori.suitabilityReason}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold font-mono border rounded-xs ${
                  omori.status === 'Insufficient Data'
                    ? 'bg-red-50 text-red-800 border-red-300'
                    : omori.status === 'Ambiguous'
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-blue-50 text-blue-900 border-blue-300'
                }`}
              >
                {omori.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-semibold text-slate-700 block">Fit Start t1 (days)</span>
                <input
                  type="number"
                  step="0.01"
                  min={0.001}
                  max={100}
                  value={omoriFitStartDays}
                  onChange={(e) =>
                    setOmoriFitStartDays(Math.max(0.001, Number(e.target.value) || 0.05))
                  }
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="font-semibold text-slate-700 block">Fit End t2 (days)</span>
                <input
                  type="number"
                  step="1"
                  min={1}
                  max={3650}
                  value={omoriFitEndDays}
                  onChange={(e) =>
                    setOmoriFitEndDays(Math.max(1, Number(e.target.value) || 60))
                  }
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="font-semibold text-slate-700 block">
                  Post-Event Cutoff Mc ({mfd.selectedMagType ?? 'All'})
                </span>
                <input
                  type="number"
                  step="0.1"
                  disabled={omoriMcSyncedToMfd}
                  value={effectiveOmoriMc}
                  onChange={(e) => setOmoriMc(Number(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-xs px-2 py-1 font-mono disabled:bg-slate-100"
                />
              </label>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={omoriMcSyncedToMfd}
                    onChange={(e) => setOmoriMcSyncedToMfd(e.target.checked)}
                  />
                  Sync Mc from Section D
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2">
                <div className="text-[10px] font-semibold uppercase text-indigo-950">Productivity K</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {omori.kValue !== null ? omori.kValue.toFixed(2) : 'Withheld'}
                </div>
              </div>
              <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2">
                <div className="text-[10px] font-semibold uppercase text-indigo-950">Time Offset c (d)</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {omori.cValueDays !== null ? omori.cValueDays.toFixed(4) : 'Withheld'}
                </div>
              </div>
              <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2">
                <div className="text-[10px] font-semibold uppercase text-indigo-950">Decay Exponent p</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {omori.pValue !== null ? omori.pValue.toFixed(3) : 'Withheld'}
                </div>
              </div>
              <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2">
                <div className="text-[10px] font-semibold uppercase text-indigo-950">KS Residual D</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {omori.ksStatistic !== null ? omori.ksStatistic.toFixed(3) : '—'}
                </div>
              </div>
              <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2">
                <div className="text-[10px] font-semibold uppercase text-indigo-950">Window Sample</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                  n={omori.eventCountInWindow}
                </div>
              </div>
            </div>

            {omori.warnings.length > 0 && (
              <div className="bg-[#f3e6cc] border border-amber-800/60 rounded p-2 text-[11px] text-amber-950 space-y-0.5">
                {omori.warnings.map((w, idx) => (
                  <div key={`om-w-${idx}`} className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {omori.observedSeries.length > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 pt-1">
                <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5">
                  <div className="text-xs font-bold text-slate-800 mb-2">
                    Observed Post-Anchor Rate vs Omori–Utsu Fit (/day)
                  </div>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={omori.observedSeries}
                        margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="timeDays"
                          tick={{ fontSize: 10, fill: '#475569' }}
                          tickFormatter={(v) => `${Number(v).toFixed(2)}d`}
                        />
                        <YAxis tick={{ fontSize: 10, fill: '#475569' }} width={44} />
                        <Tooltip contentStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                        <Scatter dataKey="observedRatePerDay" fill="#0f172a" name="Observed (/day)" />
                        {omori.suitableForOmori && (
                          <Line
                            type="monotone"
                            dataKey="fittedRatePerDay"
                            stroke="#dc2626"
                            strokeWidth={2}
                            dot={false}
                            name="Omori Fit (/day)"
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#e5e1f7] border border-indigo-800/55 rounded p-2.5 overflow-hidden flex flex-col">
                  <div className="text-xs font-bold text-slate-800 mb-1.5">
                    Logarithmic Bin Rate &amp; Residuals
                  </div>
                  <div className="max-h-56 overflow-y-auto border border-indigo-800/45 bg-white/80 rounded">
                    <table className="w-full text-left border-collapse text-[11px] font-mono tabular-nums">
                      <thead className="bg-[#dfe6f0] text-slate-800 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 border-b border-slate-200">t Interval (d)</th>
                          <th className="px-2 py-1 border-b border-slate-200 text-right">n</th>
                          <th className="px-2 py-1 border-b border-slate-200 text-right">Obs /d</th>
                          <th className="px-2 py-1 border-b border-slate-200 text-right">Fit /d</th>
                          <th className="px-2 py-1 border-b border-slate-200 text-right">Resid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {omori.observedSeries.map((pt, idx) => (
                          <tr key={`om-r-${idx}`} className="border-b border-slate-100">
                            <td className="px-2 py-1">
                              {pt.tStartDays.toFixed(3)}–{pt.tEndDays.toFixed(2)}
                            </td>
                            <td className="px-2 py-1 text-right">{pt.count}</td>
                            <td className="px-2 py-1 text-right">{pt.observedRatePerDay.toFixed(2)}</td>
                            <td className="px-2 py-1 text-right">
                              {pt.fittedRatePerDay !== null ? pt.fittedRatePerDay.toFixed(2) : '—'}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {pt.residualPerDay !== null
                                ? `${pt.residualPerDay > 0 ? '+' : ''}${pt.residualPerDay.toFixed(2)}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Quality Assessment, Exports & Deliberate Cross-Module Navigation */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            <section className="xl:col-span-7 bg-[#fbf5ea] border border-amber-700/60 rounded-lg p-3.5 space-y-2.5 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="flex items-center justify-between border-b border-amber-700/35 pb-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800 inline-flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-800" />
                  Investigation Quality &amp; Scientific Limitations
                </h3>
                <span className="text-[11px] font-mono font-bold text-amber-950 bg-[#f3e6cc] border border-amber-800/60 px-2 py-0.5 rounded-xs">
                  {quality.overallStatus}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-[11px] font-mono tabular-nums bg-[#f3e6cc] border border-amber-800/60 rounded p-2.5">
                <dt className="text-slate-600">Independent Selected / Catalog</dt>
                <dd className="text-slate-900">
                  {quality.independentSelectedRecords} / {quality.totalCatalogRecords}
                </dd>
                <dt className="text-slate-600">Duplicates / Uncertain Matches</dt>
                <dd className="text-slate-900">
                  {quality.duplicateFlaggedCount} ({quality.uncertainMatchCount} cross-source uncertain)
                </dd>
                <dt className="text-slate-600">Missing Depth / Uncertain Loc</dt>
                <dd className="text-slate-900">
                  {quality.missingDepthCount} missing depth · {quality.uncertainLocationCount} uncertain loc
                </dd>
                <dt className="text-slate-600">Temporal Coverage</dt>
                <dd className="text-slate-900">{quality.temporalCoverageNote}</dd>
                <dt className="text-slate-600">MFD / b-Value</dt>
                <dd className="text-slate-900">{quality.completenessNote}</dd>
                <dt className="text-slate-600">Omori–Utsu Decay</dt>
                <dd className="text-slate-900">{quality.modelSuitabilityNote}</dd>
              </dl>

              <ul className="border-t border-amber-700/35 pt-2 space-y-1 text-[11px] text-slate-700 list-disc pl-4">
                {quality.limitations.map((lim, idx) => (
                  <li key={`lim-${idx}`}>{lim}</li>
                ))}
              </ul>
            </section>

            <section className="xl:col-span-5 bg-[#eef7f2] border border-emerald-700/60 rounded-lg p-3.5 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
              <div className="border-b border-emerald-700/35 pb-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                  Reproducible Exports &amp; Cross-Module Integration
                </h3>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700">
                  Sequence Data &amp; Investigation Package Exports
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportSequenceEventsCsv({
                        investigationName,
                        activeEvent: event,
                        assembly,
                        catalogVersion,
                      });
                      const fname = `${investigationName.trim() || 'sequence'}_events.csv`;
                      triggerTextDownload(fname, csv, 'text/csv;charset=utf-8');
                      onNotice?.(`Exported ${fname}`);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 rounded-xs inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Sequence CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const geo = exportSequenceGeoJson({
                        investigationName,
                        activeEvent: event,
                        assembly,
                      });
                      const fname = `${investigationName.trim() || 'sequence'}_events.geojson`;
                      triggerTextDownload(fname, geo, 'application/geo+json;charset=utf-8');
                      onNotice?.(`Exported ${fname}`);
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 rounded-xs inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Sequence GeoJSON
                  </button>
                  <button
                    type="button"
                    onClick={handleExportInvestigationPackage}
                    className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-50 rounded-xs inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Investigation JSON
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-2.5 space-y-2">
                <div className="text-[11px] font-semibold text-slate-700">
                  Deliberate Cross-Module Actions (No Auto-Execution)
                </div>
                <div className="flex flex-col gap-1.5 text-xs">
                  {onOpenHistoricalSeismicity && (
                    <button
                      type="button"
                      onClick={onOpenHistoricalSeismicity}
                      className="w-full text-left px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xs inline-flex items-center gap-2"
                    >
                      <Globe className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span>Open Historical Seismicity Catalog Manager</span>
                    </button>
                  )}
                  {onOpenFocalMechanism && (
                    <button
                      type="button"
                      onClick={onOpenFocalMechanism}
                      className="w-full text-left px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xs inline-flex items-center gap-2"
                    >
                      <Radar className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span>Inspect Active EQP Reference Event in Focal Mechanism</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportStressReady}
                    className="w-full text-left px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xs inline-flex items-center justify-between gap-2"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Download className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span>Export Sequence Focal Mechanisms for Stress Inversion</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      ({selectedWithMechanisms.length} avail)
                    </span>
                  </button>
                  {onOpenRegionalStress && (
                    <button
                      type="button"
                      onClick={onOpenRegionalStress}
                      className="w-full text-left px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xs inline-flex items-center gap-2"
                    >
                      <Compass className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span>Open Regional Stress Analysis Workspace</span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
