import { contours } from 'd3-contour';
import { EQPEvent } from '../data/eqpData';
import {
  buildNodalPlaneProjectionPoints,
  dotVec,
  EvaluatedPolarityPick,
  FocalMechanismAnalysis,
  ManualMechanismEvaluation,
  NodalPlane,
  PrincipalAxis,
  schmidtProjectLower,
  Vec3,
} from './focalMechanism';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates pure SVG path `d` strings for the compressional quadrants (amp >= 0)
 * on a lower-hemisphere equal-area stereonet using d3-contour marching squares.
 */
export function buildCompressionalQuadrantSvgPath(
  nVec: Vec3,
  sVec: Vec3,
  cx: number,
  cy: number,
  radius: number,
  gridSize = 84
): string {
  const values = new Array<number>(gridSize * gridSize);
  for (let row = 0; row < gridSize; row++) {
    const ny = 1 - (2 * (row + 0.5)) / gridSize; // +1 at top (North)
    for (let col = 0; col < gridSize; col++) {
      const nx = (2 * (col + 0.5)) / gridSize - 1; // +1 at right (East)
      const r2 = nx * nx + ny * ny;
      const clampedR2 = Math.min(1.0, r2);
      const root = Math.sqrt(Math.max(0, 2 - clampedR2));
      const scale = r2 > 1 ? 1 / Math.sqrt(r2) : 1;
      const ray: Vec3 = {
        n: ny * scale * root,
        e: nx * scale * root,
        d: 1 - clampedR2,
      };
      const amp = 2 * dotVec(ray, nVec) * dotVec(ray, sVec);
      values[row * gridSize + col] = amp;
    }
  }

  const contourGen = contours().size([gridSize, gridSize]).thresholds([0]);
  const geo = contourGen(values)[0];
  if (!geo) return '';

  const sx = (2 * radius) / gridSize;
  const sy = (2 * radius) / gridSize;
  const left = cx - radius;
  const top = cy - radius;

  const segments: string[] = [];
  for (const poly of geo.coordinates) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      const ringStr = ring
        .map(([gx, gy], idx) => {
          const px = left + gx * sx;
          const py = top + gy * sy;
          return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
        })
        .join(' ');
      segments.push(`${ringStr} Z`);
    }
  }
  return segments.join(' ');
}

export interface BeachballExportInput {
  event: EQPEvent;
  analysis: FocalMechanismAnalysis;
  manualExploration?: {
    enabled: boolean;
    evaluation: ManualMechanismEvaluation;
  } | null;
  isStale: boolean;
}

function resolveDisplayedMechanism(input: BeachballExportInput): {
  modeLabel: string;
  isInsufficient: boolean;
  plane1: NodalPlane | null;
  plane2: NodalPlane | null;
  pAxis: PrincipalAxis | null;
  tAxis: PrincipalAxis | null;
  bAxis: PrincipalAxis | null;
  nVec: Vec3 | null;
  sVec: Vec3 | null;
  mechanismClass: string;
  evaluatedPicks: EvaluatedPolarityPick[];
  agreementText: string;
} {
  const { analysis, manualExploration } = input;
  if (manualExploration?.enabled) {
    const m = manualExploration.evaluation;
    return {
      modeLabel: 'Manual Hypothetical Plane (Not Fitted)',
      isInsufficient: false,
      plane1: m.plane1,
      plane2: m.plane2,
      pAxis: m.pAxis,
      tAxis: m.tAxis,
      bAxis: m.bAxis,
      nVec: m.nVec,
      sVec: m.sVec,
      mechanismClass: m.mechanismClass,
      evaluatedPicks: m.evaluatedPicks,
      agreementText: `${m.matchedCount}/${m.totalCount} (${m.agreementPct}%)`,
    };
  }
  if (analysis.status === 'insufficient-data') {
    return {
      modeLabel: `${analysis.methodologyLabel} — INSUFFICIENT DATA`,
      isInsufficient: true,
      plane1: null,
      plane2: null,
      pAxis: null,
      tAxis: null,
      bAxis: null,
      nVec: null,
      sVec: null,
      mechanismClass: 'Insufficient Data',
      evaluatedPicks: [],
      agreementText: `${analysis.quality.usableCount} usable (< 6 min)`,
    };
  }
  return {
    modeLabel: `${analysis.methodologyLabel}${input.isStale ? ' · STALE' : ''}`,
    isInsufficient: false,
    plane1: analysis.plane1,
    plane2: analysis.plane2,
    pAxis: analysis.pAxis,
    tAxis: analysis.tAxis,
    bAxis: analysis.bAxis,
    nVec: analysis.nVec,
    sVec: analysis.sVec,
    mechanismClass: analysis.mechanismClass ?? 'Unknown',
    evaluatedPicks: analysis.evaluatedPicks,
    agreementText: `${analysis.quality.matchedCount}/${analysis.quality.usableCount} (${analysis.quality.agreementPct}%)`,
  };
}

