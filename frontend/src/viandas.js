/* ================================================================
   COMIDAS (antes "Viandas") — cuántas comidas necesita cada comedor, aproximado,
   según las fichadas del reloj (export de Movimientos). Solo personal GLD; Carrefour va aparte.
   · Dos comedores: NIC 2 = eventuales, fuera de convenio y los sectores FYV y NIC 3; NIC 1 = el resto.
   · Dos servicios: Almuerzo (turno Mañana) y Cena (turnos Tarde y Noche).
     El turno Intermedio come al mediodía, salvo los que se quedan a horas extras, que cenan:
     se reparte con el % habitual de intermedios que se van después de las 19 (mismo día de la semana).
   · Turno que ya figura en el archivo: los que ficharon. Turno que todavía no: con jornada × % de asistencia habitual.
   · Si todavía no se subió el export del día: promedio de los que ficharon los últimos mismos días de la semana.
   · No cuenta francos (reloj y eventuales asignados en Francos), vacaciones ni licencias.
   Se guarda solo el resumen (documento "viandas"): quien lo ve no recibe fichadas ni tardanzas.
   ================================================================ */
const VD_GR=['Mañana','Intermedio','Tarde','Noche'];
const VD_NIC=['NIC 1','NIC 2'];
const VD_QUEDA=19*60;   // intermedio que ficha después de esta hora: se quedó y cena
const vdGrupo=min=>min==null?null:min<9*60?'Mañana':min<12*60?'Intermedio':min<19*60?'Tarde':'Noche';
const vdGrTurno=t=>{ t=normTxt(t||''); return /MA.ANA/.test(t)?'Mañana':/INTERMED/.test(t)?'Intermedio':/TARDE/.test(t)?'Tarde':/NOCHE/.test(t)?'Noche':null; };
const vdNic=(tipo,sector)=>tipo==='EV'||tipo==='FC'||/FYV|NIC\s*3/.test(normTxt(sector||''))?'NIC 2':'NIC 1';
const vdStart=j=>{ const s=DB.shifts&&DB.shifts[j]; if(s&&s.start!=null) return s.start; return typeof guessStart==='function'?guessStart(j):null; };
const vdZ=()=>({e:0,f:0});
const vdUlt=(n,w)=>n===1?`el último ${DOWL[w]}`:`los últimos ${n} ${/s$/.test(DOWL[w])?DOWL[w]:DOWL[w]+'s'}`;   // "el último miércoles" / "los últimos 4 sábados"

