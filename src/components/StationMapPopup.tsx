import React from 'react';
import { X } from 'lucide-react';
import {
  EQPEvent,
  isEventUnlocated,
  PICK_QUALITY_WEIGHTS,
  StationMeta,
  StationPick,
} from '../data/eqpData';
import { computeAzimuthalGap } from '../utils/spatialQa';

function formatCoordLat(lat: number): string {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
}

function formatCoordLon(lon: number): string {
  return `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
}

function formatSignedSec(val: number): string {
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}s`;
}

function formatNetworkLabel(networkType?: StationMeta['networkType']): string {
  if (!networkType) return 'Seismic';
  if (networkType === 'strong_motion') return 'Strong Motion';
  if (networkType === 'volcanic') return 'Volcanic';
  return 'Seismic';
}

export interface StationHoverCardProps {
  code: string;
  meta?: StationMeta;
  lat: number;
  lon: number;
  dark?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const StationHoverCard: React.FC<StationHoverCardProps> = ({
  code,
  meta,
  lat,
  lon,
  dark = false,
  className = '',
  style,
}) => {
  const fullName = meta?.name?.trim() || 'Station metadata unavailable';
  const displayLat = meta?.lat ?? lat;
  const displayLon = meta?.lon ?? lon;
  const elevText =
    meta && Number.isFinite(meta.elevationM)
      ? `${meta.elevationM.toLocaleString('en-US')} m`
      : '—';

  return (
    <div
      style={style}
      className={`pointer-events-none rounded-lg border p-2.5 shadow-lg text-xs min-w-[230px] max-w-[290px] ${
        dark
          ? 'border-slate-700 bg-slate-950/95 text-slate-100'
          : 'border-slate-300 bg-white/95 backdrop-blur-xs text-slate-900'
      } ${className}`}
    >
      <div
        className={`flex items-start gap-2 pb-1.5 mb-1.5 border-b ${
          dark ? 'border-slate-800' : 'border-slate-100'
        }`}
      >
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold tracking-tight ${
            dark
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
              : 'bg-slate-900 text-white'
          }`}
        >
          {code}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`font-semibold leading-snug break-words ${
              dark ? 'text-slate-100' : 'text-slate-900'
            }`}
          >
            {fullName}
          </div>
          {meta?.province && (
            <div
              className={`text-[10.5px] leading-tight mt-0.5 ${
                dark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {meta.province}
              {meta.volcanoName ? ` · ${meta.volcanoName}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
        <div>
          <div
            className={`font-sans text-[10px] ${
              dark ? 'text-slate-400' : 'text-slate-400'
            }`}
          >
            Lat
          </div>
          <div className="font-medium">{formatCoordLat(displayLat)}</div>
        </div>
        <div>
          <div
            className={`font-sans text-[10px] ${
              dark ? 'text-slate-400' : 'text-slate-400'
            }`}
          >
            Lon
          </div>
          <div className="font-medium">{formatCoordLon(displayLon)}</div>
        </div>
        <div>
          <div
            className={`font-sans text-[10px] ${
              dark ? 'text-slate-400' : 'text-slate-400'
            }`}
          >
            Elev
          </div>
          <div className="font-medium">{elevText}</div>
        </div>
      </div>
    </div>
  );
};

interface StationDetailsPopupContentProps {
  pick: StationPick;
  meta?: StationMeta;
  event: EQPEvent;
}

const KvRow: React.FC<{
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}> = ({ label, value, mono = false }) => (
  <div className="flex items-baseline justify-between gap-2.5 py-0.5 text-[11px] leading-snug">
    <span className="text-slate-500 shrink-0">{label}</span>
    <span
      className={`text-right text-slate-900 break-words ${
        mono ? 'font-mono tabular-nums' : 'font-medium'
      }`}
    >
      {value}
    </span>
  </div>
);

export const StationDetailsPopupContent: React.FC<StationDetailsPopupContentProps> = ({
  pick,
  meta,
  event,
}) => {
  const unlocated = isEventUnlocated(event);
  const activeMag =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;

  const displayLat = meta?.lat ?? pick.lat;
  const displayLon = meta?.lon ?? pick.lon;
  const elevText =
    meta && Number.isFinite(meta.elevationM)
      ? `${meta.elevationM.toLocaleString('en-US')} m`
      : '—';

  const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
  const resPHigh = !pick.pExcluded && Math.abs(pick.resP) > 0.5;
  const resSHigh =
    !pick.sExcluded && pick.sTime.trim() !== '' && Math.abs(pick.resS) > 0.5;
  const qualityInfo = PICK_QUALITY_WEIGHTS[pick.quality];

  const activePicks = event.picks.filter((p) => !p.pExcluded);
  const gapStats = !unlocated
    ? computeAzimuthalGap(event.picks, event.lat, event.lon)
    : null;

  return (
    <div className="text-xs font-sans min-w-[270px] max-w-[340px] space-y-2.5 text-slate-800">
      {/* Header: Station Code + Whole Name + Status */}
      <div className="border-b border-slate-200 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px] font-bold tracking-tight">
                {pick.sta}
              </span>
              <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500">
                Station Details
              </span>
            </div>
            <div className="text-[13px] font-semibold text-slate-950 leading-snug break-words">
              {meta?.name || pick.sta}
            </div>
            {(meta?.province || meta?.networkType) && (
              <div className="text-[11px] text-slate-500 leading-snug">
                {[
                  meta?.province,
                  meta?.volcanoName ? `${meta.volcanoName}` : null,
                  formatNetworkLabel(meta?.networkType),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </div>
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              pick.pExcluded
                ? 'bg-slate-100 text-slate-600'
                : maxRes >= 1.0
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : maxRes > 0.5
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            {pick.pExcluded ? 'Excluded' : 'Active'}
          </span>
        </div>
      </div>

      {/* Section 1: Station Metadata */}
      <div className="space-y-0.5">
        <KvRow
          label="Coordinates"
          value={`${formatCoordLat(displayLat)}, ${formatCoordLon(displayLon)}`}
          mono
        />
        <KvRow label="Elevation" value={elevText} mono />
        {meta?.sensor && <KvRow label="Sensor" value={meta.sensor} />}
        {meta && (
          <KvRow
            label="Station Delay / Status"
            value={`${meta.delaySec >= 0 ? '+' : ''}${meta.delaySec.toFixed(2)}s · ${
              meta.status ?? 'operational'
            }`}
            mono
          />
        )}
        {meta?.telemetry && <KvRow label="Telemetry" value={meta.telemetry} />}
      </div>

      {/* Section 2: Station Phase & Magnitude Params for Current Event */}
      <div className="border-t border-slate-200 pt-2 space-y-1.5">
        <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-500">
          Station Phase &amp; Residual Params
        </div>
        <div className="grid grid-cols-3 gap-1.5 bg-slate-50 border border-slate-200/80 rounded p-1.5 font-mono tabular-nums text-[11px]">
          <div>
            <div className="font-sans text-[10px] text-slate-400">Distance Δ</div>
            <div className="font-semibold text-slate-900">
              {pick.delta.toFixed(2)}°
            </div>
            <div className="text-[9.5px] text-slate-500">
              ~{(pick.delta * 111.195).toFixed(0)} km
            </div>
          </div>
          <div>
            <div className="font-sans text-[10px] text-slate-400">Azimuth</div>
            <div className="font-semibold text-slate-900">
              {pick.azim.toFixed(1)}°
            </div>
            <div className="text-[9.5px] text-slate-500">
              TOA {pick.toa.toFixed(1)}°
            </div>
          </div>
          <div>
            <div className="font-sans text-[10px] text-slate-400">Quality / Pol</div>
            <div className="font-semibold text-slate-900">
              {pick.quality} ({qualityInfo.weight.toFixed(2)})
            </div>
            <div className="text-[9.5px] text-slate-500">
              Pol: {pick.polarity || '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono tabular-nums text-[11px] pt-0.5">
          <div>
            <div className="font-sans text-[10px] text-slate-400">
              P Arrival {pick.pExcluded ? '(Excl.)' : ''}
            </div>
            <div
              className={
                pick.pExcluded
                  ? 'line-through text-slate-400'
                  : 'text-slate-900 font-medium'
              }
            >
              {pick.pTime || '—'}
            </div>
          </div>
          <div>
            <div className="font-sans text-[10px] text-slate-400">
              RESp (Obs / Calc)
            </div>
            <div
              className={`font-semibold ${
                pick.pExcluded
                  ? 'text-slate-400'
                  : resPHigh
                    ? 'text-rose-700'
                    : 'text-slate-800'
              }`}
            >
              {pick.pTime ? formatSignedSec(pick.resP) : '—'}
              {pick.pTime ? (
                <span className="text-[10px] font-normal text-slate-500">
                  {' '}
                  ({pick.obsP.toFixed(1)}/{pick.calcP.toFixed(1)}s)
                </span>
              ) : null}
            </div>
          </div>
          <div>
            <div className="font-sans text-[10px] text-slate-400">
              S Arrival {pick.sExcluded ? '(Excl.)' : ''}
            </div>
            <div
              className={
                pick.sExcluded
                  ? 'line-through text-slate-400'
                  : 'text-slate-900 font-medium'
              }
            >
              {pick.sTime || '—'}
            </div>
          </div>
          <div>
            <div className="font-sans text-[10px] text-slate-400">
              RESs (Obs / Calc)
            </div>
            <div
              className={`font-semibold ${
                pick.sExcluded
                  ? 'text-slate-400'
                  : resSHigh
                    ? 'text-amber-700'
                    : 'text-slate-800'
              }`}
            >
              {pick.sTime ? formatSignedSec(pick.resS) : '—'}
              {pick.sTime ? (
                <span className="text-[10px] font-normal text-slate-500">
                  {' '}
                  ({pick.obsS.toFixed(1)}/{pick.calcS.toFixed(1)}s)
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <KvRow
          label="Duration / Sta Mag"
          value={`${pick.duration !== null ? `${pick.duration.toFixed(1)}s` : '—'} · Ms ${
            pick.ms?.toFixed(1) ?? '—'
          } · Mb ${pick.mb?.toFixed(1) ?? '—'} · Md ${pick.md?.toFixed(1) ?? '—'}`}
          mono
        />
      </div>

      {/* Section 3: Current Earthquake Event Processed */}
      <div className="border-t border-slate-200 pt-2 space-y-0.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500">
            Current EQ Event Processed
          </span>
          <span className="font-mono text-[10px] font-semibold text-slate-700">
            B{event.bulletinNo} · {event.originType ?? 'TECTONIC'}
          </span>
        </div>
        <KvRow label="Event File" value={event.filename} mono />
        <KvRow
          label="Origin (UTC)"
          value={`${event.originDateGmt} ${event.originTimeGmt}`}
          mono
        />
        <KvRow
          label="Origin (LST)"
          value={`${event.originDateLst} ${event.originTimeLst}`}
          mono
        />
        <KvRow
          label="Hypocenter"
          value={
            unlocated
              ? `Pending (Trial Z ${event.trialDepthKm.toFixed(1)} km)`
              : `${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E`
          }
          mono
        />
        <KvRow
          label="Depth"
          value={
            unlocated
              ? `Trial ${event.trialDepthKm.toFixed(1)} km`
              : `${event.depthKm.toFixed(1)} km (Trial ${event.trialDepthKm.toFixed(1)} km)`
          }
          mono
        />
        <KvRow
          label="Magnitude"
          value={`${event.preferredScale} ${activeMag.toFixed(1)} (Ms ${event.ms.toFixed(
            1
          )} · Mb ${event.mb.toFixed(1)} · Md ${event.md.toFixed(1)})`}
          mono
        />
        <KvRow
          label="RMS / ERH / Iter"
          value={
            unlocated
              ? 'Awaiting solution'
              : `${event.rmsSec.toFixed(2)}s · ±${event.errKm.toFixed(2)} km · ${event.iterations} it`
          }
          mono
        />
        <KvRow
          label="Phases / Gap"
          value={`${activePicks.length}/${event.picks.length} active · Gap ${
            gapStats ? `${gapStats.gapDeg}°` : '—'
          }`}
          mono
        />
        <KvRow
          label="Model / Solver"
          value={`${event.locationMetadata?.modelName ?? 'Jeffreys-Bullen'} · ${
            event.locationMetadata?.solver ?? 'EQP'
          }`}
        />
      </div>
    </div>
  );
};

interface FloatingStationPopupProps {
  pick: StationPick;
  meta?: StationMeta;
  event: EQPEvent;
  onClose: () => void;
  className?: string;
}

export const FloatingStationPopup: React.FC<FloatingStationPopupProps> = ({
  pick,
  meta,
  event,
  onClose,
  className = 'top-3 right-3',
}) => {
  return (
    <div
      role="dialog"
      aria-label={`Station ${pick.sta} details and event parameters`}
      onClick={(e) => e.stopPropagation()}
      className={`absolute z-30 w-80 max-w-[calc(100%-1.5rem)] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-slate-300 bg-white/95 backdrop-blur-xs shadow-lg p-3 ${className}`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close station details"
        className="sticky top-0 float-right p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="pr-2">
        <StationDetailsPopupContent pick={pick} meta={meta} event={event} />
      </div>
    </div>
  );
};
