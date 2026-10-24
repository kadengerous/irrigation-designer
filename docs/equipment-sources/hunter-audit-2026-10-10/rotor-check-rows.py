import json,re
from pathlib import Path
P=Path(__file__).parent
cat=json.load(open(P.parents[2]/'src/data/hunter-catalog.json'))
specs=[
('PGJ','pgj',256,289,180),('SRM','srm',215,248,180),
('PGP-ADJ','pgp-adj',284,340,180),
('PGP-ULTRA','i20',319,368,180),('I-20','i20',319,368,180),('I-20-SS','i20',319,368,180),
('I-25','i25',291,342,180),('I-25-SS','i25',291,342,180),
('I-40','i40',300,330,180),('I-40-SS','i40',300,330,180),('I-40-ON','i40',362,393,360),
('I-80','i80',231,309,360),('I-80-SS','i80',231,309,360),('I-80-ON','i80',310,395,360),
('I-90','i90',241,283,180),('I-90-36V','i90',284,330,360),
('G-70-B','g70',173,210,360),('G-75-B','g75',190,246,360),
('G-80-B','g80',190,300,360),('G-85-B','g85',203,317,360),
('ST-90','st90',156,181,180),('STG-900','st90',156,181,180),
('ST-1600','st1600',239,300,180)]
checks=[];diff=[];summary=[]
for id,key,lo,hi,arc in specs:
 text=(P/f'rotor-source-{key}.txt').read_text()
 rows=[]
 for m in re.finditer(r'L(\d+): ([\s\S]*?)(?=L\d+:|$)',text):
  ln=int(m[1]);s=m[2].strip()
  if not lo<=ln<=hi:continue
  cells=[c.strip() for c in s.split('|')]
  count=7 if key=='st1600' else 5
  if len(cells)<count:continue
  try:nums=list(map(float,cells[-count:]))
  except ValueError:continue
  if key=='st1600':
   p,kpa,rad,m3h,lmin,sq,tri=nums
   data=dict(pressureBar=p,pressureKPa=kpa,radiusM=rad,flowLMin=lmin,flowM3H=round(lmin*.06,7),precipSquareMmH=sq,precipTriangleMmH=tri,arcDeg=arc)
  else:
   psi,ft,gpm,sq,tri=nums
   p={25:1.7,30:2.1,35:2.4,40:2.8,45:3.1,50:3.4,55:3.8,60:4.1,65:4.5,70:4.8,80:5.5,90:6.2,100:6.9,110:7.6,120:8.3}.get(psi)
   if p is None:continue
   data=dict(pressureBar=p,pressureKPa=p*100,radiusM=round(ft*.3048,6),flowLMin=round(gpm*3.785411784,6),flowM3H=round(gpm*3.785411784*.06,7),precipSquareMmH=round(sq*25.4,6),precipTriangleMmH=round(tri*25.4,6),arcDeg=arc)
  rows.append(dict(sourceLine=ln,sourceValues=nums,normalized=data))
 item=next(x for x in cat if x['id']==id)
 local=[(ni,ri,n,r) for ni,n in enumerate(item['nozzles']) for ri,r in enumerate(n['performance'])]
 summary.append(dict(id=id,expectedRows=len(local),sourceRows=len(rows),sourceFile=f'rotor-source-{key}.txt'))
 if len(rows)!=len(local):continue
 for (ni,ri,n,r),source in zip(local,rows):
  changes=[]
  for field,value in source['normalized'].items():
   # Local flow uses 3.78541 vs full factor; allow only 0.0001 l/min rounding.
   tol=.0001 if field in ['flowLMin','flowM3H'] else .000001
   if abs(r.get(field,0)-value)>tol:
    changes.append(dict(field=field,old=r.get(field),new=value))
  check=dict(id=id,nozzleId=n['id'],rowIndex=ri,sourceUrl=item['sourceUrl'] if id!='PGP-ULTRA' else 'https://www.hunterirrigation.com/irrigation-product/rotors/i-20',**source,match=not changes)
  checks.append(check)
  if changes:diff.append(dict(**check,changes=changes))
print(json.dumps(summary,indent=2))
print('DIFFS',len(diff))
for x in diff:print(x['id'],x['nozzleId'],x['rowIndex'],x['changes'])
(P/'rotor-row-checks.json').write_text(json.dumps(dict(checkedOn='2026-10-10',pressureConvention='Retain existing nominal bar grid derived from US PSI table; US data compared in original units. ST-1600 uses metric source.',summary=summary,checks=checks),indent=2)+'\n')
(P/'rotor-row-patches.json').write_text(json.dumps(dict(patches=diff),indent=2)+'\n')
