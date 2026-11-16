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
async function agGuardar(quieto){ window.ANTV=(window.ANTV||0)+1; await persist(); try{ renderAnt(); }catch(e){} if(!quieto) renderAntGest(); App.refresh(); }
const agAntig=r=>r.ingreso?Math.max(0,Math.round((dObj(hoy())-dObj(r.ingreso))/864e5)):0;
// columnas del Control de eventuales (las mismas del archivo)
const AG_COL=[['legajo','Legajo','text',90],['nombre','Apellido y nombre','text',230],['nac','Nacimiento','date',138],['doc','DNI / CUIL','text',130],
  ['ingreso','F. ingreso','date',138],['egreso','F. egreso','date',138],['uo','U.O. Cliente','text',170],['ultimo','Último día','date',138],
  ['activo','Estado','estado',104],['tarea','Tarea','text',140],['turno','Turno','text',110]];
const AG_LAB=Object.fromEntries(AG_COL.map(c=>[c[0],c[1]]));
function agCell(c,v,attrs){
  const [k,,t,w]=c;
  if(t==='estado') return `<select ${attrs} style="width:${w}px"><option value="1"${v?' selected':''}>Activo</option><option value="0"${v?'':' selected'}>Baja</option></select>`;
  return `<input type="${t}" ${attrs} value="${esc(v==null?'':String(v))}" style="width:${w}px"${k==='legajo'?' inputmode="numeric"':''}${['tarea','turno','uo'].includes(k)?` list="ag-l-${k}"`:''}>`;
}
function renderAntGest(){
  const tab=$('#tab-ant-gest'), ok=agCanEdit(); if(tab) tab.style.display=ok?'':'none';
  if(!ok||!$('#pa-gest')) return;
  const R=antRows(), uniqS=k=>[...new Set(R.map(r=>r[k]).filter(v=>v&&v!=='SIN DATO'))].sort((a,b)=>a.localeCompare(b,'es'));
  const nA=R.filter(r=>r.activo).length;
  $('#ag-f').innerHTML=[['act',`Activos <i>${nA}</i>`],['baja',`Bajas <i>${R.length-nA}</i>`],['todos',`Todos <i>${R.length}</i>`]].map(([k,l])=>`<button type="button" class="fr-ch${AG.f===k?' on':''}" data-agf="${k}">${l}</button>`).join('');
  const q=AG.q.trim().toLowerCase(), add=DB.antAdd||{}, ov=DB.antOv||{};
  const L=R.filter(r=>(AG.f==='todos'||(AG.f==='act'?r.activo:!r.activo))&&(!q||r.nombre.toLowerCase().includes(q)||String(r.legajo).includes(q))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const uo0=(()=>{ const c={}; R.forEach(r=>{ if(r.uo) c[r.uo]=(c[r.uo]||0)+1; }); const t=Object.entries(c).sort((a,b)=>b[1]-a[1])[0]; return t?t[0]:''; })();
  $('#ag-t').innerHTML=`<datalist id="ag-l-uo">${uniqS('uo').map(v=>`<option value="${esc(v)}">`).join('')}</datalist><datalist id="ag-l-tarea">${uniqS('tarea').map(v=>`<option value="${esc(v)}">`).join('')}</datalist><datalist id="ag-l-turno">${uniqS('turno').map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
    <thead><tr>${AG_COL.map(c=>`<th>${c[1]}</th>`).join('')}<th>Antig.</th><th></th></tr></thead><tbody>
    <tr class="ag-new">${AG_COL.map(c=>`<td>${c[2]==='estado'?'<span class="ag-s">Activo</span>':agCell(c,c[0]==='uo'?uo0:'',`data-agn="${c[0]}" placeholder="${c[0]==='nombre'?'Nuevo: APELLIDO NOMBRE':''}"`)}</td>`).join('')}<td></td><td><button class="btn primary sm" id="ag-alta">Agregar</button></td></tr>
    ${L.slice(0,500).map(r=>{ const lg=esc(r.legajo), o=ov[r.legajo]||{}, mod=!!(o.ed&&Object.keys(o.ed).length)||!!o.est, nuevo=!!add[r.legajo];
      return `<tr class="${r.activo?'':'ag-baja-r'}" data-agrow="${lg}">${AG_COL.map(c=>`<td>${c[0]==='legajo'?`<span class="mono">${lg}</span>${nuevo?'<em class="ag-tag">nuevo</em>':''}`:agCell(c,c[0]==='activo'?r.activo:r[c[0]],`data-age="${lg}|${c[0]}"`)}</td>`).join('')}
        <td class="mono">${agAntig(r)||''}</td><td>${mod?`<span class="ag-s" title="${esc(o.est?`Estado: ${o.est.by} · ${fmtAt(o.est.at)}`:'')}">editado</span>`:''}</td></tr>`; }).join('')||`<tr><td colspan="${AG_COL.length+2}"><div class="empty">Nadie con ese filtro.</div></td></tr>`}</tbody>`;
  const G=(DB.antLog||[]).slice().reverse().slice(0,300);
  $('#ag-log').innerHTML=G.length?`<thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Colaborador</th><th>Detalle</th></tr></thead><tbody>${G.map(x=>`<tr><td class="mono">${fmtAt(x.at)}</td><td>${esc(x.by)}</td><td><span class="fr-lg2 ${x.acc==='Baja'?'q':'a'}">${esc(x.acc)}</span></td><td>${esc(x.n)} <span style="color:var(--text3)">${esc(x.l)}</span></td><td>${esc(x.det)}</td></tr>`).join('')}</tbody>`
    :'<tbody><tr><td><div class="empty">Todavía no hay cambios hechos en el panel.</div></td></tr></tbody>';
}
const agMsg=t=>{ const m=$('#ag-msg'); if(m) m.innerHTML=t?`<b class="vs-warn">${esc(t)}</b>`:''; };
async function agAlta(){
  const v=k=>{ const el=document.querySelector(`[data-agn="${k}"]`); return el?el.value.trim():''; };
  const r={legajo:v('legajo').replace(/\D/g,''),nombre:v('nombre').toUpperCase().replace(/\s+/g,' '),nac:v('nac'),doc:v('doc'),ingreso:v('ingreso'),egreso:'',
    uo:v('uo'),ultimo:v('ultimo'),tarea:(v('tarea')||'SIN DATO').toUpperCase(),turno:(v('turno')||'SIN DATO').toUpperCase(),activo:true,estRaw:'ACTIVO',motivoRaw:'',detalle:''};
  if(!r.legajo) return agMsg('Falta el legajo.');
  if(antRows().some(x=>String(x.legajo)===r.legajo)) return agMsg(`El legajo ${r.legajo} ya está en la lista.`);
  if(!r.nombre||r.nombre.split(' ').length<2) return agMsg('Falta el apellido y nombre.');
  if(!/\d{7,}/.test(r.doc.replace(/\D/g,''))) return agMsg('Revisá el DNI / CUIL.');
  if(!r.ingreso) return agMsg('Falta la fecha de ingreso.');
  if(!r.ultimo) return agMsg('Falta el último día.');
  if(r.ultimo<r.ingreso) return agMsg('El último día no puede ser antes del ingreso.');
  if(r.tarea==='SIN DATO'||r.turno==='SIN DATO') return agMsg('Completá tarea y turno.');
  r.antig=agAntig(r);
  DB.antAdd=Object.assign({},DB.antAdd||{},{[r.legajo]:r});
  agLog('Alta',r,`ingreso ${dmy(r.ingreso)} · ${r.tarea} · ${r.turno}`); agMsg('');
  await agGuardar(); App.toast(`Alta cargada: ${shortName(r.nombre)} (${r.legajo})`);
}
// corrección de una casilla (se guarda al salir de la casilla)
async function agSet(leg,k,val){
  const r=antRows().find(x=>String(x.legajo)===String(leg)); if(!r) return;
  if(k==='activo') return agEstado(leg,val==='1');
  val=String(val||'').trim(); if(['nombre','tarea','turno'].includes(k)) val=val.toUpperCase().replace(/\s+/g,' ');
  const antes=String(r[k]==null?'':r[k]); if(val===antes) return;
  if(k==='nombre'&&val.split(' ').length<2){ agMsg('El apellido y nombre no puede quedar incompleto.'); renderAntGest(); return; }
  if(k==='egreso'&&!r.activo){ const ov=Object.assign({},DB.antOv||{}); ov[leg]=Object.assign({},ov[leg]||{}); ov[leg].est=Object.assign({},ov[leg].est||{activo:false},{egreso:val,by:agUser(),at:new Date().toISOString()}); DB.antOv=ov; }
  else if((DB.antAdd||{})[leg]){ DB.antAdd=Object.assign({},DB.antAdd,{[leg]:Object.assign({},DB.antAdd[leg],{[k]:val})}); }
  else { const ov=Object.assign({},DB.antOv||{}); ov[leg]=Object.assign({},ov[leg]||{}); ov[leg].ed=Object.assign({},ov[leg].ed||{},{[k]:val}); DB.antOv=ov; }
  const fd=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?dmy(v):(v||'vacío');
  agLog('Corrección',r,`${AG_LAB[k]}: ${fd(antes)} → ${fd(val)}`); agMsg('');
  await agGuardar(true);
}
async function agEstado(leg,activo){
  const r=antRows().find(x=>String(x.legajo)===String(leg)); if(!r||r.activo===activo) return;
  const egreso=activo?'':(r.egreso||hoy());
  const ov=Object.assign({},DB.antOv||{}); ov[leg]=Object.assign({},ov[leg]||{},{est:{activo,egreso,by:agUser(),at:new Date().toISOString()}});
  DB.antOv=ov;
  agLog(activo?'Reactivación':'Baja',r,activo?'':`egreso ${dmy(egreso)}`);
  await agGuardar(); App.toast(`${activo?'Reactivado':'Baja cargada'}: ${shortName(r.nombre)}${activo?'':' · podés corregir la fecha de egreso en la fila'}`);
}
function hookAntGest(){
  if(!$('#pa-gest')) return;
  $('#ag-q').oninput=e=>{ AG.q=e.target.value; renderAntGest(); };
  document.addEventListener('click',e=>{ if(!e.target.closest('#pa-gest')) return;
    if(e.target.closest('#ag-alta')){ agAlta(); return; }
    const f=e.target.closest('[data-agf]'); if(f){ AG.f=f.dataset.agf; renderAntGest(); return; } });
  document.addEventListener('change',e=>{ const c=e.target.closest('#pa-gest [data-age]'); if(!c) return; const [leg,k]=c.dataset.age.split('|'); agSet(leg,k,c.value); });
  document.addEventListener('keydown',e=>{ if(e.key==='Enter'&&e.target.closest('#pa-gest [data-agn]')){ e.preventDefault(); agAlta(); } });
  renderAntGest();
}
const _ovAg=App.onView; App.onView=(id,f)=>{ _ovAg(id,f); if(id==='v-bajas') renderAntGest(); };
try{ hookAntGest(); }catch(e){ console.error('eventuales',e); }
