import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, PHILSTA_DATABASE } from '../src/data/eqpData';
import { DEFAULT_GEOLOGY_LAYER_VISIBILITY } from '../src/utils/geologyLayers';
import {
  buildActiveLegendItems,
  buildMapSnapshotFilename,
  buildMercatorProjector,
  type MapSnapshotExportOptions,
} from '../src/utils/mapSnapshotExport';
import { DEFAULT_MAIN_OFFICE } from '../src/utils/nearestPlaces';
import { createDefaultVisibleBands, generateShakeMapContours } from '../src/utils/shakemap';

function createBaseExportOptions(): MapSnapshotExportOptions {
  const ev = INITIAL_EVENTS[0];
  const shakeMap = generateShakeMapContours(ev);
  return {
    event: ev,
    stations: PHILSTA_DATABASE,
    selectedStation: null,
    basemapLabel: 'Vector Schematic',
    viewDimension: '2d',
    mapStyleMode: 'terrain',
    viewport: { lat: ev.lat, lon: ev.lon, zoom: 7 },
    showFaults: true,
    showVolcanoes: true,
    showPlates: true,
    showStations: true,
    showGrid: true,
    regionFilter: 'ALL',
    showShakeMap: true,
    shakeMapOpacity: 0.4,
    visibleShakeBands: createDefaultVisibleBands(),
    highlightedShakeBand: null,
    mainOffice: DEFAULT_MAIN_OFFICE,
    showRangeRings: true,
    showNearestPlaces: true,
    nearestCitiesPins: [
      { name: 'Tacloban', lat: 11.244, lon: 125.004, distanceKm: 65, bearing: 'WSW' },
    ],
    showCatalogEvents: false,
    catalogEvents: INITIAL_EVENTS,
    rulerPoints: { start: null, end: null },
    rulerMeasurement: null,
    comparisonMarkers: [],
    geologyVisibility: { ...DEFAULT_GEOLOGY_LAYER_VISIBILITY, activeFaults: true },
    gisActiveFaultsData: null,
    gisTrenchData: null,
    timelineEvents: [],
    showTimelineMigration: false,
    selectedTimelineEventId: null,
    showSeismicityTrendOverlay: false,
    historicalTrendEvents: [],
    panels: [{ shakeMap, capture: null }],
  };
}

test('buildMapSnapshotFilename sanitizes EQP filenames and appends snapshot suffix', () => {
  const ev = INITIAL_EVENTS[0];
  const name = buildMapSnapshotFilename(ev);
  assert.ok(name.endsWith('_map_snapshot.png'));
  assert.ok(!name.includes('.eqp'));

  const cmpName = buildMapSnapshotFilename(
    { ...ev, filename: '2012/02/01 test.EQP' },
    'map_compare_snapshot'
  );
  assert.equal(cmpName, '2012_02_01_test_map_compare_snapshot.png');
});

test('buildMercatorProjector maps viewport center to canvas center and round-trips coordinates', () => {
  const proj = buildMercatorProjector({ lat: 11.754, lon: 125.785, zoom: 7 }, 2400, 1480);
  const [cx, cy] = proj.project(125.785, 11.754);
  assert.ok(Math.abs(cx - 1200) < 1e-6);
  assert.ok(Math.abs(cy - 740) < 1e-6);

  const [rtLon, rtLat] = proj.unproject(600, 400);
  const [x2, y2] = proj.project(rtLon, rtLat);
  assert.ok(Math.abs(x2 - 600) < 1e-4);
  assert.ok(Math.abs(y2 - 400) < 1e-4);
  assert.ok(proj.metersPerPixel > 0 && Number.isFinite(proj.metersPerPixel));
  assert.ok(proj.maxLon > proj.minLon);
  assert.ok(proj.maxLat > proj.minLat);
});

test('buildActiveLegendItems reflects active overlays, markers, and 3D mode accurately', () => {
  const opts = createBaseExportOptions();
  const shakeMap = opts.panels[0].shakeMap;
  const items2d = buildActiveLegendItems(opts, null, shakeMap);
  const labels2d = items2d.map((i) => i.label);

  assert.ok(labels2d.includes('Epicenter'));
  assert.ok(labels2d.includes('Active Station'));
  assert.ok(labels2d.includes('GIS Active Faults'));
  assert.ok(labels2d.includes('Range Rings (50/100/200 km)'));
  assert.ok(labels2d.includes('Cities (1)'));
  assert.ok(labels2d.some((l) => l.startsWith('ShakeMap PEIS')));
  assert.ok(!labels2d.includes('Distance Ruler'));

  // Turning off overlays removes their legend entries
  const minimalOpts: MapSnapshotExportOptions = {
    ...opts,
    showStations: false,
    showFaults: false,
    showVolcanoes: false,
    showPlates: false,
    showShakeMap: false,
    showRangeRings: false,
    showNearestPlaces: false,
    geologyVisibility: {
      ...DEFAULT_GEOLOGY_LAYER_VISIBILITY,
      activeFaults: false,
      potentiallyActiveFaults: false,
      trenches: false,
    },
    rulerPoints: {
      start: { lat: 11.5, lon: 125.2 },
      end: { lat: 12.1, lon: 125.8 },
    },
  };
  const minimalLabels = buildActiveLegendItems(
    minimalOpts,
    { engine: 'maplibre', showMainOffice: false },
    shakeMap
  ).map((i) => i.label);
  assert.deepEqual(minimalLabels, ['Epicenter', 'Distance Ruler']);

  // 3D mode returns 3D subsurface legend entries
  const items3d = buildActiveLegendItems({ ...opts, viewDimension: '3d' }, null, shakeMap);
  assert.ok(items3d.some((i) => i.label === 'Solved Hypocenter'));
  assert.ok(items3d.some((i) => i.label === 'Philippine Trench Slab'));
});
