import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_EVENTS, type EQPEvent } from '../src/data/eqpData';
import {
  DEFAULT_PRIMER_ELIGIBILITY_RULES,
  generateInitialEarthquakePrimer,
} from '../src/utils/earthquakePrimer';
import { DEFAULT_PRIMER_MAP_LAYERS } from '../src/utils/primerMapFigure';
import {
  createPrimerRevisionRecord,
  restoreRevisionAsNewWorkingDraft,
  verifyPrimerRevisionChecksum,
} from '../src/utils/primerRevisions';
import {
  addSectionCommentToDraft,
  deleteSectionCommentFromDraft,
  editSectionCommentInDraft,
  getSectionComments,
  getSectionCommentsForTarget,
} from '../src/utils/primerSectionComments';
import {
  addPrimerReviewComment,
  createPrimerReviewRecord,
  deletePrimerReviewComment,
  editPrimerReviewComment,
  resolveCorrectionRequest,
  verifyPrimerReviewChecksum,
} from '../src/utils/primerReviews';
import {
  createCorrectionRequestRecord,
  createMemoryCorrectionRequestStore,
  markCorrectionDraftStarted,
  reopenCorrectionRequestItem,
  resolveCorrectionRequestItem,
  verifyCorrectionRequestChecksum,
  verifyOriginalSnapshotIntegrity,
} from '../src/utils/primerCorrectionRequests';

function createSampleDraft() {
  const ev: EQPEvent = structuredClone(INITIAL_EVENTS[0]);
  return generateInitialEarthquakePrimer(ev, {
    trigger: 'manual',
    rules: DEFAULT_PRIMER_ELIGIBILITY_RULES,
    primaryLocationLabel: '014 km N 32° E of General Luna (Surigao del Norte)',
    faultGeneratorLabel: 'Philippine Trench Segment',
    figureOptions: {
      extent: 'regional',
      theme: 'classic',
      layers: DEFAULT_PRIMER_MAP_LAYERS,
    },
  });
}

test('Section Comments: add, edit, delete on draft sections/figures, then freeze immutably in revision snapshot', () => {
  let draft = createSampleDraft();

  // Add notes linked to a section and a figure
  draft = addSectionCommentToDraft(draft, {
    targetKind: 'section',
    targetId: 'tectonic_setting',
    category: 'general-note',
    body: 'Initial note on Philippine Trench proximity.',
    authorLabel: 'Analyst A',
  });
  draft = addSectionCommentToDraft(draft, {
    targetKind: 'figure',
    targetId: 'epicenter',
    category: 'missing-evidence',
    body: 'Verify epicenter map scale bar and fault trace labels.',
    authorLabel: 'Analyst A',
  });

  assert.equal(getSectionComments(draft).length, 2);
  assert.equal(getSectionCommentsForTarget(draft, 'figure', 'epicenter').length, 1);

  const secComment = getSectionCommentsForTarget(draft, 'section', 'tectonic_setting')[0];
  assert.ok(secComment.boundRevisionId.startsWith('draft:'));
  assert.equal(secComment.isSnapshotImmutable, false);

  // Edit mutable draft note
  draft = editSectionCommentInDraft(
    draft,
    secComment.commentId,
    'Updated note: add depth uncertainty caveat for trench slab.'
  );
  assert.equal(
    getSectionCommentsForTarget(draft, 'section', 'tectonic_setting')[0].body,
    'Updated note: add depth uncertainty caveat for trench slab.'
  );

  // Delete mutable figure note
  const figComment = getSectionCommentsForTarget(draft, 'figure', 'epicenter')[0];
  draft = deleteSectionCommentFromDraft(draft, figComment.commentId);
  assert.equal(getSectionComments(draft).length, 1);

  // Save Revision #1 -> freezes attached comments & binds them to rev1.revisionId
  const { revision: rev1, updatedWorkingDraft } = createPrimerRevisionRecord(draft, {
    description: 'Snapshot Rev #1 with section note',
    existingRevisions: [],
  });

  assert.equal(verifyPrimerRevisionChecksum(rev1), true);
  const snapComments = getSectionComments(rev1.snapshot);
  assert.equal(snapComments.length, 1);
  assert.equal(snapComments[0].boundRevisionId, rev1.revisionId);
  assert.equal(snapComments[0].boundRevisionNumber, 1);
  assert.equal(snapComments[0].isSnapshotImmutable, true);
  assert.equal(snapComments[0].frozenInRevisionId, rev1.revisionId);
  assert.equal(Object.isFrozen(rev1.snapshot.extensions?.sectionComments), true);
  assert.equal(Object.isFrozen(snapComments[0]), true);

  // Frozen snapshot rejects direct mutation
  assert.throws(
    () => editSectionCommentInDraft(rev1.snapshot, snapComments[0].commentId, 'Tamper'),
    /frozen/i
  );
  assert.throws(
    () => deleteSectionCommentFromDraft(rev1.snapshot, snapComments[0].commentId),
    /frozen/i
  );

  // Even on updatedWorkingDraft & restored draft, comments frozen in Rev #1 remain immutable
  assert.throws(
    () =>
      editSectionCommentInDraft(
        updatedWorkingDraft,
        snapComments[0].commentId,
        'Silent historical edit'
      ),
    /immutable/i
  );
  assert.throws(
    () => deleteSectionCommentFromDraft(updatedWorkingDraft, snapComments[0].commentId),
    /immutable/i
  );

  // New notes added after Rev #1 are mutable and bound to Rev #1 until Rev #2 freezes them
  let draftForRev2 = addSectionCommentToDraft(updatedWorkingDraft, {
    targetKind: 'figure',
    targetId: 'epicenter',
    body: 'New note added for Rev #2 preparation.',
  });
  const rev2Notes = getSectionComments(draftForRev2);
  assert.equal(rev2Notes.length, 2);
  const newDraftNote = rev2Notes.find((c) => !c.isSnapshotImmutable);
  assert.ok(newDraftNote);
  assert.equal(newDraftNote.boundRevisionId, rev1.revisionId);

  draftForRev2 = editSectionCommentInDraft(
    draftForRev2,
    newDraftNote.commentId,
    'Edited Rev #2 prep note.'
  );
  assert.equal(
    getSectionComments(draftForRev2).find((c) => c.commentId === newDraftNote.commentId)?.body,
    'Edited Rev #2 prep note.'
  );
  assert.equal(rev1.snapshot.extensions?.sectionComments?.length, 1);
  assert.equal(verifyPrimerRevisionChecksum(rev1), true);
});

