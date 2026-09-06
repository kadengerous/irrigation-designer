import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Eye, Lock, Unlock, Trash2, Check, Copy, Droplets, Minus, SquarePen } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { arcLength, drawingOrMigrate, faceArea, facePerimeter } from "@/lib/cad/engine";
import { FACE_FILLS, FACE_TEXTURES, REGION_FILL } from "@/lib/cad/types";
import { formatAreaU, formatFlowU, formatLenU, type UnitPrefs } from "@/lib/units";
import { tr, type Locale } from "@/lib/i18n";
import { itemById } from "@/lib/hunter-catalog";
import { headFlow } from "@/lib/flow";
import type { Project } from "@/lib/project-types";

// Also keep the phone workspace when the phone is turned sideways.
export const PHONE_QUERY = "(max-width: 767px), (max-width: 1023px) and (max-height: 600px) and (pointer: coarse)";
export type MobilePanel = "tools" | "layers" | "library" | "properties" | "irrigation" | "estimate" | null;

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
    onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}
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

// Sort the presentation only. Never change face order (drawing order) or saved numbering.
export function layerRows(project: Project, selection: LayerSelection, locale: Locale): LayerRow[] {
  const d = drawingOrMigrate(project);
  const edge = selection.selectedEdgeId ? d.edges[selection.selectedEdgeId] : null;
  const edgeFace = edge && [edge.faceL, edge.faceR].find((id) => id && d.faces[id]);
  const objectKey = selectedObjectKey(selection);
  const selectedKey = objectKey === `edge:${selection.selectedEdgeId}` && edgeFace ? `face:${edgeFace}` : objectKey;
  const rows: Omit<LayerRow, "selected">[] = [
    ...Object.values(d.faces).map((face, index) => ({ kind: "face" as const, id: face.id, key: `face:${face.id}`, title: face.name?.trim() || tr(locale, "layerN", { n: index + 1 }) })),
    ...Object.values(d.edges).filter((e) => !(e.faceL && d.faces[e.faceL]) && !(e.faceR && d.faces[e.faceR]))
      .map((e, index) => ({ kind: "edge" as const, id: e.id, key: `edge:${e.id}`, title: `${tr(locale, Math.abs(e.bulge) > 1e-6 ? "drawArc" : "drawLine")} ${index + 1}` })),
    ...project.heads.map((head, index) => ({ kind: "head" as const, id: head.id, key: `head:${head.id}`, title: `${head.catalogId} · ${index + 1}` })),
  ];
  const result = rows.map((row) => ({ ...row, selected: row.key === selectedKey }));
  return [...result.filter((row) => row.selected), ...result.filter((row) => !row.selected)];
}

