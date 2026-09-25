import type { jsPDF } from "jspdf";
import { activeLocale } from "./i18n";
import { localeDirection } from "./locale-config";

/** Browser shaping and fonts cover all scripts, including Arabic joining and Hebrew. */
export function pdfText(doc: jsPDF, value: string, x: number, y: number, options: {
  width?: number; size?: number; color?: string; bold?: boolean; align?: "left" | "right"; background?: string;
} = {}): number {
  const ratio = 4, ptToMm = 25.4 / 72, size = options.size ?? 10;
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")!;
  const rtl = localeDirection(activeLocale()) === "rtl";
  const font = `${options.bold ? "600" : "400"} ${size * ratio}px system-ui, "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans CJK JP", "DejaVu Sans", "Yu Gothic", "Microsoft YaHei", Arial, sans-serif`;
  ctx.font = font;
  const max = (options.width ?? 180) / ptToMm * ratio;
  const lines: string[] = [];
  for (const paragraph of value.split("\n")) {
    let line = "";
    const segments = typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(activeLocale(), { granularity: "word" }).segment(paragraph)
      : paragraph.split(/(\s+)/).map(segment => ({ segment }));
    for (const { segment } of segments) {
      if (line && ctx.measureText(line + segment).width > max) { lines.push(line.trimEnd()); line = ""; }
      // Split only words that cannot fit on a whole line; preserve Arabic joining otherwise.
      if (ctx.measureText(segment).width > max) {
        const glyphs = typeof Intl.Segmenter === "function"
          ? new Intl.Segmenter(activeLocale(), { granularity: "grapheme" }).segment(segment)
          : Array.from(segment, glyph => ({ segment: glyph }));
        for (const { segment: glyph } of glyphs) {
          if (line && ctx.measureText(line + glyph).width > max) { lines.push(line); line = ""; }
          line += glyph;
        }
      } else line += line ? segment : segment.trimStart();
    }
    lines.push(line);
  }
  const lineHeight = size * 1.4 * ratio;
  canvas.width = Math.max(1, Math.ceil(Math.min(max, Math.max(...lines.map(line => ctx.measureText(line).width))) + ratio * 2));
  canvas.height = Math.ceil(lines.length * lineHeight + ratio * 2);
  ctx.font = font; ctx.textBaseline = "top";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  if (options.background) { ctx.fillStyle = options.background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.fillStyle = options.color ?? "#1c1b17";
  lines.forEach((line, i) => ctx.fillText(line, rtl ? canvas.width - ratio : ratio, i * lineHeight + ratio));
  const width = canvas.width / ratio * ptToMm, height = canvas.height / ratio * ptToMm;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", options.align === "right" ? x - width : x, y, width, height);
  return height;
}
