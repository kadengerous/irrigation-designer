"""Compare every active K-Rain nozzle row with fresh native-web official table text.

No network. Source raw numbers are parsed independently from the live PDF extract.
Only the audit output files in this directory are written.
"""
import json, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
source = json.loads((OUT / 'nozzle-source-table-extract.json').read_text())
catalog = json.loads((ROOT / 'src/data/equipment/k-rain.json').read_text())
models = [m for m in catalog if m['type'] == 'nozzle']
assert len(models) == 58
lines = source['lines']
num = r'(?:\d+(?:[.,]\d+)?|[.,]\d+)'
table_ids = r'(?:FN-?(?:8|10|12|15)|P(?:12|15))(?:TQ|Q|H|F)'
rows = {}
us = {}

def parse_table(start, end, model, metric, count):
    segment = [x for x in lines if start <= x['line'] <= end]
    text = ' '.join(x['text'] for x in segment)
    text = re.sub(table_ids, '', text)
    parts = re.split(r'(90|180|210|270|360)[°º]', text)
    for j in range(1, len(parts), 2):
        arc = int(parts[j])
        values = [float(s.replace(',', '.')) for s in re.findall(num, parts[j+1])]
        assert len(values) >= 5*count, (model,start,arc,values)
        for k in range(count):
            pressure,radius,flow,square,triangle = values[k*5:k*5+5]
            ident = model
            if model.startswith(('FN-', 'P12', 'P15')):
                ident += {90:'Q',180:'H',270:'TQ',360:'F'}[arc]
            row = dict(pressureBar=pressure,radiusM=radius,flowLMin=flow,precipSquareMmH=square,precipTriangleMmH=triangle,arcDeg=arc)
            evidence = {'source':source['url'],'page':int(segment[0]['pdfPage'].split('-')[0])+1,'lineStart':start,'lineEnd':end}
            if metric:
                rows[(ident, arc, pressure)] = {'published':row,'evidence':evidence}
            else:
                us[(ident,arc,k)] = {'pressurePsi':pressure,'radiusFt':radius,'flowGpm':flow,'precipSquareInH':square,'precipTriangleInH':triangle,'evidence':evidence}

# Locate each table from independent source headings, never from catalog values.
starts = [i for i,x in enumerate(lines) if x['text'].startswith('Performance Data - ')]
for pos, i in enumerate(starts):
    block = lines[i:starts[pos+1] if pos+1<len(starts) else len(lines)]
    start = block[0]['line']; end = block[-1]['line']
    metric = 'Metric' in block[0]['text']
    header = ' '.join(x['text'] for x in block[1:5])
    model_match = re.search(r'\b(RN[123]00-(?:ADJ-\d+-\d+|FIX360)|KVF?\d+|FN-(?:8|10|12|15)|P(?:12|15))\b',header)
    if 2504 <= start <= 2564:
        model = 'RN'+str(100 if start<2528 else 200 if start<2552 else 300)+'-ADJ'
        count = 3
        end = min(end,2575)
    elif model_match:
        model = model_match.group(1)
        count = 5 if model.startswith('RN') else 4 if model.startswith(('KV','P')) else 3
    else:
        continue
    parse_table(start,end,model,metric,count)

# Strip tables provide dimensions rather than a radial/sector coverage model.
strip_ranges = {'RNS-RES-515':(2435,2439), 'RNS-SS-530':(2447,2451), 'RNS-LES-515':(2460,2464)}
for model,(start,end) in strip_ranges.items():
    for x in lines:
        if start<=x['line']<=end:
            pressure,w,l,flow=[float(s.replace(',','.')) for s in re.findall(num,x['text'])[:4]]
            rows[(model,180,pressure)]={'published':dict(pressureBar=pressure,radiusM=l,flowLMin=flow,precipSquareMmH=None,precipTriangleMmH=None,arcDeg=180),'strip':dict(w=w,l=l),'evidence':dict(source=source['url'],page=40,lineStart=x['line'],lineEnd=x['line'])}

