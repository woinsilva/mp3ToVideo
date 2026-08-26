# Modulo de clipes infantis

## Objetivo

Adicionar ao sistema o modo de criacao `children_clip`, capaz de produzir clipes infantis completos de ate 240 segundos a partir de uma musica pronta, normalmente gerada no Suno. Esse modo tem pipeline, dados, filas, interface e renderizacao proprios. Ele nao e um preset do pipeline Wan existente.

## Decisoes de produto

- A tela de novo projeto exibira a opcao **Gerar clipe infantil** junto aos modos atuais.
- A opcao abre um estudio dedicado em `/projects/new/children-clip`.
- A musica pronta em MP3 ou WAV e a base temporal obrigatoria do clipe.
- A letra original e recomendada e pode ser informada junto da musica. Whisper sera apenas uma alternativa quando a letra nao estiver disponivel.
- A duracao sera obtida do arquivo de audio e nao podera ultrapassar 240 segundos.
- O usuario informa conceito, historia, faixa etaria, estilo visual e formato de saida.
- Personagens podem ser gerados a partir de descricao, enviados pelo usuario ou montados combinando as duas origens.
- Nenhum personagem gerado ou enviado entra na producao antes de uma versao ser explicitamente aprovada.
- Personagens aprovados podem ser exclusivos do projeto ou reutilizados pela organizacao em outros clipes.
- Uma regeneracao cria uma nova versao e nunca substitui silenciosamente uma versao aprovada.
- O sistema deve permitir revisar e refazer uma unidade pequena (asset, personagem, tomada ou etapa) sem reiniciar toda a producao.

## Entradas do projeto

- Titulo.
- Musica MP3 ou WAV finalizada.
- Letra completa, preferencialmente com marcacoes de secoes.
- Conceito ou historia desejada.
- Publico/faixa etaria.
- Estilo visual e referencias opcionais.
- Aspect ratio: `16:9`, `9:16` ou `1:1`.
- Personagens novos ou existentes da biblioteca.

O sistema nao gera musica nem depende de integracao com o Suno. A responsabilidade do modulo comeca no recebimento da musica finalizada.

## Estudio de personagens

Cada personagem possui identidade propria e historico imutavel de versoes.

### Geracao por descricao

O formulario deve aceitar nome, descricao fisica, idade aparente, especie, roupa, acessorios, personalidade, paleta, estilo e invariantes visuais. O workflow de imagem do ComfyUI para Windows deve produzir:

- vista frontal, perfil e costas;
- corpo inteiro e retrato;
- expressoes principais;
- poses basicas;
- olhos abertos e fechados;
- formas de boca para lip sync;
- assets com fundo transparente quando aplicavel.

### Upload de referencias

O usuario pode enviar uma imagem principal e referencias adicionais de angulos, expressoes, poses e bocas. Se apenas uma imagem for fornecida, o sistema pode gerar os complementos preservando a referencia, sempre exigindo aprovacao.

Depois de aprovar a identidade, o usuario escolhe o tipo e descreve uma vista, pose, expressao,
estado dos olhos ou forma de boca. O worker envia a imagem principal ao ComfyUI nativo e executa
img2img com denoise limitado, prompt de invariantes, seed e LoRA registrados. Cada resultado possui
estado proprio (`QUEUED`, `WAITING_GPU`, `GENERATING`, `READY_FOR_REVIEW`, `FAILED`), preview,
aprovacao e retry; apenas complementos aprovados entram no render 2D.

Personagens aprovados com escopo de organizacao aparecem na biblioteca dos demais projetos. O
vinculo reutiliza a mesma versao imutavel, permite definir outro papel narrativo e nao duplica nem
regenera os arquivos.

### Regras de consistencia

- Storyboard, assets, animacao 2D e tomadas Wan usam a mesma versao aprovada.
- Versoes aprovadas ficam bloqueadas para a producao em andamento.
- Alterar a versao de um personagem marca somente as tomadas dependentes para revisao.
- Assets registram prompt, seed, workflow, modelo e referencias usados.

## Pipeline completo

