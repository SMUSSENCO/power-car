"""Пересчёт цен всего каталога по текущим курсам из data/settings.json.
Запуск: python3 scripts/reprice.py (проба, ничего не пишет) / python3 scripts/reprice.py apply.
После apply ставит settings.pricesUpdatedAt (дата, которая показывается на карточках). Таможню пересчитывает только у лотов,
сумма которых совпадает с формулой калькулятора; электромобили, мощные лоты и суммы от партнёра не трогает.
"""
import json,collections,sys,datetime
APPLY = len(sys.argv)>1 and sys.argv[1]=='apply'
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
cs=json.load(open(ROOT+'data/cars.json',encoding='utf-8')); S=json.load(open(ROOT+'data/settings.json'))
EUR=S.get('customsEUR',S['rateEUR']); CCNY=S.get('customsCNY'); RATE={'China':S['rateCNY'],'Japan':S['rateJPY'],'Korea':S['rateKRW']}
DOM={'China':S['domesticChina'],'Japan':S['domesticJapan'],'Korea':S['domesticKorea']}
R35=[(1000,1.5),(1500,1.7),(1800,2.5),(2300,2.7),(3000,3.0),(1e9,3.6)]
R5=[(1000,3.0),(1500,3.2),(1800,3.5),(2300,4.8),(3000,5.0),(1e9,5.7)]
U3=[(8500,.54,2.5),(16700,.48,3.5),(42300,.48,5.5),(84500,.48,7.5),(169000,.48,15),(1e9,.48,20)]
rate=lambda t,cc: next(r for m,r in t if cc<=m)
KEEP_CUSTOMS={'Hyundai-ix25-TOP-2020-red-19116km','BYD-Yuan-UP-401KM-Vital-2024-grey','BYD-Yuan-UP-401KM-Vital-2024-light-green'}
def fee_for(value, fallback):
    if 450000<=value<=1200000: return 4924
    if 1200000<value<=2700000: return 13541
    return fallback
def util_k(pw,bucket): return (47.64 if bucket=='under3' else 79.20) if pw>160 else (0.17 if bucket=='under3' else 0.26)
# Актуальные коэффициенты утильсбора (физлица, ПП №1291, раздел I п.4, ред. с 12.02.2026, год 2026): как в kalkulyator-*.html (UTIL_K).
# util_k выше нужен только для восстановления старых сохранённых сумм в fit(), новые суммы считаются через util_k_2026.
HP_MAX=[70,100,130,160,190,220,250,280,310,340,370,400,430,460,500,1e9]
CC_MAX=[1000,2000,3000,3500,1e9]
UTIL_K_2026=[
    [(0.17,0.26),(0.17,0.26),(0.17,0.26),(0.17,0.26),(15.36,28.44),(15.84,29.28),(16.2,30.12),(17.28,30.12),(17.28,30.12),(17.28,30.12),(17.28,30.12),(17.28,30.12),(17.28,30.12),(17.28,30.12),(17.28,30.12),(17.28,30.12)],
    [(0.17,0.26),(0.17,0.26),(0.17,0.26),(0.17,0.26),(45,74.64),(47.64,79.2),(50.52,83.88),(57.12,91.92),(64.56,100.56),(72.96,110.16),(83.16,120.6),(94.8,132),(108,144.6),(123.24,158.4),(140.4,173.4),(160.08,189.84)],
    [(0.17,0.26),(0.17,0.26),(0.17,0.26),(0.17,0.26),(115.34,172.8),(118.2,175.08),(120.12,177.6),(126,183),(131.04,188.52),(136.32,193.68),(141.72,199.08),(147.48,204.72),(153.36,210.48),(159.48,216.36),(165.84,222.36),(172.44,228.6)],
    [(129.2,197.81),(129.2,197.81),(129.2,197.81),(129.2,197.81),(131.76,200.04),(134.4,202.2),(137.16,204.36),(140.52,207.24),(144,212.4),(151.92,217.8),(160.32,224.28),(169.2,231),(178.44,237.96),(188.28,245.04),(198.6,252.48),(209.52,260.04)],
    [(164.53,216.29),(164.53,216.29),(164.53,216.29),(164.53,216.29),(167.28,219.48),(170.16,222.84),(173.04,226.2),(176.52,231.36),(180,236.64),(186.36,249.6),(192.88,263.4),(199.68,277.92),(206.64,293.16),(213.84,309.36),(221.28,326.4),(229.08,344.28)],
]
def util_k_2026(cc,pw,bucket):
    ci=next(j for j,m in enumerate(CC_MAX) if cc<=m); pi=next(j for j,m in enumerate(HP_MAX) if (pw or 0)<=m)
    return UTIL_K_2026[ci][pi][0 if bucket=='under3' else 1]
