import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData.ts';
import {
  buildHistoricalFingerprint,
  buildHistoricalFocalMechanism,
  computeHistoricalSummaryStats,
  DEFAULT_HISTORICAL_FILTERS,
  detectCatalogDuplicates,
  exportHistoricalCsv,
  exportHistoricalGeoJson,
  exportStressReadyMechanismDataset,
  filterHistoricalEvents,
  geodesicAzimuthDeg,
  geodesicDistanceKm,
  parseHistoricalCsv,
  parseHistoricalGeoJson,
  parseUtcTimestamp,
  projectEventsToCrossSection,
} from '../src/utils/historicalSeismicity.ts';

function makeReferenceEvent(overrides?: Partial<EQPEvent>): EQPEvent {
  const base = structuredClone(INITIAL_EVENTS[0]);
  return {
    ...base,
    id: 'ref-test-evt',
    filename: '20191029_0104.EQP',
    originDateGmt: '2019-10-29',
    originTimeGmt: '01:04:44',
    lat: 6.76,
    lon: 125.03,
    depthKm: 14.0,
    iterations: 6,
    preferredScale: 'Ms',
    ms: 6.6,
    mb: 6.4,
    md: 6.5,
    ...overrides,
  };
}

test('WGS84 geodesic distance and azimuth match known benchmark geometry', () => {
  // Quezon City (PHIVOLCS QVP) to Davao City (WGS84 ellipsoid = ~954.93 km)
  const distManilaDavao = geodesicDistanceKm(14.6522, 121.0583, 7.1907, 125.4553);
  assert.ok(distManilaDavao > 954 && distManilaDavao < 956, `Unexpected distance ${distManilaDavao}`);

  assert.equal(geodesicDistanceKm(10.0, 124.0, 10.0, 124.0), 0);

  const azNorth = geodesicAzimuthDeg(10.0, 124.0, 11.0, 124.0);
  const azEast = geodesicAzimuthDeg(0.0, 124.0, 0.0, 125.0);
  const azSouth = geodesicAzimuthDeg(10.0, 124.0, 9.0, 124.0);
  assert.ok(Math.abs(azNorth - 0) < 0.1 || Math.abs(azNorth - 360) < 0.1);
  assert.ok(Math.abs(azEast - 90) < 0.1);
  assert.ok(Math.abs(azSouth - 180) < 0.1);
});

test('parseUtcTimestamp handles ISO 8601, epoch ms, and slash-delimited UTC strings strictly', () => {
  const iso = parseUtcTimestamp('2019-10-29T01:04:44Z');
  assert.ok(iso);
  assert.equal(iso.isoUtc, '2019-10-29T01:04:44.000Z');

  const epoch = parseUtcTimestamp(1572311084000);
  assert.ok(epoch);
  assert.equal(epoch.isoUtc, '2019-10-29T01:04:44.000Z');

  const slash = parseUtcTimestamp('2019/10/29 01:04:44');
  assert.ok(slash);
  assert.equal(slash.isoUtc, '2019-10-29T01:04:44.000Z');

  assert.equal(parseUtcTimestamp('not-a-timestamp'), null);
  assert.equal(parseUtcTimestamp(''), null);
});

test('parseHistoricalCsv validates rows, preserves missing depth as null, and rejects invalid coordinates', () => {
  const csv = [
    'event_id,origin_time_utc,lat,lon,depth_km,mag,mag_type,source,quality,strike,dip,rake,mech_quality,mech_provenance',
    'PH-001,2019-10-29T01:04:44Z,6.76,125.03,14.0,6.6,Mw,PHIVOLCS,Reviewed,312,78,-15,A,Validated',
    'PH-002,2019-10-31T01:11:18Z,6.91,125.18,,6.5,Ms,PHIVOLCS,Preliminary,,,,,',
    'BAD-LAT,2019-10-31T02:00:00Z,125.0,125.0,10,4.2,Ml,PHIVOLCS,Reviewed,,,,,',
  ].join('\n');

  const batch = parseHistoricalCsv(csv, { defaultSource: 'PHIVOLCS' });
  assert.equal(batch.records.length, 2);
  assert.equal(batch.rejections.length, 1);
  assert.equal(batch.rejections[0].rowNumber, 4);

  const first = batch.records[0];
  assert.equal(first.depthKm, 14.0);
  assert.equal(first.depthStatus, 'known');
  assert.equal(first.locationUncertain, false);
  assert.ok(first.focalMechanism);
  assert.equal(first.focalMechanism.provenanceKind, 'Validated');
  assert.equal(first.focalMechanism.quality, 'A');
  assert.equal(first.focalMechanism.plane1.strike, 312);
  assert.ok(first.focalMechanism.plane2.dip > 0);

  const second = batch.records[1];
  assert.equal(second.depthKm, null);
  assert.equal(second.depthStatus, 'missing');
  assert.equal(second.locationUncertain, true);
  assert.equal(second.focalMechanism, null);
});

