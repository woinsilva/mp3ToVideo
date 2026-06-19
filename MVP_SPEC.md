# Especificacao de Desenvolvimento - MVP SaaS Gerador de Videoclipes

## 1. Objetivo do MVP

Criar um MVP SaaS capaz de receber um arquivo MP3, processar esse arquivo de forma assincrona e entregar ao usuario um video final em MP4.

O primeiro objetivo tecnico nao e ter geracao real avancada de video por IA. O objetivo inicial e construir a espinha dorsal completa do produto:

1. Usuario envia um MP3 pelo frontend.
2. Backend salva o arquivo.
3. Backend cria um projeto.
4. Backend cria jobs em fila.
5. Worker processa o projeto em etapas.
6. Sistema gera uma representacao inicial de storyboard e cenas.
7. Sistema monta um MP4 final sincronizado com o audio.
8. Usuario acompanha o progresso.
9. Usuario baixa o video final.

No MVP, a geracao visual pode ser feita com cenas placeholder usando FFmpeg, imagens estaticas, textos, cores e legendas. A arquitetura deve permitir trocar esses placeholders futuramente por videos gerados por Kling, PixVerse, OpenAI, Gemini, Claude ou outro provedor.

## 2. Stack Obrigatoria

### Frontend

- Vue 3
- TypeScript
- Class Based Components
- Vue Router
- Pinia
- Vuetify
- Vite

### Backend

- Node.js
- TypeScript
- NestJS

### Banco de Dados

- PostgreSQL
- Prisma ORM recomendado

### Fila

- Redis
- BullMQ

### IA

- Whisper para transcricao
- Ollama para analise local e geracao de storyboard/prompts
- Arquitetura preparada para provedores futuros:
  - OpenAI
  - Gemini
  - Claude
  - Kling
  - PixVerse

### Renderizacao

- FFmpeg

### Infraestrutura

- Docker
- Docker Compose
- Volumes locais para desenvolvimento

### Testes

- Testes integrados no backend
- Testes unitarios
- Execucao obrigatoria da suite existente apos cada modulo implementado

## 3. Principios Arquiteturais

### 3.1 Clean Architecture no Backend

O backend deve separar dominio, aplicacao e infraestrutura.

Camadas:

- `domain`: entidades, enums, value objects e regras de negocio puras.
- `application`: casos de uso, interfaces/ports e orquestracao.
- `infrastructure`: banco, filas, storage, FFmpeg, IA e provedores externos.
- `interfaces`: controllers HTTP, DTOs de entrada/saida e presenters.

Regra importante:

- Dominio nao pode depender de NestJS, Prisma, BullMQ, FFmpeg, HTTP ou bibliotecas externas de infraestrutura.
- Aplicacao pode depender de interfaces, mas nao de implementacoes concretas.
- Infraestrutura implementa as interfaces da aplicacao.
- Controllers chamam use cases, nao repositories diretamente.

### 3.2 SaaS Multiusuario

Mesmo que o MVP tenha autenticacao simples, toda entidade importante deve estar preparada para multiusuario.

Entidades principais devem possuir:

- `organizationId`
- `createdByUserId`
- `createdAt`
- `updatedAt`
- `deletedAt`, quando fizer sentido

O conceito de `Organization` deve existir desde o inicio, mesmo que cada usuario tenha uma organizacao pessoal automaticamente.

### 3.3 Processamento Assincrono

Geracao de video e tarefas de IA sao demoradas. Nenhum processo pesado deve rodar diretamente dentro da requisicao HTTP.

Fluxo correto:

1. API recebe requisicao.
2. API valida, persiste estado inicial e cria job.
3. Worker processa job.
4. Worker atualiza status no banco.
5. Frontend consulta progresso.

### 3.4 Provedores Plugaveis

Whisper, Ollama e provedores de video devem ser acessados por interfaces.

Exemplo conceitual:

- `TranscriptionProvider`
- `TextGenerationProvider`
- `VideoGenerationProvider`
- `RenderingProvider`
- `StorageProvider`

Assim, o MVP pode usar implementacoes simples e locais, enquanto versoes futuras podem usar APIs externas.

### 3.5 Testes Como Parte Do Desenvolvimento

Testes nao devem ser deixados para o final. Cada modulo implementado deve incluir:

1. testes novos referentes ao proprio modulo
2. execucao dos testes integrados ja existentes
3. execucao dos testes unitarios ja existentes, quando afetarem o fluxo alterado

