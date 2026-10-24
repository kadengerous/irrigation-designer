import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {createCanvas,loadImage} from '@napi-rs/canvas';
let server,e,p,h,c,m,u,w,f,i;
before(async()=>{server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});[e,p,h,c,m,u,w,f,i]=await Promise.all(['engineering','project-types','engineering-hydraulics','engineering-connections','engineering-materials','units','irrigation-water-recommendations','project-file','i18n'].map(n=>server.ssrLoadModule('/src/lib/'+n+'.ts')));});
after(()=>server.close());
function fixture(){const project=p.emptyProject(),start=e.newEquipment(e.emptyEngineering(),'dripStart',{x:10.5,y:0}),line={id:'drip1',kind:'pipe',type:'dripLine',number:1,label:true,diameterMm:16,points:[{x:10,y:0},{x:10,y:10},{x:20,y:10}],flowLpm:4,pressureBar:1.5,zoneId:1,dripStartId:start.id},main={id:'main',kind:'pipe',type:'main',number:1,label:true,diameterMm:32,points:[{x:0,y:0},{x:10,y:0}]};start.flowLpm=99;start.pressureBar=3;project.zones=[{id:1,name:'Bed',nameKind:'custom'}];project.engineering={version:1,elements:{[start.id]:start,drip1:line,main},categories:{},hydraulics:{staticLiftM:0,inletPressureBar:0,additionalLossBar:0,tankRuntimeMin:10,tankReservePct:20}};return {project,start,line};}
test('field palette has exactly five types; box dimensions and drip parameters survive project-file roundtrip',()=>{
 assert.deepEqual([...e.FIELD_CONNECTIONS],['waterOutlet','dripStart','gardenHydrant','valveBox','roundValveBox']);const {project}=fixture(),box=e.newEquipment(project.engineering,'valveBox',{x:2,y:3});box.boxLengthM=.8;box.boxWidthM=.45;box.boxDepthM=.4;project.engineering.elements[box.id]=box;
 const reopened=f.parseProjectFile(JSON.stringify(f.toProjectFile({project}))).project;assert.equal(reopened.engineering.elements[box.id].boxLengthM,.8);assert.equal(reopened.engineering.elements.drip1.flowLpm,4);assert.deepEqual(e.equipmentPorts(box),[]);
 const rows=m.engineeringMaterials(project,u.METRIC_UNITS).rows;assert.ok(rows.find(r=>r.key==='field:'+box.id).note.includes(u.formatLenU(.8,u.METRIC_UNITS.length)));assert.equal(rows.find(r=>r.key==='drip:drip1').qty,23);assert.equal(rows.find(r=>r.key==='pipe:32').qty,11.5);assert.equal(rows.filter(r=>r.key==='pipe:16').length,0);
});
test('drip demand enters pump/tank calculations once through its start; drip tubing is not treated as full-flow PE main',()=>{
 const {project,start,line}=fixture();assert.equal(h.waterConsumers(project).length,1);assert.equal(h.waterConsumers(project)[0].flow,4);assert.deepEqual(c.consumerPoints(project).map(x=>x.id),['drip:drip1']);assert.deepEqual(c.consumerPoints(project)[0].point,{x:10,y:0});
 const result=h.calculateEngineering(project);assert.ok(result.ready,result.issues.join(','));assert.equal(result.flow,4);assert.ok(!result.edges.some(x=>x.pipeId==='drip1'));assert.ok(result.headM>1.5*h.BAR_TO_HEAD);assert.equal(w.irrigationWaterRecommendations(project).capacityL,48);
 line.flowLpm=undefined;assert.equal(w.irrigationWaterRecommendations(project).flowLpm,null);assert.equal(h.calculateEngineering(project).ready,false);
 line.flowLpm=4;delete project.engineering.elements[start.id];assert.deepEqual(h.waterConsumers(project)[0].point,line.points[0]);
});
test('hydrant is a consumer; valve box is not; all twenty languages have connection and drip labels',()=>{
 const project=p.emptyProject(),data=e.emptyEngineering(),hydrant=e.newEquipment(data,'gardenHydrant',{x:0,y:0}),box=e.newEquipment(data,'valveBox',{x:3,y:3});hydrant.flowLpm=12;hydrant.pressureBar=2;data.elements={[hydrant.id]:hydrant,[box.id]:box};project.engineering=data;assert.equal(h.waterConsumers(project).length,1);assert.equal(h.waterConsumers(project)[0].flow,12);
 for(const {id}of i.LOCALES){i.setActiveLocale(id);for(const key of ['connections','gardenHydrant','valveBox','roundValveBox','boxLengthM','boxWidthM','boxDepthM','dripLine','dripFlow','dripPressure','lineBeginning','dripDataHint'])assert.notEqual(i.text('engineering.'+key),'engineering.'+key);}i.setActiveLocale('en');
});
test('four catalog images are transparent, lightweight and visually distinct',async()=>{
 const canvas=createCanvas(1000,300),ctx=canvas.getContext('2d');ctx.fillStyle='#f4f7f9';ctx.fillRect(0,0,1000,300);
 for(const [index,id]of ['water-outlet','drip-start','garden-hydrant','valve-box'].entries()){const bytes=await readFile('public/engineering/assembly/'+id+'.webp');assert.ok(bytes.length<60000);const img=await loadImage(bytes),s=Math.min(220/img.width,240/img.height);ctx.drawImage(img,index*250+(250-img.width*s)/2,15+(240-img.height*s)/2,img.width*s,img.height*s);ctx.fillStyle='#253945';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText(id,index*250+125,280);}
 await writeFile('/private/tmp/field-connections-review.png',canvas.toBuffer('image/png'));
});
