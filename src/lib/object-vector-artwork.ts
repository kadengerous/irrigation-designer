import {defaultLandscapeSize,landscapeFootprint,landscapeRecord,type LandscapeObject,type LandscapeRecord} from './landscape-objects';
import type {LandscapeVectorArtwork,LandscapeVectorPath} from './landscape-vector-types';

type Point=[number,number];
const C={ink:'#625f55',wood:'#c5a982',woodLight:'#e1ceb0',metal:'#bbc7c8',dark:'#707b7d',stone:'#c6c4b9',water:'#a8d8df',waterInk:'#568d9b',cloth:'#f1e8d7',leaf:'#a3ba80',soil:'#a7987d',light:'#f4e6aa',white:'#fbf7ed',corten:'#b98762'};
const num=(n:number)=>String(Math.round(n*1e6)/1e6);

/** Inset the painted edge (including concave corners) by its stroke margin.
 * The stored footprint and artwork dimensions remain unchanged. */
function paintInset(points:Point[],margin=.009):Point[]{
 const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length]!;return sum+p[0]*q[1]-q[0]*p[1];},0),sign=area>=0?1:-1;
 return points.map((b,i)=>{
  const a=points[(i+points.length-1)%points.length]!,c=points[(i+1)%points.length]!;
  const u:Point=[b[0]-a[0],b[1]-a[1]],v:Point=[c[0]-b[0],c[1]-b[1]],lu=Math.hypot(...u),lv=Math.hypot(...v);
  if(!lu||!lv)return b;
  const p:Point=[b[0]-u[1]/lu*margin*sign,b[1]+u[0]/lu*margin*sign],q:Point=[b[0]-v[1]/lv*margin*sign,b[1]+v[0]/lv*margin*sign];
  const det=u[0]*v[1]-u[1]*v[0];if(Math.abs(det)<1e-10)return [(p[0]+q[0])/2,(p[1]+q[1])/2];
  const t=((q[0]-p[0])*v[1]-(q[1]-p[1])*v[0])/det;return [p[0]+u[0]*t,p[1]+u[1]*t];
 });
}

/** Paths are drawn in an object-local unit square, then written in physical metres. */
class PlanArt {
 paths:LandscapeVectorPath[]=[];
 constructor(readonly width:number,readonly height:number){}
 path(points:Point[],close=true){return points.map(([x,y],i)=>`${i?'L':'M'}${num(x*this.width)} ${num(y*this.height)}`).join(' ')+(close?' Z':'');}
 svg(spec:string){let axis=0;return spec.replace(/[MLCQZ]|-?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi,t=>{if(/^[MLCQZ]$/i.test(t)){axis=0;return t.toUpperCase();}return num(Number(t)*(axis++%2?this.height:this.width));});}
 add(d:string,fill='none',stroke:string=C.ink,weight=1){this.paths.push({d,fill,stroke,strokeWidth:Math.min(this.width,this.height)*.012*weight});}
 p(points:Point[],fill='none',weight=1,stroke:string=C.ink){this.add(this.path(points),fill,stroke,weight);}
 l(x:number,y:number,x2:number,y2:number,weight=.8,stroke:string=C.ink){this.add(this.path([[x,y],[x2,y2]],false),'none',stroke,weight);}
 curve(spec:string,fill='none',weight=1,stroke:string=C.ink){this.add(this.svg(spec),fill,stroke,weight);}
 box(x:number,y:number,w:number,h:number,fill:string=C.woodLight,weight=1,r=0){
  if(!r)return this.p([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],fill,weight);
  const a=Math.min(r,w/2,h/2);this.curve(`M ${x+a} ${y} L ${x+w-a} ${y} Q ${x+w} ${y} ${x+w} ${y+a} L ${x+w} ${y+h-a} Q ${x+w} ${y+h} ${x+w-a} ${y+h} L ${x+a} ${y+h} Q ${x} ${y+h} ${x} ${y+h-a} L ${x} ${y+a} Q ${x} ${y} ${x+a} ${y} Z`,fill,weight);
 }
 ellipsePath(x:number,y:number,rx:number,ry=rx,reverse=false){const k=.5522847498,sgn=reverse?-1:1;return this.svg(`M ${x-rx} ${y} C ${x-rx} ${y-sgn*ry*k} ${x-rx*k} ${y-sgn*ry} ${x} ${y-sgn*ry} C ${x+rx*k} ${y-sgn*ry} ${x+rx} ${y-sgn*ry*k} ${x+rx} ${y} C ${x+rx} ${y+sgn*ry*k} ${x+rx*k} ${y+sgn*ry} ${x} ${y+sgn*ry} C ${x-rx*k} ${y+sgn*ry} ${x-rx} ${y+sgn*ry*k} ${x-rx} ${y} Z`);}
 oval(x:number,y:number,rx:number,ry=rx,fill:string=C.stone,weight=1){this.add(this.ellipsePath(x,y,rx,ry),fill,C.ink,weight);}
 ring(x:number,y:number,rx:number,ry:number,inside:number,fill:string=C.stone,weight=1){this.add(this.ellipsePath(x,y,rx,ry)+' '+this.ellipsePath(x,y,rx*inside,ry*inside,true),fill,C.ink,weight);}
 polygon(x:number,y:number,rx:number,ry:number,n:number,fill:string=C.stone,angle=-Math.PI/2,weight=1){this.p(Array.from({length:n},(_,i)=>[x+rx*Math.cos(angle+i*Math.PI*2/n),y+ry*Math.sin(angle+i*Math.PI*2/n)] as Point),fill,weight);}
 arc(x:number,y:number,rx:number,ry:number,start:number,end:number,weight=1,stroke:string=C.ink){this.add(this.path(Array.from({length:33},(_,i)=>{const a=start+(end-start)*i/32;return [x+rx*Math.cos(a),y+ry*Math.sin(a)] as Point;}),false),'none',stroke,weight);}
 slats(x:number,y:number,w:number,h:number,count:number,vertical=true,fill:string=C.wood){for(let i=0;i<count;i++){const f=(i+.12)/count,g=.76/count;this.box(x+(vertical?w*f:0),y+(vertical?0:h*f),vertical?w*g:w,vertical?h:h*g,fill,.6);}}
 screws(points:Point[],radius=.012){for(const [x,y] of points)this.oval(x,y,radius,radius,C.dark,.5);}
 blossom(x:number,y:number,r:number,leaves=6){for(let i=0;i<leaves;i++){const a=i*Math.PI*2/leaves;this.oval(x+Math.cos(a)*r*.5,y+Math.sin(a)*r*.5,r*.39,r*.31,C.leaf,.55);}this.oval(x,y,r*.17,r*.17,C.soil,.55);}
 grill(x:number,y:number,w:number,h:number,count=7){this.box(x,y,w,h,C.dark,.8,.015);for(let i=1;i<count;i++)this.l(x+w*i/count,y+.012,x+w*i/count,y+h-.012,.6,C.white);}
 sink(x:number,y:number,w:number,h:number){this.box(x,y,w,h,C.metal,.8,.025);this.box(x+w*.12,y+h*.16,w*.76,h*.68,C.dark,.5,.015);this.oval(x+w*.5,y+h*.57,Math.min(w,h)*.06,Math.min(w,h)*.06,C.white,.5);this.curve(`M ${x+w*.7} ${y} Q ${x+w*.7} ${y-h*.13} ${x+w*.48} ${y-h*.13} L ${x+w*.48} ${y+h*.25}`,'none',1.2);}
 fan(x:number,y:number,rx:number,ry=rx){this.oval(x,y,rx,ry,C.dark,.8);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const pts:Point[]=[[x,y],[x+Math.cos(a)*rx*.75,y+Math.sin(a)*ry*.75],[x+Math.cos(a+.5)*rx*.78,y+Math.sin(a+.5)*ry*.78],[x+Math.cos(a+1.1)*rx*.25,y+Math.sin(a+1.1)*ry*.25]];this.p(pts,C.metal,.4);}this.oval(x,y,rx*.15,ry*.15,C.white,.6);}
 flame(x:number,y:number,rx:number,ry:number){this.curve(`M ${x-rx*.9} ${y+ry*.6} Q ${x-rx} ${y-ry*.1} ${x-rx*.25} ${y-ry*.85} Q ${x-rx*.3} ${y-ry*.1} ${x+rx*.1} ${y} L ${x+rx*.7} ${y-ry*.55} Q ${x+rx} ${y+ry*.8} ${x} ${y+ry*.85} Z`,C.corten,.7);}
 water(x:number,y:number,w:number,h:number,rows=2){for(let i=0;i<rows;i++){const yy=y+h*(i+1)/(rows+1);this.curve(`M ${x} ${yy} Q ${x+w*.12} ${yy-h*.10} ${x+w*.25} ${yy} T ${x+w*.5} ${yy}`.replace(' T ',` Q ${x+w*.38} ${yy+h*.10} `),'none',1.2,C.white);this.curve(`M ${x+w*.5} ${yy} Q ${x+w*.62} ${yy-h*.10} ${x+w*.75} ${yy} Q ${x+w*.88} ${yy+h*.10} ${x+w} ${yy}`,'none',1.2,C.white);}}
}

