import { PH_ISLAND_POLYGONS } from './phCoastlines.ts';
import type {
  StationNetworkType,
  StationOperationalStatus,
} from '../utils/philstaParser.ts';
import type {
  CorrectionProfileId,
  ModelValidationStatus,
  TravelTimeModelId,
} from '../utils/travelTime/types.ts';
import type { EventMagnitudeMetadata } from '../utils/magnitudeEngine.ts';
import type {
  AmplitudeAssociationIssue,
  AmplitudeMeasurement,
} from '../utils/amplitudeMeasurements.ts';
export type { IslandPolygon } from './phCoastlines.ts';
export type { StationNetworkType, StationOperationalStatus } from '../utils/philstaParser.ts';
export type {
  AmplitudeAssociationIssue,
  AmplitudeMeasurement,
} from '../utils/amplitudeMeasurements.ts';

export type NavSectionId =
  | 'locate'
  | 'map'
  | 'magnitude'
  | 'bulletin'
  | 'primer'
  | 'social-media'
  | 'catalog'
  | 'database'
  | 'assistant'
  | 'research'
  | 'settings';

export type SolverEngine = 'EQP' | 'HypoInverse';
export type ProcessingMode = 'Semi-Auto' | 'AutoPlot1' | 'AutoPlot2';
export type MagnitudeScale = 'Ms' | 'Mb' | 'Md';
export type EarthquakeOriginType = 'TECTONIC' | 'VOLCANIC' | 'VOLCANO -TECTONIC';
export type Polarity = 'c' | 'd' | '+' | '-' | '';
export type PickQuality = 'A' | 'B' | 'C' | 'D';

export const PICK_QUALITY_WEIGHTS: Record<
  PickQuality,
  { weight: number; label: string; hypCode: number }
> = {
  A: { weight: 1.0, label: '±0.05s · Full weight (1.00)', hypCode: 0 },
  B: { weight: 0.75, label: '±0.15s · High weight (0.75)', hypCode: 1 },
  C: { weight: 0.5, label: '±0.35s · Medium weight (0.50)', hypCode: 2 },
  D: { weight: 0.25, label: '±0.75s · Low weight (0.25)', hypCode: 3 },
};

export interface AtlasPickMetadata {
  originalStationCode: string;
  resolvedStationCode: string | null;
  network: string;
  pChannel: string | null;
  sChannel: string | null;
  pUtcTime: string | null;
  sUtcTime: string | null;
  pUtcIso: string | null;
  sUtcIso: string | null;
  pMarker: string | null;
  sMarker: string | null;
  pCandidateCount: number;
  sCandidateCount: number;
  ambiguousPhases: boolean;
  sOnlyMissingP: boolean;
  unknownStation: boolean;
  threeCharAliasConflict: boolean;
  rawLines: string[];
}

export interface StationPick {
  id: string;
  sta: string;
  pTime: string;
  pExcluded: boolean;
  sTime: string;
  sExcluded: boolean;
  duration: number | null;
  amplitude?: number | null;
  polarity: Polarity;
  quality: PickQuality;
  lat: number;
  lon: number;
  toa: number;
  azim: number;
  delta: number;
  resP: number;
  resS: number;
  obsP: number;
  obsS: number;
  calcP: number;
  calcS: number;
  ms: number | null;
  mb: number | null;
  md: number | null;
  magExcluded?: boolean;
  durationSource?: 'atlas_coda' | 'manual_coda' | 'legacy_eqp' | 's_minus_p' | 'unknown';
  atlasMetadata?: AtlasPickMetadata;
}

export interface PlaceCandidate {
  id: string;
  label: string;
  distanceKm: number;
  bearing: string;
  name: string;
}

export type IntensityCategory = 'felt' | 'instrumental';

export type IntensityReviewStatus = 'verified' | 'draft' | 'conflicting' | 'unresolved';

export type PeisRoman =
  | 'I'
  | 'II'
  | 'III'
  | 'IV'
  | 'V'
  | 'VI'
  | 'VII'
  | 'VIII'
  | 'IX'
  | 'X';

export interface IntensityEntry {
  id: string;
  peis: PeisRoman;
  locality: string;
  category?: IntensityCategory;
  province?: string;
  municipality?: string;
  specificLocation?: string;
  psgcCode?: string | null;
  reportSource?: string;
  receivedAt?: string;
  reviewStatus?: IntensityReviewStatus;
  remarks?: string;
  previousPeis?: PeisRoman;
  updatedAt?: string;
}

export interface MagnitudeHistoryEntry {
  relocation: string;
  timestamp: string;
  solver: SolverEngine;
  rmsSec: number;
  weightedRmsSec?: number;
  activePhases: number;
  ms: number;
  mb: number;
  md: number;
  modelId?: TravelTimeModelId;
  modelVersion?: string;
  correctionProfile?: CorrectionProfileId;
}

