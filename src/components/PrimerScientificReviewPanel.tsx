import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit3,
  Eye,
  FileArchive,
  GitCompare,
  History,
  Lock,
  MessageSquarePlus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import type { PrimerDocument } from '../utils/earthquakePrimer';
import type { PrimerRevisionRecord } from '../utils/primerRevisions';
import {
  type ExtendedPrimerReadinessSummary,
  type LivePrimerReviewSourceContext,
  PRIMER_CHECKLIST_STATE_LABELS,
  PRIMER_LOCAL_REVIEW_STATUS_META,
  PRIMER_REVIEW_TARGET_OPTIONS,
  type PrimerChecklistItemState,
  type PrimerCommentCategory,
  type PrimerLocalReviewStatus,
  type PrimerReviewRecord,
  addCustomChecklistItem,
  addPrimerReviewComment,
  createPrimerReviewRecord,
  deletePrimerReviewComment,
  editPrimerReviewComment,
  evaluatePrimerReviewValidity,
  reopenCorrectionRequest,
  resolveCorrectionRequest,
  transitionLocalReviewStatus,
  updateChecklistItemState,
  updateReviewMetadata,
  validateLocalReviewStatusTransition,
} from '../utils/primerReviews';
import type { PrimerReviewArchiveDiagnostics } from '../utils/primerReviewPackage';

interface PrimerScientificReviewPanelProps {
  activeEventId: string;
  workingDraft: PrimerDocument | null;
  revisions: PrimerRevisionRecord[];
  reviews: PrimerReviewRecord[];
  selectedRevisionId: string | null;
  onSelectRevisionId: (revisionId: string | null) => void;
  reviewDiagnostics: PrimerReviewArchiveDiagnostics | null;
  extendedReadiness: ExtendedPrimerReadinessSummary | null;
  liveSourceContext: LivePrimerReviewSourceContext;
  isExportingZip: boolean;
  onSaveReview: (review: PrimerReviewRecord) => Promise<void>;
  onSaveNewRevisionFromDraft?: (description: string) => Promise<void>;
  onViewRevision: (revision: PrimerRevisionRecord) => void;
  onRestoreForCorrection: (revision: PrimerRevisionRecord) => void;
  onCompareRevisions: (left: PrimerRevisionRecord, right: PrimerRevisionRecord) => void;
  onCompareWithWorkingDraft: (revision: PrimerRevisionRecord) => void;
  onExportReviewPackageZip: (
    revision: PrimerRevisionRecord,
    review: PrimerReviewRecord
  ) => Promise<void>;
  onImportReviewPackageZip: (
    bytes: Uint8Array
  ) => Promise<{ ok: boolean; message: string; errors: string[] }>;
  onExportReviewArchiveJson: () => void;
  onImportReviewArchiveJson: (
    rawJson: string
  ) => Promise<{ ok: boolean; importedCount: number; errors: string[] }>;
}

const ORDERED_LOCAL_STATUSES: PrimerLocalReviewStatus[] = [
  'not-started',
  'in-review',
  'corrections-requested',
  'review-notes-complete-unverified-identity',
  'prepared-for-external-authorization',
];

