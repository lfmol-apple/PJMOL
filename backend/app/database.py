from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# 🔵 INÍCIO: caminho absoluto + log claro do arquivo .db
from pathlib import Path

# diretório deste arquivo (app/)
_THIS_DIR = Path(__file__).resolve().parent
# arquivo do banco na pasta app/: app/database.db
_DB_FILE = (_THIS_DIR / "database.db").resolve()

# permite sobrescrever por variável de ambiente, senão usa caminho absoluto
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DB_FILE}")

print(f"[DB] Usando banco em: {DATABASE_URL}")
# 🔵 FIM

# Cria o engine do SQLAlchemy
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Cria uma sessão local vinculada ao engine
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base para os modelos ORM
Base = declarative_base()

# Função para criar as tabelas no banco de dados
def create_tables():
    Base.metadata.create_all(bind=engine)  # Cria as tabelas baseadas no modelo do SQLAlchemy

# Função que fornece a sessão do banco para uso com FastAPI (via Depends)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
