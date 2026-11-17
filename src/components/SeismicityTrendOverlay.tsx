import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { BarChart3, X } from 'lucide-react';
import type { HistoricalEarthquakeRecord } from '../utils/historicalSeismicity';
import {
  type BasemapProviderId,
  type MapViewportState,
  zoomToLonSpan,
} from '../utils/maps/basemapConfig';

export interface GeoViewportBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function computeViewportGeoBounds(
  viewport: MapViewportState,
  basemapId: BasemapProviderId,
  widthPx = 800,
  heightPx = 500
): GeoViewportBounds {
  const safeW = Math.max(320, widthPx);
  const safeH = Math.max(240, heightPx);

  let lonSpan: number;
  let latSpan: number;

  if (basemapId === 'vector-schematic') {
    lonSpan = zoomToLonSpan(viewport.zoom, safeW);
    latSpan = (lonSpan * 450) / 640;
  } else {
    lonSpan = (360 * safeW) / (256 * Math.pow(2, Math.min(20, Math.max(1, viewport.zoom))));
    const latCos = Math.max(0.25, Math.cos((viewport.lat * Math.PI) / 180));
    latSpan = lonSpan * (safeH / safeW) * latCos;
  }

  return {
    minLat: Math.max(-85, viewport.lat - latSpan / 2),
    maxLat: Math.min(85, viewport.lat + latSpan / 2),
    minLon: Math.max(-180, viewport.lon - lonSpan / 2),
    maxLon: Math.min(180, viewport.lon + lonSpan / 2),
  };
}

interface TrendBin {
  key: string;
  label: string;
  count: number;
  maxMag: number | null;
}

interface SeismicityTrendOverlayProps {
  historicalEvents: HistoricalEarthquakeRecord[];
  isLoading: boolean;
  error: string | null;
  viewport: MapViewportState;
  basemapId: BasemapProviderId;
  onClose: () => void;
  themeVariant?: 'default' | 'tsunami';
}

