import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Clock,
  Copy,
  Download,
  FileText,
  GitMerge,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  isEventUnlocated,
  type EQPEvent,
  type IntensityCategory,
  type IntensityEntry,
  type IntensityReviewStatus,
  type PeisRoman,
} from '../data/eqpData';
import type { NearestPlacesCatalog } from '../utils/nearestPlaces';
import { resolveBulletinMagnitude } from '../utils/magnitudeEngine';
import {
  analyzeIntensityEntries,
  comparePeisDesc,
  deriveStructuredLocationParts,
  formatCanonicalLocalityDisplay,
  formatGroupedBulletinIntensityBlock,
  getEventFeltStatusSummary,
  getExactEntryDedupeKey,
  getLocalityConflictKey,
  mergeConflictingObservations,
  normalizeIntensityCategory,
  normalizeIntensityReviewStatus,
  parseRawIntensityReports,
  PEIS_DESCRIPTORS,
  PEIS_LEVELS,
  REPORT_SOURCE_SUGGESTIONS,
  SAMPLE_MANUAL_INTENSITY_TEXT,
  selectWinningConflictObservation,
  validateCandidateIntensityInput,
  type CandidateIntensityValidation,
  type DuplicateGroupInfo,
  type MergeConflictObservationConfig,
  type ParsedRawReportAnalysis,
} from '../utils/intensityFormat';
import {
  buildPhilippineLocalityIndex,
  getMunicipalitiesForProvince,
  normalizeLocalityMatchKey,
  resolvePhilippineLocality,
} from '../utils/intensityLocalityCatalog';
import {
  AddMultipleLocationsModal,
  EditIntensityModal,
  SearchableSelectCombobox,
} from './IntensityModals';
import {
  IntensityConflictResolver,
  type ConflictGroupItem,
} from './IntensityConflictResolver';

type InternalTabId = 'reported' | 'instrumental' | 'raw-import';
type StatusFilterValue = 'all' | IntensityReviewStatus;

interface IntensityInputPanelProps {
  event: EQPEvent;
  isDirty: boolean;
  isSaving?: boolean;
  placesCatalog: NearestPlacesCatalog | null;
  onChangeEvent: (updater: (ev: EQPEvent) => EQPEvent, markDirty?: boolean) => void;
  onSaveIntensities: () => void;
  onSendToBulletin: () => void;
  onNavigateToBulletin: () => void;
  onNotice?: (message: string) => void;
}

const PEIS_BADGE_CLASS: Record<PeisRoman, string> = {
  I: 'bg-slate-100 text-slate-700 border-slate-300',
  II: 'bg-sky-50 text-sky-800 border-sky-200',
  III: 'bg-teal-50 text-teal-800 border-teal-200',
  IV: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  V: 'bg-amber-50 text-amber-800 border-amber-300',
  VI: 'bg-orange-50 text-orange-800 border-orange-300',
  VII: 'bg-rose-50 text-rose-800 border-rose-300',
  VIII: 'bg-red-100 text-red-900 border-red-300',
  IX: 'bg-red-200 text-red-950 border-red-400',
  X: 'bg-purple-100 text-purple-950 border-purple-300',
};

const REVIEW_STATUS_META: Record<
  IntensityReviewStatus,
  { label: string; className: string }
