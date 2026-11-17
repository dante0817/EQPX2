import React from 'react';
import { X } from 'lucide-react';
import {
  getTrenchKindLabel,
  type SelectedGeologyFeature,
} from '../utils/geologyLayers';

interface GeologyFeatureDetailsProps {
  feature: SelectedGeologyFeature;
}

const FieldRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = false,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5 text-[11px] leading-snug">
    <span className="text-slate-500 shrink-0">{label}</span>
    <span
      className={`text-right text-slate-900 break-words ${
        mono ? 'font-mono tabular-nums' : 'font-medium'
      }`}
    >
      {value}
    </span>
  </div>
);

export const GeologyFeatureDetailsContent: React.FC<GeologyFeatureDetailsProps> = ({
  feature,
}) => {
  if (feature.kind === 'fault') {
    const p = feature.properties;
    const isPotentiallyActive = p.fault_category === 'Potentially Active Fault';
    return (
      <div className="text-xs font-sans min-w-[230px] max-w-[300px] space-y-2">
        <div className="border-b border-slate-200 pb-1.5">
          <div className="text-[10px] font-semibold tracking-wider text-slate-500">
            FAULT INFORMATION
          </div>
          <div className="text-xs font-semibold text-slate-900 mt-0.5">
            {p.fault_name ?? 'Unnamed Fault Trace'}
          </div>
          <div className="text-[11px] text-slate-600">
            {p.segment_name ?? 'Segment not available'}
          </div>
        </div>

        <div className="space-y-0.5">
          <FieldRow
            label="Classification"
            value={
              p.fault_category
                ? p.fault_category_code
                  ? `${p.fault_category} (${p.fault_category_code})`
                  : p.fault_category
                : 'Not available'
            }
          />
          <FieldRow
            label="Trace Type"
            value={p.trace_type ?? 'Not available'}
          />
          {p.line_type && <FieldRow label="Line Symbol" value={p.line_type} />}
          <FieldRow
            label="Mechanism"
            value={p.mechanism ?? 'Not available'}
          />
          <FieldRow
            label="Mapped Year"
            value={p.mapped_year !== null ? String(p.mapped_year) : 'Not available'}
            mono
          />
          {p.published_year !== null && (
            <FieldRow
              label="Published Year"
              value={String(p.published_year)}
              mono
            />
          )}
          {p.mapping_scale && (
            <FieldRow label="Mapping Scale" value={p.mapping_scale} mono />
          )}
          {p.project && <FieldRow label="Project" value={p.project} />}
          {p.additional_notes && (
            <div className="pt-1 text-[11px] text-slate-600 leading-snug border-t border-slate-100 mt-1">
              <span className="text-slate-500">Notes: </span>
              {p.additional_notes}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-1.5 text-[10.5px] text-slate-500 space-y-0.5 leading-snug">
          <div>
            Source: Uploaded Philippine fault GIS (AF_Philippines)
          </div>
          <div className={isPotentiallyActive ? 'text-amber-700 font-medium' : 'text-slate-600 font-medium'}>
            Status: Pending operational approval · Non-causal reference
          </div>
        </div>
      </div>
    );
  }

  const p = feature.properties;
  const kindLabel = getTrenchKindLabel(feature.trenchKind);

  return (
    <div className="text-xs font-sans min-w-[235px] max-w-[305px] space-y-2">
      <div className="border-b border-slate-200 pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold tracking-wider text-slate-500">
            TECTONIC LINE INFORMATION
          </span>
          <span className="text-[10px] font-semibold text-amber-700">
            REVIEW ONLY
          </span>
        </div>
        <div className="text-xs font-semibold text-slate-900 mt-0.5">
          {feature.displayName}
        </div>
        <div className="text-[11px] text-slate-600">{kindLabel}</div>
      </div>

      <div className="space-y-0.5">
        <FieldRow label="Feature Type" value={kindLabel} />
        <FieldRow label="Dataset Name" value={p.name ?? 'Not available'} />
        <FieldRow
          label="Source Label"
          value={p.source_label ?? 'Not available'}
        />
        <FieldRow label="Source CRS" value="EPSG:4253 (Luzon 1911)" mono />
        <FieldRow label="Display CRS" value="EPSG:4326 (WGS 84)" mono />
        <FieldRow
          label="Positional Accuracy"
          value="Unknown (review pending)"
        />
      </div>

      <div className="border-t border-slate-200 pt-1.5 text-[10.5px] text-slate-500 space-y-0.5 leading-snug">
        <div>
          Source: Uploaded Philippine trench GIS (trenchzone_ggrdd)
        </div>
        <div className="text-amber-700 font-medium">
          Status: REVIEW ONLY · Datum &amp; geometry verification pending · Non-causal reference
        </div>
      </div>
    </div>
  );
};

interface FloatingGeologyPopupProps {
  feature: SelectedGeologyFeature;
  onClose: () => void;
}

export const FloatingGeologyPopup: React.FC<FloatingGeologyPopupProps> = ({
  feature,
  onClose,
}) => {
  return (
    <div
      role="dialog"
      aria-label="Geological feature details"
      onClick={(e) => e.stopPropagation()}
      className="absolute top-3 right-3 z-30 w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-slate-300 bg-white/95 backdrop-blur-xs shadow-lg p-3"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close geological feature details"
        className="absolute top-2.5 right-2.5 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="pr-5">
        <GeologyFeatureDetailsContent feature={feature} />
      </div>
    </div>
  );
};
