import React, { useState } from 'react';
import { Compass, ExternalLink, Loader2, MapPin, Navigation, Search } from 'lucide-react';
import { EQPEvent, isEventUnlocated } from '../data/eqpData';
import { MarkdownContent } from './MarkdownContent';

export interface MapsGroundingLink {
  title: string;
  uri: string;
  placeId?: string;
  snippets: string[];
}

interface MapsGroundingPanelProps {
  event: EQPEvent;
  embedded?: boolean;
}

const PRESET_QUERIES = [
  {
    label: 'Hospitals & Evacuation Sites',
    prompt:
      'Find the nearest major hospitals, trauma centers, and municipal disaster response / evacuation centers near this epicenter.',
  },
  {
    label: 'Coastal Ports & Tsunami Exposure',
    prompt:
      'Identify coastal municipalities, seaports, bridges, and low-lying shoreline settlements closest to these coordinates.',
  },
  {
    label: 'Airports & Access Highways',
    prompt:
      'Locate the nearest regional airports and primary national highways that emergency response teams would use to reach the epicentral area.',
  },
  {
    label: 'Geographic Landmarks & Terrain',
    prompt:
      'Describe the immediate geography, nearest provincial capitals, bays/islands, and terrain features around this coordinate.',
  },
];

export const MapsGroundingPanel: React.FC<MapsGroundingPanelProps> = ({
  event,
  embedded = false,
}) => {
  const [query, setQuery] = useState(PRESET_QUERIES[0].prompt);
  const [anchorMode, setAnchorMode] = useState<'epicenter' | 'browser'>('epicenter');
  const [browserCoords, setBrowserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string>('');
  const [links, setLinks] = useState<MapsGroundingLink[]>([]);
  const [lastAnchorLabel, setLastAnchorLabel] = useState<string>('');

  const unlocated = isEventUnlocated(event);

  const runGroundingQuery = async (promptText: string, overrideCoords?: { lat: number; lon: number }) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    if (!overrideCoords && !(anchorMode === 'browser' && browserCoords) && unlocated) {
      setError('Hypocenter is not located yet. Locate the event or enable My GPS first.');
      return;
    }

    setLoading(true);
    setError(null);

    const coords =
      overrideCoords ??
      (anchorMode === 'browser' && browserCoords
        ? browserCoords
        : { lat: event.lat, lon: event.lon });

    const mag =
      event.preferredScale === 'Ms'
        ? event.ms
        : event.preferredScale === 'Mb'
          ? event.mb
          : event.md;

    const eventSummary = unlocated
      ? `${event.filename} · ${event.originDateGmt} ${event.originTimeGmt} UTC · Epicenter pending`
      : `${event.filename} · ${event.originDateGmt} ${event.originTimeGmt} UTC · Epicenter ${event.lat.toFixed(3)}°N, ${event.lon.toFixed(3)}°E · Depth ${event.depthKm.toFixed(1)} km · ${event.preferredScale} ${mag.toFixed(1)} · ${event.centralOfficeBearing}`;

    try {
      const response = await fetch('/api/gemini/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          latitude: coords.lat,
          longitude: coords.lon,
          eventSummary,
        }),
      });

      const data = (await response.json()) as {
        text?: string;
        links?: MapsGroundingLink[];
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        throw new Error(data.error || `Maps Grounding failed (${response.status})`);
      }

      setResultText(data.text ?? '');
      setLinks(Array.isArray(data.links) ? data.links : []);
      setLastAnchorLabel(
        `${coords.lat.toFixed(3)}°N, ${coords.lon.toFixed(3)}°E (${
          anchorMode === 'browser' && browserCoords ? 'Device GPS' : 'Epicenter'
        })`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch Maps Grounding data.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableBrowserLocation = () => {
    if (!navigator.geolocation) {
      setError('Browser geolocation is unavailable in this environment.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setBrowserCoords(next);
        setAnchorMode('browser');
        setError(null);
      },
      () => {
        setError('Location permission denied — staying anchored to event epicenter coordinates.');
        setAnchorMode('epicenter');
      }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runGroundingQuery(query);
  };

  return (
    <section
      className={
        embedded
          ? 'bg-white'
          : 'bg-[#eef7f2] border border-emerald-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]'
      }
    >
      <div
        className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
          embedded
            ? 'border-b border-slate-200'
            : 'bg-[#dff0e7] border-b border-emerald-800/60'
        }`}
      >
        <div>
          <h3
            className={
              embedded
                ? 'text-sm font-semibold text-slate-900'
                : 'text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]'
            }
          >
            Google Maps Grounding &amp; Field Context
          </h3>
          <p className={`text-xs ${embedded ? 'text-slate-500' : 'text-slate-600'}`}>
            Powered by <span className="font-mono">gemini-4-hydrogen</span> with Google Maps retrieval
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setAnchorMode('epicenter')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition-colors ${
              anchorMode === 'epicenter'
                ? 'bg-blue-50 text-blue-800 border-blue-400'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            {unlocated
              ? 'Epicenter (Pending)'
              : `Epicenter (${event.lat.toFixed(2)}°, ${event.lon.toFixed(2)}°)`}
          </button>
          <button
            type="button"
            onClick={handleEnableBrowserLocation}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border font-medium transition-colors ${
              anchorMode === 'browser' && browserCoords
                ? 'bg-blue-50 text-blue-800 border-blue-400'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            My GPS
          </button>
        </div>
      </div>

      <div className={`p-4 space-y-3 ${embedded ? '' : 'bg-[#f4faf6]'}`}>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_QUERIES.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={loading}
              onClick={() => {
                setQuery(preset.prompt);
                void runGroundingQuery(preset.prompt);
              }}
              className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors disabled:opacity-50 ${
                embedded
                  ? 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                  : 'border-emerald-800/50 bg-[#d8ede2] hover:bg-[#c5e4d4] text-slate-800'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask Google Maps about nearby hospitals, ports, faults, towns..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
            Query Maps
          </button>
        </form>

        {error && (
          <div className="px-3 py-2 rounded-md bg-rose-100/80 border border-rose-700/60 text-xs text-rose-900">
            {error}
          </div>
        )}

        {resultText && (
          <div className="space-y-3 pt-1">
            {lastAnchorLabel && (
              <div className="text-[11px] font-mono text-slate-600">
                Anchored at {lastAnchorLabel}
              </div>
            )}
            <div
              className={`p-3 rounded-md border ${
                embedded
                  ? 'bg-slate-50 border-slate-200'
                  : 'bg-[#d8ede2] border-emerald-800/60'
              }`}
            >
              <MarkdownContent content={resultText} />
            </div>

            {links.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Google Maps Grounded Sources ({links.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {links.map((link) => (
                    <a
                      key={link.uri}
                      href={link.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-start justify-between gap-2 p-2.5 rounded-md border transition-colors group ${
                        embedded
                          ? 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                          : 'border-emerald-800/55 bg-[#e2f2e9] hover:border-emerald-900 hover:bg-[#cfe8db]'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-medium text-blue-700 group-hover:text-blue-900 truncate">
                          {link.title}
                        </div>
                        {link.snippets.length > 0 && (
                          <p className="text-[11px] text-slate-600 line-clamp-2">
                            {link.snippets[0]}
                          </p>
                        )}
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-700 shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
