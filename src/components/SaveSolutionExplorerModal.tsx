import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import {
  BulletinSaveTarget,
  EqpSaveTarget,
  parseSolutionDrivePath,
  PrimerSaveTarget,
} from '../utils/eqpStorage';

export interface SavedEqpFileItem {
  filename: string;
  relPath: string;
  displayFolder: string;
  displayPath: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface SavedEqpFolderItem {
  relFolder: string;
  displayFolder: string;
}

interface SaveSolutionExplorerModalProps {
  open: boolean;
  isSaving: boolean;
  mode?: 'eqp' | 'bulletin' | 'primer';
  defaultTarget: EqpSaveTarget | BulletinSaveTarget | PrimerSaveTarget;
  initialFilename?: string;
  solutionDrive: string;
  savedFiles: SavedEqpFileItem[];
  savedFolders: SavedEqpFolderItem[];
  pendingActionAfterSave?: 'new' | 'open' | 'print' | null;
  onRefreshListing: () => void;
  onConfirmSave: (params: {
    drive: string;
    folderSegments: string[];
    filename: string;
    alsoDownloadLocal: boolean;
  }) => void;
  onCancel: () => void;
}

const ALSO_DOWNLOAD_STORAGE_KEY = 'eqp_also_download_local';

export const SaveSolutionExplorerModal: React.FC<SaveSolutionExplorerModalProps> = ({
  open,
  isSaving,
  mode = 'eqp',
  defaultTarget,
  initialFilename,
  solutionDrive,
  savedFiles,
  savedFolders,
  pendingActionAfterSave = null,
  onRefreshListing,
  onConfirmSave,
  onCancel,
}) => {
  const isBulletinMode = mode === 'bulletin';
  const isPrimerMode = mode === 'primer';
  const defaultSegments = useMemo(
    () => defaultTarget.folderSegments,
    [defaultTarget.folderSegments]
  );

  const [activeDrive, setActiveDrive] = useState<string>(() => defaultTarget.driveRoot);
  const [currentSegments, setCurrentSegments] = useState<string[]>(defaultSegments);
  const [filenameDraft, setFilenameDraft] = useState<string>(
    initialFilename || defaultTarget.filename
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [alsoDownloadLocal, setAlsoDownloadLocal] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(ALSO_DOWNLOAD_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);
  const filenameInputRef = useRef<HTMLInputElement | null>(null);
  const onRefreshListingRef = useRef(onRefreshListing);
  onRefreshListingRef.current = onRefreshListing;

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setActiveDrive(defaultTarget.driveRoot);
    setCurrentSegments([...defaultTarget.folderSegments]);
    setFilenameDraft(initialFilename || defaultTarget.filename);
    setCreatingFolder(false);
    setNewFolderName('');
    setCustomFolders([]);
    setValidationError(null);
    onRefreshListingRef.current();

    requestAnimationFrame(() => {
      const input = filenameInputRef.current;
      if (input) {
        input.focus();
        const extNeedle = isPrimerMode ? '.primer.json' : isBulletinMode ? '.html' : '.eqp';
        const dotIdx = input.value.toLowerCase().lastIndexOf(extNeedle);
        input.setSelectionRange(0, dotIdx > 0 ? dotIdx : input.value.length);
      }
    });
  }, [open, solutionDrive, defaultTarget, initialFilename, isBulletinMode, isPrimerMode]);

  const driveKey = useMemo(
    () => parseSolutionDrivePath(activeDrive).driveKey,
    [activeDrive]
  );

  const currentFolderDisplay = useMemo(
    () =>
      currentSegments.length > 0
        ? `${activeDrive}\\${currentSegments.join('\\')}`
        : `${activeDrive}\\`,
    [activeDrive, currentSegments]
  );

  const currentRelPrefix = useMemo(
    () => (currentSegments.length > 0 ? `${driveKey}/${currentSegments.join('/')}` : driveKey),
    [driveKey, currentSegments]
  );

  const existingFolderSet = useMemo(() => {
    const set = new Set<string>();
    for (const f of savedFolders) {
      set.add(f.relFolder);
    }
    return set;
  }, [savedFolders]);

