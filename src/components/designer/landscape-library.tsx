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
    {photo && !broken ? <img src={photo.url} alt={record.russianName ?? record.latinName} loading="lazy" onError={() => setBroken(true)} />
      : <span><Trees size={22} /><small>{broken ? "Фото недоступно" : "Нет фото в источнике"}</small></span>}
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
  const inspected = useProject(s => s.inspectedPlant?.id);
  const placed = useProject(s => s.project.drawing?.plants);
  useEffect(() => {
    const abort = new AbortController();
    setBusy(true); setError(null);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, category, page: String(page) });
        const response = await fetch(`/api/landscape?${params}`, { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Библиотека недоступна");
        if (abort.signal.aborted) return;
        setResult(previous => ({ ...data, plants: page === 1 ? data.plants : [...previous.plants, ...data.plants.filter((p: PlantRecord) => !previous.plants.some(old => old.id === p.id))] }));
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить растения"); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    }, query ? 1000 : 0);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, category, page, attempt]);
  const inspect = (plant: PlantRecord) => {
    useProject.getState().inspectPlant(plant);
    if (mobile) useProject.setState({ landscapeOpen: false });
  };
  return <aside className="library-panel landscape-library" data-catalog aria-label="Библиотека растений"
    onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <div className="workspace-panel-heading flex shrink-0 items-center gap-2 border-b border-line px-2 py-2">
      <Button size="xs" variant="solid" className="workspace-panel-hide shrink-0 border-line bg-surface text-ink hover:bg-btn-soft" onClick={() => useProject.setState({ landscapeOpen: false })}><ChevronLeft />Скрыть</Button>
      <strong className="ml-auto text-sm">Ландшафт</strong>
    </div>
    <div className="plant-library-controls">
      <label className="plant-search"><Search size={17} /><input type="search" value={query} maxLength={120} placeholder="Название, латынь, сорт" aria-label="Поиск растений по всей базе" onChange={e => { setQuery(e.target.value); setPage(1); setResult({plants:[],hasMore:false,warning:null}); }} /></label>
      <div className="plant-categories" role="group" aria-label="Категории растений">{(Object.entries(PLANT_CATEGORIES) as [PlantCategory, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={id === category} onClick={() => { setCategory(id); setPage(1); setResult({plants:[],hasMore:false,warning:null}); }}>{label}</button>)}</div>
      <p className="plant-search-note">{query ? "Поиск по всем категориям · база и iNaturalist" : "Выберите растение, затем укажите место на плане"}</p>
    </div>
    <div className="plant-library-scroll" aria-busy={busy}>
      {error && <div className="plant-message" role="alert">{error}<Button onClick={() => setAttempt(n => n + 1)}>Повторить</Button></div>}
      {result.warning && <p className="plant-message" role="status">{result.warning}</p>}
      <ul className="plant-library-list">{result.plants.map(plant => <li key={plant.id}>
        <button type="button" className="plant-library-card" aria-pressed={inspected === plant.id} onClick={() => inspect(plant)}>
          <PlantPhoto record={plant} /><span className="plant-library-name"><strong>{plant.russianName ?? plant.latinName}</strong><span>{plant.latinName}{plant.cultivar && ` ‘${plant.cultivar}’`}</span></span>
        </button>
      </li>)}</ul>
      {busy && <p className="plant-message" role="status"><LoaderCircle className="animate-spin" size={18} />Загрузка растений…</p>}
      {!busy && !error && !result.plants.length && <p className="plant-message">Растения не найдены. Попробуйте латинское название или название сорта.</p>}
      {!busy && result.hasMore && <Button className="plant-load-more" onClick={() => setPage(n => n + 1)}>Показать ещё</Button>}
      {!!Object.keys(placed ?? {}).length && <details className="plant-on-plan"><summary>На плане · {Object.keys(placed!).length}</summary>{Object.values(placed!).map(plant => <button type="button" key={plant.id} onClick={() => { useProject.getState().selectPlant(plant.id); if (mobile) useProject.setState({landscapeOpen:false}); }}>{plant.catalog?.russianName ?? plant.catalog?.latinName ?? PLANT_TYPES[plant.kind]}{plant.catalog?.cultivar && ` · ${plant.catalog.cultivar}`}</button>)}</details>}
    </div>
  </aside>;
}
const rangeText = (range: PlantRange | null | undefined) => range ? `${range.min.toLocaleString("ru")}–${range.max.toLocaleString("ru")} м` : "Нет данных";
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div className="plant-fact"><dt>{label}</dt><dd>{children || "Нет данных"}</dd></div>;
}
function NumericField({ label, value, min, max, disabled, onCommit }: { label: string; value: number; min?: number; max?: number; disabled?: boolean; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(+value.toFixed(2)));
  useEffect(() => setText(String(+value.toFixed(2))), [value]);
  const commit = () => {
    const next = Number(text.replace(",", "."));
    if (text.trim() && Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max)) { if (Math.abs(next - value) > 0.0001) onCommit(next); }
    else setText(String(+value.toFixed(2)));
  };
  return <label className="plant-field">{label}<input inputMode="decimal" value={text} disabled={disabled} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { commit(); e.currentTarget.blur(); } }} /></label>;
}
function TextField({label,value,disabled,onCommit}:{label:string;value:string|null|undefined;disabled?:boolean;onCommit:(value:string|null)=>void}) {
  const [text,setText]=useState(value ?? "");
  useEffect(()=>setText(value ?? ""),[value]);
  return <label className="plant-field">{label}<input disabled={disabled} value={text} maxLength={100} placeholder="Не задано" onChange={e=>setText(e.target.value)} onBlur={()=>{if(text!==(value??""))onCommit(text.trim()||null);}} /></label>;
}
export function PlantInspector({ mobile = false }: { mobile?: boolean }) {
  const selectedId = useProject(s => s.selectedPlantId);
  const instance = useProject(s => selectedId ? s.project.drawing?.plants?.[selectedId] : undefined);
  const inspected = useProject(s => s.inspectedPlant);
  const record = instance?.catalog ?? inspected;
  return record ? <PlantDetails key={instance?.id ?? record.id} record={record} instance={instance} mobile={mobile} />
    : <div className="plant-message">Выберите растение на плане или в библиотеке.</div>;
}
function PlantDetails({ record: initial, instance, mobile }: { record: PlantRecord; instance?: CadPlant; mobile: boolean }) {
  const [record, setRecord] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [diameter, setDiameter] = useState(initial.matureWidthM ? String(initial.matureWidthM.max) : "");
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
      if (data.plant && !abort.signal.aborted) { setRecord(data.plant); setKind(value => value || data.plant.category || ""); setDiameter(value => value || (data.plant.matureWidthM ? String(data.plant.matureWidthM.max) : "")); }
    }).catch(() => {}).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [initial.id, initial.externalId]);
  const value = Number(diameter.replace(",", "."));
  const canPlace = !!kind && !!diameter.trim() && Number.isFinite(value) && value >= 0.05 && value <= 100 && !(project.underlay && !project.scaleCalibrated) && !project.drawing?.layers?.plants?.locked;
  const updateIrrigation = (patch: Partial<NonNullable<CadPlant["irrigation"]>>) => {
    if (instance) useProject.getState().updatePlant(instance.id, { irrigation: {...instance.irrigation, ...patch} });
  };
  const photo = record.photos[0];
  return <article className="plant-inspector" onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <PlantPhoto record={record} large />
    <header className="plant-title"><h2>{record.russianName ?? record.latinName}</h2><p><i>{record.latinName}</i></p>{record.cultivar && <p>Сорт: <strong>{record.cultivar}</strong></p>}</header>
    {loading && <p className="plant-search-note" role="status">Проверка характеристик в источнике…</p>}
    <section className="plant-plan-settings" aria-label="Размер и положение растения">
      {instance ? <>
        <NumericField label="Диаметр на плане, м" value={instance.r * 2} min={0.05} max={100} disabled={blocked} onCommit={v => useProject.getState().updatePlant(instance.id, { r: v / 2 })} />
        <div className="plant-coordinates"><NumericField label="X, м" value={instance.x} disabled={blocked} onCommit={x => useProject.getState().updatePlant(instance.id, {x})} /><NumericField label="Y, м" value={instance.y} disabled={blocked} onCommit={y => useProject.getState().updatePlant(instance.id, {y})} /></div>
        <div className="plant-object-actions"><Button onClick={() => useProject.getState().duplicatePlant(instance.id)} disabled={project.drawing?.layers?.plants?.locked}><Copy />Копия</Button><Button aria-label={instance.locked ? "Разблокировать растение" : "Закрепить растение"} onClick={() => useProject.getState().updatePlant(instance.id, {locked:!instance.locked})}>{instance.locked ? <Lock /> : <Unlock />}</Button><Button className="text-danger" disabled={blocked} onClick={() => useProject.getState().removePlant(instance.id)}><Trash2 />Удалить</Button></div>
      </> : <>
        <label className="plant-field">Диаметр на плане, м<input inputMode="decimal" value={diameter} placeholder="Укажите размер" onChange={e => setDiameter(e.target.value)} /></label>
        {!record.matureWidthM && <p className="plant-search-note">Ширина взрослого растения: нет данных. Укажите известный вам размер для плана.</p>}
        {record.matureWidthM && <p className="plant-search-note">По умолчанию — верхняя граница взрослой кроны из источника.</p>}
        {!record.category && <label className="plant-field">Обозначение на плане<select value={kind} onChange={e => setKind(e.target.value as PlantCategory)}><option value="">Выберите обозначение</option>{Object.entries(PLANT_TYPES).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
        <Button size="md" variant="solid" disabled={!canPlace} onClick={() => { useProject.getState().preparePlant(record, kind as PlantCategory, value); if (mobile) useProject.setState({rightOpen:false}); }}><Trees />Разместить на плане</Button>
        {project.underlay && !project.scaleCalibrated && <p className="plant-search-note">Сначала задайте масштаб подложки.</p>}
        {project.drawing?.layers?.plants?.locked && <p className="plant-search-note">Слой растений заблокирован.</p>}
      </>}
    </section>
    <dl className="plant-facts"><Fact label="Тип">{record.category ? PLANT_TYPES[record.category] : null}</Fact><Fact label="Высота взрослого растения">{rangeText(record.matureHeightM)}</Fact><Fact label="Диаметр взрослой кроны">{rangeText(record.matureWidthM)}</Fact><Fact label="Освещение">{record.light}</Fact><Fact label="Почва">{record.soil}</Fact><Fact label="Влажность">{record.moisture}</Fact><Fact label="Морозостойкость">{record.hardiness}</Fact></dl>
    <section className="plant-irrigation"><h3><Droplets size={19} />Полив</h3><dl>
      <Fact label="Потребность в воде">{record.water.need ? WATER_NEEDS[record.water.need] : "Нет данных"}</Fact>
      {record.water.context && <p className="plant-search-note">{record.water.context}</p>}
      <Fact label="Рекомендуемый способ">{record.water.method}</Fact><Fact label="Зона увлажнения">{record.water.wettingZone}</Fact>
      <Fact label="Количественная потребность">{record.water.quantity ? `${record.water.quantity.min}–${record.water.quantity.max} ${record.water.quantity.unit} · ${record.water.quantity.conditions}` : "Нет данных"}</Fact>
      <Fact label="Рекомендации">{record.water.recommendations}</Fact>
    </dl>{record.water.sourceUrl && <a className="plant-source-link" href={record.water.sourceUrl} target="_blank" rel="noreferrer">Источник сведений о поливе ↗</a>}
    {instance && <div className="plant-irrigation-inputs"><strong>Условия на плане</strong>
      <label className="plant-field">Зона полива<select disabled={blocked} value={instance.irrigation?.zoneId ?? ""} onChange={e => updateIrrigation({zoneId:e.target.value ? Number(e.target.value) : null})}><option value="">Не назначена</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
      <label className="plant-field">Способ полива<select disabled={blocked} value={instance.irrigation?.method ?? ""} onChange={e => updateIrrigation({method:e.target.value as "drip" | "bubbler" | "sprinkler" || null})}><option value="">Не выбран</option><option value="drip">Капельный</option><option value="bubbler">Бабблер</option><option value="sprinkler">Дождевание</option></select></label>
      <label className="plant-field">Освещение на плане<select disabled={blocked} value={instance.irrigation?.exposure ?? ""} onChange={e => updateIrrigation({exposure:e.target.value as "sun" | "partial-shade" | "shade" || null})}><option value="">Не задано</option><option value="sun">Солнце</option><option value="partial-shade">Полутень</option><option value="shade">Тень</option></select></label>
      <TextField label="Климатическая зона проекта" value={project.meta.climateZone} onCommit={climateZone=>useProject.getState().patchProject({meta:{...useProject.getState().project.meta,climateZone}})} />
      <label className="plant-field">Сезон проекта<select value={project.meta.season ?? ""} onChange={e => useProject.getState().patchProject({meta:{...useProject.getState().project.meta,season:e.target.value || null}})}><option value="">Не задан</option><option>Весна</option><option>Лето</option><option>Осень</option><option>Зима</option></select></label>
      <TextField label="Почва на плане" disabled={blocked} value={instance.irrigation?.soil} onCommit={soil=>updateIrrigation({soil})} />
      <p className="plant-search-note">Автоматический расчёт расхода пока не выполняется. Категория влажности не переводится в литры.</p>
    </div>}
    </section>
    <section className="plant-description"><h3>Описание</h3><p>{record.description ?? "Нет данных"}</p></section>
    <details className="plant-sources"><summary>Источники и фотография</summary>{record.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<small>Проверено {source.accessedAt}</small></a>)}{photo && <p>Фото: <a href={photo.pageUrl} target="_blank" rel="noreferrer">{photo.author}</a> · <a href={photo.licenseUrl ?? photo.pageUrl} target="_blank" rel="noreferrer">{photo.license}</a></p>}</details>
  </article>;
}
export function PlantPlacementHint() {
  const pending = useProject(s => s.pendingCatalogPlant);
  const ref = useRef<HTMLDivElement>(null);
  const box = useFloatingPlacement(ref, b => ({ x: b.x, y: b.y + b.height - (ref.current?.offsetHeight ?? 40) }), 12, !!pending);
  const shell = ref.current?.closest(".app-shell");
  const origin = shell && getComputedStyle(shell).transform !== "none" ? shell.getBoundingClientRect() : null;
  if (!pending) return null;
  return <div ref={ref} className="plant-placement-hint" data-floating-priority="12" style={{left:0,top:0,transform:`translate(${(box?.x ?? 0) - (origin?.left ?? 0)}px,${(box?.y ?? 0) - (origin?.top ?? 0)}px)`,maxWidth:box?.width,maxHeight:box?.height,visibility:box?"visible":"hidden"}} role="status" onPointerDown={e => e.stopPropagation()}><span>{pending.record.russianName ?? pending.record.latinName} · Ø {pending.diameterM.toLocaleString("ru")} м · укажите место на плане</span><button type="button" aria-label="Отменить размещение растения" onClick={() => useProject.setState({pendingCatalogPlant:null})}><X size={18} /></button></div>;
}
