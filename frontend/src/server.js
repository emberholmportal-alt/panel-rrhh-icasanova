/* ================================================================
   MODO SERVIDOR: inicio de sesión, guardado compartido, permisos,
   sincronización entre usuarios y administración de usuarios.
   (No hace nada si el panel se abre como archivo local.)
   ================================================================ */
const SRVX=(()=>{
  const S=window.SRV; if(!S) return {online:false};
  const api=async(method,url,body)=>{
    const r=await fetch(url,{method,credentials:'same-origin',headers:body!==undefined?{'Content-Type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined});
    let j=null; try{ j=await r.json(); }catch(e){}
    if(!r.ok){ const d=j&&j.detail; const msg=typeof d==='string'?d:(d&&d.msg)||('Error '+r.status); const err=new Error(msg); err.status=r.status; err.data=d; throw err; }
    return j;
  };
  S.api=api;

  /* ---------------- pantalla de inicio de sesión ---------------- */
  function loginScreen(){
    const el=document.createElement('div'); el.id='srv-login';
    el.innerHTML=`<div class="sl-box">
      <img class="sl-logo" src="${typeof LOGO!=='undefined'?LOGO:''}" alt="Grupo Gestión">
      <h1>PANEL DE TRABAJO <em>RRHH</em> · I.CASANOVA</h1>
      ${S.mode==='error'?`<p class="sl-err">${esc(S.err||'No se pudo conectar con el servidor.')}</p><button class="btn primary" onclick="location.reload()">Reintentar</button>`:`
      <form id="sl-f" autocomplete="on">
        <label>Usuario<input id="sl-u" name="username" autocomplete="username" required autofocus></label>
        <label>Contraseña<input id="sl-p" name="password" type="password" autocomplete="current-password" required></label>
        <p class="sl-err" id="sl-e"></p>
        <button class="btn primary" id="sl-go">Ingresar</button>
      </form>
      <button type="button" class="sl-link" id="sl-req">¿No tenés usuario o no podés entrar? Avisale al administrador</button>`}
    </div>`;
    document.body.appendChild(el); document.body.classList.add('srv-locked');
    const rq=$('#sl-req'); if(rq) rq.onclick=reqScreen;
    const f=$('#sl-f'); if(!f) return;
    f.onsubmit=async e=>{ e.preventDefault(); $('#sl-e').textContent=''; $('#sl-go').disabled=true;
      try{ const u=await api('POST','/api/auth/login',{username:$('#sl-u').value,password:$('#sl-p').value});
        if(u.must_change) passScreen(true); else location.reload(); }
      catch(err){ $('#sl-e').textContent=err.message; $('#sl-go').disabled=false; } };
  }
  function reqScreen(){
    const el=$('#srv-login');
    el.innerHTML=`<div class="sl-box">
      <h2>Avisar al administrador</h2>
      <p class="sl-help">Si no tenés usuario, te olvidaste la contraseña o no podés entrar, dejá tus datos y el administrador del panel se comunica con vos.</p>
      <form id="sr-f">
        <label>Nombre y apellido<input id="sr-n" maxlength="120" required autocomplete="name"></label>
        <label>Sector o puesto<input id="sr-s" maxlength="120" placeholder="ej: Coordinación turno noche"></label>
        <label>Cómo contactarte (opcional)<input id="sr-c" maxlength="160" placeholder="mail, teléfono o interno"></label>
        <label>Mensaje<textarea id="sr-m" rows="3" maxlength="1500">No puedo acceder al panel.</textarea></label>
        <input id="sr-w" tabindex="-1" autocomplete="off" class="sl-hp" aria-hidden="true">
        <p class="sl-err" id="sr-e"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" id="sr-x">Volver</button><button class="btn primary" id="sr-go">Enviar</button></div>
      </form></div>`;
    $('#sr-x').onclick=()=>{ el.remove(); loginScreen(); };
    $('#sr-f').onsubmit=async e=>{ e.preventDefault(); $('#sr-e').textContent=''; $('#sr-go').disabled=true;
      try{ await api('POST','/api/acceso',{nombre:$('#sr-n').value,sector:$('#sr-s').value,contacto:$('#sr-c').value,msg:$('#sr-m').value,web:$('#sr-w').value});
        el.querySelector('.sl-box').innerHTML=`<h2>Mensaje enviado</h2><p class="sl-help">El administrador del panel ya lo recibió y se va a comunicar con vos.</p><button class="btn primary" id="sr-ok" style="width:100%;margin-top:14px">Volver al ingreso</button>`;
        $('#sr-ok').onclick=()=>{ el.remove(); loginScreen(); }; }
      catch(err){ $('#sr-e').textContent=err.message; $('#sr-go').disabled=false; } };
  }
  function passScreen(forzada){
    let el=$('#srv-login'); if(!el){ el=document.createElement('div'); el.id='srv-login'; document.body.appendChild(el); }
    document.body.classList.add('srv-locked');
    el.innerHTML=`<div class="sl-box">
      <h2>${forzada?'Elegí tu contraseña':'Cambiar contraseña'}</h2>
      <p class="sl-help">${forzada?'Es tu primer ingreso o te restablecieron la clave: elegí una contraseña nueva, solo para vos.':'Al cambiarla se cierran tus otras sesiones abiertas.'}</p>
      <form id="sp-f">
        <label>Contraseña actual${forzada?' (la que te dieron)':''}<input id="sp-a" type="password" autocomplete="current-password" required></label>
        <label>Contraseña nueva<input id="sp-n" type="password" autocomplete="new-password" required minlength="8"></label>
        <label>Repetila<input id="sp-r" type="password" autocomplete="new-password" required></label>
        <p class="sl-help">Mínimo 8 caracteres, con letras y números.</p>
        <p class="sl-err" id="sp-e"></p>
        <div style="display:flex;gap:8px;justify-content:flex-end">${forzada?'':'<button type="button" class="btn ghost" id="sp-x">Cancelar</button>'}<button class="btn primary" id="sp-go">Guardar contraseña</button></div>
      </form></div>`;
    if($('#sp-x')) $('#sp-x').onclick=()=>{ el.remove(); document.body.classList.remove('srv-locked'); };
    $('#sp-f').onsubmit=async e=>{ e.preventDefault(); $('#sp-e').textContent='';
      if($('#sp-n').value!==$('#sp-r').value){ $('#sp-e').textContent='Las contraseñas nuevas no coinciden.'; return; }
      try{ await api('POST','/api/auth/password',{actual:$('#sp-a').value,nueva:$('#sp-n').value});
        if(forzada) location.reload(); else { el.remove(); document.body.classList.remove('srv-locked'); App.toast('Contraseña cambiada'); } }
      catch(err){ $('#sp-e').textContent=err.message; } };
  }
  // "ver como": el admin elige un usuario y el panel se recarga mostrando exactamente lo que ve esa persona
  // el administrador cambió los permisos mientras el usuario tenía el panel abierto
  let permsAviso='';
  function permsCambiaron(nu){
    const k=JSON.stringify([nu.perms,nu.rol,nu.aus_parcial,nu.descargas]); if(k===permsAviso||document.getElementById('srv-perm')) return; permsAviso=k;
    const por=nu.perms_por&&nu.perms_por.n?nu.perms_por.n:'', quien=por?(por.includes(',')?por.split(',').slice(1).join(' ').trim()+' '+por.split(',')[0].trim():por):'';
    const cuando=nu.perms_por&&nu.perms_por.at?fmtAt(nu.perms_por.at):'';
    const L=x=>x==='editar'?'Editar':x==='ver'?'Ver':x==='consulta'?'Consultar':'Sin acceso';
    const cam=Object.keys(S.modules||{}).filter(m=>(U.perms||{})[m]!==(nu.perms||{})[m]).map(m=>`<li><b>${esc(S.modules[m])}</b>: ${L((U.perms||{})[m])} → <b>${L((nu.perms||{})[m])}</b></li>`).join('')+(nu.descargas!==U.descargas?`<li><b>Descargas de informes</b>: ${U.descargas===false?'No':'Sí'} → <b>${nu.descargas===false?'No':'Sí'}</b></li>`:'');
    const m=document.createElement('div'); m.className='vs-modal'; m.id='srv-perm';
    m.innerHTML=`<div class="vs-mbox"><h3>🔐 Tus permisos fueron actualizados</h3>
      <p>${quien?`El administrador <b>${esc(quien)}</b> cambió`:'Se cambiaron'} tus permisos del panel${cuando?` (${esc(cuando)})`:''}.</p>
      ${cam?`<ul class="srv-perm-l">${cam}</ul>`:''}
      <p><b>Qué hacer:</b> tocá <b>Recargar ahora</b> para ver las secciones con los permisos nuevos. Si estabas cargando algo, terminalo primero: lo que ya se guardó no se pierde.</p>
      <div class="vs-mb"><button type="button" class="btn ghost" data-pm="x">Más tarde</button><button type="button" class="btn primary" data-pm="ok">Recargar ahora</button></div></div>`;
    m.onclick=e=>{ const b=e.target.closest('[data-pm]'); if(!b) return; if(b.dataset.pm==='ok'){ location.reload(); return; } m.remove();
      App.toast('Tus permisos cambiaron: recargá la página cuando puedas para aplicarlos.',true); };
    document.body.appendChild(m);
  }
  async function verComo(){
    let L=[]; try{ L=(await api('GET','/api/users')).users.filter(u=>u.activo&&u.id!==S.user.id); }catch(e){ App.toast(e.message,true); return; }
    const m=document.createElement('div'); m.className='vs-modal';
    m.innerHTML=`<div class="vs-mbox vc-box"><h3>👁 Ver como otro usuario</h3><p>Elegí a quién: el panel se recarga mostrando lo mismo que ve esa persona, con sus permisos. Es solo lectura y volvés a tu usuario con un clic.</p>
      <input type="text" class="vc-q" placeholder="Buscar por nombre o usuario">
      <div class="vc-l">${L.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(u=>`<button type="button" data-vcu="${u.id}" data-q="${esc((u.nombre+' '+u.username).toLowerCase())}"><b>${esc(u.nombre)}</b><span>${esc(u.username)}${u.rol==='admin'?' · admin':''}</span></button>`).join('')}</div>
      <div class="vs-mb"><button type="button" class="btn ghost" data-vcx>Cancelar</button></div></div>`;
    document.body.appendChild(m); const q=m.querySelector('.vc-q'); setTimeout(()=>q.focus(),50);
    q.oninput=()=>{ const t=q.value.trim().toLowerCase(); m.querySelectorAll('[data-vcu]').forEach(b=>b.style.display=!t||b.dataset.q.includes(t)?'':'none'); };
    m.onclick=async e=>{ if(e.target===m||e.target.closest('[data-vcx]')){ m.remove(); return; }
      const b=e.target.closest('[data-vcu]'); if(!b) return;
      try{ await api('POST',`/api/users/${b.dataset.vcu}/ver-como`); location.reload(); }catch(x){ App.toast(x.message,true); } };
  }
  async function logout(){ try{ await api('POST','/api/auth/logout'); }catch(e){}
    S.F3K.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} }); location.reload(); }

  if(S.mode!=='online'){ loginScreen(); return {online:false}; }

  /* ---------------- permisos ---------------- */
  const U=S.user, isAdm=U.rol==='admin';
  S.api=api;
  // nota para el registro de cambios: se manda junto con el próximo guardado de ese módulo
  S.notas={}; S.nota=(m,t)=>{ (S.notas[m]||(S.notas[m]=[])).push(t); };
  const VIEW_MOD={'v-ausentismo':'ausentismo','v-vacaciones':'vacaciones','v-bajas':'eventuales','v-francos':'francos','v-ropa':'indumentaria','v-f3':'f3','v-anticipos':'anticipos','v-agenda':'agenda','v-nomina':'nomina','v-menu':'menu','v-cumple':'cumpleanos','v-hextras':'hextras','v-ausmot':'ausmot','v-viandas':'viandas'};
  const lvl0=m=>isAdm?'editar':(U.perms&&U.perms[m])||'';
  // solicitudes de vacaciones: las ven quienes las cargan y quienes ven o aprueban Vacaciones
  const lvl=m=>m==='vacsol'?(lvl0('vacsol')||(lvl0('vacaciones')?'ver':'')):lvl0(m);
  S.can=m=>!!lvl(m);
  const canW=m=>m==='otros'?isAdm:lvl(m)==='editar';
  for(const v in VIEW_MOD){ if(!lvl(VIEW_MOD[v])){ const n=document.querySelector(`.nav-item[data-v="${v}"]`); if(n) n.style.display='none'; } }
  const _gv=window.goView;
  window.goView=function(id){
    const m=VIEW_MOD[id]; if(m&&!lvl(m)){ App.toast('No tenés acceso a ese módulo.',true); id='v-home'; }
    _gv(id); applyRO(id);
  };
  // modo consulta: sin botones de descarga, impresión ni exportación (se vuelve a aplicar cada vez que la vista se redibuja)
  const DLRX=/descarg|excel|\bpdf\b|\bcsv\b|word|imprim|export|copiar para|planilla/i;
  function noDl(sec){ const run=()=>sec.querySelectorAll('button,a').forEach(b=>{ if(!b.closest('.vs-keep')&&DLRX.test(b.textContent||'')) b.style.display='none'; });
    run(); if(!sec._nodl){ sec._nodl=new MutationObserver(()=>{ if(sec.classList.contains('nodl')) run(); }); sec._nodl.observe(sec,{childList:true,subtree:true}); } }
  function applyRO(id){
    const m=VIEW_MOD[id], sec=document.getElementById(id); if(!sec||!m) return;
    const L=lvl(m), dl=L!=='consulta'&&U.descargas!==false, ro=L==='ver'||L==='consulta';
    sec.classList.toggle('ro',ro); sec.classList.toggle('nodl',!dl); if(!dl) noDl(sec);
    let b=sec.querySelector('.ro-banner');
    const txt=L==='consulta'?'<b>Solo consulta.</b> Podés ver la información en pantalla, sin descargar ni modificar.'
      :L==='ver'?(dl?'<b>Solo lectura.</b> Podés ver y descargar informes de este módulo, pero no cargar archivos ni modificar datos.':'<b>Solo lectura, sin descargas.</b> Podés ver la información en pantalla, sin descargar informes ni modificar datos.')
      :'<b>Sin descargas.</b> Podés trabajar en este módulo, pero no descargar ni imprimir informes.';
    if((ro||!dl)&&!b){ b=document.createElement('div'); b.className='ro-banner'; const vh=sec.querySelector('.vhead'); (vh||sec.firstChild).after(b); }
    if(b) b.innerHTML=txt;
    if(!ro&&dl&&b) b.remove();
  }
  // en el servidor no se borra la base completa; importar una base solo lo hace un administrador
  const rst=$('#btnReset'); if(rst) rst.style.display='none';
  // con servidor, el protector de pantalla usa la contraseña del panel: no hay una clave aparte
  { const pc=$('#cf-pass-btn'); if(pc&&pc.closest('.card')) pc.closest('.card').style.display='none'; }
  if(!isAdm){ ['#btnImportDB','#btnExportDB'].forEach(q=>{ const im=$(q); if(im) im.style.display='none'; }); }   // el respaldo completo es solo del administrador

  /* ---------------- guardado ---------------- */
  const pick=(o,ks)=>{ const r={}; ks.forEach(k=>{ if(o[k]!==undefined) r[k]=o[k]; }); return r; };
  const known=new Set([].concat(...Object.values(S.MAP),['fich']));
  const otrosOf=db=>{ const r={}; for(const k in db) if(!known.has(k)) r[k]=db[k]; return r; };
  const f3Of=()=>{ const r={}; S.F3K.forEach(k=>{ try{ const v=localStorage.getItem(k); if(v!=null) r[k]=v; }catch(e){} }); return r; };
  const ver={}, snap={};
  for(const m in S.MAP){ ver[m]=(S.docs[m]||{}).version||0; snap[m]=JSON.stringify(pick(S.initial,S.MAP[m])); }
  ver.otros=(S.docs.otros||{}).version||0; snap.otros=JSON.stringify(otrosOf(S.initial));
  ver.f3=(S.docs.f3||{}).version||0; snap.f3=JSON.stringify(f3Of());
  snap.fich=JSON.stringify(S.initial.fich||{});
  let lastAct=0; ['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{ lastAct=Date.now(); },true));
  const roWarned={}; let pending=null, saving=false, again=false, lastDB=null;
  const stEl=()=>$('#srv-st');
  const setSt=(t,c)=>{ const e=stEl(); if(e){ e.textContent=t; e.className='srv-st '+(c||''); } };
  const LBL=m=>(S.modules&&S.modules[m])||(m==='otros'?'Configuración general':m);
  async function putDoc(m,data,json){
    if(!canW(m)){ if((lvl(m)==='ver'||lvl(m)==='consulta')&&Date.now()-lastAct<5000&&!roWarned[m]){ roWarned[m]=1; App.toast(`Solo lectura en ${LBL(m)}: tus cambios no se guardan en el servidor.`,true); } snap[m]=json; return; }
    const nota=(S.notas[m]||[]).splice(0).join(' · ');
    try{ const r=await api('PUT','/api/docs/'+m,{data,base:ver[m],nota}); ver[m]=r.version; snap[m]=json; }
    catch(err){
      if(err.status===409){ App.toast((err.message||'Otro usuario modificó '+LBL(m))+'. Se cargó su versión; repetí tu último cambio.',true); await pullDoc(m,true); }
      else if(err.status===401){ App.toast('Tu sesión venció: ingresá de nuevo.',true); loginScreen(); throw err; }
      else if(err.status===403){ roWarned[m]=1; snap[m]=json; App.toast(err.message,true); }
      else throw err;
    }
  }
  async function flush(){
    if(saving){ again=true; return; } saving=true; setSt('Guardando…','busy');
    try{
      do{ again=false; const db=lastDB;
        for(const m in S.MAP){ const d=pick(db,S.MAP[m]), j=JSON.stringify(d); if(j!==snap[m]) await putDoc(m,d,j); }
        const o=otrosOf(db), oj=JSON.stringify(o); if(oj!==snap.otros) await putDoc('otros',o,oj);
        const fj=JSON.stringify(db.fich||{}); if(fj!==snap.fich){ await api('PUT','/api/me/docs/fich',{data:{fich:db.fich||{}}}); snap.fich=fj; }
        const f3=f3Of(), f3j=JSON.stringify(f3); if(f3j!==snap.f3) await putDoc('f3',f3,f3j);
      }while(again);
      setSt('Guardado','ok');
    }catch(err){ setSt('Sin guardar','err'); if(err.status!==401) App.toast('No se pudo guardar en el servidor: '+err.message+'. Reintento en unos segundos.',true); setTimeout(()=>{ if(lastDB) S.save(lastDB); },8000); }
    finally{ saving=false; }
  }
  let impAvisado=false;
  S.save=db=>{ lastDB=db; if(S.imp){ if(!impAvisado&&Date.now()-lastAct<5000){ impAvisado=true; App.toast('Modo "ver como": los cambios no se guardan.',true); } return Promise.resolve(); } clearTimeout(pending); pending=setTimeout(flush,500); return Promise.resolve(); };
  // francos día por día: el servidor aplica el cambio sobre la última versión y anota quién y cuándo
  S.francosCeldas=async cambios=>{
    if(!canW('francos')) throw new Error('No tenés permiso para asignar francos.');
    if(pending){ clearTimeout(pending); pending=null; await flush(); }
    const r=await api('POST','/api/francos/celdas',{cambios});
    if(r.prev!==(ver.francos||0)){ await pullDoc('francos',true); return r; }   // alguien más cambió algo: se trae todo
    const F=DB.francos||(DB.francos={emps:{},files:[]}); F.emps=F.emps||{}; F.fa=F.fa||{};
    for(const k in r.emps) F.emps[k]=r.emps[k];
    for(const k in r.fa) F.fa[k]=r.fa[k];
    if(r.log&&r.log.length) F.log=(F.log||[]).concat(r.log).slice(-500);
    F.at=r.at; ver.francos=r.version; snap.francos=JSON.stringify(pick(DB,S.MAP.francos));
    setSt('Guardado','ok'); return r; };
  // F3 guarda directo en el navegador: se detecta y se sube
  const _set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){ _set.call(this,k,v); if(this===window.localStorage&&S.F3K.includes(k)){ lastDB=lastDB||DB; clearTimeout(pending); pending=setTimeout(flush,800); } };
  window.addEventListener('beforeunload',e=>{ if(saving||pending&&stEl()&&stEl().classList.contains('busy')){ e.preventDefault(); e.returnValue=''; } });

  /* ---------------- cambios de otros usuarios ---------------- */
  async function pullDoc(m,silent){
    const d=await api('GET','/api/docs/'+m); ver[m]=d.version;
    if(m==='f3'){ S.F3K.forEach(k=>{ try{ if(d.data[k]!=null) _set.call(localStorage,k,d.data[k]); else localStorage.removeItem(k); }catch(e){} }); snap.f3=JSON.stringify(f3Of());
      App.toast(`${d.updated_by||'Otro usuario'} actualizó Novedades F3. Recargá la página para verlo.`); return; }
    if(m==='otros'){ Object.assign(DB,d.data); snap.otros=JSON.stringify(otrosOf(DB)); }
    else { S.MAP[m].forEach(k=>{ if(k in d.data) DB[k]=d.data[k]; else delete DB[k]; }); snap[m]=JSON.stringify(pick(DB,S.MAP[m])); }
    try{ if(typeof recompute==='function') recompute(); if(typeof boot2==='function') boot2(); }catch(e){ console.error(e); }
    App.refresh(); App.onView(curView);
    if(!silent) App.toast(`${d.updated_by||'Otro usuario'} actualizó ${LBL(m)}.`);
  }
  let pzLast=null, bzLast=null;
  async function poll(){
    if(document.hidden||saving) return;
    try{ const s=await api('GET','/api/sync'+(window.chatSt?'?st='+chatSt():''));
      for(const m in s.docs){ if(s.docs[m].version>(ver[m]||0)&&(m==='f3'||S.MAP[m]||m==='otros')) await pullDoc(m); }
      if(s.vacsol&&typeof VS!=='undefined'){ if(s.vacsol.v!==VS.ver){ const nuevo=VS.ok&&VS.aprueba&&s.vacsol.pend>VS.items.filter(x=>x.estado==='pendiente').length; await vsLoad(); if(nuevo) App.toast('Llegó una solicitud de vacaciones para revisar.'); } else vsBadge(s.vacsol.pend); }
      if(pzLast!==null&&(s.pizarra.last!==pzLast.last||s.pizarra.n!==pzLast.n||s.buzon!==bzLast)) SOC.refresh(); pzLast=s.pizarra; bzLast=s.buzon;
      // versión nueva del panel publicada mientras la pestaña estaba abierta: avisar para recargar
      if(s.build){ if(!S.build) S.build=s.build; else if(s.build!==S.build&&!document.getElementById('srv-upd')){ const b=document.createElement('div'); b.id='srv-upd';
        b.innerHTML='<span>🔄 Hay una versión nueva del panel.</span><button type="button" class="btn primary sm">Recargar ahora</button>'; b.querySelector('button').onclick=()=>location.reload(); document.body.appendChild(b); } }
      if(JSON.stringify(s.user.perms)!==JSON.stringify(U.perms)||s.user.rol!==U.rol||s.user.aus_parcial!==U.aus_parcial||s.user.descargas!==U.descargas) permsCambiaron(s.user);
      setSt('Guardado','ok');
    }catch(err){ if(err.status===401) loginScreen(); else setSt('Sin conexión','err'); }
  }
  setInterval(poll,30000); setTimeout(poll,4000);

  /* ---------------- administración de usuarios (Configuración) ---------------- */
  let USR=[], MODS=S.modules||{}, usSel=null;   // usSel: fila marcada en la tabla de usuarios
  const LV={'':'—','consulta':'Consultar','ver':'Ver','editar':'Editar'};
  async function loadUsers(){ const r=await api('GET','/api/users'); USR=r.users; MODS=r.modules; }
  function renderAdmin(){
    const box=$('#us-list'); if(!box) return;
    const card=box.closest('.card'); const h=card&&card.querySelector('.card-h');
    if(h) h.innerHTML='<h3>Usuarios y permisos</h3><span class="meta">'+(isAdm?'cada usuario ve solo los módulos que le habilites':'tu cuenta')+'</span>';
    const note=card&&card.querySelector('.cf-note'); if(note) note.textContent=isAdm?'Ver: puede mirar y descargar informes. Editar: además carga archivos y modifica datos. Los administradores tienen acceso total y gestionan usuarios y el buzón.':'Tu usuario y tus permisos los administra el responsable del panel.';
    const form=card&&card.querySelector('.filters'); if(form) form.style.display=isAdm?'':'none';
    if(!isAdm){ box.innerHTML=`<div class="us-row"><b>${esc(U.nombre)}</b><span class="tag">${esc(U.username)}</span><button class="btn ghost sm" data-srv-pass>Cambiar contraseña</button></div>`; return; }
    box.innerHTML=`<div class="tscroll"><table class="us-tab"><thead><tr><th>Usuario</th><th>Rol</th>${Object.entries(MODS).map(([k,v])=>`<th title="${esc(v)}">${esc(v.split(' ')[0])}</th>`).join('')}<th title="Descargar e imprimir informes (Excel, PDF) en las secciones que ve">Descargas</th><th>Estado</th><th></th></tr></thead><tbody>`+
      USR.map(u=>`<tr data-uid="${u.id}" class="${u.activo?'':'off'}${usSel===u.id?' sel':''}" title="Clic en la fila para marcarla"><td><b>${esc(u.nombre)}</b><div class="us-un">${esc(u.username)}${u.last_login?' · último ingreso '+fmtAt(u.last_login):' · nunca ingresó'}</div></td>
        <td><select data-uf="rol"><option value="usuario"${u.rol==='usuario'?' selected':''}>Usuario</option><option value="admin"${u.rol==='admin'?' selected':''}>Admin</option></select></td>
        ${Object.keys(MODS).map(m=>`<td>${u.rol==='admin'?'<span class="us-all">total</span>':`<select data-up="${m}">${Object.entries(LV).map(([k,v])=>`<option value="${k}"${(u.perms[m]||'')===k?' selected':''}>${v}</option>`).join('')}</select>`}</td>`).join('')}
        <td>${u.rol==='admin'?'<span class="us-all">total</span>':`<select data-uf="descargas"><option value="si"${u.descargas!==false?' selected':''}>Sí</option><option value="no"${u.descargas===false?' selected':''}>No</option></select>`}</td>
        <td><label class="switch"><input type="checkbox" data-uf="activo"${u.activo?' checked':''}> ${u.activo?'Activo':'Inactivo'}</label></td>
        <td><button class="btn ghost sm" data-ureset>Nueva clave</button></td></tr>`).join('')+'</tbody></table></div>'+
      `<div class="us-audit"><button class="btn ghost sm" id="us-aud-b">Ver registro de actividad</button><div id="us-aud"></div></div>`;
  }
  function showPass(nombre,username,pw){
    const d=document.createElement('div'); d.id='srv-pw';
    d.innerHTML=`<div class="sl-box"><h2>Contraseña temporal</h2><p class="sl-help">Pasásela a <b>${esc(nombre)}</b> por un medio privado. Al ingresar va a tener que elegir una propia. No se vuelve a mostrar.</p>
      <div class="pw-big"><span>Usuario</span><b>${esc(username)}</b><span>Contraseña</span><b>${esc(pw)}</b></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" id="pw-cp">Copiar</button><button class="btn primary" id="pw-ok">Listo</button></div></div>`;
    document.body.appendChild(d);
    $('#pw-cp').onclick=()=>{ navigator.clipboard&&navigator.clipboard.writeText(`Usuario: ${username}\nContraseña temporal: ${pw}`); App.toast('Copiado'); };
    $('#pw-ok').onclick=()=>d.remove();
  }
  async function refreshAdmin(){ if(isAdm){ try{ await loadUsers(); }catch(e){ App.toast(e.message,true); } } renderAdmin(); }
  const _ovSrv=App.onView; App.onView=(id,f)=>{ _ovSrv(id,f); if(id==='v-config') refreshAdmin(); };
  document.addEventListener('change',async e=>{
    const tr=e.target.closest('tr[data-uid]'); if(!tr||!isAdm) return; const id=+tr.dataset.uid, u=USR.find(x=>x.id===id); if(!u) return;
    const body={};
    if(e.target.dataset.up){ const p=Object.assign({},u.perms); p[e.target.dataset.up]=e.target.value; body.perms=p; }
    if(e.target.dataset.uf==='rol') body.rol=e.target.value;
    if(e.target.dataset.uf==='activo') body.activo=e.target.checked;
    if(e.target.dataset.uf==='descargas') body.descargas=e.target.value==='si';
    try{ await api('PUT','/api/users/'+id,body); App.toast('Usuario actualizado'); }catch(err){ App.toast(err.message,true); }
    refreshAdmin();
  });
  document.addEventListener('click',async e=>{
    // marcar una fila de la tabla de usuarios (el nombre queda fijo a la izquierda al moverse por los permisos)
    const ur=e.target.closest('.us-tab tbody tr'); if(ur&&!e.target.closest('select,button,input,label')){
      const id=+ur.dataset.uid; usSel=usSel===id?null:id; ur.parentNode.querySelectorAll('tr').forEach(t=>t.classList.toggle('sel',+t.dataset.uid===usSel)); }
    if(e.target.closest('[data-srv-pass]')){ $('#mePill').classList.remove('open'); passScreen(false); return; }
    if(e.target.closest('[data-srv-out]')){ if(S.imp){ try{ await api('POST','/api/ver-como/salir'); }catch(x){} location.reload(); return; } logout(); return; }
    if(e.target.closest('[data-imp-out]')){ try{ await api('POST','/api/ver-como/salir'); }catch(x){} location.reload(); return; }
    if(e.target.closest('[data-vercomo]')){ $('#mePill').classList.remove('open'); verComo(); return; }
    const rs=e.target.closest('[data-ureset]'); if(rs&&isAdm){ const u=USR.find(x=>x.id===+rs.closest('tr').dataset.uid);
      if(u&&confirm(`¿Generar una contraseña nueva para ${u.nombre}? Se cierran sus sesiones abiertas.`)){ try{ const r=await api('POST',`/api/users/${u.id}/reset`); showPass(u.nombre,u.username,r.password); }catch(err){ App.toast(err.message,true); } } return; }
    if(e.target.id==='us-aud-b'){ try{ const r=await api('GET','/api/audit'); $('#us-aud').innerHTML=`<div class="tscroll" style="max-height:320px"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>${r.items.map(i=>`<tr><td class="mono">${fmtAt(i.at)}</td><td>${esc(i.usuario)}</td><td>${esc(i.accion.replace(/_/g,' '))}</td><td>${esc(i.detalle)}</td></tr>`).join('')}</tbody></table></div>`; }catch(err){ App.toast(err.message,true); } return; }
    if(e.target.id==='us-add'&&isAdm){ e.stopImmediatePropagation();
      const nombre=$('#us-nm').value.trim(), username=($('#us-un')&&$('#us-un').value.trim())||'';
      if(!nombre||!username){ App.toast('Completá nombre y usuario.',true); return; }
      try{ const r=await api('POST','/api/users',{nombre,username,rol:$('#us-rol').value}); $('#us-nm').value=''; $('#us-un').value=''; showPass(r.user.nombre,r.user.username,r.password); refreshAdmin(); }
      catch(err){ App.toast(err.message,true); } }
  },true);
  // formulario de alta: agrega el campo "usuario"
  const nm=$('#us-nm'); if(nm&&!$('#us-un')){ const f=document.createElement('div'); f.className='field'; f.style.minWidth='160px'; f.innerHTML='<label>Usuario (para ingresar)</label><input type="text" id="us-un" maxlength="60" placeholder="ej: mperez">'; nm.closest('.field').after(f); nm.placeholder='Apellido, nombre'; }

  /* ---------------- indicador de guardado ---------------- */
  const pill=$('#mePill'); if(pill&&!$('#srv-st')){ const s=document.createElement('span'); s.id='srv-st'; s.className='srv-st ok'; s.textContent='Guardado'; s.title='Estado del guardado en el servidor'; pill.before(s); }
  // nombre del usuario en el saludo y en el protector de pantalla; las secciones del menú sin módulos visibles se ocultan
  const fn=NOMBRE(); document.querySelectorAll('#v-home h2 .grad').forEach(e=>e.textContent=fn);
  const lk=document.querySelector('.lk-user'); if(lk){ const sp=lk.querySelector('span'), b=lk.querySelector('b'); if(sp) sp.textContent=ini(U.nombre); if(b) b.textContent=U.nombre; }
  document.querySelectorAll('.nav-lab').forEach(l=>{ let n=l.nextElementSibling, vis=false; while(n&&!n.classList.contains('nav-lab')){ if(n.classList.contains('nav-item')&&n.style.display!=='none') vis=true; n=n.nextElementSibling; } if(!vis) l.style.display='none'; });
  // los usuarios que no administran no cargan archivos: se ocultan los avisos de fuentes sin cargar
  if(!isAdm){ const sp=$('#m365pill'); if(sp) sp.style.display='none'; const hs=$('#h-src'); if(hs&&hs.closest('.card')) hs.closest('.card').style.display='none'; }
  const ft=$('footer.foot'); if(ft) ft.textContent='PANEL DE TRABAJO RRHH I.CASANOVA · Grupo Gestión · datos guardados en el servidor, con acceso por usuario';
  // sin avisos de "subí tal archivo" para quien no administra la carga
  if(!isAdm){ const _caS=computeAvisos; computeAvisos=function(){ return _caS().filter(x=>!/^Actualización/.test(x.t||'')); }; App.refresh(); }
  // Ausentismo parcial: solo Llegadas tarde y Reincidencias
  if(U.aus_parcial){ const keep=new Set(['p-tarde','p-rank']);
    document.querySelectorAll('#v-ausentismo #tabs .tab').forEach(t=>{ if(!keep.has(t.dataset.p)){ t.style.display='none'; const p=document.getElementById(t.dataset.p); if(p){ p.classList.remove('on'); p.style.display='none'; } } });
    const t0=document.querySelector('#v-ausentismo #tabs .tab[data-p="p-tarde"]'); if(t0&&!t0.classList.contains('on')) t0.click(); }
  if(U.must_change&&!S.imp) passScreen(true);
  // "ver como": aviso fijo arriba y botón para volver al usuario propio
  if(S.imp){ document.body.classList.add('srv-imp'); const b=document.createElement('div'); b.id='srv-imp';
    b.innerHTML=`<span>👁 Estás viendo el panel como <b>${esc(U.nombre)}</b> · solo lectura, no se guarda ningún cambio</span><button type="button" class="btn primary sm" data-imp-out>Volver a ${esc(S.imp.nombre.split(',')[1]?S.imp.nombre.split(',')[1].trim():S.imp.nombre)}</button>`;
    document.body.prepend(b); }
  // coordinadores: sin las fechas de baja de eventuales (el servidor tampoco se las manda)
  if(U.nobajas){ setTimeout(()=>{ const t=document.querySelector('#tabsAnt [data-p="pa-prox"]'), p=document.getElementById('pa-prox');
    if(t){ t.style.display='none'; } if(p) p.style.display='none';
    const d=document.querySelector('#tabsAnt [data-p="pa-dot"]'); if(d&&t&&t.classList.contains('on')) d.click(); },0); }
  return {online:true,user:U,logout,passScreen,api,isAdm};
})();