  // All known folder paths under activeDrive (existing + default target chain + user-added virtual folders)
  const knownFolderPaths = useMemo(() => {
    const paths = new Set<string>();
    const addChain = (segments: string[]) => {
      for (let i = 1; i <= segments.length; i++) {
        paths.add(`${driveKey}/${segments.slice(0, i).join('/')}`);
      }
    };
    addChain(defaultSegments);
    addChain(currentSegments);
    for (const f of savedFolders) {
      if (f.relFolder.startsWith(`${driveKey}/`) || f.relFolder === driveKey) {
        paths.add(f.relFolder);
      }
    }
    for (const cf of customFolders) {
      paths.add(cf);
    }
    return Array.from(paths).sort();
  }, [driveKey, defaultSegments, currentSegments, savedFolders, customFolders]);

  // Direct child folders of the currently opened directory
  const childFolders = useMemo(() => {
    const prefix = `${currentRelPrefix}/`;
    const children = new Map<string, { name: string; relFolder: string; existsOnDisk: boolean }>();
    for (const rel of knownFolderPaths) {
      if (!rel.startsWith(prefix)) continue;
      const rest = rel.slice(prefix.length);
      if (!rest || rest.includes('/')) continue;
      children.set(rest, {
        name: rest,
        relFolder: rel,
        existsOnDisk: existingFolderSet.has(rel),
      });
    }
    return Array.from(children.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentRelPrefix, knownFolderPaths, existingFolderSet]);

  // Files inside the currently opened directory
  const filesInCurrentFolder = useMemo(() => {
    const prefix = `${currentRelPrefix}/`;
    return savedFiles.filter((file) => {
      if (!file.relPath.startsWith(prefix)) return false;
      const rest = file.relPath.slice(prefix.length);
      return rest.length > 0 && !rest.includes('/');
    });
  }, [currentRelPrefix, savedFiles]);

  const currentFolderExistsOnDisk = existingFolderSet.has(currentRelPrefix);

  const normalizedFilename = useMemo(() => {
    const trimmed = filenameDraft.trim();
    if (!trimmed) return '';
    if (isPrimerMode) {
      return /\.primer\.json$/i.test(trimmed)
        ? trimmed
        : `${trimmed.replace(/\.json$/i, '')}.primer.json`;
    }
    if (isBulletinMode) {
      return /\.html?$/i.test(trimmed) ? trimmed : `${trimmed}.html`;
    }
    return /\.eqp$/i.test(trimmed) ? trimmed : `${trimmed}.eqp`;
  }, [filenameDraft, isBulletinMode, isPrimerMode]);

  const willOverwrite = useMemo(
    () =>
      normalizedFilename !== '' &&
      filesInCurrentFolder.some(
        (f) => f.filename.toLowerCase() === normalizedFilename.toLowerCase()
      ),
    [filesInCurrentFolder, normalizedFilename]
  );

  // Tree items shown in the left Explorer pane (default target chain + existing saved Sol folders)
  const sidebarTreeItems = useMemo(() => {
    const items: Array<{
      relPath: string;
      label: string;
      segments: string[];
      depth: number;
      existsOnDisk: boolean;
      isDefaultTarget: boolean;
    }> = [];

    items.push({
      relPath: driveKey,
      label: `${activeDrive}\\`,
      segments: [],
      depth: 0,
      existsOnDisk: savedFolders.some((f) => f.relFolder.startsWith(`${driveKey}/`)),
      isDefaultTarget: false,
    });

    const seenKeys = new Set<string>();
    const defaultTargetRel = `${driveKey}/${defaultSegments.join('/')}`;
    for (const rel of knownFolderPaths) {
      if (!rel.startsWith(`${driveKey}/`)) continue;
      const segs = rel.slice(driveKey.length + 1).split('/').filter(Boolean);
      if (segs.length === 0 || seenKeys.has(rel)) continue;
      seenKeys.add(rel);
      items.push({
        relPath: rel,
        label: segs[segs.length - 1],
        segments: segs,
        depth: segs.length,
        existsOnDisk: existingFolderSet.has(rel),
        isDefaultTarget: rel === defaultTargetRel,
      });
    }
    return items;
  }, [activeDrive, driveKey, defaultSegments, knownFolderPaths, savedFolders, existingFolderSet]);

  if (!open) return null;

  const handleGoUp = () => {
    if (currentSegments.length === 0) return;
    setCurrentSegments((prev) => prev.slice(0, -1));
  };

  const handleCreateSubfolder = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFolderName.trim();
    if (!cleaned || !/^[A-Za-z0-9 _.-]+$/.test(cleaned) || cleaned === '.' || cleaned === '..' || cleaned.includes('..')) {
      setValidationError('Folder name must use letters, numbers, spaces, underscores, dots, or hyphens.');
      return;
    }
    const nextSegments = [...currentSegments, cleaned];
    const rel = `${driveKey}/${nextSegments.join('/')}`;
    setCustomFolders((prev) => (prev.includes(rel) ? prev : [...prev, rel]));
    setCurrentSegments(nextSegments);
    setNewFolderName('');
    setCreatingFolder(false);
    setValidationError(null);
  };

