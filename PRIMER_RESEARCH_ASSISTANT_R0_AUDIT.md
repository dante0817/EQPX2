# PRIMER Scientific Information Research Assistant — R0 Architecture & Integration Audit

**Task:** R0 Read-Only Architecture & Integration Audit  
**Target Module:** `PRIMER` Tab (`src/components/PrimerGeneratorPanel.tsx` & Stage 4/6A/6B subsystem)  
**Scope Rule:** Read-only architectural assessment. Zero modifications to application source code (`src/`, `server.ts`, `package.json`, tests, or other top-level EQP tabs: PLOT, MAP, Bulletin, Intensity, Research).

---

## Executive Readiness Summary

- **Integration Feasibility:** **HIGH.** The existing PRIMER architecture already has clean, typed boundaries for Stage 4 external scientific evidence (`PrimerStage4ExternalData`), claim-level provenance (`PrimerProvenanceRecord[]`), non-destructive prose synchronization (`updatePrimerStage4Narratives` respecting `PrimerSection.isEdited`), immutable revision snapshots (Stage 6A), and local scientific review / correction tracking (Stage 6B).
- **Gemini Grounding Support:** The installed `@google/genai` SDK (`^3.3.0`) and default model (`gemini-4-hydrogen`) **do support both Google Search Grounding (`tools: [{ googleSearch: {} }]`) and URL Context (`tools: [{ urlContext: {} }]`)**, neither of which is wired yet in `server.ts`. Neither can be combined with `googleMaps` in a single request, and `gemini-4-argon` / `gemini-4-carbon` require billing-enabled `GEMINI_API_KEY` credentials.
- **Critical Gaps to Bridge Before Implementation:**
  1. Server-side **SSRF-protected URL fetcher** and **USGS ComCat Event Detail JSON adapter** (`fdsnws/event/1/query?eventid=...&format=geojson`).
  2. **PDF / document text extraction** (`jspdf` is export-only; no PDF reader or multipart upload middleware is currently installed).
  3. A **dedicated Research Document & Candidate Claim Store** (server filesystem / IndexedDB — **not** `localStorage` due to the 5 MiB cap monitored by `inspectLocalStorageCapacity()`).
  4. An **Event-Match Scorer** and **Human-Reviewed Diff/Transfer Gate** mapping verified external claims into `PrimerStage4ExternalData` without overwriting `isEdited` prose or verified `ready-for-review` / `verified-fact` entries.

---

## 1. Existing Architecture & Relevant File Paths

### 1.1 Backend, Config & Security Boundary
- `/server.ts`: Single-origin Express HTTP + `ws` WebSocket server (port `3000`, `vite.middlewares` in dev, `dist/` static fallback in prod). Uses `express.json({ limit: '2mb' })` (`server.ts:1172`).
  - Persists workstation data under `EQP_STORAGE_ROOT` (`./eqp_solutions/`) via JSON/text files (`_stations_db.json`, `_places_db.json`, `_history_db.json`, `_settings_db.json`, `_historical_seismicity_db.json`, plus geodetic/coulomb/sequence stores).
  - Currently has **no authentication / multi-user RBAC layer** (single-operator local workstation model).
  - Currently makes outbound HTTPS calls in only two places:
    1. `@google/genai` server SDK (`getGenAI()` at `server.ts:1065–1078`).
    2. USGS FDSN summary search proxy (`POST /api/research/historical-catalog/usgs` at `server.ts:2744–2845`).
- `/metadata.json`: Declares `"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]`.
- `/vite.config.ts`: Standard React + Tailwind Vite config; **never exposes `GEMINI_API_KEY` to client bundles**.
- `/.env.example`: Documents `GEMINI_API_KEY`, `APP_URL`, and `VITE_GOOGLE_MAPS_API_KEY`.
- `/package.json`: Key dependencies include `@google/genai` (`^3.3.0`), `express` (`^4.21.2`), `jspdf` (`^4.2.1` — **PDF output generation only**), `tsx` (`^4.21.0`). No PDF parser (`pdf-parse`, `pdfjs-dist`) or multipart parser (`multer`, `busboy`) is installed.

### 1.2 Gemini AI Integrations & Grounding Inspection
Inspected `server.ts` (`1044–1168`, `1952–2105`, `3235–3365`), client consumers (`src/components/SeismologyChatPanel.tsx`, `src/components/MapsGroundingPanel.tsx`, `src/components/LiveVoicePanel.tsx`), and SDK reference (`/skills/system_skills/gemini_api/references/tools_and_grounding.md`):

