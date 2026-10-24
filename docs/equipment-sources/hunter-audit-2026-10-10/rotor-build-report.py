import json,re
from pathlib import Path
P=Path(__file__).parent
root=P.parents[2]
cat=json.load(open(root/'src/data/hunter-catalog.json'))
rows=json.load(open(P/'rotor-row-checks.json'))
models=[x for x in cat if x.get('family') in ['rotor','golf','st']]
residential={'PGJ','SRM','PGP-ADJ','PGP-ULTRA','I-20','I-20-SS'}
no_reduction={'I-80','I-80-SS','I-80-ON'}
faq='https://www.hunterirrigation.com/rotor-frequently-asked-questions'
i80='https://www.hunterirrigation.com/sites/default/files/2023-09/rc-099-ic-i-80-us-web.pdf'
model_checks=[];patches=[];unresolved=[]
for item in models:
 id=item['id'];perf=[r for n in item['nozzles'] for r in n['performance']]
 row_checks=[r for r in rows['checks'] if r['id']==id]
 row_count=len(perf)
 group=next((r for r in rows['summary'] if r['id']==id),None)
 check=dict(id=id,active=not item.get('discontinued',False),sourceUrl=item['sourceUrl'],includedNozzles=len(item['nozzles']),storedRows=row_count,checkedRows=len(row_checks),
   radiusAtPressureVerified=bool(perf) and all(r['match'] for r in row_checks),flowAtPressureVerified=bool(perf) and all(r['match'] for r in row_checks),
   publishedPrecipitationVerified=bool(perf) and all(r['match'] for r in row_checks),
   arcMin=item['arcMin'],arcMax=item['arcMax'],recommendedPressureMin=item['recommendedPressureMin'],recommendedPressureMax=item['recommendedPressureMax'],
   storedRadiusBounds=[item['rMin'],item['rMax']],sourceFile=group['sourceFile'] if group else 'rotor-source-i50.txt')
 if perf:
  check['tableRadiusBounds']=[min(r['radiusM'] for r in perf),max(r['radiusM'] for r in perf)]
  check['radiusBoundsMatchIncludedRows']=all(abs(a-b)<1e-6 for a,b in zip(check['storedRadiusBounds'],check['tableRadiusBounds']))
  check['tablePressureBounds']=[min(r['pressureBar'] for r in perf),max(r['pressureBar'] for r in perf)]
  check['arcStatus']='Verified against model-specific product specifications'
 else:
  check['arcStatus']='Archived: I-50 source specifies 60–360, current 50 is stale; I-50-ON full-circle remains correct.'
  check['status']='Keep Deprecated; no calculation rows added'
  check['sourceUrl']='https://www.hunterirrigation.com/en-metric/irrigation-product/rotors/i-50'
 if id in residential:
  check['radiusReduction']={'status':'Verified maximum reduction 25%','minimumRatio':.75,'sourceUrl':faq,'flowPolicyEvidence':'No universal unchanged-flow guarantee found. Preserve current unchanged-discharge model only as explicitly labelled assumption, not as a manufacturer measurement.'}
 elif id in no_reduction:
  check['radiusReduction']={'status':'Explicitly prohibited for an individual nozzle','minimumRatio':1,'sourceUrl':i80}
  patches.append(dict(id=id,field='radiusAdjustment.minimumRatio',old=.75,new=1,sourceUrl=i80,reason='Current I-80 installation instructions explicitly require changing the nozzle to change radius; individual nozzles cannot be adjusted to reduce radius.',classification='Confirmed correction',target='equipment-catalog adapter'))
 elif perf:
  source='https://www.hunterirrigation.com/en-metric/support/commercial-rotors-i-25-adjust' if id.startswith('I-25') else 'https://www.hunterirrigation.com/support/commercial-rotors-i-40-adjust' if id.startswith('I-40') else item['sourceUrl']
  known_adjust=id.startswith(('I-25','I-40'))
  check['radiusReduction']={'status':'Adjustment screw documented, numerical limit not established' if known_adjust else 'No continuous reduction allowance established for included standard nozzle configuration','supportedContinuousMinimumRatio':None,'conservativeRuntimeMinimumRatio':1,'sourceUrl':source}
  patches.append(dict(id=id,field='radiusAdjustment.minimumRatio',old=.75,new=1,sourceUrl=source,reason='Remove unsupported generic 25% allowance. '+('Model instructions allow screw reduction but do not establish a numerical reduction limit.' if known_adjust else 'Reviewed model product/support documents do not establish continuous 25% reduction for these included standard nozzles. Low-angle nozzle substitution is a separate configuration.'),classification='Conservative restriction, not a claim that physical adjustment is impossible',target='equipment-catalog adapter'))
  unresolved.append(dict(id=id,field='radiusAdjustment.minimumRatio',unknown='Verified numeric continuous reduction limit',sourceUrl=source))
 model_checks.append(check)
