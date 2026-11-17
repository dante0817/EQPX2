import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ClipboardCopy,
  Clock,
  Download,
  FileCheck2,
  Filter,
  History,
  Layers,
  Search,
  Send,
} from 'lucide-react';
import {
  CHANNEL_LABELS,
  type CommunicationChannel,
  DISPATCH_STATUS_VISUALS,
  type DispatchRecord,
} from '../utils/socialMediaComms';
import { DispatchStatusLegend } from './DispatchStatusLegend';

export interface DispatchHistoryPanelProps {
  records: DispatchRecord[];
  activeEventKey: string;
  onExportCsv: (filteredRecords: DispatchRecord[]) => void;
  onCopySnapshot: (text: string, label: string) => void;
  onNavigateToQueue: () => void;
}

const CHANNEL_BADGE_META: Record<
  CommunicationChannel,
  { label: string; badgeClass: string }
> = {
  viber: {
    label: CHANNEL_LABELS.viber,
    badgeClass: 'bg-violet-50 text-violet-800 border-violet-200',
  },
  facebook: {
    label: CHANNEL_LABELS.facebook,
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  messenger: {
    label: CHANNEL_LABELS.messenger,
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  x_twitter: {
    label: CHANNEL_LABELS.x_twitter,
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  email: {
    label: CHANNEL_LABELS.email,
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  other: {
    label: CHANNEL_LABELS.other,
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
  },
};

function formatManilaHistoryTimestamp(iso?: string): string {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const getPart = (t: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === t)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')} PHT`;
  } catch {
    return iso;
  }
}

export const DispatchHistoryPanel: React.FC<DispatchHistoryPanelProps> = ({
  records,
  activeEventKey,
  onExportCsv,
  onCopySnapshot,
  onNavigateToQueue,
}) => {
  const [scope, setScope] = useState<'active' | 'all'>('all');
  const [eventFilter, setEventFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDispatchId, setSelectedDispatchId] = useState<string | null>(null);

  const uniqueEventKeys = useMemo(() => {
    const keys = new Set<string>();
    if (activeEventKey) keys.add(activeEventKey);
    for (const r of records) {
      if (r.eventKey) keys.add(r.eventKey);
    }
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [records, activeEventKey]);

  const confirmedCount = useMemo(
    () => records.filter((r) => r.status === 'OPERATOR_CONFIRMED_SENT').length,
    [records]
  );

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...records]
      .sort((a, b) => {
        const aTime = a.sentConfirmedAt || a.lastActionAt || a.createdAt;
        const bTime = b.sentConfirmedAt || b.lastActionAt || b.createdAt;
        return bTime.localeCompare(aTime);
      })
      .filter((r) => {
        if (scope === 'active' && r.eventKey !== activeEventKey) return false;
        if (scope === 'all' && eventFilter !== 'ALL' && r.eventKey !== eventFilter) {
          return false;
        }
        if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
        if (channelFilter !== 'ALL' && r.channel !== channelFilter) return false;
        if (!q) return true;
        const haystack = [
          r.dispatchId,
          r.eventKey,
          r.sourceBulletinId,
          r.sourceBulletinRevision,
          r.communicationRevisionId,
          r.destinationName,
          r.destinationIdentifier,
          CHANNEL_LABELS[r.channel],
          r.status,
          r.operatorLabel,
          r.subjectSnapshot,
          r.messageSnapshot,
          r.externalReference ?? '',
          r.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [records, scope, activeEventKey, eventFilter, statusFilter, channelFilter, searchQuery]);

  useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedDispatchId(null);
      return;
    }
    if (
      !selectedDispatchId ||
      !filteredRecords.some((r) => r.dispatchId === selectedDispatchId)
    ) {
      setSelectedDispatchId(filteredRecords[0].dispatchId);
    }
  }, [filteredRecords, selectedDispatchId]);

  const selectedRecord = useMemo(
    () =>
      filteredRecords.find((r) => r.dispatchId === selectedDispatchId) ??
      filteredRecords[0] ??
      null,
    [filteredRecords, selectedDispatchId]
  );

  return (
    <div className="space-y-4" data-testid="dispatch-history-section">
      {/* Header & Controls — visually matched to EqpHistoryPanel */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                Dispatch History &amp; Sent Notification Audit Log
              </h2>
              <span className="px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-semibold">
                {confirmedCount} Confirmed Sent
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable local workstation log of sent notifications, <span className="font-mono">Asia/Manila</span> PHT delivery timestamps, recipient destinations, and associated canonical Bulletin IDs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={onNavigateToQueue}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-slate-500" />
              Open Dispatch Queue
            </button>
            <button
              type="button"
              onClick={() => onExportCsv(filteredRecords)}
              disabled={filteredRecords.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV ({filteredRecords.length})
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
                className={`px-2.5 py-1 rounded-xs font-medium cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-xs font-medium cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Events ({uniqueEventKeys.length})
              </button>
            </div>

            {scope === 'all' && (
              <label className="inline-flex items-center gap-1.5 text-slate-600">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <select
                  aria-label="Filter Dispatch History by Event"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 font-mono text-xs"
                >
                  <option value="ALL">All Events ({records.length})</option>
                  {uniqueEventKeys.map((k) => (
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
                aria-label="Filter Dispatch History by Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 text-xs"
              >
                <option value="ALL">All Logged ({records.length})</option>
                <option value="OPERATOR_CONFIRMED_SENT">
                  Sent Only (Confirmed)
                </option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>

            <select
              aria-label="Filter Dispatch History by Channel"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 text-xs"
            >
              <option value="ALL">All Channels</option>
              {(Object.keys(CHANNEL_LABELS) as CommunicationChannel[]).map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABELS[ch]}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Bulletin ID, recipient, message..."
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded w-64 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Shared Status Legend matching Dispatch Queue color-coding */}
      <DispatchStatusLegend
        compact
        title="Dispatch History Status Legend (Matches Dispatch Queue Colors)"
      />

      {/* Main Split View — identical structure to EqpHistoryPanel */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <History className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-semibold text-slate-900">
              No dispatch history logged yet for{' '}
              {scope === 'active' ? activeEventKey : 'this filter'}
            </h3>
            <p className="text-xs text-slate-500">
              Notifications appear here automatically once confirmed via{' '}
              <span className="font-medium text-slate-700">Confirm Sent</span>{' '}
              or finalized in the{' '}
              <span className="font-medium text-slate-700">Dispatch Queue</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
            <button
              type="button"
              onClick={onNavigateToQueue}
              className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium cursor-pointer"
            >
              Go to Dispatch Queue
            </button>
            {scope === 'active' && records.length > 0 && (
              <button
                type="button"
                onClick={() => setScope('all')}
                className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
              >
                Show All Events ({records.length})
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Chronological Dispatch Timeline */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">
                Dispatch Timeline ({filteredRecords.length} entr
                {filteredRecords.length === 1 ? 'y' : 'ies'})
              </span>
              <span className="text-slate-500">
                Newest first &middot; Click any entry to inspect Bulletin ID &amp; payload
              </span>
            </div>

            <div
              className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto"
              data-testid="dispatch-history-timeline"
            >
              {filteredRecords.map((record) => {
                const isSelected = selectedRecord?.dispatchId === record.dispatchId;
                const channelMeta =
                  CHANNEL_BADGE_META[record.channel] ?? CHANNEL_BADGE_META.other;
                const statusMeta =
                  DISPATCH_STATUS_VISUALS[record.status] ?? DISPATCH_STATUS_VISUALS.PREPARED;
                const displayTimestamp = record.sentConfirmedAt || record.lastActionAt;

                return (
                  <div
                    key={record.dispatchId}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDispatchId(record.dispatchId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedDispatchId(record.dispatchId);
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
                          {record.sourceBulletinRevision}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${channelMeta.badgeClass}`}
                        >
                          {channelMeta.label}
                        </span>
                        <span
                          data-testid={`history-status-pill-${record.status}`}
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusMeta.pillClass}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusMeta.dotClass}`} />
                          <span>{statusMeta.historyLabel}</span>
                        </span>
                        {scope === 'all' && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                            {record.eventKey}
                          </span>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 tabular-nums">
                        <Clock className="w-3 h-3" />
                        {formatManilaHistoryTimestamp(displayTimestamp)}
                      </span>
                    </div>

                    <div className="mt-1.5 text-xs font-medium text-slate-900 leading-snug">
                      {record.destinationName}{' '}
                      <span className="text-slate-500 font-normal">&mdash;</span>{' '}
                      <span className="text-slate-700">{record.subjectSnapshot}</span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-600 tabular-nums">
                      <span className="font-semibold text-blue-900">
                        Bulletin ID: {record.sourceBulletinId}
                      </span>
                      <span>{record.communicationRevisionId}</span>
                      <span>
                        {record.classification === 'public_release'
                          ? 'Public Release'
                          : 'Private Office'}
                      </span>
                      <span className="text-slate-500">
                        By {record.operatorLabel}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                          record.status === 'OPERATOR_CONFIRMED_SENT'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}
                      >
                        {record.confirmationAuthenticityLabel}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {record.dispatchId}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Dispatch Inspector */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
            {selectedRecord ? (
              <>
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-900">
                        Dispatch Inspector &middot; {selectedRecord.sourceBulletinRevision}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      {selectedRecord.eventKey}
                    </span>
                  </div>
                  <div
                    className="text-[11px] font-mono text-slate-600 truncate"
                    title={selectedRecord.sourceBulletinId}
                  >
                    Bulletin ID: {selectedRecord.sourceBulletinId} &middot;{' '}
                    {selectedRecord.dispatchId}
                  </div>
                </div>

                <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
                  {/* Canonical Bulletin & Timing Grid */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      Associated Bulletin &amp; Delivery Timing
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 border border-slate-200 rounded p-2.5 font-mono tabular-nums">
                      <div className="col-span-2">
                        <div className="text-[10px] font-sans text-slate-500 uppercase">
                          Associated Bulletin ID
                        </div>
                        <div className="text-slate-900 font-semibold break-all">
                          {selectedRecord.sourceBulletinId}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">
                          Bulletin / Comm Rev
                        </div>
                        <div className="text-slate-900">
                          {selectedRecord.sourceBulletinRevision} &middot;{' '}
                          {selectedRecord.communicationRevisionId}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">
                          Channel &amp; Scope
                        </div>
                        <div className="text-slate-900">
                          {CHANNEL_LABELS[selectedRecord.channel]}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">
                          {selectedRecord.status === 'OPERATOR_CONFIRMED_SENT'
                            ? 'Confirmed Sent Timestamp'
                            : 'Final Action Timestamp'}
                        </div>
                        <div className="text-slate-900">
                          {formatManilaHistoryTimestamp(
                            selectedRecord.sentConfirmedAt || selectedRecord.lastActionAt
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-sans text-slate-500 uppercase">
                          Staged Timestamp
                        </div>
                        <div className="text-slate-900">
                          {formatManilaHistoryTimestamp(selectedRecord.createdAt)}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] font-sans text-slate-500 uppercase">
                          Recipient Destination
                        </div>
                        <div className="text-slate-900 font-sans font-medium">
                          {selectedRecord.destinationName}
                          {selectedRecord.destinationIdentifier && (
                            <span className="ml-1.5 font-mono text-[11px] text-slate-600">
                              ({selectedRecord.destinationIdentifier})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] font-sans text-slate-500 uppercase">
                          Operator &amp; Authenticity
                        </div>
                        <div className="text-slate-900">
                          {selectedRecord.operatorLabel} &middot;{' '}
                          {selectedRecord.confirmationAuthenticityLabel}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Logged Message Snapshot */}
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        Sent Message Snapshot
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onCopySnapshot(
                            `${selectedRecord.subjectSnapshot}\n\n${selectedRecord.messageSnapshot}`,
                            'logged message snapshot'
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer"
                      >
                        <ClipboardCopy className="w-3 h-3" />
                        Copy Snapshot
                      </button>
                    </div>
                    <div className="p-2.5 rounded border border-slate-200 bg-slate-50/70 space-y-1.5">
                      <div className="text-xs font-semibold text-slate-800">
                        {selectedRecord.subjectSnapshot}
                      </div>
                      <pre className="font-mono text-[11px] whitespace-pre-wrap text-slate-700 bg-white border border-slate-200 rounded p-2">
                        {selectedRecord.messageSnapshot}
                      </pre>
                    </div>
                  </div>

                  {/* Verification & External Reference */}
                  <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase">
                      Revision Fingerprints &amp; Operator Reference
                    </div>
                    <div className="p-2.5 rounded border border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-700 space-y-1">
                      <div>
                        <span className="text-slate-500">Source Fingerprint:</span>{' '}
                        {selectedRecord.sourceFingerprint}
                      </div>
                      <div>
                        <span className="text-slate-500">Message Fingerprint:</span>{' '}
                        {selectedRecord.messageFingerprint}
                      </div>
                      {selectedRecord.externalReference && (
                        <div>
                          <span className="text-slate-500">External Ref:</span>{' '}
                          {selectedRecord.externalReference}
                        </div>
                      )}
                      {selectedRecord.notes && (
                        <div className="font-sans text-slate-700 pt-1 border-t border-slate-200">
                          <span className="font-semibold text-slate-600">Notes:</span>{' '}
                          {selectedRecord.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Select a dispatch entry from the timeline to inspect details.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
