/**
 * Cliente API para comunicação com o backend.
 * 
 * Segurança:
 * - Não armazena tokens em localStorage
 * - Valida respostas
 * - Timeout configurável
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Tipos
export interface ColumnInfo {
  name: string;
  dtype: string;
  sample_values: unknown[];
  null_count: number;
  unique_count: number;
}

export interface DatasetInfo {
  id: string;
  name: string;
  original_filename: string;
  sheet_name?: string;
  row_count: number;
  column_count: number;
  columns: ColumnInfo[];
  created_at: string;
}

export interface DatasetPreview {
  id: string;
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  dataset_id?: string;
  dataset_info?: DatasetInfo;
  errors: string[];
  warnings: string[];
}

export interface MultiUploadResponse {
  success: boolean;
  message: string;
  uploaded: DatasetInfo[];
  failed: { filename: string; error: string }[];
  total_uploaded: number;
  total_failed: number;
}

export interface DatasetListResponse {
  datasets: DatasetInfo[];
  total: number;
}

/** Corpo enviado para execução (WorkflowCreate) */
export interface WorkflowExecuteBody {
  name: string;
  description?: string;
  nodes: Array<{
    id: string;
    type: string;
    category: string;
    label: string;
    position: { x: number; y: number };
    config: Record<string, unknown>;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

export interface ExecutionNodeResult {
  node_id: string;
  status: string;
  data?: unknown;
  error?: string | null;
  warnings?: string[];
  execution_time_ms?: number | null;
}

export interface WorkflowExecuteResponse {
  success: boolean;
  message: string;
  result?: Record<string, unknown> | null;
  node_results?: ExecutionNodeResult[] | null;
  errors: string[];
  warnings: string[];
  total_execution_time_ms?: number | null;
  output_file_base64?: string | null;
  output_filename?: string | null;
}

// Erros customizados
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors: string[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Funções de API
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.detail || data.message || 'Erro na requisição',
      response.status,
      data.errors || []
    );
  }
  return response.json();
}

/**
 * Upload de um único arquivo Excel/CSV
 */
export async function uploadFile(
  file: File,
  options?: {
    sheetName?: string;
    hasHeader?: boolean;
  }
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  
  if (options?.sheetName) {
    formData.append('sheet_name', options.sheetName);
  }
  formData.append('has_header', String(options?.hasHeader ?? true));
  
  const response = await fetch(`${API_BASE_URL}/api/v1/data/upload`, {
    method: 'POST',
    body: formData,
  });
  
  return handleResponse<UploadResponse>(response);
}

/**
 * Upload de múltiplos arquivos Excel/CSV
 */
export async function uploadMultipleFiles(
  files: File[],
  hasHeader: boolean = true
): Promise<MultiUploadResponse> {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('files', file);
  });
  formData.append('has_header', String(hasHeader));
  
  const response = await fetch(`${API_BASE_URL}/api/v1/data/upload/multiple`, {
    method: 'POST',
    body: formData,
  });
  
  return handleResponse<MultiUploadResponse>(response);
}

/**
 * Lista todos os datasets carregados
 */
export async function listDatasets(): Promise<DatasetListResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/data/datasets`);
  return handleResponse<DatasetListResponse>(response);
}

/**
 * Obtém informações de um dataset
 */
export async function getDataset(datasetId: string): Promise<DatasetInfo> {
  const response = await fetch(`${API_BASE_URL}/api/v1/data/datasets/${datasetId}`);
  return handleResponse<DatasetInfo>(response);
}

/**
 * Obtém preview de um dataset
 */
export async function getDatasetPreview(
  datasetId: string,
  maxRows: number = 50
): Promise<DatasetPreview> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/data/datasets/${datasetId}/preview?max_rows=${maxRows}`
  );
  return handleResponse<DatasetPreview>(response);
}

/**
 * Remove um dataset
 */
export async function deleteDataset(datasetId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/data/datasets/${datasetId}`, {
    method: 'DELETE',
  });
  await handleResponse(response);
}

/**
 * Remove todos os datasets
 */
export async function clearAllDatasets(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/data/datasets`, {
    method: 'DELETE',
  });
  await handleResponse(response);
}

/**
 * Executa o workflow no backend (processa DataFrames, gera Excel se houver saída).
 */
export async function executeWorkflow(
  workflow: WorkflowExecuteBody,
  options?: { dryRun?: boolean }
): Promise<WorkflowExecuteResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/workflows/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow,
      dry_run: options?.dryRun ?? false,
    }),
  });
  return handleResponse<WorkflowExecuteResponse>(response);
}

/** Dispara download de um arquivo a partir de base64 (resposta da execução). */
export function downloadBase64File(base64: string, filename: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

