/* ================================================================
   NÓMINA: plantel por tipo (efectivos, fuera de convenio, eventuales),
   sector y turno.
   Se arma con cualquiera de estos archivos (se pueden combinar):
   · export de Movimientos del reloj → quién está y de qué tipo (código de empresa)
   · cualquier Excel con Legajo y Apellido/Nombre (+ Sector, Turno, Tipo/Convenio/U.O.)
     por ejemplo: planilla de vacaciones, control de eventuales, padrón propio
   Lo que falte de sector y turno se completa con el plan de francos.
   ================================================================ */
const NM_TIPO={EF:'Efectivos',FC:'Fuera de convenio',EV:'Eventuales',EXT:'Personal externo','':'Sin clasificar'};
const NM_COL={EF:'#22d3ee',FC:'#a78bfa',EV:'#f59e0b',EXT:'#34d399','':'#64748b'};
function nmTipo(t){ t=normTxt(t);
  if(!t) return '';
  if(/^EXT\b|EXTERN/.test(t)) return 'EXT';
  if(/FUERA DE CONVENIO|\bF\.?C\b|GLD[\s-]*FC/.test(t)) return 'FC';
  if(/EVENTUAL|JORNALIZ|\bM\.?M\b|180 DIAS|TEMPORA|\bGL\b(?! ?D)/.test(t)) return 'EV';
  if(/EFECTIV|CONVENIO|CAMIONERO|\bGLD\b|ENDOSOS/.test(t)) return 'EF';
  return ''; }