specials = {'CS': [(3365,1.5,1.2,7.3,3.0),(3366,2.0,1.2,9.1,3.8)],'ES':[(3367,1.5,1.2,3.7,1.5),(3368,2.0,1.2,4.6,1.9)],'SS':[(3369,1.5,1.2,8.5,4.2),(3370,2.0,1.5,9.8,4.9)]}
for suffix, vals in specials.items():
    for prefix in ['P15','FN-15']:
        for line,p,w,l,q in vals:
            raw = next(x['text'] for x in lines if x['line']==line)
            # Verify literal four-number tail (the final label may include digits).
            assert [float(s.replace(',','.')) for s in re.findall(num,raw)[-4:]] == [p,w,l,q]
            rows[(prefix+suffix,180,p)]={'published':dict(pressureBar=p,radiusM=l,flowLMin=q,precipSquareMmH=None,precipTriangleMmH=None,arcDeg=180),'strip':dict(w=w,l=l),'evidence':dict(source=source['url'],page=49,lineStart=line,lineEnd=line)}
for model in ['P15HL','FN-15HL']:
    for line,p,high,length,flow,low in [(3371,1.5,4.3,8.5,9.5,1.2),(3373,2,4.6,9.8,11.4,1.5)]:
        rows[(model,180,p)]={'published':dict(pressureBar=p,radiusM=high,flowLMin=flow,precipSquareMmH=None,precipTriangleMmH=None,arcDeg=180),'specialPattern':dict(lowWidthM=low,lengthM=length,highRadiusM=high),'evidence':dict(source=source['url'],page=49,lineStart=line,lineEnd=line),'footprintNote':'Dimensions are published; the upper curved boundary is not defined mathematically. Low width at2bar is in the linked fixed-nozzle brochure p2.'}

# Explicit field selections from independent companion rows, corroborated by
# current US rows. Do not use a wholesale US-table replacement.
fixed_companion = source['companionFixed']
for base,first in [('Q',94),('H',97),('TQ',100),('F',103)]:
    for j,p in enumerate([1.4,1.7,2.1]):
        x=next(x for x in fixed_companion['lines'] if x['line']==first+j)
        s=re.sub(r'FN12(?:TQ|Q|H|F)','',x['text'])
        s=re.sub(r'\d+°','',s)
        vals=[float(v.replace(',','.')) for v in re.findall(num,s)]
        row=rows[('FN-12'+base,{'Q':90,'H':180,'TQ':270,'F':360}[base],p)]
        row['selected']=dict(row['published'],flowLMin=vals[5])
        row['resolution']={'field':'flowLMin','selectedSource':fixed_companion['url'],'page':2,'line':first+j,'reason':'Published companion metric flow corroborates current US GPM; current metric column conflicts.'}
        assert abs(vals[5] - us[('FN-12'+base,row['published']['arcDeg'],j)]['flowGpm']*3.785411784)<.07
row=rows[('RN300-ADJ',360,3.5)]
row['selected']=dict(row['published'],radiusM=8.53)
row['resolution']={'field':'radiusM','selectedSource':source['companionFullyAdjustable']['url'],'page':2,'line':92,'reason':'Companion metric8.53m corroborates current28ft. Current8.83m is not used.'}
assert '28 8.53 3.80 14.38' in next(x['text'] for x in source['companionFullyAdjustable']['lines'] if x['line']==92)
row=rows[('KVF6',90,1.72)]
row['selected']=dict(row['published'],precipSquareMmH=None)
row['resolution']={'field':'precipSquareMmH','reason':'Current square156mm/h conflicts with triangle194mm/h under rounding; US6.16/7.65 repeats the mismatch. Retain null, not an invented replacement.'}

