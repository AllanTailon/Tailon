"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { BLOCK_DEFINITIONS, BlockDefinition, getCategoryLabel, NodeCategory } from '@/lib/workflow/types';
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
  Search,
  GripVertical,
  Calendar
} from 'lucide-react';

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

const categoryColors: Record<NodeCategory, string> = {
  input: 'text-sky-400',
  process: 'text-amber-400',
  rule: 'text-violet-400',
  optimize: 'text-emerald-400',
  output: 'text-rose-400',
};

interface SidebarProps {
  onDragStart: (event: React.DragEvent, blockDef: BlockDefinition) => void;
}

export default function Sidebar({ onDragStart }: SidebarProps) {
  const [search, setSearch] = useState('');
  
  // Agrupa blocos por categoria
  const groupedBlocks = BLOCK_DEFINITIONS.reduce((acc, block) => {
    if (!acc[block.category]) {
      acc[block.category] = [];
    }
    acc[block.category].push(block);
    return acc;
  }, {} as Record<NodeCategory, BlockDefinition[]>);
  
  // Filtra blocos por busca
  const filterBlocks = (blocks: BlockDefinition[]) => {
    if (!search) return blocks;
    const searchLower = search.toLowerCase();
    return blocks.filter(
      (b) =>
        b.label.toLowerCase().includes(searchLower) ||
        b.description.toLowerCase().includes(searchLower)
    );
  };
  
  const categories: NodeCategory[] = ['input', 'process', 'rule', 'optimize', 'output'];

  return (
    <Card className="w-72 h-full border-r rounded-none bg-sidebar">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Blocos</CardTitle>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar blocos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-input"
          />
        </div>
      </CardHeader>
      
      <ScrollArea className="h-[calc(100vh-180px)]">
        <CardContent className="pt-0">
          {categories.map((category) => {
            const blocks = filterBlocks(groupedBlocks[category] || []);
            if (blocks.length === 0) return null;
            
            return (
              <div key={category} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Badge 
                    variant="outline" 
                    className={`${categoryColors[category]} border-current/30`}
                  >
                    {getCategoryLabel(category)}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  {blocks.map((block) => {
                    const IconComponent = iconMap[block.icon] || Edit;
                    
                    return (
                      <div
                        key={block.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, block)}
                        className={`
                          flex items-center gap-3 p-3 rounded-lg
                          bg-card/50 border border-border/50
                          cursor-grab active:cursor-grabbing
                          hover:border-primary/50 hover:bg-card
                          transition-colors group
                        `}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
                        <div className={`p-1.5 rounded ${categoryColors[category]} bg-current/10`}>
                          <IconComponent className={`w-4 h-4 ${categoryColors[category]}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{block.label}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {block.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <Separator className="mt-4" />
              </div>
            );
          })}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}

