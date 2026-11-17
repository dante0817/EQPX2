import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Download,
  Edit3,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  type CityPlaceRecord,
  formatCityCsvText,
  formatCoordFlexible,
  formatGentrText,
  formatPopulationCentersText,
  type GeneratorTraceRecord,
  isValidPhCoordinate,
  type NearestPlacesCatalog,
  type TownPlaceRecord,
} from '../utils/nearestPlaces';

export type PlacesDatasetKind = 'cities' | 'towns' | 'generators';

interface PlacesDatabasePanelProps {
  catalog: NearestPlacesCatalog | null;
  updatedAt: string | null;
  onSaveItems: (
    kind: PlacesDatasetKind,
    items: CityPlaceRecord[] | TownPlaceRecord[] | GeneratorTraceRecord[],
    message: string
  ) => Promise<void>;
  onImportRawText: (
    kind: PlacesDatasetKind,
    rawText: string,
    mode: 'merge' | 'replace',
    sourceName: string
  ) => Promise<void>;
  onResetKind: (kind: PlacesDatasetKind) => Promise<void>;
}

const PAGE_SIZE = 40;

export const PlacesDatabasePanel: React.FC<PlacesDatabasePanelProps> = ({
  catalog,
  updatedAt,
  onSaveItems,
  onImportRawText,
  onResetKind,
}) => {
  const [activeTab, setActiveTab] = useState<PlacesDatasetKind>('cities');
  const [searchQuery, setSearchQuery] = useState('');
  const [townPage, setTownPage] = useState(0);
  const [cityPage, setCityPage] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Add forms
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCity, setNewCity] = useState({ name: '', lat: '', lon: '' });
  const [newTown, setNewTown] = useState({
    name: '',
    province: '',
    population: '',
    lat: '',
    lon: '',
  });
  const [newGen, setNewGen] = useState({ name: '', lat: '', lon: '' });

  // Inline editing state
  const [editingCityIdx, setEditingCityIdx] = useState<number | null>(null);
  const [cityDraft, setCityDraft] = useState({ name: '', lat: '', lon: '' });

  const [editingTownIdx, setEditingTownIdx] = useState<number | null>(null);
  const [townDraft, setTownDraft] = useState({
    name: '',
    province: '',
    population: '',
    lat: '',
    lon: '',
  });

  // Generator vertex editor state
  const [selectedGenIdx, setSelectedGenIdx] = useState<number>(0);
  const [renamingGenIdx, setRenamingGenIdx] = useState<number | null>(null);
  const [genNameDraft, setGenNameDraft] = useState('');
  const [newVertex, setNewVertex] = useState({ lat: '', lon: '' });
  const [editingVertexIdx, setEditingVertexIdx] = useState<number | null>(null);
  const [vertexDraft, setVertexDraft] = useState({ lat: '', lon: '' });

  // Raw editor modal
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [rawEditorText, setRawEditorText] = useState('');
  const [rawEditorMode, setRawEditorMode] = useState<'merge' | 'replace'>('replace');

  const cities = catalog?.cities ?? [];
  const towns = catalog?.towns ?? [];
  const generators = catalog?.generators ?? [];

  const filteredCities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cities
      .map((city, idx) => ({ city, idx }))
      .filter(({ city }) => !q || city.name.toLowerCase().includes(q));
  }, [cities, searchQuery]);

  const filteredTowns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return towns
      .map((town, idx) => ({ town, idx }))
      .filter(
        ({ town }) =>
          !q ||
          town.name.toLowerCase().includes(q) ||
          town.province.toLowerCase().includes(q)
      );
  }, [towns, searchQuery]);

  const filteredGenerators = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return generators
      .map((gen, idx) => ({ gen, idx }))
      .filter(({ gen }) => !q || gen.name.toLowerCase().includes(q));
  }, [generators, searchQuery]);

  const safeSelectedGenIdx =
    selectedGenIdx >= 0 && selectedGenIdx < generators.length ? selectedGenIdx : 0;
  const activeGenerator = generators[safeSelectedGenIdx] ?? null;

  const cityTotalPages = Math.max(1, Math.ceil(filteredCities.length / PAGE_SIZE));
  const safeCityPage = Math.min(cityPage, cityTotalPages - 1);
  const pagedCities = filteredCities.slice(
    safeCityPage * PAGE_SIZE,
    (safeCityPage + 1) * PAGE_SIZE
  );

  const townTotalPages = Math.max(1, Math.ceil(filteredTowns.length / PAGE_SIZE));
  const safeTownPage = Math.min(townPage, townTotalPages - 1);
  const pagedTowns = filteredTowns.slice(
    safeTownPage * PAGE_SIZE,
    (safeTownPage + 1) * PAGE_SIZE
  );

  const totalVertices = useMemo(
    () => generators.reduce((sum, g) => sum + g.points.length, 0),
    [generators]
  );

  const handleTabSwitch = (nextTab: PlacesDatasetKind) => {
    setActiveTab(nextTab);
    setSearchQuery('');
    setShowAddForm(false);
    setEditingCityIdx(null);
    setEditingTownIdx(null);
    setRenamingGenIdx(null);
    setEditingVertexIdx(null);
    setErrorMsg(null);
  };

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportActive = () => {
    if (!catalog) return;
    if (activeTab === 'cities') {
      triggerDownload(formatCityCsvText(cities), 'CITY.csv', 'text/csv;charset=utf-8');
    } else if (activeTab === 'towns') {
      triggerDownload(
        formatPopulationCentersText(towns),
        'Population_Centers_2007.txt',
        'text/plain;charset=utf-8'
      );
    } else {
      triggerDownload(formatGentrText(generators), 'GENTR.txt', 'text/plain;charset=utf-8');
    }
  };

  const handleOpenRawEditor = () => {
    setErrorMsg(null);
    if (activeTab === 'cities') {
      setRawEditorText(formatCityCsvText(cities));
    } else if (activeTab === 'towns') {
      setRawEditorText(formatPopulationCentersText(towns));
    } else {
      setRawEditorText(formatGentrText(generators));
    }
    setRawEditorMode('replace');
    setShowRawEditor(true);
  };

  const handleApplyRawEditor = async () => {
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onImportRawText(activeTab, rawEditorText, rawEditorMode, 'Raw Editor');
      setShowRawEditor(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to apply raw text.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const buf = await file.arrayBuffer();
      const rawText =
        activeTab === 'cities'
          ? new TextDecoder('iso-8859-1').decode(buf)
          : new TextDecoder('utf-8').decode(buf);
      await onImportRawText(activeTab, rawText, importMode, file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : `Failed to import ${file.name}.`);
    } finally {
      setIsSaving(false);
    }
  };

  // City CRUD
  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const name = newCity.name.trim();
    const lat = Number.parseFloat(newCity.lat);
    const lon = Number.parseFloat(newCity.lon);
    if (!name || !isValidPhCoordinate(lat, lon)) {
      setErrorMsg('Enter a valid city name and Philippine coordinates (Lat 3–23, Lon 112–130).');
      return;
    }
    setIsSaving(true);
    try {
      const updated = [...cities, { name, lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) }].sort(
        (a, b) => a.name.localeCompare(b.name)
      );
      await onSaveItems('cities', updated, `Added city "${name}" to CITY catalog`);
      setNewCity({ name: '', lat: '', lon: '' });
      setShowAddForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save city.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCityEdit = async (idx: number) => {
    setErrorMsg(null);
    const name = cityDraft.name.trim();
    const lat = Number.parseFloat(cityDraft.lat);
    const lon = Number.parseFloat(cityDraft.lon);
    if (!name || !isValidPhCoordinate(lat, lon)) {
      setErrorMsg('City requires a name and valid coordinates (Lat 3–23, Lon 112–130).');
      return;
    }
    setIsSaving(true);
    try {
      const updated = cities.map((c, i) =>
        i === idx ? { name, lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) } : c
      );
      await onSaveItems('cities', updated, `Updated city "${name}"`);
      setEditingCityIdx(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update city.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCity = async (idx: number) => {
    const target = cities[idx];
    if (!target) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const updated = cities.filter((_, i) => i !== idx);
      await onSaveItems('cities', updated, `Removed city "${target.name}"`);
      setEditingCityIdx(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete city.');
    } finally {
      setIsSaving(false);
    }
  };

  // Town CRUD
  const handleAddTown = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const name = newTown.name.trim();
    const province = newTown.province.trim();
    const lat = Number.parseFloat(newTown.lat);
    const lon = Number.parseFloat(newTown.lon);
    const pop = newTown.population.trim() ? Number.parseInt(newTown.population, 10) : undefined;
    if (!name || !province || !isValidPhCoordinate(lat, lon)) {
      setErrorMsg('Enter town name, province, and valid coordinates (Lat 3–23, Lon 112–130).');
      return;
    }
    setIsSaving(true);
    try {
      const nextItem: TownPlaceRecord = {
        name,
        province,
        ...(Number.isFinite(pop) ? { population: pop } : {}),
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
      };
      const updated = [...towns, nextItem];
      await onSaveItems('towns', updated, `Added town "${name} (${province})"`);
      setNewTown({ name: '', province: '', population: '', lat: '', lon: '' });
      setShowAddForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add town.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTownEdit = async (idx: number) => {
    setErrorMsg(null);
    const name = townDraft.name.trim();
    const province = townDraft.province.trim();
    const lat = Number.parseFloat(townDraft.lat);
    const lon = Number.parseFloat(townDraft.lon);
    const pop = townDraft.population.trim() ? Number.parseInt(townDraft.population, 10) : undefined;
    if (!name || !province || !isValidPhCoordinate(lat, lon)) {
      setErrorMsg('Town requires name, province, and valid coordinates (Lat 3–23, Lon 112–130).');
      return;
    }
    setIsSaving(true);
    try {
      const updated = towns.map((t, i) =>
        i === idx
          ? {
              name,
              province,
              ...(Number.isFinite(pop) ? { population: pop } : {}),
              lat: Number(lat.toFixed(6)),
              lon: Number(lon.toFixed(6)),
            }
          : t
      );
      await onSaveItems('towns', updated, `Updated town "${name} (${province})"`);
      setEditingTownIdx(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update town.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTown = async (idx: number) => {
    const target = towns[idx];
    if (!target) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const updated = towns.filter((_, i) => i !== idx);
      await onSaveItems('towns', updated, `Removed town "${target.name} (${target.province})"`);
      setEditingTownIdx(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete town.');
    } finally {
      setIsSaving(false);
    }
  };

  // Generator CRUD
  const handleAddGenerator = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const name = newGen.name.trim().toUpperCase();
    const lat = Number.parseFloat(newGen.lat);
    const lon = Number.parseFloat(newGen.lon);
    if (!name || !isValidPhCoordinate(lat, lon)) {
      setErrorMsg('Enter generator name and valid initial vertex (Lat 3–23, Lon 112–130).');
      return;
    }
    setIsSaving(true);
    try {
      const updated = [
        ...generators,
        { name, points: [[Number(lat.toFixed(4)), Number(lon.toFixed(4))]] as Array<[number, number]> },
      ].sort((a, b) => a.name.localeCompare(b.name));
      const newIdx = updated.findIndex((g) => g.name === name);
      await onSaveItems('generators', updated, `Added fault generator "${name}"`);
      setNewGen({ name: '', lat: '', lon: '' });
      setShowAddForm(false);
      if (newIdx >= 0) setSelectedGenIdx(newIdx);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add generator.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRenameGenerator = async (idx: number) => {
    const nextName = genNameDraft.trim().toUpperCase();
    if (!nextName) {
      setErrorMsg('Generator name cannot be empty.');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const updated = generators.map((g, i) => (i === idx ? { ...g, name: nextName } : g));
      await onSaveItems('generators', updated, `Renamed fault generator to "${nextName}"`);
      setRenamingGenIdx(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to rename generator.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGenerator = async (idx: number) => {
    const target = generators[idx];
    if (!target) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const updated = generators.filter((_, i) => i !== idx);
      await onSaveItems('generators', updated, `Removed fault generator "${target.name}"`);
      setSelectedGenIdx(Math.max(0, idx - 1));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete generator.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddVertex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGenerator) return;
    setErrorMsg(null);
    const lat = Number.parseFloat(newVertex.lat);
    const lon = Number.parseFloat(newVertex.lon);
    if (!isValidPhCoordinate(lat, lon)) {
      setErrorMsg('Enter valid Philippine vertex coordinates (Lat 3–23, Lon 112–130).');
      return;
    }
    setIsSaving(true);
    try {
      const updated = generators.map((g, i) =>
        i === safeSelectedGenIdx
          ? {
              ...g,
              points: [
                ...g.points,
                [Number(lat.toFixed(4)), Number(lon.toFixed(4))] as [number, number],
              ],
            }
          : g
      );
      await onSaveItems(
        'generators',
        updated,
        `Added vertex to "${activeGenerator.name}"`
      );
      setNewVertex({ lat: '', lon: '' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add vertex.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveVertexEdit = async (vIdx: number) => {
    if (!activeGenerator) return;
    setErrorMsg(null);
    const lat = Number.parseFloat(vertexDraft.lat);
    const lon = Number.parseFloat(vertexDraft.lon);
    if (!isValidPhCoordinate(lat, lon)) {
      setErrorMsg('Enter valid Philippine vertex coordinates (Lat 3–23, Lon 112–130).');
      return;
    }
    setIsSaving(true);
    try {
      const updated = generators.map((g, i) =>
        i === safeSelectedGenIdx
          ? {
              ...g,
              points: g.points.map((pt, j) =>
                j === vIdx ? ([Number(lat.toFixed(4)), Number(lon.toFixed(4))] as [number, number]) : pt
              ),
            }
          : g
      );
      await onSaveItems(
        'generators',
        updated,
        `Updated vertex #${vIdx + 1} of "${activeGenerator.name}"`
      );
      setEditingVertexIdx(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update vertex.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVertex = async (vIdx: number) => {
    if (!activeGenerator) return;
    if (activeGenerator.points.length <= 1) {
      setErrorMsg('A generator must keep at least 1 coordinate point (or delete the generator).');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const updated = generators.map((g, i) =>
        i === safeSelectedGenIdx
          ? { ...g, points: g.points.filter((_, j) => j !== vIdx) }
          : g
      );
      await onSaveItems(
        'generators',
        updated,
        `Removed vertex #${vIdx + 1} from "${activeGenerator.name}"`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete vertex.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="bg-[#eef7f2] border border-emerald-700/60 rounded-lg overflow-hidden shadow-[0_3px_10px_-2px_rgba(15,23,42,0.12),0_1px_4px_-1px_rgba(15,23,42,0.07)]">
      {/* Header */}
      <div className="p-4 bg-[#dff0e7] border-b border-emerald-800/55 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-800" />
            <h2 className="text-base font-bold text-blue-700 [text-shadow:0_0_8px_rgba(249,115,22,0.7),0_0_18px_rgba(251,146,60,0.45)]">
              Nearest Places &amp; Fault Generator Databases
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            {cities.length} cities (CITY.csv) · {towns.length.toLocaleString()} towns (Population_Centers_2007) · {generators.length} fault generators ({totalVertices} vertices, GENTR.txt)
            {updatedAt && ` · Updated ${new Date(updatedAt).toLocaleDateString()}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleFileImport}
          />
          <select
            aria-label="Places import mode"
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
            className="px-2 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-700"
          >
            <option value="merge">Merge Import</option>
            <option value="replace">Replace Import</option>
          </select>
          <button
            type="button"
            disabled={isSaving || !catalog}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Import {activeTab === 'cities' ? '.CSV' : '.TXT'}
          </button>
          <button
            type="button"
            disabled={!catalog}
            onClick={handleOpenRawEditor}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Code2 className="w-3.5 h-3.5" />
            Edit Raw Text
          </button>
          <button
            type="button"
            disabled={!catalog}
            onClick={handleExportActive}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export {activeTab === 'cities' ? 'CITY.csv' : activeTab === 'towns' ? 'Pop_Centers.txt' : 'GENTR.txt'}
          </button>
          <button
            type="button"
            disabled={isSaving || !catalog}
            onClick={async () => {
              setIsSaving(true);
              try {
                await onResetKind(activeTab);
              } finally {
                setIsSaving(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Seed
          </button>
        </div>
      </div>

      {/* Dataset Tabs + Search + Add */}
      <div className="px-4 py-2.5 bg-[#d8ede2] border-b border-emerald-800/55 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'cities', label: `Cities (${cities.length})` },
              { id: 'towns', label: `Towns (${towns.length.toLocaleString()})` },
              { id: 'generators', label: `Fault Generators (${generators.length})` },
            ] as Array<{ id: PlacesDatasetKind; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabSwitch(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'cities'
                  ? 'Search city...'
                  : activeTab === 'towns'
                    ? 'Search town or province...'
                    : 'Search fault or trench...'
              }
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCityPage(0);
                setTownPage(0);
              }}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md w-52 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            disabled={!catalog}
            onClick={() => {
              setErrorMsg(null);
              setShowAddForm((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add {activeTab === 'cities' ? 'City' : activeTab === 'towns' ? 'Town' : 'Generator'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-600 hover:text-rose-900"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add Forms */}
      {showAddForm && activeTab === 'cities' && (
        <form
          onSubmit={handleAddCity}
          className="px-4 py-3 bg-[#dce9f8] border-b border-sky-800/55 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
        >
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-700 mb-1">City Name</label>
            <input
              type="text"
              placeholder="e.g. Antipolo City (Rizal)"
              value={newCity.name}
              onChange={(e) => setNewCity((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Latitude (°N)</label>
            <input
              type="number"
              step="any"
              placeholder="14.625"
              value={newCity.lat}
              onChange={(e) => setNewCity((p) => ({ ...p, lat: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Longitude (°E)</label>
              <input
                type="number"
                step="any"
                placeholder="121.124"
                value={newCity.lon}
                onChange={(e) => setNewCity((p) => ({ ...p, lon: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium rounded bg-slate-900 text-white hover:bg-slate-800"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {showAddForm && activeTab === 'towns' && (
        <form
          onSubmit={handleAddTown}
          className="px-4 py-3 bg-[#dce9f8] border-b border-sky-800/55 grid grid-cols-1 sm:grid-cols-6 gap-2 items-end"
        >
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Town Name</label>
            <input
              type="text"
              placeholder="e.g. Mayantoc"
              value={newTown.name}
              onChange={(e) => setNewTown((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Province</label>
            <input
              type="text"
              placeholder="e.g. Tarlac"
              value={newTown.province}
              onChange={(e) => setNewTown((p) => ({ ...p, province: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Population</label>
            <input
              type="number"
              placeholder="30000"
              value={newTown.population}
              onChange={(e) => setNewTown((p) => ({ ...p, population: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">Latitude (°N)</label>
            <input
              type="number"
              step="any"
              placeholder="15.620"
              value={newTown.lat}
              onChange={(e) => setNewTown((p) => ({ ...p, lat: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Longitude (°E)</label>
              <input
                type="number"
                step="any"
                placeholder="120.378"
                value={newTown.lon}
                onChange={(e) => setNewTown((p) => ({ ...p, lon: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium rounded bg-slate-900 text-white hover:bg-slate-800"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {showAddForm && activeTab === 'generators' && (
        <form
          onSubmit={handleAddGenerator}
          className="px-4 py-3 bg-[#dce9f8] border-b border-sky-800/55 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"
        >
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-700 mb-1">
              Fault / Trench Generator Name
            </label>
            <input
              type="text"
              placeholder="e.g. SAN JOSE FAULT SEGMENT"
              value={newGen.name}
              onChange={(e) => setNewGen((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-700 mb-1">First Vertex Lat (°N)</label>
            <input
              type="number"
              step="any"
              placeholder="14.50"
              value={newGen.lat}
              onChange={(e) => setNewGen((p) => ({ ...p, lat: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-slate-700 mb-1">First Vertex Lon (°E)</label>
              <input
                type="number"
                step="any"
                placeholder="121.05"
                value={newGen.lon}
                onChange={(e) => setNewGen((p) => ({ ...p, lon: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium rounded bg-slate-900 text-white hover:bg-slate-800"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* Body */}
      {!catalog ? (
        <div className="p-6 text-xs text-slate-500">Loading reference datasets...</div>
      ) : activeTab === 'cities' ? (
        <div>
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#d2e9dc] text-slate-800 sticky top-0 z-10 border-b border-emerald-800/55">
                <tr>
                  <th className="py-2 px-3 font-semibold">City Name</th>
                  <th className="py-2 px-3 font-semibold text-right">Latitude (°N)</th>
                  <th className="py-2 px-3 font-semibold text-right">Longitude (°E)</th>
                  <th className="py-2 px-3 font-semibold text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-800/20">
                {pagedCities.map(({ city, idx }, rowIdx) => {
                  const isEditing = editingCityIdx === idx;
                  return (
                    <tr
                      key={`${city.name}-${idx}`}
                      className={`transition-colors ${
                        rowIdx % 2 === 0
                          ? 'bg-[#f9fcfa] hover:bg-[#d3ebdd]'
                          : 'bg-[#e5f3eb] hover:bg-[#d3ebdd]'
                      }`}
                    >
                      <td className="py-1.5 px-3 font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={cityDraft.name}
                            onChange={(e) => setCityDraft((d) => ({ ...d, name: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          city.name
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            value={cityDraft.lat}
                            onChange={(e) => setCityDraft((d) => ({ ...d, lat: e.target.value }))}
                            className="w-24 px-2 py-1 text-xs font-mono text-right border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          formatCoordFlexible(city.lat, 3, 4)
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            value={cityDraft.lon}
                            onChange={(e) => setCityDraft((d) => ({ ...d, lon: e.target.value }))}
                            className="w-24 px-2 py-1 text-xs font-mono text-right border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          formatCoordFlexible(city.lon, 3, 4)
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveCityEdit(idx)}
                              title="Save changes"
                              className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCityIdx(null)}
                              title="Cancel"
                              className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCityIdx(idx);
                                setCityDraft({
                                  name: city.name,
                                  lat: String(city.lat),
                                  lon: String(city.lon),
                                });
                              }}
                              title="Edit city"
                              className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:border-blue-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleDeleteCity(idx)}
                              title="Delete city"
                              className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-rose-700 hover:border-rose-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cityTotalPages > 1 && (
            <div className="px-4 py-2 border-t border-emerald-800/45 bg-[#d8ede2] flex items-center justify-between text-xs text-slate-700">
              <span>
                Showing {safeCityPage * PAGE_SIZE + 1}–
                {Math.min((safeCityPage + 1) * PAGE_SIZE, filteredCities.length)} of{' '}
                {filteredCities.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safeCityPage === 0}
                  onClick={() => setCityPage((p) => Math.max(0, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
                >
                  Prev
                </button>
                <span>
                  Page {safeCityPage + 1} / {cityTotalPages}
                </span>
                <button
                  type="button"
                  disabled={safeCityPage >= cityTotalPages - 1}
                  onClick={() => setCityPage((p) => Math.min(cityTotalPages - 1, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'towns' ? (
        <div>
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#d2e9dc] text-slate-800 sticky top-0 z-10 border-b border-emerald-800/55">
                <tr>
                  <th className="py-2 px-3 font-semibold">Town / Municipality</th>
                  <th className="py-2 px-3 font-semibold">Province</th>
                  <th className="py-2 px-3 font-semibold text-right">Pop (2007)</th>
                  <th className="py-2 px-3 font-semibold text-right">Latitude (°N)</th>
                  <th className="py-2 px-3 font-semibold text-right">Longitude (°E)</th>
                  <th className="py-2 px-3 font-semibold text-right w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-800/20">
                {pagedTowns.map(({ town, idx }, rowIdx) => {
                  const isEditing = editingTownIdx === idx;
                  return (
                    <tr
                      key={`${town.name}-${town.province}-${idx}`}
                      className={`transition-colors ${
                        rowIdx % 2 === 0
                          ? 'bg-[#f9fcfa] hover:bg-[#d3ebdd]'
                          : 'bg-[#e5f3eb] hover:bg-[#d3ebdd]'
                      }`}
                    >
                      <td className="py-1.5 px-3 font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={townDraft.name}
                            onChange={(e) => setTownDraft((d) => ({ ...d, name: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          town.name
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-slate-700">
                        {isEditing ? (
                          <input
                            type="text"
                            value={townDraft.province}
                            onChange={(e) => setTownDraft((d) => ({ ...d, province: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          town.province
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {isEditing ? (
                          <input
                            type="number"
                            value={townDraft.population}
                            onChange={(e) => setTownDraft((d) => ({ ...d, population: e.target.value }))}
                            className="w-24 px-2 py-1 text-xs font-mono text-right border border-blue-400 rounded bg-white"
                          />
                        ) : town.population !== undefined ? (
                          town.population.toLocaleString()
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            value={townDraft.lat}
                            onChange={(e) => setTownDraft((d) => ({ ...d, lat: e.target.value }))}
                            className="w-24 px-2 py-1 text-xs font-mono text-right border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          town.lat.toFixed(5)
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            value={townDraft.lon}
                            onChange={(e) => setTownDraft((d) => ({ ...d, lon: e.target.value }))}
                            className="w-24 px-2 py-1 text-xs font-mono text-right border border-blue-400 rounded bg-white"
                          />
                        ) : (
                          town.lon.toFixed(5)
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveTownEdit(idx)}
                              title="Save changes"
                              className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTownIdx(null)}
                              title="Cancel"
                              className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTownIdx(idx);
                                setTownDraft({
                                  name: town.name,
                                  province: town.province,
                                  population:
                                    town.population !== undefined ? String(town.population) : '',
                                  lat: String(town.lat),
                                  lon: String(town.lon),
                                });
                              }}
                              title="Edit town"
                              className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-blue-700 hover:border-blue-300"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleDeleteTown(idx)}
                              title="Delete town"
                              className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-rose-700 hover:border-rose-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-emerald-800/45 bg-[#d8ede2] flex items-center justify-between text-xs text-slate-700">
            <span>
              Showing {filteredTowns.length === 0 ? 0 : safeTownPage * PAGE_SIZE + 1}–
              {Math.min((safeTownPage + 1) * PAGE_SIZE, filteredTowns.length)} of{' '}
              {filteredTowns.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safeTownPage === 0}
                onClick={() => setTownPage((p) => Math.max(0, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {safeTownPage + 1} / {townTotalPages}
              </span>
              <button
                type="button"
                disabled={safeTownPage >= townTotalPages - 1}
                onClick={() => setTownPage((p) => Math.min(townTotalPages - 1, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Fault Generators Split View */
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-emerald-800/45">
          <div className="lg:col-span-6 max-h-[400px] overflow-y-auto divide-y divide-emerald-800/20">
            {filteredGenerators.map(({ gen, idx }, rowIdx) => {
              const selected = idx === safeSelectedGenIdx;
              const isRenaming = renamingGenIdx === idx;
              return (
                <div
                  key={`${gen.name}-${idx}`}
                  onClick={() => {
                    if (!isRenaming) {
                      setSelectedGenIdx(idx);
                      setEditingVertexIdx(null);
                    }
                  }}
                  className={`px-3 py-2 flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                    selected
                      ? 'bg-sky-200/80 text-blue-950 font-semibold'
                      : rowIdx % 2 === 0
                        ? 'bg-[#f9fcfa] hover:bg-[#d3ebdd] text-slate-800'
                        : 'bg-[#e5f3eb] hover:bg-[#d3ebdd] text-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        type="text"
                        value={genNameDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setGenNameDraft(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-mono uppercase border border-blue-400 rounded bg-white"
                      />
                    ) : (
                      <div className="font-mono truncate">{gen.name}</div>
                    )}
                    <div className="text-[10px] text-slate-500 font-normal">
                      {gen.points.length} coordinate {gen.points.length === 1 ? 'vertex' : 'vertices'}
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isRenaming ? (
                      <>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleRenameGenerator(idx)}
                          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          title="Save name"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingGenIdx(null)}
                          className="p-1 rounded border border-slate-300 bg-white text-slate-600"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingGenIdx(idx);
                            setGenNameDraft(gen.name);
                          }}
                          title="Rename generator"
                          className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-blue-700"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleDeleteGenerator(idx)}
                          title="Delete generator"
                          className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-6 flex flex-col max-h-[400px]">
            {activeGenerator ? (
              <>
                <div className="px-3 py-2 bg-[#d8ede2] border-b border-emerald-800/55 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-mono font-semibold text-slate-900">
                      {activeGenerator.name}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {activeGenerator.points.length} vertices (GENTR coordinates)
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#d2e9dc] text-slate-800 sticky top-0 border-b border-emerald-800/55">
                      <tr>
                        <th className="py-1.5 px-3 font-semibold w-12">#</th>
                        <th className="py-1.5 px-3 font-semibold text-right">Latitude (°N)</th>
                        <th className="py-1.5 px-3 font-semibold text-right">Longitude (°E)</th>
                        <th className="py-1.5 px-3 font-semibold text-right w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-800/20">
                      {activeGenerator.points.map(([ptLat, ptLon], vIdx) => {
                        const isEditingV = editingVertexIdx === vIdx;
                        return (
                          <tr
                            key={vIdx}
                            className={`transition-colors ${
                              vIdx % 2 === 0
                                ? 'bg-[#f9fcfa] hover:bg-[#d3ebdd]'
                                : 'bg-[#e5f3eb] hover:bg-[#d3ebdd]'
                            }`}
                          >
                            <td className="py-1 px-3 font-mono text-slate-500">{vIdx + 1}</td>
                            <td className="py-1 px-3 text-right font-mono tabular-nums">
                              {isEditingV ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={vertexDraft.lat}
                                  onChange={(e) =>
                                    setVertexDraft((d) => ({ ...d, lat: e.target.value }))
                                  }
                                  className="w-24 px-1.5 py-0.5 text-xs font-mono text-right border border-blue-400 rounded bg-white"
                                />
                              ) : (
                                formatCoordFlexible(ptLat, 2, 4)
                              )}
                            </td>
                            <td className="py-1 px-3 text-right font-mono tabular-nums">
                              {isEditingV ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={vertexDraft.lon}
                                  onChange={(e) =>
                                    setVertexDraft((d) => ({ ...d, lon: e.target.value }))
                                  }
                                  className="w-24 px-1.5 py-0.5 text-xs font-mono text-right border border-blue-400 rounded bg-white"
                                />
                              ) : (
                                formatCoordFlexible(ptLon, 2, 4)
                              )}
                            </td>
                            <td className="py-1 px-3 text-right">
                              {isEditingV ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => handleSaveVertexEdit(vIdx)}
                                    className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingVertexIdx(null)}
                                    className="p-1 rounded border border-slate-300 bg-white text-slate-600"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingVertexIdx(vIdx);
                                      setVertexDraft({
                                        lat: String(ptLat),
                                        lon: String(ptLon),
                                      });
                                    }}
                                    className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-blue-700"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => handleDeleteVertex(vIdx)}
                                    className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:text-rose-700"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <form
                  onSubmit={handleAddVertex}
                  className="p-2.5 bg-[#d8ede2] border-t border-emerald-800/55 flex items-center gap-2"
                >
                  <input
                    type="number"
                    step="any"
                    placeholder="Lat (°N)"
                    value={newVertex.lat}
                    onChange={(e) => setNewVertex((v) => ({ ...v, lat: e.target.value }))}
                    className="w-28 px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="Lon (°E)"
                    value={newVertex.lon}
                    onChange={(e) => setNewVertex((v) => ({ ...v, lon: e.target.value }))}
                    className="w-28 px-2 py-1 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-slate-900 text-white hover:bg-slate-800"
                  >
                    <Plus className="w-3 h-3" />
                    Add Vertex
                  </button>
                </form>
              </>
            ) : (
              <div className="p-6 text-xs text-slate-500">Select a fault generator to edit vertices.</div>
            )}
          </div>
        </div>
      )}

      {/* Raw File Editor Modal */}
      {showRawEditor && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Raw Nearest Places File Editor"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Raw Editor —{' '}
                  {activeTab === 'cities'
                    ? 'CITY.csv (LAT,LON,NAME)'
                    : activeTab === 'towns'
                      ? 'Population_Centers_2007.txt'
                      : 'GENTR.txt (LAT  LON  GENERATOR_NAME)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Edit or paste raw lines directly, then apply to update the catalog.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRawEditor(false)}
                className="p-1 text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
              <textarea
                value={rawEditorText}
                onChange={(e) => setRawEditorText(e.target.value)}
                spellCheck={false}
                className="w-full h-96 font-mono text-xs p-3 border border-slate-300 rounded-md bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  value={rawEditorMode}
                  onChange={(e) => setRawEditorMode(e.target.value as 'merge' | 'replace')}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                >
                  <option value="replace">Replace entire dataset</option>
                  <option value="merge">Merge with existing records</option>
                </select>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRawEditor(false)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleApplyRawEditor}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {isSaving ? 'Applying...' : 'Apply Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
