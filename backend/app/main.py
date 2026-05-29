# backend/app/main.py
import asyncio
import sys
import os
import json
import traceback
import shutil
from datetime import datetime, date
from typing import List, Optional, Union

# Carregar variáveis de ambiente do .env
from dotenv import load_dotenv
load_dotenv(dotenv_path="app/.env")

from fastapi import (
    FastAPI, File, UploadFile, Request, HTTPException, Body, Depends, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from dateutil.parser import parse
from dateutil.relativedelta import relativedelta
from PIL import Image, ImageEnhance, ImageFilter
from sqlalchemy.orm import Session
from sqlalchemy import text

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database import engine, SessionLocal, Base, get_db

# rotas existentes  
from app.routes import usuarios, login, privada, advogado, documentos
from app.routes import alerta_forcado
from app.routes.usuarios import router as usuarios_router
from app.api.comarca import router as comarca_router
from app.api.ml_aprendizado import router as ml_router
from app.api.aprendizado_correcao import router as aprendizado_correcao_router

# novo router de assinatura (envio p/ ZapSign e persistência)
from app.routes import assinaturas
from app.routes import extratos  # CRUD de extratos + _dryrun + upload-extrato

from app.calculos.calculos_valores_backend import calcular_valor_corrigido
from app.calculos.config_calculo import ConfigCalculo, IndiceCorrecao
from app.api import comarca  # compat
from app.utils.utils import instalar_dependencias
from app.extracao.leitura_pdf import extrair_dados_pdf, converter_pdf_para_imagens
from database import engine, Base
from app.models.usuario import Usuario
from app.models.extrato import Extrato
from app.models.relacionados import ParcelaExtrato, CustaExtrato, AnexoExtrato
from app.models.comunicado import Comunicado
from app.models.push_subscription import PushSubscription
from fastapi.middleware.cors import CORSMiddleware
from app.core.scheduler import install_scheduler, recalcular_todos_extratos, RECALC_JOB_NAME
from app.routes import webhook_zapsign
from app.routes import uploads_clean
from app.routes import relatorios_producao
from app.routes import analytics_campanha as analytics_campanha_route
from app.routes.advogado_public import router as advogado_public_router
from app.routes.extratos_storage import router as extratos_storage_router
from app.routes import extratos_download
from app.routes import comunicados as comunicados_route
from app.routes import sessoes as sessoes_route
from app.routes import push_notifications as push_notifications_route
from app.services import job_state
from app.core.time import now_sp


# ocr_ajuste pode não existir em todos os ambientes; tratamos graciosamente
try:
    from extracao.leitura_pdf import ocr_ajuste  # type: ignore
except Exception:
    def ocr_ajuste(*args, **kwargs):
        return None

# ======================================================================
# DB & App
# ======================================================================

# garanta que o BASE_DIR está correto ANTES de montar estáticos
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

# cria as tabelas após importar os modelos
Base.metadata.create_all(bind=engine)

CAMINHO_JSON = os.path.join(BASE_DIR, "app", "dados", "administradoras.json")
with open(CAMINHO_JSON, "r", encoding="utf-8") as f:
    CNPJS_ADMINISTRADORAS = json.load(f)

app = FastAPI(
    title="API com Autenticação JWT",
    description="Exemplo de API com rotas públicas e protegidas",
    version="1.0.0",
)

# ======================================================================
# Exception Handler para ValidationError do Pydantic
# ======================================================================

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    """Handler customizado para erros de validação do Pydantic."""
    import json
    print(f"\n[VALIDATION ERROR] Endpoint: {request.method} {request.url.path}")
    print(f"[VALIDATION ERROR] Erros de validação:")
    print(json.dumps(exc.errors(), indent=2))
    
    # Retorna resposta mais detalhada
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "body": str(exc.body) if hasattr(exc, 'body') else None,
            "message": "Erro de validação dos dados enviados. Verifique os campos obrigatórios e seus tipos."
        }
    )

# ======================================================================
# Auto-correção de timezone na inicialização
# ======================================================================

