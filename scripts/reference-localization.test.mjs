import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createServer } from "vite";
import React from "react";
import { unzipSync, strFromU8 } from "fflate";
import { renderToStaticMarkup } from "react-dom/server";

test("reference workflow, persistence and twenty-language engineering interface", async t => {
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  globalThis.window = { localStorage: globalThis.localStorage, dispatchEvent() {}, setTimeout() {}, requestAnimationFrame: callback => setImmediate(callback), cancelAnimationFrame: clearImmediate, atob: globalThis.atob, btoa: globalThis.btoa };
  const server = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const load = path => server.ssrLoadModule(path);
    const { useProject: store, migrateProject } = await load("/src/lib/project-store.ts");
    if (!store.persist.hasHydrated()) await new Promise(resolve => { const off = store.persist.onFinishHydration(() => { off(); resolve(); }); });
    const { emptyProject, zoneLabel } = await load("/src/lib/project-types.ts");
    const { referenceCorners } = await load("/src/lib/reference-geometry.ts");
    const i18n = await load("/src/lib/i18n.ts"), units = await load("/src/lib/units.ts");
    const { parseCadInput } = await load("/src/lib/cad/parse.ts");
    const { itemById } = await load("/src/lib/hunter-catalog.ts");
    const { catalogHeadDefaults } = await load("/src/lib/flow.ts");
    const exports = await load("/src/lib/export-plan.ts");
    const { parseProjectFile, toProjectFile, fileStem } = await load("/src/lib/project-file.ts");
    const reference = { name: "Site page 2.pdf", src: "data:image/png;base64," + "A".repeat(1_500_001), x: 7, y: 4, width: 20, height: 10, pixelWidth: 2000, pixelHeight: 1000, opacity: .5, rotation: 90, locked: false, visible: true, pageNumber: 2, pageCount: 3 };
    const item = itemById("MP2000-90");
    const head = { ...catalogHeadDefaults(item), id: "head-one", catalogId: item.id, x: 4, y: 5, start: 45, zone: 1, locked: false };
    const project = { ...emptyProject("Reference regression"), underlay: reference, scaleCalibrated: false, heads: [head], polygons: [{ id: "plot", kind: "lawn", points: [{x:0,y:0},{x:20,y:0},{x:20,y:15},{x:0,y:15}] }] };

    await t.test("calibration keeps existing geometry and an anchor, records scale, locks, and undoes", () => {
      store.setState({ project, projects: [], past: [], pastOps: [], future: [], futureOps: [], locale: "ru", units: units.METRIC_UNITS, numberFormat: "auto" });
      const before = structuredClone(store.getState().project);
      store.getState().applyScale({x:7,y:4}, {x:7,y:14}, 12.5);
      const after = store.getState().project;
      assert.deepEqual(after.heads, before.heads);
      assert.deepEqual(after.polygons, before.polygons);
      assert.equal(after.underlay.x, 7); assert.equal(after.underlay.y, 4);
      assert.equal(after.underlay.width, 25); assert.equal(after.underlay.height, 12.5);
      assert.equal(after.underlay.calibration.metersPerPixel, .0125);
      assert.equal(after.underlay.locked, true); assert.equal(after.scaleCalibrated, true);
      assert.ok(Math.abs(referenceCorners(after.underlay)[2].x + 5.5) < 1e-8);
      store.getState().patchUnderlay({x:900,y:800,width:400,height:300,rotation:0,opacity:.75,visible:false});
      const hidden = store.getState().project.underlay;
      assert.deepEqual([hidden.x,hidden.y,hidden.width,hidden.height,hidden.rotation], [7,4,25,12.5,90]);
      assert.equal(hidden.opacity,.75); assert.equal(hidden.visible,false);
      store.getState().patchUnderlay({visible:true});
      assert.equal(store.getState().project.underlay.opacity,.75);
      store.getState().patchUnderlay({locked:false});
      const calibration = store.getState().project.underlay.calibration;
      assert.equal(store.getState().project.scaleCalibrated, true, "unlocking alone keeps calibration");
      store.getState().patchUnderlay({x:9, y:11, rotation:135, width:25*(1+Number.EPSILON), height:12.5*(1+Number.EPSILON)});
      assert.equal(store.getState().project.scaleCalibrated, true, "moving and rotating preserve the scale despite floating-point noise");
      assert.deepEqual(store.getState().project.underlay.calibration, calibration);
      assert.deepEqual([store.getState().project.underlay.width, store.getState().project.underlay.height], [25,12.5]);
      assert.deepEqual(store.getState().project.heads, before.heads);
      store.getState().undo();
      store.getState().patchUnderlay({rotation:135,width:30,height:15});
      assert.equal(store.getState().project.scaleCalibrated,false);
      assert.equal(store.getState().project.underlay.calibration, undefined, "real resizing clears obsolete calibration");
      store.getState().undo();
      assert.equal(store.getState().project.underlay.width,25);
      assert.equal(store.getState().project.scaleCalibrated,true);
      const current = store.getState().project;
      for (const distance of [0, -1, NaN, Infinity]) store.getState().applyScale({x:1,y:1},{x:2,y:2},distance);
      store.getState().applyScale({x:1,y:1},{x:1,y:1},5);
      assert.deepEqual(store.getState().project,current);
    });

    await t.test("large references survive device storage, project export/reopen, and visibility changes", async () => {
      store.getState().saveCurrentToLibrary();
      const persisted = await store.persist.getOptions().storage.getItem("irrigation-designer-v3");
      assert.equal(persisted.state.project.underlay.src, reference.src);
      assert.equal(persisted.state.projects[0].underlay.src, reference.src);
      const file = toProjectFile({project:store.getState().project,showCoverage:true,showLabels:true,showGrid:true,snapOn:true,snapGridOn:true,gridStep:.5,measureUnit:"m",activeZoneId:1});
      const reopened = migrateProject(parseProjectFile(JSON.stringify(file)).project);
      assert.deepEqual(reopened.underlay, store.getState().project.underlay);
      assert.equal(reopened.underlay.pageNumber,2);
      const svg = exports.projectToSvg(reopened);
      assert.match(svg, /<image href="data:image\/png;base64,/);
      assert.match(svg, /transform="rotate\(90 7 4\)"/);
      assert.ok(svg.indexOf("<image ") < svg.indexOf("<path "));
      assert.ok(!exports.projectToSvg({...reopened,underlay:{...reopened.underlay,visible:false}}).includes("<image "));
      assert.equal(fileStem("庭園 東京 底图"),"庭園 東京 底图");
      const legacyState = store.persist.getOptions().merge({project: reopened, projects: [reopened], locale: "ru", units: units.US_UNITS}, store.getState());
      assert.deepEqual(legacyState.project.heads, reopened.heads, "legacy storage migration preserves existing sprinklers");
      assert.deepEqual(legacyState.projects[0].heads, reopened.heads);
      assert.deepEqual(legacyState.units, units.US_UNITS);
    });

    await t.test("language, units and canonical dimensions stay independent, including CAD entry", () => {
      const geometry = structuredClone(store.getState().project);
      store.getState().setUnitPreset("us");
      for (const {id: locale} of i18n.LOCALES) {
        store.getState().setLocale(locale);
        assert.deepEqual(store.getState().units,units.US_UNITS);
        assert.deepEqual(store.getState().project,geometry);
        assert.ok(Math.abs(parseCadInput("10").meters-3.048)<1e-8);
        assert.ok(Math.abs(parseCadInput("10ft2").meters2-.9290304)<1e-8);
        assert.ok(Math.abs(parseCadInput("10×20").height-6.096)<1e-8);
      }
      store.getState().setLocale("en"); store.getState().setUnitPreset("metric");
      assert.equal(store.getState().locale,"en");
      assert.equal(parseCadInput("10").meters,10);
      assert.equal(parseCadInput("１０メートル").meters,10);
      assert.equal(parseCadInput("12,50").meters,12.5);
      assert.equal(i18n.parseLocalizedNumber("1,234.50"),1234.5);
      store.getState().setLocale("ru");
      assert.equal(i18n.parseLocalizedNumber("1 234,50"),1234.5);
      assert.equal(i18n.parseLocalizedNumber("１２，５０"),12.5);
      assert.ok(Number.isNaN(i18n.parseLocalizedNumber("12m")));
      for(const unit of units.FLOW_OPTS) assert.ok(Math.abs(units.toLpm(units.fromLpm(37,unit),unit)-37)<1e-8);
      for(const unit of units.PRESSURE_OPTS) assert.ok(Math.abs(units.toBar(units.fromBar(2.8,unit),unit)-2.8)<1e-8);
      store.getState().setUnitPreset("us");
      assert.match(exports.projectToDxf(geometry),/\$INSUNITS\n70\n2\n/);
      assert.equal(zoneLabel({id:1,name:"Zone 1"}),"Зона 1");
      store.getState().setLocale("ja");
      assert.equal(zoneLabel({id:1,name:"Zone 1"}),"ゾーン 1");
      assert.equal(zoneLabel({id:1,name:"Orchard north"}),"Orchard north");
      for(const {id: locale} of i18n.LOCALES) {
        store.getState().setLocale(locale);
        for(const name of ["Газон перед домом", "Zone 1", "Зона 1", "庭園", "גן"]) {
          store.getState().renameZone(1,name);
          assert.equal(zoneLabel(store.getState().project.zones[0]),name);
          assert.equal(migrateProject(JSON.parse(JSON.stringify(store.getState().project))).zones[0].name,name);
        }
      }
    });

    await t.test("regional number and date formats round-trip through CAD in every language", async () => {
      const metricWords = {ru:"метров",en:"meters",es:"metros",de:"Meter",fr:"mètres","pt-BR":"metros",it:"metri",ja:"メートル","zh-CN":"米",pl:"metrów",tr:"metre",ar:"أمتار",nl:"meter",cs:"metrů",el:"μέτρα",hu:"méter",ro:"metri",sk:"metrov",he:"מטרים",uk:"метрів"};
      const inchWords = {ru:"дюймов",en:"inches",es:"pulgadas",de:"Zoll",fr:"pouces","pt-BR":"polegadas",it:"pollici",ja:"インチ","zh-CN":"英寸",pl:"cali",tr:"inç",ar:"بوصة",nl:"duim",cs:"palců",el:"ίντσες",hu:"hüvelyk",ro:"inci",sk:"palcov",he:"אינץ׳",uk:"дюймів"};
      const { normalizePlantSearch } = await load("/src/lib/landscape-types.ts");
      const { docsForFamily } = await load("/src/lib/hunter-docs.ts");
      for (const {id: locale} of i18n.LOCALES) {
        store.getState().setLocale(locale); store.getState().setUnitPreset("metric");
        store.getState().setNumberFormat("auto");
        const formatted = i18n.formatNumber(1234.5,2);
        assert.equal(i18n.parseLocalizedNumber(formatted),1234.5,locale);
        assert.equal(parseCadInput(`${formatted} m`).meters,1234.5,locale);
        assert.equal(parseCadInput(`${formatted} m²`).meters2,1234.5,locale);
        assert.equal(parseCadInput(`12,5 ${metricWords[locale]}`).meters,12.5,locale);
        assert.equal(parseCadInput(`10 ${inchWords[locale]}`).meters,.254,locale);
        assert.equal(i18n.formatDate("2026-09-19T12:00:00Z",locale),new Intl.DateTimeFormat(i18n.NUMBER_LOCALE[locale]).format(new Date("2026-09-19T12:00:00Z")));
        for(const format of ["space-comma","comma-dot","dot-comma"]) {
          store.getState().setNumberFormat(format);
          assert.equal(parseCadInput(`${i18n.formatNumber(1234.5,2)} m`).meters,1234.5,`${locale}:${format}`);
        }
        for(const malformed of ["1.2.3,4", "1,2,3.4", "12,34.5", "12.34,5", "NaN", "Infinity", "12abc"]) assert.ok(Number.isNaN(i18n.parseLocalizedNumber(malformed)),malformed);
        const docs=docsForFamily("mp",locale,units.METRIC_UNITS);
        assert.ok(docs.some(d=>d.label===i18n.tr(locale,"videoMatchedPrecip")));
        for(const doc of docs) assert.ok(i18n.localeMessages(locale)[doc.titleKey]);
      }
      for (const [a,b] of [["شَجَرَة","شجرة"],["עֵץ","עץ"],["ΔΈΝΤΡΟ","δεντρο"],["ÉRABLE","erable"],["İĞDE","igde"],["GŁÓG","glog"],["RÖTLICH","rotlich"],["AÇUCENA","acucena"]]) assert.equal(normalizePlantSearch(a),normalizePlantSearch(b));
      assert.notEqual(normalizePlantSearch("ガ"),normalizePlantSearch("カ"),"Japanese voicing must remain distinct");
      store.getState().setNumberFormat("auto");
    });

    await t.test("every supported message and interpolation is present, without English fallbacks", async () => {
      const en = i18n.localeMessages("en");
      const neutral = new Set([...i18n.NEUTRAL_MESSAGE_KEYS,"estimatePdf","estimateExcel","estimateWord","exportDxfCad","exportSvg","exportJson","exportPngFile","flow_lpm","flow_gpm","flow_gph","press_bar","press_kpa","press_psi","cat_mp","cat_strip","cat_corner","bar","lpm","bomRotator"]);
      const vars = value => [...value.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
      for(const {id: locale} of i18n.LOCALES) {
        const dict = i18n.localeMessages(locale);
        for(const [key,value] of Object.entries(en)) {
          assert.ok(typeof dict[key]==="string" && (dict[key].length || key==="hint_none"), `${locale}.${key}`);
          assert.deepEqual(vars(dict[key]),vars(value),`${locale}.${key}: interpolation`);
          if(["ja","zh-CN"].includes(locale) && /[A-Za-z]{3}/.test(value) && !neutral.has(key)) assert.notEqual(dict[key],value,`${locale}.${key}: English fallback`);
        }
      }
      // Current UI cannot add literal Russian copy outside the translation system.
      for(const file of await readdir("src/components/designer")) if(file.endsWith(".tsx")) {
        const source = await readFile(`src/components/designer/${file}`,"utf8");
        assert.ok(!/>[^<{]*[А-Яа-яЁё][^<{]*</.test(source),`${file}: literal JSX text`);
        assert.ok(!/(?:aria-label|placeholder|title)="[^"]*[А-Яа-яЁё]/.test(source),`${file}: literal attribute`);
      }
    });

    await t.test("reference and equipment panels render localized labels and units in all twenty languages", async () => {
      const { ReferencePanel } = await load("/src/components/designer/reference-panel.tsx");
      const { HeadPlacementSettings } = await load("/src/components/designer/head-placement-settings.tsx");
      const { CatalogReference } = await load("/src/components/designer/catalog-details.tsx");
      const { PlantInspector } = await load("/src/components/designer/landscape-library.tsx");
      const { SettingsPanel } = await load("/src/components/designer/settings-panel.tsx");
      const { ZoneReview } = await load("/src/components/designer/designer-app.tsx");
      const seed = JSON.parse(await readFile("data/landscape-plants.json","utf8"));
      const plain = s => s.replace(/<[^>]*>/g," ");
      for(const {id: locale} of i18n.LOCALES) {
        store.setState({ project:{...project,underlay:{...reference,src:"data:image/png;base64,AA==",locked:true}}, locale, units:units.US_UNITS, inspectedPlant:seed[0],selectedPlantId:null });
        Object.assign(store.getInitialState(), store.getState()); // Hydrated snapshot for server rendering.
        const ref = renderToStaticMarkup(React.createElement(ReferencePanel,{onUpload(){},busy:false}));
        assert.ok(ref.includes(i18n.tr(locale,"referenceTransparency")));
        assert.ok(ref.includes(i18n.tr(locale,"referenceScale")));
        assert.match(ref,/<input type="range"[^>]*value="50"/);
        assert.doesNotMatch(ref,/inputMode="decimal"/);
        assert.match(ref,/<button[^>]*reference-calibrate-action[^>]*disabled=""/);
        const review = renderToStaticMarkup(React.createElement(ZoneReview,{onCheck(){}}));
        assert.ok(!review.includes(i18n.tr(locale,"checkIrrigation")), locale);
        assert.ok(!review.includes(i18n.tr(locale,"checkProject")), locale);
        const html = [ref,renderToStaticMarkup(React.createElement(HeadPlacementSettings,{item,head})),renderToStaticMarkup(React.createElement(CatalogReference,{item,nozzle:item.nozzles[0]})),renderToStaticMarkup(React.createElement(PlantInspector,{})),renderToStaticMarkup(React.createElement(SettingsPanel,{onClose(){}}))].join("\n");
        assert.ok(!html.includes("NaN"));
        assert.ok(html.includes("PSI"));
        if(!["ru","uk"].includes(locale)) assert.ok(!/[А-Яа-яЁё]/.test(plain(html)),`${locale}: Russian leaked into UI`);
      }
    });

    await t.test("all scripts render in the shell with RTL UI and unchanged drawing data", async () => {
      const { DesignerApp } = await load("/src/components/designer/designer-app.tsx");
      const { localeDirection, matchLocale } = await load("/src/lib/locale-config.ts");
      const before = structuredClone(store.getState().project);
      for (const locale of ["en", "de", "ru", "zh-CN", "ja", "ar", "he", "uk"]) {
        store.getState().setLocale(locale);
        Object.assign(store.getInitialState(), store.getState());
        const html = renderToStaticMarkup(React.createElement(DesignerApp));
        assert.ok(html.includes(`dir="${localeDirection(locale)}" lang="${locale}"`),locale);
        assert.ok(html.includes(i18n.tr(locale,"reference")),locale);
        assert.deepEqual(store.getState().project,before);
      }
      assert.equal(matchLocale("pt"),"pt-BR");
      assert.equal(matchLocale("zh"),"zh-CN");
      assert.equal(matchLocale("iw-IL"),"he");
      assert.equal(matchLocale("unsupported"),null);
      store.getState().setLocale("ar");
      store.getState().setNumberFormat("auto");
      for (const value of [-1234.5, 0, 12.5, 1000]) assert.equal(i18n.parseLocalizedNumber(i18n.formatNumber(value,2)),value);
      assert.equal(parseCadInput("١٢٫٥ متر").meters,12.5);
      assert.equal(parseCadInput("۱۲٫۵ متر").meters,12.5);
      assert.equal(parseCadInput("25 сантиметров").meters,.25);
      assert.equal(parseCadInput("250 milimetrów").meters,.25);
      assert.equal(i18n.tr("ar","zoneN",{n:2}),i18n.tr("ar","zoneN",{n:"٢"}));
    });

    await t.test("estimate exports preserve localized text, RTL reading order and numeric spreadsheet cells", async () => {
      const canvas = await import("@napi-rs/canvas");
      const blobs = [];
      const target={createWritable:async()=>({write:async blob=>{blobs.push(blob);},close:async()=>{},abort:async()=>{}})};
      const originalCreate = URL.createObjectURL;
      URL.createObjectURL = blob => { blobs.push(blob); return "blob:test"; };
      globalThis.document = {
        fonts: { ready: Promise.resolve() }, body: { appendChild() {} },
        createElement(tag) {
          if(tag === "canvas") return canvas.createCanvas(1,1);
          if(tag === "a") return {click(){},remove(){}};
          throw Error(tag);
        },
      };
      try {
        for(const locale of ["en","ru","zh-CN","ja","ar","he"]){
          store.getState().setLocale(locale);
          const rtl = ["ar","he"].includes(locale);
          await exports.exportEstimateWord(project,"estimate",target);
          const word = await blobs.at(-1).text();
          assert.ok(word.includes(`lang="${locale}" dir="${rtl ? "rtl" : "ltr"}"`));
          assert.ok(word.includes(i18n.tr(locale,"estimate")));
          await exports.exportEstimateExcel(project,"estimate",target);
          const archive = unzipSync(new Uint8Array(await blobs.at(-1).arrayBuffer()));
          const sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]);
          assert.ok(sheet.includes(`rightToLeft="${rtl?1:0}"`));
          assert.match(sheet,/<c r="A2"><v>1<\/v><\/c>/);
          assert.ok(strFromU8(archive["xl/workbook.xml"]).includes(i18n.tr(locale,"estimate")));
          await exports.exportEstimatePdf(project,"estimate",target);
          const pdf = await blobs.at(-1).text();
          assert.ok(pdf.startsWith("%PDF"),locale);
          assert.ok(!pdf.includes("NaN"),locale);
        }
      } finally { URL.createObjectURL = originalCreate; delete globalThis.document; }
    });

    await t.test("real multipage PDF pages render by selection and retain the chosen page metadata", async () => {
      const canvas = await import("@napi-rs/canvas");
      globalThis.DOMMatrix = canvas.DOMMatrix; globalThis.Path2D = canvas.Path2D; globalThis.ImageData = canvas.ImageData;
      globalThis.document = { createElement(tag) { if(tag==="canvas") return canvas.createCanvas(1,1); throw Error(tag); } };
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({format:[100,150]});
      pdf.setFillColor(240,20,20);pdf.rect(0,0,100,150,"F");pdf.addPage([150,100],"landscape");pdf.setFillColor(20,20,240);pdf.rect(0,0,150,100,"F");pdf.addPage();
      const buffer = pdf.output("arraybuffer");
      const { openPdfReference } = await load("/src/lib/pdf-underlay.ts");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")).href;
      const opened = await openPdfReference({name:"three.pdf",type:"application/pdf",arrayBuffer:async()=>buffer});
      try {
        assert.equal(opened.pageCount,3);
        const second = await opened.renderPage(2), first = await opened.renderPage(1);
        assert.equal(second.pageNumber,2); assert.equal(second.pageCount,3);
        assert.ok(second.width>second.height);assert.ok(first.height>first.width);
        assert.notEqual(second.src,first.src);
        await assert.rejects(opened.renderPage(0)); await assert.rejects(opened.renderPage(4));
      } finally { await opened.dispose(); delete globalThis.document; }
    });
  } finally {
    await storeDrain(server);
    await server.close();
    delete globalThis.window; delete globalThis.document; delete globalThis.localStorage;
  }
});
async function storeDrain(server) {
  const { useProject } = await server.ssrLoadModule("/src/lib/project-store.ts");
  await useProject.persist.getOptions().storage.getItem("irrigation-designer-v3");
}
