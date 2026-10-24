import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import Konva from 'konva';
import { KonvaRenderer } from 'react-konva/lib/ReactKonvaCore.js';
import { createServer } from 'vite';

test('compact diagnostics retain every numbered direction and empty areas do not crash the canvas renderer', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  const actEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let root;
  try {
    const { diagnosticReportCards } = await server.ssrLoadModule('/src/lib/diagnostic-report.ts');
    const { emptyProject } = await server.ssrLoadModule('/src/lib/project-types.ts');
    const { useProject } = await server.ssrLoadModule('/src/lib/project-store.ts');
    const { useDiagnosticFocus } = await server.ssrLoadModule('/src/lib/diagnostic-focus.ts');
    const { DiagnosticOverlay } = await server.ssrLoadModule('/src/components/designer/diagnostic-overlay.tsx');
    const issue = { id: 'test', level: 'warn', titleKey: 'diagOverlap', detailKey: 'diagOverlapWetDetail', headIds: [], zoneIds: [], metrics: [], area: [] };
    const issues = [issue, { ...issue, id: 'b', headIds: ['b','a'] }, { ...issue, id: 'c', titleKey: 'diagOverspray', zoneIds: [1] }, { ...issue, id: 'd', titleKey: 'diagOverspray', zoneIds: [2] }];
    const before = JSON.stringify(issues), cards = diagnosticReportCards(issues);
    assert.equal(cards.length, 3);
    assert.equal(cards[1].groups.length, 2);
    assert.equal(cards[1].groups[0].entries.length, 2);
    assert.equal(cards[1].groups[1].entries.length, 2);
    assert.deepEqual(cards[1].groups[1].zoneIds, [1,2]);
    assert.deepEqual(cards.flatMap(c => c.groups.flatMap(g => g.entries.map(i => i.reportNumber))), [1,2,3,4]);
    assert.equal(JSON.stringify(issues), before);

    const project = emptyProject(), errors = [];
    const container = new Konva.Group();
    root = KonvaRenderer.createContainer(container, 1, null, false, null, '', error => errors.push(error), error => errors.push(error), error => errors.push(error), null);
    useProject.setState({ project });
    const projectBefore = JSON.stringify(project);
    const canvas = { current: null };
    for (const area of [[], [[[[0,0],[1,0],[1,1],[0,0]]]], []]) {
      await React.act(async () => {
        useDiagnosticFocus.getState().show(project, { ...issue, area });
        KonvaRenderer.updateContainer(React.createElement(DiagnosticOverlay, { project, px: 36, panX: 0, panY: 0, size: { w: 900, h: 700 }, canvas }), root, null, () => {});
      });
      assert.equal(container.children.length, 1, 'the scene remains mounted when the warning area disappears');
      assert.equal(errors.length, 0, errors.map(error => error.message).join('\n'));
      assert.equal(JSON.stringify(useProject.getState().project), projectBefore);
    }
    await React.act(async () => KonvaRenderer.updateContainer(null, root, null, () => {}));
    root = null;
  } finally {
    if (root) await React.act(async () => KonvaRenderer.updateContainer(null, root, null, () => {}));
    globalThis.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    await server.close();
  }
});

test('animation uses angular speed, emission history and separate bubbler patterns', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const w = await server.ssrLoadModule('/src/lib/watering-preview.ts');
    const { CATALOG } = await server.ssrLoadModule('/src/lib/hunter-catalog.ts');
    const { catalogHeadDefaults } = await server.ssrLoadModule('/src/lib/flow.ts');
    const head = { ...catalogHeadDefaults(CATALOG.find(item => item.id === 'I-20')), id: 'head-a', catalogId: 'I-20', x: 0, y: 0, start: 0, arc: 180, r: 8, zone: 1 };
    const profile = w.wateringProfile(head), time = 4;
    assert.ok(Math.abs(w.wateringAngle(0, 90, time) - w.wateringAngle(0, 180, time)) < 1e-9);
    assert.equal(w.wateringAngle(0, 180, 37.5), 180);
    assert.equal(w.wateringAngle(0, 180, 75), 0);
    assert.notEqual(w.wateringPhase(head, profile), w.wateringProfile({ ...head, id: 'another-head' }).phaseSeconds);
    const path = w.wateringJetPath(head, 30, profile, 0);
    const historical = w.wateringJets(head, 30 - w.wateringFlightSeconds(head), profile)[0];
    assert.ok(Math.abs(path.at(-1).x - Math.cos(historical.angle) * head.r) < 1e-8);
    assert.ok(path.every(p => Math.hypot(p.x,p.y) <= head.r + 1e-8));
    assert.equal(w.wateringProfile({ ...head, ...catalogHeadDefaults(CATALOG.find(item=>item.id==='PCB-25')), catalogId: 'PCB-25' }).bubblePattern, 'trickle');
    assert.equal(w.wateringProfile({ ...head, ...catalogHeadDefaults(CATALOG.find(item=>item.id==='PCB-20')), catalogId: 'PCB-20' }).bubblePattern, 'umbrella');
    for (const item of CATALOG.filter(item => item.type !== 'body')) {
      const instance = { ...head, ...catalogHeadDefaults(item), catalogId: item.id };
      const p = w.wateringProfile(instance);
      for (let index = 0; index < 100; index++) {
        const d = w.wateringDrop(instance, 18.25, index, p);
        if (d) assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y), item.id);
      }
    }
  } finally { await server.close(); }
});
