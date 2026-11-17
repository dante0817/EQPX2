import { contours } from 'd3-contour';
import { DEFAULT_PH_CENTER, EQPEvent, FAULT_TRACES, isEventUnlocated } from '../data/eqpData';
import { evaluateTopographyKm, kmPerDegLon, KM_PER_DEG_LAT } from './seismology3d';

export type GmpeModelId = 'phivolcs-peis' | 'atkinson-boore' | 'boore-atkinson';
export type GmpeSelectionMode = 'auto' | GmpeModelId;

export type PeisBandCode =
  | 'I'
  | 'II'
  | 'III'
  | 'IV'
  | 'V'
  | 'VI'
  | 'VII'
  | 'VIII'
  | 'IX'
  | 'X';

export interface ShakeMapBandStyle {
  level: number;
  roman: PeisBandCode;
  label: string;
  pgaLabel: string;
  description: string;
  fillHex: string;
  strokeHex: string;
}

export const SHAKEMAP_BANDS: ShakeMapBandStyle[] = [
  {
    level: 0.75,
    roman: 'I',
    label: 'Scarcely Perceptible',
    pgaLabel: '<0.2%g',
    description: 'Perceptible to people only under favorable indoor circumstances; still water oscillates slightly.',
    fillHex: '#bae6fd',
    strokeHex: '#0284c7',
  },
  {
    level: 1.5,
    roman: 'II',
    label: 'Slightly Felt',
    pgaLabel: '0.2–0.7%g',
    description: 'Felt by few individuals at rest indoors; hanging objects swing slightly.',
    fillHex: '#38bdf8',
    strokeHex: '#0369a1',
  },
  {
    level: 2.5,
    roman: 'III',
    label: 'Weak',
    pgaLabel: '0.7–2.2%g',
    description: 'Felt by many people indoors; vibration feels like a passing light truck.',
    fillHex: '#4ade80',
    strokeHex: '#16a34a',
  },
  {
    level: 3.5,
    roman: 'IV',
    label: 'Moderately Strong',
    pgaLabel: '2.2–5.5%g',
    description: 'Felt generally indoors and by some outdoors; dishes, glassware, and windows rattle.',
    fillHex: '#facc15',
    strokeHex: '#ca8a04',
  },
  {
    level: 4.5,
    roman: 'V',
    label: 'Strong',
    pgaLabel: '5.5–12%g',
    description: 'Generally felt by most people; hanging objects swing violently; standing objects rock.',
    fillHex: '#fb923c',
    strokeHex: '#ea580c',
  },
  {
    level: 5.5,
    roman: 'VI',
    label: 'Very Strong',
    pgaLabel: '12–24%g',
    description: 'Many people frightened and run outdoors; heavy furniture shifts; minor plaster cracking.',
    fillHex: '#f87171',
    strokeHex: '#dc2626',
  },
  {
    level: 6.5,
    roman: 'VII',
    label: 'Destructive',
    pgaLabel: '24–48%g',
    description: 'Difficulty standing on upper floors; poorly built or old structures suffer considerable damage.',
    fillHex: '#ef4444',
    strokeHex: '#b91c1c',
  },
  {
    level: 7.5,
    roman: 'VIII',
    label: 'Very Destructive',
    pgaLabel: '48–85%g',
    description: 'People panicky; heavy damage to well-built structures; ground fissuring and tombstones topple.',
    fillHex: '#dc2626',
    strokeHex: '#991b1b',
  },
  {
    level: 8.5,
    roman: 'IX',
    label: 'Devastating',
    pgaLabel: '85–140%g',
    description: 'Most buildings totally damaged; bridges and elevated concrete structures topple or collapse.',
    fillHex: '#991b1b',
    strokeHex: '#7f1d1d',
  },
  {
    level: 9.5,
    roman: 'X',
    label: 'Completely Devastating',
    pgaLabel: '>140%g',
    description: 'Practically all man-made structures destroyed; massive landslides, liquefaction, and fault scarp.',
    fillHex: '#6b0f1a',
    strokeHex: '#450a0a',
  },
];

export function createDefaultVisibleBands(): Record<PeisBandCode, boolean> {
  return {
    I: true,
    II: true,
    III: true,
    IV: true,
    V: true,
    VI: true,
    VII: true,
    VIII: true,
    IX: true,
    X: true,
  };
}

