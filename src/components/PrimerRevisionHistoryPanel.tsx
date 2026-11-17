import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  GitCompare,
  History,
  Lock,
  RotateCcw,
  Save,
  Upload,
} from 'lucide-react';
import type { PrimerDocument } from '../utils/earthquakePrimer';
import { resolvePrimerDocumentId } from '../utils/earthquakePrimer';
import type { PrimerPresentationMode } from '../utils/primerPresentation';
import type { PrimerRevisionRecord } from '../utils/primerRevisions';
import type { PrimerRevisionArchiveDiagnostics } from '../utils/primerRevisionArchive';

interface PrimerRevisionHistoryPanelProps {
  activeEventId: string;
  workingDraft: PrimerDocument | null;
  viewingRevision: PrimerRevisionRecord | null;
  revisions: PrimerRevisionRecord[];
  diagnostics: PrimerRevisionArchiveDiagnostics | null;
  liveEventFingerprint: string;
  liveStage3Fingerprint?: string;
  liveStage4Fingerprint?: string;
  isExportingPdf: boolean;
  onSaveNewRevision: (description: string) => Promise<void> | void;
  onViewRevision: (revision: PrimerRevisionRecord) => void;
  onReturnToWorkingDraft: () => void;
  onCompareWithWorkingDraft: (revision: PrimerRevisionRecord) => void;
  onCompareTwoRevisions: (left: PrimerRevisionRecord, right: PrimerRevisionRecord) => void;
  onRestoreAsWorkingDraft: (revision: PrimerRevisionRecord) => void;
  onExportRevisionHtml: (revision: PrimerRevisionRecord, mode: PrimerPresentationMode) => void;
  onExportRevisionPdf: (revision: PrimerRevisionRecord, mode: PrimerPresentationMode) => Promise<void> | void;
  onExportRevisionJson: (revision: PrimerRevisionRecord) => void;
  onExportAllArchiveJson: () => void;
  onImportArchiveJson: (rawJson: string) => Promise<{
    ok: boolean;
    importedCount: number;
    skippedDuplicateIds: string[];
    errors: string[];
    warnings: string[];
  }>;
}

type RevisionScopeFilter = 'active-event' | 'active-primer' | 'all';

