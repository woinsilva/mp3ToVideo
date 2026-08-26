# Assistente de IA do ClipForge

## Implementacao atual

- O chat fica disponível no canto direito de todas as telas autenticadas por meio do `AppLayout`.
- A conversa permanece no navegador, separada por usuário, com no máximo 20 mensagens enviadas ao backend.
- A interface envia somente o histórico da conversa e o contexto mínimo da tela: rota, título e ID do projeto.
- O backend exige JWT, valida tamanho e formato das mensagens e usa o modelo configurado em `OLLAMA_MODEL`.
- O Qwen responde em português e pode ajudar com prompts, roteiro, cenas, personagens, continuidade visual, JSON e perguntas gerais.
- O chat é consultivo: ele não altera campos, assets ou dados do projeto automaticamente.

## Concorrencia de GPU

O endpoint usa a mesma `GpuLeaseService` distribuída em Redis que protege ComfyUI, Wan, Whisper e
RIFE. A operação recebe o identificador `ollama-chat`. Portanto, apenas uma carga de IA com GPU é
executada por vez; quando outra operação possui a lease, o chat aguarda e a interface informa esse
estado ao usuário. `OLLAMA_KEEP_ALIVE=0s` descarrega o Qwen após a resposta para liberar VRAM.

## Evolucao para APIs externas

A resposta do endpoint já expõe `provider` e `model`, preparando a interface para múltiplos
provedores. A próxima evolução deve introduzir um contrato de provider no backend com:

- seleção entre Qwen local e APIs externas por conversa ou tarefa;
- armazenamento seguro de credenciais por organização, sempre criptografadas;
- políticas de timeout, retry, rate limit, custo e limite de tokens;
- indicação clara de qual conteúdo do projeto será enviado para fora da máquina;
- consentimento explícito antes de anexar Bíblia Visual, prompts ou assets;
- fallback opcional para o Qwen local, sem troca silenciosa de provedor;
- telemetria de latência, uso, custo estimado e erros sem registrar segredos.

O endpoint atual permanece local e não envia dados a serviços externos.