export interface EventLocationMetadata {
  modelId: TravelTimeModelId;
  modelName: string;
  modelVersion: string;
  modelChecksum: string | null;
  correctionProfile: CorrectionProfileId;
  solver: SolverEngine;
  solverVersion: string;
  validationStatus: ModelValidationStatus;
  weightedRmsSec?: number;
  rmsSec?: number;
  depthFixed?: boolean;
  depthFixReason?: string;
  conditionNumber?: number | null;
  azimuthalGapDeg?: number | null;
  errDepthKm?: number | null;
  uncertaintyReliable?: boolean;
  inputChecksum?: string;
  stationCatalogId?: string;
  adoptedAt?: string;
}

export interface EQPEvent {
  id: string;
  filename: string;
  filePath: string;
  version: string;
  bulletinNo: number;
  originDateGmt: string;
  originTimeGmt: string;
  originDateLst: string;
  originTimeLst: string;
  lat: number;
  lon: number;
  depthKm: number;
  trialDepthKm: number;
  iterations: number;
  errLatDeg: number;
  errLonDeg: number;
  errKm: number;
  errSec?: number;
  rmsSec: number;
  preferredScale: MagnitudeScale;
  ms: number;
  mb: number;
  md: number;
  centralOfficeBearing: string;
  cities: PlaceCandidate[];
  selectedCityId: string;
  towns: PlaceCandidate[];
  selectedTownId: string;
  primaryHeadline: 'city' | 'town';
  generators: PlaceCandidate[];
  selectedGeneratorId: string;
  picks: StationPick[];
  intensities: IntensityEntry[];
  intensityBulletinOverride?: string;
  rawIntensityImportText?: string;
  feltStatusOverride?: boolean;
  expectingDamage: boolean;
  expectingAftershocks: boolean;
  originType?: EarthquakeOriginType;
  tsunamiStatus: 'None' | 'Information' | 'Warning';
  issuedDate: string;
  issuedTime: string;
  issuedBy: string;
  webPublished: boolean;
  remarks: string;
  bulletinNote1?: string;
  bulletinNote2?: string;
  locationMetadata?: EventLocationMetadata;
  magnitudeMetadata?: EventMagnitudeMetadata;
  historicalMagnitudeBaseline?: string;
  magnitudeHistory: MagnitudeHistoryEntry[];
  amplitudeMeasurements?: AmplitudeMeasurement[];
  amplitudeAssociationIssues?: AmplitudeAssociationIssue[];
}

export interface CrustalLayer {
  layer: number;
  topDepthKm: number;
  thicknessKm: number;
  vpKmS: number;
  vsKmS: number;
  vpVsRatio: number;
}

export interface StationMeta {
  code: string;
  name: string;
  province: string;
  lat: number;
  lon: number;
  elevationM: number;
  delaySec: number;
  sensor: string;
  networkType?: StationNetworkType;
  volcanoName?: string | null;
  status?: StationOperationalStatus;
  telemetry?: string | null;
  auditNote?: string | null;
  anomalyFlags?: string[];
}

