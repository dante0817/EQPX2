import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeCompassBearing,
  computeNearestGisFaults,
  DEFAULT_GEOLOGY_LAYER_VISIBILITY,
  getTrenchDisplayName,
  haversineDistanceKm,
  hitTestGeologyFeatures,
  isUncertainTraceType,
  loadActiveFaultsDataset,
  loadGeologyManifest,
  loadTrenchSystemsDataset,
  normalizeTrenchKind,
  parseAndValidateActiveFaultsGeoJson,
  parseAndValidateTrenchSystemsGeoJson,
  resolveGeologyAssetUrl,
  type GeologyManifest,
} from '../src/utils/geologyLayers';

const GEOLOGY_DIR = path.resolve(process.cwd(), 'public/data/geology');

test('Default geological layer visibility keeps all GIS layers OFF', () => {
  assert.deepEqual(DEFAULT_GEOLOGY_LAYER_VISIBILITY, {
    activeFaults: false,
    potentiallyActiveFaults: false,
    trenches: false,
  });
});

test('resolveGeologyAssetUrl produces base-relative URLs without leading slash conflicts', () => {
  const url = resolveGeologyAssetUrl('active_faults.geojson');
  assert.equal(url, '/data/geology/active_faults.geojson');
  assert.equal(resolveGeologyAssetUrl('/manifest.json'), '/data/geology/manifest.json');
});

test('Real active_faults.geojson validates with exact feature counts, geometries, and WGS84 bounds', () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(GEOLOGY_DIR, 'active_faults.geojson'), 'utf8')
  );
  const dataset = parseAndValidateActiveFaultsGeoJson(raw);

  assert.equal(dataset.totalCount, 6340);
  assert.equal(dataset.activeFaultCount, 5552);
  assert.equal(dataset.potentiallyActiveFaultCount, 788);
  assert.equal(dataset.otherCategoryCount, 0);
  assert.equal(dataset.activeFaultCollection.features.length, 5552);
  assert.equal(dataset.potentiallyActiveFaultCollection.features.length, 788);

  let hasNullAttribute = false;
  for (const f of dataset.features) {
    assert.ok(
      f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString',
      `Unexpected geometry type: ${f.geometry.type}`
    );
    const [minLon, minLat, maxLon, maxLat] = f.bbox;
    assert.ok(minLon >= 115 && maxLon <= 130, `Lon out of PH range: ${minLon}..${maxLon}`);
    assert.ok(minLat >= 0 && maxLat <= 25, `Lat out of PH range: ${minLat}..${maxLat}`);
    if (f.properties.fault_name === null || f.properties.mechanism === null) {
      hasNullAttribute = true;
    }
  }
  assert.equal(hasNullAttribute, true, 'Expected some features to preserve null attributes safely');
});

test('Real trench_systems_REVIEW_ONLY.geojson validates with 11 features and correct classifications', () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(GEOLOGY_DIR, 'trench_systems_REVIEW_ONLY.geojson'), 'utf8')
  );
  const dataset = parseAndValidateTrenchSystemsGeoJson(raw);

  assert.equal(dataset.totalCount, 11);
  assert.equal(dataset.trenchCount, 9);
  assert.equal(dataset.troughCount, 1);
  assert.equal(dataset.transformFaultCount, 1);
  assert.equal(dataset.featureCollection.features.length, 11);

  const transformFeature = dataset.features.find((f) => f.kind === 'transform_fault');
  assert.ok(transformFeature, 'Expected East Luzon Transform Fault feature');
  assert.equal(transformFeature.displayName, 'East Luzon Transform Fault');

  const troughFeature = dataset.features.find((f) => f.kind === 'trough');
  assert.ok(troughFeature, 'Expected East Luzon Trough feature');
  assert.equal(troughFeature.displayName, 'East Luzon Trough');

  for (const f of dataset.features) {
    const [minLon, minLat, maxLon, maxLat] = f.bbox;
    assert.ok(minLon >= 115 && maxLon <= 130, `Trench lon out of PH range: ${minLon}..${maxLon}`);
    assert.ok(minLat >= 0 && maxLat <= 25, `Trench lat out of PH range: ${minLat}..${maxLat}`);
  }
});

test('Real manifest.json documents datum transformation accuracy as unavailable/unknown (-1)', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(GEOLOGY_DIR, 'manifest.json'), 'utf8')
  ) as GeologyManifest;

  assert.equal(manifest.active_faults.features, 6340);
  assert.equal(manifest.trench_systems.source_records, 12);
  assert.equal(manifest.trench_systems.features, 11);
  assert.deepEqual(manifest.trench_systems.empty_geometry_skipped_source_rows, [12]);
  assert.equal(manifest.trench_systems.estimated_transformation_accuracy_m, -1.0);
  assert.ok(Array.isArray(manifest.known_issues) && manifest.known_issues.length >= 4);
});

