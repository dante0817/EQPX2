import {
  DEFAULT_PH_CENTER,
  type EQPEvent,
  PHILSTA_DATABASE,
  type PlaceCandidate,
  type Polarity,
  type StationMeta,
  type StationPick,
} from '../data/eqpData.ts';
import {
  formatIntensityBlockText,
  hasEventFeltDesignation,
  parseManualIntensityBlock,
} from './intensityFormat.ts';
import { tryLookupJbTravelTime } from './jbtab.ts';
import {
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from './magnitudeEngine.ts';

export const DEFAULT_SOLUTION_DRIVE = 'Y:';
export const SOLUTION_DRIVE_STORAGE_KEY = 'eqp_solution_drive';

export interface EqpSaveTarget {
  drive: string;
  driveRoot: string;
  driveKey: string;
  baseSegments: string[];
  folderSegments: string[];
  year: string;
  month: string;
  day: string;
  hh: string;
  min: string;
  magCode: string;
  depthCode: string;
  bulletinNo: number;
  isFelt: boolean;
  folderPath: string;
  filename: string;
  fullPath: string;
  filenameMagnitudeSource: 'eqp-legacy' | 'preferred-method' | 'pending-zero';
  filenameMagnitudeNote?: string;
}

export interface ParsedSolutionDrive {
  drive: string;
  driveRoot: string;
  driveKey: string;
  prefixSegments: string[];
}

function sanitizeSegment(seg: string): string {
  return seg.trim().replace(/[^A-Za-z0-9 _.-]/g, '_');
}

export function parseSolutionDrivePath(raw: string): ParsedSolutionDrive {
  const cleaned = raw.trim().replace(/\//g, '\\').replace(/\\+$/, '');
  if (!cleaned) {
    return {
      drive: DEFAULT_SOLUTION_DRIVE,
      driveRoot: DEFAULT_SOLUTION_DRIVE,
      driveKey: 'Y',
      prefixSegments: [],
    };
  }

  const driveMatch = cleaned.match(/^([a-zA-Z])(?::(?:\\(.*))?)?$/);
  if (driveMatch) {
    const driveKey = driveMatch[1].toUpperCase();
    const driveRoot = `${driveKey}:`;
    const rest = (driveMatch[2] ?? '')
      .split('\\')
      .map(sanitizeSegment)
      .filter((s) => s.length > 0 && s !== '.' && s !== '..');
    const drive = rest.length > 0 ? `${driveRoot}\\${rest.join('\\')}` : driveRoot;
    return {
      drive,
      driveRoot,
      driveKey,
      prefixSegments: rest,
    };
  }

  const parts = cleaned
    .split('\\')
    .map(sanitizeSegment)
    .filter((s) => s.length > 0 && s !== '.' && s !== '..');

  if (parts.length === 0) {
    return {
      drive: DEFAULT_SOLUTION_DRIVE,
      driveRoot: DEFAULT_SOLUTION_DRIVE,
      driveKey: 'Y',
      prefixSegments: [],
    };
  }

  const driveKey = parts[0];
  const prefixSegments = parts.slice(1);
  return {
    drive: parts.join('\\'),
    driveRoot: driveKey,
    driveKey,
    prefixSegments,
  };
}

export function normalizeSolutionDrive(raw: string): string {
  return parseSolutionDrivePath(raw).drive;
}

export interface BulletinSaveTarget {
  drive: string;
  driveRoot: string;
  driveKey: string;
  baseSegments: string[];
  folderSegments: string[];
  year: string;
  month: string;
  day: string;
  hh: string;
  min: string;
  ss: string;
  bulletinNo: number;
  isFelt: boolean;
  folderPath: string;
  filename: string;
  fullPath: string;
}

export function buildBaseSolutionSegments(prefixSegments: string[]): string[] {
  const clean = prefixSegments.filter(Boolean);
  const len = clean.length;
  if (
    len >= 2 &&
    clean[len - 2].toUpperCase() === 'EARTHQUAKE' &&
    clean[len - 1].toUpperCase() === 'SOLUTION_EQ'
  ) {
    return clean;
  }
  if (len >= 1 && clean[len - 1].toUpperCase() === 'EARTHQUAKE') {
    return [...clean, 'SOLUTION_EQ'];
  }
  return [...clean, 'EARTHQUAKE', 'SOLUTION_EQ'];
}

export function buildBaseBulletinSegments(prefixSegments: string[]): string[] {
  const clean = prefixSegments.filter(Boolean);
  const len = clean.length;
  if (
    len >= 2 &&
    clean[len - 2].toUpperCase() === 'EARTHQUAKE' &&
    clean[len - 1].toUpperCase() === 'BULLETIN_EQ'
  ) {
    return clean;
  }
  if (
    len >= 2 &&
    clean[len - 2].toUpperCase() === 'EARTHQUAKE' &&
    clean[len - 1].toUpperCase() === 'SOLUTION_EQ'
  ) {
    return [...clean.slice(0, -1), 'BULLETIN_EQ'];
  }
  if (len >= 1 && clean[len - 1].toUpperCase() === 'EARTHQUAKE') {
    return [...clean, 'BULLETIN_EQ'];
  }
  return [...clean, 'EARTHQUAKE', 'BULLETIN_EQ'];
}

export interface PrimerSaveTarget {
  drive: string;
  driveRoot: string;
  driveKey: string;
  baseSegments: string[];
  folderSegments: string[];
  year: string;
  month: string;
  day: string;
  hh: string;
  min: string;
  magCode: string;
  depthCode: string;
  bulletinNo: number;
  isFelt: boolean;
  folderPath: string;
  filename: string;
  fullPath: string;
}

export function buildBasePrimerSegments(prefixSegments: string[]): string[] {
  const clean = prefixSegments.filter(Boolean);
  const len = clean.length;
  if (
    len >= 2 &&
    clean[len - 2].toUpperCase() === 'EARTHQUAKE' &&
    clean[len - 1].toUpperCase() === 'PRIMER_EQ'
  ) {
    return clean;
  }
  if (
    len >= 2 &&
    clean[len - 2].toUpperCase() === 'EARTHQUAKE' &&
    (clean[len - 1].toUpperCase() === 'SOLUTION_EQ' ||
      clean[len - 1].toUpperCase() === 'BULLETIN_EQ')
  ) {
    return [...clean.slice(0, -1), 'PRIMER_EQ'];
  }
  if (len >= 1 && clean[len - 1].toUpperCase() === 'EARTHQUAKE') {
    return [...clean, 'PRIMER_EQ'];
  }
  return [...clean, 'EARTHQUAKE', 'PRIMER_EQ'];
}

export function buildEqpSaveTarget(
  event: EQPEvent,
  driveSetting: string = DEFAULT_SOLUTION_DRIVE,
  options?: { freshness?: MagnitudeFreshnessInspection }
): EqpSaveTarget {
  const parsed = parseSolutionDrivePath(driveSetting);
  const baseSegments = buildBaseSolutionSegments(parsed.prefixSegments);

  const dateParts = event.originDateGmt.split('-');
  const year = (dateParts[0] || '2026').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  const month = (dateParts[1] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const day = (dateParts[2] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);

  const timeParts = event.originTimeGmt.split(':');
  const hh = (timeParts[0] || '00').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const min = (timeParts[1] || '00').replace(/\D/g, '').padStart(2, '0').slice(0, 2);

  const meta = event.magnitudeMetadata;
  const isLegacyMethod = !meta || meta.preferredMethodId === 'eqp-legacy-ms';
  const magResolution = resolveBulletinMagnitude(event, options?.freshness);

  let preferredMag = 0;
  let filenameMagnitudeSource: EqpSaveTarget['filenameMagnitudeSource'] = 'eqp-legacy';
  let filenameMagnitudeNote: string | undefined;

  if (isLegacyMethod) {
    if (options?.freshness?.isStale) {
      preferredMag = 0;
      filenameMagnitudeSource = 'pending-zero';
      filenameMagnitudeNote =
        'Filename M00 reflects stale legacy magnitude requiring recalculation.';
    } else {
      preferredMag =
        event.preferredScale === 'Ms'
          ? event.ms
          : event.preferredScale === 'Mb'
            ? event.mb
            : event.md;
      filenameMagnitudeSource =
        Number.isFinite(preferredMag) && preferredMag > 0 ? 'eqp-legacy' : 'pending-zero';
    }
  } else if (magResolution.canPublish && magResolution.value !== null) {
    preferredMag = magResolution.value;
    filenameMagnitudeSource = 'preferred-method';
    filenameMagnitudeNote = `Filename Mxx reflects preferred ${magResolution.scaleLabel} magnitude; legacy .eqp [Magnitude] remains Ms/Mb/Ml while .meta.json stores active method metadata.`;
  } else {
    preferredMag = 0;
    filenameMagnitudeSource = 'pending-zero';
    filenameMagnitudeNote =
      'Filename M00 reflects pending, stale, or unapproved preferred magnitude.';
  }

  const clampedMag = Math.max(0, Math.min(9.9, Number.isFinite(preferredMag) ? preferredMag : 0));
  const magCode = String(Math.round(clampedMag * 10)).padStart(2, '0');

  const clampedDepth = Math.max(
    0,
    Math.min(999, Number.isFinite(event.depthKm) ? Math.floor(event.depthKm) : 0)
  );
  const depthCode = String(clampedDepth).padStart(3, '0');

  const bulletinNo = Math.max(1, Math.trunc(event.bulletinNo || 1));
  const isFelt = hasEventFeltDesignation(event);
  const feltIndicator = isFelt ? 'F' : '';

  const folderSegments = [...baseSegments, `Sol_${year}`, month, day];
  const folderPath = `${parsed.driveRoot}\\${folderSegments.join('\\')}`;
  const filename = `${year}_${month}${day}_${hh}${min}_M${magCode}D${depthCode}_B${bulletinNo}${feltIndicator}.eqp`;
  const fullPath = `${folderPath}\\${filename}`;

  return {
    drive: parsed.drive,
    driveRoot: parsed.driveRoot,
    driveKey: parsed.driveKey,
    baseSegments,
    folderSegments,
    year,
    month,
    day,
    hh,
    min,
    magCode,
    depthCode,
    bulletinNo,
    isFelt,
    folderPath,
    filename,
    fullPath,
    filenameMagnitudeSource,
    ...(filenameMagnitudeNote ? { filenameMagnitudeNote } : {}),
  };
}

export function buildBulletinSaveTarget(
  event: EQPEvent,
  driveSetting: string = DEFAULT_SOLUTION_DRIVE
): BulletinSaveTarget {
  const parsed = parseSolutionDrivePath(driveSetting);
  const baseSegments = buildBaseBulletinSegments(parsed.prefixSegments);

  const dateParts = event.originDateGmt.split('-');
  const year = (dateParts[0] || '2026').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  const month = (dateParts[1] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const day = (dateParts[2] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);

  const timeParts = event.originTimeGmt.split(':');
  const hh = String(Math.max(0, Math.min(23, Math.trunc(Number(timeParts[0] || 0))))).padStart(2, '0');
  const min = String(Math.max(0, Math.min(59, Math.trunc(Number(timeParts[1] || 0))))).padStart(2, '0');
  const rawSec = Number(timeParts[2] || 0);
  const ss = String(
    Math.max(0, Math.min(59, Number.isFinite(rawSec) ? Math.floor(rawSec) : 0))
  ).padStart(2, '0');

  const bulletinNo = Math.max(1, Math.trunc(event.bulletinNo || 1));
  const isFelt = hasEventFeltDesignation(event);
  const feltIndicator = isFelt ? 'F' : '';

  const folderSegments = [...baseSegments, `Bul_${year}`, month, day];
  const folderPath = `${parsed.driveRoot}\\${folderSegments.join('\\')}`;
  const filename = `${year}_${month}${day}_${hh}${min}${ss}_B${bulletinNo}${feltIndicator}.html`;
  const fullPath = `${folderPath}\\${filename}`;

  return {
    drive: parsed.drive,
    driveRoot: parsed.driveRoot,
    driveKey: parsed.driveKey,
    baseSegments,
    folderSegments,
    year,
    month,
    day,
    hh,
    min,
    ss,
    bulletinNo,
    isFelt,
    folderPath,
    filename,
    fullPath,
  };
}

export function buildPrimerSaveTarget(
  event: EQPEvent,
  driveSetting: string = DEFAULT_SOLUTION_DRIVE
): PrimerSaveTarget {
  const parsed = parseSolutionDrivePath(driveSetting);
  const baseSegments = buildBasePrimerSegments(parsed.prefixSegments);
  const eqpTarget = buildEqpSaveTarget(event, driveSetting);

  const folderSegments = [...baseSegments, `Pri_${eqpTarget.year}`, eqpTarget.month, eqpTarget.day];
  const folderPath = `${eqpTarget.driveRoot}\\${folderSegments.join('\\')}`;
  const filename = eqpTarget.filename.replace(/\.eqp$/i, '.primer.json');
  const fullPath = `${folderPath}\\${filename}`;

  return {
    drive: eqpTarget.drive,
    driveRoot: eqpTarget.driveRoot,
    driveKey: eqpTarget.driveKey,
    baseSegments,
    folderSegments,
    year: eqpTarget.year,
    month: eqpTarget.month,
    day: eqpTarget.day,
    hh: eqpTarget.hh,
    min: eqpTarget.min,
    magCode: eqpTarget.magCode,
    depthCode: eqpTarget.depthCode,
    bulletinNo: eqpTarget.bulletinNo,
    isFelt: eqpTarget.isFelt,
    folderPath,
    filename,
    fullPath,
  };
}

function formatIssuedTimestampFallback(): { issuedDate: string; issuedTime: string } {
  const now = new Date();
  const lst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(lst.getUTCDate()).padStart(2, '0');
  const mon = months[lst.getUTCMonth()] || 'Jan';
  const year = lst.getUTCFullYear();
  const h24 = lst.getUTCHours();
  const amPm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = String(h24 % 12 || 12).padStart(2, '0');
  const min = String(lst.getUTCMinutes()).padStart(2, '0');
  return {
    issuedDate: `${day} ${mon} ${year}`,
    issuedTime: `${h12}:${min} ${amPm}`,
  };
}

function encodeLocationDegrees(text: string): string {
  return text.replace(/\s*°\s*/g, ' &deg; ').replace(/\s{2,}(?=&deg;)/g, ' ');
}

function decodeLocationDegrees(text: string): string {
  return text
    .replace(/\s*&deg;\s*/gi, '° ')
    .replace(/\b([NS])\s+(\d{1,2})\s{2,}([EW])\b/g, '$1 $2° $3')
    .replace(/°\s+/g, '° ')
    .trim();
}

export function formatEqpFileContent(params: {
  event: EQPEvent;
  filePath: string;
  cityLabel?: string;
  townLabel?: string;
  generatorLabel?: string;
}): string {
  const { event, filePath, cityLabel, townLabel, generatorLabel } = params;

  const dateParts = event.originDateGmt.split('-');
  const yyyy = (dateParts[0] || '2026').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  const mm = (dateParts[1] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const dd = (dateParts[2] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
  const compactYyyyMmDd = `${yyyy}${mm}${dd}`;

  const timeParts = event.originTimeGmt.split(':');
  const hrNum = Math.trunc(Number(timeParts[0] || 0));
  const minNum = Math.trunc(Number(timeParts[1] || 0));
  const secVal = Number(timeParts[2] || 0);
  const hhStr = String(hrNum).padStart(2, '0');
  const minStr = String(minNum).padStart(2, '0');
  const secIntStr = String(Math.floor(secVal)).padStart(2, '0');
  const secFmt = secVal.toFixed(2).padStart(5);
  const timeFull = `${hhStr}:${minStr}:${secVal.toFixed(2).padStart(5, '0')}`;

  // [Data] header counter + rows (excluded P/S phases marked with *)
  const activePicks = event.picks.filter((p) => !p.pExcluded);
  const totalStations = event.picks.length;
  const usedStations = event.picks.filter(
    (p) =>
      (p.pTime.trim() !== '' && !p.pExcluded) ||
      (p.sTime.trim() !== '' && !p.sExcluded)
  ).length;
  const pPicks = event.picks.filter((p) => p.pTime.trim() !== '');
  const totalP = pPicks.length;
  const usedP = pPicks.filter((p) => !p.pExcluded).length;
  const sPicks = event.picks.filter((p) => p.sTime.trim() !== '');
  const totalS = sPicks.length;
  const usedS = sPicks.filter((p) => !p.sExcluded).length;
  const dataCountTag = `${usedStations}/${totalStations}-${usedP}/${totalP}-${usedS}/${totalS}`;

  const pickLines = event.picks
    .map((p) => {
      const sta = p.sta.toUpperCase().slice(0, 4).padEnd(5);
      const rawP = p.pTime.trim();
      const pMarked = rawP ? `${p.pExcluded ? '*' : ''}${rawP}` : '';
      const pField = pMarked.padEnd(8);
      const rawS = p.sTime.trim();
      const sMarked = rawS ? `${p.sExcluded ? '*' : ' '}${rawS}` : '';
      const sField = sMarked.padEnd(8);
      const dur = p.duration != null ? String(Math.round(p.duration)) : '';
      const pol = p.polarity || '';
      const tail = pol ? `${dur.padEnd(6)}${pol}` : dur;
      return `${sta}${pField} ${sField}  ${tail}`;
    })
    .join('\n');

  const dataSection = `[Data]${dataCountTag}\nsta   pri      sec      dur  polP${pickLines ? `\n${pickLines}` : ''}`;

  // [Result] section matching EQP 11.20a PLOT.OUT output (excludes stations with * on P)
  const errSecVal = event.errSec ?? Number((event.rmsSec * 0.98).toFixed(2));
  const itRow = `${String(event.iterations).padStart(3)}  ${event.lat.toFixed(3).padStart(7)}  ${event.lon.toFixed(3).padStart(7)} ${event.depthKm.toFixed(2).padStart(6)} ${String(hrNum).padStart(2)} ${minStr} ${secFmt}  ${event.rmsSec.toFixed(2).padStart(5)}`;
  const errRow = `       ${event.errLatDeg.toFixed(3).padStart(5)}     ${event.errLonDeg.toFixed(3).padStart(5)}  ${event.errKm.toFixed(2).padStart(5)}       ${errSecVal.toFixed(2).padStart(5)}`;
  const stationResultRows = activePicks
    .map((p) => {
      const sta = p.sta.toUpperCase().slice(0, 3).padEnd(4);
      const toa = p.toa.toFixed(1).padStart(5);
      const azim = p.azim.toFixed(1).padStart(5);
      const delta = p.delta.toFixed(2).padStart(5);
      const resP = p.resP.toFixed(2).padStart(5);
      const resS = p.resS.toFixed(2).padStart(5);
      const obsP = p.obsP.toFixed(2).padStart(5);
      const obsS = p.obsS.toFixed(2).padStart(6);
      const calcP = p.calcP.toFixed(2).padStart(5);
      const calcS = p.calcS.toFixed(2).padStart(6);
      return `${sta}${toa} ${azim} ${delta} ${resP} ${resS} ${obsP}${obsS} ${calcP}${calcS}`;
    })
    .join('\n');

  const resultSection = [
    `[Result]\n${itRow}\nIT    LAT     LON      DEPTH HR MIN SEC    RMS \n${itRow}`,
    `ERR   DEG     DEG      KM           SEC \n${errRow}`,
    `STA  TOA  AZIM  DELTA RESp  RESs  OBSp  OBSs  CALCpCALCs${stationResultRows ? `\n${stationResultRows}` : ''}`,
  ].join('\n\n');

  // [Location] section
  const locationLines = [
    event.centralOfficeBearing,
    cityLabel ?? '',
    townLabel ?? '',
    generatorLabel ?? '',
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .map(encodeLocationDegrees);

  // [Intensity] section
  const formattedIntensities = formatIntensityBlockText(event.intensities);
  const intensityBody = formattedIntensities ? `${formattedIntensities}\n ` : ' ';

  // [Filename] section: YYYY_MMDD_HHMM_M##D###_B{bulletinNo}{F}.eqp
  const bulletinNo = Math.max(1, Math.trunc(event.bulletinNo || 1));
  const feltFlag = hasEventFeltDesignation(event) ? 'F' : '';
  const diskBasename = filePath.split(/[\\/]/).pop()?.trim();
  const eqpFilenameField =
    diskBasename ||
    buildEqpSaveTarget(event).filename ||
    `${yyyy}_${mm}${dd}_${hhStr}${minStr}${secIntStr}_B${bulletinNo}${feltFlag}.eqp`;

  // [Issued] & [IssuedBy]
  const fallbackIssued = formatIssuedTimestampFallback();
  const issuedDate = event.issuedDate.trim() || fallbackIssued.issuedDate;
  const issuedTime = event.issuedTime.trim() || fallbackIssued.issuedTime;
  const issuedBy = event.issuedBy.trim() || 'SOEPD';

  return [
    `[Version]${event.version}`,
    `[Date]\n${compactYyyyMmDd}   ${timeFull}   (GMT)`,
    dataSection,
    resultSection,
    `[Magnitude]\nMs ${event.ms.toFixed(1)}/Mb ${event.mb.toFixed(1)}/Ml ${event.md.toFixed(1)}`,
    `[Location]${locationLines.length > 0 ? `\n${locationLines.join('\n')}` : ''}`,
    `[Intensity]\n${intensityBody}`,
    `[Filename]\n${eqpFilenameField}`,
    `[Issued]\n${issuedDate} / ${issuedTime}`,
    `[IssuedBy]\n${issuedBy}`,
  ].join('\n\n');
}

function parsePlaceCandidate(id: string, label: string): PlaceCandidate | null {
  const trimmed = decodeLocationDegrees(label);
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d+)\s+km\s+(.+?)\s+of\s+(.+)$/i);
  if (!m) {
    return { id, label: trimmed, distanceKm: 0, bearing: '', name: trimmed };
  }
  return {
    id,
    label: trimmed,
    distanceKm: Number(m[1]) || 0,
    bearing: m[2].trim(),
    name: m[3].trim(),
  };
}

function parseObsSec(mmss: string, originTimeGmt: string): number | null {
  const clean = mmss.trim();
  if (!/^\d{3,4}(\.\d+)?$/.test(clean)) return null;
  const dotIdx = clean.indexOf('.');
  const intPart = dotIdx === -1 ? clean : clean.slice(0, dotIdx);
  const fracPart = dotIdx === -1 ? '0' : clean.slice(dotIdx + 1);
  if (intPart.length < 3) return null;
  const mm = Number(intPart.slice(0, -2));
  const ss = Number(`${intPart.slice(-2)}.${fracPart}`);
  if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null;

  const [, oMinStr = '0', oSecStr = '0'] = originTimeGmt.split(':');
  const originMin = Number(oMinStr) || 0;
  const originSec = Number(oSecStr) || 0;
  let deltaMin = mm - originMin;
  if (deltaMin < -30) deltaMin += 60;
  if (deltaMin > 30) deltaMin -= 60;
  const diff = deltaMin * 60 + (ss - originSec);
  return diff >= 0 ? Number(diff.toFixed(2)) : null;
}

interface ParsedResultStationRow {
  toa: number;
  azim: number;
  delta: number;
  resP: number;
  resS: number;
  obsP: number;
  obsS: number;
  calcP: number;
  calcS: number;
}

export function parseEqpFileContent(params: {
  content: string;
  filename: string;
  displayPath: string;
  fallbackDrive?: string;
  stations?: StationMeta[];
}): EQPEvent {
  const {
    content,
    filename,
    displayPath,
    fallbackDrive = DEFAULT_SOLUTION_DRIVE,
    stations = PHILSTA_DATABASE,
  } = params;
  const sections: Record<string, string[]> = {};
  const headerInline: Record<string, string> = {};
  let currentKey = '';

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    const headerMatch = trimmed.match(/^\[([A-Za-z0-9_ -]+)\](.*)$/);
    if (headerMatch) {
      currentKey = headerMatch[1].toLowerCase();
      sections[currentKey] = [];
      const inline = headerMatch[2].trim();
      if (inline) {
        headerInline[currentKey] = inline;
      }
    } else if (currentKey) {
      sections[currentKey].push(rawLine);
    }
  }

  const version =
    headerInline.version ||
    (sections.version ?? []).find((l) => l.trim())?.trim() ||
    '11.20a2';

  // Parse [Date] -> e.g. "20120201   04:30:48.81   (GMT)"
  const dateLine = (sections.date ?? []).find((l) => l.trim())?.trim() || '';
  const cleanedDateLine = dateLine.replace(/\(GMT\)/gi, '').trim();
  const dateTokens = cleanedDateLine.split(/\s+/);
  const rawDate = (dateTokens[0] || '').replace(/\D/g, '');
  const originDateGmt =
    rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : new Date().toISOString().slice(0, 10);
  const originTimeGmt = dateTokens[1] || '00:00:00.00';

  // Compute UTC+8 LST date/time
  const [yStr, mStr, dStr] = originDateGmt.split('-');
  const [hStr = '0', minStr = '0', secStr = '00.00'] = originTimeGmt.split(':');
  const utcDate = new Date(
    Date.UTC(Number(yStr), (Number(mStr) || 1) - 1, Number(dStr) || 1, Number(hStr) || 0, Number(minStr) || 0, 0)
  );
  const lstDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
  const originDateLst = `${lstDate.getUTCFullYear()}-${String(lstDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lstDate.getUTCDate()).padStart(2, '0')}`;
  const originTimeLst = `${String(lstDate.getUTCHours()).padStart(2, '0')}:${String(lstDate.getUTCMinutes()).padStart(2, '0')}:${secStr}`;

  // Parse [Result] (supports tabular 11.20a2 format and legacy key=value format)
  const resultLines = (sections.result ?? []).map((l) => l.trimEnd());
  let iterations = 0;
  let lat = 0;
  let lon = 0;
  let depthKm = 0;
  let rmsSec = 0;
  let errLatDeg = 0;
  let errLonDeg = 0;
  let errKm = 0;
  let errSec: number | undefined;
  const resultStationMap = new Map<string, ParsedResultStationRow>();

  const resultJoined = resultLines.join(' ');
  if (/IT=/i.test(resultJoined) && /LAT=/i.test(resultJoined)) {
    const getResNum = (key: string): number => {
      const m = resultJoined.match(new RegExp(`${key}=([-+]?\\d+(?:\\.\\d+)?)`, 'i'));
      return m ? Number(m[1]) : 0;
    };
    iterations = Math.trunc(getResNum('IT'));
    lat = getResNum('LAT');
    lon = getResNum('LON');
    depthKm = getResNum('DEPTH');
    rmsSec = getResNum('RMS');
    errLatDeg = iterations > 0 ? 0.02 : 0;
    errLonDeg = iterations > 0 ? 0.02 : 0;
    errKm = iterations > 0 ? Number(Math.max(1.2, rmsSec * 4.2 + 1.1).toFixed(2)) : 0;
  } else {
    let mode: 'none' | 'it' | 'err' | 'sta' = 'none';
    for (const rawLine of resultLines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^IT\s+LAT\s+LON/i.test(line)) {
        mode = 'it';
        continue;
      }
      if (/^ERR\s+DEG\s+DEG/i.test(line)) {
        mode = 'err';
        continue;
      }
      if (/^STA\s+TOA\s+AZIM/i.test(line)) {
        mode = 'sta';
        continue;
      }

      if (mode === 'it') {
        const nums = line.match(/[-+]?\d+(?:\.\d+)?/g);
        if (nums && nums.length >= 8) {
          iterations = Math.trunc(Number(nums[0]) || 0);
          lat = Number(nums[1]) || 0;
          lon = Number(nums[2]) || 0;
          depthKm = Number(nums[3]) || 0;
          rmsSec = Number(nums[7]) || 0;
        }
        mode = 'none';
      } else if (mode === 'err') {
        const nums = line.match(/[-+]?\d+(?:\.\d+)?/g);
        if (nums && nums.length >= 3) {
          errLatDeg = Number(nums[0]) || 0;
          errLonDeg = Number(nums[1]) || 0;
          errKm = Number(nums[2]) || 0;
          if (nums[3] !== undefined) {
            errSec = Number(nums[3]);
          }
        }
        mode = 'none';
      } else if (mode === 'sta') {
        const staMatch = line.match(/^([A-Za-z0-9]{2,5})\s+(.*)$/);
        if (staMatch) {
          const staCode = staMatch[1].toUpperCase();
          const numStr = staMatch[2];
          // First 2 columns are 1-decimal numbers (TOA, AZIM); remaining 7 columns are 2-decimal numbers (including concatenated pairs like 60.53106.75)
          const oneDecMatch = numStr.match(/^(-?\d+\.\d)\s+(-?\d+\.\d)\s+(.*)$/);
          if (oneDecMatch) {
            const toa = Number(oneDecMatch[1]) || 0;
            const azim = Number(oneDecMatch[2]) || 0;
            const twoDecNums = oneDecMatch[3].match(/-?\d+\.\d{2}/g);
            if (twoDecNums && twoDecNums.length >= 7) {
              resultStationMap.set(staCode, {
                toa,
                azim,
                delta: Number(twoDecNums[0]) || 0,
                resP: Number(twoDecNums[1]) || 0,
                resS: Number(twoDecNums[2]) || 0,
                obsP: Number(twoDecNums[3]) || 0,
                obsS: Number(twoDecNums[4]) || 0,
                calcP: Number(twoDecNums[5]) || 0,
                calcS: Number(twoDecNums[6]) || 0,
              });
            }
          }
        }
      }
    }
  }

  // Parse [Magnitude] -> supports "Ms 4.2/Mb 5.1/Ml 4.1" and legacy "Ms: 4.2 / Mb: 5.1 / Md: 4.1"
  const magLine = (sections.magnitude ?? []).join(' ');
  const getMag = (pattern: RegExp): number => {
    const m = magLine.match(pattern);
    return m ? Number(m[1]) : 0;
  };
  const ms = getMag(/Ms[:\s]+([-+]?\d+(?:\.\d+)?)/i);
  const mb = getMag(/Mb[:\s]+([-+]?\d+(?:\.\d+)?)/i);
  const md = getMag(/M[ld][:\s]+([-+]?\d+(?:\.\d+)?)/i);

  // Parse [Data]
  const picks: StationPick[] = [];
  const dataLines = sections.data ?? [];
  dataLines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    if (!line.trim() || /^sta\s+(?:pri|primary)/i.test(line.trim())) return;

    let sta = '';
    let pExcluded = false;
    let pTime = '';
    let sExcluded = false;
    let sTime = '';
    let duration: number | null = null;
    let amplitude: number | null = null;
    let polarity: Polarity = '';

    // 1. Check EQP 11.20a fixed layout: "BES  3057.36           58" / "CNP  3112.58 *3132.02  229" / "LQP  *3204.67" / "LQP *3204.67"
    const fixedHeaderMatch = line.match(/^([A-Za-z0-9]{2,5})\s(.*)$/);
    if (fixedHeaderMatch && line.length >= 10 && /[* ]\d{3,4}\.\d+/.test(line.slice(4, 22))) {
      sta = fixedHeaderMatch[1].toUpperCase();
      const pRaw = line.slice(4, 13).trim();
      if (pRaw) {
        pExcluded = pRaw.startsWith('*');
        pTime = pRaw.replace(/^\*/, '').trim();
      }
      const sRaw = line.slice(13, 22).trim();
      if (sRaw) {
        sExcluded = sRaw.startsWith('*');
        sTime = sRaw.replace(/^\*/, '').trim();
      }
      const tail = line.slice(22).trim().split(/\s+/).filter(Boolean);
      for (const tok of tail) {
        if (/^\d+$/.test(tok) && duration === null) {
          duration = Number(tok);
        } else if (/^(?:c|d|\+|-)$/i.test(tok)) {
          polarity = tok.toLowerCase() as Polarity;
        }
      }
    } else {
      // 2. Legacy fixed 8-char format: "STA  *3057.36   *3132.02   58  ---  c"
      const legacyMatch = line.match(
        /^([A-Za-z0-9]{2,5})\s{2}([* ])(.{8})\s{2}([* ])(.{8})\s{2}(.+)$/
      );
      if (legacyMatch) {
        sta = legacyMatch[1].trim().toUpperCase();
        pExcluded = legacyMatch[2] === '*';
        pTime = legacyMatch[3].trim();
        sExcluded = legacyMatch[4] === '*';
        sTime = legacyMatch[5].trim();
        const tail = legacyMatch[6].trim().split(/\s+/);
        const durTok = tail[0] ?? '---';
        const ampTok = tail[1] ?? '---';
        const polTok = tail[2] ?? '-';
        duration = /^\d+$/.test(durTok) ? Number(durTok) : null;
        amplitude = /^\d+(\.\d+)?$/.test(ampTok) ? Number(ampTok) : null;
        polarity =
          polTok === 'c' || polTok === 'd' || polTok === '+' || polTok === '-'
            ? (polTok as Polarity)
            : '';
      } else {
        // 3. Fallback whitespace parser (requires decimal point for sTime so integer dur is never confused)
        const tokens = line.trim().split(/\s+/);
        if (tokens.length < 2) return;
        sta = tokens[0].toUpperCase();
        const rawP = tokens[1] ?? '';
        pExcluded = rawP.startsWith('*');
        pTime = rawP.replace(/^\*/, '');
        let tailIdx = 2;
        const maybeS = tokens[2] ?? '';
        if (/^\*?\d{3,4}\.\d+$/.test(maybeS)) {
          sExcluded = maybeS.startsWith('*');
          sTime = maybeS.replace(/^\*/, '');
          tailIdx = 3;
        }
        for (const tok of tokens.slice(tailIdx)) {
          if (/^\d+$/.test(tok) && duration === null) {
            duration = Number(tok);
          } else if (/^(?:c|d|\+|-)$/i.test(tok)) {
            polarity = tok.toLowerCase() as Polarity;
          }
        }
      }
    }

    if (!sta) return;
    const meta = stations.find((s) => s.code === sta);
    const sLat = meta?.lat ?? DEFAULT_PH_CENTER.lat;
    const sLon = meta?.lon ?? DEFAULT_PH_CENTER.lon;

    const parsedStaRes = resultStationMap.get(sta);
    let delta = parsedStaRes?.delta ?? 0;
    let azim = parsedStaRes?.azim ?? 0;
    let toa = parsedStaRes?.toa ?? 45;
    let calcP = parsedStaRes?.calcP ?? 0;
    let calcS = parsedStaRes?.calcS ?? 0;
    let resP = parsedStaRes?.resP ?? 0;
    let resS = parsedStaRes?.resS ?? 0;
    const obsP = parsedStaRes?.obsP ?? (pTime ? parseObsSec(pTime, originTimeGmt) ?? 0 : 0);
    const obsS = parsedStaRes?.obsS ?? (sTime ? parseObsSec(sTime, originTimeGmt) ?? 0 : 0);

    if (!parsedStaRes && iterations > 0 && (lat !== 0 || lon !== 0)) {
      const rad = Math.PI / 180;
      const dLatKm = (sLat - lat) * 111.195;
      const dLonKm = (sLon - lon) * 111.195 * Math.max(0.25, Math.cos(((lat + sLat) / 2) * rad));
      const distKm = Math.hypot(dLatKm, dLonKm);
      delta = Number(Math.max(0.01, distKm / 111.195).toFixed(2));
      azim = Number((((Math.atan2(dLonKm, dLatKm) * 180) / Math.PI + 360) % 360).toFixed(1));
      const delay = meta?.delaySec ?? 0;
      const evalDepthKm = Number.isFinite(depthKm) && depthKm >= 0 ? depthKm : 15;
      const jbP = tryLookupJbTravelTime('P', delta, evalDepthKm);
      const jbS = sTime ? tryLookupJbTravelTime('S', delta, evalDepthKm) : null;
      if (jbP.ok) {
        toa = Number(jbP.toaDeg.toFixed(1));
        calcP = Number((jbP.timeSec + delay).toFixed(2));
        if (pTime && obsP > 0) resP = Number((obsP - calcP).toFixed(2));
      }
      if (sTime && jbS?.ok) {
        calcS = Number((jbS.timeSec + delay * 1.73).toFixed(2));
        if (obsS > 0) resS = Number((obsS - calcS).toFixed(2));
      }
    }

    picks.push({
      id: `opened-${idx}-${sta}`,
      sta,
      pTime,
      pExcluded,
      sTime,
      sExcluded,
      duration,
      ...(duration !== null ? { durationSource: 'legacy_eqp' as const } : {}),
      amplitude,
      polarity,
      quality: 'B',
      lat: sLat,
      lon: sLon,
      toa,
      azim,
      delta,
      resP,
      resS,
      obsP,
      obsS,
      calcP,
      calcS,
      ms: !pExcluded && duration != null && duration > 0 && ms > 0 ? ms : null,
      mb: !pExcluded && duration != null && duration > 0 && mb > 0 ? mb : null,
      md: !pExcluded && duration != null && duration > 0 && md > 0 ? md : null,
    });
  });

  // Parse [Location]
  const locLines = (sections.location ?? []).map((l) => decodeLocationDegrees(l)).filter(Boolean);
  const centralOfficeBearing = locLines[0] ?? '';
  const cityCand = parsePlaceCandidate('c1', locLines[1] ?? '');
  const townCand = parsePlaceCandidate('t1', locLines[2] ?? '');
  const genCand = parsePlaceCandidate('g1', locLines[3] ?? '');

  // Parse [Intensity] (supports Felt & "Instrumental Intensity:" headers)
  const intensities = parseManualIntensityBlock(
    (sections.intensity ?? []).join('\n'),
    { idPrefix: 'open-int' }
  ).entries;

  // Parse [Filename], [Issued], [IssuedBy]
  const fileLine = (sections.filename ?? []).find((l) => l.trim())?.trim() || '';
  const issuedLine = (sections.issued ?? []).find((l) => l.trim())?.trim() || '';
  const [issuedDate = '', issuedTime = ''] = issuedLine.split('/').map((s) => s.trim());
  const issuedBy = (sections.issuedby ?? []).find((l) => l.trim())?.trim() || 'SOEPD';

  const bullMatch = (filename || fileLine).match(/_B(\d+)/i);
  const bulletinNo = bullMatch ? Math.max(1, Number(bullMatch[1])) : 1;

  const baseId = filename.replace(/\.eqp$/i, '') || `${originDateGmt.replace(/-/g, '')}`;
  const cleanDrive = normalizeSolutionDrive(fallbackDrive);
  const resolvedPath =
    displayPath ||
    fileLine ||
    `${cleanDrive}\\EARTHQUAKE\\SOLUTION_EQ\\Sol_${originDateGmt.slice(0, 4)}\\${originDateGmt.slice(5, 7)}\\${originDateGmt.slice(8, 10)}\\${filename}`;

  return {
    id: `opened_${baseId}_${Date.now()}`,
    filename: filename || fileLine,
    filePath: resolvedPath,
    version,
    bulletinNo,
    originDateGmt,
    originTimeGmt,
    originDateLst,
    originTimeLst,
    lat,
    lon,
    depthKm,
    trialDepthKm:
      iterations > 0 && Number.isFinite(depthKm) && depthKm >= 0
        ? depthKm
        : depthKm > 0
          ? depthKm
          : 30.0,
    iterations,
    errLatDeg,
    errLonDeg,
    errKm,
    errSec,
    rmsSec,
    preferredScale: ms > 0 ? 'Ms' : mb > 0 ? 'Mb' : md > 0 ? 'Md' : 'Ms',
    ms,
    mb,
    md,
    centralOfficeBearing,
    cities: cityCand ? [cityCand] : [],
    selectedCityId: cityCand ? cityCand.id : '',
    towns: townCand ? [townCand] : [],
    selectedTownId: townCand ? townCand.id : '',
    primaryHeadline: 'city',
    generators: genCand ? [genCand] : [],
    selectedGeneratorId: genCand ? genCand.id : '',
    picks,
    intensities,
    expectingDamage: false,
    expectingAftershocks: false,
    tsunamiStatus: 'None',
    issuedDate,
    issuedTime,
    issuedBy,
    webPublished: false,
    remarks: '',
    magnitudeHistory:
      iterations > 0
        ? [
            {
              relocation: 'Loaded',
              timestamp: `${originTimeGmt.slice(0, 8)} UTC`,
              solver: 'EQP',
              rmsSec,
              activePhases: picks.filter((p) => !p.pExcluded).length,
              ms,
              mb,
              md,
            },
          ]
        : [],
  };
}