> = {
  verified: {
    label: 'Verified',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  draft: {
    label: 'Draft',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  conflicting: {
    label: 'Conflict',
    className: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  },
  unresolved: {
    label: 'Unresolved',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

export const IntensityInputPanel: React.FC<IntensityInputPanelProps> = ({
  event,
  isDirty,
  isSaving = false,
  placesCatalog,
  onChangeEvent,
  onSaveIntensities,
  onSendToBulletin,
  onNavigateToBulletin,
  onNotice,
}) => {
  const [activeTab, setActiveTab] = useState<InternalTabId>('reported');

  // Quick Entry state (Reported)
  const [quickPeis, setQuickPeis] = useState<PeisRoman>('III');
  const [quickProvince, setQuickProvince] = useState('');
  const [quickLocality, setQuickLocality] = useState('');
  const [quickSpecificLocation, setQuickSpecificLocation] = useState('');
  const [quickReportSource, setQuickReportSource] = useState('');
  const [quickReviewStatus, setQuickReviewStatus] = useState<'draft' | 'verified'>('draft');
  const [provinceDropdownOpen, setProvinceDropdownOpen] = useState(false);
  const [localityDropdownOpen, setLocalityDropdownOpen] = useState(false);
  const localityInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Entry state (Instrumental)
  const [instrPeis, setInstrPeis] = useState<PeisRoman>('I');
  const [instrProvince, setInstrProvince] = useState('');
  const [instrLocality, setInstrLocality] = useState('');
  const [instrSpecificLocation, setInstrSpecificLocation] = useState('');
  const [instrReportSource, setInstrReportSource] = useState('');
  const [instrReviewStatus, setInstrReviewStatus] = useState<'draft' | 'verified'>('draft');
  const [instrProvDropdownOpen, setInstrProvDropdownOpen] = useState(false);
  const [instrLocDropdownOpen, setInstrLocDropdownOpen] = useState(false);
  const instrLocalityInputRef = useRef<HTMLInputElement | null>(null);

  // Table search & filters
  const [tableSearch, setTableSearch] = useState('');
  const [filterPeis, setFilterPeis] = useState<'all' | PeisRoman>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilterValue>('all');
  const [filterConflictsOnly, setFilterConflictsOnly] = useState(false);
  const [filterInstrConflictsOnly, setFilterInstrConflictsOnly] = useState(false);
  const [resolveConflictsMode, setResolveConflictsMode] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modals
  const [multiModalOpen, setMultiModalOpen] = useState(false);
  const [multiModalCategory, setMultiModalCategory] = useState<IntensityCategory>('felt');
  const [editingEntry, setEditingEntry] = useState<IntensityEntry | null>(null);

  // Bulletin Preview state
  const [isEditingBulletinText, setIsEditingBulletinText] = useState(false);
  const [copiedBulletin, setCopiedBulletin] = useState(false);

  // Raw Text / Import state
  const [rawImportText, setRawImportText] = useState<string>(
    () => event.rawIntensityImportText ?? ''
  );
  const [rawImportCategoryMode, setRawImportCategoryMode] = useState<
    'auto' | 'felt' | 'instrumental'
  >('auto');
  const [rawParseSnapshot, setRawParseSnapshot] = useState<ParsedRawReportAnalysis | null>(null);
  const [rawDirtySinceParse, setRawDirtySinceParse] = useState(false);
  const rawTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setRawImportText(event.rawIntensityImportText ?? '');
    setRawParseSnapshot(null);
    setRawDirtySinceParse(false);
    setIsEditingBulletinText(false);
    setConfirmDeleteId(null);
    setFilterConflictsOnly(false);
    setFilterInstrConflictsOnly(false);
    setResolveConflictsMode(false);
  }, [event.id]);

  const localityIndex = useMemo(
    () => buildPhilippineLocalityIndex(placesCatalog),
    [placesCatalog]
  );

  const analysis = useMemo(
    () => analyzeIntensityEntries(event.intensities),
    [event.intensities]
  );

  const groupedBulletin = useMemo(
    () => formatGroupedBulletinIntensityBlock(event.intensities),
    [event.intensities]
  );

  const feltSummary = useMemo(() => getEventFeltStatusSummary(event), [event]);

  const unlocated = isEventUnlocated(event);
  const magResolution = resolveBulletinMagnitude(event);
  const preferredMag =
    magResolution.value ??
    (event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md);
  const preferredScaleLabel = magResolution.scaleLabel;

  const hasBulletinOverride =
    typeof event.intensityBulletinOverride === 'string' &&
    event.intensityBulletinOverride.trim().length > 0;

  const activeBulletinPreviewText = hasBulletinOverride
    ? event.intensityBulletinOverride!
    : groupedBulletin.text;

  // Report operational status summary for top bar
  const reportStatusSummary = useMemo(() => {
    if (hasBulletinOverride) return 'Manual Bulletin Text';
    if (analysis.counts.total === 0) return 'No Reports';
    if (analysis.counts.conflictGroups > 0 || analysis.counts.unresolved > 0) {
      return `${analysis.counts.conflictGroups + analysis.counts.unresolved} Flagged`;
    }
    if (analysis.counts.draft > 0) {
      return `${analysis.counts.verified} Verified · ${analysis.counts.draft} Draft`;
    }
    return `${analysis.counts.verified} Verified Ready`;
  }, [analysis.counts, hasBulletinOverride]);

  // Quick-entry Locality options
  const quickLocalityOptions = useMemo(() => {
    if (quickProvince.trim()) {
      return getMunicipalitiesForProvince(localityIndex, quickProvince).map(
        (r) => r.municipality
      );
    }
    return localityIndex.allRecords.map((r) => `${r.municipality}, ${r.province}`);
  }, [localityIndex, quickProvince]);

  const instrLocalityOptions = useMemo(() => {
    if (instrProvince.trim()) {
      return getMunicipalitiesForProvince(localityIndex, instrProvince).map(
        (r) => r.municipality
      );
    }
    return localityIndex.allRecords.map((r) => `${r.municipality}, ${r.province}`);
  }, [localityIndex, instrProvince]);

  const catalogLoaded = Boolean(placesCatalog);

  const quickReportedValidation = useMemo(
    () =>
      validateCandidateIntensityInput({
        peis: quickPeis,
        category: 'felt',
        province: quickProvince,
        localityText: quickLocality,
        specificLocation: quickSpecificLocation,
        catalogLoaded,
        localityIndex,
        existingEntries: event.intensities,
      }),
    [
      quickPeis,
      quickProvince,
      quickLocality,
      quickSpecificLocation,
      catalogLoaded,
      localityIndex,
      event.intensities,
    ]
  );

  const quickInstrumentalValidation = useMemo(
    () =>
      validateCandidateIntensityInput({
        peis: instrPeis,
        category: 'instrumental',
        province: instrProvince,
        localityText: instrLocality,
        specificLocation: instrSpecificLocation,
        catalogLoaded,
        localityIndex,
        existingEntries: event.intensities,
      }),
    [
      instrPeis,
      instrProvince,
      instrLocality,
      instrSpecificLocation,
      catalogLoaded,
      localityIndex,
      event.intensities,
    ]
  );

  const feltDuplicateGroups = useMemo(
    () => analysis.duplicateGroups.filter((g) => g.category === 'felt'),
    [analysis.duplicateGroups]
  );

  const instrumentalDuplicateGroups = useMemo(
    () => analysis.duplicateGroups.filter((g) => g.category === 'instrumental'),
    [analysis.duplicateGroups]
  );

  const duplicateGroupByEntryId = useMemo(() => {
    const map = new Map<string, DuplicateGroupInfo>();
    for (const group of analysis.duplicateGroups) {
      for (const id of group.entryIds) {
        map.set(id, group);
      }
    }
    return map;
  }, [analysis.duplicateGroups]);

  const entryCategoryById = useMemo(() => {
    const map = new Map<string, IntensityCategory>();
    for (const item of event.intensities) {
      map.set(item.id, normalizeIntensityCategory(item));
    }
    return map;
  }, [event.intensities]);

  const feltConflictsList = useMemo(
    () =>
      analysis.conflictsList.filter((c) =>
        c.entryIds.some((id) => entryCategoryById.get(id) === 'felt')
      ),
    [analysis.conflictsList, entryCategoryById]
  );

  const instrumentalConflictsList = useMemo(
    () =>
      analysis.conflictsList.filter((c) =>
        c.entryIds.some((id) => entryCategoryById.get(id) === 'instrumental')
      ),
    [analysis.conflictsList, entryCategoryById]
  );

  const activeTabValidation =
    activeTab === 'reported'
      ? quickReportedValidation
      : activeTab === 'instrumental'
        ? quickInstrumentalValidation
        : null;

  const activeQuickMatchedIds = useMemo(() => {
    if (!activeTabValidation || activeTabValidation.duplicateKind === 'none') {
      return new Set<string>();
    }
    return new Set(activeTabValidation.matchingLocalityEntries.map((e) => e.id));
  }, [activeTabValidation]);

  const handleSelectQuickLocalityOption = (selectedOpt: string) => {
    if (!quickProvince.trim() && selectedOpt.includes(',')) {
      const resolved = resolvePhilippineLocality(localityIndex, selectedOpt);
      if (resolved.matched) {
        setQuickProvince(resolved.province);
        setQuickLocality(resolved.municipality);
        return;
      }
    }
    setQuickLocality(selectedOpt);
  };

  const handleSelectInstrLocalityOption = (selectedOpt: string) => {
    if (!instrProvince.trim() && selectedOpt.includes(',')) {
      const resolved = resolvePhilippineLocality(localityIndex, selectedOpt);
      if (resolved.matched) {
        setInstrProvince(resolved.province);
        setInstrLocality(resolved.municipality);
        return;
      }
    }
    setInstrLocality(selectedOpt);
  };

  const addSingleEntry = (params: {
    category: IntensityCategory;
    peis: PeisRoman;
    province: string;
    localityText: string;
    specificLocation: string;
    reportSource: string;
    requestedStatus: 'draft' | 'verified';
    onAfterAdd: () => void;
  }) => {
    const rawLoc = params.localityText.trim();
    if (!rawLoc) {
      onNotice?.('Enter a City / Municipality before adding an intensity report.');
      return;
    }

    const resolution = resolvePhilippineLocality(
      localityIndex,
      rawLoc,
      params.province.trim() || undefined
    );

    const finalProvince = resolution.matched
      ? resolution.province
      : params.province.trim() || resolution.province;
    const finalMuni = resolution.matched
      ? resolution.municipality
      : resolution.municipality || rawLoc;
    const finalSpec = params.specificLocation.trim() || resolution.specificLocation || '';

    const displayLocality = formatCanonicalLocalityDisplay({
      specificLocation: finalSpec,
      municipality: finalMuni,
      province: finalProvince,
      fallbackLocality: rawLoc,
    });

    const draftCandidate: IntensityEntry = {
      id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      peis: params.peis,
      locality: displayLocality,
      category: params.category,
      province: finalProvince || undefined,
      municipality: finalMuni || undefined,
      specificLocation: finalSpec || undefined,
      psgcCode: resolution.psgcCode ?? null,
      reportSource: params.reportSource.trim() || undefined,
      receivedAt: new Date().toISOString(),
    };

    const exactKey = getExactEntryDedupeKey(draftCandidate);
    const hasExactDuplicate = event.intensities.some(
      (existing) => getExactEntryDedupeKey(existing) === exactKey
    );
    if (hasExactDuplicate) {
      onNotice?.(
        `Duplicate prevented: Intensity ${params.peis} - ${displayLocality} is already recorded.`
      );
      return;
    }

    const locKey = getLocalityConflictKey(draftCandidate);
    const conflictingExisting = event.intensities.filter(
      (existing) =>
        normalizeIntensityCategory(existing) === params.category &&
        getLocalityConflictKey(existing) === locKey &&
        existing.peis !== params.peis
    );

    let effectiveStatus: IntensityReviewStatus = params.requestedStatus;
    let conflictRemarks: string | undefined;

    if (!resolution.matched && params.category === 'felt') {
      effectiveStatus = 'unresolved';
      conflictRemarks = resolution.reason || 'Unmatched locality — verify manually';
    } else if (conflictingExisting.length > 0) {
      effectiveStatus = 'conflicting';
      const existingPeisList = Array.from(
        new Set(conflictingExisting.map((e) => e.peis))
      ).join(', ');
      conflictRemarks = `Conflicting intensity recorded (existing: Intensity ${existingPeisList})`;
    }

    const newEntry: IntensityEntry = {
      ...draftCandidate,
      reviewStatus: effectiveStatus,
      ...(conflictRemarks ? { remarks: conflictRemarks } : {}),
    };

    onChangeEvent((ev) => ({
      ...ev,
      intensities: [...ev.intensities, newEntry],
    }));

    params.onAfterAdd();

    if (effectiveStatus === 'conflicting') {
      onNotice?.(
        `Added Intensity ${params.peis} - ${displayLocality} flagged as CONFLICTING (existing report differs).`
      );
    } else if (effectiveStatus === 'unresolved') {
      onNotice?.(
        `Added Intensity ${params.peis} - ${displayLocality} marked UNRESOLVED (unmatched locality).`
      );
    } else {
      onNotice?.(
        `Added ${params.category === 'instrumental' ? 'Instrumental ' : ''}Intensity ${params.peis} - ${displayLocality} (${effectiveStatus})`
      );
    }
  };

  const handleSubmitQuickReported = (e: React.FormEvent) => {
    e.preventDefault();
    if (provinceDropdownOpen || localityDropdownOpen) return;

    addSingleEntry({
      category: 'felt',
      peis: quickPeis,
      province: quickProvince,
      localityText: quickLocality,
      specificLocation: quickSpecificLocation,
      reportSource: quickReportSource,
      requestedStatus: quickReviewStatus,
      onAfterAdd: () => {
        // Preserve PEIS & Province for rapid sequential entry; reset locality-specific inputs & refocus locality
        setQuickLocality('');
        setQuickSpecificLocation('');
        window.requestAnimationFrame(() => {
          localityInputRef.current?.focus();
        });
      },
    });
  };

  const handleClearQuickReported = () => {
    setQuickProvince('');
    setQuickLocality('');
    setQuickSpecificLocation('');
    setQuickReportSource('');
    window.requestAnimationFrame(() => {
      localityInputRef.current?.focus();
    });
  };

  const handleSubmitQuickInstrumental = (e: React.FormEvent) => {
    e.preventDefault();
    if (instrProvDropdownOpen || instrLocDropdownOpen) return;

    addSingleEntry({
      category: 'instrumental',
      peis: instrPeis,
      province: instrProvince,
      localityText: instrLocality,
      specificLocation: instrSpecificLocation,
      reportSource: instrReportSource,
      requestedStatus: instrReviewStatus,
      onAfterAdd: () => {
        setInstrLocality('');
        setInstrSpecificLocation('');
        window.requestAnimationFrame(() => {
          instrLocalityInputRef.current?.focus();
        });
      },
    });
  };

  const handleQuickVerifyEntry = (entry: IntensityEntry) => {
    if (analysis.conflictByEntryId.has(entry.id)) {
      onNotice?.('Cannot verify conflicting report until discrepancy is resolved in Edit modal.');
      return;
    }
    onChangeEvent((ev) => ({
      ...ev,
      intensities: ev.intensities.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              reviewStatus: 'verified',
              updatedAt: new Date().toISOString(),
            }
          : item
      ),
    }));
    onNotice?.(`Verified Intensity ${entry.peis} - ${entry.locality}`);
  };

  const handleVerifyAllEligibleDrafts = (category: IntensityCategory) => {
    let updatedCount = 0;
    onChangeEvent((ev) => ({
      ...ev,
      intensities: ev.intensities.map((item) => {
        if (normalizeIntensityCategory(item) !== category) return item;
        const status = normalizeIntensityReviewStatus(item);
        if (status === 'draft' && !analysis.conflictByEntryId.has(item.id)) {
          updatedCount++;
          return {
            ...item,
            reviewStatus: 'verified',
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      }),
    }));
    if (updatedCount > 0) {
      onNotice?.(`Verified ${updatedCount} draft ${category} report${updatedCount === 1 ? '' : 's'}`);
    }
  };

  const handleSaveEditedEntry = (updated: IntensityEntry) => {
    onChangeEvent((ev) => ({
      ...ev,
      intensities: ev.intensities.map((item) =>
        item.id === updated.id ? updated : item
      ),
    }));
    setEditingEntry(null);
    onNotice?.(`Updated Intensity ${updated.peis} - ${updated.locality}`);
  };

  const handleConfirmDeleteEntry = (entry: IntensityEntry) => {
    onChangeEvent((ev) => ({
      ...ev,
      intensities: ev.intensities.filter((item) => item.id !== entry.id),
    }));
    setConfirmDeleteId(null);
    onNotice?.(`Removed Intensity ${entry.peis} - ${entry.locality}`);
  };

  const conflictResolutionGroups = useMemo<ConflictGroupItem[]>(() => {
    const byId = new Map<string, IntensityEntry>();
    for (const item of event.intensities) {
      byId.set(item.id, item);
    }

    const groups: ConflictGroupItem[] = [];
    const groupedEntryIds = new Set<string>();

    analysis.conflictsList.forEach((info, idx) => {
      const entries = info.entryIds
        .map((id) => byId.get(id))
        .filter((e): e is IntensityEntry => Boolean(e))
        .sort((a, b) => comparePeisDesc(a.peis, b.peis));
      if (entries.length === 0) return;

      for (const e of entries) {
        groupedEntryIds.add(e.id);
      }
      const category = normalizeIntensityCategory(entries[0]);
      groups.push({
        key: `${category}::${info.localityDisplay}::${idx}`,
        localityDisplay: info.localityDisplay,
        category,
        peisValues: info.peisValues,
        entries,
      });
    });

    // Include any standalone manually flagged 'conflicting' entries not in multi-entry groups
    for (const item of event.intensities) {
      if (groupedEntryIds.has(item.id)) continue;
      if (normalizeIntensityReviewStatus(item) === 'conflicting') {
        groups.push({
          key: `standalone::${item.id}`,
          localityDisplay: item.locality,
          category: normalizeIntensityCategory(item),
          peisValues: [item.peis],
          entries: [item],
          isStandaloneFlagged: true,
        });
      }
    }

    return groups;
  }, [event.intensities, analysis.conflictsList]);

  const handleSelectConflictWinner = (
    group: ConflictGroupItem,
    winningEntryId: string,
    reviewStatus: 'verified' | 'draft'
  ) => {
    const conflictIds = group.entries.map((e) => e.id);
    const winner = group.entries.find((e) => e.id === winningEntryId);
    onChangeEvent((ev) => ({
      ...ev,
      intensities: selectWinningConflictObservation(
        ev.intensities,
        conflictIds,
        winningEntryId,
        { reviewStatus }
      ),
    }));
    if (winner) {
      onNotice?.(
        `Resolved conflict at ${group.localityDisplay}: kept Intensity ${winner.peis} (${reviewStatus})`
      );
    }
  };

  const handleMergeConflictGroup = (
    group: ConflictGroupItem,
    config: MergeConflictObservationConfig
  ) => {
    const conflictIds = group.entries.map((e) => e.id);
    onChangeEvent((ev) => ({
      ...ev,
      intensities: mergeConflictingObservations(ev.intensities, conflictIds, config),
    }));
    onNotice?.(
      `Merged conflict at ${group.localityDisplay} into Intensity ${config.peis} (${
        config.reviewStatus ?? 'verified'
      })`
    );
  };

  // Filtered & sorted rows for Reported or Instrumental tables
  const buildFilteredRows = (
    category: IntensityCategory,
    conflictsOnly: boolean
  ) => {
    const q = normalizeLocalityMatchKey(tableSearch);
    return event.intensities
      .filter((entry) => normalizeIntensityCategory(entry) === category)
      .filter((entry) => {
        if (filterPeis !== 'all' && entry.peis !== filterPeis) return false;
        const baseStatus = normalizeIntensityReviewStatus(entry);
        const effectiveStatus: IntensityReviewStatus =
          baseStatus === 'unresolved'
            ? 'unresolved'
            : analysis.conflictByEntryId.has(entry.id) || baseStatus === 'conflicting'
              ? 'conflicting'
              : baseStatus;
        if (conflictsOnly) {
          if (effectiveStatus !== 'conflicting') return false;
        } else if (filterStatus !== 'all' && effectiveStatus !== filterStatus) {
          return false;
        }
        if (!q) return true;
        const parts = deriveStructuredLocationParts(entry);
        const haystack = normalizeLocalityMatchKey(
          `${entry.locality} ${parts.province} ${parts.municipality} ${parts.specificLocation} ${entry.reportSource ?? ''}`
        );
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const peisDiff = comparePeisDesc(a.peis, b.peis);
        if (peisDiff !== 0) return peisDiff;
        return a.locality.localeCompare(b.locality);
      });
  };

  const reportedRows = useMemo(
    () => buildFilteredRows('felt', filterConflictsOnly),
    [
      event.intensities,
      tableSearch,
      filterPeis,
      filterStatus,
      filterConflictsOnly,
      analysis.conflictByEntryId,
    ]
  );

  const instrumentalRows = useMemo(
    () => buildFilteredRows('instrumental', filterInstrConflictsOnly),
    [
      event.intensities,
      tableSearch,
      filterPeis,
      filterStatus,
      filterInstrConflictsOnly,
      analysis.conflictByEntryId,
    ]
  );

  const feltConflictingRowCount = useMemo(
    () =>
      event.intensities.filter((e) => {
        if (normalizeIntensityCategory(e) !== 'felt') return false;
        const base = normalizeIntensityReviewStatus(e);
        return (
          base !== 'unresolved' &&
          (analysis.conflictByEntryId.has(e.id) || base === 'conflicting')
        );
      }).length,
    [event.intensities, analysis.conflictByEntryId]
  );

  const instrumentalConflictingRowCount = useMemo(
    () =>
      event.intensities.filter((e) => {
        if (normalizeIntensityCategory(e) !== 'instrumental') return false;
        const base = normalizeIntensityReviewStatus(e);
        return (
          base !== 'unresolved' &&
          (analysis.conflictByEntryId.has(e.id) || base === 'conflicting')
        );
      }).length,
    [event.intensities, analysis.conflictByEntryId]
  );

  const verifyEligibleDraftCount = useMemo(
    () =>
      event.intensities.filter(
        (e) =>
          normalizeIntensityCategory(e) === 'felt' &&
          normalizeIntensityReviewStatus(e) === 'draft' &&
          !analysis.conflictByEntryId.has(e.id)
      ).length,
    [event.intensities, analysis.conflictByEntryId]
  );

  // Bulletin preview actions
  const handleCopyBulletinText = async () => {
    if (!activeBulletinPreviewText.trim()) {
      onNotice?.('No bulletin intensity text available to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(activeBulletinPreviewText);
      setCopiedBulletin(true);
      window.setTimeout(() => setCopiedBulletin(false), 1800);
      onNotice?.('Copied formatted PHIVOLCS intensity text');
    } catch {
      onNotice?.('Clipboard access unavailable in this browser context.');
    }
  };

  const handleToggleEditBulletinText = () => {
    if (!isEditingBulletinText) {
      if (!hasBulletinOverride) {
        onChangeEvent((ev) => ({
          ...ev,
          intensityBulletinOverride: groupedBulletin.text,
        }));
      }
      setIsEditingBulletinText(true);
    } else {
      setIsEditingBulletinText(false);
    }
  };

  const handleResetBulletinOverride = () => {
    onChangeEvent((ev) => ({
      ...ev,
      intensityBulletinOverride: undefined,
    }));
    setIsEditingBulletinText(false);
    onNotice?.('Restored automatic bulletin preview from verified structured reports');
  };

  // Raw Text / Import actions
  const runRawTextParse = (textOverride?: string) => {
    const textToParse = textOverride ?? rawImportText;
    const defaultCategory: IntensityCategory =
      rawImportCategoryMode === 'instrumental' ? 'instrumental' : 'felt';

    const parsed = parseRawIntensityReports(
      textToParse,
      localityIndex,
      event.intensities,
      {
        idPrefix: `raw-${Date.now()}`,
        defaultCategory,
      }
    );

    if (rawImportCategoryMode !== 'auto') {
      parsed.rows = parsed.rows.map((r) => ({
        ...r,
        category: rawImportCategoryMode,
      }));
    }

    setRawParseSnapshot(parsed);
    setRawDirtySinceParse(false);
    onChangeEvent(
      (ev) => ({
        ...ev,
        rawIntensityImportText: textToParse,
      }),
      false
    );
  };

  const handleAddParsedToIntensityList = () => {
    const parsed =
      rawParseSnapshot && !rawDirtySinceParse
        ? rawParseSnapshot
        : parseRawIntensityReports(rawImportText, localityIndex, event.intensities, {
            idPrefix: `raw-${Date.now()}`,
            defaultCategory:
              rawImportCategoryMode === 'instrumental' ? 'instrumental' : 'felt',
          });

    const addableRows = parsed.rows.filter(
      (r) => r.validationStatus !== 'duplicate'
    );

    if (addableRows.length === 0) {
      onNotice?.('No new non-duplicate intensity reports found to add.');
      return;
    }

    const nowIso = new Date().toISOString();
    const entriesToAppend: IntensityEntry[] = addableRows.map((row, idx) => {
      const targetCat: IntensityCategory =
        rawImportCategoryMode === 'auto' ? row.category : rawImportCategoryMode;

      const status: IntensityReviewStatus =
        row.validationStatus === 'unresolved'
          ? 'unresolved'
          : row.validationStatus === 'conflict'
            ? 'conflicting'
            : 'draft';

      return {
        id: `int-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        peis: row.peis,
        locality: row.locality,
        category: targetCat,
        province: row.province || undefined,
        municipality: row.municipality || undefined,
        specificLocation: row.specificLocation || undefined,
        psgcCode: row.psgcCode ?? null,
        reportSource: 'Raw Text Import',
        receivedAt: nowIso,
        reviewStatus: status,
        remarks:
          status === 'conflicting'
            ? row.validationNote
            : status === 'unresolved'
              ? row.validationNote
              : undefined,
      };
    });

    onChangeEvent((ev) => ({
      ...ev,
      intensities: [...ev.intensities, ...entriesToAppend],
      rawIntensityImportText: rawImportText,
    }));

    setRawParseSnapshot(null);
    setRawDirtySinceParse(false);
    setActiveTab('reported');
    onNotice?.(
      `Appended ${entriesToAppend.length} parsed intensity report${entriesToAppend.length === 1 ? '' : 's'} for review (${parsed.summary.duplicates} duplicate skipped)`
    );
  };

  const handleExportIntensities = () => {
    const payload = {
      eventId: event.id,
      filename: event.filename,
      originDateGmt: event.originDateGmt,
      originTimeGmt: event.originTimeGmt,
      magnitude: `${preferredScaleLabel} ${preferredMag.toFixed(1)}`,
      depthKm: event.depthKm,
      feltStatus: feltSummary.label,
      bulletinText: activeBulletinPreviewText,
      manualBulletinOverrideActive: hasBulletinOverride,
      reports: event.intensities,
      exportedAtUtc: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.id}_intensities.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotice?.(`Exported intensity report (${event.id}_intensities.json)`);
  };

  const renderIntensityRow = (entry: IntensityEntry, rowNumber: number) => {
    const parts = deriveStructuredLocationParts(entry);
    const baseStatus = normalizeIntensityReviewStatus(entry);
    const conflictInfo = analysis.conflictByEntryId.get(entry.id);
    const effectiveStatus: IntensityReviewStatus =
      baseStatus === 'unresolved'
        ? 'unresolved'
        : conflictInfo || baseStatus === 'conflicting'
          ? 'conflicting'
          : baseStatus;
    const statusMeta = REVIEW_STATUS_META[effectiveStatus];
    const isDuplicateRedundant = analysis.duplicateIds.has(entry.id);
    const dupGroup = duplicateGroupByEntryId.get(entry.id);
    const isDuplicateGroupMember = Boolean(dupGroup);
    const isLiveConflictMatch = activeQuickMatchedIds.has(entry.id);
    const isConflictingOrDuplicate =
      isLiveConflictMatch || effectiveStatus === 'conflicting' || isDuplicateGroupMember;
    const isConfirmingDelete = confirmDeleteId === entry.id;

    return (
      <tr
        key={entry.id}
        data-conflict-highlight={isConflictingOrDuplicate ? 'yellow' : undefined}
        className={`border-b border-slate-200/80 last:border-b-0 text-xs transition-colors ${
          isLiveConflictMatch
            ? 'bg-yellow-100 hover:bg-yellow-200/75 ring-1 ring-inset ring-yellow-400'
            : isConflictingOrDuplicate
              ? 'bg-yellow-50/90 hover:bg-yellow-100/80'
              : effectiveStatus === 'unresolved'
                ? 'bg-rose-50/35 hover:bg-rose-50/60'
                : rowNumber % 2 === 0
                  ? 'bg-slate-50/90 hover:bg-slate-100'
                  : 'bg-white hover:bg-slate-100'
        }`}
      >
        <td className="px-2.5 py-2 font-mono text-[11px] text-slate-400 tabular-nums">
          {rowNumber}
        </td>
        <td className="px-2.5 py-2 whitespace-nowrap">
          <div className="inline-flex items-center gap-1.5">
            <span
              className={`inline-flex items-center justify-center min-w-[2.2rem] px-1.5 py-0.5 text-[11px] font-mono font-bold rounded border ${PEIS_BADGE_CLASS[entry.peis]}`}
              title={PEIS_DESCRIPTORS[entry.peis]}
            >
              {entry.peis}
            </span>
            {entry.previousPeis && entry.previousPeis !== entry.peis && (
              <span
                className="text-[10px] font-mono text-slate-400"
                title={`Previously Intensity ${entry.previousPeis}`}
              >
                ←{entry.previousPeis}
              </span>
            )}
          </div>
        </td>
        <td className="px-2.5 py-2 text-slate-700 font-medium">
          {parts.province || <span className="text-slate-400">—</span>}
        </td>
        <td className="px-2.5 py-2 text-slate-900">
          <div className="font-medium">{parts.municipality || entry.locality}</div>
          {entry.reportSource && (
            <div className="text-[10.5px] text-slate-500">
              Source: {entry.reportSource}
            </div>
          )}
          {isLiveConflictMatch && activeTabValidation && (
            <div className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-yellow-950">
              <AlertTriangle className="w-3 h-3 text-yellow-700 shrink-0" />
              <span>
                {activeTabValidation.hasExactDuplicate
                  ? 'Duplicate of active entry above'
                  : activeTabValidation.hasConflictingPeis
                    ? `Conflicts with active entry (PEIS ${activeTab === 'instrumental' ? instrPeis : quickPeis})`
                    : 'Matches active quick entry locality'}
              </span>
            </div>
          )}
        </td>
        <td className="px-2.5 py-2 text-slate-600">
          {parts.specificLocation || <span className="text-slate-400">—</span>}
        </td>
        <td className="px-2.5 py-2 whitespace-nowrap">
          <div className="inline-flex flex-wrap items-center gap-1">
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10.5px] font-semibold rounded border ${statusMeta.className}`}
              title={
                conflictInfo
                  ? `Conflicts with PEIS ${conflictInfo.peisValues.join(', ')} at ${conflictInfo.localityDisplay}`
                  : entry.remarks || statusMeta.label
              }
            >
              {effectiveStatus === 'conflicting' && (
                <AlertTriangle className="w-3 h-3 text-yellow-700 shrink-0" />
              )}
              <span>{statusMeta.label}</span>
            </span>
            {isDuplicateRedundant && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-yellow-100 text-yellow-950 border-yellow-300"
                title="Duplicate intensity report for the same locality and PEIS level"
              >
                <AlertTriangle className="w-3 h-3 text-yellow-700 shrink-0" />
                <span>Duplicate</span>
              </span>
            )}
            {!isDuplicateRedundant && dupGroup && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-yellow-50 text-yellow-900 border-yellow-300"
                title={`Part of a duplicate group (${dupGroup.count} matching records)`}
              >
                <AlertTriangle className="w-3 h-3 text-yellow-700 shrink-0" />
                <span>Dup ×{dupGroup.count}</span>
              </span>
            )}
            {isLiveConflictMatch && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-yellow-200/80 text-yellow-950 border-yellow-400"
                title="Matches the locality currently entered in Quick Entry"
              >
                <AlertTriangle className="w-3 h-3 text-yellow-800 shrink-0" />
                <span>Active Match</span>
              </span>
            )}
          </div>
        </td>
        <td className="px-2.5 py-2 whitespace-nowrap text-right">
          {isConfirmingDelete ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleConfirmDeleteEntry(entry)}
                className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10.5px] font-semibold hover:bg-rose-700 whitespace-nowrap"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-700 text-[10.5px] font-medium hover:bg-slate-50 whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1">
              {effectiveStatus === 'draft' && !conflictInfo && (
                <button
                  type="button"
                  onClick={() => handleQuickVerifyEntry(entry)}
                  title="Verify report for bulletin inclusion"
                  className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[10.5px] font-semibold whitespace-nowrap shrink-0"
                >
                  <Check className="w-3 h-3" />
                  <span>Verify</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingEntry(entry)}
                title="Edit intensity report"
                aria-label={`Edit ${entry.locality}`}
                className="p-1 rounded border border-transparent text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(entry.id)}
                title="Remove intensity report"
                aria-label={`Remove ${entry.locality}`}
                className="p-1 rounded border border-transparent text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>
      </tr>
    );
  };

  const renderQuickValidationStrip = (
    validation: CandidateIntensityValidation,
    onApplyCandidate: (municipality: string, province: string) => void,
    isInstrumental = false
  ) => {
    if (validation.geographicStatus === 'empty') return null;

    return (
      <div className="space-y-1.5" aria-live="polite">
        <div
          className={`px-3 py-1.5 rounded-md border text-[11px] flex items-start gap-2 ${
            validation.geographicStatus === 'matched'
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          {validation.geographicStatus === 'matched' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <div>
              {validation.geographicMessage}
              {validation.geographicStatus === 'not-found' && isInstrumental
                ? ' Unlisted station labels remain allowed for manual instrumental records.'
                : validation.geographicStatus === 'not-found'
                  ? ' Adding anyway will mark the entry as Unresolved for review.'
                  : ''}
            </div>
            {validation.geographicStatus === 'ambiguous' &&
              validation.candidates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10.5px] font-semibold text-amber-900">
                    Select matching province:
                  </span>
                  {validation.candidates.map((cand) => (
                    <button
                      key={`${cand.province}::${cand.municipality}`}
                      type="button"
                      onClick={() => onApplyCandidate(cand.municipality, cand.province)}
                      className="px-2 py-0.5 rounded border border-amber-300 bg-white text-[10.5px] font-semibold text-amber-950 hover:bg-amber-100 whitespace-nowrap"
                    >
                      {cand.municipality}, {cand.province}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>

        {validation.duplicateKind !== 'none' && (
          <div
            role="alert"
            className={`px-3 py-2 rounded-md border text-[11px] flex items-start gap-2 ${
              validation.hasExactDuplicate
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-yellow-50 border-yellow-300 text-yellow-950'
            }`}
          >
            <AlertTriangle
              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                validation.hasExactDuplicate ? 'text-rose-700' : 'text-yellow-700'
              }`}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <span className="font-bold uppercase tracking-wide mr-1.5">
                  {validation.hasExactDuplicate
                    ? 'Duplicate Blocked:'
                    : validation.hasConflictingPeis
                      ? 'Conflict Warning:'
                      : 'Existing Locality Alert:'}
                </span>
                <span>{validation.duplicateMessage}</span>
              </div>
              {validation.matchingLocalityEntries.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                  <span className="font-medium opacity-90">
                    Matching table {validation.matchingLocalityEntries.length === 1 ? 'row' : 'rows'} highlighted in yellow below:
                  </span>
                  {validation.matchingLocalityEntries.slice(0, 2).map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => setEditingEntry(match)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-yellow-400 bg-white text-[10.5px] font-semibold text-slate-900 hover:bg-yellow-100 whitespace-nowrap shrink-0"
                    >
                      <Pencil className="w-3 h-3 text-yellow-700" />
                      <span>
                        Edit Existing (PEIS {match.peis} · {match.locality})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="bg-gradient-to-br from-sky-50/90 via-slate-100/95 to-indigo-50/90 border border-slate-300/90 rounded-xl overflow-hidden shadow-sm p-3.5 sm:p-4 space-y-3.5">
      {/* GROUP 1 — ACTIVE EARTHQUAKE INFORMATION (SKY BLUE HUE + GLOW) */}
      <div className="rounded-lg border border-sky-300/90 bg-sky-50/95 overflow-hidden shadow-[0_4px_18px_-3px_rgba(14,165,233,0.28)] hover:shadow-[0_6px_22px_-2px_rgba(14,165,233,0.36)] ring-1 ring-sky-200/70 transition-shadow">
        <div className="px-4 py-2.5 bg-sky-100/85 border-b border-sky-200/90 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-700" />
            <h2 className="text-sm font-semibold text-sky-950 tracking-tight">
              Intensity Input &amp; Macroseismic Operations (PEIS)
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${
                feltSummary.isFeltFlag
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : feltSummary.code === 'pending'
                    ? 'bg-white text-sky-900 border-sky-300'
                    : 'bg-white/90 text-slate-700 border-slate-300'
              }`}
            >
              Felt: {feltSummary.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${
                isDirty
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
              }`}
            >
              {isSaving ? 'Saving…' : isDirty ? 'Unsaved Changes' : 'Saved'}
            </span>
          </div>
        </div>

        {/* Read-only event telemetry metadata strip */}
        <div className="px-4 py-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2 text-xs">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/80">
              Active Event ID
            </div>
            <div
              className="font-mono font-semibold text-slate-900 truncate"
              title={event.filename || event.id}
            >
              {event.id}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/80">
              Origin Date &amp; Time (UTC)
            </div>
            <div className="font-mono font-medium text-slate-900 tabular-nums">
              {event.originDateGmt} {event.originTimeGmt}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/80">
              Magnitude
            </div>
            <div className="font-mono font-semibold text-slate-900 tabular-nums">
              {magResolution.isStale
                ? magResolution.displayText
                : unlocated && preferredMag === 0
                  ? 'Pending'
                  : `${preferredScaleLabel} ${preferredMag.toFixed(1)}`}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/80">
              Focal Depth
            </div>
            <div className="font-mono font-medium text-slate-900 tabular-nums">
              {unlocated ? 'Pending' : `${event.depthKm.toFixed(1)} km`}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/80">
              Report Status
            </div>
            <div className="font-mono font-medium text-slate-800">
              {reportStatusSummary}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-800/80">
              Philippine Catalog
            </div>
            <div className="font-mono text-slate-700 tabular-nums">
              {localityIndex.provinces.length} provinces ·{' '}
              {localityIndex.allRecords.length.toLocaleString()} LGUs
            </div>
          </div>
        </div>
      </div>

      {/* GROUP 2 — TOP SUMMARY KPI CARDS (INDIGO TRAY + DISTINCT GLOWING CARD HUES) */}
      <div
        aria-label="Intensity report summary overview"
        className="rounded-lg border border-indigo-200/90 bg-indigo-100/65 p-1.5 grid grid-cols-2 lg:grid-cols-4 gap-2 shadow-[0_4px_18px_-3px_rgba(99,102,241,0.20)] ring-1 ring-indigo-200/60"
      >
        <button
          type="button"
          onClick={() => {
            setFilterStatus('all');
            setFilterConflictsOnly(false);
            setFilterInstrConflictsOnly(false);
            if (activeTab === 'raw-import') setActiveTab('reported');
          }}
          className={`text-left px-2.5 py-1.5 rounded-md border transition-all ${
            activeTab !== 'raw-import' &&
            filterStatus === 'all' &&
            !filterConflictsOnly &&
            !filterInstrConflictsOnly
              ? 'bg-blue-100 border-blue-400 ring-1 ring-blue-300 shadow-[0_4px_16px_-2px_rgba(59,130,246,0.38)]'
              : 'bg-blue-50/95 border-blue-200 hover:bg-blue-100/90 hover:border-blue-300 shadow-[0_3px_14px_-3px_rgba(59,130,246,0.24)] hover:shadow-[0_4px_16px_-2px_rgba(59,130,246,0.32)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-900/80">
              Total Reports
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-base font-mono font-bold text-slate-900 tabular-nums leading-none">
                {analysis.counts.total}
              </span>
              <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            </div>
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-600 truncate leading-tight">
            {analysis.counts.feltTotal} felt · {analysis.counts.instrumentalTotal} instrumental
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterStatus('verified');
            setFilterConflictsOnly(false);
            if (activeTab === 'raw-import') setActiveTab('reported');
          }}
          className={`text-left px-2.5 py-1.5 rounded-md border transition-all ${
            activeTab === 'reported' && !filterConflictsOnly && filterStatus === 'verified'
              ? 'bg-emerald-100 border-emerald-400 ring-1 ring-emerald-300 shadow-[0_4px_16px_-2px_rgba(16,185,129,0.38)]'
              : 'bg-emerald-50/95 border-emerald-200 hover:bg-emerald-100/90 hover:border-emerald-300 shadow-[0_3px_14px_-3px_rgba(16,185,129,0.24)] hover:shadow-[0_4px_16px_-2px_rgba(16,185,129,0.32)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-900/80">
              Verified
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-base font-mono font-bold text-emerald-800 tabular-nums leading-none">
                {analysis.counts.verified}
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            </div>
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-600 truncate leading-tight">
            {analysis.counts.unresolved > 0
              ? `Bulletin ready · ${analysis.counts.unresolved} unresolved`
              : 'Eligible for bulletin output'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterStatus('draft');
            setFilterConflictsOnly(false);
            if (activeTab === 'raw-import') setActiveTab('reported');
          }}
          className={`text-left px-2.5 py-1.5 rounded-md border transition-all ${
            activeTab === 'reported' && !filterConflictsOnly && filterStatus === 'draft'
              ? 'bg-violet-100 border-violet-400 ring-1 ring-violet-300 shadow-[0_4px_16px_-2px_rgba(139,92,246,0.38)]'
              : 'bg-violet-50/95 border-violet-200 hover:bg-violet-100/90 hover:border-violet-300 shadow-[0_3px_14px_-3px_rgba(139,92,246,0.24)] hover:shadow-[0_4px_16px_-2px_rgba(139,92,246,0.32)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-900/80">
              Draft
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-base font-mono font-bold text-violet-950 tabular-nums leading-none">
                {analysis.counts.draft}
              </span>
              <Clock className="w-3.5 h-3.5 text-violet-600 shrink-0" />
            </div>
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-600 truncate leading-tight">
            Pending seismologist review
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterStatus('all');
            if (activeTab === 'instrumental') {
              setFilterInstrConflictsOnly(true);
            } else {
              setActiveTab('reported');
              setFilterConflictsOnly(true);
            }
          }}
          className={`text-left px-2.5 py-1.5 rounded-md border transition-all ${
            (activeTab === 'reported' && filterConflictsOnly) ||
            (activeTab === 'instrumental' && filterInstrConflictsOnly)
              ? 'bg-yellow-100 border-yellow-400 ring-1 ring-yellow-300 shadow-[0_4px_16px_-2px_rgba(245,158,11,0.40)]'
              : analysis.counts.conflicting > 0 || analysis.counts.duplicateEntries > 0
                ? 'bg-amber-50/95 border-amber-300 hover:bg-amber-100/90 shadow-[0_3px_14px_-3px_rgba(245,158,11,0.28)] hover:shadow-[0_4px_16px_-2px_rgba(245,158,11,0.36)]'
                : 'bg-slate-50/95 border-slate-300 hover:bg-white shadow-[0_3px_14px_-3px_rgba(100,116,139,0.20)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-900/80">
              Conflicts
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-base font-mono font-bold tabular-nums leading-none ${
                  analysis.counts.conflicting > 0 ? 'text-amber-950' : 'text-slate-800'
                }`}
              >
                {analysis.counts.conflicting}
              </span>
              <AlertTriangle
                className={`w-3.5 h-3.5 shrink-0 ${
                  analysis.counts.conflicting > 0 || analysis.counts.duplicateEntries > 0
                    ? 'text-amber-700'
                    : 'text-slate-500'
                }`}
              />
            </div>
          </div>
          <div className="mt-0.5 text-[10.5px] text-slate-600 truncate leading-tight">
            {analysis.counts.conflictGroups} localit
            {analysis.counts.conflictGroups === 1 ? 'y' : 'ies'}
            {analysis.counts.duplicateEntries > 0
              ? ` · ${analysis.counts.duplicateEntries} duplicate${
                  analysis.counts.duplicateEntries === 1 ? '' : 's'
                }`
              : ''}
          </div>
        </button>
      </div>

      {/* UNIFIED TABBED PANEL (CONNECTED TAB STRIP + ACTIVE TAB BODY) */}
      <div className="rounded-xl shadow-[0_6px_22px_-4px_rgba(14,165,233,0.18)]">
        {/* TAB STRIP */}
        <div className="px-3 pt-2 rounded-t-xl border border-slate-300/90 bg-slate-200/80 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-end gap-1.5" role="tablist" aria-label="Intensity operations tabs">
            {(
              [
                {
                  id: 'reported',
                  label: 'REPORTED INTENSITY',
                  count: analysis.counts.feltTotal,
                  activeAccent: 'border-t-cyan-600 text-cyan-950',
                  badgeActive: 'bg-cyan-100 text-cyan-900',
                },
                {
                  id: 'instrumental',
                  label: 'INSTRUMENTAL INTENSITY',
                  count: analysis.counts.instrumentalTotal,
                  activeAccent: 'border-t-indigo-600 text-indigo-950',
                  badgeActive: 'bg-indigo-100 text-indigo-900',
                },
                {
                  id: 'raw-import',
                  label: 'RAW TEXT / IMPORT',
                  count: rawParseSnapshot ? rawParseSnapshot.summary.parsed : null,
                  activeAccent: 'border-t-emerald-600 text-emerald-950',
                  badgeActive: 'bg-emerald-100 text-emerald-900',
                },
              ] as Array<{
                id: InternalTabId;
                label: string;
                count: number | null;
                activeAccent: string;
                badgeActive: string;
              }>
            ).map((tab) => {
              const active = !resolveConflictsMode && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setResolveConflictsMode(false);
                    setActiveTab(tab.id);
                  }}
                  className={`px-3.5 py-2 text-[11.5px] tracking-wide rounded-t-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                    active
                      ? `relative z-10 -mb-px font-bold bg-white/95 border-x border-t-2 border-slate-300/90 shadow-[0_2px_0_0_rgba(255,255,255,0.98)] ${tab.activeAccent}`
                      : 'mb-0 font-semibold border border-b-0 border-slate-300/70 bg-slate-100/75 text-slate-600 hover:text-slate-900 hover:bg-white/65'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span
                      className={`font-mono text-[10.5px] px-1.5 py-0.2 rounded-xs tabular-nums ${
                        active
                          ? tab.badgeActive
                          : 'bg-slate-200/90 text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-pressed={resolveConflictsMode}
            onClick={() => setResolveConflictsMode((prev) => !prev)}
            className={`mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
              resolveConflictsMode
                ? 'bg-amber-200 border-amber-400 text-amber-950 shadow-xs'
                : conflictResolutionGroups.length > 0
                  ? 'bg-amber-100 border-amber-300 text-amber-950 hover:bg-amber-200 shadow-xs'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5 text-amber-800 shrink-0" />
            <span>Resolve Conflicts</span>
            {conflictResolutionGroups.length > 0 && (
              <span className="font-mono text-[10.5px] tabular-nums">
                ({conflictResolutionGroups.length})
              </span>
            )}
          </button>
        </div>

        {/* CONNECTED TAB PANEL BODY */}
        <div
          role="tabpanel"
          className="rounded-b-xl border-x border-b border-slate-300/90 bg-white/95 p-3.5"
        >
          {/* RESOLVE CONFLICTS SIDE-BY-SIDE WORKSPACE (AMBER HUE + GLOW) */}
          {resolveConflictsMode && (
            <div className="rounded-lg border border-amber-400/85 bg-white overflow-hidden shadow-[0_4px_20px_-3px_rgba(245,158,11,0.30)] ring-1 ring-amber-200/70">
          <IntensityConflictResolver
            conflictGroups={conflictResolutionGroups}
            peisBadgeClass={PEIS_BADGE_CLASS}
            onSelectWinner={handleSelectConflictWinner}
            onMergeGroup={handleMergeConflictGroup}
            onEditEntry={(entry) => setEditingEntry(entry)}
            onRemoveEntry={handleConfirmDeleteEntry}
            onExit={() => setResolveConflictsMode(false)}
          />
        </div>
      )}

      {/* TAB 1: REPORTED INTENSITY */}
      {!resolveConflictsMode && activeTab === 'reported' && (
        <div className="space-y-3.5">
          {/* Quick Intensity Entry Card (CYAN HUE + GLOW) */}
          <form
            onSubmit={handleSubmitQuickReported}
            className="p-4 rounded-lg border border-cyan-300/90 bg-cyan-50/95 space-y-3 shadow-[0_4px_20px_-3px_rgba(6,182,212,0.28)] hover:shadow-[0_6px_24px_-2px_rgba(6,182,212,0.36)] ring-1 ring-cyan-200/70 transition-shadow"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-cyan-200/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-950">
                Quick Intensity Entry — Felt / Macroseismic (PEIS I–X)
              </div>
              <span className="text-[11px] text-cyan-900/80">
                Press <kbd className="px-1.5 py-0.5 bg-white border border-cyan-300 rounded text-[10px] font-mono text-cyan-950">Enter</kbd> to add &amp; continue with same PEIS/Province
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
              {/* A. PEIS Intensity */}
              <div className="lg:col-span-2">
                <label
                  htmlFor="quick-peis-select"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  PEIS Intensity
                </label>
                <select
                  id="quick-peis-select"
                  aria-label="PEIS Intensity"
                  value={quickPeis}
                  onChange={(e) => setQuickPeis(e.target.value as PeisRoman)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                >
                  {PEIS_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl} — {PEIS_DESCRIPTORS[lvl]}
                    </option>
                  ))}
                </select>
              </div>

              {/* B. Province */}
              <div className="lg:col-span-3">
                <label
                  htmlFor="quick-province-combo"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Province
                </label>
                <SearchableSelectCombobox
                  id="quick-province-combo"
                  ariaLabel="Province"
                  value={quickProvince}
                  options={localityIndex.provinces}
                  placeholder="Search province..."
                  onDropdownOpenChange={setProvinceDropdownOpen}
                  onSelectValue={(val) => {
                    setQuickProvince(val);
                    setQuickLocality('');
                  }}
                />
              </div>

              {/* C. City / Municipality */}
              <div className="lg:col-span-3">
                <label
                  htmlFor="quick-locality-combo"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  City / Municipality
                </label>
                <SearchableSelectCombobox
                  id="quick-locality-combo"
                  inputRef={localityInputRef}
                  ariaLabel="City / Municipality"
                  value={quickLocality}
                  options={quickLocalityOptions}
                  allowCustomValue
                  placeholder={
                    quickProvince
                      ? `Type municipality in ${quickProvince}...`
                      : 'Search city or municipality...'
                  }
                  onDropdownOpenChange={setLocalityDropdownOpen}
                  onSelectValue={handleSelectQuickLocalityOption}
                  onChangeCustomValue={(val) => setQuickLocality(val)}
                />
              </div>

              {/* D. Specific Location (Optional) */}
              <div className="lg:col-span-2">
                <label
                  htmlFor="quick-specific-loc"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Specific Location (Opt.)
                </label>
                <input
                  id="quick-specific-loc"
                  type="text"
                  value={quickSpecificLocation}
                  onChange={(e) => setQuickSpecificLocation(e.target.value)}
                  placeholder="Barangay / District"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* E. Report Source (Optional) */}
              <div className="lg:col-span-2">
                <label
                  htmlFor="quick-report-source"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Report Source (Opt.)
                </label>
                <input
                  id="quick-report-source"
                  type="text"
                  list="quick-source-suggestions"
                  value={quickReportSource}
                  onChange={(e) => setQuickReportSource(e.target.value)}
                  placeholder="Official / Field / LGU"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                />
                <datalist id="quick-source-suggestions">
                  {REPORT_SOURCE_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </div>

            {renderQuickValidationStrip(
              quickReportedValidation,
              (muni, prov) => {
                setQuickProvince(prov);
                setQuickLocality(muni);
              },
              false
            )}

            {/* Action Buttons & Explicit Status Control (Source never auto-verifies) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={quickReportedValidation.hasExactDuplicate}
                  title={
                    quickReportedValidation.hasExactDuplicate
                      ? 'Duplicate intensity report already exists for this locality'
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ADD INTENSITY</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMultiModalCategory('felt');
                    setMultiModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-700" />
                  <span>ADD MULTIPLE LOCATIONS</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearQuickReported}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>CLEAR INPUT</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <label
                  htmlFor="quick-review-status"
                  className="text-[11px] font-medium text-slate-600 whitespace-nowrap"
                >
                  Entry Review Status:
                </label>
                <select
                  id="quick-review-status"
                  value={quickReviewStatus}
                  onChange={(e) =>
                    setQuickReviewStatus(e.target.value as 'draft' | 'verified')
                  }
                  className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                >
                  <option value="draft">Draft (Needs Review)</option>
                  <option value="verified">Verified (Ready for Bulletin)</option>
                </select>
              </div>
            </div>
          </form>

          {/* Main Split: ~65% Recorded Intensities Table (TEAL) | ~35% Automatic Bulletin Preview (AMBER) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,65fr)_minmax(310px,35fr)] gap-3.5 items-stretch">
            {/* LEFT (~65%): RECORDED INTENSITIES TABLE CARD (TEAL HUE + GLOW) */}
            <div className="min-w-0 flex flex-col rounded-lg border border-teal-300/90 bg-white overflow-hidden shadow-[0_4px_20px_-3px_rgba(20,184,166,0.26)] hover:shadow-[0_6px_24px_-2px_rgba(20,184,166,0.34)] ring-1 ring-teal-200/70 transition-shadow">
              {/* Summary Strip + Filters */}
              <div className="px-4 py-2.5 bg-teal-50/95 border-b border-teal-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-600">
                    <span>
                      Total Reports:{' '}
                      <strong className="font-mono text-slate-900 tabular-nums">
                        {analysis.counts.feltTotal}
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Verified:{' '}
                      <strong className="font-mono text-emerald-700 tabular-nums">
                        {
                          event.intensities.filter(
                            (e) =>
                              normalizeIntensityCategory(e) === 'felt' &&
                              normalizeIntensityReviewStatus(e) === 'verified' &&
                              !analysis.conflictByEntryId.has(e.id)
                          ).length
                        }
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Draft:{' '}
                      <strong className="font-mono text-slate-800 tabular-nums">
                        {
                          event.intensities.filter(
                            (e) =>
                              normalizeIntensityCategory(e) === 'felt' &&
                              normalizeIntensityReviewStatus(e) === 'draft' &&
                              !analysis.conflictByEntryId.has(e.id)
                          ).length
                        }
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Conflicts:{' '}
                      <strong
                        className={`font-mono tabular-nums ${
                          analysis.counts.conflictGroups > 0
                            ? 'text-amber-700'
                            : 'text-slate-700'
                        }`}
                      >
                        {analysis.counts.conflictGroups}
                      </strong>
                    </span>
                  </div>

                  {verifyEligibleDraftCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleVerifyAllEligibleDrafts('felt')}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verify {verifyEligibleDraftCount} Draft{verifyEligibleDraftCount === 1 ? '' : 's'}</span>
                    </button>
                  )}
                </div>

                {/* Search & Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      aria-label="Search recorded localities or provinces"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search locality, province, or source..."
                      className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <select
                    aria-label="Filter by PEIS intensity"
                    value={filterPeis}
                    onChange={(e) => setFilterPeis(e.target.value as 'all' | PeisRoman)}
                    className="px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                  >
                    <option value="all">All PEIS</option>
                    {[...PEIS_LEVELS].reverse().map((lvl) => (
                      <option key={lvl} value={lvl}>
                        PEIS {lvl}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter by review status"
                    value={filterConflictsOnly ? 'conflicting' : filterStatus}
                    onChange={(e) => {
                      const next = e.target.value as StatusFilterValue;
                      setFilterStatus(next);
                      setFilterConflictsOnly(next === 'conflicting');
                    }}
                    className="px-2 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
                  >
                    <option value="all">All Statuses</option>
                    <option value="verified">Verified</option>
                    <option value="draft">Draft</option>
                    <option value="conflicting">Conflicting</option>
                    <option value="unresolved">Unresolved</option>
                  </select>

                  <button
                    type="button"
                    aria-pressed={filterConflictsOnly}
                    onClick={() => {
                      setFilterConflictsOnly((prev) => {
                        const next = !prev;
                        if (next) setFilterStatus('all');
                        return next;
                      });
                    }}
                    title="Show only entries flagged as conflicting for faster review"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      filterConflictsOnly
                        ? 'bg-yellow-100 border-yellow-400 text-yellow-950'
                        : feltConflictingRowCount > 0
                          ? 'bg-yellow-50 border-yellow-300 text-yellow-900 hover:bg-yellow-100'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-700 shrink-0" />
                    <span>Filter Conflicts</span>
                    {feltConflictingRowCount > 0 && (
                      <span className="font-mono text-[10.5px] tabular-nums">
                        ({feltConflictingRowCount})
                      </span>
                    )}
                  </button>
                </div>
              </div>

                  {/* Conflict Warning Banner */}
              {feltConflictsList.length > 0 && (
                <div
                  role="alert"
                  className="px-4 py-2 bg-yellow-50 border-b border-yellow-300 text-[11px] text-yellow-950 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0 mt-0.5" />
                    <div>
                      <strong>Conflicting Intensity Reports Detected:</strong>{' '}
                      {feltConflictsList
                        .map(
                          (c) =>
                            `${c.localityDisplay} (${c.peisValues.join(' vs ')})`
                        )
                        .join('; ')}
                      . Highlighted in yellow below and excluded from the bulletin until reviewed.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResolveConflictsMode(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-yellow-400 bg-white text-[11px] font-semibold text-yellow-950 hover:bg-yellow-100 whitespace-nowrap shrink-0"
                  >
                    <GitMerge className="w-3 h-3 text-yellow-800" />
                    <span>Resolve Conflicts</span>
                  </button>
                </div>
              )}

              {/* Duplicate Reports Warning Banner */}
              {feltDuplicateGroups.length > 0 && (
                <div
                  role="alert"
                  className="px-4 py-2 bg-yellow-50 border-b border-yellow-300 text-[11px] text-yellow-950 flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0 mt-0.5" />
                  <div>
                    <strong>Duplicate Intensity Reports Detected:</strong>{' '}
                    {feltDuplicateGroups
                      .map((g) => `Intensity ${g.peis} - ${g.localityDisplay} (×${g.count})`)
                      .join('; ')}
                    . Highlighted in yellow below — remove redundant rows or edit specific location details to resolve.
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className="overflow-x-auto flex-1 min-h-[260px] max-h-[420px] overflow-y-auto">
                {reportedRows.length === 0 ? (
                  <div className="py-12 px-4 text-center text-xs text-slate-500 space-y-2">
                    <div>
                      {analysis.counts.feltTotal === 0
                        ? 'No reported intensities recorded for this event yet. Use Quick Entry above, Add Multiple Locations, or Raw Text / Import.'
                        : filterConflictsOnly
                          ? 'No conflicting reported intensity entries found.'
                          : 'No reported intensity records match your current search or filter criteria.'}
                    </div>
                    {filterConflictsOnly && analysis.counts.feltTotal > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterConflictsOnly(false)}
                        className="inline-flex items-center px-2.5 py-1 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Show All Reports
                      </button>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-teal-50/85 border-b border-teal-200 text-[10.5px] font-bold uppercase tracking-wider text-teal-900 sticky top-0 z-10">
                      <tr>
                        <th className="px-2.5 py-2 w-8">#</th>
                        <th className="px-2.5 py-2 w-16">PEIS</th>
                        <th className="px-2.5 py-2">Province</th>
                        <th className="px-2.5 py-2">City / Municipality</th>
                        <th className="px-2.5 py-2">Specific Location</th>
                        <th className="px-2.5 py-2 w-24">Status</th>
                        <th className="px-2.5 py-2 text-right w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportedRows.map((entry, idx) =>
                        renderIntensityRow(entry, idx + 1)
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* RIGHT (~35%): AUTOMATIC BULLETIN PREVIEW CARD (AMBER HUE + GLOW) */}
            <div className="rounded-lg border border-amber-300/90 bg-amber-50/85 overflow-hidden shadow-[0_4px_20px_-3px_rgba(245,158,11,0.28)] hover:shadow-[0_6px_24px_-2px_rgba(245,158,11,0.36)] ring-1 ring-amber-200/70 transition-shadow flex flex-col">
              <div className="px-4 py-2.5 bg-amber-100/80 border-b border-amber-200 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-950">
                    Automatic Bulletin Preview
                  </div>
                  <div className="text-[11px] text-amber-900/80">
                    {groupedBulletin.eligibleFeltCount} verified felt
                    {groupedBulletin.excludedFeltCount > 0
                      ? ` · ${groupedBulletin.excludedFeltCount} excluded pending review`
                      : ''}
                  </div>
                </div>
                {hasBulletinOverride && (
                  <button
                    type="button"
                    onClick={handleResetBulletinOverride}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white text-[10.5px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    title="Discard manual override text and regenerate from verified entries"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Auto</span>
                  </button>
                )}
              </div>

              {hasBulletinOverride && (
                <div className="px-3.5 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] font-medium text-amber-900">
                  Manual Bulletin Text Override Active — underlying structured reports remain preserved.
                </div>
              )}

              <div className="p-3.5 flex-1 flex flex-col gap-3">
                {isEditingBulletinText ? (
                  <textarea
                    aria-label="Manual bulletin intensity text override"
                    rows={10}
                    value={event.intensityBulletinOverride ?? groupedBulletin.text}
                    onChange={(e) =>
                      onChangeEvent((ev) => ({
                        ...ev,
                        intensityBulletinOverride: e.target.value,
                      }))
                    }
                    spellCheck={false}
                    className="w-full flex-1 min-h-[210px] p-2.5 text-xs font-mono leading-relaxed text-slate-900 bg-white border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y"
                  />
                ) : (
                  <div className="flex-1 min-h-[210px] p-3 bg-white border border-slate-200 rounded-md overflow-auto">
                    {activeBulletinPreviewText.trim() ? (
                      <pre className="text-xs font-mono leading-relaxed text-slate-900 whitespace-pre">
                        {activeBulletinPreviewText}
                      </pre>
                    ) : (
                      <div className="h-full flex items-center justify-center text-center text-xs text-slate-400 px-3">
                        No verified, non-conflicting reported intensities eligible for bulletin output yet.
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyBulletinText}
                    disabled={!activeBulletinPreviewText.trim()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap shrink-0"
                  >
                    {copiedBulletin ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{copiedBulletin ? 'COPIED' : 'COPY'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleEditBulletinText}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isEditingBulletinText
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{isEditingBulletinText ? 'DONE EDITING' : 'EDIT TEXT'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onSendToBulletin}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>SEND TO BULLETIN</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INSTRUMENTAL INTENSITY */}
      {!resolveConflictsMode && activeTab === 'instrumental' && (
        <div className="space-y-3.5">
          {/* Instrumental Entry Card (INDIGO HUE + GLOW) */}
          <div className="rounded-lg border border-indigo-300/90 bg-indigo-50/95 overflow-hidden shadow-[0_4px_20px_-3px_rgba(99,102,241,0.26)] hover:shadow-[0_6px_24px_-2px_rgba(99,102,241,0.34)] ring-1 ring-indigo-200/70 transition-shadow">
            <div className="px-4 py-2.5 bg-indigo-100/85 border-b border-indigo-200 text-xs text-indigo-950 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Instrumental Intensity Records:</strong> Manually entered or imported station intensity readings. No external live telemetry feed is connected.
              </span>
              <button
                type="button"
                onClick={() => {
                  setRawImportCategoryMode('instrumental');
                  setActiveTab('raw-import');
                }}
                className="text-[11px] font-semibold text-indigo-800 hover:underline whitespace-nowrap"
              >
                Import Instrumental Text →
              </button>
            </div>

            <form
              onSubmit={handleSubmitQuickInstrumental}
              className="p-4 space-y-3"
            >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
              <div className="lg:col-span-2">
                <label
                  htmlFor="instr-peis-select"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  PEIS Intensity
                </label>
                <select
                  id="instr-peis-select"
                  value={instrPeis}
                  onChange={(e) => setInstrPeis(e.target.value as PeisRoman)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                >
                  {PEIS_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl} — {PEIS_DESCRIPTORS[lvl]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3">
                <label
                  htmlFor="instr-province-combo"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Province
                </label>
                <SearchableSelectCombobox
                  id="instr-province-combo"
                  ariaLabel="Instrumental Province"
                  value={instrProvince}
                  options={localityIndex.provinces}
                  placeholder="Search province..."
                  onDropdownOpenChange={setInstrProvDropdownOpen}
                  onSelectValue={(val) => {
                    setInstrProvince(val);
                    setInstrLocality('');
                  }}
                />
              </div>

              <div className="lg:col-span-3">
                <label
                  htmlFor="instr-locality-combo"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Station / City / Municipality
                </label>
                <SearchableSelectCombobox
                  id="instr-locality-combo"
                  inputRef={instrLocalityInputRef}
                  ariaLabel="Instrumental Station or Locality"
                  value={instrLocality}
                  options={instrLocalityOptions}
                  allowCustomValue
                  placeholder="e.g. Nabunturan, Davao de Oro"
                  onDropdownOpenChange={setInstrLocDropdownOpen}
                  onSelectValue={handleSelectInstrLocalityOption}
                  onChangeCustomValue={(val) => setInstrLocality(val)}
                />
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="instr-specific-loc"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Station / Sensor Site (Opt.)
                </label>
                <input
                  id="instr-specific-loc"
                  type="text"
                  value={instrSpecificLocation}
                  onChange={(e) => setInstrSpecificLocation(e.target.value)}
                  placeholder="e.g. Intensity Meter"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="lg:col-span-2">
                <label
                  htmlFor="instr-source"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Source / Network (Opt.)
                </label>
                <input
                  id="instr-source"
                  type="text"
                  value={instrReportSource}
                  onChange={(e) => setInstrReportSource(e.target.value)}
                  placeholder="PHIVOLCS Station"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {renderQuickValidationStrip(
              quickInstrumentalValidation,
              (muni, prov) => {
                setInstrProvince(prov);
                setInstrLocality(muni);
              },
              true
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={quickInstrumentalValidation.hasExactDuplicate}
                  title={
                    quickInstrumentalValidation.hasExactDuplicate
                      ? 'Duplicate instrumental report already exists for this locality'
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-indigo-700 text-white text-xs font-semibold hover:bg-indigo-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ADD INSTRUMENTAL</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMultiModalCategory('instrumental');
                    setMultiModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-700" />
                  <span>ADD MULTIPLE LOCATIONS</span>
                </button>
              </div>

              <select
                aria-label="Instrumental review status"
                value={instrReviewStatus}
                onChange={(e) =>
                  setInstrReviewStatus(e.target.value as 'draft' | 'verified')
                }
                className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
              >
                <option value="draft">Draft (Needs Review)</option>
                <option value="verified">Verified</option>
              </select>
            </div>
            </form>
          </div>

          {/* Instrumental Records Table Card (PURPLE HUE + GLOW) */}
          <div className="rounded-lg border border-purple-300/90 bg-white overflow-hidden shadow-[0_4px_20px_-3px_rgba(168,85,247,0.25)] hover:shadow-[0_6px_24px_-2px_rgba(168,85,247,0.33)] ring-1 ring-purple-200/70 transition-shadow">
          {instrumentalConflictsList.length > 0 && (
            <div
              role="alert"
              className="px-4 py-2 bg-yellow-50 border-b border-yellow-300 text-[11px] text-yellow-950 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Conflicting Instrumental Reports Detected:</strong>{' '}
                  {instrumentalConflictsList
                    .map((c) => `${c.localityDisplay} (${c.peisValues.join(' vs ')})`)
                    .join('; ')}
                  . Highlighted in yellow below and excluded from the bulletin until reviewed.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResolveConflictsMode(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-yellow-400 bg-white text-[11px] font-semibold text-yellow-950 hover:bg-yellow-100 whitespace-nowrap shrink-0"
              >
                <GitMerge className="w-3 h-3 text-yellow-800" />
                <span>Resolve Conflicts</span>
              </button>
            </div>
          )}

          {instrumentalDuplicateGroups.length > 0 && (
            <div
              role="alert"
              className="px-4 py-2 bg-yellow-50 border-b border-yellow-300 text-[11px] text-yellow-950 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0 mt-0.5" />
              <div>
                <strong>Duplicate Instrumental Reports Detected:</strong>{' '}
                {instrumentalDuplicateGroups
                  .map((g) => `Intensity ${g.peis} - ${g.localityDisplay} (×${g.count})`)
                  .join('; ')}
                . Highlighted in yellow below.
              </div>
            </div>
          )}

          {analysis.counts.instrumentalTotal > 0 && (
            <div className="px-4 py-2 bg-purple-50/90 border-b border-purple-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-[11.5px] text-slate-600">
                <span>
                  Instrumental Records:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums">
                    {analysis.counts.instrumentalTotal}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Conflicts:{' '}
                  <strong
                    className={`font-mono tabular-nums ${
                      instrumentalConflictingRowCount > 0
                        ? 'text-amber-700'
                        : 'text-slate-700'
                    }`}
                  >
                    {instrumentalConflictingRowCount}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                aria-pressed={filterInstrConflictsOnly}
                onClick={() => setFilterInstrConflictsOnly((prev) => !prev)}
                title="Show only instrumental entries flagged as conflicting"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  filterInstrConflictsOnly
                    ? 'bg-yellow-100 border-yellow-400 text-yellow-950'
                    : instrumentalConflictingRowCount > 0
                      ? 'bg-yellow-50 border-yellow-300 text-yellow-900 hover:bg-yellow-100'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-700 shrink-0" />
                <span>Filter Conflicts</span>
                {instrumentalConflictingRowCount > 0 && (
                  <span className="font-mono text-[10.5px] tabular-nums">
                    ({instrumentalConflictingRowCount})
                  </span>
                )}
              </button>
            </div>
          )}

          <div className="overflow-x-auto min-h-[200px] max-h-[380px] overflow-y-auto">
            {instrumentalRows.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-500 space-y-2">
                <div>
                  {analysis.counts.instrumentalTotal === 0
                    ? 'No instrumental intensities recorded for this event yet.'
                    : filterInstrConflictsOnly
                      ? 'No conflicting instrumental intensity entries found.'
                      : 'No instrumental records match the current filter.'}
                </div>
                {filterInstrConflictsOnly && analysis.counts.instrumentalTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterInstrConflictsOnly(false)}
                    className="inline-flex items-center px-2.5 py-1 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    Show All Instrumental
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-purple-50/85 border-b border-purple-200 text-[10.5px] font-bold uppercase tracking-wider text-purple-900 sticky top-0 z-10">
                  <tr>
                    <th className="px-2.5 py-2 w-8">#</th>
                    <th className="px-2.5 py-2 w-16">PEIS</th>
                    <th className="px-2.5 py-2">Province</th>
                    <th className="px-2.5 py-2">Station / Municipality</th>
                    <th className="px-2.5 py-2">Specific Location</th>
                    <th className="px-2.5 py-2 w-24">Status</th>
                    <th className="px-2.5 py-2 text-right w-28">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {instrumentalRows.map((entry, idx) =>
                    renderIntensityRow(entry, idx + 1)
                  )}
                </tbody>
              </table>
            )}
          </div>
          </div>
        </div>
      )}

      {/* TAB 3: RAW TEXT / IMPORT (EMERALD HUE + GLOW) */}
      {!resolveConflictsMode && activeTab === 'raw-import' && (
        <div className="p-4 space-y-4 rounded-lg border border-emerald-300/90 bg-emerald-50/95 shadow-[0_4px_20px_-3px_rgba(16,185,129,0.26)] hover:shadow-[0_6px_24px_-2px_rgba(16,185,129,0.34)] ring-1 ring-emerald-200/70 transition-shadow">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-emerald-200/80">
            <div className="flex items-center gap-2">
              <ClipboardPaste className="w-4 h-4 text-emerald-700" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                  Paste &amp; Parse Raw Intensity Reports
                </h3>
                <p className="text-[11px] text-emerald-900/80">
                  Supports multi-line blocks and combined phrases (e.g.{' '}
                  <code className="text-emerald-950 font-semibold">Intensity IV - Bato and San Miguel, Catanduanes</code>)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Raw import target category"
                value={rawImportCategoryMode}
                onChange={(e) =>
                  setRawImportCategoryMode(
                    e.target.value as 'auto' | 'felt' | 'instrumental'
                  )
                }
                className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-600"
              >
                <option value="auto">Auto-Detect (Felt / Instrumental)</option>
                <option value="felt">Force Reported (Felt)</option>
                <option value="instrumental">Force Instrumental</option>
              </select>

              <button
                type="button"
                onClick={() => {
                  setRawImportText(SAMPLE_MANUAL_INTENSITY_TEXT);
                  runRawTextParse(SAMPLE_MANUAL_INTENSITY_TEXT);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-slate-50 text-[11px] font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Load Sample</span>
              </button>
            </div>
          </div>

          <textarea
            ref={rawTextareaRef}
            aria-label="Raw intensity text editor"
            rows={7}
            value={rawImportText}
            onChange={(e) => {
              const nextVal = e.target.value;
              setRawImportText(nextVal);
              setRawDirtySinceParse(true);
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              if (pasted && !rawImportText.trim()) {
                window.setTimeout(() => runRawTextParse(pasted), 0);
              }
            }}
            placeholder={SAMPLE_MANUAL_INTENSITY_TEXT}
            spellCheck={false}
            className="w-full p-3 text-xs font-mono leading-relaxed text-slate-900 bg-white border border-emerald-300 rounded-md focus:bg-white focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 resize-y"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => runRawTextParse()}
                disabled={!rawImportText.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                <span>PARSE TEXT</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRawImportText('');
                  setRawParseSnapshot(null);
                  setRawDirtySinceParse(false);
                  onChangeEvent(
                    (ev) => ({ ...ev, rawIntensityImportText: '' }),
                    false
                  );
                }}
                className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                CLEAR
              </button>

              <button
                type="button"
                onClick={() => {
                  setRawParseSnapshot(null);
                  setRawDirtySinceParse(false);
                  setActiveTab('reported');
                }}
                className="px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 hover:bg-slate-100 whitespace-nowrap"
              >
                CANCEL
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddParsedToIntensityList}
              disabled={!rawImportText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-45 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD TO INTENSITY LIST</span>
            </button>
          </div>

          {/* Validation Summary & Preview Table */}
          {rawParseSnapshot && (
            <div className="border border-emerald-200 bg-white rounded-md overflow-hidden">
              <div className="px-3.5 py-2 bg-emerald-50/80 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    Parsed:{' '}
                    <strong className="font-mono text-slate-900 tabular-nums">
                      {rawParseSnapshot.summary.parsed}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Matched:{' '}
                    <strong className="font-mono text-emerald-700 tabular-nums">
                      {rawParseSnapshot.summary.matched}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Unresolved:{' '}
                    <strong
                      className={`font-mono tabular-nums ${
                        rawParseSnapshot.summary.unresolved > 0
                          ? 'text-rose-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {rawParseSnapshot.summary.unresolved}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Conflicts:{' '}
                    <strong
                      className={`font-mono tabular-nums ${
                        rawParseSnapshot.summary.conflicts > 0
                          ? 'text-amber-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {rawParseSnapshot.summary.conflicts}
                    </strong>
                  </span>
                  {rawParseSnapshot.summary.duplicates > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-slate-500">
                        Duplicates skipped:{' '}
                        <strong className="font-mono tabular-nums">
                          {rawParseSnapshot.summary.duplicates}
                        </strong>
                      </span>
                    </>
                  )}
                </div>

                {rawDirtySinceParse && (
                  <span className="text-[11px] font-medium text-amber-700">
                    Text edited — click PARSE TEXT to refresh preview
                  </span>
                )}
              </div>

              {rawParseSnapshot.unrecognizedLines.length > 0 && (
                <div className="px-3.5 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
                  <strong>{rawParseSnapshot.unrecognizedLines.length} unrecognized line(s):</strong>{' '}
                  {rawParseSnapshot.unrecognizedLines.slice(0, 3).join(' | ')}
                </div>
              )}

              <div className="max-h-72 overflow-y-auto">
                {rawParseSnapshot.rows.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No valid intensity entries parsed from raw text. Expected format:{' '}
                    <code className="text-slate-700">Intensity V - Virac, Catanduanes</code>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 w-20">PEIS</th>
                        <th className="px-3 py-2">Locality</th>
                        <th className="px-3 py-2">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {rawParseSnapshot.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/70">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center justify-center min-w-[2.2rem] px-1.5 py-0.5 text-[11px] font-mono font-bold rounded border ${PEIS_BADGE_CLASS[row.peis]}`}
                            >
                              {row.peis}
                            </span>
                            {row.category === 'instrumental' && (
                              <span className="ml-1.5 text-[10px] font-mono text-indigo-700">
                                INSTR
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {row.locality}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10.5px] font-semibold rounded border mr-2 ${
                                row.validationStatus === 'matched'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : row.validationStatus === 'conflict'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : row.validationStatus === 'duplicate'
                                      ? 'bg-slate-100 text-slate-600 border-slate-300'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {row.validationStatus === 'matched'
                                ? 'Matched'
                                : row.validationStatus === 'conflict'
                                  ? 'Conflict'
                                  : row.validationStatus === 'duplicate'
                                    ? 'Duplicate'
                                    : 'Unresolved'}
                            </span>
                            <span className="text-[11px] text-slate-600">
                              {row.validationNote}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      </div>

      {/* GROUP 4 — BOTTOM ACTION BAR (LIGHT COOL SLATE HUE + SUBTLE GLOW) */}
      <div className="px-4 py-2.5 rounded-lg border border-slate-300/90 bg-slate-200/85 shadow-[0_4px_16px_-3px_rgba(71,85,105,0.20)] ring-1 ring-white/60 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSaveIntensities}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'SAVING…' : 'SAVE INTENSITIES'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('raw-import');
              window.requestAnimationFrame(() => rawTextareaRef.current?.focus());
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-blue-700" />
            <span>IMPORT REPORTS</span>
          </button>

          <button
            type="button"
            onClick={handleExportIntensities}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>EXPORT</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToBulletin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-slate-700" />
            <span>BULLETIN</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-700">
          {event.intensities.length} total record{event.intensities.length === 1 ? '' : 's'} attached to{' '}
          <span className="font-mono font-semibold text-slate-950">{event.id}</span>
        </div>
      </div>

      {/* ADD MULTIPLE LOCATIONS MODAL */}
      <AddMultipleLocationsModal
        open={multiModalOpen}
        initialPeis={multiModalCategory === 'instrumental' ? instrPeis : quickPeis}
        initialProvince={
          multiModalCategory === 'instrumental' ? instrProvince : quickProvince
        }
        category={multiModalCategory}
        localityIndex={localityIndex}
        existingEntries={event.intensities}
        onClose={() => setMultiModalOpen(false)}
        onAddLocations={(addedEntries, summaryMsg) => {
          onChangeEvent((ev) => ({
            ...ev,
            intensities: [...ev.intensities, ...addedEntries],
          }));
          onNotice?.(summaryMsg);
        }}
      />

      {/* EDIT INTENSITY REPORT MODAL */}
      <EditIntensityModal
        entry={editingEntry}
        localityIndex={localityIndex}
        existingEntries={event.intensities}
        catalogLoaded={catalogLoaded}
        onClose={() => setEditingEntry(null)}
        onSave={handleSaveEditedEntry}
      />
    </section>
  );
};