| Capability | Current Codebase Status | SDK / Model Support (`@google/genai ^3.3.0`) | Constraints & Notes |
|---|---|---|---|
| **Server Client (`getGenAI`)** | Implemented (`server.ts:1065`) | Supported | Uses `process.env.GEMINI_API_KEY` + `'User-Agent': 'aistudio-build'`. |
| **Chat Models (`ALLOWED_CHAT_MODELS`)** | Whitelisted (`server.ts:1044`) | `gemini-4-hydrogen`, `gemini-3.1-flash-lite`, `gemini-4-argon`, `gemini-4-carbon` | `hydrogen` & `3.1-flash-lite` work on free tier; `argon` & `carbon` require billing-enabled API keys (`server.ts:1145`). |
| **Maps Grounding (`googleMaps`)** | Implemented (`/api/gemini/chat`, `/api/gemini/maps-grounding`) | `tools: [{ googleMaps: {} }]` | Extracts `groundingChunks[].maps.{uri,title,placeId}`. Cannot be mixed with `responseMimeType`/`responseSchema` or other built-in tools. |
| **Google Search Grounding (`googleSearch`)** | **Not implemented** (`0` matches) | **Supported** on `gemini-4-hydrogen` / Gemini 4 via `tools: [{ googleSearch: {} }]` | Returns `candidates[0].groundingMetadata.groundingChunks[].web.{uri, title}`. Cannot be combined with `googleMaps` in the same request. |
| **URL Context (`urlContext`)** | **Not implemented** (`0` matches) | **Supported** on `gemini-4-hydrogen` / Gemini 4 via `tools: [{ urlContext: {} }]` | Reads up to **20 URLs per request**. Cannot be combined with `googleMaps`. Subject to remote WAF/robots/TLS reachability from Google's crawler. |
| **Hybrid Tools + Function Calling** | **Not implemented** | **Supported** | Requires `toolConfig: { includeServerSideToolInvocations: true }`. |
| **Live Voice API (`/api/live`)** | Implemented (`server.ts:3235`) | `gemini-3.8-live` | WebSocket proxy; unrelated to document research. |
| **Phase Picking AI (`PhasePickingAIPanel.tsx`)** | Client-side Ridge/Wadati/Huber regression only | N/A | Zero Gemini dependency (`src/components/PhasePickingAIPanel.tsx:1–100`). |

### 1.3 PRIMER Tab & Subsystem Files (Stages 1–6B)
- `/src/components/PrimerGeneratorPanel.tsx`: Host panel inside `PRIMER` tab orchestrating Stages 1–6B (draft lifecycle, map figure, Stage 3 sequence, Stage 4 narratives, 7 editable prose sections, Stage 5 A4 preview/export, Stage 6A revision history/compare, Stage 6B scientific review, section comments, and correction requests).
- `/src/utils/earthquakePrimer.ts`: Core types (`PrimerDocument`, `PrimerSection`, `PrimerExtensionSlots`, `PrimerExtractedParameters`), `extractVerifiedPrimerParameters()`, `evaluatePrimerEligibility()`, `updatePrimerStage4Narratives()`, HTML/PDF builders, and `localStorage` draft persistence (`eqp_primer_drafts_v1`, `eqp_primer_eligibility_rules_v1`).
- `/src/utils/primerCatalogAdapters.ts`: Catalog service registry (`CATALOG_SERVICE_ADAPTERS`), `fetchSharedResearchCatalog()`, `validateAndMergeLocalCatalog()`, `importCatalogToSharedEndpoint()`, and `queryUsgsFdsnCatalogAdapter()`.
- `/src/components/PrimerStage3Panel.tsx`: Sequence/historical seismicity panel wrapping USGS FDSN summary search and local CSV/GeoJSON upload.
- `/src/utils/primerScientificNarratives.ts` & `/src/components/PrimerStage4Panel.tsx`: Structured Stage 4 data (`PrimerStage4ExternalData`), 4 explicit content states (`PrimerContentState`), versioned guidance templates (`APPROVED_GENERAL_TEMPLATES`), `buildPrimerStage4Narratives()`, and `provenanceLedger` (`PrimerProvenanceRecord[]`).
- `/src/utils/primerRevisions.ts` & `/src/utils/primerRevisionArchive.ts`: Stage 6A immutable frozen snapshots (`PrimerRevisionRecord`), `deepFreezeRevision()`, `sanitizePrimerDocumentForArchive()`, dual-FNV-1a checksums, IndexedDB store (`eqp_primer_revisions_archive_v1`), and `inspectLocalStorageCapacity()`.
- `/src/utils/primerReviews.ts`, `/src/utils/primerReviewPackage.ts`, `/src/utils/primerSectionComments.ts`, `/src/utils/primerCorrectionRequests.ts`: Stage 6B local review records (`eqp_primer_reviews_v1`), non-publication release guards (`FORBIDDEN_RELEASE_STATUS_TOKENS`, `assertNoReviewStatusViolation`), ZIP encoder/decoder (`MAX_ZIP_ARCHIVE_BYTES`, `isSafeZipEntryPath`), JSON/SVG security validators (`safeJsonParseChecked`, `findForbiddenKeys`, `sanitizeAndValidateSvgMarkup`), revision-bound `sectionComments`, and `correctionRequests` (`eqp_primer_corrections_v1`).

