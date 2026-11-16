/* ================================================================
   SOLICITUDES DE VACACIONES
   Coordinadores y supervisores cargan el pedido; RRHH lo aprueba o lo rechaza.
   Las aprobadas aparecen en Vacaciones (próximas salidas, quién está afuera, agenda).
   Solo funciona con el servidor: en modo archivo la sección no se muestra.
   ================================================================ */
const VS={items:[],aprueba:false,pide:false,ok:false,ver:-1,f:'pend',rech:''};
const vsOn=()=>!!(window.SRV&&SRV.mode==='online'&&SRV.api);
const VS_EST={pendiente:'Pendiente',aprobada:'Aprobada',rechazada:'Rechazada',cancelada:'Cancelada',anulada:'Anulada'};
async function vsLoad(){
  if(!vsOn()) return;
  try{ const r=await SRV.api('GET','/api/vacsol'); Object.assign(VS,{items:r.items||[],aprueba:!!r.aprueba,pide:!!r.pide,ver:r.version,ok:true}); }
  catch(e){ VS.ok=false; return; }
  vsMerge(); vsBadge(); if(typeof curView!=='undefined'&&curView==='v-vacsol') renderVacsol();
  try{ App.refresh(); }catch(e){}
}
// las aprobadas se suman al plan de vacaciones (si RRHH ya la cargó en el plan oficial, no se duplica)
function vsMerge(){
  const plan=(DB.vac&&DB.vac.rows)||[], ya=new Set(plan.map(r=>String(r.legajo)+'|'+r.desde));
  window.VACSOL_OK=VS.items.filter(x=>x.estado==='aprobada'&&!ya.has(String(x.legajo)+'|'+x.desde)).map(x=>({legajo:x.legajo,nombre:x.nombre,uo:'',cat:'',ingreso:'',doc:'',sector:x.sector||'',diasAno:0,n:1,
    id:'sol|'+x.id,desde:x.desde,hasta:x.hasta,dias:x.dias,notif:'NO',fnotif:'',sol:true}));
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
  const sec=$('#v-vacsol'); if(!sec) return;
  if(!VS.ok){ $('#vs-body').innerHTML='<div class="empty">Cargando solicitudes…</div>'; vsLoad(); return; }
  $('#vs-form').hidden=!VS.pide; $('#vs-xls').hidden=!VS.aprueba;
  $('#vs-sub').textContent=VS.aprueba?'Revisá los pedidos de coordinadores y supervisores: al aprobarlos aparecen en Vacaciones.':'Cargá el pedido de vacaciones de tu gente. RRHH lo revisa y lo aprueba o lo rechaza; acá ves en qué estado está.';
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
        <td><em class="vs-e ${x.estado}">${VS_EST[x.estado]||x.estado}</em>${x.rby?`<span>${esc(x.rby)} · ${fmtAt(x.rat)}</span>`:''}${x.motivo?`<span>Motivo: ${esc(x.motivo)}</span>`:''}</td>
        <td class="vs-acc">${acc}</td></tr>`; }).join('')}</tbody></table>`
    :`<div class="empty">${VS.f==='pend'?'No hay pedidos pendientes.':'No hay solicitudes en esta lista.'}</div>`;
  vsBadge();
}
function vsCalc(){ const d=$('#vs-d').value, h=$('#vs-h').value, n=vsDias(d,h); $('#vs-n').textContent=n?`${n} día(s) corridos`:(d&&h?'El regreso no puede ser antes de la salida':''); }
async function vsEnviar(){
  const sel=$('#vs-emp').value.trim(), m=sel.match(/·\s*(\S+)\s*$/), E=vsEmps(), e=m&&E.find(x=>x.leg===m[1]);
  if(!e){ App.toast('Elegí el empleado de la lista (escribí el apellido y elegilo).',true); return; }
  const desde=$('#vs-d').value, hasta=$('#vs-h').value;
  if(!vsDias(desde,hasta)){ App.toast('Revisá las fechas de salida y regreso.',true); return; }
  const b=$('#vs-go'); b.disabled=true;
  try{ await SRV.api('POST','/api/vacsol',{legajo:e.leg,nombre:e.nombre,sector:e.sector,turno:e.turno,desde,hasta,obs:$('#vs-obs').value.trim()});
    App.toast(`Pedido enviado a RRHH: ${shortName(e.nombre)} · ${dmy(desde)} al ${dmy(hasta)}`);
    $('#vs-emp').value=''; $('#vs-d').value=''; $('#vs-h').value=''; $('#vs-obs').value=''; VS.f='pend'; await vsLoad(); }
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
  if(!vsOn()){ const n=document.querySelector('.nav-item[data-v="v-vacsol"]'); if(n) n.style.display='none'; return; }
  $('#vs-go').onclick=vsEnviar; $('#vs-xls').onclick=vsExcel;
  ['#vs-d','#vs-h'].forEach(s=>$(s).addEventListener('change',()=>{ if(s==='#vs-d'&&$('#vs-d').value&&(!$('#vs-h').value||$('#vs-h').value<$('#vs-d').value)) $('#vs-h').value=$('#vs-d').value; vsCalc(); }));
  document.addEventListener('click',e=>{ if(!e.target.closest('#v-vacsol')) return;
    const f=e.target.closest('[data-vsf]'); if(f){ VS.f=f.dataset.vsf; VS.rech=''; renderVacsol(); return; }
    const r=e.target.closest('[data-vsr]'); if(r){ VS.rech=r.dataset.vsr; renderVacsol(); setTimeout(()=>{ const i=$('#vs-mot'); if(i) i.focus(); },0); return; }
    if(e.target.closest('[data-vsno]')){ VS.rech=''; renderVacsol(); return; }
    const a=e.target.closest('[data-vsa]'); if(a){ a.disabled=true; vsAccion(a.dataset.id,a.dataset.vsa); } });
  vsLoad();
}
const _ovVs=App.onView; App.onView=(id,f)=>{ _ovVs(id,f); if(id==='v-vacsol') renderVacsol(); };
try{ hookVacsol(); }catch(e){ console.error('vacsol',e); }
