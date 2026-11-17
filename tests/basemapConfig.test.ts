import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASEMAP_PROVIDERS,
  BASEMAP_STORAGE_KEY,
  createDefaultViewportForEvent,
  getBasemapMeta,
  isValidBasemapId,
  isValidViewport,
  loadSavedBasemapId,
  lonSpanToZoom,
  mapLibreZoomToWebMercatorZoom,
  OFFLINE_PMTILES_CONFIG,
  OPENFREEMAP_STYLES,
  resolveInitialBasemapId,
  saveSelectedBasemapId,
  webMercatorZoomToMapLibreZoom,
  zoomToLonSpan,
} from '../src/utils/maps/basemapConfig';
import {
  buildEpicenterErrorCircleGeoJson,
  buildMainOfficeVectorGeoJson,
  buildRangeRingsGeoJson,
  buildShakeMapLayerGeoJson,
  buildStationRaysGeoJson,
  buildTectonicSchematicGeoJson,
  getStationResidualColorHex,
} from '../src/utils/maps/mapOverlays';
import { DEFAULT_PH_CENTER, INITIAL_EVENTS } from '../src/data/eqpData';
import { generateShakeMapContours } from '../src/utils/shakemap';
import { DEFAULT_MAIN_OFFICE } from '../src/utils/nearestPlaces';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test('Basemap provider registry retains Google Maps, registers OpenFreeMap styles, and keeps Offline PMTiles disabled', () => {
  const ids = BASEMAP_PROVIDERS.map((p) => p.id);
  assert.deepEqual(ids, [
    'openfreemap-liberty',
    'openfreemap-bright',
    'openfreemap-positron',
    'google-maps',
    'vector-schematic',
    'offline-philippines',
  ]);

  assert.equal(
    getBasemapMeta('openfreemap-liberty').styleUrl,
    'https://tiles.openfreemap.org/styles/liberty'
  );
  assert.equal(
    getBasemapMeta('openfreemap-bright').styleUrl,
    'https://tiles.openfreemap.org/styles/bright'
  );
  assert.equal(
    getBasemapMeta('openfreemap-positron').styleUrl,
    'https://tiles.openfreemap.org/styles/positron'
  );
  assert.equal(OPENFREEMAP_STYLES.liberty, 'https://tiles.openfreemap.org/styles/liberty');

  assert.equal(getBasemapMeta('google-maps').available, true);
  assert.equal(getBasemapMeta('google-maps').supportsStyleSubmenu, true);
  assert.equal(getBasemapMeta('vector-schematic').requiresInternet, false);
  assert.equal(OFFLINE_PMTILES_CONFIG.installed, false);
  assert.equal(getBasemapMeta('offline-philippines').available, false);
});

test('localStorage persistence saves valid basemap IDs and rejects invalid or unavailable IDs', () => {
  const storage = createMemoryStorage();
  assert.equal(loadSavedBasemapId(storage), null);

  saveSelectedBasemapId('openfreemap-positron', storage);
  assert.equal(storage.getItem(BASEMAP_STORAGE_KEY), 'openfreemap-positron');
  assert.equal(loadSavedBasemapId(storage), 'openfreemap-positron');

  storage.setItem(BASEMAP_STORAGE_KEY, 'unknown-provider');
  assert.equal(loadSavedBasemapId(storage), null);

  // Offline Philippines is unavailable until PMTiles archive is installed
  storage.setItem(BASEMAP_STORAGE_KEY, 'offline-philippines');
  assert.equal(loadSavedBasemapId(storage), null);
  assert.equal(isValidBasemapId('offline-philippines'), true);
  assert.equal(isValidBasemapId('bogus-id'), false);
});

test('resolveInitialBasemapId preserves saved free basemap even when Google key is present', () => {
  assert.equal(
    resolveInitialBasemapId({
      hasGoogleKey: true,
      savedBasemapId: 'openfreemap-bright',
    }),
    'openfreemap-bright'
  );
  assert.equal(
    resolveInitialBasemapId({
      hasGoogleKey: true,
      savedBasemapId: 'vector-schematic',
    }),
    'vector-schematic'
  );
  assert.equal(
    resolveInitialBasemapId({
      hasGoogleKey: false,
      savedBasemapId: 'google-maps',
    }),
    'openfreemap-liberty'
  );
  assert.equal(
    resolveInitialBasemapId({
      hasGoogleKey: true,
      savedBasemapId: null,
    }),
    'google-maps'
  );
  assert.equal(
    resolveInitialBasemapId({
      hasGoogleKey: false,
      savedBasemapId: null,
    }),
    'openfreemap-liberty'
  );
});