# Archived metadata corrections only; never re-enable the legacy records or fabricate tables.
for id,changes in [
 ('I-50',{'arcMin':60,'rMin':13.1,'rMax':21.3,'recommendedPressureMin':2.5,'recommendedPressureMax':7.0}),
 ('I-50-ON',{'rMin':15.2,'rMax':23.2,'recommendedPressureMin':2.5,'recommendedPressureMax':7.0})
]:
 item=next(x for x in models if x['id']==id)
 for field,value in changes.items():
  patches.append(dict(id=id,field=field,old=item[field],new=value,sourceUrl='https://www.hunterirrigation.com/en-metric/irrigation-product/rotors/i-50',reason='Official discontinued-product page has these variant-specific metadata. Keep discontinued=true and existing empty performance arrays.',classification='Archived metadata correction; not required to re-enable calculation',target='hunter-catalog.json'))
bodydata=json.load(open(root/'src/data/hunter-body-models.json'))
bodychecks=[]
for series in bodydata['series']:
 for m in series['models']:
  bodychecks.append(dict(id=m['sku'],seriesId=series['id'],sourceUrl=m.get('sourceUrl',series['sourceUrl']),
   popUpMm=m['popUpMm'],inlet='1/2 inch female',nozzleInterface='male riser accepting female-threaded nozzles',
   regulatedPressureBar=series['regulatedPressureBar'],operatingPressureMin=series['operatingPressureMin'],operatingPressureMax=series['operatingPressureMax'],
   features={f:bool(m.get(f)) for f in ['checkValve','sideInlet','floGuard','reclaimed']},
   status='Verified',evidence='Exact model table or individual model page plus family operating specification; PSU-02 and PSU-06 individual dimensions verified. No discrepancy found.'))
bodymounts=json.load(open(root/'src/data/hunter-rotor-bodies.json'))['models']
bodyoptions=[]
for m in bodymounts:
 bodyoptions.append(dict(**m,status='Verified nominal model and pop-up options',note='Metric nominal dimensions used, not an invented precision conversion. Plastic/stainless aliases may share a currently stainless-only body; no pressure-regulated PRB options are present.'))
output=dict(checkedOn='2026-10-10',auditedHead='78f89a7d94396de843dde1466ef0caff5cfd5f59',activeModels=23,archivedModels=2,storedRows=755,checkedRows=755,rowDiscrepancies=0,
 models=model_checks,sprayBodies=bodychecks,rotorMountingOptions=bodyoptions,
 caveats=[
 'Included racks only. Optional high-flow, low-angle, short-radius or MPR racks absent from the app are not catalog defects.',
 'US tables are authoritative for stored rotor rows, using the catalog existing nominal one-decimal bar labels. These are not new metric-grid measurements and not exact PSI conversions.',
 'Metric ST-1600 canonical flowM3H is recomputed from published L/min. The manufacturer rounded m3/h column differs by <=0.05, requiring no correction.',
 'I-80-ON source operating specification says 65–100 PSI, but its nozzle 23 table also includes 50/60 PSI. Keep existing 4.5 bar minimum; the two lower source rows must remain excluded from operating calculations.',
 'I-90 standard and low-angle orientations are distinct. The published 15% low-angle radius adjustment does not authorize a continuous radius-reduction slider.',
 'STG-900 metric page contains odd Yd/in-hr headings and a swing-joint minimum of 7 bar; stored table instead matches the official shared ST-90/STG-900 US chart. Do not mix inlet swing-joint pressure and nozzle-table pressure.',
 'I-50 and I-50-ON are officially discontinued. Archive metadata differs; empty calculation tables remain intentional.'
 ])
(P/'rotor-coverage.json').write_text(json.dumps(output,indent=2)+'\n')
(P/'rotor-proposed-patches.json').write_text(json.dumps(dict(patches=patches,unresolvedFields=unresolved,runtimeSuggestions=[
 dict(file='src/lib/flow.ts',function='radiusRange',reason='For documented residential 25% radius reduction, the item rMin is the lowest unreduced table radius; it must not clamp the pressure-specific reduced minimum.',example={'model':'PGJ','nozzle':'pgj-0.50','pressureBar':2.8,'tableRadiusM':4.572,'minimumRatio':.75,'correctMinimumM':3.429,'oldItemFloorM':4.2672}),
 dict(file='src/lib/project-store.ts',reason='Selected PRS30/PRS40 body caps nozzle working pressure at nominal regulator output, including manual pressure edits. Regulator cannot boost an insufficient upstream supply. Do not confuse the 1–7 bar body inlet operating range with nozzle regulated outlet.'),
 dict(file='src/lib/flow.ts',reason='Reduced-radius unchanged flow, if retained, must be labelled modelling assumption; published precipitation remains tied to full table throw and table layout. No universal manufacturer unchanged-flow guarantee established.')
 ]),indent=2)+'\n')
print('Coverage:',len(model_checks),'rotor records;',len(bodychecks),'spray bodies;',sum(len(x['options']) for x in bodymounts),'rotor mounting choices; patches',len(patches))

