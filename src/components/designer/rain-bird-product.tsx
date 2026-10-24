import {useId} from 'react';
import type {CatalogItem} from '@/lib/equipment-catalog';
import {equipmentAppearance} from '@/lib/equipment-catalog';
import {rainBirdLibraryCategory} from '@/lib/rain-bird-library';

/** Original, transparent vector illustrations. No per-card image downloads. */
export function RainBirdProduct({item,className}:{item:CatalogItem;className?:string}) {
  const id=useId().replace(/:/g,''),family=rainBirdLibraryCategory(item);
  const color=equipmentAppearance(item).color;
  const body=`url(#${id}-body)`,top=`url(#${id}-top)`,cap=`url(#${id}-cap)`;
  const rotor=item.type==='rotor',sprayBody=item.type==='body';
  const largeRotor=/^(6504|8005)/.test(item.modelId??item.sku);
  const filterColor=item.arcMin===360?'#b5bfc0':'#60bda8';
  const greenTop=(item.modelId??item.sku).startsWith('5004+');
  const squareCap=family==='sq';
  return <svg viewBox="0 0 120 120" role="img" aria-label={`Rain Bird ${item.modelId??item.sku}`} className={className} focusable="false">
    <defs>
      <linearGradient id={`${id}-body`} x1="0" x2="1"><stop stopColor="#111618"/><stop offset=".4" stopColor="#444b4d"/><stop offset=".68" stopColor="#252c2d"/><stop offset="1" stopColor="#090c0d"/></linearGradient>
      <linearGradient id={`${id}-top`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#626b6d"/><stop offset=".55" stopColor="#252c2e"/><stop offset="1" stopColor="#0a1012"/></linearGradient>
      <linearGradient id={`${id}-cap`} x1="0" y1="0" x2=".6" y2="1"><stop stopColor={color}/><stop offset="1" stopColor={color}/></linearGradient>
      <linearGradient id={`${id}-silver`} x1="0" y1="0" x2=".3" y2="1"><stop stopColor="#fafafa"/><stop offset=".5" stopColor="#aaa7a8"/><stop offset="1" stopColor="#777477"/></linearGradient>
    </defs>
    {rotor||sprayBody?<g stroke="#151c1e" strokeWidth="1.2" strokeLinejoin="round">
      <path d="M36 56h48v48c0 8-48 8-48 0Z" fill={body}/>
      <ellipse cx="60" cy="57" rx="24" ry="8" fill={top}/>
      <path d="M42 58V28h36v30c0 7-36 7-36 0Z" fill={body}/>
      <path d={largeRotor?'M39 18Q60 8 81 18v16q-21 11-42 0Z':'M40 23Q60 14 80 23v13q-20 10-40 0Z'} fill={body}/>
      <ellipse cx="60" cy={largeRotor?18:23} rx={largeRotor?21:20} ry="7" fill={greenTop?'#27683a':top}/>
      {(item.modelId??item.sku).endsWith('PCR')&&<path d="M35 57q25 9 50 0" fill="none" stroke="#ecefeb" strokeWidth="3"/>}
      <path d="M54 21h12m-6-3v6" stroke="#9ea5a6" strokeWidth="1.6"/>
      {rotor?<><path d="M51 32q9-5 18 0v7q-9 5-18 0Z" fill={cap}/><ellipse cx="60" cy="36" rx="3.3" ry="2" fill="#080e11"/></>:<ellipse cx="60" cy="22" rx="12" ry="4" fill="#f1a626"/>}
      {[41,47,73,79].map(x=><path key={x} d={`M${x} 68v31`} stroke="#737b7d" strokeOpacity=".35"/>) }
      <path d="M44 89h32v10H44Z" fill="#17221b" stroke="#6b7a64" strokeWidth=".7"/>
      <path d="M50 94h20" stroke="#c5b86c" strokeWidth="1.7"/>
      <path d="M41 106q19 6 38 0" fill="none" stroke="#697375"/>
    </g>:family==='rvan'?<g stroke="#192022" strokeWidth="1.1" strokeLinejoin="round">
      <path d="M48 79h24v29q-12 5-24 0Z" fill={filterColor}/>
      {[83,87,91,95,99,103,107].map(y=><path key={y} d={`M49 ${y}q11 4 22 0`} stroke="#213f3a" strokeWidth=".7"/>)}
      {[52,56,60,64,68].map(x=><path key={x} d={`M${x} 82v26`} stroke="#e1f6ef" strokeOpacity=".8" strokeWidth=".7"/>)}
      <path d="M37 53h46v31q-23 13-46 0Z" fill={item.arcMin===360?cap:body}/>
      {[42,48,54,66,72,78].map(x=><path key={x} d={`M${x} 61v22`} stroke="#687275" strokeWidth="2"/>)}
      <path d="M33 37h54v19q-27 15-54 0Z" fill={cap}/>
      <ellipse cx="60" cy="37" rx="27" ry="10" fill={cap}/>
      <path d="M39 39q21 12 42 0M38 50q22 11 44 0" fill="none" stroke="#080d0f" strokeOpacity=".5"/>
      <path d="M39 36q4-17 21-17t21 17q-21 9-42 0Z" fill={`url(#${id}-silver)`} stroke="#999496"/>
      <ellipse cx="60" cy="23" rx="10" ry="3.7" fill="#d5d1d0" stroke="#bbb6b7"/>
      {[37,43,49,55,65,71,77,83].map(x=><path key={x} d={`M${x} 43v8`} stroke="#111619" strokeOpacity=".6"/>)}
    </g>:<g stroke="#171d1f" strokeWidth="1.1" strokeLinejoin="round">
      <path d="M46 78h28l-3 27q-11 5-22 0Z" fill={squareCap?cap:family==='bubbler'?body:'#333b35'}/>
      {[85,91,97].map(y=><path key={y} d={`M48 ${y}h24`} stroke="#6f7973"/>)}
      <path d="M32 48h56v30q-28 14-56 0Z" fill={body}/>
      {[37,43,49,55,65,71,77,83].map(x=><path key={x} d={`M${x} 55v19`} stroke="#626d70" strokeWidth="1.4"/>) }
      <ellipse cx="60" cy="48" rx="28" ry="11" fill={top}/>
      <path d="M36 40h48v11q-24 12-48 0Z" fill={squareCap?top:cap}/>
      <ellipse cx="60" cy="40" rx="24" ry="9" fill={squareCap?top:cap}/>
      <ellipse cx="60" cy="40" rx="17" ry="6.4" fill={family==='hevan'?cap:top}/>
      {family==='hevan'&&<><path d="M43 39h34M60 35v10" stroke="#151d1b" strokeWidth="1.5"/><path d="M42 79q18 6 36 0" stroke={color} strokeWidth="3"/></>}
      {family==='sq'?<><path d="M50 40h20" stroke="#aab2b3" strokeWidth="3"/><path d="m55 35 10 10m-10 0 10-10" stroke="#d3d7d8"/></>:<><ellipse cx="60" cy="40" rx="5" ry="3" fill="#bec5c6"/><path d="M56 40h8" stroke="#252c2e"/></>}
      {family==='hevan'&&<path d="M37 56q23 12 46 0M37 61q23 12 46 0" fill="none" stroke="#b4bcbc" strokeWidth="1.6"/>}
      {family==='u-series'&&<path d="M49 59q11 4 22 0M50 66q10 4 20 0" fill="none" stroke="#04090a" strokeWidth="3.5"/>}
      {family==='strips'&&<path d="M47 46h26" stroke="#c6cdce" strokeWidth="2"/>}
    </g>}
  </svg>;
}
