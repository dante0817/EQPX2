import type {
  EQPEvent,
  IntensityCategory,
  MagnitudeScale,
  StationPick,
} from '../data/eqpData.ts';

export type EqpChangeCategory =
  | 'hypocenter'
  | 'magnitude'
  | 'phases'
  | 'places'
  | 'intensity'
  | 'bulletin'
  | 'metadata';

export type EqpHistoryTrigger =
  | 'initial'
  | 'save'
  | 'locate'
  | 'ai-picks'
  | 'magnitude'
  | 'bulletin'
  | 'backfill';

export interface EqpChangeItem {
  category: EqpChangeCategory;
  label: string;
  detail: string;
}

export interface EqpPickSnapshot {
  sta: string;
  pTime: string;
  pExcluded: boolean;
  sTime: string;
  sExcluded: boolean;
  duration: number | null;
  amplitude: number | null;
  polarity: string;
  quality: string;
}

export interface EqpIntensitySnapshot {
  peis: string;
  locality: string;
  category?: IntensityCategory;
}

export interface EqpVersionSnapshot {
  eventKey: string;
  bulletinNo: number;
  filename: string;
  filePath: string;
  originDateGmt: string;
  originTimeGmt: string;
  lat: number;
  lon: number;
  depthKm: number;
  errKm: number;
  rmsSec: number;
  iterations: number;
  ms: number;
  mb: number;
  md: number;
  preferredScale: MagnitudeScale;
  magnitudeMethodId?: string;
  magnitudeScale?: string;
  magnitudeValue?: number | null;
  magnitudeCalibrationStatus?: string;
  activePhases: number;
  totalStations: number;
  centralOfficeBearing: string;
  cityLabel: string;
  townLabel: string;
  generatorLabel: string;
  primaryHeadline: 'city' | 'town';
  originType: string;
  tsunamiStatus: string;
  expectingDamage: boolean;
  expectingAftershocks: boolean;
  webPublished: boolean;
  issuedDate: string;
  issuedTime: string;
  issuedBy: string;
  remarks: string;
  bulletinNote1: string;
  bulletinNote2: string;
  picks: EqpPickSnapshot[];
  intensities: EqpIntensitySnapshot[];
  amplitudeMeasurementCount?: number;
  structuredAmplitudeDigest?: string;
}

export interface EqpHistoryEntry {
  id: string;
  eventKey: string;
  versionTag: string;
  bulletinNo: number;
  trigger: EqpHistoryTrigger;
  timestamp: string;
  filename: string;
  relPath?: string;
  displayPath: string;
  issuedBy: string;
  summary: string;
  changes: EqpChangeItem[];
  snapshot: EqpVersionSnapshot;
}

export function getEqpEventKey(
  event: Pick<EQPEvent, 'originDateGmt' | 'originTimeGmt' | 'filename'> & { id?: string }
): string {
  const dateMatch = event.originDateGmt?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = event.originTimeGmt?.trim().match(/^(\d{2}):(\d{2})/);
  if (dateMatch && timeMatch) {
    return `${dateMatch[1]}_${dateMatch[2]}${dateMatch[3]}_${timeMatch[1]}${timeMatch[2]}`;
  }

  const fname = (event.filename || '').trim();
  const fnMatch = fname.match(/^(\d{4})_(\d{4})_(\d{4})/);
  if (fnMatch) {
    return `${fnMatch[1]}_${fnMatch[2]}_${fnMatch[3]}`;
  }
  const fnCompact = fname.match(/^(\d{4})(\d{2})(\d{2})_(\d{4})/);
  if (fnCompact) {
    return `${fnCompact[1]}_${fnCompact[2]}${fnCompact[3]}_${fnCompact[4]}`;
  }

  return (event.id || fname || 'unknown_event').replace(/\.eqp$/i, '');
}

function countActivePhases(picks: Array<Pick<StationPick, 'pTime' | 'pExcluded' | 'sTime' | 'sExcluded'>>): number {
  let count = 0;
  for (const p of picks) {
    if (p.pTime.trim() && !p.pExcluded) count += 1;
    if (p.sTime.trim() && !p.sExcluded) count += 1;
  }
  return count;
}

export function isEqpVersionSnapshot(
  value: EQPEvent | EqpVersionSnapshot
): value is EqpVersionSnapshot {
  return 'eventKey' in value && 'activePhases' in value && 'totalStations' in value;
}

