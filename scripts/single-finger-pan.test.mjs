import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false } });
const { installSingleFingerPan } = await server.ssrLoadModule('/src/components/designer/single-finger-pan.ts');
await server.close();

function fixture() {
  const listeners = new Map();
  const oldWindow = globalThis.window, oldCanvas = globalThis.HTMLCanvasElement;
  globalThis.window = { addEventListener(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); },
    removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) ?? []).filter(f => f !== fn)); } };
  globalThis.HTMLCanvasElement = class {};
  const drawing = new globalThis.HTMLCanvasElement(), panel = {};
  const root = { contains: node => node === drawing };
  let allowed = true, holds = 0, suppressed = 0;
  const view = { x: 10, y: 20 }, model = { selection: 'face-1', points: [{ x: 2, y: 3 }], area: 48 };
  const dispose = installSingleFingerPan(root, { canPan: () => allowed, readPan: () => view,
    setPan: (x, y) => Object.assign(view, { x, y }), begin() {}, cancelHold: () => holds++, suppressTap: () => suppressed++ });
  return { view, model, set allowed(v) { allowed = v; }, get holds() { return holds; }, get suppressed() { return suppressed; },
    fire(type, { id = 1, x = 100, y = 100, touches, ui = false, pointerType = 'touch' } = {}) {
      const e = { type, pointerId: id, pointerType, clientX: x, clientY: y, target: ui ? panel : drawing, cancelable: true,
        prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      if (touches != null) e.touches = { length: touches };
      for (const fn of listeners.get(type) ?? []) { fn(e); if (e.stopped) break; }
      return e;
    }, cleanup() { dispose(); globalThis.window = oldWindow; globalThis.HTMLCanvasElement = oldCanvas; } };
}

test('tap remains available for normal selection; drags over any canvas content pan without changing geometry', () => {
  const f = fixture();
  try {
    const original = structuredClone(f.model);
    assert.equal(f.fire('pointerdown').stopped, false);
    f.fire('pointermove', { x: 105, y: 103 });
    assert.deepEqual(f.view, { x: 10, y: 20 });
    assert.equal(f.fire('pointerup', { x: 105, y: 103 }).stopped, false);
    assert.equal(f.fire('touchend', { touches: 0 }).stopped, false);
    f.fire('pointerdown');
    assert.equal(f.fire('pointermove', { x: 132.5, y: 118.25 }).stopped, true);
    assert.deepEqual(f.view, { x: 42.5, y: 38.25 });
    assert.equal(f.holds, 1);
    assert.equal(f.fire('touchmove', { touches: 1 }).stopped, true, 'Konva cannot drag an object');
    assert.equal(f.fire('pointerup').stopped, true);
    assert.equal(f.fire('touchend', { touches: 0 }).stopped, true, 'pan cannot turn into selection');
    assert.deepEqual(f.model, original);
  } finally { f.cleanup(); }
});

test('editing, drawing, panels and pen input bypass single-finger navigation', () => {
  const f = fixture();
  try {
    f.allowed = false;
    assert.equal(f.fire('pointerdown').stopped, false);
    assert.equal(f.fire('pointermove', { x: 200 }).stopped, false);
    f.allowed = true;
    f.fire('pointerdown', { ui: true }); f.fire('pointermove', { x: 200, ui: true });
    f.fire('pointerdown', { pointerType: 'pen' }); f.fire('pointermove', { x: 200, pointerType: 'pen' });
    assert.deepEqual(f.view, { x: 10, y: 20 });
    // A long press may enter edit after initial down; movement must then pass to editing.
    f.fire('pointerdown'); f.allowed = false;
    assert.equal(f.fire('pointermove', { x: 200 }).stopped, false);
    assert.deepEqual(f.view, { x: 10, y: 20 });
  } finally { f.cleanup(); }
});

test('adding a second finger hands off to the existing pinch handler, including during pan', () => {
  const f = fixture();
  try {
    f.fire('pointerdown'); f.fire('pointermove', { x: 125 });
    assert.deepEqual(f.view, { x: 35, y: 20 });
    assert.equal(f.fire('pointerdown', { id: 2, x: 200 }).stopped, false);
    f.allowed = false; // Existing pinch handler marks the two-finger sequence active.
    assert.equal(f.fire('touchmove', { touches: 2 }).stopped, false);
    assert.equal(f.fire('pointermove', { id: 1, x: 400 }).stopped, false);
    assert.equal(f.fire('touchend', { touches: 1 }).stopped, false);
    assert.deepEqual(f.view, { x: 35, y: 20 }, 'only the pinch handler now owns viewport changes');
    f.allowed = true; f.fire('pointerdown', { id: 3 });
    f.fire('pointercancel', { id: 3 });
    assert.equal(f.fire('touchend', { touches: 0 }).stopped, true);
  } finally { f.cleanup(); }
});

test('the first drawing contact immediately after a pan is not suppressed', () => {
 const f=fixture();
 try {
  f.fire('pointerdown');f.fire('pointermove',{x:140});f.fire('pointerup');
  assert.equal(f.fire('touchend',{touches:0}).stopped,true);
  f.allowed=false;
  f.fire('pointerdown',{id:2});
  assert.equal(f.fire('pointerup',{id:2}).stopped,false);
  assert.equal(f.fire('touchend',{touches:0}).stopped,false);
  assert.equal(f.fire('click').stopped,false);
 } finally {f.cleanup();}
});
