import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Layers,
  Map as MapIcon,
  Maximize2,
  MousePointerClick,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  type ButtonStylePreset,
  getWorkstationButtonClass,
  type IconStylePreset,
  WorkstationActionIcon,
} from './WorkstationIcons';
import {
  ACTIVE_VOLCANOES,
  EarthquakeOriginType,
  EQPEvent,
  FAULT_TRACES,
  ISLAND_POLYGONS,
  isEventUnlocated,
  TECTONIC_PLATES,
} from '../data/eqpData';
import { buildBulletinSaveTarget } from '../utils/eqpStorage';
import { buildBulletinHtmlDocument } from '../utils/bulletinHtml';
import { formatGroupedBulletinIntensityBlock } from '../utils/intensityFormat';
import { ShakeMapResult } from '../utils/shakemap';
import { BulletinSummaryTable } from './BulletinSummaryTable';
import {
  approveUncalibratedMagnitudeMetadata,
  hasValidUncalibratedApproval,
  type MagnitudeFreshnessInspection,
  resolveBulletinMagnitude,
} from '../utils/magnitudeEngine';

export type BulletinMapStyle = 'classic' | 'topo' | 'dark' | 'mono';
export type BulletinMapExtent = 'regional' | 'focused' | 'national';

export interface BulletinMapLayers {
  faults: boolean;
  trenches: boolean;
  plates: boolean;
  cities: boolean;
  volcanoes: boolean;
  stations: boolean;
  shakemap: boolean;
  grid: boolean;
  scaleAndNorth: boolean;
  errorEllipse: boolean;
}

export interface OpenedBulletinDoc {
  filename: string;
  displayPath: string;
  relPath?: string;
  htmlContent: string;
}

interface BulletinViewProps {
  event: EQPEvent;
  freshness?: MagnitudeFreshnessInspection;
  solutionDrive: string;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  shakeMap?: ShakeMapResult | null;
  printSource: boolean;
  onChangePrintSource: (value: boolean) => void;
  pdfIncludeMap: boolean;
  onChangePdfIncludeMap: (value: boolean) => void;
  pdfIncludeCharts: boolean;
  onChangePdfIncludeCharts: (value: boolean) => void;
  isGeneratingPdf: boolean;
  openedBulletin?: OpenedBulletinDoc | null;
  onCloseOpenedBulletin?: () => void;
  onBulletinHtmlProviderChange?: (getter: (() => string) | null) => void;
  onUpdateEvent: (updater: (ev: EQPEvent) => EQPEvent) => void;
  onDownloadPdf: () => void;
  onPrintBulletin: () => void;
  onSaveCatalog: () => void;
  onNotice: (msg: string) => void;
  iconStyle?: IconStylePreset;
  buttonStyle?: ButtonStylePreset;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const ORIGIN_TYPES: EarthquakeOriginType[] = [
  'TECTONIC',
  'VOLCANIC',
  'VOLCANO -TECTONIC',
];

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

const DEFAULT_LAYERS: BulletinMapLayers = {
  faults: true,
  trenches: true,
  plates: false,
  cities: true,
  volcanoes: false,
  stations: false,
  shakemap: false,
  grid: true,
  scaleAndNorth: true,
  errorEllipse: false,
};

const MAP_STYLE_THEMES: Record<
  BulletinMapStyle,
  {
    label: string;
    seaFill: string;
    landFill: string;
    landStroke: string;
    gridStroke: string;
    trenchStroke: string;
    trenchLabel: string;
    faultStroke: string;
    cityDot: string;
    cityText: string;
    volcanoFill: string;
    volcanoText: string;
    stationFill: string;
    stationText: string;
    frameStroke: string;
    tickStroke: string;
    tickText: string;
    scaleBg: string;
    scaleStroke: string;
    scaleText: string;
    outerBg: string;
  }
> = {
  classic: {
    label: 'Classic PHIVOLCS',
    seaFill: '#aef4ff',
    landFill: '#e7e9ec',
    landStroke: '#475569',
    gridStroke: '#7dd3fc',
    trenchStroke: '#7e22ce',
    trenchLabel: '#1e293b',
    faultStroke: '#dc2626',
    cityDot: '#334155',
    cityText: '#0f172a',
    volcanoFill: '#ea580c',
    volcanoText: '#9a3412',
    stationFill: '#0284c7',
    stationText: '#0c4a6e',
    frameStroke: '#0f172a',
    tickStroke: '#334155',
    tickText: '#0f172a',
    scaleBg: 'rgba(255, 255, 255, 0.88)',
    scaleStroke: '#0f172a',
    scaleText: '#0f172a',
    outerBg: '#ffffff',
  },
  topo: {
    label: 'Topo Relief',
    seaFill: '#c7e3f4',
    landFill: '#e5dfc9',
    landStroke: '#57534e',
    gridStroke: '#93c5fd',
    trenchStroke: '#6d28d9',
    trenchLabel: '#1e293b',
    faultStroke: '#b91c1c',
    cityDot: '#292524',
    cityText: '#1c1917',
    volcanoFill: '#d97706',
    volcanoText: '#78350f',
    stationFill: '#0f766e',
    stationText: '#134e4a',
    frameStroke: '#292524',
    tickStroke: '#44403c',
    tickText: '#1c1917',
    scaleBg: 'rgba(255, 251, 235, 0.9)',
    scaleStroke: '#292524',
    scaleText: '#1c1917',
    outerBg: '#ffffff',
  },
  dark: {
    label: 'Dark Seismic',
    seaFill: '#0b1324',
    landFill: '#1e293b',
    landStroke: '#64748b',
    gridStroke: '#1e3a5f',
    trenchStroke: '#a78bfa',
    trenchLabel: '#cbd5e1',
    faultStroke: '#fb7185',
    cityDot: '#94a3b8',
    cityText: '#e2e8f0',
    volcanoFill: '#fb923c',
    volcanoText: '#fdba74',
    stationFill: '#22d3ee',
    stationText: '#a5f3fc',
    frameStroke: '#334155',
    tickStroke: '#64748b',
    tickText: '#e2e8f0',
    scaleBg: 'rgba(15, 23, 42, 0.88)',
    scaleStroke: '#cbd5e1',
    scaleText: '#f1f5f9',
    outerBg: '#0f172a',
  },
  mono: {
    label: 'Print B&W',
    seaFill: '#ffffff',
    landFill: '#e2e8f0',
    landStroke: '#1e293b',
    gridStroke: '#cbd5e1',
    trenchStroke: '#475569',
    trenchLabel: '#0f172a',
    faultStroke: '#0f172a',
    cityDot: '#0f172a',
    cityText: '#0f172a',
    volcanoFill: '#334155',
    volcanoText: '#0f172a',
    stationFill: '#475569',
    stationText: '#0f172a',
    frameStroke: '#000000',
    tickStroke: '#000000',
    tickText: '#000000',
    scaleBg: 'rgba(255, 255, 255, 0.94)',
    scaleStroke: '#000000',
    scaleText: '#000000',
    outerBg: '#ffffff',
  },
};

const PH_CITY_MARKERS: Array<{ name: string; lon: number; lat: number; dx?: number; dy?: number }> = [
  { name: 'Baguio City', lon: 120.59, lat: 16.41, dx: -32, dy: -3 },
  { name: 'Balanga City', lon: 120.54, lat: 14.68, dx: -38, dy: 4 },
  { name: 'Manila', lon: 120.98, lat: 14.60, dx: 5, dy: -3 },
  { name: 'Calapan City', lon: 121.18, lat: 13.41, dx: -30, dy: 8 },
  { name: 'Legazpi City', lon: 123.73, lat: 13.14, dx: 5, dy: -3 },
  { name: 'Sorsogon City', lon: 124.01, lat: 12.97, dx: 5, dy: 7 },
  { name: 'Catarman', lon: 124.64, lat: 12.50, dx: 5, dy: -3 },
  { name: 'Borongan', lon: 125.43, lat: 11.61, dx: -28, dy: -5 },
  { name: 'Tacloban', lon: 125.00, lat: 11.24, dx: -24, dy: -4 },
  { name: 'Kalibo', lon: 122.36, lat: 11.71, dx: -18, dy: -4 },
  { name: 'Iloilo City', lon: 122.56, lat: 10.72, dx: -24, dy: 8 },
  { name: 'Bacolod City', lon: 122.95, lat: 10.67, dx: 5, dy: 4 },
  { name: 'Cebu City', lon: 123.89, lat: 10.31, dx: 5, dy: 3 },
  { name: 'Puerto Princesa City', lon: 118.74, lat: 9.74, dx: 5, dy: 3 },
  { name: 'Surigao City', lon: 125.49, lat: 9.78, dx: 5, dy: -3 },
  { name: 'Dipolog City', lon: 123.34, lat: 8.59, dx: -24, dy: 7 },
  { name: 'Cagayan de Oro City', lon: 124.63, lat: 8.48, dx: 5, dy: 6 },
  { name: 'Davao City', lon: 125.61, lat: 7.07, dx: 5, dy: 3 },
];

function formatBulletinDate(isoDate: string): {
  display: string;
  yyyy: string;
  mm: string;
  dd: string;
} {
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    const monthIdx = Math.max(0, Math.min(11, (Number(mm) || 1) - 1));
    return {
      display: `${dd.padStart(2, '0')} ${MONTHS_SHORT[monthIdx]} ${yyyy}`,
      yyyy,
      mm: mm.padStart(2, '0'),
      dd: dd.padStart(2, '0'),
    };
  }
  return { display: isoDate || '01 Jan 2026', yyyy: '2026', mm: '01', dd: '01' };
}

