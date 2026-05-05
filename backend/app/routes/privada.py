# app/routes/privada.py
from fastapi import APIRouter, Depends
from app.models import Usuario
from app.auth_dependency import get_current_user

router = APIRouter(prefix="/privado", tags=["Privado"])

@router.get("/me")
def dados_usuario_logado(usuario: Usuario = Depends(get_current_user)):
    return {
        "nome": usuario.nome,
        "email": usuario.email,
        "admin": usuario.is_admin
    }
