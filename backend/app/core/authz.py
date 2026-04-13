# app/core/authz.py
from fastapi import Depends, HTTPException, status
from typing import Any, Dict

# ✅ usamos a sua função atual de auth. Se o nome for outro, ajuste o import aqui:
try:
    from app.core.auth import get_current_user  # deve retornar um dict do usuário logado
except Exception:  # fallback simples caso você não tenha isso
    def get_current_user() -> Dict[str, Any]:
        # Se não tiver auth implementada, você pode retornar um "admin" fixo só pra testar.
        # ❗️Use apenas em desenvolvimento!
        return {"id": 1, "nome": "Admin Dev", "email": "admin@local", "is_admin": True, "perfil": "admin"}

def _perfil_of(user: Dict[str, Any]) -> str:
    # backcompat com is_admin
    perfil = user.get("perfil")
    if not perfil:
        perfil = "admin" if user.get("is_admin") else "usuario"
    return str(perfil).lower()

def require_perfil(*perfis: str):
    def _dep(user = Depends(get_current_user)):
        if _perfil_of(user) not in perfis:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sem permissão"
            )
        return user
    return _dep

require_admin = require_perfil("admin")
require_gerente_or_admin = require_perfil("admin", "gerente")
