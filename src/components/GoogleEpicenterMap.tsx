import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Crosshair, Eye, EyeOff, Layers } from 'lucide-react';
import {
  ACTIVE_VOLCANOES,
  DEFAULT_PH_CENTER,
  EQPEvent,
  FAULT_TRACES,
  isEventUnlocated,
  PHILSTA_DATABASE,
  StationMeta,
  StationPick,
  VolcanoLocation,
} from '../data/eqpData';
import { PeisBandCode, ShakeMapResult } from '../utils/shakemap';
import {
  stationPickMatchesRegion,
  type StationRegionFilter,
} from '../utils/stationRegions';
import {
  computeDistanceAndBearing,
  DEFAULT_MAIN_OFFICE,
  type MainOfficeLocation,
} from '../utils/nearestPlaces';
import { MapScaleBar } from './MapScaleBar';
import { formatLegacyScaleShort } from '../utils/magnitudeEngine';
import { GeologyFeatureDetailsContent } from './GeologyFeaturePopup';
import {
  StationDetailsPopupContent,
  StationHoverCard,
} from './StationMapPopup';
import {
  normalizeActiveFaultProperties,
  normalizeTrenchKind,
  getTrenchDisplayName,
  type ActiveFaultsDataset,
  type GeologyLayerVisibility,
  type SelectedGeologyFeature,
  type TrenchSystemsDataset,
} from '../utils/geologyLayers';
import type { MapViewportState } from '../utils/maps/basemapConfig';
import {
  formatUtcTimelineTimestamp,
  type VisibleTimelineEvent,
} from '../utils/epicenterTimeline';
import type { MapSnapshotProvider } from '../utils/mapSnapshotExport';

export type GoogleMapStyleType = 'terrain' | 'satellite' | 'hybrid' | 'roadmap';

