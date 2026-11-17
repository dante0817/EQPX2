import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import {
  type EarthquakeOriginType,
  type EQPEvent,
  isEventUnlocated,
} from '../data/eqpData';
import {
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from '../utils/magnitudeEngine';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatSummaryDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    const monthIdx = Math.max(0, Math.min(11, (Number(mm) || 1) - 1));
    return `${dd.padStart(2, '0')} ${MONTHS_SHORT[monthIdx]} ${yyyy}`;
  }
  return isoDate || '01 Jan 2026';
}

function formatSummaryTime(timeStr: string, use12Hour: boolean): string {
  const parts = timeStr.split(':');
  const hhNum = Math.max(0, Math.min(23, Number(parts[0]) || 0));
  const minNum = Math.max(0, Math.min(59, Number(parts[1]) || 0));
  const secNum = Math.max(0, Math.min(59, Math.round(Number(parts[2]) || 0)));
  const hh = String(hhNum).padStart(2, '0');
  const min = String(minNum).padStart(2, '0');
  const sec = String(secNum).padStart(2, '0');

  if (!use12Hour) {
    return `${hh}:${min}:${sec}`;
  }

  const amPm = hhNum >= 12 ? 'PM' : 'AM';
  const hh12 = String(hhNum % 12 || 12).padStart(2, '0');
  return `${hh12}:${min}:${sec} ${amPm}`;
}

export interface BulletinSummaryParameters {
  unlocated: boolean;
  bulletinNo: number;
  originType: EarthquakeOriginType;
  originLst: string;
  originUtc: string;
  preferredScale: string;
  activeMagnitudeText: string;
  allScalesText: string;
  depthText: string;
  depthDetailText: string;
  coordinatesText: string;
  errorText: string;
  locationText: string;
  faultGeneratorText: string | null;
  expectingDamage: boolean;
  expectingAftershocks: boolean;
  rmsText: string;
  stationSummaryText: string;
  intensitySummaryText: string;
  issuedText: string;
}

export function extractBulletinSummaryParameters(
  event: EQPEvent,
  primaryLocationLabel: string,
  options?: {
    faultGeneratorLabel?: string | null;
    printSource?: boolean;
    issuedDateDisplay?: string;
    issuedTimeDisplay?: string;
    issuedByDisplay?: string;
    freshness?: MagnitudeFreshnessInspection;
  }
): BulletinSummaryParameters {
  const unlocated = isEventUnlocated(event);
  const bulletinNo = Math.max(1, Math.trunc(event.bulletinNo || 1));
  const originType: EarthquakeOriginType = event.originType ?? 'TECTONIC';

  const magResolution = resolveBulletinMagnitude(event, options?.freshness);
  const preferredScale = magResolution.scaleLabel;

  const depthCode = String(Math.round(Math.max(0, event.depthKm))).padStart(3, '0');
  const depthMode =
    event.locationMetadata?.depthFixed !== undefined
      ? event.locationMetadata.depthFixed
        ? 'Fixed'
        : 'Free'
      : null;

  const activePicks = event.picks.filter((p) => !p.pExcluded && p.pTime.trim() !== '').length;
  const totalPicks = event.picks.length;
  const feltCount = event.intensities.filter((i) => i.category !== 'instrumental').length;
  const instrCount = event.intensities.filter((i) => i.category === 'instrumental').length;

  const issuedDate = options?.issuedDateDisplay ?? (event.issuedDate || 'Pending');
  const issuedTime = options?.issuedTimeDisplay ?? (event.issuedTime || '—');
  const issuedBy = options?.issuedByDisplay ?? (event.issuedBy || 'DSS');

  const intensitySummaryText = event.intensityBulletinOverride?.trim()
    ? 'Custom override'
    : feltCount === 0 && instrCount === 0
      ? 'None reported'
      : `Felt ${feltCount} · Instr ${instrCount}`;

  return {
    unlocated,
    bulletinNo,
    originType,
    originLst: `${formatSummaryDate(event.originDateLst)} - ${formatSummaryTime(event.originTimeLst, true)}`,
    originUtc: `${formatSummaryDate(event.originDateGmt)} - ${formatSummaryTime(event.originTimeGmt, false)} UTC`,
    preferredScale,
    activeMagnitudeText: magResolution.displayText,
    allScalesText: magResolution.isStale
      ? 'Recalculation required before publication'
      : event.magnitudeMetadata &&
          event.magnitudeMetadata.preferredMethodId !== 'eqp-legacy-ms'
        ? `${magResolution.displayText} (${event.magnitudeMetadata.preferredMethodId})`
        : `Ms ${event.ms.toFixed(1)} · Mb ${event.mb.toFixed(1)} · ML ${event.md.toFixed(1)}`,
    depthText: unlocated ? 'Pending' : `${depthCode} km`,
    depthDetailText: unlocated
      ? 'Awaiting solution'
      : `${event.depthKm.toFixed(1)} km${depthMode ? ` (${depthMode})` : ''}`,
    coordinatesText: unlocated
      ? 'Pending location'
      : `${event.lat.toFixed(2)}°N, ${event.lon.toFixed(2)}°E`,
    errorText: unlocated ? 'ERH —' : `ERH ±${event.errKm.toFixed(2)} km`,
    locationText: unlocated ? 'Pending location' : primaryLocationLabel,
    faultGeneratorText:
      options?.printSource && options?.faultGeneratorLabel ? options.faultGeneratorLabel : null,
    expectingDamage: Boolean(event.expectingDamage),
    expectingAftershocks: Boolean(event.expectingAftershocks),
    rmsText: unlocated ? 'RMS —' : `RMS ${event.rmsSec.toFixed(2)}s`,
    stationSummaryText: `${activePicks}/${totalPicks} sta`,
    intensitySummaryText,
    issuedText: `${issuedBy} · ${issuedDate} ${issuedTime}`,
  };
}

