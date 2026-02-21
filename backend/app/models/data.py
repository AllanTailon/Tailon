"""
Modelos para dados de entrada (Excel, CSV, etc.)
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator
import re


class ColumnInfo(BaseModel):
    """Informações sobre uma coluna."""
    name: str
    dtype: str  # string, number, date, boolean
    sample_values: List[Any] = Field(default_factory=list, max_length=5)
    null_count: int = 0
    unique_count: int = 0


class DatasetInfo(BaseModel):
    """Informações sobre um dataset carregado."""
    id: str
    name: str
    original_filename: str
    sheet_name: Optional[str] = None
    row_count: int
    column_count: int
    columns: List[ColumnInfo]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    @field_validator("id", "name")
    @classmethod
    def validate_safe_string(cls, v: str) -> str:
        """Valida que não contém caracteres perigosos."""
        if re.search(r'[<>"\'/\\]', v):
            raise ValueError("Caracteres especiais não permitidos")
        return v


class DatasetPreview(BaseModel):
    """Preview de um dataset (primeiras linhas)."""
    id: str
    name: str
    columns: List[str]
    rows: List[Dict[str, Any]] = Field(default_factory=list, max_length=100)
    total_rows: int


class UploadResponse(BaseModel):
    """Resposta do upload de arquivo."""
    success: bool
    message: str
    dataset_id: Optional[str] = None
    dataset_info: Optional[DatasetInfo] = None
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class DatasetListResponse(BaseModel):
    """Lista de datasets disponíveis."""
    datasets: List[DatasetInfo]
    total: int


class MultiUploadResponse(BaseModel):
    """Resposta de upload de múltiplos arquivos."""
    success: bool
    message: str
    uploaded: List[DatasetInfo] = Field(default_factory=list)
    failed: List[Dict[str, str]] = Field(default_factory=list)
    total_uploaded: int = 0
    total_failed: int = 0

