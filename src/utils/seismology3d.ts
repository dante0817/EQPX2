import * as THREE from 'three';
import {
  ACTIVE_VOLCANOES,
  CRUSTAL_MODEL_1D,
  CrustalLayer,
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  PHILSTA_DATABASE,
  StationMeta,
} from '../data/eqpData';

export const KM_PER_DEG_LAT = 111.32;
export const SCENE_KM_PER_UNIT = 25;
export const BLOCK_HALF_KM = 240; // 480 km × 480 km regional block
export const BLOCK_HALF_UNITS = BLOCK_HALF_KM / SCENE_KM_PER_UNIT; // 9.6 scene units

export interface DepthDiagnosticSummary {
  hostingLayer: CrustalLayer;
  nearestBoundaryKm: number;
  nearestBoundaryLabel: string;
  minStationDistKm: number;
  depthConstraintRatio: number;
  trialDeltaKm: number;
  maxStationElevM: number;
  maxStationElevCode: string;
  status: 'Well-Constrained' | 'Boundary Proximity' | 'Poor Depth Constraint';
  finding: string;
}

export function kmPerDegLon(latDeg: number): number {
  return KM_PER_DEG_LAT * Math.max(0.25, Math.cos((latDeg * Math.PI) / 180));
}

export function lonLatToSceneXZ(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
): [number, number] {
  const xKm = (lon - centerLon) * kmPerDegLon(centerLat);
  const zKm = -(lat - centerLat) * KM_PER_DEG_LAT;
  return [xKm / SCENE_KM_PER_UNIT, zKm / SCENE_KM_PER_UNIT];
}

export function sceneXZToLonLat(
  x: number,
  z: number,
  centerLon: number,
  centerLat: number,
): [number, number] {
  const xKm = x * SCENE_KM_PER_UNIT;
  const zKm = z * SCENE_KM_PER_UNIT;
  const lon = centerLon + xKm / kmPerDegLon(centerLat);
  const lat = centerLat - zKm / KM_PER_DEG_LAT;
  return [lon, lat];
}

