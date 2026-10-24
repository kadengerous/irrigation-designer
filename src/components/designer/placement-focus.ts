import {create} from 'zustand';
import type {Pt} from '@/lib/geometry';

/** Transient, snapped installation centre; never stored in the project. */
export const usePlacementFocus=create<{focus:{owner:string;point:Pt;objectId?:string;snapKind?:string}|null}>(()=>({focus:null}));
export function setPlacementFocus(owner:string,point:Pt|null,objectId?:string,snapKind?:string){
  if(point)usePlacementFocus.setState({focus:{owner,point,objectId,...(snapKind?{snapKind}:{})}});
  else if(usePlacementFocus.getState().focus?.owner===owner)usePlacementFocus.setState({focus:null});
}
