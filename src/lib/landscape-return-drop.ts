export function landscapeReturnDrop(start:{clientX:number;clientY:number},dx:number,dy:number,commit:boolean):boolean{
 const library=document.querySelector<HTMLElement>('.landscape-object-library[data-catalog]');
 if(!library)return false;
 const x=start.clientX+dx,y=start.clientY+dy,r=library.getBoundingClientRect();
 const target=document.elementFromPoint(x,y);
 const inside=Math.hypot(dx,dy)>36&&r.width>0&&r.height>0&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom&&!!target&&library.contains(target);
 library.toggleAttribute('data-drop-delete',inside&&!commit);
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('landscape-return-target',{detail:{x,y,visible:inside&&!commit}}));
 return inside&&commit;
}