function furniture(a:PlanArt,id:string,foot:Point[]):boolean {
 const post=(x:number,y:number)=>a.box(x-.025,y-.025,.05,.05,C.dark);
 const seat=(x:number,y:number,w:number,h:number,back=true)=>{a.box(x,y,w,h,C.cloth,.8,.025);if(back)a.box(x-.01,y-.035,w+.02,.065,C.wood,.8,.015);};
 switch(id){
 case 'gazebo-square':a.box(-.485,-.485,.97,.97);a.p([[-.43,-.43],[.43,-.43],[.43,.43],[-.43,.43]],C.wood);for(const [x,y] of [[-.43,-.43],[.43,-.43],[.43,.43],[-.43,.43]])a.l(x,y,0,0);for(let i=1;i<5;i++){const f=i*.08;a.p([[-.43+f,-.43+f],[.43-f,-.43+f],[.43-f,.43-f],[-.43+f,.43-f]],'none',.45);}a.oval(0,0,.025,.025,C.dark);break;
 case 'gazebo-rectangle':a.box(-.48,-.47,.96,.94,C.wood);a.l(-.29,0,.29,0,1.5);for(const x of [-.48,.48])for(const y of [-.47,.47])a.l(x,y,x<0?-.29:.29,0);for(let i=1;i<5;i++){a.l(-.38,-.47+i*.08,.38,-.47+i*.08,.4);a.l(-.38,.47-i*.08,.38,.47-i*.08,.4);}break;
 case 'gazebo-round':a.polygon(0,0,.48,.48,12,C.wood);a.polygon(0,0,.405,.405,12,C.woodLight);for(let i=0;i<12;i++){const t=i*Math.PI/6;a.l(0,0,Math.cos(t)*.46,Math.sin(t)*.46,.8);}a.polygon(0,0,.10,.10,12,C.wood);break;
 case 'gazebo-open':a.p(paintInset(foot),C.woodLight);a.polygon(0,0,.45,.40,6,'none');for(let i=0;i<6;i++){const t=i*Math.PI/3;post(Math.cos(t)*.43,Math.sin(t)*.43);}a.oval(0,0,.15,.15,C.wood);for(const y of [-.26,.26])seat(-.2,y-.04,.4,.08);break;
 case 'pergola-square':for(const x of [-.43,.43])for(const y of [-.43,.43])post(x,y);a.box(-.48,-.38,.96,.055,C.wood);a.box(-.48,.32,.96,.055,C.wood);a.slats(-.43,-.48,.86,.96,7,true);break;
 case 'pergola-rectangle':for(const x of [-.44,0,.44])for(const y of [-.40,.40])post(x,y);for(const x of [-.43,.43])a.box(x-.025,-.48,.05,.96,C.wood);a.slats(-.48,-.42,.96,.84,10,false);break;
 case 'pergola-vines':for(const x of [-.43,.43])for(const y of [-.43,.43])post(x,y);a.slats(-.43,-.46,.86,.92,6,true);for(const y of [-.29,.29])a.box(-.47,y,.94,.04,C.wood);for(const [x,y,r] of [[-.31,-.35,.12],[.25,.3,.14],[-.25,.28,.16],[.28,-.28,.13]])a.blossom(x,y,r);break;
 case 'canopy-freestanding':for(const x of [-.44,.44])for(const y of [-.42,.42])post(x,y);a.curve('M -.46 -.44 Q 0 -.33 .46 -.44 Q .34 0 .46 .44 Q 0 .33 -.46 .44 Q -.34 0 -.46 -.44 Z',C.cloth);a.l(-.46,-.44,.46,.44,.6);a.l(.46,-.44,-.46,.44,.6);break;
 case 'canopy-lounge':for(const x of [-.45,.45])for(const y of [-.44,.44])post(x,y);a.box(-.46,-.47,.92,.11,C.cloth);a.box(-.46,.36,.92,.11,C.cloth);seat(-.36,-.27,.22,.52);seat(.14,-.27,.22,.52);a.box(-.055,-.10,.11,.20,C.wood,.8,.018);a.l(-.42,-.36,-.42,.36,.6);a.l(.42,-.36,.42,.36,.6);break;
 case 'bench-wood':a.slats(-.47,-.37,.94,.65,4,false);a.box(-.49,-.49,.98,.08,C.wood);for(const x of [-.35,.35])a.box(x-.025,-.46,.05,.91,C.dark,.8);break;
 case 'bench-metal':a.box(-.43,-.24,.86,.54,C.metal,.8,.09);for(let i=-3;i<=3;i++)a.l(i*.11,-.17,i*.11,.24,.55);a.curve('M -.49 .35 L -.49 -.28 Q -.49 -.47 -.30 -.47 L .30 -.47 Q .49 -.47 .49 -.28 L .49 .35','none',2.4);a.curve('M -.40 -.30 Q 0 -.05 .40 -.30','none',1.2);break;
 case 'bench-modern':a.box(-.485,-.29,.97,.57,C.woodLight,.8,.035);for(const x of [-.41,.33])a.box(x,-.43,.08,.86,C.stone);a.l(-.30,-.06,.30,-.06,.5);a.l(-.30,.08,.30,.08,.5);break;
 case 'table-round':a.oval(0,0,.485,.485,C.wood);for(let i=0;i<24;i++){const t=i*Math.PI/12;a.l(Math.cos(t)*.1,Math.sin(t)*.1,Math.cos(t)*.44,Math.sin(t)*.44,.6);}a.oval(0,0,.095,.095,C.woodLight,.7);break;
 case 'table-square':a.box(-.48,-.48,.96,.96,C.woodLight);a.p([[-.36,-.36],[.36,-.36],[.36,.36],[-.36,.36]],'none',.7);a.l(-.36,-.36,.36,.36,.45);a.l(.36,-.36,-.36,.36,.45);a.screws([[-.42,-.42],[.42,-.42],[.42,.42],[-.42,.42]]);break;
 case 'table-rectangle':a.box(-.49,-.45,.98,.9,C.wood,.8,.045);a.slats(-.43,-.38,.86,.76,5,false,C.woodLight);a.box(-.47,-.4,.035,.80,C.wood);a.box(.435,-.4,.035,.80,C.wood);break;
 case 'chair-wood':a.slats(-.34,-.16,.68,.58,4,true);a.slats(-.41,-.47,.82,.19,4,true);a.box(-.41,-.25,.82,.05,C.wood);for(const x of [-.35,.35])a.box(x-.025,-.3,.05,.76,C.wood);break;
 case 'chair-armchair':a.curve('M -.44 .32 L -.44 -.18 Q -.44 -.48 0 -.48 Q .44 -.48 .44 -.18 L .44 .32 L .28 .32 L .28 -.1 Q 0 -.28 -.28 -.1 L -.28 .32 Z',C.wood);seat(-.27,-.09,.54,.53,false);for(const x of [-.36,.36])for(let i=0;i<4;i++)a.l(x-.05,-.18+i*.11,x+.05,-.13+i*.11,.5);break;
 case 'chair-modern':a.curve('M -.43 -.12 Q -.47 -.47 0 -.47 Q .47 -.47 .43 -.12 L .35 .43 L -.35 .43 Z',C.metal);a.curve('M -.31 -.10 Q 0 -.24 .31 -.10 L .25 .32 Q 0 .43 -.25 .32 Z',C.cloth,.7);a.l(-.32,-.28,.32,-.28,.6);break;
 case 'set-dining':a.box(-.29,-.27,.58,.54,C.woodLight,.9,.06);for(const x of [-.20,.20])for(const y of [-.44,.33])seat(x-.085,y,.17,.12,y<0);for(const x of [-.46,.34])seat(x,-.11,.12,.22,false);a.oval(0,0,.045,.045,C.leaf);break;
 case 'set-lounge':seat(-.45,-.43,.9,.24);seat(-.45,-.12,.22,.54);seat(.23,-.1,.22,.52);a.box(-.15,-.02,.30,.34,C.woodLight,.8,.035);for(const x of [-.29,0,.29])a.l(x,-.34,x,-.2,.6);a.oval(0,.10,.04,.04,C.leaf);break;
 case 'swing-wood':for(const x of [-.43,.43]){a.p([[x-.035,-.46],[x+.035,-.46],[x+.035,.46],[x-.035,.46]],C.wood);a.l(x,-.38,x,.38,1.7);}a.box(-.48,-.41,.96,.075,C.wood);a.slats(-.32,-.05,.64,.35,4,false);for(const x of [-.32,.32])a.l(x,-.37,x,.31,.8);break;
 case 'swing-canopy':a.box(-.46,-.47,.92,.37,C.cloth,.8,.045);for(let i=-2;i<=2;i++)a.l(i*.15,-.46,i*.15,-.12,.45);seat(-.33,.02,.66,.28);for(const x of [-.39,.39]){a.l(x,-.1,x,.45,2);a.l(x,-.1,Math.sign(x)*.30,.03,.8);}break;
 case 'lounger-wood':a.box(-.43,-.48,.86,.96,C.wood,.8,.07);a.slats(-.34,-.43,.68,.40,5,false,C.woodLight);a.slats(-.34,.02,.68,.40,5,false,C.woodLight);a.l(-.43,-.005,.43,-.005,1.4);break;
 case 'lounger-cushion':a.box(-.47,-.47,.94,.94,C.dark,.8,.075);a.box(-.38,-.39,.76,.34,C.cloth,.8,.08);a.box(-.38,-.01,.76,.42,C.cloth,.8,.075);a.box(-.26,-.42,.52,.13,C.white,.6,.035);a.l(-.35,.17,.35,.17,.45);break;
 case 'umbrella-round':{const pts:Point[]=Array.from({length:32},(_,i)=>{const t=i*Math.PI/16,r=i%4===2?.43:.48;return [Math.cos(t)*r,Math.sin(t)*r];});a.p(pts,C.cloth);for(let i=0;i<8;i++){const t=i*Math.PI/4;a.l(0,0,Math.cos(t)*.48,Math.sin(t)*.48,.7);}a.oval(0,0,.035,.035,C.wood);break;}
 case 'umbrella-square':a.curve('M -.48 -.48 Q 0 -.39 .48 -.48 Q .39 0 .48 .48 Q 0 .39 -.48 .48 Q -.39 0 -.48 -.48 Z',C.cloth);for(const [x,y] of [[-.48,-.48],[.48,-.48],[.48,.48],[-.48,.48],[0,-.4],[0,.4],[-.4,0],[.4,0]])a.l(0,0,x,y,.7);a.box(-.025,-.025,.05,.05,C.wood);break;
 case 'sofa-outdoor':a.box(-.48,-.46,.96,.91,C.wood,.8,.08);for(let i=0;i<3;i++)a.box(-.37+i*.25,-.12,.23,.47,C.cloth,.6,.035);for(let i=0;i<3;i++)a.box(-.37+i*.25,-.35,.23,.20,C.white,.6,.035);a.box(-.46,-.13,.065,.52,C.cloth,.6,.02);a.box(.395,-.13,.065,.52,C.cloth,.6,.02);break;
 case 'hammock-timber':for(const x of [-.44,.37])a.box(x,-.42,.07,.84,C.wood);for(const y of [-.45,.41])a.box(-.48,y,.96,.045,C.wood);a.curve('M 0 -.42 Q -.40 -.18 -.34 .25 Q 0 .46 .34 .25 Q .40 -.18 0 -.42 Z',C.cloth);for(let i=-2;i<=2;i++)a.curve(`M 0 -.4 Q ${i*.16} -.1 ${i*.12} .32`,'none',.6);break;
 case 'table-picnic-attached':a.slats(-.27,-.47,.54,.94,5,true,C.woodLight);a.slats(-.48,-.40,.13,.80,2,true,C.wood);a.slats(.35,-.40,.13,.80,2,true,C.wood);for(const y of [-.28,.28]){a.l(-.35,y,-.27,y,2.5);a.l(.27,y,.35,y,2.5);}break;
 case 'bench-semicircle':a.p(paintInset(foot),C.woodLight);for(let i=1;i<16;i++){const t=Math.PI+i*Math.PI/16;a.l(Math.cos(t)*.345,.5+Math.sin(t)*.69,Math.cos(t)*.49,.5+Math.sin(t)*.98,.65);}a.arc(0,.49,.475,.95,Math.PI,Math.PI*2,1.5);break;
 default:return false;
 }
 return true;
}

