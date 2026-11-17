import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData';
import type { HistoricalEarthquakeRecord } from '../src/utils/historicalSeismicity';
import {
  analyzeHistoricalFrequency,
  resolveAutoFrequencyResolution,
} from '../src/utils/historicalFrequency';

function makeHistEvent(
  id: string,
  isoUtc: string,
  mag: number | null,
  lat = 14.5,
  lon = 121.0,
  depthKm: number | null = 12
): HistoricalEarthquakeRecord {
  const ms = Date.parse(isoUtc);
  return {
    id,
    eventId: id,
    originTimeUtc: isoUtc,
    originTimeMs: ms,
    lat,
    lon,
    depthKm,
    depthStatus: depthKm !== null ? 'known' : 'missing',
    magnitude: mag,
    magnitudeType: 'Mw',
    dataSource: 'USGS',
    catalogVersion: '1',
    quality: 'Reviewed',
    locationUncertain: false,
    horizontalErrKm: 3.2,
    depthErrKm: 4.5,
    place: `Test Region (${id})`,
    sourceReference: 'unit-test',
    retrievedAtUtc: '2026-11-16T00:00:00Z',
    focalMechanism: null,
  };
}

test('resolveAutoFrequencyResolution selects hour/day/week/month/year monotonically by span', () => {
  const DAY = 86_400_000;
  assert.equal(resolveAutoFrequencyResolution(1.5 * DAY), 'hour');
  assert.equal(resolveAutoFrequencyResolution(14 * DAY), 'day');
  assert.equal(resolveAutoFrequencyResolution(180 * DAY), 'week');
  assert.equal(resolveAutoFrequencyResolution(900 * DAY), 'month');
  assert.equal(resolveAutoFrequencyResolution(2500 * DAY), 'year');
});

test('analyzeHistoricalFrequency handles empty catalogs cleanly and applies viewport / epicenter / magnitude filters', () => {
  const empty = analyzeHistoricalFrequency({ historicalEvents: [] });
  assert.equal(empty.bins.length, 0);
  assert.equal(empty.bursts.length, 0);
  assert.equal(empty.filteredEvents.length, 0);

  const activeEvent: EQPEvent = {
    ...INITIAL_EVENTS[0],
    lat: 14.5,
    lon: 121.0,
    iterations: 5,
  };

  const events = [
    makeHistEvent('near-big', '2025-05-01T01:00:00Z', 5.2, 14.6, 121.1),
    makeHistEvent('near-small', '2025-05-02T01:00:00Z', 3.1, 14.55, 121.05),
    makeHistEvent('far-big', '2025-05-03T01:00:00Z', 6.0, 7.0, 126.0),
  ];

  // Viewport excluding Mindanao (far-big)
  const vpScoped = analyzeHistoricalFrequency({
    historicalEvents: events,
    activeEvent,
    spatialScope: 'viewport',
    viewportBounds: { minLat: 13.5, maxLat: 16.0, minLon: 120.0, maxLon: 122.0 },
  });
  assert.equal(vpScoped.filteredEvents.length, 2);
  assert.equal(vpScoped.totalCatalogCount, 3);

  // Near epicenter 50 km radius + M >= 4.0 keeps only near-big
  const nearMagScoped = analyzeHistoricalFrequency({
    historicalEvents: events,
    activeEvent,
    spatialScope: 'near-epicenter',
    epicenterRadiusKm: 50,
    minMagnitude: 4.0,
  });
  assert.equal(nearMagScoped.filteredEvents.length, 1);
  assert.equal(nearMagScoped.filteredEvents[0].id, 'near-big');
});

