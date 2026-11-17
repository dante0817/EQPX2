export type NetworkAggregationMethod =
  | 'median'
  | 'arithmetic_mean'
  | 'trimmed_mean';

export interface AggregatedMagnitudeResult {
  value: number;
  rawValue: number;
  trimmedCount: number;
  totalEligible: number;
  contributingCount: number;
  aggregationUsed: NetworkAggregationMethod;
  fallbackApplied: boolean;
}

export function aggregateStationMagnitudes(
  values: ReadonlyArray<number>,
  method: NetworkAggregationMethod
): AggregatedMagnitudeResult | null {
  const finite = values.filter((v) => Number.isFinite(v));
  const totalEligible = finite.length;
  if (totalEligible === 0) return null;

  const sorted = [...finite].sort((a, b) => a - b);
  let rawValue: number;
  let trimmedCount = 0;
  let contributingCount = totalEligible;
  let aggregationUsed: NetworkAggregationMethod = method;
  let fallbackApplied = false;

  if (method === 'median') {
    const mid = Math.floor(sorted.length / 2);
    rawValue =
      sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  } else if (method === 'trimmed_mean') {
    const k = Math.floor(0.1 * sorted.length);
    if (k < 1) {
      rawValue = sorted.reduce((s, v) => s + v, 0) / sorted.length;
      trimmedCount = 0;
      contributingCount = sorted.length;
      aggregationUsed = 'arithmetic_mean';
      fallbackApplied = true;
    } else {
      const kept = sorted.slice(k, sorted.length - k);
      trimmedCount = k * 2;
      contributingCount = kept.length;
      aggregationUsed = 'trimmed_mean';
      fallbackApplied = false;
      rawValue = kept.reduce((s, v) => s + v, 0) / kept.length;
    }
  } else {
    rawValue = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  }

  return {
    value: Number(rawValue.toFixed(1)),
    rawValue: Number(rawValue.toFixed(3)),
    trimmedCount,
    totalEligible,
    contributingCount,
    aggregationUsed,
    fallbackApplied,
  };
}