---

## 2. Reusable Functions and Endpoints

| Function / Endpoint | Location | How PRIMER Research Assistant Can Reuse It |
|---|---|---|
| `getGenAI()` & `formatGeminiError()` | `server.ts:1065, 1136` | Single server-side Gemini SDK entry point, API key check, and consistent `429`/`403`/`404` status translation. |
| `ALLOWED_CHAT_MODELS` | `server.ts:1044` | Enforce free-tier default (`gemini-4-hydrogen`) and billing warnings on `argon`/`carbon`. |
| `POST /api/research/historical-catalog/usgs` & `queryUsgsFdsnCatalogAdapter()` | `server.ts:2744`, `src/utils/primerCatalogAdapters.ts:300` | Pattern and GeoJSON parser reuse for event-radius queries; extensible for per-event USGS ComCat detail retrieval. |
| `extractVerifiedPrimerParameters()` | `src/utils/earthquakePrimer.ts:297` | Supplies ground-truth active `EQPEvent` lat, lon, depth, origin UTC, magnitude, and bulletin number for event matching without mutating `EQPEvent`. |
| `computeDistanceAndBearing()` & `haversineKm` / distance utils | `src/utils/nearestPlaces.ts` | Computes spatial offset (km) between active epicenter and candidate external event coordinates. |
| `CATALOG_SERVICE_ADAPTERS` & `computeCatalogCoverageSummary()` | `src/utils/primerCatalogAdapters.ts:55, 88` | Pattern for explicit source descriptors (`connected` vs `online-on-demand` vs `unconfigured`) and coverage disclaimers. |
| `createDefaultStage4ExternalData()`, `buildPrimerStage4Narratives()`, `updatePrimerStage4Narratives()` | `src/utils/primerScientificNarratives.ts:243, 406`, `src/utils/earthquakePrimer.ts:1032` | Target destination structures (`tsunami`, `tectonic`, `hazardObservations`, `volcano`, `monitoringResponse`, `eventSpecificPreparednessAdvisories`) and non-overriding sync into sections where `!sec.isEdited`. |
| `safeJsonParseChecked()`, `findForbiddenKeys()`, `sanitizeAndValidateSvgMarkup()` | `src/utils/primerReviewPackage.ts:57, 85, 118` | Reusable prototype-pollution and active-markup guards when ingesting external JSON/XML/HTML payloads or user files. |
| `inspectLocalStorageCapacity()` | `src/utils/primerRevisionArchive.ts:35` | Enforces 5 MiB browser `localStorage` protection; signals why source documents must stay out of `localStorage`. |
| `PrimerSectionComment` (`targetKind: 'source-record'`) & `PrimerCorrectionRequest` | `src/utils/primerSectionComments.ts:8`, `src/utils/primerCorrectionRequests.ts:23` | `SectionCommentTargetKind` **already includes `'source-record'`**! Operators can attach notes and correction requests directly to imported research claims/sources. |
| `assertNoReviewStatusViolation()` & `FORBIDDEN_RELEASE_STATUS_TOKENS` | `src/utils/primerReviews.ts:83, 106` | Guarantees no external report ingestion or AI extraction can inject `'APPROVED'`, `'FINAL'`, or `'PUBLISHED'` status tokens. |

---

## 3. Missing Capabilities & External Source Classification

### 3.1 Documented Public APIs vs. Ordinary Public Web Pages
A critical architectural distinction governs source retrieval:

