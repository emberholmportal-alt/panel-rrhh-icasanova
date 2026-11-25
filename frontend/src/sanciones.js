// ===================== SANCIONES (registro manual) =====================
// Cada medida disciplinaria aplicada: pedido de explicación, apercibimiento o suspensión (con sus días).
// Alimenta "Medidas disciplinarias" y "Días de suspensión" del tablero de Indicadores.
const SC_TIPOS={pe:'Pedido de explicación',ape:'Apercibimiento',sus:'Suspensión'};
const SC_COL={pe:'#38bdf8',ape:'#f59e0b',sus:'#ef4444'};
const SC_MOT=['Llegadas tarde','Ausencia sin aviso','Retiro anticipado / abandono de puesto','Incumplimiento de tareas','Conducta / falta de respeto','Seguridad e higiene','Uso indebido del celular','Otro'];
let scF={mes:'',tipo:'',q:''};
const SC=()=>DB.sanc||(DB.sanc={items:[]});
const scItems=()=>(SC().items||[]);
const scHoy=()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function scPersonas(){ const o={}; try{ nmRows().forEach(r=>o[r.leg]={leg:r.leg,nombre:r.nombre,tipo:r.tipo,sector:r.sector,turno:r.turno}); }catch(e){}
  scItems().forEach(s=>{ if(!o[s.leg]) o[s.leg]={leg:s.leg,nombre:s.nombre,tipo:'',sector:s.sector||'',turno:''}; }); return o; }
function scFilas(){ const q=normTxt(scF.q||'');
  return scItems().filter(s=>(!scF.mes||s.fecha.slice(0,7)===scF.mes)&&(!scF.tipo||s.tipo===scF.tipo)&&(!q||normTxt(s.nombre).includes(q)||String(s.leg).includes(q)))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.nombre.localeCompare(b.nombre)); }
function scHist(leg){ const y=scHoy().slice(0,4), L=scItems().filter(s=>s.leg===leg&&s.fecha.slice(0,4)===y);
  if(!L.length) return 'Sin sanciones registradas este año.';
  const c={pe:0,ape:0,sus:0}, d=L.reduce((a,s)=>a+(s.tipo==='sus'?(+s.dias||0):0),0); L.forEach(s=>c[s.tipo]++);
  return `Este año: ${c.pe} pedido(s) de explicación · ${c.ape} apercibimiento(s) · ${c.sus} suspensión(es)${d?` (${d} días)`:''}. Última: ${dmy(L.map(s=>s.fecha).sort().pop())}.`; }

