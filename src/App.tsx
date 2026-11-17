import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Crosshair,
  Database,
  Download,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  Gauge,
  Globe,
  HardDrive,
  History,
  Layers,
  Map as MapIcon,
  MapPin,
  Menu,
  Plus,
  Printer,
  Radar,
  RefreshCw,
  RotateCcw,
  Ruler,
  Save,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Waves,
  Wrench,
  X,
} from 'lucide-react';
import {
  BUTTON_STYLE_OPTIONS,
  type ButtonStylePreset,
  getWorkstationButtonClass,
  ICON_STYLE_OPTIONS,
  type IconStylePreset,
  WorkstationActionIcon,
  WorkstationMenuIcon,
} from './components/WorkstationIcons';
import { BulletinView, type OpenedBulletinDoc } from './components/BulletinView';
import {
  PrimerGeneratorPanel,
  type PrimerPanelController,
  type PrimerPanelStatus,
} from './components/PrimerGeneratorPanel';
import { SocialMediaPanel } from './components/SocialMediaPanel';
import {
  loadSavedPrimerDrafts,
  maybeAutoCreatePrimerDraft,
  type PrimerDocument,
} from './utils/earthquakePrimer';
import { EqpHistoryPanel } from './components/EqpHistoryPanel';
import { DepthFrequencyChart } from './components/DepthFrequencyChart';
import { EpicenterMap } from './components/EpicenterMap';
import { EpicenterMap3D } from './components/EpicenterMap3D';
import { FocalMechanismResearchPanel } from './components/FocalMechanismResearchPanel';
import { HistoricalSeismicityPanel } from './components/HistoricalSeismicityPanel';
import { RegionalStressPanel } from './components/RegionalStressPanel';
import { StrainAnalysisPanel } from './components/StrainAnalysisPanel';
import { CoulombStressPanel } from './components/CoulombStressPanel';
import { EarthquakeSequencePanel } from './components/EarthquakeSequencePanel';
import { PhaseResidualsPanel } from './components/PhaseResidualsPanel';
import {
  GoogleEpicenterMap,
  GoogleMapStyleType,
} from './components/GoogleEpicenterMap';
import { BasemapSelector } from './components/map/BasemapSelector';
import {
  type BasemapProviderId,
  createDefaultViewportForEvent,
  getBasemapMeta,
  loadSavedBasemapId,
  type MapViewportState,
  resolveInitialBasemapId,
  saveSelectedBasemapId,
} from './utils/maps/basemapConfig';

const MapLibreEpicenterMap = React.lazy(() =>
  import('./components/map/MapLibreEpicenterMap').then((mod) => ({
    default: mod.MapLibreEpicenterMap,
  }))
);
import { LiveVoicePanel } from './components/LiveVoicePanel';
import { IntensityInputPanel } from './components/IntensityInputPanel';
import { hasEventFeltDesignation } from './utils/intensityFormat';
import { MagnitudeDistributionChart } from './components/MagnitudeDistributionChart';
import {
  applyOutlierFilteredMagnitudeToEvent,
  computePickDurationMagnitudes,
  isDurationMagnitudeEligible,
  MagnitudeDurationPopup,
} from './components/MagnitudeDurationPopup';
import { MagnitudeConfigurationSection } from './components/MagnitudeConfigurationSection';
import { MagnitudeResultsPanel } from './components/MagnitudeResultsPanel';
import {
  approveUncalibratedMagnitudeMetadata,
  buildHistoricalSavedMagnitudeMetadata,
  computeHistoricalBaselineFingerprint,
  evaluateEventMagnitudes,
  formatLegacyScaleShort,
  inspectMagnitudeFreshness,
  isPreferredMethodSelected,
  loadMagnitudeSettings,
  MAGNITUDE_ALGORITHM_BY_ID,
  resetMagnitudeSettings,
  resolveBulletinMagnitude,
  resolveEventMethodSelection,
  saveMagnitudeSettings,
  selectPreferredMethodOnEventMetadata,
  updateEventMethodSelection,
  type EventMagnitudeMetadata,
  type EventMethodSelectionMode,
  type MagnitudeAlgorithmId,
  type MagnitudeSettings,
} from './utils/magnitudeEngine';
import { MapsGroundingPanel } from './components/MapsGroundingPanel';
import { MapIconPopover } from './components/MapIconPopover';
import { NearestPlacesPopup } from './components/NearestPlacesPopup';
import {
  PhasePickingAIPanel,
  SuggestedPickPatch,
} from './components/PhasePickingAIPanel';
import { SeismologyChatPanel } from './components/SeismologyChatPanel';
import {
  computeViewportGeoBounds,
  SeismicityTrendOverlay,
} from './components/SeismicityTrendOverlay';
import { HistoricalFrequencyChart } from './components/HistoricalFrequencyChart';
import { EpicenterTimelinePanel } from './components/EpicenterTimelinePanel';
import {
  buildTimelineCatalog,
  computeTimelineWindowBounds,
  computeVisibleTimelineEvents,
  type TimelinePlaybackSpeed,
  type TimelineSourceFilter,
  type TimelineTrailMode,
} from './utils/epicenterTimeline';
import type { HistoricalEarthquakeRecord } from './utils/historicalSeismicity';
import { DataPrintOptionsModal } from './components/DataPrintOptionsModal';
import { DataPrintSheet } from './components/DataPrintSheet';
import { OpenSolutionExplorerModal } from './components/OpenSolutionExplorerModal';
import {
  SavedEqpFileItem,
  SavedEqpFolderItem,
  SaveSolutionExplorerModal,
} from './components/SaveSolutionExplorerModal';
import { StationBiasPanel } from './components/StationBiasPanel';
import { StationDatabasePanel } from './components/StationDatabasePanel';
import {
  PlacesDatabasePanel,
  type PlacesDatasetKind,
} from './components/PlacesDatabasePanel';
import { StationHealthWidget } from './components/StationHealthWidget';
import { TravelTimeScatterChart } from './components/TravelTimeScatterChart';
import {
  buildBulletinHtmlDocument,
  printBulletinHtmlDocument,
} from './utils/bulletinHtml';
import { downloadBulletinPdf } from './utils/bulletinPdf';
import {
  createDataPrintPdfBlobUrl,
  DataPrintConfig,
  DEFAULT_DATA_PRINT_CONFIG,
  downloadDataPrintPdf,
  formatDataPrintText,
  getDefaultSystemPrinter,
  HostPrinterStatus,
} from './utils/dataPrint';
import {
  buildBulletinSaveTarget,
  buildEqpSaveTarget,
  buildPrimerSaveTarget,
  DEFAULT_SOLUTION_DRIVE,
  formatEqpFileContent,
  normalizeSolutionDrive,
  parseEqpFileContent,
  SOLUTION_DRIVE_STORAGE_KEY,
} from './utils/eqpStorage';
import {
  type EqpHistoryEntry,
  type EqpHistoryTrigger,
} from './utils/eqpHistory';
import { AmplitudeMeasurementModal } from './components/AmplitudeMeasurementModal';
import {
  buildStationPickAnchors,
  reconcileLoadedAmplitudeSidecar,
  validateEventAmplitudeMeasurements,
  type AmplitudeMeasurement,
  type AmplitudeSidecarPayload,
} from './utils/amplitudeMeasurements';
import {
  type EventUndoEntry,
  MAX_EVENT_UNDO_STEPS,
  popEventUndoEntry,
  pushEventUndoEntry,
  type PushUndoOptions,
} from './utils/eventUndoHistory';
import { CandidateSolutionPanel } from './components/CandidateSolutionPanel';
import { ModelSettingsModal } from './components/ModelSettingsModal';
import {
  type MapComparisonMarker,
  ModelComparisonModal,
} from './components/ModelComparisonModal';
import {
  applyCandidateSolutionToEvent,
  calculateCandidateLocation,
  type CandidateLocationSolution,
  computeEventLocationQuality,
  computeObservationSnapshotChecksum,
  formatLocationQualityTooltip,
  isCandidateSolutionStale,
} from './utils/locationController';
import {
  appendAtlasParseToEqpEvent,
  type AtlasParseResult,
  buildStationMetadataOverridesForPicks,
  detectAtlasHydraFormat,
  parseAtlasHydraClipboard,
} from './utils/atlasHydraParser';
import { getAllModelCatalogMetadata } from './utils/travelTime/registry';
import type {
  CorrectionProfileId,
  TravelTimeModelId,
} from './utils/travelTime/types';
import {
  computeAzimuthalGap,
  computeNearestFaultDistances,
  evaluateTsunamiScreening,
} from './utils/spatialQa';
import {
  STATION_REGION_OPTIONS,
  stationMetaMatchesRegion,
  stationPickMatchesRegion,
  type StationRegionFilter,
} from './utils/stationRegions';
import type { StationDataIssue, StationMetaRecord } from './utils/philstaParser';
import {
  type CityPlaceRecord,
  computeDistanceAndBearing,
  computeNearestPlacesForEpicenter,
  DEFAULT_MAIN_OFFICE,
  formatCentralOfficeBearing,
  type GeneratorTraceRecord,
  isValidPhCoordinate,
  type MainOfficeLocation,
  type NearestPlacesCatalog,
  parseCityCsvText,
  parseGentrText,
  parsePopulationCentersText,
  type TownPlaceRecord,
} from './utils/nearestPlaces';
import {
  computeShakeMapStatistics,
  createDefaultVisibleBands,
  generateShakeMapContours,
  getEffectiveEventMagnitude,
  GMPE_MODELS,
  GmpeModelId,
  GmpeSelectionMode,
  PeisBandCode,
  selectOptimalGmpeModel,
  SHAKEMAP_BANDS,
  ShakeMapResult,
  shakeMapToGeoJson,
} from './utils/shakemap';
import { GeologicalLayersPanel } from './components/GeologicalLayersPanel';
import { GisFaultDistanceCalculator } from './components/GisFaultDistanceCalculator';
import {
  DEFAULT_GEOLOGY_LAYER_VISIBILITY,
  loadActiveFaultsDataset,
  loadGeologyManifest,
  loadTrenchSystemsDataset,
  type ActiveFaultsDataset,
  type GeologyLayerVisibility,
  type GeologyManifest,
  type SelectedGeologyFeature,
  type TrenchSystemsDataset,
} from './utils/geologyLayers';
import {
  exportMapSnapshotPng,
  type MapSnapshotProvider,
} from './utils/mapSnapshotExport';
import {
  ACTIVE_VOLCANOES,
  DEFAULT_PH_CENTER,
  EarthquakeOriginType,
  EQPEvent,
  FAULT_TRACES,
  INITIAL_EVENTS,
  ISLAND_POLYGONS,
  isEventUnlocated,
  MagnitudeScale,
  NavSectionId,
  PHILSTA_DATABASE,
  PICK_QUALITY_WEIGHTS,
  PickQuality,
  Polarity,
  SolverEngine,
  StationMeta,
  StationPick,
  TECTONIC_PLATES,
} from './data/eqpData';

type PickTableSortKey =
  | 'sta'
  | 'pTime'
  | 'sTime'
  | 'duration'
  | 'amplitude'
  | 'polarity'
  | 'quality';

type ResidualsTableSortKey =
  | 'sta'
  | 'toa'
  | 'azim'
  | 'delta'
  | 'resP'
  | 'resS'
  | 'obsP'
  | 'obsS'
  | 'calcP'
  | 'calcS';

type SortDirection = 'asc' | 'desc';

interface TableSortState<K extends string> {
  key: K;
  dir: SortDirection;
}

const POLARITY_SORT_RANK: Record<Polarity, number> = {
  c: 1,
  '+': 2,
  d: 3,
  '-': 4,
  '': 99,
};

const QUALITY_SORT_RANK: Record<PickQuality, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

interface DraftPickInput {
  sta: string;
  pTime: string;
  sTime: string;
  duration: string;
  amplitude: string;
  polarity: Polarity;
  quality: PickQuality;
}

type MapToolPopoverId =
  | 'layers'
  | 'geometry'
  | 'catalog'
  | 'shakemap'
  | 'places'
  | 'inspector';

const createEmptyDraftPick = (): DraftPickInput => ({
  sta: '',
  pTime: '',
  sTime: '',
  duration: '',
  amplitude: '',
  polarity: '',
  quality: 'B',
});

const INITIAL_EVENTS_WITH_BASELINE: EQPEvent[] = INITIAL_EVENTS.map((ev) => ({
  ...ev,
  historicalMagnitudeBaseline: computeHistoricalBaselineFingerprint(ev, PHILSTA_DATABASE),
  magnitudeMetadata: buildHistoricalSavedMagnitudeMetadata({ event: ev }),
}));

export default function App() {
  const [events, setEvents] = useState<EQPEvent[]>(INITIAL_EVENTS_WITH_BASELINE);
  const [activeEventId, setActiveEventId] = useState<string>(INITIAL_EVENTS_WITH_BASELINE[0].id);
  const [activeSection, setActiveSection] = useState<NavSectionId>('locate');
  const [eqpTab, setEqpTab] = useState<
    | 'data'
    | 'map'
    | 'intensity'
    | 'bulletin'
    | 'primer'
    | 'social-media'
    | 'database'
    | 'utils'
    | 'eqp-history'
    | 'tsunami'
    | 'research'
    | 'settings'
  >('data');
  const [researchSubTab, setResearchSubTab] = useState<
    | 'focal-mechanism'
    | 'historical-seismicity'
    | 'regional-stress'
    | 'strain-analysis'
    | 'coulomb-stress'
    | 'earthquake-sequence'
    | 'phase-residuals'
  >('focal-mechanism');
  const [settingsSubTab, setSettingsSubTab] = useState<
    'appearance' | 'magnitude' | 'storage' | 'office' | 'printers' | 'files'
  >('appearance');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Settings: Workstation Icon & Button Theme preset (defaults to classic-3d)
  const [iconStyle, setIconStyle] = useState<IconStylePreset>(() => {
    try {
      const saved = window.localStorage.getItem('eqp_icon_style_preset');
      if (
        saved === 'classic-3d' ||
        saved === 'vibrant-duotone' ||
        saved === 'subtle-hybrid'
      ) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'classic-3d';
  });

  const [buttonStyle, setButtonStyle] = useState<ButtonStylePreset>(() => {
    try {
      const saved = window.localStorage.getItem('eqp_button_style_preset');
      if (
        saved === 'classic-keycap' ||
        saved === 'accent-stripe' ||
        saved === 'pastel-satin' ||
        saved === 'vibrant-glossy'
      ) {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'classic-keycap';
  });

  // Settings: Solution Drive configuration (defaults to Y:) & saved file repository
  const [solutionDrive, setSolutionDrive] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(SOLUTION_DRIVE_STORAGE_KEY);
      return saved ? normalizeSolutionDrive(saved) : DEFAULT_SOLUTION_DRIVE;
    } catch {
      return DEFAULT_SOLUTION_DRIVE;
    }
  });
  const [driveInputDraft, setDriveInputDraft] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(SOLUTION_DRIVE_STORAGE_KEY);
      return saved ? normalizeSolutionDrive(saved) : DEFAULT_SOLUTION_DRIVE;
    } catch {
      return DEFAULT_SOLUTION_DRIVE;
    }
  });
  const [mainOffice, setMainOffice] = useState<MainOfficeLocation>(() => {
    try {
      const raw = window.localStorage.getItem('eqp_main_office_location');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MainOfficeLocation>;
        if (
          typeof parsed.name === 'string' &&
          isValidPhCoordinate(Number(parsed.lat), Number(parsed.lon))
        ) {
          return {
            code: String(parsed.code || 'QVP').trim().toUpperCase() || 'QVP',
            name: parsed.name.trim() || DEFAULT_MAIN_OFFICE.name,
            lat: Number(parsed.lat),
            lon: Number(parsed.lon),
          };
        }
      }
    } catch {
      // Ignore storage failure
    }
    return DEFAULT_MAIN_OFFICE;
  });
  const mainOfficeRef = useRef<MainOfficeLocation>(mainOffice);
  mainOfficeRef.current = mainOffice;
  const [officeCodeDraft, setOfficeCodeDraft] = useState<string>(mainOffice.code);
  const [officeNameDraft, setOfficeNameDraft] = useState<string>(mainOffice.name);
  const [officeLatDraft, setOfficeLatDraft] = useState<string>(mainOffice.lat.toFixed(4));
  const [officeLonDraft, setOfficeLonDraft] = useState<string>(mainOffice.lon.toFixed(4));
  const [isSavingMainOffice, setIsSavingMainOffice] = useState(false);
  const [mainOfficeUpdatedAt, setMainOfficeUpdatedAt] = useState<string | null>(null);
  const [isSavingEqp, setIsSavingEqp] = useState(false);
  const [isSavingBulletin, setIsSavingBulletin] = useState(false);
  const [isSavingPrimer, setIsSavingPrimer] = useState(false);
  const [savedEqpFiles, setSavedEqpFiles] = useState<SavedEqpFileItem[]>([]);
  const [savedEqpFolders, setSavedEqpFolders] = useState<SavedEqpFolderItem[]>([]);
  const [savedBulletinFiles, setSavedBulletinFiles] = useState<SavedEqpFileItem[]>([]);
  const [savedBulletinFolders, setSavedBulletinFolders] = useState<SavedEqpFolderItem[]>([]);
  const [savedPrimerFiles, setSavedPrimerFiles] = useState<SavedEqpFileItem[]>([]);
  const [savedPrimerFolders, setSavedPrimerFolders] = useState<SavedEqpFolderItem[]>([]);
  const [eqpHistory, setEqpHistory] = useState<EqpHistoryEntry[]>([]);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState<'timeline' | 'catalog'>('timeline');
  const [saveExplorerOpen, setSaveExplorerOpen] = useState(false);
  const [saveExplorerMode, setSaveExplorerMode] = useState<'eqp' | 'bulletin' | 'primer'>('eqp');
  const [openExplorerOpen, setOpenExplorerOpen] = useState(false);
  const [openExplorerMode, setOpenExplorerMode] = useState<'eqp' | 'bulletin' | 'primer'>('eqp');
  const [isOpeningEqp, setIsOpeningEqp] = useState(false);
  const [isOpeningBulletin, setIsOpeningBulletin] = useState(false);
  const [isOpeningPrimer, setIsOpeningPrimer] = useState(false);
  const [pendingActionAfterSave, setPendingActionAfterSave] = useState<
    'new' | 'open' | 'print' | null
  >(null);
  const [openedBulletin, setOpenedBulletin] = useState<OpenedBulletinDoc | null>(null);
  const [bulletinDirtyIds, setBulletinDirtyIds] = useState<Record<string, boolean>>({});
  const [savedBulletinTargetsById, setSavedBulletinTargetsById] = useState<
    Record<string, { filename: string; fullPath: string }>
  >({});
  const [savedPrimerTargetsById, setSavedPrimerTargetsById] = useState<
    Record<string, { filename: string; fullPath: string; primerId: string }>
  >({});
  const [pendingOpenedPrimer, setPendingOpenedPrimer] = useState<PrimerDocument | null>(null);
  const primerControllerRef = useRef<PrimerPanelController | null>(null);
  const [primerPanelStatus, setPrimerPanelStatus] = useState<PrimerPanelStatus>({
    hasPrimer: false,
    primerId: null,
    primerTitle: '',
    eventId: INITIAL_EVENTS[0].id,
    hasUnsavedEdits: false,
    isSavedToStorage: false,
    isReadOnlySnapshot: false,
    generationTrigger: null,
  });
  const bulletinBaselineByIdRef = useRef<
    Record<
      string,
      {
        originType: EarthquakeOriginType;
        expectingDamage: boolean;
        expectingAftershocks: boolean;
        printSource: boolean;
        issuedDate: string;
        issuedTime: string;
        issuedBy: string;
        bulletinNo: number;
        bulletinNote1: string;
        bulletinNote2: string;
      }
    >
  >({});
  const bulletinHtmlGetterRef = useRef<(() => string) | null>(null);
  const primaryMapSnapshotProviderRef = useRef<MapSnapshotProvider | null>(null);
  const compareMapSnapshotProviderRef = useRef<MapSnapshotProvider | null>(null);
  const [isExportingMapPng, setIsExportingMapPng] = useState(false);
  const localDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [localDirName, setLocalDirName] = useState<string | null>(null);

  const [solverEngine, setSolverEngine] = useState<SolverEngine>('EQP');
  const [travelTimeModelId, setTravelTimeModelId] = useState<TravelTimeModelId>('jb-jbtab');
  const [correctionProfile, setCorrectionProfile] =
    useState<CorrectionProfileId>('legacy-eqp-s173');
  const [eventRevisions, setEventRevisions] = useState<Record<string, number>>({});
  const [candidateSolution, setCandidateSolution] =
    useState<CandidateLocationSolution | null>(null);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [modelComparisonOpen, setModelComparisonOpen] = useState(false);
  const [mapComparisonMarkers, setMapComparisonMarkers] = useState<MapComparisonMarker[]>([]);
  const highlightResP = true;
  const highlightResS = true;
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [pickTableSort, setPickTableSort] = useState<TableSortState<PickTableSortKey> | null>(null);
  const [residualsTableSort, setResidualsTableSort] =
    useState<TableSortState<ResidualsTableSortKey> | null>(null);
  const [amplitudeDrafts, setAmplitudeDrafts] = useState<Record<string, string>>({});
  const [draftPick, setDraftPick] = useState<DraftPickInput>(createEmptyDraftPick);
  const [workspaceResetNonce, setWorkspaceResetNonce] = useState<number>(0);

  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});
  const [savedSnapshotsById, setSavedSnapshotsById] = useState<Record<string, EQPEvent>>(() => {
    const initial: Record<string, EQPEvent> = {};
    for (const ev of INITIAL_EVENTS_WITH_BASELINE) {
      initial[ev.id] = ev;
    }
    return initial;
  });
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [confirmUnsavedAction, setConfirmUnsavedAction] = useState<
    'new' | 'open' | 'print' | null
  >(null);
  const [confirmUnsavedScope, setConfirmUnsavedScope] = useState<'event' | 'bulletin' | 'primer'>('event');
  const [toolbarPromptAction, setToolbarPromptAction] = useState<
    'new' | 'open' | 'print' | null
  >(null);
  const newPromptRef = useRef<HTMLDivElement | null>(null);
  const openPromptRef = useRef<HTMLDivElement | null>(null);
  const printPromptRef = useRef<HTMLDivElement | null>(null);

  // Multi-method Magnitude Configuration (persisted) & legacy K·σ outlier threshold
  const [magnitudeSettings, setMagnitudeSettings] = useState<MagnitudeSettings>(() =>
    loadMagnitudeSettings()
  );
  const varianceK = magnitudeSettings.legacyVarianceK;
  const setVarianceK = useCallback((nextK: number) => {
    setMagnitudeSettings((prev) => {
      const updated = saveMagnitudeSettings({
        ...prev,
        legacyVarianceK: nextK,
      });
      return updated;
    });
  }, []);
  const [magnitudePopupOpen, setMagnitudePopupOpen] = useState(false);
  const [nearestPlacesPopupOpen, setNearestPlacesPopupOpen] = useState(false);
  const [amplitudeModalPickId, setAmplitudeModalPickId] = useState<string | null>(null);
  const [dismissedAmpIssueKey, setDismissedAmpIssueKey] = useState<string | null>(null);

  // Bulletin template & PDF asset selection
  const [bulletinWithFault, setBulletinWithFault] = useState(false);
  const [pdfIncludeMap, setPdfIncludeMap] = useState(true);
  const [pdfIncludeCharts, setPdfIncludeCharts] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Data Print state (prints to default printer or opens options modal when none connected)
  const [dataPrintOptionsOpen, setDataPrintOptionsOpen] = useState(false);
  const [isCheckingPrinter, setIsCheckingPrinter] = useState(false);
  const [isPrintingDirect, setIsPrintingDirect] = useState(false);
  const [isBrowserPrintingData, setIsBrowserPrintingData] = useState(false);
  const [hostPrinterStatus, setHostPrinterStatus] = useState<HostPrinterStatus | null>(null);
  const [dataPrintConfig, setDataPrintConfig] = useState<DataPrintConfig>(DEFAULT_DATA_PRINT_CONFIG);
  const [dataPrintPreviewActive, setDataPrintPreviewActive] = useState(false);
  const [printableSheetUrl, setPrintableSheetUrl] = useState<string | null>(null);
  const [dataPrintPreviewUrl, setDataPrintPreviewUrl] = useState<string | null>(null);
  const [dataPrintPreviewNotice, setDataPrintPreviewNotice] = useState<string | null>(null);
  const [dataPrintError, setDataPrintError] = useState<string | null>(null);
  const [networkPrinterAddress, setNetworkPrinterAddress] = useState<string>(() => {
    try {
      return window.localStorage.getItem('eqp_network_printer_address') || '';
    } catch {
      return '';
    }
  });

  const refreshSystemPrinters = useCallback(async (): Promise<HostPrinterStatus> => {
    setIsCheckingPrinter(true);
    try {
      const status = await getDefaultSystemPrinter();
      setHostPrinterStatus(status);
      return status;
    } finally {
      setIsCheckingPrinter(false);
    }
  }, []);

  useEffect(() => {
    void refreshSystemPrinters();
  }, [refreshSystemPrinters]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setIsBrowserPrintingData(false);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  useEffect(() => {
    return () => {
      if (dataPrintPreviewUrl) {
        URL.revokeObjectURL(dataPrintPreviewUrl);
      }
    };
  }, [dataPrintPreviewUrl]);

  const clearDataPrintPreview = useCallback(() => {
    setDataPrintPreviewActive(false);
    setPrintableSheetUrl(null);
    setDataPrintError(null);
    setDataPrintPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDataPrintPreviewNotice(null);
  }, []);

  // Catalog filters
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogMinMag, setCatalogMinMag] = useState<number>(0);
  const [catalogFeltOnly, setCatalogFeltOnly] = useState(false);

  // Station DB catalog, filter & health inspection selection
  const [stations, setStations] = useState<StationMeta[]>(PHILSTA_DATABASE);
  const stationsRef = useRef<StationMeta[]>(PHILSTA_DATABASE);
  const [stationIssues, setStationIssues] = useState<StationDataIssue[]>([]);
  const [stationSourceName, setStationSourceName] = useState<string>('Built-in Seed');
  const [stationUpdatedAt, setStationUpdatedAt] = useState<string | null>(null);
  const [stationSearch, setStationSearch] = useState('');
  const [dbSelectedStationCode, setDbSelectedStationCode] = useState<string | null>(null);

  const applyStationCatalogPayload = useCallback(
    (data: {
      stations?: StationMeta[];
      issues?: StationDataIssue[];
      source?: string;
      updatedAt?: string;
    }) => {
      if (Array.isArray(data.stations)) {
        const prevStationsMap = new Map<string, StationMeta>();
        for (const s of stationsRef.current) {
          prevStationsMap.set(s.code, s);
        }
        const nextStations = data.stations;
        stationsRef.current = nextStations;
        setStations(nextStations);

        const nextStationMap = new Map<string, StationMeta>();
        for (const s of nextStations) {
          nextStationMap.set(s.code, s);
        }

        setEvents((prev) =>
          prev.map((ev) => ({
            ...ev,
            picks: ev.picks.map((pick) => {
              const directMeta = nextStationMap.get(pick.sta.toUpperCase());
              const aliasCode =
                pick.atlasMetadata?.resolvedStationCode?.toUpperCase() ??
                (pick.sta.length === 4 && !pick.atlasMetadata?.threeCharAliasConflict
                  ? pick.sta.slice(0, 3).toUpperCase()
                  : null);
              const meta = directMeta ?? (aliasCode ? nextStationMap.get(aliasCode) : undefined);
              if (!meta) return pick;
              const prevMeta =
                prevStationsMap.get(pick.sta.toUpperCase()) ??
                prevStationsMap.get(meta.code.toUpperCase());
              const coordChanged =
                Math.abs(meta.lat - pick.lat) > 0.0001 ||
                Math.abs(meta.lon - pick.lon) > 0.0001;
              const delayDelta =
                prevMeta !== undefined ? meta.delaySec - prevMeta.delaySec : 0;
              const delayChanged = Math.abs(delayDelta) > 0.0005;

              const updatedAtlasMeta =
                pick.atlasMetadata &&
                (pick.atlasMetadata.unknownStation ||
                  pick.atlasMetadata.resolvedStationCode !== meta.code)
                  ? {
                      ...pick.atlasMetadata,
                      resolvedStationCode: meta.code,
                      unknownStation: false,
                    }
                  : pick.atlasMetadata;

              if (!coordChanged && !delayChanged && updatedAtlasMeta === pick.atlasMetadata) {
                return pick;
              }

              const nextCalcP =
                delayChanged && pick.calcP > 0
                  ? Number((pick.calcP + delayDelta).toFixed(2))
                  : pick.calcP;
              const nextCalcS =
                delayChanged && pick.calcS > 0
                  ? Number((pick.calcS + delayDelta * 1.75).toFixed(2))
                  : pick.calcS;
              const nextResP =
                delayChanged && pick.pTime.trim() !== '' && pick.obsP > 0
                  ? Number((pick.obsP - nextCalcP).toFixed(2))
                  : pick.resP;
              const nextResS =
                delayChanged && pick.sTime.trim() !== '' && pick.obsS > 0
                  ? Number((pick.obsS - nextCalcS).toFixed(2))
                  : pick.resS;

              return {
                ...pick,
                lat: meta.lat,
                lon: meta.lon,
                calcP: nextCalcP,
                calcS: nextCalcS,
                resP: nextResP,
                resS: nextResS,
                ...(updatedAtlasMeta ? { atlasMetadata: updatedAtlasMeta } : {}),
              };
            }),
          }))
        );
      }
      if (Array.isArray(data.issues)) setStationIssues(data.issues);
      if (data.source) setStationSourceName(data.source);
      if (data.updatedAt) setStationUpdatedAt(data.updatedAt);
    },
    []
  );

  useEffect(() => {
    let active = true;
    fetch('/api/stations', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            ok?: boolean;
            stations?: StationMeta[];
            issues?: StationDataIssue[];
            source?: string;
            updatedAt?: string;
          } | null
        ) => {
          if (!active || !data?.ok || !Array.isArray(data.stations) || data.stations.length === 0) {
            return;
          }
          applyStationCatalogPayload(data);
        }
      )
      .catch(() => {
        // Fallback smoothly to built-in PHILSTA_DATABASE
      });
    return () => {
      active = false;
    };
  }, [applyStationCatalogPayload]);

  // Nearest Places reference catalog (CITY_f9a7e5f3.csv, Population_Centers_2007_e2850078.txt, GENTR_ab406a82.txt)
  const [placesCatalog, setPlacesCatalog] = useState<NearestPlacesCatalog | null>(null);
  const [placesUpdatedAt, setPlacesUpdatedAt] = useState<string | null>(null);
  const placesCatalogRef = useRef<NearestPlacesCatalog | null>(null);
  const placesCatalogPromiseRef = useRef<Promise<NearestPlacesCatalog | null> | null>(null);

  const ensurePlacesCatalog = useCallback(async (): Promise<NearestPlacesCatalog | null> => {
    if (placesCatalogRef.current) return placesCatalogRef.current;
    if (placesCatalogPromiseRef.current) return placesCatalogPromiseRef.current;

    const loadPromise = (async () => {
      try {
        const res = await fetch('/api/places/catalog', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            cities?: NearestPlacesCatalog['cities'];
            towns?: NearestPlacesCatalog['towns'];
            generators?: NearestPlacesCatalog['generators'];
            updatedAt?: string;
          };
          if (
            data?.ok &&
            Array.isArray(data.cities) &&
            Array.isArray(data.towns) &&
            Array.isArray(data.generators)
          ) {
            const loaded: NearestPlacesCatalog = {
              cities: data.cities,
              towns: data.towns,
              generators: data.generators,
            };
            placesCatalogRef.current = loaded;
            setPlacesCatalog(loaded);
            if (data.updatedAt) setPlacesUpdatedAt(data.updatedAt);
            return loaded;
          }
        }
      } catch {
        // Fall through to static asset loading
      }

      try {
        const [cityRes, popRes, gentrRes] = await Promise.all([
          fetch('/assets/aistudio/CITY_f9a7e5f3.csv'),
          fetch('/assets/aistudio/Population_Centers_2007_e2850078.txt'),
          fetch('/assets/aistudio/GENTR_ab406a82.txt'),
        ]);
        if (!cityRes.ok || !popRes.ok || !gentrRes.ok) {
          placesCatalogPromiseRef.current = null;
          return null;
        }
        const [cityBuf, popText, gentrText] = await Promise.all([
          cityRes.arrayBuffer(),
          popRes.text(),
          gentrRes.text(),
        ]);
        const cityText = new TextDecoder('iso-8859-1').decode(cityBuf);
        const loaded: NearestPlacesCatalog = {
          cities: parseCityCsvText(cityText),
          towns: parsePopulationCentersText(popText),
          generators: parseGentrText(gentrText),
        };
        placesCatalogRef.current = loaded;
        setPlacesCatalog(loaded);
        return loaded;
      } catch {
        placesCatalogPromiseRef.current = null;
        return null;
      }
    })();

    placesCatalogPromiseRef.current = loadPromise;
    return loadPromise;
  }, []);

  const applyUpdatedMainOffice = useCallback(
    (nextOffice: MainOfficeLocation, updatedAt?: string | null, refreshEvents = true) => {
      mainOfficeRef.current = nextOffice;
      setMainOffice(nextOffice);
      setOfficeCodeDraft(nextOffice.code);
      setOfficeNameDraft(nextOffice.name);
      setOfficeLatDraft(nextOffice.lat.toFixed(4));
      setOfficeLonDraft(nextOffice.lon.toFixed(4));
      if (updatedAt) setMainOfficeUpdatedAt(updatedAt);
      try {
        window.localStorage.setItem('eqp_main_office_location', JSON.stringify(nextOffice));
      } catch {
        // Ignore storage failure
      }
      if (refreshEvents) {
        setEvents((prev) =>
          prev.map((ev) => {
            if (isEventUnlocated(ev)) return ev;
            return {
              ...ev,
              centralOfficeBearing: formatCentralOfficeBearing(ev.lat, ev.lon, nextOffice),
            };
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    void ensurePlacesCatalog();
    void (async () => {
      try {
        const res = await fetch('/api/settings/main-office', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          mainOffice?: MainOfficeLocation;
          updatedAt?: string;
        };
        if (
          data?.ok &&
          data.mainOffice &&
          isValidPhCoordinate(data.mainOffice.lat, data.mainOffice.lon)
        ) {
          const loaded = data.mainOffice;
          const isCustom =
            loaded.code !== DEFAULT_MAIN_OFFICE.code ||
            loaded.name !== DEFAULT_MAIN_OFFICE.name ||
            Math.abs(loaded.lat - DEFAULT_MAIN_OFFICE.lat) > 0.0005 ||
            Math.abs(loaded.lon - DEFAULT_MAIN_OFFICE.lon) > 0.0005;
          applyUpdatedMainOffice(loaded, data.updatedAt ?? null, isCustom);
        }
      } catch {
        // Keep local fallback
      }
    })();
  }, [ensurePlacesCatalog, applyUpdatedMainOffice]);

  const applyUpdatedPlacesCatalog = useCallback(
    (nextCatalog: NearestPlacesCatalog, updatedAt?: string | null) => {
      placesCatalogRef.current = nextCatalog;
      setPlacesCatalog(nextCatalog);
      if (updatedAt) setPlacesUpdatedAt(updatedAt);

      // Live-refresh all located events' nearest places from the updated saved catalog
      setEvents((prev) =>
        prev.map((ev) => {
          if (isEventUnlocated(ev)) return ev;
          const prevCityName = ev.cities.find((c) => c.id === ev.selectedCityId)?.name ?? null;
          const prevTownName = ev.towns.find((t) => t.id === ev.selectedTownId)?.name ?? null;
          const prevGenName = ev.generators.find((g) => g.id === ev.selectedGeneratorId)?.name ?? null;
          const resolved = computeNearestPlacesForEpicenter(
            ev.lat,
            ev.lon,
            nextCatalog,
            {
              selectedCityName: prevCityName,
              cityCleared: ev.cities.length > 0 && !ev.selectedCityId,
              selectedTownName: prevTownName,
              townCleared: ev.towns.length > 0 && !ev.selectedTownId,
              selectedGeneratorName: prevGenName,
            },
            mainOfficeRef.current
          );
          return {
            ...ev,
            centralOfficeBearing: resolved.centralOfficeBearing,
            cities: resolved.cities,
            selectedCityId: resolved.selectedCityId,
            towns: resolved.towns,
            selectedTownId: resolved.selectedTownId,
            generators: resolved.generators,
            selectedGeneratorId: resolved.selectedGeneratorId,
          };
        })
      );
    },
    []
  );

  const handleSavePlacesItems = async (
    kind: PlacesDatasetKind,
    items: CityPlaceRecord[] | TownPlaceRecord[] | GeneratorTraceRecord[],
    message: string
  ) => {
    const res = await fetch('/api/places/catalog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, items }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      cities?: CityPlaceRecord[];
      towns?: TownPlaceRecord[];
      generators?: GeneratorTraceRecord[];
      updatedAt?: string;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.cities || !data.towns || !data.generators) {
      throw new Error(data.error || 'Failed to save places database.');
    }
    applyUpdatedPlacesCatalog(
      { cities: data.cities, towns: data.towns, generators: data.generators },
      data.updatedAt
    );
    showNotice(message);
  };

  const handleImportPlacesRawText = async (
    kind: PlacesDatasetKind,
    rawText: string,
    mode: 'merge' | 'replace',
    sourceName: string
  ) => {
    const res = await fetch('/api/places/catalog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, rawText, mode }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      cities?: CityPlaceRecord[];
      towns?: TownPlaceRecord[];
      generators?: GeneratorTraceRecord[];
      updatedAt?: string;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.cities || !data.towns || !data.generators) {
      throw new Error(data.error || `Failed to import ${sourceName}.`);
    }
    applyUpdatedPlacesCatalog(
      { cities: data.cities, towns: data.towns, generators: data.generators },
      data.updatedAt
    );
    showNotice(`Updated ${kind} catalog from ${sourceName}`);
  };

  const handleResetPlacesKind = async (kind: PlacesDatasetKind) => {
    const res = await fetch('/api/places/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      cities?: CityPlaceRecord[];
      towns?: TownPlaceRecord[];
      generators?: GeneratorTraceRecord[];
      updatedAt?: string;
      error?: string;
    };
    if (!res.ok || !data.ok || !data.cities || !data.towns || !data.generators) {
      showNotice(data.error || `Failed to reset ${kind}.`);
      return;
    }
    applyUpdatedPlacesCatalog(
      { cities: data.cities, towns: data.towns, generators: data.generators },
      data.updatedAt
    );
    showNotice(`Reset ${kind} catalog to original reference seed`);
  };

  const isValidGoogleMapsKey = (key: string | null | undefined): key is string =>
    Boolean(key && key.trim() && key.trim() !== 'MY_GOOGLE_MAPS_API_KEY');

  // Epicenter Map layer visibility controls & multi-provider basemap state
  const [mapsApiKey, setMapsApiKey] = useState<string>(() => {
    const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    return isValidGoogleMapsKey(envKey) ? envKey.trim() : '';
  });
  const [mapsConfigLoading, setMapsConfigLoading] = useState<boolean>(
    () => !isValidGoogleMapsKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
  );
  const savedBasemapPrefRef = useRef<BasemapProviderId | null>(loadSavedBasemapId());
  const [basemapId, setBasemapId] = useState<BasemapProviderId>(() =>
    resolveInitialBasemapId({
      hasGoogleKey: isValidGoogleMapsKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY),
      savedBasemapId: savedBasemapPrefRef.current,
    })
  );
  const [viewDimension, setViewDimension] = useState<'2d' | '3d'>('2d');
  const userPickedBasemapRef = useRef(false);
  const [googleMapsUnavailable, setGoogleMapsUnavailable] = useState(false);
  const [mapStyleMode, setMapStyleMode] = useState<GoogleMapStyleType>('terrain');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [sharedViewport, setSharedViewport] = useState<MapViewportState>(() =>
    createDefaultViewportForEvent(INITIAL_EVENTS[0])
  );
  const [mapShowFaults, setMapShowFaults] = useState(true);
  const [mapShowVolcanoes, setMapShowVolcanoes] = useState(true);
  const [mapShowPlates, setMapShowPlates] = useState(true);
  const [mapShowStations, setMapShowStations] = useState(true);
  const [mapRegionFilter, setMapRegionFilter] = useState<StationRegionFilter>('ALL');
  const [mapShowGrid, setMapShowGrid] = useState(true);
  const [mapShowShakeMap, setMapShowShakeMap] = useState(true);
  const [shakeMapOpacity, setShakeMapOpacity] = useState<number>(0.4);
  const [visibleShakeBands, setVisibleShakeBands] = useState<Record<PeisBandCode, boolean>>(
    () => createDefaultVisibleBands()
  );
  const [gmpeModel, setGmpeModel] = useState<GmpeSelectionMode>('auto');
  const [compareGmpeEnabled, setCompareGmpeEnabled] = useState(false);
  const [compareGmpeModel, setCompareGmpeModel] = useState<GmpeModelId>('boore-atkinson');
  const [shakeUseSiteAmp, setShakeUseSiteAmp] = useState(true);
  const [shakeAutoScale, setShakeAutoScale] = useState(true);
  const [shakeAutoHighlight, setShakeAutoHighlight] = useState(true);
  const [hoveredLegendBand, setHoveredLegendBand] = useState<PeisBandCode | null>(null);
  const [showIntensityMeterSidebar, setShowIntensityMeterSidebar] = useState(true);
  const [mapShowRangeRings, setMapShowRangeRings] = useState(true);
  const [mapShowNearestPlaces, setMapShowNearestPlaces] = useState(true);
  const [mapShowCatalogEvents, setMapShowCatalogEvents] = useState(false);
  const [mapRulerActive, setMapRulerActive] = useState(false);
  const [mapRulerPoints, setMapRulerPoints] = useState<{
    start: { lat: number; lon: number } | null;
    end: { lat: number; lon: number } | null;
  }>({ start: null, end: null });
  const handleMapRulerClick = useCallback((coords: { lat: number; lon: number }) => {
    setMapRulerPoints((prev) => {
      if (!prev.start || prev.end) {
        return { start: coords, end: null };
      }
      return { start: prev.start, end: coords };
    });
  }, []);
  const [showSeismicityTrendOverlay, setShowSeismicityTrendOverlay] = useState(false);
  const [historicalTrendEvents, setHistoricalTrendEvents] = useState<HistoricalEarthquakeRecord[]>([]);
  const [historicalTrendLoading, setHistoricalTrendLoading] = useState(false);
  const [historicalTrendError, setHistoricalTrendError] = useState<string | null>(null);
  const historicalTrendLoadedRef = useRef(false);
  const [geologyVisibility, setGeologyVisibility] = useState<GeologyLayerVisibility>(() => ({
    ...DEFAULT_GEOLOGY_LAYER_VISIBILITY,
  }));
  const [gisActiveFaultsData, setGisActiveFaultsData] = useState<ActiveFaultsDataset | null>(null);
  const [gisTrenchData, setGisTrenchData] = useState<TrenchSystemsDataset | null>(null);
  const [gisManifest, setGisManifest] = useState<GeologyManifest | null>(null);
  const [gisFaultsLoading, setGisFaultsLoading] = useState(false);
  const [gisTrenchesLoading, setGisTrenchesLoading] = useState(false);
  const [gisFaultsError, setGisFaultsError] = useState<string | null>(null);
  const [gisTrenchesError, setGisTrenchesError] = useState<string | null>(null);
  const [selectedGeologyFeature, setSelectedGeologyFeature] =
    useState<SelectedGeologyFeature | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const ensureGisManifestLoaded = useCallback(async () => {
    if (gisManifest) return;
    try {
      const m = await loadGeologyManifest();
      if (isMountedRef.current) setGisManifest(m);
    } catch {
      // Provenance manifest is supplementary metadata; keep fallback UI intact
    }
  }, [gisManifest]);

  const ensureGisFaultsLoaded = useCallback(async () => {
    if (gisActiveFaultsData) return;
    setGisFaultsLoading(true);
    setGisFaultsError(null);
    try {
      const data = await loadActiveFaultsDataset();
      if (isMountedRef.current) {
        setGisActiveFaultsData(data);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setGisFaultsError(
          err instanceof Error ? err.message : 'Unable to load active fault GIS data.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setGisFaultsLoading(false);
      }
    }
  }, [gisActiveFaultsData]);

  const ensureGisTrenchesLoaded = useCallback(async () => {
    if (gisTrenchData) return;
    setGisTrenchesLoading(true);
    setGisTrenchesError(null);
    try {
      const data = await loadTrenchSystemsDataset();
      if (isMountedRef.current) {
        setGisTrenchData(data);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setGisTrenchesError(
          err instanceof Error ? err.message : 'Unable to load trench GIS data.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setGisTrenchesLoading(false);
      }
    }
  }, [gisTrenchData]);

  const ensureHistoricalTrendCatalogLoaded = useCallback(async (force = false) => {
    if ((!force && historicalTrendLoadedRef.current) || historicalTrendLoading) return;
    setHistoricalTrendLoading(true);
    setHistoricalTrendError(null);
    try {
      const resp = await fetch('/api/research/historical-catalog');
      const data = (await resp.json()) as {
        ok?: boolean;
        events?: HistoricalEarthquakeRecord[];
        error?: string;
      };
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      if (isMountedRef.current) {
        setHistoricalTrendEvents(Array.isArray(data.events) ? data.events : []);
        historicalTrendLoadedRef.current = true;
      }
    } catch (err) {
      if (isMountedRef.current) {
        setHistoricalTrendError(
          err instanceof Error ? err.message : 'Unable to load historical seismicity catalog.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setHistoricalTrendLoading(false);
      }
    }
  }, [historicalTrendLoading]);

  useEffect(() => {
    if (activeSection === 'map') {
      void ensureHistoricalTrendCatalogLoaded();
    }
  }, [activeSection, ensureHistoricalTrendCatalogLoaded]);

  const handleToggleGeologyLayer = useCallback(
    (layer: keyof GeologyLayerVisibility) => {
      setGeologyVisibility((prev) => {
        const nextVal = !prev[layer];
        const next = { ...prev, [layer]: nextVal };
        if (nextVal) {
          void ensureGisManifestLoaded();
          if (layer === 'activeFaults' || layer === 'potentiallyActiveFaults') {
            void ensureGisFaultsLoaded();
          } else if (layer === 'trenches') {
            void ensureGisTrenchesLoaded();
          }
        } else {
          setSelectedGeologyFeature((curr) => {
            if (!curr) return null;
            if (layer === 'trenches' && curr.kind === 'trench') return null;
            if (
              layer === 'activeFaults' &&
              curr.kind === 'fault' &&
              curr.category === 'Active Fault'
            ) {
              return null;
            }
            if (
              layer === 'potentiallyActiveFaults' &&
              curr.kind === 'fault' &&
              curr.category === 'Potentially Active Fault'
            ) {
              return null;
            }
            return curr;
          });
        }
        return next;
      });
    },
    [ensureGisFaultsLoaded, ensureGisManifestLoaded, ensureGisTrenchesLoaded]
  );

  const [hoveredMapTool, setHoveredMapTool] = useState<MapToolPopoverId | null>(null);
  const [pinnedMapTool, setPinnedMapTool] = useState<MapToolPopoverId | null>(null);
  const mapToolCloseTimerRef = useRef<number | null>(null);

  const openMapToolHover = useCallback((id: MapToolPopoverId) => {
    if (mapToolCloseTimerRef.current !== null) {
      window.clearTimeout(mapToolCloseTimerRef.current);
      mapToolCloseTimerRef.current = null;
    }
    setHoveredMapTool(id);
  }, []);

  const scheduleMapToolClose = useCallback((id: MapToolPopoverId) => {
    if (mapToolCloseTimerRef.current !== null) {
      window.clearTimeout(mapToolCloseTimerRef.current);
    }
    mapToolCloseTimerRef.current = window.setTimeout(() => {
      setHoveredMapTool((curr) => (curr === id ? null : curr));
      mapToolCloseTimerRef.current = null;
    }, 150);
  }, []);

  const toggleMapToolPin = useCallback((id: MapToolPopoverId) => {
    if (mapToolCloseTimerRef.current !== null) {
      window.clearTimeout(mapToolCloseTimerRef.current);
      mapToolCloseTimerRef.current = null;
    }
    setPinnedMapTool((curr) => (curr === id ? null : id));
    setHoveredMapTool(null);
  }, []);

  const closeAllMapTools = useCallback(() => {
    if (mapToolCloseTimerRef.current !== null) {
      window.clearTimeout(mapToolCloseTimerRef.current);
      mapToolCloseTimerRef.current = null;
    }
    setPinnedMapTool(null);
    setHoveredMapTool(null);
  }, []);

  useEffect(() => {
    setMapRulerPoints({ start: null, end: null });
    setSelectedGeologyFeature(null);
    setToolbarPromptAction(null);
  }, [activeEventId]);

  useEffect(() => {
    setToolbarPromptAction(null);
  }, [activeSection, eqpTab]);

  useEffect(() => {
    if (!toolbarPromptAction) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePrompt =
        (newPromptRef.current && newPromptRef.current.contains(target)) ||
        (openPromptRef.current && openPromptRef.current.contains(target)) ||
        (printPromptRef.current && printPromptRef.current.contains(target));
      if (!insidePrompt) {
        setToolbarPromptAction(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setToolbarPromptAction(null);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toolbarPromptAction]);

  useEffect(() => {
    if (
      (pinnedMapTool === 'geometry' || hoveredMapTool === 'geometry') &&
      !gisActiveFaultsData &&
      !gisFaultsLoading &&
      !gisFaultsError
    ) {
      void ensureGisFaultsLoaded();
    }
  }, [
    pinnedMapTool,
    hoveredMapTool,
    gisActiveFaultsData,
    gisFaultsLoading,
    gisFaultsError,
    ensureGisFaultsLoaded,
  ]);

  useEffect(() => {
    closeAllMapTools();
  }, [eqpTab, activeSection, closeAllMapTools]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAllMapTools();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeAllMapTools]);

  useEffect(() => {
    const handleQuotaEvent = () => {
      setGmpQuotaExceeded(true);
      setGoogleMapsUnavailable(true);
      setBasemapId((prev) => (prev === 'google-maps' ? 'vector-schematic' : prev));
    };
    window.addEventListener('gmp-quota-exceeded', handleQuotaEvent);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaEvent);
  }, []);

  useEffect(() => {
    if (mapsApiKey) {
      setMapsConfigLoading(false);
      return;
    }
    let active = true;
    setMapsConfigLoading(true);
    fetch('/api/config/maps')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { apiKey?: string } | null) => {
        if (active && data?.apiKey && data.apiKey.trim() && data.apiKey.trim() !== 'MY_GOOGLE_MAPS_API_KEY') {
          const validKey = data.apiKey.trim();
          setMapsApiKey(validKey);
          const saved = savedBasemapPrefRef.current;
          if (
            !userPickedBasemapRef.current &&
            !googleMapsUnavailable &&
            (!saved || saved === 'google-maps')
          ) {
            setBasemapId('google-maps');
          }
        }
      })
      .catch(() => {
        // ignore config fetch errors
      })
      .finally(() => {
        if (active) setMapsConfigLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mapsApiKey, googleMapsUnavailable]);

  const activeEvent = useMemo(
    () => events.find((ev) => ev.id === activeEventId) ?? events[0],
    [events, activeEventId]
  );

  const isUnlocated = isEventUnlocated(activeEvent);

  const [showEpicenterTimeline, setShowEpicenterTimeline] = useState(false);
  const [timelineSourceFilter, setTimelineSourceFilter] =
    useState<TimelineSourceFilter>('all');
  const [timelineTrailMode, setTimelineTrailMode] =
    useState<TimelineTrailMode>('cumulative');
  const [timelineMinMag, setTimelineMinMag] = useState<number | null>(null);
  const [timelineShowMigration, setTimelineShowMigration] = useState(true);
  const [timelineViewportOnly, setTimelineViewportOnly] = useState(false);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState<TimelinePlaybackSpeed>(1);
  const [timelineLoop, setTimelineLoop] = useState(true);
  const [timelinePlayheadMs, setTimelinePlayheadMs] = useState<number>(0);
  const timelinePlayheadRef = useRef<number>(timelinePlayheadMs);
  timelinePlayheadRef.current = timelinePlayheadMs;
  const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);
  const [isFetchingTimelineUsgs, setIsFetchingTimelineUsgs] = useState(false);

  const timelineViewportBounds = useMemo(() => {
    if (!timelineViewportOnly) return null;
    return computeViewportGeoBounds(sharedViewport, basemapId);
  }, [timelineViewportOnly, sharedViewport, basemapId]);

  const timelineCatalog = useMemo(
    () =>
      buildTimelineCatalog({
        workspaceEvents: events,
        historicalEvents: historicalTrendEvents,
        sourceFilter: timelineSourceFilter,
        minMagnitude: timelineMinMag,
        viewportBounds: timelineViewportBounds,
      }),
    [
      events,
      historicalTrendEvents,
      timelineSourceFilter,
      timelineMinMag,
      timelineViewportBounds,
    ]
  );

  const timelineBounds = useMemo(
    () => computeTimelineWindowBounds(timelineCatalog),
    [timelineCatalog]
  );

  const prevTimelineSpanKeyRef = useRef<string>('');
  useEffect(() => {
    if (!timelineBounds) {
      prevTimelineSpanKeyRef.current = '';
      setTimelinePlaying(false);
      return;
    }
    const nextKey = `${timelineBounds.minMs}:${timelineBounds.maxMs}:${timelineCatalog.length}`;
    if (!prevTimelineSpanKeyRef.current) {
      prevTimelineSpanKeyRef.current = nextKey;
      timelinePlayheadRef.current = timelineBounds.maxMs;
      setTimelinePlayheadMs(timelineBounds.maxMs);
      return;
    }
    setTimelinePlayheadMs((prev) => {
      if (!Number.isFinite(prev) || prev < timelineBounds.minMs || prev > timelineBounds.maxMs) {
        timelinePlayheadRef.current = timelineBounds.maxMs;
        return timelineBounds.maxMs;
      }
      return prev;
    });
    prevTimelineSpanKeyRef.current = nextKey;
  }, [timelineBounds, timelineCatalog.length]);

  useEffect(() => {
    if (!showEpicenterTimeline || !timelinePlaying || !timelineBounds) return;
    if (timelineBounds.spanMs <= 1000 && timelineCatalog.length <= 1) {
      setTimelinePlaying(false);
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    const baseSweepMs = 14_000;

    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(100, now - lastTs));
      lastTs = now;
      const advanceRatio = (dt / baseSweepMs) * timelineSpeed;
      const deltaCatalogMs = timelineBounds.spanMs * advanceRatio;

      const base =
        timelinePlayheadRef.current < timelineBounds.minMs
          ? timelineBounds.minMs
          : timelinePlayheadRef.current;
      const next = base + deltaCatalogMs;

      if (next >= timelineBounds.maxMs) {
        if (timelineLoop) {
          timelinePlayheadRef.current = timelineBounds.minMs;
          setTimelinePlayheadMs(timelineBounds.minMs);
        } else {
          timelinePlayheadRef.current = timelineBounds.maxMs;
          setTimelinePlayheadMs(timelineBounds.maxMs);
          setTimelinePlaying(false);
          return;
        }
      } else {
        timelinePlayheadRef.current = next;
        setTimelinePlayheadMs(next);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [
    showEpicenterTimeline,
    timelinePlaying,
    timelineBounds,
    timelineSpeed,
    timelineLoop,
    timelineCatalog.length,
  ]);

  const visibleTimelineEvents = useMemo(() => {
    if (!showEpicenterTimeline || !timelineBounds) return [];
    const effectivePlayhead =
      timelinePlayheadMs > 0
        ? Math.max(timelineBounds.minMs, Math.min(timelineBounds.maxMs, timelinePlayheadMs))
        : timelineBounds.maxMs;
    return computeVisibleTimelineEvents(
      timelineCatalog,
      effectivePlayhead,
      timelineTrailMode,
      timelineBounds.spanMs
    );
  }, [
    showEpicenterTimeline,
    timelineBounds,
    timelinePlayheadMs,
    timelineCatalog,
    timelineTrailMode,
  ]);

  const timelineWorkspaceCount = useMemo(
    () => timelineCatalog.filter((pt) => pt.sourceKind === 'workspace').length,
    [timelineCatalog]
  );

  const handleToggleTimelinePlay = useCallback(() => {
    if (!timelineBounds) return;
    setTimelinePlaying((prev) => {
      if (!prev) {
        const curr = timelinePlayheadRef.current;
        if (!Number.isFinite(curr) || curr >= timelineBounds.maxMs - 10) {
          timelinePlayheadRef.current = timelineBounds.minMs;
          setTimelinePlayheadMs(timelineBounds.minMs);
        }
      }
      return !prev;
    });
  }, [timelineBounds]);

  const handleFetchTimelineUsgs = useCallback(async () => {
    if (isFetchingTimelineUsgs) return;
    setIsFetchingTimelineUsgs(true);
    setHistoricalTrendError(null);
    try {
      const centerLat = isUnlocated ? DEFAULT_PH_CENTER.lat : activeEvent.lat;
      const centerLon = isUnlocated ? DEFAULT_PH_CENTER.lon : activeEvent.lon;
      const resp = await fetch('/api/research/historical-catalog/usgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: centerLat,
          lon: centerLon,
          maxradiuskm: 300,
          minmagnitude: 3.5,
          starttime: '2010-01-01',
          limit: 250,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        events?: HistoricalEarthquakeRecord[];
        addedCount?: number;
        parsedCount?: number;
        error?: string;
      };
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || `USGS fetch failed (HTTP ${resp.status})`);
      }
      if (isMountedRef.current) {
        const nextEvents = Array.isArray(data.events) ? data.events : [];
        setHistoricalTrendEvents(nextEvents);
        historicalTrendLoadedRef.current = true;
        showNotice(
          `Fetched ${data.parsedCount ?? nextEvents.length} regional USGS earthquakes (${data.addedCount ?? 0} new added to historical catalog).`
        );
      }
    } catch (err) {
      if (isMountedRef.current) {
        setHistoricalTrendError(
          err instanceof Error ? err.message : 'Unable to fetch USGS regional earthquakes.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsFetchingTimelineUsgs(false);
      }
    }
  }, [isFetchingTimelineUsgs, isUnlocated, activeEvent]);

  const prevViewportEventKeyRef = useRef<string>(
    `${activeEvent.id}:${activeEvent.lat}:${activeEvent.lon}:${isUnlocated ? 'u' : 'l'}`
  );
  useEffect(() => {
    const key = `${activeEvent.id}:${activeEvent.lat}:${activeEvent.lon}:${isUnlocated ? 'u' : 'l'}`;
    if (prevViewportEventKeyRef.current !== key) {
      prevViewportEventKeyRef.current = key;
      setSharedViewport(createDefaultViewportForEvent(activeEvent));
    }
  }, [activeEvent, isUnlocated]);

  const handleSelectBasemap = useCallback(
    (nextId: BasemapProviderId) => {
      const meta = getBasemapMeta(nextId);
      if (!meta.available) {
        showNotice(meta.unavailableReason || `${meta.label} is not installed.`);
        return;
      }
      if (nextId === 'google-maps') {
        if (!mapsApiKey && !mapsConfigLoading) {
          showNotice(
            'Google Maps API key is not configured — choose an OpenFreeMap or Vector basemap.'
          );
          return;
        }
        if (googleMapsUnavailable) {
          showNotice(
            'Google Maps could not initialize or exceeded quota — keeping current basemap.'
          );
          return;
        }
      }
      userPickedBasemapRef.current = true;
      setBasemapId(nextId);
      saveSelectedBasemapId(nextId);
      setViewDimension('2d');
    },
    [mapsApiKey, mapsConfigLoading, googleMapsUnavailable]
  );

  // Active magnitude display, multi-method evaluation metadata, and freshness inspection
  const activeEventMagnitudeMetadata = useMemo<EventMagnitudeMetadata>(() => {
    if (activeEvent.magnitudeMetadata) {
      return activeEvent.magnitudeMetadata;
    }
    if (activeEvent.historicalMagnitudeBaseline) {
      return buildHistoricalSavedMagnitudeMetadata({ event: activeEvent });
    }
    return evaluateEventMagnitudes({
      event: activeEvent,
      settings: magnitudeSettings,
      stations,
    });
  }, [activeEvent, magnitudeSettings, stations]);

  const activeAmplitudeValidation = useMemo(
    () => validateEventAmplitudeMeasurements(activeEvent),
    [activeEvent]
  );

  const amplitudeModalPick = useMemo(
    () =>
      amplitudeModalPickId
        ? activeEvent.picks.find((p) => p.id === amplitudeModalPickId) ?? null
        : null,
    [activeEvent.picks, amplitudeModalPickId]
  );

  const activeMagnitudeFreshness = useMemo(
    () =>
      inspectMagnitudeFreshness(
        activeEvent,
        activeEvent.magnitudeMetadata ??
          (activeEvent.historicalMagnitudeBaseline
            ? activeEventMagnitudeMetadata
            : undefined),
        magnitudeSettings,
        stations
      ),
    [activeEvent, activeEventMagnitudeMetadata, magnitudeSettings, stations]
  );

  const activeMagnitudeValue = useMemo<number | null>(() => {
    if (
      !isPreferredMethodSelected(activeEventMagnitudeMetadata, magnitudeSettings) ||
      (activeEventMagnitudeMetadata.originState === 'computed_current' &&
        activeEventMagnitudeMetadata.selectedStatus !== 'valid')
    ) {
      return null;
    }
    if (activeEventMagnitudeMetadata.preferredMethodId !== 'eqp-legacy-ms') {
      return activeEventMagnitudeMetadata.selectedMagnitude;
    }
    if (activeEvent.preferredScale === 'Ms') return activeEvent.ms;
    if (activeEvent.preferredScale === 'Mb') return activeEvent.mb;
    return activeEvent.md;
  }, [activeEvent, activeEventMagnitudeMetadata, magnitudeSettings]);

  const resolvedSaveTarget = useMemo(
    () =>
      buildEqpSaveTarget(activeEvent, solutionDrive, {
        freshness: activeMagnitudeFreshness,
      }),
    [activeEvent, solutionDrive, activeMagnitudeFreshness]
  );

  const resolvedBulletinTarget = useMemo(
    () => buildBulletinSaveTarget(activeEvent, solutionDrive),
    [activeEvent, solutionDrive]
  );

  const resolvedPrimerTarget = useMemo(
    () => buildPrimerSaveTarget(activeEvent, solutionDrive),
    [activeEvent, solutionDrive]
  );

  const refreshSavedEqpFiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/eqp/files');
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        files?: SavedEqpFileItem[];
        folders?: SavedEqpFolderItem[];
      };
      if (Array.isArray(data.files)) {
        setSavedEqpFiles(data.files);
      }
      if (Array.isArray(data.folders)) {
        setSavedEqpFolders(data.folders);
      }
    } catch {
      // ignore listing fetch errors
    }
  }, []);

  const refreshSavedBulletinFiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/bulletin/files');
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        files?: SavedEqpFileItem[];
        folders?: SavedEqpFolderItem[];
      };
      if (Array.isArray(data.files)) {
        setSavedBulletinFiles(data.files);
      }
      if (Array.isArray(data.folders)) {
        setSavedBulletinFolders(data.folders);
      }
    } catch {
      // ignore bulletin listing fetch errors
    }
  }, []);

  const refreshSavedPrimerFiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/primer/files');
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        files?: SavedEqpFileItem[];
        folders?: SavedEqpFolderItem[];
      };
      if (Array.isArray(data.files)) {
        setSavedPrimerFiles(data.files);
      }
      if (Array.isArray(data.folders)) {
        setSavedPrimerFolders(data.folders);
      }
    } catch {
      // ignore primer listing fetch errors
    }
  }, []);

  const refreshEqpHistory = useCallback(async () => {
    setIsSyncingHistory(true);
    try {
      const resp = await fetch('/api/eqp/history', { cache: 'no-store' });
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        ok?: boolean;
        entries?: EqpHistoryEntry[];
      };
      if (data.ok && Array.isArray(data.entries)) {
        setEqpHistory(data.entries);
      }
    } catch {
      // ignore history sync errors
    } finally {
      setIsSyncingHistory(false);
    }
  }, []);

  const postEqpHistoryCheckpoint = useCallback(
    async (
      eventSnapshot: EQPEvent,
      trigger: EqpHistoryTrigger,
      versionTag?: string,
      note?: string
    ) => {
      try {
        const resp = await fetch('/api/eqp/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: eventSnapshot,
            trigger,
            versionTag,
            note,
          }),
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as {
          ok?: boolean;
          entries?: EqpHistoryEntry[];
        };
        if (data.ok && Array.isArray(data.entries)) {
          setEqpHistory(data.entries);
        }
      } catch {
        // non-fatal history checkpoint error
      }
    },
    []
  );

  useEffect(() => {
    void refreshSavedEqpFiles();
    void refreshSavedBulletinFiles();
    void refreshSavedPrimerFiles();
    void refreshEqpHistory();
  }, [refreshSavedEqpFiles, refreshSavedBulletinFiles, refreshSavedPrimerFiles, refreshEqpHistory]);

  const stationMetaMapForFilter = useMemo(() => {
    const map: Record<string, StationMeta> = {};
    for (const st of stations) {
      map[st.code] = st;
    }
    return map;
  }, [stations]);

  const regionFilteredPicksCount = useMemo(
    () =>
      activeEvent.picks.filter((p) =>
        stationPickMatchesRegion(p, mapRegionFilter, stationMetaMapForFilter)
      ).length,
    [activeEvent.picks, mapRegionFilter, stationMetaMapForFilter]
  );

  const regionFilteredStationsCount = useMemo(
    () => stations.filter((st) => stationMetaMatchesRegion(st, mapRegionFilter)).length,
    [stations, mapRegionFilter]
  );

  const autoSelectedGmpe = useMemo(() => {
    const { mag } = getEffectiveEventMagnitude(activeEvent);
    return selectOptimalGmpeModel(mag, activeEvent.depthKm);
  }, [activeEvent]);

  const shakeMapData = useMemo(
    () =>
      generateShakeMapContours(activeEvent, gmpeModel, shakeUseSiteAmp, shakeAutoScale),
    [activeEvent, gmpeModel, shakeUseSiteAmp, shakeAutoScale]
  );

  const filteredShakeMapData = useMemo(
    () => ({
      ...shakeMapData,
      contours: shakeMapData.contours.filter(
        (c) => visibleShakeBands[c.band.roman] !== false
      ),
    }),
    [shakeMapData, visibleShakeBands]
  );

  const shakeMapStats = useMemo(
    () =>
      computeShakeMapStatistics(shakeMapData, visibleShakeBands, mapShowShakeMap),
    [shakeMapData, visibleShakeBands, mapShowShakeMap]
  );

  const compareShakeMapData = useMemo(
    () =>
      compareGmpeEnabled
        ? generateShakeMapContours(
            activeEvent,
            compareGmpeModel,
            shakeUseSiteAmp,
            shakeAutoScale
          )
        : null,
    [
      compareGmpeEnabled,
      activeEvent,
      compareGmpeModel,
      shakeUseSiteAmp,
      shakeAutoScale,
    ]
  );

  const compareShakeMapStats = useMemo(
    () =>
      compareGmpeEnabled && compareShakeMapData
        ? computeShakeMapStatistics(
            compareShakeMapData,
            visibleShakeBands,
            mapShowShakeMap
          )
        : null,
    [
      compareGmpeEnabled,
      compareShakeMapData,
      visibleShakeBands,
      mapShowShakeMap,
    ]
  );

  const handleToggleCompareGmpe = (enabled: boolean) => {
    setCompareGmpeEnabled(enabled);
    if (enabled) {
      if (!mapShowShakeMap) setMapShowShakeMap(true);
      if (compareGmpeModel === shakeMapData.gmpeId) {
        const fallback =
          GMPE_MODELS.find((m) => m.id !== shakeMapData.gmpeId)?.id ??
          'boore-atkinson';
        setCompareGmpeModel(fallback);
      }
    }
  };

  const handleToggleShakeBand = (code: PeisBandCode) => {
    setVisibleShakeBands((prev) => {
      const nextVal = !prev[code];
      if (nextVal && !mapShowShakeMap) {
        setMapShowShakeMap(true);
      }
      return { ...prev, [code]: nextVal };
    });
  };

  const handleApplyShakePreset = (minLevel: number | 'all' | 'none') => {
    if (minLevel === 'none') {
      setVisibleShakeBands({
        I: false,
        II: false,
        III: false,
        IV: false,
        V: false,
        VI: false,
        VII: false,
        VIII: false,
        IX: false,
        X: false,
      });
      return;
    }
    if (minLevel === 'all') {
      setVisibleShakeBands(createDefaultVisibleBands());
      if (!mapShowShakeMap) setMapShowShakeMap(true);
      return;
    }
    const next = createDefaultVisibleBands();
    for (const band of SHAKEMAP_BANDS) {
      next[band.roman] = band.level >= minLevel;
    }
    setVisibleShakeBands(next);
    if (!mapShowShakeMap) setMapShowShakeMap(true);
  };

  const handleExportShakeMapGeoJson = () => {
    if (filteredShakeMapData.contours.length === 0) {
      setFeedbackNotice('No visible ShakeMap contours to export. Enable at least one intensity band.');
      return;
    }
    const geojson = shakeMapToGeoJson(
      filteredShakeMapData,
      activeEvent,
      Math.max(0, Math.min(0.85, shakeMapOpacity * 0.7))
    );
    const blob = new Blob([geojson], { type: 'application/geo+json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shakemap-${activeEvent.id}-${filteredShakeMapData.gmpeId}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFeedbackNotice(
      `Exported ${filteredShakeMapData.contours.length} ShakeMap contour polygon${
        filteredShakeMapData.contours.length === 1 ? '' : 's'
      } as GeoJSON.`
    );
  };

  const isDirty = Boolean(dirtyIds[activeEvent.id]);
  const hasDraftPickEdits = Boolean(
    draftPick.sta.trim() ||
    draftPick.pTime.trim() ||
    draftPick.sTime.trim() ||
    draftPick.duration.trim() ||
    draftPick.amplitude.trim()
  );
  const isCurrentEventEdited = isDirty || hasDraftPickEdits;
  const isCurrentEventSaved =
    !isCurrentEventEdited && Boolean(savedSnapshotsById[activeEvent.id]);

  const isBulletinTab =
    activeSection === 'bulletin' && eqpTab === 'bulletin';
  const isBulletinEdited = Boolean(bulletinDirtyIds[activeEvent.id]);
  const isBulletinSaved =
    !isBulletinEdited &&
    (Boolean(openedBulletin) ||
      Boolean(savedBulletinTargetsById[activeEvent.id]) ||
      savedBulletinFiles.some(
        (f) => f.filename.toLowerCase() === resolvedBulletinTarget.filename.toLowerCase()
      ));
  const displayedBulletinFilename =
    openedBulletin?.filename ??
    savedBulletinTargetsById[activeEvent.id]?.filename ??
    resolvedBulletinTarget.filename;
  const displayedBulletinPath =
    openedBulletin?.displayPath ??
    savedBulletinTargetsById[activeEvent.id]?.fullPath ??
    resolvedBulletinTarget.fullPath;

  const isPrimerTab =
    activeSection === 'primer' && eqpTab === 'primer';
  const activePrimerId = primerPanelStatus.primerId;
  const isPrimerSavedOnDisk = Boolean(
    activePrimerId &&
      (Boolean(savedPrimerTargetsById[activePrimerId]) ||
        savedPrimerFiles.some(
          (f) => f.filename.toLowerCase() === resolvedPrimerTarget.filename.toLowerCase()
        ))
  );
  const isPrimerEdited = Boolean(
    primerPanelStatus.hasPrimer &&
      (primerPanelStatus.hasUnsavedEdits ||
        (!primerPanelStatus.isSavedToStorage && !isPrimerSavedOnDisk))
  );
  const isPrimerSaved = Boolean(
    primerPanelStatus.hasPrimer &&
      !isPrimerEdited &&
      (primerPanelStatus.isSavedToStorage || isPrimerSavedOnDisk)
  );
  const displayedPrimerFilename =
    (activePrimerId ? savedPrimerTargetsById[activePrimerId]?.filename : undefined) ??
    resolvedPrimerTarget.filename;

  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    window.setTimeout(() => {
      setFeedbackNotice((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const activeEventIdRef = useRef<string>(activeEvent.id);
  activeEventIdRef.current = activeEvent.id;

  const stationPanelRef = useRef<HTMLDivElement | null>(null);
  const [atlasStatusNotice, setAtlasStatusNotice] = useState<string | null>(null);
  const [isPlotLocating, setIsPlotLocating] = useState(false);
  const isPlotLocatingRef = useRef(false);
  const [locatedSnapshotChecksums, setLocatedSnapshotChecksums] = useState<
    Record<string, string>
  >({});
  const [lastPlotWarningsByEvent, setLastPlotWarningsByEvent] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    setCandidateSolution((curr) => (curr && curr.eventId === activeEvent.id ? curr : null));
    setMapComparisonMarkers([]);
    setAtlasStatusNotice(null);
    setOpenedBulletin(null);
  }, [activeEvent.id]);

  const resolvedStationOverrides = useMemo(
    () => buildStationMetadataOverridesForPicks(activeEvent.picks, stations),
    [activeEvent.picks, stations]
  );

  const isCandidateStale = useMemo(
    () =>
      isCandidateSolutionStale(
        candidateSolution,
        activeEvent,
        stations,
        eventRevisions[activeEvent.id] ?? 0,
        resolvedStationOverrides
      ),
    [candidateSolution, activeEvent, stations, eventRevisions, resolvedStationOverrides]
  );

  // Baseline checksum for located events so edits to picks/origin/depth flag results stale
  useEffect(() => {
    if (isUnlocated) return;
    if (dirtyIds[activeEvent.id]) return;
    if (activeEvent.locationMetadata) return;
    const snap = computeObservationSnapshotChecksum(
      activeEvent,
      stations,
      resolvedStationOverrides
    );
    setLocatedSnapshotChecksums((prev) =>
      prev[activeEvent.id] === snap ? prev : { ...prev, [activeEvent.id]: snap }
    );
  }, [isUnlocated, dirtyIds, activeEvent, stations, resolvedStationOverrides]);

  const isPlotResultStale = useMemo(() => {
    if (isUnlocated) return false;
    const baseline = locatedSnapshotChecksums[activeEvent.id];
    if (!baseline) return false;
    const current = computeObservationSnapshotChecksum(
      activeEvent,
      stations,
      resolvedStationOverrides
    );
    return current !== baseline;
  }, [isUnlocated, locatedSnapshotChecksums, activeEvent, stations, resolvedStationOverrides]);

  const eventsRef = useRef<EQPEvent[]>(events);
  eventsRef.current = events;

  const [undoStacksByEventId, setUndoStacksByEventId] = useState<
    Record<string, EventUndoEntry[]>
  >({});
  const undoStacksRef = useRef<Record<string, EventUndoEntry[]>>(undoStacksByEventId);
  undoStacksRef.current = undoStacksByEventId;

  const activeUndoStack = undoStacksByEventId[activeEvent.id] ?? [];
  const nextUndoEntry =
    activeUndoStack.length > 0 ? activeUndoStack[activeUndoStack.length - 1] : null;

  const clearEventUndoStack = useCallback((targetId: string) => {
    if (!undoStacksRef.current[targetId]?.length) return;
    const nextMap = { ...undoStacksRef.current };
    delete nextMap[targetId];
    undoStacksRef.current = nextMap;
    setUndoStacksByEventId(nextMap);
  }, []);

  const applyTargetEventUpdate = (
    targetId: string,
    computeNext: (ev: EQPEvent) => EQPEvent,
    options?: {
      markDirty?: boolean;
      bumpRevision?: boolean;
      undo?: PushUndoOptions | false;
    }
  ): EQPEvent | null => {
    const currList = eventsRef.current;
    const currentEvent = currList.find((ev) => ev.id === targetId);
    if (!currentEvent) return null;

    const nextEvent = computeNext(currentEvent);
    const nextList = currList.map((ev) => (ev.id === targetId ? nextEvent : ev));
    eventsRef.current = nextList;
    setEvents(nextList);

    if (options?.bumpRevision !== false) {
      setEventRevisions((prev) => ({
        ...prev,
        [targetId]: (prev[targetId] ?? 0) + 1,
      }));
    }
    if (options?.markDirty !== false) {
      setDirtyIds((prev) => ({ ...prev, [targetId]: true }));
    }
    if (options?.undo !== false) {
      const currentStack = undoStacksRef.current[targetId] ?? [];
      const nextStack = pushEventUndoEntry(
        currentStack,
        currentEvent,
        nextEvent,
        options?.undo
      );
      if (nextStack !== currentStack) {
        const nextMap = { ...undoStacksRef.current, [targetId]: nextStack };
        undoStacksRef.current = nextMap;
        setUndoStacksByEventId(nextMap);
      }
    }
    return nextEvent;
  };

  const updateActiveEvent = (
    updater: (ev: EQPEvent) => EQPEvent,
    markDirty = true,
    undo?: PushUndoOptions | false
  ) => {
    applyTargetEventUpdate(activeEventIdRef.current, updater, {
      markDirty,
      undo,
    });
  };

  const handleUndoLastChange = useCallback(() => {
    const targetId = activeEventIdRef.current;
    const currentEvent = eventsRef.current.find((ev) => ev.id === targetId);
    const currentStack = undoStacksRef.current[targetId] ?? [];
    if (!currentEvent || currentStack.length === 0) {
      showNotice('Nothing to undo for event picks or origin parameters.');
      return;
    }

    const popped = popEventUndoEntry(currentStack, currentEvent);
    if (!popped) return;

    const { restoredEvent, undoneEntry, remainingStack } = popped;
    const nextList = eventsRef.current.map((ev) =>
      ev.id === targetId ? restoredEvent : ev
    );
    eventsRef.current = nextList;
    setEvents(nextList);

    const nextMap = { ...undoStacksRef.current, [targetId]: remainingStack };
    undoStacksRef.current = nextMap;
    setUndoStacksByEventId(nextMap);

    setEventRevisions((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] ?? 0) + 1,
    }));
    setDirtyIds((prev) => ({ ...prev, [targetId]: true }));
    setCandidateSolution((curr) => (curr && curr.eventId === targetId ? null : curr));
    setAmplitudeDrafts({});

    if (restoredEvent.locationMetadata?.inputChecksum) {
      setLocatedSnapshotChecksums((prev) => ({
        ...prev,
        [targetId]: restoredEvent.locationMetadata!.inputChecksum!,
      }));
    } else {
      setLocatedSnapshotChecksums((prev) => {
        if (!(targetId in prev)) return prev;
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
    }

    setSelectedStation((prevSta) => {
      if (!prevSta) return null;
      return restoredEvent.picks.some((p) => p.sta === prevSta) ? prevSta : null;
    });

    const remaining = remainingStack.length;
    showNotice(
      `Undid: ${undoneEntry.label}${
        remaining > 0
          ? ` (${remaining} undo step${remaining === 1 ? '' : 's'} remaining)`
          : ''
      }`
    );
  }, []);

  useEffect(() => {
    const handleUndoShortcut = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'z') return;

      const target = e.target as HTMLElement | null;
      if (target) {
        if (target instanceof HTMLTextAreaElement || target.isContentEditable) {
          return;
        }
        if (
          target instanceof HTMLInputElement &&
          target.type !== 'checkbox' &&
          target.type !== 'radio'
        ) {
          return;
        }
      }

      if ((undoStacksRef.current[activeEventIdRef.current] ?? []).length === 0) {
        return;
      }
      e.preventDefault();
      handleUndoLastChange();
    };

    window.addEventListener('keydown', handleUndoShortcut);
    return () => window.removeEventListener('keydown', handleUndoShortcut);
  }, [handleUndoLastChange]);

  // Phase summary counts (STA, P used/total, S used/total)
  const phaseStats = useMemo(() => {
    const totalStations = activeEvent.picks.length;
    const pPicks = activeEvent.picks.filter((p) => p.pTime.trim() !== '');
    const pUsed = pPicks.filter((p) => !p.pExcluded).length;
    const sPicks = activeEvent.picks.filter((p) => p.sTime.trim() !== '');
    const sUsed = sPicks.filter((p) => !p.sExcluded).length;
    return {
      totalStations,
      pTotal: pPicks.length,
      pUsed,
      sTotal: sPicks.length,
      sUsed,
    };
  }, [activeEvent.picks]);

  const cyclePickTableSort = (key: PickTableSortKey) => {
    setPickTableSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const cycleResidualsTableSort = (key: ResidualsTableSortKey) => {
    setResidualsTableSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const parsePhaseSortValue = useCallback(
    (rawTime: string): number | null => {
      const trimmed = rawTime.trim();
      if (!trimmed) return null;
      const dotIdx = trimmed.indexOf('.');
      const intPart = dotIdx === -1 ? trimmed : trimmed.slice(0, dotIdx);
      const decPart = dotIdx === -1 ? '' : trimmed.slice(dotIdx + 1);
      if (intPart.length === 4) {
        let mm = Number(intPart.slice(0, 2));
        const ss = Number(`${intPart.slice(2)}${decPart ? `.${decPart}` : ''}`);
        const originParts = activeEvent.originTimeGmt.split(':');
        const originMin = Number(originParts[1] ?? 0);
        const originSec = Number(originParts[2] ?? 0);
        if (
          Number.isFinite(mm) &&
          Number.isFinite(ss) &&
          ss >= 0 &&
          ss < 60 &&
          Number.isFinite(originMin) &&
          Number.isFinite(originSec)
        ) {
          if (mm < originMin - 30) mm += 60;
          else if (mm > originMin + 30) mm -= 60;
          return mm * 60 + ss - (originMin * 60 + originSec);
        }
      }
      const numeric = Number.parseFloat(trimmed);
      return Number.isFinite(numeric) ? numeric : null;
    },
    [activeEvent.originTimeGmt]
  );

  const sortedStationPicks = useMemo(() => {
    if (!pickTableSort) return activeEvent.picks;
    const { key, dir } = pickTableSort;
    const sign = dir === 'asc' ? 1 : -1;

    return activeEvent.picks
      .map((pick, index) => ({ pick, index }))
      .sort((a, b) => {
        const pa = a.pick;
        const pb = b.pick;
        let cmp = 0;

        if (key === 'sta') {
          const sa = pa.sta.trim();
          const sb = pb.sta.trim();
          if (!sa && !sb) cmp = 0;
          else if (!sa) return 1;
          else if (!sb) return -1;
          else cmp = sa.localeCompare(sb) * sign;
        } else if (key === 'pTime' || key === 'sTime') {
          const rawA = key === 'pTime' ? pa.pTime.trim() : pa.sTime.trim();
          const rawB = key === 'pTime' ? pb.pTime.trim() : pb.sTime.trim();
          if (!rawA && !rawB) cmp = 0;
          else if (!rawA) return 1;
          else if (!rawB) return -1;
          else {
            const numA = parsePhaseSortValue(rawA);
            const numB = parsePhaseSortValue(rawB);
            if (numA !== null && numB !== null && numA !== numB) {
              cmp = (numA - numB) * sign;
            } else {
              cmp = rawA.localeCompare(rawB) * sign;
            }
          }
        } else if (key === 'duration') {
          const da = pa.duration;
          const db = pb.duration;
          if (da === null && db === null) cmp = 0;
          else if (da === null) return 1;
          else if (db === null) return -1;
          else cmp = (da - db) * sign;
        } else if (key === 'amplitude') {
          const aa = pa.amplitude ?? null;
          const ab = pb.amplitude ?? null;
          if (aa === null && ab === null) cmp = 0;
          else if (aa === null) return 1;
          else if (ab === null) return -1;
          else cmp = (aa - ab) * sign;
        } else if (key === 'polarity') {
          const pola = pa.polarity;
          const polb = pb.polarity;
          if (!pola && !polb) cmp = 0;
          else if (!pola) return 1;
          else if (!polb) return -1;
          else cmp = (POLARITY_SORT_RANK[pola] - POLARITY_SORT_RANK[polb]) * sign;
        } else if (key === 'quality') {
          const qa = QUALITY_SORT_RANK[pa.quality ?? 'B'];
          const qb = QUALITY_SORT_RANK[pb.quality ?? 'B'];
          cmp = (qa - qb) * sign;
        }

        return cmp !== 0 ? cmp : a.index - b.index;
      })
      .map((entry) => entry.pick);
  }, [activeEvent.picks, pickTableSort, parsePhaseSortValue]);

  const sortedResidualPicks = useMemo(() => {
    const activePicks = activeEvent.picks.filter((pick) => !pick.pExcluded);
    if (!residualsTableSort) return activePicks;
    const { key, dir } = residualsTableSort;
    const sign = dir === 'asc' ? 1 : -1;

    return activePicks
      .map((pick, index) => ({ pick, index }))
      .sort((a, b) => {
        const pa = a.pick;
        const pb = b.pick;
        let cmp = 0;
        if (key === 'sta') {
          cmp = pa.sta.localeCompare(pb.sta) * sign;
        } else {
          const va = pa[key];
          const vb = pb[key];
          cmp = (va - vb) * sign;
        }
        return cmp !== 0 ? cmp : a.index - b.index;
      })
      .map((entry) => entry.pick);
  }, [activeEvent.picks, residualsTableSort]);

  // Selected geographic labels
  const selectedCity =
    activeEvent.cities.find((c) => c.id === activeEvent.selectedCityId) ?? null;
  const selectedTown =
    activeEvent.towns.find((t) => t.id === activeEvent.selectedTownId) ?? null;
  const selectedGenerator =
    activeEvent.generators.find((g) => g.id === activeEvent.selectedGeneratorId) ?? null;

  const primaryLocationLabel = useMemo(() => {
    if (activeEvent.primaryHeadline === 'city' && selectedCity) return selectedCity.label;
    if (activeEvent.primaryHeadline === 'town' && selectedTown) return selectedTown.label;
    return selectedCity?.label ?? selectedTown?.label ?? 'Location pending';
  }, [activeEvent.primaryHeadline, selectedCity, selectedTown]);

  // Spatial QA & Tectonic Proximity for Map & Tsunami tabs
  const azimuthalGapStats = useMemo(
    () =>
      isUnlocated
        ? null
        : computeAzimuthalGap(activeEvent.picks, activeEvent.lat, activeEvent.lon),
    [activeEvent.picks, activeEvent.lat, activeEvent.lon, isUnlocated]
  );

  const activeLocationQuality = useMemo(
    () => computeEventLocationQuality(activeEvent),
    [activeEvent]
  );

  const nearestFaults = useMemo(
    () =>
      isUnlocated
        ? []
        : computeNearestFaultDistances(activeEvent.lat, activeEvent.lon, 6),
    [activeEvent.lat, activeEvent.lon, isUnlocated]
  );

  const tsunamiScreening = useMemo(
    () => evaluateTsunamiScreening(activeEvent),
    [activeEvent]
  );

  const tsunamiTrenchProximities = useMemo(() => {
    if (isUnlocated) {
      return FAULT_TRACES.filter((t) => t.kind === 'boundary').map((t) => ({
        name: t.name,
        distanceKm: null as number | null,
        bearingLabel: '—',
      }));
    }
    return computeNearestFaultDistances(activeEvent.lat, activeEvent.lon, FAULT_TRACES.length)
      .filter((entry) => entry.kind === 'boundary')
      .map((entry) => ({
        name: entry.name,
        distanceKm: entry.distanceKm,
        bearingLabel: entry.bearingLabel,
      }));
  }, [activeEvent.lat, activeEvent.lon, isUnlocated]);

  const nearestCitiesPins = useMemo(() => {
    if (isUnlocated || activeEvent.cities.length === 0) return [];
    const catalogCities = placesCatalog?.cities ?? [];
    if (catalogCities.length === 0) return [];
    const byName = new Map<string, CityPlaceRecord>();
    for (const c of catalogCities) {
      byName.set(c.name.trim().toLowerCase(), c);
    }
    const pins: Array<{
      name: string;
      lat: number;
      lon: number;
      distanceKm: number;
      bearing: string;
    }> = [];
    for (const cand of activeEvent.cities) {
      const rec = byName.get(cand.name.trim().toLowerCase());
      if (!rec) continue;
      pins.push({
        name: rec.name,
        lat: rec.lat,
        lon: rec.lon,
        distanceKm: cand.distanceKm,
        bearing: cand.bearing,
      });
    }
    return pins;
  }, [activeEvent.cities, placesCatalog, isUnlocated]);

  // Stage 1-6B: Evaluate automatic primer draft eligibility at settled, non-stale event transitions
  // regardless of active tab, while gating out solver runs, unadopted candidates, and stale solutions.
  useEffect(() => {
    if (isPlotLocating || candidateSolution !== null || isPlotResultStale) return;
    const result = maybeAutoCreatePrimerDraft(activeEvent, {
      primaryLocationLabel,
      faultGeneratorLabel: selectedGenerator?.label ?? null,
      isSolutionStale: isPlotResultStale,
      isLocating: isPlotLocating,
      hasPendingCandidate: candidateSolution !== null,
      figureOptions: {
        nearestCitiesPins,
        gisActiveFaultsData,
        gisManifest,
        mainOffice,
      },
    });
    if (result.created && result.draft && activeSection !== 'primer') {
      showNotice(
        `Auto-generated unpublished Primer draft for ${activeEvent.id} (open Primer tab to review)`
      );
    }
  }, [
    activeEvent,
    primaryLocationLabel,
    selectedGenerator?.label,
    isPlotResultStale,
    isPlotLocating,
    candidateSolution,
    nearestCitiesPins,
    gisActiveFaultsData,
    gisManifest,
    mainOffice,
    activeSection,
  ]);

  const rulerMeasurement = useMemo(() => {
    if (!mapRulerPoints.start || !mapRulerPoints.end) return null;
    return computeDistanceAndBearing(
      mapRulerPoints.start.lat,
      mapRulerPoints.start.lon,
      mapRulerPoints.end.lat,
      mapRulerPoints.end.lon
    );
  }, [mapRulerPoints]);

  // Toggle P or S exclusion on a station pick
  const togglePhaseExclusion = (pickId: string, phase: 'P' | 'S') => {
    if (phase === 'P') {
      const targetPick = activeEvent.picks.find((p) => p.id === pickId);
      if (targetPick && targetPick.pTime.trim() !== '') {
        const transformPick = (ev: EQPEvent): EQPEvent => ({
          ...ev,
          picks: ev.picks.map((pick) => {
            if (pick.id !== pickId || pick.pTime.trim() === '') return pick;
            const nextExcluded = !pick.pExcluded;
            const updatedPick = {
              ...pick,
              pExcluded: nextExcluded,
              magExcluded: undefined,
            };
            const durMags = computePickDurationMagnitudes(updatedPick, ev.depthKm);
            return {
              ...updatedPick,
              ms: durMags ? Number(durMags.ms.toFixed(1)) : null,
              mb: durMags ? Number(durMags.mb.toFixed(1)) : null,
              md: durMags ? Number(durMags.ml.toFixed(1)) : null,
            };
          }),
        });
        const undoOpts = {
          label: `${targetPick.pExcluded ? 'Include' : 'Exclude'} P phase (${targetPick.sta || 'row'})`,
        };
        if (activeEvent.magnitudeMetadata || activeEvent.historicalMagnitudeBaseline) {
          updateActiveEvent(transformPick, true, undoOpts);
        } else {
          handleApplyFilteredMagnitude({
            notify: false,
            undo: undoOpts,
            transform: transformPick,
          });
        }
      }
      return;
    }

    const targetPick = activeEvent.picks.find((p) => p.id === pickId);
    updateActiveEvent(
      (ev) => ({
        ...ev,
        picks: ev.picks.map((pick) => {
          if (pick.id !== pickId) return pick;
          if (phase === 'S' && pick.sTime.trim() !== '') {
            return { ...pick, sExcluded: !pick.sExcluded };
          }
          return pick;
        }),
      }),
      true,
      targetPick
        ? {
            label: `${targetPick.sExcluded ? 'Include' : 'Exclude'} S phase (${targetPick.sta || 'row'})`,
          }
        : undefined
    );
  };

  const [animatedPickIds, setAnimatedPickIds] = useState<Record<string, number>>({});
  const animatedPickTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const timers = animatedPickTimersRef.current;
    return () => {
      Object.values(timers).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const triggerPickFadeIn = useCallback((pickIds: string[]) => {
    if (pickIds.length === 0) return;
    const nonce = Date.now();
    setAnimatedPickIds((prev) => {
      const next = { ...prev };
      for (const id of pickIds) {
        next[id] = nonce;
      }
      return next;
    });
    for (const id of pickIds) {
      const existing = animatedPickTimersRef.current[id];
      if (existing !== undefined) {
        window.clearTimeout(existing);
      }
      animatedPickTimersRef.current[id] = window.setTimeout(() => {
        delete animatedPickTimersRef.current[id];
        setAnimatedPickIds((prev) => {
          if (prev[id] !== nonce) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 350);
    }
  }, []);

  // Apply automated ML phase pick suggestions to active event picks
  const handleApplyAiSuggestions = (patches: SuggestedPickPatch[], summaryMsg: string) => {
    if (patches.length === 0) return;
    const patchMap: Record<string, SuggestedPickPatch> = {};
    for (const p of patches) {
      patchMap[p.pickId] = p;
    }

    const baseNextEvent: EQPEvent = {
      ...activeEvent,
      picks: activeEvent.picks.map((pick) => {
        const patch = patchMap[pick.id];
        if (!patch) return pick;

        let nextPick = { ...pick };
        if (patch.pTime !== undefined && patch.obsP !== undefined) {
          nextPick = {
            ...nextPick,
            pTime: patch.pTime,
            obsP: patch.obsP,
            pExcluded: false,
            resP: Number((patch.obsP - nextPick.calcP).toFixed(2)),
          };
        }
        if (patch.sTime !== undefined && patch.obsS !== undefined) {
          const nextCalcS = patch.calcS ?? nextPick.calcS;
          nextPick = {
            ...nextPick,
            sTime: patch.sTime,
            obsS: patch.obsS,
            calcS: nextCalcS,
            sExcluded: false,
            resS: Number((patch.obsS - nextCalcS).toFixed(2)),
          };
        }
        return nextPick;
      }),
    };

    const touchesPPhase = patches.some((p) => p.pTime !== undefined);
    const shouldAutoFilter =
      !activeEvent.magnitudeMetadata &&
      !activeEvent.historicalMagnitudeBaseline &&
      touchesPPhase &&
      baseNextEvent.picks.some(isDurationMagnitudeEligible);
    const nextEvent = shouldAutoFilter
      ? handleApplyFilteredMagnitude({
          sourceEvent: baseNextEvent,
          notify: false,
          skipSetEvents: true,
        })
      : baseNextEvent;

    const targetId = activeEvent.id;
    applyTargetEventUpdate(targetId, () => nextEvent, {
      undo: {
        label: `Apply ${patches.length} AI phase pick${patches.length === 1 ? '' : 's'}`,
      },
    });
    triggerPickFadeIn(patches.map((p) => p.pickId));
    void postEqpHistoryCheckpoint(nextEvent, 'ai-picks', 'AI Picks', summaryMsg);

    showNotice(summaryMsg);
  };

  const handleSetPickQuality = (pickId: string, quality: PickQuality) => {
    updateActiveEvent((ev) => ({
      ...ev,
      picks: ev.picks.map((pick) =>
        pick.id === pickId ? { ...pick, quality } : pick
      ),
    }));
  };

  const handleSetPickPolarity = (pickId: string, polarity: Polarity) => {
    updateActiveEvent((ev) => ({
      ...ev,
      picks: ev.picks.map((pick) =>
        pick.id === pickId ? { ...pick, polarity } : pick
      ),
    }));
  };

  const handleAmplitudeInputChange = (pickId: string, rawValue: string) => {
    if (rawValue !== '' && !/^\d*\.?\d*$/.test(rawValue)) return;
    setAmplitudeDrafts((prev) => ({ ...prev, [pickId]: rawValue }));
    const trimmed = rawValue.trim();
    if (trimmed === '') {
      updateActiveEvent(
        (ev) => ({
          ...ev,
          picks: ev.picks.map((pick) =>
            pick.id === pickId ? { ...pick, amplitude: null } : pick
          ),
        }),
        true,
        { coalesceKey: `pick:${pickId}:amplitude` }
      );
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0 && !trimmed.endsWith('.')) {
      updateActiveEvent(
        (ev) => ({
          ...ev,
          picks: ev.picks.map((pick) =>
            pick.id === pickId ? { ...pick, amplitude: parsed } : pick
          ),
        }),
        true,
        { coalesceKey: `pick:${pickId}:amplitude` }
      );
    }
  };

  const handleAmplitudeInputBlur = (pickId: string) => {
    const draft = amplitudeDrafts[pickId];
    if (draft !== undefined) {
      const trimmed = draft.trim();
      if (trimmed === '' || trimmed === '.') {
        updateActiveEvent(
          (ev) => ({
            ...ev,
            picks: ev.picks.map((pick) =>
              pick.id === pickId ? { ...pick, amplitude: null } : pick
            ),
          }),
          true,
          { coalesceKey: `pick:${pickId}:amplitude` }
        );
      } else {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed) && parsed >= 0) {
          updateActiveEvent(
            (ev) => ({
              ...ev,
              picks: ev.picks.map((pick) =>
                pick.id === pickId ? { ...pick, amplitude: parsed } : pick
              ),
            }),
            true,
            { coalesceKey: `pick:${pickId}:amplitude` }
          );
        }
      }
      setAmplitudeDrafts((prev) => {
        const next = { ...prev };
        delete next[pickId];
        return next;
      });
    }
  };

  const handleDurationInputChange = (pickId: string, rawValue: string) => {
    const cleaned = rawValue.replace(/\D/g, '').slice(0, 4);
    const nextDuration = cleaned === '' ? null : Number(cleaned);
    const transformPick = (ev: EQPEvent): EQPEvent => ({
      ...ev,
      picks: ev.picks.map((pick) => {
        if (pick.id !== pickId) return pick;
        const updatedPick = {
          ...pick,
          duration: nextDuration,
          durationSource: nextDuration !== null ? ('manual_coda' as const) : undefined,
          magExcluded: undefined,
        };
        const durMags = computePickDurationMagnitudes(updatedPick, ev.depthKm);
        return {
          ...updatedPick,
          ms: durMags ? Number(durMags.ms.toFixed(1)) : null,
          mb: durMags ? Number(durMags.mb.toFixed(1)) : null,
          md: durMags ? Number(durMags.ml.toFixed(1)) : null,
        };
      }),
    });
    const undoOpts = { coalesceKey: `pick:${pickId}:duration` };
    if (activeEvent.magnitudeMetadata || activeEvent.historicalMagnitudeBaseline) {
      updateActiveEvent(transformPick, true, undoOpts);
    } else {
      handleApplyFilteredMagnitude({
        notify: false,
        undo: undoOpts,
        transform: transformPick,
      });
    }
  };

  const computeObsSecFromMmSs = (mmss: string, originTimeGmt: string): number | null => {
    const trimmed = mmss.trim();
    const dotIdx = trimmed.indexOf('.');
    const intPart = dotIdx === -1 ? trimmed : trimmed.slice(0, dotIdx);
    const decPart = dotIdx === -1 ? '' : trimmed.slice(dotIdx + 1);
    if (intPart.length !== 4) return null;

    let mm = Number(intPart.slice(0, 2));
    const ss = Number(`${intPart.slice(2)}${decPart ? `.${decPart}` : ''}`);
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || ss < 0 || ss >= 60) return null;

    const originParts = originTimeGmt.split(':');
    const originMin = Number(originParts[1] ?? 0);
    const originSec = Number(originParts[2] ?? 0);
    if (!Number.isFinite(originMin) || !Number.isFinite(originSec)) return null;

    if (mm < originMin - 30) mm += 60;
    else if (mm > originMin + 30) mm -= 60;

    const obs = (mm * 60 + ss) - (originMin * 60 + originSec);
    if (!Number.isFinite(obs) || obs < 0) return null;
    return Number(obs.toFixed(2));
  };

  const handlePhaseTimeChange = (pickId: string, phase: 'P' | 'S', rawValue: string) => {
    if (rawValue !== '' && (!/^\d*\.?\d*$/.test(rawValue) || rawValue.length > 8)) return;
    if (phase === 'P') {
      const transformPick = (ev: EQPEvent): EQPEvent => ({
        ...ev,
        picks: ev.picks.map((pick) => {
          if (pick.id !== pickId) return pick;
          const trimmed = rawValue.trim();
          if (trimmed === '') {
            return {
              ...pick,
              pTime: '',
              obsP: 0,
              resP: 0,
              pExcluded: false,
              ms: null,
              mb: null,
              md: null,
              magExcluded: undefined,
            };
          }
          const nextObsP = computeObsSecFromMmSs(rawValue, ev.originTimeGmt);
          const nextPickBase =
            nextObsP !== null
              ? {
                  ...pick,
                  pTime: rawValue,
                  obsP: nextObsP,
                  resP: Number((nextObsP - pick.calcP).toFixed(2)),
                }
              : { ...pick, pTime: rawValue };
          const durMags = computePickDurationMagnitudes(nextPickBase, ev.depthKm);
          return {
            ...nextPickBase,
            ms: durMags ? Number(durMags.ms.toFixed(1)) : nextPickBase.ms,
            mb: durMags ? Number(durMags.mb.toFixed(1)) : nextPickBase.mb,
            md: durMags ? Number(durMags.ml.toFixed(1)) : nextPickBase.md,
          };
        }),
      });
      const undoOpts = { coalesceKey: `pick:${pickId}:pTime` };
      if (activeEvent.magnitudeMetadata || activeEvent.historicalMagnitudeBaseline) {
        updateActiveEvent(transformPick, true, undoOpts);
      } else {
        handleApplyFilteredMagnitude({
          notify: false,
          undo: undoOpts,
          transform: transformPick,
        });
      }
      return;
    }

    updateActiveEvent(
      (ev) => ({
        ...ev,
        picks: ev.picks.map((pick) => {
          if (pick.id !== pickId) return pick;
          const trimmed = rawValue.trim();
          if (trimmed === '') {
            return { ...pick, sTime: '', obsS: 0, resS: 0, sExcluded: false };
          }
          const nextObsS = computeObsSecFromMmSs(rawValue, ev.originTimeGmt);
          if (nextObsS !== null) {
            const nextCalcS =
              pick.calcS > 0 ? pick.calcS : Number((pick.calcP * 1.75).toFixed(2));
            return {
              ...pick,
              sTime: rawValue,
              obsS: nextObsS,
              calcS: nextCalcS,
              resS: Number((nextObsS - nextCalcS).toFixed(2)),
            };
          }
          return { ...pick, sTime: rawValue };
        }),
      }),
      true,
      { coalesceKey: `pick:${pickId}:sTime` }
    );
  };

  const handleStationCodeChange = (pickId: string, rawValue: string) => {
    const normalized = rawValue.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 6);
    const prevPick = activeEvent.picks.find((p) => p.id === pickId);
    const matchedMeta = stations.find((s) => s.code === normalized);
    updateActiveEvent(
      (ev) => ({
        ...ev,
        picks: ev.picks.map((pick) =>
          pick.id === pickId
            ? {
                ...pick,
                sta: normalized,
                ...(matchedMeta ? { lat: matchedMeta.lat, lon: matchedMeta.lon } : {}),
              }
            : pick
        ),
        ...(Array.isArray(ev.amplitudeMeasurements) && ev.amplitudeMeasurements.length > 0
          ? {
              amplitudeMeasurements: ev.amplitudeMeasurements.map((m) =>
                m.stationRefId === pickId ? { ...m, stationCode: normalized } : m
              ),
            }
          : {}),
      }),
      true,
      { coalesceKey: `pick:${pickId}:sta` }
    );
    if (prevPick && selectedStation === prevPick.sta) {
      setSelectedStation(normalized || null);
    }
  };

  const handleSaveStationAmplitudeMeasurements = (
    pickId: string,
    nextStationMeasurements: AmplitudeMeasurement[]
  ) => {
    const targetPick = activeEvent.picks.find((p) => p.id === pickId);
    const staLabel = targetPick?.sta.trim() || 'Station';
    updateActiveEvent(
      (ev) => {
        const otherStations = (ev.amplitudeMeasurements ?? []).filter(
          (m) => m.stationRefId !== pickId
        );
        const nextList = [...otherStations, ...nextStationMeasurements];
        const nextIssues = (ev.amplitudeAssociationIssues ?? []).filter(
          (iss) => iss.stationRefId !== pickId
        );
        return {
          ...ev,
          amplitudeMeasurements: nextList,
          amplitudeAssociationIssues:
            nextIssues.length > 0 ? nextIssues : undefined,
        };
      },
      true,
      { label: `Update amplitude measurements (${staLabel})` }
    );
    setAmplitudeModalPickId(null);
    showNotice(
      nextStationMeasurements.length > 0
        ? `Saved ${nextStationMeasurements.length} amplitude measurement(s) for ${staLabel}`
        : `Cleared structured amplitude measurements for ${staLabel}`
    );
  };

  const handleDraftStationChange = (rawValue: string) => {
    const normalized = rawValue.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 6);
    setDraftPick((prev) => ({ ...prev, sta: normalized }));
  };

  const handleDraftPhaseChange = (phase: 'P' | 'S', rawValue: string) => {
    if (rawValue !== '' && (!/^\d*\.?\d*$/.test(rawValue) || rawValue.length > 8)) return;
    setDraftPick((prev) => (phase === 'P' ? { ...prev, pTime: rawValue } : { ...prev, sTime: rawValue }));
  };

  const handleCommitDraftPick = () => {
    const sta = draftPick.sta.trim().toUpperCase();
    if (!sta) {
      showNotice('Enter a station code (e.g. BES, OCL, TGY) before adding a pick.');
      return;
    }

    const matchedMeta = stations.find((s) => s.code === sta);
    const pTimeTrimmed = draftPick.pTime.trim();
    const sTimeTrimmed = draftPick.sTime.trim();
    const parsedObsP = pTimeTrimmed ? computeObsSecFromMmSs(pTimeTrimmed, activeEvent.originTimeGmt) ?? 0 : 0;
    const parsedObsS = sTimeTrimmed ? computeObsSecFromMmSs(sTimeTrimmed, activeEvent.originTimeGmt) ?? 0 : 0;
    const durNum = draftPick.duration.trim() ? Number(draftPick.duration.trim()) : null;
    const ampNum = draftPick.amplitude.trim() ? Number(draftPick.amplitude.trim()) : null;

    const newPick: StationPick = {
      id: `pick-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sta,
      pTime: pTimeTrimmed,
      pExcluded: false,
      sTime: sTimeTrimmed,
      sExcluded: false,
      duration: durNum !== null && Number.isFinite(durNum) ? Math.round(durNum) : null,
      durationSource:
        durNum !== null && Number.isFinite(durNum) ? ('manual_coda' as const) : undefined,
      amplitude: ampNum !== null && Number.isFinite(ampNum) ? ampNum : null,
      polarity: draftPick.polarity,
      quality: draftPick.quality,
      lat: matchedMeta?.lat ?? DEFAULT_PH_CENTER.lat,
      lon: matchedMeta?.lon ?? DEFAULT_PH_CENTER.lon,
      toa: 0,
      azim: 0,
      delta: 0,
      resP: 0,
      resS: 0,
      obsP: parsedObsP,
      obsS: parsedObsS,
      calcP: 0,
      calcS: 0,
      ms: null,
      mb: null,
      md: null,
    };

    if (
      !activeEvent.magnitudeMetadata &&
      !activeEvent.historicalMagnitudeBaseline &&
      isDurationMagnitudeEligible(newPick)
    ) {
      handleApplyFilteredMagnitude({
        notify: false,
        undo: { label: `Add station ${sta}` },
        transform: (ev) => ({
          ...ev,
          picks: [...ev.picks, newPick],
        }),
      });
    } else {
      updateActiveEvent(
        (ev) => ({
          ...ev,
          picks: [...ev.picks, newPick],
        }),
        true,
        { label: `Add station ${sta}` }
      );
    }
    triggerPickFadeIn([newPick.id]);
    setDraftPick(createEmptyDraftPick());
    setSelectedStation(sta);
    showNotice(`Added station ${sta} to phase table`);
  };

  const handleRemovePick = (pickId: string, sta: string) => {
    const removedPick = activeEvent.picks.find((p) => p.id === pickId);
    const removePickAndMeasurements = (ev: EQPEvent): EQPEvent => {
      const nextPicks = ev.picks.filter((p) => p.id !== pickId);
      const nextMeasurements = Array.isArray(ev.amplitudeMeasurements)
        ? ev.amplitudeMeasurements.filter((m) => m.stationRefId !== pickId)
        : ev.amplitudeMeasurements;
      const nextIssues = Array.isArray(ev.amplitudeAssociationIssues)
        ? ev.amplitudeAssociationIssues.filter((iss) => iss.stationRefId !== pickId)
        : ev.amplitudeAssociationIssues;
      return {
        ...ev,
        picks: nextPicks,
        ...(nextMeasurements !== undefined
          ? { amplitudeMeasurements: nextMeasurements }
          : {}),
        amplitudeAssociationIssues:
          nextIssues && nextIssues.length > 0 ? nextIssues : undefined,
      };
    };
    if (
      !activeEvent.magnitudeMetadata &&
      !activeEvent.historicalMagnitudeBaseline &&
      removedPick &&
      isDurationMagnitudeEligible(removedPick)
    ) {
      handleApplyFilteredMagnitude({
        notify: false,
        undo: { label: `Remove station ${sta || 'row'}` },
        transform: removePickAndMeasurements,
      });
    } else {
      updateActiveEvent(removePickAndMeasurements, true, {
        label: `Remove station ${sta || 'row'}`,
      });
    }
    setAmplitudeDrafts((prev) => {
      if (!(pickId in prev)) return prev;
      const next = { ...prev };
      delete next[pickId];
      return next;
    });
    if (amplitudeModalPickId === pickId) {
      setAmplitudeModalPickId(null);
    }
    if (selectedStation === sta) {
      setSelectedStation(null);
    }
    showNotice(`Removed station ${sta || 'row'}`);
  };

  const applyParsedAtlasToWorkspace = (parsed: AtlasParseResult) => {
    const targetId = activeEvent.id;
    const outcome = appendAtlasParseToEqpEvent(activeEvent, parsed);
    if (outcome.mode === 'noop-failed' || !parsed.header) {
      showNotice(
        parsed.error ||
          'ATLAS/HYDRA parse failed — preserved existing station observations unchanged.'
      );
      return;
    }

    if (outcome.mode === 'populated-empty') {
      const saveTarget = buildEqpSaveTarget(outcome.event, solutionDrive);
      const populated: EQPEvent = {
        ...outcome.event,
        filename: saveTarget.filename,
        filePath: saveTarget.fullPath,
      };
      applyTargetEventUpdate(targetId, () => populated, {
        undo: {
          label: `Load ATLAS event (${parsed.summary.totalStations} stations)`,
        },
      });
      setCandidateSolution(null);
      setAmplitudeDrafts({});
      setDraftPick(createEmptyDraftPick());
      setSelectedStation(null);
      setAtlasStatusNotice(null);
    } else {
      applyTargetEventUpdate(targetId, () => outcome.event, {
        undo: {
          label: `Append ${outcome.appendedCount} ATLAS station${
            outcome.appendedCount === 1 ? '' : 's'
          }`,
        },
      });
    }

    const prevIds = new Set(activeEvent.picks.map((p) => p.id));
    const addedPickIds = outcome.event.picks
      .filter((p) => !prevIds.has(p.id))
      .map((p) => p.id);
    if (addedPickIds.length > 0) {
      triggerPickFadeIn(addedPickIds);
    }

    setPickTableSort(null);

    const { summary } = parsed;
    const reviewBits: string[] = [];
    if (summary.ambiguousStations > 0) {
      reviewBits.push(`${summary.ambiguousStations} ambiguous`);
    }
    if (summary.sOnlyStations > 0) {
      reviewBits.push(`${summary.sOnlyStations} S-only`);
    }
    if (summary.unknownStations > 0) {
      reviewBits.push(`${summary.unknownStations} unmapped`);
    }
    if (summary.rejectedLineCount > 0) {
      reviewBits.push(`${summary.rejectedLineCount} corrupted line(s) skipped`);
    }
    const suffix = reviewBits.length > 0 ? ` (${reviewBits.join(', ')})` : '';

    if (outcome.mode === 'populated-empty') {
      showNotice(
        `Loaded ATLAS/HYDRA ${parsed.header.originDateGmt} ${parsed.header.originTimeGmt} UTC · ${summary.totalStations} stations · ${summary.pObservations} P · ${summary.sObservations} S · ${summary.validDurations} Dur${suffix}`
      );
      return;
    }

    const mismatchText = outcome.originTimeMismatch
      ? `Event origin mismatch preserved: kept ${outcome.existingOriginLabel} UTC (pasted ATLAS header ${outcome.pastedOriginLabel} UTC).`
      : null;

    if (mismatchText) {
      setAtlasStatusNotice(mismatchText);
      showNotice(
        `Appended ${outcome.appendedCount} ATLAS stations below ${outcome.existingCountBefore} existing (${outcome.totalCountAfter} total)${suffix}. ${mismatchText}`
      );
    } else {
      setAtlasStatusNotice(null);
      showNotice(
        `Appended ${outcome.appendedCount} ATLAS stations below ${outcome.existingCountBefore} existing (${outcome.totalCountAfter} total) · ${summary.pObservations} P · ${summary.sObservations} S · ${summary.validDurations} Dur${suffix}`
      );
    }
  };

  const handleStationPanelPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const rawText =
      e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text') || '';
    if (!detectAtlasHydraFormat(rawText)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const parsed = parseAtlasHydraClipboard(rawText, stations);
    if (!parsed.valid || !parsed.header) {
      showNotice(
        parsed.error ||
          'ATLAS/HYDRA parse failed — preserved existing station observations unchanged.'
      );
      return;
    }

    applyParsedAtlasToWorkspace(parsed);
  };

  // Stage 2 + Stage 3 decoupled location workflow:
  // Step 1 (Locate): Calculates a CandidateLocationSolution without mutating activeEvent.
  // Step 2 (Inspect & Adopt): User explicitly reviews candidate diagnostics and promotes it via handleAdoptCandidateSolution.
  const handleRunLocate = () => {
    const cand = calculateCandidateLocation({
      event: activeEvent,
      stations,
      solverEngine,
      modelId: travelTimeModelId,
      correctionProfile,
      eventRevision: eventRevisions[activeEvent.id] ?? 0,
      stationMetadataOverrides: resolvedStationOverrides,
    });
    setCandidateSolution(cand);

    if (!cand.result.converged) {
      showNotice(
        cand.result.reason || 'Solver could not converge; official event unchanged.'
      );
      return;
    }

    const r = cand.result;
    showNotice(
      `Candidate (${r.modelName} · ${solverEngine}) ready: RMS ${r.rmsSec.toFixed(2)}s / WRMS ${r.weightedRmsSec.toFixed(2)}s · Depth ${r.depthKm.toFixed(1)} km — click Adopt Solution to apply.`
    );
  };

  const handleDiscardCandidateSolution = () => {
    setCandidateSolution(null);
    showNotice('Discarded candidate location; adopted event unchanged.');
  };

  const promoteConvergedCandidate = async (
    cand: CandidateLocationSolution,
    sourceEvent: EQPEvent,
    options: {
      openNearestPlacesPopup: boolean;
      historyTriggerLabel?: string;
    }
  ): Promise<EQPEvent | null> => {
    if (!cand.result.converged || cand.status === 'failed') {
      return null;
    }
    const targetEventId = cand.eventId;
    const r = cand.result;
    const solvedLat = r.lat;
    const solvedLon = r.lon;

    const now = new Date();
    // Stage B: Await saved reference datasets (_places_db.json: CITY.csv, Population_Centers_2007.txt, GENTR.txt)
    const catalog = placesCatalogRef.current ?? (await ensurePlacesCatalog());
    if (activeEventIdRef.current !== targetEventId) {
      // User switched events while places catalog was resolving — abort cleanly without cross-event corruption
      return null;
    }

    const prevSelectedCityName =
      sourceEvent.cities.find((c) => c.id === sourceEvent.selectedCityId)?.name ?? null;
    const prevSelectedTownName =
      sourceEvent.towns.find((t) => t.id === sourceEvent.selectedTownId)?.name ?? null;
    const prevSelectedGenName =
      sourceEvent.generators.find((g) => g.id === sourceEvent.selectedGeneratorId)?.name ?? null;
    const prevCityCleared = sourceEvent.cities.length > 0 && !sourceEvent.selectedCityId;
    const prevTownCleared = sourceEvent.towns.length > 0 && !sourceEvent.selectedTownId;

    let nextCentralBearing = sourceEvent.centralOfficeBearing;
    let nextCities = sourceEvent.cities;
    let nextSelectedCityId = sourceEvent.selectedCityId;
    let nextTowns = sourceEvent.towns;
    let nextSelectedTownId = sourceEvent.selectedTownId;
    let nextGenerators = sourceEvent.generators;
    let nextSelectedGenId = sourceEvent.selectedGeneratorId;

    if (catalog) {
      const computedPlaces = computeNearestPlacesForEpicenter(
        solvedLat,
        solvedLon,
        catalog,
        {
          selectedCityName: prevSelectedCityName,
          cityCleared: prevCityCleared,
          selectedTownName: prevSelectedTownName,
          townCleared: prevTownCleared,
          selectedGeneratorName: prevSelectedGenName,
        },
        mainOfficeRef.current
      );
      nextCentralBearing = computedPlaces.centralOfficeBearing;
      nextCities = computedPlaces.cities;
      nextSelectedCityId = computedPlaces.selectedCityId;
      nextTowns = computedPlaces.towns;
      nextSelectedTownId = computedPlaces.selectedTownId;
      nextGenerators = computedPlaces.generators;
      nextSelectedGenId = computedPlaces.selectedGeneratorId;
    } else {
      nextCentralBearing = formatCentralOfficeBearing(
        solvedLat,
        solvedLon,
        mainOfficeRef.current
      );

      if (
        sourceEvent.cities.length === 0 ||
        sourceEvent.towns.length === 0 ||
        sourceEvent.generators.length === 0
      ) {
        const rankedFaults = FAULT_TRACES.map((fault, idx) => {
          let minD = Infinity;
          let bestQuad = 'N 00° E';
          fault.points.forEach(([fLon, fLat]) => {
            const info = computeDistanceAndBearing(fLat, fLon, solvedLat, solvedLon);
            if (info.distKm < minD) {
              minD = info.distKm;
              bestQuad = info.quadrantLabel;
            }
          });
          return {
            id: `g${idx + 1}`,
            distanceKm: Math.round(minD),
            bearing: bestQuad,
            name: fault.name,
            label: `${String(Math.round(minD)).padStart(3, '0')} km ${bestQuad} of ${fault.name}`,
          };
        }).sort((a, b) => a.distanceKm - b.distanceKm);
        nextGenerators = rankedFaults.slice(0, 5);
        nextSelectedGenId = nextGenerators[0]?.id ?? '';
      }
    }

    const lstNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const lstHours24 = lstNow.getUTCHours();
    const amPm = lstHours24 >= 12 ? 'PM' : 'AM';
    const lstHours12 = lstHours24 % 12 || 12;
    const defaultIssuedDate = `${String(lstNow.getUTCDate()).padStart(2, '0')} ${months[lstNow.getUTCMonth()]} ${lstNow.getUTCFullYear()}`;
    const defaultIssuedTime = `${String(lstHours12).padStart(2, '0')}:${String(lstNow.getUTCMinutes()).padStart(2, '0')} ${amPm}`;

    const adoptedBase = applyCandidateSolutionToEvent(sourceEvent, cand, now.toISOString());
    const preFilteredEvent: EQPEvent = {
      ...adoptedBase,
      centralOfficeBearing: nextCentralBearing,
      cities: nextCities,
      selectedCityId: nextSelectedCityId,
      towns: nextTowns,
      selectedTownId: nextSelectedTownId,
      generators: nextGenerators,
      selectedGeneratorId: nextSelectedGenId,
      issuedDate: sourceEvent.issuedDate || defaultIssuedDate,
      issuedTime: sourceEvent.issuedTime || defaultIssuedTime,
    };
    const methodSelection = resolveEventMethodSelection(preFilteredEvent, magnitudeSettings);
    const shouldEvalLegacy =
      methodSelection.selectedMethods.includes('eqp-legacy-ms') &&
      preFilteredEvent.picks.some(isDurationMagnitudeEligible);
    const legacySolvedEvent = shouldEvalLegacy
      ? handleApplyFilteredMagnitude({
          sourceEvent: preFilteredEvent,
          solverEngineOverride: cand.solverEngine,
          notify: false,
          skipSetEvents: true,
        })
      : preFilteredEvent;

    let multiMethodMeta: EventMagnitudeMetadata;
    try {
      multiMethodMeta = evaluateEventMagnitudes({
        event: legacySolvedEvent,
        settings: magnitudeSettings,
        stations,
        preferredMethodOverride: methodSelection.preferredSelectionLocked
          ? methodSelection.preferredMethodId
          : undefined,
        methodSelectionModeOverride: methodSelection.mode,
        selectedMethodsOverride:
          methodSelection.mode === 'custom'
            ? methodSelection.selectedMethods
            : undefined,
        preferredSelectionLockedOverride: methodSelection.preferredSelectionLocked,
        evaluatedAt: now.toISOString(),
      });
    } catch (magErr) {
      const fallbackMethod = methodSelection.preferredMethodId;
      const fallbackDesc = MAGNITUDE_ALGORITHM_BY_ID[fallbackMethod];
      multiMethodMeta = {
        preferredMethodId: fallbackMethod,
        isPerEventOverride: methodSelection.isPerEventOverride,
        methodSelectionMode: methodSelection.mode,
        ...(methodSelection.mode === 'custom'
          ? { selectedMethods: methodSelection.selectedMethods }
          : {}),
        preferredSelectionLocked: methodSelection.preferredSelectionLocked,
        selectedScale: fallbackDesc.scale,
        selectedMagnitude: null,
        selectedStatus: 'calculation_failure',
        selectedStatusReason:
          magErr instanceof Error
            ? magErr.message
            : 'Magnitude evaluation failed after hypocenter location.',
        contributingStations: 0,
        aggregationMethod: magnitudeSettings.networkAggregation,
        calibrationProfileId: 'error',
        calibrationStatus: 'pending_calibration',
        algorithmVersion: fallbackDesc.version,
        provenanceSummary: 'Calculation failure (location preserved)',
        suggestedAlternative: null,
        resultsByAlgorithm: sourceEvent.magnitudeMetadata?.resultsByAlgorithm ?? {},
        evaluatedAt: now.toISOString(),
      };
    }

    const solvedEvent: EQPEvent = {
      ...legacySolvedEvent,
      historicalMagnitudeBaseline: undefined,
      magnitudeMetadata: multiMethodMeta,
    };
    const updatedHistory = solvedEvent.magnitudeHistory;

    const overridesForSolved = buildStationMetadataOverridesForPicks(
      solvedEvent.picks,
      stations
    );
    const solvedChecksum = computeObservationSnapshotChecksum(
      solvedEvent,
      stations,
      overridesForSolved
    );

    applyTargetEventUpdate(targetEventId, () => solvedEvent, {
      undo: {
        label: `Locate hypocenter (${cand.solverEngine} · ${r.modelName})`,
      },
    });
    setLocatedSnapshotChecksums((prev) => ({
      ...prev,
      [targetEventId]: solvedChecksum,
    }));
    setLastPlotWarningsByEvent((prev) => ({
      ...prev,
      [targetEventId]: r.warnings,
    }));
    setCandidateSolution(null);

    const nextRelocLabel = updatedHistory.at(-1)?.relocation ?? 'Reloc';
    void postEqpHistoryCheckpoint(
      solvedEvent,
      'locate',
      options.historyTriggerLabel ?? nextRelocLabel,
      `${cand.solverEngine} · ${r.modelName} (${r.iterations} iter) · RMS ${r.rmsSec.toFixed(2)}s / WRMS ${r.weightedRmsSec.toFixed(2)}s`
    );

    if (options.openNearestPlacesPopup) {
      setNearestPlacesPopupOpen(true);
    }
    return solvedEvent;
  };

  const handleAdoptCandidateSolution = async (
    overrideCandidate?: CandidateLocationSolution
  ) => {
    const cand = overrideCandidate ?? candidateSolution;
    if (!cand || cand.status === 'failed' || !cand.result.converged) {
      showNotice('No converged candidate solution available to adopt.');
      return;
    }
    const targetEventId = cand.eventId;
    if (targetEventId !== activeEventIdRef.current) {
      showNotice('Candidate belongs to a different event; re-run Locate first.');
      return;
    }
    if (
      !overrideCandidate &&
      isCandidateSolutionStale(
        cand,
        activeEvent,
        stations,
        eventRevisions[activeEvent.id] ?? 0,
        resolvedStationOverrides
      )
    ) {
      showNotice('Event inputs changed since calculation — re-run Locate before adopting.');
      return;
    }

    const r = cand.result;
    const solvedEvent = await promoteConvergedCandidate(cand, activeEvent, {
      openNearestPlacesPopup: true,
    });
    if (!solvedEvent) return;

    showNotice(
      `Adopted ${r.modelName} (${cand.solverEngine}) solution: RMS ${r.rmsSec.toFixed(2)}s · Depth ${r.depthKm.toFixed(1)} km`
    );
  };

  const handleRunPlotLocate = async () => {
    if (isPlotLocatingRef.current) return;
    isPlotLocatingRef.current = true;
    setIsPlotLocating(true);

    try {
      // Yield one tick so the PLOT button renders "Locating Earthquake..." and blocks duplicate clicks
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const eventSnapshot = activeEvent;
      const targetEventId = eventSnapshot.id;
      const currentOverrides = buildStationMetadataOverridesForPicks(
        eventSnapshot.picks,
        stations
      );

      if (solverEngine !== 'EQP' && solverEngine !== 'HypoInverse') {
        const msg = `Selected solver '${String(solverEngine)}' is not supported or implemented.`;
        showNotice(msg);
        return;
      }

      const cand = calculateCandidateLocation({
        event: eventSnapshot,
        stations,
        solverEngine,
        modelId: travelTimeModelId,
        correctionProfile,
        eventRevision: eventRevisions[targetEventId] ?? 0,
        stationMetadataOverrides: currentOverrides,
      });

      if (activeEventIdRef.current !== targetEventId) {
        return;
      }

      if (!cand.result.converged || cand.status === 'failed') {
        setCandidateSolution(cand);
        showNotice(
          cand.result.reason ||
            'Earthquake location failed — check station observations and travel-time model availability.'
        );
        return;
      }

      const solvedEvent = await promoteConvergedCandidate(cand, eventSnapshot, {
        openNearestPlacesPopup: false,
      });
      if (!solvedEvent) return;

      const r = cand.result;
      showNotice(
        `Located (${r.modelName} · ${solverEngine}): ${r.lat.toFixed(3)}°N, ${r.lon.toFixed(3)}°E · Depth ${r.depthKm.toFixed(1)} km · RMS ${r.rmsSec.toFixed(2)}s`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unexpected error during earthquake location.';
      showNotice(`Earthquake location failed: ${msg}`);
    } finally {
      isPlotLocatingRef.current = false;
      setIsPlotLocating(false);
    }
  };

  const handleOpenNearestPlacesPopup = async () => {
    if (isEventUnlocated(activeEvent)) {
      showNotice('Hypocenter not plotted yet — click PLOT to locate hypocenter and populate nearest locations.');
      setNearestPlacesPopupOpen(true);
      return;
    }

    const targetId = activeEvent.id;
    const targetLat = activeEvent.lat;
    const targetLon = activeEvent.lon;
    const prevCityName =
      activeEvent.cities.find((c) => c.id === activeEvent.selectedCityId)?.name ?? null;
    const prevTownName =
      activeEvent.towns.find((t) => t.id === activeEvent.selectedTownId)?.name ?? null;
    const prevGenName =
      activeEvent.generators.find((g) => g.id === activeEvent.selectedGeneratorId)?.name ?? null;
    const cityCleared = activeEvent.cities.length > 0 && !activeEvent.selectedCityId;
    const townCleared = activeEvent.towns.length > 0 && !activeEvent.selectedTownId;

    const cat = placesCatalogRef.current ?? (await ensurePlacesCatalog());
    if (cat) {
      const resolved = computeNearestPlacesForEpicenter(
        targetLat,
        targetLon,
        cat,
        {
          selectedCityName: prevCityName,
          cityCleared,
          selectedTownName: prevTownName,
          townCleared,
          selectedGeneratorName: prevGenName,
        },
        mainOfficeRef.current
      );
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === targetId
            ? {
                ...ev,
                centralOfficeBearing: resolved.centralOfficeBearing,
                cities: resolved.cities,
                selectedCityId: resolved.selectedCityId,
                towns: resolved.towns,
                selectedTownId: resolved.selectedTownId,
                generators: resolved.generators,
                selectedGeneratorId: resolved.selectedGeneratorId,
              }
            : ev
        )
      );
    }

    setNearestPlacesPopupOpen(true);
  };

  // Outlier computation for Magnitude.pas RemoveOutLiers (Duration Magnitude across checked P + Dur stations)
  const magnitudeAnalysis = useMemo(() => {
    const valid = activeEvent.picks
      .filter(isDurationMagnitudeEligible)
      .map((p) => {
        const durMag = computePickDurationMagnitudes(p, activeEvent.depthKm);
        if (!durMag) return null;
        const rawVal =
          activeEvent.preferredScale === 'Ms'
            ? durMag.ms
            : activeEvent.preferredScale === 'Mb'
              ? durMag.mb
              : durMag.ml;
        return { sta: p.sta, val: Number(rawVal.toFixed(1)) };
      })
      .filter((item): item is { sta: string; val: number } => item !== null);

    if (valid.length === 0) {
      return { meanAll: 0, stdDev: 0, filteredMean: 0, outliers: new Set<string>() };
    }

    const meanAll = valid.reduce((sum, x) => sum + x.val, 0) / valid.length;
    const variance =
      valid.reduce((sum, x) => sum + Math.pow(x.val - meanAll, 2), 0) / valid.length;
    const stdDev = Math.sqrt(variance);

    const outliers = new Set<string>();
    const kept: number[] = [];
    valid.forEach((item) => {
      if (stdDev > 0.05 && Math.abs(item.val - meanAll) > varianceK * stdDev) {
        outliers.add(item.sta);
      } else {
        kept.push(item.val);
      }
    });

    const filteredMean =
      kept.length > 0 ? kept.reduce((s, v) => s + v, 0) / kept.length : meanAll;

    return {
      meanAll: Number(meanAll.toFixed(2)),
      stdDev: Number(stdDev.toFixed(2)),
      filteredMean: Number(filteredMean.toFixed(1)),
      outliers,
    };
  }, [activeEvent.picks, activeEvent.preferredScale, activeEvent.depthKm, varianceK]);

  function handleApplyFilteredMagnitude(
    trigger?:
      | React.MouseEvent<HTMLButtonElement>
      | {
          sourceEvent?: EQPEvent;
          transform?: (ev: EQPEvent) => EQPEvent;
          varianceKOverride?: number;
          solverEngineOverride?: SolverEngine;
          notify?: boolean;
          createHistoryIfEmpty?: boolean;
          markDirty?: boolean;
          skipSetEvents?: boolean;
          undo?: PushUndoOptions | false;
        }
  ): EQPEvent {
    const isMouseEvent =
      trigger !== undefined &&
      typeof trigger === 'object' &&
      'nativeEvent' in trigger;
    const opts = isMouseEvent || !trigger ? {} : trigger;
    const kToUse = opts.varianceKOverride ?? varianceK;
    const solverToUse = opts.solverEngineOverride ?? solverEngine;
    const shouldNotify = opts.notify ?? (isMouseEvent || trigger === undefined);
    const createHistoryIfEmpty =
      opts.createHistoryIfEmpty ?? (isMouseEvent || trigger === undefined);
    const markDirty = opts.markDirty ?? true;

    const baseEvent = opts.sourceEvent ?? activeEvent;
    const transformedBase = opts.transform ? opts.transform(baseEvent) : baseEvent;
    const previewResult = applyOutlierFilteredMagnitudeToEvent(transformedBase, kToUse, {
      solverEngine: solverToUse,
      createHistoryIfEmpty,
    });

    if (!opts.skipSetEvents) {
      const targetId = transformedBase.id;
      applyTargetEventUpdate(
        targetId,
        (ev) => {
          const nextBase = opts.transform ? opts.transform(ev) : ev;
          return applyOutlierFilteredMagnitudeToEvent(nextBase, kToUse, {
            solverEngine: solverToUse,
            createHistoryIfEmpty,
          }).event;
        },
        {
          markDirty,
          undo:
            opts.undo !== undefined
              ? opts.undo
              : isMouseEvent || trigger === undefined
                ? { label: 'Apply duration magnitude outlier filter' }
                : undefined,
        }
      );
    }

    if (shouldNotify) {
      showNotice(
        `Updated ${previewResult.event.preferredScale} magnitude to ${previewResult.filteredMean.toFixed(1)} (${previewResult.outlierCount} outlier${previewResult.outlierCount === 1 ? '' : 's'} rejected)`
      );
    }

    return previewResult.event;
  }

  const handleUpdateMagnitudeSettings = (nextSettings: MagnitudeSettings) => {
    const saved = saveMagnitudeSettings(nextSettings);
    setMagnitudeSettings(saved);
  };

  const handleResetMagnitudeSettings = () => {
    const reset = resetMagnitudeSettings();
    setMagnitudeSettings(reset);
    showNotice('Magnitude settings reset to EQP Legacy Ms default.');
  };

  const handleRecalculateEventMagnitude = () => {
    const targetId = activeEvent.id;
    const selection = resolveEventMethodSelection(activeEvent, magnitudeSettings);

    let refreshedEventBase: EQPEvent = activeEvent;
    if (
      selection.selectedMethods.includes('eqp-legacy-ms') &&
      activeEvent.picks.some(isDurationMagnitudeEligible)
    ) {
      refreshedEventBase = handleApplyFilteredMagnitude({
        sourceEvent: activeEvent,
        varianceKOverride: varianceK,
        solverEngineOverride: solverEngine,
        notify: false,
        skipSetEvents: true,
      });
    }

    const nextMeta = evaluateEventMagnitudes({
      event: refreshedEventBase,
      settings: magnitudeSettings,
      stations,
      preferredMethodOverride: selection.preferredSelectionLocked
        ? selection.preferredMethodId
        : undefined,
      methodSelectionModeOverride: selection.mode,
      selectedMethodsOverride:
        selection.mode === 'custom' ? selection.selectedMethods : undefined,
      preferredSelectionLockedOverride: selection.preferredSelectionLocked,
    });

    const updatedEvent: EQPEvent = {
      ...refreshedEventBase,
      historicalMagnitudeBaseline: undefined,
      magnitudeMetadata: nextMeta,
    };

    applyTargetEventUpdate(targetId, () => updatedEvent, {
      undo: {
        label: `Recalculate magnitude (${nextMeta.selectedScale})`,
      },
    });
    void postEqpHistoryCheckpoint(
      updatedEvent,
      'magnitude',
      'Recalc Mag',
      nextMeta.selectedMagnitude !== null
        ? `${nextMeta.selectedScale} ${nextMeta.selectedMagnitude.toFixed(1)}`
        : `${nextMeta.selectedScale} pending`
    );
    const desc = MAGNITUDE_ALGORITHM_BY_ID[nextMeta.preferredMethodId];
    if (!selection.hasAnySelectedMethod) {
      showNotice(
        'No magnitude methods are selected for this event — enable at least one method or switch to Use Global Settings.'
      );
      return;
    }
    showNotice(
      nextMeta.selectedStatus === 'valid' && nextMeta.selectedMagnitude !== null
        ? `Recalculated ${desc?.scientificLabel ?? nextMeta.selectedScale}: ${nextMeta.selectedScale} ${nextMeta.selectedMagnitude.toFixed(1)} (location preserved).`
        : `Recalculated ${desc?.scientificLabel ?? nextMeta.selectedScale}: ${nextMeta.selectedStatusReason ?? 'Unavailable'} (location preserved).`
    );
  };

  const handleUpdateEventMethodSelection = (
    mode: EventMethodSelectionMode,
    selectedMethods: MagnitudeAlgorithmId[]
  ) => {
    const updatedMeta = updateEventMethodSelection({
      metadata: activeEventMagnitudeMetadata,
      settings: magnitudeSettings,
      mode,
      selectedMethods,
    });
    applyTargetEventUpdate(
      activeEvent.id,
      (ev) => ({
        ...ev,
        magnitudeMetadata: updatedMeta,
      }),
      {
        undo: {
          label:
            mode === 'inherit_global'
              ? 'Use global magnitude methods'
              : `Update event magnitude methods (${selectedMethods.length})`,
        },
      }
    );
    if (mode === 'inherit_global') {
      showNotice('Event method selection set to inherit Global Settings.');
    } else if (selectedMethods.length === 0) {
      showNotice('All magnitude calculation methods unchecked for this event.');
    }
  };

  const handleSelectEventPreferredMethod = (methodId: MagnitudeAlgorithmId) => {
    const res = selectPreferredMethodOnEventMetadata({
      methodId,
      metadata: activeEventMagnitudeMetadata,
      freshness: activeMagnitudeFreshness,
      settings: magnitudeSettings,
    });

    if (!res.ok) {
      showNotice(res.reason ?? 'Cannot select unavailable magnitude method as preferred.');
      return;
    }

    let legacyPatch: Partial<EQPEvent> = {};
    if (
      methodId === 'eqp-legacy-ms' &&
      activeEvent.picks.some(isDurationMagnitudeEligible)
    ) {
      const evalBase = handleApplyFilteredMagnitude({
        sourceEvent: activeEvent,
        varianceKOverride: varianceK,
        solverEngineOverride: solverEngine,
        notify: false,
        skipSetEvents: true,
      });
      legacyPatch = {
        ms: evalBase.ms,
        mb: evalBase.mb,
        md: evalBase.md,
        picks: evalBase.picks,
      };
    }

    const desc = MAGNITUDE_ALGORITHM_BY_ID[methodId];
    applyTargetEventUpdate(
      activeEvent.id,
      (ev) => ({
        ...ev,
        ...legacyPatch,
        magnitudeMetadata: res.metadata,
      }),
      {
        undo: {
          label: `Select ${desc.shortName} as preferred magnitude`,
        },
      }
    );
    showNotice(
      res.metadata.selectedMagnitude !== null
        ? `Preferred magnitude set to ${desc.scientificLabel} (${res.metadata.selectedScale} ${res.metadata.selectedMagnitude.toFixed(1)})`
        : `Preferred magnitude set to ${desc.scientificLabel}`
    );
  };

  const handleResetEventMethodToGlobalDefault = () => {
    let evalBase: EQPEvent = activeEvent;
    if (
      magnitudeSettings.enabledMethods.includes('eqp-legacy-ms') &&
      activeEvent.picks.some(isDurationMagnitudeEligible)
    ) {
      evalBase = handleApplyFilteredMagnitude({
        sourceEvent: activeEvent,
        varianceKOverride: varianceK,
        solverEngineOverride: solverEngine,
        notify: false,
        skipSetEvents: true,
      });
    }
    const nextMeta = evaluateEventMagnitudes({
      event: evalBase,
      settings: magnitudeSettings,
      stations,
      preferredMethodOverride: null,
      methodSelectionModeOverride: 'inherit_global',
      preferredSelectionLockedOverride: false,
    });
    const desc = MAGNITUDE_ALGORITHM_BY_ID[magnitudeSettings.defaultMethod];
    applyTargetEventUpdate(
      activeEvent.id,
      (ev) => ({
        ...ev,
        ...(magnitudeSettings.enabledMethods.includes('eqp-legacy-ms')
          ? {
              ms: evalBase.ms,
              mb: evalBase.mb,
              md: evalBase.md,
              picks: evalBase.picks,
            }
          : {}),
        historicalMagnitudeBaseline: undefined,
        magnitudeMetadata: nextMeta,
      }),
      {
        undo: {
          label: `Reset event magnitude method to global default (${desc.shortName})`,
        },
      }
    );
    showNotice(`Reset event magnitude selection & preferred method to global default (${desc.shortName}).`);
  };

  const handleSaveDriveSetting = (nextRaw: string) => {
    const normalized = normalizeSolutionDrive(nextRaw);
    setSolutionDrive(normalized);
    setDriveInputDraft(normalized);
    try {
      window.localStorage.setItem(SOLUTION_DRIVE_STORAGE_KEY, normalized);
    } catch {
      // ignore storage errors
    }
    showNotice(`Solution drive set to ${normalized} (${normalized}\\EARTHQUAKE\\SOLUTION_EQ\\Sol_YYYY\\MM\\DD)`);
  };

  const handleSelectIconStyle = (next: IconStylePreset) => {
    setIconStyle(next);
    try {
      window.localStorage.setItem('eqp_icon_style_preset', next);
    } catch {
      // ignore storage errors
    }
    const meta = ICON_STYLE_OPTIONS.find((opt) => opt.id === next);
    showNotice(`Workstation icon theme updated to "${meta?.title ?? next}".`);
  };

  const handleSelectButtonStyle = (next: ButtonStylePreset) => {
    setButtonStyle(next);
    try {
      window.localStorage.setItem('eqp_button_style_preset', next);
    } catch {
      // ignore storage errors
    }
    const meta = BUTTON_STYLE_OPTIONS.find((opt) => opt.id === next);
    showNotice(`Button surface layout updated to "${meta?.title ?? next}".`);
  };

  const handleSaveMainOfficeSetting = async (override?: MainOfficeLocation) => {
    const candidate: MainOfficeLocation = override ?? {
      code: officeCodeDraft.trim().toUpperCase() || 'QVP',
      name: officeNameDraft.trim(),
      lat: Number(officeLatDraft),
      lon: Number(officeLonDraft),
    };

    if (!candidate.name) {
      showNotice('Enter a main office reference name (e.g. Quezon City).');
      return;
    }
    if (!isValidPhCoordinate(candidate.lat, candidate.lon)) {
      showNotice('Main office coordinates must be valid Philippine latitude (3°–23° N) and longitude (112°–130° E).');
      return;
    }

    setIsSavingMainOffice(true);
    try {
      const res = await fetch('/api/settings/main-office', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        mainOffice?: MainOfficeLocation;
        updatedAt?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.mainOffice) {
        throw new Error(data.error || 'Failed to save QVP main office location.');
      }
      applyUpdatedMainOffice(data.mainOffice, data.updatedAt ?? null, true);
      showNotice(
        `Main office (${data.mainOffice.code}) saved at ${data.mainOffice.lat.toFixed(4)}°N, ${data.mainOffice.lon.toFixed(4)}°E (${data.mainOffice.name}).`
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to save main office location.');
    } finally {
      setIsSavingMainOffice(false);
    }
  };

  const handleSyncOfficeFromQvpStation = async (stationCodeOverride?: string) => {
    const targetCode = (stationCodeOverride || officeCodeDraft.trim() || 'QVP').toUpperCase();
    const matchedStation =
      stations.find((s) => s.code.toUpperCase() === targetCode) ??
      (stationCodeOverride ? undefined : stations.find((s) => s.code.toUpperCase() === 'QVP'));
    if (!matchedStation) {
      showNotice(`Station "${targetCode}" was not found in the active PHILSTA station list.`);
      return;
    }
    const nextLabel =
      matchedStation.code.toUpperCase() === 'QVP'
        ? officeNameDraft.trim() || DEFAULT_MAIN_OFFICE.name
        : matchedStation.province || matchedStation.name;
    await handleSaveMainOfficeSetting({
      code: matchedStation.code,
      name: nextLabel,
      lat: matchedStation.lat,
      lon: matchedStation.lon,
    });
  };

  const handleResetMainOfficeSetting = async () => {
    setIsSavingMainOffice(true);
    try {
      const res = await fetch('/api/settings/main-office/reset', {
        method: 'POST',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        mainOffice?: MainOfficeLocation;
        updatedAt?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.mainOffice) {
        throw new Error(data.error || 'Failed to reset QVP main office location.');
      }
      applyUpdatedMainOffice(data.mainOffice, data.updatedAt ?? null, true);
      showNotice(
        `Main office reset to default ${data.mainOffice.code} (${data.mainOffice.lat.toFixed(4)}°N, ${data.mainOffice.lon.toFixed(4)}°E · ${data.mainOffice.name}).`
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed to reset main office location.');
    } finally {
      setIsSavingMainOffice(false);
    }
  };

  const handleLinkLocalDirectory = async () => {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      showNotice('Direct browser folder linking is unavailable in this browser; server directory saving remains active.');
      return;
    }
    try {
      const handle = await picker({ mode: 'readwrite' });
      localDirHandleRef.current = handle;
      setLocalDirName(handle.name);
      showNotice(`Linked local drive folder "${handle.name}" for mirrored .eqp saves.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('abort')) return;
      showNotice('Local folder picker is restricted inside embedded preview frames; saves are persisted on server storage.');
    }
  };

  const persistEqpToStorage = async (params: {
    snapshot: EQPEvent;
    drive: string;
    folderSegments: string[];
    filename: string;
    alsoDownloadLocal: boolean;
    closeExplorer?: boolean;
    nextActionAfterSave?: 'new' | 'open' | 'print' | null;
  }): Promise<boolean> => {
    const {
      snapshot,
      drive,
      folderSegments,
      filename,
      alsoDownloadLocal,
      closeExplorer = false,
      nextActionAfterSave = null,
    } = params;

    const normalizedDrive = normalizeSolutionDrive(drive);
    const fullPath = `${normalizedDrive}\\${folderSegments.join('\\')}\\${filename}`;
    const cityObj = snapshot.cities.find((c) => c.id === snapshot.selectedCityId);
    const townObj = snapshot.towns.find((t) => t.id === snapshot.selectedTownId);
    const genObj = snapshot.generators.find((g) => g.id === snapshot.selectedGeneratorId);

    const eqpContent = formatEqpFileContent({
      event: snapshot,
      filePath: fullPath,
      cityLabel: cityObj?.label ?? '',
      townLabel: townObj?.label ?? '',
      generatorLabel: genObj?.label ?? '',
    });

    const amplitudeMetadataPayload: AmplitudeSidecarPayload = {
      schemaVersion: 1,
      measurements: snapshot.amplitudeMeasurements ?? [],
      stationPickAnchors: buildStationPickAnchors(snapshot.picks),
      ...(snapshot.amplitudeAssociationIssues &&
      snapshot.amplitudeAssociationIssues.length > 0
        ? { associationIssues: snapshot.amplitudeAssociationIssues }
        : {}),
    };

    setIsSavingEqp(true);
    try {
      // If user linked a local Chromium directory handle, create nested folders and write .eqp + .meta.json files there too
      if (localDirHandleRef.current) {
        try {
          let dirHandle = localDirHandleRef.current;
          for (const seg of folderSegments) {
            dirHandle = await dirHandle.getDirectoryHandle(seg, { create: true });
          }
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(eqpContent);
          await writable.close();

          const hasLocalMeta =
            Boolean(snapshot.locationMetadata) ||
            Boolean(snapshot.magnitudeMetadata) ||
            snapshot.intensities.length > 0 ||
            amplitudeMetadataPayload.measurements.length > 0 ||
            (amplitudeMetadataPayload.associationIssues?.length ?? 0) > 0;
          if (hasLocalMeta) {
            const metaHandle = await dirHandle.getFileHandle(`${filename}.meta.json`, {
              create: true,
            });
            const metaWritable = await metaHandle.createWritable();
            await metaWritable.write(
              JSON.stringify(
                {
                  schemaVersion: 3,
                  filename,
                  savedAt: new Date().toISOString(),
                  ...(snapshot.locationMetadata
                    ? { locationMetadata: snapshot.locationMetadata }
                    : {}),
                  ...(snapshot.magnitudeMetadata
                    ? { magnitudeMetadata: snapshot.magnitudeMetadata }
                    : {}),
                  amplitudeMetadata: amplitudeMetadataPayload,
                },
                null,
                2
              )
            );
            await metaWritable.close();
          }
        } catch {
          // Non-fatal: continue with server-side save
        }
      }

      const resp = await fetch('/api/eqp/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drive: normalizedDrive,
          folderSegments,
          filename,
          content: eqpContent,
          snapshot,
          locationMetadata: snapshot.locationMetadata,
          magnitudeMetadata: snapshot.magnitudeMetadata,
          amplitudeMetadata: amplitudeMetadataPayload,
          trigger: activeSection === 'bulletin' ? 'bulletin' : 'save',
        }),
      });
      const result = (await resp.json()) as {
        ok?: boolean;
        folderCreated?: boolean;
        displayFolder?: string;
        displayPath?: string;
        historyEntry?: EqpHistoryEntry;
        error?: string;
      };

      if (!resp.ok || !result.ok) {
        showNotice(result.error ?? `Failed to write ${filename}`);
        return false;
      }

      if (alsoDownloadLocal) {
        const blob = new Blob([eqpContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      const savedSnapshot: EQPEvent = {
        ...snapshot,
        filename,
        filePath: result.displayPath ?? fullPath,
      };
      setEvents((prev) =>
        prev.map((ev) => (ev.id === snapshot.id ? savedSnapshot : ev))
      );
      setSavedSnapshotsById((prev) => ({ ...prev, [snapshot.id]: savedSnapshot }));
      setDirtyIds((prev) => ({ ...prev, [snapshot.id]: false }));
      await refreshSavedEqpFiles();
      await refreshEqpHistory();

      if (closeExplorer) {
        setSaveExplorerOpen(false);
        setPendingActionAfterSave(null);
      }

      showNotice(
        result.folderCreated
          ? `Created folder ${result.displayFolder ?? `${normalizedDrive}\\${folderSegments.join('\\')}`} and saved ${filename}`
          : `Saved EQ data to ${result.displayPath ?? fullPath}`
      );

      if (nextActionAfterSave === 'new') {
        createBlankEvent();
      } else if (nextActionAfterSave === 'open') {
        setOpenExplorerMode('eqp');
        setOpenExplorerOpen(true);
      } else if (nextActionAfterSave === 'print') {
        void handleDataPrint(savedSnapshot);
      }
      return true;
    } catch {
      showNotice(`Failed to reach storage server for ${fullPath}`);
      return false;
    } finally {
      setIsSavingEqp(false);
    }
  };

  const handleSaveNextBulletin = async () => {
    const nextBulletinNo = Math.max(1, Math.trunc(activeEvent.bulletinNo || 1)) + 1;
    const upgradedEvent: EQPEvent = {
      ...activeEvent,
      bulletinNo: nextBulletinNo,
    };
    const upgradedFreshness = inspectMagnitudeFreshness(
      upgradedEvent,
      upgradedEvent.magnitudeMetadata ?? activeEventMagnitudeMetadata,
      magnitudeSettings,
      stations
    );
    const target = buildEqpSaveTarget(upgradedEvent, solutionDrive, {
      freshness: upgradedFreshness,
    });
    await persistEqpToStorage({
      snapshot: upgradedEvent,
      drive: target.driveRoot,
      folderSegments: target.folderSegments,
      filename: target.filename,
      alsoDownloadLocal: false,
    });
  };

  const handleRecordHistoryCheckpointNow = async () => {
    await postEqpHistoryCheckpoint(
      activeEvent,
      activeSection === 'bulletin' ? 'bulletin' : 'save',
      undefined,
      'Manual version snapshot'
    );
    showNotice(`Recorded EQP history snapshot for ${activeEvent.filename || activeEvent.id}`);
  };

  const handleSaveEvent = (options?: {
    nextAction?: 'new' | 'open' | 'print' | null;
    openExplorer?: boolean;
  }) => {
    const nextAction = options?.nextAction ?? null;
    const shouldOpenExplorer =
      Boolean(options?.openExplorer) || (activeSection === 'locate' && eqpTab === 'data');
    if (shouldOpenExplorer) {
      setSaveExplorerMode('eqp');
      setPendingActionAfterSave(nextAction);
      setSaveExplorerOpen(true);
      return;
    }

    const snapshot = activeEvent;
    const target = buildEqpSaveTarget(snapshot, solutionDrive, {
      freshness: activeMagnitudeFreshness,
    });
    void persistEqpToStorage({
      snapshot,
      drive: target.driveRoot,
      folderSegments: target.folderSegments,
      filename: target.filename,
      alsoDownloadLocal: false,
      nextActionAfterSave: nextAction,
    });
  };

  const handleCancelExplorerSave = () => {
    setSaveExplorerOpen(false);
    setPendingActionAfterSave(null);
  };

  const resetTransientWorkspaceState = () => {
    setSelectedStation(null);
    setAmplitudeDrafts({});
    setAmplitudeModalPickId(null);
    setDismissedAmpIssueKey(null);
    setDraftPick(createEmptyDraftPick());
    setHoveredLegendBand(null);
    setDbSelectedStationCode(null);
    setMagnitudePopupOpen(false);
    setWorkspaceResetNonce((n) => n + 1);
    setActiveSection('locate');
    setEqpTab('data');
  };

  const activateLoadedEvent = (loaded: EQPEvent, noticeMsg: string) => {
    setEvents((prev) => {
      const existingIdx = prev.findIndex(
        (ev) =>
          ev.id === loaded.id ||
          (ev.filename.toLowerCase() === loaded.filename.toLowerCase() &&
            ev.filePath.toLowerCase() === loaded.filePath.toLowerCase())
      );
      if (existingIdx >= 0) {
        return prev.map((ev, idx) => (idx === existingIdx ? { ...loaded, id: ev.id } : ev));
      }
      return [loaded, ...prev];
    });
    const matchedExisting = events.find(
      (ev) =>
        ev.id === loaded.id ||
        (ev.filename.toLowerCase() === loaded.filename.toLowerCase() &&
          ev.filePath.toLowerCase() === loaded.filePath.toLowerCase())
    );
    const targetId = matchedExisting ? matchedExisting.id : loaded.id;
    setActiveEventId(targetId);
    setSavedSnapshotsById((prev) => ({ ...prev, [targetId]: { ...loaded, id: targetId } }));
    setDirtyIds((prev) => ({ ...prev, [targetId]: false }));
    clearEventUndoStack(targetId);
    resetTransientWorkspaceState();
    setOpenExplorerOpen(false);
    showNotice(noticeMsg);
  };

  const enrichLoadedEventWithPlaces = useCallback(
    (parsed: EQPEvent, catalog: NearestPlacesCatalog | null): EQPEvent => {
      if (!catalog || isEventUnlocated(parsed)) return parsed;
      const prevCity = parsed.cities.find((c) => c.id === parsed.selectedCityId) ?? null;
      const prevTown = parsed.towns.find((t) => t.id === parsed.selectedTownId) ?? null;
      const prevGen = parsed.generators.find((g) => g.id === parsed.selectedGeneratorId) ?? null;

      const resolved = computeNearestPlacesForEpicenter(
        parsed.lat,
        parsed.lon,
        catalog,
        {
          selectedCityName: prevCity?.name ?? null,
          selectedTownName: prevTown?.name ?? null,
          selectedGeneratorName: prevGen?.name ?? null,
        },
        mainOfficeRef.current
      );

      const hasMatchingCity =
        !prevCity ||
        resolved.cities.some((c) => c.name.toLowerCase() === prevCity.name.toLowerCase());
      const hasMatchingTown =
        !prevTown ||
        resolved.towns.some((t) => t.name.toLowerCase() === prevTown.name.toLowerCase());
      const hasMatchingGen =
        !prevGen ||
        resolved.generators.some((g) => g.name.toLowerCase() === prevGen.name.toLowerCase());

      return {
        ...parsed,
        centralOfficeBearing: parsed.centralOfficeBearing || resolved.centralOfficeBearing,
        cities: hasMatchingCity ? resolved.cities : [prevCity, ...resolved.cities],
        selectedCityId: hasMatchingCity ? resolved.selectedCityId : prevCity.id,
        towns: hasMatchingTown ? resolved.towns : [prevTown, ...resolved.towns],
        selectedTownId: hasMatchingTown ? resolved.selectedTownId : prevTown.id,
        generators: hasMatchingGen ? resolved.generators : [prevGen, ...resolved.generators],
        selectedGeneratorId: hasMatchingGen ? resolved.selectedGeneratorId : prevGen.id,
      };
    },
    []
  );

  const handleOpenDiskEqpFile = async (
    relPath: string,
    displayPath: string,
    filename: string
  ) => {
    setIsOpeningEqp(true);
    try {
      const resp = await fetch(`/api/eqp/read?relPath=${encodeURIComponent(relPath)}`);
      const data = (await resp.json()) as {
        ok?: boolean;
        filename?: string;
        displayPath?: string;
        content?: string;
        locationMetadata?: EQPEvent['locationMetadata'] | null;
        magnitudeMetadata?: EQPEvent['magnitudeMetadata'] | null;
        amplitudeMetadata?: AmplitudeSidecarPayload | null;
        sidecarMalformed?: boolean;
        sidecarWarning?: string;
        intensityMetadata?: {
          intensities?: EQPEvent['intensities'];
          intensityBulletinOverride?: string;
          rawIntensityImportText?: string;
          feltStatusOverride?: boolean;
        } | null;
        error?: string;
      };
      if (!resp.ok || !data.ok || typeof data.content !== 'string') {
        showNotice(data.error ?? `Unable to read ${filename}`);
        return;
      }
      const parsed = parseEqpFileContent({
        content: data.content,
        filename: data.filename ?? filename,
        displayPath: data.displayPath ?? displayPath,
        fallbackDrive: solutionDrive,
        stations,
      });
      const withMeta: EQPEvent = {
        ...parsed,
        ...(data.locationMetadata ? { locationMetadata: data.locationMetadata } : {}),
        ...(data.magnitudeMetadata ? { magnitudeMetadata: data.magnitudeMetadata } : {}),
        ...(data.intensityMetadata?.intensities
          ? { intensities: data.intensityMetadata.intensities }
          : {}),
        ...(data.intensityMetadata?.intensityBulletinOverride !== undefined
          ? { intensityBulletinOverride: data.intensityMetadata.intensityBulletinOverride }
          : {}),
        ...(data.intensityMetadata?.rawIntensityImportText !== undefined
          ? { rawIntensityImportText: data.intensityMetadata.rawIntensityImportText }
          : {}),
        ...(data.intensityMetadata?.feltStatusOverride !== undefined
          ? { feltStatusOverride: data.intensityMetadata.feltStatusOverride }
          : {}),
      };
      const reconciledAmpEvent = data.amplitudeMetadata
        ? reconcileLoadedAmplitudeSidecar(withMeta, data.amplitudeMetadata)
        : withMeta;
      const catalog = placesCatalogRef.current ?? (await ensurePlacesCatalog());
      const enriched = enrichLoadedEventWithPlaces(reconciledAmpEvent, catalog);
      const loadedWithBaseline: EQPEvent = {
        ...enriched,
        historicalMagnitudeBaseline: computeHistoricalBaselineFingerprint(enriched, stations),
        magnitudeMetadata: data.magnitudeMetadata
          ? {
              ...data.magnitudeMetadata,
              originState: 'historical_saved',
            }
          : buildHistoricalSavedMagnitudeMetadata({ event: enriched }),
      };
      const ampIssueCount = loadedWithBaseline.amplitudeAssociationIssues?.length ?? 0;
      const openMsg = data.sidecarMalformed
        ? `Opened ${data.displayPath ?? displayPath} — Warning: ${data.sidecarWarning || 'sidecar .meta.json malformed'}`
        : ampIssueCount > 0
          ? `Opened ${data.displayPath ?? displayPath} (${ampIssueCount} amplitude association warning(s) require review)`
          : `Opened ${data.displayPath ?? displayPath}`;
      activateLoadedEvent(loadedWithBaseline, openMsg);
    } catch {
      showNotice(`Failed to load ${filename} from solution storage`);
    } finally {
      setIsOpeningEqp(false);
    }
  };

  const handleOpenCatalogEvent = (eventId: string) => {
    const target = events.find((ev) => ev.id === eventId);
    if (!target) return;
    setActiveEventId(target.id);
    setDirtyIds((prev) => ({ ...prev, [target.id]: false }));
    resetTransientWorkspaceState();
    setOpenExplorerOpen(false);
    showNotice(`Opened ${target.filePath || target.filename}`);
  };

  const handleOpenLocalEqpFile = async (file: File) => {
    setIsOpeningEqp(true);
    try {
      const content = await file.text();
      const targetDrive = normalizeSolutionDrive(solutionDrive);
      const parsed = parseEqpFileContent({
        content,
        filename: file.name,
        displayPath: `${targetDrive}\\EARTHQUAKE\\SOLUTION_EQ\\${file.name}`,
        fallbackDrive: solutionDrive,
        stations,
      });
      const catalog = placesCatalogRef.current ?? (await ensurePlacesCatalog());
      const enriched = enrichLoadedEventWithPlaces(parsed, catalog);
      const loadedWithBaseline: EQPEvent = {
        ...enriched,
        historicalMagnitudeBaseline: computeHistoricalBaselineFingerprint(enriched, stations),
        magnitudeMetadata: buildHistoricalSavedMagnitudeMetadata({ event: enriched }),
      };
      activateLoadedEvent(loadedWithBaseline, `Opened local file ${file.name}`);
    } catch {
      showNotice(`Failed to parse local .eqp file ${file.name}`);
    } finally {
      setIsOpeningEqp(false);
    }
  };

  const handleCancelExplorerOpen = () => {
    if (isOpeningEqp || isOpeningBulletin || isOpeningPrimer) return;
    setOpenExplorerOpen(false);
  };

  const createBlankEvent = (options?: { discardId?: string }) => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    const sec = String(now.getUTCSeconds()).padStart(2, '0');

    const lstDateObj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const lstYyyy = lstDateObj.getUTCFullYear();
    const lstMm = String(lstDateObj.getUTCMonth() + 1).padStart(2, '0');
    const lstDd = String(lstDateObj.getUTCDate()).padStart(2, '0');
    const lstHh = String(lstDateObj.getUTCHours()).padStart(2, '0');
    const lstMin = String(lstDateObj.getUTCMinutes()).padStart(2, '0');

    const baseId = `${yyyy}_${mm}${dd}_${hh}${min}`;
    const hasCollision = events.some((ev) => ev.id === baseId);
    const id = hasCollision ? `${baseId}_${sec}` : baseId;

    const blankDraft: EQPEvent = {
      id,
      filename: '',
      filePath: '',
      version: '11.20a',
      bulletinNo: 1,
      originDateGmt: `${yyyy}-${mm}-${dd}`,
      originTimeGmt: `${hh}:${min}:00.00`,
      originDateLst: `${lstYyyy}-${lstMm}-${lstDd}`,
      originTimeLst: `${lstHh}:${lstMin}:00.00`,
      lat: 0,
      lon: 0,
      depthKm: 0,
      trialDepthKm: 30.0,
      iterations: 0,
      errLatDeg: 0,
      errLonDeg: 0,
      errKm: 0,
      rmsSec: 0,
      preferredScale: 'Ms',
      ms: 0,
      mb: 0,
      md: 0,
      centralOfficeBearing: '',
      cities: [],
      selectedCityId: '',
      towns: [],
      selectedTownId: '',
      primaryHeadline: 'city',
      generators: [],
      selectedGeneratorId: '',
      picks: [],
      intensities: [],
      expectingDamage: false,
      expectingAftershocks: false,
      originType: 'TECTONIC',
      tsunamiStatus: 'None',
      issuedDate: '',
      issuedTime: '',
      issuedBy: 'Duty Seismologist',
      webPublished: false,
      remarks: '',
      magnitudeHistory: [],
      amplitudeMeasurements: [],
    };
    const blankTarget = buildEqpSaveTarget(blankDraft, solutionDrive);
    const blank: EQPEvent = {
      ...blankDraft,
      filename: blankTarget.filename,
      filePath: blankTarget.fullPath,
    };

    const discardId = options?.discardId;
    const savedBaseline = discardId ? savedSnapshotsById[discardId] : undefined;
    setEvents((prev) => {
      const cleaned = discardId
        ? savedBaseline
          ? prev.map((ev) => (ev.id === discardId ? savedBaseline : ev))
          : prev.filter((ev) => ev.id !== discardId)
        : prev;
      return [blank, ...cleaned];
    });
    setActiveEventId(blank.id);
    setDirtyIds((prev) => {
      const next = { ...prev, [blank.id]: false };
      if (discardId) next[discardId] = false;
      return next;
    });
    setSelectedStation(null);
    setAmplitudeDrafts({});
    setAmplitudeModalPickId(null);
    setDismissedAmpIssueKey(null);
    setDraftPick(createEmptyDraftPick());
    setHoveredLegendBand(null);
    setDbSelectedStationCode(null);
    setMagnitudePopupOpen(false);
    setWorkspaceResetNonce((n) => n + 1);
    setConfirmUnsavedAction(null);
    setToolbarPromptAction(null);
    setActiveSection('locate');
    setEqpTab('data');
    showNotice(`Cleared workspace — ready for new earthquake event ${blank.filename}`);
  };

  const discardCurrentEventEdits = (): EQPEvent => {
    const targetId = activeEvent.id;
    const savedBaseline = savedSnapshotsById[targetId];
    const revertedEvent: EQPEvent = savedBaseline
      ? savedBaseline
      : {
          ...activeEvent,
          lat: 0,
          lon: 0,
          depthKm: 0,
          trialDepthKm: 30.0,
          iterations: 0,
          errLatDeg: 0,
          errLonDeg: 0,
          errKm: 0,
          rmsSec: 0,
          ms: 0,
          mb: 0,
          md: 0,
          centralOfficeBearing: '',
          cities: [],
          selectedCityId: '',
          towns: [],
          selectedTownId: '',
          primaryHeadline: 'city',
          generators: [],
          selectedGeneratorId: '',
          picks: [],
          intensities: [],
          expectingDamage: false,
          expectingAftershocks: false,
          originType: 'TECTONIC',
          tsunamiStatus: 'None',
          remarks: '',
          magnitudeHistory: [],
          amplitudeMeasurements: [],
          amplitudeAssociationIssues: undefined,
        };

    setEvents((prev) => prev.map((ev) => (ev.id === targetId ? revertedEvent : ev)));
    setDirtyIds((prev) => ({ ...prev, [targetId]: false }));
    setEventRevisions((prev) => ({ ...prev, [targetId]: (prev[targetId] ?? 0) + 1 }));
    clearEventUndoStack(targetId);
    setCandidateSolution(null);
    setSelectedStation(null);
    setAmplitudeDrafts({});
    setAmplitudeModalPickId(null);
    setDismissedAmpIssueKey(null);
    setDraftPick(createEmptyDraftPick());
    setWorkspaceResetNonce((n) => n + 1);
    setConfirmUnsavedAction(null);
    setToolbarPromptAction(null);
    showNotice(
      savedBaseline
        ? `Discarded unsaved edits — restored ${revertedEvent.filename || targetId}`
        : `Discarded unsaved edits in ${revertedEvent.filename || targetId}`
    );
    return revertedEvent;
  };

  const discardCurrentEventAndCreateNew = () => {
    createBlankEvent({ discardId: activeEvent.id });
  };

  const handleRequestNewEvent = (source: 'toolbar' | 'menu' = 'menu') => {
    if (isCurrentEventEdited) {
      if (source === 'toolbar') {
        setToolbarPromptAction((curr) => (curr === 'new' ? null : 'new'));
      } else {
        setToolbarPromptAction(null);
        setConfirmUnsavedScope('event');
        setConfirmUnsavedAction('new');
      }
    } else {
      setToolbarPromptAction(null);
      createBlankEvent();
    }
  };

  const handleRequestOpenEvent = (source: 'toolbar' | 'menu' = 'menu') => {
    if (isCurrentEventEdited) {
      if (source === 'toolbar') {
        setToolbarPromptAction((curr) => (curr === 'open' ? null : 'open'));
      } else {
        setToolbarPromptAction(null);
        setConfirmUnsavedScope('event');
        setConfirmUnsavedAction('open');
      }
    } else {
      setToolbarPromptAction(null);
      setOpenExplorerMode('eqp');
      setOpenExplorerOpen(true);
    }
  };

  const handleRequestDataPrint = (source: 'toolbar' | 'menu' = 'menu') => {
    if (isCurrentEventEdited) {
      if (source === 'toolbar') {
        setToolbarPromptAction((curr) => (curr === 'print' ? null : 'print'));
      } else {
        setToolbarPromptAction(null);
        setConfirmUnsavedScope('event');
        setConfirmUnsavedAction('print');
      }
    } else {
      setToolbarPromptAction(null);
      void handleDataPrint();
    }
  };

  const handleDownloadEqp = () => {
    const target = buildEqpSaveTarget(activeEvent, solutionDrive, {
      freshness: activeMagnitudeFreshness,
    });
    const content = formatEqpFileContent({
      event: activeEvent,
      filePath: target.fullPath,
      cityLabel: selectedCity?.label ?? '',
      townLabel: selectedTown?.label ?? '',
      generatorLabel: selectedGenerator?.label ?? '',
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = target.filename;
    a.click();
    URL.revokeObjectURL(url);
    const structuredAmpCount = activeEvent.amplitudeMeasurements?.length ?? 0;
    showNotice(
      structuredAmpCount > 0
        ? `Exported legacy ${target.filename} (plain .eqp text only; excludes ${structuredAmpCount} structured amplitude record(s) in .eqp.meta.json)`
        : `Exported legacy ${target.filename} (.eqp text only; excludes .eqp.meta.json sidecar)`
    );
  };

  const handleBulletinHtmlProviderChange = useCallback((getter: (() => string) | null) => {
    bulletinHtmlGetterRef.current = getter;
  }, []);

  const handlePrimaryMapSnapshotProviderReady = useCallback(
    (provider: MapSnapshotProvider | null) => {
      primaryMapSnapshotProviderRef.current = provider;
    },
    []
  );

  const handleCompareMapSnapshotProviderReady = useCallback(
    (provider: MapSnapshotProvider | null) => {
      compareMapSnapshotProviderRef.current = provider;
    },
    []
  );

  const handleExportMapSnapshotPng = async () => {
    if (isExportingMapPng) return;
    setIsExportingMapPng(true);
    try {
      const isCompare =
        compareGmpeEnabled && Boolean(compareShakeMapData) && Boolean(compareShakeMapStats);
      const [primaryCapture, compareCapture] = await Promise.all([
        primaryMapSnapshotProviderRef.current
          ? primaryMapSnapshotProviderRef.current()
          : Promise.resolve(null),
        isCompare && compareMapSnapshotProviderRef.current
          ? compareMapSnapshotProviderRef.current()
          : Promise.resolve(null),
      ]);

      const primaryMeta =
        GMPE_MODELS.find((m) => m.id === shakeMapData.gmpeId) ?? GMPE_MODELS[0];
      const compareMeta = compareShakeMapData
        ? GMPE_MODELS.find((m) => m.id === compareShakeMapData.gmpeId) ?? GMPE_MODELS[0]
        : null;

      const panels =
        isCompare && compareShakeMapData
          ? [
              {
                titleBadge: 'Model A',
                subtitle: `${primaryMeta.shortName}${gmpeModel === 'auto' ? ' (Auto)' : ''} · PEIS ${shakeMapData.peakRoman} · ${shakeMapData.peakPgaPctG.toFixed(1)}%g`,
                shakeMap: shakeMapData,
                capture: primaryCapture,
              },
              {
                titleBadge: 'Model B',
                subtitle: `${compareMeta?.shortName ?? compareGmpeModel} · PEIS ${compareShakeMapData.peakRoman} · ${compareShakeMapData.peakPgaPctG.toFixed(1)}%g`,
                shakeMap: compareShakeMapData,
                capture: compareCapture,
              },
            ]
          : [
              {
                shakeMap: shakeMapData,
                capture: primaryCapture,
              },
            ];

      const res = await exportMapSnapshotPng({
        event: activeEvent,
        stations,
        selectedStation,
        basemapLabel: getBasemapMeta(basemapId).label,
        viewDimension,
        mapStyleMode,
        viewport: sharedViewport,
        showFaults: mapShowFaults,
        showVolcanoes: mapShowVolcanoes,
        showPlates: mapShowPlates,
        showStations: mapShowStations,
        showGrid: mapShowGrid,
        regionFilter: mapRegionFilter,
        showShakeMap: mapShowShakeMap,
        shakeMapOpacity,
        visibleShakeBands,
        highlightedShakeBand: shakeAutoHighlight ? hoveredLegendBand : null,
        mainOffice,
        showRangeRings: mapShowRangeRings,
        showNearestPlaces: mapShowNearestPlaces,
        nearestCitiesPins,
        showCatalogEvents: mapShowCatalogEvents,
        catalogEvents: events,
        rulerPoints: mapRulerPoints,
        rulerMeasurement,
        comparisonMarkers: mapComparisonMarkers,
        geologyVisibility,
        gisActiveFaultsData,
        gisTrenchData,
        timelineEvents: showEpicenterTimeline ? visibleTimelineEvents : [],
        showTimelineMigration: showEpicenterTimeline && timelineShowMigration,
        selectedTimelineEventId,
        showSeismicityTrendOverlay,
        historicalTrendEvents,
        panels,
      });

      showNotice(
        `Exported ${res.filename} (${res.width}×${res.height} px)${
          res.usedVectorFallbackForGoogle
            ? ' — rendered synchronized cartographic vector snapshot for Google Maps viewport'
            : ''
        }`
      );
    } catch (err) {
      showNotice(
        err instanceof Error ? `Map PNG export failed: ${err.message}` : 'Map PNG export failed'
      );
    } finally {
      setIsExportingMapPng(false);
    }
  };

  const captureBulletinBaselineIfNeeded = (
    targetId: string,
    ev: EQPEvent,
    printSource: boolean
  ) => {
    if (bulletinBaselineByIdRef.current[targetId]) return;
    bulletinBaselineByIdRef.current[targetId] = {
      originType: ev.originType ?? 'TECTONIC',
      expectingDamage: Boolean(ev.expectingDamage),
      expectingAftershocks: Boolean(ev.expectingAftershocks),
      printSource: Boolean(printSource),
      issuedDate: ev.issuedDate ?? '',
      issuedTime: ev.issuedTime ?? '',
      issuedBy: ev.issuedBy ?? '',
      bulletinNo: Math.max(1, Math.trunc(ev.bulletinNo || 1)),
      bulletinNote1: ev.bulletinNote1 ?? '',
      bulletinNote2: ev.bulletinNote2 ?? '',
    };
  };

  const handleUpdateBulletinEvent = (updater: (ev: EQPEvent) => EQPEvent) => {
    const targetId = activeEvent.id;
    captureBulletinBaselineIfNeeded(targetId, activeEvent, bulletinWithFault);
    if (openedBulletin) {
      setOpenedBulletin(null);
    }
    updateActiveEvent(updater, false);
    setBulletinDirtyIds((prev) => ({ ...prev, [targetId]: true }));
  };

  const handleChangeBulletinPrintSource = (nextValue: boolean) => {
    const targetId = activeEvent.id;
    captureBulletinBaselineIfNeeded(targetId, activeEvent, bulletinWithFault);
    if (openedBulletin) {
      setOpenedBulletin(null);
    }
    setBulletinWithFault(nextValue);
    setBulletinDirtyIds((prev) => ({ ...prev, [targetId]: true }));
  };

  const createNewBulletinDraft = () => {
    const targetId = activeEvent.id;
    const freshDefaults = {
      originType: 'TECTONIC' as EarthquakeOriginType,
      expectingDamage: false,
      expectingAftershocks: false,
      printSource: false,
      issuedDate: '',
      issuedTime: '',
      issuedBy: 'Duty Seismologist',
      bulletinNo: 1,
      bulletinNote1: '',
      bulletinNote2: '',
    };
    const nextEvent: EQPEvent = {
      ...activeEvent,
      originType: freshDefaults.originType,
      expectingDamage: freshDefaults.expectingDamage,
      expectingAftershocks: freshDefaults.expectingAftershocks,
      issuedDate: freshDefaults.issuedDate,
      issuedTime: freshDefaults.issuedTime,
      issuedBy: freshDefaults.issuedBy,
      bulletinNo: freshDefaults.bulletinNo,
      bulletinNote1: freshDefaults.bulletinNote1,
      bulletinNote2: freshDefaults.bulletinNote2,
    };
    setEvents((prev) => prev.map((ev) => (ev.id === targetId ? nextEvent : ev)));
    setBulletinWithFault(freshDefaults.printSource);
    bulletinBaselineByIdRef.current[targetId] = freshDefaults;
    setOpenedBulletin(null);
    setBulletinDirtyIds((prev) => ({ ...prev, [targetId]: false }));
    setSavedBulletinTargetsById((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setToolbarPromptAction(null);
    setConfirmUnsavedAction(null);
    const freshTarget = buildBulletinSaveTarget(nextEvent, solutionDrive);
    showNotice(`Ready for new bulletin draft (${freshTarget.filename})`);
  };

  const discardBulletinEdits = () => {
    const targetId = activeEvent.id;
    const baseline = bulletinBaselineByIdRef.current[targetId];
    if (baseline) {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === targetId
            ? {
                ...ev,
                originType: baseline.originType,
                expectingDamage: baseline.expectingDamage,
                expectingAftershocks: baseline.expectingAftershocks,
                issuedDate: baseline.issuedDate,
                issuedTime: baseline.issuedTime,
                issuedBy: baseline.issuedBy,
                bulletinNo: baseline.bulletinNo,
                bulletinNote1: baseline.bulletinNote1,
                bulletinNote2: baseline.bulletinNote2,
              }
            : ev
        )
      );
      setBulletinWithFault(baseline.printSource);
    }
    setBulletinDirtyIds((prev) => ({ ...prev, [targetId]: false }));
    setToolbarPromptAction(null);
    setConfirmUnsavedAction(null);
    showNotice(`Discarded unsaved edits in bulletin ${displayedBulletinFilename}`);
  };

  const getCurrentDisplayedBulletinHtml = (): string => {
    if (openedBulletin?.htmlContent) {
      return openedBulletin.htmlContent;
    }
    if (bulletinHtmlGetterRef.current) {
      const html = bulletinHtmlGetterRef.current();
      if (html) return html;
    }
    return buildBulletinHtmlDocument({
      event: activeEvent,
      primaryLocationLabel,
      faultGeneratorLabel: selectedGenerator?.label ?? null,
      printSource: bulletinWithFault,
      freshness: activeMagnitudeFreshness,
    });
  };

  const persistBulletinToStorage = async (params: {
    drive: string;
    folderSegments: string[];
    filename: string;
    htmlContent: string;
    alsoDownloadLocal: boolean;
    closeExplorer?: boolean;
    nextActionAfterSave?: 'new' | 'open' | 'print' | null;
  }): Promise<boolean> => {
    const {
      drive,
      folderSegments,
      filename,
      htmlContent,
      alsoDownloadLocal,
      closeExplorer = false,
      nextActionAfterSave = null,
    } = params;

    const normalizedDrive = normalizeSolutionDrive(drive);
    const fullPath = `${normalizedDrive}\\${folderSegments.join('\\')}\\${filename}`;
    setIsSavingBulletin(true);
    try {
      if (localDirHandleRef.current) {
        try {
          let dirHandle = localDirHandleRef.current;
          const rootName = dirHandle.name.toLowerCase();
          let startIdx = 0;
          const matchIdx = folderSegments.findIndex((seg) => seg.toLowerCase() === rootName);
          if (matchIdx >= 0) {
            startIdx = matchIdx + 1;
          }
          for (const seg of folderSegments.slice(startIdx)) {
            dirHandle = await dirHandle.getDirectoryHandle(seg, { create: true });
          }
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(htmlContent);
          await writable.close();
        } catch {
          // Non-fatal: continue with server-side save
        }
      }

      const resp = await fetch('/api/bulletin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drive: normalizedDrive,
          folderSegments,
          filename,
          content: htmlContent,
          eventId: activeEvent.id,
          bulletinNo: activeEvent.bulletinNo,
        }),
      });
      const result = (await resp.json()) as {
        ok?: boolean;
        folderCreated?: boolean;
        displayFolder?: string;
        displayPath?: string;
        relPath?: string;
        error?: string;
      };

      if (!resp.ok || !result.ok) {
        showNotice(result.error ?? `Failed to write bulletin ${filename}`);
        return false;
      }

      if (alsoDownloadLocal) {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      const finalPath = result.displayPath ?? fullPath;
      setSavedBulletinTargetsById((prev) => ({
        ...prev,
        [activeEvent.id]: { filename, fullPath: finalPath },
      }));
      setBulletinDirtyIds((prev) => ({ ...prev, [activeEvent.id]: false }));
      bulletinBaselineByIdRef.current[activeEvent.id] = {
        originType: activeEvent.originType ?? 'TECTONIC',
        expectingDamage: Boolean(activeEvent.expectingDamage),
        expectingAftershocks: Boolean(activeEvent.expectingAftershocks),
        printSource: Boolean(bulletinWithFault),
        issuedDate: activeEvent.issuedDate ?? '',
        issuedTime: activeEvent.issuedTime ?? '',
        issuedBy: activeEvent.issuedBy ?? '',
        bulletinNo: Math.max(1, Math.trunc(activeEvent.bulletinNo || 1)),
        bulletinNote1: activeEvent.bulletinNote1 ?? '',
        bulletinNote2: activeEvent.bulletinNote2 ?? '',
      };
      if (openedBulletin) {
        setOpenedBulletin({
          ...openedBulletin,
          filename,
          displayPath: finalPath,
          relPath: result.relPath ?? openedBulletin.relPath,
          htmlContent,
        });
      }

      await refreshSavedBulletinFiles();

      if (closeExplorer) {
        setSaveExplorerOpen(false);
        setPendingActionAfterSave(null);
      }

      showNotice(
        result.folderCreated
          ? `Created folder ${result.displayFolder ?? `${normalizedDrive}\\${folderSegments.join('\\')}`} and saved ${filename}`
          : `Saved bulletin to ${finalPath}`
      );

      if (nextActionAfterSave === 'new') {
        createNewBulletinDraft();
      } else if (nextActionAfterSave === 'open') {
        setOpenExplorerMode('bulletin');
        setOpenExplorerOpen(true);
      } else if (nextActionAfterSave === 'print') {
        printBulletinHtmlDocument(htmlContent);
      }
      return true;
    } catch {
      showNotice(`Failed to reach storage server for ${fullPath}`);
      return false;
    } finally {
      setIsSavingBulletin(false);
    }
  };

  const serializePrimerForDiskSave = (primer: PrimerDocument): PrimerDocument => {
    const sanitizedExtensions = primer.extensions
      ? {
          ...primer.extensions,
          ...(primer.extensions.epicenterFigure
            ? {
                epicenterFigure: {
                  ...primer.extensions.epicenterFigure,
                  pngDataUrl: undefined,
                },
              }
            : {}),
        }
      : undefined;
    return {
      ...primer,
      status: 'draft',
      updatedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
      extensions: sanitizedExtensions,
    };
  };

  const persistPrimerToStorage = async (params: {
    primer: PrimerDocument;
    drive: string;
    folderSegments: string[];
    filename: string;
    alsoDownloadLocal: boolean;
    closeExplorer?: boolean;
    nextActionAfterSave?: 'new' | 'open' | 'print' | null;
  }): Promise<boolean> => {
    const {
      primer,
      drive,
      folderSegments,
      filename,
      alsoDownloadLocal,
      closeExplorer = false,
      nextActionAfterSave = null,
    } = params;

    const normalizedDrive = normalizeSolutionDrive(drive);
    const fullPath = `${normalizedDrive}\\${folderSegments.join('\\')}\\${filename}`;
    const preparedDoc = serializePrimerForDiskSave(primer);
    const jsonContent = JSON.stringify(preparedDoc, null, 2);

    setIsSavingPrimer(true);
    try {
      if (localDirHandleRef.current) {
        try {
          let dirHandle = localDirHandleRef.current;
          const rootName = dirHandle.name.toLowerCase();
          let startIdx = 0;
          const matchIdx = folderSegments.findIndex((seg) => seg.toLowerCase() === rootName);
          if (matchIdx >= 0) {
            startIdx = matchIdx + 1;
          }
          for (const seg of folderSegments.slice(startIdx)) {
            dirHandle = await dirHandle.getDirectoryHandle(seg, { create: true });
          }
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonContent);
          await writable.close();
        } catch {
          // Non-fatal: continue with server-side save
        }
      }

      const resp = await fetch('/api/primer/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drive: normalizedDrive,
          folderSegments,
          filename,
          content: jsonContent,
          eventId: preparedDoc.eventId,
          primerId: preparedDoc.id,
          bulletinNo: preparedDoc.bulletinNo,
        }),
      });
      const result = (await resp.json()) as {
        ok?: boolean;
        folderCreated?: boolean;
        displayFolder?: string;
        displayPath?: string;
        relPath?: string;
        error?: string;
      };

      if (!resp.ok || !result.ok) {
        showNotice(result.error ?? `Failed to write primer ${filename}`);
        return false;
      }

      if (alsoDownloadLocal) {
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }

      const finalPath = result.displayPath ?? fullPath;
      setSavedPrimerTargetsById((prev) => ({
        ...prev,
        [preparedDoc.id]: { filename, fullPath: finalPath, primerId: preparedDoc.id },
      }));
      primerControllerRef.current?.markPrimerSaved(preparedDoc);
      await refreshSavedPrimerFiles();

      if (closeExplorer) {
        setSaveExplorerOpen(false);
        setPendingActionAfterSave(null);
      }

      showNotice(
        result.folderCreated
          ? `Created folder ${result.displayFolder ?? `${normalizedDrive}\\${folderSegments.join('\\')}`} and saved ${filename}`
          : `Saved primer to ${finalPath}`
      );

      if (nextActionAfterSave === 'new') {
        primerControllerRef.current?.createNewPrimer();
      } else if (nextActionAfterSave === 'open') {
        setOpenExplorerMode('primer');
        void refreshSavedPrimerFiles();
        setOpenExplorerOpen(true);
      }
      return true;
    } catch {
      showNotice(`Failed to reach storage server for ${fullPath}`);
      return false;
    } finally {
      setIsSavingPrimer(false);
    }
  };

  const handleConfirmExplorerSave = async (params: {
    drive: string;
    folderSegments: string[];
    filename: string;
    alsoDownloadLocal: boolean;
  }) => {
    if (saveExplorerMode === 'bulletin') {
      if (!openedBulletin) {
        const magRes = resolveBulletinMagnitude(activeEvent, activeMagnitudeFreshness);
        if (magRes.isStale || magRes.requiresAnalystConfirmation) {
          showNotice(
            magRes.warning ||
              'Recalculate or confirm the event magnitude before saving the bulletin.'
          );
          setSaveExplorerOpen(false);
          setPendingActionAfterSave(null);
          return;
        }
      }
      const htmlContent = getCurrentDisplayedBulletinHtml();
      await persistBulletinToStorage({
        drive: params.drive,
        folderSegments: params.folderSegments,
        filename: params.filename,
        htmlContent,
        alsoDownloadLocal: params.alsoDownloadLocal,
        closeExplorer: true,
        nextActionAfterSave: pendingActionAfterSave,
      });
      return;
    }

    if (saveExplorerMode === 'primer') {
      const currentPrimer = primerControllerRef.current?.getDisplayedPrimer();
      if (!currentPrimer) {
        showNotice('No primer has been created yet. Click New or Generate Primer first.');
        setSaveExplorerOpen(false);
        setPendingActionAfterSave(null);
        return;
      }
      await persistPrimerToStorage({
        primer: currentPrimer,
        drive: params.drive,
        folderSegments: params.folderSegments,
        filename: params.filename,
        alsoDownloadLocal: params.alsoDownloadLocal,
        closeExplorer: true,
        nextActionAfterSave: pendingActionAfterSave,
      });
      return;
    }

    await persistEqpToStorage({
      snapshot: activeEvent,
      drive: params.drive,
      folderSegments: params.folderSegments,
      filename: params.filename,
      alsoDownloadLocal: params.alsoDownloadLocal,
      closeExplorer: true,
      nextActionAfterSave: pendingActionAfterSave,
    });
  };

  const handleSaveBulletin = (options?: {
    nextAction?: 'new' | 'open' | 'print' | null;
  }) => {
    if (!openedBulletin) {
      const magRes = resolveBulletinMagnitude(activeEvent, activeMagnitudeFreshness);
      if (magRes.isStale || magRes.requiresAnalystConfirmation) {
        showNotice(
          magRes.warning ||
            'Recalculate or confirm the event magnitude before saving the bulletin.'
        );
        return;
      }
    }
    setSaveExplorerMode('bulletin');
    setPendingActionAfterSave(options?.nextAction ?? null);
    void refreshSavedBulletinFiles();
    setSaveExplorerOpen(true);
  };

  const handleOpenDiskBulletinFile = async (
    relPath: string,
    displayPath: string,
    filename: string
  ) => {
    setIsOpeningBulletin(true);
    try {
      const resp = await fetch(`/api/bulletin/read?relPath=${encodeURIComponent(relPath)}`);
      const data = (await resp.json()) as {
        ok?: boolean;
        filename?: string;
        displayPath?: string;
        relPath?: string;
        content?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok || typeof data.content !== 'string') {
        showNotice(data.error ?? `Unable to read bulletin ${filename}`);
        return;
      }
      const openedName = data.filename ?? filename;
      const openedPath = data.displayPath ?? displayPath;
      setOpenedBulletin({
        filename: openedName,
        displayPath: openedPath,
        relPath: data.relPath ?? relPath,
        htmlContent: data.content,
      });
      setBulletinDirtyIds((prev) => ({ ...prev, [activeEvent.id]: false }));
      setActiveSection('bulletin');
      if (eqpTab !== 'bulletin') {
        setEqpTab('bulletin');
      }
      setOpenExplorerOpen(false);
      showNotice(`Opened bulletin ${openedPath}`);
    } catch {
      showNotice(`Failed to load ${filename} from bulletin storage`);
    } finally {
      setIsOpeningBulletin(false);
    }
  };

  const handleOpenLocalBulletinFile = async (file: File) => {
    setIsOpeningBulletin(true);
    try {
      const htmlContent = await file.text();
      const targetDrive = normalizeSolutionDrive(solutionDrive);
      const displayPath = `${targetDrive}\\EARTHQUAKE\\BULLETIN_EQ\\${file.name}`;
      setOpenedBulletin({
        filename: file.name,
        displayPath,
        htmlContent,
      });
      setBulletinDirtyIds((prev) => ({ ...prev, [activeEvent.id]: false }));
      setActiveSection('bulletin');
      if (eqpTab !== 'bulletin') {
        setEqpTab('bulletin');
      }
      setOpenExplorerOpen(false);
      showNotice(`Opened local HTML bulletin ${file.name}`);
    } catch {
      showNotice(`Failed to read local HTML bulletin ${file.name}`);
    } finally {
      setIsOpeningBulletin(false);
    }
  };

  const handleRequestNewBulletin = (source: 'toolbar' | 'menu' = 'toolbar') => {
    if (isBulletinEdited) {
      if (source === 'toolbar') {
        setToolbarPromptAction((curr) => (curr === 'new' ? null : 'new'));
      } else {
        setToolbarPromptAction(null);
        setConfirmUnsavedScope('bulletin');
        setConfirmUnsavedAction('new');
      }
    } else {
      setToolbarPromptAction(null);
      createNewBulletinDraft();
    }
  };

  const handleRequestOpenBulletin = (source: 'toolbar' | 'menu' = 'toolbar') => {
    if (isBulletinEdited) {
      if (source === 'toolbar') {
        setToolbarPromptAction((curr) => (curr === 'open' ? null : 'open'));
      } else {
        setToolbarPromptAction(null);
        setConfirmUnsavedScope('bulletin');
        setConfirmUnsavedAction('open');
      }
    } else {
      setToolbarPromptAction(null);
      setOpenExplorerMode('bulletin');
      void refreshSavedBulletinFiles();
      setOpenExplorerOpen(true);
    }
  };

  const handlePrimerControllerReady = useCallback(
    (controller: PrimerPanelController | null) => {
      primerControllerRef.current = controller;
    },
    []
  );

  const handleConsumePendingPrimer = useCallback(() => {
    setPendingOpenedPrimer(null);
  }, []);

  const parseValidatedPrimerDocument = (rawJson: string): PrimerDocument | null => {
    try {
      const parsed = JSON.parse(rawJson) as Partial<PrimerDocument>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.id !== 'string' ||
        typeof parsed.eventId !== 'string' ||
        typeof parsed.title !== 'string' ||
        !Array.isArray(parsed.sections)
      ) {
        return null;
      }
      return {
        ...(parsed as PrimerDocument),
        status: 'draft',
      };
    } catch {
      return null;
    }
  };

  const activateOpenedPrimer = (
    primer: PrimerDocument,
    sourceLabel: string,
    diskInfo?: { filename: string; fullPath: string }
  ) => {
    if (diskInfo) {
      setSavedPrimerTargetsById((prev) => ({
        ...prev,
        [primer.id]: {
          filename: diskInfo.filename,
          fullPath: diskInfo.fullPath,
          primerId: primer.id,
        },
      }));
    }
    const matchingEvent = eventsRef.current.find((ev) => ev.id === primer.eventId);
    if (matchingEvent && activeEventIdRef.current !== matchingEvent.id) {
      setPendingOpenedPrimer(primer);
      setActiveEventId(matchingEvent.id);
    } else {
      setPendingOpenedPrimer(null);
      primerControllerRef.current?.loadOpenedPrimer(primer);
    }
    setActiveSection('primer');
    if (eqpTab !== 'primer') {
      setEqpTab('primer');
    }
    setOpenExplorerOpen(false);
    setToolbarPromptAction(null);
    setConfirmUnsavedAction(null);
    showNotice(`Opened saved primer: ${sourceLabel}`);
  };

  const handleSavePrimer = (options?: {
    nextAction?: 'new' | 'open' | 'print' | null;
  }) => {
    const currentPrimer = primerControllerRef.current?.getDisplayedPrimer();
    if (!currentPrimer) {
      showNotice('No primer has been created yet. Click New or Generate Primer first.');
      return;
    }
    setSaveExplorerMode('primer');
    setPendingActionAfterSave(options?.nextAction ?? null);
    void refreshSavedPrimerFiles();
    setSaveExplorerOpen(true);
  };

  const handleOpenDiskPrimerFile = async (
    relPath: string,
    displayPath: string,
    filename: string
  ) => {
    setIsOpeningPrimer(true);
    try {
      const resp = await fetch(`/api/primer/read?relPath=${encodeURIComponent(relPath)}`);
      const data = (await resp.json()) as {
        ok?: boolean;
        filename?: string;
        displayPath?: string;
        content?: string;
        error?: string;
      };
      if (!resp.ok || !data.ok || typeof data.content !== 'string') {
        showNotice(data.error ?? `Unable to read primer ${filename}`);
        return;
      }
      const parsed = parseValidatedPrimerDocument(data.content);
      if (!parsed) {
        showNotice(`Invalid Earthquake Primer JSON file: ${filename}`);
        return;
      }
      const openedName = data.filename ?? filename;
      const openedPath = data.displayPath ?? displayPath;
      activateOpenedPrimer(parsed, openedPath, {
        filename: openedName,
        fullPath: openedPath,
      });
    } catch {
      showNotice(`Failed to load ${filename} from primer storage`);
    } finally {
      setIsOpeningPrimer(false);
    }
  };

  const handleOpenPrimerDraft = (primerId: string) => {
    const drafts = loadSavedPrimerDrafts();
    const target = drafts.find((d) => d.id === primerId);
    if (!target) {
      showNotice('Selected saved primer draft is no longer available.');
      return;
    }
    activateOpenedPrimer(target, `${target.title} (Saved Browser Draft)`);
  };

  const handleOpenLocalPrimerFile = async (file: File) => {
    setIsOpeningPrimer(true);
    try {
      const raw = await file.text();
      const parsed = parseValidatedPrimerDocument(raw);
      if (!parsed) {
        showNotice(`Invalid local primer file ${file.name} (expected .primer.json format)`);
        return;
      }
      activateOpenedPrimer(parsed, file.name);
    } catch {
      showNotice(`Failed to read local primer file ${file.name}`);
    } finally {
      setIsOpeningPrimer(false);
    }
  };

  const handleRequestNewPrimer = (source: 'toolbar' | 'menu' = 'toolbar') => {
    if (primerPanelStatus.hasPrimer) {
      if (source === 'toolbar') {
        setToolbarPromptAction((curr) => (curr === 'new' ? null : 'new'));
      } else {
        setToolbarPromptAction(null);
        setConfirmUnsavedScope('primer');
        setConfirmUnsavedAction('new');
      }
    } else {
      setToolbarPromptAction(null);
      primerControllerRef.current?.createNewPrimer();
    }
  };

  const handleRequestOpenPrimer = (source: 'toolbar' | 'menu' = 'toolbar') => {
    if (isPrimerEdited) {
      if (source === 'toolbar') {
        setToolbarPromptAction((curr) => (curr === 'open' ? null : 'open'));
      } else {
        setToolbarPromptAction(null);
        setConfirmUnsavedScope('primer');
        setConfirmUnsavedAction('open');
      }
    } else {
      setToolbarPromptAction(null);
      setOpenExplorerMode('primer');
      void refreshSavedPrimerFiles();
      setOpenExplorerOpen(true);
    }
  };

  const handlePrintDisplayedBulletin = () => {
    if (!openedBulletin) {
      const magRes = resolveBulletinMagnitude(activeEvent, activeMagnitudeFreshness);
      if (magRes.isStale || magRes.requiresAnalystConfirmation) {
        showNotice(
          magRes.warning ||
            'Recalculate or confirm the event magnitude before printing the bulletin.'
        );
        return;
      }
    }
    const html = getCurrentDisplayedBulletinHtml();
    const ok = printBulletinHtmlDocument(html);
    if (ok) {
      showNotice(`Opened print dialog for bulletin ${displayedBulletinFilename}`);
    } else {
      showNotice('Unable to launch bulletin print preview in this browser frame.');
    }
  };

  const handleDownloadDisplayedBulletinHtml = () => {
    if (!openedBulletin) {
      const magRes = resolveBulletinMagnitude(activeEvent, activeMagnitudeFreshness);
      if (magRes.isStale || magRes.requiresAnalystConfirmation) {
        showNotice(
          magRes.warning ||
            'Recalculate or confirm the event magnitude before exporting HTML bulletin.'
        );
        return;
      }
    }
    const html = getCurrentDisplayedBulletinHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = displayedBulletinFilename;
    a.click();
    URL.revokeObjectURL(url);
    showNotice(`Exported HTML bulletin: ${displayedBulletinFilename}`);
  };

  const filteredCatalog = useMemo(() => {
    return events.filter((ev) => {
      const meta = ev.magnitudeMetadata;
      const mag =
        meta && meta.preferredMethodId !== 'eqp-legacy-ms'
          ? meta.selectedMagnitude ?? 0
          : ev.preferredScale === 'Ms'
            ? ev.ms
            : ev.preferredScale === 'Mb'
              ? ev.mb
              : ev.md;
      if (mag < catalogMinMag) return false;
      if (catalogFeltOnly && !hasEventFeltDesignation(ev)) return false;
      if (catalogSearch.trim() !== '') {
        const q = catalogSearch.toLowerCase();
        const cityMatch = ev.cities.some((c) => c.label.toLowerCase().includes(q));
        const townMatch = ev.towns.some((t) => t.label.toLowerCase().includes(q));
        const fileMatch = ev.filename.toLowerCase().includes(q);
        if (!cityMatch && !townMatch && !fileMatch) return false;
      }
      return true;
    });
  }, [events, catalogMinMag, catalogFeltOnly, catalogSearch]);

  const filteredStations = useMemo(() => {
    const q = stationSearch.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.province.toLowerCase().includes(q) ||
        (s.volcanoName ?? '').toLowerCase().includes(q)
    );
  }, [stations, stationSearch]);

  const handleUpdateStation = async (
    code: string,
    patch: Partial<StationMetaRecord> & { resolveIssueId?: string }
  ) => {
    const res = await fetch(`/api/stations/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      stations?: StationMeta[];
      issues?: StationDataIssue[];
      source?: string;
      updatedAt?: string;
    };
    if (!res.ok || !data.ok) {
      showNotice(data.error || `Failed to update station ${code}`);
      return;
    }
    applyStationCatalogPayload(data);
    showNotice(`Saved calibration for station ${code}`);
  };

  const handleAddStation = async (station: Partial<StationMetaRecord>) => {
    const res = await fetch('/api/stations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert_station', station }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      stations?: StationMeta[];
      issues?: StationDataIssue[];
      source?: string;
      updatedAt?: string;
    };
    if (!res.ok || !data.ok) {
      showNotice(data.error || 'Failed to add station');
      return;
    }
    applyStationCatalogPayload(data);
    showNotice(`Added station ${station.code ?? ''} to catalog`);
  };

  const handleDeleteStation = async (code: string): Promise<StationMetaRecord | null> => {
    const res = await fetch(`/api/stations/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      deletedStation?: StationMetaRecord;
      stations?: StationMeta[];
      issues?: StationDataIssue[];
      source?: string;
      updatedAt?: string;
    };
    if (!res.ok || !data.ok) {
      showNotice(data.error || `Failed to delete station ${code}`);
      return null;
    }
    applyStationCatalogPayload(data);
    if (dbSelectedStationCode === code) {
      setDbSelectedStationCode(null);
    }
    showNotice(`Deleted station ${code}`);
    return data.deletedStation ?? null;
  };

  const handleImportPhilsta = async (
    rawText: string,
    fileName: string,
    mode: 'merge' | 'replace'
  ) => {
    const res = await fetch('/api/stations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'import_philsta',
        rawText,
        mode,
        sourceName: fileName,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      importedCount?: number;
      stations?: StationMeta[];
      issues?: StationDataIssue[];
      source?: string;
      updatedAt?: string;
    };
    if (!res.ok || !data.ok) {
      showNotice(data.error || 'Failed to import PHILSTA file');
      return;
    }
    applyStationCatalogPayload(data);
    showNotice(`Imported ${data.importedCount ?? 0} stations from ${fileName}`);
  };

  const handleResetStationCatalog = async () => {
    const res = await fetch('/api/stations/reset', { method: 'POST' });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      stations?: StationMeta[];
      issues?: StationDataIssue[];
      source?: string;
      updatedAt?: string;
    };
    if (!res.ok || !data.ok) {
      showNotice(data.error || 'Failed to reset station catalog');
      return;
    }
    applyStationCatalogPayload(data);
    showNotice('Re-seeded station catalog from PHILSTA-main');
  };

  const isFelt = hasEventFeltDesignation(activeEvent);

  const eventContextText = useMemo(() => {
    const cityLabel =
      activeEvent.cities.find((c) => c.id === activeEvent.selectedCityId)?.label ?? 'None';
    const townLabel =
      activeEvent.towns.find((t) => t.id === activeEvent.selectedTownId)?.label ?? 'None';
    const genLabel =
      activeEvent.generators.find((g) => g.id === activeEvent.selectedGeneratorId)?.label ?? 'None';
    const picksSummary =
      activeEvent.picks
        .map(
          (p) =>
            `${p.sta}(Δ=${p.delta.toFixed(2)}°, az=${p.azim.toFixed(1)}°, resP=${p.resP.toFixed(2)}s${p.pExcluded ? '[EXCL]' : ''}, resS=${p.resS.toFixed(2)}s${p.sExcluded ? '[EXCL]' : ''}, Ms=${p.ms ?? '-'}, Mb=${p.mb ?? '-'}, Md=${p.md ?? '-'})`
        )
        .join('; ') || 'No station picks yet';
    const peisSummary =
      activeEvent.intensities
        .map(
          (i) =>
            `${i.category === 'instrumental' ? 'Instrumental ' : ''}Intensity ${i.peis}: ${i.locality}`
        )
        .join('; ') || 'None';
    const unlocated = isEventUnlocated(activeEvent);

    return [
      `Filename: ${activeEvent.filename}`,
      `Origin GMT: ${activeEvent.originDateGmt} ${activeEvent.originTimeGmt} | LST: ${activeEvent.originDateLst} ${activeEvent.originTimeLst}`,
      unlocated
        ? 'Hypocenter: Pending location (awaiting phase picks)'
        : `Hypocenter: ${activeEvent.lat.toFixed(3)}°N, ${activeEvent.lon.toFixed(3)}°E, Depth ${activeEvent.depthKm.toFixed(1)} km`,
      unlocated
        ? 'Solution Quality: Unlocated (0 iterations)'
        : `Solution Quality: Iterations=${activeEvent.iterations}, RMS=${activeEvent.rmsSec.toFixed(2)}s, ERH=±${activeEvent.errKm.toFixed(2)} km`,
      `Magnitudes: Preferred=${formatLegacyScaleShort(activeEvent.preferredScale)}, Ms=${activeEvent.ms.toFixed(1)}, Mb=${activeEvent.mb.toFixed(1)}, ML=${activeEvent.md.toFixed(1)}`,
      `Locations: Central=${activeEvent.centralOfficeBearing || 'Pending'} | City=${cityLabel} | Town=${townLabel} | Generator=${genLabel}`,
      `Intensities: ${peisSummary} | Tsunami=${activeEvent.tsunamiStatus}`,
      `Station Picks: ${picksSummary}`,
    ].join('\n');
  }, [activeEvent]);

  const gmtDateParts = activeEvent.originDateGmt.split('-');
  const gmtTimeParts = activeEvent.originTimeGmt.split(':');
  const lstDateParts = activeEvent.originDateLst.split('-');
  const lstTimeParts = activeEvent.originTimeLst.split(':');

  const navigateEqpModule = (
    section: NavSectionId,
    tab:
      | 'data'
      | 'map'
      | 'intensity'
      | 'bulletin'
      | 'primer'
      | 'social-media'
      | 'database'
      | 'utils'
      | 'eqp-history'
      | 'tsunami'
      | 'research'
      | 'settings'
  ) => {
    setActiveSection(section);
    setEqpTab(tab);
    setSidebarOpen(false);
    if (tab === 'eqp-history') {
      void refreshSavedEqpFiles();
      void refreshEqpHistory();
    } else if (tab === 'bulletin' || tab === 'social-media') {
      void refreshSavedBulletinFiles();
    } else if (section === 'magnitude' || tab === 'intensity') {
      void ensurePlacesCatalog();
    } else if (section === 'primer' || tab === 'primer') {
      void ensurePlacesCatalog();
      void ensureGisManifestLoaded();
      void refreshSavedPrimerFiles();
    } else if (section === 'settings' || tab === 'settings') {
      void refreshSavedEqpFiles();
      void refreshSavedBulletinFiles();
      void refreshSavedPrimerFiles();
    }
  };

  const handleTriggerPrintBulletin = () => {
    const magRes = resolveBulletinMagnitude(activeEvent, activeMagnitudeFreshness);
    if (magRes.isStale || magRes.requiresAnalystConfirmation) {
      showNotice(
        magRes.warning ||
          'Recalculate or confirm the event magnitude before generating the PDF bulletin.'
      );
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const pdfName = downloadBulletinPdf({
        event: activeEvent,
        primaryLocationLabel,
        faultGeneratorLabel: selectedGenerator?.label ?? null,
        includeFaultGenerator: bulletinWithFault,
        includeMapAsset: pdfIncludeMap,
        includeChartsAsset: pdfIncludeCharts,
        highlightResP,
        highlightResS,
        varianceK,
        freshness: activeMagnitudeFreshness,
      });
      showNotice(`Generated print-ready PDF bulletin: ${pdfName}`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to generate PDF bulletin.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const resolveEventPrintLabels = (ev: EQPEvent) => {
    const city = ev.cities.find((c) => c.id === ev.selectedCityId) ?? null;
    const town = ev.towns.find((t) => t.id === ev.selectedTownId) ?? null;
    const generator = ev.generators.find((g) => g.id === ev.selectedGeneratorId) ?? null;
    const primaryLabel =
      ev.primaryHeadline === 'city' && city
        ? city.label
        : ev.primaryHeadline === 'town' && town
          ? town.label
          : city?.label ?? town?.label ?? 'Location pending';
    return {
      primaryLabel,
      generatorLabel: generator?.label ?? null,
    };
  };

  const submitDirectPrintJob = async (targetOpts?: {
    printerName?: string;
    networkAddress?: string;
    eventOverride?: EQPEvent;
  }) => {
    const targetEvent = targetOpts?.eventOverride ?? activeEvent;
    const targetFreshness = targetOpts?.eventOverride
      ? inspectMagnitudeFreshness(
          targetEvent,
          targetEvent.magnitudeMetadata,
          magnitudeSettings,
          stations
        )
      : activeMagnitudeFreshness;
    const labels = resolveEventPrintLabels(targetEvent);
    const formattedText = formatDataPrintText({
      event: targetEvent,
      primaryLocationLabel: labels.primaryLabel,
      faultGeneratorLabel: labels.generatorLabel,
      config: dataPrintConfig,
      freshness: targetFreshness,
    });

    setDataPrintError(null);
    setIsPrintingDirect(true);
    try {
      const printResp = await fetch('/api/printers/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: formattedText,
          jobTitle: targetEvent.filename.replace(/\.eqp$/i, '') || 'EQP_Data_Solution',
          orientation: dataPrintConfig.orientation,
          ...(targetOpts?.printerName ? { printerName: targetOpts.printerName } : {}),
          ...(targetOpts?.networkAddress ? { networkAddress: targetOpts.networkAddress } : {}),
        }),
      });
      const printResult = (await printResp.json()) as {
        ok?: boolean;
        printerName?: string;
        error?: string;
      };
      if (printResp.ok && printResult.ok) {
        if (targetOpts?.networkAddress) {
          try {
            window.localStorage.setItem(
              'eqp_network_printer_address',
              targetOpts.networkAddress
            );
          } catch {
            // ignore storage errors
          }
        }
        clearDataPrintPreview();
        setDataPrintOptionsOpen(false);
        showNotice(
          `Printed EQ Data to printer "${printResult.printerName ?? targetOpts?.printerName ?? targetOpts?.networkAddress ?? 'Default Printer'}"`
        );
        return true;
      }

      const errMsg =
        printResult.error ||
        `Failed to print to ${targetOpts?.networkAddress || targetOpts?.printerName || 'default printer'}.`;
      setDataPrintError(errMsg);
      return false;
    } catch {
      const errMsg = `Unable to transmit print job to ${targetOpts?.networkAddress || targetOpts?.printerName || 'printer spooler'}.`;
      setDataPrintError(errMsg);
      return false;
    } finally {
      setIsPrintingDirect(false);
    }
  };

  const handleDataPrint = async (eventOverride?: EQPEvent) => {
    setDataPrintError(null);
    const checkedStatus = await refreshSystemPrinters();

    if (!checkedStatus.connected || !checkedStatus.defaultPrinter) {
      clearDataPrintPreview();
      setDataPrintOptionsOpen(true);
      return;
    }

    const ok = await submitDirectPrintJob({ eventOverride });
    if (!ok) {
      setHostPrinterStatus({
        ...checkedStatus,
        connected: false,
        defaultPrinter: null,
        reason: `Default system printer "${checkedStatus.defaultPrinter}" failed to accept print job.`,
      });
      setDataPrintOptionsOpen(true);
    }
  };

  const handleBrowserPrintData = async () => {
    clearDataPrintPreview();

    let beforePrintTriggered = false;
    let printElapsedMs = 0;
    const onBeforePrint = () => {
      beforePrintTriggered = true;
    };
    window.addEventListener('beforeprint', onBeforePrint, { once: true });

    try {
      // Flush synchronously inside the user gesture so browser user-activation isn't lost
      flushSync(() => {
        setIsBrowserPrintingData(true);
      });
      const printStart = performance.now();
      window.print();
      printElapsedMs = performance.now() - printStart;
    } catch {
      beforePrintTriggered = false;
      printElapsedMs = 0;
    } finally {
      window.removeEventListener('beforeprint', onBeforePrint);
    }

    if (beforePrintTriggered || printElapsedMs > 120) {
      setDataPrintOptionsOpen(false);
      return;
    }

    // Embedded preview iframes without allow-modals silently ignore window.print():
    // restore UI, prepare same-origin Printable Page (/api/printers/sheet/<id>) + PDF preview,
    // and show interactive Print Sheet preview so user can print to their PC printer cleanly.
    setIsBrowserPrintingData(false);

    try {
      const { blobUrl } = createDataPrintPdfBlobUrl({
        event: activeEvent,
        primaryLocationLabel,
        faultGeneratorLabel: selectedGenerator?.label ?? null,
        config: dataPrintConfig,
        freshness: activeMagnitudeFreshness,
      });
      setDataPrintPreviewUrl(blobUrl);
    } catch {
      // non-fatal if blob PDF preview fails
    }

    const formattedText = formatDataPrintText({
      event: activeEvent,
      primaryLocationLabel,
      faultGeneratorLabel: selectedGenerator?.label ?? null,
      config: dataPrintConfig,
      freshness: activeMagnitudeFreshness,
    });

    try {
      const sheetResp = await fetch('/api/printers/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: activeEvent.filename || 'EQP Data Printout',
          orientation: dataPrintConfig.orientation,
          sheetText: formattedText,
        }),
      });
      if (sheetResp.ok) {
        const sheetData = (await sheetResp.json()) as { ok?: boolean; url?: string };
        if (sheetData.ok && sheetData.url) {
          setPrintableSheetUrl(sheetData.url);
        }
      }
    } catch {
      // non-fatal if standalone sheet registration fails
    }

    setDataPrintPreviewNotice(
      'Embedded preview frames restrict direct window.print(). Click "Open Printable Page & Print" below to launch the OS Printer Dialog in a full browser tab, or Download Print PDF.'
    );
    setDataPrintPreviewActive(true);
    setDataPrintOptionsOpen(true);
  };

  const handleDownloadDataPdf = () => {
    clearDataPrintPreview();
    const pdfName = downloadDataPrintPdf({
      event: activeEvent,
      primaryLocationLabel,
      faultGeneratorLabel: selectedGenerator?.label ?? null,
      config: dataPrintConfig,
      freshness: activeMagnitudeFreshness,
    });
    setDataPrintOptionsOpen(false);
    showNotice(`Exported print-ready EQ Data PDF: ${pdfName}`);
  };

  const handleDownloadDataText = (formattedText: string) => {
    clearDataPrintPreview();
    const baseName = (activeEvent.filename || 'EQP_DATA').replace(/\.eqp$/i, '');
    const txtName = `EQDATA_${baseName}.txt`;
    const blob = new Blob([formattedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = txtName;
    a.click();
    URL.revokeObjectURL(url);
    setDataPrintOptionsOpen(false);
    showNotice(`Downloaded printable text report: ${txtName}`);
  };

  const eqpTabsLeft: Array<{
    id:
      | 'data'
      | 'map'
      | 'intensity'
      | 'bulletin'
      | 'primer'
      | 'social-media';
    label: string;
    section: NavSectionId;
    icon: React.ReactNode;
  }> = [
    { id: 'data', label: 'Data', section: 'locate', icon: <Crosshair className="w-[18px] h-[18px] shrink-0 text-rose-600" /> },
    { id: 'map', label: 'Map', section: 'map', icon: <MapIcon className="w-[18px] h-[18px] shrink-0 text-sky-600" /> },
    { id: 'intensity', label: 'Intensity', section: 'magnitude', icon: <Activity className="w-[18px] h-[18px] shrink-0 text-amber-600" /> },
    { id: 'bulletin', label: 'Bulletin', section: 'bulletin', icon: <FileText className="w-[18px] h-[18px] shrink-0 text-indigo-600" /> },
    { id: 'primer', label: 'Primer', section: 'primer', icon: <BookOpen className="w-[18px] h-[18px] shrink-0 text-violet-600" /> },
    { id: 'social-media', label: 'SOCIAL MEDIA', section: 'social-media', icon: <Share2 className="w-[18px] h-[18px] shrink-0 text-sky-700" /> },
  ];

  const eqpTabsRight: Array<{
    id: 'database' | 'utils' | 'eqp-history' | 'tsunami' | 'research' | 'settings';
    label: string;
    section: NavSectionId;
    icon: React.ReactNode;
  }> = [
    { id: 'research', label: 'Research', section: 'research', icon: <Compass className="w-[18px] h-[18px] shrink-0 text-purple-600" /> },
    { id: 'database', label: 'Database', section: 'database', icon: <Database className="w-[18px] h-[18px] shrink-0 text-teal-600" /> },
    { id: 'utils', label: 'Utils', section: 'assistant', icon: <Wrench className="w-[18px] h-[18px] shrink-0 text-slate-600" /> },
    { id: 'eqp-history', label: 'EQP History', section: 'catalog', icon: <History className="w-[18px] h-[18px] shrink-0 text-amber-700" /> },
    { id: 'tsunami', label: 'Tsunami', section: 'map', icon: <Waves className="w-[18px] h-[18px] shrink-0 text-blue-600" /> },
    { id: 'settings', label: 'Settings', section: 'settings', icon: <Settings className="w-[18px] h-[18px] shrink-0 text-slate-600" /> },
  ];

  return (
    <>
    <div
      className={`h-screen overflow-hidden flex flex-col bg-[#e8eaee] text-slate-900 select-none sm:select-auto ${
        isBrowserPrintingData ? 'print:hidden' : ''
      }`}
    >
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Segmented EQP Parameter Ribbon */}
      <section
        aria-label="Event Parameters"
        className="bg-gradient-to-b from-[#6b0f1b] to-[#32cd32] border-b border-slate-500 px-1.5 py-1 flex flex-wrap items-stretch gap-1 text-[11px] shrink-0"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSidebarOpen((v) => !v);
          }}
          className="px-1.5 rounded border border-slate-400 bg-white text-slate-700 hover:bg-slate-100 lg:hidden inline-flex items-center"
          aria-label="Toggle station pick rail"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* EQP Ver + Issued Stamp (Light Sky) */}
        <div className="bg-[#e8f2fe] border border-slate-400 px-1.5 py-1 flex items-center gap-1.5">
          <span className="font-semibold text-blue-800 whitespace-nowrap">EQP Ver.</span>
          <span className="bg-[#fde5c2] border border-slate-400 px-1.5 py-0.5 font-mono font-bold text-rose-700">
            {activeEvent.version}
          </span>
          <div className="flex flex-col gap-0.5 leading-tight font-mono tabular-nums text-[10px]">
            <span className="px-1 border border-rose-300 bg-white text-rose-700 min-w-[68px] text-center">
              {activeEvent.issuedDate || '—'}
            </span>
            <span className="px-1 border border-rose-300 bg-white text-rose-700 min-w-[68px] text-center">
              {activeEvent.issuedTime || '—'}
            </span>
          </div>
        </div>

        {/* Phases: STA / P / S (Light Mint) */}
        <div className="bg-[#e3f6ea] border border-slate-400 px-1.5 py-1 flex items-center gap-1.5">
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[10px] font-semibold text-blue-800">Phases :</span>
            <span className="text-[10px] font-bold text-blue-900">STA</span>
          </div>
          <span className="bg-[#f7d0ea] border border-slate-400 px-1.5 py-1 font-mono font-bold tabular-nums text-slate-900 min-w-[34px] text-center">
            {phaseStats.totalStations}
          </span>
          <div className="grid grid-cols-[12px_46px] gap-x-1 gap-y-0.5 items-center font-mono tabular-nums text-[10px]">
            <span className="font-bold text-blue-900 text-right">P</span>
            <span className="bg-white border border-slate-400 px-1 py-0.5 text-slate-900 text-center">
              {phaseStats.pUsed}/{phaseStats.pTotal}
            </span>
            <span className="font-bold text-blue-900 text-right">S</span>
            <span className="bg-white border border-slate-400 px-1 py-0.5 text-slate-900 text-center">
              {phaseStats.sUsed}/{phaseStats.sTotal}
            </span>
          </div>
        </div>

        {/* Bull. No. & Depth (Light Butter / Cream) */}
        <div className="bg-[#fdf5dc] border border-slate-400 px-2 py-1 grid grid-cols-[auto_52px] gap-x-1.5 gap-y-0.5 items-center">
          <span className="font-semibold text-blue-800 text-right">Bull. No. :</span>
          <span className="bg-white border border-slate-400 px-1.5 py-0.5 font-mono font-bold tabular-nums text-slate-900 text-right">
            {activeEvent.bulletinNo}
          </span>
          <span className="font-semibold text-blue-800 text-right">Depth :</span>
          <span className="bg-white border border-slate-400 px-1.5 py-0.5 font-mono font-bold tabular-nums text-slate-900 text-right">
            {isUnlocated ? '—' : activeEvent.depthKm.toFixed(1).padStart(5, '0')}
          </span>
        </div>

        {/* Latitude & Longitude (Light Lavender) */}
        <div className="bg-[#eae8fd] border border-slate-400 px-2 py-1 grid grid-cols-[auto_62px] gap-x-1.5 gap-y-0.5 items-center">
          <span className="font-semibold text-blue-800 text-right">Latitude :</span>
          <span className="bg-white border border-slate-400 px-1.5 py-0.5 font-mono font-bold tabular-nums text-slate-900 text-right">
            {isUnlocated ? '—' : activeEvent.lat.toFixed(3)}
          </span>
          <span className="font-semibold text-blue-800 text-right">Longitude :</span>
          <span className="bg-white border border-slate-400 px-1.5 py-0.5 font-mono font-bold tabular-nums text-slate-900 text-right">
            {isUnlocated ? '—' : activeEvent.lon.toFixed(3)}
          </span>
        </div>

        {/* Magnitude Light Rose / Coral Cell */}
        <div className="bg-[#fce2e5] border border-slate-400 px-2 py-1 flex flex-col justify-between gap-0.5">
          <button
            type="button"
            onClick={() => setMagnitudePopupOpen(true)}
            title="Open Computed Magnitude Using Time Duration"
            className="font-bold text-rose-950 leading-none text-left hover:underline cursor-pointer"
          >
            Magnitude :
          </button>
          <div className="flex items-center gap-1">
            {activeEventMagnitudeMetadata.preferredMethodId === 'eqp-legacy-ms' ? (
              <select
                value={activeEvent.preferredScale}
                onChange={(e) => {
                  const scale = e.target.value as MagnitudeScale;
                  if (
                    !activeEvent.magnitudeMetadata &&
                    !activeEvent.historicalMagnitudeBaseline &&
                    activeEvent.picks.some(isDurationMagnitudeEligible)
                  ) {
                    handleApplyFilteredMagnitude({
                      notify: false,
                      transform: (ev) => ({ ...ev, preferredScale: scale }),
                    });
                  } else {
                    updateActiveEvent((ev) => {
                      const nextEv: EQPEvent = { ...ev, preferredScale: scale };
                      if (!ev.magnitudeMetadata) return nextEv;
                      if (ev.magnitudeMetadata.originState === 'historical_saved') {
                        const legacyVal =
                          scale === 'Ms' ? ev.ms : scale === 'Mb' ? ev.mb : ev.md;
                        return {
                          ...nextEv,
                          magnitudeMetadata: {
                            ...ev.magnitudeMetadata,
                            selectedScale: formatLegacyScaleShort(scale),
                            selectedMagnitude:
                              Number.isFinite(legacyVal) && legacyVal > 0
                                ? Number(legacyVal.toFixed(1))
                                : null,
                          },
                        };
                      }
                      const nextMeta = evaluateEventMagnitudes({
                        event: nextEv,
                        settings: magnitudeSettings,
                        stations,
                        preferredMethodOverride: ev.magnitudeMetadata.isPerEventOverride
                          ? ev.magnitudeMetadata.preferredMethodId
                          : undefined,
                      });
                      return {
                        ...nextEv,
                        magnitudeMetadata: nextMeta,
                      };
                    });
                  }
                }}
                aria-label="Preferred magnitude scale"
                className="bg-white border border-slate-400 px-1 py-0.5 text-[11px] font-semibold text-slate-900 focus:outline-none"
              >
                <option value="Ms">Ms</option>
                <option value="Mb">Mb</option>
                <option value="Md">ML</option>
              </select>
            ) : (
              <span
                title={
                  MAGNITUDE_ALGORITHM_BY_ID[activeEventMagnitudeMetadata.preferredMethodId]
                    ?.scientificLabel ?? activeEventMagnitudeMetadata.preferredMethodId
                }
                className="bg-white border border-slate-400 px-1.5 py-0.5 text-[11px] font-semibold text-slate-900"
              >
                {activeEventMagnitudeMetadata.selectedScale}
              </span>
            )}
            <button
              type="button"
              onClick={() => setMagnitudePopupOpen(true)}
              title={
                activeMagnitudeFreshness.isStale
                  ? 'Magnitude recalculation required — click Recalculate Magnitude in Results Panel or review Duration Popup'
                  : 'Click to open Computed Magnitude Using Time Duration'
              }
              className={`border px-1.5 py-0.5 font-mono font-bold tabular-nums min-w-[36px] text-center cursor-pointer ${
                activeMagnitudeFreshness.isStale
                  ? 'bg-amber-100 hover:bg-amber-200 border-amber-500 text-amber-900 text-[10.5px]'
                  : 'bg-white hover:bg-amber-50 border-slate-400 text-slate-900'
              }`}
            >
              {activeMagnitudeFreshness.isStale
                ? 'Stale'
                : activeMagnitudeValue === null
                  ? '—'
                  : activeEventMagnitudeMetadata.preferredMethodId !== 'eqp-legacy-ms'
                    ? activeMagnitudeValue.toFixed(1)
                    : isUnlocated && activeMagnitudeValue === 0
                      ? '—'
                      : activeMagnitudeValue.toFixed(1)}
            </button>
          </div>
        </div>

        {/* Date / Time (GMT) Light Orchid Pink Cell */}
        <div className="bg-[#f9e1f2] border border-slate-400 px-2 py-1 grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5 items-center">
          <span className="font-semibold text-blue-800 text-right">Date (GMT) :</span>
          <div className="flex items-center gap-0.5 font-mono font-bold tabular-nums text-[10px]">
            <span className="bg-white border border-slate-400 px-1 py-0.5">{gmtDateParts[0] ?? '2026'}</span>
            <span className="bg-white border border-slate-400 px-1 py-0.5">{gmtDateParts[1] ?? '01'}</span>
            <span className="bg-white border border-slate-400 px-1 py-0.5">{gmtDateParts[2] ?? '01'}</span>
          </div>
          <span className="font-semibold text-blue-800 text-right">Time (GMT) :</span>
          <div className="flex items-center gap-0.5 font-mono font-bold tabular-nums text-[10px]">
            <span className="bg-white border border-slate-400 px-1.5 py-0.5">
              {(gmtTimeParts[0] ?? '00').padStart(2, '0')} {(gmtTimeParts[1] ?? '00').padStart(2, '0')}
            </span>
            <span className="bg-white border border-slate-400 px-1.5 py-0.5">
              {gmtTimeParts[2] ?? '00.00'}
            </span>
          </div>
        </div>

        {/* Date / Time (LST) Light Aqua / Cyan Cell */}
        <div className="bg-[#e0f5f7] border border-slate-400 px-2 py-1 grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-0.5 items-center">
          <span className="font-semibold text-blue-800 text-right">Date (LST) :</span>
          <div className="flex items-center gap-0.5 font-mono font-bold tabular-nums text-[10px]">
            <span className="bg-white border border-slate-400 px-1 py-0.5">{lstDateParts[0] ?? '2026'}</span>
            <span className="bg-white border border-slate-400 px-1 py-0.5">{lstDateParts[1] ?? '01'}</span>
            <span className="bg-white border border-slate-400 px-1 py-0.5">{lstDateParts[2] ?? '01'}</span>
          </div>
          <span className="font-semibold text-blue-800 text-right">Time (LST) :</span>
          <div className="flex items-center gap-0.5 font-mono font-bold tabular-nums text-[10px]">
            <span className="bg-white border border-slate-400 px-1.5 py-0.5">
              {(lstTimeParts[0] ?? '08').padStart(2, '0')} {(lstTimeParts[1] ?? '00').padStart(2, '0')}
            </span>
            <span className="bg-white border border-slate-400 px-1.5 py-0.5">
              {lstTimeParts[2] ?? '00.00'}
            </span>
          </div>
        </div>

        {/* Close / Clear Selection Button */}
        <button
          type="button"
          onClick={() => {
            setSelectedStation(null);
            navigateEqpModule('locate', 'data');
            showNotice('Cleared active station selection and returned to Data view');
          }}
          title="Clear active station selection and return to Data view"
          className={`group ml-auto px-3 py-1 border font-semibold inline-flex items-center gap-1.5 text-xs shrink-0 ${getWorkstationButtonClass(
            {
              buttonStyle,
              iconStyle,
              action: 'close',
              surface: 'toolbar',
            }
          )}`}
        >
          <WorkstationActionIcon preset={iconStyle} action="close" size="toolbar" />
          <span>Close</span>
        </button>
      </section>

      {/* Main Three-Zone EQP Body */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Mobile Drawer Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left 2 Columns: Dark Navy Pick List + Pink Action Rail */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex min-h-0 shrink-0 transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Column 1: Dark Navy Station / Phase Table + Periwinkle Footer */}
          <div
            ref={stationPanelRef}
            tabIndex={0}
            aria-label="Station input panel (click empty space and press Ctrl+V to paste ATLAS/HYDRA data)"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement | null;
              if (
                target &&
                ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'OPTION', 'A'].includes(target.tagName)
              ) {
                return;
              }
              if (document.activeElement !== stationPanelRef.current) {
                stationPanelRef.current?.focus({ preventScroll: true });
              }
            }}
            onPaste={handleStationPanelPaste}
            className="w-[496px] max-w-[calc(100vw-74px)] bg-[#003b73] text-white border-r border-slate-500 flex flex-col min-h-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-300/70"
          >
            <datalist id="eqp-station-codes">
              {stations
                .filter((st) => st.status !== 'retired')
                .map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.name} · {st.province}
                  </option>
                ))}
            </datalist>
            <div className="bg-[#e6eaf0] text-slate-900 border-b border-slate-400 grid grid-cols-[22px_46px_80px_80px_38px_72px_32px_34px_18px] gap-1 px-2 py-1 text-[11px] font-semibold shrink-0 select-none">
              <span
                className="text-right text-slate-500 font-mono text-[10px] leading-4 pr-0.5"
                title="Station row number"
              >
                #
              </span>
              {(
                [
                  { key: 'sta', label: 'STA', align: 'left', title: 'Sort by station code' },
                  { key: 'pTime', label: 'Primary', align: 'left', title: 'Sort by Primary (P) arrival' },
                  { key: 'sTime', label: 'Secondary', align: 'left', title: 'Sort by Secondary (S) arrival' },
                  { key: 'duration', label: 'Dur', align: 'right', title: 'Sort by coda duration (s)' },
                  { key: 'amplitude', label: 'Amp', align: 'right', title: 'Sort by peak ground amplitude (µm)' },
                  { key: 'polarity', label: 'Pol', align: 'center', title: 'Sort by first-motion polarity' },
                  { key: 'quality', label: 'Qual', align: 'center', title: 'Sort by pick quality weight' },
                ] as const
              ).map((col) => {
                const isSorted = pickTableSort?.key === col.key;
                const justifyClass =
                  col.align === 'right'
                    ? 'justify-end'
                    : col.align === 'center'
                      ? 'justify-center'
                      : 'justify-start';
                return (
                  <button
                    key={col.key}
                    type="button"
                    onClick={() => cyclePickTableSort(col.key)}
                    title={`${col.title} (click to cycle asc / desc / default)`}
                    className={`inline-flex items-center gap-0.5 min-w-0 cursor-pointer transition-colors hover:text-blue-700 ${justifyClass} ${
                      isSorted ? 'text-blue-700 font-bold' : 'text-slate-900'
                    }`}
                  >
                    <span className="truncate">{col.label}</span>
                    {isSorted &&
                      (pickTableSort.dir === 'asc' ? (
                        <ArrowUp className="w-2.5 h-2.5 shrink-0" />
                      ) : (
                        <ArrowDown className="w-2.5 h-2.5 shrink-0" />
                      ))}
                  </button>
                );
              })}
              <span className="sr-only">Action</span>
            </div>

            {atlasStatusNotice && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-amber-50 text-amber-950 border-b border-amber-400 px-2.5 py-1.5 text-[10px] flex items-start justify-between gap-2 shrink-0"
              >
                <span className="leading-snug">{atlasStatusNotice}</span>
                <button
                  type="button"
                  onClick={() => setAtlasStatusNotice(null)}
                  title="Dismiss origin-time mismatch notice"
                  className="text-amber-800 hover:text-amber-950 font-bold leading-none px-1"
                >
                  ×
                </button>
              </div>
            )}

            {activeEvent.amplitudeAssociationIssues &&
              activeEvent.amplitudeAssociationIssues.length > 0 &&
              dismissedAmpIssueKey !==
                `${activeEvent.id}:${activeEvent.amplitudeAssociationIssues.length}` && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="bg-amber-50 text-amber-950 border-b border-amber-400 px-2.5 py-1.5 text-[10px] flex items-start justify-between gap-2 shrink-0"
                >
                  <div className="leading-snug space-y-0.5">
                    <div className="font-semibold">
                      Amplitude sidecar notice ({activeEvent.amplitudeAssociationIssues.length}):
                    </div>
                    {activeEvent.amplitudeAssociationIssues.slice(0, 2).map((iss) => (
                      <div key={iss.id}>• {iss.message}</div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDismissedAmpIssueKey(
                        `${activeEvent.id}:${activeEvent.amplitudeAssociationIssues?.length ?? 0}`
                      )
                    }
                    title="Dismiss amplitude sidecar notice"
                    className="text-amber-800 hover:text-amber-950 font-bold leading-none px-1 shrink-0"
                  >
                    ×
                  </button>
                </div>
              )}

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto font-mono text-[11px] tabular-nums">
              {activeEvent.picks.length === 0 && (
                <div className="px-3 py-2.5 text-[11px] font-sans text-sky-100/90 border-b border-sky-300/20 bg-[#042f5c]">
                  New event workspace ready — enter picks below, or click empty panel space and press Ctrl+V to paste ATLAS/HYDRA data.
                </div>
              )}

              {sortedStationPicks.map((pick, index) => {
                const isSelected = selectedStation === pick.sta;
                const hasP = pick.pTime.trim() !== '';
                const hasS = pick.sTime.trim() !== '';
                const qual = pick.quality ?? 'B';
                const ampValue =
                  amplitudeDrafts[pick.id] !== undefined
                    ? amplitudeDrafts[pick.id]
                    : pick.amplitude !== null && pick.amplitude !== undefined
                      ? String(pick.amplitude)
                      : '';
                const isPickFadingIn = animatedPickIds[pick.id] !== undefined;
                const isEvenRow = index % 2 === 0;
                const cellBgClass = isSelected
                  ? 'bg-[#155a9c] group-hover:bg-[#1965ad] focus:bg-[#104980]'
                  : isEvenRow
                    ? 'bg-[#00244a] group-hover:bg-slate-100/10 focus:bg-[#001b38]'
                    : 'bg-[#0b447d] group-hover:bg-slate-100/10 focus:bg-[#083663]';
                const ampSummary =
                  activeAmplitudeValidation.stationSummariesByPickId.get(pick.id);
                const ampBtnClass =
                  ampSummary?.status === 'quality_warning'
                    ? 'bg-rose-950/70 border-rose-400/75 text-rose-200 hover:bg-rose-900/80'
                    : ampSummary?.status === 'incomplete'
                      ? 'bg-amber-950/60 border-amber-400/75 text-amber-200 hover:bg-amber-900/70'
                      : ampSummary?.status === 'available'
                        ? 'bg-emerald-950/60 border-emerald-400/75 text-emerald-200 hover:bg-emerald-900/70'
                        : `${cellBgClass} border-sky-400/45 text-sky-300/75 hover:text-white hover:border-sky-200`;
                const ampBtnTitle = ampSummary && ampSummary.count > 0
                  ? `${ampSummary.count} structured amplitude measurement(s) · ${ampSummary.label}${ampSummary.channels.length ? ` [${ampSummary.channels.join(', ')}]` : ''} — Click to edit`
                  : `Add / edit structured amplitude measurements for ${pick.sta || 'station'}`;
                return (
                  <div
                    key={`rail-${pick.id}`}
                    onClick={() => setSelectedStation(isSelected ? null : pick.sta)}
                    onAnimationEnd={() => {
                      if (!isPickFadingIn) return;
                      const timerId = animatedPickTimersRef.current[pick.id];
                      if (timerId !== undefined) {
                        window.clearTimeout(timerId);
                        delete animatedPickTimersRef.current[pick.id];
                      }
                      setAnimatedPickIds((prev) => {
                        if (prev[pick.id] === undefined) return prev;
                        const next = { ...prev };
                        delete next[pick.id];
                        return next;
                      });
                    }}
                    className={`group min-w-[464px] grid grid-cols-[22px_46px_80px_80px_38px_72px_32px_34px_18px] gap-1 items-center px-2 py-1 border-b border-sky-300/20 cursor-pointer transition-colors ${
                      isPickFadingIn ? 'animate-eqp-fade-in' : ''
                    } ${
                      isSelected
                        ? 'bg-[#1b6cb8] hover:bg-[#1f77ca] text-white font-semibold ring-1 ring-inset ring-sky-300/70'
                        : isEvenRow
                          ? 'bg-[#00305e] hover:bg-slate-100/15 hover:ring-1 hover:ring-inset hover:ring-slate-100/35 text-white'
                          : 'bg-[#0e5294] hover:bg-slate-100/15 hover:ring-1 hover:ring-inset hover:ring-slate-100/35 text-white'
                    }`}
                  >
                    <span
                      className={`text-right font-mono text-[10px] tabular-nums pr-0.5 select-none transition-colors ${
                        isSelected
                          ? 'text-sky-100'
                          : isEvenRow
                            ? 'text-sky-300/75 group-hover:text-slate-100'
                            : 'text-sky-200/85 group-hover:text-slate-100'
                      }`}
                      title={`Station #${index + 1}${pick.sta ? `: ${pick.sta}` : ''}`}
                    >
                      {index + 1}
                    </span>
                    <div onClick={(e) => e.stopPropagation()} className="min-w-0">
                      <input
                        type="text"
                        list="eqp-station-codes"
                        aria-label={`Station code for row ${index + 1}${pick.sta ? ` (${pick.sta})` : ''}`}
                        title={
                          pick.atlasMetadata
                            ? [
                                `${pick.atlasMetadata.originalStationCode} (${pick.atlasMetadata.network || '—'})`,
                                pick.atlasMetadata.resolvedStationCode
                                  ? `PHILSTA: ${pick.atlasMetadata.resolvedStationCode}`
                                  : 'Unmapped in PHILSTA catalog',
                                pick.atlasMetadata.pUtcTime
                                  ? `P ${pick.atlasMetadata.pUtcTime} UTC [${pick.atlasMetadata.pChannel ?? '—'}]`
                                  : 'P missing',
                                pick.atlasMetadata.sUtcTime
                                  ? `S ${pick.atlasMetadata.sUtcTime} UTC [${pick.atlasMetadata.sChannel ?? '—'}]`
                                  : 'S blank',
                                pick.atlasMetadata.ambiguousPhases ? 'FLAG: Duplicate/ambiguous phase picks' : null,
                                pick.atlasMetadata.sOnlyMissingP ? 'FLAG: S-only (no P arrival)' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : 'Station code (e.g. BES, OCL, TGY)'
                        }
                        placeholder="STA"
                        value={pick.sta}
                        onFocus={() => {
                          if (pick.sta && selectedStation !== pick.sta) {
                            setSelectedStation(pick.sta);
                          }
                        }}
                        onChange={(e) => handleStationCodeChange(pick.id, e.target.value)}
                        className={`w-full min-w-0 ${cellBgClass} text-white placeholder:text-sky-300/40 rounded-xs px-1 py-0.5 text-[10px] font-mono font-semibold uppercase transition-colors focus:outline-none focus:ring-1 focus:ring-sky-300 ${
                          pick.atlasMetadata &&
                          (pick.atlasMetadata.ambiguousPhases ||
                            pick.atlasMetadata.sOnlyMissingP ||
                            pick.atlasMetadata.unknownStation)
                            ? 'border border-amber-400'
                            : 'border border-sky-400/45 group-hover:border-slate-100/55'
                        }`}
                      />
                    </div>
                    <div
                      className="flex items-center gap-1 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {hasP && (
                        <input
                          type="checkbox"
                          checked={!pick.pExcluded}
                          onChange={() => togglePhaseExclusion(pick.id, 'P')}
                          aria-label={`Include P reading for ${pick.sta}`}
                          title={
                            pick.pExcluded
                              ? `Include ${pick.sta} P reading`
                              : `Exclude ${pick.sta} P reading`
                          }
                          className="h-3 w-3 shrink-0 rounded-xs border-sky-300 accent-sky-400 cursor-pointer"
                        />
                      )}
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Primary P arrival time for ${pick.sta}`}
                        title={`Primary (P) arrival time in MMSS.ss for ${pick.sta}`}
                        placeholder="MMSS.ss"
                        value={pick.pTime}
                        onChange={(e) => handlePhaseTimeChange(pick.id, 'P', e.target.value)}
                        className={`w-full min-w-0 ${cellBgClass} placeholder:text-sky-300/35 border border-sky-400/45 group-hover:border-slate-100/55 rounded-xs px-1 py-0.5 text-[10px] font-mono tabular-nums transition-colors focus:outline-none focus:ring-1 focus:ring-sky-300 ${
                          pick.pExcluded ? 'line-through text-[#f472d0] font-semibold' : 'text-white'
                        }`}
                      />
                    </div>
                    <div
                      className="flex items-center gap-1 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {hasS && (
                        <input
                          type="checkbox"
                          checked={!pick.sExcluded}
                          onChange={() => togglePhaseExclusion(pick.id, 'S')}
                          aria-label={`Include S reading for ${pick.sta}`}
                          title={
                            pick.sExcluded
                              ? `Include ${pick.sta} S reading`
                              : `Exclude ${pick.sta} S reading`
                          }
                          className="h-3 w-3 shrink-0 rounded-xs border-sky-300 accent-sky-400 cursor-pointer"
                        />
                      )}
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Secondary S arrival time for ${pick.sta}`}
                        title={`Secondary (S) arrival time in MMSS.ss for ${pick.sta}`}
                        placeholder="—"
                        value={pick.sTime}
                        onChange={(e) => handlePhaseTimeChange(pick.id, 'S', e.target.value)}
                        className={`w-full min-w-0 ${cellBgClass} placeholder:text-sky-300/35 border border-sky-400/45 group-hover:border-slate-100/55 rounded-xs px-1 py-0.5 text-[10px] font-mono tabular-nums transition-colors focus:outline-none focus:ring-1 focus:ring-sky-300 ${
                          pick.sExcluded ? 'line-through text-[#f472d0]' : 'text-white'
                        }`}
                      />
                    </div>
                    <div
                      className="flex justify-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Duration (s) for ${pick.sta}`}
                        title={`Signal coda duration (s) for ${pick.sta}`}
                        placeholder="—"
                        value={pick.duration ?? ''}
                        onChange={(e) => handleDurationInputChange(pick.id, e.target.value)}
                        className={`w-full min-w-0 ${cellBgClass} text-sky-100 placeholder:text-sky-300/40 border border-sky-400/50 group-hover:border-slate-100/55 rounded-xs px-0.5 py-0.5 text-[10px] font-mono tabular-nums text-right transition-colors focus:outline-none focus:ring-1 focus:ring-sky-300`}
                      />
                    </div>
                    <div
                      className="flex items-center gap-0.5 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Amplitude (µm) for ${pick.sta}`}
                        title={`Legacy scalar amplitude for ${pick.sta} (µm — preserved independently without assuming channel/response)`}
                        placeholder="µm"
                        value={ampValue}
                        onChange={(e) => handleAmplitudeInputChange(pick.id, e.target.value)}
                        onBlur={() => handleAmplitudeInputBlur(pick.id)}
                        className={`flex-1 min-w-0 ${cellBgClass} text-sky-100 placeholder:text-sky-300/40 border border-sky-400/50 group-hover:border-slate-100/55 rounded-xs px-1 py-0.5 text-[10px] font-mono tabular-nums text-right transition-colors focus:outline-none focus:ring-1 focus:ring-sky-300`}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAmplitudeModalPickId(pick.id);
                        }}
                        aria-label={`Edit structured amplitude measurements for ${pick.sta || `row ${index + 1}`}`}
                        title={ampBtnTitle}
                        className={`shrink-0 h-[19px] min-w-[20px] px-0.5 border rounded-xs inline-flex items-center justify-center gap-0.5 text-[9px] font-mono transition-colors ${ampBtnClass}`}
                      >
                        <Waves className="w-2.5 h-2.5 shrink-0" />
                        {ampSummary && ampSummary.count > 0 && (
                          <span>{ampSummary.count}</span>
                        )}
                      </button>
                    </div>
                    <div
                      className="flex justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        aria-label={`Polarity for ${pick.sta}`}
                        value={pick.polarity}
                        onChange={(e) =>
                          handleSetPickPolarity(pick.id, e.target.value as Polarity)
                        }
                        title={
                          pick.polarity === 'c' || pick.polarity === '+'
                            ? 'Compression (upward first motion)'
                            : pick.polarity === 'd' || pick.polarity === '-'
                              ? 'Dilatation (downward first motion)'
                              : 'No polarity assigned'
                        }
                        className={`w-full appearance-none [text-align-last:center] ${cellBgClass} [&>option]:bg-[#062e59] [&>option]:text-white border border-sky-400/50 group-hover:border-slate-100/55 rounded-xs px-0.5 py-0.5 text-[10px] font-mono font-semibold text-center cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-sky-300 ${
                          pick.polarity === 'c' || pick.polarity === '+'
                            ? 'text-emerald-300'
                            : pick.polarity === 'd' || pick.polarity === '-'
                              ? 'text-amber-300'
                              : 'text-slate-300'
                        }`}
                      >
                        <option value="">—</option>
                        <option value="c">c</option>
                        <option value="d">d</option>
                        <option value="+">+</option>
                        <option value="-">-</option>
                      </select>
                    </div>
                    <div
                      className="flex justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        aria-label={`Quality for ${pick.sta}`}
                        value={qual}
                        onChange={(e) =>
                          handleSetPickQuality(pick.id, e.target.value as PickQuality)
                        }
                        title={`Quality ${qual} · HypoInverse ${PICK_QUALITY_WEIGHTS[qual].label}`}
                        className={`w-full appearance-none [text-align-last:center] ${cellBgClass} [&>option]:bg-[#062e59] [&>option]:text-white border rounded-xs px-0.5 py-0.5 text-[10px] font-mono font-bold text-center cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-sky-300 ${
                          qual === 'A'
                            ? 'text-emerald-300 border-emerald-400/60'
                            : qual === 'B'
                              ? 'text-sky-200 border-sky-400/60'
                              : qual === 'C'
                                ? 'text-amber-300 border-amber-400/60'
                                : 'text-rose-200 border-rose-400/60'
                        }`}
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                    <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleRemovePick(pick.id, pick.sta)}
                        aria-label={`Remove ${pick.sta || 'station'} pick`}
                        title={`Remove ${pick.sta || 'station'}`}
                        className="p-0.5 text-sky-300/60 group-hover:text-slate-100 hover:!text-rose-300 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Inline Blank Station Entry Row */}
              <div
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCommitDraftPick();
                  }
                }}
                className="min-w-[464px] grid grid-cols-[22px_46px_80px_80px_38px_72px_32px_34px_18px] gap-1 items-center px-2 py-1.5 border-t border-sky-400/30 bg-[#032a52]"
              >
                <span aria-hidden="true" className="select-none" />
                <input
                  type="text"
                  list="eqp-station-codes"
                  aria-label="New station code"
                  placeholder="STA"
                  value={draftPick.sta}
                  onChange={(e) => handleDraftStationChange(e.target.value)}
                  className="w-full min-w-0 bg-[#062e59] text-white placeholder:text-sky-300/45 border border-sky-300/60 rounded-xs px-1 py-0.5 text-[10px] font-mono font-semibold uppercase focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="New Primary P arrival time"
                  placeholder="MMSS.ss"
                  value={draftPick.pTime}
                  onChange={(e) => handleDraftPhaseChange('P', e.target.value)}
                  className="w-full min-w-0 bg-[#062e59] text-white placeholder:text-sky-300/40 border border-sky-400/45 rounded-xs px-1 py-0.5 text-[10px] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="New Secondary S arrival time"
                  placeholder="MMSS.ss"
                  value={draftPick.sTime}
                  onChange={(e) => handleDraftPhaseChange('S', e.target.value)}
                  className="w-full min-w-0 bg-[#062e59] text-white placeholder:text-sky-300/40 border border-sky-400/45 rounded-xs px-1 py-0.5 text-[10px] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="New duration"
                  placeholder="Dur"
                  value={draftPick.duration}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setDraftPick((prev) => ({ ...prev, duration: v }));
                  }}
                  className="w-full min-w-0 bg-[#062e59] text-sky-100 placeholder:text-sky-300/40 border border-sky-400/45 rounded-xs px-0.5 py-0.5 text-[10px] font-mono tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="New amplitude"
                  placeholder="µm"
                  value={draftPick.amplitude}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || /^\d*\.?\d*$/.test(v)) {
                      setDraftPick((prev) => ({ ...prev, amplitude: v }));
                    }
                  }}
                  className="w-full min-w-0 bg-[#062e59] text-sky-100 placeholder:text-sky-300/40 border border-sky-400/45 rounded-xs px-1 py-0.5 text-[10px] font-mono tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-sky-300"
                />
                <select
                  aria-label="New polarity"
                  value={draftPick.polarity}
                  onChange={(e) =>
                    setDraftPick((prev) => ({ ...prev, polarity: e.target.value as Polarity }))
                  }
                  className="w-full appearance-none [text-align-last:center] bg-[#062e59] text-slate-200 border border-sky-400/45 rounded-xs px-0.5 py-0.5 text-[10px] font-mono text-center cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-300"
                >
                  <option value="">—</option>
                  <option value="c">c</option>
                  <option value="d">d</option>
                  <option value="+">+</option>
                  <option value="-">-</option>
                </select>
                <select
                  aria-label="New quality"
                  value={draftPick.quality}
                  onChange={(e) =>
                    setDraftPick((prev) => ({ ...prev, quality: e.target.value as PickQuality }))
                  }
                  className="w-full appearance-none [text-align-last:center] bg-[#062e59] text-sky-200 border border-sky-400/45 rounded-xs px-0.5 py-0.5 text-[10px] font-mono font-bold text-center cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-300"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
                <button
                  type="button"
                  onClick={handleCommitDraftPick}
                  aria-label="Add station pick row"
                  title="Add station pick (Enter)"
                  className="p-0.5 rounded-xs bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold flex items-center justify-center transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="bg-[#979cf2] text-slate-950 border-t border-slate-500 p-2 space-y-1.5 text-[11px] shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">EQP Ver :</span>
                <span className="bg-white border border-slate-500 px-1.5 py-0.5 font-mono font-bold text-slate-900 min-w-[64px] text-center">
                  {activeEvent.version}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold shrink-0">Filename :</span>
                <div
                  className="bg-white border border-slate-500 px-1.5 py-0.5 font-mono text-[10px] text-blue-800 truncate flex-1"
                  title={resolvedSaveTarget.fullPath}
                >
                  {resolvedSaveTarget.filename}
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Pink Vertical Action Rail */}
          <div className="w-[74px] bg-[#f8b3f5] border-r border-slate-500 flex flex-col items-center py-2 px-1.5 gap-2 min-h-0 overflow-y-auto shrink-0">
            {/* RMS Red Box */}
            <div className="w-full border border-rose-500 bg-[#ffd9e8] p-1 text-center">
              <div className="text-[10px] font-bold text-rose-900 leading-none">RMS</div>
              <div className="mt-1 bg-[#e60012] text-white font-mono font-bold tabular-nums text-xs py-0.5">
                {isUnlocated && activeEvent.rmsSec === 0
                  ? '—'
                  : activeEvent.rmsSec.toFixed(1).padStart(4, '0')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleRunPlotLocate()}
              disabled={isPlotLocating}
              aria-busy={isPlotLocating}
              title="Locate earthquake hypocenter and plot solution using current station observations and selected model (stays on current tab)"
              className={`group w-full py-2 px-1 border flex flex-col items-center gap-1 text-[10px] font-bold ${getWorkstationButtonClass(
                {
                  buttonStyle,
                  iconStyle,
                  action: 'plot',
                  surface: 'rail',
                  locating: isPlotLocating,
                }
              )}`}
            >
              <WorkstationActionIcon
                preset={iconStyle}
                action="plot"
                size="rail"
                locating={isPlotLocating}
              />
              <span className="leading-tight text-center tracking-tight">
                {isPlotLocating ? 'Locating...' : 'PLOT'}
              </span>
              {isPlotLocating && (
                <span
                  role="progressbar"
                  aria-label="Locating earthquake"
                  className="mt-0.5 w-full h-1 bg-amber-200 rounded-full overflow-hidden block"
                >
                  <span className="block h-full w-1/2 bg-amber-600 rounded-full animate-eqp-indeterminate" />
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleOpenNearestPlacesPopup()}
              title="Show Nearest Places (nearest cities, towns, fault generators, and main office reference)"
              aria-haspopup="dialog"
              aria-expanded={nearestPlacesPopupOpen}
              className={`group w-full py-2 px-1 border flex flex-col items-center gap-1 text-[10px] font-bold ${getWorkstationButtonClass(
                {
                  buttonStyle,
                  iconStyle,
                  action: 'locate',
                  surface: 'rail',
                  active: nearestPlacesPopupOpen,
                }
              )}`}
            >
              <WorkstationActionIcon preset={iconStyle} action="locate" size="rail" />
              <span className="tracking-tight">Locate</span>
            </button>

            <button
              type="button"
              onClick={() => setMagnitudePopupOpen(true)}
              title="Compute Magnitude Using Time Duration"
              className={`group w-full py-2 px-1 border flex flex-col items-center gap-1 text-[10px] font-bold ${getWorkstationButtonClass(
                {
                  buttonStyle,
                  iconStyle,
                  action: 'magnitude',
                  surface: 'rail',
                  active: magnitudePopupOpen || activeSection === 'magnitude',
                }
              )}`}
            >
              <WorkstationActionIcon preset={iconStyle} action="magnitude" size="rail" />
              <span className="tracking-tight">Magnitude</span>
            </button>

            <button
              type="button"
              onClick={() => navigateEqpModule('bulletin', 'bulletin')}
              className={`group w-full py-2 px-1 border flex flex-col items-center gap-1 text-[10px] font-bold ${getWorkstationButtonClass(
                {
                  buttonStyle,
                  iconStyle,
                  action: 'bulletin',
                  surface: 'rail',
                  active: activeSection === 'bulletin' && eqpTab === 'bulletin',
                }
              )}`}
            >
              <WorkstationActionIcon preset={iconStyle} action="bulletin" size="rail" />
              <span className="tracking-tight">Bulletin</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const html = getCurrentDisplayedBulletinHtml();
                const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = displayedBulletinFilename;
                a.click();
                URL.revokeObjectURL(url);
                showNotice(`Downloaded Bulletin HTML webpage: ${displayedBulletinFilename}`);
              }}
              title="Download Bulletin HTML Webpage"
              className={`group w-full py-2 px-1 border flex flex-col items-center gap-1 text-[10px] font-bold ${getWorkstationButtonClass(
                {
                  buttonStyle,
                  iconStyle,
                  action: 'webpage',
                  surface: 'rail',
                  active: false,
                }
              )}`}
            >
              <WorkstationActionIcon preset={iconStyle} action="webpage" size="rail" />
              <span className="tracking-tight">WebPage</span>
            </button>
          </div>
        </aside>

        {/* Column 3: Main Tabbed Workstation Area */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#0073b6]">
          {/* Tab Strip */}
          <div className="bg-[#dce3ed] border-b border-[#5b7da4] px-3.5 pt-2 flex flex-wrap items-end justify-between gap-2 text-[11px] shrink-0">
            <div className="flex flex-wrap items-end">
              {eqpTabsLeft.map((tab) => {
                const active = eqpTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => navigateEqpModule(tab.section, tab.id)}
                    className={`eqp-tab-ext eqp-tab-ext-main ${active ? 'eqp-tab-ext-active' : ''}`}
                  >
                    {tab.icon}
                    <span className="font-bold tracking-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end">
              {eqpTabsRight.map((tab) => {
                const active = eqpTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => navigateEqpModule(tab.section, tab.id)}
                    className={`eqp-tab-ext eqp-tab-ext-main ${active ? 'eqp-tab-ext-active' : ''}`}
                  >
                    {tab.icon}
                    <span className="font-bold tracking-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab-Specific Action Toolbar (hidden on Intensity, Research, Tsunami, Social Media, and Settings tabs) */}
          {eqpTab !== 'intensity' &&
            eqpTab !== 'research' &&
            eqpTab !== 'tsunami' &&
            eqpTab !== 'social-media' &&
            activeSection !== 'social-media' &&
            eqpTab !== 'settings' &&
            activeSection !== 'settings' &&
            (() => {
            const isDataTab = eqpTab === 'data';
            const isMapTab = eqpTab === 'map';
            const toolbarEdited = isBulletinTab
              ? isBulletinEdited
              : isPrimerTab
                ? isPrimerEdited
                : isCurrentEventEdited;
            const toolbarSaved = isBulletinTab
              ? isBulletinSaved
              : isPrimerTab
                ? isPrimerSaved
                : isCurrentEventSaved;
            const showPrintBtn =
              isDataTab ||
              eqpTab === 'bulletin';

            const renderToolbarUnsavedPrompt = (action: 'new' | 'open' | 'print') => {
              const shouldShowPrimerNewPrompt =
                isPrimerTab && action === 'new' && primerPanelStatus.hasPrimer;
              if ((!toolbarEdited && !shouldShowPrimerNewPrompt) || toolbarPromptAction !== action) {
                return null;
              }

              if (isPrimerTab) {
                if (action === 'print') return null;
                const primerLabel =
                  primerPanelStatus.primerTitle || displayedPrimerFilename;
                const primerConfig =
                  action === 'new'
                    ? {
                        ariaLabel:
                          'Save or discard the created primer before creating a new primer',
                        heading: isPrimerEdited
                          ? `Unsaved Created Primer (${primerLabel})`
                          : `Created Primer (${primerLabel})`,
                        promptText:
                          'A primer is currently open. Would you like to save or discard the created primer before creating a new one?',
                        discardLabel: 'Discard & New',
                        saveLabel: 'Save & New',
                        onDiscard: () => {
                          setToolbarPromptAction(null);
                          const isSavedOnDisk = Boolean(
                            primerPanelStatus.primerId &&
                              savedPrimerTargetsById[primerPanelStatus.primerId]
                          );
                          primerControllerRef.current?.discardAndCreateNewPrimer({
                            removeUnpublishedAutoDraft: !isSavedOnDisk,
                          });
                        },
                      }
                    : {
                        ariaLabel:
                          'Save or discard unsaved primer edits before opening a saved primer',
                        heading: `Unsaved Edits in Primer (${primerLabel})`,
                        promptText:
                          'The current primer has unsaved edits. Save or discard your changes before opening another saved primer?',
                        discardLabel: 'Discard & Open',
                        saveLabel: 'Save & Open',
                        onDiscard: () => {
                          setToolbarPromptAction(null);
                          primerControllerRef.current?.discardEdits();
                          setOpenExplorerMode('primer');
                          void refreshSavedPrimerFiles();
                          setOpenExplorerOpen(true);
                        },
                      };

                return (
                  <div
                    role="dialog"
                    aria-label={primerConfig.ariaLabel}
                    className="animate-eqp-fade-in absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-slate-300 bg-white shadow-xl p-3 text-xs text-slate-800 space-y-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {primerConfig.heading}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {primerConfig.promptText}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setToolbarPromptAction(null)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={primerConfig.onDiscard}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        {primerConfig.discardLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setToolbarPromptAction(null);
                          handleSavePrimer({ nextAction: action });
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        {primerConfig.saveLabel}
                      </button>
                    </div>
                  </div>
                );
              }

              if (isBulletinTab) {
                if (action === 'print') return null;
                const bulletinConfig =
                  action === 'new'
                    ? {
                        ariaLabel: 'Save or discard edited bulletin parameters before creating new bulletin',
                        promptText:
                          'Bulletin parameters have been edited. Save or discard your changes before creating a new bulletin?',
                        discardLabel: 'Discard & New',
                        saveLabel: 'Save & New',
                        onDiscard: () => {
                          discardBulletinEdits();
                          createNewBulletinDraft();
                        },
                      }
                    : {
                        ariaLabel: 'Save or discard edited bulletin parameters before opening .HTML bulletin',
                        promptText:
                          'Bulletin parameters have been edited. Save or discard your changes before opening another bulletin?',
                        discardLabel: 'Discard & Open',
                        saveLabel: 'Save & Open',
                        onDiscard: () => {
                          discardBulletinEdits();
                          setOpenExplorerMode('bulletin');
                          void refreshSavedBulletinFiles();
                          setOpenExplorerOpen(true);
                        },
                      };

                return (
                  <div
                    role="dialog"
                    aria-label={bulletinConfig.ariaLabel}
                    className="animate-eqp-fade-in absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-slate-300 bg-white shadow-xl p-3 text-xs text-slate-800 space-y-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          Unsaved Edits in Bulletin {displayedBulletinFilename}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                          {bulletinConfig.promptText}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setToolbarPromptAction(null)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={bulletinConfig.onDiscard}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        {bulletinConfig.discardLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setToolbarPromptAction(null);
                          handleSaveBulletin({ nextAction: action });
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        {bulletinConfig.saveLabel}
                      </button>
                    </div>
                  </div>
                );
              }

              const config =
                action === 'new'
                  ? {
                      ariaLabel: 'Save or discard edited earthquake event before creating new event',
                      promptText:
                        'The current earthquake event has been edited. Save or discard your changes before starting a new event?',
                      discardLabel: 'Discard & New',
                      saveLabel: 'Save & New',
                      onDiscard: () => discardCurrentEventAndCreateNew(),
                    }
                  : action === 'open'
                    ? {
                        ariaLabel: 'Save or discard edited earthquake event before opening .EQP file',
                        promptText:
                          'The current earthquake event has been edited. Save or discard your changes before opening another .EQP file?',
                        discardLabel: 'Discard & Open',
                        saveLabel: 'Save & Open',
                        onDiscard: () => {
                          discardCurrentEventEdits();
                          setOpenExplorerMode('eqp');
                          setOpenExplorerOpen(true);
                        },
                      }
                    : {
                        ariaLabel: 'Save or discard edited earthquake event before printing EQ Data',
                        promptText:
                          'The current earthquake event has been edited. Save or discard your changes before printing EQ Data?',
                        discardLabel: 'Discard & Print',
                        saveLabel: 'Save & Print',
                        onDiscard: () => {
                          const reverted = discardCurrentEventEdits();
                          void handleDataPrint(reverted);
                        },
                      };

              return (
                <div
                  role="dialog"
                  aria-label={config.ariaLabel}
                  className="animate-eqp-fade-in absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-slate-300 bg-white shadow-xl p-3 text-xs text-slate-800 space-y-2.5"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">
                        Unsaved Edits in {activeEvent.filename || activeEvent.id}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                        {config.promptText}
                      </p>
                      {hasDraftPickEdits && (
                        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mt-1.5 leading-snug">
                          Tip: Press Enter on the bottom station input row if you want to commit that row before saving.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setToolbarPromptAction(null)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={config.onDiscard}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    >
                      {config.discardLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setToolbarPromptAction(null);
                        handleSaveEvent({ nextAction: action });
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" />
                      {config.saveLabel}
                    </button>
                  </div>
                </div>
              );
            };

            const newActionPrompts = isPrimerTab
              ? primerPanelStatus.hasPrimer
              : toolbarEdited;

            const toolbarActionBtnCls =
              'group px-2.5 py-1.5 min-w-[54px] rounded-sm border border-transparent bg-white/[0.02] hover:bg-white/45 hover:border-slate-900 text-[#47f0ff] font-bold [text-shadow:0_1px_2px_rgba(2,6,23,0.85)] inline-flex flex-col items-center justify-center gap-1 leading-tight transition-colors cursor-pointer';

            return (
              <div className="bg-gradient-to-b from-[#d2def8] via-[#4159a8] to-[#000b6e] border-2 border-[#f97316] px-3 py-2 min-h-[68px] flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {!isMapTab && (
                    <>
                      <div ref={newPromptRef} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        isBulletinTab
                          ? handleRequestNewBulletin('toolbar')
                          : isPrimerTab
                            ? handleRequestNewPrimer('toolbar')
                            : handleRequestNewEvent('toolbar')
                      }
                      aria-expanded={newActionPrompts ? toolbarPromptAction === 'new' : undefined}
                      aria-haspopup={newActionPrompts ? 'dialog' : undefined}
                      title={
                        isBulletinTab
                          ? toolbarEdited
                            ? 'Create a new bulletin draft (will ask to save or discard parameter edits)'
                            : 'Reset bulletin parameters and create a new bulletin draft'
                          : isPrimerTab
                            ? primerPanelStatus.hasPrimer
                              ? 'Create a new earthquake primer (will ask to save or discard the created primer)'
                              : 'Create a new earthquake primer draft'
                            : toolbarEdited
                              ? 'Create a new earthquake event (will ask to save or discard current edits)'
                              : 'Create a new blank earthquake event'
                      }
                      className={`${toolbarActionBtnCls} ${
                        toolbarPromptAction === 'new' ? 'ring-1 ring-amber-400' : ''
                      }`}
                    >
                      <WorkstationActionIcon preset={iconStyle} action="new" size="toolbar-lg" />
                      <span className="inline-flex items-center gap-0.5">
                        <span>New</span>
                        {newActionPrompts && (
                          <ChevronDown className="w-3 h-3 text-current opacity-85" />
                        )}
                      </span>
                    </button>
                    {renderToolbarUnsavedPrompt('new')}
                  </div>

                  <div ref={openPromptRef} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        isBulletinTab
                          ? handleRequestOpenBulletin('toolbar')
                          : isPrimerTab
                            ? handleRequestOpenPrimer('toolbar')
                            : handleRequestOpenEvent('toolbar')
                      }
                      aria-expanded={toolbarEdited ? toolbarPromptAction === 'open' : undefined}
                      aria-haspopup={toolbarEdited ? 'dialog' : undefined}
                      title={
                        isBulletinTab
                          ? toolbarEdited
                            ? 'Open .html bulletin (will ask to save or discard parameter edits)'
                            : `Browse and open saved .html bulletins starting at ${solutionDrive}\\EARTHQUAKE\\BULLETIN_EQ`
                          : isPrimerTab
                            ? toolbarEdited
                              ? 'Open saved primer (will ask to save or discard unsaved primer edits)'
                              : `Browse and open saved primers starting at ${solutionDrive}\\EARTHQUAKE\\PRIMER_EQ`
                            : toolbarEdited
                              ? 'Open .eqp solution (will ask to save or discard current edits)'
                              : `Browse and open .eqp solutions starting at ${solutionDrive}\\EARTHQUAKE\\SOLUTION_EQ`
                      }
                      className={`${toolbarActionBtnCls} ${
                        toolbarPromptAction === 'open' ? 'ring-1 ring-amber-400' : ''
                      }`}
                    >
                      <WorkstationActionIcon preset={iconStyle} action="open" size="toolbar-lg" />
                      <span className="inline-flex items-center gap-0.5">
                        <span>Open</span>
                        {toolbarEdited && (
                          <ChevronDown className="w-3 h-3 text-current opacity-85" />
                        )}
                      </span>
                    </button>
                    {renderToolbarUnsavedPrompt('open')}
                  </div>

                  <button
                    type="button"
                    disabled={
                      isBulletinTab
                        ? isSavingBulletin
                        : isPrimerTab
                          ? isSavingPrimer
                          : isSavingEqp
                    }
                    onClick={() => {
                      if (isBulletinTab) {
                        handleSaveBulletin();
                      } else if (isPrimerTab) {
                        handleSavePrimer();
                      } else {
                        handleSaveEvent();
                      }
                    }}
                    title={
                      isBulletinTab
                        ? `Save HTML bulletin to ${resolvedBulletinTarget.fullPath}`
                        : isPrimerTab
                          ? primerPanelStatus.hasPrimer
                            ? `Save created primer to ${resolvedPrimerTarget.fullPath} and browser storage`
                            : 'Create or generate a primer first before saving'
                          : isDataTab
                            ? `Save EQ data to ${resolvedSaveTarget.fullPath}`
                            : 'Save current solution to catalog'
                    }
                    className={`${toolbarActionBtnCls} disabled:opacity-60 ${
                      toolbarEdited ? 'ring-1 ring-amber-300' : ''
                    }`}
                  >
                    <WorkstationActionIcon preset={iconStyle} action="save" size="toolbar-lg" />
                    <span>
                      {(isBulletinTab
                        ? isSavingBulletin
                        : isPrimerTab
                          ? isSavingPrimer
                          : isSavingEqp)
                        ? 'Saving...'
                        : 'Save'}
                    </span>
                  </button>

                  <span
                    role="status"
                    title={
                      isBulletinTab
                        ? toolbarEdited
                          ? `Bulletin ${displayedBulletinFilename} has unsaved parameter edits`
                          : toolbarSaved
                            ? `Bulletin ${displayedBulletinFilename} is saved`
                            : `Bulletin draft ${displayedBulletinFilename} (not yet saved to disk)`
                        : isPrimerTab
                          ? !primerPanelStatus.hasPrimer
                            ? 'No primer created yet for this event'
                            : toolbarEdited
                              ? `Primer ${primerPanelStatus.primerTitle || displayedPrimerFilename} has unsaved changes`
                              : toolbarSaved
                                ? `Primer ${primerPanelStatus.primerTitle || displayedPrimerFilename} is saved`
                                : `Primer draft ${displayedPrimerFilename}`
                          : toolbarEdited
                            ? `Event ${resolvedSaveTarget.filename} has unsaved edits`
                            : toolbarSaved
                              ? `Event ${resolvedSaveTarget.filename} is saved`
                              : `New blank event ${resolvedSaveTarget.filename} (no edits yet)`
                    }
                    className={`px-2 py-0.5 rounded-xs border text-[10px] font-semibold inline-flex items-center gap-1 shadow-2xs ${
                      toolbarEdited
                        ? 'bg-amber-100 border-amber-400 text-amber-950'
                        : toolbarSaved
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
                          : 'bg-slate-100 border-slate-400 text-slate-800'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        toolbarEdited
                          ? 'bg-amber-600'
                          : toolbarSaved
                            ? 'bg-emerald-600'
                            : 'bg-slate-500'
                      }`}
                    />
                    {isPrimerTab
                      ? !primerPanelStatus.hasPrimer
                        ? 'No Primer'
                        : toolbarEdited
                          ? 'Edited'
                          : 'Saved'
                      : toolbarEdited
                        ? 'Edited'
                        : toolbarSaved
                          ? 'Saved'
                          : 'New · Unedited'}
                  </span>
                    </>
                  )}

                  {showPrintBtn && (
                    <div ref={printPromptRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (isDataTab) {
                            handleRequestDataPrint('toolbar');
                          } else if (isBulletinTab) {
                            handlePrintDisplayedBulletin();
                          } else {
                            handleTriggerPrintBulletin();
                          }
                        }}
                        disabled={isGeneratingPdf || isCheckingPrinter || isPrintingDirect}
                        aria-expanded={
                          isDataTab && isCurrentEventEdited
                            ? toolbarPromptAction === 'print'
                            : undefined
                        }
                        aria-haspopup={
                          isDataTab && isCurrentEventEdited ? 'dialog' : undefined
                        }
                        title={
                          isDataTab
                            ? isCurrentEventEdited
                              ? 'Print EQ Data (will ask to save or discard current edits)'
                              : hostPrinterStatus?.connected && hostPrinterStatus.defaultPrinter
                                ? `Print EQ Data to default system printer "${hostPrinterStatus.defaultPrinter}"`
                                : 'Print EQ Data to connected default system printer (shows options if none connected)'
                            : isBulletinTab
                              ? `Print currently displayed bulletin (${displayedBulletinFilename})`
                              : 'Generate print-ready PDF bulletin'
                        }
                        className={`${toolbarActionBtnCls} disabled:opacity-60 ${
                          isDataTab && toolbarPromptAction === 'print' ? 'ring-1 ring-amber-400' : ''
                        }`}
                      >
                        <WorkstationActionIcon preset={iconStyle} action="print" size="toolbar-lg" />
                        <span className="inline-flex items-center gap-0.5">
                          <span>
                            {isCheckingPrinter || isPrintingDirect ? 'Printing...' : 'Print'}
                          </span>
                          {isDataTab && isCurrentEventEdited && (
                            <ChevronDown className="w-3 h-3 text-current opacity-85" />
                          )}
                        </span>
                      </button>
                      {isDataTab && renderToolbarUnsavedPrompt('print')}
                    </div>
                  )}

                  {isDataTab && (
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="Travel-Time Model"
                        value={travelTimeModelId}
                        onChange={(e) => setTravelTimeModelId(e.target.value as TravelTimeModelId)}
                        className="px-2 py-1.5 rounded-xs bg-white/90 border border-slate-700 text-slate-900 font-semibold text-xs"
                        title="Select 1D travel-time model (unverified models remain disabled until authoritative tables pass verification)"
                      >
                        {getAllModelCatalogMetadata().map((m) => (
                          <option
                            key={m.id}
                            value={m.id}
                            disabled={!m.available}
                            title={m.available ? m.name : m.unavailableReason}
                          >
                            {m.available ? m.shortLabel : `${m.shortLabel} [Unavailable]`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setModelSettingsOpen(true)}
                        title="Inspect model metadata, domain bounds, checksums, and delay correction profile"
                        className={toolbarActionBtnCls}
                      >
                        <WorkstationActionIcon
                          preset={iconStyle}
                          action="model-settings"
                          size="toolbar-lg"
                        />
                        <span className="hidden xl:inline">Model Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModelComparisonOpen(true)}
                        title="Compare fixed-hypocenter residuals and independent relocations across models"
                        className={toolbarActionBtnCls}
                      >
                        <WorkstationActionIcon
                          preset={iconStyle}
                          action="compare-models"
                          size="toolbar-lg"
                        />
                        <span className="hidden xl:inline">Compare Models</span>
                      </button>
                    </div>
                  )}
                </div>

                {isDataTab && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => navigateEqpModule('assistant', 'utils')}
                      className={`${toolbarActionBtnCls} min-w-[58px]`}
                    >
                      <WorkstationActionIcon preset={iconStyle} action="ai-analyst" size="toolbar-lg" />
                      <span>AI Analyst</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Feedback Toast Banner (Non-intrusive) */}
          {feedbackNotice && (
            <div className="bg-slate-900 text-white px-4 py-1.5 text-xs flex items-center justify-between gap-4 shrink-0">
              <span className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{feedbackNotice}</span>
              </span>
              <button
                type="button"
                onClick={() => setFeedbackNotice(null)}
                className="text-slate-400 hover:text-white"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Ocean-Blue Main Workspace Viewport */}
          <main
            className={`flex-1 min-h-0 overflow-y-auto ${
              activeSection === 'bulletin'
                ? 'p-0 flex flex-col bg-[#f0f0f0]'
                : 'p-3 sm:p-4 space-y-4 bg-[#0073b6]'
            }`}
          >

          {/* VIEW 1: LOCATE & RESIDUALS */}
          {activeSection === 'locate' && (
            <div className="space-y-5">
              {/* Adopted Model Provenance Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-sky-100 bg-[#005a94]/80 border border-white/20 px-3 py-1.5 rounded-xs">
                <span>
                  {isUnlocated ? 'Selected Model: ' : 'Model: '}
                  <strong className="text-white">
                    {activeEvent.locationMetadata
                      ? `${activeEvent.locationMetadata.modelName} (${activeEvent.locationMetadata.modelVersion}) · ${activeEvent.locationMetadata.solver} · ${activeEvent.locationMetadata.correctionProfile}`
                      : 'Legacy / Pre-calculated JBTAB.PS'}
                  </strong>
                  {activeEvent.locationMetadata?.depthFixed !== undefined && (
                    <span className="ml-2 text-sky-200">
                      · Depth {activeEvent.locationMetadata.depthFixed ? 'Fixed' : 'Free'}
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {!isUnlocated && activeEvent.locationMetadata?.weightedRmsSec !== undefined && (
                    <span>
                      RMS {activeEvent.rmsSec.toFixed(2)}s · WRMS{' '}
                      {activeEvent.locationMetadata.weightedRmsSec.toFixed(2)}s
                      {` · ERH ±${activeEvent.errKm.toFixed(2)} km`}
                      {activeEvent.locationMetadata.errDepthKm != null
                        ? ` · ERZ ±${activeEvent.locationMetadata.errDepthKm.toFixed(1)} km`
                        : ''}
                      {activeEvent.locationMetadata.azimuthalGapDeg != null
                        ? ` · Gap ${activeEvent.locationMetadata.azimuthalGapDeg}°`
                        : ''}
                      {activeEvent.locationMetadata.conditionNumber != null
                        ? ` · Cond ${activeEvent.locationMetadata.conditionNumber.toFixed(1)}`
                        : ''}
                    </span>
                  )}
                  {activeLocationQuality && (
                    <span
                      title={formatLocationQualityTooltip(activeLocationQuality)}
                      className={`px-2 py-0.5 rounded-xs border text-[10px] font-bold tracking-tight cursor-help ${
                        activeLocationQuality.grade === 'A'
                          ? 'bg-emerald-500/20 border-emerald-300 text-emerald-100'
                          : activeLocationQuality.grade === 'B'
                            ? 'bg-sky-400/20 border-sky-200 text-sky-50'
                            : activeLocationQuality.grade === 'C'
                              ? 'bg-amber-400/25 border-amber-300 text-amber-100'
                              : 'bg-rose-500/25 border-rose-300 text-rose-100'
                      }`}
                    >
                      LQI {activeLocationQuality.score}/100 · {activeLocationQuality.grade} ({activeLocationQuality.label})
                    </span>
                  )}
                </div>
              </div>

              {isPlotResultStale && (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xs bg-amber-50 border border-amber-500 text-amber-950 text-xs font-sans"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Previous location results are stale — station observations, origin time, or trial depth changed since last calculation.
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRunPlotLocate()}
                    disabled={isPlotLocating}
                    className="px-2.5 py-1 rounded-xs bg-amber-700 hover:bg-amber-800 disabled:opacity-60 text-white font-semibold text-[11px] shrink-0"
                  >
                    {isPlotLocating ? 'Locating Earthquake...' : 'Recompute (PLOT)'}
                  </button>
                </div>
              )}

              {(lastPlotWarningsByEvent[activeEvent.id]?.length ?? 0) > 0 && !candidateSolution && (
                <div className="px-3 py-1.5 rounded-xs bg-sky-950/60 border border-sky-300/30 text-sky-100 text-[11px] font-sans space-y-0.5">
                  {lastPlotWarningsByEvent[activeEvent.id].map((w, idx) => (
                    <div key={`plot-warn-${idx}`}>• {w}</div>
                  ))}
                </div>
              )}

              {/* Candidate Solution Review Panel (shown whenever Locate calculated a candidate or failed) */}
              {candidateSolution && candidateSolution.eventId === activeEvent.id && (
                <CandidateSolutionPanel
                  candidate={candidateSolution}
                  adoptedEvent={activeEvent}
                  stale={isCandidateStale}
                  onAdopt={() => void handleAdoptCandidateSolution()}
                  onDiscard={handleDiscardCandidateSolution}
                  onRecalculate={handleRunLocate}
                />
              )}

              {/* Classic Ocean-Blue PLOT.OUT Console Readout (Matching EQP 11.20a Main View) */}
              <section
                aria-label="PLOT.OUT Hypocenter & Residuals Console"
                className="text-white font-mono text-xs tabular-nums space-y-3"
              >
                <div className="overflow-x-auto pb-1 space-y-3">
                  {/* Hypocenter Iteration & Error Block */}
                  <div className="min-w-[580px] leading-snug text-sky-100">
                    <div className="grid grid-cols-[44px_76px_84px_66px_32px_34px_56px_64px_88px] text-white">
                      <span>{activeEvent.iterations}</span>
                      <span>{isUnlocated ? '—' : activeEvent.lat.toFixed(3)}</span>
                      <span>{isUnlocated ? '—' : activeEvent.lon.toFixed(3)}</span>
                      <span>{isUnlocated ? '—' : activeEvent.depthKm.toFixed(2)}</span>
                      <span>{Number(gmtTimeParts[0] ?? 0)}</span>
                      <span>{Number(gmtTimeParts[1] ?? 0)}</span>
                      <span>{gmtTimeParts[2] ?? '00.00'}</span>
                      <span>{isUnlocated ? '—' : activeEvent.rmsSec.toFixed(2)}</span>
                      <span
                        title={formatLocationQualityTooltip(activeLocationQuality)}
                        className="font-semibold cursor-help"
                      >
                        {activeLocationQuality
                          ? `${activeLocationQuality.score} (${activeLocationQuality.grade})`
                          : '—'}
                      </span>
                    </div>
                    <div className="grid grid-cols-[44px_76px_84px_66px_32px_34px_56px_64px_88px] text-sky-200/95">
                      <span>IT</span>
                      <span>LAT</span>
                      <span>LON</span>
                      <span>DEPTH</span>
                      <span>HR</span>
                      <span>MIN</span>
                      <span>SEC</span>
                      <span>RMS</span>
                      <span
                        title={formatLocationQualityTooltip(activeLocationQuality)}
                        className="cursor-help underline decoration-dotted underline-offset-2"
                      >
                        LQI
                      </span>
                    </div>
                    <div className="grid grid-cols-[44px_76px_84px_66px_32px_34px_56px_64px_88px] text-white">
                      <span>{activeEvent.iterations}</span>
                      <span>{isUnlocated ? '—' : activeEvent.lat.toFixed(3)}</span>
                      <span>{isUnlocated ? '—' : activeEvent.lon.toFixed(3)}</span>
                      <span>{isUnlocated ? '—' : activeEvent.depthKm.toFixed(2)}</span>
                      <span>{Number(gmtTimeParts[0] ?? 0)}</span>
                      <span>{Number(gmtTimeParts[1] ?? 0)}</span>
                      <span>{gmtTimeParts[2] ?? '00.00'}</span>
                      <span>{isUnlocated ? '—' : activeEvent.rmsSec.toFixed(2)}</span>
                      <span
                        title={formatLocationQualityTooltip(activeLocationQuality)}
                        className="font-semibold cursor-help"
                      >
                        {activeLocationQuality
                          ? `${activeLocationQuality.score} (${activeLocationQuality.grade})`
                          : '—'}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-[44px_76px_84px_66px_122px_64px] text-sky-200/95">
                      <span>ERR</span>
                      <span>DEG</span>
                      <span>DEG</span>
                      <span>KM</span>
                      <span />
                      <span>SEC</span>
                    </div>
                    <div className="grid grid-cols-[44px_76px_84px_66px_122px_64px] text-white">
                      <span />
                      <span>{isUnlocated ? '—' : activeEvent.errLatDeg.toFixed(3)}</span>
                      <span>{isUnlocated ? '—' : activeEvent.errLonDeg.toFixed(3)}</span>
                      <span>{isUnlocated ? '—' : activeEvent.errKm.toFixed(2)}</span>
                      <span />
                      <span>{isUnlocated ? '—' : (activeEvent.errSec ?? activeEvent.rmsSec * 0.98).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Classic Station Residuals Console Table directly on #0073b6 */}
                  <div className="min-w-[660px] pt-2">
                    <div className="grid grid-cols-[48px_60px_62px_62px_62px_62px_66px_66px_66px_66px] text-right font-semibold text-sky-100 border-b border-white/20 pb-0.5 select-none">
                      {(
                        [
                          { key: 'sta', label: 'STA', align: 'left', colorClass: '' },
                          { key: 'toa', label: 'TOA', align: 'right', colorClass: '' },
                          { key: 'azim', label: 'AZIM', align: 'right', colorClass: '' },
                          { key: 'delta', label: 'DELTA', align: 'right', colorClass: '' },
                          { key: 'resP', label: 'RESp', align: 'right', colorClass: 'text-[#ff5c5c]' },
                          { key: 'resS', label: 'RESs', align: 'right', colorClass: 'text-[#fde047]' },
                          { key: 'obsP', label: 'OBSp', align: 'right', colorClass: '' },
                          { key: 'obsS', label: 'OBSs', align: 'right', colorClass: '' },
                          { key: 'calcP', label: 'CALCp', align: 'right', colorClass: '' },
                          { key: 'calcS', label: 'CALCs', align: 'right', colorClass: '' },
                        ] as const
                      ).map((col) => {
                        const isSorted = residualsTableSort?.key === col.key;
                        return (
                          <button
                            key={col.key}
                            type="button"
                            onClick={() => cycleResidualsTableSort(col.key)}
                            title={`Sort residuals by ${col.label}`}
                            className={`inline-flex items-center gap-0.5 cursor-pointer transition-colors hover:text-white ${
                              col.align === 'left' ? 'justify-start text-left' : 'justify-end text-right'
                            } ${col.colorClass} ${isSorted ? 'underline decoration-white/70 underline-offset-2' : ''}`}
                          >
                            <span>{col.label}</span>
                            {isSorted &&
                              (residualsTableSort.dir === 'asc' ? (
                                <ArrowUp className="w-2.5 h-2.5 shrink-0" />
                              ) : (
                                <ArrowDown className="w-2.5 h-2.5 shrink-0" />
                              ))}
                          </button>
                        );
                      })}
                    </div>
                    <div className="divide-y divide-white/5">
                      {sortedResidualPicks.length === 0 ? (
                        <div className="py-3 text-left font-sans text-xs text-sky-100/80">
                          Awaiting phase picks — enter station arrivals in the left rail and click PLOT or Locate.
                        </div>
                      ) : (
                        sortedResidualPicks.map((pick) => {
                            const isSelected = selectedStation === pick.sta;
                            const pFlagged = highlightResP && Math.abs(pick.resP) >= 1.0;
                            const sFlagged =
                              highlightResS &&
                              pick.sTime.trim() !== '' &&
                              Math.abs(pick.resS) >= 0.8;
                            return (
                              <button
                                key={`plotout-${pick.id}`}
                                type="button"
                                onClick={() =>
                                  setSelectedStation(isSelected ? null : pick.sta)
                                }
                                className={`w-full grid grid-cols-[48px_60px_62px_62px_62px_62px_66px_66px_66px_66px] text-right py-0.5 transition-colors ${
                                  isSelected
                                    ? 'bg-[#005a94] text-white'
                                    : 'hover:bg-white/10 text-sky-100'
                                }`}
                              >
                                <span
                                  className={`text-left font-semibold ${
                                    pFlagged
                                      ? 'text-[#ff4d4d]'
                                      : sFlagged
                                        ? 'text-[#fde047]'
                                        : 'text-white'
                                  }`}
                                >
                                  {pick.sta}
                                </span>
                                <span>{pick.toa.toFixed(1)}</span>
                                <span>{pick.azim.toFixed(1)}</span>
                                <span>{pick.delta.toFixed(2)}</span>
                                <span
                                  className={
                                    pFlagged ? 'text-[#ff4d4d] font-bold' : ''
                                  }
                                >
                                  {pick.resP.toFixed(2)}
                                </span>
                                <span
                                  className={
                                    sFlagged ? 'text-[#fde047] font-bold' : ''
                                  }
                                >
                                  {pick.sTime.trim() ? pick.resS.toFixed(2) : '0.00'}
                                </span>
                                <span>{pick.obsP.toFixed(2)}</span>
                                <span>{pick.obsS.toFixed(2)}</span>
                                <span>{pick.calcP.toFixed(2)}</span>
                                <span>{pick.calcS.toFixed(2)}</span>
                              </button>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>

                {/* White Active Solution File Path Bar */}
                <div className="bg-white border border-slate-400 px-2.5 py-1 text-[11px] font-mono text-[#7c3e26] flex items-center justify-between gap-3">
                  <span className="truncate" title={resolvedSaveTarget.fullPath}>
                    {resolvedSaveTarget.fullPath}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigateEqpModule('settings', 'settings')}
                    className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-blue-700 hover:text-blue-900 shrink-0"
                    title="Configure Solution Drive in Settings"
                  >
                    <HardDrive className="w-3 h-3" />
                    Drive: {normalizeSolutionDrive(solutionDrive)}
                  </button>
                </div>
              </section>

              {/* Magnitude Results & Per-Event Selection Panel */}
              <MagnitudeResultsPanel
                event={activeEvent}
                settings={magnitudeSettings}
                metadata={activeEventMagnitudeMetadata}
                freshness={activeMagnitudeFreshness}
                onRecalculateMagnitude={handleRecalculateEventMagnitude}
                onSelectEventPreferredMethod={handleSelectEventPreferredMethod}
                onUpdateEventMethodSelection={handleUpdateEventMethodSelection}
                onResetEventToGlobalDefault={handleResetEventMethodToGlobalDefault}
                onToggleUncalibratedApproval={(approved) => {
                  updateActiveEvent(
                    (ev) => {
                      const baseMeta =
                        ev.magnitudeMetadata ??
                        evaluateEventMagnitudes({
                          event: ev,
                          settings: magnitudeSettings,
                          stations,
                        });
                      return {
                        ...ev,
                        magnitudeMetadata: approveUncalibratedMagnitudeMetadata(
                          baseMeta,
                          approved
                        ),
                      };
                    },
                    true,
                    {
                      label: approved
                        ? `Approve uncalibrated ${activeEventMagnitudeMetadata.selectedScale} for bulletin`
                        : `Revoke uncalibrated ${activeEventMagnitudeMetadata.selectedScale} approval`,
                    }
                  );
                }}
                onOpenLegacyDurationPopup={() => setMagnitudePopupOpen(true)}
                onOpenMagnitudeSettings={() => {
                  setSettingsSubTab('magnitude');
                  navigateEqpModule('settings', 'settings');
                }}
              />

              {/* Phase Travel-Time Scatter Chart (OBSp & OBSs vs Delta) */}
              <TravelTimeScatterChart
                picks={activeEvent.picks}
                highlightResP={highlightResP}
                highlightResS={highlightResS}
                selectedStation={selectedStation}
                onSelectStation={setSelectedStation}
              />

              {/* Hypocentral Depth-Frequency Distribution Chart */}
              <DepthFrequencyChart
                event={activeEvent}
                selectedStation={selectedStation}
                onSelectStation={setSelectedStation}
              />

              {/* Phase Picking AI Module */}
              <PhasePickingAIPanel
                key={`ai-picker-${activeEvent.id}-${workspaceResetNonce}`}
                events={events}
                activeEvent={activeEvent}
                stations={stations}
                selectedStation={selectedStation}
                onSelectStation={setSelectedStation}
                onApplySuggestions={handleApplyAiSuggestions}
              />
            </div>
          )}

          {/* VIEW 2: EPICENTER MAP */}
          {activeSection === 'map' && (() => {
            const locatedCatalogCount = events.filter((ev) => !isEventUnlocated(ev)).length;
            const otherLocatedCount = Math.max(
              0,
              events.filter((ev) => !isEventUnlocated(ev) && ev.id !== activeEvent.id).length
            );
            const selectedPick = selectedStation
              ? activeEvent.picks.find((p) => p.sta === selectedStation) ?? null
              : null;

            const isToolOpen = (id: MapToolPopoverId) =>
              pinnedMapTool === id || (pinnedMapTool === null && hoveredMapTool === id);

            const layersPanelBody = (
              <div className="p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <span className="text-[11px] font-medium text-slate-500">
                    Toggle map features &amp; GIS overlays
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMapShowFaults(true);
                      setMapShowVolcanoes(true);
                      setMapShowPlates(true);
                      setMapShowStations(true);
                      setMapRegionFilter('ALL');
                      setMapShowGrid(true);
                      setMapShowShakeMap(true);
                      setMapShowRangeRings(true);
                      setMapShowNearestPlaces(true);
                      setMapShowCatalogEvents(false);
                      setMapRulerActive(false);
                      setMapRulerPoints({ start: null, end: null });
                      setGeologyVisibility({ ...DEFAULT_GEOLOGY_LAYER_VISIBILITY });
                      setSelectedGeologyFeature(null);
                      setVisibleShakeBands(createDefaultVisibleBands());
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                  >
                    Reset All
                  </button>
                </div>

                <GeologicalLayersPanel
                  visibility={geologyVisibility}
                  onToggleLayer={handleToggleGeologyLayer}
                  activeFaultsData={gisActiveFaultsData}
                  trenchData={gisTrenchData}
                  manifest={gisManifest}
                  faultsLoading={gisFaultsLoading}
                  trenchesLoading={gisTrenchesLoading}
                  faultsError={gisFaultsError}
                  trenchesError={gisTrenchesError}
                  onRetryFaults={() => void ensureGisFaultsLoaded()}
                  onRetryTrenches={() => void ensureGisTrenchesLoaded()}
                />

                <div className="pt-2 border-t border-slate-200 text-[10px] font-semibold tracking-wider text-slate-500">
                  OPERATIONAL MAP LAYERS
                </div>

                <div className="divide-y divide-slate-100">
                  <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">ShakeMap Intensity Contours</div>
                      <div className="text-[11px] text-slate-500">
                        Peak PEIS {shakeMapData.peakRoman} ({shakeMapData.peakPgaPctG.toFixed(1)}%g)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mapShowShakeMap}
                      onChange={(e) => setMapShowShakeMap(e.target.checked)}
                      className="h-4 w-4 accent-orange-600 shrink-0"
                    />
                  </label>

                  <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">Active Tectonic Fault Lines</div>
                      <div className="text-[11px] text-slate-500">
                        {FAULT_TRACES.filter((f) => f.kind === 'fault').length} active fault systems
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mapShowFaults}
                      onChange={(e) => setMapShowFaults(e.target.checked)}
                      className="h-4 w-4 accent-rose-600 shrink-0"
                    />
                  </label>

                  <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">Active Volcanoes</div>
                      <div className="text-[11px] text-slate-500">
                        {ACTIVE_VOLCANOES.length} monitored edifices
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mapShowVolcanoes}
                      onChange={(e) => setMapShowVolcanoes(e.target.checked)}
                      className="h-4 w-4 accent-orange-600 shrink-0"
                    />
                  </label>

                  <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">Major Plate Boundaries</div>
                      <div className="text-[11px] text-slate-500">
                        {TECTONIC_PLATES.length} plates &amp; {FAULT_TRACES.filter((f) => f.kind === 'boundary').length} subduction trenches
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mapShowPlates}
                      onChange={(e) => setMapShowPlates(e.target.checked)}
                      className="h-4 w-4 accent-indigo-600 shrink-0"
                    />
                  </label>

                  <div className="py-2 space-y-2">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">Seismic Stations</div>
                        <div className="text-[11px] text-slate-500">
                          {mapRegionFilter === 'ALL'
                            ? `${activeEvent.picks.length} reporting · ${stations.length} PHILSTA`
                            : `${regionFilteredPicksCount}/${activeEvent.picks.length} reporting · ${regionFilteredStationsCount}/${stations.length} PHILSTA`}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={mapShowStations}
                        onChange={(e) => setMapShowStations(e.target.checked)}
                        className="h-4 w-4 accent-blue-600 shrink-0"
                      />
                    </label>
                    <div className="pl-2.5 border-l-2 border-slate-200 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="map-region-filter-popover"
                          className="text-[11px] font-medium text-slate-700"
                        >
                          Filter by Region
                        </label>
                        {mapRegionFilter !== 'ALL' && (
                          <button
                            type="button"
                            onClick={() => setMapRegionFilter('ALL')}
                            className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                          >
                            Show All
                          </button>
                        )}
                      </div>
                      <select
                        id="map-region-filter-popover"
                        value={mapRegionFilter}
                        onChange={(e) =>
                          setMapRegionFilter(e.target.value as StationRegionFilter)
                        }
                        disabled={!mapShowStations}
                        className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        <option value="ALL">All Regions (Philippines)</option>
                        <optgroup label="Island Groups">
                          {STATION_REGION_OPTIONS.filter((o) => o.group === 'Island Group').map(
                            (opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            )
                          )}
                        </optgroup>
                        <optgroup label="Administrative Regions">
                          {STATION_REGION_OPTIONS.filter(
                            (o) => o.group === 'Administrative Region'
                          ).map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">Coordinate Grid</div>
                      <div className="text-[11px] text-slate-500">1° latitude / longitude graticule</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mapShowGrid}
                      onChange={(e) => setMapShowGrid(e.target.checked)}
                      className="h-4 w-4 accent-slate-700 shrink-0"
                    />
                  </label>

                  <label className="py-2 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">Epicentral Range Rings</div>
                      <div className="text-[11px] text-slate-500">50, 100 &amp; 200 km radii</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mapShowRangeRings}
                      onChange={(e) => setMapShowRangeRings(e.target.checked)}
                      className="h-4 w-4 accent-sky-600 shrink-0"
                    />
                  </label>

                  <label className="pt-2 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">Nearest City Pins</div>
                      <div className="text-[11px] text-slate-500">Top nearest cities from CITY catalog</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mapShowNearestPlaces}
                      onChange={(e) => setMapShowNearestPlaces(e.target.checked)}
                      className="h-4 w-4 accent-emerald-600 shrink-0"
                    />
                  </label>
                </div>
              </div>
            );

            const geometryFaultsBody = (
              <div className="p-3.5 space-y-3 text-xs">
                {azimuthalGapStats ? (
                  <div className="space-y-2 bg-slate-50 border border-slate-200/80 rounded p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600 font-medium">Primary / Secondary GAP</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        {azimuthalGapStats.gapDeg}° / {azimuthalGapStats.secondaryGapDeg}°
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-xs bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          azimuthalGapStats.gapDeg <= 135
                            ? 'bg-emerald-500'
                            : azimuthalGapStats.gapDeg <= 210
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.round((azimuthalGapStats.gapDeg / 360) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                      <span>
                        Dmin:{' '}
                        {azimuthalGapStats.dminKm != null
                          ? `${azimuthalGapStats.dminKm.toFixed(1)} km`
                          : '—'}
                      </span>
                      <span>
                        Dmax:{' '}
                        {azimuthalGapStats.dmaxKm != null
                          ? `${azimuthalGapStats.dmaxKm.toFixed(1)} km`
                          : '—'}
                      </span>
                      <span>{azimuthalGapStats.activeStationCount} used</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 bg-slate-50 border border-slate-200 rounded p-2.5">
                    Locate hypocenter to compute azimuthal gap and nearest fault distances.
                  </p>
                )}

                <div className="pt-2 border-t border-slate-200">
                  <GisFaultDistanceCalculator
                    isUnlocated={isUnlocated}
                    epicenterLat={activeEvent.lat}
                    epicenterLon={activeEvent.lon}
                    depthKm={activeEvent.depthKm}
                    activeFaultsData={gisActiveFaultsData}
                    loading={gisFaultsLoading}
                    error={gisFaultsError}
                    onRetry={() => void ensureGisFaultsLoaded()}
                    onLoadData={() => void ensureGisFaultsLoaded()}
                    gisActiveLayerVisible={geologyVisibility.activeFaults}
                    onEnableGisLayer={(includePotentially) => {
                      void ensureGisManifestLoaded();
                      void ensureGisFaultsLoaded();
                      setGeologyVisibility((prev) => ({
                        ...prev,
                        activeFaults: true,
                        potentiallyActiveFaults:
                          prev.potentiallyActiveFaults || includePotentially,
                      }));
                    }}
                    onInspectFaultFeature={(feat) => {
                      setSelectedGeologyFeature(feat);
                    }}
                  />
                </div>

                {nearestFaults.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-600">
                      Schematic Faults &amp; Trenches (Reference)
                    </div>
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                      {nearestFaults.map((fault) => (
                        <div
                          key={`${fault.kind}-${fault.name}`}
                          className="px-2.5 py-1.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex items-center gap-1.5">
                            <span
                              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                                fault.kind === 'boundary' ? 'bg-indigo-600' : 'bg-rose-600'
                              }`}
                            />
                            <span className="truncate font-medium text-slate-800">{fault.name}</span>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] text-slate-700 shrink-0">
                            {fault.distanceKm.toFixed(1)} km {fault.bearingLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );

            const catalogOverlayBody = (
              <div className="p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">
                    Overlay depth-colored workspace events ({otherLocatedCount} others)
                  </span>
                  <label className="inline-flex items-center gap-1.5 font-medium text-slate-800 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={mapShowCatalogEvents}
                      onChange={(e) => setMapShowCatalogEvents(e.target.checked)}
                      className="h-3.5 w-3.5 accent-amber-600"
                    />
                    <span>Show</span>
                  </label>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded">
                  {events
                    .filter((ev) => !isEventUnlocated(ev))
                    .map((ev) => {
                      const isCurrent = ev.id === activeEvent.id;
                      const meta = ev.magnitudeMetadata;
                      const scaleLabel =
                        meta && meta.preferredMethodId !== 'eqp-legacy-ms'
                          ? meta.selectedScale
                          : formatLegacyScaleShort(ev.preferredScale);
                      const mag =
                        meta && meta.preferredMethodId !== 'eqp-legacy-ms'
                          ? meta.selectedMagnitude ?? 0
                          : ev.preferredScale === 'Ms'
                            ? ev.ms
                            : ev.preferredScale === 'Mb'
                              ? ev.mb
                              : ev.md;
                      return (
                        <button
                          key={`cat-${ev.id}`}
                          type="button"
                          onClick={() => setActiveEventId(ev.id)}
                          className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors ${
                            isCurrent
                              ? 'bg-blue-50 text-blue-950 font-semibold'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-mono text-[11px]">{ev.originDateLst}</span>{' '}
                            <span className="text-slate-500 font-mono text-[11px]">
                              {ev.originTimeLst.slice(0, 5)}
                            </span>
                          </div>
                          <div className="font-mono tabular-nums text-[11px] shrink-0">
                            {scaleLabel} {mag.toFixed(1)} · {ev.depthKm.toFixed(0)}km
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            );

            const inspectorBody = (
              <div className="p-3.5 space-y-3 text-xs">
                <div className="space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Epicenter</span>
                    <span className="font-mono font-medium tabular-nums">
                      {isUnlocated
                        ? 'Pending'
                        : `${activeEvent.lat.toFixed(3)}°N, ${activeEvent.lon.toFixed(3)}°E`}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Error Ellipse</span>
                    <span className="font-mono tabular-nums">
                      ±{activeEvent.errLatDeg.toFixed(3)}° / ±{activeEvent.errLonDeg.toFixed(3)}° ({activeEvent.errKm.toFixed(2)} km)
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Primary Place</span>
                    <span className="font-mono text-right">{primaryLocationLabel}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">{mainOffice.code} Vector</span>
                    <span className="font-mono text-right text-teal-800">
                      {isUnlocated
                        ? '—'
                        : activeEvent.centralOfficeBearing ||
                          formatCentralOfficeBearing(activeEvent.lat, activeEvent.lon, mainOffice)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Fault Generator</span>
                    <span className="font-mono text-right">
                      {selectedGenerator?.name ?? 'Unspecified'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-semibold text-slate-700">
                      Selected Station Inspector
                    </h3>
                    {selectedPick && (
                      <button
                        type="button"
                        onClick={() => setSelectedStation(null)}
                        className="text-[11px] text-slate-500 hover:text-slate-800"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {selectedPick ? (
                    <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded p-2.5 font-mono tabular-nums">
                      <div className="flex justify-between font-sans">
                        <span className="font-semibold text-slate-900">
                          Station {selectedPick.sta}
                        </span>
                        <span className="text-slate-500">
                          {selectedPick.pExcluded ? 'Excluded (*)' : 'Active'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Delta / Azim</span>
                        <span>
                          {selectedPick.delta.toFixed(2)}° / {selectedPick.azim.toFixed(1)}°
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">RESp / RESs</span>
                        <span>
                          {selectedPick.resP.toFixed(2)}s / {selectedPick.resS.toFixed(2)}s
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Coda / Polarity</span>
                        <span>
                          {selectedPick.duration ?? '—'}s / {selectedPick.polarity || '—'}
                        </span>
                      </div>
                      <div className="pt-1.5 border-t border-slate-200 font-sans">
                        <button
                          type="button"
                          onClick={() => navigateEqpModule('locate', 'data')}
                          className="w-full py-1.5 px-2.5 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
                        >
                          View {selectedPick.sta} in Locate View
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Click any station triangle on the map to inspect its arrival residual and azimuth.
                    </p>
                  )}
                </div>
              </div>
            );

            const shakeMapEngineBody = (
              <div className="space-y-3 text-xs">
                <label className="flex items-center justify-between gap-3 cursor-pointer pb-2 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">Show ShakeMap Overlay</div>
                    <div className="text-[11px] text-slate-500">
                      Peak PEIS {shakeMapData.peakRoman} · {shakeMapData.peakPgaPctG.toFixed(1)}%g
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={mapShowShakeMap}
                    onChange={(e) => setMapShowShakeMap(e.target.checked)}
                    className="h-4 w-4 accent-orange-600 shrink-0"
                  />
                </label>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-600 font-medium">Contour Bands (PEIS I–X)</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleApplyShakePreset('all')}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        All
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => handleApplyShakePreset(1.5)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        II+
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => handleApplyShakePreset(3.5)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        IV+
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => handleApplyShakePreset('none')}
                        className="text-slate-500 hover:text-slate-700 font-medium"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {SHAKEMAP_BANDS.map((band) => {
                      const isChecked = visibleShakeBands[band.roman] !== false;
                      const isGenerated = shakeMapData.contours.some(
                        (c) => c.band.roman === band.roman
                      );
                      const isVisibleOnMap = mapShowShakeMap && isChecked;
                      return (
                        <button
                          key={`layer-band-${band.roman}`}
                          type="button"
                          aria-pressed={isChecked}
                          title={`PEIS ${band.roman} (${band.label}, ${band.pgaLabel})${
                            isGenerated ? '' : ' — above current event peak'
                          }`}
                          onClick={() => handleToggleShakeBand(band.roman)}
                          className={`flex items-center justify-center gap-1 py-1 px-1 rounded border text-[11px] font-mono transition-colors ${
                            isVisibleOnMap
                              ? isGenerated
                                ? 'bg-white border-slate-300 text-slate-900 font-semibold shadow-2xs'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                              : 'bg-slate-50/70 border-slate-200/70 text-slate-400 line-through'
                          }`}
                        >
                          <span
                            className="inline-block w-2 h-2 rounded-xs border shrink-0"
                            style={{
                              backgroundColor: band.fillHex,
                              borderColor: band.strokeHex,
                              opacity: isVisibleOnMap ? (isGenerated ? 0.95 : 0.45) : 0.2,
                            }}
                          />
                          <span>{band.roman}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block">
                  <span className="font-medium text-slate-700">Attenuation Model (GMPE)</span>
                  <select
                    value={gmpeModel}
                    onChange={(e) => setGmpeModel(e.target.value as GmpeSelectionMode)}
                    className="mt-1 w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="auto">
                      Auto-Select ({autoSelectedGmpe.model.shortName})
                    </option>
                    {GMPE_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[11px] text-slate-500">
                  {gmpeModel === 'auto'
                    ? `Auto (${autoSelectedGmpe.model.name}): ${autoSelectedGmpe.reason}`
                    : GMPE_MODELS.find((m) => m.id === gmpeModel)?.description}
                </p>

                <div className="pt-1 border-t border-slate-100 space-y-2">
                  <label className="pt-1 flex items-center justify-between gap-3 cursor-pointer">
                    <div className="min-w-0">
                      <div className="text-slate-700 font-medium">Compare GMPEs</div>
                      <div className="text-[11px] text-slate-500">
                        Side-by-side ShakeMaps across two attenuation models
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={compareGmpeEnabled}
                      onChange={(e) => handleToggleCompareGmpe(e.target.checked)}
                      className="h-4 w-4 accent-blue-600 shrink-0"
                    />
                  </label>

                  {compareGmpeEnabled && compareShakeMapData && compareShakeMapStats && (
                    <div className="rounded border border-slate-200 bg-slate-50/80 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex-1 block">
                          <span className="text-[11px] font-medium text-slate-700">
                            Comparison Model (Model B)
                          </span>
                          <select
                            value={compareGmpeModel}
                            onChange={(e) =>
                              setCompareGmpeModel(e.target.value as GmpeModelId)
                            }
                            className="mt-1 w-full px-2 py-1 rounded border border-slate-300 bg-white text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {GMPE_MODELS.map((m) => (
                              <option key={`cmp-opt-${m.id}`} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const prevPrimary = shakeMapData.gmpeId;
                            setGmpeModel(compareGmpeModel);
                            setCompareGmpeModel(prevPrimary);
                          }}
                          title="Swap Model A and Model B"
                          className="mt-4 px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                        >
                          Swap A↔B
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono tabular-nums pt-1 border-t border-slate-200/70">
                        <div className="bg-white border border-slate-200/80 rounded px-2 py-1">
                          <div className="font-sans text-[10px] text-slate-500">
                            Δ Peak PGA (B − A)
                          </div>
                          {(() => {
                            const deltaPga =
                              compareShakeMapData.peakPgaPctG - shakeMapData.peakPgaPctG;
                            return (
                              <div
                                className={`font-semibold ${
                                  deltaPga > 0.05
                                    ? 'text-rose-700'
                                    : deltaPga < -0.05
                                      ? 'text-emerald-700'
                                      : 'text-slate-700'
                                }`}
                              >
                                {deltaPga >= 0 ? '+' : ''}
                                {deltaPga.toFixed(1)}%g
                              </div>
                            );
                          })()}
                        </div>
                        <div className="bg-white border border-slate-200/80 rounded px-2 py-1">
                          <div className="font-sans text-[10px] text-slate-500">
                            Δ Footprint (B − A)
                          </div>
                          {(() => {
                            const deltaArea =
                              compareShakeMapStats.totalVisibleAreaKm2 -
                              shakeMapStats.totalVisibleAreaKm2;
                            const rounded =
                              Math.abs(deltaArea) >= 10
                                ? Math.round(deltaArea).toLocaleString('en-US')
                                : deltaArea.toFixed(1);
                            return (
                              <div
                                className={`font-semibold ${
                                  deltaArea > 1
                                    ? 'text-amber-700'
                                    : deltaArea < -1
                                      ? 'text-sky-700'
                                      : 'text-slate-700'
                                }`}
                              >
                                {deltaArea >= 0 ? '+' : ''}
                                {rounded} km²
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <label className="pt-1 flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-slate-700 font-medium">
                    Basin &amp; Topography Site Amp (Vs30)
                  </span>
                  <input
                    type="checkbox"
                    checked={shakeUseSiteAmp}
                    onChange={(e) => setShakeUseSiteAmp(e.target.checked)}
                    className="h-4 w-4 accent-blue-600 shrink-0"
                  />
                </label>

                <label className="pt-1 flex items-center justify-between gap-3 cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-slate-700 font-medium">
                      Auto-Scale Contours to Peak PGA
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {shakeMapData.autoScale.bandRangeLabel}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shakeAutoScale}
                    onChange={(e) => setShakeAutoScale(e.target.checked)}
                    className="h-4 w-4 accent-blue-600 shrink-0"
                  />
                </label>

                <label className="pt-1 flex items-center justify-between gap-3 cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-slate-700 font-medium">
                      Auto-Highlight Epicentral Contours
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {shakeAutoHighlight && hoveredLegendBand
                        ? `Highlighting PEIS ${hoveredLegendBand} epicentral contour`
                        : 'Glow epicentral contour band on legend hover'}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={shakeAutoHighlight}
                    onChange={(e) => setShakeAutoHighlight(e.target.checked)}
                    className="h-4 w-4 accent-blue-600 shrink-0"
                  />
                </label>

                <label className="block pt-1">
                  <div className="flex items-center justify-between text-slate-700 font-medium mb-1">
                    <span>Contour Opacity</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {Math.round(shakeMapOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(shakeMapOpacity * 100)}
                    onChange={(e) => setShakeMapOpacity(Number(e.target.value) / 100)}
                    aria-label="ShakeMap contour opacity"
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs font-mono tabular-nums">
                  <div className="bg-slate-50 border border-slate-200/80 rounded p-2">
                    <div className="font-sans text-[10px] text-slate-500">Peak PEIS</div>
                    <div className="font-semibold text-slate-900">
                      {shakeMapData.peakRoman} ({shakeMapData.peakIntensity.toFixed(1)})
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/80 rounded p-2">
                    <div className="font-sans text-[10px] text-slate-500">Est. Peak PGA</div>
                    <div className="font-semibold text-slate-900">
                      {shakeMapData.peakPgaPctG.toFixed(1)}%g
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200/80 rounded p-2">
                    <div className="font-sans text-[10px] text-slate-500">Input Mag / Z</div>
                    <div className="font-semibold text-slate-900">
                      {shakeMapData.magScaleLabel} {shakeMapData.effectiveMag.toFixed(1)} · {shakeMapData.depthKm.toFixed(0)}km
                    </div>
                  </div>
                </div>

                {/* ShakeMap Statistics Summary Widget */}
                <div className="pt-2.5 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900">
                        ShakeMap Statistics
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Ground area (km²) per visible PEIS intensity band
                      </p>
                    </div>
                    {shakeMapStats.visibleBands.length > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-500">Total Visible</div>
                        <div className="text-xs font-mono font-semibold tabular-nums text-slate-900">
                          {shakeMapStats.totalVisibleAreaKm2 >= 10
                            ? Math.round(shakeMapStats.totalVisibleAreaKm2).toLocaleString('en-US')
                            : shakeMapStats.totalVisibleAreaKm2.toFixed(1)}{' '}
                          km²
                        </div>
                      </div>
                    )}
                  </div>

                  {!mapShowShakeMap ? (
                    <div className="px-2.5 py-2 rounded bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between gap-2">
                      <span>Overlay hidden — enable ShakeMap contours to inspect band areas.</span>
                      <button
                        type="button"
                        onClick={() => setMapShowShakeMap(true)}
                        className="font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                      >
                        Enable
                      </button>
                    </div>
                  ) : shakeMapStats.visibleBands.length === 0 ? (
                    <div className="px-2.5 py-2 rounded bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-center justify-between gap-2">
                      <span>No visible intensity band polygons for current selection.</span>
                      {shakeMapData.contours.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleApplyShakePreset('all')}
                          className="font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                        >
                          Show All
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {shakeMapStats.visibleBands.map((stat) => {
                        const barWidthPct =
                          shakeMapStats.maxBandAreaKm2 > 0
                            ? Math.max(4, (stat.areaKm2 / shakeMapStats.maxBandAreaKm2) * 100)
                            : 0;
                        const areaLabel =
                          stat.areaKm2 >= 10
                            ? Math.round(stat.areaKm2).toLocaleString('en-US')
                            : stat.areaKm2.toFixed(1);
                        const cumLabel =
                          stat.cumulativeAreaKm2 >= 10
                            ? Math.round(stat.cumulativeAreaKm2).toLocaleString('en-US')
                            : stat.cumulativeAreaKm2.toFixed(1);
                        const shareLabel =
                          stat.sharePct > 0 && stat.sharePct < 1
                            ? '<1%'
                            : `${Math.round(stat.sharePct)}%`;
                        const isHovered =
                          shakeAutoHighlight && hoveredLegendBand === stat.band.roman;

                        return (
                          <div
                            key={`stat-${stat.band.roman}`}
                            onMouseEnter={() => setHoveredLegendBand(stat.band.roman)}
                            onMouseLeave={() =>
                              setHoveredLegendBand((curr) =>
                                curr === stat.band.roman ? null : curr
                              )
                            }
                            title={`PEIS ${stat.band.roman} (${stat.band.label}): ${areaLabel} km² net band area · ≥ PEIS ${stat.band.roman} cumulative footprint: ${cumLabel} km²`}
                            className={`rounded border px-2 py-1.5 transition-colors ${
                              isHovered
                                ? 'bg-amber-50/60 border-amber-300'
                                : 'bg-slate-50/70 border-slate-200/70 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-xs border shrink-0"
                                  style={{
                                    backgroundColor: stat.band.fillHex,
                                    borderColor: stat.band.strokeHex,
                                  }}
                                />
                                <span className="font-mono font-semibold text-slate-900 shrink-0">
                                  PEIS {stat.band.roman}
                                </span>
                                <span className="text-slate-600 truncate">
                                  {stat.band.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 font-mono tabular-nums">
                                <span className="font-semibold text-slate-900">
                                  {areaLabel} km²
                                </span>
                                <span className="text-[10px] text-slate-500 w-7 text-right">
                                  {shareLabel}
                                </span>
                              </div>
                            </div>
                            <div className="mt-1 h-1.5 w-full rounded-xs bg-slate-200/70 overflow-hidden">
                              <div
                                className="h-full rounded-xs transition-all duration-300"
                                style={{
                                  width: `${barWidthPct}%`,
                                  backgroundColor: stat.band.fillHex,
                                  borderRight: `2px solid ${stat.band.strokeHex}`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {filteredShakeMapData.contours.length} active contour{filteredShakeMapData.contours.length === 1 ? '' : 's'}
                  </span>
                  <button
                    type="button"
                    onClick={handleExportShakeMapGeoJson}
                    disabled={filteredShakeMapData.contours.length === 0}
                    title={
                      filteredShakeMapData.contours.length === 0
                        ? 'Enable at least one intensity band to export GeoJSON'
                        : 'Download current ShakeMap intensity contours as RFC 7946 GeoJSON'
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export GeoJSON
                  </button>
                </div>
              </div>
            );

            const peisLegendList = (
              <div className="space-y-1.5">
                {!mapShowShakeMap && (
                  <div className="px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-center justify-between gap-2">
                    <span>ShakeMap overlay is currently turned off.</span>
                    <button
                      type="button"
                      onClick={() => setMapShowShakeMap(true)}
                      className="font-semibold underline hover:text-amber-950 whitespace-nowrap"
                    >
                      Enable Overlay
                    </button>
                  </div>
                )}
                {SHAKEMAP_BANDS.map((band) => {
                  const isChecked = visibleShakeBands[band.roman] !== false;
                  const isGenerated = shakeMapData.contours.some(
                    (c) => c.band.roman === band.roman
                  );
                  const isShown = mapShowShakeMap && isChecked;
                  const isHoveredHighlight =
                    shakeAutoHighlight && hoveredLegendBand === band.roman && isShown && isGenerated;
                  return (
                    <label
                      key={`legend-${band.level}`}
                      onMouseEnter={() => setHoveredLegendBand(band.roman)}
                      onMouseLeave={() =>
                        setHoveredLegendBand((curr) => (curr === band.roman ? null : curr))
                      }
                      className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded border cursor-pointer transition-all ${
                        isHoveredHighlight
                          ? 'bg-amber-50/60 border-amber-400 text-slate-900 shadow-xs'
                          : isShown
                            ? isGenerated
                              ? 'bg-white border-slate-300 hover:border-slate-400 text-slate-900'
                              : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300 text-slate-600'
                            : 'bg-slate-50/50 border-slate-200/60 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="pt-0.5 flex items-center gap-2 shrink-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleShakeBand(band.roman)}
                          aria-label={`Toggle PEIS ${band.roman} (${band.label}) contour visibility`}
                          className="h-3.5 w-3.5 accent-slate-900 cursor-pointer"
                        />
                        <span
                          className="inline-block w-3 h-3 rounded-xs border transition-shadow"
                          style={{
                            backgroundColor: band.fillHex,
                            borderColor: band.strokeHex,
                            opacity: isShown ? 0.92 : 0.28,
                            boxShadow: isHoveredHighlight ? `0 0 8px ${band.fillHex}` : 'none',
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className={`font-medium ${!isShown ? 'line-through' : ''}`}>
                            <span className="font-mono font-semibold mr-1.5">
                              PEIS {band.roman}
                            </span>
                            <span>{band.label}</span>
                          </span>
                          <span className="font-mono tabular-nums text-[10px] shrink-0 text-slate-500">
                            {band.pgaLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                          {band.description}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-mono shrink-0 mt-0.5 ${
                          !isGenerated
                            ? 'text-slate-400'
                            : isShown
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-400'
                        }`}
                      >
                        {!isGenerated ? '—' : isShown ? 'On' : 'Off'}
                      </span>
                    </label>
                  );
                })}
              </div>
            );

            const activeBasemapMeta = getBasemapMeta(basemapId);

            const renderEngineMap = (
              activeShakeData: ShakeMapResult,
              isCompactView: boolean,
              slot: 'primary' | 'compare' = 'primary'
            ) => {
              const snapshotReadyCb =
                slot === 'compare'
                  ? handleCompareMapSnapshotProviderReady
                  : handlePrimaryMapSnapshotProviderReady;

              if (viewDimension === '3d') {
                return (
                  <EpicenterMap3D
                    event={activeEvent}
                    stations={stations}
                    selectedStation={selectedStation}
                    onSelectStation={setSelectedStation}
                    showFaults={mapShowFaults}
                    showPlates={mapShowPlates}
                    showVolcanoes={mapShowVolcanoes}
                    showStations={mapShowStations}
                    regionFilter={mapRegionFilter}
                    showGrid={mapShowGrid}
                    shakeMap={activeShakeData}
                    showShakeMap={mapShowShakeMap}
                    shakeMapOpacity={shakeMapOpacity}
                    visibleShakeBands={visibleShakeBands}
                    highlightedShakeBand={shakeAutoHighlight ? hoveredLegendBand : null}
                    compact={isCompactView}
                    onSnapshotProviderReady={snapshotReadyCb}
                  />
                );
              }
              if (basemapId === 'google-maps') {
                return (
                  <GoogleEpicenterMap
                    apiKey={mapsApiKey}
                    event={activeEvent}
                    stations={stations}
                    selectedStation={selectedStation}
                    onSelectStation={setSelectedStation}
                    showFaults={mapShowFaults}
                    onToggleFaults={() => setMapShowFaults((v) => !v)}
                    showVolcanoes={mapShowVolcanoes}
                    showPlates={mapShowPlates}
                    onTogglePlates={() => setMapShowPlates((v) => !v)}
                    showStations={mapShowStations}
                    regionFilter={mapRegionFilter}
                    shakeMap={activeShakeData}
                    showShakeMap={mapShowShakeMap}
                    shakeMapOpacity={shakeMapOpacity}
                    visibleShakeBands={visibleShakeBands}
                    highlightedShakeBand={shakeAutoHighlight ? hoveredLegendBand : null}
                    mapTypeId={mapStyleMode}
                    onChangeMapTypeId={setMapStyleMode}
                    hideInternalStyleToggle={true}
                    minimalToolbar={true}
                    isLoadingConfig={mapsConfigLoading}
                    compact={isCompactView}
                    viewport={sharedViewport}
                    onViewportChange={setSharedViewport}
                    onFallbackToVector={() => {
                      setGoogleMapsUnavailable(true);
                      setBasemapId('vector-schematic');
                      showNotice('Google Maps unavailable — showing Vector Schematic map');
                    }}
                    mainOffice={mainOffice}
                    showRangeRings={mapShowRangeRings}
                    showNearestPlaces={mapShowNearestPlaces}
                    nearestCitiesPins={nearestCitiesPins}
                    showCatalogEvents={mapShowCatalogEvents}
                    catalogEvents={events}
                    onSelectCatalogEvent={(evId) => setActiveEventId(evId)}
                    rulerActive={mapRulerActive}
                    rulerPoints={mapRulerPoints}
                    onRulerPointClick={handleMapRulerClick}
                    geologyVisibility={geologyVisibility}
                    gisActiveFaultsData={gisActiveFaultsData}
                    gisTrenchData={gisTrenchData}
                    selectedGeologyFeature={selectedGeologyFeature}
                    onSelectGeologyFeature={setSelectedGeologyFeature}
                    timelineEvents={showEpicenterTimeline ? visibleTimelineEvents : []}
                    showTimelineMigration={showEpicenterTimeline && timelineShowMigration}
                    selectedTimelineEventId={selectedTimelineEventId}
                    onSelectTimelineEvent={(ev) => setSelectedTimelineEventId(ev.id)}
                    onSnapshotProviderReady={snapshotReadyCb}
                  />
                );
              }
              if (activeBasemapMeta.engine === 'maplibre') {
                return (
                  <Suspense
                    fallback={
                      <div
                        className={`flex flex-col items-center justify-center border border-slate-200 bg-slate-50 rounded-lg text-xs text-slate-600 ${
                          isCompactView ? 'h-[400px]' : 'h-[540px]'
                        }`}
                      >
                        <div className="font-semibold text-slate-800">
                          Initializing {activeBasemapMeta.label}…
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Loading MapLibre GL vector renderer
                        </div>
                      </div>
                    }
                  >
                    <MapLibreEpicenterMap
                      basemapId={basemapId}
                      event={activeEvent}
                      stations={stations}
                      selectedStation={selectedStation}
                      onSelectStation={setSelectedStation}
                      showFaults={mapShowFaults}
                      showVolcanoes={mapShowVolcanoes}
                      showPlates={mapShowPlates}
                      showStations={mapShowStations}
                      shakeMap={activeShakeData}
                      showShakeMap={mapShowShakeMap}
                      shakeMapOpacity={shakeMapOpacity}
                      visibleShakeBands={visibleShakeBands}
                      highlightedShakeBand={shakeAutoHighlight ? hoveredLegendBand : null}
                      compact={isCompactView}
                      regionFilter={mapRegionFilter}
                      mainOffice={mainOffice}
                      showRangeRings={mapShowRangeRings}
                      showNearestPlaces={mapShowNearestPlaces}
                      nearestCitiesPins={nearestCitiesPins}
                      showCatalogEvents={mapShowCatalogEvents}
                      catalogEvents={events}
                      onSelectCatalogEvent={(evId) => setActiveEventId(evId)}
                      rulerActive={mapRulerActive}
                      rulerPoints={mapRulerPoints}
                      onRulerPointClick={handleMapRulerClick}
                      geologyVisibility={geologyVisibility}
                      gisActiveFaultsData={gisActiveFaultsData}
                      gisTrenchData={gisTrenchData}
                      selectedGeologyFeature={selectedGeologyFeature}
                      onSelectGeologyFeature={setSelectedGeologyFeature}
                      viewport={sharedViewport}
                      onViewportChange={setSharedViewport}
                      onSwitchToVector={() => {
                        setBasemapId('vector-schematic');
                        showNotice('Switched to built-in Vector Schematic map.');
                      }}
                      onProviderError={(msg) => showNotice(msg)}
                      timelineEvents={showEpicenterTimeline ? visibleTimelineEvents : []}
                      showTimelineMigration={showEpicenterTimeline && timelineShowMigration}
                      selectedTimelineEventId={selectedTimelineEventId}
                      onSelectTimelineEvent={(ev) => setSelectedTimelineEventId(ev.id)}
                      onSnapshotProviderReady={snapshotReadyCb}
                    />
                  </Suspense>
                );
              }
              return (
                <EpicenterMap
                  event={activeEvent}
                  stations={stations}
                  selectedStation={selectedStation}
                  onSelectStation={setSelectedStation}
                  compact={isCompactView}
                  minimalToolbar={true}
                  mapStyle={mapStyleMode}
                  viewport={sharedViewport}
                  onViewportChange={setSharedViewport}
                  showFaults={mapShowFaults}
                  onToggleFaults={() => setMapShowFaults((v) => !v)}
                  showVolcanoes={mapShowVolcanoes}
                  onToggleVolcanoes={() => setMapShowVolcanoes((v) => !v)}
                  showPlates={mapShowPlates}
                  onTogglePlates={() => setMapShowPlates((v) => !v)}
                  showStations={mapShowStations}
                  onToggleStations={() => setMapShowStations((v) => !v)}
                  regionFilter={mapRegionFilter}
                  onChangeRegionFilter={setMapRegionFilter}
                  showGrid={mapShowGrid}
                  onToggleGrid={() => setMapShowGrid((v) => !v)}
                  shakeMap={activeShakeData}
                  showShakeMap={mapShowShakeMap}
                  shakeMapOpacity={shakeMapOpacity}
                  visibleShakeBands={visibleShakeBands}
                  highlightedShakeBand={shakeAutoHighlight ? hoveredLegendBand : null}
                  mainOffice={mainOffice}
                  showRangeRings={mapShowRangeRings}
                  showNearestPlaces={mapShowNearestPlaces}
                  nearestCitiesPins={nearestCitiesPins}
                  showCatalogEvents={mapShowCatalogEvents}
                  catalogEvents={events}
                  onSelectCatalogEvent={(evId) => setActiveEventId(evId)}
                  rulerActive={mapRulerActive}
                  rulerPoints={mapRulerPoints}
                  onRulerPointClick={handleMapRulerClick}
                  comparisonMarkers={mapComparisonMarkers}
                  geologyVisibility={geologyVisibility}
                  gisActiveFaultsData={gisActiveFaultsData}
                  gisTrenchData={gisTrenchData}
                  selectedGeologyFeature={selectedGeologyFeature}
                  onSelectGeologyFeature={setSelectedGeologyFeature}
                  timelineEvents={showEpicenterTimeline ? visibleTimelineEvents : []}
                  showTimelineMigration={showEpicenterTimeline && timelineShowMigration}
                  selectedTimelineEventId={selectedTimelineEventId}
                  onSelectTimelineEvent={(ev) => setSelectedTimelineEventId(ev.id)}
                  onSnapshotProviderReady={snapshotReadyCb}
                />
              );
            };

            const hasDedicatedSidebar =
              eqpTab === 'tsunami' || (eqpTab === 'map' && showIntensityMeterSidebar);
            const isTsunamiTab = eqpTab === 'tsunami';

            return (
              <div
                className={
                  isTsunamiTab
                    ? 'tsunami-panel bg-[#dde4ee] border border-slate-600/70 rounded-lg p-3.5 sm:p-4 space-y-4 shadow-[0_4px_14px_-3px_rgba(15,23,42,0.2)]'
                    : 'space-y-3'
                }
                onClick={() => {
                  if (pinnedMapTool) closeAllMapTools();
                }}
              >
                {isTsunamiTab && (
                  <div className="card bg-[#f5f7fa] border border-slate-600/70 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                    <div>
                      <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                        Tsunami Hazard Screening &amp; Subduction Trench Map
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Subduction trench proximity, focal depth &amp; magnitude evaluation, tsunami bulletin status, and regional seismicity trends.
                      </p>
                    </div>
                    <div className="sub-card bg-[#e4e9f1] border border-slate-700/60 rounded px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-800 tabular-nums">
                      M {tsunamiScreening.effectiveMag.toFixed(1)} ·{' '}
                      {isUnlocated ? 'Unlocated' : `Z ${activeEvent.depthKm.toFixed(1)} km`} ·{' '}
                      {tsunamiScreening.nearestTrench
                        ? `${tsunamiScreening.nearestTrench.name} (${tsunamiScreening.nearestTrench.distanceKm.toFixed(0)} km)`
                        : 'Trench N/A'}
                    </div>
                  </div>
                )}

                {/* Unified Map Command Bar: Basemap Selector + View Dimension + Style + Quick Tools */}
                <div
                  className={`rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2.5 border ${
                    isTsunamiTab
                      ? 'card bg-[#edf4fc] border-sky-700/60 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-900 text-white font-semibold text-[11px] whitespace-nowrap">
                      {isTsunamiTab
                        ? 'Tsunami Map'
                        : showIntensityMeterSidebar
                          ? 'Epicenter Map · Intensity Meter'
                          : 'Epicenter Map'}
                    </span>

                    <BasemapSelector
                      value={basemapId}
                      onChange={handleSelectBasemap}
                      hasGoogleKey={Boolean(mapsApiKey)}
                      googleUnavailable={googleMapsUnavailable}
                      isLoadingGoogleConfig={mapsConfigLoading}
                    />

                    <div
                      className={`inline-flex items-center gap-0.5 p-0.5 rounded-md ${
                        isTsunamiTab ? 'sub-card bg-[#dce9f8] border border-sky-800/55' : 'bg-slate-100'
                      }`}
                      role="group"
                      aria-label="Map Dimension"
                    >
                      {(
                        [
                          { id: '2d', label: '2D' },
                          { id: '3d', label: '3D' },
                        ] as const
                      ).map((dim) => (
                        <button
                          key={dim.id}
                          type="button"
                          aria-pressed={viewDimension === dim.id}
                          onClick={() => setViewDimension(dim.id)}
                          className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                            viewDimension === dim.id
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {dim.label}
                        </button>
                      ))}
                    </div>

                    {viewDimension === '2d' && activeBasemapMeta.supportsStyleSubmenu && (
                      <div
                        className={`inline-flex items-center gap-0.5 p-0.5 rounded-md ${
                          isTsunamiTab ? 'sub-card bg-[#dce9f8] border border-sky-800/55' : 'bg-slate-100'
                        }`}
                        role="group"
                        aria-label="Map Style"
                      >
                        {(
                          [
                            { id: 'terrain', label: 'Terrain' },
                            { id: 'satellite', label: 'Satellite' },
                            { id: 'hybrid', label: 'Hybrid' },
                            { id: 'roadmap', label: 'Roadmap' },
                          ] as const
                        ).map((styleOpt) => (
                          <button
                            key={styleOpt.id}
                            type="button"
                            aria-pressed={mapStyleMode === styleOpt.id}
                            onClick={() => setMapStyleMode(styleOpt.id)}
                            className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                              mapStyleMode === styleOpt.id
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {styleOpt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover / Click Icon Dock for Secondary Cards */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MapIconPopover
                      id="layers"
                      icon={<Layers className="w-4 h-4" />}
                      title="Geological & Map Layers"
                      subtitle="GIS faults, trenches, volcanoes, stations & region filter"
                      badge={
                        (() => {
                          const activeGisCount =
                            Number(geologyVisibility.activeFaults) +
                            Number(geologyVisibility.potentiallyActiveFaults) +
                            Number(geologyVisibility.trenches);
                          if (activeGisCount > 0) return `GIS ${activeGisCount}`;
                          return mapRegionFilter !== 'ALL' ? `${regionFilteredPicksCount} sta` : null;
                        })()
                      }
                      active={
                        geologyVisibility.activeFaults ||
                        geologyVisibility.potentiallyActiveFaults ||
                        geologyVisibility.trenches ||
                        mapRegionFilter !== 'ALL'
                      }
                      accentClass="text-blue-600"
                      isOpen={isToolOpen('layers')}
                      isPinned={pinnedMapTool === 'layers'}
                      onMouseEnterTrigger={() => openMapToolHover('layers')}
                      onMouseLeaveTrigger={() => scheduleMapToolClose('layers')}
                      onTogglePin={() => toggleMapToolPin('layers')}
                      onClose={closeAllMapTools}
                      widthClass="w-[340px] sm:w-[375px]"
                      themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                    >
                      {layersPanelBody}
                    </MapIconPopover>

                    <MapIconPopover
                      id="geometry"
                      icon={<ShieldAlert className="w-4 h-4" />}
                      title="Network Geometry & Fault Proximity"
                      subtitle="Azimuthal coverage & GIS active fault distance calculator"
                      badge={azimuthalGapStats ? `${azimuthalGapStats.gapDeg}°` : null}
                      active={Boolean(azimuthalGapStats)}
                      accentClass="text-rose-600"
                      isOpen={isToolOpen('geometry')}
                      isPinned={pinnedMapTool === 'geometry'}
                      onMouseEnterTrigger={() => openMapToolHover('geometry')}
                      onMouseLeaveTrigger={() => scheduleMapToolClose('geometry')}
                      onTogglePin={() => toggleMapToolPin('geometry')}
                      onClose={closeAllMapTools}
                      widthClass="w-[345px] sm:w-[385px]"
                      themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                    >
                      {geometryFaultsBody}
                    </MapIconPopover>

                    <MapIconPopover
                      id="catalog"
                      icon={<Activity className="w-4 h-4" />}
                      title="Catalog & Aftershock Overlay"
                      subtitle="Overlay workspace events or switch focus"
                      badge={locatedCatalogCount > 1 ? locatedCatalogCount : null}
                      active={mapShowCatalogEvents}
                      accentClass="text-amber-600"
                      isOpen={isToolOpen('catalog')}
                      isPinned={pinnedMapTool === 'catalog'}
                      onMouseEnterTrigger={() => openMapToolHover('catalog')}
                      onMouseLeaveTrigger={() => scheduleMapToolClose('catalog')}
                      onTogglePin={() => toggleMapToolPin('catalog')}
                      onClose={closeAllMapTools}
                      widthClass="w-[320px] sm:w-[350px]"
                      themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                    >
                      {catalogOverlayBody}
                    </MapIconPopover>

                    {eqpTab === 'map' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowIntensityMeterSidebar((v) => !v);
                        }}
                        aria-pressed={showIntensityMeterSidebar}
                        title={
                          showIntensityMeterSidebar
                            ? 'Hide Intensity Meter & ShakeMap Sidebar'
                            : 'Show Intensity Meter & ShakeMap Sidebar'
                        }
                        className={`h-8 inline-flex items-center gap-1.5 px-2.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          showIntensityMeterSidebar
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-950'
                        }`}
                      >
                        <Gauge className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Intensity Meter</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums ${
                            mapShowShakeMap
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {mapShowShakeMap ? `PEIS ${shakeMapData.peakRoman}` : 'Off'}
                        </span>
                      </button>
                    ) : (
                      <MapIconPopover
                        id="shakemap"
                        icon={<SlidersHorizontal className="w-4 h-4" />}
                        title="ShakeMap & PEIS Legend"
                        subtitle={`GMPE ${shakeMapData.gmpeId} · Peak PEIS ${shakeMapData.peakRoman}`}
                        badge={mapShowShakeMap ? `PEIS ${shakeMapData.peakRoman}` : 'Off'}
                        active={mapShowShakeMap}
                        accentClass="text-orange-600"
                        isOpen={isToolOpen('shakemap')}
                        isPinned={pinnedMapTool === 'shakemap'}
                        onMouseEnterTrigger={() => openMapToolHover('shakemap')}
                        onMouseLeaveTrigger={() => scheduleMapToolClose('shakemap')}
                        onTogglePin={() => toggleMapToolPin('shakemap')}
                        onClose={closeAllMapTools}
                        widthClass="w-[360px] sm:w-[400px]"
                        themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                      >
                        <div className="p-3.5 space-y-4">
                          {shakeMapEngineBody}
                          <div className="pt-3 border-t border-slate-200 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-900">
                                PEIS Color Legend
                              </span>
                              <button
                                type="button"
                                onClick={() => handleApplyShakePreset('all')}
                                className="text-blue-600 hover:text-blue-700 font-medium"
                              >
                                Show All
                              </button>
                            </div>
                            {peisLegendList}
                          </div>
                        </div>
                      </MapIconPopover>
                    )}

                    <MapIconPopover
                      id="places"
                      icon={<Compass className="w-4 h-4" />}
                      title="Nearby Places & Field Context"
                      subtitle="Hospitals, evacuation sites, ports & access routes"
                      accentClass="text-teal-600"
                      isOpen={isToolOpen('places')}
                      isPinned={pinnedMapTool === 'places'}
                      onMouseEnterTrigger={() => openMapToolHover('places')}
                      onMouseLeaveTrigger={() => scheduleMapToolClose('places')}
                      onTogglePin={() => toggleMapToolPin('places')}
                      onClose={closeAllMapTools}
                      widthClass="w-[380px] sm:w-[440px]"
                      themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                    >
                      <MapsGroundingPanel
                        key={`maps-grounding-map-${activeEvent.id}-${workspaceResetNonce}`}
                        event={activeEvent}
                        embedded={true}
                      />
                    </MapIconPopover>

                    <MapIconPopover
                      id="inspector"
                      icon={<Crosshair className="w-4 h-4" />}
                      title="Geodesic Summary & Station Inspector"
                      subtitle={
                        selectedStation
                          ? `Inspecting station ${selectedStation}`
                          : 'Click any station triangle on map'
                      }
                      badge={selectedStation}
                      active={Boolean(selectedStation)}
                      accentClass="text-indigo-600"
                      isOpen={isToolOpen('inspector')}
                      isPinned={pinnedMapTool === 'inspector'}
                      onMouseEnterTrigger={() => openMapToolHover('inspector')}
                      onMouseLeaveTrigger={() => scheduleMapToolClose('inspector')}
                      onTogglePin={() => toggleMapToolPin('inspector')}
                      onClose={closeAllMapTools}
                      widthClass="w-[320px] sm:w-[350px]"
                      themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                    >
                      {inspectorBody}
                    </MapIconPopover>
                  </div>
                </div>

                {/* Map Unlocated / Stale Solution Status Notice */}
                {eqpTab === 'map' && isUnlocated && (
                  <div
                    role="status"
                    className="bg-amber-50 border border-amber-300 text-amber-950 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        No computed earthquake location is available for this event. Return to the Data tab or click PLOT to compute the hypocenter.
                      </span>
                    </span>
                  </div>
                )}

                {eqpTab === 'map' && !isUnlocated && isPlotResultStale && (
                  <div
                    role="status"
                    className="bg-amber-50 border border-amber-300 text-amber-950 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        Displayed location is stale — station inputs or trial depth changed since last location calculation.
                      </span>
                    </span>
                  </div>
                )}

                {/* Slim 1-Line Spatial Telemetry Strip (Map tab) */}
                {eqpTab === 'map' && (
                  <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px]">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-mono tabular-nums text-slate-800">
                        {isUnlocated
                          ? 'No Computed Location'
                          : `${activeEvent.lat.toFixed(3)}°N, ${activeEvent.lon.toFixed(3)}°E · Z ${activeEvent.depthKm.toFixed(1)} km · ERH ±${activeEvent.errKm.toFixed(1)} km`}
                      </span>

                      {azimuthalGapStats && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMapToolPin('geometry');
                          }}
                          className="inline-flex items-center gap-1.5 font-mono tabular-nums text-slate-700 hover:text-slate-950"
                          title="Open Network Geometry & Fault Proximity"
                        >
                          <span>GAP {azimuthalGapStats.gapDeg}°</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                              azimuthalGapStats.gapDeg <= 135
                                ? 'bg-emerald-50 text-emerald-700'
                                : azimuthalGapStats.gapDeg <= 210
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {azimuthalGapStats.gapDeg <= 135
                              ? 'Good'
                              : azimuthalGapStats.gapDeg <= 210
                                ? 'Fair'
                                : 'Wide'}
                          </span>
                        </button>
                      )}

                      {!isUnlocated && (
                        <span className="font-mono text-teal-800">
                          {mainOffice.code}:{' '}
                          {activeEvent.centralOfficeBearing ||
                            formatCentralOfficeBearing(activeEvent.lat, activeEvent.lon, mainOffice)}
                        </span>
                      )}

                      {nearestFaults[0] && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMapToolPin('geometry');
                          }}
                          className="inline-flex items-center gap-1 text-slate-700 hover:text-rose-800"
                          title="Inspect nearest faults & trenches"
                        >
                          <span className="text-slate-400">Nearest:</span>
                          <span className="font-medium truncate max-w-[180px]">
                            {nearestFaults[0].name}
                          </span>
                          <span className="font-mono tabular-nums text-rose-700">
                            ({nearestFaults[0].distanceKm.toFixed(1)} km {nearestFaults[0].bearingLabel})
                          </span>
                        </button>
                      )}
                    </div>

                    {selectedPick && (
                      <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 font-mono tabular-nums text-blue-950">
                        <span className="font-semibold">Sta {selectedPick.sta}</span>
                        <span>Δ {selectedPick.delta.toFixed(2)}°</span>
                        <span>
                          RESp {selectedPick.resP >= 0 ? '+' : ''}
                          {selectedPick.resP.toFixed(2)}s
                        </span>
                        <button
                          type="button"
                          onClick={() => navigateEqpModule('locate', 'data')}
                          className="font-sans text-[10px] font-semibold text-blue-700 hover:underline"
                        >
                          Locate
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStation(null)}
                          aria-label="Clear selected station"
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Map Canvas + Contextual Focused Sidebar (Intensity Meter on Map, or Tsunami) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  <div
                    id="map-container"
                    className={
                      hasDedicatedSidebar
                        ? 'lg:col-span-8 space-y-2.5'
                        : 'lg:col-span-12 space-y-2.5'
                    }
                  >
                    {/* Map Interaction Controls Toolbar */}
                    <div
                      className={`map-controls rounded-lg px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 border ${
                        isTsunamiTab
                          ? 'card bg-[#f1f4f9] border-slate-600/70 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]'
                          : 'bg-white border-slate-200 shadow-2xs'
                      }`}
                      role="toolbar"
                      aria-label="Map Interaction Controls"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const tip = mapShowShakeMap
                            ? 'Disable ShakeMap Contours'
                            : 'Enable ShakeMap Contours';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowShakeMap((v) => !v)}
                                aria-pressed={mapShowShakeMap}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-shakemap"
                                className={`h-7 inline-flex items-center gap-1.5 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowShakeMap
                                    ? 'bg-orange-50 border-orange-300 text-orange-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                <span>ShakeMap Contours</span>
                              </button>
                              <span
                                id="map-ctrl-tip-shakemap"
                                role="tooltip"
                                className="pointer-events-none absolute left-0 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = showSeismicityTrendOverlay
                            ? 'Toggle Seismicity Trend (Hide historical viewport chart)'
                            : 'Toggle Seismicity Trend (Show historical viewport chart)';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowSeismicityTrendOverlay((prev) => {
                                    const next = !prev;
                                    if (next) void ensureHistoricalTrendCatalogLoaded();
                                    return next;
                                  });
                                }}
                                aria-pressed={showSeismicityTrendOverlay}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-trend"
                                className={`h-7 inline-flex items-center gap-1.5 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  showSeismicityTrendOverlay
                                    ? 'bg-sky-600 border-sky-700 text-white shadow-xs'
                                    : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <BarChart3 className="w-3.5 h-3.5" />
                                <span>Seismicity Trend Overlay</span>
                              </button>
                              <span
                                id="map-ctrl-tip-trend"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = showEpicenterTimeline
                            ? 'Hide Animated Epicenter Timeline Panel'
                            : 'Open Animated Epicenter Timeline Panel';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowEpicenterTimeline((prev) => {
                                    const next = !prev;
                                    if (next) {
                                      void ensureHistoricalTrendCatalogLoaded();
                                    } else {
                                      setTimelinePlaying(false);
                                    }
                                    return next;
                                  });
                                }}
                                aria-pressed={showEpicenterTimeline}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-timeline"
                                className={`h-7 inline-flex items-center gap-1.5 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  showEpicenterTimeline
                                    ? 'bg-sky-600 border-sky-700 text-white shadow-xs'
                                    : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Epicenter Timeline</span>
                              </button>
                              <span
                                id="map-ctrl-tip-timeline"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = mapShowRangeRings
                            ? 'Disable Epicentral Range Rings (50, 100 & 200 km)'
                            : 'Enable Epicentral Range Rings (50, 100 & 200 km)';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowRangeRings((v) => !v)}
                                aria-pressed={mapShowRangeRings}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-rings"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowRangeRings
                                    ? 'bg-sky-50 border-sky-300 text-sky-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <Radar className="w-3.5 h-3.5" />
                                <span>Rings</span>
                              </button>
                              <span
                                id="map-ctrl-tip-rings"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = mapShowNearestPlaces
                            ? 'Disable Nearest City Reference Pins'
                            : 'Enable Nearest City Reference Pins';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowNearestPlaces((v) => !v)}
                                aria-pressed={mapShowNearestPlaces}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-cities"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowNearestPlaces
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <MapPin className="w-3.5 h-3.5" />
                                <span>Cities ({nearestCitiesPins.length})</span>
                              </button>
                              <span
                                id="map-ctrl-tip-cities"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = mapShowStations
                            ? 'Disable Seismic Stations Layer'
                            : 'Enable Seismic Stations Layer';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowStations((v) => !v)}
                                aria-pressed={mapShowStations}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-stations"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowStations
                                    ? 'bg-blue-50 border-blue-300 text-blue-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <span>Stations</span>
                              </button>
                              <span
                                id="map-ctrl-tip-stations"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = mapShowFaults
                            ? 'Disable Active Tectonic Faults Layer'
                            : 'Enable Active Tectonic Faults Layer';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowFaults((v) => !v)}
                                aria-pressed={mapShowFaults}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-faults"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowFaults
                                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <span>Faults</span>
                              </button>
                              <span
                                id="map-ctrl-tip-faults"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = mapShowVolcanoes
                            ? 'Disable Active Volcanoes Layer'
                            : 'Enable Active Volcanoes Layer';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowVolcanoes((v) => !v)}
                                aria-pressed={mapShowVolcanoes}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-volcanoes"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowVolcanoes
                                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <span>Volcanoes</span>
                              </button>
                              <span
                                id="map-ctrl-tip-volcanoes"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip = mapShowPlates
                            ? 'Disable Plate Boundaries Layer'
                            : 'Enable Plate Boundaries Layer';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowPlates((v) => !v)}
                                aria-pressed={mapShowPlates}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-plates"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowPlates
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <span>Plates</span>
                              </button>
                              <span
                                id="map-ctrl-tip-plates"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(basemapId === 'vector-schematic' || viewDimension === '3d') &&
                          (() => {
                            const tip = mapShowGrid
                              ? 'Disable Coordinate Grid'
                              : 'Enable Coordinate Grid';
                            return (
                              <div className="relative group">
                                <button
                                  type="button"
                                  onClick={() => setMapShowGrid((v) => !v)}
                                  aria-pressed={mapShowGrid}
                                  title={tip}
                                  aria-label={tip}
                                  aria-describedby="map-ctrl-tip-grid"
                                  className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                    mapShowGrid
                                      ? 'bg-slate-100 border-slate-300 text-slate-900'
                                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>Grid</span>
                                </button>
                                <span
                                  id="map-ctrl-tip-grid"
                                  role="tooltip"
                                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                                >
                                  {tip}
                                </span>
                              </div>
                            );
                          })()}

                        {(() => {
                          const tip = mapShowCatalogEvents
                            ? 'Disable Workspace Catalog Events Overlay'
                            : 'Enable Workspace Catalog Events Overlay';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                onClick={() => setMapShowCatalogEvents((v) => !v)}
                                aria-pressed={mapShowCatalogEvents}
                                title={tip}
                                aria-label={tip}
                                aria-describedby="map-ctrl-tip-catalog"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors ${
                                  mapShowCatalogEvents
                                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Catalog</span>
                              </button>
                              <span
                                id="map-ctrl-tip-catalog"
                                role="tooltip"
                                className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const tip =
                            viewDimension === '3d'
                              ? 'Measure Distance — Click two points on the map to measure distance and bearing (2D View Only)'
                              : 'Measure Distance — Click two points on the map to measure distance and bearing';
                          return (
                            <div className="relative group">
                              <button
                                type="button"
                                disabled={viewDimension === '3d'}
                                onClick={() => setMapRulerActive((v) => !v)}
                                aria-pressed={mapRulerActive}
                                title={tip}
                                aria-label={
                                  viewDimension === '3d'
                                    ? 'Enable Ruler (2D View Only)'
                                    : mapRulerActive
                                      ? 'Disable Ruler'
                                      : 'Enable Ruler'
                                }
                                aria-describedby="map-ctrl-tip-ruler"
                                className={`h-7 inline-flex items-center gap-1 px-2 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                                  mapRulerActive
                                    ? 'bg-purple-600 border-purple-700 text-white shadow-xs'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                                }`}
                              >
                                <Ruler className="w-3.5 h-3.5" />
                                <span>{mapRulerActive ? 'Disable Ruler' : 'Enable Ruler'}</span>
                              </button>
                              <span
                                id="map-ctrl-tip-ruler"
                                role="tooltip"
                                className="pointer-events-none absolute right-0 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                              >
                                {tip}
                              </span>
                            </div>
                          );
                        })()}

                        {(mapRulerPoints.start || mapRulerPoints.end) && (
                          <div className="relative group">
                            <button
                              type="button"
                              onClick={() => setMapRulerPoints({ start: null, end: null })}
                              title="Clear Measured Ruler Points"
                              aria-label="Clear Measured Ruler Points"
                              aria-describedby="map-ctrl-tip-ruler-clear"
                              className="h-7 px-1.5 rounded-md border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <span
                              id="map-ctrl-tip-ruler-clear"
                              role="tooltip"
                              className="pointer-events-none absolute right-0 bottom-full mb-1.5 z-40 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-md opacity-0 translate-y-0.5 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0"
                            >
                              Clear Measured Ruler Points
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      {(() => {
                        if (compareGmpeEnabled && compareShakeMapData && compareShakeMapStats) {
                          const primaryMeta =
                            GMPE_MODELS.find((m) => m.id === shakeMapData.gmpeId) ??
                            GMPE_MODELS[0];
                          const formatArea = (km2: number) =>
                            km2 >= 10
                              ? Math.round(km2).toLocaleString('en-US')
                              : km2.toFixed(1);

                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* Model A: Primary GMPE */}
                              <div
                                className={`rounded-lg overflow-hidden border ${
                                  isTsunamiTab
                                    ? 'card bg-[#f1f4f9] border-slate-600/70'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900 text-white text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-400/40 text-blue-200 font-mono text-[10px] font-semibold shrink-0">
                                      Model A
                                    </span>
                                    <span className="font-medium truncate">
                                      {primaryMeta.shortName}
                                      {gmpeModel === 'auto' ? ' (Auto)' : ''}
                                    </span>
                                  </div>
                                  <span className="font-mono tabular-nums text-[11px] text-slate-200 shrink-0">
                                    PEIS {shakeMapData.peakRoman} ·{' '}
                                    {shakeMapData.peakPgaPctG.toFixed(1)}%g ·{' '}
                                    {formatArea(shakeMapStats.totalVisibleAreaKm2)} km²
                                  </span>
                                </div>
                                {renderEngineMap(shakeMapData, true, 'primary')}
                              </div>

                              {/* Model B: Comparison GMPE */}
                              <div
                                className={`rounded-lg overflow-hidden border ${
                                  isTsunamiTab
                                    ? 'card bg-[#f1f4f9] border-slate-600/70'
                                    : 'border-slate-200 bg-white'
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900 text-white text-xs">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono text-[10px] font-semibold shrink-0">
                                      Model B
                                    </span>
                                    <select
                                      value={compareGmpeModel}
                                      onChange={(e) =>
                                        setCompareGmpeModel(e.target.value as GmpeModelId)
                                      }
                                      aria-label="Comparison GMPE model"
                                      className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-400"
                                    >
                                      {GMPE_MODELS.map((m) => (
                                        <option key={`cmp-hdr-${m.id}`} value={m.id}>
                                          {m.shortName}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <span className="font-mono tabular-nums text-[11px] text-slate-200 shrink-0">
                                    PEIS {compareShakeMapData.peakRoman} ·{' '}
                                    {compareShakeMapData.peakPgaPctG.toFixed(1)}%g ·{' '}
                                    {formatArea(compareShakeMapStats.totalVisibleAreaKm2)} km²
                                  </span>
                                </div>
                                {renderEngineMap(compareShakeMapData, true, 'compare')}
                              </div>
                            </div>
                          );
                        }

                        return renderEngineMap(shakeMapData, false, 'primary');
                      })()}

                      {viewDimension !== '3d' &&
                        (mapRulerActive || mapRulerPoints.start || mapRulerPoints.end) && (
                          <aside
                            aria-label="Map Ruler Distance and Bearing Overlay"
                            className="map-ruler-overlay animate-eqp-fade-in absolute top-14 left-3 z-20 w-[264px] max-w-[calc(100%-1.5rem)] rounded-lg border border-purple-300 bg-white/95 backdrop-blur-xs shadow-lg text-slate-900 p-2.5 text-xs pointer-events-auto"
                          >
                            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-purple-100">
                              <div className="flex items-center gap-1.5 font-semibold text-purple-950 min-w-0">
                                <Ruler className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                <span className="truncate">Distance &amp; Bearing Ruler</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setMapRulerPoints({ start: null, end: null });
                                  setMapRulerActive(false);
                                }}
                                title="Close Ruler Overlay"
                                aria-label="Close Ruler Overlay"
                                className="p-0.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {!mapRulerPoints.start ? (
                              <p className="mt-2 text-[11px] text-slate-600 leading-snug">
                                Click <span className="font-semibold text-purple-800">Point 1</span> on the map to begin measuring.
                              </p>
                            ) : !mapRulerPoints.end ? (
                              <div className="mt-2 space-y-1.5 text-[11px]">
                                <div className="font-mono tabular-nums text-slate-700 bg-purple-50/70 border border-purple-200/80 rounded px-2 py-1">
                                  P1: {mapRulerPoints.start.lat.toFixed(4)}°N,{' '}
                                  {mapRulerPoints.start.lon.toFixed(4)}°E
                                </div>
                                <p className="text-slate-600 leading-snug">
                                  Click <span className="font-semibold text-purple-800">Point 2</span> on the map to calculate distance &amp; bearing.
                                </p>
                              </div>
                            ) : (
                              rulerMeasurement && (
                                <div
                                  key={`${mapRulerPoints.start.lat.toFixed(5)}-${mapRulerPoints.start.lon.toFixed(5)}-${mapRulerPoints.end.lat.toFixed(5)}-${mapRulerPoints.end.lon.toFixed(5)}`}
                                  className="mt-2 space-y-2 animate-eqp-fade-in"
                                >
                                  <div className="grid grid-cols-2 gap-1.5 font-mono tabular-nums">
                                    <div className="bg-purple-50 border border-purple-200 rounded px-2 py-1.5">
                                      <div className="font-sans text-[10px] text-purple-700 font-medium">
                                        Distance
                                      </div>
                                      <div className="text-xs font-bold text-purple-950">
                                        {rulerMeasurement.distKm.toFixed(2)} km
                                      </div>
                                    </div>
                                    <div className="bg-purple-50 border border-purple-200 rounded px-2 py-1.5">
                                      <div className="font-sans text-[10px] text-purple-700 font-medium">
                                        Bearing (P1 → P2)
                                      </div>
                                      <div className="text-xs font-bold text-purple-950">
                                        {rulerMeasurement.azimDeg.toFixed(1)}°{' '}
                                        <span className="text-[10px] font-semibold text-purple-800">
                                          ({rulerMeasurement.quadrantLabel})
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-0.5 text-[10px] font-mono tabular-nums text-slate-600">
                                    <div>
                                      P1: {mapRulerPoints.start.lat.toFixed(4)}°N,{' '}
                                      {mapRulerPoints.start.lon.toFixed(4)}°E
                                    </div>
                                    <div>
                                      P2: {mapRulerPoints.end.lat.toFixed(4)}°N,{' '}
                                      {mapRulerPoints.end.lon.toFixed(4)}°E
                                    </div>
                                  </div>
                                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 text-[10px]">
                                    <span className="text-slate-500">
                                      {mapRulerActive
                                        ? 'Click map to start new measurement'
                                        : 'Ruler paused'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setMapRulerPoints({ start: null, end: null })}
                                      className="px-1.5 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800 font-medium hover:bg-purple-100 transition-colors"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>
                              )
                            )}
                          </aside>
                        )}

                      {showSeismicityTrendOverlay && (
                        <SeismicityTrendOverlay
                          historicalEvents={historicalTrendEvents}
                          isLoading={historicalTrendLoading}
                          error={historicalTrendError}
                          viewport={sharedViewport}
                          basemapId={basemapId}
                          themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                          onClose={() => setShowSeismicityTrendOverlay(false)}
                        />
                      )}
                    </div>

                    {showEpicenterTimeline && (
                      <EpicenterTimelinePanel
                        catalogEvents={timelineCatalog}
                        visibleEvents={visibleTimelineEvents}
                        playheadMs={
                          timelineBounds
                            ? Math.max(
                                timelineBounds.minMs,
                                Math.min(
                                  timelineBounds.maxMs,
                                  timelinePlayheadMs || timelineBounds.maxMs
                                )
                              )
                            : 0
                        }
                        onChangePlayheadMs={(ms) => {
                          timelinePlayheadRef.current = ms;
                          setTimelinePlayheadMs(ms);
                        }}
                        isPlaying={timelinePlaying}
                        onTogglePlay={handleToggleTimelinePlay}
                        playbackSpeed={timelineSpeed}
                        onChangePlaybackSpeed={setTimelineSpeed}
                        loopPlayback={timelineLoop}
                        onToggleLoop={() => setTimelineLoop((v) => !v)}
                        trailMode={timelineTrailMode}
                        onChangeTrailMode={setTimelineTrailMode}
                        sourceFilter={timelineSourceFilter}
                        onChangeSourceFilter={setTimelineSourceFilter}
                        minMagnitude={timelineMinMag}
                        onChangeMinMagnitude={setTimelineMinMag}
                        showMigrationPath={timelineShowMigration}
                        onToggleMigrationPath={() => setTimelineShowMigration((v) => !v)}
                        viewportOnly={timelineViewportOnly}
                        onToggleViewportOnly={() => setTimelineViewportOnly((v) => !v)}
                        workspaceCount={timelineWorkspaceCount}
                        historicalCount={historicalTrendEvents.length}
                        isLoadingHistorical={historicalTrendLoading}
                        historicalError={historicalTrendError}
                        isFetchingUsgs={isFetchingTimelineUsgs}
                        onFetchUsgsCatalog={() => void handleFetchTimelineUsgs()}
                        onOpenHistoricalResearch={() => {
                          setResearchSubTab('historical-seismicity');
                          navigateEqpModule('research', 'research');
                        }}
                        selectedTimelineEventId={selectedTimelineEventId}
                        onSelectTimelineEvent={(ev) => {
                          setSelectedTimelineEventId(ev.id);
                        }}
                        themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                        onClose={() => {
                          setTimelinePlaying(false);
                          setShowEpicenterTimeline(false);
                        }}
                      />
                    )}
                  </div>

                  {/* Focused Sidebar for Tsunami tab */}
                  {eqpTab === 'tsunami' && (
                    <div className="lg:col-span-4 space-y-4">
                      <section className="card bg-[#eff7f6] border border-teal-700/65 rounded-lg p-4 space-y-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                        <div className="flex items-start justify-between gap-2 pb-2 border-b border-teal-800/40">
                          <div className="flex items-center gap-2">
                            <Waves className="w-4 h-4 text-sky-700 shrink-0" />
                            <div>
                              <h2 className="text-sm font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                                Tsunami Screening &amp; Trench Proximity
                              </h2>
                              <p className="text-xs text-slate-600">
                                Subduction trench distance, depth &amp; magnitude evaluation
                              </p>
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${
                              tsunamiScreening.level === 'Warning'
                                ? 'bg-rose-100 text-rose-800 border border-rose-400'
                                : tsunamiScreening.level === 'Information'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-400'
                                  : 'bg-emerald-100/80 text-emerald-800 border border-emerald-700/45'
                            }`}
                          >
                            Suggested: {tsunamiScreening.level}
                          </span>
                        </div>

                        <p className="sub-card text-xs text-slate-800 bg-[#d7ebe8] border border-teal-800/60 rounded p-2.5 leading-relaxed">
                          {tsunamiScreening.headline}
                        </p>

                        <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
                          <div className="sub-card bg-[#d7ebe8] border border-teal-800/60 rounded p-2">
                            <div className="font-sans text-[10px] text-slate-600 font-medium">Magnitude</div>
                            <div
                              className={`font-semibold ${
                                tsunamiScreening.isSignificantMag ? 'text-rose-700' : 'text-slate-900'
                              }`}
                            >
                              M {tsunamiScreening.effectiveMag.toFixed(1)}
                            </div>
                          </div>
                          <div className="sub-card bg-[#d7ebe8] border border-teal-800/60 rounded p-2">
                            <div className="font-sans text-[10px] text-slate-600 font-medium">Focal Depth</div>
                            <div
                              className={`font-semibold ${
                                tsunamiScreening.isShallow ? 'text-amber-800' : 'text-slate-900'
                              }`}
                            >
                              {isUnlocated ? '—' : `${activeEvent.depthKm.toFixed(1)} km`}
                            </div>
                          </div>
                          <div className="sub-card bg-[#d7ebe8] border border-teal-800/60 rounded p-2">
                            <div className="font-sans text-[10px] text-slate-600 font-medium">Nearest Trench</div>
                            <div
                              className={`font-semibold ${
                                tsunamiScreening.isNearTrench ? 'text-rose-700' : 'text-slate-900'
                              }`}
                            >
                              {tsunamiScreening.nearestTrench
                                ? `${tsunamiScreening.nearestTrench.distanceKm.toFixed(0)} km`
                                : '—'}
                            </div>
                          </div>
                        </div>

                        {tsunamiScreening.nearestTrench && (
                          <div className="sub-card bg-[#d7ebe8] border border-teal-800/60 rounded px-2.5 py-1.5 text-xs flex items-center justify-between text-slate-700">
                            <span>Subduction Boundary</span>
                            <span className="font-mono font-semibold text-slate-900">
                              {tsunamiScreening.nearestTrench.name} ({tsunamiScreening.nearestTrench.bearingLabel})
                            </span>
                          </div>
                        )}

                        <div className="sub-card bg-[#e2f1ef] border border-teal-800/55 rounded p-2.5 space-y-1.5">
                          <div className="text-[11px] font-semibold text-slate-800">
                            Bulletin Tsunami Status
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-xs">
                            {(['None', 'Information', 'Warning'] as const).map((statusOpt) => {
                              const isCurrent = activeEvent.tsunamiStatus === statusOpt;
                              return (
                                <button
                                  key={statusOpt}
                                  type="button"
                                  onClick={() =>
                                    updateActiveEvent((ev) => ({
                                      ...ev,
                                      tsunamiStatus: statusOpt,
                                    }))
                                  }
                                  className={`py-1.5 px-2 rounded border font-medium transition-colors ${
                                    isCurrent
                                      ? statusOpt === 'Warning'
                                        ? 'bg-rose-600 border-rose-700 text-white'
                                        : statusOpt === 'Information'
                                          ? 'bg-amber-600 border-amber-700 text-white'
                                          : 'bg-slate-900 border-slate-900 text-white'
                                      : 'bg-[#f4fbfa] border-teal-800/50 text-slate-800 hover:bg-white'
                                  }`}
                                >
                                  {statusOpt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </section>

                      <section className="card bg-[#eef6f8] border border-cyan-700/65 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                        <div className="px-4 py-2.5 bg-[#dfeef2] border-b border-cyan-800/55 flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                              Subduction Trench Proximity Table
                            </h3>
                            <p className="text-[11px] text-slate-600">
                              Distance from epicenter to mapped trench systems
                            </p>
                          </div>
                          <span className="sub-card bg-[#cde2e8] border border-cyan-800/55 rounded px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-800">
                            {tsunamiTrenchProximities.length} trenches
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead>
                              <tr className="bg-[#d2e7ed] border-b border-cyan-800/55 text-slate-800 font-semibold">
                                <th className="px-3 py-1.5">Trench / Boundary</th>
                                <th className="px-2.5 py-1.5 text-right">Dist (km)</th>
                                <th className="px-2.5 py-1.5 text-center">Bearing</th>
                                <th className="px-3 py-1.5 text-right">Zone</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-cyan-800/20 font-mono tabular-nums">
                              {tsunamiTrenchProximities.map((trench, idx) => {
                                const isNear =
                                  trench.distanceKm !== null && trench.distanceKm <= 120;
                                return (
                                  <tr
                                    key={trench.name}
                                    className={`transition-colors ${
                                      idx % 2 === 0
                                        ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                                        : 'bg-[#e8f2f7] hover:bg-[#dbeafe]'
                                    }`}
                                  >
                                    <td className="px-3 py-1.5 font-sans font-medium text-slate-900">
                                      {trench.name}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-right text-slate-800">
                                      {trench.distanceKm !== null
                                        ? trench.distanceKm.toFixed(1)
                                        : '—'}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-center text-slate-700">
                                      {trench.bearingLabel}
                                    </td>
                                    <td
                                      className={`px-3 py-1.5 text-right font-sans font-semibold ${
                                        trench.distanceKm === null
                                          ? 'text-slate-400'
                                          : isNear
                                            ? 'text-rose-700'
                                            : 'text-slate-600'
                                      }`}
                                    >
                                      {trench.distanceKm === null
                                        ? 'Pending'
                                        : isNear
                                          ? '≤120 km Near'
                                          : 'Regional'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </div>
                  )}

                  {/* Integrated Intensity Meter Sidebar (ShakeMap Engine + PEIS Legend) inside Map tab */}
                  {eqpTab === 'map' && showIntensityMeterSidebar && (
                    <div className="lg:col-span-4 space-y-4">
                      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <Gauge className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <h2 className="text-sm font-semibold text-slate-900">
                                Intensity Meter · ShakeMap Engine
                              </h2>
                              <p className="text-xs text-slate-500">
                                GMPE attenuation &amp; marching-squares contours (d3-contour)
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowIntensityMeterSidebar(false)}
                            title="Hide Intensity Meter panel to expand map width"
                            className="px-2 py-1 rounded border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                          >
                            Hide
                          </button>
                        </div>
                        {shakeMapEngineBody}
                      </section>

                      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h2 className="text-sm font-semibold text-slate-900">
                              PEIS Intensity Color Legend
                            </h2>
                            <p className="text-xs text-slate-500">
                              Click any band to toggle its map contour
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApplyShakePreset('all')}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                          >
                            Show All
                          </button>
                        </div>
                        {peisLegendList}
                      </section>
                    </div>
                  )}
                </div>

                {/* Historical Seismicity Frequency Over Time Visualization */}
                <HistoricalFrequencyChart
                  historicalEvents={historicalTrendEvents}
                  activeEvent={activeEvent}
                  viewport={sharedViewport}
                  basemapId={basemapId}
                  isLoading={historicalTrendLoading}
                  error={historicalTrendError}
                  isFetchingUsgs={isFetchingTimelineUsgs}
                  onFetchUsgs={() => void handleFetchTimelineUsgs()}
                  onReloadCatalog={() => void ensureHistoricalTrendCatalogLoaded(true)}
                  onOpenHistoricalResearch={() => {
                    setResearchSubTab('historical-seismicity');
                    navigateEqpModule('research', 'research');
                  }}
                  onOpenSequenceResearch={() => {
                    setResearchSubTab('earthquake-sequence');
                    navigateEqpModule('research', 'research');
                  }}
                  themeVariant={isTsunamiTab ? 'tsunami' : 'default'}
                />
              </div>
            );
          })()}

          {/* VIEW 3: MAGNITUDE & PEIS */}
          {activeSection === 'magnitude' && (
            <div className="space-y-5">
              {/* Macroseismic & Instrumental Intensity Input Panel */}
              <IntensityInputPanel
                key={`${activeEvent.id}-${workspaceResetNonce}`}
                event={activeEvent}
                isDirty={Boolean(dirtyIds[activeEvent.id])}
                isSaving={isSavingEqp}
                placesCatalog={placesCatalog}
                onChangeEvent={updateActiveEvent}
                onSaveIntensities={() => handleSaveEvent()}
                onSendToBulletin={() => {
                  navigateEqpModule('bulletin', 'bulletin');
                  showNotice('Updated PHIVOLCS Bulletin with intensity report');
                }}
                onNavigateToBulletin={() => navigateEqpModule('bulletin', 'bulletin')}
                onNotice={showNotice}
              />

              {/* Pick Magnitude Distribution & Outlier Visualization (Recharts) */}
              <MagnitudeDistributionChart
                picks={activeEvent.picks}
                scale={activeEvent.preferredScale}
                depthKm={activeEvent.depthKm}
                meanAll={magnitudeAnalysis.meanAll}
                stdDev={magnitudeAnalysis.stdDev}
                filteredMean={magnitudeAnalysis.filteredMean}
                varianceK={varianceK}
                outliers={magnitudeAnalysis.outliers}
                history={activeEvent.magnitudeHistory}
              />
            </div>
          )}

          {/* VIEW 4: BULLETIN COMPOSER */}
          {activeSection === 'bulletin' && (
            <BulletinView
              event={activeEvent}
              freshness={activeMagnitudeFreshness}
              solutionDrive={solutionDrive}
              primaryLocationLabel={primaryLocationLabel}
              faultGeneratorLabel={selectedGenerator?.label ?? null}
              shakeMap={filteredShakeMapData}
              printSource={bulletinWithFault}
              onChangePrintSource={handleChangeBulletinPrintSource}
              pdfIncludeMap={pdfIncludeMap}
              onChangePdfIncludeMap={setPdfIncludeMap}
              pdfIncludeCharts={pdfIncludeCharts}
              onChangePdfIncludeCharts={setPdfIncludeCharts}
              isGeneratingPdf={isGeneratingPdf}
              openedBulletin={openedBulletin}
              onCloseOpenedBulletin={() => setOpenedBulletin(null)}
              onBulletinHtmlProviderChange={handleBulletinHtmlProviderChange}
              onUpdateEvent={handleUpdateBulletinEvent}
              onDownloadPdf={handleTriggerPrintBulletin}
              onPrintBulletin={handlePrintDisplayedBulletin}
              onSaveCatalog={() => handleSaveBulletin()}
              onNotice={showNotice}
              iconStyle={iconStyle}
              buttonStyle={buttonStyle}
            />
          )}

          {/* VIEW 4B: EARTHQUAKE PRIMER GENERATOR */}
          {activeSection === 'primer' && (
            <PrimerGeneratorPanel
              event={activeEvent}
              primaryLocationLabel={primaryLocationLabel}
              faultGeneratorLabel={selectedGenerator?.label ?? null}
              isPlotResultStale={isPlotResultStale}
              nearestCitiesPins={nearestCitiesPins}
              mainOffice={mainOffice}
              gisActiveFaultsData={gisActiveFaultsData}
              gisManifest={gisManifest}
              gisFaultsLoading={gisFaultsLoading}
              onLoadGisActiveFaults={() => void ensureGisFaultsLoaded()}
              onNotice={showNotice}
              externalPendingPrimer={pendingOpenedPrimer}
              onConsumeExternalPendingPrimer={handleConsumePendingPrimer}
              onControllerReady={handlePrimerControllerReady}
              onStatusChange={setPrimerPanelStatus}
            />
          )}

          {/* VIEW 4C: SOCIAL MEDIA & EARTHQUAKE COMMUNICATIONS CENTER (COM-1) */}
          {activeSection === 'social-media' && (
            <SocialMediaPanel
              event={activeEvent}
              freshness={activeMagnitudeFreshness}
              primaryLocationLabel={primaryLocationLabel}
              isBulletinEdited={isBulletinEdited}
              hasSavedBulletinOnDisk={isBulletinSaved}
              savedBulletinFilename={savedBulletinTargetsById[activeEvent.id]?.filename ?? null}
              openedBulletinFilename={openedBulletin?.filename ?? null}
              onNavigateToBulletin={() => navigateEqpModule('bulletin', 'bulletin')}
              onNotice={showNotice}
            />
          )}

          {/* VIEW 5: EQP VERSION HISTORY & EVENT CATALOG */}
          {activeSection === 'catalog' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
                <div className="inline-flex rounded border border-slate-300 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('timeline')}
                    className={`px-3 py-1 rounded-xs font-medium ${
                      historyViewMode === 'timeline'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    EQP Version History ({eqpHistory.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryViewMode('catalog')}
                    className={`px-3 py-1 rounded-xs font-medium ${
                      historyViewMode === 'catalog'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Annual Event Catalog ({events.length})
                  </button>
                </div>
                <span className="text-[11px] text-slate-500">
                  Auto-tracks saves, relocations, AI picks, magnitudes, PEIS &amp; bulletin updates
                </span>
              </div>

              {historyViewMode === 'timeline' ? (
                <EqpHistoryPanel
                  entries={eqpHistory}
                  activeEvent={activeEvent}
                  events={events}
                  savedFiles={savedEqpFiles}
                  isSyncing={isSyncingHistory}
                  onRefreshSync={refreshEqpHistory}
                  onRecordCheckpointNow={handleRecordHistoryCheckpointNow}
                  onOpenDiskFile={(relPath, displayPath, filename) => {
                    void handleOpenDiskEqpFile(relPath, displayPath, filename);
                  }}
                  onLoadCatalogEvent={(eventId) => {
                    setActiveEventId(eventId);
                    navigateEqpModule('locate', 'data');
                  }}
                  onSaveNextBulletin={() => {
                    void handleSaveNextBulletin();
                  }}
                />
              ) : (
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        Annual Event Catalog (EQPCatalog-YYYY.dat)
                      </h2>
                      <p className="text-xs text-slate-500">
                        {filteredCatalog.length} of {events.length} earthquake solutions shown
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search place or .EQP file..."
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-md w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <label className="inline-flex items-center gap-1.5 text-slate-600">
                        <Filter className="w-3.5 h-3.5 text-slate-400" />
                        <span>Min Mag</span>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          max={9}
                          value={catalogMinMag}
                          onChange={(e) => setCatalogMinMag(Number(e.target.value) || 0)}
                          className="w-16 px-2 py-1 border border-slate-300 rounded font-mono tabular-nums"
                        />
                      </label>

                      <label className="inline-flex items-center gap-1.5 text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={catalogFeltOnly}
                          onChange={(e) => setCatalogFeltOnly(e.target.checked)}
                          className="accent-blue-600"
                        />
                        Felt Only
                      </label>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <th className="py-2.5 px-4 font-medium">Origin (GMT)</th>
                          <th className="py-2.5 px-3 font-medium">Filename</th>
                          <th className="py-2.5 px-3 text-right font-medium">Lat</th>
                          <th className="py-2.5 px-3 text-right font-medium">Lon</th>
                          <th className="py-2.5 px-3 text-right font-medium">Depth</th>
                          <th className="py-2.5 px-3 text-right font-medium">Mag</th>
                          <th className="py-2.5 px-3 text-right font-medium">RMS</th>
                          <th
                            className="py-2.5 px-3 text-right font-medium cursor-help underline decoration-dotted underline-offset-2"
                            title={formatLocationQualityTooltip(null)}
                          >
                            LQI
                          </th>
                          <th className="py-2.5 px-3 text-center font-medium">Felt</th>
                          <th className="py-2.5 px-4 font-medium">Location</th>
                          <th className="py-2.5 px-4 text-right font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                        {filteredCatalog.map((ev) => {
                          const meta = ev.magnitudeMetadata;
                          const mag: number | null =
                            meta &&
                            (!isPreferredMethodSelected(meta) ||
                              (meta.originState === 'computed_current' &&
                                meta.selectedStatus !== 'valid'))
                              ? null
                              : meta && meta.preferredMethodId !== 'eqp-legacy-ms'
                                ? meta.selectedMagnitude
                                : ev.preferredScale === 'Ms'
                                  ? ev.ms
                                  : ev.preferredScale === 'Mb'
                                    ? ev.mb
                                    : ev.md;
                          const place =
                            ev.cities.find((c) => c.id === ev.selectedCityId)?.label ??
                            ev.towns[0]?.label ??
                            '—';
                          const isCurrent = ev.id === activeEvent.id;
                          const evUnlocated = isEventUnlocated(ev);
                          const evLqi = computeEventLocationQuality(ev);
                          return (
                            <tr
                              key={ev.id}
                              className={isCurrent ? 'bg-blue-50/60' : 'hover:bg-slate-50'}
                            >
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                {ev.originDateGmt} {ev.originTimeGmt}
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">{ev.filename}</td>
                              <td className="py-2.5 px-3 text-right">
                                {evUnlocated ? '—' : ev.lat.toFixed(3)}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {evUnlocated ? '—' : ev.lon.toFixed(3)}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {evUnlocated ? '—' : ev.depthKm.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold">
                                {mag === null || (evUnlocated && mag === 0) ? '—' : mag.toFixed(1)}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {evUnlocated ? '—' : ev.rmsSec.toFixed(2)}
                              </td>
                              <td
                                className="py-2.5 px-3 text-right whitespace-nowrap cursor-help"
                                title={formatLocationQualityTooltip(evLqi)}
                              >
                                {evLqi ? (
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-xs border text-[10px] font-semibold ${
                                      evLqi.grade === 'A'
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : evLqi.grade === 'B'
                                          ? 'bg-sky-50 border-sky-200 text-sky-800'
                                          : evLqi.grade === 'C'
                                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                                            : 'bg-rose-50 border-rose-200 text-rose-800'
                                    }`}
                                  >
                                    {evLqi.score} ({evLqi.grade})
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {hasEventFeltDesignation(ev) ? 'F' : '—'}
                              </td>
                              <td className="py-2.5 px-4 font-sans text-slate-700">{place}</td>
                              <td className="py-2.5 px-4 text-right font-sans">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveEventId(ev.id);
                                    navigateEqpModule('locate', 'data');
                                    showNotice(`Loaded ${ev.filename}`);
                                  }}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                                >
                                  {isCurrent ? 'Active' : 'Load Event'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* VIEW 6: STATION & VELOCITY DB */}
          {activeSection === 'database' && (
            <div className="bg-[#dde4ee] border border-slate-600/70 rounded-lg p-3.5 sm:p-4 space-y-5 shadow-[0_4px_14px_-3px_rgba(15,23,42,0.2)]">
              <div className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div>
                  <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                    Station, Crustal Model &amp; Reference Places Databases
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Manage seismic &amp; volcanic station coordinates, 24h SEEDLink health, catalog phase-bias calibration, and nearest places / fault generator traces.
                  </p>
                </div>
                <div className="bg-[#e4e9f1] border border-slate-700/60 rounded px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-800">
                  {stations.length} Stations · {placesCatalog?.cities.length ?? 0} Cities · {(placesCatalog?.towns.length ?? 0).toLocaleString()} Towns
                </div>
              </div>

              <StationDatabasePanel
                stations={stations}
                issues={stationIssues}
                sourceName={stationSourceName}
                updatedAt={stationUpdatedAt}
                searchQuery={stationSearch}
                onChangeSearch={setStationSearch}
                selectedCode={dbSelectedStationCode}
                onSelectStation={setDbSelectedStationCode}
                onUpdateStation={handleUpdateStation}
                onAddStation={handleAddStation}
                onDeleteStation={handleDeleteStation}
                onImportPhilsta={handleImportPhilsta}
                onResetCatalog={handleResetStationCatalog}
              />

              <StationHealthWidget
                stations={filteredStations}
                selectedCode={dbSelectedStationCode}
                onSelectStation={setDbSelectedStationCode}
              />

              <StationBiasPanel
                events={events}
                stations={stations}
                searchQuery={stationSearch}
                selectedCode={dbSelectedStationCode}
                onSelectStation={setDbSelectedStationCode}
                onApplyStationDelay={(code, delaySec) => {
                  handleUpdateStation(code, { delaySec });
                }}
              />

              <PlacesDatabasePanel
                catalog={placesCatalog}
                updatedAt={placesUpdatedAt}
                onSaveItems={handleSavePlacesItems}
                onImportRawText={handleImportPlacesRawText}
                onResetKind={handleResetPlacesKind}
              />
            </div>
          )}

          {/* VIEW 7: AI ANALYST & LIVE VOICE */}
          {activeSection === 'assistant' && (
            <div className="bg-[#dde4ee] border border-slate-600/70 rounded-lg p-3.5 sm:p-4 space-y-5 shadow-[0_4px_14px_-3px_rgba(15,23,42,0.2)]">
              <div className="bg-[#f5f7fa] border border-slate-600/70 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div>
                  <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                    Seismology Utilities &amp; Assistant Workspace
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Multi-turn seismic chat diagnostics, real-time voice briefing, and Google Maps field grounding anchored to the active event.
                  </p>
                </div>
                <div className="bg-[#e4e9f1] border border-slate-700/60 rounded px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-800">
                  {activeEvent.filename} · {activeEvent.picks.length} picks
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                <div className="xl:col-span-7">
                  <SeismologyChatPanel
                    key={`chat-${activeEvent.id}-${workspaceResetNonce}`}
                    event={activeEvent}
                    eventContextText={eventContextText}
                  />
                </div>
                <div className="xl:col-span-5">
                  <LiveVoicePanel
                    key={`voice-${activeEvent.id}-${workspaceResetNonce}`}
                    event={activeEvent}
                    eventContextText={eventContextText}
                  />
                </div>
              </div>
              <MapsGroundingPanel
                key={`maps-grounding-assistant-${activeEvent.id}-${workspaceResetNonce}`}
                event={activeEvent}
              />
            </div>
          )}

          {/* VIEW 8: SETTINGS (TABBED PANEL: APPEARANCE, STORAGE, MAIN OFFICE, PRINTERS, SAVED FILES) */}
          {activeSection === 'settings' && (
            <div className="settings-panel bg-[#dde4ee] border border-slate-600/70 rounded-lg p-3.5 sm:p-4 space-y-4 shadow-[0_4px_14px_-3px_rgba(15,23,42,0.2)]">
              {/* Settings Workstation Header */}
              <div className="card bg-[#f5f7fa] border border-slate-600/70 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Settings className="w-4 h-4 text-blue-700 shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                      Workstation Settings
                    </h2>
                    <p className="text-xs text-slate-600">
                      Configure theme presets, solution drive paths, main office reference coordinates, system printers, and saved files
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="sub-card bg-[#e4e9f1] border border-slate-700/60 rounded px-2.5 py-1 text-[11px] text-slate-800 font-mono font-semibold tabular-nums">
                    {normalizeSolutionDrive(solutionDrive)} · {mainOffice.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigateEqpModule('locate', 'data')}
                    className="px-3 py-1.5 rounded-md border border-slate-600/70 bg-white text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    Return to Data Tab
                  </button>
                </div>
              </div>

              {/* Connected Folder-Style Tabbed Panel */}
              <div className="border border-[#466f9d] rounded-xl bg-[#e3eaf3] shadow-[0_3px_10px_-2px_rgba(15,23,42,0.14),0_1px_4px_-1px_rgba(15,23,42,0.08)]">
                <div
                  role="tablist"
                  aria-label="Workstation Settings Categories"
                  className="bg-[#cfd9e8] border-b border-[#5b7da4] rounded-t-[11px] px-4 pt-3 flex flex-wrap items-end justify-start text-[11px] shrink-0"
                >
                  {(
                    [
                      {
                        id: 'appearance',
                        label: 'Appearance & Theme',
                        icon: <Sparkles className="w-[17px] h-[17px] shrink-0 text-indigo-600" />,
                        meta: null,
                      },
                      {
                        id: 'magnitude',
                        label: 'Magnitude',
                        icon: <Activity className="w-[17px] h-[17px] shrink-0 text-rose-600" />,
                        meta:
                          MAGNITUDE_ALGORITHM_BY_ID[magnitudeSettings.defaultMethod]
                            ?.scale ?? 'Ms',
                      },
                      {
                        id: 'storage',
                        label: 'Storage & Drive',
                        icon: <HardDrive className="w-[17px] h-[17px] shrink-0 text-blue-600" />,
                        meta: normalizeSolutionDrive(solutionDrive),
                      },
                      {
                        id: 'office',
                        label: 'Main Office',
                        icon: <MapPin className="w-[17px] h-[17px] shrink-0 text-emerald-600" />,
                        meta: mainOffice.code,
                      },
                      {
                        id: 'printers',
                        label: 'System Printers',
                        icon: <Printer className="w-[17px] h-[17px] shrink-0 text-amber-600" />,
                        meta:
                          hostPrinterStatus && hostPrinterStatus.printers.length > 0
                            ? `${hostPrinterStatus.printers.length}`
                            : null,
                      },
                      {
                        id: 'files',
                        label: 'Saved Files',
                        icon: <FolderOpen className="w-[17px] h-[17px] shrink-0 text-cyan-600" />,
                        meta: `${savedEqpFiles.length + savedBulletinFiles.length}`,
                      },
                    ] as const
                  ).map((tab) => {
                    const isActive = settingsSubTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        id={`settings-tab-${tab.id}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`settings-panel-${tab.id}`}
                        onClick={() => setSettingsSubTab(tab.id)}
                        className={`eqp-tab-ext ${isActive ? 'eqp-tab-ext-active' : ''}`}
                      >
                        {tab.icon}
                        <span className="font-bold tracking-tight">
                          {tab.label}
                          {tab.meta !== null && (
                            <span
                              className={`ml-1 text-[10px] font-mono font-semibold tabular-nums ${
                                isActive ? 'text-slate-600' : 'text-slate-600/90'
                              }`}
                            >
                              ({tab.meta})
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  id={`settings-panel-${settingsSubTab}`}
                  role="tabpanel"
                  aria-labelledby={`settings-tab-${settingsSubTab}`}
                  className="bg-[#e3eaf3] rounded-b-[11px] p-4 space-y-5"
                >
                  {settingsSubTab === 'appearance' && (
                    <>
              <section className="card bg-[#f3f1fb] border border-indigo-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-4 py-3 bg-[#e5e1f7]/85 border-b border-indigo-800/50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-700" />
                    <div>
                      <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                        Workstation Icon &amp; Button Theme
                      </h2>
                      <p className="text-xs text-slate-600">
                        Select how icons, buttons, and menus are styled across the Event Parameters Close button, Left Action Rail, Action Toolbar, Bulletin footer, and Top Menus
                      </p>
                    </div>
                  </div>
                  <span className="sub-card text-[11px] font-medium px-2.5 py-1 rounded-md bg-[#dcd6f5] text-slate-800 border border-indigo-800/55">
                    Active:{' '}
                    <strong className="text-slate-900">
                      {ICON_STYLE_OPTIONS.find((o) => o.id === iconStyle)?.badge}
                    </strong>
                  </span>
                </div>

                <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {ICON_STYLE_OPTIONS.map((option) => {
                    const selected = iconStyle === option.id;
                    return (
                      <label
                        key={option.id}
                        className={`sub-card flex flex-col justify-between gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                          selected
                            ? 'border-blue-700 bg-[#dbeafe] shadow-sm'
                            : 'border-indigo-800/55 bg-[#e5e1f7] hover:border-indigo-900/75 hover:bg-[#dcd6f5]'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => handleSelectIconStyle(option.id)}
                                aria-label={option.title}
                                className="mt-0.5 w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
                              />
                              <div>
                                <div className="text-xs font-bold text-slate-900 leading-snug">
                                  {option.title}
                                </div>
                                <span
                                  className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                    selected
                                      ? 'bg-blue-100 text-blue-900 border-blue-500'
                                      : 'bg-[#d5cef2] text-slate-800 border-indigo-800/45'
                                  }`}
                                >
                                  {option.badge}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-700 leading-relaxed pl-6">
                            {option.description}
                          </p>
                        </div>

                        {/* Interactive Live Preview Strip */}
                        <div className="mt-1 p-2.5 rounded-md border border-indigo-800/55 bg-gradient-to-br from-[#d5dff0] to-[#c4d2e8] space-y-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                            <span>Live Preview (hover icons)</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle,
                                iconStyle: option.id,
                                action: 'plot',
                                surface: 'rail',
                              })} w-14 py-1.5 px-1 border inline-flex flex-col items-center gap-1 text-[10px] font-bold`}
                            >
                              <WorkstationActionIcon
                                preset={option.id}
                                action="plot"
                                size="rail"
                              />
                              <span>PLOT</span>
                            </span>
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle,
                                iconStyle: option.id,
                                action: 'save',
                                surface: 'toolbar',
                              })} px-2 py-1 border inline-flex items-center gap-1.5 text-[11px] font-semibold`}
                            >
                              <WorkstationActionIcon
                                preset={option.id}
                                action="save"
                                size="toolbar"
                              />
                              <span>Save</span>
                            </span>
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle,
                                iconStyle: option.id,
                                action: 'close',
                                surface: 'toolbar',
                              })} px-2 py-1 border inline-flex items-center gap-1.5 text-[11px] font-semibold`}
                            >
                              <WorkstationActionIcon
                                preset={option.id}
                                action="close"
                                size="toolbar"
                              />
                              <span>Close</span>
                            </span>
                            <span className="group px-2 py-1 rounded bg-white border border-slate-500/70 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-800 hover:bg-blue-600 hover:text-white transition-colors">
                              <WorkstationMenuIcon preset={option.id} action="open" />
                              <span>Menu</span>
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="card bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-4 py-3 bg-[#dce9f8]/85 border-b border-sky-800/50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-700" />
                    <div>
                      <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                        Button Surface &amp; Layout Style
                      </h2>
                      <p className="text-xs text-slate-600">
                        Customize button colors, bevel depth, accent strips, and hover sheen animations across the Event Parameters Close button, Action Rail, Toolbar, and Bulletin footer
                      </p>
                    </div>
                  </div>
                  <span className="sub-card text-[11px] font-medium px-2.5 py-1 rounded-md bg-[#cfe1f5] text-slate-800 border border-sky-800/55">
                    Active:{' '}
                    <strong className="text-slate-900">
                      {BUTTON_STYLE_OPTIONS.find((o) => o.id === buttonStyle)?.badge}
                    </strong>
                  </span>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {BUTTON_STYLE_OPTIONS.map((option) => {
                    const selected = buttonStyle === option.id;
                    return (
                      <label
                        key={option.id}
                        className={`sub-card flex flex-col justify-between gap-3 p-3.5 rounded-lg border-2 cursor-pointer transition-all ${
                          selected
                            ? 'border-blue-700 bg-[#dbeafe] shadow-sm'
                            : 'border-sky-800/55 bg-[#dce9f8] hover:border-sky-900/75 hover:bg-[#cfe1f5]'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => handleSelectButtonStyle(option.id)}
                              aria-label={option.title}
                              className="mt-0.5 w-4 h-4 accent-blue-600 rounded cursor-pointer shrink-0"
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-900 leading-snug">
                                {option.title}
                              </div>
                              <span
                                className={`mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                  selected
                                    ? 'bg-blue-100 text-blue-900 border-blue-500'
                                    : 'bg-[#c9ddf4] text-slate-800 border-sky-800/45'
                                }`}
                              >
                                {option.badge}
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-700 leading-relaxed pl-6">
                            {option.description}
                          </p>
                        </div>

                        {/* Interactive Button Layout Preview */}
                        <div className="mt-1 p-2.5 rounded-md border border-sky-800/55 bg-gradient-to-b from-[#cedff5] via-[#9abce8]/65 to-[#4f84c7]/45 space-y-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-800">
                            Hover &amp; Click Preview
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle: option.id,
                                iconStyle,
                                action: 'new',
                                surface: 'toolbar',
                              })} px-2 py-1 border inline-flex items-center gap-1 text-[11px] font-semibold`}
                            >
                              <WorkstationActionIcon
                                preset={iconStyle}
                                action="new"
                                size="toolbar"
                              />
                              <span>New</span>
                            </span>
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle: option.id,
                                iconStyle,
                                action: 'open',
                                surface: 'toolbar',
                              })} px-2 py-1 border inline-flex items-center gap-1 text-[11px] font-semibold`}
                            >
                              <WorkstationActionIcon
                                preset={iconStyle}
                                action="open"
                                size="toolbar"
                              />
                              <span>Open</span>
                            </span>
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle: option.id,
                                iconStyle,
                                action: 'save',
                                surface: 'toolbar',
                              })} px-2 py-1 border inline-flex items-center gap-1 text-[11px] font-semibold`}
                            >
                              <WorkstationActionIcon
                                preset={iconStyle}
                                action="save"
                                size="toolbar"
                              />
                              <span>Save</span>
                            </span>
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle: option.id,
                                iconStyle,
                                action: 'ai-analyst',
                                surface: 'toolbar',
                              })} px-2 py-1 border inline-flex items-center gap-1 text-[11px] font-semibold`}
                            >
                              <WorkstationActionIcon
                                preset={iconStyle}
                                action="ai-analyst"
                                size="toolbar"
                              />
                              <span>AI Analyst</span>
                            </span>
                            <span
                              className={`group ${getWorkstationButtonClass({
                                buttonStyle: option.id,
                                iconStyle,
                                action: 'close',
                                surface: 'toolbar',
                              })} px-2 py-1 border inline-flex items-center gap-1 text-[11px] font-semibold`}
                            >
                              <WorkstationActionIcon
                                preset={iconStyle}
                                action="close"
                                size="toolbar"
                              />
                              <span>Close</span>
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </section>
                    </>
                  )}

                  {settingsSubTab === 'magnitude' && (
                    <MagnitudeConfigurationSection
                      settings={magnitudeSettings}
                      onChangeSettings={handleUpdateMagnitudeSettings}
                      onResetDefaults={handleResetMagnitudeSettings}
                      onReturnToDataTab={() => navigateEqpModule('locate', 'data')}
                    />
                  )}

                  {settingsSubTab === 'storage' && (
              <section className="card bg-[#edf4fc] border border-sky-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-4 py-3 bg-[#dce9f8]/85 border-b border-sky-800/50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-blue-700" />
                    <div>
                      <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                        EQP Solution Storage &amp; Drive Settings
                      </h2>
                      <p className="text-xs text-slate-600">
                        Configure target drive for Data-tab Save (&lt;DRIVE&gt;\EARTHQUAKE\SOLUTION_EQ\Sol_YYYY\MM\DD\)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateEqpModule('locate', 'data')}
                    className="px-3 py-1.5 rounded-md border border-sky-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-sky-50"
                  >
                    Return to Data Tab
                  </button>
                </div>

                <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  <div className="lg:col-span-6 space-y-4">
                    <div className="sub-card bg-[#dce9f8] border border-sky-800/55 rounded-lg p-3.5">
                      <label
                        htmlFor="solution-drive-select"
                        className="block text-xs font-semibold text-slate-900 mb-1.5"
                      >
                        Solution Drive Letter
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          id="solution-drive-select"
                          value={
                            /^[A-Z]:$/.test(normalizeSolutionDrive(solutionDrive))
                              ? normalizeSolutionDrive(solutionDrive)
                              : 'CUSTOM'
                          }
                          onChange={(e) => {
                            if (e.target.value !== 'CUSTOM') {
                              handleSaveDriveSetting(e.target.value);
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-mono font-semibold bg-white border border-sky-800/55 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
                            <option key={letter} value={`${letter}:`}>
                              {letter}:
                            </option>
                          ))}
                          {!/^[A-Z]:$/.test(normalizeSolutionDrive(solutionDrive)) && (
                            <option value="CUSTOM">Custom</option>
                          )}
                        </select>

                        <input
                          type="text"
                          aria-label="Custom drive letter or label"
                          value={driveInputDraft}
                          onChange={(e) => setDriveInputDraft(e.target.value)}
                          placeholder="e.g. Y:"
                          className="w-28 px-2.5 py-1.5 text-xs font-mono bg-white border border-sky-800/55 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        <button
                          type="button"
                          onClick={() => handleSaveDriveSetting(driveInputDraft)}
                          className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                        >
                          Apply Drive
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveDriveSetting(DEFAULT_SOLUTION_DRIVE)}
                          className="px-2.5 py-1.5 rounded-md border border-sky-800/55 bg-white text-slate-800 text-xs font-medium hover:bg-sky-50"
                        >
                          Default (Y:)
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1.5">
                        When pressing <strong>Save</strong> on the <strong>Data</strong> tab, missing date folders are created automatically before writing the <code>.eqp</code> file.
                      </p>
                    </div>

                    <div className="sub-card bg-[#dce9f8] border border-sky-800/55 rounded-lg p-3.5 space-y-2">
                      <div className="text-xs font-semibold text-slate-900">
                        Optional Local Folder Mirror (Desktop Browser)
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void handleLinkLocalDirectory();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-sky-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-sky-50"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-amber-600" />
                          {localDirName ? `Linked: ${localDirName}` : 'Link Local Drive Folder...'}
                        </button>
                        {localDirName && (
                          <button
                            type="button"
                            onClick={() => {
                              localDirHandleRef.current = null;
                              setLocalDirName(null);
                              showNotice('Unlinked local drive folder.');
                            }}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                          >
                            Unlink
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600">
                        All Data-tab saves are automatically persisted on the EQP server directory tree. Linking a local folder additionally mirrors folders and <code>.eqp</code> files directly to your local disk when permitted by your browser.
                      </p>
                    </div>
                  </div>

                  <div className="lg:col-span-6 sub-card bg-[#dce9f8] border border-sky-800/60 rounded-lg p-4 space-y-3 text-xs">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <Folder className="w-4 h-4 text-amber-600" />
                      Active Event Save Target Preview
                    </div>
                    <div className="space-y-2 font-mono tabular-nums">
                      <div>
                        <div className="font-sans text-[11px] text-slate-600">Target Folder (auto-created if missing)</div>
                        <div className="mt-0.5 px-2.5 py-1.5 bg-[#f4f8fe] border border-sky-800/50 rounded text-slate-900 break-all">
                          {resolvedSaveTarget.folderPath}
                        </div>
                      </div>
                      <div>
                        <div className="font-sans text-[11px] text-slate-600">Formatted Filename</div>
                        <div className="mt-0.5 px-2.5 py-1.5 bg-[#f4f8fe] border border-sky-800/50 rounded text-blue-800 font-semibold flex flex-wrap items-center justify-between gap-2">
                          <span>{resolvedSaveTarget.filename}</span>
                          <span
                            className={`font-sans text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              resolvedSaveTarget.isFelt
                                ? 'bg-amber-100 text-amber-800 border border-amber-400'
                                : 'bg-[#dbe7f6] text-slate-700 border border-sky-800/40'
                            }`}
                          >
                            {resolvedSaveTarget.isFelt ? 'F · Felt Event' : 'Unfelt Event'}
                          </span>
                        </div>
                      </div>
                      <div className="font-sans text-[11px] text-slate-700 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-[#cfe0f5] border border-sky-800/55 rounded px-2 py-1.5">
                          <div className="text-[10px] text-slate-600">Date / Time</div>
                          <div className="font-mono font-semibold text-slate-900">
                            {resolvedSaveTarget.year}_{resolvedSaveTarget.month}
                            {resolvedSaveTarget.day}_{resolvedSaveTarget.hh}
                            {resolvedSaveTarget.min}
                          </div>
                        </div>
                        <div className="bg-[#cfe0f5] border border-sky-800/55 rounded px-2 py-1.5">
                          <div className="text-[10px] text-slate-600">Mag Code</div>
                          <div className="font-mono font-semibold text-slate-900">M{resolvedSaveTarget.magCode}</div>
                        </div>
                        <div className="bg-[#cfe0f5] border border-sky-800/55 rounded px-2 py-1.5">
                          <div className="text-[10px] text-slate-600">Depth Code</div>
                          <div className="font-mono font-semibold text-slate-900">D{resolvedSaveTarget.depthCode}</div>
                        </div>
                        <div className="bg-[#cfe0f5] border border-sky-800/55 rounded px-2 py-1.5">
                          <div className="text-[10px] text-slate-600">Bulletin / Felt</div>
                          <div className="font-mono font-semibold text-slate-900">
                            B{resolvedSaveTarget.bulletinNo}
                            {resolvedSaveTarget.isFelt ? 'F' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
                  )}

                  {settingsSubTab === 'office' && (
              <section className="card bg-[#eef7f2] border border-emerald-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-4 py-3 bg-[#d9eee3]/85 border-b border-emerald-800/50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-700" />
                    <div>
                      <h3 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                        Main Office Reference Location ({mainOffice.code})
                      </h3>
                      <p className="text-xs text-slate-600">
                        Location of {mainOffice.code} Main Office used to compute earthquake event distance and bearing in Nearest Places, Maps, and Bulletins
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Sync main office from PHILSTA station"
                      value=""
                      disabled={isSavingMainOffice}
                      onChange={(e) => {
                        if (e.target.value) {
                          void handleSyncOfficeFromQvpStation(e.target.value);
                        }
                      }}
                      className="px-2 py-1.5 rounded-md border border-emerald-800/55 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                    >
                      <option value="">Pick PHILSTA station...</option>
                      {stations
                        .filter((s) => isValidPhCoordinate(s.lat, s.lon))
                        .slice(0, 120)
                        .map((st) => (
                          <option key={st.code} value={st.code}>
                            {st.code} — {st.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={isSavingMainOffice}
                      onClick={() => {
                        void handleSyncOfficeFromQvpStation('QVP');
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-emerald-50 disabled:opacity-60"
                      title="Pull coordinates from QVP station in PHILSTA"
                    >
                      <Compass className="w-3.5 h-3.5 text-blue-700" />
                      Sync from PHILSTA QVP
                    </button>
                    <button
                      type="button"
                      disabled={isSavingMainOffice}
                      onClick={() => {
                        void handleResetMainOfficeSetting();
                      }}
                      className="px-2.5 py-1.5 rounded-md border border-emerald-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      Reset Default
                    </button>
                  </div>
                </div>

                {(() => {
                  const previewOffice: MainOfficeLocation = {
                    code: officeCodeDraft.trim().toUpperCase() || mainOffice.code,
                    name: officeNameDraft.trim() || mainOffice.name,
                    lat: Number.isFinite(Number(officeLatDraft))
                      ? Number(officeLatDraft)
                      : mainOffice.lat,
                    lon: Number.isFinite(Number(officeLonDraft))
                      ? Number(officeLonDraft)
                      : mainOffice.lon,
                  };
                  const qvpRecord = stations.find((s) => s.code.toUpperCase() === 'QVP');
                  const activeDistInfo = !isUnlocated
                    ? computeDistanceAndBearing(
                        previewOffice.lat,
                        previewOffice.lon,
                        activeEvent.lat,
                        activeEvent.lon
                      )
                    : null;

                  // Mini Philippine reference map projection (lon 116..128, lat 4.5..21.5)
                  const miniW = 280;
                  const miniH = 190;
                  const minLon = 116.0;
                  const maxLon = 128.0;
                  const minLat = 4.5;
                  const maxLat = 21.5;
                  const projectMini = (lon: number, lat: number): [number, number] => [
                    ((lon - minLon) / (maxLon - minLon)) * miniW,
                    miniH - ((lat - minLat) / (maxLat - minLat)) * miniH,
                  ];
                  const [ox, oy] = projectMini(previewOffice.lon, previewOffice.lat);
                  const [ex, ey] = !isUnlocated
                    ? projectMini(activeEvent.lon, activeEvent.lat)
                    : [ox, oy];

                  return (
                    <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                      <div className="lg:col-span-6 sub-card bg-[#d9eee3] border border-emerald-800/60 rounded-lg p-3.5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label
                              htmlFor="office-code-input"
                              className="block text-xs font-semibold text-slate-800 mb-1"
                            >
                              Station Code
                            </label>
                            <input
                              id="office-code-input"
                              type="text"
                              value={officeCodeDraft}
                              onChange={(e) => setOfficeCodeDraft(e.target.value.toUpperCase())}
                              placeholder="QVP"
                              maxLength={8}
                              className="w-full px-2.5 py-1.5 text-xs font-mono uppercase bg-white border border-emerald-800/55 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label
                              htmlFor="office-name-input"
                              className="block text-xs font-semibold text-slate-800 mb-1"
                            >
                              Reference Label (shown in &ldquo;... of &lt;Label&gt;&rdquo;)
                            </label>
                            <input
                              id="office-name-input"
                              type="text"
                              value={officeNameDraft}
                              onChange={(e) => setOfficeNameDraft(e.target.value)}
                              placeholder="Quezon City"
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-800/55 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="office-lat-input"
                              className="block text-xs font-semibold text-slate-800 mb-1"
                            >
                              Latitude (°N)
                            </label>
                            <input
                              id="office-lat-input"
                              type="number"
                              step="0.0001"
                              value={officeLatDraft}
                              onChange={(e) => setOfficeLatDraft(e.target.value)}
                              placeholder="14.6520"
                              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-emerald-800/55 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="office-lon-input"
                              className="block text-xs font-semibold text-slate-800 mb-1"
                            >
                              Longitude (°E)
                            </label>
                            <input
                              id="office-lon-input"
                              type="number"
                              step="0.0001"
                              value={officeLonDraft}
                              onChange={(e) => setOfficeLonDraft(e.target.value)}
                              placeholder="121.0590"
                              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-emerald-800/55 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>

                        {qvpRecord && (
                          <div className="rounded-md bg-[#c5e6d5] border border-emerald-800/55 px-3 py-2 text-[11px] text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold">PHILSTA QVP Station:</span>{' '}
                              <span className="font-mono tabular-nums">
                                {qvpRecord.lat.toFixed(4)}° N, {qvpRecord.lon.toFixed(4)}° E
                              </span>{' '}
                              <span className="text-emerald-900">· {qvpRecord.name}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <button
                            type="button"
                            disabled={isSavingMainOffice}
                            onClick={() => {
                              void handleSaveMainOfficeSetting();
                            }}
                            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
                          >
                            {isSavingMainOffice ? 'Saving...' : 'Save Main Office Location'}
                          </button>
                          <button
                            type="button"
                            onClick={() => navigateEqpModule('map', 'map')}
                            className="px-2.5 py-1.5 rounded-md border border-emerald-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-emerald-50"
                          >
                            View on Epicenter Map
                          </button>
                          {mainOfficeUpdatedAt && (
                            <span className="text-[11px] text-slate-600">
                              Saved {new Date(mainOfficeUpdatedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="lg:col-span-6 sub-card bg-[#d9eee3] border border-emerald-800/60 rounded-lg p-4 space-y-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-slate-900">
                            Active Event Reference Preview
                          </div>
                          <span className="font-mono text-[11px] text-slate-700">
                            {mainOffice.code} · {mainOffice.lat.toFixed(4)}°N, {mainOffice.lon.toFixed(4)}°E
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                          <div className="sm:col-span-7 space-y-2 flex flex-col justify-between">
                            <div className="bg-[#f3fbf6] border border-emerald-800/50 rounded px-2.5 py-2 font-mono tabular-nums space-y-1">
                              <div className="text-[11px] font-sans text-slate-600">
                                Saved Main Office ({mainOffice.code})
                              </div>
                              <div className="font-semibold text-slate-900">
                                {mainOffice.lat.toFixed(4)}° N, {mainOffice.lon.toFixed(4)}° E — {mainOffice.name}
                              </div>
                            </div>
                            <div className="bg-[#f3fbf6] border border-emerald-800/50 rounded px-2.5 py-2 font-mono tabular-nums space-y-1.5">
                              <div className="text-[11px] font-sans text-slate-600">
                                Reference Distance to Active Event ({activeEvent.filename})
                              </div>
                              <div className="font-semibold text-emerald-900">
                                {isUnlocated
                                  ? 'Pending hypocenter location'
                                  : formatCentralOfficeBearing(
                                      activeEvent.lat,
                                      activeEvent.lon,
                                      previewOffice
                                    )}
                              </div>
                              {activeDistInfo && (
                                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-emerald-800/25 text-[10.5px] text-slate-700">
                                  <div>
                                    <span className="block font-sans text-slate-500">Distance</span>
                                    <span className="font-semibold text-slate-900">
                                      {activeDistInfo.distKm.toFixed(1)} km
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block font-sans text-slate-500">Azimuth</span>
                                    <span className="font-semibold text-slate-900">
                                      {activeDistInfo.azimDeg.toFixed(1)}°
                                    </span>
                                  </div>
                                  <div>
                                    <span className="block font-sans text-slate-500">Bearing</span>
                                    <span className="font-semibold text-slate-900">
                                      {activeDistInfo.quadrantLabel}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="sm:col-span-5 bg-[#f3fbf6] border border-emerald-800/55 rounded overflow-hidden flex flex-col">
                            <svg
                              viewBox={`0 0 ${miniW} ${miniH}`}
                              className="w-full h-36 bg-[#d8effc] block"
                              aria-label="Main Office to Earthquake Epicenter Reference Map"
                            >
                              {ISLAND_POLYGONS.map((poly, idx) => (
                                <polygon
                                  key={`settings-poly-${idx}`}
                                  points={poly.points
                                    .map(([lon, lat]) => projectMini(lon, lat).join(','))
                                    .join(' ')}
                                  fill="#eef2e6"
                                  stroke="#94a3b8"
                                  strokeWidth={0.7}
                                />
                              ))}
                              {!isUnlocated && activeDistInfo && (
                                <>
                                  <line
                                    x1={ox}
                                    y1={oy}
                                    x2={ex}
                                    y2={ey}
                                    stroke="#059669"
                                    strokeWidth={1.6}
                                    strokeDasharray="4 3"
                                  />
                                  <circle cx={ex} cy={ey} r={4.5} fill="#dc2626" stroke="#ffffff" strokeWidth={1.2} />
                                </>
                              )}
                              <rect
                                x={ox - 4}
                                y={oy - 4}
                                width={8}
                                height={8}
                                rx={1.5}
                                fill="#059669"
                                stroke="#ffffff"
                                strokeWidth={1.2}
                              />
                              <text
                                x={ox + 6}
                                y={oy + 3}
                                fontSize={9}
                                fontWeight={700}
                                fill="#065f46"
                                stroke="rgba(255,255,255,0.9)"
                                strokeWidth={2.5}
                                paintOrder="stroke"
                                className="font-mono"
                              >
                                {previewOffice.code}
                              </text>
                            </svg>
                            <div className="px-2 py-1 text-[10px] font-mono text-slate-700 border-t border-emerald-800/30 flex items-center justify-between">
                              <span className="inline-flex items-center gap-1">
                                <span className="w-2 h-2 rounded-xs bg-emerald-600 inline-block" />
                                {previewOffice.code}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
                                {isUnlocated ? 'Event Pending' : `${Math.round(activeDistInfo?.distKm ?? 0)} km`}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </section>
                  )}

                  {settingsSubTab === 'printers' && (
              <section className="card bg-[#fbf5ea] border border-amber-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-4 py-3 bg-[#f3e6cc]/85 border-b border-amber-800/50 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                      System Printer &amp; Default System Printer
                    </h3>
                    <p className="text-xs text-slate-600">
                      Automatically detects the host operating system default printer for direct Data tab printing.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshSystemPrinters();
                    }}
                    disabled={isCheckingPrinter}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-amber-50 disabled:opacity-60"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isCheckingPrinter ? 'animate-spin' : ''}`} />
                    {isCheckingPrinter ? 'Checking...' : 'Refresh System Printers'}
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="sub-card bg-[#f3e6cc] border border-amber-800/60 rounded-md p-3">
                      <div className="text-[11px] font-medium text-slate-600">Default System Printer</div>
                      <div className="mt-1 font-mono font-semibold text-slate-900 truncate">
                        {hostPrinterStatus?.defaultPrinter || 'None detected'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600">
                        {hostPrinterStatus?.connected ? (
                          <span className="text-emerald-800 font-semibold">Connected &amp; Ready</span>
                        ) : (
                          <span className="text-amber-900 font-semibold">Not Connected</span>
                        )}
                      </div>
                    </div>

                    <div className="sub-card bg-[#f3e6cc] border border-amber-800/60 rounded-md p-3">
                      <div className="text-[11px] font-medium text-slate-600">Detection Source &amp; OS</div>
                      <div className="mt-1 font-mono font-semibold text-slate-900">
                        {hostPrinterStatus?.platform || 'detecting...'}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600 truncate">
                        {hostPrinterStatus?.detectionSource || 'Registry / CUPS / Spooler'}
                      </div>
                    </div>

                    <div className="sub-card bg-[#f3e6cc] border border-amber-800/60 rounded-md p-3">
                      <label
                        htmlFor="settings-lan-printer"
                        className="block text-[11px] font-medium text-slate-600"
                      >
                        Fallback LAN Printer (TCP/9100)
                      </label>
                      <input
                        id="settings-lan-printer"
                        type="text"
                        value={networkPrinterAddress}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNetworkPrinterAddress(val);
                          try {
                            window.localStorage.setItem('eqp_network_printer_address', val);
                          } catch {
                            // Ignore storage failure
                          }
                        }}
                        placeholder="e.g. 192.168.1.50:9100"
                        className="mt-1 w-full rounded border border-amber-800/55 bg-white px-2.5 py-1 text-xs font-mono text-slate-900"
                      />
                    </div>
                  </div>

                  {hostPrinterStatus?.reason && (
                    <div className="sub-card text-xs px-3 py-2 rounded border border-amber-800/55 bg-[#f5e3be] text-amber-950">
                      {hostPrinterStatus.reason}
                    </div>
                  )}

                  {hostPrinterStatus && hostPrinterStatus.printers.length > 0 && (
                    <div className="overflow-x-auto border border-amber-800/60 rounded-md">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-amber-800/55 bg-[#ead8b1] text-slate-800">
                            <th className="py-2 px-3 font-semibold">Printer Name</th>
                            <th className="py-2 px-3 font-semibold">Port / URI</th>
                            <th className="py-2 px-3 font-semibold">Driver</th>
                            <th className="py-2 px-3 font-semibold">Status</th>
                            <th className="py-2 px-3 text-right font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-800/20">
                          {hostPrinterStatus.printers.map((printer, idx) => (
                            <tr
                              key={printer.name}
                              className={
                                idx % 2 === 0
                                  ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                                  : 'bg-[#f8efe0] hover:bg-[#dbeafe]'
                              }
                            >
                              <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                                {printer.name}
                                {printer.isDefault && (
                                  <span className="ml-2 text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                    System Default
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-600">
                                {printer.portOrUri || '—'}
                              </td>
                              <td className="py-2 px-3 text-slate-600">
                                {printer.driver || '—'}
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                {printer.status}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void submitDirectPrintJob({ printerName: printer.name });
                                  }}
                                  disabled={isPrintingDirect}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-800/55 bg-white text-[11px] font-medium text-slate-800 hover:bg-amber-50 disabled:opacity-60"
                                >
                                  <Printer className="w-3 h-3" />
                                  Print Current Event
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
                  )}

                  {settingsSubTab === 'files' && (
                    <>
              <section className="card bg-[#eef6f8] border border-cyan-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-4 py-3 bg-[#dfeef2]/85 border-b border-cyan-800/50 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                      Saved EQP Solution Files ({savedEqpFiles.length})
                    </h3>
                    <p className="text-xs text-slate-600">
                      Directory hierarchy created on save under {resolvedSaveTarget.driveRoot}\{resolvedSaveTarget.baseSegments.join('\\')}\ (persisted on server in <code>eqp_solutions/</code>)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshSavedEqpFiles();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-cyan-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-cyan-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Refresh
                  </button>
                </div>

                {savedEqpFiles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600">
                    No <code>.eqp</code> files saved yet. Click <strong>Save</strong> on any tab (or <strong>File &rarr; Save As</strong>) to create the date folder and write the solution file.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-cyan-800/55 bg-[#d2e7ed] text-slate-800">
                          <th className="py-2 px-4 font-semibold">Folder Path</th>
                          <th className="py-2 px-3 font-semibold">Filename</th>
                          <th className="py-2 px-3 text-right font-semibold">Size</th>
                          <th className="py-2 px-3 font-semibold">Saved At</th>
                          <th className="py-2 px-4 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cyan-800/20 font-mono tabular-nums">
                        {savedEqpFiles.map((file, idx) => (
                          <tr
                            key={file.relPath}
                            className={
                              idx % 2 === 0
                                ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                                : 'bg-[#e8f2f7] hover:bg-[#dbeafe]'
                            }
                          >
                            <td className="py-2 px-4 text-slate-600">
                              <div>{file.displayFolder}</div>
                              <div className="text-[10px] text-slate-500">
                                eqp_solutions/{file.relPath}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{file.filename}</td>
                            <td className="py-2 px-3 text-right text-slate-600">{file.sizeBytes} B</td>
                            <td className="py-2 px-3 text-slate-600">
                              {new Date(file.updatedAt).toLocaleString()}
                            </td>
                            <td className="py-2 px-4 text-right font-sans">
                              <div className="inline-flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleOpenDiskEqpFile(
                                      file.relPath,
                                      file.displayPath,
                                      file.filename
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                  Open
                                </button>
                                <a
                                  href={`/api/eqp/download?relPath=${encodeURIComponent(file.relPath)}`}
                                  download={file.filename}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="card bg-[#eff7f6] border border-teal-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
                <div className="px-4 py-3 bg-[#d7ebe8]/85 border-b border-teal-800/50 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
                      Saved Bulletin HTML Files ({savedBulletinFiles.length})
                    </h3>
                    <p className="text-xs text-slate-600">
                      Directory hierarchy created on bulletin save under {resolvedBulletinTarget.driveRoot}\{resolvedBulletinTarget.baseSegments.join('\\')}\ (persisted on server in <code>eqp_solutions/</code>)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void refreshSavedBulletinFiles();
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-teal-800/55 bg-white text-xs font-medium text-slate-800 hover:bg-teal-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Refresh
                  </button>
                </div>

                {savedBulletinFiles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600">
                    No <code>.html</code> bulletins saved yet. Open the <strong>Bulletin</strong> tab and click <strong>Save</strong> to create the <code>Bul_YYYY\MM\DD</code> folder and write the HTML bulletin.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-teal-800/55 bg-[#cbe4e0] text-slate-800">
                          <th className="py-2 px-4 font-semibold">Folder Path</th>
                          <th className="py-2 px-3 font-semibold">Filename</th>
                          <th className="py-2 px-3 text-right font-semibold">Size</th>
                          <th className="py-2 px-3 font-semibold">Saved At</th>
                          <th className="py-2 px-4 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-teal-800/20 font-mono tabular-nums">
                        {savedBulletinFiles.map((file, idx) => (
                          <tr
                            key={file.relPath}
                            className={
                              idx % 2 === 0
                                ? 'bg-[#ffffff] hover:bg-[#dbeafe]'
                                : 'bg-[#e6f3f1] hover:bg-[#dbeafe]'
                            }
                          >
                            <td className="py-2 px-4 text-slate-600">
                              <div>{file.displayFolder}</div>
                              <div className="text-[10px] text-slate-500">
                                eqp_solutions/{file.relPath}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{file.filename}</td>
                            <td className="py-2 px-3 text-right text-slate-600">{file.sizeBytes} B</td>
                            <td className="py-2 px-3 text-slate-600">
                              {new Date(file.updatedAt).toLocaleString()}
                            </td>
                            <td className="py-2 px-4 text-right font-sans">
                              <div className="inline-flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleOpenDiskBulletinFile(
                                      file.relPath,
                                      file.displayPath,
                                      file.filename
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900"
                                >
                                  <FolderOpen className="w-3.5 h-3.5" />
                                  Open
                                </button>
                                <a
                                  href={`/api/bulletin/download?relPath=${encodeURIComponent(file.relPath)}`}
                                  download={file.filename}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Download
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 9: RESEARCH TAB */}
          {activeSection === 'research' && eqpTab === 'research' && (
            <div className="min-h-full flex flex-col transition-colors bg-[#dde4ee]">
              <div className="bg-[#dce3ed] border-b border-[#5b7da4] px-3.5 pt-2 flex flex-wrap items-end justify-start text-[11px] shrink-0" role="tablist" aria-label="Research Modules">
                <button
                  type="button"
                  role="tab"
                  aria-selected={researchSubTab === 'focal-mechanism'}
                  onClick={() => setResearchSubTab('focal-mechanism')}
                  className={`eqp-tab-ext ${researchSubTab === 'focal-mechanism' ? 'eqp-tab-ext-active' : ''}`}
                >
                  <Radar className="w-[18px] h-[18px] shrink-0 text-blue-700" />
                  <span className="font-bold tracking-tight">Focal Mechanism</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={researchSubTab === 'historical-seismicity'}
                  onClick={() => setResearchSubTab('historical-seismicity')}
                  className={`eqp-tab-ext ${researchSubTab === 'historical-seismicity' ? 'eqp-tab-ext-active' : ''}`}
                >
                  <Globe className="w-[18px] h-[18px] shrink-0 text-blue-700" />
                  <span className="font-bold tracking-tight">Historical Seismicity</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={researchSubTab === 'regional-stress'}
                  onClick={() => setResearchSubTab('regional-stress')}
                  className={`eqp-tab-ext ${researchSubTab === 'regional-stress' ? 'eqp-tab-ext-active' : ''}`}
                >
                  <Compass className="w-[18px] h-[18px] shrink-0 text-blue-700" />
                  <span className="font-bold tracking-tight">Regional Stress Analysis</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={researchSubTab === 'strain-analysis'}
                  onClick={() => setResearchSubTab('strain-analysis')}
                  className={`eqp-tab-ext ${researchSubTab === 'strain-analysis' ? 'eqp-tab-ext-active' : ''}`}
                >
                  <Activity className="w-[18px] h-[18px] shrink-0 text-blue-700" />
                  <span className="font-bold tracking-tight">Strain Analysis</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={researchSubTab === 'coulomb-stress'}
                  onClick={() => setResearchSubTab('coulomb-stress')}
                  className={`eqp-tab-ext ${researchSubTab === 'coulomb-stress' ? 'eqp-tab-ext-active' : ''}`}
                >
                  <Layers className="w-[18px] h-[18px] shrink-0 text-blue-700" />
                  <span className="font-bold tracking-tight">Coulomb Stress Analysis</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={researchSubTab === 'earthquake-sequence'}
                  onClick={() => setResearchSubTab('earthquake-sequence')}
                  className={`eqp-tab-ext ${researchSubTab === 'earthquake-sequence' ? 'eqp-tab-ext-active' : ''}`}
                >
                  <Waves className="w-[18px] h-[18px] shrink-0 text-blue-700" />
                  <span className="font-bold tracking-tight">Earthquake Sequence Analysis</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={researchSubTab === 'phase-residuals'}
                  onClick={() => setResearchSubTab('phase-residuals')}
                  className={`eqp-tab-ext ${researchSubTab === 'phase-residuals' ? 'eqp-tab-ext-active' : ''}`}
                >
                  <BarChart3 className="w-[18px] h-[18px] shrink-0 text-blue-700" />
                  <span className="font-bold tracking-tight">Phase Residuals</span>
                </button>
              </div>

              <div className="p-3 sm:p-4 max-w-[1440px] w-full flex-1">
                {researchSubTab === 'focal-mechanism' && (
                  <FocalMechanismResearchPanel
                    event={activeEvent}
                    selectedStation={selectedStation}
                    onSelectStation={setSelectedStation}
                    onNotice={showNotice}
                  />
                )}

                {researchSubTab === 'historical-seismicity' && (
                  <HistoricalSeismicityPanel
                    event={activeEvent}
                    onNotice={showNotice}
                  />
                )}

                {researchSubTab === 'regional-stress' && (
                  <RegionalStressPanel
                    event={activeEvent}
                    onNotice={showNotice}
                    onOpenHistoricalSeismicity={() => setResearchSubTab('historical-seismicity')}
                  />
                )}

                {researchSubTab === 'strain-analysis' && (
                  <StrainAnalysisPanel
                    event={activeEvent}
                    onNotice={showNotice}
                  />
                )}

                {researchSubTab === 'coulomb-stress' && (
                  <CoulombStressPanel
                    event={activeEvent}
                    onNotice={showNotice}
                  />
                )}

                {researchSubTab === 'earthquake-sequence' && (
                  <EarthquakeSequencePanel
                    event={activeEvent}
                    onNotice={showNotice}
                    onOpenHistoricalSeismicity={() => setResearchSubTab('historical-seismicity')}
                    onOpenFocalMechanism={() => setResearchSubTab('focal-mechanism')}
                    onOpenRegionalStress={() => setResearchSubTab('regional-stress')}
                  />
                )}

                {researchSubTab === 'phase-residuals' && (
                  <PhaseResidualsPanel
                    event={activeEvent}
                    selectedStation={selectedStation}
                    onSelectStation={setSelectedStation}
                    onNotice={showNotice}
                  />
                )}
              </div>
            </div>
          )}
          </main>
        </div>
      </div>

      {/* Bottom Green Nearest Places Strip (Matching EQP 11.20a Layout) */}
      <footer className="bg-[#008a00] text-slate-950 border-t border-[#005500] px-2.5 py-1.5 text-[11px] font-medium shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold leading-tight">Nearest Places :</div>
          {!isUnlocated && (
            <button
              type="button"
              onClick={handleOpenNearestPlacesPopup}
              className="px-2 py-0.5 bg-white/90 hover:bg-white border border-[#004400] rounded-xs text-[10px] font-semibold text-slate-900 cursor-pointer transition-colors"
              title="Choose nearest city (CITY.csv), nearest town (Population_Centers_2007), and nearest fault generator (GENTR.txt)"
            >
              Select Places...
            </button>
          )}
        </div>
        <div className="leading-snug font-mono tabular-nums">
          {activeEvent.centralOfficeBearing || 'Pending hypocenter location — enter phase picks and run Locate'}
        </div>
        <div className="flex flex-col leading-snug font-mono tabular-nums">
          <label className="inline-flex items-center gap-1.5 cursor-pointer w-fit">
            <input
              type="radio"
              name="footerHeadlinePlace"
              checked={activeEvent.primaryHeadline === 'city'}
              onChange={() =>
                updateActiveEvent((ev) => ({ ...ev, primaryHeadline: 'city' }))
              }
              className="accent-slate-900"
            />
            <span>{selectedCity?.label ?? (isUnlocated ? 'Pending location' : 'None selected')}</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer w-fit">
            <input
              type="radio"
              name="footerHeadlinePlace"
              checked={activeEvent.primaryHeadline === 'town'}
              onChange={() =>
                updateActiveEvent((ev) => ({ ...ev, primaryHeadline: 'town' }))
              }
              className="accent-slate-900"
            />
            <span>{selectedTown?.label ?? (isUnlocated ? 'Pending location' : 'None selected')}</span>
          </label>
        </div>
        <div className="leading-snug font-mono tabular-nums">
          {selectedGenerator?.label ?? (isUnlocated ? 'Fault generator pending' : 'None selected')}
        </div>
      </footer>

      {/* Unsaved Changes Guard Modal (Fixes DEF-FILE-02, Bulletin & Primer edits) */}
      {confirmUnsavedAction && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-unsaved-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Compass className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h2 id="confirm-unsaved-title" className="text-sm font-semibold text-slate-900">
                  {confirmUnsavedScope === 'bulletin'
                    ? `Unsaved edits in bulletin ${displayedBulletinFilename}`
                    : confirmUnsavedScope === 'primer'
                      ? `Primer ${primerPanelStatus.primerTitle || displayedPrimerFilename}`
                      : `Unsaved changes in ${activeEvent.filename || activeEvent.id}`}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  {confirmUnsavedScope === 'bulletin'
                    ? confirmUnsavedAction === 'new'
                      ? 'Bulletin parameters have been edited. Save or discard your changes before creating a new bulletin?'
                      : 'Bulletin parameters have been edited. Save or discard your changes before opening another bulletin?'
                    : confirmUnsavedScope === 'primer'
                      ? confirmUnsavedAction === 'new'
                        ? 'A primer is currently created. Save or discard the created primer before creating a new one?'
                        : 'The current primer has unsaved edits. Save or discard your changes before opening another saved primer?'
                      : confirmUnsavedAction === 'new'
                        ? 'Creating a new event without saving will leave your recent edits unpersisted. Save or discard before starting a new event?'
                        : confirmUnsavedAction === 'open'
                          ? 'Opening another .EQP file without saving will discard your recent edits. Save or discard before opening?'
                          : 'The current earthquake event has unsaved edits. Save or discard your edits before printing EQ Data?'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmUnsavedAction(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirmUnsavedAction;
                  const scope = confirmUnsavedScope;
                  setConfirmUnsavedAction(null);
                  if (scope === 'bulletin') {
                    if (action === 'new') {
                      discardBulletinEdits();
                      createNewBulletinDraft();
                    } else if (action === 'open') {
                      discardBulletinEdits();
                      setOpenExplorerMode('bulletin');
                      void refreshSavedBulletinFiles();
                      setOpenExplorerOpen(true);
                    }
                    return;
                  }
                  if (scope === 'primer') {
                    if (action === 'new') {
                      const isSavedOnDisk = Boolean(
                        primerPanelStatus.primerId &&
                          savedPrimerTargetsById[primerPanelStatus.primerId]
                      );
                      primerControllerRef.current?.discardAndCreateNewPrimer({
                        removeUnpublishedAutoDraft: !isSavedOnDisk,
                      });
                    } else if (action === 'open') {
                      primerControllerRef.current?.discardEdits();
                      setOpenExplorerMode('primer');
                      void refreshSavedPrimerFiles();
                      setOpenExplorerOpen(true);
                    }
                    return;
                  }
                  if (action === 'new') {
                    discardCurrentEventAndCreateNew();
                  } else if (action === 'open') {
                    discardCurrentEventEdits();
                    setOpenExplorerMode('eqp');
                    setOpenExplorerOpen(true);
                  } else if (action === 'print') {
                    const reverted = discardCurrentEventEdits();
                    void handleDataPrint(reverted);
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                {confirmUnsavedAction === 'new'
                  ? 'Discard & New'
                  : confirmUnsavedAction === 'open'
                    ? 'Discard & Open'
                    : 'Discard & Print'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirmUnsavedAction;
                  const scope = confirmUnsavedScope;
                  setConfirmUnsavedAction(null);
                  if (scope === 'bulletin') {
                    handleSaveBulletin({ nextAction: action });
                  } else if (scope === 'primer') {
                    handleSavePrimer({ nextAction: action });
                  } else {
                    handleSaveEvent({ nextAction: action });
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                {confirmUnsavedAction === 'new'
                  ? 'Save & New'
                  : confirmUnsavedAction === 'open'
                    ? 'Save & Open'
                    : 'Save & Print'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EQP Save As File Explorer Modal (supports .eqp solutions, .html bulletins, & .primer.json primers) */}
      <SaveSolutionExplorerModal
        open={saveExplorerOpen}
        isSaving={
          saveExplorerMode === 'bulletin'
            ? isSavingBulletin
            : saveExplorerMode === 'primer'
              ? isSavingPrimer
              : isSavingEqp
        }
        mode={saveExplorerMode}
        defaultTarget={
          saveExplorerMode === 'bulletin'
            ? resolvedBulletinTarget
            : saveExplorerMode === 'primer'
              ? resolvedPrimerTarget
              : resolvedSaveTarget
        }
        initialFilename={
          saveExplorerMode === 'bulletin'
            ? resolvedBulletinTarget.filename
            : saveExplorerMode === 'primer'
              ? displayedPrimerFilename
              : !isDirty && activeEvent.filename
                ? activeEvent.filename
                : resolvedSaveTarget.filename
        }
        solutionDrive={solutionDrive}
        savedFiles={
          saveExplorerMode === 'bulletin'
            ? savedBulletinFiles
            : saveExplorerMode === 'primer'
              ? savedPrimerFiles
              : savedEqpFiles
        }
        savedFolders={
          saveExplorerMode === 'bulletin'
            ? savedBulletinFolders
            : saveExplorerMode === 'primer'
              ? savedPrimerFolders
              : savedEqpFolders
        }
        pendingActionAfterSave={pendingActionAfterSave}
        onRefreshListing={
          saveExplorerMode === 'bulletin'
            ? refreshSavedBulletinFiles
            : saveExplorerMode === 'primer'
              ? refreshSavedPrimerFiles
              : refreshSavedEqpFiles
        }
        onConfirmSave={(params) => {
          void handleConfirmExplorerSave(params);
        }}
        onCancel={handleCancelExplorerSave}
      />

      {/* EQP Open File Explorer Modal (starts at SOLUTION_EQ, BULLETIN_EQ, or PRIMER_EQ) */}
      <OpenSolutionExplorerModal
        open={openExplorerOpen}
        isOpening={
          openExplorerMode === 'bulletin'
            ? isOpeningBulletin
            : openExplorerMode === 'primer'
              ? isOpeningPrimer
              : isOpeningEqp
        }
        mode={openExplorerMode}
        solutionDrive={solutionDrive}
        savedFiles={
          openExplorerMode === 'bulletin'
            ? savedBulletinFiles
            : openExplorerMode === 'primer'
              ? savedPrimerFiles
              : savedEqpFiles
        }
        savedFolders={
          openExplorerMode === 'bulletin'
            ? savedBulletinFolders
            : openExplorerMode === 'primer'
              ? savedPrimerFolders
              : savedEqpFolders
        }
        catalogEvents={events}
        savedPrimerDrafts={openExplorerMode === 'primer' ? loadSavedPrimerDrafts() : []}
        onRefreshListing={
          openExplorerMode === 'bulletin'
            ? refreshSavedBulletinFiles
            : openExplorerMode === 'primer'
              ? refreshSavedPrimerFiles
              : refreshSavedEqpFiles
        }
        onOpenDiskFile={(relPath, displayPath, filename) => {
          if (openExplorerMode === 'bulletin') {
            void handleOpenDiskBulletinFile(relPath, displayPath, filename);
          } else if (openExplorerMode === 'primer') {
            void handleOpenDiskPrimerFile(relPath, displayPath, filename);
          } else {
            void handleOpenDiskEqpFile(relPath, displayPath, filename);
          }
        }}
        onOpenCatalogEvent={handleOpenCatalogEvent}
        onOpenPrimerDraft={handleOpenPrimerDraft}
        onOpenLocalFile={(file) => {
          if (openExplorerMode === 'bulletin') {
            void handleOpenLocalBulletinFile(file);
          } else if (openExplorerMode === 'primer') {
            void handleOpenLocalPrimerFile(file);
          } else {
            void handleOpenLocalEqpFile(file);
          }
        }}
        onCancel={handleCancelExplorerOpen}
      />
      {/* Data Print Options Modal (displayed when no connected default printer is found) */}
      <DataPrintOptionsModal
        open={dataPrintOptionsOpen}
        isCheckingPrinter={isCheckingPrinter}
        isPrintingDirect={isPrintingDirect}
        printerStatus={hostPrinterStatus}
        printPreviewActive={dataPrintPreviewActive}
        printableSheetUrl={printableSheetUrl}
        printPreviewPdfUrl={dataPrintPreviewUrl}
        printPreviewNotice={dataPrintPreviewNotice}
        printError={dataPrintError}
        networkPrinterAddress={networkPrinterAddress}
        onChangeNetworkPrinterAddress={setNetworkPrinterAddress}
        event={activeEvent}
        freshness={activeMagnitudeFreshness}
        primaryLocationLabel={primaryLocationLabel}
        faultGeneratorLabel={selectedGenerator?.label ?? null}
        config={dataPrintConfig}
        onChangeConfig={setDataPrintConfig}
        onRecheckAndPrintDefault={() => {
          void handleDataPrint();
        }}
        onPrintToSpecificPrinter={(printerName) => {
          void submitDirectPrintJob({ printerName });
        }}
        onPrintToNetworkPrinter={(addr) => {
          void submitDirectPrintJob({ networkAddress: addr });
        }}
        onBrowserPrintData={() => {
          void handleBrowserPrintData();
        }}
        onClearPrintPreview={clearDataPrintPreview}
        onDownloadDataPdf={handleDownloadDataPdf}
        onDownloadDataText={handleDownloadDataText}
        onPrintBulletinInstead={() => {
          clearDataPrintPreview();
          setDataPrintOptionsOpen(false);
          handleTriggerPrintBulletin();
        }}
        onCancel={() => {
          clearDataPrintPreview();
          setDataPrintOptionsOpen(false);
        }}
      />

      {/* Computed Magnitude Using Time Duration Popup */}
      <MagnitudeDurationPopup
        open={magnitudePopupOpen}
        event={activeEvent}
        varianceK={varianceK}
        onChangeVarianceK={setVarianceK}
        onApply={({ preferredScale, ms, mb, md, updatedPicks }) => {
          const updatedBase: EQPEvent = {
            ...activeEvent,
            preferredScale,
            ms,
            mb,
            md,
            picks: updatedPicks,
            historicalMagnitudeBaseline: undefined,
          };
          const refreshedMeta = evaluateEventMagnitudes({
            event: updatedBase,
            settings: magnitudeSettings,
            stations,
            preferredMethodOverride: activeEvent.magnitudeMetadata?.isPerEventOverride
              ? activeEvent.magnitudeMetadata.preferredMethodId
              : undefined,
          });
          const nextEvent: EQPEvent = {
            ...updatedBase,
            magnitudeMetadata: refreshedMeta,
          };
          const targetId = activeEvent.id;
          const displayScale = formatLegacyScaleShort(preferredScale);
          const displayVal =
            preferredScale === 'Ms' ? ms : preferredScale === 'Mb' ? mb : md;
          applyTargetEventUpdate(targetId, () => nextEvent, {
            undo: {
              label: `Apply duration magnitude (${displayScale} ${displayVal.toFixed(1)})`,
            },
          });
          setMagnitudePopupOpen(false);
          void postEqpHistoryCheckpoint(
            nextEvent,
            'magnitude',
            'Mag Dur',
            `${displayScale} ${displayVal.toFixed(1)}`
          );
          showNotice(
            `Applied Duration Magnitude: ${displayScale} ${displayVal.toFixed(1)} (Ms ${ms.toFixed(1)} / Mb ${mb.toFixed(1)} / ML ${md.toFixed(1)})`
          );
        }}
        onCancel={() => setMagnitudePopupOpen(false)}
      />

      {/* Nearest Places Attribution Popup (triggered after Locate converges) */}
      <NearestPlacesPopup
        isOpen={nearestPlacesPopupOpen}
        mainOffice={mainOffice}
        centralOfficeBearing={activeEvent.centralOfficeBearing}
        cities={activeEvent.cities}
        selectedCityId={activeEvent.selectedCityId}
        towns={activeEvent.towns}
        selectedTownId={activeEvent.selectedTownId}
        generators={activeEvent.generators}
        selectedGeneratorId={activeEvent.selectedGeneratorId}
        onSelectCity={(id) =>
          updateActiveEvent((ev) => ({
            ...ev,
            selectedCityId: id,
            primaryHeadline: 'city',
          }))
        }
        onClearCity={() =>
          updateActiveEvent((ev) => ({
            ...ev,
            selectedCityId: '',
          }))
        }
        onSelectTown={(id) =>
          updateActiveEvent((ev) => ({
            ...ev,
            selectedTownId: id,
            primaryHeadline: ev.selectedCityId ? ev.primaryHeadline : 'town',
          }))
        }
        onClearTown={() =>
          updateActiveEvent((ev) => ({
            ...ev,
            selectedTownId: '',
          }))
        }
        onSelectGenerator={(id) =>
          updateActiveEvent((ev) => ({
            ...ev,
            selectedGeneratorId: id,
          }))
        }
        onConfigureMainOffice={() => {
          setSettingsSubTab('office');
          navigateEqpModule('settings', 'settings');
        }}
        onEditDatabases={() => navigateEqpModule('database', 'database')}
        onClose={() => setNearestPlacesPopupOpen(false)}
      />

      <ModelSettingsModal
        open={modelSettingsOpen}
        onClose={() => setModelSettingsOpen(false)}
        selectedModelId={travelTimeModelId}
        onSelectModelId={setTravelTimeModelId}
        correctionProfile={correctionProfile}
        onChangeCorrectionProfile={setCorrectionProfile}
      />

      <ModelComparisonModal
        open={modelComparisonOpen}
        onClose={() => setModelComparisonOpen(false)}
        event={activeEvent}
        stations={stations}
        solverEngine={solverEngine}
        correctionProfile={correctionProfile}
        activeModelId={travelTimeModelId}
        onAdoptCandidate={(cand) => void handleAdoptCandidateSolution(cand)}
        onPublishMapMarkers={(markers) => {
          setMapComparisonMarkers(markers);
          navigateEqpModule('map', 'map');
          showNotice(`Plotted ${markers.length} model comparison marker(s) on Map.`);
        }}
      />

      <AmplitudeMeasurementModal
        open={Boolean(amplitudeModalPick)}
        event={activeEvent}
        pick={amplitudeModalPick}
        onSave={handleSaveStationAmplitudeMeasurements}
        onCancel={() => setAmplitudeModalPickId(null)}
      />
    </div>
    {isBrowserPrintingData && (
      <DataPrintSheet
        event={activeEvent}
        freshness={activeMagnitudeFreshness}
        primaryLocationLabel={primaryLocationLabel}
        faultGeneratorLabel={selectedGenerator?.label ?? null}
        config={dataPrintConfig}
      />
    )}
    </>
  );
}
