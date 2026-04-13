'''Cache simples em memória para listagem de extratos'''
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import json

class ExtratoCache:
    def __init__(self, ttl_seconds: int = 30):
        self._cache: Optional[Dict[str, Any]] = None
        self._timestamp: Optional[datetime] = None
        self._ttl = timedelta(seconds=ttl_seconds)
    
    def get(self) -> Optional[List[Dict[str, Any]]]:
        '''Retorna cache se válido, None se expirado'''
        if self._cache is None or self._timestamp is None:
            return None
        
        if datetime.now() - self._timestamp > self._ttl:
            self._cache = None
            self._timestamp = None
            return None
        
        return self._cache
    
    def set(self, data: List[Dict[str, Any]]):
        '''Armazena dados no cache'''
        self._cache = data
        self._timestamp = datetime.now()
    
    def invalidate(self):
        '''Invalida cache (usar ao criar/editar/deletar extratos)'''
        self._cache = None
        self._timestamp = None

# Instância global
_global_cache = ExtratoCache(ttl_seconds=30)

def get_cache():
    return _global_cache