export const SeismicityTrendOverlay: React.FC<SeismicityTrendOverlayProps> = ({
  historicalEvents,
  isLoading,
  error,
  viewport,
  basemapId,
  onClose,
  themeVariant = 'default',
}) => {
  const isTsunami = themeVariant === 'tsunami';
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredBin, setHoveredBin] = useState<TrendBin | null>(null);

  const bounds = useMemo(
    () => computeViewportGeoBounds(viewport, basemapId),
    [viewport, basemapId]
  );

  const viewportEvents = useMemo(
    () =>
      historicalEvents.filter(
        (ev) =>
          Number.isFinite(ev.lat) &&
          Number.isFinite(ev.lon) &&
          ev.lat >= bounds.minLat &&
          ev.lat <= bounds.maxLat &&
          ev.lon >= bounds.minLon &&
          ev.lon <= bounds.maxLon
      ),
    [historicalEvents, bounds]
  );

  const { bins, granularityLabel, maxMagInViewport, peakBin } = useMemo(() => {
    const validDated = viewportEvents
      .map((ev) => {
        const ms = Number.isFinite(ev.originTimeMs)
          ? ev.originTimeMs
          : Date.parse(ev.originTimeUtc);
        return Number.isFinite(ms) ? { ev, ms } : null;
      })
      .filter((item): item is { ev: HistoricalEarthquakeRecord; ms: number } => item !== null)
      .sort((a, b) => a.ms - b.ms);

    let maxMag: number | null = null;
    for (const item of viewportEvents) {
      if (item.magnitude !== null && Number.isFinite(item.magnitude)) {
        maxMag = maxMag === null ? item.magnitude : Math.max(maxMag, item.magnitude);
      }
    }

    if (validDated.length === 0) {
      return {
        bins: [] as TrendBin[],
        granularityLabel: 'Yearly',
        maxMagInViewport: maxMag,
        peakBin: null as TrendBin | null,
      };
    }

    const minMs = validDated[0].ms;
    const maxMs = validDated[validDated.length - 1].ms;
    const spanDays = (maxMs - minMs) / (1000 * 60 * 60 * 24);

    const mode: 'year' | 'month' | 'day' =
      spanDays > 540 ? 'year' : spanDays > 45 ? 'month' : 'day';

    const grouped = new Map<string, { label: string; count: number; maxMag: number | null }>();

    if (mode === 'year') {
      const startYear = new Date(minMs).getUTCFullYear();
      const endYear = new Date(maxMs).getUTCFullYear();
      if (endYear - startYear <= 40) {
        for (let y = startYear; y <= endYear; y++) {
          const k = String(y);
          grouped.set(k, { label: k, count: 0, maxMag: null });
        }
      }
    } else if (mode === 'month') {
      const start = new Date(minMs);
      const end = new Date(maxMs);
      let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
      let guard = 0;
      while (cursor.getTime() <= endUtc && guard < 24) {
        const y = cursor.getUTCFullYear();
        const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        const k = `${y}-${m}`;
        grouped.set(k, { label: k, count: 0, maxMag: null });
        cursor = new Date(Date.UTC(y, cursor.getUTCMonth() + 1, 1));
        guard += 1;
      }
    }

    for (const { ev, ms } of validDated) {
      const d = new Date(ms);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const key = mode === 'year' ? `${y}` : mode === 'month' ? `${y}-${m}` : `${y}-${m}-${day}`;
      const label = mode === 'year' ? `${y}` : mode === 'month' ? `${y}-${m}` : `${m}/${day}`;
      const existing = grouped.get(key) ?? { label, count: 0, maxMag: null };
      existing.count += 1;
      if (ev.magnitude !== null && Number.isFinite(ev.magnitude)) {
        existing.maxMag =
          existing.maxMag === null ? ev.magnitude : Math.max(existing.maxMag, ev.magnitude);
      }
      grouped.set(key, existing);
    }

    const builtBins: TrendBin[] = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        key,
        label: val.label,
        count: val.count,
        maxMag: val.maxMag,
      }));

    let topBin: TrendBin | null = null;
    for (const b of builtBins) {
      if (!topBin || b.count > topBin.count) {
        topBin = b;
      }
    }

    return {
      bins: builtBins,
      granularityLabel: mode === 'year' ? 'Yearly' : mode === 'month' ? 'Monthly' : 'Daily',
      maxMagInViewport: maxMag,
      peakBin: topBin,
    };
  }, [viewportEvents]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (bins.length === 0) return;

    const totalW = 304;
    const totalH = 136;
    const margin = { top: 12, right: 10, bottom: 24, left: 28 };
    const innerW = totalW - margin.left - margin.right;
    const innerH = totalH - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${totalW} ${totalH}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand<string>()
      .domain(bins.map((b) => b.label))
      .range([0, innerW])
      .padding(0.24);

    const maxCount = Math.max(1, d3.max(bins, (b) => b.count) ?? 1);
    const y = d3.scaleLinear().domain([0, maxCount]).nice().range([innerH, 0]);

    // Subtle horizontal gridlines
    g.append('g')
      .attr('class', 'd3-grid')
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(-innerW)
          .tickFormat(() => '')
      )
      .call((sel) => sel.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', '#e2e8f0')
      .attr('stroke-dasharray', '2,2');

    // Area + Trend line across bin centers
    if (bins.length >= 2) {
      const areaGen = d3
        .area<TrendBin>()
        .x((d) => (x(d.label) ?? 0) + x.bandwidth() / 2)
        .y0(innerH)
        .y1((d) => y(d.count))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(bins)
        .attr('fill', 'rgba(14, 165, 233, 0.14)')
        .attr('d', areaGen);
    }

    // Bars
    g.selectAll<SVGRectElement, TrendBin>('rect.trend-bar')
      .data(bins)
      .join('rect')
      .attr('class', 'trend-bar')
      .attr('x', (d) => x(d.label) ?? 0)
      .attr('y', (d) => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', (d) => Math.max(0, innerH - y(d.count)))
      .attr('rx', 1.5)
      .attr('fill', (d) => (d.count > 0 ? '#0284c7' : '#cbd5e1'))
      .attr('fill-opacity', (d) => (d.count > 0 ? 0.78 : 0.35))
      .style('cursor', 'pointer')
      .on('mouseenter', function (_event, d) {
        d3.select(this).attr('fill', '#0369a1').attr('fill-opacity', 1);
        setHoveredBin(d);
      })
      .on('mouseleave', function (_event, d) {
        d3.select(this)
          .attr('fill', d.count > 0 ? '#0284c7' : '#cbd5e1')
          .attr('fill-opacity', d.count > 0 ? 0.78 : 0.35);
        setHoveredBin(null);
      });

    // Smooth trend polyline
    if (bins.length >= 2) {
      const lineGen = d3
        .line<TrendBin>()
        .x((d) => (x(d.label) ?? 0) + x.bandwidth() / 2)
        .y((d) => y(d.count))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(bins)
        .attr('fill', 'none')
        .attr('stroke', '#0f172a')
        .attr('stroke-width', 1.4)
        .attr('stroke-opacity', 0.7)
        .attr('pointer-events', 'none')
        .attr('d', lineGen);

      g.selectAll<SVGCircleElement, TrendBin>('circle.trend-dot')
        .data(bins.filter((b) => b.count > 0))
        .join('circle')
        .attr('class', 'trend-dot')
        .attr('cx', (d) => (x(d.label) ?? 0) + x.bandwidth() / 2)
        .attr('cy', (d) => y(d.count))
        .attr('r', 2.2)
        .attr('fill', '#0f172a')
        .attr('pointer-events', 'none');
    }

    // Thinned X-axis ticks to prevent overlap
    const maxTicks = 5;
    const step = Math.max(1, Math.ceil(bins.length / maxTicks));
    const tickValues = bins
      .filter((_, idx) => idx % step === 0 || idx === bins.length - 1)
      .map((b) => b.label);

    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues(tickValues).tickSizeOuter(0))
      .call((sel) => sel.select('.domain').attr('stroke', '#cbd5e1'))
      .selectAll('text')
      .attr('fill', '#475569')
      .style('font-size', '9px')
      .style('font-family', 'ui-monospace, SFMono-Regular, monospace');

    g.append('g')
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickFormat((v) => (Number.isInteger(Number(v)) ? String(v) : ''))
      )
      .call((sel) => sel.select('.domain').attr('stroke', '#cbd5e1'))
      .selectAll('text')
      .attr('fill', '#475569')
      .style('font-size', '9px')
      .style('font-family', 'ui-monospace, SFMono-Regular, monospace');
  }, [bins]);

  return (
    <aside
      aria-label="Seismicity Trend Overlay"
      className={`seismicity-trend-overlay card absolute bottom-10 right-3 z-20 w-[332px] max-w-[calc(100%-1.5rem)] rounded-lg border backdrop-blur-xs shadow-lg text-slate-900 p-2.5 text-xs pointer-events-auto ${
        isTsunami
          ? 'bg-[#eef6f8]/95 border-cyan-700/65'
          : 'border-slate-300 bg-white/95'
      }`}
    >
      <div
        className={`flex items-start justify-between gap-2 pb-1.5 border-b ${
          isTsunami ? 'border-cyan-800/45' : 'border-slate-200'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
            <BarChart3 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span
              className={`truncate ${
                isTsunami
                  ? 'font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]'
                  : ''
              }`}
            >
              Seismicity Trend Overlay
            </span>
            <span className="px-1 py-0.2 rounded bg-sky-100 text-sky-800 font-mono text-[9px] font-bold">
              D3
            </span>
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
            {bounds.minLat.toFixed(1)}°–{bounds.maxLat.toFixed(1)}°N ·{' '}
            {bounds.minLon.toFixed(1)}°–{bounds.maxLon.toFixed(1)}°E
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Disable Seismicity Trend Overlay"
          aria-label="Disable Seismicity Trend Overlay"
          className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-mono font-semibold text-sky-800 tabular-nums">
          {viewportEvents.length} {viewportEvents.length === 1 ? 'event' : 'events'} in viewport
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {granularityLabel} · Catalog {historicalEvents.length}
        </span>
      </div>

      {isLoading ? (
        <div className="h-[136px] flex items-center justify-center text-[11px] text-slate-500">
          Loading historical seismicity catalog…
        </div>
      ) : error ? (
        <div className="h-[136px] flex items-center justify-center text-center px-3 text-[11px] text-rose-700">
          {error}
        </div>
      ) : bins.length === 0 ? (
        <div className="h-[136px] flex items-center justify-center text-center px-3 text-[11px] text-slate-500">
          No historical events fall inside the current map viewport. Zoom out or pan to inspect regional seismicity trends.
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="w-full h-[136px] mt-1 block overflow-visible"
          role="img"
          aria-label={`D3 historical seismicity count chart showing ${viewportEvents.length} events in the current viewport`}
        />
      )}

      <div className="mt-1 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-600">
        {hoveredBin ? (
          <span className="text-sky-900 font-semibold">
            {hoveredBin.label}: {hoveredBin.count}{' '}
            {hoveredBin.count === 1 ? 'event' : 'events'}
            {hoveredBin.maxMag !== null ? ` · Max M${hoveredBin.maxMag.toFixed(1)}` : ''}
          </span>
        ) : (
          <span>
            {peakBin
              ? `Peak ${peakBin.label} (${peakBin.count})`
              : 'Historical event count'}
          </span>
        )}
        <span>
          {maxMagInViewport !== null ? `Max M${maxMagInViewport.toFixed(1)}` : 'Mag —'}
        </span>
      </div>
    </aside>
  );
};
