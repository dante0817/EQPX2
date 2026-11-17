# PRIMER Research Assistant — R1 Implementation & Verification Report

**Task:** Research Assistant R1 — Official Scientific Source Discovery, USGS Event Products, Document Import, and Evidence Library  
**Reference:** `PRIMER_RESEARCH_ASSISTANT_R0_AUDIT.md`  
**Stage Scope:** Information Collection Only (Zero automatic insertion into PRIMER Stage 4 facts, Stage 1–3 narratives, or `EQPEvent` parameters)

---

## 1. Files Created and Modified

### Files Created
1. **`/src/utils/researchUrlSecurity.ts`**
   - SSRF prevention, official agency domain allowlist registry (`ALLOWLISTED_OFFICIAL_DOMAINS`), private/reserved IPv4 & IPv6 CIDR detection, MIME allowlisting, and byte/redirect ceiling constants (`MAX_RESEARCH_FETCH_BYTES`, `MAX_RESEARCH_IMPORT_BYTES`, `MAX_RESEARCH_REDIRECTS`, `RESEARCH_FETCH_TIMEOUT_MS`).
2. **`/src/utils/primerResearchAssistant.ts`**
   - Core R1 schema (`PrimerResearchSourceRecord`), 6 collection states (`discovered`, `retrieved`, `imported`, `retrieval-unavailable`, `event-match-uncertain`, `archived`), 5 deterministic event-match states, read-only active earthquake search context builder, deterministic event matcher, USGS ComCat single-event GeoJSON parser, HTML text sanitizer, SHA-256 hashing, non-overwriting deduplication/versioning resolver, and typed R2/R3/Stage 6A/6B extension interfaces.
3. **`/src/utils/primerResearchStore.ts`**
   - Isolated IndexedDB persistence layer (`eqp_primer_research_sources_v1` / object store `sources`) with a headless/fallback in-memory adapter (`createMemoryResearchSourceStore`), relevance tagging, archiving, event-match updates, JSON export/validation, and diagnostics.
4. **`/server/primerResearchHelpers.ts`**
   - Server-side helpers for Gemini Google Search grounding capability inspection & user-initiated search, `.pdf`/`.html`/`.txt` buffer extraction via `unpdf`, SSRF-hardened HTTPS document fetcher with DNS private-IP checking across redirects, and USGS ComCat event-detail lookup.
5. **`/src/components/PrimerResearchAssistantPanel.tsx`**
   - Integrated, collapsible `Research Missing Information` workspace inside the existing PRIMER tab containing all four required sections (`1. Search Official Sources`, `2. USGS Event Products`, `3. Import Documents`, `4. Source Library`).
6. **`/tests/primerResearchR1.test.ts`**
   - Focused R1 verification suite (12 tests) covering USGS retrieval/missing products, PDF/HTML/TXT parsing + scanned PDF detection, invalid/oversized/malformed file rejection, isolated source persistence, SHA-256 deduplication and non-overwriting `vN` -> `vN+1` versioning, event matching & magnitude scale separation, SSRF/redirect/403 safeguards, no-key offline handling, and non-mutation of `EQPEvent` / `PrimerDocument`.

### Files Modified
1. **`/package.json` & `/bun.lock`**
   - Added runtime dependency `unpdf` (`^2.2.1`) for server-side PDF text extraction and image-only/scanned PDF detection.
2. **`/src/utils/earthquakePrimer.ts`**
   - Added optional `researchEvidenceLibrary?: PrimerResearchExtensionSummary;` slot on `PrimerExtensionSlots` (non-breaking; Stages 1–6B logic untouched).
3. **`/server.ts`**
   - Mounted 7 endpoints under `/api/primer/research/*` (`gemini-capability`, `gemini-capability/probe`, `search`, `usgs-search`, `usgs-detail`, `fetch-url`, and binary raw `import-file`).
4. **`/src/components/PrimerGeneratorPanel.tsx`**
   - Embedded `<PrimerResearchAssistantPanel />` inside both the pre-draft and active working-draft PRIMER UI immediately above `PrimerStage4Panel`.

---

## 2. Functions Implemented

