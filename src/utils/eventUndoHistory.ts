import type {
  AmplitudeAssociationIssue,
  AmplitudeMeasurement,
  EarthquakeOriginType,
  EQPEvent,
  EventLocationMetadata,
  MagnitudeHistoryEntry,
  MagnitudeScale,
  PlaceCandidate,
  StationPick,
} from '../data/eqpData';
import { cloneAmplitudeMeasurement } from './amplitudeMeasurements';

export const MAX_EVENT_UNDO_STEPS = 10;
export const DEFAULT_UNDO_COALESCE_MS = 1200;

export interface EventPickAndOriginSnapshot {
  originDateGmt: string;
  originTimeGmt: string;
  originDateLst: string;
  originTimeLst: string;
  lat: number;
  lon: number;
  depthKm: number;
  trialDepthKm: number;
  iterations: number;
  errLatDeg: number;
  errLonDeg: number;
  errKm: number;
  errSec?: number;
  rmsSec: number;
  preferredScale: MagnitudeScale;
  ms: number;
  mb: number;
  md: number;
  originType?: EarthquakeOriginType;
  locationMetadata?: EventLocationMetadata;
  magnitudeHistory: MagnitudeHistoryEntry[];
  centralOfficeBearing: string;
  cities: PlaceCandidate[];
  selectedCityId: string;
  towns: PlaceCandidate[];
  selectedTownId: string;
  primaryHeadline: 'city' | 'town';
  generators: PlaceCandidate[];
  selectedGeneratorId: string;
  issuedDate: string;
  issuedTime: string;
  picks: StationPick[];
  amplitudeMeasurements?: AmplitudeMeasurement[];
  amplitudeAssociationIssues?: AmplitudeAssociationIssue[];
}

export interface EventUndoEntry {
  id: string;
  eventId: string;
  label: string;
  timestamp: number;
  coalesceKey?: string;
  before: EventPickAndOriginSnapshot;
}

export function cloneStationPick(pick: StationPick): StationPick {
  return {
    ...pick,
    ...(pick.atlasMetadata
      ? {
          atlasMetadata: {
            ...pick.atlasMetadata,
            rawLines: [...pick.atlasMetadata.rawLines],
          },
        }
      : {}),
  };
}

export function extractEventPickAndOriginSnapshot(
  event: EQPEvent
): EventPickAndOriginSnapshot {
  return {
    originDateGmt: event.originDateGmt,
    originTimeGmt: event.originTimeGmt,
    originDateLst: event.originDateLst,
    originTimeLst: event.originTimeLst,
    lat: event.lat,
    lon: event.lon,
    depthKm: event.depthKm,
    trialDepthKm: event.trialDepthKm,
    iterations: event.iterations,
    errLatDeg: event.errLatDeg,
    errLonDeg: event.errLonDeg,
    errKm: event.errKm,
    ...(event.errSec !== undefined ? { errSec: event.errSec } : {}),
    rmsSec: event.rmsSec,
    preferredScale: event.preferredScale,
    ms: event.ms,
    mb: event.mb,
    md: event.md,
    ...(event.originType !== undefined ? { originType: event.originType } : {}),
    ...(event.locationMetadata
      ? { locationMetadata: { ...event.locationMetadata } }
      : {}),
    magnitudeHistory: event.magnitudeHistory.map((h) => ({ ...h })),
    centralOfficeBearing: event.centralOfficeBearing,
    cities: event.cities.map((c) => ({ ...c })),
    selectedCityId: event.selectedCityId,
    towns: event.towns.map((t) => ({ ...t })),
    selectedTownId: event.selectedTownId,
    primaryHeadline: event.primaryHeadline,
    generators: event.generators.map((g) => ({ ...g })),
    selectedGeneratorId: event.selectedGeneratorId,
    issuedDate: event.issuedDate,
    issuedTime: event.issuedTime,
    picks: event.picks.map(cloneStationPick),
    ...(event.amplitudeMeasurements
      ? {
          amplitudeMeasurements: event.amplitudeMeasurements.map(
            cloneAmplitudeMeasurement
          ),
        }
      : {}),
    ...(event.amplitudeAssociationIssues
      ? {
          amplitudeAssociationIssues: event.amplitudeAssociationIssues.map(
            (iss) => ({ ...iss })
          ),
        }
      : {}),
  };
}