function renderSanc(){
  const el=$('#sc-body'); if(!el) return;
  const ed=canEditMod('sanciones'), P=scPersonas(), R=scFilas();
  const meses=[...new Set(scItems().map(s=>s.fecha.slice(0,7)))].sort().reverse();
  const c={pe:0,ape:0,sus:0}; let dias=0; const per=new Set(); R.forEach(s=>{ c[s.tipo]++; if(s.tipo==='sus') dias+=(+s.dias||0); per.add(s.leg); });
  const form=ed?`<div class="card sc-form"><div class="card-h"><h3>Registrar sanción</h3></div><div class="card-b">
    <div class="sc-g">
      <label class="sc-f sc-w2">Colaborador<input type="text" id="sc-emp" list="sc-dl" placeholder="legajo o apellido" autocomplete="off"><datalist id="sc-dl">${Object.values(P).sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(p=>`<option value="${esc(p.leg)} · ${esc(p.nombre)}">`).join('')}</datalist></label>
      <label class="sc-f">Fecha de la sanción<input type="date" id="sc-fec" value="${scHoy()}"></label>
      <label class="sc-f">Tipo<select id="sc-tipo">${Object.entries(SC_TIPOS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="sc-f sc-sus">Días de suspensión<input type="number" id="sc-dias" min="1" max="30" value="1"></label>
      <label class="sc-f sc-sus">Desde<input type="date" id="sc-des"></label>
      <label class="sc-f">Motivo<select id="sc-mot">${SC_MOT.map(m=>`<option>${m}</option>`).join('')}</select></label>
      <label class="sc-f sc-w2">Detalle<input type="text" id="sc-det" maxlength="300" placeholder="ej. 3 llegadas tarde en la semana · 05/11 sin aviso"></label>
    </div>
    <div class="sc-hist" id="sc-hist"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="sc-add">Registrar</button></div></div></div>`:'';
  el.innerHTML=`${form}
    <div class="sc-kpis">${[['Sanciones',R.length,''],['Pedidos de explicación',c.pe,'pe'],['Apercibimientos',c.ape,'ape'],['Suspensiones',c.sus,'sus'],['Días de suspensión',dias,'sus'],['Colaboradores',per.size,'']]
      .map(([k,v,t])=>`<div class="sc-k" style="${t?`--c:${SC_COL[t]}`:''}"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    <div class="card"><div class="card-h sc-fil">
      <select id="sc-fm"><option value="">Todos los meses</option>${meses.map(m=>`<option value="${m}"${m===scF.mes?' selected':''}>${amMesL(m)}</option>`).join('')}</select>
      <select id="sc-ft"><option value="">Todos los tipos</option>${Object.entries(SC_TIPOS).map(([k,v])=>`<option value="${k}"${k===scF.tipo?' selected':''}>${v}</option>`).join('')}</select>
      <input type="text" id="sc-fq" placeholder="Buscar apellido o legajo" value="${esc(scF.q)}">
      <span style="flex:1"></span><button class="btn ghost" id="sc-xls">Excel</button></div>
      <div class="tscroll"><table class="nm-t"><thead><tr><th>Fecha</th><th>Legajo</th><th>Apellido y nombre</th><th>Tipo</th><th class="num">Días</th><th>Motivo</th><th>Detalle</th><th>Cargó</th>${ed?'<th></th>':''}</tr></thead><tbody>
      ${R.length?R.map(s=>`<tr><td class="mono">${dmy(s.fecha)}</td><td class="mono">${esc(s.leg)}</td><td><b>${esc(s.nombre)}</b></td>
        <td><span class="sc-tp" style="--c:${SC_COL[s.tipo]}">${SC_TIPOS[s.tipo]}</span></td><td class="num">${s.tipo==='sus'?`${s.dias}${s.desde?`<small> desde ${dmy(s.desde)}</small>`:''}`:''}</td>
        <td>${esc(s.motivo||'')}</td><td class="sc-det">${esc(s.det||'')}</td><td class="muted" style="font-size:12px">${esc(s.por||'')}</td>
        ${ed?`<td><button class="btn ghost sc-del" data-scdel="${esc(s.id)}" title="Borrar">✕</button></td>`:''}</tr>`).join('')
        :`<tr><td colspan="9" class="muted" style="padding:16px">No hay sanciones ${scItems().length?'con estos filtros':'registradas todavía'}.</td></tr>`}
      </tbody></table></div></div>`;
  scTipoUI();
}
function scTipoUI(){ const t=$('#sc-tipo'); if(!t) return; document.querySelectorAll('#sc-body .sc-sus').forEach(x=>x.style.display=t.value==='sus'?'':'none'); }
function scLeg(){ const q=($('#sc-emp')||{}).value||''; const P=scPersonas(); const L=(q.match(/^\d+/)||[''])[0];
  if(L&&P[L]) return P[L]; const n=normTxt(q); const c=Object.values(P).filter(p=>normTxt(p.nombre).includes(n)); return n&&c.length===1?c[0]:null; }

async function scAgregar(){
  const p=scLeg(), fecha=$('#sc-fec').value, tipo=$('#sc-tipo').value, dias=+$('#sc-dias').value||0;
  if(!p){ App.toast('Elegí un colaborador de la lista',true); return; }
  if(!fecha){ App.toast('Poné la fecha de la sanción',true); return; }
  if(tipo==='sus'&&!(dias>=1)){ App.toast('Poné los días de suspensión',true); return; }
  const it={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),leg:p.leg,nombre:p.nombre,sector:p.sector||'',fecha,tipo,
    dias:tipo==='sus'?dias:0,desde:tipo==='sus'?($('#sc-des').value||''):'',motivo:$('#sc-mot').value,det:$('#sc-det').value.trim(),
    por:(window.SRV&&SRV.user&&SRV.user.nombre)||'',at:new Date().toISOString()};
  SC().items=scItems().concat([it]); await persist();
  App.toast(`${SC_TIPOS[tipo]} registrado para ${p.nombre}`); renderSanc();
}
function scExcel(){
  const R=scFilas(); if(!R.length){ App.toast('No hay sanciones para descargar',true); return; }
  const ws=XLSX.utils.aoa_to_sheet([['Fecha','Legajo','Apellido y nombre','Sector','Tipo','Días de suspensión','Desde','Motivo','Detalle','Cargó']]
    .concat(R.map(s=>[dmy(s.fecha),+s.leg||s.leg,s.nombre,s.sector||'',SC_TIPOS[s.tipo],s.tipo==='sus'?s.dias:'',s.desde?dmy(s.desde):'',s.motivo||'',s.det||'',s.por||''])));
  ws['!cols']=[{wch:11},{wch:9},{wch:32},{wch:18},{wch:22},{wch:10},{wch:11},{wch:26},{wch:50},{wch:20}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Sanciones');
  XLSX.writeFile(wb,`sanciones${scF.mes?'_'+scF.mes:''}.xlsx`); App.toast('Excel de sanciones descargado');
}
document.addEventListener('click',async e=>{
  const v=document.getElementById('v-sanc'); if(!v||!v.contains(e.target)) return;
  if(e.target.id==='sc-add'){ scAgregar(); return; }
  if(e.target.id==='sc-xls'){ scExcel(); return; }
  const d=e.target.closest('[data-scdel]'); if(d){ const s=scItems().find(x=>x.id===d.dataset.scdel); if(!s) return;
    if(!confirm(`¿Borrar ${SC_TIPOS[s.tipo].toLowerCase()} de ${s.nombre} del ${dmy(s.fecha)}?`)) return;
    SC().items=scItems().filter(x=>x.id!==s.id); await persist(); renderSanc(); App.toast('Sanción borrada'); }
});
document.addEventListener('change',e=>{
  const v=document.getElementById('v-sanc'); if(!v||!v.contains(e.target)) return;
  if(e.target.id==='sc-tipo') scTipoUI();
  if(e.target.id==='sc-emp'){ const p=scLeg(), h=$('#sc-hist'); if(h) h.textContent=p?`${p.nombre}: ${scHist(p.leg)}`:''; }
  if(e.target.id==='sc-fm'){ scF.mes=e.target.value; renderSanc(); }
  if(e.target.id==='sc-ft'){ scF.tipo=e.target.value; renderSanc(); }
});
document.addEventListener('input',e=>{ if(e.target.id==='sc-fq'){ scF.q=e.target.value; clearTimeout(scF._t); scF._t=setTimeout(()=>{ renderSanc(); const i=$('#sc-fq'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } },250); } });
const _ovSc=App.onView; App.onView=(id,f)=>{ _ovSc(id,f); if(id==='v-sanc') renderSanc(); };
