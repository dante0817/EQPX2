import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Clock,
  Globe,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Route,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import {
  computeTimelineTrendSummary,
  computeTimelineWindowBounds,
  formatUtcTimelineShortDate,
  formatUtcTimelineTimestamp,
  getTrailWindowMs,
  type TimelineEventPoint,
  type TimelinePlaybackSpeed,
  type TimelineSourceFilter,
  type TimelineTrailMode,
  type VisibleTimelineEvent,
} from '../utils/epicenterTimeline';

interface EpicenterTimelinePanelProps {
  catalogEvents: TimelineEventPoint[];
  visibleEvents: VisibleTimelineEvent[];
  playheadMs: number;
  onChangePlayheadMs: (ms: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: TimelinePlaybackSpeed;
  onChangePlaybackSpeed: (speed: TimelinePlaybackSpeed) => void;
  loopPlayback: boolean;
  onToggleLoop: () => void;
  trailMode: TimelineTrailMode;
  onChangeTrailMode: (mode: TimelineTrailMode) => void;
  sourceFilter: TimelineSourceFilter;
  onChangeSourceFilter: (source: TimelineSourceFilter) => void;
  minMagnitude: number | null;
  onChangeMinMagnitude: (mag: number | null) => void;
  showMigrationPath: boolean;
  onToggleMigrationPath: () => void;
  viewportOnly: boolean;
  onToggleViewportOnly: () => void;
  workspaceCount: number;
  historicalCount: number;
  isLoadingHistorical: boolean;
  historicalError: string | null;
  isFetchingUsgs: boolean;
  onFetchUsgsCatalog: () => void;
  onOpenHistoricalResearch: () => void;
  selectedTimelineEventId: string | null;
  onSelectTimelineEvent: (ev: VisibleTimelineEvent) => void;
  onClose: () => void;
  themeVariant?: 'default' | 'tsunami';
}

const TRAIL_OPTIONS: Array<{ id: TimelineTrailMode; label: string }> = [
  { id: 'cumulative', label: 'Cumulative' },
  { id: '365d', label: '365d' },
  { id: '90d', label: '90d' },
  { id: '30d', label: '30d' },
  { id: '7d', label: '7d' },
];

const MAG_FILTER_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'All M' },
  { value: 3.0, label: 'M≥3.0' },
  { value: 4.0, label: 'M≥4.0' },
  { value: 5.0, label: 'M≥5.0' },
  { value: 6.0, label: 'M≥6.0' },
];

const SPEED_OPTIONS: TimelinePlaybackSpeed[] = [0.5, 1, 2, 4];

