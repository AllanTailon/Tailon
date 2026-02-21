"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useDataStore } from '@/lib/workflow/data-store';
import { DatasetInfo } from '@/lib/api';
import { 
  Upload, 
  FileSpreadsheet, 
  Trash2, 
  Eye, 
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Database
} from 'lucide-react';

// Componente para mostrar um dataset na lista
function DatasetItem({ 
  dataset, 
  isSelected,
  onSelect,
  onDelete,
}: { 
  dataset: DatasetInfo;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div 
      onClick={onSelect}
      className={`
        p-3 rounded-lg border cursor-pointer transition-all
        ${isSelected 
          ? 'border-primary bg-primary/10' 
          : 'border-border/50 bg-card/30 hover:border-border'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded bg-sky-500/10 text-sky-400">
          <FileSpreadsheet className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{dataset.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {dataset.row_count} linhas
            </Badge>
            <Badge variant="outline" className="text-xs">
              {dataset.column_count} colunas
            </Badge>
          </div>
          {dataset.sheet_name && (
            <p className="text-xs text-muted-foreground mt-1">
              Aba: {dataset.sheet_name}
            </p>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Componente de preview de dados
function DataPreview() {
  const { selectedDataset, preview, previewLoading } = useDataStore();
  
  if (!selectedDataset) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Selecione um dataset para ver o preview</p>
      </div>
    );
  }
  
  if (previewLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (!preview) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Não foi possível carregar o preview</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{selectedDataset.name}</h4>
        <Badge variant="outline" className="text-xs">
          {preview.total_rows} linhas total
        </Badge>
      </div>
      
      {/* Colunas */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Colunas:</p>
        <div className="flex flex-wrap gap-1">
          {selectedDataset.columns.map((col) => (
            <Badge 
              key={col.name} 
              variant="secondary" 
              className="text-xs font-mono"
            >
              {col.name}
              <span className="ml-1 opacity-50">({col.dtype})</span>
            </Badge>
          ))}
        </div>
      </div>
      
      {/* Tabela de preview */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {preview.columns.map((col) => (
                  <th key={col} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 10).map((row, i) => (
                <tr key={i} className="border-t border-border/50">
                  {preview.columns.map((col) => (
                    <td key={col} className="px-2 py-1.5 whitespace-nowrap">
                      {row[col] !== null && row[col] !== undefined 
                        ? String(row[col]).slice(0, 30) 
                        : <span className="text-muted-foreground">null</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.rows.length > 10 && (
          <div className="text-center py-1 text-xs text-muted-foreground bg-muted/30">
            ... e mais {preview.rows.length - 10} linhas
          </div>
        )}
      </div>
    </div>
  );
}

interface DataPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DataPanel({ isOpen, onClose }: DataPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPreview, setShowPreview] = useState(true);
  
  const {
    datasets,
    loading,
    error,
    selectedDataset,
    fetchDatasets,
    uploadMultiple,
    selectDataset,
    removeDataset,
    clearError,
  } = useDataStore();
  
  // Carrega datasets ao abrir
  useEffect(() => {
    if (isOpen) {
      fetchDatasets();
    }
  }, [isOpen, fetchDatasets]);
  
  // Handler de upload
  const handleUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await uploadMultiple(files);
    }
    // Limpa input
    e.target.value = '';
  }, [uploadMultiple]);
  
  // Handler de drag and drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    );
    if (files.length > 0) {
      await uploadMultiple(files);
    }
  }, [uploadMultiple]);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  
  if (!isOpen) return null;
  
  return (
    <Card className="absolute top-4 left-4 w-96 max-h-[calc(100vh-200px)] z-50 shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Dados</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Carregue planilhas Excel para usar no workflow
        </p>
      </CardHeader>
      
      <Separator />
      
      <CardContent className="pt-4">
        {/* Área de upload */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={handleUpload}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Arraste arquivos ou clique para fazer upload
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            .xlsx, .xls, .csv (máx 10MB)
          </p>
        </div>
        
        {/* Erro */}
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 mt-1 text-xs"
                onClick={clearError}
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
        
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
          </div>
        )}
        
        {/* Lista de datasets */}
        {datasets.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Datasets Carregados</h4>
              <Badge variant="outline">{datasets.length}</Badge>
            </div>
            
            <ScrollArea className="h-48">
              <div className="space-y-2 pr-2">
                {datasets.map((dataset) => (
                  <DatasetItem
                    key={dataset.id}
                    dataset={dataset}
                    isSelected={selectedDataset?.id === dataset.id}
                    onSelect={() => selectDataset(dataset)}
                    onDelete={() => removeDataset(dataset.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
        
        {/* Preview */}
        {datasets.length > 0 && (
          <>
            <Separator className="my-4" />
            
            <div>
              <Button
                variant="ghost"
                className="w-full justify-between h-8 px-2"
                onClick={() => setShowPreview(!showPreview)}
              >
                <span className="text-sm font-medium">Preview dos Dados</span>
                {showPreview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
              
              {showPreview && (
                <div className="mt-2">
                  <DataPreview />
                </div>
              )}
            </div>
          </>
        )}
        
        {/* Estado vazio */}
        {!loading && datasets.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum dataset carregado</p>
            <p className="text-xs mt-1">
              Faça upload de arquivos Excel para começar
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

