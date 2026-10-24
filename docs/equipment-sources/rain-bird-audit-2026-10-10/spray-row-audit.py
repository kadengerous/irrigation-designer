"""Offline comparison of captured Rain Bird catalog against fresh official PDF text."""
import json, re
from pathlib import Path
OUT=Path(__file__).resolve().parent
CAT=json.loads((OUT/'spray-baseline-catalog.json').read_text())
PSI=0.0689475729317831
GAL=3.785411784
def lines(name):
    return [(int(m[1]),int(m[2].split('-')[0])+1,m[3].strip()) for m in re.finditer(r'L(\d+)@P(\d+(?:-\d+)?):([^\n]*)',(OUT/f'spray-source-{name}.txt').read_text())]
ROWS=[]
def add(mid,arc,p,r,q,sq=None,tri=None,units='metric',line=None,page=None,**extras):
    ROWS.append(dict(modelId=mid,arcDeg=arc,sourcePressure=p,sourceRadius=r,sourceFlow=q,sourceSquare=sq,sourceTriangle=tri,units=units,sourceLine=line,sourcePage=page,**extras))
# HE/VAN tables contain separate metric and US blocks, each with exactly sixteen rows.
for name,blocks in [('he',[(9,24,'HE-VAN-8','US'),(29,44,'HE-VAN-10','US'),(58,73,'HE-VAN-8','metric'),(78,93,'HE-VAN-10','metric'),(101,116,'HE-VAN-12','US'),(122,137,'HE-VAN-12','metric'),(152,167,'HE-VAN-15','US'),(173,188,'HE-VAN-15','metric')]),('van',[(61,76,'4-VAN','US'),(92,107,'4-VAN','metric'),(150,165,'6-VAN','US'),(178,193,'8-VAN','US'),(209,224,'6-VAN','metric'),(240,255,'8-VAN','metric'),(289,304,'10-VAN','US'),(317,332,'12-VAN','US'),(348,363,'10-VAN','metric'),(379,394,'12-VAN','metric'),(425,440,'15-VAN','US'),(453,468,'18-VAN','US'),(484,499,'15-VAN','metric'),(515,530,'18-VAN','metric')])]:
    for lo,hi,mid,units in blocks:
        arc=None
        for n,page,t in lines(name):
            if not lo<=n<=hi:continue
            a=re.match(r'(\d+)°\s+Arc\s+',t)
            if a:arc=int(a[1]);t=t[a.end():]
            vals=[float(v) for v in re.findall(r'\d+(?:\.\d+)?',t)]
            vals=vals[:5 if units=='US' else 6]
            if units=='US':p,r,q,sq,tri=vals;extra={}
            else:p,r,m3,q,sq,tri=vals;extra={'sourceM3H':m3}
            add(mid,arc,p,r,q,sq,tri,units,n,page,sourceFamily=name,**extra)
# Fixed, stream and strip tables repeat a model label at the first pressure.
for name in ['u','mpr']:
    mid=None
    for n,page,t in lines(name):
        m=re.match(r'((?:U-?|)\d+(?:F|H|Q)(?:-FLT|-B)?|5CST-B|15EST|15CST|15RCS|15LCS|15SST|9SST)\s+(?=\d)',t)
        if m:mid=m[1];t=t[m.end():];mid=re.sub(r'^U(\d)',r'U-\1',mid)
        if not mid:continue
        if not re.match(r'^\d+(?:\.\d+)?\s',t):continue
        vals=[float(v)for v in re.findall(r'\d+(?:\.\d+)?',t)]
        units='US' if vals[0]>5 else 'metric'
        arc=180 if mid in ['15EST','15CST','15RCS','15LCS','15SST','9SST','5CST-B'] else 360 if re.search(r'F(?:-|$)',mid) else 180 if re.search(r'H(?:-|$)',mid) else 90
        if 'x' in t:
            if len(vals)!=(4 if units=='US' else 5):continue
            p,w,l=vals[:3];q=vals[-1]
            add(mid,arc,p,l,q,units=units,line=n,page=page,sourceFamily=name,sourceWidth=w,sourceLength=l,**({'sourceM3H':vals[3]}if units=='metric' else {}))
        elif len(vals)==(3 if units=='US' else 4) and mid.endswith('-B'):
            add(mid,arc,vals[0],vals[1],vals[-1],units=units,line=n,page=page,sourceFamily=name,**({'sourceM3H':vals[2]}if units=='metric' else {}))
        elif len(vals)==(5 if units=='US' else 6):
            add(mid,arc,vals[0],vals[1],vals[-3],vals[-2],vals[-1],units,n,page,sourceFamily=name,**({'sourceM3H':vals[2]}if units=='metric' else {}))
