"""PANEL DE TRABAJO RRHH I.CASANOVA — servidor.

Sirve el panel (frontend/dist/index.html) y la API:
  /api/auth/*     inicio de sesión, cierre, cambio de contraseña
  /api/bootstrap  usuario + permisos + datos de los módulos que puede ver
  /api/docs/*     datos compartidos de cada módulo (con control de versión)
  /api/me/docs/*  datos personales (por ejemplo, la fichada)
  /api/users/*    administración de usuarios y permisos (solo admin)
  /api/pizarra/*  cartelera
  /api/buzon/*    buzón de sugerencias
  /api/audit      registro de actividad (solo admin)
"""
import copy
import json
import re
import secrets
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, inspect, text
from sqlalchemy.orm import Session

from . import auth, seed
from .feriados import FERIADOS
from .auth import current_user, require_admin, can_read, can_write, MODULES, LEVELS, DEFAULT_PERMS
from .db import Base, engine, get_db, SessionLocal
from .models import User, Doc, UserDoc, PizarraItem, BuzonItem, Audit, now

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist" / "index.html"


def _build_id() -> str:
    """Huella de la versión publicada del panel: si cambia, los navegadores abiertos avisan que hay que recargar."""
    import hashlib
    try:
        return hashlib.md5(DIST.read_bytes()).hexdigest()[:12]
    except OSError:
        return ""


BUILD = _build_id()
DOC_KEYS = set(MODULES) | {"otros"}
USER_DOC_KEYS = {"fich"}
MAX_DOC = 15 * 1024 * 1024       # 15 MB por módulo
MAX_ITEM = 4 * 1024 * 1024       # 4 MB por nota o sugerencia (imágenes incluidas)

app = FastAPI(title="Panel RRHH I.Casanova", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=2000)


@app.middleware("http")
async def headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


# ------------------------------------------------------------------ arranque
@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if not db.scalar(select(func.count()).select_from(User)):
            username = (os.environ.get("ADMIN_USERNAME") or "admin").strip().lower()
            pw = os.environ.get("ADMIN_PASSWORD") or ("admin1234" if not os.environ.get("RENDER") else None)
            if not pw:
                print("FALTA ADMIN_PASSWORD: no se creó el usuario administrador inicial.")
                return
            db.add(User(username=username, nombre=os.environ.get("ADMIN_NOMBRE", "Administrador"), rol="admin",
                        perms={}, pass_hash=auth.hash_pw(pw), must_change=True))
            auth.audit(db, "sistema", "admin_inicial", username)
            db.commit()
            print(f"Usuario administrador inicial creado: {username} (tiene que cambiar la contraseña al entrar)")
        # usuarios iniciales: se crean una sola vez, si no existen
        for username, nombre, perfil, h in seed.USUARIOS:
            if not db.scalar(select(User).where(User.username == username)):
                db.add(User(username=username, nombre=nombre, rol="usuario", perms=seed.perfil(perfil), pass_hash=h, must_change=True))
                auth.audit(db, "sistema", "crear_usuario", username)
        db.commit()
        # cambios de permisos de una sola vez para usuarios existentes (ver seed.MIGRACIONES)
        mg = db.get(Doc, "_migraciones")
        hechas = set((mg.data or {}).get("hechas", [])) if mg else set()
        nuevas = []
        for clave, cambios in seed.MIGRACIONES:
            if clave in hechas:
                continue
            for username, perms in cambios:
                uu = db.scalar(select(User).where(User.username == username))
                if uu:
                    uu.perms = {**(uu.perms or {}), **perms}
                    auth.audit(db, "sistema", "permisos", f"{username}: {perms}")
            nuevas.append(clave)
        for clave, extra in seed.NOMINA_EXTRA:
            if clave in hechas:
                continue
            nd = db.get(Doc, "nomina")
            if nd is None:
                nd = Doc(key="nomina", data={}, version=0)
                db.add(nd)
            data = dict(nd.data or {})
            nom = dict(data.get("nomina") or {"emps": {}, "files": []})
            ex = dict(nom.get("extra") or {})
            for leg, e in extra.items():
                ex[leg] = {"leg": leg, **e, "at": iso(now()), "por": "sistema"}
            nom["extra"] = ex
            data["nomina"] = nom
            nd.data = data
            nd.version = (nd.version or 0) + 1
            nd.updated_at = now()
            nd.updated_by = "sistema"
            auth.audit(db, "sistema", "nomina_extra", f"{clave}: {', '.join(extra)}")
            nuevas.append(clave)
        if nuevas:
            if mg is None:
                mg = Doc(key="_migraciones", data={}, version=0)
                db.add(mg)
            mg.data = {"hechas": sorted(hechas | set(nuevas))}
            db.commit()
        # recuperación del administrador: si ADMIN_RESET_PASSWORD está definida, la clave del admin
        # pasa a ser esa (temporal, hay que cambiarla al entrar). Borrar la variable después de usarla.
        # Se aplica UNA sola vez por valor: si la variable queda puesta, los reinicios de Render
        # (deploys o el servicio que se duerme) no vuelven a pisar la clave que eligió el admin.
        reset = os.environ.get("ADMIN_RESET_PASSWORD")
        if reset:
            import hashlib
            username = (os.environ.get("ADMIN_USERNAME") or "admin").strip().lower()
            u = db.scalar(select(User).where(User.username == username))
            marca = db.get(Doc, "_reset_admin")
            huella = hashlib.sha256((username + "|" + reset).encode()).hexdigest()
            if u and not (marca and (marca.data or {}).get("h") == huella):
                if marca is None:
                    marca = Doc(key="_reset_admin", data={}, version=0)
                    db.add(marca)
                marca.data = {"h": huella, "at": iso(now())}
                u.pass_hash = auth.hash_pw(reset)
                u.must_change = True
                u.activo = True
                u.token_ver = (u.token_ver or 0) + 1
                auth.audit(db, "sistema", "reset_admin", username)
                db.commit()
                print(f"Clave del administrador {username} restablecida desde ADMIN_RESET_PASSWORD: borrá la variable.")


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "nombre": u.nombre, "rol": u.rol,
            "perms": {m: auth.level(u, m) for m in MODULES}, "must_change": u.must_change, "activo": u.activo,
            "last_login": u.last_login.isoformat() if u.last_login else None}


