import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,transformWithEsbuild} from 'vite';
import postcss from 'postcss';
let server,api,cards,zones,irrigation,store,types,engineering,i18n,units;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [api,cards,zones,irrigation,{useProject:store},types,engineering,i18n,units]=await Promise.all(['components/designer/inspector-group-actions.tsx','components/designer/inspector-card.tsx','components/designer/engineering-zones.tsx','components/designer/irrigation-system-cards.tsx','lib/project-store.ts','lib/project-types.ts','lib/engineering.ts','lib/i18n.ts','lib/units.ts'].map(path=>server.ssrLoadModule('/src/'+path)));
});
after(async()=>server?.close());
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
const click=(element,flag)=>{
 const span=api.InspectorGroupActions(element.props),button=walk(span).find(node=>node.type==='button'&&node.props['data-group-action']===flag);
 assert.ok(button);let stopped=0;button.props.onClick({stopPropagation(){stopped++;}});assert.equal(stopped,1);return button;
};
function project(){return {...types.emptyProject(),zones:[{id:1,name:'West',nameKind:'custom',hidden:false,locked:false},{id:2,name:'East',nameKind:'custom',hidden:true,locked:false}],heads:[{id:'head',catalogId:'MP1000-90',nozzleId:'MP1000-90',x:2,y:2,zone:1,r:4,arc:180,start:0,bodyId:'PRS40',designPressure:2.8,popUpMm:100,locked:false}],engineering:{...engineering.emptyEngineering(),categories:{waterSupply:{hidden:true,locked:false},pipelines:{hidden:false,locked:true}}}};}
function reset(p){store.setState({project:p,projects:[],past:[],future:[],pastOps:[],futureOps:[],selectedId:'head',selectedIds:['head'],sectorEditId:'head',locale:'en'});Object.assign(store.getInitialState(),store.getState());}

test('collapsed headers contain sibling accessible actions in all languages, never nested buttons',()=>{
 for(const {id:locale}of i18n.LOCALES)for(const active of [false,true]){
  i18n.setActiveLocale(locale);
  const name=i18n.tr(locale,'irrigationZones'),actions=React.createElement(api.InspectorGroupActions,{name,hidden:active,locked:active,onVisibility(){},onLock(){},locale});
  const html=renderToStaticMarkup(React.createElement(cards.InspectorCard,{id:'irrigationZones',title:name,open:false,onToggle(){},actions},React.createElement('input',{'data-hidden-body':true})));
  assert.equal((html.match(/<button /g)||[]).length,3);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,active?2:0);assert.ok(!html.includes('data-hidden-body'));
  let depth=0;for(const tag of html.matchAll(/<\/?button\b/g)){depth+=tag[0].startsWith('</')?-1:1;assert.ok(depth===0||depth===1,'action button cannot nest in the accordion trigger');}assert.equal(depth,0);
  assert.ok(html.indexOf('inspector-card-header-actions')>html.indexOf('</button>'));assert.match(html,/data-group-action="hidden"/);assert.match(html,/data-group-action="locked"/);
  assert.ok(html.includes(`data-hidden="${active}"`));assert.ok(html.includes(`data-locked="${active}"`));assert.doesNotMatch(html,/engineering\.[A-Za-z]|referenceUnlockAction|referenceLockAction/);
 }
});

test('zone bulk toggles update one project snapshot, preserve per-head flags and undo the whole group',()=>{
 for(const flag of ['hidden','locked']){
  const p=project();reset(p);const before=JSON.stringify(p),head=JSON.stringify(p.heads);let cleared=0;
  click(api.ZoneGroupActions({project:p,locale:'en',onSelectionClear(){cleared++;}}),flag);
  const state=store.getState();assert.equal(state.past.length,1);assert.ok(state.project.zones.every(zone=>zone[flag]));assert.equal(JSON.stringify(state.project.heads),head);
  if(flag==='hidden'){assert.deepEqual(state.selectedIds,[]);assert.equal(cleared,1);}else{assert.equal(state.sectorEditId,null);assert.equal(cleared,0);}
  state.undo();assert.equal(JSON.stringify(store.getState().project),before);store.getState().redo();assert.ok(store.getState().project.zones.every(zone=>zone[flag]));
  const now=store.getState().project;click(api.ZoneGroupActions({project:now,locale:'en'}),flag);assert.ok(store.getState().project.zones.every(zone=>!zone[flag]));assert.equal(store.getState().past.length,2);
 }
 const empty={...project(),zones:[]};reset(empty);const element=api.ZoneGroupActions({project:empty,locale:'en'});assert.equal(element.props.disabled,true);click(element,'hidden');assert.equal(store.getState().past.length,0);
});

