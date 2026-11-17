import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import type {
  ActiveFaultsDataset,
  GeologyLayerVisibility,
  GeologyManifest,
  TrenchSystemsDataset,
} from '../utils/geologyLayers';

interface GeologicalLayersPanelProps {
  visibility: GeologyLayerVisibility;
  onToggleLayer: (layer: keyof GeologyLayerVisibility) => void;
  activeFaultsData: ActiveFaultsDataset | null;
  trenchData: TrenchSystemsDataset | null;
  manifest: GeologyManifest | null;
  faultsLoading: boolean;
  trenchesLoading: boolean;
  faultsError: string | null;
  trenchesError: string | null;
  onRetryFaults?: () => void;
  onRetryTrenches?: () => void;
}

export const GeologicalLayersPanel: React.FC<GeologicalLayersPanelProps> = ({
  visibility,
  onToggleLayer,
  activeFaultsData,
  trenchData,
  manifest,
  faultsLoading,
  trenchesLoading,
  faultsError,
  trenchesError,
  onRetryFaults,
  onRetryTrenches,
}) => {
  const [showProvenance, setShowProvenance] = useState(false);

  const anyVisible =
    visibility.activeFaults ||
    visibility.potentiallyActiveFaults ||
    visibility.trenches;

  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">
          GIS Geological Overlays
        </span>
        <span className="text-[11px] text-slate-500">
          Reference only
        </span>
      </div>

      <div className="divide-y divide-slate-100 border border-slate-200 rounded-md bg-slate-50/40 px-2.5">
        {/* Active Faults */}
        <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 border-t-2 border-rose-600 shrink-0" />
              <span className="font-medium text-slate-900">Active Faults</span>
            </div>
            <div className="text-[11px] text-slate-500 pl-6 font-mono tabular-nums">
              {faultsLoading
                ? 'Loading active_faults.geojson...'
                : activeFaultsData
                  ? `${activeFaultsData.activeFaultCount.toLocaleString('en-US')} mapped traces`
                  : '5,552 traces · On-demand'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={visibility.activeFaults}
            onChange={() => onToggleLayer('activeFaults')}
            aria-label="Toggle GIS Active Faults"
            className="h-4 w-4 accent-rose-600 shrink-0 cursor-pointer"
          />
        </label>

        {/* Potentially Active Faults */}
        <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 border-t-2 border-dashed border-amber-600 shrink-0" />
              <span className="font-medium text-slate-900">
                Potentially Active Faults
              </span>
            </div>
            <div className="text-[11px] text-slate-500 pl-6 font-mono tabular-nums">
              {faultsLoading
                ? 'Loading active_faults.geojson...'
                : activeFaultsData
                  ? `${activeFaultsData.potentiallyActiveFaultCount.toLocaleString('en-US')} mapped traces`
                  : '788 traces · On-demand'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={visibility.potentiallyActiveFaults}
            onChange={() => onToggleLayer('potentiallyActiveFaults')}
            aria-label="Toggle GIS Potentially Active Faults"
            className="h-4 w-4 accent-amber-600 shrink-0 cursor-pointer"
          />
        </label>

        {/* Trenches / Tectonic Lines */}
        <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 border-t-2 border-indigo-700 shrink-0" />
              <span className="font-medium text-slate-900">
                Trenches / Tectonic Lines
              </span>
            </div>
            <div className="text-[11px] text-slate-500 pl-6">
              {trenchesLoading ? (
                <span className="font-mono">Loading trench_systems...</span>
              ) : trenchData ? (
                <span className="font-mono tabular-nums">
                  {trenchData.totalCount} features ({trenchData.trenchCount} trenches,{' '}
                  {trenchData.troughCount} trough, {trenchData.transformFaultCount}{' '}
                  transform) · <span className="font-sans text-amber-700 font-medium">Review Only</span>
                </span>
              ) : (
                <span>
                  11 features · <span className="text-amber-700 font-medium">Review Only</span>
                </span>
              )}
            </div>
          </div>
          <input
            type="checkbox"
            checked={visibility.trenches}
            onChange={() => onToggleLayer('trenches')}
            aria-label="Toggle GIS Trenches and Tectonic Lines (Review Only)"
            className="h-4 w-4 accent-indigo-700 shrink-0 cursor-pointer"
          />
        </label>
      </div>

      {/* Controlled Error States */}
      {faultsError && (
        <div className="px-2.5 py-2 rounded border border-rose-200 bg-rose-50 text-[11px] text-rose-800 flex items-center justify-between gap-2">
          <span>{faultsError}</span>
          {onRetryFaults && (
            <button
              type="button"
              onClick={onRetryFaults}
              className="font-semibold underline hover:text-rose-950 shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {trenchesError && (
        <div className="px-2.5 py-2 rounded border border-rose-200 bg-rose-50 text-[11px] text-rose-800 flex items-center justify-between gap-2">
          <span>{trenchesError}</span>
          {onRetryTrenches && (
            <button
              type="button"
              onClick={onRetryTrenches}
              className="font-semibold underline hover:text-rose-950 shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Dynamic Legend for Visible GIS Categories */}
      {anyVisible && (
        <div className="border-t border-slate-200 pt-2 space-y-1.5">
          <div className="text-[10px] font-semibold tracking-wider text-slate-500">
            ACTIVE GIS LEGEND (CLICK TRACE FOR DETAILS)
          </div>
          <div className="space-y-1 text-[11px] text-slate-700">
            {visibility.activeFaults && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5 border-t-2 border-rose-600 shrink-0" />
                  <span>Active Fault — Certain trace</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5 border-t-2 border-dashed border-rose-500 shrink-0" />
                  <span className="text-slate-600">
                    Active Fault — Approximate / Concealed
                  </span>
                </div>
              </div>
            )}
            {visibility.potentiallyActiveFaults && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5 border-t-2 border-dashed border-amber-600 shrink-0" />
                  <span>Potentially Active Fault — Certain</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5 border-t-2 border-dotted border-amber-600 shrink-0" />
                  <span className="text-slate-600">
                    Potentially Active Fault — Approximate / Concealed
                  </span>
                </div>
              </div>
            )}
            {visibility.trenches && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5 border-t-[2.5px] border-indigo-700 shrink-0" />
                  <span>Subduction Trench (Review Only)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5 border-t-2 border-dashed border-teal-600 shrink-0" />
                  <span>Trough (East Luzon Trough · Review Only)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-5 border-t-2 border-dotted border-violet-600 shrink-0" />
                  <span>Transform Fault (East Luzon · Review Only)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Provenance & Known Limitations Disclosure */}
      <div className="border-t border-slate-200 pt-2">
        <button
          type="button"
          onClick={() => setShowProvenance((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-[11px] font-medium text-slate-700 hover:text-slate-950 py-0.5"
        >
          <span className="inline-flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            Source, CRS &amp; Limitations
          </span>
          {showProvenance ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {showProvenance && (
          <div className="mt-2 p-2.5 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-600 space-y-1.5 leading-snug">
            <div>
              <span className="font-semibold text-slate-800">Package: </span>
              {manifest?.package_name ?? 'EQP Modern geological overlay starter pack'}
            </div>
            <div>
              <span className="font-semibold text-slate-800">Datasets: </span>
              <span className="font-mono">active_faults.geojson</span> (AF_Philippines · 6,340 features · WGS84) ·{' '}
              <span className="font-mono">trench_systems_REVIEW_ONLY.geojson</span> (trenchzone_ggrdd · 11 of 12 records · Luzon 1911 → WGS84)
            </div>
            <div>
              <span className="font-semibold text-slate-800">Integration Status: </span>
              Software overlay active ·{' '}
              <span className="text-amber-700 font-medium">
                Scientific / operational approval pending
              </span>
            </div>
            <div className="border-t border-slate-200 pt-1.5">
              <div className="font-semibold text-slate-800 mb-1">
                Known Limitations
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[10.5px]">
                {(manifest?.known_issues ?? [
                  'Missing permanent IDs on some fault features; row IDs are export-local.',
                  'Repeated fault geometries preserved without deduplication.',
                  '2026-02-19 edit history does not establish an officially approved release.',
                  'Trench record 12 (Manila Trench) had empty geometry and was omitted.',
                  'Trench Luzon 1911 → WGS84 positional accuracy is treated as unknown pending review.',
                  'Non-causal geographic reference only; does not attribute earthquake sources.',
                ]).map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
