import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, Crosshair, Layers, RefreshCw } from 'lucide-react';
import {
  ACTIVE_VOLCANOES,
  DEFAULT_PH_CENTER,
  EQPEvent,
  isEventUnlocated,
  PHILSTA_DATABASE,
  StationMeta,
  StationPick,
} from '../../data/eqpData';
import {
  hitTestGeologyFeatures,
  type ActiveFaultsDataset,
  type GeologyLayerVisibility,
  type SelectedGeologyFeature,
  type TrenchSystemsDataset,
} from '../../utils/geologyLayers';
import {
  computeDistanceAndBearing,
  DEFAULT_MAIN_OFFICE,
  type MainOfficeLocation,
} from '../../utils/nearestPlaces';
import { PeisBandCode, ShakeMapResult } from '../../utils/shakemap';
import { formatLegacyScaleShort } from '../../utils/magnitudeEngine';
import {
  stationPickMatchesRegion,
  type StationRegionFilter,
} from '../../utils/stationRegions';
import {
  type BasemapProviderId,
  getBasemapMeta,
  mapLibreZoomToWebMercatorZoom,
  type MapViewportState,
  OPENFREEMAP_STYLES,
  webMercatorZoomToMapLibreZoom,
} from '../../utils/maps/basemapConfig';
import {
  buildBearingVectorGeoJson,
  buildEpicenterErrorCircleGeoJson,
  buildMainOfficeVectorGeoJson,
  buildRangeRingsGeoJson,
  buildShakeMapLayerGeoJson,
  buildStationRaysGeoJson,
  buildTectonicSchematicGeoJson,
  getStationResidualColorHex,
} from '../../utils/maps/mapOverlays';
import { FloatingGeologyPopup } from '../GeologyFeaturePopup';
import { MapScaleBar, computeWebMercatorMetersPerPixel } from '../MapScaleBar';
import {
  FloatingStationPopup,
  StationHoverCard,
} from '../StationMapPopup';
import {
  buildTimelineMigrationGeoJson,
  formatUtcTimelineTimestamp,
  type VisibleTimelineEvent,
} from '../../utils/epicenterTimeline';
import type { MapSnapshotProvider } from '../../utils/mapSnapshotExport';

