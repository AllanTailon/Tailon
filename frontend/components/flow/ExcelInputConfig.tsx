"use client";

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDataStore } from '@/lib/workflow/data-store';
import { useWorkflowStore } from '@/lib/workflow/store';
import { DatasetInfo } from '@/lib/api';
import { 
  Upload, 
  FileSpreadsheet, 
  Check,
  Loader2,
  AlertCircle,
  X
} from 'lucide-react';

interface ExcelInputConfigProps {
  nodeId: string;
  currentDatasetId?: string;
  onSelectDataset: (datasetId: string) => void;
}

export default function ExcelInputConfig({ 
  nodeId, 
  currentDatasetId,
  onSelectDataset 
}: ExcelInputConfigProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  
  const {
    datasets,
    loading,
    error,
    fetchDatasets,
    uploadFile,
    clearError,
  } = useDataStore();
  
  // Carrega datasets ao montar
  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);
  
  // Encontra dataset selecionado
  const selectedDataset = datasets.find(d => d.id === currentDatasetId);
  
  // Handler de upload
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const info = await uploadFile(file);
    setUploading(false);
    
    if (info) {
      // Seleciona automaticamente o dataset recém carregado
      onSelectDataset(info.id);
    }
    
    // Limpa input
    e.target.value = '';
  };
  
  return (
    <div className="space-y-4">
      {/* Dataset Selecionado */}
      {selectedDataset ? (
        <div className="p-3 rounded-lg border border-primary/50 bg-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{selectedDataset.name}</span>
            <Check className="w-4 h-4 text-primary ml-auto" />
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">
              {selectedDataset.row_count} linhas
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {selectedDataset.column_count} colunas
            </Badge>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Colunas: {selectedDataset.columns.map(c => c.name).join(', ')}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg border-2 border-dashed border-border text-center">
          <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhum arquivo selecionado
          </p>
        </div>
      )}
      
      {/* Botão de Upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
          className="hidden"
        />
        
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleUploadClick}
          disabled={uploading || loading}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Carregando...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {selectedDataset ? 'Trocar Arquivo' : 'Fazer Upload'}
            </>
          )}
        </Button>
      </div>
      
      {/* Erro */}
      {error && (
        <div className="p-2 rounded bg-destructive/10 border border-destructive/30 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
          <div className="flex-1 text-xs text-destructive">{error}</div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={clearError}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
      
      {/* Lista de datasets disponíveis */}
      {datasets.length > 0 && (
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">
            Ou selecione um arquivo já carregado:
          </Label>
          
          <ScrollArea className="h-32">
            <div className="space-y-1">
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  onClick={() => onSelectDataset(dataset.id)}
                  className={`
                    w-full text-left p-2 rounded-lg text-sm transition-colors
                    ${dataset.id === currentDatasetId 
                      ? 'bg-primary/10 border border-primary/30' 
                      : 'bg-card/50 border border-transparent hover:border-border'
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-3 h-3 text-muted-foreground" />
                    <span className="truncate">{dataset.name}</span>
                    {dataset.id === currentDatasetId && (
                      <Check className="w-3 h-3 text-primary ml-auto" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

