import { useState } from "react";
import { Layers2, Trash2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";

export function HeadSelectionActions() {
  const locale = useProject(s => s.locale);
  const t = (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const project = useProject(s => s.project);
  const ids = useProject(s => s.selectedIds);
  const activeZone = useProject(s => s.activeZoneId);
  const [choice, setChoice] = useState<number | null>(null);
  const heads = project.heads.filter(h => ids.includes(h.id));
  const zoneId = project.zones.some(z => z.id === choice) ? choice! : activeZone;
  const locked = heads.some(h => h.locked || project.zones.some(z => z.id === h.zone && z.locked));
  if (!heads.length) return null;
  return <section className="head-selection-actions" role="region" aria-label={t("selectedSprinklers", { n: heads.length })}
    onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <span className="head-selection-count">{t("selectedSprinklers", { n: heads.length })}</span>
    <select aria-label={t("chooseZone")} value={zoneId} onChange={e => setChoice(Number(e.target.value))}>
      {project.zones.map(z => <option key={z.id} value={z.id} disabled={z.locked}>{z.name}</option>)}
    </select>
    <button type="button" disabled={locked || !project.zones.some(z => z.id === zoneId && !z.locked)} onClick={() => useProject.getState().assignSelectedToZone(zoneId)}>
      <Layers2 size={18}/>{t("assignSprinklers")}
    </button>
    <button type="button" className="head-selection-delete" disabled={locked} aria-label={t("delete")} title={t("delete")}
      onClick={() => useProject.getState().deleteSelected()}><Trash2 size={18}/>{t("delete")}</button>
  </section>;
}
