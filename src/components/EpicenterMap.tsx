import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import {
  ACTIVE_VOLCANOES,
  DEFAULT_PH_CENTER,
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  PHILSTA_DATABASE,
  StationMeta,
  StationPick,
  TECTONIC_PLATES,
} from '../data/eqpData';
import { PeisBandCode, ShakeMapResult } from '../utils/shakemap';
import {
  STATION_REGION_OPTIONS,
  stationMetaMatchesRegion,
  stationPickMatchesRegion,
  type StationRegionFilter,
} from '../utils/stationRegions';
import {
  computeDistanceAndBearing,
  DEFAULT_MAIN_OFFICE,
  type MainOfficeLocation,
} from '../utils/nearestPlaces';
import { MapScaleBar, computeVectorMapMetersPerPixel } from './MapScaleBar';
import { formatLegacyScaleShort } from '../utils/magnitudeEngine';
import { FloatingGeologyPopup } from './GeologyFeaturePopup';
import {
  FloatingStationPopup,
  StationHoverCard,
} from './StationMapPopup';
import {
  hitTestGeologyFeatures,
  type ActiveFaultsDataset,
  type GeologyLayerVisibility,
  type SelectedGeologyFeature,
  type TrenchSystemsDataset,
} from '../utils/geologyLayers';
import {
  lonSpanToZoom,
  type MapViewportState,
  zoomToLonSpan,
} from '../utils/maps/basemapConfig';
import {
  formatUtcTimelineTimestamp,
  type VisibleTimelineEvent,
} from '../utils/epicenterTimeline';
import {
  drawGisLayersToCanvas,
  rasterizeSvgElementToCanvas,
  type MapSnapshotProvider,
} from '../utils/mapSnapshotExport';

export type VectorMapStyle = 'terrain' | 'satellite' | 'hybrid' | 'roadmap';

const VECTOR_MAP_THEMES: Record<
  VectorMapStyle,
  {
    sea: string;
    grid: string;
    gridLabel: string;
    land: string;
    landStroke: string;
    fault: string;
    plateStroke: string;
    stationText: string;
    stationSelectedText: string;
    volcanoText: string;
    volcanoHoverText: string;
    cityDot: string;
    cityText: string;
  }
> = {
  terrain: {
    sea: '#d8effc',
    grid: '#bae6fd',
    gridLabel: '#475569',
    land: '#eef2e6',
    landStroke: '#64748b',
    fault: '#e11d48',
    plateStroke: '#4f46e5',
    stationText: '#334155',
    stationSelectedText: '#0f172a',
    volcanoText: '#c2410c',
    volcanoHoverText: '#9a3412',
    cityDot: '#475569',
    cityText: '#334155',
  },
  satellite: {
    sea: '#0a192f',
    grid: '#1e3a5f',
    gridLabel: '#93c5fd',
    land: '#1e3a2f',
    landStroke: '#4ade80',
    fault: '#fb7185',
    plateStroke: '#818cf8',
    stationText: '#e2e8f0',
    stationSelectedText: '#ffffff',
    volcanoText: '#fdba74',
    volcanoHoverText: '#ffedd5',
    cityDot: '#cbd5e1',
    cityText: '#e2e8f0',
  },
  hybrid: {
    sea: '#0f233c',
    grid: '#274c77',
    gridLabel: '#bfdbfe',
    land: '#243b30',
    landStroke: '#86efac',
    fault: '#f43f5e',
    plateStroke: '#a5b4fc',
    stationText: '#f1f5f9',
    stationSelectedText: '#ffffff',
    volcanoText: '#fed7aa',
    volcanoHoverText: '#ffffff',
    cityDot: '#fde047',
    cityText: '#f8fafc',
  },
  roadmap: {
    sea: '#dbeafe',
    grid: '#bfdbfe',
    gridLabel: '#334155',
    land: '#f8fafc',
    landStroke: '#94a3b8',
    fault: '#dc2626',
    plateStroke: '#4338ca',
    stationText: '#1e293b',
    stationSelectedText: '#020617',
    volcanoText: '#b45309',
    volcanoHoverText: '#78350f',
    cityDot: '#1e293b',
    cityText: '#0f172a',
  },
};

interface EpicenterMapProps {
  event: EQPEvent;
  stations?: StationMeta[];
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
  compact?: boolean;
  minimalToolbar?: boolean;
  mapStyle?: VectorMapStyle;
  showFaults?: boolean;
  onToggleFaults?: () => void;
  showVolcanoes?: boolean;
  onToggleVolcanoes?: () => void;
  showPlates?: boolean;
  onTogglePlates?: () => void;
  showStations?: boolean;
  onToggleStations?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  shakeMap?: ShakeMapResult | null;
  showShakeMap?: boolean;
  shakeMapOpacity?: number;
  visibleShakeBands?: Record<PeisBandCode, boolean>;
  highlightedShakeBand?: PeisBandCode | null;
  regionFilter?: StationRegionFilter;
  onChangeRegionFilter?: (next: StationRegionFilter) => void;
  mainOffice?: MainOfficeLocation;
  showRangeRings?: boolean;
  showNearestPlaces?: boolean;
  nearestCitiesPins?: Array<{
    name: string;
    lat: number;
    lon: number;
    distanceKm: number;
    bearing: string;
  }>;
  showCatalogEvents?: boolean;
  catalogEvents?: EQPEvent[];
  onSelectCatalogEvent?: (eventId: string) => void;
  rulerActive?: boolean;
  rulerPoints?: {
    start: { lat: number; lon: number } | null;
    end: { lat: number; lon: number } | null;
  };
  onRulerPointClick?: (coords: { lat: number; lon: number }) => void;
  comparisonMarkers?: Array<{
    modelId: string;
    label: string;
    lat: number;
    lon: number;
    depthKm: number;
    rmsSec: number;
    color: string;
  }>;
  geologyVisibility?: GeologyLayerVisibility;
  gisActiveFaultsData?: ActiveFaultsDataset | null;
  gisTrenchData?: TrenchSystemsDataset | null;
  selectedGeologyFeature?: SelectedGeologyFeature | null;
  onSelectGeologyFeature?: (feature: SelectedGeologyFeature | null) => void;
  viewport?: MapViewportState;
  onViewportChange?: (next: MapViewportState) => void;
  timelineEvents?: VisibleTimelineEvent[];
  showTimelineMigration?: boolean;
  selectedTimelineEventId?: string | null;
  onSelectTimelineEvent?: (ev: VisibleTimelineEvent) => void;
  onSnapshotProviderReady?: (provider: MapSnapshotProvider | null) => void;
}

