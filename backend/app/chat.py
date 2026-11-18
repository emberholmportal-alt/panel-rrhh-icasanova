"""Chat interno: conversaciones directas y grupos, presencia, zumbidos e historial para el admin.
Los mensajes no se borran (historial permanente). Solo usuarios con permiso "chat"."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session

from . import auth
from .auth import current_user, require_admin
from .db import get_db
from .models import User, ChatConv, ChatMsg, now

router = APIRouter()
PRES: dict[int, dict] = {}          # presencia en memoria: {uid: {"t": datetime, "st": "activo"|"ausente"}}
ZUMBIDO_SEG = 60                    # un zumbido por minuto por persona y conversación


def iso(d):
    if not d:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()


def presencia(request: Request, u: User, st: str | None):
    if getattr(request.state, "imp", None):      # "ver como" no marca al otro como conectado
        return
    PRES[u.id] = {"t": now(), "st": "ausente" if st == "ausente" else "activo"}


def estado_de(uid: int) -> tuple[str, str | None]:
    p = PRES.get(uid)
    if not p:
        return "desconectado", None
    seg = (now() - p["t"]).total_seconds()
    if seg > 75:
        return "desconectado", iso(p["t"])
    return p["st"], iso(p["t"])


def puede(u: User) -> bool:
    return u.rol == "admin" or bool(auth.level(u, "chat"))


def chat_user(u: User = Depends(current_user)) -> User:
    if not puede(u):
        raise HTTPException(403, "No tenés habilitado el chat")
    return u


def conv_directa(db: Session, a: int, b: int) -> ChatConv:
    x, y = sorted([a, b])
    cid = f"d:{x}-{y}"
    c = db.get(ChatConv, cid)
    if not c:
        c = ChatConv(id=cid, tipo="directa", nombre="", miembros=[x, y], leido={}, creado_por=a)
        db.add(c)
        db.flush()
    return c


def miembro(c: ChatConv, u: User) -> bool:
    return u.id in (c.miembros or [])


def msg_out(m: ChatMsg) -> dict:
    return {"id": m.id, "conv": m.conv, "de": m.de, "de_nombre": m.de_nombre, "tipo": m.tipo, "texto": m.texto, "at": iso(m.at)}


def conv_out(c: ChatConv, u: User, db: Session, nombres: dict) -> dict:
    leido = int((c.leido or {}).get(str(u.id), 0))
    sin = db.scalar(select(func.count()).select_from(ChatMsg).where(ChatMsg.conv == c.id, ChatMsg.id > leido, ChatMsg.de != u.id)) or 0
    ult = db.scalar(select(ChatMsg).where(ChatMsg.conv == c.id).order_by(ChatMsg.id.desc()).limit(1))
    otros = [m for m in (c.miembros or []) if m != u.id]
    return {"id": c.id, "tipo": c.tipo, "nombre": c.nombre if c.tipo == "grupo" else nombres.get(otros[0], "") if otros else "",
            "otro": otros[0] if c.tipo == "directa" and otros else None, "miembros": c.miembros, "creado_por": c.creado_por,
            "no_leidos": sin, "ultimo": msg_out(ult) if ult else None,
            "leido_otros": {k: v for k, v in (c.leido or {}).items() if k != str(u.id)}}


@router.get("/api/chat/estado")
def estado(request: Request, desde: int = 0, st: str | None = None, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    """Todo lo que el chat necesita en una sola consulta: usuarios con su estado, mis conversaciones y mensajes nuevos."""
    presencia(request, u, st)
    us = db.scalars(select(User).where(User.activo == True)).all()  # noqa: E712
    nombres = {x.id: x.nombre for x in us}
    usuarios = []
    for x in us:
        if x.id == u.id or not puede(x):
            continue
        e, visto = estado_de(x.id)
        usuarios.append({"id": x.id, "nombre": x.nombre, "username": x.username, "estado": e, "visto": visto})
    convs = [c for c in db.scalars(select(ChatConv)).all() if miembro(c, u)]
    ids = [c.id for c in convs]
    nuevos = []
    if ids and desde >= 0:
        q = select(ChatMsg).where(ChatMsg.conv.in_(ids), ChatMsg.id > desde).order_by(ChatMsg.id)
        if desde == 0:                    # primera carga: solo el último id (los mensajes se piden por conversación)
            q = q.order_by(None).order_by(ChatMsg.id.desc()).limit(1)
        nuevos = [msg_out(m) for m in db.scalars(q)]
    ult = db.scalar(select(func.max(ChatMsg.id))) or 0
    return {"yo": u.id, "usuarios": usuarios, "convs": [conv_out(c, u, db, nombres) for c in convs],
            "msgs": nuevos if desde else [], "ultimo": ult, "zumbido_seg": ZUMBIDO_SEG}


@router.get("/api/chat/conv/{cid}")
def mensajes(cid: str, antes: int = 0, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    c = db.get(ChatConv, cid)
    if not c or (not miembro(c, u) and u.rol != "admin"):
        raise HTTPException(404, "Conversación inexistente")
    q = select(ChatMsg).where(ChatMsg.conv == cid)
    if antes:
        q = q.where(ChatMsg.id < antes)
    L = list(db.scalars(q.order_by(ChatMsg.id.desc()).limit(80)))
    return {"msgs": [msg_out(m) for m in reversed(L)], "mas": len(L) == 80}


class EnviarIn(BaseModel):
    conv: str | None = None
    para: int | None = None
    texto: str = Field(default="", max_length=4000)


def destino(b: EnviarIn, u: User, db: Session) -> ChatConv:
    if b.conv:
        c = db.get(ChatConv, b.conv)
        if not c or not miembro(c, u):
            raise HTTPException(404, "Conversación inexistente")
        return c
    if b.para:
        o = db.get(User, b.para)
        if not o or not o.activo or not puede(o) or o.id == u.id:
            raise HTTPException(404, "Ese usuario no está disponible en el chat")
        return conv_directa(db, u.id, o.id)
    raise HTTPException(400, "Falta el destinatario")


def publicar(db: Session, c: ChatConv, u: User, tipo: str, texto: str) -> ChatMsg:
    m = ChatMsg(conv=c.id, de=u.id, de_nombre=u.nombre, tipo=tipo, texto=texto)
    db.add(m)
    db.flush()
    c.last_id = m.id
    c.last_at = m.at
    c.leido = {**(c.leido or {}), str(u.id): m.id}
    return m


@router.post("/api/chat/enviar")
def enviar(b: EnviarIn, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    t = (b.texto or "").strip()
    if not t:
        raise HTTPException(400, "El mensaje está vacío")
    c = destino(b, u, db)
    m = publicar(db, c, u, "msg", t)
    db.commit()
    return {"ok": True, "msg": msg_out(m), "conv": c.id}


@router.post("/api/chat/zumbido")
def zumbido(b: EnviarIn, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    c = destino(b, u, db)
    ult = db.scalar(select(ChatMsg).where(ChatMsg.conv == c.id, ChatMsg.de == u.id, ChatMsg.tipo == "zumbido")
                    .order_by(ChatMsg.id.desc()).limit(1))
    if ult and (now() - (ult.at if ult.at.tzinfo else ult.at.replace(tzinfo=timezone.utc))).total_seconds() < ZUMBIDO_SEG:
        falta = ZUMBIDO_SEG - int((now() - (ult.at if ult.at.tzinfo else ult.at.replace(tzinfo=timezone.utc))).total_seconds())
        raise HTTPException(429, f"Ya mandaste un zumbido: esperá {falta} segundos para mandar otro.")
    m = publicar(db, c, u, "zumbido", "📳 Zumbido")
    db.commit()
    return {"ok": True, "msg": msg_out(m), "conv": c.id}


class LeidoIn(BaseModel):
    conv: str
    hasta: int


@router.post("/api/chat/leido")
def leido(b: LeidoIn, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    c = db.get(ChatConv, b.conv)
    if not c or not miembro(c, u):
        raise HTTPException(404, "Conversación inexistente")
    if b.hasta > int((c.leido or {}).get(str(u.id), 0)):
        c.leido = {**(c.leido or {}), str(u.id): min(b.hasta, c.last_id or b.hasta)}
        db.commit()
    return {"ok": True}


class GrupoIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    miembros: list[int]


@router.post("/api/chat/grupo")
def grupo_nuevo(b: GrupoIn, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    ids = sorted({i for i in b.miembros if i != u.id and (x := db.get(User, i)) and x.activo and puede(x)} | {u.id})
    if len(ids) < 2:
        raise HTTPException(400, "Elegí al menos una persona para el grupo")
    c = ChatConv(id="g:" + secrets.token_hex(6), tipo="grupo", nombre=b.nombre.strip(), miembros=ids, leido={}, creado_por=u.id)
    db.add(c)
    db.flush()
    publicar(db, c, u, "sistema", f"{u.nombre} creó el grupo «{c.nombre}»")
    db.commit()
    return {"ok": True, "conv": c.id}


@router.put("/api/chat/grupo/{cid}")
def grupo_editar(cid: str, b: GrupoIn, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    c = db.get(ChatConv, cid)
    if not c or c.tipo != "grupo" or (c.creado_por != u.id and u.rol != "admin"):
        raise HTTPException(403, "Solo quien creó el grupo puede modificarlo")
    ids = sorted({i for i in b.miembros if (x := db.get(User, i)) and x.activo and puede(x)} | {c.creado_por})
    c.nombre = b.nombre.strip()
    c.miembros = ids
    publicar(db, c, u, "sistema", f"{u.nombre} actualizó el grupo")
    db.commit()
    return {"ok": True}


@router.post("/api/chat/grupo/{cid}/salir")
def grupo_salir(cid: str, u: User = Depends(chat_user), db: Session = Depends(get_db)):
    c = db.get(ChatConv, cid)
    if not c or c.tipo != "grupo" or not miembro(c, u):
        raise HTTPException(404, "Grupo inexistente")
    publicar(db, c, u, "sistema", f"{u.nombre} salió del grupo")
    c.miembros = [i for i in c.miembros if i != u.id]
    db.commit()
    return {"ok": True}


# ---------- historial completo (solo admin) ----------
@router.get("/api/chat/admin/convs")
def admin_convs(a: User = Depends(require_admin), db: Session = Depends(get_db)):
    nombres = {x.id: x.nombre for x in db.scalars(select(User))}
    out = []
    for c in db.scalars(select(ChatConv).order_by(ChatConv.last_at.desc().nullslast())):
        n = db.scalar(select(func.count()).select_from(ChatMsg).where(ChatMsg.conv == c.id, ChatMsg.tipo != "sistema")) or 0
        out.append({"id": c.id, "tipo": c.tipo, "nombre": c.nombre if c.tipo == "grupo" else " ↔ ".join(nombres.get(i, "?") for i in c.miembros),
                    "miembros": [nombres.get(i, "?") for i in c.miembros], "mensajes": n, "ultimo": iso(c.last_at), "creado": iso(c.created_at)})
    return {"convs": out}


@router.get("/api/chat/admin/buscar")
def admin_buscar(q: str = "", a: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = q.strip()
    if len(q) < 2:
        return {"msgs": []}
    L = db.scalars(select(ChatMsg).where(ChatMsg.texto.ilike(f"%{q}%")).order_by(ChatMsg.id.desc()).limit(200))
    return {"msgs": [msg_out(m) for m in L]}


@router.get("/api/chat/admin/export")
def admin_export(a: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Todas las conversaciones para descargar en Excel."""
    nombres = {x.id: x.nombre for x in db.scalars(select(User))}
    convs = {c.id: c for c in db.scalars(select(ChatConv))}
    def nom(cid):
        c = convs.get(cid)
        return "" if not c else (c.nombre if c.tipo == "grupo" else " ↔ ".join(nombres.get(i, "?") for i in c.miembros))
    return {"msgs": [{**msg_out(m), "conv_nombre": nom(m.conv)} for m in db.scalars(select(ChatMsg).order_by(ChatMsg.id))]}
