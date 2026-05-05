from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.advogado import Advogado

# Novo token
novo_token = "fa2e7a31-36f5-4d99-a62a-82b2031c599ec5ef9b88-29cf-4090-8aff-09f34fa1fca5"

# Nome de usuário do advogado (ajuste conforme necessário)
usuario_advogado = "leonardo"

def atualizar_token():
    db: Session = SessionLocal()
    advogado = db.query(Advogado).filter(Advogado.usuario == usuario_advogado).first()

    if not advogado:
        print(f"❌ Advogado com usuário '{usuario_advogado}' não encontrado.")
        return

    advogado.api_key_zapsign = novo_token
    db.commit()
    print(f"✅ Token atualizado com sucesso para o advogado '{usuario_advogado}'.")

if __name__ == "__main__":
    atualizar_token()