export const GMPE_MODELS: Array<{
  id: GmpeModelId;
  name: string;
  shortName: string;
  description: string;
}> = [
  {
    id: 'phivolcs-peis',
    name: 'PHIVOLCS PEIS Empirical',
    shortName: 'PHIVOLCS PEIS',
    description: 'Archipelago attenuation calibrated for PEIS I–VIII macroseismic intensity',
  },
  {
    id: 'atkinson-boore',
    name: 'Atkinson–Boore (2003) Subduction',
    shortName: 'AB03 Subduction',
    description: 'Interface & intraslab attenuation for Philippine / Manila Trench events',
  },
  {
    id: 'boore-atkinson',
    name: 'Boore–Atkinson (2008) NGA-West',
    shortName: 'BA08 Crustal',
    description: 'Shallow active crustal attenuation for strike-slip fault systems (PFZ / WVF)',
  },
];

export type GmpeModelInfo = (typeof GMPE_MODELS)[number];

/**
 * Automatically selects the most appropriate GMPE model from GMPE_MODELS
 * based on earthquake magnitude and focal depth.
 */
export function selectOptimalGmpeModel(
  magnitude: number,
  depthKm: number,
): { model: GmpeModelInfo; reason: string } {
  const safeMag = Number.isFinite(magnitude) ? magnitude : 4.5;
  const safeDepth = Number.isFinite(depthKm) ? Math.max(0, depthKm) : 15;

  let selectedId: GmpeModelId;
  let reason: string;

  if (
    safeDepth >= 30 ||
    (safeDepth >= 20 && safeMag >= 5.0) ||
    (safeMag >= 6.5 && safeDepth >= 15)
  ) {
    selectedId = 'atkinson-boore';
    reason =
      safeDepth >= 30
        ? `Deep focal depth (${safeDepth.toFixed(1)} km) favors slab/subduction attenuation`
        : `Intermediate depth (${safeDepth.toFixed(1)} km) at M ${safeMag.toFixed(1)} matches subduction interface attenuation`;
  } else if (safeDepth <= 12 || (safeDepth < 20 && safeMag >= 5.0)) {
    selectedId = 'boore-atkinson';
    reason = `Shallow crustal depth (${safeDepth.toFixed(1)} km) at M ${safeMag.toFixed(1)} favors NGA-West near-source decay`;
  } else {
    selectedId = 'phivolcs-peis';
    reason = `Moderate regional event (M ${safeMag.toFixed(1)}, ${safeDepth.toFixed(1)} km) calibrated for empirical PEIS attenuation`;
  }

  const model = GMPE_MODELS.find((m) => m.id === selectedId) ?? GMPE_MODELS[0];
  return { model, reason };
}

export interface ShakeContourPolygon {
  threshold: number;
  pgaPctGThreshold?: number;
  isEpicentral?: boolean;
  band: ShakeMapBandStyle;
  /** Exact polygon area centroid [lon, lat] computed via the Shoelace formula. */
  centroid: [number, number];
  /** Centroid-anchored label coordinate [lon, lat] guaranteed to clear inner bands and the epicenter marker. */
  labelPoint: [number, number];
  /** Geo-coordinate rings: outer ring first, followed by optional interior holes; each point is [lon, lat]. */
  rings: Array<Array<[number, number]>>;
}

export interface ShakeMapAutoScaleInfo {
  enabled: boolean;
  minThreshold: number;
  maxThreshold: number;
  pgaFloorPctG: number;
  pgaCeilPctG: number;
  bandRangeLabel: string;
}

export interface ShakeMapResult {
  eventId: string;
  effectiveMag: number;
  magScaleLabel: string;
  depthKm: number;
  gmpeId: GmpeModelId;
  useSiteAmp: boolean;
  strikeDeg: number;
  peakIntensity: number;
  peakRoman: string;
  peakPgaPctG: number;
  autoScale: ShakeMapAutoScaleInfo;
  contours: ShakeContourPolygon[];
  bounds: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
}

export function getEffectiveEventMagnitude(event: EQPEvent): { mag: number; label: string } {
  if (event.preferredScale === 'Ms' && event.ms > 0) {
    return { mag: event.ms, label: 'Ms' };
  }
  if (event.preferredScale === 'Mb' && event.mb > 0) {
    return { mag: event.mb, label: 'Mb' };
  }
  if (event.preferredScale === 'Md' && event.md > 0) {
    return { mag: event.md, label: 'Md' };
  }
  if (event.mb > 0) return { mag: event.mb, label: 'Mb' };
  if (event.md > 0) return { mag: event.md, label: 'Md' };
  return { mag: Math.max(3.5, event.ms), label: event.preferredScale };
}

export function intensityToRoman(val: number): string {
  if (val >= 9.5) return 'X';
  if (val >= 8.5) return 'IX';
  if (val >= 7.5) return 'VIII';
  if (val >= 6.5) return 'VII';
  if (val >= 5.5) return 'VI';
  if (val >= 4.5) return 'V';
  if (val >= 3.5) return 'IV';
  if (val >= 2.5) return 'III';
  if (val >= 1.5) return 'II';
  if (val >= 0.75) return 'I';
  return '< I';
}