test('engineering group actions commit once, affect only their own categories and keep selection',()=>{
 for(const group of ['equipment','networks'])for(const flag of ['hidden','locked']){
  const p=project();reset(p);const own=group==='equipment'?['waterSupply','valves','automation']:['pipelines','electric'],other=group==='equipment'?['pipelines','electric']:['waterSupply','valves','automation'];
  click(api.EngineeringGroupActions({project:p,group,locale:'en'}),flag);
  const state=store.getState();assert.equal(state.past.length,1);assert.deepEqual(state.selectedIds,['head']);
  for(const key of own)assert.equal(state.project.engineering.categories[key][flag],true);
  for(const key of other)assert.deepEqual(state.project.engineering.categories[key],p.engineering.categories[key]);
  state.undo();assert.deepEqual(store.getState().project.engineering,p.engineering);
 }
});

test('both zone headers expose bulk actions; equipment/network controls are no longer duplicated in their bodies',async()=>{
 const p=project();reset(p);i18n.setActiveLocale('en');
 const eng=renderToStaticMarkup(React.createElement(zones.EngineeringZones,{project:p,focus:null,onFocus(){},expanded:[],onToggle(){},units:units.METRIC_UNITS,locale:'en'}));
 const irr=renderToStaticMarkup(React.createElement(irrigation.IrrigationSystemCards,{initialSection:'tank'}));
 for(const html of [eng,irr]){assert.equal((html.match(/data-group-action="hidden"/g)||[]).length,1);assert.equal((html.match(/data-group-action="locked"/g)||[]).length,1);assert.match(html,/inspector-card-header-actions/);}
 const source=await readFile('src/components/designer/engineering-workspace.tsx','utf8');
 assert.match(source,/actions=\{<EngineeringGroupActions group=\{group\} project=\{project\} locale=\{locale\}\/>\}/);assert.ok(!source.includes("(['hidden','locked'] as const).map"));
});

test('bulk hide cannot reopen the zones accordion through a cleared head selection',async()=>{
 const source=await readFile('src/components/designer/irrigation-system-cards.tsx','utf8');
 const code=(await transformWithEsbuild(source.replace(/^import .*;\n/gm,'').replace('export function','function'),'header-action-state.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement'})).code;
 let open,previousDeps,effect,ref={current:null};
 const env={React,useState:initial=>[open===undefined?(open=initial):open,value=>{open=typeof value==='function'?value(open):value;}],useRef:()=>ref,useEffect:(fn,deps)=>{if(!previousDeps||deps.some((d,i)=>d!==previousDeps[i]))effect=fn;previousDeps=deps;},useProject:selector=>selector(store.getState()),tr:i18n.tr,InspectorCard:'card',ZoneGroupActions:api.ZoneGroupActions,ZoneList:'zones',HydraulicPanel:'pump',TankRecommendationPanel:'tank'};
 const Component=new Function(...Object.keys(env),code+';return IrrigationSystemCards;')(...Object.values(env));
 const render=props=>{let tree=Component(props);if(effect){const fn=effect;effect=null;fn();tree=Component(props);}return walk(tree).filter(n=>n.type==='card');};
 for(const initial of ['selection','tank']){
  reset(project());open=undefined;previousDeps=undefined;ref.current=null;
  const props={selection:{key:'head:head',title:'MP1000',content:'head'}};
  let cards=render(props);if(initial==='tank'){cards.find(c=>c.props.id==='tank').props.onToggle();cards=render(props);}
  const zone=cards.find(c=>c.props.id==='irrigationZones');click(api.ZoneGroupActions(zone.props.actions.props),'hidden');
  cards=render({});assert.deepEqual(cards.filter(c=>c.props.open).map(c=>c.props.id),initial==='tank'?['tank']:[]);
  store.setState({selectedId:'another',selectedIds:['another']});cards=render({selection:{key:'head:another',title:'Other',content:'head'}});assert.deepEqual(cards.filter(c=>c.props.open).map(c=>c.props.id),['selection']);
 }
});

test('header action chrome is borderless in the priority layer, with independent red state marks and touch-sized targets',async()=>{
 const css=await readFile('src/components/designer/inspector-card.css','utf8'),tree=postcss.parse(css);let rule;
 tree.walkRules(candidate=>{if(candidate.selector==='.inspector-card .inspector-card-header-actions button.inspector-header-action')rule=candidate;});
 assert.ok(rule);assert.equal(rule.parent.name,'layer');assert.equal(rule.parent.params,'designer-controls.inspector-card-chrome');
 const values=Object.fromEntries(rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n]));
 for(const [property,value]of Object.entries({border:'0',background:'transparent','box-shadow':'none'})){assert.equal(values[property].value,value);assert.equal(values[property].important,true);}
 assert.match(css,/\.inspector-eye\[data-hidden=true\]::after\{[^}]*background:#e33646/);
 assert.match(css,/\.inspector-header-action\[data-locked=true\]>svg\{color:#e33646!important/);
 assert.match(css,/@media\(pointer:coarse\)\{[^}]*min-width:2\.75rem;min-height:2\.75rem/);
});
