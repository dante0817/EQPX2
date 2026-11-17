export interface ScaleBarDistanceLabel {
  value: string;
  unit: 'm' | 'km';
}

export interface MapScaleBarMetrics {
  chosenMeters: number;
  barWidthPx: number;
  halfMeters: number;
  fullLabel: ScaleBarDistanceLabel;
  halfLabel: ScaleBarDistanceLabel;
  showMidLabel: boolean;
  metersPerPixel: number;
}

// Cartographic 1-2-2.5-5 scale steps in meters (50 m up to 5,000 km)
export const SCALE_STEPS_METERS = [
  50,
  100,
  200,
  250,
  500,
  1_000,
  2_000,
  2_500,
  5_000,
  10_000,
  20_000,
  25_000,
  50_000,
  100_000,
  200_000,
  250_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
] as const;

export function formatScaleDistanceValue(meters: number): ScaleBarDistanceLabel {
  if (meters >= 1000) {
    const km = meters / 1000;
    return {
      value: Number.isInteger(km) ? String(km) : km.toFixed(1),
      unit: 'km',
    };
  }
  return {
    value: String(Math.round(meters)),
    unit: 'm',
  };
}

export function computeMapScaleBarMetrics(
  metersPerPixel: number,
  compact = false
): MapScaleBarMetrics | null {
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
    return null;
  }

  const maxBarWidthPx = compact ? 96 : 128;
  const minBarWidthPx = compact ? 38 : 48;

  let chosenMeters: number = SCALE_STEPS_METERS[0];
  for (const candidate of SCALE_STEPS_METERS) {
    const px = candidate / metersPerPixel;
    if (px <= maxBarWidthPx) {
      chosenMeters = candidate;
    } else {
      break;
    }
  }

  // Ensure bar doesn't collapse on extreme zoom-out
  let barWidthPx = chosenMeters / metersPerPixel;
  if (barWidthPx < minBarWidthPx) {
    const larger = SCALE_STEPS_METERS.find((s) => s / metersPerPixel >= minBarWidthPx);
    if (larger && larger / metersPerPixel <= maxBarWidthPx * 1.35) {
      chosenMeters = larger;
      barWidthPx = chosenMeters / metersPerPixel;
    }
  }

  const clampedWidthPx = Math.max(32, Math.round(barWidthPx));
  const halfMeters = chosenMeters / 2;
  const fullLabel = formatScaleDistanceValue(chosenMeters);
  const halfLabel = formatScaleDistanceValue(halfMeters);
  const showMidLabel = clampedWidthPx >= 76 && halfLabel.unit === fullLabel.unit;

  return {
    chosenMeters,
    barWidthPx: clampedWidthPx,
    halfMeters,
    fullLabel,
    halfLabel,
    showMidLabel,
    metersPerPixel,
  };
}

const EARTH_EQUATOR_METERS_PER_PIXEL_Z0_256 = 156543.03392804097;
const METERS_PER_LON_DEG_EQUATOR = 111_320;

export function computeWebMercatorMetersPerPixel(lat: number, zoom256: number): number {
  const safeLat = Number.isFinite(lat) ? Math.max(-85, Math.min(85, lat)) : 0;
  const safeZoom = Number.isFinite(zoom256) ? Math.max(0, Math.min(22, zoom256)) : 7;
  return (
    (EARTH_EQUATOR_METERS_PER_PIXEL_Z0_256 *
      Math.max(0.25, Math.cos((safeLat * Math.PI) / 180))) /
    Math.pow(2, safeZoom)
  );
}

export function computeVectorMapMetersPerPixel(
  lonSpanDeg: number,
  centerLat: number,
  containerWidthPx: number
): number {
  const safeSpan = Number.isFinite(lonSpanDeg) && lonSpanDeg > 0 ? lonSpanDeg : 8.5;
  const safeWidth = Number.isFinite(containerWidthPx) && containerWidthPx > 0 ? containerWidthPx : 640;
  const safeLat = Number.isFinite(centerLat) ? Math.max(-85, Math.min(85, centerLat)) : 0;
  const totalWidthMeters =
    safeSpan *
    METERS_PER_LON_DEG_EQUATOR *
    Math.max(0.25, Math.cos((safeLat * Math.PI) / 180));
  return totalWidthMeters / Math.max(1, safeWidth);
}