Objetivo:

- detectar regressao cedo
- garantir estabilidade do fluxo principal
- evitar acumular debito de testes entre modulos

Regras:

- todo modulo novo deve sair com cobertura minima do comportamento principal
- bugs corrigidos devem ganhar teste de regressao sempre que possivel
- regras criticas do produto devem ter cobertura unitaria e integrada adequada
- se um teste nao puder ser implementado naquele momento, isso deve ser registrado explicitamente

## 4. Resultado Esperado Do Primeiro Fluxo Vertical

O primeiro fluxo vertical deve ser:

1. Abrir frontend.
2. Criar projeto.
3. Enviar MP3.
4. Backend salvar MP3.
5. Backend criar job `project.process`.
6. Worker processar:
   - validar audio
   - obter duracao
   - criar secoes fake ou por IA local
   - criar cenas
   - renderizar video MP4 com FFmpeg
7. Frontend mostrar status.
8. Frontend exibir botao para baixar MP4.

Esse fluxo deve funcionar mesmo sem Whisper, Ollama ou provedor externo ativo. Quando essas ferramentas nao estiverem disponiveis, o sistema deve usar modo fallback/mock.

## 5. Estrutura Recomendada Do Monorepo

```text
.
├── README.md
├── MVP_SPEC.md
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps
│   ├── frontend
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   └── src
│   │       ├── main.ts
│   │       ├── App.vue
│   │       ├── router
│   │       │   └── index.ts
│   │       ├── stores
│   │       │   ├── auth.store.ts
│   │       │   └── projects.store.ts
│   │       ├── layouts
│   │       │   ├── AppLayout.vue
│   │       │   └── AuthLayout.vue
│   │       ├── pages
│   │       │   ├── LoginPage.vue
│   │       │   ├── RegisterPage.vue
│   │       │   ├── DashboardPage.vue
│   │       │   ├── CreateProjectPage.vue
│   │       │   ├── ProjectDetailPage.vue
│   │       │   ├── ProcessingPage.vue
│   │       │   └── VideoResultPage.vue
│   │       ├── components
│   │       │   ├── FileUploadCard.vue
│   │       │   ├── ProjectStatusTimeline.vue
│   │       │   ├── VideoPreview.vue
│   │       │   └── SceneList.vue
│   │       ├── services
│   │       │   ├── api.service.ts
│   │       │   ├── auth.service.ts
│   │       │   └── projects.service.ts
│   │       ├── plugins
│   │       │   ├── pinia.ts
│   │       │   ├── router.ts
│   │       │   └── vuetify.ts
│   │       ├── styles
│   │       │   └── main.scss
│   │       └── types
│   │           ├── project.types.ts
│   │           └── api.types.ts
│   ├── api
│   │   ├── package.json
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   └── src
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── config
│   │       │   ├── env.validation.ts
│   │       │   └── configuration.ts
│   │       ├── common
│   │       │   ├── filters
│   │       │   ├── guards
│   │       │   ├── interceptors
│   │       │   └── decorators
│   │       ├── database
│   │       │   ├── prisma.module.ts
│   │       │   └── prisma.service.ts
│   │       └── modules
│   │           ├── auth
│   │           ├── users
│   │           ├── organizations
│   │           ├── projects
│   │           ├── tracks
│   │           ├── lyrics
│   │           ├── storyboard
│   │           ├── scenes
│   │           ├── rendering
│   │           ├── jobs
│   │           ├── storage
│   │           └── ai-providers
│   └── worker
│       ├── package.json
│       ├── nest-cli.json
│       ├── tsconfig.json
│       └── src
│           ├── main.ts
│           ├── worker.module.ts
│           ├── processors
│           │   ├── project.processor.ts
│           │   ├── audio.processor.ts
│           │   ├── storyboard.processor.ts
│           │   ├── scenes.processor.ts
│           │   └── rendering.processor.ts
│           └── services
│               ├── pipeline-orchestrator.service.ts
│               ├── audio-analysis.service.ts
│               ├── mock-video-generation.service.ts
│               └── ffmpeg-render.service.ts
├── packages
│   ├── domain
│   │   ├── package.json
│   │   └── src
│   │       ├── index.ts
│   │       ├── users
│   │       ├── organizations
│   │       ├── projects
│   │       ├── tracks
│   │       ├── lyrics
│   │       ├── music-analysis
│   │       ├── storyboards
│   │       ├── scenes
│   │       ├── rendering
│   │       └── billing
│   ├── application
│   │   ├── package.json
│   │   └── src
│   │       ├── index.ts
│   │       ├── use-cases
│   │       ├── ports
│   │       ├── dtos
│   │       └── workflows
│   ├── infrastructure
│   │   ├── package.json
│   │   └── src
│   │       ├── index.ts
│   │       ├── persistence
│   │       ├── queue
│   │       ├── storage
│   │       ├── ai
│   │       ├── rendering
│   │       └── notifications
│   └── shared
│       ├── package.json
│       └── src
│           ├── index.ts
│           ├── constants
│           ├── errors
│           ├── events
│           ├── types
│           └── utils
├── prisma
│   ├── schema.prisma
│   ├── migrations
│   └── seed.ts
├── infra
│   ├── docker
│   │   ├── api.Dockerfile
│   │   ├── worker.Dockerfile
│   │   └── frontend.Dockerfile
│   ├── postgres
│   ├── redis
│   ├── nginx
│   └── scripts
├── storage
│   ├── uploads
│   ├── generated-scenes
│   ├── renders
│   └── temp
└── tests
    ├── unit
    ├── integration
    └── e2e
```

