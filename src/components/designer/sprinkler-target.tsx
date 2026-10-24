import {HEAD_SYMBOL_RADIUS,headSymbolScale} from '@/lib/head-presentation';

export const SPRINKLER_TARGET_COLOR='#0f9f82';
export const SPRINKLER_TARGET_CIRCLE=6;
export const SPRINKLER_TARGET_CROSS=`M-${HEAD_SYMBOL_RADIUS} 0H${HEAD_SYMBOL_RADIUS}M0 -${HEAD_SYMBOL_RADIUS}V${HEAD_SYMBOL_RADIUS}`;

/** White-backed green cross and centre circle, sized like an installed head. */
export function SprinklerTarget({x=0,y=0,px=36,color=SPRINKLER_TARGET_COLOR}:{x?:number;y?:number;px?:number;color?:string}) {
  return <g data-sprinkler-target transform={`translate(${x} ${y}) scale(${headSymbolScale(px)})`} fill="none" strokeLinecap="round" pointerEvents="none">
    <circle r={SPRINKLER_TARGET_CIRCLE} fill={`${color}33`} stroke="white" strokeWidth="2.5"/>
    <path d={SPRINKLER_TARGET_CROSS} stroke="white" strokeWidth="3"/>
    <circle r={SPRINKLER_TARGET_CIRCLE} stroke={color} strokeWidth="1.25"/>
    <path d={SPRINKLER_TARGET_CROSS} stroke={color} strokeWidth="1.25"/>
  </g>;
}