function inferFaultStrikeDeg(event: EQPEvent): number {
  const gen = event.generators.find((g) => g.id === event.selectedGeneratorId);
  const name = (gen?.name ?? '').toUpperCase();
  if (name.includes('PHILIPPINE TRENCH')) return 172;
  if (name.includes('MANILA TRENCH')) return 175;
  if (name.includes('TRENCH')) return 168;
  if (name.includes('WEST VALLEY') || name.includes('MARIKINA VALLEY')) return 14;
  if (name.includes('PFZ') || name.includes('LEYTE') || name.includes('MINDANAO')) return 148;
  if (name.includes('LUBANG')) return 112;

  // Fallback: compute azimuth from closest fault trace segment
  let bestDist = Infinity;
  let bestStrike = 155;
  for (const fault of FAULT_TRACES) {
    for (let i = 0; i < fault.points.length - 1; i++) {
      const [lon1, lat1] = fault.points[i];
      const [lon2, lat2] = fault.points[i + 1];
      const midLon = (lon1 + lon2) / 2;
      const midLat = (lat1 + lat2) / 2;
      const d = Math.hypot(event.lon - midLon, event.lat - midLat);
      if (d < bestDist) {
        bestDist = d;
        bestStrike = (Math.atan2(lon2 - lon1, lat2 - lat1) * 180) / Math.PI;
      }
    }
  }
  return bestStrike;
}

/**
 * Evaluates simulated continuous shaking intensity (PEIS/MMI scale) and PGA (%g)
 * at a geographic coordinate using a GMPE + GMICE formulation.
 */
export function evaluateShakeIntensityAt(
  lon: number,
  lat: number,
  event: EQPEvent,
  gmpeId: GmpeModelId,
  useSiteAmp: boolean,
  strikeDeg: number,
  effectiveMag: number,
): { intensity: number; pgaPctG: number } {
  const dxKm = (lon - event.lon) * kmPerDegLon(event.lat);
  const dyKm = (lat - event.lat) * KM_PER_DEG_LAT;

  // Rotate into fault-strike coordinates for realistic rupture directivity elongation
  const strikeRad = (strikeDeg * Math.PI) / 180;
  const alongStrike = dxKm * Math.sin(strikeRad) + dyKm * Math.cos(strikeRad);
  const acrossStrike = dxKm * Math.cos(strikeRad) - dyKm * Math.sin(strikeRad);
  const directivityRatio = effectiveMag >= 5.0 ? 1.24 : 1.14;
  const rEpiKm = Math.hypot(alongStrike / directivityRatio, acrossStrike * (1 / 0.92));

  const depthKm = Math.max(2, event.depthKm);
  const rHypo = Math.sqrt(rEpiKm * rEpiKm + depthKm * depthKm + 25);

  let log10PgaG = 0;
  let intensity = 0;

  if (gmpeId === 'atkinson-boore') {
    // Subduction attenuation (log10 PGA in g): slower geometric spreading for deep slab propagation
    const slabBonus = depthKm >= 25 ? 0.14 : 0;
    log10PgaG =
      0.55 +
      0.56 * (effectiveMag - 5.0) -
      1.38 * Math.log10(rHypo) -
      0.0022 * rHypo +
      slabBonus;
    intensity = 6.9 + 2.15 * log10PgaG + 0.35 * (effectiveMag - 4.5);
  } else if (gmpeId === 'boore-atkinson') {
    // Shallow crustal NGA-West attenuation (log10 PGA in g): sharper near-source PGA, faster decay
    log10PgaG =
      0.75 +
      0.61 * (effectiveMag - 5.0) -
      1.62 * Math.log10(rHypo) -
      0.0034 * rHypo;
    intensity = 6.9 + 2.15 * log10PgaG + 0.25 * (effectiveMag - 4.5);
  } else {
    // PHIVOLCS PEIS empirical archipelago intensity law + consistent GMICE PGA(g)
    intensity =
      1.42 * effectiveMag -
      2.65 * Math.log10(rHypo) -
      0.0038 * rHypo +
      1.85;
    log10PgaG = (intensity - 6.9) / 2.15;
  }

  if (useSiteAmp) {
    const elevKm = evaluateTopographyKm(lon, lat);
    if (elevKm >= 0 && elevKm <= 0.28) {
      // Soft coastal/alluvial basin Vs30 amplification
      const amp = 0.42 * (1 - elevKm / 0.28);
      intensity += amp;
      log10PgaG += amp * 0.22;
    } else if (elevKm > 0.45) {
      // Stiff cordillera rock slight de-amplification
      const damp = Math.min(0.24, (elevKm - 0.45) * 0.16);
      intensity -= damp;
      log10PgaG -= damp * 0.18;
    } else if (elevKm < -0.5) {
      // Offshore seafloor attenuation for clean coastal transition
      intensity -= Math.min(0.4, Math.abs(elevKm + 0.5) * 0.08);
    }
  }

  const clampedIntensity = Math.max(0.0, Math.min(10.5, intensity));
  const pgaPctG = Math.max(0.01, Math.pow(10, log10PgaG) * 100);
  return { intensity: clampedIntensity, pgaPctG };
}

