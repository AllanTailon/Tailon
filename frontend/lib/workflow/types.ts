// Tipos base para o sistema de workflow
// IMPORTANTE: Não inclua dados sensíveis nos tipos de log/debug

export type NodeCategory = 'input' | 'process' | 'rule' | 'optimize' | 'output';

// Tipos de operadores para restrições
export type ConstraintOperator = 
  | 'max'           // Máximo de X
  | 'min'           // Mínimo de X
  | 'equals'        // Igual a X
  | 'not_equals'    // Diferente de X
  | 'less_than'     // Menor que X
  | 'greater_than'  // Maior que X
  | 'between'       // Entre X e Y
  | 'unique'        // Valores únicos
  | 'no_overlap'    // Sem sobreposição (horários)
  | 'consecutive'   // Valores consecutivos
  | 'max_per_group' // Máximo por grupo
  | 'min_per_group' // Mínimo por grupo
  | 'balanced';     // Distribuição equilibrada

// Interface para uma restrição individual
export interface Constraint {
  id: string;
  name: string;
  description?: string;
  type: 'hard' | 'soft';  // hard = obrigatória, soft = preferência
  operator: ConstraintOperator;
  column?: string;        // Coluna alvo
  value?: string | number;
  value2?: string | number; // Para operador 'between'
  groupBy?: string;       // Para operadores de grupo
  weight?: number;        // Peso para soft constraints (1-10)
}

// Interface para preferência (soft constraint com mais detalhes)
export interface Preference {
  id: string;
  name: string;
  description?: string;
  type: 'maximize' | 'minimize' | 'prefer_value' | 'avoid_value' | 'balance';
  column?: string;
  targetValue?: string | number;
  weight: number; // 1-10
}

export interface NodeConfig {
  [key: string]: string | number | boolean | string[] | Constraint[] | Preference[] | undefined;
}

export interface WorkflowNode {
  id: string;
  type: string;
  category: NodeCategory;
  label: string;
  config: NodeConfig;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

// Definições de tipos de blocos disponíveis
export interface BlockDefinition {
  type: string;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  inputs: number;
  outputs: number;
  configFields: ConfigField[];
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'textarea' | 'constraints' | 'preferences';
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean | Constraint[] | Preference[];
  placeholder?: string;
  // Campos sensíveis não devem ser logados
  sensitive?: boolean;
}

// Operadores disponíveis para restrições
export const CONSTRAINT_OPERATORS: { value: ConstraintOperator; label: string; description: string }[] = [
  { value: 'max', label: 'Máximo', description: 'Valor máximo permitido' },
  { value: 'min', label: 'Mínimo', description: 'Valor mínimo permitido' },
  { value: 'equals', label: 'Igual a', description: 'Deve ser igual ao valor' },
  { value: 'not_equals', label: 'Diferente de', description: 'Não pode ser igual ao valor' },
  { value: 'less_than', label: 'Menor que', description: 'Deve ser menor que o valor' },
  { value: 'greater_than', label: 'Maior que', description: 'Deve ser maior que o valor' },
  { value: 'between', label: 'Entre', description: 'Deve estar entre dois valores' },
  { value: 'unique', label: 'Único', description: 'Valores devem ser únicos' },
  { value: 'no_overlap', label: 'Sem sobreposição', description: 'Não pode haver sobreposição (horários)' },
  { value: 'consecutive', label: 'Consecutivo', description: 'Valores devem ser consecutivos' },
  { value: 'max_per_group', label: 'Máx. por grupo', description: 'Máximo de itens por grupo' },
  { value: 'min_per_group', label: 'Mín. por grupo', description: 'Mínimo de itens por grupo' },
  { value: 'balanced', label: 'Balanceado', description: 'Distribuição equilibrada entre grupos' },
];

// Blocos disponíveis no sistema
export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  // Input blocks
  {
    type: 'excel-input',
    category: 'input',
    label: 'Importar Excel',
    description: 'Carrega dados de uma planilha Excel/CSV',
    icon: 'file-spreadsheet',
    inputs: 0,
    outputs: 1,
    configFields: [], // Configuração feita via ExcelInputConfig
  },
  {
    type: 'manual-input',
    category: 'input',
    label: 'Entrada Manual',
    description: 'Define dados manualmente',
    icon: 'edit',
    inputs: 0,
    outputs: 1,
    configFields: [
      { key: 'columns', label: 'Colunas (separadas por vírgula)', type: 'text', placeholder: 'nome, idade, cargo' },
    ],
  },
  
  // Process blocks
  {
    type: 'filter',
    category: 'process',
    label: 'Filtrar',
    description: 'Filtra dados baseado em condições',
    icon: 'filter',
    inputs: 1,
    outputs: 1,
    configFields: [
      { key: 'column', label: 'Coluna', type: 'text', placeholder: 'Nome da coluna' },
      { key: 'operator', label: 'Operador', type: 'select', options: [
        { value: 'equals', label: 'Igual a' },
        { value: 'not_equals', label: 'Diferente de' },
        { value: 'contains', label: 'Contém' },
        { value: 'greater', label: 'Maior que' },
        { value: 'less', label: 'Menor que' },
      ]},
      { key: 'value', label: 'Valor', type: 'text' },
    ],
  },
  {
    type: 'group',
    category: 'process',
    label: 'Agrupar',
    description: 'Agrupa dados por uma coluna',
    icon: 'layers',
    inputs: 1,
    outputs: 1,
    configFields: [
      { key: 'groupBy', label: 'Agrupar por', type: 'text', placeholder: 'Nome da coluna' },
    ],
  },
  
