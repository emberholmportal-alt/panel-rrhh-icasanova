/* ================================================================
   MENÚ SEMANAL (comedor) y CUMPLEAÑOS
   · Menú: se carga por semana (lunes a sábado: menú del día + 3 opciones).
     Lo ven todos; lo edita quien tenga permiso. Inicio muestra el menú de hoy.
   · Cumpleaños: se carga el Excel de fechas de nacimiento (hojas GLD, FC, GL…)
     y se descarga la planilla del mes.
   ================================================================ */
const MN_DIAS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MN_FILAS=[['m','Plato del día'],['o1','Opción 1'],['o2','Opción 2'],['o3','Opción 3']];
const lunesDe=iso=>{ const d=dObj(iso), w=d.getDay(); return addD(iso,w===0?1:1-w); };   // domingo → semana siguiente
let mnState={sem:''};
const canEditMod=m=>!(window.SRV&&SRV.mode==='online')||SRV.user.rol==='admin'||(SRV.user.perms&&SRV.user.perms[m])==='editar';
function mnSemana(lun){ DB.menu=DB.menu||{semanas:{}}; return DB.menu.semanas[lun]||null; }
function mnHoy(){ const h=hoy(), s=DB.menu&&DB.menu.semanas&&DB.menu.semanas[lunesDe(h)]; return s&&s.dias&&s.dias[h]||null; }
function renderMenu(){
  if(!$('#v-menu')) return;
  if(!mnState.sem) mnState.sem=lunesDe(hoy());
  const L=mnState.sem, S=mnSemana(L)||{dias:{}}, ed=canEditMod('menu'), dias=MN_DIAS.map((n,i)=>addD(L,i));
  $('#mn-sem').value=L; $('#mn-rango').textContent=`Semana del ${dmy(L)} al ${dmy(addD(L,5))}`;
  $('#mn-meta').textContent=S.at?`Cargado por ${S.by||'—'} · ${fmtAt(S.at)}`:'Sin cargar';
  $('#mn-ed').style.display=ed?'':'none';
  $('#mn-grid').innerHTML=`<thead><tr><th></th>${dias.map((d,i)=>`<th class="${d===hoy()?'hoy':''}"><b>${MN_DIAS[i]}</b><span>${dObj(d).getDate()}/${dObj(d).getMonth()+1}</span>${cxFer(d)?'<em>feriado</em>':''}</th>`).join('')}</tr></thead><tbody>`+
    MN_FILAS.map(([k,lab])=>`<tr><th>${lab}</th>${dias.map(d=>{ const v=(S.dias[d]||{})[k]||''; return `<td class="${d===hoy()?'hoy':''}">${ed?`<textarea data-mn="${d}|${k}" rows="3" placeholder="—">${esc(v)}</textarea>`:`<div class="mn-v">${esc(v)||'<span class="mn-x">—</span>'}</div>`}</td>`; }).join('')}</tr>`).join('')+'</tbody>';
  $('#mn-nota').value=S.nota||''; $('#mn-nota').readOnly=!ed;
}
function mnLeer(){ const L=mnState.sem, S={dias:{},nota:$('#mn-nota').value.trim()};
  document.querySelectorAll('#mn-grid textarea[data-mn]').forEach(t=>{ const [d,k]=t.dataset.mn.split('|'), v=t.value.trim(); if(v){ (S.dias[d]=S.dias[d]||{})[k]=v; } });
  return S; }