1. **Sources with Documented Machine-Readable Public APIs (Safe for Direct Structured Adapters):**
   - **USGS ComCat / FDSNWS Event API:** `https://earthquake.usgs.gov/fdsnws/event/1/query` supports `format=geojson` and `eventid=<usgs_id>`, returning structured `properties.products` (`origin`, `moment-tensor`, `finite-fault`, `shakemap`, `dyfi`, `losspager`, `tectonic-summary`). Currently EQP only uses the summary list query, **not** detail `eventid` retrieval.
   - **International Seismological / Humanitarian APIs (optional future adapters):** EMSC SeismicPortal FDSNWS (`seismicportal.eu/fdsnws/event/1/query`), ISC FDSNWS (`isc.ac.uk/fdsnws/event/1/query`), GDACS RSS/JSON feeds, ReliefWeb Disasters API v1 (`api.reliefweb.int`), Crossref Works REST API (`api.crossref.org/works` for DOIs/literature).

2. **Sources WITHOUT Documented Public Unauthenticated JSON APIs (Ordinary HTML / PDF Pages):**
   - **DOST-PHIVOLCS (`earthquake.phivolcs.dost.gov.ph`, `www.phivolcs.dost.gov.ph`):** As documented in `CATALOG_SERVICE_ADAPTERS['phivolcs-official-service']` (`primerCatalogAdapters.ts:76–85`), **no public unauthenticated PHIVOLCS catalog/bulletin JSON API exists or is connected**. Earthquake Information Bulletins, Tsunami Advisories, and Earthquake Primers are published as HTML tables or downloadable PDFs subject to page structure changes, TLS quirks, or WAF rate limiting.
   - **NDRRMC Situational Reports / DSWD DROMIC / Regional DRRMC Advisories:** Published primarily as PDF situational reports or public web announcements without uniform REST schemas.
   - **Scientific Journals / Publisher PDFs / Preprints:** Paywalled or HTML/PDF documents.
   - **Implication:** These sources **must NOT be coupled to fragile hard-coded HTML scrapers masquerading as official API feeds**. They must be ingested via: (a) local PDF/TXT/JSON/HTML file upload by the operator, (b) explicit operator-initiated Gemini `googleSearch` discovery or `urlContext` / SSRF-hardened server fetch on user-selected URLs, all clearly labeled as **external candidate evidence requiring operator verification**.

### 3.2 Missing Technical Capabilities
1. **Google Search Grounding & URL Context Endpoints (`server.ts`):** New scoped endpoints (e.g., `/api/primer/research/search`, `/api/primer/research/extract`) using `@google/genai` `tools: [{ googleSearch: {} }]` and `tools: [{ urlContext: {} }]`, plus deterministic offline/non-AI fallback parsing for structured JSON/CSV/text.
2. **SSRF-Safe Server URL Fetch Proxy:** Currently `server.ts` has no general URL fetcher. Retrieving a user-pasted URL or official PDF/HTML page server-side requires strict URL scheme/IP/redirect/size/content-type enforcement.
3. **PDF Text Extraction & Larger Payload Upload Handling:** No PDF reader (`pdf-parse` or `pdfjs-dist`) is installed (`jspdf` only writes PDFs), and `server.ts` caps JSON at `2mb` (`server.ts:1172`). Official NDRRMC/PHIVOLCS PDFs routinely exceed 2 MB if base64-encoded inside JSON.
4. **Per-Event Official Product Detail Adapter (USGS ComCat Detail):** Fetching USGS `detail` GeoJSON URLs to retrieve official `moment-tensor`, `shakemap` (`maxmmi`), `dyfi`, `losspager` (`alert`), `tsunami` flag, and `tectonic-summary` snippets with exact USGS revision/timestamp metadata.
5. **Research Document & Extracted Claim Store:** Persistent storage outside `localStorage` for full source documents, checksums, extracted quotes/claims, event-match diagnostics, and transfer audit logs.
6. **Event-Match Validation Engine:** Deterministic scoring comparing external document parameters (origin time, coordinates, depth, magnitude, event ID) against `PrimerExtractedParameters`.
7. **Reviewed Evidence Transfer Gate:** UI diff/conflict preview mapping accepted claims cleanly into `PrimerStage4ExternalData` fields and Stage 4 provenance records **without clobbering manual edits or verified facts**.

---

## 4. Proposed Interfaces and Data Flow

### 4.1 Integration Location (Inside `PRIMER` Tab Only)
Add a collapsible workspace drawer or sub-panel inside `PrimerGeneratorPanel.tsx` directly adjacent to `<PrimerStage4Panel />` (e.g., **"Stage 4 Research Assistant · Official Source Discovery, Document Import & Claim Staging"**), plus a contextual trigger button inside `PrimerStage4Panel.tsx` (`"Import / Research External Evidence"`). **Zero top-level navigation tabs are added.**

### 4.2 Proposed TypeScript Interfaces (`src/utils/primerResearchAssistant.ts` — future R1/R2)

