"""
Router para endpoints de workflows.
Inclui validação, rate limiting e logging seguro.
"""

import logging
from datetime import datetime
from typing import Dict, List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import get_settings, Settings
from ..models import (
    WorkflowCreate,
    WorkflowResponse,
    WorkflowExecuteRequest,
    WorkflowExecuteResponse,
)

# Logger configurado para não vazar dados sensíveis
logger = logging.getLogger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/workflows", tags=["workflows"])

# Storage em memória (substituir por banco de dados em produção)
# NOTA: Em produção, use um banco de dados com criptografia
_workflows_store: Dict[str, dict] = {}


def _generate_workflow_id() -> str:
    """Gera ID único para workflow."""
    return f"wf_{uuid4().hex[:12]}"


@router.post("/", response_model=WorkflowResponse)
@limiter.limit("30/minute")
async def create_workflow(
    request: Request,
    workflow: WorkflowCreate,
    settings: Settings = Depends(get_settings),
) -> WorkflowResponse:
    """
    Cria um novo workflow.
    
    - Valida estrutura do workflow
    - Gera ID único
    - Armazena workflow
    """
    workflow_id = _generate_workflow_id()
    now = datetime.utcnow()
    
    stored = {
        "id": workflow_id,
        "name": workflow.name,
        "description": workflow.description,
        "nodes": [node.model_dump() for node in workflow.nodes],
        "edges": [edge.model_dump() for edge in workflow.edges],
        "created_at": now,
        "updated_at": now,
    }
    
    _workflows_store[workflow_id] = stored
    
    # Log sem dados do workflow
    logger.info(f"Workflow criado: {workflow_id}")
    
    return WorkflowResponse(**stored)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
@limiter.limit("60/minute")
async def get_workflow(
    request: Request,
    workflow_id: str,
) -> WorkflowResponse:
    """Retorna um workflow pelo ID."""
    if workflow_id not in _workflows_store:
        raise HTTPException(status_code=404, detail="Workflow não encontrado")
    
    return WorkflowResponse(**_workflows_store[workflow_id])


@router.put("/{workflow_id}", response_model=WorkflowResponse)
@limiter.limit("30/minute")
async def update_workflow(
    request: Request,
    workflow_id: str,
    workflow: WorkflowCreate,
) -> WorkflowResponse:
    """Atualiza um workflow existente."""
    if workflow_id not in _workflows_store:
        raise HTTPException(status_code=404, detail="Workflow não encontrado")
    
    stored = _workflows_store[workflow_id]
    stored.update({
        "name": workflow.name,
        "description": workflow.description,
        "nodes": [node.model_dump() for node in workflow.nodes],
        "edges": [edge.model_dump() for edge in workflow.edges],
        "updated_at": datetime.utcnow(),
    })
    
    logger.info(f"Workflow atualizado: {workflow_id}")
    
    return WorkflowResponse(**stored)


@router.delete("/{workflow_id}")
@limiter.limit("30/minute")
async def delete_workflow(
    request: Request,
    workflow_id: str,
) -> Dict[str, str]:
    """Remove um workflow."""
    if workflow_id not in _workflows_store:
        raise HTTPException(status_code=404, detail="Workflow não encontrado")
    
    del _workflows_store[workflow_id]
    
    logger.info(f"Workflow removido: {workflow_id}")
    
    return {"message": "Workflow removido com sucesso"}


@router.get("/", response_model=List[WorkflowResponse])
@limiter.limit("60/minute")
async def list_workflows(
    request: Request,
) -> List[WorkflowResponse]:
    """Lista todos os workflows."""
    return [WorkflowResponse(**wf) for wf in _workflows_store.values()]


@router.post("/execute", response_model=WorkflowExecuteResponse)
@limiter.limit("10/minute")
async def execute_workflow(
    request: Request,
    execute_request: WorkflowExecuteRequest,
) -> WorkflowExecuteResponse:
    """
    Executa um workflow.
    
    Por enquanto, apenas valida o workflow.
    A execução real será implementada na próxima fase.
    """
    workflow = execute_request.workflow
    errors: List[str] = []
    warnings: List[str] = []
    
    # Validação básica
    if len(workflow.nodes) == 0:
        errors.append("Workflow deve ter pelo menos um node")
    
    # Verifica se há nodes de entrada
    input_nodes = [n for n in workflow.nodes if n.category == "input"]
    if len(input_nodes) == 0:
        warnings.append("Workflow não tem nodes de entrada")
    
    # Verifica se há nodes de saída
    output_nodes = [n for n in workflow.nodes if n.category == "output"]
    if len(output_nodes) == 0:
        warnings.append("Workflow não tem nodes de saída")
    
    # Verifica conectividade (simplificado)
    node_ids = {n.id for n in workflow.nodes}
    for edge in workflow.edges:
        if edge.source not in node_ids:
            errors.append(f"Edge referencia node inexistente: {edge.source}")
        if edge.target not in node_ids:
            errors.append(f"Edge referencia node inexistente: {edge.target}")
    
    # Verifica ciclos (simplificado)
    # TODO: Implementar detecção de ciclos mais robusta
    
    if errors:
        return WorkflowExecuteResponse(
            success=False,
            message="Workflow inválido",
            errors=errors,
            warnings=warnings,
        )
    
    if execute_request.dry_run:
        return WorkflowExecuteResponse(
            success=True,
            message="Validação concluída com sucesso (dry run)",
            warnings=warnings,
        )
    
    # Execução real será implementada na próxima fase
    return WorkflowExecuteResponse(
        success=True,
        message="Execução simulada com sucesso. Engine completa em desenvolvimento.",
        result={"nodes_processed": len(workflow.nodes)},
        warnings=warnings,
    )

