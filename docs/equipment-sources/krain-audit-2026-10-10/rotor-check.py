import json,pathlib,re,collections,math
B=pathlib.Path(__file__).parent
URL='https://www.krain.com/content/files/images/landingpages/catalogs/2026%20product%20catalog%20english.pdf'
def save(name,obj):(B/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
lines={};pages={}
for f in B.glob('rotor-source-catalog-*.txt'):
 for n,p,s in re.findall(r'^L(\d+)@P([\d-]+): (.*)$',f.read_text(),re.M):
  lines[int(n)]=s;pages[int(n)]=int(p.split('-')[0])+1
assert all(n in lines for n in range(0,1582))
# Native PDF text sometimes concatenates adjacent columns. These are separator repairs,
# not changes to manufacturer numbers. Their raw original line is retained with every row.
repairs={207:'#1.0 2,1 7,9 3,4 7 8',208:'2,8 8,2 4,5 8 9',209:'3,4 8,2 4,9 9 10',963:'2,4 10,4 5,3 6 7',964:'2,8 10,4 5,7 5 6',965:'3,1 11,3 6,1 6 7',966:'3,4 11,3 6,8 6 7',967:'#2.0 2,1 11,3 9,8 9 11',968:'2,4 11,6 10,6 9 11',1184:'4,8 13,4 32,6 22 25',905:'4,1 10,7 13,2 14 16 7,5 9,3 20 23'}
# model, nozzle trajectory family, metric start/end, US start/end, reduced columns
segments=[('MiniPro','standard',204,218,185,199,False),('RPS50','standard',285,299,267,281,False),('RPS75','standard',475,508,361,394,False),('RPS75','low-angle',550,565,435,450,False),('RPS75-PR','standard',513,546,398,431,False),('RPS75-PR','low-angle',569,584,454,469,False),('RPS75i','standard',783,820,719,756,True),('RPS75i','low-angle',869,884,761,776,True),('RPS75i-PR','standard',826,863,655,692,True),('RPS75i-PR','low-angle',890,905,698,713,True),('RPS-Select','standard',962,981,986,1005,False),('ProPlus','standard',1109,1144,1069,1104,False),('ProPlus','low-angle',1169,1184,1149,1164,False),('SuperPro','standard',1318,1355,1239,1276,True),('SuperPro','low-angle',1361,1376,1282,1297,True)]
def parse(model,kind,start,end,reduced,metric):
 out=[];nozzle=None
 for ln in range(start,end+1):
  raw=lines[ln];s=repairs.get(ln,raw)
  s=s.split('krain.com')[0].split('Down Here.')[0]
  m=re.search(r'#([\d.,]+)',s)
  if m:
   size=float(m[1].replace(',','.'));nozzle=f'{size:.2f}'.rstrip('0')
   if nozzle.endswith('.'):nozzle+='0'
   s=s[m.end():]
  nums=list(map(float,re.findall(r'\d+(?:[.,]\d+)?',s.replace(',','.'))))
  if not nums:continue
  need=9 if reduced else 5
  assert len(nums)>=need,(model,kind,ln,nums)
  nums=nums[:need]
  assert nozzle
  p,r,q,sq,tr=nums[:5]
  item={'modelId':model,'nozzleId':f'k-rain:{model}:{kind}-{nozzle}','unitSystem':'metric' if metric else 'US','sourceLine':ln,'sourcePage':pages[ln],'sourceUrl':URL,'sourceText':raw,'separatorRepair':repairs.get(ln),'pressure':p,'radius':r,'flow':q,'precipSquare':sq,'precipTriangle':tr,'kind':'base'}
  out.append(item)
  if reduced:
   r,q,sq,tr=nums[5:];out.append({**item,'radius':r,'flow':q,'precipSquare':sq,'precipTriangle':tr,'kind':'reduced','reductionPercent':30})
 return out
metric=[];us=[]
for model,kind,ma,mz,ua,uz,red in segments:
 metric.extend(parse(model,kind,ma,mz,red,True));us.extend(parse(model,kind,ua,uz,red,False))
assert len(metric)==522 and len(us)==522,(len(metric),len(us))
save('rotor-source-rows.json',{'metric':metric,'US':us,'separatorRepairs':repairs})
j=json.loads((B/'rotor-catalog-audited-snapshot.json').read_text());a=j if isinstance(j,list)else j['items'];rotors=[i for i in a if i['type']=='rotor']
bykey={(r['modelId'],r['nozzleId'],r['kind'],r['pressure']):r for r in metric}
checks=[];diffs=[]
for i in rotors:
 stored=[(n['id'],'base',p)for n in i['nozzles']for p in n['performance']]+[(p['nozzleId'],'reduced',p)for p in i.get('reductionPerformance',[])]
 for nid,kind,p in stored:
  source=bykey[(i['modelId'],nid,kind,p['pressureBar'])]
  expected={'pressureBar':source['pressure'],'arcDeg':180,'radiusM':source['radius'],'flowLMin':source['flow'],'precipSquareMmH':source['precipSquare'],'precipTriangleMmH':source['precipTriangle']}
  if kind=='base':expected.update({'pressureKPa':source['pressure']*100,'flowM3H':source['flow']*.06})
  delta=[{'field':k,'stored':p.get(k),'published':v}for k,v in expected.items()if p.get(k) is None or abs(p[k]-v)>1e-6]
  check={'itemId':i['id'],'nozzleId':nid,'kind':kind,'pressureBar':p['pressureBar'],'sourceLine':source['sourceLine'],'sourcePage':source['sourcePage'],'sourceUrl':URL,'source':expected,'stored':p,'differences':delta}
  checks.append(check)
  diffs.extend({**{k:check[k]for k in ['itemId','nozzleId','kind','pressureBar','sourceLine']},**d}for d in delta)
save('rotor-row-checks.json',{'checkedOn':'2026-10-10','models':len(rotors),'nozzleEntries':sum(len(i['nozzles'])for i in rotors),'baseRows':sum(c['kind']=='base'for c in checks),'reducedRows':sum(c['kind']=='reduced'for c in checks),'numericCellsCompared':sum(8 if c['kind']=='base'else 6 for c in checks),'differences':diffs,'rows':checks})
print(json.dumps({'models':len(rotors),'rows':len(checks),'differences':len(diffs),'differenceFields':dict(collections.Counter(d['field']for d in diffs))}))
print(json.dumps([d for d in diffs if d['stored'] is not None],ensure_ascii=False))

unit_checks=[]
for m,u in zip(metric,us):
 assert (m['modelId'],m['nozzleId'],m['kind'])==(u['modelId'],u['nozzleId'],u['kind'])
 # Metric -30% RPS75i radii are actually printed as whole metres. Other
 # tables print one decimal; do not give them an arbitrary half-metre tolerance.
 radius_metric_half_unit=.5 if m['modelId']=='RPS75i' and m['kind']=='reduced' else .05
 comparisons=[]
 for field,factor,half_m,half_u in [('radius',.3048,radius_metric_half_unit,.5),('flow',3.785411784,.05,.05),('precipSquare',25.4,.5,.005),('precipTriangle',25.4,.5,.005)]:
  delta=m[field]-u[field]*factor;tolerance=half_m+half_u*factor
  comparisons.append({'field':field,'metric':m[field],'US':u[field],'USconverted':u[field]*factor,'difference':delta,'combinedPrintedRoundingTolerance':tolerance,'withinPrintedRounding':abs(delta)<=tolerance+1e-8})
 unit_checks.append({'modelId':m['modelId'],'nozzleId':m['nozzleId'],'kind':m['kind'],'pressureBar':m['pressure'],'pressurePsi':u['pressure'],'sourceLines':[m['sourceLine'],u['sourceLine']],'comparisons':comparisons})
save('rotor-unit-checks.json',unit_checks)
# Recheck the seven deliberately selected RPS75 metric flows against the actual
# final table in the fresh Rev.12 native extract, not its hidden legacy content.
manual_url='https://www.krain.com/content/files/images/landingpages/rotors/rps75/rps75%20setting%20instructions.pdf'
manual=(B/'rotor-source-rps75-instructions.txt').read_text();mlines={int(n):s for n,s in re.findall(r'^L(\d+)@[^:]+: (.*)$',manual,re.M)}
manual_values={('standard-6.0',4.1):(210,20.8),('standard-6.0',4.8):(211,22.7),('standard-8.0',4.1):(214,28.8),('standard-8.0',4.8):(215,31.0),('low-angle-3.0',4.1):(227,14.4),('low-angle-6.0',4.1):(234,30.3),('low-angle-6.0',4.8):(235,32.6)}
corrections=[]
for(nid,pressure),(ln,value)in manual_values.items():
 s=re.sub(r'^#[\d.]+\s*','',mlines[ln]);v=list(map(float,re.findall(r'\d*\.\d+|\d+',s)))
 assert v[6]==value,(ln,v,value)
 pair=next(c for c in unit_checks if c['nozzleId']=='k-rain:RPS75:'+nid and c['kind']=='base' and c['pressureBar']==pressure)
 published_gpm=next(c['US'] for c in pair['comparisons']if c['field']=='flow')
 assert abs(value-published_gpm*3.785411784)<=.05+.05*3.785411784
 corrections.append({'itemId':'k-rain:RPS75','nozzleId':'k-rain:RPS75:'+nid,'pressureBar':pressure,'selectedFlowLMin':value,'sourceUrl':manual_url,'sourceLine':ln,'sourceText':mlines[ln],'currentUSFlowGpm':published_gpm,'currentCatalogueSourceLines':pair['sourceLines'],'decision':'Retain existing correction; corroborated current US and separately published metric instruction value. For LA6 at 4.8 bar, ignore manual US 8.3 typo; current US 8.6 corroborates metric32.6.'})
save('rotor-existing-corrections.json',corrections)
nulls=[]
for c in checks:
 for d in c['differences']:
  if d['stored']is None:nulls.append({k:c[k]for k in ['itemId','nozzleId','kind','pressureBar','sourceLine','sourcePage','sourceUrl']}|d)
assert len(nulls)==107
save('rotor-retained-null-precipitation.json',nulls)
print(json.dumps({'radiusUnitConflicts':[{'modelId':c['modelId'],'nozzleId':c['nozzleId'],'kind':c['kind'],'pressureBar':c['pressureBar']}for c in unit_checks if not c['comparisons'][0]['withinPrintedRounding']],'retainedFlowCorrections':len(corrections),'retainedNullPrecipitation':len(nulls)}))
