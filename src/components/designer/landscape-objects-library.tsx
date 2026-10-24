import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,Search,Star,Clock,Copy,Trash2,Lock,Unlock,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useProject} from '@/lib/project-store';
import {text as t,formatNumber,parseLocalizedNumber} from '@/lib/i18n';
import {fromMeters,toMetersLen,lenLabel,formatLenU} from '@/lib/units';
import {normalizePlantSearch} from '@/lib/landscape-types';
import {LANDSCAPE_CATEGORIES,LANDSCAPE_OBJECTS,landscapeRecord,landscapeName,landscapeCategoryName,landscapeSubcategoryName,landscapeLayerLocked,defaultLandscapeSize,defaultLandscapeKeepRatio,type LandscapeCategory,type LandscapeRecord,type LandscapeObject} from '@/lib/landscape-objects';
import {LandscapeLibrary as PlantLibrary,PlantInspector} from './landscape-library';
import {useFloatingPlacement} from './floating-workspace';
import {useLandscapeDrag} from './use-landscape-drag';
import {type PlantCategory} from '@/lib/landscape-types';
import {LANDSCAPE_TABS} from './landscape-category-bar';
import {LandscapeObjectThumbnail} from './landscape-thumbnail';
import {LandscapeVisualModeControl} from './landscape-visual-mode';

type Section=PlantCategory|LandscapeCategory;
export function LandscapeLibrary({mobile}:{mobile:boolean}) {
  const savedSection=useProject(s=>s.landscapeLibrarySection);
  const section:Section=LANDSCAPE_TABS.includes(savedSection as Section)?savedSection as Section:'tree';
  const isPlants=['tree','shrub','flower','grass'].includes(section);
  const [subcategory,setSubcategory]=useState(''),[query,setQuery]=useState('');
  const locale=useProject(s=>s.locale),drag=useLandscapeDrag(mobile);
  const visualMode=useProject(s=>s.landscapeVisualMode);
  useEffect(()=>{setSubcategory('');setQuery('');},[section]);
  const terms=normalizePlantSearch(query).split(/\s+/).filter(Boolean);
  const scope=terms.length?LANDSCAPE_OBJECTS:LANDSCAPE_OBJECTS.filter(o=>o.category===section&&(!subcategory||o.subcategory===subcategory));
  const shown=scope.filter(o=>terms.every(term=>normalizePlantSearch([landscapeName(o),landscapeCategoryName(o.category),landscapeSubcategoryName(o.subcategory)].join(' ')).includes(term)));
  return <aside className="library-panel landscape-library landscape-object-library" data-catalog aria-label={t('landscape')} onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
    <div className="workspace-panel-heading flex shrink-0 items-center gap-2 border-b border-line px-2 py-2"><Button size="xs" variant="solid" className="workspace-panel-hide" onClick={()=>useProject.setState({landscapeOpen:false})}><ChevronLeft/>{t('hide')}</Button><strong className="ml-auto text-sm">{t('landscape')}</strong></div>
    <div className="landscape-catalog-controls">
      <LandscapeVisualModeControl value={visualMode} onChange={mode=>useProject.setState({landscapeVisualMode:mode})}/>
      <label className="plant-search"><Search/><input type="search" maxLength={120} value={query} placeholder={t('landscapeSearch')} aria-label={t('landscapeSearch')} onChange={e=>setQuery(e.target.value)}/></label>

      {LANDSCAPE_CATEGORIES.includes(section as LandscapeCategory)&&!query&&<select className="landscape-subcategory" value={subcategory} aria-label={t('landscapeSubcategories')} onChange={e=>setSubcategory(e.target.value)}><option value="">{t('cat_all')}</option>{[...new Set(LANDSCAPE_OBJECTS.filter(o=>o.category===section).map(o=>o.subcategory))].map(id=><option key={id} value={id}>{landscapeSubcategoryName(id)}</option>)}</select>}
    </div>
    <div className="landscape-results" key={locale}>
      {!!shown.length&&<ul className="landscape-object-grid">{shown.map(o=><li key={o.id}>
        <button type="button" className="landscape-object-card" onPointerDown={e=>drag.begin(e,{kind:'object',record:o})} onDragStart={e=>e.preventDefault()} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();drag.keyboard({kind:'object',record:o});}}}><LandscapeObjectThumbnail object={o} mode={visualMode} alt="" draggable={false}/><strong>{landscapeName(o)}</strong></button>
      </li>)}</ul>}
      {(isPlants||!!query)&&<PlantLibrary key={section} mobile={mobile} embedded sharedQuery={query} selectedCategory={isPlants?section as PlantCategory:undefined}/>}
      {!shown.length&&!isPlants&&!query&&<p className="plant-message">{t('landscapeNoResults')}</p>}
    </div>
    {drag.preview}
  </aside>;
}

