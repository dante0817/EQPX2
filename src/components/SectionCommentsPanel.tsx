import React, { useMemo, useState } from 'react';
import {
  Edit3,
  FileText,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react';
import type { PrimerDocument } from '../utils/earthquakePrimer';
import {
  getSectionComments,
  getSectionCommentsForTarget,
  PRIMER_SECTION_AND_FIGURE_TARGETS,
  resolveWorkingDraftRevisionBinding,
  type PrimerSectionComment,
  type SectionCommentCategory,
  type SectionCommentTargetKind,
} from '../utils/primerSectionComments';

const CATEGORY_LABELS: Record<SectionCommentCategory, string> = {
  'general-note': 'Review Note',
  'missing-evidence': 'Missing Evidence',
  'correction-request': 'Correction Linked',
};

export interface InlineSectionCommentDrawerProps {
  primer: PrimerDocument;
  targetKind: SectionCommentTargetKind;
  targetId: string;
  targetLabel: string;
  isReadOnlySnapshot: boolean;
  viewingRevisionNumber?: number | null;
  viewingRevisionId?: string | null;
  onAddComment: (input: {
    targetKind: SectionCommentTargetKind;
    targetId: string;
    targetLabel: string;
    category: SectionCommentCategory;
    body: string;
  }) => void;
  onEditComment: (commentId: string, nextBody: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export const InlineSectionCommentDrawer: React.FC<InlineSectionCommentDrawerProps> = ({
  primer,
  targetKind,
  targetId,
  targetLabel,
  isReadOnlySnapshot,
  viewingRevisionNumber = null,
  viewingRevisionId = null,
  onAddComment,
  onEditComment,
  onDeleteComment,
}) => {
  const [draftBody, setDraftBody] = useState('');
  const [draftCategory, setDraftCategory] =
    useState<SectionCommentCategory>('general-note');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  const comments = useMemo(
    () => getSectionCommentsForTarget(primer, targetKind, targetId),
    [primer, targetKind, targetId]
  );

  const binding = useMemo(
    () => resolveWorkingDraftRevisionBinding(primer),
    [primer]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlySnapshot || !draftBody.trim()) return;
    onAddComment({
      targetKind,
      targetId,
      targetLabel,
      category: draftCategory,
      body: draftBody,
    });
    setDraftBody('');
  };

  const startEdit = (cmt: PrimerSectionComment) => {
    if (isReadOnlySnapshot || cmt.isSnapshotImmutable) return;
    setEditingCommentId(cmt.commentId);
    setEditingBody(cmt.body);
  };

  const commitEdit = (commentId: string) => {
    if (!editingBody.trim()) return;
    onEditComment(commentId, editingBody);
    setEditingCommentId(null);
    setEditingBody('');
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50/80 px-3.5 py-2.5 space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-800">
          <MessageSquare className="w-3.5 h-3.5 text-[#005a94] shrink-0" />
          <span>Section Comments ({comments.length})</span>
        </div>
        <div className="font-mono tabular-nums text-[10.5px] text-slate-600">
          {isReadOnlySnapshot && viewingRevisionId ? (
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Lock className="w-3 h-3 text-slate-500" />
              Immutable Snapshot Rev #{viewingRevisionNumber} ({viewingRevisionId})
            </span>
          ) : (
            <span>
              Bound Revision ID:{' '}
              <strong className="text-slate-800">{binding.boundRevisionId}</strong>
              {binding.boundRevisionNumber !== null
                ? ` (Rev #${binding.boundRevisionNumber})`
                : ' (freezes on Save New Revision)'}
            </span>
          )}
        </div>
      </div>

      {!isReadOnlySnapshot && (
        <form onSubmit={handleSubmit} className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`Comment type for ${targetLabel}`}
              value={draftCategory}
              onChange={(e) =>
                setDraftCategory(e.target.value as SectionCommentCategory)
              }
              className="px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
            >
              <option value="general-note">Review Note</option>
              <option value="missing-evidence">Missing Evidence Note</option>
            </select>
            <input
              type="text"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder={`Add note for ${targetLabel}...`}
              className="flex-1 min-w-[200px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
            />
            <button
              type="submit"
              disabled={!draftBody.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquarePlus className="w-3 h-3" />
              <span>Add Note</span>
            </button>
          </div>
        </form>
      )}

      {comments.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic">
          No section notes recorded for {targetLabel} yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {comments.map((cmt) => {
            const locked =
              isReadOnlySnapshot ||
              cmt.isSnapshotImmutable ||
              Boolean(cmt.frozenInRevisionId);
            const isEditing = editingCommentId === cmt.commentId;

            return (
              <div
                key={cmt.commentId}
                className="bg-white border border-slate-200 rounded-xs px-2.5 py-2 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
                    <span className="font-semibold text-slate-800">
                      {CATEGORY_LABELS[cmt.category]}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums text-slate-600">
                      Rev ID: {cmt.boundRevisionId}
                      {cmt.boundRevisionNumber !== null
                        ? ` (Rev #${cmt.boundRevisionNumber})`
                        : ''}
                    </span>
                    {locked && (
                      <>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                          <Lock className="w-2.5 h-2.5 text-slate-500" />
                          <span>
                            Immutable Snapshot
                            {cmt.frozenInRevisionNumber !== null
                              ? ` (Rev #${cmt.frozenInRevisionNumber})`
                              : ''}
                          </span>
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums text-slate-500">
                      {cmt.updatedAtPst} · {cmt.authorLabel}
                    </span>
                    {!locked && !isEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(cmt)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 border border-slate-300 rounded-xs text-[10.5px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="Edit draft note"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteComment(cmt.commentId)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 border border-rose-200 rounded-xs text-[10.5px] font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                          title="Delete draft note"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-1.5 pt-1">
                    <textarea
                      rows={2}
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditingBody('');
                        }}
                        className="px-2 py-0.5 border border-slate-300 rounded-xs text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!editingBody.trim()}
                        onClick={() => commitEdit(cmt.commentId)}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export interface SectionCommentsPanelProps {
  primer: PrimerDocument;
  isReadOnlySnapshot: boolean;
  viewingRevisionNumber?: number | null;
  viewingRevisionId?: string | null;
  onAddComment: (input: {
    targetKind: SectionCommentTargetKind;
    targetId: string;
    targetLabel: string;
    category: SectionCommentCategory;
    body: string;
  }) => void;
  onEditComment: (commentId: string, nextBody: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export const SectionCommentsPanel: React.FC<SectionCommentsPanelProps> = ({
  primer,
  isReadOnlySnapshot,
  viewingRevisionNumber = null,
  viewingRevisionId = null,
  onAddComment,
  onEditComment,
  onDeleteComment,
}) => {
  const [filterKind, setFilterKind] = useState<'all' | 'section' | 'figure'>('all');
  const [selectedTargetKey, setSelectedTargetKey] = useState(
    `${PRIMER_SECTION_AND_FIGURE_TARGETS[0].targetKind}:${PRIMER_SECTION_AND_FIGURE_TARGETS[0].targetId}`
  );
  const [noteCategory, setNoteCategory] =
    useState<SectionCommentCategory>('general-note');
  const [noteBody, setNoteBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  const allComments = useMemo(() => getSectionComments(primer), [primer]);
  const binding = useMemo(() => resolveWorkingDraftRevisionBinding(primer), [primer]);

  const filteredComments = useMemo(() => {
    if (filterKind === 'all') return allComments;
    return allComments.filter((c) => c.targetKind === filterKind);
  }, [allComments, filterKind]);

  const immutableCount = allComments.filter(
    (c) => c.isSnapshotImmutable || Boolean(c.frozenInRevisionId)
  ).length;
  const mutableCount = allComments.length - immutableCount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlySnapshot || !noteBody.trim()) return;
    const spec =
      PRIMER_SECTION_AND_FIGURE_TARGETS.find(
        (t) => `${t.targetKind}:${t.targetId}` === selectedTargetKey
      ) ?? PRIMER_SECTION_AND_FIGURE_TARGETS[0];
    onAddComment({
      targetKind: spec.targetKind,
      targetId: spec.targetId,
      targetLabel: spec.targetLabel,
      category: noteCategory,
      body: noteBody,
    });
    setNoteBody('');
  };

  return (
    <section
      aria-label="Section Comments"
      className="border border-slate-300 rounded-xs bg-white overflow-hidden"
    >
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#005a94] shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Section Comments &amp; Figure Notes
            </h3>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-600">
              {allComments.length} total ({mutableCount} draft · {immutableCount} snapshot-locked)
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Attach, edit, or delete notes on any section or figure. Saving a revision snapshot freezes all attached notes under that Revision ID so historical comments remain immutable.
          </p>
        </div>

        <div className="inline-flex rounded-xs border border-slate-300 bg-slate-100 p-0.5 text-[11px] shrink-0">
          {(
            [
              ['all', `All (${allComments.length})`],
              ['section', `Sections (${allComments.filter((c) => c.targetKind === 'section').length})`],
              ['figure', `Figures (${allComments.filter((c) => c.targetKind === 'figure').length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterKind(key)}
              className={`px-2 py-0.5 rounded-xs font-semibold whitespace-nowrap cursor-pointer ${
                filterKind === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Add Note Bar (Disabled when viewing immutable snapshot) */}
      {isReadOnlySnapshot ? (
        <div className="px-3.5 py-2 bg-amber-50/70 border-b border-amber-200 text-[11px] text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>
              Viewing frozen snapshot{' '}
              <strong className="font-mono">
                Rev #{viewingRevisionNumber} ({viewingRevisionId})
              </strong>
              . Existing snapshot comments are immutable; use Flag for Correction or return to Working Draft to record new notes.
            </span>
          </span>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="p-3 bg-slate-50/50 border-b border-slate-200 space-y-2 text-xs"
        >
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px_auto] gap-2 items-center">
            <select
              aria-label="Select section or figure for note"
              value={selectedTargetKey}
              onChange={(e) => setSelectedTargetKey(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
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

            <select
              aria-label="Note category"
              value={noteCategory}
              onChange={(e) =>
                setNoteCategory(e.target.value as SectionCommentCategory)
              }
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
            >
              <option value="general-note">Review Note</option>
              <option value="missing-evidence">Missing Evidence Note</option>
            </select>

            <div className="font-mono tabular-nums text-[10.5px] text-slate-600 px-1">
              Rev ID: {binding.boundRevisionId}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Write a section or figure comment linked to this primer revision..."
              className="flex-1 min-w-[240px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
            />
            <button
              type="submit"
              disabled={!noteBody.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Add Section Comment</span>
            </button>
          </div>
        </form>
      )}

      {filteredComments.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500">
          No section or figure comments recorded in this view. Use the Section Comments button on any section/figure or add a note above.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 max-h-[300px] overflow-y-auto">
          {filteredComments.map((cmt) => {
            const locked =
              isReadOnlySnapshot ||
              cmt.isSnapshotImmutable ||
              Boolean(cmt.frozenInRevisionId);
            const isEditing = editingId === cmt.commentId;

            return (
              <div key={cmt.commentId} className="p-3 bg-white space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="font-semibold text-slate-900">
                      {cmt.targetLabel}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-[11px] font-medium text-slate-600">
                      {CATEGORY_LABELS[cmt.category]}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="font-mono tabular-nums text-[10.5px] text-slate-600">
                      Rev ID: {cmt.boundRevisionId}
                      {cmt.boundRevisionNumber !== null
                        ? ` (Rev #${cmt.boundRevisionNumber})`
                        : ''}
                    </span>
                    {locked && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-slate-700">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span>
                          Immutable
                          {cmt.frozenInRevisionNumber !== null
                            ? ` in Rev #${cmt.frozenInRevisionNumber}`
                            : ' Snapshot'}
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums text-[10.5px] text-slate-500">
                      {cmt.updatedAtPst}
                    </span>
                    {!locked && !isEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(cmt.commentId);
                            setEditingBody(cmt.body);
                          }}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 border border-slate-300 rounded-xs text-[10.5px] font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteComment(cmt.commentId)}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 border border-rose-200 rounded-xs text-[10.5px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-1.5 pt-1">
                    <textarea
                      rows={2}
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingBody('');
                        }}
                        className="px-2.5 py-1 border border-slate-300 rounded-xs text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!editingBody.trim()}
                        onClick={() => {
                          if (!editingBody.trim()) return;
                          onEditComment(cmt.commentId, editingBody);
                          setEditingId(null);
                          setEditingBody('');
                        }}
                        className="px-3 py-1 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] disabled:opacity-50 cursor-pointer"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {cmt.body}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
