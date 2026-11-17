import { EarthquakeOriginType, EQPEvent, isEventUnlocated } from '../data/eqpData';
import { formatGroupedBulletinIntensityBlock } from './intensityFormat';
import {
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from './magnitudeEngine';

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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateDisplay(isoDate: string): {
  display: string;
  yyyy: string;
  mm: string;
  dd: string;
} {
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    const monthIdx = Math.max(0, Math.min(11, (Number(mm) || 1) - 1));
    return {
      display: `${dd.padStart(2, '0')} ${MONTHS_SHORT[monthIdx]} ${yyyy}`,
      yyyy,
      mm: mm.padStart(2, '0'),
      dd: dd.padStart(2, '0'),
    };
  }
  return { display: isoDate || '01 Jan 2026', yyyy: '2026', mm: '01', dd: '01' };
}

function formatTimeDisplay(
  timeStr: string,
  use12Hour: boolean
): { full: string; hh: string; min: string } {
  const parts = timeStr.split(':');
  const hhNum = Math.max(0, Math.min(23, Number(parts[0]) || 0));
  const minNum = Math.max(0, Math.min(59, Number(parts[1]) || 0));
  const secNum = Math.max(0, Math.min(59, Math.round(Number(parts[2]) || 0)));
  const hh = String(hhNum).padStart(2, '0');
  const min = String(minNum).padStart(2, '0');
  const sec = String(secNum).padStart(2, '0');

  if (!use12Hour) {
    return { full: `${hh}:${min}:${sec}`, hh, min };
  }
  const amPm = hhNum >= 12 ? 'PM' : 'AM';
  const hh12 = String(hhNum % 12 || 12).padStart(2, '0');
  return { full: `${hh12}:${min}:${sec} ${amPm}`, hh, min };
}