function lighting(a:PlanArt,id:string):boolean {
 const bolt=(x:number,y:number)=>{a.oval(x,y,.025,.025,C.metal,.5);a.l(x-.012,y,x+.012,y,.5);};
 switch(id){
 case 'light-lantern':a.box(-.44,-.44,.88,.88,C.dark,.9,.035);a.box(-.33,-.33,.66,.66,C.light,.7);a.box(-.24,-.24,.48,.48,C.metal,.6);for(const x of [-.435,.435])for(const y of [-.435,.435]){a.box(x-.035,y-.035,.07,.07,C.wood,.7);a.l(x,y,0,0,1.2);}a.oval(0,0,.075,.075,C.wood,.7);break;
 case 'light-post':a.ring(0,0,.48,.48,.77,C.dark);a.oval(0,0,.34,.34,C.light,.8);for(let i=0;i<6;i++){const t=i*Math.PI/3;a.l(Math.cos(t)*.09,Math.sin(t)*.09,Math.cos(t)*.39,Math.sin(t)*.39,1.1);}a.oval(0,0,.08,.08,C.dark);break;
 case 'light-bollard':a.box(-.47,-.47,.94,.94,C.dark,.9,.02);a.box(-.39,-.39,.78,.78,C.light,.6,.018);a.box(-.32,-.32,.64,.64,C.dark,.6,.012);a.l(-.31,-.28,.26,-.28,.4,C.metal);break;
 case 'light-bollard-round':a.oval(0,0,.48,.48,C.dark);a.ring(0,0,.37,.37,.76,C.light,.7);a.oval(0,0,.18,.18,C.metal,.7);a.screws([[0,-.43],[0,.43]],.02);break;
 case 'light-ground':a.oval(0,0,.48,.48,C.metal);a.oval(0,0,.35,.35,C.light,.8);a.oval(0,0,.27,.27,C.white,.5);bolt(-.415,0);bolt(.415,0);a.l(-.17,-.18,.05,-.18,.5);break;
 case 'light-globe':a.oval(0,0,.485,.485,C.light,.9);a.arc(-.025,.015,.39,.39,Math.PI*1.12,Math.PI*1.73,.8,C.white);a.oval(-.16,-.20,.055,.055,C.white,.3);a.arc(0,0,.445,.445,0,Math.PI*.85,.45);break;
 case 'light-wall':a.box(-.49,-.43,.98,.86,C.dark,.9,.025);a.box(-.43,-.33,.86,.15,C.light,.6,.012);a.box(-.43,.18,.86,.15,C.light,.6,.012);a.l(-.43,-.12,.43,-.12,.5,C.metal);a.l(-.43,.12,.43,.12,.5,C.metal);break;
 case 'light-path':a.box(-.49,-.40,.98,.80,C.dark,.9,.025);a.box(-.35,-.28,.70,.56,C.light,.6,.025);bolt(-.425,0);bolt(.425,0);a.l(-.26,-.18,.18,-.18,.65,C.white);break;
 case 'light-copper-hex':a.polygon(0,0,.49,.49,6,C.corten);a.polygon(0,0,.37,.37,6,C.light);for(let i=0;i<6;i++){const t=-Math.PI/2+i*Math.PI/3;a.l(0,0,Math.cos(t)*.49,Math.sin(t)*.49,.8);}a.polygon(0,0,.10,.10,6,C.corten);break;
 case 'light-mushroom':a.oval(0,0,.49,.49,C.metal);a.oval(0,.02,.38,.34,C.light,.7);a.oval(0,0,.13,.13,C.dark,.8);for(let i=0;i<8;i++){const t=i*Math.PI/4;a.l(Math.cos(t)*.16,Math.sin(t)*.16,Math.cos(t)*.33,Math.sin(t)*.3,.5);}break;
 case 'light-halo-ring':a.ring(0,0,.485,.485,.65,C.dark);a.ring(0,0,.43,.43,.81,C.light,.6);a.box(-.08,.325,.16,.145,C.dark,.6,.02);break;
 case 'light-solar-tile':a.box(-.48,-.48,.96,.96,C.metal,.9,.045);a.box(-.37,-.38,.74,.42,'#607d8b',.7);for(let i=1;i<4;i++)a.l(-.37+i*.185,-.37,-.37+i*.185,.03,.5,C.white);a.l(-.36,-.18,.36,-.18,.5,C.white);a.box(-.37,.13,.74,.24,C.light,.6,.02);break;
 case 'light-linear-recessed':a.box(-.45,-.49,.9,.98,C.dark,.8,.04);a.box(-.24,-.44,.48,.88,C.light,.6,.025);for(const y of [-.40,.40])a.oval(0,y,.10,.022,C.white,.4);break;
 case 'light-double-head':a.box(-.22,-.09,.44,.18,C.dark,.8,.025);for(const x of [-.285,.285]){a.oval(x,0,.20,.43,C.metal,.8);a.oval(x,0,.175,.375,C.dark,.7);a.arc(x,0,.188,.40,Math.PI*.12,Math.PI*.88,.7,C.light);}a.l(-.055,-.09,-.055,.09,.6);a.l(.055,-.09,.055,.09,.6);break;
 case 'light-louver-square':a.box(-.48,-.48,.96,.96,C.dark,.9,.02);a.box(-.36,-.37,.72,.74,C.light,.6);for(let i=-2;i<=2;i++)a.p([[-.4,i*.14-.045],[.4,i*.14+.015],[.4,i*.14+.055],[-.4,i*.14-.005]],C.metal,.55);break;
 case 'light-stone-lamp':a.polygon(0,0,.485,.47,7,C.stone,-1.5);a.polygon(0,0,.35,.34,7,C.light,-1.5);a.polygon(0,0,.15,.14,6,C.stone);a.l(-.37,-.15,-.28,-.32,.6);a.l(.25,.32,.41,.1,.6);break;
 case 'light-perforated-cube':a.box(-.48,-.48,.96,.96,C.dark,.9,.015);for(let y=0;y<5;y++)for(let x=0;x<5;x++)a.oval(-.32+x*.16,-.32+y*.16,.037,.037,C.light,.4);a.l(-.46,-.40,-.40,-.46,.5);break;
 case 'light-wood-slats':a.box(-.44,-.46,.88,.92,C.light,.8,.02);a.slats(-.43,-.47,.86,.94,6,true,C.wood);a.box(-.47,-.40,.94,.055,C.wood);a.box(-.47,.345,.94,.055,C.wood);break;
 case 'light-triangular':a.p([[0,-.49],[.49,.42],[-.49,.42]],C.dark);a.p([[0,-.32],[.32,.29],[-.32,.29]],C.light,.7);a.p([[0,-.1],[.13,.17],[-.13,.17]],C.metal,.6);a.screws([[0,-.39],[-.39,.36],[.39,.36]],.018);break;
 case 'light-oval-bulkhead':a.oval(0,0,.49,.45,C.dark);a.oval(0,0,.4,.33,C.light,.7);for(const x of [-.23,0,.23])a.l(x,-.29,x,.29,1.5);a.l(-.39,0,.39,0,1.5);bolt(-.44,0);bolt(.44,0);break;
 case 'light-wall-wedge':a.p([[-.48,-.45],[.48,-.45],[.32,.46],[-.32,.46]],C.dark);a.p([[-.37,-.35],[.37,-.35],[.25,.32],[-.25,.32]],C.light,.7);a.l(-.4,-.02,.4,-.02,1.6);a.box(-.2,.35,.4,.08,C.metal,.5);break;
 case 'light-wall-tube':a.box(-.18,-.49,.36,.98,C.dark,.8,.035);a.oval(0,0,.47,.39,C.dark);a.oval(0,0,.42,.345,C.metal,.75);a.l(-.29,-.23,.29,.23,.5,C.white);a.arc(0,0,.45,.37,Math.PI*.05,Math.PI*.95,.8,C.light);break;
 case 'light-pebble':a.curve('M -.45 -.13 C -.35 -.46 -.08 -.52 .23 -.4 C .49 -.31 .56 .03 .36 .3 C .21 .52 -.24 .50 -.42 .28 C -.50 .16 -.50 -.03 -.45 -.13 Z',C.light);a.curve('M -.30 -.17 Q -.02 -.39 .26 -.21','none',1,C.white);a.curve('M -.32 .23 Q 0 .37 .26 .22','none',.6);break;
 case 'light-lotus':for(let i=0;i<8;i++){const t=i*Math.PI/4,tip:Point=[Math.cos(t)*.49,Math.sin(t)*.49],side1:Point=[Math.cos(t-.35)*.25,Math.sin(t-.35)*.25],side2:Point=[Math.cos(t+.35)*.25,Math.sin(t+.35)*.25];a.curve(`M 0 0 Q ${side1[0]} ${side1[1]} ${tip[0]} ${tip[1]} Q ${side2[0]} ${side2[1]} 0 0 Z`,C.light,.8);}a.oval(0,0,.14,.14,C.white,.7);break;
 case 'light-grid-tile':a.box(-.48,-.48,.96,.96,C.metal,.9,.025);a.box(-.37,-.37,.74,.74,C.light,.6);for(let i=-2;i<=2;i++){a.l(i*.14,-.37,i*.14,.37,1.2);a.l(-.37,i*.14,.37,i*.14,1.2);}a.screws([[-.425,-.425],[.425,.425]],.018);break;
 case 'light-cross-marker':a.box(-.48,-.48,.96,.96,C.dark,.9,.02);a.box(-.025,-.46,.05,.92,C.light,.5);a.box(-.46,-.025,.92,.05,C.light,.5);a.screws([[-.43,-.43],[.43,.43]],.012);break;
 case 'light-spot-adjustable':a.box(-.37,-.46,.74,.29,C.dark,.8,.035);a.p([[-.32,-.18],[.32,-.18],[.46,.28],[-.46,.28]],C.metal);a.oval(0,.28,.46,.17,C.dark,.8);a.oval(0,.28,.35,.11,C.light,.6);a.box(-.11,-.1,.22,.19,C.dark,.6);break;
 case 'light-bamboo':a.ring(0,0,.47,.47,.66,C.wood);for(let i=0;i<10;i++){const t=i*Math.PI/5;a.oval(Math.cos(t)*.4,Math.sin(t)*.4,.055,.055,C.woodLight,.6);}a.oval(0,0,.27,.27,C.light,.6);a.oval(0,0,.105,.105,C.white,.5);break;
 case 'light-pyramid':a.box(-.48,-.48,.96,.96,C.dark);a.p([[-.38,-.38],[.38,-.38],[.38,.38],[-.38,.38]],C.light,.7);for(const [x,y] of [[-.48,-.48],[.48,-.48],[.48,.48],[-.48,.48]])a.l(0,0,x,y,1.3);a.box(-.06,-.06,.12,.12,C.metal,.6);break;
 case 'light-cage-round':a.oval(0,0,.48,.48,C.dark);a.oval(0,0,.4,.4,C.light,.7);for(const r of [.16,.29])a.oval(0,0,r,r,'none',1);for(let i=0;i<8;i++){const t=i*Math.PI/4;a.l(Math.cos(t)*.1,Math.sin(t)*.1,Math.cos(t)*.44,Math.sin(t)*.44,1.2);}a.oval(0,0,.09,.09,C.metal,.5);break;
 default:return false;
 }
 return true;
}

