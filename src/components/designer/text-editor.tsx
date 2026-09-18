import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { CadText } from "@/lib/cad/types";
import { tr } from "@/lib/i18n";
import { useProject } from "@/lib/project-store";

const FONTS = ["osifont", "Roboto Mono", "PT Mono", "Fira Mono", "JetBrains Mono", "Noto Sans Mono", "Martian Mono", "Cousine", "Anonymous Pro", "Victor Mono",
  "IBM Plex Mono", "IBM Plex Sans", "Arial", "Verdana", "Georgia", "Times New Roman", "Courier New",
  "DejaVu Sans", "DejaVu Serif", "DejaVu Sans Mono", "Trebuchet MS", "Palatino", "Baskerville", "Didot", "Avenir", "Futura", "Optima"];

export function TextEditor({note,onSave,onClose}: {note:CadText;onSave:(note:CadText)=>void;onClose:()=>void}) {
  const locale=useProject(s=>s.locale);
  const t=(key:string)=>tr(locale,key);
  const [text,setText]=useState(note.text);
  const [font,setFont]=useState(note.fontFamily ?? FONTS[0]!);
  // A stable 40 px/m reference keeps the entered font size independent of zoom.
  const [size,setSize]=useState(String(Math.round(note.size*40*100)/100));
  const [color,setColor]=useState(note.color ?? "#1b1f24");
  const [bold,setBold]=useState(Boolean(note.bold));
  const [italic,setItalic]=useState(Boolean(note.italic));
  const [underline,setUnderline]=useState(Boolean(note.underline));
  const [viewport,setViewport]=useState({top:0,height:typeof window === "undefined" ? 600 : window.innerHeight});
  useEffect(()=>{
    const vv=window.visualViewport;
    const update=()=>setViewport({top:vv?.offsetTop ?? 0,height:vv?.height ?? window.innerHeight});
    update(); vv?.addEventListener("resize",update);vv?.addEventListener("scroll",update);window.addEventListener("resize",update);
    return ()=>{vv?.removeEventListener("resize",update);vv?.removeEventListener("scroll",update);window.removeEventListener("resize",update);};
  },[]);
  const value=Number(size.replace(",","."));
  const valid=text.trim().length>0 && Number.isFinite(value) && value>=4 && value<=400;
  return <Dialog.Root open onOpenChange={open=>{if(!open) onClose();}}>
    <Dialog.Portal>
      <Dialog.Overlay className="note-editor-overlay" />
      <Dialog.Content className="note-editor" aria-describedby={undefined}
        style={{top:viewport.top+Math.max(8,(viewport.height-310)/2),maxHeight:Math.max(80,viewport.height-16)}}
        onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
        onKeyDown={e=>e.stopPropagation()}>
        <Dialog.Title className="note-editor-title">{t("drawText")}</Dialog.Title>
        <form onSubmit={e=>{e.preventDefault();if(valid) onSave({...note,text:text.trim(),fontFamily:font,size:value/40,color,bold,italic,underline});}}>
          <label className="note-editor-field"><span className="sr-only">{t("textPlaceholder")}</span>
            <textarea autoFocus rows={2} value={text} onChange={e=>setText(e.target.value)}
              style={{fontFamily:font,color,fontWeight:bold?700:400,fontStyle:italic?"italic":"normal",textDecoration:underline?"underline":"none"}} placeholder={t("textPlaceholder")}/>
          </label>
          <div className="note-editor-options">
            <label className="note-editor-field">{t("textFont")}<select value={font} style={{fontFamily:font}} onChange={e=>setFont(e.target.value)}>
              {FONTS.map(f=><option key={f} value={f} style={{fontFamily:f}}>{f}</option>)}
            </select></label>
            <label className="note-editor-field">{t("textSize")}<input inputMode="decimal" value={size} onChange={e=>setSize(e.target.value)}/></label>
            <label className="note-editor-field">{t("textColor")}<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label>
          </div>
          <div className="note-editor-format">
            <button type="button" aria-label={t("textBold")} title={t("textBold")} aria-pressed={bold} onClick={()=>setBold(!bold)}><b>B</b></button>
            <button type="button" aria-label={t("textItalic")} title={t("textItalic")} aria-pressed={italic} onClick={()=>setItalic(!italic)}><i>I</i></button>
            <button type="button" aria-label={t("textUnderline")} title={t("textUnderline")} aria-pressed={underline} onClick={()=>setUnderline(!underline)}><u>U</u></button>
          </div>
          <div className="note-editor-actions"><button type="button" onClick={onClose}>{t("cancel")}</button><button type="submit" disabled={!valid}>{t("apply")}</button></div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