function vdCalc(fname){
  const R=Object.values(DB.records||{}); if(!R.length) return null;
  const fecha=R.reduce((a,r)=>r.fecha>a?r.fecha:a,'');
  const nm={}; try{ nmRows().forEach(x=>nm[x.leg]=x); }catch(e){}
  const info=r=>{ const n=nm[nmLeg(r.legajo)]||{}, tipo=n.tipo||nmTipo(r.empresa||''); const st=vdStart(r.jornada), M=(r.marcas||[]).map(x=>+String(x).slice(1));
    const g=vdGrupo(st!=null?st:(M.length?Math.min(...M):null)); return {n,tipo,st,M,g,nic:vdNic(tipo,n.sector)}; };
  const incluye=t=>t==='EF'||t==='FC'||t==='EV'||!t;
  // hora de los datos: la del nombre del export ("Movimientos - 2026-11-17T145808…"), si no la de carga
  const fm=String(fname||'').match(/(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})/);
  const horaMin=fm&&fm[1]===fecha?(+fm[2])*60+(+fm[3]):(fecha===hoy()?new Date().getHours()*60+new Date().getMinutes():24*60);
  const dow=dObj(fecha).getDay(), desde=addD(fecha,-28);
  // historial de 4 semanas: asistencia por comedor y turno, intermedios que se quedan, promedio por día de la semana
  const hist={}, queda={}, PD={}, lastG={};
  for(const r of R){ if(r.fecha>=fecha||r.fecha<desde) continue; const x=info(r); if(!incluye(x.tipo)||!x.g) continue;
    const l=nmLeg(r.legajo); if(x.st!=null&&(!lastG[l]||lastG[l].f<r.fecha)) lastG[l]={f:r.fecha,g:x.g};
    if(r.status==='no_cubierto') continue;
    const mismo=dObj(r.fecha).getDay()===dow, k=x.nic+'|'+x.g;
    if(r.status!=='novedad'&&(x.st!=null||x.M.length)){ const h=hist[k]||(hist[k]={e:0,f:0,em:0,fm:0,d:new Set()}); h.e++; if(x.M.length) h.f++; if(mismo){ h.em++; if(x.M.length) h.fm++; h.d.add(r.fecha); } }
    if(x.M.length){ const d=PD[r.fecha]||(PD[r.fecha]={}); d[k]=(d[k]||0)+1;
      if(x.g==='Intermedio'){ const w=dObj(r.fecha).getDay(), q=queda[x.nic+'|'+w]||(queda[x.nic+'|'+w]={n:0,s:0}); q.n++; if(Math.max(...x.M)>=VD_QUEDA) q.s++; } } }
  const tasa=(nic,g)=>{ const h=hist[nic+'|'+g]; if(!h) return .92; if(h.d.size>=2&&h.em) return h.fm/h.em; return h.e?h.f/h.e:.92; };
  // % de intermedios que se quedan a cenar, por comedor y día de la semana
  const pQueda={}; for(const nic of VD_NIC){ pQueda[nic]={}; for(let w=0;w<7;w++){ const q=queda[nic+'|'+w]; pQueda[nic][w]=q&&q.n>=5?Math.round(q.s/q.n*100)/100:null; }
    const tot=Object.keys(queda).filter(k=>k.startsWith(nic+'|')).reduce((a,k)=>({n:a.n+queda[k].n,s:a.s+queda[k].s}),{n:0,s:0}); pQueda[nic].all=tot.n?Math.round(tot.s/tot.n*100)/100:0; }
  // promedio de los que ficharon por día de la semana (para el día en curso sin export)
  // días anteriores: lo que de verdad comieron (ficharon) por comedor; el intermedio que fichó después de las 19 cenó
  const HD={}, hdDesde=addD(fecha,-60);
  for(const r of R){ if(r.fecha>fecha||r.fecha<hdDesde||r.status==='no_cubierto'||!(r.marcas||[]).length) continue; const x=info(r); if(!incluye(x.tipo)||!x.g) continue;
    const d=HD[r.fecha]||(HD[r.fecha]={}), o=d[x.nic]||(d[x.nic]={M:0,I:0,Iq:0,T:0,N:0});
    const k={Mañana:'M',Intermedio:'I',Tarde:'T',Noche:'N'}[x.g]; o[k]++; if(x.g==='Intermedio'&&Math.max(...x.M)>=VD_QUEDA) o.Iq++; }
  const proy={};
  for(const [f,d] of Object.entries(PD)){ const w=dObj(f).getDay(), P=proy[w]||(proy[w]={n:0,c:{}}); P.n++; for(const k in d) P.c[k]=(P.c[k]||0)+d[k]; }
  for(const w in proy){ const P=proy[w]; for(const k in P.c) P.c[k]=Math.round(P.c[k]/P.n); }
  // eventuales con franco asignado ese día (sección Francos)
  const frHoy=new Set(), frEv=[]; try{ FRE().forEach(e=>{ if(e.d&&e.d[fecha]==='F'&&!(e.ingreso&&fecha<e.ingreso)&&!(e.egreso&&fecha>e.egreso)){ frHoy.add(nmLeg(e.legajo)); frEv.push({n:e.nombre,s:normTxt(e.sector||''),t:normTxt(e.turno||''),l:nmLeg(e.legajo)}); } }); }catch(e){}
  { const fich=new Set(R.filter(r=>r.fecha===fecha&&(r.marcas||[]).length).map(r=>nmLeg(r.legajo))); frEv.forEach(x=>{ if(fich.has(x.l)) x.f=1; delete x.l; }); }
  frEv.sort((a,b)=>a.s.localeCompare(b.s,'es')||a.t.localeCompare(b.t,'es')||a.n.localeCompare(b.n,'es'));
  // el día del export
  const C={}, FR={}, st={};
  VD_NIC.forEach(n=>{ C[n]={}; VD_GR.forEach(g=>C[n][g]=vdZ()); FR[n]={r:0,e:0}; });
  for(const r of R){ if(r.fecha!==fecha) continue; const x=info(r); if(!incluye(x.tipo)) continue;
    if(x.st==null&&!x.M.length){ FR[x.nic].r++; continue; }                         // franco según el reloj
    if(!x.g) continue;
    if(!x.M.length&&frHoy.has(nmLeg(r.legajo))){ FR[x.nic].e++; continue; }        // franco asignado en Francos
    if(r.status==='novedad'&&!x.M.length) continue;                                 // vacaciones, licencia, enfermedad
    const c=C[x.nic][x.g]; c.e++; if(x.M.length) c.f++; if(x.st!=null&&(st[x.g]==null||x.st<st[x.g])) st[x.g]=x.st;
    const hk=x.st!=null?vdHm(x.st):(x.M.length?vdHm(Math.floor(Math.min(...x.M)/60)*60):'s/h'), h=(c.h||(c.h={}))[hk]||(c.h[hk]={e:0,f:0}); h.e++; if(x.M.length) h.f++; }
  const ini={}; VD_GR.forEach(g=>ini[g]=st[g]!=null&&horaMin>=st[g]+20);
  const p=nic=>{ const v=pQueda[nic][dow]; return v!=null?v:pQueda[nic].all; };
  const com={};
  for(const nic of VD_NIC){ const o={};
    VD_GR.forEach(g=>{ const c=C[nic][g], t=tasa(nic,g); o[g]={e:c.e,f:c.f,h:c.h||{},ini:ini[g],tasa:Math.round(t*100),n:ini[g]?c.f:Math.round(c.e*t)}; });
    const qi=Math.round(o.Intermedio.n*p(nic));
    com[nic]={t:o,pq:Math.round(p(nic)*100),intCena:qi,alm:o['Mañana'].n+o.Intermedio.n-qi,cen:o.Tarde.n+o.Noche.n+qi,fr:FR[nic]}; }
  return {v:2,fecha,at:new Date().toISOString(),file:fname||'',hora:horaMin<24*60?hhmm(horaMin):'',por:window.SRV&&SRV.user?SRV.user.nombre:'',
    com,pend:VD_GR.filter(g=>!ini[g]&&VD_NIC.some(n=>C[n][g].e)),frEv,proy,pQueda,hist:HD};
}
// se recalcula en cada carga única (si quien carga puede editar Comidas)
window.vdActualizar=function(fname){ try{ if(!canEditMod('viandas')) return false; const v=vdCalc(fname); if(!v) return false; v.cocina=(DB.viandas&&DB.viandas.cocina)||{}; DB.viandas=v;   /* el servidor conserva siempre su versión de cocina */ return true; }catch(e){ console.warn('comidas',e); return false; } };