test('Review Record Comments: edit & delete respect snapshot lock and resolved correction guards', () => {
  const draft = createSampleDraft();
  const { revision: rev1 } = createPrimerRevisionRecord(draft, {
    description: 'Rev #1 for review edit/delete test',
  });

  let review = createPrimerReviewRecord(rev1, { reviewerLabel: 'Reviewer B' });
  review = addPrimerReviewComment(review, {
    targetKind: 'section',
    targetId: 'overview',
    targetLabel: 'Section 1: Overview & Event Parameters',
    category: 'general-note',
    body: 'Verify PST time formatting.',
  });
  const noteId = review.comments[0].commentId;
  assert.equal(review.comments[0].boundRevisionId, rev1.revisionId);

  // Edit active review note
  review = editPrimerReviewComment(review, noteId, {
    body: 'Verified PST and UTC timestamps.',
  });
  assert.equal(review.comments[0].body, 'Verified PST and UTC timestamps.');
  assert.ok(verifyPrimerReviewChecksum(review));

  // Snapshot lock prevents edit/delete
  assert.throws(
    () =>
      editPrimerReviewComment(
        review,
        noteId,
        { body: 'Should fail' },
        { isSnapshotLocked: true }
      ),
    /immutable historical review snapshot/i
  );
  assert.throws(
    () => deletePrimerReviewComment(review, noteId, { isSnapshotLocked: true }),
    /immutable historical review snapshot/i
  );

  // Delete unlocked general note
  review = deletePrimerReviewComment(review, noteId);
  assert.equal(review.comments.length, 0);

  // Resolved correction request cannot be edited or deleted silently
  review = addPrimerReviewComment(review, {
    targetKind: 'section',
    targetId: 'location',
    targetLabel: 'Section 2: Location & Geographic Context',
    category: 'correction-request',
    body: 'Update bearing distance from Guiuan.',
  });
  const corrId = review.comments[0].commentId;
  review = resolveCorrectionRequest(review, corrId, 'Updated in Rev #2.');
  assert.throws(
    () => editPrimerReviewComment(review, corrId, { body: 'Silent change' }),
    /reopen it first/i
  );
  assert.throws(() => deletePrimerReviewComment(review, corrId), /audit trail/i);
});

