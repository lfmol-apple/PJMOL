from database import SessionLocal
from app.models import Usuario
from sqlalchemy.exc import IntegrityError

def importar_usuarios():
    session = SessionLocal()
    total_importados = 0

    usuarios_padrao = [
        {
            "nome": "Admin",
            "email": "admin@pjmol.com",
            "senha": "admin123"  # 🔒 Em produção, aplicar hash
        },
        {
            "nome": "Usuário Padrão",
            "email": "usuario@pjmol.com",
            "senha": "usuario123"
        }
    ]

    for u in usuarios_padrao:
        existente = session.query(Usuario).filter_by(email=u["email"]).first()
        if not existente:
            novo_usuario = Usuario(
                nome=u["nome"],
                email=u["email"],
                senha=u["senha"]
            )
            session.add(novo_usuario)
            total_importados += 1
        else:
            print(f"⚠️ Usuário já existe: {u['email']}")

    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        print("❌ Erro ao salvar usuários.")
    finally:
        session.close()

    return total_importados
