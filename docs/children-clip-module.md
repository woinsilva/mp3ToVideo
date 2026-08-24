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
- Operacoes de GPU passam por exclusao mutua global.
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

