import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Dialog from '@radix-ui/react-dialog';
import { createServer } from 'vite';

test('settings: three localized sections, all languages, hints and isolated UI scaling', async () => {
  const server=await createServer({server:{middlewareMode:true,hmr:false}});
  const previousDocument=globalThis.document;
  try {
    const {SettingsTabs}=await server.ssrLoadModule('/src/components/designer/settings-panel.tsx');
    const {useProject}=await server.ssrLoadModule('/src/lib/project-store.ts');
    const {LOCALES,tr}=await server.ssrLoadModule('/src/lib/i18n.ts');
    const {UI_SCALE,applyUiSize}=await server.ssrLoadModule('/src/lib/ui-scale.ts');
    const render=tab=>renderToStaticMarkup(React.createElement(Dialog.Root,{open:true},React.createElement(SettingsTabs,{tab,onTabChange(){}})));
    for(const {id} of LOCALES) {
      useProject.setState({locale:id,showHints:true});
      Object.assign(useProject.getInitialState(),useProject.getState());
      const ui=render('ui'),languages=render('lang'),units=render('units');
      assert.match(ui,/<label class="settings-hints"><input type="checkbox"[^>]*checked=""/);
      for(const key of ['theme_crystal','theme_pearl','theme_sage','theme_ice','theme_sand','theme_lavender','theme_light','theme_mint','theme_graphite','showHints'])assert.ok(ui.includes(tr(id,key)),`${id}: ${key}`);
      assert.equal((ui.match(/class="theme-card"/g)||[]).length,9);
      assert.equal((languages.match(/class="settings-language"/g)||[]).length,20);
      for(const language of LOCALES) assert.ok(languages.includes(language.native),`${id}: ${language.native}`);
      assert.match(languages,new RegExp(`lang="${id}"[^>]*aria-pressed="true"`));
      assert.ok(!units.includes(tr(id,'numberFormat')));
      assert.doesNotMatch(languages, /<p(?:\s|>)/, 'language choices have no duplicate explanatory heading');
    }
    const before=useProject.getState(),project=JSON.stringify(before.project);
    const root={dataset:{},style:{setProperty(){}}};
    globalThis.document={documentElement:root};
    for(const [size,scale] of Object.entries(UI_SCALE)) {
      useProject.getState().setUiSize(size);applyUiSize(size);
      assert.equal(root.dataset.uiSize,size);
      assert.equal(parseFloat(root.style.fontSize),scale*100);
      const after=useProject.getState();
      assert.equal(JSON.stringify(after.project),project);
      for(const key of ['panX','panY','pxPerMeter','past','future','selectedId','units'])assert.equal(after[key],before[key],`${size}: ${key}`);
    }
    useProject.getState().setShowHints(false);
    assert.equal(useProject.getState().showHints,false);
    assert.equal(JSON.stringify(useProject.getState().project),project);
  } finally {
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
    await server.close();
  }
});
