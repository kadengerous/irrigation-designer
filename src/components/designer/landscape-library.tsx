import { zoneLabel } from "@/lib/project-types";
import { plantName, localizedFact, plantWaterQuantity } from "@/lib/catalog-localization";
import { activeLocale, formatDate, formatNumber, parseLocalizedNumber } from "@/lib/i18n";
import { currentUnits, formatLenU, fromMeters, toMetersLen, lenLabel } from "@/lib/units";
import { text as uiText } from "@/lib/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFloatingPlacement } from "./floating-workspace";
import { ChevronLeft, Copy, Droplets, LoaderCircle, Lock, Search, Trash2, Trees, Unlock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/project-store";
import { PLANT_CATEGORIES, PLANT_TYPES, WATER_NEEDS, type PlantCategory, type PlantRecord, type PlantRange } from "@/lib/landscape-types";
import type { CadPlant } from "@/lib/cad/types";

function PlantPhoto({ record, large = false }: { record: PlantRecord; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const photo = record.photos[0];
  useEffect(() => setBroken(false), [photo?.url]);
  return <div className={large ? "plant-photo plant-photo-large" : "plant-photo"}>
    {photo && !broken ? <img src={photo.url} alt={plantName(record)} loading="lazy" onError={() => setBroken(true)} />
      : <span><Trees size={22} /><small>{broken ? uiText("photoUnavailable") : uiText("noSourcePhoto")}</small></span>}
  </div>;
}
type SearchResult = { plants: PlantRecord[]; hasMore: boolean; warning: string | null };
export function LandscapeLibrary({ mobile }: { mobile: boolean }) {
  const [category, setCategory] = useState<PlantCategory>("tree");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SearchResult>({ plants: [], hasMore: false, warning: null });
  const [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const locale = useProject(s => s.locale);
  const inspected = useProject(s => s.inspectedPlant?.id);
  const placed = useProject(s => s.project.drawing?.plants);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true); setError(null);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, category, page: String(page), locale });
        const response = await fetch(`/api/landscape?${params}`, { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) { setError(data.errorKey ?? "libraryUnavailable"); return; }
        if (abort.signal.aborted) return;
        setResult(previous => ({ ...data, plants: page === 1 ? data.plants : [...previous.plants, ...data.plants.filter((p: PlantRecord) => !previous.plants.some(old => old.id === p.id))] }));
      } catch (e) { if (!abort.signal.aborted) setError("plantsLoadError"); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    }, query ? 1000 : 0);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, category, page, attempt, locale]);
  const inspect = (plant: PlantRecord) => {
    useProject.getState().inspectPlant(plant);
    if (mobile) useProject.setState({ landscapeOpen: false });
  };
  return <aside className="library-panel landscape-library" data-catalog aria-label={uiText("plantLibrary")}
    onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <div className="workspace-panel-heading flex shrink-0 items-center gap-2 border-b border-line px-2 py-2">
      <Button size="xs" variant="solid" className="workspace-panel-hide shrink-0 border-line bg-surface text-ink hover:bg-btn-soft" onClick={() => useProject.setState({ landscapeOpen: false })}><ChevronLeft />{uiText("hide")}</Button>
      <strong className="ml-auto text-sm">{uiText("landscape")}</strong>
    </div>
    <div className="plant-library-controls">
      <label className="plant-search"><Search size={17} /><input type="search" value={query} maxLength={120} placeholder={uiText("plantSearchPlaceholder")} aria-label={uiText("plantSearchLabel")} onChange={e => { setQuery(e.target.value); setPage(1); setResult({plants:[],hasMore:false,warning:null}); }} /></label>
      <div className="plant-categories" role="group" aria-label={uiText("plantCategories")}>{(Object.entries(PLANT_CATEGORIES) as [PlantCategory, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={id === category} onClick={() => { setCategory(id); setPage(1); setResult({plants:[],hasMore:false,warning:null}); }}>{label}</button>)}</div>
      <p className="plant-search-note">{query ? uiText("plantSearchScope") : uiText("plantSelectHint")}</p>
    </div>
    <div className="plant-library-scroll" aria-busy={busy}>
      {error && <div className="plant-message" role="alert">{uiText(error)}<Button onClick={() => setAttempt(n => n + 1)}>{uiText("retry")}</Button></div>}
      {result.warning && <p className="plant-message" role="status">{uiText(result.warning)}</p>}
      <ul className="plant-library-list">{result.plants.map(plant => <li key={plant.id}>
        <button type="button" className="plant-library-card" aria-pressed={inspected === plant.id} onClick={() => inspect(plant)}>
          <PlantPhoto record={plant} /><span className="plant-library-name"><strong>{plantName(plant)}</strong><span>{plant.latinName}{plant.cultivar && ` ‘${plant.cultivar}’`}</span></span>
        </button>
      </li>)}</ul>
      {busy && <p className="plant-message" role="status"><LoaderCircle className="animate-spin" size={18} />{uiText("plantsLoading")}</p>}
      {!busy && !error && !result.plants.length && <p className="plant-message">{uiText("plantsNotFound")}</p>}
      {!busy && result.hasMore && <Button className="plant-load-more" onClick={() => setPage(n => n + 1)}>{uiText("loadMore")}</Button>}
      {!!Object.keys(placed ?? {}).length && <details className="plant-on-plan"><summary>{uiText("onPlan")}{formatNumber(Object.keys(placed!).length,0)}</summary>{Object.values(placed!).map(plant => <button type="button" key={plant.id} onClick={() => { useProject.getState().selectPlant(plant.id); if (mobile) useProject.setState({landscapeOpen:false}); }}>{plant.catalog ? plantName(plant.catalog) : PLANT_TYPES[plant.kind]}{plant.catalog?.cultivar && ` · ${plant.catalog.cultivar}`}</button>)}</details>}
    </div>
  </aside>;
}
const rangeText = (range: PlantRange | null | undefined) => range ? `${formatLenU(range.min, currentUnits().length)}–${formatLenU(range.max, currentUnits().length)}` : uiText("noData");
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="plant-fact"><dt>{label}</dt><dd>{children || uiText("noData")}</dd></div>;
}
function NumericField({ label, value, min, max, disabled, onCommit }: { label: string; value: number; min?: number; max?: number; disabled?: boolean; onCommit: (value: number) => void }) {
  const locale = useProject(s => s.locale), numberFormat = useProject(s => s.numberFormat);
  const [text, setText] = useState(formatNumber(value, 2));
  useEffect(() => setText(formatNumber(value, 2)), [value, locale, numberFormat]);
  const commit = () => {
    const next = parseLocalizedNumber(text);
    if (text.trim() && Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max)) { if (Math.abs(next - value) > 0.0001) onCommit(next); }
    else setText(formatNumber(value, 2));
  };
  return <label className="plant-field">{label}<input inputMode="decimal" value={text} disabled={disabled} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }} /></label>;
}
function TextField({label,value,disabled,onCommit}:{label:string;value:string|null|undefined;disabled?:boolean;onCommit:(value:string|null)=>void}) {
  const [text,setText]=useState(value ?? "");
  useEffect(()=>setText(value ?? ""),[value]);
  return <label className="plant-field">{label}<input disabled={disabled} value={text} maxLength={100} placeholder={uiText("notSet")} onChange={e=>setText(e.target.value)} onBlur={()=>{if(text!==(value??""))onCommit(text.trim()||null);}} /></label>;
}
export function PlantInspector({ mobile = false }: { mobile?: boolean }) {
  const selectedId = useProject(s => s.selectedPlantId);
  const instance = useProject(s => selectedId ? s.project.drawing?.plants?.[selectedId] : undefined);
  const inspected = useProject(s => s.inspectedPlant);
  const record = instance?.catalog ?? inspected;
  return record ? <PlantDetails key={instance?.id ?? record.id} record={record} instance={instance} mobile={mobile} />
    : <div className="plant-message">{uiText("inspectPlantHint")}</div>;
}
function PlantDetails({ record: initial, instance, mobile }: { record: PlantRecord; instance?: CadPlant; mobile: boolean }) {
  const [record, setRecord] = useState(initial);
  const units = useProject(s => s.units), locale = useProject(s => s.locale);
  const [loading, setLoading] = useState(false);
  const [diameter, setDiameter] = useState(initial.matureWidthM ? formatNumber(fromMeters(initial.matureWidthM.max, units.length), 2) : "");
  const [kind, setKind] = useState<PlantCategory | "">(initial.category ?? "");
  const zones = useProject(s => s.project.zones);
  const project = useProject(s => s.project);
  const blocked = !!instance?.locked || project.drawing?.layers?.plants?.locked;
  useEffect(() => {
    if (!initial.externalId) return;
    const abort = new AbortController(); setLoading(true);
    fetch(`/api/landscape?id=${encodeURIComponent(initial.id)}`, { signal: abort.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.plant && !abort.signal.aborted) { setRecord(data.plant); setKind(value => value || data.plant.category || ""); setDiameter(value => value || (data.plant.matureWidthM ? formatNumber(fromMeters(data.plant.matureWidthM.max, units.length), 2) : "")); }
    }).catch(() => {}).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [initial.id, initial.externalId]);
  const value = toMetersLen(parseLocalizedNumber(diameter), units.length);
  const previousUnit = useRef(units.length);
  useEffect(() => {
    if (previousUnit.current !== units.length) {
      const before = previousUnit.current;
      setDiameter(old => { const n = parseLocalizedNumber(old); return Number.isFinite(n) ? formatNumber(fromMeters(toMetersLen(n, before), units.length), 2) : old; });
      previousUnit.current = units.length;
    }
  }, [units.length]);
  const canPlace = !!kind && !!diameter.trim() && Number.isFinite(value) && value >= 0.05 && value <= 100 && !project.drawing?.layers?.plants?.locked;
  const updateIrrigation = (patch: Partial<NonNullable<CadPlant["irrigation"]>>) => {
    if (instance) useProject.getState().updatePlant(instance.id, { irrigation: {...instance.irrigation, ...patch} });
  };
  const photo = record.photos[0];
  return <article className="plant-inspector" onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <PlantPhoto record={record} large />
    <header className="plant-title"><h2>{plantName(record)}</h2><p><i>{record.latinName}</i></p>{record.cultivar && <p>{uiText("cultivarLabel")}<strong>{record.cultivar}</strong></p>}</header>
    {loading && <p className="plant-search-note" role="status">{uiText("plantCheckingSource")}</p>}
    <section className="plant-plan-settings" aria-label={uiText("plantGeometry")}>
      {instance ? <>
        <NumericField label={`${uiText("plantDiameter")}, ${lenLabel(units.length)}`} value={fromMeters(instance.r * 2, units.length)} min={fromMeters(0.05, units.length)} max={fromMeters(100, units.length)} disabled={blocked} onCommit={v => useProject.getState().updatePlant(instance.id, { r: toMetersLen(v, units.length) / 2 })} />
        <div className="plant-coordinates"><NumericField label={`X, ${lenLabel(units.length)}`} value={fromMeters(instance.x, units.length)} disabled={blocked} onCommit={x => useProject.getState().updatePlant(instance.id, {x: toMetersLen(x, units.length)})} /><NumericField label={`Y, ${lenLabel(units.length)}`} value={fromMeters(instance.y, units.length)} disabled={blocked} onCommit={y => useProject.getState().updatePlant(instance.id, {y: toMetersLen(y, units.length)})} /></div>
        <div className="plant-object-actions"><Button onClick={() => useProject.getState().duplicatePlant(instance.id)} disabled={project.drawing?.layers?.plants?.locked}><Copy />{uiText("drawCopy")}</Button><Button aria-label={instance.locked ? uiText("unlockPlant") : uiText("lockPlant")} onClick={() => useProject.getState().updatePlant(instance.id, {locked:!instance.locked})}>{instance.locked ? <Lock /> : <Unlock />}</Button><Button className="text-danger" disabled={blocked} onClick={() => useProject.getState().removePlant(instance.id)}><Trash2 />{uiText("delete")}</Button></div>
      </> : <>
        <label className="plant-field">{uiText("plantDiameter")}, {lenLabel(units.length)}<input inputMode="decimal" value={diameter} placeholder={uiText("enterSize")} onChange={e => setDiameter(e.target.value)} /></label>
        {!record.matureWidthM && <p className="plant-search-note">{uiText("plantWidthUnknown")}</p>}
        {record.matureWidthM && <p className="plant-search-note">{uiText("plantWidthDefault")}</p>}
        {!record.category && <label className="plant-field">{uiText("planSymbol")}<select value={kind} onChange={e => setKind(e.target.value as PlantCategory)}><option value="">{uiText("chooseSymbol")}</option>{Object.entries(PLANT_TYPES).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
        <Button size="md" variant="solid" disabled={!canPlace} onClick={() => { useProject.getState().preparePlant(record, kind as PlantCategory, value); if (mobile) useProject.setState({rightOpen:false}); }}><Trees />{uiText("placeOnPlan")}</Button>
        {project.drawing?.layers?.plants?.locked && <p className="plant-search-note">{uiText("plantsLayerLocked")}</p>}
      </>}
    </section>
    <dl className="plant-facts"><Fact label={uiText("plantType")}>{record.category ? PLANT_TYPES[record.category] : null}</Fact><Fact label={uiText("matureHeight")}>{rangeText(record.matureHeightM)}</Fact><Fact label={uiText("matureSpread")}>{rangeText(record.matureWidthM)}</Fact><Fact label={uiText("light")}>{localizedFact(record.light)}</Fact><Fact label={uiText("soil")}>{localizedFact(record.soil)}</Fact><Fact label={uiText("moisture")}>{localizedFact(record.moisture)}</Fact><Fact label={uiText("hardiness")}>{record.hardiness}</Fact></dl>
    <section className="plant-irrigation"><h3><Droplets size={19} />{uiText("sprinklers")}</h3><dl>
      <Fact label={uiText("waterNeed")}>{record.water.need ? WATER_NEEDS[record.water.need] : uiText("noData")}</Fact>
      {record.water.context && <p className="plant-search-note">{localizedFact(record.water.context)}</p>}
      <Fact label={uiText("recommendedMethod")}>{localizedFact(record.water.method)}</Fact><Fact label={uiText("wettingZone")}>{localizedFact(record.water.wettingZone)}</Fact>
      <Fact label={uiText("waterQuantity")}>{record.water.quantity ? plantWaterQuantity(record.water.quantity) : uiText("noData")}</Fact>
      <Fact label={uiText("recommendations")}>{localizedFact(record.water.recommendations)}</Fact>
    </dl>{record.water.sourceUrl && <a className="plant-source-link" href={record.water.sourceUrl} target="_blank" rel="noreferrer">{uiText("irrigationSource")}</a>}
    {instance && <div className="plant-irrigation-inputs"><strong>{uiText("siteConditions")}</strong>
      <label className="plant-field">{uiText("irrigationZone")}<select disabled={blocked} value={instance.irrigation?.zoneId ?? ""} onChange={e => updateIrrigation({zoneId:e.target.value ? Number(e.target.value) : null})}><option value="">{uiText("unassigned")}</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zoneLabel(zone)}</option>)}</select></label>
      <label className="plant-field">{uiText("irrigationMethod")}<select disabled={blocked} value={instance.irrigation?.method ?? ""} onChange={e => updateIrrigation({method:e.target.value as "drip" | "bubbler" | "sprinkler" || null})}><option value="">{uiText("unselected")}</option><option value="drip">{uiText("drip")}</option><option value="bubbler">{uiText("bubbler")}</option><option value="sprinkler">{uiText("overhead")}</option></select></label>
      <label className="plant-field">{uiText("siteLight")}<select disabled={blocked} value={instance.irrigation?.exposure ?? ""} onChange={e => updateIrrigation({exposure:e.target.value as "sun" | "partial-shade" | "shade" || null})}><option value="">{uiText("notSet")}</option><option value="sun">{uiText("sun")}</option><option value="partial-shade">{uiText("partialShade")}</option><option value="shade">{uiText("shade")}</option></select></label>
      <TextField label={uiText("climateZone")} value={project.meta.climateZone} onCommit={climateZone=>useProject.getState().patchProject({meta:{...useProject.getState().project.meta,climateZone}})} />
      <label className="plant-field">{uiText("projectSeason")}<select value={project.meta.season ?? ""} onChange={e => useProject.getState().patchProject({meta:{...useProject.getState().project.meta,season:e.target.value || null}})}><option value="">{uiText("seasonUnset")}</option><option value="spring">{uiText("spring")}</option><option value="summer">{uiText("summer")}</option><option value="autumn">{uiText("autumn")}</option><option value="winter">{uiText("winter")}</option></select></label>
      <TextField label={uiText("siteSoil")} disabled={blocked} value={instance.irrigation?.soil} onCommit={soil=>updateIrrigation({soil})} />
      <p className="plant-search-note">{uiText("plantFlowNotEstimated")}</p>
    </div>}
    </section>
    <section className="plant-description"><h3>{uiText("description")}</h3><p>{localizedFact(record.description) ?? uiText("noData")}</p></section>
    <details className="plant-sources"><summary>{uiText("sourcesAndPhoto")}</summary>{record.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{localizedFact(source.title)}<small>{uiText("verified")}{formatDate(source.accessedAt)}</small></a>)}{photo && <p>{uiText("photoCredit")}<a href={photo.pageUrl} target="_blank" rel="noreferrer">{photo.author}</a> · <a href={photo.licenseUrl ?? photo.pageUrl} target="_blank" rel="noreferrer">{photo.license}</a></p>}</details>
  </article>;
}
export function PlantPlacementHint() {
  const pending = useProject(s => s.pendingCatalogPlant);
  const ref = useRef<HTMLDivElement>(null);
  const box = useFloatingPlacement(ref, b => ({ x: b.x, y: b.y + b.height - (ref.current?.offsetHeight ?? 40) }), 12, !!pending);
  const shell = ref.current?.closest(".app-shell");
  const origin = shell && getComputedStyle(shell).transform !== "none" ? shell.getBoundingClientRect() : null;
  if (!pending) return null;
  return <div ref={ref} className="plant-placement-hint" data-floating-priority="12" style={{left:0,top:0,transform:`translate(${(box?.x ?? 0) - (origin?.left ?? 0)}px,${(box?.y ?? 0) - (origin?.top ?? 0)}px)`,maxWidth:box?.width,maxHeight:box?.height,visibility:box?"visible":"hidden"}} role="status" onPointerDown={e => e.stopPropagation()}><span>{plantName(pending.record)} · Ø {formatLenU(pending.diameterM, currentUnits().length)} · {uiText("choosePlantPosition")}</span><button type="button" aria-label={uiText("cancelPlantPlacement")} onClick={() => useProject.setState({pendingCatalogPlant:null})}><X size={18} /></button></div>;
}
