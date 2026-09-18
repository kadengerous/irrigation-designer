import { useLayerReorder } from "./use-layer-reorder";
import { orderedFaces, setGroupMemberAppearance, setFaceTextureRotation, groupMembers, segmentNumber, faceLayerNumber, splitLayer, layerFaceIds, layerRepresentatives, layerArea, layerPerimeter } from "@/lib/cad/engine";
import { Fragment, useEffect, useId, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { Group, ArrowUp, ArrowDown, ChevronDown, Eye, Lock, Unlock, Trash2, Check, Copy, Droplets, Minus, SquarePen, Ungroup, X } from "lucide-react";
import { useProject, drawingForEditing } from "@/lib/project-store";
import { arcLength, drawingOrMigrate, faceArea, facePerimeter } from "@/lib/cad/engine";
import { FACE_FILLS, FACE_TEXTURES, REGION_FILL, faceTexture, layerPurpose, type LayerPurpose, type CadDrawing } from "@/lib/cad/types";
import { formatAreaU, formatFlowU, formatLenU, type UnitPrefs } from "@/lib/units";
import { tr, type Locale } from "@/lib/i18n";
import { itemById } from "@/lib/hunter-catalog";
import { headFlow } from "@/lib/flow";
import type { Project } from "@/lib/project-types";

// Also keep the phone workspace when the phone is turned sideways.
export const PHONE_QUERY = "(max-width: 767px), (max-width: 1023px) and (max-height: 600px) and (pointer: coarse)";
export type MobilePanel = "tools" | "layers" | "library" | "properties" | "irrigation" | "estimate" | null;

const LAYER_PURPOSES: { value: LayerPurpose; key: string }[] = [
  { value: "irrigation", key: "irrigation" },
  { value: "none", key: "hydroNone" },
  { value: "shade", key: "hydroShade" },
  { value: "sun", key: "hydroSun" },
];

function SegmentSymbol() {
  return <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 10h10"/><circle cx="3" cy="10" r="2"/><circle cx="17" cy="10" r="2"/></svg>;
}

function ManagerName({name,disabled,onSave}:{name:string;disabled?:boolean;onSave:(name:string)=>void}) {
  return <input key={name} className="manager-name-editor" aria-label={name} defaultValue={name} disabled={disabled}
    onBlur={e=>{const next=e.currentTarget.value.trim();if(next && next!==name)onSave(next);else e.currentTarget.value=name;}}
    onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"){e.currentTarget.value=name;e.currentTarget.blur();}else if(e.key==="Enter")e.currentTarget.blur();}}/>;
}

export function usePhoneWorkspace() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return phone;
}

export function useWorkspaceViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      root.style.setProperty("--workspace-visible-height", `${viewport?.height ?? window.innerHeight}px`);
      root.style.setProperty("--workspace-visible-top", `${viewport?.offsetTop ?? 0}px`);
      const focused = document.activeElement;
      const typing = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement;
      root.dataset.workspaceKeyboard = String(typing && window.innerHeight - (viewport?.height ?? window.innerHeight) > 100);
      if (typing && focused.closest("[data-mobile-sheet], [role=dialog]")) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => focused.scrollIntoView({ block: "nearest", inline: "nearest" }));
      }
    };
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete root.dataset.workspaceKeyboard;
      root.style.removeProperty("--workspace-visible-height");
      root.style.removeProperty("--workspace-visible-top");
    };
  }, []);
}

export function sheetGesture(current: boolean, delta: number): "close" | "expand" | "compact" | null {
  if (delta < -40) return "expand";
  if (delta > 55) return current ? "compact" : "close";
  return null;
}

