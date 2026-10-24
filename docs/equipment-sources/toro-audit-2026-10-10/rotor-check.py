import re,json,pathlib,math,hashlib
B=pathlib.Path(__file__).parent
cat=B.parents[2]/'src/data/equipment/toro.json'
data=json.loads(cat.read_text());data=data if isinstance(data,list) else data['items']
rotors=[i for i in data if i['type']=='rotor'];bodies=[i for i in data if i['type']=='body']
source=(B/'rotor-source-t5-sheet.txt').read_text()
source_url='https://cdn.thetorocompany.com/api/assetstorage/623_82540b95-decc-419e-981e-b9f5fb6dfa25'
PSI=.0689475729317831;GPM=3.785411784
rows=[];nozzle=None
for m in re.finditer(r'^L(\d+)@P[^:]+: (.*)$',source,re.M):
 ln=int(m[1]);s=m[2].strip()
 if not (53<=ln<=101 or 123<=ln<=146):continue
 if re.fullmatch(r'\d+\.\d+(?:LA)?',s):nozzle=s;continue
 nums=list(map(float,re.findall(r'\d+(?:\.\d+)?',s)))
 if len(nums)!=5:continue
 psi,feet,gpm,triangle,square=nums
 rows.append({'nozzleId':nozzle,'sourceLine':ln,'sourcePage':3,'sourceUrl':source_url,'source':{'pressurePsi':psi,'radiusFt':feet,'flowGpm':gpm,'precipTriangleInH':triangle,'precipSquareInH':square,'arcDeg':180},'normalized':{'pressureBar':psi*PSI,'pressureKPa':psi*PSI*100,'arcDeg':180,'radiusM':feet*.3048,'flowLMin':gpm*GPM,'flowM3H':gpm*GPM*.06,'precipSquareMmH':square*25.4,'precipTriangleMmH':triangle*25.4}})
assert len(rows)==60
checks=[];errors=[]
for item in rotors:
 assert item['modelId'] in source,item['id']
 for n in item['nozzles']:
  for p in n['performance']:
   original=next(r for r in rows if r['nozzleId']==n['id'] and abs(r['normalized']['pressureBar']-p['pressureBar'])<1.01e-6)
   ds=[{'field':k,'current':p[k],'expected':v}for k,v in original['normalized'].items() if abs(p[k]-v)>1.01e-6]
   checks.append({'itemId':item['id'],'nozzleId':n['id'],'pressureBar':p['pressureBar'],'sourceLine':original['sourceLine'],'sourceUrl':source_url,'source':original['source'],'current':p,'differences':ds,'status':'exact-within-six-decimal-conversion' if not ds else 'different'})
   errors.extend(ds)
body_source=(B/'rotor-source-570z-sheet.txt').read_text()
body_url='https://cdn.thetorocompany.com/api/assetstorage/623_d96f613f-4053-4dcd-887c-4b324d0cb3d3'
bodychecks=[]
for i in bodies:
 id=i['modelId'];lp='LP' in id;regulated='PR' in id;side='SI' in id;check='COM' in id
 expected={'recommendedPressureMin':round((15 if lp else 20)*PSI,6),'recommendedPressureMax':round(75*PSI,6),'regulatedPressureBar':round(30*PSI,6) if regulated else None,'popUpMm':{2:50,3:75,4:100,6:150,12:300}[int(re.search(r'570Z-(\d+)',id)[1])]}
 ds=[{'field':k,'current':i.get(k),'expected':v}for k,v in expected.items() if i.get(k)!=v]
 assert id in body_source,id
 assert not(side and check)
 bodychecks.append({'id':i['id'],'sourceUrl':body_url,'modelListed':True,'operatingSourcePage':4,'modelSourcePage':3,'expected':expected,'features':i['bodyFeatures'],'sideInlet':side,'checkValve':check,'inlet':i['inlet'],'requiredNozzleThread':i['nozzleThread'],'differences':ds,'nominalRegulationMinInletBar':None if regulated else 'not applicable','nominalRegulationMinInletNote':'No separate threshold or pressure-drop curve published in current checked sources.' if regulated else None})
 errors.extend(ds)