export function arePickAndOriginSnapshotsEqual(
  a: EventPickAndOriginSnapshot,
  b: EventPickAndOriginSnapshot
): boolean {
  if (
    a.originDateGmt !== b.originDateGmt ||
    a.originTimeGmt !== b.originTimeGmt ||
    a.originDateLst !== b.originDateLst ||
    a.originTimeLst !== b.originTimeLst ||
    a.lat !== b.lat ||
    a.lon !== b.lon ||
    a.depthKm !== b.depthKm ||
    a.trialDepthKm !== b.trialDepthKm ||
    a.iterations !== b.iterations ||
    a.errLatDeg !== b.errLatDeg ||
    a.errLonDeg !== b.errLonDeg ||
    a.errKm !== b.errKm ||
    a.errSec !== b.errSec ||
    a.rmsSec !== b.rmsSec ||
    a.preferredScale !== b.preferredScale ||
    a.ms !== b.ms ||
    a.mb !== b.mb ||
    a.md !== b.md ||
    a.originType !== b.originType
  ) {
    return false;
  }

  if (a.picks.length !== b.picks.length) return false;
  for (let i = 0; i < a.picks.length; i += 1) {
    const pa = a.picks[i];
    const pb = b.picks[i];
    if (
      pa.id !== pb.id ||
      pa.sta !== pb.sta ||
      pa.pTime !== pb.pTime ||
      pa.pExcluded !== pb.pExcluded ||
      pa.sTime !== pb.sTime ||
      pa.sExcluded !== pb.sExcluded ||
      pa.duration !== pb.duration ||
      pa.amplitude !== pb.amplitude ||
      pa.polarity !== pb.polarity ||
      pa.quality !== pb.quality ||
      pa.lat !== pb.lat ||
      pa.lon !== pb.lon ||
      pa.toa !== pb.toa ||
      pa.azim !== pb.azim ||
      pa.delta !== pb.delta ||
      pa.resP !== pb.resP ||
      pa.resS !== pb.resS ||
      pa.obsP !== pb.obsP ||
      pa.obsS !== pb.obsS ||
      pa.calcP !== pb.calcP ||
      pa.calcS !== pb.calcS ||
      pa.ms !== pb.ms ||
      pa.mb !== pb.mb ||
      pa.md !== pb.md ||
      pa.magExcluded !== pb.magExcluded
    ) {
      return false;
    }
  }

  if (
    JSON.stringify(a.locationMetadata ?? null) !==
      JSON.stringify(b.locationMetadata ?? null) ||
    JSON.stringify(a.magnitudeHistory) !== JSON.stringify(b.magnitudeHistory) ||
    JSON.stringify(a.amplitudeMeasurements ?? []) !==
      JSON.stringify(b.amplitudeMeasurements ?? []) ||
    JSON.stringify(a.amplitudeAssociationIssues ?? []) !==
      JSON.stringify(b.amplitudeAssociationIssues ?? [])
  ) {
    return false;
  }

  return true;
}

export interface PushUndoOptions {
  label?: string;
  coalesceKey?: string;
  nowMs?: number;
  coalesceWindowMs?: number;
  maxSteps?: number;
}

