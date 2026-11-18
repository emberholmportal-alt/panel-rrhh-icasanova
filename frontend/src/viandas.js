/* ================================================================
   ESTIMATIVO DE VIANDAS — se calcula con cada carga de fichadas (export de Movimientos)
   · Por grupo de horario según la jornada de hoy: Mañana, Intermedio, Tarde, Noche.
   · Incluye efectivos, fuera de convenio y eventuales. No cuenta francos, vacaciones ni licencias.
   · Turno ya ingresado: los que ficharon. Turno por entrar: con jornada × % de asistencia habitual.
   Se guarda solo el resumen (documento "viandas"): quien lo ve no recibe fichadas ni tardanzas.
   ================================================================ */
const VD_GR=[{k:'Mañana',ped:'08:30',c:'Almuerzo'},{k:'Intermedio',ped:'10:30',c:'Almuerzo'},{k:'Tarde',ped:'15:30',c:'Cena'},{k:'Noche',ped:'15:30',c:'Cena'}];
const vdGrupo=min=>min==null?null:min<9*60?'Mañana':min<12*60?'Intermedio':min<19*60?'Tarde':'Noche';
// grupo de horario a partir del turno de la nómina o de Francos (para ubicar a quien está de franco y no tiene horario ese día)
const vdGrTurno=t=>{ t=normTxt(t||''); return /MA.ANA/.test(t)?'Mañana':/INTERMED/.test(t)?'Intermedio':/TARDE/.test(t)?'Tarde':/NOCHE/.test(t)?'Noche':null; };
const vdStart=j=>{ const s=DB.shifts&&DB.shifts[j]; if(s&&s.start!=null) return s.start; return typeof guessStart==='function'?guessStart(j):null; };

