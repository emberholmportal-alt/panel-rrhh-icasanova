/* ================================================================
   SOLICITUDES DE VACACIONES
   Coordinadores y supervisores cargan el pedido; RRHH lo aprueba o lo rechaza.
   Las aprobadas aparecen en Vacaciones (próximas salidas, quién está afuera, agenda).
   Solo funciona con el servidor: en modo archivo la sección no se muestra.
   ================================================================ */
const VS={items:[],aprueba:false,pide:false,ok:false,ver:-1,f:'pend',rech:''};
const VS_ANT=15;   // días de anticipación para pedir (RRHH carga sin ese límite)
const vsMin=()=>addD(hoy(),VS_ANT);
const vsOn=()=>!!(window.SRV&&SRV.mode==='online'&&SRV.api);
const VS_EST={pendiente:'Pendiente',aprobada:'Aprobada',rechazada:'Rechazada',cancelada:'Cancelada',anulada:'Anulada'};
async function vsLoad(){
  if(!vsOn()) return;
  try{ const r=await SRV.api('GET','/api/vacsol'); Object.assign(VS,{items:r.items||[],aprueba:!!r.aprueba,pide:!!r.pide,ver:r.version,ok:true}); }
  catch(e){ VS.ok=false; return; }
  vsMerge(); vsBadge(); if(typeof curView!=='undefined'&&curView==='v-vacaciones') renderVacsol();
  vsNovedades();
  try{ App.refresh(); }catch(e){}
}
// las aprobadas se suman al plan de vacaciones (si RRHH ya la cargó en el plan oficial, no se duplica)
// al entrar, quien pidió vacaciones ve las respuestas de RRHH que todavía no vio
let vsNovShown=false;
function vsNovedades(){
  if(vsNovShown||VS.aprueba||!VS.pide) return;
  const me=SRV.user.id, N=VS.items.filter(x=>x.uid===me&&!x.visto&&['aprobada','rechazada','anulada'].includes(x.estado)&&!x.directa);
  if(!N.length) return; vsNovShown=true;
  const show=()=>{ if(document.querySelector('#welcome.on')) return setTimeout(show,600);
    const m=document.createElement('div'); m.className='vs-modal';
    m.innerHTML=`<div class="vs-mbox"><h3>🔔 Novedades de tus pedidos de vacaciones</h3><div class="vs-nov">${N.map(x=>`<div class="vs-nv ${x.estado}"><i>${x.estado==='aprobada'?'✅':'❌'}</i><div><b>${x.estado==='aprobada'?'Aprobada':x.estado==='rechazada'?'Rechazada':'Anulada'}: ${esc(x.nombre)}</b><span>${dmy(x.desde)} al ${dmy(x.hasta)} · ${x.dias} día(s) · ${esc(x.rby||'RRHH')} · ${fmtAt(x.rat)}</span>${x.motivo?`<span>Motivo: ${esc(x.motivo)}</span>`:''}</div></div>`).join('')}</div>
      <div class="vs-mb"><button class="btn ghost" data-vsm="ver">Ver en Vacaciones</button><button class="btn primary" data-vsm="ok">Entendido</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click',async e=>{ const b=e.target.closest('[data-vsm]'); if(!b) return; m.remove();
      try{ await SRV.api('POST','/api/vacsol/visto',{ids:N.map(x=>x.id)}); N.forEach(x=>x.visto=true); }catch(err){}
      if(b.dataset.vsm==='ver'){ VS.f='todas'; goView('v-vacaciones'); } }); };
  setTimeout(show,1200);
}
function vsMerge(){
  const plan=(DB.vac&&DB.vac.rows)||[], ya=new Set(plan.map(r=>String(r.legajo)+'|'+r.desde));
  // datos del legajo (para la planilla de firma): del plan de vacaciones o de la lista de eventuales
  const ficha={}; plan.forEach(r=>{ if(!ficha[r.legajo]) ficha[r.legajo]=r; });
  try{ antRows().forEach(r=>{ if(!ficha[r.legajo]) ficha[r.legajo]={uo:r.uo,ingreso:r.ingreso,doc:r.doc,cat:'Eventual'}; }); }catch(e){}
  window.VACSOL_OK=VS.items.filter(x=>x.estado==='aprobada'&&!ya.has(String(x.legajo)+'|'+x.desde)).map(x=>{ const f=ficha[x.legajo]||{};
    return {legajo:x.legajo,nombre:x.nombre,uo:f.uo||'',cat:f.cat||'',ingreso:f.ingreso||'',doc:f.doc||'',sector:x.sector||f.sector||'',diasAno:f.diasAno||0,n:1,
      id:'sol|'+x.id,desde:x.desde,hasta:x.hasta,dias:x.dias,notif:'NO',fnotif:'',sol:true}; });
}
function vsBadge(n){
  const b=$('#nb-vacsol'); if(!b) return;
  if(n==null) n=VS.items.filter(x=>x.estado==='pendiente'&&(VS.aprueba||x.uid===SRV.user.id)).length;
  b.textContent=n||''; b.style.display=n?'':'none';
}
// empleados para elegir: nómina + plan de vacaciones + eventuales de francos
function vsEmps(){
  const m=new Map(), add=(leg,nombre,sector,turno)=>{ leg=String(leg||'').trim(); if(!leg||!nombre) return; const k=leg.replace(/^0+/,''); if(!m.has(k)) m.set(k,{leg,nombre,sector:sector||'',turno:turno||''}); else { const o=m.get(k); if(!o.sector&&sector) o.sector=sector; if(!o.turno&&turno) o.turno=turno; } };
  try{ nmRows().forEach(r=>add(r.leg,r.nombre,r.sector==='SIN SECTOR'?'':r.sector,r.turno==='SIN TURNO'?'':r.turno)); }catch(e){}
  try{ ((DB.vac&&DB.vac.rows)||[]).forEach(r=>add(r.legajo,r.nombre,r.sector,'')); }catch(e){}
  try{ FRE().forEach(e=>add(e.legajo,e.nombre,e.sector,e.turno)); }catch(e){}
  return [...m.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
const vsDias=(d,h)=>d&&h&&h>=d?Math.round((dObj(h)-dObj(d))/864e5)+1:0;
function renderVacsol(){
  const sec=$('#vs-wrap'); if(!sec) return;
  if(!vsOn()){ sec.hidden=true; return; }
  if(!VS.ok){ $('#vs-body').innerHTML='<div class="empty">Cargando solicitudes…</div>'; vsLoad(); return; }
  $('#vs-form').hidden=!VS.pide; $('#vs-xls').style.display=VS.aprueba?'':'none';
  $('#vs-tit').textContent=VS.aprueba?'Cargar vacaciones y pedidos':VS.pide?'Pedir vacaciones':'Pedidos de vacaciones';
  { const m=$('#vs-mail'); if(m) m.hidden=!!VS.aprueba; }   // aviso del correo: para quienes piden, no para RRHH
  $('#vs-sub').textContent=VS.aprueba?'Lo que cargás acá queda aprobado. Los pedidos de coordinadores esperan tu aprobación.':VS.pide?`Empiezan un lunes (o martes si el lunes es feriado), con al menos ${VS_ANT} días de anticipación (desde el ${dmy(vsMin())}). RRHH lo aprueba o lo rechaza.`:'Vacaciones aprobadas por RRHH.';
  $('#vs-go').textContent=VS.aprueba?'Cargar vacaciones':'Enviar a RRHH';
  $('#vs-d').min=''; $('#vs-h').min='';
  if(VS.pide){ const E=vsEmps(); $('#vs-emps').innerHTML=E.map(e=>`<option value="${esc(e.nombre+' · '+e.leg)}">${esc([e.sector,e.turno].filter(Boolean).join(' · '))}</option>`).join(''); vsCalc(); }
  const cnt=k=>VS.items.filter(x=>k==='todas'||x.estado===k||(k==='pend'&&x.estado==='pendiente')).length;
  $('#vs-tabs').innerHTML=[['pend','Pendientes'],['aprobada','Aprobadas'],['rechazada','Rechazadas'],['todas','Todas']].map(([k,l])=>`<button type="button" class="fr-ch${VS.f===k?' on':''}" data-vsf="${k}">${l} <i>${cnt(k)}</i></button>`).join('');
  const L=VS.items.filter(x=>VS.f==='todas'||(VS.f==='pend'?x.estado==='pendiente':x.estado===VS.f))
    .sort((a,b)=>VS.f==='pend'?a.desde.localeCompare(b.desde):(b.rat||b.at).localeCompare(a.rat||a.at));
  const me=SRV.user.id;
  $('#vs-body').innerHTML=L.length?`<table class="vs-t"><thead><tr><th>Empleado</th><th>Período</th><th>Pedido por</th><th>Estado</th><th></th></tr></thead><tbody>${L.map(x=>{
      const acc=x.estado==='pendiente'?(VS.aprueba?(VS.rech===x.id?`<div class="vs-rech"><input type="text" id="vs-mot" placeholder="Motivo (opcional)"><button class="btn danger sm" data-vsa="rechazar" data-id="${x.id}">Rechazar</button><button class="btn ghost sm" data-vsno>Volver</button></div>`
          :`<button class="btn primary sm" data-vsa="aprobar" data-id="${x.id}">Aprobar</button><button class="btn ghost sm" data-vsr="${x.id}">Rechazar</button>`)
        :(x.uid===me?`<button class="btn ghost sm" data-vsa="cancelar" data-id="${x.id}">Cancelar pedido</button>`:''))
        :(x.estado==='aprobada'&&VS.aprueba?`<button class="btn ghost sm" data-vsa="anular" data-id="${x.id}">Anular</button>`:'');
      return `<tr><td><b>${esc(x.nombre)}</b><span>${esc([x.legajo,x.sector,x.turno].filter(Boolean).join(' · '))}</span></td>
        <td><b>${dmy(x.desde)} al ${dmy(x.hasta)}</b><span>${x.dias} día(s)${x.obs?' · '+esc(x.obs):''}</span></td>
        <td>${esc(x.by)}<span>${fmtAt(x.at)}</span></td>
        <td><em class="vs-e ${x.estado}">${x.directa&&x.estado==='aprobada'?'Cargada por RRHH':(VS_EST[x.estado]||x.estado)}</em>${x.fuera_plazo?'<em class="vs-e vs-fp" title="Se cargó sin los 15 días de anticipación">Fuera de plazo</em>':''}${x.fuera_dia?'<em class="vs-e vs-fp" title="No empieza un lunes">No empieza lunes</em>':''}${x.rby?`<span>${esc(x.rby)} · ${fmtAt(x.rat)}</span>`:''}${x.motivo?`<span>Motivo: ${esc(x.motivo)}</span>`:''}</td>
        <td class="vs-acc">${acc}</td></tr>`; }).join('')}</tbody></table>`
    :`<div class="empty">${VS.f==='pend'?'No hay pedidos pendientes.':'No hay solicitudes en esta lista.'}</div>`;
  vsBadge();
}
// reglas: salida un lunes (o martes si el lunes es feriado) y 15 días de anticipación
const vsInicioOk=(d,sector)=>{ if(/MANTENIM/i.test(sector||'')) return true; const w=dObj(d).getDay(); return w===1||(w===2&&!!cxFer(addD(d,-1))); };
const VS_REGLA=`Las vacaciones tienen que empezar <b>un lunes</b> (o el martes, si el lunes es feriado) y pedirse con <b>al menos ${VS_ANT} días de anticipación</b>. Toda solicitud queda pendiente hasta que RRHH la apruebe.`;
function vsEmpSel(){ const m=$('#vs-emp').value.trim().match(/·\s*(\S+)\s*$/); return m?vsEmps().find(x=>x.leg===m[1]):null; }
function vsProblemas(d){
  const e=vsEmpSel(), P=[];
  if(d&&d<vsMin()) P.push(`la salida tendría que ser desde el <b>${dmy(vsMin())}</b>`);
  if(d&&!vsInicioOk(d,e&&e.sector)) P.push(`el ${dmy(d)} es <b>${DOWL[dObj(d).getDay()]}</b>, no lunes`);
  return P;
}
function vsCalc(){ const d=$('#vs-d').value, h=$('#vs-h').value, n=vsDias(d,h), P=vsProblemas(d);
  const den=$('#vs-den'); if(den){ den.hidden=!P.length;
    if(P.length) den.innerHTML=`<span><b>⛔ Denegado:</b> ${VS_REGLA}<br><small>En este pedido: ${P.join(' · ')}.</small></span>${VS.aprueba?`<button type="button" class="btn danger sm" id="vs-force">Cargar de todas maneras</button>`:''}`; }
  $('#vs-n').innerHTML=!P.length&&n?`${n} día(s) corridos`:(!P.length&&d&&h&&!n?'El regreso no puede ser antes de la salida':''); }
// cartel al intentar enviar algo que no cumple
function vsCartel(P){
  const m=document.createElement('div'); m.className='vs-modal'; m.innerHTML=`<div class="vs-mbox"><h3>⛔ Solicitud denegada</h3><p>${VS_REGLA}</p>${P.length?`<p class="vs-msm">En este pedido: ${P.join(' · ')}.</p>`:''}
    <div class="vs-mb">${VS.aprueba?'<button class="btn danger" data-vsm="forzar">Cargar de todas maneras</button>':''}<button class="btn primary" data-vsm="ok">Entendido</button></div></div>`;
  document.body.appendChild(m);
  m.addEventListener('click',e=>{ const b=e.target.closest('[data-vsm]'); if(!b&&e.target!==m) return; m.remove(); if(b&&b.dataset.vsm==='forzar') vsEnviar(true); });
}
async function vsEnviar(forzar){
  const sel=$('#vs-emp').value.trim(), m=sel.match(/·\s*(\S+)\s*$/), E=vsEmps(), e=m&&E.find(x=>x.leg===m[1]);
  if(!e){ App.toast('Elegí el empleado de la lista (escribí el apellido y elegilo).',true); return; }
  const desde=$('#vs-d').value, hasta=$('#vs-h').value;
  if(!vsDias(desde,hasta)){ App.toast('Revisá las fechas de salida y regreso.',true); return; }
  const P=vsProblemas(desde); if(P.length&&!(VS.aprueba&&forzar)){ vsCartel(P); return; }
  const b=$('#vs-go'); b.disabled=true;
  try{ await SRV.api('POST','/api/vacsol',{legajo:e.leg,nombre:e.nombre,sector:e.sector,turno:e.turno,desde,hasta,obs:$('#vs-obs').value.trim(),forzar:!!forzar});
    App.toast(VS.aprueba?`Vacaciones cargadas: ${shortName(e.nombre)} · ${dmy(desde)} al ${dmy(hasta)}`:`Pedido enviado: ${shortName(e.nombre)} · ${dmy(desde)} al ${dmy(hasta)}. Queda pendiente hasta que RRHH lo apruebe. Recordá pedirlas también por el correo habitual.`);
    $('#vs-emp').value=''; $('#vs-d').value=''; $('#vs-h').value=''; $('#vs-obs').value=''; VS.f=VS.aprueba?'aprobada':'pend'; await vsLoad(); }
  catch(err){ App.toast(err.message,true); }
  finally{ b.disabled=false; }
}
async function vsAccion(id,acc){
  try{ const motivo=acc==='rechazar'?(($('#vs-mot')||{}).value||''):'';
    const r=await SRV.api('POST',`/api/vacsol/${id}/${acc}`,{motivo}); VS.rech='';
    App.toast({aprobar:'Solicitud aprobada: ya figura en Vacaciones',rechazar:'Solicitud rechazada',cancelar:'Pedido cancelado',anular:'Solicitud anulada'}[acc]+` · ${shortName(r.item.nombre)}`);
    await vsLoad(); }
  catch(err){ App.toast(err.message,true); await vsLoad(); }
}
async function vsExcel(){
  const L=VS.items.filter(x=>x.estado==='aprobada').sort((a,b)=>a.desde.localeCompare(b.desde));
  if(!L.length){ App.toast('No hay solicitudes aprobadas.',true); return; }
  const rows=[['Legajo','Apellido y nombre','Sector','Turno','Desde','Hasta','Días','Observación','Pedido por','Pedido el','Aprobado por','Aprobado el']]
    .concat(L.map(x=>[x.legajo,x.nombre,x.sector,x.turno,dmy(x.desde),dmy(x.hasta),x.dias,x.obs||'',x.by,fmtAt(x.at),x.rby||'',fmtAt(x.rat)]));
  const ws=XLSX.utils.aoa_to_sheet(rows); ws['!cols']=[{wch:10},{wch:34},{wch:16},{wch:12},{wch:11},{wch:11},{wch:6},{wch:30},{wch:22},{wch:16},{wch:22},{wch:16}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Aprobadas'); XLSX.writeFile(wb,`vacaciones_aprobadas_${hoy()}.xlsx`);
}
function hookVacsol(){
  if(!vsOn()){ const w=$('#vs-wrap'); if(w) w.hidden=true; return; }
  $('#vs-go').onclick=()=>vsEnviar(false);
  document.addEventListener('click',e=>{ if(e.target.closest('#vs-force')){ e.target.closest('#vs-force').disabled=true; vsEnviar(true); } }); $('#vs-xls').onclick=vsExcel;
  $('#vs-emp').addEventListener('change',vsCalc);
  ['#vs-d','#vs-h'].forEach(s=>$(s).addEventListener('change',()=>{ if(s==='#vs-d'&&$('#vs-d').value&&(!$('#vs-h').value||$('#vs-h').value<$('#vs-d').value)) $('#vs-h').value=$('#vs-d').value; vsCalc(); }));
  document.addEventListener('click',e=>{ if(!e.target.closest('#vs-wrap')) return;
    const f=e.target.closest('[data-vsf]'); if(f){ VS.f=f.dataset.vsf; VS.rech=''; renderVacsol(); return; }
    const r=e.target.closest('[data-vsr]'); if(r){ VS.rech=r.dataset.vsr; renderVacsol(); setTimeout(()=>{ const i=$('#vs-mot'); if(i) i.focus(); },0); return; }
    if(e.target.closest('[data-vsno]')){ VS.rech=''; renderVacsol(); return; }
    const a=e.target.closest('[data-vsa]'); if(a){ a.disabled=true; vsAccion(a.dataset.id,a.dataset.vsa); } });
  vsLoad();
}
const _ovVs=App.onView; App.onView=(id,f)=>{ _ovVs(id,f); if(id==='v-vacaciones') renderVacsol(); };
try{ hookVacsol(); }catch(e){ console.error('vacsol',e); }
try{ if(App.saludoDelDia) App.saludoDelDia(); }catch(e){}
