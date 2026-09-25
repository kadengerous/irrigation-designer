import { text } from "./i18n";

export type RasterPage = { src: string; width: number; height: number; pageNumber?: number; pageCount?: number };
export type PdfReference = { pageCount: number; renderPage: (page: number) => Promise<RasterPage>; dispose: () => Promise<void> };

/** Add importers here without changing the reference panel or stored geometry. */
export const REFERENCE_FORMATS = [
  { id: "pdf", extensions: ["pdf"], mimeTypes: ["application/pdf"] },
  { id: "image", extensions: ["jpg", "jpeg", "png", "webp"], mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
] as const;
export const REFERENCE_ACCEPT = REFERENCE_FORMATS.flatMap(format => format.extensions.map(ext => `.${ext}`)).join(",");

export function referenceFileKind(file: Pick<File, "type" | "name">): "pdf" | "image" | null {
  const ext = file.name.toLowerCase().split(".").at(-1) ?? "";
  return REFERENCE_FORMATS.find(format => (format.extensions as readonly string[]).includes(ext) ||
    (format.mimeTypes as readonly string[]).includes(file.type))?.id ?? null;
}

/** Keep a portable image in project files and device storage; never silently drop it. */
export function portableRaster(canvas: HTMLCanvasElement): RasterPage {
  let quality = .9;
  let src = canvas.toDataURL("image/webp", quality);
  while (src.length > 1_200_000 && (quality > .55 || canvas.width > 1200 || canvas.height > 1200)) {
    if (quality > .55) quality -= .1;
    else {
      const copy = document.createElement("canvas");
      copy.width = Math.round(canvas.width * .8); copy.height = Math.round(canvas.height * .8);
      copy.getContext("2d")!.drawImage(canvas, 0, 0, copy.width, copy.height);
      canvas.width = copy.width; canvas.height = copy.height;
      canvas.getContext("2d")!.drawImage(copy, 0, 0);
    }
    src = canvas.toDataURL("image/webp", quality);
  }
  return { src, width: canvas.width, height: canvas.height };
}

export async function loadImageReference(file: File): Promise<RasterPage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const factor = Math.min(1, 2800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * factor));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(text("referenceLoadError"));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return portableRaster(canvas);
  } finally { URL.revokeObjectURL(url); }
}
