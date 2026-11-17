import type { EQPEvent, MagnitudeScale, SolverEngine, StationPick } from '../data/eqpData.ts';

export interface StationDurationMagRow {
  pickId: string;
  index: number;
  sta: string;
  td: number;
  hd: number;
  ml: number;
  mb: number;
  ms: number;
  included: boolean;
}

export interface DurationOutlierSummary {
  scaleLabel: 'Ms' | 'Mb' | 'Ml';
  eligibleCount: number;
  keptCount: number;
  outlierCount: number;
  meanAll: number;
  stdDev: number;
  filteredMean: number;
  lowerBound: number;
  upperBound: number;
  varianceK: number;
  outlierPickIds: Set<string>;
  zScoreByPickId: Map<string, number>;
}

export function isDurationMagnitudeEligible(pick: StationPick): boolean {
  return (
    pick.pTime.trim() !== '' &&
    !pick.pExcluded &&
    pick.duration !== null &&
    pick.duration !== undefined &&
    Number.isFinite(pick.duration) &&
    pick.duration > 0
  );
}

export function computeDurationMagnitudes(
  td: number,
  deltaDeg: number,
  depthKm: number
): { hd: number; ml: number; mb: number; ms: number } {
  const safeTd = Math.max(1, td);
  const depthDeg = Math.max(0, depthKm) / 111.32;
  const hd = Number(Math.hypot(Math.max(0.05, deltaDeg), depthDeg).toFixed(2));
  const ml = Number((3.24 * Math.log10(safeTd) + 0.0005 * hd - 3.49).toFixed(2));
  const mb = Number((0.865 * ml + 1.6).toFixed(2));
  const ms = Number((1.38 * ml - 1.44).toFixed(2));
  return { hd, ml, mb, ms };
}

export function computePickDurationMagnitudes(
  pick: StationPick,
  depthKm: number
): { hd: number; ml: number; mb: number; ms: number } | null {
  if (!isDurationMagnitudeEligible(pick)) return null;
  const td = Math.round(pick.duration as number);
  return computeDurationMagnitudes(td, pick.delta, depthKm);
}

