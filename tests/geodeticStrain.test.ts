import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData.ts';
import {
  computeHorizontalStrainInversion,
  DEFAULT_STRAIN_COMPUTATION_CONFIG,
  DEFAULT_STRAIN_FILTERS,
  parseGeodeticCsv,
  prepareGeodeticObservations,
  projectLatLonToLocalEnuMeters,
} from '../src/utils/geodeticStrain.ts';

const REF_EVENT: EQPEvent = {
  ...INITIAL_EVENTS[0],
  id: 'TEST_EQ_01',
  originDateGmt: '2024-05-01',
  originTimeGmt: '12:00:00.0',
  lat: 14.5,
  lon: 121.0,
  depthKm: 12,
};

test('parseGeodeticCsv handles GNSS pre/post, velocity, timeseries, and InSAR LOS separately', () => {
  const csv = [
    'station_id,lat,lon,observation_type,east,north,up,pre_east,pre_north,post_east,post_north,los_mm,pass,units,crs,date,source,quality',
    'STN1,14.6,121.0,gnss,,,,10,20,25,15,,,mm,ITRF2014,,PHIVOLCS,A',
    'STN2,14.5,121.1,gnss,5,-3,1,,,,,,,,mm/yr,ITRF2014,,IGS,B',
    'INS1,14.55,121.05,insar,,,,,,,,-28.5,Descending,mm,ITRF2014,2024-05-05,Sentinel-1,A',
  ].join('\n');

  const parsed = parseGeodeticCsv(csv);
  assert.equal(parsed.rejections.length, 0);
  assert.equal(parsed.records.length, 3);

  const prep = prepareGeodeticObservations(parsed.records, REF_EVENT, DEFAULT_STRAIN_FILTERS, new Set());
  assert.equal(prep.includedGnss.length, 2);
  assert.equal(prep.includedInsar.length, 1);

  const stn1 = prep.includedGnss.find((x) => x.record.stationId === 'STN1');
  assert.ok(stn1);
  assert.equal(stn1.dispEastMm, 15);
  assert.equal(stn1.dispNorthMm, -5);
});

test('computeHorizontalStrainInversion recovers known synthetic 2D strain and strain-rate tensors', () => {
  const targetExx = 2.0; // microstrain (mm/km)
  const targetEyy = -1.2; // microstrain
  const targetExy = 0.8; // microstrain
  const targetRot = 0.4; // microrad

  const coords = [
    { id: 'A', lat: 14.3, lon: 120.8 },
    { id: 'B', lat: 14.3, lon: 121.2 },
    { id: 'C', lat: 14.7, lon: 120.8 },
    { id: 'D', lat: 14.7, lon: 121.2 },
    { id: 'E', lat: 14.5, lon: 121.0 },
  ];
  const centLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const centLon = coords.reduce((s, c) => s + c.lon, 0) / coords.length;

  const csvRows = ['station_id,lat,lon,east,north,sigma_e,sigma_n,units,crs,source,quality'];
  coords.forEach((c) => {
    const enu = projectLatLonToLocalEnuMeters(c.lat, c.lon, centLat, centLon);
    const xKm = enu.eastM / 1000;
    const yKm = enu.northM / 1000;
    const uE = 4.0 + targetExx * xKm + (targetExy - targetRot) * yKm;
    const uN = -2.0 + (targetExy + targetRot) * xKm + targetEyy * yKm;
    csvRows.push(`${c.id},${c.lat},${c.lon},${uE.toFixed(4)},${uN.toFixed(4)},0.5,0.5,mm,ITRF2014,Synthetic,A`);
  });

  const parsed = parseGeodeticCsv(csvRows.join('\n'));
  const prep = prepareGeodeticObservations(parsed.records, REF_EVENT, DEFAULT_STRAIN_FILTERS, new Set());
  const res = computeHorizontalStrainInversion(prep, REF_EVENT, {
    ...DEFAULT_STRAIN_COMPUTATION_CONFIG,
    analysisQuantity: 'displacement-strain',
  });

  assert.equal(res.status, 'Experimental');
  assert.ok(Math.abs(res.exx - targetExx) < 1e-3);
  assert.ok(Math.abs(res.eyy - targetEyy) < 1e-3);
  assert.ok(Math.abs(res.exy - targetExy) < 1e-3);
  assert.ok(Math.abs(res.rotation - targetRot) < 1e-3);
  assert.ok(Math.abs(res.dilatation - (targetExx + targetEyy)) < 1e-3);
});

test('Safeguards reject InSAR-only and collinear arrays cleanly', () => {
  const insarOnly = parseGeodeticCsv(
    'station_id,lat,lon,observation_type,los_mm,units,crs\nI1,14.5,121.0,insar,-12,mm,ITRF2014\nI2,14.6,121.1,insar,-15,mm,ITRF2014\nI3,14.4,120.9,insar,-10,mm,ITRF2014\nI4,14.55,121.15,insar,-11,mm,ITRF2014'
  );
  const prepInsar = prepareGeodeticObservations(insarOnly.records, REF_EVENT, DEFAULT_STRAIN_FILTERS, new Set());
  const resInsar = computeHorizontalStrainInversion(prepInsar, REF_EVENT, DEFAULT_STRAIN_COMPUTATION_CONFIG);
  assert.equal(resInsar.status, 'Insufficient Data');

  const collinear = parseGeodeticCsv(
    'station_id,lat,lon,east,north,units,crs\nC1,14.5,121.0,2,1,mm,ITRF2014\nC2,14.6,121.0,4,2,mm,ITRF2014\nC3,14.7,121.0,6,3,mm,ITRF2014\nC4,14.8,121.0,8,4,mm,ITRF2014'
  );
  const prepCol = prepareGeodeticObservations(collinear.records, REF_EVENT, DEFAULT_STRAIN_FILTERS, new Set());
  const resCol = computeHorizontalStrainInversion(prepCol, REF_EVENT, DEFAULT_STRAIN_COMPUTATION_CONFIG);
  assert.equal(resCol.status, 'Insufficient Data');
});