## 6. Modulos De Desenvolvimento

Esta secao deve ser usada como roteiro para implementar modulo por modulo.

## Regra Global De Entrega Por Modulo

Cada modulo so deve ser considerado concluido quando as etapas abaixo forem executadas:

1. implementacao do modulo
2. criacao ou atualizacao dos testes integrados do modulo
3. criacao ou atualizacao dos testes unitarios impactados pelo modulo
4. execucao dos testes existentes para detectar regressao
5. validacao manual minima do comportamento principal, quando aplicavel

Se algum teste falhar:

- o modulo nao deve ser dado como concluido
- a falha deve ser corrigida ou registrada como bloqueio real

Estrutura esperada de testes:

- `tests/unit`
- `tests/integration`

Backend:

- testes integrados devem validar controllers, use cases, persistencia e integracao entre camadas relevantes
- mocks devem ser usados apenas quando a dependencia externa for realmente fora do escopo do teste
- testes unitarios devem validar regras puras de dominio, mapeamentos, validacoes e pequenos servicos com comportamento isolado

## Modulo 1 - Base Do Monorepo E Infra Local

### Objetivo

Criar a estrutura inicial do projeto com pnpm workspaces, Docker Compose, PostgreSQL, Redis, API NestJS, Worker NestJS e Frontend Vue.

### Entregaveis

- `package.json` na raiz.
- `pnpm-workspace.yaml`.
- `tsconfig.base.json`.
- `docker-compose.yml`.
- `.env.example`.
- App NestJS API inicial.
- App NestJS Worker inicial.
- App Vue 3 inicial.
- PostgreSQL rodando via Docker.
- Redis rodando via Docker.

### Requisitos

- API deve subir em `http://localhost:3000`.
- Frontend deve subir em `http://localhost:5173`.
- PostgreSQL deve expor porta `5432`.
- Redis deve expor porta `6379`.
- Worker deve conseguir conectar no Redis.
- API deve ter endpoint `GET /health`.
- Worker deve logar que iniciou corretamente.

### Criterios De Aceite

- `docker compose up` sobe Postgres e Redis.
- `pnpm install` instala dependencias.
- `pnpm dev` sobe API, Worker e Frontend.
- `GET /health` retorna status OK.
- Existe estrutura inicial de testes unitarios e integrados pronta para crescer com os proximos modulos.

## Modulo 2 - Banco De Dados E Prisma

### Objetivo

Criar o schema inicial do banco com suporte a SaaS multiusuario e projetos de video.

### Entidades

#### User

Campos:

- `id`
- `email`
- `name`
- `passwordHash`
- `createdAt`
- `updatedAt`
- `deletedAt`

#### Organization

Campos:

- `id`
- `name`
- `slug`
- `createdAt`
- `updatedAt`
- `deletedAt`

#### OrganizationMember

Campos:

- `id`
- `organizationId`
- `userId`
- `role`
- `createdAt`
- `updatedAt`

Roles:

- `owner`
- `admin`
- `member`

#### Project

Campos:

