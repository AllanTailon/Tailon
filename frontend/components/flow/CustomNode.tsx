"use client";

import { memo } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWorkflowStore } from '@/lib/workflow/store';
import { BLOCK_DEFINITIONS, getCategoryLabel, NodeCategory, NodeConfig } from '@/lib/workflow/types';
import { 
  FileSpreadsheet, 
  Edit, 
  Filter, 
  Layers, 
  Lock, 
  Star, 
  GitBranch, 
  Download, 
  Eye,
  Calendar
} from 'lucide-react';

// Mapa de ícones
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'file-spreadsheet': FileSpreadsheet,
  'edit': Edit,
  'filter': Filter,
  'layers': Layers,
  'lock': Lock,
  'star': Star,
  'git-branch': GitBranch,
  'download': Download,
  'eye': Eye,
  'calendar': Calendar,
};

// Cores por categoria
const categoryColors: Record<NodeCategory, { bg: string; border: string; text: string }> = {
  input: { bg: 'bg-sky-500/10', border: 'border-sky-500/50', text: 'text-sky-400' },
  process: { bg: 'bg-amber-500/10', border: 'border-amber-500/50', text: 'text-amber-400' },
  rule: { bg: 'bg-violet-500/10', border: 'border-violet-500/50', text: 'text-violet-400' },
  optimize: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/50', text: 'text-emerald-400' },
  output: { bg: 'bg-rose-500/10', border: 'border-rose-500/50', text: 'text-rose-400' },
};

// Tipos para o node
export interface CustomNodeData {
  label: string;
  category: string;
  blockType: string;
  config: NodeConfig;
}

export type CustomNodeType = Node<CustomNodeData, 'custom'>;

interface CustomNodeProps {
  id: string;
  data: CustomNodeData;
  selected?: boolean;
}

function CustomNode({ data, selected, id }: CustomNodeProps) {
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const nodes = useWorkflowStore((state) => state.nodes);
  
  const blockDef = BLOCK_DEFINITIONS.find((b) => b.type === data.blockType);
  const category = data.category as NodeCategory;
  const colors = categoryColors[category] || categoryColors.process;
  const IconComponent = iconMap[blockDef?.icon || 'edit'] || Edit;
  
  const handleClick = () => {
    const node = nodes.find((n) => n.id === id);
    if (node) {
      selectNode(node);
    }
  };

  return (
    <Card
      onClick={handleClick}
      className={`
        min-w-[180px] p-3 cursor-pointer transition-all duration-200
        ${colors.bg} ${colors.border} border-2
        ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : ''}
        hover:scale-102 hover:shadow-lg
      `}
    >
      {/* Input handles */}
      {blockDef && blockDef.inputs > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-foreground/50 !border-2 !border-background"
        />
      )}
      
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}>
          <IconComponent className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{data.label}</h4>
          <Badge variant="outline" className={`text-xs mt-1 ${colors.text} border-current/30`}>
            {getCategoryLabel(category)}
          </Badge>
        </div>
      </div>
      
      {/* Preview de config se houver */}
      {data.config && Object.keys(data.config).length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground truncate">
            {Object.entries(data.config)
              .slice(0, 2)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ')}
          </p>
        </div>
      )}
      
      {/* Output handles */}
      {blockDef && blockDef.outputs > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-foreground/50 !border-2 !border-background"
        />
      )}
    </Card>
  );
}

export default memo(CustomNode);
