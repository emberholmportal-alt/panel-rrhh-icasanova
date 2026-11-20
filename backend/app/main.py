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

from . import auth, seed, chat
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
app.include_router(chat.router)
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
                    nuevos = dict(uu.perms or {})
                    for m, v in perms.items():
                        if isinstance(v, str) and v.startswith("min:"):
                            # "min:ver": sube a ese nivel solo si hoy tiene menos (no baja a nadie)
                            v = v[4:]
                            if auth.LEVELS.index(nuevos.get(m, "") or "") >= auth.LEVELS.index(v):
                                continue
                        nuevos[m] = v
                    uu.perms = nuevos
                    auth.audit(db, "sistema", "permisos", f"{username}: {perms}")
            nuevas.append(clave)
        if "2026-11-18-chat-todos" not in hechas:
            # chat interno: lo pueden usar todos los usuarios que existen hoy (los nuevos, cuando se les asigne)
            for uu in db.scalars(select(User)).all():
                if uu.rol != "admin" and not (uu.perms or {}).get("chat"):
                    uu.perms = {**(uu.perms or {}), "chat": "editar"}
            nuevas.append("2026-11-18-chat-todos")
        if "2026-11-17-nombre-admin" not in hechas:
            # nombre completo del administrador (aparece en los avisos de cambio de permisos)
            ua = db.scalar(select(User).where(User.username == "ariel"))
            if ua and (ua.nombre or "").strip().lower() == "ariel":
                ua.nombre = "Flores, Ariel"
            nuevas.append("2026-11-17-nombre-admin")
        try:
            francos_completar_fichadas(db)
        except Exception as e:   # nunca frena el arranque
            print("francos historial:", e)
        clave_af, legs_af = seed.APTO_FRIO
        if clave_af not in hechas:
            ed = db.get(Doc, "eventuales")
            if ed is None:
                ed = Doc(key="eventuales", data={}, version=0)
                db.add(ed)
            data = dict(ed.data or {})
            af = dict(data.get("aptoFrio") or {})
            for leg, nom in legs_af.items():
                af.setdefault(leg, {"n": nom, "at": iso(now()), "por": "sistema"})
            data["aptoFrio"] = af
            ed.data = data
            ed.version = (ed.version or 0) + 1
            ed.updated_at = now()
            ed.updated_by = "sistema"
            auth.audit(db, "sistema", "apto_frio", f"{len(legs_af)} eventuales con apto frío")
            nuevas.append(clave_af)
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


_MOV_MK = re.compile(r"(?:^|\s)[ECSecs]\s+\+?\d{1,2}:\d{2}")


def _mov_clase(txt: str) -> str:
    s = str(txt or "")
    if _MOV_MK.search(s):
        return "T"
    if re.search(r"enfermedad", s, re.I):
        return "ENF"
    if re.search(r"\bART\b", s):
        return "ART"
    if re.search(r"vacaci", s, re.I):
        return "VAC"
    if re.search(r"ausencia", s, re.I):
        return "AUS"
    if re.search(r"licencia", s, re.I):
        return "LIC"
    return "OTRO" if s.strip() else ""