### `/src/utils/researchUrlSecurity.ts`
- `normalizeMimeType()`, `isAllowedDocumentMimeType()`
- `matchAllowlistedDomain()` (longest-suffix match so subdomains such as `phivolcs.dost.gov.ph` match before `gov.ph`)
- `isIpLiteralHost()`, `isPrivateOrReservedIp()` (covers RFC1918, `127.0.0.0/8`, `169.254.0.0/16` metadata, CGNAT `100.64.0.0/10`, multicast/reserved, IPv6 `::1`, ULA `fc00::/7`, link-local `fe80::/10`, and IPv4-mapped `::ffff:`)
- `validateSafePublicHttpsUrl()`

### `/src/utils/primerResearchAssistant.ts`
- `buildEventSearchContext()` & `buildResearchDiscoveryQuery()` (read-only over verified `EQPEvent` fields)
- `inferOrganizationFromUrl()`
- `normalizeMagnitudeScaleFamily()` & `evaluateResearchEventMatch()`
- `parseUsgsComcatDetailGeoJson()` & `buildUsgsSummaryPlainText()`
- `extractSafePlainTextFromHtml()`, `buildTextPreview()`, `computeSha256Hex()`
- `computeDuplicateGroupKey()` & `resolveSourceImportVersioning()`

### `/src/utils/primerResearchStore.ts`
- `createMemoryResearchSourceStore()`, `createIndexedDbResearchSourceStore()`, `getPrimerResearchSourceStore()`
- Store operations: `listSources()`, `getSource()`, `importOrAddSource()`, `updateRelevance()`, `updateArchived()`, `updateEventMatch()`, `removeSource()`, `exportEventSourcesJson()`, `getDiagnostics()`
- `validateImportedSourcesBundleJson()`

### `/server/primerResearchHelpers.ts`
- `inspectGeminiSearchCapability({ runLiveProbe })`
- `searchOfficialSourcesWithGemini({ eventContext, category, customQuery })`
- `extractDocumentTextFromBuffer({ buffer, filename, declaredMimeType, fallbackTitle, maxBytes })`
- `fetchSafePublicDocument(rawUrl, { lookupFn, fetchFn, requireAllowlist })`
- `fetchUsgsEventDetailServer(usgsEventId, fetchFn)`

---

## 3. Working Source Discovery Methods

1. **User-Initiated Gemini Google Search Grounding Discovery (`POST /api/primer/research/search`)**
   - Strictly user-triggered (`confirmUserInitiated === true` required by API and UI); never auto-executes when switching events.
   - Uses `buildEventSearchContext()` and `buildResearchDiscoveryQuery()` across 7 information categories (`official-update`, `tsunami-advisory`, `field-investigation`, `secondary-hazards`, `scientific-study`, `monitoring-response`, `usgs-event-product`).
   - Returns **source candidates only** (`ResearchDiscoveryCandidate[]` derived exclusively from returned `groundingChunks` metadata) — never verified facts or invented URLs/dates.
   - Operators can record a candidate directly as `discovered`, or fetch an allowlisted HTTPS document to upgrade to `retrieved` / `event-match-uncertain`.
2. **USGS ComCat Geographic/Temporal Candidate Search (`POST /api/primer/research/usgs-search`)**
   - Uses verified `EQPEvent` epicenter, origin time, configurable radius/window, and minimum magnitude against `https://earthquake.usgs.gov/fdsnws/event/1/query` (`format=geojson`).
   - Evaluates each returned candidate through `evaluateResearchEventMatch()` before display.
3. **Offline / Manual Document & URL Intake (Section 3)**
   - Functions independently of Gemini Search and `GEMINI_API_KEY`: supports local `.pdf`/`.html`/`.txt`/structured-text import and server-guarded HTTPS fetch from allowlisted official domains (`phivolcs.dost.gov.ph`, `ndrrmc.gov.ph`, `ocd.gov.ph`, `dswd.gov.ph`, `pagasa.dost.gov.ph`, `pna.gov.ph`, `pia.gov.ph`, `earthquake.usgs.gov`, `usgs.gov`, `tsunami.gov`, `noaa.gov`, `isc.ac.uk`, `emsc-csem.org`, `globalcmt.org`, `gdacs.org`, `reliefweb.int`, `ioc-unesco.org`, `jma.go.jp`, `geonet.org.nz`, `ga.gov.au`, `doi.org`, `crossref.org`, etc.).

---

## 4. Gemini Model and Tool Capability Findings

