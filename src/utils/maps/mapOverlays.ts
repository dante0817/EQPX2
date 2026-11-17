import {
  EQPEvent,
  FAULT_TRACES,
  isEventUnlocated,
  StationPick,
  TECTONIC_PLATES,
} from '../../data/eqpData';
import {
  computeDistanceAndBearing,
  type MainOfficeLocation,
} from '../nearestPlaces';
import type { PeisBandCode, ShakeMapResult } from '../shakemap';

export interface GeoJsonPointFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

export interface GeoJsonLineFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  };
}

export interface GeoJsonPolygonFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Polygon';
    coordinates: Array<Array<[number, number]>>;
  };
}

export interface GeoJsonMultiPolygonFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'MultiPolygon';
    coordinates: Array<Array<Array<[number, number]>>>;
  };
}

export interface SimpleGeoJsonCollection<T = unknown> {
  type: 'FeatureCollection';
  features: T[];
}

export function getStationResidualColorHex(pick: StationPick): string {
  if (pick.pExcluded) return '#94a3b8';
  const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
  if (maxRes >= 1.0) return '#dc2626';
  if (maxRes > 0.5) return '#d97706';
  return '#2563eb';
}

/**
 * Generates a closed WGS84 geodesic ring [lon, lat] around a center coordinate.
 */
export function buildGeodesicEllipseRing(
  centerLat: number,
  centerLon: number,
  radiusEastWestKm: number,
  radiusNorthSouthKm: number,
  steps = 64
): Array<[number, number]> {
  const safeLat = Math.max(-85, Math.min(85, centerLat));
  const latDegPerKm = 1 / 111.32;
  const lonDegPerKm =
    1 / (111.32 * Math.max(0.25, Math.cos((safeLat * Math.PI) / 180)));

  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const dLon = Math.cos(theta) * radiusEastWestKm * lonDegPerKm;
    const dLat = Math.sin(theta) * radiusNorthSouthKm * latDegPerKm;
    ring.push([centerLon + dLon, safeLat + dLat]);
  }
  return ring;
}

export function buildEpicenterErrorCircleGeoJson(
  event: EQPEvent
): SimpleGeoJsonCollection<GeoJsonPolygonFeature> {
  if (isEventUnlocated(event)) {
    return { type: 'FeatureCollection', features: [] };
  }
  const radiusKm = Math.max(1, event.errKm);
  const ring = buildGeodesicEllipseRing(event.lat, event.lon, radiusKm, radiusKm, 64);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          errKm: event.errKm,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      },
    ],
  };
}

export function buildRangeRingsGeoJson(
  event: EQPEvent,
  radiiKm: number[] = [50, 100, 200]
): {
  lines: SimpleGeoJsonCollection<GeoJsonLineFeature>;
  labels: SimpleGeoJsonCollection<GeoJsonPointFeature>;
} {
  if (isEventUnlocated(event)) {
    return {
      lines: { type: 'FeatureCollection', features: [] },
      labels: { type: 'FeatureCollection', features: [] },
    };
  }
  const lines: GeoJsonLineFeature[] = [];
  const labels: GeoJsonPointFeature[] = [];
  for (const rKm of radiiKm) {
    const ring = buildGeodesicEllipseRing(event.lat, event.lon, rKm, rKm, 72);
    lines.push({
      type: 'Feature',
      properties: { radiusKm: rKm },
      geometry: {
        type: 'LineString',
        coordinates: ring,
      },
    });
    const northLat = event.lat + rKm / 111.32;
    labels.push({
      type: 'Feature',
      properties: { label: `${rKm} km`, radiusKm: rKm },
      geometry: {
        type: 'Point',
        coordinates: [event.lon, northLat],
      },
    });
  }
  return {
    lines: { type: 'FeatureCollection', features: lines },
    labels: { type: 'FeatureCollection', features: labels },
  };
}

export function buildStationRaysGeoJson(
  event: EQPEvent,
  visiblePicks: StationPick[]
): SimpleGeoJsonCollection<GeoJsonLineFeature> {
  if (isEventUnlocated(event)) {
    return { type: 'FeatureCollection', features: [] };
  }
  const features: GeoJsonLineFeature[] = visiblePicks
    .filter((p) => !p.pExcluded)
    .map((pick) => ({
      type: 'Feature',
      properties: {
        sta: pick.sta,
        color: getStationResidualColorHex(pick),
        resP: pick.resP,
        resS: pick.resS,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [pick.lon, pick.lat],
          [event.lon, event.lat],
        ],
      },
    }));

  return { type: 'FeatureCollection', features };
}

