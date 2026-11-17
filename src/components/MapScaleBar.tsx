import React from 'react';
import { computeMapScaleBarMetrics } from '../utils/maps/scaleBar';

export {
  computeMapScaleBarMetrics,
  computeVectorMapMetersPerPixel,
  computeWebMercatorMetersPerPixel,
  formatScaleDistanceValue,
  SCALE_STEPS_METERS,
  type MapScaleBarMetrics,
  type ScaleBarDistanceLabel,
} from '../utils/maps/scaleBar';

interface MapScaleBarProps {
  /** Ground distance represented by one CSS pixel at the map center. */
  metersPerPixel: number;
  compact?: boolean;
  className?: string;
}

export const MapScaleBar: React.FC<MapScaleBarProps> = ({
  metersPerPixel,
  compact = false,
  className = '',
}) => {
  const metrics = computeMapScaleBarMetrics(metersPerPixel, compact);
  if (!metrics) {
    return null;
  }

  const { barWidthPx, fullLabel, halfLabel, showMidLabel } = metrics;
  const approxScaleHint =
    metersPerPixel >= 1000
      ? `1 px ≈ ${(metersPerPixel / 1000).toFixed(2)} km`
      : `1 px ≈ ${Math.round(metersPerPixel)} m`;

  return (
    <div
      role="img"
      data-testid="map-scale-marker"
      aria-label={`Map scale bar: ${fullLabel.value} ${fullLabel.unit} (${approxScaleHint})`}
      title={`Map scale: ${fullLabel.value} ${fullLabel.unit} (${approxScaleHint})`}
      className={`pointer-events-none select-none rounded-md border border-slate-300/95 ring-1 ring-slate-900/10 bg-white/92 px-2.5 py-1.5 shadow-sm backdrop-blur-xs text-slate-800 ${className}`}
    >
      <div
        style={{ width: `${barWidthPx}px` }}
        className="relative flex items-center justify-between font-mono tabular-nums text-[10px] leading-none font-semibold text-slate-700 mb-1 transition-[width] duration-150 ease-out"
      >
        <span>0</span>
        {showMidLabel && (
          <span className="absolute left-1/2 -translate-x-1/2 text-slate-500 font-medium">
            {halfLabel.value}
          </span>
        )}
        <span className="whitespace-nowrap">
          {fullLabel.value} {fullLabel.unit}
        </span>
      </div>

      {/* Alternating two-segment cartographic scale bar with quarter & midpoint ticks */}
      <div
        style={{ width: `${barWidthPx}px` }}
        className="relative h-1.5 flex border border-slate-800 bg-white overflow-hidden transition-[width] duration-150 ease-out"
      >
        <div className="w-1/2 h-full bg-slate-800 border-r border-slate-800" />
        <div className="w-1/2 h-full bg-white relative">
          <span className="absolute inset-y-0 left-1/2 w-px bg-slate-400" />
        </div>
      </div>
    </div>
  );
};

