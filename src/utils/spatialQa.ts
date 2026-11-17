import {
  EQPEvent,
  FAULT_TRACES,
  isEventUnlocated,
  StationPick,
} from '../data/eqpData';
import { computeDistanceAndBearing } from './nearestPlaces';

export interface AzimuthalGapStats {
  gapDeg: number;
  secondaryGapDeg: number;
  dminKm: number | null;
  dmaxKm: number | null;
  activeStationCount: number;
}

export function computeAzimuthalGap(
  picks: StationPick[],
  epicenterLat: number,
  epicenterLon: number
): AzimuthalGapStats {
  const activePicks = picks.filter(
    (p) => !p.pExcluded && Number.isFinite(p.lat) && Number.isFinite(p.lon)
  );
  if (activePicks.length === 0) {
    return {
      gapDeg: 360,
      secondaryGapDeg: 360,
      dminKm: null,
      dmaxKm: null,
      activeStationCount: 0,
    };
  }

  const azims: number[] = [];
  let dminKm = Infinity;
  let dmaxKm = 0;

  for (const pick of activePicks) {
    const info = computeDistanceAndBearing(epicenterLat, epicenterLon, pick.lat, pick.lon);
    azims.push(info.azimDeg);
    if (info.distKm < dminKm) dminKm = info.distKm;
    if (info.distKm > dmaxKm) dmaxKm = info.distKm;
  }

  azims.sort((a, b) => a - b);

  if (azims.length === 1) {
    return {
      gapDeg: 360,
      secondaryGapDeg: 360,
      dminKm,
      dmaxKm,
      activeStationCount: 1,
    };
  }

  let maxGap = 0;
  for (let i = 0; i < azims.length; i++) {
    const next = i === azims.length - 1 ? azims[0] + 360 : azims[i + 1];
    const diff = next - azims[i];
    if (diff > maxGap) maxGap = diff;
  }

  let maxSecGap = maxGap;
  if (azims.length >= 3) {
    maxSecGap = 0;
    for (let i = 0; i < azims.length; i++) {
      const next2 = i + 2 >= azims.length ? azims[(i + 2) % azims.length] + 360 : azims[i + 2];
      const diff2 = next2 - azims[i];
      if (diff2 > maxSecGap) maxSecGap = diff2;
    }
  } else {
    maxSecGap = 360;
  }

  return {
    gapDeg: Math.round(maxGap),
    secondaryGapDeg: Math.round(maxSecGap),
    dminKm,
    dmaxKm,
    activeStationCount: activePicks.length,
  };
}

export interface FaultProximityEntry {
  name: string;
  kind: 'fault' | 'boundary';
  distanceKm: number;
  bearingLabel: string;
  nearestPoint: [number, number]; // [lat, lon]
}

function pointToSegmentDistanceKm(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): { distKm: number; projLat: number; projLon: number } {
  const meanLatRad = (((aLat + bLat + pLat) / 3) * Math.PI) / 180;
  const kx = 111.32 * Math.max(0.25, Math.cos(meanLatRad));
  const ky = 111.32;

  const ax = aLon * kx;
  const ay = aLat * ky;
  const bx = bLon * kx;
  const by = bLat * ky;
  const px = pLon * kx;
  const py = pLat * ky;

  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;

  let t = 0;
  if (abLenSq > 1e-9) {
    t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLenSq));
  }
  const projX = ax + t * abx;
  const projY = ay + t * aby;
  const distKm = Math.hypot(px - projX, py - projY);

  return {
    distKm,
    projLat: projY / ky,
    projLon: projX / kx,
  };
}

export function computeNearestFaultDistances(
  epicenterLat: number,
  epicenterLon: number,
  limit = 6
): FaultProximityEntry[] {
  const entries: FaultProximityEntry[] = [];

  for (const trace of FAULT_TRACES) {
    if (trace.points.length === 0) continue;
    let bestDist = Infinity;
    let bestLat = trace.points[0][1];
    let bestLon = trace.points[0][0];

    if (trace.points.length === 1) {
      const info = computeDistanceAndBearing(
        trace.points[0][1],
        trace.points[0][0],
        epicenterLat,
        epicenterLon
      );
      bestDist = info.distKm;
    } else {
      for (let i = 0; i < trace.points.length - 1; i++) {
        const [aLon, aLat] = trace.points[i];
        const [bLon, bLat] = trace.points[i + 1];
        const seg = pointToSegmentDistanceKm(
          epicenterLat,
          epicenterLon,
          aLat,
          aLon,
          bLat,
          bLon
        );
        if (seg.distKm < bestDist) {
          bestDist = seg.distKm;
          bestLat = seg.projLat;
          bestLon = seg.projLon;
        }
      }
    }

    const bearingInfo = computeDistanceAndBearing(
      bestLat,
      bestLon,
      epicenterLat,
      epicenterLon
    );

    entries.push({
      name: trace.name,
      kind: trace.kind,
      distanceKm: bestDist,
      bearingLabel: bearingInfo.quadrantLabel,
      nearestPoint: [bestLat, bestLon],
    });
  }

  return entries.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

export interface TsunamiScreeningSummary {
  level: 'None' | 'Information' | 'Warning';
  headline: string;
  nearestTrench: FaultProximityEntry | null;
  effectiveMag: number;
  isShallow: boolean;
  isSignificantMag: boolean;
  isNearTrench: boolean;
}

export function evaluateTsunamiScreening(event: EQPEvent): TsunamiScreeningSummary {
  const effectiveMag =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;

  if (isEventUnlocated(event)) {
    return {
      level: 'None',
      headline: 'Locate hypocenter to evaluate trench proximity and tsunami screening criteria.',
      nearestTrench: null,
      effectiveMag,
      isShallow: false,
      isSignificantMag: false,
      isNearTrench: false,
    };
  }

  const trenches = computeNearestFaultDistances(event.lat, event.lon, 10).filter(
    (f) => f.kind === 'boundary'
  );
  const nearestTrench = trenches[0] ?? null;
  const isShallow = event.depthKm <= 100;
  const isSignificantMag = effectiveMag >= 6.5;
  const isNearTrench = nearestTrench !== null && nearestTrench.distanceKm <= 120;

  if (effectiveMag >= 7.0 && isShallow && isNearTrench) {
    return {
      level: 'Warning',
      headline: `Elevated tsunami potential: M ${effectiveMag.toFixed(1)} shallow (${event.depthKm.toFixed(0)} km) near ${nearestTrench?.name}.`,
      nearestTrench,
      effectiveMag,
      isShallow,
      isSignificantMag,
      isNearTrench,
    };
  }

  if ((isSignificantMag && isShallow) || (effectiveMag >= 6.0 && isShallow && isNearTrench)) {
    return {
      level: 'Information',
      headline: `Sea-level monitoring advised: M ${effectiveMag.toFixed(1)}, depth ${event.depthKm.toFixed(0)} km.`,
      nearestTrench,
      effectiveMag,
      isShallow,
      isSignificantMag,
      isNearTrench,
    };
  }

  return {
    level: 'None',
    headline: 'Below standard destructive tsunami threshold (M < 6.5 or deep/inland focus).',
    nearestTrench,
    effectiveMag,
    isShallow,
    isSignificantMag,
    isNearTrench,
  };
}
