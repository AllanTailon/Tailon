"""
Modelos Pydantic para workflows.
Validação rigorosa para segurança.
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator
import re


# Tipos de categorias permitidas
NodeCategory = Literal["input", "process", "rule", "optimize", "output"]

# Tipos de blocos permitidos (whitelist)
ALLOWED_BLOCK_TYPES = {
    "excel-input", "manual-input",
    "filter", "group",
    "constraints", "preferences",  # Atualizados
    "allocate", "schedule",  # Novo bloco schedule
    "excel-output", "preview"
}

# Operadores de restrição permitidos
CONSTRAINT_OPERATORS = {
    "max", "min", "equals", "not_equals", 
    "less_than", "greater_than", "between",
    "unique", "no_overlap", "consecutive",
    "max_per_group", "min_per_group", "balanced"
}

# Tipos de preferência permitidos
PREFERENCE_TYPES = {
    "maximize", "minimize", "prefer_value", "avoid_value", "balance"
}


class Position(BaseModel):
    """Posição de um node no canvas."""
    x: float = Field(..., ge=-10000, le=10000)
    y: float = Field(..., ge=-10000, le=10000)


class Constraint(BaseModel):
    """Representa uma restrição individual."""
    id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    type: Literal["hard", "soft"] = "hard"
    operator: str = Field(..., min_length=1, max_length=50)
    column: Optional[str] = Field(None, max_length=100)
    value: Optional[Union[str, int, float]] = None
    value2: Optional[Union[str, int, float]] = None  # Para operador 'between'
    groupBy: Optional[str] = Field(None, max_length=100)
    weight: Optional[int] = Field(None, ge=1, le=10)
    
    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("ID deve conter apenas letras, números, _ e -")
        return v
    
    @field_validator("operator")
    @classmethod
    def validate_operator(cls, v: str) -> str:
        if v not in CONSTRAINT_OPERATORS:
            raise ValueError(f"Operador não permitido: {v}")
        return v


class Preference(BaseModel):
    """Representa uma preferência individual."""
    id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    type: str = Field(..., min_length=1, max_length=50)
    column: Optional[str] = Field(None, max_length=100)
    targetValue: Optional[Union[str, int, float]] = None
    weight: int = Field(default=5, ge=1, le=10)
    
    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("ID deve conter apenas letras, números, _ e -")
        return v
    
    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in PREFERENCE_TYPES:
            raise ValueError(f"Tipo de preferência não permitido: {v}")
        return v


class NodeConfig(BaseModel):
    """Configuração de um node - validação flexível mas segura."""
    
    # Campos específicos conhecidos
    constraints: Optional[List[Constraint]] = None
    preferences: Optional[List[Preference]] = None
    
    class Config:
        extra = "allow"  # Permite campos extras
    
    @field_validator("*", mode="before")
    @classmethod
    def sanitize_values(cls, v: Any) -> Any:
        """Sanitiza valores de string para prevenir injeção."""
        if isinstance(v, str):
            if len(v) > 1000:
                raise ValueError("Valor muito longo (máx 1000 caracteres)")
            if re.search(r'<[^>]*>', v):
                raise ValueError("Tags HTML não são permitidas")
        return v


class WorkflowNode(BaseModel):
    """Representa um node no workflow."""
    id: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., min_length=1, max_length=50)
    category: NodeCategory
    label: str = Field(..., min_length=1, max_length=100)
    position: Position
    config: Dict[str, Any] = Field(default_factory=dict)
    
    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        """Valida formato do ID."""
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("ID deve conter apenas letras, números, _ e -")
        return v
    
    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Valida tipo do bloco contra whitelist."""
        if v not in ALLOWED_BLOCK_TYPES:
            raise ValueError(f"Tipo de bloco não permitido: {v}")
        return v


class WorkflowEdge(BaseModel):
    """Representa uma conexão entre nodes."""
    id: str = Field(..., min_length=1, max_length=100)
    source: str = Field(..., min_length=1, max_length=100)
    target: str = Field(..., min_length=1, max_length=100)
    
    @field_validator("id", "source", "target")
    @classmethod
    def validate_ids(cls, v: str) -> str:
        """Valida formato dos IDs."""
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("ID deve conter apenas letras, números, _ e -")
        return v


class WorkflowCreate(BaseModel):
    """Schema para criar/atualizar um workflow."""
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    nodes: List[WorkflowNode] = Field(default_factory=list, max_length=500)
    edges: List[WorkflowEdge] = Field(default_factory=list, max_length=1000)
    
    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        """Sanitiza nome do workflow."""
        v = re.sub(r'[<>"\'/\\]', '', v)
        return v.strip()
    
    @field_validator("nodes")
    @classmethod
    def validate_nodes(cls, v: List[WorkflowNode]) -> List[WorkflowNode]:
        """Valida que não há IDs duplicados."""
        ids = [node.id for node in v]
        if len(ids) != len(set(ids)):
            raise ValueError("IDs de nodes devem ser únicos")
        return v
    
    @field_validator("edges")
    @classmethod
    def validate_edges(cls, v: List[WorkflowEdge], info) -> List[WorkflowEdge]:
        """Valida que edges referenciam nodes existentes."""
        ids = [edge.id for edge in v]
        if len(ids) != len(set(ids)):
            raise ValueError("IDs de edges devem ser únicos")
        return v


class WorkflowResponse(BaseModel):
    """Schema de resposta para workflow."""
    id: str
    name: str
    description: Optional[str] = None
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class WorkflowExecuteRequest(BaseModel):
    """Request para executar um workflow."""
    workflow: WorkflowCreate
    dry_run: bool = Field(default=True, description="Se True, apenas valida sem executar")
    input_data: Optional[Dict[str, Any]] = Field(None, description="Dados de entrada para o workflow")


class ExecutionResult(BaseModel):
    """Resultado detalhado da execução."""
    node_id: str
    status: Literal["pending", "running", "completed", "failed", "skipped"]
    data: Optional[Any] = None
    error: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    execution_time_ms: Optional[float] = None


class WorkflowExecuteResponse(BaseModel):
    """Response da execução de um workflow."""
    success: bool
    message: str
    result: Optional[Dict[str, Any]] = None
    node_results: Optional[List[ExecutionResult]] = None
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    total_execution_time_ms: Optional[float] = None
    # Saída Excel (quando houver bloco excel-output)
    output_file_base64: Optional[str] = None
    output_filename: Optional[str] = None
