import { useRef, type CSSProperties } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tr, type Locale } from '@/lib/i18n';
import { localeDirection } from '@/lib/locale-config';
import './layer-delete-dialog.css';

/** A body portal keeps confirmation centered outside scrollable layer cards. */
export function LayerDeleteDialog({name,locale,disabled=false,onCancel,onDelete}:{
  name:string;locale:Locale;disabled?:boolean;onCancel:()=>void;onDelete:()=>void;
}) {
  const trigger=useRef(typeof document==='undefined'?null:document.activeElement as HTMLElement|null);
  return <AlertDialog.Root open onOpenChange={open=>{if(!open)onCancel();}}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="layer-delete-overlay"/>
      <AlertDialog.Content className="layer-delete-dialog" dir={localeDirection(locale)}
        onCloseAutoFocus={event=>{event.preventDefault();if(trigger.current?.isConnected)trigger.current.focus();}}
        onPointerDown={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()}
        onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
        <AlertDialog.Title>{tr(locale,'delete')}</AlertDialog.Title>
        <AlertDialog.Description>{tr(locale,'zoneDeleteQuestion',{name})}</AlertDialog.Description>
        <div className="layer-delete-actions">
          <AlertDialog.Cancel asChild><Button>{tr(locale,'cancel')}</Button></AlertDialog.Cancel>
          <AlertDialog.Action asChild><Button className="layer-delete-confirm" disabled={disabled}
            style={{background:'#b42323',color:'#fff','--color-btn':'#b42323'} as CSSProperties} onClick={onDelete}>
            <Trash2 aria-hidden="true"/>{tr(locale,'delete')}
          </Button></AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>;
}