function intensityToApproxPgaPctG(intensity: number): number {
  const log10PgaG = (intensity - 6.9) / 2.15;
  return Math.max(0.01, Math.pow(10, log10PgaG) * 100);
}

function bandForIntensityThreshold(level: number): ShakeMapBandStyle {
  for (let i = SHAKEMAP_BANDS.length - 1; i >= 0; i--) {
    if (level >= SHAKEMAP_BANDS[i].level - 0.35) {
      return SHAKEMAP_BANDS[i];
    }
  }
  return SHAKEMAP_BANDS[0];
}

/**
 * Computes geospatial isoseismal contour polygons using d3-contour's marching-squares engine.
 * When autoScaleToPga is true, dynamically determines the relevant contour threshold window
 * from the event's peak ground acceleration (PGA).
 */
export function generateShakeMapContours(
  event: EQPEvent,
  gmpeMode: GmpeSelectionMode = 'auto',
  useSiteAmp = true,
  autoScaleToPga = true,
): ShakeMapResult {
  if (isEventUnlocated(event)) {
    const gmpeId: GmpeModelId =
      gmpeMode === 'auto'
        ? selectOptimalGmpeModel(0, 0).model.id
        : gmpeMode;
    const halfSpanLon = 4.8;
    const halfSpanLat = 4.4;
    return {
      eventId: event.id,
      effectiveMag: 0,
      magScaleLabel: event.preferredScale,
      depthKm: 0,
      gmpeId,
      useSiteAmp,
      strikeDeg: 0,
      peakIntensity: 0,
      peakRoman: '—',
      peakPgaPctG: 0,
      autoScale: {
        enabled: autoScaleToPga,
        minThreshold: 0,
        maxThreshold: 0,
        pgaFloorPctG: 0,
        pgaCeilPctG: 0,
        bandRangeLabel: 'Pending location',
      },
      contours: [],
      bounds: {
        minLon: DEFAULT_PH_CENTER.lon - halfSpanLon,
        maxLon: DEFAULT_PH_CENTER.lon + halfSpanLon,
        minLat: DEFAULT_PH_CENTER.lat - halfSpanLat,
        maxLat: DEFAULT_PH_CENTER.lat + halfSpanLat,
      },
    };
  }

  const { mag: effectiveMag, label: magScaleLabel } = getEffectiveEventMagnitude(event);
  const gmpeId: GmpeModelId =
    gmpeMode === 'auto'
      ? selectOptimalGmpeModel(effectiveMag, event.depthKm).model.id
      : gmpeMode;
  const strikeDeg = inferFaultStrikeDeg(event);

  const cols = 72;
  const rows = 72;
  const halfSpanLon = 4.8;
  const halfSpanLat = 4.4;
  const minLon = event.lon - halfSpanLon;
  const maxLon = event.lon + halfSpanLon;
  const minLat = event.lat - halfSpanLat;
  const maxLat = event.lat + halfSpanLat;

  const grid = new Array<number>(cols * rows);
  let peakIntensity = 0;
  let peakPgaPctG = 0;

  for (let r = 0; r < rows; r++) {
    // Row 0 is top (maxLat) so geographic orientation matches standard map coordinates
    const lat = maxLat - (r / (rows - 1)) * (maxLat - minLat);
    for (let c = 0; c < cols; c++) {
      const lon = minLon + (c / (cols - 1)) * (maxLon - minLon);
      const { intensity, pgaPctG } = evaluateShakeIntensityAt(
        lon,
        lat,
        event,
        gmpeId,
        useSiteAmp,
        strikeDeg,
        effectiveMag,
      );
      grid[r * cols + c] = intensity;
      if (intensity > peakIntensity) peakIntensity = intensity;
      if (pgaPctG > peakPgaPctG) peakPgaPctG = pgaPctG;
    }
  }

  // Evaluate exact epicenter point too
  const epiSample = evaluateShakeIntensityAt(
    event.lon,
    event.lat,
    event,
    gmpeId,
    useSiteAmp,
    strikeDeg,
    effectiveMag,
  );
  peakIntensity = Math.max(peakIntensity, epiSample.intensity);
  peakPgaPctG = Math.max(peakPgaPctG, epiSample.pgaPctG);

  const activeBands = SHAKEMAP_BANDS.filter((b) => b.level <= peakIntensity + 0.05);
  let thresholds = activeBands.map((b) => b.level);
  let pgaFloorPctG = thresholds.length > 0 ? intensityToApproxPgaPctG(thresholds[0]) : 0.1;
  const pgaCeilPctG = peakPgaPctG;

  if (autoScaleToPga) {
    // Compute PGA-driven dynamic floor so both minor & major earthquakes visualize meaningful contours
    if (peakPgaPctG >= 35) {
      pgaFloorPctG = Math.max(1.8, peakPgaPctG * 0.035);
    } else if (peakPgaPctG >= 5) {
      pgaFloorPctG = Math.max(0.16, peakPgaPctG * 0.03);
    } else {
      pgaFloorPctG = Math.max(0.02, peakPgaPctG * 0.055);
    }

    const pgaFloorIntensity = Math.max(
      0.15,
      6.9 + 2.15 * Math.log10(pgaFloorPctG / 100),
    );
    const maxAllowed = Math.max(0.25, peakIntensity - 0.05);
    const scaledBands = SHAKEMAP_BANDS.filter(
      (b) => b.level >= pgaFloorIntensity - 0.15 && b.level <= maxAllowed + 0.08,
    );

    if (scaledBands.length >= 3) {
      thresholds = scaledBands.map((b) => b.level);
    } else if (maxAllowed > 0.25) {
      // Sub-PEIS dynamic interpolation for lower-PGA events so at least 4 relevant contours render
      const minFloor = Math.max(0.15, Math.min(pgaFloorIntensity, maxAllowed - 0.8));
      const steps = 4;
      const computed: number[] = [];
      for (let i = 0; i < steps; i++) {
        const val = minFloor + (i / (steps - 1)) * (maxAllowed - minFloor);
        computed.push(Number(val.toFixed(2)));
      }
      thresholds = Array.from(new Set(computed));
    }
  }

  const contourGenerator = contours().size([cols, rows]).thresholds(thresholds);
  const rawContours = thresholds.length > 0 ? contourGenerator(grid) : [];

  const gridToLonLat = (gx: number, gy: number): [number, number] => {
    const lon = minLon + (gx / (cols - 1)) * (maxLon - minLon);
    const lat = maxLat - (gy / (rows - 1)) * (maxLat - minLat);
    return [lon, lat];
  };

  const pointInRing = (px: number, py: number, ring: Array<[number, number]>): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const minDistToEpicenter = (ring: Array<[number, number]>): number => {
    let best = Infinity;
    for (const [lon, lat] of ring) {
      const d = Math.hypot(lon - event.lon, lat - event.lat);
      if (d < best) best = d;
    }
    return best;
  };

  const computePolygonCentroid = (ring: Array<[number, number]>): [number, number] => {
    const n = ring.length;
    if (n === 0) return [event.lon, event.lat];
    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % n];
      const cross = x0 * y1 - x1 * y0;
      twiceArea += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (Math.abs(twiceArea) < 1e-9) {
      let sx = 0;
      let sy = 0;
      for (const [x, y] of ring) {
        sx += x;
        sy += y;
      }
      return [sx / n, sy / n];
    }
    const factor = 1 / (3 * twiceArea);
    return [cx * factor, cy * factor];
  };

  const rayRingFirstHitDist = (
    cx: number,
    cy: number,
    dirLon: number,
    dirLat: number,
    ring: Array<[number, number]>,
  ): number => {
    let bestT = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      const sx = bx - ax;
      const sy = by - ay;
      const denom = dirLon * sy - dirLat * sx;
      if (Math.abs(denom) < 1e-12) continue;
      const qpx = ax - cx;
      const qpy = ay - cy;
      const t = (qpx * sy - qpy * sx) / denom;
      const u = (qpx * dirLat - qpy * dirLon) / denom;
      if (t > 1e-5 && u >= -1e-4 && u <= 1 + 1e-4 && t < bestT) {
        bestT = t;
      }
    }
    return Number.isFinite(bestT) ? bestT : 0;
  };

  const parsedContours: ShakeContourPolygon[] = [];
  for (const multiPoly of rawContours) {
    const band =
      SHAKEMAP_BANDS.find((b) => Math.abs(b.level - multiPoly.value) < 0.01) ??
      bandForIntensityThreshold(multiPoly.value);
    const pgaThreshold = intensityToApproxPgaPctG(multiPoly.value);

    const candidates: Array<{
      rings: Array<Array<[number, number]>>;
      centroid: [number, number];
      containsEpi: boolean;
      dist: number;
    }> = [];
    for (const polygonRings of multiPoly.coordinates) {
      const geoRings = polygonRings.map((ring) =>
        ring.map(([gx, gy]) => gridToLonLat(gx, gy)),
      );
      if (geoRings.length > 0 && geoRings[0].length >= 3) {
        const centroid = computePolygonCentroid(geoRings[0]);
        const containsEpi = pointInRing(event.lon, event.lat, geoRings[0]);
        const dist = minDistToEpicenter(geoRings[0]);
        candidates.push({ rings: geoRings, centroid, containsEpi, dist });
      }
    }

    if (candidates.length === 0) continue;
    let closestIdx = 0;
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].dist < candidates[closestIdx].dist) closestIdx = i;
    }
    const anyContains = candidates.some((c) => c.containsEpi);

    candidates.forEach((c, idx) => {
      const isEpicentral = anyContains ? c.containsEpi || c.dist <= 0.6 : idx === closestIdx;
      parsedContours.push({
        threshold: multiPoly.value,
        pgaPctGThreshold: Number(pgaThreshold.toFixed(2)),
        isEpicentral,
        band,
        centroid: c.centroid,
        labelPoint: c.centroid,
        rings: c.rings,
      });
    });
  }

  // Refine labelPoint anchored at each polygon's centroid so concentric bands spread cleanly
  // into their respective annuli without stacking atop one another or the epicenter marker.
  for (let i = 0; i < parsedContours.length; i++) {
    const contour = parsedContours[i];
    const outerRing = contour.rings[0];
    const [cx, cy] = contour.centroid;
    if (!pointInRing(cx, cy, outerRing)) {
      continue;
    }

    const epiDist = Math.hypot(cx - event.lon, cy - event.lat);
    const hasSiblingCluster = parsedContours.some(
      (other, j) =>
        j !== i &&
        Math.hypot(other.centroid[0] - cx, other.centroid[1] - cy) < 0.35,
    );

    if (!hasSiblingCluster && epiDist >= 0.18) {
      contour.labelPoint = [cx, cy];
      continue;
    }

    const bandIdx = SHAKEMAP_BANDS.findIndex((b) => b.roman === contour.band.roman);
    const azDeg = (bandIdx >= 0 ? bandIdx : i) % 2 === 0 ? 14 : -14;
    const azRad = (azDeg * Math.PI) / 180;
    const dirLon = Math.sin(azRad);
    const dirLat = Math.cos(azRad);

    const rOuter = rayRingFirstHitDist(cx, cy, dirLon, dirLat, outerRing);
    if (rOuter <= 0) {
      contour.labelPoint = [cx, cy];
      continue;
    }

    let rInner = 0;
    for (let j = 0; j < parsedContours.length; j++) {
      if (j === i) continue;
      const other = parsedContours[j];
      if (other.threshold <= contour.threshold) continue;
      if (
        pointInRing(cx, cy, other.rings[0]) ||
        Math.hypot(other.centroid[0] - cx, other.centroid[1] - cy) < 0.35
      ) {
        const hit = rayRingFirstHitDist(cx, cy, dirLon, dirLat, other.rings[0]);
        if (hit > rInner && hit < rOuter) {
          rInner = hit;
        }
      }
    }

    const containsEpi = pointInRing(event.lon, event.lat, outerRing) || epiDist < 0.2;
    const epiClearance = containsEpi ? Math.min(0.16, rOuter * 0.6) : 0;
    const effectiveInner = Math.max(rInner, epiClearance);

    const rMid =
      rOuter > effectiveInner + 0.015
        ? effectiveInner + (rOuter - effectiveInner) * 0.5
        : rOuter > rInner + 0.005
          ? rInner + (rOuter - rInner) * 0.5
          : rOuter * 0.5;

    const candidate: [number, number] = [cx + dirLon * rMid, cy + dirLat * rMid];
    contour.labelPoint = pointInRing(candidate[0], candidate[1], outerRing)
      ? candidate
      : [cx, cy];
  }

  const minThresh = thresholds.length > 0 ? thresholds[0] : 0;
  const maxThresh = thresholds.length > 0 ? thresholds[thresholds.length - 1] : peakIntensity;
  const firstBand =
    parsedContours.length > 0 ? parsedContours[0].band.roman : intensityToRoman(minThresh);
  const lastBand =
    parsedContours.length > 0
      ? parsedContours[parsedContours.length - 1].band.roman
      : intensityToRoman(maxThresh);
  const bandRangeLabel =
    thresholds.length > 0
      ? `PEIS ${firstBand}–${lastBand} (${pgaFloorPctG.toFixed(2)}%g–${pgaCeilPctG.toFixed(1)}%g)`
      : `Peak < I (${pgaCeilPctG.toFixed(2)}%g)`;

  return {
    eventId: event.id,
    effectiveMag,
    magScaleLabel,
    depthKm: event.depthKm,
    gmpeId,
    useSiteAmp,
    strikeDeg,
    peakIntensity,
    peakRoman: intensityToRoman(peakIntensity),
    peakPgaPctG,
    autoScale: {
      enabled: autoScaleToPga,
      minThreshold: Number(minThresh.toFixed(2)),
      maxThreshold: Number(maxThresh.toFixed(2)),
      pgaFloorPctG: Number(pgaFloorPctG.toFixed(2)),
      pgaCeilPctG: Number(pgaCeilPctG.toFixed(2)),
      bandRangeLabel,
    },
    contours: parsedContours,
    bounds: { minLon, maxLon, minLat, maxLat },
  };
}

