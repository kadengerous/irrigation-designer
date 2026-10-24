import {create} from "zustand";
import {useProject, drawingForEditing} from "./project-store";
import type {Project} from "./project-types";
import type {CadDrawing} from "./cad/types";
import {roundingBase} from "./cad/rounding-engine";
import {roundingCorners} from "./cad/corner-rounding";

export const useCornerRounding=create<{
  faceId:string|null; selected:number[]|null; multiple:boolean;
  preview:{base:Project;drawing:CadDrawing}|null;
}>(()=>({faceId:null,selected:null,multiple:false,preview:null}));

export function contextualFigure(state=useProject.getState()) {
  if(state.selectedId || state.selectedEdgeId || state.selectedPlantId || state.selectedPolyIds.length>1 || state.referenceOpen) return null;
  const id=state.groupMemberId??state.selectedPolyId;
  if(!id)return null;
  const face=drawingForEditing(state.project).faces[id];
  if(!face || face.locked || face.hidden || face.segment || (face.layerId&&state.groupMemberId!==id) || face.spline?.closed===false || face.freehand?.closed===false) return null;
  return face;
}

export function roundingSelection(drawing:CadDrawing,id:string) {
  const selected=useCornerRounding.getState().selected;
  const corners=roundingBase(drawing,id)??[];
  return roundingCorners(corners).flatMap((c,i)=>c&&(selected===null||selected.includes(i))?[i]:[]);
}

export function openCornerRounding() {
  const state=useProject.getState(),face=contextualFigure(state);
  if(!face || !roundingBase(drawingForEditing(state.project),face.id))return;
  useProject.setState({tool:"draw",drawSub:"none",cadEditId:null,selectedEdgeId:null});
  useCornerRounding.setState({faceId:face.id,selected:null,multiple:false,preview:null});
}

export function previewCornerGeometry(drawing:CadDrawing) {
  useCornerRounding.setState({preview:{base:useProject.getState().project,drawing}});
}

export function commitCornerGeometry(id:string) {
  const preview=useCornerRounding.getState().preview;
  useCornerRounding.setState({preview:null});
  if(preview && preview.base===useProject.getState().project && preview.drawing!==drawingForEditing(preview.base))
    useProject.getState().commitDrawing(preview.drawing,id,true);
}

export function closeCornerRounding(commit=true) {
  const id=useCornerRounding.getState().faceId;
  if(commit&&id)commitCornerGeometry(id);
  useCornerRounding.setState({faceId:null,selected:null,multiple:false,preview:null});
}

export function selectRoundingCorner(index:number,add=false) {
  const state=useCornerRounding.getState();
  if(state.faceId)commitCornerGeometry(state.faceId);
  const multiple=add||state.multiple;
  const previous=state.selected??[];
  useCornerRounding.setState({selected:multiple?(previous.includes(index)?previous.filter(i=>i!==index):[...previous,index]):[index]});
}

useProject.subscribe((state,previous)=>{
  const rounding=useCornerRounding.getState();
  if(rounding.preview && state.project!==previous.project)useCornerRounding.setState({preview:null});
  if(rounding.faceId && (contextualFigure(state)?.id!==rounding.faceId || state.tool!=="draw" || state.drawSub!=="none" || state.cadEditId || state.project.id!==previous.project.id)) closeCornerRounding(false);
});
