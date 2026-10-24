import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { LOCALES, tr } from "@/lib/i18n";
import { THEME_IDS, UI_SIZES, themePreview, type ThemeId } from "@/lib/theme";
import { Check } from "lucide-react";
import { AREA_OPTS, FLOW_OPTS, LENGTH_OPTS, PIPE_OPTS, PRESSURE_OPTS } from "@/lib/units";
import { useProject } from "@/lib/project-store";
import { Button } from "@/components/ui/button";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className="settings-choice">{children}</button>;
}

function ThemeCard({ id, active, label, onClick }: { id: ThemeId; active: boolean; label: string; onClick: () => void }) {
  const palette = themePreview(id);
  return <button type="button" aria-pressed={active} onClick={onClick} className="theme-card">
    <span className="settings-theme-swatch" aria-hidden="true">
      {[palette.bg, palette.surface, palette.btn].map((color, i) => <span key={i} style={{ background: color }} />)}
    </span>
    <span className="settings-theme-name">{label}<Check aria-hidden="true" style={{ visibility: active ? "visible" : "hidden" }} /></span>
  </button>;
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState("ui");
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal container={typeof document === "undefined" ? undefined : document.querySelector(".app-shell")}>
      <Dialog.Overlay className="settings-overlay" />
      <Dialog.Content className="settings-panel" aria-describedby={undefined}>
        <SettingsTabs tab={tab} onTabChange={setTab} />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function SettingsTabs({ tab, onTabChange }: { tab: string; onTabChange: (tab: string) => void }) {
  const locale = useProject(s => s.locale);
  const themeId = useProject(s => s.themeId);
  const uiSize = useProject(s => s.uiSize);
  const showHints = useProject(s => s.showHints);
  const units = useProject(s => s.units);
  const unitPreset = useProject(s => s.unitPreset);
  const t = (key: string) => tr(locale, key);

  return <>
        <Tabs.Root value={tab} onValueChange={onTabChange} className="settings-tabs">
          <header className="settings-heading">
            <Dialog.Title>{t("appSettings")}</Dialog.Title>
            <Tabs.List className="settings-navigation" aria-label={t("appSettings")}>
              {([["ui", "tabInterface"], ["units", "tabUnits"], ["lang", "tabLocale"]] as const).map(([id, key]) =>
                <Tabs.Trigger key={id} value={id}>{t(key)}</Tabs.Trigger>)}
            </Tabs.List>
          </header>
          <div className="settings-body">
            <Tabs.Content value="ui" className="settings-section">
              <label className="settings-hints">
                <input type="checkbox" checked={showHints} onChange={e => useProject.getState().setShowHints(e.target.checked)} />
                <span>{t("showHints")}</span>
              </label>
              <fieldset>
                <legend>{t("uiSize")}</legend>
                <div className="settings-sizes">
                  {UI_SIZES.map(size => <Chip key={size} active={uiSize === size} onClick={() => useProject.getState().setUiSize(size)}>{size.toUpperCase()}</Chip>)}
                </div>
              </fieldset>
              <fieldset>
                <legend>{t("appearance")}</legend>
                <div className="settings-themes">
                  {THEME_IDS.map(id => <ThemeCard key={id} id={id} active={themeId === id} label={t(`theme_${id}`)} onClick={() => useProject.getState().setThemeId(id)} />)}
                </div>
              </fieldset>
            </Tabs.Content>
            <Tabs.Content value="lang" className="settings-section">
              <div className="settings-languages">
                {LOCALES.map(language => <button key={language.id} type="button" lang={language.id} dir={language.dir}
                  aria-pressed={locale === language.id} className="settings-language"
                  onClick={() => useProject.getState().setLocale(language.id)}>
                  <span>{language.native}</span><Check aria-hidden="true" style={{ visibility: locale === language.id ? "visible" : "hidden" }} />
                </button>)}
              </div>
            </Tabs.Content>
            <Tabs.Content value="units" className="settings-section">
              <fieldset>
                <legend>{t("unitPreset")}</legend>
                <div className="settings-options">
                  <Chip active={unitPreset === "metric"} onClick={() => useProject.getState().setUnitPreset("metric")}>{t("presetMetric")}</Chip>
                  <Chip active={unitPreset === "us"} onClick={() => useProject.getState().setUnitPreset("us")}>{t("presetUs")}</Chip>
                  {unitPreset === "custom" && <span className="settings-custom-unit">{t("presetCustom")}</span>}
                </div>
              </fieldset>
              <p className="settings-note">{t("unitsKeepLanguage")}</p>
              <Row label={t("unitLength")}>{LENGTH_OPTS.map(u => <Chip key={u} active={units.length === u} onClick={() => useProject.getState().patchUnits({ length: u })}>{t(`unit_${u}`)}</Chip>)}</Row>
              <Row label={t("unitArea")}>{AREA_OPTS.map(u => <Chip key={u} active={units.area === u} onClick={() => useProject.getState().patchUnits({ area: u })}>{t(`area_${u}`)}</Chip>)}</Row>
              <Row label={t("unitFlow")}>{FLOW_OPTS.map(u => <Chip key={u} active={units.flow === u} onClick={() => useProject.getState().patchUnits({ flow: u })}>{t(`flow_${u}`)}</Chip>)}</Row>
              <Row label={t("unitPressure")}>{PRESSURE_OPTS.map(u => <Chip key={u} active={units.pressure === u} onClick={() => useProject.getState().patchUnits({ pressure: u })}>{t(`press_${u}`)}</Chip>)}</Row>
              <Row label={t("unitPipe")}>{PIPE_OPTS.map(u => <Chip key={u} active={units.pipe === u} onClick={() => useProject.getState().patchUnits({ pipe: u })}>{t(`pipe_${u}`)}</Chip>)}</Row>
            </Tabs.Content>
          </div>
        </Tabs.Root>
        <footer className="settings-footer"><Dialog.Close asChild><Button>{t("close")}</Button></Dialog.Close></footer>
  </>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <fieldset className="settings-unit-row"><legend>{label}</legend><div className="settings-options">{children}</div></fieldset>;
}