function vdCalc(fname){
  const R=Object.values(DB.records||{}); if(!R.length) return null;
  const fecha=R.reduce((a,r)=>r.fecha>a?r.fecha:a,'');
  const nm={}; try{ nmRows().forEach(x=>nm[x.leg]=x); }catch(e){}
  const info=r=>{ const n=nm[nmLeg(r.legajo)]||{}, tipo=n.tipo||nmTipo(r.empresa||''); const st=vdStart(r.jornada), M=(r.marcas||[]).map(x=>+String(x).slice(1));
    const g=vdGrupo(st!=null?st:(M.length?Math.min(...M):null)); return {n,tipo,st,M,g,sector:n.sector||'SIN SECTOR'}; };
  const incluye=t=>t==='EF'||t==='FC'||t==='EV'||!t;
  // hora de los datos: la del nombre del export ("Movimientos - 2026-11-17T145808…"), si no la de carga
  const fm=String(fname||'').match(/(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})/);
  const horaMin=fm&&fm[1]===fecha?(+fm[2])*60+(+fm[3]):(fecha===hoy()?new Date().getHours()*60+new Date().getMinutes():24*60);
  // % de asistencia habitual por grupo: últimos 28 días (mismo día de la semana si hay al menos 2)
  const dow=dObj(fecha).getDay(), desde=addD(fecha,-28), hist={};
  for(const r of R){ if(r.fecha>=fecha||r.fecha<desde||r.status==='novedad'||r.status==='no_cubierto') continue;
    const x=info(r); if(!x.g||!incluye(x.tipo)||(x.st==null&&!x.M.length)) continue;
    const mismo=dObj(r.fecha).getDay()===dow, h=hist[x.g]||(hist[x.g]={e:0,f:0,em:0,fm:0,d:new Set()});
    h.e++; if(x.M.length) h.f++; if(mismo){ h.em++; if(x.M.length) h.fm++; h.d.add(r.fecha); } }
  // promedio de los que ficharon por grupo y sector, por día de la semana (últimas 4 semanas): sirve para estimar el día en curso
  // cuando todavía no se cargó el export de ese día
  const PD={}, lastG={};   // lastG: grupo de horario más reciente de cada persona (para ubicar a los que hoy están de franco)
  for(const r of R){ if(r.fecha>=fecha||r.fecha<desde) continue; const x=info(r); if(!x.g||x.st==null) continue; const l=nmLeg(r.legajo); if(!lastG[l]||lastG[l].f<r.fecha) lastG[l]={f:r.fecha,g:x.g}; }
  for(const r of R){ if(r.fecha>=fecha||r.fecha<desde||r.status==='no_cubierto'||!(r.marcas||[]).length) continue; const x=info(r); if(!x.g||!incluye(x.tipo)) continue;
    const d=PD[r.fecha]||(PD[r.fecha]={g:{},s:{}}); d.g[x.g]=(d.g[x.g]||0)+1; const ss=d.s[x.sector]||(d.s[x.sector]={}); ss[x.g]=(ss[x.g]||0)+1; }
  const proy={};
  for(const [f,d] of Object.entries(PD)){ const w=dObj(f).getDay(), P=proy[w]||(proy[w]={n:0,g:{},s:{}}); P.n++;
    for(const k in d.g) P.g[k]=(P.g[k]||0)+d.g[k]; for(const sk in d.s){ const ss=P.s[sk]||(P.s[sk]={}); for(const k in d.s[sk]) ss[k]=(ss[k]||0)+d.s[sk][k]; } }
  for(const w in proy){ const P=proy[w]; for(const k in P.g) P.g[k]=Math.round(P.g[k]/P.n); for(const sk in P.s) for(const k in P.s[sk]) P.s[sk][k]=Math.round(P.s[sk][k]/P.n); }
  const tasa=g=>{ const h=hist[g]; if(!h) return .92; if(h.d.size>=2&&h.em) return h.fm/h.em; return h.e?h.f/h.e:.92; };
  // francos planificados de eventuales para ese día (sección Francos): no comen salvo que igual fichen
  const frHoy=new Set(), frEv=[]; try{ FRE().forEach(e=>{ if(e.d&&e.d[fecha]==='F'&&!(e.ingreso&&fecha<e.ingreso)&&!(e.egreso&&fecha>e.egreso)){ frHoy.add(nmLeg(e.legajo)); frEv.push({n:e.nombre,s:normTxt(e.sector||''),t:normTxt(e.turno||''),l:nmLeg(e.legajo)}); } }); }catch(e){}
  { const fich=new Set(R.filter(r=>r.fecha===fecha&&(r.marcas||[]).length).map(r=>nmLeg(r.legajo))); frEv.forEach(x=>{ if(fich.has(x.l)) x.f=1; delete x.l; }); }   // los que igual ficharon se cuentan en las viandas
  frEv.sort((a,b)=>a.s.localeCompare(b.s,'es')||a.t.localeCompare(b.t,'es')||a.n.localeCompare(b.n,'es'));
  let nFr=0, nFrR=0;
  const G={}, S={}, FG={};   // FG: francos por grupo {r: según el reloj, e: eventuales asignados en Francos}
  const fg=(g,k)=>{ g=g||'Sin turno'; const o=FG[g]||(FG[g]={r:0,e:0}); o[k]++; };
  for(const r of R){ if(r.fecha!==fecha) continue; const x=info(r); if(!incluye(x.tipo)) continue;
    const franco=x.st==null&&!x.M.length; if(franco){ nFrR++; fg(vdGrTurno(x.n.turno)||(lastG[nmLeg(r.legajo)]||{}).g,'r'); continue; }
    if(!x.g) continue;
    if(!x.M.length&&frHoy.has(nmLeg(r.legajo))){ nFr++; fg(x.g,'e'); continue; }   // franco asignado en Francos
    const nov=r.status==='novedad'&&!x.M.length; if(nov) continue;           // vacaciones, licencia, enfermedad: no viene
    const g=G[x.g]||(G[x.g]={e:0,f:0,st:x.st}); g.e++; if(x.M.length) g.f++; if(x.st!=null&&(g.st==null||x.st<g.st)) g.st=x.st;
    const s=S[x.sector]||(S[x.sector]={}); const sg=s[x.g]||(s[x.g]={e:0,f:0}); sg.e++; if(x.M.length) sg.f++; }
  const grupos=VD_GR.filter(v=>G[v.k]).map(v=>{ const g=G[v.k], ini=g.st!=null&&horaMin>=g.st+20, t=tasa(v.k);
    return {k:v.k,ped:v.ped,com:v.c,e:g.e,f:g.f,ini,tasa:Math.round(t*100),est:ini?g.f:Math.round(g.e*t)}; });
  const est={}; grupos.forEach(g=>est[g.k]=g);
  const sectores=Object.entries(S).map(([s,o])=>{ const fila={s,tot:0,t:{}}; Object.entries(o).forEach(([k,v])=>{ const g=est[k]; const n=g&&g.ini?v.f:Math.round(v.e*(g?g.tasa/100:.92)); fila.t[k]={e:v.e,f:v.f,n}; fila.tot+=n; }); return fila; })
    .sort((a,b)=>b.tot-a.tot||a.s.localeCompare(b.s,'es'));
  return {fecha,at:new Date().toISOString(),file:fname||'',hora:horaMin<24*60?hhmm(horaMin):'',por:window.SRV&&SRV.user?SRV.user.nombre:'',grupos,sectores,nFr,nFrR,frEv,proy,FG,comidas:['Almuerzo','Cena'].map(c=>({c,n:grupos.filter(g=>(VD_GR.find(v=>v.k===g.k)||{}).c===c).reduce((a,g)=>a+g.est,0),g:grupos.filter(g=>(VD_GR.find(v=>v.k===g.k)||{}).c===c).map(g=>g.k)})).filter(x=>x.g.length),total:grupos.reduce((a,g)=>a+g.est,0)};
}
// se recalcula en cada carga única (si quien carga puede editar Viandas)
window.vdActualizar=function(fname){ try{ if(!canEditMod('viandas')) return false; const v=vdCalc(fname); if(!v) return false; DB.viandas=v; return true; }catch(e){ console.warn('viandas',e); return false; } };