Runtime capability inspection (`inspectGeminiSearchCapability()`) against the workspace environment verified the following:
- **Configured Model ID:** `gemini-4-hydrogen` (`DEFAULT_RESEARCH_GEMINI_MODEL`), using `@google/genai` `^3.3.0` server-side SDK only (`GEMINI_API_KEY` is never exposed to browser clients). Paid models (`gemini-4-argon`, `gemini-4-carbon`) are never auto-selected.
- **SDK Tool Support:** `@google/genai` SDK supports `tools: [{ googleSearch: {} }]` (`sdkSupportsGoogleSearchTool: true`).
- **Environment Key & Live Probe Finding:** In the current runtime container, `GEMINI_API_KEY` is **not set** (`configured: false`, `liveVerified: false`, `searchGroundingWorked: false`, `usableMetadataReturned: false`, `mayIncurCharges: false`).
  - `GET /api/primer/research/gemini-capability` returns this unconfigured status immediately with a clear billing/quota disclosure and without throwing errors.
  - `POST /api/primer/research/search` returns `{ ok: false, unavailable: true, code: 'NO_API_KEY', ... }` cleanly while leaving USGS FDSN retrieval, local `.txt`/`.html` import, and existing offline PRIMER drafting 100% functional.
  - Live Google Search grounding execution could not execute against Google's API in this container without a configured `GEMINI_API_KEY`; live probe execution (`POST /api/primer/research/gemini-capability/probe`) is implemented with a 12s timeout and `groundingMetadata.groundingChunks` inspection for environments where a secret key is supplied.

---

## 5. USGS Event-Product Retrieval Results

- **Endpoints:** `POST /api/primer/research/usgs-search` and `POST /api/primer/research/usgs-detail` (`fetchUsgsEventDetailServer` -> `https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=...&format=geojson`).
- **Live Verification Run (`usb000kdb4` — M7.1 Sagbayan / Bohol, Philippines, 2013-10-15):**
  - `fetchUsgsEventDetailServer('usb000kdb4')` returned **`ok: true`**, `usgsEventId: "usb000kdb4"`, `magnitude: 7.1`, `magnitudeType: "mww"`, 64-char `rawSha256`, and parsed product availability accurately:
    - **Available (`true`):** `origin`, `magnitude`, `moment-tensor`, `shakemap`, `dyfi`, `losspager`, `finite-fault`
    - **Missing (`false`, flagged cleanly rather than failing):** `focal-mechanism`, `ground-failure`
  - Explicit scientific caveats/disclaimers are attached to every summary:
    - USGS ComCat records do not modify the active EQP solution.
    - Magnitude scales (e.g., `mww` vs PHIVOLCS `Ms`/`Mb`/`Md`) are never equated.
    - `props.tsunami` is flagged explicitly as **NOT** an official PHIVOLCS tsunami advisory/cancellation.
    - ShakeMap (`MMI`), DYFI, PAGER, and ground-failure products are labeled as estimated/modeled or crowdsourced, **NOT** confirmed observed field damage or PHIVOLCS PEIS.

---

## 6. Supported Document Import Formats

Server-side extraction (`POST /api/primer/research/import-file` using `express.raw({ type: '*/*', limit: MAX_RESEARCH_IMPORT_BYTES + 1024 })` bypassing the 2 MiB JSON parser) and browser fallback extraction:
1. **PDF (`.pdf`, `application/pdf`):**
   - Validates `%PDF-` binary signature.
   - Extracts searchable text and `pageCount` using `unpdf` (`getDocumentProxy` + `extractText`).
   - Detects image-only/scanned PDFs (`rawText.length < 12`), preserving the file record with `textAvailability: 'scanned-no-text'` and zero fabricated or OCR-synthesized text.
2. **HTML / XHTML (`.html`, `.htm`, `text/html`, `application/xhtml+xml`):**
   - Extracts `<title>` and converts body structure safely via `extractSafePlainTextFromHtml()`, stripping `<script>`, `<style>`, `<noscript>`, `<iframe>`, `<object>`, `<embed>`, `<svg>`, and HTML comments.