// eventuales con franco asignado HOY (sección Francos)
function vdFrancosHoy(V){
  const H=hoy(); if(V.fecha===H&&V.frEv) return V.frEv;
  try{ return FRE().filter(e=>e.d&&e.d[H]==='F'&&!(e.ingreso&&H<e.ingreso)&&!(e.egreso&&H>e.egreso)).map(e=>({n:e.nombre,s:normTxt(e.sector||''),t:normTxt(e.turno||'')}))
    .sort((a,b)=>a.s.localeCompare(b.s,'es')||a.t.localeCompare(b.t,'es')||a.n.localeCompare(b.n,'es')); }catch(e){ return null; } }
// lo que se muestra es SIEMPRE el día en curso
function vdDia(V){
  const H=hoy(), w=dObj(H).getDay();
  if(V.fecha===H) return {modo:'hoy',com:V.com,pend:V.pend||[]};
  const P=V.proy&&V.proy[w]; if(!P||!P.n) return {modo:'viejo',com:V.com,pend:V.pend||[]};
  // promedio de los mismos días de la semana, menos los eventuales con franco asignado hoy (son de NIC 2)
  const FE=vdFrancosHoy(V)||[], menos={}; FE.forEach(x=>{ const g=vdGrTurno(x.t); if(g) menos[g]=(menos[g]||0)+1; });
  const com={};
  for(const nic of VD_NIC){ const o={};
    VD_GR.forEach(g=>{ const base=P.c[nic+'|'+g]||0, m=nic==='NIC 2'?Math.min(base,menos[g]||0):0; o[g]={n:base-m,base,m}; });
    const pq=(V.pQueda&&V.pQueda[nic])?(V.pQueda[nic][w]!=null?V.pQueda[nic][w]:V.pQueda[nic].all):0, qi=Math.round(o.Intermedio.n*pq);
    com[nic]={t:o,pq:Math.round(pq*100),intCena:qi,alm:o['Mañana'].n+o.Intermedio.n-qi,cen:o.Tarde.n+o.Noche.n+qi,fr:{r:0,e:nic==='NIC 2'?FE.length:0}}; }
  return {modo:'proy',com,n:P.n,pend:VD_GR};
}