async function mnGuardar(){
  const S=mnLeer(); S.at=new Date().toISOString(); S.by=(window.SRV&&SRV.user&&SRV.user.nombre)||NOMBRE();
  DB.menu=DB.menu||{semanas:{}}; DB.menu.semanas[mnState.sem]=S;
  // se guardan las últimas 12 semanas
  const ks=Object.keys(DB.menu.semanas).sort(); ks.slice(0,Math.max(0,ks.length-12)).forEach(k=>delete DB.menu.semanas[k]);
  await persist(); renderMenu(); App.refresh(); App.toast('Menú de la semana guardado');
}
// subir el Excel del comedor: filas MENÚ / OP1 / OP2 / OP3 (o Menú I a IV) y columnas de lunes a sábado.
// Si el encabezado trae fechas ("Lunes 16/11"), el menú se carga en esa semana; si no, en la que está a la vista.
async function mnSubir(f){
  if(typeof XLSX==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  try{
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
    const fila=t=>{ const x=normTxt(t).replace(/\./g,'').replace(/\s+/g,' ');
      if(/^(MENU( DEL DIA)?|MENU I|MENU 1|OPCION 0)$/.test(x)) return 'm';
      if(/^(OP ?1|OPCION 1|MENU II|MENU 2)$/.test(x)) return 'o1';
      if(/^(OP ?2|OPCION 2|MENU III|MENU 3)$/.test(x)) return 'o2';
      if(/^(OP ?3|OPCION 3|MENU IV|MENU 4)$/.test(x)) return 'o3'; return ''; };
    let got=null;
    for(const sn of wb.SheetNames){ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,defval:''});
      const set={}; let hi=-1; rows.forEach((r,i)=>{ const k=fila(r[0]); if(k&&!set[k]){ set[k]=r; if(hi<0) hi=i; } });
      if(Object.keys(set).length){ got={set,head:rows.slice(0,Math.max(0,hi)).reverse().find(r=>r.slice(1).some(c=>String(c).trim()))||[]}; break; } }
    if(!got){ App.toast('No reconocí el Excel: necesito filas MENÚ, OP1, OP2 y OP3 (o Menú I a IV) con los días en columnas.',true); return; }
    // semana: la primera fecha dd/mm del encabezado
    const m=got.head.map(c=>String(c)).join(' ').match(/(\d{1,2})\/(\d{1,2})/);
    if(m){ const y=new Date().getFullYear(); let best=null; for(const yy of [y-1,y,y+1]){ const iso=`${yy}-${pad(+m[2])}-${pad(+m[1])}`; if(!best||Math.abs(dObj(iso)-new Date())<Math.abs(dObj(best)-new Date())) best=iso; } mnState.sem=lunesDe(best); }
    renderMenu();
    const L=mnState.sem; let n=0;
    for(const [k,r] of Object.entries(got.set)){ const cells=r.slice(1).map(c=>String(c).replace(/\s+/g,' ').trim());
      MN_DIAS.forEach((_,i)=>{ const t=document.querySelector(`#mn-grid textarea[data-mn="${addD(L,i)}|${k}"]`); if(t&&cells[i]!=null){ t.value=cells[i]; if(cells[i]) n++; } }); }
    if(!n){ App.toast('El Excel no trae platos en las columnas de lunes a sábado.',true); return; }
    await mnGuardar(); App.toast(`Menú de la semana del ${dmy(L)} cargado desde ${f.name}: ${n} platos`);
  }catch(e){ App.toast('No se pudo leer el Excel: '+e.message,true); }
}
// pegar la tabla copiada del Excel del comedor (filas MENÚ / OP1 / OP2 / OP3, 6 columnas)
function mnPegar(txt){
  const rows=txt.replace(/\r/g,'').split('\n').map(l=>l.split('\t'));
  const pick=re=>rows.find(r=>re.test((r[0]||'').trim()));
  const set={m:pick(/^men/i),o1:pick(/^op\.?\s*1/i),o2:pick(/^op\.?\s*2/i),o3:pick(/^op\.?\s*3/i)};
  let usadas=Object.values(set).filter(Boolean).length;
  if(!usadas){ const full=rows.filter(r=>r.filter(c=>c.trim()).length>=5).slice(-4); ['m','o1','o2','o3'].forEach((k,i)=>{ if(full[i]) set[k]=['x'].concat(full[i]); }); usadas=full.length; }
  if(!usadas){ App.toast('No reconocí la tabla. Copiá desde el Excel las filas MENÚ, OP1, OP2 y OP3.',true); return; }
  const L=mnState.sem;
  for(const [k,r] of Object.entries(set)){ if(!r) continue; const cells=r.slice(1).map(c=>c.replace(/\s+/g,' ').trim());
    MN_DIAS.forEach((_,i)=>{ const t=document.querySelector(`#mn-grid textarea[data-mn="${addD(L,i)}|${k}"]`); if(t&&cells[i]!=null) t.value=cells[i]; }); }
  App.toast('Tabla pegada: revisala y tocá Guardar');
}
/* ---------------- cumpleaños ---------------- */
const CU_TIPO=sn=>{ const t=normTxt(sn); return /FC|FUERA/.test(t)?'Fuera de convenio':/^GL$|EVENT|JORNAL/.test(t)?'Eventual':/GLD|EFECT/.test(t)?'Efectivo':/CARREF/.test(t)?'Carrefour':''; };
let cuState={mes:''};
async function loadCumple(files){
  const f=files[0]; if(!f) return;
  try{ const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true}); const emps={};
    const hojas=wb.SheetNames.filter(sn=>!/consolid|^hoja/i.test(sn)); const usar=hojas.length?hojas:wb.SheetNames;
    for(const sn of usar){ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:false});
      let hi=-1,H=[]; for(let i=0;i<Math.min(rows.length,10);i++){ H=(rows[i]||[]).map(c=>normTxt(c)); if(H.some(x=>/LEG|APELLIDO|NOMBRE/.test(x))&&H.some(x=>/NACIM|^FECHA|CUMPLE/.test(x))){ hi=i; break; } }
      if(hi<0) continue;
      const ix=re=>H.findIndex(x=>re.test(x)), cL=ix(/LEG/), cA=ix(/^APELLIDO$/), cN=ix(/^NOMBRE$/), cAN=ix(/APELLIDO Y NOMBRE|APELLIDO, NOMBRE|NOMBRE Y APELLIDO/), cF=ix(/NACIM/)>=0?ix(/NACIM/):ix(/^FECHA|CUMPLE/);
      // hojas sin legajo (ej. personal de Carrefour): se identifican por apellido y nombre
      for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue; const leg=cL>=0&&r[cL]!=null?nmLeg(r[cL]):'', nac=excelDateToISO(r[cF]); if(!nac) continue;
        const nombre=cAN>=0&&r[cAN]?String(r[cAN]).replace(/\s+/g,' ').trim():[r[cA],r[cN]].filter(Boolean).map(x=>String(x).replace(/\s+/g,' ').trim()).join(', ');
        if(!leg&&!nombre) continue; const k=leg||('n:'+sinTilde(nombre));
        if(!emps[k]) emps[k]={leg,nombre,nac,tipo:CU_TIPO(sn)||sn}; } }
    const n=Object.keys(emps).length; if(!n) throw new Error('No encontré columnas de nombre (o legajo) y fecha de nacimiento.');
    DB.cumple={file:f.name,at:new Date().toISOString(),emps:Object.values(emps)}; await persist(); renderCumple(); App.refresh();
    App.toast(`Cumpleaños cargados: ${n} persona(s)`);
  }catch(e){ App.toast(e.message,true); }
}
const sinTilde=s=>normTxt(s).replace(/,/g,' ').replace(/\s+/g,' ').trim();
// eventuales: salen de la planilla de Eventuales (activos con fecha de nacimiento); se copian a Cumpleaños cada vez que se guarda
window.cuSyncEv=function(){
  if(typeof antRows!=='function'||!DB.ant||!canEditMod('cumpleanos')) return;
  const ev=antRows().filter(r=>r.activo&&r.nac).map(r=>({leg:nmLeg(r.legajo),nombre:String(r.nombre||'').replace(/\s+/g,' ').trim(),nac:r.nac,tipo:'Eventual'}))
    .sort((a,b)=>a.leg.localeCompare(b.leg)), bajas=antRows().filter(r=>!r.activo).map(r=>nmLeg(r.legajo)).sort();
  const C=DB.cumple||(DB.cumple={emps:[],file:'',at:''}), k=JSON.stringify([ev,bajas]);
  if(C.evsK!==k){ C.evs=ev; C.evsBajas=bajas; delete C.evsLegs; C.evsK=k; C.evsAt=new Date().toISOString(); }
};
function cuEmps(){
  const C=DB.cumple; if(!C) return [];
  if(!C.evs) return C.emps||[];
  // con la planilla de Eventuales: salen los dados de baja y se suman los nuevos que tienen fecha de nacimiento
  const baja=new Set(C.evsBajas||[]), ev=new Map(C.evs.map(e=>[e.leg,e]));
  const base=(C.emps||[]).filter(e=>!(e.leg&&baja.has(e.leg))).map(e=>e.leg&&ev.has(e.leg)?Object.assign({},e,{nac:ev.get(e.leg).nac}):e);
  const ya=new Set(base.map(e=>e.leg).filter(Boolean)), yaN=new Set(base.map(e=>sinTilde(e.nombre)));
  return base.concat(C.evs.filter(e=>!ya.has(e.leg)&&!yaN.has(sinTilde(e.nombre))));
}
// ---- carteles para la cartelera: Word (.docx) con dos personas por hoja (solo Milagros Marchioro y admin) ----
const cuCartelOk=()=>!(window.SRV&&SRV.mode==='online')||(!!SRV.user&&!SRV.imp&&(SRV.user.username==='mmarchioro'||SRV.user.rol==='admin'));
async function cuCarteles(){
  if(typeof JSZip==='undefined'){
    // la librería para armar el .docx se baja recién cuando hace falta
    App.toast('Preparando el Word…');
    try{ await new Promise((ok,mal)=>{ const sc=document.createElement('script'); sc.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; sc.onload=ok; sc.onerror=mal; document.head.appendChild(sc); }); }catch(e){}
    if(typeof JSZip==='undefined'){ App.toast('No se pudo descargar la librería para armar el Word. Revisá la conexión a internet y probá de nuevo.',true); return; }
  }
  const R=cuRows(cuState.mes); if(!R.length){ App.toast('No hay cumpleaños en ese mes.',true); return; }
  const x=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cap=t=>t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());
  // apellido y nombre: si el nombre viene sin coma se busca en la nómina por legajo; si no está, la primera palabra es el apellido
  const nmL={}; try{ nmRows().forEach(x=>{ if(String(x.nombre).includes(',')) nmL[x.leg]=x.nombre; }); }catch(e){}
  const partes=(n,leg)=>{ let t=String(n).replace(/\s+/g,' ').trim(); if(!t.includes(',')&&leg&&nmL[nmLeg(leg)]) t=nmL[nmLeg(leg)];
    if(!t.includes(',')){ const w=t.split(' '); t=w[0]+', '+w.slice(1).join(' '); }
    const [ap,...no]=t.split(','); return {ap:ap.trim().toUpperCase(),no:no.join(',').trim().toUpperCase()}; };
  const run=(t,sz,b)=>`<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b?'<w:b/>':''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const par=(t,sz,b)=>`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="120"/></w:pPr>${run(t,sz,b)}</w:p>`;
  // el tamaño baja si el apellido es largo, para que entre en una línea
  // tamaño (en medios puntos) para que el texto entre en una línea: ancho útil ~495 pt, Arial negrita en mayúscula ≈ 0,7 del tamaño por letra
  const tam=t=>Math.max(36,Math.min(130,Math.floor(495/(Math.max(6,t.length)*0.7))*2));
  const celda=(p,borde)=>`<w:tr><w:trPr><w:trHeight w:val="7500" w:hRule="exact"/><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="9900" w:type="dxa"/><w:vAlign w:val="center"/>
    <w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:right w:val="nil"/><w:bottom w:val="${borde?'dashed':'nil'}" w:sz="8" w:color="999999"/></w:tcBorders></w:tcPr>
    ${p?par(p.ap,T,true)+par(p.no,T,true):'<w:p/>'}</w:tc></w:tr>`;
  // un solo tamaño para todo el documento: el que hace entrar en una línea al apellido o nombre más largo del mes
  const T=tam(R.map(r=>partes(r.nombre,r.leg)).flatMap(p=>[p.ap,p.no]).reduce((a,b)=>b.length>a.length?b:a,''));
  let body=''; for(let i=0;i<R.length;i+=2){ const a=partes(R[i].nombre,R[i].leg), b=R[i+1]?partes(R[i+1].nombre,R[i+1].leg):null;
    body+=`<w:tbl><w:tblPr><w:tblW w:w="9900" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="9900"/></w:tblGrid>${celda(a,true)}${celda(b,false)}</w:tbl>`+
      (i+2<R.length?'<w:p><w:r><w:br w:type="page"/></w:r></w:p>':''); }
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="1000" w:bottom="700" w:left="1000" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const z=new JSZip();
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/document.xml',doc);
  const blob=await z.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`carteles_cumpleanos_${MESES_N[cuState.mes-1].toLowerCase()}.docx`; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
  App.toast(`Word con ${R.length} cartel(es) de ${MESES_N[cuState.mes-1]} (${Math.ceil(R.length/2)} hoja(s))`);
}
function cuRows(mes){
  const C=DB.cumple; if(!C) return [];
  const y=+hoy().slice(0,4), nmMap={}; try{ nmRows().forEach(r=>nmMap[sinTilde(r.nombre)]=r); }catch(e){}
  return cuEmps().filter(e=>e.nac&&+e.nac.slice(5,7)===mes).map(e=>{ const dia=+e.nac.slice(8,10), x=nmMap[sinTilde(e.nombre)]||{};
    return Object.assign({},e,{dia,fecha:`${y}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,edad:(y-+e.nac.slice(0,4))>=15?y-+e.nac.slice(0,4):null,sector:x.sector||'',turno:x.turno||''}); })
    .sort((a,b)=>a.dia-b.dia||a.nombre.localeCompare(b.nombre,'es'));
}
const MESES_N=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function renderCumple(){
  if(!$('#v-cumple')) return;
  if(!cuState.mes) cuState.mes=+hoy().slice(5,7);
  const C=DB.cumple, R=cuRows(cuState.mes), h=hoy(), ed=canEditMod('cumpleanos');
  $('#cu-mes').innerHTML=MESES_N.map((m,i)=>`<option value="${i+1}"${i+1===cuState.mes?' selected':''}>${m}</option>`).join('');
  $('#cu-st').innerHTML=C?`<b>${cuEmps().length} personas</b> · ${esc(C.file||'')}${C.at?' · '+fmtAt(C.at):''}${C.evs?`<br>Sincronizado con la planilla de Eventuales (${fmtAt(C.evsAt)}): se quitan las bajas y se suman los eventuales nuevos con fecha de nacimiento`:''}`:'Sin cargar';
  { const b=$('#cu-doc'); if(b) b.style.display=cuCartelOk()?'':'none'; }
  $('#cu-load').style.display=ed?'':'none';
  const hoyN=R.filter(r=>r.fecha===h), sem=R.filter(r=>r.fecha>=h&&r.fecha<=addD(h,7));
  $('#cu-kpis').innerHTML=[{l:`Cumplen en ${MESES_N[cuState.mes-1].toLowerCase()}`,v:R.length,s:C?'en todo el plantel':'cargá el archivo'},{l:'Hoy',v:hoyN.length,s:hoyN.map(r=>r.nombre.split(',')[0]).join(', ')||'nadie',c:hoyN.length?'acc-ochre':''},{l:'Próximos 7 días',v:sem.length,s:'incluye hoy'}]
    .map(k=>`<div class="kpi ${k.c||''}"><div class="lab">${esc(k.l)}</div><div class="val">${k.v}</div><div class="sub">${esc(k.s)}</div></div>`).join('');
  $('#cu-list').innerHTML=R.length?`<thead><tr><th>Día</th><th>Apellido y nombre</th><th>Legajo</th><th>Tipo</th><th>Sector</th><th>Turno</th><th class="num">Cumple</th></tr></thead><tbody>`+
    R.map(r=>`<tr class="${r.fecha===h?'cu-hoy':r.fecha<h?'cu-pas':''}"><td class="mono"><b>${String(r.dia).padStart(2,'0')}</b> ${DOW[dObj(r.fecha).getDay()].slice(0,2)}</td><td><b>${esc(r.nombre)}</b>${r.fecha===h?' 🎂':''}</td><td class="mono">${esc(r.leg)}</td><td>${esc(r.tipo)}</td><td>${esc(r.sector)}</td><td>${esc(r.turno)}</td><td class="num">${r.edad!=null?r.edad+' años':'—'}</td></tr>`).join('')+'</tbody>'
    :`<tbody><tr><td><div class="empty">${C?'Nadie cumple años en este mes.':'Todavía no se cargó el archivo de cumpleaños.'}</div></td></tr></tbody>`;
}
function cuExcel(){
  const R=cuRows(cuState.mes); if(!R.length){ App.toast('No hay cumpleaños en ese mes.',true); return; }
  const mes=MESES_N[cuState.mes-1], y=hoy().slice(0,4);
  const a=[[`CUMPLEAÑOS · ${mes.toUpperCase()} ${y} · CD ISIDRO CASANOVA`],[],['Día','Fecha','Apellido y nombre','Legajo','Tipo','Sector','Turno','Cumple (años)']]
    .concat(R.map(r=>[r.dia,`${DOWL[dObj(r.fecha).getDay()]} ${dmy(r.fecha)}`,r.nombre,r.leg,r.tipo,r.sector,r.turno,r.edad!=null?r.edad:''])).concat([[],['Total',R.length]]);
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.aoa_to_sheet(a);
  ws['!cols']=[{wch:6},{wch:22},{wch:36},{wch:10},{wch:18},{wch:20},{wch:14},{wch:13}]; ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:7}}];
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:2+R.length,c:7}})};
  XLSX.utils.book_append_sheet(wb,ws,mes); XLSX.writeFile(wb,`cumpleanos_${mes.toLowerCase()}_${y}.xlsx`); App.toast(`Planilla de cumpleaños de ${mes.toLowerCase()} descargada`);
}
/* ---------------- Inicio: menú de hoy y cumpleaños ---------------- */
function renderHomeCom(){
  const box=$('#h-com'); if(!box) return; const h=hoy(), M=mnHoy(), parts=[];
  const dw=dObj(h).getDay();
  parts.push(`<div class="card hc-menu"><div class="card-h"><h3>🍽 Menú de hoy</h3><button class="btn ghost sm" data-go="v-menu">Ver la semana</button></div><div class="card-b">`+
    (M&&(M.m||M.o1)?`<div class="hc-lab">Plato del día</div><div class="hc-main">${esc(M.m||'')}</div><div class="hc-ops">${[['o1','Opción 1'],['o2','Opción 2'],['o3','Opción 3']].filter(([k])=>M[k]).map(([k,l])=>`<div><span>${l}</span>${esc(M[k])}</div>`).join('')}</div>`
      :`<div class="empty" style="padding:14px">${dw===0?'Hoy es domingo: no hay menú.':'Todavía no se cargó el menú de hoy.'}</div>`)+'</div></div>');
  if(DB.cumple){ const R=cuRows(+h.slice(5,7)).filter(r=>r.fecha>=h&&r.fecha<=addD(h,7));
    parts.push(`<div class="card hc-cu"><div class="card-h"><h3>🎂 Cumpleaños</h3><button class="btn ghost sm" data-go="v-cumple">Ver el mes</button></div><div class="card-b">`+
      (R.length?R.slice(0,8).map(r=>`<div class="hc-cur${r.fecha===h?' hoy':''}"><b>${r.fecha===h?'HOY':`${DOW[dObj(r.fecha).getDay()].slice(0,2)} ${r.dia}`}</b><span>${esc(r.nombre)}</span><em>${r.edad!=null?r.edad+' años':''}</em></div>`).join(''):'<div class="empty" style="padding:14px">Nadie cumple años en los próximos 7 días.</div>')+'</div></div>'); }
  box.innerHTML=parts.join('');
}
function hookComedor(){
  document.addEventListener('click',e=>{ const g=e.target.closest('#h-com [data-go]'); if(g) goView(g.dataset.go); });
  $('#mn-sem').onchange=e=>{ if(e.target.value){ mnState.sem=lunesDe(e.target.value); renderMenu(); } };
  $('#mn-prev').onclick=()=>{ mnState.sem=addD(mnState.sem,-7); renderMenu(); };
  $('#mn-next').onclick=()=>{ mnState.sem=addD(mnState.sem,7); renderMenu(); };
  $('#mn-hoy').onclick=()=>{ mnState.sem=lunesDe(hoy()); renderMenu(); };
  $('#mn-save').onclick=mnGuardar;
  $('#mn-copy').onclick=()=>{ const P=mnSemana(addD(mnState.sem,-7)); if(!P){ App.toast('La semana anterior está vacía.',true); return; }
    MN_DIAS.forEach((_,i)=>MN_FILAS.forEach(([k])=>{ const t=document.querySelector(`#mn-grid textarea[data-mn="${addD(mnState.sem,i)}|${k}"]`), v=(P.dias[addD(mnState.sem,i-7)]||{})[k]; if(t&&v) t.value=v; })); $('#mn-nota').value=$('#mn-nota').value||P.nota||''; App.toast('Se copió la semana anterior: revisala y tocá Guardar'); };
  $('#mn-up').onclick=()=>$('#mn-file').click();
  $('#mn-file').onchange=e=>{ const f=e.target.files[0]; if(f) mnSubir(f); e.target.value=''; };
  document.addEventListener('paste',e=>{ if(!e.target.closest||!e.target.closest('#mn-grid')) return; const t=(e.clipboardData||window.clipboardData).getData('text'); if(t&&t.includes('\t')&&t.includes('\n')){ e.preventDefault(); mnPegar(t); } });
  $('#cu-mes').onchange=e=>{ cuState.mes=+e.target.value; renderCumple(); };
  $('#cu-xls').onclick=cuExcel; { const b=$('#cu-doc'); if(b) b.onclick=cuCarteles; }
  $('#cu-pick').onclick=()=>$('#cu-file').click();
  $('#cu-file').onchange=e=>{ const f=[...e.target.files]; if(f.length) loadCumple(f); e.target.value=''; };
}
const _ovCom=App.onView; App.onView=(id,f)=>{ _ovCom(id,f); if(id==='v-menu') renderMenu(); else if(id==='v-cumple') renderCumple(); else if(id==='v-home') renderHomeCom(); };
const _rfCom=App.refresh; App.refresh=(...a)=>{ const r=_rfCom(...a); try{ renderHomeCom(); }catch(e){} return r; };
INTRO['v-menu']=()=>{ const M=mnHoy(); return {t:'Menú semanal',p:M&&M.m?'Hoy: '+M.m:'El menú del comedor de la semana',svg:`<svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/><circle cx="160" cy="98" r="52" fill="#e6edf7"/><circle cx="160" cy="98" r="38" fill="none" stroke="#cbd5e1" stroke-width="3"/><g class="i-mn"><rect x="86" y="50" width="6" height="96" rx="3" fill="#22d3ee"/><rect x="228" y="50" width="6" height="96" rx="3" fill="#f59e0b"/></g></svg>`}; };
INTRO['v-cumple']=()=>({t:'Cumpleaños',p:'Quién cumple este mes',svg:`<svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/><rect x="104" y="96" width="112" height="56" rx="8" fill="#a78bfa"/><rect x="96" y="140" width="128" height="14" rx="5" fill="#7c3aed"/>${[0,1,2].map(i=>`<g class="i-cu${i}"><rect x="${134+i*24}" y="72" width="6" height="26" rx="2" fill="#e6edf7"/><path d="M${137+i*24} 58c5 6 5 10 0 13c-5-3-5-7 0-13z" fill="#f59e0b"/></g>`).join('')}</svg>`});
try{ hookComedor(); }catch(e){ console.error('comedor',e); }