def iso(d: datetime | None) -> str | None:
    if not d:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.isoformat()


# ------------------------------------------------------------------ sesión
class LoginIn(BaseModel):
    username: str = Field(max_length=60)
    password: str = Field(max_length=200)


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    username = body.username.strip().lower()
    key = f"{username}|{request.client.host if request.client else ''}"
    if auth.login_blocked(key):
        raise HTTPException(429, "Demasiados intentos. Esperá 15 minutos o pedile al administrador que te restablezca la clave.")
    u = db.scalar(select(User).where(User.username == username))
    if not u or not u.activo or not auth.check_pw(body.password, u.pass_hash):
        auth.login_failed(key)
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    auth.login_ok(key)
    u.last_login = now()
    auth.audit(db, u, "login")
    db.commit()
    auth.set_session(response, u)
    return user_out(u)


class VerifyIn(BaseModel):
    password: str = Field(max_length=200)


@app.post("/api/auth/verify")
def verify_password(body: VerifyIn, u: User = Depends(current_user)):
    """Desbloqueo de la pantalla en reposo: confirma la contraseña del usuario que ya tiene la sesión abierta."""
    key = f"lock|{u.username}"
    if auth.login_blocked(key):
        raise HTTPException(429, "Demasiados intentos. Esperá 15 minutos o cerrá sesión y volvé a entrar.")
    if not auth.check_pw(body.password, u.pass_hash):
        auth.login_failed(key)
        return {"ok": False}
    auth.login_ok(key)
    return {"ok": True}


@app.post("/api/auth/logout")
def logout(response: Response):
    auth.clear_session(response)
    return {"ok": True}


class PassIn(BaseModel):
    actual: str = Field(max_length=200)
    nueva: str = Field(max_length=200)


