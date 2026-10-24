import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ChevronLeft, ChevronRight, Eye, FileImage, Lock, Unlock, Ruler, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LocalizedNumberInput } from "./localized-number-input";
import { useProject } from "@/lib/project-store";
import { formatNumber, tr } from "@/lib/i18n";
import { localeDirection } from "@/lib/locale-config";
import { loadImageReference, referenceFileKind, type PdfReference, type RasterPage } from "@/lib/reference-file";
import type { Underlay } from "@/lib/project-types";

export function useReferenceImport() {
  const locale = useProject(s => s.locale);
  const projectId = useProject(s => s.project.id);
  const t = (key: string) => tr(locale, key);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{ document: PdfReference; name: string; source: Underlay["source"] } | null>(null);
  const pending = useRef<PdfReference | null>(null), request = useRef(0);
  useEffect(() => { setPdf(null); setBusy(false); return () => { request.current++; void pending.current?.dispose(); pending.current = null; }; }, [projectId]);
  const apply = (page: RasterPage, name: string, source?: Underlay["source"]) => {
    const st = useProject.getState();
    st.setUnderlay({ src: page.src, name, source, width: 20, height: 20 * page.height / page.width,
      x: 0, y: 0, opacity: .5, rotation: 0, locked: false, visible: true,
      pixelWidth: page.width, pixelHeight: page.height, pageNumber: page.pageNumber, pageCount: page.pageCount });
    st.setReferenceOpen(true); st.requestFit();
  };
  const closePdf = () => { setPdf(null); void pending.current?.dispose(); pending.current = null; };
  const importFile = async (file: File) => {
    const kind = referenceFileKind(file);
    if (!kind) { toast.error(t("referenceUnsupported")); return; }
    if (file.size > 64 * 1024 * 1024) { toast.error(t("referenceTooLarge")); return; }
    const token = ++request.current;
    closePdf(); setBusy(true);
    try {
      const data = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
      const source = {name:file.name,mime:file.type,data};
      if (kind === "image") {
        const page = await loadImageReference(file);
        if (request.current === token) apply(page, file.name, source);
      } else {
        const { openPdfReference } = await import("@/lib/pdf-underlay");
        const document = await openPdfReference(file);
        if (request.current !== token) { await document.dispose(); return; }
        if (document.pageCount > 1) { pending.current = document; setPdf({ document, name: file.name, source }); }
        else { try { const page = await document.renderPage(1); if (request.current === token) apply(page, file.name, source); } finally { await document.dispose(); } }
      }
    } catch { if (request.current === token) toast.error(t("referenceLoadError")); }
    finally { if (request.current === token) setBusy(false); }
  };
  return { importFile, busy, picker: pdf ? <PdfPageDialog document={pdf.document} name={pdf.name} onCancel={closePdf}
    onUse={page => { apply(page, pdf.name, pdf.source); closePdf(); }} /> : null };
}

