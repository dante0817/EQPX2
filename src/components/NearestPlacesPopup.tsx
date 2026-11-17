import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { PlaceCandidate } from '../data/eqpData';
import type { MainOfficeLocation } from '../utils/nearestPlaces';

interface NearestPlacesPopupProps {
  isOpen: boolean;
  mainOffice?: MainOfficeLocation;
  centralOfficeBearing?: string;
  cities: PlaceCandidate[];
  selectedCityId: string;
  towns: PlaceCandidate[];
  selectedTownId: string;
  generators: PlaceCandidate[];
  selectedGeneratorId: string;
  onSelectCity: (id: string) => void;
  onClearCity: () => void;
  onSelectTown: (id: string) => void;
  onClearTown: () => void;
  onSelectGenerator: (id: string) => void;
  onConfigureMainOffice?: () => void;
  onEditDatabases?: () => void;
  onClose: () => void;
}

export const NearestPlacesPopup: React.FC<NearestPlacesPopupProps> = ({
  isOpen,
  mainOffice,
  centralOfficeBearing,
  cities,
  selectedCityId,
  towns,
  selectedTownId,
  generators,
  selectedGeneratorId,
  onSelectCity,
  onClearCity,
  onSelectTown,
  onClearTown,
  onSelectGenerator,
  onConfigureMainOffice,
  onEditDatabases,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nearest-places-popup-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] max-h-[92vh] flex flex-col bg-[#fed3a8] border-2 border-[#2596be] shadow-2xl text-slate-900 select-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Classic EQP Desktop Title Bar */}
        <div className="bg-white border-b border-slate-300 px-2.5 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <h2
            id="nearest-places-popup-title"
            className="text-[12px] font-normal tracking-tight text-slate-700"
          >
            Nearest Places :
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Nearest Places dialog"
            title="Close Nearest Places"
            className="w-6 h-5 flex items-center justify-center bg-slate-100 hover:bg-rose-500 text-slate-600 hover:text-white border border-slate-300/70 rounded-xs transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrollable Card Body with Distinct Mild Colors per Section */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2 bg-[#f6f1ea] text-[12px] leading-snug">
          {/* Main Office Reference (QVP) */}
          <section className="rounded-md border border-[#bfd7f2] bg-[#eef6ff] px-3 py-2 shadow-2xs">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <h3 className="text-[12px] font-semibold text-sky-950">
                Main Office Reference ({mainOffice?.code || 'QVP'}) :
              </h3>
              {onConfigureMainOffice && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onConfigureMainOffice();
                  }}
                  className="px-2 py-0.5 bg-white hover:bg-[#eef6ff] border border-slate-400/90 hover:border-[#0078d7] rounded-[3px] text-[11px] font-normal text-[#0055cc] shadow-2xs whitespace-nowrap cursor-pointer transition-colors"
                >
                  Edit {mainOffice?.code || 'QVP'} in Settings...
                </button>
              )}
            </div>
            <div className="font-mono tabular-nums text-[12px] font-semibold text-slate-900">
              {centralOfficeBearing || 'Pending hypocenter location'}
            </div>
            {mainOffice && (
              <div className="text-[11px] font-mono tabular-nums text-slate-700/90 mt-0.5">
                {mainOffice.code} · {mainOffice.lat.toFixed(4)}° N, {mainOffice.lon.toFixed(4)}° E ({mainOffice.name})
              </div>
            )}
          </section>

          {/* Nearest City */}
          <section className="rounded-md border border-[#bde2ce] bg-[#edf8f2] px-3 py-2 shadow-2xs">
            <h3 className="text-[12px] font-semibold text-emerald-950 mb-1">Nearest City :</h3>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-0.5">
                {cities.length === 0 ? (
                  <p className="text-[11px] text-slate-700/80 py-1">No city candidates available.</p>
                ) : (
                  cities.map((city) => (
                    <label
                      key={city.id}
                      title={city.label}
                      className="flex items-center gap-1.5 cursor-pointer py-[1px] hover:bg-white/65 rounded-xs px-0.5 transition-colors"
                    >
                      <input
                        type="radio"
                        name="popupNearestCity"
                        checked={selectedCityId === city.id}
                        onChange={() => onSelectCity(city.id)}
                        className="h-3.5 w-3.5 accent-[#0066cc] shrink-0 cursor-pointer"
                      />
                      <span className="text-slate-900 truncate tabular-nums">{city.label}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="shrink-0 pl-1">
                <button
                  type="button"
                  onClick={onClearCity}
                  className="px-2.5 py-1 bg-white hover:bg-[#eef6ff] border border-[#0078d7] rounded-[3px] text-[12px] font-normal text-[#0055cc] shadow-2xs whitespace-nowrap cursor-pointer transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </section>

          {/* Nearest Town */}
          <section className="rounded-md border border-[#edd5a3] bg-[#fff7e6] px-3 py-2 shadow-2xs">
            <h3 className="text-[12px] font-semibold text-amber-950 mb-1">Nearest Town :</h3>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-0.5">
                {towns.length === 0 ? (
                  <p className="text-[11px] text-slate-700/80 py-1">No town candidates available.</p>
                ) : (
                  towns.map((town) => (
                    <label
                      key={town.id}
                      title={town.label}
                      className="flex items-center gap-1.5 cursor-pointer py-[1px] hover:bg-white/65 rounded-xs px-0.5 transition-colors"
                    >
                      <input
                        type="radio"
                        name="popupNearestTown"
                        checked={selectedTownId === town.id}
                        onChange={() => onSelectTown(town.id)}
                        className="h-3.5 w-3.5 accent-[#0066cc] shrink-0 cursor-pointer"
                      />
                      <span className="text-slate-900 truncate tabular-nums">{town.label}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="shrink-0 pl-1">
                <button
                  type="button"
                  onClick={onClearTown}
                  className="px-2.5 py-1 bg-white hover:bg-[#eef6ff] border border-slate-400/90 hover:border-[#0078d7] rounded-[3px] text-[12px] font-normal text-[#0055cc] shadow-2xs whitespace-nowrap cursor-pointer transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </section>

          {/* Nearest Generator */}
          <section className="rounded-md border border-[#ecc6cc] bg-[#fdf0f2] px-3 py-2 shadow-2xs">
            <h3 className="text-[12px] font-semibold text-rose-950 mb-1">Nearest Generator :</h3>
            <div className="space-y-0.5">
              {generators.length === 0 ? (
                <p className="text-[11px] text-slate-700/80 py-1">
                  No fault generator candidates available.
                </p>
              ) : (
                generators.map((gen) => (
                  <label
                    key={gen.id}
                    title={gen.label}
                    className="flex items-center gap-1.5 cursor-pointer py-[1px] hover:bg-white/65 rounded-xs px-0.5 transition-colors"
                  >
                    <input
                      type="radio"
                      name="popupNearestGenerator"
                      checked={selectedGeneratorId === gen.id}
                      onChange={() => onSelectGenerator(gen.id)}
                      className="h-3.5 w-3.5 accent-[#0066cc] shrink-0 cursor-pointer"
                    />
                    <span className="text-slate-900 truncate tabular-nums">{gen.label}</span>
                  </label>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Bottom Action Strip */}
        <div className="bg-[#f8c694] border-t border-[#dba774] px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] shrink-0">
          <span className="text-slate-800/80 truncate">
            CITY.csv · Population_Centers_2007 · GENTR.txt
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {onEditDatabases && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditDatabases();
                }}
                className="px-2.5 py-0.5 bg-white hover:bg-[#eef6ff] border border-slate-400/90 hover:border-[#0078d7] rounded-[3px] text-[11px] font-normal text-slate-800 shadow-2xs cursor-pointer transition-colors"
              >
                Edit Databases...
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-0.5 bg-white hover:bg-[#eef6ff] border border-[#0078d7] rounded-[3px] text-[12px] font-normal text-[#0055cc] shadow-2xs cursor-pointer transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
