/* ================================================================
   CELULARES DE EVENTUALES (tarjeta en la sección Eventuales)
   · Se sube cualquier Excel con Legajo + Nombre + Móvil/Celular.
   · Cada carga suma/actualiza; los que no vienen se conservan.
   · Se muestran los activos de la planilla con su celular, buscador y Excel.
   Los celulares viven en su propio documento ("wagrupo"): solo lo ve quien
   tenga ese permiso (por defecto, solo el admin).
   ================================================================ */
const WA=()=>DB.wa||(DB.wa={tel:{}});
const waOK=()=>!(window.SRV&&SRV.mode==='online')||(SRV.can&&SRV.can('wagrupo'));
// número argentino → 549 + área + número (10 dígitos)
function waTel(v){ let d=String(v==null?'':v).replace(/\D/g,''); if(!d) return '';
  if(d.startsWith('54')) d=d.slice(2); if(d.startsWith('9')&&d.length===11) d=d.slice(1); if(d.startsWith('0')) d=d.slice(1);
  if(d.length===12){ for(const a of [2,3,4]) if(d.slice(a,a+2)==='15'){ d=d.slice(0,a)+d.slice(a+2); break; } }
  if(d.length===8) d='11'+d;   // sin característica: se asume AMBA
  return d.length===10?'549'+d:''; }
const waTelTxt=t=>t?`${t.slice(3,5)} ${t.slice(5,9)}-${t.slice(9)}`:'';
let waQ='';

function waParse(rows){
  let hi=-1,H=[];
  for(let i=0;i<Math.min(rows.length,20);i++){ const h=(rows[i]||[]).map(c=>normTxt(c));
    if(h.some(x=>/LEGAJO|CODIGO DE EMPLEADO/.test(x))&&h.some(x=>/MOVIL|CELULAR|TELEFONO|^TEL/.test(x))){ hi=i; H=h; break; } }
  if(hi<0) return null;
  const ix=re=>H.findIndex(x=>re.test(x)), cL=ix(/LEGAJO|CODIGO DE EMPLEADO/), cN=ix(/APELLIDO|NOMBRE/), cT=ix(/MOVIL|CELULAR|TELEFONO|^TEL/);
  const out={}, mal=[];
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue; const l=nmLeg(r[cL]); if(!l||!/^\d+$/.test(l)) continue;
    const t=waTel(r[cT]), n=String(r[cN]||'').trim(); if(!t){ mal.push({l,n}); continue; } out[l]={n,tel:t}; }
  return {tel:out,mal}; }

async function waCargar(f){
  try{ const wb=XLSX.read(await f.arrayBuffer(),{type:'array'}); let got=null;
    for(const sn of wb.SheetNames){ const p=waParse(XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,defval:null,blankrows:false})); if(p&&(!got||Object.keys(p.tel).length>Object.keys(got.tel).length)) got=p; }
    if(!got){ App.toast('No encontré columnas de Legajo y Móvil/Celular.',true); return; }
    const W=WA(), at=new Date().toISOString();
    for(const [l,x] of Object.entries(got.tel)) W.tel[l]=Object.assign({},x,{at});
    W.file={name:f.name,at,n:Object.keys(got.tel).length};
    await persist(); waRender(); App.toast(`Celulares cargados: ${Object.keys(got.tel).length}`+(got.mal.length?` · ${got.mal.length} sin número válido`:''),!!got.mal.length);
  }catch(e){ console.error(e); App.toast('No pude leer la lista de celulares.',true); } }