function decor(a:PlanArt,id:string):boolean {
 const pot=(x:number,y:number,r:number,plant=true)=>{a.oval(x,y,r,r,C.woodLight);a.oval(x,y,r*.77,r*.77,C.soil,.6);if(plant)a.blossom(x,y,r*.7);};
 const stone=(x:number,y:number,rx:number,ry:number,style=0)=>{const profiles:Point[][]=[[[ -.95,-.15],[-.55,-.82],[.24,-.91],[.95,-.28],[.72,.62],[-.05,.9],[-.82,.48]],[[-.93,-.44],[-.35,-.9],[.52,-.7],[.94,.04],[.41,.92],[-.64,.75]],[[-.85,-.6],[-.12,-.96],[.86,-.41],[.93,.36],[.19,.84],[-.9,.53]]];const points=profiles[style%3]!.map(([u,v])=>[x+u*rx,y+v*ry] as Point);a.p(points,style===1?'#939b9b':C.stone);a.p([[x-rx*.56,y+ry*.32],[x-rx*.13,y-ry*.5],[x+rx*.58,y-ry*.04]],'none',.55);};
 const jets=(n:number,r:number)=>{for(let i=0;i<n;i++){const t=i*Math.PI*2/n;a.curve(`M ${Math.cos(t)*r} ${Math.sin(t)*r} Q ${Math.cos(t+.15)*r*.6} ${Math.sin(t+.15)*r*.6} 0 0`,'none',.7,C.waterInk);}};
 switch(id){
 case 'planter-concrete':a.oval(0,0,.48,.48,C.stone);a.oval(0,0,.365,.365,C.soil,.7);a.blossom(0,0,.28,8);for(const t of [0,2,4])a.l(Math.cos(t)*.405,Math.sin(t)*.405,Math.cos(t+.05)*.43,Math.sin(t+.05)*.43,.6);break;
 case 'planter-stone':a.box(-.48,-.47,.96,.94,C.stone);a.box(-.35,-.34,.70,.68,C.soil,.7);for(const x of [-.24,.12]){a.l(x,-.47,x,-.34,.6);a.l(x+.12,.34,x+.12,.47,.6);}a.l(-.48,0,-.35,0,.6);a.l(.35,.14,.48,.14,.6);a.blossom(0,0,.27,5);break;
 case 'planter-ceramic':a.oval(0,0,.48,.48,C.corten);a.ring(0,0,.4,.4,.86,C.woodLight,.7);a.oval(0,0,.30,.30,C.soil,.6);a.blossom(0,0,.22,5);a.arc(0,0,.445,.445,Math.PI,Math.PI*1.65,.8,C.white);break;
 case 'planter-metal':a.box(-.49,-.44,.98,.88,C.dark,.8,.035);a.box(-.445,-.36,.89,.72,C.soil,.6,.025);for(const x of [-.29,0,.29])a.blossom(x,0,.18,5);a.screws([[-.465,-.38],[.465,.38]],.012);break;
 case 'planter-wood':a.box(-.48,-.47,.96,.94,C.wood);a.box(-.38,-.34,.76,.68,C.soil,.6);a.slats(-.46,-.46,.92,.11,6,true,C.woodLight);a.slats(-.46,.35,.92,.11,6,true,C.woodLight);a.blossom(-.22,0,.16);a.blossom(.17,.02,.22,7);break;
 case 'planter-group':pot(-.23,-.17,.24);pot(.24,.02,.22);pot(-.1,.29,.17);break;
 case 'sculpture-stone':a.oval(0,0,.48,.48,C.stone);for(let i=0;i<5;i++){const t=i*Math.PI*2/5,rot=(x:number,y:number)=>`${x*Math.cos(t)-y*Math.sin(t)} ${x*Math.sin(t)+y*Math.cos(t)}`;a.curve(`M ${rot(.015,.04)} C ${rot(-.20,.28)} ${rot(-.44,.14)} ${rot(-.43,-.13)} C ${rot(-.32,.11)} ${rot(-.08,.13)} ${rot(.015,.04)} Z`,C.white,.7);}a.oval(0,0,.065,.065,C.stone,.6);break;
 case 'fountain-round':a.oval(0,0,.485,.485,C.stone);a.oval(0,0,.405,.405,C.water,.7);a.ring(0,0,.25,.25,.72,C.stone,.8);jets(8,.37);a.oval(0,0,.11,.11,C.white);a.oval(0,0,.045,.045,C.waterInk,.6);break;
 case 'fountain-square':a.box(-.48,-.48,.96,.96,C.stone);a.box(-.40,-.40,.80,.80,C.water,.7);a.p([[0,-.21],[.21,0],[0,.21],[-.21,0]],C.white);for(const x of [-.29,.29])for(const y of [-.29,.29]){a.oval(x,y,.04,.04,C.stone,.6);a.l(x,y,x*.38,y*.38,.7,C.waterInk);}break;
 case 'fountain-rectangle':a.box(-.49,-.45,.98,.90,C.stone,.9,.04);a.box(-.43,-.33,.86,.66,C.water,.6,.025);for(const x of [-.27,0,.27]){a.oval(x,0,.09,.22,C.white,.7);a.oval(x,0,.045,.11,C.water,.5);a.l(x,-.19,x,.19,.5,C.waterInk);}break;
 case 'fountain-small':a.oval(0,0,.475,.475,C.stone);a.oval(0,0,.375,.375,C.water,.7);a.oval(-.07,-.06,.20,.21,C.stone,.8);a.oval(-.07,-.06,.12,.13,C.water,.6);a.curve('M -.07 -.06 Q .21 -.04 .24 .2','none',1.1,C.white);a.arc(.17,.22,.12,.08,0,Math.PI*2,.5,C.waterInk);break;
 case 'rock-single':stone(0,0,.5,.49,0);break;
 case 'rock-group':stone(-.21,-.18,.28,.28,0);stone(.25,-.03,.25,.34,1);stone(-.08,.29,.28,.21,2);break;
 case 'rock-dark':stone(0,0,.51,.50,1);a.p([[-.33,-.29],[.19,-.29],[.37,.09],[.03,.43]],'none',.8);a.l(-.27,.27,-.09,-.04,.6);break;
 case 'figure-turtle':for(const x of [-.3,.3])for(const y of [-.25,.25])a.oval(x,y,.13,.11,C.leaf,.8);a.oval(0,-.38,.14,.11,C.leaf);a.p([[-.07,.32],[0,.49],[.07,.32]],C.leaf,.7);a.oval(0,0,.32,.37,C.stone);a.polygon(0,0,.15,.19,6,C.woodLight);for(let i=0;i<6;i++){const t=i*Math.PI/3;a.l(Math.cos(t)*.15,Math.sin(t)*.19,Math.cos(t)*.30,Math.sin(t)*.34,.75);}a.screws([[-.055,-.40],[.055,-.40]],.012);break;
 case 'composition-zen':a.oval(0,0,.46,.43,C.woodLight,.7);for(const r of [.28,.36,.42])a.arc(-.04,.04,r,r*.76,0,Math.PI*1.9,.5);stone(-.15,-.14,.19,.22,2);stone(.20,.15,.13,.13,0);a.l(-.34,.28,.05,.37,.65);break;
 case 'composition-pots':stone(.17,.14,.28,.34,0);pot(-.23,-.15,.23);pot(.24,-.26,.19);pot(-.21,.29,.16);break;
 case 'bird-bath':a.oval(0,0,.46,.46,C.stone);a.oval(0,0,.365,.365,C.water,.7);a.arc(0,.03,.23,.2,0,Math.PI*1.6,.5,C.waterInk);a.oval(.17,-.30,.13,.09,C.white,.8);a.oval(.28,-.35,.067,.057,C.white,.7);a.p([[.32,-.36],[.43,-.35],[.33,-.32]],C.corten,.6);a.p([[.08,-.28],[-.06,-.20],[.1,-.22]],C.white,.6);break;
 case 'waterbowl-rectangular':a.box(-.485,-.43,.97,.86,C.corten,.8,.10);a.box(-.41,-.32,.82,.64,C.water,.7,.09);a.water(-.29,-.20,.58,.40,2);a.oval(.32,-.21,.032,.055,C.dark,.6);break;
 case 'sculpture-arch':a.box(-.49,-.44,.18,.88,C.stone,.9,.025);a.box(.31,-.44,.18,.88,C.stone,.9,.025);a.box(-.32,-.13,.64,.26,C.stone,.9,.03);a.l(-.26,-.13,-.26,.13,.7);a.l(-.09,-.13,-.09,.13,.7);a.l(.09,-.13,.09,.13,.7);a.l(.26,-.13,.26,.13,.7);break;
 case 'planter-amphora':a.ring(-.34,0,.145,.20,.62,C.corten);a.ring(.34,0,.145,.20,.62,C.corten);a.oval(0,0,.34,.47,C.corten);a.oval(0,0,.24,.31,C.woodLight,.7);a.oval(0,0,.18,.23,C.soil,.6);a.arc(0,0,.29,.40,Math.PI,Math.PI*1.7,.6,C.white);break;
 case 'planter-hexagonal':a.polygon(0,0,.485,.485,6,C.stone);a.polygon(0,0,.365,.365,6,C.soil);a.blossom(0,0,.27,7);for(let i=0;i<6;i++){const t=i*Math.PI/3-Math.PI/2;a.l(Math.cos(t)*.37,Math.sin(t)*.37,Math.cos(t)*.48,Math.sin(t)*.48,.65);}break;
 case 'planter-oval':a.oval(0,0,.49,.45,C.stone);a.oval(0,0,.425,.31,C.soil,.65);a.blossom(-.20,0,.15,5);a.blossom(.15,0,.20,7);break;
 case 'composition-succulents':stone(-.03,.08,.44,.39,2);a.blossom(-.25,-.17,.17,8);a.blossom(.18,-.11,.23,9);a.blossom(-.02,.24,.14,6);a.oval(.32,.27,.06,.05,C.woodLight,.55);break;
 case 'fountain-octagonal':a.polygon(0,0,.49,.49,8,C.stone,Math.PI/8);a.polygon(0,0,.40,.40,8,C.water,Math.PI/8,.7);for(let i=0;i<8;i++){const t=Math.PI/8+i*Math.PI/4;a.l(Math.cos(t)*.40,Math.sin(t)*.40,Math.cos(t)*.49,Math.sin(t)*.49,.7);}a.polygon(0,0,.17,.17,8,C.white,Math.PI/8);jets(4,.33);a.oval(0,0,.055,.055,C.waterInk,.6);break;
 case 'rock-slate':for(let i=0;i<4;i++){const x=-.25+i*.16,y=i%2?.15:-.1;a.p([[x-.16,y-.27],[x+.09,y-.31],[x+.18,y+.20],[x-.10,y+.27]],i%2?C.dark:C.stone,.8);a.l(x-.08,y-.21,x+.06,y+.17,.5);}break;
 case 'figure-frog':for(const sign of [-1,1]){
  a.oval(sign*.27,.19,.13,.20,C.leaf,.8);
  a.p([[sign*.25,.30],[sign*.36,.44],[sign*.40,.32],[sign*.47,.33],[sign*.41,.21]],C.leaf,.65);
  a.p([[sign*.13,-.10],[sign*.27,-.13],[sign*.34,-.32],[sign*.39,-.46],[sign*.42,-.32],[sign*.49,-.31],[sign*.41,-.24],[sign*.42,-.15],[sign*.33,-.20],[sign*.30,-.03]],C.leaf,.65);
 }a.oval(0,.09,.23,.32,C.leaf);a.oval(0,-.20,.21,.19,C.leaf,.8);for(const x of [-.13,.13]){a.oval(x,-.31,.055,.067,C.woodLight,.7);a.oval(x,-.33,.021,.028,C.dark,.45);}a.curve('M -.09 -.12 Q -.16 .10 -.06 .32','none',.6);a.curve('M .09 -.12 Q .16 .10 .06 .32','none',.6);break;
 case 'composition-lantern':a.polygon(0,0,.485,.45,6,C.stone,Math.PI/6);a.polygon(0,0,.32,.31,6,C.dark,Math.PI/6);a.box(-.20,-.2,.40,.40,C.light,.8);a.p([[-.3,0],[0,-.34],[.3,0],[0,.34]],C.stone,.8);a.box(-.08,-.08,.16,.16,C.dark,.6);break;
 case 'planter-trough':a.curve('M -.49 -.32 Q -.38 -.47 0 -.45 Q .38 -.47 .49 -.32 L .49 .32 Q .38 .47 0 .45 Q -.38 .47 -.49 .32 Z',C.wood);a.box(-.38,-.30,.76,.60,C.soil,.7,.035);for(const x of [-.43,.43])a.l(x,-.30,x,.3,2.5);for(const x of [-.24,0,.24])a.blossom(x,0,.145,5);break;
 case 'sundial-stone':a.oval(0,0,.48,.48,C.stone);a.oval(0,0,.40,.40,C.woodLight,.65);for(let i=0;i<12;i++){const t=i*Math.PI/6;a.l(Math.cos(t)*.31,Math.sin(t)*.31,Math.cos(t)*.38,Math.sin(t)*.38,.7);}a.p([[-.025,.22],[.08,-.32],[.13,.22]],C.dark,.8);a.p([[.13,.22],[.28,.36],[.18,-.04]],'#a49d89',.4);break;
 case 'pool-square':a.box(-.485,-.485,.97,.97,C.stone);a.box(-.42,-.42,.84,.84,C.water,.8);for(let i=0;i<3;i++)a.p([[-.42,-.42],[.04-i*.08,-.42],[-.42,.04-i*.08]],'#cae5e7',.6,C.waterInk);a.water(-.25,.02,.60,.32,2);a.screws([[.34,-.33],[.34,.32]],.012);break;
 case 'pool-round':a.oval(0,0,.485,.485,C.stone);a.oval(0,0,.415,.415,C.water,.8);for(const ry of [.18,.25,.32])a.arc(0,-.08,.27,ry,Math.PI,Math.PI*2,.7,C.waterInk);a.water(-.28,-.03,.56,.30,2);a.box(.325,-.06,.08,.12,C.white,.6,.02);break;
 case 'pool-rectangle':a.box(-.49,-.48,.98,.96,C.stone,.9,.025);a.box(-.45,-.4,.90,.8,C.water,.7,.018);for(let i=0;i<4;i++)a.box(-.45+i*.045,-.39,.045,.78,'#cce7e7',.5);a.water(-.14,-.27,.52,.54,3);a.l(.39,-.40,.39,-.29,.7);a.l(.43,-.40,.43,-.29,.7);break;
 case 'tub-round-wood':a.ring(0,0,.485,.485,.79,C.wood);for(let i=0;i<20;i++){const t=i*Math.PI/10;a.l(Math.cos(t)*.385,Math.sin(t)*.385,Math.cos(t)*.483,Math.sin(t)*.483,.65);}a.oval(0,0,.375,.375,C.water,.7);a.ring(0,0,.34,.34,.74,C.woodLight,.65);a.water(-.20,-.16,.4,.32,2);a.box(-.11,.38,.22,.10,C.woodLight,.8,.015);break;
 case 'tub-square-spa':a.box(-.48,-.48,.96,.96,C.white,.9,.09);a.box(-.39,-.39,.78,.78,C.water,.8,.08);for(const x of [-.28,.28])for(const y of [-.28,.28])a.box(x-.10,y-.10,.20,.20,C.cloth,.6,.06);a.box(-.12,-.37,.24,.11,C.cloth,.6,.03);for(const [x,y] of [[-.31,0],[.31,0],[0,.3]])a.oval(x,y,.021,.021,C.waterInk,.5);a.water(-.15,-.11,.3,.29,2);a.box(.27,-.465,.13,.05,C.dark,.6,.01);break;
 case 'tub-rectangle-plunge':a.box(-.49,-.47,.98,.94,C.wood,.9,.055);a.box(-.42,-.36,.84,.72,C.water,.7,.055);a.box(-.40,-.33,.19,.66,C.woodLight,.6,.035);a.box(.26,-.33,.14,.66,C.woodLight,.6,.03);a.water(-.16,-.23,.34,.46,2);a.oval(.18,.24,.022,.04,C.waterInk,.5);break;
 default:return false;
 }
 return true;
}

