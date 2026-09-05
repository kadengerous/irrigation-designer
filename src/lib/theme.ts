export const THEME_IDS = [
  "crystal",
  "pearl",
  "sage",
  "ice",
  "sand",
  "matte",
  "graphite",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Kept for persisted settings; buttons always follow the selected theme. */
export const BUTTON_IDS = ["theme", "blue", "green", "clay", "gold", "berry", "graphite", "custom"] as const;
export type ButtonStyle = (typeof BUTTON_IDS)[number];

export const UI_SIZES = ["xs", "s", "m", "l", "xl"] as const;
export type UiSize = (typeof UI_SIZES)[number];

const THEME_ALIAS: Record<string, ThemeId> = {
  irrigation: "crystal", lawn: "sage", water: "ice", mist: "pearl",
  clay: "sand", berry: "pearl", dusk: "graphite",
  blue: "pearl",
  green: "sage",
  light: "pearl",
  dark: "graphite",
  night: "graphite",
  neutral: "matte",
  custom: "crystal",
  ocean: "ice",
  forest: "sage",
  slate: "graphite",
};

export function parseThemeId(v: unknown): ThemeId {
  if (THEME_IDS.includes(v as ThemeId)) return v as ThemeId;
  if (typeof v === "string" && THEME_ALIAS[v]) return THEME_ALIAS[v]!;
  return "crystal";
}

export function parseButtonStyle(v: unknown): ButtonStyle {
  return BUTTON_IDS.includes(v as ButtonStyle) ? (v as ButtonStyle) : "theme";
}

export function parseAccent(v: unknown): string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : "#0b6e62";
}

export function parseUiSize(v: unknown): UiSize {
  return UI_SIZES.includes(v as UiSize) ? (v as UiSize) : "m";
}