export function buildTectonicSchematicGeoJson(options: {
  showFaults: boolean;
  showPlates: boolean;
}): {
  platePolygons: SimpleGeoJsonCollection<GeoJsonPolygonFeature>;
  plateBoundaries: SimpleGeoJsonCollection<GeoJsonLineFeature>;
  schematicFaults: SimpleGeoJsonCollection<GeoJsonLineFeature>;
} {
  const platePolygons: GeoJsonPolygonFeature[] = options.showPlates
    ? TECTONIC_PLATES.map((plate) => ({
        type: 'Feature',
        properties: {
          id: plate.id,
          label: plate.shortLabel,
          fillColor: plate.fillColor,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[...plate.points, plate.points[0]]],
        },
      }))
    : [];

  const plateBoundaries: GeoJsonLineFeature[] = options.showPlates
    ? FAULT_TRACES.filter((f) => f.kind === 'boundary').map((b) => ({
        type: 'Feature',
        properties: { name: b.name, kind: b.kind },
        geometry: {
          type: 'LineString',
          coordinates: b.points,
        },
      }))
    : [];

  const schematicFaults: GeoJsonLineFeature[] = options.showFaults
    ? FAULT_TRACES.filter((f) => f.kind === 'fault').map((f) => ({
        type: 'Feature',
        properties: { name: f.name, kind: f.kind },
        geometry: {
          type: 'LineString',
          coordinates: f.points,
        },
      }))
    : [];

  return {
    platePolygons: { type: 'FeatureCollection', features: platePolygons },
    plateBoundaries: { type: 'FeatureCollection', features: plateBoundaries },
    schematicFaults: { type: 'FeatureCollection', features: schematicFaults },
  };
}

export function buildShakeMapLayerGeoJson(shakeMap: ShakeMapResult | null): {
  polygons: SimpleGeoJsonCollection<GeoJsonPolygonFeature>;
  labels: SimpleGeoJsonCollection<GeoJsonPointFeature>;
} {
  if (!shakeMap) {
    return {
      polygons: { type: 'FeatureCollection', features: [] },
      labels: { type: 'FeatureCollection', features: [] },
    };
  }

  const polygons: GeoJsonPolygonFeature[] = [];
  const labels: GeoJsonPointFeature[] = [];

  for (const contour of shakeMap.contours) {
    const roman: PeisBandCode = contour.band.roman;
    const isEpicentral = contour.isEpicentral !== false;
    if (contour.rings.length > 0) {
      polygons.push({
        type: 'Feature',
        properties: {
          bandRoman: roman,
          fillHex: contour.band.fillHex,
          strokeHex: contour.band.strokeHex,
          threshold: contour.threshold,
          isEpicentral,
        },
        geometry: {
          type: 'Polygon',
          coordinates: contour.rings,
        },
      });
    }
    const [lblLon, lblLat] = contour.labelPoint ?? contour.centroid;
    if (Number.isFinite(lblLon) && Number.isFinite(lblLat)) {
      labels.push({
        type: 'Feature',
        properties: {
          bandRoman: roman,
          strokeHex: contour.band.strokeHex,
          fillHex: contour.band.fillHex,
          isEpicentral,
        },
        geometry: {
          type: 'Point',
          coordinates: [lblLon, lblLat],
        },
      });
    }
  }

  return {
    polygons: { type: 'FeatureCollection', features: polygons },
    labels: { type: 'FeatureCollection', features: labels },
  };
}

export function buildBearingVectorGeoJson(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): SimpleGeoJsonCollection<GeoJsonLineFeature> {
  const info = computeDistanceAndBearing(from.lat, from.lon, to.lat, to.lon);
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          distKm: info.distKm,
          quadrantLabel: info.quadrantLabel,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [from.lon, from.lat],
            [to.lon, to.lat],
          ],
        },
      },
    ],
  };
}

export function buildMainOfficeVectorGeoJson(
  mainOffice: MainOfficeLocation,
  event: EQPEvent
): SimpleGeoJsonCollection<GeoJsonLineFeature> {
  if (isEventUnlocated(event)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return buildBearingVectorGeoJson(mainOffice, { lat: event.lat, lon: event.lon });
}