export const INITIAL_EVENTS: EQPEvent[] = [
  {
    id: '2012_0201_0430',
    filename: '2012_0201_0430_M00D014_B1.eqp',
    filePath: 'Y:\\EARTHQUAKE\\SOLUTION_EQ\\Sol_2012\\02\\01\\2012_0201_0430_M00D014_B1.eqp',
    version: '11.20a',
    bulletinNo: 1,
    originDateGmt: '2012-02-01',
    originTimeGmt: '04:30:48.95',
    originDateLst: '2012-02-01',
    originTimeLst: '12:30:48.95',
    lat: 11.754,
    lon: 125.785,
    depthKm: 14.6,
    trialDepthKm: 30.0,
    iterations: 13,
    errLatDeg: 0.024,
    errLonDeg: 0.045,
    errKm: 2.61,
    rmsSec: 0.80,
    preferredScale: 'Ms',
    ms: 0.0,
    mb: 4.5,
    md: 4.4,
    centralOfficeBearing: '604 km S 57° E of Quezon City',
    cities: [
      { id: 'c1', label: '102 km N 56° E of City Of Tacloban', distanceKm: 102, bearing: 'N 56° E', name: 'City Of Tacloban' },
      { id: 'c2', label: '153 km N 58° E of Ormoc City', distanceKm: 153, bearing: 'N 58° E', name: 'Ormoc City' },
      { id: 'c3', label: '255 km N 52° E of City Of Lapu-lapu', distanceKm: 255, bearing: 'N 52° E', name: 'City Of Lapu-lapu' },
      { id: 'c4', label: '256 km N 52° E of City Of Mandaue', distanceKm: 256, bearing: 'N 52° E', name: 'City Of Mandaue' },
      { id: 'c5', label: '262 km N 52° E of City Of Cebu', distanceKm: 262, bearing: 'N 52° E', name: 'City Of Cebu' },
    ],
    selectedCityId: 'c1',
    towns: [
      { id: 't1', label: '036 km N 90° E of San Julian (Eastern Samar)', distanceKm: 36, bearing: 'N 90° E', name: 'San Julian (Eastern Samar)' },
      { id: 't2', label: '037 km S 79° E of Sulat (Eastern Samar)', distanceKm: 37, bearing: 'S 79° E', name: 'Sulat (Eastern Samar)' },
      { id: 't3', label: '042 km N 67° E of City Of Borongan (Eastern Samar)', distanceKm: 42, bearing: 'N 67° E', name: 'City Of Borongan (Eastern Samar)' },
      { id: 't4', label: '042 km N 48° E of Maydolong (Eastern Samar)', distanceKm: 42, bearing: 'N 48° E', name: 'Maydolong (Eastern Samar)' },
      { id: 't5', label: '043 km N 44° E of Balangkayan (Eastern Samar)', distanceKm: 43, bearing: 'N 44° E', name: 'Balangkayan (Eastern Samar)' },
      { id: 't6', label: '043 km S 68° E of Taft (Eastern Samar)', distanceKm: 43, bearing: 'S 68° E', name: 'Taft (Eastern Samar)' },
      { id: 't7', label: '046 km S 53° E of Can-avid (Eastern Samar)', distanceKm: 46, bearing: 'S 53° E', name: 'Can-avid (Eastern Samar)' },
      { id: 't8', label: '045 km S 46° E of Dolores (Eastern Samar)', distanceKm: 45, bearing: 'S 46° E', name: 'Dolores (Eastern Samar)' },
      { id: 't9', label: '046 km N 35° E of Llorente (Eastern Samar)', distanceKm: 46, bearing: 'N 35° E', name: 'Llorente (Eastern Samar)' },
      { id: 't10', label: '049 km N 22° E of Hernani (Eastern Samar)', distanceKm: 49, bearing: 'N 22° E', name: 'Hernani (Eastern Samar)' },
    ],
    selectedTownId: 't1',
    primaryHeadline: 'city',
    generators: [
      { id: 'g1', label: '053 km S 61° W of PHILIPPINE TRENCH', distanceKm: 53, bearing: 'S 61° W', name: 'PHILIPPINE TRENCH' },
      { id: 'g2', label: '137 km N 61° E of PFZ LEYTE SEGMENT', distanceKm: 137, bearing: 'N 61° E', name: 'PFZ LEYTE SEGMENT' },
      { id: 'g3', label: '144 km N 53° E of PFZ WEST LEYTE FAULT', distanceKm: 144, bearing: 'N 53° E', name: 'PFZ WEST LEYTE FAULT' },
      { id: 'g4', label: '148 km N 67° E of PFZ NORTH-WEST LEYTE FAULT', distanceKm: 148, bearing: 'N 67° E', name: 'PFZ NORTH-WEST LEYTE FAULT' },
      { id: 'g5', label: '208 km N 14° E of PFZ EAST MINDANAO SEGMENT', distanceKm: 208, bearing: 'N 14° E', name: 'PFZ EAST MINDANAO SEGMENT' },
    ],
    selectedGeneratorId: 'g1',
    picks: [
      { id: 'p1', sta: 'BES', pTime: '3057.36', pExcluded: false, sTime: '', sExcluded: false, duration: 58, amplitude: 142.5, polarity: 'c', quality: 'A', lat: 11.61, lon: 125.44, toa: 135.2, azim: 245.9, delta: 0.37, resP: 0.04, resS: 0.00, obsP: 8.41, obsS: 0.00, calcP: 8.37, calcS: 0.00, ms: 4.3, mb: 4.4, md: 4.1 },
      { id: 'p2', sta: 'OCL', pTime: '3112.33', pExcluded: false, sTime: '', sExcluded: false, duration: 162, amplitude: 48.2, polarity: 'd', quality: 'A', lat: 11.06, lon: 124.61, toa: 47.7, azim: 238.9, delta: 1.35, resP: -0.11, resS: 0.00, obsP: 23.38, obsS: 0.00, calcP: 23.49, calcS: 0.00, ms: 4.5, mb: 4.5, md: 4.4 },
      { id: 'p3', sta: 'CNP', pTime: '3112.58', pExcluded: false, sTime: '3132.02', sExcluded: true, duration: 229, amplitude: 51.6, polarity: 'c', quality: 'B', lat: 12.51, lon: 124.66, toa: 47.7, azim: 304.4, delta: 1.33, resP: 0.50, resS: 1.01, obsP: 23.63, obsS: 43.07, calcP: 23.13, calcS: 42.06, ms: 4.7, mb: 4.6, md: 4.6 },
      { id: 'p4', sta: 'MSL', pTime: '3120.05', pExcluded: false, sTime: '3144.81', sExcluded: false, duration: 287, amplitude: 36.8, polarity: 'c', quality: 'B', lat: 10.16, lon: 124.85, toa: 47.7, azim: 209.5, delta: 1.85, resP: 0.70, resS: 0.60, obsP: 31.90, obsS: 55.86, calcP: 31.20, calcS: 55.26, ms: 4.6, mb: 4.5, md: 4.7 },
      { id: 'p5', sta: 'LLP', pTime: '3125.15', pExcluded: false, sTime: '', sExcluded: false, duration: 221, amplitude: 29.4, polarity: 'd', quality: 'C', lat: 10.33, lon: 123.97, toa: 45.4, azim: 231.5, delta: 2.29, resP: -1.45, resS: 0.00, obsP: 36.20, obsS: 0.00, calcP: 37.64, calcS: 0.00, ms: 5.5, mb: 5.3, md: 4.4 },
      { id: 'p6', sta: 'BUT', pTime: '3133.86', pExcluded: false, sTime: '', sExcluded: false, duration: 257, amplitude: 21.7, polarity: 'c', quality: 'B', lat: 8.98, lon: 125.63, toa: 45.4, azim: 183.4, delta: 2.77, resP: 0.33, resS: 0.00, obsP: 44.91, obsS: 0.00, calcP: 44.58, calcS: 0.00, ms: 4.4, mb: 4.5, md: 4.5 },
      { id: 'p7', sta: 'RCP', pTime: '3135.98', pExcluded: false, sTime: '', sExcluded: false, duration: 228, amplitude: 18.3, polarity: 'd', quality: 'B', lat: 11.58, lon: 122.81, toa: 45.4, azim: 266.6, delta: 2.97, resP: -0.32, resS: 0.00, obsP: 47.03, obsS: 0.00, calcP: 47.35, calcS: 0.00, ms: 4.5, mb: 4.4, md: 4.3 },
      { id: 'p8', sta: 'SNP', pTime: '3142.88', pExcluded: false, sTime: '', sExcluded: false, duration: 169, amplitude: 12.9, polarity: 'c', quality: 'C', lat: 9.38, lon: 123.24, toa: 45.2, azim: 226.5, delta: 3.47, resP: -0.57, resS: 0.00, obsP: 53.93, obsS: 0.00, calcP: 54.49, calcS: 0.00, ms: 4.4, mb: 4.3, md: 4.2 },
      { id: 'p9', sta: 'GQP', pTime: '3149.34', pExcluded: false, sTime: '3235.56', sExcluded: false, duration: 237, amplitude: 15.4, polarity: 'c', quality: 'B', lat: 13.92, lon: 122.48, toa: 45.2, azim: 303.6, delta: 3.90, resP: -0.19, resS: -0.62, obsP: 60.39, obsS: 106.61, calcP: 60.58, calcS: 107.22, ms: 4.6, mb: 4.6, md: 4.5 },
      { id: 'p10', sta: 'LQP', pTime: '3204.67', pExcluded: true, sTime: '', sExcluded: false, duration: null, amplitude: null, polarity: '-', quality: 'D', lat: 14.08, lon: 121.62, toa: 45.0, azim: 301.2, delta: 4.68, resP: 1.92, resS: 0.00, obsP: 75.72, obsS: 0.00, calcP: 73.80, calcS: 0.00, ms: null, mb: null, md: null },
    ],
    intensities: [
      { id: 'i1', peis: 'III', locality: 'San Julian, Eastern Samar' },
      { id: 'i2', peis: 'II', locality: 'City of Borongan, Eastern Samar' },
    ],
    expectingDamage: false,
    expectingAftershocks: false,
    originType: 'TECTONIC',
    tsunamiStatus: 'None',
    issuedDate: '01 Feb 2012',
    issuedTime: '12:42 PM',
    issuedBy: 'SOEPD',
    webPublished: true,
    remarks: 'Tectonic origin along the Philippine Trench subduction zone; minor sea-floor motion with no tsunami threat.',
    magnitudeHistory: [
      { relocation: 'Reloc #1', timestamp: '04:31:12 UTC', solver: 'EQP', rmsSec: 1.18, activePhases: 12, ms: 4.9, mb: 4.8, md: 4.6 },
      { relocation: 'Reloc #2', timestamp: '04:32:05 UTC', solver: 'EQP', rmsSec: 0.96, activePhases: 11, ms: 4.7, mb: 4.6, md: 4.5 },
      { relocation: 'Reloc #3', timestamp: '04:33:18 UTC', solver: 'HypoInverse', rmsSec: 0.89, activePhases: 11, ms: 4.6, mb: 4.6, md: 4.4 },
      { relocation: 'Reloc #4', timestamp: '04:34:40 UTC', solver: 'EQP', rmsSec: 0.80, activePhases: 11, ms: 4.5, mb: 4.5, md: 4.4 },
    ],
  },
  {
    id: '2026_1112_0815',
    filename: '20261112_0815.EQP',
    filePath: 'Y:\\EARTHQUAKE\\SOLUTION_EQ\\Sol_2026\\11\\12\\20261112_0815.EQP',
    version: '11.20a',
    bulletinNo: 1,
    originDateGmt: '2026-11-12',
    originTimeGmt: '08:15:32.40',
    originDateLst: '2026-11-12',
    originTimeLst: '16:15:32.40',
    lat: 14.120,
    lon: 120.850,
    depthKm: 15.0,
    trialDepthKm: 30.0,
    iterations: 9,
    errLatDeg: 0.011,
    errLonDeg: 0.014,
    errKm: 1.42,
    rmsSec: 0.28,
    preferredScale: 'Ms',
    ms: 4.2,
    mb: 4.0,
    md: 4.1,
    centralOfficeBearing: '058 km S 18° W of Quezon City',
    cities: [
      { id: 'tc1', label: '012 km N 10° E of Tagaytay City', distanceKm: 12, bearing: 'N 10° E', name: 'Tagaytay City' },
      { id: 'tc2', label: '028 km S 35° W of Dasmarinas City', distanceKm: 28, bearing: 'S 35° W', name: 'Dasmarinas City' },
      { id: 'tc3', label: '039 km S 22° W of Calamba City', distanceKm: 39, bearing: 'S 22° W', name: 'Calamba City' },
    ],
    selectedCityId: 'tc1',
    towns: [
      { id: 'tt1', label: '006 km N 25° E of Mendez (Cavite)', distanceKm: 6, bearing: 'N 25° E', name: 'Mendez (Cavite)' },
      { id: 'tt2', label: '009 km S 78° E of Alfonso (Cavite)', distanceKm: 9, bearing: 'S 78° E', name: 'Alfonso (Cavite)' },
      { id: 'tt3', label: '014 km N 04° W of Talisay (Batangas)', distanceKm: 14, bearing: 'N 04° W', name: 'Talisay (Batangas)' },
    ],
    selectedTownId: 'tt1',
    primaryHeadline: 'city',
    generators: [
      { id: 'tg1', label: '018 km W of WEST VALLEY FAULT', distanceKm: 18, bearing: 'W', name: 'WEST VALLEY FAULT' },
      { id: 'tg2', label: '044 km N 12° E of LUBANG FAULT', distanceKm: 44, bearing: 'N 12° E', name: 'LUBANG FAULT' },
    ],
    selectedGeneratorId: 'tg1',
    picks: [
      { id: 'tp1', sta: 'TGY', pTime: '0815.45', pExcluded: false, sTime: '0815.58', sExcluded: false, duration: 85, amplitude: 210.4, polarity: 'c', quality: 'A', lat: 14.09, lon: 120.93, toa: 122.4, azim: 108.5, delta: 0.09, resP: 0.06, resS: -0.05, obsP: 3.12, obsS: 5.42, calcP: 3.06, calcS: 5.47, ms: 4.1, mb: 4.0, md: 4.2 },
      { id: 'tp2', sta: 'SCZ', pTime: '0815.50', pExcluded: false, sTime: '0816.05', sExcluded: false, duration: 92, amplitude: 96.8, polarity: 'd', quality: 'A', lat: 14.32, lon: 121.08, toa: 88.1, azim: 48.2, delta: 0.30, resP: 0.09, resS: 0.14, obsP: 6.45, obsS: 11.28, calcP: 6.36, calcS: 11.14, ms: 4.3, mb: 4.1, md: 4.0 },
      { id: 'tp3', sta: 'LUB', pTime: '0815.52', pExcluded: true, sTime: '0816.12', sExcluded: false, duration: 70, amplitude: 41.2, polarity: 'c', quality: 'D', lat: 13.85, lon: 120.12, toa: 63.0, azim: 250.1, delta: 0.78, resP: 0.72, resS: 0.21, obsP: 13.84, obsS: 23.15, calcP: 13.12, calcS: 22.94, ms: null, mb: null, md: null },
      { id: 'tp4', sta: 'QZN', pTime: '0815.56', pExcluded: false, sTime: '0816.14', sExcluded: false, duration: 88, amplitude: 64.5, polarity: '+', quality: 'A', lat: 14.65, lon: 121.05, toa: 61.5, azim: 21.0, delta: 0.57, resP: -0.14, resS: -0.11, obsP: 10.62, obsS: 18.42, calcP: 10.76, calcS: 18.53, ms: 4.2, mb: 3.9, md: 4.1 },
    ],
    intensities: [
      { id: 'ti1', peis: 'IV', locality: 'Tagaytay City, Cavite' },
      { id: 'ti2', peis: 'III', locality: 'Dasmarinas City, Cavite' },
      { id: 'ti3', peis: 'II', locality: 'Makati City, Metro Manila' },
    ],
    expectingDamage: false,
    expectingAftershocks: false,
    originType: 'TECTONIC',
    tsunamiStatus: 'None',
    issuedDate: '12 Nov 2026',
    issuedTime: '04:22 PM',
    issuedBy: 'SOEPD',
    webPublished: true,
    remarks: 'Shallow crustal earthquake felt moderately across Cavite ridge and nearby Metro Manila.',
    magnitudeHistory: [
      { relocation: 'Reloc #1', timestamp: '08:16:04 UTC', solver: 'EQP', rmsSec: 0.54, activePhases: 8, ms: 4.5, mb: 4.3, md: 4.2 },
      { relocation: 'Reloc #2', timestamp: '08:16:48 UTC', solver: 'EQP', rmsSec: 0.39, activePhases: 8, ms: 4.4, mb: 4.2, md: 4.1 },
      { relocation: 'Reloc #3', timestamp: '08:17:25 UTC', solver: 'EQP', rmsSec: 0.28, activePhases: 7, ms: 4.2, mb: 4.0, md: 4.1 },
    ],
  },
  {
    id: '2026_1110_2144',
    filename: '20261110_2144.EQP',
    filePath: 'Y:\\EARTHQUAKE\\SOLUTION_EQ\\Sol_2026\\11\\10\\20261110_2144.EQP',
    version: '11.20a',
    bulletinNo: 2,
    originDateGmt: '2026-11-10',
    originTimeGmt: '21:44:10.18',
    originDateLst: '2026-11-11',
    originTimeLst: '05:44:10.18',
    lat: 9.780,
    lon: 126.150,
    depthKm: 22.0,
    trialDepthKm: 30.0,
    iterations: 11,
    errLatDeg: 0.019,
    errLonDeg: 0.028,
    errKm: 2.04,
    rmsSec: 0.42,
    preferredScale: 'Ms',
    ms: 5.1,
    mb: 4.9,
    md: 5.0,
    centralOfficeBearing: '724 km S 46° E of Quezon City',
    cities: [
      { id: 'sc1', label: '072 km N 84° E of Surigao City', distanceKm: 72, bearing: 'N 84° E', name: 'Surigao City' },
      { id: 'sc2', label: '118 km N 25° E of Butuan City', distanceKm: 118, bearing: 'N 25° E', name: 'Butuan City' },
    ],
    selectedCityId: 'sc1',
    towns: [
      { id: 'st1', label: '024 km E of General Luna (Surigao del Norte)', distanceKm: 24, bearing: 'E', name: 'General Luna (Surigao del Norte)' },
      { id: 'st2', label: '031 km N 75° E of Dapa (Surigao del Norte)', distanceKm: 31, bearing: 'N 75° E', name: 'Dapa (Surigao del Norte)' },
    ],
    selectedTownId: 'st1',
    primaryHeadline: 'town',
    generators: [
      { id: 'sg1', label: '034 km W of PHILIPPINE TRENCH', distanceKm: 34, bearing: 'W', name: 'PHILIPPINE TRENCH' },
    ],
    selectedGeneratorId: 'sg1',
    picks: [
      { id: 'sp1', sta: 'SGP', pTime: '2144.16', pExcluded: false, sTime: '2144.26', sExcluded: false, duration: 310, amplitude: 318.0, polarity: 'c', quality: 'A', lat: 9.78, lon: 125.49, toa: 82.0, azim: 270.1, delta: 0.65, resP: 0.12, resS: -0.18, obsP: 11.40, obsS: 19.95, calcP: 11.28, calcS: 20.13, ms: 5.1, mb: 4.9, md: 5.0 },
      { id: 'sp2', sta: 'BUT', pTime: '2144.28', pExcluded: false, sTime: '2144.45', sExcluded: false, duration: 295, amplitude: 194.5, polarity: 'd', quality: 'B', lat: 8.98, lon: 125.63, toa: 51.3, azim: 213.0, delta: 0.95, resP: -0.22, resS: 0.34, obsP: 16.52, obsS: 28.91, calcP: 16.74, calcS: 28.57, ms: 5.0, mb: 4.9, md: 4.9 },
      { id: 'sp3', sta: 'MSL', pTime: '2144.36', pExcluded: false, sTime: '', sExcluded: false, duration: 280, amplitude: 128.4, polarity: 'c', quality: 'B', lat: 10.16, lon: 124.85, toa: 46.8, azim: 286.4, delta: 1.34, resP: 0.38, resS: 0.00, obsP: 22.84, obsS: 0.00, calcP: 22.46, calcS: 0.00, ms: 5.2, mb: 5.0, md: 5.1 },
    ],
    intensities: [
      { id: 'si1', peis: 'IV', locality: 'General Luna, Surigao del Norte' },
      { id: 'si2', peis: 'III', locality: 'Surigao City, Surigao del Norte' },
    ],
    expectingDamage: false,
    expectingAftershocks: true,
    originType: 'TECTONIC',
    tsunamiStatus: 'None',
    issuedDate: '10 Nov 2026',
    issuedTime: '05:56 AM',
    issuedBy: 'SOEPD',
    webPublished: true,
    remarks: 'Offshore Siargao Island event; aftershocks expected.',
    magnitudeHistory: [
      { relocation: 'Reloc #1', timestamp: '21:44:55 UTC', solver: 'EQP', rmsSec: 0.67, activePhases: 5, ms: 5.3, mb: 5.1, md: 5.1 },
      { relocation: 'Reloc #2', timestamp: '21:45:40 UTC', solver: 'HypoInverse', rmsSec: 0.51, activePhases: 5, ms: 5.2, mb: 5.0, md: 5.0 },
      { relocation: 'Reloc #3', timestamp: '21:46:19 UTC', solver: 'EQP', rmsSec: 0.42, activePhases: 5, ms: 5.1, mb: 4.9, md: 5.0 },
    ],
  },
];