export const PrimerRevisionHistoryPanel: React.FC<PrimerRevisionHistoryPanelProps> = ({
  activeEventId,
  workingDraft,
  viewingRevision,
  revisions,
  diagnostics,
  liveEventFingerprint,
  liveStage3Fingerprint,
  liveStage4Fingerprint,
  isExportingPdf,
  onSaveNewRevision,
  onViewRevision,
  onReturnToWorkingDraft,
  onCompareWithWorkingDraft,
  onCompareTwoRevisions,
  onRestoreAsWorkingDraft,
  onExportRevisionHtml,
  onExportRevisionPdf,
  onExportRevisionJson,
  onExportAllArchiveJson,
  onImportArchiveJson,
}) => {
  const [scope, setScope] = useState<RevisionScopeFilter>('active-event');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [savingRevision, setSavingRevision] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<string>('');
  const [compareRightId, setCompareRightId] = useState<string>('');
  const [exportMenuRevId, setExportMenuRevId] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePrimerDocId = workingDraft ? resolvePrimerDocumentId(workingDraft) : null;
  const activeWorkingBaseRevId =
    workingDraft?.extensions?.reviewVersioning?.activeRevisionId ?? null;
  const restoredFromRevId =
    workingDraft?.extensions?.reviewVersioning?.restoredFromRevisionId ?? null;

  const filteredRevisions = useMemo(() => {
    return revisions.filter((rev) => {
      if (scope === 'active-primer' && activePrimerDocId) {
        return rev.primerDocumentId === activePrimerDocId;
      }
      if (scope === 'active-event') {
        return rev.eventId === activeEventId;
      }
      return true;
    });
  }, [revisions, scope, activePrimerDocId, activeEventId]);

  const handleSaveClick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workingDraft || savingRevision) return;
    setSavingRevision(true);
    try {
      await onSaveNewRevision(descriptionInput.trim());
      setDescriptionInput('');
    } finally {
      setSavingRevision(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const res = await onImportArchiveJson(text);
      if (res.ok) {
        const skipNote =
          res.skippedDuplicateIds.length > 0
            ? ` (${res.skippedDuplicateIds.length} duplicate revision ID(s) already archived and skipped)`
            : '';
        setImportFeedback({
          kind: 'success',
          message: `Imported ${res.importedCount} validated revision(s) from ${file.name}${skipNote}.`,
        });
      } else {
        setImportFeedback({
          kind: 'error',
          message: `Rejected archive ${file.name}: ${res.errors.join(' ')}`,
        });
      }
    } catch (err) {
      setImportFeedback({
        kind: 'error',
        message: `Failed reading archive file: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    }
  };

  const selectedLeft = revisions.find((r) => r.revisionId === compareLeftId) ?? null;
  const selectedRight = revisions.find((r) => r.revisionId === compareRightId) ?? null;

  return (
    <section className="border border-slate-300 rounded-xs bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <History className="w-4 h-4 text-[#005a94] shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Primer Revision History &amp; Local Archive
            </h3>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-600">
              {revisions.length} stored revision{revisions.length === 1 ? '' : 's'}
            </span>
            {diagnostics && (
              <>
                <span className="text-xs text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-600">
                  Archive:{' '}
                  {diagnostics.backend === 'indexeddb' ? 'IndexedDB' : 'Session Store'} (
                  {(diagnostics.approximateArchiveBytes / 1024).toFixed(1)} KB) · Draft
                  Storage: {diagnostics.localStorageReport.usedKb} KB (
                  {diagnostics.localStorageReport.percentUsed}%)
                </span>
              </>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Frozen snapshots preserve document prose, Stage 2–4 data packages, and recorded provenance unchanged. Local archival is convenience history, not a tamper-proof institutional audit log.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <Upload className="w-3 h-3" />
            <span>Import JSON Archive</span>
          </button>
          <button
            type="button"
            disabled={revisions.length === 0}
            onClick={onExportAllArchiveJson}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
          >
            <Archive className="w-3 h-3" />
            <span>Export Archive (.JSON)</span>
          </button>
        </div>
      </div>

      {/* Save New Revision Bar */}
      {workingDraft && (
        <form
          onSubmit={(e) => void handleSaveClick(e)}
          className="bg-slate-50/70 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center gap-2"
        >
          <label htmlFor="primer-revision-desc" className="sr-only">
            Revision description
          </label>
          <input
            id="primer-revision-desc"
            type="text"
            value={descriptionInput}
            onChange={(e) => setDescriptionInput(e.target.value)}
            placeholder="Revision note (e.g., After B2 relocation and verified PEIS updates)..."
            className="flex-1 min-w-[240px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
          />
          <button
            type="submit"
            disabled={savingRevision || Boolean(viewingRevision)}
            title={
              viewingRevision
                ? 'Exit historical snapshot view to save a new revision from the working draft'
                : 'Capture an immutable frozen snapshot of the current working draft'
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingRevision ? 'Saving Revision...' : 'Save New Revision'}</span>
          </button>
        </form>
      )}

      {/* Import Validation Feedback */}
      {importFeedback && (
        <div
          className={`px-3.5 py-2 border-b text-xs flex items-center justify-between gap-2 ${
            importFeedback.kind === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{importFeedback.message}</span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="text-[11px] font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter & Pairwise Revision Compare Toolbar */}
      <div className="px-3.5 py-2 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="inline-flex rounded-xs border border-slate-300 bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setScope('active-event')}
            className={`px-2.5 py-1 rounded-xs font-semibold whitespace-nowrap ${
              scope === 'active-event'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active Event ({revisions.filter((r) => r.eventId === activeEventId).length})
          </button>
          <button
            type="button"
            disabled={!activePrimerDocId}
            onClick={() => setScope('active-primer')}
            className={`px-2.5 py-1 rounded-xs font-semibold whitespace-nowrap disabled:opacity-40 ${
              scope === 'active-primer'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Current Primer Lineage
          </button>
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-2.5 py-1 rounded-xs font-semibold whitespace-nowrap ${
              scope === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Archived ({revisions.length})
          </button>
        </div>

        {/* Compare Two Selected Revisions */}
        {revisions.length >= 2 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-600 font-semibold">Compare Revisions:</span>
            <select
              aria-label="Base revision for comparison"
              value={compareLeftId}
              onChange={(e) => setCompareLeftId(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-xs bg-white font-mono text-[11px] max-w-[170px]"
            >
              <option value="">Select Base...</option>
              {revisions.map((r) => (
                <option key={r.revisionId} value={r.revisionId}>
                  Rev #{r.revisionNumber} · {r.eventId}
                </option>
              ))}
            </select>
            <span className="text-slate-400">→</span>
            <select
              aria-label="Target revision for comparison"
              value={compareRightId}
              onChange={(e) => setCompareRightId(e.target.value)}
              className="px-2 py-1 border border-slate-300 rounded-xs bg-white font-mono text-[11px] max-w-[170px]"
            >
              <option value="">Select Target...</option>
              {revisions.map((r) => (
                <option key={r.revisionId} value={r.revisionId}>
                  Rev #{r.revisionNumber} · {r.eventId}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={
                !selectedLeft ||
                !selectedRight ||
                selectedLeft.revisionId === selectedRight.revisionId
              }
              onClick={() => {
                if (selectedLeft && selectedRight) {
                  onCompareTwoRevisions(selectedLeft, selectedRight);
                }
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-slate-50 text-slate-800 font-semibold hover:bg-slate-100 disabled:opacity-40 whitespace-nowrap"
            >
              <GitCompare className="w-3 h-3" />
              <span>Compare Selected</span>
            </button>
          </div>
        )}
      </div>

      {/* Revision Rows */}
      <div className="divide-y divide-slate-200 max-h-[420px] overflow-y-auto">
        {filteredRevisions.length === 0 ? (
          <div className="p-5 text-center text-xs text-slate-500">
            No frozen primer revisions saved in this filter yet. Click{' '}
            <strong>Save New Revision</strong> to archive an immutable snapshot of your draft.
          </div>
        ) : (
          filteredRevisions.map((rev) => {
            const isViewingThis = viewingRevision?.revisionId === rev.revisionId;
            const isCurrentDraftBase = activeWorkingBaseRevId === rev.revisionId;
            const isRestoredOrigin = restoredFromRevId === rev.revisionId;
            const comp = rev.completenessIndicators;

            // Detect live drift relative to active event/catalog without mutating snapshot provenance
            const liveDrifted =
              rev.eventId === activeEventId &&
              (rev.sourceEventFingerprint !== liveEventFingerprint ||
                Boolean(
                  rev.stage3SequenceFingerprint &&
                    liveStage3Fingerprint &&
                    rev.stage3SequenceFingerprint !== liveStage3Fingerprint
                ) ||
                Boolean(
                  rev.stage4NarrativeFingerprint &&
                    liveStage4Fingerprint &&
                    rev.stage4NarrativeFingerprint !== liveStage4Fingerprint
                ));

            return (
              <div
                key={rev.revisionId}
                className={`px-3.5 py-3 space-y-2 transition-colors ${
                  isViewingThis ? 'bg-sky-50/70' : 'bg-white hover:bg-slate-50/60'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        Rev #{rev.revisionNumber}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-semibold text-slate-800">
                        {rev.description}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          isViewingThis
                            ? 'text-[#005a94]'
                            : isRestoredOrigin
                              ? 'text-emerald-700'
                              : isCurrentDraftBase
                                ? 'text-sky-800'
                                : 'text-slate-500'
                        }`}
                      >
                        {isViewingThis
                          ? '● Currently Viewing (Read-Only Snapshot)'
                          : isRestoredOrigin
                            ? '● Source of Restored Working Draft'
                            : isCurrentDraftBase
                              ? '● Latest Saved Revision of Draft'
                              : 'Historical Frozen Snapshot'}
                      </span>
                    </div>

                    {/* Unboxed precision metadata strip */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-600">
                      <span>Created: {rev.createdAtPst}</span>
                      <span aria-hidden="true">·</span>
                      <span>({rev.createdAtUtc})</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Event {rev.eventId} B{rev.snapshot.bulletinNo}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Checksum {rev.contentChecksum.slice(0, 8)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                      <span className="font-mono tabular-nums">
                        Completeness: {comp.populatedSections}/{comp.totalSections} populated (
                        {comp.readyForReviewCount} ready, {comp.requiresScientificReviewCount} sci-review,{' '}
                        {comp.requiresInfoCount} needs-info)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Figures: {comp.readyFigureCount}/{comp.totalFigureSlots}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${
                          comp.snapshotSourceFreshness.status === 'synchronized'
                            ? 'text-emerald-700'
                            : comp.snapshotSourceFreshness.status === 'stale-at-snapshot'
                              ? 'text-amber-800'
                              : 'text-rose-700'
                        }`}
                      >
                        {comp.snapshotSourceFreshness.status === 'synchronized'
                          ? '✓ Snapshot Sources Synchronized'
                          : comp.snapshotSourceFreshness.status === 'stale-at-snapshot'
                            ? '▲ Source Stale at Snapshot Time'
                            : '⚠ Incomplete Sources at Snapshot'}
                      </span>
                      {liveDrifted && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-800 font-semibold">
                            ▲ Live Event/Catalog Changed Since Snapshot
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Revision Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {isViewingThis ? (
                      <button
                        type="button"
                        onClick={onReturnToWorkingDraft}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Return to Draft</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onViewRevision(rev)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View Revision</span>
                      </button>
                    )}

                    {workingDraft && (
                      <button
                        type="button"
                        onClick={() => onCompareWithWorkingDraft(rev)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                      >
                        <GitCompare className="w-3 h-3" />
                        <span>Compare w/ Draft</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onRestoreAsWorkingDraft(rev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-emerald-300 bg-emerald-50 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore as New Draft</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExportMenuRevId((curr) =>
                          curr === rev.revisionId ? null : rev.revisionId
                        )
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border text-[11px] font-semibold whitespace-nowrap ${
                        exportMenuRevId === rev.revisionId
                          ? 'bg-[#005a94] border-[#005a94] text-white'
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <Download className="w-3 h-3" />
                      <span>Export Revision</span>
                    </button>
                  </div>
                </div>

                {/* Inline Export Revision Options */}
                {exportMenuRevId === rev.revisionId && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xs px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 text-slate-700 font-semibold">
                      <Lock className="w-3 h-3 text-slate-500" />
                      <span>
                        Export Frozen Snapshot Rev #{rev.revisionNumber} (Never labeled FINAL/APPROVED):
                      </span>
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isExportingPdf}
                        onClick={() => void onExportRevisionPdf(rev, 'public-draft')}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-xs bg-[#005a94] text-white font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Public Draft (.PDF)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onExportRevisionHtml(rev, 'public-draft')}
                        className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-100 whitespace-nowrap"
                      >
                        Public Draft (.HTML)
                      </button>
                      <button
                        type="button"
                        disabled={isExportingPdf}
                        onClick={() => void onExportRevisionPdf(rev, 'scientific-review')}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Scientific Review (.PDF)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onExportRevisionHtml(rev, 'scientific-review')}
                        className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-100 whitespace-nowrap"
                      >
                        Scientific Review (.HTML)
                      </button>
                      <button
                        type="button"
                        onClick={() => onExportRevisionJson(rev)}
                        className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-slate-800 font-semibold hover:bg-slate-100 whitespace-nowrap"
                      >
                        Revision (.JSON)
                      </button>
                    </div>
                  </div>
                )}

                {comp.snapshotSourceFreshness.staleIndicatorsAtSnapshot.length > 0 && (
                  <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xs px-2.5 py-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>
                      Recorded at snapshot time:{' '}
                      {comp.snapshotSourceFreshness.staleIndicatorsAtSnapshot.join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
