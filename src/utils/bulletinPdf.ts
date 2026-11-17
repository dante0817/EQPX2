import { jsPDF } from 'jspdf';
import {
  computePickDurationMagnitudes,
  isDurationMagnitudeEligible,
} from '../components/MagnitudeDurationPopup';
import {
  DEFAULT_PH_CENTER,
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  StationPick,
} from '../data/eqpData';
import { formatGroupedBulletinIntensityBlock } from './intensityFormat';
import {
  formatLegacyScaleShort,
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from './magnitudeEngine';

export interface BulletinPdfOptions {
  event: EQPEvent;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  includeFaultGenerator: boolean;
  includeMapAsset: boolean;
  includeChartsAsset: boolean;
  highlightResP: boolean;
  highlightResS: boolean;
  varianceK: number;
  freshness?: MagnitudeFreshnessInspection;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  fill: string,
  stroke: string
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

export function renderEpicenterMapDataUrl(event: EQPEvent): string {
  const width = 1040;
  const height = 620;
  const mapBottom = 568;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const unlocated = isEventUnlocated(event);
  const centerLon = unlocated ? DEFAULT_PH_CENTER.lon : event.lon;
  const centerLat = unlocated ? DEFAULT_PH_CENTER.lat : event.lat;

  const lonSpan = 7.5;
  const latSpan = (lonSpan * mapBottom) / width;
  const minLon = centerLon - lonSpan / 2;
  const maxLon = centerLon + lonSpan / 2;
  const minLat = centerLat - latSpan / 2;
  const maxLat = centerLat + latSpan / 2;

  const project = (lon: number, lat: number): [number, number] => [
    ((lon - minLon) / (maxLon - minLon)) * width,
    mapBottom - ((lat - minLat) / (maxLat - minLat)) * mapBottom,
  ];

  // Ocean backdrop
  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(0, 0, width, mapBottom);

  // Coordinate gridlines
  ctx.save();
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.font = '600 16px monospace';
  ctx.fillStyle = '#475569';

  for (let lon = Math.ceil(minLon); lon <= Math.floor(maxLon); lon++) {
    const [x] = project(lon, centerLat);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, mapBottom);
    ctx.stroke();
    ctx.fillText(`${lon}°E`, x + 6, 22);
  }
  for (let lat = Math.ceil(minLat); lat <= Math.floor(maxLat); lat++) {
    const [, y] = project(centerLon, lat);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillText(`${lat}°N`, 10, y - 6);
  }
  ctx.restore();

  // Clip map region before drawing islands, faults, and markers
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, mapBottom);
  ctx.clip();

  // Island polygons
  ISLAND_POLYGONS.forEach((island) => {
    ctx.beginPath();
    island.points.forEach(([lon, lat], idx) => {
      const [x, y] = project(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#94a3b8';
    ctx.stroke();
  });

  // Active faults & trenches
  ctx.save();
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 2.4;
  ctx.setLineDash([8, 5]);
  FAULT_TRACES.forEach((fault) => {
    ctx.beginPath();
    fault.points.forEach(([lon, lat], idx) => {
      const [x, y] = project(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.restore();

  const [epiX, epiY] = project(centerLon, centerLat);

  // Station vectors & markers
  event.picks.forEach((pick: StationPick) => {
    const [sx, sy] = project(pick.lon, pick.lat);
    const maxRes = Math.max(Math.abs(pick.resP), Math.abs(pick.resS));
    const color = pick.pExcluded
      ? '#94a3b8'
      : maxRes >= 1.0
        ? '#dc2626'
        : maxRes > 0.5
          ? '#d97706'
          : '#2563eb';

    if (!unlocated && !pick.pExcluded) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(epiX, epiY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.moveTo(sx, sy - 9);
    ctx.lineTo(sx - 8, sy + 7);
    ctx.lineTo(sx + 8, sy + 7);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.font = '700 15px monospace';
    ctx.fillStyle = '#1e293b';
    ctx.fillText(pick.sta, sx + 12, sy + 5);
  });

  if (!unlocated) {
    // Error ellipse + epicenter star
    ctx.beginPath();
    ctx.ellipse(epiX, epiY, 24, 16, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220, 38, 38, 0.16)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();

    drawStar(ctx, epiX, epiY, 15, 6.5, '#dc2626', '#ffffff');
  }
  ctx.restore();

  // Bottom Legend Bar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, mapBottom, width, height - mapBottom);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, mapBottom);
  ctx.lineTo(width, mapBottom);
  ctx.stroke();

  const legendY = mapBottom + 32;
  ctx.font = '600 15px sans-serif';
  ctx.fillStyle = '#334155';

  drawStar(ctx, 28, legendY - 5, 8, 3.5, '#dc2626', '#ffffff');
  ctx.fillStyle = '#334155';
  ctx.fillText('Epicenter', 44, legendY);

  ctx.fillStyle = '#2563eb';
  ctx.fillRect(145, legendY - 12, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.fillText('Active Station (|res| <= 0.50s)', 165, legendY);

  ctx.fillStyle = '#d97706';
  ctx.fillRect(405, legendY - 12, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.fillText('Warning (> 0.50s)', 425, legendY);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(585, legendY - 12, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.fillText('Critical (>= 1.00s)', 605, legendY);

  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(765, legendY - 6);
  ctx.lineTo(795, legendY - 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#334155';
  ctx.fillText('Active Fault / Trench', 804, legendY);

  return canvas.toDataURL('image/png');
}

export function renderTravelTimeChartDataUrl(
  event: EQPEvent,
  highlightResP: boolean,
  highlightResS: boolean
): string {
  const width = 1040;
  const height = 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const pad = { top: 36, right: 40, bottom: 78, left: 74 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const pPoints = event.picks.filter((p) => p.pTime.trim() !== '' && !p.pExcluded && p.obsP > 0);
  const sPoints = event.picks.filter((p) => p.sTime.trim() !== '' && !p.sExcluded && p.obsS > 0);

  const allDeltas = [...pPoints, ...sPoints].map((p) => p.delta);
  const allTimes = [
    ...pPoints.map((p) => Math.max(p.obsP, p.calcP)),
    ...sPoints.map((p) => Math.max(p.obsS, p.calcS)),
  ];

  const maxDelta = allDeltas.length > 0 ? Math.max(...allDeltas) + 0.35 : 5.0;
  const maxTime = allTimes.length > 0 ? Math.max(...allTimes) + 10 : 120;

  const toX = (delta: number) => pad.left + (delta / maxDelta) * plotW;
  const toY = (t: number) => pad.top + plotH - (t / maxTime) * plotH;

  // Grid & Axes
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.font = '500 14px monospace';
  ctx.fillStyle = '#475569';

  for (let i = 0; i <= 5; i++) {
    const tVal = (maxTime / 5) * i;
    const y = toY(tVal);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${tVal.toFixed(0)}s`, pad.left - 10, y + 5);
  }
  for (let i = 0; i <= 5; i++) {
    const dVal = (maxDelta / 5) * i;
    const x = toX(dVal);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`${dVal.toFixed(1)}°`, x, pad.top + plotH + 22);
  }

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(width - pad.right, pad.top + plotH);
  ctx.stroke();

  // Axis Titles
  ctx.font = '600 14px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.textAlign = 'center';
  ctx.fillText('Epicentral Distance Delta (deg)', pad.left + plotW / 2, pad.top + plotH + 48);

  ctx.save();
  ctx.translate(22, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Travel Time (s)', 0, 0);
  ctx.restore();

  // Calc Trend Curves
  const pSorted = [...pPoints].sort((a, b) => a.delta - b.delta);
  if (pSorted.length >= 2) {
    ctx.save();
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    pSorted.forEach((p, idx) => {
      const x = toX(p.delta);
      const y = toY(p.calcP);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  const sSorted = [...sPoints].sort((a, b) => a.delta - b.delta);
  if (sSorted.length >= 2) {
    ctx.save();
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    sSorted.forEach((p, idx) => {
      const x = toX(p.delta);
      const y = toY(p.calcS);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // OBSp points
  ctx.textAlign = 'left';
  pPoints.forEach((p) => {
    const x = toX(p.delta);
    const y = toY(p.obsP);
    const flagged = highlightResP && Math.abs(p.resP) > 0.5;
    const color = flagged ? (Math.abs(p.resP) >= 1.0 ? '#dc2626' : '#d97706') : '#2563eb';

    if (flagged) {
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = `${color}28`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.font = flagged ? '700 13px monospace' : '500 13px monospace';
    ctx.fillStyle = flagged ? color : '#334155';
    ctx.fillText(p.sta, x + 10, y + 4);
  });

  // OBSs points
  sPoints.forEach((p) => {
    const x = toX(p.delta);
    const y = toY(p.obsS);
    const flagged = highlightResS && Math.abs(p.resS) > 0.5;
    const color = flagged ? (Math.abs(p.resS) >= 1.0 ? '#dc2626' : '#d97706') : '#0d9488';

    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 7, y + 6);
    ctx.lineTo(x - 7, y + 6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.font = flagged ? '700 13px monospace' : '500 13px monospace';
    ctx.fillStyle = flagged ? color : '#334155';
    ctx.fillText(`${p.sta} (S)`, x + 10, y + 4);
  });

  // Legend
  const ly = height - 14;
  ctx.font = '600 13px sans-serif';
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(pad.left + 6, ly - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText('OBSp (Nominal)', pad.left + 18, ly);

  ctx.fillStyle = '#0d9488';
  ctx.fillRect(pad.left + 150, ly - 9, 10, 10);
  ctx.fillStyle = '#334155';
  ctx.fillText('OBSs (Nominal)', pad.left + 166, ly);

  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.arc(pad.left + 305, ly - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText('Warning (> 0.50s)', pad.left + 316, ly);

  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(pad.left + 465, ly - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText('Critical (>= 1.00s)', pad.left + 476, ly);

  return canvas.toDataURL('image/png');
}

export function renderMagnitudeChartDataUrl(event: EQPEvent, varianceK: number): string {
  const width = 1040;
  const height = 440;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const scaleKey = event.preferredScale.toLowerCase() as 'ms' | 'mb' | 'md';
  const valid = event.picks
    .filter(isDurationMagnitudeEligible)
    .map((p) => {
      const computed = computePickDurationMagnitudes(p, event.depthKm);
      const val = computed
        ? Number(
            (event.preferredScale === 'Ms'
              ? computed.ms
              : event.preferredScale === 'Mb'
                ? computed.mb
                : computed.ml
            ).toFixed(1)
          )
        : p[scaleKey];
      return { sta: p.sta, val };
    })
    .filter((item): item is { sta: string; val: number } => item.val !== null)
    .sort((a, b) => a.val - b.val);

  if (valid.length === 0) {
    ctx.font = '600 16px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText(`No station ${event.preferredScale} readings available.`, width / 2, height / 2);
    return canvas.toDataURL('image/png');
  }

  const meanAll = valid.reduce((s, x) => s + x.val, 0) / valid.length;
  const variance = valid.reduce((s, x) => s + Math.pow(x.val - meanAll, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  const lowerBound = meanAll - varianceK * stdDev;
  const upperBound = meanAll + varianceK * stdDev;

  const outliers = new Set<string>();
  const kept: number[] = [];
  valid.forEach((item) => {
    if (stdDev > 0.05 && Math.abs(item.val - meanAll) > varianceK * stdDev) {
      outliers.add(item.sta);
    } else {
      kept.push(item.val);
    }
  });
  const filteredMean = kept.length > 0 ? kept.reduce((s, v) => s + v, 0) / kept.length : meanAll;

  const minY = Math.floor((Math.min(...valid.map((v) => v.val), lowerBound) - 0.25) * 10) / 10;
  const maxY = Math.ceil((Math.max(...valid.map((v) => v.val), upperBound) + 0.25) * 10) / 10;

  const pad = { top: 36, right: 36, bottom: 74, left: 68 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const toY = (val: number) => pad.top + plotH - ((val - minY) / (maxY - minY)) * plotH;
  const stepX = valid.length > 1 ? plotW / (valid.length + 1) : plotW / 2;

  // Acceptance band shading
  const yTop = toY(upperBound);
  const yBot = toY(lowerBound);
  ctx.fillStyle = 'rgba(239, 246, 255, 0.9)';
  ctx.fillRect(pad.left, yTop, plotW, yBot - yTop);

  // Horizontal grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.font = '500 14px monospace';
  ctx.fillStyle = '#475569';
  for (let i = 0; i <= 5; i++) {
    const val = minY + ((maxY - minY) / 5) * i;
    const y = toY(val);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(1), pad.left - 10, y + 5);
  }

  // Corridor & mean lines
  ctx.save();
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.left, yTop);
  ctx.lineTo(width - pad.right, yTop);
  ctx.moveTo(pad.left, yBot);
  ctx.lineTo(width - pad.right, yBot);
  ctx.stroke();

  ctx.strokeStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(pad.left, toY(meanAll));
  ctx.lineTo(width - pad.right, toY(meanAll));
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, toY(filteredMean));
  ctx.lineTo(width - pad.right, toY(filteredMean));
  ctx.stroke();

  // Axes border
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(width - pad.right, pad.top + plotH);
  ctx.stroke();

  // Station markers
  valid.forEach((item, idx) => {
    const x = pad.left + stepX * (idx + 1);
    const y = toY(item.val);
    const isOutlier = outliers.has(item.sta);
    const fill = isOutlier ? '#d97706' : '#2563eb';

    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = isOutlier ? 'rgba(254, 243, 199, 0.9)' : 'rgba(219, 234, 254, 0.9)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.font = '600 13px monospace';
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'center';
    ctx.fillText(item.sta, x, pad.top + plotH + 22);
  });

  // Annotations
  ctx.font = '600 13px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b45309';
  ctx.fillText(`+Kσ (${upperBound.toFixed(2)})`, width - pad.right - 8, yTop - 6);
  ctx.fillText(`-Kσ (${lowerBound.toFixed(2)})`, width - pad.right - 8, yBot + 16);

  // Legend
  const ly = height - 14;
  ctx.textAlign = 'left';
  ctx.font = '600 13px sans-serif';
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(pad.left + 6, ly - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText('Included Station', pad.left + 18, ly);

  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.arc(pad.left + 165, ly - 4, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#334155';
  ctx.fillText(`Outlier (> ${varianceK.toFixed(2)}σ)`, pad.left + 177, ly);

  ctx.fillStyle = '#475569';
  const shortScale = formatLegacyScaleShort(event.preferredScale);
  ctx.fillText(
    `Raw Mean: ${meanAll.toFixed(2)} · Filtered ${shortScale}: ${filteredMean.toFixed(1)}`,
    pad.left + 355,
    ly
  );

  return canvas.toDataURL('image/png');
}

export function downloadBulletinPdf(options: BulletinPdfOptions): string {
  const {
    event,
    primaryLocationLabel,
    faultGeneratorLabel,
    includeFaultGenerator,
    includeMapAsset,
    includeChartsAsset,
    highlightResP,
    highlightResS,
    varianceK,
    freshness,
  } = options;

  const magResolution = resolveBulletinMagnitude(event, freshness);
  if (magResolution.isStale || magResolution.requiresAnalystConfirmation) {
    throw new Error(
      magResolution.warning ||
        'Bulletin PDF export blocked: magnitude calculation requires recalculation or analyst confirmation.'
    );
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const isLegacyMag =
    !event.magnitudeMetadata ||
    event.magnitudeMetadata.preferredMethodId === 'eqp-legacy-ms';

  // Page 1 Header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('PHILIPPINE INSTITUTE OF VOLCANOLOGY AND SEISMOLOGY', pageWidth / 2, y, {
    align: 'center',
  });
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `EARTHQUAKE INFORMATION NO. ${String(event.bulletinNo).padStart(2, '0')}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 3.5;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const unlocated = isEventUnlocated(event);

  // Metadata Key-Value Grid
  const rows: Array<[string, string]> = [
    ['Date / Time (PST)', `${event.originDateLst}  ${event.originTimeLst} (GMT: ${event.originTimeGmt})`],
    [
      'Magnitude',
      magResolution.value === null
        ? magResolution.displayText
        : isLegacyMag
          ? `${magResolution.displayText}   (Mb ${event.mb.toFixed(1)} / ML ${event.md.toFixed(1)})`
          : magResolution.displayText,
    ],
    [
      'Epicenter Coordinates',
      unlocated
        ? 'Pending location'
        : `${event.lat.toFixed(3)}° N, ${event.lon.toFixed(3)}° E   (±${event.errKm.toFixed(2)} km)`,
    ],
    [
      'Depth of Focus',
      unlocated
        ? 'Pending'
        : `${Math.round(event.depthKm).toString().padStart(3, '0')} km   (RMS: ${event.rmsSec.toFixed(2)}s)`,
    ],
    ['Location', primaryLocationLabel],
    ['Origin', event.originType ?? 'TECTONIC'],
    ['Central Office Bearing', event.centralOfficeBearing || 'Pending location'],
  ];
  if (includeFaultGenerator && faultGeneratorLabel) {
    rows.push(['Fault Generator', faultGeneratorLabel]);
  }

  doc.setFontSize(9.5);
  rows.forEach(([label, value], idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 4, contentWidth, 6.8, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(label, margin + 2, y);

    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    const wrapped = doc.splitTextToSize(value, contentWidth - 52);
    doc.text(wrapped, margin + 48, y);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 2.5, pageWidth - margin, y + 2.5);
    y += 7;
  });

  y += 3;

  // Embedded Regional Epicenter Map Asset
  if (includeMapAsset) {
    const mapUrl = renderEpicenterMapDataUrl(event);
    if (mapUrl) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('Epicenter & Seismic Network Map', margin, y);
      y += 2.5;

      const mapW = contentWidth;
      const mapH = (mapW * 620) / 1040;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.rect(margin, y, mapW, mapH);
      doc.addImage(mapUrl, 'PNG', margin, y, mapW, mapH);
      y += mapH + 6;
    }
  }

  // Reported Intensities
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Reported Macroseismic Intensities (PEIS)', margin, y);
  y += 4.5;

  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  if (event.intensityBulletinOverride?.trim()) {
    const overrideLines = event.intensityBulletinOverride.split(/\r?\n/);
    overrideLines.forEach((line) => {
      doc.text(line, margin + 2, y);
      y += 4.5;
    });
  } else {
    const grouped = formatGroupedBulletinIntensityBlock(event.intensities);
    if (grouped.feltGroups.length === 0 && grouped.instrumentalGroups.length === 0) {
      doc.text('No felt or instrumental intensity reports received.', margin + 2, y);
      y += 5;
    } else {
      grouped.feltGroups.forEach((group) => {
        group.formattedBlock.split('\n').forEach((line) => {
          doc.text(line, margin + 2, y);
          y += 4.5;
        });
      });
      if (grouped.instrumentalGroups.length > 0) {
        if (grouped.feltGroups.length > 0) y += 1.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        doc.text('Instrumental Intensity:', margin + 2, y);
        y += 4.5;
        doc.setFont('courier', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        grouped.instrumentalGroups.forEach((group) => {
          group.formattedBlock.split('\n').forEach((line) => {
            doc.text(line, margin + 2, y);
            y += 4.5;
          });
        });
      }
    }
  }

  y += 2;

  // Assessment & Remarks
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Expecting Damage: ${event.expectingDamage ? 'YES' : 'NO'}     |     Expecting Aftershocks: ${event.expectingAftershocks ? 'YES' : 'NO'}     |     Tsunami Threat: ${event.tsunamiStatus}`,
    margin,
    y
  );
  y += 5.5;

  if (event.remarks.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const remarkLines = doc.splitTextToSize(`Remarks: ${event.remarks}`, contentWidth);
    doc.text(remarkLines, margin, y);
    y += remarkLines.length * 4.2 + 2;
  }

  // Footer Page 1
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Issued: ${event.issuedDate || 'Pending'} · ${event.issuedTime || '—'}   |   Prepared by: ${event.issuedBy || '—'}   |   Source: ${event.filename}`,
    margin,
    284
  );
  doc.text(includeChartsAsset ? 'Page 1 of 2' : 'Page 1 of 1', pageWidth - margin, 284, {
    align: 'right',
  });

  // Page 2: Technical Verification Charts & Residuals
  if (includeChartsAsset) {
    doc.addPage();
    let py = 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Technical Verification Assets — Bulletin No. ${String(event.bulletinNo).padStart(2, '0')}`,
      margin,
      py
    );
    py += 4.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${event.filename} | Origin ${event.originDateGmt} ${event.originTimeGmt} GMT | RMS ${event.rmsSec.toFixed(2)}s`,
      margin,
      py
    );
    py += 3.5;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(margin, py, pageWidth - margin, py);
    py += 6;

    // Figure 2: Travel-Time Scatter Chart
    const ttUrl = renderTravelTimeChartDataUrl(event, highlightResP, highlightResS);
    if (ttUrl) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('Phase Travel-Time vs. Epicentral Distance (OBSp / OBSs vs. Delta)', margin, py);
      py += 2.5;

      const chartW = contentWidth;
      const chartH = (chartW * 480) / 1040;
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, py, chartW, chartH);
      doc.addImage(ttUrl, 'PNG', margin, py, chartW, chartH);
      py += chartH + 7;
    }

    // Figure 3: Magnitude Distribution Chart (EQP Legacy outlier view)
    const magUrl = isLegacyMag ? renderMagnitudeChartDataUrl(event, varianceK) : null;
    if (magUrl) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `Station Magnitude Distribution & Outlier Corridor (${formatLegacyScaleShort(event.preferredScale)} — EQP Legacy, K = ${varianceK.toFixed(2)}σ)`,
        margin,
        py
      );
      py += 2.5;

      const chartW = contentWidth;
      const chartH = (chartW * 440) / 1040;
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, py, chartW, chartH);
      doc.addImage(magUrl, 'PNG', margin, py, chartW, chartH);
      py += chartH + 7;
    }

    // Compact Station Residuals Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Station Phase & Residual Summary (PLOT.OUT)', margin, py);
    py += 4;

    doc.setFillColor(241, 245, 249);
    doc.rect(margin, py - 3.2, contentWidth, 5.2, 'F');
    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('STA   DELTA    AZIM    RESp     RESs     OBSp     OBSs    MAG     STATUS', margin + 2, py);
    py += 4.5;

    const preferredStationsMap = new Map(
      (
        (!isLegacyMag &&
          event.magnitudeMetadata?.resultsByAlgorithm[
            event.magnitudeMetadata.preferredMethodId
          ]?.stationDetails) ||
        []
      ).map((s) => [s.pickId, s.magnitude])
    );

    doc.setFont('courier', 'normal');
    event.picks.slice(0, 12).forEach((p) => {
      let magVal: number | null = null;
      if (isLegacyMag) {
        const durMag = computePickDurationMagnitudes(p, event.depthKm);
        magVal = durMag
          ? event.preferredScale === 'Ms'
            ? durMag.ms
            : event.preferredScale === 'Mb'
              ? durMag.mb
              : durMag.ml
          : null;
      } else {
        magVal = preferredStationsMap.get(p.id) ?? null;
      }
      const status = p.pExcluded ? 'EXCL (*)' : Math.abs(p.resP) > 0.5 ? 'WARN' : 'OK';
      const line = [
        p.sta.padEnd(5),
        p.delta.toFixed(2).padStart(5),
        p.azim.toFixed(1).padStart(7),
        (p.resP >= 0 ? `+${p.resP.toFixed(2)}` : p.resP.toFixed(2)).padStart(8),
        (p.sTime ? (p.resS >= 0 ? `+${p.resS.toFixed(2)}` : p.resS.toFixed(2)) : '0.00').padStart(8),
        p.obsP.toFixed(2).padStart(8),
        p.obsS.toFixed(2).padStart(8),
        (magVal !== null ? magVal.toFixed(1) : '---').padStart(6),
        `  ${status}`,
      ].join(' ');
      doc.setTextColor(p.pExcluded ? 148 : 30, p.pExcluded ? 163 : 41, p.pExcluded ? 184 : 59);
      doc.text(line, margin + 2, py);
      py += 4;
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Issued: ${event.issuedDate || 'Pending'} · ${event.issuedTime || '—'}   |   Prepared by: ${event.issuedBy || '—'}   |   Source: ${event.filename}`,
      margin,
      284
    );
    doc.text('Page 2 of 2', pageWidth - margin, 284, { align: 'right' });
  }

  const baseName = event.filename.replace(/\.eqp$/i, '');
  const pdfFilename = `EQB_${baseName}_B${event.bulletinNo}.pdf`;
  doc.save(pdfFilename);
  return pdfFilename;
}