export function buildEqpSnapshot(event: EQPEvent): EqpVersionSnapshot {
  const cityLabel =
    event.cities.find((c) => c.id === event.selectedCityId)?.label ?? '';
  const townLabel =
    event.towns.find((t) => t.id === event.selectedTownId)?.label ?? '';
  const generatorLabel =
    event.generators.find((g) => g.id === event.selectedGeneratorId)?.label ?? '';

  return {
    eventKey: getEqpEventKey(event),
    bulletinNo: Math.max(1, Math.trunc(event.bulletinNo || 1)),
    filename: event.filename || '',
    filePath: event.filePath || '',
    originDateGmt: event.originDateGmt || '',
    originTimeGmt: event.originTimeGmt || '',
    lat: Number((event.lat ?? 0).toFixed(3)),
    lon: Number((event.lon ?? 0).toFixed(3)),
    depthKm: Number((event.depthKm ?? 0).toFixed(2)),
    errKm: Number((event.errKm ?? 0).toFixed(2)),
    rmsSec: Number((event.rmsSec ?? 0).toFixed(2)),
    iterations: Math.trunc(event.iterations ?? 0),
    ms: Number((event.ms ?? 0).toFixed(1)),
    mb: Number((event.mb ?? 0).toFixed(1)),
    md: Number((event.md ?? 0).toFixed(1)),
    preferredScale: event.preferredScale ?? 'Ms',
    ...(event.magnitudeMetadata
      ? {
          magnitudeMethodId: event.magnitudeMetadata.preferredMethodId,
          magnitudeScale: event.magnitudeMetadata.selectedScale,
          magnitudeValue: event.magnitudeMetadata.selectedMagnitude,
          magnitudeCalibrationStatus: event.magnitudeMetadata.calibrationStatus,
        }
      : {}),
    activePhases: countActivePhases(event.picks),
    totalStations: event.picks.length,
    centralOfficeBearing: event.centralOfficeBearing ?? '',
    cityLabel,
    townLabel,
    generatorLabel,
    primaryHeadline: event.primaryHeadline ?? 'city',
    originType: event.originType ?? 'TECTONIC',
    tsunamiStatus: event.tsunamiStatus ?? 'None',
    expectingDamage: Boolean(event.expectingDamage),
    expectingAftershocks: Boolean(event.expectingAftershocks),
    webPublished: Boolean(event.webPublished),
    issuedDate: event.issuedDate ?? '',
    issuedTime: event.issuedTime ?? '',
    issuedBy: event.issuedBy ?? 'SOEPD',
    remarks: (event.remarks ?? '').trim(),
    bulletinNote1: (event.bulletinNote1 ?? '').trim(),
    bulletinNote2: (event.bulletinNote2 ?? '').trim(),
    picks: event.picks.map((p) => ({
      sta: p.sta.toUpperCase().trim(),
      pTime: p.pTime.trim(),
      pExcluded: Boolean(p.pExcluded),
      sTime: p.sTime.trim(),
      sExcluded: Boolean(p.sExcluded),
      duration: p.duration ?? null,
      amplitude: p.amplitude ?? null,
      polarity: p.polarity ?? '',
      quality: p.quality ?? 'B',
    })),
    intensities: event.intensities.map((i) => ({
      peis: i.peis,
      locality: i.locality.trim(),
      category: i.category === 'instrumental' ? 'instrumental' : 'felt',
    })),
    amplitudeMeasurementCount: event.amplitudeMeasurements?.length ?? 0,
    ...(event.amplitudeMeasurements && event.amplitudeMeasurements.length > 0
      ? {
          structuredAmplitudeDigest: event.amplitudeMeasurements
            .map(
              (m) =>
                `${m.stationCode}:${m.channelCode || '—'}:${m.measurementCategory}:${m.amplitude}${m.unit}`
            )
            .sort()
            .join('|'),
        }
      : {}),
  };
}

