import { hintLabel } from "./drawing-guidance-model";
import { useState, type ReactNode } from "react";
import { LOCALES, tr } from "@/lib/i18n";
import { THEME_IDS, UI_SIZES, themePreview, type ThemeId } from "@/lib/theme";
import { Check } from "lucide-react";
import {
  AREA_OPTS,
  FLOW_OPTS,
  LENGTH_OPTS,
  PIPE_OPTS,
  PRESSURE_OPTS,
} from "@/lib/units";
import { useProject } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function useT() {
  const locale = useProject((s) => s.locale);
  return (key: string) => tr(locale, key);
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-8 h-auto min-w-0 items-center rounded-sm px-2 py-1 text-xs font-medium",
        active ? "bg-btn text-btn-fg" : "bg-bg-2 text-ink hover:bg-btn-soft",
      )}
    >
      {children}
    </button>
  );
}

function ThemeCard({
  id,
  active,
  label,
  onClick,
}: {
  id: ThemeId;
  active: boolean;
  label: string;
  onClick?: () => void;
}) {
  const palette = themePreview(id);
  return (
    <button type="button" aria-pressed={active} aria-label={label} onClick={onClick}
      className={cn("theme-card min-w-0 rounded-md border p-2 text-left",
        active ? "border-btn ring-1 ring-btn bg-btn-soft" : "border-line bg-surface hover:bg-bg-2")}>
      <span className="mb-1 flex h-4 overflow-hidden rounded-sm border border-line" aria-hidden="true">
        {[palette.bg, palette.surface, palette.btn].map((color, i) => <span key={i} className="flex-1" style={{ background: color }} />)}
      </span>
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
        {label}{active && <Check className="size-4 shrink-0" aria-hidden="true" />}
      </span>
    </button>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<"ui" | "lang" | "units">("ui");
  const locale = useProject((s) => s.locale);
  const themeId = useProject((s) => s.themeId);
  const uiSize = useProject((s) => s.uiSize);
  const showHints = useProject((s) => s.showHints);
  const units = useProject((s) => s.units);
  const unitPreset = useProject((s) => s.unitPreset);
  const numberFormat = useProject((s) => s.numberFormat);

  return (
    <div className="settings-layer absolute inset-0 z-50 grid place-items-center bg-ink/30 p-3 sm:p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={t("appSettings")}
        className="settings-panel flex max-h-[min(92dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-lg bg-surface shadow-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-4 py-3">
          <p className="font-display text-lg">{t("appSettings")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["ui", "tabInterface"],
                ["lang", "tabLocale"],
                ["units", "tabUnits"],
              ] as const
            ).map(([id, key]) => (
              <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
                {t(key)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto touch-pan-y p-4">
          {tab === "ui" && (
            <div className="settings-appearance space-y-2">
              <label className="flex items-center justify-between gap-3 rounded-md border border-line p-3 text-sm">
                {hintLabel(locale)}<input type="checkbox" checked={showHints} onChange={e => useProject.getState().setShowHints(e.target.checked)} />
              </label>
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("uiSize")}</p>
              <div className="grid grid-cols-5 gap-2">
                {UI_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={uiSize === s}
                    onClick={() => useProject.getState().setUiSize(s)}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-sm text-xs font-semibold uppercase",
                      uiSize === s ? "bg-btn text-btn-fg" : "bg-bg-2 text-ink",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-sm font-semibold text-ink">{t("appearance")}</p>
              <div className="grid grid-cols-3 gap-2">
                {THEME_IDS.map((id) => (
                  <ThemeCard
                    key={id}
                    id={id}
                    active={themeId === id}
                    label={t(`theme_${id}`)}
                    onClick={() => useProject.getState().setThemeId(id)}
                  />
                ))}
              </div>
            </div>
          )}
          {tab === "lang" && (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("language")}</p>
              <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                {LOCALES.map((l) => (
                  <Button
                    key={l.id}
                    lang={l.id}
                    dir={l.dir}
                    size="sm"
                    variant={locale === l.id ? "pressed" : "outline"}
                    onClick={() => useProject.getState().setLocale(l.id)}
                  >
                    {l.native}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-muted">{t("unitsFollowLanguage")}</p>
            </div>
          )}
          {tab === "units" && (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("unitPreset")}</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={unitPreset === "metric"} onClick={() => useProject.getState().setUnitPreset("metric")}>
                  {t("presetMetric")}
                </Chip>
                <Chip active={unitPreset === "us"} onClick={() => useProject.getState().setUnitPreset("us")}>
                  {t("presetUs")}
                </Chip>
                {unitPreset === "custom" && (
                  <span className="inline-flex h-8 items-center rounded-sm bg-bg-2 px-2 text-xs text-muted">
                    {t("presetCustom")}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-snug text-muted">{t("unitsKeepLanguage")}</p>
              <label className="block text-sm">{t("numberFormat")}
                <select className="mt-1 w-full rounded-md border border-line bg-surface p-2" value={numberFormat} onChange={e => useProject.getState().setNumberFormat(e.target.value as "auto" | "space-comma" | "comma-dot" | "dot-comma")}>
                  <option value="auto">{t("numberAuto")}</option><option value="space-comma">1 234,56</option><option value="comma-dot">1,234.56</option><option value="dot-comma">1.234,56</option>
                </select>
              </label>
              <Row label={t("unitLength")}>
                {LENGTH_OPTS.map((u) => (
                  <Chip key={u} active={units.length === u} onClick={() => useProject.getState().patchUnits({ length: u })}>
                    {t(`unit_${u}`)}
                  </Chip>
                ))}
              </Row>
              <Row label={t("unitArea")}>
                {AREA_OPTS.map((u) => (
                  <Chip key={u} active={units.area === u} onClick={() => useProject.getState().patchUnits({ area: u })}>
                    {t(`area_${u}`)}
                  </Chip>
                ))}
              </Row>
              <Row label={t("unitFlow")}>
                {FLOW_OPTS.map((u) => (
                  <Chip key={u} active={units.flow === u} onClick={() => useProject.getState().patchUnits({ flow: u })}>
                    {t(`flow_${u}`)}
                  </Chip>
                ))}
              </Row>
              <Row label={t("unitPressure")}>
                {PRESSURE_OPTS.map((u) => (
                  <Chip key={u} active={units.pressure === u} onClick={() => useProject.getState().patchUnits({ pressure: u })}>
                    {t(`press_${u}`)}
                  </Chip>
                ))}
              </Row>
              <Row label={t("unitPipe")}>
                {PIPE_OPTS.map((u) => (
                  <Chip key={u} active={units.pipe === u} onClick={() => useProject.getState().patchUnits({ pipe: u })}>
                    {t(`pipe_${u}`)}
                  </Chip>
                ))}
              </Row>
            </div>
          )}
        </div>
        <div className="border-t border-line p-3">
          <Button className="w-full" size="sm" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