- `id`
- `organizationId`
- `createdByUserId`
- `title`
- `status`
- `errorMessage`
- `createdAt`
- `updatedAt`
- `deletedAt`

Status:

- `draft`
- `uploaded`
- `queued`
- `processing`
- `analyzing`
- `storyboarding`
- `generating_scenes`
- `rendering`
- `completed`
- `failed`

#### Track

Campos:

- `id`
- `projectId`
- `originalFileName`
- `mimeType`
- `sizeBytes`
- `durationSeconds`
- `storagePath`
- `createdAt`
- `updatedAt`

#### Lyrics

Campos:

- `id`
- `projectId`
- `source`
- `rawText`
- `normalizedText`
- `createdAt`
- `updatedAt`

Sources:

- `manual`
- `whisper`
- `mock`

#### MusicSection

Campos:

- `id`
- `projectId`
- `type`
- `title`
- `startSeconds`
- `endSeconds`
- `lyricsExcerpt`
- `energy`
- `createdAt`
- `updatedAt`

Types:

- `intro`
- `verse`
- `chorus`
- `bridge`
- `outro`
- `instrumental`

#### Storyboard

Campos:

- `id`
- `projectId`
- `concept`
- `visualStyle`
- `mood`
- `colorPalette`
- `narrativeSummary`
- `createdAt`
- `updatedAt`

#### Scene

Campos:

- `id`
- `projectId`
- `musicSectionId`
- `index`
- `title`
- `description`
- `startSeconds`
- `endSeconds`
- `durationSeconds`
- `status`
- `videoAssetId`
- `createdAt`
- `updatedAt`

Status:

- `pending`
- `generating`
- `completed`
- `failed`

#### ScenePrompt

Campos:

- `id`
- `sceneId`
- `provider`
- `positivePrompt`
- `negativePrompt`
- `style`
- `camera`
- `createdAt`
- `updatedAt`

#### Asset

Campos:

- `id`
- `organizationId`
- `projectId`
- `type`
- `mimeType`
- `storagePath`
- `sizeBytes`
- `createdAt`
- `updatedAt`

Types:

- `audio`
- `image`
- `video_scene`
- `render`
- `subtitle`
- `temp`

#### Render

Campos:

- `id`
- `projectId`
- `status`
- `assetId`
- `durationSeconds`
- `createdAt`
- `updatedAt`

Status:

- `pending`
- `rendering`
- `completed`
- `failed`

#### ProcessingJob

Campos:

- `id`
- `projectId`
- `queueName`
- `jobName`
- `bullJobId`
- `status`
- `progress`
- `errorMessage`
- `createdAt`
- `updatedAt`

### Criterios De Aceite

- Prisma gera client corretamente.
- Migration inicial roda sem erro.
- Seed cria usuario demo e organizacao demo.
- Relacionamentos permitem consultar projeto com track, lyrics, sections, scenes e render.
- Testes integrados validam schema, relacionamentos principais e acesso basico ao banco.

## Modulo 3 - Autenticacao Simples E Organizacao

### Objetivo

Permitir cadastro, login e criacao automatica de organizacao pessoal.

### Endpoints

#### POST `/auth/register`

Entrada:

```json
{
  "name": "Demo User",
  "email": "demo@example.com",
  "password": "12345678"
}
```

Saida:

```json
{
  "accessToken": "...",
  "user": {
    "id": "...",
    "name": "Demo User",
    "email": "demo@example.com"
  },
  "organization": {
    "id": "...",
    "name": "Demo User Workspace"
  }
}
```

#### POST `/auth/login`

Entrada:

```json
{
  "email": "demo@example.com",
  "password": "12345678"
}
```

Saida igual ao registro.

#### GET `/auth/me`

Retorna usuario atual e organizacao ativa.

### Requisitos

- Senhas devem ser armazenadas com hash.
- JWT deve proteger endpoints privados.
- MVP pode assumir uma organizacao ativa por usuario.

### Criterios De Aceite

- Usuario consegue registrar.
- Usuario consegue fazer login.
- Endpoints privados recusam requisicoes sem token.
- Ao registrar, sistema cria uma organizacao pessoal automaticamente.
- Testes unitarios cobrem validacoes e regras centrais de autenticacao.
- Testes integrados cobrem registro, login, hash de senha e protecao basica de rotas.

## Modulo 4 - Projetos E Upload De MP3

### Objetivo

Permitir criar projeto e enviar MP3.

