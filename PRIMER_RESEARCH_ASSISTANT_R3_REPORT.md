# PRIMER Research Assistant — R3 Implementation & Verification Report

**Task:** Research Assistant R3 — Operator-Reviewed Scientific Finding Transfer, Provenance Integration, and Non-Destructive PRIMER Updates  
**References:** `PRIMER_RESEARCH_ASSISTANT_R0_AUDIT.md`, `PRIMER_RESEARCH_ASSISTANT_R1_REPORT.md`, `PRIMER_RESEARCH_ASSISTANT_R2_REPORT.md`  
**Stage Scope:** Operator-Reviewed Local Draft Transfer, Stage 4/5 Provenance Integration, Stage 6A/6B Drift Compatibility, and Append-Only Local Audit Logging

---

## 1. Files Created and Modified

### Newly Created Modules & Verification Suite
1. **`/src/utils/primerResearchTransfer.ts`**
   - Implements the complete R3 transfer domain engine:
     - `evaluateFindingTransferEligibility` evaluating all 10 required criteria (`linkedEqpEventId`, `eventMatchState` + `operatorResolution`, source availability/versioning, SHA-256 & locator integrity, evidence validation status, category destination mapping, critical scientific values & conflict flags, destination population & `isEdited` state, PLOT/event freshness, and officiality/local-source restrictions).
     - `R2_TO_STAGE4_MAPPING_REGISTRY` and `resolveFindingStage4Mapping` mapping eligible R2 finding categories directly onto existing `PrimerStage4ExternalData` fields while returning `NO SUPPORTED DIRECT TRANSFER` for unsupported or scientifically restricted categories.
     - `assessSourceOfficialAuthority` and `documentEventMatchResolution` enforcing strict anti-blind-domain-trust checks and preventing silent promotion of `probable-match` or override of `nonmatching-event`.
     - `formatScientificCandidateSummary` and `buildFindingTransferPreview` producing full Before/After diffs, allowed content states (`preliminary-review` vs gated `verified-fact`), conflict warnings, and edited-section protection notices.
     - `applyReviewedScientificFindingToPrimer` and `syncStage4NarrativeToEditedSection` performing non-destructive Stage 4 updates (`updatePrimerStage4Narratives(..., { syncSections: true, forceOverwriteEdited: false })`) and explicit single-section manual synchronization.
2. **`/src/utils/primerResearchTransferStore.ts`**
   - Implements isolated append-only IndexedDB persistence (`eqp_primer_research_transfers_v1`, object store `transfer_audit`) with an in-memory fallback (`createMemoryResearchTransferStore`) for headless tests.
   - Records `transfer-applied`, `transfer-rejected`, `event-match-resolved`, and `section-synced` events, supports per-event JSON export (`exportEventHistoryJson`), and provides hardened import validation (`validateAndImportTransferHistoryJson` using `safeJsonParseChecked` prototype-pollution checks and `sanitizeUntrustedTextValue`).
3. **`/tests/primerResearchR3.test.ts`**
   - Comprehensive verification suite covering all 15 R3 safety, eligibility, mapping, resolution, overwrite, duplicate, provenance, `isEdited`, Stage 6A/6B, frozen revision, offline/keyless, XSS/prototype-pollution, and non-institutional boundaries (structured across 12 test blocks).
4. **`/PRIMER_RESEARCH_ASSISTANT_R3_REPORT.md`**
   - This implementation and verification report.

### Modified Files
1. **`/src/utils/primerScientificNarratives.ts`**
   - Exported `PrimerR3TransferProvenanceLink` and added `r3TransferredSources?: PrimerR3TransferProvenanceLink[]` to `PrimerStage4ExternalData`.
   - Extended `buildPrimerStage4Narratives` to emit `PrimerProvenanceRecord` entries (`claimKey: r3.<sectionId>.<transferId>`) into `provenanceLedger` so Stage 5 reference lists and Stage 4 `inputFingerprint` automatically include R3 provenance.
2. **`/src/utils/primerRevisions.ts`**
   - Updated `detectPrimerSourceChanges` to inspect `monitoringResponse` and `r3TransferredSources` diffs and compare uninitialized Stage 4 baseline revisions against `createDefaultStage4ExternalData(liveContext.event)` when live Stage 4 data is supplied, ensuring Stage 6A source-drift alerts trigger consistently.
3. **`/src/utils/primerResearchAssistant.ts`**
   - Exported `ResearchEventMatchOperatorResolution` and added `operatorResolution?: ResearchEventMatchOperatorResolution` to `ResearchEventMatchDetails` without modifying `eventMatchState`.
