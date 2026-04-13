from fastapi import APIRouter, Depends, HTTPException, status, Path, Request, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from sqlalchemy import text, or_, func  # ⬅️ SQL helpers

from app.models.usuario import Usuario
from database import get_db
from app.utils.security import gerar_hash_senha, verificar_senha

router = APIRouter(tags=["Usuarios"])

# ---------------------------
# Pydantic models
# ---------------------------
class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str
    telefone: Optional[str] = ""
    perfil: Optional[str] = None  # "admin" | "gerente" | "usuario"

class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    telefone: Optional[str] = None
    tipo: Optional[str] = None     # legado: "admin" | "usuario"
    perfil: Optional[str] = None   # novo:   "admin" | "gerente" | "usuario"
    senha: Optional[str] = None    # ✅ nova senha (opcional)

# ---------------------------
# Utils
# ---------------------------
def _normalize_phone(v: Optional[str]) -> str:
    if v is None:
        return ""
    return "".join(ch for ch in str(v) if ch.isdigit())

def _perfil_normalize(val: Optional[str]) -> str:
    if not val:
        return "usuario"
    v = str(val).strip().lower()
    if v not in {"admin", "gerente", "usuario"}:
        raise HTTPException(status_code=400, detail="perfil deve ser 'admin', 'gerente' ou 'usuario'")
    return v

def _tipo_to_bool(tipo: str) -> bool:
    val = str(tipo).strip().lower()
    if val not in {"admin", "usuario"}:
        raise HTTPException(status_code=400, detail="tipo deve ser 'admin' ou 'usuario'")
    return val == "admin"

def _usuario_dict(u: Usuario) -> Dict[str, Any]:
    """Serializa Usuario sem assumir colunas opcionais."""
    is_admin = bool(getattr(u, "is_admin", False))
    perfil = getattr(u, "perfil", None)
    if not perfil:
        perfil = "admin" if is_admin else "usuario"  # backcompat
    return {
        "id": u.id,
        "nome": getattr(u, "nome", None),
        "email": getattr(u, "email", None),
        "telefone": getattr(u, "telefone", None),
        "is_admin": is_admin,
        "tipo": "admin" if is_admin else "usuario",  # legado p/ frontend antigo
        "perfil": perfil,                             # novo
        "criado_em": getattr(u, "criado_em", None),
        "atualizado_em": getattr(u, "atualizado_em", None),
    }

def _set_perfil(db: Session, u: Usuario, perfil: str):
    """Define o perfil no objeto e persiste (com fallback SQL se a coluna não existir no model)."""
    if hasattr(Usuario, "perfil"):
        setattr(u, "perfil", perfil)
    else:
        db.execute(
            text("UPDATE usuarios SET perfil = :perfil WHERE id = :id"),
            {"perfil": perfil, "id": u.id},
        )

def _sync_is_admin_by_perfil(u: Usuario, perfil: str):
    """Mantém is_admin coerente com o perfil (admin=True quando perfil='admin')."""
    if hasattr(Usuario, "is_admin"):
        setattr(u, "is_admin", perfil == "admin")

# ---------------------------
# Endpoints
# ---------------------------