type Vars = Record<string, string>;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function luma(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function fgOn(bg: string): string {
  const [r, g, b] = hexToRgb(bg).map((c) => c / 255).map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#000000" : "#ffffff";
}

type ThemeBase = {
  dark: boolean;
  bg: string;
  surface: string;
  ink: string;
  tool: string;
  btn: string;
};

const THEMES: Record<ThemeId, ThemeBase> = {
  crystal: { dark: false, bg: "#F8FBFC", surface: "#FFFFFF", ink: "#202C30", tool: "#0A7C66", btn: "#0A7C66" },
  pearl: { dark: false, bg: "#F7F9FB", surface: "#FFFFFF", ink: "#202A35", tool: "#0A84FF", btn: "#0A84FF" },
  sage: { dark: false, bg: "#F5F8F5", surface: "#F3F7F4", ink: "#263730", tool: "#52796F", btn: "#52796F" },
  ice: { dark: false, bg: "#F4F9FC", surface: "#F2F8FC", ink: "#253442", tool: "#3A7CA5", btn: "#3A7CA5" },
  sand: { dark: false, bg: "#FBF8F2", surface: "#FAF6EE", ink: "#362F24", tool: "#756B55", btn: "#756B55" },
  matte: { dark: false, bg: "#F5FAF8", surface: "#F0F8F5", ink: "#22352F", tool: "#167564", btn: "#167564" },
  graphite: { dark: true, bg: "#172126", surface: "#202B2F", ink: "#EFF8F5", tool: "#62D6B1", btn: "#62D6B1" },
};

export const THEME_NAMES: Record<ThemeId, string> = {
  crystal: "Кристалл", pearl: "Жемчуг", sage: "Шалфей", ice: "Лёд",
  sand: "Песок", matte: "Матовый", graphite: "Графит",
};

/** Render-only values: never write these into project geometry or object colours. */
export function canvasTheme(id: ThemeId) {
  const t = THEMES[parseThemeId(id)];
  return { bg: t.bg, ink: t.ink, accent: t.btn, surface: t.surface,
    minor: mix(t.bg, t.ink, 0.09), major: mix(t.bg, t.ink, 0.18),
    axis: mix(t.bg, t.ink, 0.34), handleOutline: t.dark ? "#EFF8F5" : "#FFFFFF" };
}

function buildVars(base: ThemeBase): Vars {
  const dark = base.dark;
  const bg = base.bg;
  const surface = base.surface;
  const ink = base.ink;
  const header = dark ? base.btn : base.tool;
  const button = base.btn;
  const bg2 = mix(bg, header, dark ? 0.12 : 0.08);
  const surface2 = mix(surface, header, dark ? 0.1 : 0.04);
  const btnFg = fgOn(button);
  return {
    "--color-bg": bg,
    "--color-bg-2": bg2,
    "--color-surface": surface,
    "--color-surface-2": surface2,
    "--color-ink": ink,
    "--color-ink-soft": mix(ink, bg, 0.28),
    "--color-muted": mix(ink, bg, 0.25),
    "--color-faint": mix(ink, bg, 0.28),
    "--color-line": dark ? mix(surface, "#ffffff", 0.12) : mix(bg, "#1b1f24", 0.14),
    "--color-line-strong": dark ? mix(surface, "#ffffff", 0.2) : mix(bg, "#1b1f24", 0.22),
    "--color-tool": surface,
    "--color-tool-fg": ink,
    "--color-tool-on": mix(surface, button, 0.16),
    "--color-tool-soft": mix(surface, header, dark ? 0.3 : 0.18),
    "--color-tool-2": mix(header, dark ? "#0e1216" : "#ffffff", 0.35),
    "--color-tool-ring": `rgb(${hexToRgb(header).join(" ")} / 40%)`,
    "--color-catalog": button,
    "--color-catalog-fg": btnFg,
    "--color-catalog-soft": mix(surface, header, 0.16),
    "--color-btn": button,
    "--color-btn-fg": btnFg,
    "--color-btn-soft": mix(surface, button, dark ? 0.35 : 0.18),
    "--color-btn-ring": `rgb(${hexToRgb(button).join(" ")} / 45%)`,
    "--header-bg": surface,
    "--header-to": surface,
    "--panel-glass": `rgb(${hexToRgb(surface).join(" ")} / 88%)`,
    "--panel-shadow": dark ? "0 6px 24px #00000030" : "0 6px 24px #2035300c",
    "--color-warn": dark ? "#F3C27D" : "#82521D",
    "--color-danger": dark ? "#FFAAAA" : "#9B3A2F",
    "--color-ok": dark ? "#87D9AE" : "#2F6B45",
  };
}

export function gradientMate(from: string): string {
  const hex = parseAccent(from);
  return luma(hex) > 140 ? mix(hex, "#16324a", 0.55) : mix(hex, "#d6f0ff", 0.5);
}

export function themeVars(
  themeId: ThemeId,
  _buttonStyle?: ButtonStyle,
  _accent?: string,
  _themeAccent?: string,
  _gradient?: boolean,
  _themeAccent2?: string,
): Vars {
  return buildVars(THEMES[parseThemeId(themeId)]);
}

export function applyTheme(
  themeId: ThemeId,
  _buttonStyle?: ButtonStyle,
  _accent?: string,
  _themeAccent?: string,
  _gradient?: boolean,
  _themeAccent2?: string,
) {
  const id = parseThemeId(themeId);
  const base = THEMES[id];
  const vars = buildVars(base);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = base.dark ? "dark" : "light";
  root.dataset.appearance = id;
  root.style.colorScheme = base.dark ? "dark" : "light";
  root.style.setProperty("--panel-glass", `rgb(${hexToRgb(base.surface).join(" ")} / ${id === "crystal" ? 76 : id === "matte" ? 98 : 92}%)`);
}

export function resolveButton(themeId: ThemeId, _buttonStyle?: ButtonStyle, _accent?: string, _themeAccent?: string): string {
  return THEMES[parseThemeId(themeId)].btn;
}

export function themeSwatch(id: ThemeId): string {
  const t = THEMES[parseThemeId(id)];
  return t.dark ? t.btn : t.tool;
}

export function themePreview(id: ThemeId, _themeAccent = "#0b6e62"): { bg: string; surface: string; tool: string; ink: string; btn: string } {
  const t = THEMES[parseThemeId(id)];
  return { bg: t.bg, surface: t.surface, tool: t.tool, ink: t.ink, btn: t.btn };
}

export function buttonPreview(id: ButtonStyle, themeId: ThemeId, _accent: string, _themeAccent = "#0b6e62"): string {
  return THEMES[parseThemeId(themeId)].btn;
}

/** @deprecated keep name for older imports */
export const PALETTE_IDS = THEME_IDS;
export type PaletteId = ThemeId;
export function parsePaletteId(v: unknown): ThemeId {
  return parseThemeId(v);
}
export function paletteVars(id: PaletteId, accent: string) {
  return themeVars(parseThemeId(id), "theme", accent);
}
export function palettePreview(id: PaletteId, accent: string) {
  const v = paletteVars(id, accent);
  return { bg: v["--color-bg"] ?? "#eaf3f0", tool: v["--color-tool"] ?? accent };
}
export function applyPalette(id: PaletteId, accent: string) {
  applyTheme(parseThemeId(id), "theme", accent);
}
