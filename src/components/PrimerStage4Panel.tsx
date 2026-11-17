import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Compass,
  FileCheck2,
  Flame,
  Mountain,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Waves,
} from 'lucide-react';
import {
  ACTIVE_VOLCANOES,
  isEventUnlocated,
  type EQPEvent,
} from '../data/eqpData';
import { computeDistanceAndBearing } from '../utils/nearestPlaces';
import {
  updatePrimerStage4Narratives,
  type PrimerDocument,
} from '../utils/earthquakePrimer';
import {
  APPROVED_GENERAL_TEMPLATES,
  buildPrimerStage4Narratives,
  computeStage4InputFingerprint,
  createDefaultStage4ExternalData,
  STAGE4_TEMPLATE_VERSION,
  type PrimerContentState,
  type PrimerHazardCategory,
  type PrimerSeaLevelObservation,
  type PrimerSectionKey,
  type PrimerSectionReviewState,
  type PrimerStage4ExternalData,
  type PrimerTsunamiState,
  type PrimerVerifiedHazardObservation,
} from '../utils/primerScientificNarratives';

interface PrimerStage4PanelProps {
  event: EQPEvent;
  primer: PrimerDocument;
  primaryLocationLabel: string;
  faultGeneratorLabel: string | null;
  isPlotResultStale: boolean;
  onUpdatePrimer: (next: PrimerDocument, notice?: string) => void;
  onStage4FingerprintChange?: (fp: string | undefined) => void;
  onNotice?: (msg: string) => void;
  readOnly?: boolean;
}

type Stage4Tab =
  | 'overview-states'
  | 'tsunami'
  | 'tectonic-volcano'
  | 'hazards'
  | 'monitoring'
  | 'preparedness-provenance';

const CONTENT_STATE_META: Record<
  PrimerContentState,
  { label: string; className: string }
> = {
  'verified-fact': {
    label: 'Verified Fact',
    className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  },
  'approved-general-template': {
    label: 'Approved Template',
    className: 'bg-sky-50 text-sky-900 border-sky-200',
  },
  'preliminary-review': {
    label: 'Preliminary Review',
    className: 'bg-amber-50 text-amber-950 border-amber-300',
  },
  'unavailable-or-unresolved': {
    label: 'Unavailable / Unresolved',
    className: 'bg-rose-50 text-rose-900 border-rose-200',
  },
};

const HAZARD_CATEGORY_LABELS: Record<PrimerHazardCategory, string> = {
  ground_shaking: 'Ground Shaking',
  landslides: 'Landslides & Rockfalls',
  liquefaction: 'Liquefaction & Lateral Spreading',
  coastal_hazards: 'Coastal & Tsunami Hazards',
  structural_damage: 'Structural & Infrastructure Damage',
};

const TSUNAMI_STATE_OPTIONS: Array<{
  value: PrimerTsunamiState;
  label: string;
  note: string;
}> = [
  {
    value: 'unavailable',
    label: 'Unavailable / Not Confirmed',
    note: 'Default when no verified official tsunami bulletin metadata is attached.',
  },
  {
    value: 'awaiting-verification',
    label: 'Awaiting Official Bulletin Verification',
    note: 'Bulletin carries tsunami flag pending explicit official advisory number and timestamp.',
  },
  {
    value: 'official-warning-or-advisory',
    label: 'Official Tsunami Warning / Advisory Active',
    note: 'Confirmed official tsunami warning, advisory, or sea-level monitoring bulletin.',
  },
  {
    value: 'official-no-tsunami',
    label: 'Official "No Destructive Tsunami" Advisory',
    note: 'Use only when citing an explicit official No-Tsunami advisory document.',
  },
];