const vdCom=k=>(VD_GR.find(v=>v.k===k)||{}).c;
// lo que se muestra es SIEMPRE el día en curso: con el export de hoy, lo calculado; si el último export es de otro día,
// el promedio de los que ficharon los últimos mismos días de la semana
function vdDia(V){
  const H=hoy(); if(V.fecha===H) return Object.assign({},V,{modo:'hoy'});
  const P=V.proy&&V.proy[dObj(H).getDay()]; if(!P||!P.n) return Object.assign({},V,{modo:'viejo'});
  const grupos=VD_GR.filter(v=>P.g[v.k]).map(v=>({k:v.k,ped:v.ped,com:v.c,est:P.g[v.k],proy:true}));
  const sectores=Object.entries(P.s).map(([s,o])=>{ const t={}; let tot=0; for(const k in o){ t[k]={n:o[k]}; tot+=o[k]; } return {s,t,tot}; }).sort((a,b)=>b.tot-a.tot||a.s.localeCompare(b.s,'es'));
  return {modo:'proy',fecha:H,n:P.n,grupos,sectores,total:grupos.reduce((a,g)=>a+g.est,0),
    comidas:['Almuerzo','Cena'].map(c=>({c,n:grupos.filter(g=>vdCom(g.k)===c).reduce((a,g)=>a+g.est,0),g:grupos.filter(g=>vdCom(g.k)===c).map(g=>g.k)})).filter(x=>x.g.length)};
}
// eventuales con franco asignado HOY (sección Francos); con el export de hoy se marca quién igual fichó
function vdFrancosHoy(V){
  const H=hoy(); if(V.fecha===H&&V.frEv) return V.frEv;
  try{ return FRE().filter(e=>e.d&&e.d[H]==='F'&&!(e.ingreso&&H<e.ingreso)&&!(e.egreso&&H>e.egreso)).map(e=>({n:e.nombre,s:normTxt(e.sector||''),t:normTxt(e.turno||'')}))
    .sort((a,b)=>a.s.localeCompare(b.s,'es')||a.t.localeCompare(b.t,'es')||a.n.localeCompare(b.n,'es')); }catch(e){ return null; } }
