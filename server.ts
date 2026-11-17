import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  GoogleGenAI,
  Modality,
  type Content,
  type LiveServerMessage,
} from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  parsePhilstaText,
  type StationDataIssue,
  type StationMetaRecord,
  type StationNetworkType,
  type StationOperationalStatus,
} from './src/utils/philstaParser.ts';
import {
  DEFAULT_MAIN_OFFICE,
  isValidPhCoordinate,
  parseCityCsvText,
  parseGentrText,
  parsePopulationCentersText,
  type CityPlaceRecord,
  type GeneratorTraceRecord,
  type MainOfficeLocation,
  type NearestPlacesCatalog,
  type TownPlaceRecord,
} from './src/utils/nearestPlaces.ts';
import { parseEqpFileContent } from './src/utils/eqpStorage.ts';
import {
  buildStationPickAnchors,
  sanitizeAmplitudeSidecar,
  type AmplitudeSidecarPayload,
} from './src/utils/amplitudeMeasurements.ts';
import {
  buildEqpSnapshot,
  diffEqpVersions,
  getEqpEventKey,
  type EqpHistoryEntry,
  type EqpHistoryTrigger,
} from './src/utils/eqpHistory.ts';
import type { EQPEvent, IntensityEntry } from './src/data/eqpData.ts';
import {
  detectCatalogDuplicates,
  parseHistoricalCsv,
  parseHistoricalGeoJson,
  type HistoricalCatalogPayload,
  type HistoricalEarthquakeRecord,
} from './src/utils/historicalSeismicity.ts';
import {
  parseGeodeticCsv,
  parseGeodeticGeoJson,
  type GeodeticDataMode,
  type GeodeticObservationRecord,
  type GeodeticPayload,
} from './src/utils/geodeticStrain.ts';
import type { SavedCoulombConfig } from './src/utils/coulombStress.ts';
import type { SavedSequenceInvestigation } from './src/utils/earthquakeSequence.ts';
import {
  extractDocumentTextFromBuffer,
  extractFindingsWithGeminiServer,
  fetchSafePublicDocument,
  fetchUsgsEventDetailServer,
  inspectGeminiExtractionCapability,
  inspectGeminiSearchCapability,
  searchOfficialSourcesWithGemini,
} from './server/primerResearchHelpers.ts';
import type {
  EventSearchContext,
  PrimerResearchSourceRecord,
  ResearchSourceCategory,
} from './src/utils/primerResearchAssistant.ts';
import type { R2FindingCategory } from './src/utils/primerResearchExtraction.ts';
import { findForbiddenKeys } from './src/utils/primerReviewPackage.ts';
import { MAX_RESEARCH_IMPORT_BYTES } from './src/utils/researchUrlSecurity.ts';

type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EQP_STORAGE_ROOT = path.resolve(__dirname, 'eqp_solutions');
const PHILSTA_SEED_FILE = path.resolve(
  __dirname,
  'public',
  'assets',
  'aistudio',
  'PHILSTA-main_6028d80d.txt'
);
const CITY_CSV_FILE = path.resolve(
  __dirname,
  'public',
  'assets',
  'aistudio',
  'CITY_f9a7e5f3.csv'
);
const POP_CENTERS_FILE = path.resolve(
  __dirname,
  'public',
  'assets',
  'aistudio',
  'Population_Centers_2007_e2850078.txt'
);
const GENTR_FILE = path.resolve(
  __dirname,
  'public',
  'assets',
  'aistudio',
  'GENTR_ab406a82.txt'
);
const STATIONS_DB_FILE = path.resolve(EQP_STORAGE_ROOT, '_stations_db.json');
const PLACES_DB_FILE = path.resolve(EQP_STORAGE_ROOT, '_places_db.json');
const HISTORY_DB_FILE = path.resolve(EQP_STORAGE_ROOT, '_history_db.json');
const SETTINGS_DB_FILE = path.resolve(EQP_STORAGE_ROOT, '_settings_db.json');
const HISTORICAL_SEISMICITY_DB_FILE = path.resolve(
  EQP_STORAGE_ROOT,
  '_historical_seismicity_db.json'
);

let cachedHistoricalDb: HistoricalCatalogPayload | null = null;

async function writeHistoricalDb(payload: HistoricalCatalogPayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(HISTORICAL_SEISMICITY_DB_FILE), { recursive: true });
  await fs.promises.writeFile(
    HISTORICAL_SEISMICITY_DB_FILE,
    JSON.stringify(payload, null, 2),
    'utf8'
  );
  cachedHistoricalDb = payload;
}