def francos_completar_fichadas(db: Session, quien: str = "sistema") -> int:
    """Las fichadas que ven los coordinadores en Francos se completan con el historial de Llegadas tarde
    (solo los días que falten, últimos 100 días). Lo hace el servidor: no depende de que alguien abra el panel."""
    fd = db.scalar(select(Doc).where(Doc.key == "francos").with_for_update())
    ad = db.get(Doc, "ausentismo")
    if not fd or not ad:
        return 0
    data = copy.deepcopy(fd.data or {})
    mov = (data.get("francos") or {}).get("mov")
    recs = (ad.data or {}).get("records") or {}
    if not isinstance(mov, dict) or not recs:
        return 0
    desde = (datetime.now(timezone(timedelta(hours=-3))).date() - timedelta(days=100)).isoformat()
    d1 = mov.get("d1") or ""
    emps = mov.setdefault("emps", {})
    n, d0 = 0, mov.get("d0") or d1
    for r in recs.values():
        f = str((r or {}).get("fecha") or "")
        if not f or f < desde or (d1 and f > d1):
            continue
        leg = re.sub(r"\.0+$", "", str(r.get("legajo") or "").strip())
        if not leg:
            continue
        x = emps.setdefault(leg, {"n": r.get("nombre") or "", "c": r.get("empresa") or "", "d": {}, "o": {}})
        x.setdefault("d", {})
        x.setdefault("o", {})
        if f in x["d"]:
            continue
        ev = " ".join(e for e in (r.get("eventos") or []) if isinstance(e, str))
        k = "T" if (r.get("marcas") or []) else _mov_clase(ev)
        x["d"][f] = k
        if k and k != "T":
            x["o"][f] = ev.strip()[:60]
        n += 1
        if not d0 or f < d0:
            d0 = f
    if not n:
        return 0
    mov["d0"] = d0
    fd.data = data
    fd.version = (fd.version or 0) + 1
    fd.updated_at = now()
    fd.updated_by = quien
    auth.audit(db, quien, "guardar", f"Francos: fichadas completadas con el historial ({n} día(s) desde {d0})")
    db.commit()
    return n


def sin_bajas(u: User) -> bool:
    """Coordinadores: ven Eventuales y Nómina, pero no las fechas de baja (último día / egreso)."""
    return u.rol != "admin" and u.username in seed.COORDINADORES


def doc_para(u: User, d: Doc) -> dict:
    """El documento como lo recibe ese usuario: a los coordinadores se les quitan las fechas de baja de eventuales."""
    o = doc_out(d)
    if d.key == "eventuales" and sin_bajas(u) and not can_write(u, "eventuales"):
        data = copy.deepcopy(o["data"])
        quitar = ("ultimo", "egreso")
        ant = data.get("ant") or {}
        for r in ant.get("rows") or []:
            for k in quitar:
                r.pop(k, None)
        for r in (data.get("antAdd") or {}).values():
            for k in quitar:
                if isinstance(r, dict):
                    r.pop(k, None)
        for o2 in (data.get("antOv") or {}).values():
            if isinstance(o2, dict):
                for sub in ("est", "ed"):
                    if isinstance(o2.get(sub), dict):
                        for k in quitar:
                            o2[sub].pop(k, None)
        data.pop("antLog", None)
        o = {**o, "data": data}
    return o


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "nombre": u.nombre, "rol": u.rol,
            "perms": {m: auth.level(u, m) for m in MODULES}, "must_change": u.must_change, "activo": u.activo,
            "aus_parcial": u.rol != "admin" and u.username in auth.AUS_PARCIAL,
            "perms_por": (u.perms or {}).get("_por"),
            "descargas": u.rol == "admin" or not (u.perms or {}).get("_nodl"),
            "nobajas": sin_bajas(u),
            "sinagenda": auth.sin_agenda(u),
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
def verify_password(body: VerifyIn, request: Request, u: User = Depends(current_user)):
    """Desbloqueo de la pantalla en reposo: confirma la contraseña del usuario que ya tiene la sesión abierta.
    En "ver como" la persona frente a la pantalla es el administrador: se pide SU contraseña."""
    u = getattr(request.state, "imp", None) or u
    key = f"lock|{u.username}"
    if auth.login_blocked(key):
        raise HTTPException(429, "Demasiados intentos. Esperá 15 minutos o cerrá sesión y volvé a entrar.")
    if not auth.check_pw(body.password, u.pass_hash):
        auth.login_failed(key)
        return {"ok": False}
    auth.login_ok(key)
    return {"ok": True}


