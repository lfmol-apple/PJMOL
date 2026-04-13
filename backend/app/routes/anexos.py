from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Depends, Request
from typing import Optional
from app.utils.upload_handler import process_upload
from app.utils.storage import STORAGE_ROOT, public_url_from_abspath
from database import get_db

router = APIRouter(prefix="/uploads", tags=["uploads"])

@router.post("/anexo")
async def upload_anexo(
    request: Request,
    arquivo: UploadFile = File(...),
    extrato_id: int = Query(..., description="ID do extrato"),
    tipo: str = Query(..., description="Tipo do documento: comprovante_endereco, documento_identidade, etc")
):
    """
    Endpoint para upload de anexos com verificação de integridade e backup automático
    """
    db = next(get_db())
    try:
        # Processar upload com segurança
        result = await process_upload(
            upload=arquivo,
            extrato_id=extrato_id,
            tipo=tipo,
            storage_root=STORAGE_ROOT,
            db=db
        )
        
        # Converter caminho para URL pública
        public_url = public_url_from_abspath(result['path'])
        
        return {
            "success": True,
            "extrato_id": extrato_id,
            "tipo": tipo,
            "filename": result['filename'],
            "size": result['size'],
            "hash": result['hash'],
            "public_url": public_url
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()