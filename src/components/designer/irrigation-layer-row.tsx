import { useId, useRef, useState, type ReactNode, type CSSProperties } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Eye, Lock, SquarePen, Trash2, Unlock } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { zoneLabel, zoneColor, type Head, type Zone } from "@/lib/project-types";
import { isHeadLocked, isHeadVisible } from "@/lib/head-visibility";
import { formatNumber, tr, type Locale } from "@/lib/i18n";
import { formatFlowU, formatLenU, formatPressureU, type UnitPrefs } from "@/lib/units";
import { headFlow } from "@/lib/flow";
import { catalogForHead,  itemById, nozzleTablePressure } from "@/lib/equipment-catalog";
import { catalogName } from "@/lib/catalog-localization";
import { SprinklerIcon } from "./sprinkler-icon";
import { ZoneHeadGrip } from "./zone-drag";
import { LayerDeleteDialog } from "./layer-delete-dialog";

/** Shared layer-shaped presentation for zones and their installed equipment. */
export function IrrigationLayerRow({ name, icon, rowKey, kind, selected, hidden, locked, open, onToggle, onSelect, summary, children, locale, floating = false, grip, style }: {
  name: string; icon: ReactNode; rowKey: string; kind: "zone" | "head"; selected?: boolean;
  hidden?: boolean; locked?: boolean; open: boolean; onToggle: () => void; onSelect?: () => void;
  summary?: ReactNode; children: ReactNode; locale: Locale; floating?: boolean; grip?: ReactNode; style?: CSSProperties;
}) {
  const detailsId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const detailsLabel = `${tr(locale, open ? "layerDetailsClose" : "layerDetails")}: ${name}`;
  const row = <article className="mobile-layer irrigation-layer-row" data-layer-key={rowKey} data-kind={kind}
    data-selected={Boolean(selected)} data-hidden={Boolean(hidden)} data-expanded={open} style={style}>
    <div className="irrigation-layer-heading">
      {grip}
      {kind !== "zone" && <span className="irrigation-row-symbol" aria-hidden="true">{icon}</span>}
      <button type="button" className="irrigation-layer-name" title={name} onClick={onSelect ?? onToggle}
        {...(onSelect ? { "aria-pressed": Boolean(selected) } : { "aria-expanded": open, "aria-controls": detailsId })}>
        {kind === "zone" && icon}<bdi dir={kind === "head" ? "ltr" : "auto"}>{name}</bdi>
      </button>
      {kind !== "zone" && (hidden || locked) && <span className="irrigation-layer-status" aria-hidden="true">
        {hidden && <span className="layer-eye" data-hidden="true"><Eye size={16}/></span>}
        {locked && <Lock size={16} className="text-danger"/>}
      </span>}
      <button ref={toggleRef} type="button" className="mobile-icon-button irrigation-layer-toggle" aria-label={detailsLabel} title={detailsLabel}
        aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>{kind === "zone" && <span>{tr(locale, "details")}</span>}<ChevronDown size={18}/></button>
    </div>
    {summary}
    {!floating && <div id={detailsId} className="irrigation-layer-details" hidden={!open}>{open && children}</div>}
  </article>;
  if (!floating) return row;
  return <Popover.Root open={open} onOpenChange={value => { if (value !== open) onToggle(); }}>
    <Popover.Anchor asChild>{row}</Popover.Anchor>
    <Popover.Portal><Popover.Content id={detailsId} className="mobile-layer irrigation-layer-row irrigation-layer-popover"
      aria-label={name} side="bottom" align="start" sideOffset={4} collisionPadding={8}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => { event.preventDefault(); toggleRef.current?.focus(); }}
      onPointerDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}
      onTouchMove={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()}>
      {children}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}