if (typeof window !== 'undefined' && maplibreWorkerUrl) {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

interface MapLibreEpicenterMapProps {
  basemapId: BasemapProviderId;
  event: EQPEvent;
  stations?: StationMeta[];
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
  showFaults: boolean;
  showVolcanoes: boolean;
  showPlates: boolean;
  showStations: boolean;
  shakeMap?: ShakeMapResult | null;
  showShakeMap?: boolean;
  shakeMapOpacity?: number;
  visibleShakeBands?: Record<PeisBandCode, boolean>;
  highlightedShakeBand?: PeisBandCode | null;
  compact?: boolean;
  regionFilter?: StationRegionFilter;
  mainOffice?: MainOfficeLocation;
  showMainOffice?: boolean;
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
  geologyVisibility?: GeologyLayerVisibility;
  gisActiveFaultsData?: ActiveFaultsDataset | null;
  gisTrenchData?: TrenchSystemsDataset | null;
  selectedGeologyFeature?: SelectedGeologyFeature | null;
  onSelectGeologyFeature?: (feature: SelectedGeologyFeature | null) => void;
  viewport?: MapViewportState;
  onViewportChange?: (next: MapViewportState) => void;
  onSwitchToVector?: () => void;
  onProviderError?: (message: string) => void;
  timelineEvents?: VisibleTimelineEvent[];
  showTimelineMigration?: boolean;
  selectedTimelineEventId?: string | null;
  onSelectTimelineEvent?: (ev: VisibleTimelineEvent) => void;
  onSnapshotProviderReady?: (provider: MapSnapshotProvider | null) => void;
}

const SRC_PLATES = 'eqp-plates-src';
const SRC_PLATE_BOUNDS = 'eqp-plate-bounds-src';
const SRC_SCHEMATIC_FAULTS = 'eqp-schematic-faults-src';
const SRC_SHAKEMAP = 'eqp-shakemap-src';
const SRC_GIS_TRENCHES = 'eqp-gis-trenches-src';
const SRC_GIS_FAULTS = 'eqp-gis-faults-src';
const SRC_RANGE_RINGS = 'eqp-range-rings-src';
const SRC_ERR_CIRCLE = 'eqp-err-circle-src';
const SRC_STATION_RAYS = 'eqp-station-rays-src';
const SRC_OFFICE_VECTOR = 'eqp-office-vector-src';
const SRC_RULER_LINE = 'eqp-ruler-line-src';
const SRC_TIMELINE_PATH = 'eqp-timeline-path-src';

const LYR_PLATES_FILL = 'eqp-plates-fill';
const LYR_PLATES_LINE = 'eqp-plates-line';
const LYR_PLATE_BOUNDS = 'eqp-plate-bounds-line';
const LYR_SCHEMATIC_FAULTS = 'eqp-schematic-faults-line';
const LYR_SHAKEMAP_FILL = 'eqp-shakemap-fill';
const LYR_SHAKEMAP_LINE = 'eqp-shakemap-line';
const LYR_GIS_TRENCHES = 'eqp-gis-trenches-line';
const LYR_GIS_FAULTS_POTENTIAL = 'eqp-gis-faults-potential-line';
const LYR_GIS_FAULTS_ACTIVE = 'eqp-gis-faults-active-line';
const LYR_RANGE_RINGS = 'eqp-range-rings-line';
const LYR_ERR_FILL = 'eqp-err-circle-fill';
const LYR_ERR_LINE = 'eqp-err-circle-line';
const LYR_STATION_RAYS = 'eqp-station-rays-line';
const LYR_OFFICE_VECTOR = 'eqp-office-vector-line';
const LYR_RULER_LINE = 'eqp-ruler-line';
const LYR_TIMELINE_PATH = 'eqp-timeline-path-line';

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')
    );
  } catch {
    return false;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMetersPerPixel(lat: number, mapLibreZoom: number): number {
  return computeWebMercatorMetersPerPixel(lat, mapLibreZoom + 1);
}

export const MapLibreEpicenterMap: React.FC<MapLibreEpicenterMapProps> = ({
  basemapId,
  event,
  stations = PHILSTA_DATABASE,
  selectedStation,
  onSelectStation,
  showFaults,
  showVolcanoes,
  showPlates,
  showStations,
  shakeMap = null,
  showShakeMap = false,
  shakeMapOpacity = 0.4,
  visibleShakeBands,
  highlightedShakeBand = null,
  compact = false,
  regionFilter = 'ALL',
  mainOffice = DEFAULT_MAIN_OFFICE,
  showMainOffice = true,
  showRangeRings = false,
  showNearestPlaces = false,
  nearestCitiesPins = [],
  showCatalogEvents = false,
  catalogEvents = [],
  onSelectCatalogEvent,
  rulerActive = false,
  rulerPoints = { start: null, end: null },
  onRulerPointClick,
  geologyVisibility,
  gisActiveFaultsData = null,
  gisTrenchData = null,
  selectedGeologyFeature = null,
  onSelectGeologyFeature,
  viewport,
  onViewportChange,
  onSwitchToVector,
  onProviderError,
  timelineEvents = [],
  showTimelineMigration = false,
  selectedTimelineEventId = null,
  onSelectTimelineEvent,
  onSnapshotProviderReady,
}) => {
  const meta = getBasemapMeta(basemapId);
  const styleUrl = meta.styleUrl ?? OPENFREEMAP_STYLES.liberty;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const appliedStyleUrlRef = useRef<string>(styleUrl);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const isProgrammaticMoveRef = useRef(false);
  const tileErrorCountRef = useRef(0);

  const [isLoadingStyle, setIsLoadingStyle] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [hoveredStation, setHoveredStation] = useState<{
    pick: StationPick;
    x: number;
    y: number;
  } | null>(null);
  const [clickedStationId, setClickedStationId] = useState<string | null>(null);

  const unlocated = isEventUnlocated(event);
  const epiLat = unlocated ? DEFAULT_PH_CENTER.lat : event.lat;
  const epiLon = unlocated ? DEFAULT_PH_CENTER.lon : event.lon;

  const [metersPerPixel, setMetersPerPixel] = useState<number>(() => {
    const z = viewport?.zoom ?? (unlocated ? 6 : 7);
    const lat = viewport?.lat ?? epiLat;
    return getMetersPerPixel(lat, webMercatorZoomToMapLibreZoom(z));
  });

  useEffect(() => {
    if (mapRef.current) return;
    const z = viewport?.zoom ?? (unlocated ? 6 : 7);
    const lat = viewport?.lat ?? epiLat;
    setMetersPerPixel(getMetersPerPixel(lat, webMercatorZoomToMapLibreZoom(z)));
  }, [epiLat, unlocated, viewport?.lat, viewport?.zoom]);

  const stationMetaByCode = useMemo(() => {
    const map: Record<string, StationMeta> = {};
    for (const st of stations) {
      map[st.code] = st;
    }
    return map;
  }, [stations]);

  const visiblePicks = useMemo(
    () =>
      event.picks.filter((pick) =>
        stationPickMatchesRegion(pick, regionFilter, stationMetaByCode)
      ),
    [event.picks, regionFilter, stationMetaByCode]
  );

  const clickedStationPick = useMemo(() => {
    if (!showStations || !clickedStationId) return null;
    return visiblePicks.find((p) => p.id === clickedStationId) ?? null;
  }, [showStations, clickedStationId, visiblePicks]);

  const activeMag = useMemo(() => {
    const meta = event.magnitudeMetadata;
    if (
      meta &&
      meta.preferredMethodId !== 'eqp-legacy-ms' &&
      meta.selectedStatus === 'valid' &&
      meta.selectedMagnitude !== null
    ) {
      return meta.selectedMagnitude;
    }
    if (event.preferredScale === 'Ms') return event.ms;
    if (event.preferredScale === 'Mb') return event.mb;
    return event.md;
  }, [event]);

  // Keep latest callbacks/props in refs for imperative MapLibre listeners
  const latestPropsRef = useRef({
    event,
    visiblePicks,
    stations,
    stationMetaByCode,
    selectedStation,
    onSelectStation,
    showFaults,
    showVolcanoes,
    showPlates,
    showStations,
    shakeMap,
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
    mainOffice,
    showMainOffice,
    showRangeRings,
    showNearestPlaces,
    nearestCitiesPins,
    showCatalogEvents,
    catalogEvents,
    onSelectCatalogEvent,
    rulerActive,
    rulerPoints,
    onRulerPointClick,
    geologyVisibility,
    gisActiveFaultsData,
    gisTrenchData,
    onSelectGeologyFeature,
    onViewportChange,
    onProviderError,
    timelineEvents,
    showTimelineMigration,
    selectedTimelineEventId,
    onSelectTimelineEvent,
  });
  latestPropsRef.current = {
    event,
    visiblePicks,
    stations,
    stationMetaByCode,
    selectedStation,
    onSelectStation,
    showFaults,
    showVolcanoes,
    showPlates,
    showStations,
    shakeMap,
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
    mainOffice,
    showMainOffice,
    showRangeRings,
    showNearestPlaces,
    nearestCitiesPins,
    showCatalogEvents,
    catalogEvents,
    onSelectCatalogEvent,
    rulerActive,
    rulerPoints,
    onRulerPointClick,
    geologyVisibility,
    gisActiveFaultsData,
    gisTrenchData,
    onSelectGeologyFeature,
    onViewportChange,
    onProviderError,
    timelineEvents,
    showTimelineMigration,
    selectedTimelineEventId,
    onSelectTimelineEvent,
  };

  const syncGeoJsonSourcesAndLayers = useCallback((map: maplibregl.Map) => {
    if (!styleReadyRef.current) return;
    const p = latestPropsRef.current;

    const ensureSource = (id: string, data: GeoJSON.GeoJSON) => {
      const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        map.addSource(id, { type: 'geojson', data });
      }
    };

    const tectonic = buildTectonicSchematicGeoJson({
      showFaults: p.showFaults,
      showPlates: p.showPlates,
    });
    const shakeGeo = buildShakeMapLayerGeoJson(p.shakeMap ?? null);
    const rangeGeo = p.showRangeRings
      ? buildRangeRingsGeoJson(p.event, [50, 100, 200])
      : { lines: EMPTY_FC, labels: EMPTY_FC };
    const errGeo = buildEpicenterErrorCircleGeoJson(p.event);
    const raysGeo = p.showStations
      ? buildStationRaysGeoJson(p.event, p.visiblePicks)
      : EMPTY_FC;
    const officeGeo = p.showMainOffice
      ? buildMainOfficeVectorGeoJson(p.mainOffice, p.event)
      : EMPTY_FC;
    const rulerGeo =
      p.rulerPoints?.start && p.rulerPoints?.end
        ? buildBearingVectorGeoJson(p.rulerPoints.start, p.rulerPoints.end)
        : EMPTY_FC;

    const gisFaultFeatures =
      p.gisActiveFaultsData &&
      (p.geologyVisibility?.activeFaults || p.geologyVisibility?.potentiallyActiveFaults)
        ? [
            ...(p.geologyVisibility.potentiallyActiveFaults
              ? p.gisActiveFaultsData.potentiallyActiveFaultCollection.features
              : []),
            ...(p.geologyVisibility.activeFaults
              ? p.gisActiveFaultsData.activeFaultCollection.features
              : []),
          ]
        : [];
    const gisTrenchFc =
      p.gisTrenchData && p.geologyVisibility?.trenches
        ? (p.gisTrenchData.featureCollection as unknown as GeoJSON.GeoJSON)
        : (EMPTY_FC as unknown as GeoJSON.GeoJSON);

    ensureSource(SRC_PLATES, tectonic.platePolygons as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_PLATE_BOUNDS, tectonic.plateBoundaries as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_SCHEMATIC_FAULTS, tectonic.schematicFaults as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_SHAKEMAP, shakeGeo.polygons as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_GIS_TRENCHES, gisTrenchFc);
    ensureSource(SRC_GIS_FAULTS, {
      type: 'FeatureCollection',
      features: gisFaultFeatures,
    } as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_RANGE_RINGS, rangeGeo.lines as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_ERR_CIRCLE, errGeo as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_STATION_RAYS, raysGeo as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_OFFICE_VECTOR, officeGeo as unknown as GeoJSON.GeoJSON);
    ensureSource(SRC_RULER_LINE, rulerGeo as unknown as GeoJSON.GeoJSON);

    const timelinePathGeo =
      p.showTimelineMigration && (p.timelineEvents?.length ?? 0) >= 2
        ? buildTimelineMigrationGeoJson(p.timelineEvents ?? [])
        : EMPTY_FC;
    ensureSource(SRC_TIMELINE_PATH, timelinePathGeo as unknown as GeoJSON.GeoJSON);

    // Ensure layers exist in deterministic z-order
    if (!map.getLayer(LYR_PLATES_FILL)) {
      map.addLayer({
        id: LYR_PLATES_FILL,
        type: 'fill',
        source: SRC_PLATES,
        paint: {
          'fill-color': ['coalesce', ['get', 'fillColor'], 'rgba(79,70,229,0.08)'],
          'fill-opacity': 0.5,
        },
      });
    }
    if (!map.getLayer(LYR_PLATES_LINE)) {
      map.addLayer({
        id: LYR_PLATES_LINE,
        type: 'line',
        source: SRC_PLATES,
        paint: {
          'line-color': '#4f46e5',
          'line-width': 1.2,
          'line-opacity': 0.5,
          'line-dasharray': [4, 3],
        },
      });
    }
    if (!map.getLayer(LYR_PLATE_BOUNDS)) {
      map.addLayer({
        id: LYR_PLATE_BOUNDS,
        type: 'line',
        source: SRC_PLATE_BOUNDS,
        paint: {
          'line-color': '#4f46e5',
          'line-width': 2.2,
          'line-opacity': 0.85,
          'line-dasharray': [5, 3],
        },
      });
    }
    if (!map.getLayer(LYR_SHAKEMAP_FILL)) {
      map.addLayer({
        id: LYR_SHAKEMAP_FILL,
        type: 'fill',
        source: SRC_SHAKEMAP,
        paint: {
          'fill-color': ['coalesce', ['get', 'fillHex'], '#fb923c'],
          'fill-opacity': 0,
        },
      });
    }
    if (!map.getLayer(LYR_SHAKEMAP_LINE)) {
      map.addLayer({
        id: LYR_SHAKEMAP_LINE,
        type: 'line',
        source: SRC_SHAKEMAP,
        paint: {
          'line-color': ['coalesce', ['get', 'strokeHex'], '#ea580c'],
          'line-width': 1.5,
          'line-opacity': 0,
        },
      });
    }
    if (!map.getLayer(LYR_SCHEMATIC_FAULTS)) {
      map.addLayer({
        id: LYR_SCHEMATIC_FAULTS,
        type: 'line',
        source: SRC_SCHEMATIC_FAULTS,
        paint: {
          'line-color': '#e11d48',
          'line-width': 2,
          'line-opacity': 0.9,
          'line-dasharray': [4, 2.5],
        },
      });
    }
    if (!map.getLayer(LYR_GIS_TRENCHES)) {
      map.addLayer({
        id: LYR_GIS_TRENCHES,
        type: 'line',
        source: SRC_GIS_TRENCHES,
        paint: {
          'line-color': [
            'match',
            ['get', '__eqp_trench_kind'],
            'trough',
            '#0d9488',
            'transform_fault',
            '#7c3aed',
            '#3730a3',
          ],
          'line-width': 2.6,
          'line-opacity': 0.9,
        },
      });
    }
    if (!map.getLayer(LYR_GIS_FAULTS_POTENTIAL)) {
      map.addLayer({
        id: LYR_GIS_FAULTS_POTENTIAL,
        type: 'line',
        source: SRC_GIS_FAULTS,
        filter: ['==', ['get', 'fault_category'], 'Potentially Active Fault'],
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', '__eqp_uncertain'], false],
            '#f59e0b',
            '#d97706',
          ],
          'line-width': [
            'case',
            ['boolean', ['get', '__eqp_uncertain'], false],
            1.4,
            1.9,
          ],
          'line-opacity': 0.88,
          'line-dasharray': [4, 2.5],
        },
      });
    }
    if (!map.getLayer(LYR_GIS_FAULTS_ACTIVE)) {
      map.addLayer({
        id: LYR_GIS_FAULTS_ACTIVE,
        type: 'line',
        source: SRC_GIS_FAULTS,
        filter: ['==', ['get', 'fault_category'], 'Active Fault'],
        paint: {
          'line-color': [
            'case',
            ['boolean', ['get', '__eqp_uncertain'], false],
            '#f43f5e',
            '#e11d48',
          ],
          'line-width': [
            'case',
            ['boolean', ['get', '__eqp_uncertain'], false],
            1.6,
            2.2,
          ],
          'line-opacity': 0.92,
        },
      });
    }
    if (!map.getLayer(LYR_RANGE_RINGS)) {
      map.addLayer({
        id: LYR_RANGE_RINGS,
        type: 'line',
        source: SRC_RANGE_RINGS,
        paint: {
          'line-color': '#0284c7',
          'line-width': 1.3,
          'line-opacity': 0.6,
          'line-dasharray': [3, 3],
        },
      });
    }
    if (!map.getLayer(LYR_ERR_FILL)) {
      map.addLayer({
        id: LYR_ERR_FILL,
        type: 'fill',
        source: SRC_ERR_CIRCLE,
        paint: {
          'fill-color': '#dc2626',
          'fill-opacity': 0.13,
        },
      });
    }
    if (!map.getLayer(LYR_ERR_LINE)) {
      map.addLayer({
        id: LYR_ERR_LINE,
        type: 'line',
        source: SRC_ERR_CIRCLE,
        paint: {
          'line-color': '#dc2626',
          'line-width': 1.4,
          'line-opacity': 0.78,
        },
      });
    }
    if (!map.getLayer(LYR_STATION_RAYS)) {
      map.addLayer({
        id: LYR_STATION_RAYS,
        type: 'line',
        source: SRC_STATION_RAYS,
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#2563eb'],
          'line-width': 1.35,
          'line-opacity': 0.42,
        },
      });
    }
    if (!map.getLayer(LYR_OFFICE_VECTOR)) {
      map.addLayer({
        id: LYR_OFFICE_VECTOR,
        type: 'line',
        source: SRC_OFFICE_VECTOR,
        paint: {
          'line-color': '#059669',
          'line-width': 1.8,
          'line-opacity': 0.85,
          'line-dasharray': [4, 3],
        },
      });
    }
    if (!map.getLayer(LYR_RULER_LINE)) {
      map.addLayer({
        id: LYR_RULER_LINE,
        type: 'line',
        source: SRC_RULER_LINE,
        paint: {
          'line-color': '#7c3aed',
          'line-width': 2.25,
          'line-opacity': 0.92,
          'line-dasharray': [4, 2.5],
        },
      });
    }
    if (!map.getLayer(LYR_TIMELINE_PATH)) {
      map.addLayer({
        id: LYR_TIMELINE_PATH,
        type: 'line',
        source: SRC_TIMELINE_PATH,
        paint: {
          'line-color': '#0284c7',
          'line-width': 2,
          'line-opacity': 0.72,
          'line-dasharray': [4, 2.5],
        },
      });
    }

    // Update ShakeMap band filters + opacity/highlight paint dynamically
    const activeBandRomans = (
      ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as PeisBandCode[]
    ).filter((b) => (p.visibleShakeBands ? p.visibleShakeBands[b] !== false : true));

    const bandFilter: maplibregl.FilterSpecification =
      p.showShakeMap && p.shakeMapOpacity > 0 && activeBandRomans.length > 0
        ? ['in', ['get', 'bandRoman'], ['literal', activeBandRomans]]
        : ['==', ['get', 'bandRoman'], '__NONE__'];

    map.setFilter(LYR_SHAKEMAP_FILL, bandFilter);
    map.setFilter(LYR_SHAKEMAP_LINE, bandFilter);

    const baseFill = Math.max(0, Math.min(0.85, p.shakeMapOpacity * 0.7));
    const baseStroke =
      p.shakeMapOpacity <= 0 ? 0 : Math.min(1, 0.35 + p.shakeMapOpacity * 0.65);

    if (p.highlightedShakeBand) {
      map.setPaintProperty(LYR_SHAKEMAP_FILL, 'fill-opacity', [
        'case',
        [
          'all',
          ['==', ['get', 'bandRoman'], p.highlightedShakeBand],
          ['boolean', ['get', 'isEpicentral'], true],
        ],
        Math.min(0.85, baseFill + 0.14),
        ['==', ['get', 'bandRoman'], p.highlightedShakeBand],
        baseFill,
        baseFill * 0.55,
      ]);
      map.setPaintProperty(LYR_SHAKEMAP_LINE, 'line-opacity', [
        'case',
        ['==', ['get', 'bandRoman'], p.highlightedShakeBand],
        1,
        baseStroke * 0.55,
      ]);
      map.setPaintProperty(LYR_SHAKEMAP_LINE, 'line-width', [
        'case',
        [
          'all',
          ['==', ['get', 'bandRoman'], p.highlightedShakeBand],
          ['boolean', ['get', 'isEpicentral'], true],
        ],
        2.6,
        1.5,
      ]);
    } else {
      map.setPaintProperty(LYR_SHAKEMAP_FILL, 'fill-opacity', baseFill);
      map.setPaintProperty(LYR_SHAKEMAP_LINE, 'line-opacity', baseStroke);
      map.setPaintProperty(LYR_SHAKEMAP_LINE, 'line-width', 1.5);
    }
  }, []);

  const syncDomMarkers = useCallback((map: maplibregl.Map) => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const p = latestPropsRef.current;
    const ev = p.event;
    const evUnlocated = isEventUnlocated(ev);

    // 1. ShakeMap centroid Roman numeral badges
    if (p.shakeMap && p.showShakeMap && p.shakeMapOpacity > 0) {
      for (const contour of p.shakeMap.contours) {
        const isBandVisible = p.visibleShakeBands
          ? p.visibleShakeBands[contour.band.roman] !== false
          : true;
        if (!isBandVisible) continue;
        const [lblLon, lblLat] = contour.labelPoint ?? contour.centroid;
        if (!Number.isFinite(lblLon) || !Number.isFinite(lblLat)) continue;

        const isHighlighted =
          p.highlightedShakeBand === contour.band.roman &&
          contour.isEpicentral !== false;
        const isDimmed =
          p.highlightedShakeBand !== null &&
          p.highlightedShakeBand !== contour.band.roman;
        const opacity = isHighlighted
          ? 1
          : isDimmed
            ? 0.35
            : Math.min(1, 0.55 + p.shakeMapOpacity * 0.45);

        const el = document.createElement('div');
        el.className =
          'pointer-events-none select-none px-1 py-0.5 rounded-xs bg-white/92 border font-mono text-[10px] leading-none font-bold tracking-tight shadow-xs';
        el.style.opacity = String(opacity);
        el.style.color = contour.band.strokeHex;
        el.style.borderColor = contour.band.strokeHex;
        if (isHighlighted) {
          el.style.transform = 'scale(1.15)';
          el.style.boxShadow = `0 0 8px 2px ${contour.band.fillHex}`;
        }
        el.textContent = contour.band.roman;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lblLon, lblLat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    // 2. Range Ring labels
    if (p.showRangeRings && !evUnlocated) {
      for (const rKm of [50, 100, 200]) {
        const northLat = ev.lat + rKm / 111.32;
        const el = document.createElement('div');
        el.className =
          'pointer-events-none select-none px-1 py-0.5 rounded bg-white/90 border border-sky-300 text-sky-800 font-mono text-[9.5px] font-semibold shadow-2xs';
        el.textContent = `${rKm} km`;
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([ev.lon, northLat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    // 3. Nearest City Reference Pins
    if (p.showNearestPlaces) {
      for (const city of p.nearestCitiesPins) {
        const el = document.createElement('div');
        el.className = 'flex items-center gap-1 pointer-events-none select-none';
        el.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-teal-700 border border-white shadow-xs"></span><span class="px-1 py-0.5 rounded bg-teal-50/95 border border-teal-300 text-teal-950 text-[10px] font-medium whitespace-nowrap shadow-xs">${escapeHtml(city.name)} (${city.distanceKm} km)</span>`;
        const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
          .setLngLat([city.lon, city.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    // 4. Active Volcanoes
    if (p.showVolcanoes) {
      for (const vol of ACTIVE_VOLCANOES) {
        const el = document.createElement('div');
        el.className = 'flex items-center gap-1 cursor-pointer select-none';
        el.title = `${vol.name} (${vol.province})`;
        el.innerHTML = `<span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:11px solid #ea580c;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.35));"></span><span class="px-1 py-0.5 rounded bg-white/92 border border-orange-200 text-orange-900 text-[10px] font-medium whitespace-nowrap shadow-2xs">${escapeHtml(vol.name)}</span>`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          activePopupRef.current?.remove();
          activePopupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true })
            .setLngLat([vol.lon, vol.lat])
            .setHTML(
              `<div class="text-xs text-slate-800 space-y-0.5 pr-3"><div class="font-semibold text-orange-800">${escapeHtml(vol.name)}</div><div class="text-[11px] text-slate-600">${escapeHtml(vol.province)}</div><div class="font-mono text-[11px] text-slate-500">${vol.lat.toFixed(3)}°N, ${vol.lon.toFixed(3)}°E</div></div>`
            )
            .addTo(map);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
          .setLngLat([vol.lon, vol.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    // 5. Catalog / Aftershock Events
    if (p.showCatalogEvents) {
      for (const catEv of p.catalogEvents) {
        if (catEv.id === ev.id || isEventUnlocated(catEv)) continue;
        const mag =
          catEv.preferredScale === 'Ms'
            ? catEv.ms
            : catEv.preferredScale === 'Mb'
              ? catEv.mb
              : catEv.md;
        const bgClass =
          catEv.depthKm <= 30
            ? 'bg-orange-500'
            : catEv.depthKm <= 100
              ? 'bg-yellow-500'
              : 'bg-indigo-500';
        const el = document.createElement('div');
        el.className = 'flex items-center gap-1 cursor-pointer select-none';
        el.innerHTML = `<span class="w-3.5 h-3.5 rounded-full ${bgClass} border-2 border-white shadow-xs"></span><span class="px-1 py-0.5 rounded bg-white/92 border border-slate-300 text-slate-800 font-mono text-[9.5px] font-semibold shadow-xs">M${mag.toFixed(1)}</span>`;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          p.onSelectCatalogEvent?.(catEv.id);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
          .setLngLat([catEv.lon, catEv.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    // 6. Main Office Reference Marker
    if (p.showMainOffice) {
      const distKm = !evUnlocated
        ? Math.round(
            computeDistanceAndBearing(
              p.mainOffice.lat,
              p.mainOffice.lon,
              ev.lat,
              ev.lon
            ).distKm
          )
        : null;
      const el = document.createElement('div');
      el.className = 'flex items-center gap-1 cursor-pointer select-none';
      el.innerHTML = `<span class="w-3.5 h-3.5 rounded-xs bg-emerald-600 border-2 border-white shadow-sm flex items-center justify-center"><span class="w-1 h-1 rounded-full bg-white"></span></span><span class="px-1.5 py-0.5 rounded bg-emerald-950/92 text-emerald-50 border border-emerald-400/60 font-mono text-[10px] font-bold shadow-xs whitespace-nowrap">${escapeHtml(p.mainOffice.code)}${distKm !== null ? ` · ${distKm} km` : ''}</span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        activePopupRef.current?.remove();
        activePopupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true })
          .setLngLat([p.mainOffice.lon, p.mainOffice.lat])
          .setHTML(
            `<div class="text-xs text-slate-800 space-y-0.5 pr-3"><div class="font-semibold text-emerald-900">${escapeHtml(p.mainOffice.code)} Main Office (${escapeHtml(p.mainOffice.name)})</div><div class="font-mono text-[11px] text-slate-600">${p.mainOffice.lat.toFixed(4)}°N, ${p.mainOffice.lon.toFixed(4)}°E</div></div>`
          )
          .addTo(map);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
        .setLngLat([p.mainOffice.lon, p.mainOffice.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    // 7. Two-Point Distance Ruler Pins (P1 & P2)
    if (p.rulerPoints?.start) {
      const startPt = p.rulerPoints.start;
      const el1 = document.createElement('div');
      el1.className = 'flex flex-col items-center pointer-events-none select-none';
      el1.innerHTML = `<span class="px-1 py-0.2 rounded bg-violet-700 text-white font-mono text-[9px] font-bold shadow-xs mb-0.5">P1</span><span class="w-3.5 h-3.5 rounded-full bg-violet-600 border-2 border-white shadow-md"></span>`;
      const m1 = new maplibregl.Marker({ element: el1, anchor: 'center' })
        .setLngLat([startPt.lon, startPt.lat])
        .addTo(map);
      markersRef.current.push(m1);

      if (p.rulerPoints.end) {
        const endPt = p.rulerPoints.end;
        const info = computeDistanceAndBearing(
          startPt.lat,
          startPt.lon,
          endPt.lat,
          endPt.lon
        );
        const el2 = document.createElement('div');
        el2.className = 'flex flex-col items-center pointer-events-none select-none';
        el2.innerHTML = `<span class="w-3.5 h-3.5 rounded-full bg-violet-600 border-2 border-white shadow-md"></span><span class="mt-0.5 px-1.5 py-0.5 rounded bg-violet-900 text-white font-mono text-[10px] font-semibold shadow-xs whitespace-nowrap">P2 · ${info.distKm.toFixed(1)} km · ${info.azimDeg.toFixed(1)}°</span>`;
        const m2 = new maplibregl.Marker({ element: el2, anchor: 'center' })
          .setLngLat([endPt.lon, endPt.lat])
          .addTo(map);
        markersRef.current.push(m2);
      }
    }

    // 8. Seismic Station Markers
    if (p.showStations) {
      for (const pick of p.visiblePicks) {
        const isSelected = p.selectedStation === pick.sta;
        const colorHex = getStationResidualColorHex(pick);
        const el = document.createElement('div');
        el.className = 'flex items-center gap-1 cursor-pointer select-none';
        el.innerHTML = `<span style="background:${colorHex};" class="w-3.5 h-3.5 rounded-xs rotate-45 border ${
          isSelected ? 'border-slate-950 ring-2 ring-blue-300' : 'border-white'
        } shadow-xs inline-block"></span><span class="px-1 py-0.5 rounded text-[10px] font-mono font-semibold shadow-xs ${
          isSelected
            ? 'bg-slate-900 text-white'
            : 'bg-white/95 text-slate-800 border border-slate-300'
        }">${escapeHtml(pick.sta)}</span>`;

        el.addEventListener('mouseenter', () => {
          const pt = map.project([pick.lon, pick.lat]);
          setHoveredStation({ pick, x: pt.x, y: pt.y });
        });
        el.addEventListener('mouseleave', () => {
          setHoveredStation((curr) => (curr?.pick.id === pick.id ? null : curr));
        });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          activePopupRef.current?.remove();
          activePopupRef.current = null;
          p.onSelectGeologyFeature?.(null);
          p.onSelectStation(pick.sta);
          setClickedStationId(pick.id);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
          .setLngLat([pick.lon, pick.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    // 8b. Animated Timeline Epicenters
    if (p.timelineEvents && p.timelineEvents.length > 0) {
      for (const tlEv of p.timelineEvents) {
        const isSel = p.selectedTimelineEventId === tlEv.id;
        const sizePx = Math.round((isSel ? tlEv.radiusPx + 1.5 : tlEv.radiusPx) * 2);
        const wrapper = document.createElement('div');
        wrapper.className = 'relative flex items-center justify-center cursor-pointer select-none';
        wrapper.style.width = `${sizePx + 10}px`;
        wrapper.style.height = `${sizePx + 10}px`;
        const magText =
          tlEv.magnitude !== null
            ? `${tlEv.magnitudeScale} ${tlEv.magnitude.toFixed(1)}`
            : 'Mag —';
        const depthText =
          tlEv.depthKm !== null ? `${tlEv.depthKm.toFixed(0)} km` : 'Z —';
        wrapper.title = `${formatUtcTimelineTimestamp(tlEv.originTimeMs)} · ${magText} · ${depthText} · ${tlEv.place}`;

        if (tlEv.isRecentPulse || isSel) {
          const ring = document.createElement('span');
          ring.className = 'absolute rounded-full pointer-events-none animate-ping';
          ring.style.width = `${sizePx + 6}px`;
          ring.style.height = `${sizePx + 6}px`;
          ring.style.border = `1.5px solid ${isSel ? '#0f172a' : tlEv.depthColor}`;
          ring.style.opacity = String(Math.max(0.35, tlEv.opacity * 0.7));
          wrapper.appendChild(ring);
        }

        const dot = document.createElement('span');
        dot.className = 'relative rounded-full shadow-xs';
        dot.style.width = `${sizePx}px`;
        dot.style.height = `${sizePx}px`;
        dot.style.backgroundColor = tlEv.depthColor;
        dot.style.opacity = String(tlEv.opacity);
        dot.style.border = isSel ? '2px solid #0f172a' : '1.5px solid #ffffff';
        wrapper.appendChild(dot);

        wrapper.addEventListener('click', (e) => {
          e.stopPropagation();
          p.onSelectTimelineEvent?.(tlEv);
          activePopupRef.current?.remove();

          const popupBody = document.createElement('div');
          popupBody.className = 'text-xs text-slate-800 space-y-1 pr-3';
          popupBody.innerHTML = `<div class="font-semibold text-slate-950">${escapeHtml(tlEv.place)}</div><div class="font-mono text-[11px] text-slate-700">${escapeHtml(formatUtcTimelineTimestamp(tlEv.originTimeMs))}</div><div class="font-mono text-[11px] text-slate-600">${tlEv.lat.toFixed(3)}°N, ${tlEv.lon.toFixed(3)}°E · Depth ${escapeHtml(depthText)}</div><div class="font-mono text-[11px] text-slate-700">${escapeHtml(magText)} · ${escapeHtml(tlEv.sourceLabel)}</div>`;

          if (tlEv.workspaceEventId && p.onSelectCatalogEvent) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className =
              'mt-1 px-2 py-1 rounded bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-700';
            btn.textContent = 'Switch Active Event';
            btn.addEventListener('click', () => {
              activePopupRef.current?.remove();
              p.onSelectCatalogEvent?.(tlEv.workspaceEventId!);
            });
            popupBody.appendChild(btn);
          }

          activePopupRef.current = new maplibregl.Popup({ offset: 14, closeButton: true })
            .setLngLat([tlEv.lon, tlEv.lat])
            .setDOMContent(popupBody)
            .addTo(map);
        });

        const marker = new maplibregl.Marker({ element: wrapper, anchor: 'center' })
          .setLngLat([tlEv.lon, tlEv.lat])
          .addTo(map);
        markersRef.current.push(marker);
      }
    }

    // 9. Epicenter Star Marker (always highest prominence)
    if (!evUnlocated) {
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
      const el = document.createElement('div');
      el.className = 'flex flex-col items-center cursor-pointer select-none';
      el.innerHTML = `<div class="w-7 h-7 rounded-full bg-red-600 border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-bold">★</div><span class="mt-0.5 px-1.5 py-0.5 rounded bg-slate-900/92 text-white font-mono text-[10px] font-semibold shadow-xs whitespace-nowrap">${escapeHtml(magScale)} ${mag.toFixed(1)} · ${ev.depthKm.toFixed(1)} km</span>`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        activePopupRef.current?.remove();
        activePopupRef.current = new maplibregl.Popup({ offset: 18, closeButton: true })
          .setLngLat([ev.lon, ev.lat])
          .setHTML(
            `<div class="text-xs text-slate-800 space-y-1 pr-3"><div class="font-semibold text-slate-950">${escapeHtml(ev.filename)}</div><div class="font-mono text-[11px]">${ev.lat.toFixed(3)}°N, ${ev.lon.toFixed(3)}°E · Depth ${ev.depthKm.toFixed(1)} km</div><div class="font-mono text-[11px] text-slate-600">${escapeHtml(magScale)} ${mag.toFixed(1)} · ERH ±${ev.errKm.toFixed(2)} km · RMS ${ev.rmsSec.toFixed(2)}s</div></div>`
          )
          .addTo(map);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([ev.lon, ev.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, []);

  // 1. Initialize MapLibre Map instance once (or on explicit retry)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!isWebGLSupported()) {
      const msg =
        'WebGL is unavailable in this browser environment. Use Vector Schematic (Built-in) instead.';
      setLoadError(msg);
      setIsLoadingStyle(false);
      latestPropsRef.current.onProviderError?.(msg);
      return;
    }

    setLoadError(null);
    setIsLoadingStyle(true);
    styleReadyRef.current = false;
    tileErrorCountRef.current = 0;

    const initLat = viewport?.lat ?? epiLat;
    const initLon = viewport?.lon ?? epiLon;
    const initZoom = webMercatorZoomToMapLibreZoom(
      viewport?.zoom ?? (unlocated ? 6 : 7)
    );

    appliedStyleUrlRef.current = styleUrl;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: styleUrl,
        center: [initLon, initLat],
        zoom: initZoom,
        attributionControl: { compact: true },
        maxZoom: 18,
        minZoom: 1.5,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to initialize MapLibre WebGL renderer.';
      setLoadError(msg);
      setIsLoadingStyle(false);
      latestPropsRef.current.onProviderError?.(msg);
      return;
    }

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    const updateScaleBar = () => {
      const center = map.getCenter();
      setMetersPerPixel(getMetersPerPixel(center.lat, map.getZoom()));
    };

    const handleStyleLoad = () => {
      styleReadyRef.current = true;
      setIsLoadingStyle(false);
      setLoadError(null);
      tileErrorCountRef.current = 0;
      syncGeoJsonSourcesAndLayers(map);
      syncDomMarkers(map);
      updateScaleBar();
    };

    const handleMove = () => {
      updateScaleBar();
      setHoveredStation(null);
    };

    const handleMoveEnd = () => {
      updateScaleBar();
      if (isProgrammaticMoveRef.current) {
        isProgrammaticMoveRef.current = false;
        return;
      }
      const center = map.getCenter();
      latestPropsRef.current.onViewportChange?.({
        lat: Number(center.lat.toFixed(5)),
        lon: Number(center.lng.toFixed(5)),
        zoom: mapLibreZoomToWebMercatorZoom(map.getZoom()),
      });
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      setCursorCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    };

    const handleMouseOut = () => {
      setCursorCoords(null);
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const p = latestPropsRef.current;
      activePopupRef.current?.remove();
      activePopupRef.current = null;
      setClickedStationId(null);

      if (p.rulerActive && p.onRulerPointClick) {
        p.onRulerPointClick({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        return;
      }

      if (
        p.geologyVisibility &&
        (p.geologyVisibility.activeFaults ||
          p.geologyVisibility.potentiallyActiveFaults ||
          p.geologyVisibility.trenches) &&
        p.onSelectGeologyFeature
      ) {
        const bounds = map.getBounds();
        const lonSpan = Math.max(0.1, bounds.getEast() - bounds.getWest());
        const rectW = Math.max(1, container.clientWidth);
        const pixelTolDeg = (12 / rectW) * lonSpan;
        const hit = hitTestGeologyFeatures({
          clickLon: e.lngLat.lng,
          clickLat: e.lngLat.lat,
          maxToleranceDeg: Math.max(0.02, pixelTolDeg),
          visibility: p.geologyVisibility,
          activeFaultsData: p.gisActiveFaultsData ?? null,
          trenchData: p.gisTrenchData ?? null,
        });
        p.onSelectGeologyFeature(hit);
      }
    };

    const handleError = (ev: maplibregl.ErrorEvent) => {
      const rawMessage =
        (ev?.error as Error | undefined)?.message || 'Basemap tile or style error';
      if (!styleReadyRef.current) {
        const msg = `Unable to load ${meta.label} (${rawMessage}). Check internet connectivity or switch to Vector Schematic (Offline).`;
        setLoadError(msg);
        setIsLoadingStyle(false);
        latestPropsRef.current.onProviderError?.(msg);
        return;
      }
      tileErrorCountRef.current += 1;
      if (tileErrorCountRef.current === 4) {
        const msg = `${meta.label} tiles are failing to load (network unreachable or blocked). Event and station data remain intact.`;
        setLoadError(msg);
        latestPropsRef.current.onProviderError?.(msg);
      }
    };

    const handleContextLost = () => {
      const msg = 'WebGL context was lost while rendering the basemap.';
      setLoadError(msg);
      latestPropsRef.current.onProviderError?.(msg);
    };

    map.on('style.load', handleStyleLoad);
    map.on('move', handleMove);
    map.on('moveend', handleMoveEnd);
    map.on('mousemove', handleMouseMove);
    map.on('mouseout', handleMouseOut);
    map.on('click', handleClick);
    map.on('error', handleError);
    map.getCanvas().addEventListener('webglcontextlost', handleContextLost);

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      updateScaleBar();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.off('style.load', handleStyleLoad);
      map.off('move', handleMove);
      map.off('moveend', handleMoveEnd);
      map.off('mousemove', handleMouseMove);
      map.off('mouseout', handleMouseOut);
      map.off('click', handleClick);
      map.off('error', handleError);
      map.getCanvas().removeEventListener('webglcontextlost', handleContextLost);
      activePopupRef.current?.remove();
      activePopupRef.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      styleReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Re-initialize only on explicit retry; style switches reuse the same Map instance below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce]);

  // 2. Switch OpenFreeMap style in place without destroying Map instance / WebGL context
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedStyleUrlRef.current === styleUrl) return;
    appliedStyleUrlRef.current = styleUrl;
    styleReadyRef.current = false;
    tileErrorCountRef.current = 0;
    setIsLoadingStyle(true);
    setLoadError(null);
    map.setStyle(styleUrl);
  }, [styleUrl]);

  const prevEventCoordsRef = useRef<string>(`${event.id}:${epiLat}:${epiLon}`);

  // 3. Recenter map when active event or its solved coordinates change (not on initial mount)
  useEffect(() => {
    const key = `${event.id}:${epiLat}:${epiLon}`;
    if (prevEventCoordsRef.current === key) return;
    prevEventCoordsRef.current = key;
    const map = mapRef.current;
    if (!map) return;
    isProgrammaticMoveRef.current = true;
    map.easeTo({
      center: [epiLon, epiLat],
      duration: 350,
    });
  }, [event.id, epiLat, epiLon]);

  // 4. Sync GeoJSON layers & DOM markers whenever EQP data or overlay toggles change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (styleReadyRef.current) {
      syncGeoJsonSourcesAndLayers(map);
    }
    syncDomMarkers(map);
  }, [
    event,
    visiblePicks,
    selectedStation,
    showFaults,
    showVolcanoes,
    showPlates,
    showStations,
    shakeMap,
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
    mainOffice,
    showMainOffice,
    showRangeRings,
    showNearestPlaces,
    nearestCitiesPins,
    showCatalogEvents,
    catalogEvents,
    rulerPoints,
    geologyVisibility,
    gisActiveFaultsData,
    gisTrenchData,
    timelineEvents,
    showTimelineMigration,
    selectedTimelineEventId,
    syncGeoJsonSourcesAndLayers,
    syncDomMarkers,
  ]);

  useEffect(() => {
    if (!onSnapshotProviderReady) return;
    const provider: MapSnapshotProvider = async () => {
      const map = mapRef.current;
      const container = containerRef.current;
      const p = latestPropsRef.current;
      if (!map || !container) {
        return {
          engine: 'maplibre',
          basemapLabel: meta.label,
          showMainOffice: p.showMainOffice,
        };
      }

      // Ensure a freshly painted WebGL frame is present in the drawing buffer
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        const timer = window.setTimeout(done, 180);
        map.once('render', () => {
          window.clearTimeout(timer);
          done();
        });
        map.triggerRepaint();
      });

      const glCanvas = map.getCanvas();
      let copiedCanvas: HTMLCanvasElement | undefined;
      try {
        const tmp = document.createElement('canvas');
        tmp.width = Math.max(1, glCanvas.width);
        tmp.height = Math.max(1, glCanvas.height);
        const ctx = tmp.getContext('2d');
        if (ctx) {
          ctx.drawImage(glCanvas, 0, 0);
          // Verify non-tainted canvas readback
          tmp.toDataURL('image/png');
          copiedCanvas = tmp;
        }
      } catch {
        copiedCanvas = undefined;
      }

      const center = map.getCenter();
      const mapZoom = map.getZoom();
      const cssW = Math.max(320, container.clientWidth || glCanvas.clientWidth || 800);
      const cssH = Math.max(240, container.clientHeight || glCanvas.clientHeight || 520);

      return {
        engine: 'maplibre',
        canvas: copiedCanvas,
        cssWidth: cssW,
        cssHeight: cssH,
        projectLonLat: (lon, lat) => {
          const pt = map.project([lon, lat]);
          return [pt.x, pt.y];
        },
        viewport: {
          lat: center.lat,
          lon: center.lng,
          zoom: mapLibreZoomToWebMercatorZoom(mapZoom),
        },
        metersPerPixel: getMetersPerPixel(center.lat, mapZoom),
        basemapLabel: meta.label,
        showMainOffice: p.showMainOffice,
      };
    };

    onSnapshotProviderReady(provider);
    return () => onSnapshotProviderReady(null);
  }, [onSnapshotProviderReady, meta.label]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const targetZoom = webMercatorZoomToMapLibreZoom(unlocated ? 6 : 7);
    isProgrammaticMoveRef.current = true;
    map.easeTo({
      center: [epiLon, epiLat],
      zoom: targetZoom,
      duration: 350,
    });
    latestPropsRef.current.onViewportChange?.({
      lat: epiLat,
      lon: epiLon,
      zoom: unlocated ? 6 : 7,
    });
  };

  return (
    <div className="flex flex-col border border-slate-200 bg-white rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2.5 text-xs text-slate-600 flex-wrap">
          <span className="font-semibold text-slate-900">{meta.label}</span>
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

        <div className="flex items-center gap-2">
          {isLoadingStyle && !loadError && (
            <span className="text-[11px] text-slate-500 font-medium">
              Loading tiles…
            </span>
          )}
          <button
            type="button"
            onClick={handleRecenter}
            title="Recenter Map on Active Epicenter"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Recenter
          </button>
        </div>
      </div>

      {loadError && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="leading-snug">{loadError}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-amber-300 bg-white text-amber-900 font-medium hover:bg-amber-100 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
            {onSwitchToVector && (
              <button
                type="button"
                onClick={onSwitchToVector}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
              >
                <Layers className="w-3 h-3" />
                Switch to Vector (Offline)
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className={`relative w-full bg-slate-100 ${
          compact ? 'h-[400px]' : 'h-[520px]'
        }`}
      >
        <div
          ref={containerRef}
          className={`w-full h-full ${rulerActive ? 'cursor-cell' : ''}`}
        />

        {/* Station Hover Card (Whole Name, Lat, Lon, Elev) */}
        {hoveredStation && (() => {
          const pick = hoveredStation.pick;
          const stMeta = stationMetaByCode[pick.sta];
          return (
            <StationHoverCard
              code={pick.sta}
              meta={stMeta}
              lat={pick.lat}
              lon={pick.lon}
              style={{
                left: `${Math.max(12, Math.min(hoveredStation.x + 14, (containerRef.current?.clientWidth ?? 600) - 298))}px`,
                top: `${Math.max(12, Math.min(hoveredStation.y - 12, (containerRef.current?.clientHeight ?? 500) - 130))}px`,
              }}
              className="absolute z-30"
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

        <MapScaleBar
          metersPerPixel={metersPerPixel}
          compact={compact}
          className="absolute bottom-7 left-2.5 z-20"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-slate-200 bg-white text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
            Epicenter &amp; Error Radius ({activeMag.toFixed(1)})
          </span>
          {showStations && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 bg-blue-600 rotate-45" />
              Seismic Stations
            </span>
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
              Active Volcanoes
            </span>
          )}
          {showPlates && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2.5 bg-indigo-500/20 border border-indigo-600" />
              Plate Boundaries
            </span>
          )}
          {showShakeMap &&
            shakeMap &&
            shakeMap.contours.some((c) =>
              visibleShakeBands ? visibleShakeBands[c.band.roman] !== false : true
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