  // Rule blocks - ATUALIZADO para múltiplas restrições
  {
    type: 'constraints',
    category: 'rule',
    label: 'Restrições',
    description: 'Define múltiplas restrições obrigatórias (hard constraints)',
    icon: 'lock',
    inputs: 1,
    outputs: 1,
    configFields: [
      { 
        key: 'constraints', 
        label: 'Lista de Restrições', 
        type: 'constraints',
        defaultValue: [] as Constraint[],
      },
    ],
  },
  {
    type: 'preferences',
    category: 'rule',
    label: 'Preferências',
    description: 'Define múltiplas preferências (soft constraints)',
    icon: 'star',
    inputs: 1,
    outputs: 1,
    configFields: [
      { 
        key: 'preferences', 
        label: 'Lista de Preferências', 
        type: 'preferences',
        defaultValue: [] as Preference[],
      },
    ],
  },
  
  // Optimize blocks
  {
    type: 'allocate',
    category: 'optimize',
    label: 'Alocar',
    description: 'Executa algoritmo de alocação com OR-Tools',
    icon: 'git-branch',
    inputs: 2,
    outputs: 1,
    configFields: [
      { key: 'algorithm', label: 'Algoritmo', type: 'select', options: [
        { value: 'cp_sat', label: 'CP-SAT (recomendado)' },
        { value: 'mip', label: 'Programação Linear Inteira' },
        { value: 'greedy', label: 'Guloso (rápido, aproximado)' },
      ]},
      { key: 'timeLimit', label: 'Tempo Limite (segundos)', type: 'number', defaultValue: 60 },
      { key: 'maxSolutions', label: 'Máx. Soluções', type: 'number', defaultValue: 1 },
    ],
  },
  {
    type: 'schedule',
    category: 'optimize',
    label: 'Agendar',
    description: 'Cria cronogramas e escalas otimizadas',
    icon: 'calendar',
    inputs: 2,
    outputs: 1,
    configFields: [
      { key: 'timeUnit', label: 'Unidade de Tempo', type: 'select', options: [
        { value: 'minutes', label: 'Minutos' },
        { value: 'hours', label: 'Horas' },
        { value: 'days', label: 'Dias' },
        { value: 'weeks', label: 'Semanas' },
      ]},
      { key: 'startColumn', label: 'Coluna de Início', type: 'text', placeholder: 'horario_inicio' },
      { key: 'endColumn', label: 'Coluna de Fim', type: 'text', placeholder: 'horario_fim' },
      { key: 'timeLimit', label: 'Tempo Limite (segundos)', type: 'number', defaultValue: 60 },
    ],
  },
  
  // Output blocks
  {
    type: 'excel-output',
    category: 'output',
    label: 'Exportar Excel',
    description: 'Exporta resultado para Excel',
    icon: 'download',
    inputs: 1,
    outputs: 0,
    configFields: [
      { key: 'filename', label: 'Nome do Arquivo', type: 'text', placeholder: 'resultado.xlsx' },
      { key: 'sheetName', label: 'Nome da Aba', type: 'text', defaultValue: 'Resultado' },
    ],
  },
  {
    type: 'preview',
    category: 'output',
    label: 'Visualizar',
    description: 'Mostra preview dos dados',
    icon: 'eye',
    inputs: 1,
    outputs: 0,
    configFields: [
      { key: 'maxRows', label: 'Máx. Linhas', type: 'number', defaultValue: 100 },
    ],
  },
];

// Helper para criar uma nova restrição vazia
export function createEmptyConstraint(): Constraint {
  return {
    id: `constraint_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: '',
    type: 'hard',
    operator: 'max',
    weight: 10,
  };
}

// Helper para criar uma nova preferência vazia
export function createEmptyPreference(): Preference {
  return {
    id: `pref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: '',
    type: 'maximize',
    weight: 5,
  };
}

// Helper para obter cor da categoria
export function getCategoryColor(category: NodeCategory): string {
  const colors: Record<NodeCategory, string> = {
    input: 'var(--node-input)',
    process: 'var(--node-process)',
    rule: 'var(--node-rule)',
    optimize: 'var(--node-optimize)',
    output: 'var(--node-output)',
  };
  return colors[category];
}

// Helper para obter label da categoria
export function getCategoryLabel(category: NodeCategory): string {
  const labels: Record<NodeCategory, string> = {
    input: 'Entrada',
    process: 'Processamento',
    rule: 'Regras',
    optimize: 'Otimização',
    output: 'Saída',
  };
  return labels[category];
}
