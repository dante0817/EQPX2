import React, { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, GitCompare, X } from 'lucide-react';
import type { PrimerRevisionComparisonReport } from '../utils/primerRevisions';

interface PrimerRevisionComparePanelProps {
  report: PrimerRevisionComparisonReport;
  onSwapDirection: () => void;
  onClose: () => void;
}

export const PrimerRevisionComparePanel: React.FC<PrimerRevisionComparePanelProps> = ({
  report,
  onSwapDirection,
  onClose,
}) => {
  const [showUnchangedSections, setShowUnchangedSections] = useState(false);

  const visibleSections = showUnchangedSections
    ? report.narrativeSectionDiffs
    : report.narrativeSectionDiffs.filter((s) => s.changed);

  return (
    <section className="border border-slate-300 rounded-xs bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <GitCompare className="w-4 h-4 text-[#005a94] shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Primer Revision Comparison
            </h3>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-[11px] font-mono text-slate-700 truncate">
              {report.leftLabel} → {report.rightLabel}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">{report.disclaimer}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onSwapDirection}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>Swap Base / Target</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
          >
            <X className="w-3 h-3" />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* Summary Counts Strip */}
      <div className="px-3.5 py-2.5 bg-slate-50/50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
        <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Event Params</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {report.summary.eventParameterChangeCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Sections</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {report.summary.changedNarrativeSectionsCount}/7
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Observations</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {report.summary.observationChangeCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Aftershocks</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {report.summary.aftershockMetricChangeCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Figures</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {report.summary.changedFiguresCount}/4
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Citations/Ver</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {report.summary.citationOrVersionChangeCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xs px-2.5 py-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Layout Config</div>
          <div className="font-mono tabular-nums font-bold text-slate-900">
            {report.summary.presentationChanged ? 'Modified' : 'Identical'}
          </div>
        </div>
      </div>

      {!report.summary.hasAnyDifference ? (
        <div className="p-6 text-center text-xs text-emerald-900 bg-emerald-50/40 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>No differences detected across parameters, narrative sections, observations, figures, citations, or layout configuration.</span>
        </div>
      ) : (
        <div className="p-3.5 space-y-4 text-xs">
          {/* 1. Event Parameter Changes */}
          {report.eventParameterChanges.length > 0 && (
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-700">
                1. Modified Event &amp; Document Parameters ({report.eventParameterChanges.length})
              </div>
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-50/60 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-1.5 px-2.5 font-semibold w-1/4">Parameter</th>
                    <th className="py-1.5 px-2.5 font-semibold w-[37.5%]">Base</th>
                    <th className="py-1.5 px-2.5 font-semibold w-[37.5%]">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.eventParameterChanges.map((ch) => (
                    <tr key={ch.field}>
                      <td className="py-1.5 px-2.5 font-semibold text-slate-800">{ch.label}</td>
                      <td className="py-1.5 px-2.5 font-mono text-rose-800 bg-rose-50/40 break-words">
                        {ch.before}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-emerald-900 bg-emerald-50/40 break-words">
                        {ch.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. Narrative Sections Diff */}
          <div className="border border-slate-200 rounded-xs overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between gap-2">
              <span className="font-bold uppercase tracking-wider text-[10.5px] text-slate-700">
                2. Narrative Sections &amp; Subsections ({report.summary.changedNarrativeSectionsCount} changed)
              </span>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnchangedSections}
                  onChange={(e) => setShowUnchangedSections(e.target.checked)}
                  className="accent-[#005a94]"
                />
                <span>Show unchanged sections</span>
              </label>
            </div>
            {visibleSections.length === 0 ? (
              <div className="p-3 text-[11px] text-slate-500">
                All 7 narrative sections are identical between base and target.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {visibleSections.map((sec) => (
                  <div key={sec.sectionId} className="p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{sec.title}</span>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-slate-600">
                        {sec.statusChanged ? (
                          <span className="text-amber-800 font-semibold">
                            Status: {sec.reviewStatusBefore} → {sec.reviewStatusAfter}
                            {sec.contentStateBefore !== sec.contentStateAfter
                              ? ` (${sec.contentStateBefore ?? 'none'} → ${sec.contentStateAfter ?? 'none'})`
                              : ''}
                          </span>
                        ) : (
                          <span>Status unchanged ({sec.reviewStatusAfter})</span>
                        )}
                        {(sec.isEditedBefore || sec.isEditedAfter) && (
                          <span>
                            · Manual Edit: {sec.isEditedBefore ? 'Yes' : 'No'} →{' '}
                            {sec.isEditedAfter ? 'Yes' : 'No'}
                          </span>
                        )}
                      </div>
                    </div>

                    {sec.textChanged && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        <div className="border border-rose-200 bg-rose-50/40 rounded-xs p-2 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-800">
                            Removed / Base Lines ({sec.removedLines.length})
                          </div>
                          {sec.removedLines.length === 0 ? (
                            <p className="text-slate-500 italic">No lines removed.</p>
                          ) : (
                            <ul className="space-y-0.5 font-mono text-rose-950 whitespace-pre-wrap break-words">
                              {sec.removedLines.slice(0, 12).map((line, idx) => (
                                <li key={`${sec.sectionId}-rem-${idx}`}>- {line}</li>
                              ))}
                              {sec.removedLines.length > 12 && (
                                <li className="italic text-rose-700">
                                  ... +{sec.removedLines.length - 12} more line(s)
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                        <div className="border border-emerald-200 bg-emerald-50/40 rounded-xs p-2 space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                            Added / Target Lines ({sec.addedLines.length})
                          </div>
                          {sec.addedLines.length === 0 ? (
                            <p className="text-slate-500 italic">No new lines added.</p>
                          ) : (
                            <ul className="space-y-0.5 font-mono text-emerald-950 whitespace-pre-wrap break-words">
                              {sec.addedLines.slice(0, 12).map((line, idx) => (
                                <li key={`${sec.sectionId}-add-${idx}`}>+ {line}</li>
                              ))}
                              {sec.addedLines.length > 12 && (
                                <li className="italic text-emerald-800">
                                  ... +{sec.addedLines.length - 12} more line(s)
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                    {sec.subsectionChanges.length > 0 && (
                      <div className="text-[11px] bg-slate-50 border border-slate-200 rounded-xs px-2.5 py-1.5 space-y-0.5">
                        <div className="font-semibold text-slate-700">
                          Stage 4 Subsection Updates:
                        </div>
                        {sec.subsectionChanges.map((sub) => (
                          <div key={sub.subsectionId} className="font-mono text-slate-700">
                            · {sub.title}: state {sub.stateBefore} → {sub.stateAfter}
                            {sub.bodyChanged ? ' (narrative text modified)' : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Scientific Observations Diff */}
          {report.observationDiff.hasAnyChange && (
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-700">
                3. Added, Removed &amp; Modified Scientific Observations
              </div>
              <div className="p-3 space-y-2 text-[11px]">
                {[
                  ...report.observationDiff.intensityChanges,
                  ...report.observationDiff.tsunamiAndAdvisoryChanges,
                ].map((ch) => (
                  <div
                    key={ch.field}
                    className="grid grid-cols-1 md:grid-cols-[200px_1fr_1fr] gap-2 border-b border-slate-100 pb-1.5"
                  >
                    <span className="font-semibold text-slate-800">{ch.label}</span>
                    <span className="font-mono text-rose-800 break-words">{ch.before}</span>
                    <span className="font-mono text-emerald-900 break-words">{ch.after}</span>
                  </div>
                ))}
                {report.observationDiff.seaLevelObservationsAdded.map((item) => (
                  <div key={`sl-add-${item}`} className="font-mono text-emerald-900">
                    + Sea-Level Observation Added: {item}
                  </div>
                ))}
                {report.observationDiff.seaLevelObservationsRemoved.map((item) => (
                  <div key={`sl-rem-${item}`} className="font-mono text-rose-800">
                    - Sea-Level Observation Removed: {item}
                  </div>
                ))}
                {report.observationDiff.seaLevelObservationsModified.map((item) => (
                  <div key={`sl-mod-${item}`} className="font-mono text-amber-900">
                    ~ Sea-Level Observation Modified: {item}
                  </div>
                ))}
                {report.observationDiff.hazardObservationsAdded.map((item) => (
                  <div key={`hz-add-${item}`} className="font-mono text-emerald-900">
                    + Hazard Observation Added: {item}
                  </div>
                ))}
                {report.observationDiff.hazardObservationsRemoved.map((item) => (
                  <div key={`hz-rem-${item}`} className="font-mono text-rose-800">
                    - Hazard Observation Removed: {item}
                  </div>
                ))}
                {report.observationDiff.hazardObservationsModified.map((item) => (
                  <div key={`hz-mod-${item}`} className="font-mono text-amber-900">
                    ~ Hazard Observation Modified: {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Aftershock Statistics Diff */}
          {report.aftershockDiff.hasAnyChange && (
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-700">
                4. Aftershock Sequence &amp; Historical Statistics Changes
              </div>
              {report.aftershockDiff.metricChanges.length === 0 ? (
                <div className="p-3 text-[11px] text-slate-700">
                  Stage 3 package presence changed:{' '}
                  {report.aftershockDiff.wasPresentBefore ? 'Attached' : 'Not attached'} →{' '}
                  {report.aftershockDiff.wasPresentAfter ? 'Attached' : 'Not attached'}.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-[11px]">
                  <tbody className="divide-y divide-slate-200">
                    {report.aftershockDiff.metricChanges.map((ch) => (
                      <tr key={ch.field}>
                        <td className="py-1.5 px-2.5 font-semibold text-slate-800 w-1/4">
                          {ch.label}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-rose-800 w-[37.5%]">
                          {ch.before}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-emerald-900 w-[37.5%]">
                          {ch.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* 5. Maps & Figures Diff */}
          {report.figureDiffs.some((f) => f.changed) && (
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-700">
                5. Updated Maps &amp; Figures
              </div>
              <div className="p-3 space-y-2 text-[11px]">
                {report.figureDiffs
                  .filter((f) => f.changed)
                  .map((fig) => (
                    <div
                      key={fig.figureKey}
                      className="border border-slate-200 rounded-xs p-2 bg-slate-50/40 space-y-1"
                    >
                      <div className="font-semibold text-slate-900">
                        {fig.label}{' '}
                        {fig.svgChanged && (
                          <span className="font-mono text-[10px] text-[#005a94]">
                            (Vector SVG graphic updated)
                          </span>
                        )}
                      </div>
                      {fig.details.map((d) => (
                        <div key={`${fig.figureKey}-${d.field}`} className="font-mono text-slate-700">
                          · {d.label}: <span className="text-rose-800">{d.before}</span> →{' '}
                          <span className="text-emerald-900">{d.after}</span>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 6. Citations & Source Versions Diff */}
          {report.citationDiff.hasAnyChange && (
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-700">
                6. Citations &amp; Source Versions
              </div>
              <div className="p-3 space-y-1.5 text-[11px] font-mono">
                {report.citationDiff.sourceMetadataChanges.map((ch) => (
                  <div key={ch.field} className="text-slate-700">
                    · <strong>{ch.label}:</strong>{' '}
                    <span className="text-rose-800">{ch.before}</span> →{' '}
                    <span className="text-emerald-900">{ch.after}</span>
                  </div>
                ))}
                {report.citationDiff.addedCitations.map((c) => (
                  <div key={`cit-add-${c}`} className="text-emerald-900">
                    + Citation Added: {c}
                  </div>
                ))}
                {report.citationDiff.removedCitations.map((c) => (
                  <div key={`cit-rem-${c}`} className="text-rose-800">
                    - Citation Removed: {c}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. Presentation Config Diff */}
          {report.presentationDiff.hasAnyChange && (
            <div className="border border-slate-200 rounded-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 font-bold uppercase tracking-wider text-[10.5px] text-slate-700">
                7. Document Presentation Configuration
              </div>
              <div className="p-3 space-y-1 text-[11px] font-mono text-slate-700">
                {report.presentationDiff.headingStyleChanged && (
                  <div>
                    · Heading Style: {report.presentationDiff.headingStyleBefore} →{' '}
                    {report.presentationDiff.headingStyleAfter}
                  </div>
                )}
                {report.presentationDiff.orderChanged && (
                  <div>
                    · Section Ordering Changed:{' '}
                    {report.presentationDiff.orderAfter.join(' > ')}
                  </div>
                )}
                {report.presentationDiff.hiddenSlotsAdded.length > 0 && (
                  <div>
                    · Newly Hidden Optional Slots:{' '}
                    {report.presentationDiff.hiddenSlotsAdded.join(', ')}
                  </div>
                )}
                {report.presentationDiff.hiddenSlotsRemoved.length > 0 && (
                  <div>
                    · Restored Optional Slots:{' '}
                    {report.presentationDiff.hiddenSlotsRemoved.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