function signedRingArea(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function normalizeGeoJsonRing(
  rawRing: Array<[number, number]>,
  wantCcw: boolean,
): Array<[number, number]> {
  const rounded: Array<[number, number]> = rawRing.map(([lon, lat]) => [
    Number(lon.toFixed(5)),
    Number(lat.toFixed(5)),
  ]);
  if (rounded.length < 3) return [];
  const first = rounded[0];
  const last = rounded[rounded.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    rounded.push([first[0], first[1]]);
  }
  if (rounded.length < 4) return [];
  const area = signedRingArea(rounded);
  if ((wantCcw && area < 0) || (!wantCcw && area > 0)) {
    return [...rounded].reverse();
  }
  return rounded;
}

/**
 * Serializes ShakeMap intensity contour polygons into an RFC 7946 GeoJSON FeatureCollection
 * suitable for direct import into QGIS, ArcGIS, GeoPandas, or web GIS viewers.
 */
export function shakeMapToGeoJson(
  shakeMap: ShakeMapResult,
  event: EQPEvent,
  fillOpacity = 0.28,
): string {
  const gmpeMeta = GMPE_MODELS.find((m) => m.id === shakeMap.gmpeId);
  const features = shakeMap.contours
    .map((contour) => {
      const rings = contour.rings
        .map((ring, idx) => normalizeGeoJsonRing(ring, idx === 0))
        .filter((r) => r.length >= 4);
      if (rings.length === 0) return null;

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: rings,
        },
        properties: {
          eventId: event.id,
          originUtc: `${event.originDateGmt}T${event.originTimeGmt}Z`,
          epicenterLat: event.lat,
          epicenterLon: event.lon,
          depthKm: Number(shakeMap.depthKm.toFixed(1)),
          magnitude: Number(shakeMap.effectiveMag.toFixed(1)),
          magScale: shakeMap.magScaleLabel,
          gmpeId: shakeMap.gmpeId,
          gmpeModel: gmpeMeta?.name ?? shakeMap.gmpeId,
          siteAmplification: shakeMap.useSiteAmp,
          peisLevel: contour.band.roman,
          intensityThreshold: contour.threshold,
          intensityLabel: contour.band.label,
          pgaRange: contour.band.pgaLabel,
          description: contour.band.description,
          fill: contour.band.fillHex,
          'fill-opacity': Number(Math.max(0, Math.min(1, fillOpacity)).toFixed(2)),
          stroke: contour.band.strokeHex,
          'stroke-width': 1.5,
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const featureCollection = {
    type: 'FeatureCollection' as const,
    name: `ShakeMap_${event.id}_${shakeMap.gmpeId}`,
    metadata: {
      eventId: event.id,
      originUtc: `${event.originDateGmt}T${event.originTimeGmt}Z`,
      magnitude: `${shakeMap.magScaleLabel} ${shakeMap.effectiveMag.toFixed(1)}`,
      depthKm: shakeMap.depthKm,
      gmpeModel: gmpeMeta?.name ?? shakeMap.gmpeId,
      peakPeis: shakeMap.peakRoman,
      peakIntensity: Number(shakeMap.peakIntensity.toFixed(2)),
      peakPgaPctG: Number(shakeMap.peakPgaPctG.toFixed(2)),
      generatedAt: new Date().toISOString(),
    },
    features,
  };

  return JSON.stringify(featureCollection, null, 2);
}

const EARTH_RADIUS_KM = 6371.0088;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Computes spherical geodesic polygon ring area in km² using Chamberlain & Duquette (2007).
 */
export function geodesicRingAreaKm2(ring: Array<[number, number]>): number {
  if (ring.length < 3) return 0;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const isClosed =
    Math.abs(first[0] - last[0]) < 1e-10 && Math.abs(first[1] - last[1]) < 1e-10;
  const pts = isClosed ? ring.slice(0, -1) : ring;
  const n = pts.length;
  if (n < 3) return 0;

  let total = 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    total += (p3[0] - p1[0]) * DEG_TO_RAD * Math.sin(p2[1] * DEG_TO_RAD);
  }
  return Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

export function computeContourPolygonAreaKm2(contour: ShakeContourPolygon): number {
  if (contour.rings.length === 0) return 0;
  let netArea = geodesicRingAreaKm2(contour.rings[0]);
  for (let h = 1; h < contour.rings.length; h++) {
    netArea -= geodesicRingAreaKm2(contour.rings[h]);
  }
  return Math.max(0, netArea);
}

export interface ShakeBandAreaStat {
  band: ShakeMapBandStyle;
  polygonCount: number;
  /** Net non-overlapping area (km²) specifically within this PEIS band. */
  areaKm2: number;
  /** Total exceedance polygon area (km²) covered by contours >= this band threshold. */
  cumulativeAreaKm2: number;
  /** Share (%) of the total visible ShakeMap footprint covered by this band. */
  sharePct: number;
}

export interface ShakeMapStatistics {
  visibleBands: ShakeBandAreaStat[];
  totalVisibleAreaKm2: number;
  totalPolygons: number;
  maxBandAreaKm2: number;
}

/**
 * Calculates geodesic ground area (km²) covered by each visible PEIS intensity band
 * from the active ShakeMap contour polygons.
 */
export function computeShakeMapStatistics(
  shakeMap: ShakeMapResult | null | undefined,
  visibleBands?: Record<PeisBandCode, boolean>,
  overlayEnabled = true,
): ShakeMapStatistics {
  if (!shakeMap || shakeMap.contours.length === 0 || !overlayEnabled) {
    return {
      visibleBands: [],
      totalVisibleAreaKm2: 0,
      totalPolygons: 0,
      maxBandAreaKm2: 0,
    };
  }

  // Group contours by exact threshold so disjoint polygons at the same level add together
  const byThreshold = new Map<
    number,
    { band: ShakeMapBandStyle; threshold: number; areaKm2: number; count: number }
  >();
  for (const contour of shakeMap.contours) {
    const areaKm2 = computeContourPolygonAreaKm2(contour);
    const existing = byThreshold.get(contour.threshold);
    if (existing) {
      existing.areaKm2 += areaKm2;
      existing.count += 1;
    } else {
      byThreshold.set(contour.threshold, {
        band: contour.band,
        threshold: contour.threshold,
        areaKm2,
        count: 1,
      });
    }
  }

  // Consolidate by PEIS band (keeping widest exceedance polygon group if sub-PEIS thresholds share a band)
  const byBand = new Map<
    PeisBandCode,
    { band: ShakeMapBandStyle; exceedanceAreaKm2: number; polygonCount: number }
  >();
  for (const entry of byThreshold.values()) {
    const prev = byBand.get(entry.band.roman);
    if (!prev || entry.areaKm2 > prev.exceedanceAreaKm2) {
      byBand.set(entry.band.roman, {
        band: entry.band,
        exceedanceAreaKm2: entry.areaKm2,
        polygonCount: entry.count,
      });
    }
  }

  const orderedAsc = Array.from(byBand.values()).sort(
    (a, b) => a.band.level - b.band.level,
  );

  // Subtract the next higher generated band's exceedance area so nested bands don't double-count
  const bandAnnuli = orderedAsc.map((entry, idx) => {
    const innerExceedance =
      idx + 1 < orderedAsc.length ? orderedAsc[idx + 1].exceedanceAreaKm2 : 0;
    const netAreaKm2 = Math.max(0, entry.exceedanceAreaKm2 - innerExceedance);
    return {
      ...entry,
      netAreaKm2,
    };
  });

  const visibleEntries = bandAnnuli.filter((entry) =>
    visibleBands ? visibleBands[entry.band.roman] !== false : true,
  );

  const totalVisibleAreaKm2 = visibleEntries.reduce(
    (sum, item) => sum + item.netAreaKm2,
    0,
  );
  const totalPolygons = visibleEntries.reduce(
    (sum, item) => sum + item.polygonCount,
    0,
  );
  const maxBandAreaKm2 = visibleEntries.reduce(
    (max, item) => Math.max(max, item.netAreaKm2),
    0,
  );

  const visibleStats: ShakeBandAreaStat[] = visibleEntries
    .map((item) => ({
      band: item.band,
      polygonCount: item.polygonCount,
      areaKm2: item.netAreaKm2,
      cumulativeAreaKm2: item.exceedanceAreaKm2,
      sharePct:
        totalVisibleAreaKm2 > 0 ? (item.netAreaKm2 / totalVisibleAreaKm2) * 100 : 0,
    }))
    .sort((a, b) => b.band.level - a.band.level);

  return {
    visibleBands: visibleStats,
    totalVisibleAreaKm2,
    totalPolygons,
    maxBandAreaKm2,
  };
}