async function loadHistoricalDb(): Promise<HistoricalCatalogPayload> {
  if (cachedHistoricalDb) return cachedHistoricalDb;
  try {
    const raw = await fs.promises.readFile(HISTORICAL_SEISMICITY_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HistoricalCatalogPayload>;
    if (Array.isArray(parsed.events)) {
      cachedHistoricalDb = {
        events: parsed.events,
        catalogVersion:
          typeof parsed.catalogVersion === 'number' && parsed.catalogVersion >= 1
            ? parsed.catalogVersion
            : 1,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
      return cachedHistoricalDb;
    }
  } catch {
    // Initialize empty historical catalog DB cleanly on first load
  }
  const initial: HistoricalCatalogPayload = {
    events: [],
    catalogVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  await writeHistoricalDb(initial);
  return initial;
}

const GEODETIC_DB_FILE = path.resolve(EQP_STORAGE_ROOT, '_geodetic_observations_db.json');
let cachedGeodeticDb: GeodeticPayload | null = null;

async function writeGeodeticDb(payload: GeodeticPayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(GEODETIC_DB_FILE), { recursive: true });
  await fs.promises.writeFile(GEODETIC_DB_FILE, JSON.stringify(payload, null, 2), 'utf8');
  cachedGeodeticDb = payload;
}

async function loadGeodeticDb(): Promise<GeodeticPayload> {
  if (cachedGeodeticDb) return cachedGeodeticDb;
  try {
    const raw = await fs.promises.readFile(GEODETIC_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GeodeticPayload>;
    if (Array.isArray(parsed.observations)) {
      cachedGeodeticDb = {
        observations: parsed.observations,
        datasetVersion:
          typeof parsed.datasetVersion === 'number' && parsed.datasetVersion >= 1
            ? parsed.datasetVersion
            : 1,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
      return cachedGeodeticDb;
    }
  } catch {
    // Initialize empty geodetic DB cleanly on first access
  }
  const initial: GeodeticPayload = {
    observations: [],
    datasetVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  await writeGeodeticDb(initial);
  return initial;
}

interface CoulombConfigsPayload {
  configs: SavedCoulombConfig[];
  updatedAt: string;
}

const COULOMB_CONFIGS_FILE = path.resolve(EQP_STORAGE_ROOT, '_coulomb_configs_db.json');
let cachedCoulombConfigsDb: CoulombConfigsPayload | null = null;

async function writeCoulombConfigsDb(payload: CoulombConfigsPayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(COULOMB_CONFIGS_FILE), { recursive: true });
  await fs.promises.writeFile(COULOMB_CONFIGS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  cachedCoulombConfigsDb = payload;
}

async function loadCoulombConfigsDb(): Promise<CoulombConfigsPayload> {
  if (cachedCoulombConfigsDb) return cachedCoulombConfigsDb;
  try {
    const raw = await fs.promises.readFile(COULOMB_CONFIGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CoulombConfigsPayload>;
    if (Array.isArray(parsed.configs)) {
      cachedCoulombConfigsDb = {
        configs: parsed.configs,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
      return cachedCoulombConfigsDb;
    }
  } catch {
    // Initialize empty Coulomb configs DB cleanly on first access
  }
  const initial: CoulombConfigsPayload = {
    configs: [],
    updatedAt: new Date().toISOString(),
  };
  await writeCoulombConfigsDb(initial);
  return initial;
}

interface SequenceInvestigationsPayload {
  investigations: SavedSequenceInvestigation[];
  updatedAt: string;
}

const SEQUENCE_INVESTIGATIONS_FILE = path.resolve(
  EQP_STORAGE_ROOT,
  '_sequence_investigations_db.json'
);
let cachedSequenceInvestigationsDb: SequenceInvestigationsPayload | null = null;

async function writeSequenceInvestigationsDb(
  payload: SequenceInvestigationsPayload
): Promise<void> {
  await fs.promises.mkdir(path.dirname(SEQUENCE_INVESTIGATIONS_FILE), { recursive: true });
  await fs.promises.writeFile(
    SEQUENCE_INVESTIGATIONS_FILE,
    JSON.stringify(payload, null, 2),
    'utf8'
  );
  cachedSequenceInvestigationsDb = payload;
}

async function loadSequenceInvestigationsDb(): Promise<SequenceInvestigationsPayload> {
  if (cachedSequenceInvestigationsDb) return cachedSequenceInvestigationsDb;
  try {
    const raw = await fs.promises.readFile(SEQUENCE_INVESTIGATIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SequenceInvestigationsPayload>;
    if (Array.isArray(parsed.investigations)) {
      cachedSequenceInvestigationsDb = {
        investigations: parsed.investigations,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
      return cachedSequenceInvestigationsDb;
    }
  } catch {
    // Initialize empty sequence investigations DB cleanly on first access
  }
  const initial: SequenceInvestigationsPayload = {
    investigations: [],
    updatedAt: new Date().toISOString(),
  };
  await writeSequenceInvestigationsDb(initial);
  return initial;
}

interface SettingsDbPayload {
  mainOffice: MainOfficeLocation;
  updatedAt: string;
}

let cachedSettingsDb: SettingsDbPayload | null = null;

async function writeSettingsDb(payload: SettingsDbPayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(SETTINGS_DB_FILE), { recursive: true });
  await fs.promises.writeFile(SETTINGS_DB_FILE, JSON.stringify(payload, null, 2), 'utf8');
  cachedSettingsDb = payload;
}

async function loadSettingsDb(): Promise<SettingsDbPayload> {
  if (cachedSettingsDb) return cachedSettingsDb;
  try {
    const raw = await fs.promises.readFile(SETTINGS_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SettingsDbPayload>;
    const mo = parsed.mainOffice;
    if (
      mo &&
      typeof mo.name === 'string' &&
      isValidPhCoordinate(Number(mo.lat), Number(mo.lon))
    ) {
      cachedSettingsDb = {
        mainOffice: {
          code: String(mo.code || 'QVP').trim().toUpperCase() || 'QVP',
          name: mo.name.trim() || DEFAULT_MAIN_OFFICE.name,
          lat: Number(Number(mo.lat).toFixed(4)),
          lon: Number(Number(mo.lon).toFixed(4)),
        },
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
      return cachedSettingsDb;
    }
  } catch {
    // Initialize default settings DB if not present
  }
  const initial: SettingsDbPayload = {
    mainOffice: { ...DEFAULT_MAIN_OFFICE },
    updatedAt: new Date().toISOString(),
  };
  await writeSettingsDb(initial);
  return initial;
}

interface HistoryDbPayload {
  entries: EqpHistoryEntry[];
  updatedAt: string;
}

let cachedHistoryDb: HistoryDbPayload | null = null;

async function writeHistoryDb(payload: HistoryDbPayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(HISTORY_DB_FILE), { recursive: true });
  await fs.promises.writeFile(HISTORY_DB_FILE, JSON.stringify(payload, null, 2), 'utf8');
  cachedHistoryDb = payload;
}

async function loadHistoryDb(): Promise<HistoryDbPayload> {
  if (cachedHistoryDb) return cachedHistoryDb;
  try {
    const raw = await fs.promises.readFile(HISTORY_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HistoryDbPayload>;
    if (Array.isArray(parsed.entries)) {
      cachedHistoryDb = {
        entries: parsed.entries,
        updatedAt:
          typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : new Date().toISOString(),
      };
      return cachedHistoryDb;
    }
  } catch {
    // Initialize empty history DB if not present
  }
  const initial: HistoryDbPayload = {
    entries: [],
    updatedAt: new Date().toISOString(),
  };
  await writeHistoryDb(initial);
  return initial;
}

function getLatestEntryForEventKey(
  entries: EqpHistoryEntry[],
  eventKey: string
): EqpHistoryEntry | null {
  const matching = entries.filter((e) => e.eventKey === eventKey);
  if (matching.length === 0) return null;
  matching.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return matching[matching.length - 1] ?? null;
}

async function syncHistoryWithDiskEqpFiles(): Promise<HistoryDbPayload> {
  const db = await loadHistoryDb();
  const { files } = await listSavedEqpEntries(EQP_STORAGE_ROOT, EQP_STORAGE_ROOT);
  if (files.length === 0) return db;

  const knownRelPaths = new Set<string>();
  const latestRelPathMtime = new Map<string, string>();
  for (const entry of db.entries) {
    if (entry.relPath) {
      knownRelPaths.add(entry.relPath);
      const prevTime = latestRelPathMtime.get(entry.relPath) ?? '';
      if (entry.timestamp > prevTime) {
        latestRelPathMtime.set(entry.relPath, entry.timestamp);
      }
    }
  }

  const filesToIndex = files.filter((f) => {
    if (!knownRelPaths.has(f.relPath)) return true;
    const recordedAt = latestRelPathMtime.get(f.relPath) ?? '';
    const diskMs = Date.parse(f.updatedAt);
    const recMs = Date.parse(recordedAt);
    return Number.isFinite(diskMs) && Number.isFinite(recMs) && diskMs - recMs > 2000;
  });

  if (filesToIndex.length === 0) return db;

  const stationsDb = await loadOrSeedStationsDb();
  const parsedItems: Array<{
    file: SavedEqpFileEntry;
    event: EQPEvent;
    eventKey: string;
  }> = [];

  for (const file of filesToIndex) {
    try {
      const fullPath = path.resolve(EQP_STORAGE_ROOT, file.relPath);
      if (!fullPath.startsWith(EQP_STORAGE_ROOT + path.sep)) continue;
      const content = await fs.promises.readFile(fullPath, 'utf8');
      const parsed = parseEqpFileContent({
        content,
        filename: file.filename,
        displayPath: file.displayPath,
        stations: stationsDb.stations,
      });
      parsedItems.push({
        file,
        event: parsed,
        eventKey: getEqpEventKey(parsed),
      });
    } catch {
      // Skip malformed .eqp files cleanly
    }
  }

  if (parsedItems.length === 0) return db;

  parsedItems.sort((a, b) => {
    if (a.event.bulletinNo !== b.event.bulletinNo) {
      return a.event.bulletinNo - b.event.bulletinNo;
    }
    const tCmp = a.file.updatedAt.localeCompare(b.file.updatedAt);
    if (tCmp !== 0) return tCmp;
    return a.file.filename.localeCompare(b.file.filename);
  });

  const nextEntries = [...db.entries];
  for (const item of parsedItems) {
    const prevEntry = getLatestEntryForEventKey(nextEntries, item.eventKey);
    const nextSnap = buildEqpSnapshot(item.event);
    const feltFlag = nextSnap.intensities.length > 0 ? 'F' : '';
    const { summary, changes } = diffEqpVersions(prevEntry?.snapshot ?? null, nextSnap, {
      trigger: 'backfill',
    });
    nextEntries.push({
      id: `hist_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      eventKey: item.eventKey,
      versionTag: `B${nextSnap.bulletinNo}${feltFlag}`,
      bulletinNo: nextSnap.bulletinNo,
      trigger: 'backfill',
      timestamp: item.file.updatedAt,
      filename: item.file.filename,
      relPath: item.file.relPath,
      displayPath: item.file.displayPath,
      issuedBy: nextSnap.issuedBy || 'SOEPD',
      summary,
      changes,
      snapshot: nextSnap,
    });
  }

  const updated: HistoryDbPayload = {
    entries: nextEntries,
    updatedAt: new Date().toISOString(),
  };
  await writeHistoryDb(updated);
  return updated;
}

interface PlacesDbPayload extends NearestPlacesCatalog {
  updatedAt: string;
}

let cachedPlacesCatalog: PlacesDbPayload | null = null;

async function writePlacesDb(payload: PlacesDbPayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(PLACES_DB_FILE), { recursive: true });
  await fs.promises.writeFile(PLACES_DB_FILE, JSON.stringify(payload, null, 2), 'utf8');
  cachedPlacesCatalog = payload;
}

async function seedPlacesCatalogFromFiles(): Promise<NearestPlacesCatalog> {
  const [cityRaw, popRaw, gentrRaw] = await Promise.all([
    fs.promises.readFile(CITY_CSV_FILE, 'latin1'),
    fs.promises.readFile(POP_CENTERS_FILE, 'utf8'),
    fs.promises.readFile(GENTR_FILE, 'utf8'),
  ]);
  return {
    cities: parseCityCsvText(cityRaw),
    towns: parsePopulationCentersText(popRaw),
    generators: parseGentrText(gentrRaw),
  };
}

async function loadNearestPlacesCatalog(): Promise<PlacesDbPayload> {
  if (cachedPlacesCatalog) return cachedPlacesCatalog;
  try {
    const raw = await fs.promises.readFile(PLACES_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PlacesDbPayload>;
    if (
      Array.isArray(parsed.cities) &&
      Array.isArray(parsed.towns) &&
      Array.isArray(parsed.generators)
    ) {
      cachedPlacesCatalog = {
        cities: parsed.cities,
        towns: parsed.towns,
        generators: parsed.generators,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      };
      return cachedPlacesCatalog;
    }
  } catch {
    // Seed from public/assets/aistudio reference files
  }
  const seeded = await seedPlacesCatalogFromFiles();
  const payload: PlacesDbPayload = {
    ...seeded,
    updatedAt: new Date().toISOString(),
  };
  await writePlacesDb(payload);
  return payload;
}

interface StationsDbPayload {
  stations: StationMetaRecord[];
  issues: StationDataIssue[];
  updatedAt: string;
  source: string;
}

async function writeStationsDb(payload: StationsDbPayload): Promise<void> {
  await fs.promises.mkdir(path.dirname(STATIONS_DB_FILE), { recursive: true });
  await fs.promises.writeFile(STATIONS_DB_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

async function seedStationsDbFromFile(): Promise<StationsDbPayload> {
  const raw = await fs.promises.readFile(PHILSTA_SEED_FILE, 'utf8');
  const parsed = parsePhilstaText(raw);
  const payload: StationsDbPayload = {
    stations: parsed.stations,
    issues: parsed.issues,
    updatedAt: new Date().toISOString(),
    source: 'PHILSTA-main_6028d80d.txt',
  };
  await writeStationsDb(payload);
  return payload;
}

async function loadOrSeedStationsDb(): Promise<StationsDbPayload> {
  try {
    const raw = await fs.promises.readFile(STATIONS_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StationsDbPayload>;
    if (Array.isArray(parsed.stations) && parsed.stations.length > 0) {
      return {
        stations: parsed.stations,
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        source: typeof parsed.source === 'string' ? parsed.source : 'PHILSTA-main_6028d80d.txt',
      };
    }
  } catch {
    // Seed from PHILSTA-main_6028d80d.txt if not yet initialized
  }
  return seedStationsDbFromFile();
}

function sanitizeEqpSegment(seg: string): string {
  return seg.trim().replace(/[^A-Za-z0-9 _.-]/g, '_');
}

function resolveSafeDriveKey(driveRaw: string | undefined): {
  key: string;
  label: string;
  prefixSegments: string[];
} {
  const cleaned = (driveRaw ?? 'Y:').trim().replace(/\//g, '\\').replace(/\\+$/, '');
  if (!cleaned) {
    return { key: 'Y', label: 'Y:', prefixSegments: [] };
  }

  const letterMatch = cleaned.match(/^([a-zA-Z])(?::(?:\\(.*))?)?$/);
  if (letterMatch) {
    const upper = letterMatch[1].toUpperCase();
    const prefixSegments = (letterMatch[2] ?? '')
      .split('\\')
      .map(sanitizeEqpSegment)
      .filter((s) => s.length > 0 && s !== '.' && s !== '..');
    return { key: upper, label: `${upper}:`, prefixSegments };
  }

  const parts = cleaned
    .split('\\')
    .map(sanitizeEqpSegment)
    .filter((s) => s.length > 0 && s !== '.' && s !== '..');
  if (parts.length === 0) {
    return { key: 'Y', label: 'Y:', prefixSegments: [] };
  }
  const key = parts[0];
  return { key, label: key, prefixSegments: parts.slice(1) };
}

function formatDisplayFromRelParts(parts: string[]): {
  displayFolder: string;
  displayPath: string;
} {
  const drivePart = parts[0] || 'Y';
  const drivePrefix = /^[A-Za-z]$/.test(drivePart) ? `${drivePart.toUpperCase()}:` : drivePart;
  const subSegments = parts.slice(1, -1);
  const filename = parts[parts.length - 1] || '';
  const displayFolder =
    subSegments.length > 0 ? `${drivePrefix}\\${subSegments.join('\\')}` : `${drivePrefix}\\`;
  const displayPath =
    subSegments.length > 0 ? `${displayFolder}\\${filename}` : `${drivePrefix}\\${filename}`;
  return { displayFolder, displayPath };
}

function formatFolderFromRelParts(parts: string[]): string {
  const drivePart = parts[0] || 'Y';
  const drivePrefix = /^[A-Za-z]$/.test(drivePart) ? `${drivePart.toUpperCase()}:` : drivePart;
  const subSegments = parts.slice(1);
  return subSegments.length > 0 ? `${drivePrefix}\\${subSegments.join('\\')}` : `${drivePrefix}\\`;
}

interface SavedEqpFileEntry {
  filename: string;
  relPath: string;
  displayFolder: string;
  displayPath: string;
  sizeBytes: number;
  updatedAt: string;
}

interface SavedEqpFolderEntry {
  relFolder: string;
  displayFolder: string;
}

async function listSavedEqpEntries(
  dir: string,
  root: string,
  extRegex: RegExp = /\.eqp$/i
): Promise<{ files: SavedEqpFileEntry[]; folders: SavedEqpFolderEntry[] }> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return { files: [], folders: [] };
  }

  const files: SavedEqpFileEntry[] = [];
  const folders: SavedEqpFolderEntry[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const relFolder = path.relative(root, full).split(path.sep).join('/');
      const parts = relFolder.split('/');
      const displayFolder = formatFolderFromRelParts(parts);
      folders.push({ relFolder, displayFolder });
      const nested = await listSavedEqpEntries(full, root, extRegex);
      files.push(...nested.files);
      folders.push(...nested.folders);
    } else if (entry.isFile() && extRegex.test(entry.name)) {
      const stat = await fs.promises.stat(full);
      const relPath = path.relative(root, full).split(path.sep).join('/');
      const parts = relPath.split('/');
      const { displayFolder, displayPath } = formatDisplayFromRelParts(parts);
      files.push({
        filename: entry.name,
        relPath,
        displayFolder,
        displayPath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }
  return { files, folders };
}

const execFileAsync = promisify(execFile);

interface HostPrinterInfo {
  name: string;
  status: string;
  isDefault: boolean;
  portOrUri?: string;
  driver?: string;
}

interface HostPrinterStatus {
  connected: boolean;
  defaultPrinter: string | null;
  printers: HostPrinterInfo[];
  platform: string;
  detectionSource: string | null;
  reason: string | null;
}

async function detectHostPrinters(): Promise<HostPrinterStatus> {
  const envOverride = (process.env.EQP_DEFAULT_PRINTER || '').trim();
  const cLocaleEnv = { ...process.env, LC_ALL: 'C', LANG: 'C' };

  if (process.platform === 'win32') {
    const psScript = [
      "$reg = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows' -Name Device -ErrorAction SilentlyContinue).Device;",
      "$regDefault = if ($reg) { ($reg -split ',')[0].Trim() } else { '' };",
      "$list = @(Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Select-Object Name,Default,WorkOffline,PrinterStatus,PortName,DriverName);",
      "[PSCustomObject]@{ RegDefault = $regDefault; Printers = $list } | ConvertTo-Json -Depth 3 -Compress",
    ].join(' ');

    for (const psExe of ['powershell.exe', 'pwsh']) {
      try {
        const { stdout } = await execFileAsync(
          psExe,
          ['-NoProfile', '-NonInteractive', '-Command', psScript],
          { timeout: 3500 }
        );
        const trimmed = stdout.replace(/^\uFEFF/, '').trim();
        if (!trimmed) continue;

        const parsed = JSON.parse(trimmed) as {
          RegDefault?: string;
          Printers?:
            | {
                Name?: string;
                Default?: boolean;
                WorkOffline?: boolean;
                PrinterStatus?: number;
                PortName?: string;
                DriverName?: string;
              }
            | Array<{
                Name?: string;
                Default?: boolean;
                WorkOffline?: boolean;
                PrinterStatus?: number;
                PortName?: string;
                DriverName?: string;
              }>;
        };

        const rawList = Array.isArray(parsed.Printers)
          ? parsed.Printers
          : parsed.Printers
            ? [parsed.Printers]
            : [];

        const regDefault = (parsed.RegDefault || '').trim();
        const printers: HostPrinterInfo[] = rawList
          .filter((p) => Boolean(p?.Name))
          .map((p) => {
            const name = String(p.Name).trim();
            const isOffline = Boolean(p.WorkOffline) || p.PrinterStatus === 7;
            const isDef = Boolean(p.Default) || (Boolean(regDefault) && name === regDefault);
            return {
              name,
              status: isOffline ? 'offline' : 'ready',
              isDefault: isDef,
              portOrUri: p.PortName ? String(p.PortName) : undefined,
              driver: p.DriverName ? String(p.DriverName) : undefined,
            };
          });

        const defaultName =
          envOverride ||
          regDefault ||
          printers.find((p) => p.isDefault)?.name ||
          null;

        if (defaultName && !printers.some((p) => p.name === defaultName)) {
          printers.unshift({
            name: defaultName,
            status: 'ready',
            isDefault: true,
          });
        } else {
          for (const p of printers) {
            p.isDefault = Boolean(defaultName && p.name === defaultName);
          }
        }

        const onlineDefault = defaultName
          ? printers.find((p) => p.name === defaultName && p.status !== 'offline') ?? null
          : null;

        if (onlineDefault) {
          return {
            connected: true,
            defaultPrinter: onlineDefault.name,
            printers,
            platform: process.platform,
            detectionSource: regDefault
              ? 'Windows Registry + Print Spooler'
              : 'Windows Print Spooler',
            reason: null,
          };
        }

        return {
          connected: false,
          defaultPrinter: defaultName,
          printers,
          platform: process.platform,
          detectionSource: 'Windows Print Spooler',
          reason: defaultName
            ? `Default system printer "${defaultName}" is currently offline or paused.`
            : printers.length > 0
              ? 'Printers were found on Windows, but no default system printer is active.'
              : 'No connected default printer detected on Windows Print Spooler.',
        };
      } catch {
        // try next shell executable
      }
    }

    return {
      connected: false,
      defaultPrinter: null,
      printers: [],
      platform: process.platform,
      detectionSource: 'Windows Print Spooler',
      reason: 'Unable to query Windows Print Spooler.',
    };
  }

  // POSIX (Linux / macOS): check CUPS lpstat -d, lpoptions -d, LPDEST/PRINTER, lpstat -p/-v/-a
  try {
    const [defaultRes, lpoptRes, listRes, acceptRes, uriRes] = await Promise.allSettled([
      execFileAsync('lpstat', ['-d'], { timeout: 2500, env: cLocaleEnv }),
      execFileAsync('lpoptions', ['-d'], { timeout: 2000, env: cLocaleEnv }),
      execFileAsync('lpstat', ['-p'], { timeout: 2500, env: cLocaleEnv }),
      execFileAsync('lpstat', ['-a'], { timeout: 2500, env: cLocaleEnv }),
      execFileAsync('lpstat', ['-v'], { timeout: 2500, env: cLocaleEnv }),
    ]);

    let defaultName: string | null = envOverride || null;
    let detectionSource: string | null = envOverride ? 'EQP_DEFAULT_PRINTER env' : null;

    if (!defaultName && defaultRes.status === 'fulfilled') {
      const match = defaultRes.value.stdout.match(/system default destination:\s*(.+)/i);
      if (match?.[1]) {
        defaultName = match[1].trim();
        detectionSource = 'CUPS lpstat -d';
      }
    }

    if (!defaultName && lpoptRes.status === 'fulfilled') {
      const lpOptText = lpoptRes.value.stdout.trim();
      const m = lpOptText.match(/^(\S+)/);
      // Verify it's not an error banner and either CUPS accepted it or appears in printers
      if (m?.[1] && !/error|no default/i.test(lpOptText)) {
        defaultName = m[1].trim();
        detectionSource = 'CUPS lpoptions';
      }
    }

    if (!defaultName) {
      const envPrinter = (process.env.LPDEST || process.env.PRINTER || '').trim();
      if (envPrinter) {
        defaultName = envPrinter;
        detectionSource = process.env.LPDEST ? 'LPDEST env' : 'PRINTER env';
      }
    }

    const uriMap = new Map<string, string>();
    if (uriRes.status === 'fulfilled') {
      for (const line of uriRes.value.stdout.split(/\r?\n/)) {
        const m = line.match(/^device for\s+(\S+?):\s*(.+)$/i);
        if (m) uriMap.set(m[1].trim(), m[2].trim());
      }
    }

    const acceptingSet = new Set<string>();
    if (acceptRes.status === 'fulfilled') {
      for (const line of acceptRes.value.stdout.split(/\r?\n/)) {
        const m = line.match(/^(\S+)\s+accepting requests/i);
        if (m) acceptingSet.add(m[1].trim());
      }
    }

    const printerMap = new Map<string, HostPrinterInfo>();
    if (listRes.status === 'fulfilled') {
      for (const line of listRes.value.stdout.split(/\r?\n/)) {
        const m = line.match(/^printer\s+(\S+)\s+(.*)$/i);
        if (!m) continue;
        const name = m[1].trim();
        const desc = m[2].toLowerCase();
        const isOffline = desc.includes('disabled') || desc.includes('offline');
        printerMap.set(name, {
          name,
          status: isOffline ? 'offline' : 'ready',
          isDefault: Boolean(defaultName && name === defaultName),
          portOrUri: uriMap.get(name),
        });
      }
    }

    for (const accName of acceptingSet) {
      if (!printerMap.has(accName)) {
        printerMap.set(accName, {
          name: accName,
          status: 'ready',
          isDefault: Boolean(defaultName && accName === defaultName),
          portOrUri: uriMap.get(accName),
        });
      }
    }

    // If defaultName was found via lpstat -d/lpoptions/env, ensure it appears and test -a if needed
    if (defaultName && !printerMap.has(defaultName)) {
      try {
        const singleAccept = await execFileAsync('lpstat', ['-a', defaultName], {
          timeout: 2000,
          env: cLocaleEnv,
        });
        const ready = /accepting requests/i.test(singleAccept.stdout);
        printerMap.set(defaultName, {
          name: defaultName,
          status: ready ? 'ready' : 'offline',
          isDefault: true,
          portOrUri: uriMap.get(defaultName),
        });
      } catch {
        // Default env/setting points to an uninstalled or offline queue
        printerMap.set(defaultName, {
          name: defaultName,
          status: 'offline',
          isDefault: true,
          portOrUri: uriMap.get(defaultName),
        });
      }
    }

    const printers = Array.from(printerMap.values());
    const activeDefault = defaultName
      ? printers.find((p) => p.name === defaultName && p.status !== 'offline') ?? null
      : null;

    if (activeDefault) {
      return {
        connected: true,
        defaultPrinter: activeDefault.name,
        printers,
        platform: process.platform,
        detectionSource: detectionSource || 'CUPS',
        reason: null,
      };
    }

    return {
      connected: false,
      defaultPrinter: defaultName,
      printers,
      platform: process.platform,
      detectionSource: detectionSource || 'CUPS',
      reason: defaultName
        ? `Default system printer "${defaultName}" is offline or unreachable on this host.`
        : 'No connected default system printer detected on host spooler.',
    };
  } catch {
    return {
      connected: false,
      defaultPrinter: null,
      printers: [],
      platform: process.platform,
      detectionSource: 'CUPS',
      reason: 'No print spooler service or connected default system printer detected.',
    };
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendRawTcp9100Print(params: {
  host: string;
  port: number;
  content: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: params.host, port: params.port });
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(3500);
    socket.on('timeout', () => {
      finish(new Error(`Timed out connecting to LAN printer at ${params.host}:${params.port}.`));
    });
    socket.on('error', (err) => {
      finish(new Error(`Unable to reach LAN printer ${params.host}:${params.port} (${err.message}).`));
    });
    socket.on('connect', () => {
      const normalized = `${params.content.replace(/\r?\n/g, '\r\n')}\r\n\f`;
      socket.write(normalized, 'utf8', (writeErr) => {
        if (writeErr) {
          finish(writeErr);
          return;
        }
        socket.end(() => finish());
      });
    });
  });
}

interface PrintableSheetSnapshot {
  html: string;
  createdAt: number;
}

const PRINTABLE_SHEETS = new Map<string, PrintableSheetSnapshot>();

function pruneExpiredPrintableSheets() {
  const now = Date.now();
  for (const [id, item] of PRINTABLE_SHEETS.entries()) {
    if (now - item.createdAt > 10 * 60 * 1000) {
      PRINTABLE_SHEETS.delete(id);
    }
  }
  while (PRINTABLE_SHEETS.size > 24) {
    const oldest = PRINTABLE_SHEETS.keys().next().value;
    if (!oldest) break;
    PRINTABLE_SHEETS.delete(oldest);
  }
}

const ALLOWED_CHAT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-argon',
  'gemini-4-carbon',
]);

const ALLOWED_VOICES = new Set(['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir']);

interface ChatMessageInput {
  role: 'user' | 'model';
  text: string;
}

interface MapsGroundingLink {
  title: string;
  uri: string;
  placeId?: string;
  snippets: string[];
}

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractMapsGroundingLinks(response: unknown): MapsGroundingLink[] {
  const links: MapsGroundingLink[] = [];
  const seenUris = new Set<string>();
  const resp = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          maps?: {
            uri?: string;
            title?: string;
            placeId?: string;
            placeAnswerSources?: {
              reviewSnippets?: Array<{
                authorAttribution?: { displayName?: string };
                reviewUri?: string;
                flagContentUri?: string;
                text?: string;
                snippet?: string;
              }>;
            };
          };
        }>;
      };
    }>;
  };

  const chunks = resp?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of chunks) {
    const maps = chunk.maps;
    if (!maps?.uri || seenUris.has(maps.uri)) continue;
    seenUris.add(maps.uri);

    const snippets: string[] = [];
    for (const r of maps.placeAnswerSources?.reviewSnippets ?? []) {
      const content = r.snippet ?? r.text;
      if (content) snippets.push(content);
      if (r.reviewUri && !seenUris.has(r.reviewUri)) {
        seenUris.add(r.reviewUri);
        links.push({
          title: `${maps.title || 'Google Maps Place'} — Review`,
          uri: r.reviewUri,
          snippets: content ? [content] : [],
        });
      }
    }

    links.push({
      title: maps.title || 'View on Google Maps',
      uri: maps.uri,
      placeId: maps.placeId,
      snippets,
    });
  }
  return links;
}

function formatGeminiError(err: unknown): { status: number; message: string; code: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
      message:
        'API quota reached for this model. Note that gemini-4-carbon and gemini-4-argon require a billing-enabled key in Settings > Secrets, or you can switch to gemini-4-hydrogen.',
    };
  }
  if (lower.includes('permission_denied') || lower.includes('403') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      code: 'PERMISSION_DENIED',
      message:
        'Gemini API access was denied for the current key. Please verify your API key in Settings > Secrets.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Requested Gemini model endpoint was not found.',
    };
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: raw || 'Gemini request failed.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/config/maps', (_req: Request, res: Response) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({ apiKey });
  });

  app.post('/api/eqp/save', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        drive?: string;
        year?: string;
        month?: string;
        day?: string;
        folderSegments?: string[];
        filename?: string;
        content?: string;
        snapshot?: EQPEvent;
        locationMetadata?: EQPEvent['locationMetadata'];
        magnitudeMetadata?: EQPEvent['magnitudeMetadata'];
        amplitudeMetadata?: AmplitudeSidecarPayload;
        trigger?: EqpHistoryTrigger;
        note?: string;
      };

      const filename = path.basename(String(body.filename ?? '').trim());
      const content = typeof body.content === 'string' ? body.content : '';

      if (
        !filename ||
        filename === '.eqp' ||
        !/^[A-Za-z0-9 _.-]+\.eqp$/i.test(filename) ||
        filename.includes('..')
      ) {
        res.status(400).json({ error: 'Invalid .eqp filename format.' });
        return;
      }

      const { key: driveKey, prefixSegments } = resolveSafeDriveKey(body.drive);
      let subSegments: string[];

      if (Array.isArray(body.folderSegments) && body.folderSegments.length > 0) {
        const cleaned = body.folderSegments.map((s) => String(s).trim());
        const valid = cleaned.every(
          (seg) =>
            seg.length > 0 &&
            seg !== '.' &&
            seg !== '..' &&
            !seg.includes('..') &&
            /^[A-Za-z0-9 _.-]+$/.test(seg)
        );
        if (!valid) {
          res.status(400).json({ error: 'Invalid folder segment name.' });
          return;
        }
        const alreadyHasPrefix =
          prefixSegments.length > 0 &&
          cleaned.length >= prefixSegments.length &&
          prefixSegments.every(
            (p, idx) => p.toLowerCase() === cleaned[idx].toLowerCase()
          );
        subSegments = alreadyHasPrefix ? cleaned : [...prefixSegments, ...cleaned];
      } else {
        const year = String(body.year ?? '').trim();
        const month = String(body.month ?? '').trim();
        const day = String(body.day ?? '').trim();
        if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
          res.status(400).json({ error: 'Invalid date folder format. Expected YYYY/MM/DD.' });
          return;
        }
        subSegments = [...prefixSegments, 'EARTHQUAKE', 'SOLUTION_EQ', `Sol_${year}`, month, day];
      }

      const targetDir = path.resolve(EQP_STORAGE_ROOT, driveKey, ...subSegments);

      if (!targetDir.startsWith(EQP_STORAGE_ROOT + path.sep)) {
        res.status(400).json({ error: 'Invalid target folder path.' });
        return;
      }

      const targetFile = path.resolve(targetDir, filename);
      if (!targetFile.startsWith(targetDir + path.sep)) {
        res.status(400).json({ error: 'Invalid target file path.' });
        return;
      }

      let folderCreated = false;
      try {
        await fs.promises.access(targetDir);
      } catch {
        await fs.promises.mkdir(targetDir, { recursive: true });
        folderCreated = true;
      }

      await fs.promises.writeFile(targetFile, content, 'utf8');
      const companionMeta = body.locationMetadata ?? body.snapshot?.locationMetadata;
      const snapshotIntensities = Array.isArray(body.snapshot?.intensities)
        ? body.snapshot.intensities
        : undefined;
      const intensityMetadata =
        snapshotIntensities ||
        body.snapshot?.intensityBulletinOverride !== undefined ||
        body.snapshot?.rawIntensityImportText !== undefined ||
        body.snapshot?.feltStatusOverride !== undefined
          ? {
              intensities: snapshotIntensities,
              intensityBulletinOverride: body.snapshot?.intensityBulletinOverride,
              rawIntensityImportText: body.snapshot?.rawIntensityImportText,
              feltStatusOverride: body.snapshot?.feltStatusOverride,
            }
          : undefined;
      const companionMagMeta = body.magnitudeMetadata ?? body.snapshot?.magnitudeMetadata;
      const rawAmpMeta: AmplitudeSidecarPayload | undefined =
        body.amplitudeMetadata && typeof body.amplitudeMetadata === 'object'
          ? body.amplitudeMetadata
          : Array.isArray(body.snapshot?.amplitudeMeasurements) ||
              Array.isArray(body.snapshot?.amplitudeAssociationIssues)
            ? {
                schemaVersion: 1,
                measurements: body.snapshot?.amplitudeMeasurements ?? [],
                stationPickAnchors: Array.isArray(body.snapshot?.picks)
                  ? buildStationPickAnchors(body.snapshot.picks)
                  : [],
                ...(Array.isArray(body.snapshot?.amplitudeAssociationIssues) &&
                body.snapshot.amplitudeAssociationIssues.length > 0
                  ? { associationIssues: body.snapshot.amplitudeAssociationIssues }
                  : {}),
              }
            : undefined;
      const sanitizedAmpMeta = rawAmpMeta
        ? sanitizeAmplitudeSidecar(rawAmpMeta, body.snapshot?.id ?? filename)
        : null;
      const amplitudeMetadataPayload: AmplitudeSidecarPayload | undefined = sanitizedAmpMeta
        ? {
            schemaVersion: 1,
            measurements: sanitizedAmpMeta.measurements,
            stationPickAnchors:
              sanitizedAmpMeta.stationPickAnchors.length > 0
                ? sanitizedAmpMeta.stationPickAnchors
                : Array.isArray(body.snapshot?.picks)
                  ? buildStationPickAnchors(body.snapshot.picks)
                  : [],
            ...(sanitizedAmpMeta.issues.length > 0
              ? { associationIssues: sanitizedAmpMeta.issues }
              : {}),
          }
        : undefined;
      const metaSidecarPath = `${targetFile}.meta.json`;
      let metaSidecarExists = false;
      try {
        await fs.promises.access(metaSidecarPath);
        metaSidecarExists = true;
      } catch {
        metaSidecarExists = false;
      }
      const hasAmpData =
        Boolean(amplitudeMetadataPayload) &&
        ((amplitudeMetadataPayload?.measurements.length ?? 0) > 0 ||
          (amplitudeMetadataPayload?.associationIssues?.length ?? 0) > 0);
      if (
        (companionMeta && typeof companionMeta === 'object') ||
        (companionMagMeta && typeof companionMagMeta === 'object') ||
        intensityMetadata ||
        hasAmpData ||
        metaSidecarExists
      ) {
        await fs.promises.writeFile(
          metaSidecarPath,
          JSON.stringify(
            {
              schemaVersion: 3,
              filename,
              savedAt: new Date().toISOString(),
              ...(companionMeta && typeof companionMeta === 'object'
                ? { locationMetadata: companionMeta }
                : {}),
              ...(companionMagMeta && typeof companionMagMeta === 'object'
                ? { magnitudeMetadata: companionMagMeta }
                : {}),
              ...(intensityMetadata ? { intensityMetadata } : {}),
              ...(amplitudeMetadataPayload
                ? { amplitudeMetadata: amplitudeMetadataPayload }
                : {}),
            },
            null,
            2
          ),
          'utf8'
        );
      }
      const stat = await fs.promises.stat(targetFile);
      const relPath = path.relative(EQP_STORAGE_ROOT, targetFile).split(path.sep).join('/');
      const { displayFolder, displayPath } = formatDisplayFromRelParts(relPath.split('/'));

      let historyEntry: EqpHistoryEntry | undefined;
      try {
        const db = await loadHistoryDb();
        let eventForHistory: EQPEvent;
        if (body.snapshot && typeof body.snapshot === 'object' && Array.isArray(body.snapshot.picks)) {
          eventForHistory = {
            ...body.snapshot,
            filename,
            filePath: displayPath,
          };
        } else {
          const stationsDb = await loadOrSeedStationsDb();
          eventForHistory = parseEqpFileContent({
            content,
            filename,
            displayPath,
            stations: stationsDb.stations,
          });
        }
        const eventKey = getEqpEventKey(eventForHistory);
        const prevEntry = getLatestEntryForEventKey(db.entries, eventKey);
        const nextSnap = buildEqpSnapshot(eventForHistory);
        const trigger: EqpHistoryTrigger = body.trigger ?? 'save';
        const feltFlag = nextSnap.intensities.length > 0 ? 'F' : '';
        const { summary, changes } = diffEqpVersions(prevEntry?.snapshot ?? null, nextSnap, {
          trigger,
          note: body.note,
        });
        historyEntry = {
          id: `hist_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
          eventKey,
          versionTag: `B${nextSnap.bulletinNo}${feltFlag}`,
          bulletinNo: nextSnap.bulletinNo,
          trigger,
          timestamp: stat.mtime.toISOString(),
          filename,
          relPath,
          displayPath,
          issuedBy: nextSnap.issuedBy || 'SOEPD',
          summary,
          changes,
          snapshot: nextSnap,
        };
        await writeHistoryDb({
          entries: [...db.entries, historyEntry],
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Non-fatal if history indexing fails during save
      }

      res.json({
        ok: true,
        folderCreated,
        displayFolder,
        displayPath,
        relPath,
        filename,
        sizeBytes: stat.size,
        savedAt: stat.mtime.toISOString(),
        historyEntry,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save EQP file.',
      });
    }
  });

  app.get('/api/eqp/history', async (req: Request, res: Response) => {
    try {
      const db = await syncHistoryWithDiskEqpFiles();
      const eventKeyFilter = String(req.query.eventKey ?? '').trim();
      const entries = (
        eventKeyFilter
          ? db.entries.filter((e) => e.eventKey === eventKeyFilter)
          : [...db.entries]
      ).sort((a, b) => {
        const tCmp = b.timestamp.localeCompare(a.timestamp);
        if (tCmp !== 0) return tCmp;
        return b.bulletinNo - a.bulletinNo;
      });
      res.json({ ok: true, entries, updatedAt: db.updatedAt });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load EQP history.',
      });
    }
  });

  app.post('/api/eqp/history', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        event?: EQPEvent;
        trigger?: EqpHistoryTrigger;
        versionTag?: string;
        note?: string;
      };
      if (!body.event || typeof body.event !== 'object' || !Array.isArray(body.event.picks)) {
        res.status(400).json({ error: 'Valid EQP event snapshot is required.' });
        return;
      }

      const db = await loadHistoryDb();
      const trigger: EqpHistoryTrigger = body.trigger ?? 'locate';
      const eventKey = getEqpEventKey(body.event);
      const prevEntry = getLatestEntryForEventKey(db.entries, eventKey);
      const nextSnap = buildEqpSnapshot(body.event);
      const { summary, changes } = diffEqpVersions(prevEntry?.snapshot ?? null, nextSnap, {
        trigger,
        note: body.note,
      });

      if (
        prevEntry &&
        changes.length === 0 &&
        trigger !== 'save' &&
        trigger !== 'bulletin' &&
        trigger !== 'initial'
      ) {
        const sorted = [...db.entries].sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp)
        );
        res.json({ ok: true, skipped: true, entry: prevEntry, entries: sorted });
        return;
      }

      const feltFlag = nextSnap.intensities.length > 0 ? 'F' : '';
      const defaultTag =
        trigger === 'locate'
          ? `Reloc`
          : trigger === 'ai-picks'
            ? 'AI Picks'
            : trigger === 'magnitude'
              ? 'Mag Dur'
              : `B${nextSnap.bulletinNo}${feltFlag}`;

      const entry: EqpHistoryEntry = {
        id: `hist_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        eventKey,
        versionTag: body.versionTag?.trim() || defaultTag,
        bulletinNo: nextSnap.bulletinNo,
        trigger,
        timestamp: new Date().toISOString(),
        filename: nextSnap.filename || `${eventKey}.eqp`,
        displayPath: nextSnap.filePath || nextSnap.filename || `${eventKey}.eqp`,
        issuedBy: nextSnap.issuedBy || 'SOEPD',
        summary,
        changes,
        snapshot: nextSnap,
      };

      const nextEntries = [...db.entries, entry];
      await writeHistoryDb({
        entries: nextEntries,
        updatedAt: entry.timestamp,
      });
      const sorted = [...nextEntries].sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      );
      res.json({ ok: true, skipped: false, entry, entries: sorted });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to record EQP history.',
      });
    }
  });

  app.get('/api/eqp/files', async (_req: Request, res: Response) => {
    try {
      const { files, folders } = await listSavedEqpEntries(
        EQP_STORAGE_ROOT,
        EQP_STORAGE_ROOT,
        /\.eqp$/i
      );
      const filteredFolders = folders.filter(
        (f) =>
          !f.relFolder
            .split('/')
            .some((seg) => ['BULLETIN_EQ', 'PRIMER_EQ'].includes(seg.toUpperCase()))
      );
      files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      filteredFolders.sort((a, b) => a.displayFolder.localeCompare(b.displayFolder));
      res.json({ files, folders: filteredFolders });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list saved EQP files.',
      });
    }
  });

  app.get('/api/eqp/download', async (req: Request, res: Response) => {
    try {
      const relPath = String(req.query.relPath ?? '').trim();
      if (!relPath) {
        res.status(400).json({ error: 'Missing relPath query parameter.' });
        return;
      }
      const targetFile = path.resolve(EQP_STORAGE_ROOT, relPath);
      if (
        !targetFile.startsWith(EQP_STORAGE_ROOT + path.sep) ||
        !/\.eqp$/i.test(targetFile)
      ) {
        res.status(400).json({ error: 'Invalid file path.' });
        return;
      }
      await fs.promises.access(targetFile);
      res.download(targetFile, path.basename(targetFile));
    } catch {
      res.status(404).json({ error: 'Saved EQP file not found.' });
    }
  });

  app.get('/api/eqp/read', async (req: Request, res: Response) => {
    try {
      const relPath = String(req.query.relPath ?? '').trim();
      if (!relPath) {
        res.status(400).json({ error: 'Missing relPath query parameter.' });
        return;
      }
      const targetFile = path.resolve(EQP_STORAGE_ROOT, relPath);
      if (
        !targetFile.startsWith(EQP_STORAGE_ROOT + path.sep) ||
        !/\.eqp$/i.test(targetFile)
      ) {
        res.status(400).json({ error: 'Invalid file path.' });
        return;
      }
      const content = await fs.promises.readFile(targetFile, 'utf8');
      let locationMetadata: EQPEvent['locationMetadata'] | null = null;
      let magnitudeMetadata: EQPEvent['magnitudeMetadata'] | null = null;
      let amplitudeMetadata: AmplitudeSidecarPayload | null = null;
      let sidecarMalformed = false;
      let sidecarWarning: string | undefined;
      let intensityMetadata: {
        intensities?: IntensityEntry[];
        intensityBulletinOverride?: string;
        rawIntensityImportText?: string;
        feltStatusOverride?: boolean;
      } | null = null;
      try {
        const metaRaw = await fs.promises.readFile(`${targetFile}.meta.json`, 'utf8');
        try {
          const metaParsed = JSON.parse(metaRaw) as {
            locationMetadata?: EQPEvent['locationMetadata'];
            magnitudeMetadata?: EQPEvent['magnitudeMetadata'];
            amplitudeMetadata?: AmplitudeSidecarPayload;
            intensityMetadata?: {
              intensities?: IntensityEntry[];
              intensityBulletinOverride?: string;
              rawIntensityImportText?: string;
              feltStatusOverride?: boolean;
            };
          };
          if (metaParsed?.locationMetadata && typeof metaParsed.locationMetadata === 'object') {
            locationMetadata = metaParsed.locationMetadata;
          }
          if (metaParsed?.magnitudeMetadata && typeof metaParsed.magnitudeMetadata === 'object') {
            magnitudeMetadata = metaParsed.magnitudeMetadata;
          }
          if (metaParsed?.intensityMetadata && typeof metaParsed.intensityMetadata === 'object') {
            intensityMetadata = metaParsed.intensityMetadata;
          }
          if (metaParsed && 'amplitudeMetadata' in metaParsed && metaParsed.amplitudeMetadata !== undefined) {
            amplitudeMetadata = metaParsed.amplitudeMetadata ?? null;
          }
        } catch {
          sidecarMalformed = true;
          sidecarWarning =
            'Sidecar .meta.json contains invalid JSON; loaded legacy .eqp observations safely without sidecar metadata.';
        }
      } catch (readErr) {
        if ((readErr as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          sidecarMalformed = true;
          sidecarWarning =
            'Sidecar .meta.json could not be read; loaded legacy .eqp observations safely.';
        }
        // Legacy .eqp files without a .meta.json sidecar remain valid
      }
      const { displayPath } = formatDisplayFromRelParts(relPath.split('/'));
      res.json({
        ok: true,
        filename: path.basename(targetFile),
        displayPath,
        content,
        locationMetadata,
        magnitudeMetadata,
        intensityMetadata,
        amplitudeMetadata,
        sidecarMalformed,
        ...(sidecarWarning ? { sidecarWarning } : {}),
      });
    } catch {
      res.status(404).json({ error: 'Saved EQP file not found.' });
    }
  });

  app.post('/api/bulletin/save', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        drive?: string;
        year?: string;
        month?: string;
        day?: string;
        folderSegments?: string[];
        filename?: string;
        content?: string;
        eventId?: string;
        bulletinNo?: number;
      };

      const filename = path.basename(String(body.filename ?? '').trim());
      const content = typeof body.content === 'string' ? body.content : '';

      if (
        !filename ||
        /^\.html?$/i.test(filename) ||
        !/^[A-Za-z0-9 _.-]+\.html?$/i.test(filename) ||
        filename.includes('..')
      ) {
        res.status(400).json({ error: 'Invalid .html bulletin filename format.' });
        return;
      }

      if (!content.trim()) {
        res.status(400).json({ error: 'Bulletin HTML content is empty.' });
        return;
      }

      const { key: driveKey, prefixSegments } = resolveSafeDriveKey(body.drive);
      let subSegments: string[];

      if (Array.isArray(body.folderSegments) && body.folderSegments.length > 0) {
        const cleaned = body.folderSegments.map((s) => String(s).trim());
        const valid = cleaned.every(
          (seg) =>
            seg.length > 0 &&
            seg !== '.' &&
            seg !== '..' &&
            !seg.includes('..') &&
            /^[A-Za-z0-9 _.-]+$/.test(seg)
        );
        if (!valid) {
          res.status(400).json({ error: 'Invalid folder segment name.' });
          return;
        }
        const alreadyHasPrefix =
          prefixSegments.length > 0 &&
          cleaned.length >= prefixSegments.length &&
          prefixSegments.every(
            (p, idx) => p.toLowerCase() === cleaned[idx].toLowerCase()
          );
        subSegments = alreadyHasPrefix ? cleaned : [...prefixSegments, ...cleaned];
      } else {
        const year = String(body.year ?? '').trim();
        const month = String(body.month ?? '').trim();
        const day = String(body.day ?? '').trim();
        if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
          res.status(400).json({ error: 'Invalid date folder format. Expected YYYY/MM/DD.' });
          return;
        }
        subSegments = [...prefixSegments, 'EARTHQUAKE', 'BULLETIN_EQ', `Bul_${year}`, month, day];
      }

      const targetDir = path.resolve(EQP_STORAGE_ROOT, driveKey, ...subSegments);
      if (!targetDir.startsWith(EQP_STORAGE_ROOT + path.sep)) {
        res.status(400).json({ error: 'Invalid target folder path.' });
        return;
      }

      const targetFile = path.resolve(targetDir, filename);
      if (!targetFile.startsWith(targetDir + path.sep)) {
        res.status(400).json({ error: 'Invalid target file path.' });
        return;
      }

      let folderCreated = false;
      try {
        await fs.promises.access(targetDir);
      } catch {
        await fs.promises.mkdir(targetDir, { recursive: true });
        folderCreated = true;
      }

      await fs.promises.writeFile(targetFile, content, 'utf8');
      const stat = await fs.promises.stat(targetFile);
      const relPath = path.relative(EQP_STORAGE_ROOT, targetFile).split(path.sep).join('/');
      const { displayFolder, displayPath } = formatDisplayFromRelParts(relPath.split('/'));

      res.json({
        ok: true,
        folderCreated,
        displayFolder,
        displayPath,
        relPath,
        filename,
        sizeBytes: stat.size,
        savedAt: stat.mtime.toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save HTML bulletin.',
      });
    }
  });

  app.get('/api/bulletin/files', async (_req: Request, res: Response) => {
    try {
      const { files, folders } = await listSavedEqpEntries(
        EQP_STORAGE_ROOT,
        EQP_STORAGE_ROOT,
        /\.html?$/i
      );
      const filteredFolders = folders.filter(
        (f) =>
          !f.relFolder
            .split('/')
            .some((seg) => ['SOLUTION_EQ', 'PRIMER_EQ'].includes(seg.toUpperCase()))
      );
      files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      filteredFolders.sort((a, b) => a.displayFolder.localeCompare(b.displayFolder));
      res.json({ files, folders: filteredFolders });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list saved HTML bulletins.',
      });
    }
  });

  app.get('/api/bulletin/download', async (req: Request, res: Response) => {
    try {
      const relPath = String(req.query.relPath ?? '').trim();
      if (!relPath) {
        res.status(400).json({ error: 'Missing relPath query parameter.' });
        return;
      }
      const targetFile = path.resolve(EQP_STORAGE_ROOT, relPath);
      if (
        !targetFile.startsWith(EQP_STORAGE_ROOT + path.sep) ||
        !/\.html?$/i.test(targetFile)
      ) {
        res.status(400).json({ error: 'Invalid bulletin file path.' });
        return;
      }
      await fs.promises.access(targetFile);
      res.download(targetFile, path.basename(targetFile));
    } catch {
      res.status(404).json({ error: 'Saved HTML bulletin not found.' });
    }
  });

  app.get('/api/bulletin/read', async (req: Request, res: Response) => {
    try {
      const relPath = String(req.query.relPath ?? '').trim();
      if (!relPath) {
        res.status(400).json({ error: 'Missing relPath query parameter.' });
        return;
      }
      const targetFile = path.resolve(EQP_STORAGE_ROOT, relPath);
      if (
        !targetFile.startsWith(EQP_STORAGE_ROOT + path.sep) ||
        !/\.html?$/i.test(targetFile)
      ) {
        res.status(400).json({ error: 'Invalid bulletin file path.' });
        return;
      }
      const content = await fs.promises.readFile(targetFile, 'utf8');
      const { displayPath } = formatDisplayFromRelParts(relPath.split('/'));
      res.json({
        ok: true,
        filename: path.basename(targetFile),
        displayPath,
        relPath,
        content,
      });
    } catch {
      res.status(404).json({ error: 'Saved HTML bulletin not found.' });
    }
  });

  app.post('/api/primer/save', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        drive?: string;
        year?: string;
        month?: string;
        day?: string;
        folderSegments?: string[];
        filename?: string;
        content?: string;
        eventId?: string;
        bulletinNo?: number;
      };

      const filename = path.basename(String(body.filename ?? '').trim());
      const content = typeof body.content === 'string' ? body.content : '';

      if (
        !filename ||
        /^\.(?:primer\.)?json$/i.test(filename) ||
        !/^[A-Za-z0-9 _.-]+\.primer\.json$/i.test(filename) ||
        filename.includes('..')
      ) {
        res.status(400).json({ error: 'Invalid .primer.json filename format.' });
        return;
      }

      if (!content.trim()) {
        res.status(400).json({ error: 'Primer document content is empty.' });
        return;
      }

      let parsedPrimer: Record<string, unknown>;
      try {
        parsedPrimer = JSON.parse(content) as Record<string, unknown>;
      } catch {
        res.status(400).json({ error: 'Primer content is not valid JSON.' });
        return;
      }
      if (!parsedPrimer || typeof parsedPrimer !== 'object' || !Array.isArray(parsedPrimer.sections)) {
        res.status(400).json({ error: 'Primer JSON must contain valid sections.' });
        return;
      }

      const { key: driveKey, prefixSegments } = resolveSafeDriveKey(body.drive);
      let subSegments: string[];

      if (Array.isArray(body.folderSegments) && body.folderSegments.length > 0) {
        const cleaned = body.folderSegments.map((s) => String(s).trim());
        const valid = cleaned.every(
          (seg) =>
            seg.length > 0 &&
            seg !== '.' &&
            seg !== '..' &&
            !seg.includes('..') &&
            /^[A-Za-z0-9 _.-]+$/.test(seg)
        );
        if (!valid) {
          res.status(400).json({ error: 'Invalid folder segment name.' });
          return;
        }
        const alreadyHasPrefix =
          prefixSegments.length > 0 &&
          cleaned.length >= prefixSegments.length &&
          prefixSegments.every(
            (p, idx) => p.toLowerCase() === cleaned[idx].toLowerCase()
          );
        subSegments = alreadyHasPrefix ? cleaned : [...prefixSegments, ...cleaned];
      } else {
        const year = String(body.year ?? '').trim();
        const month = String(body.month ?? '').trim();
        const day = String(body.day ?? '').trim();
        if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
          res.status(400).json({ error: 'Invalid date folder format. Expected YYYY/MM/DD.' });
          return;
        }
        subSegments = [...prefixSegments, 'EARTHQUAKE', 'PRIMER_EQ', `Pri_${year}`, month, day];
      }

      const targetDir = path.resolve(EQP_STORAGE_ROOT, driveKey, ...subSegments);
      if (!targetDir.startsWith(EQP_STORAGE_ROOT + path.sep)) {
        res.status(400).json({ error: 'Invalid target folder path.' });
        return;
      }

      const targetFile = path.resolve(targetDir, filename);
      if (!targetFile.startsWith(targetDir + path.sep)) {
        res.status(400).json({ error: 'Invalid target file path.' });
        return;
      }

      let folderCreated = false;
      try {
        await fs.promises.access(targetDir);
      } catch {
        await fs.promises.mkdir(targetDir, { recursive: true });
        folderCreated = true;
      }

      await fs.promises.writeFile(targetFile, content, 'utf8');
      const stat = await fs.promises.stat(targetFile);
      const relPath = path.relative(EQP_STORAGE_ROOT, targetFile).split(path.sep).join('/');
      const { displayFolder, displayPath } = formatDisplayFromRelParts(relPath.split('/'));

      res.json({
        ok: true,
        folderCreated,
        displayFolder,
        displayPath,
        relPath,
        filename,
        sizeBytes: stat.size,
        savedAt: stat.mtime.toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save Earthquake Primer.',
      });
    }
  });

  app.get('/api/primer/files', async (_req: Request, res: Response) => {
    try {
      const { files, folders } = await listSavedEqpEntries(
        EQP_STORAGE_ROOT,
        EQP_STORAGE_ROOT,
        /\.primer\.json$/i
      );
      const filteredFolders = folders.filter(
        (f) =>
          !f.relFolder
            .split('/')
            .some((seg) => ['SOLUTION_EQ', 'BULLETIN_EQ'].includes(seg.toUpperCase()))
      );
      files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      filteredFolders.sort((a, b) => a.displayFolder.localeCompare(b.displayFolder));
      res.json({ files, folders: filteredFolders });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list saved Earthquake Primers.',
      });
    }
  });

  app.get('/api/primer/download', async (req: Request, res: Response) => {
    try {
      const relPath = String(req.query.relPath ?? '').trim();
      if (!relPath) {
        res.status(400).json({ error: 'Missing relPath query parameter.' });
        return;
      }
      const targetFile = path.resolve(EQP_STORAGE_ROOT, relPath);
      if (
        !targetFile.startsWith(EQP_STORAGE_ROOT + path.sep) ||
        !/\.primer\.json$/i.test(targetFile)
      ) {
        res.status(400).json({ error: 'Invalid primer file path.' });
        return;
      }
      await fs.promises.access(targetFile);
      res.download(targetFile, path.basename(targetFile));
    } catch {
      res.status(404).json({ error: 'Saved Earthquake Primer not found.' });
    }
  });

  app.get('/api/primer/read', async (req: Request, res: Response) => {
    try {
      const relPath = String(req.query.relPath ?? '').trim();
      if (!relPath) {
        res.status(400).json({ error: 'Missing relPath query parameter.' });
        return;
      }
      const targetFile = path.resolve(EQP_STORAGE_ROOT, relPath);
      if (
        !targetFile.startsWith(EQP_STORAGE_ROOT + path.sep) ||
        !/\.primer\.json$/i.test(targetFile)
      ) {
        res.status(400).json({ error: 'Invalid primer file path.' });
        return;
      }
      const content = await fs.promises.readFile(targetFile, 'utf8');
      const { displayPath } = formatDisplayFromRelParts(relPath.split('/'));
      res.json({
        ok: true,
        filename: path.basename(targetFile),
        displayPath,
        relPath,
        content,
      });
    } catch {
      res.status(404).json({ error: 'Saved Earthquake Primer not found.' });
    }
  });

  app.get('/api/printers/status', async (_req: Request, res: Response) => {
    const status = await detectHostPrinters();
    res.json(status);
  });

  app.get('/api/printers/default', async (_req: Request, res: Response) => {
    const status = await detectHostPrinters();
    const defaultPrinterInfo = status.defaultPrinter
      ? status.printers.find((p) => p.name === status.defaultPrinter) ?? null
      : null;
    res.json({
      connected: status.connected,
      defaultPrinter: status.defaultPrinter,
      printer: defaultPrinterInfo,
      platform: status.platform,
      detectionSource: status.detectionSource,
      printers: status.printers,
      reason: status.reason,
    });
  });

  app.post('/api/printers/data', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        content?: string;
        jobTitle?: string;
        orientation?: 'portrait' | 'landscape';
        printerName?: string;
        networkAddress?: string;
      };
      const content = typeof body.content === 'string' ? body.content : '';
      if (!content.trim()) {
        res.status(400).json({ ok: false, error: 'Printable EQ data content is empty.' });
        return;
      }

      const jobTitle = String(body.jobTitle || 'EQP_Data_Solution')
        .replace(/[^A-Za-z0-9_.-]/g, '_')
        .slice(0, 64);

      // Optional direct LAN JetDirect / AppSocket (Port 9100) printer output
      const rawNetwork = typeof body.networkAddress === 'string' ? body.networkAddress.trim() : '';
      if (rawNetwork) {
        const match = rawNetwork.match(/^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/);
        if (!match) {
          res.status(400).json({
            ok: false,
            error: 'Invalid network printer address. Use host or IP[:port], e.g. 192.168.1.50:9100.',
          });
          return;
        }
        const host = match[1];
        const port = match[2] ? Number(match[2]) : 9100;
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          res.status(400).json({ ok: false, error: 'Invalid TCP printer port number.' });
          return;
        }
        await sendRawTcp9100Print({ host, port, content });
        res.json({
          ok: true,
          connected: true,
          printerName: `${host}:${port} (LAN TCP/9100)`,
          jobTitle,
        });
        return;
      }

      const status = await detectHostPrinters();
      const requestedName =
        typeof body.printerName === 'string' ? body.printerName.trim() : '';
      const chosenPrinter = requestedName
        ? status.printers.find((p) => p.name === requestedName && p.status !== 'offline')?.name ??
          null
        : status.defaultPrinter;

      if (!chosenPrinter) {
        res.status(404).json({
          ok: false,
          connected: false,
          error: requestedName
            ? `Printer "${requestedName}" is offline or not found.`
            : status.reason || 'No connected default printer detected.',
        });
        return;
      }

      const tmpFile = path.join(os.tmpdir(), `eqp_print_${Date.now()}.txt`);
      await fs.promises.writeFile(tmpFile, content, 'utf8');

      try {
        if (process.platform === 'win32') {
          await execFileAsync(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `Get-Content -Raw -Path '${tmpFile.replace(/'/g, "''")}' | Out-Printer -Name '${chosenPrinter.replace(/'/g, "''")}'`,
            ],
            { timeout: 5000 }
          );
        } else {
          const lpArgs = ['-d', chosenPrinter, '-t', jobTitle];
          if (body.orientation === 'landscape') {
            lpArgs.push('-o', 'landscape');
          }
          lpArgs.push(tmpFile);
          try {
            await execFileAsync('lp', lpArgs, { timeout: 5000 });
          } catch {
            // Fallback to lpr when lp is unavailable
            await execFileAsync('lpr', ['-P', chosenPrinter, '-T', jobTitle, tmpFile], {
              timeout: 5000,
            });
          }
        }

        res.json({
          ok: true,
          connected: true,
          printerName: chosenPrinter,
          jobTitle,
        });
      } finally {
        fs.promises.unlink(tmpFile).catch(() => {
          // ignore temp cleanup errors
        });
      }
    } catch (err) {
      res.status(500).json({
        ok: false,
        connected: false,
        error: err instanceof Error ? err.message : 'Failed to spool print job to printer.',
      });
    }
  });

  app.post('/api/printers/sheet', (req: Request, res: Response) => {
    const body = req.body as {
      title?: string;
      orientation?: 'portrait' | 'landscape';
      sheetText?: string;
    };
    const sheetText = typeof body.sheetText === 'string' ? body.sheetText : '';
    if (!sheetText.trim()) {
      res.status(400).json({ error: 'Printable sheet text is empty.' });
      return;
    }

    const title = escapeHtml(String(body.title || 'EQP Data Printout'));
    const orientation = body.orientation === 'landscape' ? 'landscape' : 'portrait';
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: "Courier New", Courier, monospace; color: #0f172a; background: #f8fafc; }
    .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; margin-bottom: 14px; background: #0b4a8f; color: #ffffff; border-radius: 6px; font-family: system-ui, sans-serif; font-size: 13px; }
    .toolbar button { background: #ffffff; color: #0b4a8f; border: 0; border-radius: 4px; padding: 6px 14px; font-weight: 700; cursor: pointer; }
    .sheet { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 16px; white-space: pre; font-size: ${orientation === 'landscape' ? '10.5px' : '10px'}; line-height: 1.45; overflow-x: auto; }
    @media print {
      body { padding: 0; background: #ffffff; }
      .toolbar { display: none !important; }
      .sheet { border: 0; padding: 0; font-size: ${orientation === 'landscape' ? '9.5pt' : '8.5pt'}; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span><strong>EQP Data Printout:</strong> ${title}</span>
    <button type="button" onclick="window.print()">Print to Printer</button>
  </div>
  <pre class="sheet">${escapeHtml(sheetText)}</pre>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 180);
    });
  </script>
</body>
</html>`;

    pruneExpiredPrintableSheets();
    const id = crypto.randomUUID();
    PRINTABLE_SHEETS.set(id, { html, createdAt: Date.now() });
    res.json({ ok: true, id, url: `/api/printers/sheet/${id}` });
  });

  app.get('/api/printers/sheet/:id', (req: Request, res: Response) => {
    pruneExpiredPrintableSheets();
    const item = PRINTABLE_SHEETS.get(String(req.params.id || ''));
    if (!item) {
      res.status(404).send('Printable sheet expired. Return to EQP and re-open Data Print.');
      return;
    }
    res.type('html').send(item.html);
  });

  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        messages?: ChatMessageInput[];
        model?: string;
        systemInstruction?: string;
        eventContext?: string;
        useMapsGrounding?: boolean;
        latLng?: { latitude: number; longitude: number };
      };

      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (messages.length === 0) {
        res.status(400).json({ error: 'At least one message is required.' });
        return;
      }

      const requestedModel = body.model ?? 'gemini-4-hydrogen';
      if (!ALLOWED_CHAT_MODELS.has(requestedModel)) {
        res.status(400).json({ error: `Unsupported model: ${requestedModel}` });
        return;
      }

      const ai = getGenAI();
      const baseSystem =
        body.systemInstruction?.trim() ||
        'You are a senior seismologist operating the Earthquake Processor (EQP) seismic analysis workstation.';
      const systemInstruction = body.eventContext
        ? `${baseSystem}\n\nActive Earthquake Workspace Telemetry:\n${body.eventContext}`
        : baseSystem;

      if (body.useMapsGrounding) {
        const contents: Content[] = messages.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents,
          config: {
            systemInstruction,
            tools: [{ googleMaps: {} }],
            ...(body.latLng
              ? {
                  toolConfig: {
                    retrievalConfig: {
                      latLng: {
                        latitude: body.latLng.latitude,
                        longitude: body.latLng.longitude,
                      },
                    },
                  },
                }
              : {}),
          },
        });

        const groundingLinks = extractMapsGroundingLinks(response);
        res.json({
          text: response.text ?? '',
          modelUsed: 'gemini-4-hydrogen',
          groundingLinks,
        });
        return;
      }

      const historyMessages = messages.slice(0, -1);
      const latestMessage = messages[messages.length - 1];
      const history: Content[] = historyMessages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const chat = ai.chats.create({
        model: requestedModel,
        history,
        config: {
          systemInstruction,
        },
      });

      const response = await chat.sendMessage({
        message: latestMessage.text,
      });

      res.json({
        text: response.text ?? '',
        modelUsed: requestedModel,
        groundingLinks: [] as MapsGroundingLink[],
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
      });
    }
  });

  app.post('/api/gemini/maps-grounding', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        query?: string;
        latitude?: number;
        longitude?: number;
        eventSummary?: string;
      };

      const query = body.query?.trim();
      if (!query) {
        res.status(400).json({ error: 'Query is required for Maps Grounding.' });
        return;
      }

      const latitude = typeof body.latitude === 'number' ? body.latitude : 14.5995;
      const longitude = typeof body.longitude === 'number' ? body.longitude : 120.9842;

      const ai = getGenAI();
      const prompt = body.eventSummary
        ? `Earthquake Context:\n${body.eventSummary}\n\nGeographic & Field Request near (${latitude.toFixed(4)}, ${longitude.toFixed(4)}):\n${query}`
        : `Geographic & Field Request near (${latitude.toFixed(4)}, ${longitude.toFixed(4)}):\n${query}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a seismological field-response geospatial analyst. Use Google Maps data to provide accurate, up-to-date geographic context, distances, nearby municipalities, critical infrastructure (hospitals, ports, airports, dams, evacuation centers), and local terrain notes around earthquake epicenters.',
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude,
                longitude,
              },
            },
          },
        },
      });

      const links = extractMapsGroundingLinks(response);
      res.json({
        text: response.text ?? '',
        links,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({
        error: formatted.message,
        code: formatted.code,
      });
    }
  });

  app.get('/api/stations', async (_req: Request, res: Response) => {
    try {
      const db = await loadOrSeedStationsDb();
      res.json({ ok: true, ...db });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load station catalog.',
      });
    }
  });

  app.put('/api/stations/:code', async (req: Request, res: Response) => {
    try {
      const code = String(req.params.code ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');
      if (!code) {
        res.status(400).json({ ok: false, error: 'Invalid station code.' });
        return;
      }

      const body = req.body as Partial<StationMetaRecord> & { resolveIssueId?: string };
      const db = await loadOrSeedStationsDb();
      const idx = db.stations.findIndex((s) => s.code.toUpperCase() === code);
      if (idx === -1) {
        res.status(404).json({ ok: false, error: `Station ${code} not found.` });
        return;
      }

      const current = db.stations[idx];
      const nextLat =
        typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : current.lat;
      const nextLon =
        typeof body.lon === 'number' && Number.isFinite(body.lon) ? body.lon : current.lon;
      const nextElev =
        typeof body.elevationM === 'number' && Number.isFinite(body.elevationM)
          ? Math.round(body.elevationM)
          : current.elevationM;
      const nextDelay =
        typeof body.delaySec === 'number' && Number.isFinite(body.delaySec)
          ? Number(body.delaySec.toFixed(3))
          : current.delaySec;

      const allowedNetTypes = new Set<StationNetworkType>([
        'seismic',
        'volcanic',
        'strong_motion',
        'temporary',
      ]);
      const allowedStatuses = new Set<StationOperationalStatus>([
        'active',
        'temporary',
        'unverified',
        'retired',
      ]);

      const coordsChanged = nextLat !== current.lat || nextLon !== current.lon;
      const updatedIssues = db.issues.filter((issue) => {
        if (body.resolveIssueId && issue.id === body.resolveIssueId) return false;
        if (coordsChanged && issue.code === code && issue.kind === 'coordinate_outlier') {
          return false;
        }
        return true;
      });

      const nextFlags = coordsChanged
        ? current.anomalyFlags?.filter((f) => !f.toLowerCase().includes('outlier'))
        : current.anomalyFlags;

      const updatedStation: StationMetaRecord = {
        ...current,
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : current.name,
        province:
          typeof body.province === 'string' && body.province.trim()
            ? body.province.trim()
            : current.province,
        lat: nextLat,
        lon: nextLon,
        elevationM: nextElev,
        delaySec: nextDelay,
        sensor:
          typeof body.sensor === 'string' && body.sensor.trim()
            ? body.sensor.trim()
            : current.sensor,
        networkType:
          body.networkType && allowedNetTypes.has(body.networkType)
            ? body.networkType
            : current.networkType,
        volcanoName:
          body.volcanoName !== undefined ? body.volcanoName : current.volcanoName ?? null,
        status:
          body.status && allowedStatuses.has(body.status)
            ? body.status
            : coordsChanged && current.status === 'unverified'
              ? 'active'
              : current.status,
        auditNote:
          typeof body.auditNote === 'string' ? body.auditNote.trim() || null : current.auditNote,
        anomalyFlags: nextFlags && nextFlags.length > 0 ? nextFlags : undefined,
      };

      const nextStations = [...db.stations];
      nextStations[idx] = updatedStation;

      const nextPayload: StationsDbPayload = {
        ...db,
        stations: nextStations,
        issues: updatedIssues,
        updatedAt: new Date().toISOString(),
      };
      await writeStationsDb(nextPayload);
      res.json({ ok: true, station: updatedStation, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to update station.',
      });
    }
  });

  app.post('/api/stations', async (req: Request, res: Response) => {
    try {
      const body = req.body as
        | {
            action: 'import_philsta';
            rawText: string;
            mode?: 'merge' | 'replace';
            sourceName?: string;
          }
        | {
            action: 'upsert_station';
            station: Partial<StationMetaRecord>;
          };

      const db = await loadOrSeedStationsDb();

      if (body.action === 'import_philsta') {
        const rawText = typeof body.rawText === 'string' ? body.rawText : '';
        if (!rawText.trim()) {
          res.status(400).json({ ok: false, error: 'PHILSTA file content is empty.' });
          return;
        }

        const existingOverrides: Record<string, Partial<StationMetaRecord>> = {};
        if (body.mode !== 'replace') {
          for (const st of db.stations) {
            existingOverrides[st.code] = {
              delaySec: st.delaySec,
              sensor: st.sensor,
            };
          }
        }

        const parsed = parsePhilstaText(rawText, existingOverrides);
        if (parsed.stations.length === 0) {
          res.status(400).json({
            ok: false,
            error: 'No valid station rows detected. Expected: CODE LAT LON ELEV LOCATION.',
          });
          return;
        }

        let mergedStations = parsed.stations;
        if (body.mode !== 'replace') {
          const mergedMap = new Map<string, StationMetaRecord>();
          for (const st of db.stations) mergedMap.set(st.code, st);
          for (const st of parsed.stations) mergedMap.set(st.code, st);
          mergedStations = Array.from(mergedMap.values()).sort((a, b) =>
            a.code.localeCompare(b.code)
          );
        }

        const nextPayload: StationsDbPayload = {
          stations: mergedStations,
          issues: parsed.issues,
          updatedAt: new Date().toISOString(),
          source: body.sourceName?.trim() || 'Uploaded PHILSTA.DAT',
        };
        await writeStationsDb(nextPayload);
        res.json({
          ok: true,
          importedCount: parsed.stations.length,
          rawLineCount: parsed.rawLineCount,
          ...nextPayload,
        });
        return;
      }

      if (body.action === 'upsert_station' && body.station) {
        const rawCode = String(body.station.code ?? '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9_-]/g, '')
          .slice(0, 6);
        if (!rawCode) {
          res.status(400).json({ ok: false, error: 'Station code is required.' });
          return;
        }
        const lat = Number(body.station.lat);
        const lon = Number(body.station.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          res.status(400).json({ ok: false, error: 'Valid latitude and longitude are required.' });
          return;
        }

        const newStation: StationMetaRecord = {
          code: rawCode,
          name: String(body.station.name || `${rawCode} Station`).trim(),
          province: String(body.station.province || 'Philippines').trim(),
          lat,
          lon,
          elevationM: Number.isFinite(Number(body.station.elevationM))
            ? Math.round(Number(body.station.elevationM))
            : 0,
          delaySec: Number.isFinite(Number(body.station.delaySec))
            ? Number(Number(body.station.delaySec).toFixed(3))
            : 0,
          sensor: String(body.station.sensor || 'Broadband 120s').trim(),
          networkType: body.station.networkType || 'seismic',
          volcanoName: body.station.volcanoName ?? null,
          status: body.station.status || 'active',
          telemetry: body.station.telemetry ?? null,
          auditNote: body.station.auditNote ?? 'Added via EQP Station DB',
          anomalyFlags: Array.isArray(body.station.anomalyFlags)
            ? body.station.anomalyFlags
            : undefined,
        };

        const nextStations = [
          ...db.stations.filter((s) => s.code !== rawCode),
          newStation,
        ].sort((a, b) => a.code.localeCompare(b.code));

        const nextPayload: StationsDbPayload = {
          ...db,
          stations: nextStations,
          updatedAt: new Date().toISOString(),
        };
        await writeStationsDb(nextPayload);
        res.json({ ok: true, station: newStation, ...nextPayload });
        return;
      }

      res.status(400).json({ ok: false, error: 'Unsupported station operation.' });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save station.',
      });
    }
  });

  app.post('/api/stations/reset', async (_req: Request, res: Response) => {
    try {
      const payload = await seedStationsDbFromFile();
      res.json({ ok: true, ...payload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to reset station catalog.',
      });
    }
  });

  app.delete('/api/stations/:code', async (req: Request, res: Response) => {
    try {
      const code = String(req.params.code ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, '');
      if (!code) {
        res.status(400).json({ ok: false, error: 'Invalid station code.' });
        return;
      }

      const db = await loadOrSeedStationsDb();
      const target = db.stations.find((s) => s.code.toUpperCase() === code);
      if (!target) {
        res.status(404).json({ ok: false, error: `Station ${code} not found.` });
        return;
      }

      const nextPayload: StationsDbPayload = {
        ...db,
        stations: db.stations.filter((s) => s.code.toUpperCase() !== code),
        issues: db.issues.filter((issue) => issue.code.toUpperCase() !== code),
        updatedAt: new Date().toISOString(),
      };
      await writeStationsDb(nextPayload);
      res.json({ ok: true, deletedStation: target, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to delete station.',
      });
    }
  });

  app.get('/api/places/catalog', async (_req: Request, res: Response) => {
    try {
      const catalog = await loadNearestPlacesCatalog();
      res.json({
        ok: true,
        cities: catalog.cities,
        towns: catalog.towns,
        generators: catalog.generators,
        updatedAt: catalog.updatedAt,
        sources: {
          cityFile: 'CITY_f9a7e5f3.csv',
          townFile: 'Population_Centers_2007_e2850078.txt',
          generatorFile: 'GENTR_ab406a82.txt',
        },
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load nearest places catalog.',
      });
    }
  });

  app.put('/api/places/catalog', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        kind?: 'cities' | 'towns' | 'generators';
        items?: unknown[];
        rawText?: string;
        mode?: 'merge' | 'replace';
      };
      const kind = body.kind;
      if (kind !== 'cities' && kind !== 'towns' && kind !== 'generators') {
        res.status(400).json({ ok: false, error: 'Invalid dataset kind.' });
        return;
      }

      const current = await loadNearestPlacesCatalog();
      const mode = body.mode === 'merge' ? 'merge' : 'replace';
      let nextCities: CityPlaceRecord[] = current.cities;
      let nextTowns: TownPlaceRecord[] = current.towns;
      let nextGenerators: GeneratorTraceRecord[] = current.generators;

      if (typeof body.rawText === 'string') {
        if (!body.rawText.trim()) {
          res.status(400).json({ ok: false, error: 'Raw text content cannot be empty.' });
          return;
        }
        if (kind === 'cities') {
          const parsed = parseCityCsvText(body.rawText);
          if (parsed.length === 0) {
            res.status(400).json({ ok: false, error: 'No valid city rows found. Expected: LAT,LON,NAME' });
            return;
          }
          if (mode === 'merge') {
            const byKey = new Map<string, CityPlaceRecord>();
            current.cities.forEach((c) => byKey.set(c.name.toLowerCase(), c));
            parsed.forEach((c) => byKey.set(c.name.toLowerCase(), c));
            nextCities = Array.from(byKey.values());
          } else {
            nextCities = parsed;
          }
        } else if (kind === 'towns') {
          const parsed = parsePopulationCentersText(body.rawText);
          if (parsed.length === 0) {
            res.status(400).json({
              ok: false,
              error: 'No valid town rows found. Expected Population_Centers CSV format.',
            });
            return;
          }
          if (mode === 'merge') {
            const byKey = new Map<string, TownPlaceRecord>();
            current.towns.forEach((t) => byKey.set(`${t.name.toLowerCase()}|${t.province.toLowerCase()}`, t));
            parsed.forEach((t) => byKey.set(`${t.name.toLowerCase()}|${t.province.toLowerCase()}`, t));
            nextTowns = Array.from(byKey.values());
          } else {
            nextTowns = parsed;
          }
        } else {
          const parsed = parseGentrText(body.rawText);
          if (parsed.length === 0) {
            res.status(400).json({
              ok: false,
              error: 'No valid generator rows found. Expected: LAT  LON  GENERATOR_NAME',
            });
            return;
          }
          if (mode === 'merge') {
            const byKey = new Map<string, GeneratorTraceRecord>();
            current.generators.forEach((g) => byKey.set(g.name.toUpperCase(), g));
            parsed.forEach((g) => byKey.set(g.name.toUpperCase(), g));
            nextGenerators = Array.from(byKey.values());
          } else {
            nextGenerators = parsed;
          }
        }
      } else if (Array.isArray(body.items)) {
        if (kind === 'cities') {
          nextCities = body.items
            .map((raw) => {
              const r = raw as Partial<CityPlaceRecord>;
              const name = String(r.name ?? '').trim();
              const lat = Number(r.lat);
              const lon = Number(r.lon);
              if (!name || !isValidPhCoordinate(lat, lon)) return null;
              return { name, lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };
            })
            .filter((x): x is CityPlaceRecord => x !== null);
        } else if (kind === 'towns') {
          nextTowns = body.items
            .map((raw) => {
              const r = raw as Partial<TownPlaceRecord>;
              const name = String(r.name ?? '').trim();
              const province = String(r.province ?? '').trim();
              const lat = Number(r.lat);
              const lon = Number(r.lon);
              const pop = r.population !== undefined ? Number(r.population) : undefined;
              if (!name || !isValidPhCoordinate(lat, lon)) return null;
              return {
                name,
                province,
                ...(Number.isFinite(pop) ? { population: Math.round(pop as number) } : {}),
                lat: Number(lat.toFixed(6)),
                lon: Number(lon.toFixed(6)),
              };
            })
            .filter((x): x is TownPlaceRecord => x !== null);
        } else {
          nextGenerators = body.items
            .map((raw) => {
              const r = raw as Partial<GeneratorTraceRecord>;
              const name = String(r.name ?? '').trim().toUpperCase();
              const pts = Array.isArray(r.points)
                ? r.points
                    .map((pt) => {
                      const pLat = Number(Array.isArray(pt) ? pt[0] : NaN);
                      const pLon = Number(Array.isArray(pt) ? pt[1] : NaN);
                      if (!isValidPhCoordinate(pLat, pLon)) return null;
                      return [Number(pLat.toFixed(4)), Number(pLon.toFixed(4))] as [number, number];
                    })
                    .filter((pt): pt is [number, number] => pt !== null)
                : [];
              if (!name || pts.length === 0) return null;
              return { name, points: pts };
            })
            .filter((x): x is GeneratorTraceRecord => x !== null);
        }
      } else {
        res.status(400).json({ ok: false, error: 'Missing items or rawText payload.' });
        return;
      }

      const nextPayload: PlacesDbPayload = {
        cities: nextCities,
        towns: nextTowns,
        generators: nextGenerators,
        updatedAt: new Date().toISOString(),
      };
      await writePlacesDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to update nearest places catalog.',
      });
    }
  });

  app.post('/api/places/reset', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { kind?: 'cities' | 'towns' | 'generators' };
      const current = await loadNearestPlacesCatalog();
      const seeded = await seedPlacesCatalogFromFiles();
      const nextPayload: PlacesDbPayload = {
        cities: !body.kind || body.kind === 'cities' ? seeded.cities : current.cities,
        towns: !body.kind || body.kind === 'towns' ? seeded.towns : current.towns,
        generators:
          !body.kind || body.kind === 'generators' ? seeded.generators : current.generators,
        updatedAt: new Date().toISOString(),
      };
      await writePlacesDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to reset nearest places catalog.',
      });
    }
  });

  app.get('/api/settings/main-office', async (_req: Request, res: Response) => {
    try {
      const settings = await loadSettingsDb();
      res.json({ ok: true, ...settings });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to load main office settings.',
      });
    }
  });

  app.put('/api/settings/main-office', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Partial<MainOfficeLocation>;
      const code = String(body.code ?? 'QVP').trim().toUpperCase() || 'QVP';
      const name = String(body.name ?? '').trim();
      const lat = Number(body.lat);
      const lon = Number(body.lon);

      if (!name) {
        res.status(400).json({ ok: false, error: 'Main office reference name is required.' });
        return;
      }
      if (!isValidPhCoordinate(lat, lon)) {
        res.status(400).json({
          ok: false,
          error: 'Coordinates must be valid Philippine latitude (3°–23° N) and longitude (112°–130° E).',
        });
        return;
      }

      const nextPayload: SettingsDbPayload = {
        mainOffice: {
          code,
          name,
          lat: Number(lat.toFixed(4)),
          lon: Number(lon.toFixed(4)),
        },
        updatedAt: new Date().toISOString(),
      };
      await writeSettingsDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save main office settings.',
      });
    }
  });

  app.post('/api/settings/main-office/reset', async (_req: Request, res: Response) => {
    try {
      const nextPayload: SettingsDbPayload = {
        mainOffice: { ...DEFAULT_MAIN_OFFICE },
        updatedAt: new Date().toISOString(),
      };
      await writeSettingsDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to reset main office settings.',
      });
    }
  });

  app.get('/api/research/historical-catalog', async (_req: Request, res: Response) => {
    try {
      const db = await loadHistoricalDb();
      res.json({ ok: true, ...db });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load historical seismicity catalog.',
      });
    }
  });

  app.post('/api/research/historical-catalog/import', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        format?: 'csv' | 'geojson';
        content?: string;
        defaultSource?: string;
        catalogVersion?: string;
        sourceReference?: string;
      };
      const format = body.format;
      const content = typeof body.content === 'string' ? body.content : '';
      if (!content.trim()) {
        res.status(400).json({ ok: false, error: 'Catalog content is empty.' });
        return;
      }

      const retrievedAtUtc = new Date().toISOString();
      const parsed =
        format === 'geojson'
          ? parseHistoricalGeoJson(content, {
              defaultSource: body.defaultSource,
              catalogVersion: body.catalogVersion,
              sourceReference: body.sourceReference,
              retrievedAtUtc,
            })
          : parseHistoricalCsv(content, {
              defaultSource: body.defaultSource,
              catalogVersion: body.catalogVersion,
              sourceReference: body.sourceReference,
              retrievedAtUtc,
            });

      const db = await loadHistoricalDb();
      const dupCheck = detectCatalogDuplicates(parsed.records, db.events);
      const nextEvents = [...dupCheck.uniqueRecords, ...db.events].sort(
        (a, b) => b.originTimeMs - a.originTimeMs
      );
      const nextPayload: HistoricalCatalogPayload = {
        events: nextEvents,
        catalogVersion:
          dupCheck.uniqueRecords.length > 0 ? db.catalogVersion + 1 : db.catalogVersion,
        updatedAt: retrievedAtUtc,
      };
      if (dupCheck.uniqueRecords.length > 0) {
        await writeHistoricalDb(nextPayload);
      }

      res.json({
        ok: true,
        ...nextPayload,
        parsedCount: parsed.records.length,
        addedCount: dupCheck.uniqueRecords.length,
        exactDuplicates: dupCheck.exactDuplicates,
        uncertainDuplicates: dupCheck.uncertainDuplicates,
        rejections: parsed.rejections,
        warnings: parsed.warnings,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to import historical seismicity catalog.',
      });
    }
  });

  app.post('/api/research/historical-catalog/usgs', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        lat?: number;
        lon?: number;
        maxradiuskm?: number;
        minmagnitude?: number;
        starttime?: string;
        endtime?: string;
        limit?: number;
      };
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      const maxradiuskm = Math.max(5, Math.min(2000, Number(body.maxradiuskm) || 100));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        res.status(400).json({ ok: false, error: 'Valid reference latitude and longitude are required.' });
        return;
      }

      const qs = new URLSearchParams({
        format: 'geojson',
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        maxradiuskm: String(Math.round(maxradiuskm)),
        orderby: 'time',
        limit: String(Math.max(10, Math.min(1000, Number(body.limit) || 300))),
      });
      if (body.minmagnitude !== undefined && Number.isFinite(Number(body.minmagnitude))) {
        qs.set('minmagnitude', String(Number(body.minmagnitude)));
      }
      if (body.starttime && String(body.starttime).trim()) {
        qs.set('starttime', String(body.starttime).trim());
      }
      if (body.endtime && String(body.endtime).trim()) {
        qs.set('endtime', String(body.endtime).trim());
      }

      const queryUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?${qs.toString()}`;
      const retrievedAtUtc = new Date().toISOString();
      const upstream = await fetch(queryUrl, {
        headers: {
          Accept: 'application/geo+json, application/json',
          'User-Agent': 'EQP-Modern-Research/1.0',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        res.status(502).json({
          ok: false,
          error: `USGS FDSN API returned HTTP ${upstream.status}: ${text.slice(0, 180) || upstream.statusText}`,
          queryUrl,
        });
        return;
      }

      const geojson = (await upstream.json()) as Record<string, unknown>;
      const parsed = parseHistoricalGeoJson(geojson, {
        defaultSource: 'USGS FDSN',
        catalogVersion: 'USGS FDSN API',
        sourceReference: queryUrl,
        retrievedAtUtc,
      });

      const db = await loadHistoricalDb();
      const dupCheck = detectCatalogDuplicates(parsed.records, db.events);
      const nextEvents = [...dupCheck.uniqueRecords, ...db.events].sort(
        (a, b) => b.originTimeMs - a.originTimeMs
      );
      const nextPayload: HistoricalCatalogPayload = {
        events: nextEvents,
        catalogVersion:
          dupCheck.uniqueRecords.length > 0 ? db.catalogVersion + 1 : db.catalogVersion,
        updatedAt: retrievedAtUtc,
      };
      if (dupCheck.uniqueRecords.length > 0) {
        await writeHistoricalDb(nextPayload);
      }

      res.json({
        ok: true,
        queryUrl,
        retrievedAtUtc,
        ...nextPayload,
        parsedCount: parsed.records.length,
        addedCount: dupCheck.uniqueRecords.length,
        exactDuplicates: dupCheck.exactDuplicates,
        uncertainDuplicates: dupCheck.uncertainDuplicates,
        rejections: parsed.rejections,
        warnings: parsed.warnings,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error
            ? `USGS retrieval failed: ${err.message}`
            : 'USGS FDSN retrieval failed.',
      });
    }
  });

  app.delete('/api/research/historical-catalog/:id', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const db = await loadHistoricalDb();
      const nextEvents = db.events.filter((e: HistoricalEarthquakeRecord) => e.id !== targetId);
      const nextPayload: HistoricalCatalogPayload = {
        events: nextEvents,
        catalogVersion:
          nextEvents.length !== db.events.length ? db.catalogVersion + 1 : db.catalogVersion,
        updatedAt: new Date().toISOString(),
      };
      await writeHistoricalDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to delete historical catalog record.',
      });
    }
  });

  app.delete('/api/research/historical-catalog', async (_req: Request, res: Response) => {
    try {
      const db = await loadHistoricalDb();
      const nextPayload: HistoricalCatalogPayload = {
        events: [],
        catalogVersion: db.catalogVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      await writeHistoricalDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to clear historical seismicity catalog.',
      });
    }
  });

  app.get('/api/research/geodetic-observations', async (_req: Request, res: Response) => {
    try {
      const db = await loadGeodeticDb();
      res.json({ ok: true, ...db });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load geodetic observations dataset.',
      });
    }
  });

  app.post('/api/research/geodetic-observations/import', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        format?: 'csv' | 'geojson';
        content?: string;
        defaultSource?: string;
        datasetId?: string;
        defaultCrs?: string;
        defaultUnit?: string;
        defaultMode?: 'auto' | GeodeticDataMode;
      };
      const format = body.format === 'geojson' ? 'geojson' : 'csv';
      const content = typeof body.content === 'string' ? body.content : '';
      if (!content.trim()) {
        res.status(400).json({ ok: false, error: 'Geodetic import content is empty.' });
        return;
      }

      const importedAtUtc = new Date().toISOString();
      const parsed =
        format === 'geojson'
          ? parseGeodeticGeoJson(content, {
              defaultSource: body.defaultSource,
              datasetId: body.datasetId,
              defaultCrs: body.defaultCrs,
              defaultUnit: body.defaultUnit,
              defaultMode: body.defaultMode,
              importedAtUtc,
            })
          : parseGeodeticCsv(content, {
              defaultSource: body.defaultSource,
              datasetId: body.datasetId,
              defaultCrs: body.defaultCrs,
              defaultUnit: body.defaultUnit,
              defaultMode: body.defaultMode,
              importedAtUtc,
            });

      const db = await loadGeodeticDb();
      const existingIds = new Set(db.observations.map((o: GeodeticObservationRecord) => o.id));
      const newRecords = parsed.records.filter((r) => !existingIds.has(r.id));
      const duplicateCount = parsed.records.length - newRecords.length;
      const nextObservations = [...newRecords, ...db.observations];
      const nextPayload: GeodeticPayload = {
        observations: nextObservations,
        datasetVersion: newRecords.length > 0 ? db.datasetVersion + 1 : db.datasetVersion,
        updatedAt: importedAtUtc,
      };
      if (newRecords.length > 0) {
        await writeGeodeticDb(nextPayload);
      }

      res.json({
        ok: true,
        ...nextPayload,
        parsedCount: parsed.records.length,
        addedCount: newRecords.length,
        duplicateCount,
        rejections: parsed.rejections,
        warnings: parsed.warnings,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to import geodetic observations.',
      });
    }
  });

  app.delete('/api/research/geodetic-observations/:id', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const db = await loadGeodeticDb();
      const nextObservations = db.observations.filter(
        (o: GeodeticObservationRecord) => o.id !== targetId
      );
      const nextPayload: GeodeticPayload = {
        observations: nextObservations,
        datasetVersion:
          nextObservations.length !== db.observations.length
            ? db.datasetVersion + 1
            : db.datasetVersion,
        updatedAt: new Date().toISOString(),
      };
      await writeGeodeticDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to delete geodetic observation record.',
      });
    }
  });

  app.delete('/api/research/geodetic-observations', async (_req: Request, res: Response) => {
    try {
      const db = await loadGeodeticDb();
      const nextPayload: GeodeticPayload = {
        observations: [],
        datasetVersion: db.datasetVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      await writeGeodeticDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to clear geodetic observations dataset.',
      });
    }
  });

  app.get('/api/research/coulomb-configs', async (_req: Request, res: Response) => {
    try {
      const db = await loadCoulombConfigsDb();
      res.json({ ok: true, ...db });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to load saved Coulomb stress configurations.',
      });
    }
  });

  app.post('/api/research/coulomb-configs', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Partial<SavedCoulombConfig>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || !body.sourceModel || !body.receiverModel || !body.elasticParams) {
        res.status(400).json({
          ok: false,
          error: 'Coulomb configuration requires a non-empty name, sourceModel, receiverModel, and elasticParams.',
        });
        return;
      }
      const db = await loadCoulombConfigsDb();
      const now = new Date().toISOString();
      const configId =
        typeof body.id === 'string' && body.id.trim()
          ? body.id.trim()
          : `cfs-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const record: SavedCoulombConfig = {
        id: configId,
        name,
        savedAtUtc: now,
        referenceEventId: String(body.referenceEventId ?? body.sourceModel.referenceEventId ?? ''),
        sourceModel: body.sourceModel,
        receiverModel: body.receiverModel,
        elasticParams: body.elasticParams,
      };
      const existingIdx = db.configs.findIndex((c) => c.id === configId);
      const nextConfigs =
        existingIdx >= 0
          ? db.configs.map((c, idx) => (idx === existingIdx ? record : c))
          : [record, ...db.configs];
      const nextPayload: CoulombConfigsPayload = {
        configs: nextConfigs,
        updatedAt: now,
      };
      await writeCoulombConfigsDb(nextPayload);
      res.json({ ok: true, saved: record, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to save Coulomb stress configuration.',
      });
    }
  });

  app.delete('/api/research/coulomb-configs/:id', async (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const db = await loadCoulombConfigsDb();
      const nextConfigs = db.configs.filter((c) => c.id !== targetId);
      const nextPayload: CoulombConfigsPayload = {
        configs: nextConfigs,
        updatedAt: new Date().toISOString(),
      };
      await writeCoulombConfigsDb(nextPayload);
      res.json({ ok: true, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to delete Coulomb stress configuration.',
      });
    }
  });

  app.get('/api/research/sequence-investigations', async (_req: Request, res: Response) => {
    try {
      const db = await loadSequenceInvestigationsDb();
      res.json({ ok: true, ...db });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load saved earthquake sequence investigations.',
      });
    }
  });

  app.post('/api/research/sequence-investigations', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Partial<SavedSequenceInvestigation>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || !body.filters || !body.referenceEventId) {
        res.status(400).json({
          ok: false,
          error: 'Sequence investigation requires non-empty name, referenceEventId, and filters.',
        });
        return;
      }
      const db = await loadSequenceInvestigationsDb();
      const now = new Date().toISOString();
      const invId =
        typeof body.id === 'string' && body.id.trim()
          ? body.id.trim()
          : `seq-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const record: SavedSequenceInvestigation = {
        id: invId,
        name,
        notes: typeof body.notes === 'string' ? body.notes : '',
        savedAtUtc: now,
        referenceEventId: String(body.referenceEventId),
        acceptedSolutionIterations: Number(body.acceptedSolutionIterations ?? 0),
        candidateMainshockId: body.candidateMainshockId ?? null,
        includedEventIds: Array.isArray(body.includedEventIds) ? body.includedEventIds : [],
        excludedEventIds: Array.isArray(body.excludedEventIds) ? body.excludedEventIds : [],
        manualRoles:
          body.manualRoles && typeof body.manualRoles === 'object' ? body.manualRoles : {},
        filters: body.filters,
        mcMethod: body.mcMethod ?? 'maxc',
        manualMc: Number(body.manualMc ?? 3.0),
        selectedMagType: String(body.selectedMagType ?? ''),
        omoriFitStartDays: Number(body.omoriFitStartDays ?? 0.05),
        omoriFitEndDays: Number(body.omoriFitEndDays ?? 60),
        omoriMc: Number(body.omoriMc ?? 3.0),
        catalogVersion: Number(body.catalogVersion ?? 1),
        analysisMethodVersion: String(body.analysisMethodVersion ?? 'eqp-seq-v1.0'),
        inputFingerprint: String(body.inputFingerprint ?? ''),
        summarySnapshot: body.summarySnapshot ?? {
          selectedCount: 0,
          characterization: 'Background / Unclassified',
          bValue: null,
          mcValue: null,
          omoriP: null,
          overallStatus: 'Experimental',
        },
      };
      const existingIdx = db.investigations.findIndex((i) => i.id === invId);
      const nextInvestigations =
        existingIdx >= 0
          ? db.investigations.map((i, idx) => (idx === existingIdx ? record : i))
          : [record, ...db.investigations];
      const nextPayload: SequenceInvestigationsPayload = {
        investigations: nextInvestigations,
        updatedAt: now,
      };
      await writeSequenceInvestigationsDb(nextPayload);
      res.json({ ok: true, saved: record, ...nextPayload });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to save earthquake sequence investigation.',
      });
    }
  });

  app.delete(
    '/api/research/sequence-investigations/:id',
    async (req: Request, res: Response) => {
      try {
        const targetId = req.params.id;
        const db = await loadSequenceInvestigationsDb();
        const nextInvestigations = db.investigations.filter((i) => i.id !== targetId);
        const nextPayload: SequenceInvestigationsPayload = {
          investigations: nextInvestigations,
          updatedAt: new Date().toISOString(),
        };
        await writeSequenceInvestigationsDb(nextPayload);
        res.json({ ok: true, ...nextPayload });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to delete earthquake sequence investigation.',
        });
      }
    }
  );

  // =========================================================================
  // PRIMER RESEARCH ASSISTANT (R1): Discovery, USGS Detail, Safe URL & Import
  // =========================================================================

  app.get('/api/primer/research/gemini-capability', async (_req: Request, res: Response) => {
    try {
      const report = await inspectGeminiSearchCapability({ runLiveProbe: false });
      res.json({ ok: true, report });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to inspect Gemini Search grounding capability.',
      });
    }
  });

  app.post('/api/primer/research/gemini-capability/probe', async (_req: Request, res: Response) => {
    try {
      const report = await inspectGeminiSearchCapability({ runLiveProbe: true });
      res.json({ ok: true, report });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to run Gemini Search grounding capability probe.',
      });
    }
  });

  app.post('/api/primer/research/search', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        confirmUserInitiated?: boolean;
        eventContext?: EventSearchContext;
        category?: ResearchSourceCategory;
        customQuery?: string;
      };
      if (body.confirmUserInitiated !== true || !body.eventContext?.eventId) {
        res.status(400).json({
          ok: false,
          unavailable: true,
          error:
            'User-initiated confirmation and active EQP eventContext are required for official source search.',
        });
        return;
      }

      const result = await searchOfficialSourcesWithGemini({
        eventContext: body.eventContext,
        category: body.category ?? 'official-update',
        customQuery: body.customQuery,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        ok: false,
        unavailable: true,
        error:
          err instanceof Error ? err.message : 'Official source search request failed.',
      });
    }
  });

  app.post('/api/primer/research/usgs-search', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        lat?: number;
        lon?: number;
        originTimeUtc?: string;
        radiusKm?: number;
        windowHours?: number;
        minMagnitude?: number;
      };
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        res.status(400).json({
          ok: false,
          error: 'Valid event latitude and longitude are required to search matching USGS events.',
        });
        return;
      }

      const anchorMs = body.originTimeUtc ? Date.parse(body.originTimeUtc) : NaN;
      const windowHours = Math.max(1, Math.min(168, Number(body.windowHours) || 24));
      const radiusKm = Math.max(10, Math.min(300, Number(body.radiusKm) || 120));

      const qs = new URLSearchParams({
        format: 'geojson',
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        maxradiuskm: String(Math.round(radiusKm)),
        orderby: 'time',
        limit: '20',
      });
      if (Number.isFinite(anchorMs)) {
        qs.set('starttime', new Date(anchorMs - windowHours * 3_600_000).toISOString());
        qs.set('endtime', new Date(anchorMs + windowHours * 3_600_000).toISOString());
      }
      if (body.minMagnitude !== undefined && Number.isFinite(Number(body.minMagnitude))) {
        qs.set('minmagnitude', String(Number(body.minMagnitude)));
      }

      const queryUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?${qs.toString()}`;
      const upstream = await fetch(queryUrl, {
        headers: {
          Accept: 'application/geo+json, application/json',
          'User-Agent': 'EQP-Modern-Research/1.0',
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        res.status(502).json({
          ok: false,
          queryUrl,
          error: `USGS FDSN search returned HTTP ${upstream.status}: ${text.slice(0, 180) || upstream.statusText}`,
        });
        return;
      }

      const geojson = (await upstream.json()) as {
        features?: Array<{
          id?: string;
          properties?: Record<string, unknown>;
          geometry?: { coordinates?: number[] };
        }>;
      };
      const features = Array.isArray(geojson.features) ? geojson.features : [];
      const candidates = features.map((f) => {
        const p = f.properties ?? {};
        const c = Array.isArray(f.geometry?.coordinates) ? f.geometry!.coordinates! : [];
        const tMs = typeof p.time === 'number' ? p.time : null;
        return {
          usgsEventId: String(f.id ?? p.code ?? ''),
          title: typeof p.title === 'string' ? p.title : `USGS ${f.id ?? ''}`,
          place: typeof p.place === 'string' ? p.place : '',
          originTimeUtc: tMs !== null ? new Date(tMs).toISOString() : null,
          lon: typeof c[0] === 'number' ? c[0] : null,
          lat: typeof c[1] === 'number' ? c[1] : null,
          depthKm: typeof c[2] === 'number' ? c[2] : null,
          magnitude: typeof p.mag === 'number' ? p.mag : null,
          magnitudeType: typeof p.magType === 'string' ? p.magType : null,
          eventPageUrl: typeof p.url === 'string' ? p.url : null,
          detailApiUrl: typeof p.detail === 'string' ? p.detail : null,
          tsunamiFlagRaw: typeof p.tsunami === 'number' ? p.tsunami : null,
        };
      });

      res.json({ ok: true, queryUrl, candidates });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error
            ? `USGS event candidate lookup failed: ${err.message}`
            : 'USGS event candidate lookup failed.',
      });
    }
  });

  app.post('/api/primer/research/usgs-detail', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { usgsEventId?: string };
      const usgsEventId = String(body.usgsEventId ?? '').trim();
      const result = await fetchUsgsEventDetailServer(usgsEventId);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to retrieve USGS ComCat event detail.',
      });
    }
  });

  app.post('/api/primer/research/fetch-url', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { url?: string };
      const url = String(body.url ?? '').trim();
      if (!url) {
        res.status(400).json({ ok: false, error: 'Source URL is required.' });
        return;
      }
      const result = await fetchSafePublicDocument(url, { requireAllowlist: true });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        ok: false,
        retrievalStatus: 'retrieval-unavailable',
        error: err instanceof Error ? err.message : 'Safe URL retrieval failed.',
      });
    }
  });

  app.post(
    '/api/primer/research/import-file',
    express.raw({
      type: '*/*',
      limit: MAX_RESEARCH_IMPORT_BYTES + 1024,
    }),
    async (req: Request, res: Response) => {
      try {
        const buf = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(typeof req.body === 'string' ? req.body : '');
        const rawFilename = String(req.headers['x-eqp-filename'] ?? req.query.filename ?? 'document.txt');
        const filename = path.basename(rawFilename).trim() || 'document.txt';
        const declaredMime = String(
          req.headers['x-eqp-mime'] ?? req.headers['content-type'] ?? ''
        );
        const fallbackTitle = String(req.headers['x-eqp-title'] ?? '').trim() || filename;

        const extracted = await extractDocumentTextFromBuffer({
          buffer: buf,
          filename,
          declaredMimeType: declaredMime,
          fallbackTitle,
          maxBytes: MAX_RESEARCH_IMPORT_BYTES,
        });

        if (!extracted.ok) {
          res.status(400).json(extracted);
          return;
        }
        res.json(extracted);
      } catch (err) {
        res.status(400).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to process uploaded local document.',
        });
      }
    }
  );

  app.get('/api/primer/research/extract-capability', (_req: Request, res: Response) => {
    try {
      const report = inspectGeminiExtractionCapability();
      res.json({ ok: true, report });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to inspect Gemini AI extraction capability.',
      });
    }
  });

  app.post('/api/primer/research/extract-findings', async (req: Request, res: Response) => {
    const ac = new AbortController();
    req.on('aborted', () => ac.abort());
    res.on('close', () => {
      if (!res.writableEnded) {
        ac.abort();
      }
    });

    try {
      const forbiddenHits = findForbiddenKeys(req.body);
      if (forbiddenHits.length > 0) {
        res.status(400).json({
          ok: false,
          unavailable: false,
          code: 'UNSAFE_PAYLOAD',
          error: `Rejected unsafe payload containing forbidden key(s): ${forbiddenHits.slice(0, 3).join(', ')}`,
        });
        return;
      }

      const body = (req.body ?? {}) as {
        operatorConfirmedSendToAi?: boolean;
        operatorAuthorizedExternalTransmission?: boolean;
        source?: PrimerResearchSourceRecord;
        eventContext?: EventSearchContext;
        targetCategories?: R2FindingCategory[];
        extractionRunVersion?: number;
      };

      if (body.operatorConfirmedSendToAi !== true) {
        res.status(400).json({
          ok: false,
          unavailable: false,
          code: 'CONSENT_REQUIRED',
          error:
            'Explicit operator consent is required before sending selected document text to Gemini.',
        });
        return;
      }

      if (!body.source?.sourceId || !body.eventContext?.eventId) {
        res.status(400).json({
          ok: false,
          unavailable: false,
          code: 'INVALID_REQUEST',
          error: 'Valid selected source record and active eventContext are required.',
        });
        return;
      }

      if (body.source.linkedEqpEventId !== body.eventContext.eventId) {
        res.status(400).json({
          ok: false,
          unavailable: false,
          code: 'EVENT_MISMATCH_BLOCKED',
          error: `Selected source (${body.source.linkedEqpEventId}) does not belong to active event ${body.eventContext.eventId}.`,
        });
        return;
      }

      const result = await extractFindingsWithGeminiServer({
        source: body.source,
        eventContext: body.eventContext,
        operatorConfirmedSendToAi: true,
        operatorAuthorizedExternalTransmission: Boolean(
          body.operatorAuthorizedExternalTransmission
        ),
        targetCategories: Array.isArray(body.targetCategories)
          ? body.targetCategories
          : undefined,
        extractionRunVersion:
          typeof body.extractionRunVersion === 'number' ? body.extractionRunVersion : 1,
        abortSignal: ac.signal,
      });

      if (!result.ok && result.code === 'EXTERNAL_TRANSMISSION_AUTH_REQUIRED') {
        res.status(403).json(result);
        return;
      }
      if (
        !result.ok &&
        (result.code === 'SCANNED_NO_TEXT' ||
          result.code === 'EVENT_MISMATCH_BLOCKED' ||
          result.code === 'CONSENT_REQUIRED')
      ) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({
        ok: false,
        unavailable: true,
        error:
          err instanceof Error ? err.message : 'Structured scientific extraction failed.',
      });
    }
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: LiveSession | null = null;
    let isClosing = false;

    const sendToClient = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const connectLiveSession = async (opts: {
      voiceName?: string;
      systemInstruction?: string;
      eventContext?: string;
    }) => {
      try {
        const ai = getGenAI();
        const voiceName =
          opts.voiceName && ALLOWED_VOICES.has(opts.voiceName) ? opts.voiceName : 'Zephyr';
        const baseInstruction =
          opts.systemInstruction?.trim() ||
          'You are the EQP Seismic Duty Officer voice assistant. Speak concisely, clearly, and professionally about earthquake hypocenters, P/S phase residuals, magnitudes, and safety advisories.';
        const systemInstruction = opts.eventContext
          ? `${baseInstruction}\n\nActive Event Telemetry:\n${opts.eventContext}`
          : baseInstruction;

        liveSession = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              sendToClient({ type: 'ready', model: 'gemini-3.8-live', voiceName });
            },
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                sendToClient({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                });
              }
              if (content?.outputTranscription?.text) {
                sendToClient({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                });
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  sendToClient({
                    type: 'audio',
                    data: part.inlineData.data,
                  });
                }
              }
              if (content?.interrupted) {
                sendToClient({ type: 'interrupted' });
              }
              if (content?.turnComplete) {
                sendToClient({ type: 'turnComplete' });
              }
            },
            onerror: (errEvent: unknown) => {
              const message =
                errEvent instanceof Error
                  ? errEvent.message
                  : 'Gemini Live session encountered an error.';
              sendToClient({ type: 'error', message });
            },
            onclose: () => {
              if (!isClosing) {
                sendToClient({ type: 'closed' });
              }
            },
          },
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        sendToClient({ type: 'error', message: formatted.message });
      }
    };

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          voiceName?: string;
          systemInstruction?: string;
          eventContext?: string;
          data?: string;
          text?: string;
        };

        if (msg.type === 'start') {
          if (liveSession) {
            liveSession.close();
            liveSession = null;
          }
          await connectLiveSession({
            voiceName: msg.voiceName,
            systemInstruction: msg.systemInstruction,
            eventContext: msg.eventContext,
          });
          return;
        }

        if (msg.type === 'audio' && msg.data && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
          return;
        }

        if (msg.type === 'text' && msg.text && liveSession) {
          liveSession.sendRealtimeInput({
            text: msg.text,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid Live WebSocket message.';
        sendToClient({ type: 'error', message });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore close errors
        }
        liveSession = null;
      }
    });
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname === '/api/live') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`EQP server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start EQP server:', err);
  process.exit(1);
});
