import type {Project} from './project-types';
import type {HydraulicSettings} from './engineering';

export type EngineeringOperation=NonNullable<HydraulicSettings['operation']>;
export type OperatingScenario<T>={circuit:string;consumers:T[]};
/** A single operating contract for network hydraulics and preliminary pump
 * demand. Storage volume intentionally uses the unfiltered full-cycle list. */
export function engineeringOperatingPlan<T extends {circuit:string}>(project:Project,consumers:T[]){
 const settings=project.engineering?.hydraulics??{},operation:EngineeringOperation=settings.operation==='selected'||settings.operation==='simultaneous'?settings.operation:'sequential';
 const available=new Set(project.zones.map(z=>z.id)),selectedZoneIds=[...new Set((Array.isArray(settings.simultaneousZoneIds)?settings.simultaneousZoneIds:[]).filter(id=>Number.isInteger(id)&&available.has(id)))].sort((a,b)=>a-b);
 const selectedCircuits=new Set(selectedZoneIds.map(id=>`zone:${id}`));
 const active=operation==='selected'?consumers.filter(c=>selectedCircuits.has(c.circuit)):consumers;
 const selectionValid=operation!=='selected'||selectedZoneIds.length>0;
 const scenarios:OperatingScenario<T>[]=operation==='sequential'?[...new Set(active.map(c=>c.circuit))].map(circuit=>({circuit,consumers:active.filter(c=>c.circuit===circuit)})):active.length?[{circuit:operation==='selected'?'selected':'all',consumers:active}]:[];
 return {operation,consumers:active,scenarios,selectionValid,selectedZoneIds};
}
