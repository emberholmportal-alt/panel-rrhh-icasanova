import re
import os
HERE=os.path.dirname(os.path.abspath(__file__))
W=os.path.join(HERE,'src')+os.sep
OUT=os.path.join(HERE,'dist','index.html')
iso=open(W+'isidro.html',encoding='utf-8').read()
f3=open(W+'f3.html',encoding='utf-8').read()
shell=open(W+'shell.html',encoding='utf-8').read()
css=open(W+'shell.css',encoding='utf-8').read()
app=open(W+'app.js',encoding='utf-8').read(); _k=app.rindex('})();'); app=app[:_k]+'\n'+open(W+'social.js',encoding='utf-8').read()+'\n'+open(W+'nomina.js',encoding='utf-8').read()+'\n'+open(W+'comedor.js',encoding='utf-8').read()+'\n'+open(W+'server.js',encoding='utf-8').read()+'\n'+open(W+'vacsol.js',encoding='utf-8').read()+'\n'+open(W+'eventuales.js',encoding='utf-8').read()+'\n'+open(W+'hextras.js',encoding='utf-8').read()+'\n'+open(W+'ausmot.js',encoding='utf-8').read()+'\n'+open(W+'viandas.js',encoding='utf-8').read()+'\n'+open(W+'chat.js',encoding='utf-8').read()+'\n'+open(W+'wa.js',encoding='utf-8').read()+'\n'+open(W+'indicadores.js',encoding='utf-8').read()+'\n'+app[_k:]

def one(s,a,b):
    assert s.count(a)==1,('NO UNICO',a[:80],s.count(a)); return s.replace(a,b)

logo=re.search(r'<img class="logo" alt="Grupo Gestión" src="([^"]+)"',iso).group(1)

def section(html,vid):
    i=html.index(f'<section class="view" id="{vid}">'); j=html.index('</section>',i)+len('</section>')
    return html[i:j]

def vhead(n,area,title,desc):
    return f'<div class="vhead"><div><div class="eyebrow">Módulo {n} · {area}</div><h2>{title}</h2><p>{desc}</p></div></div>'

def card(id_,title,meta=''):
    return f'<div class="card"><div class="card-h"><h3>{title}</h3><span class="meta">{meta}</span></div><div class="card-b" id="{id_}"></div></div>'

# ---------- AUSENTISMO ----------
aus=section(iso,'v-ausentismo')
aus=one(aus,'<input type="file" id="fileDB" accept=".json" hidden>','')
aus=one(aus,'<section class="view" id="v-ausentismo">','<section class="view" id="v-ausentismo">\n  '+vhead('01','Gestión diaria','Llegadas tarde','Reporte diario del reloj: llegadas tarde, reincidencias, presentes, sin fichada y escalada disciplinaria automática: pedido de explicación → apercibimiento → suspensión.'))
aus=one(aus,'<div class="drop" id="drop">','<div class="updbar" id="upd-aus"></div>\n  <div class="drop" id="drop">')
aus=one(aus,'<div class="kpis" id="kpis"></div>','<div class="kpis" id="kpis"></div>\n  <div class="cgrid">'+card('x-aus-dist','Distribución del atraso','minutos sobre la hora de ingreso')+card('x-aus-dow','Tardanzas por día de la semana','acumulado')+'</div>')

# ---------- VACACIONES ----------
vac=section(iso,'v-vacaciones')
vac=one(vac,'<section class="view" id="v-vacaciones">','<section class="view" id="v-vacaciones">\n  '+vhead('02','Gestión diaria','Vacaciones','Próximas salidas, notificaciones para firmar y el reporte para liquidar. La fuente es el Plan de vacaciones 2026 IC en SharePoint.')+'\n  <div class="srcbar" id="x-src-vac"></div>')
vac=one(vac,'<div class="kpis" id="kpisVac"></div>','<div class="kpis" id="kpisVac"></div>\n  <div class="cgrid">'+card('x-vac-weeks','Personas de vacaciones por semana','próximas 16 semanas')+'<div class="card"><div class="card-h"><h3>Fuera hoy y saliendo esta semana</h3></div><div class="card-b"><div class="outlist" id="x-vac-out"></div></div></div></div>')
import re as _re
vac=one(vac,'<h2>Plan de vacaciones</h2>','<h2>Subir el plan de vacaciones</h2>')
vac=one(vac,'<p>Subí el <b>Plan de vacaciones</b> (.xlsx). Se lee la hoja GENERAL con las cuatro salidas de cada persona.</p>','<p>Abrí el Excel online → <b>Archivo → Guardar como → Descargar una copia</b> y soltalo acá (.xlsx). Lee los períodos de cada persona (PERIODO 1 a 5, o DESDE / HASTA) y los días del año para calcular el saldo.</p>')

