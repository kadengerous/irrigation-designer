import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';
import {createServer,transformWithEsbuild} from 'vite';
import {createCanvas,loadImage} from '@napi-rs/canvas';
let server,load,a,e,p,f,s,i,u,ui,source,editorCode,art,sizing;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});load=path=>server.ssrLoadModule('/src/'+path);
 [a,e,p,f,{useProject:s},i,u,ui]=await Promise.all(['lib/engineering-assembly.ts','lib/engineering.ts','lib/project-types.ts','lib/project-file.ts','lib/project-store.ts','lib/i18n.ts','lib/units.ts','components/designer/engineering-assembly.tsx'].map(load));
 sizing=await load('lib/engineering-assembly-sizing.ts');
 art=await load('lib/engineering-assembly-art.ts');
 source=await readFile('src/components/designer/engineering-assembly.tsx','utf8');editorCode=(await transformWithEsbuild(source.slice(source.indexOf('export function EngineeringAssemblyEditor'),source.indexOf('\nfunction AssemblyNumber')).replace('export function','function'),'assembly-ui.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'})).code;
});
after(async()=>server.close());
const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];
const reset=project=>s.setState({project,projects:[],past:[],future:[],pastOps:[],futureOps:[]});
test('assemblies have independent plan positions and editable diagrams with stable links',()=>{
 const first=e.newEquipment(e.emptyEngineering(),'assembly',{x:12,y:8}),second=e.newEquipment(e.emptyEngineering(),'assembly',{x:20,y:3});
 assert.ok(a.validEngineeringAssembly(first.assembly));assert.equal(first.assembly.nodes.length,7);assert.equal(first.assembly.links.filter(l=>l.kind==='water').length,5);assert.equal(first.assembly.links.filter(l=>l.kind==='control').length,0);assert.notDeepEqual(first.assembly.nodes.map(n=>n.id),second.assembly.nodes.map(n=>n.id));
 const snapshot=JSON.stringify(first.assembly),moved=e.moveEngineering(first,5,-2);assert.deepEqual({x:moved.x,y:moved.y},{x:17,y:6});assert.equal(JSON.stringify(moved.assembly),snapshot);assert.equal(e.engineeringCategory(first),'waterSupply');assert.equal(e.equipmentPorts(first).length,2);
 const added=a.newAssemblyNode('checkValve'),withNode={...first.assembly,nodes:[...first.assembly.nodes,added]},linked=a.connectAssembly(withNode,withNode.nodes[0].id,added.id,'water');assert.equal(linked.links.length,withNode.links.length+1);assert.strictEqual(a.connectAssembly(linked,added.id,linked.nodes[0].id,'water'),linked);assert.strictEqual(a.connectAssembly(linked,added.id,added.id,'water'),linked);
 const removed=a.removeAssemblyNode(linked,added.id);assert.ok(!removed.links.some(l=>l.from===added.id||l.to===added.id));assert.ok(a.validEngineeringAssembly(removed));
});
test('saved assemblies and component SI parameters survive undo, redo and project-file reopening; malformed diagrams are rejected',()=>{
 const base=p.emptyProject(),item=e.newEquipment(e.emptyEngineering(),'assembly',{x:2,y:4}),tank=item.assembly.nodes.find(n=>n.type==='tank');tank.volumeL=3500;item.assembly.nodes.find(n=>n.type==='pump').model='Pump 60/40';reset(base);s.getState().commitEngineering({...e.emptyEngineering(),elements:{[item.id]:item}});const saved=s.getState().project;
 assert.equal(saved.engineering.elements[item.id].assembly.nodes.find(n=>n.type==='tank').volumeL,3500);s.getState().undo();assert.equal(s.getState().project.engineering,undefined);s.getState().redo();assert.deepEqual(s.getState().project.engineering,saved.engineering);
 const reopened=f.parseProjectFile(JSON.stringify(f.toProjectFile({project:saved})));assert.deepEqual(reopened.project.engineering,saved.engineering);
 for(const mutate of [x=>x.nodes[0].u=Infinity,x=>x.nodes[0].type='missing',x=>x.links[0].to='missing',x=>x.nodes[0].outlets=100000,x=>x.nodes[1].id=x.nodes[0].id]){const bad=structuredClone(item.assembly);mutate(bad);assert.equal(a.validEngineeringAssembly(bad),false);const broken={...saved,engineering:{...saved.engineering,elements:{[item.id]:{...item,assembly:bad}}}};assert.throws(()=>f.parseProjectFile(JSON.stringify(f.toProjectFile({project:broken}))));}
});
function editor(item,locked=false){
 const states=[],refs=[];let index=0,ri=0,saved=null,closed=0;const Dialog=Object.fromEntries(['Root','Portal','Overlay','Content','Title','Description','Close'].map(k=>[k,'dialog-'+k.toLowerCase()]));
 const env={...icons,...a,...art,...sizing,...i,...u,ManifoldArtwork:()=>null,zoneLabel:p.zoneLabel,useMemo:fn=>fn(),React,t:i.text,localeDirection:locale=>['ar','he'].includes(locale)?'rtl':'ltr',Dialog,EngineeringThumb:()=>null,AssemblyDrawing:ui.AssemblyDrawing,AssemblyNumber:'numeric',W:sizing.ASSEMBLY_WIDTH,H:sizing.ASSEMBLY_HEIGHT,clamp:(n,min,max)=>Math.max(min,Math.min(max,n)),saveFile(){},useProject:selector=>selector({project:p.emptyProject(),locale:'ru',units:u.METRIC_UNITS,numberFormat:'locale'}),useState:initial=>{const key=index++;if(!(key in states))states[key]=typeof initial==='function'?initial():initial;return [states[key],next=>states[key]=typeof next==='function'?next(states[key]):next];},useRef:initial=>{const key=ri++;return refs[key]??(refs[key]={current:initial});}};
 const keys=Object.keys(env).filter(k=>k!=='default'&&/^[$A-Z_a-z][$\w]*$/.test(k));const fn=new Function(...keys,editorCode+';return EngineeringAssemblyEditor;')(...keys.map(k=>env[k]));
 return {states,refs,render(){index=0;ri=0;return fn({item,locked,onSave:value=>saved=value,onClose:()=>closed++});},get saved(){return saved;},get closed(){return closed;}};
}
test('actual editor edits isolated drafts, connects and removes equipment, and saves only on Save; Cancel and locks preserve the project',()=>{
 i.setActiveLocale('ru');const item=e.newEquipment(e.emptyEngineering(),'assembly',{x:0,y:0}),snapshot=JSON.stringify(item);const app=editor(item);let nodes=walk(app.render());const pump=app.states[0].nodes.find(n=>n.type==='pump');nodes.find(n=>n.type===ui.AssemblyDrawing).props.onSelect(pump.id);nodes=walk(app.render());
 nodes.find(n=>n.type==='input'&&n.props.maxLength===80).props.onChange({target:{value:'My pump'}});nodes=walk(app.render());assert.ok(!nodes.some(n=>n.type==='numeric'&&n.props.label===i.text('engineering.flow')));assert.equal(app.states[0].nodes.find(n=>n.id===pump.id).flowLpm,undefined);assert.equal(JSON.stringify(item),snapshot);assert.equal(app.saved,null);
 const countBefore=app.states[0].nodes.length,linksBefore=app.states[0].links.length;const palette=nodes.find(n=>n.type==='aside'&&n.props.className==='assembly-palette');walk(palette).find(n=>n.type==='button').props.onClick();assert.equal(app.states[0].nodes.length,countBefore+1);nodes=walk(app.render());nodes.find(n=>n.type==='button'&&n.props.className==='assembly-connect').props.onClick();nodes=walk(app.render());nodes.find(n=>n.type===ui.AssemblyDrawing).props.onSelect(pump.id);assert.equal(app.states[0].links.length,linksBefore+1);
 nodes=walk(app.render());nodes.find(n=>n.type==='button'&&n.props.className==='assembly-save').props.onClick();assert.equal(app.saved.nodes.find(n=>n.id===pump.id).manufacturer,'My pump');assert.equal(app.closed,1);assert.equal(JSON.stringify(item),snapshot);
 const cancelled=editor(item);nodes=walk(cancelled.render());nodes.find(n=>n.type==='button'&&n.props.onClick&&n.props.children===i.text('cancel')).props.onClick();assert.equal(cancelled.saved,null);assert.equal(cancelled.closed,1);
 const locked=editor(item,true);nodes=walk(locked.render());const drawing=nodes.find(n=>n.type===ui.AssemblyDrawing);drawing.props.onSelect(pump.id);nodes=walk(locked.render());assert.ok(nodes.find(n=>n.type==='fieldset').props.disabled);assert.ok(!nodes.some(n=>n.props?.className==='assembly-save'));assert.ok(walk(nodes.find(n=>n.props?.className==='assembly-palette')).filter(n=>n.type==='button').every(n=>n.props.disabled));i.setActiveLocale('en');
});
test('actual pointer editing works with mouse, touch and pen and scales diagram coordinates independently of plan zoom',()=>{
 for(const pointerType of ['mouse','touch','pen']){const item=e.newEquipment(e.emptyEngineering(),'assembly',{x:0,y:0}),app=editor(item),node=app.states[0];let tree=app.render(),svg=walk(tree).find(n=>n.type==='svg'&&n.props.className==='assembly-drawing'),id=app.states[0].nodes[0].id,original={...app.states[0].nodes[0]};const target={closest:()=>({getAttribute:()=>id})},currentTarget={setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},getScreenCTM:()=>({a:.5,d:.5}),getBoundingClientRect:()=>({width:750,height:425})};const ev=(x,y)=>({button:0,pointerId:1,pointerType,clientX:x,clientY:y,target,currentTarget,preventDefault(){}});svg.props.onPointerDown(ev(100,100));svg.props.onPointerMove(ev(175,162.5));svg.props.onPointerUp(ev(175,162.5));const moved=app.states[0].nodes.find(n=>n.id===id);assert.ok(Math.abs(moved.u-original.u-.1)<1e-9);assert.ok(Math.abs(moved.v-original.v-.1)<1e-9);assert.deepEqual(item.assembly.nodes[0],original);}
});
test('actual illustrated scheme includes equipment images, models, volume, flow, head and controller/manifold counts in all 20 languages and both unit systems',async()=>{
 const assembly=sizing.resolveAssembly(a.defaultAssembly(),p.emptyProject());assembly.nodes.find(n=>n.type==='pump').model='Pump 60/40';
 for(const{id:locale}of i.LOCALES)for(const units of [u.METRIC_UNITS,{...u.METRIC_UNITS,pipe:'in',flow:'gpm',length:'ft',pressure:'psi'}]){i.setActiveLocale(locale);const svg=renderToStaticMarkup(React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',xmlnsXlink:'http://www.w3.org/1999/xlink',viewBox:'0 0 1500 850'},React.createElement(ui.AssemblyDrawing,{assembly,units})));assert.doesNotMatch(svg,/assembly\.[a-z]|engineering\.[a-z]/);assert.match(svg,/Pump 60\/40/);assert.ok(svg.includes(i.text('engineering.tank')));assert.ok(svg.includes(i.text('engineering.outlets')));assert.ok(svg.includes(i.text('engineering.zones')));}
 i.setActiveLocale('en');
});

test('every assembly component has distinct, lightweight transparent artwork and exported SVG embeds repeated images only once',async()=>{
 const blobs=new Set();let total=0;
 for(const kind of a.ASSEMBLY_COMPONENTS){const path=art.assemblyImageSrc(kind),buffer=await readFile('public'+path),image=await loadImage(buffer),canvas=createCanvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);assert.ok(image.width<=512&&image.height<=512);assert.ok(image.width>64&&image.height>64);assert.equal(canvas.getContext('2d').getImageData(0,0,1,1).data[3],0);assert.ok(buffer.length<100000,kind);blobs.add(buffer.toString('base64'));total+=buffer.length;}
 assert.equal(blobs.size,a.ASSEMBLY_COMPONENTS.length);assert.ok(total<1000000);
 const paths=[art.assemblyImageSrc('tank'),art.assemblyImageSrc('pump'),art.assemblyImageSrc('tank')],images=paths.map(href=>({getAttribute:()=>href,setAttribute:(_key,value)=>href=value,setAttributeNS:(_ns,_key,value)=>href=value,get href(){return href;}})),calls=[];
 await art.embedAssemblyImages({querySelectorAll:()=>images},async src=>{calls.push(src);return 'data:image/webp;base64,'+(await readFile('public'+src)).toString('base64');});
 assert.deepEqual(calls,[paths[0],paths[1]]);assert.ok(images.every(img=>img.href.startsWith('data:image/webp;base64,')));assert.equal(images[0].href,images[2].href);
});
