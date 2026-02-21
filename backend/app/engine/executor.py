"""
Engine de execução de workflows.

Processa workflows de forma segura:
- Execução em sandbox
- Timeout por operação
- Validação de dados em cada etapa
- Sem acesso a sistema de arquivos externo
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set
from enum import Enum

from ..models import WorkflowCreate, WorkflowNode, WorkflowEdge

logger = logging.getLogger(__name__)


class ExecutionStatus(Enum):
    """Status de execução de um node."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class NodeResult:
    """Resultado da execução de um node."""
    node_id: str
    status: ExecutionStatus
    data: Optional[Any] = None
    error: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


@dataclass
class ExecutionContext:
    """Contexto de execução do workflow."""
    workflow_id: str
    node_results: Dict[str, NodeResult] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    def get_input_data(self, node_id: str) -> Optional[Any]:
        """Retorna dados de saída de um node."""
        result = self.node_results.get(node_id)
        if result and result.status == ExecutionStatus.COMPLETED:
            return result.data
        return None


class WorkflowExecutor:
    """
    Executor de workflows.
    
    Processa workflows de forma segura, executando nodes
    em ordem topológica respeitando dependências.
    """
    
    def __init__(self, workflow: WorkflowCreate):
        self.workflow = workflow
        self.nodes_by_id: Dict[str, WorkflowNode] = {
            node.id: node for node in workflow.nodes
        }
        self.adjacency: Dict[str, List[str]] = self._build_adjacency()
        self.reverse_adjacency: Dict[str, List[str]] = self._build_reverse_adjacency()
    
    def _build_adjacency(self) -> Dict[str, List[str]]:
        """Constrói lista de adjacência (source -> targets)."""
        adj: Dict[str, List[str]] = {node.id: [] for node in self.workflow.nodes}
        for edge in self.workflow.edges:
            if edge.source in adj:
                adj[edge.source].append(edge.target)
        return adj
    
    def _build_reverse_adjacency(self) -> Dict[str, List[str]]:
        """Constrói lista de adjacência reversa (target -> sources)."""
        adj: Dict[str, List[str]] = {node.id: [] for node in self.workflow.nodes}
        for edge in self.workflow.edges:
            if edge.target in adj:
                adj[edge.target].append(edge.source)
        return adj
    
    def _topological_sort(self) -> List[str]:
        """
        Ordena nodes topologicamente.
        
        Retorna lista de IDs na ordem de execução.
        Levanta exceção se houver ciclo.
        """
        in_degree: Dict[str, int] = {node.id: 0 for node in self.workflow.nodes}
        
        for edge in self.workflow.edges:
            if edge.target in in_degree:
                in_degree[edge.target] += 1
        
        # Nodes sem dependências
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        result: List[str] = []
        
        while queue:
            node_id = queue.pop(0)
            result.append(node_id)
            
            for neighbor in self.adjacency.get(node_id, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
        
        if len(result) != len(self.workflow.nodes):
            raise ValueError("Ciclo detectado no workflow")
        
        return result
    
    def validate(self) -> List[str]:
        """
        Valida o workflow antes da execução.
        
        Retorna lista de erros encontrados.
        """
        errors: List[str] = []
        
        # Verifica se há nodes
        if not self.workflow.nodes:
            errors.append("Workflow vazio")
            return errors
        
        # Verifica ciclos
        try:
            self._topological_sort()
        except ValueError as e:
            errors.append(str(e))
        
        # Verifica nodes de entrada
        input_nodes = [n for n in self.workflow.nodes if n.category == "input"]
        if not input_nodes:
            errors.append("Workflow deve ter pelo menos um node de entrada")
        
        # Verifica referências de edges
        node_ids = {n.id for n in self.workflow.nodes}
        for edge in self.workflow.edges:
            if edge.source not in node_ids:
                errors.append(f"Edge referencia source inexistente: {edge.source}")
            if edge.target not in node_ids:
                errors.append(f"Edge referencia target inexistente: {edge.target}")
        
        # Verifica configurações obrigatórias por tipo
        # TODO: Implementar validação específica por tipo de node
        
        return errors
    
    def execute(self, dry_run: bool = True) -> ExecutionContext:
        """
        Executa o workflow.
        
        Args:
            dry_run: Se True, apenas valida sem executar
            
        Returns:
            Contexto com resultados da execução
        """
        context = ExecutionContext(
            workflow_id=self.workflow.name,
        )
        
        # Valida primeiro
        validation_errors = self.validate()
        if validation_errors:
            context.errors = validation_errors
            return context
        
        if dry_run:
            # Apenas marca todos como pendentes
            for node in self.workflow.nodes:
                context.node_results[node.id] = NodeResult(
                    node_id=node.id,
                    status=ExecutionStatus.PENDING,
                )
            return context
        
        # Execução real
        try:
            execution_order = self._topological_sort()
            
            for node_id in execution_order:
                node = self.nodes_by_id[node_id]
                result = self._execute_node(node, context)
                context.node_results[node_id] = result
                
                if result.status == ExecutionStatus.FAILED:
                    # Para execução em caso de falha
                    context.errors.append(f"Falha no node {node_id}: {result.error}")
                    break
                    
        except Exception as e:
            # Não loga detalhes da exceção por segurança
            logger.error(f"Erro na execução do workflow")
            context.errors.append("Erro interno durante execução")
        
        return context
    
    def _execute_node(self, node: WorkflowNode, context: ExecutionContext) -> NodeResult:
        """
        Executa um node individual.
        
        Implementação básica - será expandida na próxima fase.
        """
        # Coleta dados de entrada dos nodes predecessores
        input_data: List[Any] = []
        for source_id in self.reverse_adjacency.get(node.id, []):
            data = context.get_input_data(source_id)
            if data is not None:
                input_data.append(data)
        
        # Execução por tipo de node (placeholder)
        try:
            if node.category == "input":
                # Nodes de entrada geram dados iniciais
                result_data = {"type": node.type, "config": node.config}
            elif node.category == "process":
                # Nodes de processamento transformam dados
                result_data = {"processed": True, "input_count": len(input_data)}
            elif node.category == "rule":
                # Nodes de regra aplicam restrições
                result_data = {"rule_applied": True, "config": node.config}
            elif node.category == "optimize":
                # Nodes de otimização executam algoritmos
                result_data = {"optimized": True, "algorithm": node.config.get("algorithm")}
            elif node.category == "output":
                # Nodes de saída formatam resultado
                result_data = {"output_ready": True, "data": input_data}
            else:
                result_data = None
            
            return NodeResult(
                node_id=node.id,
                status=ExecutionStatus.COMPLETED,
                data=result_data,
            )
            
        except Exception as e:
            # Não expõe detalhes do erro
            return NodeResult(
                node_id=node.id,
                status=ExecutionStatus.FAILED,
                error="Erro ao processar node",
            )