### Endpoints

#### POST `/projects`

Entrada:

```json
{
  "title": "Meu Videoclipe"
}
```

Saida:

```json
{
  "id": "...",
  "title": "Meu Videoclipe",
  "status": "draft"
}
```

#### GET `/projects`

Lista projetos da organizacao ativa.

#### GET `/projects/:id`

Retorna detalhes do projeto.

#### POST `/projects/:id/upload-track`

Entrada:

- `multipart/form-data`
- Campo de arquivo: `file`
- Aceitar apenas MP3 no MVP.

Saida:

```json
{
  "projectId": "...",
  "trackId": "...",
  "status": "uploaded"
}
```

### Requisitos

- Salvar arquivo em `storage/uploads/{organizationId}/{projectId}/original.mp3`.
- Criar registro em `Track`.
- Criar registro em `Asset` do tipo `audio`.
- Atualizar status do projeto para `uploaded`.
- Validar tamanho maximo configuravel por env.

### Criterios De Aceite

- Upload de MP3 funciona.
- Upload de arquivo nao-MP3 falha com erro claro.
- Arquivo fica salvo em disco.
- Projeto passa de `draft` para `uploaded`.
- Testes unitarios cobrem validacoes de tipo de arquivo e regras basicas do modulo.
- Testes integrados cobrem criacao de projeto, validacao de upload e persistencia do track.

## Modulo 5 - Fila Principal De Processamento

### Objetivo

Criar uma fila BullMQ para processar o projeto apos upload.

### Fila

Nome:

- `project-processing`

### Job

Nome:

- `project.process`

Payload:

```json
{
  "projectId": "...",
  "organizationId": "...",
  "requestedByUserId": "..."
}
```

### Comportamento

Apos upload do MP3, API deve adicionar job `project.process`.

Worker deve:

1. Receber job.
2. Atualizar projeto para `processing`.
3. Atualizar progresso no banco.
4. Executar pipeline inicial.
5. Atualizar projeto para `completed` ou `failed`.

### Criterios De Aceite

- Upload cria job na fila.
- Worker consome job.
- Status do projeto muda automaticamente.
- Falha no worker marca projeto como `failed`.
- Frontend consegue consultar status por polling.
- Testes unitarios cobrem regras de transicao de status e montagem do payload do job.
- Testes integrados cobrem criacao do job, mudanca de status e tratamento de falha.

## Modulo 6 - Pipeline MVP De Audio, Storyboard E Cenas

### Objetivo

Criar a primeira pipeline funcional mesmo sem IA externa.

### Etapas

#### 1. Validar Audio

Usar FFprobe para obter:

- duracao em segundos
- codec
- bitrate, se disponivel

Salvar `durationSeconds` em `Track`.

#### 2. Letra

No MVP, permitir dois caminhos:

- letra manual enviada pelo usuario
- fallback mock se nao houver letra

Endpoint opcional:

`POST /projects/:id/lyrics`

Entrada:

```json
{
  "text": "Letra da musica..."
}
```

#### 3. Criar Estrutura Musical

Fallback inicial:

- Dividir a musica em secoes por duracao.
- Se duracao for curta, criar:
  - intro
  - verse
  - chorus
  - outro
- Se duracao for maior, criar:
  - intro
  - verse 1
  - chorus 1
  - verse 2
  - chorus 2
  - bridge
  - final chorus
  - outro

Cada secao deve ter `startSeconds` e `endSeconds`.

#### 4. Criar Storyboard

Fallback inicial:

- Criar conceito textual baseado no titulo do projeto e letra.
- Visual style padrao: cinematic music video.
- Mood padrao: emotional, dynamic, atmospheric.
- Color palette padrao: deep blue, amber highlights, soft contrast.

#### 5. Criar Cenas

Regra:

- Cada cena deve ter entre 4 e 10 segundos.
- Cada secao musical pode virar uma ou mais cenas.
- Cenas devem cobrir toda a duracao da musica.
- Nao deixar buracos na timeline.

#### 6. Criar Prompts

Para cada cena:

- `positivePrompt`
- `negativePrompt`
- `style`
- `camera`

### Criterios De Aceite