@app.on_event("startup")
async def startup_timezone_correction():
    """Executa correção automática de timezone na inicialização do servidor."""
    from app.core.timezone_middleware import auto_fix_historical_data
    from database import SessionLocal
    from app.routes.uploads_clean import _atualizar_fase
    from app.models.extrato import Extrato
    import logging
    
    logger = logging.getLogger(__name__)
    
    # Auto-correção de timezone
    try:
        logger.info("🕒 Iniciando auto-correção de timezone...")
        db = SessionLocal()
        try:
            corrections = auto_fix_historical_data(db)
            if corrections > 0:
                logger.info(f"✅ Auto-correção de timezone concluída: {corrections} registros corrigidos")
            else:
                logger.info("✅ Nenhuma correção de timezone necessária")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ Erro na auto-correção de timezone: {e}")
    
    # 🔧 Migração: adiciona coluna numero_regra em comunicados se não existir
    try:
        with engine.connect() as _conn:
            _conn.execute(text("ALTER TABLE comunicados ADD COLUMN numero_regra INTEGER"))
            _conn.commit()
    except Exception:
        pass  # coluna já existe

    # 🔧 Migração: auditoria do valor de acordo para relatórios de comissão
    try:
        with engine.connect() as _conn:
            _conn.execute(text("ALTER TABLE extratos ADD COLUMN valor_acordo_inserido_em DATETIME"))
            _conn.commit()
    except Exception:
        pass
    try:
        with engine.connect() as _conn:
            _conn.execute(text("ALTER TABLE extratos ADD COLUMN valor_acordo_inserido_por_usuario_id INTEGER"))
            _conn.commit()
    except Exception:
        pass
    try:
        with engine.connect() as _conn:
            _conn.execute(text("ALTER TABLE extratos ADD COLUMN data_recebimento_acordo DATE"))
            _conn.commit()
    except Exception:
        pass
    try:
        with engine.connect() as _conn:
            _conn.execute(text("ALTER TABLE extratos ADD COLUMN comprovante_recebimento_acordo_url VARCHAR"))
            _conn.commit()
    except Exception:
        pass

    # 🎯 Auto-atualização de fases (substitui sistema de timers)
    try:
        logger.info("🎯 Atualizando fases de todos os extratos...")
        db = SessionLocal()
        try:
            extratos = db.query(Extrato).all()
            
            for ex in extratos:
                _atualizar_fase(ex, db)
                db.add(ex)
            
            db.commit()
            logger.info(f"✅ {len(extratos)} extrato(s) com fases atualizadas")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"❌ Erro na atualização de fases: {e}")

# ======================================================================
# Recálculo diário na primeira requisição
# ======================================================================

_daily_recalc_lock = asyncio.Lock()
_last_recalc_date_cache: Optional[date] = None


def _buscar_data_ultimo_recalculo() -> Optional[date]:
    db = SessionLocal()
    try:
        return job_state.last_success_date(db, RECALC_JOB_NAME)
    finally:
        db.close()


async def _garantir_recalculo_diario():
    global _last_recalc_date_cache
    hoje = now_sp().date()
    if _last_recalc_date_cache == hoje:
        return

    ultimo = _buscar_data_ultimo_recalculo()
    if ultimo and ultimo >= hoje:
        _last_recalc_date_cache = ultimo
        return

    async with _daily_recalc_lock:
        if _last_recalc_date_cache == hoje:
            return
        ultimo = _buscar_data_ultimo_recalculo()
        if ultimo and ultimo >= hoje:
            _last_recalc_date_cache = ultimo
            return
        try:
            await run_in_threadpool(recalcular_todos_extratos)
            _last_recalc_date_cache = hoje
        except Exception as e:
            print(f"[Middleware] Recálculo diário na primeira requisição falhou: {e}")


@app.middleware("http")
async def daily_recalc_middleware(request: Request, call_next):
    if request.method != "OPTIONS":
        try:
            await _garantir_recalculo_diario()
        except Exception as e:
            print(f"[Middleware] Falha ao checar recálculo diário: {e}")
    response = await call_next(request)
    return response

# ======================================================================
# CORS e estáticos
# ======================================================================