interface GoogleEpicenterMapProps {
  apiKey: string;
  event: EQPEvent;
  stations?: StationMeta[];
  selectedStation: string | null;
  onSelectStation: (sta: string | null) => void;
  showFaults: boolean;
  onToggleFaults?: () => void;
  showVolcanoes: boolean;
  showPlates: boolean;
  onTogglePlates?: () => void;
  showStations: boolean;
  shakeMap?: ShakeMapResult | null;
  showShakeMap?: boolean;
  shakeMapOpacity?: number;
  visibleShakeBands?: Record<PeisBandCode, boolean>;
  highlightedShakeBand?: PeisBandCode | null;
  mapTypeId?: GoogleMapStyleType;
  onChangeMapTypeId?: (next: GoogleMapStyleType) => void;
  hideInternalStyleToggle?: boolean;
  minimalToolbar?: boolean;
  isLoadingConfig?: boolean;
  compact?: boolean;
  onFallbackToVector?: () => void;
  regionFilter?: StationRegionFilter;
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

type ActiveInfoTarget =
  | { kind: 'epicenter' }
  | { kind: 'station'; pick: StationPick }
  | { kind: 'volcano'; volcano: VolcanoLocation }
  | { kind: 'mainOffice' }
  | { kind: 'catalogEvent'; catalogEvent: EQPEvent }
  | { kind: 'timelineEvent'; timelineEvent: VisibleTimelineEvent }
  | null;

interface MapOverlayHandle {
  setMap: (map: unknown) => void;
}

interface ShakePolygonEntry {
  polygon: {
    setMap: (map: unknown) => void;
    setOptions: (opts: {
      fillOpacity?: number;
      strokeOpacity?: number;
      strokeWeight?: number;
    }) => void;
  };
  glowPolygon: {
    setMap: (map: unknown) => void;
    setOptions: (opts: { strokeOpacity?: number }) => void;
  };
  bandRoman: PeisBandCode;
  isEpicentral: boolean;
  currentFill: number;
  currentStroke: number;
  currentGlow: number;
}

interface DataFeatureHandle {
  getProperty: (name: string) => unknown;
  forEachProperty: (callback: (value: unknown, name: string) => void) => void;
}

interface DataMouseEventLike {
  latLng?: { lat: () => number; lng: () => number } | null;
  feature: DataFeatureHandle;
}

interface DataLayerHandle {
  addListener: (
    eventName: string,
    handler: (ev: DataMouseEventLike) => void
  ) => { remove: () => void };
  forEach: (callback: (feature: DataFeatureHandle) => void) => void;
  remove: (feature: DataFeatureHandle) => void;
  addGeoJson: (geoJson: object) => DataFeatureHandle[];
  setStyle: (
    styleFn: (feature: DataFeatureHandle) => {
      visible?: boolean;
      clickable?: boolean;
      strokeColor?: string;
      strokeWeight?: number;
      strokeOpacity?: number;
      zIndex?: number;
    }
  ) => void;
  setMap: (map: unknown) => void;
}

type DataLayerConstructor = new (opts: { map: unknown }) => DataLayerHandle;

const GeologyDataLayers: React.FC<{
  geologyVisibility?: GeologyLayerVisibility;
  gisActiveFaultsData: ActiveFaultsDataset | null;
  gisTrenchData: TrenchSystemsDataset | null;
  rulerActive: boolean;
  onSelectGeologyFeature?: (feature: SelectedGeologyFeature | null) => void;
}> = ({
  geologyVisibility,
  gisActiveFaultsData,
  gisTrenchData,
  rulerActive,
  onSelectGeologyFeature,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const faultLayerRef = useRef<DataLayerHandle | null>(null);
  const trenchLayerRef = useRef<DataLayerHandle | null>(null);
  const loadedFaultsRef = useRef<ActiveFaultsDataset | null>(null);
  const loadedTrenchesRef = useRef<TrenchSystemsDataset | null>(null);
  const onSelectRef = useRef(onSelectGeologyFeature);
  onSelectRef.current = onSelectGeologyFeature;

  // Initialize separate google.maps.Data layers once per map instance
  useEffect(() => {
    const winGoogle = (
      window as unknown as {
        google?: { maps?: { Data?: DataLayerConstructor } };
      }
    ).google;
    const DataCtor =
      (mapsLib as unknown as { Data?: DataLayerConstructor } | null)?.Data ??
      winGoogle?.maps?.Data;

    if (!map || !DataCtor) return;

    const trenchLayer = new DataCtor({ map });
    const faultLayer = new DataCtor({ map });
    trenchLayerRef.current = trenchLayer;
    faultLayerRef.current = faultLayer;

    const trenchClickListener = trenchLayer.addListener('click', (ev) => {
      if (!ev.latLng) return;
      const rawProps: Record<string, unknown> = {};
      ev.feature.forEachProperty((val, key) => {
        rawProps[key] = val;
      });
      const props = {
        source_row:
          typeof rawProps.source_row === 'number' ? rawProps.source_row : null,
        name: typeof rawProps.name === 'string' ? rawProps.name : null,
        source_label:
          typeof rawProps.source_label === 'string' ? rawProps.source_label : null,
        feature_kind:
          typeof rawProps.feature_kind === 'string' ? rawProps.feature_kind : null,
      };
      const trenchKind = normalizeTrenchKind(
        props.feature_kind,
        props.name,
        props.source_label
      );
      onSelectRef.current?.({
        kind: 'trench',
        trenchKind,
        displayName: getTrenchDisplayName(props),
        properties: props,
        clickCoords: { lat: ev.latLng.lat(), lon: ev.latLng.lng() },
      });
    });

    const faultClickListener = faultLayer.addListener('click', (ev) => {
      if (!ev.latLng) return;
      const rawProps: Record<string, unknown> = {};
      ev.feature.forEachProperty((val, key) => {
        rawProps[key] = val;
      });
      const props = normalizeActiveFaultProperties(rawProps);
      onSelectRef.current?.({
        kind: 'fault',
        category: props.fault_category ?? 'Active Fault',
        properties: props,
        clickCoords: { lat: ev.latLng.lat(), lon: ev.latLng.lng() },
      });
    });

    return () => {
      trenchClickListener.remove();
      faultClickListener.remove();
      trenchLayer.setMap(null);
      faultLayer.setMap(null);
      trenchLayerRef.current = null;
      faultLayerRef.current = null;
      loadedFaultsRef.current = null;
      loadedTrenchesRef.current = null;
    };
  }, [map, mapsLib]);

  // Populate fault features once when dataset loads
  useEffect(() => {
    const faultLayer = faultLayerRef.current;
    if (!faultLayer || !gisActiveFaultsData) return;
    if (loadedFaultsRef.current === gisActiveFaultsData) return;

    faultLayer.forEach((f) => faultLayer.remove(f));
    faultLayer.addGeoJson(gisActiveFaultsData.activeFaultCollection as unknown as object);
    faultLayer.addGeoJson(
      gisActiveFaultsData.potentiallyActiveFaultCollection as unknown as object
    );
    loadedFaultsRef.current = gisActiveFaultsData;
  }, [gisActiveFaultsData]);

  // Populate trench features once when dataset loads
  useEffect(() => {
    const trenchLayer = trenchLayerRef.current;
    if (!trenchLayer || !gisTrenchData) return;
    if (loadedTrenchesRef.current === gisTrenchData) return;

    trenchLayer.forEach((f) => trenchLayer.remove(f));
    trenchLayer.addGeoJson(gisTrenchData.featureCollection as unknown as object);
    loadedTrenchesRef.current = gisTrenchData;
  }, [gisTrenchData]);

  // Update fault layer visibility & styling instantaneously without re-parsing GeoJSON
  useEffect(() => {
    const faultLayer = faultLayerRef.current;
    if (!faultLayer) return;
    const showActive = Boolean(geologyVisibility?.activeFaults);
    const showPotentially = Boolean(geologyVisibility?.potentiallyActiveFaults);

    faultLayer.setStyle((feature) => {
      const cat = feature.getProperty('fault_category');
      const uncertain = Boolean(feature.getProperty('__eqp_uncertain'));
      if (cat === 'Active Fault') {
        return {
          visible: showActive,
          clickable: !rulerActive && showActive,
          strokeColor: uncertain ? '#f43f5e' : '#e11d48',
          strokeWeight: uncertain ? 1.5 : 2.1,
          strokeOpacity: uncertain ? 0.68 : 0.92,
          zIndex: 7,
        };
      }
      if (cat === 'Potentially Active Fault') {
        return {
          visible: showPotentially,
          clickable: !rulerActive && showPotentially,
          strokeColor: uncertain ? '#f59e0b' : '#d97706',
          strokeWeight: uncertain ? 1.35 : 1.85,
          strokeOpacity: uncertain ? 0.65 : 0.88,
          zIndex: 6,
        };
      }
      return { visible: false };
    });
  }, [
    gisActiveFaultsData,
    geologyVisibility?.activeFaults,
    geologyVisibility?.potentiallyActiveFaults,
    rulerActive,
  ]);

  // Update trench layer visibility & styling
  useEffect(() => {
    const trenchLayer = trenchLayerRef.current;
    if (!trenchLayer) return;
    const showTrenches = Boolean(geologyVisibility?.trenches);

    trenchLayer.setStyle((feature) => {
      const kind = feature.getProperty('__eqp_trench_kind');
      const strokeColor =
        kind === 'trough'
          ? '#0d9488'
          : kind === 'transform_fault'
            ? '#7c3aed'
            : '#3730a3';
      return {
        visible: showTrenches,
        clickable: !rulerActive && showTrenches,
        strokeColor,
        strokeWeight: 2.75,
        strokeOpacity: 0.9,
        zIndex: 5,
      };
    });
  }, [gisTrenchData, geologyVisibility?.trenches, rulerActive]);

  return null;
};

const TectonicVectorOverlays: React.FC<{
  event: EQPEvent;
  visiblePicks: StationPick[];
  showFaults: boolean;
  showPlates: boolean;
  showStations: boolean;
  shakeMap?: ShakeMapResult | null;
  showShakeMap?: boolean;
  shakeMapOpacity?: number;
  visibleShakeBands?: Record<PeisBandCode, boolean>;
  highlightedShakeBand?: PeisBandCode | null;
  mainOffice?: MainOfficeLocation;
  showMainOffice?: boolean;
  showRangeRings?: boolean;
  rulerPoints?: {
    start: { lat: number; lon: number } | null;
    end: { lat: number; lon: number } | null;
  };
  timelineEvents?: VisibleTimelineEvent[];
  showTimelineMigration?: boolean;
}> = ({
  event,
  visiblePicks,
  showFaults,
  showPlates,
  showStations,
  shakeMap = null,
  showShakeMap = false,
  shakeMapOpacity = 0.4,
  visibleShakeBands,
  highlightedShakeBand = null,
  mainOffice = DEFAULT_MAIN_OFFICE,
  showMainOffice = true,
  showRangeRings = false,
  rulerPoints = { start: null, end: null },
  timelineEvents = [],
  showTimelineMigration = false,
}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const shakePolygonsRef = useRef<ShakePolygonEntry[]>([]);
  const latestStateRef = useRef({
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
  });
  latestStateRef.current = {
    showShakeMap,
    shakeMapOpacity,
    visibleShakeBands,
    highlightedShakeBand,
  };

  // Build ShakeMap polygons only when map or contour geometry changes
  useEffect(() => {
    if (!map || !mapsLib || !shakeMap) {
      shakePolygonsRef.current = [];
      return;
    }

    const {
      showShakeMap: initShow,
      shakeMapOpacity: initOpacity,
      visibleShakeBands: initBands,
      highlightedShakeBand: initHighlight,
    } = latestStateRef.current;
    const baseFill = Math.max(0, Math.min(0.85, initOpacity * 0.7));
    const baseStroke = initOpacity <= 0 ? 0 : Math.min(1, 0.35 + initOpacity * 0.65);

    const entries: ShakePolygonEntry[] = shakeMap.contours.map((contour) => {
      const geoPaths = contour.rings.map((ring) =>
        ring.map(([lng, lat]) => ({ lat, lng })),
      );
      const visible =
        initShow &&
        (initBands ? initBands[contour.band.roman] !== false : true) &&
        initOpacity > 0;
      const isEpicentral = contour.isEpicentral !== false;
      const isHi = visible && initHighlight === contour.band.roman && isEpicentral;
      const startFill = visible ? (isHi ? Math.min(0.85, baseFill + 0.14) : baseFill) : 0;
      const startStroke = visible ? (isHi ? 1 : baseStroke) : 0;
      const startGlow = isHi ? 0.45 : 0;

      const glowPolygon = new mapsLib.Polygon({
        paths: geoPaths,
        strokeColor: contour.band.fillHex,
        strokeOpacity: startGlow,
        strokeWeight: 9,
        fillColor: contour.band.fillHex,
        fillOpacity: 0,
        clickable: false,
        zIndex: 4,
        map,
      });

      const polygon = new mapsLib.Polygon({
        paths: geoPaths,
        strokeColor: contour.band.strokeHex,
        strokeOpacity: startStroke,
        strokeWeight: isHi ? 2.4 : 1.5,
        fillColor: contour.band.fillHex,
        fillOpacity: startFill,
        clickable: false,
        zIndex: 5,
        map,
      });
      return {
        polygon,
        glowPolygon,
        bandRoman: contour.band.roman,
        isEpicentral,
        currentFill: startFill,
        currentStroke: startStroke,
        currentGlow: startGlow,
      };
    });

    shakePolygonsRef.current = entries;

    return () => {
      entries.forEach((entry) => {
        entry.polygon.setMap(null);
        entry.glowPolygon.setMap(null);
      });
      shakePolygonsRef.current = [];
    };
  }, [map, mapsLib, shakeMap]);

  // Smoothly tween polygon opacity and glow on band toggle, master toggle, opacity slider, or legend hover
  useEffect(() => {
    const entries = shakePolygonsRef.current;
    if (entries.length === 0) return;

    const baseFill = Math.max(0, Math.min(0.85, shakeMapOpacity * 0.7));
    const baseStroke =
      shakeMapOpacity <= 0 ? 0 : Math.min(1, 0.35 + shakeMapOpacity * 0.65);

    const startState = entries.map((e) => {
      const visible =
        showShakeMap &&
        (visibleShakeBands ? visibleShakeBands[e.bandRoman] !== false : true) &&
        shakeMapOpacity > 0;
      const isHi = visible && highlightedShakeBand === e.bandRoman && e.isEpicentral;
      const isDimmed =
        visible && highlightedShakeBand !== null && highlightedShakeBand !== e.bandRoman;

      const toFill = !visible
        ? 0
        : isHi
          ? Math.min(0.85, baseFill + 0.14)
          : isDimmed
            ? baseFill * 0.55
            : baseFill;
      const toStroke = !visible
        ? 0
        : isHi
          ? 1
          : isDimmed
            ? baseStroke * 0.55
            : baseStroke;
      const toGlow = isHi ? 0.45 : 0;

      e.polygon.setOptions({ strokeWeight: isHi ? 2.4 : 1.5 });

      return {
        entry: e,
        fromFill: e.currentFill,
        fromStroke: e.currentStroke,
        fromGlow: e.currentGlow,
        toFill,
        toStroke,
        toGlow,
      };
    });

    const hasChange = startState.some(
      (s) =>
        Math.abs(s.fromFill - s.toFill) > 0.002 ||
        Math.abs(s.fromStroke - s.toStroke) > 0.002 ||
        Math.abs(s.fromGlow - s.toGlow) > 0.002,
    );
    if (!hasChange) return;

    let rafId = 0;
    const durationMs = 220;
    const startTs = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      for (const s of startState) {
        const nextFill = s.fromFill + (s.toFill - s.fromFill) * eased;
        const nextStroke = s.fromStroke + (s.toStroke - s.fromStroke) * eased;
        const nextGlow = s.fromGlow + (s.toGlow - s.fromGlow) * eased;
        s.entry.currentFill = nextFill;
        s.entry.currentStroke = nextStroke;
        s.entry.currentGlow = nextGlow;
        s.entry.polygon.setOptions({
          fillOpacity: nextFill,
          strokeOpacity: nextStroke,
        });
        s.entry.glowPolygon.setOptions({
          strokeOpacity: nextGlow,
        });
      }
      if (t < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [shakeMap, showShakeMap, visibleShakeBands, shakeMapOpacity, highlightedShakeBand]);

  useEffect(() => {
    if (!map || !mapsLib) return;

    const createdOverlays: MapOverlayHandle[] = [];

    if (showPlates) {
      FAULT_TRACES.filter((f) => f.kind === 'boundary').forEach((boundary) => {
        const trenchLine = new mapsLib.Polyline({
          path: boundary.points.map(([lng, lat]) => ({ lat, lng })),
          strokeColor: '#4f46e5',
          strokeOpacity: 0,
          strokeWeight: 2.25,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.9,
                scale: 2.5,
              },
              offset: '0',
              repeat: '14px',
            },
          ],
          clickable: false,
          zIndex: 6,
          map,
        });
        createdOverlays.push(trenchLine);
      });
    }

    if (showFaults) {
      FAULT_TRACES.filter((f) => f.kind === 'fault').forEach((fault) => {
        const polyline = new mapsLib.Polyline({
          path: fault.points.map(([lng, lat]) => ({ lat, lng })),
          strokeColor: '#e11d48',
          strokeOpacity: 0,
          strokeWeight: 2,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.92,
                scale: 2.5,
              },
              offset: '0',
              repeat: '11px',
            },
          ],
          clickable: false,
          zIndex: 7,
          map,
        });
        createdOverlays.push(polyline);
      });
    }

