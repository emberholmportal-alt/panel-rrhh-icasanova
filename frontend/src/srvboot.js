/* ================================================================
   ARRANQUE EN SERVIDOR
   Si el panel se abre desde el servidor (http/https), antes de que arranquen
   los módulos se piden al servidor el usuario, sus permisos y los datos que
   puede ver. Abierto como archivo (file://) sigue funcionando en modo local.
   ================================================================ */
(function(){
  if(!/^https?:$/.test(location.protocol)) return;
  var MAP={ausentismo:['version','tolerancia','escPedidos','escApercib','renglones','shifts','records','people','templates','files'],
    vacaciones:['vac','vacOv'],eventuales:['ant','antOv','antAdd','antLog'],francos:['francos'],
    indumentaria:['ropa','ropaOv','ropaPrep','ropaTalles','ropaTallesMeta'],anticipos:['anticipos'],agenda:['recs'],nomina:['nomina'],menu:['menu'],cumpleanos:['cumple'],ausmot:['ausmot']};
  var F3K=['panelF3_base_v1','panelF3_ajustes_v1','panelF3_codigos_v1'];
  var S=window.SRV={MAP:MAP,F3K:F3K,mode:'login',docs:{},initial:{}};
  var x=new XMLHttpRequest();
  try{ x.open('GET','/api/bootstrap',false); x.send(); }
  catch(e){ S.mode='error'; S.err='No hay conexión con el servidor.'; }
  if(x.status===200){
    var B=JSON.parse(x.responseText);
    S.mode='online'; S.user=B.user; S.modules=B.modules; S.docs=B.docs||{}; S.userDocs=B.user_docs||{}; S.build=B.build||''; S.imp=B.imp||null;
    // F3 guarda sus datos en el navegador: se reemplazan por los del servidor
    var f3=(S.docs.f3&&S.docs.f3.data)||{};
    F3K.forEach(function(k){ try{ if(f3[k]!=null) localStorage.setItem(k,f3[k]); else localStorage.removeItem(k); }catch(e){} });
    var db={};
    for(var m in MAP){ var d=S.docs[m]; if(d&&d.data) MAP[m].forEach(function(k){ if(k in d.data) db[k]=d.data[k]; }); }
    if(S.docs.otros&&S.docs.otros.data) for(var k in S.docs.otros.data) if(!(k in db)) db[k]=S.docs.otros.data[k];
    if(S.userDocs.fich&&S.userDocs.fich.fich) db.fich=S.userDocs.fich.fich;
    S.initial=db;
  } else if(x.status&&x.status!==401){ S.mode='error'; S.err='El servidor respondió con un error ('+x.status+').'; }
  // el panel guarda a través de esta interfaz: en línea va al servidor; sin sesión no se guarda nada
  window.storage={
    get:function(){ return Promise.resolve({value:JSON.stringify(S.initial||{})}); },
    set:function(k,s){ return S.save?S.save(JSON.parse(s)):Promise.resolve(); },
    delete:function(){ return Promise.resolve(); }
  };
})();
