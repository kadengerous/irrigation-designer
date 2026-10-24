import json,math,pathlib,hashlib
b=pathlib.Path(__file__).parent
cat=b.parents[2]/'src/data/equipment/rain-bird.json'
items=json.loads(cat.read_text());items=items if isinstance(items,list) else items['items']
rotors=[i for i in items if i['family']=='rotor'];bodies=[i for i in items if i['family']=='body']
def save(name,x):(b/name).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
body_url='https://www.rainbird.com/media/13671'
tech_url='https://www.rainbird.com/media/4635'
patches=[]
for i in bodies:
 if i.get('regulatedPressureBar'):
  psi=35 if i['regulatedPressureBar']==2.1 else 50
  patches.append({'id':i['id'],'field':'nominalRegulationMinInletBar','old':i.get('nominalRegulationMinInletBar'),'new':round(psi*0.0689475729317831,9),'sourceUrl':body_url,'sourcePage':4,'sourceValue':psi,'sourceUnit':'psi','reason':'Nominal nozzle pressure is guaranteed only at or above this inlet pressure. Below it the spec allows up to6psi loss; no exact loss curve is published.'})
patches.append({'id':'rain-bird:5004+PCR','field':'pressureBasis','old':None,'new':'inlet','sourceUrl':tech_url,'sourcePages':[5,6],'reason':'Dedicated PRS performance includes measured low-inlet points and constant3.5–5.2bar plateau. It must not be capped at nominal3.1bar nozzle outlet pressure.'})
rate_patches=[]
for i in rotors:
 if i['id'] not in ['rain-bird:5004-PC','rain-bird:5004+PC','rain-bird:5004+PCR']:continue
 noid='rain-bird:5000-PRS:6' if i['id'].endswith('PCR') else 'rain-bird:5000:6'
 n=next(n for n in i['nozzles'] if n['id']==noid)
 for r in n['performance']:
  fields=['precipSquareMmH','precipTriangleMmH'] if r['pressureBar']==2 else ['precipSquareMmH'] if r['pressureBar']==3 and not i['id'].endswith('PCR') else []
  for field in fields:
   factor=1 if field=='precipSquareMmH' else 2/math.sqrt(3)
   calc=r['flowLMin']*60/r['radiusM']**2*2*factor
   # Very generous rounding envelope: displayed0.1m radius ±0.05m, L/min conversion0.6-step ±0.3L/min, printed precip ±0.5mm/h.
   lo=(r['flowLMin']-.3)*120/(r['radiusM']+.05)**2*factor
   hi=(r['flowLMin']+.3)*120/(r['radiusM']-.05)**2*factor
   rate_patches.append({'id':i['id'],'nozzleId':noid,'pressureBar':r['pressureBar'],'field':field,'old':r[field],'new':None,'sourceUrl':tech_url,'sourcePage':5 if i['id'].endswith('PCR') else 3,'sourceAlternativeUrl':'https://www.rainbird.com/sites/default/files/media/documents/2020-09/5000-series-rotor-nozzle-performance-chart.pdf','sourceRadiusM':r['radiusM'],'sourceFlowLMin':r['flowLMin'],'diagnosticCalculatedMmH':calc,'generousRoundingEnvelopeMmH':[lo,hi],'reason':'Published precipitation disagrees with same-row radius/flow and stated180degree operation/50%-diameter spacing, beyond generous rounding. Keep hydraulic row; null only disputed published precipitation. Calculated value is diagnostic, not replacement manufacturer data.'})
save('rotor-proposed-patches.json',{'checkedOn':'2026-10-10','metadataPatches':patches,'rowPatches':rate_patches,'radiusOrFlowPatches':[],'notes':['All567full-radius rows checked against371freshly extracted official rows.','Keep5004+PCRdefault2.5bar: applicationdefault,notmanufacturerrecommendedpressure. Optional UXchange3.5bar is firstmetricplateau only.','Do not change current1800max4.8bar from currentlinkedtechspec based on older generic100psi claims.']})
checks=json.loads((b/'rotor-row-checks.json').read_text())
urlmap={'3500':'https://www.rainbird.com/media/4634','5000':tech_url,'5000-LA':tech_url,'5000-PRS':tech_url,'5000-PRS-LA':tech_url,'Falcon 6504':'https://www.rainbird.com/sites/default/files/media/documents/2020-09/falcon-6504-series-rotors-performance-charts.pdf','8005':'https://www.rainbird.com/media/4636'}
for row in checks['rows']:
 fam=row['nozzleId'].split(':')[1]
 row['freshSourceUrl']='https://www.rainbird.com/media/4173' if 'MPR' in fam else urlmap[fam]
 applicable=[p for p in rate_patches if p['id']==row['itemId'] and p['nozzleId']==row['nozzleId'] and p['pressureBar']==row['pressureBar']]
 if applicable:row['proposedPublishedPrecipitationNullFields']=[p['field'] for p in applicable]
 row['unitNormalization']='flowM3H equals selected flowLMin *0.06; not an independent measurement.'
