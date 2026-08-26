export const THEME_IDS = [
  "irrigation",
  "lawn",
  "water",
  "mist",
  "sand",
  "clay",
  "berry",
  "dusk",
  "night",
  "graphite",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Kept for persisted settings; buttons always follow the selected theme. */
export const BUTTON_IDS = ["theme", "blue", "green", "clay", "gold", "berry", "graphite", "custom"] as const;
export type ButtonStyle = (typeof BUTTON_IDS)[number];

export const UI_SIZES = ["xs", "s", "m", "l", "xl"] as const;
export type UiSize = (typeof UI_SIZES)[number];

const THEME_ALIAS: Record<string, ThemeId> = {
  blue: "irrigation",
  green: "lawn",
  light: "mist",
  dark: "night",
  night: "night",
  neutral: "mist",
  custom: "irrigation",
  ocean: "water",
  forest: "lawn",
  slate: "graphite",
};

export function parseThemeId(v: unknown): ThemeId {
  if (THEME_IDS.includes(v as ThemeId)) return v as ThemeId;
  if (typeof v === "string" && THEME_ALIAS[v]) return THEME_ALIAS[v]!;
  return "irrigation";
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
  return luma(bg) > 155 ? "#1b1f24" : "#f4fbff";
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
  irrigation: { dark: false, bg: "#eaf3f0", surface: "#ffffff", ink: "#1a2422", tool: "#0b6e62", btn: "#0b6e62" },
  lawn: { dark: false, bg: "#eef4ee", surface: "#ffffff", ink: "#1b241d", tool: "#2a6b3c", btn: "#2a6b3c" },
  water: { dark: false, bg: "#eef3f7", surface: "#ffffff", ink: "#1b1f24", tool: "#1a6fa3", btn: "#1a6fa3" },
  mist: { dark: false, bg: "#f2f3f5", surface: "#ffffff", ink: "#22262b", tool: "#3d5568", btn: "#2f4d61" },
  sand: { dark: false, bg: "#f6f1e8", surface: "#fffaf2", ink: "#2a241c", tool: "#8a6230", btn: "#8a6230" },
  clay: { dark: false, bg: "#f7f0eb", surface: "#fff8f4", ink: "#2a1f1b", tool: "#b45a32", btn: "#b45a32" },
  berry: { dark: false, bg: "#f6f0f4", surface: "#fff7fb", ink: "#241b22", tool: "#7a3e6e", btn: "#7a3e6e" },
  dusk: { dark: true, bg: "#152028", surface: "#1c2a34", ink: "#e8f4f2", tool: "#7ec8f2", btn: "#7ec8f2" },
  night: { dark: true, bg: "#101318", surface: "#1a1f27", ink: "#e8edf2", tool: "#7ec8f2", btn: "#7ec8f2" },
  graphite: { dark: true, bg: "#181b1f", surface: "#23272d", ink: "#e6eaee", tool: "#7ec8f2", btn: "#7ec8f2" },
};

function buildVars(base: ThemeBase): Vars {
  const dark = base.dark;
  const bg = base.bg;
  const surface = base.surface;
  const ink = base.ink;
  const header = dark ? base.btn : base.tool;
  const button = base.btn;
  const bg2 = mix(bg, header, dark ? 0.12 : 0.08);
  const surface2 = mix(surface, header, dark ? 0.1 : 0.04);
  const fg = fgOn(header);
  const btnFg = fgOn(button);
  return {
    "--color-bg": bg,
    "--color-bg-2": bg2,
    "--color-surface": surface,
    "--color-surface-2": surface2,
    "--color-ink": ink,
    "--color-ink-soft": mix(ink, bg, 0.28),
    "--color-muted": mix(ink, bg, 0.45),
    "--color-faint": mix(ink, bg, 0.58),
    "--color-line": dark ? mix(surface, "#ffffff", 0.12) : mix(bg, "#1b1f24", 0.14),
    "--color-line-strong": dark ? mix(surface, "#ffffff", 0.2) : mix(bg, "#1b1f24", 0.22),
    "--color-tool": header,
    "--color-tool-fg": fg,
    "--color-tool-on": mix(header, "#ffffff", dark ? 0.22 : 0.28),
    "--color-tool-soft": mix(surface, header, dark ? 0.3 : 0.18),
    "--color-tool-2": mix(header, dark ? "#0e1216" : "#ffffff", 0.35),
    "--color-tool-ring": `rgb(${hexToRgb(header).join(" ")} / 40%)`,
    "--color-catalog": mix(header, dark ? button : "#1b1f24", dark ? 0.25 : 0.12),
    "--color-catalog-fg": fgOn(mix(header, "#000000", 0.08)),
    "--color-catalog-soft": mix(surface, header, 0.16),
    "--color-btn": button,
    "--color-btn-fg": btnFg,
    "--color-btn-soft": mix(surface, button, dark ? 0.35 : 0.18),
    "--color-btn-ring": `rgb(${hexToRgb(button).join(" ")} / 45%)`,
    "--header-bg": header,
    "--header-to": header,
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