```ts
export type ResearchSourceChannel =
  | 'usgs-comcat-detail'
  | 'gemini-google-search'
  | 'gemini-url-context'
  | 'direct-url-fetch'
  | 'local-file-upload' // PDF, TXT, CSV, GeoJSON, HTML
  | 'manual-paste';

export type ResearchAuthorityTier =
  | 'authoritative-agency-api'   // e.g., USGS FDSN/ComCat GeoJSON
  | 'institutional-document'     // e.g., Operator-uploaded PHIVOLCS / NDRRMC PDF
  | 'web-search-grounding'       // Google Search / URL Context candidate
  | 'unverified-external';

export type EventMatchVerdict =
  | 'strong-match'       // <= 120s origin diff AND <= 50 km AND <= 0.5 mag diff (or matching ID)
  | 'plausible-match'    // <= 600s AND <= 150 km AND <= 1.0 mag diff
  | 'weak-or-regional'   // Same region/tectonic context, NOT same earthquake (e.g., historical study)
  | 'mismatch'           // Conflicting origin/location (> threshold) — requires explicit override note
  | 'unlocated-or-unknown';

export interface ResearchEventMatchResult {
  verdict: EventMatchVerdict;
  activeEventFingerprint: string;
  originTimeDeltaSec: number | null;
  epicentralDistanceKm: number | null;
  depthDeltaKm: number | null;
  magnitudeDelta: number | null;
  matchedIds: string[]; // e.g., ['usb000kdb4']
  warnings: string[];
}

export interface ResearchSourceDocument {
  sourceId: string;
  eventId: string;
  title: string;
  channel: ResearchSourceChannel;
  authorityTier: ResearchAuthorityTier;
  issuingAgency: string;
  canonicalUrl: string | null;
  fileName: string | null;
  mimeType: string;
  publishedAtUtc: string | null;
  retrievedAtUtc: string;
  contentSha256: string;
  textByteLength: number;
  extractedTextExcerpt: string; // Bounded preview; full text stored in IndexedDB/server store
  groundingChunks?: Array<{ title: string; uri: string }>;
  eventMatch: ResearchEventMatchResult;
  operatorConfirmedMatch: boolean;
}

export type ResearchClaimTargetDomain =
  | 'tsunami'
  | 'tectonic'
  | 'hazard_observation'
  | 'volcano'
  | 'monitoring_response'
  | 'preparedness_advisory'
  | 'general_reference';

export type ClaimReviewDecision =
  | 'pending-review'
  | 'accepted-preliminary' // -> reviewStatus: 'requires-scientific-review', state: 'preliminary-review'
  | 'accepted-verified'    // -> reviewStatus: 'ready-for-review', state: 'verified-fact' (requires citation)
  | 'rejected';

export interface ResearchCandidateClaim {
  claimId: string;
  sourceId: string;
  targetDomain: ResearchClaimTargetDomain;
  targetSectionId: PrimerSectionKey;
  summary: string;
  structuredPatch: Record<string, unknown>; // Domain-typed patch (e.g., PrimerTsunamiInformation partial)
  verbatimQuote: string;                   // Required traceability excerpt from source
  pageOrUrlLocator: string;
  extractionMethod: 'deterministic-parser' | 'gemini-structured-extraction' | 'operator-manual';
  aiModelUsed: string | null;
  confidenceNote: string;
  decision: ClaimReviewDecision;
  conflictStatus: 'none' | 'differs-from-existing' | 'blocked-manual-edit' | 'blocked-verified-fact';
  transferredAtUtc: string | null;
  transferredToClaimKey: string | null;
}
```

### 4.3 Storage Architecture Split (Respecting `localStorage` Limits)
- **Raw / Full Retrieved Documents & Extracted Text Blobs:** Store either in a dedicated browser **IndexedDB** database (`eqp_primer_research_sources_v1` matching existing `eqp_primer_revisions_archive_v1` and `eqp_primer_reviews_v1` patterns) **AND/OR** an optional server-side JSON/artifact folder under `eqp_solutions/_research_sources/<eventId>/` for persistence across browsers/restarts. Never write raw PDFs, HTML pages, or full extracted text into `localStorage`.
- **On `PrimerDocument.extensions` (`primerResearch` compact ledger):** Store **only compact transfer references** (e.g., `sourceId`, `title`, `issuingAgency`, `canonicalUrl`, `publishedAtUtc`, `contentSha256`, `transferredClaimIds[]`, `eventMatchVerdict`). This keeps `eqp_primer_drafts_v1` well below the 5 MiB `localStorage` threshold and keeps Stage 6A frozen revision snapshots compact and checksum-verifiable.

