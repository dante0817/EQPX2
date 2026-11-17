import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Layers,
  Pencil,
  Search,
  X,
} from 'lucide-react';
import type {
  IntensityCategory,
  IntensityEntry,
  IntensityReviewStatus,
  PeisRoman,
} from '../data/eqpData';
import {
  deriveStructuredLocationParts,
  formatCanonicalLocalityDisplay,
  getExactEntryDedupeKey,
  getLocalityConflictKey,
  normalizeIntensityCategory,
  normalizeIntensityReviewStatus,
  PEIS_DESCRIPTORS,
  PEIS_LEVELS,
  REPORT_SOURCE_SUGGESTIONS,
  validateCandidateIntensityInput,
} from '../utils/intensityFormat';
import {
  getMunicipalitiesForProvince,
  normalizeLocalityMatchKey,
  type PhilippineLocalityIndex,
} from '../utils/intensityLocalityCatalog';

export interface SearchableComboboxProps {
  id?: string;
  label?: string;
  ariaLabel: string;
  value: string;
  options: string[];
  placeholder: string;
  allowCustomValue?: boolean;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSelectValue: (nextValue: string) => void;
  onChangeCustomValue?: (nextValue: string) => void;
  onDropdownOpenChange?: (isOpen: boolean) => void;
  emptyMessage?: string;
}

