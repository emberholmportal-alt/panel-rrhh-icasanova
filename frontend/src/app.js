"use strict";
/* ================================================================
   PANEL DE TRABAJO RRHH I.CASANOVA — capa de plataforma
   Dashboard, agenda, recordatorios, anticipos, gráficos, Three.js,
   animaciones de entrada y fuentes de SharePoint.
   Usa las funciones globales del módulo de asistencia (DB, persist,
   vacRows, antAct, lateRecs, etc.) y window.F3API del módulo F3.
   ================================================================ */
(function(){
const App = window.App = {};
// nombre de pila del usuario: en el servidor sale de su cuenta; en modo local, el dueño del panel
const NOMBRE=()=>{ const n=window.SRV&&SRV.user&&SRV.user.nombre; if(!n) return 'Ariel'; return (n.includes(',')?n.split(',')[1]:n).trim().split(/\s+/)[0]; };

/* ---------------- utilidades ---------------- */
const fmtN = n => Math.round(n||0).toLocaleString('es-AR');
const fmt$ = n => '$ ' + fmtN(n);
const fmtShort = n => { n=+n||0; const a=Math.abs(n);
  if(a>=1e6) return (n/1e6).toLocaleString('es-AR',{maximumFractionDigits:1})+' M';
  if(a>=1e4) return Math.round(n/1e3).toLocaleString('es-AR')+' k';
  return (Math.round(n*10)/10).toLocaleString('es-AR'); };
const dObj = iso => { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); };
const isoOf = t => `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;
const addD = (iso,n) => { const t=dObj(iso); t.setDate(t.getDate()+n); return isoOf(t); };
const diffD = (a,b) => Math.round((dObj(b)-dObj(a))/864e5);
const DOW=['dom','lun','mar','mié','jue','vie','sáb'];
const DOWL=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESL=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const dm = iso => { const d=dObj(iso); return d.getDate()+'/'+(d.getMonth()+1); };
const lblDay = iso => DOW[dObj(iso).getDay()]+' '+dm(iso);
const mondayOf = iso => { const d=dObj(iso); const k=(d.getDay()+6)%7; return addD(iso,-k); };
const hoy = () => todayISO();
const ago = at => { if(!at) return null; return Math.floor((Date.now()-new Date(at).getTime())/864e5); };
const agoTxt = at => { const d=ago(at); if(d==null) return 'sin cargar'; return d===0?'hoy':d===1?'ayer':`hace ${d} días`; };
const uniq = a => [...new Set(a)];
const names = (arr,n=3) => arr.slice(0,n).join(' · ')+(arr.length>n?` y ${arr.length-n} más`:'');
const shortName = s => { s=String(s||'').trim(); const p=s.split(','); return p.length>1? p[0].trim()+', '+p[1].trim().split(/\s+/)[0] : s; };
const COL={c1:'#0b94cf',c2:'#d97706',c3:'#8b5cf6',c4:'#db2777',ok:'#22c55e',warn:'#f59e0b',crit:'#ef4444',none:'#64748b',acc:'#22d3ee'};
App.toast = (m,err)=>{ toast(m); const t=$('#toast'); t.classList.toggle('err',!!err); };

/* ---------------- preferencias de interfaz ---------------- */
const UIK='rrhh-ic-ui';
let UI={anim:true,bg:true};
try{ UI=Object.assign(UI,JSON.parse(localStorage.getItem(UIK)||'{}')); }catch(e){}
const saveUI=()=>{ try{ localStorage.setItem(UIK,JSON.stringify(UI)); }catch(e){} };
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- tooltip ---------------- */
const tip=$('#tip');
document.addEventListener('mousemove',e=>{
  const t=e.target.closest && e.target.closest('[data-tip]');
  if(!t){ tip.classList.remove('on'); return; }
  tip.textContent=t.dataset.tip; tip.classList.add('on');
  const w=tip.offsetWidth, h=tip.offsetHeight;
  let x=e.clientX+14, y=e.clientY+14;
  if(x+w>innerWidth-8) x=e.clientX-w-14;
  if(y+h>innerHeight-8) y=e.clientY-h-14;
  tip.style.left=x+'px'; tip.style.top=y+'px';
});

/* ================================================================
   GRÁFICOS (SVG a mano: una serie, una escala, barras finas)
   ================================================================ */
function niceMax(v){ if(v<=4) return 4; const p=Math.pow(10,Math.floor(Math.log10(v))); const f=v/p;
  return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p; }
const W0 = el => Math.max(300, Math.floor(el.clientWidth||560));
function roundTop(x,y,w,h,r){ r=Math.max(0,Math.min(r,w/2,h)); return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`; }
function el$(e){ return typeof e==='string'? $(e) : e; }

function vbars(el,data,o={}){
  el=el$(el); if(!el) return;
  if(!data.length || (o.emptyIfZero && data.every(d=>!d.v))){ el.innerHTML=`<div class="empty">${o.empty||'Sin datos todavía.'}</div>`; return; }
  const W=W0(el), H=o.h||200, ml=o.ml||40, mr=8, mt=18, mb=26, iw=W-ml-mr, ih=H-mt-mb;
  const ints=data.every(d=>Number.isInteger(d.v)); let max=niceMax(Math.max(1,...data.map(d=>d.v))); if(ints&&max<1000) max=Math.ceil(max/4)*4;
  const step=iw/data.length, bw=Math.max(3,Math.min(o.bw||34, step*0.66));
  const every=Math.max(1,Math.ceil(data.length/Math.max(3,Math.floor(iw/(o.lw||52)))));
  let g='';
  for(let i=0;i<=4;i++){ const y=mt+ih-ih*i/4;
    g+=`<line class="gl" x1="${ml}" x2="${W-mr}" y1="${y}" y2="${y}"/><text x="${ml-7}" y="${y+3.5}" text-anchor="end">${(o.yfmt||fmtShort)(max*i/4)}</text>`; }
  data.forEach((d,i)=>{
    const h=ih*d.v/max, x=ml+step*i+(step-bw)/2, y=mt+ih-h;
    g+=`<g class="b" data-tip="${esc(d.tip||(d.l+': '+d.v))}"${d.go?` data-v="${d.go}"`:''}${d.attr?' '+d.attr:''}><rect class="hit" x="${ml+step*i}" y="${mt}" width="${step}" height="${ih}"/>`;
    if(d.v>0) g+=`<path class="mk anim" style="animation-delay:${Math.min(i*22,500)}ms;fill:${d.c||o.color||COL.c1}" d="${roundTop(x,y,bw,Math.max(h,2),4)}"/>`;
    if(o.labels && d.v>0 && bw>=14) g+=`<text class="val" x="${x+bw/2}" y="${y-6}" text-anchor="middle">${(o.vfmt||fmtShort)(d.v)}</text>`;
    g+='</g>';
    if(i%every===0) g+=`<text x="${x+bw/2}" y="${H-8}" text-anchor="middle"${d.hl?' style="fill:#67e8f9;font-weight:600"':''}>${esc(d.l)}</text>`;
  });
  if(o.mark!=null){ const x=ml+step*o.mark+step/2; g+=`<line x1="${x}" x2="${x}" y1="${mt-6}" y2="${mt+ih}" stroke="#22d3ee" stroke-dasharray="3 3" opacity=".6"/>`; }
  g+=`<line class="base" x1="${ml}" x2="${W-mr}" y1="${mt+ih}" y2="${mt+ih}"/>`;
  el.innerHTML=`<svg class="vz" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${g}</svg>`;
}

function areaChart(el,data,o={}){
  el=el$(el); if(!el) return;
  if(!data.length){ el.innerHTML=`<div class="empty">${o.empty||'Sin datos todavía.'}</div>`; return; }
  const W=W0(el), H=o.h||200, ml=36, mr=12, mt=18, mb=26, iw=W-ml-mr, ih=H-mt-mb;
  const ints=data.every(d=>Number.isInteger(d.v)); let max=niceMax(Math.max(1,...data.map(d=>d.v))); if(ints&&max<1000) max=Math.ceil(max/4)*4;
  const n=data.length, X=i=> n===1? ml+iw/2 : ml+iw*i/(n-1), Y=v=>mt+ih-ih*v/max;
  let g='';
  for(let i=0;i<=4;i++){ const y=mt+ih-ih*i/4;
    g+=`<line class="gl" x1="${ml}" x2="${W-mr}" y1="${y}" y2="${y}"/><text x="${ml-7}" y="${y+3.5}" text-anchor="end">${fmtShort(max*i/4)}</text>`; }
  const pts=data.map((d,i)=>[X(i),Y(d.v)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join('');
  g+=`<path d="${line}L${pts[n-1][0]},${mt+ih}L${pts[0][0]},${mt+ih}Z" fill="url(#gArea)"/>`;
  g+=`<path d="${line}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const every=Math.max(1,Math.ceil(n/Math.max(3,Math.floor(iw/52))));
  const sw=n>1? iw/(n-1) : iw;
  data.forEach((d,i)=>{ const [x,y]=pts[i];
    g+=`<g class="b" data-tip="${esc(d.tip||(d.l+': '+d.v))}"><rect class="hit" x="${x-sw/2}" y="${mt}" width="${sw}" height="${ih}"/>
      <line x1="${x}" x2="${x}" y1="${mt}" y2="${mt+ih}" stroke="#22d3ee" opacity="0" class="mk ch"/>
      <circle cx="${x}" cy="${y}" r="${n>45?2.5:4}" fill="#0b111d" stroke="#22d3ee" stroke-width="2"/></g>`;
    if(i%every===0||i===n-1) g+=`<text x="${x}" y="${H-8}" text-anchor="middle">${esc(d.l)}</text>`;
  });
  const last=data[n-1]; g+=`<text class="val" x="${pts[n-1][0]}" y="${pts[n-1][1]-10}" text-anchor="end">${last.v}</text>`;
  g+=`<line class="base" x1="${ml}" x2="${W-mr}" y1="${mt+ih}" y2="${mt+ih}"/>`;
  el.innerHTML=`<svg class="vz" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><style>.vz g.b:hover .ch{opacity:.5}</style>${g}</svg>`;
}

function hbars(el,data,o={}){
  el=el$(el); if(!el) return;
  if(!data.length){ el.innerHTML=`<div class="empty">${o.empty||'Sin datos todavía.'}</div>`; return; }
  const max=Math.max(1,...data.map(d=>d.v));
  el.innerHTML=data.map((d,i)=>`<div class="hb" data-tip="${esc(d.tip||(d.n+': '+d.v))}"${d.go?` data-v="${d.go}"`:''}>
    <div class="n">${esc(d.n)}</div><div class="t"><i style="width:${Math.max(1.5,d.v/max*100)}%;background:${d.c||COL.c1};animation-delay:${i*40}ms"></i></div>
    <div class="v">${esc(d.vt!=null?d.vt:fmtN(d.v))}</div></div>`).join('');
}
function spark(vals,color){
  if(!vals||vals.length<2) return '';
  const max=Math.max(1,...vals), W=70, H=26;
  const p=vals.map((v,i)=>`${(i/(vals.length-1)*W).toFixed(1)},${(H-2-(v/max)*(H-4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}"><polyline points="${p}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/* ================================================================
   DATOS DERIVADOS
   ================================================================ */
const safe = f => { try{ return f(); }catch(e){ return []; } };
const VAC = () => safe(vacRows);
const ANT = () => safe(antRows);
const ACT = () => safe(antAct);
const LATE = () => safe(lateRecs);
const fueraEn = iso => uniq(VAC().filter(s=>s.desde<=iso && (s.hasta||s.desde)>=iso).map(s=>s.legajo));
function vacWeeks(n=16){
  const m0=mondayOf(hoy()), out=[];
  for(let i=0;i<n;i++){
    const a=addD(m0,7*i), b=addD(a,6);
    const ov=VAC().filter(s=>s.desde<=b && (s.hasta||s.desde)>=a);
    const per=uniq(ov.map(s=>s.legajo)), salen=ov.filter(s=>s.desde>=a&&s.desde<=b).length;
    out.push({l:dm(a),v:per.length,hl:i===0,go:'v-vacaciones',
      tip:`Semana del ${dm(a)} al ${dm(b)}\n${per.length} persona(s) de vacaciones\n${salen} salida(s) nuevas`});
  }
  return out;
}
function bajaWeeks(n=10){
  const m0=mondayOf(hoy()), out=[];
  for(let i=0;i<n;i++){
    const a=addD(m0,7*i), b=addD(a,6);
    const bj=ACT().filter(r=>r.ultimo && r.ultimo>=a && r.ultimo<=b);
    out.push({l:dm(a),v:bj.length,hl:i===0,go:'v-bajas',
      tip:`Semana del ${dm(a)} al ${dm(b)}\n${bj.length} baja(s)`+(bj.length?'\n'+names(bj.map(r=>shortName(r.nombre)),4):'')});
  }
  return out;
}
function tardeDays(n=30){
  const d=safe(byDate).slice(-n);
  return d.map(x=>({l:dm(x.f),v:x.tarde,tip:`${lblDay(x.f)}\n${x.tarde} tarde de ${x.total} fichadas`+(x.total?` (${Math.round(x.tarde/x.total*100)}%)`:'')}));
}

/* ================================================================
   ANTICIPOS
   ================================================================ */
const AN = () => (DB.anticipos && DB.anticipos.lotes) || [];
function parseAR(v){
  if(typeof v==='number') return v;
  let s=String(v==null?'':v).replace(/[$\s\u00a0]/g,'');
  if(!s) return 0;
  if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d+,\d+$/.test(s)) s=s.replace(',','.');
  else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,'');
  const n=parseFloat(s); return isNaN(n)?0:n;
}
function grupoPeriodo(name){
  const base=name.replace(/\.[a-z]+$/i,'');
  const m=base.match(/anticipos?[\s_-]*(.*?)[\s_-]*(\d{1,2})[.\-_](\d{4})/i);
  if(m) return {grupo:(m[1]||'GENERAL').replace(/_/g,' ').trim().toUpperCase()||'GENERAL', per:`${m[3]}-${pad(+m[2])}`};
  const d=new Date(); return {grupo:base.replace(/^anticipos?[\s_-]*/i,'').toUpperCase()||'GENERAL', per:`${d.getFullYear()}-${pad(d.getMonth()+1)}`};
}
function parseAnticipos(rows){
  const HAN={legajo:/legajo/i,cliente:/^cliente/i,uo:/u\.?\s*o\.?\s*cliente/i,uop:/u\.?\s*o\.?\s*propia/i,
    nombre:/apellido|nombre/i,con:/connro|c[oó]d/i,concepto:/concepto/i,cuotas:/cuota/i,monto:/monto|importe/i};
  let hi=-1;
  for(let i=0;i<Math.min(rows.length,20);i++){ const j=(rows[i]||[]).map(c=>String(c||''));
    if(j.some(c=>HAN.legajo.test(c))&&j.some(c=>HAN.monto.test(c))){hi=i;break} }
  if(hi<0) throw new Error('No encontré las columnas "Legajo" y "Monto".');
  const head=rows[hi].map(c=>String(c||'').trim()), col={};
  for(const k in HAN) col[k]=head.findIndex(h=>HAN[k].test(h));
  if(col.uo<0) col.uo=head.findIndex(h=>/u\.?\s*o\.?/i.test(h));
  const out=[];
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue;
    const leg=String(r[col.legajo]??'').trim();
    if(!leg||HAN.legajo.test(leg)) continue;
    const monto=parseAR(r[col.monto]); if(!monto) continue;
    out.push({legajo:leg.replace(/\.0+$/,''),nombre:String(r[col.nombre]??'').replace(/\u00a0/g,' ').trim(),
      cliente:String(r[col.cliente]??'').trim(),uo:String(r[col.uo]??'').trim(),uop:String(r[col.uop]??'').trim(),
      con:String(r[col.con]??'').trim(),concepto:String(r[col.concepto]??'').trim(),
      cuotas:+r[col.cuotas]||1,monto});
  }
  return out;
}
async function loadAnticipos(files){
  if(typeof XLSX==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  DB.anticipos=DB.anticipos||{lotes:[]};
  let n=0, tot=0, errs=[]; const batch=Date.now();
  for(const f of files){
    try{
      const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
      let rows=null;
      for(const sn of wb.SheetNames){ const r=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:false});
        if(r.some(x=>(x||[]).some(c=>/monto|importe/i.test(String(c||''))))){ rows=r; break; } }
      if(!rows) throw new Error('no tiene columna Monto');
      const data=parseAnticipos(rows), gp=grupoPeriodo(f.name);
      DB.anticipos.lotes=DB.anticipos.lotes.filter(l=>!(l.grupo===gp.grupo&&l.per===gp.per));
      DB.anticipos.lotes.push({id:gp.grupo+'|'+gp.per,file:f.name,grupo:gp.grupo,per:gp.per,at:new Date().toISOString(),batch,rows:data});
      n+=data.length; tot+=data.reduce((a,r)=>a+r.monto,0);
    }catch(err){ errs.push(f.name+': '+err.message); }
  }
  await persist();
  anState.per='@last'; renderAnticipos(); App.refresh();
  if(n) App.toast(`${n} anticipos cargados · ${fmt$(tot)}`);
  if(errs.length) App.toast(errs[0],true);
}
const perTxt = p => { if(p==='@last') return 'última carga'; if(!p) return '—'; const [y,m]=p.split('-'); return `${MESL[+m-1]} ${y}`; };
const perShort = p => { if(p==='@last') return 'últ. carga'; if(!p) return '—'; const [y,m]=p.split('-'); return `${m}/${y.slice(2)}`; };
const anGroups = () => uniq(AN().map(l=>l.grupo)).sort();
const anColor = g => [COL.c1,COL.c2,COL.c3,COL.c4][anGroups().indexOf(g)%4] || COL.c1;
const anPeriods = () => uniq(AN().map(l=>l.per)).sort().reverse();
let anState={per:'@last',grp:'',q:''};
const batchOf = l => l.batch || Date.parse(l.at) || 0;
const lastBatch = () => AN().reduce((m,l)=>Math.max(m,batchOf(l)),0);
const lastLotes = () => { const b=lastBatch(); return AN().filter(l=>batchOf(l)===b); };
const matchPer = (l,per) => !per || (per==='@last' ? batchOf(l)===lastBatch() : l.per===per);
function anRowsFor(per,grp){
  const out=[];
  for(const l of AN()){ if(!matchPer(l,per)) continue; if(grp&&l.grupo!==grp) continue;
    for(const r of l.rows) out.push(Object.assign({grupo:l.grupo,per:l.per},r)); }
  return out;
}
function anFlags(rows){
  const cnt={}; rows.forEach(r=>{ const k=r.per+'|'+r.legajo; cnt[k]=(cnt[k]||0)+1; });
  const ant={}; ANT().forEach(r=>ant[String(r.legajo).replace(/^0+/,'')]=r);
  return rows.map(r=>{
    const f=[]; if(cnt[r.per+'|'+r.legajo]>1) f.push({t:'sinf',x:'Duplicado'});
    const e=ant[String(r.legajo).replace(/^0+/,'')];
    if(e){ const fin=r.per? (()=>{const [y,m]=r.per.split('-').map(Number); return isoOf(new Date(y,m,0));})() : addD(hoy(),30);
      if(!e.activo) f.push({t:'tarde',x:'Dado de baja'});
      else if(e.ultimo && e.ultimo<=fin) f.push({t:'tarde',x:'Baja '+dmy(e.ultimo)}); }
    return Object.assign({},r,{flags:f});
  });
}
function renderAnticipos(){
  const pers=anPeriods();
  if(!anState.per || (anState.per!=='*' && anState.per!=='@last' && !pers.includes(anState.per))) anState.per='@last';
  const LL=lastLotes(), lb=lastBatch();
  $('#an-per').innerHTML=(pers.length?`<option value="@last">Último cargado · ${new Date(lb).toLocaleDateString('es-AR')}</option>`+pers.map(p=>`<option value="${p}">${perTxt(p)}</option>`).join('')+'<option value="*">Todos los períodos</option>':'<option value="">sin datos</option>');
  $('#an-last').innerHTML=LL.length?`<div class="ico"><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg></div>
    <div class="txt"><b>Último cargado: ${esc(LL.map(l=>l.file).join(' + '))}</b>
    <span>Período ${esc(uniq(LL.map(l=>perTxt(l.per))).join(', '))} · grupos ${esc(LL.map(l=>l.grupo).join(', '))} · cargado el ${esc(new Date(lb).toLocaleString('es-AR'))} · ${fmtN(LL.reduce((a,l)=>a+l.rows.length,0))} anticipos · <b style="display:inline;color:#67e8f9">${fmt$(LL.reduce((a,l)=>a+l.rows.reduce((x,r)=>x+r.monto,0),0))}</b></span></div>
    ${anState.per!=='@last'?'<div class="acts"><button class="btn ghost sm" id="an-golast">Volver al último cargado</button></div>':''}`:'';
  $('#an-last').style.display=LL.length?'':'none';
  $('#an-per').value=anState.per;
  const per=anState.per==='*'?'':anState.per;
  const grps=uniq(AN().filter(l=>matchPer(l,per)).map(l=>l.grupo)).sort();
  if(anState.grp && !grps.includes(anState.grp)) anState.grp='';
  $('#an-grp').innerHTML='<option value="">Todos los grupos</option>'+grps.map(g=>`<option>${esc(g)}</option>`).join('');
  $('#an-grp').value=anState.grp;
  const base=anFlags(anRowsFor(per,anState.grp));
  const q=anState.q.trim().toLowerCase();
  const rows=base.filter(r=>!q||r.nombre.toLowerCase().includes(q)||r.legajo.includes(q)||r.uo.toLowerCase().includes(q))
    .sort((a,b)=>a.grupo.localeCompare(b.grupo)||a.nombre.localeCompare(b.nombre));
  const tot=base.reduce((a,r)=>a+r.monto,0), pers2=uniq(base.map(r=>r.legajo)).length;
  // comparación con el período anterior
  let delta='';
  const perEf = per==='@last' ? (uniq(LL.map(l=>l.per)).length===1?LL[0].per:'') : per;
  if(perEf){ const i=pers.indexOf(perEf), prev=pers[i+1];
    if(prev&&i>=0){ const pt=anRowsFor(prev,anState.grp).reduce((a,r)=>a+r.monto,0);
      if(pt) delta=`${tot>=pt?'▲':'▼'} ${Math.abs(Math.round((tot-pt)/pt*100))}% vs ${perShort(prev)}`; } }
  const mx=base.length?Math.max(...base.map(r=>r.monto)):0;
  const nflag=base.filter(r=>r.flags.some(f=>f.t==='tarde')).length, ndup=base.filter(r=>r.flags.some(f=>f.x==='Duplicado')).length;
  $('#an-kpis').innerHTML=[
    {l:'Total otorgado',v:fmt$(tot),s:delta||(per?perTxt(per):'todos los períodos'),c:'acc-cyan'},
    {l:'Anticipos',v:fmtN(base.length),s:`${pers2} persona(s)`},
    {l:'Promedio',v:fmt$(base.length?tot/base.length:0),s:'por anticipo'},
    {l:'Máximo',v:fmt$(mx),s:`${base.filter(r=>r.monto===mx).length} con ese importe`},
    {l:'Con baja cercana',v:nflag,s:'descuento en riesgo',c:nflag?'acc-alert':'acc-lime'},
    {l:'Duplicados',v:ndup,s:'mismo legajo, mismo período',c:ndup?'acc-ochre':''}
  ].map(k=>`<div class="kpi ${k.c||''}"><div class="lab">${k.l}</div><div class="val"${String(k.v).length>10?' style="font-size:19px"':''}>${esc(k.v)}</div><div class="sub">${esc(k.s)}</div></div>`).join('');
  // avisos
  const riesgo=base.filter(r=>r.flags.some(f=>f.t==='tarde'));
  let al='';
  if(riesgo.length) al+=`<div class="note warn"><b>${riesgo.length} anticipo(s) de eventuales con baja antes del descuento.</b> ${esc(names(riesgo.map(r=>`${shortName(r.nombre)} (${r.flags.find(f=>f.t==='tarde').x.toLowerCase()})`),5))}. Revisá que se descuente en la liquidación final.</div>`;
  if(ndup) al+=`<div class="note"><b>Hay legajos con más de un anticipo en el mismo período.</b> ${esc(names(uniq(base.filter(r=>r.flags.some(f=>f.x==='Duplicado')).map(r=>shortName(r.nombre))),5))}.</div>`;
  if(!AN().length) al+=`<div class="note info">Todavía no cargaste anticipos. Subí los archivos del mes (uno por grupo) y acá vas a ver totales, evolución y cruces con las bajas.</div>`;
  $('#an-alerts').innerHTML=al;
  // gráficos
  const byG={}; base.forEach(r=>{ (byG[r.grupo]||(byG[r.grupo]={v:0,n:0})); byG[r.grupo].v+=r.monto; byG[r.grupo].n++; });
  $('#an-c-grp-m').textContent=per?perTxt(per):'todos los períodos';
  hbars('#an-c-grp',Object.entries(byG).sort((a,b)=>b[1].v-a[1].v).map(([g,x])=>({n:g,v:x.v,vt:fmtShort(x.v),c:anColor(g),
    tip:`${g}\n${fmt$(x.v)} · ${x.n} anticipo(s)\n${tot?Math.round(x.v/tot*100):0}% del total`})),{empty:'Sin anticipos.'});
  const evo=pers.slice().reverse().map(p=>{ const rr=anRowsFor(p,anState.grp), t=rr.reduce((a,r)=>a+r.monto,0);
    const bg={}; rr.forEach(r=>bg[r.grupo]=(bg[r.grupo]||0)+r.monto);
    return {l:perShort(p),v:t,hl:p===perEf,tip:`${perTxt(p)}: ${fmt$(t)}\n`+Object.entries(bg).map(([g,v])=>`${g}: ${fmt$(v)}`).join('\n')}; });
  vbars('#an-c-evo',evo,{labels:true,ml:52,empty:'Sin períodos cargados.'});
  const byU={}; base.forEach(r=>{ const k=r.uo||'Sin U.O.'; (byU[k]||(byU[k]={v:0,n:0})); byU[k].v+=r.monto; byU[k].n++; });
  hbars('#an-c-uo',Object.entries(byU).sort((a,b)=>b[1].v-a[1].v).slice(0,8).map(([u,x])=>({n:u.replace(/^La Matanza Endosos 2016\s*/i,''),v:x.v,vt:fmtShort(x.v),c:COL.c1,
    tip:`${u}\n${fmt$(x.v)} · ${x.n} anticipo(s)`})),{empty:'Sin datos.'});
  const byM={}; base.forEach(r=>byM[r.monto]=(byM[r.monto]||0)+1);
  vbars('#an-c-monto',Object.keys(byM).map(Number).sort((a,b)=>a-b).map(m=>({l:fmtShort(m),v:byM[m],c:COL.c3,
    tip:`${fmt$(m)}\n${byM[m]} anticipo(s) · ${fmt$(m*byM[m])}`})),{labels:true,yfmt:v=>Math.round(v),vfmt:v=>v,empty:'Sin datos.'});
  // tabla
  $('#an-n').textContent=`${rows.length} registro(s) · ${fmt$(rows.reduce((a,r)=>a+r.monto,0))}`;
  $('#an-table').innerHTML=`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Grupo</th><th>U.O. cliente</th><th>Concepto</th><th>Cuotas</th><th style="text-align:right">Monto</th><th>Período</th><th>Control</th></tr></thead>`+
    (rows.length?'<tbody>'+rows.map(r=>`<tr><td class="mono">${esc(r.legajo)}</td><td>${esc(r.nombre)}</td>
      <td><span class="tag n" style="border-color:${anColor(r.grupo)};color:var(--text)">${esc(r.grupo)}</span></td>
      <td style="font-size:12.5px;color:var(--text2)">${esc(r.uo)}</td><td style="font-size:12.5px;color:var(--text2)">${esc(r.con)} ${esc(r.concepto)}</td>
      <td class="mono">${r.cuotas}</td><td class="mono" style="text-align:right;font-weight:600">${fmt$(r.monto)}</td><td class="mono">${perShort(r.per)}</td>
      <td>${r.flags.map(f=>`<span class="tag ${f.t}">${esc(f.x)}</span>`).join(' ')||'<span class="tag ok">OK</span>'}</td></tr>`).join('')+
      `<tr><td></td><td style="font-weight:700">Total</td><td colspan="4"></td><td class="mono" style="text-align:right;font-weight:700;color:#67e8f9">${fmt$(rows.reduce((a,r)=>a+r.monto,0))}</td><td colspan="2"></td></tr></tbody>`
    :'<tbody><tr><td colspan="10"><div class="empty">Sin anticipos con estos filtros.</div></td></tr></tbody>');
  // lotes
  const L=AN().slice().sort((a,b)=>b.per.localeCompare(a.per)||a.grupo.localeCompare(b.grupo));
  $('#an-lotes').innerHTML=`<thead><tr><th>Archivo</th><th>Grupo</th><th>Período</th><th>Registros</th><th style="text-align:right">Total</th><th>Cargado</th><th></th></tr></thead>`+
    (L.length?'<tbody>'+L.map(l=>`<tr><td>${esc(l.file)}</td>
      <td class="editable"><input type="text" class="anlg" data-id="${esc(l.id)}" data-f="grupo" value="${esc(l.grupo)}"></td>
      <td class="editable"><input type="month" class="anlg" data-id="${esc(l.id)}" data-f="per" value="${esc(l.per)}" style="padding:3px 6px"></td>
      <td class="mono">${l.rows.length}</td><td class="mono" style="text-align:right">${fmt$(l.rows.reduce((a,r)=>a+r.monto,0))}</td>
      <td class="mono" style="font-size:12px">${esc(new Date(l.at).toLocaleString('es-AR'))}</td>
      <td><button class="btn danger sm" data-andel="${esc(l.id)}">Quitar</button></td></tr>`).join('')+'</tbody>'
    :'<tbody><tr><td colspan="7"><div class="empty">Sin archivos.</div></td></tr></tbody>');
  // mail
  const mrows=rows;
  $('#an-mailwrap').innerHTML=`<div class="mailbox" id="an-mail"><p>Buenos días,<br>Te paso los anticipos ${per?'del período '+perShort(per):''}${anState.grp?' — '+esc(anState.grp):''}:</p>
    <table><thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>U.O. Cliente</th><th>Concepto</th><th>Monto</th></tr></thead><tbody>`+
    mrows.map(r=>`<tr><td>${esc(r.legajo)}</td><td class="l">${esc(r.nombre)}</td><td class="l">${esc(r.uo)}</td><td>${esc(r.con)}</td><td>${fmt$(r.monto)}</td></tr>`).join('')+
    `<tr><td></td><td class="l"><b>TOTAL</b></td><td></td><td></td><td><b>${fmt$(mrows.reduce((a,r)=>a+r.monto,0))}</b></td></tr></tbody></table><p>Saludos.</p></div>`;
  $('#nb-an').textContent=riesgo.length||''; $('#nb-an').className='nb'+(riesgo.length?' crit':'');
}
App.renderAnticipos=renderAnticipos;
function hookAnticipos(){
  $('#an-pick').onclick=()=>$('#an-file').click();
  $('#an-file').onchange=e=>{ const f=[...e.target.files]; if(f.length) loadAnticipos(f); e.target.value=''; };
  const z=$('#an-drop');
  ['dragenter','dragover'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.add('hot')}));
  ['dragleave','drop'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.remove('hot')}));
  z.addEventListener('drop',e=>{ const f=[...e.dataTransfer.files]; if(f.length) loadAnticipos(f); });
  $('#an-per').onchange=e=>{ anState.per=e.target.value; renderAnticipos(); };
  document.addEventListener('click',e=>{ if(e.target.closest('#an-golast')){ anState.per='@last'; renderAnticipos(); } });
  $('#an-grp').onchange=e=>{ anState.grp=e.target.value; renderAnticipos(); };
  let qt; $('#an-q').oninput=e=>{ clearTimeout(qt); qt=setTimeout(()=>{ anState.q=e.target.value; renderAnticipos(); },200); };
  $('#an-csv').onclick=()=>{
    const per=anState.per==='*'?'':anState.per;
    const rows=[['Periodo','Grupo','Legajo','Apellido y nombre','Cliente','U.O. Cliente','U.O. Propia','ConNro','Concepto','Cuotas','Monto','Control']];
    anFlags(anRowsFor(per,anState.grp)).forEach(r=>rows.push([perShort(r.per),r.grupo,r.legajo,r.nombre,r.cliente,r.uo,r.uop,r.con,r.concepto,r.cuotas,r.monto,r.flags.map(f=>f.x).join(' | ')||'OK']));
    download(csv(rows),`anticipos_${per||'todos'}_${todayISO()}.csv`,'text/csv;charset=utf-8');
  };
  $('#an-copy').onclick=()=>copiar('#an-mail','Tabla de anticipos copiada — pegala en el mail');
  $('#an-lotes').addEventListener('change',async e=>{
    const i=e.target.closest('.anlg'); if(!i) return;
    const l=AN().find(x=>x.id===i.dataset.id); if(!l) return;
    const v=i.value.trim(); if(!v) return;
    l[i.dataset.f]=i.dataset.f==='grupo'? v.toUpperCase() : v; l.id=l.grupo+'|'+l.per;
    await persist(); renderAnticipos(); App.refresh();
  });
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-andel]'); if(!b) return;
    if(!confirm('¿Quitar este archivo de anticipos?')) return;
    DB.anticipos.lotes=AN().filter(l=>l.id!==b.dataset.andel);
    await persist(); renderAnticipos(); App.refresh(); App.toast('Archivo quitado');
  });
}

/* ================================================================
   AVISOS, AGENDA Y ESTADO DE MÓDULOS
   ================================================================ */
const REC = () => (DB.recs||(DB.recs=[]));
// permisos por módulo (en el servidor): cada usuario ve en Inicio solo lo de las secciones a las que accede
const PV_MOD={'v-ausentismo':'ausentismo','v-vacaciones':'vacaciones','v-bajas':'eventuales','v-francos':'francos','v-ropa':'indumentaria','v-f3':'f3','v-anticipos':'anticipos','v-nomina':'nomina','v-cumple':'cumpleanos','v-menu':'menu','v-hextras':'hextras','v-ausmot':'ausmot','v-viandas':'viandas','v-indic':'indicadores','v-sanc':'sanciones'};
const AV_MOD={ant:'eventuales',vac:'vacaciones',aus:'ausentismo',f3:'f3',an:'anticipos'};
const puedeMod=m=>!m||!(window.SRV&&SRV.mode==='online')||!SRV.user||SRV.user.rol==='admin'||!!(SRV.user.perms||{})[m];
const puedeAviso=a=>puedeMod(AV_MOD[a.m])&&puedeMod(PV_MOD[a.go]);
function computeAvisos(){
  const A=[], H=hoy(), en=d=>addD(H,d);
  // --- eventuales
  const act=ACT();
  const b7=act.filter(r=>r.ultimo&&r.ultimo>=H&&r.ultimo<=en(7)).sort((a,b)=>a.ultimo<b.ultimo?-1:1);
  const bHoy=act.filter(r=>r.ultimo===H);
  const bVenc=act.filter(r=>r.ultimo&&r.ultimo<H);
  if(bHoy.length) A.push({p:'alta',m:'ant',t:'Eventuales · hoy',v:`${bHoy.length} eventual(es) tienen hoy su último día`,d:names(bHoy.map(r=>shortName(r.nombre))),go:'v-bajas'});
  if(b7.length) A.push({p:'alta',m:'ant',t:'Eventuales · próximas bajas',v:`${b7.length} terminan período de prueba en 7 días`,d:`Primera: ${lblDay(b7[0].ultimo)} · informar bajas`,go:'v-bajas'});
  if(bVenc.length) A.push({p:'alta',m:'ant',t:'Eventuales · vencidos',v:`${bVenc.length} activo(s) con último día ya pasado`,d:'Figuran activos pero el contrato venció',go:'v-bajas'});
  // --- vacaciones
  const vr=VAC(), fut=vr.filter(s=>s.desde>=H);
  const v7=fut.filter(s=>s.desde<=en(7));
  const sinN=fut.filter(s=>!esNotif(s));
  const sin15=sinN.filter(s=>s.desde<=en(15)), sin45=sinN.filter(s=>s.desde>en(15)&&s.desde<=en(45));
  if(sin15.length) A.push({p:'alta',m:'vac',t:'Vacaciones · notificar',v:`${sin15.length} salida(s) sin notificar a menos de 15 días`,d:'Entregar la planilla firmada',go:'v-vacaciones'});
  if(v7.length) A.push({p:'media',m:'vac',t:'Vacaciones · liquidar',v:`${v7.length} salida(s) en los próximos 7 días`,d:`${v7.reduce((a,s)=>a+s.dias,0)} días a informar para liquidar`,go:'v-vacaciones'});
  if(sin45.length) A.push({p:'media',m:'vac',t:'Vacaciones · aviso 45 días',v:`${sin45.length} salida(s) entre 15 y 45 días sin notificar`,d:'La LCT pide comunicarlas con 45 días de anticipación',go:'v-vacaciones'});
  const vuelven=vr.filter(s=>s.hasta&&addD(s.hasta,1)===H);
  if(vuelven.length) A.push({p:'baja',m:'vac',t:'Vacaciones · reintegros',v:`${vuelven.length} persona(s) vuelven hoy`,d:names(vuelven.map(s=>shortName(s.nombre))),go:'v-vacaciones'});
  // --- ausentismo
  try{
    const ord=ordinals(), pend={};
    for(const r of LATE()){ const k=kindFor(ord[rid(r)]||1); pend[k]=(pend[k]||0)+1; }
    if(pend.sancion) A.push({p:'alta',m:'aus',t:'Ausentismo · suspensiones',v:`${pend.sancion} caso(s) alcanzaron el tope`,d:'Ya pasaron pedidos y apercibimiento',go:'v-ausentismo'});
    if(pend.apercibimiento) A.push({p:'media',m:'aus',t:'Ausentismo · apercibimientos',v:`${pend.apercibimiento} caso(s) corresponden apercibimiento`,d:'Reincidencia sobre los pedidos previos',go:'v-ausentismo'});
    if(pend.descargo) A.push({p:'baja',m:'aus',t:'Ausentismo · pedidos',v:`${pend.descargo} pedido(s) de explicación`,d:'Primeras tardanzas',go:'v-ausentismo'});
    const nc=activeRecs().filter(r=>r.status==='no_cubierto').length;
    if(nc) A.push({p:'media',m:'aus',t:'Ausentismo · reporte incompleto',v:`${nc} registro(s) de turnos fuera de la exportación`,d:'Volvé a exportar incluyendo todos los turnos',go:'v-ausentismo'});
  }catch(e){}
  // --- frescura de fuentes
  const bd=safe(byDate);
  if(bd.length){ const last=bd[bd.length-1].f, gap=diffD(last,H), lim=dObj(H).getDay()===1?3:1;
    if(gap>lim) A.push({p:'media',m:'aus',t:'Ausentismo · desactualizado',v:`El último día cargado es ${lblDay(last)}`,d:`${gap} días sin reporte del reloj`,go:'v-ausentismo'}); }
  try{
    for(const k of ['vac','ant']){ const u=updInfo(k), go=k==='vac'?'v-vacaciones':k==='ant'?'v-bajas':'v-francos', nom=k==='vac'?'Plan de vacaciones':k==='ant'?'Control de eventuales':'Francos';
      if(u.st==='none') A.push({p:'media',m:k==='fr'?'rec':k,t:'Actualización · '+nom,v:u.t,d:k==='fr'?'Subí la planilla de francos asignados':'Bajalo de SharePoint y subilo al panel',go});
      else if(u.st==='stale'||u.st==='crit') A.push({p:u.st==='crit'?'alta':'media',m:k==='fr'?'rec':k,t:'Actualización · '+nom,v:u.warn||'Datos desactualizados',d:'Última actualización: '+fmtAt(u.at)+' ('+minsAgo(u.at)+')',go}); }
    for(const k of ['vac','ant']){ const st=M365.state[k]||{}; if(st.st==='err') A.push({p:'alta',m:k,t:'SharePoint · '+SRC[k].nom,v:'No se pudo sincronizar',d:st.msg,go:SRC[k].mod}); }
    const fh=frOn(H); if(fh.length) A.push({p:'baja',m:'rec',t:'Francos · hoy',v:`${fh.length} empleado(s) de franco hoy`,d:names(fh.map(e=>shortName(e.nombre)),4),go:'v-francos'});
    const fm=ferEn(addD(H,1)); if(fm) A.push({p:'media',m:'rec',t:'Feriado · mañana',v:fm.n,d:'Revisá dotación, francos y liquidación de horas',go:'v-agenda'});
  }catch(e){}
  // --- fichada propia
  if(fichOn()) try{ const fs=fichState();
    if(fs.prev) A.push({p:'alta',m:'rec',t:'Mi fichada · salida pendiente',v:`El ${lblDay(fs.prev)} no marcaste la salida`,d:'Confirmá si la fichaste o informalo',go:'h-fich'});
    if(fs.needIn) A.push({p:'alta',m:'rec',t:'Mi fichada · entrada',v:'¿Fichaste la entrada de hoy?',d:'Tildalo en Inicio apenas pases por el reloj',go:'h-fich'});
    else if(fs.needOut) A.push({p:fs.tarde?'alta':'media',m:'rec',t:'Mi fichada · salida',v:fs.tarde?'¡Acordate de fichar la salida!':'Falta fichar la salida de hoy',d:`Entrada marcada a las ${fs.f.in}`,go:'h-fich'});
  }catch(e){}
  // --- indumentaria y saldo de vacaciones
  try{ const R=ROPA(); if(R){ const S=ropaStats(); if(S.p) A.push({p:'baja',m:'rec',t:'Indumentaria · '+(R.campania||'entrega'),v:`${Math.round(S.pct)}% entregado · faltan ${S.p}`,d:`${S.st.S} sin talles · ${S.st.T} para preparar · ${S.st.R} preparados`,go:'v-ropa'}); }
    const vp=vacPlan(); if(vp.length) A.push({p:'baja',m:'vac',t:'Vacaciones · sin planificar',v:`${vp.length} persona(s) con días sin planificar`,d:`${vp.filter(p=>!p.plan).length} sin ninguna salida cargada`,go:'v-vacaciones'});
  }catch(e){}
  // --- F3
  try{ const s=window.F3API&&F3API.estado();
    if(s&&s.base&&!s.nov) A.push({p:'baja',m:'f3',t:'F3 · novedades',v:'Hay base F3 cargada pero faltan las novedades del mes',d:s.tipo?`Tipo: ${s.tipo}`:'',go:'v-f3'}); }catch(e){}
  // --- anticipos
  const pers=anPeriods();
  if(pers.length){ const rr=anFlags(anRowsFor('@last','')), rk=rr.filter(r=>r.flags.some(f=>f.t==='tarde'));
    if(rk.length) A.push({p:'alta',m:'an',t:'Anticipos · descuento en riesgo',v:`${rk.length} anticipo(s) de eventuales con baja próxima`,d:names(rk.map(r=>shortName(r.nombre))),go:'v-anticipos'}); }
  // --- recordatorios
  const venc=REC().filter(r=>!r.done&&r.fecha&&r.fecha<H), rh=REC().filter(r=>!r.done&&r.fecha===H);
  if(venc.length) A.push({p:'alta',m:'rec',t:'Recordatorios · vencidos',v:`${venc.length} recordatorio(s) vencido(s)`,d:names(venc.map(r=>r.txt),2),go:'h-rec'});
  rh.forEach(r=>A.push({p:'media',m:'rec',t:'Recordatorio · hoy',v:r.txt,d:'Vence hoy',go:'h-rec'}));
  const rank={alta:0,media:1,baja:2};
  return A.filter(puedeAviso).sort((a,b)=>rank[a.p]-rank[b.p]);
}
function computeRange(A0,B0,o={}){
  const H=hoy(), E={};
  const push=(d,k,ob)=>{ (E[d]||(E[d]={}))[k]=E[d][k]||Object.assign({k,f:k.replace(/\d.*$/,'').slice(0,2),names:[]},ob); return E[d][k]; };
  for(const s of VAC()){
    if(s.desde>=A0&&s.desde<=B0) push(s.desde,'vs',{t:'Sale de vacaciones',short:'Sale vac.',c:COL.c1,go:'v-vacaciones'}).names.push(shortName(s.nombre)+` (${s.dias} d)`);
    if(s.hasta){ const r=addD(s.hasta,1); if(r>=A0&&r<=B0) push(r,'vv',{t:'Vuelve de vacaciones',short:'Vuelve',c:COL.c3,go:'v-vacaciones'}).names.push(shortName(s.nombre)); }
    if(s.desde>=H&&!esNotif(s)){ const dl=addD(s.desde,-45), d=dl<H?H:dl;
      if(d>=A0&&d<=B0) push(d,'nt',{t:'Notificar vacaciones',short:'Notificar',c:COL.c4,go:'v-vacaciones'}).names.push(shortName(s.nombre)+` (sale ${dm(s.desde)})`); }
  }
  for(const r of ACT()) if(r.ultimo&&r.ultimo>=A0&&r.ultimo<=B0) push(r.ultimo,'bj',{t:'Baja eventual (último día)',short:'Baja eventual',c:COL.c2,go:'v-bajas'}).names.push(shortName(r.nombre)+(r.turno?` · ${cap(r.turno)}`:''));
  for(const r of REC()){ if(r.done||!r.fecha) continue; const d=(!o.all&&r.fecha<H)?H:r.fecha;
    if(d>=A0&&d<=B0){ const c=(typeof CATS!=='undefined'&&CATS[r.cat])||{c:COL.c4,n:'Recordatorio'};
      push(d,'rc'+r.id,{t:(r.fecha<H?'Vencido: ':'')+(r.hora?r.hora+' · ':'')+r.txt,short:(r.hora?r.hora+' ':'')+r.txt,c:c.c,go:'v-agenda'}).names.push(c.n); } }
  if(typeof FER!=='undefined') for(const d in FER) if(d>=A0&&d<=B0) push(d,'fe',{t:'Feriado: '+FER[d].n,short:'Feriado',c:COL.ok,go:'v-agenda'}).names.push(FER[d].t||'');
  if(o.francos&&typeof FRE==='function'&&DB.francos){ for(let d=A0; d<=B0; d=addD(d,1)){ const on=frOn(d); if(on.length) push(d,'fr',{t:'De franco',short:'Francos',c:COL.acc,go:'v-francos'}).names.push(...on.map(e=>shortName(e.nombre))); } }
  return E;
}
function computeEvents(days=30){ const H=hoy(); return computeRange(H,addD(H,days)); }
function modStatus(A){
  const st={}, has={aus:safe(allRecs).length>0,vac:VAC().length>0,ant:ANT().length>0,an:AN().length>0,f3:!!(window.F3API&&F3API.estado().base)};
  for(const m of ['aus','vac','ant','f3','an']){
    const a=A.filter(x=>x.m===m);
    st[m]={n:a.filter(x=>x.p!=='baja').length, s:!has[m]?'none':a.some(x=>x.p==='alta')?'crit':a.some(x=>x.p==='media')?'warn':'ok'};
  }
  return st;
}

/* ================================================================
   HOME
   ================================================================ */
let homeA=[];
function renderHome(){
  const A=homeA=computeAvisos(), H=hoy(), now=new Date();
  const hr=now.getHours();
  $('#h-greet').textContent= hr<6?'Buenas noches':hr<13?'Buen día':hr<20?'Buenas tardes':'Buenas noches';
  document.querySelectorAll('#v-home h2 .grad').forEach(e=>e.textContent=NOMBRE());
  const wk=Math.ceil((((now-new Date(now.getFullYear(),0,1))/864e5)+new Date(now.getFullYear(),0,1).getDay()+1)/7);
  $('#h-date').textContent=`${DOWL[now.getDay()]} ${now.getDate()} de ${MESL[now.getMonth()]} ${now.getFullYear()} · semana ${wk}`;
  const alta=A.filter(a=>a.p==='alta').length, media=A.filter(a=>a.p==='media').length;
  const E=computeEvents(30), eh=E[H]||{};
  const fuera=fueraEn(H), salenHoy=(eh.vs?eh.vs.names.length:0), bajHoy=(eh.bj?eh.bj.names.length:0);
  const any=safe(allRecs).length||VAC().length||ANT().length||AN().length;
  $('#h-sum').innerHTML= any
    ? `${alta?`<b style="color:#fca5a5">${alta} tema(s) urgente(s)</b>`:'<b style="color:#86efac">Nada urgente</b>'} y ${media} para revisar.`+
      (puedeMod('vacaciones')?` Hoy ${fuera.length} persona(s) están de vacaciones${salenHoy?`, ${salenHoy} arrancan hoy`:''}${bajHoy&&puedeMod('eventuales')?` y ${bajHoy} eventual(es) tienen su último día`:''}.`:'')
    : 'Empezá cargando los archivos de cada módulo: el reloj, el plan de vacaciones, el control de eventuales, el F3 y los anticipos. Desde ahí el panel arma los avisos solo.';
  const st=modStatus(A);
  const chip=(c,txt,go)=>`<button class="chip" data-v="${go}"><i style="background:${c};box-shadow:0 0 8px ${c}"></i>${txt}</button>`;
  $('#h-chips').innerHTML=[
    chip(alta?COL.crit:COL.ok,`<b>${alta}</b> urgentes`,'v-home'),
    chip(COL.c1,`<b>${Object.values(eh).reduce((a,x)=>a+x.names.length,0)}</b> eventos hoy`,'v-home'),
    puedeMod('vacaciones')?chip(COL.c3,`<b>${fuera.length}</b> de vacaciones`,'v-vacaciones'):'',
    puedeMod('eventuales')?chip(COL.c2,`<b>${ACT().length}</b> eventuales`,'v-bajas'):''
  ].join('');
  // KPIs
  const bd=safe(byDate), last=bd[bd.length-1];
  const fut=VAC().filter(s=>s.desde>=H&&s.desde<=addD(H,30));
  const act=ACT(), b7=act.filter(r=>r.ultimo&&r.ultimo>=H&&r.ultimo<=addD(H,7)).length;
  const pers=anPeriods(), lastP=pers.length?'@last':'', LLh=lastLotes(), anTot=lastP?anRowsFor(lastP,'').reduce((a,r)=>a+r.monto,0):0;
  const vw=vacWeeks(8).map(x=>x.v), bw=bajaWeeks(8).map(x=>x.v), td=bd.slice(-14).map(x=>x.tarde);
  const evo=pers.slice().reverse().map(p=>anRowsFor(p,'').reduce((a,r)=>a+r.monto,0));
  const K=[
    {l:'Tardanzas último día',v:last?last.tarde:'—',s:last?`${lblDay(last.f)} · de ${last.total}`:'sin reporte del reloj',c:COL.crit,go:'v-ausentismo',sp:spark(td,COL.crit)},
    {l:'De vacaciones hoy',v:fuera.length,s:`${fut.length} salen en 30 días`,c:COL.c3,go:'v-vacaciones',sp:spark(vw,COL.c3)},
    {l:'De franco hoy',v:DB.francos?frOn(H).length:'—',s:DB.francos?(frDates().includes(H)?`de ${FRE().length} en la planilla`:'la planilla no cubre hoy'):'sin planilla de francos',c:COL.acc,go:'v-francos'},
    {l:'Eventuales activos',v:act.length||'—',s:ANT().length?`de ${ANT().length} en el control`:'sin control cargado',c:COL.acc,go:'v-bajas'},
    {l:'Bajan en 7 días',v:b7,s:'fin de período de prueba',c:COL.c2,go:'v-bajas',sp:spark(bw,COL.c2)},
    (()=>{ const R=ROPA(), S=ropaStats(); return {l:'Indumentaria entregada',v:R?Math.round(S.pct)+'%':'—',s:R?`${S.e} de ${S.t} · faltan ${S.p}`:'sin planilla cargada',c:COL.ok,go:'v-ropa',sp:R&&R.hist.length>1?spark(R.hist.map(h=>h.t?h.e/h.t*100:0),COL.ok):''}; })(),
    {l:'Anticipos · último cargado',v:lastP?fmtShort(anTot):'—',s:lastP?`${anRowsFor(lastP,'').length} anticipos · ${fmt$(anTot)}`:'sin archivos',c:COL.c4,go:'v-anticipos',sp:spark(evo,COL.c4)}
  ];
  $('#h-kpis').innerHTML=K.map(k=>`<button class="hkpi" data-v="${k.go}"><div class="lab"><i style="background:${k.c}"></i>${esc(k.l)}</div>
    <div class="val">${esc(k.v)}</div><div class="sub">${esc(k.s)}</div>${k.sp||''}</button>`).join('');
  // pendiente hoy
  $('#h-hoy-n').textContent=`${alta} alta · ${media} media · ${A.length-alta-media} info`;
  $('#h-hoy').innerHTML=A.length? A.map(a=>`<button class="aviso ${a.p}" data-v="${a.go}"><span class="pr">${a.p==='alta'?'!!':a.p==='media'?'!':'i'}</span>
      <span><div class="at">${esc(a.t)}</div><div class="av">${esc(a.v)}</div><div class="ad">${esc(a.d||'')}</div></span><span class="go">abrir →</span></button>`).join('')
    : `<div class="empty">${any?'Todo al día. No hay pendientes para hoy.':'Sin datos todavía: cargá los archivos de cada módulo.'}</div>`;
  // franja 14 días + agenda
  let s='';
  for(let i=0;i<14;i++){ const d=addD(H,i), e=E[d]||{}, dw=dObj(d).getDay();
    const dots=Object.values(e).slice(0,4).map(x=>`<i style="background:${x.c}"></i>`).join('');
    const n=Object.values(e).reduce((a,x)=>a+x.names.length,0);
    s+=`<div class="dcell${i===0?' today':''}${dw===0||dw===6?' we':''}" data-ag="${d}" data-tip="${esc(lblDay(d)+(n?`\n${n} evento(s)`:'\nsin eventos'))}">
      <div class="dw">${DOW[dw]}</div><div class="dd">${dObj(d).getDate()}</div><div class="dots">${dots}</div></div>`; }
  $('#h-strip').innerHTML=s;
  const days=Object.keys(E).sort();
  $('#h-agenda').innerHTML=days.length? days.map(d=>{ const dd=diffD(H,d);
    return `<div class="ag-day" id="ag-${d}"><h4 class="${dd===0?'today':''}">${dd===0?'Hoy':dd===1?'Mañana':DOWL[dObj(d).getDay()]} · ${dmy(d)}${dd>1?` <span style="color:var(--text3)">· en ${dd} días</span>`:''}</h4>`+
      Object.values(E[d]).map(x=>`<div class="ag-it" data-v="${x.go}"><i style="background:${x.c}"></i><div><b>${esc(x.t)}${x.names.length>1?` · ${x.names.length}`:''}</b><span>${esc(names(x.names,4))}</span></div><em>abrir</em></div>`).join('')+'</div>'; }).join('')
    : '<div class="empty">Nada agendado en los próximos 30 días. Cargá el plan de vacaciones y el control de eventuales.</div>';
  renderRecs(); renderSources(); renderInfoCards(); renderWx(); renderTicker(); renderFich();
  // gráficos
  const t=tardeDays(30);
  $('#h-c-tarde-m').textContent=t.length?`últimos ${t.length} días cargados`:'';
  areaChart('#h-c-tarde',t,{empty:'Cargá el reporte del reloj para ver la evolución.'});
  vbars('#h-c-vac',vacWeeks(16),{labels:true,mark:0,vfmt:v=>v,yfmt:v=>Math.round(v),empty:'Cargá el plan de vacaciones.',emptyIfZero:!VAC().length,color:COL.c1});
  vbars('#h-c-baj',bajaWeeks(10),{labels:true,vfmt:v=>v,yfmt:v=>Math.round(v),empty:'Cargá el control de eventuales.',emptyIfZero:!ANT().length,color:COL.c2});
  if(lastP){ const bg={}; anRowsFor(lastP,'').forEach(r=>{ (bg[r.grupo]||(bg[r.grupo]={v:0,n:0})); bg[r.grupo].v+=r.monto; bg[r.grupo].n++; });
    $('#h-c-ant-m').textContent='último cargado · '+uniq(LLh.map(l=>perShort(l.per))).join(', ')+' · '+fmt$(anTot);
    hbars('#h-c-ant',Object.entries(bg).sort((a,b)=>b[1].v-a[1].v).map(([g,x])=>({n:g,v:x.v,vt:fmtShort(x.v),c:anColor(g),go:'v-anticipos',tip:`${g}\n${fmt$(x.v)} · ${x.n} anticipo(s)`})));
  } else { $('#h-c-ant-m').textContent=''; $('#h-c-ant').innerHTML='<div class="empty">Cargá los archivos de anticipos.</div>'; }
  Orb.setStatus(st);
}
App.renderHome=renderHome;

/* --- recordatorios --- */
function renderRecs(){
  const H=hoy(), R=REC().slice().sort((a,b)=>(a.done-b.done)||((a.fecha||'9')<(b.fecha||'9')?-1:1));
  $('#h-rec-n').textContent=`${R.filter(r=>!r.done).length} abiertos`;
  $('#h-rec').innerHTML=R.length? R.map(r=>`<div class="rec${r.done?' done':''}"><input type="checkbox" data-recchk="${r.id}" ${r.done?'checked':''}>
    <span class="rt">${esc(r.txt)}</span><span class="rd ${!r.done&&r.fecha&&r.fecha<H?'venc':r.fecha===H?'hoy':''}">${r.fecha?(r.fecha===H?'hoy':lblDay(r.fecha)):'sin fecha'}</span>
    <button class="x" data-recdel="${r.id}" title="Borrar">×</button></div>`).join('')
    : '<div class="empty" style="padding:22px">Anotá lo que no se te puede pasar. Los que tienen fecha aparecen en la agenda.</div>';
}
function hookRecs(){
  $('#h-rec-date').value=hoy();
  const add=async()=>{ const t=$('#h-rec-txt').value.trim(); if(!t) return;
    REC().push({id:Date.now().toString(36),txt:t,fecha:$('#h-rec-date').value||'',done:false});
    $('#h-rec-txt').value=''; await persist(); renderHome(); refreshBadges(); };
  $('#h-rec-add').onclick=add;
  $('#h-rec-txt').onkeydown=e=>{ if(e.key==='Enter') add(); };
  document.addEventListener('change',async e=>{ const c=e.target.closest('[data-recchk]'); if(!c) return;
    const r=REC().find(x=>x.id===c.dataset.recchk); if(r){ r.done=c.checked; await persist(); renderHome(); refreshBadges(); } });
  document.addEventListener('click',async e=>{ const b=e.target.closest('[data-recdel]'); if(!b) return;
    DB.recs=REC().filter(x=>x.id!==b.dataset.recdel); await persist(); renderHome(); refreshBadges(); });
  document.addEventListener('click',e=>{ const c=e.target.closest('[data-ag]'); if(!c) return;
    const t=document.getElementById('ag-'+c.dataset.ag); if(t) t.scrollIntoView({behavior:'smooth',block:'nearest'});
    else App.toast('Sin eventos para '+lblDay(c.dataset.ag)); });
}

/* ================================================================
   MICROSOFT 365 — vacaciones y eventuales directo de SharePoint
   Lee los Excel online con Microsoft Graph (inicio de sesión con la
   cuenta de la empresa). Nada pasa por servidores propios.
   ================================================================ */
const CFGK='rrhh-ic-m365';
const DEF_LINKS={
  vac:'https://ggcloud1.sharepoint.com/:x:/r/sites/operacionesexternas/_layouts/15/Doc.aspx?sourcedoc=%7B74D49646-0B39-427B-9AE9-53E5A098C568%7D&file=Plan%20vacaciones%202026%20IC.xlsx&action=default&mobileredirect=true&wdwpf=doclib-c',
  ant:'https://ggcloud1.sharepoint.com/:x:/s/operacionesexternas/EdpK_nP3mHxIrAJcWlET1U8BpPkq73zC4zOlDYJqcqhNBw?e=Pi8kj9'
};
let CFG={clientId:'',tenant:'organizations',auto:true,links:Object.assign({},DEF_LINKS),items:{}};
try{ const c=JSON.parse(localStorage.getItem(CFGK)||'{}'); CFG=Object.assign(CFG,c); CFG.links=Object.assign({},DEF_LINKS,c.links||{}); CFG.items=c.items||{}; }catch(e){}
const saveCFG=()=>{ try{ localStorage.setItem(CFGK,JSON.stringify(CFG)); }catch(e){} };
const SRC={vac:{nom:'Plan vacaciones 2026 IC',mod:'v-vacaciones'},ant:{nom:'Control de eventuales',mod:'v-bajas'}};
const SCOPES=['Files.Read.All','User.Read'];
const IS_FILE=location.protocol==='file:';
const REDIRECT=location.origin+location.pathname;
const M365={pca:null,account:null,state:{vac:{},ant:{}},busy:{},err:''};
window.M365=M365;

M365.why=()=>{
  if(IS_FILE) return 'El panel está abierto como archivo local. Microsoft solo permite iniciar sesión desde una dirección web (https:// o http://localhost).';
  if(!window.msal) return 'No cargó la librería de inicio de sesión de Microsoft. Revisá la conexión y recargá.';
  if(!CFG.clientId) return 'Falta el ID de aplicación (Client ID) de Microsoft 365.';
  return '';
};
M365.init=async()=>{
  if(M365.pca) return true;
  if(M365.why()) return false;
  try{
    const pca=new msal.PublicClientApplication({
      auth:{clientId:CFG.clientId.trim(),authority:'https://login.microsoftonline.com/'+((CFG.tenant||'organizations').trim()),redirectUri:REDIRECT},
      cache:{cacheLocation:'localStorage'}});
    if(typeof pca.initialize==='function') await pca.initialize();
    await pca.handleRedirectPromise().catch(()=>null);
    M365.pca=pca; M365.account=pca.getAllAccounts()[0]||null; M365.err='';
    return true;
  }catch(e){ M365.err=e.message; return false; }
};
M365.login=async()=>{
  if(!await M365.init()){ openCfg(); App.toast(M365.why()||M365.err,true); return; }
  try{
    const r=await M365.pca.loginPopup({scopes:SCOPES,prompt:'select_account'});
    M365.account=r.account; renderSrcBars(); App.toast('Conectado como '+r.account.username);
    await M365.syncAll(true);
  }catch(e){ M365.err=e.message; renderSrcBars(); App.toast('No se pudo iniciar sesión: '+e.message,true); }
};
M365.logout=async()=>{
  const acc=M365.account; M365.account=null;
  if(M365.pca&&acc){ try{ await M365.pca.logoutPopup({account:acc,mainWindowRedirectUri:REDIRECT}); }catch(e){} }
  renderSrcBars(); App.toast('Sesión de Microsoft 365 cerrada');
};
M365.token=async interactive=>{
  if(!M365.account) throw new Error('No hay sesión iniciada en Microsoft 365');
  try{ return (await M365.pca.acquireTokenSilent({scopes:SCOPES,account:M365.account})).accessToken; }
  catch(e){
    if(!interactive) throw new Error('La sesión venció: tocá "Sincronizar ahora"');
    return (await M365.pca.acquireTokenPopup({scopes:SCOPES,account:M365.account})).accessToken;
  }
};
async function gget(path,tok,extra){
  const r=await fetch(path.startsWith('http')?path:'https://graph.microsoft.com/v1.0'+path,{headers:Object.assign({Authorization:'Bearer '+tok},extra||{})});
  if(!r.ok){ let m='HTTP '+r.status; try{ const j=await r.json(); if(j.error&&j.error.message) m+=' · '+j.error.message; }catch(e){}
    const er=new Error(m); er.status=r.status; throw er; }
  return r.json();
}
const shareId=u=>'u!'+btoa(unescape(encodeURIComponent(u))).replace(/=+$/,'').replace(/\//g,'_').replace(/\+/g,'-');
// Para links tipo Doc.aspx?sourcedoc={GUID}: busca el archivo en las bibliotecas del sitio
async function searchItem(link,tok){
  let u; try{ u=new URL(link); }catch(e){ return null; }
  const m=u.pathname.match(/\/(sites|teams)\/([^/]+)/); if(!m) return null;
  const file=(u.searchParams.get('file')||'').replace(/\.[^.]+$/,'');
  const guid=(u.searchParams.get('sourcedoc')||'').replace(/[{}]/g,'').toLowerCase();
  if(!file&&!guid) return null;
  const site=await gget(`/sites/${u.hostname}:/${m[1]}/${m[2]}?$select=id`,tok);
  const drives=(await gget(`/sites/${site.id}/drives?$select=id,name`,tok)).value||[];
  for(const d of drives){
    const q=encodeURIComponent((file||guid).replace(/'/g,"''"));
    const r=await gget(`/drives/${d.id}/root/search(q='${q}')?$select=id,name,parentReference,sharepointIds`,tok).catch(()=>({value:[]}));
    const v=r.value||[];
    const hit=v.find(x=>guid&&x.sharepointIds&&String(x.sharepointIds.listItemUniqueId||'').toLowerCase()===guid)
           || v.find(x=>file&&x.name.replace(/\.[^.]+$/,'').toLowerCase()===file.toLowerCase());
    if(hit) return hit;
  }
  return null;
}
async function resolveItem(k,tok){
  const link=CFG.links[k], c=CFG.items[k];
  if(c&&c.link===link){ try{ return await gget(`/drives/${c.d}/items/${c.i}`,tok); }catch(e){ if(e.status!==404&&e.status!==400) throw e; } }
  let it=null, err=null;
  try{ it=await gget(`/shares/${shareId(link)}/driveItem`,tok,{Prefer:'redeemSharingLinkIfNecessary'}); }catch(e){ err=e; }
  if(!it){ try{ it=await searchItem(link,tok); }catch(e){ err=err||e; } }
  if(!it) throw err||new Error('No encontré el archivo con ese link. Revisá que tengas acceso.');
  const d=it.parentReference&&it.parentReference.driveId;
  CFG.items[k]={link,d,i:it.id}; saveCFG();
  if(!it['@microsoft.graph.downloadUrl']) it=await gget(`/drives/${d}/items/${it.id}`,tok);
  return it;
}
M365.sync=async(k,interactive)=>{
  if(M365.busy[k]) return;
  if(!M365.account){ if(interactive) M365.login(); return; }
  M365.busy[k]=true; M365.state[k]={st:'sync'}; renderSrcBars();
  const t0=window.toast; if(!interactive) window.toast=()=>{};
  try{
    const tok=await M365.token(interactive);
    const it=await resolveItem(k,tok);
    const dl=it['@microsoft.graph.downloadUrl']; if(!dl) throw new Error('SharePoint no devolvió el contenido del archivo');
    const res=await fetch(dl); if(!res.ok) throw new Error('Descarga HTTP '+res.status);
    const f=new File([await res.arrayBuffer()],it.name||SRC[k].nom+'.xlsx');
    if(k==='vac') await loadVacFile(f); else await loadAntFile(f);
    const d=k==='vac'?DB.vac:DB.ant;
    if(d){ d.src={mod:it.lastModifiedDateTime||'',by:(it.lastModifiedBy&&it.lastModifiedBy.user&&it.lastModifiedBy.user.displayName)||'',
      web:it.webUrl||'',sync:new Date().toISOString(),name:it.name||''}; await persist(); }
    M365.state[k]={st:'ok'}; if(d) d.via='m365';
  }catch(e){ M365.state[k]={st:'err',msg:e.message}; if(interactive) App.toast(SRC[k].nom+': '+e.message,true); }
  finally{ window.toast=t0; M365.busy[k]=false; }
  renderSrcBars(); App.refresh();
};
M365.syncAll=async interactive=>{
  await Promise.all([M365.sync('vac',interactive),M365.sync('ant',interactive)]);
  if(interactive&&M365.state.vac.st==='ok'&&M365.state.ant.st==='ok') App.toast('Vacaciones y eventuales sincronizados con SharePoint');
};
M365.boot=async()=>{
  renderSrcBars();
  if(!await M365.init()){ renderSrcBars(); return; }
  renderSrcBars();
  if(M365.account&&CFG.auto){
    const s1=DB.vac&&DB.vac.src&&DB.vac.src.sync, s2=DB.ant&&DB.ant.src&&DB.ant.src.sync;
    const old=s=>!s||(Date.now()-Date.parse(s))>5*60e3;
    if(old(s1)) M365.sync('vac',false);
    if(old(s2)) M365.sync('ant',false);
  }
  setInterval(()=>{ if(!document.hidden&&M365.account&&CFG.auto) M365.syncAll(false); },15*60e3);
};

/* ---------- barra de fuente en cada módulo ---------- */
const hm = iso => { if(!iso) return ''; const d=new Date(iso); return `${dmy(isoOf(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const minsAgo = iso => { if(!iso) return ''; const m=Math.round((Date.now()-Date.parse(iso))/60e3); return m<1?'recién':m<60?`hace ${m} min`:m<1440?`hace ${Math.round(m/60)} h`:agoTxt(iso); };
function srcState(k){
  const d=k==='vac'?DB.vac:DB.ant, s=d&&d.src, st=M365.state[k]||{};
  if(st.st==='sync') return {c:'sync',t:'Sincronizando con SharePoint…'};
  if(st.st==='err') return {c:'stale',t:'Error al sincronizar: '+st.msg+(d?' · se muestran los datos de la última sincronización':'')};
  if(M365.why()) return {c:'none',t:M365.why()+(s?` · datos de la última sincronización (${minsAgo(s.sync)})`:'')};
  if(!M365.account) return {c:'none',t:'Sin sesión: conectá tu cuenta de Grupo Gestión para leer el Excel online'+(s?` · datos de ${minsAgo(s.sync)}`:'')};
  if(s) return {c:'fresh',t:`Sincronizado ${minsAgo(s.sync)}`+(s.mod?` · editado en SharePoint el ${hm(s.mod)}${s.by?' por '+s.by:''}`:'')};
  return {c:'none',t:'Conectado · todavía sin sincronizar'};
}
function srcBarHTML(k){
  const u=updInfo(k), d=k==='vac'?DB.vac:DB.ant, web=(d&&d.src&&d.src.web)||CFG.links[k], st=M365.state[k]||{};
  const pick=k==='vac'?'#btnPickVac':'#btnPickAnt';
  const ms=M365.account&&!M365.why();
  return `<div class="ico${st.st==='sync'?' spin':''}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
    <div class="txt"><b>${esc(SRC[k].nom)} <span style="font-weight:400;color:var(--text3)">· fuente: Excel online en SharePoint operacionesexternas</span></b>
    <span class="age ${u.st==='crit'?'stale':u.st}">● ${u.at?`Última actualización: <b class="ub-at">${fmtAt(u.at)}</b> (${minsAgo(u.at)}) · ${esc(VIA[u.via]||'Excel subido')}${u.extra?' · '+esc(u.extra):''}`:esc(u.t)}</span>
    ${u.warn?`<span class="ub-warn">⚠ ${esc(u.warn)}</span>`:''}${st.st==='err'?`<span class="ub-warn">⚠ ${esc(st.msg)}</span>`:''}</div>
    <div class="acts">
      <a class="btn ghost sm" href="${esc(web)}" target="_blank" rel="noopener" title="Abrí el Excel, Archivo → Guardar como → Descargar una copia"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>1 · Abrir en Excel online</a>
      <button class="btn lime sm" data-pick="${pick}"><svg viewBox="0 0 24 24"><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/></svg>2 · Subir Excel</button>
      ${linked[k]?`<button class="btn ghost sm" data-odref="${k}" title="Lee la copia que OneDrive mantiene sincronizada en tu PC">↻ Actualizar desde OneDrive</button><button class="btn ghost sm" data-odun="${k}" title="Desvincular">×</button>`
        :canLink?`<button class="btn ghost sm" data-odlink="${k}" title="Si sincronizás la biblioteca de SharePoint con OneDrive, elegí el archivo una vez y después se actualiza con un clic">Vincular copia de OneDrive</button>`:''}
      ${ms?`<button class="btn ghost sm" data-m365sync="${k}">Sincronizar M365</button>`:''}
      <button class="btn ghost sm" data-m365cfg="1" title="Conexión directa con Microsoft 365 (requiere registro en Entra ID)">⚙</button></div>`;
}
function renderPill(){
  const p=$('#m365pill'); if(!p) return;
  const ks=['aus','vac','ant','fr','an','ropa'], st=ks.map(k=>updInfo(k).st), bad=st.filter(s=>s==='stale'||s==='crit').length, none=st.filter(s=>s==='none').length;
  p.className='m365pill '+(bad?'stale':none?'none':'fresh');
  p.title='Estado de actualización de las fuentes';
  p.innerHTML=`<i></i><span>${bad?`${bad} fuente(s) desactualizada(s)`:none?`${none} fuente(s) sin cargar`:'Datos al día'}</span>`;
}
function renderSrcBars(){ ['vac','ant'].forEach(k=>{ const e=$('#x-src-'+k); if(e){ e.innerHTML=srcBarHTML(k); e.className='srcbar '+updInfo(k).st; } }); renderUpd(); renderPill(); renderSources(); renderCfgStatus(); }
function renderSources(){
  const el=$('#h-src'); if(!el) return;
  const S=[['aus','Reporte del reloj','v-ausentismo'],['vac','Plan de vacaciones · SharePoint','v-vacaciones'],['ant','Control de eventuales · SharePoint','v-bajas'],
    ['fr','Francos asignados','v-francos'],['ropa','Entrega de indumentaria','v-ropa'],['f3','Novedades F3','v-f3'],['an','Anticipos · último cargado','v-anticipos']];
  el.innerHTML=S.map(([k,n,go])=>{ const u=updInfo(k);
    return `<div class="src"><span class="sdot ${u.st==='crit'?'stale':u.st}"></span><div><b>${esc(n)}</b><span>${u.at?`Actualizado ${fmtAt(u.at)} · ${minsAgo(u.at)}`:esc(u.t)}${u.warn?` · <em style="color:#fcd34d;font-style:normal">${esc(u.warn)}</em>`:''}</span></div>
    <div style="display:flex;gap:6px">${(k==='vac'||k==='ant')&&linked[k]?`<button class="btn lime sm" data-odref="${k}">↻</button>`:''}<button class="btn ghost sm" data-v="${go}">${u.st==='none'?'Cargar':'Ver'}</button></div></div>`; }).join('');
}
/* ---------- diálogo de conexión ---------- */
function renderCfgStatus(){
  const el=$('#m365-status'); if(!el) return;
  const w=M365.why();
  el.className='note '+(w?'warn':M365.account?'info':'');
  el.innerHTML=w?`<b>No se puede conectar todavía.</b> ${esc(w)}`
    : M365.account?`<b>Conectado</b> como ${esc(M365.account.username)}. Vacaciones y eventuales se leen del Excel online al abrir el panel y cada 15 minutos.`
    : `<b>Listo para conectar.</b> Tocá "Conectar" e iniciá sesión con tu cuenta de Grupo Gestión.${M365.err?' Último error: '+esc(M365.err):''}`;
  $('#m365-logout').style.display=M365.account?'':'none';
}
function openCfg(){
  $('#m365-cid').value=CFG.clientId||''; $('#m365-ten').value=CFG.tenant||'organizations';
  $('#m365-lvac').value=CFG.links.vac; $('#m365-lant').value=CFG.links.ant; $('#m365-auto').checked=CFG.auto!==false;
  $('#m365-uri').textContent=IS_FILE?'(abrí el panel desde su dirección web para ver la URI)':REDIRECT;
  renderCfgStatus(); $('#m365dlg').classList.add('on');
}
function readCfg(){
  const cid=$('#m365-cid').value.trim(), ten=$('#m365-ten').value.trim()||'organizations';
  const changed=cid!==CFG.clientId||ten!==CFG.tenant;
  CFG.clientId=cid; CFG.tenant=ten; CFG.auto=$('#m365-auto').checked;
  const lv=$('#m365-lvac').value.trim()||DEF_LINKS.vac, la=$('#m365-lant').value.trim()||DEF_LINKS.ant;
  if(lv!==CFG.links.vac) delete CFG.items.vac; if(la!==CFG.links.ant) delete CFG.items.ant;
  CFG.links={vac:lv,ant:la}; saveCFG();
  if(changed){ M365.pca=null; M365.account=null; }
}
function hookSources(){
  document.addEventListener('click',e=>{
    if(e.target.closest('#m365pill')){ goView('v-home'); setTimeout(()=>{ const r=$('#h-src'); if(r) r.scrollIntoView({behavior:'smooth',block:'center'}); },120); return; }
    if(e.target.closest('[data-m365cfg]')){ openCfg(); SND.play('open'); return; }
    if(e.target.closest('[data-m365login]')){ M365.login(); return; }
    const s=e.target.closest('[data-m365sync]'); if(s){ M365.sync(s.dataset.m365sync,true); return; }
  });
  $('#m365-close').onclick=()=>$('#m365dlg').classList.remove('on');
  $('#m365dlg').addEventListener('click',e=>{ if(e.target.id==='m365dlg') $('#m365dlg').classList.remove('on'); });
  $('#m365-save').onclick=async()=>{ readCfg(); await M365.init(); renderSrcBars(); App.toast('Configuración guardada'); };
  $('#m365-connect').onclick=async()=>{ readCfg(); await M365.login(); renderCfgStatus(); };
  $('#m365-logout').onclick=async()=>{ await M365.logout(); renderCfgStatus(); };
  $('#m365-copy').onclick=()=>{ try{ navigator.clipboard.writeText(REDIRECT); App.toast('URI copiada'); }catch(e){ App.toast('Copiala a mano: '+REDIRECT); } };
}

/* ================================================================
   SONIDOS DE INTERFAZ (Web Audio, sin archivos)
   ================================================================ */
const SND=(()=>{
  let ctx=null, master=null;
  function ac(){
    if(!ctx){ const C=window.AudioContext||window.webkitAudioContext; if(!C) return null;
      ctx=new C(); master=ctx.createGain(); master.gain.value=.9; master.connect(ctx.destination); }
    if(ctx.state==='suspended') ctx.resume();
    return ctx;
  }
  function tone(f,dur,o={}){
    const c=ac(); if(!c) return; const t=c.currentTime+(o.at||0);
    const osc=c.createOscillator(), g=c.createGain();
    osc.type=o.type||'sine'; osc.frequency.setValueAtTime(f,t);
    if(o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide,t+dur);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(o.vol||.08,t+.01); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    osc.connect(g); g.connect(master); osc.start(t); osc.stop(t+dur+.03);
  }
  function noise(dur,f0,f1,vol){
    const c=ac(); if(!c) return; const t=c.currentTime;
    const b=c.createBuffer(1,Math.floor(c.sampleRate*dur),c.sampleRate), d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    const s=c.createBufferSource(); s.buffer=b;
    const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.2; bp.frequency.setValueAtTime(f0,t); bp.frequency.exponentialRampToValueAtTime(f1,t+dur);
    const g=c.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+dur*.35); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t+dur);
  }
  const P={
    click:()=>tone(2100,.035,{type:'triangle',vol:.025}),
    nav:()=>{ tone(587,.08,{vol:.05}); tone(880,.12,{vol:.045,at:.055}); },
    ok:()=>{ tone(784,.09,{vol:.05}); tone(1175,.16,{vol:.045,at:.07}); },
    err:()=>{ tone(233,.16,{type:'square',vol:.03}); tone(185,.22,{type:'square',vol:.03,at:.12}); },
    notify:()=>{ tone(1047,.12,{vol:.05}); tone(1397,.12,{vol:.045,at:.1}); tone(1760,.22,{vol:.04,at:.2}); },
    whoosh:()=>noise(.55,400,3200,.05),
    open:()=>tone(420,.16,{vol:.045,slide:840}),
    close:()=>tone(760,.12,{vol:.04,slide:380}),
    add:()=>{ tone(659,.07,{vol:.05}); tone(988,.07,{vol:.05,at:.06}); tone(1319,.14,{vol:.045,at:.12}); }
  };
  return { play(k){ if(UI.snd===false) return; try{ P[k]&&P[k](); }catch(e){} } };
})();
App.snd=SND;
// toasts del panel: suenan según el mensaje
(function(){ const t0=window.toast; if(typeof t0!=='function') return;
  window.toast=function(m){ const r=t0.apply(this,arguments);
    SND.play(/no pude|no se pudo|error|bloque|sin permiso|inválid|falta|no hay|no encontr/i.test(String(m))?'err':'ok'); return r; }; })();
document.addEventListener('pointerdown',e=>{
  const b=e.target.closest('button,.chip,a.btn,.dcell,.ag-cell,select,input[type=checkbox]');
  if(b && !b.closest('[data-v]')) SND.play('click');
},true);

/* ================================================================
   FERIADOS (Argentina) — lista local + API pública si hay conexión
   ================================================================ */
const FER_BASE={
  2026:[['2026-01-01','Año Nuevo','inamovible'],['2026-02-16','Carnaval','inamovible'],['2026-02-17','Carnaval','inamovible'],
    ['2026-03-23','Día no laborable con fines turísticos','no laborable'],['2026-03-24','Día Nacional de la Memoria por la Verdad y la Justicia','inamovible'],
    ['2026-04-02','Día del Veterano y de los Caídos en Malvinas','inamovible'],['2026-04-03','Viernes Santo','inamovible'],
    ['2026-05-01','Día del Trabajador','inamovible'],['2026-05-25','Día de la Revolución de Mayo','inamovible'],
    ['2026-06-15','Paso a la Inmortalidad del Gral. Martín Miguel de Güemes','trasladable'],['2026-06-20','Paso a la Inmortalidad del Gral. Manuel Belgrano','inamovible'],
    ['2026-07-09','Día de la Independencia','inamovible'],['2026-07-10','Día no laborable con fines turísticos','no laborable'],
    ['2026-08-17','Paso a la Inmortalidad del Gral. José de San Martín','trasladable'],['2026-10-12','Día del Respeto a la Diversidad Cultural','trasladable'],
    ['2026-11-09','Feriado nacional por la visita del papa León XIV (Decreto 1103/2026)','inamovible'],    ['2026-11-23','Día de la Soberanía Nacional','trasladable'],
    ['2026-12-08','Inmaculada Concepción de María','inamovible'],['2026-12-25','Navidad','inamovible']],
  2027:[['2027-01-01','Año Nuevo','inamovible'],['2027-02-08','Carnaval','inamovible'],['2027-02-09','Carnaval','inamovible'],
    ['2027-03-24','Día Nacional de la Memoria por la Verdad y la Justicia','inamovible'],['2027-03-26','Viernes Santo','inamovible'],
    ['2027-04-02','Día del Veterano y de los Caídos en Malvinas','inamovible'],['2027-05-01','Día del Trabajador','inamovible'],
    ['2027-05-25','Día de la Revolución de Mayo','inamovible'],['2027-06-17','Paso a la Inmortalidad del Gral. Güemes (fecha a confirmar)','trasladable'],
    ['2027-06-20','Paso a la Inmortalidad del Gral. Manuel Belgrano','inamovible'],['2027-07-09','Día de la Independencia','inamovible'],
    ['2027-08-17','Paso a la Inmortalidad del Gral. San Martín (fecha a confirmar)','trasladable'],['2027-10-12','Día del Respeto a la Diversidad Cultural (fecha a confirmar)','trasladable'],
    ['2027-11-20','Día de la Soberanía Nacional (fecha a confirmar)','trasladable'],['2027-12-08','Inmaculada Concepción de María','inamovible'],
    ['2027-12-25','Navidad','inamovible']]
};
// feriados de la provincia de Buenos Aires (Isidro Casanova): la API nacional no los trae
const FER_LOCAL=[['2026-11-09','Feriado nacional por la visita del papa León XIV (Decreto 1103/2026)','inamovible'],['2026-11-11','Feriado en la provincia de Buenos Aires (visita del papa León XIV)','provincial']];
// días que la API marca como no laborables/puente pero en el CD se trabajan normalmente (suman jornada)
const FER_NO=['2026-12-07'];
let FER={};
function ferLoadLocal(){ FER={}; for(const y in FER_BASE) FER_BASE[y].forEach(([d,n,t])=>FER[d]={n,t});
  try{ const c=JSON.parse(localStorage.getItem('rrhh-ic-feriados')||'{}'); for(const y in c) (c[y].list||[]).forEach(f=>FER[f.d]={n:f.n,t:f.t}); }catch(e){} 
  FER_LOCAL.forEach(([d,n,t])=>{ FER[d]={n,t}; });
  FER_NO.forEach(d=>{ delete FER[d]; }); }
async function ferFetch(){
  const y=new Date().getFullYear(); let cache={};
  try{ cache=JSON.parse(localStorage.getItem('rrhh-ic-feriados')||'{}'); }catch(e){}
  for(const yy of [y,y+1]){
    if(cache[yy]&&Date.now()-cache[yy].t<7*864e5) continue;
    try{ const r=await fetch(`https://api.argentinadatos.com/v1/feriados/${yy}`); if(!r.ok) continue;
      const j=await r.json(); if(!Array.isArray(j)||!j.length) continue;
      // la API manda la lista completa del año: reemplaza la local de ese año
      Object.keys(FER).filter(d=>d.startsWith(yy+'-')).forEach(d=>delete FER[d]);
      cache[yy]={t:Date.now(),list:j.map(f=>({d:f.fecha,n:f.nombre,t:f.tipo}))};
    }catch(e){}
  }
  try{ localStorage.setItem('rrhh-ic-feriados',JSON.stringify(cache)); }catch(e){}
  ferLoadLocal(); App.refresh();
}
ferLoadLocal();
const ferEn = iso => FER[iso]||null;
const nextFeriados = (n=3) => Object.keys(FER).filter(d=>d>=hoy()).sort().slice(0,n).map(d=>Object.assign({d},FER[d]));
const habil = iso => { const w=dObj(iso).getDay(); return w!==0&&w!==6&&!(FER[iso]&&FER[iso].t!=='no laborable'); };

/* ================================================================
   CLIMA — Isidro Casanova (Open-Meteo, sin clave)
   ================================================================ */
const WMO=c=> c===0?['☀️','Despejado']:c<=2?['🌤️','Parcialmente nublado']:c===3?['☁️','Nublado']:c<=48?['🌫️','Niebla']:
  c<=57?['🌦️','Llovizna']:c<=67?['🌧️','Lluvia']:c<=77?['❄️','Nieve']:c<=82?['🌧️','Chaparrones']:['⛈️','Tormenta'];
let WX=null;
try{ WX=JSON.parse(localStorage.getItem('rrhh-ic-clima')||'null'); }catch(e){}
async function wxFetch(force){
  if(!force&&WX&&Date.now()-WX.t<30*60e3) return renderWx();
  try{
    const u='https://api.open-meteo.com/v1/forecast?latitude=-34.7067&longitude=-58.5853&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'+
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=4';
    const r=await fetch(u); if(!r.ok) throw new Error('HTTP '+r.status);
    WX={t:Date.now(),d:await r.json()}; try{ localStorage.setItem('rrhh-ic-clima',JSON.stringify(WX)); }catch(e){}
  }catch(e){ if(WX) WX.err=true; else WX={err:true}; }
  renderWx();
}
function renderWx(){
  const el=$('#h-clima'); if(!el) return;
  if(!WX||!WX.d){ el.innerHTML=`<div class="hi-lab">Clima · Isidro Casanova</div><div class="hi-empty">Sin conexión con el servicio del clima.<br><button class="btn ghost sm" id="wx-retry">Reintentar</button></div>`; return; }
  const c=WX.d.current, dd=WX.d.daily, [ic,tx]=WMO(c.weather_code);
  el.innerHTML=`<div class="hi-lab">Clima · Isidro Casanova <span>${WX.err?'sin actualizar':'actualizado '+new Date(WX.t).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}</span></div>
    <div class="wx-now"><span class="wx-ic">${ic}</span><div><div class="wx-t">${Math.round(c.temperature_2m)}°</div><div class="wx-tx">${tx}</div></div>
    <div class="wx-meta">Sensación ${Math.round(c.apparent_temperature)}°<br>Humedad ${c.relative_humidity_2m}%<br>Viento ${Math.round(c.wind_speed_10m)} km/h</div></div>
    <div class="wx-days">${dd.time.slice(0,4).map((d,i)=>{ const [di]=WMO(dd.weather_code[i]);
      return `<div data-tip="${esc(DOWL[dObj(d).getDay()]+' '+dm(d)+'\n'+WMO(dd.weather_code[i])[1]+'\nProbabilidad de lluvia '+dd.precipitation_probability_max[i]+'%')}"><span>${i===0?'hoy':DOW[dObj(d).getDay()]}</span><i>${di}</i><b>${Math.round(dd.temperature_2m_max[i])}°</b><em>${Math.round(dd.temperature_2m_min[i])}°</em>${dd.precipitation_probability_max[i]>=40?`<small>💧${dd.precipitation_probability_max[i]}%</small>`:''}</div>`; }).join('')}</div>`;
}
document.addEventListener('click',e=>{ if(e.target.closest('#wx-retry')) wxFetch(true); });

/* --- tarjetas de fecha y feriado --- */
function renderInfoCards(){
  const now=new Date(), H=hoy(), y=now.getFullYear();
  const doy=Math.floor((dObj(H)-new Date(y,0,1))/864e5)+1;
  const fin=isoOf(new Date(y,now.getMonth()+1,0)); let hab=0; for(let d=H; d<=fin; d=addD(d,1)) if(habil(d)) hab++;
  const wk=Math.ceil((((now-new Date(y,0,1))/864e5)+new Date(y,0,1).getDay()+1)/7);
  const fh=ferEn(H);
  const ef=$('#h-fecha');
  if(ef) ef.innerHTML=`<div class="hi-lab">Hoy</div><div class="dt-big"><b>${now.getDate()}</b><div><span>${DOWL[now.getDay()]}</span><em>${MESL[now.getMonth()]} ${y}</em></div></div>
    <div class="dt-meta"><span>Semana <b>${wk}</b></span><span>Día <b>${doy}</b> del año</span><span><b>${hab}</b> días hábiles al cierre del mes</span></div>
    ${fh?`<div class="dt-fer">🇦🇷 Hoy es feriado: ${esc(fh.n)}</div>`:''}`;
  const nf=nextFeriados(4).filter(f=>f.d>H||f.d===H), ff=$('#h-feriado');
  if(ff){ if(!nf.length){ ff.innerHTML='<div class="hi-lab">Próximo feriado</div><div class="hi-empty">Sin datos de feriados.</div>'; }
    else{ const f=nf[0], dd=diffD(H,f.d), w=dObj(f.d).getDay(), largo=w===1||w===5||(w===2&&FER[addD(f.d,-1)])||(w===4&&FER[addD(f.d,1)]);
      ff.innerHTML=`<div class="hi-lab">Próximo feriado <span>${esc(f.t||'')}</span></div>
        <div class="fer-n">${esc(f.n)}</div>
        <div class="fer-d">${DOWL[w][0].toUpperCase()+DOWL[w].slice(1)} ${dObj(f.d).getDate()} de ${MESL[dObj(f.d).getMonth()]}</div>
        <div class="fer-c"><b>${dd===0?'Hoy':dd===1?'Mañana':dd}</b>${dd>1?' días':''}${largo?' · <span>fin de semana largo</span>':''}</div>
        <div class="fer-next">${nf.slice(1,3).map(x=>`<span>${dm(x.d)} · ${esc(x.n.replace(/\s*\(fecha a confirmar\)/,''))}</span>`).join('')}</div>`; } }
}

/* ================================================================
   ÚLTIMA ACTUALIZACIÓN DE CADA FUENTE
   ================================================================ */
const fmtAt = iso => { if(!iso) return '—'; const d=new Date(iso); return `${dmy(isoOf(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const VIA={archivo:'Excel subido',onedrive:'copia sincronizada de OneDrive',m365:'Microsoft 365'};
function updInfo(k){
  const H=hoy();
  if(k==='aus'){ const f=(DB.files||[]).slice(-1)[0], bd=safe(byDate), last=bd[bd.length-1];
    if(!f) return {st:'none',t:'Todavía no cargaste ningún reporte del reloj'};
    const gap=last?diffD(last.f,H):99, lim=dObj(H).getDay()===1?3:1;
    return {st:gap>lim?'stale':'fresh',at:f.at,file:f.name,extra:last?`último día con fichadas: ${lblDay(last.f)}`:'',
      warn:gap>lim?`Faltan ${gap-1} día(s) de reloj por cargar`:''}; }
  if(k==='vac'||k==='ant'){ const d=k==='vac'?DB.vac:DB.ant, lim=k==='vac'?7:3;
    if(!d) return {st:'none',t:k==='vac'?'Todavía no cargaste el plan de vacaciones':'Todavía no cargaste el control de eventuales'};
    const a=ago(d.at);
    return {st:a>lim*2?'crit':a>lim?'stale':'fresh',at:d.at,file:d.file,via:d.via||'archivo',
      extra:d.src&&d.src.mod?`editado en SharePoint el ${fmtAt(d.src.mod)}${d.src.by?' por '+d.src.by:''}`:'',
      warn:a>lim?`Hace ${a} días que no se actualiza: bajá la versión nueva de SharePoint`:''}; }
  if(k==='fr'){ const F=DB.francos; if(!F) return {st:'none',t:'Todavía no cargaste la planilla de francos'};
    const ds=frDates(), cubre=ds.includes(H);
    return {st:cubre?'fresh':'stale',at:F.at,file:(F.files||[]).slice(-1)[0],extra:ds.length?`cubre del ${dmy(ds[0])} al ${dmy(ds[ds.length-1])}`:'',
      warn:cubre?'':'La planilla cargada no incluye el día de hoy'}; }
  if(k==='an'){ const LL=lastLotes(); if(!LL.length) return {st:'none',t:'Todavía no cargaste anticipos'};
    const a=ago(LL[0].at); return {st:a>35?'stale':'fresh',at:LL[0].at,file:LL.map(l=>l.file).join(' + '),warn:a>35?'Pasó más de un mes del último archivo':''}; }
  if(k==='ropa'){ const R=ROPA(); if(!R) return {st:'none',t:'Todavía no cargaste la planilla de entrega de indumentaria'};
    const a=ago(R.at); return {st:a>7?'stale':'fresh',at:R.at,file:R.file,extra:`${Math.round(ropaStats().pct)}% entregado`,warn:a>7?`Hace ${a} días que no se actualiza el avance`:''}; }
  if(k==='f3'){ const s=window.F3API?F3API.estado():{}; return s.base?{st:s.nov?'fresh':'stale',t:`Base F3 cargada (${s.emp} legajos${s.tipo?' · '+s.tipo:''})${s.nov?' · novedades cargadas':' · faltan las novedades del mes'}`}:{st:'none',t:'Todavía no cargaste la base F3'}; }
  return {st:'none',t:''};
}
function updHTML(k){
  const u=updInfo(k);
  const main=u.at?`<b>Última actualización: ${fmtAt(u.at)}</b> <span class="ub-ago">(${minsAgo(u.at)})</span>${u.file?` · ${esc(u.file)}`:''}${u.via?` · ${esc(VIA[u.via]||u.via)}`:''}${u.extra?` · ${esc(u.extra)}`:''}`:`<b>${esc(u.t)}</b>`;
  return `<span class="ub-dot"></span><span class="ub-txt">${main}${u.warn?`<span class="ub-warn">⚠ ${esc(u.warn)}</span>`:''}</span>`;
}
function renderUpd(){
  [['aus','#upd-aus'],['fr','#upd-fr'],['an','#upd-an'],['f3','#upd-f3'],['ropa','#upd-ropa']].forEach(([k,s])=>{ const e=$(s); if(e){ e.className='updbar '+updInfo(k).st; e.innerHTML=updHTML(k); } });
}
const STALE_MSG={'v-vacaciones':'vac','v-bajas':'ant','v-ausentismo':'aus','v-francos':'fr','v-anticipos':'an','v-ropa':'ropa'};
function staleCheck(id){
  const k=STALE_MSG[id]; if(!k) return;
  const u=updInfo(k);
  if(u.st==='stale'||u.st==='crit'||u.st==='none') setTimeout(()=>{ App.toast(u.at?`⚠ Última actualización ${minsAgo(u.at)} (${fmtAt(u.at)}). ${u.warn||''}`:`⚠ ${u.t}`,u.st!=='none'); SND.play('notify'); },UI.anim?1900:250);
}

/* ================================================================
   COPIA SINCRONIZADA DE ONEDRIVE (sin IT, Chrome/Edge)
   ================================================================ */
const IDB={
  db:null,
  open(){ if(this.db) return Promise.resolve(this.db);
    return new Promise((res,rej)=>{ try{ const r=indexedDB.open('rrhh-ic-panel',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('h'); r.onsuccess=()=>{this.db=r.result;res(r.result)}; r.onerror=()=>rej(r.error);
    }catch(e){rej(e)} }); },
  async get(k){ try{ const db=await this.open(); return await new Promise(res=>{ const q=db.transaction('h').objectStore('h').get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }catch(e){ return null; } },
  async set(k,v){ try{ const db=await this.open(); return await new Promise(res=>{ const t=db.transaction('h','readwrite'); t.objectStore('h').put(v,k); t.oncomplete=()=>res(true); t.onerror=()=>res(false); }); }catch(e){ return false; } },
  async del(k){ try{ const db=await this.open(); const t=db.transaction('h','readwrite'); t.objectStore('h').delete(k); }catch(e){} }
};
const linked={};
const canLink=typeof window.showOpenFilePicker==='function';
async function loadLinked(){ for(const k of ['vac','ant']){ const h=await IDB.get('src-'+k); if(h) linked[k]=h; } renderSrcBars(); }
async function linkSrc(k){
  if(!canLink){ App.toast('Este navegador no permite vincular archivos: usá Chrome o Edge, o subí el Excel.',true); return; }
  try{ const [h]=await window.showOpenFilePicker({types:[{description:'Excel',accept:{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx','.xlsm','.xls']}}],multiple:false});
    linked[k]=h; await IDB.set('src-'+k,h); await refreshLinked(k);
  }catch(e){ if(e&&e.name!=='AbortError') App.toast('No se pudo vincular: '+e.message,true); }
}
async function refreshLinked(k){
  const h=linked[k]; if(!h) return linkSrc(k);
  try{
    let p=await h.queryPermission({mode:'read'}); if(p!=='granted') p=await h.requestPermission({mode:'read'});
    if(p!=='granted'){ App.toast('Sin permiso para leer el archivo vinculado',true); return; }
    const f=await h.getFile();
    if(k==='vac'){ await loadVacFile(f); if(DB.vac){ DB.vac.via='onedrive'; DB.vac.src={mod:new Date(f.lastModified).toISOString()}; } }
    else { await loadAntFile(f); if(DB.ant){ DB.ant.via='onedrive'; DB.ant.src={mod:new Date(f.lastModified).toISOString()}; } }
    await persist(); renderSrcBars(); App.refresh();
  }catch(e){ App.toast('No pude leer el archivo vinculado ('+e.message+'). Volvé a vincularlo.',true); }
}
async function unlinkSrc(k){ delete linked[k]; await IDB.del('src-'+k); renderSrcBars(); App.toast('Copia de OneDrive desvinculada'); }
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-odlink]'); if(a){ linkSrc(a.dataset.odlink); return; }
  const r=e.target.closest('[data-odref]'); if(r){ refreshLinked(r.dataset.odref); return; }
  const u=e.target.closest('[data-odun]'); if(u){ unlinkSrc(u.dataset.odun); return; }
  const p=e.target.closest('[data-pick]'); if(p){ const b=$(p.dataset.pick); if(b) b.click(); return; }
});

/* ================================================================
   FRANCOS ASIGNADOS
   ================================================================ */
const MESN={ene:0,enero:0,feb:1,febrero:1,mar:2,marzo:2,abr:3,abril:3,may:4,mayo:4,jun:5,junio:5,jul:6,julio:6,ago:7,agosto:7,sep:8,sept:8,set:8,septiembre:8,setiembre:8,oct:9,octubre:9,nov:10,noviembre:10,dic:11,diciembre:11};
function frCellDate(c,ctx){
  if(c instanceof Date||(typeof c==='number'&&c>30000&&c<70000)) return excelDateToISO(c)||null;
  const s=String(c==null?'':c).trim(); if(!s) return null; let m;
  if(m=s.match(/^(\d{4})-(\d{2})-(\d{2})/)) return `${m[1]}-${m[2]}-${m[3]}`;
  if(m=s.match(/(?:^|\s)(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/)){ let y=m[3]?(m[3].length===2?'20'+m[3]:m[3]):ctx.year;
    if(+m[2]<1||+m[2]>12||+m[1]<1||+m[1]>31) return null; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  return null;
}
function frContext(rows,name){
  const txt=[name,...rows.slice(0,8).map(r=>(r||[]).map(c=>c instanceof Date?'':String(c==null?'':c)).join(' '))].join(' ').toLowerCase();
  let month=null, year=null, m;
  for(const r of rows.slice(0,8)) for(const c of (r||[])) if(c instanceof Date&&month==null){ month=c.getMonth(); year=c.getFullYear(); }
  if(month==null){ for(const k in MESN){ if(new RegExp('\\b'+k+'\\b').test(txt)){ month=MESN[k]; break; } } }
  if(month==null&&(m=name.match(/[_\s-](\d{1,2})[_.\-](20\d{2})/))){ month=+m[1]-1; year=+m[2]; }
  if(year==null&&(m=txt.match(/\b(20\d{2})\b/))) year=+m[1];
  const now=new Date(); return {month:month==null?now.getMonth():month, year:year==null?now.getFullYear():year};
}
function frVal(v){
  if(v==null) return null;
  if(v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if(typeof v==='number') return v===0?'F':String(Math.round(v*100)/100);
  const s=String(v).trim(); if(!s) return null;
  if(s==='0'||/^f(co|ranco)?\.?$/i.test(s)||/^franco/i.test(s)) return 'F';
  return s;
}
function parseFrancos(rows,fileName){
  const ctx=frContext(rows,fileName), HN=/apellido|nombre|empleado|colaborador|personal|operario/i, HL=/legajo|^leg\.?$|n[°º]\s*leg|c[oó]digo|^nro/i,
    HT=/turno|horario/i, HS=/sector|tarea|puesto|[aá]rea|categor/i;
  // 1) formato ancho: una fila de encabezado con fechas o números de día
  let best=null;
  for(let i=0;i<Math.min(rows.length,15);i++){
    const r=rows[i]||[]; const cols=[];
    r.forEach((c,j)=>{ const d=frCellDate(c,{year:ctx.year}); if(d) cols.push([j,d]); });
    let nums=[]; r.forEach((c,j)=>{ const n=typeof c==='number'?c:/^\d{1,2}$/.test(String(c==null?'':c).trim())?+String(c).trim():NaN; if(Number.isInteger(n)&&n>=1&&n<=31) nums.push([j,n]); });
    // las columnas de fecha que no son días (ingreso/egreso) quedan afuera: tienen que ser consecutivas
    if(cols.length>=5){ const run=[]; let cur=[];
      cols.forEach((c,k)=>{ if(k&&c[0]===cols[k-1][0]+1) cur.push(c); else { if(cur.length>run.length) run.splice(0,run.length,...cur); cur=[c]; } });
      if(cur.length>run.length) run.splice(0,run.length,...cur);
      if(run.length>=5&&(!best||run.length>best.cols.length)) best={i,cols:run}; }
    else if(nums.length>=7&&(!best||nums.length>best.cols.length)){
      let mo=ctx.month, y=ctx.year, prev=0; const cc=[];
      nums.forEach(([j,n])=>{ if(n<prev){ mo++; if(mo>11){mo=0;y++;} } prev=n; cc.push([j,`${y}-${pad(mo+1)}-${pad(n)}`]); });
      best={i,cols:cc,num:true};
    }
  }
  const out=[];
  if(best){
    const head=(rows[best.i]||[]).map(c=>c instanceof Date?'':String(c==null?'':c).trim());
    const up=best.i>0?(rows[best.i-1]||[]).map(c=>c instanceof Date?'':String(c==null?'':c).trim()):[];
    const dc=new Set(best.cols.map(c=>c[0])), fc=best.cols[0][0];
    const find=(re,before)=>{ const ok=(h,k)=>!dc.has(k)&&(!before||k<fc)&&re.test(h); let j=head.findIndex(ok); if(j<0) j=up.findIndex(ok); return j; };
    let cn=find(HN,true); const cl=find(HL,true), ct=find(HT), cs=find(HS), ci=find(/ingreso/i), ce=find(/egreso/i),
      cj=find(/^jornadas?$/i), cfe=find(/^feriados?$/i), ca=find(/asignar/i), co=find(/observ/i);
    if(cn<0){ for(let j=0;j<fc;j++){ if(j===cl) continue; const sample=rows.slice(best.i+1,best.i+12).map(r=>r&&r[j]).filter(v=>v!=null&&v!=='');
      if(sample.length&&sample.filter(v=>typeof v==='string'&&/[a-záéíóúñ]{3}/i.test(v)).length>=sample.length*.6){ cn=j; break; } } }
    if(cn<0) throw new Error('No encontré la columna con el nombre del empleado.');
    const num=v=>v==null||v===''||isNaN(+v)?null:+v;
    for(let i=best.i+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue;
      const nombre=String(r[cn]==null?'':r[cn]).replace(/\s+/g,' ').trim();
      if(!nombre||HN.test(nombre)||/^total/i.test(nombre)) continue;
      const ingreso=ci>=0?excelDateToISO(r[ci])||'':'', egreso=ce>=0?excelDateToISO(r[ce])||'':'';
      const d={}; let n=0;
      best.cols.forEach(([j,iso])=>{ let v=frVal(r[j]); if(v==null) return;
        // un 0 antes del ingreso o después del egreso no es franco: está fuera de contrato
        if(v==='F'&&((ingreso&&iso<ingreso)||(egreso&&iso>egreso))) v='B';
        d[iso]=v; n++; });
      if(!n) continue;
      out.push({legajo:cl>=0?String(r[cl]==null?'':r[cl]).trim().replace(/\.0+$/,''):'',nombre,turno:ct>=0?String(r[ct]||'').trim():'',sector:cs>=0?String(r[cs]||'').trim():'',
        ingreso,egreso,jornadas:cj>=0?num(r[cj]):null,feriado:cfe>=0?num(r[cfe]):null,aAsignar:ca>=0?num(r[ca]):null,obs:co>=0?String(r[co]||'').trim():'',d});
    }
    return out;
  }
  // 2) formato largo: Fecha | Nombre | Valor
  let hi=-1; for(let i=0;i<Math.min(rows.length,15);i++){ const j=(rows[i]||[]).map(c=>String(c||'')); if(j.some(c=>/fecha|^d[ií]a$/i.test(c))&&j.some(c=>HN.test(c))){hi=i;break} }
  if(hi<0) throw new Error('No reconocí el formato: espero fechas como columnas o columnas Fecha y Nombre.');
  const head=rows[hi].map(c=>String(c||'').trim());
  const cf=head.findIndex(h=>/fecha|^d[ií]a$/i.test(h)), cn=head.findIndex(h=>HN.test(h)), cl=head.findIndex(h=>HL.test(h)), ct=head.findIndex(h=>HT.test(h)), cs=head.findIndex(h=>HS.test(h));
  let cv=head.findIndex((h,j)=>j!==cf&&j!==cn&&/franco|jornada|horas|asign|valor|estado/i.test(h)); if(cv<0) cv=head.length-1;
  const map={};
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue;
    const f=frCellDate(r[cf],{year:ctx.year}), nombre=String(r[cn]==null?'':r[cn]).trim(); if(!f||!nombre) continue;
    const v=frVal(r[cv]); if(v==null) continue;
    const key=(cl>=0&&r[cl]?String(r[cl]).trim():'')||nombre.toUpperCase();
    const e=map[key]||(map[key]={legajo:cl>=0?String(r[cl]||'').trim():'',nombre,turno:ct>=0?String(r[ct]||'').trim():'',sector:cs>=0?String(r[cs]||'').trim():'',d:{}});
    e.d[f]=v; }
  return Object.values(map);
}
// observaciones sueltas en otras hojas (LEGAJO + Observaciones)
function frObs(rows){
  const m={}; let hi=-1, cl=-1, co=-1;
  for(let i=0;i<Math.min(rows.length,10);i++){ const h=(rows[i]||[]).map(c=>String(c||'').trim()); const a=h.findIndex(x=>/legajo/i.test(x)), b=h.findIndex(x=>/observ/i.test(x)); if(a>=0&&b>=0){hi=i;cl=a;co=b;break} }
  if(hi<0) return m;
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r||r[cl]==null||!r[co]) continue; m[String(r[cl]).trim().replace(/\.0+$/,'')]=String(r[co]).trim(); }
  return m;
}
const frKey = e => (e.legajo&&e.legajo!=='0'?e.legajo:'')||e.nombre.toUpperCase();
const normTxt=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().toUpperCase().normalize('NFD').replace(/([AEIOU])[\u0300-\u036f]+/g,'$1').normalize('NFC');   // quita tildes de vocales, conserva la Ñ
// "Noche", "NOCHE " y "noche" son el mismo turno (igual con sectores)
// Empleados de francos = plan de francos + lista de eventuales (Control de eventuales).
// La lista de eventuales manda en sector (tarea), turno, ingreso y egreso; los eventuales activos
// que no están en el plan aparecen igual, con jornadas planificadas hasta que se les asigne franco.
const ANTOF=new Map(), FR_VIRT=new Map();
// fuera de Francos: coordinadores (aunque figuren como eventuales) y legajos puntuales
const FR_EXCL=new Set(['285485']);   // Falcón Franco Javier: es coordinador
const frExcl=e=>FR_EXCL.has(String(e.legajo||''))||/COORDINAD/i.test(e.sector||'');
const antOK=v=>v&&v!=='SIN DATO';
const FRE = () => {
  const L=DB.francos?Object.values(DB.francos.emps||{}):[];
  L.forEach(e=>{ if(!e._n){ e.turno=normTxt(e.turno); e.sector=normTxt(e.sector); e._n=1; } });
  const A=typeof antRows==='function'?antRows():[]; ANTOF.clear(); if(!A.length) return L.filter(e=>!frExcl(e));
  const lim=addD(hoy(),-75), by={}; L.forEach(e=>{ if(e.legajo) by[e.legajo]=e; });
  const out=L.slice();
  for(const a of A){
    if(!a.activo) continue;   // solo eventuales ACTIVOS
    ANTOF.set(a.legajo,a);
    const e=by[a.legajo];
    if(e){ if(antOK(a.tarea)) e.sector=normTxt(a.tarea); if(antOK(a.turno)) e.turno=normTxt(a.turno);
      if(a.ingreso) e.ingreso=a.ingreso; if(!a.activo&&a.egreso) e.egreso=a.egreso; continue; }
    let v=FR_VIRT.get(a.legajo);
    if(!v||v._a!==a){ v={legajo:a.legajo,nombre:a.nombre,turno:antOK(a.turno)?normTxt(a.turno):'',sector:antOK(a.tarea)?normTxt(a.tarea):'',ingreso:a.ingreso||'',egreso:a.activo?'':(a.egreso||''),d:{},_n:1};
      Object.defineProperty(v,'_a',{value:a,enumerable:false}); FR_VIRT.set(a.legajo,v); }
    out.push(v); }
  return out.filter(e=>!frExcl(e)); };
// un empleado de la lista de eventuales que todavía no está en el plan pasa al plan cuando se le asigna algo
function frMaterial(e){
  DB.francos=DB.francos||{emps:{},files:[]}; const k=frKey(e);
  if(!DB.francos.emps[k]){ const c={legajo:e.legajo,nombre:e.nombre,turno:e.turno,sector:e.sector,ingreso:e.ingreso||'',egreso:e.egreso||'',d:e.d||{},_n:1}; DB.francos.emps[k]=c; FR_VIRT.delete(e.legajo); return c; }
  return DB.francos.emps[k]; }
// Período de liquidación: del 23 del mes anterior al 22 del mes (noviembre = 23/10 al 22/11)
const liqDe=iso=>{ const d=dObj(iso); let y=d.getFullYear(), m=d.getMonth(); if(d.getDate()>=23){ m++; if(m>11){ m=0; y++; } } return `${y}-${pad(m+1)}`; };
const liqPer=ym=>{ const [y,m]=ym.split('-').map(Number), p=new Date(y,m-2,23); return {d0:`${p.getFullYear()}-${pad(p.getMonth()+1)}-23`,d1:`${y}-${pad(m)}-22`,ym}; };
const liqNom=ym=>{ const [y,m]=ym.split('-').map(Number); return MESL[m-1][0].toUpperCase()+MESL[m-1].slice(1)+' '+y; };
const liqMas=(ym,n)=>{ let [y,m]=ym.split('-').map(Number); m+=n; while(m>12){ m-=12; y++; } while(m<1){ m+=12; y--; } return `${y}-${pad(m)}`; };
// quién cargó cada franco: {legajo: {fecha: {v, by, at}}}
const frMeta=(e,d)=>{ const fa=DB.francos&&DB.francos.fa, m=fa&&fa[frKey(e)]; return m&&m[d]||null; };
function frDeFranco(d){ return FRE().filter(e=>(!ANTOF.size||ANTOF.has(e.legajo))&&e.d[d]==='F'&&!(e.ingreso&&d<e.ingreso)&&!(e.egreso&&d>e.egreso)); }
function renderFrDia(){
  const el=$('#fr-dia'); if(!el) return; const d=frState.dia||hoy();
  const L=frDeFranco(d).filter(frFlt).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')), G={};
  L.forEach(e=>{ const k=secKey(e.sector)+' · '+turKey(e.turno); (G[k]||(G[k]=[])).push(e); });
  el.innerHTML=`<div class="fr-dnav"><button class="fr-arr" data-frdia="-1">‹</button><div><b>${esc(DOWL[dObj(d).getDay()][0].toUpperCase()+DOWL[dObj(d).getDay()].slice(1))} ${dmy(d)}</b><span>${L.length?`${L.length} colaborador(es) con franco asignado${frState.sectors.length||frState.turnos.length||frState.q?' en este filtro':''}`:'Nadie con franco asignado'}</span></div><button class="fr-arr" data-frdia="1">›</button>${d!==hoy()?'<button class="btn ghost sm" data-frdia="0">Hoy</button>':''}<input type="date" id="fr-dia-i" value="${d}"></div>
    ${Object.keys(G).sort((a,b)=>a.localeCompare(b,'es')).map(k=>`<div class="fr-dg"><h4>${esc(k)} <i>${G[k].length}</i></h4><div>${G[k].map(e=>{ const m=frMeta(e,d); return `<span class="fr-dp" title="${esc(m&&m.v==='F'?'Cargado por '+m.by+' · '+fmtAt(m.at):'Del plan de francos')}">${esc(e.nombre)}${FRIO(e.legajo)}<em>${esc(e.legajo||'')}</em></span>`; }).join('')}</div></div>`).join('')||'<div class="empty">No hay francos asignados ese día con este filtro.</div>'}`;
}
function frFlt(e){ const q=frState.q.trim().toLowerCase(); return (!frState.turnos.length||frState.turnos.includes(turKey(e.turno)))&&(!frState.sectors.length||frState.sectors.includes(secKey(e.sector)))&&(!q||e.nombre.toLowerCase().includes(q)||String(e.legajo).includes(q)); }
const frAsig=(e,ds)=>ds.reduce((a,d)=>a+(e.d[d]==='F'&&!(e.ingreso&&d<e.ingreso)&&!(e.egreso&&d>e.egreso)&&dObj(d).getDay()!==0?1:0),0);
function frCanEdit(){ return !(window.SRV&&SRV.mode==='online')||SRV.user.rol==='admin'||(SRV.user.perms&&SRV.user.perms.francos)==='editar'; }
const frUser=()=>(window.SRV&&SRV.mode==='online'&&SRV.user&&SRV.user.nombre)||'Este equipo';
function frDates(){ const s=new Set(); FRE().forEach(e=>Object.keys(e.d).forEach(d=>s.add(d))); return [...s].sort(); }
const frOn = iso => FRE().filter(e=>e.d[iso]==='F');
const frWork = iso => FRE().filter(e=>e.d[iso]!=null&&e.d[iso]!=='F'&&e.d[iso]!=='B');
async function loadFrancos(files){
  if(typeof XLSX==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  DB.francos=DB.francos||{emps:{},files:[]}; let n=0, errs=[], asigMsg=0;
  for(const f of files){
    try{
      const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
      let got=[], gotName='', obs={};
      const meta=(wb.Workbook&&wb.Workbook.Sheets)||[];
      const vis=wb.SheetNames.filter((sn,i)=>!(meta[i]&&meta[i].Hidden));
      const order=(vis.length?vis:wb.SheetNames).slice().sort((a,b)=>(/unificad/i.test(b)?1:0)-(/unificad/i.test(a)?1:0));
      let movN=0;
      if(esAsignacion(wb)){ const A=await loadAsignacion(wb,f.name); n+=A.emp||1;
        asigMsg=1; App.toast(`Asignación cargada (${A.hojas} hoja/s): ${A.fr} franco(s) nuevos en ${A.emp} empleado(s)${A.jo?' · '+A.jo+' vuelto(s) a jornada':''}${A.falt.length?' · '+A.falt.length+' con francos sin completar':''}${A.noEnc.length?' · '+A.noEnc.length+' legajo(s) no están en el plan':''}`,!!(A.falt.length||A.noEnc.length));
        if(A.falt.length||A.noEnc.length) console.warn('Asignación',A); continue; }
      for(const sn of order){ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:false});
        const mh=esMovimientos(rows); if(mh>=0){ movN=await loadMovFrancos(rows,mh,f.name); break; }
        Object.assign(obs,frObs(rows));
        try{ const r=parseFrancos(rows,f.name+' '+sn); if(/unificad/i.test(sn)&&r.length){ got=r; gotName=sn; break; } if(r.length>got.length){ got=r; gotName=sn; } }catch(e){ if(!got.length) errs.push(f.name+': '+e.message); } }
      if(movN){ n+=movN; App.toast(`Movimientos cargados: ${movN} legajo(s) · ${dmy(DB.francos.mov.d0)} al ${dmy(DB.francos.mov.d1)}`); continue; }
      if(!got.length) continue;
      { const ds=[]; got.forEach(e=>Object.keys(e.d).forEach(d=>ds.push(d))); ds.sort(); if(ds.length){ DB.francos.per={d0:ds[0],d1:ds[ds.length-1]}; frState.liq=liqDe(ds[ds.length-1]); } }
      got.forEach(e=>{ if(!e.obs&&obs[e.legajo]) e.obs=obs[e.legajo]; });
      DB.francos=DB.francos||{emps:{},files:[]}; DB.francos.hoja=gotName;
      for(const e of got){ const k=frKey(e), cur=DB.francos.emps[k];
        if(cur){ Object.assign(cur.d,e.d); ['nombre','turno','sector','ingreso','egreso','obs'].forEach(k=>{ if(e[k]) cur[k]=e[k]; }); ['jornadas','feriado','aAsignar'].forEach(k=>{ if(e[k]!=null) cur[k]=e[k]; }); }
        else DB.francos.emps[k]=e; }
      DB.francos.files=(DB.francos.files||[]).filter(x=>x!==f.name).concat(f.name); n+=got.length;
    }catch(e){ errs.push(f.name+': '+e.message); }
  }
  if(n){ DB.francos.at=new Date().toISOString(); await persist();
    const ds=frDates(); frState.date=ds.includes(hoy())?hoy():ds.find(d=>d>=hoy())||ds[ds.length-1];
    if(!asigMsg&&Object.keys(DB.francos.emps).length) App.toast(`Francos: ${Object.keys(DB.francos.emps).length} empleado(s) · ${ds.length} día(s)${DB.francos.mov?' · cruce con fichadas al '+dmy(DB.francos.mov.d1):''}`); }
  else if(errs.length) App.toast(errs[0],true);
  renderFrancos(); App.refresh();
}
let frState={date:'',turnos:[],sectors:[],q:'',emp:'',liq:'',sel:[],modo:'',dia:''};
/* ================================================================
   FRANCOS · CRUCE PLAN x FICHADAS
   ================================================================ */
const MOV_MK=/(?:^|\s)[ECSecs]\s+\+?\d{1,2}:\d{2}/;
function movClase(mov,vac){
  const s=String(mov==null?'':mov).replace(/ /g,' ');
  if(MOV_MK.test(s)) return 'T';
  if(/enfermedad/i.test(s)) return 'ENF';
  if(/\bART\b/.test(s)) return 'ART';
  if(/vacaci/i.test(s)||(+vac>0)) return 'VAC';
  if(/ausencia/i.test(s)) return 'AUS';
  if(/licencia/i.test(s)) return 'LIC';
  return s.trim()?'OTRO':'';
}
function esMovimientos(rows){
  for(let i=0;i<Math.min(rows.length,15);i++){ const h=(rows[i]||[]).map(c=>String(c==null?'':c).trim());
    if(h.some(x=>/^movimientos$/i.test(x))&&h.some(x=>/c[oó]digo de empleado/i.test(x))&&h.some(x=>/^fecha$/i.test(x))) return i; }
  return -1;
}
function parseMovimientos(rows,hi){
  const h=rows[hi].map(c=>String(c==null?'':c).trim()), ix=re=>h.findIndex(x=>re.test(x));
  const cl=ix(/c[oó]digo de empleado/i), cn=ix(/apellido|nombre/i), ce=ix(/c[oó]digo de empresa/i), cf=ix(/^fecha$/i), cm=ix(/^movimientos$/i), cv=ix(/vacaciones/i);
  const emps={}; let d0='', d1='';
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r||r[cl]==null) continue;
    const leg=String(r[cl]).trim().replace(/\.0+$/,''), f=excelDateToISO(r[cf]); if(!leg||!f) continue;
    const e=emps[leg]||(emps[leg]={n:String(r[cn]||'').trim(),c:String(r[ce]||'').trim(),d:{},o:{}});
    const k=movClase(r[cm],cv>=0?r[cv]:0); e.d[f]=k||'';
    if(k&&k!=='T') e.o[f]=String(r[cm]).replace(/ /g,' ').replace(/^\s*\.+\d*\s*/,'').trim().slice(0,60);
    if(!d0||f<d0) d0=f; if(!d1||f>d1) d1=f; }
  return {emps,d0,d1};
}
// suma las fichadas de un export de Movimientos a las que ya había: los días que trae el export se reemplazan,
// los demás quedan (nunca se pierden días anteriores). No toca los francos asignados por los coordinadores.
function frMovMerge(M,fname,extra){
  const desde=addD(hoy(),-100), cur=DB.francos&&DB.francos.mov, md0=M.d0<desde?desde:M.d0;
  if(!(M.d1>=md0)) return null;
  const emp=JSON.parse(JSON.stringify((cur&&cur.emps)||{}));
  Object.values(emp).forEach(e=>{ e.o=e.o||{}; Object.keys(e.d).forEach(d=>{ if(d<desde){ delete e.d[d]; delete e.o[d]; } }); });
  Object.entries(M.emps).forEach(([leg,v])=>{ const x=emp[leg]||(emp[leg]={n:v.n,c:v.c,d:{},o:{}}); x.n=v.n||x.n; x.c=v.c||x.c; x.o=x.o||{};
    Object.keys(x.d).forEach(d=>{ if(d>=md0&&d<=M.d1){ delete x.d[d]; delete x.o[d]; } });
    Object.entries(v.d).forEach(([d,k])=>{ if(d>=md0){ x.d[d]=k; if(v.o&&v.o[d]) x.o[d]=v.o[d]; } }); });
  // los días que falten se completan con el historial de fichadas ya cargado en Llegadas tarde / Ausentismo
  // (así los coordinadores ven siempre los días anteriores, aunque el export nuevo traiga solo los últimos días)
  let d0=cur&&cur.d0&&cur.d0>=desde&&cur.d0<md0?cur.d0:md0;
  try{ Object.values(DB.records||{}).forEach(r=>{ if(!r||!r.fecha||r.fecha<desde||r.fecha>M.d1) return; const leg=String(r.legajo).trim().replace(/\.0+$/,'');
      const x=emp[leg]||(emp[leg]={n:r.nombre||'',c:r.empresa||'',d:{},o:{}}); x.o=x.o||{}; if(x.d[r.fecha]!==undefined) return;
      const ev=[].concat(r.eventos||[]).map(e=>typeof e==='string'?e:(e&&(e.txt||e.t||e.desc||e.nombre))||'').join(' ');
      const k=(r.marcas||[]).length?'T':movClase(ev,0); x.d[r.fecha]=k||''; if(k&&k!=='T') x.o[r.fecha]=ev.trim().slice(0,60);
      if(r.fecha<d0) d0=r.fecha; }); }catch(e){ console.warn('francos historial',e); }
  for(const e of Object.values(emp)) for(const f in (e.d||{})) if(f<d0) d0=f;   // inicio = primer día con datos
  DB.francos=DB.francos||{emps:{},files:[]};
  DB.francos.mov=Object.assign({at:new Date().toISOString(),file:fname,por:window.SRV&&SRV.user?SRV.user.nombre:'',
    d0, d1:cur&&cur.d1>M.d1?cur.d1:M.d1, emps:emp},extra||{});
  return {d0:md0,d1:M.d1};
}
async function loadMovFrancos(rows,hi,name){
  const M=parseMovimientos(rows,hi); if(!Object.keys(M.emps).length) throw new Error('El export de Movimientos no trae filas.');
  frMovMerge(M,name); await persist(); return Object.keys(M.emps).length;
}
const CX_DEF={obj:20,art:true};
// apto frío (eventuales con certificado para trabajar en cámara): ❄ junto al nombre en Nómina y Francos
function esFrio(leg){ return !!((DB.aptoFrio||{})[String(leg==null?'':leg).trim().replace(/\.0+$/,'')]); }
function FRIO(leg){ return esFrio(leg)?' <span class="frio" title="Apto frío">❄</span>':''; }
window.esFrio=esFrio; window.FRIO=FRIO;   // también para la sección Eventuales
const cxCfg=()=>Object.assign({},CX_DEF,(DB.francos&&DB.francos.cxCfg)||{});
const cxFer=iso=>{ const f=ferEn(iso); return f&&!/no laborable|puente/i.test(f.t||'')?f:null; };
function cxPeriodo(){ if(!frState.liq) frState.liq=liqDe(hoy()); return liqPer(frState.liq); }
// fichadas para Francos: export de Movimientos (si cubre el día) + reportes diarios del reloj (Llegadas tarde)
// d[fecha]: 'T' trabajó · 'ENF','ART','VAC','AUS','LIC','OTRO' novedad · '' no vino (= franco) · '?' turno no exportado (sin dato)
function frFichadas(P){
  const F=DB.francos, mov=F&&F.mov&&F.mov.d1>=P.d0&&F.mov.d0<=P.d1?F.mov:null, emps={}, cov=new Set();
  const E=leg=>emps[leg]||(emps[leg]={n:'',c:'',d:{},o:{}});
  // el inicio real es el primer día con datos (d0 puede haber quedado mal guardado)
  let m0=mov?mov.d0:''; if(mov) for(const e of Object.values(mov.emps||{})) for(const f in (e.d||{})) if(f<m0&&f>=P.d0) m0=f;
  if(mov){ for(let d=m0<P.d0?P.d0:m0; d<=mov.d1&&d<=P.d1; d=addD(d,1)) cov.add(d);
    Object.entries(mov.emps).forEach(([leg,v])=>{ const x=E(leg); x.n=v.n; x.c=v.c; Object.entries(v.d).forEach(([d,k])=>{ if(d>=P.d0&&d<=P.d1){ x.d[d]=k; if(v.o&&v.o[d]) x.o[d]=v.o[d]; } }); }); }
  // reportes diarios del reloj: completan los días que el export de Movimientos no trae
  const R=Object.values(DB.records||{}).filter(r=>r.fecha>=P.d0&&r.fecha<=P.d1&&!cov.has(r.fecha));
  const diasRec=new Set(R.map(r=>r.fecha));
  for(const r of R){ const leg=String(r.legajo||'').trim().replace(/\.0+$/,''); if(!leg) continue; const x=E(leg);
    if(!x.n) x.n=r.nombre||''; if(!x.c) x.c=r.empresa||'';
    const marcas=(r.marcas||[]).length||r.entrada!=null||(r.eventos||[]).some(t=>MOV_MK.test(' '+String(t)));
    const nov=(r.eventos||[]).filter(t=>!MOV_MK.test(' '+String(t))).join(' · ');
    const k=marcas?'T':nov?(movClase(nov)||'OTRO'):r.status==='no_cubierto'?'?':'';
    if(x.d[r.fecha]!=='T') x.d[r.fecha]=k; if(nov&&k!=='T') x.o[r.fecha]=nov.slice(0,60); }
  diasRec.forEach(d=>cov.add(d));
  if(!cov.size) return null;
  const dias=[...cov].sort();
  return {emps,cov,d0:dias[0],d1:dias[dias.length-1],src:[mov?`export de Movimientos (${dmy(mov.d0).slice(0,5)} al ${dmy(mov.d1).slice(0,5)})`:'',diasRec.size?`reporte diario del reloj (${diasRec.size} día(s))`:''].filter(Boolean).join(' + ')};
}
function frCruce(){
  const F=DB.francos, P=cxPeriodo(), E=FRE(); if(!P||!E.length) return null;
  const M=frFichadas(P);   // solo fichadas del período de liquidación
  const cfg=cxCfg(), corte=M?M.d1:'', out=[], dias=[];
  for(let d=P.d0; d<=P.d1; d=addD(d,1)) dias.push(d);
  for(const e of E){
    // con la lista de eventuales cargada, solo aparecen los ACTIVOS; sin lista, los del plan
    if(ANTOF.size){ if(!ANTOF.has(e.legajo)) continue; } else if(!dias.some(d=>e.d[d]!=null)) continue;
    const mv=M?M.emps[e.legajo]||null:null, g={T:0,DT:0,FT:0,ENF:0,ART:0,AUS:0,VAC:0,LIC:0,OTRO:0,F:0,DOM:0,FER:0,P:0,PF:0,'-':0}, cal={};
    for(const d of dias){
      const dom=dObj(d).getDay()===0, fer=cxFer(d); let c;
      if(e.d[d]==='B'||(e.ingreso&&d<e.ingreso)||(e.egreso&&d>e.egreso)) c='-';
      else{
        const st=mv&&mv.d[d]!=null?mv.d[d]:'';
        // días con fichadas (export o reporte diario); el último puede estar incompleto y un turno no exportado no es dato
        if(M&&M.cov.has(d)&&st!=='?'&&(d<corte||(d===corte&&st))){
          if(st==='T') c=dom?'DT':fer?'FT':'T';
          else if(st==='AUS') c=dom?'DOM':fer?'FER':'F';            // eventual ausente (con o sin aviso) = franco tomado
          else if(st) c=st;
          else c=dom?'DOM':fer?'FER':'F';                         // sin fichada = no vino = franco
        } else c=dom?'DOM':fer?'FER':(e.d[d]==='F'?'PF':'P');
      }
      cal[d]=c; g[c]++;
    }
    const comp=g.T+g.ENF+(cfg.art?g.ART:0), proy=comp+g.P;   // domingos y feriados (aun trabajados) no suman para el tope
    out.push({e,mv:!M||!!mv,g,cal,comp,proy,pend:Math.max(0,proy-cfg.obj),falt:Math.max(0,cfg.obj-proy),sup:comp>cfg.obj,
      ftom:g.F+g.PF, feriados:dias.filter(d=>cxFer(d)&&cal[d]!=='-').length});
  }
  const enPl=new Set(FRE().map(e=>e.legajo));
  const sinPl=M?Object.entries(M.emps).filter(([k,v])=>!enPl.has(k)&&/jornaliz/i.test(v.c)&&dias.some(d=>v.d[d]==='T')).map(([k,v])=>({legajo:k,nombre:v.n})):[];
  return {P,corte,M,dias,cfg,rows:out,sinPl,by:Object.fromEntries(out.map(r=>[r.e.legajo||r.e.nombre,r]))};
}
const CX_LAB={T:'Trabajó',DT:'Domingo trabajado (no suma al tope)',FT:'Feriado trabajado (no suma al tope)',ENF:'Enfermedad (computa)',ART:'Licencia ART',AUS:'Ausencia',VAC:'Vacaciones',LIC:'Licencia',OTRO:'Otra novedad',F:'Franco tomado (no fichó)',DOM:'Domingo',FER:'Feriado',P:'Día de trabajo',PF:'Franco asignado','-':'Fuera de contrato'};
const CX_TXT={T:'✓',DT:'D',FT:'Fe',ENF:'E',ART:'A',AUS:'X',VAC:'V',LIC:'L',OTRO:'N',F:'F',DOM:'·',FER:'Fe',P:'·',PF:'F','-':'–'};
const CX_BG={T:'#dcfce7',DT:'#22c55e',FT:'#22c55e',ENF:'#ede9fe',ART:'#ede9fe',AUS:'#fee2e2',VAC:'#e0f2fe',LIC:'#ede9fe',OTRO:'#f1f5f9',F:'#cffafe',DOM:'#e0e7ff',FER:'#fde68a',P:'#fff',PF:'#ecfeff','-':'#fff'};
const cxKey=e=>e.legajo||e.nombre;
const cxFr=c=>c==='F'||c==='PF'||c==='DOM';   // de franco ese día (real o planificado)
const cxTag=(r,cfg)=>r.sup?`<span class="cx-big s" title="Ya tiene ${r.comp} jornadas computables">superó</span>`:r.pend>0?`<span class="cx-big p">${r.pend}</span>`:`<span class="cx-big z">0</span>`;
// si las fichadas de Francos (las que ven los coordinadores) tienen menos días que el historial guardado,
// quien puede editar Francos y tiene el historial las completa solo, una vez por sesión, sin subir nada
let frBackfillHecho=false;
async function frBackfill(){
  if(frBackfillHecho) return; frBackfillHecho=true;
  try{ const m=DB.francos&&DB.francos.mov, R=DB.records; if(!m||!R||!canEditMod('francos')) return;
    const desde=addD(hoy(),-100), add={}; let n=0;
    for(const k in R){ const r=R[k]; if(!r||!r.fecha||r.fecha<desde||r.fecha>m.d1) continue; const leg=String(r.legajo).trim().replace(/\.0+$/,'');
      const x=m.emps[leg]; if(x&&x.d&&x.d[r.fecha]!==undefined) continue;
      const ev=[].concat(r.eventos||[]).map(e=>typeof e==='string'?e:'').join(' '), kk=(r.marcas||[]).length?'T':movClase(ev,0);
      const a=add[leg]||(add[leg]={n:r.nombre||'',c:r.empresa||'',d:{},o:{}}); a.d[r.fecha]=kk||''; if(kk&&kk!=='T') a.o[r.fecha]=ev.trim().slice(0,60); n++; }
    if(!n) return;
    if(!(window.SRV&&SRV.mode==='online')){ frMovMerge({emps:{},d0:m.d1,d1:m.d1},m.file||'historial',{at:m.at,por:m.por,file:m.file}); await persist(); renderFrancos(); return; }
    // se manda al servidor solo lo que falta: se aplica sobre la última versión (no choca con los francos que cargan los coordinadores)
    const r=await fetch('/api/francos/fichadas',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({emps:add})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){ console.warn('francos historial',j); return; }
    Object.entries(add).forEach(([leg,v])=>{ const x=m.emps[leg]||(m.emps[leg]={n:v.n,c:v.c,d:{},o:{}}); x.o=x.o||{}; Object.entries(v.d).forEach(([f,k])=>{ if(x.d[f]===undefined){ x.d[f]=k; if(v.o[f]) x.o[f]=v.o[f]; } }); });
    m.d0=j.d0||m.d0; if(window.SRV&&SRV.setVer) SRV.setVer('francos',j.version);
    App.toast(`Fichadas de Francos completadas con el historial desde ${dmy(m.d0)}: los coordinadores ya ven los días anteriores`); renderFrancos();
  }catch(e){ console.warn('francos historial',e); } }
function renderFrancos(){
  setTimeout(frBackfill,1500);
  if(!$('#v-francos')) return;
  renderUpd();
  const F=DB.francos, E=FRE(), C=frCruce(), cfg=cxCfg();
  // última actualización de las fichadas que usa Francos
  { const el=$('#fr-upd'), mv=F&&F.mov, fs=(DB.files||[]).filter(x=>x&&x.at).sort((a,b)=>String(a.at).localeCompare(String(b.at))), uf=fs[fs.length-1];
    const recMax=Object.values(DB.records||{}).reduce((a,r)=>r.fecha>a?r.fecha:a,'');
    if(el){ const vieja=C&&C.M&&C.M.d1<addD(hoy(),-2);
      el.className='fr-upd'+(!C||!C.M||vieja?' w':'');
      el.innerHTML=`<span class="dot"></span><div>${C&&C.M?`<b>Fichadas cruzadas hasta el ${DOWL[dObj(C.M.d1).getDay()]} ${dmy(C.M.d1)}</b>`:'<b>Sin fichadas del período</b>: los francos se calculan solo con el plan'}`+
        (mv?`<br>Export de Movimientos: <b>${fmtAt(mv.at)}</b>${mv.por?' · '+esc(mv.por):''} · ${esc(mv.file||'')}${mv.desdeAus?' (carga única de fichadas)':''} · fichadas hasta el ${dmy(mv.d1)}`:'')+
        (recMax?`<br>Reporte diario del reloj (Llegadas tarde): último día ${dmy(recMax)}${uf?` · cargado ${fmtAt(uf.at)}`:''}`:'')+
        (vieja?`<br>⚠ Faltan fichadas desde el ${dmy(addD(C.M.d1,1))}: subí el export de Movimientos en la carga única (Llegadas tarde o Ausentismo).`:'')+'</div>'; } }
  // pasos de carga
  const P=cxPeriodo(), M=F&&F.mov;
  { const H=hoy(), n=frDeFranco(H).length, nf=(frState.sectors.length||frState.turnos.length)?frDeFranco(H).filter(frFlt).length:null;
    $('#fr-hoy').innerHTML=`<span class="fr-hoy-i">🏖</span><div><b>Hoy ${dm(H)} hay ${n} colaborador${n===1?'':'es'} con franco asignado</b>${nf!=null?`<span>${nf} en el sector y turno elegidos</span>`:''}</div><button class="btn ghost sm" data-frmodo="lista" data-frhoy="1">Ver quiénes</button>`; }
  if(!frState.modo) frState.modo=frCanEdit()?'plan':'lista';
  document.querySelectorAll('#fr-modo [data-frmodo]').forEach(b=>b.classList.toggle('on',b.dataset.frmodo===frState.modo));
  { const lista=frState.modo==='lista'; $('#fr-gridw').hidden=lista; $('#fr-cx-ley').hidden=lista; $('#fr-n').hidden=lista; $('#fr-dia').hidden=!lista; if(lista) renderFrDia(); }
  { const cur=liqDe(hoy()), rows=C?C.rows:[], asig=rows.reduce((a,r)=>a+frAsig(r.e,C.dias),0), sin=rows.filter(r=>!frAsig(r.e,C.dias)).length,
      falta=hoy()>=P.d0&&hoy()<=P.d1?Math.round((dObj(P.d1)-dObj(hoy()))/864e5):null;
    const nA=rows.length, nF=rows.filter(r=>esFrio(r.e.legajo)).length, pe=rows.filter(r=>r.pend>0), fa=pe.reduce((a,r)=>a+r.pend,0);
    $('#fr-liq').innerHTML=`<div class="fr-hp"><button class="fr-arr" data-liq="-1" title="Período anterior">‹</button>
      <div class="fr-hn"><span>Liquidación</span><b>${liqNom(P.ym)}</b><em>${dmy(P.d0)} al ${dmy(P.d1)}${P.ym===cur?' · en curso':''}</em></div>
      <button class="fr-arr" data-liq="1" title="Período siguiente">›</button>${P.ym!==cur?'<button class="btn ghost sm" data-liq="0">Volver al actual</button>':''}</div>
      <div class="fr-hs"><div><b>${nA}</b><span>eventuales activos</span></div><div class="frio-k"><b>❄ ${nF}</b><span>con apto frío</span></div><div><b>${asig}</b><span>francos asignados</span></div><div class="${fa?'w':''}" title="Para que nadie pase de ${cfg.obj} jornadas en el período (domingos y feriados no suman${C&&C.M?'':'; sin fichadas, se supone que trabajan todo el período'})"><b>${fa}</b><span>faltan asignar${pe.length?` · ${pe.length} pers.`:''}</span></div><div class="${sin?'w':''}"><b>${sin}</b><span>sin francos</span></div><div><b>${falta==null?(hoy()>P.d1?'—':'·'):falta}</b><span>${falta==null?(hoy()>P.d1?'período cerrado':'no empezó'):'días al cierre'}</span></div></div>`; }
  const nAnt=[...ANTOF.values()].filter(a=>a.activo).length, nBaja=ANTOF.size-nAnt, nPl=F?Object.keys(F.emps||{}).length:0;
  $('#fr-drop').classList.toggle('ok',!!E.length); $('#fr-mdrop').classList.toggle('ok',!!(C&&C.M));
  const LA=F&&F.asig&&F.asig[F.asig.length-1];
  $('#fr-st-plan').innerHTML=(nAnt?`<b>${nAnt} eventuales activos</b> de la lista de eventuales`:nPl?`<b>${nPl} empleados</b> en el plan`:'Sin empleados: cargá la lista de eventuales (sección Eventuales) o un plan')+
    (F&&(F.files||[]).length?`<br>${esc((F.files||[]).slice(-1)[0]||'')} · ${fmtAt(F.at)}`:'')+(LA?`<br>Última asignación cargada: <b>${esc(LA.file)}</b> · ${fmtAt(LA.at)} · ${LA.fr} franco(s)${LA.falt?` · <span class="w">${LA.falt} sin completar</span>`:''}`:'');
  $('#fr-st-mov').innerHTML=C&&C.M?`<b>Fichadas del ${dmy(C.M.d0)} al ${dmy(C.M.d1)}</b><br>${esc(C.M.src)}${C.M.d1<addD(hoy(),-2)?`<br><span class="w">⚠ Faltan fichadas desde el ${dmy(addD(C.M.d1,1))}: cargá el reporte diario del reloj en Llegadas tarde o un export de Movimientos más nuevo</span>`:''}${(()=>{ const g=[]; for(let d=C.M.d0; d<=C.M.d1; d=addD(d,1)) if(!C.M.cov.has(d)) g.push(dmy(d).slice(0,5)); return g.length?`<br><span class="w">⚠ Días sin fichadas (se usa el plan): ${g.join(', ')}</span>`:''; })()}`
    :M?`<b>Export del ${dmy(M.d0)} al ${dmy(M.d1)}</b><br><span class="w">⚠ No corresponde al período</span>`:'Sin fichadas del período: se usa solo el plan. Se toman solas del reporte diario del reloj (Llegadas tarde) o de un export de Movimientos.';
  $('#fr-cx-obj').value=cfg.obj; $('#fr-cx-art').checked=!!cfg.art;
  renderMsel('#fr-mt','turnos','Turno',E.map(e=>turKey(e.turno)));
  { const base=C?C.rows.map(r=>r.e):E, chip=(key,vals,el)=>{ const cnt={}; vals.forEach(k=>cnt[k]=(cnt[k]||0)+1); const ks=Object.keys(cnt).sort((x,y)=>x.localeCompare(y,'es')), on=frState[key];
      $(el).innerHTML=`<button type="button" class="fr-ch${on.length?'':' on'}" data-chall="${key}">Todos</button>`+ks.map(k=>`<button type="button" class="fr-ch${on.includes(k)?' on':''}" data-ch="${key}" data-chv="${esc(k)}">${esc(k)} <i>${cnt[k]}</i></button>`).join(''); };
    chip('sectors',base.map(e=>secKey(e.sector)),'#fr-ch-s'); chip('turnos',base.map(e=>turKey(e.turno)),'#fr-ch-t'); }
  renderMsel('#fr-ms','sectors','Sector',E.map(e=>secKey(e.sector)));
  $('#fr-cx-f').value=cxState.f;
  { const el=$('#fr-sel-n'); if(el) el.innerHTML=frState.sel.length?`<b>${frState.sel.length}</b> elegido(s) · las planillas salen solo con ellos <button type="button" class="btn ghost sm" id="fr-sel-x">Limpiar</button>`:'Elegí eventuales con las casillas, o filtrá por sector: la planilla sale con ellos'; }
  const q=frState.q.trim().toLowerCase();
  const flt=frFlt;
  // KPIs
  if(C){ const act=C.rows.filter(r=>!(r.e.egreso&&r.e.egreso<hoy())), pend=act.filter(r=>r.pend>0), sup=act.filter(r=>r.sup), falt=act.filter(r=>r.falt>0), sinmv=C.rows.filter(r=>!r.mv);
    $('#fr-cx-kpis').innerHTML=[
      {l:'Francos que faltan asignar',v:pend.reduce((a,r)=>a+r.pend,0),s:`entre ${pend.length} empleado(s)`,c:'acc-ochre'},
      {l:'Empleados al día',v:act.length-pend.length-sup.length,s:`de ${act.length} activos`,c:''},
      {l:`Superaron ${cfg.obj} jornadas`,v:sup.length,s:sup.length?'ya no alcanza con francos':'ninguno',c:sup.length?'acc-alert':''},
      {l:`No llegan a ${cfg.obj}`,v:falt.length,s:'ingreso reciente, egreso o ausencias'},
      {l:'Sin cruzar',v:C.M?sinmv.length+C.sinPl.length:'—',s:C.M?`${sinmv.length} sin fichadas · ${C.sinPl.length} fichan y no están en el plan`:'faltan los movimientos',c:C.M&&(sinmv.length+C.sinPl.length)?'acc-alert':''}
    ].map(k=>`<div class="kpi ${k.c||''}"><div class="lab">${esc(k.l)}</div><div class="val">${esc(k.v)}</div><div class="sub">${esc(k.s)}</div></div>`).join('');
    const ferL=C.dias.filter(cxFer);
    $('#fr-cx-m').textContent=`${C.M?'Fichadas hasta '+dmy(C.corte)+' · después, el plan':'Solo plan (sin movimientos)'}${ferL.length?' · feriados: '+ferL.map(d=>dm(d)).join(', '):''} · clic en un empleado para ver su detalle`;
  } else { $('#fr-cx-kpis').innerHTML=''; $('#fr-cx-m').textContent=''; }
  // tabla por empleado
  let R=C?C.rows.filter(r=>flt(r.e)):[];
  if(cxState.f==='pend') R=R.filter(r=>r.pend>0||r.sup); else if(cxState.f==='falt') R=R.filter(r=>r.falt>0); else if(cxState.f==='sup') R=R.filter(r=>r.sup); else if(cxState.f==='sinmv') R=R.filter(r=>!r.mv);
  R.sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es'));
  const th=(t,ti,al)=>`<th style="text-align:${al||'center'}"${ti?` title="${esc(ti)}"`:''}>${t}</th>`;
  $('#fr-cx').innerHTML=!C?`<tbody><tr><td><div class="empty">Cargá el plan de francos (paso 1) y los movimientos del reloj (paso 2).</div></td></tr></tbody>`:
    `<thead><tr><th class="fr-ck"><input type="checkbox" id="fr-sel-all" title="Elegir todos los del filtro"${R.length&&R.every(r=>frState.sel.includes(cxKey(r.e)))?' checked':''}></th><th>Legajo</th><th>Empleado</th><th>Turno / sector</th>${th('Fichadas','Días con fichada en el reloj (incluye domingos y feriados trabajados)')}${th('Francos<br>restantes','Francos que le faltan tomar para no pasar de '+cfg.obj+' jornadas')}${th('Jornadas<br>a la fecha','Fichadas + enfermedad'+(cfg.art?' + ART':''))}${th('Le quedan<br>planificadas','Jornadas del plan después del corte (sin domingos ni feriados)')}${th('Total al<br>cierre','Jornadas a la fecha + planificadas')}${th('Francos<br>tomados','Días sin fichada (+ francos ya planificados), sin contar domingos')}<th>Novedades</th></tr></thead><tbody>`+
    (R.length?R.map(r=>{ const g=r.g, nov=[g.DT?g.DT+' dom. trab.':'',g.FT?g.FT+' fer. trab.':'',g.ENF?g.ENF+' enferm.':'',g.ART?g.ART+' ART':'',g.AUS?g.AUS+' ausencia':'',g.VAC?g.VAC+' vac.':'',g.LIC+g.OTRO?(g.LIC+g.OTRO)+' otras':'',r.mv?'':'sin fichadas',r.falt?`no llega a ${cfg.obj} (faltan ${r.falt})`:''].filter(Boolean).join(' · ');
      return `<tr data-cxe="${esc(cxKey(r.e))}" class="${frState.emp===cxKey(r.e)?'sel':''}"><td class="fr-ck"><input type="checkbox" data-frsel="${esc(cxKey(r.e))}"${frState.sel.includes(cxKey(r.e))?' checked':''}></td><td class="mono">${esc(r.e.legajo)}</td><td><b>${esc(r.e.nombre)}</b>${FRIO(r.e.legajo)}</td>
      <td style="font-size:12.5px">${esc(r.e.turno||'')}<div style="color:var(--text3);font-size:11.5px">${esc(r.e.sector||'')}</div></td>
      <td class="mono" style="text-align:center;font-weight:600">${g.T+g.DT+g.FT}</td><td style="text-align:center">${cxTag(r,cfg)}</td><td class="mono" style="text-align:center">${r.comp}</td><td class="mono" style="text-align:center">${g.P}</td>
      <td class="mono" style="text-align:center;font-weight:600;color:${r.proy>cfg.obj?'#fcd34d':'var(--text)'}">${r.proy}</td><td class="mono" style="text-align:center">${r.ftom}</td>
      <td style="font-size:12px;color:var(--text2);white-space:normal;max-width:300px">${esc(nov)}</td></tr>`; }).join('')
      :`<tr><td colspan="11"><div class="empty">Nadie en este filtro.</div></td></tr>`)+
    (C.sinPl.length&&['all','sinmv'].includes(cxState.f)?`<tr><td colspan="11" style="font-size:12.5px;color:var(--text2);white-space:normal"><b>Fichan como eventuales pero no están en la lista de eventuales ni en el plan:</b> ${C.sinPl.map(x=>esc(x.legajo+' '+x.nombre)).join(' · ')}</td></tr>`:'')+'</tbody>';
  renderFrEmp(C); renderFrLog();
  // calendario día por día
  const ds=C?C.dias:frDates();
  if(!frState.date||(!ds.includes(frState.date)&&ds.length)) frState.date=ds.includes(hoy())?hoy():(ds.find(d=>d>=hoy())||ds[ds.length-1]||hoy());
  const D=frState.date; $('#fr-date').value=D;
  const code=(e,d)=>C&&C.by[cxKey(e)]?C.by[cxKey(e)].cal[d]:(e.d[d]==='B'?'-':e.d[d]==null?'':dObj(d).getDay()===0?'DOM':e.d[d]==='F'?'PF':'P');
  const EF=(C?C.rows.map(r=>r.e):E.filter(e=>ds.some(d=>e.d[d]!=null))).filter(flt).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  const ED=frCanEdit();
  $('#fr-grid').innerHTML=EF.length?`<thead><tr><th class="frn">Empleado</th>${ds.map(d=>{ const w=dObj(d).getDay();
      return `<th class="frd${d===D?' sel':''}${w===6?' we':''}${w===0?' do':''}${cxFer(d)?' fe':''}${C&&d===C.corte?' corte':''}" data-frd="${d}" title="${esc(lblDay(d)+(cxFer(d)?' · '+cxFer(d).n:'')+(C&&d===C.corte?' · último día con fichadas':''))}">${DOW[w].slice(0,2)}<br>${dObj(d).getDate()}</th>`; }).join('')}${C?`<th class="frt" title="Francos que faltan asignar para no pasar de ${cfg.obj} jornadas (${C.M?'fichadas y, después, el plan':'suponiendo que trabaja todo el período'}; domingos y feriados no suman)">Faltan</th>`:''}</tr></thead><tbody>`+
    EF.map(e=>{ const r=C&&C.by[cxKey(e)];
      return `<tr><td class="frn" data-cxe="${esc(cxKey(e))}"><b>${esc(e.nombre)}${FRIO(e.legajo)}</b><span>${esc([e.legajo,e.turno,e.sector].filter(Boolean).join(' · '))}</span>${r&&r.pend>0?`<em class="fr-falt" title="Faltan asignar ${r.pend} franco(s) para no pasar de ${cfg.obj} jornadas">faltan asignar ${r.pend} franco${r.pend>1?'s':''}</em>`:''}</td>${ds.map(d=>{ const c=code(e,d);
        const nov=C&&C.M&&C.M.emps[e.legajo]&&C.M.emps[e.legajo].o[d];
        const ed=ED&&(c==='P'||c==='PF'), mt=c==='PF'?frMeta(e,d):null;
        return `<td class="frc c${c==='-'?'b':c}${dObj(d).getDay()===0?' kdo':''}${cxFer(d)?' kfe':''}${d===D?' sel':''}${C&&d===C.corte?' corte':''}${ed?' ed':''}${mt&&mt.v==='F'?' fa':''}"${ed?` data-fe="${esc(cxKey(e))}|${d}"`:''} data-frtip="${esc(dmy(d)+' · '+(CX_LAB[c]||'sin dato')+(nov?' · '+nov:'')+(c==='PF'?(mt&&mt.v==='F'?'\nCargado por '+mt.by+' · '+fmtAt(mt.at):'\nDel plan de francos'):'')+(ed?'\nClic para asignar o quitar':''))}">${c?CX_TXT[c]:''}</td>`; }).join('')}${C?`<td class="frt" title="${r?esc(`${r.comp} jornadas ya trabajadas + ${r.g.P} días de trabajo por delante = ${r.proy} (tope ${cfg.obj}). Domingos y feriados no suman. Francos ya asignados: ${r.g.PF}`):''}">${r?cxTag(r,cfg):''}</td>`:''}</tr>`; }).join('')+'</tbody>'
    :`<tbody><tr><td><div class="empty">${E.length?'Nadie con ese filtro.':'No hay eventuales: cargá la lista en la sección Eventuales.'}</div></td></tr></tbody>`;
  $('#fr-n').innerHTML=EF.length?`${ED?'<b>Tocá un día</b> para asignar o quitar el franco. ':'Solo lectura: no tenés permiso para asignar francos. '}${EF.length} eventual(es) en pantalla${C&&C.M?` · hasta el ${dm(C.corte)} se ven las fichadas del reloj`:''}`:'';
  $('#fr-cx-ley').innerHTML=(C&&C.M?['PF','P','T','F','DOM','FER','ENF','ART','AUS']:['PF','P','DOM','FER']).map(k=>`<span><i class="fr-lg c${k}">${CX_TXT[k]}</i>${esc(CX_LAB[k])}</span>`).join('');
  // francos por día + lista del día
  const cnt=ds.map(d=>EF.filter(e=>cxFr(code(e,d))).length);
  $('#fr-c-m').textContent=ds.length?`${dm(ds[0])} al ${dm(ds[ds.length-1])} · clic en una barra para ver el día`:'';
  vbars('#fr-c-days',ds.map((d,i)=>{ const fe=cxFer(d);
    return {l:dObj(d).getDate()===1||i===0?dm(d):String(dObj(d).getDate()),v:cnt[i],hl:d===D,c:d===D?COL.acc:(fe?COL.ok:COL.c3),attr:`data-frd="${d}" style="cursor:pointer"`,
      tip:`${lblDay(d)}${fe?' · feriado: '+fe.n:''}\n${cnt[i]} de franco`}; }),
    {labels:true,vfmt:v=>v,yfmt:v=>Math.round(v),lw:26,bw:22,empty:'Cargá el plan de francos.'});
  $('#fr-list-h').textContent=`De franco · ${DOWL[dObj(D).getDay()]} ${dmy(D)}`;
  const on=EF.filter(e=>cxFr(code(e,D))), byT={}; on.forEach(e=>{ const t=e.turno||'Sin turno'; (byT[t]||(byT[t]=[])).push(e); });
  $('#fr-list').innerHTML=on.length? Object.keys(byT).sort().map(t=>`<div class="fr-grp"><h5>${esc(t)} <span>${byT[t].length}</span></h5>`+
      byT[t].map(e=>`<div><span>${esc(e.nombre)}</span><em>${esc(e.legajo||'')} · ${esc(CX_LAB[code(e,D)])}</em></div>`).join('')+'</div>').join('')
    : `<div class="empty" style="padding:20px">${E.length?'Nadie de franco ese día.':'Cargá el plan de francos.'}</div>`;
}
let cxState={f:'all'};
function renderFrEmp(C){
  const card=$('#fr-emp-card'), r=C&&frState.emp&&C.by[frState.emp];
  if(!r){ card.hidden=true; return; } card.hidden=false;
  const e=r.e, g=r.g, cfg=C.cfg;
  $('#fr-emp-h').innerHTML=`${esc(e.nombre)}${FRIO(e.legajo)} <span style="font-weight:400;color:var(--text3);font-size:12.5px">· ${esc([e.legajo,e.turno,e.sector].filter(Boolean).join(' · '))}${e.ingreso?' · ingreso '+dmy(e.ingreso):''}${e.egreso?' · egreso '+dmy(e.egreso):''}</span>`;
  const first=C.dias[0], off=(dObj(first).getDay()+6)%7;
  const cells=Array(off).fill('<div class="d e"></div>').concat(C.dias.map(d=>{ const c=r.cal[d], nov=C.M&&C.M.emps[e.legajo]&&C.M.emps[e.legajo].o[d];
    return `<div class="d frc c${c==='-'?'b':c}" title="${esc(lblDay(d)+(nov?' · '+nov:''))}"><b>${dObj(d).getDate()}</b>${esc(CX_LAB[c])}${cxFer(d)?'<br><i style="font-size:10px">'+esc(cxFer(d).n.slice(0,40))+'</i>':''}</div>`; }));
  $('#fr-emp').innerHTML=`<div class="cx-emp"><div><div class="cx-nums">
      <div style="grid-column:1/-1;border-color:${r.sup?'rgba(239,68,68,.5)':r.pend?'rgba(245,158,11,.5)':'rgba(34,197,94,.4)'}"><span>Francos que le faltan tomar</span><b style="font-size:34px;color:${r.sup?'#fca5a5':r.pend?'#fcd34d':'#86efac'}">${r.sup?'Superó':r.pend}</b><div style="font-size:12px;color:var(--text2)">${r.sup?`Ya tiene ${r.comp} jornadas computables (objetivo ${cfg.obj})`:r.pend?`Para cerrar el período con ${cfg.obj} jornadas (hoy proyecta ${r.proy})`:r.falt?`No llega a ${cfg.obj}: proyecta ${r.proy}`:`Cierra con ${r.proy} jornadas`}</div></div>
      <div><span>Jornadas a la fecha</span><b>${r.comp}</b></div><div><span>Le quedan planificadas</span><b>${g.P}</b></div>
      <div><span>Trabajadas</span><b>${g.T+g.DT+g.FT}</b></div><div><span>Francos tomados</span><b>${g.F}</b></div>
      <div><span>Enfermedad / ART</span><b>${g.ENF} / ${g.ART}</b></div><div><span>Feriados (aparte)</span><b>${r.feriados}</b></div>
    </div>${e.obs?`<p style="font-size:12.5px;color:var(--text2);max-width:300px">${esc(e.obs)}</p>`:''}</div>
    <div style="flex:1;min-width:320px"><div class="cx-cal fr-grid">${['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'].map(x=>`<div class="h">${x}</div>`).join('')}${cells.join('')}</div></div></div>`;
}
App.renderCruce=()=>renderFrancos();
function cxRows(C){ return C.rows.slice().sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es')); }
// sector normalizado: "Ambiente", "AMBIENTE " y "ambiente" son el mismo sector
const secKey=s=>normTxt(s)||'SIN SECTOR', turKey=s=>normTxt(s)||'SIN TURNO';
function renderMsel(sel,key,lab,vals){
  const box=$(sel); if(!box) return;
  const cnt={}; vals.forEach(k=>cnt[k]=(cnt[k]||0)+1);
  const ks=Object.keys(cnt).sort((a,b)=>a.localeCompare(b,'es'));
  frState[key]=frState[key].filter(k=>cnt[k]); const on=frState[key], open=box.classList.contains('open');
  box.innerHTML=`<button type="button" class="msel-b">${esc(lab)}: <b>${on.length?(on.length===1?esc(on[0]):on.length+' elegidos'):'Todos'}</b><span>▾</span></button>
    <div class="msel-p"><div class="msel-a"><button type="button" data-ms-all="${key}">Marcar todos</button><button type="button" data-ms-none="${key}">Limpiar</button></div>
    ${ks.map(k=>`<label><input type="checkbox" data-ms="${key}" value="${esc(k)}"${on.includes(k)?' checked':''}><span>${esc(k)}</span><b>${cnt[k]}</b></label>`).join('')}</div>`;
  box.classList.toggle('open',open); box.classList.toggle('act',!!on.length);
}
function cxCoord(){
  const C=frCruce(); if(!C){ App.toast('Cargá el plan de francos y los movimientos.',true); return; }
  const cfg=C.cfg, desde=[C.M?addD(C.corte,1):C.P.d0,hoy()].sort()[1];
  const fut=C.dias.filter(d=>d>=desde&&dObj(d).getDay()!==0);
  if(!fut.length){ App.toast('El período ya terminó: no quedan días para asignar francos.',true); return; }
  const base=cxBase(C,desde);
  const secs=uniq(base.map(r=>secKey(r.e.sector))).sort((a,b)=>a.localeCompare(b,'es'));
  const pages=secs.map(sk=>{ const R=base.filter(r=>secKey(r.e.sector)===sk).sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es'));
    const pend=R.filter(r=>r.pend>0||r.sup), ok=R.filter(r=>!(r.pend>0||r.sup));
    return {sk,R,pend,ok}; }).filter(p=>p.R.length);
  if(!pages.length){ App.toast('No hay empleados en esos sectores.',true); return; }
  const cel=(r,d)=>{ const c=r.cal[d];
    if(c==='-') return '<td class="x">–</td>'; if(c==='FER'||c==='FT') return '<td class="fe">Fe</td>'; if(c==='PF') return '<td class="pf">F</td>';
    if(c!=='P') return `<td class="nv">${esc(CX_TXT[c]||'')}</td>`; return '<td class="bx"></td>'; };
  const page=p=>`<section class="pg">
    <div class="hd"><div><h1>Francos a asignar · ${esc(p.sk)}</h1>
      <p>Período ${dmy(C.P.d0)} al ${dmy(C.P.d1)} · objetivo ${cfg.obj} jornadas · ${C.M?'fichadas hasta el '+dmy(C.corte):'según el plan'}${frState.turnos.length?' · turno '+esc(frState.turnos.join(', ')):''} · emitido ${dmy(hoy())}</p></div>
      <div class="tot"><b>${p.pend.reduce((a,r)=>a+r.pend,0)}</b><span>francos a asignar<br>${p.pend.length} de ${p.R.length} empleado(s)</span></div></div>
    <p class="ins">Marcá con <b>F</b> el día de franco de cada empleado, en los casilleros vacíos. Cada uno tiene que quedar con tantas <b>F</b> como indica la columna <b>A asignar</b>. Los casilleros grises no se usan (feriado o fuera de contrato); una <b>F</b> impresa ya es un franco planificado.</p>
    ${p.pend.length?`<table><thead><tr><th>Legajo</th><th class="l">Empleado</th><th class="l">Turno</th><th>Fichadas</th><th class="aa">A asignar</th>${fut.map(d=>`<th class="${cxFer(d)?'fe':''}">${DOW[dObj(d).getDay()].slice(0,2)}<br>${dObj(d).getDate()}/${dObj(d).getMonth()+1}</th>`).join('')}<th>Asignados</th></tr></thead><tbody>
    ${p.pend.map(r=>`<tr><td>${esc(r.e.legajo)}</td><td class="l">${esc(r.e.nombre)}${r.sup?'<div class="ob">Ya superó '+cfg.obj+' jornadas: avisar a RRHH</div>':r.e.egreso&&r.e.egreso<=C.P.d1?'<div class="ob">Egresa el '+dmy(r.e.egreso)+'</div>':''}</td><td class="l">${esc(r.e.turno||'')}</td><td>${r.g.T+r.g.DT+r.g.FT}</td><td class="aa">${r.sup?'!':r.pend}</td>${fut.map(d=>cel(r,d)).join('')}<td class="bx"></td></tr>`).join('')}
    </tbody></table>`:'<p class="nada">Nadie del sector tiene francos pendientes.</p>'}
    ${p.ok.length?`<p class="okl"><b>Al día (sin francos pendientes):</b> ${p.ok.map(r=>esc(r.e.nombre)).join(' · ')}</p>`:''}
    <div class="fir"><div>Coordinador/a</div><div>Firma</div><div>Fecha de entrega a RRHH</div></div>
  </section>`;
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Francos a asignar · ${esc(pages.map(p=>p.sk).join(', '))}</title><style>
  @page{size:A4 landscape;margin:9mm} *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;font-size:11.5px;background:#e2e8f0}
  .bar{position:sticky;top:0;background:#0f172a;color:#fff;padding:10px 18px;display:flex;gap:12px;align-items:center;z-index:2} .bar button{font:inherit;font-weight:700;padding:7px 16px;border:0;border-radius:6px;background:#22d3ee;color:#000;cursor:pointer}
  .pg{background:#fff;margin:16px auto;padding:16px 18px;max-width:1120px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
  .hd{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:8px}
  h1{font-size:19px;margin:0 0 3px} .hd p{margin:0;color:#475569} .tot{display:flex;gap:8px;align-items:center;border:2px solid #0f172a;border-radius:8px;padding:6px 12px} .tot b{font-size:26px} .tot span{font-size:11px;line-height:1.25;color:#334155}
  .ins{margin:0 0 8px;font-size:11px;color:#334155} table{border-collapse:collapse;width:100%} th,td{border:1px solid #64748b;padding:3px 4px;text-align:center} th{background:#f1f5f9;font-size:10px}
  td.l,th.l{text-align:left} td.l{font-size:11.5px} .aa{font-weight:700;font-size:15px;background:#fef3c7} th.aa{font-size:10px}
  td.bx{height:26px;min-width:30px} td.fe,th.fe{background:#cbd5e1;color:#475569} td.x{background:#e2e8f0;color:#94a3b8} td.pf{font-weight:700;background:#ecfeff} td.nv{color:#64748b;background:#f8fafc}
  .ob{font-size:10px;color:#b91c1c} .nada,.okl{margin:10px 0 0;font-size:11px;color:#334155}
  .fir{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:34px} .fir div{border-top:1px solid #0f172a;padding-top:4px;font-size:11px;color:#334155;text-align:center}
  tr{page-break-inside:avoid} @media print{body{background:#fff}.bar{display:none}.pg{margin:0;box-shadow:none;max-width:none;padding:0;page-break-after:always}.pg:last-child{page-break-after:auto}}</style></head><body>
  <div class="bar"><button onclick="window.print()">Imprimir</button><span>${pages.length} listado(s): ${esc(pages.map(p=>p.sk).join(' · '))} · cada sector sale en su hoja</span></div>
  ${pages.map(page).join('')}</body></html>`;
  const name=`francos_a_asignar_${pages.length===1?pages[0].sk.replace(/[^A-Z0-9]+/g,'_'):pages.length+'_sectores'}_${hoy()}.html`;
  let w=null; try{ const u=URL.createObjectURL(new Blob([html],{type:'text/html'})); w=window.open(u,'_blank'); }catch(e){}
  if(!w) download(html,name,'text/html;charset=utf-8');
  App.toast(`Listado para coordinador: ${pages.length} sector(es)`);
}

/* ---------- Asignación de francos por Excel (ida y vuelta con el coordinador) ---------- */
// a quién se le arma la planilla: los elegidos uno por uno (casillas de la tabla) o, si no hay, el filtro de turno/sector/búsqueda
function cxBase(C,desde){
  const q=frState.q.trim().toLowerCase(), sel=frState.sel;
  return C.rows.filter(r=>(sel.length?sel.includes(cxKey(r.e)):(!frState.turnos.length||frState.turnos.includes(turKey(r.e.turno)))&&(!frState.sectors.length||frState.sectors.includes(secKey(r.e.sector)))&&(!q||r.e.nombre.toLowerCase().includes(q)||String(r.e.legajo).includes(q)))&&!(r.e.egreso&&r.e.egreso<desde)); }
function cxCoordData(){
  const C=frCruce(); if(!C) return {err:'Cargá el plan de francos y los movimientos.'};
  const desde=[C.M?addD(C.corte,1):C.P.d0,hoy()].sort()[1];
  const fut=C.dias.filter(d=>d>=desde&&dObj(d).getDay()!==0);
  if(!fut.length) return {err:'El período ya terminó: no quedan días para asignar francos.'};
  const base=cxBase(C,desde);
  const secs=uniq(base.map(r=>secKey(r.e.sector))).sort((a,b)=>a.localeCompare(b,'es'));
  const pages=secs.map(sk=>{ const R=base.filter(r=>secKey(r.e.sector)===sk).sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es'));
    return {sk,R,pend:R.filter(r=>r.pend>0||r.sup),ok:R.filter(r=>!(r.pend>0||r.sup))}; }).filter(p=>p.R.length);
  if(!pages.length) return {err:frState.sel.length?'Los elegidos ya no tienen días para asignar en este período.':'No hay empleados en esos sectores.'};
  return {C,desde,fut,pages};
}
async function cxCoordExcel(soloPend){ soloPend=soloPend===true;
  if(typeof ExcelJS==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  const X=cxCoordData(); if(X.err){ App.toast(X.err,true); return; }
  // versión para el coordinador: solo quienes tienen francos por asignar, ordenados por turno y apellido
  if(soloPend){ X.pages=X.pages.map(p=>Object.assign({},p,{R:p.pend.slice().sort((a,b)=>turKey(a.e.turno).localeCompare(turKey(b.e.turno),'es')||a.e.nombre.localeCompare(b.e.nombre,'es'))})).filter(p=>p.R.length);
    if(!X.pages.length){ App.toast('Nadie tiene francos pendientes de asignar con este filtro.'); return; } }
  const {C,fut,pages}=X, cfg=C.cfg, wb=new ExcelJS.Workbook(); wb.creator='Panel RRHH I.Casanova';
  const thin={style:'thin',color:{argb:'FF94A3B8'}}, B={top:thin,left:thin,bottom:thin,right:thin};
  const fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
  const ctl=[]; const used=new Set();
  const FC=7;   // primera columna de días (G)
  for(const p of pages){
    let nm=p.sk.replace(/[\[\]:*?\/\\]/g,' ').slice(0,28).trim()||'SECTOR', k=nm, i=2; while(used.has(k)) k=nm.slice(0,26)+' '+(i++); used.add(k);
    const ws=wb.addWorksheet(k,{views:[{state:'frozen',xSplit:FC-1,ySplit:6}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9}});
    const last=FC+fut.length+1;   // columnas: días + Asignados + Faltan
    ws.columns=[{width:10},{width:34},{width:22},{width:13},{width:10},{width:10}].concat(fut.map(()=>({width:6.5}))).concat([{width:11},{width:10}]);
    ws.mergeCells(1,1,1,last); ws.getCell(1,1).value=`FRANCOS A ASIGNAR · ${p.sk}`; ws.getCell(1,1).font={bold:true,size:15};
    ws.mergeCells(2,1,2,last); ws.getCell(2,1).value=`Período ${dmy(C.P.d0)} al ${dmy(C.P.d1)} · objetivo ${cfg.obj} jornadas · ${C.M?'fichadas hasta el '+dmy(C.corte):'según el plan'} · emitido ${dmy(hoy())}`; ws.getCell(2,1).font={color:{argb:'FF475569'}};
    ws.mergeCells(3,1,3,last); ws.getCell(3,1).value='Escribí F en el día de franco de cada empleado (solo en los casilleros blancos). La columna FALTAN tiene que quedar en 0. Guardá el archivo y mandalo por correo a RRHH. No agregues ni borres filas o columnas.'; ws.getCell(3,1).font={bold:true,color:{argb:'FF0F172A'}}; ws.getCell(3,1).alignment={wrapText:true,vertical:'middle'}; ws.getRow(3).height=32; ws.getCell(3,1).fill=fill('FFFEF3C7');
    ws.mergeCells(4,1,4,last); ws.getCell(4,1).value='Coordinador/a: ______________________________     Fecha: ____/____/______'; ws.getCell(4,1).font={color:{argb:'FF334155'}};
    // fila 5 oculta con las fechas ISO (la usa el panel al volver a cargar)
    const r5=ws.getRow(5); r5.getCell(1).value='#FRANCOS'; r5.getCell(2).value=C.P.d0+'|'+C.P.d1; fut.forEach((d,j)=>r5.getCell(FC+j).value=d); r5.hidden=true;
    const h=ws.getRow(6); ['Legajo','Empleado','Sector','Turno','Jornadas','A asignar'].concat(fut.map(d=>`${DOW[dObj(d).getDay()].slice(0,2)} ${dObj(d).getDate()}/${dObj(d).getMonth()+1}`)).concat(['Asignados','Faltan']).forEach((t,j)=>{ const c=h.getCell(j+1); c.value=t; c.font={bold:true,size:9.5}; c.alignment={horizontal:'center',vertical:'middle',wrapText:true}; c.fill=fill(j===5?'FFFDE68A':cxFer(fut[j-FC+1])?'FFCBD5E1':'FFF1F5F9'); c.border=B; });
    h.height=30;
    const L=p.R;
    L.forEach((r,i)=>{ const row=ws.getRow(7+i), n=7+i;
      [r.e.legajo,r.e.nombre+(esFrio(r.e.legajo)?" ❄":""),secKey(r.e.sector),r.e.turno||'',r.comp,r.sup?0:r.pend].forEach((v,j)=>{ const c=row.getCell(j+1); c.value=j===0?String(v):v; c.border=B; c.alignment={horizontal:j>=1&&j<=3?'left':'center',vertical:'middle'}; if(j===5){ c.font={bold:true,size:12}; c.fill=fill('FFFEF3C7'); } });
      fut.forEach((d,j)=>{ const c=row.getCell(FC+j), st=r.cal[d]; c.border=B; c.alignment={horizontal:'center',vertical:'middle'};
        if(st==='-'||st==='FER'||st==='FT'){ c.value=st==='-'?'–':'Fe'; c.fill=fill('FFE2E8F0'); c.font={color:{argb:'FF64748B'}}; }
        else if(st==='P'||st==='PF'){ c.value=st==='PF'?'F':null; c.protection={locked:false}; c.font={bold:true,color:{argb:'FF0E7490'},size:12};
          c.dataValidation={type:'list',allowBlank:true,formulae:['"F"'],showErrorMessage:true,errorTitle:'Solo F',error:'Escribí F para asignar franco, o dejalo vacío.'}; }
        else { c.value=CX_TXT[st]||''; c.fill=fill('FFF8FAFC'); c.font={color:{argb:'FF94A3B8'}}; } });
      const a=ws.getCell(n,FC+fut.length), f=ws.getCell(n,FC+fut.length+1), rg=`${ws.getColumn(FC).letter}${n}:${ws.getColumn(FC+fut.length-1).letter}${n}`;
      a.value={formula:`COUNTIF(${rg},"F")`}; f.value={formula:`MAX(0,F${n}-${a.address})`};
      [a,f].forEach(c=>{ c.border=B; c.alignment={horizontal:'center'}; c.font={bold:true}; });
      if(r.sup){ ws.getCell(n,2).note=`Ya superó ${cfg.obj} jornadas: avisar a RRHH`; ws.getCell(n,2).font={color:{argb:'FFB91C1C'}}; }
      else if(r.e.egreso&&r.e.egreso<=C.P.d1) ws.getCell(n,2).note='Egresa el '+dmy(r.e.egreso);
      row.height=20; });
    if(L.length){ const fl=ws.getColumn(FC+fut.length+1).letter;
      ws.addConditionalFormatting({ref:`${fl}7:${fl}${6+L.length}`,rules:[{type:'cellIs',operator:'greaterThan',formulae:[0],style:{fill:fill('FFFECACA'),font:{color:{argb:'FFB91C1C'},bold:true}}},{type:'cellIs',operator:'equal',formulae:[0],style:{fill:fill('FFDCFCE7'),font:{color:{argb:'FF15803D'},bold:true}}}]}); }
    let rr=8+L.length;
    if(!L.length){ ws.getCell(7,1).value='No hay eventuales en esta hoja.'; rr=9; }
    if(false){ ws.mergeCells(rr,1,rr,last); ws.getCell(rr,1).value='Al día (sin francos pendientes): '+p.ok.map(r=>r.e.nombre).join(' · '); ws.getCell(rr,1).alignment={wrapText:true}; ws.getCell(rr,1).font={size:9.5,color:{argb:'FF475569'}}; }
    await ws.protect('',{selectLockedCells:true,selectUnlockedCells:true,formatColumns:true,formatRows:true});
    ctl.push([k,p.sk,L.length]);
  }
  const cs=wb.addWorksheet('_control',{state:'veryHidden'});
  cs.addRow(['ASIGNACION_FRANCOS_PANEL_RRHH',1]); cs.addRow(['periodo',C.P.d0,C.P.d1]); cs.addRow(['emitido',new Date().toISOString()]); cs.addRow(['hojas']); ctl.forEach(x=>cs.addRow(x));
  const buf=await wb.xlsx.writeBuffer();
  download(buf,`${soloPend?'francos_pendientes':'asignar_francos'}_${pages.length===1?pages[0].sk.replace(/[^A-Z0-9Ñ]+/g,'_'):pages.length+'_sectores'}_${hoy()}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  App.toast(`${soloPend?'Francos pendientes':'Excel para completar'}: ${pages.reduce((a,p)=>a+p.R.length,0)} eventual(es) en ${pages.length} hoja(s), una por sector${frState.sel.length?' · solo los elegidos':''}. El coordinador marca F y lo devuelve a RRHH.`);
}
// vuelta: el coordinador manda el Excel completo → actualiza el plan de francos
function esAsignacion(wb){ return wb.SheetNames.some(sn=>{ const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:true}); return rows.slice(0,8).some(r=>r&&r[0]==='#FRANCOS'); }); }
async function loadAsignacion(wb,name){
  if(!FRE().length) throw new Error('Primero cargá la lista de eventuales o el plan de francos: la asignación se aplica sobre esos empleados.');
  DB.francos=DB.francos||{emps:{},files:[]}; const F=DB.francos;
  const byLeg={}; FRE().forEach(e=>{ if(e.legajo) byLeg[e.legajo]=e; });
  const quien=frUser()+' · Excel '+name, at=new Date().toISOString(), fa=F.fa||(F.fa={});
  const marca=(e,d,v)=>frMarca(F,frKey(e),e,d,v,quien,at);
  let fr=0, jo=0, emp=new Set(), noEnc=[], hojas=0, falt=[];
  for(const sn of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:true});
    const hi=rows.findIndex((r,i)=>i<10&&r&&r[0]==='#FRANCOS'); if(hi<0) continue; hojas++;
    const H=rows[hi], cols=[]; H.forEach((v,j)=>{ if(j>0&&typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)) cols.push([j,v]); });
    const hd=rows[hi+1]||[], ca=hd.findIndex(x=>/a asignar/i.test(String(x||'')));
    for(let i=hi+2;i<rows.length;i++){ const r=rows[i]; if(!r||r[0]==null||!/^\s*\d+/.test(String(r[0]))) continue;
      const leg=String(r[0]).trim().replace(/\.0+$/,''); let e=byLeg[leg]; if(!e){ noEnc.push(leg+' '+(r[1]||'')); continue; }
      let n=0;
      for(const [j,d] of cols){ const v=String(r[j]==null?'':r[j]).trim();
        if(e.d[d]==='B'||cxFer(d)||v==='Fe'||v==='–'||(e.ingreso&&d<e.ingreso)||(e.egreso&&d>e.egreso)) continue;   // feriado / fuera de contrato: no se toca
        if(/^(f|x|franco)/i.test(v)){ if(e.d[d]!=='F'){ e=frMaterial(e); byLeg[leg]=e; e.d[d]='F'; marca(e,d,'F'); fr++; } emp.add(leg); n++; }
        else if(v===''&&e.d[d]==='F'){ e=frMaterial(e); byLeg[leg]=e; e.d[d]='1'; marca(e,d,''); jo++; emp.add(leg); } }
      const pedidos=ca>=0?+r[ca]||0:0; if(pedidos>n) falt.push(`${r[1]||leg}: ${n}/${pedidos}`);
    }
  }
  if(!hojas) throw new Error('El archivo no tiene el formato de asignación del panel.');
  (F.asig||(F.asig=[])).push({at:new Date().toISOString(),file:name,fr,jo,emp:emp.size,falt:falt.length});
  F.asig=F.asig.slice(-20); F.at=new Date().toISOString(); await persist();
  return {fr,jo,emp:emp.size,noEnc,falt,hojas};
}

function cxInforme(){
  const C=frCruce(); if(!C){ App.toast('Cargá el plan de francos y los movimientos.',true); return; }
  const cfg=C.cfg, R=cxRows(C);
  const ferL=C.dias.filter(cxFer).map(d=>dmy(d)+' ('+cxFer(d).n+')');
  const data={obj:cfg.obj,hoy:hoy(),fin:C.P.d1,
    dias:C.dias.map(d=>({d,l:DOW[dObj(d).getDay()].slice(0,2),n:dObj(d).getDate(),fer:!!cxFer(d),corte:d===C.corte})),
    lab:CX_LAB,txt:CX_TXT,bg:CX_BG,
    rows:R.map(r=>({leg:r.e.legajo,nom:r.e.nombre,tur:turKey(r.e.turno),sec:secKey(r.e.sector),fich:r.g.T+r.g.DT+r.g.FT,pend:r.pend,sup:r.sup,falt:r.falt,comp:r.comp,P:r.g.P,proy:r.proy,ftom:r.g.F,enf:r.g.ENF,art:r.g.ART,aus:r.g.AUS,egr:r.e.egreso||'',
      obs:[r.mv?'':'Sin fichadas en el export',r.falt?`No llega a ${cfg.obj} (faltan ${r.falt})`:'',r.e.egreso&&r.e.egreso<=C.P.d1?'Egresa '+dmy(r.e.egreso):'',r.e.obs||''].filter(Boolean).join(' · '),
      cal:C.dias.map(d=>r.cal[d])}))};
  const pre={tur:frState.turnos,sec:frState.sectors};
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Francos restantes por empleado · ${dmy(C.P.d0)} al ${dmy(C.P.d1)}</title><style>
  @page{size:A4 landscape;margin:10mm} body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;font-size:12px;background:#fff}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#475569;margin:0 0 14px} .k{display:flex;gap:12px;margin:0 0 16px;flex-wrap:wrap}
  .k div{border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px;min-width:140px} .k b{display:block;font-size:22px} .k span{font-size:11px;color:#475569;text-transform:uppercase}
  .flt{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin:0 0 14px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
  .flt label{display:flex;flex-direction:column;font-size:11px;color:#475569;text-transform:uppercase;gap:3px} .flt select,.flt input{font:inherit;font-size:13px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;min-width:170px;text-transform:none}
  .ms{position:relative;font-size:13px} .ms summary{cursor:pointer;list-style:none;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;min-width:190px} .ms summary::after{content:' ▾'} .ms>div{position:absolute;z-index:5;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;min-width:240px;max-height:320px;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.12)} .ms label{display:flex;gap:8px;align-items:center;flex-direction:row;text-transform:none;font-size:13px;color:#0f172a;padding:3px 0} .ms input{min-width:0!important;width:15px;height:15px;padding:0;margin:0;flex:none} .ms label{justify-content:flex-start;white-space:nowrap} .ms label i{margin-left:auto;color:#94a3b8;font-style:normal;font-size:11px} .msa{font-size:12px;margin-bottom:6px} .flt button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #0f172a;background:#0f172a;color:#fff;cursor:pointer}
  .ftxt{display:none;font-size:12px;margin:0 0 10px} table{border-collapse:collapse;width:100%;margin:0 0 18px} th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:center} th{background:#f1f5f9;font-size:11px}
  td.l,th.l{text-align:left} .fal{font-weight:700;font-size:14px} tr.p td{background:#fef3c7} tr.s td{background:#fee2e2} h2{font-size:14px;margin:18px 0 6px}
  .cal td,.cal th{padding:2px 1px;font-size:10px;min-width:16px} .cal td.l{white-space:nowrap;font-size:10.5px;padding:2px 6px} .ley span{display:inline-block;margin:0 10px 4px 0} .ley i{display:inline-block;width:14px;height:12px;border:1px solid #cbd5e1;vertical-align:-2px;margin-right:4px;font-style:normal;font-size:9px;text-align:center}
  .crit{font-size:11px;color:#334155;line-height:1.5} tr{page-break-inside:avoid} .vacio{padding:16px;color:#64748b}
  @media print{.flt{display:none}.ftxt{display:block}body{margin:0}.pb{page-break-before:always}}</style></head><body>
  <h1>Francos restantes por empleado</h1>
  <p class="sub">Período ${dmy(C.P.d0)} al ${dmy(C.P.d1)} · objetivo ${cfg.obj} jornadas · ${C.M?'fichadas hasta el '+dmy(C.corte)+' (después, el plan)':'solo plan, sin movimientos'}${ferL.length?' · feriados: '+esc(ferL.join(', ')):''} · generado ${fmtAt(new Date().toISOString())}</p>
  <div class="flt"><details class="ms" id="dT"><summary>Turno: <b id="sT">Todos</b></summary><div id="fT"></div></details><details class="ms" id="dS"><summary>Sector: <b id="sS">Todos</b></summary><div id="fS"></div></details><label>Mostrar<select id="fM"><option value="all">Todos</option><option value="pend">Con francos restantes</option><option value="falt">No llegan al objetivo</option></select></label><label>Buscar<input id="fQ" placeholder="apellido o legajo"></label><button onclick="window.print()">Imprimir / PDF</button></div>
  <p class="ftxt" id="ftxt"></p>
  <div class="k" id="kp"></div>
  <table><thead><tr><th>Legajo</th><th class="l">Empleado</th><th class="l">Turno</th><th class="l">Sector</th><th>Fichadas</th><th>Francos restantes</th><th>Jornadas a la fecha</th><th>Le quedan planificadas</th><th>Total al cierre</th><th>Francos tomados</th><th>Enferm.</th><th>ART</th><th>Ausencias</th><th class="l">Observación</th></tr></thead><tbody id="tb"></tbody></table>
  ${C.sinPl.length?`<p><b>Fichan como eventuales pero no están en el plan:</b> ${C.sinPl.map(x=>esc(x.legajo+' '+x.nombre)).join(' · ')}</p>`:''}
  <h2 class="pb">Calendario día por día</h2>
  <div class="ley" id="ley"></div>
  <table class="cal"><thead id="ch"></thead><tbody id="cb"></tbody></table>
  <h2>Criterios</h2><div class="crit">Fichadas = días con fichada en el reloj (también domingos y feriados trabajados). Los domingos y feriados, aunque se trabajen, no suman al tope. Jornadas a la fecha = fichadas + enfermedad${cfg.art?' + ART':''}. Día sin fichada o con ausencia (con o sin aviso) = franco tomado (los domingos ya son franco). Feriados del período se informan aparte y no suman. Hasta el último día del export de movimientos se usan las fichadas (el último día solo si tiene fichada); después, el plan de francos. <b>Francos restantes = total al cierre − ${cfg.obj}</b>.</div>
  <script>
  const D=${JSON.stringify(data).replace(/</g,'\\u003c')}, PRE=${JSON.stringify(pre)};
  const e=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const uq=a=>[...new Set(a)].sort((x,y)=>x.localeCompare(y,'es'));
  const $=id=>document.getElementById(id);
  const box=(id,k,pre)=>{ $(id).innerHTML='<div class="msa"><a href="#" data-a="'+id+'">Todos</a> · <a href="#" data-n="'+id+'">Limpiar</a></div>'+uq(D.rows.map(r=>r[k])).map(t=>'<label><input type="checkbox" value="'+e(t)+'"'+(pre.includes(t)?' checked':'')+'> '+e(t)+' <i>'+D.rows.filter(r=>r[k]===t).length+'</i></label>').join(''); };
  box('fT','tur',PRE.tur); box('fS','sec',PRE.sec);
  const vals=id=>[...$(id).querySelectorAll('input:checked')].map(i=>i.value);
  document.addEventListener('click',ev=>{ const a=ev.target.closest('[data-a],[data-n]'); if(!a) return; ev.preventDefault(); const id=a.dataset.a||a.dataset.n; $(id).querySelectorAll('input').forEach(i=>i.checked=!!a.dataset.a); draw(); });
  $('ley').innerHTML=['T','F','PF','P','DOM','FER','ENF','ART','AUS','DT'].map(k=>'<span><i style="background:'+D.bg[k]+'">'+(k==='P'?'':D.txt[k])+'</i>'+e(D.lab[k])+'</span>').join('');
  $('ch').innerHTML='<tr><th class="l">Empleado</th>'+D.dias.map(d=>'<th style="'+(d.fer?'background:#fef3c7;':'')+(d.corte?'border-right:2px solid #0f172a;':'')+'">'+d.l+'<br>'+d.n+'</th>').join('')+'<th>Restan</th></tr>';
  function draw(){
    const t=vals('fT'), s=vals('fS'), m=$('fM').value, q=$('fQ').value.trim().toLowerCase();
    $('sT').textContent=t.length?(t.length===1?t[0]:t.length+' elegidos'):'Todos'; $('sS').textContent=s.length?(s.length===1?s[0]:s.length+' elegidos'):'Todos';
    const R=D.rows.filter(r=>(!t.length||t.includes(r.tur))&&(!s.length||s.includes(r.sec))&&(m==='all'||(m==='pend'?(r.pend>0||r.sup):r.falt>0))&&(!q||r.nom.toLowerCase().includes(q)||String(r.leg).includes(q)));
    const act=R.filter(r=>!(r.egr&&r.egr<D.hoy)), pend=act.filter(r=>r.pend>0);
    $('ftxt').textContent='Filtro · turno: '+(t.length?t.join(', '):'todos')+' · sector: '+(s.length?s.join(', '):'todos')+(m!=='all'?' · '+$('fM').selectedOptions[0].text.toLowerCase():'')+(q?' · búsqueda: '+q:'');
    $('kp').innerHTML=[['Francos restantes',pend.reduce((a,r)=>a+r.pend,0)],['Empleados con francos restantes',pend.length],['Superaron '+D.obj,act.filter(r=>r.sup).length],['No llegan a '+D.obj,act.filter(r=>r.falt).length],['Empleados en el listado',R.length]].map(k=>'<div><span>'+e(k[0])+'</span><b>'+k[1]+'</b></div>').join('');
    $('tb').innerHTML=R.length?R.map(r=>'<tr class="'+(r.sup?'s':r.pend?'p':'')+'"><td>'+e(r.leg)+'</td><td class="l">'+e(r.nom)+'</td><td class="l">'+e(r.tur)+'</td><td class="l">'+e(r.sec)+'</td><td>'+r.fich+'</td><td class="fal">'+(r.sup?'Superó':r.pend)+'</td><td>'+r.comp+'</td><td>'+r.P+'</td><td>'+r.proy+'</td><td>'+r.ftom+'</td><td>'+(r.enf||'')+'</td><td>'+(r.art||'')+'</td><td>'+(r.aus||'')+'</td><td class="l">'+e(r.obs)+'</td></tr>').join(''):'<tr><td colspan="14" class="vacio">Nadie con ese filtro.</td></tr>';
    $('cb').innerHTML=R.map(r=>'<tr><td class="l">'+e(r.leg+' · '+r.nom)+'</td>'+r.cal.map((c,i)=>'<td style="background:'+D.bg[c]+';'+(c==='DT'||c==='FT'?'color:#fff;':'')+(D.dias[i].corte?'border-right:2px solid #0f172a;':'')+'">'+(c==='P'?'':D.txt[c])+'</td>').join('')+'<td class="fal">'+(r.sup?'!':r.pend)+'</td></tr>').join('');
  }
  ['fT','fS'].forEach(i=>$(i).addEventListener('change',draw)); $('fM').onchange=draw; $('fQ').oninput=draw; draw();
  <\/script></body></html>`;
  download(html,`informe_francos_por_empleado_${C.P.d0}_al_${C.P.d1}.html`,'text/html;charset=utf-8'); App.toast('Informe descargado: filtrá por turno o sector y usá Imprimir para PDF');
}

function cxExcel(){
  const C=frCruce(); if(!C){ App.toast('Cargá el plan de francos y los movimientos.',true); return; }
  const cfg=C.cfg, wb=XLSX.utils.book_new(), R=cxRows(C);
  const head=['Legajo','Apellido y nombre','Turno','Sector','Ingreso','Egreso','Fichadas',`Francos restantes (objetivo ${cfg.obj})`,'Jornadas a la fecha','Le quedan planificadas','Total al cierre','Domingos trabajados','Feriados trabajados','Enfermedad','ART','Ausencias / otras','Francos tomados (sin fichada)','Feriados del período (aparte)',`Faltan para ${cfg.obj}`,'Observación'];
  const rows=[head].concat(R.map(r=>{ const g=r.g; return [r.e.legajo,r.e.nombre,r.e.turno,r.e.sector,r.e.ingreso?dmy(r.e.ingreso):'',r.e.egreso?dmy(r.e.egreso):'',g.T+g.DT+g.FT,r.sup?'Superó':r.pend,r.comp,g.P,r.proy,g.DT,g.FT,g.ENF,g.ART,g.AUS+g.VAC+g.LIC+g.OTRO,g.F,r.feriados,r.falt,
      [r.mv?'':'Sin fichadas en el export',r.sup?`Ya superó ${cfg.obj} jornadas`:'',r.e.obs||''].filter(Boolean).join(' · ')]; }));
  const ws=XLSX.utils.aoa_to_sheet(rows); ws['!cols']=head.map((h,i)=>({wch:i===1?34:i===19?40:Math.max(10,Math.min(18,h.length))})); ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length-1,c:head.length-1}})};
  XLSX.utils.book_append_sheet(wb,ws,'Por empleado');
  const CODE={T:'T',DT:'DT',FT:'FT',ENF:'ENF',ART:'ART',AUS:'AUS',VAC:'VAC',LIC:'LIC',OTRO:'NOV',F:'F',DOM:'DOM',FER:'FER',P:'P',PF:'PF','-':''};
  const cal=[['Legajo','Apellido y nombre'].concat(C.dias.map(d=>DOW[dObj(d).getDay()].slice(0,2)+' '+dm(d))).concat(['Faltan tomar'])].concat(R.map(r=>[r.e.legajo,r.e.nombre].concat(C.dias.map(d=>CODE[r.cal[d]])).concat([r.sup?'Superó':r.pend])));
  const w2=XLSX.utils.aoa_to_sheet(cal); w2['!cols']=[{wch:9},{wch:34}].concat(C.dias.map(()=>({wch:7}))); XLSX.utils.book_append_sheet(wb,w2,'Calendario');
  const ref=[['Código','Significado','¿Computa?'],['T','Trabajó (tiene fichada)','Sí'],['DT','Domingo trabajado','No (los domingos no suman al tope)'],['FT','Feriado trabajado','No (los feriados no suman al tope)'],['ENF','Enfermedad','Sí'],['ART','Licencia ART',cfg.art?'Sí':'No'],['F (ausencia)','Ausencia con o sin aviso: cuenta como franco tomado','No'],['VAC / LIC / NOV','Vacaciones, licencia u otra novedad','No'],['F','Sin fichada: franco tomado','No'],['DOM','Domingo (ya es franco)','No'],['FER','Feriado (se informa aparte)','No'],['P','Jornada planificada después del corte','Total al cierre'],['PF','Franco planificado después del corte','No'],[],
    ['Período',`${dmy(C.P.d0)} al ${dmy(C.P.d1)}`],['Fichadas hasta',C.M?dmy(C.corte)+' (el último día solo cuenta si tiene fichada)':'sin movimientos'],['Objetivo de jornadas',cfg.obj],['Feriados del período',C.dias.filter(cxFer).map(d=>dmy(d)+' '+cxFer(d).n).join(' · ')||'ninguno'],
    ['Francos que faltan tomar','Total al cierre − objetivo (si da negativo, 0)'],[],['Fichan y no están en el plan',C.sinPl.map(x=>x.legajo+' '+x.nombre).join(' · ')||'ninguno']];
  const w3=XLSX.utils.aoa_to_sheet(ref); w3['!cols']=[{wch:30},{wch:70},{wch:16}]; XLSX.utils.book_append_sheet(wb,w3,'Criterios');
  XLSX.writeFile(wb,`francos_por_empleado_${C.P.d0}_al_${C.P.d1}.xlsx`); App.toast('Excel descargado');
}
App.renderFrancos=renderFrancos;
/* ---------- Listado de francos asignados (por sector y turno) ---------- */
function frListado(){
  const C=frCruce(); if(!C) return null;
  const R=C.rows.filter(r=>frFlt(r.e)), grupos={};
  R.forEach(r=>{ const k=secKey(r.e.sector)+'\u0001'+turKey(r.e.turno); (grupos[k]||(grupos[k]=[])).push(r); });
  const G=Object.keys(grupos).sort((a,b)=>a.localeCompare(b,'es')).map(k=>{ const [sec,tur]=k.split('\u0001');
    const L=grupos[k].sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es')).map(r=>({e:r.e,f:C.dias.filter(d=>r.e.d[d]==='F'&&dObj(d).getDay()!==0&&!(r.e.ingreso&&d<r.e.ingreso)&&!(r.e.egreso&&d>r.e.egreso))}));
    return {sec,tur,L}; });
  const filtro=[frState.sectors.length?'Sector: '+frState.sectors.join(', '):'Todos los sectores',frState.turnos.length?'Turno: '+frState.turnos.join(', '):'todos los turnos'].join(' · ');
  return {C,G,filtro,n:R.length,tot:G.reduce((a,g)=>a+g.L.reduce((b,x)=>b+x.f.length,0),0)};
}
const frDiaTxt=d=>DOW[dObj(d).getDay()].slice(0,2)+' '+dm(d);
async function frListadoXlsx(){
  const X=frListado(); if(!X||!X.n){ App.toast('No hay eventuales con ese filtro.',true); return; }
  if(typeof ExcelJS==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  const {C,G}=X, wb=new ExcelJS.Workbook(); wb.creator='Panel RRHH I.Casanova';
  const thin={style:'thin',color:{argb:'FFCBD5E1'}}, B={top:thin,left:thin,bottom:thin,right:thin}, fill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
  const ws=wb.addWorksheet('Francos asignados',{views:[{state:'frozen',ySplit:4}],pageSetup:{orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9}});
  ws.columns=[{width:11},{width:36},{width:10},{width:70}];
  ws.mergeCells('A1:D1'); ws.getCell('A1').value=`FRANCOS ASIGNADOS · ${liqNom(C.P.ym).toUpperCase()}`; ws.getCell('A1').font={bold:true,size:15};
  ws.mergeCells('A2:D2'); ws.getCell('A2').value=`Período ${dmy(C.P.d0)} al ${dmy(C.P.d1)} · ${X.filtro} · ${X.n} eventuales · ${X.tot} francos · emitido ${dmy(hoy())}`; ws.getCell('A2').font={color:{argb:'FF475569'}};
  const h=ws.getRow(4); ['Legajo','Empleado','Francos','Días de franco'].forEach((t,j)=>{ const c=h.getCell(j+1); c.value=t; c.font={bold:true,color:{argb:'FFFFFFFF'}}; c.fill=fill('FF1E293B'); c.border=B; c.alignment={horizontal:j===2?'center':'left'}; });
  let r=5;
  for(const g of G){
    ws.mergeCells(r,1,r,4); const c=ws.getCell(r,1); c.value=`${g.sec} · ${g.tur} · ${g.L.length} eventual(es) · ${g.L.reduce((a,x)=>a+x.f.length,0)} francos`; c.font={bold:true}; c.fill=fill('FFE0F2FE'); r++;
    for(const x of g.L){ const row=ws.getRow(r++); [x.e.legajo,x.e.nombre,x.f.length,x.f.length?x.f.map(frDiaTxt).join(' · '):'Sin francos asignados'].forEach((v,j)=>{ const cc=row.getCell(j+1); cc.value=v; cc.border=B; cc.alignment={horizontal:j===2?'center':'left',vertical:'top',wrapText:j===3};
      if(j===3&&!x.f.length) cc.font={color:{argb:'FFB91C1C'},italic:true}; }); }
    r++; }
  // calendario: una fila por eventual, una columna por día
  const wc=wb.addWorksheet('Calendario',{views:[{state:'frozen',xSplit:4,ySplit:2}],pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9}});
  wc.columns=[{width:10},{width:30},{width:14},{width:12}].concat(C.dias.map(()=>({width:4.2})));
  wc.getCell(1,1).value=`Francos asignados · ${liqNom(C.P.ym)} · ${dmy(C.P.d0)} al ${dmy(C.P.d1)}`; wc.getCell(1,1).font={bold:true,size:13};
  const hc=wc.getRow(2); ['Legajo','Empleado','Sector','Turno'].concat(C.dias.map(d=>DOW[dObj(d).getDay()].slice(0,2)+'\n'+dObj(d).getDate())).forEach((t,j)=>{ const c=hc.getCell(j+1); c.value=t; c.font={bold:true,size:9}; c.alignment={horizontal:'center',vertical:'middle',wrapText:true}; c.border=B; c.fill=fill(j>3&&dObj(C.dias[j-4]).getDay()===0?'FFE2E8F0':'FFF1F5F9'); });
  hc.height=28; let rr=3;
  for(const g of G) for(const x of g.L){ const row=wc.getRow(rr++), fs=new Set(x.f);
    [x.e.legajo,x.e.nombre,g.sec,g.tur].forEach((v,j)=>{ const c=row.getCell(j+1); c.value=v; c.border=B; c.font={size:9.5}; });
    C.dias.forEach((d,j)=>{ const c=row.getCell(5+j); c.border=B; c.alignment={horizontal:'center'}; if(fs.has(d)){ c.value='F'; c.font={bold:true,color:{argb:'FF0E7490'}}; c.fill=fill('FFCFFAFE'); } else if(dObj(d).getDay()===0) c.fill=fill('FFF1F5F9'); }); }
  const buf=await wb.xlsx.writeBuffer(), tag=frState.sectors.length===1?frState.sectors[0].replace(/[^A-Z0-9Ñ]+/g,'_'):'todos';
  download(buf,`francos_asignados_${C.P.ym}_${tag}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  App.toast(`Listado descargado: ${X.n} eventuales · ${X.tot} francos asignados`);
}
// detalle de francos pendientes de asignar (para no pasarnos de las jornadas del período)
function frPendientesPrint(){
  const C=frCruce(); if(!C){ App.toast('No hay eventuales para calcular los francos pendientes.',true); return; }
  const cfg=C.cfg, R=C.rows.filter(r=>frFlt(r.e));
  const P=R.filter(r=>r.pend>0), S=R.filter(r=>r.sup);
  if(!P.length&&!S.length){ App.toast('Nadie tiene francos pendientes de asignar con este filtro.'); return; }
  const fr=r=>C.dias.filter(d=>r.e.d[d]==='F'&&dObj(d).getDay()!==0).length;
  const fila=(r,cols)=>`<tr><td>${esc(r.e.legajo)}</td><td class="l"><b>${esc(r.e.nombre)}</b></td>${cols?`<td class="l">${esc(secKey(r.e.sector))}</td><td class="l">${esc(turKey(r.e.turno))}</td>`:''}<td>${fr(r)}</td><td>${r.comp}</td><td>${r.proy}</td><td class="p">${r.pend}</td><td class="f"></td></tr>`;
  const head=cols=>`<tr><th>Legajo</th><th class="l">Apellido y nombre</th>${cols?'<th class="l">Sector</th><th class="l">Turno</th>':''}<th>Francos asignados</th><th>Jornadas a la fecha</th><th>Proyección al cierre</th><th>Faltan asignar</th><th class="l" style="width:130px">Días elegidos (anotar)</th></tr>`;
  const alfa=P.slice().sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es'));
  const g={}; P.forEach(r=>{ const k=secKey(r.e.sector)+'\u0001'+turKey(r.e.turno); (g[k]||(g[k]=[])).push(r); });
  const grupos=Object.keys(g).sort((a,b)=>a.localeCompare(b,'es')).map(k=>{ const [sec,tur]=k.split('\u0001'); return {sec,tur,L:g[k].sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es'))}; });
  const tot=P.reduce((a,r)=>a+r.pend,0);
  const filtro=[frState.sectors.length?'Sector: '+frState.sectors.join(', '):'Todos los sectores',frState.turnos.length?'Turno: '+frState.turnos.join(', '):'todos los turnos'].join(' · ');
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Francos pendientes ${esc(liqNom(C.P.ym))}</title><style>
  @page{size:A4;margin:12mm} body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;font-size:12px}
  h1{font-size:20px;margin:0} p.m{color:#475569;font-size:12px;margin:4px 0 14px} h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #0f172a}
  h3{font-size:13px;background:#fef3c7;padding:6px 10px;margin:14px 0 0;border-radius:6px;break-after:avoid}
  .k{display:flex;gap:10px;margin:0 0 10px} .k div{border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px} .k b{display:block;font-size:22px} .k span{font-size:11px;color:#475569;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;margin:0 0 6px} th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:center} th{background:#f1f5f9;font-size:10.5px} .l{text-align:left}
  td.p{font-weight:bold;font-size:14px;color:#b45309;background:#fffbeb} td.f{min-width:110px} tr{break-inside:avoid} .nota{font-size:11px;color:#475569;margin:6px 0 0}
  .pb{page-break-before:always} .firma{margin-top:28px;font-size:12px;color:#334155} button{font:inherit;padding:7px 14px;border-radius:6px;border:0;background:#0f172a;color:#fff;cursor:pointer;float:right}
  @media print{button{display:none}}</style></head><body>
  <button onclick="print()">Imprimir / guardar PDF</button>
  <h1>Francos pendientes de asignar · ${esc(liqNom(C.P.ym))}</h1>
  <p class="m">Período ${dmy(C.P.d0)} al ${dmy(C.P.d1)} · ${esc(filtro)} · ${C.M?'fichadas hasta el '+dmy(C.corte):'sin fichadas todavía: se supone que trabajan todo el período'} · objetivo ${cfg.obj} jornadas (domingos y feriados no suman) · emitido ${dmy(hoy())}</p>
  <div class="k"><div><span>Personas con francos pendientes</span><b>${P.length}</b></div><div><span>Francos por asignar</span><b>${tot}</b></div>${S.length?`<div><span>Ya superaron el objetivo</span><b>${S.length}</b></div>`:''}</div>
  <p class="nota">"Faltan asignar" = francos que todavía hay que darle para no pasar de ${cfg.obj} jornadas al cierre del período (proyección = jornadas a la fecha + días planificados de trabajo que le quedan). La última columna es para anotar a mano los días elegidos.</p>
  <h2>1 · Por orden alfabético</h2><table>${head(true)}${alfa.map(r=>fila(r,true)).join('')}</table>
  <h2 class="pb">2 · Por sector y turno</h2>
  ${grupos.map(x=>`<h3>${esc(x.sec)} · ${esc(x.tur)} · ${x.L.length} persona(s) · ${x.L.reduce((a,r)=>a+r.pend,0)} francos por asignar</h3><table>${head(false)}${x.L.map(r=>fila(r,false)).join('')}</table>`).join('')}
  ${S.length?`<h2>Ya superaron las ${cfg.obj} jornadas</h2><table><tr><th>Legajo</th><th class="l">Apellido y nombre</th><th class="l">Sector</th><th class="l">Turno</th><th>Jornadas a la fecha</th></tr>${S.sort((a,b)=>a.e.nombre.localeCompare(b.e.nombre,'es')).map(r=>`<tr><td>${esc(r.e.legajo)}</td><td class="l">${esc(r.e.nombre)}</td><td class="l">${esc(secKey(r.e.sector))}</td><td class="l">${esc(turKey(r.e.turno))}</td><td><b>${r.comp}</b></td></tr>`).join('')}</table>`:''}
  <div class="firma">Coordinador/a: ______________________________ &nbsp;&nbsp; Firma: ____________________ &nbsp;&nbsp; Fecha: ____/____/______</div></body></html>`;
  download(html,`francos_pendientes_${C.P.ym}.html`,'text/html;charset=utf-8'); App.toast(`Detalle descargado: ${P.length} persona(s) con ${tot} francos por asignar. Abrilo y usá Imprimir para PDF`);
}
function frListadoPrint(){
  const X=frListado(); if(!X||!X.n){ App.toast('No hay eventuales con ese filtro.',true); return; }
  const {C,G}=X;
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Francos asignados ${esc(liqNom(C.P.ym))}</title><style>
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px}h1{font-size:20px;margin:0}p.m{color:#475569;font-size:12px;margin:4px 0 16px}
.g{break-inside:avoid;margin-bottom:18px}.g h2{font-size:14px;background:#e0f2fe;padding:6px 10px;margin:0;border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:12px}td,th{border-bottom:1px solid #e2e8f0;padding:5px 8px;text-align:left;vertical-align:top}th{color:#475569;font-size:11px}
td.n{text-align:center;width:60px;font-weight:bold}.z{color:#b91c1c;font-style:italic}.firma{margin-top:30px;font-size:12px;color:#334155}
@media print{body{margin:10mm}button{display:none}}</style></head><body>
<button onclick="print()" style="float:right;padding:8px 14px">Imprimir / PDF</button>
<h1>Francos asignados · ${esc(liqNom(C.P.ym))}</h1><p class="m">Período ${dmy(C.P.d0)} al ${dmy(C.P.d1)} · ${esc(X.filtro)} · ${X.n} eventuales · ${X.tot} francos · emitido ${dmy(hoy())}</p>
${G.map(g=>`<div class="g"><h2>${esc(g.sec)} · ${esc(g.tur)} · ${g.L.length} eventual(es)</h2><table><tr><th>Legajo</th><th>Empleado</th><th>Francos</th><th>Días de franco</th></tr>
${g.L.map(x=>`<tr><td>${esc(x.e.legajo)}</td><td>${esc(x.e.nombre)}</td><td class="n">${x.f.length}</td><td${x.f.length?'':' class="z"'}>${x.f.length?x.f.map(frDiaTxt).join(' · '):'Sin francos asignados'}</td></tr>`).join('')}</table></div>`).join('')}
<div class="firma">Coordinador/a: ______________________________ &nbsp;&nbsp; Firma: ____________________ &nbsp;&nbsp; Fecha: ____/____/______</div></body></html>`;
  const w=window.open('','_blank'); if(w){ w.document.write(html); w.document.close(); } else download(html,`francos_asignados_${C.P.ym}.html`,'text/html;charset=utf-8');
}
// asignar o quitar un franco desde el calendario
let frBusy=false;
// marca local (sin servidor o desde Excel): mismo registro que el servidor
function frMarca(F,key,e,d,v,by,at){
  const fa=F.fa||(F.fa={}), m=fa[key]||(fa[key]={}), ant=m[d];
  const h=ant?(ant.h||[]).concat([{v:ant.v,by:ant.by,at:ant.at}]).slice(-9):[];
  m[d]={v,by,at,h};
  (F.log||(F.log=[])).push({k:key,l:e.legajo||'',n:e.nombre||'',d,v,by,at}); F.log=F.log.slice(-500);
}
async function frSet(id,valor){
  if(frBusy||!frCanEdit()) return;
  const i=id.lastIndexOf('|'), key=id.slice(0,i), d=id.slice(i+1), e=FRE().find(x=>cxKey(x)===key); if(!e) return;
  frBusy=true; document.querySelectorAll(`[data-fe="${CSS.escape(id)}"]`).forEach(x=>x.classList.add('busy'));
  try{
    if(window.SRV&&SRV.mode==='online'&&SRV.francosCeldas)
      await SRV.francosCeldas([{key:frKey(e),fecha:d,valor,emp:{legajo:e.legajo,nombre:e.nombre,turno:e.turno,sector:e.sector,ingreso:e.ingreso,egreso:e.egreso}}]);
    else { const m=frMaterial(e); m.d[d]=valor==='F'?'F':'1'; frMarca(DB.francos,frKey(m),m,d,valor,frUser(),new Date().toISOString()); DB.francos.at=new Date().toISOString(); await persist(); }
    App.toast(`${valor==='F'?'Franco asignado':'Franco quitado'} · ${shortName(e.nombre)} · ${lblDay(d)}`);
  }catch(err){ App.toast('No se pudo guardar el franco: '+(err.message||err),true); }
  finally{ frBusy=false; renderFrancos(); App.refresh(); }
}
// ventanita al hacer clic en un día: confirmar asignar o quitar, con el historial de ese día
function frPop(id,cell){
  frPopClose();
  const i=id.lastIndexOf('|'), key=id.slice(0,i), d=id.slice(i+1), e=FRE().find(x=>cxKey(x)===key); if(!e) return;
  const C=frCruce(), r=C&&C.by[key], cur=r?r.cal[d]:null; if(cur!=='P'&&cur!=='PF') return;
  const mt=frMeta(e,d), es=cur==='PF', H=mt?(mt.h||[]).concat([{v:mt.v,by:mt.by,at:mt.at}]).reverse():[];
  const box=document.createElement('div'); box.className='fr-pop'; box.id='fr-pop';
  box.innerHTML=`<div class="fr-pop-h"><b>${esc(e.nombre)}</b><span>${esc(DOWL[dObj(d).getDay()])} ${dmy(d)}${cxFer(d)?' · feriado':''}</span></div>
    <div class="fr-pop-st ${es?'f':''}">${es?'Tiene <b>franco asignado</b>':'Día de <b>trabajo</b>'}${es?(mt&&mt.v==='F'?`<em>por ${esc(mt.by)} · ${fmtAt(mt.at)}</em>`:'<em>del plan de francos</em>'):''}</div>
    <div class="fr-pop-b">${es?`<button class="btn danger sm" data-fpset="">Quitar franco</button>`:`<button class="btn primary sm" data-fpset="F">Asignar franco</button>`}<button class="btn ghost sm" data-fpx>Cancelar</button></div>
    ${H.length?`<div class="fr-pop-l"><span>Registro de este día</span>${H.map(x=>`<div><i class="${x.v==='F'?'a':'q'}">${x.v==='F'?'Asignó':'Quitó'}</i> ${esc(x.by||'—')} <em>${fmtAt(x.at)}</em></div>`).join('')}</div>`:''}`;
  box.dataset.id=id; document.body.appendChild(box);
  const rc=cell.getBoundingClientRect(), w=box.offsetWidth, h=box.offsetHeight;
  box.style.left=Math.max(8,Math.min(innerWidth-w-8,rc.left+rc.width/2-w/2))+'px';
  box.style.top=(rc.bottom+8+h>innerHeight?Math.max(8,rc.top-h-8):rc.bottom+8)+'px';
  cell.classList.add('pick'); const tip=document.querySelector('.fr-tip'); if(tip) tip.style.display='none';
}
function frPopClose(){ const b=$('#fr-pop'); if(b) b.remove(); document.querySelectorAll('#fr-grid .pick').forEach(x=>x.classList.remove('pick')); }
// registro general de cambios (control de RRHH)
function renderFrLog(){
  const el=$('#fr-log'); if(!el) return;
  const L=((DB.francos&&DB.francos.log)||[]).slice().reverse().slice(0,200);
  el.innerHTML=L.length?`<thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Empleado</th><th>Día</th></tr></thead><tbody>${L.map(x=>`<tr><td class="mono">${fmtAt(x.at)}</td><td>${esc(x.by)}</td><td><span class="fr-lg2 ${x.v==='F'?'a':'q'}">${x.v==='F'?'Asignó franco':'Quitó franco'}</span></td><td>${esc(x.n)} <span style="color:var(--text3)">${esc(x.l)}</span></td><td class="mono">${esc(DOW[dObj(x.d).getDay()].slice(0,2))} ${dmy(x.d)}</td></tr>`).join('')}</tbody>`
    :'<tbody><tr><td><div class="empty">Todavía no hay cambios registrados.</div></td></tr></tbody>';
}
function hookFrancos(){
  $('#fr-dl-x').onclick=frListadoXlsx; $('#fr-dl-p').onclick=frListadoPrint; $('#fr-dl-pend').onclick=frPendientesPrint;
  if(window.SRV&&SRV.mode==='online'&&SRV.user.rol!=='admin') $('#fr-rrhh').hidden=true;
  $('#fr-pick').onclick=()=>$('#fr-file').click();
  $('#fr-file').onchange=e=>{ const f=[...e.target.files]; if(f.length) loadFrancos(f); e.target.value=''; };
  $('#fr-cx-pick').onclick=()=>$('#fr-mfile').click();
  $('#fr-mfile').onchange=e=>{ const f=[...e.target.files]; if(f.length) loadFrancos(f); e.target.value=''; };
  for(const z of [$('#fr-drop'),$('#fr-mdrop')]){
    ['dragenter','dragover'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.add('hot')}));
    ['dragleave','drop'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.remove('hot')}));
    z.addEventListener('drop',e=>{ const f=[...e.dataTransfer.files]; if(f.length) loadFrancos(f); }); }
  $('#fr-cx-obj').onchange=async e=>{ const v=Math.max(1,Math.min(31,parseInt(e.target.value)||20)); if(!DB.francos) return; DB.francos.cxCfg=Object.assign(cxCfg(),{obj:v}); await persist(); renderFrancos(); };
  $('#fr-cx-art').onchange=async e=>{ if(!DB.francos) return; DB.francos.cxCfg=Object.assign(cxCfg(),{art:e.target.checked}); await persist(); renderFrancos(); };
  $('#fr-cx-f').onchange=e=>{ cxState.f=e.target.value; renderFrancos(); };
  $('#fr-cx-xls').onclick=cxExcel; $('#fr-cx-rep').onclick=cxInforme;
  $('#fr-emp-x').onclick=()=>{ frState.emp=''; renderFrancos(); };
  $('#fr-date').onchange=e=>{ if(e.target.value){ frState.date=e.target.value; renderFrancos(); } };
  $('#fr-coord').onclick=cxCoord;
  $('#fr-coord-x').onclick=()=>cxCoordExcel(false); { const b=$('#fr-dl-pendx'); if(b) b.onclick=()=>cxCoordExcel(true); }
  $('#fr-asig-pick').onclick=()=>$('#fr-afile').click();
  $('#fr-afile').onchange=e=>{ const f=[...e.target.files]; if(f.length) loadFrancos(f); e.target.value=''; };
  document.addEventListener('change',e=>{
    if(e.target.id==='fr-dia-i'&&e.target.value){ frState.dia=e.target.value; renderFrDia(); return; }
    if(e.target.id==='fr-liq-s'){ frState.liq=e.target.value; frState.date=''; renderFrancos(); return; }
    const sk=e.target.closest('input[data-frsel]'); if(sk){ const k=sk.dataset.frsel; frState.sel=sk.checked?uniq(frState.sel.concat(k)):frState.sel.filter(x=>x!==k); renderFrancos(); return; }
    if(e.target.id==='fr-sel-all'){ const ks=[...document.querySelectorAll('#fr-cx input[data-frsel]')].map(i=>i.dataset.frsel); frState.sel=e.target.checked?uniq(frState.sel.concat(ks)):frState.sel.filter(x=>!ks.includes(x)); renderFrancos(); return; }
    const c=e.target.closest('input[data-ms]'); if(!c) return; const k=c.dataset.ms;
    frState[k]=c.checked?uniq(frState[k].concat(c.value)):frState[k].filter(x=>x!==c.value); renderFrancos(); });
  document.addEventListener('click',e=>{ if(!e.target.closest('.msel')) document.querySelectorAll('.msel.open').forEach(x=>x.classList.remove('open')); });
  let qt; $('#fr-q').oninput=e=>{ clearTimeout(qt); qt=setTimeout(()=>{ frState.q=e.target.value; renderFrancos(); },200); };
  $('#fr-hoy').onclick=()=>{ frState.date=hoy(); renderFrancos(); };
  $('#fr-prev').onclick=()=>{ frState.date=addD(frState.date,-1); renderFrancos(); };
  $('#fr-next').onclick=()=>{ frState.date=addD(frState.date,1); renderFrancos(); };
  document.addEventListener('click',e=>{ if(!e.target.closest('#v-francos')) return;
    const fe=e.target.closest('[data-fe]'); if(fe){ frPop(fe.dataset.fe,fe); e.stopPropagation(); return; }
    const md=e.target.closest('[data-frmodo]'); if(md){ frState.modo=md.dataset.frmodo; if(md.dataset.frhoy) frState.dia=hoy(); renderFrancos(); return; }
    const dn=e.target.closest('[data-frdia]'); if(dn){ const n=+dn.dataset.frdia; frState.dia=n?addD(frState.dia||hoy(),n):hoy(); renderFrDia(); return; }
    const lq=e.target.closest('[data-liq]'); if(lq){ const n=+lq.dataset.liq; frState.liq=n?liqMas(cxPeriodo().ym,n):liqDe(hoy()); frState.date=''; renderFrancos(); return; }
    const ca=e.target.closest('[data-chall]'); if(ca){ frState[ca.dataset.chall]=[]; renderFrancos(); return; }
    const ch=e.target.closest('[data-ch]'); if(ch){ const k=ch.dataset.ch, v=ch.dataset.chv; frState[k]=frState[k].includes(v)?frState[k].filter(x=>x!==v):frState[k].concat(v); renderFrancos(); return; }
    if(e.target.closest('.fr-ck')) return;
    if(e.target.closest('#fr-sel-x')){ frState.sel=[]; renderFrancos(); return; }
    const c=e.target.closest('[data-frd]'); if(c){ frState.date=c.dataset.frd; renderFrancos(); return; }
    const mb=e.target.closest('.msel-b'); if(mb){ const m=mb.parentElement, was=m.classList.contains('open'); document.querySelectorAll('#v-francos .msel.open').forEach(x=>x.classList.remove('open')); m.classList.toggle('open',!was); return; }
    const ma=e.target.closest('[data-ms-all],[data-ms-none]'); if(ma){ const k=ma.dataset.msAll||ma.dataset.msNone; frState[k]=ma.dataset.msAll?[...ma.closest('.msel').querySelectorAll('input[data-ms]')].map(i=>i.value):[]; renderFrancos(); return; }
    if(e.target.closest('.msel')) return;
    const k=e.target.closest('[data-cxe]'); if(k){ frState.emp=frState.emp===k.dataset.cxe?'':k.dataset.cxe; renderFrancos(); if(frState.emp) $('#fr-emp-card').scrollIntoView({behavior:'smooth',block:'nearest'}); } });
  document.addEventListener('click',e=>{ const pop=$('#fr-pop'); if(!pop) return;
    const b=e.target.closest('[data-fpset]'); if(b&&pop.contains(b)){ const id=pop.dataset.id, v=b.dataset.fpset; frPopClose(); frSet(id,v); return; }
    if(e.target.closest('[data-fpx]')||(!pop.contains(e.target)&&!e.target.closest('[data-fe]'))) frPopClose(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') frPopClose(); });
  document.addEventListener('scroll',()=>frPopClose(),true);
  // ventanita al pasar el mouse por un día: estado, novedad y quién cargó el franco
  const tip=document.createElement('div'); tip.className='fr-tip'; tip.style.display='none'; document.body.appendChild(tip);
  const grid=$('#fr-grid');
  grid.addEventListener('mouseover',e=>{ const c=e.target.closest('[data-frtip]'); if(!c||$('#fr-pop')){ tip.style.display='none'; return; }
    tip.textContent=c.dataset.frtip; tip.style.display='block'; const r=c.getBoundingClientRect(), w=tip.offsetWidth;
    tip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px'; tip.style.top=(r.bottom+8+tip.offsetHeight>innerHeight?r.top-tip.offsetHeight-8:r.bottom+8)+'px'; });
  grid.addEventListener('mouseleave',()=>{ tip.style.display='none'; });
  $('#fr-csv').onclick=()=>{ const D=frState.date, C=frCruce(), rows=[['Fecha','Legajo','Apellido y nombre','Turno','Sector','Estado']];
    FRE().forEach(e=>{ const r=C&&C.by[cxKey(e)], c=r?r.cal[D]:null, v=e.d[D]; rows.push([dmy(D),e.legajo,e.nombre,e.turno,e.sector,c?CX_LAB[c]:v==='F'?'FRANCO':v==null?'sin dato':'Jornada']); });
    download(csv(rows),`francos_${D}.csv`,'text/csv;charset=utf-8'); };
  $('#fr-del').onclick=async()=>{ if(!confirm('¿Borrar el plan de francos y los movimientos cargados?')) return; DB.francos=null; frState.emp=''; await persist(); renderFrancos(); App.refresh(); App.toast('Datos de francos borrados'); };
}

/* ================================================================
   AGENDA Y CALENDARIO
   ================================================================ */
const CATS={tarea:{n:'Tarea',c:'#22d3ee'},reunion:{n:'Reunión',c:'#a78bfa'},recordatorio:{n:'Recordatorio',c:COL.c4},envio:{n:'Envío / mail',c:'#f59e0b'}};
const AGF_DEF={vs:true,vv:true,bj:true,nt:true,fe:true,fr:true,rc:true};
let agState={mes:hoy().slice(0,7),sel:hoy(),f:Object.assign({},AGF_DEF)};
try{ const s=JSON.parse(localStorage.getItem('rrhh-ic-agf')||'null'); if(s) agState.f=Object.assign({},AGF_DEF,s); }catch(e){}
const AGF_LAB={vs:['Salidas de vacaciones',COL.c1],vv:['Regresos',COL.c3],bj:['Bajas eventuales',COL.c2],nt:['Notificar vacaciones',COL.c4],fe:['Feriados',COL.ok],fr:['Francos',COL.acc],rc:['Mis eventos',COL.c4]};
function renderAgenda(){
  if(!$('#v-agenda')) return;
  const [y,m]=agState.mes.split('-').map(Number), first=`${y}-${pad(m)}-01`, start=mondayOf(first);
  const last=isoOf(new Date(y,m,0)), end=addD(mondayOf(last),6);
  $('#ag-title').textContent=`${MESL[m-1]} ${y}`;
  $('#ag-filt').innerHTML=Object.entries(AGF_LAB).map(([k,[n,c]])=>`<button class="chip agf${agState.f[k]?' on':''}" data-agf="${k}"><i style="background:${c}"></i>${n}</button>`).join('');
  const E=computeRange(start,end,{francos:true,all:true}), H=hoy();
  let g=['lun','mar','mié','jue','vie','sáb','dom'].map(d=>`<div class="ag-wd">${d}</div>`).join('');
  for(let d=start; d<=end; d=addD(d,1)){
    const e=E[d]||{}, it=Object.values(e).filter(x=>agState.f[x.f]), fe=ferEn(d), w=dObj(d).getDay();
    const fr=agState.f.fr&&e.fr?e.fr.names.length:0;
    const pills=it.filter(x=>x.f!=='fr'&&x.f!=='fe');
    g+=`<div class="ag-cell${d.slice(0,7)!==agState.mes?' out':''}${d===H?' today':''}${d===agState.sel?' sel':''}${w===0||w===6?' we':''}${fe&&agState.f.fe?' fer':''}" data-agd="${d}">
      <div class="ag-num"><b>${dObj(d).getDate()}</b>${fr?`<span class="ag-fr" title="${fr} de franco">F ${fr}</span>`:''}</div>
      ${fe&&agState.f.fe?`<div class="ag-fer">${esc(fe.n)}</div>`:''}
      ${pills.slice(0,3).map(x=>`<div class="ag-pill" style="--c:${x.c}">${esc(x.short||x.t)}${x.names.length>1?` · ${x.names.length}`:''}</div>`).join('')}
      ${pills.length>3?`<div class="ag-more">+${pills.length-3} más</div>`:''}</div>`;
  }
  $('#ag-cal').innerHTML=g;
  renderAgDay();
}
function renderAgDay(){
  const D=agState.sel, H=hoy(), E=computeRange(D,D,{francos:true,all:true})[D]||{}, fe=ferEn(D);
  $('#ag-day-h').innerHTML=`${D===H?'Hoy · ':''}${DOWL[dObj(D).getDay()]} ${dObj(D).getDate()} de ${MESL[dObj(D).getMonth()]}`;
  const it=Object.values(E).filter(x=>x.f!=='rc');
  const mine=REC().filter(r=>r.fecha===D).sort((a,b)=>(a.hora||'99')<(b.hora||'99')?-1:1);
  $('#ag-day').innerHTML=(fe?`<div class="ag-ev" style="--c:${COL.ok}"><b>🇦🇷 ${esc(fe.n)}</b><span>Feriado ${esc(fe.t||'')}</span></div>`:'')+
    it.filter(x=>x.f!=='fe').map(x=>`<div class="ag-ev" style="--c:${x.c}" data-v="${x.go}"><b>${esc(x.t)}${x.names.length>1?` · ${x.names.length}`:''}</b><span>${esc(names(x.names,8))}</span></div>`).join('')+
    `<h5 class="ag-sub">Mis eventos</h5>`+
    (mine.length?mine.map(r=>`<div class="rec${r.done?' done':''}"><input type="checkbox" data-recchk="${r.id}" ${r.done?'checked':''}>
      <span class="rt"><i class="ag-dot" style="background:${(CATS[r.cat]||CATS.recordatorio).c}"></i>${r.hora?`<b class="mono">${esc(r.hora)}</b> `:''}${esc(r.txt)}</span><span class="rd">${esc((CATS[r.cat]||CATS.recordatorio).n)}</span><button class="x" data-recdel="${r.id}" title="Borrar">×</button></div>`).join('')
      :'<div class="empty" style="padding:14px">Sin eventos propios este día.</div>');
  $('#ag-date').value=D;
}
function hookAgenda(){
  $('#ag-prev').onclick=()=>{ const [y,m]=agState.mes.split('-').map(Number); agState.mes=isoOf(new Date(y,m-2,1)).slice(0,7); renderAgenda(); };
  $('#ag-next').onclick=()=>{ const [y,m]=agState.mes.split('-').map(Number); agState.mes=isoOf(new Date(y,m,1)).slice(0,7); renderAgenda(); };
  $('#ag-today').onclick=()=>{ agState.mes=hoy().slice(0,7); agState.sel=hoy(); renderAgenda(); };
  document.addEventListener('click',e=>{
    const c=e.target.closest('[data-agd]'); if(c){ agState.sel=c.dataset.agd; if(agState.sel.slice(0,7)!==agState.mes) agState.mes=agState.sel.slice(0,7); renderAgenda(); return; }
    const f=e.target.closest('[data-agf]'); if(f){ agState.f[f.dataset.agf]=!agState.f[f.dataset.agf]; try{ localStorage.setItem('rrhh-ic-agf',JSON.stringify(agState.f)); }catch(x){} renderAgenda(); }
  });
  const add=async()=>{ const t=$('#ag-txt').value.trim(); if(!t){ $('#ag-txt').focus(); return; }
    REC().push({id:Date.now().toString(36),txt:t,fecha:$('#ag-date').value||agState.sel,hora:$('#ag-hora').value||'',cat:$('#ag-cat').value,done:false});
    $('#ag-txt').value=''; $('#ag-hora').value=''; await persist(); SND.play('add'); agState.sel=$('#ag-date').value||agState.sel; renderAgenda(); App.refresh(); };
  $('#ag-add').onclick=add; $('#ag-txt').onkeydown=e=>{ if(e.key==='Enter') add(); };
  $('#ag-cat').innerHTML=Object.entries(CATS).map(([k,c])=>`<option value="${k}">${c.n}</option>`).join('');
}

/* ================================================================
   BARRA DE PENDIENTES DEL DÍA (arriba)
   ================================================================ */
function renderTicker(){
  const tr=$('#tk-track'); if(!tr) return;
  const H=hoy(), A=homeA.length?homeA:computeAvisos(), E=computeRange(H,addD(H,1),{francos:true,all:true});
  const it=[];
  A.filter(a=>a.p!=='baja').forEach(a=>it.push({c:a.p==='alta'?COL.crit:COL.warn,t:a.v,s:a.t.split('·')[0].trim(),go:a.go}));
  Object.values(E[H]||{}).forEach(x=>{ if(x.f==='rc') return; it.push({c:x.c,t:x.t+(x.f==='fr'?`: ${x.names.length}`:x.names.length>1?` · ${x.names.length}`:': '+x.names[0]),s:'Hoy',go:x.go}); });
  REC().filter(r=>!r.done&&r.fecha===H).sort((a,b)=>(a.hora||'99')<(b.hora||'99')?-1:1).forEach(r=>it.push({c:(CATS[r.cat]||CATS.recordatorio).c,t:(r.hora?r.hora+' · ':'')+r.txt,s:'Agenda',go:'v-agenda'}));
  const fm=ferEn(addD(H,1)); if(fm) it.push({c:COL.ok,t:`Mañana es feriado: ${fm.n}`,s:'Feriado',go:'v-agenda'});
  const n=it.length;
  $('#tk-n').textContent=n;
  $('#ticker').classList.toggle('calm',!A.some(a=>a.p==='alta'));
  if(!n){ tr.className='tk-track static'; tr.innerHTML='<span class="tk-it ok"><i style="background:#22c55e"></i>Sin pendientes para hoy. Todo al día ✓</span>'; return; }
  const html=it.map(x=>`<button class="tk-it" data-v="${x.go}"><i style="background:${x.c}"></i><em>${esc(x.s)}</em>${esc(x.t)}</button>`).join('<span class="tk-sep">•</span>');
  tr.className='tk-track'; tr.innerHTML=`<div class="tk-seg">${html}<span class="tk-sep">•</span></div><div class="tk-seg" aria-hidden="true">${html}<span class="tk-sep">•</span></div>`;
  requestAnimationFrame(()=>{ const w=tr.firstElementChild.scrollWidth; tr.style.animationDuration=Math.max(18,w/55)+'s'; });
}

/* ================================================================
   MI FICHADA — recordatorio de entrada y salida
   ================================================================ */
const FICH = () => (DB.fich||(DB.fich={}));
// el recordatorio de fichada es solo para Ariel (el resto del panel no ficha); en "ver como" tampoco aparece
const fichOn = () => !(window.SRV&&SRV.mode==='online') || (!!SRV.user&&SRV.user.username==='ariel'&&!SRV.imp);
const hhmmNow = () => { const d=new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function fichPendSalida(){ // último día anterior con entrada y sin salida (últimos 7 días)
  const H=hoy();
  for(let i=1;i<=7;i++){ const d=addD(H,-i), f=FICH()[d]; if(f&&f.in&&!f.out&&!f.off) return d; if(f&&(f.out||f.off)) return null; }
  return null;
}
function fichState(){
  const H=hoy(), f=FICH()[H]||{}, hr=new Date().getHours();
  return {H,f,prev:fichPendSalida(),needIn:!f.in&&!f.off,needOut:!!f.in&&!f.out&&!f.off,tarde:hr>=15};
}
function renderFich(){
  const el=$('#h-fich'); if(!el) return;
  if(!fichOn()){ el.style.display='none'; el.innerHTML=''; return; } el.style.display='';
  const s=fichState(), f=s.f, H=s.H;
  let cls='ok';
  if(s.prev||s.needIn) cls='crit'; else if(s.needOut) cls=s.tarde?'warn':'info';
  el.className='fich '+cls;
  const days=[]; for(let i=6;i>=0;i--){ const d=addD(H,-i), x=FICH()[d]||{};
    const st=x.off?'off':x.in&&x.out?'ok':x.in?'half':'none';
    days.push(`<span class="fd ${st}${d===H?' today':''}" data-tip="${esc(lblDay(d)+'\n'+(x.off?'No trabajé':x.in?`Entrada ${x.in}`+(x.out?` · Salida ${x.out}`:' · sin salida'):'Sin registro'))}"><i></i>${DOW[dObj(d).getDay()].slice(0,2)}</span>`); }
  const prev=s.prev?`<div class="fi-alert"><b>⚠ El ${DOWL[dObj(s.prev).getDay()]} ${dm(s.prev)} marcaste la entrada (${esc(FICH()[s.prev].in)}) pero no la salida.</b> ¿Fichaste la salida ese día?
      <span><button class="btn lime sm" data-fich="prevout">Sí, la fiché</button><button class="btn ghost sm" data-fich="prevolv">No la fiché: lo informo</button></span></div>`:'';
  const ent= f.off?`<div class="fi-st done"><span class="fi-ic">🏖</span><div><b>Hoy no trabajo</b><em>franco, vacaciones o licencia</em></div><button class="btn ghost sm" data-fich="undo">Deshacer</button></div>`
    : f.in?`<div class="fi-st done"><span class="fi-ic">✓</span><div><b>Entrada fichada</b><em>${esc(f.in)} hs</em></div><button class="btn ghost sm" data-fich="undoin" title="Deshacer">↺</button></div>`
    : `<div class="fi-st need"><span class="fi-ic pulse">⏱</span><div><b>¿Fichaste la entrada?</b><em>tildalo apenas pases por el reloj</em></div><button class="btn lime" data-fich="in">✓ Fiché la entrada</button><button class="btn ghost sm" data-fich="off">Hoy no trabajo</button></div>`;
  const sal= f.off?'' : f.out?`<div class="fi-st done"><span class="fi-ic">✓</span><div><b>Salida fichada</b><em>${esc(f.out)} hs${f.out==='olvido'?' (no fichada)':''}</em></div><button class="btn ghost sm" data-fich="undoout" title="Deshacer">↺</button></div>`
    : f.in?`<div class="fi-st ${s.tarde?'need':'wait'}"><span class="fi-ic${s.tarde?' pulse':''}">🚪</span><div><b>${s.tarde?'¡Acordate de fichar la salida!':'Falta fichar la salida'}</b><em>${s.tarde?'antes de irte, pasá por el reloj':'te lo recuerdo a la tarde'}</em></div><button class="btn ${s.tarde?'lime':'ghost'}" data-fich="out">✓ Fiché la salida</button></div>`
    : `<div class="fi-st wait"><span class="fi-ic">🚪</span><div><b>Salida</b><em>primero marcá la entrada</em></div></div>`;
  el.innerHTML=`<div class="fi-h"><span class="fi-t">Mi fichada · ${DOWL[dObj(H).getDay()]} ${dm(H)}</span><span class="fi-week">${days.join('')}</span></div>${prev}<div class="fi-row">${ent}${sal}</div>`;
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-fich]'); if(!b) return;
  const H=hoy(), F=FICH(), f=F[H]||(F[H]={}), a=b.dataset.fich, p=fichPendSalida();
  if(a==='in'){ f.in=hhmmNow(); delete f.off; SND.play('add'); App.toast(`Entrada registrada a las ${f.in}. Te recuerdo la salida a la tarde.`); }
  else if(a==='out'){ f.out=hhmmNow(); SND.play('add'); App.toast(`Salida registrada a las ${f.out}. ¡Buen descanso!`); }
  else if(a==='off'){ f.off=true; delete f.in; delete f.out; SND.play('ok'); }
  else if(a==='undo'){ delete f.off; }
  else if(a==='undoin'){ delete f.in; delete f.out; }
  else if(a==='undoout'){ delete f.out; }
  else if(a==='prevout'&&p){ F[p].out='s/h'; SND.play('ok'); }
  else if(a==='prevolv'&&p){ F[p].out='olvido'; REC().push({id:Date.now().toString(36),txt:`Informar salida no fichada del ${dmy(p)}`,fecha:H,hora:'',cat:'tarea',done:false}); SND.play('ok'); App.toast('Te dejé una tarea en la agenda para informarlo'); }
  // poda: guardar 60 días
  Object.keys(F).sort().slice(0,-60).forEach(k=>delete F[k]);
  await persist(); renderFich(); App.refresh();
});
// recordatorio sonoro una vez por bloque: al abrir si falta la entrada, y a partir de las 15 si falta la salida
let fichBeep={};
function fichNudge(){
  if(!fichOn()) return;
  const s=fichState(), k=s.H+(s.needIn?'in':s.needOut&&s.tarde?'out':s.prev?'prev':'');
  if(k===s.H||fichBeep[k]) return; fichBeep[k]=1;
  SND.play('notify');
  App.toast(s.prev?'⚠ Quedó una salida sin marcar de un día anterior':s.needIn?'⏱ ¿Fichaste la entrada? Tildalo en Inicio':'🚪 Acordate de fichar la salida',true);
}

/* ================================================================
   ENTREGA DE INDUMENTARIA
   ================================================================ */
const ROPA = () => DB.ropa||null;
function ropaCampania(name){ return name.replace(/\.[a-z]+$/i,'').replace(/^\d+[-_]?/,'').replace(/_+/g,' ').replace(/\s+/g,' ').trim()
  .toLowerCase().replace(/^control /,'').replace(/^./,c=>c.toUpperCase()); }
function parseRopa(wb,fileName){
  let best=null;
  for(const sn of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:false});
    let hi=-1;
    for(let i=0;i<Math.min(rows.length,30);i++){ const h=(rows[i]||[]).map(c=>String(c||'').trim());
      if(h.some(x=>/^legajo/i.test(x))&&h.some(x=>/^estado/i.test(x))&&h.some(x=>/apellido|nombre/i.test(x))){hi=i;break} }
    if(hi<0) continue;
    const head=rows[hi].map(c=>String(c||'').trim()), f=re=>head.findIndex(h=>re.test(h));
    const c={leg:f(/^legajo/i),nom:f(/apellido|nombre/i),cuil:f(/cuil|dni/i),tipo:f(/^tipo|modalidad|contrat/i),turno:f(/turno/i),
      sector:f(/sector/i),est:f(/^estado/i),seg:f(/seg/i),fecha:f(/fecha.*entreg|entregad[oa] el/i)};
    const known=new Set(Object.values(c).filter(i=>i>=0));
    const prendas=head.map((h,i)=>(!known.has(i)&&h&&i<c.est)?[i,h]:null).filter(Boolean);
    let titulo=''; for(let i=hi-1;i>=0;i--){ const t=(rows[i]||[]).find(x=>typeof x==='string'&&/[a-z]{4}/i.test(x)&&!/^(estado|entregado|pendiente|totales)$/i.test(x.trim())); if(t){ titulo=t.trim(); break; } }
    const out=[];
    for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue;
      const leg=String(r[c.leg]==null?'':r[c.leg]).trim().replace(/\.0+$/,''), nom=String(r[c.nom]==null?'':r[c.nom]).trim();
      if(!leg||!nom||/legajo/i.test(leg)) continue;
      const es=String(r[c.est]==null?'':r[c.est]).trim();
      const items={}; prendas.forEach(([j,h])=>{ const v=r[j]; if(v!=null&&String(v).trim()!=='') items[h]=String(v).trim(); });
      out.push({legajo:leg,nombre:nom,cuil:c.cuil>=0?String(r[c.cuil]||''):'',tipo:c.tipo>=0?String(r[c.tipo]||'').trim()||'Sin tipo':'Sin tipo',
        turno:c.turno>=0?String(r[c.turno]||'').trim():'',sector:c.sector>=0?String(r[c.sector]||'').trim().replace(/^<$/,''):'',
        est:/entreg/i.test(es)?'E':/pend/i.test(es)?'P':'',seg:c.seg>=0&&r[c.seg]!=null&&String(r[c.seg]).trim()!==''&&String(r[c.seg]).trim()!=='0',
        fecha:c.fecha>=0?excelDateToISO(r[c.fecha])||'':'',items});
    }
    if(!best||out.length>best.rows.length) best={rows:out,prendas:prendas.map(p=>p[1]),titulo,hoja:sn};
  }
  if(!best||!best.rows.length) throw new Error('No encontré una hoja con LEGAJO, APELLIDO Y NOMBRE y ESTADO.');
  return best;
}
async function loadRopa(f){
  if(typeof XLSX==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  try{
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
    const r=parseRopa(wb,f.name), prev=ROPA();
    const e=r.rows.filter(x=>x.est==='E').length, t=r.rows.filter(x=>x.est).length;
    const hist=((prev&&prev.hist)||[]).concat({at:new Date().toISOString(),e,t}).slice(-40);
    DB.ropa=Object.assign(r,{file:f.name,campania:ropaCampania(f.name),at:new Date().toISOString(),hist});
    // las marcas hechas en el panel que el Excel ya trae como entregadas se limpian
    const ov=DB.ropaOv||{}; r.rows.forEach(x=>{ if(x.est==='E') delete ov[x.legajo]; }); DB.ropaOv=ov;
    await persist(); App.toast(`Indumentaria: ${e} de ${t} entregados (${t?Math.round(e/t*100):0}%)`);
    renderRopa(); App.refresh();
  }catch(err){ App.toast('No pude leer la planilla de indumentaria: '+err.message,true); }
}
/* --- talles y etapas: declaración de talles → preparado → entregado --- */
const PR=[['campera','Campera',/campera/],['buzo','Buzo',/buzo/],['polar','Polar',/polar/],['pantalon','Pantalón',/pantal/],['chomba','Chomba',/chomba/],
  ['remera','Remera',/remera/],['calza','Calza térmica',/calza/],['camiseta','Camiseta térmica',/camiseta/],['botin','Botín',/bot[ií]n|zapat|calzado/]];
const PRS={campera:'Camp.',buzo:'Buzo',polar:'Polar',pantalon:'Pant.',chomba:'Chom.',remera:'Rem.',calza:'Calza',camiseta:'Cam. t.',botin:'Botín'};
const ropaEst = x => (DB.ropaOv&&DB.ropaOv[x.legajo])?'E':x.est;
const RTA = () => DB.ropaTalles||(DB.ropaTalles={});
function ropaT(x){
  const t={}, it=x.items||{};
  for(const h in it){ const p=PR.find(p=>p[2].test(h.toLowerCase())); if(p&&it[h]) t[p[0]]=String(it[h]); }
  const m=RTA()[x.legajo]; if(m) for(const k in m.t){ if(m.t[k]) t[k]=m.t[k]; }
  return t;
}
const hasT = x => Object.keys(ropaT(x)).length>0;
const ropaPrep = x => !!(DB.ropaPrep&&DB.ropaPrep[x.legajo]);
const ropaStage = x => ropaEst(x)==='E'?'E':ropaPrep(x)?'R':hasT(x)?'T':'S';
const STG={S:['Sin talles','#64748b'],T:['Talles declarados','#0b94cf'],R:['Preparado','#d97706'],E:['Entregado','#22c55e']};
function ropaStats(rows){ rows=rows||(ROPA()?ROPA().rows:[]);
  const con=rows.filter(x=>ropaEst(x)), t=con.length, e=con.filter(x=>ropaEst(x)==='E').length, st={S:0,T:0,R:0,E:0};
  con.forEach(x=>st[ropaStage(x)]++);
  return {t,e,p:t-e,pct:t?e/t*100:0,sin:rows.filter(x=>!ropaEst(x)).length,panel:rows.filter(x=>x.est!=='E'&&ropaEst(x)==='E').length,
    st,decl:con.filter(hasT).length,prep:rows.filter(x=>ropaPrep(x)&&ropaEst(x)!=='E').length}; }
let ropaState={est:'',tipo:'',q:''};

/* --- archivo de talles (formulario) --- */
const NT = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z ]/g,' ').split(/\s+/).filter(w=>w.length>1);
const dniOf = s => { const d=String(s==null?'':s).replace(/\D/g,''); return (d.length===11?d.slice(2,10):d).replace(/^0+/,''); };
function normTalle(v){ let s=String(v==null?'':v).trim(); if(!s) return ''; s=s.replace(/^talle\s*/i,'').replace(/\s+/g,' ').trim(); return /^[a-z]/i.test(s)?s.toUpperCase():s; }
function parseTalles(rows){
  let hi=-1; for(let i=0;i<Math.min(rows.length,10);i++){ const h=(rows[i]||[]).map(c=>String(c||'')); if(h.some(x=>/apellido|nombre/i.test(x))&&h.some(x=>/talle/i.test(x))){hi=i;break} }
  if(hi<0) throw new Error('No encontré las columnas de nombre y talles.');
  const head=rows[hi].map(c=>String(c||'').trim()), f=re=>head.findIndex(h=>re.test(h));
  const cn=f(/apellido|nombre/i), cd=f(/dni|documento|cuil/i), cf=f(/marca temporal|fecha/i);
  const cp=[]; head.forEach((h,i)=>{ if(!/talle|numero/i.test(h)) return; const p=PR.find(p=>p[2].test(h.toLowerCase())); if(p) cp.push([i,p[0]]); });
  if(!cp.length) throw new Error('No reconocí ninguna prenda en las columnas de talles.');
  const out=[];
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r) continue; const nombre=String(r[cn]||'').trim(); if(!nombre) continue;
    const t={}; cp.forEach(([j,k])=>{ const v=normTalle(r[j]); if(v) t[k]=v; });
    const at=r[cf] instanceof Date?r[cf].toISOString():String(r[cf]||'');
    out.push({nombre,dni:cd>=0?dniOf(r[cd]):'',at,t}); }
  return out.sort((a,b)=>a.at<b.at?-1:1);
}
function matchRopa(resp,rows){
  if(resp.dni){ const x=rows.find(x=>dniOf(x.cuil)===resp.dni); if(x) return [x,'dni']; }
  const tk=new Set(NT(resp.nombre)); if(tk.size<2) return [null];
  const c=rows.filter(x=>NT(x.nombre).filter(w=>tk.has(w)).length>=2);
  return c.length===1?[c[0],'nombre']:[null];
}
async function loadTalles(f){
  if(typeof XLSX==='undefined'){ App.toast('No cargó la librería de Excel.',true); return; }
  const R=ROPA(); if(!R){ App.toast('Primero subí el control de entrega: los talles se cruzan contra esa lista.',true); return; }
  try{
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
    let resp=null, err=null;
    for(const sn of wb.SheetNames){ try{ resp=parseTalles(XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null,blankrows:false})); break; }catch(e){ err=e; } }
    if(!resp) throw err||new Error('sin datos');
    const T=RTA(), sin=[], hit=new Set(); let nd=0, nn=0, keep=0;
    resp.forEach(r=>{ const [x,by]=matchRopa(r,R.rows);
      if(!x){ sin.push({nombre:r.nombre,dni:r.dni,at:r.at,t:r.t}); return; }
      const cur=T[x.legajo];
      if(cur&&cur.src==='manual'&&cur.at>r.at){ keep++; return; }   // lo cargado a mano después manda
      T[x.legajo]={t:r.t,src:'form',at:r.at,nf:r.nombre,by}; hit.add(x.legajo); by==='dni'?nd++:nn++; });
    // una misma persona que respondió dos veces: queda la última respuesta
    const sinU={}; sin.forEach(s=>{ sinU[(s.dni||'')+'|'+NT(s.nombre).join(' ')]=s; });
    DB.ropaTallesMeta={file:f.name,at:new Date().toISOString(),resp:resp.length,personas:hit.size,dni:nd,nombre:nn,keep,sin:Object.values(sinU)};
    await persist(); SND.play('ok');
    App.toast(`Talles: ${hit.size} persona(s) asignadas${Object.keys(sinU).length?` · ${Object.keys(sinU).length} respuesta(s) sin coincidencia`:''}`);
    renderRopa(); App.refresh();
  }catch(err){ App.toast('No pude leer la lista de talles: '+err.message,true); }
}

/* --- dibujo --- */
function ring(pct,size=190){
  const r=size/2-14, C=2*Math.PI*r, off=C*(1-pct/100);
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <defs><linearGradient id="gRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(120,160,210,.14)" stroke-width="14"/>
    <circle class="ring-v" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="url(#gRing)" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="--c:${C.toFixed(1)};--o:${off.toFixed(1)}" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="48%" text-anchor="middle" font-family="IBM Plex Mono" font-size="${size*.2}" font-weight="600" fill="#e6edf7">${Math.round(pct)}%</text>
    <text x="50%" y="63%" text-anchor="middle" font-family="IBM Plex Mono" font-size="${size*.058}" letter-spacing="2" fill="#9aa8bf">ENTREGADO</text></svg>`;
}
const tallesChips = t => { const k=PR.map(p=>p[0]).filter(k=>t[k]); return k.length?k.map(k=>`<em title="${esc(PR.find(p=>p[0]===k)[1])}">${PRS[k]} <b>${esc(t[k])}</b></em>`).join(''):'<span class="ro-not">sin talles</span>'; };
const stepper = x => { const s=ropaStage(x), lv={S:0,T:1,R:2,E:3}[s];
  return `<div class="ro-step" title="${esc(STG[s][0])}">${['Talles','Preparado','Entregado'].map((l,i)=>`<span class="${lv>i?'on':''}${lv===i+1?' cur':''}"><i></i>${l}</span>`).join('')}</div>`; };
function ropaFilter(x){ const e=ropaEst(x), s=ropaStage(x), f=ropaState.est;
  if(!f) return true; if(f==='X') return !e; if(!e) return false;
  if(f==='pend') return s!=='E'; return s===f; }
function renderRopa(){
  if(!$('#v-ropa')) return;
  renderUpd();
  const R=ROPA(), rows=R?R.rows:[], S=ropaStats(rows), M=DB.ropaTallesMeta;
  $('#ro-tit').textContent=R?(R.campania||'Entrega de indumentaria')+(R.titulo?' · '+R.titulo:''):'Cargá la planilla de control de entrega';
  $('#ro-ring').innerHTML=ring(S.pct);
  $('#ro-big').innerHTML=R?`<div class="ro-n"><b>${S.e}</b> de <b>${S.t}</b> entregados</div><div class="ro-s">Faltan <b>${S.p}</b> · ${S.st.S} de ellos sin talles · ${S.sin?`${S.sin} sin estado en la planilla · `:''}${S.panel?`${S.panel} marcados en el panel · `:''}${rows.filter(x=>x.seg).length} con segunda entrega</div>
      <div class="ro-bar"><i style="width:${S.pct}%"></i></div>`:'<div class="ro-s">Subí el Excel de control de entrega para ver el avance.</div>';
  // etapas
  const st=S.st, tot=S.t||1;
  $('#ro-funnel').innerHTML=R?`<div class="ro-fun">${['S','T','R','E'].map((k,i)=>`<button class="ro-fs" data-rofil="${k}" style="--c:${STG[k][1]}"><span>${i?'<i class="arr">›</i>':''}${STG[k][0]}</span><b>${st[k]}</b><em>${Math.round(st[k]/tot*100)}% · ${k==='S'?'faltan entregar y no declararon':k==='T'?'falta preparar':k==='R'?'falta entregar':'ya recibieron'}</em></button>`).join('')}</div>
    <div class="ro-stack">${['E','R','T','S'].map(k=>`<i style="width:${st[k]/tot*100}%;background:${STG[k][1]}" data-tip="${esc(STG[k][0]+': '+st[k])}"></i>`).join('')}</div>
    <p class="ro-s" style="margin-top:8px">${S.decl} de ${S.t} personas tienen talles declarados (incluye entregados)${M?` · formulario: ${M.personas} asignadas de ${M.resp} respuestas (${M.dni} por DNI, ${M.nombre} por nombre)`:''}.</p>`:'';
  // por tipo
  const tipos=uniq(rows.map(x=>x.tipo)).sort();
  $('#ro-tipos').innerHTML=tipos.length?tipos.map(t=>{ const s=ropaStats(rows.filter(x=>x.tipo===t));
    return `<div class="ro-t" data-tip="${esc(`${t}\n${s.e} entregados · ${s.st.R} preparados · ${s.st.T} con talles · ${s.st.S} sin talles`)}"><div class="ro-tn"><b>${esc(t)}</b><span>${s.e}/${s.t} · <b>${Math.round(s.pct)}%</b></span></div>
      <div class="ro-sb">${['E','R','T','S'].map(k=>`<i style="width:${s.t?s.st[k]/s.t*100:0}%;background:${STG[k][1]}"></i>`).join('')}</div></div>`; }).join('')
    +`<div class="legend" style="margin-top:10px">${['E','R','T','S'].map(k=>`<span><i style="background:${STG[k][1]}"></i>${STG[k][0]}</span>`).join('')}</div>`
    :'<div class="empty">Sin datos.</div>';
  // avance
  const H=(R&&R.hist)||[];
  if(H.length>=2) areaChart('#ro-evo',H.map(h=>({l:dm(isoOf(new Date(h.at))),v:h.t?Math.round(h.e/h.t*100):0,tip:`${fmtAt(h.at)}\n${h.e} de ${h.t} entregados (${h.t?Math.round(h.e/h.t*100):0}%)`})));
  else $('#ro-evo').innerHTML='<div class="empty">El avance se va dibujando cada vez que subís una versión nueva de la planilla.</div>';
  // talles por prenda de quienes faltan entregar
  const pend=rows.filter(x=>ropaEst(x)&&ropaEst(x)!=='E'), keys=PR.map(p=>p[0]).filter(k=>pend.some(x=>ropaT(x)[k]));
  $('#ro-talles').innerHTML=!keys.length?'<div class="empty">Todavía no hay talles para los que faltan entregar. Subí la lista de talles del formulario o cargalos a mano.</div>'
    : `<p class="ro-s" style="margin:0 0 6px">Cantidades para los ${pend.filter(hasT).length} pendientes con talles (${pend.filter(x=>!hasT(x)).length} sin talles).</p>`+
      keys.map(k=>{ const c={}; pend.forEach(x=>{ const v=ropaT(x)[k]; if(v) c[v]=(c[v]||0)+1; });
        return `<div class="ro-pr"><b>${esc(PR.find(p=>p[0]===k)[1])}</b><span>${Object.keys(c).sort((a,b)=>(parseFloat(a)||0)-(parseFloat(b)||0)||talleOrd(a)-talleOrd(b)||a.localeCompare(b)).map(t=>`<em>${esc(t)} <b>${c[t]}</b></em>`).join('')}</span></div>`; }).join('');
  // respuestas sin coincidencia
  const sinM=(M&&M.sin)||[];
  $('#ro-sinwrap').style.display=sinM.length?'':'none';
  if(sinM.length){ const opts=rows.filter(x=>!hasT(x)).sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x=>`<option value="${esc(x.legajo)}">${esc(x.nombre)} · ${esc(x.legajo)}</option>`).join('');
    $('#ro-sin').innerHTML=sinM.map((s,i)=>`<div class="ro-sin"><div><b>${esc(s.nombre)}</b><span>DNI ${esc(s.dni||'—')} · ${tallesChips(s.t)}</span></div>
      <select data-rosinsel="${i}"><option value="">Asignar a…</option>${opts}</select><button class="btn ghost sm" data-rosinok="${i}">Asignar</button><button class="btn ghost sm" data-rosindel="${i}" title="Descartar">×</button></div>`).join(''); }
  // filtros + tabla
  $('#ro-tipo').innerHTML='<option value="">Todos</option>'+tipos.map(t=>`<option>${esc(t)}</option>`).join(''); $('#ro-tipo').value=ropaState.tipo;
  $('#ro-est').value=ropaState.est;
  const q=ropaState.q.trim().toLowerCase();
  const ord={S:0,T:1,R:2,E:3};
  const L=rows.filter(x=>(!ropaState.tipo||x.tipo===ropaState.tipo)&&ropaFilter(x)&&(!q||x.nombre.toLowerCase().includes(q)||x.legajo.includes(q)))
    .sort((a,b)=>ord[ropaStage(a)]-ord[ropaStage(b)]||a.nombre.localeCompare(b.nombre));
  $('#ro-n').textContent=`${L.length} persona(s)`;
  $('#ro-table').innerHTML=`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Talles declarados</th><th>Etapa</th><th>Preparado</th><th>Entregado</th><th></th></tr></thead>`+
    (L.length?'<tbody>'+L.map(x=>{ const e=ropaEst(x), pm=x.est!=='E'&&e==='E', m=RTA()[x.legajo];
      return `<tr><td class="mono">${esc(x.legajo)}</td><td><b style="font-weight:500">${esc(x.nombre)}</b>${x.seg?' <span class="tag nov">2ª entrega</span>':''}<div class="ro-sub">${esc([x.tipo,x.turno,x.sector].filter(Boolean).join(' · '))}${!e?' · <span style="color:#fcd34d">sin estado en la planilla</span>':''}</div></td>
        <td><div class="ro-chips">${tallesChips(ropaT(x))}</div>${m?`<div class="ro-sub">${m.src==='manual'?'cargado a mano':'formulario'}${m.at?' · '+esc(String(m.at).slice(0,10).split('-').reverse().join('/')):''}${m.by==='nombre'?' · por nombre':''}</div>`:''}</td>
        <td>${stepper(x)}</td>
        <td>${e==='E'?'<span class="ro-sub">—</span>':`<label class="chk"><input type="checkbox" data-roprep="${esc(x.legajo)}" ${ropaPrep(x)?'checked':''}> listo</label>`}</td>
        <td>${x.est==='E'?'<span class="tag ok">en el Excel</span>':`<label class="chk"><input type="checkbox" data-ropaok="${esc(x.legajo)}" ${pm?'checked':''}> entregado</label>`}</td>
        <td><button class="btn ghost sm" data-rotal="${esc(x.legajo)}">✎ Talles</button></td></tr>`; }).join('')+'</tbody>'
      :`<tbody><tr><td colspan="7"><div class="empty">${R?'Nadie con estos filtros.':'Sin planilla cargada.'}</div></td></tr></tbody>`);
  const nb=$('#nb-ro'); if(nb){ nb.textContent=R?Math.round(S.pct)+'%':''; nb.className='nb'; }
}
const talleOrd = t => { const o=['XXS','XS','S','M','L','XL','XXL','XXXL','3XL','4XL','5XL']; const i=o.indexOf(String(t).toUpperCase()); return i<0?99:i; };
App.renderRopa=renderRopa;

/* --- editor de talles --- */
let roEdit=null;
function openTalles(leg){
  const R=ROPA(); const x=R&&R.rows.find(r=>r.legajo===leg); if(!x) return;
  roEdit=leg; const t=ropaT(x), m=RTA()[leg];
  $('#ro-dlg-t').textContent=x.nombre; $('#ro-dlg-s').textContent=`Legajo ${x.legajo} · ${x.tipo}${m?` · ${m.src==='manual'?'cargado a mano':'del formulario'}`:''}`;
  $('#ro-dlg-f').innerHTML=PR.map(([k,n])=>`<div class="field"><label>${n}</label><input type="text" data-rok="${k}" value="${esc(t[k]||'')}" list="${k==='botin'||k==='pantalon'?'ro-dl-num':'ro-dl-let'}"></div>`).join('');
  $('#ro-dlg').classList.add('on'); SND.play('open'); setTimeout(()=>{ const i=$('#ro-dlg-f input'); if(i) i.focus(); },50);
}
async function saveTalles(clear){
  if(!roEdit) return; const T=RTA();
  if(clear) delete T[roEdit];
  else{ const t={}; document.querySelectorAll('#ro-dlg-f [data-rok]').forEach(i=>{ const v=normTalle(i.value); if(v) t[i.dataset.rok]=v; });
    T[roEdit]={t,src:'manual',at:new Date().toISOString()}; }
  await persist(); SND.play(clear?'close':'add'); $('#ro-dlg').classList.remove('on'); roEdit=null; renderRopa(); App.refresh();
}

function hookRopa(){
  $('#ro-pick').onclick=()=>$('#ro-file').click();
  $('#ro-file').onchange=e=>{ if(e.target.files[0]) loadRopa(e.target.files[0]); e.target.value=''; };
  $('#ro-tpick').onclick=()=>$('#ro-tfile').click();
  $('#ro-tfile').onchange=e=>{ if(e.target.files[0]) loadTalles(e.target.files[0]); e.target.value=''; };
  [['#ro-drop',loadRopa],['#ro-tdrop',loadTalles]].forEach(([s,fn])=>{ const z=$(s);
    ['dragenter','dragover'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.add('hot')}));
    ['dragleave','drop'].forEach(v=>z.addEventListener(v,e=>{e.preventDefault();z.classList.remove('hot')}));
    z.addEventListener('drop',e=>{ if(e.dataTransfer.files[0]) fn(e.dataTransfer.files[0]); }); });
  $('#ro-est').onchange=e=>{ ropaState.est=e.target.value; renderRopa(); };
  $('#ro-tipo').onchange=e=>{ ropaState.tipo=e.target.value; renderRopa(); };
  let qt; $('#ro-q').oninput=e=>{ clearTimeout(qt); qt=setTimeout(()=>{ ropaState.q=e.target.value; renderRopa(); },200); };
  $('#v-ropa').addEventListener('change',async e=>{
    const c=e.target.closest('[data-ropaok]');
    if(c){ DB.ropaOv=DB.ropaOv||{}; if(c.checked){ DB.ropaOv[c.dataset.ropaok]={at:new Date().toISOString()}; SND.play('add'); } else delete DB.ropaOv[c.dataset.ropaok];
      await persist(); renderRopa(); App.refresh(); return; }
    const p=e.target.closest('[data-roprep]');
    if(p){ DB.ropaPrep=DB.ropaPrep||{}; if(p.checked){ DB.ropaPrep[p.dataset.roprep]={at:new Date().toISOString()}; SND.play('add'); } else delete DB.ropaPrep[p.dataset.roprep];
      await persist(); renderRopa(); App.refresh(); }
  });
  document.addEventListener('click',async e=>{
    const t=e.target.closest('[data-rotal]'); if(t){ openTalles(t.dataset.rotal); return; }
    const f=e.target.closest('[data-rofil]'); if(f){ ropaState.est=f.dataset.rofil==='E'?'E':f.dataset.rofil; renderRopa(); $('#ro-table').scrollIntoView({behavior:'smooth',block:'start'}); return; }
    const a=e.target.closest('[data-rosinok]'); if(a){ const i=+a.dataset.rosinok, sel=document.querySelector(`[data-rosinsel="${i}"]`), M=DB.ropaTallesMeta;
      if(!sel||!sel.value){ App.toast('Elegí a quién asignar esos talles',true); return; }
      const s=M.sin[i]; RTA()[sel.value]={t:s.t,src:'form',at:s.at,nf:s.nombre,by:'manual'}; M.sin.splice(i,1); await persist(); SND.play('add'); renderRopa(); App.refresh(); return; }
    const d=e.target.closest('[data-rosindel]'); if(d){ DB.ropaTallesMeta.sin.splice(+d.dataset.rosindel,1); await persist(); renderRopa(); }
  });
  $('#ro-dlg-save').onclick=()=>saveTalles(false);
  $('#ro-dlg-clear').onclick=()=>{ if(confirm('¿Borrar los talles de esta persona?')) saveTalles(true); };
  $('#ro-dlg-close').onclick=()=>{ $('#ro-dlg').classList.remove('on'); roEdit=null; };
  $('#ro-dlg').addEventListener('click',e=>{ if(e.target.id==='ro-dlg'){ $('#ro-dlg').classList.remove('on'); roEdit=null; } });
  $('#ro-dlg-f').addEventListener('keydown',e=>{ if(e.key==='Enter') saveTalles(false); });
  const rowsCsv=(L,stage)=>{ const keys=PR.map(p=>p[0]); const out=[['Legajo','Apellido y nombre','Tipo','Turno','Sector',...PR.map(p=>p[1]),'Etapa']];
    L.forEach(x=>{ const t=ropaT(x); out.push([x.legajo,x.nombre,x.tipo,x.turno,x.sector,...keys.map(k=>t[k]||''),STG[ropaStage(x)][0]]); }); return out; };
  $('#ro-csv').onclick=()=>{ const R=ROPA(); if(!R){ App.toast('Sin planilla cargada',true); return; }
    download(csv(rowsCsv(R.rows.filter(x=>ropaEst(x)&&ropaEst(x)!=='E'))),`indumentaria_pendientes_${todayISO()}.csv`,'text/csv;charset=utf-8'); };
  $('#ro-prep-csv').onclick=()=>{ const R=ROPA(); if(!R){ App.toast('Sin planilla cargada',true); return; }
    const L=R.rows.filter(x=>ropaStage(x)==='T').sort((a,b)=>a.tipo.localeCompare(b.tipo)||a.nombre.localeCompare(b.nombre));
    if(!L.length){ App.toast('No hay nadie con talles pendiente de preparar',true); return; }
    download(csv(rowsCsv(L)),`indumentaria_para_preparar_${todayISO()}.csv`,'text/csv;charset=utf-8'); App.toast(`Lista de preparación: ${L.length} persona(s)`); };
  $('#ro-copy').onclick=()=>{ const R=ROPA(); if(!R){ App.toast('Sin planilla cargada',true); return; } const S=ropaStats();
    const P=R.rows.filter(x=>ropaEst(x)&&ropaEst(x)!=='E').sort((a,b)=>({S:0,T:1,R:2}[ropaStage(a)]-{S:0,T:1,R:2}[ropaStage(b)])||a.nombre.localeCompare(b.nombre));
    $('#ro-mailwrap').innerHTML=`<div class="mailbox" id="ro-mail"><p>Buenos días,<br>Avance de ${esc(R.campania||'entrega de indumentaria')}: <b>${S.e} de ${S.t} entregados (${Math.round(S.pct)}%)</b>.
      Faltan ${S.p}: ${S.st.R} preparados, ${S.st.T} con talles para preparar y ${S.st.S} sin talles declarados.</p>
      <table><thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Tipo</th><th>Etapa</th></tr></thead><tbody>${P.map(x=>`<tr><td>${esc(x.legajo)}</td><td class="l">${esc(x.nombre)}</td><td>${esc(x.tipo)}</td><td>${STG[ropaStage(x)][0]}</td></tr>`).join('')}</tbody></table><p>Saludos.</p></div>`;
    copiar('#ro-mail','Avance y pendientes copiados — pegalos en el mail'); };
}

/* ================================================================
   VACACIONES — saldo sin planificar
   ================================================================ */
function vacPlan(){
  const P=(DB.vac&&DB.vac.people)||[];
  return P.map(p=>Object.assign({},p,{saldo:Math.max(0,(p.diasAno||0)-(p.plan||0))})).filter(p=>p.diasAno>0&&p.saldo>0).sort((a,b)=>b.saldo-a.saldo||a.nombre.localeCompare(b.nombre));
}
function renderVacPlan(){
  const el=$('#x-vac-plan'); if(!el) return;
  const P=(DB.vac&&DB.vac.people)||[], L=vacPlan(), sin=L.filter(p=>!p.plan).length;
  $('#x-vac-plan-m').textContent=P.length?`${L.length} de ${P.length} personas con días sin planificar · ${sin} sin ninguna salida · ${fmtN(L.reduce((a,p)=>a+p.saldo,0))} días en total`:'';
  el.innerHTML=`<thead><tr><th>Legajo</th><th>Apellido y nombre</th><th>Categoría</th><th style="text-align:center">Días del año</th><th style="text-align:center">Planificados</th><th style="text-align:center">Sin planificar</th><th>Avance</th></tr></thead>`+
    (L.length?'<tbody>'+L.map(p=>`<tr><td class="mono">${esc(p.legajo)}</td><td>${esc(p.nombre)}</td><td style="font-size:12.5px;color:var(--text2)">${esc(p.cat)}</td>
      <td class="mono" style="text-align:center">${p.diasAno}</td><td class="mono" style="text-align:center">${p.plan}</td>
      <td style="text-align:center"><span class="tag ${p.plan?'sinf':'tarde'}">${p.saldo}</span></td>
      <td style="min-width:140px"><div class="hbar"><i style="width:${Math.min(100,p.plan/p.diasAno*100)}%;background:linear-gradient(90deg,#0b94cf,#22d3ee)"></i></div></td></tr>`).join('')+'</tbody>'
      :`<tbody><tr><td colspan="7"><div class="empty">${P.length?'Todos tienen sus días planificados.':'El archivo de vacaciones no trae los días anuales por persona.'}</div></td></tr></tbody>`);
}

/* ================================================================
   PROTECTOR DE PANTALLA / MODO REPOSO
   ================================================================ */
const LKK='rrhh-ic-lock';
const LK_DEF={on:true,min:5,alAbrir:false,anim:'aurora',hash:null};
let LK=Object.assign({},LK_DEF);
try{ LK=Object.assign(LK,JSON.parse(localStorage.getItem(LKK)||'{}')); }catch(e){}
const saveLK=()=>{ try{ localStorage.setItem(LKK,JSON.stringify(LK)); }catch(e){} };
async function hashPass(p){
  const s='rrhh-ic|'+p;
  try{ if(window.crypto&&crypto.subtle){ const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); } }catch(e){}
  let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return 'f'+(h>>>0).toString(16);
}
const lkOnline=()=>!!(window.SRV&&SRV.mode==='online'&&SRV.user&&SRV.api);
// con servidor, el bloqueo se destraba con la MISMA contraseña con la que el usuario entra al panel
async function passOk(p){
  if(lkOnline()){
    try{ const r=await SRV.api('POST','/api/auth/verify',{password:p}); return !!r.ok; }
    catch(e){ if(e.status===401){ try{ sessionStorage.removeItem(LKK); }catch(x){} location.reload(); return false; } $('#lk-err').textContent=e.message; throw e; }
  }
  if(!LK.hash) LK.hash=await hashPass('Gestion2026'), saveLK(); return (await hashPass(p))===LK.hash; }

let locked=false, lastAct=Date.now(), lkRaf=0;
const LK_EV=['pointermove','pointerdown','keydown','wheel','touchstart','scroll'];
LK_EV.forEach(ev=>addEventListener(ev,()=>{ if(!locked) lastAct=Date.now(); },{passive:true,capture:true}));
setInterval(()=>{ if(!locked&&LK.on&&Date.now()-lastAct>LK.min*60e3) lockNow('inactividad'); },5000);

function lockNow(why){
  if(locked) return;
  if(window.SRV&&SRV.mode&&SRV.mode!=='online') return;   // sin sesión iniciada no hay nada que bloquear: manda el login
  locked=true;
  try{ sessionStorage.setItem(LKK,'1'); }catch(e){}
  closeIntro(); $('#m365dlg').classList.remove('on'); $('#modal').classList.remove('on');
  const L=$('#lock');
  L.querySelector('.lk-logo').src=($('.brand img')||{}).src||'';
  $('#lk-why').textContent= why==='inactividad'?`Bloqueado por ${LK.min} min sin actividad`:why==='inicio'?'Panel protegido':'Modo reposo';
  if(lkOnline()){ const n=(SRV.imp&&SRV.imp.nombre)||SRV.user.nombre||SRV.user.username||''; const pila=(n.split(',')[1]||n).trim().split(' ')[0]||n;
    L.querySelector('.lk-user span').textContent=(pila[0]||'?').toUpperCase(); L.querySelector('.lk-user b').textContent=pila;
    $('#lk-pass').placeholder='Tu contraseña del panel'; }
  if(!lkOnline()){ L.querySelector('.lk-user span').textContent=NOMBRE()[0]||''; L.querySelector('.lk-user b').textContent=NOMBRE(); }
  $('#lk-pass').value=''; $('#lk-err').textContent=''; L.classList.remove('ask');
  L.classList.add('on'); document.body.classList.add('is-locked');
  BG.stop(); Orb.active(false);
  lkTick(); lkAnim.start();
  SND.play('close');
}
async function unlockTry(){
  const p=$('#lk-pass').value;
  if(!p){ $('#lk-pass').focus(); return; }
  let ok=false; try{ ok=await passOk(p); }catch(e){ return; }
  if(ok){
    locked=false; lastAct=Date.now();
    try{ sessionStorage.removeItem(LKK); }catch(e){}
    const L=$('#lock'); L.classList.add('out');
    setTimeout(()=>{ L.classList.remove('on','out','ask'); lkAnim.stop(); },600);
    document.body.classList.remove('is-locked');
    if(UI.bg) BG.start(); Orb.active(curView==='v-home');
    welcome();
  } else {
    const f=$('#lk-form'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
    $('#lk-err').textContent='Contraseña incorrecta'; $('#lk-pass').select(); SND.play('err');
  }
}
function lkAsk(){ const L=$('#lock'); if(!L.classList.contains('ask')){ L.classList.add('ask'); SND.play('open'); } setTimeout(()=>$('#lk-pass').focus(),60); }
function lkTick(){ if(!locked) return; const d=new Date();
  $('#lk-time').textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('#lk-date').textContent=`${DOWL[d.getDay()][0].toUpperCase()+DOWL[d.getDay()].slice(1)} ${d.getDate()} de ${MESL[d.getMonth()]}`;
  setTimeout(lkTick,(60-d.getSeconds())*1000+50); }

function welcome(){
  const H=hoy(), d=new Date(), hr=d.getHours(), online=window.SRV&&SRV.mode==='online', adm=!online||SRV.user.rol==='admin';
  const sal=hr<6?'Buenas noches':hr<13?'Buen día':hr<20?'Buenas tardes':'Buenas noches';
  const cards=[], items=[];
  // clima
  try{ if(WX&&WX.d&&WX.d.current){ const c=WX.d.current, dd=WX.d.daily, [ic,tx]=WMO(c.weather_code);
    cards.push(`<div class="wl-c"><i>${ic}</i><b>${Math.round(c.temperature_2m)}°</b><span>${tx}${dd?` · máx ${Math.round(dd.temperature_2m_max[0])}°`:''}${dd&&dd.precipitation_probability_max[0]>=40?` · 💧${dd.precipitation_probability_max[0]}%`:''}</span></div>`); } }catch(e){}
  // menú de hoy
  try{ const M=typeof mnHoy==='function'?mnHoy():null;
    cards.push(`<div class="wl-c"><i>🍽</i><b>Plato del día</b><span>${M&&M.m?esc(M.m)+([M.o1,M.o2,M.o3].filter(Boolean).length?` · y ${[M.o1,M.o2,M.o3].filter(Boolean).length} opciones más`:''):d.getDay()===0?'Hoy es domingo':'Todavía no se cargó'}</span></div>`); }catch(e){}
  // cumpleaños
  try{ if(DB.cumple&&typeof cuRows==='function'){ const R=cuRows(+H.slice(5,7)).filter(r=>r.fecha>=H&&r.fecha<=addD(H,7)), hoyC=R.filter(r=>r.fecha===H);
    if(R.length) cards.push(`<div class="wl-c"><i>🎂</i><b>${hoyC.length?'Cumple hoy':'Cumpleaños'}</b><span>${hoyC.length?hoyC.slice(0,3).map(r=>esc(shortName(r.nombre))).join(', '):`${R.length} esta semana`}</span></div>`); } }catch(e){}
  // lo de cada uno
  try{ if(adm&&fichOn()){ const fs=fichState(); if(fs.needIn) items.push('⏱ Todavía no marcaste la entrada'); else if(fs.needOut&&fs.tarde) items.push('🚪 Acordate de fichar la salida');
      const alta=computeAvisos().filter(a=>a.p==='alta').length; items.push(alta?`<b>${alta}</b> tema(s) urgente(s) para hoy`:'Nada urgente pendiente');
      const ev=Object.values(computeRange(H,H,{francos:true})[H]||{}).filter(x=>x.f!=='fr').reduce((a,x)=>a+x.names.length,0); if(ev) items.push(`<b>${ev}</b> evento(s) en la agenda de hoy`); } }catch(e){}
  try{ if(typeof VS!=='undefined'&&VS.ok){ const pend=VS.items.filter(x=>x.estado==='pendiente');
      if(VS.aprueba&&pend.length) items.push(`<b>${pend.length}</b> pedido(s) de vacaciones para revisar`);
      else if(!VS.aprueba&&VS.pide){ const mio=VS.items.filter(x=>x.uid===SRV.user.id), res=mio.filter(x=>x.rat&&x.rat.slice(0,10)>=addD(H,-3)&&x.estado!=='pendiente');
        if(res.length) items.push(`RRHH respondió <b>${res.length}</b> pedido(s) de vacaciones tuyo(s)`); else if(mio.some(x=>x.estado==='pendiente')) items.push(`<b>${mio.filter(x=>x.estado==='pendiente').length}</b> pedido(s) de vacaciones esperando a RRHH`); } } }catch(e){}
  try{ if(online&&!adm&&frCanEdit()){ const C=frCruce(); if(C){ const sin=C.rows.filter(r=>!frAsig(r.e,C.dias)).length, P=C.P, falta=Math.round((dObj(P.d1)-dObj(H))/864e5);
      items.push(`Francos de ${liqNom(P.ym).split(' ')[0].toLowerCase()}: ${falta>=0?`<b>${falta}</b> día(s) al cierre`:'período cerrado'}${sin?` · <b>${sin}</b> eventual(es) sin francos`:''}`); } } }catch(e){}
  const W=$('#welcome');
  W.innerHTML=`<div class="wl-in"><div class="wl-ring"></div><div class="wl-hi">${sal},</div><h2>${esc(NOMBRE())}</h2>
    <p class="wl-sub">${DOWL[d.getDay()][0].toUpperCase()+DOWL[d.getDay()].slice(1)} ${d.getDate()} de ${MESL[d.getMonth()]} · bienvenido al panel de trabajo</p>
    ${cards.length?`<div class="wl-cards">${cards.map((t,i)=>`<div style="animation-delay:${.3+i*.1}s">${t}</div>`).join('')}</div>`:''}
    ${items.length?`<div class="wl-items">${items.map((t,i)=>`<span style="animation-delay:${.6+i*.12}s">${t}</span>`).join('')}</div>`:''}
    <button class="btn primary wl-go">Empezar</button></div>`;
  W.classList.add('on'); try{ SND.play('notify'); }catch(e){}
  const cerrar=()=>{ clearTimeout(W._t); W.classList.add('out'); setTimeout(()=>W.classList.remove('on','out'),500); App.refresh(); };
  clearTimeout(W._t); W._t=setTimeout(cerrar,9000); W.onclick=cerrar;
}
// en el servidor, el saludo aparece una vez por día al entrar
App.saludoDelDia=()=>{ if(!(window.SRV&&SRV.mode==='online')) return; const k='rrhh-hola-'+SRV.user.id+'-'+hoy(); try{ if(localStorage.getItem(k)) return; localStorage.setItem(k,'1'); }catch(e){} setTimeout(welcome,1500); };

/* --- animación del protector (canvas 2D, liviana) --- */
const lkAnim=(()=>{
  let cv,ctx,w,h,P=[],t=0,run=false,last=0;
  function size(){ cv=$('#lk-cv'); ctx=cv.getContext('2d'); const dpr=Math.min(devicePixelRatio||1,1.5);
    w=cv.width=innerWidth*dpr; h=cv.height=innerHeight*dpr; cv.style.width=innerWidth+'px'; cv.style.height=innerHeight+'px';
    P=Array.from({length:Math.round(Math.min(90,w*h/26000))},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.25,vy:(Math.random()-.5)*.25,r:Math.random()*1.6+.6})); }
  function aurora(){
    const bands=[[34,211,238,.12],[139,92,246,.11],[34,197,94,.06]];
    bands.forEach((c,i)=>{ ctx.beginPath();
      for(let x=0;x<=w;x+=w/60){ const y=h*(.42+i*.1)+Math.sin(x/w*Math.PI*2*(1+i*.4)+t*(.25+i*.08))*h*.07+Math.sin(x/w*7+t*.6+i)*h*.02; x?ctx.lineTo(x,y):ctx.moveTo(x,y); }
      ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath();
      const g=ctx.createLinearGradient(0,h*.3,0,h); g.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},${c[3]})`); g.addColorStop(1,'rgba(7,11,20,0)');
      ctx.fillStyle=g; ctx.fill(); });
  }
  function particles(lines){
    ctx.fillStyle='rgba(165,243,252,.75)';
    P.forEach(p=>{ p.x+=p.vx*(w/1400); p.y+=p.vy*(w/1400); if(p.x<0)p.x+=w; if(p.x>w)p.x-=w; if(p.y<0)p.y+=h; if(p.y>h)p.y-=h;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(w/1400),0,7); ctx.fill(); });
    if(!lines) return; const md=(w/9)**2;
    for(let i=0;i<P.length;i++) for(let j=i+1;j<P.length;j++){ const dx=P[i].x-P[j].x, dy=P[i].y-P[j].y, d=dx*dx+dy*dy;
      if(d<md){ ctx.strokeStyle=`rgba(34,211,238,${.18*(1-d/md)})`; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(P[i].x,P[i].y); ctx.lineTo(P[j].x,P[j].y); ctx.stroke(); } }
  }
  function frame(now){
    if(!run) return; const dt=last?Math.min(.05,(now-last)/1000):.016; last=now; t+=dt;
    ctx.fillStyle='#05080f'; ctx.fillRect(0,0,w,h);
    const g=ctx.createRadialGradient(w*.5,h*.45,0,w*.5,h*.45,Math.max(w,h)*.6); g.addColorStop(0,'rgba(14,30,52,.9)'); g.addColorStop(1,'rgba(5,8,15,0)'); ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    if(LK.anim==='aurora'){ aurora(); particles(false); }
    else if(LK.anim==='red') particles(true);
    // 'minimal': solo el fondo y el reloj
    requestAnimationFrame(frame);
  }
  addEventListener('resize',()=>{ if(run) size(); });
  return { start(){ size(); if(reduced){ run=true; frame(performance.now()); run=false; return; } if(!run){ run=true; last=0; requestAnimationFrame(frame); } }, stop(){ run=false; } };
})();

function hookLock(){
  $('#btnLock').onclick=()=>lockNow('reposo');
  const L=$('#lock');
  L.addEventListener('pointerdown',e=>{ if(!e.target.closest('#lk-form')) lkAsk(); });
  addEventListener('keydown',e=>{ if(!locked) return; if(!L.classList.contains('ask')){ lkAsk(); if(e.key.length===1){ e.preventDefault(); $('#lk-pass').value+=e.key; } } },true);
  $('#lk-form').onsubmit=e=>{ e.preventDefault(); unlockTry(); };
  // bloquear de nuevo si se recarga estando bloqueado, o si está activado "al abrir"
  let was=false; try{ was=sessionStorage.getItem(LKK)==='1'; }catch(e){}
  if(was||LK.alAbrir) setTimeout(()=>lockNow(was?'reposo':'inicio'),50);
}

/* --- sección de configuración --- */
function renderConfig(){
  if(!$('#v-config')) return;
  $('#cf-on').checked=LK.on; $('#cf-min').value=LK.min; $('#cf-open').checked=!!LK.alAbrir; $('#cf-anim').value=LK.anim;
  $('#cf-min-v').textContent=LK.min+' min';
  $('#cf-anim2').checked=UI.anim; $('#cf-bg').checked=UI.bg; $('#cf-snd').checked=UI.snd!==false;
  $('#cf-state').innerHTML=LK.on?`<span class="sdot fresh"></span><span>Se bloquea después de <b>${LK.min} min</b> sin usar el panel${LK.alAbrir?' y cada vez que lo abrís':''}.</span>`:'<span class="sdot none"></span><span>El bloqueo automático está apagado. El botón de modo reposo sigue funcionando.</span>';
}
function hookConfig(){
  const sv=()=>{ saveLK(); renderConfig(); };
  $('#cf-on').onchange=e=>{ LK.on=e.target.checked; lastAct=Date.now(); sv(); };
  $('#cf-min').oninput=e=>{ LK.min=Math.max(1,Math.min(120,+e.target.value||5)); lastAct=Date.now(); $('#cf-min-v').textContent=LK.min+' min'; saveLK(); };
  $('#cf-min').onchange=sv;
  $('#cf-open').onchange=e=>{ LK.alAbrir=e.target.checked; sv(); };
  $('#cf-anim').onchange=e=>{ LK.anim=e.target.value; sv(); };
  $('#cf-test').onclick=()=>lockNow('reposo');
  $('#cf-anim2').onchange=e=>{ $('#optAnim').checked=e.target.checked; $('#optAnim').dispatchEvent(new Event('change')); };
  $('#cf-bg').onchange=e=>{ $('#opt3d').checked=e.target.checked; $('#opt3d').dispatchEvent(new Event('change')); };
  $('#cf-snd').onchange=e=>{ $('#optSnd').checked=e.target.checked; $('#optSnd').dispatchEvent(new Event('change')); };
  $('#cf-pass-btn').onclick=async()=>{
    const a=$('#cf-pa').value, b=$('#cf-pb').value, c=$('#cf-pc').value, msg=$('#cf-pmsg');
    if(!(await passOk(a))){ msg.className='cf-msg err'; msg.textContent='La contraseña actual no es correcta.'; SND.play('err'); return; }
    if(b.length<6){ msg.className='cf-msg err'; msg.textContent='La nueva contraseña tiene que tener al menos 6 caracteres.'; SND.play('err'); return; }
    if(b!==c){ msg.className='cf-msg err'; msg.textContent='Las dos contraseñas nuevas no coinciden.'; SND.play('err'); return; }
    LK.hash=await hashPass(b); saveLK(); ['#cf-pa','#cf-pb','#cf-pc'].forEach(s=>$(s).value='');
    msg.className='cf-msg ok'; msg.textContent='Contraseña actualizada.'; SND.play('ok');
  };
}

/* ================================================================
   INFORMES GRÁFICOS (indicadores por módulo → PDF / HTML)
   ================================================================ */
function rchart(fn,data,o,w){ const d=document.createElement('div'); d.style.cssText=`position:fixed;left:-9999px;top:0;width:${w||560}px`;
  document.body.appendChild(d); try{ fn(d,data,Object.assign({},o||{})); }catch(e){} const h=d.innerHTML; d.remove(); return h; }
const RV=(data,o,w)=>rchart(vbars,data,Object.assign({labels:true,vfmt:v=>v,yfmt:v=>Math.round(v)},o),w);
const RH=(data,o,w)=>rchart(hbars,data,o,w);
const RA=(data,o,w)=>rchart(areaChart,data,o,w);
function rtable(cols,rows,max){
  const R=max?rows.slice(0,max):rows;
  return `<table class="rt"><thead><tr>${cols.map(c=>`<th${c.r?' class="r"':''}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>`+
    (R.length?R.map(r=>`<tr>${r.map((v,i)=>`<td${cols[i]&&cols[i].r?' class="r"':''}>${v==null?'':esc(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${cols.length}" class="emp">Sin datos</td></tr>`)+
    `</tbody></table>${max&&rows.length>max?`<p class="more">y ${rows.length-max} más…</p>`:''}`;
}
const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
const cnt=(arr,f)=>{ const m={}; arr.forEach(x=>{ const k=f(x)||'Sin dato'; m[k]=(m[k]||0)+1; }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); };

const REP={
  home(){ const H=hoy(), A=computeAvisos(), bd=safe(byDate), last=bd[bd.length-1], act=ACT(), S=ropaStats(), LL=lastLotes();
    return {t:'Resumen general',k:[
      {l:'Temas urgentes',v:A.filter(a=>a.p==='alta').length,s:`${A.filter(a=>a.p==='media').length} para revisar`,c:'crit'},
      {l:'Tardanzas último día',v:last?last.tarde:'—',s:last?`${lblDay(last.f)} · de ${last.total}`:'sin reporte'},
      {l:'De vacaciones hoy',v:fueraEn(H).length,s:`${VAC().filter(s=>s.desde>=H&&s.desde<=addD(H,30)).length} salen en 30 días`},
      {l:'Eventuales activos',v:act.length,s:`${act.filter(r=>r.ultimo&&r.ultimo>=H&&r.ultimo<=addD(H,7)).length} bajan en 7 días`},
      {l:'De franco hoy',v:DB.francos?frOn(H).length:'—',s:DB.francos?`de ${FRE().length}`:'sin planilla'},
      {l:'Indumentaria',v:ROPA()?Math.round(S.pct)+'%':'—',s:ROPA()?`${S.e} de ${S.t} entregados`:'sin planilla',c:'ok'},
      {l:'Anticipos (último)',v:LL.length?fmtShort(anRowsFor('@last','').reduce((a,r)=>a+r.monto,0)):'—',s:LL.length?LL.map(l=>l.grupo).join(' + '):'sin archivos'},
      {l:'Fuentes desactualizadas',v:['aus','vac','ant','fr','an','ropa'].filter(k=>['stale','crit'].includes(updInfo(k).st)).length,s:'revisar actualización'}],
      s:[{t:'Pendientes',full:1,h:rtable([{t:'Prioridad'},{t:'Tema'},{t:'Detalle'}],A.map(a=>[a.p.toUpperCase(),a.v,a.d||'']),14)},
        {t:'Tardanzas por día',h:RA(tardeDays(30),{empty:'Sin reporte del reloj.'})},
        {t:'Personas de vacaciones por semana',h:RV(vacWeeks(12),{mark:0,color:COL.c1,emptyIfZero:!VAC().length,empty:'Sin plan de vacaciones.'})},
        {t:'Bajas de eventuales por semana',h:RV(bajaWeeks(10),{color:COL.c2,emptyIfZero:!ANT().length,empty:'Sin control de eventuales.'})},
        {t:'Estado de las fuentes',h:rtable([{t:'Fuente'},{t:'Última actualización'},{t:'Estado'}],
          [['aus','Reloj'],['vac','Plan de vacaciones'],['ant','Control de eventuales'],['fr','Francos'],['ropa','Indumentaria'],['an','Anticipos']].map(([k,n])=>{ const u=updInfo(k); return [n,u.at?fmtAt(u.at):'—',u.st==='fresh'?'Al día':u.st==='none'?'Sin cargar':'Desactualizada']; }))}]};
  },
  ant(){ const H=hoy(), act=ACT(), all=ANT();
    if(!all.length) return null;
    const b7=act.filter(r=>r.ultimo&&r.ultimo>=H&&r.ultimo<=addD(H,7)), b30=act.filter(r=>r.ultimo&&r.ultimo>=H&&r.ultimo<=addD(H,30)).sort((a,b)=>a.ultimo<b.ultimo?-1:1);
    const venc=act.filter(r=>r.ultimo&&r.ultimo<H), prom=act.length?Math.round(act.reduce((a,r)=>a+(r.antig||0),0)/act.length):0;
    const tur=cnt(act,r=>cap(r.turno)), tar=cnt(act,r=>cap(r.tarea));
    const B=[[0,30],[31,60],[61,90],[91,120],[121,180],[181,1e9]];
    return {t:'Eventuales',k:[{l:'Activos',v:act.length,s:`${all.length} en el control`},{l:'Bajan en 7 días',v:b7.length,s:'fin de período de prueba',c:b7.length?'warn':''},
      {l:'Bajan en 30 días',v:b30.length,s:'próximo mes'},{l:'Vencidos',v:venc.length,s:'último día ya pasado',c:venc.length?'crit':''},
      {l:'Antigüedad promedio',v:prom+' d',s:'plantel activo'},{l:'Turnos / tareas',v:`${tur.length} / ${tar.length}`,s:'con gente activa'}],
      s:[{t:'Dotación por turno',h:RH(tur.map(([n,v],i)=>({n,v,c:[COL.c1,COL.c2,COL.c3,COL.c4][i%4]})))},
        {t:'Dotación por tarea',h:RH(tar.slice(0,10).map(([n,v])=>({n,v,c:COL.c1})))},
        {t:'Bajas por semana (próximas 10)',h:RV(bajaWeeks(10),{color:COL.c2})},
        {t:'Antigüedad del plantel activo',h:RV(B.map(([a,b])=>({l:b>1e8?`+${a-1}`:`${a}–${b}`,v:act.filter(r=>r.antig>=a&&r.antig<=b).length,c:COL.c3})))},
        {t:'Próximas bajas (30 días)',full:1,h:rtable([{t:'Último día'},{t:'Legajo'},{t:'Apellido y nombre'},{t:'Ingreso'},{t:'Tarea'},{t:'Turno'},{t:'Días',r:1}],
          b30.map(r=>[dmy(r.ultimo),r.legajo,r.nombre,dmy(r.ingreso),cap(r.tarea),cap(r.turno),diffD(H,r.ultimo)]),30)}]};
  },
  fr(){ const E=FRE(); if(!E.length) return null;
    const ds=frDates(), H=hoy(), D=ds.includes(H)?H:(frState.date||ds[ds.length-1]), on=frOn(D);
    const cntD=ds.map(d=>frOn(d).length), avg=ds.length?cntD.reduce((a,b)=>a+b,0)/ds.length:0;
    const act=E.filter(e=>!(e.egreso&&e.egreso<H)), asig=act.filter(e=>e.aAsignar!=null), pos=asig.filter(e=>e.aAsignar>0), neg=asig.filter(e=>e.aAsignar<0);
    const tot=act.map(e=>({e,n:Object.values(e.d).filter(v=>v==='F').length}));
    return {t:'Francos asignados',sub:`Período ${dmy(ds[0])} al ${dmy(ds[ds.length-1])}`,k:[
      {l:'De franco · '+lblDay(D),v:on.length,s:`de ${E.length} empleados`},{l:'De franco mañana',v:frOn(addD(D,1)).length,s:lblDay(addD(D,1))},
      {l:'Promedio por día',v:(Math.round(avg*10)/10).toLocaleString('es-AR'),s:`${ds.length} días`},{l:'Francos por asignar',v:pos.reduce((a,e)=>a+e.aAsignar,0),s:`${pos.length} persona(s)`,c:pos.length?'warn':''},
      {l:'Saldo negativo',v:neg.length,s:'activos con francos de más',c:neg.length?'crit':''},{l:'Fuera de contrato',v:E.filter(e=>Object.values(e.d).includes('B')).length,s:'con días sin contrato'}],
      s:[{t:'Francos por día',full:1,h:RV(ds.map(d=>({l:String(dObj(d).getDate()),v:frOn(d).length,c:d===D?COL.acc:ferEn(d)?COL.ok:COL.c3})),{lw:24,bw:20},1080)},
        {t:'De franco '+lblDay(D)+' por turno',h:RH(cnt(on,e=>e.turno).map(([n,v])=>({n,v,c:COL.acc})),{empty:'Nadie de franco.'})},
        {t:'Francos por sector (período)',h:RH(Object.entries(act.reduce((m,e)=>{ const k=e.sector||'Sin sector'; m[k]=(m[k]||0)+Object.values(e.d).filter(v=>v==='F').length; return m; },{})).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([n,v])=>({n,v,c:COL.c3})))},
        {t:'Francos por asignar y saldos negativos',full:1,h:rtable([{t:'Legajo'},{t:'Apellido y nombre'},{t:'Turno'},{t:'Sector'},{t:'Francos tomados',r:1},{t:'A asignar',r:1},{t:'Observaciones'}],
          act.filter(e=>e.aAsignar).sort((a,b)=>b.aAsignar-a.aAsignar).map(e=>[e.legajo,e.nombre,e.turno,e.sector,Object.values(e.d).filter(v=>v==='F').length,e.aAsignar>0?'+'+e.aAsignar:e.aAsignar,e.obs]),25)},
        {t:'De franco '+lblDay(D),full:1,h:rtable([{t:'Legajo'},{t:'Apellido y nombre'},{t:'Turno'},{t:'Sector'}],on.sort((a,b)=>(a.turno||'').localeCompare(b.turno||'')||a.nombre.localeCompare(b.nombre)).map(e=>[e.legajo,e.nombre,e.turno,e.sector]),40)}]};
  },
  vac(){ const R=VAC(); if(!R.length&&!(DB.vac&&DB.vac.people&&DB.vac.people.length)) return null;
    const H=hoy(), fut=R.filter(s=>s.desde>=H), n30=fut.filter(s=>s.desde<=addD(H,30)).sort((a,b)=>a.desde<b.desde?-1:1), sinN=fut.filter(s=>!esNotif(s)), vp=vacPlan();
    const porMes={}; fut.forEach(s=>{ const k=s.desde.slice(0,7); porMes[k]=(porMes[k]||0)+1; });
    return {t:'Vacaciones',k:[{l:'Salidas cargadas',v:R.length,s:`${uniq(R.map(s=>s.legajo)).length} personas`},{l:'Por venir',v:fut.length,s:`${fut.reduce((a,s)=>a+s.dias,0)} días`},
      {l:'De vacaciones hoy',v:fueraEn(H).length,s:'personas fuera'},{l:'Salen en 30 días',v:n30.length,s:`${n30.reduce((a,s)=>a+s.dias,0)} días a liquidar`},
      {l:'Sin notificar',v:sinN.length,s:'de las que vienen',c:sinN.length?'crit':''},{l:'Sin planificar',v:vp.length,s:`${fmtN(vp.reduce((a,p)=>a+p.saldo,0))} días pendientes`,c:vp.length?'warn':''}],
      s:[{t:'Personas de vacaciones por semana',full:1,h:RV(vacWeeks(16),{mark:0,color:COL.c1},1080)},
        {t:'Salidas por mes',h:RV(Object.keys(porMes).sort().map(k=>({l:MESL[+k.slice(5)-1].slice(0,3)+' '+k.slice(2,4),v:porMes[k],c:COL.c1})))},
        {t:'Avance de planificación',h:(()=>{ const P=(DB.vac&&DB.vac.people)||[], tot=P.reduce((a,p)=>a+(p.diasAno||0),0), pl=P.reduce((a,p)=>a+Math.min(p.plan||0,p.diasAno||0),0);
          return RH([{n:'Días planificados',v:pl,c:COL.c1,vt:fmtN(pl)},{n:'Sin planificar',v:tot-pl,c:'#94a3b8',vt:fmtN(tot-pl)}])+`<p class="note">${pct(pl,tot)} de los días del año ya tienen fecha.</p>`; })()},
        {t:'Salidas de los próximos 30 días',full:1,h:rtable([{t:'Desde'},{t:'Hasta'},{t:'Días',r:1},{t:'Legajo'},{t:'Apellido y nombre'},{t:'Categoría'},{t:'Notificado'}],
          n30.map(s=>[dmy(s.desde),dmy(s.hasta),s.dias,s.legajo,s.nombre,s.cat,esNotif(s)?'Sí':'FALTA']),30)},
        {t:'Mayor saldo sin planificar',full:1,h:rtable([{t:'Legajo'},{t:'Apellido y nombre'},{t:'Categoría'},{t:'Días del año',r:1},{t:'Planificados',r:1},{t:'Sin planificar',r:1}],
          vp.map(p=>[p.legajo,p.nombre,p.cat,p.diasAno,p.plan,p.saldo]),15)}]};
  },
  aus(){ const L=LATE(), bd=safe(byDate); if(!bd.length) return null;
    const rk=safe(ranking), act=safe(activeRecs), ok=act.filter(r=>r.status==='ok').length, last=bd[bd.length-1];
    const tol=+DB.tolerancia||0, B=[[tol+1,15],[16,30],[31,60],[61,120],[121,1e9]].filter(b=>b[1]>tol);
    const ord=safe(ordinals), pend={}; L.forEach(r=>{ const k=kindFor(ord[rid(r)]||1); pend[k]=(pend[k]||0)+1; });
    return {t:'Ausentismo y puntualidad',sub:`${bd.length} día(s) cargados · ${dmy(bd[0].f)} al ${dmy(last.f)} · tolerancia ${tol} min`,k:[
      {l:'Tardanzas acumuladas',v:L.length,s:`en ${bd.length} días`,c:'crit'},{l:'Último día',v:last.tarde,s:`${lblDay(last.f)} · de ${last.total}`},
      {l:'Puntualidad',v:pct(ok,ok+L.length),s:'fichadas en horario'},{l:'Personas con tardanza',v:rk.length,s:`${rk.filter(p=>p.cant>=2).length} reincidentes`,c:'warn'},
      {l:'Sin fichada',v:act.filter(r=>r.status==='sin_fichada').length,s:'a revisar'},{l:'Documentos',v:`${pend.descargo||0}/${pend.apercibimiento||0}/${pend.sancion||0}`,s:'pedidos / apercib. / susp.'}],
      s:[{t:'Tardanzas por día',full:1,h:RA(tardeDays(60),{},1080)},
        {t:'Distribución del atraso',h:RV(B.map(([a,b])=>({l:b>1e8?`+${a-1}′`:`${a}–${b}′`,v:L.filter(r=>r.atraso>=a&&r.atraso<=b).length,c:COL.c4})))},
        {t:'Tardanzas por día de la semana',h:RV([1,2,3,4,5,6,0].map(d=>({l:DOW[d],v:L.filter(r=>dObj(r.fecha).getDay()===d).length,c:COL.c1})))},
        {t:'Ranking de reincidentes',full:1,h:rtable([{t:'Legajo'},{t:'Apellido y nombre'},{t:'Tardanzas',r:1},{t:'Min. totales',r:1},{t:'Promedio',r:1},{t:'Peor',r:1},{t:'Última'}],
          rk.map(p=>[p.legajo,p.nombre,p.cant,p.mins+'′',p.prom+'′',p.peor+'′',dmy(p.ultima)]),20)}]};
  },
  an(){ if(!AN().length) return null;
    const per=anState.per==='*'?'':anState.per||'@last', rows=anFlags(anRowsFor(per,anState.grp)), tot=rows.reduce((a,r)=>a+r.monto,0), pers=anPeriods();
    const byG={}; rows.forEach(r=>{ byG[r.grupo]=(byG[r.grupo]||0)+r.monto; });
    const byU={}; rows.forEach(r=>{ const k=(r.uo||'Sin U.O.').replace(/^La Matanza Endosos 2016\s*/i,''); byU[k]=(byU[k]||0)+r.monto; });
    const rk=rows.filter(r=>r.flags.some(f=>f.t==='tarde'));
    return {t:'Anticipos',sub:per==='@last'?'Último archivo cargado: '+lastLotes().map(l=>l.file).join(' + '):perTxt(per)||'Todos los períodos',k:[
      {l:'Total otorgado',v:fmt$(tot),s:anState.grp||'todos los grupos'},{l:'Anticipos',v:rows.length,s:`${uniq(rows.map(r=>r.legajo)).length} personas`},
      {l:'Promedio',v:fmt$(rows.length?tot/rows.length:0),s:'por anticipo'},{l:'Con baja cercana',v:rk.length,s:'descuento en riesgo',c:rk.length?'crit':''}],
      s:[{t:'Total por grupo',h:RH(Object.entries(byG).sort((a,b)=>b[1]-a[1]).map(([n,v])=>({n,v,vt:fmtShort(v),c:anColor(n)})))},
        {t:'Evolución por período',h:RV(pers.slice().reverse().map(p=>({l:perShort(p),v:anRowsFor(p,'').reduce((a,r)=>a+r.monto,0)})),{vfmt:fmtShort,yfmt:fmtShort,ml:52})},
        {t:'Por U.O. cliente',full:1,h:RH(Object.entries(byU).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([n,v])=>({n,v,vt:fmtShort(v),c:COL.c1})))},
        {t:'Anticipos con riesgo de descuento',full:1,h:rtable([{t:'Legajo'},{t:'Apellido y nombre'},{t:'Grupo'},{t:'Monto',r:1},{t:'Control'}],rk.map(r=>[r.legajo,r.nombre,r.grupo,fmt$(r.monto),r.flags.map(f=>f.x).join(', ')]),20)}]};
  },
  ropa(){ const R=ROPA(); if(!R) return null; const S=ropaStats(), tipos=uniq(R.rows.map(x=>x.tipo)).sort();
    const P=R.rows.filter(x=>ropaEst(x)==='P');
    const pend=R.rows.filter(x=>ropaEst(x)&&ropaEst(x)!=='E'), tk=PR.map(p=>p[0]).filter(k=>pend.some(x=>ropaT(x)[k]));
    return {t:'Entrega de indumentaria',sub:(R.campania||'')+(R.titulo?' · '+R.titulo:''),k:[
      {l:'Avance',v:Math.round(S.pct)+'%',s:'entregado',c:'ok'},{l:'Entregados',v:S.e,s:`de ${S.t}`},{l:'Preparados',v:S.st.R,s:'falta entregar',c:'warn'},
      {l:'Con talles, sin preparar',v:S.st.T,s:'listos para armar'},{l:'Sin talles',v:S.st.S,s:'faltan entregar y no declararon',c:S.st.S?'crit':''},{l:'Talles declarados',v:S.decl,s:`de ${S.t} personas`}],
      s:[{t:'Avance general',h:`<div class="ringw">${ring(S.pct,170)}</div>`},
        {t:'Avance por tipo de personal',h:tipos.map(t=>{ const s=ropaStats(R.rows.filter(x=>x.tipo===t)); return `<div class="rbar"><div><b>${esc(t)}</b><span>${s.e}/${s.t} · ${Math.round(s.pct)}%</span></div><i><em style="width:${s.pct}%"></em></i></div>`; }).join('')},
        {t:'Avance en el tiempo',full:1,h:R.hist.length>1?RA(R.hist.map(h=>({l:dm(isoOf(new Date(h.at))),v:h.t?Math.round(h.e/h.t*100):0})),{},1080):'<p class="note">Se completa a medida que subís versiones nuevas de la planilla.</p>'},
        {t:'Etapas',h:RH(['S','T','R','E'].map(k=>({n:STG[k][0],v:S.st[k],c:STG[k][1]})))},
        {t:'Talles a preparar (pendientes)',full:1,h:tk.length?rtable([{t:'Prenda'},{t:'Talles (cantidad)'}],tk.map(k=>{ const c={}; pend.forEach(x=>{ const v=ropaT(x)[k]; if(v) c[v]=(c[v]||0)+1; });
          return [PR.find(p=>p[0]===k)[1],Object.keys(c).sort((a,b)=>(parseFloat(a)||0)-(parseFloat(b)||0)||talleOrd(a)-talleOrd(b)).map(t=>`${t}: ${c[t]}`).join('   ')]; })):'<p class="note">Sin talles cargados para los pendientes.</p>'},
        {t:'Faltan entregar sin talles',full:1,h:rtable([{t:'Legajo'},{t:'Apellido y nombre'},{t:'Tipo'}],R.rows.filter(x=>ropaEst(x)&&ropaStage(x)==='S').map(x=>[x.legajo,x.nombre,x.tipo]),40)},
        {t:'Pendientes por tipo',full:1,h:rtable([{t:'Tipo'},{t:'Sin talles',r:1},{t:'Con talles',r:1},{t:'Preparados',r:1},{t:'Total pendientes',r:1}],
          uniq(P.map(x=>x.tipo)).sort().map(t=>{ const L=P.filter(x=>x.tipo===t); return [t,L.filter(x=>ropaStage(x)==='S').length,L.filter(x=>ropaStage(x)==='T').length,L.filter(x=>ropaStage(x)==='R').length,L.length]; }))}]};
  },
  f3(){ const s=window.F3API?F3API.estado():{}, A=window.F3API&&F3API.rep?F3API.rep():null; if(!s.base||!A) return null;
    const pres=A.pres||{full:[],medio:[],cero:[]}, pt=A.punt||{full:0,medio:0,cero:0}, top=(A.hs||[]).filter(x=>x.he>0).slice(0,15);
    return {t:'Novedades F3',sub:`${s.tipo||''}${F3API.periodo()?' · '+F3API.periodo():''}`,k:[
      {l:'Legajos en el F3',v:A.total,s:`${s.emp} en la base`},{l:'Presentismo completo',v:A.tienePres?pct(pres.full.length,A.total):'—',s:A.tienePres?`${pres.full.length} personas`:'no aplica'},
      {l:'Horas extras 50%',v:fmtN(A.tHE),s:`${(A.hs||[]).filter(x=>x.he>0).length} personas`,c:'warn'},{l:'Horas al 100%',v:fmtN(A.tHE100),s:'total del mes'},
      {l:'Nocturnas / feriado / domingo',v:`${fmtN(A.tNoc)} / ${fmtN(A.tFer)} / ${fmtN(A.tDom)}`,s:'horas'},{l:'Ajustes manuales',v:F3API.ajustes(),s:'celdas editadas en el panel'}],
      s:[A.tienePres?{t:'Presentismo',h:RH([{n:'Completo',v:pres.full.length,c:'#16a34a'},{n:'Medio',v:pres.medio.length,c:COL.warn},{n:'Sin presentismo',v:pres.cero.length,c:COL.crit}])}:null,
        A.tienePres?{t:'Puntualidad',h:RH([{n:'Cumple',v:pt.full,c:'#16a34a'},{n:'Medio',v:pt.medio,c:COL.warn},{n:'No cumple',v:pt.cero,c:COL.crit}])}:null,
        {t:'Horas por tipo',h:RH([{n:'Extras 50%',v:A.tHE,c:COL.c2},{n:'Extras 100%',v:A.tHE100,c:COL.crit},{n:'Nocturnas',v:A.tNoc,c:COL.c3},{n:'Feriado',v:A.tFer,c:COL.c1},{n:'Domingo',v:A.tDom,c:COL.c4}].filter(x=>x.v>0),{empty:'Sin horas este mes.'})},
        {t:'Horas extras por categoría',h:RH((A.catHE||[]).slice(0,8).map(([n,v])=>({n,v,c:COL.c2})),{empty:'Sin horas extras.'})},
        {t:'Cambios del mes',h:rtable([{t:'Concepto'},{t:'Cantidad',r:1}],[['Cambios de categoría',(A.cat||[]).length],['Cambios de sueldo',(A.sue||[]).length],['Pierden plus de frío',(A.frioBaja||[]).length],['Empiezan plus de frío',(A.frioAlta||[]).length]])},
        {t:'Mayores horas extras',full:1,h:rtable([{t:'Legajo'},{t:'Apellido y nombre'},{t:'Categoría'},{t:'HE 50%',r:1},{t:'Mes pasado',r:1},{t:'Dif.',r:1},{t:'Nocturnas',r:1}],
          top.map(x=>[x.l,x.n,x.cat,x.he,x.ant,(x.dif>0?'+':'')+x.dif,x.nc||'']))}].filter(Boolean)};
  }
};
const REP_VIEW={'v-home':'home','v-bajas':'ant','v-francos':'fr','v-vacaciones':'vac','v-ausentismo':'aus','v-anticipos':'an','v-ropa':'ropa','v-f3':'f3'};
const REP_EMPTY={ant:'Cargá el control de eventuales',fr:'Cargá la planilla de francos',vac:'Cargá el plan de vacaciones',aus:'Cargá el reporte del reloj',an:'Cargá los anticipos',ropa:'Cargá el control de entrega',f3:'Cargá la base F3 y las novedades del mes'};
const REP_CSS=`@page{size:A4;margin:12mm}
*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{max-width:1100px;margin:0 auto;padding:18px}
.hd{display:flex;align-items:center;gap:16px;padding-bottom:12px;border-bottom:3px solid transparent;border-image:linear-gradient(90deg,#0891b2,#7c3aed) 1}
.hd img{height:34px}.hd .t{flex:1}.hd small{display:block;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#0891b2;font-weight:700}
.hd h1{margin:2px 0 0;font-size:24px;letter-spacing:-.01em}.hd .sub{color:#475569;font-size:12px}.hd .dt{text-align:right;color:#475569;font-size:11px}
.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:14px 0}
.k{border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;border-left:4px solid #0891b2;background:#f8fafc;break-inside:avoid}
.k.crit{border-left-color:#dc2626}.k.warn{border-left-color:#d97706}.k.ok{border-left-color:#16a34a}
.k .l{font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:600}.k .v{font-size:22px;font-weight:700;margin-top:2px}.k .s{font-size:10.5px;color:#475569}
.gr{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.c{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;break-inside:avoid}.c.f{grid-column:1/-1}
.c h3{margin:0 0 8px;font-size:12.5px;color:#0f172a;border-bottom:1px solid #f1f5f9;padding-bottom:6px}
.vz{width:100%;height:auto}.vz text{font-family:Consolas,monospace;font-size:10px;fill:#64748b}.vz .val{fill:#0f172a;font-weight:700}.vz .gl{stroke:#eef2f7}.vz .base{stroke:#cbd5e1}.vz .hit{fill:transparent}
.vz path[fill="url(#gArea)"]{fill:rgba(8,145,178,.12)}
.hb{display:grid;grid-template-columns:minmax(80px,170px) 1fr 70px;gap:10px;align-items:center;padding:4px 0;font-size:11.5px}
.hb .n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#334155}.hb .t{height:11px;background:#f1f5f9;border-radius:6px;overflow:hidden}.hb .t i{display:block;height:100%;border-radius:0 6px 6px 0}.hb .v{text-align:right;font-weight:700;font-family:Consolas,monospace}
.empty{color:#94a3b8;padding:14px;text-align:center}.note{color:#475569;font-size:11px;margin:6px 0 0}
table.rt{width:100%;border-collapse:collapse;font-size:10.5px}.rt th{background:#0f172a;color:#fff;text-align:left;padding:5px 7px;font-weight:600}.rt th.r,.rt td.r{text-align:right}
.rt td{padding:4px 7px;border-bottom:1px solid #f1f5f9}.rt tr:nth-child(even) td{background:#f8fafc}.rt td.emp{text-align:center;color:#94a3b8;padding:10px}.more{color:#64748b;font-size:10.5px;margin:4px 0 0}
.ringw{display:flex;justify-content:center}.ring text{fill:#0f172a;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-weight:700}.ring circle:first-of-type{stroke:#e2e8f0}
.rbar{margin:6px 0}.rbar div{display:flex;justify-content:space-between;font-size:11.5px}.rbar span{color:#475569}.rbar i{display:block;height:11px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-top:3px}.rbar em{display:block;height:100%;background:linear-gradient(90deg,#0891b2,#16a34a)}
.ft{margin-top:14px;padding-top:8px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:10px;display:flex;justify-content:space-between}
@media print{.pg{padding:0}}`;
let repCur=null;
function buildReport(k){
  const r=REP[k]&&REP[k](); if(!r) return null;
  const now=new Date(), u=k!=='home'&&k!=='f3'?updInfo(k==='ant'?'ant':k):null;
  const logo=($('.brand img')||{}).src||'';
  const body=`<div class="pg"><div class="hd">${logo?`<img src="${logo}">`:''}<div class="t"><small>Informe · Panel de trabajo RRHH I.Casanova</small><h1>${esc(r.t)}</h1>${r.sub?`<div class="sub">${esc(r.sub)}</div>`:''}</div>
    <div class="dt">Generado el ${dmy(isoOf(now))} ${pad(now.getHours())}:${pad(now.getMinutes())}${u&&u.at?`<br>Datos al ${fmtAt(u.at)}`:''}</div></div>
    <div class="kp">${r.k.map(x=>`<div class="k ${x.c||''}"><div class="l">${esc(x.l)}</div><div class="v">${esc(x.v)}</div><div class="s">${esc(x.s||'')}</div></div>`).join('')}</div>
    <div class="gr">${r.s.map(x=>`<div class="c${x.full?' f':''}"><h3>${esc(x.t)}</h3>${x.h}</div>`).join('')}</div>
    <div class="ft"><span>Panel de trabajo RRHH · CD Isidro Casanova · Grupo Gestión</span><span>${esc(r.t)} · ${dmy(isoOf(now))}</span></div></div>`;
  return {name:`Informe_${r.t.replace(/[^\wáéíóúñ]+/gi,'_')}_${hoy()}`,html:`<!DOCTYPE html><html lang="es-AR"><head><meta charset="utf-8"><title>Informe · ${esc(r.t)}</title><style>${REP_CSS}</style></head><body>${body}</body></html>`};
}
function openReport(k){
  const r=buildReport(k);
  if(!r){ App.toast((REP_EMPTY[k]||'Sin datos')+' para generar el informe.',true); return; }
  repCur=r; $('#rep-title').textContent=r.name.replace(/_/g,' ');
  const fr=$('#rep-frame'); fr.srcdoc=r.html;
  $('#repdlg').classList.add('on'); SND.play('open');
}
function hookReports(){
  Object.keys(REP_VIEW).forEach(v=>{ const h=document.querySelector('#'+v+' .vhead')||document.querySelector('#'+v+' .hero>div');
    if(!h) return; const b=document.createElement('button'); b.className='btn primary sm rep-btn'; b.dataset.report=REP_VIEW[v];
    b.innerHTML='<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'+(v==='v-home'?'Informe general':'Descargar informe');
    if(h.classList.contains('vhead')){ if(!h.querySelector('.sp')){ const sp=document.createElement('span'); sp.className='sp'; h.appendChild(sp); } h.appendChild(b); }
    else { b.style.marginTop='14px'; h.appendChild(b); } });
  document.addEventListener('click',e=>{ const b=e.target.closest('[data-report]'); if(b) openReport(b.dataset.report); });
  $('#rep-close').onclick=()=>{ $('#repdlg').classList.remove('on'); SND.play('close'); };
  $('#repdlg').addEventListener('click',e=>{ if(e.target.id==='repdlg') $('#repdlg').classList.remove('on'); });
  $('#rep-print').onclick=()=>{ try{ const w=$('#rep-frame').contentWindow; w.focus(); w.print(); }catch(e){ App.toast('El navegador bloqueó la impresión. Usá "Descargar HTML" y abrilo aparte.',true); } };
  $('#rep-html').onclick=()=>{ if(repCur){ download(repCur.html,repCur.name+'.html','text/html;charset=utf-8'); App.toast('Informe descargado'); } };
}

/* ================================================================
   GRÁFICOS DE CADA MÓDULO
   ================================================================ */
function ausCharts(){
  const L=LATE(), tol=+DB.tolerancia||0;
  const B=[[tol+1,15],[16,30],[31,60],[61,120],[121,1e9]].filter(b=>b[1]>tol);
  vbars('#x-aus-dist',B.map(([a,b])=>{ const n=L.filter(r=>r.atraso>=a&&r.atraso<=b).length;
    return {l:b>1e8?`+${a-1}′`:`${a}–${b}′`,v:n,c:COL.c4,tip:`Atraso ${b>1e8?'mayor a '+(a-1):a+' a '+b} min\n${n} tardanza(s)`}; }),
    {labels:true,vfmt:v=>v,yfmt:v=>Math.round(v),emptyIfZero:true,empty:'Sin tardanzas cargadas.'});
  const act=safe(activeRecs), cnt=[0,0,0,0,0,0,0], tot=[0,0,0,0,0,0,0];
  act.forEach(r=>{ const d=dObj(r.fecha).getDay(); if(r.status==='ok'||r.status==='tarde') tot[d]++; if(r.status==='tarde') cnt[d]++; });
  vbars('#x-aus-dow',[1,2,3,4,5,6,0].map(d=>({l:DOW[d],v:cnt[d],c:COL.c1,
    tip:`${DOWL[d]}\n${cnt[d]} tardanza(s) de ${tot[d]} fichadas`+(tot[d]?` · ${Math.round(cnt[d]/tot[d]*100)}%`:'')})),
    {labels:true,vfmt:v=>v,yfmt:v=>Math.round(v),emptyIfZero:true,empty:'Sin tardanzas cargadas.'});
}
function vacCharts(){
  vbars('#x-vac-weeks',vacWeeks(16),{labels:true,mark:0,vfmt:v=>v,yfmt:v=>Math.round(v),emptyIfZero:!VAC().length,empty:'Cargá el plan de vacaciones.',color:COL.c1});
  const H=hoy(), lim=addD(H,7);
  const out=VAC().filter(s=>s.desde<=lim&&(s.hasta||s.desde)>=H).sort((a,b)=>a.desde<b.desde?-1:1);
  $('#x-vac-out').innerHTML=out.length? out.map(s=>{ const on=s.desde<=H;
      return `<div><span>${esc(s.nombre)} <span style="color:var(--text3);font-size:12px">· ${esc(s.legajo)}</span></span><em>${on?'<span style="color:#c4b5fd">fuera</span> · vuelve '+dm(addD(s.hasta,1)):'sale '+lblDay(s.desde)}</em></div>`; }).join('')
    : '<div class="empty" style="padding:20px">Nadie fuera ni saliendo esta semana.</div>';
  renderVacPlan();
}
function antCharts(){
  vbars('#x-ant-weeks',bajaWeeks(10),{labels:true,vfmt:v=>v,yfmt:v=>Math.round(v),emptyIfZero:!ANT().length,empty:'Cargá el control de eventuales.',color:COL.c2});
  const act=ACT(), B=[[0,30],[31,60],[61,90],[91,120],[121,180],[181,1e9]];
  vbars('#x-ant-antig',B.map(([a,b])=>{ const n=act.filter(r=>r.antig>=a&&r.antig<=b).length;
    return {l:b>1e8?`+${a-1} d`:`${a}–${b} d`,v:n,c:COL.c3,tip:`Antigüedad ${b>1e8?'mayor a '+(a-1):a+' a '+b} días\n${n} eventual(es)`}; }),
    {labels:true,vfmt:v=>v,yfmt:v=>Math.round(v),emptyIfZero:true,empty:'Sin eventuales activos.'});
}
App.ausCharts=ausCharts; App.vacCharts=vacCharts; App.antCharts=antCharts;

/* --- badges del menú y campana --- */
function refreshBadges(){
  const A=homeA=computeAvisos(), st=modStatus(A);
  const map={aus:'nb-aus',vac:'nb-vac',ant:'nb-ant',f3:'nb-f3'};
  for(const m in map){ const e=$('#'+map[m]); if(!e) continue; e.textContent=st[m].n||''; e.className='nb'+(st[m].s==='crit'?' crit':st[m].s==='warn'?' warn':''); }
  const an=A.filter(a=>a.m==='an').length; $('#nb-an').textContent=an||''; $('#nb-an').className='nb'+(an?' crit':'');
  const alta=A.filter(a=>a.p==='alta').length, media=A.filter(a=>a.p==='media').length;
  $('#nb-home').textContent=alta||''; $('#nb-home').className='nb'+(alta?' crit':'');
  $('#bellN').textContent=(alta+media)||'';
  try{ $('#storeMode').textContent=window.SRV&&SRV.mode==='online'?'Guardado en el servidor':'Guardado en '+Store.mode; }catch(e){}
  Orb.setStatus(st);
}
let rq=0;
App.refresh=()=>{ cancelAnimationFrame(rq); rq=requestAnimationFrame(()=>{
  refreshBadges(); renderSrcBars(); renderTicker();
  if($('#v-home').classList.contains('on')) renderHome();
  if($('#v-agenda').classList.contains('on')) renderAgenda();
  if($('#v-francos').classList.contains('on')) renderFrancos();
  if($('#v-ropa').classList.contains('on')) renderRopa();
  renderFich();
}); };

/* ================================================================
   ANIMACIONES DE ENTRADA
   ================================================================ */
const INTRO={
  'v-vacaciones':()=>{ const H=hoy(), f=fueraEn(H).length, n=VAC().filter(s=>s.desde>=H&&s.desde<=addD(H,30)).length;
    return {t:'Vacaciones',p:VAC().length?`${f} fuera hoy · ${n} salidas en 30 días`:'Cargá el plan para ver las salidas',svg:`
    <svg viewBox="0 0 320 190"><defs><linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b4b"/><stop offset=".55" stop-color="#9d174d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
    <clipPath id="iclip"><rect width="320" height="190" rx="20"/></clipPath></defs>
    <g clip-path="url(#iclip)"><rect width="320" height="190" fill="url(#isky)"/>
    <g class="i-sun"><circle cx="205" cy="126" r="52" fill="#fde68a" opacity=".16"/><circle cx="205" cy="126" r="34" fill="#fde68a"/></g>
    <path class="i-trail" d="M-10 150 Q150 90 330 60" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <g transform="translate(0,118)"><g class="i-plane"><path d="M0 8 L26 6 L36 -4 L41 -4 L36 6 L48 6 L53 1 L56 1 L54 8 L56 15 L53 15 L48 10 L36 10 L41 20 L36 20 L26 10 Z" fill="#fff"/></g></g>
    <rect y="138" width="320" height="52" fill="#0c4a6e"/>
    <g class="i-wave"><path d="M0 146 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#67e8f9" stroke-width="2" fill="none" opacity=".7"/></g>
    <g class="i-wave2"><path d="M-80 160 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#22d3ee" stroke-width="1.5" fill="none" opacity=".45"/></g>
    <ellipse cx="62" cy="152" rx="46" ry="9" fill="#fbbf24" opacity=".9"/>
    <g class="i-palm"><path d="M62 150 Q60 115 72 82" stroke="#78350f" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M72 82 Q52 70 34 84 M72 82 Q90 66 110 78 M72 82 Q66 60 48 58 M72 82 Q84 58 100 56 M72 82 Q74 98 92 104" stroke="#16a34a" stroke-width="5" fill="none" stroke-linecap="round"/></g>
    </g></svg>`}; },
  'v-ausentismo':()=>{ const L=LATE().length;
    return {t:'Llegadas tarde',p:safe(allRecs).length?`${L} tardanzas acumuladas · tolerancia ${DB.tolerancia} min`:'Cargá el reporte del reloj',svg:`
    <svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
    <circle cx="160" cy="95" r="66" fill="#101a2e" stroke="#22d3ee" stroke-width="2" opacity=".9"/>
    <circle cx="160" cy="95" r="74" fill="none" stroke="#22d3ee" stroke-opacity=".15" stroke-width="6"/>
    ${Array.from({length:12},(_,i)=>{const a=i/12*Math.PI*2,r1=i%3?56:52;return `<line x1="${160+Math.sin(a)*r1}" y1="${95-Math.cos(a)*r1}" x2="${160+Math.sin(a)*61}" y2="${95-Math.cos(a)*61}" stroke="#9aa8bf" stroke-width="${i%3?1.5:3}" stroke-linecap="round"/>`}).join('')}
    <path class="i-arc" d="M160 31 A64 64 0 0 1 192 39.6" stroke="#ef4444" stroke-width="7" fill="none" stroke-linecap="round"/>
    <line class="i-hh" x1="160" y1="95" x2="160" y2="62" stroke="#e6edf7" stroke-width="5" stroke-linecap="round"/>
    <line class="i-hm" x1="160" y1="95" x2="160" y2="42" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"/>
    <circle cx="160" cy="95" r="5" fill="#22d3ee"/>
    <g class="i-pop" style="animation-delay:1.15s"><circle cx="228" cy="40" r="15" fill="#ef4444"/><text x="228" y="45" text-anchor="middle" font-family="IBM Plex Mono" font-size="13" font-weight="700" fill="#fff">+${DB.tolerancia}′</text></g>
    </svg>`}; },
  'v-bajas':()=>{ const a=ACT().length, b7=ACT().filter(r=>r.ultimo&&r.ultimo>=hoy()&&r.ultimo<=addD(hoy(),7)).length;
    const P=(x,i,leave)=>`<g class="${leave?'i-leave':'i-p'}" style="animation-delay:${i*90}ms"><circle cx="${x}" cy="84" r="12" fill="${leave?'#f59e0b':'#22d3ee'}"/><rect x="${x-17}" y="101" width="34" height="44" rx="15" fill="${leave?'#f59e0b':'#0b94cf'}"/></g>`;
    return {t:'Eventuales',p:ANT().length?`${a} activos · ${b7} bajan esta semana`:'Cargá el control de eventuales',svg:`
    <svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
    <line x1="20" y1="150" x2="300" y2="150" stroke="rgba(120,160,210,.25)"/>
    ${[40,80,120,160,200].map((x,i)=>P(x,i,false)).join('')}${[240,280].map((x,i)=>P(x,i+5,true)).join('')}
    <text x="260" y="174" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" fill="#fcd34d" class="i-p" style="animation-delay:1.2s">FPP →</text></svg>`}; },
  'v-f3':()=>{ const s=window.F3API?F3API.estado():{}; const cols=['#1d4e6b','#8c2f2a','#8a5a12','#244c9b','#1e5d3c','#4b2e83','#12615c','#0b94cf'];
    let c=''; for(let r=0;r<5;r++) for(let k=0;k<8;k++) c+=`<rect class="i-cell" style="animation-delay:${(r*8+k)*22}ms" x="${36+k*32}" y="${38+r*24}" width="28" height="19" rx="3" fill="${k<2?'#2a3444':cols[(k+r)%8]}" opacity="${k<2?1:.85}"/>`;
    return {t:'Novedades F3',p:s.base?`${s.emp} legajos en la base · ${s.nov?'novedades cargadas':'faltan novedades'}`:'Cargá el F3 del mes anterior',svg:`
    <svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>${c}
    <rect class="i-scan" x="30" y="32" width="260" height="3" fill="#22d3ee" opacity=".8" style="filter:drop-shadow(0 0 6px #22d3ee)"/></svg>`}; },
  'v-anticipos':()=>{ const p=AN().length?'@last':'', t=p?anRowsFor(p,'').reduce((a,r)=>a+r.monto,0):0;
    const coin=(x,y,i)=>`<g class="i-coin" style="animation-delay:${i*70}ms"><rect x="${x-26}" y="${y}" width="52" height="9" fill="#b45309"/><ellipse cx="${x}" cy="${y+9}" rx="26" ry="7" fill="#b45309"/><ellipse cx="${x}" cy="${y}" rx="26" ry="7" fill="#fbbf24" stroke="#fde68a" stroke-width="1"/></g>`;
    let c='', i=0; [[100,5],[160,8],[220,4]].forEach(([x,n])=>{ for(let k=0;k<n;k++) c+=coin(x,150-k*11,i++); });
    return {t:'Anticipos',p:p?`Último cargado (${uniq(lastLotes().map(l=>perShort(l.per))).join(', ')}) · `:'Cargá los archivos de anticipos',count:t,svg:`
    <svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>${c}
    <text x="160" y="40" text-anchor="middle" font-family="Space Grotesk" font-size="26" font-weight="700" fill="#fde68a" class="i-p" style="animation-delay:.6s">$</text></svg>`}; },
  'v-francos':()=>{ const H=hoy(), n=DB.francos?frOn(H).length:0;
    let c=''; for(let r=0;r<4;r++) for(let k=0;k<7;k++){ const i=r*7+k, f=[2,5,9,13,16,20,23,26].includes(i);
      c+=`<g class="i-cell" style="animation-delay:${i*28}ms"><rect x="${46+k*33}" y="${42+r*31}" width="28" height="26" rx="5" fill="${f?'#0e7490':'#16223a'}" stroke="${f?'#22d3ee':'rgba(120,160,210,.2)'}"/>${f?`<text x="${60+k*33}" y="${60+r*31}" text-anchor="middle" font-family="IBM Plex Mono" font-size="13" font-weight="700" fill="#cffafe">F</text>`:''}</g>`; }
    return {t:'Francos',p:DB.francos?`${n} de franco hoy`:'Cargá la planilla de francos asignados',svg:`
    <svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
    ${['L','M','M','J','V','S','D'].map((d,k)=>`<text x="${60+k*33}" y="32" text-anchor="middle" font-family="IBM Plex Mono" font-size="10" fill="#64748b">${d}</text>`).join('')}${c}</svg>`}; },
  'v-ropa':()=>{ const R=ROPA(), S=ropaStats(), pct=R?S.pct:0, h=Math.round(130*pct/100);
    return {t:'Indumentaria',p:R?`${Math.round(pct)}% entregado · ${S.e} de ${S.t}`:'Cargá la planilla de entrega',svg:`
    <svg viewBox="0 0 320 190"><defs><clipPath id="ishirt"><path d="M122 38 L142 30 Q160 46 178 30 L198 38 L236 62 L220 92 L204 84 L204 160 L116 160 L116 84 L100 92 L84 62 Z"/></clipPath>
      <linearGradient id="ifill" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#22c55e"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
    <rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
    <g clip-path="url(#ishirt)"><rect x="80" y="20" width="160" height="150" fill="#16223a"/><rect class="i-fill" x="80" y="${160-h}" width="160" height="${h}" fill="url(#ifill)"/></g>
    <path d="M122 38 L142 30 Q160 46 178 30 L198 38 L236 62 L220 92 L204 84 L204 160 L116 160 L116 84 L100 92 L84 62 Z" fill="none" stroke="#e6edf7" stroke-width="2.5" stroke-linejoin="round"/>
    <text class="i-pop" style="animation-delay:1s" x="160" y="120" text-anchor="middle" font-family="IBM Plex Mono" font-size="24" font-weight="700" fill="#fff">${Math.round(pct)}%</text></svg>`}; },
  'v-agenda':()=>{ const H=hoy(), n=Object.values(computeRange(H,addD(H,6),{all:true})).reduce((a,e)=>a+Object.keys(e).length,0);
    return {t:'Agenda',p:`${n} evento(s) en los próximos 7 días`,svg:`
    <svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
    <g class="i-p"><rect x="95" y="34" width="130" height="126" rx="14" fill="#101a2e" stroke="#22d3ee" stroke-width="2"/><rect x="95" y="34" width="130" height="34" rx="14" fill="#0891b2"/><rect x="95" y="54" width="130" height="14" fill="#0891b2"/>
    <rect x="125" y="24" width="8" height="22" rx="4" fill="#e6edf7"/><rect x="187" y="24" width="8" height="22" rx="4" fill="#e6edf7"/></g>
    <text class="i-pop" style="animation-delay:.35s" x="160" y="132" text-anchor="middle" font-family="Space Grotesk" font-size="54" font-weight="700" fill="#e6edf7">${dObj(H).getDate()}</text>
    <text class="i-p" style="animation-delay:.5s" x="160" y="57" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" font-weight="600" fill="#fff">${MESL[dObj(H).getMonth()].toUpperCase()}</text>
    ${[0,1,2].map(i=>`<circle class="i-pop" style="animation-delay:${.7+i*.12}s" cx="${140+i*20}" cy="148" r="4" fill="${[COL.c1,COL.c2,COL.c4][i]}"/>`).join('')}</svg>`}; }
};
let introT=null;
function playIntro(id){
  if(!UI.anim||UI.gris||reduced||!INTRO[id]) return;
  let d; try{ d=INTRO[id](); }catch(e){ return; }
  const box=$('#intro'); SND.play('whoosh');
  const k=STALE_MSG[id]; if(k){ const u=updInfo(k); d.p+=u.at?` · actualizado ${minsAgo(u.at)}`:''; }
  box.innerHTML=`<div class="ibox">${d.svg}<h3>${esc(d.t)}</h3><p id="introP">${esc(d.p)}</p><div class="skip">CLIC PARA SALTAR</div></div>`;
  requestAnimationFrame(()=>box.classList.add('on'));
  if(d.count){ const el=$('#introP'), t0=performance.now(), base=d.p;
    const step=now=>{ const k=Math.min(1,(now-t0)/1100), e=1-Math.pow(1-k,3); if(!box.classList.contains('on')) return;
      el.textContent=base+fmt$(d.count*e); if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step); }
  clearTimeout(introT); introT=setTimeout(closeIntro,1750);
}
function closeIntro(){ const b=$('#intro'); b.classList.remove('on'); clearTimeout(introT); setTimeout(()=>{ if(!b.classList.contains('on')) b.innerHTML=''; },320); }
$('#intro').addEventListener('click',closeIntro);
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeIntro(); });

/* ================================================================
   NAVEGACIÓN
   ================================================================ */
let curView='v-home';
App.onView=(id,focus)=>{
  if(focus){ setTimeout(()=>{ const r=document.getElementById(focus); if(r) r.scrollIntoView({behavior:'smooth',block:'center'}); },120); }
  const changed=id!==curView; curView=id;
  if(changed){ SND.play('nav'); playIntro(id); staleCheck(id); }
  Orb.active(id==='v-home');
  requestAnimationFrame(()=>{
    if(id==='v-home') renderHome();
    else if(id==='v-ausentismo') ausCharts();
    else if(id==='v-vacaciones') vacCharts();
    else if(id==='v-bajas') antCharts();
    else if(id==='v-anticipos') renderAnticipos();
    else if(id==='v-francos') renderFrancos();
    else if(id==='v-agenda') renderAgenda();
    else if(id==='v-ropa') renderRopa();
    else if(id==='v-config') renderConfig();
    renderSrcBars();
  });
};
let rz; addEventListener('resize',()=>{ clearTimeout(rz); rz=setTimeout(()=>App.onView(curView),250); });

/* ================================================================
   THREE.JS — fondo de datos + núcleo interactivo
   ================================================================ */
const BG=(()=>{
  let r,sc,cam,pts,geo,base,run=false,t=0,mx=0,my=0,last=0;
  function init(){
    if(!window.THREE) return false;
    try{
      const cv=$('#bg3d');
      r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:false,powerPreference:'low-power'});
      r.setPixelRatio(Math.min(devicePixelRatio||1,1.5)); r.setSize(innerWidth,innerHeight,false);
      sc=new THREE.Scene(); sc.fog=new THREE.FogExp2(0x070b14,0.014);
      cam=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,1,300); cam.position.set(0,16,58); cam.lookAt(0,-2,-10);
      const X=120,Z=64,S=1.55; base=new Float32Array(X*Z*3); const col=new Float32Array(X*Z*3);
      const a=new THREE.Color(0x22d3ee), b=new THREE.Color(0x8b5cf6), c=new THREE.Color();
      let k=0; for(let i=0;i<X;i++) for(let j=0;j<Z;j++){
        base[k]=(i-X/2)*S; base[k+1]=0; base[k+2]=(j-Z/2)*S-18;
        c.copy(a).lerp(b,i/X); col[k]=c.r; col[k+1]=c.g; col[k+2]=c.b; k+=3; }
      geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(base.slice(),3));
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      pts=new THREE.Points(geo,new THREE.PointsMaterial({size:.3,vertexColors:true,transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending}));
      sc.add(pts);
      addEventListener('resize',()=>{ r.setSize(innerWidth,innerHeight,false); cam.aspect=innerWidth/innerHeight; cam.updateProjectionMatrix(); if(!run) frame(0); });
      addEventListener('pointermove',e=>{ mx=e.clientX/innerWidth-.5; my=e.clientY/innerHeight-.5; });
      document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&run) loop(); });
      return true;
    }catch(e){ return false; }
  }
  function frame(dt){
    t+=dt; const p=geo.attributes.position.array;
    for(let k=0;k<p.length;k+=3){ const x=base[k], z=base[k+2];
      p[k+1]=Math.sin(x*.11+t*.8)*1.7+Math.cos(z*.14+t*.55)*1.3+Math.sin((x+z)*.045+t*.35)*1.6; }
    geo.attributes.position.needsUpdate=true;
    cam.position.x+=(mx*10-cam.position.x)*.03; cam.position.y+=(16-my*5-cam.position.y)*.03; cam.lookAt(0,-2,-10);
    r.render(sc,cam);
  }
  function loop(now){ if(!run||document.hidden) return; now=now||performance.now();
    const dt=last?Math.min(.05,(now-last)/1000):.016; last=now; frame(dt); requestAnimationFrame(loop); }
  return {
    start(){ if(!r&&!init()) return; $('#bg3d').style.display=''; if(reduced){ frame(.5); return; } if(!run){ run=true; last=0; requestAnimationFrame(loop); } },
    stop(){ run=false; const c=$('#bg3d'); if(c) c.style.display='none'; }
  };
})();

const Orb=(()=>{
  let r,sc,cam,root,orbit,core,shell,sats=[],run=false,ok=false,hover=null,drag=null,last=0,spin=1,status={};
  const MODS=[{m:'aus',n:'Llegadas tarde',v:'v-ausentismo'},{m:'vac',n:'Vacaciones',v:'v-vacaciones'},{m:'ant',n:'Eventuales',v:'v-bajas'},{m:'f3',n:'Novedades F3',v:'v-f3'},{m:'an',n:'Anticipos',v:'v-anticipos'}];
  const SC={crit:0xef4444,warn:0xf59e0b,ok:0x22c55e,none:0x64748b};
  const ray=window.THREE?new THREE.Raycaster():null, v2=window.THREE?new THREE.Vector2():null, tmp=window.THREE?new THREE.Vector3():null;
  function glowTex(){ const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d');
    const gr=g.createRadialGradient(64,64,0,64,64,64); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.25,'rgba(255,255,255,.5)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); }
  function size(){ const w=$('#h-orbwrap').clientWidth||400, h=$('#h-orbwrap').clientHeight||330; r.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); }
  function init(){
    if(!window.THREE) return false;
    try{
      const cv=$('#h-orb');
      r=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true}); r.setPixelRatio(Math.min(devicePixelRatio||1,2));
      sc=new THREE.Scene(); cam=new THREE.PerspectiveCamera(38,1,.1,100); cam.position.set(0,.4,10.5);
      root=new THREE.Group(); root.rotation.x=.12; sc.add(root);
      const tex=glowTex();
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0x0b94cf,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
      glow.scale.set(7,7,1); root.add(glow);
      core=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.5,1)),new THREE.LineBasicMaterial({color:0x22d3ee,transparent:true,opacity:.55}));
      root.add(core);
      root.add(new THREE.Mesh(new THREE.SphereGeometry(1.15,32,32),new THREE.MeshBasicMaterial({color:0x0b94cf,transparent:true,opacity:.18})));
      const sp=new Float32Array(500*3); for(let i=0;i<500;i++){ const u=Math.random()*2-1, th=Math.random()*Math.PI*2, rr=1.95+Math.random()*.15, s=Math.sqrt(1-u*u);
        sp[i*3]=rr*s*Math.cos(th); sp[i*3+1]=rr*u; sp[i*3+2]=rr*s*Math.sin(th); }
      const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
      shell=new THREE.Points(sg,new THREE.PointsMaterial({color:0x8b5cf6,size:.035,transparent:true,opacity:.8})); root.add(shell);
      orbit=new THREE.Group(); orbit.rotation.set(.38,0,-.12); root.add(orbit);
      const R=3.15, ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0,0,R,R).getPoints(160).map(p=>new THREE.Vector3(p.x,0,p.y))),
        new THREE.LineBasicMaterial({color:0x22d3ee,transparent:true,opacity:.22})); orbit.add(ring);
      const VIS=MODS.filter(M=>puedeMod(PV_MOD[M.v]));
      if(!VIS.length){ const w=$('#h-orbwrap'); if(w) w.style.display='none'; }
      VIS.forEach((M,i)=>{
        const a=i/VIS.length*Math.PI*2, pos=new THREE.Vector3(Math.cos(a)*R,0,Math.sin(a)*R);
        const g=new THREE.Group(); g.position.copy(pos); orbit.add(g);
        const mat=new THREE.MeshBasicMaterial({color:SC.none});
        const s=new THREE.Mesh(new THREE.SphereGeometry(.19,24,24),mat); g.add(s);
        const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:SC.none,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
        halo.scale.set(1.1,1.1,1); g.add(halo);
        const hit=new THREE.Mesh(new THREE.SphereGeometry(.55,10,10),new THREE.MeshBasicMaterial()); hit.visible=false; hit.userData.i=i; g.add(hit);
        const beam=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),pos.clone()]),new THREE.LineBasicMaterial({color:SC.none,transparent:true,opacity:.18}));
        orbit.add(beam);
        const lab=document.createElement('div'); lab.className='olab'; lab.textContent=M.n; $('#h-orb-labels').appendChild(lab);
        sats.push({M,g,s,mat,halo,hit,beam,lab,ph:Math.random()*6});
      });
      const cvs=r.domElement;
      cvs.addEventListener('pointerdown',e=>{ drag={x:e.clientX,y:e.clientY,rx:root.rotation.x,ry:root.rotation.y,moved:false}; cvs.setPointerCapture(e.pointerId); cvs.style.cursor='grabbing'; });
      cvs.addEventListener('pointermove',e=>{
        if(drag){ const dx=e.clientX-drag.x, dy=e.clientY-drag.y; if(Math.abs(dx)+Math.abs(dy)>4) drag.moved=true;
          root.rotation.y=drag.ry+dx*.008; root.rotation.x=Math.max(-.6,Math.min(.8,drag.rx+dy*.006)); return; }
        pick(e);
      });
      cvs.addEventListener('pointerup',e=>{ const d=drag; drag=null; cvs.style.cursor=hover!=null?'pointer':'grab';
        if(d&&!d.moved){ pick(e); if(hover!=null) goView(sats[hover].M.v); } });
      cvs.addEventListener('pointerleave',()=>{ hover=null; sats.forEach(s=>s.lab.classList.remove('hot')); });
      addEventListener('resize',()=>{ if(ok) size(); });
      size(); ok=true; return true;
    }catch(e){ console.warn('orb',e); return false; }
  }
  function pick(e){
    const rc=r.domElement.getBoundingClientRect();
    v2.set((e.clientX-rc.left)/rc.width*2-1, -((e.clientY-rc.top)/rc.height)*2+1);
    ray.setFromCamera(v2,cam);
    const hit=ray.intersectObjects(sats.map(s=>s.hit),false)[0];
    hover=hit?hit.object.userData.i:null;
    sats.forEach((s,i)=>s.lab.classList.toggle('hot',i===hover));
    r.domElement.style.cursor=hover!=null?'pointer':'grab';
  }
  function frame(dt,t){
    spin+=((hover!=null||drag?0:1)-spin)*.08;
    orbit.rotation.y+=dt*.22*spin; core.rotation.y-=dt*.25; core.rotation.x+=dt*.08; shell.rotation.y+=dt*.05;
    const w=r.domElement.clientWidth, h=r.domElement.clientHeight;
    sats.forEach((s,i)=>{
      const k=1+Math.sin(t*2.2+s.ph)*.12*(s.st==='crit'?2:1); s.halo.scale.set(1.1*k,1.1*k,1);
      s.g.getWorldPosition(tmp); const z=tmp.z; tmp.project(cam);
      s.lab.style.left=((tmp.x*.5+.5)*w)+'px'; s.lab.style.top=((-tmp.y*.5+.5)*h)+'px';
      s.lab.style.opacity= z<-1.2? .35 : 1; s.lab.style.zIndex= z<-1.2? 1 : 2;
    });
    r.render(sc,cam);
  }
  function loop(now){ if(!run||document.hidden) return; const dt=last?Math.min(.05,(now-last)/1000):.016; last=now; frame(dt,now/1000); requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&run){ last=0; requestAnimationFrame(loop); } });
  return {
    active(on){ if(on&&!ok&&!init()) { $('#h-orbwrap').style.display='none'; return; }
      if(!ok) return;
      if(on){ size(); if(reduced){ frame(0,0); return; } if(!run){ run=true; last=0; requestAnimationFrame(loop); } } else run=false; },
    setStatus(st){ status=st||{}; if(!ok) return;
      sats.forEach(s=>{ const x=status[s.M.m]||{s:'none',n:0}; s.st=x.s; const c=SC[x.s];
        s.mat.color.setHex(c); s.halo.material.color.setHex(c); s.beam.material.color.setHex(c); s.beam.material.opacity=x.s==='none'?.12:.35;
        s.lab.innerHTML=`${esc(s.M.n)}<small>${x.s==='none'?'sin datos':x.n?x.n+' pend.':'al día'}</small>`;
        s.lab.style.borderColor= x.s==='crit'?'rgba(239,68,68,.6)':x.s==='warn'?'rgba(245,158,11,.5)':''; });
      if(reduced&&run===false&&$('#v-home').classList.contains('on')) frame(0,0); }
  };
})();

/* ================================================================
   ENGANCHES CON LOS MÓDULOS EXISTENTES
   ================================================================ */
const wrapFn=(name,after)=>{ const f=window[name]; if(typeof f!=='function') return; window[name]=function(){ const r=f.apply(this,arguments); try{ after(); }catch(e){ console.warn(e); } return r; }; };
wrapFn('render',()=>{ if(curView==='v-ausentismo') ausCharts(); App.refresh(); });
wrapFn('renderVac',()=>{ if(curView==='v-vacaciones') vacCharts(); App.refresh(); });
wrapFn('renderAnt',()=>{ if(curView==='v-bajas') antCharts(); App.refresh(); });

/* reloj */
function tick(){ const d=new Date(); $('#clkT').textContent=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('#clkD').textContent=`${DOW[d.getDay()]} ${d.getDate()} ${MESL[d.getMonth()].slice(0,3)}`; }
tick(); setInterval(tick,15000);
// si la página queda abierta y cambia el día, refrescar avisos
let dayNow=hoy(); setInterval(()=>{ if(hoy()!==dayNow){ dayNow=hoy(); App.refresh(); } },60000);

/* preferencias */
$('#optAnim').checked=UI.anim; $('#opt3d').checked=UI.bg; $('#optSnd').checked=UI.snd!==false;
$('#optSnd').onchange=e=>{ UI.snd=e.target.checked; saveUI(); if(UI.snd) SND.play('ok'); };
$('#optAnim').onchange=e=>{ UI.anim=e.target.checked; saveUI(); };
$('#opt3d').onchange=e=>{ UI.bg=e.target.checked; saveUI(); UI.bg?BG.start():BG.stop(); };

/* arranque */
hookAnticipos(); hookRecs(); hookSources(); hookFrancos(); hookAgenda(); hookRopa(); renderRopa(); hookConfig(); renderConfig(); hookReports(); hookLock();
setTimeout(fichNudge,1800); setInterval(()=>{ renderFich(); fichNudge(); },60000);
loadLinked(); wxFetch(); ferFetch(); renderFrancos();
setInterval(()=>{ renderTicker(); renderSrcBars(); },60000);
setInterval(()=>{ if(!document.hidden) wxFetch(); },30*60e3);
if(UI.bg) BG.start(); else BG.stop();
M365.boot();
renderAnticipos();
App.onView('v-home');
refreshBadges();
/* menú lateral: flechitas para subir y bajar cuando las secciones no entran en pantalla */
(function navArrows(){
  const nav=$('#modnav'), up=$('#navUp'), dn=$('#navDn'); if(!nav||!up||!dn) return;
  const upd=()=>{ const max=nav.scrollHeight-nav.clientHeight, t=nav.scrollTop;
    up.hidden=t<=2; dn.hidden=max<=2||t>=max-2; nav.classList.toggle('fu',!up.hidden); nav.classList.toggle('fd',!dn.hidden); };
  const paso=()=>Math.max(120,nav.clientHeight*.6);
  up.onclick=()=>nav.scrollBy({top:-paso(),behavior:'smooth'}); dn.onclick=()=>nav.scrollBy({top:paso(),behavior:'smooth'});
  nav.addEventListener('scroll',upd,{passive:true}); window.addEventListener('resize',upd);
  if(window.ResizeObserver) new ResizeObserver(upd).observe(nav);
  // la sección activa siempre queda a la vista
  nav.addEventListener('click',e=>{ const b=e.target.closest('.nav-item'); if(b) b.scrollIntoView({block:'nearest',behavior:'smooth'}); });
  setTimeout(upd,300); upd();
})();
})();
