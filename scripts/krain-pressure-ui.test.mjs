import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'vite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

let server,cat,flow,auto,store,units,i18n,locales,emptyProject,HeadCard,AutomaticHeadPanel;
before(async()=>{
 server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [cat,flow,auto,{useProject:store},units,i18n,{LOCALES:locales},{emptyProject},{HeadCard},{AutomaticHeadPanel}]=await Promise.all([
  'lib/equipment-catalog.ts','lib/flow.ts','lib/automatic-head.ts','lib/project-store.ts','lib/units.ts','lib/i18n.ts','lib/locale-config.ts','lib/project-types.ts',
  'components/designer/designer-app.tsx','components/designer/automatic-head-tool.tsx'
 ].map(path=>server.ssrLoadModule('/src/'+path)));
});
after(async()=>server.close());
const render=(component,props)=>renderToStaticMarkup(createElement(component,props));
const escaped=value=>render('span',{children:value}).slice(6,-7);
const model=id=>cat.itemById('k-rain:'+id);
const head=(item,patch={})=>({...flow.catalogHeadDefaults(item),id:'kr-ui',catalogId:item.id,x:0,y:0,start:0,zone:1,locked:false,...patch});
function prefs(locale,pressure='bar',heads=[]){
 const value={...units.METRIC_UNITS,pressure};i18n.setActiveLocale(locale);i18n.setNumberPrefs('auto',2);units.setActiveUnits(value);
 store.setState({locale,units:value,project:{...emptyProject(),heads}});Object.assign(store.getInitialState(),store.getState());return value;
}
function panel(fit,pressure,value){
 return render(AutomaticHeadPanel,{groupLabel:'K-Rain',center:{x:0,y:0},sector:{center:{x:0,y:0},radius:fit.r,arc:fit.arc,start:fit.start},radius:fit.r,fit,pressure,failed:false,units:value,cancel(){},finish(){},restart(){},setPressure(){},editSector(){}});
}

test('K-Rain KV/KVF saved nominal pressure is consistent in real cards across all locales and pressure units',()=>{
 for(const id of ['KVF6','KV8'])for(const {id:locale} of locales)for(const pressure of ['bar','psi']){
  const item=model(id),h=head(item,{designPressure:2.1,equipmentSnapshot:cat.equipmentSnapshot(item)}),before=JSON.stringify(h);
  const value=prefs(locale,pressure,[h]),html=render(HeadCard,{head:h});
  assert.match(html,/type="radio"[^>]*checked=""[^>]*value="2\.07"/,id+'/'+locale+'/'+pressure);
  assert.ok(html.includes(escaped(units.formatPressureU(2.07,value.pressure))));
  assert.equal(flow.headFlow(h).kind,'table');assert.equal(JSON.stringify(h),before,'render does not rewrite saved settings');
 }
});

test('documented small K-Rain rotary sectors render estimated flow while unmeasured KVF flow stays unknown',()=>{
 for(const id of ['RN100-ADJ','RN200-ADJ','RN300-ADJ']){
  const item=model(id),n=item.nozzles[0],row=flow.performanceAt(item,n.id,2.1,90).row;
  for(const arc of [80,85,89]){
   const fit=auto.selectAutomaticHead(row.radiusM,arc,2.1,[item]);assert.ok(fit,id+'/'+arc);
   const result=flow.headFlow({...head(item),...fit});assert.equal(result.sectorEstimated,true);
   assert.ok(Math.abs(result.lpm-row.flowLMin*arc/90)<1e-7);assert.equal(fit.needsReview,false);
  }
  assert.equal(auto.selectAutomaticHead(row.radiusM,79,2.1,[item]),null);
 }
 const item=model('KVF6'),fit=auto.selectAutomaticHead(1.8,60,2.1,[item]);assert.ok(fit);assert.equal(fit.needsReview,true);
 for(const {id:locale} of locales){
  const html=panel(fit,2.1,prefs(locale));assert.ok(html.includes(escaped(i18n.text('autoHead.flowUnknown'))),locale);
 }
 assert.equal(flow.headFlow({...head(item),...fit}).lpm,null);
 assert.equal(auto.selectAutomaticHead(1.8,0,2.1,[item]),null,'zero is shutoff');
 const variable=model('KV10');assert.equal(flow.geometryAt(variable,variable.nozzles[0].id,2.07,60),null,'different chart throws cannot justify small-sector geometry');
 // A coincidental crossing of sector curves is not evidence of a common throw.
 const crossing=structuredClone(item),nozzle=crossing.nozzles[0],source=nozzle.performance[0];
 nozzle.performance=[90,180,270,360].flatMap((arc,i)=>[1.38,2.07].map((pressure,j)=>({...source,arcDeg:arc,pressureBar:pressure,radiusM:2+(i%2===j?1:-1)})));
 assert.equal(flow.geometryAt(crossing,nozzle.id,(1.38+2.07)/2,60),null);
});

test('K-Rain PR rotor charts display inlet pressure and preserve their high-inlet points',()=>{
 for(const id of ['RPS75-PR','RPS75i-PR']){
  const item=model(id),n=item.nozzles.find(n=>n.performance.some(r=>r.pressureBar>3.1&&r.verificationStatus!=='Needs Review'));
  const row=n.performance.find(r=>r.pressureBar>3.1&&r.verificationStatus!=='Needs Review');
  const scope={...item,nozzles:[n]},fit=auto.selectAutomaticHead(row.radiusM,180,row.pressureBar,[scope]);assert.ok(fit,id);
  assert.equal(cat.catalogPressureLabel(item),'equipment.pressureAtInlet');assert.equal(fit.designPressure,row.pressureBar);
  for(const {id:locale} of locales)for(const pressure of ['bar','psi']){
   const value=prefs(locale,pressure),html=panel(fit,row.pressureBar,value);
   assert.ok(html.includes(`<div>${escaped(i18n.text('equipment.pressureAtInlet'))}: <bdi>${escaped(units.formatPressureU(row.pressureBar,pressure))}</bdi></div>`));
  }
 }
 assert.equal(cat.catalogPressureLabel(model('RPS75')),'workingPressure');
});