4. **`/src/components/PrimerStage4Panel.tsx`**
   - Added `externalPkgFp` sync dependency so external R3 transfers applied to `activePrimer` immediately refresh live Stage 4 form state.
5. **`/src/components/PrimerGeneratorPanel.tsx`**
   - Added `handleSyncSectionToStage4Baseline` calling `syncStage4NarrativeToEditedSection` and appending `'section-synced'` audit logs.
   - Passed `activePrimer`, `faultGeneratorLabel`, `isPlotResultStale`, `onApplyTransferToPrimer`, and `onJumpToPrimerSection` into both `<PrimerResearchAssistantPanel>` mounts.
   - Added `id="primer-section-..."` anchors and an inline Stage 4/R3 baseline-update bar with an explicit **`Sync to Section`** button on manually edited sections (`isEdited: true`).
6. **`/src/components/PrimerResearchAssistantPanel.tsx`**
   - Integrated R3 eligibility bucket filters (`All`, `Eligible`, `Blocked`, `Applied`, `Superseded`, `Rejected`, `Unsupported`, `R3 History`), explicit Before/After transfer review & confirmation panel, inline **`Resolve Event Match`** form, **`Reject`** workflow, **`Open Section`** jump button, and R3 audit log JSON export.

---

## 2. Eligibility Rules, Blockers, Warnings & Event-Match Resolution

Before any finding can enter the confirmation flow, `evaluateFindingTransferEligibility` checks all 10 criteria:
1. **Linked Earthquake & Snapshot Immutability:** Blocks `linked-event-mismatch`, `primer-event-mismatch`, `no-active-primer-draft`, and `frozen-revision-immutable`.
2. **Event-Match Classification:**
   - `nonmatching-event` (or `excludedByNonMatchingEvent`) is permanently blocked (`event-match-nonmatching`).
   - `ambiguous-match` and `insufficient-evidence` are blocked (`event-match-unresolved`) unless an operator documents both a rationale and supporting evidence via `documentEventMatchResolution`, which records `operatorResolution` inside `source.eventMatchDetails` while preserving the original automated `eventMatchState` and blocking automatic `verified-fact` classification.
   - `probable-match` produces a visible warning (`event-match-probable-unverified`) and is never silently promoted to `confirmed-id-match`.
3. **Source Availability & Version Status:** Blocks `source-missing`, `source-archived`, `source-superseded-by-newer-version`, `finding-superseded`, `finding-relevance-excluded`, and `finding-rejected-by-operator`.
4. **Source Hash & Evidence Locator:** Blocks `source-hash-mismatch` (if extracted text SHA-256 drifted) and `missing-evidence-reference`.
5. **Evidence Validation State:** Blocks `evidence-unresolved` (`evidence-unresolved`, `scanned-no-text`, `insufficient-evidence` when unsupported).
6. **Destination Compatibility:** Blocks `no-supported-direct-transfer` for unmapped/disallowed categories.
7. **Missing Values & Conflict Flags:** Blocks `missing-critical-scientific-value`; warns when `conflictKind` is flagged so cross-source conflict notes remain visible.
8. **Destination Status & Edited Sections:** Warns when `destination-already-populated` or `destination-edited-section` applies.
9. **Freshness:** Warns when `isPlotResultStale` or `event-drift-since-match` detects parameter divergence since R1 matching.
10. **Officiality & Restrictions (`assessSourceOfficialAuthority`):** Never infers agency authority from URL hostname alone or AI descriptions; local/restricted imports emit `local-or-restricted-source` warnings and are blocked from `verified-fact`.

---

## 3. Supported and Unsupported Finding-to-PRIMER Mappings

| R2 Category / Subtype | Support | Stage 4 Destination Path | PRIMER Section |
| --- | --- | --- | --- |
| `tsunami-sea-level` (official bulletin/advisory) | Supported | `externalData.tsunami` | Section 6 (`hazards`) |
| `tsunami-sea-level` (tide gauge / sea-level obs) | Supported | `externalData.tsunami.seaLevelObservations[]` | Section 6 (`hazards`) |
| `landslides-rockfalls` | Supported | `externalData.hazardObservations[landslides]` | Section 6 (`hazards`) |
| `liquefaction-deformation` | Supported | `externalData.hazardObservations[liquefaction]` | Section 6 (`hazards`) |
| `structural-infrastructure` (observed/reported) | Supported | `externalData.hazardObservations[structural_damage]` | Section 6 (`hazards`) |
| `tectonic-generators` | Supported | `externalData.tectonic` | Section 5 (`tectonic_setting`) |
| `focal-mechanism-products` | Supported | `externalData.tectonic.evidenceReferences` | Section 5 (`tectonic_setting`) |
| `volcano-monitoring` | Supported | `externalData.volcano` | Section 6 (`hazards`) |
| `phivolcs-monitoring-qrt` | Supported | `externalData.monitoringResponse` | Section 7 (`recommendations`) |
| `agency-coordination` | Supported | `externalData.monitoringResponse.lguAgencyCoordination` | Section 7 (`recommendations`) |
| `public-safety-preparedness` | Supported | `externalData.eventSpecificPreparednessAdvisories` | Section 7 (`recommendations`) |
| `tsunami-sea-level` (`usgs_tsunami_flag` / raw 0/1) | Blocked | `NO SUPPORTED DIRECT TRANSFER` | N/A |
| `structural-infrastructure` / hazards (`modeled`, e.g. LossPAGER / Ground-Failure / ShakeMap) | Blocked | `NO SUPPORTED DIRECT TRANSFER` | N/A |
| `official-bulletins`, `reported-intensities`, `aftershock-cutoffs` | Blocked | `NO SUPPORTED DIRECT TRANSFER` | N/A |