1. `SETUP`: validar musica, letra, conceito, faixa etaria e formato.
2. `ANALYZING_AUDIO`: extrair duracao, BPM, batidas, compassos, energia e secoes.
3. `PLANNING_NARRATIVE`: alinhar letra, gerar roteiro e definir eventos visuais.
4. `DESIGNING_CHARACTERS`: gerar/importar e aprovar personagens e biblia visual.
5. `STORYBOARDING`: produzir tomadas, enquadramentos e animatics.
6. `GENERATING_ASSETS`: produzir cenarios, objetos, poses e camadas reutilizaveis.
7. `ANIMATING`: aplicar templates 2D, camera, parallax, movimentos e lip sync.
8. `GENERATING_HERO_SHOTS`: gerar no Wan somente tomadas especiais aprovadas para esse tratamento.
9. `COMPOSITING`: montar timeline deterministica com musica e todas as camadas.
10. `ENCODING`: gerar o arquivo final com FFmpeg.
11. `VALIDATING`: verificar duracao, FPS, dimensoes, audio, integridade e sincronismo.
12. `COMPLETED`: disponibilizar preview, original final e versoes derivadas.

Cada etapa persiste estado, progresso, logs, tentativas e erro de forma retomavel.

## Arquitetura tecnica

### Componentes mantidos

- Vue para a aplicacao e para o estudio de producao.
- NestJS para API e orquestracao.
- PostgreSQL/Prisma para estado duravel e versionamento.
- Redis/BullMQ para filas retomaveis.
- ComfyUI nativo do Windows para geracao de imagens e tomadas Wan.
- FFmpeg/FFprobe para audio, encode e validacao.

### Componentes novos

- Renderizador programatico 2D em pacote isolado baseado em Remotion/React.
- Workflow ComfyUI de ilustracao com referencia de identidade e controle de pose.
- Analisador musical com grade de batidas e alinhamento da letra.
- Motor de templates de movimento e camera.
- Motor de lip sync baseado em formas de boca.
- Fila `children-clip-production` com jobs filhos por etapa e por tomada.
- Coordenador global de GPU para serializar ComfyUI, Wan e RIFE na unica GPU local.

### Modelo local de ilustracao

