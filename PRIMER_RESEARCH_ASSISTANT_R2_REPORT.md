# PRIMER Research Assistant — R2 Implementation & Verification Report

**Task:** Research Assistant R2 — Scientific Evidence Extraction, Source Comparison, and Candidate Findings Review  
**References:** `PRIMER_RESEARCH_ASSISTANT_R0_AUDIT.md`, `PRIMER_RESEARCH_ASSISTANT_R1_REPORT.md`  
**Stage Scope:** Structured Candidate Extraction & Evidence Comparison Only (Zero automatic insertion into PRIMER Stage 4 verified-fact structures, edited narrative sections, formal tsunami advisories, Stage 6A frozen revisions, Stage 6B local reviews, or `EQPEvent`/PLOT solutions)

---

## 1. Files Created and Modified

### Core R2 Modules Created / Updated
1. **`/src/utils/primerResearchExtraction.ts`**
   - Typed `CandidateScientificFinding` schema (`extractionSchemaVersion: '2.0'`) with epistemic classification (`measured`, `reported`, `estimated`, `modeled`, `interpreted`), `FindingEvidenceLocator` (verified character offsets, deterministic paragraph index & preceding section header, verified `Page N` markers, or `unavailable`/`unverified` states), `evidenceValidationStatus`, raw vs. strictly valid normalized values (`computeValidNormalization` — never converting across magnitude scales or PEIS/MMI), `duplicateGroupHash`, conflict metadata, and typed R3 reviewed-transfer contracts (`PrimerResearchR3TransferCandidate`, `PrimerResearchR3Stage4DiffPreview`, `PrimerResearchR3TransferAuditRecord`, intentionally unimplemented in R2).
   - Full 13 extraction categories (`R2FindingCategory` / `R2_FINDING_CATEGORIES`) covering bulletins/updates, tsunami & sea-level observations, reported/estimated intensities, landslides/rockfalls, liquefaction/ground deformation, structural/infrastructure impacts, tectonic generators, focal mechanism products, volcano monitoring, aftershock counts & cutoffs, PHIVOLCS monitoring/QRT, agency coordination, and public safety/preparedness.
   - Deterministic USGS ComCat product extraction (`buildDeterministicUsgsFindings`), deterministic text pattern extraction (`extractDeterministicFindingsFromSource`), verbatim quote & page-mapping verification (`verifyQuoteAgainstSourceText`, `verifyClaimedPageNumber`, `verifyFindingEvidenceAgainstSource`), operator manual finding builder (`createManualCandidateFinding`), AI JSON runtime schema validator (`validateAndMaterializeAiFindings` with prototype-pollution rejection & chunk-offset adjustment), privacy classifier (`isSourceRestrictedOrLocal`), cross-source conflict/duplicate engine (`detectFindingConflictsAndDuplicates`), and source-version revalidation helper (`revalidateFindingAgainstSource`).
2. **`/src/utils/primerResearchFindingsStore.ts`**
   - Dedicated IndexedDB persistence (`eqp_primer_research_findings_v1`, object store `findings`) isolated from PRIMER `localStorage` drafts and R1 source storage (`eqp_primer_research_sources_v1`), with an in-memory adapter (`createMemoryResearchFindingsStore`) for headless tests and fallback.
   - Supports versioned extraction runs (`saveExtractionRun` preserving previous runs via `supersededByRunId`), individual manual finding storage (`saveSingleFinding`), operator relevance tagging (`updateRelevanceStatus` for `'active' | 'irrelevant' | 'insufficient-evidence'`), source-version revalidation (`revalidateAgainstSourceVersion`), JSON export, and store diagnostics.
3. **`/server/primerResearchHelpers.ts`**
   - Server-side R2 AI capability inspection (`inspectGeminiExtractionCapability`) and consented single-source structured extraction (`extractFindingsWithGeminiServer`) reusing server-side `@google/genai` (`DEFAULT_RESEARCH_GEMINI_MODEL = 'gemini-4-hydrogen'`) with structured JSON `responseSchema` (`R2_FINDINGS_RESPONSE_SCHEMA`), `22,000 ms` timeout, `AbortSignal` cancellation, bounded chunking (`R2_MAX_EXTRACTION_CHUNK_CHARS = 14000`, `R2_MAX_EXTRACTION_CHUNKS = 3`), untrusted archival text delimiters (`<<<UNTRUSTED_DOCUMENT_DATA>>>`), explicit event-match isolation (`EVENT_MISMATCH_BLOCKED`), explicit consent enforcement (`CONSENT_REQUIRED`), and explicit local/internal external transmission gate (`EXTERNAL_TRANSMISSION_AUTH_REQUIRED`).
