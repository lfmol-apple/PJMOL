# app/utils/zapsign.py
import base64
import os
from typing import Dict, Optional, List

import requests

ZAPSIGN_DOCS_URL = "https://api.zapsign.com.br/api/v1/docs/"
HTTP_TIMEOUT = 60  # segundos
DEFAULT_ZAPSIGN_SANDBOX = (os.getenv("ZAPSIGN_SANDBOX") or "").strip().lower() in {"1", "true", "yes", "on"}

def _only_digits(s: Optional[str]) -> str:
    return "".join(ch for ch in (s or "") if ch.isdigit())

def _b64_from_file(path: str) -> str:
    try:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    except FileNotFoundError:
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")


def build_advogado_webhook_url(advogado) -> str:
    """
    Monta a URL completa do webhook para um advogado específico.
    Aceita instâncias do modelo ou objetos equivalentes com os atributos necessários.
    """
    base = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")
    if not base:
        raise RuntimeError("PUBLIC_BASE_URL não configurada no servidor.")

    token = getattr(advogado, "webhook_path_token", None)
    if not token:
        raise RuntimeError("Advogado sem webhook_path_token configurado.")

    url = f"{base}/assinaturas/hook/{token}"
    secret = getattr(advogado, "webhook_secret", None)
    if secret:
        url = f"{url}?secret={secret}"
    return url

def enviar_documentos_consolidados_para_assinatura(
    nome_cliente: str,
    telefone_cliente: Optional[str],
    caminho_contrato: str,
    caminho_procuracao: str,
    api_key: str,
    *,
    webhook_url: Optional[str] = None,
    require_selfie_photo: bool = False,  # ✅ Desativado: não pede mais selfie
    require_document_photo: bool = False,  # Alterado: não pede mais foto do documento
    selfie_validation_type: str = "none",
    sandbox: bool = False,
    metadata: Optional[Dict[str, str]] = None,
) -> Dict:
    """
    Cria o documento principal (CONTRATO) e anexa a PROCURAÇÃO como documento extra.
    Ativa apenas selfie para o signatário (sem foto do documento RG).

    Retorna:
      {
        "bundle_id": None,
        "contrato_id": <TOKEN_DO_DOCUMENTO>,
        "procuracao_id": None,
        "signer_token": <TOKEN_DO_SIGNATARIO_OPCIONAL>,
        "links": {"principal": <URL_ASSINATURA>},
        "raw": {"create": {...}, "upload_extra": {...}},
      }
    """
    # 1) PDFs -> base64
    contrato_b64 = _b64_from_file(caminho_contrato)
    procuracao_b64 = _b64_from_file(caminho_procuracao)

    # 2) Cabeçalhos
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 3) Signer com selfie apenas (sem RG) - telefone é opcional
    phone_number = _only_digits(telefone_cliente)
    signer: Dict = {
        "name": nome_cliente,
        "auth_mode": "assinaturaTela",
        "require_selfie_photo": bool(require_selfie_photo),
        "require_document_photo": bool(require_document_photo),
        "selfie_validation_type": selfie_validation_type,
    }
    if phone_number:
        signer.update({
            "phone_country": "55",
            "phone_number": phone_number,
        })

    # Posicionamento por placeholder (âncora) para o CLIENTE
    signer["signature_placement"] = "<<assinatura_cliente>>"
    signers: List[Dict] = [signer]

    # 4) Metadata (ZapSign espera lista de {key, value})
    meta_arr = [{"key": str(k), "value": str(v)} for k, v in (metadata or {}).items()] if metadata else None

    # 5) Corpo do create
    data_contrato: Dict = {
        "base64_pdf": contrato_b64,
        "name": f"{nome_cliente} - Contrato",
        "external_id": f"{nome_cliente}-Contrato",
        "sandbox": bool(sandbox),
        "signers": signers,
    }
    if meta_arr:
        data_contrato["metadata"] = meta_arr
    if webhook_url:
        data_contrato["webhook_url"] = webhook_url

    # 6) Cria documento principal (CONTRATO)
    try:
        resp = requests.post(ZAPSIGN_DOCS_URL, headers=headers, json=data_contrato, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"Erro ao criar documento no ZapSign: {e.response.status_code} - {e.response.text}")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Erro de rede ao criar documento ZapSign: {e}")

    doc_json = resp.json() or {}
    doc_token = doc_json.get("token")
    if not doc_token:
        raise RuntimeError("Resposta ZapSign sem token do documento principal.")

    # 7) Anexa a PROCURAÇÃO como documento extra
    url_anexo = f"{ZAPSIGN_DOCS_URL}{doc_token}/upload-extra-doc/"
    data_procuracao = {"name": f"{nome_cliente} - Procuração", "base64_pdf": procuracao_b64}
    try:
        resp_extra = requests.post(url_anexo, headers=headers, json=data_procuracao, timeout=HTTP_TIMEOUT)
        resp_extra.raise_for_status()
    except requests.exceptions.HTTPError as e:
        raise RuntimeError(f"Erro ao anexar procuração: {e.response.status_code} - {e.response.text}")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Erro de rede ao anexar procuração: {e}")

    # 8) Dados úteis do primeiro signatário (se houver)
    signer_token = None
    link_assinatura = None
    try:
        first_signer = (doc_json.get("signers") or [{}])[0] or {}
        signer_token = first_signer.get("token")
        link_assinatura = first_signer.get("sign_url")
    except Exception:
        pass

    # 9) Retorno padronizado
    return {
        "bundle_id": None,
        "contrato_id": doc_token,  # Token do documento principal (contrato)
        "procuracao_id": None,
        "signer_token": signer_token,
        "links": {"principal": link_assinatura} if link_assinatura else {},
        "raw": {
            "create": doc_json,
            "upload_extra": (resp_extra.json() if getattr(resp_extra, "text", "") else {}),
        },
    }
