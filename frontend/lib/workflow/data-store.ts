/**
 * Store para gerenciar datasets carregados.
 */

import { create } from 'zustand';
import {
  DatasetInfo,
  DatasetPreview,
  listDatasets,
  uploadFile,
  uploadMultipleFiles,
  getDatasetPreview,
  deleteDataset,
  clearAllDatasets,
} from '../api';

interface DataState {
  // Estado
  datasets: DatasetInfo[];
  loading: boolean;
  error: string | null;
  selectedDataset: DatasetInfo | null;
  preview: DatasetPreview | null;
  previewLoading: boolean;
  
  // Ações
  fetchDatasets: () => Promise<void>;
  uploadFile: (file: File, options?: { sheetName?: string; hasHeader?: boolean }) => Promise<DatasetInfo | null>;
  uploadMultiple: (files: File[], hasHeader?: boolean) => Promise<DatasetInfo[]>;
  selectDataset: (dataset: DatasetInfo | null) => void;
  loadPreview: (datasetId: string) => Promise<void>;
  removeDataset: (datasetId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  clearError: () => void;
}

export const useDataStore = create<DataState>((set, get) => ({
  datasets: [],
  loading: false,
  error: null,
  selectedDataset: null,
  preview: null,
  previewLoading: false,
  
  fetchDatasets: async () => {
    set({ loading: true, error: null });
    try {
      const response = await listDatasets();
      set({ datasets: response.datasets, loading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Erro ao carregar datasets',
        loading: false 
      });
    }
  },
  
  uploadFile: async (file, options) => {
    set({ loading: true, error: null });
    try {
      const response = await uploadFile(file, options);
      
      if (response.success && response.dataset_info) {
        set((state) => ({
          datasets: [...state.datasets, response.dataset_info!],
          loading: false,
        }));
        return response.dataset_info;
      } else {
        set({ 
          error: response.errors.join(', ') || response.message,
          loading: false 
        });
        return null;
      }
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Erro ao fazer upload',
        loading: false 
      });
      return null;
    }
  },
  
  uploadMultiple: async (files, hasHeader = true) => {
    set({ loading: true, error: null });
    try {
      const response = await uploadMultipleFiles(files, hasHeader);
      
      if (response.uploaded.length > 0) {
        set((state) => ({
          datasets: [...state.datasets, ...response.uploaded],
          loading: false,
        }));
      }
      
      if (response.failed.length > 0) {
        const failedNames = response.failed.map(f => f.filename).join(', ');
        set({ error: `Falha em: ${failedNames}` });
      } else {
        set({ loading: false });
      }
      
      return response.uploaded;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Erro ao fazer upload',
        loading: false 
      });
      return [];
    }
  },
  
  selectDataset: (dataset) => {
    set({ selectedDataset: dataset, preview: null });
    if (dataset) {
      get().loadPreview(dataset.id);
    }
  },
  
  loadPreview: async (datasetId) => {
    set({ previewLoading: true });
    try {
      const preview = await getDatasetPreview(datasetId);
      set({ preview, previewLoading: false });
    } catch (error) {
      set({ previewLoading: false });
    }
  },
  
  removeDataset: async (datasetId) => {
    try {
      await deleteDataset(datasetId);
      set((state) => ({
        datasets: state.datasets.filter(d => d.id !== datasetId),
        selectedDataset: state.selectedDataset?.id === datasetId ? null : state.selectedDataset,
        preview: state.selectedDataset?.id === datasetId ? null : state.preview,
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Erro ao remover dataset' });
    }
  },
  
  clearAll: async () => {
    try {
      await clearAllDatasets();
      set({ datasets: [], selectedDataset: null, preview: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Erro ao limpar datasets' });
    }
  },
  
  clearError: () => set({ error: null }),
}));

