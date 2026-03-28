# Análise: O que falta implementar no Tailon

> **Atualização:** o MVP de execução (executor com pandas, `data_store`, `POST /execute`, Excel de saída em base64, botão Executar no editor) foi implementado. Este documento serve como histórico; veja o [README](../README.md) e a seção Roadmap.

Análise do código atual em relação ao plano de **execução completa do workflow** (Excel → processamento → Alocar → Exportar Excel).

---

## 1. Backend – Engine de execução (`backend/app/engine/executor.py`)

### Situação atual
- Ordenação topológica e validação estão implementadas.
- `_execute_node()` é **placeholder**: retorna objetos genéricos (`{"type": ..., "config": ...}`) e **não processa dados reais**.

### O que falta

| Node type      | Deve fazer                                      | Status      |
|----------------|--------------------------------------------------|------------|
| **excel-input** | Carregar DataFrame do `data_store` usando `config.datasetId` | ❌ Não feito |
| **filter**      | Aplicar filtro pandas no DataFrame de entrada (coluna, operador, valor) | ❌ Não feito |
| **group**       | Agrupar por coluna com pandas                    | ❌ Não feito |
| **constraints** | Converter `config.constraints` para formato do OR-Tools | ❌ Não feito |
| **preferences** | Converter `config.preferences` para formato do OR-Tools | ❌ Não feito |
| **allocate**    | Chamar `AllocationSolver` com recursos/targets dos inputs e restrições | ❌ Não feito |
| **schedule**    | Chamar `SchedulingSolver` (ou reutilizar allocate) | ❌ Não feito |
| **excel-output**| Gerar arquivo .xlsx a partir do resultado        | ❌ Não feito |
| **preview**     | Retornar dados para exibição (já pode ser só o último DataFrame) | ❌ Não feito |

- O executor **não recebe** o `DataStore` (ou um mapeamento `dataset_id → DataFrame`). É preciso **injetar o data_store** (ou os dados) na execução para que os nodes `excel-input` leiam os datasets corretos.

---

## 2. Backend – Router de workflows (`backend/app/routers/workflows.py`)

### Situação atual
- `POST /execute` existe e valida o workflow.
- Quando `dry_run=False`, **não chama** o `WorkflowExecutor` para execução real; devolve mensagem fixa “Execução simulada com sucesso”.

### O que falta
- Chamar `WorkflowExecutor(workflow).execute(dry_run=False)` quando `dry_run=False`.
- Passar para o executor os **datasets disponíveis** (ex.: acessar o mesmo `data_store` usado em `/data/upload`), para que nodes `excel-input` usem `config.datasetId`.
- Se houver node **excel-output**, o resultado da execução deve incluir o **arquivo Excel** (ver item 3).
- Preencher `WorkflowExecuteResponse` com resultado real: `node_results`, `result`, `errors`, `warnings`, e, se aplicável, referência ao arquivo gerado (URL ou base64).

---

## 3. Backend – Geração e retorno do Excel

### Situação atual
- Não existe endpoint nem função que **gere um .xlsx** a partir de um DataFrame ou da saída do workflow.
- `WorkflowExecuteResponse` tem apenas `result: Dict`; não há campo para arquivo (ex.: `download_url`, `file_base64`, `filename`).

### O que falta
- **Serviço/função** que receba um DataFrame (ou lista de DataFrames/dict) e gere um arquivo .xlsx (ex.: `pandas.DataFrame.to_excel` ou openpyxl).
- **Dois caminhos possíveis:**
  - **A)** Endpoint separado, ex.: `GET /api/v1/workflows/execute/{execution_id}/download`, que retorna o arquivo gerado (e o executor guarda o resultado por `execution_id`), **ou**
  - **B)** Incluir na resposta de `POST /execute` um campo com o arquivo em base64 + nome do arquivo, e o frontend faz o download a partir disso.
- Garantir que o node **excel-output** use essa geração (nome/aba vindo do `config` do node).

---

## 4. Frontend – Chamada à API e fluxo de “Executar”

### Situação atual
- No editor, o botão **Executar** chama `handleRun`, que só abre um `alert("Funcionalidade de execução será implementada na próxima fase.")`.
- Não há chamada HTTP para o backend.
- Não há função em `frontend/lib/api.ts` para executar workflow.

### O que falta
- Em `lib/api.ts`:
  - Função `executeWorkflow(workflowPayload, options?: { dryRun?: boolean })` que envia `POST /api/v1/workflows/execute` com body no formato esperado pelo backend (ex.: `WorkflowExecuteRequest`: `workflow` + `dry_run`).
  - O payload do workflow deve ser o mesmo que o editor usa (nodes/edges com `config`, incluindo `datasetId` nos nodes de Excel).
- No `editor/page.tsx` (ou componente de execução):
  - Ao clicar em **Executar**:
    - Montar o payload do workflow a partir do store (export do workflow atual, incluindo `config.datasetId` nos blocos de Excel).
    - Chamar `executeWorkflow` com `dry_run: false`.
    - Tratar loading (desabilitar botão / mostrar “Executando…”).
  - Tratar resposta:
    - Sucesso: se a API retornar link ou base64 do Excel, disparar **download** do arquivo; opcionalmente mostrar mensagem de sucesso e resumo (ex.: “X nós executados”).
    - Erro: exibir `message` e `errors` (e opcionalmente `warnings`) de forma clara (toast, modal ou painel).
- Validação mínima antes de executar: pelo menos um node; se houver blocos “Importar Excel”, eles devem ter `config.datasetId` preenchido (senão avisar o usuário).

---

## 5. Resumo por camada

| Camada   | O que falta |
|----------|----------------------------------------------------------------|
| **Executor** | Implementar execução real por tipo de node (Excel, Filter, Group, Restrições, Alocar, Excel output); injetar data_store (ou dados) na execução. |
| **Router**   | Usar `WorkflowExecutor` quando `dry_run=False`; integrar com data_store; retornar resultado completo e, se houver excel-output, indicar arquivo (URL ou base64). |
| **Excel out**| Função para gerar .xlsx a partir do resultado; definir como o arquivo é devolvido (endpoint de download ou base64 na resposta). |
| **Frontend** | Função `executeWorkflow` na API; botão Executar chamando essa API; loading; tratamento de sucesso (download do Excel) e de erro. |

---

## 6. Ordem sugerida de implementação

1. **Backend:** Injetar `data_store` (ou interface de acesso a datasets) no fluxo de execução e implementar no executor:
   - `excel-input`: carregar DataFrame por `config.datasetId`.
   - `filter` e `group`: lógica com pandas.
2. **Backend:** No router `/execute`, chamar o executor de verdade quando `dry_run=False` e preencher `WorkflowExecuteResponse`.
3. **Backend:** Função de geração de Excel + incluir arquivo na resposta (ou endpoint de download).
4. **Backend:** Implementar nodes de regra e **allocate** (conectar executor ao `AllocationSolver` e aos dados dos inputs).
5. **Frontend:** `executeWorkflow` em `api.ts` e fluxo completo no botão Executar (payload, loading, download, erros).

Com isso, o que “ficou faltando criar” está coberto: executor real, geração de Excel, integração no router e fluxo de execução no frontend.
