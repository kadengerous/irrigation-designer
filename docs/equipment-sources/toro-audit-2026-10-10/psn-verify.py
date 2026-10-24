"""Offline audit of fresh web-tool table extraction; writes only sibling psn-* evidence."""
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
import json, re, hashlib

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATE = '2026-10-10'
CHART = 'https://cdn.thetorocompany.com/api/assetstorage/623_0a983555-fa05-4587-b85c-a7a2c67a0e4e'
SHEET = 'https://cdn.thetorocompany.com/api/assetstorage/623_40a88c26-9e2a-4212-918c-b86a065f0536'
AU = 'https://www.toroirrigationsolutions.com.au/homeowner/psn-series-nozzles/'
models = [m for m in json.loads((ROOT/'src/data/equipment/toro.json').read_text()) if m.get('modelId','').startswith('PSN')]
chart_text = (HERE/'psn-current-chart-web.txt').read_text()
sheet_text = (HERE/'psn-current-sellsheet-web.txt').read_text()
arc_map = {'60':60, 'Q':90, 'T':120, '150':150, 'H':180, '210':210, 'TT':240, 'TQ':270, 'F':360}
sources = []
pattern = None
for line in chart_text.splitlines():
    match = re.match(r'L(\d+)@P0: (.*)', line)
    if not match: continue
    line_number, text = int(match[1]), match[2]
    if re.fullmatch(r'(5|8|10|12|15)-(60|Q|T|150|H|210|TT|TQ|F)',text):
        pattern = text
    elif re.fullmatch(r'4X(9|15|18|30)',text):
        pattern = text
    elif text in ['SST','LCS','RCS'] and pattern and '-' not in pattern:
        pattern += '-' + text
    match = re.fullmatch(r'(20|30|40|50) ([\d.]+) ([\d.x]+) ([\d.]+) ([\d.]+)',text)
    if not match: continue
    assert pattern, line
    pressure, flow, radius, square, triangle = match.groups()
    source = dict(modelPattern=pattern,pressurePsi=int(pressure),flowGpm=float(flow),precipSquareInH=float(square),precipTriangleInH=float(triangle),sourcePage=1,sourceLine=line_number,sourceUrl=CHART)
    if 'x' in radius:
        source.update(zip(['widthFt','lengthFt'],map(float,radius.split('x'))))
    else:
        source.update(radiusFt=float(radius),arcDeg=arc_map[pattern.split('-')[1]])
    sources.append(source)
assert len(sources)==204, len(sources)
assert len({(r['modelPattern'],r['pressurePsi']) for r in sources})==204

def converted(value, factor):
    return float((Decimal(str(value))*Decimal(factor)).quantize(Decimal('.000001'),rounding=ROUND_HALF_UP))
def compare(actual, expected):
    return {key:{'actual':actual.get(key),'expected':value} for key,value in expected.items() if actual.get(key)!=value}