test('getTrenchDisplayName prefers clean source_label for generic names and ignores truncated labels', () => {
  assert.equal(
    getTrenchDisplayName({
      source_row: 1,
      name: 'Transform Fault',
      source_label: 'East Luzon Transform Fault',
      feature_kind: 'transform_fault',
    }),
    'East Luzon Transform Fault'
  );

  assert.equal(
    getTrenchDisplayName({
      source_row: 2,
      name: 'Philippine Trench',
      source_label: 'Philippine Trench_',
      feature_kind: 'trench',
    }),
    'Philippine Trench'
  );

  assert.equal(
    getTrenchDisplayName({
      source_row: 3,
      name: null,
      source_label: null,
      feature_kind: 'trench',
    }),
    'Unnamed Tectonic Feature'
  );
});

test('isUncertainTraceType and normalizeTrenchKind classify trace certainty and tectonic kinds', () => {
  assert.equal(isUncertainTraceType('Certain'), false);
  assert.equal(isUncertainTraceType('Certain Trace'), false);
  assert.equal(isUncertainTraceType('Approximate'), true);
  assert.equal(isUncertainTraceType('Concealed'), true);
  assert.equal(isUncertainTraceType('Inferred'), true);
  assert.equal(isUncertainTraceType('Offshore Projection'), true);
  assert.equal(isUncertainTraceType(null), false);

  assert.equal(normalizeTrenchKind('transform_fault', 'Transform Fault', null), 'transform_fault');
  assert.equal(normalizeTrenchKind('trough', 'East Luzon Trough', null), 'trough');
  assert.equal(normalizeTrenchKind(null, 'Manila Trench', null), 'trench');
});

test('GeoJSON validators reject malformed payloads and out-of-range coordinates', () => {
  assert.throws(() => parseAndValidateActiveFaultsGeoJson(null), /valid JSON object/);
  assert.throws(
    () => parseAndValidateActiveFaultsGeoJson({ type: 'Feature', features: [] }),
    /FeatureCollection/
  );
  assert.throws(
    () =>
      parseAndValidateActiveFaultsGeoJson({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { fault_category: 'Active Fault' },
            geometry: { type: 'Point', coordinates: [121, 14] },
          },
        ],
      }),
    /Invalid or unsupported geometry/
  );
  assert.throws(
    () =>
      parseAndValidateTrenchSystemsGeoJson({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Bad' },
            geometry: {
              type: 'LineString',
              coordinates: [
                [999, 14],
                [121, 14.5],
              ],
            },
          },
        ],
      }),
    /Invalid or unsupported geometry/
  );
});

test('hitTestGeologyFeatures respects independent layer visibility and selects closest trace', () => {
  const faults = parseAndValidateActiveFaultsGeoJson({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          fault_name: 'Valley Fault System',
          segment_name: 'West Valley Fault',
          fault_category: 'Active Fault',
          trace_type: 'Certain',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [121.05, 14.4],
            [121.05, 14.8],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          fault_name: 'Sample Potentially Active',
          segment_name: 'Segment A',
          fault_category: 'Potentially Active Fault',
          trace_type: 'Approximate',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [121.06, 14.4],
            [121.06, 14.8],
          ],
        },
      },
    ],
  });

  const trenches = parseAndValidateTrenchSystemsGeoJson({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: 'Manila Trench',
          source_label: 'Manila Trench',
          feature_kind: 'trench',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [119.5, 14.0],
            [119.5, 16.0],
          ],
        },
      },
    ],
  });

  // When all layers are OFF, hit test returns null
  assert.equal(
    hitTestGeologyFeatures({
      clickLon: 121.05,
      clickLat: 14.6,
      maxToleranceDeg: 0.05,
      visibility: DEFAULT_GEOLOGY_LAYER_VISIBILITY,
      activeFaultsData: faults,
      trenchData: trenches,
    }),
    null
  );

  // When only Potentially Active Faults is ON, hits Potentially Active Fault even closer to Active Fault
  const pafHit = hitTestGeologyFeatures({
    clickLon: 121.05,
    clickLat: 14.6,
    maxToleranceDeg: 0.05,
    visibility: { activeFaults: false, potentiallyActiveFaults: true, trenches: false },
    activeFaultsData: faults,
    trenchData: trenches,
  });
  assert.ok(pafHit && pafHit.kind === 'fault');
  assert.equal(pafHit.properties.fault_name, 'Sample Potentially Active');

  // When trenches is ON, hits Manila Trench
  const trenchHit = hitTestGeologyFeatures({
    clickLon: 119.51,
    clickLat: 15.0,
    maxToleranceDeg: 0.05,
    visibility: { activeFaults: false, potentiallyActiveFaults: false, trenches: true },
    activeFaultsData: faults,
    trenchData: trenches,
  });
  assert.ok(trenchHit && trenchHit.kind === 'trench');
  assert.equal(trenchHit.displayName, 'Manila Trench');
});