function pointInPolygon(lon: number, lat: number, pts: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegmentDeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPolylineDeg(lon: number, lat: number, pts: Array<[number, number]>): number {
  let minD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegmentDeg(lon, lat, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

/**
 * Evaluates procedural regional topography & bathymetry in kilometers (relative to 0 km sea level).
 * Combines archipelago polygons, cordillera harmonic ridges, volcanic cones, station elevations,
 * and Philippine / Manila trench bathymetry.
 */
export function evaluateTopographyKm(
  lon: number,
  lat: number,
  stations: StationMeta[] = PHILSTA_DATABASE
): number {
  let onLand = false;
  let minCoastDist = Infinity;

  for (const poly of ISLAND_POLYGONS) {
    if (
      lon >= poly.minLon &&
      lon <= poly.maxLon &&
      lat >= poly.minLat &&
      lat <= poly.maxLat &&
      pointInPolygon(lon, lat, poly.points)
    ) {
      onLand = true;
    }
    if (
      lon >= poly.minLon - 1.0 &&
      lon <= poly.maxLon + 1.0 &&
      lat >= poly.minLat - 1.0 &&
      lat <= poly.maxLat + 1.0
    ) {
      const d = distToPolylineDeg(lon, lat, poly.points);
      if (d < minCoastDist) minCoastDist = d;
    }
  }

  // Multi-harmonic cordillera & seafloor relief
  const ridgeNoise =
    0.55 * Math.sin(lon * 3.1 + lat * 2.4) +
    0.32 * Math.cos(lon * 6.7 - lat * 5.2) +
    0.18 * Math.sin(lon * 13.3 + lat * 11.1);

  let elevKm = 0;
  if (onLand) {
    // Inland rise from coast up to ~1.4 km cordillera ridges
    const inlandFactor = Math.min(1, minCoastDist / 0.42);
    elevKm = 0.08 + inlandFactor * (0.85 + Math.max(0, ridgeNoise) * 0.72);
  } else {
    // Continental shelf sloping down to abyssal seafloor (-2.8 km)
    const shelfFactor = Math.min(1, minCoastDist / 0.85);
    elevKm = -0.15 - shelfFactor * 2.6 + ridgeNoise * 0.25;
  }

  // Volcanic edifice Gaussians
  for (const vol of ACTIVE_VOLCANOES) {
    const dDeg = Math.hypot((lon - vol.lon) * 0.96, lat - vol.lat);
    if (dDeg < 0.55) {
      elevKm += 1.65 * Math.exp(-(dDeg * dDeg) / (2 * 0.13 * 0.13));
    }
  }

  // Trench bathymetry along Philippine Trench & Manila Trench
  const philTrench = FAULT_TRACES.find((f) => f.name.includes('Philippine Trench'));
  if (philTrench) {
    const dt = distToPolylineDeg(lon, lat, philTrench.points);
    if (dt < 1.2) {
      elevKm -= 5.8 * Math.exp(-(dt * dt) / (2 * 0.28 * 0.28));
    }
  }
  const manilaTrench = FAULT_TRACES.find((f) => f.name.includes('Manila Trench'));
  if (manilaTrench) {
    const dt = distToPolylineDeg(lon, lat, manilaTrench.points);
    if (dt < 1.0) {
      elevKm -= 3.6 * Math.exp(-(dt * dt) / (2 * 0.24 * 0.24));
    }
  }

  // Smoothly anchor toward known PHILSTA station elevations
  for (const sta of stations) {
    const ds = Math.hypot(lon - sta.lon, lat - sta.lat);
    if (ds < 0.28) {
      const w = Math.exp(-(ds * ds) / (2 * 0.08 * 0.08)) * 0.85;
      const staElevKm = sta.elevationM / 1000;
      elevKm = elevKm * (1 - w) + Math.max(elevKm, staElevKm) * w;
    }
  }

  return Math.max(-9.2, Math.min(2.9, elevKm));
}

export function elevKmToSceneY(elevKm: number, verticalExag: number): number {
  // Surface topography relief gets a gentle 4.5x boost over the deep crust scale so ridges and trenches read crisply
  return (elevKm / SCENE_KM_PER_UNIT) * verticalExag * 4.5;
}

export function depthKmToSceneY(depthKm: number, verticalExag: number): number {
  return -(depthKm / SCENE_KM_PER_UNIT) * verticalExag;
}

export function computeBlockMaxDepthKm(event: EQPEvent): number {
  const maxHypo = Math.max(event.depthKm, event.trialDepthKm, 48);
  return Math.max(70, Math.ceil((maxHypo + 22) / 10) * 10);
}

export function getCrustalLayerForDepth(depthKm: number): CrustalLayer {
  for (let i = CRUSTAL_MODEL_1D.length - 1; i >= 0; i--) {
    if (depthKm >= CRUSTAL_MODEL_1D[i].topDepthKm) {
      return CRUSTAL_MODEL_1D[i];
    }
  }
  return CRUSTAL_MODEL_1D[0];
}

export function computeDepthDiagnostics(
  event: EQPEvent,
  stations: StationMeta[] = PHILSTA_DATABASE
): DepthDiagnosticSummary {
  const hostingLayer = getCrustalLayerForDepth(event.depthKm);

  const interfaces = [
    { depthKm: 4.0, label: 'Upper/Mid Crust (4.0 km)' },
    { depthKm: 15.0, label: 'Mid/Lower Crust (15.0 km)' },
    { depthKm: 30.0, label: 'Moho Discontinuity (30.0 km)' },
    { depthKm: 48.0, label: 'Lithosphere/Mantle (48.0 km)' },
  ];

  let nearestBoundaryKm = Infinity;
  let nearestBoundaryLabel = '';
  for (const iface of interfaces) {
    const dist = Math.abs(event.depthKm - iface.depthKm);
    if (dist < nearestBoundaryKm) {
      nearestBoundaryKm = dist;
      nearestBoundaryLabel = iface.label;
    }
  }

  const activePicks = event.picks.filter((p) => !p.pExcluded);
  const minDeltaDeg =
    activePicks.length > 0
      ? Math.min(...activePicks.map((p) => p.delta))
      : event.picks.length > 0
        ? Math.min(...event.picks.map((p) => p.delta))
        : 1.0;
  const minStationDistKm = minDeltaDeg * KM_PER_DEG_LAT;
  const depthConstraintRatio = minStationDistKm / Math.max(1, event.depthKm);
  const trialDeltaKm = event.depthKm - event.trialDepthKm;

  let maxStationElevM = 0;
  let maxStationElevCode = '—';
  const staElevLookup: Record<string, number> = {};
  for (const st of stations) {
    staElevLookup[st.code] = st.elevationM;
  }
  for (const p of event.picks) {
    const elev = staElevLookup[p.sta] ?? 0;
    if (elev >= maxStationElevM) {
      maxStationElevM = elev;
      maxStationElevCode = p.sta;
    }
  }

  let status: DepthDiagnosticSummary['status'] = 'Well-Constrained';
  let finding = `Nearest station at ${minStationDistKm.toFixed(1)} km (Δmin/Z = ${depthConstraintRatio.toFixed(2)}) constrains hypocenter depth cleanly inside Layer ${hostingLayer.layer}.`;

  if (depthConstraintRatio > 2.0) {
    status = 'Poor Depth Constraint';
    finding = `Nearest active station is ${minStationDistKm.toFixed(1)} km away (Δmin/Z = ${depthConstraintRatio.toFixed(2)} > 2.0); origin-time vs depth trade-off may skew deep estimates.`;
  } else if (nearestBoundaryKm <= 1.8) {
    status = 'Boundary Proximity';
    finding = `Focus sits ${nearestBoundaryKm.toFixed(1)} km from ${nearestBoundaryLabel}; head-wave vs direct-ray refraction switches can trap solver depth.`;
  } else if (Math.abs(trialDeltaKm) < 0.2 && event.rmsSec > 0.6) {
    status = 'Boundary Proximity';
    finding = `Solved depth remained pinned near trial depth (${event.trialDepthKm.toFixed(1)} km) with ${event.rmsSec.toFixed(2)}s RMS; verify deep focal convergence.`;
  }

  return {
    hostingLayer,
    nearestBoundaryKm,
    nearestBoundaryLabel,
    minStationDistKm,
    depthConstraintRatio,
    trialDeltaKm,
    maxStationElevM,
    maxStationElevCode,
    status,
    finding,
  };
}

/**
 * Generates a crisp procedural stratigraphic depth ruler texture for the 3D cross-section pillar.
 */
export function createDepthScaleTexture(maxDepthKm: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const layerColors = ['#38bdf8', '#22d3ee', '#818cf8', '#a855f7', '#ec4899'];
    for (let i = 0; i < CRUSTAL_MODEL_1D.length; i++) {
      const layer = CRUSTAL_MODEL_1D[i];
      const nextTop =
        i < CRUSTAL_MODEL_1D.length - 1 ? CRUSTAL_MODEL_1D[i + 1].topDepthKm : maxDepthKm;
      const startY = (Math.min(layer.topDepthKm, maxDepthKm) / maxDepthKm) * canvas.height;
      const endY = (Math.min(nextTop, maxDepthKm) / maxDepthKm) * canvas.height;
      if (endY <= startY) continue;

      ctx.fillStyle = layerColors[i] ?? '#64748b';
      ctx.globalAlpha = 0.24;
      ctx.fillRect(0, startY, canvas.width, endY - startY);
      ctx.globalAlpha = 1;

      ctx.fillStyle = layerColors[i] ?? '#94a3b8';
      ctx.fillRect(0, startY, 14, endY - startY);

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, startY);
      ctx.lineTo(canvas.width, startY);
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 24px monospace';
      const label =
        layer.topDepthKm === 30
          ? `${layer.topDepthKm} km MOHO`
          : `${layer.topDepthKm} km · Vp ${layer.vpKmS.toFixed(2)}`;
      ctx.fillText(label, 24, Math.min(canvas.height - 14, startY + 30));
    }

    // Bottom depth label
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`${maxDepthKm} km MAX`, 24, canvas.height - 14);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
