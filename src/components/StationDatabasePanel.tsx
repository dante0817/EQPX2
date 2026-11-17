import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Code2,
  Download,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import {
  CRUSTAL_MODEL_1D,
  StationMeta,
  StationNetworkType,
  StationOperationalStatus,
} from '../data/eqpData';
import {
  formatPhilstaDat,
  formatStationsCsv,
  parsePhilstaText,
  StationDataIssue,
  StationMetaRecord,
} from '../utils/philstaParser';

interface StationDatabasePanelProps {
  stations: StationMeta[];
  issues: StationDataIssue[];
  sourceName: string;
  updatedAt: string | null;
  searchQuery: string;
  onChangeSearch: (q: string) => void;
  selectedCode: string | null;
  onSelectStation: (code: string | null) => void;
  onUpdateStation: (
    code: string,
    patch: Partial<StationMetaRecord> & { resolveIssueId?: string }
  ) => Promise<void>;
  onAddStation: (station: Partial<StationMetaRecord>) => Promise<void>;
  onDeleteStation: (code: string) => Promise<StationMetaRecord | null>;
  onImportPhilsta: (rawText: string, fileName: string, mode: 'merge' | 'replace') => Promise<void>;
  onResetCatalog: () => Promise<void>;
}

type NetworkFilter = 'all' | StationNetworkType;
type StatusFilter = 'all' | StationOperationalStatus;

const NETWORK_LABELS: Record<StationNetworkType, string> = {
  seismic: 'Seismic',
  volcanic: 'Volcanic',
  strong_motion: 'Dam / Accel',
  temporary: 'Temporary',
};

const STATUS_LABELS: Record<StationOperationalStatus, string> = {
  active: 'Active',
  temporary: 'Temporary',
  unverified: 'Needs Review',
  retired: 'Retired',
};

function toStationRecords(stations: StationMeta[]): StationMetaRecord[] {
  return stations.map((s) => ({
    code: s.code,
    name: s.name,
    province: s.province,
    lat: s.lat,
    lon: s.lon,
    elevationM: s.elevationM,
    delaySec: s.delaySec,
    sensor: s.sensor,
    networkType: s.networkType ?? 'seismic',
    volcanoName: s.volcanoName ?? null,
    status: s.status ?? 'active',
    telemetry: s.telemetry ?? null,
    auditNote: s.auditNote ?? null,
    anomalyFlags: s.anomalyFlags,
  }));
}

