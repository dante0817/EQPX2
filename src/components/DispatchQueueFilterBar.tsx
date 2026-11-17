import React from 'react';
import {
  Check,
  Filter,
  Globe,
  Mail,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  Share2,
} from 'lucide-react';
import {
  CHANNEL_LABELS,
  COMMUNICATION_CHANNEL_ORDER,
  type CommunicationChannel,
  DISPATCH_STATUS_ORDER,
  DISPATCH_STATUS_VISUALS,
  type DispatchQueueFilterCounts,
  type DispatchStatus,
} from '../utils/socialMediaComms';

export interface DispatchQueueFilterBarProps {
  selectedStatuses: DispatchStatus[];
  selectedChannels: CommunicationChannel[];
  activeEventOnly: boolean;
  filteredCount: number;
  counts: DispatchQueueFilterCounts;
  onToggleStatus: (status: DispatchStatus) => void;
  onSelectAllStatuses: () => void;
  onSelectPendingStatuses: () => void;
  onClearStatuses: () => void;
  onToggleChannel: (channel: CommunicationChannel) => void;
  onSelectAllChannels: () => void;
  onClearChannels: () => void;
  onResetAllFilters: () => void;
}

const CHANNEL_STYLE_META: Record<
  CommunicationChannel,
  {
    activeClass: string;
    badgeDotClass: string;
    icon: React.ReactNode;
  }
> = {
  viber: {
    activeClass: 'bg-violet-50 border-violet-500 text-violet-950 shadow-xs',
    badgeDotClass: 'bg-violet-600',
    icon: <MessageCircle className="w-3 h-3 shrink-0 text-violet-700" />,
  },
  facebook: {
    activeClass: 'bg-blue-50 border-blue-500 text-blue-950 shadow-xs',
    badgeDotClass: 'bg-blue-600',
    icon: <Share2 className="w-3 h-3 shrink-0 text-blue-700" />,
  },
  messenger: {
    activeClass: 'bg-sky-50 border-sky-500 text-sky-950 shadow-xs',
    badgeDotClass: 'bg-sky-600',
    icon: <MessageSquare className="w-3 h-3 shrink-0 text-sky-700" />,
  },
  x_twitter: {
    activeClass: 'bg-slate-200/80 border-slate-700 text-slate-950 shadow-xs',
    badgeDotClass: 'bg-slate-800',
    icon: <Globe className="w-3 h-3 shrink-0 text-slate-800" />,
  },
  email: {
    activeClass: 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-xs',
    badgeDotClass: 'bg-indigo-600',
    icon: <Mail className="w-3 h-3 shrink-0 text-indigo-700" />,
  },
  other: {
    activeClass: 'bg-teal-50 border-teal-500 text-teal-950 shadow-xs',
    badgeDotClass: 'bg-teal-600',
    icon: <Globe className="w-3 h-3 shrink-0 text-teal-700" />,
  },
};