Findings marked `NO SUPPORTED DIRECT TRANSFER` remain preserved in the R1/R2 source and evidence library for manual operator inspection without modifying core `EQPEvent` parameters, PLOT results, phase picks, preferred magnitudes, or verified PEIS tables.

---

## 4. Provenance, Unit, Magnitude-Scale & Evidence Preservation

- Every applied R3 transfer appends a `PrimerR3TransferProvenanceLink` entry into `externalData.r3TransferredSources` capturing `transferId`, `findingId`, `sourceId`, `sourceTitle`, `sourceOrganization`, `sourceUrl`, `sourceVersionNumber`, `sourceContentSha256`, `evidenceLocatorLabel`, verbatim `evidencePassageQuote`, `originalValue`, `originalUnits`, `observationTimestamp`, `contentState`, `operatorLabel`, `transferredAtUtc`, and `replacedPriorTransferId`.
- Raw values, magnitude scales (e.g., `Ms` vs `Mww`), and epistemic labels (`[measured]`, `[reported]`, `[estimated]`, `[interpreted]`) are preserved verbatim without silent unit conversion or scale equivalence.
- `buildPrimerStage4Narratives` emits corresponding `PrimerProvenanceRecord` entries picked up automatically by `buildPrimerReferenceList` in Stage 5 export previews and HTML/PDF citations.

---

## 5. Conflict Resolution & Duplicate-Transfer Handling

- **Three Resolution Modes:** Operators inspecting pre-populated destinations choose between:
  - `add-separate` (appends distinct observations/entries),
  - `keep-existing` (leaves Stage 4 untouched while recording a `'kept-existing'` audit log entry), and
  - `replace-with-confirmation` (blocked unless `operatorConfirmedOverwrite === true` AND a mandatory `overwriteReason` of at least 6 characters is supplied).
- **Historical Tsunami Preservation:** Replacing an existing tsunami advisory state (`tsunami.state` / `officialAdvisoryId`) appends a `[Historical Prior Advisory Preserved (...)]` summary (prior state, advisory ID, issuing agency, cancellation time, and replacement rationale) inside `tsunami.notes` before updating current fields.
- **Duplicate Prevention:** Duplicate transfers sharing the same `(findingId, sourceId, sourceVersionNumber)` identity are flagged (`duplicateAlreadyApplied: true`, bucket `already-applied`) and blocked (`code: 'blocked-duplicate'`).

---

## 6. Non-Destructive Update Behavior & `isEdited` Protection

- `applyReviewedScientificFindingToPrimer` executes `updatePrimerStage4Narratives(primer, compiledStage4, { syncSections: true, forceOverwriteEdited: false })`:
  - Unedited sections (`isEdited: false`) reflect updated Stage 4/R3 narratives automatically.
  - Manually edited sections (`isEdited: true`) retain their exact operator `content` untouched while updating `autoGeneratedBaseline` and listing the section in `sectionsNeedingSync`.
- When `section.isEdited && section.autoGeneratedBaseline !== section.content`, `PrimerGeneratorPanel` surfaces an explicit inline **`Sync to Section`** button backed by `syncStage4NarrativeToEditedSection(..., { operatorConfirmed: true })`, recording a `'section-synced'` entry in the R3 audit log.

---

## 7. Integration with Stage 4, Stage 5, Stage 6A & Stage 6B

