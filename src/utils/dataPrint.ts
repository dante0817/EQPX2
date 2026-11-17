import { jsPDF } from 'jspdf';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import {
  hasEventFeltDesignation,
  splitIntensitiesByCategory,
} from './intensityFormat';
import {
  formatLegacyScaleLong,
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from './magnitudeEngine';

export interface HostPrinterInfo {
  name: string;
  status: string;
  isDefault: boolean;
  portOrUri?: string;
  driver?: string;
}

export interface HostPrinterStatus {
  connected: boolean;
  defaultPrinter: string | null;
  printers: HostPrinterInfo[];
  platform?: string;
  detectionSource?: string | null;
  reason: string | null;
}

export async function getDefaultSystemPrinter(): Promise<HostPrinterStatus> {
  try {
    const resp = await fetch('/api/printers/default');
    if (resp.ok) {
      return (await resp.json()) as HostPrinterStatus;
    }
    return {
      connected: false,
      defaultPrinter: null,
      printers: [],
      reason: 'Unable to reach system printer service.',
    };
  } catch {
    return {
      connected: false,
      defaultPrinter: null,
      printers: [],
      reason: 'Unable to query system default printer.',
    };
  }
}

export interface DataPrintConfig {
  includeHypocenter: boolean;
  includeMagnitudes: boolean;
  includeLocation: boolean;
  includePhasePicks: boolean;
  includeExcludedPicks: boolean;
  includeIntensities: boolean;
  orientation: 'portrait' | 'landscape';
}

export const DEFAULT_DATA_PRINT_CONFIG: DataPrintConfig = {
  includeHypocenter: true,
  includeMagnitudes: true,
  includeLocation: true,
  includePhasePicks: true,
  includeExcludedPicks: false,
  includeIntensities: true,
  orientation: 'portrait',
};

export function formatDataPrintText(params: {
  event: EQPEvent;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  config: DataPrintConfig;
  freshness?: MagnitudeFreshnessInspection;
}): string {
  const { event, primaryLocationLabel, faultGeneratorLabel, config, freshness } = params;
  const unlocated = isEventUnlocated(event);
  const picks = config.includeExcludedPicks
    ? event.picks
    : event.picks.filter((p) => !p.pExcluded);

  const lines: string[] = [
    '================================================================================',
    `EARTHQUAKE PROCESSOR (EQP) v${event.version} — SEISMIC DATA SOLUTION REPORT`,
    '================================================================================',
    `File Path    : ${event.filePath || event.filename || '(unsaved event)'}`,
    `Bulletin No. : ${event.bulletinNo}   |   Felt Indicator: ${hasEventFeltDesignation(event) ? 'F (Felt)' : 'Unfelt'}`,
    `Origin GMT   : ${event.originDateGmt}  ${event.originTimeGmt}`,
    `Origin LST   : ${event.originDateLst}  ${event.originTimeLst}`,
  ];

  if (config.includeHypocenter) {
    lines.push('');
    lines.push('--- HYPOCENTER & SOLVER RESULT -------------------------------------------------');
    if (unlocated) {
      lines.push('Status       : UNLOCATED / PENDING SOLVE');
      lines.push(`Trial Depth  : ${event.trialDepthKm.toFixed(1)} km`);
    } else {
      lines.push(
        `Coordinates  : ${event.lat.toFixed(3)} deg N,  ${event.lon.toFixed(3)} deg E`
      );
      lines.push(
        `Depth        : ${event.depthKm.toFixed(1)} km   (Trial: ${event.trialDepthKm.toFixed(1)} km)`
      );
      lines.push(
        `Iterations   : ${event.iterations}   |   RMS: ${event.rmsSec.toFixed(2)} s   |   ERH: +/-${event.errKm.toFixed(2)} km`
      );
      lines.push(
        `Error Ellipse: dLat +/-${event.errLatDeg.toFixed(4)} deg,  dLon +/-${event.errLonDeg.toFixed(4)} deg`
      );
    }
  }

  if (config.includeMagnitudes) {
    const magRes = resolveBulletinMagnitude(event, freshness);
    lines.push('');
    lines.push('--- MAGNITUDE EVALUATION -------------------------------------------------------');
    if (event.magnitudeMetadata && event.magnitudeMetadata.preferredMethodId !== 'eqp-legacy-ms') {
      lines.push(
        `Preferred    : ${magRes.displayText}   |   Method: ${magRes.provenanceLabel}   |   Stations: ${magRes.isStale ? 'Stale' : event.magnitudeMetadata.contributingStations}`
      );
      lines.push(
        `Calibration  : ${event.magnitudeMetadata.calibrationProfileId} (${event.magnitudeMetadata.calibrationStatus})   |   Aggregation: ${event.magnitudeMetadata.aggregationMethod}`
      );
    } else if (magRes.isStale) {
      lines.push(
        `Preferred    : ${magRes.displayText}   |   Method: ${formatLegacyScaleLong(event.preferredScale)}`
      );
    } else {
      lines.push(
        `Preferred    : ${magRes.displayText} (${formatLegacyScaleLong(event.preferredScale)})   |   Ms: ${event.ms.toFixed(1)}   Mb: ${event.mb.toFixed(1)}   ML: ${event.md.toFixed(1)}`
      );
    }
  }

  if (config.includeLocation) {
    lines.push('');
    lines.push('--- GEOGRAPHIC REFERENCE & FAULT CONTEXT ---------------------------------------');
    lines.push(`Primary Ref  : ${primaryLocationLabel || 'Pending location'}`);
    lines.push(`Central Ofc  : ${event.centralOfficeBearing || 'Pending location'}`);
    if (faultGeneratorLabel) {
      lines.push(`Fault Source : ${faultGeneratorLabel}`);
    }
  }

  if (config.includePhasePicks) {
    lines.push('');
    lines.push('--- STATION PHASE PICKS & TRAVEL-TIME RESIDUALS --------------------------------');
    lines.push(
      'STA   DELTA   AZIM    P-TIME     OBSp     CALCp    RESp    S-TIME     OBSs    RESs   DUR   AMP   POL  WT'
    );
    lines.push(
      '------------------------------------------------------------------------------------------------------'
    );
    if (picks.length === 0) {
      lines.push('  (No active phase picks recorded)');
    } else {
      for (const p of picks) {
        const mark = p.pExcluded ? '*' : ' ';
        const row = [
          `${mark}${p.sta.padEnd(4)}`,
          p.delta.toFixed(2).padStart(6),
          p.azim.toFixed(1).padStart(7),
          p.pTime.padEnd(9),
          p.obsP.toFixed(2).padStart(8),
          p.calcP.toFixed(2).padStart(8),
          (p.resP >= 0 ? `+${p.resP.toFixed(2)}` : p.resP.toFixed(2)).padStart(7),
          (p.sTime || '---').padEnd(9),
          (p.sTime ? p.obsS.toFixed(2) : '---').padStart(7),
          (p.sTime ? (p.resS >= 0 ? `+${p.resS.toFixed(2)}` : p.resS.toFixed(2)) : '---').padStart(7),
          (p.duration ?? 0).toFixed(0).padStart(5),
          (p.amplitude ?? 0).toFixed(1).padStart(6),
          (p.polarity || '-').padStart(3),
          p.quality.padStart(3),
        ].join(' ');
        lines.push(row);
      }
    }
  }

  if (config.includeIntensities) {
    lines.push('');
    lines.push('--- REPORTED & INSTRUMENTAL INTENSITIES (PEIS) ---------------------------------');
    if (event.intensities.length === 0) {
      lines.push('  None reported.');
    } else {
      const { felt, instrumental } = splitIntensitiesByCategory(event.intensities);
      for (const item of felt) {
        lines.push(`  Intensity ${item.peis.padEnd(4)} - ${item.locality}`);
      }
      if (instrumental.length > 0) {
        if (felt.length > 0) lines.push('');
        lines.push('  Instrumental Intensity:');
        for (const item of instrumental) {
          lines.push(`  Intensity ${item.peis.padEnd(4)} - ${item.locality}`);
        }
      }
    }
  }

  lines.push('');
  lines.push(
    `Prepared By  : ${event.issuedBy || 'Duty Seismologist'}   |   Issued: ${event.issuedDate || 'Pending'} ${event.issuedTime || ''}`
  );
  lines.push('================================================================================');
  return lines.join('\n');
}

export function buildDataPrintPdfDoc(params: {
  event: EQPEvent;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  config: DataPrintConfig;
  autoPrint?: boolean;
  freshness?: MagnitudeFreshnessInspection;
}): { doc: jsPDF; pdfFilename: string } {
  const { event, primaryLocationLabel, faultGeneratorLabel, config, autoPrint = false } = params;
  const doc = new jsPDF({
    orientation: config.orientation,
    unit: 'mm',
    format: 'a4',
  });
  if (autoPrint) {
    doc.autoPrint();
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 14) {
      doc.addPage();
      y = 14;
    }
  };

  // Document Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`EQP SEISMIC DATA PRINTOUT — ${event.filename || 'UNSAVED'}`, margin, y);
  y += 5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Path: ${event.filePath || event.filename}  |  Origin GMT: ${event.originDateGmt} ${event.originTimeGmt}  |  LST: ${event.originDateLst} ${event.originTimeLst}`,
    margin,
    y
  );
  y += 3.5;

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const unlocated = isEventUnlocated(event);

  if (config.includeHypocenter) {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Hypocenter & Location Solution', margin, y);
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    if (unlocated) {
      doc.text(
        `Status: UNLOCATED / PENDING SOLVE   |   Trial Depth: ${event.trialDepthKm.toFixed(1)} km`,
        margin + 2,
        y
      );
      y += 6;
    } else {
      doc.text(
        `LAT: ${event.lat.toFixed(3)}° N   LON: ${event.lon.toFixed(3)}° E   DEPTH: ${event.depthKm.toFixed(1)} km   (Trial ${event.trialDepthKm.toFixed(1)} km)`,
        margin + 2,
        y
      );
      y += 4.5;
      doc.text(
        `Iterations: ${event.iterations}   RMS: ${event.rmsSec.toFixed(2)}s   ERH: +/-${event.errKm.toFixed(2)} km   dLat: +/-${event.errLatDeg.toFixed(4)}°   dLon: +/-${event.errLonDeg.toFixed(4)}°`,
        margin + 2,
        y
      );
      y += 6;
    }
  }

  if (config.includeMagnitudes) {
    const magRes = resolveBulletinMagnitude(event, params.freshness);
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Magnitude Evaluation', margin, y);
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    const magSummaryLine =
      event.magnitudeMetadata && event.magnitudeMetadata.preferredMethodId !== 'eqp-legacy-ms'
        ? `Preferred: ${magRes.displayText}  |  Method: ${magRes.provenanceLabel}  |  Stations: ${magRes.isStale ? 'Stale' : event.magnitudeMetadata.contributingStations}`
        : magRes.isStale
          ? `Preferred: ${magRes.displayText}  |  Method: ${formatLegacyScaleLong(event.preferredScale)}`
          : `Preferred: ${magRes.displayText} (${formatLegacyScaleLong(event.preferredScale)})   |   Ms: ${event.ms.toFixed(1)}   |   Mb: ${event.mb.toFixed(1)}   |   ML: ${event.md.toFixed(1)}`;
    doc.text(magSummaryLine, margin + 2, y);
    y += 6;
  }

  if (config.includeLocation) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Reference Bearing & Fault Context', margin, y);
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(`Primary Location : ${primaryLocationLabel || 'Pending location'}`, margin + 2, y);
    y += 4.2;
    doc.text(`Central Office   : ${event.centralOfficeBearing || 'Pending location'}`, margin + 2, y);
    y += 4.2;
    if (faultGeneratorLabel) {
      doc.text(`Fault Generator  : ${faultGeneratorLabel}`, margin + 2, y);
      y += 4.2;
    }
    y += 2;
  }

  if (config.includePhasePicks) {
    const picks = config.includeExcludedPicks
      ? event.picks
      : event.picks.filter((p) => !p.pExcluded);

    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`Station Phase Picks Matrix (${picks.length} records)`, margin, y);
    y += 4.5;

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 3.2, contentWidth, 5.2, 'F');
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      'STA   DELTA   AZIM   P-TIME    OBSp    CALCp   RESp   S-TIME    OBSs   RESs  DUR  AMP  POL WT',
      margin + 1.5,
      y
    );
    y += 4.5;

    doc.setFont('courier', 'normal');
    if (picks.length === 0) {
      doc.text('No station phase picks recorded.', margin + 2, y);
      y += 5;
    } else {
      for (const p of picks) {
        ensureSpace(5);
        const mark = p.pExcluded ? '*' : ' ';
        const line = [
          `${mark}${p.sta.padEnd(4)}`,
          p.delta.toFixed(2).padStart(5),
          p.azim.toFixed(1).padStart(6),
          p.pTime.padEnd(8),
          p.obsP.toFixed(2).padStart(7),
          p.calcP.toFixed(2).padStart(7),
          (p.resP >= 0 ? `+${p.resP.toFixed(2)}` : p.resP.toFixed(2)).padStart(6),
          (p.sTime || '---').padEnd(8),
          (p.sTime ? p.obsS.toFixed(2) : '---').padStart(6),
          (p.sTime ? (p.resS >= 0 ? `+${p.resS.toFixed(2)}` : p.resS.toFixed(2)) : '---').padStart(6),
          (p.duration ?? 0).toFixed(0).padStart(4),
          (p.amplitude ?? 0).toFixed(1).padStart(5),
          (p.polarity || '-').padStart(2),
          p.quality.padStart(2),
        ].join(' ');
        doc.setTextColor(p.pExcluded ? 148 : 30, p.pExcluded ? 163 : 41, p.pExcluded ? 184 : 59);
        doc.text(line, margin + 1.5, y);
        y += 4;
      }
    }
    y += 2;
  }

  if (config.includeIntensities) {
    ensureSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Reported & Instrumental Intensities (PEIS)', margin, y);
    y += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    if (event.intensities.length === 0) {
      doc.text('None reported.', margin + 2, y);
      y += 5;
    } else {
      const { felt, instrumental } = splitIntensitiesByCategory(event.intensities);
      for (const item of felt) {
        ensureSpace(5);
        doc.text(`Intensity ${item.peis.padEnd(4)} - ${item.locality}`, margin + 2, y);
        y += 4.2;
      }
      if (instrumental.length > 0) {
        if (felt.length > 0) y += 2;
        ensureSpace(10);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text('Instrumental Intensity:', margin + 2, y);
        y += 4.2;
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(30, 41, 59);
        for (const item of instrumental) {
          ensureSpace(5);
          doc.text(`Intensity ${item.peis.padEnd(4)} - ${item.locality}`, margin + 2, y);
          y += 4.2;
        }
      }
    }
  }

  const baseName = (event.filename || 'EQP_DATA').replace(/\.eqp$/i, '');
  const pdfFilename = `EQDATA_${baseName}.pdf`;
  return { doc, pdfFilename };
}

export function downloadDataPrintPdf(params: {
  event: EQPEvent;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  config: DataPrintConfig;
  freshness?: MagnitudeFreshnessInspection;
}): string {
  const { doc, pdfFilename } = buildDataPrintPdfDoc(params);
  doc.save(pdfFilename);
  return pdfFilename;
}

export function createDataPrintPdfBlobUrl(params: {
  event: EQPEvent;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  config: DataPrintConfig;
  freshness?: MagnitudeFreshnessInspection;
}): { blobUrl: string; pdfFilename: string } {
  const { doc, pdfFilename } = buildDataPrintPdfDoc({
    ...params,
    autoPrint: true,
  });
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, pdfFilename };
}
