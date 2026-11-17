# Scientific Validation & Defect Resolution

## Stage 1 Fixes Verified

1. **Domain Bounds & Shadow-Zone Rejection (`src/utils/jbtab.ts`)**:
   - Out-of-range depth (`z < 0` or `z > 793` P / `> 793.6` S), out-of-range distance (`Δ < 0` or `Δ > 102°` P / `> 107°` S), `NaN`/`Infinity`, and any lookup or interpolation cell touching a `0.00` shadow-zone sentinel return explicit failure statuses (`out_of_depth_range`, `out_of_distance_range`, `unavailable_cell`, `invalid_input`).
   - Exact origin `P(0°, 0 km) = 0.00 s`, `P(45°, 603 km) = 446.60 s`, `S(0°, 0 km) = 10.70 s`, and `S(103°, 793.6 km) = 1400.00 s` are preserved verbatim.
   - `P` (15 depths × 103 distances) and `S` (14 depths × 108 distances) use strictly separate depth grids.
2. **Station Metadata Integrity (`src/utils/hypocenterSolver.ts`)**:
   - Unknown station codes and invalid `(0, 0)`/out-of-bounds station coordinates are rejected cleanly into `rejectedObservations` instead of defaulting to `DEFAULT_PH_CENTER`.
3. **Geometry & Conditioning (`src/utils/hypocenterSolver.ts`)**:
   - Rejects networks with `< 3` distinct valid stations or strictly collinear station geometry (2D perpendicular spread `< 0.25 km`) that creates mirror reflection ambiguity.
   - Evaluates column-equilibrated symmetric Jacobi eigenvalues of `JᵀWJ` before and after inversion; automatically fixes depth at trial depth when 4D depth conditioning exceeds threshold or phases `< 4`.
4. **Zero-Depth Preservation (`src/utils/eqpStorage.ts`, `src/utils/hypocenterSolver.ts`)**:
   - Replaced truthy `depthKm || 15` / `trialDepthKm || 30` checks with `Number.isFinite(...) && >= 0` so valid `0.0 km` surface solutions remain `0.0 km`.
5. **Solver Naming Clarification**:
   - `HypoInverse` mode is documented in code, tooltips, and `ModelSettingsModal` as quality-weighted + higher LM damping inside the internal EQP solver, explicitly **not** official HYPOINVERSE2000 software.

## Blocked Stages (`iasp91` / `ak135`)

- **Stage 4 (`iasp91`) — `BLOCKED / NOT VERIFIED`**: TauP (`taup`), ObsPy (`obspy.taup`), Java, and authoritative `iasp91` velocity/travel-time tables are not installed in this container. To maintain scientific integrity, synthetic or approximated `iasp91` tables were not fabricated.
- **Stage 5 (`ak135`) — `BLOCKED / NOT VERIFIED`**: Same blocker — no authoritative `ak135` travel-time table or external TauP/ObsPy reference oracle exists in this container.
