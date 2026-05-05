# app/routes/sessoes.py
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from app.core.time import now_sp
from app.models.sessao_usuario import SessaoUsuario
from app.models.usuario import Usuario
from app.services.push_notifications import MONITOR_IDS
from app.services.push_notifications import notify_monitors_about_login

router = APIRouter(prefix="/sessoes", tags=["Sessoes"])


def _normalize_datetime(dt):
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is not None:
        return dt.replace(tzinfo=None)
    return dt


class SessaoPing(BaseModel):
    usuario_id: int
    nome: Optional[str] = None
    perfil: Optional[str] = None


class SessaoOut(BaseModel):
    usuario_id: int
    nome: str
    perfil: str
    data_referencia: str
    login_at: Optional[str]
    last_seen_at: Optional[str]
    logout_at: Optional[str]
    online: bool

    class Config:
        from_attributes = True


def _get_uid(x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id")) -> Optional[int]:
    if not x_usuario_id:
        return None
    try:
        return int(x_usuario_id)
    except Exception:
        return None


@router.post("/login")
def registrar_login(payload: SessaoPing, db: Session = Depends(get_db)):
    """Registra/atualiza a sessão de login do usuário no dia atual."""
    if payload.usuario_id <= 0:
        raise HTTPException(status_code=400, detail="usuario_id inválido")

    hoje = now_sp().date()
    agora_login = now_sp()

    sessao = (
        db.query(SessaoUsuario)
        .filter(
            SessaoUsuario.usuario_id == payload.usuario_id,
            SessaoUsuario.data_referencia == hoje,
        )
        .first()
    )
    if not sessao:
        sessao = SessaoUsuario(
            usuario_id=payload.usuario_id,
            nome=payload.nome or "Desconhecido",
            perfil=(payload.perfil or "usuario").lower(),
            data_referencia=hoje,
            login_at=agora_login,
            last_seen_at=agora_login,
        )
        db.add(sessao)
    else:
        if not sessao.login_at:
            sessao.login_at = agora_login
        sessao.last_seen_at = agora_login
        sessao.logout_at = None
        if payload.nome:
            sessao.nome = payload.nome
        if payload.perfil:
            sessao.perfil = payload.perfil.lower()
    db.commit()

    notify_result = notify_monitors_about_login(
        db,
        nome=sessao.nome,
        login_at_iso=agora_login.isoformat(),
        actor_user_id=payload.usuario_id,
    )

    return {"ok": True, "notify": notify_result}


@router.post("/heartbeat")
def heartbeat(payload: SessaoPing, db: Session = Depends(get_db)):
    """Atualiza last_seen_at do usuário no dia atual (batimento cardíaco)."""
    if payload.usuario_id <= 0:
        raise HTTPException(status_code=400, detail="usuario_id inválido")

    hoje = now_sp().date()
    sessao = (
        db.query(SessaoUsuario)
        .filter(
            SessaoUsuario.usuario_id == payload.usuario_id,
            SessaoUsuario.data_referencia == hoje,
        )
        .first()
    )
    agora = now_sp()
    if not sessao:
        sessao = SessaoUsuario(
            usuario_id=payload.usuario_id,
            nome=payload.nome or "Desconhecido",
            perfil=(payload.perfil or "usuario").lower(),
            data_referencia=hoje,
            login_at=agora,
            last_seen_at=agora,
        )
        db.add(sessao)
    else:
        sessao.last_seen_at = agora
        if sessao.logout_at and _normalize_datetime(sessao.logout_at) <= _normalize_datetime(agora):
            sessao.logout_at = None
        if payload.nome:
            sessao.nome = payload.nome
        if payload.perfil:
            sessao.perfil = payload.perfil.lower()
    db.commit()
    return {"ok": True}


@router.post("/logout")
def registrar_logout(payload: SessaoPing, db: Session = Depends(get_db)):
    """Marca o horário de saída do usuário (best effort)."""
    if payload.usuario_id <= 0:
        raise HTTPException(status_code=400, detail="usuario_id inválido")

    hoje = now_sp().date()
    sessao = (
        db.query(SessaoUsuario)
        .filter(
            SessaoUsuario.usuario_id == payload.usuario_id,
            SessaoUsuario.data_referencia == hoje,
        )
        .first()
    )
    if not sessao:
        # Se não houver sessão, cria com login/logout iguais
        agora = now_sp()
        sessao = SessaoUsuario(
            usuario_id=payload.usuario_id,
            nome=payload.nome or "Desconhecido",
            perfil=(payload.perfil or "usuario").lower(),
            data_referencia=hoje,
            login_at=agora,
            last_seen_at=agora,
            logout_at=agora,
        )
        db.add(sessao)
    else:
        sessao.logout_at = now_sp()
    db.commit()
    return {"ok": True}


@router.get("/status", response_model=List[SessaoOut])
def listar_status(
    data: Optional[date] = None,
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_get_uid),
):
    """Lista sessões do dia para monitoramento (usuários autorizados do monitor)."""
    if uid not in MONITOR_IDS:
        raise HTTPException(status_code=403, detail="Acesso restrito ao monitor de sessões.")

    dia = data or now_sp().date()
    rows = (
        db.query(SessaoUsuario)
        .filter(SessaoUsuario.data_referencia == dia)
        .all()
    )

    usuarios_com_acesso = (
        db.query(Usuario)
        .filter(
            or_(
                Usuario.is_admin == True,
                Usuario.perfil.in_(["admin", "gerente"]),
            )
        )
        .order_by(Usuario.nome.asc())
        .all()
    )

    sessoes_por_usuario = {r.usuario_id: r for r in rows if r.usuario_id is not None}

    agora = _normalize_datetime(now_sp())
    out: List[SessaoOut] = []
    for usuario in usuarios_com_acesso:
        r = sessoes_por_usuario.get(usuario.id)
        if r is None:
            out.append(
                SessaoOut(
                    usuario_id=usuario.id,
                    nome=usuario.nome,
                    perfil=(usuario.perfil or ("admin" if getattr(usuario, "is_admin", False) else "usuario") or "usuario").lower(),
                    data_referencia=dia.isoformat(),
                    login_at=None,
                    last_seen_at=None,
                    logout_at=None,
                    online=False,
                )
            )
            continue

        last_seen = _normalize_datetime(r.last_seen_at)
        logout = _normalize_datetime(r.logout_at)
        login_at = _normalize_datetime(r.login_at)
        # Considera online se não tem logout e o último ping foi há <= 2 minutos
        online = False
        if last_seen and (not logout or last_seen > logout):
            delta = (agora - last_seen).total_seconds()
            if delta <= 120:
                online = True

        out.append(
            SessaoOut(
                usuario_id=r.usuario_id or 0,
                nome=r.nome,
                perfil=r.perfil,
                data_referencia=r.data_referencia.isoformat(),
                login_at=login_at.isoformat() if login_at else None,
                last_seen_at=last_seen.isoformat() if last_seen else None,
                logout_at=logout.isoformat() if logout else None,
                online=online,
            )
        )

    out.sort(key=lambda item: (not item.online, item.nome.lower()))
    return out
