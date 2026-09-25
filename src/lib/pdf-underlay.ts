import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { portableRaster, type PdfReference } from "./reference-file";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export async function openPdfReference(file: File): Promise<PdfReference> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  return {
    pageCount: doc.numPages,
    dispose: () => doc.destroy(),
    async renderPage(pageNumber) {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) throw new RangeError("pdfPage");
      const page = await doc.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 2800 / Math.max(unscaled.width, unscaled.height, 1));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      return { ...portableRaster(canvas), pageNumber, pageCount: doc.numPages };
    },
  };
}
