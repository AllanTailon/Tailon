"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useWorkflowStore } from '@/lib/workflow/store';
import { 
  BLOCK_DEFINITIONS, 
  getCategoryLabel, 
  NodeCategory, 
  NodeConfig,
  Constraint,
  Preference,
  CONSTRAINT_OPERATORS,
  createEmptyConstraint,
  createEmptyPreference,
} from '@/lib/workflow/types';
import { X, Trash2, Settings2, Plus, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import ExcelInputConfig from './ExcelInputConfig';

const categoryColors: Record<NodeCategory, string> = {
  input: 'text-sky-400',
  process: 'text-amber-400',
  rule: 'text-violet-400',
  optimize: 'text-emerald-400',
  output: 'text-rose-400',
};

// Componente para editar uma restrição individual
function ConstraintEditor({ 
  constraint, 
  onChange, 
  onRemove 
}: { 
  constraint: Constraint; 
  onChange: (c: Constraint) => void; 
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-border/50 rounded-lg p-3 bg-card/30">
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
        <Input
          value={constraint.name}
          onChange={(e) => onChange({ ...constraint, name: e.target.value })}
          placeholder="Nome da restrição"
          className="flex-1 h-8 text-sm bg-input"
        />
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      
      {expanded && (
        <div className="space-y-3 mt-3 pl-6">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Tipo</Label>
              <select
                value={constraint.type}
                onChange={(e) => onChange({ ...constraint, type: e.target.value as 'hard' | 'soft' })}
                className="w-full mt-1 p-2 rounded-md bg-input border border-border text-sm h-9"
              >
                <option value="hard">Obrigatória (hard)</option>
                <option value="soft">Preferência (soft)</option>
              </select>
            </div>
            {constraint.type === 'soft' && (
              <div className="w-20">
                <Label className="text-xs">Peso</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={constraint.weight || 5}
                  onChange={(e) => onChange({ ...constraint, weight: parseInt(e.target.value) || 5 })}
                  className="mt-1 h-9 text-sm bg-input"
                />
              </div>
            )}
          </div>
          
          <div>
            <Label className="text-xs">Operador</Label>
            <select
              value={constraint.operator}
              onChange={(e) => onChange({ ...constraint, operator: e.target.value as Constraint['operator'] })}
              className="w-full mt-1 p-2 rounded-md bg-input border border-border text-sm"
            >
              {CONSTRAINT_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label} - {op.description}
                </option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Coluna</Label>
              <Input
                value={constraint.column || ''}
                onChange={(e) => onChange({ ...constraint, column: e.target.value })}
                placeholder="nome_coluna"
                className="mt-1 h-9 text-sm bg-input"
              />
            </div>
            <div>
              <Label className="text-xs">Valor</Label>
              <Input
                value={constraint.value || ''}
                onChange={(e) => onChange({ ...constraint, value: e.target.value })}
                placeholder="valor"
                className="mt-1 h-9 text-sm bg-input"
              />
            </div>
          </div>
          
          {constraint.operator === 'between' && (
            <div>
              <Label className="text-xs">Valor 2 (para "entre")</Label>
              <Input
                value={constraint.value2 || ''}
                onChange={(e) => onChange({ ...constraint, value2: e.target.value })}
                placeholder="valor máximo"
                className="mt-1 h-9 text-sm bg-input"
              />
            </div>
          )}
          
          {['max_per_group', 'min_per_group', 'balanced'].includes(constraint.operator) && (
            <div>
              <Label className="text-xs">Agrupar por</Label>
              <Input
                value={constraint.groupBy || ''}
                onChange={(e) => onChange({ ...constraint, groupBy: e.target.value })}
                placeholder="coluna_grupo"
                className="mt-1 h-9 text-sm bg-input"
              />
            </div>
          )}
          
          <div>
            <Label className="text-xs">Descrição (opcional)</Label>
            <textarea
              value={constraint.description || ''}
              onChange={(e) => onChange({ ...constraint, description: e.target.value })}
              placeholder="Descreva a restrição..."
              rows={2}
              className="w-full mt-1 p-2 rounded-md bg-input border border-border text-sm resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Componente para editar uma preferência individual
function PreferenceEditor({ 
  preference, 
  onChange, 
  onRemove 
}: { 
  preference: Preference; 
  onChange: (p: Preference) => void; 
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-border/50 rounded-lg p-3 bg-card/30">
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
        <Input
          value={preference.name}
          onChange={(e) => onChange({ ...preference, name: e.target.value })}
          placeholder="Nome da preferência"
          className="flex-1 h-8 text-sm bg-input"
        />
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      
      {expanded && (
        <div className="space-y-3 mt-3 pl-6">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Tipo</Label>
              <select
                value={preference.type}
                onChange={(e) => onChange({ ...preference, type: e.target.value as Preference['type'] })}
                className="w-full mt-1 p-2 rounded-md bg-input border border-border text-sm h-9"
              >
                <option value="maximize">Maximizar</option>
                <option value="minimize">Minimizar</option>
                <option value="prefer_value">Preferir valor</option>
                <option value="avoid_value">Evitar valor</option>
                <option value="balance">Balancear</option>
              </select>
            </div>
            <div className="w-20">
              <Label className="text-xs">Peso</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={preference.weight}
                onChange={(e) => onChange({ ...preference, weight: parseInt(e.target.value) || 5 })}
                className="mt-1 h-9 text-sm bg-input"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Coluna</Label>
              <Input
                value={preference.column || ''}
                onChange={(e) => onChange({ ...preference, column: e.target.value })}
                placeholder="nome_coluna"
                className="mt-1 h-9 text-sm bg-input"
              />
            </div>
            {['prefer_value', 'avoid_value'].includes(preference.type) && (
              <div>
                <Label className="text-xs">Valor alvo</Label>
                <Input
                  value={preference.targetValue || ''}
                  onChange={(e) => onChange({ ...preference, targetValue: e.target.value })}
                  placeholder="valor"
                  className="mt-1 h-9 text-sm bg-input"
                />
              </div>
            )}
          </div>
          
          <div>
            <Label className="text-xs">Descrição (opcional)</Label>
            <textarea
              value={preference.description || ''}
              onChange={(e) => onChange({ ...preference, description: e.target.value })}
              placeholder="Descreva a preferência..."
              rows={2}
              className="w-full mt-1 p-2 rounded-md bg-input border border-border text-sm resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfigPanel() {
  const selectedNode = useWorkflowStore((state) => state.selectedNode);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const updateNodeConfig = useWorkflowStore((state) => state.updateNodeConfig);
  const removeNode = useWorkflowStore((state) => state.removeNode);
  
  const [localConfig, setLocalConfig] = useState<NodeConfig>({});
  
  // Sincroniza config local com node selecionado
  useEffect(() => {
    if (selectedNode) {
      setLocalConfig(selectedNode.data.config || {});
    }
  }, [selectedNode]);
  
  if (!selectedNode) {
    return (
      <Card className="w-80 h-full border-l rounded-none bg-sidebar">
        <CardContent className="flex flex-col items-center justify-center h-full text-center p-6">
          <Settings2 className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            Selecione um bloco para configurar
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const blockDef = BLOCK_DEFINITIONS.find((b) => b.type === selectedNode.data.blockType);
  const category = selectedNode.data.category as NodeCategory;
  
  const handleChange = (key: string, value: string | number | boolean | Constraint[] | Preference[]) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    updateNodeConfig(selectedNode.id, newConfig);
  };
  
  const handleDelete = () => {
    removeNode(selectedNode.id);
  };
  
  const handleClose = () => {
    selectNode(null);
  };
  
  // Handlers para restrições
  const handleAddConstraint = () => {
    const constraints = (localConfig.constraints as Constraint[]) || [];
    handleChange('constraints', [...constraints, createEmptyConstraint()]);
  };
  
  const handleUpdateConstraint = (index: number, constraint: Constraint) => {
    const constraints = [...((localConfig.constraints as Constraint[]) || [])];
    constraints[index] = constraint;
    handleChange('constraints', constraints);
  };
  
  const handleRemoveConstraint = (index: number) => {
    const constraints = [...((localConfig.constraints as Constraint[]) || [])];
    constraints.splice(index, 1);
    handleChange('constraints', constraints);
  };
  
  // Handlers para preferências
  const handleAddPreference = () => {
    const preferences = (localConfig.preferences as Preference[]) || [];
    handleChange('preferences', [...preferences, createEmptyPreference()]);
  };
  
  const handleUpdatePreference = (index: number, preference: Preference) => {
    const preferences = [...((localConfig.preferences as Preference[]) || [])];
    preferences[index] = preference;
    handleChange('preferences', preferences);
  };
  
  const handleRemovePreference = (index: number) => {
    const preferences = [...((localConfig.preferences as Preference[]) || [])];
    preferences.splice(index, 1);
    handleChange('preferences', preferences);
  };

  return (
    <Card className="w-96 h-full border-l rounded-none bg-sidebar">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Configuração</CardTitle>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={`${categoryColors[category]} border-current/30`}
          >
            {getCategoryLabel(category)}
          </Badge>
          <span className="text-sm font-medium">{selectedNode.data.label}</span>
        </div>
        
        {blockDef && (
          <p className="text-xs text-muted-foreground mt-1">
            {blockDef.description}
          </p>
        )}
      </CardHeader>
      
      <Separator />
      
      <ScrollArea className="h-[calc(100vh-280px)]">
        <CardContent className="pt-4">
          {/* Configuração especial para bloco de Excel */}
          {selectedNode.data.blockType === 'excel-input' && (
            <ExcelInputConfig
              nodeId={selectedNode.id}
              currentDatasetId={localConfig.datasetId as string}
              onSelectDataset={(datasetId) => handleChange('datasetId', datasetId)}
            />
          )}
          
          {/* Campos de configuração padrão (exceto para excel-input) */}
          {selectedNode.data.blockType !== 'excel-input' && blockDef?.configFields.map((field) => (
            <div key={field.key} className="mb-4">
              {/* Campo de restrições */}
              {field.type === 'constraints' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Restrições</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleAddConstraint}
                      className="h-7 text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    {((localConfig.constraints as Constraint[]) || []).map((constraint, index) => (
                      <ConstraintEditor
                        key={constraint.id}
                        constraint={constraint}
                        onChange={(c) => handleUpdateConstraint(index, c)}
                        onRemove={() => handleRemoveConstraint(index)}
                      />
                    ))}
                    
                    {((localConfig.constraints as Constraint[]) || []).length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                        Nenhuma restrição definida.
                        <br />
                        Clique em "Adicionar" para criar.
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Campo de preferências */}
              {field.type === 'preferences' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Preferências</Label>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleAddPreference}
                      className="h-7 text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    {((localConfig.preferences as Preference[]) || []).map((preference, index) => (
                      <PreferenceEditor
                        key={preference.id}
                        preference={preference}
                        onChange={(p) => handleUpdatePreference(index, p)}
                        onRemove={() => handleRemovePreference(index)}
                      />
                    ))}
                    
                    {((localConfig.preferences as Preference[]) || []).length === 0 && (
                      <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                        Nenhuma preferência definida.
                        <br />
                        Clique em "Adicionar" para criar.
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Campos padrão */}
              {field.type !== 'constraints' && field.type !== 'preferences' && (
                <>
                  <Label htmlFor={field.key} className="text-sm">
                    {field.label}
                    {field.sensitive && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Sensível
                      </Badge>
                    )}
                  </Label>
                  
                  {field.type === 'text' && (
                    <Input
                      id={field.key}
                      value={(localConfig[field.key] as string) || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1.5 bg-input"
                      autoComplete="off"
                    />
                  )}
                  
                  {field.type === 'number' && (
                    <Input
                      id={field.key}
                      type="number"
                      value={(localConfig[field.key] as number) || field.defaultValue || ''}
                      onChange={(e) => handleChange(field.key, parseFloat(e.target.value) || 0)}
                      className="mt-1.5 bg-input"
                    />
                  )}
                  
                  {field.type === 'select' && (
                    <select
                      id={field.key}
                      value={(localConfig[field.key] as string) || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="w-full mt-1.5 p-2 rounded-md bg-input border border-border text-sm"
                    >
                      <option value="">Selecione...</option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  
                  {field.type === 'boolean' && (
                    <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(localConfig[field.key] as boolean) ?? field.defaultValue ?? false}
                        onChange={(e) => handleChange(field.key, e.target.checked)}
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm text-muted-foreground">Ativado</span>
                    </label>
                  )}
                  
                  {field.type === 'textarea' && (
                    <textarea
                      id={field.key}
                      value={(localConfig[field.key] as string) || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full mt-1.5 p-2 rounded-md bg-input border border-border text-sm resize-none"
                    />
                  )}
                </>
              )}
            </div>
          ))}
          
          {selectedNode.data.blockType !== 'excel-input' && (!blockDef?.configFields || blockDef.configFields.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Este bloco não tem configurações
            </p>
          )}
        </CardContent>
      </ScrollArea>
      
      <Separator />
      
      <div className="p-4">
        <Button 
          variant="destructive" 
          className="w-full"
          onClick={handleDelete}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Remover Bloco
        </Button>
      </div>
    </Card>
  );
}