test('Dataset async loaders propagate HTTP errors cleanly', async () => {
  const failingFetch = (async () =>
    ({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as Response) as unknown as typeof fetch;

  await assert.rejects(() => loadActiveFaultsDataset(failingFetch), /HTTP 404/);
  await assert.rejects(() => loadTrenchSystemsDataset(failingFetch), /HTTP 404/);
  await assert.rejects(() => loadGeologyManifest(failingFetch), /HTTP 404/);
});

test('computeNearestGisFaults computes shortest surface & 3D hypocentral distances and respects category filter', () => {
  const dataset = parseAndValidateActiveFaultsGeoJson({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          source_row: 1,
          fault_name: 'Closer Potentially Active',
          segment_name: 'Seg P',
          fault_category: 'Potentially Active Fault',
          trace_type: 'Approximate',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [121.02, 14.4],
            [121.02, 14.8],
          ],
        },
      },
      {
        type: 'Feature',
        properties: {
          source_row: 2,
          fault_name: 'West Valley Fault',
          segment_name: 'Central',
          fault_category: 'Active Fault',
          trace_type: 'Certain',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [121.1, 14.4],
            [121.1, 14.8],
          ],
        },
      },
    ],
  });

  // Epicenter at (14.6, 121.0), Z = 10 km -> only Active Faults
  const activeOnly = computeNearestGisFaults({
    epicenterLat: 14.6,
    epicenterLon: 121.0,
    depthKm: 10,
    activeFaultsData: dataset,
    includePotentiallyActive: false,
    limit: 3,
  });
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0].feature.properties.fault_name, 'West Valley Fault');
  const expectedSurfaceKm = haversineDistanceKm(14.6, 121.0, 14.6, 121.1);
  assert.ok(Math.abs(activeOnly[0].epicentralDistKm - expectedSurfaceKm) < 0.05);
  assert.ok(
    Math.abs(activeOnly[0].hypocentralDistKm - Math.hypot(expectedSurfaceKm, 10)) < 0.05
  );
  assert.ok(activeOnly[0].quadrantLabel.endsWith('E'));

  // Bearing directly north
  const north = computeCompassBearing(14.0, 121.0, 15.0, 121.0);
  assert.equal(Math.round(north.azimDeg), 0);
  assert.equal(north.quadrantLabel, 'N 00° E');

  // Include Potentially Active Faults -> picks closer PAF at 121.02°E
  const withPaf = computeNearestGisFaults({
    epicenterLat: 14.6,
    epicenterLon: 121.0,
    depthKm: 10,
    activeFaultsData: dataset,
    includePotentiallyActive: true,
    limit: 3,
  });
  assert.equal(withPaf.length, 2);
  assert.equal(withPaf[0].feature.properties.fault_name, 'Closer Potentially Active');
  assert.ok(withPaf[0].epicentralDistKm < withPaf[1].epicentralDistKm);
});

test('computeNearestGisFaults finds exact shortest trace on real 5,552 Active Faults dataset quickly', () => {
  const raw = JSON.parse(
    fs.readFileSync(path.join(GEOLOGY_DIR, 'active_faults.geojson'), 'utf8')
  );
  const dataset = parseAndValidateActiveFaultsGeoJson(raw);

  // Near Metro Manila / Valley Fault System
  const t0 = performance.now();
  const manilaResults = computeNearestGisFaults({
    epicenterLat: 14.599,
    epicenterLon: 121.05,
    depthKm: 10,
    activeFaultsData: dataset,
    includePotentiallyActive: false,
    limit: 3,
  });
  const elapsedMs = performance.now() - t0;

  assert.equal(manilaResults.length, 3);
  assert.ok(manilaResults[0].epicentralDistKm >= 0 && manilaResults[0].epicentralDistKm < 15);
  assert.ok(manilaResults[0].epicentralDistKm <= manilaResults[1].epicentralDistKm);
  assert.ok(manilaResults[1].epicentralDistKm <= manilaResults[2].epicentralDistKm);
  assert.equal(manilaResults[0].feature.properties.fault_category, 'Active Fault');
  assert.ok(elapsedMs < 200, `Expected fast bbox-pruned lookup, took ${elapsedMs.toFixed(1)} ms`);

  // Verify Eastern Samar sample event coordinates (11.754°N, 125.785°E, Z=32 km)
  const samarResults = computeNearestGisFaults({
    epicenterLat: 11.754,
    epicenterLon: 125.785,
    depthKm: 32,
    activeFaultsData: dataset,
    includePotentiallyActive: true,
    limit: 3,
  });
  assert.equal(samarResults.length, 3);
  assert.ok(
    Math.abs(
      samarResults[0].hypocentralDistKm -
        Math.hypot(samarResults[0].epicentralDistKm, 32)
    ) < 1e-6
  );
});