    const unlocated = isEventUnlocated(event);

    if (showStations && !unlocated) {
      visiblePicks.forEach((pick) => {
        if (pick.pExcluded) return;
        const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
        const rayColor = maxRes >= 1.0 ? '#dc2626' : maxRes > 0.5 ? '#d97706' : '#2563eb';
        const ray = new mapsLib.Polyline({
          path: [
            { lat: pick.lat, lng: pick.lon },
            { lat: event.lat, lng: event.lon },
          ],
          strokeColor: rayColor,
          strokeOpacity: 0.35,
          strokeWeight: 1.25,
          clickable: false,
          map,
        });
        createdOverlays.push(ray);
      });
    }

    if (!unlocated) {
      const errorCircle = new mapsLib.Circle({
        center: { lat: event.lat, lng: event.lon },
        radius: Math.max(1000, event.errKm * 1000),
        strokeColor: '#dc2626',
        strokeOpacity: 0.7,
        strokeWeight: 1.25,
        fillColor: '#dc2626',
        fillOpacity: 0.12,
        clickable: false,
        map,
      });
      createdOverlays.push(errorCircle);
    }

    if (showMainOffice && !unlocated) {
      const officeVector = new mapsLib.Polyline({
        path: [
          { lat: mainOffice.lat, lng: mainOffice.lon },
          { lat: event.lat, lng: event.lon },
        ],
        strokeColor: '#059669',
        strokeOpacity: 0,
        strokeWeight: 2,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 0.85,
              scale: 2.5,
            },
            offset: '0',
            repeat: '12px',
          },
        ],
        clickable: false,
        zIndex: 18,
        map,
      });
      createdOverlays.push(officeVector);
    }

    if (showRangeRings && !unlocated) {
      [50, 100, 200].forEach((radiusKm) => {
        const ring = new mapsLib.Circle({
          center: { lat: event.lat, lng: event.lon },
          radius: radiusKm * 1000,
          strokeColor: '#0284c7',
          strokeOpacity: 0.5,
          strokeWeight: 1.25,
          fillOpacity: 0,
          clickable: false,
          zIndex: 10,
          map,
        });
        createdOverlays.push(ring);
      });
    }

    if (rulerPoints.start && rulerPoints.end) {
      const rulerLine = new mapsLib.Polyline({
        path: [
          { lat: rulerPoints.start.lat, lng: rulerPoints.start.lon },
          { lat: rulerPoints.end.lat, lng: rulerPoints.end.lon },
        ],
        strokeColor: '#7c3aed',
        strokeOpacity: 0,
        strokeWeight: 2.25,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 0.95,
              scale: 2.5,
            },
            offset: '0',
            repeat: '11px',
          },
        ],
        clickable: false,
        zIndex: 25,
        map,
      });
      createdOverlays.push(rulerLine);
    }

    if (showTimelineMigration && timelineEvents.length >= 2) {
      const migrationLine = new mapsLib.Polyline({
        path: timelineEvents.map((ev) => ({ lat: ev.lat, lng: ev.lon })),
        strokeColor: '#0284c7',
        strokeOpacity: 0,
        strokeWeight: 2,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeOpacity: 0.78,
              scale: 2.3,
            },
            offset: '0',
            repeat: '11px',
          },
        ],
        clickable: false,
        zIndex: 14,
        map,
      });
      createdOverlays.push(migrationLine);
    }

    return () => {
      createdOverlays.forEach((item) => item.setMap(null));
    };
  }, [
    map,
    mapsLib,
    event,
    visiblePicks,
    showFaults,
    showPlates,
    showStations,
    mainOffice,
    showMainOffice,
    showRangeRings,
    rulerPoints,
    timelineEvents,
    showTimelineMigration,
  ]);

  return null;
};