function NumberField({label,value,onChange,disabled,min=.03,max=100}:{label:string;value:number;onChange:(n:number)=>void;disabled?:boolean;min?:number;max?:number}) {
  const locale=useProject(s=>s.locale),format=useProject(s=>s.numberFormat),[draft,setDraft]=useState(formatNumber(value,2));
  useEffect(()=>setDraft(formatNumber(value,2)),[value,locale,format]);
  const commit=()=>{const n=parseLocalizedNumber(draft);if(draft.trim()&&Number.isFinite(n)&&n>=min&&n<=max){if(Math.abs(n-value)>1e-8)onChange(n);}else setDraft(formatNumber(value,2));};
  return <label className="plant-field">{label}<input inputMode="decimal" value={draft} disabled={disabled} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
}
export function LandscapeInspector({mobile=false}:{mobile?:boolean}) {
  const selected=useProject(s=>s.selectedLandscapeId),inspected=useProject(s=>s.inspectedLandscapeId);
  const instance=useProject(s=>selected?s.project.drawing?.landscapeObjects?.[selected]:undefined);
  const record=landscapeRecord(instance?.catalogId??inspected??'');
  return record?<ObjectDetails key={instance?.id??record.id} record={record} instance={instance} mobile={mobile}/>:<PlantInspector mobile={mobile}/>;
}
function ObjectDetails({record,instance,mobile}:{record:LandscapeRecord;instance?:LandscapeObject;mobile:boolean}) {
  const units=useProject(s=>s.units),d=useProject(s=>s.project.drawing),favorites=useProject(s=>s.landscapeFavorites);
  const defaultMode=useProject(s=>s.landscapeVisualMode),visualMode=instance?(instance.visualMode??'image'):defaultMode;
  const [size,setSize]=useState({...defaultLandscapeSize(record),rotation:0,keepRatio:defaultLandscapeKeepRatio(record)});
  const o=instance??size,blocked=!!instance?.locked||!!d&&landscapeLayerLocked(d,record.category);
  const equalSides=record.shape==='circle'||record.shape==='square';
  const update=(patch:Partial<Pick<LandscapeObject,'width'|'length'|'rotation'|'keepRatio'>>)=>{if(instance)useProject.getState().updateLandscape(instance.id,patch);else setSize(s=>({...s,...patch}));};
  const dimensionLimit=(key:'width'|'length',maximum:boolean)=>fromMeters(
    (maximum?100:.03)*(o.keepRatio||equalSides?o[key]/(maximum?Math.max(o.length,o.width):Math.min(o.length,o.width)):1),units.length);
  const setDimension=(key:'width'|'length',v:number)=>{
    const meters=toMetersLen(v,units.length),other=key==='width'?'length':'width';
    update({[key]:meters,...(equalSides?{[other]:meters}:o.keepRatio?{[other]:meters*o[other]/o[key]}:{})});
  };
  return <article className="plant-inspector landscape-object-inspector" onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
    <div className="plant-photo plant-photo-large"><LandscapeObjectThumbnail object={instance??record} mode={visualMode} alt={landscapeName(record)}/></div>
    <header className="plant-title"><h2>{landscapeName(record)}</h2><p>{landscapeCategoryName(record.category)} · {landscapeSubcategoryName(record.subcategory)}</p></header>
    <section className="plant-plan-settings">
      <LandscapeVisualModeControl value={visualMode} scope={instance?'selected':'new'} disabled={blocked} onChange={mode=>instance?useProject.getState().updateLandscape(instance.id,{visualMode:mode}):useProject.setState({landscapeVisualMode:mode})}/>
      <NumberField label={`${t(record.shape==='circle'?'drawDiameter':record.shape==='square'?'landscapeSide':'drawLength')}, ${lenLabel(units.length)}`} value={fromMeters(o.length,units.length)} min={dimensionLimit('length',false)} max={dimensionLimit('length',true)} disabled={blocked} onChange={v=>setDimension('length',v)}/>
      {!equalSides&&<NumberField label={`${t('referenceWidth')}, ${lenLabel(units.length)}`} value={fromMeters(o.width,units.length)} min={dimensionLimit('width',false)} max={dimensionLimit('width',true)} disabled={blocked} onChange={v=>setDimension('width',v)}/>}
      {record.stretch&&<label className="landscape-option"><input type="checkbox" checked={o.keepRatio} disabled={blocked} onChange={e=>update({keepRatio:e.target.checked})}/>{t('landscapeKeepRatio')}</label>}
      <NumberField label={`${t('rotation')}, °`} value={o.rotation} min={-36000} max={36000} disabled={blocked} onChange={rotation=>update({rotation})}/>
      {instance?<>
        <div className="plant-coordinates"><NumberField label={`X, ${lenLabel(units.length)}`} value={fromMeters(instance.x,units.length)} min={-1e8} max={1e8} disabled={blocked} onChange={v=>useProject.getState().updateLandscape(instance.id,{x:toMetersLen(v,units.length)})}/><NumberField label={`Y, ${lenLabel(units.length)}`} value={fromMeters(instance.y,units.length)} min={-1e8} max={1e8} disabled={blocked} onChange={v=>useProject.getState().updateLandscape(instance.id,{y:toMetersLen(v,units.length)})}/></div>
        <label className="landscape-option"><input type="checkbox" checked={instance.noIrrigation} disabled={blocked} onChange={e=>useProject.getState().updateLandscape(instance.id,{noIrrigation:e.target.checked})}/>{t('hydroNone')}</label>
        <div className="plant-object-actions"><Button disabled={!!d&&landscapeLayerLocked(d,record.category)} onClick={()=>useProject.getState().duplicateLandscape(instance.id)}><Copy/>{t('drawCopy')}</Button><Button aria-label={t(instance.locked?'unlockLayer':'lockLayer')} onClick={()=>useProject.getState().updateLandscape(instance.id,{locked:!instance.locked})}>{instance.locked?<Lock/>:<Unlock/>}</Button><Button className="text-danger" disabled={blocked} onClick={()=>useProject.getState().removeLandscape(instance.id)}><Trash2/>{t('delete')}</Button></div>
      </>:<><p className="plant-search-note">{t(record.category==='lighting'?'landscapeLightIrrigation':'landscapeNoIrrigation')}</p><Button size="md" variant="solid" disabled={blocked} onClick={()=>{useProject.getState().prepareLandscape(record.id,{...size,visualMode});if(mobile)useProject.setState({rightOpen:false});}}>{t('placeOnPlan')}</Button></>}
      <Button aria-pressed={favorites.includes(record.id)} onClick={()=>useProject.getState().toggleLandscapeFavorite(record.id)}><Star fill={favorites.includes(record.id)?'currentColor':'none'}/>{t(favorites.includes(record.id)?'landscapeUnfavorite':'landscapeFavorite')}</Button>
    </section>
  </article>;
}
export function LandscapePlacementHint() {
  const pending=useProject(s=>s.pendingLandscapeObject),units=useProject(s=>s.units),ref=useRef<HTMLDivElement>(null);
  const box=useFloatingPlacement(ref,b=>({x:b.x,y:b.y+b.height-(ref.current?.offsetHeight??40)}),12,!!pending);
  const shell=ref.current?.closest('.app-shell'),origin=shell&&getComputedStyle(shell).transform!=='none'?shell.getBoundingClientRect():null;
  if(!pending)return null;
  return <div ref={ref} className="plant-placement-hint" data-floating-priority="12" role="status" style={{left:0,top:0,transform:`translate(${(box?.x??0)-(origin?.left??0)}px,${(box?.y??0)-(origin?.top??0)}px)`,maxWidth:box?.width,maxHeight:box?.height,visibility:box?'visible':'hidden'}} onPointerDown={e=>e.stopPropagation()}><span>{landscapeName(pending as LandscapeObject)} · {formatLenU(pending.length,units.length)} × {formatLenU(pending.width,units.length)} · {t('landscapeChoosePosition')}</span><button type="button" aria-label={t('cancel')} onClick={()=>useProject.setState({pendingLandscapeObject:null})}><X/></button></div>;
}
