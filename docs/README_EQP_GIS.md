# EQP Modern — geological GIS overlay starter pack

## What is included

- `active_faults.geojson` — **6,340** georeferenced line features, from the user-supplied `AF_Philippines` shapefile (EPSG:4326). Named fault and segment information, descriptions, trace and line types, mapping dates, and notes are preserved in normalized feature properties.
- `trench_systems_REVIEW_ONLY.geojson` — **11** mapped features from the `trenchzone_ggrdd` shapefile. Source record 12, an empty *Manila Trench* polyline, was deliberately skipped. This layer includes a named East Luzon transform fault and trough; not all features are trenches.
- `manifest.json` — source file SHA-256 hashes, input/output CRS, record counts, known limits, transformation information.

## IMPORTANT SCIENTIFIC AND QA RESTRICTIONS

These data are supplementary tectonic context layers, **not station data, velocity models, travel-time tables, or PLOTTER1.EXE location-engine inputs**. Do not modify or calibrate the verified scientific solver using these line layers. Drawing the closest mapped fault or trench to an epicenter does **not** identify the earthquake's causative structure. Display any calculated distance, if a separately reviewed geodesic/line-distance method is implemented, as a **map-derived approximate epicentral distance** only.

The fault layer contains active and potentially active fault categories, including variable certainty and styled trace types. Preserve those qualifiers in map legends and popups. Do not silently treat all lines as verified, exact traces. Its 2025-named metadata includes process entries through **2026-02-19**; do not assume the name is a verified dataset version. `st_length_` in the original attributes is not a ready-to-use kilometer distance. Avoid using its values for epicentral proximity.

The legacy trench dataset is identified by its `.prj` as **EPSG:4253 / Luzon 1911**, *not WGS84*. Conversion here uses PROJ's EPSG:4253 -> EPSG:4326 datum transformation (reported operation accuracy **17 m**, which is *not* the accuracy of the mapped source geometry itself). Review the transformation and geographic alignment with an approved GIS reference before operational use; the original metadata indicates processing in 2012. One trench record is empty. The original package includes an old ArcGIS `.lyr` symbol document that is not used by these GeoJSONs.

**Obtain data-owner/version/publication permission** before incorporating these datasets into an official/public EQP product. Preserve copies of the supplied originals separately for scientific provenance.

## Suggested React/TypeScript integration

Place these two GeoJSON files under `public/data/geology/` in EQP Modern for *read-only map overlay* use. Load the fault overlay first; keep the trench layer hidden or explicitly tagged “review-only” until datum/geology verification is approved. Enable separate layer toggles for **Active faults** and **Trenches/tectonic lines**. Add popup details (`fault_name`, `segment_name`, `fault_category`, `trace_type`, `mapped_year`, or trench `name`), distinct line styles for fault categories and certainty, and a source/version note in the legend.

Example fetch (map rendering depends on the application's current map library):

```ts
const response = await fetch('/data/geology/active_faults.geojson');
if (!response.ok) throw new Error('Fault overlay unavailable');
const activeFaults = await response.json();
// Pass activeFaults to the map library's GeoJSON layer; do not alter the location solver.
```

A static GeoJSON file is sufficient for this first layer integration. A database is **not required** unless the app later needs vetted server-side spatial querying, edits, versioned GIS datasets, or central multi-user data administration.

## QA counts

| Check | Active faults | Trench systems |
| --- | ---: | ---: |
| Source records | 6,340 | 12 |
| Exported features | 6,340 | 11 |
| Empty geometry | 0 | 1 |
| Invalid geometry using Shapely is_valid | 0 | 0 (one empty geometry omitted) |
| WGS84 output | Already native | Reprojected from Luzon 1911 |
| Geometry type | LineString / MultiLineString | LineString |
| Named feature groups | 136 fault-name labels | 7 primary NAME labels |

The original active-fault dataset has 2,927 blank `afcodepk` values and 729 blank `globalid` values. Output `Feature.id` values are **row-based within this export** and must not be used as authoritative permanent fault identifiers.

---

## Multi-Provider Basemaps & Offline Philippine PMTiles Readiness

EQP Modern supports selectable 2D basemaps without modifying any earthquake coordinates, depth, magnitude, travel times, picks, or `PLOTTER1.EXE` / solver calculations:

- **OpenFreeMap Liberty** (`https://tiles.openfreemap.org/styles/liberty`) — keyless vector basemap rendered via MapLibre GL JS
- **OpenFreeMap Bright** (`https://tiles.openfreemap.org/styles/bright`) — keyless high-contrast light vector basemap
- **OpenFreeMap Positron** (`https://tiles.openfreemap.org/styles/positron`) — keyless muted basemap for ShakeMap & fault inspection
- **Google Maps** — retained optional commercial basemap (`Terrain`, `Satellite`, `Hybrid`, `Roadmap`) when configured
- **Vector Schematic (Built-in)** — zero-network SVG/Canvas fallback rendered locally inside the app

### Offline Philippines (PMTiles) — Phase B Readiness

**Current status: Disabled (`Not installed`)** until a local `.pmtiles` archive is supplied and verified in an offline environment.

To enable the **Offline Philippines (PMTiles)** option in a future deployment:

1. Generate or place a Philippine OpenMapTiles/Protomaps `.pmtiles` archive at `public/data/basemaps/philippines.pmtiles` (served at `/data/basemaps/philippines.pmtiles`).
2. Ensure the HTTP/static server supports byte-range requests (`Accept-Ranges: bytes`, HTTP `206 Partial Content` on `Range` headers), which PMTiles requires for streaming vector tiles directly from a single archive file. Express static middleware supports `Range` requests out of the box when `acceptRanges` is enabled (default).
3. Install the `pmtiles` npm package and register `maplibregl.addProtocol('pmtiles', new Protocol().tile)` inside `MapLibreEpicenterMap` alongside a local style JSON referencing `pmtiles:///data/basemaps/philippines.pmtiles` (and self-hosted glyphs/sprites for full offline rendering).
4. Set `OFFLINE_PMTILES_CONFIG.installed = true` in `src/utils/maps/basemapConfig.ts` after verifying tile loading and overlay alignment offline.

