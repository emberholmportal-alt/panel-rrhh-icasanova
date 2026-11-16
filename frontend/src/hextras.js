/* ================================================================
   HORAS EXTRAS — a partir de las fichadas del reporte diario del reloj
   Reglas (definidas por RRHH):
   · Cuenta lo trabajado de la primera a la última fichada del día que supere la jornada
     (8 h por defecto; la duración de cada jornada se puede corregir).
   · Mínimo 1 hora; después, bloques de media hora.
   · 50 %: lunes a viernes y sábados hasta las 13 h. 100 %: sábado después de las 13 h, domingos y feriados.
   · Franco trabajado: todas las horas son extra.
   · Corte: eventuales del 23 al 22; efectivos y fuera de convenio del 16 al 15.
   ================================================================ */
const HX_MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const hxH=m=>{ m=Math.round(m||0); const h=Math.floor(m/60), r=m%60; return r?`${h}:${String(r).padStart(2,'0')}`:`${h}`; };
const hxHs=m=>m?hxH(m)+' h':'';
let hxState={mes:'',dia:'',tab:'corte',sector:'',turno:'',tipo:'',q:''};

// duración por defecto de cada jornada, en minutos (0 = franco: todo lo trabajado es extra)
function hxDurDef(j){
  const t=normTxt(j);
  if(/FRANCO/.test(t)) return 0;
  const fx=t.match(/FLEXIBLE\s*(\d{1,2})\s*HS/); if(fx) return +fx[1]*60;
  const m=t.match(/(\d{1,2})\s*A\s*\+?\s*(\d{1,2})\b/);
  if(m){ let d=(+m[2])-(+m[1]); if(d<=0) d+=24; if(d>0&&d<=12) return d*60; }
  return 480;
}
const hxDur=j=>{ const s=DB.shifts&&DB.shifts[j]; return s&&s.dur!=null&&s.dur!==''?+s.dur:hxDurDef(j); };
const hxTipoRec=r=>{ const t=nmTipo(r.empresa||''); return t||''; };

