import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileDown, FolderOpen, Save, X } from 'lucide-react';
import { useFileSave, fileWithExtension, fileSaveMode, preventFileNavigation } from '@/lib/file-save';
import { chooseSaveTarget, saveFile } from '@/lib/export-plan';
import { useProject } from '@/lib/project-store';
import { tr } from '@/lib/i18n';
import { localeDirection } from '@/lib/locale-config';
import { Button } from '@/components/ui/button';
import './project-files-dialogs.css';

export function FileSaveDialog() {
  const request=useFileSave(s=>s.request),locale=useProject(s=>s.locale),t=(key:string)=>tr(locale,key);
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  const [fileLink,setFileLink]=useState<{blob:Blob;url:string}|null>(null);
  const help=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{setName(request?.filename ?? '');setBusy(false);setError(false);},[request]);
  useEffect(()=>{
    if(!request){setFileLink(null);return;}
    const url=URL.createObjectURL(request.blob);setFileLink({blob:request.blob,url});
    return ()=>URL.revokeObjectURL(url);
  },[request]);
  if(!request)return null;
  const extension=request.filename.split('.').pop()!;
  const fileUrl=fileLink?.blob===request.blob?fileLink.url:'';
  const filename=fileWithExtension(name,extension);
  const native=typeof (window as unknown as {showSaveFilePicker?:unknown}).showSaveFilePicker==='function';
  const file=new File([request.blob],filename,{type:request.blob.type});
  const share=!!navigator.canShare?.({files:[file]}) && !!navigator.share;
  const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||/Mac/i.test(navigator.platform)&&navigator.maxTouchPoints>1;
  const mode=fileSaveMode({picker:native,mobile,share});
  const mac=/Mac/i.test(navigator.platform)&&!mobile;
  return <Dialog.Root open onOpenChange={open=>{if(!open&&!busy)request.finish();}}><Dialog.Portal>
    <Dialog.Overlay className="project-files-overlay file-destination-overlay"/>
    <Dialog.Content className="project-files-dialog file-destination-dialog" dir={localeDirection(locale)} aria-describedby="file-destination-help">
      <header><Dialog.Title>{t('save')}</Dialog.Title><Dialog.Close asChild><Button disabled={busy} aria-label={t('close')}><X/></Button></Dialog.Close></header>
      <Dialog.Description ref={help} tabIndex={-1} id="file-destination-help">{t(mode==='picker'?'saveDestinationHint':mode==='link'?(mac?'saveLinkMacHint':'saveLinkHint'):mode==='share'?'saveSystemHint':'saveUnavailable')}</Dialog.Description>
      <label className="file-destination-name">{t('fileName')}<input value={name} onChange={e=>setName(e.target.value)} disabled={busy} autoComplete="off"/></label>
      {mode==='link'&&fileUrl?<a className="file-destination-link" href={fileUrl} download={filename}
        aria-describedby="file-destination-help" onClick={event=>{preventFileNavigation(event);help.current?.focus();}}
        onContextMenu={event=>event.stopPropagation()}
        onAuxClick={preventFileNavigation}>
        <FileDown aria-hidden="true"/><bdi dir="auto">{filename}</bdi>
      </a>:<p><bdi dir="auto">{filename}</bdi></p>}
      {error&&<p role="alert">{t('toastExportFail')}</p>}
      <div className="project-file-actions">{(mode==='picker'||mode==='share')&&<Button disabled={busy||!name.trim()} onClick={async()=>{
        setBusy(true);setError(false);
        try {
          if(native){const target=await chooseSaveTarget(filename,request.blob.type.split(';')[0]!);if(target===null){setBusy(false);return;}await saveFile(request.blob,filename,target);}
          else await navigator.share({files:[file]});
          // Sharing can only confirm hand-off, not a disk write. Never claim it was saved.
          request.finish();
        }catch(e){if(e instanceof DOMException&&e.name==='AbortError')setBusy(false);else{setError(true);setBusy(false);}}
      }}>{native?<FolderOpen/>:<Save/>}{t(native?'saveDestination':'saveSystem')}</Button>}
      <Button disabled={busy} onClick={()=>request.finish()}>{t(mode==='link'?'close':'cancel')}</Button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