### 4.4 End-to-End Data Flow
1. **Input / Discovery (Strictly User-Triggered, Never Autonomous):**
   - *Path A (Structured Official API):* Operator clicks **Fetch USGS Event Detail** -> `POST /api/primer/research/usgs-detail` queries USGS `fdsnws/event/1/query` by `eventid` or narrow spatiotemporal window around `EQPEvent`, extracts official products (`moment-tensor`, `shakemap`, `dyfi`, `losspager`, `tsunami`), deterministic parser produces claims.
   - *Path B (Local File Upload — Offline-Capable):* Operator uploads `.pdf`, `.txt`, `.csv`, `.json`, `.geojson`, or `.html` (e.g., downloaded PHIVOLCS Bulletin / NDRRMC SitRep) -> server or local parser extracts plain text + SHA-256 hash. Works 100% offline with zero Gemini key.
   - *Path C (Gemini Search Grounding / URL Context — Optional Online AI):* Operator enters a targeted query (e.g., PHIVOLCS Tsunami Info / NDRRMC SitRep for the active event) or official URLs -> `POST /api/primer/research/search` (`tools: [{ googleSearch: {} }]`) or `/api/primer/research/url-extract` (`tools: [{ urlContext: {} }]`).
2. **Event-Match Scoring:** `evaluateResearchEventMatch(source, activeEvent)` compares extracted origin UTC, coordinates, depth, and magnitude against `extractVerifiedPrimerParameters(event)`. Any `mismatch` blocks one-click verified transfer until the operator explicitly toggles `operatorConfirmedMatch` with reason, or marks the source as `'weak-or-regional'` (tectonic/background reference only).
3. **Claim Staging & Optional Gemini Evidence Extraction:**
   - Gemini returns structured JSON candidate claims **only from supplied/retrieved source text** (with mandatory `verbatimQuote`, `pageOrUrlLocator`, and explicit `"MISSING_FROM_SOURCE"` when absent—never synthesizing facts).
   - **Fallback without Gemini:** Operator can highlight/paste quotes from extracted text directly into typed Stage 4 claim staging forms.
4. **Conflict Inspection & Non-Overriding Transfer Gate:**
   - Before writing, the UI compares each accepted claim against existing `PrimerStage4ExternalData` and `PrimerDocument.sections`:
     - **Verified-fact protection:** If a target Stage 4 domain is already `'ready-for-review'` / `'verified-fact'` (e.g., `tsunami.state === 'official-warning-or-advisory'` or `eventSpecificAdvisoriesVerified === true`), automatic overwrite is **blocked**; the UI shows a side-by-side diff requiring explicit operator conflict resolution.
     - **Manual-prose protection:** Calls `buildPrimerStage4Narratives()` + `updatePrimerStage4Narratives(..., { syncSections: true, forceOverwriteEdited: false })`. Any `PrimerSection` with `isEdited === true` **keeps its operator prose untouched** while still updating `provenanceLedger`, `subsections`, and `autoGeneratedBaseline` for comparison.
   - Records a `PrimerProvenanceRecord` containing `sourceIdentity`, `sourceReference` (URL/filename + SHA-256), `observationOrBulletinTimestamp`, `dataCutoffTimestamp`, `reviewStatus`, and `contentState`.

---

## 5. Security, Provenance, and Scientific Safeguards

### 5.1 API Key & Gemini Billing Boundaries
- Keep `GEMINI_API_KEY` strictly inside `server.ts` (`getGenAI()`); **no client-side `@google/genai` imports**, no key inputs in UI.
- Default research endpoints to **`gemini-4-hydrogen`** (free-tier compatible); treat `gemini-4-argon` and `gemini-4-carbon` as opt-in with explicit quota/billing error handling via `formatGeminiError()`.
- Enforce SDK tool rule: **never combine `googleMaps` with `googleSearch` or `urlContext`** in the same `generateContent` call (`tools_and_grounding.md:67–68`), and do **not** mix `responseMimeType: 'application/json'` with `googleMaps`. (When combining `googleSearch` or `urlContext` with structured extraction, run a two-step pipeline: Step 1 Grounded Retrieval/URL read -> Step 2 Deterministic Schema Extraction on the retrieved text/quotes, avoiding tool+JSON-schema incompatibilities across model versions.)

