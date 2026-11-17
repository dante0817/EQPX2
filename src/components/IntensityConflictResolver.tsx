import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  GitMerge,
  Pencil,
  Trash2,
} from 'lucide-react';
import type {
  IntensityCategory,
  IntensityEntry,
  PeisRoman,
} from '../data/eqpData';
import {
  deriveStructuredLocationParts,
  formatCanonicalLocalityDisplay,
  normalizeIntensityReviewStatus,
  PEIS_DESCRIPTORS,
  PEIS_LEVELS,
  type MergeConflictObservationConfig,
} from '../utils/intensityFormat';

export interface ConflictGroupItem {
  key: string;
  localityDisplay: string;
  category: IntensityCategory;
  peisValues: PeisRoman[];
  entries: IntensityEntry[];
  isStandaloneFlagged?: boolean;
}

interface IntensityConflictResolverProps {
  conflictGroups: ConflictGroupItem[];
  peisBadgeClass: Record<PeisRoman, string>;
  onSelectWinner: (
    group: ConflictGroupItem,
    winningEntryId: string,
    reviewStatus: 'verified' | 'draft'
  ) => void;
  onMergeGroup: (
    group: ConflictGroupItem,
    config: MergeConflictObservationConfig
  ) => void;
  onEditEntry: (entry: IntensityEntry) => void;
  onRemoveEntry: (entry: IntensityEntry) => void;
  onExit: () => void;
}

