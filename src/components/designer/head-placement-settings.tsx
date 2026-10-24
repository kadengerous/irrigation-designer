import { formatPressureU } from "@/lib/units";
import { useProject } from "@/lib/project-store";
import type { Head } from "@/lib/project-types";
import { bodiesFor, bodyForHead, defaultBodyFor, recommendedBodyFor, manufacturerName, isMp, mountingKind, nozzleTablePressure, type CatalogItem } from "@/lib/equipment-catalog";
import { tr } from "@/lib/i18n";
import { BodyOptions, bodyLabel, popUpLabel } from "./body-options";

export function HeadPlacementSettings({ head, item }: { head: Head; item: CatalogItem }) {
  const project = useProject(s => s.project);
  const units = useProject(s => s.units);
  const locale = useProject(s => s.locale);
  const t = (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const featureLabel=(feature:string)=>{const key=`bodyFeature${feature}`,label=t(key);return label===key?feature:label;};
  const zone = project.zones.find(z => z.id === head.zone);
  const locked = head.locked || !!zone?.locked;
  const bodies = bodiesFor(item);
  const recommendedId = defaultBodyFor(item);
  const body = bodyForHead(item, head.bodyId, head.popUpMm, head.bodySnapshot);
  const recommended = recommendedBodyFor(item, body?.popUpMm);
  const bodyId = body?.id ?? head.bodyId ?? recommendedId;
  const mount = mountingKind(item);
  const rotorOptions = item.popUpOptions ?? [];
  const rotorHeight = head.popUpMm ?? item.popUpMm;
  const source = body?.sourceUrl ?? item.mountingSourceUrl ?? item.sourceUrl;
  return <div className="head-placement-settings">
    <section aria-label={t(mount === "riser" ? "bodyMounting" : "rotorBody")}>
      {mount!=="integrated" && <p className="head-placement-label">{t(mount === "riser" ? "bodyMounting" : "rotorBody")}</p>}
      {mount === "integrated" ? <>
        <label className="head-placement-label">{t("bodyPopUp")}
          {rotorOptions.length ? <select aria-label={t("bodyPopUp")} value={rotorHeight ?? ""} disabled={locked}
            onChange={e => useProject.getState().updateHead(head.id, { popUpMm: Number(e.target.value) })}>
            {!rotorOptions.some(option => option.mm === rotorHeight) && <option value={rotorHeight ?? ""} disabled>
              {popUpLabel(rotorHeight, locale)} · {t("bodyNeedsReview")}
            </option>}
            {rotorOptions.map(option => <option key={option.mm} value={option.mm}>{popUpLabel(option.mm, locale)} · {option.sku}</option>)}
          </select> : <p className="head-placement-hint">{rotorHeight==null?t("bodyUnverifiedHeight"):popUpLabel(rotorHeight,locale)}</p>}
        </label>
        <p className="head-placement-hint"><a href={source} target="_blank" rel="noreferrer">{manufacturerName(item)} · {item.modelId??item.id}</a></p>
      </> : mount === "riser" ? <p className="head-placement-hint">{t("bodyDirectRiser")}</p> : <>
        <p className="head-placement-hint head-body-hint">{t("recommendedBody")} — {recommended ?
          <a href={recommended.sourceUrl} target="_blank" rel="noreferrer">{bodyLabel(recommended, locale)}</a> : t("noData")}</p>
        <label className="head-placement-label">
          <select aria-label={t("body")} value={bodyId} disabled={locked || !bodies.length} onChange={e => {
            useProject.getState().updateHead(head.id, { bodyId: e.target.value });
          }}>
            {!body && <option value={bodyId} disabled>{head.bodyId} · {popUpLabel(head.popUpMm, locale)} · {t("bodyNeedsReview")}</option>}
            <BodyOptions bodies={bodies} locale={locale} recommendedFamily={recommendedId}/>
          </select>
        </label>
        {body && <>
          <p className="head-placement-hint"><a href={source} target="_blank" rel="noreferrer">{body.sku}</a>{" · "}
            {body.regulatedPressureBar == null ? t("bodyUnregulated") : formatPressureU(nozzleTablePressure(item,body.regulatedPressureBar), units.pressure)}
          </p>
          {isMp(item) && body.bodyFamilyId === "PRS30" && <p className="head-placement-hint">{t("bodyMpMinimumRadius", { pressure: formatPressureU(2.1, units.pressure) })}</p>}
          {!isMp(item) && item.type !== "bubbler" && body.bodyFamilyId === "PRS40" && <p className="head-placement-hint">{t("bodySprayPrs40", { pressure: formatPressureU(2.8, units.pressure) })}</p>}
          {!!body.bodyFeatures?.length && <p className="head-placement-hint">{body.bodyFeatures.map(featureLabel).join(" · ")}</p>}
        </>}
      </>}
      {!!item.unverifiedBodyFeatures?.length&&<p className="head-placement-hint">{item.unverifiedBodyFeatures.map(featureLabel).join(' · ')} · {t('equipment.needsReview')}</p>}
    </section>
  </div>;
}
