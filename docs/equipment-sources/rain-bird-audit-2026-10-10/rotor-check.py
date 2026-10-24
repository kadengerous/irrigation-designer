import json,re,pathlib,collections
BASE=pathlib.Path(__file__).parent
CAT=BASE.parents[2]/'src/data/equipment/rain-bird.json'
items=json.loads(CAT.read_text()); items=items if isinstance(items,list) else items['items']

def lines(name):
 d={}
 for m in re.finditer(r'^L(\d+)@P[^:]+: (.*)$',(BASE/f'rotor-source-{name}.txt').read_text(),re.M):d[int(m[1])]=m[2]
 return d
tech=lines('5000-tech');tech.update(lines('5000-tech-end'))
parsed={}
def rotor(name,d,a,b):
 p=None;pm=None;count=0
 for ln,s in d.items():
  if not a<=ln<=b or not re.match(r'^[\d●]',s):continue
  s=s.split('3500 Series Rotors')[0].split('5000 Series Rotors')[0]
  nums=list(map(float,re.findall(r'\d+(?:\.\d+)?',s)))
  if len(nums)>=8 and '–' in s:p,pm=nums[:2];nums=nums[2:]
  elif len(nums)>=7:p=nums.pop(0);pm=None
  assert len(nums)==6,(name,ln,s,nums)
  no,r,q,flow,sq,tr=nums
  parsed[(name,f'{no:g}',p)]={'pressureBar':p,'radiusM':r,'flowM3H':q,'flowLMin':flow,'precipSquareMmH':sq,'precipTriangleMmH':tr,'arcDeg':180,'pressureMaxBar':pm,'sourceLine':ln}
  count+=1
 print(name,count)
rotor('3500',lines('3500'),135,170)
rotor('5000',tech,211,258)
rotor('5000-LA',tech,313,340)
rotor('5000-PRS',tech,407,446)
rotor('5000-PRS-LA',tech,497,516)
rotor('Falcon 6504',lines('6504'),76,150)
rotor('8005',lines('8005'),175,253)
for family,a,b in [('5000-MPR-25',87,106),('5000-MPR-30',205,224),('5000-MPR-35',240,259)]:
 arc=None
 for ln,s in lines('5000-mpr').items():
  if not a<=ln<=b:continue
  m=re.match('(Quarter|Third|Half|Full)',s)
  if m:arc=m[1]
  p,r,q,flow,sq,tr=map(float,re.findall(r'\d+(?:\.\d+)?',s))
  parsed[(family,arc,p)]={'pressureBar':p,'radiusM':r,'flowM3H':q,'flowLMin':flow,'precipSquareMmH':sq,'precipTriangleMmH':tr,'arcDeg':{'Quarter':90,'Third':120,'Half':180,'Full':360}[arc],'pressureMaxBar':None,'sourceLine':ln}
print('unique',len(parsed))
checks=[];unexplained=[]
for item in items:
 if item['family']!='rotor':continue
 for nozzle in item['nozzles']:
  _,family,no=nozzle['id'].split(':');no=no.removesuffix('-LA')
  for row in nozzle['performance']:
   fresh=parsed[(family,no,row['pressureBar'])]
   diffs=[]
   for k in ['radiusM','flowLMin','precipSquareMmH','precipTriangleMmH','arcDeg','pressureMaxBar']:
    if row.get(k)!=fresh[k]:diffs.append({'field':k,'catalog':row.get(k),'published':fresh[k]})
   rationale=[]
   for diff in diffs:
    k=diff['field']
    if k.startswith('precip') and diff['catalog'] is None and family in ['5000','5000-PRS'] and no=='8': rationale.append('Conflicting manufacturer precipitation retained as unknown, per October5 audit; freshly unchanged.')
    elif k=='flowLMin' and ((family=='5000' and no=='6' and row['pressureBar']==4.5) or (family=='5000-PRS' and no=='4' and row['pressureBar']==3)) and abs(row[k]-fresh['flowM3H']/0.06)<1e-5:rationale.append('Selected published m3/h conversion corroborated by imperial grid; inconsistent published L/min rejected, per October5 audit; freshly unchanged.')
    else:unexplained.append({'item':item['id'],'nozzle':nozzle['id'],'pressure':row['pressureBar'],'difference':diff})
   assert abs(row['flowM3H']-row['flowLMin']*.06)<1e-6
   checks.append({'itemId':item['id'],'nozzleId':nozzle['id'],'pressureBar':row['pressureBar'],'currentRow':row,'freshPublishedRow':fresh,'status':'verified-selected-source' if not diffs else 'documented-source-conflict','differences':diffs,'rationale':list(dict.fromkeys(rationale))})
(BASE/'rotor-row-checks.json').write_text(json.dumps({'checkedOn':'2026-10-10','rowCount':len(checks),'uniqueSourceRowCount':len(parsed),'unexplainedDifferences':unexplained,'rows':checks},indent=2)+'\n')
print('CHECKS',len(checks),'unexplained',json.dumps(unexplained,indent=2))