export const PHILSTA_DATABASE: StationMeta[] = [
  { code: 'BES', name: 'Borongan Seismic Station', province: 'Eastern Samar', lat: 11.610, lon: 125.440, elevationM: 18, delaySec: 0.05, sensor: 'Broadband 120s' },
  { code: 'OCL', name: 'Ormoc City Seismic Station', province: 'Leyte', lat: 11.060, lon: 124.610, elevationM: 42, delaySec: -0.02, sensor: 'Short-Period 1Hz' },
  { code: 'CNP', name: 'Catarman Northern Samar', province: 'Northern Samar', lat: 12.510, lon: 124.660, elevationM: 12, delaySec: 0.08, sensor: 'Broadband 120s' },
  { code: 'MSL', name: 'Maasin Southern Leyte', province: 'Southern Leyte', lat: 10.160, lon: 124.850, elevationM: 34, delaySec: 0.03, sensor: 'Broadband 120s' },
  { code: 'LLP', name: 'Lapu-Lapu Seismic Station', province: 'Cebu', lat: 10.330, lon: 123.970, elevationM: 15, delaySec: -0.04, sensor: 'Broadband 60s' },
  { code: 'BUT', name: 'Butuan City Seismic Station', province: 'Agusan del Norte', lat: 8.980, lon: 125.630, elevationM: 22, delaySec: 0.11, sensor: 'Broadband 120s' },
  { code: 'RCP', name: 'Roxas City Seismic Station', province: 'Capiz', lat: 11.580, lon: 122.810, elevationM: 14, delaySec: 0.06, sensor: 'Short-Period 1Hz' },
  { code: 'SNP', name: 'Siaton Negros Oriental', province: 'Negros Oriental', lat: 9.380, lon: 123.240, elevationM: 58, delaySec: 0.00, sensor: 'Broadband 120s' },
  { code: 'GQP', name: 'Guinayangan Quezon', province: 'Quezon', lat: 13.920, lon: 122.480, elevationM: 28, delaySec: 0.04, sensor: 'Broadband 120s' },
  { code: 'LQP', name: 'Lucban Quezon Station', province: 'Quezon', lat: 14.080, lon: 121.620, elevationM: 430, delaySec: -0.09, sensor: 'Broadband 120s' },
  { code: 'TGY', name: 'Tagaytay Seismic Station', province: 'Cavite', lat: 14.090, lon: 120.930, elevationM: 615, delaySec: -0.06, sensor: 'Broadband 120s' },
  { code: 'SCZ', name: 'Sta. Cruz Laguna', province: 'Laguna', lat: 14.320, lon: 121.080, elevationM: 19, delaySec: 0.14, sensor: 'Short-Period 1Hz' },
  { code: 'SGP', name: 'Surigao City Station', province: 'Surigao del Norte', lat: 9.780, lon: 125.490, elevationM: 25, delaySec: 0.02, sensor: 'Broadband 120s' },
  { code: 'QVP', name: 'PHIVOLCS Main Office, Quezon City', province: 'Metro Manila (U.P. Campus)', lat: 14.652, lon: 121.059, elevationM: 15, delaySec: 0.00, sensor: 'Broadband / Main Office', networkType: 'seismic' },
];

