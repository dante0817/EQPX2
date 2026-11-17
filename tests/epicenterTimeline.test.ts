import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_EVENTS } from '../src/data/eqpData';
import type { HistoricalEarthquakeRecord } from '../src/utils/historicalSeismicity';
import {
  buildTimelineCatalog,
  buildTimelineMigrationGeoJson,
  computeTimelineTrendSummary,
  computeTimelineWindowBounds,
  computeVisibleTimelineEvents,
} from '../src/utils/epicenterTimeline';

const SAMPLE_HIST: HistoricalEarthquakeRecord[] = [
  {
    id: 'h-1',
    eventId: 'us1001',
    originTimeUtc: '2026-11-01T02:10:00.000Z',
    originTimeMs: Date.parse('2026-11-01T02:10:00.000Z'),
    lat: 9.45,
    lon: 126.1,
    depthKm: 18,
    depthStatus: 'known',
    magnitude: 4.8,
    magnitudeType: 'Mw',
    dataSource: 'USGS',
    catalogVersion: '1',
    quality: 'Reviewed',
    locationUncertain: false,
    horizontalErrKm: 4.2,
    depthErrKm: 3.1,
    place: '22 km E of General Luna, Philippines',
    sourceReference: 'USGS FDSN',
    retrievedAtUtc: '2026-11-15T00:00:00.000Z',
    focalMechanism: null,
  },
  {
    id: 'h-2',
    eventId: 'us1002',
    originTimeUtc: '2026-11-08T14:25:00.000Z',
    originTimeMs: Date.parse('2026-11-08T14:25:00.000Z'),
    lat: 10.22,
    lon: 125.95,
    depthKm: 65,
    depthStatus: 'known',
    magnitude: 5.4,
    magnitudeType: 'Mw',
    dataSource: 'USGS',
    catalogVersion: '1',
    quality: 'Reviewed',
    locationUncertain: false,
    horizontalErrKm: 5.0,
    depthErrKm: 4.0,
    place: '18 km NE of Burgos, Philippines',
    sourceReference: 'USGS FDSN',
    retrievedAtUtc: '2026-11-15T00:00:00.000Z',
    focalMechanism: null,
  },
  // Duplicate of INITIAL_EVENTS[1] (2026-11-12 08:15:32.40, 14.120, 120.850) within 60s & 0.08 deg
  {
    id: 'h-dup',
    eventId: 'us-dup',
    originTimeUtc: '2026-11-12T08:15:40.000Z',
    originTimeMs: Date.parse('2026-11-12T08:15:40.000Z'),
    lat: 14.125,
    lon: 120.855,
    depthKm: 15,
    depthStatus: 'known',
    magnitude: 4.2,
    magnitudeType: 'Ms',
    dataSource: 'USGS',
    catalogVersion: '1',
    quality: 'Reviewed',
    locationUncertain: false,
    horizontalErrKm: 2.0,
    depthErrKm: 2.0,
    place: 'Tagaytay Ridge',
    sourceReference: 'USGS FDSN',
    retrievedAtUtc: '2026-11-15T00:00:00.000Z',
    focalMechanism: null,
  },
  {
    id: 'h-3',
    eventId: 'us1003',
    originTimeUtc: '2026-11-14T20:00:00.000Z',
    originTimeMs: Date.parse('2026-11-14T20:00:00.000Z'),
    lat: 11.4,
    lon: 125.7,
    depthKm: 135,
    depthStatus: 'known',
    magnitude: 6.1,
    magnitudeType: 'Mw',
    dataSource: 'USGS',
    catalogVersion: '1',
    quality: 'Reviewed',
    locationUncertain: false,
    horizontalErrKm: 3.1,
    depthErrKm: 5.5,
    place: '45 km E of Borongan, Philippines',
    sourceReference: 'USGS FDSN',
    retrievedAtUtc: '2026-11-15T00:00:00.000Z',
    focalMechanism: null,
  },
];

test('buildTimelineCatalog merges, deduplicates, filters by minMagnitude, and sorts chronologically', () => {
  const catalog = buildTimelineCatalog({
    workspaceEvents: INITIAL_EVENTS,
    historicalEvents: SAMPLE_HIST,
    sourceFilter: 'all',
    minMagnitude: 4.0,
  });

  // 3 workspace events + 3 non-duplicate historical events (h-dup removed)
  assert.equal(catalog.length, 6);
  for (let i = 1; i < catalog.length; i++) {
    assert.ok(catalog[i].originTimeMs >= catalog[i - 1].originTimeMs);
  }
  assert.ok(!catalog.some((e) => e.id === 'hist-h-dup'));

  const m5Plus = buildTimelineCatalog({
    workspaceEvents: INITIAL_EVENTS,
    historicalEvents: SAMPLE_HIST,
    sourceFilter: 'all',
    minMagnitude: 5.0,
  });
  assert.ok(m5Plus.every((e) => e.magnitude !== null && e.magnitude >= 5.0));
  assert.equal(m5Plus.length, 3);
});

test('computeVisibleTimelineEvents respects cumulative vs rolling trail windows and opacity ordering', () => {
  const catalog = buildTimelineCatalog({
    workspaceEvents: [],
    historicalEvents: SAMPLE_HIST.filter((h) => h.id !== 'h-dup'),
    sourceFilter: 'historical',
  });
  const bounds = computeTimelineWindowBounds(catalog);
  assert.ok(bounds);

  // Playhead at h-3 (2026-11-14): 7d trail includes h-2 (Nov 8) and h-3 (Nov 14), excludes h-1 (Nov 1)
  const rolling7d = computeVisibleTimelineEvents(
    catalog,
    Date.parse('2026-11-14T20:00:00.000Z'),
    '7d',
    bounds.spanMs
  );
  assert.equal(rolling7d.length, 2);
  assert.equal(rolling7d[0].id, 'hist-h-2');
  assert.equal(rolling7d[1].id, 'hist-h-3');
  assert.equal(rolling7d[1].isRecentPulse, true);
  assert.ok(rolling7d[1].opacity > rolling7d[0].opacity);

  // Cumulative includes all 3
  const cumulative = computeVisibleTimelineEvents(
    catalog,
    Date.parse('2026-11-14T20:00:00.000Z'),
    'cumulative',
    bounds.spanMs
  );
  assert.equal(cumulative.length, 3);
});

test('computeTimelineTrendSummary & buildTimelineMigrationGeoJson compute migration, depth breakdown, and peak mag', () => {
  const catalog = buildTimelineCatalog({
    workspaceEvents: [],
    historicalEvents: SAMPLE_HIST.filter((h) => h.id !== 'h-dup'),
    sourceFilter: 'historical',
  });
  const bounds = computeTimelineWindowBounds(catalog)!;
  const visible = computeVisibleTimelineEvents(catalog, bounds.maxMs, 'cumulative', bounds.spanMs);
  const summary = computeTimelineTrendSummary(visible, catalog.length);

  assert.equal(summary.visibleCount, 3);
  assert.equal(summary.peakMagnitude, 6.1);
  assert.equal(summary.shallowCount, 1);
  assert.equal(summary.intermediateCount, 1);
  assert.equal(summary.deepCount, 1);
  assert.ok(summary.netMigrationKm !== null && summary.netMigrationKm > 150);
  assert.ok(summary.migrationBearingLabel !== null);

  const geo = buildTimelineMigrationGeoJson(visible);
  assert.equal(geo.features.length, 1);
  assert.equal(geo.features[0].geometry.coordinates.length, 3);
});
