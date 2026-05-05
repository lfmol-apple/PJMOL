# app/routes/comunicados.py
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from app.models.comunicado import Comunicado
from app.models.usuario import Usuario
from app.core.time import now_sp

router = APIRouter(prefix="/comunicados", tags=["Comunicados"])

# IDs com permissão de escrita além dos admins
_AUTORIZADOS_IDS = {5, 8, 11}  # Leonardo, Henrique, Marco Antônio


def _parse_uid(
    x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id"),
) -> Optional[int]:
    if not x_usuario_id:
        return None
    try:
        return int(x_usuario_id)
    except Exception:
        return None


def _parse_perfil(
    x_perfil: Optional[str] = Header(None, alias="X-Perfil"),
) -> Optional[str]:
    return (x_perfil or "").strip().lower() or None


def _pode_escrever(uid: Optional[int], perfil: Optional[str]) -> bool:
    # Permita por ID explícito (5=Leonardo, 8=Henrique, 11=Marco Antônio)
    if uid and uid in _AUTORIZADOS_IDS:
        return True
    # Fallback: perfil admin (garante Henrique/Leonardo mesmo sem header de ID)
    if perfil and perfil.lower() == "admin":
        return True
    return False


# ── Schemas ─────────────────────────────────────────────────────────────────

class ComunicadoCreate(BaseModel):
    conteudo: str
    fixado: Optional[bool] = False


class ComunicadoOut(BaseModel):
    id: int
    numero_regra: Optional[int]
    autor_id: Optional[int]
    autor_nome: str
    conteudo: str
    fixado: bool
    criado_em: str

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ComunicadoOut])
def listar_comunicados(
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_parse_uid),
    perfil: Optional[str] = Depends(_parse_perfil),
):
    """Retorna todos os comunicados ativos — qualquer usuário logado pode ler."""
    if uid is None and perfil is None:
        raise HTTPException(status_code=401, detail="Identificação necessária.")

    rows = (
        db.query(Comunicado)
        .filter(Comunicado.ativo == True)
        .order_by(Comunicado.fixado.desc(), Comunicado.criado_em.desc())
        .all()
    )
    return [
        ComunicadoOut(
            id=r.id,
            numero_regra=r.numero_regra,
            autor_id=r.autor_id,
            autor_nome=r.autor_nome,
            conteudo=r.conteudo,
            fixado=bool(r.fixado),
            criado_em=r.criado_em.isoformat() if r.criado_em else "",
        )
        for r in rows
    ]


@router.post("", response_model=ComunicadoOut, status_code=201)
def criar_comunicado(
    payload: ComunicadoCreate,
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_parse_uid),
    perfil: Optional[str] = Depends(_parse_perfil),
):
    if not _pode_escrever(uid, perfil):
        raise HTTPException(status_code=403, detail="Sem permissão para criar comunicados.")

    if not payload.conteudo.strip():
        raise HTTPException(status_code=400, detail="O conteúdo não pode ser vazio.")

    autor_nome = "Desconhecido"
    if uid:
        u = db.query(Usuario).filter(Usuario.id == uid).first()
        if u:
            autor_nome = u.nome

    # Número sequencial de regra (máx atual + 1)
    max_num = db.query(func.max(Comunicado.numero_regra)).scalar() or 0
    proximo_num = max_num + 1

    c = Comunicado(
        autor_id=uid,
        autor_nome=autor_nome,
        numero_regra=proximo_num,
        conteudo=payload.conteudo.strip(),
        fixado=bool(payload.fixado),
        ativo=True,
        criado_em=now_sp(),
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    return ComunicadoOut(
        id=c.id,
        numero_regra=c.numero_regra,
        autor_id=c.autor_id,
        autor_nome=c.autor_nome,
        conteudo=c.conteudo,
        fixado=bool(c.fixado),
        criado_em=c.criado_em.isoformat(),
    )


@router.delete("/{comunicado_id}", status_code=204)
def excluir_comunicado(
    comunicado_id: int,
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_parse_uid),
    perfil: Optional[str] = Depends(_parse_perfil),
):
    c = db.query(Comunicado).filter(Comunicado.id == comunicado_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comunicado não encontrado.")

    eh_admin = perfil == "admin"
    eh_autor = (uid is not None and c.autor_id == uid)
    if not (eh_admin or eh_autor):
        raise HTTPException(status_code=403, detail="Sem permissão para excluir este comunicado.")

    c.ativo = False
    db.commit()
