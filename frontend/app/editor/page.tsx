"use client";

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useWorkflowStore } from '@/lib/workflow/store';
import { useDataStore } from '@/lib/workflow/data-store';
import Canvas from '@/components/flow/Canvas';
import DataPanel from '@/components/flow/DataPanel';
import { 
  ChevronLeft, 
  Upload, 
  Download, 
  Play, 
  Trash2,
  Database,
} from 'lucide-react';

export default function EditorPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  
  const workflowName = useWorkflowStore((state) => state.workflowName);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const exportWorkflow = useWorkflowStore((state) => state.exportWorkflow);
  const importWorkflow = useWorkflowStore((state) => state.importWorkflow);
  const clearWorkflow = useWorkflowStore((state) => state.clearWorkflow);
  const nodes = useWorkflowStore((state) => state.nodes);
  
  const datasets = useDataStore((state) => state.datasets);
  
  // Exportar workflow como JSON
  const handleExport = useCallback(() => {
    try {
      const data = exportWorkflow();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Sanitiza nome do arquivo
      const safeName = workflowName.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
      a.download = `${safeName || 'workflow'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar workflow');
      alert('Erro ao exportar o workflow. Tente novamente.');
    }
  }, [exportWorkflow, workflowName]);
  
  // Importar workflow de JSON
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validação de segurança: tamanho máximo 1MB
    if (file.size > 1024 * 1024) {
      alert('Arquivo muito grande. Máximo permitido: 1MB');
      return;
    }
    
    // Validação de tipo
    if (!file.name.endsWith('.json')) {
      alert('Apenas arquivos .json são permitidos');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        importWorkflow(data);
      } catch (error) {
        alert('Arquivo inválido. Verifique se é um workflow válido.');
      }
    };
    reader.onerror = () => {
      alert('Erro ao ler o arquivo.');
    };
    reader.readAsText(file);
    
    // Limpa input para permitir reimportar mesmo arquivo
    event.target.value = '';
  }, [importWorkflow]);
  
  // Limpar workflow
  const handleClear = useCallback(() => {
    if (nodes.length === 0 || window.confirm('Tem certeza que deseja limpar o workflow?')) {
      clearWorkflow();
    }
  }, [clearWorkflow, nodes.length]);
  
  // Executar workflow (placeholder)
  const handleRun = useCallback(() => {
    if (nodes.length === 0) {
      alert('Adicione blocos ao workflow antes de executar.');
      return;
    }
    alert('Funcionalidade de execução será implementada na próxima fase.');
  }, [nodes.length]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header do Editor */}
      <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-4">
        {/* Voltar */}
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">T</span>
          </div>
        </div>
        
        {/* Nome do Workflow */}
        <div className="flex-1 max-w-xs">
          <Input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="bg-background/50 border-border/50 font-medium"
            placeholder="Nome do workflow"
            maxLength={100}
          />
        </div>
        
        {/* Ações */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Botão de Dados */}
          <Button 
            variant={dataPanelOpen ? "default" : "outline"} 
            size="sm" 
            onClick={() => setDataPanelOpen(!dataPanelOpen)}
          >
            <Database className="w-4 h-4 mr-2" />
            Dados
            {datasets.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                {datasets.length}
              </Badge>
            )}
          </Button>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          {/* Import/Export */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="w-4 h-4 mr-2" />
            Importar
          </Button>
          
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          {/* Limpar */}
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpar
          </Button>
          
          {/* Executar */}
          <Button size="sm" onClick={handleRun} disabled={nodes.length === 0}>
            <Play className="w-4 h-4 mr-2" />
            Executar
          </Button>
        </div>
      </header>
      
      {/* Canvas */}
      <main className="flex-1 relative">
        <Canvas />
        
        {/* Painel de Dados */}
        <DataPanel 
          isOpen={dataPanelOpen} 
          onClose={() => setDataPanelOpen(false)} 
        />
      </main>
    </div>
  );
}