4. **`/server.ts`**
   - Mounted `GET /api/primer/research/extract-capability` and hardened `POST /api/primer/research/extract-findings` with forbidden-key prototype-pollution checks (`findForbiddenKeys`), request `abort`/`close` propagation, `linkedEqpEventId === eventContext.eventId` enforcement, and `400`/`403` enforcement for unconsented/restricted requests.
5. **`/src/components/PrimerResearchAssistantPanel.tsx`**
   - Added 5th workspace tab **`5. Scientific Findings`** alongside R1 tabs 1–4 (`search`, `usgs`, `import`, `library`) without adding a new primary app tab.
   - Includes multi-source selector, Deterministic Extraction trigger, Optional Consented Gemini AI Extraction flow with per-document consent & local/restricted disclosure + cancellation button, offline Manual Candidate Finding entry, AI availability status banner (`AI Extraction Unavailable` when key absent), Cross-Source Comparison & Conflict Matrix inspector, category-grouped findings cards with verified quote blocks + locators, `Open Source` jump to Source Library inspection, `Exclude`/`Flag Insufficient` actions, source-version revalidation trigger, superseded-run toggle, and JSON export.
6. **`/tests/primerResearchR2.test.ts`**
   - Created comprehensive focused R2 verification suite (8 multi-part test groups covering Sections A–M).

---

## 2. Deterministic Extraction Coverage

Deterministic extraction (`extractDeterministicFindingsFromSource`) requires zero external API keys and operates offline across two paths:
- **Structured USGS ComCat GeoJSON (`buildDeterministicUsgsFindings`):** Extracts Origin (`measured`), Preferred Magnitude (`measured`, preserving exact raw scale such as `mww` without equivalence conversion), ComCat Tsunami Flag (`reported`, explicitly labeled **NOT** an official PHIVOLCS tsunami advisory), Moment Tensor / Focal Mechanism (`modeled`), ShakeMap (`estimated` max MMI/PGA/PGV, explicitly distinguished from PEIS/observed damage), DYFI (`reported` crowdsourced MMI/response count), LossPAGER (`modeled` alert tier, never claimed as confirmed structural damage), Ground-Failure landslide/liquefaction tiers (`modeled`), and Finite Fault (`modeled`).
- **Source Text Rules (`extractDeterministicFindingsFromSource`):** Covers all 13 `R2FindingCategory` buckets when matching verbatim lines exist in stored `extractedText`, computing strictly verified offsets/paragraphs/sections and emitting **zero** placeholder claims when categories are absent. Scanned PDFs (`textAvailability: 'scanned-no-text'`) emit zero findings without OCR fabrication.

---

## 3. Gemini Model Capability, Key Availability & Safeguards

- **Configured Model:** `gemini-4-hydrogen` (`@google/genai` server-side only; `GEMINI_API_KEY` never exposed to browser clients; paid models `gemini-4-argon` and `gemini-4-carbon` are never auto-selected).
- **Runtime Environment Key Check:** In the current execution environment, `GEMINI_API_KEY` is **unset** (`configured: false`, `available: false`, `reasonUnavailable: "AI Extraction Unavailable..."`).
- **Fallback Behavior Verified:**
  - `GET /api/primer/research/extract-capability` and UI banner explicitly display **AI Extraction Unavailable** while keeping deterministic extraction, manual candidate entry, evidence comparison, and R1 source workflows 100% operational.
  - `POST /api/primer/research/extract-findings` returns `{ ok: false, unavailable: true, code: 'NO_API_KEY' }` without inventing AI findings.
  - No autonomous web search tools (`googleSearch`) are attached to extraction calls; AI only inspects selected chunked source text delimited as `<<<UNTRUSTED_DOCUMENT_DATA>>>`.
- **Live AI Extraction Status:** **`NOT VERIFIED`** in this container (because `GEMINI_API_KEY` is not configured). Structured JSON parsing, runtime schema validation, chunk-offset handling, consent/privacy gates, prompt-injection delimiter isolation, timeout/cancellation, and invalid/missing-quote rejection were all verified via deterministic server mock overrides in `tests/primerResearchR2.test.ts`.

---

## 4. Consent, Privacy & Evidence Verification Safeguards

1. **Per-Document Explicit Consent (`operatorConfirmedSendToAi`):** UI enumerates exact selected documents, character sizes, organization/version, model ID, and chunk limits before enabling transmission; never auto-sends all IndexedDB sources.
2. **Restricted / Local Source Authorization (`isSourceRestrictedOrLocal` / `operatorAuthorizedExternalTransmission`):** Local file imports (`local://`, `local-file-import`) and internal/restricted/confidential notes require a dedicated second authorization toggle in the UI and are rejected with HTTP `403` (`EXTERNAL_TRANSMISSION_AUTH_REQUIRED`) server-side if absent.
3. **Unrelated Event Isolation (`EVENT_MISMATCH_BLOCKED`):** Server refuses requests where `source.linkedEqpEventId !== eventContext.eventId`.
4. **Evidence Verification (`verifyFindingEvidenceAgainstSource`):**
   - Verifies verbatim quotes (`exact` case-sensitive/insensitive or `whitespace-normalized`) and computes real `startOffset`, `endOffset`, `paragraphIndex`, and deterministic preceding heading (`sectionLabel`).
   - Unmatched quotes are flagged `evidence-unresolved` (`kind: 'unverified'`).
   - Claimed page numbers are retained **only** when verified against explicit `Page N` markers or single-page (`pageCount === 1`) documents; otherwise dropped honestly with explanatory note (`lacks per-page mapping`).
   - Scanned PDFs remain `scanned-no-text` with zero fabricated text/findings.