function formatBulletinTime(
  timeStr: string,
  use12Hour: boolean
): { full: string; short: string; hh: string; min: string } {
  const parts = timeStr.split(':');
  const hhNum = Math.max(0, Math.min(23, Number(parts[0]) || 0));
  const minNum = Math.max(0, Math.min(59, Number(parts[1]) || 0));
  const secNum = Math.max(0, Math.min(59, Math.round(Number(parts[2]) || 0)));
  const hh = String(hhNum).padStart(2, '0');
  const min = String(minNum).padStart(2, '0');
  const sec = String(secNum).padStart(2, '0');

  if (!use12Hour) {
    return {
      full: `${hh}:${min}:${sec}`,
      short: `${hh}:${min}`,
      hh,
      min,
    };
  }

  const amPm = hhNum >= 12 ? 'PM' : 'AM';
  const hh12 = String(hhNum % 12 || 12).padStart(2, '0');
  return {
    full: `${hh12}:${min}:${sec} ${amPm}`,
    short: `${hh12}:${min} ${amPm}`,
    hh,
    min,
  };
}

function formatIssuedFallback(): { date: string; time: string } {
  const now = new Date();
  const lst = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dd = String(lst.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[lst.getUTCMonth()];
  const yyyy = lst.getUTCFullYear();
  const h24 = lst.getUTCHours();
  const amPm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = String(h24 % 12 || 12).padStart(2, '0');
  const min = String(lst.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${dd} ${mon} ${yyyy}`,
    time: `${h12}:${min} ${amPm}`,
  };
}

function ringToSvgPath(
  ring: Array<[number, number]>,
  project: (lon: number, lat: number) => [number, number]
): string {
  if (ring.length === 0) return '';
  return (
    ring
      .map(([lon, lat], idx) => {
        const [x, y] = project(lon, lat);
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

interface BulletinMapSvgProps {
  event: EQPEvent;
  mapStyle: BulletinMapStyle;
  mapExtent: BulletinMapExtent;
  layers: BulletinMapLayers;
  shakeMap?: ShakeMapResult | null;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

const BulletinMapSvg: React.FC<BulletinMapSvgProps> = ({
  event,
  mapStyle,
  mapExtent,
  layers,
  shakeMap,
  svgRef,
}) => {
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const unlocated = isEventUnlocated(event);
  const targetLat = unlocated ? 12.0 : event.lat;
  const targetLon = unlocated ? 123.0 : event.lon;
  const theme = MAP_STYLE_THEMES[mapStyle];

  let minLon: number;
  let maxLon: number;
  let minLat: number;
  let maxLat: number;

  if (mapExtent === 'national') {
    minLon = 116;
    maxLon = 128;
    minLat = 4.5;
    maxLat = 19.5;
  } else if (mapExtent === 'focused') {
    minLon = targetLon - 2.3;
    maxLon = targetLon + 2.3;
    minLat = Math.max(4, targetLat - 1.5);
    maxLat = Math.min(21, targetLat + 1.5);
  } else {
    // Classic regional PHIVOLCS bulletin bounding box
    minLon = Math.min(117, Math.floor(targetLon - 5));
    maxLon = Math.max(129, Math.ceil(targetLon + 4));
    minLat = Math.max(4, Math.min(8, Math.floor(targetLat - 3.5)));
    maxLat = Math.min(20, Math.max(15, Math.ceil(targetLat + 3.5)));
  }

  const svgW = 500;
  const svgH = 266;
  const padL = 34;
  const padR = 34;
  const padT = 20;
  const padB = 20;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const project = (lon: number, lat: number): [number, number] => [
    padL + ((lon - minLon) / Math.max(0.5, maxLon - minLon)) * plotW,
    padT + ((maxLat - lat) / Math.max(0.5, maxLat - minLat)) * plotH,
  ];

  const tickStep = mapExtent === 'national' ? 2 : 1;
  const lonTicks: number[] = [];
  for (let l = Math.ceil(minLon); l <= Math.floor(maxLon); l += tickStep) {
    lonTicks.push(l);
  }
  const latTicks: number[] = [];
  for (let l = Math.ceil(minLat); l <= Math.floor(maxLat); l += tickStep) {
    latTicks.push(l);
  }

  const [epiX, epiY] = project(targetLon, targetLat);

  // Dynamic nice scale bar inside SVG frame
  const midLat = (minLat + maxLat) / 2;
  const degLonKm = 111.32 * Math.max(0.25, Math.cos((midLat * Math.PI) / 180));
  const totalWidthKm = (maxLon - minLon) * degLonKm;
  const targetScalePx = 76;
  const rawKm = (targetScalePx / plotW) * totalWidthKm;
  const niceSteps = [10, 20, 25, 50, 100, 150, 200, 250, 300, 500];
  const scaleKm =
    niceSteps.reduce((best, cand) =>
      Math.abs(cand - rawKm) < Math.abs(best - rawKm) ? cand : best
    ) || 100;
  const scalePx = Math.max(24, Math.min(110, (scaleKm / totalWidthKm) * plotW));

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * svgW;
    const svgY = ((e.clientY - rect.top) / rect.height) * svgH;
    if (svgX < padL || svgX > padL + plotW || svgY < padT || svgY > padT + plotH) {
      setCursorCoords(null);
      return;
    }
    const lon = minLon + ((svgX - padL) / plotW) * (maxLon - minLon);
    const lat = maxLat - ((svgY - padT) / plotH) * (maxLat - minLat);
    setCursorCoords({ lat, lon });
  };

  return (
    <div className="relative w-full max-w-[465px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgW} ${svgH}`}
        onMouseMove={handleSvgMouseMove}
        onMouseLeave={() => setCursorCoords(null)}
        className="w-full h-auto block select-none cursor-crosshair"
        style={{ backgroundColor: theme.outerBg }}
        role="img"
        aria-label={
          unlocated
            ? 'Philippine seismicity reference map'
            : `Bulletin epicenter map at ${event.lat.toFixed(2)}°N, ${event.lon.toFixed(2)}°E`
        }
      >
        <defs>
          <clipPath id="bulletin-map-plot-clip">
            <rect x={padL} y={padT} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Top & bottom longitude ticks + labels */}
        {lonTicks.map((lon) => {
          const [tx] = project(lon, minLat);
          return (
            <g key={`lon-${lon}`}>
              <line x1={tx} y1={padT - 3} x2={tx} y2={padT} stroke={theme.tickStroke} strokeWidth={0.8} />
              <line
                x1={tx}
                y1={padT + plotH}
                x2={tx}
                y2={padT + plotH + 3}
                stroke={theme.tickStroke}
                strokeWidth={0.8}
              />
              <text
                x={tx}
                y={padT - 6}
                textAnchor="middle"
                fontSize={7}
                fill={theme.tickText}
                className="font-sans"
              >
                {lon}°E
              </text>
              <text
                x={tx}
                y={padT + plotH + 11}
                textAnchor="middle"
                fontSize={7}
                fill={theme.tickText}
                className="font-sans"
              >
                {lon}°E
              </text>
            </g>
          );
        })}

        {/* Left & right latitude ticks + labels */}
        {latTicks.map((lat) => {
          const [, ty] = project(minLon, lat);
          return (
            <g key={`lat-${lat}`}>
              <line x1={padL - 3} y1={ty} x2={padL} y2={ty} stroke={theme.tickStroke} strokeWidth={0.8} />
              <line
                x1={padL + plotW}
                y1={ty}
                x2={padL + plotW + 3}
                y2={ty}
                stroke={theme.tickStroke}
                strokeWidth={0.8}
              />
              <text
                x={padL - 5}
                y={ty + 2.5}
                textAnchor="end"
                fontSize={7}
                fill={theme.tickText}
                className="font-sans"
              >
                {lat}°N
              </text>
              <text
                x={padL + plotW + 5}
                y={ty + 2.5}
                textAnchor="start"
                fontSize={7}
                fill={theme.tickText}
                className="font-sans"
              >
                {lat}°N
              </text>
            </g>
          );
        })}

        {/* Map Interior */}
        <g clipPath="url(#bulletin-map-plot-clip)">
          {/* Ocean Fill */}
          <rect x={padL} y={padT} width={plotW} height={plotH} fill={theme.seaFill} />

          {/* Tectonic Plate Polygons */}
          {layers.plates &&
            TECTONIC_PLATES.map((plate) => {
              const pts = plate.points
                .map(([lon, lat]) => {
                  const [x, y] = project(lon, lat);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ');
              const [lx, ly] = project(plate.labelCoord[0], plate.labelCoord[1]);
              return (
                <g key={plate.id}>
                  <polygon
                    points={pts}
                    fill={mapStyle === 'mono' ? 'rgba(100,116,139,0.08)' : plate.fillColor}
                    stroke={mapStyle === 'mono' ? '#64748b' : plate.strokeColor}
                    strokeWidth={0.7}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={lx}
                    y={ly}
                    fontSize={6.5}
                    fontWeight={600}
                    fill={mapStyle === 'dark' ? '#cbd5e1' : '#334155'}
                    textAnchor="middle"
                    opacity={0.78}
                  >
                    {plate.shortLabel}
                  </text>
                </g>
              );
            })}

          {/* Coordinate Grid */}
          {layers.grid &&
            lonTicks.map((lon) => {
              const [gx] = project(lon, minLat);
              return (
                <line
                  key={`glon-${lon}`}
                  x1={gx}
                  y1={padT}
                  x2={gx}
                  y2={padT + plotH}
                  stroke={theme.gridStroke}
                  strokeWidth={0.45}
                  strokeDasharray="2 3"
                />
              );
            })}
          {layers.grid &&
            latTicks.map((lat) => {
              const [, gy] = project(minLon, lat);
              return (
                <line
                  key={`glat-${lat}`}
                  x1={padL}
                  y1={gy}
                  x2={padL + plotW}
                  y2={gy}
                  stroke={theme.gridStroke}
                  strokeWidth={0.45}
                  strokeDasharray="2 3"
                />
              );
            })}

          {/* Philippine Islands */}
          {ISLAND_POLYGONS.map((island) => {
            const pts = island.points
              .map(([lon, lat]) => {
                const [x, y] = project(lon, lat);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(' ');
            return (
              <polygon
                key={island.name}
                points={pts}
                fill={theme.landFill}
                stroke={theme.landStroke}
                strokeWidth={mapStyle === 'topo' ? 1.15 : 0.9}
                strokeLinejoin="round"
              />
            );
          })}

          {/* ShakeMap PEIS Contours Overlay */}
          {layers.shakemap &&
            shakeMap &&
            !unlocated &&
            shakeMap.contours.map((contour, idx) => {
              const pathD = contour.rings
                .map((ring) => ringToSvgPath(ring, project))
                .join(' ');
              if (!pathD) return null;
              const [lblLon, lblLat] = contour.labelPoint ?? contour.centroid;
              const [lx, ly] = project(lblLon, lblLat);
              return (
                <g key={`b-sm-${contour.threshold}-${idx}`}>
                  <path
                    d={pathD}
                    fill={mapStyle === 'mono' ? 'rgba(15,23,42,0.10)' : contour.band.fillHex}
                    fillOpacity={mapStyle === 'mono' ? 0.35 : 0.34}
                    fillRule="evenodd"
                    stroke={mapStyle === 'mono' ? '#1e293b' : contour.band.strokeHex}
                    strokeWidth={0.95}
                  />
                  {lx > padL + 8 && lx < padL + plotW - 8 && ly > padT + 8 && ly < padT + plotH - 8 && (
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={7.5}
                      fontWeight={700}
                      fill={mapStyle === 'mono' ? '#0f172a' : contour.band.strokeHex}
                      stroke={mapStyle === 'dark' ? '#0f172a' : '#ffffff'}
                      strokeWidth={2}
                      paintOrder="stroke"
                      className="font-mono"
                    >
                      {contour.band.roman}
                    </text>
                  )}
                </g>
              );
            })}

          {/* Subduction Trenches */}
          {layers.trenches &&
            FAULT_TRACES.filter((f) => f.kind === 'boundary').map((boundary) => {
              const d = boundary.points
                .map(([lon, lat], idx) => {
                  const [x, y] = project(lon, lat);
                  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(' ');
              const midPt = boundary.points[Math.floor(boundary.points.length / 2)];
              const [lx, ly] = project(midPt[0], midPt[1]);
              const isPhilTrench = boundary.name.toLowerCase().includes('philippine');
              return (
                <g key={boundary.name}>
                  <path
                    d={d}
                    fill="none"
                    stroke={theme.trenchStroke}
                    strokeWidth={1.15}
                    strokeDasharray="3.5 2.5"
                  />
                  <text
                    x={isPhilTrench ? lx + 9 : lx - 8}
                    y={ly}
                    fontSize={7.5}
                    fill={theme.trenchLabel}
                    textAnchor="middle"
                    transform={`rotate(${isPhilTrench ? 74 : -75} ${isPhilTrench ? lx + 9 : lx - 8} ${ly})`}
                    className="font-sans"
                  >
                    {boundary.name}
                  </text>
                </g>
              );
            })}

          {/* Active Faults */}
          {layers.faults &&
            FAULT_TRACES.filter((f) => f.kind === 'fault').map((fault) => {
              const d = fault.points
                .map(([lon, lat], idx) => {
                  const [x, y] = project(lon, lat);
                  return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <path
                  key={fault.name}
                  d={d}
                  fill="none"
                  stroke={theme.faultStroke}
                  strokeWidth={1.05}
                  strokeDasharray="3 2"
                />
              );
            })}

          {/* Active Volcanoes */}
          {layers.volcanoes &&
            ACTIVE_VOLCANOES.map((vol) => {
              const [vx, vy] = project(vol.lon, vol.lat);
              if (vx < padL || vx > padL + plotW || vy < padT || vy > padT + plotH) {
                return null;
              }
              return (
                <g key={vol.name}>
                  <polygon
                    points={`${vx},${vy - 4.2} ${vx - 3.8},${vy + 2.8} ${vx + 3.8},${vy + 2.8}`}
                    fill={theme.volcanoFill}
                    stroke="#ffffff"
                    strokeWidth={0.7}
                  />
                  <text
                    x={vx + 5}
                    y={vy + 2}
                    fontSize={6.5}
                    fontWeight={600}
                    fill={theme.volcanoText}
                    className="font-sans"
                  >
                    {vol.name}
                  </text>
                </g>
              );
            })}

          {/* Picked Seismic Stations & P-Ray Paths */}
          {layers.stations &&
            event.picks.map((pick) => {
              const [sx, sy] = project(pick.lon, pick.lat);
              const excluded = pick.pExcluded;
              const fill = excluded ? '#94a3b8' : theme.stationFill;
              return (
                <g key={pick.id}>
                  {!unlocated && !excluded && (
                    <line
                      x1={sx}
                      y1={sy}
                      x2={epiX}
                      y2={epiY}
                      stroke={theme.stationFill}
                      strokeOpacity={0.35}
                      strokeWidth={0.7}
                    />
                  )}
                  <polygon
                    points={`${sx},${sy - 3.8} ${sx - 3.4},${sy + 2.6} ${sx + 3.4},${sy + 2.6}`}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={0.7}
                  />
                  <text
                    x={sx + 4.5}
                    y={sy + 2}
                    fontSize={6.5}
                    fontWeight={600}
                    fill={theme.stationText}
                    className="font-mono"
                  >
                    {pick.sta}
                  </text>
                </g>
              );
            })}

          {/* Major City Labels */}
          {layers.cities &&
            PH_CITY_MARKERS.map((city) => {
              if (
                city.lon < minLon + 0.25 ||
                city.lon > maxLon - 0.25 ||
                city.lat < minLat + 0.25 ||
                city.lat > maxLat - 0.25
              ) {
                return null;
              }
              const [cx, cy] = project(city.lon, city.lat);
              return (
                <g key={city.name}>
                  <circle cx={cx} cy={cy} r={1.6} fill={theme.cityDot} />
                  <text
                    x={cx + (city.dx ?? 4)}
                    y={cy + (city.dy ?? 3)}
                    fontSize={7}
                    fill={theme.cityText}
                    className="font-sans"
                  >
                    {city.name}
                  </text>
                </g>
              );
            })}

          {/* Epicenter Error Ellipse + Marker */}
          {!unlocated && (
            <g>
              {layers.errorEllipse && (
                <ellipse
                  cx={epiX}
                  cy={epiY}
                  rx={Math.max(8, Math.min(28, (event.errLonDeg || 0.05) * 280))}
                  ry={Math.max(6, Math.min(22, (event.errLatDeg || 0.05) * 260))}
                  fill="rgba(220, 38, 38, 0.14)"
                  stroke="#dc2626"
                  strokeWidth={0.9}
                  strokeDasharray="2 1.5"
                />
              )}
              <circle
                cx={epiX}
                cy={epiY}
                r={5.2}
                fill={mapStyle === 'mono' ? '#0f172a' : '#ff0000'}
                stroke={mapStyle === 'mono' ? '#ffffff' : '#7f1d1d'}
                strokeWidth={1}
              />
            </g>
          )}

          {/* Scale Bar & North Arrow */}
          {layers.scaleAndNorth && (
            <g>
              {/* Scale Bar bottom-left */}
              <g transform={`translate(${padL + 8}, ${padT + plotH - 20})`}>
                <rect
                  x={-4}
                  y={-4}
                  width={scalePx + 14}
                  height={18}
                  rx={1.5}
                  fill={theme.scaleBg}
                  stroke={theme.scaleStroke}
                  strokeWidth={0.5}
                />
                <line
                  x1={0}
                  y1={7}
                  x2={scalePx}
                  y2={7}
                  stroke={theme.scaleStroke}
                  strokeWidth={1.3}
                />
                <line x1={0} y1={4} x2={0} y2={9} stroke={theme.scaleStroke} strokeWidth={1.1} />
                <line
                  x1={scalePx}
                  y1={4}
                  x2={scalePx}
                  y2={9}
                  stroke={theme.scaleStroke}
                  strokeWidth={1.1}
                />
                <text
                  x={scalePx / 2}
                  y={4}
                  textAnchor="middle"
                  fontSize={6.5}
                  fontWeight={700}
                  fill={theme.scaleText}
                  className="font-mono"
                >
                  {scaleKm} km
                </text>
              </g>

              {/* North Arrow top-right */}
              <g transform={`translate(${padL + plotW - 15}, ${padT + 16})`}>
                <circle
                  cx={0}
                  cy={0}
                  r={9.5}
                  fill={theme.scaleBg}
                  stroke={theme.scaleStroke}
                  strokeWidth={0.5}
                />
                <polygon points="0,-6.5 -3,2.5 0,0.5 3,2.5" fill={theme.scaleStroke} />
                <text
                  x={0}
                  y={7.5}
                  textAnchor="middle"
                  fontSize={5.5}
                  fontWeight={700}
                  fill={theme.scaleText}
                  className="font-sans"
                >
                  N
                </text>
              </g>
            </g>
          )}
        </g>

        {/* Crisp Outer Map Frame */}
        <rect
          x={padL}
          y={padT}
          width={plotW}
          height={plotH}
          fill="none"
          stroke={theme.frameStroke}
          strokeWidth={1.1}
        />
      </svg>

      {cursorCoords && (
        <div className="pointer-events-none absolute bottom-6 right-9 px-1.5 py-0.5 bg-slate-900/80 text-white font-mono text-[9.5px] tabular-nums rounded-xs">
          {cursorCoords.lat.toFixed(2)}°N, {cursorCoords.lon.toFixed(2)}°E
        </div>
      )}
    </div>
  );
};

export const BulletinView: React.FC<BulletinViewProps> = ({
  event,
  freshness,
  solutionDrive,
  primaryLocationLabel,
  faultGeneratorLabel,
  shakeMap,
  printSource,
  onChangePrintSource,
  pdfIncludeMap,
  onChangePdfIncludeMap,
  pdfIncludeCharts,
  onChangePdfIncludeCharts,
  isGeneratingPdf,
  openedBulletin = null,
  onCloseOpenedBulletin,
  onBulletinHtmlProviderChange,
  onUpdateEvent,
  onDownloadPdf,
  onPrintBulletin,
  onSaveCatalog,
  onNotice,
  iconStyle = 'classic-3d',
  buttonStyle = 'classic-keycap',
}) => {
  const [mapStyle, setMapStyle] = useState<BulletinMapStyle>('classic');
  const [mapExtent, setMapExtent] = useState<BulletinMapExtent>('regional');
  const [layers, setLayers] = useState<BulletinMapLayers>(DEFAULT_LAYERS);
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);

  const [zoom, setZoom] = useState<number>(1);
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState<boolean>(true);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [articleNaturalSize, setArticleNaturalSize] = useState<{ w: number; h: number }>({
    w: 650,
    h: 920,
  });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const layersMenuRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  // Track bulletin document natural pixel dimensions for clean layout-preserving zoom
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.offsetWidth || 650;
      const h = el.offsetHeight || 920;
      setArticleNaturalSize((prev) =>
        prev.w === w && prev.h === h ? prev : { w, h }
      );
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [event, printSource, mapExtent, layers.shakemap]);

  // Close layers menu on outside click
  useEffect(() => {
    if (!layersMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target as Node)) {
        setLayersMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [layersMenuOpen]);

  // Native non-passive wheel listener so mouse wheel zooming suppresses page scroll cleanly
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!wheelZoomEnabled && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      setZoom((prev) => {
        const next = Math.round((prev + delta) * 100) / 100;
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [wheelZoomEnabled]);

  const unlocated = isEventUnlocated(event);
  const magResolution = resolveBulletinMagnitude(event, freshness);
  const activeMagnitude =
    magResolution.canPublish && magResolution.value !== null ? magResolution.value : 0;

  const gmtDate = formatBulletinDate(event.originDateGmt);
  const gmtTime = formatBulletinTime(event.originTimeGmt, false);
  const lstDate = formatBulletinDate(event.originDateLst);
  const lstTime = formatBulletinTime(event.originTimeLst, true);

  const fallbackIssued = useMemo(() => formatIssuedFallback(), []);
  const issuedDateDisplay = event.issuedDate || fallbackIssued.date;
  const issuedTimeDisplay = event.issuedTime || fallbackIssued.time;
  const issuedByDisplay = event.issuedBy || 'DSS';
  const originType: EarthquakeOriginType = event.originType ?? 'TECTONIC';

  const bulletinNo = Math.max(1, Math.trunc(event.bulletinNo || 1));
  const bulletinTarget = useMemo(
    () => buildBulletinSaveTarget(event, solutionDrive),
    [event, solutionDrive]
  );
  const htmlFilename = openedBulletin ? openedBulletin.filename : bulletinTarget.filename;
  const htmlFullPath = openedBulletin ? openedBulletin.displayPath : bulletinTarget.fullPath;

  const magCode = String(Math.round(Math.max(0, activeMagnitude) * 10)).padStart(2, '0');
  const depthCode = String(Math.round(Math.max(0, event.depthKm))).padStart(3, '0');
  const stampCode = `${gmtDate.yyyy}_${gmtDate.mm}${gmtDate.dd}_${gmtTime.hh}${gmtTime.min}_M${magCode}D${depthCode}_B${bulletinNo}`;

  const activeLayerCount = useMemo(
    () => Object.values(layers).filter(Boolean).length,
    [layers]
  );

  const handleZoomStep = (delta: number) => {
    setZoom((prev) => {
      const next = Math.round((prev + delta) * 100) / 100;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    });
  };

  const handleFitWidth = () => {
    const vp = viewportRef.current;
    if (!vp) {
      setZoom(1);
      return;
    }
    const available = Math.max(320, vp.clientWidth - 40);
    const fitScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((available / 650) * 20) / 20));
    setZoom(fitScale);
  };

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, label')) return;
    const vp = viewportRef.current;
    if (!vp) return;
    panStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
    };
    setIsPanning(true);
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panStateRef.current.active || !viewportRef.current) return;
    const dx = e.clientX - panStateRef.current.startX;
    const dy = e.clientY - panStateRef.current.startY;
    viewportRef.current.scrollLeft = panStateRef.current.scrollLeft - dx;
    viewportRef.current.scrollTop = panStateRef.current.scrollTop - dy;
  };

  const handleViewportPointerUp = () => {
    if (panStateRef.current.active) {
      panStateRef.current.active = false;
      setIsPanning(false);
    }
  };

  const toggleLayer = (key: keyof BulletinMapLayers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getDisplayedHtml = () => {
    if (openedBulletin) {
      return openedBulletin.htmlContent;
    }
    return buildBulletinHtmlDocument({
      event,
      primaryLocationLabel,
      faultGeneratorLabel,
      printSource,
      mapSvgMarkup: mapSvgRef.current ? mapSvgRef.current.outerHTML : '',
      freshness,
    });
  };

  const getDisplayedHtmlRef = useRef(getDisplayedHtml);
  getDisplayedHtmlRef.current = getDisplayedHtml;

  useEffect(() => {
    if (!onBulletinHtmlProviderChange) return;
    onBulletinHtmlProviderChange(() => getDisplayedHtmlRef.current());
    return () => {
      onBulletinHtmlProviderChange(null);
    };
  }, [onBulletinHtmlProviderChange]);

  const exportBlockedReason =
    !openedBulletin && (magResolution.isStale || magResolution.requiresAnalystConfirmation)
      ? magResolution.warning ??
        (magResolution.isStale
          ? 'Magnitude calculation is stale. Recalculate magnitude before exporting the bulletin.'
          : `Confirm uncalibrated ${magResolution.scaleLabel} magnitude before exporting the bulletin.`)
      : null;

  const handleDownloadHtml = () => {
    if (exportBlockedReason) {
      onNotice(exportBlockedReason);
      return;
    }
    const html = getDisplayedHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = htmlFilename;
    a.click();
    URL.revokeObjectURL(url);
    onNotice(`Exported HTML bulletin with map: ${htmlFilename}`);
  };

  const scaledWidth = Math.round(articleNaturalSize.w * zoom);
  const scaledHeight = Math.round(articleNaturalSize.h * zoom);

  return (
    <div className="flex-1 min-h-full flex flex-col md:flex-row bg-[#f0f0f0] text-slate-900">
      {/* Left Classic Peach Bulletin Control Sidebar */}
      <aside className="w-full md:w-[196px] shrink-0 bg-[#fed3a8] border-b md:border-b-0 md:border-r border-slate-500 flex flex-col justify-between text-[12px]">
        <div>
          {/* GMT & LST Timestamp Header Boxes */}
          <div className="bg-white border-b border-slate-400 px-1.5 py-0.5 text-[11.5px] font-normal tabular-nums text-slate-900">
            {gmtDate.display} - {gmtTime.full}
          </div>
          <div className="bg-white border-b border-slate-400 px-1.5 py-0.5 text-[11.5px] font-normal tabular-nums text-slate-900">
            {lstDate.display} - {lstTime.full}
          </div>

          {/* Origin Lavender Box */}
          <div className="bg-[#d5d4ff] border-b border-slate-400/80 px-2 py-1.5 space-y-1">
            <div className="font-bold text-slate-950">Origin :</div>
            <div className="space-y-1 text-[11px]">
              {ORIGIN_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-1.5 cursor-pointer text-slate-800"
                >
                  <input
                    type="radio"
                    name="bulletinOriginType"
                    checked={originType === type}
                    onChange={() =>
                      onUpdateEvent((ev) => ({
                        ...ev,
                        originType: type,
                      }))
                    }
                    className="h-3.5 w-3.5 accent-[#0066cc] cursor-pointer"
                  />
                  <span>{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* DAMAGE Mint Box */}
          <div className="bg-[#d4f7e6] border-b border-slate-400/80 px-2 py-1.5 space-y-1">
            <div className="text-[11.5px] text-slate-950">DAMAGE :</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulletinExpectingDamage"
                  checked={!event.expectingDamage}
                  onChange={() =>
                    onUpdateEvent((ev) => ({ ...ev, expectingDamage: false }))
                  }
                  className="h-3.5 w-3.5 accent-[#0066cc] cursor-pointer"
                />
                <span>NO</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulletinExpectingDamage"
                  checked={event.expectingDamage}
                  onChange={() =>
                    onUpdateEvent((ev) => ({ ...ev, expectingDamage: true }))
                  }
                  className="h-3.5 w-3.5 accent-[#0066cc] cursor-pointer"
                />
                <span>YES</span>
              </label>
            </div>
          </div>

          {/* AFTERSHOCK Mint Box */}
          <div className="bg-[#d4f7e6] border-b border-slate-400/80 px-2 py-1.5 space-y-1">
            <div className="text-[11.5px] text-slate-950">AFTERSHOCK :</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulletinExpectingAftershocks"
                  checked={!event.expectingAftershocks}
                  onChange={() =>
                    onUpdateEvent((ev) => ({ ...ev, expectingAftershocks: false }))
                  }
                  className="h-3.5 w-3.5 accent-[#0066cc] cursor-pointer"
                />
                <span>NO</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulletinExpectingAftershocks"
                  checked={event.expectingAftershocks}
                  onChange={() =>
                    onUpdateEvent((ev) => ({ ...ev, expectingAftershocks: true }))
                  }
                  className="h-3.5 w-3.5 accent-[#0066cc] cursor-pointer"
                />
                <span>YES</span>
              </label>
            </div>
          </div>

          {/* Print Source ? Lavender Box */}
          <div className="bg-[#d5d4ff] border-b border-slate-400/80 px-2 py-1.5 space-y-1">
            <div className="font-bold text-slate-950">Print Source ?</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulletinPrintSource"
                  checked={!printSource}
                  onChange={() => onChangePrintSource(false)}
                  className="h-3.5 w-3.5 accent-[#0066cc] cursor-pointer"
                />
                <span>NO</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="bulletinPrintSource"
                  checked={printSource}
                  onChange={() => onChangePrintSource(true)}
                  className="h-3.5 w-3.5 accent-[#0066cc] cursor-pointer"
                />
                <span>YES</span>
              </label>
            </div>

            {magResolution.isStale ? (
              <div className="mt-2 p-1.5 rounded bg-rose-100 border border-rose-400 text-[10.5px] text-rose-950 space-y-1">
                <div className="font-bold">Magnitude Recalculation Required</div>
                <div className="leading-tight">
                  Inputs or settings changed since last calculation. Recalculate magnitude in the Data tab before confirming or releasing this bulletin.
                </div>
              </div>
            ) : (
              (magResolution.requiresAnalystConfirmation ||
                (hasValidUncalibratedApproval(event.magnitudeMetadata) &&
                  (event.magnitudeMetadata?.calibrationStatus === 'experimental_uncalibrated' ||
                    event.magnitudeMetadata?.calibrationStatus === 'pending_calibration'))) && (
                <div className="mt-2 p-1.5 rounded bg-amber-100/90 border border-amber-400 text-[10.5px] text-amber-950 space-y-1">
                  <div className="font-bold">Uncalibrated {magResolution.scaleLabel} Gate</div>
                  <label className="flex items-start gap-1.5 cursor-pointer leading-tight">
                    <input
                      type="checkbox"
                      checked={hasValidUncalibratedApproval(event.magnitudeMetadata)}
                      onChange={(e) =>
                        onUpdateEvent((ev) => ({
                          ...ev,
                          magnitudeMetadata: ev.magnitudeMetadata
                            ? approveUncalibratedMagnitudeMetadata(
                                ev.magnitudeMetadata,
                                e.target.checked
                              )
                            : ev.magnitudeMetadata,
                        }))
                      }
                      className="mt-0.5 h-3.5 w-3.5 accent-amber-700 cursor-pointer shrink-0"
                    />
                    <span>
                      Confirm uncalibrated {magResolution.scaleLabel} (
                      {event.magnitudeMetadata?.selectedMagnitude?.toFixed(1) ?? '—'}) for bulletin release
                    </span>
                  </label>
                </div>
              )
            )}
          </div>

          {/* Issued Date / Time / Issued by */}
          <div className="px-1.5 py-2 space-y-2">
            <label className="block space-y-0.5">
              <span className="block font-bold text-slate-950">Issued Date :</span>
              <input
                type="text"
                value={event.issuedDate}
                placeholder={fallbackIssued.date}
                onChange={(e) =>
                  onUpdateEvent((ev) => ({ ...ev, issuedDate: e.target.value }))
                }
                className="w-[140px] bg-white border border-slate-500 px-1.5 py-0.5 text-[12px] text-slate-950 shadow-inner focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>

            <label className="block space-y-0.5">
              <span className="block font-bold text-slate-950">Issued Time :</span>
              <input
                type="text"
                value={event.issuedTime}
                placeholder={fallbackIssued.time}
                onChange={(e) =>
                  onUpdateEvent((ev) => ({ ...ev, issuedTime: e.target.value }))
                }
                className="w-[140px] bg-white border border-slate-500 px-1.5 py-0.5 text-[12px] text-slate-950 shadow-inner focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>

            <label className="block space-y-0.5">
              <span className="block font-bold text-slate-950">Issued by :</span>
              <input
                type="text"
                value={event.issuedBy}
                placeholder="DSS"
                onChange={(e) =>
                  onUpdateEvent((ev) => ({ ...ev, issuedBy: e.target.value }))
                }
                className="w-full bg-white border border-slate-500 px-1.5 py-0.5 text-[12px] font-medium text-[#0000dd] shadow-inner focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </label>
          </div>
        </div>

        {/* Bottom Bulletin Number & Quick Actions inside Peach Footer */}
        <div className="px-1.5 py-2 border-t border-[#e5b382] space-y-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="bulletin-no-input" className="font-bold text-slate-900">
              Bulletin No. :
            </label>
            <input
              id="bulletin-no-input"
              type="number"
              min={1}
              value={bulletinNo}
              onChange={(e) =>
                onUpdateEvent((ev) => ({
                  ...ev,
                  bulletinNo: Math.max(1, Number(e.target.value) || 1),
                }))
              }
              className="w-14 bg-white border border-slate-500 px-1.5 py-0.5 text-center font-mono font-semibold text-slate-900"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-800">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={pdfIncludeMap}
                onChange={(e) => onChangePdfIncludeMap(e.target.checked)}
                className="accent-blue-700"
              />
              <span>PDF Map</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={pdfIncludeCharts}
                onChange={(e) => onChangePdfIncludeCharts(e.target.checked)}
                className="accent-blue-700"
              />
              <span>Charts</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={onDownloadPdf}
              className={`group ${getWorkstationButtonClass({
                buttonStyle,
                iconStyle,
                action: 'pdf',
                surface: 'footer',
              })} px-2 py-1 border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60`}
            >
              <WorkstationActionIcon preset={iconStyle} action="pdf" size="footer" />
              {isGeneratingPdf ? 'PDF...' : 'PDF'}
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className={`group ${getWorkstationButtonClass({
                buttonStyle,
                iconStyle,
                action: 'webpage',
                surface: 'footer',
              })} px-2 py-1 border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5`}
            >
              <WorkstationActionIcon preset={iconStyle} action="webpage" size="footer" />
              HTML
            </button>
            <button
              type="button"
              onClick={onPrintBulletin}
              className={`group ${getWorkstationButtonClass({
                buttonStyle,
                iconStyle,
                action: 'print',
                surface: 'footer',
              })} px-2 py-1 border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5`}
            >
              <WorkstationActionIcon preset={iconStyle} action="print" size="footer" />
              Print
            </button>
            <button
              type="button"
              onClick={onSaveCatalog}
              className={`group ${getWorkstationButtonClass({
                buttonStyle,
                iconStyle,
                action: 'save',
                surface: 'footer',
              })} px-2 py-1 border text-[11px] font-semibold inline-flex items-center justify-center gap-1.5`}
            >
              <WorkstationActionIcon preset={iconStyle} action="save" size="footer" />
              Save
            </button>
          </div>
        </div>
      </aside>

      {/* Right Bulletin Workbench & Document Preview */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#f3f4f6]">
        {/* Top Bulletin HTML Path Bar */}
        <div className="bg-white border-b border-slate-400 px-2 py-1 flex items-center justify-between gap-2 text-[11.5px] font-sans">
          <span
            className="text-[#2589bd] truncate select-all"
            title={htmlFullPath}
          >
            {htmlFullPath}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {openedBulletin && (
              <>
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-xs">
                  Opened Saved HTML
                </span>
                {onCloseOpenedBulletin && (
                  <button
                    type="button"
                    onClick={onCloseOpenedBulletin}
                    className="text-[10px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-300 px-1.5 py-0.5 rounded-xs cursor-pointer"
                  >
                    Return to Live Bulletin
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Bulletin Map Style, Layer & Zoom Toolbar */}
        <div className="bg-slate-50 border-b border-slate-300 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Left: Map Style, Map Extent & Layer Menu */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0">
              <MapIcon className="w-3.5 h-3.5 text-blue-700" />
              <span>Map:</span>
              <select
                aria-label="Bulletin map basemap style"
                value={mapStyle}
                onChange={(e) => setMapStyle(e.target.value as BulletinMapStyle)}
                className="px-2 py-1 bg-white border border-slate-300 rounded text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="classic">Classic PHIVOLCS</option>
                <option value="topo">Topo Relief</option>
                <option value="dark">Dark Seismic</option>
                <option value="mono">Print B&amp;W</option>
              </select>
            </label>

            <div
              className="inline-flex items-center p-0.5 bg-slate-200/80 border border-slate-300 rounded"
              role="group"
              aria-label="Map geographic framing"
            >
              {(
                [
                  { id: 'regional', label: 'Regional' },
                  { id: 'focused', label: 'Focused' },
                  { id: 'national', label: 'National PH' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMapExtent(item.id)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    mapExtent === item.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Interactive Layers Dropdown */}
            <div className="relative" ref={layersMenuRef}>
              <button
                type="button"
                onClick={() => setLayersMenuOpen((v) => !v)}
                aria-expanded={layersMenuOpen}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  layersMenuOpen
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Layers ({activeLayerCount})</span>
              </button>

              {layersMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-30 w-64 bg-white border border-slate-300 rounded-md shadow-lg p-2.5 space-y-2 text-[11.5px]">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="font-semibold text-slate-900">Bulletin Map Layers</span>
                    <button
                      type="button"
                      onClick={() => setLayers(DEFAULT_LAYERS)}
                      className="text-[11px] font-medium text-blue-600 hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {(
                      [
                        { key: 'faults', label: 'Active Faults (PFZ / Valley)' },
                        { key: 'trenches', label: 'Subduction Trenches' },
                        { key: 'plates', label: 'Tectonic Plate Boundaries' },
                        { key: 'cities', label: 'Major City Labels' },
                        { key: 'volcanoes', label: 'Active Volcanoes' },
                        { key: 'stations', label: `Picked Stations (${event.picks.length})` },
                        {
                          key: 'shakemap',
                          label: shakeMap
                            ? 'ShakeMap PEIS Contours'
                            : 'ShakeMap Contours (Unavailable)',
                          disabled: !shakeMap || unlocated,
                        },
                        { key: 'errorEllipse', label: 'Epicenter Error Ellipse' },
                        { key: 'grid', label: 'Lat/Lon Coordinate Grid' },
                        { key: 'scaleAndNorth', label: 'Scale Bar & North Arrow' },
                      ] as Array<{
                        key: keyof BulletinMapLayers;
                        label: string;
                        disabled?: boolean;
                      }>
                    ).map((item) => (
                      <label
                        key={item.key}
                        className={`flex items-center gap-2 select-none ${
                          item.disabled
                            ? 'opacity-45 cursor-not-allowed text-slate-500'
                            : 'cursor-pointer text-slate-800 hover:text-slate-950'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={item.disabled}
                          checked={layers[item.key]}
                          onChange={() => toggleLayer(item.key)}
                          className="accent-blue-600"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Bulletin Zoom Controls (Buttons + Mouse Wheel Toggle) */}
          <div className="flex items-center gap-1.5">
            <div className="inline-flex items-center bg-white border border-slate-300 rounded overflow-hidden">
              <button
                type="button"
                onClick={() => handleZoomStep(-0.15)}
                disabled={zoom <= MIN_ZOOM}
                title="Zoom out bulletin"
                aria-label="Zoom out bulletin"
                className="px-2 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer border-r border-slate-200"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <select
                aria-label="Bulletin zoom level"
                value={
                  ZOOM_PRESETS.includes(zoom)
                    ? String(zoom)
                    : 'custom'
                }
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) setZoom(val);
                }}
                className="px-1.5 py-1 bg-white text-[11px] font-mono font-semibold tabular-nums text-slate-900 focus:outline-none cursor-pointer"
              >
                {!ZOOM_PRESETS.includes(zoom) && (
                  <option value="custom">{Math.round(zoom * 100)}%</option>
                )}
                {ZOOM_PRESETS.map((preset) => (
                  <option key={preset} value={String(preset)}>
                    {Math.round(preset * 100)}%
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleZoomStep(0.15)}
                disabled={zoom >= MAX_ZOOM}
                title="Zoom in bulletin"
                aria-label="Zoom in bulletin"
                className="px-2 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer border-l border-slate-200"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleFitWidth}
              title="Fit bulletin width to viewport"
              className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" />
              Fit
            </button>

            <button
              type="button"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
              title="Reset zoom to 100%"
              className="px-2 py-1 rounded border border-slate-300 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              100%
            </button>

            <button
              type="button"
              onClick={() => setWheelZoomEnabled((v) => !v)}
              title="Toggle whether mouse wheel zooms the bulletin directly or scrolls the page (Ctrl+Wheel always zooms)"
              className={`px-2 py-1 rounded border text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                wheelZoomEnabled
                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {wheelZoomEnabled ? (
                <MousePointerClick className="w-3 h-3" />
              ) : (
                <Compass className="w-3 h-3" />
              )}
              <span>{wheelZoomEnabled ? 'Wheel: Zoom' : 'Wheel: Scroll'}</span>
            </button>
          </div>
        </div>

        {/* Magnitude Freshness / Uncalibrated Release Guard Banner */}
        {exportBlockedReason && (
          <div
            role="status"
            className="bg-amber-50 border-b border-amber-300 px-3 py-1.5 text-[11px] font-medium text-amber-950 flex items-center justify-between gap-2"
          >
            <span>{exportBlockedReason}</span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs bg-amber-200/80 text-amber-950 shrink-0">
              {magResolution.isStale ? 'Stale Magnitude' : 'Confirmation Required'}
            </span>
          </div>
        )}

        {/* Extracted Key Event Parameters Verification Grid */}
        <BulletinSummaryTable
          event={event}
          freshness={freshness}
          primaryLocationLabel={primaryLocationLabel}
          faultGeneratorLabel={faultGeneratorLabel}
          printSource={printSource}
          issuedDateDisplay={issuedDateDisplay}
          issuedTimeDisplay={issuedTimeDisplay}
          issuedByDisplay={issuedByDisplay}
        />

        {/* Zoomable & Pannable Official PHIVOLCS Bulletin Document Viewport */}
        <div
          ref={viewportRef}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerLeave={handleViewportPointerUp}
          className={`flex-1 min-h-[420px] overflow-auto p-3 sm:p-5 bg-slate-200/75 flex justify-center items-start select-none ${
            isPanning ? 'cursor-grabbing' : zoom > 1 ? 'cursor-grab' : 'cursor-default'
          }`}
        >
          {openedBulletin ? (
            <div
              className="shrink-0 relative"
              style={{
                width: `${Math.round(720 * zoom)}px`,
                height: `${Math.round(980 * zoom)}px`,
              }}
            >
              <iframe
                title={`Opened bulletin ${openedBulletin.filename}`}
                srcDoc={openedBulletin.htmlContent}
                sandbox="allow-same-origin"
                className="w-[720px] h-[980px] bg-white border border-slate-500 shadow-sm origin-top-left"
                style={{
                  transform: `scale(${zoom})`,
                }}
              />
            </div>
          ) : (
            <div
              className="shrink-0 relative"
              style={{
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
              }}
            >
              <article
                ref={articleRef}
                aria-label="Official PHIVOLCS Earthquake Information Bulletin"
                className="w-[650px] bg-white border border-slate-500 shadow-sm text-slate-950 origin-top-left select-text"
                style={{
                  transform: `scale(${zoom})`,
                }}
              >
              {/* Gradient PHIVOLCS Banner Header */}
              <header className="bg-gradient-to-b from-[#9bb9eb] via-[#c7daf7] to-[#e6effb] border-b border-slate-400 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="w-[62px] h-[62px] shrink-0 rounded-md bg-white/95 border border-blue-200/90 p-1 shadow-2xs flex items-center justify-center">
                  <img
                    src="/assets/aistudio/image_0e99ad12.png"
                    alt="DOST-PHIVOLCS Logo"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex-1 min-w-0 text-center">
                  <div className="text-[10px] tracking-wider uppercase text-slate-800">
                    DEPARTMENT OF SCIENCE AND TECHNOLOGY
                  </div>
                  <div className="text-[13.5px] font-bold tracking-tight uppercase text-slate-950 leading-tight">
                    PHILIPPINE INSTITUTE OF VOLCANOLOGY AND SEISMOLOGY
                  </div>
                  <h2 className="text-[14.5px] font-bold italic tracking-wide text-[#0c234d] mt-0.5">
                    EARTHQUAKE INFORMATION NO. : {bulletinNo}
                  </h2>
                  <div className="text-[9.5px] font-semibold text-slate-900 mt-0.5">
                    PHIVOLCS Building, C.P. Garcia Avenue, U.P.- Diliman, Quezon City, PHILIPPINES
                  </div>
                  <div className="text-[9.5px] font-semibold text-slate-900">
                    Tel.: 8426-1468 &nbsp; Fax: 8927-1087
                  </div>
                </div>

                <div className="w-[62px] h-[62px] shrink-0 rounded-md bg-white/95 border border-blue-200/90 p-1 shadow-2xs flex items-center justify-center">
                  <img
                    src="/assets/aistudio/image_8f1bc708.png"
                    alt="Bagong Pilipinas Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              </header>

              {/* Primary Hypocenter Metadata Block */}
              <div className="px-3.5 py-2.5 border-b border-slate-400 text-[12px] space-y-1">
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Date/Time</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd] tabular-nums">
                    {lstDate.display} - {lstTime.full}
                  </span>
                </div>
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Location</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd]">
                    {unlocated
                      ? 'Pending location'
                      : `${event.lat.toFixed(2)}°N, ${event.lon.toFixed(2)}°E - ${primaryLocationLabel}`}
                  </span>
                </div>
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Depth of Focus (Km)</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd] tabular-nums">
                    {unlocated ? 'Pending' : depthCode}
                  </span>
                </div>
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Origin</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd]">{originType}</span>
                </div>
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Magnitude</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd] tabular-nums">
                    {magResolution.displayText}
                  </span>
                </div>
                {printSource && faultGeneratorLabel && (
                  <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                    <span className="text-slate-950">Fault Generator</span>
                    <span>:</span>
                    <span className="font-semibold text-[#0000dd]">
                      {faultGeneratorLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Map + Reported Intensities + Code Stamp Block */}
              <div className="px-3.5 pt-2.5 pb-1.5 border-b border-slate-400">
                <div className="flex justify-center pb-3">
                  <BulletinMapSvg
                    event={event}
                    mapStyle={mapStyle}
                    mapExtent={mapExtent}
                    layers={layers}
                    shakeMap={shakeMap}
                    svgRef={mapSvgRef}
                  />
                </div>

                <div className="min-h-[120px] flex flex-col justify-between gap-4 text-[12px]">
                  <div>
                    <div className="text-slate-950">
                      Reported Intensities &nbsp;&nbsp; :
                    </div>
                    {(() => {
                      if (event.intensityBulletinOverride?.trim()) {
                        return (
                          <pre className="mt-1.5 pl-4 text-[11.5px] font-medium text-slate-900 font-mono whitespace-pre-wrap leading-relaxed">
                            {event.intensityBulletinOverride}
                          </pre>
                        );
                      }
                      const grouped = formatGroupedBulletinIntensityBlock(event.intensities);
                      return (
                        <>
                          {grouped.feltGroups.length > 0 && (
                            <div className="mt-1.5 pl-4 space-y-1 text-[11.5px] font-medium text-slate-900 font-mono whitespace-pre">
                              {grouped.feltGroups.map((group) => (
                                <div key={`felt-${group.peis}`}>{group.formattedBlock}</div>
                              ))}
                            </div>
                          )}
                          {grouped.instrumentalGroups.length > 0 && (
                            <div className={grouped.feltGroups.length > 0 ? 'mt-3' : 'mt-1.5'}>
                              <div className="text-slate-950">Instrumental Intensity:</div>
                              <div className="mt-1 pl-4 space-y-1 text-[11.5px] font-medium text-slate-900 font-mono whitespace-pre">
                                {grouped.instrumentalGroups.map((group) => (
                                  <div key={`instr-${group.peis}`}>{group.formattedBlock}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {(event.bulletinNote1?.trim() || event.bulletinNote2?.trim()) && (
                      <div className="mt-2 text-[11px] text-slate-800 space-y-0.5">
                        {event.bulletinNote1?.trim() && <div>{event.bulletinNote1}</div>}
                        {event.bulletinNote2?.trim() && <div>{event.bulletinNote2}</div>}
                      </div>
                    )}
                  </div>

                  <div className="text-[10px] leading-tight text-slate-900 font-sans tabular-nums">
                    <div>{event.version}</div>
                    <div>{stampCode}</div>
                  </div>
                </div>
              </div>

              {/* Expecting Damage / Aftershocks / Issued Footer */}
              <div className="px-3.5 py-2 text-[12px] space-y-1">
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Expecting Damage</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd]">
                    {event.expectingDamage ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Expecting Aftershocks</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd]">
                    {event.expectingAftershocks ? 'YES' : 'NO'}
                  </span>
                </div>
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Issued On</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd] tabular-nums">
                    {issuedDateDisplay} - {issuedTimeDisplay}
                  </span>
                </div>
                <div className="grid grid-cols-[150px_14px_1fr] items-baseline">
                  <span className="text-slate-950">Prepared by</span>
                  <span>:</span>
                  <span className="font-semibold text-[#0000dd]">
                    {issuedByDisplay}
                  </span>
                </div>
              </div>

              {/* Bottom IMPORTANT Notice Box */}
              <div className="m-1 border border-slate-500 bg-[#b8cdf0] grid grid-cols-1 sm:grid-cols-[135px_1fr] text-[11px]">
                <div className="border-b sm:border-b-0 sm:border-r border-slate-500 flex items-center justify-center py-2 font-bold text-[#e60012] tracking-wide">
                  IMPORTANT
                </div>
                <div className="px-2.5 py-1.5 font-semibold text-slate-950 leading-snug">
                  This will be the only bulletin issued unless additional information becomes available.
                  Always refer to the latest earthquake information posted at the PHIVOLCS official
                  website (https://www.phivolcs.dost.gov.ph).
                </div>
              </div>
              </article>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