  const handleSubmitSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = filenameDraft.trim();
    if (!trimmed) {
      setValidationError('Please enter a filename.');
      return;
    }
    const finalName = isPrimerMode
      ? /\.primer\.json$/i.test(trimmed)
        ? trimmed
        : `${trimmed.replace(/\.json$/i, '')}.primer.json`
      : isBulletinMode
        ? /\.html?$/i.test(trimmed)
          ? trimmed
          : `${trimmed}.html`
        : /\.eqp$/i.test(trimmed)
          ? trimmed
          : `${trimmed}.eqp`;
    const isValidName = isPrimerMode
      ? !/^\.primer\.json$/i.test(finalName) && /^[A-Za-z0-9 _.-]+\.primer\.json$/i.test(finalName)
      : isBulletinMode
        ? !/^\.html?$/i.test(finalName) && /^[A-Za-z0-9 _.-]+\.html?$/i.test(finalName)
        : finalName !== '.eqp' && /^[A-Za-z0-9 _.-]+\.eqp$/i.test(finalName);
    if (!isValidName || finalName.includes('..')) {
      setValidationError('Filename can only contain letters, numbers, spaces, underscores, hyphens, and dots.');
      return;
    }
    if (currentSegments.length === 0) {
      setValidationError('Please select a destination folder inside the drive (or click Event Folder).');
      return;
    }
    setValidationError(null);
    onConfirmSave({
      drive: activeDrive,
      folderSegments: currentSegments,
      filename: finalName,
      alsoDownloadLocal,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-explorer-title"
      onClick={onCancel}
    >
      <div
        className="bg-[#f0f2f5] border border-slate-500 rounded-md shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Classic Title Bar */}
        <div className="bg-gradient-to-r from-[#0b4a8f] to-[#1d6bc2] text-white px-3.5 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Folder className="w-4 h-4 text-amber-300 shrink-0" />
            <h2 id="save-explorer-title" className="text-xs font-semibold truncate">
              {isPrimerMode
                ? 'Save Earthquake Primer As — File Explorer'
                : isBulletinMode
                  ? 'Save EQP Bulletin As — File Explorer'
                  : 'Save EQP Solution As — File Explorer'}
              {pendingActionAfterSave === 'new'
                ? isPrimerMode
                  ? ' (Save before New Primer)'
                  : isBulletinMode
                    ? ' (Save before New Bulletin)'
                    : ' (Save before New Event)'
                : pendingActionAfterSave === 'open'
                  ? isPrimerMode
                    ? ' (Save before Open Primer)'
                    : isBulletinMode
                      ? ' (Save before Open Bulletin)'
                      : ' (Save before Open .EQP)'
                  : pendingActionAfterSave === 'print'
                    ? ' (Save before Print EQ Data)'
                    : ''}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close Save Explorer"
            className="p-1 rounded hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Explorer Navigation & Address Bar */}
        <div className="bg-white border-b border-slate-300 px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleGoUp}
              disabled={currentSegments.length === 0}
              title="Up one folder"
              className="p-1.5 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveDrive(defaultTarget.driveRoot);
                setCurrentSegments([...defaultSegments]);
              }}
              title="Jump to formatted event date folder"
              className="px-2 py-1 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-[11px] font-medium inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3 text-blue-700" />
              Event Folder
            </button>
            <button
              type="button"
              onClick={() => setCreatingFolder((v) => !v)}
              title="Create new subfolder"
              className="px-2 py-1 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-[11px] font-medium inline-flex items-center gap-1"
            >
              <FolderPlus className="w-3.5 h-3.5 text-amber-600" />
              New Folder
            </button>
          </div>

