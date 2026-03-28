"""
Router para endpoints de workflows.
Inclui validação, rate limiting e logging seguro.
"""

import logging
import time
from datetime import datetime
from typing import Dict, List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..config import get_settings, Settings
from ..engine.executor import (
    WorkflowExecutor,
    ExecutionStatus,
    serialize_execution_context_for_response,
)
from ..models import (
    WorkflowCreate,
    WorkflowResponse,
    WorkflowExecuteRequest,
    WorkflowExecuteResponse,
    ExecutionResult,
)
from ..services.excel_service import data_store

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
    Executa um workflow (pandas + data_store + OR-Tools no bloco Alocar).

    Com `dry_run: true`, apenas valida. Com `dry_run: false`, executa nodes na
    ordem topológica e pode retornar Excel em base64 (`output_file_base64`).
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

    t0 = time.perf_counter()
    executor = WorkflowExecutor(workflow, data_store=data_store)
    context = executor.execute(dry_run=False)
    total_ms = (time.perf_counter() - t0) * 1000

    if context.errors:
        node_results_raw, summary, b64, fname = serialize_execution_context_for_response(context)
        exec_results = [
            ExecutionResult(
                node_id=r["node_id"],
                status=r["status"],
                data=r.get("data"),
                error=r.get("error"),
                warnings=r.get("warnings") or [],
                execution_time_ms=r.get("execution_time_ms"),
            )
            for r in node_results_raw
        ]
        return WorkflowExecuteResponse(
            success=False,
            message="Falha na execução do workflow",
            errors=context.errors,
            warnings=context.warnings + warnings,
            node_results=exec_results,
            result=summary,
            total_execution_time_ms=total_ms,
            output_file_base64=b64,
            output_filename=fname,
        )

    node_results_raw, summary, b64, fname = serialize_execution_context_for_response(context)
    exec_results = [
        ExecutionResult(
            node_id=r["node_id"],
            status=r["status"],
            data=r.get("data"),
            error=r.get("error"),
            warnings=r.get("warnings") or [],
            execution_time_ms=r.get("execution_time_ms"),
        )
        for r in node_results_raw
    ]

    result_payload: Dict = {
        "workflow_name": workflow.name,
        "nodes_completed": sum(
            1 for nr in context.node_results.values() if nr.status == ExecutionStatus.COMPLETED
        ),
    }
    if summary:
        result_payload.update(summary)

    return WorkflowExecuteResponse(
        success=True,
        message="Workflow executado com sucesso",
        result=result_payload,
        node_results=exec_results,
        warnings=context.warnings + warnings,
        total_execution_time_ms=total_ms,
        output_file_base64=b64,
        output_filename=fname,
    )

