import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { EQPEvent } from '../data/eqpData';
import type { PrimerDocument } from '../utils/earthquakePrimer';
import {
  buildBaseBulletinSegments,
  buildBasePrimerSegments,
  buildBaseSolutionSegments,
  parseSolutionDrivePath,
} from '../utils/eqpStorage';
import { SavedEqpFileItem, SavedEqpFolderItem } from './SaveSolutionExplorerModal';

interface ExplorerFileCandidate {
  filename: string;
  relFolder: string;
  displayFolder: string;
  displayPath: string;
  sizeBytes: number | null;
  updatedAt: string | null;
  source: 'disk' | 'catalog' | 'primer-draft';
  relPath?: string;
  catalogEventId?: string;
  primerDraftId?: string;
}

interface OpenSolutionExplorerModalProps {
  open: boolean;
  isOpening: boolean;
  mode?: 'eqp' | 'bulletin' | 'primer';
  solutionDrive: string;
  savedFiles: SavedEqpFileItem[];
  savedFolders: SavedEqpFolderItem[];
  catalogEvents: EQPEvent[];
  savedPrimerDrafts?: PrimerDocument[];
  onRefreshListing: () => void;
  onOpenDiskFile: (relPath: string, displayPath: string, filename: string) => void;
  onOpenCatalogEvent: (eventId: string) => void;
  onOpenPrimerDraft?: (primerId: string) => void;
  onOpenLocalFile: (file: File) => void;
  onCancel: () => void;
}

function buildBaseFolderSegmentsFromDrive(
  driveSetting: string,
  mode: 'eqp' | 'bulletin' | 'primer'
): {
  driveRoot: string;
  baseSegments: string[];
} {
  const parsed = parseSolutionDrivePath(driveSetting);
  return {
    driveRoot: parsed.driveRoot,
    baseSegments:
      mode === 'primer'
        ? buildBasePrimerSegments(parsed.prefixSegments)
        : mode === 'bulletin'
          ? buildBaseBulletinSegments(parsed.prefixSegments)
          : buildBaseSolutionSegments(parsed.prefixSegments),
  };
}

function extractSegmentsForDrive(filePath: string, targetDriveKey: string): string[] | null {
  const normalized = filePath.replace(/\//g, '\\').trim();
  const match = normalized.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) return null;
  const fileDriveKey = match[1].toUpperCase();
  if (fileDriveKey !== targetDriveKey.toUpperCase()) return null;
  return match[2].split('\\').filter(Boolean);
}