export const PrimerScientificReviewPanel: React.FC<PrimerScientificReviewPanelProps> = ({
  activeEventId,
  workingDraft,
  revisions,
  reviews,
  selectedRevisionId,
  onSelectRevisionId,
  reviewDiagnostics,
  extendedReadiness,
  liveSourceContext,
  isExportingZip,
  onSaveReview,
  onSaveNewRevisionFromDraft,
  onViewRevision,
  onRestoreForCorrection,
  onCompareRevisions,
  onCompareWithWorkingDraft,
  onExportReviewPackageZip,
  onImportReviewPackageZip,
  onExportReviewArchiveJson,
  onImportReviewArchiveJson,
}) => {
  const [statusError, setStatusError] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  // Checklist custom check inputs
  const [showAddCheck, setShowAddCheck] = useState(false);
  const [newCheckCategory, setNewCheckCategory] = useState('Local Check');
  const [newCheckLabel, setNewCheckLabel] = useState('');

  // Comment & correction request composer
  const [targetValue, setTargetValue] = useState(
    `${PRIMER_REVIEW_TARGET_OPTIONS[0].targetKind}:${PRIMER_REVIEW_TARGET_OPTIONS[0].targetId}`
  );
  const [commentCategory, setCommentCategory] =
    useState<PrimerCommentCategory>('correction-request');
  const [commentBody, setCommentBody] = useState('');
  const [commentRefs, setCommentRefs] = useState('');
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});
  const [showOnlyCorrections, setShowOnlyCorrections] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  const eventRevisions = useMemo(
    () =>
      revisions
        .filter((r) => r.eventId === activeEventId)
        .sort((a, b) => b.revisionNumber - a.revisionNumber),
    [revisions, activeEventId]
  );

  const selectedRevision = useMemo(() => {
    if (selectedRevisionId) {
      const exact = revisions.find((r) => r.revisionId === selectedRevisionId);
      if (exact) return exact;
    }
    return eventRevisions[0] ?? revisions[0] ?? null;
  }, [revisions, eventRevisions, selectedRevisionId]);

  const activeReview = useMemo(() => {
    if (!selectedRevision) return null;
    const matches = reviews
      .filter((r) => r.revisionId === selectedRevision.revisionId)
      .sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc));
    return matches[0] ?? null;
  }, [reviews, selectedRevision]);

  const sameDocRevisions = useMemo(() => {
    if (!selectedRevision) return [];
    return revisions
      .filter((r) => r.primerDocumentId === selectedRevision.primerDocumentId)
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
  }, [revisions, selectedRevision]);

  const latestDocRevision = sameDocRevisions[0] ?? null;

  const validityReport = useMemo(() => {
    if (!activeReview || !selectedRevision) return null;
    return evaluatePrimerReviewValidity(
      activeReview,
      selectedRevision,
      sameDocRevisions,
      liveSourceContext
    );
  }, [activeReview, selectedRevision, sameDocRevisions, liveSourceContext]);

  const handleInitializeReview = async () => {
    if (!selectedRevision) return;
    setStatusError(null);
    const created = createPrimerReviewRecord(selectedRevision);
    await onSaveReview(created);
  };

  const handleChangeLocalStatus = async (nextStatus: PrimerLocalReviewStatus) => {
    if (!activeReview) return;
    const check = validateLocalReviewStatusTransition(activeReview, nextStatus);
    if (!check.allowed) {
      setStatusError(check.reasons.join(' '));
      return;
    }
    setStatusError(null);
    const updated = transitionLocalReviewStatus(activeReview, nextStatus);
    await onSaveReview(updated);
  };

  const handleChecklistStateChange = async (
    itemId: string,
    state: PrimerChecklistItemState,
    notApplicableJustification?: string,
    notes?: string
  ) => {
    if (!activeReview) return;
    setStatusError(null);
    const updated = updateChecklistItemState(activeReview, itemId, {
      state,
      notApplicableJustification,
      notes,
    });
    await onSaveReview(updated);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReview || !commentBody.trim()) return;
    setStatusError(null);
    const spec =
      PRIMER_REVIEW_TARGET_OPTIONS.find(
        (opt) => `${opt.targetKind}:${opt.targetId}` === targetValue
      ) ?? PRIMER_REVIEW_TARGET_OPTIONS[0];
    const refs = commentRefs
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const updated = addPrimerReviewComment(activeReview, {
      targetKind: spec.targetKind,
      targetId: spec.targetId,
      targetLabel: spec.targetLabel,
      category: commentCategory,
      body: commentBody,
      missingEvidenceFlag: commentCategory === 'missing-evidence',
      isCorrectionRequest: commentCategory === 'correction-request',
      references: refs,
    });
    setCommentBody('');
    setCommentRefs('');
    await onSaveReview(updated);
  };

  const handleResolveComment = async (commentId: string) => {
    if (!activeReview) return;
    const note = (resolutionDrafts[commentId] ?? '').trim();
    if (!note) {
      setStatusError(
        'Enter a mandatory resolution note explaining what was verified or corrected before resolving.'
      );
      return;
    }
    setStatusError(null);
    const updated = resolveCorrectionRequest(activeReview, commentId, note);
    setResolutionDrafts((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
    await onSaveReview(updated);
  };

  const handleReopenComment = async (commentId: string) => {
    if (!activeReview) return;
    setStatusError(null);
    const updated = reopenCorrectionRequest(
      activeReview,
      commentId,
      'Reopened during local scientific review'
    );
    await onSaveReview(updated);
  };

  const isRevisionSuperseded = Boolean(
    latestDocRevision &&
      selectedRevision &&
      latestDocRevision.revisionNumber > selectedRevision.revisionNumber
  );

  const handleSaveEditedComment = async (commentId: string) => {
    if (!activeReview || !editingCommentBody.trim()) return;
    try {
      setStatusError(null);
      const updated = editPrimerReviewComment(
        activeReview,
        commentId,
        { body: editingCommentBody },
        { isSnapshotLocked: isRevisionSuperseded }
      );
      setEditingCommentId(null);
      setEditingCommentBody('');
      await onSaveReview(updated);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteReviewComment = async (commentId: string) => {
    if (!activeReview) return;
    try {
      setStatusError(null);
      const updated = deletePrimerReviewComment(activeReview, commentId, {
        isSnapshotLocked: isRevisionSuperseded,
      });
      await onSaveReview(updated);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const res = await onImportReviewPackageZip(buf);
      if (res.ok) {
        setImportFeedback({ kind: 'ok', text: res.message });
      } else {
        setImportFeedback({
          kind: 'err',
          text: res.errors.join(' ') || res.message,
        });
      }
    } catch (err) {
      setImportFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const res = await onImportReviewArchiveJson(raw);
      if (res.ok) {
        setImportFeedback({
          kind: 'ok',
          text: `Imported ${res.importedCount} validated local review record(s).`,
        });
      } else {
        setImportFeedback({
          kind: 'err',
          text: res.errors.join(' ') || 'Review archive validation failed.',
        });
      }
    } catch (err) {
      setImportFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const visibleComments = useMemo(() => {
    if (!activeReview) return [];
    if (!showOnlyCorrections) return activeReview.comments;
    return activeReview.comments.filter((c) => c.isCorrectionRequest);
  }, [activeReview, showOnlyCorrections]);

  const checklistCounts = useMemo(() => {
    const list = activeReview?.checklist ?? [];
    return {
      total: list.length,
      satisfactory: list.filter((i) => i.state === 'satisfactory-for-local-review').length,
      correction: list.filter((i) => i.state === 'correction-required').length,
      na: list.filter((i) => i.state === 'not-applicable').length,
      unchecked: list.filter((i) => i.state === 'not-checked').length,
    };
  }, [activeReview]);

  return (
    <section
      aria-label="Scientific Review & Controlled Release Preparation"
      className="border border-slate-300 rounded-xs bg-white overflow-hidden"
    >
      {/* Header Strip */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-[#005a94] shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Scientific Review, Verification &amp; Release Preparation
            </h3>
            <span className="text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-600">
              {reviews.length} local review record(s) · {reviewDiagnostics?.backend ?? 'indexeddb'}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Revision-bound 15-point checklist, section comments, correction-tracking loop, and validated ZIP review packages. Local browser records only — never constitutes official institutional approval or publication.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={handleZipUpload}
            className="hidden"
          />
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleJsonUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => zipInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <Upload className="w-3 h-3" />
            <span>Import Review (.ZIP)</span>
          </button>
          <button
            type="button"
            onClick={onExportReviewArchiveJson}
            disabled={reviews.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Archive className="w-3 h-3" />
            <span>Export Reviews (.JSON)</span>
          </button>
          <button
            type="button"
            onClick={() => jsonInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <Upload className="w-3 h-3" />
            <span>Import Reviews (.JSON)</span>
          </button>
        </div>
      </div>

      {/* Explicit Release & Institutional Authorization Status Grid (4 Separated Pillars) */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 text-xs">
          {/* Pillar 1: Content Completeness */}
          <div className="bg-white border border-slate-200 rounded-xs p-2.5 space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
              1. Content Completeness
            </div>
            {extendedReadiness ? (
              <>
                <div className="font-mono tabular-nums font-bold text-slate-900">
                  {extendedReadiness.contentCompleteness.populatedSections}/
                  {extendedReadiness.contentCompleteness.totalSections} populated
                </div>
                <div className="text-[11px] text-slate-600">
                  {extendedReadiness.contentCompleteness.requiresInfoSections} needs info ·{' '}
                  {extendedReadiness.contentCompleteness.requiresScientificReviewSections}{' '}
                  scientific review
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-500">No primer loaded</div>
            )}
          </div>

          {/* Pillar 2: Local Scientific Review Progress */}
          <div className="bg-white border border-slate-200 rounded-xs p-2.5 space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
              2. Local Scientific Review
            </div>
            <div className="font-semibold text-slate-900 truncate">
              {activeReview
                ? PRIMER_LOCAL_REVIEW_STATUS_META[activeReview.status].shortLabel
                : 'Not Started'}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-600">
              {activeReview
                ? `Checklist ${checklistCounts.satisfactory + checklistCounts.na}/${checklistCounts.total} · ${activeReview.comments.filter((c) => c.isCorrectionRequest && c.resolutionState === 'open').length} open corr`
                : 'Select a frozen revision below'}
            </div>
          </div>

          {/* Pillar 3: Export Technical Readiness */}
          <div className="bg-white border border-slate-200 rounded-xs p-2.5 space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600">
              3. Export Technical Readiness
            </div>
            {extendedReadiness ? (
              <>
                <div className="font-mono tabular-nums font-bold text-slate-900">
                  {extendedReadiness.exportTechnicalReadiness.readyFigureCount}/
                  {extendedReadiness.exportTechnicalReadiness.totalFigureSlots} figures ready
                </div>
                <div className="text-[11px] text-slate-600">
                  {extendedReadiness.exportTechnicalReadiness.staleIndicators.length} stale alert(s) ·{' '}
                  {extendedReadiness.exportTechnicalReadiness.exportWarnings.length} warning(s)
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-500">Unavailable</div>
            )}
          </div>

          {/* Pillar 4: Formal Institutional Authorization (Explicitly Unavailable) */}
          <div className="bg-amber-50/80 border border-amber-300 rounded-xs p-2.5 space-y-1">
            <div className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-amber-950">
              <Lock className="w-3 h-3 shrink-0" />
              <span>4. Formal Authorization</span>
            </div>
            <div className="font-mono text-[11px] font-bold text-amber-950">
              External Auth: UNAVAILABLE / NOT CONFIGURED
            </div>
            <div className="font-mono text-[10.5px] text-amber-900">
              Public Publication: UNAVAILABLE / NOT CONFIGURED
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-700 bg-white border border-slate-200 rounded-xs px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Release Control Notice:</strong> EQP Modern has no authenticated accounts, signing authority, or publication pipeline. Typed reviewer labels carry <span className="font-mono font-semibold">UNVERIFIED_IDENTITY</span> and are never proof of institutional approval.
          </span>
          <span className="font-mono text-[10.5px] text-slate-500">
            Local Store: Non-Tamper-Proof IndexedDB
          </span>
        </div>
      </div>

      {/* Feedback Banner for Imports / Errors */}
      {importFeedback && (
        <div
          className={`px-4 py-2 border-b text-xs flex items-center justify-between gap-2 ${
            importFeedback.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{importFeedback.text}</span>
          <button
            type="button"
            onClick={() => setImportFeedback(null)}
            className="text-[11px] font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Step 1: Select Frozen Revision */}
        <div className="border border-slate-200 rounded-xs bg-slate-50/70 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="review-frozen-revision-select"
                className="text-[11px] font-bold uppercase tracking-wider text-slate-700"
              >
                Frozen Revision Target:
              </label>
              {revisions.length > 0 ? (
                <select
                  id="review-frozen-revision-select"
                  value={selectedRevision?.revisionId ?? ''}
                  onChange={(e) => {
                    setStatusError(null);
                    onSelectRevisionId(e.target.value || null);
                  }}
                  className="px-2.5 py-1 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                >
                  {revisions
                    .slice()
                    .sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc))
                    .map((rev) => {
                      const hasRev = reviews.some((r) => r.revisionId === rev.revisionId);
                      return (
                        <option key={rev.revisionId} value={rev.revisionId}>
                          Rev #{rev.revisionNumber} · {rev.eventId} · {rev.createdAtPst}
                          {hasRev ? ' [Has Review]' : ''}
                        </option>
                      );
                    })}
                </select>
              ) : (
                <span className="text-xs text-slate-600">
                  No frozen historical revisions archived yet.
                </span>
              )}
            </div>

            {selectedRevision ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onViewRevision(selectedRevision)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Eye className="w-3 h-3" />
                  <span>Inspect Snapshot</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRestoreForCorrection(selectedRevision)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-[#005a94] bg-white text-[11px] font-semibold text-[#005a94] hover:bg-sky-50 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restore for Correction</span>
                </button>
                {workingDraft && (
                  <button
                    type="button"
                    onClick={() => onCompareWithWorkingDraft(selectedRevision)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
                  >
                    <GitCompare className="w-3 h-3" />
                    <span>Compare w/ Draft</span>
                  </button>
                )}
                {latestDocRevision &&
                  latestDocRevision.revisionId !== selectedRevision.revisionId && (
                    <button
                      type="button"
                      onClick={() => onCompareRevisions(selectedRevision, latestDocRevision)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
                    >
                      <GitCompare className="w-3 h-3" />
                      <span>Compare w/ Rev #{latestDocRevision.revisionNumber}</span>
                    </button>
                  )}
              </div>
            ) : (
              workingDraft &&
              onSaveNewRevisionFromDraft && (
                <button
                  type="button"
                  onClick={() =>
                    void onSaveNewRevisionFromDraft(
                      `Initial frozen snapshot for scientific review (${workingDraft.eventId})`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] whitespace-nowrap shrink-0"
                >
                  <History className="w-3 h-3" />
                  <span>Save First Frozen Revision to Start Review</span>
                </button>
              )
            )}
          </div>

          {selectedRevision && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-slate-600">
              <span>ID: {selectedRevision.revisionId}</span>
              <span>Checksum: {selectedRevision.contentChecksum}</span>
              <span>Source FP: {selectedRevision.sourceEventFingerprint.slice(0, 12)}</span>
              <span>
                Freshness at snapshot: {selectedRevision.completenessIndicators.snapshotSourceFreshness.status}
              </span>
            </div>
          )}
        </div>

        {/* Review Workspace when Revision Selected */}
        {selectedRevision && !activeReview && (
          <div className="border border-slate-200 rounded-xs bg-slate-50/40 p-5 text-center space-y-2.5">
            <p className="text-xs text-slate-700 max-w-xl mx-auto">
              No local scientific review record exists yet for frozen{' '}
              <strong>Revision #{selectedRevision.revisionNumber}</strong> ({selectedRevision.eventId}).
              Initialize a revision-bound review record to record the 15-point checklist, section comments, correction requests, and exportable ZIP review package without mutating the historical snapshot.
            </p>
            <button
              type="button"
              onClick={() => void handleInitializeReview()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] whitespace-nowrap"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Start Local Review for Revision #{selectedRevision.revisionNumber}</span>
            </button>
          </div>
        )}

        {selectedRevision && activeReview && (
          <div className="space-y-4">
            {/* Invalidation / Drift Alert */}
            {validityReport && !validityReport.isValid && (
              <div className="border border-amber-300 bg-amber-50 rounded-xs p-3 text-xs text-amber-950 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      Review Outdated ({validityReport.validityState}) — Do Not Treat as Current
                    </span>
                  </div>
                  {validityReport.shouldInvalidateCompletedStatus && (
                    <span className="font-mono text-[10.5px] px-2 py-0.5 border border-amber-400 bg-white rounded-xs">
                      Completion Invalidated by Revision/Source Changes
                    </span>
                  )}
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                  {validityReport.reasons.map((rsn, idx) => (
                    <li key={idx}>{rsn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Status / Transition Error */}
            {statusError && (
              <div className="border border-rose-300 bg-rose-50 rounded-xs px-3 py-2 text-xs text-rose-950 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>{statusError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusError(null)}
                  className="text-[11px] font-semibold underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Reviewer Identity (UNVERIFIED), Scope, Workflow Status & Package Export */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 border border-slate-200 rounded-xs bg-slate-50 p-3 text-xs">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="review-author-label"
                    className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600"
                  >
                    Reviewer Label
                  </label>
                  <span className="font-mono text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-xs">
                    UNVERIFIED IDENTITY
                  </span>
                </div>
                <input
                  id="review-author-label"
                  type="text"
                  value={activeReview.reviewerIdentity.enteredLabel}
                  onChange={(e) =>
                    void onSaveReview(
                      updateReviewMetadata(activeReview, { reviewerLabel: e.target.value })
                    )
                  }
                  placeholder="Operator name or desk label (unverified)"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div>
                <label
                  htmlFor="review-scope-input"
                  className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Local Review Scope
                </label>
                <input
                  id="review-scope-input"
                  type="text"
                  value={activeReview.reviewScope}
                  onChange={(e) =>
                    void onSaveReview(
                      updateReviewMetadata(activeReview, { reviewScope: e.target.value })
                    )
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div className="flex flex-col justify-between gap-1.5">
                <div>
                  <label
                    htmlFor="review-workflow-status"
                    className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                  >
                    Local Review Status
                  </label>
                  <select
                    id="review-workflow-status"
                    value={activeReview.status}
                    onChange={(e) =>
                      void handleChangeLocalStatus(e.target.value as PrimerLocalReviewStatus)
                    }
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  >
                    {ORDERED_LOCAL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {PRIMER_LOCAL_REVIEW_STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-[10px] text-slate-500">
                    Checksum: {activeReview.localArchival.recordChecksum.slice(0, 12)}
                  </span>
                  <button
                    type="button"
                    disabled={isExportingZip}
                    onClick={() =>
                      void onExportReviewPackageZip(selectedRevision, activeReview)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    <span>
                      {isExportingZip ? 'Building ZIP Package...' : 'Export Review Package (.ZIP)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* 15-Item Configurable Scientific Review Checklist */}
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Scientific Review Checklist ({checklistCounts.total} items)
                  </h4>
                  <span className="text-[11px] font-mono tabular-nums text-slate-600">
                    {checklistCounts.satisfactory} satisfactory · {checklistCounts.correction}{' '}
                    correction required · {checklistCounts.na} N/A · {checklistCounts.unchecked}{' '}
                    unchecked
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddCheck((v) => !v)}
                  className="text-[11px] font-semibold text-[#005a94] hover:underline whitespace-nowrap shrink-0"
                >
                  {showAddCheck ? 'Cancel Custom Check' : '+ Add Custom Check'}
                </button>
              </div>

              {showAddCheck && (
                <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                  <input
                    type="text"
                    value={newCheckCategory}
                    onChange={(e) => setNewCheckCategory(e.target.value)}
                    placeholder="Category"
                    className="w-32 px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                  />
                  <input
                    type="text"
                    value={newCheckLabel}
                    onChange={(e) => setNewCheckLabel(e.target.value)}
                    placeholder="Custom scientific check description..."
                    className="flex-1 min-w-[220px] px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newCheckLabel.trim()) return;
                      const updated = addCustomChecklistItem(activeReview, {
                        category: newCheckCategory,
                        label: newCheckLabel,
                      });
                      setNewCheckLabel('');
                      setShowAddCheck(false);
                      await onSaveReview(updated);
                    }}
                    className="px-3 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] whitespace-nowrap shrink-0"
                  >
                    Add Check
                  </button>
                </div>
              )}

              <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-200">
                {activeReview.checklist.map((item) => (
                  <div
                    key={item.itemId}
                    className="px-3.5 py-2 text-xs flex flex-col md:flex-row md:items-start justify-between gap-2 bg-white hover:bg-slate-50/70"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono tabular-nums text-[10.5px] text-slate-500">
                          {String(item.order).padStart(2, '0')}.
                        </span>
                        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                          [{item.category}]
                        </span>
                        <span className="font-semibold text-slate-900">{item.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-600">{item.guidance}</p>

                      {item.state === 'not-applicable' && (
                        <input
                          type="text"
                          value={item.notApplicableJustification}
                          onChange={(e) =>
                            void handleChecklistStateChange(
                              item.itemId,
                              'not-applicable',
                              e.target.value
                            )
                          }
                          placeholder="Mandatory N/A justification (required before review completion)..."
                          className={`w-full px-2 py-1 text-[11px] bg-white border rounded-xs ${
                            item.notApplicableJustification.trim()
                              ? 'border-slate-300'
                              : 'border-rose-400 bg-rose-50/40'
                          }`}
                        />
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 shrink-0">
                      <select
                        aria-label={`Checklist state for ${item.label}`}
                        value={item.state}
                        onChange={(e) =>
                          void handleChecklistStateChange(
                            item.itemId,
                            e.target.value as PrimerChecklistItemState
                          )
                        }
                        className={`px-2 py-1 text-[11px] font-semibold border rounded-xs focus:outline-none ${
                          item.state === 'satisfactory-for-local-review'
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            : item.state === 'correction-required'
                              ? 'bg-rose-50 border-rose-300 text-rose-900'
                              : item.state === 'not-applicable'
                                ? 'bg-slate-100 border-slate-300 text-slate-700'
                                : 'bg-white border-slate-300 text-slate-700'
                        }`}
                      >
                        {(
                          Object.keys(
                            PRIMER_CHECKLIST_STATE_LABELS
                          ) as PrimerChecklistItemState[]
                        ).map((st) => (
                          <option key={st} value={st}>
                            {PRIMER_CHECKLIST_STATE_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section Comments, Missing Evidence & Correction Requests */}
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-[#005a94]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Revision-Bound Comments &amp; Correction Requests ({activeReview.comments.length})
                  </h4>
                </div>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyCorrections}
                    onChange={(e) => setShowOnlyCorrections(e.target.checked)}
                    className="accent-[#005a94]"
                  />
                  <span>Correction Requests Only</span>
                </label>
              </div>

              {/* Add Comment Form */}
              <form
                onSubmit={(e) => void handleAddComment(e)}
                className="p-3 bg-slate-50/50 border-b border-slate-200 space-y-2 text-xs"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <select
                    aria-label="Target section or artifact"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  >
                    {PRIMER_REVIEW_TARGET_OPTIONS.map((opt) => (
                      <option
                        key={`${opt.targetKind}:${opt.targetId}`}
                        value={`${opt.targetKind}:${opt.targetId}`}
                      >
                        {opt.targetLabel}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Comment category"
                    value={commentCategory}
                    onChange={(e) =>
                      setCommentCategory(e.target.value as PrimerCommentCategory)
                    }
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  >
                    <option value="correction-request">
                      Correction Request (Blocks Review Completion)
                    </option>
                    <option value="missing-evidence">
                      Flag Missing Evidence / Pending Source
                    </option>
                    <option value="general-note">General Review Observation</option>
                  </select>
                </div>

                <textarea
                  rows={2}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder={`Record comment or correction request bound strictly to frozen Revision #${selectedRevision.revisionNumber}...`}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    value={commentRefs}
                    onChange={(e) => setCommentRefs(e.target.value)}
                    placeholder="Optional references / bulletin IDs (semicolon-separated)..."
                    className="flex-1 min-w-[220px] px-2.5 py-1 text-[11px] bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  />
                  <button
                    type="submit"
                    disabled={!commentBody.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <MessageSquarePlus className="w-3 h-3" />
                    <span>Add Bound Comment</span>
                  </button>
                </div>
              </form>

              {/* Comment & Correction Feed */}
              {visibleComments.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  No comments or correction requests recorded for Revision #{selectedRevision.revisionNumber} yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 max-h-[320px] overflow-y-auto">
                  {visibleComments.map((cmt) => {
                    const commentLocked =
                      isRevisionSuperseded ||
                      (cmt.isCorrectionRequest && cmt.resolutionState === 'resolved');
                    const isEditing = editingCommentId === cmt.commentId;
                    return (
                    <div key={cmt.commentId} className="p-3 bg-white space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-semibold text-slate-900">
                            {cmt.targetLabel}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={`text-[10.5px] font-semibold ${
                              cmt.isCorrectionRequest
                                ? cmt.resolutionState === 'resolved'
                                  ? 'text-emerald-800'
                                  : 'text-rose-800'
                                : cmt.missingEvidenceFlag
                                  ? 'text-amber-800'
                                  : 'text-slate-600'
                            }`}
                          >
                            {cmt.isCorrectionRequest
                              ? cmt.resolutionState === 'resolved'
                                ? 'Correction Resolved'
                                : 'Correction Open'
                              : cmt.missingEvidenceFlag
                                ? 'Missing Evidence'
                                : 'Review Note'}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-[10.5px] text-slate-600">
                            Rev #{cmt.boundRevisionNumber} ({cmt.boundRevisionId})
                          </span>
                          {commentLocked && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-600">
                              <Lock className="w-3 h-3 text-slate-500" />
                              <span>Locked</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-mono tabular-nums text-[10.5px] text-slate-500">
                            {cmt.createdAtPst} · {cmt.authorLabel} [UNVERIFIED_IDENTITY]
                          </div>
                          {!commentLocked && !isEditing && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(cmt.commentId);
                                  setEditingCommentBody(cmt.body);
                                }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 border border-slate-300 rounded-xs text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteReviewComment(cmt.commentId)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 border border-rose-200 rounded-xs text-[10.5px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-1.5">
                          <textarea
                            rows={2}
                            value={editingCommentBody}
                            onChange={(e) => setEditingCommentBody(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingCommentBody('');
                              }}
                              className="px-2.5 py-0.5 border border-slate-300 rounded-xs text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!editingCommentBody.trim()}
                              onClick={() => void handleSaveEditedComment(cmt.commentId)}
                              className="px-2.5 py-0.5 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 cursor-pointer"
                            >
                              Save Note
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                          {cmt.body}
                        </p>
                      )}

                      {cmt.references.length > 0 && (
                        <div className="text-[11px] text-slate-600">
                          <strong>References:</strong> {cmt.references.join(' · ')}
                        </div>
                      )}

                      {cmt.isCorrectionRequest && cmt.resolutionState === 'open' && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={resolutionDrafts[cmt.commentId] ?? ''}
                            onChange={(e) =>
                              setResolutionDrafts((prev) => ({
                                ...prev,
                                [cmt.commentId]: e.target.value,
                              }))
                            }
                            placeholder="Mandatory resolution note (e.g., Restored & saved as Rev #2 with updated depth)..."
                            className="flex-1 min-w-[220px] px-2.5 py-1 text-[11px] bg-slate-50 border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleResolveComment(cmt.commentId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-emerald-700 bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800 whitespace-nowrap shrink-0"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Resolve Correction</span>
                          </button>
                        </div>
                      )}

                      {cmt.isCorrectionRequest && cmt.resolutionState === 'resolved' && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xs px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-950">
                          <div>
                            <strong>Resolution Note:</strong> {cmt.resolutionNote}{' '}
                            <span className="font-mono text-[10px] text-emerald-800">
                              ({cmt.resolvedAtPst} · {cmt.resolvedByLabel} [UNVERIFIED_IDENTITY])
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleReopenComment(cmt.commentId)}
                            className="px-2 py-0.5 rounded-xs border border-emerald-400 bg-white text-emerald-900 font-semibold hover:bg-emerald-100 whitespace-nowrap shrink-0"
                          >
                            Reopen
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