// ficharon de cuántos, por turno y por horario de ingreso (ej. Mañana · 06:00 60/70 · 08:00 14/15)
const vdHm=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const VD_TL={Mañana:'TM',Intermedio:'TI',Tarde:'TT',Noche:'TN'};
function vdFich(t){
  const fil=VD_GR.filter(g=>t[g]&&t[g].e).map(g=>{ const x=t[g], hs=Object.entries(x.h||{}).sort((a,b)=>a[0].localeCompare(b[0]));
    const est=x.ini?`<b>${x.f}</b> de ${x.e}`:`<span class="cm-pend">todavía no ingresan</span> · ${x.e} con jornada`;
    return `<tr><td><b>${VD_TL[g]}</b> <span class="meta">${g}</span></td><td class="cm-hs">${hs.map(([h,v])=>`<span>${h==='s/h'?'sin horario':h+' hs'} <b>${x.ini?v.f+'/':''}${v.e}</b></span>`).join('')}</td><td class="num cm-fx">${x.ini?'Ficharon ':''}${est}</td></tr>`; }).join('');
  const ya=VD_GR.filter(g=>t[g]&&t[g].ini), F=ya.reduce((n,g)=>n+t[g].f,0), E=ya.reduce((n,g)=>n+t[g].e,0);
  return fil?`${E?`<div class="cm-ftot">Ficharon <b>${F}</b> de ${E} <span class="meta">· turnos que ya ingresaron (${ya.map(g=>VD_TL[g]).join(', ')})</span></div>`:''}<table class="cm-ft"><tbody>${fil}</tbody></table>`:'';
}
function vdHtml(V,compacto){
  if(!V.com) return '<div class="empty">Hay que volver a subir el export de Movimientos para ver las comidas por comedor.</div>';
  const D=vdDia(V), H=hoy(), w=dObj(H).getDay(), dia=`${DOWL[w]} ${dmy(H)}`, FE=vdFrancosHoy(V)||[];
  const tarj=nic=>{ const c=D.com[nic], t=c.t, fr=(c.fr.r||0)+(c.fr.e||0);
    const det=(g)=>t[g].n;
    return `<div class="cm-c"><div class="cm-nic">${nic}<small>${nic==='NIC 1'?'efectivos':'eventuales, fuera de convenio, FYV y NIC 3'}</small></div>
      <div class="cm-row"><div class="cm-s"><span>Almuerzo</span><b>${c.alm}</b><small>Mañana ${det('Mañana')} + Intermedio ${t.Intermedio.n-c.intCena}</small></div>
      <div class="cm-s"><span>Cena</span><b>${c.cen}</b><small>Tarde ${det('Tarde')} + Noche ${det('Noche')}${c.intCena?` + ${c.intCena} de intermedio (horas extras)`:''}</small></div></div>
      ${D.modo==='hoy'?vdFich(t):''}
      ${fr?`<div class="cm-fr">🏖 ${fr} de franco hoy, ya descontados</div>`:''}</div>`; };
  const pend=D.modo==='hoy'?D.pend:[];
  const nota=D.modo==='hoy'?(pend.length?`Turnos que todavía no figuran en el archivo: <b>${pend.join(', ')}</b> (estimados con su asistencia habitual).`:'Todos los turnos de hoy ya figuran en el archivo.')
    :D.modo==='proy'?`<b>Todavía no se subió el export de hoy</b>: se estima con el promedio de ${vdUlt(D.n,w)}.`
    :`<b>Todavía no se subió el export de hoy</b>: se muestran los datos del ${dmy(V.fecha)}.`;
  const head=`<div class="cm-head"><div><div class="vd-lab">Comidas aproximadas · ${D.modo==='viejo'?`${DOWL[dObj(V.fecha).getDay()]} ${dmy(V.fecha)}`:dia}</div>
      <div class="cm-tot">${D.com['NIC 1'].alm+D.com['NIC 2'].alm} <small>almuerzos</small> · ${D.com['NIC 1'].cen+D.com['NIC 2'].cen} <small>cenas</small></div></div></div>
    <div class="cm-g">${VD_NIC.map(tarj).join('')}</div>
    <div class="cm-info">📊 Aproximado según fichadas del reloj · solo personal GLD, <b>no incluye Carrefour</b>.<br>
      🕒 Último export: subido ${fmtAt(V.at)}${V.por?' por '+esc(V.por):''} · fichadas del ${dmy(V.fecha)}${V.hora?' hasta las '+V.hora:''}. ${nota}</div>`;
  if(compacto) return head;
  // detalle (desplegable)
  const fila=(nic)=>{ const c=D.com[nic]; return `<tr><td><b>${nic}</b></td>${VD_GR.map(g=>{ const x=c.t[g]; return `<td class="num"><b>${x.n}</b>${x.e!=null?` <span class="meta">(${x.ini?`ficharon ${x.f} de ${x.e}`:`${x.e} con jornada × ${x.tasa}%`})</span>`:x.m?` <span class="meta">(${x.base} − ${x.m} de franco)</span>`:''}</td>`; }).join('')}<td class="num">${c.pq}%</td></tr>`; };
  const grp=(()=>{ const G={}; FE.forEach(x=>{ const k=(x.s||'SIN SECTOR')+(x.t?' · '+x.t:''); (G[k]||(G[k]=[])).push(x); }); return Object.keys(G).map(k=>`<div><b>${esc(k)}</b> <span class="meta">(${G[k].length})</span><div>${G[k].map(x=>esc(x.n)+(x.f?' <small>(fichó)</small>':'')).join(' · ')}</div></div>`).join(''); })();
  const detalle=`<details class="card cm-det"><summary>Ver detalle por turno y francos</summary><div class="card-b">
    <div class="tscroll"><table class="nm-t"><thead><tr><th>Comedor</th>${VD_GR.map(g=>`<th class="num">${g}</th>`).join('')}<th class="num">Intermedio que cena</th></tr></thead><tbody>${VD_NIC.map(fila).join('')}</tbody></table></div>
    <p class="vd-nota">${D.modo==='proy'?`Promedio de los que ficharon ${vdUlt(D.n,w)}.`:'Turno que ya figura en el archivo: los que ficharon. Turno que todavía no: con jornada × % de asistencia habitual (mismo día de la semana, últimas 4 semanas).'}
      El intermedio almuerza; la columna "Intermedio que cena" es el % habitual que se queda a horas extras (ficha después de las 19) y pasa a la cena.
      No cuenta francos, vacaciones ni licencias.</p>
    ${FE.length?`<h4 style="margin:14px 0 6px">Eventuales con franco asignado hoy en Francos (${FE.length})</h4><div class="vd-fre">${grp}</div>`:''}
  </div></details>`;
  return head+detalle+vdHistHtml(V);
}
// ---- días anteriores: lo nuestro contra lo que contó la cocina (la diferencia es aprox. Carrefour)
let vdDiaSel='';
function vdHistHtml(V){
  const H=V.hist||{}, dias=Object.keys(H).filter(d=>d<hoy()).sort().reverse(); if(!dias.length) return '';
  if(!vdDiaSel||!H[vdDiaSel]) vdDiaSel=dias[0];
  const d=H[vdDiaSel], K=(V.cocina||{})[vdDiaSel]||{}, ed=!(window.SRV&&SRV.mode==='online')||(!!SRV.can&&SRV.can('viandas')&&!SRV.imp), parcial=vdDiaSel===V.fecha;   // quien ve Comidas puede anotar lo que contó la cocina
  const z={M:0,I:0,Iq:0,T:0,N:0}, srv=(nic,c)=>{ const o=d[nic]||z; return c==='alm'?{n:o.M+o.I-o.Iq,t:`Mañana ${o.M} + Intermedio ${o.I-o.Iq}`}:{n:o.T+o.N+o.Iq,t:`Tarde ${o.T} + Noche ${o.N}${o.Iq?` + ${o.Iq} intermedio (horas extras)`:''}`}; };
  const fila=(nic,c)=>{ const x=srv(nic,c), k=K[nic+'|'+c], dif=k!=null&&k!==''?(+k)-x.n:null;
    return `<tr><td><b>${nic}</b></td><td>${c==='alm'?'Almuerzo (TM)':'Cena (TN)'}</td><td class="num"><b>${x.n}</b><div class="meta">${x.t}</div></td>
      <td class="num">${ed?`<input type="number" min="0" class="cm-k" data-cmk="${nic}|${c}" value="${k!=null?esc(String(k)):''}" placeholder="—">`:(k!=null&&k!==''?`<b>${esc(String(k))}</b>`:'—')}</td>
      <td class="num">${dif==null?'':`<b class="${dif<0?'cm-neg':''}">${dif>0?'+':''}${dif}</b>`}</td></tr>`; };
  return `<div class="card" style="margin-top:14px"><div class="card-h"><h3>Días anteriores · lo que comió nuestro personal</h3>
    <select id="cm-dia">${dias.map(x=>`<option value="${x}"${x===vdDiaSel?' selected':''}>${DOWL[dObj(x).getDay()]} ${dmy(x)}</option>`).join('')}</select></div>
    <div class="card-b flush"><div class="tscroll"><table class="nm-t"><thead><tr><th>Comedor</th><th>Servicio</th><th class="num">Nuestro (ficharon)</th><th class="num">Contó la cocina</th><th class="num">Diferencia</th></tr></thead><tbody>
    ${VD_NIC.map(n=>fila(n,'alm')+fila(n,'cen')).join('')}</tbody></table></div>
    <p class="vd-nota" style="padding:0 16px 12px">Cuenta a los que ficharon ese día (personal GLD). El intermedio que fichó después de las 19 se cuenta en la cena.${parcial?` <b>Ojo:</b> el último export es del ${dmy(V.fecha)}${V.hora?' a las '+V.hora:''}, así que ese día puede estar incompleto (sobre todo la cena).`:''}${ed?' Anotá lo que contó la cocina: queda guardado y la diferencia se calcula sola.':''} Diferencia = lo que contó la cocina − los que ficharon. Puede ser personal de Carrefour, visitas, viandas extra o un error de conteo: sirve para ir ajustando el número.</p></div></div>`;
}
document.addEventListener('change',async e=>{
  if(e.target.id==='cm-dia'){ vdDiaSel=e.target.value; renderViandas(); }
  const k=e.target.dataset&&e.target.dataset.cmk; if(k&&DB.viandas){ const V=DB.viandas, val=e.target.value;
    if(window.SRV&&SRV.mode==='online'){ try{ const r=await fetch('/api/comidas/cocina',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({fecha:vdDiaSel,clave:k,valor:val})});
        const j=await r.json().catch(()=>({})); if(!r.ok){ App.toast(j.detail||'No se pudo guardar',true); return; } V.cocina=j.cocina||{}; App.toast('Guardado lo que contó la cocina'); }catch(x){ App.toast('No se pudo guardar: sin conexión',true); return; } }
    else { V.cocina=V.cocina||{}; const o=V.cocina[vdDiaSel]||(V.cocina[vdDiaSel]={}); if(val==='') delete o[k]; else o[k]=Math.max(0,Math.round(+val)); await persist(); }
    renderViandas(); }
});
// ---- vacaciones por semana (sin nombres), para que la cocina sepa cuánta gente falta
let vdVac=null, vdVacAt=0;
async function vdVacCargar(){ if(!(window.SRV&&SRV.mode==='online')) return; if(Date.now()-vdVacAt<5*60e3&&vdVac) return; vdVacAt=Date.now();
  try{ const r=await fetch('/api/vacaciones/semanas',{credentials:'same-origin'}); if(r.ok){ vdVac=await r.json(); const el=$('#cm-vac'); if(el) el.innerHTML=vdVacHtml(); } }catch(e){} }