- Um MP3 de 30 segundos gera cenas que cobrem 30 segundos.
- Nenhuma cena tem menos de 4 segundos, exceto se a musica inteira for menor.
- Nenhuma cena tem mais de 10 segundos.
- Projeto possui storyboard, secoes, cenas e prompts apos processamento.
- Testes unitarios cobrem divisao de timeline, regras de duracao e transformacoes puras.
- Testes integrados cobrem divisao em secoes, criacao de storyboard, criacao de cenas e prompts.

## Modulo 7 - Renderizacao MVP Com FFmpeg

### Objetivo

Gerar um MP4 final usando FFmpeg, mesmo sem geracao real de video por IA.

### Estrategia MVP

Para cada cena:

- Criar um pequeno video com fundo colorido.
- Inserir texto com titulo da cena.
- Opcionalmente inserir legenda curta.
- Gerar clipe na duracao da cena.

Depois:

- Concatenar todos os clipes.
- Adicionar o audio MP3 original.
- Exportar MP4 final.

### Arquivos

Entrada:

- `storage/uploads/{organizationId}/{projectId}/original.mp3`

Temporarios:

- `storage/temp/{projectId}/scene-001.mp4`
- `storage/temp/{projectId}/scene-002.mp4`

Saida:

- `storage/renders/{organizationId}/{projectId}/final.mp4`

### Requisitos

- Usar FFmpeg instalado no container do worker.
- Video final deve ter audio original.
- Video final deve ter duracao proxima da duracao do audio.
- Render final deve criar `Asset` tipo `render`.
- Render final deve criar/atualizar registro `Render`.

### Criterios De Aceite

- Upload de um MP3 gera um arquivo `final.mp4`.
- O MP4 toca com audio.
- O MP4 possui imagem/video, nao apenas audio.
- O frontend consegue baixar o arquivo.
- Testes unitarios cobrem composicao de comandos e regras de renderizacao que possam ser isoladas.
- Testes integrados cobrem pipeline de render, registros de render e assets finais.

## Modulo 8 - API De Status, Resultado E Download

### Objetivo

Permitir que o frontend acompanhe o processamento e baixe o resultado.

### Endpoints

#### GET `/projects/:id/status`

Saida:

```json
{
  "projectId": "...",
  "status": "rendering",
  "progress": 72,
  "currentStep": "Rendering final video",
  "errorMessage": null
}
```

#### GET `/projects/:id/scenes`

Retorna cenas e prompts.

#### GET `/projects/:id/render`

Retorna dados do render final.

#### GET `/projects/:id/download`

Retorna arquivo MP4 final.

### Criterios De Aceite

- Status retorna progresso atualizado.
- Ao concluir, status retorna `completed`.
- Download retorna MP4.
- Usuario nao consegue acessar projeto de outra organizacao.
- Testes unitarios cobrem mapeamentos de resposta e regras de autorizacao isoladas.
- Testes integrados cobrem status, autorizacao por organizacao e download.

## Modulo 9 - Frontend MVP

### Objetivo

Criar interface simples para executar o fluxo completo.

### Paginas

#### LoginPage

- Formulario de email e senha.
- Link para cadastro.

#### RegisterPage

- Nome, email e senha.
- Cria usuario e organizacao.

#### DashboardPage

- Lista projetos.
- Botao "Novo videoclipe".
- Exibe status de cada projeto.

#### CreateProjectPage

- Campo titulo.
- Upload MP3.
- Campo opcional de letra.
- Botao "Gerar videoclipe".

#### ProcessingPage

- Barra de progresso.
- Status textual.
- Lista de etapas:
  - upload
  - analise
  - storyboard
  - cenas
  - renderizacao
  - concluido
- Polling em `GET /projects/:id/status`.

#### VideoResultPage

- Player de video.
- Botao baixar MP4.
- Lista de cenas geradas.

### Requisitos Visuais

- Usar Vuetify.
- Layout responsivo.
- Interface simples, limpa e objetiva.
- Evitar complexidade de editor no MVP.

### Pinia Stores

#### Auth Store

Responsavel por:

- token
- usuario
- organizacao
- login
- register
- logout

#### Projects Store

Responsavel por:

- listar projetos
- criar projeto
- upload de MP3
- enviar letra
- consultar status
- buscar cenas
- buscar render

### Criterios De Aceite

- Usuario consegue fazer cadastro.
- Usuario consegue criar projeto.
- Usuario consegue enviar MP3.
- Usuario consegue acompanhar progresso.
- Usuario consegue assistir/baixar MP4 final.

## Modulo 10 - IA Local Com Whisper E Ollama

