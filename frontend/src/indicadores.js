// ===================== TABLERO DE INDICADORES (mes a mes) =====================
// Salud, ausentismo y dotación salen de los Movimientos del reloj (Ausentismo por motivo);
// llegadas tarde y medidas, de las fichadas (Llegadas tarde); bajas e ingresos, de Nómina y Eventuales;
// lo de liquidación, del resumen que se guarda al cargar las novedades en el F3.
// Cada mes es un período de liquidación (ver ixPer).
let IX={sel:'',f3:{},metas:{},puedeMetas:false,cargado:false,editMetas:false};
const IX_MES=m=>`${MESES_N[+m.slice(5)-1]} ${m.slice(0,4)}`.toLowerCase();
const IX_MESC=m=>`${MESES_N[+m.slice(5)-1].slice(0,3).toLowerCase()} ${m.slice(2,4)}`;
const IX_NOCONT=new Set(['Enfermedad','Ausencia c/aviso de enfermedad','Licencia ART']);
const ixNum=(v,d=0)=>v==null||!isFinite(v)?'—':Number(v).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
const ixMesAnt=m=>{ const d=new Date(+m.slice(0,4),+m.slice(5)-2,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
// Los meses son períodos de liquidación: efectivos y fuera de convenio del 16 al 15; eventuales del 23 al 22.
// Ej. noviembre = efectivos y FC 16/10 al 15/11 · eventuales 23/10 al 22/11.
const IX_CORTE={EV:23,EF:16,FC:16};
function ixPer(f,t){ if(!f||f.length<10) return ''; let y=+f.slice(0,4), m=+f.slice(5,7); const d=+f.slice(8,10);
  if(d>=(IX_CORTE[t]||16)){ m++; if(m>12){ m=1; y++; } } return `${y}-${String(m).padStart(2,'0')}`; }
function ixRango(m,t){ const c=IX_CORTE[t]||16, a=new Date(+m.slice(0,4),+m.slice(5)-2,c), b=new Date(+m.slice(0,4),+m.slice(5)-1,c-1);
  const f=d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; return `${f(a)} al ${f(b)}`; }
const ixHoyM=()=>{ const d=new Date(); return ixPer(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,'EF'); };

// episodios (reposos / accidentes): días seguidos con el mismo tipo de motivo; un hueco de hasta 3 días (franco, finde) no corta
function ixEpisodios(ev,set,tp){
  const by={}; ev.forEach(e=>{ if(set.has(e[2])) (by[e[0]]||(by[e[0]]=[])).push(e[1]); });
  const ini={}, dias={};
  Object.entries(by).forEach(([l,fs])=>{ fs=[...new Set(fs)].sort(); let prev=null;
    fs.forEach(f=>{ const m=ixPer(f,tp(l)); dias[m]=(dias[m]||0)+1;
      if(!prev||(dObj(f)-dObj(prev))/864e5>4) ini[m]=(ini[m]||0)+1; prev=f; }); });
  return {ini,dias};
}

let IXC={k:'',M:null};
function ixCalc(){
  const A=DB.ausmot||null, recs=DB.records||{};
  const key=[JSON.stringify(((DB.sanc&&DB.sanc.items)||[]).map(s=>s.id+s.tipo+s.dias+s.fecha)),A&&A.at,A&&A.ev&&A.ev.length,Object.keys(recs).length,JSON.stringify(Object.keys(IX.f3)),(DB.ant&&DB.ant.at)||'',(DB.nomina&&DB.nomina.files||[]).length].join('|');
  if(IXC.k===key&&IXC.M) return IXC.M;
  const M={}; const g=m=>M[m]||(M[m]={m});
  // ---- dotación y ausentismo (Movimientos) ----
  // tipo de cada persona (define en qué período cae cada día)
  const TP={}; try{ nmRows().forEach(r=>{ TP[r.leg]=r.tipo; }); }catch(e){}
  if(A) Object.entries(A.emps||{}).forEach(([l,e])=>{ if(!TP[l]&&e.t) TP[l]=e.t; });
  ((DB.ant&&DB.ant.rows)||[]).forEach(r=>{ if(!TP[r.legajo]) TP[r.legajo]='EV'; });
  const tp=l=>TP[l]==='EV'?'EV':TP[l]==='FC'?'FC':'EF';
  if(A){
    // días programados, día por día, repartidos por período
    Object.entries(A.prog||{}).forEach(([l,o])=>{ const t=tp(l), cuenta={};
      Object.entries(o).forEach(([mc,n])=>{ if(!n) return; const str=((A.progD||{})[l]||{})[mc];
        if(str) for(let i=0;i<str.length;i++){ if(str[i]==='1'){ const k=ixPer(`${mc}-${String(i+1).padStart(2,'0')}`,t); cuenta[k]=(cuenta[k]||0)+1; } }
        else cuenta[mc]=(cuenta[mc]||0)+n; });
      Object.entries(cuenta).forEach(([m,n])=>{ const x=g(m); x.dot=(x.dot||0)+1; x.prog=(x.prog||0)+n; if(t==='EV') x.dotEV=(x.dotEV||0)+1; else x.dotEF=(x.dotEF||0)+1; }); });
    const vistos=new Set();
    (A.ev||[]).forEach(e=>{ const c=amCat(e[2]); if(c!=='aus') return; const k=e[0]+'|'+e[1]; if(vistos.has(k)) return; vistos.add(k);
      const x=g(ixPer(e[1],tp(e[0]))); if(IX_NOCONT.has(e[2])) x.dNC=(x.dNC||0)+1; else x.dC=(x.dC||0)+1;
      if(e[2]==='Ausencia sin aviso'){ x.sinav=(x.sinav||0)+1; (x._sinP||(x._sinP=new Set())).add(e[0]); }
      if(e[2]==='Suspensión') x.susp=(x.susp||0)+1; });
    (A.ev||[]).forEach(e=>{ const x=g(ixPer(e[1],tp(e[0]))); if(e[2]==='Permiso gremial') x.grem=(x.grem||0)+1; else if(e[2]==='Ausencia c/aviso de PG') x.gremAv=(x.gremAv||0)+1; });
    const E=ixEpisodios(A.ev||[],new Set(['Enfermedad','Ausencia c/aviso de enfermedad']),tp), R=ixEpisodios(A.ev||[],new Set(['Licencia ART']),tp);
    [...new Set(Object.keys(M).concat(Object.keys(E.dias),Object.keys(R.dias)))].forEach(m=>{ const x=g(m);
      x.rep=E.ini[m]||0; x.repD=E.dias[m]||0; x.art=R.ini[m]||0; x.artD=R.dias[m]||0;
      x.sinavP=x._sinP?x._sinP.size:0; delete x._sinP;
      if(x.prog){ x.ausc=(x.dC||0)/x.prog*100; x.ausnc=(x.dNC||0)/x.prog*100; } });
  }
  // ---- llegadas tarde y medidas (fichadas) ----
  try{
    const L=typeof lateRecs==='function'?lateRecs():Object.values(recs).filter(r=>r.status==='tarde');
    const per={};
    L.forEach(r=>{ const m=ixPer(r.fecha,tp(r.legajo)), x=g(m); x.tarde=(x.tarde||0)+1; x.tardeMin=(x.tardeMin||0)+(r.atraso||0);
      (per[m]||(per[m]=new Set())).add(r.legajo);
    });
    Object.entries(per).forEach(([m,s])=>g(m).tardeP=s.size);
    const dias={}; Object.values(recs).forEach(r=>{ const k=ixPer(r.fecha,'EF'); (dias[k]||(dias[k]=new Set())).add(r.fecha); });
    Object.entries(dias).forEach(([m,s])=>{ g(m).diasFich=s.size; });
  }catch(e){ console.warn('indicadores tarde',e); }
  // ---- medidas disciplinarias (registro de Sanciones) ----
  const sp={};
  ((DB.sanc&&DB.sanc.items)||[]).forEach(s=>{ const m=ixPer(s.fecha||'',tp(s.leg)); if(!m) return; const x=g(m);
    x.med=(x.med||0)+1; x['md_'+s.tipo]=(x['md_'+s.tipo]||0)+1; if(s.tipo==='sus') x.suspS=(x.suspS||0)+(+s.dias||0);
    (sp[m]||(sp[m]=new Set())).add(s.leg); });
  Object.entries(sp).forEach(([m,s])=>{ g(m).medP=s.size; });
  // ---- bajas e ingresos (Nómina + Eventuales) ----
  const altas={}, bajas={};
  const add=(o,f,leg,t)=>{ const k=ixPer(f||'',t); if(!k) return; (o[k]||(o[k]=new Map())).set(leg,t); };
  ((DB.ant&&DB.ant.rows)||[]).forEach(r=>{ add(altas,r.ingreso,r.legajo,'EV'); add(bajas,r.egreso,r.legajo,'EV'); });
  Object.entries((DB.nomina&&DB.nomina.emps)||{}).forEach(([lk,e])=>{ const l=e.leg||e.legajo||lk; const t=e.tipo==='EV'?'EV':e.tipo==='FC'?'FC':tp(l);
    add(altas,e.ingreso,l,t); add(bajas,e.egreso,l,t); });
  Object.keys(M).forEach(m=>{ const x=M[m], b=bajas[m], a=altas[m];
    x.bajas=b?b.size:0; x.bajasEV=b?[...b.values()].filter(t=>t==='EV').length:0; x.ing=a?a.size:0;
    if(x.dot) x.rot=x.bajas/x.dot*100; });
  // ---- liquidación (resumen de cada F3 generado) ----
  Object.entries(IX.f3||{}).forEach(([m,o0])=>{ const x=g(m), o=Object.fromEntries(Object.entries(o0).filter(([t])=>t!=='GRE')), G=o.GLD, T=Object.values(o);
    if(o0.GRE){ x.gremAp=o0.GRE.cant||0; x.gremApP=o0.GRE.personas||0; x.gremRec=o0.GRE.recup||0; }
    if(!T.length) return;
    if(G&&G.pres){ const p=G.pres, n=p.c100+p.c50+p.c0; x.presN=n; x.pres=n?(p.c100+p.c50)/n*100:null; x.pres100=p.c100; x.pres50=p.c50; x.pres0=p.c0; }
    const sum=rx=>T.reduce((a,s)=>a+Object.entries(s.tot||{}).filter(([k])=>rx.test(normTxt(k))).reduce((b,[,v])=>b+(+v||0),0),0);
    x.hx50=sum(/HORAS EXTRAS ?50/); x.hx100=sum(/HORAS EXTRAS ?100/); x.hx=x.hx50+x.hx100;
    x.vyc=sum(/VIATICOS/); x.com=sum(/COMIDA/); x.gremF3=sum(/LICENCIA GREMIAL/);
    x.f3tipos=Object.keys(o); x.f3n=T.reduce((a,s)=>a+(s.n||0),0); x.f3at=T.map(s=>s.at).sort().pop(); });
  // suspensiones: lo cargado en Sanciones; si no hay, lo de Movimientos; con datos del mes y nada cargado = sin días
  Object.values(M).forEach(x=>{ const hay=x.prog||x.diasFich;
    x.suspD=x.suspS!=null?x.suspS:x.susp!=null?x.susp:hay?0:null; x.suspF=x.suspS!=null?'san':x.susp!=null?'mov':'';
    if(x.med==null&&hay) x.med=0;
    x.gremT=x.prog?(x.grem||0)+(x.gremAv||0):(x.gremF3!=null||x.gremAp!=null)?(x.gremF3||0)+(x.gremAp||0):null; });
  // solo meses con algo de datos
  Object.keys(M).forEach(m=>{ if(!/^\d{4}-\d{2}$/.test(m)) delete M[m]; });
  IXC={k:key,M}; return M;
}

// ---- definición de indicadores ----
// mejor: 'baja' (menos es mejor), 'sube' (más es mejor) o null (informativo, sin semáforo)
const IX_BLQ=[
  {id:'dot',t:'Dotación y movimiento',ic:'<path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8"/>',sub:'Personas, rotación e ingresos',go:'v-nomina',kpi:'dot'},
  {id:'dis',t:'Disciplina y puntualidad',ic:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/>',sub:'Llegadas tarde, medidas y ausencias sin aviso',go:'v-ausentismo',kpi:'tarde'},
  {id:'aus',t:'Ausentismo y salud',ic:'<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 12 0V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3M8 15v1a6 6 0 0 0 12 0v-4"/><circle cx="20" cy="10" r="2"/>',sub:'Ausentismo, reposos y accidentes',go:'v-ausmot',kpi:'ausc'},
  {id:'liq',t:'Liquidación (F3)',ic:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',sub:'Presentismo, horas extras y viáticos',go:'v-f3',kpi:'pres'},
];
const IX_IND=[
  {k:'dot',b:'dot',t:'Dotación con jornada',u:'',mejor:null,sub:x=>x.dot?`${ixNum(x.dotEF)} efectivos y fuera de convenio · ${ixNum(x.dotEV)} eventuales`:''},
  {k:'bajas',b:'dot',t:'Bajas del mes',u:'',mejor:'baja',sub:x=>x.bajas?`${x.bajasEV} eventuales · ${x.bajas-x.bajasEV} efectivos`:'Según fecha de egreso en Nómina y Eventuales'},
  {k:'ing',b:'dot',t:'Ingresos del mes',u:'',mejor:null,sub:()=>'Según fecha de ingreso'},
  {k:'rot',b:'dot',t:'Rotación mensual',u:'%',d:1,mejor:'baja',sub:()=>'Bajas sobre dotación con jornada'},
  {k:'tarde',b:'dis',t:'Llegadas tarde',u:'',mejor:'baja',sub:x=>x.tarde?`${ixNum(x.tardeP)} personas · ${ixNum(x.tardeMin)} min en total`:''},
  {k:'med',b:'dis',t:'Medidas disciplinarias',u:'',mejor:'baja',cero:'Sin medidas',go:'v-sanc',sub:x=>x.med?`PE ${x.md_pe||0} · APE ${x.md_ape||0} · SUS ${x.md_sus||0} · ${x.medP} colab.`:'Se cargan en Sanciones'},
  {k:'sinav',b:'dis',t:'Ausencias sin aviso',u:'',mejor:'baja',sub:x=>x.sinav?`${ixNum(x.sinavP)} personas`:''},
  {k:'suspD',b:'dis',t:'Días de suspensión',u:'',mejor:'baja',cero:'Sin días',sub:x=>x.suspF==='san'?`Según Sanciones${x.susp?` · ${x.susp} en Movimientos`:''}`:x.suspF==='mov'?'Según Movimientos · no hay suspensiones cargadas en Sanciones':x.suspD===0?'No hay suspensiones en Movimientos ni en Sanciones':''},
  {k:'ausc',b:'aus',t:'Ausentismo controlable',u:'%',d:1,mejor:'baja',sub:x=>x.prog?`${ixNum(x.dC)} días de ausencia sobre ${ixNum(x.prog)} programados`:''},
  {k:'ausnc',b:'aus',t:'Ausentismo no controlable',u:'%',d:1,mejor:null,sub:x=>x.prog?`Enfermedad y ART · ${ixNum(x.dNC)} días`:''},
  {k:'rep',b:'aus',t:'Reposos médicos iniciados',u:'',mejor:'baja',sub:x=>`${ixNum(x.repD)} días de reposo en el mes`},
  {k:'art',b:'aus',t:'Accidentes laborales (ART)',u:'',mejor:'baja',sub:x=>`${ixNum(x.artD)} días de ART en el mes`},
  {k:'pres',b:'liq',t:'Cobran presentismo',u:'%',d:1,mejor:'sube',sub:x=>x.presN?`${x.pres100} al 100% · ${x.pres50} al 50% · ${x.pres0} sin presentismo`:'Efectivos · se completa al cargar las novedades en el F3'},
  {k:'pres0',b:'liq',t:'Pierden presentismo',u:'',mejor:'baja',sub:x=>x.presN?`de ${x.presN} efectivos liquidados`:'Efectivos · se completa al cargar las novedades en el F3'},
  {k:'hx',b:'liq',t:'Horas extras',u:'hs',mejor:'baja',sub:x=>x.f3tipos?`50%: ${ixNum(x.hx50)} · 100%: ${ixNum(x.hx100)}`:'Se completa al cargar las novedades en el F3'},
  {k:'gremT',b:'liq',t:'Permisos gremiales',u:'',mejor:null,cero:'Sin permisos',sub:x=>[x.gremF3?`${ixNum(x.gremF3)} pagados en el F3`:'',x.gremAp!=null?`${ixNum(x.gremAp)} pagados aparte${x.gremRec?` (${x.gremRec} recuperan presentismo)`:''}`:'',x.gremAv?`${ixNum(x.gremAv)} con aviso de PG sin goce`:''].filter(Boolean).join(' · ')||'Días de permiso gremial según Movimientos'},
  {k:'vyc',b:'liq',t:'Viáticos pagados',u:'',mejor:null,sub:x=>x.f3tipos?`${ixNum(x.com)} comidas · F3 ${x.f3tipos.map(t=>({GLD:'efectivos',EVE:'eventuales',FC:'fuera de convenio'}[t]||t)).join(', ')}`:'Se completa al cargar las novedades en el F3'},
];
// metas sugeridas (se cambian desde el tablero)
const IX_META_DEF={ausc:3,art:0};

const ixMeta=k=>k in (IX.metas||{})?IX.metas[k]:IX_META_DEF[k];
const ixVal=(x,k)=>x&&x[k]!=null&&isFinite(x[k])?x[k]:null;
function ixRef(I,M,m){ // meta, o promedio de los 6 meses anteriores con dato
  const meta=ixMeta(I.k);
  if(meta!=null) return {v:meta,tipo:'META'};
  const ms=Object.keys(M).filter(k=>k<m).sort().slice(-6).map(k=>ixVal(M[k],I.k)).filter(v=>v!=null);
  return ms.length>=2?{v:ms.reduce((a,b)=>a+b,0)/ms.length,tipo:'PROM'}:null;
}
function ixEstado(I,v,ref){ // 'ok' | 'at' | 'cr' | 'na'
  if(!I.mejor||v==null||!ref) return 'na';
  const r=ref.v, peor=I.mejor==='baja'?v>r:v<r; if(!peor) return 'ok';
  const tol=I.mejor==='baja'?(r===0?1:r*1.15):r*0.95;
  return (I.mejor==='baja'?v<=tol:v>=tol)?'at':'cr';
}
const IX_COL={ok:'#22c55e',at:'#f59e0b',cr:'#ef4444',na:'#94a3b8'};
const IX_RANK={na:0,ok:1,at:2,cr:3};

function ixCard(I,M,m,meses){
  const x=M[m]||{}, v=ixVal(x,I.k), ant=M[ixMesAnt(m)], va=ixVal(ant,I.k), ref=ixRef(I,M,m), st=ixEstado(I,v,ref);
  let delta='';
  if(v!=null&&va!=null&&!(v===0&&va===0)){ const dlt=v-va, sube=dlt>0, malo=I.mejor==='baja'?sube:I.mejor==='sube'?!sube:null;
    const pct=va?` (${sube?'+':''}${ixNum(dlt/va*100,0)}%)`:'';
    delta=dlt===0?`<span class="ix-dl">= igual que el mes anterior</span>`:`<span class="ix-dl ${malo==null?'':malo?'mal':'bien'}">${sube?'▲':'▼'} ${sube?'+':''}${ixNum(dlt,I.d||0)}${I.u==='%'?' %':''}${I.u==='%'?'':pct} vs mes anterior</span>`; }
  const serie=meses.filter(k=>k<=m).slice(-12), vals=serie.map(k=>ixVal(M[k],I.k)), mx=Math.max(1e-9,...vals.filter(v=>v!=null),ref?ref.v:0);
  const bars=serie.map((k,i)=>{ const vv=vals[i], h=vv==null?0:Math.max(3,vv/mx*100), last=k===m;
    return `<i class="ix-b${last?' last':''}${vv==null?' nd':''}" data-ixm="${k}" style="--h:${h}%;--d:${i*45}ms;${last?`--c:${IX_COL[st]}`:''}" title="${IX_MES(k)}: ${vv==null?'sin datos':ixNum(vv,I.d||0)+(I.u?' '+I.u:'')}"></i>`; }).join('');
  const refL=ref&&mx?`<b class="ix-ref" style="bottom:${Math.min(100,ref.v/mx*100)}%" title="${ref.tipo==='META'?'Meta':'Promedio de los meses anteriores'}: ${ixNum(ref.v,I.d||0)}"></b>`:'';
  return `<div class="ix-card"><div class="ix-ct"><span class="ix-dot" style="--c:${IX_COL[st]}"></span>${esc(I.t)}</div>
    <div class="ix-v" style="${st==='cr'||st==='at'?`color:${IX_COL[st]}`:''}">${v==null?'<span class="ix-nd">sin datos</span>':v===0&&I.cero?`<span class="ix-nd">${I.cero}</span>`:ixNum(v,I.d||0)}${v&&I.u?`<small>${I.u}</small>`:''}</div>
    <div class="ix-meta">${delta}${ref?`<span class="ix-mt">${ref.tipo}: ${ref.tipo==='META'&&I.mejor==='baja'&&ref.v>0?'≤ ':ref.tipo==='META'&&I.mejor==='sube'?'≥ ':''}${ixNum(ref.v,I.d||0)}${I.u==='%'?' %':''}</span>`:''}</div>
    <div class="ix-sub">${esc(I.sub(x)||'')}</div>
    <div class="ix-bars">${refL}${bars}</div></div>`;
}

async function ixCargar(force){
  if(IX.cargado&&!force) return;
  if(window.SRV&&SRV.mode==='online'){
    try{ const r=await fetch('/api/indicadores',{credentials:'same-origin'}); if(r.ok){ const j=await r.json(); IX.f3=j.f3||{}; IX.metas=j.metas||{}; IX.puedeMetas=!!j.puede_metas; } }catch(e){}
  } else IX.puedeMetas=true;
  IX.cargado=true; IXC.k='';
}

function renderIndic(){
  const el=$('#ix-body'); if(!el) return;
  const M=ixCalc(), meses=Object.keys(M).sort(), hoy=ixHoyM();
  if(!meses.length){ el.innerHTML='<div class="card"><div class="card-b muted">Todavía no hay datos: cargá los Movimientos en Ausentismo y las fichadas en Llegadas tarde.</div></div>'; return; }
  if(!IX.sel||!M[IX.sel]) IX.sel=meses.filter(m=>m<hoy).pop()||meses[meses.length-1];
  const m=IX.sel;
  const chips=meses.map(k=>`<button class="ix-chip${k===m?' on':''}" data-ixm="${k}">${k===hoy?'<span class="ix-cur"></span>':''}${IX_MESC(k)}${k===hoy?' <em>· curso</em>':''}</button>`).join('');
  // estado por bloque y alertas
  const est={}, alertas=[];
  IX_IND.forEach(I=>{ const x=M[m]||{}, v=ixVal(x,I.k), ref=ixRef(I,M,m), st=ixEstado(I,v,ref);
    if(IX_RANK[st]>IX_RANK[est[I.b]||'na']) est[I.b]=st;
    if(st==='cr'||st==='at'){ const va=ixVal(M[ixMesAnt(m)],I.k), b=IX_BLQ.find(q=>q.id===I.b);
      const dl=va!=null&&v===va?` · igual que ${IX_MES(ixMesAnt(m))}`:va!=null?` · ${v-va>=0?'+':''}${ixNum(v-va,I.d||0)}${va?` (${v-va>=0?'+':''}${ixNum((v-va)/va*100,0)}%)`:''} vs ${IX_MES(ixMesAnt(m))}`:'';
      alertas.push({st,t:`${I.t} ${ixNum(v,I.d||0)}${I.u==='%'?' %':I.u?' '+I.u:''}${dl} — ${st==='cr'?'crítico':'atención'} en ${b.t}.`}); } });
  alertas.sort((a,b)=>IX_RANK[b.st]-IX_RANK[a.st]);
  const blq=IX_BLQ.map(b=>{ const I=IX_IND.find(i=>i.k===b.kpi), st=est[b.id]||'na', v=ixVal(M[m],I.k), sk=ixEstado(I,v,ixRef(I,M,m));
    return `<button class="ix-blq" data-ixgo="${b.id}" style="--c:${IX_COL[st]}"><div class="ix-bt"><svg viewBox="0 0 24 24">${b.ic}</svg>${esc(b.t)}</div>
      <div class="ix-bv"><span class="ix-dot" style="--c:${IX_COL[st]}"></span><b style="${sk==='cr'||sk==='at'?`color:${IX_COL[sk]}`:''}">${v==null?'—':ixNum(v,I.d||0)}</b>${v!=null&&I.u?`<small>${I.u}</small>`:''}</div>
      <div class="ix-bl">${esc(I.t)}</div><div class="ix-bs">${esc(b.sub)}</div></button>`; }).join('');
  const secs=IX_BLQ.map(b=>`<div class="ix-sec" id="ix-s-${b.id}"><div class="ix-sh"><svg viewBox="0 0 24 24">${b.ic}</svg>${esc(b.t)}<button class="ix-go" data-ixmod="${b.go}">ver detalle →</button><span></span></div>
    <div class="ix-grid">${IX_IND.filter(i=>i.b===b.id).map(I=>ixCard(I,M,m,meses)).join('')}</div></div>`).join('');
  const metasEd=IX.editMetas?`<div class="card ix-metas"><div class="card-b"><b>Metas</b> <span class="muted">— vacío = se compara contra el promedio de los últimos meses</span>
    <div class="ix-mg">${IX_IND.filter(i=>i.mejor).map(I=>`<label>${esc(I.t)}<span>${I.mejor==='baja'?'≤':'≥'}</span><input type="number" step="any" data-ixmeta="${I.k}" value="${ixMeta(I.k)!=null?ixMeta(I.k):''}">${I.u?`<em>${I.u}</em>`:''}</label>`).join('')}</div>
    <div style="margin-top:10px;display:flex;gap:8px"><button class="btn primary" id="ix-msave">Guardar metas</button><button class="btn ghost" id="ix-mcan">Cancelar</button></div></div></div>`:'';
  const x=M[m]||{};
  const fuentes=[x.prog?'Movimientos':'',x.diasFich?`fichadas (${x.diasFich} días)`:'',x.f3tipos?`F3 cargado el ${dmy((x.f3at||'').slice(0,10))}`:''].filter(Boolean).join(' · ');
  el.innerHTML=`<div class="ix-mes"><span class="ix-ml">MES</span><div class="ix-chips">${chips}</div>${IX.puedeMetas?'<button class="btn ghost ix-mbtn" id="ix-medit">Metas</button>':''}</div>
    ${metasEd}
    <div class="ix-est">ESTADO DE ${IX_MES(m).toUpperCase()} <span>liquidación: efectivos y FC ${ixRango(m,'EF')} · eventuales ${ixRango(m,'EV')} · el semáforo de cada bloque es el peor de sus indicadores${fuentes?' · datos: '+esc(fuentes):''}</span></div>
    <div class="ix-blqs">${blq}</div>
    <div class="card ix-al"><div class="ix-alh"><span class="ix-alic"><svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01"/></svg></span><div><b>Alertas de ${IX_MES(m)}</b><small>del semáforo y de la variación contra el mes anterior</small></div></div>
      <div class="ix-all">${alertas.length?alertas.map(a=>`<div class="ix-a ${a.st}"><i>${a.st==='cr'?'⊗':'⚠'}</i>${esc(a.t)}</div>`).join(''):'<div class="ix-a ok"><i>✓</i>Ningún indicador en atención este mes.</div>'}</div></div>
    ${secs}`;
  // animación de las barras: arrancan en 0 y crecen
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.querySelectorAll('.ix-bars').forEach(b=>b.classList.add('in'))));
}

document.addEventListener('click',async e=>{
  const v=document.getElementById('v-indic'); if(!v||!v.contains(e.target)) return;
  const c=e.target.closest('[data-ixm]'); if(c){ IX.sel=c.dataset.ixm; renderIndic(); return; }
  const gb=e.target.closest('[data-ixgo]'); if(gb){ const s=document.getElementById('ix-s-'+gb.dataset.ixgo); if(s) s.scrollIntoView({behavior:'smooth',block:'start'}); return; }
  const go=e.target.closest('[data-ixmod]'); if(go){ goView(go.dataset.ixmod); return; }
  if(e.target.id==='ix-medit'){ IX.editMetas=!IX.editMetas; renderIndic(); return; }
  if(e.target.id==='ix-mcan'){ IX.editMetas=false; renderIndic(); return; }
  if(e.target.id==='ix-msave'){
    const metas={}; v.querySelectorAll('[data-ixmeta]').forEach(i=>{ metas[i.dataset.ixmeta]=i.value.trim()===''?null:+i.value; });
    try{ const r=await fetch('/api/indicadores/metas',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({metas})});
      if(!r.ok) throw new Error((await r.json().catch(()=>({}))).detail||'No se pudo guardar');
      const j=await r.json(); IX.metas=j.metas||{};
      IX.editMetas=false; IXC.k=''; renderIndic(); App.toast('Metas guardadas'); }catch(err){ App.toast(err.message,true); }
  }
});
const _ovIx=App.onView; App.onView=(id,f)=>{ _ovIx(id,f); if(id==='v-indic'){ renderIndic(); ixCargar(true).then(renderIndic); } };
