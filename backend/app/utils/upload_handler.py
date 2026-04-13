from fastapi import UploadFile, HTTPException
from typing import Dict, Any, Optional
import os
from datetime import datetime
import fitz
from .storage import safe_file_storage, calculate_file_hash
from app.models.extrato import Extrato
from sqlalchemy.orm import Session

async def process_upload(
    upload: UploadFile,
    extrato_id: int,
    tipo: str,
    storage_root: str,
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Processa um upload de arquivo de forma segura, com validação e backup
    
    Args:
        upload: Arquivo enviado
        extrato_id: ID do extrato relacionado
        tipo: Tipo do documento (comprovante_endereco, documento_identidade, etc)
        storage_root: Diretório raiz para armazenamento
        db: Sessão do banco de dados (opcional)
    
    Returns:
        Dict com informações do arquivo processado
    """
    try:
        # 1. Validar arquivo
        if not upload.filename:
            raise HTTPException(status_code=400, detail="Nome do arquivo é obrigatório")
            
        content = await upload.read()
        if not content:
            raise HTTPException(status_code=400, detail="Arquivo vazio")
            
        # 2. Validar tamanho (5MB)
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Arquivo muito grande (máximo 5MB)")
        
        # 3. Determinar tipo do arquivo e converter se necessário
        filename = upload.filename.lower()
        mime_type = (upload.content_type or "").lower()
        
        if not (filename.endswith('.pdf') or mime_type == 'application/pdf'):
            if not (mime_type.startswith('image/') or any(filename.endswith(ext) for ext in ('.jpg','.jpeg','.png','.webp'))):
                raise HTTPException(status_code=415, detail="Formato não suportado. Envie PDF ou imagem")
                
            # Converter imagem para PDF
            try:
                content = _image_to_pdf(content)
                filename = f"{os.path.splitext(filename)[0]}.pdf"
            except Exception:
                raise HTTPException(status_code=400, detail="Falha ao converter imagem para PDF")
        
        # 4. Criar estrutura de diretórios
        year_month = datetime.now().strftime("%Y/%m")
        relative_path = f"anexos/{extrato_id}/{tipo}/{year_month}"
        dest_dir = os.path.join(storage_root, relative_path)
        
        # 5. Armazenar arquivo com verificação de integridade
        storage_info = safe_file_storage(content, dest_dir, filename)
        
        # 6. Atualizar informações no banco se necessário
        if db and Extrato:
            extrato = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()
            if extrato:
                extras = extrato.extras or {}
                if not isinstance(extras, dict):
                    extras = {}
                
                # Adicionar informações do arquivo
                if 'files' not in extras:
                    extras['files'] = {}
                if tipo not in extras['files']:
                    extras['files'][tipo] = []
                    
                file_info = {
                    'path': storage_info['path'],
                    'hash': storage_info['hash'],
                    'original_name': storage_info['original_name'],
                    'stored_name': storage_info['stored_name'],
                    'size': storage_info['size'],
                    'uploaded_at': datetime.now().isoformat(),
                }
                
                extras['files'][tipo].append(file_info)
                extrato.extras = extras
                db.commit()
        
        return {
            'success': True,
            'path': storage_info['path'],
            'hash': storage_info['hash'],
            'size': storage_info['size'],
            'filename': storage_info['stored_name']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar upload: {str(e)}")

def _image_to_pdf(image_bytes: bytes) -> bytes:
    """Converte imagem para PDF com tamanho A4"""
    A4_W, A4_H = 595, 842
    max_w, max_h = 560, 800
    doc = fitz.open()
    page = doc.new_page(width=A4_W, height=A4_H)
    rect = fitz.Rect((A4_W - max_w)/2, (A4_H - max_h)/2, (A4_W + max_w)/2, (A4_H + max_h)/2)
    try:
        page.insert_image(rect, stream=image_bytes, keep_proportion=True)
    except Exception:
        page.insert_image(rect, stream=image_bytes)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes