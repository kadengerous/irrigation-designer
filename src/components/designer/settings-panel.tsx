import { useState, type ReactNode } from "react";
import { LOCALES, tr } from "@/lib/i18n";
import { THEME_IDS, UI_SIZES, themeSwatch } from "@/lib/theme";
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
      className={cn(
        "inline-flex h-8 items-center rounded-sm px-2 text-xs font-medium",
        active ? "bg-btn text-btn-fg" : "bg-bg-2 text-ink hover:bg-btn-soft",
      )}
    >
      {children}
    </button>
  );
}

function Swatch({
  color,
  active,
  label,
  onClick,
}: {
  color?: string;
  active: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-12 flex-col items-center gap-1">
      <span
        className={cn("size-7 rounded-full border border-black/10", active && "ring-2 ring-btn ring-offset-2 ring-offset-surface")}
        style={{ background: color }}
      />
      <span className={cn("truncate text-[10px] leading-tight", active ? "font-semibold text-ink" : "text-muted")}>{label}</span>
    </button>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<"ui" | "lang" | "units">("ui");
  const locale = useProject((s) => s.locale);
  const themeId = useProject((s) => s.themeId);
  const uiSize = useProject((s) => s.uiSize);
  const units = useProject((s) => s.units);
  const unitPreset = useProject((s) => s.unitPreset);

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-ink/30 p-3 sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[min(92dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-lg bg-surface shadow-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-4 py-3">
          <p className="font-display text-lg">{t("appSettings")}</p>
          <div className="mt-2 flex gap-1">
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
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "ui" && (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("uiSize")}</p>
              <div className="grid grid-cols-5 gap-1">
                {UI_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => useProject.getState().setUiSize(s)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-sm text-xs font-semibold uppercase",
                      uiSize === s ? "bg-btn text-btn-fg" : "bg-bg-2 text-ink",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("colorTheme")}</p>
              <div className="flex flex-wrap gap-x-2 gap-y-3">
                {THEME_IDS.map((id) => (
                  <Swatch
                    key={id}
                    color={themeSwatch(id)}
                    active={themeId === id}
                    label={t(`th_${id}`)}
                    onClick={() => useProject.getState().setThemeId(id)}
                  />
                ))}
              </div>
            </div>
          )}
          {tab === "lang" && (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">{t("language")}</p>
              <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto">
                {LOCALES.map((l) => (
                  <Button
                    key={l.id}
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
              <div className="flex flex-wrap gap-1">
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
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}
