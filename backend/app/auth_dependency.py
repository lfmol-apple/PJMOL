# app/auth_dependency.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
from app.models import Usuario
from app.auth_utils import decodificar_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Usuario:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas ou expiradas",
        headers={"WWW-Authenticate": "Bearer"},
    )

    dados = decodificar_token(token)
    if not dados or "sub" not in dados:
        raise cred_exc

    email = dados["sub"]
    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if not usuario:
        raise cred_exc
    return usuario
