import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Clock,
  Download,
  FileCheck2,
  FilePlus2,
  Filter,
  FolderOpen,
  GitCommitHorizontal,
  History,
  Layers,
  RefreshCw,
  Search,
} from 'lucide-react';
import { EQPEvent } from '../data/eqpData';
import {
  EqpChangeCategory,
  EqpHistoryEntry,
  EqpHistoryTrigger,
  getEqpEventKey,
} from '../utils/eqpHistory';
import { SavedEqpFileItem } from './SaveSolutionExplorerModal';

interface EqpHistoryPanelProps {
  entries: EqpHistoryEntry[];
  activeEvent: EQPEvent;
  events: EQPEvent[];
  savedFiles: SavedEqpFileItem[];
  isSyncing: boolean;
  onRefreshSync: () => Promise<void>;
  onRecordCheckpointNow: () => Promise<void>;
  onOpenDiskFile: (relPath: string, displayPath: string, filename: string) => void;
  onLoadCatalogEvent: (eventId: string) => void;
  onSaveNextBulletin: () => void;
}

const TRIGGER_META: Record<
  EqpHistoryTrigger,
  { label: string; badgeClass: string }
> = {
  initial: {
    label: 'Initial',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  save: {
    label: 'Saved .EQP',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  locate: {
    label: 'Locate Solver',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  'ai-picks': {
    label: 'AI Picks',
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  magnitude: {
    label: 'Magnitude',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  bulletin: {
    label: 'Bulletin Edit',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  backfill: {
    label: 'Disk Sync',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
};

const CATEGORY_META: Record<
  EqpChangeCategory,
  { label: string; className: string }
> = {
  hypocenter: {
    label: 'HYPOCENTER',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  magnitude: {
    label: 'MAGNITUDE',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  phases: {
    label: 'PHASES',
    className: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  places: {
    label: 'PLACES',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  intensity: {
    label: 'PEIS',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  bulletin: {
    label: 'BULLETIN',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  metadata: {
    label: 'METADATA',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  },
};

function formatHistoryTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

export const EqpHistoryPanel: React.FC<EqpHistoryPanelProps> = ({
  entries,
  activeEvent,
  events,
  savedFiles,
  isSyncing,
  onRefreshSync,
  onRecordCheckpointNow,
  onOpenDiskFile,
  onLoadCatalogEvent,
  onSaveNextBulletin,
}) => {
  const activeEventKey = useMemo(() => getEqpEventKey(activeEvent), [activeEvent]);

  const [scope, setScope] = useState<'active' | 'all'>('active');
  const [familyFilter, setFamilyFilter] = useState<string>('ALL');
  const [triggerFilter, setTriggerFilter] = useState<'ALL' | EqpHistoryTrigger>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const uniqueFamilies = useMemo(() => {
    const keys = new Set<string>();
    keys.add(activeEventKey);
    for (const e of entries) {
      keys.add(e.eventKey);
    }
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [entries, activeEventKey]);

  const savedFileMap = useMemo(() => {
    const byRel = new Map<string, SavedEqpFileItem>();
    const byName = new Map<string, SavedEqpFileItem>();
    for (const f of savedFiles) {
      byRel.set(f.relPath, f);
      if (!byName.has(f.filename.toLowerCase())) {
        byName.set(f.filename.toLowerCase(), f);
      }
    }
    return { byRel, byName };
  }, [savedFiles]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (scope === 'active' && entry.eventKey !== activeEventKey) return false;
      if (scope === 'all' && familyFilter !== 'ALL' && entry.eventKey !== familyFilter) {
        return false;
      }
      if (triggerFilter !== 'ALL' && entry.trigger !== triggerFilter) return false;
      if (!q) return true;
      const haystack = [
        entry.eventKey,
        entry.versionTag,
        entry.filename,
        entry.displayPath,
        entry.summary,
        entry.issuedBy,
        entry.snapshot.cityLabel,
        entry.snapshot.townLabel,
        entry.snapshot.generatorLabel,
        entry.snapshot.remarks,
        ...entry.changes.map((c) => `${c.label} ${c.detail}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, scope, activeEventKey, familyFilter, triggerFilter, searchQuery]);

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setSelectedEntryId(null);
      return;
    }
    if (!selectedEntryId || !filteredEntries.some((e) => e.id === selectedEntryId)) {
      setSelectedEntryId(filteredEntries[0].id);
    }
  }, [filteredEntries, selectedEntryId]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((e) => e.id === selectedEntryId) ?? filteredEntries[0] ?? null,
    [filteredEntries, selectedEntryId]
  );

  const matchingCatalogEvent = useMemo(() => {
    if (!selectedEntry) return null;
    return (
      events.find((ev) => getEqpEventKey(ev) === selectedEntry.eventKey) ?? null
    );
  }, [events, selectedEntry]);

  const resolveDiskFile = (entry: EqpHistoryEntry): SavedEqpFileItem | null => {
    if (entry.relPath && savedFileMap.byRel.has(entry.relPath)) {
      return savedFileMap.byRel.get(entry.relPath) ?? null;
    }
    return savedFileMap.byName.get(entry.filename.toLowerCase()) ?? null;
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                EQP Version History &amp; Automated Change Log
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks every saved <span className="font-mono">.eqp</span> revision, solver relocation, AI phase adjustment, duration magnitude update, and bulletin edit per event family.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => void onRecordCheckpointNow()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium"
            >
              <GitCommitHorizontal className="w-3.5 h-3.5 text-slate-500" />
              Snapshot Current Edits
            </button>
            <button
              type="button"
              onClick={() => void onRefreshSync()}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium disabled:opacity-60"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`}
              />
              {isSyncing ? 'Syncing Disk...' : 'Sync Disk .EQP'}
            </button>
            <button
              type="button"
              onClick={onSaveNextBulletin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              Save Next Bulletin (B{Math.max(1, Math.trunc(activeEvent.bulletinNo || 1)) + 1})
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded border border-slate-300 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setScope('active')}
                className={`px-2.5 py-1 rounded-xs font-medium ${
                  scope === 'active'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active Event ({activeEventKey})
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-2.5 py-1 rounded-xs font-medium ${
                  scope === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Event Families ({uniqueFamilies.length})
              </button>
            </div>

            {scope === 'all' && (
              <label className="inline-flex items-center gap-1.5 text-slate-600">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={familyFilter}
                  onChange={(e) => setFamilyFilter(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 font-mono text-xs"
                >
                  <option value="ALL">All Families ({entries.length})</option>
                  {uniqueFamilies.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={triggerFilter}
                onChange={(e) =>
                  setTriggerFilter(e.target.value as 'ALL' | EqpHistoryTrigger)
                }
                className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 text-xs"
              >
                <option value="ALL">All Triggers</option>
                <option value="save">Saved .EQP</option>
                <option value="locate">Locate Solver</option>
                <option value="ai-picks">AI Phase Picks</option>
                <option value="magnitude">Duration Magnitude</option>
                <option value="bulletin">Bulletin Edit</option>
                <option value="backfill">Disk Sync</option>
                <option value="initial">Initial</option>
              </select>
            </label>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search diff, station, filename, remark..."
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded w-64 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Main Split View */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <History className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-slate-900">
              No recorded version diffs yet for {scope === 'active' ? activeEventKey : 'this filter'}
            </h3>
            <p className="text-xs text-slate-500">
              Versions are logged automatically whenever you run <span className="font-medium text-slate-700">Locate</span>, apply <span className="font-medium text-slate-700">AI Picks</span> or <span className="font-medium text-slate-700">Duration Magnitude</span>, or <span className="font-medium text-slate-700">Save .EQP</span> solutions to disk.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            <button
              type="button"
              onClick={() => void onRecordCheckpointNow()}
              className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium"
            >
              Record Current B{Math.max(1, Math.trunc(activeEvent.bulletinNo || 1))} Baseline Now
            </button>
            {scope === 'active' && entries.length > 0 && (
              <button
                type="button"
                onClick={() => setScope('all')}
                className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium"
              >
                Show All Event Families ({entries.length})
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Chronological Version Timeline */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">
                Revision Timeline ({filteredEntries.length} entr{filteredEntries.length === 1 ? 'y' : 'ies'})
              </span>
              <span className="text-slate-500">Newest first · Click any entry to inspect diffs</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {filteredEntries.map((entry) => {
                const isSelected = selectedEntry?.id === entry.id;
                const trig = TRIGGER_META[entry.trigger] ?? TRIGGER_META.save;
                const diskFile = resolveDiskFile(entry);
                const snap = entry.snapshot;
                const hasNonLegacy =
                  Boolean(snap.magnitudeMethodId) &&
                  snap.magnitudeMethodId !== 'eqp-legacy-ms' &&
                  snap.magnitudeValue !== null &&
                  snap.magnitudeValue !== undefined;
                const prefMag = hasNonLegacy
                  ? (snap.magnitudeValue as number)
                  : snap.preferredScale === 'Ms'
                    ? snap.ms
                    : snap.preferredScale === 'Mb'
                      ? snap.mb
                      : snap.md;
                const prefLabel = hasNonLegacy
                  ? snap.magnitudeScale || 'Md'
                  : snap.preferredScale === 'Md'
                    ? 'ML'
                    : snap.preferredScale;
                const uniqueCats = Array.from(
                  new Set(entry.changes.map((c) => c.category))
                );

                return (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedEntryId(entry.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedEntryId(entry.id);
                      }
                    }}
                    className={`p-3.5 text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px] font-semibold">
                          {entry.versionTag}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${trig.badgeClass}`}
                        >
                          {trig.label}
                        </span>
                        {scope === 'all' && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                            {entry.eventKey}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 tabular-nums">
                        <Clock className="w-3 h-3" />
                        {formatHistoryTimestamp(entry.timestamp)}
                      </span>
                    </div>

                    <div className="mt-1.5 text-xs font-medium text-slate-900 leading-snug">
                      {entry.summary}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-600 tabular-nums">
                      <span>
                        {snap.iterations === 0 && snap.lat === 0 && snap.lon === 0
                          ? 'Unlocated'
                          : `${snap.lat.toFixed(3)}°N, ${snap.lon.toFixed(3)}°E`}
                      </span>
                      <span>D {snap.depthKm.toFixed(1)} km</span>
                      <span>
                        {prefLabel} {prefMag.toFixed(1)}
                      </span>
                      <span>RMS {snap.rmsSec.toFixed(2)}s</span>
                      <span>{snap.activePhases} phases</span>
                      <span className="text-slate-500">By {entry.issuedBy || 'SOEPD'}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {uniqueCats.length > 0 ? (
                          uniqueCats.map((cat) => {
                            const meta = CATEGORY_META[cat];
                            const count = entry.changes.filter((c) => c.category === cat).length;
                            return (
                              <span
                                key={cat}
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${meta.className}`}
                              >
                                {meta.label} ({count})
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            No field changes vs prior checkpoint
                          </span>
                        )}
                      </div>

                      {diskFile && (
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDiskFile(
                                diskFile.relPath,
                                diskFile.displayPath,
                                diskFile.filename
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 text-[11px] font-medium"
                          >
                            <FolderOpen className="w-3 h-3" />
                            Load .EQP
                          </button>
                          <a
                            href={`/api/eqp/download?relPath=${encodeURIComponent(diskFile.relPath)}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-medium"
                          >
                            <Download className="w-3 h-3" />
                            .EQP
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Version Diff Inspector */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
            {selectedEntry ? (
              <>
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-900">
                        Diff Inspector · {selectedEntry.versionTag}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      {selectedEntry.eventKey}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 truncate" title={selectedEntry.displayPath}>
                    {selectedEntry.displayPath || selectedEntry.filename}
                  </div>
                </div>

                <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                  {/* Changes List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span>Recorded Changes ({selectedEntry.changes.length})</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        {formatHistoryTimestamp(selectedEntry.timestamp)}
                      </span>
                    </div>

                    {selectedEntry.changes.length === 0 ? (
                      <div className="p-3 rounded border border-slate-200 bg-slate-50 text-xs text-slate-600">
                        Checkpoint saved with identical solution fields to the preceding version.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {selectedEntry.changes.map((item, idx) => {
                          const catMeta = CATEGORY_META[item.category];
                          const hasArrow = item.detail.includes(' -> ');
                          const [beforeVal, afterVal] = hasArrow
                            ? item.detail.split(' -> ', 2)
                            : ['', ''];
                          return (
                            <div
                              key={`${item.label}-${idx}`}
                              className="p-2.5 rounded border border-slate-200 bg-slate-50/70 space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-800">
                                  {item.label}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${catMeta.className}`}
                                >
                                  {catMeta.label}
                                </span>
                              </div>
                              {hasArrow ? (
                                <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                                  <span className="text-slate-500 line-through decoration-slate-400">
                                    {beforeVal}
                                  </span>
                                  <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="text-slate-900 font-semibold">
                                    {afterVal}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-700 font-mono">
                                  {item.detail}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Snapshot Summary */}
                  <div className="pt-3 border-t border-slate-200 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      Solution State at {selectedEntry.versionTag}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-200 rounded p-2.5 font-mono tabular-nums">
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">Origin GMT</div>
                        <div className="text-slate-900">
                          {selectedEntry.snapshot.originDateGmt} {selectedEntry.snapshot.originTimeGmt}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">Hypocenter</div>
                        <div className="text-slate-900">
                          {selectedEntry.snapshot.lat.toFixed(3)}°N, {selectedEntry.snapshot.lon.toFixed(3)}°E
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">Depth / Error</div>
                        <div className="text-slate-900">
                          {selectedEntry.snapshot.depthKm.toFixed(1)} km (±{selectedEntry.snapshot.errKm.toFixed(2)} km)
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">RMS / Iterations</div>
                        <div className="text-slate-900">
                          {selectedEntry.snapshot.rmsSec.toFixed(2)}s · {selectedEntry.snapshot.iterations} it
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] font-sans text-slate-500 uppercase">Magnitudes</div>
                        <div className="text-slate-900">
                          Ms {selectedEntry.snapshot.ms.toFixed(1)} / Mb {selectedEntry.snapshot.mb.toFixed(1)} / ML {selectedEntry.snapshot.md.toFixed(1)} ({selectedEntry.snapshot.activePhases} active phases)
                        </div>
                      </div>
                    </div>

                    {(selectedEntry.snapshot.cityLabel ||
                      selectedEntry.snapshot.townLabel ||
                      selectedEntry.snapshot.generatorLabel) && (
                      <div className="text-xs space-y-1 bg-slate-50 border border-slate-200 rounded p-2.5">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase">
                          Attributed Places &amp; Fault
                        </div>
                        {selectedEntry.snapshot.cityLabel && (
                          <div className="text-slate-800">
                            <span className="font-medium text-slate-500">City:</span>{' '}
                            {selectedEntry.snapshot.cityLabel}
                          </div>
                        )}
                        {selectedEntry.snapshot.townLabel && (
                          <div className="text-slate-800">
                            <span className="font-medium text-slate-500">Town:</span>{' '}
                            {selectedEntry.snapshot.townLabel}
                          </div>
                        )}
                        {selectedEntry.snapshot.generatorLabel && (
                          <div className="text-slate-800">
                            <span className="font-medium text-slate-500">Generator:</span>{' '}
                            {selectedEntry.snapshot.generatorLabel}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedEntry.snapshot.intensities.length > 0 && (
                      <div className="text-xs space-y-1 bg-rose-50/50 border border-rose-200 rounded p-2.5">
                        <div className="text-[10px] font-semibold text-rose-700 uppercase">
                          Reported &amp; Instrumental Intensities ({selectedEntry.snapshot.intensities.length})
                        </div>
                        <ul className="space-y-0.5 text-slate-800">
                          {selectedEntry.snapshot.intensities.map((i, idx) => (
                            <li key={idx}>
                              <span className="font-semibold">
                                {i.category === 'instrumental' ? 'Instr. ' : ''}Intensity {i.peis}
                              </span>{' '}
                              - {i.locality}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedEntry.snapshot.remarks && (
                      <div className="text-xs bg-slate-50 border border-slate-200 rounded p-2.5 text-slate-700">
                        <span className="block text-[10px] font-semibold text-slate-500 uppercase mb-0.5">
                          Remarks
                        </span>
                        {selectedEntry.snapshot.remarks}
                      </div>
                    )}

                    {matchingCatalogEvent && matchingCatalogEvent.id !== activeEvent.id && (
                      <button
                        type="button"
                        onClick={() => onLoadCatalogEvent(matchingCatalogEvent.id)}
                        className="w-full py-1.5 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium"
                      >
                        Switch Workspace to Active In-Memory Event ({matchingCatalogEvent.filename})
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Select a version entry from the timeline to inspect changes.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
