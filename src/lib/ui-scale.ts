import { parseUiSize, type UiSize } from "./theme";

/** UI dimensions use rem. Canvas coordinates and pxPerMeter stay in CSS pixels. */
export const UI_SCALE: Record<UiSize, number> = { xs: .9, s: .95, m: 1, l: 1.1, xl: 1.2 };

export function applyUiSize(size: UiSize) {
  const value = parseUiSize(size);
  const root = document.documentElement;
  root.dataset.uiSize = value;
  root.style.fontSize = `${UI_SCALE[value] * 100}%`;
  root.style.setProperty("--ui-scale", String(UI_SCALE[value]));
}

/** For UI rectangles positioned in physical viewport pixels (never project geometry). */
export function uiPixels(value: number): number {
  return typeof document === "undefined" ? value : value * (parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1);
}