// Non-modal by design: the exposed drawing must remain usable while placing or editing.
// Dragging is limited to the handle; scrolling the body never resizes the sheet.
export function MobileSheet({ title, children, onClose, panelKey, footer, compact = false }: {
  title: string; children: ReactNode; onClose: () => void; panelKey: string; footer?: ReactNode; compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const start = useRef<number | null>(null);
  const dragged = useRef(false);
  const titleId = useId();
  useEffect(() => setExpanded(false), [panelKey]);
  if (compact) return <section data-mobile-sheet={panelKey} className="mobile-parameter-bar" role="region" aria-label={title}
    onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
    <div className="mobile-parameter-scroll">{children}</div>
    {footer && <div className="mobile-parameter-actions">{footer}</div>}
  </section>;
  return (
    <section data-mobile-sheet={panelKey} data-expanded={expanded} className="mobile-sheet" role="region" aria-labelledby={titleId}
      onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}>
      <header className="mobile-sheet-header">
        <div className="mobile-sheet-heading">
        <button type="button" className="mobile-sheet-handle" aria-label={expanded ? "Уменьшить панель" : "Развернуть панель"} aria-expanded={expanded}
          onPointerDown={(e) => { start.current = e.clientY; dragged.current = false; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerUp={(e) => {
            if (start.current === null) return;
            const action = sheetGesture(expanded, e.clientY - start.current);
            dragged.current = action !== null;
            start.current = null;
            if (action === "close") onClose();
            else if (action) setExpanded(action === "expand");
          }}
          onPointerCancel={() => { start.current = null; }}
          onClick={() => { if (!dragged.current) setExpanded((v) => !v); }}>
          <span aria-hidden />
        </button>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="mobile-icon-button" aria-label="Свернуть панель" onClick={onClose}><ChevronDown size={22} /></button>
        </div>
      </header>
      <div className="mobile-sheet-body">{children}</div>
      {footer && <div className="mobile-sheet-footer">{footer}</div>}
    </section>
  );
}

type LayerSelection = {
  selectedPolyIds?: string[];
  selectedPolyId: string | null; selectedId: string | null;
  selectedEdgeId: string | null; cadEditId: string | null;
};
type LayerRow = { kind: "face" | "head" | "edge"; id: string; key: string; title: string; selected: boolean };

export function selectedObjectKey(selection: LayerSelection): string | null {
  if (selection.selectedId) return `head:${selection.selectedId}`;
  if (selection.selectedPolyId) return `face:${selection.selectedPolyId}`;
  if (selection.selectedEdgeId) return `edge:${selection.selectedEdgeId}`;
  return selection.cadEditId ? `face:${selection.cadEditId}` : null;
}

export function layerTitle(d: CadDrawing, id: string, locale: Locale): string {
  const face = d.faces[id]!;
  const name = face.name?.trim();
  const number = name?.match(/\d+/)?.[0];
  const locales: Locale[] = ["ru", "en", "es", "de", "fr", "pt", "it", "zh", "ja", "pl", "tr"];
  const normalize = (value: string) => value.replace(/\s/g, "").toLowerCase();
  const oldLayerLabel = face.layerId && name && number && locales.some(lang =>
    normalize(name) === normalize(tr(lang, "layerN", { n: Number(number) })));
  if (face.segment && !face.layerId) return name || `${tr(locale, "drawLine")} ${segmentNumber(d, id)}`;
  return (oldLayerLabel ? undefined : name) || tr(locale, face.layerId ? "groupN" : "layerN", { n: faceLayerNumber(d, id) });
}

// Sort the presentation only. Never change face order (drawing order) or saved numbering.
export function layerRows(project: Project, selection: LayerSelection, locale: Locale, selectedFirst = true): LayerRow[] {
  const d = drawingOrMigrate(project);
  // Face loops are authoritative; legacy copies can have empty edge back-references.
  const boundaryOwners = new Map<string, string>();
  for (const face of Object.values(d.faces)) {
    for (const half of [...face.outer, ...face.holes.flat()]) boundaryOwners.set(half.e, face.id);
  }
  const edge = selection.selectedEdgeId ? d.edges[selection.selectedEdgeId] : null;
  const edgeFace = edge && (boundaryOwners.get(edge.id) ?? [edge.faceL, edge.faceR].find((id) => id && d.faces[id]));
  const objectKey = selectedObjectKey(selection);
  const selectedKey = objectKey === `edge:${selection.selectedEdgeId}` && edgeFace ? `face:${edgeFace}` : objectKey;
  const rows: Omit<LayerRow, "selected">[] = [
    ...layerRepresentatives(d).map((face, index) => ({ kind: "face" as const, id: face.id, key: face.layerId ? `group:${face.layerId}` : `face:${face.id}`, title: layerTitle(d, face.id, locale) })),
    ...Object.values(d.edges).filter((e) => !boundaryOwners.has(e.id) && !(e.faceL && d.faces[e.faceL]) && !(e.faceR && d.faces[e.faceR]))
      .map((e, index) => ({ kind: "edge" as const, id: e.id, key: `edge:${e.id}`, title: `${tr(locale, Math.abs(e.bulge) > 1e-6 ? "drawArc" : "drawLine")} ${index + 1}` })),
    ...project.heads.map((head, index) => ({ kind: "head" as const, id: head.id, key: `head:${head.id}`, title: `${head.catalogId} · ${index + 1}` })),
  ];
  const result = rows.map((row) => ({ ...row, selected: row.key === selectedKey || (row.kind === "face" && layerFaceIds(d, row.id).some(id => id === selection.selectedPolyId || selection.selectedPolyIds?.includes(id))) }));
  return selectedFirst ? [...result.filter((row) => row.selected), ...result.filter((row) => !row.selected)] : result;
}

export function groupMemberLabel(member: ReturnType<typeof groupMembers>[number], locale: Locale): string {
  return member.segment ? `${tr(locale,"drawLine")} ${member.number}` : tr(locale,"layerN",{n:member.number});
}

export function groupMemberTitle(member: ReturnType<typeof groupMembers>[number], locale: Locale): string {
  const label = groupMemberLabel(member, locale);
  return member.name && member.name !== label ? `${label} · ${member.name}` : label;
}

function GroupMemberProperties({groupId,member,drawing,locale,units,onEdit,dragHandle,dragging,dragStyle,manager=false}: {
  manager?:boolean; dragHandle?:ReactNode; dragging?:boolean; dragStyle?:CSSProperties; groupId:string; member:ReturnType<typeof groupMembers>[number]; drawing:CadDrawing; locale:Locale; units:UnitPrefs; onEdit:(id:string)=>void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const selected = useProject(s => s.groupMemberId === member.id);
  const editing = useProject(s => s.cadEditId === member.id);
  const detailsId = useId();
  const face=drawing.faces[member.id]!;
  const title=groupMemberTitle(member,locale);
  const t=(key:string)=>tr(locale,key);
  const update=(patch:Parameters<typeof setGroupMemberAppearance>[2])=>{
    const st=useProject.getState();
    st.commitDrawing(setGroupMemberAppearance(drawingOrMigrate(st.project),member.id,patch),st.groupMemberId ?? groupId,true);
  };
  return <li className="group-member-properties" style={dragStyle} data-member-id={member.id} data-segment={member.segment} data-reorder-id={member.id} data-dragging={dragging} data-expanded={expanded} data-selected={selected}>
    <div className="group-member-heading">
      {dragHandle}
      {member.segment && <span className="layer-palette-spacer layer-segment-symbol"><SegmentSymbol/></span>}
      {!member.segment && <fieldset disabled={face.locked} className="group-member-palette"><LayerColorPicker title={title} color={face.fill ?? REGION_FILL[face.type]} orientation={face.textureRotation ?? 0}
        onChange={fill=>update({fill})} onOrientationChange={textureRotation=>update({textureRotation})} /></fieldset>}
      <button type="button" className="group-member-visibility group-member-action" aria-label={`${t(face.hidden ? "showLayer" : "hideLayer")}: ${title}`} aria-pressed={Boolean(face.hidden)} onClick={() => useProject.getState().setGroupMemberFlag(member.id,{hidden:!face.hidden})}><span className="layer-eye" data-hidden={face.hidden}><Eye size={18}/></span></button>
      <button type="button" className="group-member-lock group-member-action" aria-label={`${t(face.locked ? "unlockLayer" : "lockLayer")}: ${title}`} aria-pressed={Boolean(face.locked)} onClick={() => useProject.getState().setGroupMemberFlag(member.id,{locked:!face.locked})}>{face.locked ? <Lock size={18}/> : <Unlock size={18}/>}</button>
      {manager ? <span className="manager-row-name" title={title}>{title}</span> : <input key={member.name ?? ""} className="group-member-rename" aria-label={title} placeholder={groupMemberLabel(member,locale)} defaultValue={member.name ?? ""} readOnly={face.locked}
        onClick={() => { if(!selected && !manager) useProject.getState().selectGroupMember(member.id); }}
        onBlur={e => { if(e.currentTarget.value.trim() !== (member.name ?? "")) useProject.getState().renameGroupMember(member.id,e.currentTarget.value); }}
        onKeyDown={e => { e.stopPropagation(); if(e.key === "Enter") e.currentTarget.blur(); if(e.key === "Escape") { e.currentTarget.value=member.name ?? ""; e.currentTarget.blur(); } }} />}
      <button type="button" className="group-member-edit group-member-action" aria-pressed={editing} aria-label={t("edit")} disabled={face.hidden || face.locked} onClick={() => { useProject.getState().selectGroupMember(member.id); onEdit(member.id); }}><SquarePen size={18}/></button>
      <button type="button" className="group-member-delete group-member-action text-danger" aria-label={t("delete")} disabled={face.locked} onClick={() => setDeleting(true)}><Trash2 size={18}/></button>
      <button type="button" className="group-member-toggle" aria-label={`${t("layerDetails")}: ${title}`} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
    </div>
    {deleting && <div className="mobile-layer-confirm group-member-confirm"><p>{tr(locale,"deleteConfirm",{name:title})}</p>
      <button type="button" onClick={() => setDeleting(false)}>{t("cancel")}</button><button type="button" className="text-danger" onClick={() => useProject.getState().deleteGroupMember(member.id)}>{t("delete")}</button>
    </div>}
    <div id={detailsId} className="group-member-details" hidden={!expanded}>
      {manager && <div className="manager-layer-actions">
        <button type="button" aria-label={t(face.hidden ? "showLayer" : "hideLayer")} onClick={()=>useProject.getState().setGroupMemberFlag(member.id,{hidden:!face.hidden})}><span className="layer-eye" data-hidden={face.hidden}><Eye size={18}/></span></button>
        <button type="button" className="group-member-lock" aria-pressed={Boolean(face.locked)} aria-label={t(face.locked ? "unlockLayer" : "lockLayer")} onClick={()=>useProject.getState().setGroupMemberFlag(member.id,{locked:!face.locked})}>{face.locked ? <Lock size={18}/> : <Unlock size={18}/>}</button>
        <button type="button" aria-label={t("edit")} disabled={face.hidden || face.locked} onClick={()=>{useProject.getState().selectGroupMember(member.id);onEdit(member.id);}}><SquarePen size={18}/></button>
        <button type="button" className="text-danger" aria-label={t("delete")} disabled={face.locked} onClick={()=>setDeleting(true)}><Trash2 size={18}/></button>
      </div>}
      {manager && <ManagerName name={member.name || groupMemberLabel(member,locale)} disabled={face.locked} onSave={name=>useProject.getState().renameGroupMember(member.id,name)}/>}
      <p className="group-member-area">{t(member.segment ? "drawLength" : "area")} {member.segment ? formatLenU(facePerimeter(drawing,member.id),units.length) : formatAreaU(faceArea(drawing,member.id),units.area)}</p>
      <LayerOrderActions id={member.id} locale={locale} member />
      {!member.segment && <fieldset className="layer-purpose" disabled={face.locked}>
        <legend>{t("layerPurpose")}</legend>
        <RadioGroup.Root aria-label={`${t("layerPurpose")}: ${title}`} className="layer-purpose-options" value={layerPurpose(face)} disabled={face.locked}
          onValueChange={value=>{const option=LAYER_PURPOSES.find(o=>o.value===value);if(option) update({purpose:option.value});}}>
          {LAYER_PURPOSES.map(option=><RadioGroup.Item key={option.value} value={option.value} className="layer-purpose-option">
            <span className="layer-purpose-check"><RadioGroup.Indicator><Check size={16}/></RadioGroup.Indicator></span><span>{t(option.key)}</span>
          </RadioGroup.Item>)}
        </RadioGroup.Root>
      </fieldset>}
    </div>
  </li>;
}

function GroupMemberList({groupId,drawing,locale,units,onEdit,manager=false}: {
  manager?:boolean; groupId:string; drawing:CadDrawing; locale:Locale; units:UnitPrefs; onEdit:(id:string)=>void;
}) {
  const members=groupMembers(drawing,groupId).reverse();
  const drag=useLayerReorder(members.map(m=>m.id),ids=>useProject.getState().reorderGroupMembers(ids));
  return <ul {...drag.listProps} className="group-member-list" aria-label={tr(locale,"layers")}>
    {drag.renderIds.map(id=>{
      const member=members.find(m=>m.id===id);if(!member) return null;
      return <GroupMemberProperties manager={manager} key={id} groupId={groupId} member={member} drawing={drawing} locale={locale} units={units} onEdit={onEdit} dragging={drag.active===id} dragStyle={drag.rowStyle(id)}
        dragHandle={drag.handle(id,groupMemberTitle(member,locale))} />;
    })}
  </ul>;
}

export function changeMaterialOrientation(id: string, rotation: 0 | 90) {
  const st = useProject.getState();
  st.commitDrawing(setFaceTextureRotation(drawingForEditing(st.project), id, rotation), id, true);
}

// One palette for layer rows and the tablet figure editor; only its anchor changes.
export function LayerColorPicker({ title, color, onChange, side = "bottom", className = "", open: controlledOpen, onOpenChange, orientation = 0, onOrientationChange }: {
  title: string; color: string; onChange: (color: string) => void;
  orientation?: 0 | 90; onOrientationChange?: (rotation: 0 | 90) => void;
  side?: "top" | "right" | "bottom" | "left"; className?: string;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const locale = useProject((s) => s.locale);
  const t = (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const [localOpen, setLocalOpen] = useState(false);
  const paletteAnchor=useRef<HTMLButtonElement>(null);
  const open = controlledOpen ?? localOpen;
  const setOpen = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  const selectedTexture = faceTexture(color);
  const swatchColor = color === "theme" ? "var(--color-accent)" : color;
  const customColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#0a7c66";
  const isCustomColor = !FACE_FILLS.includes(color as (typeof FACE_FILLS)[number]) && !selectedTexture && /^#[0-9a-f]{6}$/i.test(color);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button ref={paletteAnchor} type="button" className={`mobile-icon-button layer-color-button ${className}`} aria-label={t("paletteChangeFill", { name: title })}>{color === "theme" ? <svg className="layer-palette-icon" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="7" fill="var(--color-surface)" stroke="currentColor" strokeWidth="1"/><g transform="rotate(-40 16 16)"><rect x="11" y="5" width="10" height="4" rx="2" fill="#4c7fc7"/><rect x="5" y="11" width="22" height="4" rx="2" fill="#e7bf32"/><rect x="5" y="17" width="22" height="4" rx="2" fill="#c16b95"/><rect x="11" y="23" width="10" height="4" rx="2" fill="#79aa58"/></g></svg> : <span className="mobile-layer-color" aria-hidden="true" data-transparent={color === "transparent"} style={{background:selectedTexture ? undefined : swatchColor}}>{selectedTexture && <span className="layer-fill-texture" style={{backgroundImage:`url(${selectedTexture.src})`,transform:`rotate(${(selectedTexture.baseRotation ?? 0) + orientation}deg)`}}/>}</span>}</button></Popover.Trigger>
    <Popover.Portal><Popover.Content side={side} align="center" sideOffset={4} collisionPadding={4} className="layer-color-popover centered-layer-palette" data-floating-priority="100" aria-label={t("paletteForLayer", { name: title })} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="restored-palette-heading"><strong>{title}</strong><Popover.Close aria-label={t("close")}><X size={18}/></Popover.Close></div>
      <section className="layer-palette-section"><h3>{t("paletteColors")}</h3><div className="mobile-palette">{FACE_FILLS.map((swatch) => <button key={swatch} type="button" aria-label={t(swatch === "transparent" ? "noFill" : `color:${swatch}`)} title={t(swatch === "transparent" ? "noFill" : `color:${swatch}`)} aria-pressed={color === swatch} data-transparent={swatch === "transparent"} style={{ background: swatch }} onClick={() => { onChange(swatch); setOpen(false); }}>{color === swatch ? <Check size={18} /> : null}</button>)}<label className="custom-color-swatch" data-selected={isCustomColor} title={t("paletteCustomColor")}><input type="color" aria-label={t("paletteCustomColor")} value={customColor} onChange={(event) => { onChange(event.currentTarget.value); setOpen(false); }} /><span>{t("paletteCustom")}</span></label></div></section>
      <section className="layer-palette-section"><h3>{t("paletteMaterials")}</h3>
      {onOrientationChange && <div className="material-orientation" role="group" aria-label={t("materialDirection")}>
        <button type="button" aria-pressed={orientation === 0} onClick={() => onOrientationChange(0)}>↔ {t("materialHorizontal")}</button>
        <button type="button" aria-pressed={orientation === 90} onClick={() => onOrientationChange(90)}><span aria-hidden="true" style={{display:"inline-block",transform:"rotate(90deg)"}}>↔</span> {t("materialVertical")}</button>
      </div>}
      <div className="material-palette">{FACE_TEXTURES.map((texture) => <button key={texture.id} type="button" aria-label={t(texture.id)} title={t(texture.id)} aria-pressed={color === texture.id} onClick={() => { onChange(texture.id); setOpen(false); }}><i className="material-swatch-image" aria-hidden="true" style={{ backgroundImage: `url(${texture.src})`, transform: `rotate(${(texture.baseRotation ?? 0) + orientation}deg)` }} />{color === texture.id ? <Check size={18} /> : null}<span>{t(texture.id)}</span></button>)}</div></section>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function MobileLayers({ onEdit, onInspect, selectedFirst = true, manager = false }: { onEdit: (id: string) => void; onInspect?: () => void; selectedFirst?: boolean; manager?: boolean }) {
  const project = useProject((s) => s.project);
  const selectedPolyIds = useProject((s) => s.selectedPolyIds);
  const selectedPolyId = useProject((s) => s.selectedPolyId);
  const selectedId = useProject((s) => s.selectedId);
  const selectedEdgeId = useProject((s) => s.selectedEdgeId);
  const cadEditId = useProject((s) => s.cadEditId);
  const units = useProject((s) => s.units);
  const locale = useProject((s) => s.locale);
  return <LayerList manager={manager} selectedFirst={selectedFirst} project={project} selection={{ selectedPolyIds, selectedPolyId, selectedId, selectedEdgeId, cadEditId }} units={units} locale={locale} onEdit={onEdit} onInspect={onInspect} />;
}

function LayerDetailsSurface({inline,...props}:ComponentProps<typeof Popover.Content> & {inline:boolean}) {
  if(inline) return <div className="layer-details-dialog layer-details-compact manager-inline-details" aria-label={props["aria-label"]}>{props.children}</div>;
  return <Popover.Portal><Popover.Content {...props}/></Popover.Portal>;
}

function LayerOrderActions({id,locale,member=false}:{id:string;locale:Locale;member?:boolean}) {
  const project=useProject(s=>s.project);
  const d=drawingOrMigrate(project);
  const key=member ? id : d.faces[id]?.layerId ?? id;
  const group=!member && Boolean(d.faces[id]?.layerId);
  const ids=member ? groupMembers(d,id).map(m=>m.id).reverse() : [...new Set(orderedFaces(d).map(f=>f.layerId ?? f.id))].reverse();
  const move=(front:boolean)=>{
    const rest=ids.filter(value=>value!==key);
    const next=front ? [key,...rest] : [...rest,key];
    const st=useProject.getState();
    if(member) st.reorderGroupMembers(next); else st.reorderLayers(next);
  };
  return <div className="layer-order-actions">
    <button type="button" disabled={ids[0]===key} onClick={()=>move(true)}><ArrowUp size={16}/><span>{tr(locale,group ? "groupToFront" : "layerToFront")}</span></button>
    <button type="button" disabled={ids.at(-1)===key} onClick={()=>move(false)}><ArrowDown size={16}/><span>{tr(locale,group ? "groupToBack" : "layerToBack")}</span></button>
  </div>;
}

export function LayerList({ project, selection, units, locale, onEdit, selectedFirst = true, manager = false }: {
  project: Project; selection: LayerSelection; units: UnitPrefs; locale: Locale; selectedFirst?: boolean; manager?: boolean;
  onEdit: (id: string) => void; onInspect?: () => void;
}) {
  const tablet = !selectedFirst && !manager;
  const [menu, setMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const scopeId = useProject(s => s.groupMemberId);
  const scopeGroup = useProject(s => s.groupMemberGroupId);
  const confirming = deleting || splitting;
  const selectedRow = useRef<HTMLElement | null>(null);
  const d = drawingOrMigrate(project);
  const heads = new Map(project.heads.map((head) => [head.id, head]));
  const baseRows = layerRows(project, selection, locale, selectedFirst).filter((row) => row.kind !== "head");
  const paintKeys=[...new Set(orderedFaces(d).map(f=>f.layerId ?? f.id))].reverse();
  const drag=useLayerReorder(paintKeys,ids=>useProject.getState().reorderLayers(ids));
  const rank=drag.renderIds;
  const rows=selectedFirst ? baseRows : [...baseRows].sort((a,b)=>{
    const index=(row:LayerRow)=>row.kind==='face' ? rank.indexOf(d.faces[row.id]?.layerId ?? row.id) : rank.length;
    return index(a)-index(b);
  });
  const selectedKey = rows.find((row) => row.selected)?.key;
  useEffect(() => {
    if (tablet && menu && !rows.some(row => row.key === menu && row.selected)) {
      setMenu(null); setDeleting(false); setSplitting(false);
    }
  }, [tablet, selectedKey, menu]);
  useEffect(() => {
    // Only the phone brings selection to the front; tablet order stays fixed.
    if (!selectedFirst) return;
    selectedRow.current?.closest<HTMLElement>(".mobile-layers-list")?.scrollTo({ left: 0, behavior: "auto" });
  }, [selectedKey, selectedFirst]);
  const t = (key: string) => tr(locale, key);
  if (!rows.length) return <p className="mobile-empty">{t("noLayers")}</p>;
  return <div {...(!selectedFirst ? drag.listProps : {})} className="mobile-layers-list">{rows.map((row) => {
    const { title, id } = row;
    const face = row.kind === "face" ? d.faces[id] : undefined;
    const head = row.kind === "head" ? heads.get(id) : undefined;
    const edge = row.kind === "edge" ? d.edges[id] : undefined;
    const item = head ? itemById(head.catalogId) : undefined;
    const zone = head ? project.zones.find((z) => z.id === head.zone) : undefined;
    const memberFaces = face ? layerFaceIds(d,id).map(memberId => d.faces[memberId]!) : [];
    const locked = face ? memberFaces.some(member => member.locked) : head?.locked ?? false;
    const hidden = face ? memberFaces.every(member => member.hidden) : false;
    const detailsOpen = menu === row.key && !confirming;
    const activeMember = face?.layerId === scopeGroup ? groupMembers(d,id).find(m => m.id === scopeId) : undefined;
    const select = () => {
      const st = useProject.getState();
      if(st.groupMemberId) st.finishGroupMember();
      if (row.kind === "face") st.selectPoly(id);
      else if (row.kind === "head") st.selectHead(id);
      else st.selectEdge(id);
    };
    const close = () => { setMenu(null); setDeleting(false); setSplitting(false); };
    const RowWrapper=manager || tablet ? "div" : Fragment;
    const DetailsTrigger=tablet ? Fragment : Popover.Trigger;
    const DetailsWrapper=tablet ? "div" : Fragment;
    const DetailsInner=tablet ? "div" : Fragment;
    const expanded = menu === row.key && (!tablet || row.selected);
    return <RowWrapper key={row.key} {...(manager || tablet ? {className:tablet ? "tablet-layer-row" : "manager-layer-row", "data-selected":row.selected, "data-expanded":expanded, "data-reorder-id":face?.layerId ?? id, style:drag.rowStyle(face?.layerId ?? id), "data-dragging":drag.active===(face?.layerId ?? id)} : {})}><Popover.Root modal={false} open={menu === row.key} onOpenChange={(open) => {
      if (open && tablet) select();
      setMenu(open ? row.key : null);
      if (!open) { setDeleting(false); setSplitting(false); }
    }}><Popover.Anchor asChild><article ref={row.selected ? selectedRow : undefined} className="mobile-layer" style={!selectedFirst && !manager && !tablet ? drag.rowStyle(face?.layerId ?? id) : undefined} data-layer-key={row.key} data-reorder-id={manager || tablet ? undefined : face?.layerId ?? id} data-dragging={drag.active===(face?.layerId ?? id)} data-segment={Boolean(face?.segment && !face.layerId)} data-group={Boolean(face?.layerId)} data-selected={row.selected}>
      <div className="mobile-layer-heading">
        {!selectedFirst && face && drag.handle(face.layerId ?? id,title)}
        {activeMember && !manager ? <>
          <span className="group-member-breadcrumb">{title} › {groupMemberTitle(activeMember,locale)}</span>
          <button type="button" className="mobile-icon-button" aria-label={t("edit")} disabled={d.faces[activeMember.id]?.locked || d.faces[activeMember.id]?.hidden} onClick={() => { onEdit(activeMember.id); close(); }}><SquarePen size={17}/></button>
          <button type="button" className="group-member-done" onClick={() => useProject.getState().finishGroupMember()}>{t("drawFinish")}</button>
        </> : <>
        {face && <>
          {(face.layerId || face.segment) && <span className={`layer-palette-spacer ${face.layerId ? "layer-group-symbol" : "layer-segment-symbol"}`} aria-hidden="true">{face.layerId ? <Group size={19}/> : <SegmentSymbol/>}</span>}
          {!face.layerId && !face.segment && <LayerColorPicker title={title} orientation={face.textureRotation ?? 0} onOrientationChange={rotation => changeMaterialOrientation(id, rotation)} color={face.fill ?? REGION_FILL[face.type]} onChange={(color) => { select(); useProject.getState().setFaceFill(color); }} />}
          <button type="button" className="mobile-icon-button layer-visibility" aria-label={`${hidden ? t("showLayer") : t("hideLayer")}: ${title}`} aria-pressed={hidden} onClick={() => { select(); useProject.getState().hideSelected(!hidden); }}><span className="layer-eye" data-hidden={hidden}><Eye size={18} /></span></button>
          <button type="button" className="mobile-icon-button layer-lock" aria-label={`${locked ? t("unlockLayer") : t("lockLayer")}: ${title}`} aria-pressed={locked} onClick={() => { select(); useProject.getState().lockSelected(!locked); }}>{locked ? <Lock size={18} /> : <Unlock size={18} />}</button>
        </>}
        {face ? <>
          {manager ? <span className="manager-row-name" title={title}>{title}</span> : tablet && !row.selected ? <button type="button" className="tablet-layer-select" title={title} onClick={select}>{title}</button> : <input key={`${id}:${face.layerId ?? ""}:${title}`} className="mobile-layer-name" aria-label={title} title={title} defaultValue={title}
            onFocus={manager ? undefined : select}
            onBlur={(e) => { const next = e.currentTarget.value.trim(); if (next && next !== title) { select(); useProject.getState().setFaceName(next); } else e.currentTarget.value = title; }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.currentTarget.value = title; e.currentTarget.blur(); } else if (e.key === "Enter") e.currentTarget.blur(); }} />}
          {face.layerId && <button type="button" className="mobile-icon-button layer-split" aria-pressed={true} aria-label={t("splitLayer")} title={t("splitLayer")} onClick={() => {
            select(); setDeleting(false); setSplitting(true); setMenu(row.key);
          }}><Ungroup size={17} /></button>}
          {!face.layerId && <button type="button" className="mobile-icon-button layer-duplicate" aria-label={`Дублировать: ${title}`} title="Дублировать" disabled={locked || face.hidden} onClick={() => { select(); useProject.getState().duplicateSelected(); }}><Copy size={17} /></button>}
          <button type="button" className="mobile-icon-button layer-edit" aria-pressed={selection.cadEditId === id} aria-label={`Редактировать: ${title}`} title="Редактировать" disabled={locked || hidden} onClick={() => { select(); onEdit(id); }}><SquarePen size={17} /></button>
          <button type="button" className="mobile-icon-button layer-delete-direct text-danger" aria-label={`Удалить: ${title}`} title="Удалить" onClick={() => { select(); setSplitting(false); setDeleting(true); setMenu(row.key); }}><Trash2 size={17} /></button>
        </> : <button type="button" className="mobile-layer-select" aria-pressed={row.selected} title={title} onClick={select}>
          {head ? <Droplets size={18} className="shrink-0" /> : <Minus size={18} className="shrink-0" />}<span>{title}</span>
        </button>}
        </>}
        <DetailsTrigger {...(tablet ? {} : {asChild:true})}><button type="button" className="mobile-icon-button layer-details-toggle"
          data-details-open={detailsOpen} data-deleting={menu === row.key && confirming}
          aria-expanded={detailsOpen}
          aria-label={`${t(detailsOpen ? "layerDetailsClose" : "layerDetails")}: ${title}`}
          onClick={(event) => { if (tablet) { setMenu(detailsOpen ? null : row.key); } else if (menu === row.key && confirming) event.preventDefault(); setDeleting(false); setSplitting(false); }}
        >{tablet && <span>{locale === "ru" ? "Подробнее" : t("layerDetails")}</span>}<ChevronDown size={tablet ? 14 : 19} /></button></DetailsTrigger>
      </div>
    </article></Popover.Anchor>
      {(tablet || menu === row.key) && <DetailsWrapper {...(tablet ? {className:"tablet-details-reveal", "data-open":expanded, inert:!expanded} : {})}><DetailsInner {...(tablet ? {className:"tablet-details-inner"} : {})}><LayerDetailsSurface inline={manager || tablet} side="bottom" align={confirming ? "end" : "start"} sideOffset={2} collisionPadding={4} aria-label={title} className="layer-details-dialog layer-details-compact" data-confirming={confirming} onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()} onInteractOutside={(e) => { if (confirming) e.preventDefault(); }} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <div className="layer-dialog-body">
            {manager && !confirming && face && <div className="manager-layer-actions">
              <button type="button" aria-label={t(hidden ? "showLayer" : "hideLayer")} onClick={()=>{select();useProject.getState().hideSelected(!hidden);}}><span className="layer-eye" data-hidden={hidden}><Eye size={18}/></span></button>
              <button type="button" className="layer-lock" aria-pressed={locked} aria-label={t(locked ? "unlockLayer" : "lockLayer")} onClick={()=>{select();useProject.getState().lockSelected(!locked);}}>{locked ? <Lock size={18}/> : <Unlock size={18}/>}</button>
              {!face.layerId && <button type="button" aria-label={t("duplicate")} disabled={locked || hidden} onClick={()=>{select();useProject.getState().duplicateSelected();}}><Copy size={18}/></button>}
              {face.layerId && <button type="button" className="layer-split" aria-label={t("splitLayer")} onClick={()=>{select();setSplitting(true);}}><Ungroup size={18}/></button>}
              <button type="button" aria-label={t("edit")} disabled={locked || hidden} onClick={()=>{select();onEdit(id);}}><SquarePen size={18}/></button>
              <button type="button" className="text-danger" aria-label={t("delete")} onClick={()=>{select();setDeleting(true);}}><Trash2 size={18}/></button>
            </div>}
            {manager && !confirming && face && <ManagerName name={title} disabled={locked} onSave={name=>{select();useProject.getState().setFaceName(name);}}/>}
            {!confirming && face && <dl className="layer-detail-stats">
              {!face.segment || face.layerId ? <div><dt>{t("area")}</dt><dd>{formatAreaU(layerArea(d, id), units.area)}</dd></div> : null}
              {!face.layerId && <div><dt>{t(face.segment ? "drawLength" : "perimeter")}</dt><dd>{formatLenU(layerPerimeter(d, id), units.length)}</dd></div>}
            </dl>}
            {!confirming && face && <LayerOrderActions id={id} locale={locale} />}
            {!confirming && face?.layerId && <GroupMemberList manager={manager} groupId={id} drawing={d} locale={locale} units={units} onEdit={memberId => { onEdit(memberId); close(); }} />}
            {!confirming && face && !face.layerId && !face.segment && <fieldset className="layer-purpose" disabled={locked}>
              <legend>{t("layerPurpose")}</legend>
              <RadioGroup.Root aria-label={t("layerPurpose")} className="layer-purpose-options" value={layerPurpose(face)} disabled={locked}
                onValueChange={(value) => {
                  const option = LAYER_PURPOSES.find((option) => option.value === value);
                  if (option) useProject.getState().setLayerPurpose(id, option.value);
                }}>
                {LAYER_PURPOSES.map((option) => <RadioGroup.Item key={option.value} value={option.value} className="layer-purpose-option">
                  <span className="layer-purpose-check"><RadioGroup.Indicator><Check size={16} /></RadioGroup.Indicator></span>
                  <span>{t(option.key)}</span>
                </RadioGroup.Item>)}
              </RadioGroup.Root>
            </fieldset>}
            {!confirming && head && <><p className="layer-model-name">{item?.name ?? head.catalogId}</p><dl className="layer-detail-stats">
              <div><dt>{t("radius")}</dt><dd>{formatLenU(head.r, units.length)}</dd></div>
              <div><dt>{t("sector")}</dt><dd>{Math.round(head.arc)}°</dd></div>
              <div><dt>{t("zone")}</dt><dd>{zone?.name ?? head.zone}</dd></div>
              <div><dt>{t("flow")}</dt><dd>{headFlow(head).lpm == null ? t("noData") : formatFlowU(headFlow(head).lpm!, units.flow)}</dd></div>
            </dl></>}
            {!confirming && edge && d.vertices[edge.a] && d.vertices[edge.b] && <dl className="layer-detail-stats"><div><dt>Длина</dt><dd>{formatLenU(arcLength(d.vertices[edge.a]!, d.vertices[edge.b]!, edge.bulge), units.length)}</dd></div></dl>}
            {splitting && <div className="mobile-layer-menu">
              <div className="mobile-layer-confirm" role="alert">
                <p>{tr(locale, "splitGroupConfirm", { name: title })}</p>
                <button type="button" onClick={close}>{t("cancel")}</button>
                <button type="button" className="group-split-confirm" onClick={() => {
                  const st = useProject.getState();
                  st.commitDrawing(splitLayer(drawingOrMigrate(st.project), id), id, true);
                  st.setCadEdit(null); st.selectPoly(id); close();
                }}>{t("splitLayer")}</button>
              </div>
            </div>}
            {deleting && <div className="mobile-layer-menu">
              <div className="mobile-layer-confirm" role="alert">
                <p>{tr(locale, "deleteConfirm", { name: title })}</p>
                <button type="button" onClick={close}>{t("cancel")}</button>
                <button type="button" className="text-danger" onClick={() => { if (head) useProject.getState().removeHead(id); else { select(); useProject.getState().deleteSelected(); } close(); }}>{t("delete")}</button>
              </div>
            </div>}
          </div>
      </LayerDetailsSurface></DetailsInner></DetailsWrapper>}
    </Popover.Root></RowWrapper>;
  })}</div>;
}
