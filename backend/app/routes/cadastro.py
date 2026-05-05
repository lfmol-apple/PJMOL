from fastapi import APIRouter, UploadFile, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from app.models.usuario import Usuario
from app.models.advogado import Advogado
from app.utils.security import gerar_hash_senha
from typing import Optional
import os

router = APIRouter()

UPLOAD_DIR = "/Users/leonardomol/Jao/6/backend/modelos"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------
# 📌 CADASTRAR (usuário comum/admin ou advogado)
# ---------------------------------------------------------------------
@router.post("/cadastro")
async def cadastrar_usuario(
    perfil: str = Form(...),                  # "admin" | "usuario" | "advogado"
    nome: str = Form(...),
    email: str = Form(...),
    telefone: str = Form(""),
    usuario_login: str = Form(""),           # usado somente p/ Advogado.usuario
    senha: str = Form(...),
    # ZapSign - nome correto é api_key_zapsign; mantemos fallback p/ token_zapsign
    api_key_zapsign: Optional[str] = Form(None),
    token_zapsign: Optional[str] = Form(None),
    # modelos DOCX (apenas quando perfil == "advogado")
    contrato: UploadFile | None = None,
    procuracao: UploadFile | None = None,
    db: Session = Depends(get_db),
):
    # Impede e-mail duplicado
    if db.query(Usuario).filter(Usuario.email == email).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

    senha_hash = gerar_hash_senha(senha)

    # Cria usuário de sistema (admin/usuario ou também o contêiner do advogado)
    novo_usuario = Usuario(
        nome=nome.strip(),
        email=email.strip().lower(),
        telefone="".join([c for c in (telefone or "") if c.isdigit()]),
        senha_hash=senha_hash,
        is_admin=(perfil == "admin"),
    )
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)

    # Se for advogado, cria registro específico na tabela de advogados
    if perfil == "advogado":
        api_key = (api_key_zapsign or token_zapsign or "").strip()
        if not api_key:
            raise HTTPException(status_code=400, detail="api_key_zapsign é obrigatória para advogado.")

        if not usuario_login:
            raise HTTPException(status_code=400, detail="Usuário (login) do advogado é obrigatório.")

        advogado = Advogado(
            nome_completo=nome.strip().upper(),
            email=email.strip().lower(),
            usuario=usuario_login.strip().lower(),
            senha_hash=senha_hash,
            telefone="".join([c for c in (telefone or "") if c.isdigit()]),
            oab="",  # pode vir de outra tela/edição; se quiser obrigar aqui, troque para Form(...)
            api_key_zapsign=api_key,
        )
        db.add(advogado)
        db.commit()
        db.refresh(advogado)

        # 📁 Cria subpasta por primeiro nome e salva modelos, se enviados
        primeiro_nome = (nome.strip().split()[0]).lower()
        pasta_advogado = os.path.join(UPLOAD_DIR, primeiro_nome)
        os.makedirs(pasta_advogado, exist_ok=True)

        if contrato:
            caminho_contrato = os.path.join(pasta_advogado, f"modelo_contrato_{usuario_login}.docx")
            with open(caminho_contrato, "wb") as f:
                f.write(await contrato.read())

        if procuracao:
            caminho_procuracao = os.path.join(pasta_advogado, f"modelo_procuracao_{usuario_login}.docx")
            with open(caminho_procuracao, "wb") as f:
                f.write(await procuracao.read())

    return {"mensagem": f"Usuário '{novo_usuario.nome}' cadastrado com sucesso.", "id": novo_usuario.id}

# ---------------------------------------------------------------------
# 📌 ADVOGADOS — listar / editar / deletar
# (mantemos tudo de advogados neste arquivo para separar de usuários)
# ---------------------------------------------------------------------
@router.get("/advogados")
def listar_advogados(db: Session = Depends(get_db)):
    # Retorna campos essenciais; api_key_zapsign incluída para gerenciamento
    advs = db.query(Advogado).all()
    return [
        {
            "id": a.id,
            "nome_completo": a.nome_completo,
            "email": a.email,
            "telefone": a.telefone,
            "usuario": a.usuario,
            "oab": a.oab,
            "api_key_zapsign": a.api_key_zapsign,
        }
        for a in advs
    ]

@router.put("/advogado/{advogado_id}")
def atualizar_advogado(
    advogado_id: int,
    nome_completo: str = Form(...),
    email: str = Form(...),
    telefone: str = Form(""),
    oab: str = Form(""),
    api_key_zapsign: str = Form(""),
    db: Session = Depends(get_db),
):
    a = db.query(Advogado).filter(Advogado.id == advogado_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Advogado não encontrado")

    a.nome_completo = nome_completo.strip().upper()
    a.email = email.strip().lower()
    a.telefone = "".join([c for c in (telefone or "") if c.isdigit()])
    a.oab = (oab or "").strip().upper()
    a.api_key_zapsign = (api_key_zapsign or "").strip()
    db.commit()
    db.refresh(a)
    return {"mensagem": "Advogado atualizado com sucesso."}

@router.delete("/advogado/{advogado_id}")
def deletar_advogado(advogado_id: int, db: Session = Depends(get_db)):
    a = db.query(Advogado).filter(Advogado.id == advogado_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Advogado não encontrado")

    primeiro_nome = a.nome_completo.strip().split()[0].lower()
    pasta_advogado = os.path.join(UPLOAD_DIR, primeiro_nome)

    for tipo in ["modelo_contrato", "modelo_procuracao"]:
        caminho = os.path.join(pasta_advogado, f"{tipo}_{a.usuario}.docx")
        if os.path.exists(caminho):
            os.remove(caminho)

    db.delete(a)
    db.commit()
    return {"mensagem": f"Advogado com ID {advogado_id} foi excluído com sucesso."}
