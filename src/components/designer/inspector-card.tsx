import {useId,type CSSProperties,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import './inspector-card.css';

/** A controlled card; the parent owns the single open key for its panel. */
export function InspectorCard({id,title,open,onToggle,children,tint,summary,className,actions}: {
 id:string;title:ReactNode;open:boolean;onToggle:()=>void;children:ReactNode;
 tint?:string;summary?:ReactNode;className?:string;actions?:ReactNode;
}){
 const uid=useId(),triggerId=`${uid}-trigger`,contentId=`${uid}-content`;
 return <section className={`inspector-card${className?` ${className}`:''}`} data-inspector-card={id} data-open={open} style={tint?{'--inspector-tint':tint} as CSSProperties:undefined}>
  <h3 className="inspector-card-heading"><button type="button" id={triggerId} className="inspector-card-trigger" aria-expanded={open} aria-controls={contentId} onClick={onToggle}>
   <ChevronDown className="inspector-card-chevron" aria-hidden="true"/><span className="inspector-card-title">{title}</span>{summary!=null&&<span className="inspector-card-summary">{summary}</span>}
  </button>{actions&&<span className="inspector-card-header-actions">{actions}</span>}</h3>
  {open&&<div id={contentId} className="inspector-card-content" role="region" aria-labelledby={triggerId}>{children}</div>}
 </section>;
}

const engineeringSections=['irrigationZones','equipment','networks','pump','tank'];
/** One top-level group and at most one zone child form an open path. */
export function normalizeInspectorPath(path:string[]):string[]{
 const group=path.find(key=>engineeringSections.includes(key));
 if(!group)return [];
 const zone=group==='irrigationZones'?path.find(key=>key.startsWith('zone:')):undefined;
 return zone?[group,zone]:[group];
}
export function toggleInspectorPath(path:string[],key:string):string[]{
 if(key.startsWith('zone:'))return path.includes(key)?['irrigationZones']:['irrigationZones',key];
 return path[0]===key?[]:normalizeInspectorPath([key]);
}