test('parseHistoricalGeoJson handles USGS FDSN features including moment-tensor products', () => {
  const usgsSample = {
    type: 'FeatureCollection',
    metadata: {
      title: 'USGS Earthquake Catalog',
      url: 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson',
    },
    features: [
      {
        type: 'Feature',
        id: 'us700060gt',
        geometry: {
          type: 'Point',
          coordinates: [125.174, 6.91, 10.0],
        },
        properties: {
          mag: 6.5,
          magType: 'mww',
          place: '1km S of Bulatukan, Philippines',
          time: 1572484278660,
          status: 'reviewed',
          net: 'us',
          products: {
            'moment-tensor': [
              {
                source: 'us',
                type: 'moment-tensor',
                properties: {
                  'nodal-plane-1-strike': '224',
                  'nodal-plane-1-dip': '76',
                  'nodal-plane-1-rake': '-162',
                  'evaluation-status': 'reviewed',
                },
              },
            ],
          },
        },
      },
      {
        type: 'Feature',
        id: 'us7000missingz',
        geometry: {
          type: 'Point',
          coordinates: [125.25, 6.95],
        },
        properties: {
          mag: 4.4,
          magType: 'mb',
          time: 1572500000000,
          status: 'automatic',
          net: 'us',
        },
      },
    ],
  };

  const parsed = parseHistoricalGeoJson(usgsSample);
  assert.equal(parsed.rejections.length, 0);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].eventId, 'us700060gt');
  assert.equal(parsed.records[0].depthKm, 10);
  assert.ok(parsed.records[0].focalMechanism);
  assert.equal(parsed.records[0].focalMechanism.plane1.strike, 224);
  assert.equal(parsed.records[0].focalMechanism.provenanceKind, 'Imported');
  assert.equal(parsed.records[1].depthKm, null);
  assert.equal(parsed.records[1].locationUncertain, true);
});

test('detectCatalogDuplicates skips exact source+ID duplicates but preserves uncertain cross-source matches', () => {
  const existing = parseHistoricalCsv(
    [
      'event_id,origin_time_utc,lat,lon,depth_km,mag,mag_type,source',
      'PH-2019-A,2019-10-29T01:04:44Z,6.76,125.03,14,6.6,Mw,PHIVOLCS',
    ].join('\n')
  ).records;

  const incoming = parseHistoricalCsv(
    [
      'event_id,origin_time_utc,lat,lon,depth_km,mag,mag_type,source',
      // Exact duplicate from same source
      'PH-2019-A,2019-10-29T01:04:44Z,6.76,125.03,14,6.6,Mw,PHIVOLCS',
      // Cross-source close event (within 8 km & 6 sec) - uncertain duplicate, must be preserved
      'us700060aa,2019-10-29T01:04:49Z,6.79,125.06,12,6.5,Mww,USGS',
    ].join('\n')
  ).records;

  const dupReport = detectCatalogDuplicates(incoming, existing);
  assert.equal(dupReport.exactDuplicates.length, 1);
  assert.equal(dupReport.uncertainDuplicates.length, 1);
  assert.equal(dupReport.uniqueRecords.length, 1);
  assert.equal(dupReport.uniqueRecords[0].eventId, 'us700060aa');
  assert.equal(dupReport.uncertainDuplicates[0].matchType, 'uncertain-spatiotemporal');
});

