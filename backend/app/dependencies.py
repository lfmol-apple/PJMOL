# app/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app import auth_utils, models, database
from sqlalchemy.orm import Session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)) -> models.Usuario:
    payload = auth_utils.decodificar_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    usuario = db.query(models.Usuario).filter(models.Usuario.email == payload["sub"]).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return usuario

# app/dependencies.py (ou onde preferir)

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from app.models.advogado import Advogado

def get_advogado_logado(usuario: str, db: Session = Depends(get_db)) -> Advogado:
    advogado = db.query(Advogado).filter(Advogado.usuario == usuario).first()
    if not advogado:
        raise HTTPException(status_code=401, detail="Advogado não autenticado")
    return advogado
