import React from 'react';
import { Info } from 'lucide-react';
import {
  DISPATCH_STATUS_ORDER,
  DISPATCH_STATUS_VISUALS,
  type DispatchStatus,
} from '../utils/socialMediaComms';

export interface DispatchStatusLegendProps {
  compact?: boolean;
  counts?: Partial<Record<DispatchStatus, number>>;
  title?: string;
}

export const DispatchStatusLegend: React.FC<DispatchStatusLegendProps> = ({
  compact = false,
  counts,
  title = 'Dispatch Status Legend (Shared Queue & History Color Coding)',
}) => {
  return (
    <div
      data-testid="dispatch-status-legend"
      className="rounded-md border border-slate-300 bg-slate-50/90 p-3 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Info className="w-3.5 h-3.5 text-blue-700 shrink-0" />
          <span>{title}</span>
        </div>
        <span className="text-[11px] text-slate-600">
          Consistent palette across Dispatch Queue &amp; Dispatch History
        </span>
      </div>

      <div
        className={`grid gap-2 ${
          compact
            ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
            : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-5'
        }`}
      >
        {DISPATCH_STATUS_ORDER.map((status) => {
          const meta = DISPATCH_STATUS_VISUALS[status];
          const count = counts?.[status];
          return (
            <div
              key={status}
              data-testid={`status-legend-item-${status}`}
              className={`rounded border p-2 space-y-1 text-[11px] ${meta.legendCardClass}`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border font-bold text-[10px] ${meta.pillClass}`}
                >
                  <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                  <span>{meta.shortLabel}</span>
                </span>
                {typeof count === 'number' && (
                  <span className="font-mono font-bold text-[10px] opacity-80">
                    {count}
                  </span>
                )}
              </div>
              <div className="font-mono text-[10px] font-bold opacity-80">
                {meta.status}
              </div>
              <p className="text-[11px] leading-snug opacity-95">
                {meta.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