### Objetivo

Substituir gradualmente os mocks por IA local.

### Whisper

Criar interface:

```text
TranscriptionProvider
```

Responsabilidade:

- receber caminho do audio
- retornar texto transcrito
- retornar segmentos com timestamps, se possivel

Implementacoes:

- `MockTranscriptionProvider`
- `WhisperCliTranscriptionProvider`

### Ollama

Criar interface:

```text
TextGenerationProvider
```

Responsabilidade:

- receber prompt
- retornar texto estruturado

Usos:

- identificar estrutura da musica
- criar storyboard
- criar prompts de cenas

Implementacoes:

- `MockTextGenerationProvider`
- `OllamaTextGenerationProvider`

### Requisitos

- Se Whisper nao estiver disponivel, usar mock.
- Se Ollama nao estiver disponivel, usar mock.
- Logs devem indicar quando fallback foi usado.
- Prompts devem pedir resposta em JSON quando possivel.

### Criterios De Aceite

- Pipeline funciona sem IA instalada.
- Pipeline melhora quando Ollama/Whisper estao disponiveis.
- Falha de IA nao quebra projeto inteiro se fallback estiver habilitado.
- Testes unitarios cobrem selecao de provider e regras de fallback.
- Testes integrados cobrem fallback mock e comportamento com provider real habilitado por configuracao.

## Modulo 11 - Preparacao Para Provedores De Video

### Objetivo

Criar arquitetura para futuramente gerar cenas reais via provedores externos.

### Interface

```text
VideoGenerationProvider
```

Metodos conceituais:

- `createSceneVideo(scene, prompt)`
- `getGenerationStatus(providerJobId)`
- `downloadResult(providerJobId)`

Implementacoes futuras:

- `MockVideoGenerationProvider`
- `KlingVideoGenerationProvider`
- `PixVerseVideoGenerationProvider`
- `OpenAiVideoGenerationProvider`

### Banco

Adicionar campos opcionais em `Scene`:

- `provider`
- `providerJobId`
- `providerStatus`
- `providerError`

### Criterios De Aceite

- MVP usa provider mock.
- Codigo nao acopla scenes diretamente a Kling/PixVerse.
- Adicionar novo provider deve exigir nova classe, nao reescrever pipeline.
- Testes unitarios cobrem contrato do provider e selecao de implementacao.
- Testes integrados cobrem contrato do provider e substituicao de implementacoes.

## Modulo 12 - Billing Futuro

### Objetivo

Preparar cobranca sem implementar pagamento completo no MVP.

### Entidades Futuras

#### Plan

Campos:

- `id`
- `name`
- `monthlyPriceCents`
- `includedCredits`
- `maxVideoDurationSeconds`
- `maxProjectsPerMonth`

#### Subscription

Campos:

- `id`
- `organizationId`
- `planId`
- `status`
- `currentPeriodStart`
- `currentPeriodEnd`

#### UsageCredit

Campos:

- `id`
- `organizationId`
- `amount`
- `reason`
- `projectId`
- `createdAt`

### Regra MVP

- Criar estrutura no banco apenas se nao atrasar.
- Pode deixar billing como modulo vazio inicialmente.
- O mais importante e garantir que `Project` pertence a `Organization`.

## 7. Contratos De API Do MVP

### Health

```text
GET /health
```

Resposta:

```json
{
  "status": "ok"
}
```

### Auth

```text
POST /auth/register
POST /auth/login
GET /auth/me
```

### Projects

```text
POST /projects
GET /projects
GET /projects/:id
POST /projects/:id/upload-track
POST /projects/:id/lyrics
GET /projects/:id/status
GET /projects/:id/scenes
GET /projects/:id/render
GET /projects/:id/download
```

## 8. Eventos Internos

Eventos podem ser objetos simples usados no codigo e logs.

### ProjectUploaded

```json
{
  "projectId": "...",
  "organizationId": "...",
  "trackId": "..."
}
```

### ProjectProcessingStarted

```json
{
  "projectId": "..."
}
```

### ProjectStepCompleted

```json
{
  "projectId": "...",
  "step": "storyboard",
  "progress": 45
}
```

### ProjectProcessingFailed

```json
{
  "projectId": "...",
  "errorMessage": "..."
}
```

### ProjectCompleted

```json
{
  "projectId": "...",
  "renderId": "...",
  "assetId": "..."
}
```