export function IrrigationLayerActions({ name, hidden, locked, inheritedHidden, inheritedLocked, deleteDisabled, onVisibility, onLock, onDelete, onEdit, locale }: {
  name: string; hidden: boolean; locked: boolean; inheritedHidden?: boolean; inheritedLocked?: boolean;
  deleteDisabled?: boolean; onVisibility: () => void; onLock: () => void;
  onDelete?: (button: HTMLButtonElement) => void; onEdit?: () => void; locale: Locale;
}) {
  const visibility = `${tr(locale, hidden ? "show" : "hide")}: ${name}`;
  const lock = `${tr(locale, locked ? "referenceUnlockAction" : "referenceLockAction")}: ${name}`;
  return <div className="irrigation-layer-actions">
    <button type="button" className="mobile-icon-button layer-visibility" title={visibility} aria-label={visibility}
      aria-pressed={hidden} disabled={inheritedHidden} onClick={onVisibility}><span className="layer-eye" data-hidden={hidden}><Eye size={18}/></span></button>
    <button type="button" className="mobile-icon-button layer-lock" title={lock} aria-label={lock}
      aria-pressed={locked} disabled={inheritedLocked} onClick={onLock}>{locked ? <Lock size={18}/> : <Unlock size={18}/>}</button>
    {onEdit && <button type="button" className="mobile-icon-button" title={tr(locale, "editNamed", { name })}
      aria-label={tr(locale, "editNamed", { name })} disabled={locked || hidden} onClick={onEdit}><SquarePen size={18}/></button>}
    {onDelete&&<button type="button" className="mobile-icon-button layer-delete-direct" title={tr(locale, "deleteNamed", { name })}
      aria-label={tr(locale, "deleteNamed", { name })} disabled={locked || deleteDisabled} onClick={event => onDelete(event.currentTarget)}><Trash2 size={18}/></button>}
  </div>;
}

export function HeadLayerRow({ head, number, zone, selected, units, locale, onInspect, onPreview, floating = false, expanded, onExpandedChange }: {
  head: Head; number: number; zone?: Zone; selected?: boolean; units: UnitPrefs; locale: Locale; onInspect?: () => void; onPreview?: () => void; floating?: boolean;
  expanded?: boolean; onExpandedChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = expanded ?? localOpen;
  const [deleting, setDeleting] = useState(false);
  const allZones = useProject(s => s.project.zones);
  const name = head.catalogId;
  const zones = zone ? [zone] : [];
  const hidden = !isHeadVisible(head, zones), locked = isHeadLocked(head, zones);
  const item = catalogForHead(head);
  const color = zoneColor(head.zone);
  const flow = headFlow(head).lpm;
  const t = (key: string) => tr(locale, key);
  const inspect = () => { useProject.getState().selectHead(head.id); onInspect?.(); };
  const preview = () => { if(onPreview)onPreview();else if (zone) useProject.getState().focusZone(zone.id, head.id); };
  const toggle = () => {
    if (onExpandedChange) onExpandedChange(!open); else setLocalOpen(!open);
    setDeleting(false);
    preview();
  };
  return <IrrigationLayerRow name={name} rowKey={`head:${head.id}`} kind="head"
    icon={<span className="head-nozzle-icon" style={{ color }}><SprinklerIcon width={28} height={28}/></span>}
    selected={selected} hidden={hidden} locked={locked} open={open} locale={locale} floating={floating}
    grip={<ZoneHeadGrip head={head} disabled={locked}/>} onSelect={preview} onToggle={toggle}>
    <IrrigationLayerActions name={name} hidden={hidden} locked={locked} inheritedHidden={zone?.hidden} inheritedLocked={zone?.locked}
      onVisibility={() => useProject.getState().setHeadFlag(head.id, { hidden: !head.hidden })}
      onLock={() => useProject.getState().setHeadFlag(head.id, { locked: !head.locked })}
      onDelete={() => setDeleting(true)} onEdit={inspect} locale={locale}/>
    {deleting && <LayerDeleteDialog name={name} locale={locale} disabled={locked}
      onCancel={() => setDeleting(false)} onDelete={() => { useProject.getState().removeHead(head.id); setDeleting(false); }}/>}
    <p className="irrigation-layer-model">{item ? catalogName(item) : <bdi dir="ltr">{head.catalogId}</bdi>}</p>
    <label className="zone-name-editor"><span>{t("zoneTransferDestination")}</span>
      <select aria-label={t("zoneTransferDestination")} value={head.zone} disabled={locked}
        onChange={event => useProject.getState().transferHeadToZone(head.id, Number(event.target.value))}>
        {allZones.map(destination => <option key={destination.id} value={destination.id} disabled={destination.locked && destination.id !== head.zone}>{zoneLabel(destination)}</option>)}
      </select>
    </label>
    <dl className="irrigation-layer-stats">
      <div><dt>{t("radius")}</dt><dd>{formatLenU(head.r, units.length)}</dd></div>
      <div><dt>{t("sector")}</dt><dd>{formatNumber(head.arc, 0)}°</dd></div>
      <div><dt>{t("pressure")}</dt><dd>{formatPressureU(item?nozzleTablePressure(item,head.designPressure):head.designPressure, units.pressure)}</dd></div>
      <div><dt>{t("flow")}</dt><dd>{flow == null ? t("noData") : formatFlowU(flow, units.flow)}</dd></div>
      {zone && <div><dt>{t("zone")}</dt><dd><bdi>{zoneLabel(zone)}</bdi></dd></div>}
    </dl>
  </IrrigationLayerRow>;
}