export const CRUSTAL_MODEL_1D: CrustalLayer[] = [
  { layer: 1, topDepthKm: 0.0, thicknessKm: 4.0, vpKmS: 4.80, vsKmS: 2.74, vpVsRatio: 1.75 },
  { layer: 2, topDepthKm: 4.0, thicknessKm: 11.0, vpKmS: 6.00, vsKmS: 3.43, vpVsRatio: 1.75 },
  { layer: 3, topDepthKm: 15.0, thicknessKm: 15.0, vpKmS: 6.75, vsKmS: 3.86, vpVsRatio: 1.75 },
  { layer: 4, topDepthKm: 30.0, thicknessKm: 18.0, vpKmS: 7.85, vsKmS: 4.49, vpVsRatio: 1.75 },
  { layer: 5, topDepthKm: 48.0, thicknessKm: 999.0, vpKmS: 8.15, vsKmS: 4.66, vpVsRatio: 1.75 },
];

export const ISLAND_POLYGONS = PH_ISLAND_POLYGONS;

export interface TectonicTrace {
  name: string;
  kind: 'fault' | 'boundary';
  points: Array<[number, number]>;
}

export const FAULT_TRACES: TectonicTrace[] = [
  {
    name: 'Philippine Trench',
    kind: 'boundary',
    points: [
      [124.2, 15.6], [124.8, 14.9], [125.6, 14.1], [126.3, 13.3], [126.55, 12.4],
      [126.45, 11.4], [126.5, 10.4], [126.75, 9.3], [126.95, 8.1], [127.05, 6.9], [127.1, 5.4],
    ],
  },
  {
    name: 'Manila Trench',
    kind: 'boundary',
    points: [
      [119.5, 19.6], [119.35, 18.2], [119.25, 16.9], [119.18, 15.6],
      [119.38, 14.4], [119.75, 13.4], [120.25, 12.6],
    ],
  },
  {
    name: 'Negros Trench',
    kind: 'boundary',
    points: [
      [121.65, 11.4], [121.85, 10.4], [122.1, 9.4], [122.55, 8.7],
    ],
  },
  {
    name: 'Sulu Trench',
    kind: 'boundary',
    points: [
      [122.3, 8.4], [121.4, 7.6], [120.4, 6.9], [119.6, 6.2],
    ],
  },
  {
    name: 'Cotabato Trench',
    kind: 'boundary',
    points: [
      [123.3, 7.0], [123.6, 6.2], [124.1, 5.4], [124.8, 4.7],
    ],
  },
  {
    name: 'Philippine Fault Zone (PFZ)',
    kind: 'fault',
    points: [
      [120.55, 18.1], [120.72, 17.2], [120.92, 16.3], [121.35, 15.65], [121.95, 14.95],
      [122.35, 14.15], [122.9, 13.65], [123.65, 12.85], [124.12, 12.05], [124.58, 11.25],
      [124.95, 10.45], [125.42, 9.65], [125.75, 8.8], [126.0, 7.85], [126.18, 6.9],
    ],
  },
  {
    name: 'West Valley Fault',
    kind: 'fault',
    points: [
      [121.15, 14.84], [121.11, 14.66], [121.07, 14.51], [121.03, 14.35], [120.98, 14.12],
    ],
  },
  {
    name: 'Central Mindoro Fault',
    kind: 'fault',
    points: [
      [120.78, 13.38], [120.95, 13.05], [121.12, 12.68], [121.22, 12.35],
    ],
  },
  {
    name: 'West Panay Fault',
    kind: 'fault',
    points: [
      [122.02, 11.75], [122.15, 11.3], [122.18, 10.85], [122.1, 10.52],
    ],
  },
];