function formatIssuedFallback(): { date: string; time: string } {
  const now = new Date();
  const lst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dd = String(lst.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[lst.getUTCMonth()];
  const yyyy = lst.getUTCFullYear();
  const h24 = lst.getUTCHours();
  const amPm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = String(h24 % 12 || 12).padStart(2, '0');
  const min = String(lst.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${dd} ${mon} ${yyyy}`,
    time: `${h12}:${min} ${amPm}`,
  };
}

export interface BuildBulletinHtmlParams {
  event: EQPEvent;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  printSource: boolean;
  mapSvgMarkup?: string;
  freshness?: MagnitudeFreshnessInspection;
}

export function buildBulletinHtmlDocument({
  event,
  primaryLocationLabel,
  faultGeneratorLabel,
  printSource,
  mapSvgMarkup = '',
  freshness,
}: BuildBulletinHtmlParams): string {
  const unlocated = isEventUnlocated(event);
  const magResolution = resolveBulletinMagnitude(event, freshness);
  const activeMagnitude =
    magResolution.canPublish && magResolution.value !== null ? magResolution.value : 0;

  const gmtDate = formatDateDisplay(event.originDateGmt);
  const gmtTime = formatTimeDisplay(event.originTimeGmt, false);
  const lstDate = formatDateDisplay(event.originDateLst);
  const lstTime = formatTimeDisplay(event.originTimeLst, true);

  const fallbackIssued = formatIssuedFallback();
  const issuedDateDisplay = event.issuedDate || fallbackIssued.date;
  const issuedTimeDisplay = event.issuedTime || fallbackIssued.time;
  const issuedByDisplay = event.issuedBy || 'DSS';
  const originType: EarthquakeOriginType = event.originType ?? 'TECTONIC';
  const bulletinNo = Math.max(1, Math.trunc(event.bulletinNo || 1));

  const magCode = String(Math.round(Math.max(0, activeMagnitude) * 10)).padStart(2, '0');
  const depthCode = String(Math.round(Math.max(0, event.depthKm))).padStart(3, '0');
  const stampCode = `${gmtDate.yyyy}_${gmtDate.mm}${gmtDate.dd}_${gmtTime.hh}${gmtTime.min}_M${magCode}D${depthCode}_B${bulletinNo}`;

  const locationLine = unlocated
    ? 'Pending location'
    : `${event.lat.toFixed(2)}°N, ${event.lon.toFixed(2)}°E - ${primaryLocationLabel}`;
  const magLine = magResolution.displayText;
  const magAdvisoryHtml =
    magResolution.canPublish && !magResolution.isAuthoritative
      ? `<tr><td>Magnitude Status</td><td>:</td><td class="val" style="color:#92400e;">Experimental / Uncalibrated (Analyst Confirmed)</td></tr>`
      : '';

  const grouped = formatGroupedBulletinIntensityBlock(event.intensities);
  let feltHtml = '';
  let instrHtml = '';
  if (event.intensityBulletinOverride?.trim()) {
    feltHtml = `<pre style="margin:4px 0 0 0;font-family:Consolas,'Courier New',monospace;font-size:11.5px;white-space:pre-wrap;">${escapeHtml(
      event.intensityBulletinOverride
    )}</pre>`;
  } else {
    feltHtml =
      grouped.feltGroups.length > 0
        ? grouped.feltGroups
            .map(
              (g) =>
                `<div style="font-family:Consolas,'Courier New',monospace;font-size:11.5px;white-space:pre;">${escapeHtml(
                  g.formattedBlock
                )}</div>`
            )
            .join('')
        : '<div>&nbsp;</div>';
    instrHtml =
      grouped.instrumentalGroups.length > 0
        ? `<div style="margin-top:10px;">Instrumental Intensity:</div><div style="margin-top:4px;">${grouped.instrumentalGroups
            .map(
              (g) =>
                `<div style="font-family:Consolas,'Courier New',monospace;font-size:11.5px;white-space:pre;">${escapeHtml(
                  g.formattedBlock
                )}</div>`
            )
            .join('')}</div>`
        : '';
  }
  const notesHtml =
    event.bulletinNote1?.trim() || event.bulletinNote2?.trim()
      ? `<div style="margin-top:8px;font-size:11px;color:#1e293b;">${
          event.bulletinNote1?.trim() ? `<div>${escapeHtml(event.bulletinNote1)}</div>` : ''
        }${
          event.bulletinNote2?.trim() ? `<div>${escapeHtml(event.bulletinNote2)}</div>` : ''
        }</div>`
      : '';
  const intensitiesHtml = `${feltHtml}${instrHtml}${notesHtml}`;

  const sourceRow =
    printSource && faultGeneratorLabel
      ? `<tr><td>Fault Generator</td><td>:</td><td class="val">${escapeHtml(faultGeneratorLabel)}</td></tr>`
      : '';

  const assetOrigin =
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin.startsWith('http')
      ? window.location.origin
      : '';
  const phivolcsLogoSrc = `${assetOrigin}/assets/aistudio/image_0e99ad12.png`;
  const bagongPilipinasLogoSrc = `${assetOrigin}/assets/aistudio/image_8f1bc708.png`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Earthquake Information No. ${bulletinNo}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; background: #f8fafc; margin: 20px; color: #0f172a; }
  .sheet { max-width: 680px; margin: 0 auto; background: #fff; border: 1px solid #64748b; }
  .hdr { background: linear-gradient(180deg, #9bb9eb 0%, #c7daf7 60%, #e6effb 100%); border-bottom: 1px solid #94a3b8; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .hdr-logo { width: 60px; height: 60px; flex-shrink: 0; background: rgba(255,255,255,0.95); border: 1px solid rgba(191,219,254,0.9); border-radius: 6px; padding: 4px; display: flex; align-items: center; justify-content: center; }
  .hdr-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .hdr-center { flex: 1; min-width: 0; text-align: center; }
  .hdr .dept { font-size: 10px; letter-spacing: 0.04em; }
  .hdr .inst { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .hdr .title { font-size: 14px; font-weight: 700; font-style: italic; color: #0c234d; margin-top: 2px; }
  .hdr .addr { font-size: 9px; margin-top: 2px; }
  table.meta { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.meta td { padding: 3px 10px; vertical-align: top; }
  table.meta td.val { color: #0000dd; font-weight: 600; }
  .sec { padding: 10px 14px; border-top: 1px solid #94a3b8; font-size: 12px; }
  .map-wrap { text-align: center; margin-bottom: 10px; }
  .map-wrap svg { max-width: 465px; width: 100%; height: auto; }
  .imp { margin: 4px; border: 1px solid #64748b; background: #b8cdf0; display: table; width: calc(100% - 8px); font-size: 11px; }
  .imp-l { display: table-cell; width: 130px; text-align: center; vertical-align: middle; font-weight: 700; color: #e60012; border-right: 1px solid #64748b; padding: 8px; }
  .imp-r { display: table-cell; padding: 6px 10px; font-weight: 600; }
  @media print {
    body { background: #ffffff !important; margin: 0 !important; }
    .sheet { max-width: 100%; border-color: #334155; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div class="hdr-logo">
        <img src="${escapeHtml(phivolcsLogoSrc)}" alt="DOST-PHIVOLCS Logo" />
      </div>
      <div class="hdr-center">
        <div class="dept">DEPARTMENT OF SCIENCE AND TECHNOLOGY</div>
        <div class="inst">PHILIPPINE INSTITUTE OF VOLCANOLOGY AND SEISMOLOGY</div>
        <div class="title">EARTHQUAKE INFORMATION NO. : ${bulletinNo}</div>
        <div class="addr">PHIVOLCS Building, C.P. Garcia Avenue, U.P.- Diliman, Quezon City, PHILIPPINES</div>
        <div class="addr">Tel.: 8426-1468 &nbsp; Fax: 8927-1087</div>
      </div>
      <div class="hdr-logo">
        <img src="${escapeHtml(bagongPilipinasLogoSrc)}" alt="Bagong Pilipinas Logo" />
      </div>
    </div>
    <div class="sec" style="border-top:none;">
      <table class="meta">
        <tr><td width="160">Date/Time</td><td width="14">:</td><td class="val">${escapeHtml(lstDate.display)} - ${escapeHtml(lstTime.full)}</td></tr>
        <tr><td>Location</td><td>:</td><td class="val">${escapeHtml(locationLine)}</td></tr>
        <tr><td>Depth of Focus (Km)</td><td>:</td><td class="val">${unlocated ? 'Pending' : escapeHtml(depthCode)}</td></tr>
        <tr><td>Origin</td><td>:</td><td class="val">${escapeHtml(originType)}</td></tr>
        <tr><td>Magnitude</td><td>:</td><td class="val">${escapeHtml(magLine)}</td></tr>
        ${magAdvisoryHtml}
        ${sourceRow}
      </table>
    </div>
    <div class="sec">
      <div class="map-wrap">${mapSvgMarkup}</div>
      <div>Reported Intensities &nbsp; :</div>
      <div style="margin:8px 0 24px 0;">${intensitiesHtml}</div>
      <div style="font-size:10px;font-family:monospace;">${escapeHtml(event.version)}<br/>${escapeHtml(stampCode)}</div>
    </div>
    <div class="sec">
      <table class="meta">
        <tr><td width="160">Expecting Damage</td><td width="14">:</td><td class="val">${event.expectingDamage ? 'YES' : 'NO'}</td></tr>
        <tr><td>Expecting Aftershocks</td><td>:</td><td class="val">${event.expectingAftershocks ? 'YES' : 'NO'}</td></tr>
        <tr><td>Issued On</td><td>:</td><td class="val">${escapeHtml(issuedDateDisplay)} - ${escapeHtml(issuedTimeDisplay)}</td></tr>
        <tr><td>Prepared by</td><td>:</td><td class="val">${escapeHtml(issuedByDisplay)}</td></tr>
      </table>
    </div>
    <div class="imp">
      <div class="imp-l">IMPORTANT</div>
      <div class="imp-r">This will be the only bulletin issued unless additional information becomes available. Always refer to the latest earthquake information posted at the PHIVOLCS official website (https://www.phivolcs.dost.gov.ph).</div>
    </div>
  </div>
</body>
</html>`;
}

export function printBulletinHtmlDocument(html: string): boolean {
  if (typeof document === 'undefined') return false;
  const printStyleTag =
    '<style>@page{size:A4 portrait;margin:10mm;}@media print{body{background:#fff !important;margin:0 !important;}}</style>';
  const printableHtml = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${printStyleTag}</head>`)
    : `${printStyleTag}${html}`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 500);
  };

  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      iframe.remove();
      return false;
    }
    doc.open();
    doc.write(printableHtml);
    doc.close();

    const win = iframe.contentWindow;
    win.addEventListener('afterprint', cleanup, { once: true });
    win.focus();
    win.print();
    window.setTimeout(cleanup, 15000);
    return true;
  } catch {
    iframe.remove();
    return false;
  }
}