function waFilas(){ const W=WA();
  return antAct().map(r=>{ const l=nmLeg(r.legajo), t=W.tel[l]||{}; return {l,nombre:r.nombre,tarea:r.tarea!=='SIN DATO'?r.tarea:'',turno:r.turno!=='SIN DATO'?r.turno:'',tel:t.tel||''}; })
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')); }

function waRender(){
  const el=$('#wa-card'); if(!el) return; if(!waOK()){ el.style.display='none'; return; } el.style.display='';
  const W=WA(), ed=canEditMod('wagrupo'), all=waFilas(), q=waQ.trim().toLowerCase();
  const F=all.filter(x=>!q||x.nombre.toLowerCase().includes(q)||x.l.includes(q)||x.tel.includes(q.replace(/\D/g,'')||'§'));
  const sin=all.filter(x=>!x.tel).length;
  const html=`<div class="card-h"><h3>📱 Celulares de eventuales</h3><span class="meta">${W.file?`${esc(W.file.name)} · ${fmtAt(W.file.at)}`:'sin lista cargada'} · ${all.length-sin} de ${all.length} activos con celular</span></div>
  <div class="card-b"><div class="wa-bar">
    ${ed?`<button class="btn sm" id="wa-pick">Subir lista de celulares…</button><input type="file" id="wa-file" accept=".xlsx,.xls,.csv" hidden>`:''}
    <input type="text" id="wa-q" placeholder="buscar apellido, legajo o celular" value="${esc(waQ)}">
    <button class="btn ghost sm" id="wa-xls">Excel</button>
    ${sin?`<span class="wa-sin">⚠ ${sin} activo(s) sin celular</span>`:''}</div>
    <div class="tscroll wa-t"><table class="nm-t"><thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Tarea · turno</th><th>Celular</th></tr></thead><tbody>
    ${F.map(x=>`<tr><td class="mono">${esc(x.l)}</td><td><b>${esc(x.nombre)}</b></td><td>${esc([x.tarea,x.turno].filter(Boolean).join(' · '))}</td><td class="mono">${x.tel?esc(waTelTxt(x.tel)):'<span class="wa-sin">sin celular</span>'}</td></tr>`).join('')||'<tr><td colspan="4"><div class="empty">Nadie con esa búsqueda.</div></td></tr>'}
    </tbody></table></div></div>`;
  if(el._h!==html){ el._h=html; el.innerHTML=html; }
}
function waExcel(){ const R=waFilas(); if(!R.length){ App.toast('No hay eventuales activos.',true); return; }
  const a=[['Legajo','Apellido y nombre','Tarea','Turno','Celular']].concat(R.map(x=>[x.l,x.nombre,x.tarea,x.turno,x.tel?x.tel.slice(3):'']));
  const wb=XLSX.utils.book_new(), w=XLSX.utils.aoa_to_sheet(a); w['!cols']=[{wch:9},{wch:34},{wch:22},{wch:14},{wch:13}]; XLSX.utils.book_append_sheet(wb,w,'Celulares');
  XLSX.writeFile(wb,`celulares_eventuales_${hoy()}.xlsx`); App.toast('Excel de celulares descargado'); }
document.addEventListener('click',e=>{
  if(e.target.closest('#wa-pick')) $('#wa-file').click();
  if(e.target.closest('#wa-xls')) waExcel();
});
document.addEventListener('change',e=>{ if(e.target.id==='wa-file'){ const f=e.target.files[0]; e.target.value=''; if(f) waCargar(f); } });
document.addEventListener('input',e=>{ if(e.target.id==='wa-q'){ waQ=e.target.value; const p=e.target.selectionStart; waRender(); const i=$('#wa-q'); if(i){ i.focus(); try{ i.setSelectionRange(p,p); }catch(x){} } } });
(function(){ const v=$('#v-bajas'); if(!v||$('#wa-card')) return; const c=document.createElement('div'); c.className='card wa-card'; c.id='wa-card'; c.style.display='none';
  const k=$('#kpisAnt'); v.insertBefore(c,k?k.nextSibling:null); })();
const _ovWa=App.onView; App.onView=(id,f)=>{ _ovWa(id,f); if(id==='v-bajas') waRender(); };
const _rfWa=App.refresh; App.refresh=()=>{ _rfWa(); requestAnimationFrame(()=>{ try{ if($('#v-bajas')&&$('#v-bajas').classList.contains('on')) waRender(); }catch(e){} }); };
