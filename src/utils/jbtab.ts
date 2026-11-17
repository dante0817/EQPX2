import { JBTAB_PS_RAW } from '../data/jbtabRaw.ts';

export type JbPhaseType = 'P' | 'S';

export interface JbDepthRow {
  depthKm: number;
  timesSec: number[];
  /** Highest column index with a valid positive travel time (excluding trailing 0.00 shadow-zone sentinels). */
  maxValidCol: number;
}

export interface JbPhaseTable {
  phase: JbPhaseType;
  numDepths: number;
  deltaStartDeg: number;
  deltaStepDeg: number;
  numDistances: number;
  rows: JbDepthRow[];
}

export interface JbTravelTimeTables {
  P: JbPhaseTable;
  S: JbPhaseTable;
}

export type JbLookupFailureStatus =
  | 'invalid_input'
  | 'out_of_depth_range'
  | 'out_of_distance_range'
  | 'unavailable_cell'
  | 'unsupported_phase';

export interface JbLookupResult {
  timeSec: number;
  dTdDeltaDeg: number;
  dTdDepthKm: number;
  toaDeg: number;
  deltaDegClamped: number;
  depthKmClamped: number;
  derivativeDepthValid?: boolean;
  branchLabel?: string;
}

export type JbPredictionResult =
  | ({
      ok: true;
      status: 'ok';
      phase: JbPhaseType;
      deltaDeg: number;
      depthKm: number;
      derivativeDepthValid: boolean;
      branchLabel: string;
    } & JbLookupResult)
  | {
      ok: false;
      status: JbLookupFailureStatus;
      phase: string;
      deltaDeg: number;
      depthKm: number;
      reason: string;
    };

export class JbLookupError extends Error {
  readonly status: JbLookupFailureStatus;
  readonly phase: string;
  readonly deltaDeg: number;
  readonly depthKm: number;

  constructor(
    status: JbLookupFailureStatus,
    reason: string,
    phase: string,
    deltaDeg: number,
    depthKm: number
  ) {
    super(reason);
    this.name = 'JbLookupError';
    this.status = status;
    this.phase = phase;
    this.deltaDeg = deltaDeg;
    this.depthKm = depthKm;
  }
}

const KM_PER_DEG = 111.195;

function isValidTableCell(phase: JbPhaseType, row: JbDepthRow, col: number): boolean {
  if (col < 0 || col >= row.timesSec.length) return false;
  if (col > row.maxValidCol) return false;
  const val = row.timesSec[col];
  if (!Number.isFinite(val)) return false;
  if (val > 0) return true;
  // Exact surface origin (delta = 0 deg, depth = 0 km) has travel time 0.00 s for P.
  return phase === 'P' && row.depthKm === 0 && col === 0 && val === 0;
}

function parsePhaseBlock(
  tokens: string[],
  startIdx: number,
  expectedPhase: JbPhaseType
): { table: JbPhaseTable; nextIdx: number } {
  let idx = startIdx;
  const phaseToken = tokens[idx++]?.toUpperCase();
  if (phaseToken !== expectedPhase) {
    throw new Error(`Expected phase '${expectedPhase}' in JBTAB, got '${phaseToken ?? 'EOF'}'`);
  }

  const numDepths = Number(tokens[idx++]);
  const deltaStartDeg = Number(tokens[idx++]);
  const deltaStepDeg = Number(tokens[idx++]);
  const numDistances = Number(tokens[idx++]);

  if (
    !Number.isFinite(numDepths) ||
    !Number.isFinite(deltaStartDeg) ||
    !Number.isFinite(deltaStepDeg) ||
    !Number.isFinite(numDistances) ||
    numDepths <= 0 ||
    numDistances <= 1
  ) {
    throw new Error(`Invalid JBTAB header for phase ${expectedPhase}`);
  }

  const rows: JbDepthRow[] = [];
  for (let r = 0; r < numDepths; r++) {
    const depthKm = Number(tokens[idx++]);
    if (!Number.isFinite(depthKm)) {
      throw new Error(`Missing depth value for ${expectedPhase} row ${r}`);
    }
    const timesSec: number[] = [];
    let maxValidCol = 0;
    for (let c = 0; c < numDistances; c++) {
      const val = Number(tokens[idx++]);
      if (!Number.isFinite(val)) {
        throw new Error(`Missing travel-time value at ${expectedPhase} depth=${depthKm}, col=${c}`);
      }
      timesSec.push(val);
      if (c === 0 || val > 0) {
        maxValidCol = c;
      }
    }
    rows.push({ depthKm, timesSec, maxValidCol });
  }

  rows.sort((a, b) => a.depthKm - b.depthKm);
  return {
    table: {
      phase: expectedPhase,
      numDepths,
      deltaStartDeg,
      deltaStepDeg,
      numDistances,
      rows,
    },
    nextIdx: idx,
  };
}