const NM_COORD=new Set(['285485']);   // Falcón Franco Javier: coordinador eventual → fuera de convenio
const nmLeg=v=>String(v==null?'':v).trim().replace(/\.0+$/,'').replace(/^0+(?=\d)/,'');
function nmParse(rows,name){
  const mh=esMovimientos(rows);
  if(mh>=0){ const M=parseMovimientos(rows,mh), out={};
    for(const [leg,e] of Object.entries(M.emps)) out[leg]={leg,nombre:e.n,tipo:nmTipo(e.c),src:'reloj'};
    return {emps:out,roster:true,desc:`Movimientos del ${dmy(M.d0)} al ${dmy(M.d1)}`}; }
  let hi=-1, H=[];
  for(let i=0;i<Math.min(rows.length,20);i++){ const h=(rows[i]||[]).map(c=>normTxt(c));
    if(h.some(x=>/^LEGAJO|^LEG\b|NRO\.? DE LEGAJO|CODIGO DE EMPLEADO/.test(x))&&h.some(x=>/NOMBRE|APELLIDO/.test(x))){ hi=i; H=h; break; } }
  if(hi<0) return null;
  const ix=re=>H.findIndex(x=>re.test(x));
  const cL=ix(/^LEGAJO|^LEG\b|NRO\.? DE LEGAJO|CODIGO DE EMPLEADO/), cN=ix(/APELLIDO|NOMBRE/), cS=ix(/^SECTOR|^AREA|^TAREA|PUESTO/), cT=ix(/^TURNO/),
    cTp=ix(/^TIPO|CONVENIO|CONDICION|MODALIDAD/), cU=ix(/U\.?O\.?|CODIGO DE EMPRESA|EMPRESA/), cI=ix(/INGRESO/), cE=ix(/EGRESO/);
  const cEst=H.map((x,i)=>/^ESTADO/.test(x)?i:-1).filter(i=>i>=0);   // planilla de eventuales: "Estado" ACTIVO / BAJA
  const out={};
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue; const leg=nmLeg(r[cL]); if(!leg||!/^\d+$/.test(leg)) continue;
    const e=out[leg]||(out[leg]={leg,src:name});
    if(r[cN]) e.nombre=String(r[cN]).trim();
    if(cS>=0&&r[cS]!=null&&String(r[cS]).trim()&&!/^(SI|NO)$/i.test(String(r[cS]).trim())) e.sector=normTxt(r[cS]);
    if(cT>=0&&r[cT]!=null&&String(r[cT]).trim()) e.turno=normTxt(r[cT]);
    const tp=nmTipo(cTp>=0?r[cTp]:'')||nmTipo(cU>=0?r[cU]:''); if(tp){ e.tipo=tp; e.tipoF=tp; }
    if(cI>=0&&r[cI]) e.ingreso=excelDateToISO(r[cI])||e.ingreso;
    if(cE>=0&&r[cE]) { const x=excelDateToISO(r[cE]); if(x) e.egreso=x; }
    if(cEst.length){ e.tipo='EV'; delete e.tipoF;   // sin tipo fijo: el reloj puede corregirlo (ej. coordinadores FC)
        // todo lo de la planilla de eventuales es eventual
      const v=cEst.map(c=>normTxt(r[c]||'')).filter(Boolean); if(v.some(x=>/BAJA/.test(x))) e.baja=true; else if(v.some(x=>/ACTIVO/.test(x))) e.baja=false; } }
  const nAct=Object.values(out).filter(e=>!e.baja).length;
  return Object.keys(out).length?{emps:out,roster:false,ev:cEst.length>0,desc:cEst.length?`planilla de eventuales: ${nAct} activo(s)`:`${Object.keys(out).length} legajo(s)`}:null;
}
async function loadNomina(files){
  if(typeof XLSX==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  DB.nomina=DB.nomina||{emps:{},files:[]}; const N=DB.nomina; let ok=0, err=[], evFiles=[];
  for(const f of files){
    try{ const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}); let got=null;
      for(const sn of wb.SheetNames){ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:false}); const p=nmParse(rows,f.name); if(p&&(!got||Object.keys(p.emps).length>Object.keys(got.emps).length)) got=p; }
      if(!got){ err.push(f.name); continue; }
      if(got.ev) evFiles.push(f);
      if(got.roster){   // el reloj define quién está: se conservan sector y turno ya cargados
        const prev=N.emps; N.emps={};
        for(const [leg,e] of Object.entries(got.emps)){ const p=prev[leg]||{}; N.emps[leg]=Object.assign({},p,e,{sector:p.sector,turno:p.turno,ingreso:p.ingreso,tipoF:p.tipoF}); }
        N.roster={file:f.name,at:new Date().toISOString(),desc:got.desc}; }
      else for(const [leg,e] of Object.entries(got.emps)){ const p=N.emps[leg]; if(!p&&N.roster) continue;   // con reloj cargado, solo completa a los que están
        const propio=p&&got.ev&&/ANTIG/i.test(p.src||'');   // vino de una carga anterior de esta misma planilla
        if(e.baja){ if(p&&(propio||(p.tipoF||p.tipo||'EV')==='EV')) delete N.emps[leg]; continue; }   // de baja como eventual: sale (y no entra si no estaba); si ya es efectivo/FC por otro lado, queda
        const x=Object.fromEntries(Object.entries(e).filter(([k,v])=>v!=null&&v!==''&&k!=='baja'));
        if(got.ev&&p&&!propio&&(p.tipoF||p.tipo)){ delete x.tipo; delete x.tipoF; delete x.src; }   // la planilla de eventuales no cambia el tipo de quien ya está (ej. coordinadores FC)
        if(propio) delete p.tipoF;   // limpia el tipo fijado por la carga anterior: al recargar el reloj vuelve el real
        N.emps[leg]=Object.assign(p||{leg},x); }
      N.files=(N.files||[]).filter(x=>x.file!==f.name).concat({file:f.name,at:new Date().toISOString(),desc:got.desc,roster:got.roster}).slice(-12);
      ok++; }
    catch(e){ console.error(e); err.push(f.name); } }
  N.at=new Date().toISOString(); await persist(); renderNomina(); App.refresh();
  // si se subió la planilla de eventuales, también se actualiza la sección Eventuales (y con ella Francos y Cumpleaños)
  for(const f of evFiles){ if(canEditMod('eventuales')&&typeof loadAntFile==='function') { await loadAntFile(f); renderNomina(); } else App.toast('La planilla de eventuales actualizó la nómina; para que Francos la tome tiene que subirla alguien con permiso de Eventuales.',true); }
  if(ok) App.toast(`Nómina actualizada: ${Object.keys(N.emps).length} persona(s)`);
  if(err.length) App.toast(`No reconocí: ${err.join(', ')}. Necesita columnas Legajo y Apellido/Nombre, o el export de Movimientos.`,true);
}
// nómina con sector y turno completados desde el plan de francos cuando falten
function nmRows(){
  const N=DB.nomina; if(!N||!N.emps) return [];
  const fr={}; try{ FRE().forEach(e=>{ if(e.legajo) fr[nmLeg(e.legajo)]=e; }); }catch(e){}
  const hoyI=hoy();
  // agregados a mano (ej. delegados, que no fichan): se suman y pisan sector/tipo aunque se recargue el reloj
  const base=Object.assign({},N.emps); Object.values(N.extra||{}).forEach(x=>{ if(x&&x.leg) base[x.leg]=Object.assign({},base[x.leg]||{},Object.fromEntries(Object.entries(x).filter(([k,v])=>v!=null&&v!==''&&k!=='at'&&k!=='por'))); });
  // la planilla de Eventuales manda para los eventuales: los de baja salen y los activos que faltan entran
  try{ if(typeof antRows==='function'&&DB.ant){ const A=antRows(), ok=v=>v&&v!=='SIN DATO', act=new Set(A.filter(a=>a.activo).map(a=>nmLeg(a.legajo)));
    // eventuales que no están activos en la planilla (ni siquiera figuran): salen; la planilla es la fuente de verdad
    for(const l of Object.keys(base)){ const e=base[l]; if((e.tipoF||e.tipo)==='EV'&&!act.has(l)&&!(N.extra||{})[l]) delete base[l]; }
    for(const a of A){ const l=nmLeg(a.legajo); if(!l) continue; const e=base[l];
      if(!a.activo){ if(e&&(e.tipoF||e.tipo||'EV')==='EV'&&!(N.extra||{})[l]) delete base[l]; continue; }
      if(!e) base[l]={leg:l,nombre:a.nombre,tipo:'EV',sector:ok(a.tarea)?normTxt(a.tarea):'',turno:ok(a.turno)?normTxt(a.turno):'',ingreso:a.ingreso||'',src:'eventuales'};
      else if(!e.sector&&ok(a.tarea)) base[l]=Object.assign({},e,{sector:normTxt(a.tarea)}); } } }catch(err){ console.warn('nómina/eventuales',err); }
  return Object.values(base).filter(e=>!(e.egreso&&e.egreso<hoyI)).map(e=>{ const f=fr[e.leg]||{};
    let tipo=e.tipoF||e.tipo||(f.legajo?'EV':'');
    if(tipo==='EV'&&(NM_COORD.has(e.leg)||/COORDINAD/.test(e.sector||'')||/COORDINAD/.test(normTxt(f.sector||'')))) tipo='FC';   // coordinadores eventuales cuentan como fuera de convenio
    return {leg:e.leg,nombre:e.nombre||f.nombre||'',tipo,sector:e.sector||normTxt(f.sector)||'SIN SECTOR',turno:e.turno||normTxt(f.turno)||'SIN TURNO',ingreso:e.ingreso||f.ingreso||''}; })
    .sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
let nmState={tipos:[],sectores:[],turnos:[],q:'',frio:false};
function nmMsel(sel,key,lab,vals,labf){
  const box=$(sel); if(!box) return; const cnt={}; vals.forEach(k=>cnt[k]=(cnt[k]||0)+1);
  const ks=Object.keys(cnt).sort((a,b)=>String(labf?labf(a):a).localeCompare(String(labf?labf(b):b),'es'));
  nmState[key]=nmState[key].filter(k=>cnt[k]); const on=nmState[key], open=box.classList.contains('open'), L=k=>labf?labf(k):k;
  box.innerHTML=`<button type="button" class="msel-b">${esc(lab)}: <b>${on.length?(on.length===1?esc(L(on[0])):on.length+' elegidos'):'Todos'}</b><span>▾</span></button>
    <div class="msel-p"><div class="msel-a"><button type="button" data-nm-all="${key}">Marcar todos</button><button type="button" data-nm-none="${key}">Limpiar</button></div>
    ${ks.map(k=>`<label><input type="checkbox" data-nm="${key}" value="${esc(k)}"${on.includes(k)?' checked':''}><span>${esc(L(k))}</span><b>${cnt[k]}</b></label>`).join('')}</div>`;
  box.classList.toggle('open',open); box.classList.toggle('act',!!on.length);
}
function nmFiltered(R){ const q=nmState.q.trim().toLowerCase();
  return R.filter(r=>(!nmState.tipos.length||nmState.tipos.includes(r.tipo))&&(!nmState.sectores.length||nmState.sectores.includes(r.sector))&&(!nmState.turnos.length||nmState.turnos.includes(r.turno))&&(!q||r.nombre.toLowerCase().includes(q)||r.leg.includes(q))&&(!nmState.frio||esFrio(r.leg))); }
function nmGroup(R,k){ const g={}; R.forEach(r=>{ const x=g[r[k]]||(g[r[k]]={EF:0,FC:0,EV:0,EXT:0,'':0,t:0}); x[r.tipo]++; x.t++; }); return g; }
function renderNomina(){
  if(!$('#v-nomina')) return;
  const N=DB.nomina, ALL=nmRows();
  $('#nm-st').innerHTML=N&&N.files&&N.files.length?N.files.slice().reverse().slice(0,4).map(f=>`<div>${f.roster?'<b>Reloj</b>':'<b>Datos</b>'} · ${esc(f.file)} · ${esc(f.desc||'')} · ${fmtAt(f.at)}</div>`).join(''):'Sin cargar';
  $('#nm-drop').classList.toggle('ok',!!ALL.length);
  nmMsel('#nm-mt','tipos','Tipo',ALL.map(r=>r.tipo),k=>NM_TIPO[k]);
  nmMsel('#nm-ms','sectores','Sector',ALL.map(r=>r.sector));
  nmMsel('#nm-mu','turnos','Turno',ALL.map(r=>r.turno));
  const R=nmFiltered(ALL), c=k=>R.filter(r=>r.tipo===k).length, sc=ALL.filter(r=>!r.tipo).length;
  $('#nm-kpis').innerHTML=[{l:'Total',v:R.length,s:R.length!==ALL.length?`de ${ALL.length} con el filtro`:'personas en nómina',c:''},{l:'Efectivos',v:c('EF'),s:'en convenio',c:'acc-cyan'},{l:'Fuera de convenio',v:c('FC'),s:'GLD FC',c:''},{l:'Eventuales',v:c('EV'),s:'jornalizados',c:'acc-ochre'},{l:'❄ Apto frío',v:R.filter(r=>r.tipo==='EV'&&esFrio(r.leg)).length,s:nmState.frio?'mostrando solo ellos · clic para ver todos':'eventuales · clic para ver solo ellos',c:'acc-cyan nm-frk'+(nmState.frio?' on':'')}].concat(ALL.some(r=>r.tipo==='EXT')?[{l:'Personal externo',v:c('EXT'),s:'EXT',c:''}]:[])
    .concat(sc?[{l:'Sin clasificar',v:R.filter(r=>!r.tipo).length,s:'cargá el Movimientos del reloj',c:'acc-alert'}]:[])
    .map(k=>`<div class="kpi ${k.c}"><div class="lab">${esc(k.l)}</div><div class="val">${esc(k.v)}</div><div class="sub">${esc(k.s)}</div></div>`).join('');
  const tbl=(id,key,lab)=>{ const g=nmGroup(R,key), ks=Object.keys(g).sort((a,b)=>g[b].t-g[a].t||a.localeCompare(b,'es'));
    $(id).innerHTML=ks.length?`<thead><tr><th>${lab}</th><th class="num">Efectivos</th><th class="num">Fuera conv.</th><th class="num">Eventuales</th><th class="num">Externos</th><th class="num">Total</th><th style="width:34%"></th></tr></thead><tbody>`+
      ks.map(k=>{ const x=g[k], m=Math.max(...ks.map(z=>g[z].t)); return `<tr><td><b>${esc(k)}</b></td><td class="num">${x.EF||''}</td><td class="num">${x.FC||''}</td><td class="num">${x.EV||''}</td><td class="num">${x.EXT||''}</td><td class="num"><b>${x.t}</b></td>
        <td><div class="nm-bar">${['EF','FC','EV','EXT',''].map(t=>x[t]?`<i style="width:${x[t]/m*100}%;background:${NM_COL[t]}" title="${NM_TIPO[t]}: ${x[t]}"></i>`:'').join('')}</div></td></tr>`; }).join('')+
      `<tr class="tot"><td>Total</td><td class="num">${c('EF')}</td><td class="num">${c('FC')}</td><td class="num">${c('EV')}</td><td class="num">${c('EXT')}</td><td class="num">${R.length}</td><td></td></tr></tbody>`
      :'<tbody><tr><td><div class="empty">Sin datos con este filtro.</div></td></tr></tbody>'; };
  tbl('#nm-sec','sector','Sector'); tbl('#nm-tur','turno','Turno');
  // matriz sector × turno
  const ts=uniq(R.map(r=>r.turno)).sort((a,b)=>a.localeCompare(b,'es')), ss=uniq(R.map(r=>r.sector)).sort((a,b)=>a.localeCompare(b,'es'));
  const cell=(s,t)=>R.filter(r=>r.sector===s&&r.turno===t).length;
  $('#nm-mx').innerHTML=ss.length?`<thead><tr><th>Sector \\ Turno</th>${ts.map(t=>`<th class="num">${esc(t)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>`+
    ss.map(s=>`<tr><td><b>${esc(s)}</b></td>${ts.map(t=>{ const n=cell(s,t); return `<td class="num nm-c" style="--a:${n?Math.min(.55,.08+n/Math.max(1,R.length)*4):0}">${n||''}</td>`; }).join('')}<td class="num"><b>${R.filter(r=>r.sector===s).length}</b></td></tr>`).join('')+
    `<tr class="tot"><td>Total</td>${ts.map(t=>`<td class="num">${R.filter(r=>r.turno===t).length}</td>`).join('')}<td class="num">${R.length}</td></tr></tbody>`:'<tbody><tr><td><div class="empty">Sin datos.</div></td></tr></tbody>';
  // detalle
  $('#nm-n').textContent=`${R.length} persona(s)`;
  $('#nm-det').innerHTML=R.length?`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Tipo</th><th>Sector</th><th>Turno</th><th>Ingreso</th></tr></thead><tbody>`+
    R.map(r=>`<tr><td class="mono">${esc(r.leg)}</td><td><b>${esc(r.nombre)}</b>${FRIO(r.leg)}${r.tipo==='EV'&&canEditMod('eventuales')?`<button class="frio-tg${esFrio(r.leg)?' on':''}" data-frio="${esc(r.leg)}" title="${esFrio(r.leg)?'Quitar apto frío':'Marcar apto frío'}">${esFrio(r.leg)?'quitar ❄':'+ ❄'}</button>`:''}</td><td><span class="nm-tp" style="--c:${NM_COL[r.tipo]}">${esc(NM_TIPO[r.tipo])}</span></td><td>${esc(r.sector)}</td><td>${esc(r.turno)}</td><td class="mono">${r.ingreso?dmy(r.ingreso):''}</td></tr>`).join('')+'</tbody>'
    :`<tbody><tr><td><div class="empty">${ALL.length?'Nadie con este filtro.':'Cargá el export de Movimientos del reloj y, si querés, una planilla con sector y turno.'}</div></td></tr></tbody>`;
}
const nmFiltroTxt=()=>[nmState.tipos.length?'Tipo: '+nmState.tipos.map(k=>NM_TIPO[k]).join(', '):'',nmState.sectores.length?'Sector: '+nmState.sectores.join(', '):'',nmState.turnos.length?'Turno: '+nmState.turnos.join(', '):'',nmState.q?'Búsqueda: '+nmState.q:'',nmState.frio?'Solo apto frío':''].filter(Boolean).join(' · ')||'Sin filtros (toda la nómina)';
function nmExcel(){
  const R=nmFiltered(nmRows()); if(!R.length){ App.toast('No hay datos para exportar.',true); return; }
  const wb=XLSX.utils.book_new(), sum=k=>R.filter(r=>r.tipo===k).length;
  const res=[['NÓMINA · CD ISIDRO CASANOVA'],['Generado',fmtAt(new Date().toISOString())],['Filtro',nmFiltroTxt()],[],['Tipo','Personas'],['Efectivos',sum('EF')],['Fuera de convenio',sum('FC')],['Eventuales',sum('EV')],['Personal externo',sum('EXT')]].concat(sum('')?[['Sin clasificar',sum('')]]:[]).concat([['Total',R.length]]);
  const w0=XLSX.utils.aoa_to_sheet(res); w0['!cols']=[{wch:22},{wch:40}]; XLSX.utils.book_append_sheet(wb,w0,'Resumen');
  for(const [k,lab] of [['sector','Por sector'],['turno','Por turno']]){ const g=nmGroup(R,k);
    const a=[[k==='sector'?'Sector':'Turno','Efectivos','Fuera de convenio','Eventuales','Personal externo','Sin clasificar','Total']].concat(Object.keys(g).sort((x,y)=>x.localeCompare(y,'es')).map(s=>[s,g[s].EF,g[s].FC,g[s].EV,g[s].EXT,g[s][''],g[s].t])).concat([['Total',sum('EF'),sum('FC'),sum('EV'),sum('EXT'),sum(''),R.length]]);
    const w=XLSX.utils.aoa_to_sheet(a); w['!cols']=[{wch:26},{wch:11},{wch:17},{wch:11},{wch:16},{wch:13},{wch:9}]; XLSX.utils.book_append_sheet(wb,w,lab); }
  const ts=uniq(R.map(r=>r.turno)).sort(), ss=uniq(R.map(r=>r.sector)).sort();
  const mx=[['Sector \\ Turno'].concat(ts,['Total'])].concat(ss.map(s=>[s].concat(ts.map(t=>R.filter(r=>r.sector===s&&r.turno===t).length),[R.filter(r=>r.sector===s).length]))).concat([['Total'].concat(ts.map(t=>R.filter(r=>r.turno===t).length),[R.length])]);
  const w3=XLSX.utils.aoa_to_sheet(mx); w3['!cols']=[{wch:26}].concat(ts.map(()=>({wch:12})),[{wch:9}]); XLSX.utils.book_append_sheet(wb,w3,'Sector x turno');
  const det=[['Legajo','Apellido y nombre','Tipo','Sector','Turno','Ingreso','Apto frío']].concat(R.map(r=>[r.leg,r.nombre,NM_TIPO[r.tipo],r.sector,r.turno,r.ingreso?dmy(r.ingreso):'',esFrio(r.leg)?'Sí':'']));
  const w4=XLSX.utils.aoa_to_sheet(det); w4['!cols']=[{wch:9},{wch:34},{wch:17},{wch:22},{wch:16},{wch:11}]; w4['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:det.length-1,c:5}})}; XLSX.utils.book_append_sheet(wb,w4,'Detalle');
  XLSX.writeFile(wb,`nomina_${hoy()}.xlsx`); App.toast('Excel de nómina descargado');
}
function nmInforme(){
  const R=nmFiltered(nmRows()); if(!R.length){ App.toast('No hay datos para el informe.',true); return; }
  const sum=k=>R.filter(r=>r.tipo===k).length;
  const grp=(k,lab)=>{ const g=nmGroup(R,k); return `<h2>${lab}</h2><table><thead><tr><th class="l">${lab.replace('Por ','')}</th><th>Efectivos</th><th>Fuera de convenio</th><th>Eventuales</th><th>Externos</th><th>Total</th></tr></thead><tbody>${Object.keys(g).sort((a,b)=>g[b].t-g[a].t).map(s=>`<tr><td class="l">${esc(s)}</td><td>${g[s].EF||''}</td><td>${g[s].FC||''}</td><td>${g[s].EV||''}</td><td>${g[s].EXT||''}</td><td><b>${g[s].t}</b></td></tr>`).join('')}<tr class="t"><td class="l">Total</td><td>${sum('EF')}</td><td>${sum('FC')}</td><td>${sum('EV')}</td><td>${sum('EXT')}</td><td>${R.length}</td></tr></tbody></table>`; };
  const ts=uniq(R.map(r=>r.turno)).sort(), ss=uniq(R.map(r=>r.sector)).sort();
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Nómina · ${dmy(hoy())}</title><style>
  @page{size:A4;margin:12mm} body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;font-size:12px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#475569;margin:0 0 14px} .k{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px} .k div{border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px;min-width:120px} .k b{display:block;font-size:22px} .k span{font-size:11px;color:#475569;text-transform:uppercase}
  h2{font-size:14px;margin:18px 0 6px} table{border-collapse:collapse;width:100%;margin:0 0 10px} th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:center} th{background:#f1f5f9;font-size:11px} .l{text-align:left} tr.t td{font-weight:700;background:#f8fafc}
  .pb{page-break-before:always} tr{page-break-inside:avoid} button{font:inherit;padding:7px 14px;border-radius:6px;border:0;background:#0f172a;color:#fff;cursor:pointer;margin-bottom:12px} @media print{button{display:none}}</style></head><body>
  <button onclick="window.print()">Imprimir / guardar PDF</button>
  <h1>Nómina · CD Isidro Casanova</h1><p class="sub">${esc(nmFiltroTxt())} · generado ${fmtAt(new Date().toISOString())}</p>
  <div class="k"><div><span>Total</span><b>${R.length}</b></div><div><span>Efectivos</span><b>${sum('EF')}</b></div><div><span>Fuera de convenio</span><b>${sum('FC')}</b></div><div><span>Eventuales</span><b>${sum('EV')}</b></div>${sum('EXT')?`<div><span>Personal externo</span><b>${sum('EXT')}</b></div>`:''}${sum('')?`<div><span>Sin clasificar</span><b>${sum('')}</b></div>`:''}</div>
  ${grp('sector','Por sector')}${grp('turno','Por turno')}
  <h2>Sector × turno</h2><table><thead><tr><th class="l">Sector</th>${ts.map(t=>`<th>${esc(t)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ss.map(s=>`<tr><td class="l">${esc(s)}</td>${ts.map(t=>`<td>${R.filter(r=>r.sector===s&&r.turno===t).length||''}</td>`).join('')}<td><b>${R.filter(r=>r.sector===s).length}</b></td></tr>`).join('')}</tbody></table>
  <h2 class="pb">Detalle</h2><table><thead><tr><th>Legajo</th><th class="l">Apellido y nombre</th><th>Tipo</th><th class="l">Sector</th><th class="l">Turno</th></tr></thead><tbody>${R.map(r=>`<tr><td>${esc(r.leg)}</td><td class="l">${esc(r.nombre)}</td><td>${esc(NM_TIPO[r.tipo])}</td><td class="l">${esc(r.sector)}</td><td class="l">${esc(r.turno)}</td></tr>`).join('')}</tbody></table>
  </body></html>`;
  download(html,`informe_nomina_${hoy()}.html`,'text/html;charset=utf-8'); App.toast('Informe descargado: abrilo y usá Imprimir para PDF');
}
function hookNomina(){
  $('#nm-pick').onclick=()=>$('#nm-file').click();
  $('#nm-file').onchange=e=>{ const f=[...e.target.files]; if(f.length) loadNomina(f); e.target.value=''; };
  const z=$('#nm-drop'); ['dragenter','dragover'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.add('hot')})); ['dragleave','drop'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.remove('hot')}));
  z.addEventListener('drop',e=>{ const f=[...e.dataTransfer.files]; if(f.length) loadNomina(f); });
  $('#nm-xls').onclick=nmExcel; $('#nm-rep').onclick=nmInforme;
  $('#nm-del').onclick=async()=>{ if(!confirm('¿Vaciar la nómina cargada?')) return; DB.nomina=null; await persist(); renderNomina(); App.toast('Nómina vaciada'); };
  let qt; $('#nm-q').oninput=e=>{ clearTimeout(qt); qt=setTimeout(()=>{ nmState.q=e.target.value; renderNomina(); },200); };
  document.addEventListener('click',async e=>{ if(!e.target.closest('#v-nomina')) return;
    if(e.target.closest('.nm-frk')){ nmState.frio=!nmState.frio; renderNomina(); return; }
    const tg=e.target.closest('[data-frio]'); if(tg){ const l=nmLeg(tg.dataset.frio); DB.aptoFrio=Object.assign({},DB.aptoFrio||{}); const r=nmRows().find(x=>x.leg===l);
      if(DB.aptoFrio[l]) delete DB.aptoFrio[l]; else DB.aptoFrio[l]={n:r?r.nombre:'',at:new Date().toISOString(),por:window.SRV&&SRV.user?SRV.user.nombre:''};
      await persist(); renderNomina(); App.refresh(); App.toast(DB.aptoFrio[l]?`❄ ${r?r.nombre:l}: apto frío`:`${r?r.nombre:l}: sin apto frío`); return; }
    const mb=e.target.closest('.msel-b'); if(mb){ const m=mb.parentElement, was=m.classList.contains('open'); document.querySelectorAll('#v-nomina .msel.open').forEach(x=>x.classList.remove('open')); m.classList.toggle('open',!was); return; }
    const ma=e.target.closest('[data-nm-all],[data-nm-none]'); if(ma){ const k=ma.dataset.nmAll||ma.dataset.nmNone; nmState[k]=ma.dataset.nmAll?[...ma.closest('.msel').querySelectorAll('input[data-nm]')].map(i=>i.value):[]; renderNomina(); return; } });
  document.addEventListener('change',e=>{ const c=e.target.closest('input[data-nm]'); if(!c) return; const k=c.dataset.nm; nmState[k]=c.checked?uniq(nmState[k].concat(c.value)):nmState[k].filter(x=>x!==c.value); renderNomina(); });
}
const _ovNm=App.onView; App.onView=(id,f)=>{ _ovNm(id,f); if(id==='v-nomina') renderNomina(); };
INTRO['v-nomina']=()=>{ const R=nmRows(); return {t:'Nómina',p:R.length?`${R.length} personas · ${R.filter(r=>r.tipo==='EF').length} efectivos · ${R.filter(r=>r.tipo==='EV').length} eventuales`:'Plantel por tipo, sector y turno',svg:`<svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
  ${[0,1,2,3,4].map(i=>`<g class="i-nm${i%3}"><circle cx="${70+i*45}" cy="78" r="13" fill="${['#22d3ee','#a78bfa','#f59e0b','#22d3ee','#f59e0b'][i]}"/><path d="M${50+i*45} 122c0-14 9-24 20-24s20 10 20 24z" fill="${['#22d3ee','#a78bfa','#f59e0b','#22d3ee','#f59e0b'][i]}" opacity=".8"/></g>`).join('')}
  <rect x="48" y="138" width="224" height="8" rx="4" fill="#13203a"/><rect x="48" y="138" width="130" height="8" rx="4" fill="#22d3ee"/><rect x="178" y="138" width="30" height="8" fill="#a78bfa"/><rect x="208" y="138" width="64" height="8" rx="4" fill="#f59e0b"/></svg>`}; };
try{ hookNomina(); }catch(e){ console.error('nomina',e); }