export interface VolcanoLocation {
  name: string;
  province: string;
  lon: number;
  lat: number;
}

export const ACTIVE_VOLCANOES: VolcanoLocation[] = [
  { name: 'Pinatubo', province: 'Zambales', lon: 120.35, lat: 15.13 },
  { name: 'Taal', province: 'Batangas', lon: 120.99, lat: 14.00 },
  { name: 'Banahaw', province: 'Quezon / Laguna', lon: 121.48, lat: 14.07 },
  { name: 'Mayon', province: 'Albay', lon: 123.68, lat: 13.26 },
  { name: 'Bulusan', province: 'Sorsogon', lon: 124.05, lat: 12.77 },
  { name: 'Biliran', province: 'Biliran', lon: 124.53, lat: 11.52 },
  { name: 'Cabalian', province: 'Southern Leyte', lon: 125.22, lat: 10.28 },
  { name: 'Kanlaon', province: 'Negros Occidental', lon: 123.13, lat: 10.41 },
  { name: 'Hibok-Hibok', province: 'Camiguin', lon: 124.67, lat: 9.20 },
  { name: 'Ragang', province: 'Lanao del Sur', lon: 124.50, lat: 7.70 },
  { name: 'Matutum', province: 'South Cotabato', lon: 125.07, lat: 6.37 },
  { name: 'Parker', province: 'South Cotabato', lon: 124.89, lat: 6.11 },
];

