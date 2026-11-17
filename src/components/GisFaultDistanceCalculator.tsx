import React, { useEffect, useMemo, useState } from 'react';
import { Crosshair, Eye, LocateFixed, RotateCcw } from 'lucide-react';
import {
  computeNearestGisFaults,
  type ActiveFaultsDataset,
  type GisNearestFaultResult,
  type SelectedGeologyFeature,
} from '../utils/geologyLayers';

interface GisFaultDistanceCalculatorProps {
  isUnlocated: boolean;
  epicenterLat: number;
  epicenterLon: number;
  depthKm: number;
  activeFaultsData: ActiveFaultsDataset | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onLoadData?: () => void;
  gisActiveLayerVisible?: boolean;
  onEnableGisLayer?: (includePotentiallyActive: boolean) => void;
  onInspectFaultFeature?: (feature: SelectedGeologyFeature) => void;
}

export const GisFaultDistanceCalculator: React.FC<GisFaultDistanceCalculatorProps> = ({
  isUnlocated,
  epicenterLat,
  epicenterLon,
  depthKm,
  activeFaultsData,
  loading,
  error,
  onRetry,
  onLoadData,
  gisActiveLayerVisible = false,
  onEnableGisLayer,
  onInspectFaultFeature,
}) => {
  const [includePotentiallyActive, setIncludePotentiallyActive] = useState(false);
  const [useTrialCoords, setUseTrialCoords] = useState(false);
  const [trialLatInput, setTrialLatInput] = useState(() =>
    Number.isFinite(epicenterLat) && !isUnlocated ? epicenterLat.toFixed(3) : '14.599'
  );
  const [trialLonInput, setTrialLonInput] = useState(() =>
    Number.isFinite(epicenterLon) && !isUnlocated ? epicenterLon.toFixed(3) : '120.984'
  );
  const [trialDepthInput, setTrialDepthInput] = useState(() =>
    Number.isFinite(depthKm) && !isUnlocated ? depthKm.toFixed(1) : '10.0'
  );

  // Sync trial inputs whenever active hypocenter changes while in live mode
  useEffect(() => {
    if (!useTrialCoords && !isUnlocated && Number.isFinite(epicenterLat) && Number.isFinite(epicenterLon)) {
      setTrialLatInput(epicenterLat.toFixed(3));
      setTrialLonInput(epicenterLon.toFixed(3));
      setTrialDepthInput((Number.isFinite(depthKm) ? Math.max(0, depthKm) : 0).toFixed(1));
    }
  }, [useTrialCoords, isUnlocated, epicenterLat, epicenterLon, depthKm]);

  const parsedTrial = useMemo(() => {
    const lat = Number(trialLatInput);
    const lon = Number(trialLonInput);
    const z = Number(trialDepthInput);
    const valid =
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      Number.isFinite(lon) &&
      lon >= -180 &&
      lon <= 180 &&
      Number.isFinite(z) &&
      z >= 0 &&
      z <= 750;
    return { valid, lat, lon, depthKm: z };
  }, [trialLatInput, trialLonInput, trialDepthInput]);

  const activeCoords = useMemo(() => {
    if (useTrialCoords) {
      return parsedTrial.valid
        ? {
            ready: true,
            lat: parsedTrial.lat,
            lon: parsedTrial.lon,
            depthKm: parsedTrial.depthKm,
          }
        : { ready: false, lat: 0, lon: 0, depthKm: 0 };
    }
    if (isUnlocated || !Number.isFinite(epicenterLat) || !Number.isFinite(epicenterLon)) {
      return { ready: false, lat: 0, lon: 0, depthKm: 0 };
    }
    return {
      ready: true,
      lat: epicenterLat,
      lon: epicenterLon,
      depthKm: Number.isFinite(depthKm) && depthKm >= 0 ? depthKm : 0,
    };
  }, [useTrialCoords, parsedTrial, isUnlocated, epicenterLat, epicenterLon, depthKm]);

  const nearestResults = useMemo<GisNearestFaultResult[]>(() => {
    if (!activeFaultsData || !activeCoords.ready) return [];
    return computeNearestGisFaults({
      epicenterLat: activeCoords.lat,
      epicenterLon: activeCoords.lon,
      depthKm: activeCoords.depthKm,
      activeFaultsData,
      includePotentiallyActive,
      limit: 3,
    });
  }, [activeFaultsData, activeCoords, includePotentiallyActive]);

  const primary = nearestResults[0] ?? null;

  const handleInspectResult = (item: GisNearestFaultResult) => {
    if (!onInspectFaultFeature) return;
    onInspectFaultFeature({
      kind: 'fault',
      category: item.feature.properties.fault_category ?? 'Active Fault',
      properties: item.feature.properties,
      clickCoords: {
        lat: item.nearestPoint.lat,
        lon: item.nearestPoint.lon,
      },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <LocateFixed className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-800 truncate">
            GIS Active Fault Distance Calculator
          </span>
        </div>
        <button
          type="button"
          onClick={() => setUseTrialCoords((v) => !v)}
          className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
            useTrialCoords
              ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          title={
            useTrialCoords
              ? 'Switch back to live current hypocenter'
              : 'Test custom lat/lon/depth coordinates without modifying event'
          }
        >
          {useTrialCoords ? 'Sync Hypocenter' : 'Test Coords'}
        </button>
      </div>

      {/* Reference Coordinate Bar */}
      {useTrialCoords ? (
        <div className="p-2 rounded border border-blue-200 bg-blue-50/50 space-y-1.5">
          <div className="flex items-center justify-between text-[10.5px] text-blue-900 font-medium">
            <span>Trial Hypocenter Probe (Read-only)</span>
            {!isUnlocated && (
              <button
                type="button"
                onClick={() => {
                  setTrialLatInput(epicenterLat.toFixed(3));
                  setTrialLonInput(epicenterLon.toFixed(3));
                  setTrialDepthInput(
                    (Number.isFinite(depthKm) ? Math.max(0, depthKm) : 0).toFixed(1)
                  );
                }}
                className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:underline"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
            <label className="block">
              <span className="block font-sans text-[10px] text-slate-500">Lat (°N)</span>
              <input
                type="number"
                step="0.01"
                min="-90"
                max="90"
                value={trialLatInput}
                onChange={(e) => setTrialLatInput(e.target.value)}
                aria-label="Trial latitude degrees north"
                className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-slate-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="block font-sans text-[10px] text-slate-500">Lon (°E)</span>
              <input
                type="number"
                step="0.01"
                min="-180"
                max="180"
                value={trialLonInput}
                onChange={(e) => setTrialLonInput(e.target.value)}
                aria-label="Trial longitude degrees east"
                className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-slate-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block">
              <span className="block font-sans text-[10px] text-slate-500">Depth (km)</span>
              <input
                type="number"
                step="1"
                min="0"
                max="750"
                value={trialDepthInput}
                onChange={(e) => setTrialDepthInput(e.target.value)}
                aria-label="Trial focal depth kilometers"
                className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-slate-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>
          {!parsedTrial.valid && (
            <div className="text-[10.5px] text-rose-700">
              Enter valid WGS84 coordinates (-90..90, -180..180) and depth (0..750 km).
            </div>
          )}
        </div>
      ) : (
        <div className="px-2 py-1.5 rounded border border-slate-200/80 bg-slate-50 flex items-center justify-between gap-2 text-[11px]">
          <span className="text-slate-500 shrink-0">Current Hypocenter</span>
          <span className="font-mono tabular-nums text-slate-800 truncate">
            {activeCoords.ready
              ? `${activeCoords.lat.toFixed(3)}°N, ${activeCoords.lon.toFixed(3)}°E · Z ${activeCoords.depthKm.toFixed(1)} km`
              : 'Pending Location'}
          </span>
        </div>
      )}

      {/* Dataset scope filter */}
      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600 cursor-pointer px-0.5">
        <span>
          Include Potentially Active Faults
          {activeFaultsData
            ? ` (+${activeFaultsData.potentiallyActiveFaultCount.toLocaleString('en-US')})`
            : ' (+788)'}
        </span>
        <input
          type="checkbox"
          checked={includePotentiallyActive}
          onChange={(e) => setIncludePotentiallyActive(e.target.checked)}
          className="h-3.5 w-3.5 accent-amber-600 cursor-pointer"
        />
      </label>

      {/* Body States */}
      {loading && (
        <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-600 flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-rose-600 animate-spin shrink-0" />
          <span>Loading GIS active fault traces (active_faults.geojson)...</span>
        </div>
      )}

      {!loading && error && (
        <div className="p-2.5 rounded border border-rose-200 bg-rose-50 text-[11px] text-rose-800 flex items-center justify-between gap-2">
          <span>{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="font-semibold underline hover:text-rose-950 shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {!loading && !error && !activeFaultsData && (
        <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-600 flex items-center justify-between gap-2">
          <span>GIS fault dataset not yet loaded.</span>
          {onLoadData && (
            <button
              type="button"
              onClick={onLoadData}
              className="px-2 py-1 rounded bg-slate-900 text-white text-[10.5px] font-medium hover:bg-slate-800 shrink-0"
            >
              Load GIS Faults
            </button>
          )}
        </div>
      )}

      {!loading && !error && activeFaultsData && !activeCoords.ready && !useTrialCoords && (
        <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-500">
          Locate the hypocenter or click <span className="font-semibold text-slate-700">Test Coords</span> to calculate shortest GIS fault distance.
        </div>
      )}

      {!loading && !error && activeFaultsData && activeCoords.ready && primary && (
        <div className="space-y-2">
          {/* Primary Nearest Trace Highlight Card */}
          <div className="rounded-md border border-rose-200 bg-rose-50/40 p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      primary.feature.properties.fault_category ===
                      'Potentially Active Fault'
                        ? 'bg-amber-600'
                        : 'bg-rose-600'
                    }`}
                  />
                  <span className="font-semibold text-slate-900 text-xs truncate">
                    {primary.feature.properties.fault_name ?? 'Unnamed Fault Trace'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 pl-3.5 truncate">
                  {primary.feature.properties.segment_name ?? 'Segment not available'}
                </div>
              </div>
              <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-white border border-rose-200 text-rose-800">
                {primary.feature.properties.fault_category === 'Potentially Active Fault'
                  ? 'Potentially Active'
                  : 'Active Fault'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-rose-200/70">
              <div>
                <div className="text-[10px] text-slate-500">Surface Distance</div>
                <div className="font-mono tabular-nums text-sm font-bold text-rose-700">
                  {primary.epicentralDistKm.toFixed(1)} km
                </div>
                <div className="font-mono tabular-nums text-[10.5px] text-slate-600">
                  {primary.quadrantLabel} ({Math.round(primary.bearingDeg)}°)
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Hypocentral (3D)</div>
                <div className="font-mono tabular-nums text-sm font-bold text-slate-900">
                  {primary.hypocentralDistKm.toFixed(1)} km
                </div>
                <div className="font-mono tabular-nums text-[10.5px] text-slate-500">
                  Z {activeCoords.depthKm.toFixed(1)} km slant
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-rose-200/60 text-[10.5px] text-slate-600">
              <span className="font-mono tabular-nums">
                Trace pt: {primary.nearestPoint.lat.toFixed(3)}°N,{' '}
                {primary.nearestPoint.lon.toFixed(3)}°E
              </span>
              <span className="truncate">
                {primary.feature.properties.trace_type ?? 'Trace type N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              {onInspectFaultFeature && (
                <button
                  type="button"
                  onClick={() => handleInspectResult(primary)}
                  className="inline-flex items-center gap-1 text-[10.5px] font-medium text-rose-800 hover:text-rose-950 underline"
                >
                  <Crosshair className="w-3 h-3" />
                  Inspect Trace Details
                </button>
              )}
              {!gisActiveLayerVisible && onEnableGisLayer && (
                <button
                  type="button"
                  onClick={() => onEnableGisLayer(includePotentiallyActive)}
                  className="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-700 hover:text-slate-950"
                >
                  <Eye className="w-3 h-3" />
                  Show GIS Overlay
                </button>
              )}
            </div>
          </div>

          {/* Runners-up (#2, #3) */}
          {nearestResults.length > 1 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded">
              {nearestResults.slice(1).map((item, idx) => (
                <button
                  key={`gis-near-${item.feature.properties.source_row ?? idx}`}
                  type="button"
                  onClick={() => handleInspectResult(item)}
                  className="w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
                  title="Click to inspect GIS fault attributes"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                          item.feature.properties.fault_category ===
                          'Potentially Active Fault'
                            ? 'bg-amber-600'
                            : 'bg-rose-600'
                        }`}
                      />
                      <span className="truncate font-medium text-slate-800 text-[11px]">
                        {item.feature.properties.fault_name ?? 'Unnamed Fault Trace'}
                      </span>
                    </div>
                    {item.feature.properties.segment_name && (
                      <div className="pl-3 text-[10px] text-slate-500 truncate">
                        {item.feature.properties.segment_name}
                      </div>
                    )}
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="text-[11px] font-semibold text-slate-800">
                      {item.epicentralDistKm.toFixed(1)} km
                    </div>
                    <div className="text-[10px] text-slate-500">
                      3D {item.hypocentralDistKm.toFixed(1)} km · {item.quadrantLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="text-[10px] text-slate-500 leading-snug">
            Computed across{' '}
            {(includePotentiallyActive
              ? activeFaultsData.activeFaultCount +
                activeFaultsData.potentiallyActiveFaultCount
              : activeFaultsData.activeFaultCount
            ).toLocaleString('en-US')}{' '}
            mapped GIS traces ({activeFaultsData.sourceUrl.split('/').pop()}). Geometric proximity only; does not establish source-fault attribution.
          </div>
        </div>
      )}
    </div>
  );
};