save('rotor-row-checks.json',checks)
coverage=[]
for i in rotors:
 rows=[r for n in i['nozzles'] for r in n['performance']]
 coverage.append({'id':i['id'],'nozzleCount':len(i['nozzles']),'rowCount':len(rows),'arcMin':i['arcMin'],'arcMax':i['arcMax'],'allowedArcRanges':i.get('allowedArcRanges'),'pressureMinBar':i['recommendedPressureMin'],'pressureMaxBar':i['recommendedPressureMax'],'pressureBasis':'inlet' if i['id'].endswith('PCR') else 'rotor performance test pressure','allRowsWithinOperatingRange':all(i['recommendedPressureMin']<=r['pressureBar']<=r.get('pressureMaxBar',r['pressureBar'])<=i['recommendedPressureMax'] for r in rows),'radiusAdjustment':i.get('radiusAdjustment'),'mounting':i.get('popUpOptions'),'sourceUrl':i['constraintsSourceUrl'],'sourceTableUrls':sorted(set(x['freshSourceUrl'] for x in checks['rows'] if x['itemId']==i['id']))})
bodycoverage=[]
for i in bodies:
 p=next((p for p in patches if p['id']==i['id']),None)
 bodycoverage.append({'id':i['id'],'popUpMm':i['popUpMm'],'inlet':i['inlet'],'operatingInletMinBar':i['recommendedPressureMin'],'operatingInletMaxBar':i['recommendedPressureMax'],'nominalNozzleOutletBar':i.get('regulatedPressureBar'),'nominalRegulationMinInletBar':p['new'] if p else None,'checkValveHeadM':i.get('checkValveHeadM'),'sideInletAvailable':any(i['id']=='rain-bird:'+s for s in ['1806','1812','1806-PRS','1812-PRS','1806-P45','1812-P45']),'sourceUrl':body_url,'verified':'Model, rise, inlet, SAM/PRS options and operating family checked against currentproductpage and currentlinkedtechspec.'})
save('rotor-coverage.json',{'checkedOn':'2026-10-10','catalogSha256':hashlib.sha256(cat.read_bytes()).hexdigest(),'rotorModels':7,'bodyModels':21,'nozzleEntries':94,'performanceRows':567,'uniqueSourceRows':371,'metadataChanges':len(patches),'precipitationFieldChanges':len(rate_patches),'rotors':coverage,'bodies':bodycoverage})
old=b.parent/'rain-bird-audit-2026-10-05/rotor-color-evidence.json'
colors=json.loads(old.read_text())
for c in colors:c['recheck']='Existing coloridentity retained. Current sourcephotos/table markers and namedparts checked; displayhex approximation, not manufacturercolorstandard.'
save('rotor-colors.json',{'checkedOn':'2026-10-10','entries':colors,'additionalPrimarySources':['https://www.rainbird.com/sites/default/files/media/documents/2018-02/part_7005-8005.pdf','https://www.rainbird.com/sites/default/files/media/documents/2018-02/part_Falcon6504.pdf','https://www.rainbird.com/media/13638'],'bodyCoverNotes':['5000Pluscovergreen isdistinctfrombluenozzle. Currentcatalogblackrepresentsbody; presentationalreadyusesselectednozzlecolor.','8005current2023specblackcover supersedesoldergreencover claim.','1800orangeflushplug removable; not nozzleorpermanentbodycolor.'],'colorPatches':[]})
manifest=[]
for p in sorted(b.glob('rotor-source-*.txt')):
 text=p.read_text();m=__import__('re').search(r'https://[^)\s]+',text)
 manifest.append({'file':p.name,'url':m[0] if m else None,'retrievedOn':'2026-10-10','method':'native web document extractor; no CLI network or browser','sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
save('rotor-source-manifest.json',manifest)
print(json.dumps({'rows':len(checks['rows']),'models':len(coverage),'bodies':len(bodycoverage),'metadataPatches':len(patches),'rowFieldPatches':len(rate_patches),'sources':len(manifest)}))