3. **Plain & Structured Text (`.txt`, `.csv`, `.json`, `.geojson`, `text/plain`, `application/json`, `application/geo+json`, `text/csv`):**
   - Rejects NUL-byte binary masquerade payloads, empty `0`-byte files, unsupported extensions (e.g., `.exe`, `.docx`), and payloads exceeding 10 MiB (`MAX_RESEARCH_IMPORT_BYTES`).

---

## 7. Source Library Schema and Storage

- **Storage Architecture:** Dedicated IndexedDB database **`eqp_primer_research_sources_v1`** (object store `sources`, indexed by `linkedEqpEventId`, `contentSha256`, and `duplicateGroupKey`). Completely isolated from PRIMER draft `localStorage` (`eqp_primer_drafts_v1`), ensuring large PDF/HTML/ComCat extracted text never exhausts browser 5 MB `localStorage` quotas.
- **Schema (`PrimerResearchSourceRecord`, `schemaVersion: '1.0'`):**
  - Identity & links: `sourceId`, `linkedEqpEventId`, `localImportId`, `externalEventIds`
  - Attribution & location: `documentTitle`, `organization`, `sourceLocation`, `sourceUrl`, `sourceCategory`, `publishedAtUtc`, `retrievedAtUtc`
  - Payload integrity: `contentType`, `sizeBytes`, `contentSha256`, `textAvailability`, `textUnavailableReason`, `extractedText`, `extractedTextPreview`, `pageCount`
  - Matching & states: `eventMatchState`, `eventMatchDetails`, `retrievalStatus` (all 6 required states), `originProvenance` (`channel`, `adapterId`, `queryOrRequestSummary`, `modelUsed`, `groundingUsed`, `retrievedViaServer`, `accessConditionNote`), optional `usgsDetail`
  - Curation & versioning: `relevance` (`unreviewed` | `relevant` | `irrelevant`), `archived`, `versionNumber`, `supersedesSourceId`, `supersededBySourceId`, `duplicateGroupKey`, `notes`
- **Deduplication & Version Preservation (`resolveSourceImportVersioning`):**
  - Exact SHA-256 content matches for the same `linkedEqpEventId` return `duplicate-exact` without creating redundant entries.
  - Updated content sharing the same source identity (`usgsEventId`, `sourceUrl`, or `(organization, documentTitle)`) increments `versionNumber` (`vN` -> `vN+1`), sets `supersedesSourceId` / `supersededBySourceId`, and preserves all older versions intact.

---

## 8. Event Matching and Security Safeguards

### Deterministic Event Matching (`evaluateResearchEventMatch`)
- Classifies candidates into 5 explicit states:
  1. `confirmed-id-match` (matching known event ID without spatiotemporal contradiction)
  2. `probable-match` (within tolerances: `<= 180s`, `<= 60 km`, `<= 50 km` depth delta, `<= 0.6` magnitude delta on *comparable* scale family — explicitly labeled **unverified**)
  3. `ambiguous-match` (partial/borderline tolerances, or unlocated EQP event lacking coordinates)
  4. `nonmatching-event` (outside `1800s` or `180 km` ceilings)
  5. `insufficient-evidence` (unlocated EQP event or candidate lacking timestamps/coordinates)
- `normalizeMagnitudeScaleFamily()` explicitly prevents equating `Ms`/`Mb`/`Md/ML`/`Mw`/`Mww`, emitting scale-difference caveats whenever families differ.

### URL Retrieval & Security Safeguards (`validateSafePublicHttpsUrl`, `fetchSafePublicDocument`)
- **HTTPS Only:** Rejects `http:`, embedded credentials, non-443 ports, single-label/local hosts (`localhost`, `.local`, `.internal`, `.arpa`), IP literals, and non-allowlisted domains.
- **DNS Rebinding / Redirect SSRF Guard:** Executes DNS `lookupFn` on the initial hostname **and on every redirect hop** (max `MAX_RESEARCH_REDIRECTS = 3`), blocking loopback (`127.0.0.0/8`, `::1`), RFC1918 (`10/8`, `172.16/12`, `192.168/16`), metadata/link-local (`169.254/16`, `fe80::/10`), CGNAT (`100.64/10`), ULA (`fc00::/7`), and IPv4-mapped IPv6 (`::ffff:`).
- **Response Ceilings & Auth Handling:** Enforces MIME allowlist, `MAX_RESEARCH_FETCH_BYTES` (`8 MiB`), `RESEARCH_FETCH_TIMEOUT_MS` (`12s`), and preserves HTTP `401`/`403` blocked references as `retrieval-unavailable` (`authRequiredOrBlocked: true`) rather than silently dropping them.