@app.post("/api/auth/password")
def change_password(body: PassIn, response: Response, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if not auth.check_pw(body.actual, u.pass_hash):
        raise HTTPException(400, "La contraseña actual no es correcta")
    err = auth.pw_ok(body.nueva)
    if err:
        raise HTTPException(400, err)
    if body.nueva == body.actual:
        raise HTTPException(400, "La contraseña nueva tiene que ser distinta de la actual")
    u.pass_hash = auth.hash_pw(body.nueva)
    u.must_change = False
    u.token_ver += 1
    auth.audit(db, u, "cambio_clave")
    db.commit()
    auth.set_session(response, u)   # esta sesión sigue; las otras se cierran
    return user_out(u)


@app.get("/api/me")
def me(u: User = Depends(current_user)):
    return user_out(u)


# ------------------------------------------------------------------ datos de módulos
def doc_out(d: Doc) -> dict:
    return {"data": d.data or {}, "version": d.version, "updated_at": iso(d.updated_at), "updated_by": d.updated_by}


def readable(u: User, key: str) -> bool:
    if key == "eventuales" and can_read(u, "francos"):
        return True        # Francos arma su lista con los eventuales activos
    return key == "otros" or can_read(u, key)


def writable(u: User, key: str) -> bool:
    return (u.rol == "admin") if key == "otros" else can_write(u, key)


@app.get("/api/bootstrap")
def bootstrap(u: User = Depends(current_user), db: Session = Depends(get_db)):
    docs = {d.key: doc_out(d) for d in db.scalars(select(Doc)) if d.key in DOC_KEYS and readable(u, d.key)}
    mine = {d.key: d.data for d in db.scalars(select(UserDoc).where(UserDoc.user_id == u.id))}
    return {"user": user_out(u), "modules": MODULES, "docs": docs, "user_docs": mine,
            "server_time": iso(now()), "build": BUILD}


@app.get("/api/sync")
def sync(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Versiones actuales, para que cada navegador sepa si otro usuario cambió algo."""
    docs = {d.key: {"version": d.version, "updated_by": d.updated_by, "updated_at": iso(d.updated_at)}
            for d in db.scalars(select(Doc)) if d.key in DOC_KEYS and readable(u, d.key)}
    pz = db.scalar(select(func.max(func.coalesce(PizarraItem.updated_at, PizarraItem.created_at))))
    pz_n = db.scalar(select(func.count()).select_from(PizarraItem))
    if u.rol == "admin":
        bz = db.scalar(select(func.count()).select_from(BuzonItem).where(BuzonItem.estado == "nueva"))
    else:
        bz = db.scalar(select(func.count()).select_from(BuzonItem).where(BuzonItem.autor_id == u.id, BuzonItem.resp_vista == False, BuzonItem.resp.is_not(None)))  # noqa: E712
    vs = None
    if vs_ve(u):
        d = db.get(Doc, "vacsol")
        it = (d.data or {}).get("items", []) if d else []
        vs = {"v": d.version if d else 0, "pend": sum(1 for x in it if x.get("estado") == "pendiente" and (vs_aprueba(u) or x.get("uid") == u.id))}
    return {"docs": docs, "pizarra": {"last": iso(pz), "n": pz_n}, "buzon": bz, "vacsol": vs, "user": user_out(u), "build": BUILD}


# ------------------------------------------------------------------ solicitudes de vacaciones
# Coordinadores y supervisores cargan el pedido; RRHH (administrador o quien edita Vacaciones) lo aprueba o rechaza.
VS_ANTICIPO = 15   # días mínimos de anticipación para pedir vacaciones
VS_REGLAS = (f"las vacaciones tienen que empezar un lunes (o el martes, si el lunes es feriado) y pedirse con al menos "
             f"{VS_ANTICIPO} días de anticipación. Toda solicitud queda pendiente hasta que RRHH la apruebe.")


def vs_inicio_ok(desde: str, sector: str) -> bool:
    """Lunes, o martes si el lunes es feriado. El personal de mantenimiento puede empezar cualquier día."""
    if "MANTENIM" in sector.upper():
        return True
    d = datetime.fromisoformat(desde).date()
    if d.weekday() == 0:
        return True
    return d.weekday() == 1 and (d - timedelta(days=1)).isoformat() in FERIADOS


def vs_aprueba(u: User) -> bool:
    return u.rol == "admin" or can_write(u, "vacaciones")


def vs_pide(u: User) -> bool:
    return vs_aprueba(u) or can_write(u, "vacsol")


def vs_ve(u: User) -> bool:
    return vs_pide(u) or can_read(u, "vacaciones") or can_read(u, "vacsol")


def vs_visibles(u: User, items: list) -> list:
    if vs_aprueba(u):
        return items
    return [x for x in items if x.get("uid") == u.id or (x.get("estado") == "aprobada" and can_read(u, "vacaciones"))]


def vs_doc(db: Session, lock: bool = False) -> Doc:
    q = select(Doc).where(Doc.key == "vacsol")
    d = db.scalar(q.with_for_update() if lock else q)
    if d is None:
        d = Doc(key="vacsol", data={"items": []}, version=0)
        db.add(d)
        db.flush()
    return d


def vs_guardar(db: Session, d: Doc, items: list, u: User, accion: str, detalle: str):
    d.data = {"items": items[-2000:]}
    d.version += 1
    d.updated_at = now()
    d.updated_by = u.nombre
    auth.audit(db, u, accion, detalle)
    db.commit()


@app.get("/api/vacsol")
def vacsol_list(u: User = Depends(current_user), db: Session = Depends(get_db)):
    if not vs_ve(u):
        raise HTTPException(403, "No tenés acceso a las solicitudes de vacaciones")
    d = db.get(Doc, "vacsol")
    items = (d.data or {}).get("items", []) if d else []
    return {"version": d.version if d else 0, "items": vs_visibles(u, items), "aprueba": vs_aprueba(u), "pide": vs_pide(u)}


@app.post("/api/vacsol")
async def vacsol_nueva(request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if not vs_pide(u):
        raise HTTPException(403, "No tenés permiso para cargar solicitudes de vacaciones")
    b = json.loads(await request.body() or b"{}")
    desde, hasta = str(b.get("desde") or ""), str(b.get("hasta") or "")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", desde) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", hasta) or hasta < desde:
        raise HTTPException(400, "Revisá las fechas: el regreso no puede ser antes de la salida")
    nombre = str(b.get("nombre") or "").strip()[:120]
    if not nombre:
        raise HTTPException(400, "Elegí el empleado")
    dias = (datetime.fromisoformat(hasta) - datetime.fromisoformat(desde)).days + 1
    if dias > 60:
        raise HTTPException(400, "El período es demasiado largo (más de 60 días)")
    directa = vs_aprueba(u)
    hoy_ar = (now() - timedelta(hours=3)).date()
    minimo = hoy_ar + timedelta(days=VS_ANTICIPO)
    fuera = datetime.fromisoformat(desde).date() < minimo
    dia_mal = not vs_inicio_ok(desde, str(b.get("sector") or ""))
    # reglas: 15 días de anticipación y salida un lunes (o martes si el lunes es feriado).
    # Se niega; solo RRHH puede cargarla igual, confirmándolo expresamente.
    if (fuera or dia_mal) and not (directa and b.get("forzar") is True):
        raise HTTPException(400, "Denegado: " + VS_REGLAS)
    d = vs_doc(db, True)
    items = list((d.data or {}).get("items", []))
    legajo = str(b.get("legajo") or "").strip()[:20]
    for x in items:
        if x.get("estado") in ("pendiente", "aprobada") and legajo and x.get("legajo") == legajo and not (x["hasta"] < desde or x["desde"] > hasta):
            raise HTTPException(409, f"{x.get('nombre')} ya tiene una solicitud {x.get('estado')} que se superpone ({x['desde']} al {x['hasta']})")
    it = {"id": secrets.token_hex(6), "legajo": legajo, "nombre": nombre, "sector": str(b.get("sector") or "")[:60],
          "turno": str(b.get("turno") or "")[:40], "desde": desde, "hasta": hasta, "dias": dias, "obs": str(b.get("obs") or "")[:300],
          "estado": "pendiente", "uid": u.id, "by": u.nombre, "at": iso(now())}
    if directa:   # RRHH la carga sin pedir autorización
        it.update(estado="aprobada", rby=u.nombre, rat=it["at"], directa=True)
    if fuera:
        it["fuera_plazo"] = True
    if dia_mal:
        it["fuera_dia"] = True
    items.append(it)
    vs_guardar(db, d, items, u, ("vacaciones_carga" if directa else "vacaciones_solicitud") + ("_fuera_de_regla" if (fuera or dia_mal) else ""),
               f"{nombre} {desde} al {hasta}" + (f" · sin los {VS_ANTICIPO} días de anticipación" if fuera else "") + (" · no empieza un lunes" if dia_mal else ""))
    return {"item": it, "version": d.version}


@app.post("/api/vacsol/visto")
async def vacsol_visto(request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """El coordinador ya vio la respuesta de RRHH (aprobada, rechazada o anulada) de sus pedidos."""
    ids = set((json.loads(await request.body() or b"{}")).get("ids") or [])
    d = vs_doc(db, True)
    items, n = [], 0
    for x in (d.data or {}).get("items", []):
        if x.get("id") in ids and x.get("uid") == u.id and not x.get("visto"):
            x = {**x, "visto": True}
            n += 1
        items.append(x)
    if n:
        d.data = {"items": items}
        db.commit()
    return {"ok": True, "n": n}


@app.post("/api/vacsol/{sid}/{accion}")
async def vacsol_accion(sid: str, accion: str, request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    b = json.loads(await request.body() or b"{}")
    d = vs_doc(db, True)
    items = list((d.data or {}).get("items", []))
    x = next((i for i in items if i.get("id") == sid), None)
    if not x:
        raise HTTPException(404, "La solicitud ya no existe")
    x = dict(x)
    if accion in ("aprobar", "rechazar"):
        if not vs_aprueba(u):
            raise HTTPException(403, "Solo RRHH puede aprobar o rechazar solicitudes")
        if x["estado"] != "pendiente":
            raise HTTPException(409, f"La solicitud ya está {x['estado']}")
        x.update(estado="aprobada" if accion == "aprobar" else "rechazada", rby=u.nombre, rat=iso(now()), motivo=str(b.get("motivo") or "")[:300])
    elif accion == "cancelar":
        if x.get("uid") != u.id and not vs_aprueba(u):
            raise HTTPException(403, "Solo quien la cargó puede cancelarla")
        if x["estado"] != "pendiente":
            raise HTTPException(409, f"La solicitud ya está {x['estado']}: pedile a RRHH que la anule")
        x.update(estado="cancelada", rby=u.nombre, rat=iso(now()))
    elif accion == "anular":
        if not vs_aprueba(u):
            raise HTTPException(403, "Solo RRHH puede anular una solicitud aprobada")
        x.update(estado="anulada", rby=u.nombre, rat=iso(now()), motivo=str(b.get("motivo") or "")[:300])
    else:
        raise HTTPException(404, "Acción desconocida")
    items = [x if i.get("id") == sid else i for i in items]
    vs_guardar(db, d, items, u, "vacaciones_" + accion, f"{x['nombre']} {x['desde']} al {x['hasta']}")
    return {"item": x, "version": d.version}


@app.get("/api/docs/{key}")
def get_doc(key: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if key not in DOC_KEYS or not readable(u, key):
        raise HTTPException(403, "No tenés acceso a este módulo")
    d = db.get(Doc, key)
    return doc_out(d) if d else {"data": {}, "version": 0, "updated_at": None, "updated_by": None}


@app.put("/api/docs/{key}")
async def put_doc(key: str, request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if key not in DOC_KEYS:
        raise HTTPException(404, "Módulo desconocido")
    if not writable(u, key):
        raise HTTPException(403, f"No tenés permiso para modificar {MODULES.get(key, key)}")
    raw = await request.body()
    if len(raw) > MAX_DOC:
        raise HTTPException(413, "Los datos son demasiado grandes")
    body = json.loads(raw or b"{}")
    data, base = body.get("data"), body.get("base")
    if not isinstance(data, dict):
        raise HTTPException(400, "Formato inválido")
    d = db.get(Doc, key)
    if d is None:
        d = Doc(key=key, data={}, version=0)
        db.add(d)
    if base is not None and int(base) != d.version:
        raise HTTPException(409, json.dumps({"msg": f"{d.updated_by or 'Otro usuario'} modificó {MODULES.get(key, key)} mientras trabajabas",
                                              "version": d.version, "updated_by": d.updated_by}))
    d.data = data
    d.version += 1
    d.updated_at = now()
    d.updated_by = u.nombre
    nota = str(body.get("nota") or "")[:280]
    auth.audit(db, u, "guardar", MODULES.get(key, key) + (": " + nota if nota else ""))
    db.commit()
    return {"version": d.version, "updated_at": iso(d.updated_at), "updated_by": d.updated_by}


@app.post("/api/francos/celdas")
async def francos_celdas(request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Asigna o quita francos día por día desde la página. El servidor anota quién y cuándo,
    y aplica el cambio sobre la última versión: dos coordinadores pueden cargar a la vez sin pisarse."""
    if not writable(u, "francos"):
        raise HTTPException(403, "No tenés permiso para asignar francos")
    body = json.loads(await request.body() or b"{}")
    cambios = body.get("cambios") or []
    if not isinstance(cambios, list) or not cambios or len(cambios) > 400:
        raise HTTPException(400, "Formato inválido")
    d = db.scalar(select(Doc).where(Doc.key == "francos").with_for_update())
    if d is None:
        d = Doc(key="francos", data={}, version=0)
        db.add(d)
    prev = d.version
    data = copy.deepcopy(d.data or {})
    F = data.setdefault("francos", {})
    F.setdefault("files", [])
    emps, fa = F.setdefault("emps", {}), F.setdefault("fa", {})
    ahora, quien = iso(now()), u.nombre
    log = F.setdefault("log", [])
    tocados = set()
    for c in cambios:
        key, fecha, valor = str(c.get("key") or "")[:40], str(c.get("fecha") or ""), c.get("valor")
        if not key or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha) or valor not in ("F", ""):
            continue
        e = emps.get(key)
        if e is None:
            src = c.get("emp") or {}
            e = emps[key] = {k: str(src.get(k) or "")[:120] for k in ("legajo", "nombre", "turno", "sector", "ingreso", "egreso")}
            e["d"] = {}
        e.setdefault("d", {})
        if valor == "F":
            e["d"][fecha] = "F"
        elif e["d"].get(fecha) == "F":
            e["d"][fecha] = "1"
        ant = fa.setdefault(key, {}).get(fecha)
        hist = []
        if ant:
            hist = (ant.get("h") or []) + [{k: ant.get(k) for k in ("v", "by", "at")}]
        fa[key][fecha] = {"v": valor, "by": quien, "at": ahora, "h": hist[-9:]}
        log.append({"k": key, "l": e.get("legajo", ""), "n": e.get("nombre", ""), "d": fecha, "v": valor, "by": quien, "at": ahora})
        tocados.add(key)
    if not tocados:
        raise HTTPException(400, "No hubo cambios válidos")
    F["at"] = ahora
    F["log"] = log[-500:]
    d.data = data
    d.version += 1
    d.updated_at = now()
    d.updated_by = quien
    auth.audit(db, u, "francos_dia", f"{len(cambios)} cambio(s) en {len(tocados)} empleado(s)")
    db.commit()
    return {"version": d.version, "prev": prev, "emps": {k: emps[k] for k in tocados}, "fa": {k: fa[k] for k in tocados}, "log": F["log"][-len(cambios):], "at": ahora}


@app.put("/api/me/docs/{key}")
async def put_user_doc(key: str, request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if key not in USER_DOC_KEYS:
        raise HTTPException(404, "Dato desconocido")
    raw = await request.body()
    if len(raw) > 1024 * 1024:
        raise HTTPException(413, "Los datos son demasiado grandes")
    data = json.loads(raw or b"{}").get("data")
    d = db.get(UserDoc, (u.id, key))
    if d is None:
        d = UserDoc(user_id=u.id, key=key)
        db.add(d)
    d.data = data if isinstance(data, dict) else {}
    d.updated_at = now()
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ usuarios (admin)
class UserIn(BaseModel):
    username: str | None = Field(default=None, max_length=60)
    nombre: str | None = Field(default=None, max_length=120)
    rol: str | None = None
    perms: dict | None = None
    activo: bool | None = None


def clean_perms(p: dict | None) -> dict:
    out = {}
    for m, v in (p or {}).items():
        if m in MODULES and v in LEVELS and v:
            out[m] = v
    return out


def admins_activos(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.rol == "admin", User.activo == True))  # noqa: E712


@app.get("/api/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"users": [user_out(x) for x in db.scalars(select(User).order_by(User.nombre))], "modules": MODULES}


@app.post("/api/users")
def create_user(body: UserIn, a: User = Depends(require_admin), db: Session = Depends(get_db)):
    username = (body.username or "").strip().lower()
    if not username or not all(c.isalnum() or c in "._-" for c in username):
        raise HTTPException(400, "El usuario solo puede tener letras, números, punto, guion y guion bajo")
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(400, "Ese usuario ya existe")
    if not (body.nombre or "").strip():
        raise HTTPException(400, "Falta el nombre")
    pw = auth.temp_password(body.nombre)
    u = User(username=username, nombre=body.nombre.strip(), rol="admin" if body.rol == "admin" else "usuario",
             perms=clean_perms(body.perms) if body.perms is not None else dict(DEFAULT_PERMS),
             pass_hash=auth.hash_pw(pw), must_change=True)
    db.add(u)
    auth.audit(db, a, "crear_usuario", username)
    db.commit()
    return {"user": user_out(u), "password": pw}


@app.put("/api/users/{uid}")
def update_user(uid: int, body: UserIn, a: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "No existe el usuario")
    quita_admin = (body.rol is not None and body.rol != "admin" and u.rol == "admin") or (body.activo is False and u.rol == "admin")
    if quita_admin and admins_activos(db) <= 1:
        raise HTTPException(400, "Tiene que quedar al menos un administrador activo")
    if body.nombre is not None and body.nombre.strip():
        u.nombre = body.nombre.strip()
    if body.rol is not None:
        u.rol = "admin" if body.rol == "admin" else "usuario"
    if body.perms is not None:
        u.perms = clean_perms(body.perms)
    if body.activo is not None:
        u.activo = body.activo
        if not body.activo:
            u.token_ver += 1      # cierra sus sesiones
    auth.audit(db, a, "editar_usuario", u.username)
    db.commit()
    return user_out(u)


@app.post("/api/users/{uid}/reset")
def reset_user(uid: int, a: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "No existe el usuario")
    pw = auth.temp_password(u.nombre)
    u.pass_hash = auth.hash_pw(pw)
    u.must_change = True
    u.token_ver += 1
    auth.audit(db, a, "restablecer_clave", u.username)
    db.commit()
    return {"password": pw}


@app.get("/api/audit")
def get_audit(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(Audit).order_by(Audit.id.desc()).limit(500))
    return {"items": [{"at": iso(r.at), "usuario": r.usuario, "accion": r.accion, "detalle": r.detalle} for r in rows]}


# ------------------------------------------------------------------ cartelera
POS_KEYS = {"x", "y", "z", "rot"}
META_KEYS = {"id", "autor", "pin", "at", "upd", "editPor"}


def pz_out(p: PizarraItem) -> dict:
    o = dict(p.data or {})
    o.update({"id": p.id, "autor": {"id": p.autor_id, "nombre": p.autor_nombre} if p.autor_nombre else None,
              "pin": p.pin, "at": iso(p.created_at), "upd": iso(p.updated_at)})
    return o


@app.get("/api/pizarra")
def pz_list(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"items": [pz_out(p) for p in db.scalars(select(PizarraItem))]}


@app.put("/api/pizarra/{pid}")
async def pz_put(pid: str, request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    raw = await request.body()
    if len(raw) > MAX_ITEM:
        raise HTTPException(413, "La nota es demasiado grande (máximo 4 MB con la imagen)")
    body = json.loads(raw or b"{}")
    data = {k: v for k, v in body.items() if k not in META_KEYS}
    if data.get("tipo") not in ("texto", "dibujo", "imagen"):
        raise HTTPException(400, "Tipo de nota inválido")
    p = db.get(PizarraItem, pid[:40])
    admin = u.rol == "admin"
    if p is None:
        p = PizarraItem(id=pid[:40], autor_id=u.id, autor_nombre=u.nombre, data=data, pin=bool(body.get("pin")) and admin)
        db.add(p)
        auth.audit(db, u, "cartelera_nueva", data.get("tipo", ""))
    else:
        autor = p.autor_id == u.id
        old = dict(p.data or {})
        contenido = {k: v for k, v in data.items() if k not in POS_KEYS} != {k: v for k, v in old.items() if k not in POS_KEYS}
        if contenido and not (autor or admin):
            raise HTTPException(403, "Solo el autor o un administrador puede editar esta nota")
        puede_mover = admin or (autor and not p.pin)
        if not puede_mover:
            for k in POS_KEYS:
                if k in old:
                    data[k] = old[k]
                else:
                    data.pop(k, None)
        if "pin" in body and bool(body["pin"]) != p.pin:
            if not admin:
                raise HTTPException(403, "Solo un administrador puede anclar notas")
            p.pin = bool(body["pin"])
        p.data = data
        if contenido:
            p.updated_at = now()
            auth.audit(db, u, "cartelera_editar", p.id)
    db.commit()
    return pz_out(p)


@app.delete("/api/pizarra/{pid}")
def pz_del(pid: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(PizarraItem, pid)
    if not p:
        return {"ok": True}
    if not (u.rol == "admin" or p.autor_id == u.id):
        raise HTTPException(403, "Solo el autor o un administrador puede borrar esta nota")
    db.delete(p)
    auth.audit(db, u, "cartelera_borrar", f"{p.autor_nombre}")
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ buzón
def bz_out(b: BuzonItem) -> dict:
    return {"id": b.id, "asunto": b.asunto, "cat": b.cat, "msg": b.msg, "att": b.att, "estado": b.estado,
            "at": iso(b.created_at), "autor": {"id": b.autor_id, "nombre": b.autor_nombre} if b.autor_nombre else None,
            "resp": b.resp, "respPor": b.resp_por, "respAt": iso(b.resp_at), "respVista": b.resp_vista}


@app.get("/api/buzon")
def bz_list(u: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(BuzonItem) if u.rol == "admin" else select(BuzonItem).where(BuzonItem.autor_id == u.id)
    return {"items": [bz_out(b) for b in db.scalars(q)]}


ESTADOS = {"nueva", "leida", "curso", "respondida", "cerrada"}


@app.put("/api/buzon/{bid}")
async def bz_put(bid: str, request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    raw = await request.body()
    if len(raw) > MAX_ITEM:
        raise HTTPException(413, "El adjunto es demasiado grande")
    body = json.loads(raw or b"{}")
    b = db.get(BuzonItem, bid[:40])
    if b is None:
        asunto, msg = str(body.get("asunto") or "").strip(), str(body.get("msg") or "").strip()
        if not asunto or not msg:
            raise HTTPException(400, "Completá el asunto y el mensaje")
        anon = body.get("autor") is None
        b = BuzonItem(id=bid[:40], asunto=asunto[:200], msg=msg[:4000],
                      cat=body.get("cat") if body.get("cat") in ("mejora", "problema", "consulta", "otro") else "otro",
                      att=body.get("att") if isinstance(body.get("att"), dict) else None, estado="nueva",
                      autor_id=None if anon else u.id, autor_nombre=None if anon else u.nombre)
        db.add(b)
        # una sugerencia anónima no deja rastro de quién la envió, tampoco en el registro de actividad
        auth.audit(db, "anónimo" if anon else u, "buzon_nueva", "")
        db.commit()
        return bz_out(b)
    if u.rol == "admin":
        if body.get("estado") in ESTADOS:
            b.estado = body["estado"]
        r = body.get("resp")
        if b.autor_id and isinstance(r, str) and r.strip() and r.strip() != (b.resp or ""):
            b.resp, b.resp_por, b.resp_at, b.resp_vista = r.strip()[:4000], u.nombre, now(), False
        auth.audit(db, u, "buzon_gestion", b.estado)
    elif b.autor_id == u.id:
        if body.get("respVista"):
            b.resp_vista = True
    else:
        raise HTTPException(403, "No podés modificar esta sugerencia")
    db.commit()
    return bz_out(b)


@app.delete("/api/buzon/{bid}")
def bz_del(bid: str, a: User = Depends(require_admin), db: Session = Depends(get_db)):
    b = db.get(BuzonItem, bid)
    if b:
        db.delete(b)
        auth.audit(db, a, "buzon_borrar", "")
        db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ solicitud de acceso (sin sesión)
class AccesoIn(BaseModel):
    nombre: str = Field(max_length=120)
    sector: str = Field(default="", max_length=120)
    contacto: str = Field(default="", max_length=160)
    msg: str = Field(default="", max_length=1500)
    web: str = Field(default="", max_length=200)      # campo trampa para robots: tiene que llegar vacío


_acc: dict[str, list[float]] = {}


@app.post("/api/acceso")
def pedir_acceso(body: AccesoIn, request: Request, db: Session = Depends(get_db)):
    import time
    ip = request.client.host if request.client else ""
    t = time.time()
    _acc[ip] = [x for x in _acc.get(ip, []) if t - x < 3600]
    total_hoy = sum(1 for v in _acc.values() for x in v if t - x < 86400)
    if len(_acc[ip]) >= 5 or total_hoy >= 60:
        raise HTTPException(429, "Ya se enviaron varias solicitudes. Probá más tarde o avisale al administrador por otro medio.")
    if body.web:
        return {"ok": True}
    nombre = body.nombre.strip()
    if len(nombre) < 3:
        raise HTTPException(400, "Escribí tu nombre y apellido")
    _acc[ip].append(t)
    msg = "\n".join(x for x in [
        f"Nombre: {nombre}",
        f"Sector / puesto: {body.sector.strip()}" if body.sector.strip() else "",
        f"Contacto: {body.contacto.strip()}" if body.contacto.strip() else "",
        "", body.msg.strip() or "No puedo ingresar al panel."] if x is not None)
    import secrets as _s
    db.add(BuzonItem(id="acc-" + _s.token_hex(8), asunto=f"Solicitud de acceso: {nombre}"[:200], cat="acceso", msg=msg[:4000],
                     estado="nueva", autor_id=None, autor_nombre=None))
    auth.audit(db, "sin sesión", "solicitud_acceso", nombre)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ salud y panel
@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("select 1"))
    return {"ok": True, "panel": DIST.exists()}


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    detail = exc.detail
    try:
        detail = json.loads(detail) if isinstance(detail, str) and detail.startswith("{") else detail
    except Exception:
        pass
    return JSONResponse({"detail": detail}, status_code=exc.status_code)


@app.get("/", include_in_schema=False)
def index():
    if not DIST.exists():
        return HTMLResponse("<h1>Falta compilar el panel</h1><p>Ejecutá <code>python frontend/build.py</code>.</p>", status_code=503)
    return FileResponse(DIST, media_type="text/html", headers={"Cache-Control": "no-cache"})