export function inferUndoChangeLabel(
  prev: EQPEvent,
  next: EQPEvent
): string {
  if (prev.picks.length < next.picks.length) {
    const prevIds = new Set(prev.picks.map((p) => p.id));
    const added = next.picks.filter((p) => !prevIds.has(p.id));
    if (added.length === 1) {
      return `Add station ${added[0].sta || 'pick'}`;
    }
    return `Add ${added.length} station picks`;
  }
  if (prev.picks.length > next.picks.length) {
    const nextIds = new Set(next.picks.map((p) => p.id));
    const removed = prev.picks.filter((p) => !nextIds.has(p.id));
    if (removed.length === 1) {
      return `Remove station ${removed[0].sta || 'pick'}`;
    }
    return `Remove ${removed.length} station picks`;
  }
  if (
    prev.lat !== next.lat ||
    prev.lon !== next.lon ||
    prev.depthKm !== next.depthKm ||
    prev.iterations !== next.iterations
  ) {
    return 'Update hypocenter origin parameters';
  }
  if (prev.trialDepthKm !== next.trialDepthKm) {
    return `Change trial depth (${next.trialDepthKm.toFixed(1)} km)`;
  }
  if (
    prev.originDateGmt !== next.originDateGmt ||
    prev.originTimeGmt !== next.originTimeGmt
  ) {
    return 'Update origin time';
  }
  if (prev.originType !== next.originType) {
    return `Change origin type (${next.originType ?? 'TECTONIC'})`;
  }
  if (prev.preferredScale !== next.preferredScale) {
    return `Change magnitude scale (${next.preferredScale === 'Md' ? 'ML' : next.preferredScale})`;
  }
  if (prev.ms !== next.ms || prev.mb !== next.mb || prev.md !== next.md) {
    return 'Update magnitude parameters';
  }
  for (let i = 0; i < prev.picks.length; i += 1) {
    const pa = prev.picks[i];
    const pb = next.picks[i];
    if (!pb || pa.id !== pb.id) break;
    if (pa.pExcluded !== pb.pExcluded) {
      return `${pb.pExcluded ? 'Exclude' : 'Include'} P phase (${pb.sta})`;
    }
    if (pa.sExcluded !== pb.sExcluded) {
      return `${pb.sExcluded ? 'Exclude' : 'Include'} S phase (${pb.sta})`;
    }
    if (pa.pTime !== pb.pTime) return `Edit P arrival (${pb.sta})`;
    if (pa.sTime !== pb.sTime) return `Edit S arrival (${pb.sta})`;
    if (pa.duration !== pb.duration) return `Edit duration (${pb.sta})`;
    if (pa.amplitude !== pb.amplitude) return `Edit amplitude (${pb.sta})`;
    if (pa.quality !== pb.quality) return `Change quality ${pb.quality} (${pb.sta})`;
    if (pa.polarity !== pb.polarity) return `Change polarity (${pb.sta})`;
    if (pa.sta !== pb.sta) return `Rename station ${pa.sta || 'row'} → ${pb.sta}`;
  }
  if (
    JSON.stringify(prev.amplitudeMeasurements ?? []) !==
    JSON.stringify(next.amplitudeMeasurements ?? [])
  ) {
    const prevCount = prev.amplitudeMeasurements?.length ?? 0;
    const nextCount = next.amplitudeMeasurements?.length ?? 0;
    if (nextCount > prevCount) return 'Add structured amplitude measurement';
    if (nextCount < prevCount) return 'Remove structured amplitude measurement';
    return 'Edit structured amplitude measurement';
  }
  return 'Edit event picks or origin';
}

