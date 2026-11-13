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
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, inspect, text
from sqlalchemy.orm import Session

from . import auth, seed
from .auth import current_user, require_admin, can_read, can_write, MODULES, LEVELS, DEFAULT_PERMS
from .db import Base, engine, get_db, SessionLocal
from .models import User, Doc, UserDoc, PizarraItem, BuzonItem, Audit, now

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist" / "index.html"
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
        # recuperación del administrador: si ADMIN_RESET_PASSWORD está definida, la clave del admin
        # pasa a ser esa (temporal, hay que cambiarla al entrar). Borrar la variable después de usarla.
        reset = os.environ.get("ADMIN_RESET_PASSWORD")
        if reset:
            username = (os.environ.get("ADMIN_USERNAME") or "admin").strip().lower()
            u = db.scalar(select(User).where(User.username == username))
            if u:
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
    return key == "otros" or can_read(u, key)


def writable(u: User, key: str) -> bool:
    return (u.rol == "admin") if key == "otros" else can_write(u, key)


@app.get("/api/bootstrap")
def bootstrap(u: User = Depends(current_user), db: Session = Depends(get_db)):
    docs = {d.key: doc_out(d) for d in db.scalars(select(Doc)) if d.key in DOC_KEYS and readable(u, d.key)}
    mine = {d.key: d.data for d in db.scalars(select(UserDoc).where(UserDoc.user_id == u.id))}
    return {"user": user_out(u), "modules": MODULES, "docs": docs, "user_docs": mine,
            "server_time": iso(now())}


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
    return {"docs": docs, "pizarra": {"last": iso(pz), "n": pz_n}, "buzon": bz, "user": user_out(u)}


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
    auth.audit(db, u, "guardar", MODULES.get(key, key))
    db.commit()
    return {"version": d.version, "updated_at": iso(d.updated_at), "updated_by": d.updated_by}


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
    pw = auth.temp_password()
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
    pw = auth.temp_password()
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