export const IntensityConflictResolver: React.FC<IntensityConflictResolverProps> = ({
  conflictGroups,
  peisBadgeClass,
  onSelectWinner,
  onMergeGroup,
  onEditEntry,
  onRemoveEntry,
  onExit,
}) => {
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>(
    () => conflictGroups[0]?.key ?? ''
  );

  useEffect(() => {
    if (conflictGroups.length === 0) return;
    if (!conflictGroups.some((g) => g.key === selectedGroupKey)) {
      setSelectedGroupKey(conflictGroups[0].key);
    }
  }, [conflictGroups, selectedGroupKey]);

  const activeGroup = useMemo(
    () =>
      conflictGroups.find((g) => g.key === selectedGroupKey) ??
      conflictGroups[0] ??
      null,
    [conflictGroups, selectedGroupKey]
  );

  // Merge builder state synced whenever activeGroup changes
  const [mergeBaseId, setMergeBaseId] = useState<string>('');
  const [mergePeis, setMergePeis] = useState<PeisRoman>('III');
  const [mergeSpecificLoc, setMergeSpecificLoc] = useState<string>('');
  const [mergeSource, setMergeSource] = useState<string>('');
  const [mergeRemarks, setMergeRemarks] = useState<string>('');
  const [mergeReviewStatus, setMergeReviewStatus] = useState<'verified' | 'draft'>(
    'verified'
  );

  useEffect(() => {
    if (!activeGroup || activeGroup.entries.length === 0) return;
    const first = activeGroup.entries[0];
    const distinctSpecs = Array.from(
      new Set(
        activeGroup.entries
          .map((e) => deriveStructuredLocationParts(e).specificLocation.trim())
          .filter(Boolean)
      )
    );
    const distinctSources = Array.from(
      new Set(
        activeGroup.entries
          .map((e) => e.reportSource?.trim() ?? '')
          .filter(Boolean)
      )
    );
    const distinctRemarks = Array.from(
      new Set(
        activeGroup.entries
          .map((e) => e.remarks?.trim() ?? '')
          .filter(
            (r) =>
              Boolean(r) &&
              !r.startsWith('Conflicting intensity recorded') &&
              !r.startsWith('Conflicts with existing Intensity')
          )
      )
    );

    // Default anchor: prefer verified entry if one exists, otherwise highest PEIS / first
    const verifiedAnchor = activeGroup.entries.find(
      (e) => normalizeIntensityReviewStatus(e) === 'verified'
    );
    const anchor = verifiedAnchor ?? first;

    setMergeBaseId(anchor.id);
    setMergePeis(anchor.peis);
    setMergeSpecificLoc(distinctSpecs.join('; '));
    setMergeSource(distinctSources.join('; '));
    setMergeRemarks(
      distinctRemarks.length > 0
        ? distinctRemarks.join(' | ')
        : `Merged conflicting reports (${activeGroup.peisValues.join(' & ')})`
    );
    setMergeReviewStatus('verified');
  }, [activeGroup]);

  const fieldVariance = useMemo(() => {
    if (!activeGroup || activeGroup.entries.length < 2) {
      return { peisDiffers: false, specDiffers: false, sourceDiffers: false };
    }
    const peisSet = new Set(activeGroup.entries.map((e) => e.peis));
    const specSet = new Set(
      activeGroup.entries.map((e) =>
        deriveStructuredLocationParts(e).specificLocation.trim().toLowerCase()
      )
    );
    const srcSet = new Set(
      activeGroup.entries.map((e) => (e.reportSource ?? '').trim().toLowerCase())
    );
    return {
      peisDiffers: peisSet.size > 1,
      specDiffers: specSet.size > 1,
      sourceDiffers: srcSet.size > 1,
    };
  }, [activeGroup]);

  const distinctSpecificOptions = useMemo(() => {
    if (!activeGroup) return [];
    return Array.from(
      new Set(
        activeGroup.entries
          .map((e) => deriveStructuredLocationParts(e).specificLocation.trim())
          .filter(Boolean)
      )
    );
  }, [activeGroup]);

  const distinctSourceOptions = useMemo(() => {
    if (!activeGroup) return [];
    return Array.from(
      new Set(
        activeGroup.entries
          .map((e) => (e.reportSource ?? '').trim())
          .filter(Boolean)
      )
    );
  }, [activeGroup]);

  const mergedLocalityPreview = useMemo(() => {
    if (!activeGroup || activeGroup.entries.length === 0) return '';
    const anchor =
      activeGroup.entries.find((e) => e.id === mergeBaseId) ??
      activeGroup.entries[0];
    const parts = deriveStructuredLocationParts(anchor);
    return formatCanonicalLocalityDisplay({
      specificLocation: mergeSpecificLoc.trim(),
      municipality: parts.municipality,
      province: parts.province,
      fallbackLocality: anchor.locality,
    });
  }, [activeGroup, mergeBaseId, mergeSpecificLoc]);

  return (
    <div className="rounded-lg border border-yellow-300 bg-white divide-y divide-slate-200 overflow-hidden shadow-xs">
      {/* Header Bar */}
      <div className="px-4 py-3 bg-yellow-100/80 border-b border-yellow-300 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-yellow-700 shrink-0" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-950">
              Resolve Conflicts — Side-by-Side Comparison
            </h3>
            <p className="text-[11px] text-yellow-900">
              {conflictGroups.length === 0
                ? 'No conflicting intensity reports remain for this event.'
                : `${conflictGroups.length} conflicting localit${
                    conflictGroups.length === 1 ? 'y' : 'ies'
                  } awaiting adjudication — select the authoritative observation or merge data.`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit Resolve Conflicts</span>
        </button>
      </div>

      {conflictGroups.length === 0 || !activeGroup ? (
        <div className="p-10 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="text-sm font-semibold text-slate-900">
            All Intensity Conflicts Resolved
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            All reported and instrumental locality conflicts have been reconciled. Verified entries are now eligible for automatic bulletin generation.
          </p>
          <div>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
            >
              <span>Return to Recorded Intensities</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left Rail: Conflict Groups Queue */}
          <aside className="bg-amber-50/70 p-3 space-y-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-900 px-1">
              Conflict Queue ({conflictGroups.length})
            </div>
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
              {conflictGroups.map((group) => {
                const isSelected = group.key === activeGroup.key;
                return (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => setSelectedGroupKey(group.key)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-yellow-100 border-yellow-400 text-yellow-950'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-yellow-300 hover:bg-yellow-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-semibold truncate">
                        {group.localityDisplay}
                      </span>
                      <span className="text-[10px] font-mono uppercase text-slate-500 shrink-0">
                        {group.category === 'instrumental' ? 'INSTR' : 'FELT'}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="font-semibold text-yellow-900">
                        PEIS {group.peisValues.join(' vs ')}
                      </span>
                      <span className="text-slate-500 tabular-nums">
                        {group.entries.length} obs
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Main Workspace: Side-by-Side Comparison + Merge Panel */}
          <div className="p-4 space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  {activeGroup.category === 'instrumental'
                    ? 'Instrumental Intensity Conflict'
                    : 'Reported Macroseismic Conflict'}
                </div>
                <h4 className="text-sm font-semibold text-slate-900">
                  {activeGroup.localityDisplay}{' '}
                  <span className="font-mono text-xs text-yellow-900">
                    ({activeGroup.entries.length} observations · PEIS{' '}
                    {activeGroup.peisValues.join(' vs ')})
                  </span>
                </h4>
              </div>
            </div>

            {/* Side-by-Side Observation Cards */}
            <div
              className={`grid grid-cols-1 gap-3 ${
                activeGroup.entries.length === 2
                  ? 'md:grid-cols-2'
                  : activeGroup.entries.length >= 3
                    ? 'md:grid-cols-2 xl:grid-cols-3'
                    : 'md:grid-cols-1'
              }`}
            >
              {activeGroup.entries.map((obs, idx) => {
                const parts = deriveStructuredLocationParts(obs);
                const status = normalizeIntensityReviewStatus(obs);
                const obsLabel = `Observation ${String.fromCharCode(65 + idx)}`;
                const isAnchorForMerge = obs.id === mergeBaseId;

                return (
                  <div
                    key={obs.id}
                    className={`rounded-md border p-3.5 flex flex-col justify-between gap-3 ${
                      isAnchorForMerge
                        ? 'border-yellow-400 bg-yellow-50/45'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          {obsLabel}
                        </span>
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center justify-center min-w-[2.4rem] px-2 py-0.5 text-xs font-mono font-bold rounded border ${peisBadgeClass[obs.peis]}`}
                          >
                            PEIS {obs.peis}
                          </span>
                          {fieldVariance.peisDiffers && (
                            <span className="text-[10px] font-semibold text-yellow-900 bg-yellow-100 border border-yellow-300 px-1.5 py-0.5 rounded">
                              Differs
                            </span>
                          )}
                        </div>
                      </div>

                      <dl className="space-y-1.5 text-xs">
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-[11px] text-slate-500 shrink-0">Scale</dt>
                          <dd className="font-medium text-slate-800 text-right">
                            {PEIS_DESCRIPTORS[obs.peis]}
                          </dd>
                        </div>

                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-[11px] text-slate-500 shrink-0">
                            Province / LGU
                          </dt>
                          <dd className="font-medium text-slate-900 text-right">
                            {parts.municipality || obs.locality}
                            {parts.province ? `, ${parts.province}` : ''}
                          </dd>
                        </div>

                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-[11px] text-slate-500 shrink-0">
                            Specific Loc.
                            {fieldVariance.specDiffers ? ' *' : ''}
                          </dt>
                          <dd
                            className={`text-right ${
                              fieldVariance.specDiffers
                                ? 'font-semibold text-yellow-950'
                                : 'text-slate-700'
                            }`}
                          >
                            {parts.specificLocation || (
                              <span className="text-slate-400">None</span>
                            )}
                          </dd>
                        </div>

                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-[11px] text-slate-500 shrink-0">
                            Report Source
                            {fieldVariance.sourceDiffers ? ' *' : ''}
                          </dt>
                          <dd
                            className={`text-right ${
                              fieldVariance.sourceDiffers
                                ? 'font-semibold text-yellow-950'
                                : 'text-slate-700'
                            }`}
                          >
                            {obs.reportSource || (
                              <span className="text-slate-400">Unspecified</span>
                            )}
                          </dd>
                        </div>

                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-[11px] text-slate-500 shrink-0">
                            Received (UTC)
                          </dt>
                          <dd className="font-mono text-[11px] text-slate-600 tabular-nums text-right">
                            {obs.receivedAt ? obs.receivedAt.replace('T', ' ').slice(0, 19) : '—'}
                          </dd>
                        </div>

                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-[11px] text-slate-500 shrink-0">
                            Status
                          </dt>
                          <dd className="font-mono text-[11px] uppercase text-slate-700">
                            {status}
                          </dd>
                        </div>

                        {obs.remarks && (
                          <div className="pt-1 border-t border-slate-100">
                            <dt className="text-[10.5px] font-semibold text-slate-500">
                              Remarks
                            </dt>
                            <dd className="text-[11px] text-slate-700 mt-0.5 break-words">
                              {obs.remarks}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Direct Card Resolution Actions */}
                    <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectWinner(activeGroup, obs.id, 'verified')}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Select This Observation (Verify)</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectWinner(activeGroup, obs.id, 'draft')}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <span>Keep as Draft</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditEntry(obs)}
                          title="Edit observation details individually"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        {activeGroup.isStandaloneFlagged && (
                          <button
                            type="button"
                            onClick={() => onRemoveEntry(obs)}
                            title="Delete flagged observation"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-rose-200 bg-rose-50 text-[11px] font-medium text-rose-700 hover:bg-rose-100 whitespace-nowrap"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Merge Conflicting Observations Builder (when >= 2 observations exist) */}
            {activeGroup.entries.length >= 2 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onMergeGroup(activeGroup, {
                    baseEntryId: mergeBaseId || activeGroup.entries[0].id,
                    peis: mergePeis,
                    specificLocation: mergeSpecificLoc,
                    reportSource: mergeSource,
                    remarks: mergeRemarks,
                    reviewStatus: mergeReviewStatus,
                  });
                }}
                className="rounded-md border border-blue-200 bg-blue-50/65 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-blue-200/80">
                  <div className="flex items-center gap-2">
                    <GitMerge className="w-4 h-4 text-blue-700 shrink-0" />
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Merge Conflicting Observations
                      </h5>
                      <p className="text-[11px] text-slate-600">
                        Combine location details and sources into a single resolved record.
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-700 bg-white border border-slate-200 rounded px-2.5 py-1">
                    Preview: Intensity {mergePeis} - {mergedLocalityPreview}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Final PEIS */}
                  <div>
                    <label
                      htmlFor="merge-peis-select"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Merged PEIS Intensity
                    </label>
                    <select
                      id="merge-peis-select"
                      value={mergePeis}
                      onChange={(e) => setMergePeis(e.target.value as PeisRoman)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    >
                      {PEIS_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl} — {PEIS_DESCRIPTORS[lvl]}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {activeGroup.peisValues.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setMergePeis(lvl)}
                          aria-pressed={mergePeis === lvl}
                          className={`px-2 py-0.5 rounded border text-[10.5px] font-mono font-semibold whitespace-nowrap ${
                            mergePeis === lvl
                              ? 'bg-blue-700 border-blue-700 text-white'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Use {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Specific Location */}
                  <div>
                    <label
                      htmlFor="merge-specific-loc"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Merged Specific Location
                    </label>
                    <input
                      id="merge-specific-loc"
                      type="text"
                      value={mergeSpecificLoc}
                      onChange={(e) => setMergeSpecificLoc(e.target.value)}
                      placeholder="Barangay / District (Opt.)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    />
                    {distinctSpecificOptions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {distinctSpecificOptions.map((spec) => (
                          <button
                            key={spec}
                            type="button"
                            onClick={() => setMergeSpecificLoc(spec)}
                            className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10.5px] text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                          >
                            {spec}
                          </button>
                        ))}
                        {distinctSpecificOptions.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setMergeSpecificLoc(distinctSpecificOptions.join('; '))
                            }
                            className="px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-[10.5px] font-medium text-blue-800 hover:bg-blue-100 whitespace-nowrap"
                          >
                            Combine All
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Merged Report Source */}
                  <div>
                    <label
                      htmlFor="merge-report-source"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Merged Report Source
                    </label>
                    <input
                      id="merge-report-source"
                      type="text"
                      value={mergeSource}
                      onChange={(e) => setMergeSource(e.target.value)}
                      placeholder="Combined source(s)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    />
                    {distinctSourceOptions.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {distinctSourceOptions.map((src) => (
                          <button
                            key={src}
                            type="button"
                            onClick={() => setMergeSource(src)}
                            className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[10.5px] text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                          >
                            {src}
                          </button>
                        ))}
                        {distinctSourceOptions.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setMergeSource(distinctSourceOptions.join('; '))
                            }
                            className="px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-[10.5px] font-medium text-blue-800 hover:bg-blue-100 whitespace-nowrap"
                          >
                            Combine All
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Review Status & Anchor */}
                  <div>
                    <label
                      htmlFor="merge-review-status"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Result Review Status
                    </label>
                    <select
                      id="merge-review-status"
                      value={mergeReviewStatus}
                      onChange={(e) =>
                        setMergeReviewStatus(e.target.value as 'verified' | 'draft')
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    >
                      <option value="verified">Verified (Ready for Bulletin)</option>
                      <option value="draft">Draft (Needs Review)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
                  <div className="flex-1 min-w-[240px]">
                    <label
                      htmlFor="merge-remarks"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Resolution Remarks / Audit Note
                    </label>
                    <input
                      id="merge-remarks"
                      type="text"
                      value={mergeRemarks}
                      onChange={(e) => setMergeRemarks(e.target.value)}
                      placeholder="Audit note explaining conflict resolution..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>MERGE &amp; RESOLVE CONFLICT</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
