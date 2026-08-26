# Stack tecnológica do Video SaaS

> Documento gerado em 17 de agosto de 2026 a partir dos manifests, arquivos de configuração, Dockerfiles e ambiente local do projeto.

## 1. Visão geral

O Video SaaS é um monorepo para transformar arquivos de áudio MP3 em videoclipes MP4 por meio de um pipeline assíncrono.

O sistema é dividido em:

- frontend web em Vue;
- API HTTP em NestJS;
- worker assíncrono em NestJS e BullMQ;
- PostgreSQL para persistência;
- Redis para filas;
- FFmpeg e FFprobe para análise e renderização;
- faster-whisper para transcrição local;
- Ollama para geração local de texto;
- ComfyUI com Wan 2.2 para geração visual local.

Na configuração de desenvolvimento atual, frontend, API, worker e ComfyUI executam diretamente no Windows. PostgreSQL, Redis e Ollama são fornecidos pelo Docker Compose.

```text
Frontend Vue/Vite (host)
          |
          v
NestJS API (host)
          |
          +----------> PostgreSQL (Docker)
          |
          +----------> Redis/BullMQ (Docker)
                              |
                              v
                       NestJS Worker (host)
                              |
              +---------------+----------------+
              |               |                |
              v               v                v
       faster-whisper      FFmpeg          IA visual/textual
          (host)           (host)       ComfyUI (host) / Ollama (Docker)
```

## 2. Organização do repositório

| Caminho | Responsabilidade |
| --- | --- |
| `apps/frontend` | Interface web Vue |
| `apps/api` | API HTTP NestJS |
| `apps/worker` | Processamento assíncrono e renderização |
| `packages/shared` | Tipos e código compartilhado do monorepo |
| `prisma` | Schema, migrations e seed do banco |
| `storage` | Uploads, temporários, cenas, modelos e renders |
| `tests/unit` | Testes unitários |
| `tests/integration` | Testes de integração |

O workspace é administrado com pnpm e definido por `pnpm-workspace.yaml`.

## 3. Componentes executados fora do Docker

### 3.1 Runtime e ferramentas do monorepo

| Tecnologia | Versão instalada |
| --- | ---: |
| Node.js | 24.14.0 |
| Corepack | 0.34.6 |
| pnpm | 10.12.4 |
| TypeScript | 5.9.3 |
| TSX | 4.22.4 |
| Concurrently | 9.2.3 |
| Vitest | 2.1.9 |
| Supertest | 7.2.2 |

O comando `corepack pnpm dev` inicia API, worker e frontend simultaneamente em modo de desenvolvimento.

### 3.2 Frontend

| Tecnologia | Versão instalada | Uso |
| --- | ---: | --- |
| Vue | 3.5.38 | Framework de interface |
| Vite | 5.4.21 | Servidor de desenvolvimento e build |
| Vuetify | 3.12.8 | Biblioteca de componentes visuais |
| Pinia | 3.0.4 | Gerenciamento de estado |
| Vue Router | 4.6.4 | Roteamento da SPA |
| vue-facing-decorator | 3.0.4 | Componentes Vue baseados em classes/decorators |
| Material Design Icons | 7.4.47 | Ícones |
| Sass | 1.101.0 | Estilos SCSS |
| vue-tsc | 2.2.12 | Verificação de tipos dos componentes Vue |

Configuração principal:

- aplicação SPA;
- porta padrão `5173`;
- servidor Vite exposto em `0.0.0.0`;
- comunicação HTTP com a API na porta `3000`;
- download autenticado dos renders por `fetch`.

### 3.3 API