- **Stage 4:** `PrimerStage4Panel` synchronizes live form state via `inputFingerprint`, reflecting transferred tsunami, hazard, tectonic, volcano, monitoring, and advisory records immediately.
- **Stage 5:** `buildPrimerReferenceList` includes transferred R3 agency/source references derived from `provenanceLedger`.
- **Stage 6A:** `detectPrimerSourceChanges` detects Stage 4 external-data changes (including `monitoringResponse`, `r3TransferredSources`, and Stage 4 initialization against baseline snapshots) and never mutates frozen `PrimerRevisionRecord` snapshots (`blocked-frozen-snapshot`).
- **Stage 6B:** `evaluatePrimerReviewValidity` evaluates Stage 4/R3 drift against bound baseline revisions and sets `validityState: 'outdated-source-drift'` with `shouldInvalidateCompletedStatus: true` on previously completed reviews.

---

## 8. Audit History & Local Transfer Log Design

- Stored in an isolated IndexedDB database (`eqp_primer_research_transfers_v1`, store `transfer_audit`), completely separate from PRIMER `localStorage` drafts and R1/R2 stores, with an in-memory fallback for tests.
- Append-only enforcement rejects duplicate `auditId` insertions.
- Every record explicitly records `isTamperProof: false`, `identityStatus: 'UNVERIFIED_OPERATOR'`, and `R3_LOCAL_AUDIT_DISCLAIMER`.
- `validateAndImportTransferHistoryJson` rejects prototype-pollution keys (`__proto__`, `constructor`, `prototype`) and strips HTML/script sequences via `sanitizeUntrustedTextValue`.

---

## 9. Verification Results (Build, Lint & Tests)

All checks passed cleanly after the final code edit:
- **Production Bundle (`compile_applet` / Vite build):** **PASS** (`Build succeeded - the applet is compiled`).
- **TypeScript Static Check (`lint_applet` / `tsc --noEmit`):** **PASS** (`0` errors).
- **Focused R3 Suite (`npx tsx --test tests/primerResearchR3.test.ts`):** **12/12 tests PASS (`0` failed)**:
  - Covered Scenarios 1–15: eligible transfer + Stage 5 provenance, `NO SUPPORTED DIRECT TRANSFER` blocks (PEIS, aftershock cutoffs, USGS raw tsunami flag, modeled ShakeMap), nonmatching-event block + ambiguous match resolution + probable-match non-promotion, unresolved-evidence blocking, verified-field overwrite guard + mandatory rationale + historical tsunami preservation, duplicate transfer idempotency, unit/scale/epistemic preservation, `isEdited` prose protection + explicit `Sync to Section`, Stage 6A drift & Stage 6B invalidation + frozen snapshot immutability, offline keyless transfer, non-mutation of `EQPEvent`/R1/R2 + XSS/prototype-pollution blocking, and strict `status: 'draft'` non-approval enforcement.
- **Co-executed R1/R2/R3/PRIMER Regression Suite (`npx tsx --test tests/primerResearchR3.test.ts tests/primerResearchR2.test.ts tests/primerResearchR1.test.ts tests/earthquakePrimer.test.ts tests/primerRevisions.test.ts tests/primerReviews.test.ts`):** **63/63 tests PASS (`0` failed)**.

---

## 10. AI/Gemini Absence & Offline Execution Verification

- R3 transfer eligibility evaluation, mapping resolution, preview generation, event-match documentation, Stage 4/5 transfer application, section synchronization, and IndexedDB audit persistence contain **zero** Gemini API calls and require **zero** external network connectivity.
- `tests/primerResearchR3.test.ts` Test 13 explicitly deletes `process.env.GEMINI_API_KEY` at runtime and verifies end-to-end R3 evaluation, transfer, and Stage 4 integration pass offline.
- Optional R2 live remote Gemini extraction remains `NOT VERIFIED` in this container because `GEMINI_API_KEY` is unset.

---

## 11. Known Scope Limitations & Manual Verification Notes

- **Headless Browser UI Click-Through:** All automated tests ran in Node/tsx against the TypeScript domain/store/Stage4/6A/6B modules and full Vite/TypeScript compilation checks. Interactive browser click-through in a running Chromium session (clicking `Review Transfer`, `Resolve Event Match`, and `Sync to Section` in the live DOM) remains unverified via an automated Playwright browser test.
- **Browser-Local Persistence:** IndexedDB (`eqp_primer_research_transfers_v1`) stores local operator logs in browser storage (`isTamperProof: false`); it does not provide server-side cryptographic signatures or institutional multi-user synchronization.

---

## 12. Local Draft Acceptance vs. Institutional Scientific Approval

**Explicit Boundary Guarantee:** Accepting and transferring a candidate scientific finding into PRIMER Stage 4 structures affects **local working drafts only** (`updatedPrimer.status` always remains `'draft'`). It does **NOT** represent formal PHIVOLCS or institutional scientific approval, authenticated reviewer sign-off, or authorization for public bulletin release.
