import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Flag,
  GitCompare,
  Lock,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { PrimerRevisionRecord } from '../utils/primerRevisions';
import {
  type CorrectionRequestStatus,
  type PrimerCorrectionRequest,
  verifyOriginalSnapshotIntegrity,
} from '../utils/primerCorrectionRequests';
import {
  PRIMER_SECTION_AND_FIGURE_TARGETS,
  type SectionCommentTargetKind,
} from '../utils/primerSectionComments';

export interface FlagCorrectionComposerTarget {
  targetKind: SectionCommentTargetKind;
  targetId: string;
  targetLabel: string;
  nonce: number;
}

interface PrimerCorrectionRequestsPanelProps {
  activeEventId: string;
  revisions: PrimerRevisionRecord[];
  requests: PrimerCorrectionRequest[];
  viewingRevision: PrimerRevisionRecord | null;
  activeBaseRevision: PrimerRevisionRecord | null;
  preselectedTarget?: FlagCorrectionComposerTarget | null;
  onCreateCorrectionRequest: (input: {
    targetKind: SectionCommentTargetKind;
    targetId: string;
    targetLabel: string;
    summary: string;
    reason: string;
    requestedByLabel: string;
  }) => Promise<void>;
  onStartDraftCorrection: (
    request: PrimerCorrectionRequest,
    sourceRevision: PrimerRevisionRecord
  ) => Promise<void>;
  onResolveCorrection: (
    request: PrimerCorrectionRequest,
    options: {
      resolutionNote: string;
      resolvedInRevision: PrimerRevisionRecord | null;
    }
  ) => Promise<void>;
  onReopenCorrection: (request: PrimerCorrectionRequest) => Promise<void>;
  onViewRevision: (revision: PrimerRevisionRecord) => void;
  onCompareRevisions: (left: PrimerRevisionRecord, right: PrimerRevisionRecord) => void;
}

const STATUS_DISPLAY: Record<
  CorrectionRequestStatus,
  { label: string; textClass: string; borderClass: string }
> = {
  open: {
    label: 'Open — Revision Required',
    textClass: 'text-rose-800',
    borderClass: 'border-rose-300 bg-rose-50/40',
  },
  'draft-in-progress': {
    label: 'Draft Copy In Progress',
    textClass: 'text-amber-900',
    borderClass: 'border-amber-300 bg-amber-50/40',
  },
  resolved: {
    label: 'Resolved in New Revision',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-300 bg-emerald-50/40',
  },
  reopened: {
    label: 'Reopened',
    textClass: 'text-rose-800',
    borderClass: 'border-rose-300 bg-rose-50/40',
  },
};

export const PrimerCorrectionRequestsPanel: React.FC<
  PrimerCorrectionRequestsPanelProps