const CameraSyncController: React.FC<{
  lat: number;
  lon: number;
  recenterSignal: number;
  mapTypeId: GoogleMapStyleType;
}> = ({ lat, lon, recenterSignal, mapTypeId }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng: lon });
  }, [map, lat, lon, recenterSignal]);

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(mapTypeId);
  }, [map, mapTypeId]);

  return null;
};

const MapScaleObserver: React.FC<{
  onMetersPerPixelChange: (mpp: number) => void;
}> = ({ onMetersPerPixelChange }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const updateScale = () => {
      const zoom = map.getZoom();
      const center = map.getCenter();
      if (typeof zoom !== 'number' || !center) return;
      const lat = center.lat();
      const mpp =
        (156543.03392804097 * Math.max(0.25, Math.cos((lat * Math.PI) / 180))) /
        Math.pow(2, zoom);
      onMetersPerPixelChange(mpp);
    };

    updateScale();
    const zoomListener = map.addListener('zoom_changed', updateScale);
    const centerListener = map.addListener('center_changed', updateScale);
    const idleListener = map.addListener('idle', updateScale);

    return () => {
      zoomListener.remove();
      centerListener.remove();
      idleListener.remove();
    };
  }, [map, onMetersPerPixelChange]);

  return null;
};

const GoogleSnapshotBridge: React.FC<{
  event: EQPEvent;
  mapTypeId: GoogleMapStyleType;
  showMainOffice: boolean;
  metersPerPixel: number;
  viewport?: MapViewportState;
  onSnapshotProviderReady?: (provider: MapSnapshotProvider | null) => void;
}> = ({
  event,
  mapTypeId,
  showMainOffice,
  metersPerPixel,
  viewport,
  onSnapshotProviderReady,
}) => {
  const map = useMap();
  const stateRef = useRef({
    event,
    mapTypeId,
    showMainOffice,
    metersPerPixel,
    viewport,
  });
  stateRef.current = {
    event,
    mapTypeId,
    showMainOffice,
    metersPerPixel,
    viewport,
  };

  useEffect(() => {
    if (!onSnapshotProviderReady) return;
    const provider: MapSnapshotProvider = async () => {
      const st = stateRef.current;
      const unlocated = isEventUnlocated(st.event);
      const fallbackLat = st.viewport?.lat ?? (unlocated ? DEFAULT_PH_CENTER.lat : st.event.lat);
      const fallbackLon = st.viewport?.lon ?? (unlocated ? DEFAULT_PH_CENTER.lon : st.event.lon);
      const fallbackZoom = st.viewport?.zoom ?? (unlocated ? 6 : 7);

      const center = map?.getCenter();
      const zoom = map?.getZoom();
      const lat = center ? center.lat() : fallbackLat;
      const lon = center ? center.lng() : fallbackLon;
      const resolvedZoom = typeof zoom === 'number' ? zoom : fallbackZoom;

      return {
        engine: 'google',
        viewport: { lat, lon, zoom: resolvedZoom },
        metersPerPixel: st.metersPerPixel,
        basemapLabel: 'Google Maps',
        mapStyleMode: st.mapTypeId,
        showMainOffice: st.showMainOffice,
      };
    };
    onSnapshotProviderReady(provider);
    return () => onSnapshotProviderReady(null);
  }, [map, onSnapshotProviderReady]);

  return null;
};

