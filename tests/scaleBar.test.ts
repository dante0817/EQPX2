import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMapScaleBarMetrics,
  computeVectorMapMetersPerPixel,
  computeWebMercatorMetersPerPixel,
  formatScaleDistanceValue,
  SCALE_STEPS_METERS,
} from '../src/utils/maps/scaleBar';

test('formatScaleDistanceValue formats meters below 1000m and kilometers at or above 1000m', () => {
  assert.deepEqual(formatScaleDistanceValue(50), { value: '50', unit: 'm' });
  assert.deepEqual(formatScaleDistanceValue(500), { value: '500', unit: 'm' });
  assert.deepEqual(formatScaleDistanceValue(1000), { value: '1', unit: 'km' });
  assert.deepEqual(formatScaleDistanceValue(2500), { value: '2.5', unit: 'km' });
  assert.deepEqual(formatScaleDistanceValue(100_000), { value: '100', unit: 'km' });
});

test('computeMapScaleBarMetrics rejects invalid or non-positive resolution values', () => {
  assert.equal(computeMapScaleBarMetrics(0), null);
  assert.equal(computeMapScaleBarMetrics(-120), null);
  assert.equal(computeMapScaleBarMetrics(Number.NaN), null);
  assert.equal(computeMapScaleBarMetrics(Number.POSITIVE_INFINITY), null);
});

test('computeMapScaleBarMetrics selects cartographic steps within standard and compact width caps', () => {
  // ~1000 m/px => max 128 px => 100 km (100 px)
  const standard = computeMapScaleBarMetrics(1000, false);
  assert.ok(standard);
  assert.equal(standard.chosenMeters, 100_000);
  assert.equal(standard.barWidthPx, 100);
  assert.deepEqual(standard.fullLabel, { value: '100', unit: 'km' });
  assert.deepEqual(standard.halfLabel, { value: '50', unit: 'km' });
  assert.equal(standard.showMidLabel, true);

  // Compact mode caps at 96 px => 50 km (50 px) at 1000 m/px
  const compact = computeMapScaleBarMetrics(1000, true);
  assert.ok(compact);
  assert.equal(compact.chosenMeters, 50_000);
  assert.equal(compact.barWidthPx, 50);
  assert.equal(compact.showMidLabel, false);

  // Fine zoom (2 m/px) uses meter units
  const streetZoom = computeMapScaleBarMetrics(2, false);
  assert.ok(streetZoom);
  assert.equal(streetZoom.chosenMeters, 250);
  assert.equal(streetZoom.barWidthPx, 125);
  assert.deepEqual(streetZoom.fullLabel, { value: '250', unit: 'm' });
  assert.deepEqual(streetZoom.halfLabel, { value: '125', unit: 'm' });
  assert.equal(streetZoom.showMidLabel, true);

  // 1 km step suppresses mid-label when half (500 m) switches units
  const oneKm = computeMapScaleBarMetrics(10, false);
  assert.ok(oneKm);
  assert.equal(oneKm.chosenMeters, 1000);
  assert.equal(oneKm.fullLabel.unit, 'km');
  assert.equal(oneKm.halfLabel.unit, 'm');
  assert.equal(oneKm.showMidLabel, false);

  // Extremely zoomed out falls back safely with clamped minimum width >= 32px
  const globalZoom = computeMapScaleBarMetrics(200_000, false);
  assert.ok(globalZoom);
  assert.equal(globalZoom.chosenMeters, SCALE_STEPS_METERS[SCALE_STEPS_METERS.length - 1]);
  assert.ok(globalZoom.barWidthPx >= 32);
});

test('computeWebMercatorMetersPerPixel accounts for zoom level and latitude cosine projection', () => {
  const equatorZ0 = computeWebMercatorMetersPerPixel(0, 0);
  assert.ok(Math.abs(equatorZ0 - 156543.03) < 0.1);

  const equatorZ8 = computeWebMercatorMetersPerPixel(0, 8);
  assert.ok(Math.abs(equatorZ8 - equatorZ0 / 256) < 0.01);

  const manilaZ8 = computeWebMercatorMetersPerPixel(14.5995, 8);
  assert.ok(manilaZ8 < equatorZ8);
  assert.ok(Math.abs(manilaZ8 - equatorZ8 * Math.cos((14.5995 * Math.PI) / 180)) < 0.01);

  // MapLibre 512px tiles zoom 6 corresponds to Web Mercator 256px zoom 7
  const mapLibreZ6 = computeWebMercatorMetersPerPixel(14.6, 6 + 1);
  const googleZ7 = computeWebMercatorMetersPerPixel(14.6, 7);
  assert.equal(mapLibreZ6, googleZ7);
});

test('computeVectorMapMetersPerPixel matches SVG map lonSpan and container width', () => {
  // 8.5 deg at equator across 850 px => 0.01 deg/px => ~1113.2 m/px
  const mppEquator = computeVectorMapMetersPerPixel(8.5, 0, 850);
  assert.ok(Math.abs(mppEquator - 1113.2) < 0.5);

  const mppLuzon = computeVectorMapMetersPerPixel(8.5, 16, 850);
  assert.ok(mppLuzon < mppEquator);

  // Fallback handling for invalid/non-positive inputs
  const fallback = computeVectorMapMetersPerPixel(0, Number.NaN, 0);
  assert.ok(Number.isFinite(fallback) && fallback > 0);
});