def fit(c,val_old):
    """find (bucket,fee,eur_old) that reproduces stored customs"""
    try: cc=round(float(c['engine'])*1000)
    except: return None
    pw=c.get('power') or 0; cust=c['breakdown']['customs']; out=[]
    for bucket in ('from3to5','over5'):
        u=20000*util_k(pw,bucket); r=rate(R35 if bucket=='from3to5' else R5,cc)
        for fee in (13541,4924):
            e=(cust-fee-u)/(cc*r)
            if 80<=e<=100: out.append((bucket,fee,round(e,2),cc))
    # under3: scan EUR
    u=20000*util_k(pw,'under3'); b=next(x for x in U3 if val_old/ 90 <= x[0])
    for fee in (13541,4924):
        for e100 in range(8000,10001):
            e=e100/100; ve=val_old/e; bb=next(x for x in U3 if ve<=x[0])
            pred=fee+round(max(ve*bb[1],cc*bb[2])*e)+u
            if abs(pred-cust)<=3: out.append(('under3',fee,e,cc)); break
    return out
def new_customs(c,bucket,fee_old,cc,value_new):
    pw=c.get('power') or 0; u=20000*util_k_2026(cc,pw,bucket); fee=fee_for(value_new,fee_old)
    if bucket=='under3':
        ve=value_new/EUR; bb=next(x for x in U3 if ve<=x[0]); duty=int(max(ve*bb[1],cc*bb[2])*EUR)
    else: duty=int(cc*rate(R35 if bucket=='from3to5' else R5,cc)*EUR)
    return fee+duty+u
rows=[]; stat=collections.Counter(); per_country=collections.defaultdict(list)
# 1st pass: implied rates for clustering
imp={}
for c in cs:
    b=c.get('breakdown'); cl=c.get('calc')
    if not b or not cl or not cl.get('marketLocal') or str(c.get('engine')).upper()=='EV': continue
    ml=cl['marketLocal']; f=fit(c,b['auction'])
    if f: imp[c['id']]=f
cluster=collections.Counter()
for k,f in imp.items():
    for x in f: cluster[x[2]]+=1
for c in cs:
    b=c.get('breakdown'); cl=c.get('calc'); cid=c['id']; r=RATE.get(c['country'])
    if not b or not cl or not cl.get('marketLocal'): stat['skip: no breakdown']+=1; continue
    if abs(sum(b.values())-c['price'])>1: stat['skip: price != sum(breakdown) (manual)']+=1; continue
    ml=cl['marketLocal']; old_r=b['auction']/ml
    if abs(old_r-round(old_r,4))>0.0005 and False: pass
    old_price=c['price']; old_cust=b['customs']
    new_auction=round(ml*r); new_dom=round(DOM[c['country']]*r)
    cust_new=old_cust; note='customs kept'
    isev=str(c.get('engine')).upper()=='EV'
    if cid in KEEP_CUSTOMS: note='customs kept (given by user)'
    elif isev: note='customs kept (EV)'
    elif old_cust%1000==0: note='customs kept (manual round sum)'
    elif cid.startswith('Hyundai-ix25') and c['year']==2020: cust_new=452647; note='customs set 452647 (user calc, ix25 2020)'
    else:
        f=[x for x in imp.get(cid,[]) if cluster[x[2]]>=3]
        if f:
            bucket,fee_old,e_old,cc=f[0]
            cust_new=new_customs(c,bucket,fee_old,cc,(ml*CCNY if (c['country']=='China' and CCNY) else new_auction)); note=f'customs recalculated ({bucket}, EUR {e_old}->{EUR})'
    nb=dict(b); nb['auction']=new_auction; nb['domestic']=new_dom; nb['customs']=cust_new
    new_price=sum(nb.values())
    stat['repriced']+=1; stat[note.split(' (')[0]]+=1
    per_country[c['country']].append((new_price-old_price)/old_price)
    rows.append((cid,c['country'],note,old_price,new_price,old_cust,cust_new,old_r))
    if APPLY:
        c['breakdown']=nb; c['price']=new_price; c['calc']['customs']=cust_new
print(dict(stat))
for k,v in per_country.items(): print(k,len(v),'avg change %.1f%%  min %.1f%% max %.1f%%'%(100*sum(v)/len(v),100*min(v),100*max(v)))
print('CNY old rates',collections.Counter(round(r[7],2) for r in rows if r[1]=='China'))
print('JPY old rates',collections.Counter(round(r[7],3) for r in rows if r[1]=='Japan'))
print('KRW old rates',collections.Counter(round(r[7],4) for r in rows if r[1]=='Korea'))
if not APPLY:
    for r in rows[:0]: pass
    import random; random.seed(1)
    for r in random.sample(rows,14): print(r[0][:42],'|',r[2][:44],'|',r[3],'->',r[4],'| cust',r[5],'->',r[6])
    print('customs kept (not formula-fit):',[r[0] for r in rows if 'kept' in r[2] and 'EV' not in r[2] and 'user' not in r[2]][:40])
else:
    for c in cs:
        c['price']=int(round(c['price']))
        for blk in ('breakdown','calc'):
            for k,v in (c.get(blk) or {}).items():
                if isinstance(v,float): c[blk][k]=int(round(v))
        for k,v in (c.get('breakdown') or {}).items(): c['breakdown'][k]=int(round(v))
    open(ROOT+'data/cars.json','w',encoding='utf-8').write(json.dumps(cs,ensure_ascii=False,indent=2))
    S['pricesUpdatedAt']=datetime.date.today().isoformat()
    open(ROOT+'data/settings.json','w',encoding='utf-8').write(json.dumps(S,ensure_ascii=False,indent=2))