test('Viewport helpers convert accurately between 256px Web Mercator, MapLibre 512px zoom, and Vector lonSpan', () => {
  const locatedEvent = INITIAL_EVENTS[0];
  const vp = createDefaultViewportForEvent(locatedEvent);
  assert.equal(vp.lat, locatedEvent.lat);
  assert.equal(vp.lon, locatedEvent.lon);
  assert.equal(vp.zoom, 7);
  assert.equal(isValidViewport(vp), true);
  assert.equal(isValidViewport({ lat: 99, lon: 121, zoom: 7 }), false);

  const unlocatedEvent = { ...locatedEvent, iterations: 0, lat: 0, lon: 0, errKm: 0 };
  const unlocatedVp = createDefaultViewportForEvent(unlocatedEvent);
  assert.equal(unlocatedVp.lat, DEFAULT_PH_CENTER.lat);
  assert.equal(unlocatedVp.lon, DEFAULT_PH_CENTER.lon);
  assert.equal(unlocatedVp.zoom, 6);

  // MapLibre 512px zoom is 1 less than Google 256px zoom
  assert.equal(webMercatorZoomToMapLibreZoom(7), 6);
  assert.equal(mapLibreZoomToWebMercatorZoom(6), 7);

  // Round-trip zoom <-> lonSpan conversion
  const spanAtZoom7 = zoomToLonSpan(7, 800);
  const roundTripZoom = lonSpanToZoom(spanAtZoom7, 800);
  assert.ok(Math.abs(roundTripZoom - 7) < 0.05, `Expected ~7, got ${roundTripZoom}`);
});

test('GeoJSON overlay builders preserve EQP coordinates/picks without mutating scientific data', () => {
  const ev = INITIAL_EVENTS[0];
  const origLat = ev.lat;
  const origLon = ev.lon;
  const origDepth = ev.depthKm;

  const errGeo = buildEpicenterErrorCircleGeoJson(ev);
  assert.equal(errGeo.features.length, 1);
  assert.ok(errGeo.features[0].geometry.coordinates[0].length >= 65);

  const rings = buildRangeRingsGeoJson(ev, [50, 100, 200]);
  assert.equal(rings.lines.features.length, 3);
  assert.equal(rings.labels.features.length, 3);
  assert.deepEqual(
    rings.labels.features.map((f) => f.properties.label),
    ['50 km', '100 km', '200 km']
  );

  const samplePicks = ev.picks.slice(0, 3).map((p, idx) => ({
    ...p,
    pExcluded: idx === 2,
    resP: idx === 0 ? 0.2 : idx === 1 ? 1.4 : 0.1,
    resS: 0.1,
  }));
  const rays = buildStationRaysGeoJson(ev, samplePicks);
  assert.equal(rays.features.length, 2); // Excludes pExcluded === true
  assert.equal(getStationResidualColorHex(samplePicks[0]), '#2563eb');
  assert.equal(getStationResidualColorHex(samplePicks[1]), '#dc2626');
  assert.equal(getStationResidualColorHex(samplePicks[2]), '#94a3b8');
  assert.deepEqual(rays.features[0].geometry.coordinates[1], [origLon, origLat]);

  const tectonic = buildTectonicSchematicGeoJson({ showFaults: true, showPlates: true });
  assert.ok(tectonic.platePolygons.features.length > 0);
  assert.ok(tectonic.schematicFaults.features.length > 0);

  const shake = generateShakeMapContours(ev);
  const shakeGeo = buildShakeMapLayerGeoJson(shake);
  assert.equal(shakeGeo.polygons.features.length, shake.contours.length);

  const officeVec = buildMainOfficeVectorGeoJson(DEFAULT_MAIN_OFFICE, ev);
  assert.equal(officeVec.features.length, 1);
  assert.deepEqual(officeVec.features[0].geometry.coordinates[1], [origLon, origLat]);

  // Verify input EQPEvent coordinates & depth remain untouched
  assert.equal(ev.lat, origLat);
  assert.equal(ev.lon, origLon);
  assert.equal(ev.depthKm, origDepth);

  // Unlocated event produces empty overlays cleanly
  const unlocatedEv = { ...ev, iterations: 0, lat: 0, lon: 0 };
  assert.equal(buildEpicenterErrorCircleGeoJson(unlocatedEv).features.length, 0);
  assert.equal(buildRangeRingsGeoJson(unlocatedEv).lines.features.length, 0);
  assert.equal(buildStationRaysGeoJson(unlocatedEv, samplePicks).features.length, 0);
  assert.equal(buildMainOfficeVectorGeoJson(DEFAULT_MAIN_OFFICE, unlocatedEv).features.length, 0);
});
