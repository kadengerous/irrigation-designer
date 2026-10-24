import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { FileDown, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/project-store";
import { retainedTrash, flushProjectStorage } from "@/lib/workspace-storage";
import { tr, formatDate } from "@/lib/i18n";
import { localeDirection } from "@/lib/locale-config";
import { fileStem } from "@/lib/project-file";
import type { Project } from "@/lib/project-types";
import { chooseSaveTarget, exportPdfFromProject, exportPngFromProject, exportJpegFromProject, exportEstimatePdf, exportEstimateExcel, exportDxf, exportSvg, type SaveTarget } from "@/lib/export-plan";
import "./project-files-dialogs.css";

type ExportFormat = { group:string;label:string;extension:string;mime:string;run:(p:Project,name:string,target?:SaveTarget)=>Promise<void> };
export const EXPORT_FORMATS: ExportFormat[] = [
  {group:"exportDrawingGroup",label:"PDF",extension:"pdf",mime:"application/pdf",run:(p,n,t)=>exportPdfFromProject(p,n,undefined,t)},
  {group:"exportImageGroup",label:"PNG",extension:"png",mime:"image/png",run:exportPngFromProject},
  {group:"exportImageGroup",label:"JPEG",extension:"jpeg",mime:"image/jpeg",run:exportJpegFromProject},
  {group:"estimate",label:"PDF",extension:"pdf",mime:"application/pdf",run:exportEstimatePdf},
  {group:"estimate",label:"XLSX",extension:"xlsx",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",run:exportEstimateExcel},
  {group:"exportCadGroup",label:"DXF",extension:"dxf",mime:"application/dxf",run:exportDxf},
  {group:"exportCadGroup",label:"SVG",extension:"svg",mime:"image/svg+xml",run:exportSvg},
];
export function ProjectExportDialog({project,onClose}:{project:Project|null;onClose:()=>void}) {
  const locale=useProject(s=>s.locale),t=(key:string)=>tr(locale,key);
  const [busy,setBusy]=useState(false);
  return <Dialog.Root open={!!project} onOpenChange={open=>{if(!open&&!busy)onClose();}}><Dialog.Portal>
    <Dialog.Overlay className="project-files-overlay"/>
    <Dialog.Content className="project-files-dialog" dir={localeDirection(locale)} aria-describedby="export-description">
      <header><Dialog.Title>{t("exportMaterials")}</Dialog.Title><Dialog.Close asChild><Button disabled={busy} size="icon" aria-label={t("close")}><X/></Button></Dialog.Close></header>
      <Dialog.Description id="export-description">{t("exportMaterialsHint")}</Dialog.Description>
      {[...new Set(EXPORT_FORMATS.map(f=>f.group))].map(group=><section key={group}><h3>{t(group)}</h3><div className="project-file-actions">
        {EXPORT_FORMATS.filter(f=>f.group===group).map(f=><Button disabled={busy} key={f.label} onClick={async()=>{
          if(!project)return;setBusy(true);
          try {
            const name=fileStem(project.name)+(group==="estimate"?`-${fileStem(t("estimate"))}`:"");
            const target=await chooseSaveTarget(`${name}.${f.extension}`,f.mime);
            if(target!==null) await f.run(project,name,target);
          } catch {toast.error(t("toastExportFail"));} finally {setBusy(false);}
        }}><FileDown/>{f.label}</Button>)}
      </div></section>)}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
export function ProjectTrashDialog({open,onClose}:{open:boolean;onClose:()=>void}) {
  const locale=useProject(s=>s.locale),trash=useProject(s=>s.trash),t=(key:string)=>tr(locale,key);
  const [purge,setPurge]=useState<string|null>(null);
  return <><Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose();}}><Dialog.Portal>
    <Dialog.Overlay className="project-files-overlay"/>
    <Dialog.Content className="project-files-dialog project-trash-dialog" dir={localeDirection(locale)} aria-describedby="trash-description">
      <header><Dialog.Title>{t("projectTrash")}</Dialog.Title><Dialog.Close asChild><Button size="icon" aria-label={t("close")}><X/></Button></Dialog.Close></header>
      <Dialog.Description id="trash-description">{t("projectTrashHint")}</Dialog.Description>
      {!retainedTrash(trash).length && <p>{t("projectTrashEmpty")}</p>}
      <ul className="project-trash-list">{retainedTrash(trash).map(({project,deletedAt})=><li className="project-trash-row" key={project.id}>
        <div><strong><bdi>{project.name||t("untitled")}</bdi></strong><small>{formatDate(deletedAt,locale)}</small></div>
        <div className="project-file-actions"><Button onClick={()=>{useProject.getState().restoreLibrary(project.id);void flushProjectStorage();}}><RotateCcw/><span>{t("restoreProject")}</span></Button>
          <Button className="project-trash-delete" onClick={()=>setPurge(project.id)}><Trash2/><span>{t("purgeProject")}</span></Button></div>
      </li>)}</ul>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
  <AlertDialog.Root open={!!purge} onOpenChange={v=>{if(!v)setPurge(null);}}><AlertDialog.Portal>
    <AlertDialog.Overlay className="project-files-overlay project-files-confirm-overlay"/>
    <AlertDialog.Content className="project-files-dialog project-files-confirm" dir={localeDirection(locale)}>
      <AlertDialog.Title>{t("purgeProjectTitle")}</AlertDialog.Title><AlertDialog.Description>{t("purgeProjectWarning")}</AlertDialog.Description>
      <div className="project-file-actions"><AlertDialog.Cancel asChild><Button>{t("cancel")}</Button></AlertDialog.Cancel>
        <AlertDialog.Action asChild><Button className="text-danger" onClick={()=>{if(purge)useProject.getState().purgeLibrary(purge);void flushProjectStorage();setPurge(null);}}>{t("purgeProject")}</Button></AlertDialog.Action></div>
    </AlertDialog.Content>
  </AlertDialog.Portal></AlertDialog.Root></>;
}
