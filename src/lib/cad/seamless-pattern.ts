import {evenLawnLighting,isLawnTexture,LAWN_PATTERN_PIXELS} from "./lawn-pattern";
/** Overlap opposite texture edges with a smooth periodic transition.
 * Interior texels retain their size; the overlap shortens only the repeat period.
 */
export function seamlessPixels(source: Uint8ClampedArray, width: number, height: number, overlap = 0.16) {
  const overlapX = Math.max(2, Math.floor(width * overlap));
  const overlapY = Math.max(2, Math.floor(height * overlap));
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
export async function seamlessPattern(image: HTMLImageElement, fill = ""): Promise<HTMLImageElement> {
  const key=image.src+fill;
  const cached = patterns.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 4 || canvas.height < 4) return image;
  try {
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const lawn=isLawnTexture(fill);
    const tile = seamlessPixels(pixels.data, canvas.width, canvas.height,lawn?.5:.16);
    canvas.width = tile.width; canvas.height = tile.height;
    const output = context.createImageData(tile.width, tile.height);
    output.data.set(lawn?evenLawnLighting(tile.data,tile.width,tile.height):tile.data);
    context.putImageData(output, 0, 0);
    let material=canvas;
    if(lawn){
      material=document.createElement("canvas");material.width=material.height=LAWN_PATTERN_PIXELS;
      const paint=material.getContext("2d")!;
      const repeats=fill==='texture:lawn-striped'?4:1,size=LAWN_PATTERN_PIXELS/repeats;
      for(let y=0;y<repeats;y++)for(let x=0;x<repeats;x++)paint.drawImage(canvas,x*size,y*size,size,size);
      if(repeats>1){
        // Two 2 m mowing lanes. The fine grass itself keeps the same physical size.
        const gradient=paint.createLinearGradient(0,0,LAWN_PATTERN_PIXELS,0);
        for(const [at,alpha] of [[0,.06],[.01,.12],[.49,.12],[.51,0],[.99,0],[1,.06]])gradient.addColorStop(at,`rgba(221,239,153,${alpha})`);
        paint.fillStyle=gradient;paint.fillRect(0,0,LAWN_PATTERN_PIXELS,LAWN_PATTERN_PIXELS);
      }
    }
    const ready = new Promise<HTMLImageElement>(resolve => {
      const prepared = new Image();
      prepared.onload = () => resolve(prepared);
      prepared.onerror = () => resolve(image);
      prepared.src = material.toDataURL("image/png");
    });
    patterns.set(key, ready);
    return ready;
  } catch {
    // Keep a usable material if a legacy external source disallows pixel access.
    return image;
  }
}
