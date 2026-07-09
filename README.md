# Video SaaS MVP

MVP SaaS para transformar um MP3 em um videoclipe MP4 com processamento assincrono.

Fluxo atual:

1. usuario cria conta
2. usuario cria projeto
3. usuario pode definir quantos primeiros segundos da musica quer transformar em clipe
4. usuario envia MP3
5. API salva o audio e cria job BullMQ
6. worker processa audio, storyboard, cenas e render
7. frontend acompanha progresso e permite baixar o MP4 final

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
- `COMFYUI_ENABLE_IMAGE_FALLBACK`
- `COMFYUI_CHECKPOINT_NAME`
- `COMFYUI_MODELS_HOST_PATH`
- `COMFYUI_CUSTOM_NODES_HOST_PATH`

## Subir ambiente local

Infra:

```bash
docker compose up -d
```

Se quiser preparar o modelo local do Ollama junto com a infra, use:

```bash
docker compose up -d ollama ollama-model
```

Se o objetivo for apenas baixar ou atualizar o modelo do `Ollama`, o caminho recomendado e:

```bash
docker compose up -d ollama
docker compose up ollama-model
```

Validar modelos instalados:

```bash
docker exec video-ollama ollama list
```

Dependencias:

```bash
corepack pnpm install
```

Se quiser transcricao local real com Whisper:

```bash
python -m pip install -r apps/worker/scripts/requirements-whisper.txt
```

Para testar so a transcricao, sem subir o pipeline inteiro:

```bash
corepack pnpm whisper:transcribe -- --audio-path C:/caminho/da/musica.mp3
```

O comando usa as mesmas configuracoes do `.env` e imprime:

- device solicitado
- device efetivo usado na transcricao
- idioma detectado
- `rawText`
- `normalizedText`

Com GPU NVIDIA, o recomendado e usar CUDA configurado na maquina para o `faster-whisper`.

Se quiser geracao visual local por prompt:

- deixe `SCENE_VISUAL_PROVIDER=comfyui`
- suba o ComfyUI localmente em `http://localhost:8188` ou via Docker Compose com o profile `comfyui`
- se quiser fallback por imagem, habilite `COMFYUI_ENABLE_IMAGE_FALLBACK=true` e configure um checkpoint compativel em `COMFYUI_CHECKPOINT_NAME`
- se estiver usando apenas o workflow WAN de video, deixe `COMFYUI_ENABLE_IMAGE_FALLBACK=false`

Sem ComfyUI ativo, o worker continua no modo `procedural` e gera cenas baseadas em composicao simples no `ffmpeg`.

### ComfyUI via Docker

O projeto agora possui um servico opcional de `ComfyUI` no `docker-compose.yml`.

Subir apenas o ComfyUI:

```bash
docker compose --profile comfyui up -d comfyui
```

Subir infra base + ComfyUI:

```bash
docker compose --profile comfyui up -d
```

O servico publica a interface em `http://localhost:8188`.

#### Reaproveitar sua instalacao atual do Windows

Se voce ja baixou modelos, custom nodes e workflows no ComfyUI do Windows, o ideal e reaproveitar esses mesmos diretorios por volume.

Exemplo:

```env
COMFYUI_MODELS_HOST_PATH=C:/caminho/do/seu/ComfyUI/models
COMFYUI_CUSTOM_NODES_HOST_PATH=C:/caminho/do/seu/ComfyUI/custom_nodes
COMFYUI_INPUT_HOST_PATH=C:/caminho/do/seu/ComfyUI/input
COMFYUI_OUTPUT_HOST_PATH=C:/caminho/do/seu/ComfyUI/output
COMFYUI_USER_HOST_PATH=C:/caminho/do/seu/ComfyUI/user
COMFYUI_TEMP_HOST_PATH=C:/caminho/do/seu/ComfyUI/temp
```

Se voce apontar esses caminhos para a instalacao que funcionou ontem:

- nao precisa baixar os modelos de novo
- nao precisa reinstalar os custom nodes de novo
- nao precisa refazer os workflows ja salvos

Se voce deixar os caminhos padrao `./storage/comfyui/...`, o container vai usar um ambiente separado. Nesse caso, os modelos e custom nodes precisarao existir nessas pastas.

#### Exportar o workflow JSON correto

Para integrarmos o workflow no backend, eu preciso do JSON em formato de API do ComfyUI.

Passo a passo:

1. abra o workflow no ComfyUI
2. va em `File -> Export Workflow (API)`
3. salve o arquivo `.json`
4. me envie esse arquivo

Se voce tiver apenas o workflow visual salvo no formato normal:

1. abra o `.json` com `File -> Load`
2. depois exporte com `File -> Export Workflow (API)`

#### O que precisa ser refeito ao migrar para Docker

- modelos: nao, se os volumes apontarem para suas pastas atuais
- custom nodes: nao, se os volumes apontarem para suas pastas atuais
- workflows salvos: nao, se eles estiverem nas pastas montadas ou se voce me exportar o JSON
- endpoint local: sim, porque agora o acesso sera pelo servico do Docker em `localhost:8188`
- dependencias Python de custom nodes: talvez, mas o entrypoint tenta instalar automaticamente os `requirements.txt` encontrados

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
- opcao de limitar o clipe aos primeiros segundos da musica
- testes unitarios e integrados no monorepo

Ainda nao implementado:

- geracao de video por modelos nativamente text-to-video
- billing

Implementado parcialmente:

- integracao real com Ollama para storyboard e prompts de cena
- integracao real com faster-whisper para transcricao quando habilitado
- geracao visual local por prompt via ComfyUI, com tentativa de video direto por workflow Wan2.2 e fallback para imagem animada
- fallback automatico para modo mock quando Ollama estiver desabilitado ou indisponivel

## Observacoes

- o worker usa fallback local quando `ffprobe` nao consegue ler duracao real do audio
- o frontend baixa o MP4 autenticado via `fetch`, nao via link publico
- o `docker-compose.yml` sobe Postgres, Redis e Ollama; API, worker e frontend rodam por `pnpm dev`
- o `docker-compose.yml` tambem pode subir um `ComfyUI` opcional via profile `comfyui`
- o modelo padrao sugerido para GPU local com 12 GB e `qwen3:8b`
- o modelo padrao sugerido para transcricao local e `distil-large-v3`
- para a camada visual local, o worker agora tenta `ComfyUI Wan2.2 -> video por cena`, depois cai para `ComfyUI -> imagem por cena -> animacao no ffmpeg`
