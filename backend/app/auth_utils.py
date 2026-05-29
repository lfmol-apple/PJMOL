from jose import jwt, JWTError
from datetime import timedelta
from app.core.time import now_sp  # ✅ usar fuso America/Sao_Paulo

# Pode mover essas constantes para seu arquivo de configurações
SECRET_KEY = "sua-chave-secreta"  # substitua por uma chave segura
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def criar_token(email: str) -> str:
    """
    Gera um token JWT com o e-mail no campo 'sub' e validade de 60 minutos.
    """
    expire = now_sp() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "exp": expire
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token

def decodificar_token(token: str) -> dict:
    """
    Decodifica o token JWT e retorna o payload se for válido.
    Lança exceção JWTError se for inválido ou expirado.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
