# EQP Modern — Pending Codex Reconciliation Register

**Workspace Mode:** Google AI Studio (GAS) Active Feature-Development Workspace  
**Last Updated:** 2026-11-16  
**Git / Migration Status:** Deferred (local Git initialization and GitHub synchronization postponed by user decision)

---

## 1. Baseline Comparison

| Attribute | Current GAS Workspace (Authoritative Active Baseline) | Independent Codex-Tested Version (External / Not Yet Merged) |
| --- | --- | --- |
| **Automated Test Suite** | **165 / 165 PASS** (26 test files under `tests/`) | **169 / 169 PASS** |
| **TypeScript (`tsc --noEmit`)** | **PASS** (0 errors) | Reported **PASS** |
| **Production Bundle (`vite build`)** | **PASS** | Reported **PASS** |
| **Browser / PDF Visual Verification** | Not run in headless GAS container (`PRIMER_FINAL_INTEGRATED_ACCEPTANCE.md`, `PRIMER_RESEARCH_ASSISTANT_R4_FINAL_ACCEPTANCE.md`) | Reported completed (Chromium & PDF visual testing) |
| **Incorporated Acceptance Fixes in GAS** | `DEF-01`–`DEF-03` (PRIMER integrated acceptance), `R4-DEF-01`–`R4-DEF-02` (Research Assistant R4) | **D01–D10** (10 confirmed defects corrected) |
| **Codex Report Present in Workspace** | No (`EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` has not been supplied in this workspace) | `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` |

> **Important:** The ten Codex corrections (**D01–D10**) and the 4 additional tests (`169 - 165 = 4`) are **NOT incorporated** into this GAS workspace. Do not claim they are active here.

---

## 2. Pending Codex Fixes (`D01–D10`) — Awaiting Report Details

The itemized defect descriptions, root causes, and affected file paths for `D01–D10` will be populated here as soon as `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` (or the itemized Codex diff/report) is supplied.

| Codex Defect ID | Summary | Affected Files (Per Codex Report) | Status in GAS Workspace | Action Policy |
| --- | --- | --- | --- | --- |
| **D01** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D02** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D03** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D04** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D05** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D06** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D07** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D08** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D09** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |
| **D10** | Pending details — `EQP_PRIMER_CODEX_LOCAL_TEST_REPORT.md` not yet supplied | Pending report | **NOT INCORPORATED** | Do not reimplement unless required by next task |

---

## 3. Active GAS Development Ground Rules

1. **Major PRIMER Development Frozen:** Do not expand or rewrite `PRIMER` or `Research Assistant` modules unless explicitly instructed.
2. **No Speculative Reimplementation:** Do not attempt to guess or reimplement `D01–D10` unless a specific module task directly requires fixing a shared behavior.
3. **Preserve Scientific & Core Modules:** Keep PLOT hypocenter solver (`src/utils/hypocenterSolver.ts`), J-B travel-time table & registry (`src/utils/jbtab.ts`, `src/utils/travelTime/*`), location controller (`src/utils/locationController.ts`), earthquake event records, station observations (`src/data/eqpData.ts`, `PHILSTA`), and existing scientific/security safeguards intact.
4. **Sequential Verification Discipline:** During each EQP Modern development stage, run only essential TypeScript (`tsc --noEmit`), production build (`vite build`), and focused module tests; defer full repository integration testing until feature development is complete.
5. **No Git Initialization / Migration:** Do not initialize `.git` or execute GitHub synchronization in this workspace until explicitly requested.
