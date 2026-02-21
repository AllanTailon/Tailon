"use client";

import { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useWorkflowStore } from '@/lib/workflow/store';
import { BlockDefinition, BLOCK_DEFINITIONS } from '@/lib/workflow/types';
import CustomNode from './CustomNode';
import Sidebar from './Sidebar';
import ConfigPanel from './ConfigPanel';

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const addNode = useWorkflowStore((state) => state.addNode);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  
  // Registra tipos de nodes customizados - memoizado para evitar re-renders
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
  }), []);
  
  // Handler para drag start na sidebar
  const onDragStart = useCallback((event: React.DragEvent, blockDef: BlockDefinition) => {
    // Armazena dados do bloco no drag (não dados sensíveis)
    event.dataTransfer.setData('application/json', JSON.stringify({
      type: blockDef.type,
      category: blockDef.category,
      label: blockDef.label,
    }));
    event.dataTransfer.effectAllowed = 'move';
  }, []);
  
  // Handler para drop no canvas
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;
      
      try {
        const data = JSON.parse(event.dataTransfer.getData('application/json'));
        
        // Encontra a definição completa do bloco
        const blockDef = BLOCK_DEFINITIONS.find((b: BlockDefinition) => b.type === data.type);
        
        if (!blockDef) {
          console.warn('Tipo de bloco não encontrado');
          return;
        }
        
        // Calcula posição relativa ao canvas
        const position = {
          x: event.clientX - reactFlowBounds.left - 90,
          y: event.clientY - reactFlowBounds.top - 40,
        };
        
        addNode(blockDef, position);
      } catch (error) {
        // Não loga dados do evento por segurança
        console.warn('Erro ao processar drop');
      }
    },
    [addNode]
  );
  
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  // Deseleciona ao clicar no canvas vazio
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar com blocos */}
      <Sidebar onDragStart={onDragStart} />
      
      {/* Canvas principal */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            animated: true,
            style: { strokeWidth: 2 },
          }}
          className="bg-background"
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={24} 
            size={1}
            className="!bg-background"
          />
          <Controls className="!bg-card !border-border" />
          <MiniMap 
            className="!bg-card !border-border"
            nodeColor={(node) => {
              const category = node.data?.category as string;
              const colors: Record<string, string> = {
                input: '#0ea5e9',
                process: '#f59e0b',
                rule: '#8b5cf6',
                optimize: '#10b981',
                output: '#f43f5e',
              };
              return colors[category] || '#6b7280';
            }}
          />
        </ReactFlow>
        
        {/* Overlay de instrução quando vazio */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-8 rounded-xl bg-card/50 backdrop-blur border border-dashed border-border">
              <p className="text-lg text-muted-foreground mb-2">
                Arraste blocos da sidebar para começar
              </p>
              <p className="text-sm text-muted-foreground/70">
                Conecte os blocos para criar seu fluxo de otimização
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Painel de configuração */}
      <ConfigPanel />
    </div>
  );
}

// Wrapper com provider
export default function Canvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