# SQ: each nominal setting has four pressure rows for four patterns.
for lo,hi,setting,units in [(93,108,.8,'US'),(115,130,.8,'metric'),(137,152,1.2,'metric'),(159,174,1.2,'US')]:
    mid=None
    for n,page,t in lines('sq'):
        if not lo<=n<=hi:continue
        m=re.match(r'(QTR|HALF|H|3QTR|FUL)\s+',t)
        if m:mid='SQ-'+({'HALF':'HLF','H':'HLF'}.get(m[1],m[1]));t=t[m.end():]
        p,r,flowh,flowm,precip=map(float,t.split())
        add(mid,{'SQ-QTR':90,'SQ-HLF':180,'SQ-3QTR':270,'SQ-FUL':360}[mid],p,r,flowm,units=units,line=n,page=page,sourceFamily='sq',sourceHourlyFlow=flowh,sourceNoOverlap=precip,throwSettingM=setting)
# The existing 1300A-F selection is the complete official US grid.
for n,page,t in lines('bubbler'):
    if 43<=n<=48:
        vals=[float(v)for v in re.findall(r'\d+(?:\.\d+)?',t)]
        add('1300A-F',0,vals[0],0,vals[1],units='US',line=n,page=page,sourceFamily='bubbler')

checks=[]
for item in CAT:
    for nozzle in item['nozzles']:
        for idx,existing in enumerate(nozzle['performance']):
            mid=item['modelId'];isus='sourcePressurePsi'in existing or existing.get('sourceUnits')=='US'
            units='US'if isus else 'metric'
            candidates=[r for r in ROWS if r['modelId']==mid and r['arcDeg']==existing['arcDeg'] and r['units']==units and (r.get('throwSettingM')==existing.get('throwSettingM'))]
            src=next((r for r in candidates if abs(r['sourcePressure']*(PSI if isus else 1)-existing['pressureBar'])<1e-7),None)
            result={'modelId':mid,'nozzleId':nozzle['id'],'rowIndex':idx,'existing':existing,'source':src,'differences':[]}
            if src:
                flow=src['sourceHourlyFlow']*GAL/60 if mid in ['SQ-3QTR','SQ-HLF']and isus else src['sourceFlow']*(GAL if isus else 1)
                expected={'radiusM':src['sourceRadius']*(.3048 if isus else 1),'flowLMin':flow,'flowM3H':flow*.06}
                if 'sourceWidth'in src:expected.pop('radiusM');expected.update(widthM=src['sourceWidth']*(.3048 if isus else 1),lengthM=src['sourceLength']*(.3048 if isus else 1))
                for k,sk in [('precipSquareMmH','sourceSquare'),('precipTriangleMmH','sourceTriangle'),('precipNoOverlapMmH','sourceNoOverlap')]:
                    if src.get(sk)is not None and not(mid=='SQ-HLF'and isus):expected[k]=src[sk]*(25.4 if isus else 1)
                result['expectedSI']=expected
                for k,v in expected.items():
                    if existing.get(k)is None or abs(existing[k]-v)>1e-6:result['differences'].append({'field':k,'existing':existing.get(k),'sourceConverted':v})
                result['status']='matched'if not result['differences']else'different'
            else:result['status']='unmatched'
            checks.append(result)
(OUT/'spray-row-checks.json').write_text(json.dumps({'verifiedOn':'2026-10-10','scope':'58 active models plus deprecated1408;370 stored rows','freshSourceRows':ROWS,'checks':checks},indent=2)+'\n')
print('Source tuples',len(ROWS),'catalog rows',len(checks))
for status in ['matched','different','unmatched']:print(status,sum(r['status']==status for r in checks))
for r in checks:
    if r['status']!='matched':print(r['modelId'],r['rowIndex'],r['status'],r['differences'])