export function parseJbtabText(rawText: string): JbTravelTimeTables {
  const tokens = rawText.trim().split(/\s+/);
  if (tokens.length < 10) {
    throw new Error('JBTAB content is empty or malformed');
  }
  const pBlock = parsePhaseBlock(tokens, 0, 'P');
  const sBlock = parsePhaseBlock(tokens, pBlock.nextIdx, 'S');
  return {
    P: pBlock.table,
    S: sBlock.table,
  };
}

let cachedDefaultTables: JbTravelTimeTables | null = null;

export function getDefaultJbTables(): JbTravelTimeTables {
  if (!cachedDefaultTables) {
    cachedDefaultTables = parseJbtabText(JBTAB_PS_RAW);
  }
  return cachedDefaultTables;
}

/**
 * Evaluates Jeffreys-Bullen travel time T(deltaDeg, depthKm), partial derivatives
 * (dT/dDelta in s/deg, dT/dDepth in s/km), and ray takeoff angle (TOA in deg, 0=down, 180=up)
 * via bilinear interpolation over JBTAB.PS without silent out-of-range clamping or
 * shadow-zone interpolation.
 */
export function tryLookupJbTravelTime(
  phase: JbPhaseType,
  deltaDeg: number,
  depthKm: number,
  tables: JbTravelTimeTables = getDefaultJbTables()
): JbPredictionResult {
  if (phase !== 'P' && phase !== 'S') {
    return {
      ok: false,
      status: 'unsupported_phase',
      phase: String(phase),
      deltaDeg,
      depthKm,
      reason: `Unsupported J-B phase '${String(phase)}'; only 'P' and 'S' exist in JBTAB.PS.`,
    };
  }

  if (!Number.isFinite(deltaDeg) || !Number.isFinite(depthKm)) {
    return {
      ok: false,
      status: 'invalid_input',
      phase,
      deltaDeg,
      depthKm,
      reason: `Non-finite J-B lookup coordinates (deltaDeg=${String(deltaDeg)}, depthKm=${String(depthKm)}).`,
    };
  }

  const table = tables[phase];
  const rows = table.rows;
  const minDepth = rows[0].depthKm;
  const maxDepth = rows[rows.length - 1].depthKm;

  if (depthKm < minDepth || depthKm > maxDepth) {
    return {
      ok: false,
      status: 'out_of_depth_range',
      phase,
      deltaDeg,
      depthKm,
      reason: `Source depth ${depthKm} km is outside J-B ${phase} table bounds [${minDepth}, ${maxDepth}] km.`,
    };
  }

  const minDeltaDeg = table.deltaStartDeg;
  const nominalMaxDeltaDeg =
    table.deltaStartDeg + (table.numDistances - 1) * table.deltaStepDeg;

  if (deltaDeg < minDeltaDeg || deltaDeg > nominalMaxDeltaDeg) {
    return {
      ok: false,
      status: 'out_of_distance_range',
      phase,
      deltaDeg,
      depthKm,
      reason: `Epicentral distance ${deltaDeg}° is outside J-B ${phase} table bounds [${minDeltaDeg}, ${nominalMaxDeltaDeg}]°.`,
    };
  }

  // Locate bounding depth rows in this phase's own depth grid
  let exactRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (Math.abs(depthKm - rows[i].depthKm) <= 1e-9) {
      exactRowIdx = i;
      break;
    }
  }

  let zIdx = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    if (depthKm >= rows[i].depthKm && depthKm <= rows[i + 1].depthKm) {
      zIdx = i;
      break;
    }
  }
  if (depthKm >= maxDepth) {
    zIdx = rows.length - 2;
  }

  const floatCol = (deltaDeg - table.deltaStartDeg) / table.deltaStepDeg;
  const maxGridCol = table.numDistances - 1;
  const isExactCol = Math.abs(floatCol - Math.round(floatCol)) <= 1e-9;
  const exactColIdx = isExactCol ? Math.round(floatCol) : -1;

  // Determine distance bracket [cIdx, cIdx + 1] within [0, maxGridCol]
  const cIdx = Math.max(0, Math.min(maxGridCol - 1, Math.floor(floatCol)));
  const fd = isExactCol ? (exactColIdx === maxGridCol ? 1 : 0) : floatCol - cIdx;

  // Case 1: Exact depth row hit (e.g. z=0.00 km or z=603.00 km)
  if (exactRowIdx !== -1) {
    const row = rows[exactRowIdx];
    const rowMaxDeltaDeg = table.deltaStartDeg + row.maxValidCol * table.deltaStepDeg;

    if (deltaDeg > rowMaxDeltaDeg) {
      return {
        ok: false,
        status: 'unavailable_cell',
        phase,
        deltaDeg,
        depthKm,
        reason: `J-B ${phase} prediction at depth=${row.depthKm} km and delta=${deltaDeg.toFixed(2)}° lies in the shadow/unavailable region (max valid ${rowMaxDeltaDeg}°).`,
      };
    }

    let timeSec: number;
    let dTdDeltaDeg: number;

    if (isExactCol) {
      if (!isValidTableCell(phase, row, exactColIdx)) {
        return {
          ok: false,
          status: 'unavailable_cell',
          phase,
          deltaDeg,
          depthKm,
          reason: `J-B ${phase} cell at depth=${row.depthKm} km, delta=${deltaDeg}° is unavailable (0.00 sentinel).`,
        };
      }
      timeSec = row.timesSec[exactColIdx];
      // Compute one-sided or central distance derivative using valid adjacent column(s)
      const rightCol = exactColIdx + 1 <= row.maxValidCol ? exactColIdx + 1 : -1;
      const leftCol = exactColIdx - 1 >= 0 ? exactColIdx - 1 : -1;
      if (rightCol !== -1 && leftCol !== -1) {
        dTdDeltaDeg = (row.timesSec[rightCol] - row.timesSec[leftCol]) / (2 * table.deltaStepDeg);
      } else if (rightCol !== -1) {
        dTdDeltaDeg = (row.timesSec[rightCol] - row.timesSec[exactColIdx]) / table.deltaStepDeg;
      } else if (leftCol !== -1) {
        dTdDeltaDeg = (row.timesSec[exactColIdx] - row.timesSec[leftCol]) / table.deltaStepDeg;
      } else {
        dTdDeltaDeg = 0;
      }
    } else {
      if (!isValidTableCell(phase, row, cIdx) || !isValidTableCell(phase, row, cIdx + 1)) {
        return {
          ok: false,
          status: 'unavailable_cell',
          phase,
          deltaDeg,
          depthKm,
          reason: `J-B ${phase} distance interpolation at depth=${row.depthKm} km, delta=${deltaDeg.toFixed(2)}° crosses an unavailable cell.`,
        };
      }
      const t00 = row.timesSec[cIdx];
      const t01 = row.timesSec[cIdx + 1];
      timeSec = t00 + fd * (t01 - t00);
      dTdDeltaDeg = (t01 - t00) / table.deltaStepDeg;
    }

    // Evaluate vertical derivative across an adjacent depth row whose cell(s) are valid
    let dTdDepthKm = 0;
    let derivativeDepthValid = false;
    const neighborCandidates = [exactRowIdx + 1, exactRowIdx - 1].filter(
      (idx) => idx >= 0 && idx < rows.length
    );
    for (const nIdx of neighborCandidates) {
      const nRow = rows[nIdx];
      const colOk = isExactCol
        ? isValidTableCell(phase, nRow, exactColIdx)
        : isValidTableCell(phase, nRow, cIdx) && isValidTableCell(phase, nRow, cIdx + 1);
      if (!colOk) continue;

      const tNeighbor = isExactCol
        ? nRow.timesSec[exactColIdx]
        : nRow.timesSec[cIdx] + fd * (nRow.timesSec[cIdx + 1] - nRow.timesSec[cIdx]);
      const dzSigned = nRow.depthKm - row.depthKm;
      if (Math.abs(dzSigned) > 1e-6) {
        dTdDepthKm = (tNeighbor - timeSec) / dzSigned;
        derivativeDepthValid = true;
        break;
      }
    }

    const sr = Math.max(0, dTdDeltaDeg / KM_PER_DEG);
    const sz = -dTdDepthKm;
    const rawToa = derivativeDepthValid ? (Math.atan2(sr, sz) * 180) / Math.PI : 45.0;
    const toaDeg = Math.max(1.0, Math.min(179.0, Number.isFinite(rawToa) ? rawToa : 45.0));

    return {
      ok: true,
      status: 'ok',
      phase,
      deltaDeg,
      depthKm,
      timeSec,
      dTdDeltaDeg,
      dTdDepthKm,
      toaDeg,
      deltaDegClamped: deltaDeg,
      depthKmClamped: depthKm,
      derivativeDepthValid,
      branchLabel: `${phase} (JBTAB.PS)`,
    };
  }

  // Case 2: Interior depth bracket [row0, row1] — all 4 bilinear corners must be valid
  const row0 = rows[zIdx];
  const row1 = rows[zIdx + 1];
  const dz = row1.depthKm - row0.depthKm;
  if (dz <= 0) {
    return {
      ok: false,
      status: 'invalid_input',
      phase,
      deltaDeg,
      depthKm,
      reason: `Malformed J-B ${phase} depth grid near ${depthKm} km.`,
    };
  }
  const fz = (depthKm - row0.depthKm) / dz;

  const checkCols = isExactCol ? [exactColIdx] : [cIdx, cIdx + 1];
  for (const col of checkCols) {
    if (!isValidTableCell(phase, row0, col) || !isValidTableCell(phase, row1, col)) {
      const colDelta = table.deltaStartDeg + col * table.deltaStepDeg;
      return {
        ok: false,
        status: 'unavailable_cell',
        phase,
        deltaDeg,
        depthKm,
        reason: `J-B ${phase} bilinear bracket [${row0.depthKm}–${row1.depthKm} km] at delta=${deltaDeg.toFixed(2)}° touches unavailable node (${colDelta}°).`,
      };
    }
  }

  let timeSec: number;
  let dTdDeltaDeg: number;
  let dTdDepthKm: number;

  if (isExactCol) {
    const t0 = row0.timesSec[exactColIdx];
    const t1 = row1.timesSec[exactColIdx];
    timeSec = t0 + fz * (t1 - t0);
    dTdDepthKm = (t1 - t0) / dz;

    const canRight =
      isValidTableCell(phase, row0, exactColIdx + 1) &&
      isValidTableCell(phase, row1, exactColIdx + 1);
    const canLeft =
      isValidTableCell(phase, row0, exactColIdx - 1) &&
      isValidTableCell(phase, row1, exactColIdx - 1);

    if (canRight && canLeft) {
      const t0L = row0.timesSec[exactColIdx - 1];
      const t0R = row0.timesSec[exactColIdx + 1];
      const t1L = row1.timesSec[exactColIdx - 1];
      const t1R = row1.timesSec[exactColIdx + 1];
      const d0 = (t0R - t0L) / (2 * table.deltaStepDeg);
      const d1 = (t1R - t1L) / (2 * table.deltaStepDeg);
      dTdDeltaDeg = d0 + fz * (d1 - d0);
    } else if (canRight) {
      const d0 = (row0.timesSec[exactColIdx + 1] - t0) / table.deltaStepDeg;
      const d1 = (row1.timesSec[exactColIdx + 1] - t1) / table.deltaStepDeg;
      dTdDeltaDeg = d0 + fz * (d1 - d0);
    } else if (canLeft) {
      const d0 = (t0 - row0.timesSec[exactColIdx - 1]) / table.deltaStepDeg;
      const d1 = (t1 - row1.timesSec[exactColIdx - 1]) / table.deltaStepDeg;
      dTdDeltaDeg = d0 + fz * (d1 - d0);
    } else {
      dTdDeltaDeg = 0;
    }
  } else {
    const t00 = row0.timesSec[cIdx];
    const t01 = row0.timesSec[cIdx + 1];
    const t10 = row1.timesSec[cIdx];
    const t11 = row1.timesSec[cIdx + 1];

    const t0 = t00 + fd * (t01 - t00);
    const t1 = t10 + fd * (t11 - t10);
    timeSec = t0 + fz * (t1 - t0);

    const dTdDelta0 = (t01 - t00) / table.deltaStepDeg;
    const dTdDelta1 = (t11 - t10) / table.deltaStepDeg;
    dTdDeltaDeg = dTdDelta0 + fz * (dTdDelta1 - dTdDelta0);

    const dTdZ0 = (t10 - t00) / dz;
    const dTdZ1 = (t11 - t01) / dz;
    dTdDepthKm = dTdZ0 + fd * (dTdZ1 - dTdZ0);
  }

  const sr = Math.max(0, dTdDeltaDeg / KM_PER_DEG);
  const sz = -dTdDepthKm;
  const rawToa = (Math.atan2(sr, sz) * 180) / Math.PI;
  const toaDeg = Math.max(1.0, Math.min(179.0, Number.isFinite(rawToa) ? rawToa : 45.0));

  return {
    ok: true,
    status: 'ok',
    phase,
    deltaDeg,
    depthKm,
    timeSec,
    dTdDeltaDeg,
    dTdDepthKm,
    toaDeg,
    deltaDegClamped: deltaDeg,
    depthKmClamped: depthKm,
    derivativeDepthValid: true,
    branchLabel: `${phase} (JBTAB.PS)`,
  };
}

/**
 * Evaluates Jeffreys-Bullen travel time T(deltaDeg, depthKm) and throws JbLookupError
 * if the request falls outside the supported JBTAB.PS domain or hits an unavailable cell.
 */
export function lookupJbTravelTime(
  phase: JbPhaseType,
  deltaDeg: number,
  depthKm: number,
  tables: JbTravelTimeTables = getDefaultJbTables()
): JbLookupResult {
  const res = tryLookupJbTravelTime(phase, deltaDeg, depthKm, tables);
  if (!res.ok) {
    throw new JbLookupError(res.status, res.reason, res.phase, res.deltaDeg, res.depthKm);
  }
  return {
    timeSec: res.timeSec,
    dTdDeltaDeg: res.dTdDeltaDeg,
    dTdDepthKm: res.dTdDepthKm,
    toaDeg: res.toaDeg,
    deltaDegClamped: res.deltaDegClamped,
    depthKmClamped: res.depthKmClamped,
    derivativeDepthValid: res.derivativeDepthValid,
    branchLabel: res.branchLabel,
  };
}