# ---------- BAJAS / EVENTUALES ----------
baj=section(iso,'v-bajas')
baj=one(baj,'<section class="view" id="v-bajas">','<section class="view" id="v-bajas">\n  '+vhead('03','Gestión diaria','Eventuales','Dotación por turno y tarea y bajas por fin de período de prueba. La fuente es el control de eventuales en SharePoint.')+'\n  <div class="srcbar" id="x-src-ant"></div>')
baj=one(baj,'<h2>Control de antigüedad de eventuales</h2>','<h2>Subir el control de eventuales</h2>')
baj=one(baj,'<p>Subí el <b>Control de antigüedad</b> (.xlsx).','<p>Abrí el Excel online → <b>Archivo → Guardar como → Descargar una copia</b> y soltalo acá (.xlsx).')
baj=one(baj,'<div class="kpis" id="kpisAnt"></div>','<div class="kpis" id="kpisAnt"></div>\n  <div class="cgrid">'+card('x-ant-weeks','Bajas por semana','próximas 10 semanas')+card('x-ant-antig','Antigüedad del plantel activo','en días')+'</div>')


vac=one(vac,'<div class="card"><div class="card-h"><h3>Fuera hoy y saliendo esta semana</h3>','<div class="card"><div class="card-h"><h3>Fuera hoy y saliendo esta semana</h3>')
vac=one(vac,'<div class="tabs" id="tabsVac">','<div class="card"><div class="card-h"><h3>Pendiente de planificar</h3><span class="meta" id="x-vac-plan-m"></span></div><div class="card-b flush"><div class="tscroll" style="max-height:340px"><table id="x-vac-plan"></table></div></div></div>\n  <div class="tabs" id="tabsVac">')
# ---------- SCRIPT ASISTENCIA ----------
i=iso.index('<script>\n"use strict";')+len('<script>\n'); j=iso.rindex('</script>')
js=iso[i:j]
# pestañas de ausentismo: no tocar las de otros módulos
js=one(js,"""  $$('.tab').forEach(t=>t.classList.toggle('on',t===b));
  $$('.panel').forEach(p=>p.classList.toggle('on',p.id===b.dataset.p))};""",
"""  $$('#tabs .tab').forEach(t=>t.classList.toggle('on',t===b));
  $$('#v-ausentismo .panel').forEach(p=>p.classList.toggle('on',p.id===b.dataset.p))};""")
