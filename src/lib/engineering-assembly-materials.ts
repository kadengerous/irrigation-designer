import type {Project} from './project-types';
import type {EngineeringMaterial} from './engineering-materials';
import {assemblyRequirements,resolveAssembly} from './engineering-assembly-sizing';
import {text as t,formatNumber} from './i18n';
import {formatFlowU,formatLenU,type UnitPrefs} from './units';
const INCLUDED=new Set(['tank','pump','pumpStation','filter','filterAssembly','treatment','manifold','valve','controller','rainSensor','weatherSensor']);
/** Expand each physical assembly exactly once. Its generated valve branches
 * are material items; the assembly marker and diagram links are not. */
export function assemblyMaterials(project:Project,units:UnitPrefs):EngineeringMaterial[]{
 const assemblies=Object.values(project.engineering?.elements??{}).filter(e=>e.kind==='equipment'&&e.type==='assembly'&&e.assembly);
 if(!assemblies.length)return [];
 const requirements=assemblyRequirements(project),grouped=new Map<string,EngineeringMaterial>();
 for(const element of assemblies){if(element.kind!=='equipment'||!element.assembly)continue;
  for(const node of resolveAssembly(element.assembly,project,requirements).nodes){if(!INCLUDED.has(node.type))continue;
   const parts=[node.name||t('engineering.'+node.type),node.manufacturer,node.model].filter(Boolean) as string[];
   if(node.type==='tank'&&node.volumeL!=null)parts.push(`≥ ${formatNumber(node.volumeL/(units.pipe==='in'?3.785411784:1),0)} ${t(units.pipe==='in'?'engineering.gallons':'engineering.litres')}`);
   if(node.type==='pump'){if(node.flowLpm!=null)parts.push(`Q ≥ ${formatFlowU(node.flowLpm,units.flow)}`);parts.push(node.headM!=null?`H ≥ ${formatLenU(node.headM,units.length)}`:`H: ${t('noData')}`);}
   if(node.type==='filter'){if(node.inletDnMm!=null)parts.push(`DN${node.inletDnMm} / DN${node.outletDnMm}`);if(node.capacityLpm!=null)parts.push(`Q ≥ ${formatFlowU(node.capacityLpm,units.flow)}`);}
   if(node.type==='manifold')parts.push(`${t('engineering.outlets')}: ${formatNumber(node.outlets??1,0)}`);
   if(node.type==='controller')parts.push(`${t('engineering.zones')}: ${formatNumber(node.zones??1,0)}`);
   const name=parts.join(' · '),key=`assembly:${node.type}:${name}`,previous=grouped.get(key);
   if(previous)previous.qty++;else grouped.set(key,{key,name,qty:1,unit:t('pcs'),digits:0});
  }
 }
 return [...grouped.values()];
}
