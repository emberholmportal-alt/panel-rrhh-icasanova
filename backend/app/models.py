from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, JSON, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120))
    rol: Mapped[str] = mapped_column(String(20), default="usuario")          # admin | usuario
    perms: Mapped[dict] = mapped_column(JSON, default=dict)                   # {modulo: "ver" | "editar"}
    pass_hash: Mapped[str] = mapped_column(String(100))
    must_change: Mapped[bool] = mapped_column(Boolean, default=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    token_ver: Mapped[int] = mapped_column(Integer, default=1)                # sube al cambiar clave → cierra otras sesiones
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Doc(Base):
    """Datos de un módulo del panel (francos, vacaciones, etc.), compartidos por todos."""
    __tablename__ = "docs"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_by: Mapped[str | None] = mapped_column(String(120), nullable=True)


class UserDoc(Base):
    """Datos personales de cada usuario (por ejemplo, su fichada)."""
    __tablename__ = "user_docs"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PizarraItem(Base):
    __tablename__ = "pizarra"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    autor_nombre: Mapped[str] = mapped_column(String(120))
    data: Mapped[dict] = mapped_column(JSON, default=dict)                    # tipo, html, strokes, img, x, y, …
    pin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BuzonItem(Base):
    __tablename__ = "buzon"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    autor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)   # NULL = anónima
    autor_nombre: Mapped[str | None] = mapped_column(String(120), nullable=True)
    asunto: Mapped[str] = mapped_column(String(200))
    cat: Mapped[str] = mapped_column(String(20))
    msg: Mapped[str] = mapped_column(Text)
    att: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    estado: Mapped[str] = mapped_column(String(20), default="nueva")
    resp: Mapped[str | None] = mapped_column(Text, nullable=True)
    resp_por: Mapped[str | None] = mapped_column(String(120), nullable=True)
    resp_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resp_vista: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    usuario: Mapped[str] = mapped_column(String(120))
    accion: Mapped[str] = mapped_column(String(40))
    detalle: Mapped[str] = mapped_column(String(300), default="")


Index("ix_pizarra_created", PizarraItem.created_at)
Index("ix_buzon_autor", BuzonItem.autor_id)
