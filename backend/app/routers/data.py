"""
Router para upload e gerenciamento de dados.

Endpoints para:
- Upload de Excel/CSV (único ou múltiplo)
- Preview de dados
- Listagem de datasets
- Remoção de datasets
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..models.data import (
    DatasetInfo,
    DatasetListResponse,
    DatasetPreview,
    MultiUploadResponse,
    UploadResponse,
)
from ..services.excel_service import ExcelService, data_store

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/data", tags=["data"])

# Instância do serviço
excel_service = ExcelService(data_store)


@router.post("/upload", response_model=UploadResponse)
@limiter.limit("30/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Form(None),
    has_header: bool = Form(True),
) -> UploadResponse:
    """
    Faz upload de um arquivo Excel ou CSV.
    
    - **file**: Arquivo Excel (.xlsx, .xls) ou CSV (.csv)
    - **sheet_name**: Nome da aba (opcional, usa primeira aba se não especificado)
    - **has_header**: Se a primeira linha é cabeçalho (default: true)
    """
    if not file.filename:
        return UploadResponse(
            success=False,
            message="Nome do arquivo não fornecido",
            errors=["Nome do arquivo é obrigatório"],
        )
    
    # Lê conteúdo do arquivo
    try:
        content = await file.read()
    except Exception as e:
        logger.error(f"Erro ao ler arquivo: {type(e).__name__}")
        return UploadResponse(
            success=False,
            message="Erro ao ler arquivo",
            errors=["Não foi possível ler o arquivo"],
        )
    finally:
        await file.close()
    
    # Processa upload
    info, errors, warnings = excel_service.upload(
        filename=file.filename,
        content=content,
        sheet_name=sheet_name,
        has_header=has_header,
    )
    
    if info:
        return UploadResponse(
            success=True,
            message=f"Arquivo carregado com sucesso: {info.row_count} linhas, {info.column_count} colunas",
            dataset_id=info.id,
            dataset_info=info,
            warnings=warnings,
        )
    else:
        return UploadResponse(
            success=False,
            message="Falha ao processar arquivo",
            errors=errors,
            warnings=warnings,
        )


@router.post("/upload/multiple", response_model=MultiUploadResponse)
@limiter.limit("10/minute")
async def upload_multiple_files(
    request: Request,
    files: List[UploadFile] = File(...),
    has_header: bool = Form(True),
) -> MultiUploadResponse:
    """
    Faz upload de múltiplos arquivos Excel/CSV de uma vez.
    
    Útil para carregar dados relacionados:
    - Planilha de professores
    - Planilha de turmas
    - Planilha de horários
    - etc.
    """
    if not files:
        return MultiUploadResponse(
            success=False,
            message="Nenhum arquivo fornecido",
        )
    
    if len(files) > 10:
        return MultiUploadResponse(
            success=False,
            message="Máximo de 10 arquivos por vez",
        )
    
    uploaded = []
    failed = []
    
    for file in files:
        if not file.filename:
            failed.append({"filename": "unknown", "error": "Nome não fornecido"})
            continue
        
        try:
            content = await file.read()
            
            info, errors, warnings = excel_service.upload(
                filename=file.filename,
                content=content,
                has_header=has_header,
            )
            
            if info:
                uploaded.append(info)
            else:
                failed.append({
                    "filename": file.filename,
                    "error": errors[0] if errors else "Erro desconhecido"
                })
                
        except Exception as e:
            logger.error(f"Erro ao processar {file.filename}: {type(e).__name__}")
            failed.append({
                "filename": file.filename,
                "error": "Erro ao processar arquivo"
            })
        finally:
            await file.close()
    
    success = len(uploaded) > 0
    message = f"{len(uploaded)} arquivo(s) carregado(s)"
    if failed:
        message += f", {len(failed)} falha(s)"
    
    return MultiUploadResponse(
        success=success,
        message=message,
        uploaded=uploaded,
        failed=failed,
        total_uploaded=len(uploaded),
        total_failed=len(failed),
    )


@router.get("/datasets", response_model=DatasetListResponse)
@limiter.limit("60/minute")
async def list_datasets(request: Request) -> DatasetListResponse:
    """Lista todos os datasets carregados."""
    datasets = excel_service.list_datasets()
    return DatasetListResponse(
        datasets=datasets,
        total=len(datasets),
    )


@router.get("/datasets/{dataset_id}", response_model=DatasetInfo)
@limiter.limit("60/minute")
async def get_dataset(
    request: Request,
    dataset_id: str,
) -> DatasetInfo:
    """Retorna informações de um dataset específico."""
    info = data_store.get_info(dataset_id)
    if not info:
        raise HTTPException(status_code=404, detail="Dataset não encontrado")
    return info


@router.get("/datasets/{dataset_id}/preview", response_model=DatasetPreview)
@limiter.limit("60/minute")
async def preview_dataset(
    request: Request,
    dataset_id: str,
    max_rows: int = 50,
) -> DatasetPreview:
    """
    Retorna preview de um dataset (primeiras linhas).
    
    - **max_rows**: Número máximo de linhas (default: 50, max: 100)
    """
    max_rows = min(max_rows, 100)  # Limita a 100
    
    preview = excel_service.get_preview(dataset_id, max_rows)
    if not preview:
        raise HTTPException(status_code=404, detail="Dataset não encontrado")
    return preview


@router.delete("/datasets/{dataset_id}")
@limiter.limit("30/minute")
async def delete_dataset(
    request: Request,
    dataset_id: str,
) -> dict:
    """Remove um dataset."""
    if excel_service.delete(dataset_id):
        return {"message": "Dataset removido com sucesso"}
    raise HTTPException(status_code=404, detail="Dataset não encontrado")


@router.delete("/datasets")
@limiter.limit("10/minute")
async def clear_all_datasets(request: Request) -> dict:
    """Remove todos os datasets."""
    data_store.clear()
    return {"message": "Todos os datasets foram removidos"}