| Tecnologia | Versão instalada | Uso |
| --- | ---: | --- |
| NestJS | 11.1.27 | Framework da API |
| Express | tipos 5.0.6 | Plataforma HTTP usada pelo NestJS |
| Prisma Client | 6.19.3 | Acesso ao PostgreSQL |
| BullMQ | 5.79.0 | Publicação de jobs de processamento |
| ioredis | 5.11.1 | Comunicação com Redis |
| Passport | 0.7.0 | Infraestrutura de autenticação |
| Passport JWT | 4.0.1 | Autenticação por JWT |
| bcryptjs | 3.0.3 | Hash de senhas |
| Joi | 17.13.4 | Validação das variáveis de ambiente |
| class-validator | 0.14.4 | Validação de DTOs |
| class-transformer | 0.5.1 | Transformação de DTOs |
| RxJS | 7.8.2 | Programação reativa usada pelo NestJS |

Responsabilidades principais:

- cadastro e autenticação de usuários;
- organizações e workspaces;
- criação e consulta de projetos;
- upload de áudio;
- persistência dos arquivos no storage local;
- criação de jobs BullMQ;
- consulta do progresso, cenas e renders;
- regeneração de storyboard;
- entrega autenticada do MP4 final.

A API usa a porta `3000` por padrão.

### 3.4 Worker

O worker também usa NestJS `11.1.27` e executa o pipeline assíncrono consumindo jobs do BullMQ.

Principais dependências:

| Tecnologia | Versão instalada | Uso |
| --- | ---: | --- |
| BullMQ | 5.79.0 | Consumo e controle dos jobs |
| ioredis | 5.11.1 | Conexão com Redis |
| Prisma Client | 6.19.3 | Atualização do projeto e dos assets |
| Joi | 17.13.4 | Validação de configuração |
| RxJS | 7.8.2 | Infraestrutura NestJS |

Etapas do pipeline:

1. leitura dos metadados do áudio;
2. transcrição da música;
3. identificação da estrutura musical;
4. geração do storyboard;
5. planejamento das cenas;
6. geração de prompts;
7. geração visual procedural ou via ComfyUI;
8. renderização e concatenação com FFmpeg;
9. persistência do MP4 e atualização do status do projeto.

### 3.5 FFmpeg e FFprobe

O worker usa executáveis instalados no Windows:

- `C:\ffmpeg\bin\ffmpeg.exe`;
- `C:\ffmpeg\bin\ffprobe.exe`;
- FFmpeg `8.1.1-essentials_build-www.gyan.dev`.

Eles não estão adicionados globalmente ao `PATH`; o sistema os encontra pelos caminhos definidos nas variáveis `FFMPEG_PATH` e `FFPROBE_PATH`.

O FFmpeg é responsável por:

- inspeção de áudio;
- extração de trechos;
- composição de cenas procedurais;
- animação de imagens quando aplicável;
- concatenação das cenas;
- inclusão do áudio;
- geração do MP4 final.

### 3.6 Transcrição com faster-whisper

| Tecnologia | Versão instalada |
| --- | ---: |
| Python | 3.13.14 |
| faster-whisper | 1.2.1 |
| CTranslate2 | 4.8.0 |
| PyAV | 17.1.0 |
| tokenizers | 0.23.1 |
| huggingface-hub | 1.20.1 |

Configuração ativa:

- transcrição habilitada;
- modelo `large-v3`;
- dispositivo principal `cuda`;
- precisão principal `float16`;
- fallback para `cpu` com `int8`;
- GPU detectada: NVIDIA GeForce RTX 4070 Ti com 12 GB de VRAM.

## 4. Componentes executados no Docker

Os serviços abaixo estão definidos em `docker-compose.yml`.

### 4.1 PostgreSQL

| Item | Configuração |
| --- | --- |
| Imagem | `postgres:16-alpine` |
| Contêiner | `video-postgres` |
| Porta publicada | `5432` |
| Banco de desenvolvimento | `video_saas` |
| Volume | `postgres_data` |
| Política de reinício | `unless-stopped` |

O banco é acessado pela API e pelo worker por meio do Prisma.

### 4.2 Redis

