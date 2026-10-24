import {activeLocale} from '@/lib/i18n';
import {localeDirection} from '@/lib/locale-config';
import {uiPixels} from '@/lib/ui-scale';
import {equipmentSymbolDimensions,type EquipmentKind,type EngineeringEquipment} from '@/lib/engineering';

/** Shared schematic glyphs for the library and the drawing. */
export function EngineeringGlyph({type,outlets=4}:{type:EquipmentKind;outlets?:number}){
 if(type==='assembly')return <g data-field-vector="assembly" stroke="#36595f" strokeWidth="2.5"><path d="M-48 35H48" stroke="#647b7e" strokeWidth="5"/><rect x="-43" y="-38" width="30" height="67" rx="11" fill="#8fc3cb"/><path d="M-40-23H-16M-40 12H-16" stroke="#cce7e9"/><path d="M-28 29V35H3V18H18V-12H44" fill="none" stroke="#648a99" strokeWidth="7"/><rect x="-6" y="3" width="26" height="23" rx="5" fill="#4c8692"/><circle cx="3" cy="14" r="9" fill="#aac7cb"/><circle cx="3" cy="14" r="4" fill="#4a727b"/><rect x="24" y="-38" width="22" height="17" rx="3" fill="#b6c5bd"/><rect x="28" y="-34" width="14" height="6" rx="1" fill="#416b69"/><path d="M26-12V2M35-12V2M44-12V2" stroke="#688b83" strokeWidth="5"/><path d="M28-23V-18H44V-12" fill="none" stroke="#b28c4c" strokeWidth="1.8"/></g>;
 if(type==='roundValveBox')return <g data-field-vector="roundValveBox" stroke="#294f46" strokeWidth="2.5"><circle r="48" fill="#253e39"/><circle r="42" fill="#5e936c"/><circle r="35" fill="#79a886"/>{[-20,-10,0,10,20].map(y=><path key={y} d={`M-25 ${y}H25`} stroke="#4c7c58"/>)}<rect x="-9" y="-31" width="18" height="6" rx="3" fill="#294f46"/><circle cy="29" r="3" fill="#c5d3cc"/></g>;
 if(type==='valveBox')return <g data-field-vector="valveBox" stroke="#294f46" strokeWidth="2.3"><rect x="-48" y="-48" width="96" height="96" rx="12" fill="#253e39"/><rect x="-42" y="-42" width="84" height="84" rx="9" fill="#5e936c"/><rect x="-35" y="-35" width="70" height="70" rx="5" fill="#79a886"/>{[-23,-12,-1,10,21].map(y=><path key={y} d={`M-26 ${y}H26`} stroke="#4c7c58" strokeWidth="2"/>)}<rect x="-10" y="-31" width="20" height="7" rx="3" fill="#294f46"/><circle cy="29" r="3" fill="#c5d3cc"/></g>;
 if(type==='waterOutlet')return <g data-field-vector="waterOutlet" strokeWidth="2.5" stroke="#294f46"><circle r="44" fill="#244b40"/><circle r="36" fill="#75a681"/><path d="M-27-18Q0-35 27-18" stroke="#c0d9c4"/><circle r="23" fill="#263c36"/><circle r="15" fill="#c79e50" stroke="#785a25"/><circle r="8" fill="#374a43"/><path d="M-19 0H-12M12 0H19M0-19V-12M0 12V19" stroke="#f4d890"/><rect x="-12" y="32" width="24" height="8" rx="3" fill="#395d45"/></g>;
 if(type==='dripStart')return <g data-field-vector="dripStart" stroke="#2b4247" strokeWidth="2.5"><path d="M-49 0H49" strokeWidth="9"/><rect x="-37" y="-13" width="36" height="26" rx="5" fill="#607579"/><path d="M-25 9L-12 37Q-9 43-2 39L10 32-3 4" fill="#40595f"/><path d="M-17 15L0 10M-13 23L4 18M-9 31L8 26" stroke="#8b9f9e"/><rect x="9" y="-14" width="22" height="28" rx="6" fill="#85928a"/><path d="M20-13V-24"/><rect x="10" y="-30" width="30" height="8" rx="3" fill="#cc6550" stroke="#98432f"/><path d="M38-7V7M45-7V7" stroke="#a8b6ac"/></g>;
 if(type==='gardenHydrant')return <g data-field-vector="gardenHydrant" stroke="#344b50" strokeWidth="2.4"><rect x="-12" y="-44" width="18" height="84" rx="3" fill="#71878a"/><path d="M-7-40V35" stroke="#b3c5c3"/><rect x="-23" y="38" width="40" height="9" rx="2" fill="#445b5f"/><path d="M6-22H23V-10H35V1H25V-2H6Z" fill="#c8a467" stroke="#806834"/><path d="M21-22V-34" stroke="#806834"/><rect x="9" y="-38" width="25" height="7" rx="3" fill="#5b9167"/><circle cx="-16" cy="42" r="1.5" fill="#d3dfda"/><circle cx="10" cy="42" r="1.5" fill="#d3dfda"/></g>;
 const valve=<><path d="M-50 0H-28M28 0H50M-28-20L28 20V-20L-28 20Z"/></>;
 switch(type){
  case 'well':return <><circle r="30"/><circle r="17"/><path d="M30 0H50M-12-43H12M0-43V-30M-40 40H40"/></>;
  case 'inlet':return <><path d="M-40-35V35M-40 0H50M-12-15L8 0-12 15"/></>;
  case 'tank':return <><rect x="-34" y="-38" width="68" height="76" rx="13"/><path d="M-34-20Q0-5 34-20M-34 22Q0 37 34 22M-50 0H-34M34 0H50"/></>;
  case 'pump':return <><circle r="30"/><path d="M-50 0H-30M30 0H50M-13-18L21 0-13 18ZM-23 39H23"/></>;
  case 'pumpStation':return <><rect x="-40" y="-35" width="80" height="70" rx="5"/><circle cx="-12" r="19"/><path d="M-20-10L0 0-20 10ZM12-24H30V24H12ZM-50 0H-40M40 0H50M-38 44H38"/></>;
  case 'filter':return <><path d="M-50 0H-30M30 0H50M0-32L32 0 0 32-32 0ZM-12-17L12 17M-20-8L4 25M-4-25L20 8"/></>;
  case 'filterAssembly':return <><path d="M-50 0H-38M38 0H50M-38-30H38V30H-38ZM-18-30V30M18-30V30M-38-15L-18 5M-38 5L-18 25M18-15L38 5M18 5L38 25"/></>;
  case 'treatment':return <><rect x="-34" y="-36" width="24" height="72" rx="10"/><rect x="10" y="-36" width="24" height="72" rx="10"/><path d="M-50 0H-34M-10-20H10M34 0H50M-30 43H30"/></>;
  case 'valve':return <>{valve}<path d="M0 0V-28M-13-45H13V-28H-13ZM-9-32L9-41"/></>;
  case 'ballValve':return <>{valve}<circle r="11"/><path d="M0-11V-34H26"/></>;
  case 'checkValve':return <><path d="M-50 0H-30M30 0H50M-30-22H30V22H-30ZM-20-16L16 0-20 16ZM18-18V18"/></>;
  case 'manifold':return <><path d="M-50 0H-40M-40-12H40V12H-40Z"/>{Array.from({length:outlets},(_,i)=><path key={i} d={`M${-35+70*i/Math.max(1,outlets-1)} 12V50`}/>)}</>;
  case 'reducer':return <>{valve}<path d="M0-20V-42M-18-42H18M-25 34H25M15 25L25 34 15 43"/></>;
  case 'regulator':return <>{valve}<circle cy="-34" r="12"/><path d="M0-22V-8M0-34L7-39M-20 36H20"/></>;
  case 'controller':return <><rect x="-38" y="-38" width="76" height="76" rx="5"/><path d="M-25-25H25V-4H-25ZM-50 0H-38M38 0H50"/>{[-20,0,20].map(x=><circle key={x} cx={x} cy="20" r="3"/>)}</>;
  case 'rainSensor':return <><path d="M-28 5H28L18 30H-18ZM0 30V42M28 15H50M-24-34L-30-18M0-38L-6-22M24-34L18-18"/></>;
  case 'weatherSensor':return <><circle cx="-17" cy="-20" r="13"/><path d="M-17-43V-38M-40-20H-35M-33-36L-29-32M-32 19Q-36 0-17 0Q-3-25 16-9Q36-10 35 9Q48 26 29 30H-19Q-35 30-32 19M35 15H50"/></>;
  case 'relay':return <><rect x="-35" y="-28" width="70" height="56"/><path d="M-50 0H-35M35 0H50M-26 12H-9L12-12M15 12H27M-15-38H15"/></>;
  case 'consumer':return <><path d="M-50 0H-28M0-28L28 0 0 28-28 0ZM-10 0H10M0-10V10"/></>;
 }
}
export function EngineeringIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 7h9v10h11M2 11h5v10h15M5 5v8M19 15v8M9 3v4M13 3v10h9"/></svg>;}
/** A route with connection points, distinct from the Engineering section icon. */
export function AutoRouteIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-engineering-icon="auto-route"><path d="M4 18V8h8v10h8M12 8V4M20 18v-7"/><circle cx="4" cy="19" r="2"/><circle cx="12" cy="3" r="2"/><circle cx="20" cy="9" r="2"/><path d="m17 3 .6 1.4L19 5l-1.4.6L17 7l-.6-1.4L15 5l1.4-.6Z" fill="currentColor" stroke="none"/></svg>;}
export function EngineeringThumb({type,outlets}:{type:EquipmentKind;outlets?:number}){
 return <svg viewBox="-55 -55 110 110" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><EngineeringGlyph type={type} outlets={outlets}/></svg>;
}