# vacaciones: formato VAC_2026 (PERIODO n DESDE, fechas "lu. 20/10/2025") + saldo por persona
a=js.index('function parseVac(rows){'); z=js.index('const vacRows=')
js=js[:a]+r"""function vDate(v){ if(typeof v==='string') v=v.trim().replace(/^[a-záéíóú]{2,4}\.?\s+/i,''); return excelDateToISO(v); }
function parseVac(rows){
  let hi=-1;
  for(let i=0;i<Math.min(rows.length,20);i++){
    const j=(rows[i]||[]).map(c=>String(c||''));
    if(j.some(c=>HV.legajo.test(c))&&j.some(c=>HV.nombre.test(c))){hi=i;break}
  }
  if(hi<0) throw new Error('No encontré el encabezado. Esperaba "Legajo" y "APELLIDO Y NOMBRE".');
  const head=rows[hi].map(c=>String(c||'').trim());
  const col={}; for(const k in HV) col[k]=head.findIndex(h=>HV[k].test(h));
  // cada salida es un bloque: NOTIFICADO | FECHA NOTIF | ACREDITADO | (PERIODO n) DESDE | HASTA | DIAS o GOZADO
  const desdes=head.map((h,i)=>/desde/i.test(h)?i:-1).filter(i=>i>=0);
  if(!desdes.length) throw new Error('No encontré columnas "DESDE" con las salidas.');
  const out=[], people={};
  for(let i=hi+1;i<rows.length;i++){
    const r=rows[i]; if(!r) continue;
    const legajo=String(r[col.legajo]??'').trim().replace(/\.0+$/,''), nombre=String(r[col.nombre]??'').trim();
    if(!legajo||!nombre||HV.legajo.test(legajo)) continue;
    const base={legajo,nombre,uo:String(r[col.uo]??'').trim(),cat:String(r[col.cat]??'').trim(),
      ingreso:vDate(r[col.ingreso]),doc:String(r[col.doc]??'').trim(),
      sector:String(r[col.sector]??'').trim(),diasAno:+r[col.dias]||0};
    const p=people[legajo]||(people[legajo]={legajo,nombre,cat:base.cat,uo:base.uo,sector:base.sector,diasAno:base.diasAno,plan:0,n:0});
    if(base.diasAno>p.diasAno) p.diasAno=base.diasAno;
    desdes.forEach((d,n)=>{
      const desde=vDate(r[d]), hasta=vDate(r[d+1]);
      if(!desde) return;
      let dias=+r[d+2];
      if(!(dias>0)) dias=hasta? Math.round((new Date(hasta+'T12:00')-new Date(desde+'T12:00'))/864e5)+1 : 0;
      out.push(Object.assign({},base,{n:n+1,id:legajo+'|'+desde,desde,hasta,dias,
        notif:String(r[d-3]??'').trim(), fnotif:vDate(r[d-2])}));
      p.plan+=dias; p.n++;
    });
  }
  out.people=Object.values(people);
  return out;
}

"""+js[z:]
js=one(js,"DB.vac={rows:parseVac(rows),file:f.name,at:new Date().toISOString()};","const _pv=parseVac(rows); DB.vac={rows:_pv,people:_pv.people||[],file:f.name,at:new Date().toISOString()};")
# router
a=js.index('function goView(id){'); b=js.index('}\n',js.index("if(id==='v-home') avisos();"))+2
js=js[:a]+"""function goView(id){
  let focus=null; const tgt=document.getElementById(id);
  if(!tgt||!tgt.classList.contains('view')){ focus=id; id='v-home'; }
  $$('.view').forEach(v=>v.classList.toggle('on',v.id===id));
  $$('.mod').forEach(m=>m.classList.toggle('on',m.dataset.v===id));
  if(!focus) window.scrollTo({top:0,behavior:'smooth'});
  if(window.App) App.onView(id,focus);
}
"""+js[b:]
# avisos -> los arma la plataforma
a=js.index('function avisos(){'); b=js.index('/* ============================================================\n   15. ROUTER')
js=js[:a]+"function avisos(){ if(window.App) App.refresh(); }\n\n"+js[b:]
# cargadores con nombre (para "Actualizar" desde archivo vinculado)
js=one(js,"hookDrop('#dropVac','#fileVac','#btnPickVac',async f=>{","const loadVacFile=async f=>{")
js=one(js,"toast('No pude leer el plan: '+err.message) }\n});","toast('No pude leer el plan: '+err.message) }\n};\nhookDrop('#dropVac','#fileVac','#btnPickVac',loadVacFile);")
js=one(js,"hookDrop('#dropAnt','#fileAnt','#btnPickAnt',async f=>{","const loadAntFile=async f=>{")
js=one(js,"toast('No pude leer el control: '+err.message) }\n});","toast('No pude leer el control: '+err.message) }\n};\nhookDrop('#dropAnt','#fileAnt','#btnPickAnt',loadAntFile);")
# exportar / importar incluye F3
js=one(js,"$('#btnExportDB').onclick=()=>download(JSON.stringify(DB),`base_asistencia_${todayISO()}.json`,'application/json');",
"""$('#btnExportDB').onclick=()=>{
  const f3={}; ['panelF3_base_v1','panelF3_ajustes_v1','panelF3_codigos_v1','panelF3_gremial_v1'].forEach(k=>{ try{ const v=localStorage.getItem(k); if(v!=null) f3[k]=v; }catch(e){} });
  download(JSON.stringify(Object.assign({},DB,{_f3:f3})),`base_panel_rrhh_ic_${todayISO()}.json`,'application/json');
  toast('Respaldo descargado (asistencia, vacaciones, eventuales, anticipos, recordatorios y F3)');
};""")
js=one(js,"await persist(); boot2(); toast('Base importada');",
"""const hadF3=j._f3&&Object.keys(j._f3).length;
    if(j._f3){ for(const k in j._f3){ try{ localStorage.setItem(k,j._f3[k]); }catch(e){} } delete DB._f3; }
    await persist(); boot2(); toast('Base importada'+(hadF3?' · recargando F3…':''));
    if(hadF3) setTimeout(()=>location.reload(),1300);""")
js=one(js,"if(!confirm('Se borran todos los registros, turnos y plantillas guardadas. ¿Seguir?')) return;",
          "if(!confirm('Se borran asistencia, vacaciones, eventuales, anticipos, recordatorios y plantillas guardadas (el F3 tiene su propio botón). ¿Seguir?')) return;")