# Criar usuário
@router.post("/usuarios/", status_code=status.HTTP_201_CREATED)
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(Usuario).filter(Usuario.email == dados.email.lower().strip()).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    perfil_final = _perfil_normalize(dados.perfil) if dados.perfil else "usuario"

    u = Usuario(
        nome=dados.nome.strip(),
        email=dados.email.strip().lower(),
        telefone=_normalize_phone(dados.telefone),
        senha_hash=gerar_hash_senha(dados.senha),
        is_admin=False,  # será sincronizado abaixo
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    _set_perfil(db, u, perfil_final)
    _sync_is_admin_by_perfil(u, perfil_final)
    db.commit()
    db.refresh(u)

    rotulo = "Gerente" if perfil_final == "gerente" else "Administrador"
    return {"mensagem": "Usuário cadastrado com sucesso", "id": u.id, "perfil": perfil_final, "rotulo": rotulo}

# Login (e-mail OU nome, case-insensitive)
@router.post("/usuarios/login/")
def login_usuario(credenciais: dict, db: Session = Depends(get_db)):
    login = (credenciais.get("usuario") or "").strip().lower()
    senha = credenciais.get("senha")

    if not login or not senha:
        raise HTTPException(status_code=400, detail="Usuário e senha são obrigatórios")

    usuario = (
        db.query(Usuario)
        .filter(
            or_(
                func.lower(Usuario.email) == login,
                func.lower(Usuario.nome) == login,
            )
        )
        .first()
    )
    if not usuario or not verificar_senha(senha, getattr(usuario, "senha_hash", "")):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    is_admin = bool(getattr(usuario, "is_admin", False))
    perfil = getattr(usuario, "perfil", None)
    if not perfil:
        perfil = "admin" if is_admin else "usuario"

    rotulo = "Gerente" if perfil == "gerente" else "Administrador"

    return {
        "id": usuario.id,
        "nome": getattr(usuario, "nome", None),
        "email": getattr(usuario, "email", None),
        "tipo": "admin" if is_admin else "usuario",  # legado
        "perfil": perfil,                             # admin | gerente | usuario
        "rotulo": rotulo,                             # "Gerente" | "Administrador"
    }

# Contagem
@router.get("/usuarios/quantidade")
def contar_usuarios(db: Session = Depends(get_db)):
    total = db.query(Usuario).count()
    return {"total_usuarios": total}

# Listagem (compatível com /usuarios e /usuarios/)
@router.get("/usuarios")
@router.get("/usuarios/")
def listar_usuarios(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    usuarios = db.query(Usuario).all()
    return [_usuario_dict(u) for u in usuarios]

# Somente admins (mantido)
@router.get("/usuarios/admins")
def listar_usuarios_admins(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    admins = db.query(Usuario).filter(getattr(Usuario, "is_admin") == True).all()
    out = []
    for a in admins:
        d = _usuario_dict(a)
        out.append({
            "id": d["id"],
            "nome": d["nome"],
            "email": d["email"],
            "telefone": d["telefone"],
            "criado_em": d["criado_em"],
            "perfil": d.get("perfil", "admin"),
        })
    return out

# Atualizar por ID (aceita JSON OU multipart/form-data)
@router.put("/usuarios/{usuario_id}")
async def atualizar_usuario(
    usuario_id: int,
    request: Request,
    # form-data (opcional)
    nome: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    telefone: Optional[str] = Form(None),
    tipo: Optional[str] = Form(None),    # legado
    perfil: Optional[str] = Form(None),  # novo
    senha: Optional[str] = Form(None),   # ✅ nova senha (opcional)
    db: Session = Depends(get_db),
):
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    payload: Dict[str, Any] = {}
    ct = (request.headers.get("content-type") or "").lower()

    if ct.startswith("application/json"):
        try:
            payload = await request.json()
        except Exception:
            payload = {}
    else:
        payload = {
            "nome": nome,
            "email": email,
            "telefone": telefone,
            "tipo": tipo,
            "perfil": perfil,
            "senha": senha,
        }

    # Campos básicos
    if payload.get("nome") is not None:
        u.nome = str(payload["nome"]).strip()
    if payload.get("email") is not None:
        u.email = str(payload["email"]).strip().lower()
    if payload.get("telefone") is not None:
        u.telefone = _normalize_phone(payload["telefone"])

    # ✅ Troca de senha (se vier preenchida)
    if isinstance(payload.get("senha"), str) and payload["senha"].strip():
        u.senha_hash = gerar_hash_senha(payload["senha"].strip())

    # Preferência: 'perfil' novo; mantém compat com 'tipo'
    perfil_payload = payload.get("perfil")
    if perfil_payload is not None:
        perfil_final = _perfil_normalize(perfil_payload)
        _set_perfil(db, u, perfil_final)
        _sync_is_admin_by_perfil(u, perfil_final)

    # legado: se vier 'tipo', ainda sincroniza is_admin; NÃO altera 'perfil' exceto admin/usuario
    if payload.get("tipo") is not None and hasattr(Usuario, "is_admin"):
        is_admin_target = _tipo_to_bool(str(payload["tipo"]))
        u.is_admin = is_admin_target
        # Se mudar admin aqui e não vier 'perfil', sincroniza o perfil coerente
        if perfil_payload is None:
            _set_perfil(db, u, "admin" if is_admin_target else (getattr(u, "perfil", None) or "usuario"))

    db.commit()
    db.refresh(u)
    return _usuario_dict(u)

# Remover por e-mail (compat legado)
@router.delete("/usuarios/{email}")
def deletar_usuario_por_email(email: str = Path(...), db: Session = Depends(get_db)):
    u = db.query(Usuario).filter(Usuario.email == email).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    db.delete(u)
    db.commit()
    return {"mensagem": f"Usuário {email} removido com sucesso"}

# Remover por ID (rota mais explícita, evita colisões com e-mail)
@router.delete("/usuarios/id/{usuario_id}")
def deletar_usuario_por_id(usuario_id: int, db: Session = Depends(get_db)):
    u = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    db.delete(u)
    db.commit()
    return {"mensagem": f"Usuário com ID {usuario_id} foi excluído com sucesso."}