function equipment(a:PlanArt,id:string,foot:Point[]):boolean {
 const lid=(x:number,y:number,w:number,h:number)=>{a.box(x,y,w,h,C.metal,.9,.035);a.box(x+w*.28,y+h*.53,w*.44,h*.10,C.dark,.6,.018);a.oval(x+w*.52,y+h*.24,w*.025,h*.045,C.dark,.5);};
 const vents=(x:number,y:number,w:number,h:number,n=10)=>{for(let i=0;i<n;i++)a.l(x+w*i/(n-1),y,x+w*i/(n-1),y+h,.8,C.dark);};
 const logs=(x:number,y:number,r:number)=>{a.p([[x-r*.82,y+r*.22],[x-r*.67,y+r*.52],[x+r*.82,y-r*.28],[x+r*.68,y-r*.56]],C.woodLight,.8);a.p([[x-r*.80,y-r*.20],[x-r*.67,y-r*.48],[x+r*.81,y+r*.27],[x+r*.68,y+r*.51]],C.wood,.8);a.flame(x,y,r*.45,r*.7);};
 const brickRing=()=>{a.ring(0,0,.485,.485,.71,C.corten);for(let i=0;i<16;i++){const t=i*Math.PI/8;a.l(Math.cos(t)*.35,Math.sin(t)*.35,Math.cos(t)*.48,Math.sin(t)*.48,.65);}a.oval(0,0,.34,.34,C.dark,.8);};
 switch(id){
 case 'bbq-kettle':a.oval(0,0,.465,.465,C.dark);a.oval(0,0,.39,.39,C.metal,.7);a.oval(0,0,.35,.35,C.dark,.6);a.box(-.21,-.02,.42,.08,C.wood,.8,.025);a.oval(0,-.27,.085,.085,C.metal,.7);for(let i=0;i<4;i++){const t=i*Math.PI/2;a.oval(Math.cos(t)*.04,-.27+Math.sin(t)*.04,.017,.017,C.dark,.4);}a.box(-.045,-.49,.09,.04,C.metal,.6);break;
 case 'bbq-built-in':a.box(-.485,-.455,.97,.91,C.stone);lid(-.36,-.33,.72,.66);a.l(-.31,.37,.31,.37,.6);a.screws([[-.42,-.39],[.42,.39]],.012);break;
 case 'brazier-steel':a.box(-.43,-.43,.86,.86,C.dark,.8,.015);a.grill(-.36,-.33,.72,.66,9);for(const x of [-.49,.43])a.box(x,-.14,.06,.28,'none',1.4);for(const x of [-.24,0,.24])a.oval(x,.37,.014,.025,C.metal,.45);break;
 case 'brazier-brick':a.box(-.49,-.48,.98,.96,C.corten);a.box(-.37,-.34,.74,.68,C.dark,.8);for(const y of [-.48,.34])for(let i=1;i<5;i++)a.l(-.49+i*.196,y,-.49+i*.196,y+.14,.55);for(const x of [-.49,.37]){a.l(x,0,x+.12,0,.55);a.l(x,-.19,x+.12,-.19,.55);a.l(x,.19,x+.12,.19,.55);}a.grill(-.31,-.28,.62,.56,7);break;
 case 'kitchen-compact':a.box(-.49,-.44,.98,.88,C.stone,.9,.01);a.sink(-.41,-.25,.27,.53);lid(.06,-.31,.35,.64);a.box(-.1,-.23,.08,.47,C.woodLight,.5);break;
 case 'kitchen-linear':a.box(-.49,-.43,.98,.86,C.stone,.9,.01);a.sink(-.44,-.23,.20,.47);lid(.20,-.32,.24,.64);a.l(-.12,-.42,-.12,.42,.55);a.l(.1,-.42,.1,.42,.55);for(const x of [.25,.32,.39])a.oval(x,.35,.01,.018,C.dark,.4);break;
 case 'kitchen-corner':a.p(paintInset(foot),C.stone);a.sink(-.43,-.42,.17,.24);lid(.07,-.43,.36,.26);a.l(-.47,.03,-.27,.03,.6);a.l(-.47,.28,-.27,.28,.6);a.l(-.12,-.48,-.12,-.12,.6);break;
 case 'firepit-round':a.ring(0,0,.48,.48,.83,C.corten);a.oval(0,0,.39,.39,C.dark,.8);logs(0,0,.30);for(const [x,y] of [[-.29,-.14],[.25,-.23],[-.15,.29]])a.polygon(x,y,.045,.052,5,C.stone,.3,.4);break;
 case 'firepit-square':a.box(-.48,-.48,.96,.96,C.stone);a.box(-.35,-.35,.70,.70,C.dark,.8);for(const [x,y] of [[-.25,-.22],[.25,-.22],[-.23,.24],[.24,.24]])a.polygon(x,y,.065,.060,5,C.stone,.3,.5);logs(0,0,.26);a.l(-.46,-.46,-.35,-.35,.65);a.l(.46,.46,.35,.35,.65);break;
 case 'firepit-rectangle':a.box(-.49,-.44,.98,.88,C.stone,.9,.025);a.box(-.40,-.17,.80,.34,C.dark,.7,.015);for(const x of [-.29,-.10,.10,.29])a.flame(x,0,.06,.115);a.l(-.39,.2,.39,.2,.5);break;
 case 'equipment-pump':a.box(-.49,-.45,.98,.90,C.dark,.9,.015);a.box(-.45,-.4,.9,.80,C.metal,.6);vents(-.40,-.33,.80,.10,18);vents(-.40,.23,.80,.10,18);a.screws([[-.455,-.415],[.455,-.415],[-.455,.415],[.455,.415]],.014);break;
 case 'equipment-heatpump':a.box(-.49,-.45,.98,.90,C.metal,.9,.025);a.fan(-.20,0,.235,.365);for(const y of [-.27,-.09,.09,.27])a.l(.10,y,.42,y,.6);a.screws([[-.45,-.39],[.44,.39]],.012);break;
 case 'equipment-storage':a.box(-.49,-.43,.98,.86,C.wood,.9,.025);a.slats(-.445,-.35,.89,.69,4,false,C.woodLight);for(const x of [-.34,.28])a.box(x,-.425,.09,.10,C.dark,.6,.008);a.box(-.07,.36,.14,.06,C.dark,.6);break;
 case 'kitchen-u':a.p(paintInset(foot),C.stone);lid(-.16,-.46,.32,.20);a.sink(-.465,-.05,.12,.28);a.l(.34,-.1,.48,-.1,.6);a.l(.34,.15,.48,.15,.6);a.l(.34,.36,.48,.36,.6);a.l(-.48,.35,-.34,.35,.6);break;
 case 'kitchen-island':a.box(-.49,-.44,.98,.88,C.stone,.9,.015);a.sink(-.42,-.25,.32,.50);lid(.07,-.31,.35,.63);for(const x of [.12,.21,.30,.39])a.oval(x,.35,.011,.022,C.dark,.5);break;
 case 'bbq-ceramic':a.oval(0,0,.47,.47,C.leaf);for(const r of [.25,.34,.42])a.oval(0,0,r,r,'none',.45);for(let i=0;i<12;i++){const t=i*Math.PI/6;a.oval(Math.cos(t)*.385,Math.sin(t)*.385,.012,.012,C.dark,.3);}a.oval(0,-.04,.14,.14,C.dark,.8);a.oval(0,-.04,.09,.09,C.metal,.6);a.screws([[-.045,-.07],[.045,-.07],[0,.02]],.021);a.box(-.23,.41,.46,.065,C.wood,.8,.02);break;
 case 'pizza-oven':a.box(-.45,-.47,.90,.94,C.stone,.9,.015);a.oval(0,-.03,.42,.42,C.corten);a.oval(0,-.18,.10,.11,C.dark,.8);a.oval(0,-.18,.065,.07,C.stone,.6);a.curve('M -.28 .43 L -.28 .26 Q 0 .06 .28 .26 L .28 .43 Z',C.corten);a.curve('M -.19 .43 L -.19 .30 Q 0 .16 .19 .30 L .19 .43 Z',C.dark,.7);a.box(-.21,.42,.42,.06,C.stone,.7);break;
 case 'smoker-barrel':a.box(-.46,-.35,.77,.70,C.dark,.9,.10);a.box(.30,-.24,.19,.48,C.dark,.8,.04);a.box(-.20,-.10,.26,.055,C.wood,.6,.015);for(const x of [-.36,.19])a.box(x,-.40,.035,.8,C.metal,.65,.015);a.curve('M -.45 -.26 L -.49 -.26 L -.49 .26 L -.45 .26','none',1.5);a.oval(.405,0,.015,.028,C.metal,.5);break;
 case 'brazier-round-brick':brickRing();for(let i=-3;i<=3;i++){const x=i*.08,y=Math.sqrt(.31**2-x*x);a.l(x,-y,x,y,.75,C.metal);}a.l(-.3,0,.3,0,.7,C.metal);break;
 case 'firepit-tripod':a.oval(0,0,.43,.43,C.dark);logs(0,0,.27);for(let i=0;i<3;i++){const t=-Math.PI/2+i*Math.PI*2/3;a.l(0,0,Math.cos(t)*.485,Math.sin(t)*.485,2.2);a.oval(Math.cos(t)*.475,Math.sin(t)*.475,.023,.023,C.metal,.6);}a.oval(0,0,.045,.045,C.metal,.6);break;
 case 'firepit-corten':a.oval(0,0,.485,.485,C.corten);a.oval(0,0,.35,.35,'#8d7461',.7);a.p([[-.24,-.16],[.27,.12],[.21,.24],[-.3,-.04]],C.woodLight,.7);a.p([[-.12,.27],[.19,-.24],[.29,-.17],[-.02,.31]],C.wood,.7);a.flame(0,0,.13,.20);break;
 case 'sink-outdoor':a.box(-.49,-.44,.98,.88,C.metal,.9,.015);a.sink(-.43,-.29,.57,.62);for(const x of [.20,.26,.32,.38,.44])a.l(x,-.31,x,.31,.55);a.box(-.04,-.47,.13,.05,C.dark,.5,.01);break;
 case 'fridge-outdoor':a.box(-.47,-.44,.94,.86,C.metal,.9,.04);a.box(-.45,-.49,.90,.08,C.dark,.7);vents(-.4,-.48,.8,.06,14);a.box(-.31,.36,.62,.07,C.dark,.7,.025);a.l(-.43,.31,.43,.31,.5);break;
 case 'bbq-wheeled':a.box(-.49,-.32,.21,.64,C.dark,.8,.025);a.box(.28,-.32,.21,.64,C.dark,.8,.025);lid(-.28,-.43,.56,.83);a.l(-.47,-.26,-.47,.26,.55,C.metal);a.l(.47,-.26,.47,.26,.55,C.metal);for(const x of [-.18,.18])a.oval(x,.43,.07,.05,C.dark,.8);break;
 case 'composter-small':a.p([[-.37,-.48],[.37,-.48],[.48,-.37],[.48,.37],[.37,.48],[-.37,.48],[-.48,.37],[-.48,-.37]],C.leaf);a.box(-.34,-.34,.68,.68,C.dark,.7,.025);a.slats(-.31,-.31,.62,.62,5,false,C.leaf);a.box(-.13,-.06,.26,.13,C.dark,.7,.015);a.box(-.07,-.025,.14,.06,C.leaf,.4);a.screws([[-.41,-.37],[.41,.37]],.018);break;
 case 'rain-barrel':a.oval(0,0,.485,.485,C.dark);a.oval(0,0,.43,.43,C.wood);for(const x of [-.28,-.14,0,.14,.28]){const y=Math.sqrt(.42**2-x*x);a.l(x,-y,x,y,.65);}a.oval(.17,-.19,.075,.075,C.dark,.65);for(const x of [.14,.18,.22])a.l(x,-.23,x,-.16,.45,C.metal);a.oval(-.21,.24,.022,.022,C.dark,.6);break;
 case 'generator-cabinet':a.box(-.49,-.44,.98,.88,C.metal,.9,.05);a.grill(-.37,-.28,.32,.56,9);a.grill(.05,-.28,.32,.56,9);a.l(0,-.36,0,.36,.6);a.screws([[-.43,-.36],[.43,-.36],[-.43,.36],[.43,.36]],.013);break;
 case 'irrigation-cabinet':a.box(-.49,-.37,.98,.79,C.metal,.9,.035);a.box(-.445,-.30,.89,.63,'#d8dedc',.65,.01);for(const x of [-.25,.25]){a.box(x-.035,-.49,.07,.12,C.dark,.65,.015);a.oval(x,-.47,.025,.025,C.dark,.5);}a.screws([[-.40,-.25],[.40,-.25],[-.40,.28],[.40,.28]],.016);break;
 case 'hose-reel':a.curve('M -.37 -.30 L -.37 -.41 Q -.37 -.47 -.28 -.47 L .27 -.47 Q .37 -.47 .37 -.38 L .37 .36 Q .37 .47 .26 .47 L -.25 .47 Q -.37 .47 -.37 .36 L -.37 .30','none',2,C.dark);a.box(-.35,-.28,.69,.56,C.dark,.8,.035);a.slats(-.28,-.31,.56,.62,10,true,'#6c9781');a.box(-.39,-.26,.07,.52,C.metal,.7,.02);a.box(.30,-.26,.07,.52,C.metal,.7,.02);a.l(.37,0,.47,0,2);a.l(.47,0,.47,-.14,2);a.oval(.47,-.16,.025,.06,C.wood,.6);break;
 case 'potting-bench':a.box(-.49,-.44,.98,.88,C.wood,.9,.02);a.slats(-.45,-.38,.63,.76,5,false,C.woodLight);a.box(.23,-.36,.20,.72,C.soil,.7);a.blossom(-.34,-.22,.10,5);a.l(-.15,.15,.08,.27,1.5,C.dark);a.p([[.04,.25],[.11,.20],[.14,.30],[.08,.35]],C.metal,.6);a.screws([[-.46,-.4],[.46,-.4],[-.46,.4],[.46,.4]],.012);break;
 default:return false;
 }
 return true;
}