const MapCanvasInner: React.FC<{
  event: EQPEvent;
  stations: StationMeta[];
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
  mapTypeId: GoogleMapStyleType;
  recenterSignal: number;
  compact?: boolean;
  onFallbackToVector?: () => void;
  regionFilter: StationRegionFilter;
  mainOffice: MainOfficeLocation;
  showMainOffice: boolean;
  showRangeRings: boolean;
  showNearestPlaces: boolean;
  nearestCitiesPins: Array<{
    name: string;
    lat: number;
    lon: number;
    distanceKm: number;
    bearing: string;
  }>;
  showCatalogEvents: boolean;
  catalogEvents: EQPEvent[];
  onSelectCatalogEvent?: (eventId: string) => void;
  rulerActive: boolean;
  rulerPoints: {
    start: { lat: number; lon: number } | null;
    end: { lat: number; lon: number } | null;
  };
  onRulerPointClick?: (coords: { lat: number; lon: number }) => void;
  geologyVisibility?: GeologyLayerVisibility;
  gisActiveFaultsData: ActiveFaultsDataset | null;
  gisTrenchData: TrenchSystemsDataset | null;
  selectedGeologyFeature: SelectedGeologyFeature | null;
  onSelectGeologyFeature?: (feature: SelectedGeologyFeature | null) => void;
  viewport?: MapViewportState;
  onViewportChange?: (next: MapViewportState) => void;
  timelineEvents: VisibleTimelineEvent[];
  showTimelineMigration: boolean;
  selectedTimelineEventId: string | null;
  onSelectTimelineEvent?: (ev: VisibleTimelineEvent) => void;
  onSnapshotProviderReady?: (provider: MapSnapshotProvider | null) => void;
}> = ({
  event,
  stations,
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
  mapTypeId,
  recenterSignal,
  compact = false,
  onFallbackToVector,
  regionFilter,
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
  selectedGeologyFeature,
  onSelectGeologyFeature,
  viewport,
  onViewportChange,
  timelineEvents,
  showTimelineMigration,
  selectedTimelineEventId,
  onSelectTimelineEvent,
  onSnapshotProviderReady,
}) => {
  const status = useApiLoadingStatus();
  const [infoTarget, setInfoTarget] = useState<ActiveInfoTarget>(null);
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);
  const [metersPerPixel, setMetersPerPixel] = useState<number>(() => {
    const initUnlocated = isEventUnlocated(event);
    const initLat = initUnlocated ? DEFAULT_PH_CENTER.lat : event.lat;
    const initZoom = initUnlocated ? 6 : 7;
    return (
      (156543.03392804097 * Math.max(0.25, Math.cos((initLat * Math.PI) / 180))) /
      Math.pow(2, initZoom)
    );
  });

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

  useEffect(() => {
    if (
      infoTarget?.kind === 'station' &&
      !visiblePicks.some((p) => p.id === infoTarget.pick.id)
    ) {
      setInfoTarget(null);
    }
    if (hoveredStationId && !visiblePicks.some((p) => p.id === hoveredStationId)) {
      setHoveredStationId(null);
    }
  }, [visiblePicks, infoTarget, hoveredStationId]);

  const formatSignedSec = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}s`;

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      onFallbackToVector?.();
    }
  }, [status, onFallbackToVector]);

  const activeMagInfo = useMemo(() => {
    const meta = event.magnitudeMetadata;
    if (
      meta &&
      meta.preferredMethodId !== 'eqp-legacy-ms' &&
      meta.selectedStatus === 'valid' &&
      meta.selectedMagnitude !== null
    ) {
      return { value: meta.selectedMagnitude, scale: meta.selectedScale };
    }
    const value =
      event.preferredScale === 'Ms'
        ? event.ms
        : event.preferredScale === 'Mb'
          ? event.mb
          : event.md;
    return { value, scale: formatLegacyScaleShort(event.preferredScale) };
  }, [event]);
  const activeMag = activeMagInfo.value;
  const activeMagScale = activeMagInfo.scale;

  if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
    return (
      <div
        className={`${
          compact ? 'h-[400px]' : 'h-[520px]'
        } flex flex-col items-center justify-center bg-slate-50 p-6 text-center space-y-3`}
      >
        <p className="text-sm font-semibold text-slate-900">
          Google Maps JavaScript API could not be initialized
        </p>
        <p className="text-xs text-slate-600 max-w-md">
          Check your Google Maps Platform API key status or switch back to the offline vector schematic view.
        </p>
        {onFallbackToVector && (
          <button
            type="button"
            onClick={onFallbackToVector}
            className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
          >
            Switch to Vector Schematic Map
          </button>
        )}
      </div>
    );
  }

  const unlocated = isEventUnlocated(event);
  const centerLat = unlocated ? DEFAULT_PH_CENTER.lat : event.lat;
  const centerLon = unlocated ? DEFAULT_PH_CENTER.lon : event.lon;
  const initialLat = viewport?.lat ?? centerLat;
  const initialLon = viewport?.lon ?? centerLon;
  const initialZoom = viewport?.zoom ?? (unlocated ? 6 : 7);

  return (
    <div className={`relative w-full ${compact ? 'h-[400px]' : 'h-[520px]'}`}>
      <GoogleMap
        defaultCenter={{ lat: initialLat, lng: initialLon }}
        defaultZoom={initialZoom}
        mapId="DEMO_MAP_ID"
        mapTypeId={mapTypeId}
        gestureHandling="greedy"
        streetViewControl={false}
        fullscreenControl={true}
        mapTypeControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        onCameraChanged={(ev) => {
          const { zoom, center } = ev.detail;
          if (typeof zoom === 'number' && center && typeof center.lat === 'number') {
            const mpp =
              (156543.03392804097 * Math.max(0.25, Math.cos((center.lat * Math.PI) / 180))) /
              Math.pow(2, zoom);
            setMetersPerPixel(mpp);
            if (typeof center.lng === 'number') {
              onViewportChange?.({
                lat: Number(center.lat.toFixed(5)),
                lon: Number(center.lng.toFixed(5)),
                zoom: Number(zoom.toFixed(3)),
              });
            }
          }
        }}
        onClick={(ev) => {
          if (rulerActive && onRulerPointClick && ev.detail.latLng) {
            onRulerPointClick({
              lat: ev.detail.latLng.lat,
              lon: ev.detail.latLng.lng,
            });
            return;
          }
          setInfoTarget(null);
          onSelectGeologyFeature?.(null);
        }}
      >
        <CameraSyncController
          lat={centerLat}
          lon={centerLon}
          recenterSignal={recenterSignal}
          mapTypeId={mapTypeId}
        />
        <MapScaleObserver onMetersPerPixelChange={setMetersPerPixel} />
        <GeologyDataLayers
          geologyVisibility={geologyVisibility}
          gisActiveFaultsData={gisActiveFaultsData}
          gisTrenchData={gisTrenchData}
          rulerActive={rulerActive}
          onSelectGeologyFeature={(feat) => {
            if (feat) setInfoTarget(null);
            onSelectGeologyFeature?.(feat);
          }}
        />
        <TectonicVectorOverlays
          event={event}
          visiblePicks={visiblePicks}
          showFaults={showFaults}
          showPlates={showPlates}
          showStations={showStations}
          shakeMap={shakeMap}
          showShakeMap={showShakeMap}
          shakeMapOpacity={shakeMapOpacity}
          visibleShakeBands={visibleShakeBands}
          highlightedShakeBand={highlightedShakeBand}
          mainOffice={mainOffice}
          showMainOffice={showMainOffice}
          showRangeRings={showRangeRings}
          rulerPoints={rulerPoints}
          timelineEvents={timelineEvents}
          showTimelineMigration={showTimelineMigration}
        />

        {/* ShakeMap Centroid Roman Numeral Labels */}
        {shakeMap?.contours.map((contour, cIdx) => {
          const [lblLon, lblLat] = contour.labelPoint ?? contour.centroid;
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
                ? 0.35
                : Math.min(1, 0.55 + shakeMapOpacity * 0.45);

          return (
            <AdvancedMarker
              key={`gm-sm-lbl-${contour.threshold}-${cIdx}`}
              position={{ lat: lblLat, lng: lblLon }}
              zIndex={isHighlighted ? 22 : 12}
            >
              <div
                style={{
                  opacity: targetLabelOpacity,
                  color: contour.band.strokeHex,
                  borderColor: contour.band.strokeHex,
                  boxShadow: isHighlighted
                    ? `0 0 8px 2px ${contour.band.fillHex}`
                    : '0 1px 2px rgba(15, 23, 42, 0.16)',
                  transition:
                    'opacity 220ms ease-out, transform 200ms ease-out, box-shadow 200ms ease-out',
                }}
                className={`pointer-events-none select-none -translate-x-1/2 -translate-y-1/2 px-1 py-0.5 rounded-xs bg-white/90 border font-mono text-[10px] leading-none font-bold tracking-tight ${
                  isHighlighted ? 'scale-115' : 'scale-100'
                }`}
              >
                {contour.band.roman}
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Nearest City Reference Pins */}
        {showNearestPlaces &&
          nearestCitiesPins.map((city) => (
            <AdvancedMarker
              key={`gm-city-${city.name}`}
              position={{ lat: city.lat, lng: city.lon }}
              title={`${city.name} (${city.distanceKm} km ${city.bearing})`}
              zIndex={24}
            >
              <div className="flex items-center gap-1 pointer-events-none">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-700 border border-white shadow-xs" />
                <span className="px-1 py-0.5 rounded bg-teal-50/95 border border-teal-300 text-teal-950 text-[10px] font-medium whitespace-nowrap shadow-xs">
                  {city.name} ({city.distanceKm} km)
                </span>
              </div>
            </AdvancedMarker>
          ))}

        {/* Catalog / Aftershock Seismicity Markers */}
        {showCatalogEvents &&
          catalogEvents
            .filter((ev) => ev.id !== event.id && !isEventUnlocated(ev))
            .map((ev) => {
              const ceMeta = ev.magnitudeMetadata;
              const ceNonLegacy =
                ceMeta &&
                ceMeta.preferredMethodId !== 'eqp-legacy-ms' &&
                ceMeta.selectedStatus === 'valid' &&
                ceMeta.selectedMagnitude !== null;
              const mag = ceNonLegacy
                ? ceMeta!.selectedMagnitude!
                : ev.preferredScale === 'Ms'
                  ? ev.ms
                  : ev.preferredScale === 'Mb'
                    ? ev.mb
                    : ev.md;
              const magScale = ceNonLegacy
                ? ceMeta!.selectedScale
                : formatLegacyScaleShort(ev.preferredScale);
              const bgClass =
                ev.depthKm <= 30
                  ? 'bg-orange-500'
                  : ev.depthKm <= 100
                    ? 'bg-yellow-500'
                    : 'bg-indigo-500';
              return (
                <AdvancedMarker
                  key={`gm-cat-${ev.id}`}
                  position={{ lat: ev.lat, lng: ev.lon }}
                  title={`${ev.originDateLst} ${ev.originTimeLst} · ${magScale} ${mag.toFixed(1)} · Depth ${ev.depthKm.toFixed(0)} km`}
                  zIndex={26}
                  onClick={() => setInfoTarget({ kind: 'catalogEvent', catalogEvent: ev })}
                >
                  <div className="flex items-center gap-1 cursor-pointer">
                    <span className={`w-3.5 h-3.5 rounded-full ${bgClass} border-2 border-white shadow-xs`} />
                    <span className="px-1 py-0.5 rounded bg-white/90 border border-slate-300 text-slate-800 font-mono text-[9.5px] font-semibold shadow-xs">
                      M{mag.toFixed(1)}
                    </span>
                  </div>
                </AdvancedMarker>
              );
            })}

        {/* Animated Timeline Epicenters */}
        {timelineEvents.map((tlEv) => {
          const isSel = selectedTimelineEventId === tlEv.id;
          const sizePx = Math.round((isSel ? tlEv.radiusPx + 1.5 : tlEv.radiusPx) * 2);
          const magText =
            tlEv.magnitude !== null
              ? `${tlEv.magnitudeScale} ${tlEv.magnitude.toFixed(1)}`
              : 'Mag —';
          const depthText =
            tlEv.depthKm !== null ? `${tlEv.depthKm.toFixed(0)} km` : 'Z —';
          return (
            <AdvancedMarker
              key={`gm-tl-${tlEv.id}`}
              position={{ lat: tlEv.lat, lng: tlEv.lon }}
              title={`${formatUtcTimelineTimestamp(tlEv.originTimeMs)} · ${magText} · ${depthText} · ${tlEv.place}`}
              zIndex={isSel ? 34 : tlEv.isRecentPulse ? 30 : 25}
              onClick={() => {
                onSelectTimelineEvent?.(tlEv);
                setInfoTarget({ kind: 'timelineEvent', timelineEvent: tlEv });
              }}
            >
              <div
                className="relative flex items-center justify-center cursor-pointer"
                style={{ width: `${sizePx + 10}px`, height: `${sizePx + 10}px` }}
              >
                {(tlEv.isRecentPulse || isSel) && (
                  <span
                    className="absolute rounded-full pointer-events-none animate-ping"
                    style={{
                      width: `${sizePx + 6}px`,
                      height: `${sizePx + 6}px`,
                      border: `1.5px solid ${isSel ? '#0f172a' : tlEv.depthColor}`,
                      opacity: Math.max(0.35, tlEv.opacity * 0.7),
                    }}
                  />
                )}
                <span
                  className="relative rounded-full shadow-xs"
                  style={{
                    width: `${sizePx}px`,
                    height: `${sizePx}px`,
                    backgroundColor: tlEv.depthColor,
                    opacity: tlEv.opacity,
                    border: isSel ? '2px solid #0f172a' : '1.5px solid #ffffff',
                  }}
                />
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Two-Point Distance Ruler Pins (P1 & P2) */}
        {rulerPoints.start && (
          <AdvancedMarker
            position={{ lat: rulerPoints.start.lat, lng: rulerPoints.start.lon }}
            zIndex={45}
          >
            <div className="flex flex-col items-center -translate-y-1/2 pointer-events-none">
              <span className="mb-0.5 px-1 py-0.2 rounded bg-violet-700 text-white font-mono text-[9px] font-bold shadow-xs">
                P1
              </span>
              <span className="w-3.5 h-3.5 rounded-full bg-violet-600 border-2 border-white shadow-md" />
            </div>
          </AdvancedMarker>
        )}
        {rulerPoints.start && rulerPoints.end && (() => {
          const distInfo = computeDistanceAndBearing(
            rulerPoints.start.lat,
            rulerPoints.start.lon,
            rulerPoints.end.lat,
            rulerPoints.end.lon
          );
          return (
            <AdvancedMarker
              position={{ lat: rulerPoints.end.lat, lng: rulerPoints.end.lon }}
              zIndex={45}
            >
              <div className="flex flex-col items-center -translate-y-1/2 pointer-events-none">
                <span className="w-3.5 h-3.5 rounded-full bg-violet-600 border-2 border-white shadow-md" />
                <span className="mt-0.5 px-1.5 py-0.5 rounded bg-violet-900 text-white font-mono text-[10px] font-semibold shadow-xs whitespace-nowrap">
                  P2 · {distInfo.distKm.toFixed(1)} km · {distInfo.azimDeg.toFixed(1)}°
                </span>
              </div>
            </AdvancedMarker>
          );
        })()}

        {/* Main Office (QVP) Reference AdvancedMarker */}
        {showMainOffice && (
          <AdvancedMarker
            position={{ lat: mainOffice.lat, lng: mainOffice.lon }}
            title={`${mainOffice.code} Main Office (${mainOffice.name})`}
            zIndex={32}
            onClick={() => setInfoTarget({ kind: 'mainOffice' })}
          >
            <div className="flex items-center gap-1 cursor-pointer">
              <span className="w-3.5 h-3.5 rounded-xs bg-emerald-600 border-2 border-white shadow-sm flex items-center justify-center">
                <span className="w-1 h-1 rounded-full bg-white" />
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-50 border border-emerald-400/60 font-mono text-[10px] font-bold shadow-xs whitespace-nowrap">
                {mainOffice.code}
                {!unlocated
                  ? ` · ${Math.round(
                      computeDistanceAndBearing(
                        mainOffice.lat,
                        mainOffice.lon,
                        event.lat,
                        event.lon
                      ).distKm
                    )} km`
                  : ''}
              </span>
            </div>
          </AdvancedMarker>
        )}

        {/* Epicenter AdvancedMarker */}
        {!unlocated && (
          <AdvancedMarker
            position={{ lat: event.lat, lng: event.lon }}
            title={`Epicenter ${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E`}
            zIndex={40}
            onClick={() => setInfoTarget({ kind: 'epicenter' })}
          >
            <div className="flex flex-col items-center -translate-y-1/2 cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-red-600 border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-bold">
                ★
              </div>
              <span className="mt-0.5 px-1.5 py-0.5 rounded bg-slate-900/90 text-white font-mono text-[10px] font-semibold shadow-xs whitespace-nowrap">
                {activeMagScale} {activeMag.toFixed(1)} · {event.depthKm.toFixed(1)} km
              </span>
            </div>
          </AdvancedMarker>
        )}

        {/* Station AdvancedMarkers */}
        {showStations &&
          visiblePicks.map((pick) => {
            const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
            const isSelected = selectedStation === pick.sta;
            const isHovered = hoveredStationId === pick.id;
            const meta = stationMetaByCode[pick.sta];
            const showHoverCard =
              isHovered && !(infoTarget?.kind === 'station' && infoTarget.pick.id === pick.id);
            const bgClass = pick.pExcluded
              ? 'bg-slate-400'
              : maxRes >= 1.0
                ? 'bg-red-600'
                : maxRes > 0.5
                  ? 'bg-amber-600'
                  : 'bg-blue-600';
            return (
              <AdvancedMarker
                key={pick.id}
                position={{ lat: pick.lat, lng: pick.lon }}
                zIndex={isHovered ? 60 : isSelected ? 35 : 20}
                onClick={() => {
                  onSelectStation(pick.sta);
                  onSelectGeologyFeature?.(null);
                  setInfoTarget({ kind: 'station', pick });
                }}
              >
                <div
                  className="relative flex items-center gap-1 cursor-pointer"
                  onMouseEnter={() => setHoveredStationId(pick.id)}
                  onMouseLeave={() =>
                    setHoveredStationId((curr) => (curr === pick.id ? null : curr))
                  }
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-xs rotate-45 border ${
                      isSelected || isHovered ? 'border-slate-950 ring-2 ring-blue-300' : 'border-white'
                    } ${bgClass} shadow-xs`}
                  />
                  <span
                    className={`px-1 py-0.5 rounded text-[10px] font-mono font-semibold shadow-xs ${
                      isSelected || isHovered
                        ? 'bg-slate-900 text-white'
                        : 'bg-white/95 text-slate-800 border border-slate-300'
                    }`}
                  >
                    {pick.sta}
                  </span>

                  {showHoverCard && (
                    <StationHoverCard
                      code={pick.sta}
                      meta={meta}
                      lat={pick.lat}
                      lon={pick.lon}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50"
                    />
                  )}
                </div>
              </AdvancedMarker>
            );
          })}

        {/* Active Volcano AdvancedMarkers */}
        {showVolcanoes &&
          ACTIVE_VOLCANOES.map((vol) => (
            <AdvancedMarker
              key={vol.name}
              position={{ lat: vol.lat, lng: vol.lon }}
              title={`${vol.name} (${vol.province})`}
              zIndex={15}
              onClick={() => setInfoTarget({ kind: 'volcano', volcano: vol })}
            >
              <div className="flex items-center gap-1 cursor-pointer">
                <span className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[11px] border-b-orange-600 drop-shadow-xs" />
                <span className="px-1 py-0.5 rounded bg-orange-50/95 border border-orange-300 text-orange-900 text-[10px] font-medium whitespace-nowrap shadow-xs">
                  {vol.name}
                </span>
              </div>
            </AdvancedMarker>
          ))}

        {/* Anchored InfoWindow */}
        {infoTarget?.kind === 'epicenter' && (
          <InfoWindow
            position={{ lat: event.lat, lng: event.lon }}
            onCloseClick={() => setInfoTarget(null)}
          >
            <div className="p-1 text-xs space-y-1 font-sans min-w-[200px]">
              <div className="font-semibold text-slate-900">
                Earthquake Epicenter · Bulletin #{event.bulletinNo}
              </div>
              <div className="font-mono text-slate-700 tabular-nums">
                {event.lat.toFixed(3)}°N, {event.lon.toFixed(3)}°E · Depth {event.depthKm.toFixed(1)} km
              </div>
              <div className="font-mono text-slate-600 tabular-nums">
                {activeMagScale} {activeMag.toFixed(1)} · RMS {event.rmsSec.toFixed(2)}s · ERH ±{event.errKm.toFixed(2)} km
              </div>
              <div className="text-[11px] text-slate-500">
                Origin GMT: {event.originDateGmt} {event.originTimeGmt}
              </div>
            </div>
          </InfoWindow>
        )}

        {infoTarget?.kind === 'station' && (() => {
          const livePick =
            visiblePicks.find((p) => p.id === infoTarget.pick.id) ?? infoTarget.pick;
          const meta = stationMetaByCode[livePick.sta];
          return (
            <InfoWindow
              position={{ lat: livePick.lat, lng: livePick.lon }}
              onCloseClick={() => setInfoTarget(null)}
            >
              <div className="p-0.5 max-h-[340px] overflow-y-auto">
                <StationDetailsPopupContent
                  pick={livePick}
                  meta={meta}
                  event={event}
                />
              </div>
            </InfoWindow>
          );
        })()}

        {infoTarget?.kind === 'volcano' && (
          <InfoWindow
            position={{ lat: infoTarget.volcano.lat, lng: infoTarget.volcano.lon }}
            onCloseClick={() => setInfoTarget(null)}
          >
            <div className="p-1 text-xs space-y-1 font-sans min-w-[175px]">
              <div className="font-semibold text-orange-900">{infoTarget.volcano.name} Volcano</div>
              <div className="text-slate-700">{infoTarget.volcano.province}</div>
              <div className="font-mono text-slate-600 tabular-nums">
                {infoTarget.volcano.lat.toFixed(3)}°N, {infoTarget.volcano.lon.toFixed(3)}°E
              </div>
            </div>
          </InfoWindow>
        )}

        {infoTarget?.kind === 'mainOffice' && (() => {
          const info = !unlocated
            ? computeDistanceAndBearing(mainOffice.lat, mainOffice.lon, event.lat, event.lon)
            : null;
          return (
            <InfoWindow
              position={{ lat: mainOffice.lat, lng: mainOffice.lon }}
              onCloseClick={() => setInfoTarget(null)}
            >
              <div className="p-1 text-xs space-y-1 font-sans min-w-[205px]">
                <div className="font-semibold text-emerald-900">
                  {mainOffice.code} Main Office ({mainOffice.name})
                </div>
                <div className="font-mono text-slate-700 tabular-nums">
                  {mainOffice.lat.toFixed(4)}°N, {mainOffice.lon.toFixed(4)}°E
                </div>
                <div className="font-mono text-emerald-800 font-semibold tabular-nums">
                  {info
                    ? `${String(Math.round(info.distKm)).padStart(3, '0')} km ${info.quadrantLabel} (${info.distKm.toFixed(1)} km)`
                    : 'Pending event location'}
                </div>
              </div>
            </InfoWindow>
          );
        })()}

        {infoTarget?.kind === 'catalogEvent' && (() => {
          const ce = infoTarget.catalogEvent;
          const ceMeta = ce.magnitudeMetadata;
          const ceNonLegacy =
            ceMeta &&
            ceMeta.preferredMethodId !== 'eqp-legacy-ms' &&
            ceMeta.selectedStatus === 'valid' &&
            ceMeta.selectedMagnitude !== null;
          const mag = ceNonLegacy
            ? ceMeta!.selectedMagnitude!
            : ce.preferredScale === 'Ms'
              ? ce.ms
              : ce.preferredScale === 'Mb'
                ? ce.mb
                : ce.md;
          const magScale = ceNonLegacy
            ? ceMeta!.selectedScale
            : formatLegacyScaleShort(ce.preferredScale);
          return (
            <InfoWindow
              position={{ lat: ce.lat, lng: ce.lon }}
              onCloseClick={() => setInfoTarget(null)}
            >
              <div className="p-1 text-xs space-y-1 font-sans min-w-[205px]">
                <div className="font-semibold text-slate-900">
                  Catalog Event · {ce.originDateLst} {ce.originTimeLst}
                </div>
                <div className="font-mono text-slate-700 tabular-nums">
                  {ce.lat.toFixed(3)}°N, {ce.lon.toFixed(3)}°E · Depth {ce.depthKm.toFixed(1)} km
                </div>
                <div className="font-mono text-slate-700 tabular-nums">
                  {magScale} {mag.toFixed(1)} · B{ce.bulletinNo}
                </div>
                {onSelectCatalogEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      setInfoTarget(null);
                      onSelectCatalogEvent(ce.id);
                    }}
                    className="mt-1 px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700"
                  >
                    Switch Active Event
                  </button>
                )}
              </div>
            </InfoWindow>
          );
        })()}

        {infoTarget?.kind === 'timelineEvent' && (() => {
          const tl = infoTarget.timelineEvent;
          const magText =
            tl.magnitude !== null ? `${tl.magnitudeScale} ${tl.magnitude.toFixed(1)}` : 'Mag —';
          const depthText = tl.depthKm !== null ? `${tl.depthKm.toFixed(1)} km` : '—';
          return (
            <InfoWindow
              position={{ lat: tl.lat, lng: tl.lon }}
              onCloseClick={() => setInfoTarget(null)}
            >
              <div className="p-1 text-xs space-y-1 font-sans min-w-[215px]">
                <div className="font-semibold text-slate-900">{tl.place}</div>
                <div className="font-mono text-slate-700 tabular-nums">
                  {formatUtcTimelineTimestamp(tl.originTimeMs)}
                </div>
                <div className="font-mono text-slate-600 tabular-nums">
                  {tl.lat.toFixed(3)}°N, {tl.lon.toFixed(3)}°E · Depth {depthText}
                </div>
                <div className="font-mono text-slate-700 tabular-nums">
                  {magText} · {tl.sourceLabel}
                </div>
                {tl.workspaceEventId && onSelectCatalogEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      setInfoTarget(null);
                      onSelectCatalogEvent(tl.workspaceEventId!);
                    }}
                    className="mt-1 px-2 py-1 rounded bg-sky-600 text-white text-[11px] font-medium hover:bg-sky-700"
                  >
                    Switch Active Event
                  </button>
                )}
              </div>
            </InfoWindow>
          );
        })()}
        {selectedGeologyFeature && !infoTarget && (
          <InfoWindow
            position={{
              lat: selectedGeologyFeature.clickCoords.lat,
              lng: selectedGeologyFeature.clickCoords.lon,
            }}
            onCloseClick={() => onSelectGeologyFeature?.(null)}
          >
            <div className="p-0.5">
              <GeologyFeatureDetailsContent feature={selectedGeologyFeature} />
            </div>
          </InfoWindow>
        )}
        <GoogleSnapshotBridge
          event={event}
          mapTypeId={mapTypeId}
          showMainOffice={showMainOffice}
          metersPerPixel={metersPerPixel}
          viewport={viewport}
          onSnapshotProviderReady={onSnapshotProviderReady}
        />
      </GoogleMap>
      <MapScaleBar
        metersPerPixel={metersPerPixel}
        compact={compact}
        className="absolute bottom-8 left-2.5 z-20"
      />
    </div>
  );
};

