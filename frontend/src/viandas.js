/* ================================================================
   ESTIMATIVO DE VIANDAS — se calcula con cada carga de fichadas (export de Movimientos)
   · Por grupo de horario según la jornada de hoy: Mañana, Intermedio, Tarde, Noche.
   · Incluye efectivos, fuera de convenio y eventuales. No cuenta francos, vacaciones ni licencias.
   · Turno ya ingresado: los que ficharon. Turno por entrar: con jornada × % de asistencia habitual.
   Se guarda solo el resumen (documento "viandas"): quien lo ve no recibe fichadas ni tardanzas.
   ================================================================ */
const VD_GR=[{k:'Mañana',ped:'08:30',c:'Almuerzo'},{k:'Intermedio',ped:'10:30',c:'Almuerzo'},{k:'Tarde',ped:'15:30',c:'Cena'},{k:'Noche',ped:'15:30',c:'Cena'}];
const vdGrupo=min=>min==null?null:min<9*60?'Mañana':min<12*60?'Intermedio':min<19*60?'Tarde':'Noche';
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
  const tasa=g=>{ const h=hist[g]; if(!h) return .92; if(h.d.size>=2&&h.em) return h.fm/h.em; return h.e?h.f/h.e:.92; };
  // francos planificados de eventuales para ese día (sección Francos): no comen salvo que igual fichen
  const frHoy=new Set(), frEv=[]; try{ FRE().forEach(e=>{ if(e.d&&e.d[fecha]==='F'&&!(e.ingreso&&fecha<e.ingreso)&&!(e.egreso&&fecha>e.egreso)){ frHoy.add(nmLeg(e.legajo)); frEv.push({n:e.nombre,s:normTxt(e.sector||''),t:normTxt(e.turno||''),l:nmLeg(e.legajo)}); } }); }catch(e){}
  { const fich=new Set(R.filter(r=>r.fecha===fecha&&(r.marcas||[]).length).map(r=>nmLeg(r.legajo))); frEv.forEach(x=>{ if(fich.has(x.l)) x.f=1; delete x.l; }); }   // los que igual ficharon se cuentan en las viandas
  frEv.sort((a,b)=>a.s.localeCompare(b.s,'es')||a.t.localeCompare(b.t,'es')||a.n.localeCompare(b.n,'es'));
  let nFr=0, nFrR=0;
  const G={}, S={};
  for(const r of R){ if(r.fecha!==fecha) continue; const x=info(r); if(!incluye(x.tipo)) continue;
    const franco=x.st==null&&!x.M.length; if(franco){ nFrR++; continue; }
    if(!x.g) continue;
    if(!x.M.length&&frHoy.has(nmLeg(r.legajo))){ nFr++; continue; }   // franco asignado en Francos
    const nov=r.status==='novedad'&&!x.M.length; if(nov) continue;           // vacaciones, licencia, enfermedad: no viene
    const g=G[x.g]||(G[x.g]={e:0,f:0,st:x.st}); g.e++; if(x.M.length) g.f++; if(x.st!=null&&(g.st==null||x.st<g.st)) g.st=x.st;
    const s=S[x.sector]||(S[x.sector]={}); const sg=s[x.g]||(s[x.g]={e:0,f:0}); sg.e++; if(x.M.length) sg.f++; }
  const grupos=VD_GR.filter(v=>G[v.k]).map(v=>{ const g=G[v.k], ini=g.st!=null&&horaMin>=g.st+20, t=tasa(v.k);
    return {k:v.k,ped:v.ped,com:v.c,e:g.e,f:g.f,ini,tasa:Math.round(t*100),est:ini?g.f:Math.round(g.e*t)}; });
  const est={}; grupos.forEach(g=>est[g.k]=g);
  const sectores=Object.entries(S).map(([s,o])=>{ const fila={s,tot:0,t:{}}; Object.entries(o).forEach(([k,v])=>{ const g=est[k]; const n=g&&g.ini?v.f:Math.round(v.e*(g?g.tasa/100:.92)); fila.t[k]={e:v.e,f:v.f,n}; fila.tot+=n; }); return fila; })
    .sort((a,b)=>b.tot-a.tot||a.s.localeCompare(b.s,'es'));
  return {fecha,at:new Date().toISOString(),file:fname||'',hora:horaMin<24*60?hhmm(horaMin):'',por:window.SRV&&SRV.user?SRV.user.nombre:'',grupos,sectores,nFr,nFrR,frEv,comidas:['Almuerzo','Cena'].map(c=>({c,n:grupos.filter(g=>(VD_GR.find(v=>v.k===g.k)||{}).c===c).reduce((a,g)=>a+g.est,0),g:grupos.filter(g=>(VD_GR.find(v=>v.k===g.k)||{}).c===c).map(g=>g.k)})).filter(x=>x.g.length),total:grupos.reduce((a,g)=>a+g.est,0)};
}
// se recalcula en cada carga única (si quien carga puede editar Viandas)
window.vdActualizar=function(fname){ try{ if(!canEditMod('viandas')) return false; const v=vdCalc(fname); if(!v) return false; DB.viandas=v; return true; }catch(e){ console.warn('viandas',e); return false; } };