export const DispatchQueueFilterBar: React.FC<DispatchQueueFilterBarProps> = ({
  selectedStatuses,
  selectedChannels,
  activeEventOnly,
  filteredCount,
  counts,
  onToggleStatus,
  onSelectAllStatuses,
  onSelectPendingStatuses,
  onClearStatuses,
  onToggleChannel,
  onSelectAllChannels,
  onClearChannels,
  onResetAllFilters,
}) => {
  const allStatusesSelected =
    selectedStatuses.length === DISPATCH_STATUS_ORDER.length;
  const allChannelsSelected =
    selectedChannels.length === COMMUNICATION_CHANNEL_ORDER.length;
  const hasActiveFilter =
    !allStatusesSelected || !allChannelsSelected || activeEventOnly;

  return (
    <div
      data-testid="dispatch-queue-filter-bar"
      className="rounded-md border border-slate-300 bg-slate-50 p-3 space-y-2.5"
    >
      {/* Top Filter Summary & Global Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-slate-800">
            <Filter className="w-3.5 h-3.5 text-blue-700" />
            Filter Transmissions
          </span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700">
            Showing <strong>{filteredCount}</strong> of{' '}
            <strong>{counts.totalInScope}</strong> in scope
          </span>
          {(!allStatusesSelected || !allChannelsSelected) && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-semibold">
              {selectedStatuses.length}/{DISPATCH_STATUS_ORDER.length} statuses &bull;{' '}
              {selectedChannels.length}/{COMMUNICATION_CHANNEL_ORDER.length} channels
            </span>
          )}
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            data-testid="queue-reset-filters-btn"
            onClick={onResetAllFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold border border-slate-400 bg-white hover:bg-slate-100 text-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Filters
          </button>
        )}
      </div>

      {/* Side-by-Side Multi-Select Status & Communication Channel Filters */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* Status Multi-Select Filter */}
        <div
          data-testid="queue-status-multiselect"
          role="group"
          aria-label="Filter Dispatch Queue by Status"
          className="rounded border border-slate-300 bg-white p-2.5 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
                Status Visibility
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                {selectedStatuses.length}/{DISPATCH_STATUS_ORDER.length} active
              </span>
            </div>

            <div className="flex items-center gap-1 text-[10px]">
              <button
                type="button"
                data-testid="queue-status-select-all"
                onClick={onSelectAllStatuses}
                disabled={allStatusesSelected}
                className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-45 font-bold text-slate-700 cursor-pointer disabled:cursor-default"
              >
                All
              </button>
              <button
                type="button"
                data-testid="queue-status-select-pending"
                onClick={onSelectPendingStatuses}
                className="px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 font-bold text-amber-900 cursor-pointer"
                title="Show only PREPARED and OPENED_EXTERNALLY items"
              >
                Pending Only
              </button>
              <button
                type="button"
                data-testid="queue-status-clear-all"
                onClick={onClearStatuses}
                disabled={selectedStatuses.length === 0}
                className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-45 font-bold text-slate-700 cursor-pointer disabled:cursor-default"
              >
                None
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {DISPATCH_STATUS_ORDER.map((status) => {
              const meta = DISPATCH_STATUS_VISUALS[status];
              const isSelected = selectedStatuses.includes(status);
              const count = counts.byStatus[status] ?? 0;

              return (
                <button
                  key={status}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  data-testid={`queue-status-chip-${status}`}
                  title={`${isSelected ? 'Hide' : 'Show'} ${meta.status} entries — ${meta.description}`}
                  onClick={() => onToggleStatus(status)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-bold transition-colors cursor-pointer ${
                    isSelected
                      ? meta.legendCardClass + ' shadow-xs'
                      : 'bg-slate-100/80 border-slate-300 text-slate-500 opacity-75 hover:opacity-100 hover:bg-slate-100'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-400 text-transparent'
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
                  <span>{meta.shortLabel}</span>
                  <span className="font-mono text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Communication Channel Multi-Select Filter */}
        <div
          data-testid="queue-channel-multiselect"
          role="group"
          aria-label="Filter Dispatch Queue by Communication Channel"
          className="rounded border border-slate-300 bg-white p-2.5 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
                Channel Visibility
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                {selectedChannels.length}/{COMMUNICATION_CHANNEL_ORDER.length} active
              </span>
            </div>

            <div className="flex items-center gap-1 text-[10px]">
              <button
                type="button"
                data-testid="queue-channel-select-all"
                onClick={onSelectAllChannels}
                disabled={allChannelsSelected}
                className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-45 font-bold text-slate-700 cursor-pointer disabled:cursor-default"
              >
                All
              </button>
              <button
                type="button"
                data-testid="queue-channel-clear-all"
                onClick={onClearChannels}
                disabled={selectedChannels.length === 0}
                className="px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 disabled:opacity-45 font-bold text-slate-700 cursor-pointer disabled:cursor-default"
              >
                None
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {COMMUNICATION_CHANNEL_ORDER.map((ch) => {
              const isSelected = selectedChannels.includes(ch);
              const styleMeta = CHANNEL_STYLE_META[ch];
              const count = counts.byChannel[ch] ?? 0;

              return (
                <button
                  key={ch}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  data-testid={`queue-channel-chip-${ch}`}
                  title={`${isSelected ? 'Hide' : 'Show'} ${CHANNEL_LABELS[ch]} transmissions`}
                  onClick={() => onToggleChannel(ch)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-bold transition-colors cursor-pointer ${
                    isSelected
                      ? styleMeta.activeClass
                      : 'bg-slate-100/80 border-slate-300 text-slate-500 opacity-75 hover:opacity-100 hover:bg-slate-100'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-sky-700 border-sky-800 text-white'
                        : 'bg-white border-slate-400 text-transparent'
                    }`}
                  >
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  {styleMeta.icon}
                  <span>{CHANNEL_LABELS[ch]}</span>
                  <span className="font-mono text-[10px] opacity-80">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