/** Stable plan symbols describe each catalog model; instance IDs never affect appearance. */
export function landscapeVectorArtwork(object:LandscapeRecord|LandscapeObject):LandscapeVectorArtwork {
 const record='catalogId' in object?landscapeRecord(object.catalogId):object;
 const id='catalogId' in object?object.catalogId:object.id,size='catalogId' in object?object:defaultLandscapeSize(object);
 const a=new PlanArt(size.length,size.width);
 const local:LandscapeObject={id:'symbol',catalogId:id,category:object.category,x:0,y:0,length:size.length,width:size.width,rotation:0,keepRatio:true,noIrrigation:true};
 const foot=landscapeFootprint(local).map(p=>[p.x/size.length,p.y/size.width] as Point);
 const known=object.category==='furniture'?furniture(a,id,foot):object.category==='lighting'?lighting(a,id):object.category==='decor'?decor(a,id):equipment(a,id,foot);
 if(!known){a.p(paintInset(foot),C.stone);if(record?.shape==='circle')a.oval(0,0,.30,.30,'none',.7);else a.l(-.2,-.2,.2,.2,.7);}
 // Batch adjacent paths with identical paint. Independent open structures keep
 // separate subpaths; no bounding-box fill is introduced across their gaps.
 const paths:LandscapeVectorPath[]=[];
 for(const p of a.paths){const last=paths.at(-1);if(last&&last.fill===p.fill&&last.stroke===p.stroke&&last.strokeWidth===p.strokeWidth&&last.opacity===p.opacity)last.d+=' '+p.d;else paths.push({...p});}
 return {width:size.length,height:size.width,paths};
}
