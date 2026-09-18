import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("cursor stays in drawing, and tape measurement leaves construction and editing", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
    const { emptyProject } = await server.ssrLoadModule("/src/lib/project-types.ts");
    const { emptyDrawing } = await server.ssrLoadModule("/src/lib/cad/types.ts");
    const { addRect } = await server.ssrLoadModule("/src/lib/cad/engine.ts");
    const { cadModeOf } = await server.ssrLoadModule("/src/lib/cad/mode.ts");
    const drawing = addRect(emptyDrawing(), { x: 0, y: 0 }, { x: 4, y: 3 }, "lawn");
    const face = Object.keys(drawing.faces)[0];
    useProject.setState({ project: { ...emptyProject(), drawing }, tool: null, cadEditId: null,
      groupMemberId: null, selectedPolyIds: [], selectedPolyId: null, selectedEdgeId: null,
      spaceDown: false, panX: 31, panY: 42, pxPerMeter: 60 });
    const st = useProject.getState();
    st.setTool("draw"); st.setDrawSub("rect");
    const before = useProject.getState();
    st.setCadMode("select");
    let next = useProject.getState();
    assert.equal(next.tool, "draw", "drawing palette stays open");
    assert.equal(next.drawSub, "none", "rectangle is disarmed");
    assert.equal(cadModeOf(next), "select");
    assert.equal(next.project, before.project, "selection does not change geometry");
    assert.deepEqual([next.panX, next.panY, next.pxPerMeter], [31, 42, 60]);
    st.selectPoly(face);
    assert.equal(useProject.getState().selectedPolyId, face);
    st.setDrawSub("rect");
    assert.equal(useProject.getState().drawSub, "rect", "drawing can resume directly");

    for (const activate of [() => st.setMeasureSub("measure"), () => st.setTool("measure"), () => st.setCadMode("measure")]) {
      st.setCadEdit(face);
      activate();
      next = useProject.getState();
      assert.equal(next.tool, "measure");
      assert.equal(next.drawSub, "none", "no stale rectangle preview while measuring");
      assert.equal(next.cadEditId, null, "editing handles do not capture tape clicks");
      assert.equal(next.catalogOpen, false);
      assert.equal(next.draft.measureA, null);
      assert.deepEqual([next.panX, next.panY, next.pxPerMeter], [31, 42, 60]);
    }

    // A completed dimension survives the second point at wide-area zoom,
    // can be hidden explicitly, and is made visible when drawing dimensions again.
    useProject.setState({pxPerMeter:8,dimensionOffsetCustomized:false,gridStep:0.5,past:[],future:[]});
    st.setCadLayer("dims",{visible:false});
    st.setDrawSub("dim");
    assert.equal(useProject.getState().project.drawing.layers.dims.visible,true);
    st.addDraftPoint({x:0,y:0});
    st.addDimension({x:0,y:0},{x:4,y:0});
    next=useProject.getState();
    const dim=Object.values(next.project.drawing.dims)[0];
    assert.ok(dim);
    assert.equal(dim.offset,-1);
    assert.deepEqual(next.draft.points,[]);
    assert.equal(next.drawSub,"dim");
    assert.equal(next.project.drawing.layers.dims.visible,true);
    assert.equal(next.pxPerMeter,8);
    st.setCadMode("select");
    assert.ok(useProject.getState().project.drawing.dims[dim.id]);
    st.undo();
    assert.equal(Object.keys(useProject.getState().project.drawing.dims).length,0);
    st.redo();
    assert.ok(useProject.getState().project.drawing.dims[dim.id]);
    const saved=useProject.getState().project;
    st.addDimension({x:1,y:1},{x:1,y:1});
    assert.equal(useProject.getState().project,saved,"a repeated point does not create a zero-length dimension");

    const {snapDimension,isDimensionGeometrySnap}=await server.ssrLoadModule("/src/lib/cad/dimension-snap.ts");
    const options={pxPerMeter:100,snapOn:true,snapGridOn:true,gridStep:0.5};
    for (const pointerType of ["mouse","touch","pen"]) {
      const corner=snapDimension({x:0.02,y:0.02},drawing,{...options,pointerType});
      assert.equal(corner.kind,"end");
      assert.equal(isDimensionGeometrySnap(corner.kind),true);
      const edge=snapDimension({x:1.1,y:0.03},drawing,{...options,pointerType});
      assert.equal(isDimensionGeometrySnap(edge.kind),true);
      const grid=snapDimension({x:10.02,y:10.02},drawing,{...options,pointerType});
      assert.equal(grid.kind,"grid");
      assert.equal(isDimensionGeometrySnap(grid.kind),false);
    }
    for(const kind of [undefined,"none","grid","horiz","vert","parallel","extend"]) assert.equal(isDimensionGeometrySnap(kind),false);

    const {formatLenU,recommendedUnitSystem}=await server.ssrLoadModule("/src/lib/units.ts");
    const {tr,setActiveLocale,setNumberPrefs}=await server.ssrLoadModule("/src/lib/i18n.ts");
    setActiveLocale("en");setNumberPrefs("comma-dot",2);
    assert.equal(formatLenU(0.3048,"ft"),"1.00 ft");
    assert.equal(formatLenU(0.0254,"in"),"1.00 in");
    assert.equal(formatLenU(1,"mm"),"1,000 mm");
    assert.equal(formatLenU(1,"cm"),"100.0 cm");
    assert.equal(formatLenU(1,"m"),"1.00 m");
    assert.equal(recommendedUnitSystem("ja","JP"),"metric");
    assert.equal(tr("ru","drawDim"),"Размер");
    assert.equal(tr("ja","drawDim"),"寸法");
    const {TapeMeasureIcon,TAPE_MEASURE_TIP}=await server.ssrLoadModule("/src/components/designer/tape-measure-icon.tsx");
    const {renderToStaticMarkup}=await import("react-dom/server");
    assert.ok(TAPE_MEASURE_TIP.x<12,"the tip extends left from the case");
    const blue=renderToStaticMarkup(TapeMeasureIcon({showTip:true}));
    const green=renderToStaticMarkup(TapeMeasureIcon({showTip:true,snapped:true}));
    assert.match(blue, /fill="#1689e8"/);
    assert.match(green, /fill="#22a35a"/);
  } finally { await server.close(); }
});
