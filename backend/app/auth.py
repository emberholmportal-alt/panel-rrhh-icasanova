"""Usuarios, contraseñas, sesiones y permisos."""
import os
import time
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .db import get_db
from .models import User, Audit

JWT_SECRET = os.environ.get("JWT_SECRET") or "solo-para-pruebas-locales-cambiar-en-render"
COOKIE = "rrhh_sid"
SESSION_HOURS = int(os.environ.get("SESSION_HOURS", "12"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1" if os.environ.get("RENDER") else "0") == "1"

# Módulos del panel con permiso propio. "agenda" la editan todos salvo que se indique otra cosa.
MODULES = {
    "ausentismo": "Ausentismo",
    "vacaciones": "Vacaciones",
    "eventuales": "Eventuales",
    "francos": "Francos",
    "indumentaria": "Indumentaria",
    "f3": "Novedades F3",
    "anticipos": "Anticipos",
    "nomina": "Nómina",
    "cumpleanos": "Cumpleaños",
    "menu": "Menú semanal",
    "vacsol": "Solicitudes de vacaciones",
    "agenda": "Agenda y recordatorios",
    "hextras": "Horas extras",
}
# módulos que todos ven aunque no tengan permiso asignado
DEFAULT_LEVEL = {"menu": "ver"}
LEVELS = ("", "consulta", "ver", "editar")   # consulta = ve en pantalla, sin descargar ni modificar
DEFAULT_PERMS = {"agenda": "editar"}


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def check_pw(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), h.encode())
    except Exception:
        return False


def temp_password(nombre: str = "") -> str:
    """Clave temporal fácil de dictar: apellido en minúsculas + año (ej. chaparro26).
    Es de un solo uso: al ingresar, el panel obliga a elegir una propia."""
    import unicodedata
    from datetime import datetime, timedelta, timezone
    ap = (nombre or "").split(",")[0]          # apellido completo (antes de la coma), sin espacios
    ap = "".join(c for c in unicodedata.normalize("NFD", ap.lower()) if c.isalpha() and c.isascii())
    if len(ap) < 3:
        ap = "gestion"
    return f"{ap}{datetime.now(timezone(timedelta(hours=-3))).year % 100:02d}"


def pw_ok(pw: str) -> str | None:
    if len(pw) < 8:
        return "La contraseña tiene que tener al menos 8 caracteres."
    if pw.isdigit() or pw.isalpha():
        return "Usá letras y números en la contraseña."
    return None


def make_token(u: User, imp: User | None = None) -> str:
    horas = 2 if imp else SESSION_HOURS
    exp = datetime.now(timezone.utc) + timedelta(hours=horas)
    p = {"sub": str(u.id), "tv": u.token_ver, "exp": exp}
    if imp:   # "ver como": el admin mira el panel con la cuenta de otro, en solo lectura
        p["imp"] = imp.id
        p["itv"] = imp.token_ver
    return jwt.encode(p, JWT_SECRET, algorithm="HS256")


def set_session(resp: Response, u: User, imp: User | None = None):
    resp.set_cookie(COOKIE, make_token(u, imp), httponly=True, secure=COOKIE_SECURE, samesite="lax",
                    max_age=(2 if imp else SESSION_HOURS) * 3600, path="/")


# con "ver como" solo se puede leer; estas son las únicas acciones permitidas
IMP_PERMITIDO = {"/api/ver-como/salir", "/api/auth/logout", "/api/auth/verify"}


def clear_session(resp: Response):
    resp.delete_cookie(COOKIE, path="/")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    tok = request.cookies.get(COOKIE)
    if not tok:
        raise HTTPException(401, "Iniciá sesión")
    try:
        p = jwt.decode(tok, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "La sesión venció: iniciá sesión de nuevo")
    u = db.get(User, int(p["sub"]))
    if not u or not u.activo or u.token_ver != p.get("tv"):
        raise HTTPException(401, "La sesión ya no es válida: iniciá sesión de nuevo")
    request.state.imp = None
    if p.get("imp"):
        a = db.get(User, int(p["imp"]))
        if not a or not a.activo or a.rol != "admin" or a.token_ver != p.get("itv"):
            raise HTTPException(401, "La sesión ya no es válida: iniciá sesión de nuevo")
        request.state.imp = a
        if request.method not in ("GET", "HEAD") and request.url.path not in IMP_PERMITIDO:
            raise HTTPException(403, f"Estás viendo el panel como {u.nombre}: es solo lectura, no se guarda ningún cambio.")
    return u


def require_admin(u: User = Depends(current_user)) -> User:
    if u.rol != "admin":
        raise HTTPException(403, "Solo un administrador puede hacer esto")
    return u


# El menú semanal lo edita solo el comedor (Milagros Marchioro) y el administrador.
MENU_EDITORES = {"mmarchioro"}

# En Ausentismo estos usuarios ven solo "Llegadas tarde" y "Reincidencias" (no pedidos, sin fichada, turnos ni plantilla).
AUS_PARCIAL = {"cbertetti", "joliva", "rcampos", "lmunoz"}


def level(u: User, modulo: str) -> str:
    if u.rol == "admin":
        return "editar"
    lv = (u.perms or {}).get(modulo, "") or DEFAULT_LEVEL.get(modulo, "")
    if modulo == "menu" and lv == "editar" and u.username not in MENU_EDITORES:
        return "ver"
    return lv


def can_read(u: User, modulo: str) -> bool:
    return level(u, modulo) in ("consulta", "ver", "editar")


def can_write(u: User, modulo: str) -> bool:
    return level(u, modulo) == "editar"


def audit(db: Session, u: User | str, accion: str, detalle: str = ""):
    db.add(Audit(usuario=u if isinstance(u, str) else f"{u.nombre} ({u.username})", accion=accion, detalle=detalle[:300]))


# Freno simple a los intentos de clave: 8 intentos fallidos por usuario+IP cada 15 minutos.
_fails: dict[str, list[float]] = {}


def login_blocked(key: str) -> bool:
    t = time.time()
    _fails[key] = [x for x in _fails.get(key, []) if t - x < 900]
    return len(_fails[key]) >= 8


def login_failed(key: str):
    _fails.setdefault(key, []).append(time.time())


def login_ok(key: str):
    _fails.pop(key, None)
