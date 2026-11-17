/* ================================================================
   AUSENTISMO POR MOTIVO — a partir del export de Movimientos del reloj (anual o por período)
   Cada fila es una persona y un día: jornada + motivos de ausencia (enfermedad, ART, con aviso, etc.).
   · Días programados: jornadas de trabajo (no franco, no "sin jornada") sin vacaciones ni franco compensatorio.
   · Tasa de ausentismo = días de ausencia / días programados.
   Se guarda en el documento "ausmot" (lo ven y cargan quienes ven/editan Ausentismo).
   ================================================================ */
const AM_CAT={aus:'Ausentismo',lic:'Licencias',otro:'No es ausentismo'};
// nombre limpio y categoría de cada motivo del reloj
function amMotivo(raw){
  const t=normTxt(String(raw).replace(/\s*\(EVENTOS\)\s*$/i,'').replace(/^[.\d]+\s*/,'').replace(/^IS\s*-\s*/i,''));
  const R=[
    [/C\/?\s*AVISO\s*(DE\s*)?ENFERM/, 'Ausencia c/aviso de enfermedad','aus'],
    [/^ENFERMEDAD/, 'Enfermedad','aus'],
    [/LICENCIA ART|^ART\b/, 'Licencia ART','aus'],
    [/SIN AVISO/, 'Ausencia sin aviso','aus'],
    [/PARO/, 'Ausencia c/aviso por paro','aus'],
    [/MOVILIZ/, 'Ausencia c/aviso por movilización','aus'],
    [/AVISO DE PG/, 'Ausencia c/aviso de PG','aus'],
    [/CON AVISO/, 'Ausencia con aviso','aus'],
    [/SUSPENS/, 'Suspensión','aus'],
    [/PERMISO GREMIAL/, 'Permiso gremial','lic'],
    [/DONACION/, 'Donación de sangre','lic'],
    [/CASAMIENTO/, 'Licencia por casamiento','lic'],
    [/ESTUDIO/, 'Días de estudio','lic'],
    [/JUDICIAL/, 'Licencia judicial','lic'],
    [/FALLECIM/, 'Fallecimiento','lic'],
    [/NACIMIENTO/, 'Nacimiento de hijo','lic'],
    [/SIN GOCE/, 'Licencia sin goce de sueldo','lic'],
    [/LICENCIA ESPECIAL/, 'Licencia especial','lic'],
    [/MUDANZA/, 'Mudanza','lic'],
    [/RESERVA DE PUESTO/, 'Reserva de puesto','lic'],
    [/VACACION/, 'Vacaciones','otro'],
    [/FRANCO COMPENS/, 'Franco compensatorio','otro'],
    [/HOME OFFICE/, 'Home office','otro'],
    [/COLABORACION/, 'Colaboración a otros CD','otro'],
    [/CAPACITAC/, 'Capacitación','otro'],
  ];
  for(const [rx,n,c] of R) if(rx.test(t)) return {n,c};
  return t?{n:t.charAt(0)+t.slice(1).toLowerCase(),c:'otro'}:null;
}
const AM_CATDE={}; const amCat=n=>AM_CATDE[n]||(AM_CATDE[n]=(amMotivo(n)||{c:'otro'}).c);
let amState={mes:'',tipo:'',sector:'',turno:'',lic:false};