@app.post("/api/users/{uid}/ver-como")
def ver_como(uid: int, response: Response, a: User = Depends(auth.require_admin), db: Session = Depends(get_db)):
    """El administrador entra al panel como otro usuario, en solo lectura, para ver lo mismo que ve esa persona."""
    t = db.get(User, uid)
    if not t or not t.activo:
        raise HTTPException(404, "Ese usuario no existe o está desactivado")
    if t.id == a.id:
        raise HTTPException(400, "Ya estás con tu usuario")
    auth.audit(db, a, "ver_como", t.username)
    db.commit()
    auth.set_session(response, t, imp=a)
    return {"ok": True, "nombre": t.nombre}


@app.post("/api/ver-como/salir")
def ver_como_salir(request: Request, response: Response, u: User = Depends(current_user)):
    a = getattr(request.state, "imp", None)
    if not a:
        return {"ok": True}
    auth.set_session(response, a)
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
    if key in ("ausentismo", "nomina") and can_read(u, "hextras"):
        return True        # Horas extras se calcula con las fichadas y la nómina
    return key == "otros" or can_read(u, key)


def writable(u: User, key: str) -> bool:
    return (u.rol == "admin") if key == "otros" else can_write(u, key)


def imp_out(request: Request) -> dict | None:
    a = getattr(request.state, "imp", None)
    return {"id": a.id, "nombre": a.nombre, "username": a.username} if a else None


