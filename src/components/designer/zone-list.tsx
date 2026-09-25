import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useProject, drawingForEditing } from "@/lib/project-store";
import { zoneLabel, type Project, type Zone } from "@/lib/project-types";
import { formatNumber, tr, type Locale } from "@/lib/i18n";
import { formatAreaU, formatFlowU, formatPrecipitation, formatPressureU, type UnitPrefs } from "@/lib/units";
import { zoneFlow, zonePressure } from "@/lib/hydro";
import { coverageStats, exclusionPolygons, lawnPolygon } from "@/lib/coverage";
import { faceArea, facePoints, headInsideFace } from "@/lib/cad/engine";
import { totalAreaPrecip } from "@/lib/flow";
import { useZoneDeletion } from "./zone-delete-dialog";
import { HeadLayerRow, IrrigationLayerActions, IrrigationLayerRow } from "./irrigation-layer-row";
import { ZoneDragProvider, ZoneDropTarget } from "./zone-drag";

export function ZoneLayerRow({ project, zone, open, active, selectedIds, units, locale, onToggle, onDelete }: {
  project: Project; zone: Zone; open: boolean; active: boolean; selectedIds: string[]; units: UnitPrefs; locale: Locale;
  onToggle: () => void; onDelete: (button: HTMLButtonElement) => void;
}) {
  const name = zoneLabel(zone);
  const heads = project.heads.filter(head => head.zone === zone.id);
  const q = zoneFlow(heads, zone.id), pressure = zonePressure(heads, zone.id);
  const t = (key: string) => tr(locale, key);
  return <IrrigationLayerRow name={name} rowKey={`zone:${zone.id}`} kind="zone" selected={active}
    hidden={zone.hidden} locked={zone.locked} open={open} onToggle={onToggle} locale={locale}
    icon={null} onSelect={() => useProject.getState().focusZone(zone.id)}>
    <div className="zone-demand" aria-label={`${name}: ${t("flow")}, ${t("zonePressure")}`}>
      <span>{q == null ? t("noData") : formatFlowU(q, units.flow)}</span>
      <span title={t("zonePressure")}>{pressure == null ? t("noData") : formatPressureU(pressure, units.pressure)}</span>
      <span>{t("heads")}: {formatNumber(heads.length, 0)}</span>
    </div>
    <ZoneStatistics project={project} zone={zone} units={units} locale={locale}/>
    <IrrigationLayerActions name={name} hidden={zone.hidden} locked={zone.locked} deleteDisabled={heads.some(head => head.locked)}
      onVisibility={() => useProject.getState().toggleZoneHidden(zone.id)} onLock={() => useProject.getState().toggleZoneLocked(zone.id)}
      onDelete={onDelete} locale={locale}/>
    <label className="zone-name-editor"><span>{t("faceName")}</span>
      <input key={`${zone.id}:${name}`} defaultValue={name} disabled={zone.locked}
        onBlur={event => {
          const next = event.currentTarget.value.trim();
          if (next && next !== name) useProject.getState().renameZone(zone.id, next);
          else event.currentTarget.value = name;
        }} onKeyDown={event => {
          event.stopPropagation();
          if (event.key === "Escape") { event.currentTarget.value = name; event.currentTarget.blur(); }
          else if (event.key === "Enter") event.currentTarget.blur();
        }}/>
    </label>
    <div className="zone-member-list" role="group" aria-label={tr(locale, "zoneHeadCount", { n: formatNumber(heads.length, 0) })}>
      {heads.length ? project.heads.map((head, index) => head.zone === zone.id && <HeadLayerRow key={head.id} head={head}
        number={index + 1} zone={zone} selected={selectedIds.includes(head.id)} units={units} locale={locale}/>)
        : <p className="mobile-empty">{t("zoneIsEmpty")}</p>}
    </div>
  </IrrigationLayerRow>;
}

function ZoneStatistics({ project, zone, units, locale }: { project: Project; zone: Zone; units: UnitPrefs; locale: Locale }) {
  const heads = project.heads.filter(head => head.zone === zone.id);
  const d = drawingForEditing(project);
  const faces = Object.values(d.faces).filter(face => heads.some(head => headInsideFace(d, face.id, head)));
  const area = faces.length && faces.every(face => !project.heads.some(head => head.zone !== zone.id && headInsideFace(d, face.id, head)))
    ? faces.reduce((sum, face) => sum + faceArea(d, face.id), 0) : 0;
  const footprint = faces[0] ? facePoints(d, faces[0].id) : lawnPolygon(project.polygons);
  const coverage = footprint && footprint.length >= 3 ? coverageStats(footprint, heads, 0.7, exclusionPolygons(project.polygons)) : null;
  const q = zoneFlow(heads, zone.id);
  const t = (key: string) => tr(locale, key);
  return <div className="zone-statistics">
    <dl className="irrigation-layer-stats">
      <div><dt>{t("area")}</dt><dd>{area > 0 ? formatAreaU(area, units.area) : "—"}</dd></div>
      <div><dt>{t("coverage1")}</dt><dd>{coverage ? `${formatNumber(coverage.cover1, 1)}%` : "—"}</dd></div>
      <div><dt>{t("coverage2")}</dt><dd>{coverage ? `${formatNumber(coverage.cover2, 1)}%` : "—"}</dd></div>
    </dl>
    {area > 0 && q != null && <p>{tr(locale, "areaPrecipEstimate", { rate: formatPrecipitation(totalAreaPrecip(q, area), units) })}</p>}
  </div>;
}

export function ZoneList() {
  const project = useProject(state => state.project);
  const focus = useProject(state => state.zoneFocus);
  const activeId = focus?.projectId === project.id ? focus.zoneId : null;
  const selectedIds = focus?.projectId === project.id && focus.headId ? [focus.headId] : [];
  const units = useProject(state => state.units);
  const locale = useProject(state => state.locale);
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    if (focus?.projectId === project.id && focus.headId) setOpenId(focus.zoneId);
  }, [focus?.projectId, focus?.zoneId, focus?.headId, project.id]);
  const { askDelete, dialog } = useZoneDeletion();
  return <ZoneDragProvider><div className="zone-list">
    <div className="zone-list-heading">
      <p>{tr(locale, "zonesTitle")}</p>
    </div>
    <div className="mobile-layers-list zone-layer-list">
      {project.zones.map(zone => <ZoneDropTarget key={zone.id} id={zone.id}><ZoneLayerRow project={project} zone={zone} open={openId === zone.id}
        active={zone.id === activeId} selectedIds={selectedIds} units={units} locale={locale}
        onToggle={() => { useProject.getState().focusZone(zone.id); setOpenId(openId === zone.id ? null : zone.id); }}
        onDelete={button => askDelete(zone.id, button)}/></ZoneDropTarget>)}
      {!project.zones.length && <p className="mobile-empty">{tr(locale, "noZones")}</p>}
    </div>
    <div className="zone-list-footer">
      <button type="button" className="irrigation-zone-action zone-add-button" aria-label={tr(locale, "addZone")}
        title={tr(locale, "addZone")} onClick={() => useProject.getState().addZone()}><Plus size={15}/><span>{tr(locale, "addZone")}</span></button>
    </div>
    {dialog}
  </div></ZoneDragProvider>;
}
