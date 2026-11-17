import React, { useMemo } from 'react';
import {
  buildNodalPlaneProjectionPoints,
  NodalPlane,
  planeToVectors,
  vectorsToStrikeDipRake,
} from '../utils/focalMechanism';
import { buildCompressionalQuadrantSvgPath } from '../utils/focalMechanismExport';
import { MechanismProvenanceKind } from '../utils/historicalSeismicity';

interface HistoricalBeachballGlyphProps {
  plane1: NodalPlane;
  cx: number;
  cy: number;
  radius: number;
  provenanceKind?: MechanismProvenanceKind;
  isSelected?: boolean;
  onClick?: () => void;
  title?: string;
}

export const HistoricalBeachballGlyph: React.FC<HistoricalBeachballGlyphProps> = ({
  plane1,
  cx,
  cy,
  radius,
  provenanceKind = 'Imported',
  isSelected = false,
  onClick,
  title,
}) => {
  const { compressPath, p1Path, p2Path } = useMemo(() => {
    const { n, s } = planeToVectors(plane1.strike, plane1.dip, plane1.rake);
    const plane2 = vectorsToStrikeDipRake(s, n);
    const comp = buildCompressionalQuadrantSvgPath(n, s, cx, cy, radius, 40);

    const toSvgPath = (pts: Array<{ x: number; y: number }>) => {
      if (pts.length < 2) return '';
      return pts
        .map((pt, idx) => {
          const px = cx + pt.x * radius;
          const py = cy - pt.y * radius;
          return `${idx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
        })
        .join(' ');
    };

    const pts1 = buildNodalPlaneProjectionPoints(plane1.strike, plane1.dip, 48);
    const pts2 = buildNodalPlaneProjectionPoints(plane2.strike, plane2.dip, 48);
    return {
      compressPath: comp,
      p1Path: toSvgPath(pts1),
      p2Path: toSvgPath(pts2),
    };
  }, [plane1.strike, plane1.dip, plane1.rake, cx, cy, radius]);

  const fillColor =
    provenanceKind === 'Validated'
      ? '#1d4ed8'
      : provenanceKind === 'Experimental'
      ? '#b45309'
      : '#0f172a';

  const rimColor = isSelected ? '#dc2626' : '#0f172a';
  const rimWidth = isSelected ? 2 : 1;

  return (
    <g
      onClick={onClick}
      className={onClick ? 'cursor-pointer' : undefined}
    >
      {title && <title>{title}</title>}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="#ffffff"
        stroke={rimColor}
        strokeWidth={rimWidth}
      />
      {compressPath && <path d={compressPath} fill={fillColor} fillOpacity={0.9} />}
      {p1Path && (
        <path
          d={p1Path}
          fill="none"
          stroke="#0f172a"
          strokeWidth={Math.max(0.7, radius * 0.08)}
        />
      )}
      {p2Path && (
        <path
          d={p2Path}
          fill="none"
          stroke="#0f172a"
          strokeWidth={Math.max(0.7, radius * 0.08)}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={rimColor}
        strokeWidth={rimWidth}
      />
    </g>
  );
};

interface HistoricalBeachballCardIconProps {
  plane1: NodalPlane;
  provenanceKind?: MechanismProvenanceKind;
  size?: number;
  isSelected?: boolean;
}

export const HistoricalBeachballCardIcon: React.FC<HistoricalBeachballCardIconProps> = ({
  plane1,
  provenanceKind = 'Imported',
  size = 56,
  isSelected = false,
}) => {
  const half = size / 2;
  const radius = half - 4;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Focal mechanism ${plane1.strike}/${plane1.dip}/${plane1.rake}`}
      className="shrink-0"
    >
      <HistoricalBeachballGlyph
        plane1={plane1}
        cx={half}
        cy={half}
        radius={radius}
        provenanceKind={provenanceKind}
        isSelected={isSelected}
      />
    </svg>
  );
};

export function triggerTextDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportSvgElementAsSvg(svgEl: SVGSVGElement | null, filename: string): boolean {
  if (!svgEl) return false;
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgEl);
  if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
    source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  triggerTextDownload(filename, source, 'image/svg+xml;charset=utf-8');
  return true;
}

export async function exportSvgElementAsPng(
  svgEl: SVGSVGElement | null,
  filename: string,
  scale = 2
): Promise<boolean> {
  if (!svgEl) return false;
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(svgEl);
  if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
    source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const rect = svgEl.viewBox.baseVal;
  const width = rect && rect.width > 0 ? rect.width : svgEl.clientWidth || 800;
  const height = rect && rect.height > 0 ? rect.height : svgEl.clientHeight || 500;

  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return await new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(false);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          resolve(false);
          return;
        }
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        resolve(true);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}