_default_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
_env_origins = os.getenv("CORS_ALLOW_ORIGINS")
if _env_origins:
    _extra_origins = [origin.strip() for origin in _env_origins.split(",") if origin.strip()]
    _default_origins.extend(_extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔵 INÍCIO — storage local de arquivos públicos (/files)
# ✅ CAMINHO ABSOLUTO CONFIÁVEL
from app.utils.paths import get_storage_dir
STORAGE_ROOT = os.getenv("STORAGE_ROOT", get_storage_dir())

# (opcional) base pública para construir URLs completas quando preciso
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL")  # ex.: https://seu-dominio.com

# Expor os arquivos do STORAGE_ROOT em /files com Content-Type correto
from fastapi.responses import Response as _Resp
def _sniff_mime(data: bytes, filename: str) -> str:
    if data[:4] == b"%PDF":
        return "application/pdf"
    if len(data) >= 4 and data[0] == 0x89 and data[1:4] == b"PNG":
        return "image/png"
    if len(data) >= 3 and data[0] == 0xFF and data[1] == 0xD8 and data[2] == 0xFF:
        return "image/jpeg"
    if data[:3] == b"GIF":
        return "image/gif"
    if len(data) > 12 and data[8:12] == b"WEBP":
        return "image/webp"
    import mimetypes as _mt2
    guessed, _ = _mt2.guess_type(filename)
    return guessed or "application/octet-stream"

@app.get("/files/{file_path:path}")
async def serve_file(file_path: str):
    import pathlib
    abs_root = pathlib.Path(STORAGE_ROOT).resolve()
    target = (abs_root / file_path).resolve()
    if not str(target).startswith(str(abs_root)):
        from fastapi import HTTPException
        raise HTTPException(status_code=403)
    if not target.is_file():
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    data = target.read_bytes()
    mime = _sniff_mime(data, target.name)
    return _Resp(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": "inline"},
    )
# 🔵 FIM — storage local de arquivos públicos (/files)

# Routers auxiliares
app.include_router(comunicados_route.router)
app.include_router(alerta_forcado.router)
app.include_router(sessoes_route.router)
app.include_router(push_notifications_route.router)

# ======================================================================
# Auth básica (para rota de exemplo)
# ======================================================================

security = HTTPBasic()

def verificar_autenticacao(credentials: HTTPBasicCredentials = Depends(security)):
    if not (credentials.username == "admin" and credentials.password == "senha123"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
            headers={"WWW-Authenticate": "Basic"},
        )
    return True

@app.get("/rota-protegida")
def rota_protegida(dep=Depends(verificar_autenticacao)):
    return {"mensagem": "Você está autenticado!"}

# ======================================================================
# Routes
# ======================================================================

# Evita duplicar routes: usamos apenas um include por módulo
app.include_router(comarca_router)        # /api/comarca
app.include_router(ml_router)             # /api/ml
app.include_router(aprendizado_correcao_router)   # /aprendizado

#  NOVO: API para Templates ML por Administradora - PROD: Removido temporariamente
# from api.ml_templates import router as ml_templates_router
# app.include_router(ml_templates_router)  # /ml-templates

app.include_router(usuarios_router)       # /usuarios
app.include_router(advogado.router)       # /advogado
app.include_router(documentos.router)     # /documentos (geração DOCX/PDF e /gerar-documentos)
app.include_router(login.router)          # públicas
app.include_router(privada.router)        # protegidas
app.include_router(assinaturas.router)    # /assinaturas (enviar p/ ZapSign)
app.include_router(extratos.router)       # /extratos (CRUD + _dryrun + upload-extrato)
install_scheduler(app)
app.include_router(webhook_zapsign.router)
app.include_router(uploads_clean.router)
app.include_router(relatorios_producao.router)
app.include_router(analytics_campanha_route.router)
app.include_router(advogado_public_router)
app.include_router(extratos_storage_router)
app.include_router(extratos_download.router)
app.include_router(comunicados_route.router)  # /comunicados
app.include_router(alerta_forcado.router)      # /alerta-forcado

# ======================================================================
# 🤖 ML ENDPOINTS SIMPLIFICADOS PARA PRODUÇÃO
# ======================================================================

@app.get("/api/ml-aprendizado/estatisticas")
async def ml_estatisticas_producao():
    """Estatísticas ML simplificadas para produção."""
    return {
        "extratos_processados": 0,
        "taxa_sucesso": 0.0,
        "melhorias_aplicadas": 0,
        "tempo_medio_processamento": 0.0,
        "status": "disabled_for_production",
        "message": "Sistema ML desabilitado para implantação de produção estável"
    }

@app.get("/api/ml-aprendizado/status")
async def ml_status_producao():
    """Status do sistema ML para produção."""
    return {
        "ativo": False,
        "modo": "production_safe",
        "ultima_atualizacao": "2024-10-31",
        "mensagem": "Sistema em modo de produção seguro"
    }

# ✅ CAMINHOS ABSOLUTOS CONFIÁVEIS
from app.utils.paths import get_documentos_dir, get_static_dir
DOCS_DIR = get_documentos_dir()
app.mount("/documentos", StaticFiles(directory=DOCS_DIR), name="documentos")

# opcional: estáticos gerais (útil para assinado via webhook, se for servir local)
STATIC_DIR = get_static_dir()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# ======================================================================
# Dependências opcionais (instala se faltar)
# ======================================================================

instalar_dependencias()

# ======================================================================
# Util: melhorar imagem (OCR)
# ======================================================================

def aprimorar_imagem(caminho_img: str) -> None:
    try:
        img = Image.open(caminho_img).convert("L")
        img = img.filter(ImageFilter.MedianFilter(size=3))
        img = ImageEnhance.Contrast(img).enhance(2.0)
        img = img.point(lambda x: 0 if x < 128 else 255, "1")
        img.convert("RGB").save(caminho_img)
    except Exception as e:
        print(f"❌ Erro ao aprimorar imagem {caminho_img}: {e}")

# ======================================================================
# Extração principal (SEM GEMINI)
# ======================================================================

def _mapear_cnpj(dados: dict) -> None:
    """
    Preenche cnpj_administradora e corrige nome da administradora.
    Usa sistema de correção inteligente com fuzzy matching.
    """
    nome_admin = dados.get("administradora", "").strip()
    cnpj_admin = dados.get("cnpj_administradora", "").strip()
    
    # Se já tem CNPJ e nome, tenta melhorar
    if nome_admin or cnpj_admin:
        try:
            from corretor_administradora import corretor_administradora
            resultado = corretor_administradora.corrigir_administradora(nome_admin, cnpj_admin)
            
            if resultado.get("corrigido"):
                # Atualiza com nome correto
                dados["administradora"] = resultado["nome"]
                dados["cnpj_administradora"] = resultado["cnpj"]
                if resultado.get("cep") and not dados.get("cep_administradora"):
                    dados["cep_administradora"] = resultado["cep"]
                return
        except Exception as e:
            print(f"⚠️ Erro ao usar corretor inteligente: {e}")
    
    # Fallback: método antigo
    if nome_admin:
        nome_upper = nome_admin.upper()
        for nome_json in CNPJS_ADMINISTRADORAS:
            if nome_json.strip().upper() in nome_upper or nome_upper in nome_json.strip().upper():
                # Corrigido: pega apenas o CNPJ, não o dicionário inteiro
                admin_dados = CNPJS_ADMINISTRADORAS[nome_json]
                if isinstance(admin_dados, dict):
                    dados["cnpj_administradora"] = admin_dados.get("cnpj", "")
                    if admin_dados.get("cep") and not dados.get("cep_administradora"):
                        dados["cep_administradora"] = admin_dados["cep"]
                else:
                    dados["cnpj_administradora"] = admin_dados  # String legada
                dados["administradora"] = nome_json  # Normaliza o nome
                break
        else:
            dados["cnpj_administradora"] = ""
    else:
        dados["cnpj_administradora"] = ""

def extrair_dados(caminho_pdf: str):
    print(f"\n📄 Lendo PDF: {caminho_pdf}")
    try:
        # 1) Extração base (pdfplumber / PyMuPDF / regex)
        dados, parcelas = extrair_dados_pdf(caminho_pdf, debug=True, forcar_ocr=False)
        _mapear_cnpj(dados)

        grupo = dados.get("grupo")
        cota  = dados.get("cota")

        # 2) Fallback automático com OCR se faltar campos essenciais
        if not grupo or not cota:
            print("⚠️ Grupo/Cota ausentes. Tentando OCR...")
            dados_ocr, parcelas_ocr = extrair_dados_pdf(caminho_pdf, debug=True, forcar_ocr=True)
            _mapear_cnpj(dados_ocr)
            if dados_ocr.get("grupo") and dados_ocr.get("cota"):
                dados, parcelas = dados_ocr, parcelas_ocr
                grupo, cota = dados["grupo"], dados["cota"]

        # 3) Se ainda faltar, retornar 422 (para o front não tratar como sucesso)
        if not grupo or not cota:
            raise HTTPException(
                status_code=422,
                detail={
                    "ok": False,
                    "erro": "Campos essenciais ausentes",
                    "detalhe": "Não consegui identificar Grupo/Cota neste PDF.",
                    "dados_parciais": dados,
                },
            )

        # 4) Impedir duplicidade no banco por (grupo, cota)
        db: Session = SessionLocal()
        try:
            grupo = (dados.get('grupo') or "").strip()
            cota  = (dados.get('cota') or "").strip()
            if grupo and cota:
                if db.query(Extrato).filter_by(grupo=grupo, cota=cota).first():
                    raise HTTPException(status_code=400, detail="Extrato já cadastrado")
        finally:
            db.close()

        # 5) Soma das parcelas pagas (> 0)
        soma_base = round(sum(p.get("valor_pago", 0.0) for p in parcelas if p.get("valor_pago", 0.0) > 0), 2)
        total_pdf = round(float(dados.get("valor_total_pago_extrato") or 0.0), 2)
        diferenca = round(total_pdf - soma_base, 2)

        # 6) Ajuste por OCR local, se houver diferença relevante
        if abs(diferenca) > 0.01:
            print(f"🔍 Diferença detectada ({diferenca}). Tentando OCR local…")
            imagens = converter_pdf_para_imagens(caminho_pdf)
            for img_path in imagens:
                aprimorar_imagem(img_path)
            try:
                achados = ocr_ajuste(caminho_pdf, parcelas, diferenca)
                if achados:
                    if isinstance(achados, dict):
                        parcelas.append(achados)
                    elif isinstance(achados, list):
                        parcelas.extend(achados)
            except Exception:
                traceback.print_exc()
            soma_final = round(sum(p.get("valor_pago", 0.0) for p in parcelas if p.get("valor_pago", 0.0) > 0), 2)
            diferenca_pos = round(total_pdf - soma_final, 2)
            print(f"🧾 Parcelas capturadas: {len(parcelas)} | soma = {soma_final} | dif = {diferenca_pos}")
            dados["parcelas_detalhadas"] = parcelas
            dados["parcelas_pagas"] = len([p for p in parcelas if p.get("valor_pago", 0.0) > 0])
            dados["soma_valores_pagos"] = soma_final
        else:
            print(f"🧾 Parcelas capturadas: {len(parcelas)} | soma = {soma_base}")
            dados["parcelas_detalhadas"] = parcelas
            dados["parcelas_pagas"] = len([p for p in parcelas if p.get("valor_pago", 0.0) > 0])
            dados["soma_valores_pagos"] = soma_base

        # 7) Taxa de administração proporcional “devida”
        try:
            total_parcelas_plano = int(dados.get("total_parcelas_plano", 0) or 0)
            parcelas_pagas = int(dados.get("parcelas_pagas", 0) or 0)
            taxa_adm_percentual = float(dados.get("taxa_adm_percentual", 0.0) or 0.0)
            taxa_adm_devida = (parcelas_pagas / total_parcelas_plano) * taxa_adm_percentual if total_parcelas_plano > 0 else 0.0
            dados["taxa_adm_devida"] = round(taxa_adm_devida, 2)
        except Exception as e:
            print(f"[!] Erro ao calcular taxa_adm_devida: {e}")
            dados["taxa_adm_devida"] = 0.0

        return dados

    except HTTPException:
        raise
    except Exception:
        traceback.print_exc()
        return None

# ======================================================================
# Endpoints
# ======================================================================

@app.get("/")
def status():
    return {"mensagem": "API do extrator com autenticação ativa"}

# ⚠️ Removido o endpoint local /gerar-documentos para evitar duplicidade.
# Use o de app.routes.documentos (já incluído via app.include_router(documentos.router)).

@app.post("/extrair")
async def extrair(file: UploadFile = File(...)):
    try:
        # ✅ CAMINHO ABSOLUTO CONFIÁVEL
        from app.utils.paths import get_temp_uploads_dir
        temp_dir = get_temp_uploads_dir()
        caminho_pdf = os.path.join(temp_dir, file.filename)
        with open(caminho_pdf, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Execução de extração em thread
        dados = await run_in_threadpool(extrair_dados, caminho_pdf)
        if not dados:
            return JSONResponse(status_code=500, content={"erro": "Falha na extração"})

        # ✅ PROCESSAMENTO TRADICIONAL (PRODUÇÃO)
        mensagens_processamento = []
        
        print(f"[EXTRACT] Sistema de extração tradicional ativo")
        print(f"[EXTRACT] Dados extraídos: {list(dados.keys())}")
        
        # Aplicar validações básicas
        try:
            # Garantir que valores essenciais não sejam None
            if dados.get("valor_bem") is None:
                dados["valor_bem"] = 0.0
            if dados.get("valor_total_pago") is None:
                dados["valor_total_pago"] = 0.0
            
            mensagens_processamento.append("✅ Dados processados com extração tradicional")
            
        except Exception as e:
            print(f"[EXTRACT] Erro no processamento tradicional: {e}")
            mensagens_processamento.append(f"⚠️ Aviso: {str(e)}")

        # Padronizações amigáveis ao front
        if "valor_total_taxa_adm_cobrada" in dados:
            dados["taxa_adm_cobrada_valor"] = dados["valor_total_taxa_adm_cobrada"]

        dados_basicos = {k: v for k, v in dados.items() if k != "parcelas_detalhadas"}
        for campo in [
            "valor_corrigido_hoje",
            "valor_corrigido_futuro",
            "valor_corrigido_hoje_liquido",
            "valor_corrigido_futuro_liquido",
            "valor_a_restituir",
            "percentual_taxa_adm_cobrada",
            "taxa_adm_cobrada_valor",
        ]:
            if campo in dados:
                dados_basicos[campo] = dados[campo]

        print("📦 DADOS EXTRAÍDOS:", dados)
        return {
            "dados_basicos": dados_basicos,
            "parcelas": dados.get("parcelas_detalhadas", []),
            "mensagens_processamento": mensagens_processamento,  # 📝 Mensagens para mostrar ao usuário
        }

    except HTTPException as he:
        # Propaga respostas 4xx com payload detalhado
        if isinstance(he.detail, dict):
            return JSONResponse(status_code=he.status_code, content=he.detail)
        raise he
    except Exception as e:
        return JSONResponse(status_code=500, content={"erro": str(e)})


# ---------- Última atualização dos índices ----------

@app.get("/indices/ultima-atualizacao")
def ultima_atualizacao_indices():
    """Retorna o último mês/ano disponível em cada tabela de índice."""
    from app.calculos.calculos_valores_backend import carregar_tabela_indice
    indices_disponiveis = ["TJMG", "IPCA", "INPC"]
    resultado = {}
    for indice in indices_disponiveis:
        try:
            df = carregar_tabela_indice(indice)
            if df.empty:
                resultado[indice] = None
                continue
            ultima = df.iloc[-1]
            ano = str(int(ultima["ANO"]))
            mes = str(ultima["MES"]).capitalize()
            resultado[indice] = f"{mes}/{ano}"
        except Exception:
            resultado[indice] = None
    return resultado


# ---------- Modelos para /calcular ----------

class ParcelaInput(BaseModel):
    data_pagamento: str
    valor_pago: float
    tipo: Optional[str] = "parcela"

class DadosBasicos(BaseModel):
    grupo: str
    cota: str
    nome_cliente: str
    cpf_cnpj: str
    tipo_documento: str
    taxa_adm_percentual: float
    total_parcelas_plano: int
    data_encerramento: Optional[str] = None
    valor_total_pago_extrato: float
    administradora: str
    cep: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    valor_corrigido: Optional[Union[str, float]] = None
    valor_futuro: Optional[Union[str, float]] = None
    data_primeira_assembleia: Optional[str] = None
    valor_credito: Optional[float] = None

class DadosManuais(BaseModel):
    telefone: str
    advogado: str
    numero_processo: str
    honorarios_percentual: str
    fase_processo: str
    magistrado: str
    valor_corrigido: Optional[Union[str, float]] = None
    valor_futuro: Optional[Union[str, float]] = None
    data_inicio_juros: str
    taxa_juros_percentual: str
    houve_sentenca: bool
    data_sentenca: Optional[str] = None
    valor_outros_custos: Optional[str] = "0"
    indice_corrigido_hoje: Optional[str] = "TJMG"
    indice_corrigido_futuro: Optional[str] = "TJMG"

class CalculoRequest(BaseModel):
    parcelas: List[ParcelaInput]
    dados_basicos: DadosBasicos
    dados_manuais: DadosManuais

def calcular_config_completo(calculo: CalculoRequest) -> ConfigCalculo:
    return ConfigCalculo(
        estado=calculo.dados_basicos.estado,
        data_sentenca=datetime.strptime(calculo.dados_manuais.data_sentenca, "%Y-%m-%d")
        if calculo.dados_manuais.houve_sentenca and calculo.dados_manuais.data_sentenca else None,
        aplicar_juros_mora=True,
        aplicar_juros=(
            float(calculo.dados_manuais.taxa_juros_percentual.replace(",", ".")) > 0.0
            if calculo.dados_manuais.taxa_juros_percentual else False
        ),
        data_inicio_juros=datetime.strptime(calculo.dados_manuais.data_inicio_juros, "%Y-%m-%d")
        if calculo.dados_manuais.data_inicio_juros else None,
        percentual_juros_mora_anual=float(calculo.dados_manuais.taxa_juros_percentual.replace(",", ".")) * 12
        if calculo.dados_manuais.taxa_juros_percentual else 0.0,
        taxa_juros_mensal_percentual=float(calculo.dados_manuais.taxa_juros_percentual.replace(",", "."))
        if calculo.dados_manuais.taxa_juros_percentual else 0.0,
        percentual_honorarios=float(calculo.dados_manuais.honorarios_percentual.replace("%", "").replace(",", "."))
        if calculo.dados_manuais.honorarios_percentual else 0.0,
        taxa_administracao_percentual_total=calculo.dados_basicos.taxa_adm_percentual,
        outros_custos=float(getattr(calculo.dados_manuais, "valor_outros_custos", "0").replace("R$", "").replace(",", ".").strip())
        if getattr(calculo.dados_manuais, "valor_outros_custos", None) else 0.0,
        total_parcelas_plano=calculo.dados_basicos.total_parcelas_plano,
        valor_total_pago_extrato=calculo.dados_basicos.valor_total_pago_extrato,
        houve_sentenca=calculo.dados_manuais.houve_sentenca,
        indice_corrigido_hoje=calculo.dados_manuais.indice_corrigido_hoje or IndiceCorrecao.TJMG,
        indice_corrigido_futuro=calculo.dados_manuais.indice_corrigido_futuro or IndiceCorrecao.IPCA,
        valor_credito=calculo.dados_basicos.valor_credito or 0.0
    )

@app.post("/calcular")
async def calcular(calculo: CalculoRequest = Body(...)):
    try:
        parcelas_dict = [p.dict() for p in calculo.parcelas]

        if calculo.dados_manuais.houve_sentenca and calculo.dados_manuais.data_sentenca:
            data_sentenca_dt = datetime.strptime(calculo.dados_manuais.data_sentenca, "%Y-%m-%d")
            data_destino_hoje = data_sentenca_dt
            data_destino_futuro = data_sentenca_dt
        elif calculo.dados_basicos.data_encerramento:
            data_destino_hoje = datetime.today()
            data_destino_futuro = parse(calculo.dados_basicos.data_encerramento, dayfirst=True)
        elif calculo.dados_basicos.data_primeira_assembleia:
            try:
                try:
                    data_inicio = parse(calculo.dados_basicos.data_primeira_assembleia, dayfirst=True)
                except ValueError:
                    data_inicio = datetime.strptime(calculo.dados_basicos.data_primeira_assembleia, "%Y-%m-%d")
                data_destino_hoje = datetime.today()
                data_destino_futuro = data_inicio + relativedelta(
                    months=+calculo.dados_basicos.total_parcelas_plano - 1
                )
            except Exception:
                raise HTTPException(status_code=400, detail="Data da primeira assembleia inválida")
        else:
            raise HTTPException(status_code=400, detail="Data de encerramento ou data da primeira assembleia é obrigatória")

        config = calcular_config_completo(calculo)

        resultado = calcular_valor_corrigido(
            parcelas=parcelas_dict,
            config=config,
            data_destino_hoje=data_destino_hoje.date(),
            data_destino_futuro=data_destino_futuro.date()
        )

        valor_pago_total = config.valor_total_pago_extrato
        taxa_adm_devida_valor = resultado.get("taxa_adm_devida_valor", 0.0)
        valor_a_restituir = valor_pago_total - taxa_adm_devida_valor

        parcelas_corrigidas = resultado.pop("parcelas_corrigidas", [])

        percentual_honorarios = config.percentual_honorarios / 100.0
        valor_base_hoje = resultado.get("valor_com_juros_hoje", resultado.get("valor_corrigido_hoje_liquido"))
        valor_base_futuro = resultado.get("valor_com_juros_futuro", resultado.get("valor_corrigido_futuro_liquido"))

        honorarios_adv_hoje = valor_base_hoje * percentual_honorarios / 2
        honorarios_emp_hoje = valor_base_hoje * percentual_honorarios / 2
        honorarios_adv_futuro = valor_base_futuro * percentual_honorarios / 2
        honorarios_emp_futuro = valor_base_futuro * percentual_honorarios / 2

        return {
            **resultado,
            "parcelas_corrigidas": parcelas_corrigidas,
            "honorarios_advogado_hoje": round(honorarios_adv_hoje, 2),
            "honorarios_advogado_futuro": round(honorarios_adv_futuro, 2),
            "honorarios_empresa_hoje": round(honorarios_emp_hoje, 2),
            "honorarios_empresa_futuro": round(honorarios_emp_futuro, 2),
            "valor_total_pago": round(valor_pago_total, 2),
            "valor_total_a_restituir": round(valor_a_restituir, 2),
            "taxa_adm_devida_valor": round(taxa_adm_devida_valor, 2)
        }

    except Exception as e:
        print(f"❌ Erro no cálculo: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 🔵 INÍCIO — rota simples para ver o que tem na tabela extratos
@app.get("/_debug/extratos")
def _debug_extratos(db: Session = Depends(get_db)):
    try:
        rows = db.execute(
            text("SELECT id, status_documento, enviado_em, zapsign_links FROM extratos ORDER BY id DESC LIMIT 10")
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception as e:
        # Se der "no such table", as tabelas não foram criadas; suba o app depois de importar os models
        return {"erro": str(e)}

# 🔵 FIM



@app.get("/api/ml/status")
async def status_ml():
    """Mostra o status do sistema ML para o frontend"""
    try:
        from app.extracao.leitura_pdf import ML_ATIVO, ml_extrator_automatico
        
        status = {
            "ml_ativo": ML_ATIVO,
            "ml_carregado": ml_extrator_automatico is not None,
            "timestamp": "2024-11-04 16:50:00",
            "mensagem": "Sistema ML funcionando perfeitamente!"
        }
        
        if ML_ATIVO and ml_extrator_automatico:
            status.update({
                "classe": type(ml_extrator_automatico).__name__,
                "versao": getattr(ml_extrator_automatico, "versao", "1.0"),
                "melhorias_total": getattr(ml_extrator_automatico, "melhorias", 0),
                "capacidades": [
                    "Extração inteligente de nomes",
                    "Detecção automática de administradoras", 
                    "Correções automáticas em tempo real",
                    "Aprendizado contínuo"
                ],
                "administradoras_suportadas": ["KSK", "PORTO SEGURO", "OUTRAS"],
                "status_detalhado": "🚀 ML 100% OPERACIONAL!"
            })
        
        return status
        
    except Exception as e:
        return {
            "ml_ativo": False,
            "ml_carregado": False,
            "erro": str(e),
            "mensagem": "Erro ao verificar status do ML"
        }

@app.get("/api/ml/teste")
async def teste_ml():
    """Testa o sistema ML com dados de exemplo"""
    try:
        from app.extracao.leitura_pdf import ml_extrator_automatico
        
        if not ml_extrator_automatico:
            return {"erro": "ML não carregado"}
            
        # Teste com dados do Porto Seguro
        dados_teste = {"nome_cliente": "", "administradora": ""}
        texto_teste = "PORTO SEGURO ADMINISTRADORA Grupo:I248 Cota:569-01 HELLA10 CONFECCOES DE ROUPAS LTDA Contrato: 123456"
        
        resultado, mensagens = ml_extrator_automatico.melhorar_extracao_com_ml(dados_teste, texto_teste)
        
        return {
            "teste_realizado": True,
            "dados_originais": dados_teste,
            "dados_melhorados": resultado,
            "mensagens_ml": mensagens,
            "sucesso": True
        }
        
    except Exception as e:
        return {
            "teste_realizado": False,
            "erro": str(e),
            "sucesso": False
        }
