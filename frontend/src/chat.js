/* ================================================================
   CHAT INTERNO — conversaciones directas y grupos, presencia, zumbido, historial (admin)
   Panel lateral que se abre con el botón 💬 de arriba. Consulta al servidor cada 3 s con el chat abierto
   y cada 10 s cerrado (para avisos y zumbidos).
   ================================================================ */
(function(){
  if(!(window.SRV&&SRV.mode==='online')) return;
  const ok=()=>SRV.can&&SRV.can('chat')||(SRV.user&&SRV.user.rol==='admin');
  const btn=$('#btnChat'); if(!ok()){ if(btn) btn.style.display='none'; return; }
  if(btn) btn.style.display='';
  const admin=SRV.user.rol==='admin'&&!SRV.imp;
  const C={me:SRV.user.id,last:0,users:[],convs:[],msgs:{},open:false,tab:'chats',conv:null,para:null,hist:null,zumbSeg:60,leyendo:{}};
  // presencia: activo si usa el panel; ausente si está oculto, bloqueado o sin tocar nada hace 5 minutos
  let mov=Date.now(); ['pointerdown','keydown','mousemove','wheel','touchstart'].forEach(ev=>document.addEventListener(ev,()=>{ mov=Date.now(); },{passive:true,capture:true}));
  window.chatSt=()=>document.hidden||document.body.classList.contains('is-locked')||Date.now()-mov>5*60e3?'ausente':'activo';

  const ini=n=>{ const p=String(n||'?').split(',').map(x=>x.trim()); return ((p[1]||'')[0]||'')+((p[0]||'?')[0]||''); };
  const corto=n=>{ const p=String(n||'').split(','); return p.length>1?`${p[1].trim().split(' ')[0]} ${p[0].trim().split(' ')[0]}`:n; };
  const hora=iso=>{ if(!iso) return ''; const d=new Date(iso), h=new Date(); const t=d.toTimeString().slice(0,5);
    return d.toDateString()===h.toDateString()?t:`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${t}`; };
  const ESTL={activo:'Activo',ausente:'Ausente',desconectado:'Desconectado'};
  const uById=id=>C.users.find(u=>u.id===id);
  const visto=u=>u&&u.estado==='desconectado'&&u.visto?`visto ${hora(u.visto)}`:u?ESTL[u.estado]:'';
  const txt=t=>esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g,'<br>');

  // ---------- sonido y zumbido ----------
  let ac=null; const beep=(f,ms,vol)=>{ try{ ac=ac||new (window.AudioContext||window.webkitAudioContext)(); const o=ac.createOscillator(), g=ac.createGain(); o.frequency.value=f; g.gain.value=vol||.06; o.connect(g); g.connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+ms/1000); o.stop(ac.currentTime+ms/1000); }catch(e){} };
  const sndOn=()=>{ try{ const u=JSON.parse(localStorage.getItem('rrhh-ic-ui')||'{}'); return u.snd!==false; }catch(e){ return true; } };
  const ping=()=>{ if(sndOn()){ beep(880,120); setTimeout(()=>beep(1320,140),130); } };
  const zumbar=de=>{ document.body.classList.remove('chat-zumb'); void document.body.offsetWidth; document.body.classList.add('chat-zumb'); setTimeout(()=>document.body.classList.remove('chat-zumb'),900);
    [0,160,320,480].forEach(t=>setTimeout(()=>beep(170+(t/160)%2*40,140,.12),t)); App.toast(`📳 ${corto(de)} te mandó un zumbido`); };

  // ---------- panel ----------
  const P=document.createElement('aside'); P.id='chat'; P.className='chat';
  P.innerHTML=`<div class="ch-h"><b>💬 Chat</b><div class="ch-tabs"><button data-cht="chats">Chats</button><button data-cht="personas">Personas</button>${admin?'<button data-cht="hist">Historial</button>':''}</div><button class="ch-x" title="Cerrar">✕</button></div>
    ${SRV.imp?'<div class="ch-ro">Modo "ver como": solo lectura, no se pueden mandar mensajes.</div>':''}<div class="ch-b" id="ch-b"></div>`;
  document.body.appendChild(P);
  const B=P.querySelector('#ch-b');
  const abrir=v=>{ C.open=v; P.classList.toggle('on',v); if(v){ render(); poll(); } };
  if(btn) btn.onclick=()=>abrir(!C.open);
  P.querySelector('.ch-x').onclick=()=>abrir(false);

  function badge(){ const n=C.convs.reduce((a,c)=>a+(c.no_leidos||0),0), i=$('#chatN'); if(i){ i.textContent=n?String(n):''; i.style.display=n?'':'none'; }
    P.querySelectorAll('[data-cht="chats"]').forEach(b=>b.dataset.n=n||''); }

  function lista(){
    const L=C.convs.slice().sort((a,b)=>((b.ultimo&&b.ultimo.id)||0)-((a.ultimo&&a.ultimo.id)||0));
    return `<div class="ch-tool"><button class="btn ghost sm" data-chg="nuevo">+ Nuevo grupo</button></div>`+(L.length?L.map(c=>{ const u=c.otro?uById(c.otro):null, m=c.ultimo;
      return `<button class="ch-it" data-chc="${esc(c.id)}"><span class="ch-av ${c.tipo==='grupo'?'g':''}">${c.tipo==='grupo'?'👥':esc(ini(c.nombre))}${u?`<i class="st ${u.estado}"></i>`:''}</span>
        <span class="ch-tx"><b>${esc(c.tipo==='grupo'?c.nombre:corto(c.nombre))}</b><small>${m?esc((m.de===C.me?'Vos: ':c.tipo==='grupo'&&m.tipo!=='sistema'?corto(m.de_nombre)+': ':'')+m.texto).slice(0,60):''}</small></span>
        <span class="ch-mt"><small>${m?hora(m.at):''}</small>${c.no_leidos?`<i>${c.no_leidos}</i>`:''}</span></button>`; }).join(''):'<div class="ch-vac">Todavía no tenés conversaciones. Abrí <b>Personas</b> para escribirle a alguien.</div>');
  }
  function personas(){
    const q=(C.q||'').toLowerCase(), U=C.users.filter(u=>!q||u.nombre.toLowerCase().includes(q)||u.username.includes(q));
    const grp=e=>U.filter(u=>u.estado===e).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    return `<div class="ch-tool"><input type="text" class="ch-q" placeholder="Buscar persona" value="${esc(C.q||'')}"></div>`+
      ['activo','ausente','desconectado'].map(e=>{ const L=grp(e); return L.length?`<div class="ch-sec">${ESTL[e]} · ${L.length}</div>`+L.map(u=>`<button class="ch-it" data-chu="${u.id}"><span class="ch-av">${esc(ini(u.nombre))}<i class="st ${u.estado}"></i></span><span class="ch-tx"><b>${esc(u.nombre)}</b><small>${esc(visto(u))}</small></span></button>`).join(''):''; }).join('');
  }
  function conversacion(){
    const c=C.conv?C.convs.find(x=>x.id===C.conv):null, u=c&&c.otro?uById(c.otro):C.para?uById(C.para):null;
    const titulo=c?(c.tipo==='grupo'?c.nombre:corto(c.nombre)):u?corto(u.nombre):'';
    const sub=c&&c.tipo==='grupo'?c.miembros.map(i=>i===C.me?'Vos':corto((uById(i)||{}).nombre||'')).filter(Boolean).join(', '):visto(u);
    const M=(c&&C.msgs[c.id])||[], lo=c&&c.otro?+(c.leido_otros||{})[String(c.otro)]||0:0;
    const mio=M.filter(m=>m.de===C.me&&m.tipo!=='sistema').pop();
    let dia=''; const filas=M.map(m=>{ const d=new Date(m.at).toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'2-digit'}); const sep=d!==dia?(dia=d,`<div class="ch-dia">${esc(d)}</div>`):'';
      if(m.tipo==='sistema') return sep+`<div class="ch-sis">${esc(m.texto)}</div>`;
      const yo=m.de===C.me; return sep+`<div class="ch-m ${yo?'yo':''} ${m.tipo==='zumbido'?'zb':''}">${!yo&&c&&c.tipo==='grupo'?`<b>${esc(corto(m.de_nombre))}</b>`:''}<div>${txt(m.texto)}</div><small>${hora(m.at).slice(-5)}${yo&&mio&&m.id===mio.id&&c.otro?(lo>=m.id?' · <span class="vis">✓✓ visto</span>':' · ✓'):''}</small></div>`; }).join('');
    return `<div class="ch-ch"><button class="ch-back" title="Volver">←</button><div class="ch-tt"><b>${esc(titulo)}</b><small>${esc(sub)}</small></div>
        ${c&&c.tipo==='grupo'&&(c.creado_por===C.me||admin)?'<button class="ch-ib" data-chg="editar" title="Editar grupo">⚙</button>':''}${c&&c.tipo==='grupo'?'<button class="ch-ib" data-chg="salir" title="Salir del grupo">⎋</button>':''}</div>
      <div class="ch-ms" id="ch-ms">${filas||'<div class="ch-vac">Escribí el primer mensaje.</div>'}</div>
      <div class="ch-in"><button class="ch-zb" title="Mandar un zumbido (uno por minuto)"${SRV.imp?' disabled':''}>📳</button><textarea rows="1" placeholder="Escribí un mensaje…"${SRV.imp?' disabled':''}></textarea><button class="btn primary sm ch-send"${SRV.imp?' disabled':''}>Enviar</button></div>`;
  }
  function historial(){
    const H=C.hist;
    if(H&&H.ver) return `<div class="ch-ch"><button class="ch-back" data-hback>←</button><div class="ch-tt"><b>${esc(H.ver.nombre)}</b><small>${H.ver.mensajes} mensaje(s) · solo lectura</small></div></div>
      <div class="ch-ms">${(H.msgs||[]).map(m=>m.tipo==='sistema'?`<div class="ch-sis">${esc(m.texto)} · ${hora(m.at)}</div>`:`<div class="ch-m adm ${m.tipo==='zumbido'?'zb':''}"><b>${esc(corto(m.de_nombre))}</b><div>${txt(m.texto)}</div><small>${hora(m.at)}</small></div>`).join('')||'<div class="ch-vac">Sin mensajes.</div>'}</div>`;
    return `<div class="ch-tool"><input type="text" class="ch-hq" placeholder="Buscar texto en todas las charlas" value="${esc((H&&H.q)||'')}"><button class="btn ghost sm" data-hxls>Excel</button></div>`+
      (H&&H.res?`<div class="ch-sec">${H.res.length} resultado(s)</div>`+H.res.map(m=>`<button class="ch-it" data-hc="${esc(m.conv)}"><span class="ch-tx"><b>${esc(corto(m.de_nombre))} · ${hora(m.at)}</b><small>${esc(m.texto).slice(0,90)}</small></span></button>`).join('')
       :!H||!H.convs?'<div class="ch-vac">Cargando…</div>':H.convs.map(c=>`<button class="ch-it" data-hc="${esc(c.id)}"><span class="ch-av ${c.tipo==='grupo'?'g':''}">${c.tipo==='grupo'?'👥':'↔'}</span><span class="ch-tx"><b>${esc(c.nombre)}</b><small>${c.mensajes} mensaje(s)${c.tipo==='grupo'?' · '+esc(c.miembros.map(corto).join(', ')):''}</small></span><span class="ch-mt"><small>${hora(c.ultimo)}</small></span></button>`).join('')||'<div class="ch-vac">Todavía no hay conversaciones.</div>');
  }
  function grupoForm(c){
    const sel=new Set(c?c.miembros:[]);
    return `<div class="ch-ch"><button class="ch-back" data-gback>←</button><div class="ch-tt"><b>${c?'Editar grupo':'Nuevo grupo'}</b></div></div>
      <div class="ch-gf"><label>Nombre del grupo<input type="text" class="ch-gn" maxlength="80" value="${esc(c?c.nombre:'')}" placeholder="Ej.: Coordinadores turno mañana"></label>
      <div class="ch-sec">Integrantes</div><div class="ch-gl">${C.users.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(u=>`<label><input type="checkbox" value="${u.id}"${sel.has(u.id)?' checked':''}> ${esc(u.nombre)}</label>`).join('')}</div>
      <button class="btn primary ch-gok"${SRV.imp?' disabled':''}>${c?'Guardar':'Crear grupo'}</button></div>`;
  }
  function render(){
    P.querySelectorAll('[data-cht]').forEach(b=>b.classList.toggle('on',b.dataset.cht===C.tab&&!C.conv&&!C.para&&!C.grupo));
    if(!C.open) return;
    const q=B.querySelector('.ch-q'), foco=document.activeElement===q, ta=B.querySelector('textarea'), borr=ta?ta.value:'', foco2=ta&&document.activeElement===ta;
    B.innerHTML=C.grupo?grupoForm(C.grupo==='nuevo'?null:C.convs.find(x=>x.id===C.grupo)):(C.conv||C.para)?conversacion():C.tab==='personas'?personas():C.tab==='hist'?historial():lista();
    const ms=B.querySelector('.ch-ms'); if(ms) ms.scrollTop=ms.scrollHeight;
    const t2=B.querySelector('textarea'); if(t2){ t2.value=borr; if(!SRV.imp&&(C.foco||foco2)) t2.focus(); C.foco=false; }
    if(foco){ const q2=B.querySelector('.ch-q'); if(q2){ q2.focus(); q2.setSelectionRange(q2.value.length,q2.value.length); } }
    marcarLeido();
  }
  async function cargarConv(cid){ try{ const r=await SRV.api('GET',`/api/chat/conv/${encodeURIComponent(cid)}`); C.msgs[cid]=r.msgs; }catch(e){ App.toast(e.message,true); } }
  async function marcarLeido(){ if(!C.open||!C.conv||document.hidden||SRV.imp) return; const c=C.convs.find(x=>x.id===C.conv), M=C.msgs[C.conv]||[]; if(!c||!M.length) return;
    const h=M[M.length-1].id; if(c.no_leidos||C.leyendo[c.id]!==h){ C.leyendo[c.id]=h; c.no_leidos=0; badge(); try{ await SRV.api('POST','/api/chat/leido',{conv:c.id,hasta:h}); }catch(e){} } }
  async function abrirConv(cid){ C.conv=cid; C.para=null; C.grupo=null; C.foco=true; if(!C.msgs[cid]) await cargarConv(cid); render(); }
  async function enviar(){
    const ta=B.querySelector('textarea'); const t=(ta&&ta.value||'').trim(); if(!t) return; ta.value='';
    try{ const r=await SRV.api('POST','/api/chat/enviar',C.conv?{conv:C.conv,texto:t}:{para:C.para,texto:t}); const cid=r.conv;
      (C.msgs[cid]||(C.msgs[cid]=[])).push(r.msg); C.last=Math.max(C.last,r.msg.id); C.conv=cid; C.para=null; await poll(true); render(); }
    catch(e){ ta.value=t; App.toast(e.message,true); } }
  async function zumbido(){
    try{ const r=await SRV.api('POST','/api/chat/zumbido',C.conv?{conv:C.conv}:{para:C.para}); (C.msgs[r.conv]||(C.msgs[r.conv]=[])).push(r.msg); C.last=Math.max(C.last,r.msg.id); C.conv=r.conv; C.para=null; await poll(true); render(); App.toast('📳 Zumbido enviado'); }
    catch(e){ App.toast(e.message,true); } }

  B.addEventListener('click',async e=>{
    const t=e.target;
    if(t.closest('.ch-back')){ if(t.closest('[data-hback]')){ C.hist.ver=null; } else if(t.closest('[data-gback]')){ C.grupo=null; } else { C.conv=null; C.para=null; } render(); return; }
    const cc=t.closest('[data-chc]'); if(cc){ abrirConv(cc.dataset.chc); return; }
    const cu=t.closest('[data-chu]'); if(cu){ const id=+cu.dataset.chu, c=C.convs.find(x=>x.tipo==='directa'&&x.otro===id); if(c) abrirConv(c.id); else { C.conv=null; C.para=id; C.foco=true; render(); } return; }
    if(t.closest('.ch-send')){ enviar(); return; }
    if(t.closest('.ch-zb')){ zumbido(); return; }
    const g=t.closest('[data-chg]'); if(g){ const a=g.dataset.chg;
      if(a==='nuevo'){ C.grupo='nuevo'; render(); } else if(a==='editar'){ C.grupo=C.conv; render(); }
      else if(a==='salir'&&confirm('¿Salir de este grupo?')){ try{ await SRV.api('POST',`/api/chat/grupo/${encodeURIComponent(C.conv)}/salir`); C.conv=null; await poll(true); render(); }catch(x){ App.toast(x.message,true); } }
      return; }
    if(t.closest('.ch-gok')){ const n=B.querySelector('.ch-gn').value.trim(), m=[...B.querySelectorAll('.ch-gl input:checked')].map(i=>+i.value);
      if(!n){ App.toast('Poné un nombre al grupo.',true); return; } if(!m.length){ App.toast('Elegí al menos una persona.',true); return; }
      try{ if(C.grupo==='nuevo'){ const r=await SRV.api('POST','/api/chat/grupo',{nombre:n,miembros:m}); C.grupo=null; await poll(true); abrirConv(r.conv); }
        else { await SRV.api('PUT',`/api/chat/grupo/${encodeURIComponent(C.grupo)}`,{nombre:n,miembros:m}); const id=C.grupo; C.grupo=null; await poll(true); await cargarConv(id); abrirConv(id); } }
      catch(x){ App.toast(x.message,true); } return; }
    const hc=t.closest('[data-hc]'); if(hc){ const id=hc.dataset.hc, c=(C.hist.convs||[]).find(x=>x.id===id)||{id,nombre:'Conversación',mensajes:''};
      try{ const r=await SRV.api('GET',`/api/chat/conv/${encodeURIComponent(id)}`); C.hist.ver=c; C.hist.msgs=r.msgs; render(); }catch(x){ App.toast(x.message,true); } return; }
    if(t.closest('[data-hxls]')){ try{ const r=await SRV.api('GET','/api/chat/admin/export'); if(!r.msgs.length){ App.toast('No hay mensajes.',true); return; }
      const ws=XLSX.utils.aoa_to_sheet([['Fecha y hora','Conversación','De','Tipo','Mensaje']].concat(r.msgs.map(m=>[fmtAt(m.at),m.conv_nombre,m.de_nombre,m.tipo,m.texto])));
      ws['!cols']=[{wch:18},{wch:40},{wch:28},{wch:10},{wch:80}]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Chat'); XLSX.writeFile(wb,`historial_chat_${hoy()}.xlsx`); }catch(x){ App.toast(x.message,true); } }
  });
  B.addEventListener('keydown',e=>{ if(e.target.matches('textarea')&&e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); enviar(); } });
  B.addEventListener('input',e=>{ if(e.target.matches('.ch-q')){ C.q=e.target.value; render(); }
    if(e.target.matches('textarea')){ e.target.style.height='auto'; e.target.style.height=Math.min(120,e.target.scrollHeight)+'px'; } });
  let hqT; B.addEventListener('input',e=>{ if(!e.target.matches('.ch-hq')) return; clearTimeout(hqT); const v=e.target.value; hqT=setTimeout(async()=>{ C.hist.q=v;
    if(v.trim().length<2){ C.hist.res=null; } else { try{ C.hist.res=(await SRV.api('GET','/api/chat/admin/buscar?q='+encodeURIComponent(v.trim()))).msgs; }catch(x){} }
    render(); const q=B.querySelector('.ch-hq'); if(q){ q.focus(); q.setSelectionRange(q.value.length,q.value.length); } },350); });
  P.querySelector('.ch-tabs').addEventListener('click',async e=>{ const b=e.target.closest('[data-cht]'); if(!b) return; C.tab=b.dataset.cht; C.conv=null; C.para=null; C.grupo=null;
    if(C.tab==='hist'){ C.hist={convs:null}; render(); try{ C.hist.convs=(await SRV.api('GET','/api/chat/admin/convs')).convs; }catch(x){ App.toast(x.message,true); } }
    render(); });

  // ---------- consulta periódica ----------
  let tm=null, primera=true;
  async function poll(una){
    clearTimeout(tm);
    try{ const r=await SRV.api('GET',`/api/chat/estado?desde=${C.last}&st=${chatSt()}`);
      C.users=r.usuarios; C.convs=r.convs; C.zumbSeg=r.zumbido_seg;
      if(primera){ C.last=r.ultimo; primera=false; }
      for(const m of r.msgs){ C.last=Math.max(C.last,m.id); if(C.msgs[m.conv]&&!C.msgs[m.conv].some(x=>x.id===m.id)) C.msgs[m.conv].push(m);
        if(m.de===C.me||m.tipo==='sistema') continue;
        if(m.tipo==='zumbido') zumbar(m.de_nombre);
        else if(!(C.open&&C.conv===m.conv&&!document.hidden)){ ping(); App.toast(`💬 ${corto(m.de_nombre)}: ${m.texto.slice(0,70)}`); } }
      if(r.msgs.length&&C.conv&&!C.msgs[C.conv]) await cargarConv(C.conv);
      badge(); const sig=JSON.stringify([C.convs,C.users.map(u=>[u.id,u.estado,u.visto&&u.estado==='desconectado'?u.visto:'']),C.conv?(C.msgs[C.conv]||[]).length:0]);
      if(C.open&&!C.grupo&&C.tab!=='hist'&&sig!==C.sig){ C.sig=sig; const ta=B.querySelector('textarea'); if(!(ta&&document.activeElement===ta&&ta.value)) render(); else marcarLeido(); }
    }catch(e){ /* sin conexión: se reintenta */ }
    tm=setTimeout(poll,C.open&&!document.hidden?3000:10000);
  }
  setTimeout(poll,1500);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) poll(); });
})();