function vdHtml(V,compacto){
  const viejo=V.fecha!==hoy();
  const aviso=`<div class="vd-aviso">📊 <b>Número estimativo según fichadas.</b> Se analiza el personal <b>GLD</b>: efectivos, fuera de convenio y eventuales.
    <span class="vd-fr">🏖 Con franco según el reloj: <b>${V.nFrR||0}</b></span>
    ${V.frEv?(()=>{ const f=V.frEv.filter(x=>x.f).length; return `<span class="vd-fr">👷 Eventuales con franco asignado en Francos (${dmy(V.fecha)}): <b>${V.frEv.length}</b> <small>${f?`· no se cuentan en las viandas, salvo ${f} que igual fich${f===1?"ó":"aron"}`:'· no se cuentan en las viandas'}</small></span>`; })()
      :(V.nFr?`<span class="vd-fr">👷 Eventuales con franco asignado en Francos: <b>${V.nFr}</b></span>`:'')}</div>`;
  const com=(V.comidas||[]).map(c=>`<div class="vd-com"><span>${esc(c.c)}</span><b>${c.n}</b><small>${esc(c.g.join(' + '))}${c.c==='Cena'?' · pedido ~15:30':' · pedidos ~08:30 / ~10:30'}</small></div>`).join('');
  const head=aviso+`<div class="vd-top"><div><div class="vd-lab">Viandas estimadas · ${DOWL[dObj(V.fecha).getDay()]} ${dmy(V.fecha)}</div><div class="vd-tot">${V.total}</div></div>${com?`<div class="vd-coms">${com}</div>`:''}
    <div class="vd-src${viejo?' w':''}">${viejo?`⚠ Son datos del ${dmy(V.fecha)}: falta cargar el export de hoy.<br>`:''}Fichadas del export${V.hora?` de las <b>${V.hora}</b>`:''} · actualizado ${fmtAt(V.at)}${V.por?' · '+esc(V.por):''}</div></div>`;
  const cards=`<div class="vd-g">${V.grupos.map(g=>`<div class="vd-c${g.ini?' ok':''}"><div class="vd-ct"><b>${esc(g.k)}</b><span>${esc(g.com||'')}${g.ped?` · pedido ~${g.ped}`:''}</span></div>
    <div class="vd-n">${g.est}</div>
    <div class="vd-d">${g.ini?`Ficharon <b>${g.f}</b> de ${g.e} con jornada · ${g.e?Math.round(g.f/g.e*100):0}%`:`Todavía no ingresó · ${g.e} con jornada × ${g.tasa}% habitual`}</div>
    <div class="vd-bar"><i style="width:${g.e?Math.min(100,g.f/g.e*100):0}%"></i></div></div>`).join('')}</div>`;
  if(compacto) return head+cards;
  const gs=V.grupos.map(g=>g.k);
  const tabla=`<div class="card" style="margin-top:14px"><div class="card-h"><h3>Por sector y turno</h3><span class="meta">viandas estimadas (ficharon / con jornada)</span></div><div class="card-b flush"><div class="tscroll"><table class="nm-t">
    <thead><tr><th>Sector</th>${gs.map(k=>`<th class="num">${esc(k)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>`+
    V.sectores.map(s=>`<tr><td><b>${esc(s.s)}</b></td>${gs.map(k=>{ const c=s.t[k]; return `<td class="num">${c?`<b>${c.n}</b> <span class="meta">(${c.f}/${c.e})</span>`:''}</td>`; }).join('')}<td class="num"><b>${s.tot}</b></td></tr>`).join('')+
    `<tr class="tot"><td>Total</td>${V.grupos.map(g=>`<td class="num">${g.est}</td>`).join('')}<td class="num">${V.total}</td></tr></tbody></table></div></div></div>`;
  const fe=V.frEv&&V.frEv.length?`<div class="card" style="margin-top:14px"><div class="card-h"><h3>Eventuales con franco asignado · ${dmy(V.fecha)}</h3><span class="meta">${V.frEv.length} persona(s), según la sección Francos</span></div><div class="card-b"><div class="vd-fre">${(()=>{ const G={}; V.frEv.forEach(x=>{ const k=(x.s||'SIN SECTOR')+(x.t?' · '+x.t:''); (G[k]||(G[k]=[])).push(x); }); return Object.keys(G).map(k=>`<div><b>${esc(k)}</b> <span class="meta">(${G[k].length})</span><div>${G[k].map(x=>esc(x.n)+(x.f?' <small>(fichó)</small>':'')).join(' · ')}</div></div>`).join(''); })()}</div></div></div>`:'';
  return head+cards+tabla+fe+`<p class="vd-nota">Incluye efectivos, fuera de convenio y eventuales con jornada hoy; no cuenta francos (los del reloj y los asignados a eventuales en Francos${V.nFr?`: hoy ${V.nFr}`:''}), vacaciones ni licencias. El turno que ya ingresó cuenta a los que ficharon; el que todavía no ingresó se estima con su % de asistencia habitual (mismo día de la semana de las últimas 4 semanas). Se actualiza cada vez que se carga un export de Movimientos.</p>`;
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
