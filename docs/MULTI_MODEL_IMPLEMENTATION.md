# Multi-Model Implementation Summary

This document summarizes the implemented architecture for separating travel-time models from the hypocenter solver, adding defect fixes to JBTAB/solver logic, and separating candidate calculation from event adoption.

## Modules & Files

- **J-B Table Reader (`src/utils/jbtab.ts`)**:
  - Added discriminated-union `tryLookupJbTravelTime()` returning `{ ok: true, ... } | { ok: false, status, reason }` and `JbLookupError` on `lookupJbTravelTime()`.
  - Eliminated silent clamping outside depth/distance bounds, non-finite inputs returning `0`, shadow-zone `0.00` sentinel interpolation, and shared P/S depth grid assumptions.
  - Raw `JBTAB_PS_RAW` (`src/data/jbtabRaw.ts`) preserved unmodified (`sha256: b5700af2dc29e5bf5421a99bb850417263040e2009015871ee027c09b9efac95`).
- **Decoupled Travel-Time Provider Layer (`src/utils/travelTime/`)**:
  - `types.ts`: `TravelTimeModelId`, `CorrectionProfileId`, `TravelTimePrediction`, `TravelTimeModelMetadata`, `TravelTimeProvider`.
  - `jbProvider.ts`: `createJbTravelTimeProvider()` wrapping verified `JBTAB.PS` lookup with bounds, phase policy, and checksum provenance.
  - `registry.ts`: `getRegisteredModelIds()`, `getAllModelCatalogMetadata()`, `resolveTravelTimeProvider()`. Only `jb-jbtab` is registered as available; `iasp91` and `ak135` are explicitly flagged `available: false, validationStatus: 'unavailable'` with no silent fallback to J-B.
- **Hypocenter Solver (`src/utils/hypocenterSolver.ts`)**:
  - Added `solveHypocenterWithProvider()` (and retained `solveHypocenterWithJbtab()` wrapper).
  - Enforces strict station metadata validation (removed `DEFAULT_PH_CENTER` coordinate fallback).
  - Performs 2D station array collinearity rejection + column-equilibrated Jacobi eigenvalue conditioning check (`analyzeNormalMatrixConditioning`), automatic fixed-depth selection when 4D depth Jacobian is ill-conditioned, separate reporting of unweighted `rmsSec` and weighted `weightedRmsSec`, `errDepthKm`, `azimuthalGapDeg`, `conditionNumber`, and `uncertaintyReliable`.
  - Preserves `0.0` km valid depth (`eqpStorage.ts`, `hypocenterSolver.ts`).
- **Candidate Location Controller & Persistence (`src/utils/locationController.ts`, `src/data/eqpData.ts`, `server.ts`)**:
  - `calculateCandidateLocation()`, `computeObservationSnapshotChecksum()`, `isCandidateSolutionStale()`, `applyCandidateSolutionToEvent()`.
  - `predictFixedHypocenterComparison()` (Mode A) and `runMultiModelRelocationComparison()` (Mode B with common-intersection vs model-native subset disclosure).
  - Companion `.eqp.meta.json` sidecar save/read in `server.ts` preserves `EventLocationMetadata` without breaking legacy `.eqp` text format.
- **GUI Workflow (`src/App.tsx`, `src/components/CandidateSolutionPanel.tsx`, `src/components/ModelSettingsModal.tsx`, `src/components/ModelComparisonModal.tsx`, `src/components/EpicenterMap.tsx`)**:
  - Locate toolbar exposes Solver Engine (`EQP` / `HypoInverse` with non-parity clarification), `Travel-Time Model` selector (disabled options for unavailable models), `Model Settings`, and `Compare Models`.
  - Clicking **Locate Hypocenter** produces a `CandidateLocationSolution` rendered in `CandidateSolutionPanel` above `PLOT.OUT`; **Adopt Solution** promotes it to `activeEvent`, while **Discard** drops it without mutating `activeEvent`.
