const CANDIDATES = [
  "/catalog/_irrigation-designer-source.zip",
  "/downloads/irrigation-designer-source.zip",
  "/source.zip",
];

function saveBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "irrigation-designer-source.zip";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function fetchZip(url: string, onProgress: (pct: number) => void): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store" });
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!res.ok || type.includes("text/html") || type.includes("text/javascript")) {
    throw new Error(`bad ${url}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body) return res.blob();
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)));
  }
  onProgress(100);
  return new Blob(chunks, { type: "application/zip" });
}

export async function downloadSourceZip(onProgress: (pct: number) => void): Promise<void> {
  let lastErr: unknown;
  for (const url of CANDIDATES) {
    try {
      const blob = await fetchZip(url, onProgress);
      if (blob.size < 10_000) throw new Error("too small");
      saveBlob(blob);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("download failed");
}