export interface TectonicPlateZone {
  id: string;
  name: string;
  shortLabel: string;
  fillColor: string;
  strokeColor: string;
  labelCoord: [number, number];
  points: Array<[number, number]>;
}

export const TECTONIC_PLATES: TectonicPlateZone[] = [
  {
    id: 'sunda',
    name: 'Sunda / Eurasian Plate',
    shortLabel: 'SUNDA PLATE',
    fillColor: 'rgba(14, 165, 233, 0.10)',
    strokeColor: '#0284c7',
    labelCoord: [118.4, 13.8],
    points: [
      [115.0, 21.0], [119.5, 20.5], [119.3, 17.5], [119.2, 15.8], [119.5, 14.2],
      [120.1, 13.0], [121.2, 11.5], [121.8, 9.2], [121.0, 5.0], [115.0, 5.0], [115.0, 21.0],
    ],
  },
  {
    id: 'mobile-belt',
    name: 'Philippine Mobile Belt',
    shortLabel: 'PHILIPPINE MOBILE BELT',
    fillColor: 'rgba(245, 158, 11, 0.11)',
    strokeColor: '#d97706',
    labelCoord: [122.7, 13.5],
    points: [
      [119.5, 20.5], [122.8, 19.2], [125.8, 16.0], [126.6, 13.8], [126.5, 12.2],
      [126.4, 10.8], [126.7, 9.4], [126.9, 7.6], [127.0, 5.8], [124.0, 5.0],
      [121.0, 5.0], [121.8, 9.2], [121.2, 11.5], [120.1, 13.0], [119.5, 14.2],
      [119.2, 15.8], [119.3, 17.5], [119.5, 20.5],
    ],
  },
  {
    id: 'phil-sea',
    name: 'Philippine Sea Plate',
    shortLabel: 'PHILIPPINE SEA PLATE',
    fillColor: 'rgba(99, 102, 241, 0.10)',
    strokeColor: '#4f46e5',
    labelCoord: [128.1, 12.6],
    points: [
      [122.8, 19.2], [134.0, 21.0], [134.0, 5.0], [127.0, 5.8], [126.9, 7.6],
      [126.7, 9.4], [126.4, 10.8], [126.5, 12.2], [126.6, 13.8], [125.8, 16.0], [122.8, 19.2],
    ],
  },
];

export const DEFAULT_PH_CENTER = {
  lat: 12.8797,
  lon: 121.774,
} as const;

export function isEventUnlocated(
  event: Pick<EQPEvent, 'iterations' | 'lat' | 'lon'>,
): boolean {
  return event.iterations === 0 && event.lat === 0 && event.lon === 0;
}

