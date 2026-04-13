import bcrypt

# Gera o hash da senha usando bcrypt diretamente
def gerar_hash_senha(senha: str) -> str:
    # Bcrypt tem limite de 72 bytes, truncar se necessário
    senha_bytes = senha.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    hash_bytes = bcrypt.hashpw(senha_bytes, salt)
    return hash_bytes.decode('utf-8')

# Verifica se a senha fornecida bate com o hash armazenado
def verificar_senha(senha: str, senha_hash: str) -> bool:
    try:
        # Bcrypt tem limite de 72 bytes, truncar se necessário
        senha_bytes = senha.encode('utf-8')[:72]
        hash_bytes = senha_hash.encode('utf-8')
        return bcrypt.checkpw(senha_bytes, hash_bytes)
    except Exception as e:
        print(f"[verificar_senha] Erro: {e}")
        return False