export const EpicenterTimelinePanel: React.FC<EpicenterTimelinePanelProps> = ({
  catalogEvents,
  visibleEvents,
  playheadMs,
  onChangePlayheadMs,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangePlaybackSpeed,
  loopPlayback,
  onToggleLoop,
  trailMode,
  onChangeTrailMode,
  sourceFilter,
  onChangeSourceFilter,
  minMagnitude,
  onChangeMinMagnitude,
  showMigrationPath,
  onToggleMigrationPath,
  viewportOnly,
  onToggleViewportOnly,
  workspaceCount,
  historicalCount,
  isLoadingHistorical,
  historicalError,
  isFetchingUsgs,
  onFetchUsgsCatalog,
  onOpenHistoricalResearch,
  selectedTimelineEventId,
  onSelectTimelineEvent,
  onClose,
  themeVariant = 'default',
}) => {
  const isTsunami = themeVariant === 'tsunami';
  const svgRef = useRef<SVGSVGElement | null>(null);
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(760);
  const [hoveredPoint, setHoveredPoint] = useState<TimelineEventPoint | null>(null);
  const isScrubbingChartRef = useRef<boolean>(false);

  const bounds = useMemo(
    () => computeTimelineWindowBounds(catalogEvents),
    [catalogEvents]
  );

  const trendSummary = useMemo(
    () => computeTimelineTrendSummary(visibleEvents, catalogEvents.length),
    [visibleEvents, catalogEvents.length]
  );

  const visibleById = useMemo(() => {
    const lookup: Record<string, VisibleTimelineEvent> = {};
    for (const v of visibleEvents) {
      lookup[v.id] = v;
    }
    return lookup;
  }, [visibleEvents]);

  // Measure wrapper width so SVG stays crisp without text distortion
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;
    const updateWidth = () => {
      const nextW = Math.max(360, Math.round(el.clientWidth));
      setChartWidth(nextW);
    };
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartHeight = 132;
  const margin = useMemo(
    () => ({ top: 14, right: 16, bottom: 24, left: 34 }),
    []
  );

  const xScale = useMemo(() => {
    const innerW = Math.max(100, chartWidth - margin.left - margin.right);
    if (!bounds) {
      return d3.scaleTime().domain([new Date(), new Date()]).range([0, innerW]);
    }
    // Pad domain slightly when only 1 event exists
    const minDomainMs =
      bounds.minMs === bounds.maxMs ? bounds.minMs - 12 * 3600 * 1000 : bounds.minMs;
    const maxDomainMs =
      bounds.minMs === bounds.maxMs ? bounds.maxMs + 12 * 3600 * 1000 : bounds.maxMs;
    return d3
      .scaleUtc()
      .domain([new Date(minDomainMs), new Date(maxDomainMs)])
      .range([0, innerW]);
  }, [bounds, chartWidth, margin]);

  // Render D3 Magnitude–Time stem plot & playhead
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (!bounds || catalogEvents.length === 0) return;

    const innerW = Math.max(100, chartWidth - margin.left - margin.right);
    const innerH = chartHeight - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const magnitudes = catalogEvents
      .map((e) => e.magnitude)
      .filter((m): m is number => m !== null && Number.isFinite(m));
    const minMagVal = magnitudes.length > 0 ? Math.floor(Math.min(2, d3.min(magnitudes) ?? 2)) : 0;
    const maxMagVal = magnitudes.length > 0 ? Math.ceil(Math.max(6, (d3.max(magnitudes) ?? 6) + 0.5)) : 8;

    const y = d3.scaleLinear().domain([minMagVal, maxMagVal]).range([innerH, 0]);

    // Horizontal gridlines
    g.append('g')
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

    // Active trail window shaded band
    const trailMs = getTrailWindowMs(trailMode);
    const clampedPlayheadMs = Math.max(bounds.minMs, Math.min(bounds.maxMs, playheadMs));
    const windowStartMs =
      trailMs !== null ? Math.max(bounds.minMs, clampedPlayheadMs - trailMs) : bounds.minMs;
    const xStart = xScale(new Date(windowStartMs));
    const xPlay = xScale(new Date(clampedPlayheadMs));

    if (xPlay > xStart) {
      g.append('rect')
        .attr('x', xStart)
        .attr('y', 0)
        .attr('width', Math.max(1, xPlay - xStart))
        .attr('height', innerH)
        .attr('fill', 'rgba(2, 132, 199, 0.08)');
    }

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(7, Math.max(3, Math.floor(innerW / 110)))).tickSizeOuter(0))
      .call((sel) => sel.select('.domain').attr('stroke', '#cbd5e1'))
      .selectAll('text')
      .attr('fill', '#475569')
      .style('font-size', '10px')
      .style('font-family', 'JetBrains Mono, ui-monospace, monospace');

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat((d) => `M${d}`))
      .call((sel) => sel.select('.domain').attr('stroke', '#cbd5e1'))
      .selectAll('text')
      .attr('fill', '#475569')
      .style('font-size', '10px')
      .style('font-family', 'JetBrains Mono, ui-monospace, monospace');

    // Stems & circles
    const eventGroup = g.append('g');
    for (const pt of catalogEvents) {
      const cx = xScale(new Date(pt.originTimeMs));
      const magVal = pt.magnitude ?? minMagVal + 0.5;
      const cy = y(magVal);
      const vis = visibleById[pt.id];
      const isSelected = selectedTimelineEventId === pt.id;
      const stemColor = vis ? vis.depthColor : '#cbd5e1';
      const stemOpacity = vis ? Math.max(0.32, vis.opacity * 0.85) : 0.45;
      const dotRadius = vis
        ? Math.max(3, Math.min(6.5, 2 + (pt.magnitude ?? 3) * 0.6))
        : 2.5;

      eventGroup
        .append('line')
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', innerH)
        .attr('y2', cy)
        .attr('stroke', stemColor)
        .attr('stroke-width', vis?.isRecentPulse ? 2 : 1.25)
        .attr('stroke-opacity', stemOpacity);

      const dot = eventGroup
        .append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', isSelected ? dotRadius + 1.5 : dotRadius)
        .attr('fill', stemColor)
        .attr('fill-opacity', vis ? vis.opacity : 0.45)
        .attr('stroke', isSelected ? '#0f172a' : vis?.isRecentPulse ? '#0f172a' : '#ffffff')
        .attr('stroke-width', isSelected || vis?.isRecentPulse ? 1.5 : 0.9)
        .style('cursor', 'pointer');

      dot.on('mouseenter', () => setHoveredPoint(pt));
      dot.on('mouseleave', () => setHoveredPoint((curr) => (curr?.id === pt.id ? null : curr)));
      dot.on('click', (mouseEvent: MouseEvent) => {
        mouseEvent.stopPropagation();
        onChangePlayheadMs(pt.originTimeMs);
        if (vis) {
          onSelectTimelineEvent(vis);
        }
      });
    }

    // Playhead vertical line & handle
    g.append('line')
      .attr('x1', xPlay)
      .attr('x2', xPlay)
      .attr('y1', -4)
      .attr('y2', innerH)
      .attr('stroke', '#0284c7')
      .attr('stroke-width', 1.75)
      .attr('pointer-events', 'none');

    g.append('polygon')
      .attr('points', `${xPlay - 5},-9 ${xPlay + 5},-9 ${xPlay},-2`)
      .attr('fill', '#0284c7')
      .attr('pointer-events', 'none');
  }, [
    bounds,
    catalogEvents,
    chartWidth,
    margin,
    playheadMs,
    selectedTimelineEventId,
    trailMode,
    visibleById,
    xScale,
    onChangePlayheadMs,
    onSelectTimelineEvent,
  ]);

  const scrubFromPointerEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!bounds || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleRatio = chartWidth / Math.max(1, rect.width);
    const localX = (e.clientX - rect.left) * scaleRatio - margin.left;
    const innerW = Math.max(100, chartWidth - margin.left - margin.right);
    const clampedX = Math.max(0, Math.min(innerW, localX));
    const dateVal = xScale.invert(clampedX).getTime();
    const clampedMs = Math.max(bounds.minMs, Math.min(bounds.maxMs, dateVal));
    onChangePlayheadMs(clampedMs);
  };

  const handleStep = (direction: -1 | 1) => {
    if (catalogEvents.length === 0) return;
    if (direction === 1) {
      const next = catalogEvents.find((ev) => ev.originTimeMs > playheadMs + 1);
      onChangePlayheadMs(next ? next.originTimeMs : catalogEvents[catalogEvents.length - 1].originTimeMs);
    } else {
      const reversed = [...catalogEvents].reverse();
      const prev = reversed.find((ev) => ev.originTimeMs < playheadMs - 1);
      onChangePlayheadMs(prev ? prev.originTimeMs : catalogEvents[0].originTimeMs);
    }
  };

  const latestVisible =
    visibleEvents.length > 0 ? visibleEvents[visibleEvents.length - 1] : null;
  const readoutEvent = hoveredPoint ?? latestVisible;

  const sliderPercent =
    bounds && bounds.spanMs > 0
      ? Math.max(0, Math.min(1000, Math.round(((playheadMs - bounds.minMs) / bounds.spanMs) * 1000)))
      : 0;

  return (
    <section
      aria-label="Epicenter Timeline Panel"
      className={`epicenter-timeline-panel card rounded-lg p-3.5 space-y-3 border ${
        isTsunami
          ? 'bg-[#edf4fc] border-sky-700/60 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Header Row */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b ${
          isTsunami ? 'border-sky-800/45' : 'border-slate-200'
        }`}
      >
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-600 shrink-0" />
            <h3
              className={
                isTsunami
                  ? 'text-sm font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]'
                  : 'text-sm font-semibold text-slate-900'
              }
            >
              Epicenter Timeline
            </h3>
            <span className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
              {bounds
                ? `${formatUtcTimelineShortDate(bounds.minMs)} — ${formatUtcTimelineShortDate(bounds.maxMs)}`
                : 'No dated events'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
            <span>
              {trendSummary.visibleCount} / {trendSummary.totalCount} epicenters active
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Workspace {workspaceCount} / Historical {historicalCount}
            </span>
            {trendSummary.peakMagnitude !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>Peak M{trendSummary.peakMagnitude.toFixed(1)}</span>
              </>
            )}
            {trendSummary.netMigrationKm !== null && trendSummary.migrationBearingLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Migration {trendSummary.netMigrationKm.toFixed(1)} km{' '}
                  {trendSummary.migrationBearingLabel}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Source Selector */}
          <div
            className={`inline-flex items-center gap-0.5 p-0.5 rounded-md ${
              isTsunami ? 'sub-card bg-[#dce9f8] border border-sky-800/55' : 'bg-slate-100'
            }`}
            role="group"
            aria-label="Timeline event source"
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'workspace', label: 'Workspace' },
                { id: 'historical', label: 'Historical' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={sourceFilter === opt.id}
                onClick={() => onChangeSourceFilter(opt.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  sourceFilter === opt.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Trail Window Selector */}
          <div
            className={`inline-flex items-center gap-0.5 p-0.5 rounded-md ${
              isTsunami ? 'sub-card bg-[#dce9f8] border border-sky-800/55' : 'bg-slate-100'
            }`}
            role="group"
            aria-label="Timeline trail persistence window"
          >
            {TRAIL_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={trailMode === opt.id}
                onClick={() => onChangeTrailMode(opt.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  trailMode === opt.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Minimum Magnitude Filter */}
          <div
            className={`inline-flex items-center gap-0.5 p-0.5 rounded-md ${
              isTsunami ? 'sub-card bg-[#dce9f8] border border-sky-800/55' : 'bg-slate-100'
            }`}
            role="group"
            aria-label="Minimum magnitude filter"
          >
            {MAG_FILTER_OPTIONS.map((opt) => {
              const isSelected = minMagnitude === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onChangeMinMagnitude(opt.value)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Migration Path & Viewport Filter Toggles */}
          <button
            type="button"
            aria-pressed={showMigrationPath}
            onClick={onToggleMigrationPath}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              showMigrationPath
                ? 'bg-sky-50 border-sky-300 text-sky-900'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            <span>Migration Path</span>
          </button>

          <button
            type="button"
            aria-pressed={viewportOnly}
            onClick={onToggleViewportOnly}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              viewportOnly
                ? 'bg-sky-50 border-sky-300 text-sky-900'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <span>Viewport Only</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Epicenter Timeline Panel"
            title="Close Epicenter Timeline Panel"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Historical Catalog Enrichment Banner if Historical Catalog is Empty */}
      {historicalCount === 0 && !isLoadingHistorical && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700">
          <span>
            Historical seismicity catalog is empty — showing workspace solutions only. Fetch regional earthquakes from USGS or import a catalog to animate multi-event trends.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isFetchingUsgs}
              onClick={onFetchUsgsCatalog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isFetchingUsgs ? 'Fetching USGS…' : 'Fetch USGS Regional Events'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenHistoricalResearch}
              className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              Import CSV / GeoJSON
            </button>
          </div>
        </div>
      )}

      {historicalError && (
        <div className="px-3 py-2 rounded-md bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {historicalError}
        </div>
      )}

      {/* Magnitude-Time Stem Chart */}
      <div
        ref={chartWrapperRef}
        className={`relative w-full border rounded-md px-2 pt-2 pb-1 ${
          isTsunami
            ? 'sub-card border-sky-800/55 bg-[#dce9f8]/70'
            : 'border-slate-200 bg-slate-50/50'
        }`}
      >
        {isLoadingHistorical && catalogEvents.length === 0 ? (
          <div className="h-[132px] flex items-center justify-center text-xs text-slate-500">
            Loading catalog events for timeline…
          </div>
        ) : catalogEvents.length === 0 ? (
          <div className="h-[132px] flex items-center justify-center text-center px-4 text-xs text-slate-500">
            No located epicenters match the active source, magnitude, or viewport filters.
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-[132px] block select-none cursor-crosshair touch-none"
            role="img"
            aria-label="Magnitude-time timeline chart of earthquake epicenters. Click or drag to scrub playback time."
            onPointerDown={(e) => {
              isScrubbingChartRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              scrubFromPointerEvent(e);
            }}
            onPointerMove={(e) => {
              if (!isScrubbingChartRef.current) return;
              scrubFromPointerEvent(e);
            }}
            onPointerUp={(e) => {
              isScrubbingChartRef.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
          />
        )}
      </div>

      {/* Transport Controls & Scrubber Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={!bounds}
            onClick={() => {
              if (bounds) onChangePlayheadMs(bounds.minMs);
            }}
            title="Rewind to start"
            aria-label="Rewind to start"
            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={catalogEvents.length === 0}
            onClick={() => handleStep(-1)}
            title="Previous event"
            aria-label="Previous event"
            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={!bounds || catalogEvents.length < 1}
            onClick={onTogglePlay}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            type="button"
            disabled={catalogEvents.length === 0}
            onClick={() => handleStep(1)}
            title="Next event"
            aria-label="Next event"
            className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-45 transition-colors"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            aria-pressed={loopPlayback}
            onClick={onToggleLoop}
            title={loopPlayback ? 'Loop playback enabled' : 'Loop playback disabled'}
            aria-label="Toggle loop playback"
            className={`p-1.5 rounded-md border transition-colors ${
              loopPlayback
                ? 'bg-sky-50 border-sky-300 text-sky-800'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Time Scrubber Slider */}
        <div className="flex-1 min-w-[180px] flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            disabled={!bounds}
            value={sliderPercent}
            aria-label="Timeline playhead position"
            onChange={(e) => {
              if (!bounds) return;
              const ratio = Number(e.target.value) / 1000;
              onChangePlayheadMs(Math.round(bounds.minMs + ratio * bounds.spanMs));
            }}
            className="w-full accent-sky-600 cursor-pointer disabled:opacity-45"
          />
          <span className="font-mono tabular-nums text-xs font-semibold text-slate-900 whitespace-nowrap shrink-0">
            {bounds ? formatUtcTimelineTimestamp(playheadMs) : '—'}
          </span>
        </div>

        {/* Playback Speed Selector */}
        <div
          className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md shrink-0"
          role="group"
          aria-label="Playback speed"
        >
          {SPEED_OPTIONS.map((spd) => (
            <button
              key={spd}
              type="button"
              aria-pressed={playbackSpeed === spd}
              onClick={() => onChangePlaybackSpeed(spd)}
              className={`px-2 py-1 text-[11px] font-mono font-medium rounded transition-colors whitespace-nowrap ${
                playbackSpeed === spd
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {spd}×
            </button>
          ))}
        </div>
      </div>

      {/* Footer Trend & Active Event Telemetry Strip */}
      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1 align-middle" />
            Shallow ≤30km: {trendSummary.shallowCount}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1 align-middle" />
            Int 31–100km: {trendSummary.intermediateCount}
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1 align-middle" />
            Deep &gt;100km: {trendSummary.deepCount}
          </span>
          {trendSummary.meanDepthKm !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span>Mean Z {trendSummary.meanDepthKm.toFixed(1)} km</span>
            </>
          )}
        </div>

        <div className="font-mono tabular-nums text-slate-700 truncate max-w-full">
          {readoutEvent ? (
            <span>
              {hoveredPoint ? 'Inspect: ' : 'Latest: '}
              {formatUtcTimelineTimestamp(readoutEvent.originTimeMs)} ·{' '}
              {readoutEvent.magnitude !== null
                ? `${readoutEvent.magnitudeScale} ${readoutEvent.magnitude.toFixed(1)}`
                : 'Mag —'}{' '}
              · {readoutEvent.depthKm !== null ? `${readoutEvent.depthKm.toFixed(0)} km` : 'Z —'} ·{' '}
              {readoutEvent.place}
            </span>
          ) : (
            <span>Advance playhead to inspect epicenters</span>
          )}
        </div>
      </div>
    </section>
  );
};
