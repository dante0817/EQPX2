# Multi-Model Test Results & Stage Status

- **Stage 0 (Baseline & Environment Audit)**: `COMPLETE` — Verified Node v22.23.2, `tsx`, `tsc --noEmit`, `vite build`; confirmed `JBTAB_PS_RAW` and `JBTAB_b5700af2.txt` share SHA-256 `b5700af2dc29e5bf5421a99bb850417263040e2009015871ee027c09b9efac95`; confirmed TauP / ObsPy / `iasp91` / `ak135` artifacts absent.
- **Stage 1 (JBTAB & Solver Defect Fixes)**: `COMPLETE` — Verified by `tests/jbtab.test.ts` and `tests/solver.test.ts`.
- **Stage 2 (Candidate Location Controller & Companion Persistence)**: `COMPLETE` — Verified by `tests/controller.test.ts` and `server.ts` `.eqp.meta.json` companion sidecars.
- **Stage 3 (Travel-Time Provider Layer & Registry)**: `COMPLETE` — Verified by `tests/solver.test.ts` and `tests/jbtab.test.ts`.
- **Stage 4 (`iasp91` Integration & Parity)**: `BLOCKED / NOT VERIFIED` — Requires external TauP / `obspy.taup` runtime and authoritative `iasp91` table/velocity model.
- **Stage 5 (`ak135` Integration & Parity)**: `BLOCKED / NOT VERIFIED` — Requires external TauP / `obspy.taup` runtime and authoritative `ak135` table/velocity model.
- **Stage 6 (Multi-Model GUI, Settings & Comparison System)**: `COMPLETE` — Type-checked and compiled into Vite bundle (`App.tsx`, `CandidateSolutionPanel.tsx`, `ModelSettingsModal.tsx`, `ModelComparisonModal.tsx`, `EpicenterMap.tsx`). Interactive headless browser DOM click-through verification was not run in shell.
- **Stage 7 (Automated Tests & Build Checks)**:
  - `tests/jbtab.test.ts`: Checksum integrity, exact nodes, bilinear interpolation, bounds errors, shadow-zone `0.00` rejection.
  - `tests/solver.test.ts`: Baseline event convergence, unknown station rejection, collinear array rejection, `0.0 km` depth preservation, hour-rollover `MMSS.ss`, unavailable provider rejection.
  - `tests/controller.test.ts`: Non-mutating Locate, explicit Adopt gating, failure non-adoption, stale checksum/revision detection, Mode A/Mode B comparisons, legacy `.eqp` round-trip compatibility.
  - **Stage 7F (`iasp91`/`ak135` external TauP parity & USGS/ISC catalog comparison)**: `BLOCKED / NOT VERIFIED` (pending TauP/ObsPy and independent reference event catalog).