function vdHtml(V,compacto){
  const D=vdDia(V), H=hoy(), dia=`${DOWL[dObj(H).getDay()]} ${dmy(H)}`, FE=vdFrancosHoy(V);
  const pend=D.modo==='hoy'?D.grupos.filter(g=>!g.ini).map(g=>g.k):[];
  // francos por grupo: con el export de hoy, los del reloj + eventuales asignados que no ficharon; sin export de hoy, los eventuales asignados hoy en Francos
  const FG=D.modo==='hoy'&&V.FG?V.FG:(()=>{ const o={}; (FE||[]).forEach(x=>{ const g=vdGrTurno(x.t)||'Sin turno'; (o[g]||(o[g]={r:0,e:0})).e++; }); return o; })();
  const frTot=Object.values(FG).reduce((a,o)=>a+o.r+o.e,0);
  const frTxt=g=>{ const o=FG[g]; if(!o||!(o.r+o.e)) return ''; return `<div class="vd-frg">🏖 <b>${o.r+o.e}</b> de franco, no suman${o.r&&o.e?` <small>(${o.r} reloj · ${o.e} eventuales asignados)</small>`:o.e?` <small>(eventuales asignados en Francos)</small>`:` <small>(según el reloj)</small>`}</div>`; };
  const lin=[
    `📊 <b>Números estimativos según las fichadas del reloj.</b> Se analiza el personal <b>GLD</b>: efectivos, fuera de convenio y eventuales.`,
    `🕒 Último export de Movimientos: subido el <b>${fmtAt(V.at)}</b>${V.por?' por '+esc(V.por):''} · trae fichadas del <b>${dmy(V.fecha)}</b>${V.hora?` hasta las <b>${V.hora}</b>`:''}.`,
    D.modo==='hoy'?(pend.length?`⏳ Turnos que todavía no figuran en ese archivo: <b>${pend.join(', ')}</b>. Se estiman con su % de asistencia habitual hasta que se suba un export posterior a su ingreso.`:`✅ Todos los turnos de hoy ya figuran en ese archivo.`)
      :D.modo==='proy'?`⏳ <b>Todavía no se subió el export de hoy</b>: ningún turno de hoy está considerado. Se estima con el promedio de los que ficharon los últimos ${D.n} ${DOWL[dObj(H).getDay()]}.`
      :`⚠ <b>Todavía no se subió el export de hoy</b> y no hay historial suficiente para estimarlo: se muestran los datos del ${dmy(V.fecha)}.`,
    D.modo==='hoy'?`🏖 Con franco según el reloj: <b>${V.nFrR||0}</b>`:'',
    FE?(()=>{ const f=FE.filter(x=>x.f).length; return `👷 Eventuales con franco asignado hoy en Francos: <b>${FE.length}</b> <small>· no se cuentan en las viandas${f?`, salvo ${f} que igual fich${f===1?'ó':'aron'}`:''}</small>`; })():''
  ].filter(Boolean);
  const aviso=`<div class="vd-aviso">${lin.map((t,i)=>i?`<span class="vd-fr">${t}</span>`:t).join('')}</div>`;
  const com=(D.comidas||[]).map(c=>`<div class="vd-com"><span>${esc(c.c)}</span><b>${c.n}</b><small>${esc(c.g.join(' + '))}${c.c==='Cena'?' · pedido ~15:30':' · pedidos ~08:30 / ~10:30'}</small></div>`).join('');
  const head=aviso+`<div class="vd-top"><div><div class="vd-lab">Viandas estimadas · ${D.modo==='viejo'?`${DOWL[dObj(V.fecha).getDay()]} ${dmy(V.fecha)}`:dia}</div><div class="vd-tot">${D.total}</div>${frTot?`<div class="vd-frt">Ya descontados: <b>${frTot}</b> de franco${D.modo==='hoy'?'':' (eventuales asignados hoy)'} · ${['Mañana','Intermedio','Tarde','Noche','Sin turno'].filter(g=>FG[g]&&(FG[g].r+FG[g].e)).map(g=>`${g} ${FG[g].r+FG[g].e}`).join(' · ')}</div>`:''}</div>${com?`<div class="vd-coms">${com}</div>`:''}</div>`;
  const cards=`<div class="vd-g">${D.grupos.map(g=>`<div class="vd-c${g.ini?' ok':''}"><div class="vd-ct"><b>${esc(g.k)}</b><span>${esc(g.com||'')}${g.ped?` · pedido ~${g.ped}`:''}</span></div>
    <div class="vd-n">${g.est}</div>
    <div class="vd-d">${g.proy?`Sin fichadas de hoy · promedio de los últimos ${D.n} ${DOWL[dObj(H).getDay()]}`:g.ini?`Ya ingresó · ficharon <b>${g.f}</b> de ${g.e} con jornada · ${g.e?Math.round(g.f/g.e*100):0}%`:`Todavía no figura en el archivo · ${g.e} con jornada × ${g.tasa}% habitual`}</div>
    ${frTxt(g.k)}
    ${g.proy?'':`<div class="vd-bar"><i style="width:${g.e?Math.min(100,g.f/g.e*100):0}%"></i></div>`}</div>`).join('')}</div>`;
  if(compacto) return head+cards;
  const gs=D.grupos.map(g=>g.k);
  const tabla=`<div class="card" style="margin-top:14px"><div class="card-h"><h3>Por sector y turno</h3><span class="meta">${D.modo==='proy'?'promedio de los últimos '+D.n+' '+DOWL[dObj(H).getDay()]:'viandas estimadas (ficharon / con jornada)'}</span></div><div class="card-b flush"><div class="tscroll"><table class="nm-t">
    <thead><tr><th>Sector</th>${gs.map(k=>`<th class="num">${esc(k)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>`+
    D.sectores.map(s=>`<tr><td><b>${esc(s.s)}</b></td>${gs.map(k=>{ const c=s.t[k]; return `<td class="num">${c?`<b>${c.n}</b>${c.e!=null?` <span class="meta">(${c.f}/${c.e})</span>`:''}`:''}</td>`; }).join('')}<td class="num"><b>${s.tot}</b></td></tr>`).join('')+
    `<tr class="tot"><td>Total</td>${D.grupos.map(g=>`<td class="num">${g.est}</td>`).join('')}<td class="num">${D.total}</td></tr></tbody></table></div></div></div>`;
  const fe=FE&&FE.length?`<div class="card" style="margin-top:14px"><div class="card-h"><h3>Eventuales con franco asignado · ${dia}</h3><span class="meta">${FE.length} persona(s), según la sección Francos</span></div><div class="card-b"><div class="vd-fre">${(()=>{ const G={}; FE.forEach(x=>{ const k=(x.s||'SIN SECTOR')+(x.t?' · '+x.t:''); (G[k]||(G[k]=[])).push(x); }); return Object.keys(G).map(k=>`<div><b>${esc(k)}</b> <span class="meta">(${G[k].length})</span><div>${G[k].map(x=>esc(x.n)+(x.f?' <small>(fichó)</small>':'')).join(' · ')}</div></div>`).join(''); })()}</div></div></div>`:'';
  return head+cards+tabla+fe+`<p class="vd-nota">Son números estimativos. Incluye efectivos, fuera de convenio y eventuales con jornada en el día; no cuenta francos (los del reloj y los asignados a eventuales en Francos), vacaciones ni licencias. El turno que ya figura en el archivo cuenta a los que ficharon; el que todavía no figura se estima con su % de asistencia habitual (mismo día de la semana de las últimas 4 semanas). Si todavía no se subió el export del día, se usa el promedio de los últimos mismos días de la semana. Se actualiza cada vez que se sube un export de Movimientos.</p>`;
}
function renderViandas(){
  const el=$('#vd-body'); if(!el) return; const V=DB.viandas;
  el.innerHTML=V?vdHtml(V,false):'<div class="empty">Todavía no hay datos: el estimativo aparece cuando se carga el export de Movimientos del día.</div>';
}
function renderViandasHome(){
  const el=$('#h-viandas'); if(!el) return; const ok=!(window.SRV&&SRV.mode==='online')||(SRV.can&&SRV.can('viandas'));
  const V=DB.viandas; if(!ok||!V){ el.style.display='none'; return; }
  el.style.display=''; el.innerHTML=`<div class="card vd-home"><div class="card-b">${vdHtml(V,true)}<div style="margin-top:8px"><button class="btn ghost sm" data-go="v-viandas">Ver por sector →</button></div></div></div>`;
}
const _ovVd=App.onView; App.onView=(id,f)=>{ _ovVd(id,f); if(id==='v-viandas') renderViandas(); if(id==='v-home') renderViandasHome(); };
const _rfVd=App.refresh; App.refresh=()=>{ _rfVd(); requestAnimationFrame(()=>{ try{ renderViandasHome(); if($('#v-viandas')&&$('#v-viandas').classList.contains('on')) renderViandas(); }catch(e){} }); };
document.addEventListener('click',e=>{ const g=e.target.closest('#h-viandas [data-go]'); if(g) goView(g.dataset.go); });
try{ renderViandasHome(); }catch(e){}