for name,value in [('rotor-source-rows.json',rows),('rotor-row-checks.json',{'checkedOn':'2026-10-10','rowCount':len(checks),'uniqueSourceRows':60,'numericCells':len(checks)*8,'tolerance':1.01e-6,'errors':errors,'rows':checks}),('rotor-body-checks.json',bodychecks)]:
 (B/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
# Confirm precipitation is consistent within whole-foot/gpm/rate displayed rounding, never replace published rates.
diag=[]
for row in rows:
 r=row['source'];q=r['flowGpm'];f=r['radiusFt']
 for field,factor in [('precipSquareInH',1),('precipTriangleInH',2/math.sqrt(3))]:
  expected=192.5*q/(f*f)*factor
  lo=192.5*(q-.005)/(f+.5)**2*factor;hi=192.5*(q+.005)/(f-.5)**2*factor
  observed=r[field];ok=observed+.005>=lo and observed-.005<=hi
  diag.append({'nozzleId':row['nozzleId'],'pressurePsi':r['pressurePsi'],'field':field,'published':observed,'calculatedDiagnostic':expected,'roundingEnvelope':[lo,hi],'consistentWithinPrintedPrecision':ok})
(B/'rotor-precipitation-checks.json').write_text(json.dumps(diag,indent=2)+'\n')
print(json.dumps({'rotors':len(rotors),'nozzleEntries':sum(len(i['nozzles'])for i in rotors),'rows':len(checks),'bodies':len(bodychecks),'errors':errors,'precipOutsideRounding':[d for d in diag if not d['consistentWithinPrintedPrecision']]}))

# Exact-SKU and all-model metadata checks, separate from row transcription.
price_url='https://specifier.toro.com/manuals/toro-irritrol_pricelist_2025.pdf'
prices=(B/'rotor-source-price-list-bodies.txt').read_text()+'\n'+(B/'rotor-source-price-list-t5.txt').read_text()
nozzle_ids=['1.5','2.0','2.5','3.0','4.0','5.0','6.0','8.0','1.0LA','1.5LA','2.0LA','3.0LA']
models=[]
for i in rotors:
 id=i['modelId'];shrub=id.startswith('T5S');high=id.startswith('T5H');effluent=id in {'T5PE-RS-LN','T5HPE-RS','T5SE-RS','T5PSSE3.0-RS'}
 expected={'arcMin':40,'arcMax':360,'recommendedPressureMin':round(25*PSI,6),'recommendedPressureMax':round(65*PSI,6),'recommendedPressureBar':round(45*PSI,6),'rMin':25*.3048,'rMax':50*.3048,'inlet':'3/4-inch NPT female','popUpMm':0 if shrub else 304.8 if high else 127,'mountingKind':'riser' if shrub else 'integrated','radiusAdjustment':{'minimumRatio':.75,'flowPolicy':'unknown'},'colorName':'Lavender' if effluent else 'Dark gray','colorSourceKind':'cap'}
 default=re.search(r'CK(1\.5|2\.0|2\.5|3\.0)-',id)
 expected['defaultNozzleId']=default[1] if default else '3.0'
 expected['rNom']=next(r['normalized']['radiusM'] for r in rows if r['nozzleId']==expected['defaultNozzleId'] and r['source']['pressurePsi']==45)
 ds=[{'field':k,'current':i.get(k),'expected':v}for k,v in expected.items() if i.get(k)!=v and not(isinstance(v,float)and isinstance(i.get(k),(int,float))and abs(i[k]-v)<1.01e-6)]
 assert [n['id']for n in i['nozzles']]==nozzle_ids
 expected_features=[]
 if 'CK' in id:expected_features.append('CV')
 if effluent:expected_features.append('Effluent')
 if 'SS' in id:expected_features.append('Stainless steel')
 assert sorted(i['bodyFeatures'])==sorted(expected_features),(id,i['bodyFeatures'],expected_features)
 assert i.get('unverifiedBodyFeatures',[])==(['CV']if shrub else [])
 assert re.search(r'(?<![A-Z0-9])'+re.escape(id)+r'(?![A-Z0-9.\-])',prices),id
 models.append({'id':i['id'],'sourceUrl':source_url,'current2026PriceListUrl':price_url,'exactSkuPresent':True,'nozzleIds':nozzle_ids,'rowCount':60,'expected':expected,'differences':ds,'bodyFeatures':expected_features,'unverifiedBodyFeatures':['CV']if shrub else [],'defaultNozzleBasis':'Application selection, not a factory-installation claim, because this SKU is less-nozzle.' if id.endswith('-LN') else 'SKU-specific installed size where encoded; otherwise family standard design selection.','pressureRegulator':False,'fullCircleRotation':'reversing','rotationSourceUrl':'https://media.toro.com/CatalogDocuments/Specifications/T5-bid-spec.pdf','flowAtReducedRadius':'unknown','precipitationBasis':{'arcDeg':180,'spacingFractionOfDiameter':.5,'sourceUrl':'https://www.toro.com/getpub/128192'}})
 errors.extend(ds)
for i,b in zip(bodies,bodychecks):
 id=i['modelId'];features=[]
 for condition,feature in [('SI'in id,'SI'),('LP'in id,'LP'),('COM'in id,'CV'),('XF'in id or'PRX'in id,'X-Flow'),('PR'in id,'PR')]:
  if condition:features.append(feature)
 assert sorted(i['bodyFeatures'])==sorted(features),(id,i['bodyFeatures'],features)
 assert i['inlet']=='1/2-inch NPT female' and i['nozzleThread']=='male'
 assert re.search(r'(?<![A-Z0-9])'+re.escape(id)+r'(?![A-Z0-9.\-])',prices),id
 b.update({'exactSkuPresentIn2026PriceList':True,'current2026PriceListUrl':price_url,'featuresMatchModelDefinition':True,'nozzleThreadMeaning':'male nozzle fits female outlet; this is required nozzle sex, not the outlet sex','colorNameVerified':'Black','colorSourceUrl':price_url,'checkValveHoldbackFt':10 if 'COM'in id else None})
for name,value in [('rotor-model-checks.json',models),('rotor-body-checks.json',bodychecks)]:
 (B/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
assert not errors,errors
print(json.dumps({'modelMetadataChecks':len(models),'exactCurrentSkus':len(models)+len(bodychecks),'bodyFeatureChecks':len(bodychecks),'errors':errors}))
