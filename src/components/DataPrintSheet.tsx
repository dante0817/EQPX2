import React from 'react';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import { DataPrintConfig } from '../utils/dataPrint';
import {
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from '../utils/magnitudeEngine';

interface DataPrintSheetProps {
  event: EQPEvent;
  freshness?: MagnitudeFreshnessInspection;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  config: DataPrintConfig;
  previewVisible?: boolean;
}

export const DataPrintSheet: React.FC<DataPrintSheetProps> = ({
  event,
  freshness,
  primaryLocationLabel,
  faultGeneratorLabel,
  config,
  previewVisible = false,
}) => {
  const unlocated = isEventUnlocated(event);
  const magResolution = resolveBulletinMagnitude(event, freshness);
  const isLegacyPreferred =
    !event.magnitudeMetadata ||
    event.magnitudeMetadata.preferredMethodId === 'eqp-legacy-ms';
  const picks = config.includeExcludedPicks
    ? event.picks
    : event.picks.filter((p) => !p.pExcluded);

  const orientationClass = config.orientation === 'landscape' ? 'eqp-print-landscape' : '';
  const visibilityClass = previewVisible ? 'block border border-slate-300 shadow-xs rounded' : 'hidden print:block';

  return (
    <div
      className={`${visibilityClass} ${orientationClass} bg-white text-slate-950 p-5 print:p-0 font-sans text-xs space-y-3`}
    >
      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-2 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">
            Earthquake Processor (EQP) v{event.version} — Technical Data Solution
          </div>
          <h1 className="text-sm font-bold text-slate-950 mt-0.5 font-mono">
            {event.filename || 'UNSAVED_EVENT'}
          </h1>
          <div className="text-[10px] font-mono text-slate-700 mt-0.5 break-all">
            {event.filePath || '(Unsaved draft)'}
          </div>
        </div>
        <div className="text-right font-mono text-[10px] space-y-0.5 shrink-0">
          <div>
            <span className="font-semibold">GMT:</span> {event.originDateGmt} {event.originTimeGmt}
          </div>
          <div>
            <span className="font-semibold">LST:</span> {event.originDateLst} {event.originTimeLst}
          </div>
          <div>
            Bulletin No. {String(event.bulletinNo).padStart(2, '0')} ·{' '}
            {event.intensities.length > 0 ? 'Felt (F)' : 'Unfelt'}
          </div>
        </div>
      </div>

      {/* Hypocenter & Magnitude Row */}
      {(config.includeHypocenter || config.includeMagnitudes) && (
        <div className="grid grid-cols-2 gap-3 break-inside-avoid">
          {config.includeHypocenter && (
            <div className="border border-slate-400 rounded p-2 space-y-1">
              <div className="font-bold text-[10px] uppercase tracking-wide text-slate-800 border-b border-slate-300 pb-0.5">
                Hypocenter Solution
              </div>
              {unlocated ? (
                <div className="font-mono text-[10px] text-slate-700">
                  Status: UNLOCATED · Trial Depth: {event.trialDepthKm.toFixed(1)} km
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px]">
                  <div>LAT: {event.lat.toFixed(3)}° N</div>
                  <div>LON: {event.lon.toFixed(3)}° E</div>
                  <div>DEPTH: {event.depthKm.toFixed(1)} km</div>
                  <div>TRIAL: {event.trialDepthKm.toFixed(1)} km</div>
                  <div>ITER: {event.iterations}</div>
                  <div>RMS: {event.rmsSec.toFixed(2)} s</div>
                  <div className="col-span-2">
                    ERH: ±{event.errKm.toFixed(2)} km (dLat ±{event.errLatDeg.toFixed(4)}°, dLon ±
                    {event.errLonDeg.toFixed(4)}°)
                  </div>
                </div>
              )}
            </div>
          )}

          {config.includeMagnitudes && (
            <div className="border border-slate-400 rounded p-2 space-y-1">
              <div className="font-bold text-[10px] uppercase tracking-wide text-slate-800 border-b border-slate-300 pb-0.5">
                Magnitude Summary
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px]">
                <div className="col-span-2 font-semibold">
                  Active Magnitude: {magResolution.displayText}
                </div>
                <div className="col-span-2 text-slate-700">
                  Method: {magResolution.provenanceLabel}
                </div>
                {!magResolution.isStale && isLegacyPreferred && (
                  <>
                    <div>Ms: {event.ms.toFixed(1)}</div>
                    <div>Mb: {event.mb.toFixed(1)}</div>
                    <div>ML: {event.md.toFixed(1)}</div>
                  </>
                )}
                <div>Tsunami: {event.tsunamiStatus}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Location Reference */}
      {config.includeLocation && (
        <div className="border border-slate-400 rounded p-2 space-y-0.5 text-[10px] break-inside-avoid">
          <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-slate-300 pb-0.5">
            Geographic Reference &amp; Fault Context
          </div>
          <div className="font-mono">Primary Reference: {primaryLocationLabel || 'Pending location'}</div>
          <div className="font-mono">
            Central Office Bearing: {event.centralOfficeBearing || 'Pending location'}
          </div>
          {faultGeneratorLabel && (
            <div className="font-mono">Fault Generator: {faultGeneratorLabel}</div>
          )}
        </div>
      )}

      {/* Station Phase Picks Table */}
      {config.includePhasePicks && (
        <div className="space-y-1">
          <div className="font-bold text-[10px] uppercase tracking-wide text-slate-800">
            Station Phase Picks &amp; Residuals ({picks.length} records)
          </div>
          <table className="w-full border-collapse border border-slate-400 font-mono text-[9px] tabular-nums">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400">
                <th className="px-1 py-0.5 text-left border-r border-slate-300">STA</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">Delta</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">Azim</th>
                <th className="px-1 py-0.5 text-left border-r border-slate-300">P-Time</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">OBSp</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">CALCp</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">RESp</th>
                <th className="px-1 py-0.5 text-left border-r border-slate-300">S-Time</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">OBSs</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">RESs</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">Dur</th>
                <th className="px-1 py-0.5 text-right border-r border-slate-300">Amp</th>
                <th className="px-1 py-0.5 text-center border-r border-slate-300">Pol</th>
                <th className="px-1 py-0.5 text-center">Wt</th>
              </tr>
            </thead>
            <tbody>
              {picks.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-2 py-2.5 text-center text-slate-500">
                    No phase picks recorded.
                  </td>
                </tr>
              ) : (
                picks.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-300 break-inside-avoid ${
                      p.pExcluded ? 'text-slate-400' : ''
                    }`}
                  >
                    <td className="px-1 py-0.5 font-semibold border-r border-slate-200">
                      {p.pExcluded ? `*${p.sta}` : p.sta}
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.delta.toFixed(2)}
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.azim.toFixed(1)}
                    </td>
                    <td className="px-1 py-0.5 border-r border-slate-200">{p.pTime}</td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.obsP.toFixed(2)}
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.calcP.toFixed(2)}
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.resP >= 0 ? `+${p.resP.toFixed(2)}` : p.resP.toFixed(2)}
                    </td>
                    <td className="px-1 py-0.5 border-r border-slate-200">{p.sTime || '—'}</td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.sTime ? p.obsS.toFixed(2) : '—'}
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.sTime ? (p.resS >= 0 ? `+${p.resS.toFixed(2)}` : p.resS.toFixed(2)) : '—'}
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.duration ?? 0}
                    </td>
                    <td className="px-1 py-0.5 text-right border-r border-slate-200">
                      {p.amplitude ?? 0}
                    </td>
                    <td className="px-1 py-0.5 text-center border-r border-slate-200">
                      {p.polarity || '—'}
                    </td>
                    <td className="px-1 py-0.5 text-center">{p.quality}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PEIS Intensities */}
      {config.includeIntensities && (
        <div className="border border-slate-400 rounded p-2 space-y-0.5 text-[10px] break-inside-avoid">
          <div className="font-bold uppercase tracking-wide text-slate-800 border-b border-slate-300 pb-0.5">
            Reported Macroseismic Intensities (PEIS)
          </div>
          {event.intensities.length === 0 ? (
            <div className="font-mono text-slate-600">None reported.</div>
          ) : (
            <div className="grid grid-cols-2 gap-1 font-mono">
              {event.intensities.map((item) => (
                <div key={item.id}>
                  PEIS {item.peis} — {item.locality}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-slate-400 pt-1.5 flex items-center justify-between text-[9.5px] font-mono text-slate-600">
        <span>Prepared by: {event.issuedBy || 'Duty Seismologist'}</span>
        <span>
          Issued: {event.issuedDate || 'Pending'} {event.issuedTime || ''}
        </span>
      </div>
    </div>
  );
};