function toSnapshot(input: EQPEvent | EqpVersionSnapshot): EqpVersionSnapshot {
  return isEqpVersionSnapshot(input) ? input : buildEqpSnapshot(input);
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function formatScaleName(scale: MagnitudeScale): string {
  return scale === 'Md' ? 'ML' : scale;
}

function formatMagnitudeValue(snap: EqpVersionSnapshot): string {
  if (snap.magnitudeMethodId && snap.magnitudeMethodId !== 'eqp-legacy-ms') {
    const valStr = snap.magnitudeValue != null ? snap.magnitudeValue.toFixed(1) : 'Pending';
    return `${snap.magnitudeScale || 'Md'} ${valStr} (${snap.magnitudeMethodId})`;
  }
  const val =
    snap.preferredScale === 'Ms'
      ? snap.ms
      : snap.preferredScale === 'Mb'
        ? snap.mb
        : snap.md;
  return `${formatScaleName(snap.preferredScale)} ${val.toFixed(1)}`;
}

function indexPicksByKey(picks: EqpPickSnapshot[]): Map<string, EqpPickSnapshot> {
  const counts = new Map<string, number>();
  const indexed = new Map<string, EqpPickSnapshot>();
  for (const p of picks) {
    const sta = p.sta.toUpperCase().trim() || 'STA';
    const nextIdx = (counts.get(sta) ?? 0) + 1;
    counts.set(sta, nextIdx);
    const key = nextIdx === 1 ? sta : `${sta}#${nextIdx}`;
    indexed.set(key, p);
  }
  return indexed;
}

export function diffEqpVersions(
  prevInput: EQPEvent | EqpVersionSnapshot | null,
  nextInput: EQPEvent | EqpVersionSnapshot,
  options?: { trigger?: EqpHistoryTrigger; note?: string }
): { summary: string; changes: EqpChangeItem[] } {
  const next = toSnapshot(nextInput);
  const feltSuffix = next.intensities.length > 0 ? 'F' : '';
  const bulletinTag = `B${next.bulletinNo}${feltSuffix}`;

  if (!prevInput) {
    const changes: EqpChangeItem[] = [];
    const unlocated = next.iterations === 0 && next.lat === 0 && next.lon === 0;

    if (unlocated) {
      changes.push({
        category: 'hypocenter',
        label: 'Initial Trial Sheet',
        detail: `Unlocated sheet initialized (${next.totalStations} station rows, ${next.activePhases} active phases)`,
      });
    } else {
      changes.push({
        category: 'hypocenter',
        label: 'Initial Hypocenter',
        detail: `${next.lat.toFixed(3)}°N, ${next.lon.toFixed(3)}°E · Depth ${next.depthKm.toFixed(1)} km · RMS ${next.rmsSec.toFixed(2)}s (±${next.errKm.toFixed(2)} km)`,
      });
    }

    if (next.ms > 0 || next.mb > 0 || next.md > 0) {
      changes.push({
        category: 'magnitude',
        label: 'Initial Magnitudes',
        detail: `${formatMagnitudeValue(next)} (Ms ${next.ms.toFixed(1)} / Mb ${next.mb.toFixed(1)} / ML ${next.md.toFixed(1)})`,
      });
    }

    changes.push({
      category: 'phases',
      label: 'Phase Picks',
      detail: `${next.activePhases} active P/S phases across ${next.totalStations} seismic stations`,
    });

    if (next.cityLabel || next.townLabel || next.generatorLabel) {
      const locParts = [
        next.cityLabel ? `City: ${next.cityLabel}` : '',
        next.townLabel ? `Town: ${next.townLabel}` : '',
        next.generatorLabel ? `Fault: ${next.generatorLabel}` : '',
      ].filter(Boolean);
      changes.push({
        category: 'places',
        label: 'Nearest Places',
        detail: locParts.join(' · '),
      });
    }

    if (next.intensities.length > 0) {
      const topIntensities = next.intensities
        .slice(0, 3)
        .map(
          (i) =>
            `${i.category === 'instrumental' ? 'Instrumental ' : ''}PEIS ${i.peis} (${i.locality})`
        )
        .join(', ');
      changes.push({
        category: 'intensity',
        label: 'Reported Intensities',
        detail: `${next.intensities.length} report${next.intensities.length === 1 ? '' : 's'}: ${topIntensities}${next.intensities.length > 3 ? ` +${next.intensities.length - 3} more` : ''}`,
      });
    }

    changes.push({
      category: 'bulletin',
      label: 'Bulletin Metadata',
      detail: `${bulletinTag} · Origin Type ${next.originType} · Tsunami: ${next.tsunamiStatus} · Issued by ${next.issuedBy || 'SOEPD'}`,
    });

    const summary =
      options?.trigger === 'backfill'
        ? `Baseline ${bulletinTag} indexed from saved .eqp (${next.lat.toFixed(3)}°N, ${next.lon.toFixed(3)}°E · ${formatMagnitudeValue(next)})`
        : `Initial ${bulletinTag} recorded (${unlocated ? 'Unlocated' : `${next.lat.toFixed(3)}°N, ${next.lon.toFixed(3)}°E · ${formatMagnitudeValue(next)}`})`;

    return { summary, changes };
  }

  const prev = toSnapshot(prevInput);
  const changes: EqpChangeItem[] = [];

  // 1. Origin Date / Time
  if (
    prev.originDateGmt !== next.originDateGmt ||
    prev.originTimeGmt !== next.originTimeGmt
  ) {
    changes.push({
      category: 'metadata',
      label: 'Origin Time (GMT)',
      detail: `${prev.originDateGmt} ${prev.originTimeGmt} -> ${next.originDateGmt} ${next.originTimeGmt}`,
    });
  }

  // 2. Hypocenter / Depth / RMS / Iterations
  const prevUnlocated = prev.iterations === 0 && prev.lat === 0 && prev.lon === 0;
  const nextUnlocated = next.iterations === 0 && next.lat === 0 && next.lon === 0;

  if (prevUnlocated && !nextUnlocated) {
    changes.push({
      category: 'hypocenter',
      label: 'Hypocenter Solved',
      detail: `Unlocated -> ${next.lat.toFixed(3)}°N, ${next.lon.toFixed(3)}°E (Depth ${next.depthKm.toFixed(1)} km)`,
    });
  } else if (
    Math.abs(prev.lat - next.lat) >= 0.001 ||
    Math.abs(prev.lon - next.lon) >= 0.001
  ) {
    const shiftKm = haversineDistanceKm(prev.lat, prev.lon, next.lat, next.lon);
    changes.push({
      category: 'hypocenter',
      label: 'Epicenter Shift',
      detail: `${prev.lat.toFixed(3)}°N, ${prev.lon.toFixed(3)}°E -> ${next.lat.toFixed(3)}°N, ${next.lon.toFixed(3)}°E (${shiftKm.toFixed(1)} km)`,
    });
  }

  if (Math.abs(prev.depthKm - next.depthKm) >= 0.05) {
    changes.push({
      category: 'hypocenter',
      label: 'Depth Updated',
      detail: `${prev.depthKm.toFixed(1)} km -> ${next.depthKm.toFixed(1)} km`,
    });
  }

  if (Math.abs(prev.rmsSec - next.rmsSec) >= 0.01) {
    changes.push({
      category: 'hypocenter',
      label: 'RMS Residual',
      detail: `${prev.rmsSec.toFixed(2)}s -> ${next.rmsSec.toFixed(2)}s`,
    });
  }

  if (Math.abs(prev.errKm - next.errKm) >= 0.05) {
    changes.push({
      category: 'hypocenter',
      label: 'Error Ellipse',
      detail: `±${prev.errKm.toFixed(2)} km -> ±${next.errKm.toFixed(2)} km`,
    });
  }

  // 3. Magnitudes
  if (prev.preferredScale !== next.preferredScale) {
    changes.push({
      category: 'magnitude',
      label: 'Preferred Scale',
      detail: `${formatScaleName(prev.preferredScale)} -> ${formatScaleName(next.preferredScale)}`,
    });
  }
  if (
    (prev.magnitudeMethodId ?? 'eqp-legacy-ms') !==
    (next.magnitudeMethodId ?? 'eqp-legacy-ms')
  ) {
    changes.push({
      category: 'magnitude',
      label: 'Preferred Magnitude Method',
      detail: `${prev.magnitudeMethodId ?? 'eqp-legacy-ms'} -> ${next.magnitudeMethodId ?? 'eqp-legacy-ms'}`,
    });
  } else if (
    next.magnitudeMethodId &&
    next.magnitudeMethodId !== 'eqp-legacy-ms' &&
    prev.magnitudeValue !== next.magnitudeValue
  ) {
    changes.push({
      category: 'magnitude',
      label: `Preferred (${next.magnitudeScale || next.magnitudeMethodId})`,
      detail: `${prev.magnitudeValue != null ? prev.magnitudeValue.toFixed(1) : 'Pending'} -> ${next.magnitudeValue != null ? next.magnitudeValue.toFixed(1) : 'Pending'}`,
    });
  }
  if (Math.abs(prev.ms - next.ms) >= 0.05) {
    changes.push({
      category: 'magnitude',
      label: 'Surface Magnitude (Ms)',
      detail: `${prev.ms.toFixed(1)} -> ${next.ms.toFixed(1)}`,
    });
  }
  if (Math.abs(prev.mb - next.mb) >= 0.05) {
    changes.push({
      category: 'magnitude',
      label: 'Body Magnitude (Mb)',
      detail: `${prev.mb.toFixed(1)} -> ${next.mb.toFixed(1)}`,
    });
  }
  if (Math.abs(prev.md - next.md) >= 0.05) {
    changes.push({
      category: 'magnitude',
      label: 'Duration/Local Mag (ML — EQP Legacy)',
      detail: `${prev.md.toFixed(1)} -> ${next.md.toFixed(1)}`,
    });
  }

  // 4. Station Phase Picks
  const prevPicks = indexPicksByKey(prev.picks);
  const nextPicks = indexPicksByKey(next.picks);

  const addedStations: string[] = [];
  const removedStations: string[] = [];
  const phaseChanges: EqpChangeItem[] = [];

  for (const [key, np] of nextPicks.entries()) {
    const pp = prevPicks.get(key);
    if (!pp) {
      const parts = [
        np.pTime ? `P ${np.pExcluded ? '*' : ''}${np.pTime}` : '',
        np.sTime ? `S ${np.sExcluded ? '*' : ''}${np.sTime}` : '',
        np.duration != null ? `Dur ${np.duration}s` : '',
      ].filter(Boolean);
      addedStations.push(`${key}${parts.length ? ` (${parts.join(', ')})` : ''}`);
      continue;
    }

    if (pp.pTime !== np.pTime) {
      phaseChanges.push({
        category: 'phases',
        label: `${key} P-Arrival`,
        detail: `${pp.pTime || '—'} -> ${np.pTime || '—'}`,
      });
    }
    if (pp.pExcluded !== np.pExcluded) {
      phaseChanges.push({
        category: 'phases',
        label: `${key} P Weight Flag`,
        detail: np.pExcluded ? 'Included -> Excluded (*)' : 'Excluded (*) -> Re-included',
      });
    }
    if (pp.sTime !== np.sTime) {
      phaseChanges.push({
        category: 'phases',
        label: `${key} S-Arrival`,
        detail: `${pp.sTime || '—'} -> ${np.sTime || '—'}`,
      });
    }
    if (pp.sExcluded !== np.sExcluded) {
      phaseChanges.push({
        category: 'phases',
        label: `${key} S Weight Flag`,
        detail: np.sExcluded ? 'Included -> Excluded (*)' : 'Excluded (*) -> Re-included',
      });
    }
    if ((pp.duration ?? null) !== (np.duration ?? null)) {
      phaseChanges.push({
        category: 'phases',
        label: `${key} Coda Duration`,
        detail: `${pp.duration != null ? `${pp.duration}s` : '—'} -> ${np.duration != null ? `${np.duration}s` : '—'}`,
      });
    }
    if ((pp.amplitude ?? null) !== (np.amplitude ?? null)) {
      phaseChanges.push({
        category: 'phases',
        label: `${key} Amplitude`,
        detail: `${pp.amplitude != null ? pp.amplitude : '—'} -> ${np.amplitude != null ? np.amplitude : '—'}`,
      });
    }
    if (pp.polarity !== np.polarity) {
      phaseChanges.push({
        category: 'phases',
        label: `${key} Polarity`,
        detail: `${pp.polarity || '—'} -> ${np.polarity || '—'}`,
      });
    }
    if (pp.quality !== np.quality && options?.trigger !== 'backfill') {
      phaseChanges.push({
        category: 'phases',
        label: `${key} Quality Weight`,
        detail: `${pp.quality} -> ${np.quality}`,
      });
    }
  }

  for (const key of prevPicks.keys()) {
    if (!nextPicks.has(key)) {
      removedStations.push(key);
    }
  }

  if (addedStations.length > 0) {
    changes.push({
      category: 'phases',
      label: `Added Station${addedStations.length > 1 ? 's' : ''} (+${addedStations.length})`,
      detail: addedStations.slice(0, 6).join(', ') + (addedStations.length > 6 ? ` +${addedStations.length - 6} more` : ''),
    });
  }
  if (removedStations.length > 0) {
    changes.push({
      category: 'phases',
      label: `Removed Station${removedStations.length > 1 ? 's' : ''} (-${removedStations.length})`,
      detail: removedStations.slice(0, 6).join(', ') + (removedStations.length > 6 ? ` +${removedStations.length - 6} more` : ''),
    });
  }
  if (phaseChanges.length <= 8) {
    changes.push(...phaseChanges);
  } else {
    changes.push(...phaseChanges.slice(0, 6));
    changes.push({
      category: 'phases',
      label: 'Additional Phase Edits',
      detail: `+${phaseChanges.length - 6} more station phase/weight adjustments`,
    });
  }

  // 5. Nearest Places / Bearing
  if (prev.cityLabel !== next.cityLabel && (prev.cityLabel || next.cityLabel)) {
    changes.push({
      category: 'places',
      label: 'Nearest City',
      detail: `${prev.cityLabel || 'None'} -> ${next.cityLabel || 'None'}`,
    });
  }
  if (prev.townLabel !== next.townLabel && (prev.townLabel || next.townLabel)) {
    changes.push({
      category: 'places',
      label: 'Nearest Town',
      detail: `${prev.townLabel || 'None'} -> ${next.townLabel || 'None'}`,
    });
  }
  if (prev.generatorLabel !== next.generatorLabel && (prev.generatorLabel || next.generatorLabel)) {
    changes.push({
      category: 'places',
      label: 'Fault Generator',
      detail: `${prev.generatorLabel || 'None'} -> ${next.generatorLabel || 'None'}`,
    });
  }
  if (prev.primaryHeadline !== next.primaryHeadline) {
    changes.push({
      category: 'places',
      label: 'Bulletin Headline Target',
      detail: `${prev.primaryHeadline === 'city' ? 'City' : 'Town'} -> ${next.primaryHeadline === 'city' ? 'City' : 'Town'}`,
    });
  }
  if (
    prev.centralOfficeBearing !== next.centralOfficeBearing &&
    !changes.some((c) => c.label === 'Epicenter Shift' || c.label === 'Hypocenter Solved') &&
    (prev.centralOfficeBearing || next.centralOfficeBearing)
  ) {
    changes.push({
      category: 'places',
      label: 'Central Office Bearing',
      detail: `${prev.centralOfficeBearing || '—'} -> ${next.centralOfficeBearing || '—'}`,
    });
  }

  // 6. Felt & Instrumental Intensities (PEIS)
  const intKey = (i: EqpIntensitySnapshot) =>
    `${i.category === 'instrumental' ? 'instrumental' : 'felt'}::${i.locality.toLowerCase()}`;
  const prevIntMap = new Map(prev.intensities.map((i) => [intKey(i), i]));
  const nextIntMap = new Map(next.intensities.map((i) => [intKey(i), i]));

  for (const ni of next.intensities) {
    const typeLabel =
      ni.category === 'instrumental' ? 'Instrumental Intensity' : 'Felt Intensity';
    const pi = prevIntMap.get(intKey(ni));
    if (!pi) {
      changes.push({
        category: 'intensity',
        label: `Added ${typeLabel}`,
        detail: `+ ${ni.category === 'instrumental' ? '[Instr] ' : ''}PEIS ${ni.peis} - ${ni.locality}`,
      });
    } else if (pi.peis !== ni.peis) {
      changes.push({
        category: 'intensity',
        label: `Updated ${typeLabel}`,
        detail: `${ni.locality}: PEIS ${pi.peis} -> PEIS ${ni.peis}`,
      });
    }
  }
  for (const pi of prev.intensities) {
    if (!nextIntMap.has(intKey(pi))) {
      const typeLabel =
        pi.category === 'instrumental' ? 'Instrumental Intensity' : 'Felt Intensity';
      changes.push({
        category: 'intensity',
        label: `Removed ${typeLabel}`,
        detail: `- ${pi.category === 'instrumental' ? '[Instr] ' : ''}PEIS ${pi.peis} - ${pi.locality}`,
      });
    }
  }

  // 7. Bulletin & Advisories
  if (prev.bulletinNo !== next.bulletinNo) {
    const prevFelt = prev.intensities.length > 0 ? 'F' : '';
    changes.push({
      category: 'bulletin',
      label: 'Bulletin Number',
      detail: `B${prev.bulletinNo}${prevFelt} -> ${bulletinTag}`,
    });
  }
  if (prev.tsunamiStatus !== next.tsunamiStatus) {
    changes.push({
      category: 'bulletin',
      label: 'Tsunami Advisory',
      detail: `${prev.tsunamiStatus} -> ${next.tsunamiStatus}`,
    });
  }
  if (prev.expectingDamage !== next.expectingDamage) {
    changes.push({
      category: 'bulletin',
      label: 'Expecting Damage',
      detail: `${prev.expectingDamage ? 'Yes' : 'No'} -> ${next.expectingDamage ? 'Yes' : 'No'}`,
    });
  }
  if (prev.expectingAftershocks !== next.expectingAftershocks) {
    changes.push({
      category: 'bulletin',
      label: 'Expecting Aftershocks',
      detail: `${prev.expectingAftershocks ? 'Yes' : 'No'} -> ${next.expectingAftershocks ? 'Yes' : 'No'}`,
    });
  }
  if (prev.originType !== next.originType) {
    changes.push({
      category: 'bulletin',
      label: 'Origin Type',
      detail: `${prev.originType} -> ${next.originType}`,
    });
  }
  if (prev.webPublished !== next.webPublished) {
    changes.push({
      category: 'bulletin',
      label: 'Web Portal Status',
      detail: `${prev.webPublished ? 'Published' : 'Draft'} -> ${next.webPublished ? 'Published' : 'Draft'}`,
    });
  }
  if (prev.issuedBy !== next.issuedBy && (prev.issuedBy || next.issuedBy)) {
    changes.push({
      category: 'metadata',
      label: 'Issued By',
      detail: `${prev.issuedBy || '—'} -> ${next.issuedBy || '—'}`,
    });
  }
  if (prev.remarks !== next.remarks) {
    changes.push({
      category: 'bulletin',
      label: 'Bulletin Remarks',
      detail: next.remarks
        ? prev.remarks
          ? `Updated: "${next.remarks.slice(0, 90)}${next.remarks.length > 90 ? '…' : ''}"`
          : `Added: "${next.remarks.slice(0, 90)}${next.remarks.length > 90 ? '…' : ''}"`
        : 'Cleared remarks text',
    });
  }
  if (prev.bulletinNote1 !== next.bulletinNote1 || prev.bulletinNote2 !== next.bulletinNote2) {
    changes.push({
      category: 'bulletin',
      label: 'Bulletin Notes',
      detail: 'Updated bulletin advisory notes',
    });
  }

  const prevAmpCount = prev.amplitudeMeasurementCount ?? 0;
  const nextAmpCount = next.amplitudeMeasurementCount ?? 0;
  if (
    prevAmpCount !== nextAmpCount ||
    (prev.structuredAmplitudeDigest ?? '') !== (next.structuredAmplitudeDigest ?? '')
  ) {
    changes.push({
      category: 'phases',
      label: 'Structured Amplitudes',
      detail: `${prevAmpCount} -> ${nextAmpCount} structured measurement${nextAmpCount === 1 ? '' : 's'}`,
    });
  }

  // Summary generation
  if (changes.length === 0) {
    const notePart = options?.note ? ` — ${options.note}` : '';
    return {
      summary: `${bulletinTag} saved checkpoint (${next.lat.toFixed(3)}°N, ${next.lon.toFixed(3)}°E · ${formatMagnitudeValue(next)})${notePart}`,
      changes,
    };
  }

  const headlineItems = changes.slice(0, 3).map((c) => {
    if (c.category === 'hypocenter' && c.label === 'Epicenter Shift') {
      const m = c.detail.match(/\(([^)]+)\)$/);
      return m ? `Epicenter shifted ${m[1]}` : c.label;
    }
    if (c.category === 'hypocenter' && c.label === 'Depth Updated') {
      return `Depth ${c.detail}`;
    }
    if (c.category === 'magnitude') {
      const m = c.label.match(/\(([^)]+)\)/);
      const shortMag = m ? m[1] : c.label;
      return `${shortMag} ${c.detail}`;
    }
    if (c.category === 'intensity') {
      return c.detail;
    }
    if (c.category === 'bulletin' && c.label === 'Bulletin Number') {
      return c.detail;
    }
    return `${c.label}: ${c.detail}`;
  });
  const extraCount = changes.length > 3 ? ` (+${changes.length - 3} more)` : '';
  const summary = `${bulletinTag}: ${headlineItems.join(' · ')}${extraCount}`;

  return { summary, changes };
}