### 5.2 SSRF, File Parsing, XSS & Prototype Pollution Defenses
- **SSRF Protection on Server URL Retrieval Proxy:**
  - Allow `https:` only (reject `file:`, `ftp:`, `http:` unless explicitly dev/allowlisted).
  - Resolve DNS before connecting and reject loopback (`127.0.0.0/8`, `::1`), RFC1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local / cloud metadata IPs (`169.254.0.0/16`, `fe80::/10`), and carrier-grade NAT (`100.64.0.0/10`).
  - Disable automatic HTTP redirects (`redirect: 'manual'`) and re-validate any `Location` target; enforce timeout (`<= 15s`), byte cap (`<= 10 MB`), and strict Content-Type allowlist (`application/pdf`, `text/html`, `text/plain`, `application/json`, `application/geo+json`, `application/xml`).
- **Sanitization of Retrieved HTML/JSON/PDF Text:**
  - Strip scripts/styles and render extracted excerpts strictly as plain text (never `dangerouslySetInnerHTML`) to prevent stored XSS from external web pages.
  - Validate all parsed JSON responses using existing `safeJsonParseChecked()` / `findForbiddenKeys()` (`primerReviewPackage.ts:57, 85`) to block `__proto__` / `constructor` / `prototype` pollution.
  - Sanitize stored source filenames using `sanitizeEqpSegment()` (`server.ts:573`) and anchor paths strictly inside `EQP_STORAGE_ROOT`.

### 5.3 Event Matching & Anti-Hallucination Rules
- **Quantitative Event-Match Gate:** Compute deltas against active `EQPEvent`:
  - `originTimeDeltaSec` (`|T_ext - T_eqp|`)
  - `epicentralDistanceKm` (Haversine distance between `(lat_ext, lon_ext)` and `(event.lat, event.lon)`)
  - `magnitudeDelta` (`|M_ext - M_eqp|`, flagging scale mismatches such as `Ms` vs `Mww` rather than equating them)
- **Strict Non-Fabrication & Content-State Separation:**
  - Every AI-extracted claim **must** carry a verbatim substring quote from the source and map by default to `'preliminary-review'` (`reviewStatus: 'requires-scientific-review'`).
  - Only **human operator confirmation** with source citation upgrades a claim to `'verified-fact'` / `'ready-for-review'`.
  - AI extraction is **never** permitted to assert a negative ("no tsunami occurred", "no damage reported") unless quoting an official cancellation/no-tsunami bulletin (`official-no-tsunami`) with agency + advisory ID + timestamp.

### 5.4 Offline PRIMER Preservation & Stage 6A/6B Non-Publication Invariants
- **100% Offline Graceful Degradation:** PRIMER drafting, map figures, Stage 3 sequence analysis (local CSV/GeoJSON), Stage 4 template compilation, manual research file upload/paste, Stage 5 PDF/HTML export, Stage 6A revisions, and Stage 6B reviews/ZIP packages **must continue functioning identically** when offline or when `GEMINI_API_KEY` is absent. Online Search/URL/USGS buttons show non-blocking availability hints without throwing.
- **Stage 6A Revision Integrity:** Transferring reviewed research claims updates only the editable working draft, triggers existing `detectPrimerSourceChanges()` staleness awareness on saved revisions, and **never** mutates frozen `PrimerRevisionRecord` snapshots (`deepFreezeRevision` + `contentChecksum`).
- **Stage 6B Non-Publication Safeguard:** Imported external agency bulletins (even official PHIVOLCS or USGS reports) establish provenance for source claims only — they **never** bypass `assertNoReviewStatusViolation()` or set document release status to `APPROVED`, `FINAL`, or `PUBLISHED`.

---

## 6. Recommended R1 Implementation Scope

Focus R1 on a safe, deterministic, high-value vertical slice inside `PRIMER` that works both offline and with optional Gemini/USGS connectivity:

1. **R1 Core Domain & Storage (`src/utils/primerResearchAssistant.ts` + IndexedDB `eqp_primer_research_sources_v1`):**
   - Types for `ResearchSourceDocument`, `ResearchCandidateClaim`, `ResearchEventMatchResult`, deterministic `evaluateResearchEventMatch()`, and compact citation/transfer summary slot on `PrimerExtensionSlots.researchAssistant`.
   - Deterministic conflict checker + non-overriding Stage 4 transfer helper (`applyReviewedClaimsToStage4()`, preserving `isEdited` sections and existing `verified-fact` fields).
