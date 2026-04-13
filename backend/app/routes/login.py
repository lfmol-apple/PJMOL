from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, func  # 👈 func para comparação case-insensitive

from app.models.advogado import Advogado
from app.models.usuario import Usuario
from database import get_db
from app.utils.security import verificar_senha  # ✅ Função de verificação de senha

router = APIRouter()

# 📥 Modelo dos dados de login
class LoginData(BaseModel):
    usuario: str  # Pode ser e-mail ou nome de usuário
    senha: str

# 🔐 Rota única de login (advogado ou usuário/admin/gerente)
@router.post("/login/")
def login(dados: LoginData, db: Session = Depends(get_db)):
    if not dados.usuario or not dados.senha:
        raise HTTPException(status_code=400, detail="Usuário e senha são obrigatórios")

    # normaliza entrada
    login_in = dados.usuario.strip().lower()

    # 1) tenta autenticar como USUÁRIO/ADMIN/GERENTE (email OU nome), case-insensitive
    usuario = (
        db.query(Usuario)
        .filter(
            or_(
                func.lower(Usuario.email) == login_in,
                func.lower(Usuario.nome) == login_in,
            )
        )
        .first()
    )

    if usuario and verificar_senha(dados.senha, usuario.senha_hash):
        try:
            print(f"[login] usuario={usuario.email} is_admin={getattr(usuario, 'is_admin', None)} perfil={getattr(usuario, 'perfil', None)}")
        except Exception:
            pass
        is_admin = bool(getattr(usuario, "is_admin", False))
        perfil = getattr(usuario, "perfil", None) or ("admin" if is_admin else "usuario")

        return {
            "id": usuario.id,
            "nome": usuario.nome,
            "usuario": usuario.nome,         # compat com o front
            "email": usuario.email,
            "oab": None,                     # usuário/admin/gerente não tem OAB
            "tipo": "admin" if is_admin else "usuario",  # legado/compat
            "perfil": perfil,                # 👈 'admin' | 'gerente' | 'usuario'
        }

    if usuario:
        # usuário encontrado mas senha incorreta -> não tenta advogado para evitar bypass
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    # 2) tenta autenticar como ADVOGADO (email OU usuario), case-insensitive
    advogado = (
        db.query(Advogado)
        .filter(
            or_(
                func.lower(Advogado.email) == login_in,
                func.lower(Advogado.usuario) == login_in,
            )
        )
        .first()
    )

    if advogado and verificar_senha(dados.senha, advogado.senha_hash):
        return {
            "id": advogado.id,
            "nome": advogado.nome_completo,
            "usuario": advogado.usuario,     # compat com o front
            "email": advogado.email,
            "oab": advogado.oab,
            "tipo": "advogado",              # legado/compat
            "perfil": "advogado",            # 👈 agora sempre vem perfil
        }

    # ❌ Falha na autenticação
    raise HTTPException(status_code=401, detail="Credenciais inválidas")
