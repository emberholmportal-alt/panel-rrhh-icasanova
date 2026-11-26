// ===================== SANCIONES (registro manual) =====================
// Cada medida disciplinaria aplicada: pedido de explicación, apercibimiento o suspensión (con sus días).
// Alimenta "Medidas disciplinarias" y "Días de suspensión" del tablero de Indicadores.
const SC_TIPOS={pe:'Pedido de explicación',ape:'Apercibimiento',sus:'Suspensión'};
const SC_COL={pe:'#38bdf8',ape:'#f59e0b',sus:'#ef4444'};
const SC_MOT=['Disciplina','Llegadas tarde','Ausentismo','Calidad','Ausencia sin aviso','Retiro anticipado / abandono de puesto','Incumplimiento de tareas','Conducta / falta de respeto','Seguridad e higiene','Uso indebido del celular','Otro'];
let scF={mes:'',tipo:'',q:''};
const SC=()=>DB.sanc||(DB.sanc={items:[]});
const scItems=()=>(SC().items||[]);
const scHoy=()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function scPersonas(){ const o={}, tar={}; ((DB.ant&&DB.ant.rows)||[]).forEach(r=>{ if(r.tarea) tar[r.legajo]=r.tarea; });
  const em=(DB.nomina&&DB.nomina.emps)||{};
  try{ nmRows().forEach(r=>{ const e=em[r.leg]||{}; o[r.leg]={leg:r.leg,nombre:r.nombre,tipo:r.tipo,sector:r.sector,turno:r.turno,tarea:e.puesto||e.tarea||e.categoria||tar[r.leg]||r.sector||''}; }); }catch(e){}
  scItems().forEach(s=>{ if(s.leg&&!o[s.leg]) o[s.leg]={leg:s.leg,nombre:s.nombre,tipo:'',sector:s.sector||'',turno:''}; }); return o; }
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
      <label class="sc-f">Motivo<select id="sc-mot">${SC_MOT.map(m=>`<option>${m}</option>`).join('')}</select></label>
      <label class="sc-f sc-ape-t">Tarea<input type="text" id="sc-tar" maxlength="80"></label>
      <label class="sc-f sc-pe">Turno<input type="text" id="sc-tur" maxlength="40"></label>
      <label class="sc-f sc-pe">Sector<input type="text" id="sc-sec" maxlength="60"></label>
      <label class="sc-f sc-sus">Días de suspensión<input type="number" id="sc-dias" min="1" max="30" value="1"></label>
      <label class="sc-f sc-sus">Desde<input type="date" id="sc-des"></label>
      <label class="sc-f sc-sus">Hasta (inclusive)<input type="date" id="sc-has"></label>
      <label class="sc-f sc-sus">Retoma tareas<input type="date" id="sc-ret"></label>
      <label class="sc-f sc-w4"><span id="sc-det-l">Hechos</span><textarea id="sc-det" rows="4" maxlength="2000" placeholder="Describí el hecho: qué pasó, cuándo y dónde. Es el texto que va en el formulario."></textarea></label>
    </div>
    <div class="sc-hist" id="sc-hist"></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary" id="sc-add-w">Registrar y descargar formulario</button><button class="btn ghost" id="sc-add">Solo registrar</button></div></div></div>`:'';
  el.innerHTML=`${form}
    <div class="sc-kpis">${[['Sanciones',R.length,''],['Pedidos de explicación',c.pe,'pe'],['Apercibimientos',c.ape,'ape'],['Suspensiones',c.sus,'sus'],['Días de suspensión',dias,'sus'],['Colaboradores',per.size,'']]
      .map(([k,v,t])=>`<div class="sc-k" style="${t?`--c:${SC_COL[t]}`:''}"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
    <div class="card"><div class="card-h sc-fil">
      <select id="sc-fm"><option value="">Todos los meses</option>${meses.map(m=>`<option value="${m}"${m===scF.mes?' selected':''}>${amMesL(m)}</option>`).join('')}</select>
      <select id="sc-ft"><option value="">Todos los tipos</option>${Object.entries(SC_TIPOS).map(([k,v])=>`<option value="${k}"${k===scF.tipo?' selected':''}>${v}</option>`).join('')}</select>
      <input type="text" id="sc-fq" placeholder="Buscar apellido o legajo" value="${esc(scF.q)}">
      <span style="flex:1"></span>${ed?'<label class="btn ghost" style="cursor:pointer">Importar planilla<input type="file" id="sc-imp" accept=".xlsx,.xls" hidden></label>':''}<button class="btn ghost" id="sc-xls">Excel</button></div>
      <div class="tscroll"><table class="nm-t"><thead><tr><th>Fecha</th><th>Legajo</th><th>Apellido y nombre</th><th>Tipo</th><th class="num">Días</th><th>Motivo</th><th>Detalle</th><th>Cargó</th><th></th></tr></thead><tbody>
      ${R.length?R.map(s=>`<tr><td class="mono">${dmy(s.fecha)}</td><td class="mono">${s.leg?esc(s.leg):'<span class="muted" title="No se encontró en la nómina">—</span>'}</td><td><b>${esc(s.nombre)}</b></td>
        <td><span class="sc-tp" style="--c:${SC_COL[s.tipo]}">${SC_TIPOS[s.tipo]}</span></td><td class="num">${s.tipo==='sus'?`${s.dias}${s.desde?`<small> desde ${dmy(s.desde)}</small>`:''}`:''}</td>
        <td>${esc(s.motivo||'')}</td><td class="sc-det">${esc(s.det||'')}</td><td class="muted" style="font-size:12px">${esc(s.por||'')}</td>
        <td style="white-space:nowrap"><button class="btn ghost sc-del" data-scdoc="${esc(s.id)}" title="Descargar el formulario para firmar">Formulario</button>${ed?` <button class="btn ghost sc-del" data-scdel="${esc(s.id)}" title="Borrar">✕</button>`:''}</td></tr>`).join('')
        :`<tr><td colspan="9" class="muted" style="padding:16px">No hay sanciones ${scItems().length?'con estos filtros':'registradas todavía'}.</td></tr>`}
      </tbody></table></div></div>`;
  scTipoUI();
}
function scTipoUI(){ const t=$('#sc-tipo'); if(!t) return; const v=t.value;
  document.querySelectorAll('#sc-body .sc-sus').forEach(x=>x.style.display=v==='sus'?'':'none');
  document.querySelectorAll('#sc-body .sc-pe').forEach(x=>x.style.display=v==='pe'?'':'none');
  document.querySelectorAll('#sc-body .sc-ape-t').forEach(x=>x.style.display=v==='ape'?'':'none');
  const l=$('#sc-det-l'); if(l) l.textContent=v==='pe'?'Punto a explicar':'Hechos'; }
// suspensión: al poner desde y días, propone hasta y el día que retoma (días corridos; se pueden corregir)
function scFechasSus(){ const d=$('#sc-des').value, n=+$('#sc-dias').value||0; if(!d||!n) return;
  const f=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  const h=dObj(d); h.setDate(h.getDate()+n-1); const r=new Date(h); r.setDate(r.getDate()+1); if(r.getDay()===0) r.setDate(r.getDate()+1);
  $('#sc-has').value=f(h); $('#sc-ret').value=f(r); }
function scPrefill(){ const p=scLeg(), h=$('#sc-hist'); if(h) h.textContent=p?`${p.nombre}: ${scHist(p.leg)}`:'';
  if(!p) return; $('#sc-tar').value=p.tarea||''; $('#sc-tur').value=p.turno||''; $('#sc-sec').value=p.sector||''; }
function scLeg(){ const q=($('#sc-emp')||{}).value||''; const P=scPersonas(); const L=(q.match(/^\d+/)||[''])[0];
  if(L&&P[L]) return P[L]; const n=normTxt(q); const c=Object.values(P).filter(p=>normTxt(p.nombre).includes(n)); return n&&c.length===1?c[0]:null; }

async function scAgregar(conWord){
  const p=scLeg(), fecha=$('#sc-fec').value, tipo=$('#sc-tipo').value, dias=+$('#sc-dias').value||0, det=$('#sc-det').value.trim();
  if(!p){ App.toast('Elegí un colaborador de la lista',true); return; }
  if(!fecha){ App.toast('Poné la fecha de la sanción',true); return; }
  if(conWord&&!det){ App.toast(tipo==='pe'?'Escribí el punto a explicar':'Escribí los hechos: van en el formulario',true); return; }
  if(tipo==='sus'){ if(!(dias>=1)){ App.toast('Poné los días de suspensión',true); return; }
    if(conWord&&!($('#sc-des').value&&$('#sc-has').value&&$('#sc-ret').value)){ App.toast('Completá desde, hasta y el día que retoma',true); return; } }
  const it={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),leg:p.leg,nombre:p.nombre,sector:$('#sc-sec').value.trim()||p.sector||'',turno:$('#sc-tur').value.trim()||p.turno||'',
    tarea:$('#sc-tar').value.trim(),fecha,tipo,dias:tipo==='sus'?dias:0,desde:tipo==='sus'?($('#sc-des').value||''):'',hasta:tipo==='sus'?($('#sc-has').value||''):'',retoma:tipo==='sus'?($('#sc-ret').value||''):'',
    motivo:$('#sc-mot').value,det,por:(window.SRV&&SRV.user&&SRV.user.nombre)||'',at:new Date().toISOString()};
  SC().items=scItems().concat([it]); await persist();
  App.toast(`${SC_TIPOS[tipo]} registrado para ${p.nombre}`); renderSanc();
  if(conWord) scWord(it);
}
// ---- formulario para firmar (Word con los modelos de la empresa) ----
const SC_MODELO={pe:'pedido_explicacion',ape:'apercibimiento',sus:'suspension'};
const SC_NUM=['cero','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiún','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve','treinta'];
function scLlenar(x,V){
  return x.replace(/\{\{(\w+)\}\}/g,(m,k,i)=>{
    const v=String(V[k]==null?'':V[k]);
    const ps=Math.max(x.lastIndexOf('<w:p ',i),x.lastIndexOf('<w:p>',i)), pe=x.indexOf('</w:p>',i), para=x.slice(ps,pe);
    const ppr=(para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)||[''])[0], rs=x.lastIndexOf('<w:r>',i), rpr=(x.slice(rs,i).match(/<w:rPr>[\s\S]*?<\/w:rPr>/)||[''])[0];
    const xe=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // en un párrafo justificado cada renglón va en su párrafo (si no, Word estira la línea); si no, salto de línea
    const nl=/w:val="both"/.test(ppr)?`</w:t></w:r></w:p><w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">`:`</w:t></w:r><w:r>${rpr}<w:br/></w:r><w:r>${rpr}<w:t xml:space="preserve">`;
    return xe(v).split(/\r?\n/).join(nl); });
}
async function scWord(s){
  if(typeof JSZip==='undefined'){
    App.toast('Preparando el formulario…');
    try{ await new Promise((ok,mal)=>{ const sc=document.createElement('script'); sc.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; sc.onload=ok; sc.onerror=mal; document.head.appendChild(sc); }); }catch(e){}
    if(typeof JSZip==='undefined'){ App.toast('No se pudo descargar la librería para armar el Word. Revisá la conexión y probá de nuevo.',true); return; }
  }
  try{
    const r=await fetch(`/api/modelos/${SC_MODELO[s.tipo]}`,{credentials:'same-origin'}); if(!r.ok) throw new Error('No se pudo bajar el modelo del formulario');
    const z=await JSZip.loadAsync(await r.arrayBuffer());
    const n=+s.dias||0, V={NOMBRE:s.nombre,LEGAJO:s.leg||'',FECHA:dmy(s.fecha),TAREA:s.tarea||'',TURNO:s.turno||'',SECTOR:s.sector||'',HECHOS:s.det||'',PUNTO:s.det||'',
      DIAS:`${n} (${n===1?'un':SC_NUM[n]||n}) ${n===1?'día':'días'}`,DESDE:s.desde?dmy(s.desde):'',HASTA:s.hasta?dmy(s.hasta):'',RETOMA:s.retoma?dmy(s.retoma):''};
    z.file('word/document.xml',scLlenar(await z.file('word/document.xml').async('string'),V));
    const blob=await z.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`${SC_TIPOS[s.tipo].normalize('NFD').replace(/[\u0300-\u036f]/g,'')} - ${s.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|,]+/g,'').trim()} - ${dmy(s.fecha).replace(/\//g,'-')}.docx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    App.toast('Formulario descargado: imprimilo para la firma');
  }catch(e){ App.toast(e.message,true); }
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
  if(e.target.id==='sc-add'){ scAgregar(false); return; }
  if(e.target.id==='sc-add-w'){ scAgregar(true); return; }
  const dc=e.target.closest('[data-scdoc]'); if(dc){ const s=scItems().find(x=>x.id===dc.dataset.scdoc); if(s) scWord(s); return; }
  if(e.target.id==='sc-xls'){ scExcel(); return; }
  const d=e.target.closest('[data-scdel]'); if(d){ const s=scItems().find(x=>x.id===d.dataset.scdel); if(!s) return;
    if(!confirm(`¿Borrar ${SC_TIPOS[s.tipo].toLowerCase()} de ${s.nombre} del ${dmy(s.fecha)}?`)) return;
    SC().items=scItems().filter(x=>x.id!==s.id); await persist(); renderSanc(); App.toast('Sanción borrada'); }
});
document.addEventListener('change',e=>{
  const v=document.getElementById('v-sanc'); if(!v||!v.contains(e.target)) return;
  if(e.target.id==='sc-tipo') scTipoUI();
  if(e.target.id==='sc-emp') scPrefill();
  if(e.target.id==='sc-des'||e.target.id==='sc-dias') scFechasSus();
  if(e.target.id==='sc-fm'){ scF.mes=e.target.value; renderSanc(); }
  if(e.target.id==='sc-ft'){ scF.tipo=e.target.value; renderSanc(); }
});
document.addEventListener('input',e=>{ if(e.target.id==='sc-fq'){ scF.q=e.target.value; clearTimeout(scF._t); scF._t=setTimeout(()=>{ renderSanc(); const i=$('#sc-fq'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } },250); } });
// ---- importar la planilla anual de sanciones (AÑO, MES, APELLIDO Y NOMBRE, SECTOR, FECHA, TURNO, MOTIVO, SUSPENSION, APERCIBIMIENTO, PEDIDO DE EXPLICACION, OBSERVACION) ----
// No tiene legajo: se busca por nombre en la nómina, eventuales y el reloj. No pisa lo cargado: lo que ya está no se duplica.
const SC_MES={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,SETIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12};
const SC_MOTMAP={'DISCIPLINA':'Disciplina','LLEGADA TARDE':'Llegadas tarde','LLEGADAS TARDE':'Llegadas tarde','AUSENTISMO':'Ausentismo','CALIDAD':'Calidad'};
function scPadron(){ // nombre normalizado → legajo, con todas las fuentes que tienen nombre
  const P=[]; const add=(leg,n)=>{ if(leg&&n) P.push({leg:String(leg),n,t:normTxt(n).replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean)}); };
  try{ nmRows().forEach(r=>add(r.leg,r.nombre)); }catch(e){}
  ((DB.ant&&DB.ant.rows)||[]).forEach(r=>add(r.legajo,r.nombre));
  Object.entries((DB.ausmot&&DB.ausmot.emps)||{}).forEach(([l,e])=>add(l,e.n));
  const vistos=new Set(); return P.filter(p=>{ const k=p.leg+'|'+p.n; if(vistos.has(k)) return false; vistos.add(k); return true; });
}
function scBuscar(P,nombre){ const t=normTxt(nombre).replace(/[^A-Z ]/g,' ').split(/\s+/).filter(Boolean); if(!t.length) return null;
  const c=P.filter(p=>t.every(w=>p.t.includes(w))); const legs=[...new Set(c.map(p=>p.leg))];
  return legs.length===1?c.find(p=>p.leg===legs[0]):null; }
// la fecha manda el día; el año y el mes salen de las columnas AÑO y MES (corrige tipeos como 2028 o el mes cambiado)
function scFechaImp(v,anio,mes){
  let y=0,m=0,d=0;
  if(v instanceof Date&&!isNaN(v)){ y=v.getFullYear(); m=v.getMonth()+1; d=v.getDate(); }
  else if(typeof v==='number'){ const x=XLSX.SSF.parse_date_code(v); if(x){ y=x.y; m=x.m; d=x.d; } }
  else { const t=String(v||'').match(/^\s*(\d{1,2})\D+(\d{1,2})/); if(t){ d=+t[1]; m=+t[2]; } }
  const Y=+String(anio||'').trim()||y, Mo=SC_MES[normTxt(String(mes||''))]||m;
  if(!Y||!Mo) return {f:''};
  if(!d||d>new Date(Y,Mo,0).getDate()) d=1;
  const f=`${Y}-${String(Mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, orig=y?`${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`:String(v||'');
  return {f, corr:(y&&(y!==Y||m!==Mo))||(!y&&m&&m!==Mo)?orig:''};
}
async function scImportar(file){
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}), ws=wb.Sheets[wb.SheetNames[0]];
    const A=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null}); const hi=A.findIndex(r=>(r||[]).some(v=>/APELLIDO/i.test(String(v||''))));
    if(hi<0) throw new Error('No encontré la columna APELLIDO Y NOMBRE');
    const H=A[hi].map(v=>normTxt(String(v||''))), col=rx=>H.findIndex(h=>rx.test(h));
    const c={an:col(/^A(N|Ñ)O$/),mes:col(/^MES$/),nom:col(/APELLIDO/),sec:col(/SECTOR/),fec:col(/^FECHA/),tur:col(/TURNO/),mot:col(/MOTIVO/),sus:col(/SUSPENSION/),ape:col(/APERCIB/),pe:col(/PEDIDO/),obs:col(/OBSERV/)};
    const P=scPadron(), ya=new Set(), occ={}, nuevos=[]; let sinLeg=0, dup=0, mal=0, corr=0;
    const clave=(n,f,t,i)=>`${normTxt(n).replace(/[^A-Z]/g,'')}|${f}|${t}|${i}`;
    // lo ya cargado (incluye importaciones anteriores): no se duplica
    const o0={}; scItems().forEach(x=>{ const b=`${normTxt(x.nombreOrig||x.nombre).replace(/[^A-Z]/g,'')}|${x.fecha}|${x.tipo}`; o0[b]=(o0[b]||0)+1; ya.add(b+'|'+o0[b]); });
    for(const r of A.slice(hi+1)){ const nom=String(r[c.nom]||'').trim(); if(!nom) continue;
      const tipo=r[c.sus]?'sus':r[c.ape]?'ape':r[c.pe]?'pe':''; if(!tipo){ mal++; continue; }
      const FX=scFechaImp(r[c.fec],r[c.an],r[c.mes]), fecha=FX.f; if(!fecha){ mal++; continue; } if(FX.corr) corr++;
      const obs0=String(r[c.obs]||'').trim(), obs=obs0+(FX.corr?`${obs0?' ':''}(en la planilla la fecha figura ${FX.corr})`:''), dm=obs0.match(/(\d+)\s*D[IÍ]AS?/i);
      const b=`${normTxt(nom).replace(/[^A-Z]/g,'')}|${fecha}|${tipo}`; occ[b]=(occ[b]||0)+1;
      if(ya.has(b+'|'+occ[b])){ dup++; continue; }
      const p=scBuscar(P,nom); if(!p) sinLeg++;
      nuevos.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),leg:p?p.leg:'',nombre:p?p.n:nom,nombreOrig:nom,sector:String(r[c.sec]||'').trim(),turno:String(r[c.tur]||'').trim(),
        fecha,tipo,dias:tipo==='sus'?(dm?+dm[1]:1):0,desde:'',motivo:SC_MOTMAP[normTxt(String(r[c.mot]||''))]||String(r[c.mot]||'').trim(),det:obs,
        por:(window.SRV&&SRV.user&&SRV.user.nombre)||'',at:new Date().toISOString(),origen:file.name}); }
    if(!nuevos.length){ App.toast(`No hay sanciones nuevas en la planilla${dup?` (${dup} ya estaban cargadas)`:''}`,!dup); return; }
    const n={pe:0,ape:0,sus:0}; let d=0; nuevos.forEach(x=>{ n[x.tipo]++; d+=x.dias; });
    const f=nuevos.map(x=>x.fecha).sort();
    if(!confirm(`Importar ${nuevos.length} sanciones del ${dmy(f[0])} al ${dmy(f[f.length-1])}:\n\n· ${n.pe} pedidos de explicación\n· ${n.ape} apercibimientos\n· ${n.sus} suspensiones (${d} días)\n\n${nuevos.length-sinLeg} con legajo encontrado en la nómina · ${sinLeg} sin legajo (quedan con el nombre de la planilla)${dup?`\n${dup} ya estaban cargadas y no se duplican`:''}${mal?`\n${mal} filas sin tipo o sin fecha se omiten`:''}${corr?`\n${corr} fechas con el año o el mes distinto a las columnas AÑO y MES: se toma AÑO y MES (queda anotado en el detalle)`:''}`)) return;
    SC().items=scItems().concat(nuevos); await persist(); renderSanc();
    App.toast(`Sanciones importadas: ${nuevos.length}`);
  }catch(e){ console.warn(e); App.toast('No se pudo leer la planilla: '+e.message,true); }
}
document.addEventListener('change',e=>{ if(e.target.id==='sc-imp'&&e.target.files[0]){ scImportar(e.target.files[0]); e.target.value=''; } });
const _ovSc=App.onView; App.onView=(id,f)=>{ _ovSc(id,f); if(id==='v-sanc') renderSanc(); };
