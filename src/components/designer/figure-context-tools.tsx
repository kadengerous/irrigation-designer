import {useEffect, useState} from "react";
import {Check, PaintBucket, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useProject, drawingForEditing} from "@/lib/project-store";
import {formatNumber, parseLocalizedNumber, tr} from "@/lib/i18n";
import {formatAreaU,formatLenU, fromMeters, lenLabel, toMetersLen} from "@/lib/units";
import {roundedBounds} from "@/lib/cad/corner-rounding";
import {faceArea,facePerimeter,setRoundedBounds} from "@/lib/cad/engine";
import {LocalizedNumberInput} from "./localized-number-input";
import {openLayerFillLibrary, useLayerFillLibrary} from "@/lib/layer-fill-library";
import {roundingBase, setFaceCornerRadii} from "@/lib/cad/rounding-engine";
import {closeCornerRounding, commitCornerGeometry, contextualFigure, openCornerRounding, previewCornerGeometry, roundingSelection, useCornerRounding} from "@/lib/corner-rounding-store";
import {AdaptiveTooltip} from "./floating-workspace";

export function RoundingIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 20V12a7 7 0 0 1 7-7h8"/><path d="M5 9V5h4" strokeDasharray="1.5 2.5"/><path d="m13 13 5 5m-5-5 3 .5m-3-.5.5 3"/></svg>;
}

export function FigureContextTools({onRounding}:{onRounding?:()=>void}) {
  const state=useProject(),face=contextualFigure(state),open=useLayerFillLibrary(s=>s.open),active=useCornerRounding(s=>s.faceId);
  if(!face)return null;
  const t=(key:string)=>tr(state.locale,key),canRound=Boolean(roundingBase(drawingForEditing(state.project),face.id));
  return <>
    <AdaptiveTooltip label={t("fillMaterials")}><Button size="icon" variant={open?"pale-on":"pale"} className="size-9 text-ink [&_svg]:size-5" aria-label={t("fillMaterials")} aria-pressed={open}
      onClick={()=>{closeCornerRounding();openLayerFillLibrary(face.id);}}><PaintBucket strokeWidth={1.4}/></Button></AdaptiveTooltip>
    {canRound&&<AdaptiveTooltip label={t("roundCorners")}><Button size="icon" variant={active===face.id?"pale-on":"pale"} className="size-9 text-ink [&_svg]:size-5" aria-label={t("roundCorners")} aria-pressed={active===face.id}
      onClick={()=>{if(active===face.id)closeCornerRounding();else{useLayerFillLibrary.setState({open:false});openCornerRounding();onRounding?.();}}}><RoundingIcon/></Button></AdaptiveTooltip>}
  </>;
}

export function CornerRoundingPanel() {
  const state=useProject(),rounding=useCornerRounding();
  const [draft,setDraft]=useState(""),[focused,setFocused]=useState(false),[error,setError]=useState("");
  const id=rounding.faceId,base=drawingForEditing(state.project);
  const drawing=rounding.preview?.base===state.project?rounding.preview.drawing:base;
  const face=id?drawing.faces[id]:null,corners=id?roundingBase(drawing,id):null;
  const indices=id?roundingSelection(drawing,id):[],radii=indices.map(i=>face?.rounding?.radii[i]??0);
  const mixed=radii.some(r=>Math.abs(r-(radii[0]??0))>1e-7),value=mixed?null:radii[0]??0;
  const t=(key:string,vars?:Record<string,string|number>)=>tr(state.locale,key,vars);
  useEffect(()=>{if(!focused){setDraft(value===null?"":formatNumber(fromMeters(value,state.units.length),3));setError("");}},[id,value,rounding.selected,state.units.length,state.locale,state.numberFormat,focused]);
  useEffect(()=>{if(!id)return;const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();closeCornerRounding();}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[id]);
  if(!id||!face||!corners)return null;
  const finish=()=>{commitCornerGeometry(id);setFocused(false);};
  return <section className="corner-rounding-panel" role="region" aria-label={t("roundCorners")} onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <div className="rounding-panel-controls">
      <button type="button" aria-pressed={rounding.selected===null} onClick={()=>{finish();useCornerRounding.setState({selected:null,multiple:false});}}>{t("roundAllCorners")}</button>
      <button type="button" aria-pressed={rounding.multiple} onClick={()=>{finish();useCornerRounding.setState({multiple:!rounding.multiple,selected:rounding.selected??[]});}}>{t("roundMultiCorners")}</button>
      <label><span>{t("drawRadius")}</span><input inputMode="decimal" aria-label={t("drawRadius")} disabled={!indices.length} value={draft} placeholder={mixed?t("roundMixed"):"0"}
        onFocus={()=>setFocused(true)} onChange={e=>{
          setDraft(e.target.value);const number=parseLocalizedNumber(e.target.value),radius=toMetersLen(number,state.units.length);
          if(!Number.isFinite(radius)||radius<0){useCornerRounding.setState({preview:null});return;}
          const result=setFaceCornerRadii(base,id,indices,radius);
          if(result.limited){setError(t("roundMaxRadius",{radius:formatLenU(result.maximum,state.units.length)}));useCornerRounding.setState({preview:null});}
          else{setError("");previewCornerGeometry(result.drawing);}
        }} onBlur={finish} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();}if(e.key==="Escape"){e.preventDefault();closeCornerRounding();}}}/><span>{lenLabel(state.units.length)}</span></label>
      <output>{indices.length?t("roundSelected",{count:indices.length}):t("roundNoCorners")}</output>
      <button type="button" className="rounding-done" aria-label={t("drawFinish")} onClick={()=>closeCornerRounding()}><Check/></button>
      <button type="button" className="rounding-close" aria-label={t("close")} onClick={()=>closeCornerRounding()}><X/></button>
    </div>
    <p role={error?"alert":undefined}>{error||t("roundHint")}</p>
  </section>;
}

export function RoundedFigureDimensions({faceId,compact}:{faceId:string;compact:boolean}) {
  const state=useProject(),preview=useCornerRounding(s=>s.preview);
  const drawing=preview?.base===state.project?preview.drawing:drawingForEditing(state.project),r=drawing.faces[faceId]?.rounding;
  if(!r)return null;
  const b=roundedBounds(r.corners,r.radii),t=(key:string)=>tr(state.locale,key);
  return <div className={`rounded-figure-dimensions ${compact?"":"rounded-dimensions-floating"}`}>
    <span>{t("area")} <strong>{formatAreaU(faceArea(drawing,faceId),state.units.area)}</strong></span>
    {(["width","height"] as const).map(axis=><label key={axis}>{t(axis==="width"?"drawWidth":"drawHeight")}<LocalizedNumberInput value={fromMeters(b[axis],state.units.length)} min={.0001}
      aria-label={t(axis==="width"?"drawWidth":"drawHeight")} onCommit={v=>{if(v===null)return;const meters=toMetersLen(v,state.units.length);state.commitDrawing(setRoundedBounds(drawing,faceId,axis==="width"?meters:b.width,axis==="height"?meters:b.height),faceId,true);}}/>{lenLabel(state.units.length)}</label>)}
    <span>{t("perimeter")} <strong>{formatLenU(facePerimeter(drawing,faceId),state.units.length)}</strong></span>
  </div>;
}