function vdVacHtml(){
  const V=vdVac; if(!V) return '<div class="meta" style="padding:12px 16px">Cargando vacaciones…</div>';
  // simple: por semana (lunes a domingo), cuántas personas están de vacaciones esa semana y cuántas empiezan esa semana
  const nic=c=>`NIC 1: ${c['NIC 1']} · NIC 2: ${c['NIC 2']}`;
  const lab=i=>i===0?'Esta semana':i===1?'Semana que viene':`En ${i} semanas`;
  const S=V.semanas||[], a=S[0], b=S[1];
  return `<div class="cm-vk">
      ${a?`<div><span>Esta semana · ${dmy(a.desde).slice(0,5)} al ${dmy(a.hasta).slice(0,5)}</span><b>${a.de_vacaciones.total}</b><small>de vacaciones · ${nic(a.de_vacaciones)}</small></div>`:''}
      ${b?`<div class="hl"><span>Semana que viene · ${dmy(b.desde).slice(0,5)} al ${dmy(b.hasta).slice(0,5)}</span><b>${b.de_vacaciones.total}</b><small>de vacaciones · ${nic(b.de_vacaciones)}</small></div>`:''}
    </div>
    <div class="tscroll"><table class="nm-t"><thead><tr><th>Semana</th><th>Lunes a domingo</th><th class="num">De vacaciones</th><th class="num">NIC 1</th><th class="num">NIC 2</th><th class="num">Empiezan esa semana</th></tr></thead><tbody>
    ${S.map((s,i)=>`<tr${i===1?' class="cm-sel"':''}><td><b>${lab(i)}</b></td><td class="mono">${dmy(s.desde).slice(0,5)} al ${dmy(s.hasta).slice(0,5)}</td><td class="num"><b>${s.de_vacaciones.total}</b></td><td class="num">${s.de_vacaciones['NIC 1']}</td><td class="num">${s.de_vacaciones['NIC 2']}</td><td class="num">${s.salen.total}</td></tr>`).join('')}</tbody></table></div>
    <p class="vd-nota" style="padding:0 16px 12px">Cantidad de personas de vacaciones en cada semana, sin nombres (plan de vacaciones y solicitudes aprobadas). "Empiezan esa semana" son las que salen de vacaciones esa semana; ya están incluidas en el total.</p>`;
}
function renderViandas(){
  const el=$('#vd-body'); if(!el) return; const V=DB.viandas;
  el.innerHTML=(V?vdHtml(V,false):'<div class="empty">Todavía no hay datos: las comidas aparecen cuando se sube el export de Movimientos.</div>')+
    `<div class="card" style="margin-top:14px"><div class="card-h"><h3>🏖 Vacaciones por semana</h3><span class="meta">para planificar la cocina</span></div><div class="card-b flush" id="cm-vac">${vdVacHtml()}</div></div>`;
  vdVacCargar();
}
function renderViandasHome(){
  const el=$('#h-viandas'); if(!el) return;
  el.style.display='none'; return;   // Comidas no se muestra en Inicio: solo en su sección
  el.style.display=''; el.innerHTML=`<div class="card vd-home"><div class="card-b">${vdHtml(V,true)}<div style="margin-top:8px"><button class="btn ghost sm" data-go="v-viandas">Ver detalle →</button></div></div></div>`;
}
const _ovVd=App.onView; App.onView=(id,f)=>{ _ovVd(id,f); if(id==='v-viandas') renderViandas(); if(id==='v-home') renderViandasHome(); };
const _rfVd=App.refresh; App.refresh=()=>{ _rfVd(); requestAnimationFrame(()=>{ try{ renderViandasHome(); if($('#v-viandas')&&$('#v-viandas').classList.contains('on')&&!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#v-viandas'))) renderViandas(); }catch(e){} }); };
document.addEventListener('click',e=>{ const g=e.target.closest('#h-viandas [data-go]'); if(g) goView(g.dataset.go); });
try{ renderViandasHome(); }catch(e){}