export function buildBeachballSvgDocument(input: BeachballExportInput): string {
  const { event, analysis, isStale } = input;
  const disp = resolveDisplayedMechanism(input);
  const w = 640;
  const h = 470;
  const cx = 210;
  const cy = 240;
  const radius = 148;
  const ring45 = radius * Math.sqrt(1 - Math.SQRT1_2);

  const magVal =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;

  const quadrantPath =
    !disp.isInsufficient && disp.nVec && disp.sVec
      ? buildCompressionalQuadrantSvgPath(disp.nVec, disp.sVec, cx, cy, radius)
      : '';

  const p1Path =
    !disp.isInsufficient && disp.plane1
      ? buildNodalPlaneProjectionPoints(disp.plane1.strike, disp.plane1.dip)
          .map(
            (pt, i) =>
              `${i === 0 ? 'M' : 'L'}${(cx + pt.x * radius).toFixed(1)},${(cy - pt.y * radius).toFixed(1)}`
          )
          .join(' ')
      : '';
  const p2Path =
    !disp.isInsufficient && disp.plane2
      ? buildNodalPlaneProjectionPoints(disp.plane2.strike, disp.plane2.dip)
          .map(
            (pt, i) =>
              `${i === 0 ? 'M' : 'L'}${(cx + pt.x * radius).toFixed(1)},${(cy - pt.y * radius).toFixed(1)}`
          )
          .join(' ')
      : '';

  const renderAxis = (
    axis: PrincipalAxis | null,
    label: 'P' | 'T' | 'B',
    bg: string,
    fg: string,
    stroke: string
  ) => {
    if (!axis) return '';
    const pt = schmidtProjectLower(axis.vec);
    const ax = cx + pt.x * radius;
    const ay = cy - pt.y * radius;
    return `<g><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="9" fill="${bg}" stroke="${stroke}" stroke-width="1.3"/><text x="${ax.toFixed(1)}" y="${(ay + 3.5).toFixed(1)}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" font-weight="700" fill="${fg}">${label}</text></g>`;
  };

  const stationItems =
    disp.evaluatedPicks.length > 0
      ? disp.evaluatedPicks
      : analysis.allPicks.filter((p) => p.status === 'usable' && p.projX !== null);

  const stationsSvg = stationItems
    .map((item) => {
      const px = cx + (item.projX ?? 0) * radius;
      const py = cy - (item.projY ?? 0) * radius;
      const isComp = item.polaritySign === 1;
      const matched = 'isMatched' in item ? item.isMatched : true;
      const nearNodal = 'isNearNodal' in item ? item.isNearNodal : false;
      const stroke = !matched ? '#be123c' : nearNodal ? '#0369a1' : '#0f172a';
      return `<g><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.8" fill="${isComp ? '#f59e0b' : '#ffffff'}" stroke="${stroke}" stroke-width="${!matched ? '2.1' : '1.4'}"/><text x="${(px + 6.5).toFixed(1)}" y="${(py - 4).toFixed(1)}" font-family="ui-monospace, monospace" font-size="9.5" font-weight="600" fill="${!matched ? '#9f1239' : '#0f172a'}">${escapeXml(item.pick.sta)}</text></g>`;
    })
    .join('');

  const p1Text = disp.plane1
    ? `${disp.plane1.strike}° / ${disp.plane1.dip}° / ${disp.plane1.rake}°`
    : '—';
  const p2Text = disp.plane2
    ? `${disp.plane2.strike}° / ${disp.plane2.dip}° / ${disp.plane2.rake}°`
    : '—';
  const pAxisText = disp.pAxis ? `${disp.pAxis.trend}° / ${disp.pAxis.plunge}°` : '—';
  const tAxisText = disp.tAxis ? `${disp.tAxis.trend}° / ${disp.tAxis.plunge}°` : '—';
  const bAxisText = disp.bAxis ? `${disp.bAxis.trend}° / ${disp.bAxis.plunge}°` : '—';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <clipPath id="eqp-stereonet-clip">
      <circle cx="${cx}" cy="${cy}" r="${radius}" />
    </clipPath>
  </defs>
  <rect width="${w}" height="${h}" fill="#ffffff" />
  <rect x="0" y="0" width="${w}" height="62" fill="#f8fafc" />
  <line x1="0" y1="62" x2="${w}" y2="62" stroke="#cbd5e1" stroke-width="1" />
  <text x="20" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="#0f172a">EQP Modern Research · Focal Mechanism (${escapeXml(event.id)})</text>
  <text x="20" y="43" font-family="ui-monospace, monospace" font-size="11" fill="#334155">${escapeXml(event.originDateGmt)} ${escapeXml(event.originTimeGmt)} UTC · ${event.lat.toFixed(3)}°N ${event.lon.toFixed(3)}°E · Depth ${event.depthKm.toFixed(1)} km · ${escapeXml(event.preferredScale)} ${magVal.toFixed(1)}</text>
  <text x="${w - 20}" y="24" text-anchor="end" font-family="ui-monospace, monospace" font-size="10.5" font-weight="700" fill="${isStale ? '#b45309' : '#1d4ed8'}">${escapeXml(disp.modeLabel)}</text>

  <g clip-path="url(#eqp-stereonet-clip)">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#f8fafc" />
    ${quadrantPath ? `<path d="${quadrantPath}" fill="#1e40af" fill-opacity="0.86" fill-rule="evenodd" />` : ''}
    ${p1Path ? `<path d="${p1Path}" fill="none" stroke="#0f172a" stroke-width="2" />` : ''}
    ${p2Path ? `<path d="${p2Path}" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-dasharray="5 3" />` : ''}
  </g>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#0f172a" stroke-width="1.8" />
  <circle cx="${cx}" cy="${cy}" r="${ring45.toFixed(1)}" fill="none" stroke="#94a3b8" stroke-opacity="0.45" stroke-width="0.9" stroke-dasharray="3 3" />
  <text x="${cx}" y="${cy - radius - 8}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" font-weight="700" fill="#0f172a">N</text>
  <text x="${cx + radius + 10}" y="${cy + 4}" font-family="ui-monospace, monospace" font-size="10" fill="#475569">E</text>
  <text x="${cx}" y="${cy + radius + 14}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="#475569">S</text>
  <text x="${cx - radius - 10}" y="${cy + 4}" text-anchor="end" font-family="ui-monospace, monospace" font-size="10" fill="#475569">W</text>

  ${stationsSvg}
  ${renderAxis(disp.pAxis, 'P', '#ffffff', '#0f172a', '#0f172a')}
  ${renderAxis(disp.tAxis, 'T', '#0f172a', '#ffffff', '#ffffff')}
  ${renderAxis(disp.bAxis, 'B', '#e2e8f0', '#0f172a', '#475569')}

  <g font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#0f172a">
    <text x="392" y="106" font-size="11" fill="#64748b">MECHANISM CLASSIFICATION</text>
    <text x="392" y="126" font-size="16" font-weight="700">${escapeXml(disp.mechanismClass)}</text>
    <text x="392" y="158" font-size="11" fill="#64748b">NODAL PLANE 1 (Strike / Dip / Rake)</text>
    <text x="392" y="176" font-family="ui-monospace, monospace" font-weight="700">${escapeXml(p1Text)}</text>
    <text x="392" y="204" font-size="11" fill="#64748b">AUXILIARY PLANE 2 (Strike / Dip / Rake)</text>
    <text x="392" y="222" font-family="ui-monospace, monospace" font-weight="700">${escapeXml(p2Text)}</text>
    <text x="392" y="252" font-size="11" fill="#64748b">PRINCIPAL AXES (Trend / Plunge)</text>
    <text x="392" y="270" font-family="ui-monospace, monospace" font-size="11.5">P: ${escapeXml(pAxisText)} · T: ${escapeXml(tAxisText)}</text>
    <text x="392" y="287" font-family="ui-monospace, monospace" font-size="11.5">B: ${escapeXml(bAxisText)}</text>
    <text x="392" y="317" font-size="11" fill="#64748b">FIT &amp; QUALITY</text>
    <text x="392" y="335" font-family="ui-monospace, monospace" font-size="11.5">Agreement: ${escapeXml(disp.agreementText)}</text>
    <text x="392" y="352" font-family="ui-monospace, monospace" font-size="11.5">Coverage: ${escapeXml(analysis.quality.coverageGrade)} (Gap ${analysis.quality.maxAzimuthalGapDeg}°)</text>
    <text x="392" y="369" font-family="ui-monospace, monospace" font-size="11.5">Ambiguity: ${escapeXml(analysis.quality.ambiguityGrade)} (${analysis.quality.acceptableSolutionCount} sol.)</text>
  </g>

  <line x1="20" y1="${h - 42}" x2="${w - 20}" y2="${h - 42}" stroke="#e2e8f0" stroke-width="1" />
  <text x="20" y="${h - 23}" font-family="system-ui, -apple-system, sans-serif" font-size="10" fill="#64748b">${escapeXml(analysis.conventionNote)} · Experimental research visualization; nodal planes cannot identify the causative fault alone.</text>
</svg>`;
}

export async function renderBeachballPngBlob(
  input: BeachballExportInput
): Promise<Blob> {
  const disp = resolveDisplayedMechanism(input);
  const { event, analysis, isStale } = input;

  const scale = 2;
  const w = 680;
  const h = 470;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D canvas context for PNG export.');
  }
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, 64);
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.lineTo(w, 64);
  ctx.stroke();

  const magVal =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`EQP Modern Research · Focal Mechanism (${event.id})`, 20, 24);

  ctx.fillStyle = '#334155';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(
    `${event.originDateGmt} ${event.originTimeGmt} UTC · ${event.lat.toFixed(3)}°N ${event.lon.toFixed(3)}°E · Depth ${event.depthKm.toFixed(1)} km · ${event.preferredScale} ${magVal.toFixed(1)}`,
    20,
    44
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = isStale ? '#b45309' : '#1d4ed8';
  ctx.font = 'bold 10.5px ui-monospace, monospace';
  ctx.fillText(disp.modeLabel, w - 20, 24);
  ctx.textAlign = 'left';

  const cx = 205;
  const cy = 242;
  const radius = 148;

  // Rasterize beachball quadrants inside clipped stereonet
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  if (!disp.isInsufficient && disp.nVec && disp.sVec) {
    const off = document.createElement('canvas');
    const pxDiam = Math.round(radius * 2 * scale);
    off.width = pxDiam;
    off.height = pxDiam;
    const octx = off.getContext('2d');
    if (octx) {
      const img = octx.createImageData(pxDiam, pxDiam);
      const d = img.data;
      const half = pxDiam / 2;
      for (let py = 0; py < pxDiam; py++) {
        const ny = (half - py) / half;
        for (let px = 0; px < pxDiam; px++) {
          const nx = (px - half) / half;
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) continue;
          const root = Math.sqrt(Math.max(0, 2 - r2));
          const ray: Vec3 = { n: ny * root, e: nx * root, d: 1 - r2 };
          const amp = 2 * dotVec(ray, disp.nVec) * dotVec(ray, disp.sVec);
          const idx = (py * pxDiam + px) * 4;
          if (amp >= 0) {
            d[idx] = 30;
            d[idx + 1] = 64;
            d[idx + 2] = 175;
            d[idx + 3] = 220;
          }
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.drawImage(off, cx - radius, cy - radius, radius * 2, radius * 2);
    }

    const drawNodal = (plane: NodalPlane, dashed: boolean) => {
      const pts = buildNodalPlaneProjectionPoints(plane.strike, plane.dip);
      ctx.save();
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const x = cx + pt.x * radius;
        const y = cy - pt.y * radius;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = dashed ? 1.5 : 2.1;
      if (dashed) ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.restore();
    };
    if (disp.plane1) drawNodal(disp.plane1, false);
    if (disp.plane2) drawNodal(disp.plane2, true);
  }
  ctx.restore();

  // Outer stereonet & 45-deg takeoff circle
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * Math.sqrt(1 - Math.SQRT1_2), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - radius - 8);
  ctx.fillStyle = '#475569';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('S', cx, cy + radius + 14);
  ctx.textAlign = 'left';
  ctx.fillText('E', cx + radius + 8, cy + 4);
  ctx.textAlign = 'right';
  ctx.fillText('W', cx - radius - 8, cy + 4);
  ctx.textAlign = 'left';

  // Station markers
  const stationItems =
    disp.evaluatedPicks.length > 0
      ? disp.evaluatedPicks
      : analysis.allPicks.filter((p) => p.status === 'usable' && p.projX !== null);

  for (const item of stationItems) {
    const px = cx + (item.projX ?? 0) * radius;
    const py = cy - (item.projY ?? 0) * radius;
    const isComp = item.polaritySign === 1;
    const matched = 'isMatched' in item ? item.isMatched : true;
    ctx.beginPath();
    ctx.arc(px, py, 4.6, 0, Math.PI * 2);
    ctx.fillStyle = isComp ? '#f59e0b' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = matched ? '#0f172a' : '#be123c';
    ctx.lineWidth = matched ? 1.4 : 2.1;
    ctx.stroke();

    ctx.fillStyle = matched ? '#0f172a' : '#9f1239';
    ctx.font = 'bold 9.5px ui-monospace, monospace';
    ctx.fillText(item.pick.sta, px + 6.5, py - 3);
  }

  // P, T, B markers
  const drawAxis = (
    axis: PrincipalAxis | null,
    label: 'P' | 'T' | 'B',
    bg: string,
    fg: string,
    stroke: string
  ) => {
    if (!axis) return;
    const pt = schmidtProjectLower(axis.vec);
    const ax = cx + pt.x * radius;
    const ay = cy - pt.y * radius;
    ctx.beginPath();
    ctx.arc(ax, ay, 9, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, ax, ay + 3.5);
    ctx.textAlign = 'left';
  };
  drawAxis(disp.pAxis, 'P', '#ffffff', '#0f172a', '#0f172a');
  drawAxis(disp.tAxis, 'T', '#0f172a', '#ffffff', '#ffffff');
  drawAxis(disp.bAxis, 'B', '#e2e8f0', '#0f172a', '#475569');

  // Right metadata block
  const rx = 392;
  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.fillText('MECHANISM CLASSIFICATION', rx, 106);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(disp.mechanismClass, rx, 127);

  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.fillText('NODAL PLANE 1 (Strike / Dip / Rake)', rx, 158);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(
    disp.plane1 ? `${disp.plane1.strike}° / ${disp.plane1.dip}° / ${disp.plane1.rake}°` : '—',
    rx,
    176
  );

  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.fillText('AUXILIARY PLANE 2 (Strike / Dip / Rake)', rx, 204);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(
    disp.plane2 ? `${disp.plane2.strike}° / ${disp.plane2.dip}° / ${disp.plane2.rake}°` : '—',
    rx,
    222
  );

  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.fillText('PRINCIPAL AXES (Trend / Plunge)', rx, 252);
  ctx.fillStyle = '#0f172a';
  ctx.font = '11.5px ui-monospace, monospace';
  ctx.fillText(
    `P: ${disp.pAxis ? `${disp.pAxis.trend}° / ${disp.pAxis.plunge}°` : '—'} · T: ${disp.tAxis ? `${disp.tAxis.trend}° / ${disp.tAxis.plunge}°` : '—'}`,
    rx,
    270
  );
  ctx.fillText(
    `B: ${disp.bAxis ? `${disp.bAxis.trend}° / ${disp.bAxis.plunge}°` : '—'}`,
    rx,
    287
  );

  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px system-ui, sans-serif';
  ctx.fillText('QUALITY & COVERAGE', rx, 317);
  ctx.fillStyle = '#0f172a';
  ctx.font = '11.5px ui-monospace, monospace';
  ctx.fillText(`Agreement: ${disp.agreementText}`, rx, 335);
  ctx.fillText(
    `Coverage: ${analysis.quality.coverageGrade} (Gap ${analysis.quality.maxAzimuthalGapDeg}°)`,
    rx,
    352
  );
  ctx.fillText(
    `Ambiguity: ${analysis.quality.ambiguityGrade} (${analysis.quality.acceptableSolutionCount} sol.)`,
    rx,
    369
  );

  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(20, h - 42);
  ctx.lineTo(w - 20, h - 42);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(
    `${analysis.conventionNote} · Experimental research output; causative fault cannot be inferred from beachball alone.`,
    20,
    h - 22
  );

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas PNG export returned an empty blob.'));
    }, 'image/png');
  });
}

export function formatFocalMechanismSummaryText(input: BeachballExportInput): string {
  const { event, analysis, manualExploration, isStale } = input;
  const magVal =
    event.preferredScale === 'Ms'
      ? event.ms
      : event.preferredScale === 'Mb'
        ? event.mb
        : event.md;

  const lines: string[] = [
    'EQP MODERN — RESEARCH FOCAL MECHANISM SUMMARY',
    '================================================',
    `Status              : ${analysis.status === 'computed' ? 'EXPERIMENTAL (Computed)' : 'INSUFFICIENT DATA'}${isStale ? ' [STALE — Event or picks modified after computation]' : ''}`,
    `Methodology         : ${analysis.methodologyLabel}`,
    `Convention          : ${analysis.conventionNote}`,
    `Event ID            : ${event.id} (${event.filename})`,
    `Origin (UTC)        : ${event.originDateGmt} ${event.originTimeGmt}`,
    `Hypocenter          : ${event.lat.toFixed(4)}°N, ${event.lon.toFixed(4)}°E, Depth ${event.depthKm.toFixed(1)} km`,
    `Magnitude           : ${event.preferredScale} ${magVal.toFixed(1)}`,
    `Location Source     : ${event.locationMetadata ? `${event.locationMetadata.modelName} (${event.locationMetadata.modelVersion}) / ${event.locationMetadata.solver}` : 'Stored / Legacy EQP Event'}`,
    `TOA Provenance      : ${analysis.toaProvenanceSummary}`,
    '',
  ];

  if (analysis.status === 'insufficient-data') {
    lines.push('INSUFFICIENT DATA REASONS:');
    analysis.insufficientReasons.forEach((r) => lines.push(`  - ${r}`));
  } else {
    lines.push('COMPUTED DOUBLE-COUPLE SOLUTION (EXPERIMENTAL):');
    lines.push(`  Classification    : ${analysis.mechanismClass}`);
    lines.push(
      `  Nodal Plane 1     : Strike ${analysis.plane1!.strike}° / Dip ${analysis.plane1!.dip}° / Rake ${analysis.plane1!.rake}°`
    );
    lines.push(
      `  Auxiliary Plane 2 : Strike ${analysis.plane2!.strike}° / Dip ${analysis.plane2!.dip}° / Rake ${analysis.plane2!.rake}°`
    );
    lines.push(
      `  P-Axis            : Trend ${analysis.pAxis!.trend}° / Plunge ${analysis.pAxis!.plunge}°`
    );
    lines.push(
      `  T-Axis            : Trend ${analysis.tAxis!.trend}° / Plunge ${analysis.tAxis!.plunge}°`
    );
    lines.push(
      `  B-Axis (Null)     : Trend ${analysis.bAxis!.trend}° / Plunge ${analysis.bAxis!.plunge}°`
    );
    lines.push('');
    lines.push('QUALITY & AMBIGUITY DIAGNOSTICS:');
    lines.push(
      `  Usable Picks      : ${analysis.quality.usableCount}/${analysis.quality.totalPicksCount} (Comp: ${analysis.quality.compressionCount}, Dil: ${analysis.quality.dilatationCount})`
    );
    lines.push(
      `  Polarity Agreement: ${analysis.quality.matchedCount}/${analysis.quality.usableCount} (${analysis.quality.agreementPct}% unweighted, ${analysis.quality.weightedAgreementPct}% quality-weighted)`
    );
    lines.push(
      `  Weighted Misfit   : ${analysis.quality.weightedMisfitPct}% · Near-Nodal Picks: ${analysis.quality.nearNodalCount}`
    );
    lines.push(
      `  Sphere Coverage   : ${analysis.quality.coverageGrade} (Max Gap ${analysis.quality.maxAzimuthalGapDeg}°, ${analysis.quality.occupiedQuadrants}/4 quadrants, Ray Spread ${analysis.quality.maxRaySpreadDeg}°)`
    );
    lines.push(
      `  Solution Ambiguity: ${analysis.quality.ambiguityGrade} (${analysis.quality.acceptableSolutionCount} acceptable solutions; mean Kagan spread ${analysis.quality.meanKaganSpreadDeg}°)`
    );
  }

  if (manualExploration?.enabled) {
    const m = manualExploration.evaluation;
    lines.push('');
    lines.push('MANUAL HYPOTHETICAL PLANE EXPLORATION (SEPARATE FROM FITTED SOLUTION):');
    lines.push(`  Classification    : ${m.mechanismClass}`);
    lines.push(
      `  Plane 1           : Strike ${m.plane1.strike}° / Dip ${m.plane1.dip}° / Rake ${m.plane1.rake}°`
    );
    lines.push(
      `  Plane 2           : Strike ${m.plane2.strike}° / Dip ${m.plane2.dip}° / Rake ${m.plane2.rake}°`
    );
    lines.push(
      `  Manual Fit        : ${m.matchedCount}/${m.totalCount} (${m.agreementPct}%, Weighted Misfit ${m.weightedMisfitPct}%)`
    );
  }

  lines.push('');
  lines.push('STATION POLARITY TABLE:');
  lines.push('  STA   POL  QUAL  AZIM   TOA    STATUS                 AMP      MATCH');
  for (const row of analysis.allPicks) {
    const evRow = analysis.evaluatedPicks.find((e) => e.pick.id === row.pick.id);
    const ampStr = evRow ? evRow.radiationAmplitude.toFixed(2).padStart(6) : '   —  ';
    const matchStr = evRow
      ? evRow.isMatched
        ? evRow.isNearNodal
          ? 'OK (Near-Nodal)'
          : 'Consistent'
        : evRow.isNearNodal
          ? 'Discrepant (Near-Nodal)'
          : 'Discrepant'
      : '—';
    lines.push(
      `  ${row.pick.sta.padEnd(5)} ${(row.pick.polarity || '—').padEnd(4)} ${row.pick.quality.padEnd(5)} ${row.pick.azim.toFixed(1).padStart(5)} ${row.pick.toa.toFixed(1).padStart(6)}  ${row.status.padEnd(22)} ${ampStr}   ${matchStr}`
    );
  }

  lines.push('');
  lines.push('LIMITATIONS:');
  analysis.limitations.forEach((lim) => lines.push(`  - ${lim}`));

  return lines.join('\n');
}
