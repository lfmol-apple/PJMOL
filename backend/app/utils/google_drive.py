# app/utils/google_drive.py
import os
import pickle
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.auth.transport.requests import Request
from googleapiclient.errors import HttpError

# 🔐 Escopos mínimos
SCOPES = ['https://www.googleapis.com/auth/drive.file']

# Flags de execução
DRIVE_UPLOAD = os.getenv("DRIVE_UPLOAD", "on").lower() == "on"      # off → não tenta Drive
DRIVE_STRICT = os.getenv("DRIVE_STRICT", "off").lower() == "on"     # on → erro do Drive quebra

CREDENTIALS_PATH = os.path.join(os.getcwd(), "credentials.json")
TOKEN_PATH = os.path.join(os.getcwd(), "token_drive_oauth.pickle")
PASTA_DRIVE_ID = os.getenv("PASTA_DRIVE_ID")  # opcional

def _fallback_url(local_path: str) -> str:
    # o main.py serve estáticos de /documentos
    base = os.path.basename(local_path)
    return f"/documentos/{base}"

def _get_drive_service():
    creds = None
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, 'rb') as token:
            creds = pickle.load(token)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                # token inválido/revogado
                raise RuntimeError("Token inválido/expirado para o Google Drive. Apague token_drive_oauth.pickle e reautorize.") from e
        else:
            if not os.path.exists(CREDENTIALS_PATH):
                raise RuntimeError("credentials.json não encontrado para Google Drive.")
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, 'wb') as token:
            pickle.dump(creds, token)

    service = build('drive', 'v3', credentials=creds)
    return service

def upload_pdf_to_drive(caminho_pdf: str, nome_destino: str) -> str:
    """
    Retorna URL de download/visualização.
    Se DRIVE_UPLOAD=off, retorna URL local (/documentos/...).
    Se Drive falhar e DRIVE_STRICT=off, retorna URL local como fallback.
    """
    if not DRIVE_UPLOAD:
        return _fallback_url(caminho_pdf)

    try:
        service = _get_drive_service()
        file_metadata = {'name': nome_destino}
        if PASTA_DRIVE_ID:
            file_metadata['parents'] = [PASTA_DRIVE_ID]

        media = MediaFileUpload(caminho_pdf, mimetype='application/pdf')
        file = service.files().create(
            body=file_metadata, media_body=media, fields='id'
        ).execute()
        file_id = file.get('id')

        # torna disponível por link (se desejar; opcional)
        try:
            service.permissions().create(
                fileId=file_id,
                body={'type': 'anyone', 'role': 'reader'}
            ).execute()
        except Exception:
            pass

        return f"https://drive.google.com/uc?export=download&id={file_id}"

    except HttpError as e:
        # mensagens comuns para diagnosticar
        if e.resp.status == 401 or "invalid_grant" in str(e):
            msg = "Drive: token inválido/expirado. Apague token_drive_oauth.pickle e reautorize."
        else:
            msg = f"Drive: erro HTTP {e.resp.status}."

        if DRIVE_STRICT:
            raise RuntimeError(msg) from e
        return _fallback_url(caminho_pdf)

    except Exception as e:
        if DRIVE_STRICT:
            raise
        return _fallback_url(caminho_pdf)