---

## 9. Focused Verification Results

All build, TypeScript, and focused R1 + PRIMER regression checks passed after the final code change:
- **TypeScript Check (`npm run lint` / `tsc --noEmit`):** Passed cleanly (`0` errors).
- **Production Bundle (`npm run build` / `vite build`):** Passed cleanly (`Build succeeded`).
- **Focused R1 Smoke Suite (`tests/primerResearchR1.test.ts`):** **12/12 tests passed (`0` failed)**:
  - `1a`: Partial USGS ComCat parsing, missing-product flags, and PEIS/tsunami/damage disclaimers
  - `1b`: Bounded live USGS ComCat detail retrieval for `usb000kdb4` (`Mww 7.1`, available vs missing products verified, bad event ID rejected)
  - `2a`: Real `jsPDF`-generated PDF extraction (`unpdf`), sanitized HTML script/iframe stripping, and `.txt` extraction
  - `2b`: Blank/scanned image-only PDF returns `scanned-no-text` with empty extracted text
  - `3`: Rejection of `.exe`, `.docx`, `0`-byte files, `> 10 MiB` files, invalid `%PDF-` headers, and NUL-byte binaries
  - `4`: IndexedDB-isolated source store persistence, relevance/archive transitions, and validated JSON bundle export
  - `5`: SHA-256 deduplication + non-overwriting `v1` -> `v2` version preservation
  - `6`: All 5 `evaluateResearchEventMatch` states, `Ms` vs `Mww` scale caveat, and unlocated (`iterations === 0`) EQP handling
  - `7a` & `7b`: SSRF URL/IP/DNS redirect trapping, redirect cap (`3`), MIME enforcement, byte ceiling, and `403` reference preservation
  - `8`: Missing `GEMINI_API_KEY` graceful unavailable reporting without crashing offline PRIMER
  - `9`: Deep-equality verification that `EQPEvent` and manually edited `PrimerDocument` remain unmutated
- **PRIMER Non-Regression (`tests/earthquakePrimer.test.ts`, `tests/primerRevisions.test.ts`, `tests/primerReviews.test.ts` co-run with `tests/primerResearchR1.test.ts`):** **43/43 tests passed (`0` failed)**.

---

## 10. Limitations and Requirements for R2

### Current R1 Limitations
1. **No Live Gemini Search Verification in Current Container:** Because `GEMINI_API_KEY` is unset in this container environment, live Search grounding responses (`groundingChunks`) require verification once a key is provided via `Settings > Secrets`.
2. **No Scanned-PDF OCR:** Image-only/scanned PDFs are intentionally flagged as `scanned-no-text` without performing client/server OCR synthesis.
3. **Browser-Local IndexedDB Scope:** Collected sources are stored per browser origin in IndexedDB (portable via JSON export/import); cross-browser or multi-operator shared server archiving is deferred.
4. **No Claim Extraction or Draft Transfer:** By design in R1, collected documents remain solely in the Evidence Library; no text/claims are pushed into PRIMER sections or Stage 4 structured data.

### Requirements & Ready Hooks for R2 (Evidence Extraction & Comparison)
- Typed R2/R3 placeholder contracts (`PrimerResearchR2ClaimExtractionRequest`, `PrimerResearchR2ExtractedClaim`, `PrimerResearchR2EvidenceConflict`, `PrimerResearchR3TransferRecord`) and `PrimerExtensionSlots.researchEvidenceLibrary` are already defined in `/src/utils/primerResearchAssistant.ts` and `/src/utils/earthquakePrimer.ts`.
- **R2 Implementation Prerequisites:**
  1. Require explicit operator confirmation (`operatorConfirmedSendToAi: true`) before sending any imported document text to Gemini, showing data/cost disclosure.
  2. Enforce structured claim outputs carrying verbatim quotes, source IDs, page/section locators, and `confidenceState: 'preliminary-review'`.
  3. Implement conflict comparison against Stage 4 scientific packages (`matches-draft`, `differs-from-stage4`, `blocked-by-manual-edit`) so R3 never overwrites `isEdited: true` PRIMER sections or confirmed `EQPEvent` fields.