---

## 5. Source Comparison & Conflict Detection

`detectFindingConflictsAndDuplicates` compares active, non-superseded, event-eligible findings across sources (strictly excluding `nonmatching-event`, `irrelevant`, and `insufficient-evidence` excluded records) and distinguishes:
- **`magnitude-scale-difference`** (`Ms 7.2` vs `Mww 7.1` — never treated as numerical contradiction)
- **`preliminary-vs-updated`** & **`advisory-revision-progression`** (Bulletin No. 1 vs No. 2; Tsunami Advisory No. 1 vs No. 2)
- **`aftershock-cutoff-difference`** (different cutoff timestamps) vs **`catalog-scope-difference`** (`all recorded` vs `M>=3.0`) vs true **`conflicting-aftershock-count`**
- **`measurement-type-difference`** (reported PHIVOLCS PEIS / observed field damage vs estimated ShakeMap MMI / modeled PAGER/Ground-Failure)
- **`conflicting-event-parameter`**, **`conflicting-location-or-time`**, **`conflicting-tsunami-advisory`**, **`conflicting-observation`**, **`different-interpretation`**, and **`duplicate-finding`**
- Every conflict cluster explicitly carries `neverAutoResolveNote`: EQP never automatically declares a newer finding correct.

---

## 6. Verification Results

All automated checks executed cleanly after the final code edit:
- **TypeScript (`npm run lint` / `tsc --noEmit`):** **PASS** (`0` errors).
- **Production Bundle (`npm run build` / `vite build`):** **PASS** (`Build succeeded`).
- **Focused R2 Suite (`npx tsx --test tests/primerResearchR2.test.ts`):** **8/8 tests PASS (`0` failed)**:
  1. Deterministic USGS extraction epistemic separation & anti-damage-claim disclaimers
  2. Deterministic text extraction across all 13 R2 categories + valid normalization (`PEIS`, `km`, `count`) + deterministic paragraph/section locator
  3. AI runtime schema validation, chunk-offset adjustment, prototype-pollution (`__proto__`) rejection, HTML/script stripping & unresolved-quote flagging
  4. Server AI consent gate, local/restricted external transmission block, event mismatch isolation, `AbortController` cancellation, `googleSearch`-free prompting & `NO_API_KEY` graceful unavailability
  5. Scanned PDF zero-fabrication & missing page-mapping preservation (`verifyClaimedPageNumber`)
  6. Cross-source conflict clusters (`magnitude-scale-difference`, `preliminary-vs-updated`, `aftershock-cutoff-difference`, `catalog-scope-difference`, `measurement-type-difference`, `duplicate-finding`) + `nonmatching-event` exclusion
  7. Versioned findings store isolation, `v1 -> v2` source revalidation (`evidence-unresolved` flagging while keeping `v1` snapshot), and non-mutation of `EQPEvent`, `PrimerDocument` (`isEdited: true`), Stage 6A frozen revisions, and Stage 6B local reviews
  8. Bounded optional live Gemini capability check (`GEMINI_API_KEY` absent in container -> cleanly reported `Live AI extraction: NOT VERIFIED`)
- **Co-executed R1 + PRIMER Regression Run (`primerResearchR2.test.ts`, `primerResearchR1.test.ts`, `earthquakePrimer.test.ts`, `primerRevisions.test.ts`, `primerReviews.test.ts`):** **51/51 tests PASS (`0` failed)**.

---

## 7. Known Scope Boundaries & Next Stage (R3 Readiness)

- **Strict R2 Boundary Maintained:** No findings automatically transfer into `PrimerStage4ExternalData`, Stage 4 verified-fact cards, manually edited `PrimerDocument.sections`, official tsunami status, or Stage 6A/6B reviews. Typed transfer contracts (`PrimerResearchR3TransferCandidate`, `PrimerResearchR3Stage4DiffPreview`, `PrimerResearchR3TransferAuditRecord`) are defined for future R3 implementation.
- **Unverified in Container:** Live interactive browser DOM click-through and live remote Gemini API extraction (`GEMINI_API_KEY` not configured in environment) remain `NOT VERIFIED` here and ready to probe once an API key secret is supplied.
