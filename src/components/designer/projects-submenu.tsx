import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ChevronDown, ChevronRight, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import type { Project } from '@/lib/project-types';
import { isNamed, useProject } from '@/lib/project-store';
import { tr } from '@/lib/i18n';
import { localeDirection } from '@/lib/locale-config';
import { uiPixels } from '@/lib/ui-scale';
import './projects-submenu.css';

export function projectDetails(project:Project) {
  return (['client','phone','address','notes'] as const)
    .map(key=>({key,value:project.meta[key]?.trim()??''})).filter(field=>field.value);
}

export function ProjectNameEditor({name,onRename,label,editRequest=0}:{name:string;onRename:(name:string)=>void;label:string;editRequest?:number}) {
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(name);
  const editingRef=useRef(false);
  useEffect(()=>{if(editRequest){setDraft(name);editingRef.current=true;setEditing(true);}},[editRequest]);
  const finish=(save:boolean)=>{
    if(!editingRef.current)return;
    editingRef.current=false;setEditing(false);
    const value=draft.trim();if(save&&value&&value!==name)onRename(value);
  };
  return editing?<input className="project-submenu-name-input" value={draft} aria-label={label}
    autoFocus onFocus={event=>event.currentTarget.select()} onChange={event=>setDraft(event.target.value)}
    onBlur={()=>finish(true)} onKeyDown={event=>{
      event.stopPropagation();
      if(event.key==='Enter'){event.preventDefault();finish(true);}
      if(event.key==='Escape'){event.preventDefault();finish(false);}
    }}/>:<div className="project-submenu-name"><bdi>{name}</bdi></div>;
}

export function ProjectsSubmenu({onShow,onOpenProject}:{onShow:()=>void;onOpenProject:()=>void}) {
  const locale=useProject(s=>s.locale),projects=useProject(s=>s.projects),currentId=useProject(s=>s.project.id);
  const [open,setOpen]=useState(false),[deleting,setDeleting]=useState<{id:string;name:string}|null>(null);
  const [rename,setRename]=useState({id:'',sequence:0});
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const trigger=useRef<HTMLButtonElement>(null);
  const anchor=useRef({getBoundingClientRect:()=>trigger.current?.closest('.project-menu')?.getBoundingClientRect()??new DOMRect()});
  const [placement,setPlacement]=useState<{side:'right'|'left'|'bottom';width:number;height:number}>({side:'right',width:340,height:500});
  const t=(key:string)=>tr(locale,key),dir=localeDirection(locale);
  useLayoutEffect(()=>{
    if(!open)return;
    const menu=trigger.current?.closest('.project-menu');if(!menu)return;
    const update=()=>{
      const rect=menu.getBoundingClientRect(),gap=6,pad=8;
      const right=window.innerWidth-rect.right-gap-pad,left=rect.left-gap-pad;
      const preferred=dir==='rtl'?'left':'right';
      const side= (preferred==='right'?right:left)>=uiPixels(300)?preferred:(preferred==='right'?left:right)>=uiPixels(300)?(preferred==='right'?'left':'right'):'bottom';
      setPlacement({side,width:Math.min(uiPixels(340),side==='right'?right:side==='left'?left:dir==='rtl'?rect.right-pad:window.innerWidth-rect.left-pad),
        height:Math.max(60,window.innerHeight-(side==='bottom'?rect.bottom+gap:rect.top)-pad)});
    };
    update();const observer=new ResizeObserver(update);observer.observe(menu);
    window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[open,dir]);
  const container=typeof document==='undefined'?undefined:document.querySelector<HTMLElement>('.app-shell');
  return <>
    <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(next){onShow();useProject.getState().saveCurrentToLibrary();}}}>
      <Popover.Anchor virtualRef={anchor}/>
      <Popover.Trigger asChild><button ref={trigger} type="button" className="projects-submenu-trigger" aria-expanded={open}>
        <FolderOpen/><span>{t('projects')}</span><ChevronRight className="projects-submenu-chevron"/>
      </button></Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content className="projects-submenu" side={placement.side} align="start" sideOffset={6} avoidCollisions={false}
          style={{width:placement.width,maxHeight:placement.height}}
          collisionPadding={8} dir={dir} aria-label={t('projects')} onCloseAutoFocus={event=>event.preventDefault()}
          onInteractOutside={event=>{if(deleting)event.preventDefault();}}
          onEscapeKeyDown={event=>{if(deleting||(event.target instanceof HTMLElement&&event.target.closest('.project-submenu-name-input')))event.preventDefault();}}>
          <ul className="projects-submenu-list">
            {!projects.length&&<li className="projects-submenu-empty">{t('noProjects')}</li>}
            {projects.map(project=>{
              const name=isNamed(project)?project.name:t('untitled');
              const details=projectDetails(project),showDetails=details.length>0&&expanded.has(project.id);
              return <li className="projects-submenu-row" data-current={project.id===currentId} key={project.id}>
                <ProjectNameEditor name={name} label={t('projectName')} editRequest={rename.id===project.id?rename.sequence:0} onRename={value=>useProject.getState().renameLibrary(project.id,value)}/>
                <div className="projects-submenu-actions">
                  {details.length>0&&<button type="button" className="project-submenu-expand" aria-label={t(showDetails?'extraHide':'details')} title={t(showDetails?'extraHide':'details')}
                    aria-expanded={showDetails} aria-controls={`project-details-${project.id}`} onClick={()=>setExpanded(previous=>{
                      const next=new Set(previous);if(next.has(project.id))next.delete(project.id);else next.add(project.id);return next;
                    })}><ChevronDown className={showDetails?'is-expanded':undefined}/></button>}
                  {project.id!==currentId&&<button type="button" title={t('openProjectAction')} aria-label={t('openProjectAction')} onClick={()=>{
                    const state=useProject.getState();state.saveCurrentToLibrary();state.openLibrary(project.id);setOpen(false);onOpenProject();
                  }}><FolderOpen/><span>{t('openProjectAction')}</span></button>}
                  {project.id===currentId&&<button type="button" title={t('renameProjectAction')} aria-label={t('renameProjectAction')} onClick={()=>setRename(previous=>({id:project.id,sequence:previous.sequence+1}))}><Pencil/><span>{t('renameProjectAction')}</span></button>}
                  <button type="button" title={t('delete')} aria-label={t('delete')} className="project-submenu-delete" onClick={()=>setDeleting({id:project.id,name})}><Trash2/></button>
                </div>
                {showDetails&&<dl id={`project-details-${project.id}`} className="project-submenu-details">
                  {details.map(field=><div key={field.key}><dt>{t(field.key)}</dt><dd><bdi>{field.value}</bdi></dd></div>)}
                </dl>}
              </li>;
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
    <AlertDialog.Root open={!!deleting} onOpenChange={next=>{if(!next)setDeleting(null);}}>
      <AlertDialog.Portal container={container}>
        <AlertDialog.Overlay className="project-files-overlay project-files-confirm-overlay"/>
        <AlertDialog.Content className="project-files-dialog project-files-confirm" dir={dir}>
          <AlertDialog.Title>{t('deleteProject')}</AlertDialog.Title>
          <AlertDialog.Description><bdi>{deleting?.name}</bdi><br/>{t('projectTrashHint')}</AlertDialog.Description>
          <div className="project-file-actions">
            <AlertDialog.Cancel asChild><button type="button">{t('cancel')}</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button type="button" className="project-submenu-delete" onClick={()=>{
              if(deleting)useProject.getState().removeLibrary(deleting.id);setDeleting(null);
            }}><Trash2/>{t('delete')}</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </>;
}
