"""
Engine de otimização com OR-Tools.

Implementa solvers para problemas de:
- Alocação (assignment)
- Scheduling (cronogramas)
- Constraint Satisfaction
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum

try:
    from ortools.sat.python import cp_model
    from ortools.linear_solver import pywraplp
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False
    cp_model = None
    pywraplp = None

logger = logging.getLogger(__name__)


class SolverStatus(Enum):
    """Status do solver."""
    OPTIMAL = "optimal"
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    TIMEOUT = "timeout"
    ERROR = "error"
    NOT_SOLVED = "not_solved"


@dataclass
class OptimizationResult:
    """Resultado da otimização."""
    status: SolverStatus
    objective_value: Optional[float] = None
    solution: Optional[Dict[str, Any]] = None
    assignments: Optional[List[Dict[str, Any]]] = None
    execution_time_ms: float = 0.0
    message: str = ""
    warnings: List[str] = field(default_factory=list)


@dataclass
class ConstraintDef:
    """Definição de uma restrição para o solver."""
    id: str
    name: str
    constraint_type: str  # hard ou soft
    operator: str
    column: Optional[str] = None
    value: Optional[Any] = None
    value2: Optional[Any] = None
    group_by: Optional[str] = None
    weight: int = 10  # Para soft constraints


@dataclass 
class PreferenceDef:
    """Definição de uma preferência para o solver."""
    id: str
    name: str
    preference_type: str  # maximize, minimize, prefer_value, etc.
    column: Optional[str] = None
    target_value: Optional[Any] = None
    weight: int = 5


class AllocationSolver:
    """
    Solver para problemas de alocação usando CP-SAT do OR-Tools.
    
    Exemplo de uso:
    - Alocar professores a turmas
    - Alocar funcionários a turnos
    - Alocar recursos a tarefas
    """
    
    def __init__(
        self,
        resources: List[Dict[str, Any]],  # Ex: lista de professores
        targets: List[Dict[str, Any]],     # Ex: lista de turmas/horários
        constraints: List[ConstraintDef],
        preferences: List[PreferenceDef],
        time_limit_seconds: int = 60,
    ):
        if not ORTOOLS_AVAILABLE:
            raise RuntimeError("OR-Tools não está instalado")
        
        self.resources = resources
        self.targets = targets
        self.constraints = constraints
        self.preferences = preferences
        self.time_limit = time_limit_seconds
        
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        self.variables: Dict[Tuple[int, int], Any] = {}
        
    def _create_variables(self) -> None:
        """Cria variáveis de decisão para cada par (resource, target)."""
        for i, resource in enumerate(self.resources):
            for j, target in enumerate(self.targets):
                # Variável booleana: resource i está alocado ao target j?
                var_name = f"x_{i}_{j}"
                self.variables[(i, j)] = self.model.NewBoolVar(var_name)
    
    def _add_basic_constraints(self) -> None:
        """Adiciona restrições básicas de alocação."""
        num_resources = len(self.resources)
        num_targets = len(self.targets)
        
        # Cada target deve ter exatamente um resource (se possível)
        for j in range(num_targets):
            self.model.Add(
                sum(self.variables[(i, j)] for i in range(num_resources)) <= 1
            )
    
    def _add_constraint(self, constraint: ConstraintDef) -> None:
        """Adiciona uma restrição ao modelo."""
        num_resources = len(self.resources)
        num_targets = len(self.targets)
        
        if constraint.operator == "max_per_group" and constraint.column:
            # Máximo de alocações por recurso
            max_val = int(constraint.value) if constraint.value else 1
            for i in range(num_resources):
                self.model.Add(
                    sum(self.variables[(i, j)] for j in range(num_targets)) <= max_val
                )
                
        elif constraint.operator == "min_per_group" and constraint.column:
            # Mínimo de alocações por recurso
            min_val = int(constraint.value) if constraint.value else 0
            for i in range(num_resources):
                self.model.Add(
                    sum(self.variables[(i, j)] for j in range(num_targets)) >= min_val
                )
                
        elif constraint.operator == "unique":
            # Cada target só pode ter um resource
            for j in range(num_targets):
                self.model.Add(
                    sum(self.variables[(i, j)] for i in range(num_resources)) <= 1
                )
                
        elif constraint.operator == "no_overlap":
            # Previne sobreposição (requer informação de tempo nos dados)
            # Implementação simplificada - assumindo slots de tempo únicos
            pass
            
        elif constraint.operator == "balanced":
            # Distribuição balanceada entre recursos
            if num_resources > 0 and num_targets > 0:
                avg = num_targets // num_resources
                tolerance = max(1, avg // 2)
                for i in range(num_resources):
                    total = sum(self.variables[(i, j)] for j in range(num_targets))
                    self.model.Add(total >= max(0, avg - tolerance))
                    self.model.Add(total <= avg + tolerance)
    
    def _add_preference(self, preference: PreferenceDef) -> List:
        """Adiciona uma preferência (soft constraint) ao objetivo."""
        terms = []
        num_resources = len(self.resources)
        num_targets = len(self.targets)
        
        if preference.preference_type == "maximize":
            # Maximizar número total de alocações
            for i in range(num_resources):
                for j in range(num_targets):
                    terms.append(self.variables[(i, j)] * preference.weight)
                    
        elif preference.preference_type == "balance":
            # Penalizar desbalanceamento (via variáveis auxiliares)
            # Simplificado: já tratado em constraints
            pass
            
        return terms
    
    def solve(self) -> OptimizationResult:
        """Executa o solver e retorna o resultado."""
        import time
        start_time = time.time()
        
        try:
            # Cria variáveis
            self._create_variables()
            
            # Adiciona restrições básicas
            self._add_basic_constraints()
            
            # Adiciona restrições do usuário
            for constraint in self.constraints:
                if constraint.constraint_type == "hard":
                    self._add_constraint(constraint)
            
            # Configura função objetivo com preferências
            objective_terms = []
            for preference in self.preferences:
                terms = self._add_preference(preference)
                objective_terms.extend(terms)
            
            # Adiciona soft constraints como penalidades
            for constraint in self.constraints:
                if constraint.constraint_type == "soft":
                    # Soft constraints são tratadas como preferências
                    pass
            
            if objective_terms:
                self.model.Maximize(sum(objective_terms))
            
            # Configura timeout
            self.solver.parameters.max_time_in_seconds = self.time_limit
            
            # Resolve
            status = self.solver.Solve(self.model)
            
            execution_time = (time.time() - start_time) * 1000
            
            # Processa resultado
            if status == cp_model.OPTIMAL:
                solution_status = SolverStatus.OPTIMAL
            elif status == cp_model.FEASIBLE:
                solution_status = SolverStatus.FEASIBLE
            elif status == cp_model.INFEASIBLE:
                return OptimizationResult(
                    status=SolverStatus.INFEASIBLE,
                    execution_time_ms=execution_time,
                    message="Não foi possível encontrar uma solução. Verifique as restrições.",
                )
            else:
                return OptimizationResult(
                    status=SolverStatus.TIMEOUT,
                    execution_time_ms=execution_time,
                    message="Tempo limite excedido.",
                )
            
            # Extrai assignments
            assignments = []
            for i, resource in enumerate(self.resources):
                for j, target in enumerate(self.targets):
                    if self.solver.Value(self.variables[(i, j)]) == 1:
                        assignments.append({
                            "resource_index": i,
                            "target_index": j,
                            "resource": resource,
                            "target": target,
                        })
            
            return OptimizationResult(
                status=solution_status,
                objective_value=self.solver.ObjectiveValue() if objective_terms else None,
                assignments=assignments,
                execution_time_ms=execution_time,
                message=f"Encontradas {len(assignments)} alocações.",
            )
            
        except Exception as e:
            logger.error(f"Erro no solver: {type(e).__name__}")
            return OptimizationResult(
                status=SolverStatus.ERROR,
                execution_time_ms=(time.time() - start_time) * 1000,
                message="Erro interno no solver.",
            )


class SchedulingSolver:
    """
    Solver para problemas de scheduling usando CP-SAT.
    
    Exemplo de uso:
    - Criar grade de horários
    - Escalas de trabalho
    - Agendamento de tarefas
    """
    
    def __init__(
        self,
        tasks: List[Dict[str, Any]],
        resources: List[Dict[str, Any]],
        time_slots: List[Dict[str, Any]],
        constraints: List[ConstraintDef],
        preferences: List[PreferenceDef],
        time_limit_seconds: int = 60,
    ):
        if not ORTOOLS_AVAILABLE:
            raise RuntimeError("OR-Tools não está instalado")
        
        self.tasks = tasks
        self.resources = resources
        self.time_slots = time_slots
        self.constraints = constraints
        self.preferences = preferences
        self.time_limit = time_limit_seconds
        
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
    def solve(self) -> OptimizationResult:
        """Executa o solver de scheduling."""
        import time
        start_time = time.time()
        
        # Implementação simplificada - usar AllocationSolver como base
        # Para scheduling completo, seria necessário:
        # 1. Variáveis de intervalo (IntervalVar)
        # 2. Restrições NoOverlap
        # 3. Restrições de precedência
        
        try:
            # Por enquanto, usa alocação como aproximação
            allocation_solver = AllocationSolver(
                resources=self.resources,
                targets=[{"slot": s, "task": t} for s in self.time_slots for t in self.tasks],
                constraints=self.constraints,
                preferences=self.preferences,
                time_limit_seconds=self.time_limit,
            )
            
            result = allocation_solver.solve()
            result.message = f"Schedule criado. {result.message}"
            return result
            
        except Exception as e:
            logger.error(f"Erro no scheduler: {type(e).__name__}")
            return OptimizationResult(
                status=SolverStatus.ERROR,
                execution_time_ms=(time.time() - start_time) * 1000,
                message="Erro interno no scheduler.",
            )


def check_ortools_available() -> bool:
    """Verifica se OR-Tools está disponível."""
    return ORTOOLS_AVAILABLE