## 9. Variaveis De Ambiente

`.env.example` deve conter:

```env
NODE_ENV=development

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/video_saas
REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=change-me
JWT_EXPIRES_IN=7d

API_PORT=3000
FRONTEND_PORT=5173

STORAGE_ROOT=./storage
MAX_UPLOAD_MB=50

FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe

ENABLE_WHISPER=false
WHISPER_COMMAND=whisper

ENABLE_OLLAMA=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

ENABLE_AI_FALLBACKS=true
```

## 10. Comandos Esperados

Na raiz:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm test:unit
pnpm test:integration
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

Docker:

```bash
docker compose up -d
docker compose down
```

## 11. Cuidados Importantes Para A IA Que Vai Implementar

1. Nao implementar tudo de uma vez.
2. Implementar um modulo por vez.
3. Ao terminar cada modulo, rodar build, testes unitarios e testes integrados relevantes.
4. Evitar acoplar controller diretamente ao Prisma.
5. Evitar processar video dentro da requisicao HTTP.
6. Usar interfaces para IA, storage e renderizacao.
7. Manter nomes de status consistentes.
8. Garantir que projetos sejam filtrados por `organizationId`.
9. Garantir que upload aceite apenas MP3 no MVP.
10. Garantir que o sistema funcione em modo mock/fallback.
11. Garantir que o video final seja gerado mesmo sem IA externa.
12. Garantir que as pastas de storage sejam criadas automaticamente.
13. Toda entrega de modulo deve incluir testes novos e execucao da suite existente para detectar regressao.

## 11.1 Estrategia De Testes

### Testes Unitarios

Devem cobrir:

- regras de dominio
- funcoes puras
- validacoes
- mapeamentos
- servicos pequenos com dependencias mockadas

Devem evitar:

- acesso real a banco quando a regra puder ser validada isoladamente
- dependencia desnecessaria de filesystem, Redis ou HTTP

### Testes Integrados

Devem cobrir:

- endpoints do backend
- integracao controller -> use case -> persistencia
- fila e orquestracao quando possivel
- validacoes de negocio principais

Podem usar:

- banco real de teste
- Redis de teste
- filesystem temporario

Devem evitar:

- mocks excessivos que escondam erro de integracao entre camadas

### Regra De Execucao

Apos cada modulo:

1. rodar testes do modulo
2. rodar testes integrados existentes
3. rodar testes unitarios existentes impactados
4. corrigir regressao antes de seguir

## 12. Ordem Recomendada De Implementacao

1. Modulo 1 - Base do monorepo e infra local.
2. Modulo 2 - Banco de dados e Prisma.
3. Modulo 3 - Autenticacao simples e organizacao.
4. Modulo 4 - Projetos e upload de MP3.
5. Modulo 5 - Fila principal de processamento.
6. Modulo 6 - Pipeline MVP de audio, storyboard e cenas.
7. Modulo 7 - Renderizacao MVP com FFmpeg.
8. Modulo 8 - API de status, resultado e download.
9. Modulo 9 - Frontend MVP.
10. Modulo 10 - IA local com Whisper e Ollama.
11. Modulo 11 - Preparacao para provedores de video.
12. Modulo 12 - Billing futuro.

## 13. Definicao De Pronto Do MVP

O MVP esta pronto quando:

1. Usuario consegue criar conta.
2. Usuario consegue criar projeto.
3. Usuario consegue enviar MP3.
4. Sistema cria job assincrono.
5. Worker processa o projeto.
6. Sistema cria secoes, storyboard, cenas e prompts.
7. Sistema gera MP4 final com FFmpeg.
8. Usuario consegue ver progresso.
9. Usuario consegue assistir ao video final.
10. Usuario consegue baixar o MP4.
11. Tudo roda localmente com Docker Compose, Postgres e Redis.
12. Existem testes unitarios e integrados cobrindo o fluxo principal e eles passam.

## 14. Escopo Que Nao Deve Entrar No MVP Inicial

Nao implementar inicialmente:

- Pagamento real.
- Editor timeline avancado.
- Geracao real obrigatoria via Kling/PixVerse.
- Colaboracao em tempo real.
- Marketplace de templates.
- Administracao complexa.
- Multi-organizacao por usuario com troca manual.
- Renderizacao distribuida complexa.
- Legendas avancadas.
- Deteccao real de BPM.

Esses itens devem ficar para V1 ou V2.
