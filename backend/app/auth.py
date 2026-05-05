# app/auth.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError
from database import get_db
from app.models import Usuario
from app.auth_utils import decodificar_token
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

def criar_hash_senha(senha: str) -> str:
    return pwd_context.hash(senha)

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Usuario:
    credenciais_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas ou expiradas.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        dados = decodificar_token(token)
        if not dados or "sub" not in dados:
            raise credenciais_invalidas
    except JWTError:
        raise credenciais_invalidas

    email = dados.get("sub")
    if not email:
        raise credenciais_invalidas

    usuario = db.query(Usuario).filter(Usuario.email == email).first()
    if not usuario:
        raise credenciais_invalidas

    return usuario