test('filterHistoricalEvents applies relative time windows, radius, missing depth, and sequence candidates without mixing magnitude scales', () => {
  const refEvent = makeReferenceEvent(); // 2019-10-29T01:04:44Z, 6.76, 125.03

  const catalog = parseHistoricalCsv(
    [
      'event_id,origin_time_utc,lat,lon,depth_km,mag,mag_type,source,strike,dip,rake,mech_provenance',
      // 13 days before, ~15 km away -> Foreshock Candidate, Ml
      'EVT-FORE,2019-10-16T11:37:00Z,6.75,125.17,14,6.3,Ml,PHIVOLCS,,,,',
      // 2 days after, ~23 km away -> Aftershock Candidate, Mw + Validated Mech
      'EVT-AFT,2019-10-31T01:11:18Z,6.91,125.18,10,6.5,Mw,GCMT,224,76,-162,Validated',
      // 3 years later -> Background
      'EVT-BG,2022-11-05T12:00:00Z,6.80,125.05,,4.4,mb,ISC,,,,',
      // Outside 100 km radius (>300 km away in Cebu)
      'EVT-FAR,2019-10-30T00:00:00Z,10.30,123.90,15,5.0,Mw,PHIVOLCS,,,,',
    ].join('\n')
  ).records;

  const filtered = filterHistoricalEvents(catalog, refEvent, {
    ...DEFAULT_HISTORICAL_FILTERS,
    radiusMode: '100',
  });

  assert.equal(filtered.length, 3);
  assert.equal(filtered.find((f) => f.record.eventId === 'EVT-FORE')?.sequenceCandidate, 'Foreshock Candidate');
  assert.equal(filtered.find((f) => f.record.eventId === 'EVT-AFT')?.sequenceCandidate, 'Aftershock Candidate');
  assert.equal(filtered.find((f) => f.record.eventId === 'EVT-BG')?.sequenceCandidate, 'Background / Unconfirmed');

  // Relative time filter: After Only within ±7 days
  const after7d = filterHistoricalEvents(catalog, refEvent, {
    ...DEFAULT_HISTORICAL_FILTERS,
    radiusMode: '100',
    timeDirection: 'after',
    timeWindowPreset: '7d',
  });
  assert.equal(after7d.length, 1);
  assert.equal(after7d[0].record.eventId, 'EVT-AFT');

  // Exclude missing depth
  const noMissingDepth = filterHistoricalEvents(catalog, refEvent, {
    ...DEFAULT_HISTORICAL_FILTERS,
    radiusMode: '100',
    includeMissingDepth: false,
  });
  assert.equal(noMissingDepth.length, 2);

  // Per-scale statistics do NOT combine Ml, Mw, mb
  const stats = computeHistoricalSummaryStats(filtered);
  assert.equal(stats.missingDepthCount, 1);
  assert.equal(stats.knownDepthCount, 2);
  assert.equal(stats.magnitudeBreakdown.length, 3);
  assert.deepEqual(
    stats.magnitudeBreakdown.map((b) => b.magnitudeType).sort(),
    ['Ml', 'Mw', 'mb']
  );

  // Cross-section projects only events with known depth inside swath
  const xs = projectEventsToCrossSection(filtered, refEvent.lat, refEvent.lon, 90, 50);
  assert.equal(xs.length, 2);
});

test('buildHistoricalFocalMechanism computes orthogonal Plane 2 and P/T/B axes without heuristic bias', () => {
  const fm = buildHistoricalFocalMechanism({
    strike1: 312,
    dip1: 78,
    rake1: -15,
    source: 'GCMT',
    provenanceKind: 'Validated',
    quality: 'A',
  });
  assert.ok(fm);
  assert.ok(fm.plane2.dip >= 0 && fm.plane2.dip <= 90);
  assert.ok(fm.pAxis.plunge >= 0 && fm.pAxis.plunge <= 90);
  assert.ok(fm.tAxis.plunge >= 0 && fm.tAxis.plunge <= 90);
  assert.match(fm.mechanismClass, /Strike-Slip/i);

  assert.equal(
    buildHistoricalFocalMechanism({ strike1: 'bad', dip1: 95, rake1: 0 }),
    null
  );
});

test('stale fingerprint and CSV/GeoJSON/stress-ready exports preserve catalog provenance', () => {
  const refEvent = makeReferenceEvent();
  const fp1 = buildHistoricalFingerprint(refEvent, 1, 5);
  const fp2 = buildHistoricalFingerprint(makeReferenceEvent({ depthKm: 20.5 }), 1, 5);
  const fp3 = buildHistoricalFingerprint(refEvent, 2, 6);
  assert.notEqual(fp1, fp2);
  assert.notEqual(fp1, fp3);

  const catalog = parseHistoricalCsv(
    [
      'event_id,origin_time_utc,lat,lon,depth_km,mag,mag_type,source,strike,dip,rake,mech_quality,mech_provenance',
      'EVT-EXP,2019-10-31T01:11:18Z,6.91,125.18,10,6.5,Mw,GCMT,224,76,-162,A,Validated',
    ].join('\n')
  ).records;

  const filtered = filterHistoricalEvents(catalog, refEvent, DEFAULT_HISTORICAL_FILTERS);
  const csvOut = exportHistoricalCsv(filtered, {
    activeEvent: refEvent,
    filters: DEFAULT_HISTORICAL_FILTERS,
    catalogVersion: 4,
  });
  assert.match(csvOut, /Catalog Version: 4/);
  assert.match(csvOut, /EVT-EXP/);
  assert.match(csvOut, /Validated/);

  const gjOut = JSON.parse(
    exportHistoricalGeoJson(filtered, {
      activeEvent: refEvent,
      filters: DEFAULT_HISTORICAL_FILTERS,
      catalogVersion: 4,
    })
  );
  assert.equal(gjOut.metadata.catalogVersion, 4);
  assert.equal(gjOut.features.length, 1);
  assert.equal(gjOut.features[0].properties.focalMechanism.plane1.strike, 224);

  const stressOut = JSON.parse(
    exportStressReadyMechanismDataset(filtered, {
      activeEvent: refEvent,
      catalogVersion: 4,
    })
  );
  assert.equal(stressOut.schema, 'eqp-modern.focal-mechanism-dataset.v1');
  assert.equal(stressOut.mechanismCount, 1);
  assert.equal(stressOut.mechanisms[0].provenanceKind, 'Validated');
});