O workflow de personagens usa o checkpoint SDXL configurado no ComfyUI junto ao LoRA
[`Muapi/picture-books-children-cartoon`](https://huggingface.co/Muapi/picture-books-children-cartoon),
licenciado sob OpenRAIL++. A instalacao local e reproduzivel por
`tools/install-children-clip-models.ps1`, que valida o SHA-256 antes de concluir.

Descricoes em portugues sao convertidas em prompts SDXL estruturados pelo Ollama local. O modelo
e descarregado da memoria ao finalizar a resposta para liberar a GPU antes do ComfyUI.

### Analise musical

O upload da faixa infantil inicia automaticamente `children-clip.audio.analyze` na fila dedicada.
FFprobe valida codec, canais, sample rate e o limite real de 240 segundos. FFmpeg decodifica uma
copia mono somente em memoria; o worker extrai BPM, confianca, grade de batidas, energia, loudness,
pico e waveform. As secoes indicadas na letra sao refinadas pelas mudancas de energia e encaixadas
na grade ritmica. Linhas e palavras recebem cues temporais persistentes para roteiro e lip sync.
Falhas ficam registradas na analise e no `ProcessingJob`, e podem ser retomadas no estudio.

### Planejamento e timeline

Depois da analise e da aprovacao de todo o elenco, `children-clip.plan.generate` cria uma biblia
visual versionada, narrativa por secao e tomadas contiguas encaixadas nas batidas. A timeline cobre
exatamente a duracao da faixa e cada tomada fixa versoes de personagens, letra, enquadramento,
camera, acao, cenario, camadas, movimento e modo `animation_2d`, `wan` ou `hybrid`.

Biblia, narrativa e tomadas podem ser editadas antes da aprovacao. Alterar uma identidade aprovada
marca somente as tomadas que dependiam da versao anterior e reabre a revisao do plano. A geracao
aceita respostas incompletas ou malformadas do Ollama e completa o contrato com regras
deterministicas, evitando que uma variacao de JSON interrompa o pipeline.
O modo de raciocinio do Qwen/Ollama fica desativado para estas respostas estruturadas; isso reduz a
latencia sem remover validacao, fallback ou os heartbeats exibidos durante a espera.

### Producao de assets por tomada

Com o plano aprovado, o estudio libera a etapa 4. Cada tomada recebe dois artefatos centrais: um
cenario limpo, sem personagens, e uma previa completa de storyboard com todos os personagens
permitidos. Primeiro plano, objetos e poses isoladas continuam opcionais. Novas geracoes e uploads
sempre criam uma versao, sem substituir arquivos anteriores.

O job `children-clip.asset.generate` usa o ComfyUI nativo do Windows, registra prompt positivo e
negativo, checkpoint, LoRA, seed, sampler, scheduler, dimensoes e `promptId`. Fundos sao solicitados
sem personagens e preparados como placas para composicao. A previa usa o fundo da propria tomada
como base img2img e aplica cada referencia canonica aprovada por IPAdapter SDXL, com uma mascara
regional derivada de `characterPlacement`; referencias de elenco multiplo sao encadeadas e nenhuma
delas e descartada. O worker publica os estados
`QUEUED`, `STARTING`, `LOADING_MODEL`, `GENERATING`, `SAVING_ASSET`, `READY_FOR_REVIEW`, `RETRYING`
e `FAILED` no BullMQ e no `ProcessingJob`.

O usuario ve preview autenticado, progresso e erro por versao, pode reenfileirar falhas, enviar uma
imagem propria e aprovar uma versao por funcao e tomada. A animacao somente fica liberada quando
todas as tomadas possuem um cenario limpo e uma previa completa aprovados. O reset integral da
Etapa 4 arquiva as versoes anteriores e enfileira cenario + previa para todas as tomadas, em ordem e
com concorrencia de GPU igual a um.

### Animacao 2D e lip sync

Tomadas `animation_2d` e a base 2D de tomadas `hybrid` sao renderizadas pelo pacote isolado
`@video/children-clip-renderer`, com React e Remotion. O job `children-clip.shot.render2d` monta um
manifesto imutavel com a previa completa aprovada, primeiro plano, versoes de personagem, grade de
batidas, cues de palavras, formas de boca, movimento de camera, FPS, dimensoes e frame count.

O motor aplica pan/zoom, profundidade de primeiro plano, movimento ocioso e pulsos nas batidas. A
letra vira legenda sincronizada; os tempos de cada palavra sao convertidos deterministicamente em
formas `A`, `E`, `O`, `U` e `closed`. Quando o personagem possui `mouth_shape` rotulada, a forma e
sobreposta na pose. Sem sprites de boca, a tomada continua renderizavel e preserva os cues no
manifesto para posterior complementacao.

Uploads de boca exigem um rotulo reconhecido (`A`, `E`, `O`, `U`, `closed` ou `rest`). A prancha
canonica `primary_reference` nunca e usada como sprite bruto. Se uma tomada legada nao tiver previa
completa, o fallback exige uma pose isolada ou vista frontal aprovada para cada personagem e falha
com mensagem explicita quando isso nao existir.

Cada tentativa gera um MP4 H.264 separado e passa por FFprobe para validar dimensoes, FPS, frames e
duracao. Falhas mantem erro e historico, o retry cria outra tentativa, e a interface exibe progresso,
preview autenticado e o manifesto reproduzivel. O Chromium necessario e preparado automaticamente
na primeira execucao e reutilizado nas seguintes.

### Tomadas Wan, composicao e saida

Tomadas `wan` exigem uma versao Wan aprovada; tomadas `hybrid` sempre preservam a base 2D e usam
Wan somente quando o usuario gerar e aprovar uma tomada especial. O job `children-clip.shot.wan`
usa como entrada um fundo ou storyboard aprovado, fixa seed e configuracao Wan, registra o
`promptId` e os heartbeats do ComfyUI nativo e valida o MP4 antes de libera-lo para revisao.

Quando todas as tomadas possuem uma fonte valida, `children-clip.final.render` seleciona Wan
aprovado ou 2D conforme a regra da tomada. Cada clip e reencodado para o FPS, dimensoes, duracao e
pixel format finais; somente depois os clips normalizados sao concatenados. Essa normalizacao evita
o erro de concat causado por streams incompativeis e impede que audio silencioso de uma tomada
substitua a musica.

A composicao mapeia explicitamente o video concatenado e a faixa original do projeto, codifica o
audio em AAC, aplica `faststart` e valida com FFprobe: audio presente, H.264, dimensoes, FPS, frames
e duracao alinhada a analise musical. Cada versao final possui manifesto, progresso, erro/retry,
preview autenticado e download proprio; resultados anteriores nao sao sobrescritos.

RIFE fica disponivel apenas para tomadas generativas que realmente precisem de interpolacao. Animacao 2D sera renderizada diretamente no FPS final.

## Modelo de dados

O dominio deve contemplar:

- configuracao `ChildrenClip` vinculada 1:1 ao projeto;
- `Character` reutilizavel por organizacao;
- `CharacterVersion` imutavel e aprovavel;
- `CharacterAsset` para vistas, poses, expressoes e bocas;
- `ProjectCharacter` para fixar a versao usada no clipe;
- biblia visual versionada;
- grade musical, marcadores da letra e cues;
- tomadas, camadas, movimentos, dependencias e revisoes;
- tentativas de geracao/render por unidade;
- manifestos de render para reproducibilidade.

## Filas e recursos

- O pipeline infantil nao pode usar `project-processing` como atalho para o pipeline musical atual.
- Operacoes de GPU passam por exclusao mutua global. Um lease distribuido no Redis serializa
  Ollama, Whisper/CUDA, geracoes de imagem do ComfyUI, tomadas Wan, storyboards e RIFE mesmo
  quando existem varios processos. O lease
  possui TTL renovado enquanto a operacao esta ativa e liberacao atomica por token, portanto uma
  queda de processo nao bloqueia a GPU indefinidamente.
- Enquanto houver contencao, o job permanece ativo e publica `WAITING_GPU` no BullMQ, no
  `ProcessingJob` e na tentativa especifica. Os logs identificam solicitante e ocupante com
  `WAITING_GPU`, `GPU_ACQUIRED` e `GPU_RELEASED`.
- `GPU_LEASE_TTL_MS` e `GPU_LEASE_POLL_MS` controlam respectivamente o prazo renovavel e o
  intervalo de nova tentativa; os defaults sao 180 segundos e 1 segundo.
- Renderizacao 2D/CPU pode ocorrer em paralelo quando nao competir pela GPU.
- Cada job deve ser idempotente e retomavel a partir do ultimo artefato validado.
- O cancelamento nao remove assets aprovados nem o video original.

## Interface e tratamento de falhas

- O estudio mostra checklist e estado de todas as etapas.
- Erros aparecem na etapa e no item que falhou, com mensagem acionavel.
- Retry e oferecido por personagem, asset, tomada e etapa.
- O usuario pode aprovar, rejeitar, versionar e comparar resultados.
- Preview de baixa resolucao precede o render final.
- O modo so pode iniciar producao quando musica, letra/confirmacao de transcricao, personagens e estilo satisfizerem as validacoes.

## Criterios de conclusao

O modulo sera considerado completo quando um usuario puder, sem operacao manual no filesystem:

1. criar um projeto infantil;
2. enviar uma musica de ate quatro minutos e sua letra;
3. gerar ou enviar todos os personagens;
4. aprovar identidade e biblia visual;
5. gerar e editar storyboard/timeline;
6. produzir assets, lip sync, animacao e tomadas especiais;
7. acompanhar progresso e recuperar falhas pela interface;
8. renderizar e validar o clipe completo;
9. baixar o resultado e reutilizar personagens aprovados em outro projeto.

## Validacao executada

- Suites unitarias, integradas, typecheck e build do monorepo.
- Migracoes PostgreSQL aplicadas e verificadas.
- Geracao SDXL/LoRA real no ComfyUI nativo, incluindo img2img com referencia.
- Render real de tomada 2D H.264 via Remotion e validacao FFprobe.
- Composicao real de tomadas normalizadas com faixa AAC, duracao e dimensoes validadas.
- API integrada cobrindo criacao, upload, biblioteca de personagens, assets, aprovacoes, rejeicoes,
  filas, retry e downloads autenticados.

#### Shot Plan e prompts da Etapa 4

- A Etapa 4 separa três níveis: Bíblia/Narrativa globais, Shot Plan estruturado por tomada e prompt final por papel de asset.
- Cada tomada persiste propósito, localização reutilizável, foco, horário, emoção, intenção de movimento, continuidade e listas de entidades permitidas/proibidas.
- O background é sempre um plate ambiental vazio. Personagens, animais, criaturas, mascotes, veículos e demais entidades cadastradas são compostos depois e não entram no prompt nem nas referências do fundo.
- Prompts de storyboard, foreground e prop recebem somente identidades e referências aprovadas das entidades permitidas. Na prévia completa, cada referência é aplicada por IPAdapter em sua região planejada. Entidades proibidas entram no negative prompt.
- O fallback usa seção, letra sincronizada, story beat, enquadramento e localização; summary/logline global nunca vira descrição de tomada.
- `Replanejar tomadas` mantém IDs e arquivos existentes. Um background aprovado cujo Shot Plan mudou volta para revisão com motivo explícito, sem apagar o asset.
- Antes de aprovar ou gerar, o sistema rejeita conflitos allowed/forbidden, entidades desconhecidas ou duplicadas, plano legado sem semântica, descrição igual à narrativa global e background que mencione entidade cadastrada.

#### Project Style Lock e coerência de cenários

- Assets aprovados de personagens são as fontes canônicas. A ordem de precedência persistida é: assets aprovados, Bíblia Visual, texto da tomada e defaults do modelo.
- Ao aprovar o plano, o sistema cria um `ChildrenClipStyleProfile` versionado. Ele registra IDs e fingerprint das fontes, mede paleta dominante, saturação, contraste e densidade de bordas diretamente dos pixels e combina essas evidências com a Bíblia Visual.
- O nível de detalhe dos personagens define o máximo permitido no cenário. O prompt inclui explicitamente medium, contorno, shading, textura, direção cromática, métricas medidas e restrições negativas derivadas do projeto.
- Imagens de personagens são registradas como `styleReferenceAssetIds`, mas nunca são enviadas ao latent `img2img` de background. A integração atual do ComfyUI não separa style de content com segurança; por isso o Style Profile é a camada intermediária obrigatória.
- Alterar uma fonte aprovada marca o lock como `stale`; nenhuma regeneração o substitui silenciosamente. A Etapa 4 mostra o motivo e oferece atualização explícita, criando uma nova versão.
- Cada tomada persiste `characterPlacement`, `backgroundSafeZones` e `groundingRules`. O cenário reserva espaço desobstruído, chão, horizonte, perspectiva, escala e direção de movimento para a composição posterior.
- A primeira imagem de background gerada torna-se o master provisório da `ChildrenClipLocation`; a aprovação a consolida. Novas vistas da mesma Location a usam como referência de conteúdo com denoise controlado, preservando arquitetura, layout, cores, iluminação e perspectiva.
- A Etapa 4 é organizada por Location, não por uma lista plana de fundos. Cada grupo mostra o `Shot Background Anchor`, a vista master, o total de vistas aprovadas e as tomadas derivadas.
- A geração manual continua guiada por Location e aprovação. Já o reset integral cria, para cada tomada e em ordem, o background seguido da prévia completa; o master provisório produzido pela âncora permite que as vistas seguintes mantenham coerência sem limitar o reset à primeira cena.
- Geração widescreen usa resolução 16:9 nativa (`1344x768`); não depende de recorte de uma imagem quadrada.

#### Providers de video por tomada

- Tomadas generativas preservam o provider local `ComfyUI/Wan` e podem usar `SnapGen / Veo 3.1 Fast` por tentativa. A escolha nao e global e o retry sempre cria uma nova tentativa.
- O preset SnapGen confirmado usa 720p por default, 8 segundos fixos, proporcao 16:9 ou 9:16 e referencias `frame` ou `ingredient` (maximo de tres). Projetos quadrados e tomadas acima de 8 segundos falham antes do consumo de creditos.
- A preview completa aprovada da propria tomada e a First Image recomendada. Ingredient Images aceitam apenas assets aprovados do projeto e versoes de personagem travadas no projeto.
- A API local apenas enfileira. O worker submete, acompanha o UUID, baixa imediatamente MP4 e ultimo frame, valida o video com FFprobe e persiste tudo no storage interno; URLs assinadas externas nao sao mantidas como artefato final.
- `ChildrenClipHeroShotAttempt` guarda provider e lifecycle pesquisavel. Prompt, modelo, referencias, resolucao, status externo e creditos ficam nos manifests JSON versionados.
- SnapGen possui concorrencia propria (`SNAPGEN_VIDEO_CONCURRENCY`, default 1) e nao adquire o lease da GPU local. A fila infantil pode processar uma operacao remota em paralelo com uma operacao local quando `CHILDREN_CLIP_QUEUE_CONCURRENCY` for maior que 1.
- A composicao final continua recortando/normalizando cada resultado para a duracao musical original da tomada; um resultado Veo de 8 segundos nao altera a timeline.