export const EpicenterMap: React.FC<EpicenterMapProps> = ({
  event,
  stations = PHILSTA_DATABASE,
  selectedStation,
  onSelectStation,
  compact = false,
  minimalToolbar = false,
  mapStyle = 'terrain',
  showFaults: controlledFaults,
  onToggleFaults,
  showVolcanoes: controlledVolcanoes,
  onToggleVolcanoes,
  showPlates: controlledPlates,
  onTogglePlates,
  showStations: controlledStations,
  onToggleStations,
  showGrid: controlledGrid,
  onToggleGrid,
  shakeMap = null,
  showShakeMap = false,
  shakeMapOpacity = 0.4,
  visibleShakeBands,
  highlightedShakeBand = null,
  regionFilter = 'ALL',
  onChangeRegionFilter,
  mainOffice = DEFAULT_MAIN_OFFICE,
  showRangeRings = false,
  showNearestPlaces = false,
  nearestCitiesPins = [],
  showCatalogEvents = false,
  catalogEvents = [],
  onSelectCatalogEvent,
  rulerActive = false,
  rulerPoints = { start: null, end: null },
  onRulerPointClick,
  comparisonMarkers = [],
  geologyVisibility,
  gisActiveFaultsData = null,
  gisTrenchData = null,
  selectedGeologyFeature = null,
  onSelectGeologyFeature,
  viewport,
  onViewportChange,
  timelineEvents = [],
  showTimelineMigration = false,
  selectedTimelineEventId = null,
  onSelectTimelineEvent,
  onSnapshotProviderReady,
}) => {
  const theme = VECTOR_MAP_THEMES[mapStyle];
  const unlocatedInit = isEventUnlocated(event);
  const epiLatInit = unlocatedInit ? DEFAULT_PH_CENTER.lat : event.lat;
  const epiLonInit = unlocatedInit ? DEFAULT_PH_CENTER.lon : event.lon;
  const [zoomSpan, setZoomSpan] = useState<number>(() =>
    viewport ? zoomToLonSpan(viewport.zoom, 800) : compact ? 6.5 : 8.5
  );
  const [panOffset, setPanOffset] = useState<{ dLat: number; dLon: number }>(() =>
    viewport
      ? {
          dLat: Math.max(-14, Math.min(14, viewport.lat - epiLatInit)),
          dLon: Math.max(-14, Math.min(14, viewport.lon - epiLonInit)),
        }
      : { dLat: 0, dLon: 0 }
  );
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [internalFaults, setInternalFaults] = useState(true);
  const [internalVolcanoes, setInternalVolcanoes] = useState(true);
  const [internalPlates, setInternalPlates] = useState(true);
  const [internalStations, setInternalStations] = useState(true);
  const [internalGrid, setInternalGrid] = useState(true);
  const [showMainOffice, setShowMainOffice] = useState(true);
  const [showNetworkCoverage, setShowNetworkCoverage] = useState(false);
  const [hoveredVolcano, setHoveredVolcano] = useState<string | null>(null);
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);
  const [hoveredNetworkStationCode, setHoveredNetworkStationCode] = useState<string | null>(null);
  const [clickedStationId, setClickedStationId] = useState<string | null>(null);
  const [clickedTimelineEvent, setClickedTimelineEvent] = useState<VisibleTimelineEvent | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const bgSvgRef = useRef<SVGSVGElement | null>(null);
  const fgSvgRef = useRef<SVGSVGElement | null>(null);
  const gisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startPan: { dLat: number; dLon: number };
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [containerWidthPx, setContainerWidthPx] = useState<number>(640);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const nextW = el.clientWidth;
      if (nextW > 0) setContainerWidthPx(nextW);
    };
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidthPx(entry.contentRect.width);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stationMetaByCode = useMemo(() => {
    const map: Record<string, StationMeta> = {};
    for (const st of stations) {
      map[st.code] = st;
    }
    return map;
  }, [stations]);

  const visibleStations = useMemo(
    () => stations.filter((st) => stationMetaMatchesRegion(st, regionFilter)),
    [stations, regionFilter]
  );

  const visiblePicks = useMemo(
    () =>
      event.picks.filter((pick) =>
        stationPickMatchesRegion(pick, regionFilter, stationMetaByCode)
      ),
    [event.picks, regionFilter, stationMetaByCode]
  );

  const pickedCodeSet = useMemo(
    () => new Set(event.picks.map((p) => p.sta.toUpperCase())),
    [event.picks]
  );

  const showFaults = controlledFaults ?? internalFaults;
  const showVolcanoes = controlledVolcanoes ?? internalVolcanoes;
  const showPlates = controlledPlates ?? internalPlates;
  const showStations = controlledStations ?? internalStations;
  const showGrid = controlledGrid ?? internalGrid;

  const toggleFaults = onToggleFaults ?? (() => setInternalFaults((v) => !v));
  const toggleVolcanoes = onToggleVolcanoes ?? (() => setInternalVolcanoes((v) => !v));
  const togglePlates = onTogglePlates ?? (() => setInternalPlates((v) => !v));
  const toggleStations = onToggleStations ?? (() => setInternalStations((v) => !v));
  const toggleGrid = onToggleGrid ?? (() => setInternalGrid((v) => !v));

  const unlocated = isEventUnlocated(event);
  const epiLat = unlocated ? DEFAULT_PH_CENTER.lat : event.lat;
  const epiLon = unlocated ? DEFAULT_PH_CENTER.lon : event.lon;
  const centerLat = epiLat + panOffset.dLat;
  const centerLon = epiLon + panOffset.dLon;

  const width = 640;
  const height = compact ? 310 : 450;

  const lonSpan = zoomSpan;
  const latSpan = (zoomSpan * height) / width;

  const eventViewKey = `${event.id}:${epiLat.toFixed(4)}:${epiLon.toFixed(4)}`;
  const prevEventViewKeyRef = useRef<string>(eventViewKey);
  useEffect(() => {
    if (prevEventViewKeyRef.current !== eventViewKey) {
      prevEventViewKeyRef.current = eventViewKey;
      setPanOffset({ dLat: 0, dLon: 0 });
    }
  }, [eventViewKey]);

  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const isFirstViewportSyncRef = useRef(true);
  useEffect(() => {
    if (isFirstViewportSyncRef.current) {
      isFirstViewportSyncRef.current = false;
      return;
    }
    onViewportChangeRef.current?.({
      lat: Number(centerLat.toFixed(5)),
      lon: Number(centerLon.toFixed(5)),
      zoom: lonSpanToZoom(zoomSpan, containerWidthPx),
    });
  }, [centerLat, centerLon, zoomSpan, containerWidthPx]);

  const zoomViewStateRef = useRef({
    zoomSpan,
    panOffset,
    epiLat,
    epiLon,
    width,
    height,
  });
  zoomViewStateRef.current = {
    zoomSpan,
    panOffset,
    epiLat,
    epiLon,
    width,
    height,
  };

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[role="dialog"]')) {
        return;
      }
      e.preventDefault();

      const normalizedDelta =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * 400
            : e.deltaY;
      if (Math.abs(normalizedDelta) < 0.01) return;

      const {
        zoomSpan: currentZoom,
        panOffset: currentPan,
        epiLat: baseLat,
        epiLon: baseLon,
        width: svgW,
        height: svgH,
      } = zoomViewStateRef.current;

      const factor = Math.min(1.35, Math.max(0.74, Math.exp(normalizedDelta * 0.0018)));
      const nextZoom = Number(
        Math.min(22, Math.max(0.5, currentZoom * factor)).toFixed(3)
      );
      if (Math.abs(nextZoom - currentZoom) < 0.0005) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        setZoomSpan(nextZoom);
        return;
      }

      const relX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const relY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

      const oldLonSpan = currentZoom;
      const oldLatSpan = (currentZoom * svgH) / svgW;
      const oldCenterLon = baseLon + currentPan.dLon;
      const oldCenterLat = baseLat + currentPan.dLat;

      const cursorLon = oldCenterLon - oldLonSpan / 2 + relX * oldLonSpan;
      const cursorLat = oldCenterLat + oldLatSpan / 2 - relY * oldLatSpan;

      const newLonSpan = nextZoom;
      const newLatSpan = (nextZoom * svgH) / svgW;
      const newCenterLon = cursorLon + (0.5 - relX) * newLonSpan;
      const newCenterLat = cursorLat + (relY - 0.5) * newLatSpan;

      const nextDLon = Math.max(-14, Math.min(14, newCenterLon - baseLon));
      const nextDLat = Math.max(-14, Math.min(14, newCenterLat - baseLat));

      setZoomSpan(nextZoom);
      setPanOffset({ dLat: nextDLat, dLon: nextDLon });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        setIsDraggingPan(false);
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  const metersPerPixel = useMemo(
    () => computeVectorMapMetersPerPixel(lonSpan, centerLat, containerWidthPx),
    [lonSpan, centerLat, containerWidthPx]
  );

  const minLon = centerLon - lonSpan / 2;
  const maxLon = centerLon + lonSpan / 2;
  const minLat = centerLat - latSpan / 2;
  const maxLat = centerLat + latSpan / 2;

  const project = (lon: number, lat: number): [number, number] => {
    const x = ((lon - minLon) / (maxLon - minLon)) * width;
    const y = height - ((lat - minLat) / (maxLat - minLat)) * height;
    return [x, y];
  };

  const anyGisLayerVisible = Boolean(
    geologyVisibility &&
      (geologyVisibility.activeFaults ||
        geologyVisibility.potentiallyActiveFaults ||
        geologyVisibility.trenches)
  );

  useEffect(() => {
    const canvas = gisCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const targetW = Math.max(1, Math.round(containerWidthPx * dpr));
    const targetH = Math.max(1, Math.round(((containerWidthPx * height) / width) * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!anyGisLayerVisible || !geologyVisibility) return;

    ctx.scale(canvas.width / width, canvas.height / height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawLines = (
      lines: Array<Array<[number, number]>>,
      strokeStyle: string,
      lineWidth: number,
      dash: number[],
      alpha: number
    ) => {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = alpha;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (const line of lines) {
        if (line.length < 2) continue;
        const [x0, y0] = project(line[0][0], line[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < line.length; i++) {
          const [xi, yi] = project(line[i][0], line[i][1]);
          ctx.lineTo(xi, yi);
        }
      }
      ctx.stroke();
    };

    // 1. Trenches / Tectonic Lines (Review Only)
    if (geologyVisibility.trenches && gisTrenchData) {
      for (const feat of gisTrenchData.features) {
        const [fMinLon, fMinLat, fMaxLon, fMaxLat] = feat.bbox;
        if (fMaxLon < minLon || fMinLon > maxLon || fMaxLat < minLat || fMinLat > maxLat) {
          continue;
        }
        const lines =
          feat.geometry.type === 'LineString'
            ? [feat.geometry.coordinates]
            : feat.geometry.coordinates;
        if (feat.kind === 'trough') {
          drawLines(lines, '#0d9488', 2.0, [7, 4], 0.9);
        } else if (feat.kind === 'transform_fault') {
          drawLines(lines, '#7c3aed', 2.0, [3, 3], 0.9);
        } else {
          drawLines(lines, '#3730a3', 2.3, [], 0.92);
        }
      }
    }

    // 2. Potentially Active Faults
    if (geologyVisibility.potentiallyActiveFaults && gisActiveFaultsData) {
      const certainLines: Array<Array<[number, number]>> = [];
      const uncertainLines: Array<Array<[number, number]>> = [];
      for (const feat of gisActiveFaultsData.features) {
        if (feat.properties.fault_category !== 'Potentially Active Fault') continue;
        const [fMinLon, fMinLat, fMaxLon, fMaxLat] = feat.bbox;
        if (fMaxLon < minLon || fMinLon > maxLon || fMaxLat < minLat || fMinLat > maxLat) {
          continue;
        }
        const lines =
          feat.geometry.type === 'LineString'
            ? [feat.geometry.coordinates]
            : feat.geometry.coordinates;
        if (feat.isUncertainTrace) {
          uncertainLines.push(...lines);
        } else {
          certainLines.push(...lines);
        }
      }
      if (certainLines.length > 0) {
        drawLines(certainLines, '#d97706', 1.45, [6, 3.5], 0.92);
      }
      if (uncertainLines.length > 0) {
        drawLines(uncertainLines, '#d97706', 1.25, [2.2, 3.2], 0.8);
      }
    }

    // 3. Active Faults
    if (geologyVisibility.activeFaults && gisActiveFaultsData) {
      const certainLines: Array<Array<[number, number]>> = [];
      const uncertainLines: Array<Array<[number, number]>> = [];
      for (const feat of gisActiveFaultsData.features) {
        if (feat.properties.fault_category !== 'Active Fault') continue;
        const [fMinLon, fMinLat, fMaxLon, fMaxLat] = feat.bbox;
        if (fMaxLon < minLon || fMinLon > maxLon || fMaxLat < minLat || fMinLat > maxLat) {
          continue;
        }
        const lines =
          feat.geometry.type === 'LineString'
            ? [feat.geometry.coordinates]
            : feat.geometry.coordinates;
        if (feat.isUncertainTrace) {
          uncertainLines.push(...lines);
        } else {
          certainLines.push(...lines);
        }
      }
      if (certainLines.length > 0) {
        drawLines(certainLines, '#e11d48', 1.55, [], 0.95);
      }
      if (uncertainLines.length > 0) {
        drawLines(uncertainLines, '#e11d48', 1.35, [5, 3.5], 0.8);
      }
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }, [
    anyGisLayerVisible,
    geologyVisibility,
    gisActiveFaultsData,
    gisTrenchData,
    minLon,
    maxLon,
    minLat,
    maxLat,
    containerWidthPx,
    width,
    height,
  ]);

  const snapshotStateRef = useRef({
    width,
    height,
    minLon,
    maxLon,
    minLat,
    maxLat,
    centerLat,
    centerLon,
    zoomSpan,
    containerWidthPx,
    metersPerPixel,
    mapStyle,
    showMainOffice,
    showNetworkCoverage,
    anyGisLayerVisible,
    geologyVisibility,
    gisActiveFaultsData,
    gisTrenchData,
  });
  snapshotStateRef.current = {
    width,
    height,
    minLon,
    maxLon,
    minLat,
    maxLat,
    centerLat,
    centerLon,
    zoomSpan,
    containerWidthPx,
    metersPerPixel,
    mapStyle,
    showMainOffice,
    showNetworkCoverage,
    anyGisLayerVisible,
    geologyVisibility,
    gisActiveFaultsData,
    gisTrenchData,
  };

  useEffect(() => {
    if (!onSnapshotProviderReady) return;
    const provider: MapSnapshotProvider = async () => {
      const bgEl = bgSvgRef.current;
      const fgEl = fgSvgRef.current;
      if (!bgEl || !fgEl) return null;
      const st = snapshotStateRef.current;
      const targetW = 2400;
      const targetH = Math.round((targetW * st.height) / st.width);
      const scale = targetW / st.width;

      const [bgCanvas, fgCanvas] = await Promise.all([
        rasterizeSvgElementToCanvas(bgEl, targetW, targetH),
        rasterizeSvgElementToCanvas(fgEl, targetW, targetH),
      ]);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = targetW;
      outCanvas.height = targetH;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(bgCanvas, 0, 0);

      if (st.anyGisLayerVisible && st.geologyVisibility) {
        const proj = (lon: number, lat: number): [number, number] => [
          ((lon - st.minLon) / (st.maxLon - st.minLon)) * targetW,
          targetH - ((lat - st.minLat) / (st.maxLat - st.minLat)) * targetH,
        ];
        drawGisLayersToCanvas(ctx, {
          project: proj,
          minLon: st.minLon,
          maxLon: st.maxLon,
          minLat: st.minLat,
          maxLat: st.maxLat,
          scale,
          geologyVisibility: st.geologyVisibility,
          gisActiveFaultsData: st.gisActiveFaultsData,
          gisTrenchData: st.gisTrenchData,
        });
      }

      ctx.drawImage(fgCanvas, 0, 0);

      return {
        engine: 'vector',
        canvas: outCanvas,
        cssWidth: st.containerWidthPx,
        cssHeight: (st.containerWidthPx * st.height) / st.width,
        viewport: {
          lat: st.centerLat,
          lon: st.centerLon,
          zoom: lonSpanToZoom(st.zoomSpan, st.containerWidthPx),
        },
        metersPerPixel: st.metersPerPixel,
        basemapLabel: 'Vector Schematic (Built-in)',
        mapStyleMode: st.mapStyle,
        showMainOffice: st.showMainOffice,
        showNetworkCoverage: st.showNetworkCoverage,
      };
    };

    onSnapshotProviderReady(provider);
    return () => onSnapshotProviderReady(null);
  }, [onSnapshotProviderReady]);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0 || rulerActive) return;
    suppressClickRef.current = false;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPan: panOffset,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const drag = dragStateRef.current;
    if (drag && rect.width > 0 && rect.height > 0) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        suppressClickRef.current = true;
        setIsDraggingPan(true);
      }
      if (drag.moved) {
        const dLon = -(dx / rect.width) * lonSpan;
        const dLat = (dy / rect.height) * latSpan;
        setPanOffset({
          dLat: Math.max(-14, Math.min(14, drag.startPan.dLat + dLat)),
          dLon: Math.max(-14, Math.min(14, drag.startPan.dLon + dLon)),
        });
      }
    }

    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const lon = minLon + relX * (maxLon - minLon);
    const lat = maxLat - relY * (maxLat - minLat);
    setCursorCoords({ lat, lon });
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const lon = minLon + relX * (maxLon - minLon);
    const lat = maxLat - relY * (maxLat - minLat);

    if (rulerActive && onRulerPointClick) {
      onRulerPointClick({ lat, lon });
      return;
    }

    setClickedStationId(null);
    setClickedTimelineEvent(null);

    if (anyGisLayerVisible && geologyVisibility && onSelectGeologyFeature) {
      const pixelTolDeg = (10 / Math.max(1, rect.width)) * lonSpan;
      const hit = hitTestGeologyFeatures({
        clickLon: lon,
        clickLat: lat,
        maxToleranceDeg: Math.max(0.03, pixelTolDeg),
        visibility: geologyVisibility,
        activeFaultsData: gisActiveFaultsData,
        trenchData: gisTrenchData,
      });
      onSelectGeologyFeature(hit);
    }
  };

  const [epiX, epiY] = project(epiLon, epiLat);

  const gridLons: number[] = [];
  for (let l = Math.ceil(minLon); l <= Math.floor(maxLon); l++) {
    gridLons.push(l);
  }
  const gridLats: number[] = [];
  for (let l = Math.ceil(minLat); l <= Math.floor(maxLat); l++) {
    gridLats.push(l);
  }

  const getStationColor = (pick: StationPick) => {
    if (pick.pExcluded) return '#94a3b8';
    const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
    if (maxRes >= 1.0) return '#dc2626';
    if (maxRes > 0.5) return '#d97706';
    return '#2563eb';
  };

  const hoveredStation = useMemo(() => {
    if (!showStations || !hoveredStationId) return null;
    return visiblePicks.find((p) => p.id === hoveredStationId) ?? null;
  }, [showStations, hoveredStationId, visiblePicks]);

  const hoveredNetworkStation = useMemo(() => {
    if (!showNetworkCoverage || !hoveredNetworkStationCode) return null;
    return visibleStations.find((s) => s.code === hoveredNetworkStationCode) ?? null;
  }, [showNetworkCoverage, hoveredNetworkStationCode, visibleStations]);

  const clickedStationPick = useMemo(() => {
    if (!showStations || !clickedStationId) return null;
    return visiblePicks.find((p) => p.id === clickedStationId) ?? null;
  }, [showStations, clickedStationId, visiblePicks]);

  return (
    <div className="flex flex-col border border-slate-200 bg-white rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Regional Epicenter Map</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {unlocated
              ? 'Epicenter Pending'
              : `${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E`}
          </span>
          {cursorCoords && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                Cursor: {cursorCoords.lat.toFixed(2)}°N {cursorCoords.lon.toFixed(2)}°E
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!minimalToolbar && (
            <>
              <button
                type="button"
                onClick={toggleFaults}
                aria-pressed={showFaults}
                title={showFaults ? 'Disable Active Faults Layer' : 'Enable Active Faults Layer'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  showFaults
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                {showFaults ? <Eye className="w-3.5 h-3.5 text-rose-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                Active Faults
              </button>
              <button
                type="button"
                onClick={toggleVolcanoes}
                aria-pressed={showVolcanoes}
                title={showVolcanoes ? 'Disable Active Volcanoes Layer' : 'Enable Active Volcanoes Layer'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  showVolcanoes
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                {showVolcanoes ? <Eye className="w-3.5 h-3.5 text-orange-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                Volcanoes
              </button>
              <button
                type="button"
                onClick={togglePlates}
                aria-pressed={showPlates}
                title={showPlates ? 'Disable Plate Boundaries Layer' : 'Enable Plate Boundaries Layer'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  showPlates
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                {showPlates ? <Eye className="w-3.5 h-3.5 text-indigo-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                Plate Boundaries
              </button>
              <button
                type="button"
                onClick={toggleStations}
                aria-pressed={showStations}
                title={showStations ? 'Disable Seismic Stations Layer' : 'Enable Seismic Stations Layer'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  showStations
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                {showStations ? <Eye className="w-3.5 h-3.5 text-blue-600" /> : <EyeOff className="w-3.5 h-3.5" />}
                Stations
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowNetworkCoverage((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
              showNetworkCoverage
                ? 'bg-white text-slate-900 border-slate-300'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
            }`}
            title="Show all background seismic and volcano monitoring stations"
          >
            {showNetworkCoverage ? <Eye className="w-3.5 h-3.5 text-teal-600" /> : <EyeOff className="w-3.5 h-3.5" />}
            Network ({regionFilter === 'ALL' ? stations.length : `${visibleStations.length}/${stations.length}`})
          </button>
          {!minimalToolbar && onChangeRegionFilter && (
            <select
              value={regionFilter}
              onChange={(e) => onChangeRegionFilter(e.target.value as StationRegionFilter)}
              aria-label="Filter by Region"
              title="Filter seismic stations by geographic region"
              className="px-2 py-1 text-xs font-medium rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATION_REGION_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.shortLabel}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowMainOffice((v) => !v)}
            aria-pressed={showMainOffice}
            title={`Toggle ${mainOffice.code} Main Office reference marker & distance vector`}
            className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
              showMainOffice
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            {mainOffice.code} Ref
          </button>
          {!minimalToolbar && (
            <button
              type="button"
              onClick={toggleGrid}
              aria-pressed={showGrid}
              title={showGrid ? 'Disable Coordinate Grid' : 'Enable Coordinate Grid'}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                showGrid
                  ? 'bg-white text-slate-900 border-slate-300'
                  : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              Grid
            </button>
          )}
          <div className="h-4 w-px bg-slate-200 mx-0.5" />
          <button
            type="button"
            aria-label="Zoom In Map"
            title="Zoom In Map"
            onClick={() => setZoomSpan((z) => Math.max(0.5, Number((z * 0.78).toFixed(2))))}
            className="p-1.5 rounded text-slate-600 hover:bg-slate-200/70 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom Out Map"
            title="Zoom Out Map"
            onClick={() => setZoomSpan((z) => Math.min(22, Number((z / 0.78).toFixed(2))))}
            className="p-1.5 rounded text-slate-600 hover:bg-slate-200/70 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Reset Map View to Epicenter"
            title="Reset Map View to Epicenter"
            onClick={() => {
              setZoomSpan(compact ? 6.5 : 8.5);
              setPanOffset({ dLat: 0, dLon: 0 });
            }}
            className="p-1.5 rounded text-slate-600 hover:bg-slate-200/70 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div ref={mapContainerRef} className="relative bg-sky-50/70">
        <svg
          ref={bgSvgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`w-full h-auto block select-none ${rulerActive ? 'cursor-cell' : 'cursor-crosshair'}`}
          onMouseMove={handleMouseMove}
          onClick={handleSvgClick}
          onMouseLeave={() => {
            setCursorCoords(null);
            setHoveredStationId(null);
            setHoveredNetworkStationCode(null);
          }}
        >
          <defs>
            <filter id="shakemap-contour-glow" x="-15%" y="-15%" width="130%" height="130%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ocean backdrop */}
          <rect width={width} height={height} fill={theme.sea} />

          {/* Regional tectonic plates */}
          {showPlates &&
            TECTONIC_PLATES.map((plate) => {
              const pts = plate.points.map(([lon, lat]) => project(lon, lat).join(',')).join(' ');
              const [lx, ly] = project(plate.labelCoord[0], plate.labelCoord[1]);
              return (
                <g key={plate.id}>
                  <polygon
                    points={pts}
                    fill={plate.fillColor}
                    stroke={theme.plateStroke}
                    strokeOpacity={0.55}
                    strokeWidth={1.2}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill={theme.plateStroke}
                    fillOpacity={0.85}
                    className="font-mono select-none"
                  >
                    {plate.shortLabel}
                  </text>
                </g>
              );
            })}

          {/* Coordinate grid */}
          {(showGrid || mapStyle === 'hybrid') &&
            gridLons.map((lon) => {
              const [x] = project(lon, centerLat);
              return (
                <g key={`lon-${lon}`}>
                  <line x1={x} y1={0} x2={x} y2={height} stroke={theme.grid} strokeWidth={1} strokeDasharray="3 3" />
                  <text x={x + 4} y={14} fontSize={10} fill={theme.gridLabel} className="font-mono">
                    {lon}°E
                  </text>
                </g>
              );
            })}
          {(showGrid || mapStyle === 'hybrid') &&
            gridLats.map((lat) => {
              const [, y] = project(centerLon, lat);
              return (
                <g key={`lat-${lat}`}>
                  <line x1={0} y1={y} x2={width} y2={y} stroke={theme.grid} strokeWidth={1} strokeDasharray="3 3" />
                  <text x={6} y={y - 4} fontSize={10} fill={theme.gridLabel} className="font-mono">
                    {lat}°N
                  </text>
                </g>
              );
            })}

          {/* Island polygons */}
          {ISLAND_POLYGONS.map((island) => {
            const pts = island.points.map(([lon, lat]) => project(lon, lat).join(',')).join(' ');
            return (
              <polygon
                key={island.name}
                points={pts}
                fill={theme.land}
                stroke={theme.landStroke}
                strokeWidth={1.1}
                strokeLinejoin="round"
              />
            );
          })}

          {/* Simulated ShakeMap Intensity Contours (d3-contour) */}
          {shakeMap &&
            shakeMap.contours.map((contour, cIdx) => {
              const pathD = contour.rings
                .map((ring) =>
                  ring
                    .map(([lon, lat], pIdx) => {
                      const [px, py] = project(lon, lat);
                      return `${pIdx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
                    })
                    .join(' ') + ' Z',
                )
                .join(' ');
              const isBandVisible =
                showShakeMap &&
                (visibleShakeBands ? visibleShakeBands[contour.band.roman] !== false : true) &&
                shakeMapOpacity > 0;
              const isHighlighted =
                isBandVisible &&
                highlightedShakeBand === contour.band.roman &&
                contour.isEpicentral !== false;
              const isDimmedByOther =
                isBandVisible &&
                highlightedShakeBand !== null &&
                highlightedShakeBand !== contour.band.roman;
              const baseFill = Math.max(0, Math.min(0.85, shakeMapOpacity * 0.7));
              const targetFillOpacity = !isBandVisible
                ? 0
                : isHighlighted
                  ? Math.min(0.85, baseFill + 0.14)
                  : isDimmedByOther
                    ? baseFill * 0.55
                    : baseFill;
              const baseStroke = Math.min(1, 0.35 + shakeMapOpacity * 0.65);
              const targetStrokeOpacity = !isBandVisible
                ? 0
                : isHighlighted
                  ? 1
                  : isDimmedByOther
                    ? baseStroke * 0.55
                    : baseStroke;
              return (
                <g
                  key={`sm-${contour.threshold}-${cIdx}`}
                  style={{
                    opacity: isBandVisible ? 1 : 0,
                    transition: 'opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)',
                    pointerEvents: 'none',
                  }}
                >
                  {/* Subtle outer glow halo for hovered epicentral contour */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={contour.band.fillHex}
                    strokeWidth={8}
                    strokeOpacity={isHighlighted ? 0.55 : 0}
                    filter="url(#shakemap-contour-glow)"
                    style={{ transition: 'stroke-opacity 200ms ease-out' }}
                  />
                  <path
                    d={pathD}
                    fill={contour.band.fillHex}
                    fillOpacity={targetFillOpacity}
                    fillRule="evenodd"
                    stroke={contour.band.strokeHex}
                    strokeWidth={isHighlighted ? 2.4 : 1.35}
                    strokeOpacity={targetStrokeOpacity}
                    style={{
                      transition:
                        'fill-opacity 240ms ease-out, stroke-opacity 240ms ease-out, stroke-width 200ms ease-out',
                    }}
                  />
                </g>
              );
            })}

          {/* ShakeMap Centroid Roman Numeral Labels (rendered above contour fills for crisp legibility) */}
          {shakeMap && (
            <g className="pointer-events-none select-none">
              {shakeMap.contours.map((contour, cIdx) => {
                const [lblLon, lblLat] = contour.labelPoint ?? contour.centroid;
                const [lx, ly] = project(lblLon, lblLat);
                if (lx <= 12 || lx >= width - 16 || ly <= 12 || ly >= height - 10) {
                  return null;
                }
                const isBandVisible =
                  showShakeMap &&
                  (visibleShakeBands ? visibleShakeBands[contour.band.roman] !== false : true) &&
                  shakeMapOpacity > 0;
                const isHighlighted =
                  isBandVisible &&
                  highlightedShakeBand === contour.band.roman &&
                  contour.isEpicentral !== false;
                const isDimmedByOther =
                  isBandVisible &&
                  highlightedShakeBand !== null &&
                  highlightedShakeBand !== contour.band.roman;
                const targetLabelOpacity = !isBandVisible
                  ? 0
                  : isHighlighted
                    ? 1
                    : isDimmedByOther
                      ? 0.38
                      : Math.min(1, 0.55 + shakeMapOpacity * 0.45);
                return (
                  <text
                    key={`sm-lbl-${contour.threshold}-${cIdx}`}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isHighlighted ? 11.5 : 10}
                    fontWeight={700}
                    fill={contour.band.strokeHex}
                    fillOpacity={targetLabelOpacity}
                    stroke="rgba(255, 255, 255, 0.92)"
                    strokeWidth={isHighlighted ? 4 : 3.5}
                    strokeOpacity={targetLabelOpacity}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                    style={{
                      transition:
                        'fill-opacity 240ms ease-out, stroke-opacity 240ms ease-out, font-size 180ms ease-out',
                    }}
                    className="font-mono"
                  >
                    {contour.band.roman}
                  </text>
                );
              })}
            </g>
          )}

          {/* Major plate boundary trenches */}
          {showPlates &&
            FAULT_TRACES.filter((f) => f.kind === 'boundary').map((boundary) => {
              const d = boundary.points
                .map(([lon, lat], idx) => {
                  const [x, y] = project(lon, lat);
                  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <g key={boundary.name}>
                  <path d={d} fill="none" stroke="#4f46e5" strokeWidth={1.85} strokeDasharray="7 3" />
                </g>
              );
            })}

          {/* Active tectonic fault traces */}
          {showFaults &&
            FAULT_TRACES.filter((f) => f.kind === 'fault').map((fault) => {
              const d = fault.points
                .map(([lon, lat], idx) => {
                  const [x, y] = project(lon, lat);
                  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <g key={fault.name}>
                  <path d={d} fill="none" stroke={theme.fault} strokeWidth={1.85} strokeDasharray="5 3" />
                </g>
              );
            })}
        </svg>

        {/* High-DPI Canvas overlay for GIS Active Faults, Potentially Active Faults & Trenches */}
        <canvas
          ref={gisCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Foreground interactive SVG layer (Stations, Volcanoes, Epicenter, Ruler) */}
        <svg
          ref={fgSvgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`absolute inset-0 w-full h-full block select-none z-20 ${
            isDraggingPan
              ? 'cursor-grabbing'
              : rulerActive
                ? 'cursor-cell'
                : anyGisLayerVisible
                  ? 'cursor-pointer'
                  : 'cursor-crosshair'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onClick={handleSvgClick}
          onMouseLeave={() => {
            setCursorCoords(null);
            setHoveredStationId(null);
            setHoveredNetworkStationCode(null);
          }}
        >

          {/* Active volcanoes */}
          {showVolcanoes &&
            ACTIVE_VOLCANOES.map((vol) => {
              const [vx, vy] = project(vol.lon, vol.lat);
              if (vx < -20 || vx > width + 20 || vy < -20 || vy > height + 20) return null;
              const isHovered = hoveredVolcano === vol.name;
              return (
                <g
                  key={vol.name}
                  onMouseEnter={() => setHoveredVolcano(vol.name)}
                  onMouseLeave={() => setHoveredVolcano(null)}
                  className="cursor-default"
                >
                  <polygon
                    points={`${vx},${vy - 6.5} ${vx - 6},${vy + 4.5} ${vx + 6},${vy + 4.5}`}
                    fill="#ea580c"
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  />
                  <circle cx={vx} cy={vy - 6.5} r={1.8} fill="#fdba74" />
                  <text
                    x={vx + 8}
                    y={vy + 3}
                    fontSize={isHovered ? 10 : 9}
                    fontWeight={isHovered ? 700 : 500}
                    fill={isHovered ? theme.volcanoHoverText : theme.volcanoText}
                    className="font-sans select-none"
                  >
                    {vol.name}
                  </text>
                </g>
              );
            })}

          {/* Background Network Coverage Stations (unpicked PHILSTA stations) */}
          {showNetworkCoverage &&
            visibleStations
              .filter((st) => st.status !== 'retired' && !pickedCodeSet.has(st.code))
              .map((st) => {
                const [nx, ny] = project(st.lon, st.lat);
                if (nx < -12 || nx > width + 12 || ny < -12 || ny > height + 12) return null;
                const isVolc = st.networkType === 'volcanic';
                const isStrong = st.networkType === 'strong_motion';
                return (
                  <g
                    key={`bg-st-${st.code}`}
                    opacity={0.78}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredNetworkStationCode(st.code)}
                    onMouseLeave={() =>
                      setHoveredNetworkStationCode((curr) => (curr === st.code ? null : curr))
                    }
                  >
                    {isVolc ? (
                      <polygon
                        points={`${nx},${ny - 3.6} ${nx + 3.6},${ny} ${nx},${ny + 3.6} ${nx - 3.6},${ny}`}
                        fill="#f97316"
                        stroke="#ffffff"
                        strokeWidth={0.8}
                      />
                    ) : isStrong ? (
                      <rect
                        x={nx - 2.6}
                        y={ny - 2.6}
                        width={5.2}
                        height={5.2}
                        fill="#475569"
                        stroke="#ffffff"
                        strokeWidth={0.8}
                      />
                    ) : (
                      <polygon
                        points={`${nx},${ny - 3.5} ${nx - 3.2},${ny + 2.5} ${nx + 3.2},${ny + 2.5}`}
                        fill="#0284c7"
                        stroke="#ffffff"
                        strokeWidth={0.8}
                      />
                    )}
                    {zoomSpan <= 6.5 && (
                      <text
                        x={nx + 4.5}
                        y={ny + 2.5}
                        fontSize={7.5}
                        fill={theme.stationText}
                        fillOpacity={0.78}
                        className="font-mono select-none"
                      >
                        {st.code}
                      </text>
                    )}
                  </g>
                );
              })}

          {/* Station vectors & markers */}
          {showStations &&
            visiblePicks.map((pick) => {
              const [sx, sy] = project(pick.lon, pick.lat);
              const color = getStationColor(pick);
              const isSelected = selectedStation === pick.sta;
              const isHovered = hoveredStationId === pick.id;
              return (
                <g
                  key={pick.id}
                  onMouseEnter={() => setHoveredStationId(pick.id)}
                  onMouseLeave={() =>
                    setHoveredStationId((curr) => (curr === pick.id ? null : curr))
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    onSelectGeologyFeature?.(null);
                    onSelectStation(pick.sta);
                    setClickedStationId(pick.id);
                  }}
                  className="cursor-pointer"
                >
                  {!unlocated && !pick.pExcluded && (
                    <line
                      x1={sx}
                      y1={sy}
                      x2={epiX}
                      y2={epiY}
                      stroke={color}
                      strokeOpacity={isHovered ? 0.6 : 0.25}
                      strokeWidth={isHovered ? 1.6 : 1}
                    />
                  )}
                  <polygon
                    points={
                      isHovered
                        ? `${sx},${sy - 7.5} ${sx - 7},${sy + 5.5} ${sx + 7},${sy + 5.5}`
                        : `${sx},${sy - 6} ${sx - 5.5},${sy + 4.5} ${sx + 5.5},${sy + 4.5}`
                    }
                    fill={color}
                    stroke={isSelected || isHovered ? '#0f172a' : '#ffffff'}
                    strokeWidth={isSelected || isHovered ? 2 : 1.2}
                  />
                  <text
                    x={sx + 8}
                    y={sy + 3}
                    fontSize={10}
                    fontWeight={isSelected || isHovered ? 700 : 600}
                    fill={isSelected || isHovered ? theme.stationSelectedText : theme.stationText}
                    className="font-mono"
                  >
                    {pick.sta}
                  </text>
                </g>
              );
            })}

          {/* Main Office (QVP) reference marker & distance vector */}
          {showMainOffice && (() => {
            const [ox, oy] = project(mainOffice.lon, mainOffice.lat);
            const distInfo = !unlocated
              ? computeDistanceAndBearing(mainOffice.lat, mainOffice.lon, event.lat, event.lon)
              : null;
            const midX = (ox + epiX) / 2;
            const midY = (oy + epiY) / 2;
            return (
              <g className="pointer-events-none select-none">
                {!unlocated && distInfo && (
                  <>
                    <line
                      x1={ox}
                      y1={oy}
                      x2={epiX}
                      y2={epiY}
                      stroke="#059669"
                      strokeWidth={1.6}
                      strokeDasharray="5 4"
                      strokeOpacity={0.85}
                    />
                    {Math.hypot(epiX - ox, epiY - oy) > 42 && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x={-44}
                          y={-9}
                          width={88}
                          height={18}
                          rx={4}
                          fill="rgba(255,255,255,0.92)"
                          stroke="#059669"
                          strokeWidth={0.9}
                        />
                        <text
                          x={0}
                          y={3.5}
                          textAnchor="middle"
                          fontSize={8.5}
                          fontWeight={700}
                          fill="#065f46"
                          className="font-mono"
                        >
                          {`${Math.round(distInfo.distKm)} km ${distInfo.quadrantLabel}`}
                        </text>
                      </g>
                    )}
                  </>
                )}
                <g transform={`translate(${ox}, ${oy})`}>
                  <title>
                    {`${mainOffice.code} Main Office (${mainOffice.name}) · ${mainOffice.lat.toFixed(4)}°N, ${mainOffice.lon.toFixed(4)}°E`}
                  </title>
                  <rect
                    x={-5.5}
                    y={-5.5}
                    width={11}
                    height={11}
                    rx={2}
                    fill="#059669"
                    stroke="#ffffff"
                    strokeWidth={1.4}
                  />
                  <circle cx={0} cy={0} r={2} fill="#ffffff" />
                  <text
                    x={9}
                    y={3.5}
                    fontSize={9.5}
                    fontWeight={700}
                    fill="#065f46"
                    stroke="rgba(255,255,255,0.92)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    className="font-mono"
                  >
                    {mainOffice.code}
                  </text>
                </g>
              </g>
            );
          })()}

          {/* Concentric Range Rings (50 / 100 / 200 km) around epicenter */}
          {showRangeRings && !unlocated && [50, 100, 200].map((radiusKm) => {
            const dLatDeg = radiusKm / 111.32;
            const dLonDeg =
              radiusKm / (111.32 * Math.max(0.25, Math.cos((event.lat * Math.PI) / 180)));
            const rxPx = (dLonDeg / lonSpan) * width;
            const ryPx = (dLatDeg / latSpan) * height;
            return (
              <g key={`ring-${radiusKm}`} className="pointer-events-none select-none">
                <ellipse
                  cx={epiX}
                  cy={epiY}
                  rx={rxPx}
                  ry={ryPx}
                  fill="none"
                  stroke="#0284c7"
                  strokeOpacity={0.55}
                  strokeWidth={1.1}
                  strokeDasharray="4 4"
                />
                <text
                  x={epiX + 4}
                  y={epiY - ryPx + 10}
                  fontSize={8.5}
                  fontWeight={600}
                  fill="#0369a1"
                  stroke="rgba(255,255,255,0.88)"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                  className="font-mono"
                >
                  {radiusKm} km
                </text>
              </g>
            );
          })}

          {/* Nearest City Reference Pins */}
          {showNearestPlaces && nearestCitiesPins.map((city) => {
            const [cx, cy] = project(city.lon, city.lat);
            if (cx < -16 || cx > width + 16 || cy < -16 || cy > height + 16) return null;
            return (
              <g key={`city-pin-${city.name}`} className="pointer-events-none select-none">
                <circle cx={cx} cy={cy} r={3.5} fill="#0f766e" stroke="#ffffff" strokeWidth={1.1} />
                <text
                  x={cx + 6}
                  y={cy + 3}
                  fontSize={8.5}
                  fontWeight={600}
                  fill="#115e59"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                  className="font-sans"
                >
                  {city.name} ({city.distanceKm} km)
                </text>
              </g>
            );
          })}

          {/* Catalog / Aftershock Seismicity Overlay */}
          {showCatalogEvents && catalogEvents
            .filter((ev) => ev.id !== event.id && !isEventUnlocated(ev))
            .map((ev) => {
              const [cx, cy] = project(ev.lon, ev.lat);
              if (cx < -20 || cx > width + 20 || cy < -20 || cy > height + 20) return null;
              const evMeta = ev.magnitudeMetadata;
              const evNonLegacy =
                evMeta &&
                evMeta.preferredMethodId !== 'eqp-legacy-ms' &&
                evMeta.selectedStatus === 'valid' &&
                evMeta.selectedMagnitude !== null;
              const mag = evNonLegacy
                ? evMeta!.selectedMagnitude!
                : ev.preferredScale === 'Ms'
                  ? ev.ms
                  : ev.preferredScale === 'Mb'
                    ? ev.mb
                    : ev.md;
              const magScale = evNonLegacy
                ? evMeta!.selectedScale
                : formatLegacyScaleShort(ev.preferredScale);
              const r = Math.max(4, Math.min(10, 2.5 + mag * 1.1));
              const depthColor =
                ev.depthKm <= 30 ? '#f97316' : ev.depthKm <= 100 ? '#eab308' : '#6366f1';
              return (
                <g
                  key={`cat-ev-${ev.id}`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCatalogEvent?.(ev.id);
                  }}
                >
                  <title>
                    {`${ev.originDateLst} ${ev.originTimeLst} · ${magScale} ${mag.toFixed(1)} · Depth ${ev.depthKm.toFixed(0)} km (click to inspect)`}
                  </title>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={depthColor}
                    fillOpacity={0.78}
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  />
                  <text
                    x={cx + r + 3}
                    y={cy + 3}
                    fontSize={8}
                    fontWeight={600}
                    fill="#334155"
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth={2.5}
                    paintOrder="stroke"
                    className="font-mono"
                  >
                    M{mag.toFixed(1)}
                  </text>
                </g>
              );
            })}

          {/* Animated Epicenter Timeline Migration Path & Epicenters */}
          {showTimelineMigration && timelineEvents.length >= 2 && (() => {
            const pathPts = timelineEvents
              .map((ev) => {
                const [tx, ty] = project(ev.lon, ev.lat);
                return `${tx.toFixed(1)},${ty.toFixed(1)}`;
              })
              .join(' ');
            return (
              <polyline
                points={pathPts}
                fill="none"
                stroke="#0284c7"
                strokeWidth={1.65}
                strokeOpacity={0.72}
                strokeDasharray="5 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none"
              />
            );
          })()}

          {timelineEvents.map((ev) => {
            const [tx, ty] = project(ev.lon, ev.lat);
            if (tx < -24 || tx > width + 24 || ty < -24 || ty > height + 24) return null;
            const isSel = selectedTimelineEventId === ev.id;
            const magText = ev.magnitude !== null ? `${ev.magnitudeScale} ${ev.magnitude.toFixed(1)}` : 'Mag —';
            const depthText = ev.depthKm !== null ? `${ev.depthKm.toFixed(0)} km` : 'Z —';
            return (
              <g
                key={`tl-${ev.id}`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  setClickedStationId(null);
                  setClickedTimelineEvent(ev);
                  onSelectTimelineEvent?.(ev);
                }}
              >
                <title>
                  {`${formatUtcTimelineTimestamp(ev.originTimeMs)} · ${magText} · ${depthText} · ${ev.place}`}
                </title>
                {(ev.isRecentPulse || isSel) && (
                  <circle
                    cx={tx}
                    cy={ty}
                    r={ev.radiusPx + 4.5}
                    fill="none"
                    stroke={isSel ? '#0f172a' : ev.depthColor}
                    strokeWidth={1.5}
                    strokeOpacity={Math.max(0.45, ev.opacity * 0.78)}
                    className="animate-pulse pointer-events-none"
                  />
                )}
                <circle
                  cx={tx}
                  cy={ty}
                  r={isSel ? ev.radiusPx + 1.5 : ev.radiusPx}
                  fill={ev.depthColor}
                  fillOpacity={ev.opacity}
                  stroke={isSel ? '#0f172a' : '#ffffff'}
                  strokeWidth={isSel ? 2 : 1.2}
                />
              </g>
            );
          })}

          {/* Interactive Two-Point Distance Ruler Vector */}
          {rulerPoints.start && (() => {
            const [ax, ay] = project(rulerPoints.start.lon, rulerPoints.start.lat);
            const hasEnd = Boolean(rulerPoints.end);
            const endPt = rulerPoints.end;
            const [bx, by] = endPt ? project(endPt.lon, endPt.lat) : [ax, ay];
            const distInfo = endPt
              ? computeDistanceAndBearing(
                  rulerPoints.start.lat,
                  rulerPoints.start.lon,
                  endPt.lat,
                  endPt.lon
                )
              : null;
            const mx = (ax + bx) / 2;
            const my = (ay + by) / 2;
            return (
              <g className="pointer-events-none select-none">
                {endPt && (
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    stroke="#7c3aed"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                  />
                )}
                <circle cx={ax} cy={ay} r={5.5} fill="#7c3aed" stroke="#ffffff" strokeWidth={1.5} />
                <text
                  x={ax}
                  y={ay - 9}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight={700}
                  fill="#5b21b6"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                  className="font-mono"
                >
                  P1
                </text>
                {hasEnd && endPt && (
                  <>
                    <circle cx={bx} cy={by} r={5.5} fill="#7c3aed" stroke="#ffffff" strokeWidth={1.5} />
                    <text
                      x={bx}
                      y={by - 9}
                      textAnchor="middle"
                      fontSize={8.5}
                      fontWeight={700}
                      fill="#5b21b6"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      paintOrder="stroke"
                      className="font-mono"
                    >
                      P2
                    </text>
                  </>
                )}
                {distInfo && (
                  <g transform={`translate(${mx}, ${my})`}>
                    <rect
                      x={-54}
                      y={-10}
                      width={108}
                      height={18}
                      rx={4}
                      fill="#5b21b6"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={2.5}
                      textAnchor="middle"
                      fontSize={8.5}
                      fontWeight={700}
                      fill="#ffffff"
                      className="font-mono"
                    >
                      {`${distInfo.distKm.toFixed(1)} km · ${distInfo.azimDeg.toFixed(0)}°`}
                    </text>
                  </g>
                )}
              </g>
            );
          })()}

          {/* Epicenter error ellipse & star */}
          {!unlocated && (
            <>
              <ellipse
                cx={epiX}
                cy={epiY}
                rx={16}
                ry={11}
                fill="rgba(220, 38, 38, 0.14)"
                stroke="#dc2626"
                strokeWidth={1}
              />
              <polygon
                points={`${epiX},${epiY - 10} ${epiX + 3},${epiY - 3} ${epiX + 10},${epiY - 3} ${epiX + 4.5},${epiY + 2} ${epiX + 6.5},${epiY + 9} ${epiX},${epiY + 4.5} ${epiX - 6.5},${epiY + 9} ${epiX - 4.5},${epiY + 2} ${epiX - 10},${epiY - 3} ${epiX - 3},${epiY - 3}`}
                fill="#dc2626"
                stroke="#ffffff"
                strokeWidth={1.2}
              />
            </>
          )}
          {/* Multi-model comparison epicenter markers */}
          {comparisonMarkers.map((cm) => {
            const [cx, cy] = project(cm.lon, cm.lat);
            return (
              <g key={`cmp-${cm.modelId}`}>
                <polygon
                  points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
                  fill={cm.color}
                  stroke="#ffffff"
                  strokeWidth={1.3}
                />
                <text
                  x={cx + 9}
                  y={cy + 3}
                  fontSize={9}
                  fontWeight={700}
                  fill="#0f172a"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                >
                  {cm.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Station Hover Card (Whole Name, Lat, Lon, Elev) */}
        {(hoveredStation || hoveredNetworkStation) && (() => {
          const targetLat = hoveredStation
            ? hoveredStation.lat
            : hoveredNetworkStation!.lat;
          const targetLon = hoveredStation
            ? hoveredStation.lon
            : hoveredNetworkStation!.lon;
          const targetCode = hoveredStation
            ? hoveredStation.sta
            : hoveredNetworkStation!.code;
          const meta = hoveredStation
            ? stationMetaByCode[hoveredStation.sta]
            : hoveredNetworkStation!;
          const [sx, sy] = project(targetLon, targetLat);
          if (sx < 0 || sx > width || sy < 0 || sy > height) return null;
          const placeLeft = sx > width * 0.6;
          const placeBelow = sy < height * 0.34;

          return (
            <StationHoverCard
              code={targetCode}
              meta={meta}
              lat={targetLat}
              lon={targetLon}
              style={{
                left: `${(sx / width) * 100}%`,
                top: `${(sy / height) * 100}%`,
              }}
              className={`absolute z-30 ${
                placeLeft ? '-translate-x-[calc(100%+12px)]' : 'translate-x-3'
              } ${placeBelow ? 'translate-y-2' : '-translate-y-[calc(100%+10px)]'}`}
            />
          );
        })()}

        {clickedStationPick && !selectedGeologyFeature && (
          <FloatingStationPopup
            pick={clickedStationPick}
            meta={stationMetaByCode[clickedStationPick.sta]}
            event={event}
            onClose={() => setClickedStationId(null)}
          />
        )}

        {selectedGeologyFeature && (
          <FloatingGeologyPopup
            feature={selectedGeologyFeature}
            onClose={() => onSelectGeologyFeature?.(null)}
          />
        )}

        {clickedTimelineEvent && !clickedStationPick && !selectedGeologyFeature && (
          <div
            role="dialog"
            aria-label="Timeline Epicenter Details"
            className="absolute top-3 right-3 z-30 w-[268px] max-w-[calc(100%-1.5rem)] rounded-lg border border-slate-200 bg-white/95 backdrop-blur-xs shadow-lg p-3 text-xs space-y-1.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-slate-900 leading-snug">
                {clickedTimelineEvent.place}
              </div>
              <button
                type="button"
                onClick={() => setClickedTimelineEvent(null)}
                aria-label="Close timeline event details"
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold px-1"
              >
                ×
              </button>
            </div>
            <div className="font-mono tabular-nums text-[11px] text-slate-700">
              {formatUtcTimelineTimestamp(clickedTimelineEvent.originTimeMs)}
            </div>
            <div className="font-mono tabular-nums text-[11px] text-slate-600">
              {clickedTimelineEvent.lat.toFixed(3)}°N, {clickedTimelineEvent.lon.toFixed(3)}°E · Depth{' '}
              {clickedTimelineEvent.depthKm !== null ? `${clickedTimelineEvent.depthKm.toFixed(1)} km` : '—'}
            </div>
            <div className="font-mono tabular-nums text-[11px] text-slate-700">
              {clickedTimelineEvent.magnitude !== null
                ? `${clickedTimelineEvent.magnitudeScale} ${clickedTimelineEvent.magnitude.toFixed(1)}`
                : 'Mag —'}{' '}
              · {clickedTimelineEvent.sourceLabel}
            </div>
            {clickedTimelineEvent.workspaceEventId && onSelectCatalogEvent && (
              <button
                type="button"
                onClick={() => {
                  onSelectCatalogEvent(clickedTimelineEvent.workspaceEventId!);
                  setClickedTimelineEvent(null);
                }}
                className="mt-1 px-2.5 py-1 rounded bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-700 transition-colors"
              >
                Switch Active Event
              </button>
            )}
          </div>
        )}

        <MapScaleBar
          metersPerPixel={metersPerPixel}
          compact={compact}
          className="absolute bottom-2.5 left-2.5 z-20"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-slate-200 bg-white text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-red-600 rotate-45" />
            Epicenter
          </span>
          {showStations && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 bg-blue-600" />
                Active Station
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 bg-amber-600" />
                Warning (&gt; 0.50s)
              </span>
            </>
          )}
          {showFaults && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 border-t-2 border-dashed border-rose-600" />
              Schematic Faults
            </span>
          )}
          {geologyVisibility?.activeFaults && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-rose-600" />
              GIS Active Faults
            </span>
          )}
          {geologyVisibility?.potentiallyActiveFaults && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-amber-600" />
              Potentially Active Faults
            </span>
          )}
          {geologyVisibility?.trenches && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-[2.5px] border-indigo-800" />
              Trenches / Tectonic (Review Only)
            </span>
          )}
          {showVolcanoes && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 bg-orange-600" />
              Active Volcano
            </span>
          )}
          {showPlates && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2.5 bg-indigo-500/20 border border-dashed border-indigo-600" />
              Plate Boundaries
            </span>
          )}
          {showShakeMap &&
            shakeMap &&
            shakeMap.contours.some(
              (c) => (visibleShakeBands ? visibleShakeBands[c.band.roman] !== false : true),
            ) && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 bg-amber-400/35 border border-orange-600" />
                ShakeMap PEIS (Max {shakeMap.peakRoman})
              </span>
            )}
          {showMainOffice && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-xs bg-emerald-600" />
              {mainOffice.code} Main Office
            </span>
          )}
          {timelineEvents.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 border border-slate-700" />
              Timeline ({timelineEvents.length})
            </span>
          )}
        </div>
        <span className="font-mono text-slate-500">
          {unlocated ? 'ERH Pending' : `ERH ±${event.errKm.toFixed(2)} km`}
        </span>
      </div>
    </div>
  );
};

