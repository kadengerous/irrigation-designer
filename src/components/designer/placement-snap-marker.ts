/** Screen-sized placement cue; retain a clear centre so the underlying join is visible. */
export function drawPlacementSnapMarker(ctx:CanvasRenderingContext2D,size:number,snapKind?:string){
  if(!snapKind||snapKind==='none')return;
  const c=size/2;
  const boundary=['edge','end','mid','intersect','tangent','horiz','vert'].includes(snapKind);
  const radius=boundary?7:5;
  ctx.save();
  ctx.strokeStyle='#12a647';ctx.lineWidth=1;
  ctx.setLineDash([4,3]);ctx.beginPath();
  ctx.moveTo(3,c);ctx.lineTo(c-8,c);ctx.moveTo(c+8,c);ctx.lineTo(size-3,c);
  ctx.moveTo(c,3);ctx.lineTo(c,c-8);ctx.moveTo(c,c+8);ctx.lineTo(c,size-3);
  ctx.stroke();ctx.setLineDash([]);
  if(boundary){
    ctx.beginPath();ctx.arc(c,c,radius+2,0,Math.PI*2);ctx.strokeStyle='rgba(18,166,71,.22)';ctx.lineWidth=5;ctx.stroke();
  }
  ctx.beginPath();ctx.arc(c,c,radius,0,Math.PI*2);ctx.strokeStyle='#12a647';ctx.lineWidth=boundary?2:1;ctx.stroke();
  ctx.restore();
}