| Item | Configuração |
| --- | --- |
| Imagem | `redis:7-alpine` |
| Contêiner | `video-redis` |
| Porta publicada | `6379` |
| Volume | `redis_data` |
| Política de reinício | `unless-stopped` |

O Redis armazena a fila e o estado operacional do BullMQ.

### 4.3 Ollama

| Item | Configuração |
| --- | --- |
| Imagem | `ollama/ollama:latest` |
| Contêiner | `video-ollama` |
| Porta publicada | `11434` |
| Volume | `ollama_data` |
| Modelo configurado | `qwen3:8b` |
| Keep-alive | 24 horas |

Um contêiner auxiliar chamado `video-ollama-model`, baseado em `curlimages/curl:8.12.1`, chama a API do Ollama para baixar o modelo configurado.

Na configuração atual da aplicação, o Ollama está desabilitado por `ENABLE_OLLAMA=false`. O serviço permanece disponível no Compose para uso opcional.

### 4.4 ComfyUI

O ComfyUI executa pelo ComfyUI Desktop no Windows e deve estar aberto durante as gerações. Ele não faz parte do Docker Compose.

| Item | Configuração |
| --- | --- |
| Runtime | ComfyUI Desktop para Windows |
| Endpoint | `http://localhost:8188` |
| GPU | GPU disponível diretamente no Windows |
| Modelos e custom nodes | Gerenciados pela instalação Desktop |

O suporte a um contêiner próprio foi removido da configuração ativa devido aos problemas observados nessa execução. Ele poderá ser reintroduzido futuramente depois que o build e a inicialização forem estabilizados.

Configuração visual ativa:

| Item | Valor |
| --- | --- |
| Provider | `comfyui` |
| Endpoint | `http://localhost:8188` |
| Workflow | Wan 2.2 text/image-to-video |
| UNet | `wan2.2_ti2v_5B_fp16.safetensors` |
| CLIP | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` |
| Tipo do CLIP | `wan` |
| VAE | `wan2.2_vae.safetensors` |
| Resolução | 1280 x 704 |
| FPS | 16 |
| Steps | 24 |
| CFG | 4.5 |
| Sampler | `uni_pc` |
| Scheduler | `simple` |
| Fallback para imagem | Desabilitado |

## 5. Dockerfiles existentes fora do Compose

O repositório possui Dockerfiles para as três aplicações, mas eles não estão associados a serviços no `docker-compose.yml` atual.

| Aplicação | Imagem-base | Observação |
| --- | --- | --- |
| API | `node:24-alpine` | Instala dependências e executa a API em modo dev |
| Frontend | `node:24-alpine` | Executa Vite em `0.0.0.0` |
| Worker | `node:24-alpine` | Instala FFmpeg pelo Alpine e executa o worker |

Esses arquivos permitem uma conteinerização futura, mas não representam a topologia efetivamente iniciada pelo Compose atual.

## 6. Banco de dados e persistência

### 6.1 Prisma

| Tecnologia | Versão instalada |
| --- | ---: |
| Prisma CLI | 6.19.3 |
| Prisma Client | 6.19.3 |
| Provider | PostgreSQL |

O schema contém, entre outras, as entidades:

- `User`;
- `Organization`;
- `OrganizationMember`;
- `Project`;
- `Track`;
- `Lyrics`;
- `MusicSection`;
- `Storyboard`;
- `Scene`;
- `ScenePrompt`;
- `SceneRenderAttempt`;
- `Asset`;
- `Render`;
- `ProcessingJob`.

As alterações de banco são versionadas em `prisma/migrations`.

### 6.2 Storage local

Arquivos binários não são armazenados diretamente no PostgreSQL. O sistema usa a pasta local `./storage` e registra no banco os caminhos e metadados dos assets.

O storage contém:

- áudio enviado;
- imagens e referências;
- storyboards;
- vídeos de cenas;
- arquivos temporários;
- renders MP4 finais;

## 7. Autenticação e segurança

A autenticação usa:

- JWT;
- Passport e Passport JWT;
- hash de senha com bcryptjs;
- guards do NestJS;
- contexto de usuário e organização;
- isolamento lógico dos projetos por organização.

O segredo JWT e a URL do banco são fornecidos pelo arquivo `.env` e não devem ser registrados nesta documentação nem enviados ao repositório.

## 8. Portas locais

| Componente | Porta | Execução |
| --- | ---: | --- |
| Frontend | 5173 | Host/Windows |
| API | 3000 | Host/Windows |
| PostgreSQL | 5432 | Docker |
| Redis | 6379 | Docker |
| Ollama | 11434 | Docker |
| ComfyUI | 8188 | Host/Windows |

## 9. Configuração ativa resumida

| Recurso | Estado atual |
| --- | --- |
| Ambiente | `development` |
| PostgreSQL | Configurado |
| Redis/BullMQ | Configurado |
| Storage local | `./storage` |
| Limite de upload | 50 MB |
| Whisper | Habilitado |
| Ollama | Desabilitado |
| Provider visual | ComfyUI |
| Fallbacks de IA | Habilitados |
| Fallback do ComfyUI para imagem | Desabilitado |

## 10. Comandos operacionais

Instalar dependências:

```bash
corepack pnpm install
```

Subir a infraestrutura base:

```bash
docker compose up -d postgres redis ollama
```

Baixar ou atualizar o modelo do Ollama:

```bash
docker compose up -d ollama
docker compose up ollama-model
```

Antes de iniciar uma geração, abra o ComfyUI Desktop no Windows e confirme que `http://localhost:8188` está acessível.

