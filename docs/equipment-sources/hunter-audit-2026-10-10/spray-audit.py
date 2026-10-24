"""Reproduce the row audit from freshly retrieved official Hunter US tables.
No network access. Does not modify the application catalog.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
CATALOG = json.loads((ROOT / 'src/data/hunter-catalog.json').read_text())
ITEMS = {i['id']: i for i in CATALOG if i['family'] in {'spray','he','fixed','short','prostrip','bubbler','stream'}}
GALLON = 3.785411784

def records(name):
    content = (OUT / f'spray-source-{name}.txt').read_text()
    chunks = re.split(r'\bL(\d+):', content)
    for n in range(1, len(chunks), 2):
        yield int(chunks[n]), re.sub(r'cite.*?', '', chunks[n+1]).strip()

def row(model, arc, psi, feet, gpm, square=None, triangle=None, **extra):
    return {'modelId':model,'arcDeg':arc,'pressurePsi':psi,'radiusFt':feet,'flowGpm':gpm,
            'precipSquareInHr':square,'precipTriangleInHr':triangle,**extra}

source_rows=[]
for family in ['he','adjustable','fixed','short','strip']:
    model=None; arc=None; size=None; suffix=None
    for line,text in records(family+'-us'):
        cols=[s.strip() for s in text.split('|')]
        if family=='he':
            m=re.match(r'### (\d+A-HE)',text)
            if m:model=m[1]
        if family=='fixed':
            m=re.match(r'### Nozzle (\d+)\b',text)
            if m:size=m[1]
        m=re.match(r'^(\d+)°',text)
        if m:
            arc=int(m[1]); cols=cols[1:]
            if family=='fixed':
                suffix=cols.pop(0);model=size+suffix
        if family=='short' and len(cols)>1 and re.fullmatch(r'\d+[QH]',cols[1]):
            model=cols.pop(1)
        if family=='strip':
            m=re.match(r'^([A-Z]+-\d+)\b',text)
            if m:model=m[1];cols=cols[1:];arc=180
        if not cols or not re.fullmatch(r'\d+',cols[0]):continue
        if family in {'he','fixed'}:
            if len(cols)!=5 or not model:continue
            psi,feet,gpm,sq,tri=map(float,cols)
            source_rows.append(row(model,arc,psi,feet,gpm,sq,tri,sourceFamily=family,sourceLine=line))
        elif family=='adjustable':
            if len(cols)!=9:continue
            values=list(map(float,cols));psi=values[0]
            for offset,mid in [(1,'4A'),(5,'6A')]:
                feet,gpm,sq,tri=values[offset:offset+4]
                source_rows.append(row(mid,arc,psi,feet,gpm,sq,tri,sourceFamily=family,sourceLine=line))
        elif family=='short':
            if len(cols)!=5 or not model:continue
            psi,feet,gpm,gph,single=map(float,cols)
            source_rows.append(row(model,arc,psi,feet,gpm,sourceFamily=family,sourceLine=line,precipNoOverlapInHr=single,gph=gph))
        elif family=='strip':
            if len(cols)!=3 or not model:continue
            sizevals=re.findall(r'[\d.]+',cols[1])
            if len(sizevals)!=2:continue
            width,length=map(float,sizevals)
            source_rows.append(row(model,arc,float(cols[0]),length,float(cols[2]),sourceFamily=family,sourceLine=line,widthFt=width,lengthFt=length))

# Published pressure-compensated model values apply across the range, rather
# than being three separate laboratory measurements at the app's three nodes.
bubbler_values={
 'MSBN-25V':(.25,1.5,50),'MSBN-50V':(.5,2.5,50),
 'MSBN-25Q':(.25,1,90),'MSBN-50Q':(.5,1.5,90),
 'MSBN-50H':(.5,1,180),'MSBN-10H':(1,1.5,180),
 'MSBN-10F':(1,1,360),'MSBN-20F':(2,1.5,360),
}
for prefix in ['PCN','PCB']:
 for suffix,gpm in [('25',.25),('50',.5),('10',1),('20',2)]:
  bubbler_values[f'{prefix}-{suffix}']=(gpm,0,360)
  if prefix=='PCB':bubbler_values[f'{prefix}-{suffix}-R']=(gpm,0,360)
for mid,(gpm,feet,arc) in bubbler_values.items():
 for bar,psi in [(1.0,15),(2.1,30),(4.8,70)]:
  source_rows.append(row(mid,arc,psi,feet,gpm,pressureBar=bar,sourceFamily='bubbler',rangeStatement=True,
    sourceLine=231 if mid.startswith('MSBN') else 248))
for line,text in records('bubbler-us'):
 if not 272<=line<=276:continue
 cols=[s.strip() for s in text.split('|') if s.strip()]
 if len(cols)!=3:continue
 psi,feet,gpm=map(float,cols)
 source_rows.append(row('5-CST-B',360,psi,feet,gpm,sourceFamily='bubbler',sourceLine=line))

index={}
for r in source_rows:
 bar=r.get('pressureBar',round(r['pressurePsi']*.0689475729,1))
 index[(r['modelId'],r['arcDeg'],bar)]=r
checks=[]
for item in ITEMS.values():
 if item.get('discontinued'):continue
 for nozzle in item['nozzles']:
  for n,existing in enumerate(nozzle['performance']):
   src=index.get((item['id'],existing['arcDeg'],existing['pressureBar']))
   result={'modelId':item['id'],'nozzleId':nozzle['id'],'rowIndex':n,'existing':existing,'source':src,'differences':[]}
   if src:
    expected={'radiusM':src['radiusFt']*.3048,'flowLMin':src['flowGpm']*GALLON,'flowM3H':src['flowGpm']*GALLON*.06}
    if src['precipSquareInHr'] is not None:expected['precipSquareMmH']=src['precipSquareInHr']*25.4
    if src['precipTriangleInHr'] is not None:expected['precipTriangleMmH']=src['precipTriangleInHr']*25.4
    if 'precipNoOverlapInHr' in src:expected['precipSquareMmH']=src['precipNoOverlapInHr']*25.4
    for field,value in expected.items():
     if existing.get(field) is None or abs(existing[field]-value)>1e-6:
      result['differences'].append({'field':field,'existing':existing.get(field),'sourceConverted':value})
    result['status']='source-match' if not result['differences'] else 'source-mismatch'
   else:result['status']='source-row-unmatched'
   checks.append(result)

(OUT/'spray-row-checks.json').write_text(json.dumps({'verifiedOn':'2026-10-10','basis':'Current official US tables, converted to canonical SI; pressure rounded to 0.1 bar as in existing catalog. Distinct metric grids must not be spliced into these rows. Source-match describes transcription and is not an assertion that internal manufacturer anomalies are resolved.','sourceRows':source_rows,'checks':checks},ensure_ascii=False,indent=2)+'\n')
print('Source rows:',len(source_rows),'Catalog rows:',len(checks))
for status in ['source-match','source-mismatch','source-row-unmatched']:
 print(status,sum(c['status']==status for c in checks))
for c in checks:
 if c['status']!='source-match':print(c['modelId'],c['rowIndex'],c['status'],c['differences'])

pdf=(OUT/'spray-source-he-us-pdf.txt').read_text()
pdf_rows=[];mid=None;counts={}
for match in re.finditer(r'L(\d+)@P(\d+): ([^\n]*)',pdf):
 line,page,text=match.groups()
 if re.fullmatch(r'(8|10|12|15|17)A-HE',text):mid=text
 elif mid and re.fullmatch(r'\d+ (?:\d+\.\d+ ){2}\d+\.\d+',text):
  n=counts.get(mid,0); counts[mid]=n+1
  feet,gpm,sq,tri=map(float,text.split())
  pdf_rows.append(row(mid,[90,180,270,360][n//5],[20,25,30,35,40][n%5],feet,gpm,sq,tri,sourcePage=int(page)+1,sourceLine=int(line)))
assert len(pdf_rows)==100,(len(pdf_rows),counts)
patches=[]
for r in pdf_rows:
 n=[90,180,270,360].index(r['arcDeg'])*5+[20,25,30,35,40].index(r['pressurePsi'])
 existing=ITEMS[r['modelId']]['nozzles'][0]['performance'][n]
 expected={'radiusM':r['radiusFt']*.3048,'flowLMin':r['flowGpm']*GALLON,'flowM3H':r['flowGpm']*GALLON*.06,'precipSquareMmH':r['precipSquareInHr']*25.4,'precipTriangleMmH':r['precipTriangleInHr']*25.4}
 changed={k:round(v,9) for k,v in expected.items() if existing[k] is None or abs(existing[k]-v)>1e-6}
 if changed:
  patches.append({'modelId':r['modelId'],'nozzleId':r['modelId'],'rowIndex':n,'match':{'arcDeg':r['arcDeg'],'pressureBar':existing['pressureBar']},'set':changed,'before':{k:existing[k]for k in changed},'source':r,'sourceUrl':'https://www.hunterirrigation.com/sites/default/files/2025-05/RC-198-ProHE-SS-US-Web.pdf','reason':'Current product-page-linked US cut sheet corroborates the same US pressure/radius grid but corrects product-page HTML cells; retain one coherent customary-unit grid converted to SI.'})
(OUT/'spray-he-pdf-crosscheck.json').write_text(json.dumps({'sourceRows':pdf_rows,'patches':patches},ensure_ascii=False,indent=2)+'\n')
(OUT/'spray-current-catalog-differences.json').write_text(json.dumps({'status':'current-catalog-comparison','verifiedOn':'2026-10-10','performancePatches':patches,'modelPatches':[],'note':'Does not overwrite final spray-proposed-patches.json or captured spray-model-coverage.json.'},ensure_ascii=False,indent=2)+'\n')
print('HE current US PDF crosscheck:100 rows;',len(patches),'row corrections')
for patch in patches:print(patch['modelId'],patch['rowIndex'],patch['set'])