export function pushEventUndoEntry(
  stack: EventUndoEntry[],
  prevEvent: EQPEvent,
  nextEvent: EQPEvent,
  options: PushUndoOptions = {}
): EventUndoEntry[] {
  if (prevEvent.id !== nextEvent.id) return stack;

  const beforeSnap = extractEventPickAndOriginSnapshot(prevEvent);
  const afterSnap = extractEventPickAndOriginSnapshot(nextEvent);
  if (arePickAndOriginSnapshotsEqual(beforeSnap, afterSnap)) {
    return stack;
  }

  const now = options.nowMs ?? Date.now();
  const maxSteps = Math.max(1, options.maxSteps ?? MAX_EVENT_UNDO_STEPS);
  const coalesceWindowMs = options.coalesceWindowMs ?? DEFAULT_UNDO_COALESCE_MS;
  const label = options.label ?? inferUndoChangeLabel(prevEvent, nextEvent);

  const top = stack[stack.length - 1];
  if (
    options.coalesceKey &&
    top &&
    top.eventId === prevEvent.id &&
    top.coalesceKey === options.coalesceKey &&
    now - top.timestamp <= coalesceWindowMs
  ) {
    // Keep the earliest `before` snapshot for this typing burst, refreshing label & timestamp
    const updatedTop: EventUndoEntry = {
      ...top,
      label,
      timestamp: now,
    };
    return [...stack.slice(0, -1), updatedTop];
  }

  const entry: EventUndoEntry = {
    id: `undo-${now}-${Math.random().toString(36).slice(2, 7)}`,
    eventId: prevEvent.id,
    label,
    timestamp: now,
    ...(options.coalesceKey ? { coalesceKey: options.coalesceKey } : {}),
    before: beforeSnap,
  };

  const nextStack = [...stack, entry];
  return nextStack.length > maxSteps
    ? nextStack.slice(nextStack.length - maxSteps)
    : nextStack;
}

export function applyEventUndoSnapshot(
  currentEvent: EQPEvent,
  snapshot: EventPickAndOriginSnapshot
): EQPEvent {
  return {
    ...currentEvent,
    originDateGmt: snapshot.originDateGmt,
    originTimeGmt: snapshot.originTimeGmt,
    originDateLst: snapshot.originDateLst,
    originTimeLst: snapshot.originTimeLst,
    lat: snapshot.lat,
    lon: snapshot.lon,
    depthKm: snapshot.depthKm,
    trialDepthKm: snapshot.trialDepthKm,
    iterations: snapshot.iterations,
    errLatDeg: snapshot.errLatDeg,
    errLonDeg: snapshot.errLonDeg,
    errKm: snapshot.errKm,
    errSec: snapshot.errSec,
    rmsSec: snapshot.rmsSec,
    preferredScale: snapshot.preferredScale,
    ms: snapshot.ms,
    mb: snapshot.mb,
    md: snapshot.md,
    originType: snapshot.originType,
    locationMetadata: snapshot.locationMetadata
      ? { ...snapshot.locationMetadata }
      : undefined,
    magnitudeHistory: snapshot.magnitudeHistory.map((h) => ({ ...h })),
    centralOfficeBearing: snapshot.centralOfficeBearing,
    cities: snapshot.cities.map((c) => ({ ...c })),
    selectedCityId: snapshot.selectedCityId,
    towns: snapshot.towns.map((t) => ({ ...t })),
    selectedTownId: snapshot.selectedTownId,
    primaryHeadline: snapshot.primaryHeadline,
    generators: snapshot.generators.map((g) => ({ ...g })),
    selectedGeneratorId: snapshot.selectedGeneratorId,
    issuedDate: snapshot.issuedDate,
    issuedTime: snapshot.issuedTime,
    picks: snapshot.picks.map(cloneStationPick),
    amplitudeMeasurements: (snapshot.amplitudeMeasurements ?? []).map(
      cloneAmplitudeMeasurement
    ),
    amplitudeAssociationIssues: snapshot.amplitudeAssociationIssues?.map(
      (iss) => ({ ...iss })
    ),
  };
}

export function popEventUndoEntry(
  stack: EventUndoEntry[],
  currentEvent: EQPEvent
): {
  restoredEvent: EQPEvent;
  undoneEntry: EventUndoEntry;
  remainingStack: EventUndoEntry[];
} | null {
  if (stack.length === 0) return null;
  const undoneEntry = stack[stack.length - 1];
  const remainingStack = stack.slice(0, -1);
  const restoredEvent = applyEventUndoSnapshot(currentEvent, undoneEntry.before);
  return {
    restoredEvent,
    undoneEntry,
    remainingStack,
  };
}