Executar frontend, API e worker no host:

```bash
corepack pnpm dev
```

Executar migrations e seed:

```bash
corepack pnpm prisma:migrate
corepack pnpm prisma:seed
```

Executar verificações:

```bash
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
```

Consultar os contêineres:

```bash
docker compose ps -a
```

## 11. Estado observado em 17 de agosto de 2026

No momento da geração deste documento:

- frontend, API e worker estavam em execução no Windows;
- PostgreSQL, Redis e Ollama estavam ativos no Docker;
- o ComfyUI Desktop estava ativo no Windows e respondendo na porta `8188`;
- o antigo contêiner `video-comfyui` havia sido removido.

Esta seção é apenas um snapshot operacional. As demais seções descrevem a stack declarada e a configuração do projeto.

## 12. Observações de versionamento

- As versões das dependências Node listadas neste documento são as versões instaladas e resolvidas pelo lockfile, não apenas os intervalos declarados nos `package.json`.
- As tags `ollama/ollama` e `latest` não fixam uma versão imutável do Ollama.
- A versão do ComfyUI Desktop e dos modelos instalados no Windows deve ser registrada quando o ambiente for promovido para produção.
- Para builds totalmente reproduzíveis, recomenda-se fixar a versão/tag ou o digest do Ollama.

## 13. Video remoto opcional

- SnapGen e um provider remoto opcional do pipeline de clipe infantil; ComfyUI no Windows continua sendo o provider local.
- Segredos ficam exclusivamente na API/worker. Configure `SNAPGEN_API_KEY`; base URL, polling, timeouts e concorrencia possuem variaveis documentadas no `.env.example`.
- O provider remoto nao faz parte do Docker Compose e nao substitui nem adquire a GPU/lease dos componentes locais.

## 14. Arquivos de referência

- `package.json` e `pnpm-lock.yaml`;
- `apps/api/package.json`;
- `apps/frontend/package.json`;
- `apps/worker/package.json`;
- `docker-compose.yml` e `docker-compose.dev.yml`;
- `infra/docker/*.Dockerfile`;
- `apps/api/src/config/configuration.ts`;
- `apps/worker/src/config/configuration.ts`;
- `prisma/schema.prisma`;
- `.env.example`.