async function amCargar(file){
  const st=$('#am-st'); st.innerHTML='Leyendo el archivo… (el anual es grande, puede tardar unos segundos)';
  await new Promise(r=>setTimeout(r,30));
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,dense:true});
    const ws=wb.Sheets[wb.SheetNames[0]], rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
    let hi=-1; for(let i=0;i<Math.min(rows.length,40);i++){ const H=(rows[i]||[]).map(normTxt); if(H.includes('MOVIMIENTOS')&&H.some(x=>/^FECHA$/.test(x))&&H.some(x=>/CODIGO DE EMPLEADO|LEGAJO/.test(x))){ hi=i; break; } }
    if(hi<0) throw new Error('No reconozco el archivo: tiene que ser el export de Movimientos del reloj (columnas Código de empleado, Fecha, Jornada efectiva, Movimientos).');
    const H=rows[hi].map(x=>x==null?'':String(x)), Hn=H.map(normTxt), ix=rx=>Hn.findIndex(h=>rx.test(h));
    const cL=ix(/CODIGO DE EMPLEADO|LEGAJO/), cU=ix(/CODIGO DE EMPRESA/), cN=ix(/APELLIDO/), cF=ix(/^FECHA$/), cJ=ix(/JORNADA/), cM=ix(/^MOVIMIENTOS$/);
    const cE=Hn.map((h,i)=>/\(EVENTOS\)/.test(h)?i:-1).filter(i=>i>=0);
    const emps={}, prog={}, ev=[]; let d0='9999', d1='0000';
    for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue;
      const leg=nmLeg(r[cL]), f=excelDateToISO(r[cF]); if(!leg||!f) continue;
      if(f<d0) d0=f; if(f>d1) d1=f;
      if(!emps[leg]) emps[leg]={n:String(r[cN]||'').replace(/\s+/g,' ').trim(),t:nmTipo(cU>=0?r[cU]:'')};
      const mot=new Set();
      if(cM>=0&&r[cM]) String(r[cM]).split('|').forEach(s=>{ s=s.replace(/ /g,' ').trim();
        if(!s||/^[.\d]*\s*[ECS]\s+\+?\d/i.test(s)||/SIN INCIDENCIA/i.test(s)) return; const m=amMotivo(s); if(m) mot.add(m.n); });
      cE.forEach(c=>{ if(+r[c]>0){ const m=amMotivo(H[c]); if(m) mot.add(m.n); } });
      const jor=normTxt(r[cJ]||''), trabaja=jor&&!/FRANCO|SIN JORNADA/.test(jor)&&!mot.has('Vacaciones')&&!mot.has('Franco compensatorio');
      const mes=f.slice(0,7); if(trabaja){ const p=prog[leg]||(prog[leg]={}); p[mes]=(p[mes]||0)+1; }
      mot.forEach(m=>ev.push([leg,f,m]));
    }
    if(!ev.length&&!Object.keys(prog).length) throw new Error('El archivo no tiene filas con legajo y fecha.');
    // se combina con lo cargado: los meses que trae el archivo nuevo reemplazan a los anteriores
    const A=DB.ausmot||{emps:{},prog:{},ev:[]}, meses=new Set(); for(let d=d0.slice(0,7); d<=d1.slice(0,7); d=(()=>{ const [y,m]=d.split('-').map(Number); return m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`; })()) meses.add(d);
    const nuevo={file:file.name,at:new Date().toISOString(),por:window.SRV&&SRV.user?SRV.user.nombre:'',
      emps:Object.assign({},A.emps,emps), prog:{}, ev:A.ev.filter(e=>!meses.has(e[1].slice(0,7))).concat(ev)};
    for(const leg of new Set(Object.keys(A.prog).concat(Object.keys(prog)))){ const o={};
      Object.entries(A.prog[leg]||{}).forEach(([m,n])=>{ if(!meses.has(m)) o[m]=n; }); Object.assign(o,prog[leg]||{}); if(Object.keys(o).length) nuevo.prog[leg]=o; }
    const todas=nuevo.ev.map(e=>e[1]).concat(Object.values(nuevo.prog).flatMap(p=>Object.keys(p).map(m=>m+'-01'))).sort();
    nuevo.desde=todas[0]||d0; nuevo.hasta=[d1,A.hasta||''].sort().pop();
    DB.ausmot=nuevo;
    if(window.SRV&&SRV.nota) SRV.nota('ausmot',`Motivos de ausencia: ${file.name} (${dmy(d0)} al ${dmy(d1)}, ${ev.length} días con motivo)`);
    await persist(); amState.mes=''; renderAusmot();
    App.toast(`Cargado: ${Object.keys(emps).length} personas, del ${dmy(d0)} al ${dmy(d1)}`);
  }catch(e){ console.error(e); st.innerHTML=`<span style="color:#fca5a5">${esc(e.message||String(e))}</span>`; App.toast(e.message||'No se pudo leer el archivo',true); }
}

function amDatos(){
  const A=DB.ausmot; if(!A) return null;
  const s=amState, nm={}; try{ nmRows().forEach(x=>nm[x.leg]=x); }catch(e){}
  const per=leg=>{ const n=nm[leg]||{}, e=A.emps[leg]||{}; return {leg,nombre:n.nombre||e.n||leg,tipo:n.tipo||e.t||'',sector:n.sector||'NO ESTÁ EN NÓMINA',turno:n.turno||'NO ESTÁ EN NÓMINA',baja:!nm[leg]}; };
  const P={}; const gp=leg=>P[leg]||(P[leg]=per(leg));
  const okP=p=>(!s.tipo||p.tipo===s.tipo)&&(!s.sector||p.sector===s.sector)&&(!s.turno||p.turno===s.turno);
  const okM=m=>!s.mes||m===s.mes;
  const cats=s.lic?['aus','lic']:['aus'];
  const E=A.ev.filter(e=>okM(e[1].slice(0,7))&&cats.includes(amCat(e[2]))).map(e=>({p:gp(e[0]),f:e[1],mes:e[1].slice(0,7),m:e[2],c:amCat(e[2])})).filter(e=>okP(e.p));
  const prog=[]; Object.entries(A.prog).forEach(([leg,o])=>{ const p=gp(leg); if(!okP(p)) return; Object.entries(o).forEach(([m,n])=>{ if(okM(m)) prog.push({p,mes:m,n}); }); });
  // si una persona tiene dos motivos el mismo día cuenta un solo día de ausencia
  const dias=new Map(); E.forEach(e=>{ const k=e.p.leg+'|'+e.f; if(!dias.has(k)) dias.set(k,e); });
  return {A,E,D:[...dias.values()],prog,P,meses:uniq(A.ev.map(e=>e[1].slice(0,7)).concat(Object.values(A.prog).flatMap(o=>Object.keys(o)))).sort()};
}
const amPct=(a,b)=>b?(a/b*100).toFixed(1).replace('.',',')+'%':'—';
const amMesL=m=>`${MESES_N[+m.slice(5)-1]} ${m.slice(0,4)}`;

function amPorGrupo(X,k){ // X = amDatos(); k = 'sector' | 'turno'
  const g={}; const G=key=>g[key]||(g[key]={k:key,dias:0,prog:0,mot:{},p:new Set()});
  X.prog.forEach(r=>G(r.p[k]).prog+=r.n);
  X.D.forEach(e=>{ const x=G(e.p[k]); x.dias++; x.p.add(e.p.leg); });
  X.E.forEach(e=>{ const x=G(e.p[k]); x.mot[e.m]=(x.mot[e.m]||0)+1; });
  return Object.values(g).filter(x=>x.dias||x.prog).sort((a,b)=>(b.prog?b.dias/b.prog:0)-(a.prog?a.dias/a.prog:0)||b.dias-a.dias);
}
function amTablaGrupo(G,lab){
  const tot=G.reduce((a,x)=>({d:a.d+x.dias,p:a.p+x.prog}),{d:0,p:0}), mx=Math.max(.0001,...G.map(x=>x.prog?x.dias/x.prog:0));
  const top=x=>Object.entries(x.mot).sort((a,b)=>b[1]-a[1])[0];
  return G.length?`<thead><tr><th>${lab}</th><th class="num">Días de ausencia</th><th class="num">Días programados</th><th class="num">Tasa</th><th>Motivo principal</th><th style="width:22%"></th></tr></thead><tbody>`+
    G.map(x=>{ const t=top(x); return `<tr><td><b>${esc(x.k)}</b></td><td class="num">${x.dias||''}</td><td class="num">${x.prog||''}</td><td class="num"><b>${amPct(x.dias,x.prog)}</b></td><td>${t?`${esc(t[0])} <span class="meta">(${t[1]})</span>`:''}</td><td><div class="nm-bar"><i style="width:${x.prog?x.dias/x.prog/mx*100:0}%;background:#f87171"></i></div></td></tr>`; }).join('')+
    `<tr class="tot"><td>Total</td><td class="num">${tot.d}</td><td class="num">${tot.p}</td><td class="num">${amPct(tot.d,tot.p)}</td><td></td><td></td></tr></tbody>`:'<tbody><tr><td><div class="empty">Sin datos con este filtro.</div></td></tr></tbody>';
}

function renderAusmot(){
  const W=$('#p-mot'); if(!W) return;
  const ed=canEditMod('ausentismo'); $('#am-load').style.display=ed?'':'none';
  const X=amDatos(), s=amState;
  if(!X){ $('#am-st').innerHTML='Todavía no se cargó el export de Movimientos.'; $('#am-body').style.display='none'; return; }
  $('#am-body').style.display='';
  $('#am-st').innerHTML=`<b>${Object.keys(X.A.emps).length} personas</b> · del ${dmy(X.A.desde)} al ${dmy(X.A.hasta)} · ${esc(X.A.file)} · ${fmtAt(X.A.at)}${X.A.por?' · '+esc(X.A.por):''}`;
  $('#am-mes').innerHTML='<option value="">Todo el período</option>'+X.meses.slice().reverse().map(m=>`<option value="${m}"${m===s.mes?' selected':''}>${amMesL(m)}</option>`).join('');
  const all=Object.values(X.P);
  const opt=(id,k,lab,fmt)=>{ $(id).innerHTML=`<option value="">${lab}</option>`+uniq(all.map(p=>p[k]).filter(Boolean)).sort((a,b)=>String(a).localeCompare(String(b),'es')).map(v=>`<option value="${esc(v)}"${s[k]===v?' selected':''}>${esc(fmt?fmt(v):v)}</option>`).join(''); };
  opt('#am-tip','tipo','Todos los tipos',v=>NM_TIPO[v]||v); opt('#am-sec','sector','Todos los sectores'); opt('#am-tur','turno','Todos los turnos');
  $('#am-lic').checked=s.lic;
  const dias=X.D.length, prog=X.prog.reduce((a,r)=>a+r.n,0), pers=new Set(X.D.map(e=>e.p.leg)).size;
  const mot={}; X.E.forEach(e=>mot[e.m]=(mot[e.m]||0)+1); const M=Object.entries(mot).sort((a,b)=>b[1]-a[1]);
  $('#am-kpis').innerHTML=[{l:'Tasa de ausentismo',v:amPct(dias,prog),s:`${dias} días sobre ${prog} programados`,c:'acc-alert'},{l:'Días de ausencia',v:dias,s:s.lic?'incluye licencias':'sin licencias ni vacaciones'},
    {l:'Personas con ausencias',v:pers,s:'en el período'},{l:'Motivo principal',v:M[0]?M[0][0]:'—',s:M[0]?`${M[0][1]} días · ${amPct(M[0][1],M.reduce((a,x)=>a+x[1],0))} del total`:''}]
    .map(k=>`<div class="kpi ${k.c||''}"><div class="lab">${esc(k.l)}</div><div class="val" style="${String(k.v).length>10?'font-size:20px':''}">${esc(k.v)}</div><div class="sub">${esc(k.s)}</div></div>`).join('');
  // por mes × motivo (siempre todo el período, respetando los demás filtros)
  const s0=s.mes; amState.mes=''; const XA=amDatos(); amState.mes=s0;
  const motsA=Object.entries(XA.E.reduce((o,e)=>(o[e.m]=(o[e.m]||0)+1,o),{})).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  const byM={}; XA.meses.forEach(m=>byM[m]={d:0,p:0,mot:{}}); XA.prog.forEach(r=>byM[r.mes].p+=r.n); XA.D.forEach(e=>byM[e.mes].d++); XA.E.forEach(e=>{ const o=byM[e.mes].mot; o[e.m]=(o[e.m]||0)+1; });
  const mxT=Math.max(.0001,...XA.meses.map(m=>byM[m].p?byM[m].d/byM[m].p:0));
  $('#am-mesT').innerHTML=`<thead><tr><th>Mes</th>${motsA.map(m=>`<th class="num" title="${esc(m)}">${esc(m.replace(/^Ausencia /,'Aus. ').replace(/^Licencia /,'Lic. '))}</th>`).join('')}<th class="num">Días</th><th class="num">Programados</th><th class="num">Tasa</th><th style="width:14%"></th></tr></thead><tbody>`+
    XA.meses.map(m=>{ const x=byM[m]; return `<tr class="${m===s.mes?'am-sel':''}" data-amm="${m}"><td><b>${amMesL(m)}</b></td>${motsA.map(k=>`<td class="num">${x.mot[k]||''}</td>`).join('')}<td class="num"><b>${x.d||''}</b></td><td class="num">${x.p||''}</td><td class="num"><b>${amPct(x.d,x.p)}</b></td><td><div class="nm-bar"><i style="width:${x.p?x.d/x.p/mxT*100:0}%;background:#f87171"></i></div></td></tr>`; }).join('')+
    `<tr class="tot"><td>Total</td>${motsA.map(k=>`<td class="num">${XA.E.filter(e=>e.m===k).length}</td>`).join('')}<td class="num">${XA.D.length}</td><td class="num">${XA.prog.reduce((a,r)=>a+r.n,0)}</td><td class="num">${amPct(XA.D.length,XA.prog.reduce((a,r)=>a+r.n,0))}</td><td></td></tr></tbody>`;
  // por motivo
  const tot=M.reduce((a,x)=>a+x[1],0);
  $('#am-motT').innerHTML=M.length?`<thead><tr><th>Motivo</th><th>Tipo</th><th class="num">Días</th><th class="num">Personas</th><th class="num">% del total</th><th style="width:30%"></th></tr></thead><tbody>`+
    M.map(([m,n])=>`<tr><td><b>${esc(m)}</b></td><td>${esc(AM_CAT[amCat(m)])}</td><td class="num">${n}</td><td class="num">${new Set(X.E.filter(e=>e.m===m).map(e=>e.p.leg)).size}</td><td class="num">${amPct(n,tot)}</td><td><div class="nm-bar"><i style="width:${n/M[0][1]*100}%;background:#f87171"></i></div></td></tr>`).join('')+'</tbody>'
    :'<tbody><tr><td><div class="empty">Sin ausencias con este filtro.</div></td></tr></tbody>';
  $('#am-secT').innerHTML=amTablaGrupo(amPorGrupo(X,'sector'),'Sector'); $('#am-turT').innerHTML=amTablaGrupo(amPorGrupo(X,'turno'),'Turno');
  // personas
  const pp={}; X.D.forEach(e=>{ const x=pp[e.p.leg]||(pp[e.p.leg]={p:e.p,d:0,mot:{},prog:0}); x.d++; }); X.E.forEach(e=>{ const x=pp[e.p.leg]; if(x) x.mot[e.m]=(x.mot[e.m]||0)+1; }); X.prog.forEach(r=>{ if(pp[r.p.leg]) pp[r.p.leg].prog+=r.n; });
  const PL=Object.values(pp).sort((a,b)=>b.d-a.d||a.p.nombre.localeCompare(b.p.nombre,'es'));
  $('#am-n').textContent=`${PL.length} persona(s)`;
  $('#am-perT').innerHTML=PL.length?`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Tipo</th><th>Sector</th><th>Turno</th><th class="num">Días</th><th class="num">Tasa</th><th>Motivos</th></tr></thead><tbody>`+
    PL.slice(0,400).map(x=>`<tr><td class="mono">${esc(x.p.leg)}</td><td><b>${esc(x.p.nombre)}</b>${x.p.baja?' <span class="tag n" title="No figura en la nómina actual">baja</span>':''}</td><td>${esc(NM_TIPO[x.p.tipo]||'')}</td><td>${esc(x.p.sector)}</td><td>${esc(x.p.turno)}</td><td class="num"><b>${x.d}</b></td><td class="num">${amPct(x.d,x.prog)}</td><td>${Object.entries(x.mot).sort((a,b)=>b[1]-a[1]).map(([m,n])=>`${esc(m)} <b>${n}</b>`).join(' · ')}</td></tr>`).join('')+'</tbody>'
    :'<tbody><tr><td><div class="empty">Nadie con ausencias en este filtro.</div></td></tr></tbody>';
}

function amExcel(){
  const X=amDatos(); if(!X||!X.D.length){ App.toast('No hay ausencias para exportar con este filtro.',true); return; }
  const s=amState, wb=XLSX.utils.book_new(), add=(a,n,w)=>{ const ws=XLSX.utils.aoa_to_sheet(a); ws['!cols']=w.map(x=>({wch:x})); XLSX.utils.book_append_sheet(wb,ws,n); };
  const prog=X.prog.reduce((a,r)=>a+r.n,0), pct=(a,b)=>b?Math.round(a/b*1000)/10:'';
  const filtro=[s.mes?amMesL(s.mes):'Todo el período',s.tipo?NM_TIPO[s.tipo]:'',s.sector,s.turno,s.lic?'con licencias':'sin licencias'].filter(Boolean).join(' · ');
  add([[`AUSENTISMO POR MOTIVO · CD ISIDRO CASANOVA`],[filtro],[`Datos del ${dmy(X.A.desde)} al ${dmy(X.A.hasta)} · ${X.A.file}`],[],['Días de ausencia',X.D.length],['Días programados',prog],['Tasa de ausentismo (%)',pct(X.D.length,prog)],[],['Motivo','Tipo','Días','Personas']]
    .concat(Object.entries(X.E.reduce((o,e)=>(o[e.m]=(o[e.m]||0)+1,o),{})).sort((a,b)=>b[1]-a[1]).map(([m,n])=>[m,AM_CAT[amCat(m)],n,new Set(X.E.filter(e=>e.m===m).map(e=>e.p.leg)).size])),'Resumen',[34,16,10,10]);
  const s0=s.mes; amState.mes=''; const XA=amDatos(); amState.mes=s0;
  const mots=uniq(XA.E.map(e=>e.m)).sort((a,b)=>a.localeCompare(b,'es'));
  add([['Mes'].concat(mots,['Días','Programados','Tasa (%)'])].concat(XA.meses.map(m=>{ const E=XA.E.filter(e=>e.mes===m), d=XA.D.filter(e=>e.mes===m).length, p=XA.prog.filter(r=>r.mes===m).reduce((a,r)=>a+r.n,0);
    return [amMesL(m)].concat(mots.map(k=>E.filter(e=>e.m===k).length||''),[d,p,pct(d,p)]); })),'Por mes',[18].concat(mots.map(()=>12),[8,12,9]));
  for(const [k,n] of [['sector','Por sector'],['turno','Por turno']]) add([[k==='sector'?'Sector':'Turno','Días de ausencia','Días programados','Tasa (%)'].concat(mots)].concat(amPorGrupo(X,k).map(x=>[x.k,x.dias,x.prog,pct(x.dias,x.prog)].concat(mots.map(m=>x.mot[m]||'')))),n,[24,14,14,9].concat(mots.map(()=>12)));
  add([['Fecha','Legajo','Apellido y nombre','Tipo','Sector','Turno','Motivo']].concat(X.E.slice().sort((a,b)=>a.f.localeCompare(b.f)||a.p.nombre.localeCompare(b.p.nombre,'es')).map(e=>[dmy(e.f),e.p.leg,e.p.nombre,NM_TIPO[e.p.tipo]||'',e.p.sector,e.p.turno,e.m])),'Detalle',[11,9,32,16,20,16,30]);
  XLSX.writeFile(wb,`ausentismo_motivos_${s.mes||'periodo'}.xlsx`); App.toast('Excel de ausentismo descargado');
}

(function hookAusmot(){
  if(!$('#p-mot')) return;
  $('#am-pick').onclick=()=>$('#am-file').click();
  $('#am-file').onchange=e=>{ const f=e.target.files[0]; if(f) amCargar(f); e.target.value=''; };
  const z=$('#am-load'); ['dragenter','dragover'].forEach(v=>z.addEventListener(v,e=>{ e.preventDefault(); z.classList.add('hot'); })); ['dragleave','drop'].forEach(v=>z.addEventListener(v,e=>{ e.preventDefault(); z.classList.remove('hot'); }));
  z.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) amCargar(f); });
  $('#am-mes').onchange=e=>{ amState.mes=e.target.value; renderAusmot(); };
  $('#am-tip').onchange=e=>{ amState.tipo=e.target.value; renderAusmot(); };
  $('#am-sec').onchange=e=>{ amState.sector=e.target.value; renderAusmot(); };
  $('#am-tur').onchange=e=>{ amState.turno=e.target.value; renderAusmot(); };
  $('#am-lic').onchange=e=>{ amState.lic=e.target.checked; renderAusmot(); };
  $('#am-xls').onclick=amExcel;
  document.addEventListener('click',e=>{
    const r=e.target.closest('#am-mesT tr[data-amm]'); if(r){ amState.mes=amState.mes===r.dataset.amm?'':r.dataset.amm; renderAusmot(); } });
})();
const _ovAm=App.onView; App.onView=(id,f)=>{ _ovAm(id,f); if(id==='v-ausmot') renderAusmot(); };
