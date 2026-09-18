/** Overlap opposite texture edges with a smooth periodic transition.
 * Interior texels retain their size; the overlap shortens only the repeat period.
 */
export function seamlessPixels(source: Uint8ClampedArray, width: number, height: number) {
  const overlapX = Math.max(2, Math.floor(width * 0.16));
  const overlapY = Math.max(2, Math.floor(height * 0.16));
  const w = width - overlapX, h = height - overlapY;
  if (w < overlapX || h < overlapY) return { data: source.slice(), width, height };
  const data = new Uint8ClampedArray(w * h * 4);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  for (let y = 0; y < h; y++) {
    const wy = y < overlapY ? smooth(y / overlapY) : 1;
    const y2 = y < overlapY ? y + h : y;
    for (let x = 0; x < w; x++) {
      const wx = x < overlapX ? smooth(x / overlapX) : 1;
      const x2 = x < overlapX ? x + w : x;
      const a = (y * width + x) * 4, b = (y * width + x2) * 4;
      const c = (y2 * width + x) * 4, d = (y2 * width + x2) * 4;
      const out = (y * w + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        data[out + channel] = (source[a + channel]! * wx + source[b + channel]! * (1 - wx)) * wy
          + (source[c + channel]! * wx + source[d + channel]! * (1 - wx)) * (1 - wy);
      }
    }
  }
  return { data, width: w, height: h };
}

// Share prepared patterns between the editor and project preview.
const patterns = new Map<string, Promise<HTMLImageElement>>();
export async function seamlessPattern(image: HTMLImageElement): Promise<HTMLImageElement> {
  const cached = patterns.get(image.src);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 4 || canvas.height < 4) return image;
  try {
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const tile = seamlessPixels(pixels.data, canvas.width, canvas.height);
    canvas.width = tile.width; canvas.height = tile.height;
    const output = context.createImageData(tile.width, tile.height);
    output.data.set(tile.data);
    context.putImageData(output, 0, 0);
    const ready = new Promise<HTMLImageElement>(resolve => {
      const prepared = new Image();
      prepared.onload = () => resolve(prepared);
      prepared.onerror = () => resolve(image);
      prepared.src = canvas.toDataURL("image/png");
    });
    patterns.set(image.src, ready);
    return ready;
  } catch {
    // Keep a usable material if a legacy external source disallows pixel access.
    return image;
  }
}