export function LayerColorPicker({ title, color, onChange }: { title: string; color: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const selectedTexture = FACE_TEXTURES.find((texture) => texture.id === color);
  const customColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#0a7c66";
  const isCustomColor = !FACE_FILLS.includes(color as (typeof FACE_FILLS)[number]) && !selectedTexture && /^#[0-9a-f]{6}$/i.test(color);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button type="button" className="mobile-icon-button layer-color-button" aria-label={`Изменить цвет или материал: ${title}`}><span className="mobile-layer-color" style={selectedTexture ? { backgroundImage: `url(${selectedTexture.src})` } : { background: color }} /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="bottom" align="center" sideOffset={4} collisionPadding={4} className="layer-color-popover" aria-label={`Палитра: ${title}`} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <section className="layer-palette-section"><h3>Цвета</h3><div className="mobile-palette">{FACE_FILLS.map((swatch) => <button key={swatch} type="button" aria-label={swatch === "transparent" ? "Без заливки" : swatch} aria-pressed={color === swatch} data-transparent={swatch === "transparent"} style={{ background: swatch }} onClick={() => { onChange(swatch); setOpen(false); }}>{color === swatch ? <Check size={18} /> : null}</button>)}<label className="custom-color-swatch" data-selected={isCustomColor}><input type="color" aria-label="Свой цвет" value={customColor} onChange={(event) => { onChange(event.currentTarget.value); setOpen(false); }} /><span>Свой</span></label></div></section>
      <section className="layer-palette-section"><h3>Материалы</h3><div className="material-palette">{FACE_TEXTURES.map((texture) => <button key={texture.id} type="button" aria-label={texture.label} title={texture.label} aria-pressed={color === texture.id} style={{ backgroundImage: `url(${texture.src})` }} onClick={() => { onChange(texture.id); setOpen(false); }}>{color === texture.id ? <Check size={18} /> : null}<span>{texture.label}</span></button>)}</div></section>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function MobileLayers({ onEdit, onInspect }: { onEdit: (id: string) => void; onInspect?: () => void }) {
  const project = useProject((s) => s.project);
  const selectedPolyId = useProject((s) => s.selectedPolyId);
  const selectedId = useProject((s) => s.selectedId);
  const selectedEdgeId = useProject((s) => s.selectedEdgeId);
  const cadEditId = useProject((s) => s.cadEditId);
  const units = useProject((s) => s.units);
  const locale = useProject((s) => s.locale);
  return <LayerList project={project} selection={{ selectedPolyId, selectedId, selectedEdgeId, cadEditId }} units={units} locale={locale} onEdit={onEdit} onInspect={onInspect} />;
}

export function LayerList({ project, selection, units, locale, onEdit }: {
  project: Project; selection: LayerSelection; units: UnitPrefs; locale: Locale;
  onEdit: (id: string) => void; onInspect?: () => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selectedRow = useRef<HTMLElement | null>(null);
  const d = drawingOrMigrate(project);
  const heads = new Map(project.heads.map((head) => [head.id, head]));
  const rows = layerRows(project, selection, locale).filter((row) => row.kind !== "head");
  const selectedKey = rows.find((row) => row.selected)?.key;
  useEffect(() => {
    // The selected row is sorted first. Scroll only this list, never the app/header.
    selectedRow.current?.closest<HTMLElement>(".mobile-layers-list")?.scrollTo({ left: 0, behavior: "auto" });
  }, [selectedKey]);
  const t = (key: string) => tr(locale, key);
  if (!rows.length) return <p className="mobile-empty">{t("noLayers")}</p>;
  return <div className="mobile-layers-list">{rows.map((row) => {
    const { title, id } = row;
    const face = row.kind === "face" ? d.faces[id] : undefined;
    const head = row.kind === "head" ? heads.get(id) : undefined;
    const edge = row.kind === "edge" ? d.edges[id] : undefined;
    const item = head ? itemById(head.catalogId) : undefined;
    const zone = head ? project.zones.find((z) => z.id === head.zone) : undefined;
    const locked = face?.locked ?? head?.locked ?? false;
    const select = () => {
      const st = useProject.getState();
      if (row.kind === "face") st.selectPoly(id);
      else if (row.kind === "head") st.selectHead(id);
      else st.selectEdge(id);
    };
    const close = () => setMenu(null);
    return <Popover.Root modal key={row.key} open={menu === row.key} onOpenChange={(open) => {
      setMenu(open ? row.key : null); setDeleting(false);
    }}><Popover.Anchor asChild><article ref={row.selected ? selectedRow : undefined} className="mobile-layer" data-layer-key={row.key} data-selected={row.selected}>
      <div className="mobile-layer-heading">
        {face && <>
          <LayerColorPicker title={title} color={face.fill ?? REGION_FILL[face.type]} onChange={(color) => { select(); useProject.getState().setFaceFill(color); }} />
          <button type="button" className="mobile-icon-button layer-visibility" aria-label={`${face.hidden ? t("showLayer") : t("hideLayer")}: ${title}`} aria-pressed={Boolean(face.hidden)} onClick={() => { select(); useProject.getState().hideSelected(!face.hidden); }}><span className="layer-eye" data-hidden={face.hidden}><Eye size={18} /></span></button>
          <button type="button" className="mobile-icon-button layer-lock" aria-label={`${locked ? t("unlockLayer") : t("lockLayer")}: ${title}`} aria-pressed={locked} onClick={() => { select(); useProject.getState().lockSelected(!locked); }}>{locked ? <Lock size={18} /> : <Unlock size={18} />}</button>
        </>}
        {face ? <>
          <input key={`${id}:${face.name ?? ""}`} className="mobile-layer-name" aria-label={`Название слоя: ${title}`} title={title} defaultValue={title}
            onFocus={select}
            onBlur={(e) => { const next = e.currentTarget.value.trim(); if (next && next !== title) { select(); useProject.getState().setFaceName(next); } else e.currentTarget.value = title; }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.currentTarget.value = title; e.currentTarget.blur(); } else if (e.key === "Enter") e.currentTarget.blur(); }} />
          <button type="button" className="mobile-icon-button layer-duplicate" aria-label={`Дублировать: ${title}`} title="Дублировать" disabled={locked || face.hidden} onClick={() => { select(); useProject.getState().duplicateSelected(); }}><Copy size={17} /></button>
          <button type="button" className="mobile-icon-button layer-edit" aria-label={`Редактировать: ${title}`} title="Редактировать" disabled={locked || face.hidden} onClick={() => { select(); onEdit(id); }}><SquarePen size={17} /></button>
          <button type="button" className="mobile-icon-button layer-delete-direct text-danger" aria-label={`Удалить: ${title}`} title="Удалить" onClick={() => { select(); setDeleting(true); setMenu(row.key); }}><Trash2 size={17} /></button>
        </> : <button type="button" className="mobile-layer-select" aria-pressed={row.selected} title={title} onClick={select}>
          {head ? <Droplets size={18} className="shrink-0" /> : <Minus size={18} className="shrink-0" />}<span>{title}</span>
        </button>}
        <Popover.Trigger asChild><button type="button" className="mobile-icon-button" aria-label={`Подробности: ${title}`}><ChevronDown size={19} /></button></Popover.Trigger>
      </div>
    </article></Popover.Anchor>
      {menu === row.key && <Popover.Portal>
        <Popover.Content side="bottom" align={deleting ? "end" : "start"} sideOffset={2} collisionPadding={4} aria-label={title} className="layer-details-dialog layer-details-compact" data-confirming={deleting} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <div className="layer-dialog-body">
            {!deleting && face && <dl className="layer-detail-stats">
              <div><dt>{t("area")}</dt><dd>{formatAreaU(faceArea(d, id), units.area)}</dd></div>
              <div><dt>{t("perimeter")}</dt><dd>{formatLenU(facePerimeter(d, id), units.length)}</dd></div>
            </dl>}
            {!deleting && head && <><p className="layer-model-name">{item?.name ?? head.catalogId}</p><dl className="layer-detail-stats">
              <div><dt>{t("radius")}</dt><dd>{formatLenU(head.r, units.length)}</dd></div>
              <div><dt>{t("sector")}</dt><dd>{Math.round(head.arc)}°</dd></div>
              <div><dt>{t("zone")}</dt><dd>{zone?.name ?? head.zone}</dd></div>
              <div><dt>{t("flow")}</dt><dd>{headFlow(head).lpm == null ? t("noData") : formatFlowU(headFlow(head).lpm!, units.flow)}</dd></div>
            </dl></>}
            {!deleting && edge && d.vertices[edge.a] && d.vertices[edge.b] && <dl className="layer-detail-stats"><div><dt>Длина</dt><dd>{formatLenU(arcLength(d.vertices[edge.a]!, d.vertices[edge.b]!, edge.bulge), units.length)}</dd></div></dl>}
            {deleting && <div className="mobile-layer-menu">
              <div className="mobile-layer-confirm" role="alert">
                <p>{tr(locale, "deleteConfirm", { name: title })}</p>
                <button type="button" onClick={() => setDeleting(false)}>{t("cancel")}</button>
                <button type="button" className="text-danger" onClick={() => { if (head) useProject.getState().removeHead(id); else { select(); useProject.getState().deleteSelected(); } close(); }}>{t("delete")}</button>
              </div>
            </div>}
          </div>
        </Popover.Content>
      </Popover.Portal>}
    </Popover.Root>;
  })}</div>;
}