export const StationDatabasePanel: React.FC<StationDatabasePanelProps> = ({
  stations,
  issues,
  sourceName,
  updatedAt,
  searchQuery,
  onChangeSearch,
  selectedCode,
  onSelectStation,
  onUpdateStation,
  onAddStation,
  onDeleteStation,
  onImportPhilsta,
  onResetCatalog,
}) => {
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showIssuesPanel, setShowIssuesPanel] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [rawEditorText, setRawEditorText] = useState('');
  const [rawEditorMode, setRawEditorMode] = useState<'merge' | 'replace'>('replace');
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [deletedUndoRecord, setDeletedUndoRecord] = useState<StationMetaRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [newDraft, setNewDraft] = useState({
    code: '',
    name: '',
    province: '',
    lat: '',
    lon: '',
    elevationM: '0',
    delaySec: '0.00',
    sensor: 'Broadband 120s',
    networkType: 'seismic' as StationNetworkType,
    volcanoName: '',
    status: 'active' as StationOperationalStatus,
  });

  const selectedStation = useMemo(
    () => stations.find((s) => s.code === selectedCode) ?? null,
    [stations, selectedCode]
  );

  const [editDraft, setEditDraft] = useState<{
    name: string;
    province: string;
    lat: string;
    lon: string;
    elevationM: string;
    delaySec: string;
    sensor: string;
    networkType: StationNetworkType;
    volcanoName: string;
    status: StationOperationalStatus;
  } | null>(null);

  useEffect(() => {
    setConfirmDeleteCode(null);
    if (!selectedStation) {
      setEditDraft(null);
      return;
    }
    setEditDraft({
      name: selectedStation.name,
      province: selectedStation.province,
      lat: String(selectedStation.lat),
      lon: String(selectedStation.lon),
      elevationM: String(selectedStation.elevationM),
      delaySec: selectedStation.delaySec.toFixed(2),
      sensor: selectedStation.sensor,
      networkType: selectedStation.networkType ?? 'seismic',
      volcanoName: selectedStation.volcanoName ?? '',
      status: selectedStation.status ?? 'active',
    });
  }, [selectedStation]);

  const counts = useMemo(() => {
    const byNet: Record<StationNetworkType, number> = {
      seismic: 0,
      volcanic: 0,
      strong_motion: 0,
      temporary: 0,
    };
    let unverifiedCount = 0;
    for (const st of stations) {
      const nt = st.networkType ?? 'seismic';
      byNet[nt] += 1;
      if (st.status === 'unverified') unverifiedCount += 1;
    }
    return { total: stations.length, byNet, unverifiedCount };
  }, [stations]);

  const filteredStations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stations.filter((s) => {
      const nt = s.networkType ?? 'seismic';
      const stStatus = s.status ?? 'active';
      if (networkFilter !== 'all' && nt !== networkFilter) return false;
      if (statusFilter !== 'all' && stStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.province.toLowerCase().includes(q) ||
        (s.volcanoName ?? '').toLowerCase().includes(q)
      );
    });
  }, [stations, networkFilter, statusFilter, searchQuery]);

  const errorIssueCount = useMemo(
    () => issues.filter((i) => i.severity === 'error' || i.severity === 'warning').length,
    [issues]
  );

  const rawEditorPreview = useMemo(() => {
    if (!showRawEditor || !rawEditorText.trim()) return null;
    return parsePhilstaText(rawEditorText);
  }, [showRawEditor, rawEditorText]);

  const handleOpenRawEditor = (format: 'dat' | 'csv') => {
    const records = toStationRecords(stations);
    setRawEditorText(format === 'csv' ? formatStationsCsv(records) : formatPhilstaDat(records));
    setRawEditorMode('replace');
    setShowRawEditor(true);
  };

  const handleApplyRawEditor = async () => {
    if (!rawEditorText.trim()) return;
    setIsSaving(true);
    try {
      await onImportPhilsta(rawEditorText, 'In-App Raw Editor', rawEditorMode);
      setShowRawEditor(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedStation || !editDraft) return;
    const lat = Number(editDraft.lat);
    const lon = Number(editDraft.lon);
    const elevationM = Number(editDraft.elevationM);
    const delaySec = Number(editDraft.delaySec);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setIsSaving(true);
    try {
      await onUpdateStation(selectedStation.code, {
        name: editDraft.name.trim() || selectedStation.name,
        province: editDraft.province.trim() || selectedStation.province,
        lat,
        lon,
        elevationM: Number.isFinite(elevationM) ? Math.round(elevationM) : 0,
        delaySec: Number.isFinite(delaySec) ? Number(delaySec.toFixed(3)) : 0,
        sensor: editDraft.sensor.trim() || 'Broadband 120s',
        networkType: editDraft.networkType,
        volcanoName: editDraft.volcanoName.trim() || null,
        status: editDraft.status,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async (code: string) => {
    setIsSaving(true);
    try {
      const deleted = await onDeleteStation(code);
      if (deleted) {
        setDeletedUndoRecord(deleted);
        onSelectStation(null);
      }
      setConfirmDeleteCode(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedUndoRecord) return;
    const toRestore = deletedUndoRecord;
    setIsSaving(true);
    try {
      await onAddStation(toRestore);
      setDeletedUndoRecord(null);
      onSelectStation(toRestore.code);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = newDraft.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const lat = Number(newDraft.lat);
    const lon = Number(newDraft.lon);
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setIsSaving(true);
    try {
      await onAddStation({
        code,
        name: newDraft.name.trim() || `${code} Station`,
        province: newDraft.province.trim() || 'Philippines',
        lat,
        lon,
        elevationM: Number.isFinite(Number(newDraft.elevationM))
          ? Math.round(Number(newDraft.elevationM))
          : 0,
        delaySec: Number.isFinite(Number(newDraft.delaySec))
          ? Number(Number(newDraft.delaySec).toFixed(3))
          : 0,
        sensor: newDraft.sensor.trim() || 'Broadband 120s',
        networkType: newDraft.networkType,
        volcanoName: newDraft.volcanoName.trim() || null,
        status: newDraft.status,
      });
      setNewDraft({
        code: '',
        name: '',
        province: '',
        lat: '',
        lon: '',
        elevationM: '0',
        delaySec: '0.00',
        sensor: 'Broadband 120s',
        networkType: 'seismic',
        volcanoName: '',
        status: 'active',
      });
      setShowAddForm(false);
    } finally {
      setIsSaving(false);
    }
  };

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPhilsta = () => {
    triggerDownload(
      formatPhilstaDat(toStationRecords(stations)),
      'PHILSTA_CLEANED.DAT',
      'text/plain;charset=utf-8'
    );
  };

  const handleExportCsv = () => {
    triggerDownload(
      formatStationsCsv(toStationRecords(stations)),
      'PHILSTA_STATIONS.csv',
      'text/csv;charset=utf-8'
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const rawText = await file.text();
    setIsSaving(true);
    try {
      await onImportPhilsta(rawText, file.name, importMode);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section className="lg:col-span-8 bg-[#f1f4f9] border border-slate-600/70 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        {/* Header */}
        <div className="p-4 bg-[#e2e8f2] border-b border-slate-600/60 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
              Philippine Seismic &amp; Volcano Station Catalog
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              <span>{counts.total} stations</span>
              <span aria-hidden="true"> · </span>
              <span>Source: {sourceName}</span>
              {updatedAt && (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>Updated {new Date(updatedAt).toLocaleDateString()}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.dat,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <select
              aria-label="Import merge mode"
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
            >
              <option value="merge">Merge Import</option>
              <option value="replace">Replace Import</option>
            </select>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              Import .DAT / .CSV
            </button>
            <button
              type="button"
              onClick={() => handleOpenRawEditor('dat')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Code2 className="w-3.5 h-3.5" />
              Edit Raw Text
            </button>
            <button
              type="button"
              onClick={handleExportPhilsta}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export .DAT
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Station
            </button>
          </div>
        </div>

        {/* Undo Deleted Station Banner */}
        {deletedUndoRecord && (
          <div className="px-4 py-2 bg-slate-900 text-white text-xs flex items-center justify-between gap-3">
            <span>
              Removed station <strong className="font-mono">{deletedUndoRecord.code}</strong> ({deletedUndoRecord.name}) from catalog.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleUndoDelete}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white text-slate-900 font-semibold hover:bg-slate-100 whitespace-nowrap"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo Delete
              </button>
              <button
                type="button"
                onClick={() => setDeletedUndoRecord(null)}
                aria-label="Dismiss undo notice"
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Network Filter Bar & Search */}
        <div className="px-4 py-2.5 bg-[#dfe6f0] border-b border-slate-700/55 flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex flex-wrap items-center gap-1 p-0.5 bg-[#cbd5e1]/80 border border-slate-600/45 rounded-md text-xs">
            {(
              [
                { id: 'all', label: `All (${counts.total})` },
                { id: 'seismic', label: `Seismic (${counts.byNet.seismic})` },
                { id: 'volcanic', label: `Volcanic (${counts.byNet.volcanic})` },
                { id: 'strong_motion', label: `Dam / Accel (${counts.byNet.strong_motion})` },
                { id: 'temporary', label: `Temp (${counts.byNet.temporary})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setNetworkFilter(tab.id)}
                className={`px-2.5 py-1 rounded font-medium transition-colors whitespace-nowrap shrink-0 ${
                  networkFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by station operational status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="temporary">Temporary</option>
              <option value="unverified">Needs Review ({counts.unverifiedCount})</option>
              <option value="retired">Retired</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Code, province, volcano..."
                value={searchQuery}
                onChange={(e) => onChangeSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md w-48 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {issues.length > 0 && (
              <button
                type="button"
                onClick={() => setShowIssuesPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 transition-colors ${
                  errorIssueCount > 0
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {issues.length} Hygiene {issues.length === 1 ? 'Note' : 'Notes'}
              </button>
            )}
          </div>
        </div>

        {/* Data Hygiene / Outlier Review Panel */}
        {showIssuesPanel && issues.length > 0 && (
          <div className="px-4 py-3 bg-[#f3e6cc] border-b border-amber-800/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900">
                PHILSTA Data Hygiene &amp; Coordinate Audit ({issues.length})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetCatalog();
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="w-3 h-3" />
                  Re-seed from PHILSTA-main
                </button>
                <button
                  type="button"
                  onClick={() => setShowIssuesPanel(false)}
                  aria-label="Close hygiene panel"
                  className="p-1 text-slate-500 hover:text-slate-800"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-amber-800/25 bg-[#fbf5ea] border border-amber-800/55 rounded-md">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span
                      className={`font-semibold mr-2 ${
                        issue.severity === 'error'
                          ? 'text-rose-700'
                          : issue.severity === 'warning'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                      }`}
                    >
                      {issue.severity.toUpperCase()}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 mr-2">
                      {issue.code}
                    </span>
                    <span className="text-slate-700">{issue.message}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {issue.suggestedFix && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={async () => {
                          setIsSaving(true);
                          try {
                            await onUpdateStation(issue.code, {
                              ...issue.suggestedFix,
                              status: 'active',
                              resolveIssueId: issue.id,
                            });
                            onSelectStation(issue.code);
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-medium hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Check className="w-3 h-3" />
                        Apply Suggested Fix
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectStation(issue.code)}
                      className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-medium whitespace-nowrap shrink-0"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Inline Add Station Form */}
        {showAddForm && (
          <form
            onSubmit={handleCreateStation}
            className="p-4 bg-[#e5e1f7] border-b border-indigo-800/55 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900">
                Add New Station to Catalog
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Code *</span>
                <input
                  required
                  value={newDraft.code}
                  onChange={(e) =>
                    setNewDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))
                  }
                  placeholder="e.g. VTAG"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono uppercase bg-white"
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <span className="block text-[11px] text-slate-600">Station Name *</span>
                <input
                  required
                  value={newDraft.name}
                  onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Tagaytay Ridge Station"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Province</span>
                <input
                  value={newDraft.province}
                  onChange={(e) => setNewDraft((d) => ({ ...d, province: e.target.value }))}
                  placeholder="e.g. Cavite"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Latitude *</span>
                <input
                  required
                  type="number"
                  step="0.0001"
                  value={newDraft.lat}
                  onChange={(e) => setNewDraft((d) => ({ ...d, lat: e.target.value }))}
                  placeholder="14.101"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Longitude *</span>
                <input
                  required
                  type="number"
                  step="0.0001"
                  value={newDraft.lon}
                  onChange={(e) => setNewDraft((d) => ({ ...d, lon: e.target.value }))}
                  placeholder="120.938"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Elevation (m)</span>
                <input
                  type="number"
                  value={newDraft.elevationM}
                  onChange={(e) => setNewDraft((d) => ({ ...d, elevationM: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Delay (s)</span>
                <input
                  type="number"
                  step="0.01"
                  value={newDraft.delaySec}
                  onChange={(e) => setNewDraft((d) => ({ ...d, delaySec: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Network Type</span>
                <select
                  value={newDraft.networkType}
                  onChange={(e) =>
                    setNewDraft((d) => ({
                      ...d,
                      networkType: e.target.value as StationNetworkType,
                    }))
                  }
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="seismic">Seismic</option>
                  <option value="volcanic">Volcanic</option>
                  <option value="strong_motion">Dam / Accelerograph</option>
                  <option value="temporary">Temporary</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Volcano (if Volcanic)</span>
                <input
                  value={newDraft.volcanoName}
                  onChange={(e) => setNewDraft((d) => ({ ...d, volcanoName: e.target.value }))}
                  placeholder="e.g. Taal"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-slate-600">Sensor</span>
                <input
                  value={newDraft.sensor}
                  onChange={(e) => setNewDraft((d) => ({ ...d, sensor: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full px-3 py-1.5 rounded bg-slate-900 text-white font-medium hover:bg-slate-800"
                >
                  Save Station
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Selected Station Calibration Editor */}
        {selectedStation && editDraft && (
          <div className="p-4 bg-[#dce9f8] border-b border-sky-800/60 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-mono font-bold text-slate-900">{selectedStation.code}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-semibold text-slate-800">{selectedStation.name}</span>
                {selectedStation.auditNote && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-slate-500">{selectedStation.auditNote}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {confirmDeleteCode === selectedStation.code ? (
                  <div className="inline-flex items-center gap-1.5 text-xs">
                    <span className="text-rose-700 font-medium">
                      Delete {selectedStation.code}?
                    </span>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleConfirmDelete(selectedStation.code)}
                      className="px-2 py-0.5 rounded bg-rose-600 text-white font-medium hover:bg-rose-700 whitespace-nowrap"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCode(null)}
                      className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCode(selectedStation.code)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 text-xs font-medium whitespace-nowrap"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onSelectStation(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Close Editor
                </button>
              </div>
            </div>
            {selectedStation.anomalyFlags && selectedStation.anomalyFlags.length > 0 && (
              <div className="text-[11px] text-amber-800">
                Flags: {selectedStation.anomalyFlags.join(' · ')}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
              <label className="space-y-0.5">
                <span className="block text-[11px] text-slate-600">Latitude</span>
                <input
                  type="number"
                  step="0.0001"
                  value={editDraft.lat}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, lat: e.target.value } : d))}
                  className="w-full px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[11px] text-slate-600">Longitude</span>
                <input
                  type="number"
                  step="0.0001"
                  value={editDraft.lon}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, lon: e.target.value } : d))}
                  className="w-full px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[11px] text-slate-600">Elev (m)</span>
                <input
                  type="number"
                  value={editDraft.elevationM}
                  onChange={(e) =>
                    setEditDraft((d) => (d ? { ...d, elevationM: e.target.value } : d))
                  }
                  className="w-full px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[11px] text-slate-600">Delay (s)</span>
                <input
                  type="number"
                  step="0.01"
                  value={editDraft.delaySec}
                  onChange={(e) =>
                    setEditDraft((d) => (d ? { ...d, delaySec: e.target.value } : d))
                  }
                  className="w-full px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                />
              </label>
              <label className="space-y-0.5">
                <span className="block text-[11px] text-slate-600">Network</span>
                <select
                  value={editDraft.networkType}
                  onChange={(e) =>
                    setEditDraft((d) =>
                      d ? { ...d, networkType: e.target.value as StationNetworkType } : d
                    )
                  }
                  className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                >
                  <option value="seismic">Seismic</option>
                  <option value="volcanic">Volcanic</option>
                  <option value="strong_motion">Dam / Accel</option>
                  <option value="temporary">Temporary</option>
                </select>
              </label>
              <label className="space-y-0.5">
                <span className="block text-[11px] text-slate-600">Status</span>
                <select
                  value={editDraft.status}
                  onChange={(e) =>
                    setEditDraft((d) =>
                      d ? { ...d, status: e.target.value as StationOperationalStatus } : d
                    )
                  }
                  className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                >
                  <option value="active">Active</option>
                  <option value="temporary">Temporary</option>
                  <option value="unverified">Needs Review</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs items-end">
              <label className="space-y-0.5 sm:col-span-4">
                <span className="block text-[11px] text-slate-600">Station Name</span>
                <input
                  value={editDraft.name}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                  className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="space-y-0.5 sm:col-span-3">
                <span className="block text-[11px] text-slate-600">Province</span>
                <input
                  value={editDraft.province}
                  onChange={(e) =>
                    setEditDraft((d) => (d ? { ...d, province: e.target.value } : d))
                  }
                  className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                />
              </label>
              <label className="space-y-0.5 sm:col-span-3">
                <span className="block text-[11px] text-slate-600">Volcano / Sensor</span>
                <input
                  value={editDraft.volcanoName || editDraft.sensor}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditDraft((d) =>
                      d
                        ? d.networkType === 'volcanic'
                          ? { ...d, volcanoName: val }
                          : { ...d, sensor: val }
                        : d
                    );
                  }}
                  className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveEdit}
                  className="w-full px-3 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 whitespace-nowrap"
                >
                  Save Calibration
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Station Table */}
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-700/60 bg-[#dfe6f0] text-slate-800">
                <th className="py-2 px-4 font-semibold">Code</th>
                <th className="py-2 px-3 font-semibold">Station &amp; Province</th>
                <th className="py-2 px-3 font-semibold">Network</th>
                <th className="py-2 px-3 text-right font-semibold">Lat</th>
                <th className="py-2 px-3 text-right font-semibold">Lon</th>
                <th className="py-2 px-3 text-right font-semibold">Elev (m)</th>
                <th className="py-2 px-3 text-right font-semibold">Delay (s)</th>
                <th className="py-2 px-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300/60 font-mono tabular-nums">
              {filteredStations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center font-sans text-slate-500">
                    No stations match the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredStations.map((st, stIdx) => {
                  const isSelected = selectedCode === st.code;
                  const netType = st.networkType ?? 'seismic';
                  const stStatus = st.status ?? 'active';
                  const hasOutlier = st.anomalyFlags?.some((f) =>
                    f.toLowerCase().includes('outlier')
                  );
                  return (
                    <tr
                      key={st.code}
                      onClick={() => onSelectStation(isSelected ? null : st.code)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-sky-200/80'
                          : hasOutlier
                            ? 'bg-rose-100/70 hover:bg-rose-200/70'
                            : stIdx % 2 === 0
                              ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                              : 'bg-[#e8eff9] hover:bg-[#dbeafe]'
                      }`}
                    >
                      <td className="py-2 px-4 font-semibold text-slate-900">{st.code}</td>
                      <td className="py-2 px-3 font-sans">
                        <div className="text-slate-800 font-medium truncate max-w-[230px]">
                          {st.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[230px]">
                          {st.province}
                          {st.telemetry ? ` · ${st.telemetry}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-700 whitespace-nowrap">
                        {st.volcanoName
                          ? `Volcanic · ${st.volcanoName}`
                          : NETWORK_LABELS[netType]}
                      </td>
                      <td className="py-2 px-3 text-right">{st.lat.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right">{st.lon.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right">{st.elevationM}</td>
                      <td className="py-2 px-3 text-right">
                        {st.delaySec >= 0 ? `+${st.delaySec.toFixed(2)}` : st.delaySec.toFixed(2)}
                      </td>
                      <td
                        className={`py-2 px-3 font-sans whitespace-nowrap ${
                          stStatus === 'unverified' || hasOutlier
                            ? 'text-amber-700 font-medium'
                            : stStatus === 'retired'
                              ? 'text-slate-400'
                              : stStatus === 'temporary'
                                ? 'text-indigo-700'
                                : 'text-emerald-700'
                        }`}
                      >
                        {hasOutlier ? 'Outlier Flag' : STATUS_LABELS[stStatus]}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lg:col-span-4 bg-[#f3f1fb] border border-indigo-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
        <div className="p-4 bg-[#e5e1f7] border-b border-indigo-800/55">
          <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
            1D Crustal Velocity Model
          </h2>
          <p className="text-xs text-slate-600">Philippine island-arc crust · Vp/Vs = 1.75</p>
        </div>
        <table className="w-full text-right border-collapse text-xs">
          <thead>
            <tr className="border-b border-indigo-800/50 bg-[#dcd6f3] text-slate-800">
              <th className="py-2 px-3 text-left font-semibold">Layer</th>
              <th className="py-2 px-3 font-semibold">Top (km)</th>
              <th className="py-2 px-3 font-semibold">Vp (km/s)</th>
              <th className="py-2 px-3 font-semibold">Vs (km/s)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-800/20 font-mono tabular-nums">
            {CRUSTAL_MODEL_1D.map((l, lIdx) => (
              <tr
                key={l.layer}
                className={`transition-colors ${
                  lIdx % 2 === 0
                    ? 'bg-[#faf9fe] hover:bg-[#e2dcf7]'
                    : 'bg-[#ece8fa] hover:bg-[#e2dcf7]'
                }`}
              >
                <td className="py-2 px-3 text-left font-semibold text-slate-900">L{l.layer}</td>
                <td className="py-2 px-3">{l.topDepthKm.toFixed(1)}</td>
                <td className="py-2 px-3">{l.vpKmS.toFixed(2)}</td>
                <td className="py-2 px-3">{l.vsKmS.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* In-App Raw PHILSTA.DAT / CSV Editor Modal */}
      {showRawEditor && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Raw Station Catalog Editor (PHILSTA.DAT / CSV)
                </h3>
                <p className="text-xs text-slate-500">
                  Edit rows directly in PHILSTA whitespace format or CSV, then preview and apply
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenRawEditor('dat')}
                  className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Load as .DAT
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenRawEditor('csv')}
                  className="px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Load as CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowRawEditor(false)}
                  aria-label="Close raw editor"
                  className="p-1 text-slate-500 hover:text-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
              <textarea
                aria-label="Raw station catalog text"
                value={rawEditorText}
                onChange={(e) => setRawEditorText(e.target.value)}
                spellCheck={false}
                className="w-full h-80 p-3 border border-slate-300 rounded-md font-mono text-xs leading-relaxed text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />

              {/* Live Parse Preview Strip */}
              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs flex flex-wrap items-center justify-between gap-2">
                {rawEditorPreview ? (
                  <div className="space-y-0.5">
                    <div className="font-medium text-slate-800 font-mono tabular-nums">
                      Parsed: {rawEditorPreview.stations.length} unique stations ·{' '}
                      {rawEditorPreview.issues.filter((i) => i.severity !== 'info').length}{' '}
                      warnings/errors
                    </div>
                    {rawEditorPreview.issues.filter((i) => i.severity !== 'info').length > 0 && (
                      <div className="text-[11px] text-amber-800">
                        {rawEditorPreview.issues
                          .filter((i) => i.severity !== 'info')
                          .slice(0, 2)
                          .map((i) => i.message)
                          .join(' | ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-500">Paste or edit PHILSTA or CSV rows above.</span>
                )}

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    aria-label="Raw editor apply mode"
                    value={rawEditorMode}
                    onChange={(e) => setRawEditorMode(e.target.value as 'merge' | 'replace')}
                    className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
                  >
                    <option value="replace">Replace Full Catalog</option>
                    <option value="merge">Merge Into Catalog</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowRawEditor(false)}
                    className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || !rawEditorPreview || rawEditorPreview.stations.length === 0}
                    onClick={handleApplyRawEditor}
                    className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    Apply {rawEditorPreview ? `(${rawEditorPreview.stations.length})` : ''} Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
