"""
Backend Tailon - API para sistema de otimização visual.

Segurança implementada:
- CORS configurável
- Rate limiting
- Validação rigorosa de entrada
- Logging sem dados sensíveis
- Headers de segurança
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import get_settings
from .routers import workflows_router, data_router

# Configuração de logging seguro
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    # Não loga dados de request/response por padrão
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gerencia ciclo de vida da aplicação."""
    settings = get_settings()
    logger.info(f"Iniciando Tailon API em modo {settings.environment}")
    
    if settings.secret_key == "CHANGE_ME_IN_PRODUCTION" and settings.is_production:
        logger.critical("ALERTA: SECRET_KEY não configurada em produção!")
    
    yield
    
    logger.info("Encerrando Tailon API")


# Rate limiter global
limiter = Limiter(key_func=get_remote_address)

# Cria aplicação
app = FastAPI(
    title="Tailon API",
    description="API para sistema de otimização e alocação visual",
    version="1.0.0",
    lifespan=lifespan,
    # Desabilita docs em produção se necessário
    # docs_url=None if get_settings().is_production else "/docs",
    # redoc_url=None if get_settings().is_productiofn else "/redoc",
)

# Configura rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configura CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    max_age=600,  # Cache preflight por 10 minutos
)


# Middleware de segurança
@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Adiciona headers de segurança às respostas."""
    response = await call_next(request)
    
    # Headers de segurança
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # Em produção, adicionar CSP mais restritivo
    if settings.is_production:
        response.headers["Content-Security-Policy"] = "default-src 'self'"
    
    return response


# Handler global de erros
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handler global que não vaza informações sensíveis."""
    # Log interno com detalhes
    logger.error(f"Erro não tratado: {type(exc).__name__}", exc_info=True)
    
    # Resposta genérica para o cliente
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Erro interno do servidor",
            "message": "Ocorreu um erro inesperado. Tente novamente mais tarde.",
        },
    )


# Registra routers
app.include_router(workflows_router, prefix="/api/v1")
app.include_router(data_router, prefix="/api/v1")


# Endpoints básicos
@app.get("/")
async def root():
    """Endpoint raiz."""
    return {
        "name": "Tailon API",
        "version": "1.0.0",
        "status": "online",
    }


@app.get("/health")
async def health_check():
    """Health check para monitoramento."""
    return {"status": "healthy"}


@app.get("/api/v1")
async def api_info():
    """Informações da API."""
    return {
        "version": "1.0.0",
        "endpoints": {
            "workflows": "/api/v1/workflows",
            "data": "/api/v1/data",
        },
    }