test('Correction Requests Workflow: links back to original snapshot, creates draft copy, prevents silent historical edits, resolves in Rev #2', async () => {
  const draft1 = createSampleDraft();
  const { revision: rev1 } = createPrimerRevisionRecord(draft1, {
    description: 'Baseline Rev #1',
    existingRevisions: [],
  });
  const rev1ChecksumBefore = rev1.contentChecksum;

  const store = createMemoryCorrectionRequestStore();

  // Flag Section 5 on Rev #1 for correction
  let req = createCorrectionRequestRecord(rev1, {
    targetKind: 'section',
    targetId: 'tectonic_setting',
    summary: 'Clarify fault association non-causality',
    reason: 'Specify that nearest mapped fault trace does not establish focal plane.',
    requestedByLabel: 'Senior Duty Analyst',
  });

  assert.equal(req.sourceRevisionId, rev1.revisionId);
  assert.equal(req.sourceRevisionNumber, 1);
  assert.equal(req.sourceRevisionChecksum, rev1ChecksumBefore);
  assert.equal(req.status, 'open');
  assert.ok(req.originalContentExcerpt.length > 0);
  assert.equal(verifyCorrectionRequestChecksum(req), true);

  await store.saveRequest(req);
  const loaded = await store.listRequests();
  assert.equal(loaded.length, 1);

  // Verify original snapshot remains unmodified
  const integrity1 = verifyOriginalSnapshotIntegrity(req, [rev1]);
  assert.equal(integrity1.status, 'verified');
  assert.equal(verifyPrimerRevisionChecksum(rev1), true);

  // Cannot resolve against the unchanged original Rev #1 snapshot
  assert.throws(
    () =>
      resolveCorrectionRequestItem(req, {
        resolutionNote: 'Attempted silent resolution without new revision',
        resolvedInRevision: rev1,
      }),
    /must resolve in a new revision snapshot/i
  );

  // Create draft copy from Rev #1 without touching Rev #1
  const draftCopy = restoreRevisionAsNewWorkingDraft(rev1);
  req = markCorrectionDraftStarted(req, draftCopy.id);
  assert.equal(req.status, 'draft-in-progress');
  assert.equal(req.restoredDraftPrimerId, draftCopy.id);

  // Edit draft copy & save Rev #2
  draftCopy.sections = draftCopy.sections.map((s) =>
    s.id === 'tectonic_setting'
      ? {
          ...s,
          content: `${s.content}\n\nNote: Proximity does not confirm causative rupture.`,
          isEdited: true,
        }
      : s
  );
  const { revision: rev2 } = createPrimerRevisionRecord(draftCopy, {
    existingRevisions: [rev1],
    description: 'Rev #2 addressing tectonic caveat correction request',
  });
  assert.equal(rev2.revisionNumber, 2);
  assert.notEqual(rev2.contentChecksum, rev1.contentChecksum);

  // Empty resolution note rejected
  assert.throws(
    () =>
      resolveCorrectionRequestItem(req, {
        resolutionNote: '   ',
        resolvedInRevision: rev2,
      }),
    /mandatory resolution note/i
  );

  // Resolve cleanly against Rev #2
  req = resolveCorrectionRequestItem(req, {
    resolutionNote: 'Added explicit non-causality caveat in Rev #2.',
    resolvedInRevision: rev2,
  });
  assert.equal(req.status, 'resolved');
  assert.equal(req.resolvedInRevisionId, rev2.revisionId);
  assert.equal(req.resolvedInRevisionNumber, 2);
  assert.equal(verifyCorrectionRequestChecksum(req), true);

  // Original Rev #1 stays completely untouched and intact
  const integrityAfter = verifyOriginalSnapshotIntegrity(req, [rev1, rev2]);
  assert.equal(integrityAfter.status, 'verified');
  assert.equal(rev1.contentChecksum, rev1ChecksumBefore);

  // Reopen workflow
  req = reopenCorrectionRequestItem(req, 'Follow-up QA check needed.');
  assert.equal(req.status, 'reopened');
  assert.equal(req.reopenedCount, 1);
  assert.equal(verifyCorrectionRequestChecksum(req), true);
});
