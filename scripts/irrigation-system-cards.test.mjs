import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer,transformWithEsbuild} from 'vite';
let server,component,store,types,i18n,units,source;
before(async()=>{
 server=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,hmr:false},logLevel:'silent'});
 [component,{useProject:store},types,i18n,units]=await Promise.all(['components/designer/irrigation-system-cards.tsx','lib/project-store.ts','lib/project-types.ts','lib/i18n.ts','lib/units.ts'].map(p=>server.ssrLoadModule('/src/'+p)));
 source=await readFile('src/components/designer/irrigation-system-cards.tsx','utf8');
});
after(async()=>server?.close());
const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];

test('irrigation selection, zones, pump and tank share one open card and preserve project data',async()=>{
 const project=types.emptyProject();store.setState({project,locale:'en'});const snapshot=JSON.stringify(project);
 const code=(await transformWithEsbuild(source.replace(/^import .*;\n/gm,'').replace('export function','function'),'cards.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'React.createElement'})).code;
 let state;const useState=initial=>{if(state===undefined)state=initial;return [state,v=>state=typeof v==='function'?v(state):v];};
 const env={React,useState,useRef:()=>({current:null}),useEffect(){},useProject:selector=>selector(store.getState()),tr:i18n.tr,InspectorCard:'card',ZoneGroupActions:'zone-actions',ZoneList:'zones',HydraulicPanel:'pump',TankRecommendationPanel:'tank'};
 const render=new Function(...Object.keys(env),code+';return IrrigationSystemCards;')(...Object.values(env));
 const props={selection:{key:'head:a',title:'MP1000',content:React.createElement('p',null,'head')}};
 const cards=()=>walk(render(props)).filter(n=>n.type==='card');
 assert.equal(cards().filter(n=>n.props.open)[0].props.id,'selection');
 for(const key of ['tank','pump','irrigationZones','selection']){cards().find(n=>n.props.id===key).props.onToggle();assert.deepEqual(cards().filter(n=>n.props.open).map(n=>n.props.id),[key]);}
 cards().find(n=>n.props.id==='selection').props.onToggle();assert.equal(cards().filter(n=>n.props.open).length,0);
 assert.equal(JSON.stringify(store.getState().project),snapshot);
});

test('complete irrigation cards render localized headings and only the requested body in both unit systems',()=>{
 for(const {id:locale}of i18n.LOCALES)for(const prefs of [units.METRIC_UNITS,units.US_UNITS]){
  const project=types.emptyProject();store.setState({project,locale,units:prefs});Object.assign(store.getInitialState(),store.getState());i18n.setActiveLocale(locale);units.setActiveUnits(prefs);
  for(const section of ['zones','pump','tank']){
   const html=renderToStaticMarkup(React.createElement(component.IrrigationSystemCards,{initialSection:section}));
   assert.equal((html.match(/data-open="true"/g)||[]).length,1);
   assert.ok(html.includes(i18n.tr(locale,'engineering.pumpRecommendation')));assert.ok(html.includes(i18n.tr(locale,'engineering.tankRecommendation')));
   assert.equal(html.includes('data-recommendation="pump"'),section==='pump');assert.equal(html.includes('data-recommendation="tank"'),section==='tank');
   assert.doesNotMatch(html,/NaN|Infinity|engineering\.[A-Za-z]/,locale);
  }
 }
});