@app.get("/api/bootstrap")
def bootstrap(request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    docs = {d.key: doc_para(u, d) for d in db.scalars(select(Doc)) if d.key in DOC_KEYS and readable(u, d.key)}
    mine = {d.key: d.data for d in db.scalars(select(UserDoc).where(UserDoc.user_id == u.id))}
    return {"user": user_out(u), "modules": MODULES, "docs": docs, "user_docs": mine,
            "server_time": iso(now()), "build": BUILD, "imp": imp_out(request)}


@app.get("/api/sync")
def sync(request: Request, st: str | None = None, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Versiones actuales, para que cada navegador sepa si otro usuario cambió algo."""
    chat.presencia(request, u, st)          # quién está usando el panel ahora (lista del chat)
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


@app.get("/api/vacaciones/semanas")
def vacaciones_semanas(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Resumen sin nombres para la cocina (Comidas): por semana, cuántos están de vacaciones y cuántos salen,
    por comedor (NIC 2 = eventuales, fuera de convenio, FYV y NIC 3; NIC 1 = el resto)."""
    if not (can_read(u, "viandas") or can_read(u, "vacaciones")):
        raise HTTPException(403, "Sin permiso")
    vd = db.get(Doc, "vacaciones")
    rows = list(((vd.data or {}).get("vac") or {}).get("rows") or []) if vd else []
    ya = {(str(r.get("legajo")), r.get("desde")) for r in rows}
    sd = db.get(Doc, "vacsol")
    for x in ((sd.data or {}).get("items") or []) if sd else []:
        if x.get("estado") == "aprobada" and (str(x.get("legajo")), x.get("desde")) not in ya:
            rows.append({"legajo": x.get("legajo"), "desde": x.get("desde"), "hasta": x.get("hasta")})
    nd = db.get(Doc, "nomina")
    emps = (((nd.data or {}).get("nomina") or {}).get("emps") or {}) if nd else {}

    def nic(leg):
        e = emps.get(str(leg).strip()) or {}
        tipo = e.get("tipoF") or e.get("tipo") or ""
        sec = str(e.get("sector") or "").upper()
        return "NIC 2" if tipo in ("EV", "FC") or "FYV" in sec or re.search(r"NIC\s*3", sec) else "NIC 1"

    hoy = datetime.now(timezone(timedelta(hours=-3))).date()
    lunes = hoy - timedelta(days=hoy.weekday())
    semanas = []
    for k in range(0, 5):
        a = lunes + timedelta(days=7 * k)
        b = a + timedelta(days=6)
        A, B = a.isoformat(), b.isoformat()
        en, salen, vuelven = {}, {}, {}
        for r in rows:
            d0 = str(r.get("desde") or "")
            d1 = str(r.get("hasta") or d0)
            if not d0:
                continue
            leg = str(r.get("legajo") or "").strip()
            if d0 <= B and d1 >= A:
                en[leg] = nic(leg)
            if A <= d0 <= B:
                salen[leg] = nic(leg)
            vuelta = (datetime.fromisoformat(d1) + timedelta(days=1)).date().isoformat() if len(d1) == 10 else ""
            if A <= vuelta <= B:
                vuelven[leg] = nic(leg)

        def cnt(m):
            return {"total": len(m), "NIC 1": sum(1 for v in m.values() if v == "NIC 1"), "NIC 2": sum(1 for v in m.values() if v == "NIC 2")}
        semanas.append({"desde": A, "hasta": B, "de_vacaciones": cnt(en), "salen": cnt(salen), "vuelven": cnt(vuelven)})
    hoy_s = hoy.isoformat()
    hoy_m = {}
    for r in rows:
        d0 = str(r.get("desde") or "")
        if d0 and d0 <= hoy_s <= str(r.get("hasta") or d0):
            leg = str(r.get("legajo") or "").strip()
            hoy_m[leg] = nic(leg)
    return {"hoy": {"total": len(hoy_m), "NIC 1": sum(1 for v in hoy_m.values() if v == "NIC 1"), "NIC 2": sum(1 for v in hoy_m.values() if v == "NIC 2")},
            "semanas": semanas, "actualizado": iso(vd.updated_at) if vd and vd.updated_at else None}


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
    return doc_para(u, d) if d else {"data": {}, "version": 0, "updated_at": None, "updated_by": None}


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
    if key == "viandas":
        # lo que contó la cocina se carga aparte (/api/comidas/cocina): el recálculo de Comidas no lo pisa
        cur = ((d.data or {}).get("viandas") or {}).get("cocina")
        if cur is not None and isinstance(data.get("viandas"), dict):
            data = {**data, "viandas": {**data["viandas"], "cocina": cur}}
    d.data = data
    d.version += 1
    d.updated_at = now()
    d.updated_by = u.nombre
    nota = str(body.get("nota") or "")[:280]
    auth.audit(db, u, "guardar", MODULES.get(key, key) + (": " + nota if nota else ""))
    db.commit()
    out = {"version": d.version, "updated_at": iso(d.updated_at), "updated_by": d.updated_by}
    if key in ("ausentismo", "francos"):
        # cada vez que se guardan fichadas, Francos queda con los días anteriores completos para los coordinadores
        try:
            if francos_completar_fichadas(db, u.nombre) and key == "francos":
                out["version"] = db.get(Doc, "francos").version
        except Exception as e:
            print("francos historial:", e)
    return out


@app.post("/api/comidas/cocina")
async def comidas_cocina(request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Lo que contó la cocina en un día, por comedor y servicio. Lo carga quien ve Comidas (ej. Milagros)."""
    if not can_read(u, "viandas"):
        raise HTTPException(403, "No tenés acceso a Comidas")
    body = json.loads(await request.body() or b"{}")
    fecha, clave, valor = str(body.get("fecha") or ""), str(body.get("clave") or ""), body.get("valor")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha) or clave not in ("NIC 1|alm", "NIC 1|cen", "NIC 2|alm", "NIC 2|cen"):
        raise HTTPException(400, "Formato inválido")
    d = db.scalar(select(Doc).where(Doc.key == "viandas").with_for_update())
    if d is None:
        d = Doc(key="viandas", data={"viandas": {}}, version=0)
        db.add(d)
    data = copy.deepcopy(d.data or {})
    v = data.setdefault("viandas", {}) or {}
    data["viandas"] = v
    coc = v.setdefault("cocina", {})
    dia = coc.setdefault(fecha, {})
    if valor in (None, ""):
        dia.pop(clave, None)
    else:
        try:
            dia[clave] = max(0, min(5000, int(round(float(valor)))))
        except (TypeError, ValueError):
            raise HTTPException(400, "Número inválido")
    if not dia:
        coc.pop(fecha, None)
    d.data = data
    d.version = (d.version or 0) + 1
    d.updated_at = now()
    d.updated_by = u.nombre
    auth.audit(db, u, "guardar", f"Comidas: cocina {fecha} {clave} = {valor}")
    db.commit()
    return {"cocina": coc, "version": d.version}


@app.post("/api/francos/fichadas")
async def francos_fichadas(request: Request, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Completa las fichadas que usa Francos (las que ven los coordinadores) con días del historial.
    Se aplica sobre la última versión del documento: no choca con los francos que cargan los coordinadores."""
    if not writable(u, "francos"):
        raise HTTPException(403, "No tenés permiso para editar Francos")
    body = json.loads(await request.body() or b"{}")
    add = body.get("emps") or {}
    if not isinstance(add, dict) or len(add) > 3000:
        raise HTTPException(400, "Formato inválido")
    d = db.scalar(select(Doc).where(Doc.key == "francos").with_for_update())
    if d is None:
        raise HTTPException(404, "Todavía no hay datos de Francos")
    data = copy.deepcopy(d.data or {})
    F = data.setdefault("francos", {})
    mov = F.get("mov")
    if not isinstance(mov, dict):
        raise HTTPException(409, "Primero hay que subir un export de Movimientos")
    emps = mov.setdefault("emps", {})
    n, d0 = 0, mov.get("d0") or ""
    for leg, v in add.items():
        if not isinstance(v, dict):
            continue
        leg = str(leg)[:20]
        x = emps.setdefault(leg, {"n": str(v.get("n") or "")[:120], "c": str(v.get("c") or "")[:60], "d": {}, "o": {}})
        x.setdefault("d", {})
        x.setdefault("o", {})
        for f, k in (v.get("d") or {}).items():
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(f)) or f in x["d"]:
                continue   # solo completa días que faltan: nunca pisa lo que vino en un export
            x["d"][f] = str(k or "")[:6]
            o = (v.get("o") or {}).get(f)
            if o:
                x["o"][f] = str(o)[:60]
            n += 1
            if not d0 or f < d0:
                d0 = f
    mov["d0"] = d0
    d.data = data
    d.version = (d.version or 0) + 1
    d.updated_at = now()
    d.updated_by = u.nombre
    auth.audit(db, u, "guardar", f"Francos: fichadas completadas con el historial ({n} día(s) desde {d0})")
    db.commit()
    return {"agregados": n, "d0": d0, "d1": mov.get("d1"), "version": d.version}


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
    descargas: bool | None = None     # False = no puede descargar ni imprimir informes en ninguna sección


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
    antes = (u.rol, {m: auth.level(u, m) for m in MODULES}, bool((u.perms or {}).get("_nodl")))
    nodl = bool((u.perms or {}).get("_nodl"))
    if body.perms is not None:
        u.perms = clean_perms(body.perms)
        if nodl:
            u.perms = {**u.perms, "_nodl": True}
    if body.descargas is not None:
        p = {k: v for k, v in (u.perms or {}).items() if k != "_nodl"}
        u.perms = p if body.descargas else {**p, "_nodl": True}
    if body.activo is not None:
        u.activo = body.activo
        if not body.activo:
            u.token_ver += 1      # cierra sus sesiones
    if (u.rol, {m: auth.level(u, m) for m in MODULES}, bool((u.perms or {}).get("_nodl"))) != antes:
        # queda registrado quién y cuándo, para avisarle al usuario si tiene el panel abierto
        u.perms = {**(u.perms or {}), "_por": {"n": a.nombre, "at": iso(now())}}
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