export function computeDurationOutlierSummary(
  rows: ReadonlyArray<Pick<StationDurationMagRow, 'pickId' | 'ml' | 'mb' | 'ms'>>,
  scale: MagnitudeScale,
  varianceK: number
): DurationOutlierSummary {
  const scaleLabel: 'Ms' | 'Mb' | 'Ml' =
    scale === 'Ms' ? 'Ms' : scale === 'Mb' ? 'Mb' : 'Ml';
  const safeK = Number.isFinite(varianceK) && varianceK > 0 ? varianceK : 1.5;

  if (rows.length === 0) {
    return {
      scaleLabel,
      eligibleCount: 0,
      keptCount: 0,
      outlierCount: 0,
      meanAll: 0,
      stdDev: 0,
      filteredMean: 0,
      lowerBound: 0,
      upperBound: 0,
      varianceK: safeK,
      outlierPickIds: new Set<string>(),
      zScoreByPickId: new Map<string, number>(),
    };
  }

  const values = rows.map((row) => {
    const rawVal = scale === 'Ms' ? row.ms : scale === 'Mb' ? row.mb : row.ml;
    return {
      pickId: row.pickId,
      val: Number(rawVal.toFixed(1)),
    };
  });

  const meanAll = values.reduce((sum, item) => sum + item.val, 0) / values.length;
  const variance =
    values.reduce((sum, item) => sum + Math.pow(item.val - meanAll, 2), 0) /
    values.length;
  const stdDev = Math.sqrt(variance);

  const outlierPickIds = new Set<string>();
  const zScoreByPickId = new Map<string, number>();
  const kept: number[] = [];

  for (const item of values) {
    const diff = Math.abs(item.val - meanAll);
    const zScore = stdDev > 0 ? Number((diff / stdDev).toFixed(2)) : 0;
    zScoreByPickId.set(item.pickId, zScore);

    if (stdDev > 0.05 && diff > safeK * stdDev) {
      outlierPickIds.add(item.pickId);
    } else {
      kept.push(item.val);
    }
  }

  const filteredMean =
    kept.length > 0 ? kept.reduce((sum, v) => sum + v, 0) / kept.length : meanAll;

  return {
    scaleLabel,
    eligibleCount: values.length,
    keptCount: values.length - outlierPickIds.size,
    outlierCount: outlierPickIds.size,
    meanAll: Number(meanAll.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    filteredMean: Number(filteredMean.toFixed(1)),
    lowerBound: Number((meanAll - safeK * stdDev).toFixed(2)),
    upperBound: Number((meanAll + safeK * stdDev).toFixed(2)),
    varianceK: safeK,
    outlierPickIds,
    zScoreByPickId,
  };
}

export function computeOutlierFilteredScaleMean(
  picks: ReadonlyArray<StationPick>,
  key: 'ms' | 'mb' | 'md',
  varianceK: number,
  fallback: number
): number {
  const eligible = picks.filter(
    (p) => isDurationMagnitudeEligible(p) && p[key] !== null && p.magExcluded !== true
  );
  if (eligible.length === 0) return fallback;

  const scale: MagnitudeScale = key === 'ms' ? 'Ms' : key === 'mb' ? 'Mb' : 'Md';
  const rows = eligible.map((p) => ({
    pickId: p.id,
    ms: p.ms ?? 0,
    mb: p.mb ?? 0,
    ml: p.md ?? 0,
  }));
  return computeDurationOutlierSummary(rows, scale, varianceK).filteredMean;
}

export function applyOutlierFilteredMagnitudeToEvent(
  ev: EQPEvent,
  varianceK: number,
  options?: {
    solverEngine?: SolverEngine;
    createHistoryIfEmpty?: boolean;
    utcTimestamp?: string;
  }
): {
  event: EQPEvent;
  ms: number;
  mb: number;
  md: number;
  meanAll: number;
  stdDev: number;
  filteredMean: number;
  outlierCount: number;
} {
  const pickDurationMap = new Map<
    string,
    { ms: number; mb: number; ml: number }
  >();
  const rows: Array<{ pickId: string; ms: number; mb: number; ml: number }> = [];

  for (const pick of ev.picks) {
    const durMag = computePickDurationMagnitudes(pick, ev.depthKm);
    if (!durMag) continue;
    const rounded = {
      ms: Number(durMag.ms.toFixed(1)),
      mb: Number(durMag.mb.toFixed(1)),
      ml: Number(durMag.ml.toFixed(1)),
    };
    pickDurationMap.set(pick.id, rounded);
    rows.push({
      pickId: pick.id,
      ms: durMag.ms,
      mb: durMag.mb,
      ml: durMag.ml,
    });
  }

  if (rows.length === 0) {
    const nextPicks = ev.picks.map((pick) => ({
      ...pick,
      ms: isDurationMagnitudeEligible(pick) ? pick.ms : null,
      mb: isDurationMagnitudeEligible(pick) ? pick.mb : null,
      md: isDurationMagnitudeEligible(pick) ? pick.md : null,
      magExcluded: undefined,
    }));
    const nextHistory =
      ev.magnitudeHistory.length > 0
        ? ev.magnitudeHistory.map((entry, idx) =>
            idx === ev.magnitudeHistory.length - 1
              ? { ...entry, ms: 0, mb: 0, md: 0 }
              : entry
          )
        : ev.magnitudeHistory;

    return {
      event: {
        ...ev,
        picks: nextPicks,
        ms: 0,
        mb: 0,
        md: 0,
        magnitudeHistory: nextHistory,
      },
      ms: 0,
      mb: 0,
      md: 0,
      meanAll: 0,
      stdDev: 0,
      filteredMean: 0,
      outlierCount: 0,
    };
  }

  const msSummary = computeDurationOutlierSummary(rows, 'Ms', varianceK);
  const mbSummary = computeDurationOutlierSummary(rows, 'Mb', varianceK);
  const mdSummary = computeDurationOutlierSummary(rows, 'Md', varianceK);

  const activeSummary =
    ev.preferredScale === 'Ms'
      ? msSummary
      : ev.preferredScale === 'Mb'
        ? mbSummary
        : mdSummary;

  const nextMs = msSummary.filteredMean;
  const nextMb = mbSummary.filteredMean;
  const nextMd = mdSummary.filteredMean;

  const nextPicks = ev.picks.map((pick) => {
    const computed = pickDurationMap.get(pick.id);
    if (!computed) {
      return {
        ...pick,
        ms: null,
        mb: null,
        md: null,
        magExcluded: undefined,
      };
    }
    return {
      ...pick,
      ms: computed.ms,
      mb: computed.mb,
      md: computed.ml,
      magExcluded: activeSummary.outlierPickIds.has(pick.id),
    };
  });

  const activePhases = nextPicks.reduce(
    (count, p) =>
      count + (p.pTime && !p.pExcluded ? 1 : 0) + (p.sTime && !p.sExcluded ? 1 : 0),
    0
  );

  let nextHistory = ev.magnitudeHistory;
  if (ev.magnitudeHistory.length > 0) {
    nextHistory = ev.magnitudeHistory.map((entry, idx) =>
      idx === ev.magnitudeHistory.length - 1
        ? {
            ...entry,
            ms: nextMs,
            mb: nextMb,
            md: nextMd,
          }
        : entry
    );
  } else if (options?.createHistoryIfEmpty) {
    const now = new Date();
    const utcTimestamp =
      options.utcTimestamp ??
      `${String(now.getUTCHours()).padStart(2, '0')}:${String(
        now.getUTCMinutes()
      ).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
    nextHistory = [
      {
        relocation: 'Reloc #1',
        timestamp: utcTimestamp,
        solver: options.solverEngine ?? 'EQP',
        rmsSec: ev.rmsSec,
        activePhases,
        ms: nextMs,
        mb: nextMb,
        md: nextMd,
      },
    ];
  }

  return {
    event: {
      ...ev,
      picks: nextPicks,
      ms: nextMs,
      mb: nextMb,
      md: nextMd,
      magnitudeHistory: nextHistory,
    },
    ms: nextMs,
    mb: nextMb,
    md: nextMd,
    meanAll: activeSummary.meanAll,
    stdDev: activeSummary.stdDev,
    filteredMean: activeSummary.filteredMean,
    outlierCount: activeSummary.outlierCount,
  };
}

export function buildDurationRowsWithOutlierFilter(
  event: EQPEvent,
  scale: MagnitudeScale,
  varianceK: number,
  options?: {
    autoRejectOutliers?: boolean;
    respectManualOverrides?: boolean;
  }
): {
  rows: StationDurationMagRow[];
  autoRejectActive: boolean;
} {
  const candidates = event.picks.filter(isDurationMagnitudeEligible);
  const autoRejectRequested = options?.autoRejectOutliers ?? true;
  const respectManualOverrides = options?.respectManualOverrides ?? true;

  const baseRows: StationDurationMagRow[] = candidates.map((pick, idx) => {
    const td = Math.round(pick.duration ?? 0);
    const computed = computeDurationMagnitudes(td, pick.delta, event.depthKm);

    return {
      pickId: pick.id,
      index: idx,
      sta: pick.sta,
      td,
      hd: computed.hd,
      ml: computed.ml,
      mb: computed.mb,
      ms: computed.ms,
      included: pick.magExcluded !== true,
    };
  });

  const summary = computeDurationOutlierSummary(baseRows, scale, varianceK);
  const pickById = new Map(candidates.map((p) => [p.id, p]));

  const hasExplicitOutlierInclude =
    respectManualOverrides &&
    baseRows.some((row) => {
      const pick = pickById.get(row.pickId);
      return pick?.magExcluded === false && summary.outlierPickIds.has(row.pickId);
    });

  const autoRejectActive = autoRejectRequested && !hasExplicitOutlierInclude;

  const rows = baseRows.map((row) => {
    const pick = pickById.get(row.pickId);
    if (pick?.magExcluded === true) {
      return { ...row, included: false };
    }
    if (autoRejectActive && summary.outlierPickIds.has(row.pickId)) {
      return { ...row, included: false };
    }
    return row;
  });

  return { rows, autoRejectActive };
}