checks=[]; models_out=[]
fields=['pressureBar','radiusM','flowLMin','precipSquareMmH','precipTriangleMmH','arcDeg']
for m in models:
    model_checks=[]
    for n in m['nozzles']:
        arc_indices={}
        for ri,r in enumerate(n['performance']):
            key=(m['modelId'],r['arcDeg'],r['pressureBar'])
            assert key in rows, key
            evidence=rows[key]
            selected=evidence.get('selected',evidence['published'])
            differences=[{'field':f,'catalog':r.get(f),'sourceSelected':selected.get(f)} for f in fields if r.get(f)!=selected.get(f)]
            if 'strip' in evidence:
                strip=next(x for x in m['stripPerformance'] if x['pressureBar']==r['pressureBar'])
                differences += [{'field':'stripPerformance.'+f,'catalog':strip[f],'sourceSelected':evidence['strip'][f]} for f in ['w','l'] if strip[f]!=evidence['strip'][f]]
            assert abs(r['flowM3H']-r['flowLMin']*.06)<1e-8, key
            assert abs(r['pressureKPa']-r['pressureBar']*100)<1e-8, key
            check={'modelId':m['modelId'],'nozzleId':n['id'],'rowIndex':ri,**evidence,'catalog':r,'selectedFieldsMatch':not differences,'differences':differences,'hydraulicStatus':r.get('verificationStatus',m.get('hydraulicVerificationStatus',m['verificationStatus']))}
            ai=arc_indices.get(r['arcDeg'],0)
            arc_indices[r['arcDeg']]=ai+1
            paired=us.get((m['modelId'],r['arcDeg'],ai))
            if paired:check['pairedCurrentUs']=paired
            checks.append(check); model_checks.append(check)
    arc_uniform=[]
    for p in sorted({r['pressureBar'] for n in m['nozzles'] for r in n['performance']}):
        arc_rows=[r for n in m['nozzles'] for r in n['performance'] if r['pressureBar']==p]
        if len({r['radiusM'] for r in arc_rows})==1: arc_uniform.append(p)
    models_out.append({'id':m['id'],'modelId':m['modelId'],'series':m['series'],'rows':len(model_checks),'allSelectedSourceFieldsMatch':all(x['selectedFieldsMatch'] for x in model_checks),'currentStatus':m['verificationStatus'],'currentHydraulicStatus':m.get('hydraulicVerificationStatus'),'disputedRows':[x['rowIndex'] for x in model_checks if x['hydraulicStatus']=='Needs Review'],'arcMin':m['arcMin'],'arcMax':m['arcMax'],'pressureMinBar':m['recommendedPressureMin'],'pressureMaxBar':m['recommendedPressureMax'],'recommendedPressureBar':m['recommendedPressureBar'],'radiusAdjustment':m.get('radiusAdjustment'),'radiusReductionRule':m.get('radiusReductionRule'),'colorName':m['colorName'],'colorHexIllustrative':m['color'],'colorSourceUrl':m.get('colorSourceUrl'),'nozzleThread':m['nozzleThread'],'coverageKind':m['coverageKind'],'specialPatternKind':m.get('specialPatternKind'),'placementSupported':m.get('placementSupported',True),'allPublishedArcsEqualRadiusAtPressureBar':arc_uniform,'sourceUrl':source['url'],'sourcePage':m['rawSourcePage']})
assert len(checks)==404,len(checks)
summary={'checkedOn':'2026-10-10','models':len(models),'rows':len(checks),'familyCounts':dict(Counter(m['series'] for m in models)),'rowCounts':dict(Counter(x['modelId'] for x in checks)),'sourceSelectedMismatchCount':sum(not x['selectedFieldsMatch'] for x in checks),'disputedHydraulicRows':sum(x['hydraulicStatus']=='Needs Review' for x in checks),'modelStatusCounts':dict(Counter(m['verificationStatus'] for m in models))}
(OUT/'nozzle-row-checks.json').write_text(json.dumps({'summary':summary,'checks':checks},ensure_ascii=False,indent=2)+'\n')
(OUT/'nozzle-model-coverage.json').write_text(json.dumps(models_out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,indent=2))
for x in checks:
    if x['differences']:print(x['modelId'],x['rowIndex'],x['differences'])
