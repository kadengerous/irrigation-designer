import { useId } from "react";
import { useProject } from "@/lib/project-store";
import { tr } from "@/lib/i18n";
import { formatPressureU, fromBar, pressureLabel } from "@/lib/units";

/** Select working pressure from the manufacturer checkpoints. */
export function PressureSteps({ values, value, recommended, onChange, labelKey="workingPressure" }: {
  values: number[]; value: number; recommended?: number; onChange: (bar: number) => void; labelKey?:string;
}) {
  const name = useId();
  const locale = useProject(s => s.locale);
  const unit = useProject(s => s.units.pressure);
  const t = (key: string) => tr(locale, key);
  return <fieldset className="pressure-steps">
    <legend>{t(labelKey)} <span className="font-normal">· {pressureLabel(unit)}</span></legend>
    <div className="pressure-step-points">
      {values.map(bar => <label key={bar} className="pressure-step" data-recommended={bar === recommended}>
        <input type="radio" name={name} value={bar} checked={bar === value}
          aria-label={`${formatPressureU(bar, unit)}${bar === recommended ? ` — ${t("pressureRecommended")}` : ""}`}
          onChange={() => onChange(bar)} />
        <span className="pressure-step-value">{fromBar(bar, unit).toLocaleString(locale, { maximumFractionDigits: unit === "kpa" ? 0 : 2 })}</span>
        <span className="pressure-step-dot" aria-hidden="true" />
        {bar === recommended && <span className="pressure-recommended-mark" aria-hidden="true">▴</span>}
      </label>)}
    </div>
    {recommended != null && Number.isFinite(recommended) && values.length > 0 && <p className="pressure-recommended-label">
      {t("pressureRecommended")} · <bdi>{formatPressureU(recommended, unit)}</bdi>
    </p>}
    {!values.length && <p className="text-sm text-muted">{t("noData")}</p>}
  </fieldset>;
}
