"""
Engine de execução de workflows.

Processa workflows com DataFrames reais (pandas) e data_store para Excel.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from ..models import WorkflowCreate, WorkflowNode
from ..services.excel_service import DataStore
from ..services.excel_export import dataframe_to_xlsx_bytes, safe_sheet_name

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
    execution_time_ms: Optional[float] = None


@dataclass
class ExecutionContext:
    """Contexto de execução do workflow."""
    workflow_id: str
    node_results: Dict[str, NodeResult] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    # Metadados por node (ex.: constraints acumuladas)
    node_metadata: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    # Excel gerado pelo último excel-output (bytes + nome)
    output_excel_bytes: Optional[bytes] = None
    output_excel_filename: Optional[str] = None

    def get_input_data(self, node_id: str) -> Optional[Any]:
        """Retorna dados de saída de um node."""
        result = self.node_results.get(node_id)
        if result and result.status == ExecutionStatus.COMPLETED:
            return result.data
        return None


def _is_dataframe_payload(obj: Any) -> bool:
    return isinstance(obj, pd.DataFrame)


def _first_dataframe(inputs: List[Any]) -> Optional[pd.DataFrame]:
    for x in inputs:
        if isinstance(x, pd.DataFrame):
            return x
    return None


def _all_dataframes(inputs: List[Any]) -> List[pd.DataFrame]:
    return [x for x in inputs if isinstance(x, pd.DataFrame)]


def _serialize_dataframe_for_json(df: pd.DataFrame, max_rows: int = 50) -> Dict[str, Any]:
    """Preview seguro para resposta JSON."""
    preview = df.head(max_rows)
    records = preview.replace({pd.NA: None}).to_dict(orient="records")
    return {
        "rows": int(len(df)),
        "columns": list(df.columns.astype(str)),
        "preview_rows": len(records),
        "preview": records,
    }


class WorkflowExecutor:
    """
    Executor de workflows com acesso opcional ao DataStore (datasets carregados).
    """

    def __init__(self, workflow: WorkflowCreate, data_store: Optional[DataStore] = None):
        self.workflow = workflow
        self.data_store = data_store
        self.nodes_by_id: Dict[str, WorkflowNode] = {
            node.id: node for node in workflow.nodes
        }
        self.adjacency: Dict[str, List[str]] = self._build_adjacency()
        self.reverse_adjacency: Dict[str, List[str]] = self._build_reverse_adjacency()

    def _build_adjacency(self) -> Dict[str, List[str]]:
        adj: Dict[str, List[str]] = {node.id: [] for node in self.workflow.nodes}
        for edge in self.workflow.edges:
            if edge.source in adj:
                adj[edge.source].append(edge.target)
        return adj

    def _build_reverse_adjacency(self) -> Dict[str, List[str]]:
        adj: Dict[str, List[str]] = {node.id: [] for node in self.workflow.nodes}
        for edge in self.workflow.edges:
            if edge.target in adj:
                adj[edge.target].append(edge.source)
        return adj

    def _topological_sort(self) -> List[str]:
        in_degree: Dict[str, int] = {node.id: 0 for node in self.workflow.nodes}
        for edge in self.workflow.edges:
            if edge.target in in_degree:
                in_degree[edge.target] += 1
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
        errors: List[str] = []
        if not self.workflow.nodes:
            errors.append("Workflow vazio")
            return errors
        try:
            self._topological_sort()
        except ValueError as e:
            errors.append(str(e))
        input_nodes = [n for n in self.workflow.nodes if n.category == "input"]
        if not input_nodes:
            errors.append("Workflow deve ter pelo menos um node de entrada")
        node_ids = {n.id for n in self.workflow.nodes}
        for edge in self.workflow.edges:
            if edge.source not in node_ids:
                errors.append(f"Edge referencia source inexistente: {edge.source}")
            if edge.target not in node_ids:
                errors.append(f"Edge referencia target inexistente: {edge.target}")
        return errors

    def execute(self, dry_run: bool = True) -> ExecutionContext:
        context = ExecutionContext(workflow_id=self.workflow.name)
        validation_errors = self.validate()
        if validation_errors:
            context.errors = validation_errors
            return context
        if dry_run:
            for node in self.workflow.nodes:
                context.node_results[node.id] = NodeResult(
                    node_id=node.id,
                    status=ExecutionStatus.PENDING,
                )
            return context
        try:
            execution_order = self._topological_sort()
            for node_id in execution_order:
                t0 = time.perf_counter()
                node = self.nodes_by_id[node_id]
                result = self._execute_node(node, context)
                result.execution_time_ms = (time.perf_counter() - t0) * 1000
                context.node_results[node_id] = result
                if result.warnings:
                    context.warnings.extend(result.warnings)
                if result.status == ExecutionStatus.FAILED:
                    context.errors.append(
                        f"Falha no node {node_id} ({node.type}): {result.error}"
                    )
                    break
        except Exception:
            logger.exception("Erro na execução do workflow")
            context.errors.append("Erro interno durante execução")
        return context

    def _collect_inputs(self, node_id: str, context: ExecutionContext) -> List[Any]:
        out: List[Any] = []
        for source_id in self.reverse_adjacency.get(node_id, []):
            data = context.get_input_data(source_id)
            if data is not None:
                out.append(data)
        return out

    def _execute_node(self, node: WorkflowNode, context: ExecutionContext) -> NodeResult:
        inputs = self._collect_inputs(node.id, context)
        try:
            return self._dispatch_node(node, inputs, context)
        except ValueError as ve:
            return NodeResult(
                node_id=node.id,
                status=ExecutionStatus.FAILED,
                error=str(ve),
            )
        except Exception:
            logger.exception("Erro no node %s", node.type)
            return NodeResult(
                node_id=node.id,
                status=ExecutionStatus.FAILED,
                error="Erro ao processar node",
            )

    def _dispatch_node(
        self, node: WorkflowNode, inputs: List[Any], context: ExecutionContext
    ) -> NodeResult:
        nt = node.type
        cfg = node.config or {}

        if nt == "excel-input":
            return self._node_excel_input(node, cfg)
        if nt == "manual-input":
            return self._node_manual_input(node, cfg)
        if nt == "filter":
            return self._node_filter(node, inputs, cfg)
        if nt == "group":
            return self._node_group(node, inputs, cfg)
        if nt == "constraints":
            return self._node_constraints(node, inputs, cfg, context)
        if nt == "preferences":
            return self._node_preferences(node, inputs, cfg, context)
        if nt == "allocate":
            return self._node_allocate(node, inputs, cfg, context)
        if nt == "schedule":
            return self._node_schedule(node)
        if nt == "preview":
            return self._node_preview(node, inputs, cfg)
        if nt == "excel-output":
            return self._node_excel_output(node, inputs, cfg, context)

        # Fallback por categoria
        if node.category == "input":
            return NodeResult(node.id, ExecutionStatus.FAILED, error=f"Tipo não suportado: {nt}")
        if node.category == "process":
            df = _first_dataframe(inputs)
            if df is None:
                return NodeResult(node.id, ExecutionStatus.FAILED, error="Entrada sem DataFrame")
            return NodeResult(node.id, ExecutionStatus.COMPLETED, data=df.copy())
        if node.category == "rule":
            df = _first_dataframe(inputs)
            if df is None:
                return NodeResult(node.id, ExecutionStatus.FAILED, error="Entrada sem DataFrame")
            return NodeResult(node.id, ExecutionStatus.COMPLETED, data=df.copy())
        if node.category == "optimize":
            return self._node_allocate(node, inputs, cfg, context)
        if node.category == "output":
            return self._node_preview(node, inputs, cfg)

        return NodeResult(
            node.id,
            ExecutionStatus.FAILED,
            error=f"Tipo de node desconhecido: {nt}",
        )

    def _node_excel_input(self, node: WorkflowNode, cfg: Dict[str, Any]) -> NodeResult:
        ds_id = cfg.get("datasetId")
        if not ds_id:
            return NodeResult(
                node.id,
                ExecutionStatus.FAILED,
                error="Configure um dataset (datasetId) no bloco Importar Excel",
            )
        if not self.data_store:
            return NodeResult(
                node.id,
                ExecutionStatus.FAILED,
                error="Serviço de dados indisponível no servidor",
            )
        df = self.data_store.get_dataframe(str(ds_id))
        if df is None:
            return NodeResult(
                node.id,
                ExecutionStatus.FAILED,
                error=f"Dataset não encontrado: {ds_id}. Faça upload novamente.",
            )
        return NodeResult(node.id, ExecutionStatus.COMPLETED, data=df.copy())

    def _node_manual_input(self, node: WorkflowNode, cfg: Dict[str, Any]) -> NodeResult:
        cols_raw = cfg.get("columns", "")
        if isinstance(cols_raw, str):
            cols = [c.strip() for c in cols_raw.split(",") if c.strip()]
        else:
            cols = []
        if not cols:
            cols = ["coluna_1"]
        df = pd.DataFrame(columns=cols)
        return NodeResult(node.id, ExecutionStatus.COMPLETED, data=df)

    def _node_filter(self, node: WorkflowNode, inputs: List[Any], cfg: Dict[str, Any]) -> NodeResult:
        df = _first_dataframe(inputs)
        if df is None:
            raise ValueError("Conecte uma fonte de dados ao bloco Filtrar")
        col = cfg.get("column")
        op = cfg.get("operator", "equals")
        val = cfg.get("value")
        if not col or col not in df.columns:
            raise ValueError(f"Coluna inválida ou ausente: {col}")
        out = df.copy()
        if op == "equals":
            out = out[out[col].astype(str) == str(val)]
        elif op == "not_equals":
            out = out[out[col].astype(str) != str(val)]
        elif op == "contains":
            out = out[out[col].astype(str).str.contains(str(val), na=False, regex=False)]
        elif op == "greater":
            out = out[pd.to_numeric(out[col], errors="coerce") > float(val)]
        elif op == "less":
            out = out[pd.to_numeric(out[col], errors="coerce") < float(val)]
        else:
            out = out[out[col].astype(str) == str(val)]
        return NodeResult(node.id, ExecutionStatus.COMPLETED, data=out)

    def _node_group(self, node: WorkflowNode, inputs: List[Any], cfg: Dict[str, Any]) -> NodeResult:
        df = _first_dataframe(inputs)
        if df is None:
            raise ValueError("Conecte uma fonte de dados ao bloco Agrupar")
        gb = cfg.get("groupBy") or cfg.get("group_by")
        if not gb or gb not in df.columns:
            raise ValueError(f"Coluna de agrupamento inválida: {gb}")
        g = df.groupby(gb, dropna=False).size().reset_index(name="count")
        return NodeResult(node.id, ExecutionStatus.COMPLETED, data=g)

    def _node_constraints(
        self,
        node: WorkflowNode,
        inputs: List[Any],
        cfg: Dict[str, Any],
        context: ExecutionContext,
    ) -> NodeResult:
        df = _first_dataframe(inputs)
        if df is None:
            raise ValueError("Conecte dados ao bloco Restrições")
        raw = cfg.get("constraints") or []
        context.node_metadata[node.id] = {"constraints": raw}
        return NodeResult(node.id, ExecutionStatus.COMPLETED, data=df.copy())

    def _node_preferences(
        self,
        node: WorkflowNode,
        inputs: List[Any],
        cfg: Dict[str, Any],
        context: ExecutionContext,
    ) -> NodeResult:
        df = _first_dataframe(inputs)
        if df is None:
            raise ValueError("Conecte dados ao bloco Preferências")
        raw = cfg.get("preferences") or []
        context.node_metadata[node.id] = {"preferences": raw}
        return NodeResult(node.id, ExecutionStatus.COMPLETED, data=df.copy())

    def _merge_constraints_from_predecessors(
        self, node_id: str, context: ExecutionContext
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        constraints: List[Dict[str, Any]] = []
        preferences: List[Dict[str, Any]] = []
        for pred in self.reverse_adjacency.get(node_id, []):
            meta = context.node_metadata.get(pred)
            if not meta:
                continue
            constraints.extend(meta.get("constraints") or [])
            preferences.extend(meta.get("preferences") or [])
        return constraints, preferences

    def _node_allocate(
        self,
        node: WorkflowNode,
        inputs: List[Any],
        cfg: Dict[str, Any],
        context: ExecutionContext,
    ) -> NodeResult:
        dfs = _all_dataframes(inputs)
        if len(dfs) < 2:
            return NodeResult(
                node.id,
                ExecutionStatus.FAILED,
                error="Alocar precisa de duas fontes de dados (recursos e alvos). Conecte dois fluxos de Excel.",
            )
        extra_c, extra_p = self._merge_constraints_from_predecessors(node.id, context)
        try:
            from .optimizer import (
                AllocationSolver,
                ConstraintDef,
                PreferenceDef,
                check_ortools_available,
            )
        except ImportError:
            return NodeResult(
                node.id,
                ExecutionStatus.FAILED,
                error="Módulo de otimização não disponível",
            )
        if not check_ortools_available():
            return NodeResult(
                node.id,
                ExecutionStatus.FAILED,
                error="OR-Tools não está instalado no servidor",
            )
        resources = dfs[0].to_dict(orient="records")
        targets = dfs[1].to_dict(orient="records")
        time_limit = int(cfg.get("timeLimit") or cfg.get("time_limit") or 60)
        cdefs: List[ConstraintDef] = []
        for c in extra_c:
            if not isinstance(c, dict):
                continue
            cdefs.append(
                ConstraintDef(
                    id=str(c.get("id", "c")),
                    name=str(c.get("name", "r")),
                    constraint_type=str(c.get("type", "hard")),
                    operator=str(c.get("operator", "max")),
                    column=c.get("column"),
                    value=c.get("value"),
                    value2=c.get("value2"),
                    group_by=c.get("groupBy"),
                    weight=int(c.get("weight") or 10),
                )
            )
        pdefs: List[PreferenceDef] = []
        for p in extra_p:
            if not isinstance(p, dict):
                continue
            pdefs.append(
                PreferenceDef(
                    id=str(p.get("id", "p")),
                    name=str(p.get("name", "pref")),
                    preference_type=str(p.get("type", "maximize")),
                    column=p.get("column"),
                    target_value=p.get("targetValue"),
                    weight=int(p.get("weight") or 5),
                )
            )
        solver = AllocationSolver(
            resources=resources,
            targets=targets,
            constraints=cdefs,
            preferences=pdefs,
            time_limit_seconds=max(1, min(time_limit, 600)),
        )
        opt = solver.solve()
        if opt.status.value in ("infeasible", "error", "timeout"):
            return NodeResult(
                node.id,
                ExecutionStatus.FAILED,
                error=opt.message or "Otimização não encontrou solução",
            )
        rows = []
        for a in opt.assignments or []:
            rows.append(
                {
                    **dict(a.get("resource") or {}),
                    **{f"target__{k}": v for k, v in (a.get("target") or {}).items()},
                }
            )
        out_df = pd.DataFrame(rows)
        w = [f"Solver: {opt.status.value}"]
        if opt.message:
            w.append(opt.message)
        return NodeResult(node.id, ExecutionStatus.COMPLETED, data=out_df, warnings=w)

    def _node_schedule(self, node: WorkflowNode) -> NodeResult:
        return NodeResult(
            node.id,
            ExecutionStatus.FAILED,
            error="Agendar ainda não está implementado. Use Alocar ou simplifique o fluxo.",
        )

    def _node_preview(self, node: WorkflowNode, inputs: List[Any], cfg: Dict[str, Any]) -> NodeResult:
        df = _first_dataframe(inputs)
        if df is None:
            raise ValueError("Conecte dados ao bloco Visualizar")
        max_rows = int(cfg.get("maxRows") or cfg.get("max_rows") or 100)
        max_rows = max(1, min(max_rows, 5000))
        slim = df.head(max_rows)
        return NodeResult(
            node.id,
            ExecutionStatus.COMPLETED,
            data=slim,
            warnings=[f"Mostrando até {max_rows} linhas de {len(df)}"] if len(df) > max_rows else [],
        )

    def _node_excel_output(
        self,
        node: WorkflowNode,
        inputs: List[Any],
        cfg: Dict[str, Any],
        context: ExecutionContext,
    ) -> NodeResult:
        df = _first_dataframe(inputs)
        if df is None:
            raise ValueError("Conecte dados ao bloco Exportar Excel")
        filename = cfg.get("filename") or "resultado.xlsx"
        if not str(filename).lower().endswith(".xlsx"):
            filename = f"{filename}.xlsx"
        sheet = safe_sheet_name(str(cfg.get("sheetName") or cfg.get("sheet_name") or "Resultado"))
        raw = dataframe_to_xlsx_bytes(df, sheet_name=sheet)
        context.output_excel_bytes = raw
        context.output_excel_filename = filename
        return NodeResult(
            node.id,
            ExecutionStatus.COMPLETED,
            data=df.copy(),
            warnings=[f"Arquivo gerado: {filename}"],
        )


def serialize_execution_context_for_response(
    context: ExecutionContext,
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]], Optional[str], Optional[str]]:
    """
    Converte node_results para lista serializável e opcionalmente base64 do Excel.
    """
    import base64

    node_results: List[Dict[str, Any]] = []
    last_preview: Optional[Dict[str, Any]] = None
    for node_id, nr in context.node_results.items():
        entry: Dict[str, Any] = {
            "node_id": nr.node_id,
            "status": nr.status.value,
            "error": nr.error,
            "warnings": nr.warnings,
            "execution_time_ms": nr.execution_time_ms,
        }
        if nr.data is not None:
            if isinstance(nr.data, pd.DataFrame):
                ser = _serialize_dataframe_for_json(nr.data)
                entry["data"] = ser
                last_preview = ser
            else:
                entry["data"] = nr.data
        node_results.append(entry)

    b64: Optional[str] = None
    fname: Optional[str] = None
    if context.output_excel_bytes:
        b64 = base64.b64encode(context.output_excel_bytes).decode("ascii")
        fname = context.output_excel_filename or "resultado.xlsx"

    summary: Optional[Dict[str, Any]] = None
    if last_preview:
        summary = {"last_dataframe_preview": last_preview}
    return node_results, summary, b64, fname