test('analyzeHistoricalFrequency detects Aftershock Sequence Candidate after dominant lead mainshock', () => {
  const events: HistoricalEarthquakeRecord[] = [];
  // 20 quiet background days (0-1 events/day, mostly empty/low)
  for (let d = 1; d <= 20; d += 2) {
    events.push(
      makeHistEvent(
        `bg-${d}`,
        `2025-01-${String(d).padStart(2, '0')}T12:00:00Z`,
        3.2
      )
    );
  }
  // Mainshock M6.2 on Jan 22 followed by decaying aftershock days on Jan 22-24
  events.push(makeHistEvent('ms-1', '2025-01-22T02:00:00Z', 6.2));
  events.push(makeHistEvent('as-1', '2025-01-22T03:00:00Z', 4.9));
  events.push(makeHistEvent('as-2', '2025-01-22T05:00:00Z', 4.5));
  events.push(makeHistEvent('as-3', '2025-01-22T09:00:00Z', 4.2));
  events.push(makeHistEvent('as-4', '2025-01-22T14:00:00Z', 3.9));
  events.push(makeHistEvent('as-5', '2025-01-22T18:00:00Z', 3.7));
  events.push(makeHistEvent('as-6', '2025-01-23T04:00:00Z', 4.4));
  events.push(makeHistEvent('as-7', '2025-01-23T10:00:00Z', 3.8));
  events.push(makeHistEvent('as-8', '2025-01-23T20:00:00Z', 3.6));
  events.push(makeHistEvent('as-9', '2025-01-24T08:00:00Z', 3.5));

  const res = analyzeHistoricalFrequency({
    historicalEvents: events,
    resolution: 'day',
  });

  assert.ok(res.bins.length >= 24);
  assert.equal(res.bins[res.bins.length - 1].cumulativeCount, events.length);
  assert.ok(res.bursts.length >= 1);

  const mainBurst = res.bursts[0];
  assert.equal(mainBurst.classification, 'Aftershock Sequence Candidate');
  assert.equal(mainBurst.maxMag, 6.2);
  assert.ok((mainBurst.magSpread ?? 0) >= 1.0);
  assert.ok(mainBurst.postLargestCount >= 8);
});

test('analyzeHistoricalFrequency detects Seismic Swarm Candidate when cluster lacks dominant mainshock', () => {
  const events: HistoricalEarthquakeRecord[] = [];
  // Sparse quiet days over a 25-day span
  for (let d = 1; d <= 18; d += 3) {
    events.push(
      makeHistEvent(
        `bg-${d}`,
        `2025-03-${String(d).padStart(2, '0')}T08:00:00Z`,
        2.9
      )
    );
  }
  // Multi-day swarm with closely clustered magnitudes M4.0–M4.6 (ΔM = 0.2) peaking in the middle
  const swarmTimes: [string, number][] = [
    ['2025-03-20T04:00:00Z', 4.0],
    ['2025-03-20T11:00:00Z', 4.2],
    ['2025-03-20T19:00:00Z', 4.4],
    ['2025-03-21T02:00:00Z', 4.3],
    ['2025-03-21T07:00:00Z', 4.6],
    ['2025-03-21T12:00:00Z', 4.4],
    ['2025-03-21T18:00:00Z', 4.1],
    ['2025-03-22T05:00:00Z', 4.2],
    ['2025-03-22T15:00:00Z', 3.9],
  ];
  swarmTimes.forEach(([iso, mag], idx) => {
    events.push(makeHistEvent(`sw-${idx}`, iso, mag));
  });

  const res = analyzeHistoricalFrequency({
    historicalEvents: events,
    resolution: 'day',
  });

  assert.ok(res.bursts.length >= 1);
  const swarmBurst = res.bursts[0];
  assert.equal(swarmBurst.classification, 'Seismic Swarm Candidate');
  assert.ok((swarmBurst.magSpread ?? 99) < 0.9);
  assert.ok(swarmBurst.preLargestCount >= 3);
  assert.ok(swarmBurst.postLargestCount >= 3);
});

test('analyzeHistoricalFrequency safely condenses multi-decade sparse gaps without losing bursts', () => {
  const events = [
    makeHistEvent('old-1', '2005-01-01T00:00:00Z', 4.2),
    makeHistEvent('b-1', '2025-06-01T01:00:00Z', 5.6),
    makeHistEvent('b-2', '2025-06-01T02:00:00Z', 4.1),
    makeHistEvent('b-3', '2025-06-01T04:00:00Z', 3.9),
    makeHistEvent('b-4', '2025-06-01T06:00:00Z', 3.8),
  ];

  const res = analyzeHistoricalFrequency({
    historicalEvents: events,
    resolution: 'day',
  });

  assert.equal(res.sparseEmptyGapsOmitted, true);
  assert.ok(res.bins.length <= 20);
  assert.equal(res.bins[res.bins.length - 1].cumulativeCount, 5);
  assert.equal(res.bursts.length, 1);
  assert.equal(res.bursts[0].classification, 'Aftershock Sequence Candidate');
});
