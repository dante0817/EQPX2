import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, HardDrive, Layers, WifiOff } from 'lucide-react';
import {
  BASEMAP_PROVIDERS,
  type BasemapProviderId,
  type BasemapProviderMeta,
  getBasemapMeta,
} from '../../utils/maps/basemapConfig';

interface BasemapSelectorProps {
  value: BasemapProviderId;
  onChange: (id: BasemapProviderId) => void;
  hasGoogleKey: boolean;
  googleUnavailable?: boolean;
  isLoadingGoogleConfig?: boolean;
  disabled?: boolean;
}

export const BasemapSelector: React.FC<BasemapSelectorProps> = ({
  value,
  onChange,
  hasGoogleKey,
  googleUnavailable = false,
  isLoadingGoogleConfig = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const currentMeta = getBasemapMeta(value);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const getGoogleAvailabilityNote = (): string | null => {
    if (isLoadingGoogleConfig) return 'Checking API key…';
    if (!hasGoogleKey) return 'API key not configured';
    if (googleUnavailable) return 'Unavailable / quota';
    return null;
  };

  const renderBadge = (provider: BasemapProviderMeta) => {
    if (provider.id === 'offline-philippines' && !provider.available) {
      return (
        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium whitespace-nowrap">
          Not installed
        </span>
      );
    }
    if (provider.id === 'google-maps') {
      const note = getGoogleAvailabilityNote();
      if (note) {
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium whitespace-nowrap">
            {note}
          </span>
        );
      }
      return (
        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium whitespace-nowrap">
          API
        </span>
      );
    }
    if (provider.category === 'open-source') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium whitespace-nowrap">
          Free
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium whitespace-nowrap">
        Offline
      </span>
    );
  };

  const openSourceProviders = BASEMAP_PROVIDERS.filter((b) => b.category === 'open-source');
  const commercialProviders = BASEMAP_PROVIDERS.filter((b) => b.category === 'commercial');
  const offlineProviders = BASEMAP_PROVIDERS.filter((b) => b.category === 'offline');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select basemap provider"
        onClick={() => setOpen((v) => !v)}
        className="h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 shadow-2xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed max-w-[230px] sm:max-w-none"
      >
        {currentMeta.engine === 'vector' ? (
          <Layers className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        ) : currentMeta.engine === 'pmtiles-offline' ? (
          <HardDrive className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        ) : (
          <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        )}
        <span className="text-slate-500 hidden sm:inline">Basemap:</span>
        <span className="font-semibold text-slate-900 truncate">
          {currentMeta.label}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Basemap providers"
          className="absolute left-0 top-full mt-1.5 w-[310px] sm:w-[340px] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white shadow-xl z-50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">
              Basemap Provider
            </span>
            <span className="text-[10.5px] text-slate-500">
              Saved automatically
            </span>
          </div>

          <div className="p-1.5 space-y-1 max-h-[70vh] overflow-y-auto">
            <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              OpenFreeMap (MapLibre GL · Keyless)
            </div>
            {openSourceProviders.map((provider) => {
              const selected = provider.id === value;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(provider.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md flex items-start justify-between gap-2 transition-colors ${
                    selected
                      ? 'bg-blue-50/90 text-blue-950 ring-1 ring-blue-200'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold truncate">
                        {provider.label}
                      </span>
                      {renderBadge(provider)}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {provider.description}
                    </p>
                  </div>
                  {selected && (
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}

            <div className="border-t border-slate-100 my-1" />
            <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Commercial Basemap
            </div>
            {commercialProviders.map((provider) => {
              const selected = provider.id === value;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(provider.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md flex items-start justify-between gap-2 transition-colors ${
                    selected
                      ? 'bg-blue-50/90 text-blue-950 ring-1 ring-blue-200'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold truncate">
                        {provider.label}
                      </span>
                      {renderBadge(provider)}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {provider.description}
                    </p>
                  </div>
                  {selected && (
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}

            <div className="border-t border-slate-100 my-1" />
            <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Offline &amp; Built-in Fallback
            </div>
            {offlineProviders.map((provider) => {
              const selected = provider.id === value;
              const isUnavailable = !provider.available;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={isUnavailable}
                  disabled={isUnavailable}
                  title={isUnavailable ? provider.unavailableReason : undefined}
                  onClick={() => {
                    if (isUnavailable) return;
                    onChange(provider.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-md flex items-start justify-between gap-2 transition-colors ${
                    isUnavailable
                      ? 'opacity-60 cursor-not-allowed bg-slate-50/60 text-slate-500'
                      : selected
                        ? 'bg-blue-50/90 text-blue-950 ring-1 ring-blue-200'
                        : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isUnavailable && (
                        <WifiOff className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs font-semibold truncate">
                        {provider.label}
                      </span>
                      {renderBadge(provider)}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {isUnavailable
                        ? provider.unavailableReason
                        : provider.description}
                    </p>
                  </div>
                  {selected && !isUnavailable && (
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