export const SearchableSelectCombobox: React.FC<SearchableComboboxProps> = ({
  id,
  ariaLabel,
  value,
  options,
  placeholder,
  allowCustomValue = false,
  disabled = false,
  inputRef,
  onSelectValue,
  onChangeCustomValue,
  onDropdownOpenChange,
  emptyMessage = 'No matching results',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const internalRef = useRef<HTMLInputElement | null>(null);
  const resolvedRef = inputRef ?? internalRef;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const updateOpen = (next: boolean) => {
    setIsOpen(next);
    onDropdownOpenChange?.(next);
  };

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        updateOpen(false);
        if (!allowCustomValue) {
          setQuery(value);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [allowCustomValue, value]);

  const filteredOptions = useMemo(() => {
    const q = normalizeLocalityMatchKey(query);
    if (!q || q === normalizeLocalityMatchKey(value)) {
      return options.slice(0, 120);
    }
    const startsWith: string[] = [];
    const includes: string[] = [];
    for (const opt of options) {
      const k = normalizeLocalityMatchKey(opt);
      if (k.startsWith(q)) startsWith.push(opt);
      else if (k.includes(q)) includes.push(opt);
    }
    return [...startsWith, ...includes].slice(0, 120);
  }, [options, query, value]);

  const commitOption = (opt: string) => {
    setQuery(opt);
    onSelectValue(opt);
    updateOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        updateOpen(true);
        setActiveIndex(0);
      } else if (filteredOptions.length > 0) {
        setActiveIndex((idx) => (idx + 1) % filteredOptions.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && filteredOptions.length > 0) {
        setActiveIndex((idx) => (idx - 1 + filteredOptions.length) % filteredOptions.length);
      }
      return;
    }

    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        updateOpen(false);
        if (!allowCustomValue) setQuery(value);
      }
      return;
    }

    if (e.key === 'Enter' && isOpen) {
      if (filteredOptions.length > 0 && activeIndex >= 0 && activeIndex < filteredOptions.length) {
        e.preventDefault();
        e.stopPropagation();
        commitOption(filteredOptions[activeIndex]);
        return;
      }
      // If custom value is allowed and user pressed Enter with dropdown open but no list match, close dropdown cleanly without submitting yet
      e.preventDefault();
      e.stopPropagation();
      updateOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={resolvedRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onFocus={() => {
            setActiveIndex(0);
            updateOpen(true);
          }}
          onChange={(e) => {
            const nextVal = e.target.value;
            setQuery(nextVal);
            setActiveIndex(0);
            if (!isOpen) updateOpen(true);
            if (allowCustomValue) {
              onChangeCustomValue?.(nextVal);
            } else if (nextVal.trim() === '') {
              onSelectValue('');
            }
          }}
          onKeyDown={handleKeyDown}
          className="w-full pl-2.5 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
        />
        {query ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Clear ${ariaLabel}`}
            onClick={() => {
              setQuery('');
              onSelectValue('');
              if (allowCustomValue) onChangeCustomValue?.('');
              resolvedRef.current?.focus();
            }}
            className="absolute right-6 p-0.5 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Toggle ${ariaLabel} dropdown`}
          disabled={disabled}
          onClick={() => {
            const next = !isOpen;
            updateOpen(next);
            if (next) resolvedRef.current?.focus();
          }}
          className="absolute right-1.5 p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-40"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 top-full mt-1 z-40 max-h-56 overflow-y-auto bg-white border border-slate-300 rounded-md shadow-lg py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-500">{emptyMessage}</div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = normalizeLocalityMatchKey(opt) === normalizeLocalityMatchKey(value);
              const isActive = idx === activeIndex;
              return (
                <button
                  key={opt}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitOption(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-900'
                      : isSelected
                        ? 'bg-slate-50 text-slate-900 font-medium'
                        : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

interface AddMultipleLocationsModalProps {
  open: boolean;
  initialPeis: PeisRoman;
  initialProvince: string;
  category: IntensityCategory;
  localityIndex: PhilippineLocalityIndex;
  existingEntries: IntensityEntry[];
  onClose: () => void;
  onAddLocations: (entries: IntensityEntry[], summaryMessage: string) => void;
}

export const AddMultipleLocationsModal: React.FC<AddMultipleLocationsModalProps> = ({
  open,
  initialPeis,
  initialProvince,
  category,
  localityIndex,
  existingEntries,
  onClose,
  onAddLocations,
}) => {
  const [peis, setPeis] = useState<PeisRoman>(initialPeis);
  const [province, setProvince] = useState<string>(
    initialProvince || localityIndex.provinces[0] || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [reportSource, setReportSource] = useState('');
  const [reviewStatus, setReviewStatus] = useState<'draft' | 'verified'>('draft');
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setPeis(initialPeis);
    setProvince(initialProvince || localityIndex.provinces[0] || '');
    setSearchQuery('');
    setSelectedMunicipalities(new Set());
  }, [open, initialPeis, initialProvince, localityIndex.provinces]);

  const provinceMunicipalities = useMemo(
    () => (province ? getMunicipalitiesForProvince(localityIndex, province) : []),
    [localityIndex, province]
  );

  const filteredMunicipalities = useMemo(() => {
    const q = normalizeLocalityMatchKey(searchQuery);
    if (!q) return provinceMunicipalities;
    return provinceMunicipalities.filter((m) =>
      normalizeLocalityMatchKey(m.municipality).includes(q)
    );
  }, [provinceMunicipalities, searchQuery]);

  // Index existing entries for duplicate and conflict detection
  const { existingExactSet, existingConflictMap } = useMemo(() => {
    const exact = new Set<string>();
    const byLocKey = new Map<string, IntensityEntry[]>();
    for (const entry of existingEntries) {
      if (normalizeIntensityCategory(entry) !== category) continue;
      exact.add(getExactEntryDedupeKey(entry));
      const locKey = getLocalityConflictKey(entry);
      const list = byLocKey.get(locKey) ?? [];
      list.push(entry);
      byLocKey.set(locKey, list);
    }
    return { existingExactSet: exact, existingConflictMap: byLocKey };
  }, [existingEntries, category]);

  if (!open) return null;

  const inspectCandidate = (muniName: string) => {
    const display = formatCanonicalLocalityDisplay({ municipality: muniName, province });
    const mockEntry: Pick<
      IntensityEntry,
      'category' | 'peis' | 'locality' | 'province' | 'municipality' | 'specificLocation'
    > = {
      category,
      peis,
      locality: display,
      province,
      municipality: muniName,
      specificLocation: '',
    };
    const isDuplicate = existingExactSet.has(getExactEntryDedupeKey(mockEntry));
    const existingAtLoc = existingConflictMap.get(getLocalityConflictKey(mockEntry)) ?? [];
    const conflictingPeis = Array.from(
      new Set(existingAtLoc.filter((e) => e.peis !== peis).map((e) => e.peis))
    );
    return { isDuplicate, conflictingPeis, display };
  };

  const toggleMuni = (muniName: string) => {
    setSelectedMunicipalities((prev) => {
      const next = new Set(prev);
      if (next.has(muniName)) next.delete(muniName);
      else next.add(muniName);
      return next;
    });
  };

  const selectAllFilteredNonDuplicates = () => {
    setSelectedMunicipalities((prev) => {
      const next = new Set(prev);
      for (const item of filteredMunicipalities) {
        const { isDuplicate } = inspectCandidate(item.municipality);
        if (!isDuplicate) next.add(item.municipality);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedMunicipalities(new Set());

  const selectedArray = Array.from(selectedMunicipalities);
  const selectedConflicts = selectedArray.filter(
    (name) => inspectCandidate(name).conflictingPeis.length > 0
  );
  const selectedDuplicates = selectedArray.filter((name) => inspectCandidate(name).isDuplicate);
  const addableCount = selectedArray.length - selectedDuplicates.length;

  const handleConfirmAdd = () => {
    if (addableCount <= 0 || !province) return;
    const nowIso = new Date().toISOString();
    const newEntries: IntensityEntry[] = [];
    let conflictCount = 0;

    for (const muniName of selectedArray) {
      const info = inspectCandidate(muniName);
      if (info.isDuplicate) continue;
      const hasConflict = info.conflictingPeis.length > 0;
      if (hasConflict) conflictCount++;

      newEntries.push({
        id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        peis,
        locality: info.display,
        category,
        province,
        municipality: muniName,
        psgcCode: null,
        reportSource: reportSource.trim() || undefined,
        receivedAt: nowIso,
        reviewStatus: hasConflict ? 'conflicting' : reviewStatus,
        remarks: hasConflict
          ? `Added with existing conflicting PEIS (${info.conflictingPeis.join(', ')}) — requires review`
          : undefined,
      });
    }

    if (newEntries.length === 0) return;

    const msgParts = [
      `Added ${newEntries.length} ${category === 'instrumental' ? 'instrumental ' : ''}location${newEntries.length === 1 ? '' : 's'} at Intensity ${peis} (${province})`,
    ];
    if (selectedDuplicates.length > 0) {
      msgParts.push(`${selectedDuplicates.length} duplicate skipped`);
    }
    if (conflictCount > 0) {
      msgParts.push(`${conflictCount} flagged as Conflicting`);
    }
    onAddLocations(newEntries, msgParts.join(' · '));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-multi-loc-title"
    >
      <div className="bg-white border border-slate-300 rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-700" />
            <h3
              id="add-multi-loc-title"
              className="text-xs font-bold tracking-wider uppercase text-slate-900"
            >
              ADD MULTIPLE LOCATIONS
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b border-slate-200 space-y-3 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="multi-peis-select"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                PEIS Intensity
              </label>
              <select
                id="multi-peis-select"
                value={peis}
                onChange={(e) => setPeis(e.target.value as PeisRoman)}
                className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                {PEIS_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Intensity {lvl} — {PEIS_DESCRIPTORS[lvl]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="multi-province-combo"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                Province
              </label>
              <SearchableSelectCombobox
                id="multi-province-combo"
                ariaLabel="Province for batch entry"
                value={province}
                options={localityIndex.provinces}
                placeholder="Search Philippine province..."
                onSelectValue={(nextProv) => {
                  setProvince(nextProv);
                  setSelectedMunicipalities(new Set());
                  setSearchQuery('');
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="multi-source-input"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                Report Source (Optional)
              </label>
              <input
                id="multi-source-input"
                type="text"
                list="multi-source-suggestions"
                value={reportSource}
                onChange={(e) => setReportSource(e.target.value)}
                placeholder="e.g. MDRRMO / Official Report"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <datalist id="multi-source-suggestions">
                {REPORT_SOURCE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div>
              <label
                htmlFor="multi-status-select"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                Initial Review Status
              </label>
              <select
                id="multi-status-select"
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as 'draft' | 'verified')}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="draft">Draft (Requires Review)</option>
                <option value="verified">Verified</option>
              </select>
            </div>
          </div>

          {/* Search & selection summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search municipality"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  province
                    ? `Filter municipalities in ${province}...`
                    : 'Select a province first...'
                }
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono font-semibold text-slate-700 tabular-nums">
                {selectedMunicipalities.size} selected
              </span>
              <button
                type="button"
                onClick={selectAllFilteredNonDuplicates}
                disabled={filteredMunicipalities.length === 0}
                className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedMunicipalities.size === 0}
                className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable checklist */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 bg-slate-50/60">
          {!province ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Select a province to view its cities and municipalities.
            </div>
          ) : filteredMunicipalities.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No municipalities match "{searchQuery}" in {province}.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filteredMunicipalities.map((item) => {
                const { isDuplicate, conflictingPeis } = inspectCandidate(item.municipality);
                const checked = selectedMunicipalities.has(item.municipality);
                return (
                  <label
                    key={`${item.province}-${item.municipality}`}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded border text-xs transition-colors ${
                      isDuplicate
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : checked
                          ? 'bg-blue-50/80 border-blue-400 text-slate-900 cursor-pointer'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        disabled={isDuplicate}
                        checked={checked}
                        onChange={() => toggleMuni(item.municipality)}
                        className="accent-blue-600 shrink-0"
                      />
                      <span className="truncate font-medium">{item.municipality}</span>
                    </span>

                    {isDuplicate ? (
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        Already {peis}
                      </span>
                    ) : conflictingPeis.length > 0 ? (
                      <span
                        className="text-[10px] font-mono font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0"
                        title={`Existing report(s): Intensity ${conflictingPeis.join(', ')}`}
                      >
                        Conflict: {conflictingPeis.join(',')}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Conflict warning banner */}
        {selectedConflicts.length > 0 && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Conflict Notice:</strong>{' '}
              {selectedConflicts.slice(0, 3).join(', ')}
              {selectedConflicts.length > 3 ? ` (+${selectedConflicts.length - 3} more)` : ''} already{' '}
              {selectedConflicts.length === 1 ? 'has' : 'have'} a differing PEIS intensity recorded.
              Existing reports will NOT be overwritten; added entries will be marked{' '}
              <strong>Conflicting</strong> for operator review.
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            Assigning <strong className="font-mono text-slate-800">Intensity {peis}</strong>
            {province ? ` · ${province}` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              CANCEL
            </button>
            <button
              type="button"
              disabled={addableCount <= 0}
              onClick={handleConfirmAdd}
              className="px-3.5 py-1.5 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-45 transition-colors whitespace-nowrap"
            >
              {addableCount > 0
                ? `ADD ${addableCount} LOCATION${addableCount === 1 ? '' : 'S'}`
                : 'ADD SELECTED LOCATIONS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface EditIntensityModalProps {
  entry: IntensityEntry | null;
  localityIndex: PhilippineLocalityIndex;
  existingEntries: IntensityEntry[];
  catalogLoaded?: boolean;
  onClose: () => void;
  onSave: (updated: IntensityEntry) => void;
}

export const EditIntensityModal: React.FC<EditIntensityModalProps> = ({
  entry,
  localityIndex,
  existingEntries,
  catalogLoaded = true,
  onClose,
  onSave,
}) => {
  const [peis, setPeis] = useState<PeisRoman>('II');
  const [province, setProvince] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [specificLocation, setSpecificLocation] = useState('');
  const [reportSource, setReportSource] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [reviewStatus, setReviewStatus] = useState<IntensityReviewStatus>('verified');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!entry) return;
    const derived = deriveStructuredLocationParts(entry);
    setPeis(entry.peis);
    setProvince(derived.province);
    setMunicipality(derived.municipality || entry.locality);
    setSpecificLocation(derived.specificLocation);
    setReportSource(entry.reportSource ?? '');
    setReceivedAt(entry.receivedAt ?? new Date().toISOString());
    setReviewStatus(normalizeIntensityReviewStatus(entry));
    setRemarks(entry.remarks ?? '');
  }, [entry]);

  const municipalityOptions = useMemo(() => {
    if (!province) {
      return Array.from(new Set(localityIndex.allRecords.map((r) => r.municipality))).sort();
    }
    return getMunicipalitiesForProvince(localityIndex, province).map((r) => r.municipality);
  }, [localityIndex, province]);

  const editValidation = useMemo(() => {
    if (!entry) return null;
    return validateCandidateIntensityInput({
      peis,
      category: normalizeIntensityCategory(entry),
      province,
      localityText: municipality,
      specificLocation,
      catalogLoaded,
      localityIndex,
      existingEntries,
      excludeEntryId: entry.id,
    });
  }, [
    entry,
    peis,
    province,
    municipality,
    specificLocation,
    catalogLoaded,
    localityIndex,
    existingEntries,
  ]);

  if (!entry) return null;

  const isPeisChanged = peis !== entry.peis;
  const previousIntensityDisplay = isPeisChanged
    ? entry.peis
    : entry.previousPeis ?? null;

  const handleSetNowUtc = () => {
    setReceivedAt(new Date().toISOString());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editValidation?.hasExactDuplicate) return;

    const trimmedMuni =
      editValidation?.geographicStatus === 'matched'
        ? editValidation.canonicalMunicipality
        : municipality.trim();
    const trimmedProv =
      editValidation?.geographicStatus === 'matched'
        ? editValidation.canonicalProvince
        : province.trim();
    const trimmedSpec = specificLocation.trim();
    const formattedLocality = formatCanonicalLocalityDisplay({
      specificLocation: trimmedSpec,
      municipality: trimmedMuni,
      province: trimmedProv,
      fallbackLocality: entry.locality,
    });
    if (!formattedLocality) return;

    const updated: IntensityEntry = {
      ...entry,
      peis,
      locality: formattedLocality,
      province: trimmedProv || undefined,
      municipality: trimmedMuni || undefined,
      specificLocation: trimmedSpec || undefined,
      psgcCode:
        editValidation?.geographicStatus === 'matched'
          ? editValidation.psgcCode ?? entry.psgcCode ?? null
          : entry.psgcCode ?? null,
      reportSource: reportSource.trim() || undefined,
      receivedAt: receivedAt.trim() || undefined,
      reviewStatus,
      remarks: remarks.trim() || undefined,
      previousPeis: isPeisChanged ? entry.peis : entry.previousPeis,
      updatedAt: new Date().toISOString(),
    };
    onSave(updated);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-intensity-title"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-300 rounded-lg shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-blue-700" />
            <h3
              id="edit-intensity-title"
              className="text-xs font-bold tracking-wider uppercase text-slate-900"
            >
              EDIT INTENSITY REPORT
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit modal"
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5 overflow-y-auto">
          {/* PEIS & Audit Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-peis-select"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                PEIS Intensity
              </label>
              <select
                id="edit-peis-select"
                value={peis}
                onChange={(e) => setPeis(e.target.value as PeisRoman)}
                className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                {PEIS_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Intensity {lvl} — {PEIS_DESCRIPTORS[lvl]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-review-status"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                Review Status
              </label>
              <select
                id="edit-review-status"
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value as IntensityReviewStatus)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              >
                <option value="verified">Verified (Eligible for Bulletin)</option>
                <option value="draft">Draft (Pending Review)</option>
                <option value="conflicting">Conflicting (Excluded Until Resolved)</option>
                <option value="unresolved">Unresolved Locality</option>
              </select>
            </div>
          </div>

          {/* Audit Comparison Strip */}
          <div className="px-3 py-2 rounded border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="text-slate-600">
              Previous Intensity Value:{' '}
              <span className="font-mono font-semibold text-slate-900">
                {previousIntensityDisplay ? `Intensity ${previousIntensityDisplay}` : 'None (Initial)'}
              </span>
            </div>
            <div className="text-slate-600">
              Updated Intensity Value:{' '}
              <span
                className={`font-mono font-semibold ${
                  isPeisChanged ? 'text-blue-700' : 'text-slate-900'
                }`}
              >
                Intensity {peis}
              </span>
            </div>
          </div>

          {/* Locality */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-province-combo"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                Province
              </label>
              <SearchableSelectCombobox
                id="edit-province-combo"
                ariaLabel="Province"
                value={province}
                options={localityIndex.provinces}
                allowCustomValue
                placeholder="Select or enter province..."
                onSelectValue={(val) => setProvince(val)}
                onChangeCustomValue={(val) => setProvince(val)}
              />
            </div>

            <div>
              <label
                htmlFor="edit-municipality-combo"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                City / Municipality
              </label>
              <SearchableSelectCombobox
                id="edit-municipality-combo"
                ariaLabel="City or Municipality"
                value={municipality}
                options={municipalityOptions}
                allowCustomValue
                placeholder="City or municipality..."
                onSelectValue={(val) => setMunicipality(val)}
                onChangeCustomValue={(val) => setMunicipality(val)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-specific-loc"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                Specific Location (Optional)
              </label>
              <input
                id="edit-specific-loc"
                type="text"
                value={specificLocation}
                onChange={(e) => setSpecificLocation(e.target.value)}
                placeholder="Barangay, district, or landmark"
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="edit-report-source"
                className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
              >
                Report Source
              </label>
              <input
                id="edit-report-source"
                type="text"
                list="edit-source-suggestions"
                value={reportSource}
                onChange={(e) => setReportSource(e.target.value)}
                placeholder="Official Report, Field Observation, etc."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <datalist id="edit-source-suggestions">
                {REPORT_SOURCE_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Date/Time Received */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="edit-received-at"
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-600"
              >
                Date / Time Received (UTC ISO-8601)
              </label>
              <button
                type="button"
                onClick={handleSetNowUtc}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800"
              >
                <Clock className="w-3 h-3" />
                <span>Set Now (UTC)</span>
              </button>
            </div>
            <input
              id="edit-received-at"
              type="text"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              placeholder="YYYY-MM-DDTHH:MM:SSZ (UTC)"
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          {/* Live Validation Layer Feedback (Reference Dataset + Duplicate Check) */}
          {editValidation && editValidation.geographicStatus !== 'empty' && (
            <div className="space-y-2">
              <div
                role="status"
                className={`px-3 py-2 rounded border text-[11px] flex items-start gap-2 ${
                  editValidation.geographicStatus === 'matched'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}
              >
                {editValidation.geographicStatus === 'matched' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div>{editValidation.geographicMessage}</div>
                  {editValidation.geographicStatus === 'ambiguous' &&
                    editValidation.candidates.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {editValidation.candidates.map((cand) => (
                          <button
                            key={`${cand.province}::${cand.municipality}`}
                            type="button"
                            onClick={() => {
                              setProvince(cand.province);
                              setMunicipality(cand.municipality);
                            }}
                            className="px-2 py-0.5 rounded border border-amber-300 bg-white text-[10.5px] font-semibold text-amber-950 hover:bg-amber-100 whitespace-nowrap"
                          >
                            {cand.municipality}, {cand.province}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              </div>

              {editValidation.duplicateKind !== 'none' && (
                <div
                  role="alert"
                  className={`px-3 py-2 rounded border text-[11px] flex items-start gap-2 ${
                    editValidation.hasExactDuplicate
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                      editValidation.hasExactDuplicate ? 'text-rose-700' : 'text-amber-700'
                    }`}
                  />
                  <div>{editValidation.duplicateMessage}</div>
                </div>
              )}
            </div>
          )}

          {/* Remarks */}
          <div>
            <label
              htmlFor="edit-remarks"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1"
            >
              Remarks / Verification Notes
            </label>
            <textarea
              id="edit-remarks"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Field verification context, observer details, or conflict resolution note..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-y"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={Boolean(editValidation?.hasExactDuplicate) || !municipality.trim()}
            className="px-3.5 py-1.5 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-45 transition-colors whitespace-nowrap"
          >
            SAVE CHANGES
          </button>
        </div>
      </form>
    </div>
  );
};
