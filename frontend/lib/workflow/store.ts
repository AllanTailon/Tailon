import { create } from 'zustand';
import { 
  Node, 
  Edge, 
  Connection, 
  addEdge, 
  applyNodeChanges, 
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from '@xyflow/react';
import { BlockDefinition, BLOCK_DEFINITIONS, NodeConfig } from './types';

// Tipos para o node data
export interface CustomNodeData {
  label: string;
  category: string;
  blockType: string;
  config: NodeConfig;
  [key: string]: unknown;
}

export type CustomNode = Node<CustomNodeData, 'custom'>;

interface WorkflowState {
  // Estado do workflow
  nodes: CustomNode[];
  edges: Edge[];
  selectedNode: CustomNode | null;
  workflowName: string;
  
  // Ações
  setNodes: (nodes: CustomNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange<CustomNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  
  // Manipulação de nodes
  addNode: (blockDef: BlockDefinition, position: { x: number; y: number }) => void;
  removeNode: (nodeId: string) => void;
  updateNodeConfig: (nodeId: string, config: NodeConfig) => void;
  selectNode: (node: CustomNode | null) => void;
  
  // Workflow
  setWorkflowName: (name: string) => void;
  clearWorkflow: () => void;
  exportWorkflow: () => object;
  importWorkflow: (data: object) => void;
}

// Gera ID único para nodes (não usar UUIDs externos por segurança)
function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Validação de conexão - previne loops e conexões inválidas
function isValidConnection(
  nodes: CustomNode[],
  edges: Edge[],
  connection: Connection
): boolean {
  // Não permite conectar a si mesmo
  if (connection.source === connection.target) {
    return false;
  }
  
  // Verifica se já existe conexão entre esses nodes
  const existingEdge = edges.find(
    (e) => e.source === connection.source && e.target === connection.target
  );
  if (existingEdge) {
    return false;
  }
  
  // Verifica se criaria um ciclo (simplificado)
  const visited = new Set<string>();
  const stack = [connection.target];
  
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === connection.source) {
      return false; // Ciclo detectado
    }
    if (!visited.has(current)) {
      visited.add(current);
      edges
        .filter((e) => e.source === current)
        .forEach((e) => stack.push(e.target));
    }
  }
  
  return true;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  workflowName: 'Novo Workflow',
  
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as CustomNode[],
    });
  },
  
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  
  onConnect: (connection) => {
    const { nodes, edges } = get();
    
    if (!isValidConnection(nodes, edges, connection)) {
      console.warn('Conexão inválida ignorada');
      return;
    }
    
    set({
      edges: addEdge(
        {
          ...connection,
          id: `edge_${Date.now()}`,
          animated: true,
        },
        edges
      ),
    });
  },
  
  addNode: (blockDef, position) => {
    const newNode: CustomNode = {
      id: generateNodeId(),
      type: 'custom',
      position,
      data: {
        label: blockDef.label,
        category: blockDef.category,
        blockType: blockDef.type,
        config: blockDef.configFields.reduce((acc, field) => {
          if (field.defaultValue !== undefined) {
            acc[field.key] = field.defaultValue;
          }
          return acc;
        }, {} as NodeConfig),
      },
    };
    
    set({ nodes: [...get().nodes, newNode] });
  },
  
  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNode: get().selectedNode?.id === nodeId ? null : get().selectedNode,
    });
  },
  
  updateNodeConfig: (nodeId, config) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, config: { ...node.data.config, ...config } } }
          : node
      ),
    });
  },
  
  selectNode: (node) => set({ selectedNode: node }),
  
  setWorkflowName: (name) => set({ workflowName: name }),
  
  clearWorkflow: () => {
    set({
      nodes: [],
      edges: [],
      selectedNode: null,
      workflowName: 'Novo Workflow',
    });
  },
  
  // Exporta workflow sem dados sensíveis de runtime
  exportWorkflow: () => {
    const { nodes, edges, workflowName } = get();
    return {
      version: '1.0',
      name: workflowName,
      exportedAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.blockType,
        category: n.data.category,
        label: n.data.label,
        position: n.position,
        config: n.data.config,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    };
  },
  
  // Importa workflow com validação
  importWorkflow: (data: unknown) => {
    try {
      const workflow = data as {
        version?: string;
        name?: string;
        nodes?: Array<{
          id: string;
          type: string;
          category: string;
          label: string;
          position: { x: number; y: number };
          config: NodeConfig;
        }>;
        edges?: Array<{ id: string; source: string; target: string }>;
      };
      
      if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
        throw new Error('Formato de workflow inválido');
      }
      
      // Valida e reconstrói nodes
      const validNodes: CustomNode[] = workflow.nodes
        .filter((n) => {
          const blockDef = BLOCK_DEFINITIONS.find((b) => b.type === n.type);
          return blockDef !== undefined;
        })
        .map((n) => ({
          id: n.id,
          type: 'custom' as const,
          position: n.position,
          data: {
            label: n.label,
            category: n.category,
            blockType: n.type,
            config: n.config || {},
          },
        }));
      
      // Valida edges (só edges entre nodes válidos)
      const validNodeIds = new Set(validNodes.map((n) => n.id));
      const validEdges: Edge[] = (workflow.edges || [])
        .filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
        }));
      
      set({
        nodes: validNodes,
        edges: validEdges,
        workflowName: workflow.name || 'Workflow Importado',
        selectedNode: null,
      });
    } catch (error) {
      // Não loga dados do workflow por segurança
      console.error('Erro ao importar workflow');
      throw new Error('Falha ao importar workflow. Verifique o formato do arquivo.');
    }
  },
}));
