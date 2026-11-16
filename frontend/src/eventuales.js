/* ================================================================
   EVENTUALES · ALTAS Y BAJAS EN EL PANEL
   La lista de eventuales se mantiene acá: alta de colaboradores nuevos con las columnas
   del Control de eventuales, baja y reactivación, y un registro de cada cambio.
   ================================================================ */
const AG={f:'act',q:'',baja:''};
function agCanEdit(){ return !(window.SRV&&SRV.mode==='online')||SRV.user.rol==='admin'||(SRV.user.perms&&SRV.user.perms.eventuales)==='editar'; }
const agUser=()=>(window.SRV&&SRV.mode==='online'&&SRV.user&&SRV.user.nombre)||'Este equipo';
function agLog(acc,r,det){
  const L=DB.antLog||(DB.antLog=[]); L.push({acc,l:r.legajo,n:r.nombre,det:det||'',by:agUser(),at:new Date().toISOString()}); DB.antLog=L.slice(-1000);
  if(window.SRV&&SRV.nota) SRV.nota('eventuales',`${acc} ${r.nombre} (${r.legajo})${det?' · '+det:''}`);
}
async function agGuardar(){ window.ANTV=(window.ANTV||0)+1; await persist(); try{ renderAnt(); }catch(e){} renderAntGest(); App.refresh(); }
const agAntig=r=>r.ingreso?Math.max(0,Math.round((dObj(hoy())-dObj(r.ingreso))/864e5)):0;
function renderAntGest(){
  const tab=$('#tab-ant-gest'), ok=agCanEdit(); if(tab) tab.style.display=ok?'':'none';
  if(!ok||!$('#pa-gest')) return;
  const R=antRows(), uniqS=k=>[...new Set(R.map(r=>r[k]).filter(v=>v&&v!=='SIN DATO'))].sort((a,b)=>a.localeCompare(b,'es'));
  $('#ag-uos').innerHTML=uniqS('uo').map(v=>`<option value="${esc(v)}">`).join('');
  $('#ag-tars').innerHTML=uniqS('tarea').map(v=>`<option value="${esc(v)}">`).join('');
  $('#ag-turs').innerHTML=uniqS('turno').map(v=>`<option value="${esc(v)}">`).join('');
  if(!$('#ag-uo').value){ const c={}; R.forEach(r=>{ if(r.uo) c[r.uo]=(c[r.uo]||0)+1; }); const top=Object.entries(c).sort((a,b)=>b[1]-a[1])[0]; if(top) $('#ag-uo').value=top[0]; }
  const nA=R.filter(r=>r.activo).length;
  $('#ag-f').innerHTML=[['act',`Activos <i>${nA}</i>`],['baja',`Bajas <i>${R.length-nA}</i>`],['todos',`Todos <i>${R.length}</i>`]].map(([k,l])=>`<button type="button" class="fr-ch${AG.f===k?' on':''}" data-agf="${k}">${l}</button>`).join('');
  const q=AG.q.trim().toLowerCase(), add=DB.antAdd||{}, ov=DB.antOv||{};
  const L=R.filter(r=>(AG.f==='todos'||(AG.f==='act'?r.activo:!r.activo))&&(!q||r.nombre.toLowerCase().includes(q)||String(r.legajo).includes(q))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  $('#ag-t').innerHTML=`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Ingreso</th><th>Último día</th><th>Tarea · turno</th><th>Estado</th><th></th></tr></thead><tbody>${L.slice(0,400).map(r=>{
    const est=ov[r.legajo]&&ov[r.legajo].est, nuevo=!!add[r.legajo];
    const acc=r.activo?(AG.baja===r.legajo?`<div class="ag-baja"><input type="date" id="ag-be" value="${hoy()}"><select id="ag-bm"><option>FPP</option><option>Renuncia</option><option>Despido</option><option>Fin de contrato</option><option>Otro</option></select><button class="btn danger sm" data-agok="${esc(r.legajo)}">Confirmar baja</button><button class="btn ghost sm" data-agno>Volver</button></div>`
        :`<button class="btn ghost sm" data-agb="${esc(r.legajo)}">Dar de baja</button>`)
      :`<button class="btn ghost sm" data-agr="${esc(r.legajo)}">Reactivar</button>`;
    return `<tr><td class="mono">${esc(r.legajo)}</td><td><b>${esc(r.nombre)}</b>${nuevo?' <em class="ag-tag">alta en el panel</em>':''}</td><td class="mono">${r.ingreso?dmy(r.ingreso):'—'}</td><td class="mono">${r.ultimo?dmy(r.ultimo):'—'}</td>
      <td>${esc([r.tarea,r.turno].filter(v=>v&&v!=='SIN DATO').join(' · '))}</td>
      <td><em class="vs-e ${r.activo?'aprobada':'rechazada'}">${r.activo?'Activo':'Baja'}</em>${!r.activo&&r.egreso?`<span class="ag-s">egreso ${dmy(r.egreso)}</span>`:''}${est?`<span class="ag-s">${esc(est.by||'')} · ${fmtAt(est.at)}</span>`:''}</td>
      <td class="vs-acc">${acc}</td></tr>`; }).join('')||'<tr><td colspan="7"><div class="empty">Nadie con ese filtro.</div></td></tr>'}</tbody>`;
  const G=(DB.antLog||[]).slice().reverse().slice(0,300);
  $('#ag-log').innerHTML=G.length?`<thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Colaborador</th><th>Detalle</th></tr></thead><tbody>${G.map(x=>`<tr><td class="mono">${fmtAt(x.at)}</td><td>${esc(x.by)}</td><td><span class="fr-lg2 ${x.acc==='Baja'?'q':'a'}">${esc(x.acc)}</span></td><td>${esc(x.n)} <span style="color:var(--text3)">${esc(x.l)}</span></td><td>${esc(x.det)}</td></tr>`).join('')}</tbody>`
    :'<tbody><tr><td><div class="empty">Todavía no hay cambios hechos en el panel.</div></td></tr></tbody>';
}
async function agAlta(){
  const v=id=>($(id).value||'').trim(), msg=t=>{ $('#ag-msg').innerHTML=t?`<b class="vs-warn">${esc(t)}</b>`:''; };
  const r={legajo:v('#ag-leg').replace(/\D/g,''),nombre:v('#ag-nom').toUpperCase().replace(/\s+/g,' '),nac:v('#ag-nac'),doc:v('#ag-doc'),ingreso:v('#ag-ing'),egreso:'',
    uo:v('#ag-uo'),ultimo:v('#ag-ult'),tarea:(v('#ag-tar')||'SIN DATO').toUpperCase(),turno:(v('#ag-tur')||'SIN DATO').toUpperCase(),activo:true,estRaw:'ACTIVO',motivoRaw:'',detalle:''};
  if(!r.legajo) return msg('Falta el legajo.');
  if(antRows().some(x=>String(x.legajo)===r.legajo)) return msg(`El legajo ${r.legajo} ya está en la lista.`);
  if(!r.nombre||r.nombre.split(' ').length<2) return msg('Falta el apellido y nombre.');
  if(!/\d{7,}/.test(r.doc.replace(/\D/g,''))) return msg('Revisá el DNI / CUIL.');
  if(!r.ingreso) return msg('Falta la fecha de ingreso.');
  if(!r.ultimo) return msg('Falta el último día.');
  if(r.ultimo<r.ingreso) return msg('El último día no puede ser antes del ingreso.');
  if(r.tarea==='SIN DATO'||r.turno==='SIN DATO') return msg('Completá tarea y turno.');
  r.antig=agAntig(r);
  DB.antAdd=Object.assign({},DB.antAdd||{},{[r.legajo]:r});
  agLog('Alta',r,`ingreso ${dmy(r.ingreso)} · ${r.tarea} · ${r.turno}`);
  ['#ag-leg','#ag-nom','#ag-nac','#ag-doc','#ag-ing','#ag-ult','#ag-tar','#ag-tur'].forEach(i=>$(i).value=''); msg('');
  await agGuardar(); App.toast(`Alta cargada: ${shortName(r.nombre)} (${r.legajo})`);
}
async function agEstado(leg,activo){
  const r=antRows().find(x=>String(x.legajo)===String(leg)); if(!r) return;
  const egreso=activo?'':($('#ag-be')&&$('#ag-be').value)||hoy(), motivo=activo?'':($('#ag-bm')&&$('#ag-bm').value)||'';
  const ov=Object.assign({},DB.antOv||{}); ov[leg]=Object.assign({},ov[leg]||{},{est:{activo,egreso,motivo,by:agUser(),at:new Date().toISOString()}});
  if(motivo) ov[leg].motivo=motivo==='FPP'?'FPP':motivo;
  DB.antOv=ov; AG.baja='';
  agLog(activo?'Reactivación':'Baja',r,activo?'':`egreso ${dmy(egreso)} · ${motivo}`);
  await agGuardar(); App.toast(`${activo?'Reactivado':'Baja cargada'}: ${shortName(r.nombre)}`);
}
function hookAntGest(){
  if(!$('#pa-gest')) return;
  $('#ag-alta').onclick=agAlta;
  $('#ag-q').oninput=e=>{ AG.q=e.target.value; renderAntGest(); };
  document.addEventListener('click',e=>{ if(!e.target.closest('#pa-gest')) return;
    const f=e.target.closest('[data-agf]'); if(f){ AG.f=f.dataset.agf; renderAntGest(); return; }
    const b=e.target.closest('[data-agb]'); if(b){ AG.baja=b.dataset.agb; renderAntGest(); return; }
    if(e.target.closest('[data-agno]')){ AG.baja=''; renderAntGest(); return; }
    const ok=e.target.closest('[data-agok]'); if(ok){ agEstado(ok.dataset.agok,false); return; }
    const re=e.target.closest('[data-agr]'); if(re){ agEstado(re.dataset.agr,true); return; } });
  renderAntGest();
}
const _ovAg=App.onView; App.onView=(id,f)=>{ _ovAg(id,f); if(id==='v-bajas') renderAntGest(); };
try{ hookAntGest(); }catch(e){ console.error('eventuales',e); }