function PdfPageDialog({ document, name, onUse, onCancel }: { document: PdfReference; name: string; onUse: (page: RasterPage) => void; onCancel: () => void }) {
  const locale = useProject(s => s.locale), t = (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const [page, setPage] = useState(1), [image, setImage] = useState<RasterPage | null>(null), [error, setError] = useState(false);
  useEffect(() => {
    let active = true; setImage(null); setError(false);
    document.renderPage(page).then(value => { if (active) setImage(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [document, page]);
  return <Dialog.Root open onOpenChange={open => { if (!open) onCancel(); }}><Dialog.Portal>
    <Dialog.Overlay className="reference-dialog-overlay" />
    <Dialog.Content className="reference-page-dialog">
      <div className="reference-panel-heading"><Dialog.Title>{t("pdfChoosePage")}</Dialog.Title><Dialog.Close asChild><Button size="icon" aria-label={t("close")}><X /></Button></Dialog.Close></div>
      <Dialog.Description className="reference-filename">{name}</Dialog.Description>
      <div className="reference-page-preview" aria-busy={!image && !error}>
        {image ? <img src={image.src} alt={t("pdfPageOf", { page, total: document.pageCount })} /> : <p role="status">{t(error ? "referenceLoadError" : "referenceLoading")}</p>}
      </div>
      <div className="reference-page-navigation">
        <Button aria-label={t("previousPage")} disabled={page === 1} onClick={() => setPage(n => n - 1)}><ChevronLeft /></Button>
        <label>{t("pdfPage")}<LocalizedNumberInput aria-label={t("pdfPage")} min={1} max={document.pageCount} digits={0} value={page} onCommit={n => {
          if (n != null && Number.isInteger(n) && n >= 1 && n <= document.pageCount) setPage(n);
        }} /></label>
        <span>{t("pdfPageOf", { page, total: document.pageCount })}</span>
        <Button aria-label={t("nextPage")} disabled={page === document.pageCount} onClick={() => setPage(n => n + 1)}><ChevronRight /></Button>
      </div>
      <div className="reference-actions"><Button onClick={onCancel}>{t("cancel")}</Button><Button variant="solid" disabled={!image || image.pageNumber !== page} onClick={() => { if (image) onUse(image); }}>{t("pdfUsePage")}</Button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

export function ReferencePanel({ onUpload, busy }: { onUpload: () => void; busy: boolean }) {
  const locale = useProject(s => s.locale), t = (key: string, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const u = useProject(s => s.project.underlay), scaled = useProject(s => s.project.scaleCalibrated);
  const container=typeof document==='undefined'?undefined:document.querySelector<HTMLElement>('.app-shell');
  const [deleteAsk, setDeleteAsk] = useState(false);
  const [unlockAsk, setUnlockAsk] = useState(false);
  const patch = useProject(s => s.patchUnderlay);
  return <aside className="reference-panel" aria-label={t("reference")} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <div className="reference-panel-heading"><h2><FileImage size={18} />{t("reference")}</h2><Button size="icon" aria-label={t("close")} onClick={() => useProject.getState().setReferenceOpen(false)}><X /></Button></div>
    {u ? <>
      <p className="reference-filename" title={u.name}>{u.name}</p>
      {u.pageNumber && <p className="reference-note">{t("pdfPageOf", { page: u.pageNumber, total: u.pageCount ?? 1 })}</p>}
      <div className="reference-actions">
        <Button aria-pressed={u.visible} onClick={() => patch({ visible: !u.visible })}>{u.visible ? <Eye /> : <Eye className="reference-hidden-icon"><line x1="2" y1="2" x2="22" y2="22" /></Eye>}{t(u.visible ? "hide" : "show")}</Button>
        <Button aria-pressed={u.locked} aria-label={t(u.locked ? "referenceUnlockAction" : "referenceLockAction")} onClick={() => {
          if (u.locked && scaled) setUnlockAsk(true);
          else patch({ locked: !u.locked });
        }}>{u.locked ? <Lock className="reference-locked-icon" /> : <Unlock />}{t(u.locked ? "locked" : "unlocked")}</Button>
      </div>
      {!u.locked && scaled && <p className="reference-resize-warning" role="status">{t("referenceResizeReminder")}</p>}
      <label className="reference-field">{t("referenceTransparency")}<output>{formatNumber((1 - u.opacity) * 100, 0)}%</output>
        <input type="range" min={0} max={100} step={1} value={Math.round((1 - u.opacity) * 100)} onChange={e => patch({ opacity: 1 - Number(e.target.value) / 100 })} />
      </label>
      <p className={scaled ? "reference-note" : "reference-note reference-scale-required"} role="status">{t(scaled ? "referenceScaled" : "referenceUnscaled")}</p>
      <Button className="w-full reference-calibrate-action" disabled={u.locked || !u.visible} onClick={() => {
        useProject.getState().setTool("scale"); useProject.setState({ referenceOpen: false });
      }}><Ruler />{t(scaled ? "referenceChangeScale" : "referenceScale")}</Button>
      <p className="reference-note">{t(u.locked ? "referenceLockedHint" : "referenceSetupHint")}</p>
      <div className="reference-actions"><Button disabled={busy} onClick={onUpload}><Upload />{t("referenceReplace")}</Button><Button className="text-danger reference-delete" aria-label={t("referenceDelete")} onClick={() => setDeleteAsk(true)}><Trash2 /></Button></div>
      <AlertDialog.Root open={deleteAsk} onOpenChange={setDeleteAsk}>
        <AlertDialog.Portal container={container}>
          <AlertDialog.Overlay className="reference-dialog-overlay reference-delete-overlay" />
          <AlertDialog.Content className="reference-page-dialog reference-delete-dialog" dir={localeDirection(locale)}>
            <AlertDialog.Title className="font-semibold">{t("referenceDelete")}</AlertDialog.Title>
            <AlertDialog.Description>{t("referenceDeleteConfirm")}</AlertDialog.Description>
            <div className="reference-actions">
              <AlertDialog.Cancel asChild><Button>{t("cancel")}</Button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><Button className="text-danger reference-delete" onClick={() => { useProject.getState().setUnderlay(null); setDeleteAsk(false); }}><Trash2 />{t("delete")}</Button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={unlockAsk && u.locked && scaled} onOpenChange={setUnlockAsk}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="reference-dialog-overlay" />
          <AlertDialog.Content className="reference-page-dialog reference-unlock-dialog">
            <AlertDialog.Title className="font-semibold">{t("referenceUnlockTitle")}</AlertDialog.Title>
            <AlertDialog.Description>{t("referenceResizeWarning")}</AlertDialog.Description>
            <div className="reference-actions">
              <AlertDialog.Cancel asChild><Button>{t("cancel")}</Button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><Button onClick={() => patch({ locked: false })}><Unlock />{t("referenceUnlockAction")}</Button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </> : <><p className="reference-note">{t("referenceEmpty")}</p><Button className="w-full" variant="solid" onClick={onUpload} disabled={busy}><Upload />{t("referenceUpload")}</Button><p className="reference-note">{t("referenceFormats")}</p></>}
    {busy && <p role="status">{t("referenceLoading")}</p>}
  </aside>;
}
