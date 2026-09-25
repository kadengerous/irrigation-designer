import { useEffect, useState } from "react";
import { ArrowRightLeft, Layers2, Trash2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";
import { zoneLabel } from '@/lib/project-types';

export function HeadSelectionActions() {
  const locale = useProject(s => s.locale);
  const t = (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const project = useProject(s => s.project);
  const ids = useProject(s => s.selectedIds);
  const [choice, setChoice] = useState<number | null>(null);
  const heads = project.heads.filter(h => ids.includes(h.id));
  const assignments = new Set(heads.map(h => project.zones.some(z=>z.id===h.zone)?h.zone:0));
  const common = assignments.size===1 ? [...assignments][0]! : null;
  const current = common ? project.zones.find(z=>z.id===common) : undefined;
  const currentLabel = current ? zoneLabel(current) : common===0 ? t('noZone') : t('mixedZones');
  const zoneId = project.zones.some(z => z.id === choice) ? choice! : common;
  const selectionKey=[...ids].sort().join('|');
  useEffect(()=>setChoice(null),[selectionKey,project.id]);
  const locked = heads.some(h => h.locked || project.zones.some(z => z.id === h.zone && z.locked));
  const moving = heads.some(h => project.zones.some(z => z.id === h.zone));
  if (heads.length < 2) return null;
  return <section className="head-selection-actions" role="region" aria-label={t("selectedSprinklers", { n: heads.length })}
    onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
    <span className="head-selection-count">{t("selectedSprinklers", { n: heads.length })}</span>
    <span className="head-selection-current" aria-live="polite">{currentLabel}</span>
    <select aria-label={t("chooseZone")} value={zoneId || ''} onChange={e => setChoice(Number(e.target.value))}>
      {!zoneId && <option value="" disabled>{t('chooseZone')}</option>}
      {project.zones.map(z => <option key={z.id} value={z.id} disabled={z.locked}>{zoneLabel(z)}{z.id===common?' ✓':''}</option>)}
    </select>
    <button type="button" className={moving ? "head-selection-zone is-transfer" : "head-selection-zone"} disabled={locked || common===zoneId || !project.zones.some(z => z.id === zoneId && !z.locked)} onClick={() => {if(zoneId)useProject.getState().assignSelectedToZone(zoneId);}}>
      {moving ? <ArrowRightLeft size={18}/> : <Layers2 size={18}/>}{t(moving ? "transferSprinklers" : "assignSprinklers")}
    </button>
    <button type="button" className="head-selection-delete" disabled={locked} aria-label={t("delete")} title={t("delete")}
      onClick={() => useProject.getState().deleteSelected()}><Trash2 size={18}/>{t("delete")}</button>
  </section>;
}
