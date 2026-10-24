import {useProject} from './project-store';

export function headReturnHit(start:{x:number;y:number},end:{x:number;y:number},rect:{left:number;right:number;top:number;bottom:number;width:number;height:number}|null){
  return !!rect&&rect.width>0&&rect.height>0&&Math.hypot(end.x-start.x,end.y-start.y)>36&&end.x>=rect.left&&end.x<=rect.right&&end.y>=rect.top&&end.y<=rect.bottom;
}

/** A return-to-library gesture is one undoable deletion, not a move then deletion. */
export function finishHeadControlDrag(id:string,cancel:boolean,moved:boolean,returnToLibrary:boolean){
  const state=useProject.getState();
  if(cancel||!moved){state.cancelHeadEdit();return;}
  if(returnToLibrary){
    state.cancelHeadEdit();
    state.removeHead(id);
    if(!useProject.getState().project.heads.some(head=>head.id===id))state.setSectorEdit(null);
  }else state.endHeadEdit();
}