def write(name, data):
    (HERE/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

checks, coverage, patches, colors = [], [], [], []
for model in models:
    base = re.sub(r'T(?=-)', '', model['modelId'][3:])
    rows = [r for r in sources if r['modelPattern']==base]
    assert len(rows)==4,base
    assert len(model['nozzles'])==1
    nozzle=model['nozzles'][0]
    assert len(nozzle['performance'])==4
    strip = base.startswith('4X')
    for index,(source,row) in enumerate(zip(rows,nozzle['performance'])):
        expected = dict(pressureBar=converted(source['pressurePsi'],'.0689475729316836'),pressureKPa=converted(source['pressurePsi'],'6.89475729316836'),flowLMin=converted(source['flowGpm'],'3.785411784'),flowM3H=converted(source['flowGpm'],'.22712470704'),precipSquareMmH=converted(source['precipSquareInH'],'25.4'),precipTriangleMmH=converted(source['precipTriangleInH'],'25.4'),arcDeg=180 if strip else source['arcDeg'])
        expected['radiusM']=converted(source['lengthFt']/(2 if base.endswith('SST') else 1) if strip else source['radiusFt'],'.3048')
        differences=compare(row,expected)
        footprint=None
        if strip:
            footprint=dict(pressureBar=expected['pressureBar'],w=converted(source['widthFt'],'.3048'),l=converted(source['lengthFt'],'.3048'))
            for key,value in compare(model['stripPerformance'][index],footprint).items(): differences['stripPerformance.'+key]=value
        checks.append(dict(id=model['id'],nozzleId=nozzle['id'],rowIndex=index,source=source,expectedSI=expected,expectedFootprint=footprint,pass_=not differences,differences=differences))
    expected_color='Grey' if strip else {'5':'Red','8':'Green','10':'Blue','12':'Brown','15':'Black'}[base.split('-')[0]]
    trajectory=20 if strip else {'5':5,'8':10,'10':15,'12':20,'15':27}[base.split('-')[0]]
    performance=nozzle['performance']
    expected_model=dict(arcMin=180 if strip else rows[0]['arcDeg'],arcMax=180 if strip else rows[0]['arcDeg'],nozzleThread='male' if re.search(r'T-',model['modelId']) else 'female',recommendedPressureBar=converted(30,'.0689475729316836'),recommendedPressureMin=converted(20,'.0689475729316836'),recommendedPressureMax=converted(50,'.0689475729316836'),operatingPressureMinBar=converted(20,'.0689475729316836'),operatingPressureMaxBar=converted(75,'.0689475729316836'),rMin=min(r['radiusM'] for r in performance),rMax=max(r['radiusM'] for r in performance),rNom=performance[1]['radiusM'],precipMmHr=performance[1]['precipSquareMmH'],coverageKind='strip' if strip else 'sector',precipBasis='strip' if strip else 'square',colorName=expected_color)
    differences=compare(model,expected_model)
    nozzle_differences=compare(nozzle,dict(colorName=expected_color,trajectoryDeg=trajectory))
    model_listed=bool(re.search(r'(?<![\w-])'+re.escape(model['modelId'])+r'(?![\w-])',sheet_text))
    assert model_listed,model['id']
    colors.append(dict(id=model['id'],nozzleId=nozzle['id'],colorName=expected_color,currentHex=model['color'],hexStatus='Display approximation; manufacturer names colors but does not specify hexadecimal values.',sourceUrl=SHEET,sourcePage=3,verifiedOn=DATE,pass_=not nozzle_differences and model['colorName']==expected_color))
    coverage.append(dict(id=model['id'],modelId=model['modelId'],modelListedInCurrentSheet=model_listed,currentStatus=model['verificationStatus'],rowsChecked=4,rowPass=all(not c['differences'] for c in checks[-4:]),expectedFields=expected_model,fieldDifferences=differences,nozzleFieldDifferences=nozzle_differences,threadSourcePage=4,colorSourcePage=3,sourceUrls=[CHART,SHEET],radiusAdjustmentDecision='Keep source footprint; no generic strip shrink transform verified.' if strip else 'Recommend 25% geometric reduction from Toro Australia PSN+ specification; retain unknown reduced-radius flow.',radiusAdjustmentSourceUrl=AU if not strip else None,limitations=['Rectangle origin follows prior 2026-10-06 visual audit; current tool text rechecks width/length and named pattern, not fresh pixel coordinates.'] if strip else []))
    fields={'verifiedOn':DATE,'colorVerifiedOn':DATE}
    if not strip:
        fields['radiusAdjustment']={'minimumRatio':.75,'flowPolicy':'unknown'}
        note=model.get('dataNote','')
        note=note.replace('No current PSN+ reduction-flow law verified; do not transfer O-model rule.','').strip()
        fields['dataNote']=note+' Toro Australia PSN+ specification (checked 2026-10-10) permits maximum 25% radius reduction. Reduced-radius discharge is unpublished; do not transfer the legacy O-model matched-precipitation reduction law. Regional webpage pressure/PCD descriptions are not used to replace the current US measured table. Reduction source: '+AU
    patches.append(dict(id=model['id'],set=fields,nozzlePatches=[{'id':nozzle['id'],'set':{'colorVerifiedOn':DATE}}],reason='Fresh current chart and model/color table recheck.' if strip else 'Fresh source recheck plus documented PSN+ mechanical radius reduction; hydraulics at reduced radius remain unknown.',sourceUrls=[CHART,SHEET]+([] if strip else [AU])))

summary=dict(verifiedOn=DATE,status='final',models=len(models),circularModels=sum(not m.get('strip') for m in models),stripModels=sum(bool(m.get('strip')) for m in models),uniquePatterns=51,uniqueSourceRows=len(sources),catalogRows=len(checks),rowsMatched=sum(c['pass_'] for c in checks),rowMismatches=sum(not c['pass_'] for c in checks),modelFieldMismatches=sum(bool(c['fieldDifferences'] or c['nozzleFieldDifferences']) for c in coverage),freshModelIdentitiesVerified=sum(c['modelListedInCurrentSheet'] for c in coverage),colorNamesVerified=len(colors),numericPatches=0,radiusPolicyPatches=90,unresolvedFullRadiusModels=[],limitations=['No reduced-radius flow curve or preserved-precipitation law for PSN+ verified.','No strip-reduction transform or exact square/triangle strip-spacing footnote published in current chart.','PSN15-F/T-F retain selected current 20–50 psi grid; conflicting older PSN+ table is not merged.','Australian webpage pressure-compensation/range claims conflict with its linked brochure; neither alters US hydraulic data.','Fresh current PDF pixel origin inspection unavailable via the returned screenshot payload; existing strip origin evidence remains dated 2026-10-06.'])
assert summary['rowMismatches']==0, [c for c in checks if c['differences']][:2]
assert summary['modelFieldMismatches']==0, [c for c in coverage if c['fieldDifferences'] or c['nozzleFieldDifferences']][:2]
write('psn-source-rows.json',sources)
write('psn-row-checks.json',dict(verifiedOn=DATE,checkedRows=len(checks),matched=summary['rowsMatched'],mismatches=summary['rowMismatches'],checks=checks))
write('psn-model-coverage.json',coverage)
write('psn-color-evidence.json',colors)
write('psn-proposed-patches.json',dict(verifiedOn=DATE,status='final',performancePatches=[],modelPatches=patches,behaviorRecommendations=[{'id':'psn-radius-bound','models':'all 90 circular PSN models','recommendation':'Use same-pressure published radius times minimumRatio (.75) as lower geometric bound; the nominal item rMin is a native-table minimum, not a screw-stop floor. Reduced flow stays unknown.'},{'id':'psn-strips','models':'all 12 PSN strip models','recommendation':'Keep manual rectangular placement and pressure-specific width/length; never treat schema arcDeg=180 as a sector or inferred rotor.'}]))
write('psn-summary.json',summary)
print(json.dumps(summary,indent=2))