/** A 45-degree leader with a shelf measured from the actual label font. */
let measureContext:CanvasRenderingContext2D|null|undefined;
export function equipmentLeaderLayout(item:EngineeringEquipment,px:number,text:string){
 const font=uiPixels(12);
 if(typeof document!=='undefined'&&measureContext===undefined)measureContext=document.createElement('canvas').getContext('2d');
 if(measureContext)measureContext.font=`${font}px Arial`;
 const widthPx=(measureContext?.measureText(text).width??Array.from(text).reduce((n,c)=>n+font*(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c)?1:.6),0))+uiPixels(8);
 const dimensions=equipmentSymbolDimensions(item,px),radius=Math.max(dimensions.width,dimensions.height)/2;
 const offset=item.leaderOffset??{x:radius*.7+uiPixels(28)/px,y:-radius*.7-uiPixels(28)/px};
 const sx=offset.x<0?-1:1,sy=offset.y<0?-1:1,diagonal=Math.max(radius*.7+uiPixels(8)/px,Math.abs(offset.x),Math.abs(offset.y));
 const x=item.x+sx*radius*.7,y=item.y+sy*radius*.7,kneeX=item.x+sx*diagonal,kneeY=item.y+sy*diagonal;
 return {x,y,kneeX,kneeY,endX:kneeX+sx*widthPx/px,font:font/px,lineHeight:font*1.3/px,lines:[text]};
}
export function moveEquipmentLeader(item:EngineeringEquipment,start:{x:number;y:number},point:{x:number;y:number},px:number){
 const l=equipmentLeaderLayout(item,px,'');
 return {...item,leaderOffset:{x:l.kneeX-item.x+point.x-start.x,y:l.kneeY-item.y+point.y-start.y}};
}
export function EngineeringLeader({item,px,text,selected=false}:{item:EngineeringEquipment;px:number;text:string;selected?:boolean}){
 const l=equipmentLeaderLayout(item,px,text),rtl=localeDirection(activeLocale())==='rtl',left=Math.min(l.endX,l.kneeX),right=Math.max(l.endX,l.kneeX),textX=rtl?right-uiPixels(4)/px:left+uiPixels(4)/px,d=`M${l.x} ${l.y}L${l.kneeX} ${l.kneeY}H${l.endX}`,color=selected?'#e8892f':'#526471';
 return <g data-equipment-leader={item.id} style={{cursor:'move'}}><path d={d} fill="none" stroke="transparent" strokeWidth={uiPixels(18)/px} pointerEvents="stroke"/><path d={d} fill="none" stroke={color} strokeWidth={uiPixels(1)/px} pointerEvents="none"/><circle cx={l.x} cy={l.y} r={uiPixels(1.6)/px} fill={color}/><text x={textX} y={l.kneeY-uiPixels(4)/px} fontFamily="Arial, sans-serif" fill="#263741" stroke="none" fontSize={l.font} textAnchor={rtl?'end':'start'} direction={rtl?'rtl':'ltr'} unicodeBidi="plaintext" pointerEvents="all">{text}</text></g>;
}
