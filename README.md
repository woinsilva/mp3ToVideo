# Video SaaS MVP

MVP SaaS para transformar um MP3 em um videoclipe MP4 com processamento assincrono.

Fluxo atual:

1. usuario cria conta
2. usuario cria projeto
3. usuario envia MP3
4. API salva o audio e cria job BullMQ
5. worker processa audio, storyboard, cenas e render
6. frontend acompanha progresso e permite baixar o MP4 final

## Stack

- frontend: Vue 3, TypeScript, class based components, Vue Router, Pinia, Vuetify
- backend: Node.js, TypeScript, NestJS
- banco: PostgreSQL
- fila: Redis + BullMQ
- processamento: FFmpeg, FFprobe
- IA local: Ollama
- transcricao local: faster-whisper
- geracao visual local opcional: ComfyUI
- infra local: Docker Compose

## Estrutura

- `apps/api`: API NestJS
- `apps/worker`: worker NestJS
- `apps/frontend`: app Vue
- `prisma`: schema, migration e seed
- `storage`: uploads, cenas geradas, renders e temporarios
- `tests`: testes unitarios e integrados

## Pre-requisitos

- Node.js 24+
- Corepack habilitado
- Docker Desktop com WSL funcionando
- `ffmpeg` e `ffprobe` disponiveis no ambiente local se for rodar o worker fora do container

## Configuracao

1. copie `.env.example` para `.env`
2. ajuste as variaveis se necessario

Variaveis importantes:

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `JWT_SECRET`
- `STORAGE_ROOT`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `VITE_API_BASE_URL`
- `ENABLE_OLLAMA`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `ENABLE_WHISPER`
- `WHISPER_PYTHON_PATH`
- `WHISPER_MODEL`
- `SCENE_VISUAL_PROVIDER`
- `COMFYUI_BASE_URL`
- `COMFYUI_CHECKPOINT_NAME`

## Subir ambiente local

Infra:

```bash
docker compose up -d
```

Se quiser preparar o modelo local do Ollama junto com a infra, use:

```bash
docker compose up -d ollama ollama-model
```

Dependencias:

```bash
corepack pnpm install
```

Se quiser transcricao local real com Whisper:

```bash
python -m pip install -r apps/worker/scripts/requirements-whisper.txt
```

Com GPU NVIDIA, o recomendado e usar CUDA configurado na maquina para o `faster-whisper`.

Se quiser geracao visual local por prompt:

- deixe `SCENE_VISUAL_PROVIDER=comfyui`
- suba o ComfyUI localmente em `http://localhost:8188`
- configure um checkpoint compativel em `COMFYUI_CHECKPOINT_NAME`

Sem ComfyUI ativo, o worker continua no modo `procedural` e gera cenas baseadas em composicao simples no `ffmpeg`.

Banco:

```bash
corepack pnpm prisma:migrate
corepack pnpm prisma:seed
```

Aplicacoes:

```bash
corepack pnpm dev
```

Portas esperadas:

- frontend: `http://localhost:5173`
- api: `http://localhost:3000`
- postgres: `localhost:5432`
- redis: `localhost:6379`
- ollama: `localhost:11434`

## Comandos principais

```bash
corepack pnpm dev
corepack pnpm build
corepack pnpm test
corepack pnpm test:unit
corepack pnpm test:integration
corepack pnpm prisma:generate
corepack pnpm prisma:migrate
corepack pnpm prisma:seed
```

## Fluxo manual de validacao

1. abra `http://localhost:5173`
2. crie uma conta
3. crie um projeto
4. envie um MP3
5. acompanhe a pagina de processamento
6. ao concluir, abra a pagina de resultado
7. reproduza o video e baixe o MP4

## Conta demo do seed

Depois de rodar `corepack pnpm prisma:seed`, existe uma conta de desenvolvimento pronta para login:

- email: `demo@example.com`
- senha: `12345678`

## Estado atual do MVP

Implementado:

- autenticacao e workspace pessoal
- criacao de projeto e upload MP3
- fila principal de processamento
- pipeline de storyboard e cenas
- renderizacao MP4 com FFmpeg
- API de status, cenas, render e download
- frontend MVP para executar o fluxo completo
- testes unitarios e integrados no monorepo

Ainda nao implementado:

- geracao de video por modelos nativamente text-to-video
- billing

Implementado parcialmente:

- integracao real com Ollama para storyboard e prompts de cena
- integracao real com faster-whisper para transcricao quando habilitado
- geracao visual local por prompt via ComfyUI, convertendo imagem gerada em clipe animado
- fallback automatico para modo mock quando Ollama estiver desabilitado ou indisponivel

## Observacoes

- o worker usa fallback local quando `ffprobe` nao consegue ler duracao real do audio
- o frontend baixa o MP4 autenticado via `fetch`, nao via link publico
- o `docker-compose.yml` sobe Postgres, Redis e Ollama; API, worker e frontend rodam por `pnpm dev`
- o modelo padrao sugerido para GPU local com 12 GB e `qwen3:8b`
- o modelo padrao sugerido para transcricao local e `distil-large-v3`
- para a camada visual local, a estrategia mais pragmatica no momento e `ComfyUI -> imagem por cena -> animacao no ffmpeg`
