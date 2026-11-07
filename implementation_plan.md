# Limite de espera do catálogo de locais

RequestFeedback: true

## Autorização e diagnóstico
Gustavo Champam autorizou escolher uma melhoria, implementar e fazer commit neste
repositório. O catálogo usa fetch sem timeout; o sinal do TanStack Query cancela
buscas obsoletas, mas não limita uma conexão que permanece pendente.

## Escopo
Adicionar utilitário de timeout com AbortController para todo o ciclo da resposta
(incluindo leitura do corpo), preservar cancelamento externo e aplicar às quatro
operações do catálogo. Manter mensagens HTTP e contratos Zod existentes.
Sem alterações de layout, banco, autenticação ou renderização AR.

## Validação
Testes de regressão com timers controlados: sucesso, erro, timeout na resposta,
cancelamento externo e limpeza de recursos. Executar lint, typecheck e testes
disponíveis; registrar limitações reais do ambiente antes da entrega.

## Evidências da implementação
- Timeout de 8 segundos por tentativa em listagem, detalhes, cadastro e edição.
- Cancelamento do TanStack Query preservado; timers e listeners removidos ao terminar.
- 38 testes unitários aprovados, incluindo 6 regressões novas.
- Smoke com servidor HTTP local: headers recebidos e corpo travado; leitura abortada
  corretamente com prazo de 250 ms configurado apenas para o teste.
- TypeScript de shared e client aprovado; lint da API (type-aware) e client aprovado.
- Suíte completa: 39 testes aprovados; 36 não executados em três suítes de integração
  porque Testcontainers não encontrou um runtime Docker funcional.
- Sem validação em aparelho Android; nenhum componente visual ou nativo alterado.

O prazo é por tentativa: consultas podem seguir a política de retry do TanStack Query.
Cancelar uma escrita no cliente não desfaz uma operação já recebida pelo servidor;
esta alteração não adiciona retries automáticos às mutations.