> = ({
  activeEventId,
  revisions,
  requests,
  viewingRevision,
  activeBaseRevision,
  preselectedTarget,
  onCreateCorrectionRequest,
  onStartDraftCorrection,
  onResolveCorrection,
  onReopenCorrection,
  onViewRevision,
  onCompareRevisions,
}) => {
  const [composerOpen, setComposerOpen] = useState(false);
  const [targetKey, setTargetKey] = useState(
    `${PRIMER_SECTION_AND_FIGURE_TARGETS[0].targetKind}:${PRIMER_SECTION_AND_FIGURE_TARGETS[0].targetId}`
  );
  const [summaryInput, setSummaryInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [authorInput, setAuthorInput] = useState('Duty Seismologist (Unverified)');
  const [submitting, setSubmitting] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'resolved'>('all');
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [resolutionRevIds, setResolutionRevIds] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!preselectedTarget) return;
    setTargetKey(`${preselectedTarget.targetKind}:${preselectedTarget.targetId}`);
    setComposerOpen(true);
    setErrorMsg(null);
  }, [preselectedTarget]);

  const eventRequests = useMemo(
    () =>
      requests
        .filter((r) => r.eventId === activeEventId)
        .sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc)),
    [requests, activeEventId]
  );

  const visibleRequests = useMemo(() => {
    if (filterMode === 'active') {
      return eventRequests.filter((r) => r.status !== 'resolved');
    }
    if (filterMode === 'resolved') {
      return eventRequests.filter((r) => r.status === 'resolved');
    }
    return eventRequests;
  }, [eventRequests, filterMode]);

  const counts = useMemo(() => {
    const open = eventRequests.filter(
      (r) => r.status === 'open' || r.status === 'reopened'
    ).length;
    const inProgress = eventRequests.filter(
      (r) => r.status === 'draft-in-progress'
    ).length;
    const resolved = eventRequests.filter((r) => r.status === 'resolved').length;
    return { total: eventRequests.length, open, inProgress, resolved };
  }, [eventRequests]);

  const anchorRevision = viewingRevision ?? activeBaseRevision ?? null;

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summaryInput.trim() || submitting) return;
    const spec =
      PRIMER_SECTION_AND_FIGURE_TARGETS.find(
        (t) => `${t.targetKind}:${t.targetId}` === targetKey
      ) ?? PRIMER_SECTION_AND_FIGURE_TARGETS[0];

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onCreateCorrectionRequest({
        targetKind: spec.targetKind,
        targetId: spec.targetId,
        targetLabel: spec.targetLabel,
        summary: summaryInput,
        reason: reasonInput,
        requestedByLabel: authorInput,
      });
      setSummaryInput('');
      setReasonInput('');
      setComposerOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveClick = async (req: PrimerCorrectionRequest) => {
    const note = (resolutionNotes[req.requestId] ?? '').trim();
    if (!note) {
      setErrorMsg(
        'Enter a resolution note describing the corrective revision before closing the Correction Request.'
      );
      return;
    }
    const candidateRevs = revisions.filter(
      (r) =>
        r.primerDocumentId === req.primerDocumentId &&
        r.revisionId !== req.sourceRevisionId
    );
    const chosenRevId =
      resolutionRevIds[req.requestId] ?? candidateRevs[0]?.revisionId ?? '';
    const resolvedRev =
      candidateRevs.find((r) => r.revisionId === chosenRevId) ?? null;

    setErrorMsg(null);
    try {
      await onResolveCorrection(req, {
        resolutionNote: note,
        resolvedInRevision: resolvedRev,
      });
      setResolutionNotes((prev) => {
        const next = { ...prev };
        delete next[req.requestId];
        return next;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section
      aria-label="Correction Requests Workflow"
      className="border border-slate-300 rounded-xs bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Flag className="w-4 h-4 text-rose-700 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Correction Requests Workflow
            </h3>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-600">
              {counts.open} open · {counts.inProgress} draft in progress · {counts.resolved} resolved
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Flagging a section or figure creates a checksummed Correction Request anchored to the original frozen revision snapshot so historical data cannot be silently altered.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded-xs border border-slate-300 bg-slate-100 p-0.5 text-[11px]">
            {(
              [
                ['all', `All (${counts.total})`],
                ['active', `Active (${counts.open + counts.inProgress})`],
                ['resolved', `Resolved (${counts.resolved})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterMode(k)}
                className={`px-2 py-0.5 rounded-xs font-semibold whitespace-nowrap cursor-pointer ${
                  filterMode === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs bg-rose-700 text-white text-[11px] font-semibold hover:bg-rose-800 whitespace-nowrap cursor-pointer"
          >
            <Flag className="w-3 h-3" />
            <span>{composerOpen ? 'Close Composer' : 'Flag Section for Correction'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="px-3.5 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-[11px] font-semibold underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Flag for Correction Composer */}
      {composerOpen && (
        <form
          onSubmit={(e) => void handleSubmitCreate(e)}
          className="p-3.5 bg-rose-50/40 border-b border-slate-200 space-y-2.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700">
            <span className="font-semibold text-slate-900">
              New Correction Request (Non-Destructive Snapshot Link)
            </span>
            <span className="font-mono tabular-nums text-slate-600">
              {anchorRevision
                ? `Links back to Rev #${anchorRevision.revisionNumber} (${anchorRevision.revisionId})`
                : 'Auto-captures immutable baseline Rev #1 snapshot before flagging'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="corr-target-select"
                className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
              >
                Flagged Section or Figure
              </label>
              <select
                id="corr-target-select"
                value={targetKey}
                onChange={(e) => setTargetKey(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
              >
                {PRIMER_SECTION_AND_FIGURE_TARGETS.map((opt) => (
                  <option
                    key={`${opt.targetKind}:${opt.targetId}`}
                    value={`${opt.targetKind}:${opt.targetId}`}
                  >
                    {opt.targetLabel}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="corr-author-input"
                className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
              >
                Requested By (Unverified Label)
              </label>
              <input
                id="corr-author-input"
                type="text"
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="corr-summary-input"
              className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
            >
              Correction Summary
            </label>
            <input
              id="corr-summary-input"
              type="text"
              value={summaryInput}
              onChange={(e) => setSummaryInput(e.target.value)}
              placeholder="e.g., Update tectonic generator caveat to note offshore fault uncertainty..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
            />
          </div>

          <div>
            <label
              htmlFor="corr-reason-input"
              className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
            >
              Detailed Scientific / Editorial Reason (Optional)
            </label>
            <textarea
              id="corr-reason-input"
              rows={2}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="Specify exact parameters, figure layers, or narrative text requiring a new draft revision..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              className="px-2.5 py-1 border border-slate-300 rounded-xs bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!summaryInput.trim() || submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xs bg-rose-700 text-white text-[11px] font-semibold hover:bg-rose-800 disabled:opacity-50 cursor-pointer"
            >
              <Flag className="w-3 h-3" />
              <span>
                {submitting ? 'Generating Record...' : 'Generate Correction Request'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Request Feed */}
      {visibleRequests.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500">
          No correction requests recorded for this event. Click <strong>Flag for Correction</strong> on any section or figure to initiate a tracked revision workflow.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 max-h-[380px] overflow-y-auto">
          {visibleRequests.map((req) => {
            const st = STATUS_DISPLAY[req.status];
            const integrity = verifyOriginalSnapshotIntegrity(req, revisions);
            const newerSameDocRevs = revisions
              .filter(
                (r) =>
                  r.primerDocumentId === req.primerDocumentId &&
                  r.revisionId !== req.sourceRevisionId
              )
              .sort((a, b) => b.revisionNumber - a.revisionNumber);
            const resolvedRevisionObj = req.resolvedInRevisionId
              ? revisions.find((r) => r.revisionId === req.resolvedInRevisionId) ?? null
              : null;

            return (
              <div key={req.requestId} className="p-3.5 bg-white space-y-2 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-bold ${st.textClass}`}>
                        {st.label}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-semibold text-slate-900">
                        {req.targetLabel}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-[10.5px] text-slate-500">
                        {req.requestId}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-[10.5px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-500" />
                        Original Snapshot: Rev #{req.sourceRevisionNumber} ({req.sourceRevisionId})
                      </span>
                      <span>Checksum: {req.sourceRevisionChecksum.slice(0, 12)}</span>
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          integrity.status === 'verified'
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        <ShieldCheck className="w-3 h-3" />
                        {integrity.status === 'verified'
                          ? 'Original Snapshot Intact'
                          : integrity.status === 'missing-snapshot'
                            ? 'Original Snapshot Missing'
                            : 'Checksum Mismatch'}
                      </span>
                    </div>
                  </div>

                  <div className="font-mono tabular-nums text-[10.5px] text-slate-500 shrink-0">
                    {req.createdAtPst} · {req.requestedByLabel}
                  </div>
                </div>

                <div className="text-xs text-slate-900 font-medium">
                  {req.summary}
                </div>
                {req.reason && req.reason !== req.summary && (
                  <p className="text-[11px] text-slate-700 whitespace-pre-wrap">
                    {req.reason}
                  </p>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded-xs px-2.5 py-1.5 text-[11px] text-slate-600">
                  <strong className="text-slate-700">
                    Original Snapshot Excerpt (Rev #{req.sourceRevisionNumber}):
                  </strong>{' '}
                  <span className="italic">{req.originalContentExcerpt}</span>
                </div>

                {/* Actions Row */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {integrity.sourceRevision && (
                    <button
                      type="button"
                      onClick={() => onViewRevision(integrity.sourceRevision!)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect Rev #{req.sourceRevisionNumber} Snapshot</span>
                    </button>
                  )}

                  {integrity.sourceRevision &&
                    (req.status === 'open' || req.status === 'reopened') && (
                      <button
                        type="button"
                        onClick={() =>
                          void onStartDraftCorrection(req, integrity.sourceRevision!)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-[#005a94] bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>
                          Create Draft Copy from Rev #{req.sourceRevisionNumber}
                        </span>
                      </button>
                    )}

                  {integrity.sourceRevision && resolvedRevisionObj && (
                    <button
                      type="button"
                      onClick={() =>
                        onCompareRevisions(integrity.sourceRevision!, resolvedRevisionObj)
                      }
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                    >
                      <GitCompare className="w-3 h-3" />
                      <span>
                        Compare Rev #{req.sourceRevisionNumber} vs Rev #
                        {resolvedRevisionObj.revisionNumber}
                      </span>
                    </button>
                  )}
                </div>

                {/* Resolve Form for Open / Draft-In-Progress */}
                {req.status !== 'resolved' ? (
                  <div className="border-t border-slate-200 pt-2 flex flex-wrap items-center gap-2">
                    {newerSameDocRevs.length > 0 && (
                      <select
                        aria-label={`Resolved revision for ${req.requestId}`}
                        value={
                          resolutionRevIds[req.requestId] ??
                          newerSameDocRevs[0]?.revisionId ??
                          ''
                        }
                        onChange={(e) =>
                          setResolutionRevIds((prev) => ({
                            ...prev,
                            [req.requestId]: e.target.value,
                          }))
                        }
                        className="px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                      >
                        {newerSameDocRevs.map((rev) => (
                          <option key={rev.revisionId} value={rev.revisionId}>
                            Resolved in Rev #{rev.revisionNumber} ({rev.createdAtPst})
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      type="text"
                      value={resolutionNotes[req.requestId] ?? ''}
                      onChange={(e) =>
                        setResolutionNotes((prev) => ({
                          ...prev,
                          [req.requestId]: e.target.value,
                        }))
                      }
                      placeholder={
                        newerSameDocRevs.length > 0
                          ? 'Resolution note explaining verified changes...'
                          : 'Save a new revision from Working Draft or enter verification note to resolve...'
                      }
                      className="flex-1 min-w-[220px] px-2.5 py-1 text-[11px] bg-slate-50 border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                    />

                    <button
                      type="button"
                      onClick={() => void handleResolveClick(req)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-emerald-700 text-white text-[11px] font-semibold hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Resolve Request</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xs px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-950">
                    <div>
                      <strong>Resolution Note:</strong> {req.resolutionNote}
                      {req.resolvedInRevisionNumber !== null && (
                        <span className="ml-1.5 font-mono text-[10.5px]">
                          · Linked Revision: Rev #{req.resolvedInRevisionNumber} (
                          {req.resolvedInRevisionId})
                        </span>
                      )}
                      <span className="ml-1.5 font-mono text-[10px] text-emerald-800">
                        ({req.resolvedAtPst})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onReopenCorrection(req)}
                      className="px-2 py-0.5 rounded-xs border border-emerald-400 bg-white text-emerald-900 font-semibold hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
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
    </section>
  );
};
