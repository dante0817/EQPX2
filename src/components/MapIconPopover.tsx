import React from 'react';
import { Pin, X } from 'lucide-react';

export interface MapIconPopoverProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string | number | null;
  active?: boolean;
  accentClass?: string;
  isOpen: boolean;
  isPinned: boolean;
  onMouseEnterTrigger: () => void;
  onMouseLeaveTrigger: () => void;
  onTogglePin: () => void;
  onClose: () => void;
  widthClass?: string;
  align?: 'left' | 'right';
  themeVariant?: 'default' | 'tsunami';
  children: React.ReactNode;
}

export const MapIconPopover: React.FC<MapIconPopoverProps> = ({
  id,
  icon,
  title,
  subtitle,
  badge,
  active = false,
  accentClass = 'text-slate-700',
  isOpen,
  isPinned,
  onMouseEnterTrigger,
  onMouseLeaveTrigger,
  onTogglePin,
  onClose,
  widthClass = 'w-[340px] sm:w-[370px]',
  align = 'right',
  themeVariant = 'default',
  children,
}) => {
  const isTsunami = themeVariant === 'tsunami';
  return (
    <div
      className="relative"
      onMouseEnter={onMouseEnterTrigger}
      onMouseLeave={onMouseLeaveTrigger}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        aria-expanded={isOpen}
        aria-controls={`map-popover-${id}`}
        title={`${title} (hover to preview, click to pin)`}
        className={`relative h-8 inline-flex items-center gap-1.5 px-2 rounded-md border text-xs font-medium transition-all ${
          isPinned
            ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
            : isOpen
              ? 'bg-blue-50 border-blue-300 text-blue-900'
              : active
                ? isTsunami
                  ? 'bg-[#dce9f8] border-sky-800/55 text-slate-900 hover:bg-[#cde0f5]'
                  : 'bg-slate-50 border-slate-300 text-slate-900 hover:bg-slate-100'
                : isTsunami
                  ? 'bg-[#f4f8fe] border-sky-800/45 text-slate-700 hover:bg-[#dce9f8] hover:text-slate-900 hover:border-sky-800/65'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300'
        }`}
      >
        <span className={isPinned ? 'text-white' : accentClass}>{icon}</span>
        {badge !== undefined && badge !== null && badge !== '' && (
          <span
            className={`font-mono tabular-nums text-[10px] font-semibold px-1 py-0.2 rounded ${
              isPinned
                ? 'bg-white/20 text-white'
                : isTsunami
                  ? 'bg-[#dce9f8] text-slate-800'
                  : 'bg-slate-100 text-slate-700'
            }`}
          >
            {badge}
          </span>
        )}
        {isPinned && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white"
          />
        )}
      </button>

      {isOpen && (
        <div
          id={`map-popover-${id}`}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-full mt-1.5 ${
            align === 'left' ? 'left-0' : 'right-0'
          } ${widthClass} max-w-[calc(100vw-1.5rem)] rounded-lg shadow-xl z-40 overflow-hidden ${
            isTsunami
              ? 'bg-[#f1f4f9] border border-slate-700/65'
              : 'bg-white border border-slate-300'
          }`}
        >
          <div
            className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-2 ${
              isTsunami
                ? 'bg-[#dfe6f0] border-slate-700/55'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="min-w-0 flex items-center gap-2">
              <span className={accentClass}>{icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {title}
                </div>
                {subtitle && (
                  <div className="text-[11px] text-slate-500 truncate">
                    {subtitle}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onTogglePin}
                title={isPinned ? 'Unpin panel' : 'Pin panel open'}
                className={`p-1 rounded transition-colors ${
                  isPinned
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={`Close ${title}`}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto">{children}</div>
        </div>
      )}
    </div>
  );
};