export const PrimerStage4Panel: React.FC<PrimerStage4PanelProps> = ({
  event,
  primer,
  primaryLocationLabel,
  faultGeneratorLabel,
  isPlotResultStale,
  onUpdatePrimer,
  onStage4FingerprintChange,
  readOnly = false,
}) => {
  const [activeTab, setActiveTab] = useState<Stage4Tab>('overview-states');
  const [externalData, setExternalData] = useState<PrimerStage4ExternalData>(
    () =>
      primer.extensions?.scientificNarrativePackage?.externalData ??
      createDefaultStage4ExternalData(event)
  );

  // Sync externalData when switching primer draft IDs, restoring revisions, or applying R3 transfers
  const externalPkgFp = primer.extensions?.scientificNarrativePackage?.inputFingerprint;
  useEffect(() => {
    const existing = primer.extensions?.scientificNarrativePackage?.externalData;
    setExternalData(existing ?? createDefaultStage4ExternalData(event));
  }, [
    primer.id,
    primer.extensions?.reviewVersioning?.restoredFromRevisionId,
    externalPkgFp,
  ]);

  const stage3Package = primer.extensions?.sequenceHistoricalAnalysis ?? null;
  const epicenterFigure = primer.extensions?.epicenterFigure ?? null;

  const liveFingerprint = useMemo(
    () =>
      computeStage4InputFingerprint({
        event,
        primaryLocationLabel,
        faultGeneratorLabel,
        isPlotResultStale,
        stage3Package,
        externalData,
      }),
    [
      event,
      primaryLocationLabel,
      faultGeneratorLabel,
      isPlotResultStale,
      stage3Package,
      externalData,
    ]
  );

  useEffect(() => {
    onStage4FingerprintChange?.(liveFingerprint);
  }, [liveFingerprint, onStage4FingerprintChange]);

  const pkg4 = primer.extensions?.scientificNarrativePackage ?? null;
  const isStage4Stale = Boolean(
    pkg4 && pkg4.inputFingerprint !== liveFingerprint
  );

  const nearbyVolcanoes = useMemo(() => {
    if (isEventUnlocated(event) || !Number.isFinite(event.lat) || !Number.isFinite(event.lon)) {
      return [];
    }
    return ACTIVE_VOLCANOES.map((v) => {
      const { distKm, quadrantLabel } = computeDistanceAndBearing(
        v.lat,
        v.lon,
        event.lat,
        event.lon
      );
      return {
        ...v,
        distanceKm: distKm,
        compassBearing: quadrantLabel,
      };
    })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 4);
  }, [event.lat, event.lon, event.iterations]);

  const compileStage4 = (options?: {
    overrideData?: PrimerStage4ExternalData;
    forceOverwriteEdited?: boolean;
    targetSectionIds?: PrimerSectionKey[];
    noticeMsg?: string;
  }) => {
    if (readOnly) return;
    const dataToUse = options?.overrideData ?? externalData;
    const compiled = buildPrimerStage4Narratives({
      event,
      externalData: dataToUse,
      epicenterFigure,
      stage3Package,
      primaryLocationLabel,
      faultGeneratorLabel,
      isPlotResultStale,
    });
    const nextPrimer = updatePrimerStage4Narratives(primer, compiled, {
      syncSections: true,
      forceOverwriteEdited: options?.forceOverwriteEdited ?? false,
      targetSectionIds: options?.targetSectionIds,
    });
    const defaultNotice = options?.forceOverwriteEdited
      ? `Synced Stage 4 scientific narrative to selected section(s) for ${event.id}`
      : `Compiled Stage 4 scientific narratives & provenance ledger (${compiled.stateSummary['verified-fact']} verified, ${compiled.stateSummary['preliminary-review']} preliminary)`;
    onUpdatePrimer(nextPrimer, options?.noticeMsg ?? defaultNotice);
  };

  const addSeaLevelObservation = () => {
    const newObs: PrimerSeaLevelObservation = {
      id: `sl_${Date.now()}`,
      stationName: '',
      maxWaveHeightM: '',
      observedAtUtc: '',
      observationType: 'tide-gauge',
      sourceRef: '',
      reviewStatus: 'requires-scientific-review',
    };
    setExternalData((prev) => ({
      ...prev,
      tsunami: {
        ...prev.tsunami,
        seaLevelObservations: [...prev.tsunami.seaLevelObservations, newObs],
      },
    }));
  };

  const updateSeaLevelObs = (
    obsId: string,
    patch: Partial<PrimerSeaLevelObservation>
  ) => {
    setExternalData((prev) => ({
      ...prev,
      tsunami: {
        ...prev.tsunami,
        seaLevelObservations: prev.tsunami.seaLevelObservations.map((o) =>
          o.id === obsId ? { ...o, ...patch } : o
        ),
      },
    }));
  };

  const removeSeaLevelObs = (obsId: string) => {
    setExternalData((prev) => ({
      ...prev,
      tsunami: {
        ...prev.tsunami,
        seaLevelObservations: prev.tsunami.seaLevelObservations.filter(
          (o) => o.id !== obsId
        ),
      },
    }));
  };

  const addHazardObservation = () => {
    const newItem: PrimerVerifiedHazardObservation = {
      id: `haz_${Date.now()}`,
      hazardType: 'ground_shaking',
      location: '',
      observedAtUtc: '',
      description: '',
      source: '',
      reviewStatus: 'requires-scientific-review',
    };
    setExternalData((prev) => ({
      ...prev,
      hazardObservations: [...prev.hazardObservations, newItem],
    }));
  };

  const updateHazardObservation = (
    obsId: string,
    patch: Partial<PrimerVerifiedHazardObservation>
  ) => {
    setExternalData((prev) => ({
      ...prev,
      hazardObservations: prev.hazardObservations.map((item) =>
        item.id === obsId ? { ...item, ...patch } : item
      ),
    }));
  };

  const removeHazardObservation = (obsId: string) => {
    setExternalData((prev) => ({
      ...prev,
      hazardObservations: prev.hazardObservations.filter((i) => i.id !== obsId),
    }));
  };

  const tabItems: Array<{
    id: Stage4Tab;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'overview-states',
      label: 'Content States & Sync',
      icon: <FileCheck2 className="w-3.5 h-3.5" />,
    },
    {
      id: 'tsunami',
      label: 'Tsunami & Sea Level',
      icon: <Waves className="w-3.5 h-3.5" />,
    },
    {
      id: 'tectonic-volcano',
      label: 'Tectonic & Volcano',
      icon: <Compass className="w-3.5 h-3.5" />,
    },
    {
      id: 'hazards',
      label: 'Secondary Hazards',
      icon: <Mountain className="w-3.5 h-3.5" />,
    },
    {
      id: 'monitoring',
      label: 'Monitoring & Response',
      icon: <ShieldAlert className="w-3.5 h-3.5" />,
    },
    {
      id: 'preparedness-provenance',
      label: 'Preparedness & Provenance',
      icon: <BookOpen className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <section className="border border-slate-200 rounded-xs bg-white overflow-hidden">
      {/* Header Bar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#005a94] shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Stage 4 · Scientific Narratives, Hazard Verification &amp; Provenance
            </h3>
            {pkg4 ? (
              <span
                className={`text-[10.5px] font-mono tabular-nums px-2 py-0.5 border rounded-xs whitespace-nowrap ${
                  isStage4Stale
                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                }`}
              >
                {isStage4Stale ? 'Inputs Changed · Needs Compile' : 'Synchronized'}
              </span>
            ) : (
              <span className="text-[10.5px] font-mono px-2 py-0.5 border border-slate-300 bg-white text-slate-700 rounded-xs whitespace-nowrap">
                Not Compiled Yet
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Distinguishes verified facts, approved general templates ({STAGE4_TEMPLATE_VERSION}), preliminary specialist entries, and unavailable data. Preserves manual section edits.
          </p>
        </div>

        {!readOnly ? (
          <button
            type="button"
            onClick={() => compileStage4()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-[11px] font-semibold hover:bg-[#004877] transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{pkg4 ? 'Recompile Narratives' : 'Compile Stage 4 Narratives'}</span>
          </button>
        ) : (
          <span className="text-[10.5px] font-mono text-slate-500 shrink-0">
            Snapshot Read-Only View
          </span>
        )}
      </div>

      {/* Stale Input Warning */}
      {!readOnly && pkg4 && isStage4Stale && (
        <div className="bg-amber-50 border-b border-amber-300 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Event parameters, verified PEIS entries, Stage 3 sequence output, or specialist inputs changed since last Stage 4 compile{' '}
              <span className="font-mono text-[11px]">
                ({pkg4.inputFingerprint.slice(0, 8)} ≠ {liveFingerprint.slice(0, 8)})
              </span>
              .
            </span>
          </div>
          <button
            type="button"
            onClick={() => compileStage4()}
            className="px-2.5 py-1 rounded-xs border border-amber-400 bg-white text-amber-950 text-[11px] font-semibold hover:bg-amber-100 whitespace-nowrap shrink-0"
          >
            Recompile Now
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div
        className="border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 flex flex-wrap gap-1"
        role="tablist"
        aria-label="Stage 4 scientific content categories"
      >
        {tabItems.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-xs border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-[#005a94] border-slate-300'
                  : 'bg-transparent text-slate-600 border-transparent hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <fieldset disabled={readOnly} className="p-3.5 space-y-3 text-xs border-0 m-0 min-w-0">
        {activeTab === 'overview-states' && (
          <div className="space-y-3">
            {!pkg4 ? (
              <div className="border border-slate-200 rounded-xs bg-slate-50 p-4 text-center space-y-2">
                <p className="text-xs text-slate-700">
                  Click <strong>Compile Stage 4 Narratives</strong> to assemble extended overview/location prose, Stage 3 sequence totals, verified PEIS descriptors, tsunami/tectonic safeguards, hazard blocks, and source provenance without overwriting manually edited sections.
                </p>
                <button
                  type="button"
                  onClick={() => compileStage4()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xs bg-[#005a94] text-white text-xs font-semibold hover:bg-[#004877] whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Compile Stage 4 Narratives</span>
                </button>
              </div>
            ) : (
              <>
                {/* 4-State Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    Object.keys(CONTENT_STATE_META) as PrimerContentState[]
                  ).map((stateKey) => {
                    const meta = CONTENT_STATE_META[stateKey];
                    return (
                      <div
                        key={stateKey}
                        className={`border rounded-xs p-2.5 ${meta.className}`}
                      >
                        <div className="text-[10.5px] font-bold uppercase tracking-wider">
                          {meta.label}
                        </div>
                        <div className="text-lg font-mono tabular-nums font-bold mt-0.5">
                          {pkg4.stateSummary[stateKey]}
                        </div>
                        <div className="text-[10px] opacity-80">subsections</div>
                      </div>
                    );
                  })}
                </div>

                {/* Metadata Audit Strip */}
                <div className="border border-slate-200 rounded-xs bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-slate-700">
                  <span>
                    <strong>Template:</strong> {pkg4.templateVersion}
                  </span>
                  <span>
                    <strong>Data Cutoff (UTC):</strong> {pkg4.dataCutoffUtc}
                  </span>
                  <span>
                    <strong>PST:</strong> {pkg4.dataCutoffPst}
                  </span>
                  <span>
                    <strong>Fingerprint:</strong> {pkg4.inputFingerprint}
                  </span>
                </div>

                {/* Per-Section Sync Table */}
                <div className="overflow-x-auto border border-slate-200 rounded-xs">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
                        <th className="py-2 px-2.5 font-bold">Section</th>
                        <th className="py-2 px-2.5 font-bold">Content State</th>
                        <th className="py-2 px-2.5 font-bold">Editor Sync</th>
                        <th className="py-2 px-2.5 font-bold">Missing / Pending Indicators</th>
                        <th className="py-2 px-2.5 font-bold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {primer.sections.map((sec) => {
                        const block = pkg4.sectionNarratives[sec.id];
                        const stateMeta = CONTENT_STATE_META[block.contentState];
                        return (
                          <tr key={sec.id} className="hover:bg-slate-50/70">
                            <td className="py-2 px-2.5 font-semibold text-slate-900">
                              {sec.title}
                            </td>
                            <td className="py-2 px-2.5">
                              <span
                                className={`inline-block px-1.5 py-0.5 border rounded-xs font-mono text-[10px] whitespace-nowrap ${stateMeta.className}`}
                              >
                                {stateMeta.label}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 font-mono text-[10.5px]">
                              {sec.isEdited ? (
                                <span className="text-amber-800 font-semibold">
                                  Manual Edit Preserved
                                </span>
                              ) : (
                                <span className="text-emerald-800">Auto-Synced</span>
                              )}
                            </td>
                            <td className="py-2 px-2.5 text-slate-600">
                              {block.missingIndicators.length > 0
                                ? block.missingIndicators.join(' · ')
                                : 'None'}
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  compileStage4({
                                    forceOverwriteEdited: true,
                                    targetSectionIds: [sec.id],
                                    noticeMsg: `Applied Stage 4 structured text to "${sec.title}"`,
                                  })
                                }
                                className="px-2 py-1 rounded-xs border border-slate-300 bg-white text-slate-800 text-[10.5px] font-semibold hover:bg-slate-100 whitespace-nowrap"
                                title="Replace this section editor content with the compiled Stage 4 narrative"
                              >
                                Sync to Section
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'tsunami' && (
          <div className="space-y-3">
            <div className="border border-amber-300 bg-amber-50 rounded-xs px-3 py-2 text-[11px] text-amber-950">
              <strong>Tsunami Verification Safeguard:</strong> Never infer tsunami occurrence or confirm tsunami absence solely from magnitude, depth, or offshore coordinates. Select <em>Official Warning/Advisory</em> or <em>Official No-Tsunami</em> only when backed by an explicit PHIVOLCS or authorized tsunami bulletin.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label
                  htmlFor="s4-tsunami-state"
                  className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Verified Tsunami Advisory State
                </label>
                <select
                  id="s4-tsunami-state"
                  value={externalData.tsunami.state}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: {
                        ...prev.tsunami,
                        state: e.target.value as PrimerTsunamiState,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                >
                  {TSUNAMI_STATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.note}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Official Advisory / Bulletin ID
                </label>
                <input
                  type="text"
                  placeholder="e.g., PHIVOLCS Tsunami Advisory No. 2"
                  value={externalData.tsunami.officialAdvisoryId}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: {
                        ...prev.tsunami,
                        officialAdvisoryId: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Issuing Agency
                </label>
                <input
                  type="text"
                  value={externalData.tsunami.issuingAgency}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: { ...prev.tsunami, issuingAgency: e.target.value },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Issued At (PST / UTC)
                </label>
                <input
                  type="text"
                  placeholder="e.g., 2026-06-08 08:15 AM PST"
                  value={externalData.tsunami.issuedAt}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: { ...prev.tsunami, issuedAt: e.target.value },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Cancelled / Lifted At (if applicable)
                </label>
                <input
                  type="text"
                  placeholder="e.g., 2026-06-08 11:30 AM PST (leave blank if active)"
                  value={externalData.tsunami.cancelledAt}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: { ...prev.tsunami, cancelledAt: e.target.value },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Status As-Of Time
                </label>
                <input
                  type="text"
                  placeholder="e.g., 2026-06-08 12:00 PM PST"
                  value={externalData.tsunami.advisoryStatusAsOfTime}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: {
                        ...prev.tsunami,
                        advisoryStatusAsOfTime: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Source Document Reference
                </label>
                <input
                  type="text"
                  placeholder="URL, bulletin PDF ID, or DOST-PHIVOLCS circular ref"
                  value={externalData.tsunami.sourceDocumentRef}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: {
                        ...prev.tsunami,
                        sourceDocumentRef: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Affected Coastal Areas (Verified Bulletin Scope)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Sarangani, Davao Occidental, South Cotabato coastal municipalities"
                  value={externalData.tsunami.affectedCoastalAreas}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      tsunami: {
                        ...prev.tsunami,
                        affectedCoastalAreas: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                />
              </div>
            </div>

            {/* Verified Sea-Level Observations */}
            <div className="border border-slate-200 rounded-xs p-3 space-y-2 bg-slate-50/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Verified Sea-Level / Tide Gauge Measurements ({externalData.tsunami.seaLevelObservations.length})
                </span>
                <button
                  type="button"
                  onClick={addSeaLevelObservation}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Station Reading</span>
                </button>
              </div>

              {externalData.tsunami.seaLevelObservations.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No verified sea-level station observations added. Never invent wave height readings.
                </p>
              ) : (
                <div className="space-y-2">
                  {externalData.tsunami.seaLevelObservations.map((obs) => (
                    <div
                      key={obs.id}
                      className="grid grid-cols-1 sm:grid-cols-6 gap-2 bg-white border border-slate-200 rounded-xs p-2 items-end"
                    >
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Station Name
                        </label>
                        <input
                          type="text"
                          value={obs.stationName}
                          onChange={(e) =>
                            updateSeaLevelObs(obs.id, {
                              stationName: e.target.value,
                            })
                          }
                          placeholder="e.g., Davao Tide Station"
                          className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Max Height (m)
                        </label>
                        <input
                          type="text"
                          value={obs.maxWaveHeightM}
                          onChange={(e) =>
                            updateSeaLevelObs(obs.id, {
                              maxWaveHeightM: e.target.value,
                            })
                          }
                          placeholder="0.18 m"
                          className="w-full px-2 py-1 text-[11px] font-mono border border-slate-300 rounded-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Observed At (UTC)
                        </label>
                        <input
                          type="text"
                          value={obs.observedAtUtc}
                          onChange={(e) =>
                            updateSeaLevelObs(obs.id, {
                              observedAtUtc: e.target.value,
                            })
                          }
                          placeholder="2026-06-08T01:42Z"
                          className="w-full px-2 py-1 text-[11px] font-mono border border-slate-300 rounded-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Source Ref
                        </label>
                        <input
                          type="text"
                          value={obs.sourceRef}
                          onChange={(e) =>
                            updateSeaLevelObs(obs.id, {
                              sourceRef: e.target.value,
                            })
                          }
                          placeholder="NAMRIA / IOC"
                          className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 mb-0.5">
                          Review Status
                        </label>
                        <select
                          value={obs.reviewStatus}
                          onChange={(e) =>
                            updateSeaLevelObs(obs.id, {
                              reviewStatus: e.target
                                .value as PrimerSectionReviewState,
                            })
                          }
                          className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-xs bg-white"
                        >
                          <option value="ready-for-review">Verified</option>
                          <option value="requires-scientific-review">
                            Pending Review
                          </option>
                          <option value="requires-info">Requires Info</option>
                        </select>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeSeaLevelObs(obs.id)}
                          aria-label="Remove sea level observation"
                          className="p-1.5 text-slate-500 hover:text-rose-700 border border-slate-200 rounded-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tectonic-volcano' && (
          <div className="space-y-4">
            {/* Tectonic Generator */}
            <div className="border border-slate-200 rounded-xs p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  5.1 Tectonic Setting &amp; Specialist Causative Source Review
                </span>
                <span className="text-[10.5px] font-mono text-slate-600">
                  Stage 2 Nearest Structure:{' '}
                  <strong>{faultGeneratorLabel || 'Pending GIS/Nearest Lookup'}</strong>
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xs px-2.5 py-1.5 text-[11px] text-slate-600">
                {APPROVED_GENERAL_TEMPLATES.tectonicContextNote}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className="md:col-span-3">
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Reviewed Expert Tectonic Interpretation (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter geologist/seismologist interpretation grounded in focal mechanism, aftershock distribution, or crustal geology..."
                    value={externalData.tectonic.expertInterpretation}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        tectonic: {
                          ...prev.tectonic,
                          expertInterpretation: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs focus:outline-none focus:border-[#005a94]"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Supporting Evidence References
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., PHIVOLCS CMT, relocated aftershock profile"
                    value={externalData.tectonic.evidenceReferences}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        tectonic: {
                          ...prev.tectonic,
                          evidenceReferences: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Specialist Reviewer
                  </label>
                  <input
                    type="text"
                    placeholder="Name / Division"
                    value={externalData.tectonic.reviewerName}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        tectonic: {
                          ...prev.tectonic,
                          reviewerName: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Tectonic Interpretation Status
                  </label>
                  <select
                    value={externalData.tectonic.reviewStatus}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        tectonic: {
                          ...prev.tectonic,
                          reviewStatus: e.target.value as
                            | 'requires-scientific-review'
                            | 'ready-for-review',
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                  >
                    <option value="requires-scientific-review">
                      Preliminary / Requires Scientific Review
                    </option>
                    <option value="ready-for-review">
                      Reviewed / Verified Interpretation
                    </option>
                  </select>
                </div>
              </div>
            </div>

            {/* Volcano Considerations */}
            <div className="border border-slate-200 rounded-xs p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  <Flame className="w-3.5 h-3.5 text-[#005a94]" />
                  <span>Volcano-Related Considerations (Non-Inferential)</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={externalData.volcano.includeSection}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        volcano: {
                          ...prev.volcano,
                          includeSection: e.target.checked,
                        },
                      }))
                    }
                    className="accent-[#005a94]"
                  />
                  <span>Include Volcano Subsection in Tectonic Narrative</span>
                </label>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xs px-2.5 py-1.5 text-[11px] text-slate-600">
                {APPROVED_GENERAL_TEMPLATES.volcanoNonInferenceNote}
              </div>

              {nearbyVolcanoes.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {nearbyVolcanoes.map((v) => (
                    <div
                      key={v.name}
                      className="border border-slate-200 rounded-xs px-2 py-1.5 bg-white"
                    >
                      <div className="font-semibold text-slate-900 text-[11px] truncate">
                        {v.name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {v.province}
                      </div>
                      <div className="text-[10.5px] font-mono tabular-nums text-[#005a94] mt-0.5">
                        {v.distanceKm.toFixed(1)} km ({v.compassBearing})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Epicenter coordinates unavailable — geodesic distances to PHIVOLCS active volcanoes pending location.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className="md:col-span-3">
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Volcano Observatory Statement (Editable)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Supply verified volcano observatory observation statement if applicable..."
                    value={externalData.volcano.expertStatement}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        volcano: {
                          ...prev.volcano,
                          expertStatement: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Cited Monitoring Observations / Volcano Bulletins
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Matutum / Parker Observatory seismic & visual logs"
                    value={externalData.volcano.citedMonitoringObservations}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        volcano: {
                          ...prev.volcano,
                          citedMonitoringObservations: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Review Status
                  </label>
                  <select
                    value={externalData.volcano.reviewStatus}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        volcano: {
                          ...prev.volcano,
                          reviewStatus: e.target
                            .value as PrimerSectionReviewState,
                        },
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                  >
                    <option value="requires-info">Requires Info</option>
                    <option value="requires-scientific-review">
                      Requires Scientific Review
                    </option>
                    <option value="ready-for-review">
                      Verified Observatory Statement
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'hazards' && (
          <div className="space-y-3">
            {/* Approved General Hazard Guidance Blocks */}
            <div className="border border-slate-200 rounded-xs p-3 bg-slate-50/50 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Approved General Hazard Guidance ({STAGE4_TEMPLATE_VERSION})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(
                  Object.keys(
                    APPROVED_GENERAL_TEMPLATES.hazards
                  ) as PrimerHazardCategory[]
                ).map((cat) => {
                  const tpl = APPROVED_GENERAL_TEMPLATES.hazards[cat];
                  return (
                    <div
                      key={cat}
                      className="bg-white border border-slate-200 rounded-xs p-2.5"
                    >
                      <div className="font-semibold text-slate-900 text-[11.5px]">
                        {tpl.title}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        {tpl.template}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Verified Event-Specific Hazard Field Observations */}
            <div className="border border-slate-200 rounded-xs p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Verified Event-Specific Field Hazard Observations ({externalData.hazardObservations.length})
                </span>
                <button
                  type="button"
                  onClick={addHazardObservation}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Verified Observation</span>
                </button>
              </div>

              {externalData.hazardObservations.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No field-verified secondary hazard observations recorded yet. Section 6 clearly separates general susceptibility guidance from confirmed event impacts.
                </p>
              ) : (
                <div className="space-y-2">
                  {externalData.hazardObservations.map((obs) => (
                    <div
                      key={obs.id}
                      className="border border-slate-200 rounded-xs p-2.5 bg-slate-50/40 space-y-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Hazard Category
                          </label>
                          <select
                            value={obs.hazardType}
                            onChange={(e) =>
                              updateHazardObservation(obs.id, {
                                hazardType: e.target
                                  .value as PrimerHazardCategory,
                              })
                            }
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-xs"
                          >
                            {(
                              Object.keys(
                                HAZARD_CATEGORY_LABELS
                              ) as PrimerHazardCategory[]
                            ).map((k) => (
                              <option key={k} value={k}>
                                {HAZARD_CATEGORY_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Locality / Site
                          </label>
                          <input
                            type="text"
                            value={obs.location}
                            onChange={(e) =>
                              updateHazardObservation(obs.id, {
                                location: e.target.value,
                              })
                            }
                            placeholder="Municipality, Province"
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Observed Timestamp
                          </label>
                          <input
                            type="text"
                            value={obs.observedAtUtc}
                            onChange={(e) =>
                              updateHazardObservation(obs.id, {
                                observedAtUtc: e.target.value,
                              })
                            }
                            placeholder="2026-06-08T03:00Z"
                            className="w-full px-2 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            Source / QRT Report
                          </label>
                          <input
                            type="text"
                            value={obs.source}
                            onChange={(e) =>
                              updateHazardObservation(obs.id, {
                                source: e.target.value,
                              })
                            }
                            placeholder="QRT / LGU Engineering"
                            className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={obs.reviewStatus}
                            onChange={(e) =>
                              updateHazardObservation(obs.id, {
                                reviewStatus: e.target
                                  .value as PrimerSectionReviewState,
                              })
                            }
                            className="flex-1 px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-xs"
                          >
                            <option value="ready-for-review">Verified</option>
                            <option value="requires-scientific-review">
                              Pending Review
                            </option>
                            <option value="requires-info">Requires Info</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => removeHazardObservation(obs.id)}
                            aria-label="Remove hazard observation"
                            className="p-1.5 text-slate-500 hover:text-rose-700 border border-slate-200 rounded-xs bg-white"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={obs.description}
                        onChange={(e) =>
                          updateHazardObservation(obs.id, {
                            description: e.target.value,
                          })
                        }
                        placeholder="Describe observed ground shaking damage, landslide, sand boils/liquefaction, or coastal perturbation with source attribution..."
                        className="w-full px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'monitoring' && (
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-xs bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              Record only genuine PHIVOLCS monitoring activities, Quick Response Team (QRT) deployments, field investigations, agency coordination, and published products. Empty fields are rendered explicitly as unavailable rather than invented.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  24/7 Seismic &amp; Sea-Level Monitoring Activities
                </label>
                <textarea
                  rows={2}
                  value={externalData.monitoringResponse.monitoringActivities}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        monitoringActivities: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g., Continuous 24/7 SOEPD waveform processing & tsunami sea-level monitoring..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Scientific Field Investigations
                </label>
                <textarea
                  rows={2}
                  value={externalData.monitoringResponse.fieldInvestigations}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        fieldInvestigations: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g., Geological & macroseismic field mapping in affected provinces..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Quick Response Team (QRT) Deployment
                </label>
                <textarea
                  rows={2}
                  value={externalData.monitoringResponse.qrtDeployments}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        qrtDeployments: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g., PHIVOLCS QRT deployed on [date] for rapid intensity & hazard assessment"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  LGU / RDRRMC / Agency Coordination
                </label>
                <textarea
                  rows={2}
                  value={externalData.monitoringResponse.lguAgencyCoordination}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        lguAgencyCoordination: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g., Briefings with OCD, RDRRMC, and provincial DRRMOs..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Published Information Products
                </label>
                <input
                  type="text"
                  value={externalData.monitoringResponse.publishedProducts}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        publishedProducts: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g., Earthquake Information Bulletins Nos. 1–3, Tsunami Advisory"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Monitoring Facilities / Stations (Verified Only)
                </label>
                <input
                  type="text"
                  value={
                    externalData.monitoringResponse.monitoringFacilitiesOrStations
                  }
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        monitoringFacilitiesOrStations: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Operations Source / Log Reference
                </label>
                <input
                  type="text"
                  value={externalData.monitoringResponse.sourceRef}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        sourceRef: e.target.value,
                      },
                    }))
                  }
                  placeholder="e.g., SOEPD SitRep / Operations Log"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Monitoring Record Review Status
                </label>
                <select
                  value={externalData.monitoringResponse.reviewStatus}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      monitoringResponse: {
                        ...prev.monitoringResponse,
                        reviewStatus: e.target.value as PrimerSectionReviewState,
                      },
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                >
                  <option value="requires-info">Requires Info</option>
                  <option value="requires-scientific-review">
                    Preliminary / Pending Review
                  </option>
                  <option value="ready-for-review">
                    Verified Operations Record
                  </option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preparedness-provenance' && (
          <div className="space-y-4">
            {/* Versioned Preparedness Guidance vs Event-Specific Advisories */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-xs p-3 bg-slate-50/50 space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Approved General Preparedness Templates ({STAGE4_TEMPLATE_VERSION})
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-700 list-disc pl-4">
                  <li>
                    <strong>Protective Actions:</strong>{' '}
                    {
                      APPROVED_GENERAL_TEMPLATES.preparedness
                        .earthquakeProtectiveActions
                    }
                  </li>
                  <li>
                    <strong>Aftershock Guidance:</strong>{' '}
                    {APPROVED_GENERAL_TEMPLATES.preparedness.aftershockGuidance}
                  </li>
                  <li>
                    <strong>Structural Safety:</strong>{' '}
                    {APPROVED_GENERAL_TEMPLATES.preparedness.structuralSafety}
                  </li>
                  <li>
                    <strong>Landslide Precautions:</strong>{' '}
                    {
                      APPROVED_GENERAL_TEMPLATES.preparedness
                        .landslidePrecautions
                    }
                  </li>
                  <li>
                    <strong>Coastal Natural Warnings:</strong>{' '}
                    {
                      APPROVED_GENERAL_TEMPLATES.preparedness
                        .coastalNaturalWarnings
                    }
                  </li>
                </ul>
              </div>

              <div className="border border-slate-200 rounded-xs p-3 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Authorized Event-Specific Public Advisories
                </div>
                <textarea
                  rows={4}
                  value={externalData.eventSpecificPreparednessAdvisories}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      eventSpecificPreparednessAdvisories: e.target.value,
                    }))
                  }
                  placeholder="Enter authorized PHIVOLCS/DRRMO event-specific recommendations (never fabricate evacuation orders)..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
                <input
                  type="text"
                  value={externalData.eventSpecificAdvisoriesSource}
                  onChange={(e) =>
                    setExternalData((prev) => ({
                      ...prev,
                      eventSpecificAdvisoriesSource: e.target.value,
                    }))
                  }
                  placeholder="Authorization / Duty Officer Reference"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
                <label className="flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={externalData.eventSpecificAdvisoriesVerified}
                    onChange={(e) =>
                      setExternalData((prev) => ({
                        ...prev,
                        eventSpecificAdvisoriesVerified: e.target.checked,
                      }))
                    }
                    className="accent-[#005a94]"
                  />
                  <span>
                    Authorized by PHIVOLCS Duty Officer / Approving Authority
                  </span>
                </label>
              </div>
            </div>

            {/* Scientific Provenance Ledger */}
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Compiled Stage 4 Scientific Provenance Ledger ({pkg4?.provenanceLedger.length ?? 0} entries)
                </span>
                {pkg4 && (
                  <span className="text-[10.5px] font-mono tabular-nums text-slate-500">
                    Cutoff: {pkg4.dataCutoffUtc}
                  </span>
                )}
              </div>
              {!pkg4 || pkg4.provenanceLedger.length === 0 ? (
                <div className="p-3 text-[11px] text-slate-500">
                  Compile Stage 4 narratives to generate source provenance records linking every verified event claim to its source document, revision, and cutoff timestamp.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[10.5px]">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                      <tr>
                        <th className="py-1.5 px-2 font-bold">Claim Key</th>
                        <th className="py-1.5 px-2 font-bold">State</th>
                        <th className="py-1.5 px-2 font-bold">Source Identity</th>
                        <th className="py-1.5 px-2 font-bold">Reference / Rev</th>
                        <th className="py-1.5 px-2 font-bold">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {pkg4.provenanceLedger.map((rec) => {
                        const meta = CONTENT_STATE_META[rec.contentState];
                        return (
                          <tr key={rec.claimKey}>
                            <td className="py-1.5 px-2 font-mono text-slate-800">
                              {rec.claimKey}
                            </td>
                            <td className="py-1.5 px-2">
                              <span
                                className={`inline-block px-1.5 py-0.5 border rounded-xs font-mono text-[9.5px] whitespace-nowrap ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-slate-700">
                              {rec.sourceIdentity}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-slate-600">
                              {rec.sourceReference}
                              {rec.sourceRevision ? ` (${rec.sourceRevision})` : ''}
                            </td>
                            <td className="py-1.5 px-2 font-mono tabular-nums text-slate-600">
                              {rec.observationOrBulletinTimestamp ?? 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </fieldset>
    </section>
  );
};
