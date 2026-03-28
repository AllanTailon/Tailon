# Tailon - Plataforma de Otimização e Alocação Visual

Sistema visual para criar fluxos de otimização e alocação, similar ao N8N, permitindo que usuários arrastem blocos de regras e criem sistemas personalizados sem código.

## Rodando com Docker (Recomendado)

A forma mais fácil de rodar o projeto é com Docker. Você só precisa ter o Docker instalado.

### Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/) (geralmente já vem com Docker Desktop)

### Rodar em Desenvolvimento

```bash
# Clone o repositório e entre na pasta
cd /home/cayena/App/Tailon

# Suba os containers (primeira vez pode demorar)
docker-compose up --build

# Ou em background
docker-compose up -d --build
```

Acesse:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Documentação da API**: http://localhost:8000/docs

### Comandos Úteis

```bash
# Ver logs
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f frontend
docker-compose logs -f backend

# Parar os containers
docker-compose down

# Reconstruir após mudanças no Dockerfile
docker-compose up --build

# Limpar tudo (containers, volumes, imagens)
docker-compose down -v --rmi all
```

### Rodar em Produção

```bash
# Use o arquivo de produção
docker-compose -f docker-compose.prod.yml up --build -d
```

---

## Rodando sem Docker (Manual)

Se preferir rodar sem Docker:

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt

# Configure variáveis de ambiente
export ENVIRONMENT=development
export CORS_ORIGINS=http://localhost:3000
export SECRET_KEY=dev-secret-key

uvicorn app.main:app --reload
```

---

## Estrutura do Projeto

```
tailon/
├── frontend/              # Next.js 14 + React Flow
│   ├── app/               # App Router pages
│   ├── components/        # Componentes React
│   │   ├── flow/          # Componentes do editor visual
│   │   └── ui/            # shadcn/ui components
│   ├── lib/               # Utilitários e stores
│   ├── Dockerfile         # Build de produção
│   └── Dockerfile.dev     # Build de desenvolvimento
│
├── backend/               # FastAPI
│   └── app/
│       ├── engine/        # Engine de execução de workflows
│       ├── models/        # Modelos Pydantic
│       └── routers/       # Endpoints da API
│
├── docker-compose.yml     # Desenvolvimento
└── docker-compose.prod.yml # Produção
```

## Funcionalidades

### Editor Visual
- Canvas interativo com React Flow
- Arrastar e soltar blocos
- Conectar blocos com edges
- Configurar cada bloco individualmente
- Importar/Exportar workflows como JSON

### Tipos de Blocos

| Categoria | Blocos | Descrição |
|-----------|--------|-----------|
| **Entrada** | Excel Import, Manual Input | Fontes de dados |
| **Processamento** | Filtrar, Agrupar | Transformação de dados |
| **Regras** | Restrição, Preferência | Definir constraints |
| **Otimização** | Alocar | Algoritmos OR-Tools |
| **Saída** | Excel Export, Visualizar | Exportação de resultados |

### Execução de workflow

1. Faça upload dos Excel em **Dados** ou configure cada bloco **Importar Excel** com um dataset.
2. Monte o fluxo (ex.: Importar Excel → Filtrar → Exportar Excel).
3. Clique em **Executar**. O backend processa com pandas; se houver bloco **Exportar Excel**, o arquivo é baixado automaticamente.
4. Datasets ficam na memória do backend (mesma instância que recebe o upload).

### API Endpoints

- `POST /api/v1/workflows` - Criar workflow
- `GET /api/v1/workflows` - Listar workflows
- `GET /api/v1/workflows/{id}` - Obter workflow
- `PUT /api/v1/workflows/{id}` - Atualizar workflow
- `DELETE /api/v1/workflows/{id}` - Remover workflow
- `POST /api/v1/workflows/execute` - Executar workflow (`dry_run: false` para execução real; resposta pode incluir `output_file_base64` + `output_filename`)
- `POST /api/v1/data/upload` - Upload de Excel/CSV

## Segurança

O projeto implementa várias medidas de segurança:

- **Validação de entrada**: Todos os dados são validados com Pydantic
- **Sanitização**: Inputs são sanitizados para prevenir XSS e injeção
- **Rate Limiting**: Limites de requisições por IP
- **CORS**: Configuração restrita de origens permitidas
- **Headers de Segurança**: X-Content-Type-Options, X-Frame-Options, etc.
- **Containers isolados**: Docker isola a aplicação do sistema host
- **Usuário não-root**: Containers rodam com usuário sem privilégios

## Roadmap

### Curto prazo

- Testes automatizados (pytest) para o executor e rota `/execute`
- Melhorias no bloco **Agendar** (scheduling com OR-Tools)
- UI para exibir preview do resultado sem depender só do `alert`

### Médio prazo

- Persistência (SQLite/Postgres) para workflows e metadados de datasets
- Autenticação e isolamento por usuário/tenant

### Futuro: IA para condições

- Endpoint (ex.: `POST /api/v1/ai/suggest-constraints`) que recebe texto em linguagem natural e schema das colunas
- Resposta JSON validada (whitelist de operadores) preenchendo restrições/preferências no editor
- Chaves de API apenas em variáveis de ambiente; rate limit e logs sem dados sensíveis

## Licença

Proprietário - Todos os direitos reservados.