2. **R1 Server Endpoints (`server.ts`):**
   - `POST /api/primer/research/usgs-detail`: Queries USGS ComCat Event Detail GeoJSON by `eventid` (or closest spatiotemporal match) and returns structured products (`moment-tensor`, `shakemap`, `dyfi`, `losspager`, `tsunami`, `tectonic-summary`) + exact USGS URL/timestamp provenance.
   - `POST /api/primer/research/search`: Uses `@google/genai` `gemini-4-hydrogen` with `tools: [{ googleSearch: {} }]` to locate official agency URLs/summaries for the active event, returning grounded web chunks (`uri`, `title`) and clear offline/missing-key error codes.
   - `POST /api/primer/research/extract-claims`: Two-step/safe extraction from supplied plain text or `urlContext` URLs into candidate `ResearchCandidateClaim[]` with mandatory `verbatimQuote`, `aiModelUsed`, and zero unverified promotion.
   - SSRF-safe `fetchPublicUrlSafe()` helper + multipart/size-capped local document text extraction (`.txt`, `.csv`, `.json`, `.html`, and `.pdf` once parser dependency is approved).
3. **R1 PRIMER UI Drawer (`src/components/PrimerResearchAssistantPanel.tsx` mounted inside `PrimerGeneratorPanel.tsx`):**
   - Three clear tabs: **(1) Official APIs & Web Search** (USGS ComCat + optional Gemini Google Search), **(2) Import Document / URL** (Local file upload/paste offline + URL Context / SSRF-safe fetch), **(3) Staged Claims & Conflict Review** (event-match badge, verbatim quote inspector, domain target preview, diff against current Stage 4 / `isEdited` sections, explicit "Transfer as Preliminary" / "Verify & Transfer" buttons).
4. **Deferred to R2+:** Automated multi-hop search agents (explicitly out of scope), ReliefWeb/EMSC/ISC/Crossref additional adapters, vector embedding search (`gemini-embedding-2`), and server-side multi-user role authentication.

---

## 7. Blockers & External Configuration Requirements

| Blocker / Requirement | Details & Impact | Resolution Needed for R1 |
|---|---|---|
| **1. No Public PHIVOLCS / NDRRMC JSON API** | Confirmed by `CATALOG_SERVICE_ADAPTERS` (`primerCatalogAdapters.ts:76–85`). PHIVOLCS bulletins/primers and NDRRMC sitreps are ordinary HTML/PDF pages, potentially behind WAF/Cloudflare or varying layouts. | Support operator **local PDF/HTML/text upload & paste** as first-class offline path alongside optional `googleSearch` / `urlContext`; never promise direct automated PHIVOLCS API sync. |
| **2. Missing PDF Text Extractor & File Upload Middleware** | `package.json` includes `jspdf` (write-only), **not** `pdf-parse`/`pdfjs-dist` or `multer`. `server.ts` caps JSON bodies at `2mb` (`server.ts:1172`). | Before R1 coding, add a lightweight PDF text parser (e.g., `pdf-parse` or `pdfjs-dist` workerless/server extract) and either a dedicated binary upload endpoint (`express.raw` / `multer`) or higher scoped limit (`<= 15 MB`) for `/api/primer/research/upload`. |
| **3. `GEMINI_API_KEY` & Billing Quota** | Required in `.env` / AI Studio Secrets for `googleSearch`, `urlContext`, and AI claim extraction. `gemini-4-argon` and `gemini-4-carbon` fail with `429 RESOURCE_EXHAUSTED` on free-tier keys (`server.ts:1145`). | Default research assistant strictly to `gemini-4-hydrogen`; gate AI buttons cleanly when key/network is absent so offline PRIMER remains unaffected. |
| **4. Outbound Network & Crawler Reachability** | Container/air-gapped deployments may block outbound HTTPS to `earthquake.usgs.gov`, Google Gemini API, or external agency hosts; Gemini `urlContext` may fail on bot-protected agency PDFs/sites. | Make every network action strictly user-initiated with `AbortSignal.timeout(15000)`, clear error diagnostics, and fallback to local file upload/manual quote staging. |
| **5. Browser `localStorage` 5 MiB Quota** | `eqp_primer_drafts_v1` shares 5 MiB `localStorage` (`inspectLocalStorageCapacity()` at `primerRevisionArchive.ts:35`). Storing PDFs or HTML documents in `localStorage` will trigger `QuotaExceededError` across EQP. | Persist full `ResearchSourceDocument` records in dedicated **IndexedDB (`eqp_primer_research_sources_v1`)** or `eqp_solutions/`, keeping only lightweight provenance IDs/hashes in `PrimerDocument.extensions`. |
| **6. No Institutional Auth / RBAC on Server** | `server.ts` has no user accounts or digital signatures; `primerReviews.ts` enforces `UNVERIFIED_IDENTITY`. | Keep all imported/extracted claim reviews explicitly scoped as local scientific staging/verification (`Local Operator`), preserving existing Stage 6B non-publication boundaries. |
