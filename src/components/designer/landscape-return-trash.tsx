import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Trash2} from 'lucide-react';
export function LandscapeReturnTrash(){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const update=(e:Event)=>{const {x,y,visible}=(e as CustomEvent).detail;if(ref.current){ref.current.style.display=visible?'grid':'none';ref.current.style.left=`${x}px`;ref.current.style.top=`${y}px`;}};window.addEventListener('landscape-return-target',update);return()=>window.removeEventListener('landscape-return-target',update);},[]);
 return typeof document==='undefined'?null:createPortal(<div ref={ref} className="head-return-trash" aria-hidden="true"><Trash2 size={30} strokeWidth={1.25}/></div>,document.body);
}