// cortes de liquidación del mes 'YYYY-MM'
function hxCorte(mes,tipo){
  const [y,m]=mes.split('-').map(Number), prev=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;
  return tipo==='EV'?{d0:`${prev}-23`,d1:`${mes}-22`}:{d0:`${prev}-16`,d1:`${mes}-15`};
}
function hxMesDefault(){ const h=hoy(), d=+h.slice(8,10), [y,m]=h.slice(0,7).split('-').map(Number);
  if(d<=15) return h.slice(0,7); const n=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`; return d>22?n:h.slice(0,7); }

// minutos desde la medianoche de cada fichada del día (las de después de medianoche vienen como "C +01:35")
function hxMarcas(r){
  const out=(r.marcas||[]).map(x=>+String(x).slice(1)).filter(x=>isFinite(x));
  (r.eventos||[]).forEach(ev=>{ const m=String(ev).match(/^[ECS]\s*\+\s*(\d{1,2}):(\d{2})/i); if(m) out.push(1440+(+m[1])*60+(+m[2])); });
  return out.sort((a,b)=>a-b);
}
const hxFer=iso=>{ const f=ferEn(iso); return f&&!/no laborable/i.test(f.t||'')?f:null; };
const hxRound=m=>m<60?0:Math.floor(m/30)*30;

// cálculo de un registro diario
function hxCalc(r){
  const M=hxMarcas(r); if(M.length<2) return null;
  const ent=M[0], sal=M[M.length-1], trab=sal-ent; if(trab<=0) return null;
  const dur=hxDur(r.jornada), raw=Math.max(0,trab-dur), dow=dObj(r.fecha).getDay(), fer=hxFer(r.fecha);
  let r50=0,r100=0;
  if(dow===0||fer) r100=raw;
  else if(dow===6){ const ini=sal-raw; r50=Math.max(0,Math.min(sal,780)-ini); r100=raw-r50; }
  else r50=raw;
  const tot=hxRound(raw), h100=Math.min(tot,Math.floor(r100/30)*30), h50=tot-h100;
  return {ent,sal,trab,dur,raw,h50,h100,tot,dia:dow===0?'Domingo':fer?'Feriado':dow===6?'Sábado':'Hábil',fer:fer?fer.n:'',revisar:trab>16*60};
}

function hxDatos(){
  const R=Object.values(DB.records||{}), mes=hxState.mes||(hxState.mes=hxMesDefault());
  const nm={}; try{ nmRows().forEach(x=>nm[x.leg]=x); }catch(e){}
  const C={EV:hxCorte(mes,'EV'),EF:hxCorte(mes,'EF')}, rows=[], fechas=new Set();
  for(const r of R){
    const n=nm[nmLeg(r.legajo)]||{}, tipo=n.tipo||hxTipoRec(r), c=tipo==='EV'?C.EV:C.EF;
    if(r.fecha<c.d0||r.fecha>c.d1) continue;
    fechas.add(r.fecha);
    const x=hxCalc(r); if(!x) continue;
    rows.push(Object.assign({leg:nmLeg(r.legajo),nombre:n.nombre||r.nombre,tipo,sector:n.sector||'SIN SECTOR',turno:n.turno||'SIN TURNO',fecha:r.fecha,jornada:r.jornada},x));
  }
  const d0=C.EF.d0<C.EV.d0?C.EF.d0:C.EV.d0, d1=C.EF.d1>C.EV.d1?C.EF.d1:C.EV.d1, falt=[];
  for(let d=d0; d<=d1&&d<hoy(); d=addD(d,1)) if(!fechas.has(d)) falt.push(d);
  return {mes,C,rows,falt};
}
function hxFiltrar(R){ const s=hxState, q=s.q.trim().toLowerCase();
  return R.filter(r=>(!s.sector||r.sector===s.sector)&&(!s.turno||r.turno===s.turno)&&(!s.tipo||r.tipo===s.tipo)&&(!q||r.nombre.toLowerCase().includes(q)||r.leg.includes(q))); }
function hxAgrupar(R,k){ const g={}; R.forEach(r=>{ const x=g[r[k]]||(g[r[k]]={k:r[k],h50:0,h100:0,tot:0,p:new Set(),d:0}); x.h50+=r.h50; x.h100+=r.h100; x.tot+=r.tot; if(r.tot){ x.p.add(r.leg); x.d++; } });
  return Object.values(g).filter(x=>x.tot).sort((a,b)=>b.tot-a.tot||String(a.k).localeCompare(String(b.k),'es')); }
function hxPersonas(R){ const g={}; R.forEach(r=>{ const x=g[r.leg]||(g[r.leg]={leg:r.leg,nombre:r.nombre,tipo:r.tipo,sector:r.sector,turno:r.turno,h50:0,h100:0,tot:0,d:0,rev:0}); x.h50+=r.h50; x.h100+=r.h100; x.tot+=r.tot; if(r.tot) x.d++; if(r.revisar) x.rev++; });
  return Object.values(g).filter(x=>x.tot).sort((a,b)=>b.tot-a.tot||a.nombre.localeCompare(b.nombre,'es')); }

function hxTabla(G,lab){
  const t=G.reduce((a,x)=>({h50:a.h50+x.h50,h100:a.h100+x.h100,tot:a.tot+x.tot,p:a.p+x.p.size}),{h50:0,h100:0,tot:0,p:0}), mx=Math.max(1,...G.map(x=>x.tot));
  return G.length?`<thead><tr><th>${lab}</th><th class="num">Personas</th><th class="num">Al 50%</th><th class="num">Al 100%</th><th class="num">Total</th><th style="width:30%"></th></tr></thead><tbody>`+
    G.map(x=>`<tr><td><b>${esc(x.k)}</b></td><td class="num">${x.p.size}</td><td class="num">${hxHs(x.h50)}</td><td class="num">${hxHs(x.h100)}</td><td class="num"><b>${hxHs(x.tot)}</b></td>
      <td><div class="nm-bar"><i style="width:${x.h50/mx*100}%;background:#22d3ee" title="50%"></i><i style="width:${x.h100/mx*100}%;background:#f472b6" title="100%"></i></div></td></tr>`).join('')+
    `<tr class="tot"><td>Total</td><td class="num"></td><td class="num">${hxHs(t.h50)}</td><td class="num">${hxHs(t.h100)}</td><td class="num">${hxHs(t.tot)}</td><td></td></tr></tbody>`
    :'<tbody><tr><td><div class="empty">Sin horas extras con este filtro.</div></td></tr></tbody>';
}

function renderHextras(){
  const V=$('#v-hextras'); if(!V) return;
  const D=hxDatos(), s=hxState, ALL=D.rows;
  const meses=[]; { const [y,m]=hxMesDefault().split('-').map(Number); for(let i=-6;i<=1;i++){ let mm=m+i, yy=y; while(mm<1){ mm+=12; yy--; } while(mm>12){ mm-=12; yy++; } meses.push(`${yy}-${String(mm).padStart(2,'0')}`); } }
  if(!meses.includes(s.mes)) meses.push(s.mes);
  $('#hx-mes').innerHTML=meses.sort().map(m=>`<option value="${m}"${m===s.mes?' selected':''}>${HX_MESES[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('');
  $('#hx-cortes').innerHTML=`Eventuales: <b>${dmy(D.C.EV.d0)} al ${dmy(D.C.EV.d1)}</b> · Efectivos y fuera de convenio: <b>${dmy(D.C.EF.d0)} al ${dmy(D.C.EF.d1)}</b>`;
  const opt=(id,k,vals,lab)=>{ $(id).innerHTML=`<option value="">${lab}</option>`+uniq(vals).sort((a,b)=>String(a).localeCompare(String(b),'es')).map(v=>`<option value="${esc(v)}"${s[k]===v?' selected':''}>${esc(k==='tipo'?(NM_TIPO[v]||v):v)}</option>`).join(''); };
  opt('#hx-sec','sector',ALL.map(r=>r.sector),'Todos los sectores'); opt('#hx-tur','turno',ALL.map(r=>r.turno),'Todos los turnos'); opt('#hx-tip','tipo',ALL.map(r=>r.tipo).filter(Boolean),'Todos los tipos');
  document.querySelectorAll('#v-hextras [data-hxt]').forEach(b=>b.classList.toggle('on',b.dataset.hxt===s.tab));
  $('#hx-p-corte').style.display=s.tab==='corte'?'':'none'; $('#hx-p-dia').style.display=s.tab==='dia'?'':'none'; $('#hx-p-jor').style.display=s.tab==='jor'?'':'none';
  const R=hxFiltrar(ALL), P=hxPersonas(R), t50=R.reduce((a,r)=>a+r.h50,0), t100=R.reduce((a,r)=>a+r.h100,0);
  $('#hx-kpis').innerHTML=[{l:'Horas extras al 50%',v:hxH(t50),s:'hábiles y sábado hasta 13 h',c:'acc-cyan'},{l:'Horas extras al 100%',v:hxH(t100),s:'sábado desde 13 h, domingo y feriado',c:'acc-ochre'},
    {l:'Total',v:hxH(t50+t100),s:`${P.length} persona(s) con extras`},{l:'Días sin reporte',v:D.falt.length,s:D.falt.length?'del corte, hasta ayer':'el corte está completo',c:D.falt.length?'acc-alert':''}]
    .map(k=>`<div class="kpi ${k.c||''}"><div class="lab">${esc(k.l)}</div><div class="val">${esc(k.v)}</div><div class="sub">${esc(k.s)}</div></div>`).join('');
  $('#hx-falt').innerHTML=D.falt.length?`⚠ Faltan reportes del reloj de: ${D.falt.slice(0,20).map(d=>dmy(d).slice(0,5)).join(', ')}${D.falt.length>20?` y ${D.falt.length-20} más`:''}. Esos días no suman horas extras hasta que se carguen en Ausentismo.`:'';
  $('#hx-falt').style.display=D.falt.length?'':'none';
  if(s.tab==='corte'){
    $('#hx-sec-t').innerHTML=hxTabla(hxAgrupar(R,'sector'),'Sector'); $('#hx-tur-t').innerHTML=hxTabla(hxAgrupar(R,'turno'),'Turno');
    $('#hx-n').textContent=`${P.length} persona(s)`;
    $('#hx-per').innerHTML=P.length?`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Tipo</th><th>Sector</th><th>Turno</th><th class="num">Días</th><th class="num">Al 50%</th><th class="num">Al 100%</th><th class="num">Total</th></tr></thead><tbody>`+
      P.map(x=>`<tr data-hxp="${esc(x.leg)}" title="Ver el detalle día por día"><td class="mono">${esc(x.leg)}</td><td><b>${esc(x.nombre)}</b>${x.rev?' <span class="tag n" title="Algún día con más de 16 h entre la primera y la última fichada: revisar">revisar</span>':''}</td><td>${esc(NM_TIPO[x.tipo]||'')}</td><td>${esc(x.sector)}</td><td>${esc(x.turno)}</td><td class="num">${x.d}</td><td class="num">${hxHs(x.h50)}</td><td class="num">${hxHs(x.h100)}</td><td class="num"><b>${hxHs(x.tot)}</b></td></tr>`
        +(s.abierto===x.leg?`<tr class="hx-det"><td colspan="9">${hxDetPersona(R.filter(r=>r.leg===x.leg))}</td></tr>`:'')).join('')+'</tbody>'
      :`<tbody><tr><td><div class="empty">${Object.keys(DB.records||{}).length?'Nadie tiene horas extras en este corte con el filtro elegido.':'Todavía no hay reportes del reloj cargados en Ausentismo.'}</div></td></tr></tbody>`;
  }
  if(s.tab==='dia'){
    const dias=uniq(ALL.map(r=>r.fecha)).sort(); if(!s.dia||!dias.includes(s.dia)) s.dia=dias[dias.length-1]||hoy();
    $('#hx-dia').innerHTML=dias.slice().reverse().map(d=>`<option value="${d}"${d===s.dia?' selected':''}>${DOWL[dObj(d).getDay()]} ${dmy(d)}</option>`).join('')||'<option>Sin datos</option>';
    const RD=R.filter(r=>r.fecha===s.dia);
    $('#hx-dsec').innerHTML=hxTabla(hxAgrupar(RD,'sector'),'Sector'); $('#hx-dtur').innerHTML=hxTabla(hxAgrupar(RD,'turno'),'Turno');
    const L=RD.filter(r=>r.tot).sort((a,b)=>b.tot-a.tot||a.nombre.localeCompare(b.nombre,'es'));
    $('#hx-dn').textContent=`${L.length} persona(s)`;
    $('#hx-dlist').innerHTML=L.length?`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Sector</th><th>Turno</th><th>Jornada</th><th>Entrada</th><th>Salida</th><th class="num">Trabajado</th><th class="num">Al 50%</th><th class="num">Al 100%</th></tr></thead><tbody>`+
      L.map(r=>`<tr><td class="mono">${esc(r.leg)}</td><td><b>${esc(r.nombre)}</b>${r.revisar?' <span class="tag n">revisar</span>':''}</td><td>${esc(r.sector)}</td><td>${esc(r.turno)}</td><td>${esc(r.jornada)}</td><td class="mono">${hhmm(r.ent)}</td><td class="mono">${hhmm(r.sal)}${r.sal>=1440?' (+1)':''}</td><td class="num">${hxH(r.trab)}</td><td class="num">${hxHs(r.h50)}</td><td class="num">${hxHs(r.h100)}</td></tr>`).join('')+'</tbody>'
      :'<tbody><tr><td><div class="empty">Nadie hizo horas extras ese día.</div></td></tr></tbody>';
  }
  if(s.tab==='jor'){
    const ed=canEditMod('ausentismo'), cnt={}; ALL.forEach(r=>cnt[r.jornada]=(cnt[r.jornada]||0)+1);
    const J=uniq(Object.values(DB.records||{}).map(r=>r.jornada).filter(Boolean)).sort((a,b)=>(cnt[b]||0)-(cnt[a]||0)||a.localeCompare(b,'es'));
    $('#hx-jor').innerHTML=`<thead><tr><th>Jornada</th><th class="num">Registros en el corte</th><th>Duración (horas)</th><th>Desde cuándo cuenta extra</th></tr></thead><tbody>`+
      J.map(j=>{ const d=hxDur(j), cust=DB.shifts&&DB.shifts[j]&&DB.shifts[j].dur!=null&&DB.shifts[j].dur!=='';
        return `<tr><td><b>${esc(j)}</b></td><td class="num">${cnt[j]||''}</td><td>${ed?`<input type="number" class="hx-dur" data-hxj="${esc(j)}" min="0" max="16" step="0.5" value="${d/60}">`:`${d/60}`}${cust?' <span class="tag">editada</span>':''}</td><td>${d===0?'todo lo trabajado (franco)':`después de ${hxH(d)} h trabajadas`}</td></tr>`; }).join('')+'</tbody>';
  }
}
function hxDetPersona(L){
  return `<table class="hx-mini"><thead><tr><th>Fecha</th><th>Jornada</th><th>Entrada</th><th>Salida</th><th class="num">Trabajado</th><th class="num">50%</th><th class="num">100%</th></tr></thead><tbody>`+
    L.filter(r=>r.tot).sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(r=>`<tr><td>${DOW[dObj(r.fecha).getDay()].slice(0,2)} ${dmy(r.fecha)}${r.fer?` · ${esc(r.fer)}`:''}</td><td>${esc(r.jornada)}</td><td class="mono">${hhmm(r.ent)}</td><td class="mono">${hhmm(r.sal)}${r.sal>=1440?' (+1)':''}</td><td class="num">${hxH(r.trab)}</td><td class="num">${hxHs(r.h50)}</td><td class="num">${hxHs(r.h100)}</td></tr>`).join('')+'</tbody></table>';
}

function hxExcel(){
  const D=hxDatos(), R=hxFiltrar(D.rows), P=hxPersonas(R); if(!P.length){ App.toast('No hay horas extras para exportar.',true); return; }
  const h=m=>Math.round(m/30)/2, mesL=`${HX_MESES[+D.mes.slice(5)-1]} ${D.mes.slice(0,4)}`, wb=XLSX.utils.book_new();
  const res=[[`HORAS EXTRAS · ${mesL.toUpperCase()} · CD ISIDRO CASANOVA`],[`Eventuales del ${dmy(D.C.EV.d0)} al ${dmy(D.C.EV.d1)} · Efectivos y FC del ${dmy(D.C.EF.d0)} al ${dmy(D.C.EF.d1)}`],
    ['Generado',fmtAt(new Date().toISOString())],['Reglas','Mínimo 1 h y bloques de 30 min. 50%: hábiles y sábado hasta 13 h. 100%: sábado desde 13 h, domingo y feriado.'],
    D.falt.length?['Días sin reporte del reloj',D.falt.map(d=>dmy(d)).join(', ')]:[],[],['','Al 50% (h)','Al 100% (h)','Total (h)'],['Total',h(R.reduce((a,r)=>a+r.h50,0)),h(R.reduce((a,r)=>a+r.h100,0)),h(R.reduce((a,r)=>a+r.tot,0))]];
  const add=(a,n,w)=>{ const ws=XLSX.utils.aoa_to_sheet(a); ws['!cols']=w.map(x=>({wch:x})); XLSX.utils.book_append_sheet(wb,ws,n); };
  add(res,'Resumen',[28,16,16,12]);
  for(const [k,n] of [['sector','Por sector'],['turno','Por turno']]) add([[k==='sector'?'Sector':'Turno','Personas','Al 50% (h)','Al 100% (h)','Total (h)']].concat(hxAgrupar(R,k).map(x=>[x.k,x.p.size,h(x.h50),h(x.h100),h(x.tot)])),n,[26,10,12,12,10]);
  add([['Legajo','Apellido y nombre','Tipo','Sector','Turno','Días','Al 50% (h)','Al 100% (h)','Total (h)']].concat(P.map(x=>[x.leg,x.nombre,NM_TIPO[x.tipo]||'',x.sector,x.turno,x.d,h(x.h50),h(x.h100),h(x.tot)])),'Por persona',[9,34,17,20,14,6,12,12,10]);
  add([['Fecha','Día','Legajo','Apellido y nombre','Sector','Turno','Jornada','Entrada','Salida','Trabajado (h)','Al 50% (h)','Al 100% (h)']].concat(R.filter(r=>r.tot).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.nombre.localeCompare(b.nombre,'es'))
    .map(r=>[dmy(r.fecha),r.dia+(r.fer?' · '+r.fer:''),r.leg,r.nombre,r.sector,r.turno,r.jornada,hhmm(r.ent),hhmm(r.sal)+(r.sal>=1440?' (+1)':''),Math.round(r.trab/6)/10,h(r.h50),h(r.h100)])),'Detalle diario',[11,12,9,32,18,14,30,8,11,12,10,10]);
  XLSX.writeFile(wb,`horas_extras_${D.mes}.xlsx`); App.toast('Excel de horas extras descargado');
}

function hookHextras(){
  if(!$('#v-hextras')) return;
  $('#hx-mes').onchange=e=>{ hxState.mes=e.target.value; hxState.abierto=''; renderHextras(); };
  $('#hx-sec').onchange=e=>{ hxState.sector=e.target.value; renderHextras(); };
  $('#hx-tur').onchange=e=>{ hxState.turno=e.target.value; renderHextras(); };
  $('#hx-tip').onchange=e=>{ hxState.tipo=e.target.value; renderHextras(); };
  $('#hx-dia').onchange=e=>{ hxState.dia=e.target.value; renderHextras(); };
  let qt; $('#hx-q').oninput=e=>{ clearTimeout(qt); qt=setTimeout(()=>{ hxState.q=e.target.value; renderHextras(); },200); };
  $('#hx-xls').onclick=hxExcel;
  document.addEventListener('click',e=>{ if(!e.target.closest('#v-hextras')) return;
    const t=e.target.closest('[data-hxt]'); if(t){ hxState.tab=t.dataset.hxt; renderHextras(); return; }
    const p=e.target.closest('[data-hxp]'); if(p){ hxState.abierto=hxState.abierto===p.dataset.hxp?'':p.dataset.hxp; renderHextras(); } });
  document.addEventListener('change',async e=>{ const i=e.target.closest('.hx-dur'); if(!i) return;
    const j=i.dataset.hxj, v=parseFloat(String(i.value).replace(',','.')); DB.shifts=DB.shifts||{}; const sh=DB.shifts[j]||(DB.shifts[j]={});
    if(!isFinite(v)||v<0||v>16){ App.toast('Poné una duración entre 0 y 16 horas.',true); renderHextras(); return; }
    if(v*60===hxDurDef(j)) delete sh.dur; else sh.dur=Math.round(v*60);
    if(window.SRV&&SRV.nota) SRV.nota('ausentismo',`Duración de la jornada "${j}": ${v} h (horas extras)`);
    await persist(); renderHextras(); App.toast(`Jornada "${j}": las extras cuentan después de ${v} h`); });
}
/* ---------------- PRESENTES DEL DÍA (Ausentismo) ---------------- */
let prState={dia:'',modo:'pres'};
const PR_EST={P:'Presente',N:'Novedad',S:'Sin fichada',F:'Franco',X:'Turno no exportado'};
function prDatos(){
  const R=Object.values(DB.records||{}), dias=uniq(R.map(r=>r.fecha)).sort();
  if(!prState.dia||!dias.includes(prState.dia)) prState.dia=dias[dias.length-1]||'';
  const nm={}; try{ nmRows().forEach(x=>nm[x.leg]=x); }catch(e){}
  const rows=R.filter(r=>r.fecha===prState.dia).map(r=>{ const n=nm[nmLeg(r.legajo)]||{}, M=hxMarcas(r);
    const est=M.length||r.entrada!=null?'P':r.status==='novedad'?'N':r.status==='no_cubierto'?'X':r.status==='sin_turno'?'F':'S';
    return {leg:nmLeg(r.legajo),nombre:n.nombre||r.nombre,tipo:n.tipo||nmTipo(r.empresa||''),sector:n.sector||'SIN SECTOR',turno:n.turno||'SIN TURNO',jornada:r.jornada,est,
      ent:M.length?M[0]:null,nov:(r.eventos||[]).filter(e=>!/^[ECS]\s*\+/i.test(e)).join(' · ')}; });
  return {dias,rows};
}
function prGrupo(R,k){ const g={}; R.forEach(r=>{ const x=g[r[k]]||(g[r[k]]={k:r[k],P:0,N:0,S:0,F:0,X:0,t:0}); x[r.est]++; x.t++; }); return Object.values(g).sort((a,b)=>b.P-a.P||String(a.k).localeCompare(String(b.k),'es')); }
function prTabla(G,lab){ const tot=G.reduce((a,x)=>{ ['P','N','S','F'].forEach(k=>a[k]+=x[k]); return a; },{P:0,N:0,S:0,F:0}), mx=Math.max(1,...G.map(x=>x.P));
  const todo=prState.modo==='todo';
  return G.length?`<thead><tr><th>${lab}</th><th class="num">Presentes</th>${todo?'<th class="num">Novedad</th><th class="num">Sin fichada</th><th class="num">Franco</th>':''}<th style="width:32%"></th></tr></thead><tbody>`+
    G.filter(x=>todo||x.P).map(x=>`<tr><td><b>${esc(x.k)}</b></td><td class="num"><b>${x.P}</b></td>${todo?`<td class="num">${x.N||''}</td><td class="num">${x.S||''}</td><td class="num">${x.F||''}</td>`:''}<td><div class="nm-bar"><i style="width:${x.P/mx*100}%;background:#22c55e"></i></div></td></tr>`).join('')+
    `<tr class="tot"><td>Total</td><td class="num">${tot.P}</td>${todo?`<td class="num">${tot.N}</td><td class="num">${tot.S}</td><td class="num">${tot.F}</td>`:''}<td></td></tr></tbody>`:'<tbody><tr><td><div class="empty">Sin datos para ese día.</div></td></tr></tbody>'; }
function renderPresentes(){
  if(!$('#p-pres')) return;
  const D=prDatos(), R=D.rows, c=k=>R.filter(r=>r.est===k).length;
  $('#pr-dia').innerHTML=D.dias.slice().reverse().map(d=>`<option value="${d}"${d===prState.dia?' selected':''}>${DOWL[dObj(d).getDay()]} ${dmy(d)}</option>`).join('')||'<option>Sin reportes cargados</option>';
  $('#pr-modo').value=prState.modo;
  $('#pr-kpis').innerHTML=[{l:'Presentes',v:c('P'),s:'ficharon ese día',c:'acc-lime'},{l:'Con novedad',v:c('N'),s:'vacaciones, licencias, etc.'},{l:'Sin fichada',v:c('S'),s:'a revisar',c:c('S')?'acc-alert':''},{l:'De franco',v:c('F'),s:'según su jornada'}]
    .map(k=>`<div class="kpi ${k.c||''}"><div class="lab">${esc(k.l)}</div><div class="val">${k.v}</div><div class="sub">${esc(k.s)}</div></div>`).join('');
  $('#pr-sec').innerHTML=prTabla(prGrupo(R,'sector'),'Sector'); $('#pr-tur').innerHTML=prTabla(prGrupo(R,'turno'),'Turno');
  const P=R.filter(r=>r.est==='P'), ts=uniq(P.map(r=>r.turno)).sort((a,b)=>a.localeCompare(b,'es')), ss=uniq(P.map(r=>r.sector)).sort((a,b)=>a.localeCompare(b,'es'));
  $('#pr-mx').innerHTML=ss.length?`<thead><tr><th>Sector \\ Turno</th>${ts.map(t=>`<th class="num">${esc(t)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>`+
    ss.map(s=>`<tr><td><b>${esc(s)}</b></td>${ts.map(t=>{ const n=P.filter(r=>r.sector===s&&r.turno===t).length; return `<td class="num nm-c" style="--a:${n?Math.min(.55,.08+n/Math.max(1,P.length)*4):0}">${n||''}</td>`; }).join('')}<td class="num"><b>${P.filter(r=>r.sector===s).length}</b></td></tr>`).join('')+
    `<tr class="tot"><td>Total</td>${ts.map(t=>`<td class="num">${P.filter(r=>r.turno===t).length}</td>`).join('')}<td class="num">${P.length}</td></tr></tbody>`:'<tbody><tr><td><div class="empty">Sin presentes.</div></td></tr></tbody>';
  const L=(prState.modo==='todo'?R.filter(r=>r.est!=='X'):P).sort((a,b)=>a.sector.localeCompare(b.sector,'es')||a.turno.localeCompare(b.turno,'es')||a.nombre.localeCompare(b.nombre,'es'));
  $('#pr-n').textContent=`${L.length} persona(s)`;
  $('#pr-det').innerHTML=L.length?`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Sector</th><th>Turno</th><th>Jornada</th><th>Estado</th><th>Entrada</th><th>Novedad</th></tr></thead><tbody>`+
    L.map(r=>`<tr><td class="mono">${esc(r.leg)}</td><td><b>${esc(r.nombre)}</b></td><td>${esc(r.sector)}</td><td>${esc(r.turno)}</td><td>${esc(r.jornada)}</td><td>${esc(PR_EST[r.est])}</td><td class="mono">${r.ent!=null?hhmm(r.ent):''}</td><td>${esc(r.nov)}</td></tr>`).join('')+'</tbody>'
    :'<tbody><tr><td><div class="empty">Sin datos para ese día.</div></td></tr></tbody>';
}
function prExcel(){
  const D=prDatos(); if(!D.rows.length){ App.toast('No hay datos de ese día.',true); return; }
  const R=D.rows, P=R.filter(r=>r.est==='P'), wb=XLSX.utils.book_new(), add=(a,n,w)=>{ const ws=XLSX.utils.aoa_to_sheet(a); ws['!cols']=w.map(x=>({wch:x})); XLSX.utils.book_append_sheet(wb,ws,n); };
  add([[`PRESENTES · ${DOWL[dObj(prState.dia).getDay()].toUpperCase()} ${dmy(prState.dia)} · CD ISIDRO CASANOVA`],[],['Sector','Presentes','Novedad','Sin fichada','Franco']].concat(prGrupo(R,'sector').map(x=>[x.k,x.P,x.N,x.S,x.F])),'Por sector',[26,11,10,12,9]);
  add([['Turno','Presentes','Novedad','Sin fichada','Franco']].concat(prGrupo(R,'turno').map(x=>[x.k,x.P,x.N,x.S,x.F])),'Por turno',[20,11,10,12,9]);
  add([['Legajo','Apellido y nombre','Sector','Turno','Jornada','Estado','Entrada','Novedad']].concat(R.filter(r=>r.est!=='X').map(r=>[r.leg,r.nombre,r.sector,r.turno,r.jornada,PR_EST[r.est],r.ent!=null?hhmm(r.ent):'',r.nov])),'Detalle',[9,34,20,14,30,12,8,40]);
  XLSX.writeFile(wb,`presentes_${prState.dia}.xlsx`); App.toast('Excel de presentes descargado');
}
(function hookPresentes(){
  if(!$('#p-pres')) return;
  $('#pr-dia').onchange=e=>{ prState.dia=e.target.value; renderPresentes(); };
  $('#pr-modo').onchange=e=>{ prState.modo=e.target.value; renderPresentes(); };
  $('#pr-xls').onclick=prExcel;
  document.addEventListener('click',e=>{ if(e.target.closest('#v-ausentismo [data-p="p-pres"]')) setTimeout(renderPresentes,0); });
})();
const _ovHx=App.onView; App.onView=(id,f)=>{ _ovHx(id,f); if(id==='v-hextras') renderHextras(); if(id==='v-ausentismo') renderPresentes(); };
try{ hookHextras(); }catch(e){ console.error('hextras',e); }
