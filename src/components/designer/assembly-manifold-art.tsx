/** Repeated orthographic T modules share one horizontal axis and never overlap. */
export function ManifoldArtwork({outlets=1,span=220}:{outlets?:number;span?:number}){
 const count=Math.max(1,Math.min(128,Math.round(outlets))),columns=Math.min(count,8),rows=Math.ceil(count/8),width=span/columns,height=Math.min(115/rows,span/columns*.55);
 return <g data-manifold-art="bare" pointerEvents="none">
  {Array.from({length:count},(_,i)=><image key={i} data-manifold-outlet={i} data-assembly-art="manifold-module-v2" href="/engineering/assembly/manifold-module-v2.webp" xlinkHref="/engineering/assembly/manifold-module-v2.webp" x={-columns*width/2+(i%8)*width-4} y={-100+Math.floor(i/8)*height} width={width+8} height={height} preserveAspectRatio="xMidYMid meet"/>)}
 </g>;
}