          {/* Address Bar */}
          <div className="flex-1 min-w-[200px] flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded font-mono text-[11px] text-slate-800 overflow-x-auto">
            <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <button
              type="button"
              onClick={() => setCurrentSegments([])}
              className="hover:underline font-semibold text-blue-800 shrink-0"
            >
              {activeDrive}
            </button>
            {currentSegments.map((seg, idx) => (
              <React.Fragment key={`${seg}-${idx}`}>
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <button
                  type="button"
                  onClick={() => setCurrentSegments(currentSegments.slice(0, idx + 1))}
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

          <select
            aria-label="Select drive"
            value={activeDrive}
            onChange={(e) => {
              setActiveDrive(e.target.value);
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

        {/* Inline New Subfolder Bar */}
        {creatingFolder && (
          <form
            onSubmit={handleCreateSubfolder}
            className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center gap-2 text-xs"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span className="text-amber-900 font-medium">Create subfolder in {currentFolderDisplay}:</span>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="px-2 py-1 bg-white border border-amber-300 rounded font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded bg-amber-600 text-white font-medium hover:bg-amber-700"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName('');
              }}
              className="px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </form>
        )}

        {/* Two-Pane Explorer Body */}
        <div className="flex-1 min-h-[260px] grid grid-cols-1 sm:grid-cols-12 bg-white overflow-hidden">
          {/* Left Navigation Folder Tree */}
          <div className="sm:col-span-4 border-b sm:border-b-0 sm:border-r border-slate-200 bg-slate-50/70 p-2 overflow-y-auto space-y-0.5 text-xs">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {isPrimerMode
                ? 'EQP Primer Tree'
                : isBulletinMode
                  ? 'EQP Bulletin Tree'
                  : 'EQP Solution Tree'}
            </div>
            {sidebarTreeItems.map((item) => {
              const isSelected =
                item.segments.length === currentSegments.length &&
                item.segments.every((s, idx) => s === currentSegments[idx]);
              const indentClasses = ['pl-2', 'pl-5', 'pl-8', 'pl-11', 'pl-14', 'pl-16'];
              const indentClass = indentClasses[Math.min(indentClasses.length - 1, item.depth)];
              return (
                <button
                  key={item.relPath}
                  type="button"
                  onClick={() => setCurrentSegments(item.segments)}
                  className={`w-full text-left pr-2 py-1 rounded flex items-center justify-between gap-1.5 transition-colors ${indentClass} ${
                    isSelected
                      ? 'bg-blue-100 text-blue-950 font-semibold'
                      : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    {item.depth === 0 ? (
                      <HardDrive className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="font-mono text-[11px] truncate">{item.label}</span>
                  </span>
                  {item.isDefaultTarget && !item.existsOnDisk && (
                    <span className="text-[9px] font-sans px-1 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">
                      Create
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Folder Contents List */}
          <div className="sm:col-span-8 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50 grid grid-cols-12 text-[11px] font-semibold text-slate-600 shrink-0">
              <span className="col-span-6">Name</span>
              <span className="col-span-3">Type</span>
              <span className="col-span-3 text-right">Size</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
              {!currentFolderExistsOnDisk && childFolders.length === 0 && filesInCurrentFolder.length === 0 && (
                <div className="px-4 py-6 text-center space-y-1">
                  <div className="text-slate-700 font-medium">
                    Folder <span className="font-mono">{currentFolderDisplay}</span> does not exist yet.
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Clicking <strong>Save</strong> will create this folder automatically and write{' '}
                    <span className="font-mono font-semibold text-slate-800">{normalizedFilename || defaultTarget.filename}</span>.
                  </div>
                </div>
              )}

              {childFolders.map((folder) => (
                <button
                  key={folder.relFolder}
                  type="button"
                  onDoubleClick={() =>
                    setCurrentSegments((prev) => [...prev, folder.name])
                  }
                  onClick={() =>
                    setCurrentSegments((prev) => [...prev, folder.name])
                  }
                  className="w-full text-left px-3 py-2 grid grid-cols-12 items-center hover:bg-blue-50/70 transition-colors"
                >
                  <span className="col-span-6 inline-flex items-center gap-2 font-mono text-slate-900 truncate">
                    <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </span>
                  <span className="col-span-3 text-[11px] text-slate-500">
                    {folder.existsOnDisk ? 'File folder' : 'Pending folder'}
                  </span>
                  <span className="col-span-3 text-right text-[11px] text-slate-400">—</span>
                </button>
              ))}

              {filesInCurrentFolder.map((file) => {
                const isSelected =
                  file.filename.toLowerCase() === normalizedFilename.toLowerCase();
                return (
                  <button
                    key={file.relPath}
                    type="button"
                    onClick={() => setFilenameDraft(file.filename)}
                    className={`w-full text-left px-3 py-2 grid grid-cols-12 items-center transition-colors ${
                      isSelected ? 'bg-blue-100/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="col-span-6 inline-flex items-center gap-2 font-mono text-slate-900 truncate">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="truncate">{file.filename}</span>
                    </span>
                    <span className="col-span-3 text-[11px] text-slate-500">
                      {isPrimerMode
                        ? 'EQP Primer'
                        : isBulletinMode
                          ? 'HTML Bulletin'
                          : 'EQP File'}
                    </span>
                    <span className="col-span-3 text-right font-mono text-[11px] text-slate-600 tabular-nums">
                      {file.sizeBytes} B
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom File Name & Save / Cancel Footer */}
        <form
          onSubmit={handleSubmitSave}
          className="bg-[#f0f2f5] border-t border-slate-300 px-4 py-3 space-y-2.5 text-xs shrink-0"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[90px_1fr_auto] items-center gap-2">
            <label htmlFor="explorer-filename-input" className="font-medium text-slate-700">
              File name:
            </label>
            <div className="flex items-center gap-1.5 min-w-0">
              <input
                ref={filenameInputRef}
                id="explorer-filename-input"
                type="text"
                value={filenameDraft}
                onChange={(e) => {
                  setFilenameDraft(e.target.value);
                  setValidationError(null);
                }}
                placeholder={
                  isPrimerMode
                    ? 'Enter .primer.json filename'
                    : isBulletinMode
                      ? 'Enter .html bulletin filename'
                      : 'Enter .eqp filename'
                }
                aria-label="Save file name"
                className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-400 rounded font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {filenameDraft.trim() !== defaultTarget.filename && (
                <button
                  type="button"
                  onClick={() => {
                    setFilenameDraft(defaultTarget.filename);
                    setValidationError(null);
                    filenameInputRef.current?.focus();
                  }}
                  title={`Reset to formatted filename (${defaultTarget.filename})`}
                  className="px-2 py-1.5 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 shrink-0"
                >
                  Default
                </button>
              )}
            </div>
            <span
              className={`px-2 py-1 rounded text-[11px] font-medium ${
                defaultTarget.isFelt
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {defaultTarget.isFelt ? 'F · Felt Event' : 'Unfelt Event'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[90px_1fr] items-center gap-2">
            <span className="font-medium text-slate-700">Save as type:</span>
            <div className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 flex items-center justify-between gap-2">
              <span>
                {isPrimerMode
                  ? 'EQP Earthquake Primer (*.primer.json)'
                  : isBulletinMode
                    ? 'EQP Earthquake Bulletin (*.html)'
                    : 'EQP Earthquake Solution (*.eqp)'}
              </span>
              <span className="font-mono text-[10px] text-slate-500 truncate">
                {currentFolderDisplay}\{normalizedFilename || '—'}
              </span>
            </div>
          </div>

          {validationError && (
            <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5 text-[11px]">
              {validationError}
            </div>
          )}

          {!validationError && (
            <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
              <span>
                {willOverwrite
                  ? 'A file with this name already exists and will be overwritten.'
                  : !currentFolderExistsOnDisk
                    ? `Folder ${currentFolderDisplay} will be created on Save.`
                    : `Saving into existing folder ${currentFolderDisplay}.`}
              </span>
              <label
                className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700"
                title={
                  !isPrimerMode && !isBulletinMode
                    ? 'Downloads standalone legacy .eqp text copy only (excludes .eqp.meta.json structured amplitude sidecar; solution storage still saves both).'
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  checked={alsoDownloadLocal}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAlsoDownloadLocal(checked);
                    try {
                      window.localStorage.setItem(ALSO_DOWNLOAD_STORAGE_KEY, String(checked));
                    } catch {
                      // ignore storage error
                    }
                  }}
                  className="accent-blue-600"
                />
                <Download className="w-3 h-3 text-slate-500" />
                <span>
                  {!isPrimerMode && !isBulletinMode
                    ? 'Also download legacy .EQP copy'
                    : 'Also download copy'}
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-1.5 rounded border border-slate-400 bg-white text-slate-800 font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
