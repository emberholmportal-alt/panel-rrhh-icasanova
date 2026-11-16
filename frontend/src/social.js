/* ================================================================
   COMUNIDAD: usuarios de prueba · almacén compartido · cartelera · buzón
   Hasta que exista el servidor, todo vive en este navegador (IndexedDB).
   La interfaz SHARED es la que después se reemplaza por llamadas al servidor.
   ================================================================ */
const ONLINE=!!(window.SRV&&SRV.mode==='online');
const SHARED=ONLINE?(()=>{
  const call=async(m,u,b)=>{ const r=await fetch(u,{method:m,credentials:'same-origin',headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined}); let j=null; try{ j=await r.json(); }catch(e){}
    if(!r.ok){ const d=j&&j.detail; throw new Error(typeof d==='string'?d:'Error '+r.status); } return j; };
  return { all:col=>call('GET','/api/'+col).then(r=>r.items||[]), put:(col,o)=>call('PUT',`/api/${col}/${encodeURIComponent(o.id)}`,o), del:(col,id)=>call('DELETE',`/api/${col}/${encodeURIComponent(id)}`), clear:async()=>{} };
})():(()=>{
  const DBN='rrhh-ic-comunidad', COLS=['pizarra','buzon'];
  let dbp=null;
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{
    if(!window.indexedDB){ rej(new Error('Este navegador no permite guardar la cartelera.')); return; }
    const r=indexedDB.open(DBN,1);
    r.onupgradeneeded=()=>{ COLS.forEach(c=>{ if(!r.result.objectStoreNames.contains(c)) r.result.createObjectStore(c,{keyPath:'id'}); }); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  }));
  const tx=async(col,mode,fn)=>{ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction(col,mode), s=t.objectStore(col); const q=fn(s); t.oncomplete=()=>res(q&&q.result); t.onerror=()=>rej(t.error); }); };
  return {
    all:col=>tx(col,'readonly',s=>s.getAll()).then(r=>r||[]),
    put:(col,o)=>tx(col,'readwrite',s=>s.put(o)),
    del:(col,id)=>tx(col,'readwrite',s=>s.delete(id)),
    clear:col=>tx(col,'readwrite',s=>s.clear())
  };
})();
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* ---------- usuarios de prueba (locales) ---------- */
const USK='rrhh-ic-users', MEK='rrhh-ic-me';
let USERS=[]; try{ USERS=JSON.parse(localStorage.getItem(USK)||'[]'); }catch(e){}
if(!USERS.length) USERS=[{id:'u-admin',nombre:'Ariel',rol:'admin'},{id:'u-prueba',nombre:'Usuario de prueba',rol:'usuario'}];
let ME=null; try{ ME=USERS.find(u=>u.id===localStorage.getItem(MEK)); }catch(e){}
if(!ME) ME=USERS[0];
if(ONLINE){ USERS=[{id:SRV.user.id,nombre:SRV.user.nombre,rol:SRV.user.rol,username:SRV.user.username}]; ME=USERS[0]; }
const saveUsers=()=>{ if(ONLINE) return; try{ localStorage.setItem(USK,JSON.stringify(USERS)); localStorage.setItem(MEK,ME.id); }catch(e){} };
const isAdmin=()=>ME&&ME.rol==='admin';
const ini=n=>String(n||'?').replace(/,/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const avCol=id=>{ let h=0; for(const c of String(id)) h=(h*31+c.charCodeAt(0))%360; return `hsl(${h} 55% 45%)`; };
function renderMe(){
  $('#meAv').textContent=ini(ME.nombre); $('#meAv').style.background=avCol(ME.id);
  $('#meNm').innerHTML=`${esc(ME.nombre)}<small>${ME.rol==='admin'?'Administrador':'Usuario'}</small>`;
  if(ONLINE){ $('#meMenu').innerHTML=`<div class="me-h">${esc(ME.username||'')}</div><button data-srv-pass><span>Cambiar contraseña</span></button><button data-srv-out><span>Cerrar sesión</span></button>`+(ME.rol==='admin'?`<button data-vercomo class="me-cfg"><span>👁 Ver como otro usuario…</span></button><button data-go="v-config" class="me-cfg">Usuarios y permisos…</button>`:''); }
  else $('#meMenu').innerHTML=`<div class="me-h">Cambiar de usuario <em>(prueba local)</em></div>`+USERS.map(u=>`<button data-meu="${esc(u.id)}" class="${u.id===ME.id?'on':''}"><i style="background:${avCol(u.id)}">${esc(ini(u.nombre))}</i><span>${esc(u.nombre)}<small>${u.rol==='admin'?'Administrador':'Usuario'}</small></span></button>`).join('')+
    `<button data-go="v-config" class="me-cfg">Administrar usuarios de prueba…</button>`;
  const sh=$('#subhead'); if(sh) sh.textContent='Bienvenido '+ME.nombre.split(',').pop().trim().split(' ')[0];
}
function renderUsers(){
  const box=$('#us-list'); if(!box||ONLINE) return;
  box.innerHTML=USERS.map(u=>`<div class="us-row"><i style="background:${avCol(u.id)}">${esc(ini(u.nombre))}</i><b>${esc(u.nombre)}</b>
    <select data-usrol="${esc(u.id)}"><option value="usuario"${u.rol==='usuario'?' selected':''}>Usuario</option><option value="admin"${u.rol==='admin'?' selected':''}>Administrador</option></select>
    ${u.id===ME.id?'<span class="tag ok">actual</span>':`<button class="btn ghost sm" data-meu="${esc(u.id)}">Usar</button><button class="btn danger sm" data-usdel="${esc(u.id)}">Quitar</button>`}</div>`).join('');
}
function setMe(id){ if(ONLINE) return; const u=USERS.find(x=>x.id===id); if(!u) return; ME=u; saveUsers(); renderMe(); renderUsers(); $('#mePill').classList.remove('open');
  App.toast(`Ahora estás como ${u.nombre} (${u.rol==='admin'?'administrador':'usuario'})`); SOC.refresh(); }

/* ---------- utilidades de imagen / texto ---------- */
function fileToDataURL(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(f); }); }
async function compressImg(f,max=1600,q=.82){
  const src=await fileToDataURL(f);
  const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('No pude leer la imagen.')); i.src=src; });
  const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)), w=Math.round(img.naturalWidth*k), h=Math.round(img.naturalHeight*k);
  const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,w,h); x.drawImage(img,0,0,w,h);
  return {src:c.toDataURL('image/jpeg',q),w,h};
}
// HTML con formato permitido (lo que genera el editor); todo lo demás se descarta
const RT_TAGS={B:'b',STRONG:'b',I:'i',EM:'i',U:'u',S:'s',STRIKE:'s',SPAN:'span',FONT:'span',DIV:'div',P:'div',BR:'br',UL:'ul',OL:'ol',LI:'li'};
const RT_CSS=['color','font-size','font-family','font-weight','font-style','text-decoration','text-decoration-line','text-align','background-color'];
function cleanRT(html){
  const tpl=document.createElement('template'); tpl.innerHTML=html;
  const walk=(n,out)=>{ for(const c of [...n.childNodes]){
      if(c.nodeType===3){ out.appendChild(document.createTextNode(c.textContent)); continue; }
      if(c.nodeType!==1) continue;
      const tg=RT_TAGS[c.tagName]; if(!tg){ walk(c,out); continue; }
      const e=document.createElement(tg);
      if(tg!=='br'){ const st=[];
        RT_CSS.forEach(p=>{ const v=c.style.getPropertyValue(p); if(v&&!/url|expression|javascript/i.test(v)) st.push(p+':'+v); });
        if(c.tagName==='FONT'){ if(c.getAttribute('color')) st.push('color:'+c.getAttribute('color').replace(/[^#\w(),.\s]/g,'')); if(c.getAttribute('face')) st.push('font-family:'+c.getAttribute('face').replace(/[^\w\s,'"-]/g,'')); }
        const al=c.getAttribute('align'); if(al&&/^(left|right|center|justify)$/.test(al)) st.push('text-align:'+al);
        if(st.length) e.setAttribute('style',st.join(';'));
        walk(c,e); }
      out.appendChild(e); } };
  const out=document.createElement('div'); walk(tpl.content,out); return out.innerHTML.slice(0,60000);
}
const rtText=html=>{ const d=document.createElement('div'); d.innerHTML=html||''; return d.textContent||''; };

/* ---------- dibujo: trazos vectoriales normalizados (0..1) ---------- */
function drawStrokes(cv,strokes,ratio){
  const x=cv.getContext('2d'), W=cv.width, H=cv.height; x.clearRect(0,0,W,H);
  for(const s of strokes||[]){
    const p=s.p; if(!p||!p.length) continue;
    x.save(); x.globalCompositeOperation=s.e?'destination-out':'source-over'; x.strokeStyle=s.c||'#111'; x.fillStyle=s.c||'#111';
    x.globalAlpha=s.a||1; x.lineWidth=Math.max(.5,s.w*W/900); x.lineCap='round'; x.lineJoin='round';
    if(p.length===1){ x.beginPath(); x.arc(p[0][0]*W,p[0][1]*H,x.lineWidth/2,0,7); x.fill(); x.restore(); continue; }
    x.beginPath(); x.moveTo(p[0][0]*W,p[0][1]*H);
    for(let i=1;i<p.length-1;i++){ const mx=(p[i][0]+p[i+1][0])/2*W, my=(p[i][1]+p[i+1][1])/2*H; x.quadraticCurveTo(p[i][0]*W,p[i][1]*H,mx,my); }
    const l=p[p.length-1]; x.lineTo(l[0]*W,l[1]*H); x.stroke(); x.restore();
  }
}
const DRAW_RATIO=900/560;

/* ================================================================
   CARTELERA
   ================================================================ */
const PZ_BG=['#fffbea','#fef3c7','#fde2e4','#e0f2fe','#dcfce7','#ede9fe','#ffffff','#f1f5f9'];
const PZ_COL=['#111827','#dc2626','#ea580c','#ca8a04','#16a34a','#0891b2','#2563eb','#7c3aed','#db2777','#ffffff'];
const PZ_FONTS=[['Sans','Segoe UI, Arial, sans-serif'],['Serif','Georgia, Times New Roman, serif'],['Mono','Consolas, Courier New, monospace'],['Manuscrita','Comic Sans MS, Segoe Print, cursive'],['Impacto','Impact, Arial Black, sans-serif']];
const SOC={pz:[],bz:[],ok:false};
const pzSeenK=()=>'rrhh-ic-pzseen-'+ME.id;
const pzSeen=()=>{ try{ return localStorage.getItem(pzSeenK())||''; }catch(e){ return ''; } };
const pzNew=()=>SOC.pz.filter(c=>c.autor&&c.autor.id!==ME.id&&(c.upd||c.at)>pzSeen());
const canEdit=c=>c.autor&&(c.autor.id===ME.id)||isAdmin();
SOC.refresh=async()=>{
  try{ SOC.pz=await SHARED.all('pizarra'); SOC.bz=await SHARED.all('buzon'); SOC.ok=true; }catch(e){ SOC.err=e.message; }
  socBadges(); if(curView==='v-pizarra') renderPizarra(); if(curView==='v-buzon') renderBuzon(); if(curView==='v-config') renderUsers();
  App.refresh();
};
function socBadges(){
  const n=pzNew().length, nb=$('#nb-pz'); if(nb){ nb.textContent=n||''; nb.className='nb'+(n?' warn':''); }
  const b=isAdmin()?SOC.bz.filter(x=>x.estado==='nueva').length:SOC.bz.filter(x=>x.autor&&x.autor.id===ME.id&&x.resp&&!x.respVista).length;
  const nz=$('#nb-bz'); if(nz){ nz.textContent=b||''; nz.className='nb'+(b?(isAdmin()?' crit':' warn'):''); }
}
const LOCAL_NOTE=ONLINE?'':'<b>Modo local de prueba:</b> por ahora esto se guarda solo en este navegador. Cuando esté el servidor, lo verán todos los usuarios.';
let pzState={q:'',f:'all',t:''};
/* ---------- tablero: cada aporte queda pegado donde su autor lo deja ---------- */
const BW=1400;                                   // ancho lógico del tablero (las posiciones se guardan en estas unidades)
const PZ_TAM={s:210,m:270,l:370};
const PZ_W=c=>PZ_TAM[c.tam]||PZ_TAM.m;
const PZ_SUP={corcho:'Corcho',blanca:'Pizarra blanca',verde:'Pizarrón'};
const pzSupGet=()=>'blanca';   // la cartelera es siempre una pizarra blanca
let pzZoom=1, pzDrag=null;
const canMove=c=>isAdmin()||(c.autor&&c.autor.id===ME.id&&!c.pin);
function pzRot(id){ let h=0; for(const ch of String(id)) h=(h*33+ch.charCodeAt(0))%1000; return ((h%50)/10-2.5).toFixed(2); }
function pzCardHTML(c,isNew,dim){
  const can=canEdit(c), mv=canMove(c), fecha=fmtAt(c.upd||c.at);
  let body='';
  if(c.tipo==='texto') body=`<div class="pz-txt" style="font-family:${esc(c.font||PZ_FONTS[0][1])}">${c.html||''}</div>`;
  else if(c.tipo==='dibujo') body=`<canvas class="pz-cv" data-pzcv="${esc(c.id)}" width="900" height="560"></canvas>`;
  else if(c.tipo==='imagen') body=`<img class="pz-img" src="${c.img}" alt="" draggable="false" data-pzimg="${esc(c.id)}" title="Doble clic para verla grande">${c.cap?`<div class="pz-cap">${esc(c.cap)}</div>`:''}`;
  return `<article class="pz-card t-${c.tipo}${c.pin?' pin':''}${isNew?' new':''}${dim?' dim':''}${mv?' mv':''}" data-pzid="${esc(c.id)}"
     style="--pzbg:${esc(c.bg||'#fffbea')};--rot:${c.rot!=null?c.rot:pzRot(c.id)}deg;--pin:${c.pin?'#dc2626':avCol(c.autor?c.autor.id:'x')};left:${c.x||0}px;top:${c.y||0}px;width:${PZ_W(c)}px;z-index:${c.z||1}" data-nogris>
    <i class="pz-tack" title="${c.pin?'Anclado por el administrador':'Pegado por '+esc(c.autor?c.autor.nombre:'')}"></i>
    <header><i class="av" style="background:${avCol(c.autor?c.autor.id:'x')}">${esc(ini(c.autor&&c.autor.nombre))}</i><div><b>${esc(c.autor?c.autor.nombre:'—')}</b><span>${esc(fecha)}${c.upd?' · editado':''}</span></div>${isNew?'<em class="pz-nw">nuevo</em>':''}</header>
    <div class="pz-c">${body}</div>
    ${can||isAdmin()?`<footer>${can?`<button data-pzed="${esc(c.id)}">Editar</button><button data-pzdel="${esc(c.id)}" class="d">Borrar</button>`:''}${isAdmin()?`<button data-pzpin="${esc(c.id)}">${c.pin?'Soltar':'Anclar'}</button>`:''}</footer>`:''}
  </article>`;
}
// los aportes viejos (sin posición) se acomodan en filas
function pzAutoPlace(){
  let x=40, y=40, rowH=0, ch=[];
  for(const c of SOC.pz.slice().sort((a,b)=>a.at.localeCompare(b.at))){ if(c.x!=null&&c.y!=null) continue;
    const w=PZ_W(c); if(x+w>BW-40){ x=40; y+=rowH+50; rowH=0; } c.x=x; c.y=y; c.rot=+pzRot(c.id); x+=w+50; rowH=Math.max(rowH,c.tipo==='texto'?200:280); ch.push(c); }
  ch.forEach(c=>SHARED.put('pizarra',c));
}
function pzFit(){
  const wrap=$('#pz-wrap'), inner=$('#pz-board'); if(!wrap||!inner) return;
  const fit=(wrap.clientWidth-2)/BW, s=fit*pzZoom; inner.style.transform=`scale(${s})`; inner.dataset.s=s;
  let H=1000; inner.querySelectorAll('.pz-card').forEach(el=>{ H=Math.max(H,el.offsetTop+el.offsetHeight+120); });
  inner.style.height=H+'px'; $('#pz-stage').style.height=H*s+'px'; $('#pz-stage').style.width=BW*s+'px';
  const zv=$('#pz-zv'); if(zv) zv.textContent=Math.round(pzZoom*100)+'%';
}
function renderPizarra(){
  const wall=$('#pz-wall'); if(!wall) return;
  $('#pz-note').innerHTML=LOCAL_NOTE; $('#pz-note').style.display=ONLINE?'none':'';
  if(!SOC.ok){ wall.innerHTML=`<div class="empty">${esc(SOC.err||'Cargando…')}</div>`; return; }
  pzAutoPlace();
  const seen=pzSeen(), q=pzState.q.trim().toLowerCase(), sup=pzSupGet();
  const isN=c=>c.autor&&c.autor.id!==ME.id&&(c.upd||c.at)>seen;
  const pasa=c=>(!pzState.t||c.tipo===pzState.t)&&(pzState.f!=='mine'||(c.autor&&c.autor.id===ME.id))&&(pzState.f!=='pin'||c.pin)&&(pzState.f!=='new'||isN(c))&&
    (!q||(c.autor&&c.autor.nombre.toLowerCase().includes(q))||rtText(c.html).toLowerCase().includes(q)||String(c.cap||'').toLowerCase().includes(q));
  const filtra=!!(pzState.t||pzState.f!=='all'||q), n=SOC.pz.filter(pasa).length;
  wall.innerHTML=`<div class="pz-bar">
      <span class="pz-cnt">${SOC.pz.length?`${SOC.pz.length} aporte(s)`:''}</span>
      <span class="pz-tip">Arrastrá tus notas para pegarlas donde quieras · doble clic para editar</span>
    </div>
    <div class="pz-frame f-${sup}" data-nogris><div class="pz-wrap" id="pz-wrap"><div class="pz-stage" id="pz-stage"><div class="pz-board s-${sup}" id="pz-board" style="width:${BW}px">
      ${SOC.pz.map(c=>pzCardHTML(c,isN(c),filtra&&!pasa(c))).join('')}
      ${SOC.pz.length?'':'<div class="pz-hint">El tablero está vacío.<br>Usá <b>Escribir</b>, <b>Dibujar</b> o <b>Imagen</b> y después arrastrá tu nota a donde quieras.</div>'}
    </div></div></div>${sup==='blanca'?'<i class="pz-tray"></i>':''}</div>`;
  wall.querySelectorAll('[data-pzcv]').forEach(cv=>{ const c=SOC.pz.find(x=>x.id===cv.dataset.pzcv); if(c) drawStrokes(cv,c.strokes); });
  // imágenes: recalcular el alto cuando cargan
  wall.querySelectorAll('.pz-img').forEach(i=>{ if(!i.complete) i.onload=pzFit; });
  pzFit();
  if(SOC.focus){ const el=wall.querySelector(`[data-pzid="${SOC.focus}"]`); SOC.focus=null; if(el){ el.classList.add('just'); el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}); setTimeout(()=>el.classList.remove('just'),2600); } }
  clearTimeout(SOC.seenT); SOC.seenT=setTimeout(()=>{ try{ localStorage.setItem(pzSeenK(),new Date().toISOString()); }catch(e){} socBadges(); App.refresh(); },4000);
}
// lugar libre para una nota nueva: centro de lo que se está viendo del tablero
function pzSpot(w){
  const wrap=$('#pz-wrap'), inner=$('#pz-board'); const s=inner?+inner.dataset.s||1:1, h=w*0.8;
  let cx=BW/2, cy=300;
  if(wrap){ const r=wrap.getBoundingClientRect(); const vx=wrap.scrollLeft/s, vw=wrap.clientWidth/s, top=Math.max(0,-r.top)/s+wrap.scrollTop/s;
    const vh=(Math.min(window.innerHeight,r.bottom)-Math.max(0,r.top))/s; cx=vx+vw/2; cy=top+Math.max(160,Math.min(vh,900)/2); }
  // busca el lugar libre más cercano al centro de lo que se ve (en espiral), para no tapar otras notas
  const boxes=inner?[...inner.querySelectorAll('.pz-card')].map(el=>[el.offsetLeft-20,el.offsetTop-30,el.offsetLeft+el.offsetWidth+20,el.offsetTop+el.offsetHeight+30]):[];
  const free=(x,y)=>x>=20&&x+w<=BW-20&&y>=20&&!boxes.some(([a,b,c,d])=>x<c&&x+w>a&&y<d&&y+h>b);
  for(let rad=0;rad<2400;rad+=40){ const n=Math.max(1,Math.round(rad/25));
    for(let k=0;k<n;k++){ const t=k/n*Math.PI*2, x=Math.round(cx-w/2+Math.cos(t)*rad), y=Math.round(cy-h/2+Math.sin(t)*rad*.7); if(free(x,y)) return {x,y}; } }
  return {x:Math.round(Math.max(20,Math.min(BW-w-20,cx-w/2))),y:Math.round(Math.max(20,cy))};
}
function pzBoardHooks(){
  const W=$('#pz-wall');
  W.addEventListener('pointerdown',e=>{
    const el=e.target.closest('.pz-card'); if(!el||e.button!==0||e.target.closest('footer,button,a')) return;
    const c=SOC.pz.find(x=>x.id===el.dataset.pzid); if(!c) return;
    if(!canMove(c)){ el.classList.add('nope'); setTimeout(()=>el.classList.remove('nope'),400); return; }
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const s=+$('#pz-board').dataset.s||1, maxZ=Math.max(1,...SOC.pz.map(x=>x.z||1));
    el.style.zIndex=maxZ+1; el.classList.add('drag');
    pzDrag={el,c,s,px:e.clientX,py:e.clientY,x:c.x||0,y:c.y||0,moved:false,z:maxZ+1};
  });
  W.addEventListener('pointermove',e=>{ if(!pzDrag) return; const d=pzDrag;
    const dx=(e.clientX-d.px)/d.s, dy=(e.clientY-d.py)/d.s; if(Math.abs(dx)+Math.abs(dy)>3) d.moved=true;
    d.nx=Math.round(Math.max(0,Math.min(BW-d.el.offsetWidth,d.x+dx))); d.ny=Math.round(Math.max(0,d.y+dy));
    d.el.style.left=d.nx+'px'; d.el.style.top=d.ny+'px';
    // autodesplazamiento cerca de los bordes de la ventana
    if(e.clientY>window.innerHeight-40) window.scrollBy(0,14); else if(e.clientY<90) window.scrollBy(0,-14);
  });
  const end=async e=>{ if(!pzDrag) return; const d=pzDrag; pzDrag=null; d.el.classList.remove('drag');
    if(!d.moved){ d.el.style.zIndex=d.c.z||1; return; }
    d.c.x=d.nx; d.c.y=d.ny; d.c.z=d.z; d.c.rot=+(Math.random()*5-2.5).toFixed(2); d.el.style.setProperty('--rot',d.c.rot+'deg');
    d.el.classList.add('stick'); setTimeout(()=>d.el.classList.remove('stick'),450); SND.play('click');
    try{ await SHARED.put('pizarra',d.c); }catch(err){ App.toast('No se pudo guardar la posición: '+err.message,true); }
    pzFit(); };
  W.addEventListener('pointerup',end); W.addEventListener('pointercancel',end);
  W.addEventListener('dblclick',e=>{ const el=e.target.closest('.pz-card'); if(!el) return; const c=SOC.pz.find(x=>x.id===el.dataset.pzid); if(!c) return;
    if(e.target.closest('[data-pzimg]')){ const w=window.open(); if(w){ w.document.title='Imagen de la cartelera'; w.document.body.style.cssText='margin:0;background:#111;display:grid;place-items:center;min-height:100vh'; const i=w.document.createElement('img'); i.src=c.img; i.style.cssText='max-width:100%;max-height:100vh'; w.document.body.appendChild(i); } return; }
    if(canEdit(c)) pzOpen(c.tipo,c); });
  W.addEventListener('change',e=>{ if(e.target.id==='pz-sup'){ try{ localStorage.setItem('rrhh-ic-pzsup',e.target.value); }catch(x){} renderPizarra(); } });
  W.addEventListener('click',e=>{ const t=e.target.closest('#pz-zm,#pz-zp,#pz-zf'); if(!t) return;
    pzZoom=t.id==='pz-zf'?1:Math.max(.5,Math.min(2.5,+(pzZoom+(t.id==='pz-zp'?.25:-.25)).toFixed(2))); pzFit(); });
  window.addEventListener('resize',()=>{ if(curView==='v-pizarra') pzFit(); });
}

/* ---------- editor de aportes ---------- */

let PZE=null;   // {tipo, id?, ...estado del editor}
function pzOpen(tipo,card){
  const c=card||{}; PZE={tam:c.tam||'m',tipo,id:c.id||null,bg:c.bg||(tipo==='dibujo'?'#ffffff':'#fffbea'),strokes:JSON.parse(JSON.stringify(c.strokes||[])),redo:[],img:c.img||null,iw:c.iw,ih:c.ih,
    col:'#111827',w:6,tool:'pen',font:c.font||PZ_FONTS[0][1]};
  $('#pz-dlg-h').textContent=(card?'Editar ':'Nuevo aporte · ')+({texto:'texto',dibujo:'dibujo',imagen:'imagen'}[tipo]);
  $('#pz-save').textContent=card?'Guardar cambios':'Publicar';
  const bgs=`<div class="pz-row"><span class="pz-lb">Color de la nota</span>${PZ_BG.map(b=>`<button class="pz-sw bg${b===PZE.bg?' on':''}" data-pzbg="${b}" style="background:${b}" title="${b}"></button>`).join('')}<span class="pz-sep"></span><span class="pz-lb">Tamaño de la nota</span>${[['s','Chica'],['m','Mediana'],['l','Grande']].map(([k,v])=>`<button class="pz-tm${k===PZE.tam?' on':''}" data-pztam="${k}">${v}</button>`).join('')}</div>`;
  const cols=(k)=>PZ_COL.map(c=>`<button class="pz-sw" data-${k}="${c}" style="background:${c}" title="${c}"></button>`).join('')+`<label class="pz-pick" title="Otro color"><input type="color" id="pz-${k}-x" value="#111827"></label>`;
  let h='';
  if(tipo==='texto'){
    h=`<div class="pz-tb">
      <select id="pz-font" title="Tipografía">${PZ_FONTS.map(([n,f])=>`<option value="${esc(f)}"${f===PZE.font?' selected':''} style="font-family:${esc(f)}">${n}</option>`).join('')}</select>
      <select id="pz-size" title="Tamaño"><option value="">Tamaño</option>${[12,14,16,18,22,26,32,40,48].map(s=>`<option value="${s}">${s}px</option>`).join('')}</select>
      <button data-rt="bold" title="Negrita"><b>N</b></button><button data-rt="italic" title="Cursiva"><i>C</i></button><button data-rt="underline" title="Subrayado"><u>S</u></button><button data-rt="strikeThrough" title="Tachado"><s>T</s></button>
      <span class="pz-sep"></span><button data-rt="justifyLeft" title="Alinear a la izquierda">⯇</button><button data-rt="justifyCenter" title="Centrar">≡</button><button data-rt="justifyRight" title="Alinear a la derecha">⯈</button><button data-rt="insertUnorderedList" title="Viñetas">•</button>
      <span class="pz-sep"></span><span class="pz-lb">Color</span>${cols('rtc')}
    </div>
    <div class="pz-ed" id="pz-ed" contenteditable="true" style="background:${PZE.bg};font-family:${esc(PZE.font)}" data-ph="Escribí acá…">${c.html||''}</div>${bgs}`;
  } else if(tipo==='dibujo'){
    h=`<div class="pz-tb">
      <button data-pztool="pen" class="on" title="Lápiz">✎ Lápiz</button><button data-pztool="mark" title="Resaltador (semitransparente)">▮ Resaltador</button><button data-pztool="eraser" title="Goma">⌫ Goma</button>
      <span class="pz-sep"></span><span class="pz-lb">Grosor</span><input type="range" id="pz-w" min="1" max="40" value="6"><b id="pz-wv" class="pz-wv">6</b>
      <span class="pz-sep"></span><span class="pz-lb">Color</span>${cols('drc')}
      <span class="pz-sep"></span><button id="pz-undo" title="Deshacer (Ctrl+Z)">↶</button><button id="pz-redo" title="Rehacer">↷</button><button id="pz-clr" title="Borrar todo el dibujo">Limpiar</button>
    </div>
    <div class="pz-cvw"><canvas id="pz-cv" width="1800" height="1120" style="background:${PZE.bg}"></canvas><i class="pz-cur" id="pz-cur"></i></div>${bgs}`;
  } else {
    h=`<div class="pz-drop" id="pz-drop">${PZE.img?`<img src="${PZE.img}" alt="">`:'<div><b>Arrastrá una imagen acá</b><br>o pegala con Ctrl+V, o</div>'}<button class="btn ghost sm" id="pz-img-b">${PZE.img?'Cambiar imagen…':'Elegir imagen…'}</button><input type="file" id="pz-img" accept="image/*" hidden></div>
    <div class="field"><label>Texto (opcional)</label><input type="text" id="pz-cap" maxlength="280" value="${esc(c.cap||'')}" placeholder="Un comentario para la imagen"></div>${bgs}`;
  }
  $('#pz-body').innerHTML=h; $('#pz-dlg').classList.add('on'); document.body.classList.add('noscroll');
  if(tipo==='texto'){ const ed=$('#pz-ed'); setTimeout(()=>{ ed.focus(); try{ document.execCommand('styleWithCSS',false,true); }catch(e){} },50); }
  if(tipo==='dibujo') pzDrawInit();
  if(tipo==='imagen'){ const d=$('#pz-drop');
    $('#pz-img-b').onclick=()=>$('#pz-img').click(); $('#pz-img').onchange=e=>{ if(e.target.files[0]) pzSetImg(e.target.files[0]); };
    ['dragenter','dragover'].forEach(v=>d.addEventListener(v,e=>{ e.preventDefault(); d.classList.add('hot'); }));
    ['dragleave','drop'].forEach(v=>d.addEventListener(v,e=>{ e.preventDefault(); d.classList.remove('hot'); }));
    d.addEventListener('drop',e=>{ const f=[...e.dataTransfer.files].find(f=>/^image\//.test(f.type)); if(f) pzSetImg(f); }); }
}
async function pzSetImg(f){
  if(f.size>25e6){ App.toast('La imagen es demasiado grande (máximo 25 MB).',true); return; }
  try{ const r=await compressImg(f); PZE.img=r.src; PZE.iw=r.w; PZE.ih=r.h;
    $('#pz-drop').innerHTML=`<img src="${r.src}" alt=""><button class="btn ghost sm" id="pz-img-b">Cambiar imagen…</button><input type="file" id="pz-img" accept="image/*" hidden>`;
    $('#pz-img-b').onclick=()=>$('#pz-img').click(); $('#pz-img').onchange=e=>{ if(e.target.files[0]) pzSetImg(e.target.files[0]); };
  }catch(e){ App.toast(e.message,true); }
}
function pzClose(){ $('#pz-dlg').classList.remove('on'); document.body.classList.remove('noscroll'); PZE=null; }
function pzDrawInit(){
  const cv=$('#pz-cv'), cur=$('#pz-cur'); let st=null;
  const redraw=()=>drawStrokes(cv,PZE.strokes);
  const pos=e=>{ const r=cv.getBoundingClientRect(); return [Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))]; };
  cv.onpointerdown=e=>{ e.preventDefault(); cv.setPointerCapture(e.pointerId);
    const t=PZE.tool; st={c:PZE.col,w:t==='mark'?Math.max(PZE.w,14):PZE.w,p:[pos(e)]}; if(t==='eraser') st.e=1; if(t==='mark') st.a=.35;
    PZE.strokes.push(st); PZE.redo=[]; redraw(); };
  cv.onpointermove=e=>{ const r=cv.getBoundingClientRect(), sz=Math.max(4,(PZE.tool==='mark'?Math.max(PZE.w,14):PZE.w)*r.width/900);
    cur.style.cssText=`left:${e.clientX-r.left}px;top:${e.clientY-r.top}px;width:${sz}px;height:${sz}px;border-color:${PZE.tool==='eraser'?'#64748b':PZE.col}`;
    if(!st) return; const p=pos(e), l=st.p[st.p.length-1]; if(Math.hypot(p[0]-l[0],p[1]-l[1])<.0015) return; st.p.push(p); redraw(); };
  const end=()=>{ if(st){ st.p=st.p.map(([x,y])=>[+x.toFixed(4),+y.toFixed(4)]); st=null; } };
  cv.onpointerup=end; cv.onpointercancel=end; cv.onpointerleave=e=>{ cur.style.width='0'; };
  $('#pz-w').oninput=e=>{ PZE.w=+e.target.value; $('#pz-wv').textContent=PZE.w; };
  $('#pz-undo').onclick=()=>{ if(PZE.strokes.length){ PZE.redo.push(PZE.strokes.pop()); redraw(); } };
  $('#pz-redo').onclick=()=>{ if(PZE.redo.length){ PZE.strokes.push(PZE.redo.pop()); redraw(); } };
  $('#pz-clr').onclick=()=>{ if(PZE.strokes.length&&confirm('¿Borrar todo el dibujo?')){ PZE.redo=PZE.strokes.slice().reverse(); PZE.strokes=[]; redraw(); } };
  $('#pz-drc-x').oninput=e=>{ PZE.col=e.target.value; if(PZE.tool==='eraser') pzTool('pen'); };
  redraw();
}
function pzTool(t){ PZE.tool=t; document.querySelectorAll('[data-pztool]').forEach(b=>b.classList.toggle('on',b.dataset.pztool===t)); }
async function pzSave(){
  const P=PZE; if(!P) return;
  const prev=P.id?SOC.pz.find(x=>x.id===P.id):null;
  if(prev&&!canEdit(prev)){ App.toast('Solo el autor o un administrador puede editar este aporte.',true); return; }
  const o=prev?Object.assign({},prev):{id:uid(),tipo:P.tipo,autor:{id:ME.id,nombre:ME.nombre},at:new Date().toISOString(),pin:false};
  o.bg=P.bg; o.tam=P.tam;
  if(!prev){ const sp=pzSpot(PZ_W(o)); o.x=sp.x; o.y=sp.y; o.z=Math.max(1,...SOC.pz.map(x=>x.z||1))+1; o.rot=+(Math.random()*5-2.5).toFixed(2); SOC.focus=o.id; }
  if(P.tipo==='texto'){ const html=cleanRT($('#pz-ed').innerHTML); if(!rtText(html).trim()){ App.toast('Escribí algo antes de publicar.',true); return; } o.html=html; o.font=P.font; }
  if(P.tipo==='dibujo'){ if(!P.strokes.filter(s=>!s.e).length){ App.toast('Dibujá algo antes de publicar.',true); return; } o.strokes=P.strokes; }
  if(P.tipo==='imagen'){ if(!P.img){ App.toast('Elegí una imagen.',true); return; } o.img=P.img; o.iw=P.iw; o.ih=P.ih; o.cap=$('#pz-cap').value.trim(); }
  if(prev){ o.upd=new Date().toISOString(); if(prev.autor&&prev.autor.id!==ME.id) o.editPor=ME.nombre; }
  try{ await SHARED.put('pizarra',o); }catch(e){ App.toast('No se pudo guardar: '+e.message,true); return; }
  SND.play('add'); pzClose(); App.toast(prev?'Aporte actualizado':'Nota pegada en el tablero: arrastrala a donde quieras'); SOC.refresh();
}

/* ================================================================
   BUZÓN
   ================================================================ */
const BZ_EST={nueva:'Nueva',leida:'Leída',curso:'En curso',respondida:'Respondida',cerrada:'Cerrada'};
const BZ_CAT={mejora:'Mejora',problema:'Problema',consulta:'Consulta',otro:'Otro',acceso:'Pedido de acceso'};
let bzState={sel:'',att:null,fe:'abiertas',fc:'',q:''};
const bzTag=e=>`<span class="bz-st s-${e}">${BZ_EST[e]||e}</span>`;
function renderBuzon(){
  if(!$('#v-buzon')) return;
  $('#bz-note').innerHTML=ONLINE?'':LOCAL_NOTE+(isAdmin()?' Estás como <b>administrador</b>: abajo ves la bandeja con todas las sugerencias.':' Cambiá a un usuario administrador (arriba a la derecha) para ver la bandeja.');
  $('#bz-note').style.display=ONLINE?'none':'';
  if(!SOC.ok){ $('#bz-mine').innerHTML=`<div class="empty">${esc(SOC.err||'Cargando…')}</div>`; return; }
  // mis sugerencias (las anónimas no se pueden seguir)
  const mine=SOC.bz.filter(x=>x.autor&&x.autor.id===ME.id).sort((a,b)=>b.at.localeCompare(a.at));
  $('#bz-mine-m').textContent=mine.length?`${mine.length} enviada(s)`:'';
  $('#bz-mine').innerHTML=mine.length?mine.map(x=>`<div class="bz-it${x.resp&&!x.respVista?' unread':''}">
      <div class="bz-ih"><b>${esc(x.asunto)}</b>${bzTag(x.estado)}</div><div class="bz-im">${esc(BZ_CAT[x.cat]||x.cat)} · ${fmtAt(x.at)}</div>
      <p>${esc(x.msg)}</p>${x.resp?`<div class="bz-resp"><span>Respuesta de ${esc(x.respPor||'administración')} · ${fmtAt(x.respAt)}</span>${esc(x.resp)}</div>`:''}</div>`).join('')
    :'<div class="empty">Todavía no enviaste sugerencias con tu nombre. Las anónimas no aparecen acá.</div>';
  // marcar respuestas como vistas
  const nv=mine.filter(x=>x.resp&&!x.respVista); if(nv.length) setTimeout(async()=>{ for(const x of nv){ x.respVista=true; await SHARED.put('buzon',x); } socBadges(); },3000);
  // bandeja admin
  const adm=$('#bz-admin'); adm.hidden=!isAdmin(); if(!isAdmin()) return;
  const q=bzState.q.trim().toLowerCase();
  const L=SOC.bz.filter(x=>(!bzState.fe||(bzState.fe==='abiertas'?!['cerrada'].includes(x.estado):x.estado===bzState.fe))&&(!bzState.fc||x.cat===bzState.fc)&&
    (!q||(x.asunto+' '+x.msg+' '+(x.autor?x.autor.nombre:'anónimo')).toLowerCase().includes(q))).sort((a,b)=>(a.estado==='nueva'?0:1)-(b.estado==='nueva'?0:1)||b.at.localeCompare(a.at));
  const cnt=k=>SOC.bz.filter(x=>x.estado===k).length;
  $('#bz-adm-m').textContent=`${SOC.bz.length} en total · ${cnt('nueva')} nueva(s) · ${cnt('curso')} en curso`;
  $('#bz-inbox').innerHTML=L.length?L.map(x=>`<button class="bz-row${x.id===bzState.sel?' on':''}${x.estado==='nueva'?' nueva':''}" data-bz="${esc(x.id)}">
      <span class="bz-rh"><b>${esc(x.asunto)}</b>${bzTag(x.estado)}</span><span class="bz-rm">${x.autor?esc(x.autor.nombre):x.cat==='acceso'?'<i>Sin usuario</i>':'<i>Anónima</i>'} · ${esc(BZ_CAT[x.cat]||x.cat)} · ${fmtAt(x.at)}${x.att?' · 📎':''}</span></button>`).join('')
    :'<div class="empty">No hay sugerencias con ese filtro.</div>';
  const s=SOC.bz.find(x=>x.id===bzState.sel);
  $('#bz-det').innerHTML=!s?'<div class="empty">Elegí una sugerencia de la lista para leerla y responder.</div>':`
    <div class="bz-dh"><h4>${esc(s.asunto)}</h4>${bzTag(s.estado)}</div>
    <div class="bz-im">${s.autor?'De <b>'+esc(s.autor.nombre)+'</b>':s.cat==='acceso'?'<b>Pedido desde la pantalla de ingreso</b> (sin usuario: contestale por el contacto que dejó)':'<b>Anónima</b> (no se guardó quién la envió)'} · ${esc(BZ_CAT[s.cat]||s.cat)} · ${fmtAt(s.at)}</div>
    <div class="bz-msg">${esc(s.msg)}</div>
    ${s.att?(/^data:image\//.test(s.att.data)?`<a class="bz-attv" href="#" data-bzatt="${esc(s.id)}"><img src="${s.att.data}" alt=""><span>📎 ${esc(s.att.name)}</span></a>`:`<a class="bz-attv f" href="#" data-bzatt="${esc(s.id)}">📎 ${esc(s.att.name)} · descargar</a>`):''}
    <div class="filters" style="margin-top:14px"><div class="field"><label>Estado</label><select id="bz-est">${Object.entries(BZ_EST).map(([k,v])=>`<option value="${k}"${k===s.estado?' selected':''}>${v}</option>`).join('')}</select></div></div>
    ${s.autor?`<div class="field" style="margin-top:10px"><label>Respuesta para ${esc(s.autor.nombre)}</label><textarea id="bz-resp" rows="4" maxlength="4000" placeholder="La verá en “Mis sugerencias”">${esc(s.resp||'')}</textarea></div>`:`<p class="cf-note">${s.cat==='acceso'?'No tiene usuario en el panel: respondele por el contacto que dejó y, si corresponde, creale el usuario en Configuración → Usuarios y permisos.':'Es anónima: no se puede responder. Podés cambiarle el estado para tu seguimiento.'}</p>`}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primary sm" id="bz-save">${s.autor?'Guardar y responder':'Guardar estado'}</button><button class="btn danger sm" id="bz-del">Eliminar</button></div>`;
}
async function bzOpen(id){
  bzState.sel=id; const s=SOC.bz.find(x=>x.id===id);
  if(s&&s.estado==='nueva'){ s.estado='leida'; s.leidaAt=new Date().toISOString(); await SHARED.put('buzon',s); socBadges(); App.refresh(); }
  renderBuzon();
}
async function bzSend(){
  const as=$('#bz-as').value.trim(), msg=$('#bz-msg').value.trim(), anon=document.querySelector('input[name="bz-who"]:checked').value==='anon';
  if(!as||!msg){ App.toast('Completá el asunto y el mensaje.',true); return; }
  const o={id:uid(),asunto:as,cat:$('#bz-cat').value,msg,att:bzState.att,estado:'nueva',at:new Date().toISOString(),autor:anon?null:{id:ME.id,nombre:ME.nombre}};
  try{ await SHARED.put('buzon',o); }catch(e){ App.toast('No se pudo enviar: '+e.message,true); return; }
  $('#bz-as').value=''; $('#bz-msg').value=''; bzState.att=null; $('#bz-att-n').textContent='Imagen o PDF, hasta 3 MB';
  document.querySelector('input[name="bz-who"][value="nom"]').checked=true;
  SND.play('add'); App.toast(anon?'Sugerencia anónima enviada. No se guardó quién la envió.':'Sugerencia enviada. Vas a ver la respuesta en “Mis sugerencias”.'); SOC.refresh();
}

/* ---------- avisos: la cartelera y el buzón también avisan en Inicio y en la barra ---------- */
const _caSoc=computeAvisos;
computeAvisos=function(){ const A=_caSoc();
  try{ const n=pzNew().length; if(n) A.push({p:'media',m:'pz',t:'Cartelera · novedades',v:`${n} aporte(s) nuevo(s) en la cartelera`,d:'Publicados por otros usuarios desde tu última visita',go:'v-pizarra'});
    if(isAdmin()){ const b=SOC.bz.filter(x=>x.estado==='nueva').length; if(b) A.push({p:'alta',m:'bz',t:'Buzón · sin leer',v:`${b} sugerencia(s) nueva(s) en el buzón`,d:'Entrá al buzón para leerlas y responder',go:'v-buzon'}); }
    else { const r=SOC.bz.filter(x=>x.autor&&x.autor.id===ME.id&&x.resp&&!x.respVista).length; if(r) A.push({p:'media',m:'bz',t:'Buzón · respuestas',v:`Tenés ${r} respuesta(s) a tus sugerencias`,d:'Mirá “Mis sugerencias”',go:'v-buzon'}); }
  }catch(e){}
  return A; };

/* ---------- enganche con la navegación y eventos ---------- */
const _ovSoc=App.onView;
App.onView=(id,focus)=>{ _ovSoc(id,focus); if(id==='v-pizarra') renderPizarra(); else if(id==='v-buzon') renderBuzon(); else if(id==='v-config') renderUsers();
  if(ONLINE&&(id==='v-pizarra'||id==='v-buzon')) SOC.refresh(); };
INTRO['v-pizarra']=()=>({t:'Cartelera',p:SOC.pz.length?`${SOC.pz.length} aporte(s) · ${pzNew().length} nuevo(s) para vos`:'Escribí, dibujá o subí una imagen para todos',svg:`<svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
  <rect x="40" y="30" width="240" height="130" rx="8" fill="#13203a" stroke="#22d3ee" stroke-opacity=".4"/>
  <g class="i-pz1"><rect x="58" y="46" width="70" height="56" rx="4" fill="#fef3c7" transform="rotate(-4 93 74)"/><path d="M66 62h48M66 72h40M66 82h44" stroke="#92400e" stroke-width="3" stroke-linecap="round" transform="rotate(-4 93 74)"/></g>
  <g class="i-pz2"><rect x="140" y="52" width="66" height="74" rx="4" fill="#e0f2fe" transform="rotate(3 173 89)"/><path d="M150 108c10-24 20 8 30-14s14 4 18-6" stroke="#2563eb" stroke-width="3" fill="none" stroke-linecap="round" transform="rotate(3 173 89)"/></g>
  <g class="i-pz3"><rect x="214" y="44" width="52" height="60" rx="4" fill="#dcfce7" transform="rotate(-2 240 74)"/><circle cx="232" cy="64" r="7" fill="#16a34a" transform="rotate(-2 240 74)"/><path d="M220 98l14-14 10 10 8-6 10 10" stroke="#16a34a" stroke-width="3" fill="none" transform="rotate(-2 240 74)"/></g>
  <g class="i-pzpen"><path d="M222 150l40-40 8 8-40 40-12 4z" fill="#22d3ee"/></g></svg>`});
INTRO['v-buzon']=()=>({t:'Buzón',p:isAdmin()?`${SOC.bz.filter(x=>x.estado==='nueva').length} sugerencia(s) nueva(s)`:'Tu idea llega directo al administrador',svg:`<svg viewBox="0 0 320 190"><rect width="320" height="190" rx="20" fill="#0b1324" stroke="rgba(120,160,210,.2)"/>
  <g class="i-bzl"><rect x="96" y="40" width="128" height="80" rx="6" fill="#e6edf7"/><path d="M96 46l64 42 64-42" stroke="#64748b" stroke-width="3" fill="none"/></g>
  <rect x="80" y="110" width="160" height="56" rx="10" fill="#13203a" stroke="#22d3ee" stroke-opacity=".5"/><rect x="118" y="120" width="84" height="8" rx="4" fill="#070b14"/>
  <circle cx="160" cy="148" r="6" fill="#22d3ee"/></svg>`});

function hookSocial(){
  renderMe();
  $('#meBtn').onclick=e=>{ e.stopPropagation(); $('#mePill').classList.toggle('open'); };
  document.addEventListener('click',e=>{
    const mu=e.target.closest('[data-meu]'); if(mu){ setMe(mu.dataset.meu); return; }
    if(!e.target.closest('#mePill')) $('#mePill').classList.remove('open');
    const g=e.target.closest('#meMenu [data-go]'); if(g){ goView(g.dataset.go); $('#mePill').classList.remove('open'); return; }
    // cartelera
    const nw=e.target.closest('[data-pznew]'); if(nw){ pzOpen(nw.dataset.pznew); return; }
    const ed=e.target.closest('[data-pzed]'); if(ed){ const c=SOC.pz.find(x=>x.id===ed.dataset.pzed); if(c) pzOpen(c.tipo,c); return; }
    const dl=e.target.closest('[data-pzdel]'); if(dl){ const c=SOC.pz.find(x=>x.id===dl.dataset.pzdel); if(!c||!canEdit(c)) return;
      if(confirm(c.autor.id===ME.id?'¿Borrar tu aporte de la cartelera?':`¿Borrar el aporte de ${c.autor.nombre}? (como administrador)`)) SHARED.del('pizarra',c.id).then(()=>{ App.toast('Aporte borrado'); SOC.refresh(); }); return; }
    const pn=e.target.closest('[data-pzpin]'); if(pn&&isAdmin()){ const c=SOC.pz.find(x=>x.id===pn.dataset.pzpin); if(c){ c.pin=!c.pin; SHARED.put('pizarra',c).then(()=>{ App.toast(c.pin?'Nota anclada: solo un administrador puede moverla':'Nota soltada'); SOC.refresh(); }); } return; }
    if(PZE){
      const bg=e.target.closest('[data-pzbg]'); if(bg){ PZE.bg=bg.dataset.pzbg; document.querySelectorAll('[data-pzbg]').forEach(b=>b.classList.toggle('on',b===bg)); const t=$('#pz-ed')||$('#pz-cv'); if(t) t.style.background=PZE.bg; return; }
      const rc=e.target.closest('[data-rtc]'); if(rc){ e.preventDefault(); document.execCommand('foreColor',false,rc.dataset.rtc); $('#pz-ed').focus(); return; }
      const rt=e.target.closest('[data-rt]'); if(rt){ e.preventDefault(); document.execCommand(rt.dataset.rt); $('#pz-ed').focus(); return; }
      const dc=e.target.closest('[data-drc]'); if(dc){ PZE.col=dc.dataset.drc; $('#pz-drc-x').value=dc.dataset.drc; if(PZE.tool==='eraser') pzTool('pen'); return; }
      const tl=e.target.closest('[data-pztool]'); if(tl){ pzTool(tl.dataset.pztool); return; }
      const tm=e.target.closest('[data-pztam]'); if(tm){ PZE.tam=tm.dataset.pztam; document.querySelectorAll('[data-pztam]').forEach(b=>b.classList.toggle('on',b===tm)); return; }
    }
    // buzón
    const bz=e.target.closest('[data-bz]'); if(bz){ bzOpen(bz.dataset.bz); return; }
    const ba=e.target.closest('[data-bzatt]'); if(ba){ e.preventDefault(); const s=SOC.bz.find(x=>x.id===ba.dataset.bzatt); if(s&&s.att){ const a=document.createElement('a'); a.href=s.att.data; a.download=s.att.name; a.click(); } return; }
  });
  // botones del editor de texto: que no roben la selección
  document.addEventListener('mousedown',e=>{ if(e.target.closest('#pz-body [data-rt],#pz-body [data-rtc]')) e.preventDefault(); });
  document.addEventListener('change',e=>{
    if(e.target.id==='pz-font'&&PZE){ PZE.font=e.target.value; $('#pz-ed').style.fontFamily=PZE.font; }
    if(e.target.id==='pz-size'&&PZE&&e.target.value){ const px=e.target.value; $('#pz-ed').focus(); document.execCommand('fontSize',false,'7');
      $('#pz-ed').querySelectorAll('font[size="7"]').forEach(f=>{ f.removeAttribute('size'); f.style.fontSize=px+'px'; });
      $('#pz-ed').querySelectorAll('span').forEach(s=>{ if(s.style.fontSize==='xxx-large'||s.style.fontSize==='-webkit-xxx-large') s.style.fontSize=px+'px'; }); e.target.value=''; }
    const ur=e.target.closest('[data-usrol]'); if(ur){ const u=USERS.find(x=>x.id===ur.dataset.usrol); if(u){ if(u.rol==='admin'&&ur.value!=='admin'&&USERS.filter(x=>x.rol==='admin').length<2){ App.toast('Tiene que quedar al menos un administrador.',true); ur.value='admin'; return; } u.rol=ur.value; saveUsers(); renderMe(); renderUsers(); SOC.refresh(); } }
  });
  document.addEventListener('input',e=>{ if(e.target.id==='pz-rtc-x'&&PZE){ document.execCommand('foreColor',false,e.target.value); } });
  document.addEventListener('paste',e=>{ if(!PZE||PZE.tipo!=='imagen') return; const it=[...(e.clipboardData||{}).items||[]].find(i=>/^image\//.test(i.type)); if(it){ e.preventDefault(); pzSetImg(it.getAsFile()); } });
  document.addEventListener('keydown',e=>{ if(!PZE) return;
    if(e.key==='Escape'){ pzClose(); return; }
    if(PZE.tipo==='dibujo'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); (e.shiftKey?$('#pz-redo'):$('#pz-undo')).click(); } });
  pzBoardHooks();
  $('#pz-cancel').onclick=pzClose; $('#pz-save').onclick=pzSave;
  $('#pz-dlg').addEventListener('click',e=>{ if(e.target.id==='pz-dlg') pzClose(); });

  // buzón
  $('#bz-send').onclick=bzSend;
  $('#bz-att-b').onclick=()=>$('#bz-att').click();
  $('#bz-att').onchange=async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f) return;
    try{ if(/^image\//.test(f.type)){ const r=await compressImg(f,1800,.85); bzState.att={name:f.name.replace(/\.\w+$/,'')+'.jpg',data:r.src}; }
      else { if(f.size>3e6){ App.toast('El archivo supera 3 MB.',true); return; } bzState.att={name:f.name,data:await fileToDataURL(f)}; }
      $('#bz-att-n').innerHTML=`📎 ${esc(bzState.att.name)} <a href="#" id="bz-att-x">quitar</a>`; $('#bz-att-x').onclick=ev=>{ ev.preventDefault(); bzState.att=null; $('#bz-att-n').textContent='Imagen o PDF, hasta 3 MB'; };
    }catch(err){ App.toast(err.message,true); } };
  document.addEventListener('click',async e=>{
    if(e.target.id==='bz-save'){ const s=SOC.bz.find(x=>x.id===bzState.sel); if(!s) return;
      s.estado=$('#bz-est').value; const r=$('#bz-resp'); if(r){ const t=r.value.trim(); if(t&&t!==s.resp){ s.resp=t; s.respAt=new Date().toISOString(); s.respPor=ME.nombre; s.respVista=false; if(s.estado==='nueva'||s.estado==='leida') s.estado='respondida'; } }
      await SHARED.put('buzon',s); App.toast(r&&r.value.trim()?'Respuesta guardada':'Estado actualizado'); SOC.refresh(); }
    if(e.target.id==='bz-del'){ const s=SOC.bz.find(x=>x.id===bzState.sel); if(s&&confirm('¿Eliminar esta sugerencia?')){ await SHARED.del('buzon',s.id); bzState.sel=''; App.toast('Sugerencia eliminada'); SOC.refresh(); } }
  });
  let bq; $('#bz-q').oninput=e=>{ clearTimeout(bq); bq=setTimeout(()=>{ bzState.q=e.target.value; renderBuzon(); },200); };
  $('#bz-fe').onchange=e=>{ bzState.fe=e.target.value; renderBuzon(); }; $('#bz-fc').onchange=e=>{ bzState.fc=e.target.value; renderBuzon(); };
  // usuarios de prueba
  $('#us-add').onclick=()=>{ const n=$('#us-nm').value.trim(); if(!n){ $('#us-nm').focus(); return; }
    USERS.push({id:'u-'+uid(),nombre:n,rol:$('#us-rol').value}); saveUsers(); $('#us-nm').value=''; renderUsers(); renderMe(); App.toast('Usuario de prueba agregado'); };
  document.addEventListener('click',e=>{ const d=e.target.closest('[data-usdel]'); if(!d) return; const u=USERS.find(x=>x.id===d.dataset.usdel);
    if(u&&confirm(`¿Quitar a ${u.nombre}? Sus aportes y sugerencias quedan guardados.`)){ USERS=USERS.filter(x=>x!==u); saveUsers(); renderUsers(); renderMe(); } });
  SOC.refresh();
  setInterval(()=>{ if(!document.hidden) SOC.refresh(); },45000);   // con servidor: así se ven los aportes de los demás
}

/* ================================================================
   MODO GRIS · oficina corporativa (blanco, gris, acento azul institucional)
   Convierte en el momento todos los colores del panel: hojas de estilo,
   estilos en línea y gráficos SVG. No toca las tarjetas de la cartelera
   (su contenido es de cada autor), ni documentos, ni la pantalla de bloqueo.
   ================================================================ */
const GRIS=(()=>{
  const BLUE_H=212, SKIP='[data-nogris],#lock,#previewBody,#intro,.pz-ed,.pz-cvw,.pz-drop,#pz-body .pz-sw,#pz-body .pz-pick';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function hsl(r,g,b){ r/=255; g/=255; b/=255; const M=Math.max(r,g,b), m=Math.min(r,g,b), l=(M+m)/2; let h=0,s=0;
    if(M!==m){ const d=M-m; s=l>.5?d/(2-M-m):d/(M+m); h=M===r?(g-b)/d+(g<b?6:0):M===g?(b-r)/d+2:(r-g)/d+4; h*=60; } return [h,s,l]; }
  function rgb(h,s,l){ const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l), f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1)); return [f(0),f(8),f(4)].map(v=>Math.round(v*255)); }
  const NAMED={white:[255,255,255],black:[0,0,0],'#fff':[255,255,255],'#000':[0,0,0]};
  function parse(c){ c=c.trim().toLowerCase();
    if(NAMED[c]) return NAMED[c].concat(1);
    if(c[0]==='#'){ let x=c.slice(1); if(x.length===3||x.length===4) x=[...x].map(v=>v+v).join(''); const n=[0,2,4].map(i=>parseInt(x.substr(i,2),16)); return n.concat(x.length===8?parseInt(x.substr(6,2),16)/255:1); }
    const m=c.match(/rgba?\(([^)]+)\)/); if(m){ const p=m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return [p[0],p[1],p[2],p.length>3?p[3]:1]; }
    return null; }
  // kind: t=texto · b=fondo · l=borde/línea · s=sombra
  function map(c,kind){
    const p=parse(c); if(!p||p.some(isNaN)) return c; let [r,g,b,a]=p; const [h,s,l]=hsl(r,g,b);
    if(kind==='s'){ return s>.3&&l>.25?`rgba(31,78,140,${(a*.12).toFixed(3)})`:`rgba(15,23,42,${(a*.16).toFixed(3)})`; }
    let L=1-l, H, S;
    if(s<.22||(l<.12&&kind==='b')){ H=BLUE_H; S=Math.min(s,.14)*.8; if(kind==='b'&&a>.9) L=clamp(L,.9,1); }
    else if((h>=165&&h<=300)||h>=320){ H=BLUE_H; S=clamp(s*.8,.45,.72); }               // cian, azul, violeta, rosa → azul institucional
    else { H=h; S=s*.55; }                                                               // rojo, ámbar, verde: se conservan apagados (estados)
    if(kind==='t') L=S>.2?clamp(L,.2,.42):clamp(L,.1,.55);
    if(kind==='l'&&S>.2) L=clamp(L,.3,.62);
    if(kind==='b'&&S>.2&&a>.9) L=clamp(L,.28,.5);
    const [R,G,B]=rgb(H,S,L); return a<1?`rgba(${R},${G},${B},${+a.toFixed(3)})`:`rgb(${R},${G},${B})`;
  }
  const RX=/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;
  const kindOf=p=>{ p=p.toLowerCase();
    if(/shadow/.test(p)) return 's';
    if(/^--/.test(p)) return /text|^--t\d/.test(p)?'t':/stroke|line|border/.test(p)?'l':'b';
    if(p==='color'||p==='caret-color'||p==='-webkit-text-fill-color') return 't';
    if(/border|outline|stroke|column-rule|text-decoration|accent/.test(p)) return 'l';
    return 'b'; };
  const mapVal=(v,k)=>/url\(|var\(/.test(v)&&!RX.test(v)?v:v.replace(RX,c=>map(c,k));
  let sheet=null;
  function build(){
    const out=[];
    const pre=sel=>sel.split(',').map(x=>{ x=x.trim(); if(!x) return x; if(/^:root\b/.test(x)) return x.replace(':root','html.gris'); if(/^html\b/.test(x)) return x.replace(/^html/,'html.gris'); if(/^body\b/.test(x)) return 'html.gris '+x; return 'html.gris '+x; }).join(',');
    const rules=(list,wrap)=>{ for(const r of list){
        if(r.type===1){ if(/html\.gris|#lock|#previewBody|\.sheet\b|#intro|\.ibox|\.pz-(card|ed|sw|pick|txt|cap|c\b|nw|pin|img|cv|board|frame|wrap|stage|tack|hint|tray|tm)|lg-chip|gris-sw/.test(r.selectorText)) continue;
          const d=[]; for(let i=0;i<r.style.length;i++){ const p=r.style[i], v=r.style.getPropertyValue(p); if(!v) continue; RX.lastIndex=0; if(!RX.test(v)) continue; RX.lastIndex=0;
            d.push(`${p}:${mapVal(v,kindOf(p))}${r.style.getPropertyPriority(p)?' !important':''}`); }
          if(d.length) out.push(wrap(`${pre(r.selectorText)}{${d.join(';')}}`)); }
        else if(r.type===4&&r.cssRules) rules(r.cssRules,s=>`@media ${r.media.mediaText}{${s}}`); } };
    for(const ss of document.styleSheets){ if(ss.ownerNode&&ss.ownerNode.id==='gris-css') continue; try{ rules(ss.cssRules,s=>s); }catch(e){} }
    return out.join('\n');
  }
  // estilos en línea y atributos SVG generados por el panel
  const ATTR=['fill','stroke','stop-color','flood-color','color'];
  function convEl(el){
    if(el.closest&&el.closest(SKIP)) return;
    const st=el.getAttribute&&el.getAttribute('style');
    if(st&&(RX.lastIndex=0,RX.test(st))&&el.dataset){ RX.lastIndex=0;
      if(el.dataset.gsv!==st){ el.dataset.gso=st; const nv=st.split(';').map(d=>{ const i=d.indexOf(':'); if(i<0) return d; const p=d.slice(0,i).trim(); return p+':'+mapVal(d.slice(i+1),kindOf(p)); }).join(';'); el.dataset.gsv=nv; el.setAttribute('style',nv); } }
    for(const a of ATTR){ const v=el.getAttribute&&el.getAttribute(a); if(!v||v==='none'||/url\(|currentColor/i.test(v)) continue; RX.lastIndex=0; if(!RX.test(v)) continue;
      const k='gA'+a.replace(/-/g,''); if(el.dataset[k+'v']===v) continue; el.dataset[k]=v; const nv=v.replace(RX,c=>map(c,a==='stroke'?'l':a==='color'?'t':'b')); el.dataset[k+'v']=nv; el.setAttribute(a,nv); }
  }
  function convTree(root){ if(root.nodeType!==1) return; convEl(root); root.querySelectorAll('[style],[fill],[stroke],[stop-color]').forEach(convEl); }
  function revertTree(){ document.querySelectorAll('[data-gso]').forEach(el=>{ if(el.getAttribute('style')===el.dataset.gsv) el.setAttribute('style',el.dataset.gso); delete el.dataset.gso; delete el.dataset.gsv; });
    ATTR.forEach(a=>{ const k='gA'+a.replace(/-/g,''), dk='data-g-a'+a.replace(/-/g,''); document.querySelectorAll(`[${dk}]`).forEach(el=>{ if(el.getAttribute(a)===el.dataset[k+'v']) el.setAttribute(a,el.dataset[k]); delete el.dataset[k]; delete el.dataset[k+'v']; }); }); }
  let mo=null, on=false;
  function apply(v){
    on=v; document.documentElement.classList.toggle('gris',v);
    if(v){ if(!sheet){ sheet=document.createElement('style'); sheet.id='gris-css'; document.head.appendChild(sheet); }
      if(!sheet.textContent) sheet.textContent=build();
      convTree(document.body);
      if(!mo){ mo=new MutationObserver(ms=>{ if(!on) return; for(const m of ms){ if(m.type==='childList') m.addedNodes.forEach(n=>convTree(n)); else if(m.type==='attributes') convEl(m.target); } });
        mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','fill','stroke']}); }
    } else { revertTree(); }
    try{ if(window.Orb&&Orb.active) Orb.active(!v&&curView==='v-home'); }catch(e){}
  }
  async function toggle(v,from){
    if(v===on) return; const sw=$('#optGris'), cf=$('#cf-gris'); if(sw) sw.checked=v; if(cf) cf.checked=v;
    UI.gris=v; saveUI();
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce){ apply(v); App.onView(curView); return; }
    const veil=$('#gris-veil'), r=(from||sw||document.body).getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
    document.documentElement.style.setProperty('--gx',cx+'px'); document.documentElement.style.setProperty('--gy',cy+'px');
    const html=document.documentElement;
    if(v){
      // 1) los colores se esfuman
      html.classList.add('gris-fade'); await new Promise(r=>setTimeout(r,1000));
      // 2) la página se transforma de a poco: ola que avanza desde el interruptor
      const go=()=>{ apply(true); html.classList.remove('gris-fade'); };
      if(document.startViewTransition){ html.classList.add('gris-vt-in'); const t=document.startViewTransition(go); try{ await t.finished; }catch(e){} html.classList.remove('gris-vt-in'); }
      else { veil.className='on'; await new Promise(r=>setTimeout(r,450)); go(); veil.className='on out'; await new Promise(r=>setTimeout(r,700)); veil.className=''; }
      SND.play('nav');
    } else {
      // vuelta: el color florece desde el interruptor
      const go=()=>{ apply(false); html.classList.add('gris-bloom'); };
      if(document.startViewTransition){ html.classList.add('gris-vt-out'); const t=document.startViewTransition(go); try{ await t.finished; }catch(e){} html.classList.remove('gris-vt-out'); }
      else { veil.className='on'; await new Promise(r=>setTimeout(r,450)); go(); veil.className='on out'; await new Promise(r=>setTimeout(r,700)); veil.className=''; }
      requestAnimationFrame(()=>requestAnimationFrame(()=>html.classList.add('gris-bloom-go')));
      await new Promise(r=>setTimeout(r,1300)); html.classList.remove('gris-bloom','gris-bloom-go');
      SND.play('nav');
    }
    App.onView(curView);
  }
  return {apply,toggle,on:()=>on,rebuild:()=>{ if(sheet) sheet.textContent=''; if(on) apply(true); }};
})();
function hookGris(){
  const sw=$('#optGris'); sw.checked=!!UI.gris;
  sw.onchange=()=>GRIS.toggle(sw.checked,sw.parentElement);
  const cf=$('#cf-gris'); if(cf){ cf.checked=!!UI.gris; cf.onchange=()=>GRIS.toggle(cf.checked,cf.parentElement); }
  if(UI.gris) GRIS.apply(true);
}
try{ if(window.SND&&SND.play){ const _sp=SND.play.bind(SND); SND.play=k=>{ if(!UI.gris) _sp(k); }; } }catch(e){}
try{ hookGris(); }catch(e){ console.error('gris',e); }
try{ hookSocial(); }catch(e){ console.error('social',e); }