export const GoogleEpicenterMap: React.FC<GoogleEpicenterMapProps> = ({
  apiKey,
  event,
  stations = PHILSTA_DATABASE,
  selectedStation,
  onSelectStation,
  showFaults,
  onToggleFaults,
  showVolcanoes,
  showPlates,
  onTogglePlates,
  showStations,
  shakeMap = null,
  showShakeMap = false,
  shakeMapOpacity = 0.4,
  visibleShakeBands,
  highlightedShakeBand = null,
  mapTypeId: controlledMapTypeId,
  onChangeMapTypeId,
  hideInternalStyleToggle = false,
  minimalToolbar = false,
  isLoadingConfig = false,
  compact = false,
  onFallbackToVector,
  regionFilter = 'ALL',
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
  const [internalMapTypeId, setInternalMapTypeId] = useState<GoogleMapStyleType>('terrain');
  const mapTypeId = controlledMapTypeId ?? internalMapTypeId;
  const setMapTypeId = onChangeMapTypeId ?? setInternalMapTypeId;
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [showMainOffice, setShowMainOffice] = useState(true);

  useEffect(() => {
    if (!apiKey && !isLoadingConfig && onFallbackToVector) {
      onFallbackToVector();
    }
  }, [apiKey, isLoadingConfig, onFallbackToVector]);

  if (!apiKey && isLoadingConfig) {
    return (
      <div
        className={`border border-slate-200 bg-slate-50 rounded-lg flex flex-col items-center justify-center p-6 text-center space-y-2 ${
          compact ? 'h-[400px]' : 'h-[520px]'
        }`}
      >
        <div className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-blue-600 animate-spin" />
        <p className="text-xs font-medium text-slate-600">
          Connecting to Google Maps Platform...
        </p>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="border border-slate-200 bg-white rounded-lg p-6 text-center space-y-2">
        <p className="text-sm font-semibold text-slate-900">Google Maps API Key Not Found</p>
        <p className="text-xs text-slate-500">
          Ensure VITE_GOOGLE_MAPS_API_KEY is configured, or switch to the Vector Schematic map.
        </p>
        {onFallbackToVector && (
          <button
            type="button"
            onClick={onFallbackToVector}
            className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
          >
            Open Vector Schematic Map
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col border border-slate-200 bg-white rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Google Maps Seismotectonic View</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {isEventUnlocated(event)
              ? 'Epicenter Pending'
              : `${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!compact && (onToggleFaults || onTogglePlates) && (
            <div className="inline-flex items-center gap-1.5">
              {!minimalToolbar && onToggleFaults && (
                <button
                  type="button"
                  onClick={onToggleFaults}
                  aria-pressed={showFaults}
                  title={showFaults ? 'Disable Active Faults Layer' : 'Enable Active Faults Layer'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                    showFaults
                      ? 'bg-white text-slate-900 border-slate-300'
                      : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                  }`}
                >
                  {showFaults ? (
                    <Eye className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  Active Faults
                </button>
              )}
              {!minimalToolbar && onTogglePlates && (
                <button
                  type="button"
                  onClick={onTogglePlates}
                  aria-pressed={showPlates}
                  title={showPlates ? 'Disable Plate Boundaries Layer' : 'Enable Plate Boundaries Layer'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                    showPlates
                      ? 'bg-white text-slate-900 border-slate-300'
                      : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                  }`}
                >
                  {showPlates ? (
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                  Plate Boundaries
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMainOffice((v) => !v)}
                aria-pressed={showMainOffice}
                title={
                  showMainOffice
                    ? `Hide ${mainOffice.code} Main Office Reference Marker`
                    : `Show ${mainOffice.code} Main Office Reference Marker`
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 ${
                  showMainOffice
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700'
                }`}
              >
                {showMainOffice ? (
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                {mainOffice.code} Ref
              </button>
            </div>
          )}
          {!hideInternalStyleToggle && (
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-md text-xs">
              <Layers className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
              {(['terrain', 'satellite', 'hybrid', 'roadmap'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMapTypeId(type)}
                  title={`Switch Map Style to ${type.charAt(0).toUpperCase() + type.slice(1)}`}
                  className={`px-2 py-0.5 rounded capitalize font-medium transition-colors ${
                    mapTypeId === type
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setRecenterSignal((s) => s + 1)}
            title="Recenter Map on Active Epicenter"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Recenter
          </button>
        </div>
      </div>

      <APIProvider
        key={apiKey}
        apiKey={apiKey}
        libraries={['marker', 'maps']}
        language="en"
        region="PH"
      >
        <MapCanvasInner
          event={event}
          stations={stations}
          selectedStation={selectedStation}
          onSelectStation={onSelectStation}
          showFaults={showFaults}
          showVolcanoes={showVolcanoes}
          showPlates={showPlates}
          showStations={showStations}
          shakeMap={shakeMap}
          showShakeMap={showShakeMap}
          shakeMapOpacity={shakeMapOpacity}
          visibleShakeBands={visibleShakeBands}
          highlightedShakeBand={highlightedShakeBand}
          mapTypeId={mapTypeId}
          recenterSignal={recenterSignal}
          compact={compact}
          onFallbackToVector={onFallbackToVector}
          regionFilter={regionFilter}
          mainOffice={mainOffice}
          showMainOffice={showMainOffice}
          showRangeRings={showRangeRings}
          showNearestPlaces={showNearestPlaces}
          nearestCitiesPins={nearestCitiesPins}
          showCatalogEvents={showCatalogEvents}
          catalogEvents={catalogEvents}
          onSelectCatalogEvent={onSelectCatalogEvent}
          rulerActive={rulerActive}
          rulerPoints={rulerPoints}
          onRulerPointClick={onRulerPointClick}
          geologyVisibility={geologyVisibility}
          gisActiveFaultsData={gisActiveFaultsData}
          gisTrenchData={gisTrenchData}
          selectedGeologyFeature={selectedGeologyFeature}
          onSelectGeologyFeature={onSelectGeologyFeature}
          viewport={viewport}
          onViewportChange={onViewportChange}
          timelineEvents={timelineEvents}
          showTimelineMigration={showTimelineMigration}
          selectedTimelineEventId={selectedTimelineEventId}
          onSelectTimelineEvent={onSelectTimelineEvent}
          onSnapshotProviderReady={onSnapshotProviderReady}
        />
      </APIProvider>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-slate-200 bg-white text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" />
            Epicenter &amp; Error Radius
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
          {isEventUnlocated(event) ? 'ERH Pending' : `ERH ±${event.errKm.toFixed(2)} km`}
        </span>
      </div>
    </div>
  );
};