# ---------- F3 MARKUP ----------
a=f3.index('<div class="rail" id="rail">'); b=f3.index('<div style="text-align:center;color:var(--dim)')
f3m='<div id="hola" hidden></div>\n'+f3[a:b]
bad=re.search(r'<div class="badges">(.*?)</div>',f3,re.S).group(1).strip()
shell=one(shell,'<div class="badges" id="f3badges"></div>','<div class="badges" id="f3badges">'+bad+'</div>')

# ---------- F3 CSS (scope #v-f3) ----------
f3css=f3[f3.index('<style>')+7:f3.index('</style>')]
def scope(block):
    out=[]; k=0; n=len(block)
    while k<n:
        if block[k].isspace(): k+=1; continue
        if block.startswith('/*',k): e=block.index('*/',k)+2; k=e; continue
        br=block.index('{',k); sel=block[k:br].strip()
        if sel.startswith('@media'):
            depth=1; m=br+1
            while depth:
                if block[m]=='{': depth+=1
                elif block[m]=='}': depth-=1
                m+=1
            out.append(sel+'{'+scope(block[br+1:m-1])+'}'); k=m; continue
        e=block.index('}',br); body=block[br+1:e]; k=e+1
        if sel.startswith(':root') or sel in ('*','body','body::before') or sel.startswith('#toast') or sel=='.wrap': continue
        sels=[]
        for s_ in sel.split(','):
            s_=s_.strip()
            sels.append('#v-f3 '+s_)
        out.append(','.join(sels)+'{'+body+'}')
    return '\n'.join(out)
f3scoped=scope(f3css)
f3vars="""#v-f3{--ink:#080d18;--panel:rgba(16,24,38,.78);--panel2:#152033;--line:rgba(120,160,210,.14);--line2:rgba(120,160,210,.26);
  --tx:#e6edf7;--mut:#9aa8bf;--dim:#64748b;--amber:#22d3ee;--teal:#22c55e;--coral:#f87171;--violet:#a78bfa;font-size:14px}
#v-f3 section{backdrop-filter:blur(10px);border-radius:10px!important}
#v-f3 .rail{border-radius:10px!important}
#v-f3 button.primary{background:linear-gradient(135deg,#22d3ee,#0891b2)!important;color:#04121a!important;border-color:transparent!important}
#v-f3 .vhead .badges{align-self:center}
"""
css_all=css+'\n'+open(W+'social.css',encoding='utf-8').read()+'\n'+open(W+'server.css',encoding='utf-8').read()+'\n/* ================= MÓDULO F3 (scoped) ================= */\n'+f3scoped+'\n'+f3vars

# ---------- F3 SCRIPT ----------
i=f3.index('<script>\n/* ====')+len('<script>\n'); j=f3.rindex('</script>')
f3js=f3[i:j]
f3js=one(f3js,"function toast(m,err){const t=$('#toast');t.textContent=m;t.className='show'+(err?' err':'');\n  clearTimeout(t._t);t._t=setTimeout(()=>t.className='',3400);}",
               "function toast(m,err){ if(window.App) App.toast(m,err); }")
f3js="(function(){\n"+f3js+"""
window.F3API={ estado(){ return {tipo:ST.tipo?((TIPOS[ST.tipo]||{}).nom||ST.tipo):null, base:!!ST.base, nov:!!ST.nov,
  emp:ST.base&&ST.base.emp?ST.base.emp.length:0}; },
  rep(){ return ST.rep||null; }, periodo(){ try{ return ST.nov?periodoNov().txt:''; }catch(e){ return ''; } }, ajustes(){ try{ return nOver(); }catch(e){ return 0; } },
  filas(){ return (ST.filas&&ST.filas.length)||0; } };
})();"""

# ---------- ARMADO ----------
out=shell.replace('/*@@CSS@@*/',css_all).replace('@@LOGO@@',logo)
out=one(out,'@@AUSENTISMO@@',aus); out=one(out,'@@VACACIONES@@',vac); out=one(out,'@@BAJAS@@',baj)
out=one(out,'@@F3@@',f3m)
out=one(out,'/*@@JS_ISIDRO@@*/',js+"\nwindow.appToast=toast;\n")
out=one(out,'/*@@JS_F3@@*/',f3js)
out=one(out,'/*@@JS_APP@@*/',app)
out=out.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/','<script>'+open(W+'srvboot.js',encoding='utf-8').read()+'</script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/',1)
os.makedirs(os.path.dirname(OUT),exist_ok=True)
open(OUT,'w',encoding='utf-8').write(out)
print('ok',OUT,len(out))
print('ok',len(out))
