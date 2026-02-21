"""
Configurações do backend Tailon.
Carrega variáveis de ambiente de forma segura.
"""

from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configurações da aplicação carregadas de variáveis de ambiente."""
    
    # Ambiente
    environment: str = "development"
    debug: bool = False
    
    # CORS
    cors_origins: str = "http://localhost:3000"
    
    # Segurança
    secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    
    # Rate Limiting
    rate_limit_per_minute: int = 60
    
    # Upload
    max_upload_size_mb: int = 10
    
    # Logs
    log_level: str = "INFO"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Retorna lista de origens CORS permitidas."""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    @property
    def max_upload_size_bytes(self) -> int:
        """Retorna tamanho máximo de upload em bytes."""
        return self.max_upload_size_mb * 1024 * 1024
    
    @property
    def is_production(self) -> bool:
        """Verifica se está em produção."""
        return self.environment == "production"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Retorna instância cacheada das configurações."""
    return Settings()