export const OpenSolutionExplorerModal: React.FC<OpenSolutionExplorerModalProps> = ({
  open,
  isOpening,
  mode = 'eqp',
  solutionDrive,
  savedFiles,
  savedFolders,
  catalogEvents,
  savedPrimerDrafts = [],
  onRefreshListing,
  onOpenDiskFile,
  onOpenCatalogEvent,
  onOpenPrimerDraft,
  onOpenLocalFile,
  onCancel,
}) => {
  const isBulletinMode = mode === 'bulletin';
  const isPrimerMode = mode === 'primer';
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const initialConfig = useMemo(
    () => buildBaseFolderSegmentsFromDrive(solutionDrive, mode),
    [solutionDrive, mode]
  );

  const [activeDrive, setActiveDrive] = useState<string>(() => initialConfig.driveRoot);
  const [currentSegments, setCurrentSegments] = useState<string[]>(
    () => initialConfig.baseSegments
  );
  const [selectedFile, setSelectedFile] = useState<ExplorerFileCandidate | null>(null);
  const [viewMode, setViewMode] = useState<'folders' | 'saved'>('folders');
  const [searchQuery, setSearchQuery] = useState('');

  const wasOpenRef = useRef(false);
  const onRefreshListingRef = useRef(onRefreshListing);
  onRefreshListingRef.current = onRefreshListing;

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    const cfg = buildBaseFolderSegmentsFromDrive(solutionDrive, mode);
    setActiveDrive(cfg.driveRoot);
    setCurrentSegments(cfg.baseSegments);
    setSelectedFile(null);
    setSearchQuery('');
    setViewMode('folders');
    onRefreshListingRef.current();
  }, [open, solutionDrive, mode]);

  const driveKey = useMemo(
    () => parseSolutionDrivePath(activeDrive).driveKey,
    [activeDrive]
  );

  // Merge saved disk files and in-memory catalog events into a unified browsable folder/file view
  const { allCandidates, allFolderPaths, diskFileCountByFolder } = useMemo(() => {
    const fileMap = new Map<string, ExplorerFileCandidate>();
    const folderSet = new Set<string>();
    const diskCounts = new Map<string, number>();

    const addFolderChain = (dKey: string, segs: string[]) => {
      for (let i = 1; i <= segs.length; i++) {
        folderSet.add(`${dKey}/${segs.slice(0, i).join('/')}`);
      }
    };

    addFolderChain(driveKey, initialConfig.baseSegments);

    for (const folder of savedFolders) {
      if (folder.relFolder.startsWith(`${driveKey}/`)) {
        folderSet.add(folder.relFolder);
      }
    }

    for (const file of savedFiles) {
      const parts = file.relPath.split('/');
      const fileDriveKey = parts[0] || 'Y';
      const folderSegs = parts.slice(1, -1);

      // Count disk files per folder hierarchy for badge indicators
      for (let i = 1; i <= folderSegs.length; i++) {
        const fKey = `${fileDriveKey}/${folderSegs.slice(0, i).join('/')}`;
        diskCounts.set(fKey, (diskCounts.get(fKey) ?? 0) + 1);
      }

      if (fileDriveKey !== driveKey) continue;
      addFolderChain(driveKey, folderSegs);
      const relFolder =
        folderSegs.length > 0 ? `${driveKey}/${folderSegs.join('/')}` : driveKey;
      const key = `${relFolder}/${file.filename}`.toLowerCase();
      fileMap.set(key, {
        filename: file.filename,
        relFolder,
        displayFolder: file.displayFolder,
        displayPath: file.displayPath,
        sizeBytes: file.sizeBytes,
        updatedAt: file.updatedAt,
        source: 'disk',
        relPath: file.relPath,
      });
    }

    if (isPrimerMode) {
      for (const draft of savedPrimerDrafts) {
        const dateParts = (draft.extracted?.originDateUtc || '').split('-');
        const year = (dateParts[0] || '2026').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
        const month = (dateParts[1] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
        const day = (dateParts[2] || '01').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
        const timeParts = (draft.extracted?.originTimeUtc || '').split(':');
        const hh = (timeParts[0] || '00').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
        const min = (timeParts[1] || '00').replace(/\D/g, '').padStart(2, '0').slice(0, 2);
        const magVal =
          typeof draft.extracted?.magnitudeValue === 'number' &&
          Number.isFinite(draft.extracted.magnitudeValue)
            ? Math.max(0, Math.min(9.9, draft.extracted.magnitudeValue))
            : 0;
        const magCode = String(Math.round(magVal * 10)).padStart(2, '0');
        const depthVal =
          typeof draft.extracted?.depthKm === 'number' &&
          Number.isFinite(draft.extracted.depthKm)
            ? Math.max(0, Math.min(999, Math.floor(draft.extracted.depthKm)))
            : 0;
        const depthCode = String(depthVal).padStart(3, '0');
        const bulletinNo = Math.max(1, Math.trunc(draft.bulletinNo || 1));
        const feltSuffix = (draft.extracted?.verifiedFeltCount ?? 0) > 0 ? 'F' : '';

        const folderSegs =
          dateParts.length === 3 && /^\d{4}$/.test(year)
            ? [...initialConfig.baseSegments, `Pri_${year}`, month, day]
            : [...initialConfig.baseSegments];
        const fileName = `${year}_${month}${day}_${hh}${min}_M${magCode}D${depthCode}_B${bulletinNo}${feltSuffix}.primer.json`;
        addFolderChain(driveKey, folderSegs);
        const relFolder =
          folderSegs.length > 0 ? `${driveKey}/${folderSegs.join('/')}` : driveKey;
        const key = `${relFolder}/${fileName}`.toLowerCase();
        if (!fileMap.has(key)) {
          fileMap.set(key, {
            filename: fileName,
            relFolder,
            displayFolder: `${activeDrive}\\${folderSegs.join('\\')}`,
            displayPath: `${activeDrive}\\${folderSegs.join('\\')}\\${fileName}`,
            sizeBytes: null,
            updatedAt: draft.savedAt || draft.updatedAt,
            source: 'primer-draft',
            primerDraftId: draft.id,
          });
        }
      }
    } else if (!isBulletinMode) {
      for (const ev of catalogEvents) {
        const rawSegs = extractSegmentsForDrive(ev.filePath, driveKey);
        const dateParts = ev.originDateGmt.split('-');
        const fallbackSegs =
          dateParts.length === 3
            ? [
                ...initialConfig.baseSegments,
                `Sol_${dateParts[0]}`,
                dateParts[1],
                dateParts[2],
                ev.filename,
              ]
            : [...initialConfig.baseSegments, ev.filename];
        const segs = rawSegs && rawSegs.length >= 2 ? rawSegs : fallbackSegs;
        const folderSegs = segs.slice(0, -1);
        const fileName = segs[segs.length - 1] || ev.filename;
        if (!fileName) continue;
        addFolderChain(driveKey, folderSegs);
        const relFolder =
          folderSegs.length > 0 ? `${driveKey}/${folderSegs.join('/')}` : driveKey;
        const key = `${relFolder}/${fileName}`.toLowerCase();
        if (!fileMap.has(key)) {
          fileMap.set(key, {
            filename: fileName,
            relFolder,
            displayFolder: `${activeDrive}\\${folderSegs.join('\\')}`,
            displayPath: `${activeDrive}\\${folderSegs.join('\\')}\\${fileName}`,
            sizeBytes: null,
            updatedAt: null,
            source: 'catalog',
            catalogEventId: ev.id,
          });
        }
      }
    }

    return {
      allCandidates: Array.from(fileMap.values()),
      allFolderPaths: Array.from(folderSet).sort(),
      diskFileCountByFolder: diskCounts,
    };
  }, [
    driveKey,
    activeDrive,
    initialConfig.baseSegments,
    savedFolders,
    savedFiles,
    catalogEvents,
    savedPrimerDrafts,
    isBulletinMode,
    isPrimerMode,
  ]);

  const currentRelPrefix = useMemo(
    () => (currentSegments.length > 0 ? `${driveKey}/${currentSegments.join('/')}` : driveKey),
    [driveKey, currentSegments]
  );

  const currentFolderDisplay = useMemo(
    () =>
      currentSegments.length > 0
        ? `${activeDrive}\\${currentSegments.join('\\')}`
        : `${activeDrive}\\`,
    [activeDrive, currentSegments]
  );

  const childFolders = useMemo(() => {
    const prefix = `${currentRelPrefix}/`;
    const names = new Set<string>();
    for (const rel of allFolderPaths) {
      if (!rel.startsWith(prefix)) continue;
      const rest = rel.slice(prefix.length);
      if (!rest || rest.includes('/')) continue;
      names.add(rest);
    }
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const rel = `${currentRelPrefix}/${name}`;
        return {
          name,
          relFolder: rel,
          diskCount: diskFileCountByFolder.get(rel) ?? 0,
        };
      });
  }, [currentRelPrefix, allFolderPaths, diskFileCountByFolder]);

  const filesInCurrentFolder = useMemo(
    () =>
      allCandidates
        .filter((item) => item.relFolder === currentRelPrefix)
        .sort((a, b) => a.filename.localeCompare(b.filename)),
    [allCandidates, currentRelPrefix]
  );

  // Filtered disk-saved files across all drives/date folders for "Saved on Disk" view or search
  const filteredSavedDiskFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return savedFiles.filter(
      (f) =>
        !q ||
        f.filename.toLowerCase().includes(q) ||
        f.displayPath.toLowerCase().includes(q) ||
        f.displayFolder.toLowerCase().includes(q)
    );
  }, [savedFiles, searchQuery]);

  // Leaf folders containing saved files on disk (for 1-click navigation in sidebar)
  const savedLeafFolders = useMemo(() => {
    const map = new Map<
      string,
      { relFolder: string; driveRoot: string; segments: string[]; displayFolder: string; count: number }
    >();
    for (const file of savedFiles) {
      const parts = file.relPath.split('/');
      const fDriveKey = parts[0] || 'Y';
      const driveRoot = /^[A-Za-z]$/.test(fDriveKey) ? `${fDriveKey.toUpperCase()}:` : fDriveKey;
      const segs = parts.slice(1, -1);
      const relFolder = `${fDriveKey}/${segs.join('/')}`;
      const existing = map.get(relFolder);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(relFolder, {
          relFolder,
          driveRoot,
          segments: segs,
          displayFolder: file.displayFolder,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      b.displayFolder.localeCompare(a.displayFolder)
    );
  }, [savedFiles]);

  // Left sidebar quick folders under active base path (Sol_YYYY subfolders)
  const solutionEqYearFolders = useMemo(() => {
    const prefix = `${driveKey}/${initialConfig.baseSegments.join('/')}/`;
    const years = new Set<string>();
    for (const rel of allFolderPaths) {
      if (!rel.startsWith(prefix)) continue;
      const rest = rel.slice(prefix.length);
      const first = rest.split('/')[0];
      if (first) years.add(first);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [driveKey, initialConfig.baseSegments, allFolderPaths]);

  if (!open) return null;

  const triggerOpenSelected = (item: ExplorerFileCandidate | null) => {
    if (!item) return;
    if (item.source === 'disk' && item.relPath) {
      onOpenDiskFile(item.relPath, item.displayPath, item.filename);
    } else if (item.source === 'primer-draft' && item.primerDraftId) {
      onOpenPrimerDraft?.(item.primerDraftId);
    } else if (item.catalogEventId) {
      onOpenCatalogEvent(item.catalogEventId);
    }
  };

  const jumpToFolder = (driveRoot: string, segs: string[]) => {
    setActiveDrive(driveRoot);
    setCurrentSegments(segs);
    setSelectedFile(null);
    setViewMode('folders');
  };

  const showSavedList = viewMode === 'saved' || searchQuery.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-explorer-title"
      onClick={onCancel}
    >
      <div
        className="bg-[#f0f2f5] border border-slate-500 rounded-md shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Classic Title Bar */}
        <div className="bg-gradient-to-r from-[#0b4a8f] to-[#1d6bc2] text-white px-3.5 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-amber-300 shrink-0" />
            <h2 id="open-explorer-title" className="text-xs font-semibold truncate">
              {isPrimerMode
                ? 'Open Earthquake Primer (.primer.json) — File Explorer'
                : isBulletinMode
                  ? 'Open Earthquake Bulletin (.html) — File Explorer'
                  : 'Open Earthquake Solution (.eqp) — File Explorer'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close Open Explorer"
            className="p-1 rounded hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation & Address Bar */}
        <div className="bg-white border-b border-slate-300 px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (currentSegments.length > 0) {
                  setCurrentSegments((prev) => prev.slice(0, -1));
                  setSelectedFile(null);
                  setViewMode('folders');
                }
              }}
              disabled={currentSegments.length === 0 || showSavedList}
              title="Up one folder"
              className="p-1.5 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const cfg = buildBaseFolderSegmentsFromDrive(solutionDrive, mode);
                setActiveDrive(cfg.driveRoot);
                setCurrentSegments(cfg.baseSegments);
                setSelectedFile(null);
                setSearchQuery('');
                setViewMode('folders');
              }}
              title={
                isPrimerMode
                  ? 'Jump to PRIMER_EQ root folder'
                  : isBulletinMode
                    ? 'Jump to BULLETIN_EQ root folder'
                    : 'Jump to SOLUTION_EQ root folder'
              }
              className="px-2 py-1 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-[11px] font-medium inline-flex items-center gap-1"
            >
              <Folder className="w-3 h-3 text-amber-600" />
              {isPrimerMode ? 'PRIMER_EQ' : isBulletinMode ? 'BULLETIN_EQ' : 'SOLUTION_EQ'}
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode((prev) => (prev === 'saved' ? 'folders' : 'saved'));
                setSelectedFile(null);
              }}
              className={`px-2 py-1 rounded border text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                viewMode === 'saved'
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-3 h-3" />
              Saved on Disk ({savedFiles.length})
            </button>
          </div>

          <div className="flex-1 min-w-[180px] flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded font-mono text-[11px] text-slate-800 overflow-x-auto">
            <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <button
              type="button"
              onClick={() => {
                setCurrentSegments([]);
                setSelectedFile(null);
                setViewMode('folders');
              }}
              className="hover:underline font-semibold text-blue-800 shrink-0"
            >
              {activeDrive}
            </button>
            {currentSegments.map((seg, idx) => (
              <React.Fragment key={`${seg}-${idx}`}>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => {
                    setCurrentSegments(currentSegments.slice(0, idx + 1));
                    setSelectedFile(null);
                    setViewMode('folders');
                  }}
                  className={`hover:underline shrink-0 ${
                    idx === currentSegments.length - 1
                      ? 'font-semibold text-slate-950'
                      : 'text-slate-700'
                  }`}
                >
                  {seg}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isPrimerMode
                  ? 'Search saved primers'
                  : isBulletinMode
                    ? 'Search saved .html'
                    : 'Search saved .eqp'
              }
              aria-label={
                isPrimerMode
                  ? 'Search saved .primer.json primers'
                  : isBulletinMode
                    ? 'Search saved .html bulletins'
                    : 'Search saved .eqp files'
              }
              className="w-36 pl-7 pr-2 py-1 rounded border border-slate-300 bg-white text-[11px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <select
            aria-label="Select drive"
            value={activeDrive}
            onChange={(e) => {
              setActiveDrive(e.target.value);
              setCurrentSegments(initialConfig.baseSegments);
              setSelectedFile(null);
              setViewMode('folders');
            }}
            className="px-2 py-1 rounded border border-slate-300 bg-white font-mono text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {!/^[A-Z]:$/.test(activeDrive) && (
              <option value={activeDrive}>{activeDrive}</option>
            )}
            {'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
              <option key={letter} value={`${letter}:`}>
                {letter}:
              </option>
            ))}
          </select>
        </div>

        {/* Two-Pane Explorer Body */}
        <div className="flex-1 min-h-[280px] grid grid-cols-1 sm:grid-cols-12 bg-white overflow-hidden">
          {/* Left Tree Navigation */}
          <div className="sm:col-span-4 border-b sm:border-b-0 sm:border-r border-slate-200 bg-slate-50/70 p-2 overflow-y-auto space-y-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setViewMode('saved');
                setSelectedFile(null);
              }}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-1.5 transition-colors ${
                viewMode === 'saved'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-blue-50/80 text-blue-950 hover:bg-blue-100 font-medium'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>All Saved on Disk</span>
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  viewMode === 'saved' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                }`}
              >
                {savedFiles.length}
              </span>
            </button>

            {savedLeafFolders.length > 0 && (
              <div className="pt-1 space-y-0.5">
                <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Folders with Saved Files
                </div>
                {savedLeafFolders.map((lf) => {
                  const isActiveFolder =
                    viewMode === 'folders' &&
                    activeDrive === lf.driveRoot &&
                    lf.segments.join('/') === currentSegments.join('/');
                  const shortTail =
                    lf.segments.length >= 3
                      ? lf.segments.slice(-3).join('\\')
                      : lf.segments.join('\\');
                  return (
                    <button
                      key={lf.relFolder}
                      type="button"
                      onClick={() => jumpToFolder(lf.driveRoot, lf.segments)}
                      title={lf.displayFolder}
                      className={`w-full text-left px-2 py-1 rounded flex items-center justify-between gap-1 transition-colors ${
                        isActiveFolder
                          ? 'bg-blue-100 text-blue-950 font-semibold'
                          : 'text-slate-700 hover:bg-slate-200/60'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <FolderOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-mono text-[11px] truncate">
                          {lf.driveRoot}\…\{shortTail}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono px-1 rounded bg-emerald-100 text-emerald-800 shrink-0">
                        {lf.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="pt-1 space-y-0.5">
              <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Browse Drive Tree
              </div>
              <button
                type="button"
                onClick={() => jumpToFolder(activeDrive, [])}
                className={`w-full text-left px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  viewMode === 'folders' && currentSegments.length === 0
                    ? 'bg-blue-100 text-blue-950 font-semibold'
                    : 'text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="font-mono text-[11px]">{activeDrive}\</span>
              </button>
              <button
                type="button"
                onClick={() => jumpToFolder(activeDrive, initialConfig.baseSegments)}
                className={`w-full text-left pl-5 pr-2 py-1 rounded flex items-center gap-1.5 transition-colors ${
                  viewMode === 'folders' &&
                  currentSegments.join('/') === initialConfig.baseSegments.join('/')
                    ? 'bg-blue-100 text-blue-950 font-semibold'
                    : 'text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="font-mono text-[11px] truncate">
                  {initialConfig.baseSegments.join('\\')}
                </span>
              </button>

              {solutionEqYearFolders.map((yearName) => {
                const segs = [...initialConfig.baseSegments, yearName];
                const isYearSelected =
                  viewMode === 'folders' &&
                  currentSegments.join('/') === segs.join('/');
                return (
                  <button
                    key={yearName}
                    type="button"
                    onClick={() => jumpToFolder(activeDrive, segs)}
                    className={`w-full text-left pl-8 pr-2 py-1 rounded flex items-center gap-1.5 transition-colors ${
                      isYearSelected
                        ? 'bg-blue-100 text-blue-950 font-semibold'
                        : 'text-slate-700 hover:bg-slate-200/60'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="font-mono text-[11px]">{yearName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Directory / Saved Files Contents */}
          <div className="sm:col-span-8 flex flex-col overflow-hidden">
            {showSavedList ? (
              <>
                <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50 grid grid-cols-12 text-[11px] font-semibold text-slate-600 shrink-0">
                  <span className="col-span-5">Filename</span>
                  <span className="col-span-5">Saved Path</span>
                  <span className="col-span-2 text-right">Size</span>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {filteredSavedDiskFiles.length === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-500 space-y-1">
                      <div className="font-medium text-slate-700">
                        {savedFiles.length === 0
                          ? isPrimerMode
                            ? 'No .primer.json files saved to disk yet.'
                            : isBulletinMode
                              ? 'No .html bulletins saved to disk yet.'
                              : 'No .eqp files saved to disk yet.'
                          : isPrimerMode
                            ? `No saved primers match "${searchQuery}".`
                            : isBulletinMode
                              ? `No saved .html bulletins match "${searchQuery}".`
                              : `No saved .eqp files match "${searchQuery}".`}
                      </div>
                      <div className="text-[11px]">
                        {isPrimerMode
                          ? `Click Save in the Primer tab to write a primer into ${activeDrive}\\${initialConfig.baseSegments.join('\\')}\\Pri_YYYY\\MM\\DD\\ (or browse folders for browser-saved drafts).`
                          : isBulletinMode
                            ? `Click Save in the Bulletin tab to write an HTML bulletin into ${activeDrive}\\${initialConfig.baseSegments.join('\\')}\\Bul_YYYY\\MM\\DD\\.`
                            : `Click Save in any tab to write an event into ${activeDrive}\\${initialConfig.baseSegments.join('\\')}\\Sol_YYYY\\MM\\DD\\.`}
                      </div>
                    </div>
                  ) : (
                    filteredSavedDiskFiles.map((file) => {
                      const candidate: ExplorerFileCandidate = {
                        filename: file.filename,
                        relFolder: file.relPath.split('/').slice(0, -1).join('/'),
                        displayFolder: file.displayFolder,
                        displayPath: file.displayPath,
                        sizeBytes: file.sizeBytes,
                        updatedAt: file.updatedAt,
                        source: 'disk',
                        relPath: file.relPath,
                      };
                      const isSelected = selectedFile?.relPath === file.relPath;
                      return (
                        <div
                          key={file.relPath}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedFile(candidate)}
                          onDoubleClick={() => triggerOpenSelected(candidate)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedFile(candidate);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 grid grid-cols-12 items-center gap-2 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-100/80' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="col-span-5 inline-flex items-center gap-2 font-mono text-slate-900 truncate">
                            <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="truncate font-semibold">{file.filename}</span>
                          </span>
                          <span
                            className="col-span-5 font-mono text-[10px] text-slate-500 truncate"
                            title={file.displayFolder}
                          >
                            {file.displayFolder}
                          </span>
                          <span className="col-span-2 text-right font-mono text-[11px] text-slate-600 tabular-nums inline-flex items-center justify-end gap-1.5">
                            <span>{file.sizeBytes} B</span>
                            <a
                              href={`${
                                isPrimerMode
                                  ? '/api/primer/download'
                                  : isBulletinMode
                                    ? '/api/bulletin/download'
                                    : '/api/eqp/download'
                              }?relPath=${encodeURIComponent(file.relPath)}`}
                              download={file.filename}
                              onClick={(e) => e.stopPropagation()}
                              title={
                                isPrimerMode
                                  ? 'Download .primer.json file'
                                  : isBulletinMode
                                    ? 'Download .html bulletin'
                                    : 'Download legacy .eqp file only (excludes .eqp.meta.json structured amplitude sidecar)'
                              }
                              className="p-0.5 rounded hover:bg-slate-200 text-blue-600"
                            >
                              <Download className="w-3 h-3" />
                            </a>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50 grid grid-cols-12 text-[11px] font-semibold text-slate-600 shrink-0">
                  <span className="col-span-6">Name</span>
                  <span className="col-span-3">Source</span>
                  <span className="col-span-3 text-right">Size</span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {childFolders.length === 0 && filesInCurrentFolder.length === 0 && (
                    <div className="px-4 py-8 text-center text-slate-500 space-y-1">
                      <div className="font-medium text-slate-700">
                        {isPrimerMode
                          ? `No folders or saved primers inside ${currentFolderDisplay}`
                          : isBulletinMode
                            ? `No folders or .html bulletins inside ${currentFolderDisplay}`
                            : `No folders or .eqp files inside ${currentFolderDisplay}`}
                      </div>
                      <div className="text-[11px]">
                        {isPrimerMode
                          ? `Save a primer or switch to “Saved on Disk (${savedFiles.length})” to view all saved primers.`
                          : isBulletinMode
                            ? `Save a bulletin or switch to “Saved on Disk (${savedFiles.length})” to view all saved bulletins.`
                            : `Save an event or switch to “Saved on Disk (${savedFiles.length})” to view all saved files.`}
                      </div>
                    </div>
                  )}

                  {childFolders.map((folder) => (
                    <button
                      key={folder.name}
                      type="button"
                      onClick={() => {
                        setCurrentSegments((prev) => [...prev, folder.name]);
                        setSelectedFile(null);
                      }}
                      className="w-full text-left px-3 py-2 grid grid-cols-12 items-center hover:bg-blue-50/70 transition-colors"
                    >
                      <span className="col-span-6 inline-flex items-center gap-2 font-mono text-slate-900 truncate">
                        <Folder
                          className={`w-4 h-4 shrink-0 ${
                            folder.diskCount > 0 ? 'text-emerald-600' : 'text-amber-500'
                          }`}
                        />
                        <span className="truncate">{folder.name}</span>
                      </span>
                      <span className="col-span-3 text-[11px] text-slate-500">
                        {folder.diskCount > 0
                          ? `Folder (${folder.diskCount} saved)`
                          : 'Folder'}
                      </span>
                      <span className="col-span-3 text-right text-[11px] text-slate-400">—</span>
                    </button>
                  ))}

                  {filesInCurrentFolder.map((file) => {
                    const isSelected = selectedFile?.displayPath === file.displayPath;
                    return (
                      <button
                        key={`${file.source}-${file.displayPath}`}
                        type="button"
                        onClick={() => setSelectedFile(file)}
                        onDoubleClick={() => triggerOpenSelected(file)}
                        className={`w-full text-left px-3 py-2 grid grid-cols-12 items-center transition-colors ${
                          isSelected ? 'bg-blue-100/80' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span className="col-span-6 inline-flex items-center gap-2 font-mono text-slate-900 truncate">
                          <FileText
                            className={`w-4 h-4 shrink-0 ${
                              file.source === 'disk' ? 'text-emerald-600' : 'text-blue-600'
                            }`}
                          />
                          <span className="truncate">{file.filename}</span>
                        </span>
                        <span className="col-span-3 text-[11px] text-slate-500">
                          {file.source === 'disk'
                            ? 'Saved on Disk'
                            : file.source === 'primer-draft'
                              ? 'Saved Browser Draft'
                              : 'In-Memory Catalog'}
                        </span>
                        <span className="col-span-3 text-right font-mono text-[11px] text-slate-600 tabular-nums">
                          {file.sizeBytes !== null ? `${file.sizeBytes} B` : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer File Selection & Open / Cancel Actions */}
        <div className="bg-[#f0f2f5] border-t border-slate-300 px-4 py-3 space-y-2.5 text-xs shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-[90px_1fr] items-center gap-2">
            <span className="font-medium text-slate-700">Selected file:</span>
            <div className="px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono text-xs text-slate-900 truncate">
              {selectedFile ? selectedFile.displayPath : `${currentFolderDisplay}\\`}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div>
              <input
                ref={localFileInputRef}
                type="file"
                accept={
                  isPrimerMode
                    ? '.primer.json,.json,.JSON'
                    : isBulletinMode
                      ? '.html,.htm,.HTML,.HTM'
                      : '.eqp,.EQP'
                }
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) {
                    onOpenLocalFile(file);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => localFileInputRef.current?.click()}
                title={
                  !isPrimerMode && !isBulletinMode
                    ? 'Open standalone local .eqp file (legacy .eqp format only; does not load .eqp.meta.json structured amplitude sidecar)'
                    : undefined
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-400 bg-white text-slate-700 font-medium hover:bg-slate-100"
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                {isPrimerMode
                  ? 'Browse Local .primer.json...'
                  : isBulletinMode
                    ? 'Browse Local .HTML...'
                    : 'Browse Local .EQP (Legacy)...'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isOpening}
                className="px-4 py-1.5 rounded border border-slate-400 bg-white text-slate-800 font-medium hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedFile || isOpening}
                onClick={() => triggerOpenSelected(selectedFile)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-xs"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {isOpening ? 'Opening...' : 'Open'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