export interface BulletinSummaryTableProps {
  event: EQPEvent;
  freshness?: MagnitudeFreshnessInspection;
  primaryLocationLabel: string;
  faultGeneratorLabel?: string | null;
  printSource?: boolean;
  issuedDateDisplay?: string;
  issuedTimeDisplay?: string;
  issuedByDisplay?: string;
}

export const BulletinSummaryTable: React.FC<BulletinSummaryTableProps> = ({
  event,
  freshness,
  primaryLocationLabel,
  faultGeneratorLabel = null,
  printSource = false,
  issuedDateDisplay,
  issuedTimeDisplay,
  issuedByDisplay,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const summary = useMemo(
    () =>
      extractBulletinSummaryParameters(event, primaryLocationLabel, {
        faultGeneratorLabel,
        printSource,
        issuedDateDisplay,
        issuedTimeDisplay,
        issuedByDisplay,
        freshness,
      }),
    [
      event,
      freshness,
      primaryLocationLabel,
      faultGeneratorLabel,
      printSource,
      issuedDateDisplay,
      issuedTimeDisplay,
      issuedByDisplay,
    ]
  );

  const magResolution = useMemo(
    () => resolveBulletinMagnitude(event, freshness),
    [event, freshness]
  );

  return (
    <section
      aria-label="Bulletin Event Parameter Verification Table"
      className="bg-white border-b border-slate-300 shadow-xs shrink-0"
    >
      <div className="px-3.5 py-2 bg-gradient-to-r from-slate-100 via-sky-50/90 to-indigo-50/75 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <h3 className="font-semibold text-slate-900 tracking-tight">
            Parameter Verification Summary
          </h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-slate-300 bg-white/90 font-mono tabular-nums text-[10.5px] font-semibold text-slate-700">
            Info No. {summary.bulletinNo}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded border border-sky-200 bg-sky-100/80 text-[10.5px] font-semibold text-sky-900">
            {summary.originType}
          </span>
          {summary.unlocated ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-[10.5px] font-semibold text-amber-800">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Location Pending
            </span>
          ) : magResolution.isStale ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-[10.5px] font-semibold text-amber-800">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Magnitude Stale
            </span>
          ) : magResolution.requiresAnalystConfirmation ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-[10.5px] font-semibold text-amber-800">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Confirm Uncalibrated {magResolution.scaleLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-[10.5px] font-semibold text-emerald-700">
              <Check className="w-3 h-3 shrink-0" />
              Solution Ready
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer shadow-2xs transition-colors"
        >
          {collapsed ? (
            <>
              <ChevronDown className="w-3 h-3" />
              <span>Show Grid</span>
            </>
          ) : (
            <>
              <ChevronUp className="w-3 h-3" />
              <span>Hide Grid</span>
            </>
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-left text-[11.5px]">
            <tbody className="divide-y divide-slate-300/80">
              <tr className="group">
                <th
                  scope="row"
                  className="w-[136px] bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Origin (LST)
                </th>
                <td className="bg-white group-hover:bg-sky-100/50 px-3 py-2 font-mono tabular-nums font-semibold text-slate-900 border-r border-slate-300 transition-colors">
                  {summary.originLst}
                </td>
                <th
                  scope="row"
                  className="w-[136px] bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Origin (UTC)
                </th>
                <td className="bg-white group-hover:bg-sky-100/50 px-3 py-2 font-mono tabular-nums font-semibold text-slate-800 transition-colors">
                  {summary.originUtc}
                </td>
              </tr>

              <tr className="group">
                <th
                  scope="row"
                  className="bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Magnitude
                </th>
                <td className="bg-sky-50/80 group-hover:bg-sky-100/70 px-3 py-2 border-r border-slate-300 transition-colors">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100/90 border border-blue-200 font-mono tabular-nums font-bold text-blue-900">
                    {summary.activeMagnitudeText}
                  </span>
                  <span className="ml-2 font-mono tabular-nums text-[10.5px] text-slate-600">
                    ({summary.allScalesText})
                  </span>
                </td>
                <th
                  scope="row"
                  className="bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Depth of Focus
                </th>
                <td className="bg-sky-50/80 group-hover:bg-sky-100/70 px-3 py-2 transition-colors">
                  <span className="font-mono tabular-nums font-bold text-slate-900">
                    {summary.depthText}
                  </span>
                  <span className="ml-2 font-mono tabular-nums text-[10.5px] text-slate-600">
                    · {summary.depthDetailText}
                  </span>
                </td>
              </tr>

              <tr className="group">
                <th
                  scope="row"
                  className="bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Coordinates
                </th>
                <td className="bg-white group-hover:bg-sky-100/50 px-3 py-2 border-r border-slate-300 transition-colors">
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {summary.coordinatesText}
                  </span>
                  <span className="ml-2 font-mono tabular-nums text-[10.5px] text-slate-600">
                    · {summary.errorText}
                  </span>
                </td>
                <th
                  scope="row"
                  className="bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Location
                </th>
                <td className="bg-white group-hover:bg-sky-100/50 px-3 py-2 text-slate-900 font-semibold transition-colors">
                  <span>{summary.locationText}</span>
                  {summary.faultGeneratorText && (
                    <span className="ml-2 text-[10.5px] text-slate-600 font-normal">
                      · Source: {summary.faultGeneratorText}
                    </span>
                  )}
                </td>
              </tr>

              <tr className="group">
                <th
                  scope="row"
                  className="bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Advisories
                </th>
                <td className="bg-sky-50/80 group-hover:bg-sky-100/70 px-3 py-2 border-r border-slate-300 transition-colors">
                  <span className="text-slate-600">Damage: </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10.5px] font-semibold ${
                      summary.expectingDamage
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : 'bg-slate-200/75 text-slate-800'
                    }`}
                  >
                    {summary.expectingDamage ? 'YES' : 'NO'}
                  </span>
                  <span aria-hidden="true" className="mx-1.5 text-slate-400">
                    ·
                  </span>
                  <span className="text-slate-600">Aftershocks: </span>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10.5px] font-semibold ${
                      summary.expectingAftershocks
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : 'bg-slate-200/75 text-slate-800'
                    }`}
                  >
                    {summary.expectingAftershocks ? 'YES' : 'NO'}
                  </span>
                  <span aria-hidden="true" className="mx-1.5 text-slate-400">
                    ·
                  </span>
                  <span className="text-slate-600">Intensities: </span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    {summary.intensitySummaryText}
                  </span>
                </td>
                <th
                  scope="row"
                  className="bg-indigo-100/85 text-indigo-950 px-3 py-2 font-semibold text-[11px] tracking-wide whitespace-nowrap border-r border-slate-300"
                >
                  Quality &amp; Issued
                </th>
                <td className="bg-sky-50/80 group-hover:bg-sky-100/70 px-3 py-2 font-mono tabular-nums text-slate-800 transition-colors">
                  <span className="font-semibold text-slate-900">{summary.rmsText}</span>
                  <span aria-hidden="true" className="mx-1.5 text-slate-400">
                    ·
                  </span>
                  <span>{summary.stationSummaryText}</span>
                  <span aria-hidden="true" className="mx-1.5 text-slate-400">
                    ·
                  </span>
                  <span className="font-sans font-medium text-slate-800">
                    {summary.issuedText}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
